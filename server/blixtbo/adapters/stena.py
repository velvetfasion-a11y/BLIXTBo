"""Stena Fastigheter email + password via the public Pigello credentials call.

BankID routes in the same app are never called. A one-time code pauses the job.
"""

import httpx

from blixtbo.adapters.common import captcha, request
from blixtbo.guard import RobotsBlocked, SiteGuard
from blixtbo.steps import StepResult, finished, paused

API = "https://api.pigello.io"
LOGIN = API + "/accounts/users/auth/login/credentials/"
ME = "https://minasidor.stenafastigheter.se/pigello/me"


def _headers() -> dict[str, str]:
    return {"Accept": "application/json", "Content-Type": "application/json"}


def _body(secret: dict) -> dict:
    return {
        "username": str(secret.get("username") or "").strip().lower(),
        "password": str(secret.get("password") or ""),
        "user_type": "Tenant",
    }


def login(client: httpx.Client, secret: dict, guard: SiteGuard | None = None) -> StepResult:
    try:
        response = request(client, "POST", LOGIN, guard, json=_body(secret), headers=_headers())
    except RobotsBlocked:
        return paused("captcha", "Stena tillåter inte anropet", "Robots.txt spärrar inloggningen. Inget skickades.")
    if captcha(response.status_code, response.text):
        return paused("captcha", "Stena vill att du tar över", "Stena visar en kontroll. Vi försöker inte igen.")
    text = response.text.lower()
    if "hotp" in text or "engångskod" in text or "one-time" in text:
        return paused("needs_email", "Stena skickade en kod", "Stena vill ha en engångskod. Öppna mejlet och slutför inloggningen själv. Vi skickar inte koden.")
    if response.status_code in (400, 401, 403) or "password" in text and response.status_code >= 400:
        return paused("password_changed", "Lösenordet hos Stena stämmer inte", "Kontrollera e-post och lösenord. Det här är lösenordet till Stena, inte BankID.")
    if response.status_code >= 400:
        return paused("site_changed", "Stena har ändrat inloggningen", "Svaret gick inte att tolka. Försöket är pausat.")
    try:
        data = response.json()
    except Exception:
        data = {}
    token = ""
    if isinstance(data, dict):
        token = str(data.get("token") or data.get("access") or "")
        if not token and isinstance(data.get("data"), dict):
            token = str(data["data"].get("token") or "")
    if token:
        secret["token"] = token
    return finished("Stena är kopplat", "Inloggningen med e-post hos Stena fungerar.", "logged_in")


def apply(client: httpx.Client, secret: dict, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    signed = login(client, secret, guard)
    if not signed.ok:
        return signed
    object_id = str(payload.get("object_id") or "")
    url = str(payload.get("listing_url") or "")
    if not url and object_id:
        url = f"https://minasidor.stenafastigheter.se/pigello/listings/{object_id}/interest"
    if not url:
        return paused("site_changed", "Annonsens id saknas", "Inget skickades till Stena.")
    headers = _headers()
    if secret.get("token"):
        headers["Authorization"] = f"Bearer {secret['token']}"
    try:
        response = request(client, "POST", url, guard, json={"object_id": object_id}, headers=headers)
    except RobotsBlocked:
        return paused("captcha", "Stena tillåter inte anropet", "Inget skickades.")
    if captcha(response.status_code, response.text):
        return paused("captcha", "Stena vill att du tar över", "Inget mer skickas.")
    lowered = response.text.lower()
    if response.status_code == 409 or "already" in lowered or "redan" in lowered:
        return finished("Redan anmält hos Stena", "Du har redan anmält intresse hos Stena.", "already_applied")
    if "not eligible" in lowered or "inte behörig" in lowered or response.status_code == 422:
        return finished("Inte aktuell hos Stena", "Stena säger att bostaden inte är aktuell.", "not_eligible")
    if response.status_code >= 400:
        return paused("site_changed", "Stena tog inte emot anmälan", "Försöket är pausat.")
    return finished("Intresseanmälan skickad till Stena", "Ansökan är skickad hos Stena.", "applied")


def renew(client: httpx.Client, secret: dict, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    return login(client, secret, guard)
