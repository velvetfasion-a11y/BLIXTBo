"""APNs delivery for notices the worker already writes.

Tokens are stored by the iOS app. Nothing is sent unless an APNs key is configured.
The payload carries a blixtbo:// link so a tap opens the matching screen.
"""

from __future__ import annotations

import base64
import json
import time
from pathlib import Path

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

from blixtbo.config import settings

APPLICATIONS = frozenset(
    {"applied", "already_applied", "not_eligible", "needs_confirmation", "created", "status"}
)
CONNECTIONS = frozenset(
    {
        "logged_in",
        "password_changed",
        "session_expired",
        "needs_bankid",
        "needs_profile",
        "needs_identity",
        "needs_email",
        "captcha",
        "site_changed",
        "queue_action",
        "queue_ok",
        "rate_limited",
        "fee",
        "queue",
    }
)


def href_for_kind(kind: str) -> str:
    if kind in APPLICATIONS:
        return "blixtbo://ansokningar"
    if kind in CONNECTIONS:
        return "blixtbo://kopplingar"
    if kind == "listing":
        return "blixtbo://hem"
    return "blixtbo://notiser"


def build_payload(title: str, body: str, kind: str, notice_id: str) -> dict:
    return {
        "aps": {"alert": {"title": title, "body": body}, "sound": "default"},
        "href": href_for_kind(kind),
        "noticeId": notice_id,
        "kind": kind,
    }


def notify_user(db, user_id: str, notice_id: str, kind: str, title: str, body: str) -> None:
    from blixtbo.models import DeviceToken

    try:
        with db.begin_nested():
            rows = db.query(DeviceToken).filter_by(user_id=user_id, platform="ios").all()
            tokens = [(row.token, row.kind) for row in rows]
    except Exception as exc:
        print(f"blixtbo push lookup skipped: {exc}", flush=True)
        return
    payload = build_payload(title, body, kind, notice_id)
    for token, token_kind in tokens:
        try:
            deliver(token, token_kind, payload)
        except Exception as exc:
            print(f"blixtbo push send skipped: {exc}", flush=True)


def deliver(token: str, kind: str, payload: dict, *, post=None) -> dict:
    if kind == "expo":
        return {"skipped": True, "reason": "expo-push-not-used"}
    if not _apns_ready():
        return {"skipped": True, "reason": "apns-unconfigured"}
    host = "https://api.sandbox.push.apple.com" if settings.apns_use_sandbox else "https://api.push.apple.com"
    headers = {
        "authorization": f"bearer {build_apns_jwt()}",
        "apns-topic": settings.apple_bundle_id,
        "apns-push-type": "alert",
        "content-type": "application/json",
    }
    url = f"{host}/3/device/{token}"
    if post is not None:
        post(url, headers, payload)
        return {"skipped": False}
    with httpx.Client(http2=True, timeout=10.0) as client:
        response = client.post(url, headers=headers, json=payload)
    if response.status_code >= 400:
        raise RuntimeError(f"apns {response.status_code}")
    return {"skipped": False}


def build_apns_jwt(now: int | None = None) -> str:
    issued = int(time.time()) if now is None else now
    header = _b64url(json.dumps({"alg": "ES256", "kid": settings.apns_key_id}, separators=(",", ":")).encode())
    payload = _b64url(json.dumps({"iss": settings.apns_team_id, "iat": issued}, separators=(",", ":")).encode())
    signing_input = f"{header}.{payload}".encode("ascii")
    key = serialization.load_pem_private_key(_apns_pem().encode(), password=None)
    if not isinstance(key, ec.EllipticCurvePrivateKey):
        raise RuntimeError("APNs key must be ES256")
    der = key.sign(signing_input, ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    raw = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    return f"{header}.{payload}.{_b64url(raw)}"


def _apns_ready() -> bool:
    return bool(settings.apns_key_id and settings.apns_team_id and _apns_pem())


def _apns_pem() -> str:
    raw = (settings.apns_key_p8 or "").strip()
    if not raw:
        return ""
    if raw.startswith("-----BEGIN"):
        return raw.replace("\\n", "\n")
    path = Path(raw)
    if path.is_file():
        return path.read_text()
    return ""


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")
