"""App Store Server Notifications V2 and StoreKit 2 transaction JWS.

Verification uses the x5c certificate chain in the JWS header and the Apple
root certificates shipped in blixtbo/certs. No call to Apple is required to
decide premium. The Firestore document matches the Stripe entitlement, with
status active or trialing and source=apple.
"""

from __future__ import annotations

import base64
import json
import time
from datetime import datetime, timezone
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from cryptography.x509.oid import ObjectIdentifier

from blixtbo.config import settings

# Leaf or intermediate certificates for App Store signed transactions carry this.
APPLE_IAP_OID = ObjectIdentifier("1.2.840.113635.100.6.11.1")
_CERT_DIR = Path(__file__).resolve().parent / "certs"

ENDED_TYPES = frozenset({"EXPIRED", "GRACE_PERIOD_EXPIRED", "REFUND", "REVOKE"})
IGNORED_TYPES = frozenset(
    {
        "TEST",
        "CONSUMPTION_REQUEST",
        "ONE_TIME_CHARGE",
        "RENEWAL_EXTENSION",
        "EXTERNAL_PURCHASE_TOKEN",
        "METADATA_UPDATE",
        "REFUND_DECLINED",
    }
)


class VerificationError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def now_ms() -> int:
    return int(time.time() * 1000)


def normalise_uuid(value: str) -> str:
    return (value or "").strip().lower()


def trusted_roots() -> list[x509.Certificate]:
    roots: list[x509.Certificate] = []
    if _CERT_DIR.is_dir():
        for path in sorted(_CERT_DIR.glob("*.cer")):
            roots.append(x509.load_der_x509_certificate(path.read_bytes()))
    extra = (settings.apple_root_cert_path or "").strip()
    if extra:
        raw = Path(extra).read_bytes()
        if raw.startswith(b"-----"):
            roots.append(x509.load_pem_x509_certificate(raw))
        else:
            roots.append(x509.load_der_x509_certificate(raw))
    if not roots:
        raise VerificationError("roots")
    return roots


def b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def verify_jws(token: str, roots: list[x509.Certificate]) -> dict:
    """Return the JSON payload after the certificate chain and ES256 signature check."""
    parts = token.split(".")
    if len(parts) != 3 or not all(parts):
        raise VerificationError("shape")
    header_b64, payload_b64, signature_b64 = parts
    try:
        header = json.loads(b64url_decode(header_b64))
    except (json.JSONDecodeError, ValueError):
        raise VerificationError("header")
    if header.get("alg") != "ES256":
        raise VerificationError("alg")
    x5c = header.get("x5c")
    if not isinstance(x5c, list) or len(x5c) < 2:
        raise VerificationError("x5c")
    try:
        certs = [x509.load_der_x509_certificate(base64.b64decode(item)) for item in x5c]
    except (ValueError, TypeError):
        raise VerificationError("x5c")
    _verify_chain(certs, roots)
    if not _chain_has_iap_oid(certs):
        raise VerificationError("oid")
    leaf_key = certs[0].public_key()
    if not isinstance(leaf_key, ec.EllipticCurvePublicKey):
        raise VerificationError("key")
    try:
        raw_signature = b64url_decode(signature_b64)
        leaf_key.verify(
            _raw_to_der(raw_signature),
            f"{header_b64}.{payload_b64}".encode("ascii"),
            ec.ECDSA(hashes.SHA256()),
        )
        payload = json.loads(b64url_decode(payload_b64))
    except VerificationError:
        raise
    except Exception:
        raise VerificationError("signature")
    if not isinstance(payload, dict):
        raise VerificationError("payload")
    return payload


def decode_notification(signed_payload: str, roots: list[x509.Certificate], *, bundle_id: str, app_apple_id: int = 0) -> dict:
    outer = verify_jws(signed_payload, roots)
    data = outer.get("data") if isinstance(outer.get("data"), dict) else {}
    _expect_bundle(data.get("bundleId"), bundle_id)
    if app_apple_id and data.get("appAppleId") not in (None, "", app_apple_id, str(app_apple_id)):
        try:
            if int(data.get("appAppleId")) != int(app_apple_id):
                raise VerificationError("app")
        except (TypeError, ValueError):
            raise VerificationError("app")
    transaction = None
    renewal = None
    signed_transaction = data.get("signedTransactionInfo")
    if isinstance(signed_transaction, str) and signed_transaction:
        transaction = verify_jws(signed_transaction, roots)
        _expect_bundle(transaction.get("bundleId"), bundle_id)
    signed_renewal = data.get("signedRenewalInfo")
    if isinstance(signed_renewal, str) and signed_renewal:
        renewal = verify_jws(signed_renewal, roots)
    return {
        "notificationType": str(outer.get("notificationType") or ""),
        "subtype": str(outer.get("subtype") or ""),
        "notificationUUID": str(outer.get("notificationUUID") or ""),
        "transaction": transaction,
        "renewal": renewal,
    }


def entitlement_from_parts(
    *,
    notification_type: str,
    subtype: str,
    transaction: dict | None,
    renewal: dict | None,
    product_id: str,
    now_ms: int,
) -> dict | None:
    """Map a verified transaction to the Firestore entitlement. None means ignore."""
    if notification_type in IGNORED_TYPES:
        return None
    tx = transaction or {}
    if not tx:
        return None
    if str(tx.get("productId") or "") != product_id:
        return None
    kind = str(tx.get("type") or "Auto-Renewable Subscription")
    if kind not in ("Auto-Renewable Subscription", ""):
        return None
    expires = _millis(tx.get("expiresDate"))
    revoked = _millis(tx.get("revocationDate")) > 0
    grace_until = _millis((renewal or {}).get("gracePeriodExpiresDate"))
    in_grace = notification_type == "DID_FAIL_TO_RENEW" and subtype == "GRACE_PERIOD" and grace_until > now_ms
    ended = revoked or notification_type in ENDED_TYPES or (not in_grace and expires <= now_ms)
    period_ms = grace_until if in_grace and ended is False and expires <= now_ms else expires
    auto_renew = (renewal or {}).get("autoRenewStatus")
    cancel_at_end = (auto_renew == 0 or subtype == "AUTO_RENEW_DISABLED") and not ended
    trial = _is_trial(tx)
    base = {
        "source": "apple",
        "productId": product_id,
        "originalTransactionId": str(tx.get("originalTransactionId") or ""),
        "appleEnvironment": str(tx.get("environment") or ""),
        "currentPeriodEnd": _iso(period_ms) if period_ms else None,
        "cancelAtPeriodEnd": cancel_at_end,
    }
    if ended:
        return {**base, "plan": "free", "status": "canceled", "autoApply": False, "trial": False, "cancelAtPeriodEnd": False}
    return {
        **base,
        "plan": "premium",
        "status": "trialing" if trial else "active",
        "autoApply": True,
        "trial": trial,
    }


def subscription_view_from_entitlement(data: dict | None) -> dict | None:
    """Shape /billing/subscription already returns, when Apple is the active source."""
    if not data or data.get("source") != "apple":
        return None
    status = str(data.get("status") or "")
    if data.get("plan") != "premium" or status not in ("active", "trialing"):
        return None
    return {
        "plan": "premium",
        "status": "active",
        "cancelAtPeriodEnd": bool(data.get("cancelAtPeriodEnd")),
        "currentPeriodEnd": data.get("currentPeriodEnd"),
        "trial": status == "trialing" or bool(data.get("trial")),
        "source": "apple",
    }


def _is_trial(tx: dict) -> bool:
    if str(tx.get("offerDiscountType") or "") == "FREE_TRIAL":
        return True
    try:
        offer = int(tx.get("offerType") or 0)
        price = int(tx.get("price") or 0)
    except (TypeError, ValueError):
        return False
    return offer == 1 and price == 0


def _millis(value) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return 0
    return number if number > 0 else 0


def _iso(millis: int) -> str | None:
    if millis <= 0:
        return None
    return datetime.fromtimestamp(millis / 1000, timezone.utc).isoformat()


def _expect_bundle(value, bundle_id: str) -> None:
    if value in (None, ""):
        return
    if str(value) != bundle_id:
        raise VerificationError("bundle")


def _chain_has_iap_oid(certs: list[x509.Certificate]) -> bool:
    for cert in certs:
        try:
            cert.extensions.get_extension_for_oid(APPLE_IAP_OID)
            return True
        except x509.ExtensionNotFound:
            continue
    return False


def _verify_chain(certs: list[x509.Certificate], roots: list[x509.Certificate]) -> None:
    now = datetime.now(timezone.utc)
    for cert in certs:
        before, after = _cert_window(cert)
        if now < before or now > after:
            raise VerificationError("validity")
    for index in range(len(certs) - 1):
        _verify_cert_signature(certs[index], certs[index + 1].public_key())
    last = certs[-1]
    if _is_trusted_root(last, roots):
        return
    for root in roots:
        try:
            _verify_cert_signature(last, root.public_key())
            return
        except VerificationError:
            continue
    raise VerificationError("root")


def _is_trusted_root(cert: x509.Certificate, roots: list[x509.Certificate]) -> bool:
    fingerprint = cert.fingerprint(hashes.SHA256())
    return any(root.fingerprint(hashes.SHA256()) == fingerprint for root in roots)


def _verify_cert_signature(cert: x509.Certificate, public_key) -> None:
    algorithm = cert.signature_hash_algorithm
    if algorithm is None or not isinstance(public_key, ec.EllipticCurvePublicKey):
        raise VerificationError("chain")
    try:
        public_key.verify(cert.signature, cert.tbs_certificate_bytes, ec.ECDSA(algorithm))
    except Exception:
        raise VerificationError("chain")


def _cert_window(cert: x509.Certificate) -> tuple[datetime, datetime]:
    before = getattr(cert, "not_valid_before_utc", None) or _as_utc(cert.not_valid_before)
    after = getattr(cert, "not_valid_after_utc", None) or _as_utc(cert.not_valid_after)
    return before, after


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _raw_to_der(raw: bytes) -> bytes:
    if len(raw) < 64 or len(raw) % 2 != 0:
        raise VerificationError("signature")
    half = len(raw) // 2
    r = int.from_bytes(raw[:half], "big")
    s = int.from_bytes(raw[half:], "big")
    return encode_dss_signature(r, s)
