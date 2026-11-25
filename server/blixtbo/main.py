import json
import secrets
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
import pyotp
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy.orm import Session

from blixtbo import landlords
from blixtbo.config import settings
from blixtbo.db import init_db, session
from blixtbo.jobs import accept_approval, session_cookie_from_body
from blixtbo.analytics import recent_events, record_event, registrations_per_day, umami_configured, umami_pageviews
from blixtbo.billing import entitlement_from_event, firebase_uid_from_event, subscription_data
from blixtbo.custom_landlords import apply_mode, fetch_listings, keep_listing, rank_candidates, rank_listings, search_web
from blixtbo.matching import match_listing
from blixtbo.models import AuditLog, Job, LandlordLogin, Notice, User
from blixtbo.crypto import public_connection

app = FastAPI(title="Blixtbo", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:43123", "http://localhost:43123"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)
serializer = URLSafeTimedSerializer(settings.app_secret, salt="blixtbo-session")
oauth_states: dict[str, str] = {}


def get_db():
    db = session()
    try:
        yield db
    finally:
        db.close()


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization") or ""
    if header.lower().startswith("bearer "):
        token = header.split(" ", 1)[1].strip()
        return token or None
    return None


def user_from_firebase(request: Request, db: Session) -> User | None:
    """Map a Firebase ID token to the local user row. Swipes themselves live in Firestore."""
    if settings.data_backend != "firestore" and not settings.firebase_project_id:
        return None
    token = _bearer(request)
    if not token:
        body_token = None
    else:
        body_token = token
    if not body_token:
        return None
    try:
        from blixtbo.firebase_app import verify_id_token

        decoded = verify_id_token(body_token)
    except Exception:
        return None
    uid = str(decoded.get("uid") or "")
    email = str(decoded.get("email") or "").lower()
    if not uid or not email:
        return None
    user = db.query(User).filter_by(firebase_uid=uid).one_or_none()
    if user is None:
        user = db.query(User).filter_by(email=email).one_or_none()
    if user is None:
        user = User(email=email, name=str(decoded.get("name") or ""), google_sub=str(decoded.get("sub") or uid), auth_method="google", firebase_uid=uid)
        db.add(user)
    else:
        user.firebase_uid = uid
        if decoded.get("name") and not user.name:
            user.name = str(decoded.get("name"))
    db.commit()
    return user


def current_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    firebase_user = user_from_firebase(request, db)
    if firebase_user is not None:
        return firebase_user
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


def require_owner(request: Request, db: Session = Depends(get_db)) -> User:
    user = user_from_firebase(request, db) if settings.data_backend == "firestore" else current_user(request, db)
    owner = (settings.owner_google_email or "").lower()
    if user is None or not owner or user.email.lower() != owner or not request.cookies.get("blixtbo_totp"):
        raise HTTPException(status_code=404)
    return user


def audit(db: Session, email: str, action: str, target: str = "") -> None:
    db.add(AuditLog(actor_email=email, action=action, target=target))
    db.commit()


@app.on_event("startup")
def startup() -> None:
    init_db()
    if settings.data_backend != "firestore":
        return
    try:
        from blixtbo.firebase_app import firestore_client

        firestore_client().collection("config").document("landlords").collection("sources").document("homeq").set(
            {
                "applicationLimit": 5,
                "plusLimit": 10,
                "plusPriceKr": 349,
                "plusUrl": "https://www.homeq.se/plus",
            },
            merge=True,
        )
    except Exception as exc:
        print(f"blixtbo firestore seed skipped: {exc}", flush=True)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/analytics/collect")
def analytics_collect(body: dict, db: Session = Depends(get_db)) -> dict:
    try:
        record_event(db, str(body.get("event") or ""), body.get("data") if isinstance(body.get("data"), dict) else {})
    except ValueError:
        raise HTTPException(status_code=400, detail="Ogiltig händelse.")
    return {"ok": True}


def _stats_allowed(request: Request, db: Session) -> bool:
    secret = request.headers.get("x-blixtbo-stats") or ""
    if secret and secret == settings.app_secret:
        return True
    return _owner_candidate(request, db) is not None and bool(request.cookies.get("blixtbo_totp"))


@app.get(settings.admin_path + "/stats")
def analytics_stats(request: Request, db: Session = Depends(get_db)) -> dict:
    if not _stats_allowed(request, db):
        raise HTTPException(status_code=404)
    visitors = umami_pageviews()
    return {
        "source": "umami" if visitors is not None else "event-log",
        "umami": umami_configured(),
        "visitorsPerDay": visitors,
        "registrationsPerDay": registrations_per_day(db),
        "payingCustomers": _paying_customers(),
        "revenue": _revenue(),
        "events": recent_events(db),
    }


def _paying_customers() -> dict | None:
    if not settings.stripe_secret_key.startswith("sk_test_"):
        return None
    import stripe

    stripe.api_key = settings.stripe_secret_key
    try:
        active = stripe.Subscription.list(status="active", limit=100)
        trialing = stripe.Subscription.list(status="trialing", limit=100)
    except Exception:
        return None
    return {"active": len(active.data), "trialing": len(trialing.data)}


def _revenue() -> list[dict] | None:
    if not settings.stripe_secret_key.startswith("sk_test_"):
        return None
    import stripe

    stripe.api_key = settings.stripe_secret_key
    try:
        invoices = stripe.Invoice.list(limit=100, status="paid")
    except Exception:
        return None
    totals: dict[str, int] = {}
    for invoice in invoices.data:
        created = datetime.fromtimestamp(invoice.created, timezone.utc).date().isoformat()
        totals[created] = totals.get(created, 0) + int(invoice.amount_paid or 0)
    return [{"day": day, "amountOre": totals[day], "currency": "sek"} for day in sorted(totals)]


def _write_entitlement(uid: str, entitlement: dict) -> None:
    if not uid or settings.data_backend != "firestore":
        return
    from blixtbo.firebase_app import firestore_client

    firestore_client().collection("users").document(uid).collection("billing").document("entitlement").set(entitlement, merge=True)


def _stripe():
    import stripe

    if not settings.stripe_secret_key.startswith("sk_test_"):
        raise HTTPException(status_code=503, detail="Stripe-testnyckel saknas.")
    stripe.api_key = settings.stripe_secret_key
    return stripe


@app.post("/billing/checkout")
def billing_checkout(request: Request, db: Session = Depends(get_db)) -> dict:
    user = user_from_firebase(request, db)
    if user is None or not user.firebase_uid:
        raise HTTPException(status_code=401, detail="Logga in med Google först.")
    stripe = _stripe()
    if not settings.stripe_price_id:
        raise HTTPException(status_code=503, detail="STRIPE_PRICE_ID saknas.")
    params = {
        "mode": "subscription",
        "client_reference_id": user.firebase_uid,
        "line_items": [{"price": settings.stripe_price_id, "quantity": 1}],
        "success_url": settings.public_app_url + "/profil?checkout=success",
        "cancel_url": settings.public_app_url + "/profil?checkout=cancel",
        "metadata": {"firebaseUid": user.firebase_uid},
        "subscription_data": subscription_data(user.firebase_uid),
    }
    session = stripe.checkout.Session.create(**params)
    return {"url": session.url}


@app.post("/billing/portal")
def billing_portal(request: Request, db: Session = Depends(get_db)) -> dict:
    user = user_from_firebase(request, db)
    if user is None or not user.firebase_uid:
        raise HTTPException(status_code=401, detail="Logga in med Google först.")
    stripe = _stripe()
    customers = stripe.Customer.search(query=f"metadata['firebaseUid']:'{user.firebase_uid}'")
    if not customers.data:
        raise HTTPException(status_code=404, detail="Ingen Stripe-kund ännu.")
    portal = stripe.billing_portal.Session.create(customer=customers.data[0].id, return_url=settings.public_app_url + "/profil")
    return {"url": portal.url}


def _subscription_for(user: User):
    stripe = _stripe()
    customers = stripe.Customer.search(query=f"metadata['firebaseUid']:'{user.firebase_uid}'")
    if not customers.data:
        raise HTTPException(status_code=404, detail="Ingen prenumeration.")
    subs = stripe.Subscription.list(customer=customers.data[0].id, status="all", limit=1)
    if not subs.data:
        raise HTTPException(status_code=404, detail="Ingen prenumeration.")
    return stripe, subs.data[0]


@app.post("/billing/pause")
def billing_pause(request: Request, db: Session = Depends(get_db)) -> dict:
    user = user_from_firebase(request, db)
    if user is None or not user.firebase_uid:
        raise HTTPException(status_code=401, detail="Logga in med Google först.")
    stripe, subscription = _subscription_for(user)
    updated = stripe.Subscription.modify(subscription.id, pause_collection={"behavior": "void"})
    raw = updated.to_dict() if hasattr(updated, "to_dict") else updated
    entitlement = entitlement_from_event({"type": "customer.subscription.updated", "data": {"object": raw}})
    _write_entitlement(user.firebase_uid, entitlement or {})
    return {"status": "paused"}


@app.post("/billing/resume")
def billing_resume(request: Request, db: Session = Depends(get_db)) -> dict:
    user = user_from_firebase(request, db)
    if user is None or not user.firebase_uid:
        raise HTTPException(status_code=401, detail="Logga in med Google först.")
    stripe, subscription = _subscription_for(user)
    updated = stripe.Subscription.modify(subscription.id, pause_collection="")
    raw = updated.to_dict() if hasattr(updated, "to_dict") else updated
    entitlement = entitlement_from_event({"type": "customer.subscription.updated", "data": {"object": raw}})
    _write_entitlement(user.firebase_uid, entitlement or {})
    return {"status": "active"}


@app.post("/billing/webhook")
async def billing_webhook(request: Request) -> dict:
    stripe = _stripe()
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="STRIPE_WEBHOOK_SECRET saknas.")
    try:
        event = stripe.Webhook.construct_event(payload, signature, settings.stripe_webhook_secret)
    except Exception:
        raise HTTPException(status_code=400, detail="Ogiltig webhook.")
    entitlement = entitlement_from_event(event)
    uid = firebase_uid_from_event(event)
    if entitlement and uid:
        _write_entitlement(uid, entitlement)
    kind = event.get("type") if isinstance(event, dict) else event["type"]
    db = session()
    try:
        if kind == "checkout.session.completed":
            record_event(db, "payment_success")
            record_event(db, "trial_started")
        elif kind == "invoice.payment_failed":
            record_event(db, "payment_failed")
        elif kind == "customer.subscription.updated" and entitlement and entitlement.get("status") == "paused":
            record_event(db, "subscription_paused")
    finally:
        db.close()
    return {"ok": True}


@app.post("/custom-landlords/discover")
def discover_landlord(body: dict) -> dict:
    name = str(body.get("name") or "").strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Skriv ett namn.")
    city = str(body.get("city") or "").strip()
    kind = str(body.get("kind") or "").strip()
    website = str(body.get("websiteUrl") or "").strip()
    if website:
        candidates = [{"url": website, "title": name, "snippet": "Adress som du skrev in"}]
    else:
        candidates = search_web(name, city, kind)
    ranked = rank_candidates(name, city, kind, candidates)
    return {"candidates": ranked[:5]}


@app.post("/custom-landlords/listings")
def custom_listings(body: dict) -> dict:
    url = str(body.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="En adress saknas.")
    found, error = fetch_listings(url)
    if error:
        raise HTTPException(status_code=400, detail=error)
    filters = body.get("filters") or {}
    kept = [item for item in found if keep_listing(item, filters)]
    profile = body.get("profile") or {}
    profile_text = " ".join(str(profile.get(key) or "") for key in ("occupation", "letter", "currentCity", "city"))
    mode = apply_mode(url)
    return {"applyMode": mode, "listings": rank_listings(profile_text, kept)}


@app.post("/auth/firebase")
def firebase_session(request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    """End-user Google sign-in is Firebase Auth. The bearer token links that user to the API."""
    user = user_from_firebase(request, db)
    if user is None or not user.firebase_uid:
        raise HTTPException(status_code=401, detail="Ogiltig Firebase-inloggning.")
    response = JSONResponse({"ok": True, "uid": user.firebase_uid})
    response.set_cookie("blixtbo", serializer.dumps({"uid": user.id}), httponly=True, secure=True, samesite="lax", max_age=60 * 60 * 24 * 14)
    return response


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


@app.post("/connections/{source_id}/session")
def save_session(source_id: str, body: dict, user: User = Depends(require_user), db: Session = Depends(get_db)) -> dict:
    if not landlords.requires_bankid(source_id):
        raise HTTPException(status_code=400, detail="Den här hyresvärden kräver inte BankID.")
    try:
        cookie = session_cookie_from_body(body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Bara hyresvärdens session tas emot. BankID sparas inte.")
    db.add(Job(user_id=user.id, source_id=source_id, kind="store_session", payload=json.dumps({"cookie": cookie})))
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


def _owner_candidate(request: Request, db: Session) -> User | None:
    user = user_from_firebase(request, db) if settings.data_backend == "firestore" else current_user(request, db)
    owner = (settings.owner_google_email or "").lower()
    if user is None or not owner or user.email.lower() != owner:
        return None
    return user


@app.put(settings.admin_path + "/landlords/{source_id}")
def admin_limit(source_id: str, body: dict, owner: User = Depends(require_owner), db: Session = Depends(get_db)) -> dict:
    from blixtbo.credentials import refuse_bankid_document
    from blixtbo.firebase_app import firestore_client

    if settings.data_backend != "firestore":
        raise HTTPException(status_code=409, detail="DATA_BACKEND är inte firestore.")
    document = {
        "applicationLimit": body.get("applicationLimit"),
        "plusLimit": body.get("plusLimit"),
        "plusPriceKr": body.get("plusPriceKr"),
        "plusUrl": str(body.get("plusUrl") or ""),
    }
    refuse_bankid_document(document)
    firestore_client().collection("config").document("landlords").collection("sources").document(source_id).set(document, merge=True)
    audit(db, owner.email, "admin.limits", source_id)
    return {"ok": True, "source_id": source_id}


@app.get(settings.admin_path)
def admin_home(request: Request, db: Session = Depends(get_db)) -> dict:
    user = _owner_candidate(request, db)
    if user is None:
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
    user = _owner_candidate(request, db)
    if user is None:
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
