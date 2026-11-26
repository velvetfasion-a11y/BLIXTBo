import os

os.environ.setdefault("WORKER_KEK", "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=")
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("LANDLORD_MODE", "dry-run")
os.environ.setdefault("DATA_BACKEND", "postgres")
os.environ.setdefault("WORKER_SEAL_PUBLIC", "")
os.environ.setdefault("WORKER_SEAL_PRIVATE", "")


import pytest


def _guarded_send(original):
    def send(self, request, *args, **kwargs):
        transport = getattr(self, "_transport", None)
        name = type(transport).__name__ if transport is not None else ""
        if name != "HTTPTransport":
            return original(self, request, *args, **kwargs)
        raise RuntimeError("outbound network is blocked in tests")

    return send


def _playwright_blocked(*_args, **_kwargs):
    raise RuntimeError("playwright blocked in tests")


@pytest.fixture(autouse=True)
def _block_outbound_network(monkeypatch):
    """Unmocked httpx and Playwright must fail. MockTransport and the ASGI test client stay usable."""
    import httpx

    monkeypatch.setattr(httpx.Client, "send", _guarded_send(httpx.Client.send))
    import playwright.sync_api as sync_api

    monkeypatch.setattr(sync_api, "sync_playwright", _playwright_blocked)


@pytest.fixture(autouse=True)
def _reset_landlord_runtime():
    from blixtbo import keepalive, landlords
    from blixtbo.config import settings

    settings.landlord_mode = "dry-run"
    settings.worker_kek = os.environ["WORKER_KEK"]
    landlords.reset_client_factory()
    keepalive.reset_host_gap()
    keepalive.clear_entitlement_cache()
    os.environ.pop("KEEPALIVE_ASSUME_PAID", None)
    yield
    settings.landlord_mode = "dry-run"
    settings.worker_kek = os.environ["WORKER_KEK"]
    landlords.reset_client_factory()
    keepalive.reset_host_gap()
    keepalive.clear_entitlement_cache()
    os.environ.pop("KEEPALIVE_ASSUME_PAID", None)
