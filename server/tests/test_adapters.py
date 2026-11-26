"""Fixture-only landlord flows. Nothing here opens a socket."""

import json
import os

os.environ["WORKER_KEK"] = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["LANDLORD_MODE"] = "dry-run"
os.environ["DATA_BACKEND"] = "postgres"

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from blixtbo import crypto, landlords, public_listings
from blixtbo.adapters import bostadsformedlingen, homeq, qasa, sssb
from blixtbo.config import settings
from blixtbo.crypto import decrypt_secret, generate_dek, generate_seal_keypair, open_sealed, seal_credentials, unwrap_dek
from blixtbo.guard import SiteGuard
from blixtbo.jobs import build_apply_payload, run_job
from blixtbo.models import Base, Job, LandlordLogin, Notice, User

settings.worker_kek = os.environ["WORKER_KEK"]
settings.landlord_mode = "dry-run"
settings.worker_seal_public = ""
settings.worker_seal_private = ""

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
Session = sessionmaker(engine, expire_on_commit=False)

HOME_ERRORS = [
    "UnexpectedError",
    "GroupReachedApplyLimit",
    "GroupLocked",
    "IllegalAds",
    "IncompleteProfile",
    "MissingOccupation",
    "ProjectNotActive",
    "AlreadyApplied",
    "RestrictedForStudents",
    "RestrictedForSeniors",
    "RestrictedForYouths",
    "InactiveAd",
    "CoApplicantNotLandlordQueueMember",
    "PendingFellowConnection",
]


def _client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def _user(db) -> User:
    import uuid

    user = User(email=f"{uuid.uuid4().hex[:8]}@example.test", auth_method="email", name="Anna")
    db.add(user)
    db.commit()
    return user


def _active_login(db, user, source_id, secret) -> LandlordLogin:
    from blixtbo.jobs import _login_for, _store_secret, ensure_user_key

    ensure_user_key(user)
    login = _login_for(db, user, source_id)
    login.status = "active"
    _store_secret(user, login, secret)
    db.commit()
    return login


def test_compose_reads_landlord_mode_from_the_environment():
    text = open(os.path.join(os.path.dirname(__file__), "..", "docker-compose.yml"), encoding="utf-8").read()
    assert "LANDLORD_MODE: ${LANDLORD_MODE:-dry-run}" in text
    assert "LANDLORD_MODE: dry-run" not in text
    assert 'WORKER_KEK: ""' in text
    assert 'WORKER_SEAL_PRIVATE: ""' in text


def test_api_cannot_open_a_sealed_password():
    public, private = generate_seal_keypair()
    settings.worker_seal_public = public
    settings.worker_seal_private = ""
    sealed = seal_credentials({"username": "a@b.se", "password": "not-stored-plain"})
    assert "not-stored-plain" not in sealed
    with pytest.raises(RuntimeError):
        open_sealed(sealed)
    settings.worker_seal_private = private
    opened = open_sealed(sealed)
    assert opened["password"] == "not-stored-plain"
    settings.worker_kek = ""
    with pytest.raises(RuntimeError):
        unwrap_dek(b"123456789012", b"cipher")
    settings.worker_kek = os.environ["WORKER_KEK"]
    settings.worker_seal_private = ""
    dek = generate_dek()
    nonce, wrapped = crypto.wrap_dek(dek)
    settings.worker_kek = os.environ["WORKER_KEK"]
    opened_dek = unwrap_dek(nonce, wrapped)
    secret_nonce, token = crypto.encrypt_secret(opened_dek, {"username": "a@b.se", "password": "again"})
    assert decrypt_secret(opened_dek, secret_nonce, token)["password"] == "again"


def test_apply_payload_keeps_the_listing_id():
    payload = build_apply_payload(
        "homeq-55",
        {"source_id": "homeq", "object_ad_id": "55", "password": "nope", "confirmed": True, "confirmation": "ja"},
    )
    assert payload["listing_id"] == "homeq-55"
    assert payload["source_id"] == "homeq"
    assert payload["object_ad_id"] == "55"
    assert "password" not in payload
    db = Session()
    user = _user(db)
    _active_login(db, user, "homeq", {"username": "a@b.se", "password": "secret-value"})
    job = Job(user_id=user.id, source_id="homeq", kind="apply", payload=json.dumps(payload))
    db.add(job)
    db.commit()
    settings.landlord_mode = "dry-run"
    run_job(db, job)
    db.commit()
    stored = json.loads(job.payload)
    assert stored["listing_id"] == "homeq-55"
    assert stored["object_ad_id"] == "55"
    assert "secret-value" not in job.payload
    assert job.status == "done"


def _homeq_handler(mode: str):
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/login"):
            if mode == "bad-password":
                return httpx.Response(401, json={"error": "WrongPassword"})
            if mode == "captcha":
                return httpx.Response(429, text="<html>just a moment</html>")
            return httpx.Response(200, json={"token": "fixture-jwt"})
        if path.endswith("/token/verify/"):
            if mode == "needs-email":
                info = {"has_verified_email": False, "has_kyc_verified": False}
            elif mode == "needs-kyc":
                info = {"has_verified_email": True, "has_kyc_verified": False}
            else:
                info = {"has_verified_email": True, "has_kyc_verified": True}
            return httpx.Response(200, json={"data": {"user_info": info}})
        if path.endswith("/profile") and request.method == "POST":
            return httpx.Response(201, json={"ok": True})
        if path.endswith("/applications") and request.method == "POST":
            body = json.loads(request.content.decode())
            if mode == "applied-ok":
                assert body["entity"]["id"] == 55
                assert body["entity"]["type"] == "listing"
                return httpx.Response(201, json={"ok": True})
            if mode == "restricted":
                return httpx.Response(412, json={"error": "RestrictedAds", "extra": {"restricted": [["x", "student"]]}})
            if mode.startswith("error:"):
                return httpx.Response(400, json={"error": mode.split(":", 1)[1]})
        if path.endswith("/applications"):
            return httpx.Response(200, json={"results": []})
        return httpx.Response(404, json={"error": "missing"})

    return handler


def test_homeq_login_ok_and_wrong_password_and_captcha():
    ok = homeq.login(_client(_homeq_handler("ok")), {"username": "a@b.se", "password": "pw"})
    assert ok.ok and ok.error == "logged_in"
    bad = homeq.login(_client(_homeq_handler("bad-password")), {"username": "a@b.se", "password": "nope"})
    assert bad.error == "password_changed" and bad.pause
    blocked = homeq.login(_client(_homeq_handler("captcha")), {"username": "a@b.se", "password": "pw"})
    assert blocked.error == "captcha" and blocked.pause


def test_homeq_signup_pauses_for_email_and_bankid_at_homeq():
    created = homeq.create(_client(_homeq_handler("needs-email")), "a@b.se", "pw")
    assert created.pause and created.error == "needs_email"
    assert "Bekräfta e-posten från HomeQ" in created.body
    assert "Verifiera dig med BankID hos HomeQ" in created.body
    identity = homeq.login(_client(_homeq_handler("needs-kyc")), {"username": "a@b.se", "password": "pw"})
    assert identity.error == "needs_identity"
    assert "Verifiera dig med BankID hos HomeQ" in identity.body


def test_homeq_apply_ok_and_every_error_code():
    sent = homeq.apply(_client(_homeq_handler("applied-ok")), {"username": "a@b.se", "password": "pw"}, {"object_ad_id": "55"})
    assert sent.ok and sent.error == "applied"
    restricted = homeq.apply(_client(_homeq_handler("restricted")), {"username": "a@b.se", "password": "pw"}, {"object_ad_id": "55"})
    assert restricted.error == "not_eligible"
    assert "studenter" in restricted.body
    for code in HOME_ERRORS:
        result = homeq.apply(
            _client(_homeq_handler(f"error:{code}")),
            {"username": "a@b.se", "password": "pw"},
            {"object_ad_id": "55"},
        )
        assert result.error in {"not_eligible", "already_applied", "needs_profile"}, code
        if code in {"IncompleteProfile", "MissingOccupation"}:
            assert result.error == "needs_profile"
            assert "Fyll i profilen hos HomeQ" in result.body
        if code == "AlreadyApplied":
            assert result.error == "already_applied"


def test_homeq_session_expired_on_verify():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/login"):
            return httpx.Response(200, json={"token": "fixture-jwt"})
        return httpx.Response(401, json={"error": "expired"})

    result = homeq.renew(_client(handler), {"username": "a@b.se", "password": "pw", "token": "old"}, {})
    assert result.error in {"session_expired", "password_changed"}


def _bf_ads(logged_in: bool, applied: bool = False, can: bool = True):
    return [
        {
            "LagenhetId": 99,
            "AnnonsId": 5,
            "Gatuadress": "Exempelgatan 1",
            "Stadsdel": "Södermalm",
            "Kommun": "Stockholm",
            "Vaning": 2,
            "AntalRum": 2,
            "Yta": 48,
            "Hyra": 9000,
            "Url": "/bostad/99/",
            "ArInloggad": logged_in,
            "HarAnmaltIntresse": applied,
            "KanAnmalaIntresse": can,
            "Ko": "Bostadskön",
        }
    ]


INTEREST_HTML = """
<html><body>
<form id="intresse" action="/bostad/99/intresse" method="post">
  <input type="hidden" name="listing" value="99" />
  <button type="submit">Anmäl intresse</button>
</form>
</body></html>
"""


def test_bf_cookie_apply_and_expired_cookie_needs_bankid():
    def ok(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/AllaAnnonser/"):
            assert request.headers["cookie"] == "session=fixture"
            return httpx.Response(200, json=_bf_ads(True))
        if request.url.path == "/bostad/99/":
            return httpx.Response(200, text=INTEREST_HTML)
        if request.url.path.endswith("/intresse"):
            return httpx.Response(200, text="Tack, intresseanmälan är registrerad")
        return httpx.Response(404, text="missing")

    confirmed = {"confirmed": True, "confirmation": "Intresset blir bindande för den sökande med längst kötid", "lagenhet_id": "99"}
    result = bostadsformedlingen.session(_client(ok), "session=fixture", "apply", confirmed)
    assert result.ok and result.error == "applied"

    def expired(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_bf_ads(False))

    stale = bostadsformedlingen.session(_client(expired), "session=fixture", "apply", confirmed)
    assert stale.error == "needs_bankid" and stale.needs_bankid_on_phone

    blocked = bostadsformedlingen.session(_client(ok), "session=fixture", "apply", {"lagenhet_id": "99"})
    assert blocked.error == "needs_confirmation" and blocked.pause


def test_bf_binding_gate_in_dry_run_job():
    db = Session()
    user = _user(db)
    _active_login(db, user, "bostadsformedlingen", {"cookie": "session=fixture"})
    job = Job(
        user_id=user.id,
        source_id="bostadsformedlingen",
        kind="apply",
        payload=json.dumps({"listing_id": "bf-99", "source_id": "bostadsformedlingen", "lagenhet_id": "99"}),
    )
    db.add(job)
    settings.landlord_mode = "dry-run"
    run_job(db, job)
    db.commit()
    assert job.status == "waiting_user"
    assert job.last_error == "needs_confirmation"
    notice = db.query(Notice).filter_by(user_id=user.id).one()
    assert "bindande" in notice.body


def _form_login(source_html: str, post_status: int, post_body: str, post_headers: dict | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, text=source_html)
        return httpx.Response(post_status, text=post_body, headers=post_headers or {})

    return handler


WAHLIN_FORM = """
<form id="LoginForm" action="/Account/Login" method="post">
  <input name="UserId" value="" />
  <input type="password" name="Password" value="" />
  <input type="hidden" name="RememberMe" value="false" />
  <button>Logga in</button>
</form>
"""


def test_wahlin_login_ok_wrong_password_and_captcha():
    from blixtbo.adapters import incit

    ok = incit.login(
        _client(_form_login(WAHLIN_FORM, 302, "", {"location": "/mina-sidor"})),
        "wahlin",
        {"username": "user", "password": "pw"},
    )
    assert ok.ok
    bad = incit.login(
        _client(_form_login(WAHLIN_FORM, 200, "<form id='LoginForm'><p>Fel lösenord</p><input name='Password'></form>")),
        "wahlin",
        {"username": "user", "password": "nope"},
    )
    assert bad.error == "password_changed"
    challenge = "<html><div class='g-recaptcha'></div>verifiera att du är en människa</html>"
    blocked = incit.login(_client(_form_login(challenge, 200, "ok")), "wahlin", {"username": "u", "password": "p"})
    assert blocked.error == "captcha"


def test_sssb_login_apply_and_not_eligible():
    page = """
    <form id="loginform" action="https://minasidor.sssb.se/wp-login.php" method="post">
      <input name="log" />
      <input type="password" name="pwd" />
      <input type="hidden" name="redirect_to" value="https://minasidor.sssb.se" />
    </form>
    """

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST" and request.url.path.endswith("wp-login.php"):
            return httpx.Response(302, headers={"location": "https://minasidor.sssb.se/"})
        if "refid=abc" in str(request.url):
            return httpx.Response(
                200,
                text='<form action="/intresse" method="post"><input name="refid" value="abc"><button>Intresseanmäla</button></form>',
            )
        if request.url.path.endswith("/intresse"):
            return httpx.Response(200, text="Intresseanmälan sparad")
        return httpx.Response(200, text=page)

    result = sssb.apply(_client(handler), {"username": "member", "password": "pw"}, {"refid": "abc"})
    assert result.ok and result.error == "applied"

    def denied(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("wp-login.php"):
            return httpx.Response(200, text="<form><p>Felaktigt lösenord</p><input name='pwd'></form>")
        return httpx.Response(200, text=page)

    wrong = sssb.login(_client(denied), {"username": "member", "password": "nope"})
    assert wrong.error == "password_changed"

    def ineligible(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("wp-login.php"):
            return httpx.Response(302, headers={"location": "https://minasidor.sssb.se/"})
        if request.url.path.endswith("/login/"):
            return httpx.Response(200, text=page)
        return httpx.Response(200, text="Du är inte behörig. Endast studenter kan anmäla intresse.")

    blocked = sssb.apply(_client(ineligible), {"username": "member", "password": "pw"}, {"refid": "abc"})
    assert blocked.error == "not_eligible"


def test_stena_email_login_and_uppsala_password():
    from blixtbo.adapters import stena, uppsala

    def stena_handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode() or "{}")
        if request.url.path.endswith("/interest"):
            return httpx.Response(201, json={"ok": True})
        assert body["user_type"] == "Tenant"
        assert "personnummer" not in body
        if body.get("password") == "nope":
            return httpx.Response(401, json={"error": "bad password"})
        return httpx.Response(200, json={"token": "fixture-token"})

    signed = stena.login(_client(stena_handler), {"username": "a@b.se", "password": "pw"})
    assert signed.ok
    bad = stena.login(_client(stena_handler), {"username": "a@b.se", "password": "nope"})
    assert bad.error == "password_changed"
    sent = stena.apply(_client(stena_handler), {"username": "a@b.se", "password": "pw"}, {"object_id": "12"})
    assert sent.error == "applied"

    def uppsala_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/login"):
            body = json.loads(request.content.decode())
            if body["password"] == "nope":
                return httpx.Response(401, json={"success": False})
            return httpx.Response(200, json={"success": True, "token": "fixture", "applicant": {"applicantId": "1"}})
        if request.url.path.endswith("/me"):
            return httpx.Response(200, json={"applicant": {"applicantId": "1"}})
        body = json.loads(request.content.decode())
        assert "createApplication" in body["query"]
        assert body["variables"]["application"]["rentalObjectId"] == 77
        return httpx.Response(200, json={"data": {"createApplication": {"error": False}}})

    applied = uppsala.apply(_client(uppsala_handler), {"username": "user", "password": "pw"}, {"object_id": "77"})
    assert applied.error == "applied"
    wrong = uppsala.login(_client(uppsala_handler), {"username": "user", "password": "nope"})
    assert wrong.error == "password_changed"


def test_qasa_never_sends_a_message():
    calls = {"any": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["any"] += 1
        if request.url.path.endswith("/messages"):
            return httpx.Response(201, json={"ok": True})
        return httpx.Response(200, text="ok")

    client = _client(handler)
    blocked = qasa.apply(
        client,
        {"username": "a@b.se", "password": "pw"},
        {"qasa_id": "1", "confirmed": True, "confirmation": "Skicka meddelandet med min profil", "message": "Hej"},
        robots_text="User-agent: *\nAllow: /\n",
    )
    assert blocked.pause and blocked.error == "needs_confirmation"
    assert calls["any"] == 0
    assert "skickar inte" in blocked.body
    assert "Klistra in och tryck Skicka" in blocked.body

    def challenge(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, text="just a moment")

    challenged = qasa.login(_client(challenge), {"username": "a@b.se", "password": "pw"})
    assert challenged.error == "captcha"


def test_public_listings_are_filtered_from_fixtures():
    public_listings.reset_cache()

    def handler(request: httpx.Request) -> httpx.Response:
        host = request.url.host
        if host == "api.homeq.se":
            return httpx.Response(200, json={"results": [{"id": 7, "street": "Testgatan 2", "city": "Stockholm", "area": "Södermalm", "rent": 11000, "square_meters": 42, "room_count": 2, "floor": 3, "landlord_company": "Wallenstam"}]})
        if "stockholm.se" in host:
            return httpx.Response(200, json=_bf_ads(False))
        if "qasa.com" in host:
            return httpx.Response(429, text="just a moment")
        return httpx.Response(200, text='callback({"lagenheter":[{"refid":"r1","adress":"Studentvägen 1","hyra":4000,"yta":22,"rum":1,"omrade":"Stockholm"}]});')

    rows = public_listings.collect(_client(handler), {"areas": ["Södermalm"], "max_rent": 10000, "rooms": "2"})
    ids = {row["id"] for row in rows}
    assert "bf-99" in ids
    assert "homeq-7" not in ids
    again = public_listings.collect(_client(handler), {"areas": ["Stockholm"], "max_rent": 20000, "rooms": "any"})
    assert any(row["id"] == "bf-99" for row in again)


def test_store_credentials_round_trip_wipes_the_queue(monkeypatch):
    public, private = generate_seal_keypair()
    settings.worker_seal_public = public
    settings.worker_seal_private = private
    settings.landlord_mode = "live"
    sealed = seal_credentials({"username": "a@b.se", "password": "right-password"})

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/login"):
            body = json.loads(request.content.decode())
            if body.get("password") != "right-password":
                return httpx.Response(401, json={"error": "WrongPassword"})
            return httpx.Response(200, json={"token": "fixture-jwt"})
        if request.url.path.endswith("/token/verify/"):
            return httpx.Response(200, json={"data": {"user_info": {"has_verified_email": True, "has_kyc_verified": True}}})
        return httpx.Response(404, text="no")

    landlords.set_client_factory(lambda source: _client(handler))
    db = Session()
    user = _user(db)
    job = Job(user_id=user.id, source_id="homeq", kind="store_credentials", payload=json.dumps({"sealed": sealed}))
    db.add(job)
    try:
        run_job(db, job)
        db.commit()
        assert job.payload == "{}"
        assert "right-password" not in (job.payload or "")
        assert job.status == "done"
        login = db.query(LandlordLogin).filter_by(user_id=user.id, source_id="homeq").one()
        assert login.status == "active"
        dek = unwrap_dek(user.dek_nonce, user.dek_wrapped)
        stored = decrypt_secret(dek, login.secret_nonce, login.secret_ciphertext)
        assert stored["password"] == "right-password"
        settings.worker_seal_private = ""
        with pytest.raises(RuntimeError):
            open_sealed(sealed)
    finally:
        landlords.reset_client_factory()
        settings.landlord_mode = "dry-run"
        settings.worker_seal_private = ""


def test_live_apply_posts_the_listing_id():
    settings.landlord_mode = "live"
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/login"):
            return httpx.Response(200, json={"token": "fixture-jwt"})
        if request.url.path.endswith("/token/verify/"):
            return httpx.Response(200, json={"data": {"user_info": {"has_verified_email": True, "has_kyc_verified": True}}})
        if request.url.path.endswith("/applications") and request.method == "POST":
            seen["body"] = json.loads(request.content.decode())
            return httpx.Response(201, json={"ok": True})
        return httpx.Response(404, text="no")

    landlords.set_client_factory(lambda source: _client(handler))
    db = Session()
    user = _user(db)
    _active_login(db, user, "homeq", {"username": "a@b.se", "password": "pw"})
    payload = build_apply_payload("homeq-55", {"source_id": "homeq", "object_ad_id": "55"})
    job = Job(user_id=user.id, source_id="homeq", kind="apply", payload=json.dumps(payload))
    db.add(job)
    try:
        run_job(db, job)
        db.commit()
        assert job.status == "done"
        assert seen["body"]["entity"]["id"] == 55
        assert json.loads(job.payload)["listing_id"] == "homeq-55"
    finally:
        landlords.reset_client_factory()
        settings.landlord_mode = "dry-run"


def test_guard_spaces_calls_and_blocks_robots():
    slept = []
    now = {"t": 0.0}

    def clock():
        return now["t"]

    def sleeper(seconds):
        slept.append(seconds)
        now["t"] += seconds

    guard = SiteGuard({"qasa.com": qasa.ROBOTS}, gap_seconds=2, sleeper=sleeper, clock=clock)
    guard.check("https://qasa.com/se/sv/login")
    guard.check("https://qasa.com/se/sv/find-home")
    assert slept and slept[0] == 2
    with pytest.raises(Exception):
        guard.check("https://qasa.com/se/sv/messages")


def test_sealed_cookie_is_wiped_before_the_job_is_done():
    public, private = generate_seal_keypair()
    settings.worker_seal_public = public
    settings.worker_seal_private = private
    from blixtbo.crypto import seal_cookie

    sealed = seal_cookie("ll-session=sealed")
    assert "ll-session" not in sealed
    db = Session()
    user = _user(db)
    job = Job(user_id=user.id, source_id="bostadsformedlingen", kind="store_session", payload=json.dumps({"sealed": sealed}))
    db.add(job)
    run_job(db, job)
    db.commit()
    assert job.payload == "{}"
    assert job.status == "done"
    login = db.query(LandlordLogin).filter_by(user_id=user.id, source_id="bostadsformedlingen").one()
    stored = decrypt_secret(unwrap_dek(user.dek_nonce, user.dek_wrapped), login.secret_nonce, login.secret_ciphertext)
    assert stored == {"cookie": "ll-session=sealed"}
    settings.worker_seal_private = ""


def test_skipped_sites_have_a_reason():
    for key in ("blocket", "samtrygg", "akelius", "wallenstam", "svenska-bostader", "familjebostader", "stockholmshem"):
        assert landlords.SKIPPED[key]
    assert landlords.landlord("hembla").name == "Victoriahem"
    assert landlords.accepts_password("sssb")
    assert landlords.accepts_password("heimstaden")
    assert landlords.accepts_password("rikshem")
    assert landlords.landlord("qasa").message_apply is True
    assert landlords.landlord("bostadsformedlingen").binding_apply is True
