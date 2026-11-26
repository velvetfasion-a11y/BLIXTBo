"""Envelope encryption for landlord logins.

Each user has a data key (DEK). The DEK is wrapped with WORKER_KEK.
Only the worker process has that key. The API and the admin routes never call unwrap.
"""

import base64
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


def generate_seal_keypair() -> tuple[str, str]:
    """Return (public_b64, private_b64) for a one-off X25519 seal key."""
    from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
    from cryptography.hazmat.primitives import serialization

    private = X25519PrivateKey.generate()
    public = private.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    raw_private = private.private_bytes(
        serialization.Encoding.Raw,
        serialization.PrivateFormat.Raw,
        serialization.NoEncryption(),
    )
    return base64.b64encode(public).decode(), base64.b64encode(raw_private).decode()


def _seal_public_bytes() -> bytes:
    if not settings.worker_seal_public:
        raise RuntimeError("WORKER_SEAL_PUBLIC is not set. Passwords cannot be sealed.")
    raw = base64.b64decode(settings.worker_seal_public)
    if len(raw) != 32:
        raise RuntimeError("WORKER_SEAL_PUBLIC must be 32 bytes, base64-encoded.")
    return raw


def _seal_private_bytes() -> bytes:
    if not settings.worker_seal_private:
        raise RuntimeError("WORKER_SEAL_PRIVATE is not set. This process cannot open sealed logins.")
    raw = base64.b64decode(settings.worker_seal_private)
    if len(raw) != 32:
        raise RuntimeError("WORKER_SEAL_PRIVATE must be 32 bytes, base64-encoded.")
    return raw


def seal_credentials(payload: dict) -> str:
    """Encrypt username/password for the worker. The API has only the public key."""
    reject_bankid_material(payload)
    keys = {str(key).lower() for key in payload}
    if keys != {"username", "password"}:
        raise ValueError("only a username and password can be sealed")
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ValueError("credentials")
    if not username.strip() or not password or len(username) > 320 or len(password) > 200:
        raise ValueError("credentials")
    return _seal_dict({"username": username.strip(), "password": password})


def seal_cookie(cookie: str) -> str:
    """Seal a landlord session cookie so the queue never stores it in plaintext."""
    if not isinstance(cookie, str) or not cookie.strip():
        raise ValueError("session")
    return _seal_dict({"cookie": cookie.strip()})


def _seal_dict(payload: dict) -> str:
    import os

    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF

    reject_bankid_material(payload)
    ephemeral = X25519PrivateKey.generate()
    peer = X25519PublicKey.from_public_bytes(_seal_public_bytes())
    shared = ephemeral.exchange(peer)
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"blixtbo-seal-v1").derive(shared)
    nonce = os.urandom(12)
    raw = json.dumps(payload, separators=(",", ":")).encode()
    token = AESGCM(key).encrypt(nonce, raw, b"blixtbo-credentials")
    eph_pub = ephemeral.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return base64.b64encode(eph_pub + nonce + token).decode()


def open_sealed(blob: str) -> dict:
    """Worker only. Fails closed when WORKER_SEAL_PRIVATE is empty."""
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF

    raw = base64.b64decode(blob)
    if len(raw) < 32 + 12 + 16:
        raise ValueError("sealed")
    eph_pub, nonce, token = raw[:32], raw[32:44], raw[44:]
    private = X25519PrivateKey.from_private_bytes(_seal_private_bytes())
    shared = private.exchange(X25519PublicKey.from_public_bytes(eph_pub))
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"blixtbo-seal-v1").derive(shared)
    opened = json.loads(AESGCM(key).decrypt(nonce, token, b"blixtbo-credentials"))
    reject_bankid_material(opened)
    return opened


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
