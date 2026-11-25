"""Firebase Admin SDK. Token checks for the API, ciphertext writes for the worker."""

import json
import os

import firebase_admin
from firebase_admin import auth, credentials, firestore

from blixtbo.config import settings


def init_firebase() -> None:
    if firebase_admin._apps:
        return
    project = settings.firebase_project_id or os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCLOUD_PROJECT") or "blixtbo-dev"
    raw = settings.firebase_service_account.strip()
    if raw:
        cred = credentials.Certificate(json.loads(raw))
        firebase_admin.initialize_app(cred, {"projectId": project})
        return
    # Emulator and local runs: no service account file. FIREBASE_AUTH_EMULATOR_HOST
    # and FIRESTORE_EMULATOR_HOST must be set in the environment for this to talk
    # to the emulators instead of production.
    firebase_admin.initialize_app(options={"projectId": project})


def verify_id_token(id_token: str) -> dict:
    init_firebase()
    return auth.verify_id_token(id_token)


def firestore_client():
    init_firebase()
    return firestore.client()
