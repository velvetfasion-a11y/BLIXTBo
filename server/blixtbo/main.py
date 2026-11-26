import json
import secrets
import time
from urllib.parse import urlencode

import httpx
import pyotp
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy.orm import Session

from blixtbo import crypto, landlords, public_listings
from blixtbo.config import settings
from blixtbo.db import init_db, session
from blixtbo.jobs import accept_approval, build_apply_payload, credentials_from_body, session_cookie_from_body
from blixtbo.account import (
    CONFIRMATION,
    AccountError,
    FirebaseGateway,
    FirestoreGateway,
    StripeGateway,
    recent_enough,
    run_deletion,
    valid_uid,
)
from blixtbo.billing import as_dict, client_secret_from_subscription, entitlement_from_event, entitlement_from_subscription, firebase_uid_from_event, is_stripe_secret_key, price_lookup_key, price_ore, resume_subscription, schedule_cancel, subscription_view
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


def _write_entitlement(uid: str, entitlement: dict) -> None:
    if not uid or settings.data_backend != "firestore":
        return
    from blixtbo.firebase_app import firestore_client

    firestore_client().collection("users").document(uid).collection("billing").document("entitlement").set(entitlement, merge=True)


def _stripe():
    import stripe

    if not is_stripe_secret_key(settings.stripe_secret_key):
        raise HTTPException(status_code=503, detail="Stripe-nyckeln är ogiltig.")
    stripe.api_key = settings.stripe_secret_key
    return stripe


def _customer_for(stripe, user: User):
    found = stripe.Customer.search(query=f"metadata['firebaseUid']:'{user.firebase_uid}'", limit=1)
    if found.data:
        return found.data[0]
    return stripe.Customer.create(email=user.email or None, metadata={"firebaseUid": user.firebase_uid})


def _ensure_price(stripe) -> str:
    if settings.stripe_price_id:
        return settings.stripe_price_id
    key = price_lookup_key()
    existing = stripe.Price.list(lookup_keys=[key], active=True, limit=1)
    if existing.data:
        return existing.data[0].id
    product = stripe.Product.create(name="Blixtbo Premium")
    price = stripe.Price.create(
        product=product.id,
        unit_amount=price_ore(),
        currency="sek",
        recurring={"interval": "month"},
        lookup_key=key,
    )
    return price.id


@app.post("/billing/subscribe")
def billing_subscribe(request: Request, db: Session = Depends(get_db)) -> dict:
    user = user_from_firebase(request, db)
    if user is None or not user.firebase_uid:
        raise HTTPException(status_code=401, detail="Logga in med Google först.")
    stripe = _stripe()
    customer = _customer_for(stripe, user)
    existing = _reusable_subscription(stripe, customer.id)
    if existing is not None:
        subscription = existing
    else:
        price_id = _ensure_price(stripe)
        subscription = stripe.Subscription.create(
            customer=customer.id,
            items=[{"price": price_id}],
            trial_period_days=settings.trial_days,
            payment_behavior="default_incomplete",
            payment_settings={"save_default_payment_method": "on_subscription"},
            metadata={"firebaseUid": user.firebase_uid},
            expand=["pending_setup_intent", "latest_invoice.payment_intent"],
        )
    raw = subscription.to_dict() if hasattr(subscription, "to_dict") else subscription
    try:
        secret, intent_type = client_secret_from_subscription(raw)
    except ValueError:
        raise HTTPException(status_code=502, detail="Stripe gav ingen client_secret.")
    return {"clientSecret": secret, "intentType": intent_type, "subscriptionId": raw.get("id")}


@app.get("/billing/entitlement")
def billing_entitlement(request: Request, db: Session = Depends(get_db)) -> dict:
    user = user_from_firebase(request, db)
    if user is None or not user.firebase_uid:
        raise HTTPException(status_code=401, detail="Logga in med Google först.")
    if settings.data_backend == "firestore":
        from blixtbo.firebase_app import firestore_client

        snap = firestore_client().collection("users").document(user.firebase_uid).collection("billing").document("entitlement").get()
        if snap.exists:
            return snap.to_dict() or {"plan": "free", "status": "free"}
    return {"plan": "free", "status": "free", "autoApply": False}


def _reusable_subscription(stripe, customer_id: str):
    listed = stripe.Subscription.list(customer=customer_id, status="all", limit=10)
    for item in listed.data:
        status = str(getattr(item, "status", "") or item.get("status") or "")
        if status not in ("incomplete", "trialing", "active", "paused"):
            continue
        full = stripe.Subscription.retrieve(
            item.id,
            expand=["pending_setup_intent", "latest_invoice.payment_intent"],
        )
        raw = full.to_dict() if hasattr(full, "to_dict") else full
        if raw.get("pending_setup_intent") or status == "incomplete":
            return raw
        raise HTTPException(status_code=409, detail="Du har redan Premium.")
    return None


def _subscription_for(user: User):
    stripe, raw = _subscription_state(user)
    if raw is None:
        raise HTTPException(status_code=404, detail="Ingen prenumeration.")
    return stripe, raw


def _subscription_state(user: User):
    stripe = _stripe()
    if not user.firebase_uid:
        return stripe, None
    customers = stripe.Customer.search(query=f"metadata['firebaseUid']:'{user.firebase_uid}'", limit=1)
    data = getattr(customers, "data", None) or []
    if not data:
        return stripe, None
    first = data[0]
    customer_id = first.id if hasattr(first, "id") else first["id"]
    listed = stripe.Subscription.list(customer=customer_id, status="all", limit=10)
    chosen = None
    fallback = None
    for item in getattr(listed, "data", None) or []:
        raw = as_dict(item)
        fallback = fallback or raw
        if str(raw.get("status") or "") in ("active", "trialing", "paused", "past_due", "incomplete"):
            chosen = raw
            break
    return stripe, chosen or fallback


def _store_subscription(uid: str, raw: dict) -> dict:
    view = subscription_view(raw)
    entitlement = entitlement_from_subscription(raw)
    _write_entitlement(uid, entitlement)
    return view


def _billing_user(request: Request, db: Session) -> User:
    user = user_from_firebase(request, db)
    if user is None or not user.firebase_uid:
        raise HTTPException(status_code=401, detail="Logga in med Google först.")
    return user


@app.get("/billing/subscription")
def billing_subscription(request: Request, db: Session = Depends(get_db)) -> dict:
    user = _billing_user(request, db)
    _stripe_client, raw = _subscription_state(user)
    return subscription_view(raw)


@app.post("/billing/pause")
def billing_pause(request: Request, db: Session = Depends(get_db)) -> dict:
    user = _billing_user(request, db)
    stripe, subscription = _subscription_for(user)
    updated = stripe.Subscription.modify(subscription["id"], pause_collection={"behavior": "void"})
    raw = as_dict(updated)
    if not raw.get("pause_collection"):
        raw = {**raw, "pause_collection": {"behavior": "void"}}
    return _store_subscription(user.firebase_uid, raw)


@app.post("/billing/resume")
def billing_resume(request: Request, db: Session = Depends(get_db)) -> dict:
    user = _billing_user(request, db)
    stripe, subscription = _subscription_for(user)
    updated = resume_subscription(stripe, subscription)
    return _store_subscription(user.firebase_uid, updated)


@app.post("/billing/cancel")
def billing_cancel(request: Request, db: Session = Depends(get_db)) -> dict:
    """Schedule the end. Access remains until the period ends, and a repeat call is a no-op."""
    user = _billing_user(request, db)
    stripe, subscription = _subscription_state(user)
    if subscription is None:
        return subscription_view(None)
    updated = schedule_cancel(stripe, subscription)
    return _store_subscription(user.firebase_uid, updated)


def build_gateways():
    return StripeGateway(), FirebaseGateway(), FirestoreGateway()


@app.post("/account/delete")
def account_delete(body: dict, request: Request, db: Session = Depends(get_db)):
    token = _bearer(request)
    if not token:
        raise HTTPException(status_code=401, detail="Logga in igen.")
    try:
        from blixtbo.firebase_app import verify_id_token

        decoded = verify_id_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Ogiltig inloggning.")
    uid = str(decoded.get("uid") or "")
    if not valid_uid(uid):
        raise HTTPException(status_code=401, detail="Ogiltig inloggning.")
    confirm = str((body or {}).get("confirm") or "").strip()
    if confirm != CONFIRMATION:
        raise HTTPException(status_code=400, detail="Skriv RADERA för att bekräfta.")
    scope = str((body or {}).get("scope") or "")
    if not recent_enough(int(decoded.get("auth_time") or 0), time.time()):
        raise HTTPException(status_code=401, detail="recent-login-required")
    stripe, firebase, firestore = build_gateways()
    try:
        result = run_deletion(
            db,
            uid=uid,
            email=str(decoded.get("email") or "").lower(),
            scope=scope,
            stripe=stripe,
            firebase=firebase,
            firestore=firestore,
        )
    except AccountError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail)
    response = JSONResponse(result)
    if scope in ("account", "erasure"):
        response.delete_cookie("blixtbo")
        response.delete_cookie("blixtbo_totp")
    return response


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
    if landlords.landlord(source_id) is None:
        raise HTTPException(status_code=404, detail="Den hyresvärden finns inte.")
    method = str(body.get("method") or user.auth_method)
    purpose = str(body.get("purpose") or "create_account")
    accept_approval(db, user, source_id, method, purpose)
    db.commit()
    return {"queued": True, "source_id": source_id}


@app.post("/connections/{source_id}/credentials")
def save_credentials(source_id: str, body: dict, user: User = Depends(require_user), db: Session = Depends(get_db)) -> dict:
    """Seal the password with the worker public key. This process cannot open it."""
    site = landlords.landlord(source_id)
    if site is None or not site.accepts_password:
        raise HTTPException(status_code=400, detail="Den här hyresvärden tar inte emot ett lösenord här.")
    try:
        secret = credentials_from_body(body)
        sealed = crypto.seal_credentials(secret)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Inloggningen kan inte sparas just nu.")
    except ValueError:
        raise HTTPException(status_code=400, detail="Skriv användarnamn och lösenord. BankID tas inte emot.")
    secret["password"] = ""
    db.add(Job(user_id=user.id, source_id=source_id, kind="store_credentials", payload=json.dumps({"sealed": sealed})))
    db.commit()
    return {"queued": True, "source_id": source_id}


@app.post("/connections/{source_id}/resume")
def resume_connection(source_id: str, user: User = Depends(require_user), db: Session = Depends(get_db)) -> dict:
    if landlords.landlord(source_id) is None:
        raise HTTPException(status_code=404, detail="Den hyresvärden finns inte.")
    login = db.query(LandlordLogin).filter_by(user_id=user.id, source_id=source_id).one_or_none()
    if login is None or not login.secret_ciphertext:
        raise HTTPException(status_code=409, detail="Ingen inloggning är sparad.")
    db.add(Job(user_id=user.id, source_id=source_id, kind="renew", payload=json.dumps({"source_id": source_id})))
    db.commit()
    return {"queued": True, "source_id": source_id}


@app.post("/connections/{source_id}/session")
def save_session(source_id: str, body: dict, user: User = Depends(require_user), db: Session = Depends(get_db)) -> dict:
    if not landlords.accepts_cookie(source_id):
        raise HTTPException(status_code=400, detail="Den här hyresvärden tar inte emot en session.")
    try:
        cookie = session_cookie_from_body(body)
        sealed = crypto.seal_cookie(cookie)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Sessionen kan inte sparas just nu.")
    except ValueError:
        raise HTTPException(status_code=400, detail="Bara hyresvärdens session tas emot. BankID sparas inte.")
    db.add(Job(user_id=user.id, source_id=source_id, kind="store_session", payload=json.dumps({"sealed": sealed})))
    db.commit()
    return {"queued": True, "source_id": source_id}


@app.get("/connections")
def list_connections(user: User = Depends(require_user), db: Session = Depends(get_db)) -> list:
    rows = db.query(LandlordLogin).filter_by(user_id=user.id).all()
    return [public_connection(row) for row in rows]


@app.get("/notices")
def list_notices(user: User = Depends(require_user), db: Session = Depends(get_db)) -> list:
    rows = db.query(Notice).filter_by(user_id=user.id).order_by(Notice.created_at.desc()).limit(50).all()
    return [
        {
            "id": row.id,
            "kind": row.kind,
            "title": row.title,
            "body": row.body,
            "read": row.read,
            "at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


@app.get("/listings")
def listings(request: Request, user: User = Depends(require_user)) -> dict:
    filters = {
        "areas": [part for part in (request.query_params.get("areas") or "").split(",") if part],
        "max_rent": request.query_params.get("max_rent") or "",
        "rooms": request.query_params.get("rooms") or "any",
        "min_sqm": request.query_params.get("min_sqm") or "",
        "min_floor": request.query_params.get("min_floor") or "",
    }
    client = public_listings_client()
    try:
        rows = public_listings.collect(client, filters)
    finally:
        client.close()
    return {"listings": [public_listings.to_listing(row) for row in rows]}


def public_listings_client():
    factory = getattr(landlords, "_client_factory", None)
    if factory is not None:
        return factory("listings")
    return httpx.Client(timeout=20.0, follow_redirects=False)


@app.post("/listings/{listing_id}/apply")
def apply(listing_id: str, body: dict, user: User = Depends(require_user), db: Session = Depends(get_db)) -> dict:
    source_id = str(body.get("source_id") or "")
    site = landlords.landlord(source_id)
    if site is None:
        raise HTTPException(status_code=404, detail="Den hyresvärden finns inte.")
    login = db.query(LandlordLogin).filter_by(user_id=user.id, source_id=source_id, status="active").one_or_none()
    if login is None:
        raise HTTPException(status_code=409, detail="Kontot är inte kopplat.")
    payload = build_apply_payload(listing_id, body)
    if (site.binding_apply or site.message_apply) and not payload.get("confirmed"):
        raise HTTPException(status_code=409, detail="Bekräfta i appen innan något skickas.")
    db.add(Job(user_id=user.id, source_id=source_id, kind="apply", payload=json.dumps(payload, ensure_ascii=False)))
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


from blixtbo.support import register as register_support

register_support(app, get_db, require_user)
