"""Create landlord accounts, apply, and renew. Secrets stay inside this module."""

import json
import secrets
from datetime import datetime, timedelta, timezone

from blixtbo import crypto, landlords
from blixtbo.models import Approval, Job, LandlordLogin, Notice, User


def _notify(db, user_id: str, kind: str, title: str, body: str) -> None:
    db.add(Notice(user_id=user_id, kind=kind, title=title, body=body))


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


def _mark_needs_user(db, login: LandlordLogin, error: str) -> None:
    login.status = "needs_user"
    login.last_error = error
    if error == "password_changed":
        title = "Lösenordet hos hyresvärden har ändrats"
        body = "Blixtbo kan inte logga in längre. Godkänn en gång till så sparas ett nytt lösenord, krypterat, som bara din nyckel kan öppna."
    else:
        title = "Inloggningen har gått ut"
        body = "Sessionen hos hyresvärden tog slut och den sparade inloggningen fungerade inte. Godkänn en gång till."
    _notify(db, login.user_id, error, title, body)


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
    job = Job(user_id=user.id, source_id=source_id, kind="create_account", payload=json.dumps({"purpose": purpose}))
    db.add(job)
    return job


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
            _use_login(db, user, job)
        elif job.kind == "store_session":
            store_session(db, user, job)
        else:
            job.status = "failed"
            job.last_error = "unknown kind"
            return
        if job.status == "queued":
            job.status = "done"
    except Exception as exc:  # a landlord page change should not kill the loop
        job.status = "failed"
        job.last_error = str(exc)[:500]


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


def _login_for(db, user: User, source_id: str) -> LandlordLogin:
    login = db.query(LandlordLogin).filter_by(user_id=user.id, source_id=source_id).one_or_none()
    if login is None:
        login = LandlordLogin(user_id=user.id, source_id=source_id, username=user.email)
        db.add(login)
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


def _activate(login: LandlordLogin) -> None:
    now = datetime.now(timezone.utc)
    login.status = "active"
    login.last_error = None
    login.last_login_at = now
    login.approved_at = login.approved_at or now
    login.next_renewal_at = now + timedelta(days=30)


def _create(db, user: User, job: Job) -> None:
    login = _login_for(db, user, job.source_id)
    if landlords.requires_bankid(job.source_id):
        _pause_for_bankid(db, user, job, login, renewal=False)
        return
    password = secrets.token_urlsafe(18)
    result = landlords.create_account(job.source_id, user.email, password)
    _store_secret(user, login, {"username": user.email, "password": password})
    if not result.ok:
        _mark_needs_user(db, login, result.error or "session_expired")
        job.status = "done"
        return
    _activate(login)


def _use_login(db, user: User, job: Job) -> None:
    login = db.query(LandlordLogin).filter_by(user_id=user.id, source_id=job.source_id).one_or_none()
    if landlords.requires_bankid(job.source_id):
        if login is None:
            login = _login_for(db, user, job.source_id)
        cookie = None
        if login.secret_ciphertext and login.secret_nonce:
            secret = _secret_for(user, login)
            if set(secret) == {"cookie"} and isinstance(secret.get("cookie"), str):
                cookie = secret["cookie"]
        if job.kind == "renew" or not cookie:
            _pause_for_bankid(db, user, job, login, renewal=job.kind == "renew")
            return
        result = landlords.run_with_session(job.source_id, cookie)
        if not result.ok or result.needs_bankid_on_phone:
            _pause_for_bankid(db, user, job, login, renewal=False)
            return
        _activate(login)
        return
    if login is None or login.status != "active" or not login.secret_ciphertext:
        job.status = "failed"
        job.last_error = "no active login"
        return
    secret = _secret_for(user, login)
    result = landlords.run_login(job.source_id, secret)
    if not result.ok:
        _mark_needs_user(db, login, result.error or "session_expired")
        return
    _activate(login)


def store_session(db, user: User, job: Job) -> None:
    """Encrypt the landlord session cookie and drop the plaintext payload."""
    try:
        payload = json.loads(job.payload or "{}")
        cookie = session_cookie_from_body(payload)
    except (ValueError, json.JSONDecodeError):
        job.status = "failed"
        job.last_error = "refused"
        job.payload = "{}"
        return
    if not landlords.requires_bankid(job.source_id):
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
    waiting = (
        db.query(Job)
        .filter_by(user_id=user.id, source_id=job.source_id, status="waiting_bankid")
        .all()
    )
    for item in waiting:
        item.status = "done"
        item.payload = "{}"
    name = landlords.landlord_name(job.source_id)
    _notify(
        db,
        user.id,
        "bankid_session",
        f"{name} är kopplat",
        (
            f"Sessionen hos {name} är kopplad. En förnyelse kan kräva ett nytt BankID-godkännande. "
            "Du får en notis då. Blixtbo ser inte ditt BankID."
        ),
    )


def queue_due_renewals(db) -> int:
    now = datetime.now(timezone.utc)
    due = (
        db.query(LandlordLogin)
        .filter(LandlordLogin.status == "active", LandlordLogin.next_renewal_at.is_not(None), LandlordLogin.next_renewal_at <= now)
        .all()
    )
    for login in due:
        already = (
            db.query(Job)
            .filter(
                Job.user_id == login.user_id,
                Job.source_id == login.source_id,
                Job.kind == "renew",
                Job.status.in_(("queued", "waiting_bankid")),
            )
            .first()
        )
        if already:
            continue
        db.add(Job(user_id=login.user_id, source_id=login.source_id, kind="renew"))
    return len(due)
