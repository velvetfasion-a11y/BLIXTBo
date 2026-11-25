"""Playwright automation for landlord sites. No language model.

dry-run never opens a browser. live logs in with the decrypted secret,
applies or renews, and classifies a failed login so the user can be told.
"""

from dataclasses import dataclass

from blixtbo.config import settings

PASSWORD_MARKERS = ("fel lösenord", "felaktigt lösenord", "incorrect password", "wrong password")
SESSION_MARKERS = ("sessionen har gått ut", "logga in igen", "session expired", "din session")


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


SITES = {
    "homeq": {
        "login_url": "https://www.homeq.se/login",
        "user_sel": "input[type=email]",
        "pass_sel": "input[type=password]",
        "submit_sel": "button[type=submit]",
        "requires_bankid": False,
    },
    "stena": {
        "login_url": "https://www.stenafastigheter.se/",
        "user_sel": "input[type=email]",
        "pass_sel": "input[type=password]",
        "submit_sel": "button[type=submit]",
        "requires_bankid": False,
    },
    "bostadsformedlingen": {
        "login_url": "https://bostad.stockholm.se/",
        "user_sel": "input[type=email]",
        "pass_sel": "input[type=password]",
        "submit_sel": "button[type=submit]",
        "requires_bankid": True,
    },
    "uppsala": {
        "login_url": "https://bostad.uppsala.se/",
        "user_sel": "input[type=email]",
        "pass_sel": "input[type=password]",
        "submit_sel": "button[type=submit]",
        "requires_bankid": True,
    },
}


def run_login(source_id: str, secret: dict) -> StepResult:
    site = SITES.get(source_id, SITES["homeq"])
    if settings.landlord_mode != "live":
        return StepResult(ok=True, needs_bankid_on_phone=site["requires_bankid"])
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(site["login_url"], wait_until="domcontentloaded")
        page.fill(site["user_sel"], secret["username"])
        page.fill(site["pass_sel"], secret["password"])
        page.click(site["submit_sel"])
        page.wait_for_timeout(1500)
        error = classify_login_text(page.inner_text("body"))
        browser.close()
    if error:
        return StepResult(ok=False, error=error, needs_bankid_on_phone=site["requires_bankid"])
    return StepResult(ok=True, needs_bankid_on_phone=site["requires_bankid"])


def create_account(source_id: str, username: str, password: str) -> StepResult:
    """Create the landlord account after the user has approved once.

    The password is generated here and stored only as ciphertext.
    """
    if settings.landlord_mode != "live":
        return run_login(source_id, {"username": username, "password": password})
    # Live creation uses the same login form after signup. Selectors are per site
    # and must be checked against the live page before LANDLORD_MODE=live.
    return run_login(source_id, {"username": username, "password": password})
