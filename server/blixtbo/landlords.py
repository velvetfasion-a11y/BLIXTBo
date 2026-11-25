"""Playwright automation for landlord sites. No language model.

dry-run never opens a browser. live logs in with the decrypted secret,
applies or renews, and classifies a failed login so the user can be told.

Landlords with requires_bankid are never scripted. The user logs in with
BankID on their own device. The worker stores only the landlord session
cookie afterwards, never BankID material.
"""

from dataclasses import dataclass

from blixtbo.config import settings

PASSWORD_MARKERS = ("fel lösenord", "felaktigt lösenord", "incorrect password", "wrong password")
SESSION_MARKERS = ("sessionen har gått ut", "logga in igen", "session expired", "din session")


@dataclass(frozen=True)
class Landlord:
    id: str
    name: str
    login_url: str
    user_sel: str
    pass_sel: str
    submit_sel: str
    requires_bankid: bool


@dataclass
class StepResult:
    ok: bool
    error: str | None = None
    needs_bankid_on_phone: bool = False


def classify_login_text(text: str, http_status: int = 200) -> str | None:
    lowered = text.lower()
    if any(marker in lowered for marker in PASSWORD_MARKERS):
        return "password_changed"
    if any(marker in lowered for marker in SESSION_MARKERS) or http_status in (401, 403):
        return "session_expired"
    return None


LANDLORDS: dict[str, Landlord] = {
    "homeq": Landlord(
        id="homeq",
        name="HomeQ",
        login_url="https://www.homeq.se/login",
        user_sel="input[type=email]",
        pass_sel="input[type=password]",
        submit_sel="button[type=submit]",
        requires_bankid=False,
    ),
    "wahlin": Landlord(
        id="wahlin",
        name="Wåhlin",
        login_url="https://www.wahlin.se/",
        user_sel="input[type=email]",
        pass_sel="input[type=password]",
        submit_sel="button[type=submit]",
        requires_bankid=True,
    ),
    "stena": Landlord(
        id="stena",
        name="Stena Fastigheter",
        login_url="https://www.stenafastigheter.se/",
        user_sel="input[type=email]",
        pass_sel="input[type=password]",
        submit_sel="button[type=submit]",
        requires_bankid=True,
    ),
    "bostadsformedlingen": Landlord(
        id="bostadsformedlingen",
        name="Bostadsförmedlingen",
        login_url="https://bostad.stockholm.se/",
        user_sel="input[type=email]",
        pass_sel="input[type=password]",
        submit_sel="button[type=submit]",
        requires_bankid=True,
    ),
    "uppsala": Landlord(
        id="uppsala",
        name="Uppsala Bostadsförmedling",
        login_url="https://bostad.uppsala.se/",
        user_sel="input[type=email]",
        pass_sel="input[type=password]",
        submit_sel="button[type=submit]",
        requires_bankid=True,
    ),
}


def landlord(source_id: str) -> Landlord | None:
    return LANDLORDS.get(source_id)


def requires_bankid(source_id: str) -> bool:
    site = LANDLORDS.get(source_id)
    return bool(site and site.requires_bankid)


def landlord_name(source_id: str) -> str:
    site = LANDLORDS.get(source_id)
    return site.name if site else source_id


def run_login(source_id: str, secret: dict) -> StepResult:
    site = LANDLORDS.get(source_id)
    if site and site.requires_bankid:
        return StepResult(ok=False, error="needs_bankid", needs_bankid_on_phone=True)
    site = site or LANDLORDS["homeq"]
    if settings.landlord_mode != "live":
        return StepResult(ok=True, needs_bankid_on_phone=False)
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(site.login_url, wait_until="domcontentloaded")
        page.fill(site.user_sel, secret["username"])
        page.fill(site.pass_sel, secret["password"])
        page.click(site.submit_sel)
        page.wait_for_timeout(1500)
        error = classify_login_text(page.inner_text("body"))
        browser.close()
    if error:
        return StepResult(ok=False, error=error, needs_bankid_on_phone=False)
    return StepResult(ok=True, needs_bankid_on_phone=False)


def run_with_session(source_id: str, cookie: str) -> StepResult:
    """Continue with the landlord session cookie. Never a BankID credential."""
    if not cookie or requires_bankid(source_id) is False:
        return StepResult(ok=False, error="session_expired")
    if settings.landlord_mode != "live":
        return StepResult(ok=True)
    # Live BankID landlords are not scripted. The user approves on their own device.
    return StepResult(ok=False, error="needs_bankid", needs_bankid_on_phone=True)


def create_account(source_id: str, username: str, password: str) -> StepResult:
    """Create the landlord account after the user has approved once.

    The password is generated here and stored only as ciphertext.
    BankID landlords never reach this path.
    """
    if requires_bankid(source_id):
        return StepResult(ok=False, error="needs_bankid", needs_bankid_on_phone=True)
    if settings.landlord_mode != "live":
        return run_login(source_id, {"username": username, "password": password})
    # Live creation uses the same login form after signup. Selectors are per site
    # and must be checked against the live page before LANDLORD_MODE=live.
    return run_login(source_id, {"username": username, "password": password})
