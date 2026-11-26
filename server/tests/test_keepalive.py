"""Keep-alive stays on fixtures. A real landlord host is a failed test."""

import json
import logging
import os
import random
import uuid
from datetime import date, datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from blixtbo import keepalive, landlords
from blixtbo.config import settings
from blixtbo.crypto import generate_seal_keypair, seal_credentials
from blixtbo.db import _ensure_keepalive_columns, init_db
from blixtbo.jobs import queue_due_renewals, run_job
from blixtbo.keepalive import as_utc
from blixtbo.models import AuditLog, Base, Job, LandlordLogin, Notice, User
from blixtbo.readonly import ForbiddenRequest, ReadOnlyClient, allowlist
from blixtbo.scheduler import run_tick

logging.basicConfig(level=logging.INFO)

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
Session = sessionmaker(engine, expire_on_commit=False)
STOCKHOLM_HOURS = range(7, 22)
SENTINEL = "SENTINEL-SECRET-xyz"


def _user(db, *, uid=None, email=None, deleted=False) -> User:
    user = User(
        email=email or f"{uuid.uuid4().hex[:8]}@example.test",
        auth_method="email",
        name="Anna",
        firebase_uid=uid or uuid.uuid4().hex,
    )
    if deleted:
        user.deleted_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()
    return user


def _login(db, user, source_id, secret=None, **fields) -> LandlordLogin:
    from blixtbo.jobs import _login_for, _store_secret, ensure_user_key

    ensure_user_key(user)
    login = _login_for(db, user, source_id)
    login.status = fields.pop("status", "active")
    for key, value in fields.items():
        setattr(login, key, value)
    if secret is not None:
        _store_secret(user, login, secret)
    db.commit()
    return login


def _past():
    return datetime.now(timezone.utc) - timedelta(hours=1)


def _secret():
    return {"username": "a@b.se", "password": SENTINEL}


def _paid(monkeypatch):
    monkeypatch.setenv("KEEPALIVE_ASSUME_PAID", "1")
    monkeypatch.setattr(settings, "data_backend", "postgres")


def _factory(handler):
    def build(_source):
        return httpx.Client(transport=httpx.MockTransport(handler))

    landlords.set_client_factory(build)


def _ok(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    if path.endswith("robots.txt"):
        return httpx.Response(200, text="User-agent: *\nAllow: /\n")
    if path == "/api/v1/user/profile/login":
        return httpx.Response(200, json={"token": "jwt-token"})
    if path == "/api/v1/user/token/verify/":
        return httpx.Response(200, json={"data": {"user_info": {"has_verified_email": True, "has_kyc_verified": True}}})
    if path == "/Account/Login" and request.method == "GET":
        return httpx.Response(200, text='<form id="LoginForm"><input name="UserId" value=""><input name="Password" value=""></form>')
    if path == "/Account/Login":
        return httpx.Response(302, headers={"location": "/"})
    if path in {"/", ""}:
        return httpx.Response(200, text="Mina sidor")
    if path.startswith("/mina-sidor/logga-in") and request.method == "GET":
        user = "ctl00$ctl01$DefaultSiteContentPlaceHolder1$Col1$LoginControl1$txtUserID"
        password = "ctl00$ctl01$DefaultSiteContentPlaceHolder1$Col1$LoginControl1$txtPassword"
        return httpx.Response(200, text=f'<input name="{user}"><input name="{password}">')
    if path.startswith("/mina-sidor/logga-in"):
        return httpx.Response(302, headers={"location": "/mina-sidor/"})
    if path == "/mina-sidor/":
        return httpx.Response(200, text="Välkommen")
    if path == "/mypages/api/account/login":
        return httpx.Response(200, json={"success": True, "token": "uppsala-token"})
    if path == "/mypages/api/account/me":
        return httpx.Response(200, json={"id": 1})
    if path == "/login/":
        return httpx.Response(200, text='<form><input name="log"><input name="pwd"></form>')
    if path == "/wp-login.php":
        return httpx.Response(302, headers={"location": "/lediga-bostader/"})
    if path == "/lediga-bostader/":
        return httpx.Response(200, text="Lediga bostäder")
    if path.endswith("/credentials/"):
        return httpx.Response(200, json={"token": "stena"})
    return httpx.Response(404, text="missing")


def test_unmocked_request_is_blocked():
    with pytest.raises(RuntimeError, match="blocked"):
        httpx.Client().get("https://example.com/")


def test_playwright_is_blocked():
    from playwright.sync_api import sync_playwright

    with pytest.raises(RuntimeError, match="blocked"):
        sync_playwright()


def test_free_canceled_paused_and_errors_never_queue(monkeypatch, caplog):
    docs = {
        "free": {"plan": "free", "status": "free"},
        "canceled": {"plan": "premium", "status": "canceled"},
        "paused": {"plan": "premium", "status": "paused"},
        "missing": None,
        "premium": {"plan": "premium", "status": "active"},
        "trial": {"plan": "premium", "status": "active", "trial": True},
    }

    def read(uid):
        if uid == "boom":
            raise RuntimeError(f"firestore down {uid}")
        return docs.get(uid)

    monkeypatch.setattr(keepalive, "read_entitlement", read)
    db = Session()
    for uid in ("free", "canceled", "paused", "missing", "premium", "trial"):
        user = _user(db, uid=uid)
        _login(db, user, "homeq", _secret(), next_keepalive_at=_past(), last_login_at=_past())
    deleted = _user(db, uid="premium-deleted", deleted=True)
    _login(db, deleted, "homeq", _secret(), next_keepalive_at=_past())
    monkeypatch.setattr(settings, "data_backend", "firestore")
    queued = keepalive.queue_due_keepalives(db)
    db.commit()
    assert queued == 2
    sources = {job.user_id for job in db.query(Job).filter_by(kind="keepalive").all()}
    paid_ids = {user.id for user in db.query(User).filter(User.firebase_uid.in_(("premium", "trial"))).all()}
    assert sources == paid_ids
    for uid in ("free", "canceled", "paused", "missing"):
        person = db.query(User).filter_by(firebase_uid=uid).one()
        row = db.query(LandlordLogin).filter_by(user_id=person.id).one()
        assert row.keepalive_state == "paused"
        assert db.query(Job).filter_by(user_id=person.id, kind="keepalive").count() == 0

    monkeypatch.setattr(settings, "data_backend", "postgres")
    broken = _user(db, uid="boom")
    _login(db, broken, "heimstaden", _secret(), next_keepalive_at=_past())
    monkeypatch.setattr(settings, "data_backend", "firestore")
    with caplog.at_level(logging.INFO):
        again = keepalive.queue_due_keepalives(db)
    db.commit()
    assert again == 0
    assert "entitlement_unavailable" in caplog.text
    assert "boom" not in caplog.text
    assert db.query(Notice).filter_by(user_id=broken.id).count() == 0


def test_cancel_pauses_and_tells_the_deadlines_once(monkeypatch):
    state = {"doc": {"plan": "premium", "status": "active"}}
    monkeypatch.setattr(keepalive, "read_entitlement", lambda uid: state["doc"])
    db = Session()
    user = _user(db, uid="payer")
    _login(db, user, "homeq", _secret(), next_keepalive_at=_past(), last_login_at=_past(), keepalive_state="ok")
    _login(db, user, "heimstaden", _secret(), next_keepalive_at=_past(), last_login_at=_past(), keepalive_state="ok")
    monkeypatch.setattr(settings, "data_backend", "firestore")
    state["doc"] = {"plan": "premium", "status": "canceled"}
    keepalive.clear_entitlement_cache()
    keepalive.queue_due_keepalives(db)
    db.commit()
    rows = db.query(LandlordLogin).filter_by(user_id=user.id).all()
    assert {row.keepalive_state for row in rows} == {"paused"}
    notices = db.query(Notice).filter_by(user_id=user.id).all()
    assert len(notices) == 1
    assert "Premium" in notices[0].title
    assert "18 månader" in notices[0].body
    assert "6 månader" in notices[0].body
    assert notices[0].action_href.startswith("http")
    keepalive.queue_due_keepalives(db)
    db.commit()
    assert db.query(Notice).filter_by(user_id=user.id).count() == 1
    state["doc"] = {"plan": "premium", "status": "active", "trial": True}
    keepalive.clear_entitlement_cache()
    keepalive.queue_due_keepalives(db)
    db.commit()
    assert db.query(Job).filter_by(user_id=user.id, kind="keepalive").count() == 2


def test_jitter_stays_in_daytime_stockholm():
    base = datetime(2026, 6, 15, 8, 0, tzinfo=timezone.utc)
    minutes = set()
    for seed in range(80):
        rng = random.Random(seed)
        slot = keepalive.next_keepalive_at(base, "homeq", rng)
        local = slot.astimezone(keepalive.STOCKHOLM)
        assert local.hour in STOCKHOLM_HOURS
        assert slot >= base + timedelta(hours=22) - timedelta(seconds=1)
        minutes.add(local.minute)
        outside = datetime(2026, 1, 10, 22, 30, tzinfo=timezone.utc)
        clamped = keepalive.clamp_window(outside, random.Random(seed))
        morning = clamped.astimezone(keepalive.STOCKHOLM)
        assert morning.hour in STOCKHOLM_HOURS
    assert len(minutes) > 5


def test_first_run_is_at_least_six_hours_and_not_the_same_minute():
    connected = datetime(2026, 3, 2, 9, 0, tzinfo=timezone.utc)
    minutes = set()
    for seed in range(40):
        slot = keepalive.first_keepalive_at(connected, random.Random(seed))
        assert slot >= connected + timedelta(hours=6)
        local = slot.astimezone(keepalive.STOCKHOLM)
        assert local.hour in STOCKHOLM_HOURS
        minutes.add((local.hour, local.minute))
    assert len(minutes) > 5


def test_interval_env_override(monkeypatch):
    assert keepalive.interval_hours("homeq") == 24
    monkeypatch.setenv("KEEPALIVE_INTERVAL_HOURS_HOMEQ", "12")
    assert keepalive.interval_hours("homeq") == 12
    monkeypatch.setenv("KEEPALIVE_INTERVAL_HOURS_HOMEQ", "nope")
    assert keepalive.interval_hours("homeq") == 24


def test_login_read_success_sets_last_kept_alive(monkeypatch):
    _paid(monkeypatch)
    monkeypatch.setattr(settings, "landlord_mode", "live")
    seen: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if not request.url.path.endswith("robots.txt"):
            seen.append((request.method, request.url.path))
        return _ok(request)

    _factory(handler)
    db = Session()
    user = _user(db)
    now = datetime(2026, 5, 4, 10, 0, tzinfo=timezone.utc)
    sources = ("homeq", "wahlin", "heimstaden", "victoriahem", "rikshem", "uppsala", "sssb")
    for source in sources:
        seen.clear()
        login = _login(
            db,
            user,
            source,
            _secret(),
            keepalive_failures=2,
            keepalive_state="retrying",
            last_keepalive_code="unreachable",
            next_keepalive_at=now - timedelta(hours=1),
        )
        if source == "uppsala":
            result = keepalive.perform_read(source, dict(_secret()))
            job = Job(user_id=user.id, source_id=source, kind="keepalive", payload="{}", run_at=now)
            db.add(job)
            keepalive.apply_result(db, user, login, job, result, now=now, rng=random.Random(1))
        else:
            job = Job(user_id=user.id, source_id=source, kind="keepalive", payload="{}", run_at=now)
            db.add(job)
            db.commit()
            keepalive.execute_job(db, user, job, now=now, rng=random.Random(1))
        db.commit()
        db.refresh(login)
        assert login.last_kept_alive_at is not None
        assert login.keepalive_failures == 0
        assert login.keepalive_state == "ok"
        assert set(seen) == set(allowlist(source))
        assert ("POST", "/api/v4/applications") not in seen


def test_readonly_blocks_apply_and_zero_sources_make_no_request(monkeypatch):
    client = ReadOnlyClient(httpx.Client(transport=httpx.MockTransport(_ok)), allowlist("homeq"))
    with pytest.raises(ForbiddenRequest):
        client.request("POST", "https://api.homeq.se/api/v4/applications")
    with pytest.raises(ForbiddenRequest):
        client.request("POST", "https://api.homeq.se/api/v1/user/profile")
    calls = []
    monkeypatch.setattr(settings, "landlord_mode", "live")

    def boom(_source):
        calls.append("called")
        raise AssertionError("network")

    landlords.set_client_factory(boom)
    for source in ("qasa", "akelius", "bostadsformedlingen", "boplats", "boplatssyd", "wallenstam"):
        result = keepalive.perform_read(source, _secret())
        assert result.error == "skipped"
    db = Session()
    user = _user(db)
    _login(db, user, "stena", status="active")
    job = Job(user_id=user.id, source_id="stena", kind="keepalive", payload="{}", run_at=datetime.now(timezone.utc))
    db.add(job)
    keepalive.execute_job(db, user, job)
    assert calls == []


def test_wrong_password_stops_with_one_notice_and_a_password_link(monkeypatch, caplog):
    _paid(monkeypatch)
    monkeypatch.setattr(settings, "landlord_mode", "live")

    def handler(request: httpx.Request) -> httpx.Response:
        assert SENTINEL not in str(request.url)
        if request.url.path.endswith("robots.txt"):
            return httpx.Response(200, text="User-agent: *\n")
        return httpx.Response(401, json={"error": "wrong"})

    _factory(handler)
    db = Session()
    user = _user(db)
    login = _login(db, user, "homeq", _secret(), next_keepalive_at=_past())
    now = datetime(2026, 5, 4, 10, 0, tzinfo=timezone.utc)
    job = Job(user_id=user.id, source_id="homeq", kind="keepalive", payload="{}", run_at=now)
    db.add(job)
    with caplog.at_level(logging.DEBUG):
        keepalive.execute_job(db, user, job, now=now)
    db.commit()
    db.refresh(login)
    assert login.status == "needs_user"
    assert login.keepalive_state == "needs_user"
    assert login.last_keepalive_code == "password_changed"
    notices = db.query(Notice).filter_by(user_id=user.id).all()
    assert len(notices) == 1
    assert notices[0].title == "Inloggningen hos HomeQ fungerar inte längre – uppdatera ditt lösenord"
    assert notices[0].action_href == "/kopplingar?source=homeq&intent=login"
    assert notices[0].action_label == "Uppdatera lösenord"
    assert notices[0].secondary_href == "https://www.homeq.se/login"
    assert SENTINEL not in notices[0].title
    assert SENTINEL not in notices[0].body
    assert SENTINEL not in (job.last_error or "")
    assert SENTINEL not in caplog.text
    again = Job(user_id=user.id, source_id="homeq", kind="keepalive", payload="{}", run_at=now)
    db.add(again)
    keepalive.execute_job(db, user, again, now=now + timedelta(minutes=5))
    db.commit()
    assert again.last_error == "stopped"
    assert db.query(Notice).filter_by(user_id=user.id).count() == 1


def test_captcha_waits_a_day_then_asks_once(monkeypatch):
    _paid(monkeypatch)
    monkeypatch.setattr(settings, "landlord_mode", "live")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("robots.txt"):
            return httpx.Response(200, text="User-agent: *\n")
        return httpx.Response(403, text="Just a moment")

    _factory(handler)
    db = Session()
    user = _user(db)
    login = _login(db, user, "homeq", _secret())
    now = datetime(2026, 5, 4, 10, 0, tzinfo=timezone.utc)
    first = Job(user_id=user.id, source_id="homeq", kind="keepalive", payload="{}", run_at=now)
    db.add(first)
    keepalive.execute_job(db, user, first, now=now)
    db.commit()
    db.refresh(login)
    assert login.keepalive_state == "retrying"
    assert as_utc(login.next_keepalive_at) >= now + timedelta(hours=24) - timedelta(seconds=1)
    assert db.query(Notice).filter_by(user_id=user.id).count() == 0
    login.status = "active"
    second = Job(user_id=user.id, source_id="homeq", kind="keepalive", payload="{}", run_at=now)
    db.add(second)
    keepalive.execute_job(db, user, second, now=now + timedelta(hours=24))
    db.commit()
    db.refresh(login)
    assert login.status == "needs_user"
    notice = db.query(Notice).filter_by(user_id=user.id).one()
    assert notice.title == "HomeQ vill att du tar över"
    assert notice.action_href.startswith("https://")


def test_backoff_then_one_unreachable_notice_and_recovery(monkeypatch):
    _paid(monkeypatch)
    monkeypatch.setattr(settings, "landlord_mode", "live")
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("robots.txt"):
            return httpx.Response(200, text="User-agent: *\n")
        calls["n"] += 1
        if calls["n"] < 5:
            return httpx.Response(503, text="down")
        return _ok(request)

    _factory(handler)
    db = Session()
    user = _user(db)
    login = _login(db, user, "homeq", _secret())
    start = datetime(2026, 5, 4, 10, 0, tzinfo=timezone.utc)
    now = start
    for hours in (1, 4, 16):
        login.status = "active"
        job = Job(user_id=user.id, source_id="homeq", kind="keepalive", payload="{}", run_at=now)
        db.add(job)
        keepalive.execute_job(db, user, job, now=now)
        db.commit()
        db.refresh(login)
        assert login.keepalive_state == "retrying"
        assert abs((as_utc(login.next_keepalive_at) - now) - timedelta(hours=hours)) < timedelta(seconds=2)
        now = as_utc(login.next_keepalive_at)
    assert db.query(Notice).filter(Notice.user_id == user.id, Notice.kind.like("%unreachable")).count() == 0
    login.status = "active"
    blocked = Job(user_id=user.id, source_id="homeq", kind="keepalive", payload="{}", run_at=now)
    db.add(blocked)
    keepalive.execute_job(db, user, blocked, now=now)
    db.commit()
    assert blocked.last_error == "capped"
    now = start + timedelta(hours=26)
    login.status = "active"
    job = Job(user_id=user.id, source_id="homeq", kind="keepalive", payload="{}", run_at=now)
    db.add(job)
    keepalive.execute_job(db, user, job, now=now)
    db.commit()
    db.refresh(login)
    assert login.keepalive_state == "needs_user"
    assert login.last_keepalive_code == "unreachable"
    assert login.status == "active"
    assert abs((as_utc(login.next_keepalive_at) - now) - timedelta(hours=24)) < timedelta(seconds=2)
    notices = db.query(Notice).filter(Notice.user_id == user.id, Notice.kind.like("%unreachable")).all()
    assert len(notices) == 1
    assert notices[0].title == "Vi når inte HomeQ just nu"
    login.status = "active"
    job = Job(user_id=user.id, source_id="homeq", kind="keepalive", payload="{}", run_at=now)
    db.add(job)
    keepalive.execute_job(db, user, job, now=now)
    db.commit()
    db.refresh(login)
    assert login.keepalive_state == "ok"
    assert login.keepalive_failures == 0
    recovered = db.query(Notice).filter(Notice.user_id == user.id, Notice.kind.like("%recovered")).one()
    assert recovered.title == "Det fungerar igen"


def test_three_attempts_is_the_cap(monkeypatch):
    _paid(monkeypatch)
    monkeypatch.setattr(settings, "landlord_mode", "live")
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("robots.txt"):
            return httpx.Response(200, text="User-agent: *\n")
        if request.url.path == "/api/v1/user/profile/login":
            calls["n"] += 1
        return _ok(request)

    _factory(handler)
    db = Session()
    user = _user(db)
    login = _login(db, user, "homeq", _secret())
    now = datetime(2026, 5, 4, 10, 0, tzinfo=timezone.utc)
    for _ in range(3):
        login.status = "active"
        job = Job(user_id=user.id, source_id="homeq", kind="keepalive", payload="{}", run_at=now)
        db.add(job)
        keepalive.execute_job(db, user, job, now=now)
        now = now + timedelta(minutes=10)
    db.commit()
    assert calls["n"] == 3
    login.status = "active"
    login.next_keepalive_at = now - timedelta(minutes=1)
    fourth = Job(user_id=user.id, source_id="homeq", kind="keepalive", payload="{}", run_at=now)
    db.add(fourth)
    keepalive.execute_job(db, user, fourth, now=now)
    db.commit()
    assert calls["n"] == 3
    assert fourth.last_error == "capped"
    assert keepalive.queue_due_keepalives(db, now=now) == 0


def test_notice_dedupe_and_daily_digest():
    db = Session()
    user = _user(db)
    now = datetime(2026, 5, 4, 10, 0, tzinfo=timezone.utc)
    keepalive.notify_once(db, user.id, "homeq", "session_expired", "Första", "Logga in igen.", now=now)
    keepalive.notify_once(db, user.id, "homeq", "session_expired", "Första", "Logga in igen.", now=now + timedelta(days=1))
    db.commit()
    assert db.query(Notice).filter_by(user_id=user.id).count() == 1
    keepalive.notify_once(db, user.id, "heimstaden", "needs_bankid", "Andra", "BankID.", now=now + timedelta(hours=1))
    db.commit()
    rows = db.query(Notice).filter_by(user_id=user.id).all()
    assert len(rows) == 1
    assert rows[0].title == "2 hyresvärdar behöver dig"


def test_mail_disabled_and_one_digest_per_day(monkeypatch, caplog):
    from blixtbo import mailer

    mailer.reset_disabled_log()
    for name in ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"):
        monkeypatch.delenv(name, raising=False)
    db = Session()
    db.query(Notice).delete()
    db.query(AuditLog).delete()
    db.commit()
    user = _user(db, email="anna@example.test")
    now = datetime(2026, 5, 4, 10, 0, tzinfo=timezone.utc)
    keepalive.notify_once(db, user.id, "homeq", "password_changed", "Lösenord", "Uppdatera.", now=now)
    with caplog.at_level(logging.INFO):
        assert keepalive.flush_mail(db, now) == 0
        assert keepalive.flush_mail(db, now) == 0
    assert caplog.text.count("mail_disabled") == 1
    sent = []

    class FakeSMTP:
        def __init__(self, host, port, timeout=20):
            sent.append(("open", host, port))

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def login(self, user_name, password):
            sent.append(("login", user_name))

        def send_message(self, message):
            sent.append(("message", message["To"], message.get_content()))

    monkeypatch.setenv("SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("SMTP_PORT", "465")
    monkeypatch.setenv("SMTP_USER", "mailer")
    monkeypatch.setenv("SMTP_PASSWORD", "mail-secret")
    monkeypatch.setenv("SMTP_FROM", "support@blixtbo.se")
    monkeypatch.setattr(mailer.smtplib, "SMTP_SSL", FakeSMTP)
    assert keepalive.flush_mail(db, now) == 1
    assert keepalive.flush_mail(db, now) == 0
    bodies = [item[2] for item in sent if item[0] == "message"]
    assert len(bodies) == 1
    assert "mail-secret" not in bodies[0]
    assert SENTINEL not in bodies[0]
    assert "Uppdatera lösenord" in bodies[0] or "https://www.homeq.se/login" in bodies[0]


def test_fee_reminders_never_call_the_network(monkeypatch):
    _paid(monkeypatch)
    monkeypatch.setattr(settings, "landlord_mode", "live")

    def boom(_source):
        raise AssertionError("fee source made a request")

    landlords.set_client_factory(boom)
    db = Session()
    user = _user(db)
    login = _login(db, user, "bostadsformedlingen", status="active")
    now = datetime(2026, 11, 1, 9, 0, tzinfo=timezone.utc)
    keepalive.queue_due_keepalives(db, now=now)
    db.commit()
    assert db.query(Notice).filter(Notice.user_id == user.id, Notice.kind.like("%:fee_prompt")).count() == 1
    keepalive.queue_due_keepalives(db, now=now + timedelta(days=1))
    db.commit()
    assert db.query(Notice).filter_by(user_id=user.id).count() == 1
    first = db.query(Notice).filter_by(user_id=user.id).one()
    first.created_at = now - timedelta(days=31)
    db.commit()
    keepalive.queue_due_keepalives(db, now=now + timedelta(days=31))
    db.commit()
    assert db.query(Notice).filter(Notice.user_id == user.id, Notice.kind.like("%fee_prompt_again")).count() == 1
    db.query(Notice).filter_by(user_id=user.id).delete()
    db.commit()
    login.fee_due_at = date(2026, 12, 30)
    db.commit()
    keepalive.queue_due_keepalives(db, now=datetime(2026, 11, 30, 8, 0, tzinfo=timezone.utc))
    keepalive.queue_due_keepalives(db, now=datetime(2026, 12, 16, 8, 0, tzinfo=timezone.utc))
    keepalive.queue_due_keepalives(db, now=datetime(2026, 12, 27, 8, 0, tzinfo=timezone.utc))
    keepalive.queue_due_keepalives(db, now=datetime(2026, 12, 30, 8, 0, tzinfo=timezone.utc))
    db.commit()
    titles = [row.action_label for row in db.query(Notice).filter(Notice.user_id == user.id, Notice.kind.like("%fee_%")).all()]
    assert "Betala innan 30 december" in titles
    overdue_now = datetime(2026, 12, 31, 8, 0, tzinfo=timezone.utc)
    keepalive.queue_due_keepalives(db, now=overdue_now)
    db.commit()
    overdue = db.query(Notice).filter(Notice.user_id == user.id, Notice.kind.like("%fee_overdue")).one()
    assert "5 månader" in overdue.body
    assert overdue.action_href.startswith("https://")


def test_dry_run_does_not_open_a_client(monkeypatch):
    _paid(monkeypatch)
    monkeypatch.setattr(settings, "landlord_mode", "dry-run")
    called = []
    landlords.set_client_factory(lambda source: called.append(source))
    db = Session()
    user = _user(db)
    stamp = datetime(2026, 1, 2, tzinfo=timezone.utc)
    login = _login(db, user, "homeq", _secret(), last_kept_alive_at=stamp, next_keepalive_at=_past())
    job = Job(user_id=user.id, source_id="homeq", kind="keepalive", payload="{}", run_at=datetime.now(timezone.utc))
    db.add(job)
    keepalive.execute_job(db, user, job)
    db.commit()
    db.refresh(login)
    assert called == []
    assert login.keepalive_state == "dry_run"
    assert as_utc(login.last_kept_alive_at) == stamp


def test_bankid_material_is_not_sent(monkeypatch):
    _paid(monkeypatch)
    monkeypatch.setattr(settings, "landlord_mode", "live")
    called = []
    landlords.set_client_factory(lambda source: called.append(source))
    monkeypatch.setattr(keepalive, "_open_secret", lambda user, login: {"username": "a", "password": "b", "bankid": "nope"})
    db = Session()
    user = _user(db)
    _login(db, user, "homeq", _secret())
    job = Job(user_id=user.id, source_id="homeq", kind="keepalive", payload="{}", run_at=datetime.now(timezone.utc))
    db.add(job)
    keepalive.execute_job(db, user, job)
    db.commit()
    assert called == []
    assert job.last_error == "refused"


def test_scheduler_respects_run_at_and_host_gap(monkeypatch):
    _paid(monkeypatch)
    monkeypatch.setattr(settings, "landlord_mode", "live")
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/user/profile/login":
            calls["n"] += 1
        return _ok(request)

    _factory(handler)
    db = Session()
    now = datetime(2026, 5, 4, 10, 0, tzinfo=timezone.utc)
    future = Job(user_id=_user(db).id, source_id="sssb", kind="keepalive", payload="{}", run_at=now + timedelta(hours=3))
    db.add(future)
    first_user = _user(db)
    second_user = _user(db)
    _login(db, first_user, "homeq", _secret(), next_keepalive_at=now + timedelta(days=2))
    _login(db, second_user, "homeq", _secret(), next_keepalive_at=now + timedelta(days=2))
    earlier = Job(user_id=first_user.id, source_id="homeq", kind="keepalive", payload="{}", run_at=now - timedelta(minutes=2))
    later = Job(user_id=second_user.id, source_id="homeq", kind="keepalive", payload="{}", run_at=now - timedelta(minutes=1))
    db.add(earlier)
    db.add(later)
    db.commit()
    run_tick(db, now)
    db.refresh(future)
    db.refresh(later)
    assert future.status == "queued"
    assert later.status == "queued"
    assert as_utc(later.run_at) > now
    assert calls["n"] == 1


def test_skip_locked_is_in_the_postgres_statement():
    sql = keepalive.due_lock_sql()
    assert "SKIP LOCKED" in sql.upper()


def test_migration_is_idempotent(tmp_path):
    url = f"sqlite:///{tmp_path}/keep.db"
    local = create_engine(url)
    Base.metadata.create_all(local)
    with local.begin() as conn:
        conn.execute(text("ALTER TABLE landlord_logins DROP COLUMN last_kept_alive_at"))
    _ensure_keepalive_columns(local)
    _ensure_keepalive_columns(local)
    columns = {column["name"] for column in inspect(local).get_columns("landlord_logins")}
    assert "last_kept_alive_at" in columns
    assert "fee_due_at" in columns
    assert "action_href" in {column["name"] for column in inspect(local).get_columns("notices")}
    init_db()
    init_db()


def test_postgres_migration_when_present():
    try:
        pg = create_engine(
            "postgresql+psycopg://blixtbo:blixtbo@127.0.0.1:5432/blixtbo",
            connect_args={"connect_timeout": 1},
        )
        with pg.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        pytest.skip("postgres not available")
    Base.metadata.create_all(pg)
    _ensure_keepalive_columns(pg)
    _ensure_keepalive_columns(pg)


def test_old_renew_does_not_cover_keepalive_sources():
    db = Session()
    user = _user(db)
    login = _login(db, user, "homeq", _secret(), next_renewal_at=_past())
    assert queue_due_renewals(db) == 0
    db.commit()
    assert db.query(Job).filter_by(kind="renew").count() == 0
    login.source_id = "qasa"
    db.commit()
    assert queue_due_renewals(db) == 0


def test_saving_a_password_verifies_once_and_resumes(monkeypatch):
    monkeypatch.setattr(settings, "landlord_mode", "live")
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/user/profile/login":
            calls["n"] += 1
        return _ok(request)

    _factory(handler)
    public, private = generate_seal_keypair()
    settings.worker_seal_public = public
    settings.worker_seal_private = private
    db = Session()
    user = _user(db)
    login = _login(
        db,
        user,
        "homeq",
        _secret(),
        status="needs_user",
        keepalive_state="needs_user",
        keepalive_failures=3,
        last_keepalive_code="password_changed",
    )
    sealed = seal_credentials({"username": "a@b.se", "password": "right-password"})
    job = Job(user_id=user.id, source_id="homeq", kind="store_credentials", payload=json.dumps({"sealed": sealed}))
    db.add(job)
    before = datetime.now(timezone.utc)
    run_job(db, job)
    db.commit()
    db.refresh(login)
    assert calls["n"] == 1
    assert login.status == "active"
    assert login.keepalive_failures == 0
    assert login.last_keepalive_code is None
    assert as_utc(login.next_keepalive_at) >= before + timedelta(hours=6) - timedelta(minutes=1)
    settings.worker_seal_private = ""


def test_fee_date_endpoint_is_owner_only():
    from fastapi.testclient import TestClient

    from blixtbo.main import app, get_db, serializer

    db = Session()
    user = _user(db)
    other = _user(db)
    _login(db, user, "uppsala", status="active")
    _login(db, other, "uppsala", status="active")

    def override():
        yield db

    app.dependency_overrides[get_db] = override
    settings.data_backend = "postgres"
    try:
        client = TestClient(app)
        cookie = {"blixtbo": serializer.dumps({"uid": user.id})}
        saved = client.put("/connections/uppsala/fee-due", json={"date": "2026-12-30"}, cookies=cookie)
        assert saved.status_code == 200
        assert saved.json()["fee_due_at"].startswith("2026-12-30")
        listed = client.get("/connections", cookies=cookie)
        assert listed.status_code == 200
        row = listed.json()[0]
        assert "last_kept_alive_at" in row
        assert row["keepalive_strategy"] == "fee_reminder"
        bad = client.put("/connections/uppsala/fee-due", json={"date": "30-12-2026"}, cookies=cookie)
        assert bad.status_code == 400
        homeq = _login(db, user, "homeq", _secret())
        refused = client.put("/connections/homeq/fee-due", json={"date": "2026-12-30"}, cookies=cookie)
        assert refused.status_code == 400
        assert homeq.fee_due_at is None
        stolen = client.put(
            "/connections/uppsala/fee-due",
            json={"date": "2026-01-01"},
            cookies={"blixtbo": serializer.dumps({"uid": other.id})},
        )
        assert stolen.status_code == 200
        db.refresh(db.query(LandlordLogin).filter_by(user_id=user.id, source_id="uppsala").one())
        owner = db.query(LandlordLogin).filter_by(user_id=user.id, source_id="uppsala").one()
        stranger = db.query(LandlordLogin).filter_by(user_id=other.id, source_id="uppsala").one()
        assert owner.fee_due_at == date(2026, 12, 30)
        assert stranger.fee_due_at == date(2026, 1, 1)
    finally:
        app.dependency_overrides.clear()
        settings.data_backend = "postgres"
