"""Dispatch a landlord id to its adapter. One module owns each site's endpoints."""

import httpx

from blixtbo.adapters import bostadsformedlingen, homeq, incit, qasa, rikshem, sssb, stena, uppsala
from blixtbo.guard import SiteGuard
from blixtbo.steps import StepResult, paused

ALIASES = {"hembla": "victoriahem"}


def canonical(source_id: str) -> str:
    return ALIASES.get(source_id, source_id)


def login(client: httpx.Client, source_id: str, secret: dict, guard: SiteGuard | None = None) -> StepResult:
    source_id = canonical(source_id)
    if source_id == "homeq":
        return homeq.login(client, secret, guard)
    if source_id in incit.SITES:
        return incit.login(client, source_id, secret, guard)
    if source_id == "rikshem":
        return rikshem.login(client, secret, guard)
    if source_id == "stena":
        return stena.login(client, secret, guard)
    if source_id == "uppsala":
        return uppsala.login(client, secret, guard)
    if source_id == "sssb":
        return sssb.login(client, secret, guard)
    if source_id == "qasa":
        return qasa.login(client, secret, guard)
    return paused("site_changed", "Hyresvärden saknar adapter", "Den här hyresvärden kan inte loggas in automatiskt.")


def create(client: httpx.Client, source_id: str, username: str, password: str, guard: SiteGuard | None = None) -> StepResult:
    source_id = canonical(source_id)
    if source_id == "homeq":
        result = homeq.create(client, username, password, guard)
        return result
    return paused("needs_profile", "Skapa kontot själv", "Blixtbo skapar inte det här kontot. Registrera dig hos hyresvärden och logga sedan in med ditt lösenord.")


def apply(client: httpx.Client, source_id: str, secret: dict, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    source_id = canonical(source_id)
    if source_id == "homeq":
        return homeq.apply(client, secret, payload, guard)
    if source_id in incit.SITES:
        if secret.get("cookie") and not secret.get("password"):
            return incit.session(client, source_id, str(secret["cookie"]), "apply", payload, guard)
        return incit.apply(client, source_id, secret, payload, guard)
    if source_id == "rikshem":
        return rikshem.apply(client, secret, payload, guard)
    if source_id == "stena":
        return stena.apply(client, secret, payload, guard)
    if source_id == "uppsala":
        return uppsala.apply(client, secret, payload, guard)
    if source_id == "sssb":
        return sssb.apply(client, secret, payload, guard)
    if source_id == "qasa":
        return qasa.apply(client, secret, payload, guard)
    return paused("site_changed", "Hyresvärden saknar adapter", "Ansökan skickades inte.")


def keepalive(client: httpx.Client, source_id: str, secret: dict, guard: SiteGuard | None = None) -> StepResult:
    """Read-only keep-alive. Qasa, Akelius and the fee queues make no request."""
    source_id = canonical(source_id)
    if source_id in ("qasa", "akelius", "bostadsformedlingen", "boplats", "boplatssyd", "wallenstam"):
        return finished("Hoppas över", "Inget anrop görs.", "skipped")
    if source_id == "homeq":
        return homeq.keepalive(client, secret, guard)
    if source_id in incit.SITES:
        return incit.keepalive(client, source_id, secret, guard)
    if source_id == "rikshem":
        return rikshem.keepalive(client, secret, guard)
    if source_id == "stena":
        return stena.keepalive(client, secret, guard)
    if source_id == "uppsala":
        return uppsala.keepalive(client, secret, guard)
    if source_id == "sssb":
        return sssb.keepalive(client, secret, guard)
    return finished("Hoppas över", "Inget anrop görs.", "skipped")


def renew(client: httpx.Client, source_id: str, secret: dict, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    source_id = canonical(source_id)
    if source_id == "homeq":
        return homeq.renew(client, secret, payload, guard)
    if source_id in incit.SITES:
        return incit.renew(client, source_id, secret, payload, guard)
    if source_id == "rikshem":
        return rikshem.renew(client, secret, payload, guard)
    if source_id == "stena":
        return stena.renew(client, secret, payload, guard)
    if source_id == "uppsala":
        return uppsala.renew(client, secret, payload, guard)
    if source_id == "sssb":
        return sssb.renew(client, secret, payload, guard)
    if source_id == "qasa":
        return qasa.renew(client, secret, payload, guard)
    return paused("site_changed", "Hyresvärden saknar adapter", "Förnyelsen gjordes inte.")


def session(client: httpx.Client, source_id: str, cookie: str, kind: str, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    source_id = canonical(source_id)
    if source_id == "bostadsformedlingen":
        return bostadsformedlingen.session(client, cookie, kind, payload, guard)
    if source_id in incit.SITES:
        return incit.session(client, source_id, cookie, kind, payload, guard)
    if source_id == "sssb":
        return sssb.session(client, cookie, kind, payload, guard)
    return paused("needs_bankid", "BankID behövs", "Den här hyresvärden kräver att du loggar in själv.", bankid=True)
