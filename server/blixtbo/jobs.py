"""Create landlord accounts, apply, and renew. Secrets stay inside this module.

User-typed passwords are sealed with the worker's public key before they are
written to the queue. This process opens that seal, encrypts the secret under
the user's DEK, and replaces the job payload with {}. Plaintext is not stored.
"""

import json
import secrets
import uuid
from datetime import datetime, timezone

from blixtbo import crypto, landlords
from blixtbo.models import Approval, Job, LandlordLogin, Notice, User
from blixtbo.outcomes import PAUSE_CODES, notice
from blixtbo.steps import StepResult

APPLY_KEYS = (
    "listing_id",
    "source_id",
    "object_ad_id",
    "lagenhet_id",
    "annons_id",
    "refid",
    "object_id",
    "qasa_id",
    "listing_url",
    "confirmed",
    "confirmation",
    "message",
)


def _notify(db, user_id: str, kind: str, title: str, body: str) -> None:
    row = Notice(id=str(uuid.uuid4()), user_id=user_id, kind=kind[:80], title=title[:160], body=body)
    db.add(row)
    try:
        from blixtbo.push import notify_user

        notify_user(db, user_id, row.id, row.kind, row.title, row.body)
    except Exception as exc:
        print(f"blixtbo push skipped: {exc}", flush=True)


def _secret_for(user: User, login: LandlordLogin) -> dict:
    dek = crypto.unwrap_dek(user.dek_nonce, user.dek_wrapped)
    return crypto.decrypt_secret(dek, login.secret_nonce, login.secret_ciphertext)


def _store_secret(user: User, login: LandlordLogin, payload: dict) -> None:
    dek = crypto.unwrap_dek(user.dek_nonce, user.dek_wrapped)
    nonce, token = crypto.encrypt_secret(dek, payload)
    login.secret_nonce = nonce
    login.secret_ciphertext = token
    from blixtbo.credentials import mirror_credential

    mirror_credential(
        getattr(user, "firebase_uid", None),
        login.source_id,
        nonce,
        token,
        login.username,
        login.landlord_requires_bankid,
        login.status,
    )


def _mark_needs_user(db, login: LandlordLogin, error: str, title: str = "", body: str = "") -> None:
    login.status = "needs_user"
    login.last_error = (error or "session_expired")[:64]
    name = landlords.landlord_name(login.source_id)
    if not title or not body:
        title, body = notice(error, name)
    _notify(db, login.user_id, error or "session_expired", title, body)


def ensure_user_key(user: User) -> None:
    if user.dek_wrapped:
        return
    dek = crypto.generate_dek()
    nonce, wrapped = crypto.wrap_dek(dek)
    user.dek_nonce = nonce
    user.dek_wrapped = wrapped


def accept_approval(db, user: User, source_id: str, method: str, purpose: str) -> Job:
    """Record the one-time in-app approval and queue the account creation."""
    ensure_user_key(user)
    db.add(Approval(user_id=user.id, source_id=source_id, method=method, purpose=purpose, consumed_at=datetime.now(timezone.utc)))
    job = Job(user_id=user.id, source_id=source_id, kind="create_account", payload=json.dumps({"purpose": purpose, "source_id": source_id}))
    db.add(job)
    return job


def build_apply_payload(listing_id: str, body: dict) -> dict:
    """Keep the listing id and the ids each adapter needs. Never a password."""
    payload: dict = {"listing_id": listing_id, "source_id": str(body.get("source_id") or "")}
    for key in APPLY_KEYS:
        if key in ("listing_id", "source_id"):
            continue
        if key not in body or body.get(key) in (None, ""):
            continue
        value = body.get(key)
        if key == "confirmed":
            payload[key] = bool(value)
        elif key == "confirmation":
            payload[key] = str(value)[:500]
        elif key == "message":
            payload[key] = str(value)[:1000]
        else:
            payload[key] = str(value)[:200]
    return payload


def _apply_still_allowed(db, user: User, job_id: str) -> bool:
    """Stop a queued application once the free sends are used up. Premium is unlimited."""
    from blixtbo.billing import allow_application
    from blixtbo.config import settings

    used = db.query(Job).filter(Job.user_id == user.id, Job.kind == "apply", Job.status != "failed", Job.id != job_id).count()
    entitlement = None
    if settings.data_backend == "firestore" and getattr(user, "firebase_uid", None):
        try:
            from blixtbo.keepalive import read_entitlement

            entitlement = read_entitlement(user.firebase_uid)
        except Exception:
            entitlement = None
    return allow_application(used, entitlement)


def run_job(db, job: Job) -> None:
    user = db.get(User, job.user_id)
    if user is None:
        job.status = "failed"
        job.last_error = "missing user"
        return
    try:
        ensure_user_key(user)
        if job.kind == "create_account":
            _create(db, user, job)
        elif job.kind in ("apply", "renew"):
            if job.kind == "apply" and not _apply_still_allowed(db, user, job.id):
                job.status = "failed"
                job.last_error = "premium_required"
                return
            _use_login(db, user, job)
        elif job.kind == "keepalive":
            from blixtbo.keepalive import execute_job

            execute_job(db, user, job)
            return
        elif job.kind == "store_session":
            store_session(db, user, job)
        elif job.kind == "store_credentials":
            store_credentials(db, user, job)
        else:
            job.status = "failed"
            job.last_error = "unknown kind"
            return
        if job.status == "queued":
            job.status = "done"
    except Exception as exc:  # a landlord page change should not kill the loop
        job.status = "failed"
        job.last_error = type(exc).__name__


def session_cookie_from_body(body: object) -> str:
    """Accept only an opaque landlord session cookie. Never BankID fields."""
    if not isinstance(body, dict):
        raise ValueError("session")
    keys = {str(key).lower() for key in body}
    if keys != {"cookie"}:
        raise ValueError("bankid")
    crypto.reject_bankid_material(body)
    cookie = body.get("cookie")
    if not isinstance(cookie, str):
        raise ValueError("session")
    cookie = cookie.strip()
    if not cookie or len(cookie) > 4096 or cookie[:1] in "{[":
        raise ValueError("session")
    return cookie


def credentials_from_body(body: object) -> dict:
    """Username and password only. BankID keys are refused before sealing."""
    if not isinstance(body, dict):
        raise ValueError("credentials")
    crypto.reject_bankid_material(body)
    keys = {str(key).lower() for key in body}
    if keys != {"username", "password"}:
        raise ValueError("credentials")
    username = str(body.get("username") or "").strip()
    password = str(body.get("password") or "")
    if not username or not password or len(username) > 320 or len(password) > 200:
        raise ValueError("credentials")
    return {"username": username, "password": password}


def _login_for(db, user: User, source_id: str) -> LandlordLogin:
    login = db.query(LandlordLogin).filter_by(user_id=user.id, source_id=source_id).one_or_none()
    if login is None:
        login = LandlordLogin(user_id=user.id, source_id=source_id, username=user.email)
        db.add(login)
        db.flush()
    if not login.username:
        login.username = user.email
    login.landlord_requires_bankid = landlords.requires_bankid(source_id)
    return login


def _pause_for_bankid(db, user: User, job: Job, login: LandlordLogin, *, renewal: bool) -> None:
    """Stop the job until the user finishes BankID on their own device."""
    name = landlords.landlord_name(job.source_id)
    login.status = "needs_bankid"
    login.landlord_requires_bankid = True
    login.last_error = "needs_bankid"
    job.status = "waiting_bankid"
    if renewal:
        title = f"Nytt BankID-godkännande hos {name}"
        body = (
            f"En förnyelse hos {name} kräver ett nytt BankID. Du loggar in hos {name} – inte hos Blixtbo. "
            "Vi ser aldrig ditt BankID och sparar det inte. Du får den här notisen när ett nytt godkännande behövs."
        )
    else:
        title = f"BankID behövs hos {name}"
        body = (
            f"Den här hyresvärden kräver BankID. Du loggar in hos {name} – inte hos Blixtbo. "
            "Vi ser aldrig ditt BankID och sparar det inte. BankID ska visa "
            f"{name}. Godkänn bara om det namnet står där, och aldrig en förfrågan du inte själv har startat."
        )
    _notify(db, user.id, "bankid_on_phone", title, body)


def _pause_for_user(db, user: User, job: Job, login: LandlordLogin | None, result: StepResult) -> None:
    code = result.error or "site_changed"
    name = landlords.landlord_name(job.source_id)
    title = result.title or notice(code, name)[0]
    body = result.body or notice(code, name)[1]
    if login is not None:
        if code == "password_changed":
            login.status = "needs_user"
        elif code in ("needs_email", "needs_identity", "needs_profile", "captcha", "site_changed", "needs_confirmation"):
            login.status = "needs_user"
        elif code == "session_expired":
            login.status = "needs_user"
        login.last_error = code[:64]
    job.status = "waiting_user"
    job.last_error = code[:500]
    _notify(db, user.id, code, title, body)


def _finish(db, user: User, job: Job, login: LandlordLogin | None, result: StepResult) -> None:
    if result.needs_bankid_on_phone or result.error == "needs_bankid":
        if login is None:
            login = _login_for(db, user, job.source_id)
        _pause_for_bankid(db, user, job, login, renewal=job.kind == "renew")
        return
    if result.pause or result.error in PAUSE_CODES:
        _pause_for_user(db, user, job, login, result)
        return
    code = result.error
    name = landlords.landlord_name(job.source_id)
    if code == "already_applied":
        job.status = "done"
        job.last_error = code
        _notify(db, user.id, code, result.title or notice(code, name)[0], result.body or notice(code, name)[1])
        return
    if code == "not_eligible":
        job.status = "done"
        job.last_error = code
        _notify(db, user.id, code, result.title or notice(code, name)[0], result.body or notice(code, name)[1])
        return
    if not result.ok:
        job.status = "failed"
        job.last_error = (code or "failed")[:500]
        if result.title:
            _notify(db, user.id, code or "failed", result.title, result.body)
        return
    if login is not None and job.kind != "apply":
        _activate(login)
    elif login is not None and login.status != "active":
        _activate(login)
    job.status = "done"
    job.last_error = code
    if job.kind == "apply":
        title, body = notice("applied", name)
        _notify(db, user.id, "applied", result.title or title, result.body or body)
    elif job.kind == "store_credentials" and result.ok:
        _notify(db, user.id, "logged_in", result.title or f"{name} är kopplat", result.body or f"Inloggningen hos {name} fungerar.")
    elif result.title and result.error not in (None, "logged_in", "created", "queue_ok"):
        _notify(db, user.id, code or "done", result.title, result.body)


def _activate(login: LandlordLogin) -> None:
    now = datetime.now(timezone.utc)
    login.status = "active"
    login.last_error = None
    login.last_login_at = now
    login.approved_at = login.approved_at or now


def _create(db, user: User, job: Job) -> None:
    login = _login_for(db, user, job.source_id)
    site = landlords.landlord(job.source_id)
    if site and site.requires_bankid and not site.accepts_password:
        _pause_for_bankid(db, user, job, login, renewal=False)
        return
    if site and not site.can_create:
        result = landlords.create_account(job.source_id, user.email, "")
        _finish(db, user, job, login, result)
        return
    password = secrets.token_urlsafe(18)
    login.username = user.email
    _store_secret(user, login, {"username": user.email, "password": password})
    if settings_live():
        result = landlords.create_account(job.source_id, user.email, password)
        _finish(db, user, job, login, result)
        return
    result = landlords.create_account(job.source_id, user.email, password)
    if not result.ok:
        _finish(db, user, job, login, result)
        return
    _activate(login)


def settings_live() -> bool:
    from blixtbo.config import settings

    return settings.landlord_mode == "live"


def _payload(job: Job) -> dict:
    try:
        data = json.loads(job.payload or "{}")
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _use_login(db, user: User, job: Job) -> None:
    payload = _payload(job)
    payload.setdefault("listing_id", payload.get("listing_id"))
    payload.setdefault("source_id", job.source_id)
    login = db.query(LandlordLogin).filter_by(user_id=user.id, source_id=job.source_id).one_or_none()
    bankid_only = landlords.requires_bankid(job.source_id)
    if bankid_only or (login and login.secret_ciphertext and _looks_like_cookie(user, login)):
        if login is None:
            login = _login_for(db, user, job.source_id)
        cookie = _cookie(user, login)
        if bankid_only and job.kind == "renew" and not settings_live():
            _pause_for_bankid(db, user, job, login, renewal=True)
            return
        if not cookie:
            _pause_for_bankid(db, user, job, login, renewal=job.kind == "renew")
            return
        result = landlords.run_with_session(job.source_id, cookie, job.kind, payload)
        _finish(db, user, job, login, result)
        return
    if login is None or not login.secret_ciphertext:
        job.status = "failed"
        job.last_error = "no active login"
        return
    secret = _secret_for(user, login)
    result = landlords.perform(job.source_id, secret, job.kind, payload)
    _finish(db, user, job, login, result)


def _looks_like_cookie(user: User, login: LandlordLogin) -> bool:
    if not login.secret_ciphertext or not login.secret_nonce:
        return False
    try:
        secret = _secret_for(user, login)
    except Exception:
        return False
    return set(secret) == {"cookie"} and isinstance(secret.get("cookie"), str)


def _cookie(user: User, login: LandlordLogin) -> str | None:
    if not login.secret_ciphertext or not login.secret_nonce:
        return None
    secret = _secret_for(user, login)
    if set(secret) == {"cookie"} and isinstance(secret.get("cookie"), str):
        return secret["cookie"]
    return None


def store_credentials(db, user: User, job: Job) -> None:
    """Open the sealed password, encrypt it, wipe the payload, then try one login."""
    try:
        payload = json.loads(job.payload or "{}")
        sealed = payload.get("sealed") if isinstance(payload, dict) else None
        if not isinstance(sealed, str) or not sealed:
            raise ValueError("sealed")
        secret = crypto.open_sealed(sealed)
    except Exception:
        job.status = "failed"
        job.last_error = "refused"
        job.payload = "{}"
        return
    job.payload = "{}"
    if not landlords.accepts_password(job.source_id):
        job.status = "failed"
        job.last_error = "refused"
        return
    ensure_user_key(user)
    login = _login_for(db, user, job.source_id)
    login.username = str(secret.get("username") or "")[:320]
    login.landlord_requires_bankid = False
    _store_secret(user, login, {"username": secret["username"], "password": secret["password"]})
    result = landlords.run_login(job.source_id, {"username": secret["username"], "password": secret["password"]})
    secret["password"] = ""
    _finish(db, user, job, login, result)
    if login.status == "active":
        from blixtbo.keepalive import schedule_after_save

        schedule_after_save(login)


def store_session(db, user: User, job: Job) -> None:
    """Encrypt the landlord session cookie and drop the plaintext payload."""
    try:
        payload = json.loads(job.payload or "{}")
        if isinstance(payload, dict) and isinstance(payload.get("sealed"), str):
            payload = crypto.open_sealed(payload["sealed"])
        cookie = session_cookie_from_body(payload)
    except (ValueError, json.JSONDecodeError, RuntimeError):
        job.status = "failed"
        job.last_error = "refused"
        job.payload = "{}"
        return
    if not landlords.accepts_cookie(job.source_id):
        job.status = "failed"
        job.last_error = "refused"
        job.payload = "{}"
        return
    ensure_user_key(user)
    login = _login_for(db, user, job.source_id)
    _store_secret(user, login, {"cookie": cookie})
    job.payload = "{}"
    job.status = "done"
    _activate(login)
    from blixtbo.keepalive import schedule_after_save

    schedule_after_save(login)
    waiting = (
        db.query(Job)
        .filter(Job.user_id == user.id, Job.source_id == job.source_id, Job.status.in_(("waiting_bankid", "waiting_user")))
        .all()
    )
    for item in waiting:
        item.status = "done"
        item.payload = "{}"
    name = landlords.landlord_name(job.source_id)
    if landlords.requires_bankid(job.source_id):
        body = (
            f"Sessionen hos {name} är kopplad. En förnyelse kan kräva ett nytt BankID-godkännande. "
            "Du får en notis då. Blixtbo ser inte ditt BankID."
        )
    else:
        body = f"Sessionen hos {name} är kopplad. Blixtbo sparar bara den kakan, inget BankID."
    _notify(db, user.id, "bankid_session", f"{name} är kopplat", body)


def queue_due_renewals(db) -> int:
    now = datetime.now(timezone.utc)
    due = (
        db.query(LandlordLogin)
        .filter(LandlordLogin.status == "active", LandlordLogin.next_renewal_at.is_not(None), LandlordLogin.next_renewal_at <= now)
        .all()
    )
    queued = 0
    for login in due:
        from blixtbo.keepalive import renewal_disabled

        if renewal_disabled(login.source_id, login):
            continue
        already = (
            db.query(Job)
            .filter(
                Job.user_id == login.user_id,
                Job.source_id == login.source_id,
                Job.kind == "renew",
                Job.status.in_(("queued", "waiting_bankid", "waiting_user")),
            )
            .first()
        )
        if already:
            continue
        db.add(Job(user_id=login.user_id, source_id=login.source_id, kind="renew", payload="{}"))
        queued += 1
    return queued
