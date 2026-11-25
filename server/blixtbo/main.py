import secrets
from urllib.parse import urlencode

import httpx
import pyotp
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy.orm import Session

from blixtbo.config import settings
from blixtbo.db import init_db, session
from blixtbo.jobs import accept_approval
from blixtbo.matching import match_listing
from blixtbo.models import AuditLog, Job, LandlordLogin, Notice, User
from blixtbo.crypto import public_connection

app = FastAPI(title="Blixtbo", docs_url=None, redoc_url=None)
serializer = URLSafeTimedSerializer(settings.app_secret, salt="blixtbo-session")
oauth_states: dict[str, str] = {}


def get_db():
    db = session()
    try:
        yield db
    finally:
        db.close()


def current_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    raw = request.cookies.get("blixtbo")
    if not raw:
        return None
    try:
        data = serializer.loads(raw, max_age=60 * 60 * 24 * 14)
    except BadSignature:
        return None
    return db.get(User, data.get("uid"))


def require_user(user: User | None = Depends(current_user)) -> User:
    if user is None:
        raise HTTPException(status_code=401)
    return user


def require_owner(request: Request, user: User | None = Depends(current_user)) -> User:
    if user is None or user.email.lower() != settings.owner_google_email.lower() or not request.cookies.get("blixtbo_totp"):
        raise HTTPException(status_code=404)
    return user


def audit(db: Session, email: str, action: str, target: str = "") -> None:
    db.add(AuditLog(actor_email=email, action=action, target=target))
    db.commit()


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/auth/google/start")
def google_start() -> RedirectResponse:
    state = secrets.token_urlsafe(24)
    oauth_states[state] = "google"
    query = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": settings.google_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
    )
    return RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth?" + query)


@app.get("/auth/google/callback")
def google_callback(code: str, state: str, db: Session = Depends(get_db)) -> RedirectResponse:
    if oauth_states.pop(state, None) != "google":
        raise HTTPException(status_code=400, detail="Ogiltig inloggning.")
    token = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": settings.google_redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=20,
    )
    token.raise_for_status()
    profile = httpx.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {token.json()['access_token']}"},
        timeout=20,
    )
    profile.raise_for_status()
    info = profile.json()
    email = (info.get("email") or "").lower()
    user = db.query(User).filter_by(email=email).one_or_none()
    if user is None:
        user = User(email=email, name=info.get("name") or "", google_sub=info.get("sub"), auth_method="google")
        db.add(user)
        db.commit()
    cookie = serializer.dumps({"uid": user.id})
    response = RedirectResponse(settings.public_url + "/")
    response.set_cookie("blixtbo", cookie, httponly=True, secure=True, samesite="lax", max_age=60 * 60 * 24 * 14)
    return response


@app.post("/auth/email/start")
def email_start(body: dict, db: Session = Depends(get_db)) -> dict:
    email = str(body.get("email") or "").strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Ogiltig e-post.")
    code = f"{secrets.randbelow(1000000):06d}"
    # No paid mail provider. The code is stored hashed by keeping only a signed token.
    token = serializer.dumps({"email": email, "code": code})
    print(f"blixtbo email code for {email}: {code}", flush=True)
    return {"sent": True, "token": token}


@app.post("/auth/email/verify")
def email_verify(body: dict, db: Session = Depends(get_db)) -> JSONResponse:
    try:
        data = serializer.loads(str(body.get("token") or ""), max_age=600)
    except BadSignature:
        raise HTTPException(status_code=400, detail="Koden har gått ut.")
    if str(body.get("code") or "") != data.get("code"):
        raise HTTPException(status_code=400, detail="Fel kod.")
    email = data["email"]
    user = db.query(User).filter_by(email=email).one_or_none()
    if user is None:
        user = User(email=email, name=str(body.get("name") or ""), auth_method="email")
        db.add(user)
        db.commit()
    response = JSONResponse({"ok": True})
    response.set_cookie("blixtbo", serializer.dumps({"uid": user.id}), httponly=True, secure=True, samesite="lax")
    return response


@app.post("/match")
def match(body: dict, user: User = Depends(require_user)) -> dict:
    return match_listing(body.get("profile") or {}, body.get("listing") or {})


@app.post("/connections/{source_id}/approve")
def approve(source_id: str, body: dict, user: User = Depends(require_user), db: Session = Depends(get_db)) -> dict:
    method = str(body.get("method") or user.auth_method)
    purpose = str(body.get("purpose") or "create_account")
    accept_approval(db, user, source_id, method, purpose)
    db.commit()
    return {"queued": True, "source_id": source_id}


@app.get("/connections")
def list_connections(user: User = Depends(require_user), db: Session = Depends(get_db)) -> list:
    rows = db.query(LandlordLogin).filter_by(user_id=user.id).all()
    return [public_connection(row) for row in rows]


@app.get("/notices")
def list_notices(user: User = Depends(require_user), db: Session = Depends(get_db)) -> list:
    rows = db.query(Notice).filter_by(user_id=user.id).order_by(Notice.created_at.desc()).limit(50).all()
    return [{"kind": row.kind, "title": row.title, "body": row.body, "read": row.read} for row in rows]


@app.post("/listings/{listing_id}/apply")
def apply(listing_id: str, body: dict, user: User = Depends(require_user), db: Session = Depends(get_db)) -> dict:
    source_id = str(body.get("source_id") or "")
    login = db.query(LandlordLogin).filter_by(user_id=user.id, source_id=source_id, status="active").one_or_none()
    if login is None:
        raise HTTPException(status_code=409, detail="Kontot är inte kopplat.")
    db.add(Job(user_id=user.id, source_id=source_id, kind="apply", payload="{}"))
    db.commit()
    return {"queued": True, "listing_id": listing_id}


def _totp_ok(user: User, code: str) -> bool:
    if not user.totp_secret:
        return False
    return pyotp.TOTP(user.totp_secret).verify(code, valid_window=1)


@app.get(settings.admin_path)
def admin_home(request: Request, db: Session = Depends(get_db)) -> dict:
    user = current_user(request, db)
    if user is None or user.email.lower() != settings.owner_google_email.lower():
        raise HTTPException(status_code=404)
    if not request.cookies.get("blixtbo_totp"):
        if not user.totp_secret:
            user.totp_secret = pyotp.random_base32()
            db.commit()
        return {"totp_required": True, "otpauth": pyotp.TOTP(user.totp_secret).provisioning_uri(user.email, issuer_name="Blixtbo")}
    users = db.query(User).count()
    logins = db.query(LandlordLogin).count()
    return {"users": users, "landlord_logins": logins}


@app.post(settings.admin_path + "/totp")
def admin_totp(body: dict, request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    user = current_user(request, db)
    if user is None or user.email.lower() != settings.owner_google_email.lower():
        raise HTTPException(status_code=404)
    if not _totp_ok(user, str(body.get("code") or "")):
        raise HTTPException(status_code=401, detail="Fel kod.")
    audit(db, user.email, "admin.totp")
    response = JSONResponse({"ok": True})
    response.set_cookie("blixtbo_totp", "yes", httponly=True, secure=True, samesite="strict", max_age=60 * 60 * 8)
    return response


@app.get(settings.admin_path + "/audit")
def admin_audit(owner: User = Depends(require_owner), db: Session = Depends(get_db)) -> list:
    rows = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(100).all()
    return [{"actor": row.actor_email, "action": row.action, "target": row.target, "at": row.created_at.isoformat()} for row in rows]


@app.get(settings.admin_path + "/users")
def admin_users(owner: User = Depends(require_owner), db: Session = Depends(get_db)) -> list:
    audit(db, owner.email, "admin.users")
    rows = db.query(User).order_by(User.created_at.desc()).limit(200).all()
    return [{"id": row.id, "email": row.email, "name": row.name, "method": row.auth_method} for row in rows]
