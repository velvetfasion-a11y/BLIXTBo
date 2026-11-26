"""Bostadsförmedlingen Stockholm. BankID session cookie only. Interest is binding."""

import re

import httpx

from blixtbo.adapters.common import absolute, captcha, input_values, request
from blixtbo.guard import RobotsBlocked, SiteGuard
from blixtbo.steps import StepResult, finished, paused

ORIGIN = "https://bostad.stockholm.se"
ADS = ORIGIN + "/AllaAnnonser/"
LOGIN_URL = ORIGIN + "/minasidor/login/"
BINDING = "Intresset blir bindande för den sökande med längst kötid när annonstiden tar slut."


def _cookie_headers(cookie: str) -> dict[str, str]:
    return {"Cookie": cookie, "Accept": "application/json, text/html"}


def _ads(client: httpx.Client, cookie: str, guard: SiteGuard | None) -> httpx.Response:
    return request(client, "GET", ADS, guard, headers=_cookie_headers(cookie), follow_redirects=False)


def _expired(response: httpx.Response) -> bool:
    if response.status_code in (301, 302, 303, 307, 308):
        loc = response.headers.get("location") or ""
        return "login" in loc.lower()
    if response.status_code in (401, 403):
        return True
    try:
        data = response.json()
    except Exception:
        return "logga in" in response.text.lower() and response.status_code >= 400
    if isinstance(data, dict) and data.get("ArInloggad") is False:
        return True
    if isinstance(data, list) and data and all(isinstance(row, dict) and row.get("ArInloggad") is False for row in data[:3]):
        return True
    return False


def _listing(data, payload: dict) -> dict | None:
    if not isinstance(data, list):
        return None
    wanted = str(payload.get("lagenhet_id") or payload.get("listing_id") or "")
    annons = str(payload.get("annons_id") or "")
    for row in data:
        if not isinstance(row, dict):
            continue
        if wanted and str(row.get("LagenhetId")) == wanted:
            return row
        if annons and str(row.get("AnnonsId")) == annons:
            return row
    return None


def _interest_form(html: str) -> tuple[str, dict[str, str]] | None:
    for match in re.finditer(r"<form\b[^>]*>[\s\S]*?</form>", html, flags=re.I):
        block = match.group(0)
        if not re.search(r"intresse", block, flags=re.I):
            continue
        action = re.search(r'action="([^"]*)"', block, flags=re.I)
        return (action.group(1) if action else "", input_values(block))
    return None


def _confirmed(payload: dict) -> bool:
    text = str(payload.get("confirmation") or "")
    return bool(payload.get("confirmed")) and "bindande" in text.lower()


def session(client: httpx.Client, cookie: str, kind: str, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    try:
        response = _ads(client, cookie, guard)
    except RobotsBlocked:
        return paused("captcha", "Bostadsförmedlingen tillåter inte anropet", "Robots.txt spärrar anropet. Inget skickades.")
    if captcha(response.status_code, response.text):
        return paused("captcha", "Bostadsförmedlingen vill att du tar över", "Sidan visar en kontroll. Vi försöker inte igen. Inget intresse skickades.")
    if _expired(response):
        return paused("needs_bankid", "BankID behövs hos Bostadsförmedlingen", "Sessionen har gått ut. Logga in hos Bostadsförmedlingen med BankID på din egen enhet. Inte hos Blixtbo.", bankid=True)
    if kind == "renew":
        text = response.text.lower()
        if "förnya kön" in text or "fornya kon" in text:
            return paused("needs_profile", "Förnya kön hos Bostadsförmedlingen", "Bostadskön behöver förnyas. Logga in hos Bostadsförmedlingen och gör det själv.")
        return finished("Kön hos Bostadsförmedlingen är kollad", "Sessionen fungerar. Kön behöver inget extra just nu.", "queue_ok")
    if kind != "apply":
        return finished("Bostadsförmedlingen är kopplat", "Sessionen är sparad.", "logged_in")
    if not _confirmed(payload):
        return paused(
            "needs_confirmation",
            "Bekräfta intresseanmälan",
            BINDING + " Inget skickades. Bekräfta i appen först.",
        )
    try:
        data = response.json()
    except Exception:
        return paused("site_changed", "Bostadsförmedlingen har ändrat svaret", "Annonslistan gick inte att läsa. Inget skickades.")
    row = _listing(data, payload)
    if row is None:
        return paused("site_changed", "Annonsen saknas", "Bostadsförmedlingen har inte den här annonsen i listan. Inget skickades.")
    if row.get("HarAnmaltIntresse"):
        return finished("Redan anmält hos Bostadsförmedlingen", "Du har redan anmält intresse.", "already_applied")
    if row.get("KanAnmalaIntresse") is False:
        return finished("Inte aktuell hos Bostadsförmedlingen", "Annonsen tar inte emot intresseanmälan just nu.", "not_eligible")
    url = absolute(ORIGIN, str(row.get("Url") or f"/bostad/{row.get('LagenhetId')}/"))
    try:
        page = request(client, "GET", url, guard, headers=_cookie_headers(cookie), follow_redirects=False)
    except RobotsBlocked:
        return paused("captcha", "Bostadsförmedlingen tillåter inte anropet", "Robots.txt spärrar annonsen. Inget skickades.")
    if _expired(page):
        return paused("needs_bankid", "BankID behövs hos Bostadsförmedlingen", "Sessionen har gått ut. Logga in igen med BankID hos Bostadsförmedlingen.", bankid=True)
    if captcha(page.status_code, page.text):
        return paused("captcha", "Bostadsförmedlingen vill att du tar över", "Sidan visar en kontroll. Inget intresse skickades.")
    found = _interest_form(page.text)
    if found is None:
        return paused("site_changed", "Intresseknappen saknas", "Knappen för att anmäla intresse saknas på sidan. Inget skickades.")
    action, fields = found
    try:
        sent = request(
            client,
            "POST",
            absolute(url, action),
            guard,
            data=fields,
            headers={**_cookie_headers(cookie), "Content-Type": "application/x-www-form-urlencoded"},
            follow_redirects=False,
        )
    except RobotsBlocked:
        return paused("captcha", "Bostadsförmedlingen tillåter inte anropet", "Robots.txt spärrar intresseanmälan. Inget skickades.")
    if captcha(sent.status_code, sent.text):
        return paused("captcha", "Bostadsförmedlingen vill att du tar över", "Sidan visar en kontroll. Vi försöker inte igen.")
    lowered = sent.text.lower()
    if "redan" in lowered and "intresse" in lowered:
        return finished("Redan anmält hos Bostadsförmedlingen", "Du har redan anmält intresse.", "already_applied")
    if sent.status_code >= 400:
        return paused("site_changed", "Intresseanmälan gick inte fram", "Bostadsförmedlingen tog inte emot formuläret. Inget mer skickas.")
    return finished("Intresseanmälan skickad till Bostadsförmedlingen", BINDING + " Anmälningen är skickad.", "applied")


def parse_ads(data) -> list[dict]:
    if not isinstance(data, list):
        return []
    found = []
    for row in data:
        if not isinstance(row, dict) or not row.get("LagenhetId"):
            continue
        found.append(
            {
                "id": f"bf-{row.get('LagenhetId')}",
                "source_id": "bostadsformedlingen",
                "lagenhet_id": str(row.get("LagenhetId")),
                "annons_id": str(row.get("AnnonsId") or ""),
                "address": str(row.get("Gatuadress") or "Bostad"),
                "area": str(row.get("Stadsdel") or ""),
                "city": str(row.get("Kommun") or "Stockholm"),
                "rent": int(row.get("Hyra") or 0),
                "sqm": int(row.get("Yta") or 0),
                "rooms": int(row.get("AntalRum") or 0),
                "floor": int(row.get("Vaning") or 0),
                "landlord": "",
                "queue": str(row.get("Ko") or ""),
                "url": absolute(ORIGIN, str(row.get("Url") or "")),
                "binding": True,
            }
        )
    return found
