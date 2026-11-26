import os

os.environ.setdefault("WORKER_KEK", "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=")
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("LANDLORD_MODE", "dry-run")
os.environ.setdefault("DATA_BACKEND", "postgres")
os.environ.setdefault("WORKER_SEAL_PUBLIC", "")
os.environ.setdefault("WORKER_SEAL_PRIVATE", "")


import pytest


@pytest.fixture(autouse=True)
def _reset_landlord_runtime():
    from blixtbo import landlords
    from blixtbo.config import settings

    settings.landlord_mode = "dry-run"
    settings.worker_kek = os.environ["WORKER_KEK"]
    landlords.reset_client_factory()
    yield
    settings.landlord_mode = "dry-run"
    settings.worker_kek = os.environ["WORKER_KEK"]
    landlords.reset_client_factory()
