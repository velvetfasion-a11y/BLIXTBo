"""Landlord adapters. Dry-run never opens a network connection.

Live mode calls the site's own JSON API or HTML form through httpx.
Playwright is a fallback only when LANDLORD_BROWSER=1 and the HTTP form
reports that a selector is missing. BankID material is never sent.

A password on Wåhlin, SSSB, Uppsala, Stena, Heimstaden, Rikshem or
Victoriahem is that site's password, not a BankID secret.
"""

import os
from dataclasses import dataclass

import httpx

from blixtbo import adapters
from blixtbo.adapters.common import CAPTCHA_MARKERS
from blixtbo.config import settings
from blixtbo.steps import StepResult, finished, paused

PASSWORD_MARKERS = ("fel lösenord", "felaktigt lösenord", "incorrect password", "wrong password")
SESSION_MARKERS = ("sessionen har gått ut", "logga in igen", "session expired", "din session")

_client_factory = None


def set_client_factory(factory) -> None:
    global _client_factory
    _client_factory = factory


def reset_client_factory() -> None:
    global _client_factory
    _client_factory = None


@dataclass(frozen=True)
class Landlord:
    id: str
    name: str
    login_url: str
    user_sel: str
    pass_sel: str
    submit_sel: str
    requires_bankid: bool
    application_limit: int | None = None
    plus_limit: int | None = None
    plus_price_kr: int | None = None
    plus_url: str = ""
    accepts_password: bool = False
    accepts_cookie: bool = False
    can_create: bool = False
    binding_apply: bool = False
    message_apply: bool = False
    robots_url: str = ""


def _row(**kwargs) -> Landlord:
    return Landlord(**kwargs)


LANDLORDS: dict[str, Landlord] = {
    "homeq": _row(
        id="homeq",
        name="HomeQ",
        login_url="https://www.homeq.se/login",
        user_sel="#signin-email-input",
        pass_sel='input[type=password][aria-label="Lösenord"]',
        submit_sel="button:has-text('Fortsätt')",
        requires_bankid=False,
        application_limit=5,
        plus_limit=10,
        plus_price_kr=349,
        plus_url="https://www.homeq.se/plus",
        accepts_password=True,
        can_create=True,
        robots_url="https://www.homeq.se/robots.txt",
    ),
    "wahlin": _row(
        id="wahlin",
        name="Wåhlin",
        login_url="https://minasidor.wahlinfastigheter.se/mina-sidor/logga-in",
        user_sel="#UserId",
        pass_sel="#Password",
        submit_sel="#LoginForm button",
        requires_bankid=False,
        accepts_password=True,
        accepts_cookie=True,
        robots_url="https://wahlinfastigheter.se/robots.txt",
    ),
    "stena": _row(
        id="stena",
        name="Stena Fastigheter",
        login_url="https://minasidor.stenafastigheter.se/login/",
        user_sel="input[name=username]",
        pass_sel="input[name=password]",
        submit_sel="button[type=submit]",
        requires_bankid=False,
        accepts_password=True,
        accepts_cookie=True,
        robots_url="https://www.stenafastigheter.se/robots.txt",
    ),
    "bostadsformedlingen": _row(
        id="bostadsformedlingen",
        name="Bostadsförmedlingen",
        login_url="https://bostad.stockholm.se/minasidor/login/",
        user_sel="",
        pass_sel="",
        submit_sel="",
        requires_bankid=True,
        accepts_cookie=True,
        binding_apply=True,
        robots_url="https://bostad.stockholm.se/robots.txt",
    ),
    "uppsala": _row(
        id="uppsala",
        name="Uppsala Bostadsförmedling",
        login_url="https://www.bostad.uppsala.se/mypages/app/login",
        user_sel="input[name=username]",
        pass_sel="input[name=password]",
        submit_sel="button[type=submit]",
        requires_bankid=False,
        accepts_password=True,
        accepts_cookie=True,
        robots_url="https://www.bostad.uppsala.se/robots.txt",
    ),
    "sssb": _row(
        id="sssb",
        name="SSSB",
        login_url="https://minasidor.sssb.se/login/",
        user_sel="#user_login",
        pass_sel="#user_pass",
        submit_sel="#loginform button",
        requires_bankid=False,
        accepts_password=True,
        accepts_cookie=True,
        robots_url="https://minasidor.sssb.se/robots.txt",
    ),
    "qasa": _row(
        id="qasa",
        name="Qasa",
        login_url="https://qasa.com/se/sv/login",
        user_sel="input[name=email]",
        pass_sel="input[name=password]",
        submit_sel="button[type=submit]",
        requires_bankid=False,
        accepts_password=True,
        message_apply=True,
        robots_url="https://qasa.com/robots.txt",
    ),
    "heimstaden": _row(
        id="heimstaden",
        name="Heimstaden",
        login_url="https://mitt.heimstaden.com/Account/Login",
        user_sel="#UserId",
        pass_sel="#Password",
        submit_sel="#LoginForm button",
        requires_bankid=False,
        accepts_password=True,
        accepts_cookie=True,
        robots_url="https://heimstaden.com/robots.txt",
    ),
    "rikshem": _row(
        id="rikshem",
        name="Rikshem",
        login_url="https://minasidor.rikshem.se/mina-sidor/logga-in/",
        user_sel="input[name='ctl00$ctl01$DefaultSiteContentPlaceHolder1$Col1$LoginControl1$txtUserID']",
        pass_sel="input[name='ctl00$ctl01$DefaultSiteContentPlaceHolder1$Col1$LoginControl1$txtPassword']",
        submit_sel="input[name='ctl00$ctl01$DefaultSiteContentPlaceHolder1$Col1$LoginControl1$btnLogin']",
        requires_bankid=False,
        accepts_password=True,
        accepts_cookie=True,
        robots_url="https://www.rikshem.se/robots.txt",
    ),
    "victoriahem": _row(
        id="victoriahem",
        name="Victoriahem",
        login_url="https://minasidor.victoriahem.se/Account/Login",
        user_sel="#UserId",
        pass_sel="#Password",
        submit_sel="#LoginForm button",
        requires_bankid=False,
        accepts_password=True,
        accepts_cookie=True,
        robots_url="https://www.victoriahem.se/robots.txt",
    ),
}

# Hembla is the old name. Same Mina sidor as Victoriahem.
LANDLORDS["hembla"] = LANDLORDS["victoriahem"]

SKIPPED = {
    "blocket": "robots.txt på blocket.se förbjuder automatiserad användning utan skriftligt tillstånd.",
    "samtrygg": "robots.txt spärrar /api, /Messages, /Chat och /Profile. Att söka är att boka visning och chatta.",
    "akelius": "rent.akelius.com listar inte svenska städer. Mina sidor är en hyresgästportal, inte en sökkö.",
    "wallenstam": "Annonser och intresseanmälan går via HomeQ. Hyresvärdens namn följer med i HomeQ-svaret.",
    "bostaden": "HomeQ-kopplade hyresvärdar söks och ansöks via HomeQ-adaptern.",
    "svenska-bostader": "Förmedlas i Bostadsförmedlingens kö. Ingen egen inloggning.",
    "familjebostader": "Förmedlas i Bostadsförmedlingens kö. Ingen egen inloggning.",
    "stockholmshem": "Förmedlas i Bostadsförmedlingens kö. Ingen egen inloggning.",
}


def classify_login_text(text: str, http_status: int = 200) -> str | None:
    lowered = text.lower()
    if any(marker in lowered for marker in CAPTCHA_MARKERS) or http_status in (429,):
        return "captcha"
    if any(marker in lowered for marker in PASSWORD_MARKERS):
        return "password_changed"
    if any(marker in lowered for marker in SESSION_MARKERS) or http_status in (401, 403):
        return "session_expired"
    return None


def landlord(source_id: str) -> Landlord | None:
    site = LANDLORDS.get(source_id)
    if site is None and source_id in ("hembla",):
        return LANDLORDS.get("victoriahem")
    return site


def requires_bankid(source_id: str) -> bool:
    site = landlord(source_id)
    return bool(site and site.requires_bankid and not site.accepts_password)


def accepts_password(source_id: str) -> bool:
    site = landlord(source_id)
    return bool(site and site.accepts_password)


def accepts_cookie(source_id: str) -> bool:
    site = landlord(source_id)
    return bool(site and (site.accepts_cookie or site.requires_bankid))


def landlord_name(source_id: str) -> str:
    site = landlord(source_id)
    if site:
        return "Victoriahem" if source_id == "hembla" else site.name
    return source_id


def _client(source_id: str) -> httpx.Client:
    if _client_factory is not None:
        return _client_factory(source_id)
    return httpx.Client(timeout=20.0, follow_redirects=False)


def _needs_confirmation(site: Landlord, payload: dict) -> StepResult | None:
    if not site.binding_apply and not site.message_apply:
        return None
    text = str(payload.get("confirmation") or "")
    if payload.get("confirmed") and text.strip():
        return None
    if site.message_apply:
        return paused(
            "needs_confirmation",
            "Skicka själv på Qasa",
            "Blixtbo skickar inte meddelanden till Qasa. Kopiera texten i appen, öppna annonsen och tryck Skicka.",
        )
    if site.binding_apply:
        return paused(
            "needs_confirmation",
            "Bekräfta intresseanmälan",
            "Intresset blir bindande för den sökande med längst kötid när annonstiden tar slut. Inget skickades.",
        )
    return None


def run_login(source_id: str, secret: dict) -> StepResult:
    site = landlord(source_id)
    if site and site.requires_bankid and not site.accepts_password:
        return paused("needs_bankid", f"BankID behövs hos {site.name}", f"Logga in hos {site.name} på din egen enhet.", bankid=True)
    if settings.landlord_mode != "live":
        return finished("Kopplat", "Dry-run loggar inte in.", "logged_in")
    client = _client(source_id)
    try:
        result = adapters.login(client, source_id, secret)
    finally:
        client.close()
    if result.error == "site_changed":
        browser = _browser_login(source_id, secret)
        if browser is not None:
            return browser
    return result


def run_with_session(source_id: str, cookie: str, kind: str = "apply", payload: dict | None = None) -> StepResult:
    """Continue with the landlord session cookie. Never a BankID credential."""
    site = landlord(source_id)
    payload = payload or {}
    if not cookie or not accepts_cookie(source_id):
        return paused("session_expired", "Sessionen saknas", "Ingen session att använda.")
    if site and (gate := _needs_confirmation(site, payload)) and kind == "apply":
        return gate
    if settings.landlord_mode != "live":
        return finished("Kopplat", "Dry-run använder inte sessionen.", "logged_in")
    client = _client(source_id)
    try:
        return adapters.session(client, source_id, cookie, kind, payload)
    finally:
        client.close()


def create_account(source_id: str, username: str, password: str) -> StepResult:
    site = landlord(source_id)
    if site and site.requires_bankid and not site.accepts_password:
        return paused("needs_bankid", f"BankID behövs hos {site.name}", f"Du skapar kontot hos {site.name} själv.", bankid=True)
    if site and not site.can_create:
        return paused(
            "needs_profile",
            f"Skapa kontot hos {site.name} själv",
            f"Blixtbo skapar inte konto hos {site.name}. Registrera dig där och logga sedan in med ditt befintliga lösenord.",
        )
    if settings.landlord_mode != "live":
        return finished("Konto förberett", "Dry-run skapar inget konto.", "created")
    client = _client(source_id)
    try:
        return adapters.create(client, source_id, username, password)
    finally:
        client.close()


def perform(source_id: str, secret: dict, kind: str, payload: dict | None = None) -> StepResult:
    payload = payload or {}
    site = landlord(source_id)
    if site is None:
        return paused("site_changed", "Okänd hyresvärd", "Den här hyresvärden har ingen adapter.")
    if secret.get("cookie") and not secret.get("password"):
        return run_with_session(source_id, str(secret["cookie"]), kind, payload)
    if kind == "apply" and (gate := _needs_confirmation(site, payload)):
        return gate
    if settings.landlord_mode != "live":
        return finished("Klart", "Dry-run skickar inget.", "applied" if kind == "apply" else "logged_in")
    client = _client(source_id)
    try:
        if kind == "apply":
            return adapters.apply(client, source_id, secret, payload)
        if kind == "renew":
            return adapters.renew(client, source_id, secret, payload)
        return adapters.login(client, source_id, secret)
    finally:
        client.close()


def _browser_login(source_id: str, secret: dict) -> StepResult | None:
    """Last resort for an HTML form whose fields moved. Off unless explicitly enabled."""
    if os.environ.get("LANDLORD_BROWSER") != "1":
        return None
    site = landlord(source_id)
    if site is None or not site.user_sel or not site.accepts_password:
        return None
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(site.login_url, wait_until="domcontentloaded")
        if page.locator(site.user_sel).count() == 0 or page.locator(site.pass_sel).count() == 0:
            browser.close()
            return None
        page.fill(site.user_sel, str(secret.get("username") or ""))
        page.fill(site.pass_sel, str(secret.get("password") or ""))
        page.click(site.submit_sel)
        page.wait_for_timeout(1500)
        error = classify_login_text(page.inner_text("body"))
        browser.close()
    if error:
        return paused(error, "Inloggningen misslyckades", "Sidan svarade inte som en lyckad inloggning.")
    return finished("Inloggad", "Webbläsaren loggade in.", "logged_in")
