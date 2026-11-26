"""Routes used by the iOS app. Web checkout is not linked from here.

Landlord passwords still go through POST /connections/{id}/credentials, which
seals them before they are queued. These routes never read or log a password.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from blixtbo import apple_billing, landlords
from blixtbo.config import settings
from blixtbo.db import session
from blixtbo.models import AppleAccount, AppleNotification, DeviceToken, Notice, User

router = APIRouter()


def get_db():
    db = session()
    try:
        yield db
    finally:
        db.close()


def require_user(request: Request, db: Session = Depends(get_db)) -> User:
    from blixtbo.main import current_user

    user = current_user(request, db)
    if user is None or not user.firebase_uid:
        raise HTTPException(status_code=401, detail="Logga in.")
    return user


def write_entitlement(uid: str, entitlement: dict) -> None:
    if not uid or settings.data_backend != "firestore":
        return
    from blixtbo.firebase_app import firestore_client

    firestore_client().collection("users").document(uid).collection("billing").document("entitlement").set(entitlement, merge=True)


def public_landlords() -> list[dict]:
    seen: set[str] = set()
    rows: list[dict] = []
    for site in landlords.LANDLORDS.values():
        if site.id in seen:
            continue
        seen.add(site.id)
        rows.append(
            {
                "id": site.id,
                "name": site.name,
                "acceptsPassword": site.accepts_password,
                "acceptsCookie": site.accepts_cookie,
                "requiresBankid": site.requires_bankid,
                "canCreate": site.can_create,
                "bindingApply": site.binding_apply,
                "messageApply": site.message_apply,
            }
        )
    rows.sort(key=lambda item: item["name"])
    return rows


def _account_for(db: Session, firebase_uid: str) -> AppleAccount:
    row = db.get(AppleAccount, firebase_uid)
    if row is None:
        row = AppleAccount(firebase_uid=firebase_uid, app_account_token=str(uuid.uuid4()))
        db.add(row)
        db.flush()
    return row


def _clean_token(value: object) -> str:
    token = str(value or "").strip()
    if not token or len(token) > 4096 or any(character.isspace() for character in token):
        raise HTTPException(status_code=400, detail="Ogiltig enhetstoken.")
    return token


@router.get("/landlords")
def list_landlords(user: User = Depends(require_user)) -> list:
    return public_landlords()


@router.get("/billing/apple/account-token")
def apple_account_token(user: User = Depends(require_user), db: Session = Depends(get_db)) -> dict:
    account = _account_for(db, user.firebase_uid)
    db.commit()
    return {"appAccountToken": account.app_account_token}


@router.post("/billing/apple/transactions")
def apple_transaction(body: dict, user: User = Depends(require_user), db: Session = Depends(get_db)) -> dict:
    signed = str((body or {}).get("signedTransaction") or "")
    if not signed:
        raise HTTPException(status_code=400, detail="signedTransaction saknas.")
    try:
        transaction = apple_billing.verify_jws(signed, apple_billing.trusted_roots())
        apple_billing._expect_bundle(transaction.get("bundleId"), settings.apple_bundle_id)
    except apple_billing.VerificationError:
        raise HTTPException(status_code=400, detail="Ogiltig Apple-transaktion.")
    account = _account_for(db, user.firebase_uid)
    token = apple_billing.normalise_uuid(str(transaction.get("appAccountToken") or ""))
    if token and token != account.app_account_token:
        raise HTTPException(status_code=403, detail="Köpet är kopplat till ett annat konto.")
    original = str(transaction.get("originalTransactionId") or "")
    if original:
        other = (
            db.query(AppleAccount)
            .filter(AppleAccount.original_transaction_id == original, AppleAccount.firebase_uid != user.firebase_uid)
            .one_or_none()
        )
        if other is not None:
            raise HTTPException(status_code=403, detail="Köpet är kopplat till ett annat konto.")
        account.original_transaction_id = original
    entitlement = apple_billing.entitlement_from_parts(
        notification_type="SUBSCRIBED",
        subtype="",
        transaction=transaction,
        renewal=None,
        product_id=settings.apple_product_id,
        now_ms=apple_billing.now_ms(),
    )
    if entitlement is None:
        raise HTTPException(status_code=400, detail="Transaktionen ger inte Premium.")
    _store_entitlement(db, user.firebase_uid, entitlement)
    return {"ok": True, "plan": entitlement["plan"], "status": entitlement["status"], "source": "apple"}


@router.post("/billing/apple/notifications")
async def apple_notifications(request: Request, db: Session = Depends(get_db)) -> dict:
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Ogiltig Apple-notis.")
    signed = str((body or {}).get("signedPayload") or "")
    if not signed:
        raise HTTPException(status_code=400, detail="signedPayload saknas.")
    try:
        decoded = apple_billing.decode_notification(
            signed,
            apple_billing.trusted_roots(),
            bundle_id=settings.apple_bundle_id,
            app_apple_id=settings.apple_app_apple_id,
        )
    except apple_billing.VerificationError:
        raise HTTPException(status_code=400, detail="Ogiltig Apple-notis.")
    notification_uuid = decoded["notificationUUID"]
    if notification_uuid:
        seen = db.get(AppleNotification, notification_uuid)
        if seen is not None:
            return {"ok": True, "duplicate": True}
    entitlement = apple_billing.entitlement_from_parts(
        notification_type=decoded["notificationType"],
        subtype=decoded["subtype"],
        transaction=decoded["transaction"],
        renewal=decoded["renewal"],
        product_id=settings.apple_product_id,
        now_ms=apple_billing.now_ms(),
    )
    if entitlement is None:
        _remember(db, notification_uuid, decoded["notificationType"], "")
        db.commit()
        return {"ok": True}
    transaction = decoded["transaction"] or {}
    uid = _resolve_uid(
        db,
        apple_billing.normalise_uuid(str(transaction.get("appAccountToken") or "")),
        str(transaction.get("originalTransactionId") or ""),
    )
    if not uid:
        raise HTTPException(status_code=503, detail="Ingen användare för köpet ännu.")
    _store_entitlement(db, uid, entitlement, notification_uuid=notification_uuid, notification_type=decoded["notificationType"])
    return {"ok": True}


@router.post("/devices")
def register_device(body: dict, user: User = Depends(require_user), db: Session = Depends(get_db)) -> dict:
    token = _clean_token((body or {}).get("token"))
    kind = str((body or {}).get("kind") or "apns")
    platform = str((body or {}).get("platform") or "")
    if kind not in ("apns", "expo") or platform != "ios":
        raise HTTPException(status_code=400, detail="Bara iOS-enheter kan registreras här.")
    row = db.query(DeviceToken).filter_by(token=token).one_or_none()
    if row is None:
        row = DeviceToken(user_id=user.id, token=token, platform=platform, kind=kind)
        db.add(row)
    else:
        row.user_id = user.id
        row.platform = platform
        row.kind = kind
    db.commit()
    return {"ok": True}


@router.post("/devices/remove")
def delete_device(body: dict, user: User = Depends(require_user), db: Session = Depends(get_db)) -> dict:
    token = _clean_token((body or {}).get("token"))
    db.query(DeviceToken).filter_by(user_id=user.id, token=token).delete()
    db.commit()
    return {"ok": True}


@router.post("/notices/{notice_id}/read")
def mark_notice_read(notice_id: str, user: User = Depends(require_user), db: Session = Depends(get_db)) -> dict:
    row = db.query(Notice).filter_by(id=notice_id, user_id=user.id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Notisen finns inte.")
    row.read = True
    db.commit()
    return {"ok": True}


def _resolve_uid(db: Session, app_account_token: str, original_transaction_id: str) -> str:
    if app_account_token:
        row = db.query(AppleAccount).filter_by(app_account_token=app_account_token).one_or_none()
        if row is not None:
            if original_transaction_id and not row.original_transaction_id:
                row.original_transaction_id = original_transaction_id
            return row.firebase_uid
    if original_transaction_id:
        row = db.query(AppleAccount).filter_by(original_transaction_id=original_transaction_id).one_or_none()
        if row is not None:
            return row.firebase_uid
    return ""


def _store_entitlement(db: Session, uid: str, entitlement: dict, notification_uuid: str = "", notification_type: str = "") -> None:
    try:
        write_entitlement(uid, entitlement)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=503, detail="Entitlement kunde inte sparas.")
    _remember(db, notification_uuid, notification_type, uid)
    db.commit()


def _remember(db: Session, notification_uuid: str, notification_type: str, uid: str) -> None:
    if not notification_uuid or db.get(AppleNotification, notification_uuid) is not None:
        return
    db.add(AppleNotification(notification_uuid=notification_uuid, firebase_uid=uid, notification_type=notification_type or ""))
