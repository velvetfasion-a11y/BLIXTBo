"""Shared HTML checks. Selectors for a site live in that site's module."""

import re
from urllib.parse import urljoin

import httpx

from blixtbo.guard import RobotsBlocked, SiteGuard
from blixtbo.steps import StepResult, paused

CAPTCHA_MARKERS = (
    'class="g-recaptcha"',
    "h-captcha",
    "cf-turnstile",
    "cf-challenge",
    "just a moment",
    "verify you are human",
    "verifiera att du är en människa",
    "säkerhetskontrollen",
    "security check",
)

PASSWORD_MARKERS = ("fel lösenord", "felaktigt lösenord", "incorrect password", "wrong password", "ogiltiga uppgifter", "fel användarnamn")
SESSION_MARKERS = ("sessionen har gått ut", "logga in igen", "session expired", "din session")


def captcha(status: int, text: str) -> bool:
    if status in (403, 429):
        return True
    lowered = text.lower()
    return any(marker in lowered for marker in CAPTCHA_MARKERS)


def classify_html(status: int, text: str) -> str | None:
    if captcha(status, text):
        return "captcha"
    lowered = text.lower()
    if any(marker in lowered for marker in PASSWORD_MARKERS):
        return "password_changed"
    if any(marker in lowered for marker in SESSION_MARKERS) or status in (401, 403):
        return "session_expired"
    return None


def input_values(html: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for tag in re.findall(r"<input\b[^>]*>", html, flags=re.I):
        name = re.search(r'name="([^"]+)"', tag, flags=re.I)
        if not name:
            continue
        value = re.search(r'value="([^"]*)"', tag, flags=re.I)
        found[name.group(1)] = value.group(1) if value else ""
    return found


def has_field(html: str, name: str) -> bool:
    return bool(re.search(rf'name="{re.escape(name)}"', html, flags=re.I))


def form_action(html: str, form_id: str) -> str | None:
    match = re.search(rf'<form\b[^>]*id="{re.escape(form_id)}"[^>]*>', html, flags=re.I)
    if not match:
        match = re.search(r"<form\b[^>]*>", html, flags=re.I)
    if not match:
        return None
    action = re.search(r'action="([^"]*)"', match.group(0), flags=re.I)
    return action.group(1) if action else ""


def request(client: httpx.Client, method: str, url: str, guard: SiteGuard | None = None, **kwargs) -> httpx.Response:
    if guard is not None:
        guard.check(url)
    return client.request(method, url, **kwargs)


def robots_pause(name: str) -> StepResult:
    return paused("captcha", f"{name} tillåter inte anropet", f"Robots.txt på {name} spärrar den här adressen. Inget skickades. Gör steget själv på deras sida.")


def as_result(exc: RobotsBlocked, name: str) -> StepResult:
    return robots_pause(name)


def absolute(base: str, action: str) -> str:
    return urljoin(base, action)
