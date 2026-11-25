"""Encrypted landlord credentials in Firestore.

The worker encrypts with WORKER_KEK first. This module only stores that
ciphertext. BankID fields are refused. The API process does not call this.
"""

import base64

from blixtbo.crypto import BANKID_FIELDS

_DOC_KEYS = {"username", "secret_nonce", "secret_ciphertext", "landlord_requires_bankid", "status"}


def refuse_bankid_document(payload: dict) -> None:
    lowered = {str(key).lower() for key in payload}
    blocked = {key for key in lowered if key in BANKID_FIELDS or key.startswith("bankid")}
    if blocked:
        raise ValueError("BankID material is never stored")


def credential_document(nonce: bytes, ciphertext: bytes, username: str, requires_bankid: bool, status: str) -> dict:
    payload = {
        "username": username,
        "secret_nonce": base64.b64encode(nonce).decode(),
        "secret_ciphertext": base64.b64encode(ciphertext).decode(),
        "landlord_requires_bankid": bool(requires_bankid),
        "status": status,
    }
    refuse_bankid_document(payload)
    if set(payload) - _DOC_KEYS:
        raise ValueError("unexpected credential field")
    return payload


def mirror_credential(firebase_uid: str | None, source_id: str, nonce: bytes | None, ciphertext: bytes | None, username: str, requires_bankid: bool, status: str) -> None:
    from blixtbo.config import settings

    if settings.data_backend != "firestore":
        return
    if not firebase_uid or nonce is None or ciphertext is None:
        return
    document = credential_document(nonce, ciphertext, username, requires_bankid, status)
    from blixtbo.firebase_app import firestore_client

    firestore_client().collection("credentials").document(firebase_uid).collection("landlords").document(source_id).set(document)
