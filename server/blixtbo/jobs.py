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
    if user is None or not user.dek_wrapped:
        job.status = "failed"
        job.last_error = "missing user key"
        return
    try:
        if job.kind == "create_account":
            _create(db, user, job)
        elif job.kind in ("apply", "renew"):
            _use_login(db, user, job)
        else:
            job.status = "failed"
            job.last_error = "unknown kind"
            return
        if job.status == "queued":
            job.status = "done"
    except Exception as exc:  # a landlord page change should not kill the loop
        job.status = "failed"
        job.last_error = str(exc)[:500]


def _create(db, user: User, job: Job) -> None:
    password = secrets.token_urlsafe(18)
    result = landlords.create_account(job.source_id, user.email, password)
    login = db.query(LandlordLogin).filter_by(user_id=user.id, source_id=job.source_id).one_or_none()
    if login is None:
        login = LandlordLogin(user_id=user.id, source_id=job.source_id, username=user.email)
        db.add(login)
    site = landlords.SITES.get(job.source_id, {})
    login.landlord_requires_bankid = bool(site.get("requires_bankid"))
    login.username = user.email
    _store_secret(user, login, {"username": user.email, "password": password})
    if not result.ok:
        _mark_needs_user(db, login, result.error or "session_expired")
        job.status = "done"
        return
    login.status = "active"
    login.last_error = None
    login.last_login_at = datetime.now(timezone.utc)
    login.approved_at = datetime.now(timezone.utc)
    login.next_renewal_at = datetime.now(timezone.utc) + timedelta(days=30)
    if result.needs_bankid_on_phone:
        _notify(
            db,
            user.id,
            "bankid_on_phone",
            f"{job.source_id} ber om BankID",
            "Det steget godkänner du själv på mobilen. Blixtbo ser inte legitimeringen.",
        )


def _use_login(db, user: User, job: Job) -> None:
    login = db.query(LandlordLogin).filter_by(user_id=user.id, source_id=job.source_id).one_or_none()
    if login is None or login.status != "active" or not login.secret_ciphertext:
        job.status = "failed"
        job.last_error = "no active login"
        return
    secret = _secret_for(user, login)
    result = landlords.run_login(job.source_id, secret)
    if not result.ok:
        _mark_needs_user(db, login, result.error or "session_expired")
        return
    login.last_login_at = datetime.now(timezone.utc)
    login.last_error = None
    if job.kind == "renew":
        login.next_renewal_at = datetime.now(timezone.utc) + timedelta(days=30)
    if result.needs_bankid_on_phone:
        _notify(
            db,
            user.id,
            "bankid_on_phone",
            "BankID på mobilen",
            "Hyresvärden ber om BankID. Öppna det på din telefon. Blixtbo kan inte göra det steget.",
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
            .filter_by(user_id=login.user_id, source_id=login.source_id, kind="renew", status="queued")
            .one_or_none()
        )
        if already:
            continue
        db.add(Job(user_id=login.user_id, source_id=login.source_id, kind="renew"))
    return len(due)
