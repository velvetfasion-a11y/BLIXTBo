"""Envelope encryption for landlord logins.

Each user has a data key (DEK). The DEK is wrapped with WORKER_KEK.
Only the worker process has that key. The API and the admin routes never call unwrap.
"""

import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from blixtbo.config import settings


def generate_dek() -> bytes:
    return os.urandom(32)


def wrap_dek(dek: bytes) -> tuple[bytes, bytes]:
    nonce = os.urandom(12)
    token = AESGCM(settings.kek_bytes()).encrypt(nonce, dek, b"blixtbo-dek")
    return nonce, token


def unwrap_dek(nonce: bytes, token: bytes) -> bytes:
    return AESGCM(settings.kek_bytes()).decrypt(nonce, token, b"blixtbo-dek")


BANKID_FIELDS = frozenset(
    {
        "personalnumber",
        "personnummer",
        "autostarttoken",
        "orderref",
        "signature",
        "bankid",
        "completiondata",
        "xmlsig",
        "ocsp",
        "refid",
    }
)


def reject_bankid_material(payload: dict) -> None:
    keys = {str(key).lower() for key in payload}
    if keys & BANKID_FIELDS or any("bankid" in key for key in keys):
        raise ValueError("BankID material is never stored")


def encrypt_secret(dek: bytes, payload: dict) -> tuple[bytes, bytes]:
    reject_bankid_material(payload)
    keys = {str(key).lower() for key in payload}
    if "cookie" in keys and keys != {"cookie"}:
        raise ValueError("a landlord session is stored as the cookie only")
    nonce = os.urandom(12)
    raw = json.dumps(payload, separators=(",", ":")).encode()
    token = AESGCM(dek).encrypt(nonce, raw, b"blixtbo-login")
    return nonce, token


def decrypt_secret(dek: bytes, nonce: bytes, token: bytes) -> dict:
    raw = AESGCM(dek).decrypt(nonce, token, b"blixtbo-login")
    return json.loads(raw)


def public_connection(row) -> dict:
    """Fields an admin or the app may see. Never the secret."""
    return {
        "source_id": row.source_id,
        "status": row.status,
        "username": row.username,
        "last_login_at": row.last_login_at.isoformat() if row.last_login_at else None,
        "last_error": row.last_error,
        "landlord_requires_bankid": row.landlord_requires_bankid,
    }
