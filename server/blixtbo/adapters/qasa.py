"""Qasa. Login can be stored. Messages are never sent from here.

The app drafts the text and the user pastes it on Qasa.
"""

import re
from urllib.parse import urlparse

import httpx

from blixtbo.adapters.common import captcha, has_field, request
from blixtbo.guard import RobotsBlocked, SiteGuard
from blixtbo.steps import StepResult, finished, paused

ORIGIN = "https://qasa.com"
LOGIN_PAGE = ORIGIN + "/se/sv/login"
FIND = ORIGIN + "/se/sv/find-home"
ROBOTS = """User-agent: *
Allow: /
Disallow: /*/messages
Disallow: /*/profile
Disallow: /*/id-verification
"""


def login(client: httpx.Client, secret: dict, guard: SiteGuard | None = None) -> StepResult:
    try:
        page = request(client, "GET", LOGIN_PAGE, guard, follow_redirects=False)
    except RobotsBlocked:
        return paused("captcha", "Qasa tillåter inte anropet", "Robots.txt spärrar inloggningen. Inget skickades.")
    if captcha(page.status_code, page.text):
        return paused("captcha", "Qasa vill att du tar över", "Qasa visar en kontrollsida. Logga in själv på qasa.com. Vi skickar inget lösenord dit.")
    if not has_field(page.text, "email") or not has_field(page.text, "password"):
        return paused("site_changed", "Qasa har ändrat inloggningen", "Fälten för e-post och lösenord saknas. Inget skickades.")
    action = re.search(r'<form\b[^>]*action="([^"]*)"', page.text, flags=re.I)
    url = action.group(1) if action and action.group(1) else LOGIN_PAGE
    if url.startswith("/"):
        url = ORIGIN + url
    try:
        sent = request(
            client,
            "POST",
            url,
            guard,
            data={"email": secret.get("username"), "password": secret.get("password")},
            headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": LOGIN_PAGE},
            follow_redirects=False,
        )
    except RobotsBlocked:
        return paused("captcha", "Qasa tillåter inte anropet", "Inget skickades.")
    if captcha(sent.status_code, sent.text):
        return paused("captcha", "Qasa vill att du tar över", "Qasa visar en kontroll. Vi försöker inte igen.")
    lowered = sent.text.lower()
    if sent.status_code in (400, 401) or "fel lösenord" in lowered or "fel e-post" in lowered:
        return paused("password_changed", "Lösenordet hos Qasa stämmer inte", "Kontrollera e-post och lösenord.")
    if "verifiera" in lowered and "e-post" in lowered:
        return paused("needs_email", "Bekräfta e-posten från Qasa", "Öppna mejlet från Qasa och bekräfta adressen.")
    if sent.status_code >= 400:
        return paused("site_changed", "Qasa har ändrat inloggningen", "Svaret gick inte att tolka.")
    return finished("Qasa är kopplat", "Inloggningen hos Qasa fungerar. Meddelanden skickar du själv på Qasa.", "logged_in")


def apply(client: httpx.Client, secret: dict, payload: dict, guard: SiteGuard | None = None, robots_text: str = ROBOTS) -> StepResult:
    """Never POST a message. The app copies a draft and the user sends it."""
    del client, secret, guard, robots_text
    home_id = str(payload.get("qasa_id") or payload.get("object_id") or "")
    link = f"{ORIGIN}/se/sv/home/{home_id}" if home_id else ORIGIN
    return paused(
        "needs_confirmation",
        "Skicka själv på Qasa",
        f"Blixtbo skickar inte meddelanden till Qasa. Kopiera texten i appen och öppna {link}. Klistra in och tryck Skicka.",
    )


def renew(client: httpx.Client, secret: dict, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    return login(client, secret, guard)


def parse_page(text: str, content_type: str = "") -> list[dict]:
    import json

    data = None
    if "json" in content_type or text.lstrip().startswith("{") or text.lstrip().startswith("["):
        try:
            data = json.loads(text)
        except Exception:
            data = None
    if data is None:
        match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', text, flags=re.S)
        if not match:
            return []
        try:
            data = json.loads(match.group(1))
        except Exception:
            return []
    homes = []
    if isinstance(data, dict):
        homes = data.get("homes") or data.get("listings") or []
        props = data.get("props") if isinstance(data.get("props"), dict) else {}
        page_props = props.get("pageProps") if isinstance(props.get("pageProps"), dict) else {}
        homes = homes or page_props.get("homes") or page_props.get("listings") or []
    elif isinstance(data, list):
        homes = data
    found = []
    for row in homes:
        if not isinstance(row, dict) or not row.get("id"):
            continue
        street = str(row.get("street") or row.get("address") or "Bostad")
        found.append(
            {
                "id": f"qasa-{row.get('id')}",
                "source_id": "qasa",
                "qasa_id": str(row.get("id")),
                "address": street,
                "area": str(row.get("area") or ""),
                "city": str(row.get("city") or ""),
                "rent": int(row.get("monthlyCost") or row.get("rent") or 0),
                "sqm": int(row.get("squareMeters") or row.get("sqm") or 0),
                "rooms": int(float(row.get("rooms") or row.get("roomCount") or 1)),
                "floor": int(row.get("floor") or 0),
                "landlord": "Privat hyresvärd",
                "url": str(row.get("url") or f"{ORIGIN}/se/sv/home/{row.get('id')}"),
                "message": True,
            }
        )
    return found


def host_allowed(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host.endswith("qasa.com") or host.endswith("qasa.se")
