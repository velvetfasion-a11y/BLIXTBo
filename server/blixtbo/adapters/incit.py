"""Shared password form for Incit Mina sidor: Wåhlin, Heimstaden, Victoriahem.

Registration needs a personal identity number, so Blixtbo never creates these accounts.
BankID on the same page is ignored. Only UserId and Password are posted.
"""

import httpx

from blixtbo.adapters.common import absolute, captcha, classify_html, has_field, input_values, request
from blixtbo.guard import RobotsBlocked, SiteGuard
from blixtbo.steps import StepResult, finished, paused

SITES = {
    "wahlin": {
        "name": "Wåhlin",
        "origin": "https://minasidor.wahlinfastigheter.se",
        "login_path": "/Account/Login",
        "detail": "/ledigt/detalj/id/{object_id}",
    },
    "heimstaden": {
        "name": "Heimstaden",
        "origin": "https://mitt.heimstaden.com",
        "login_path": "/Account/Login",
        "detail": "/ledigt/detalj/id/{object_id}",
    },
    "victoriahem": {
        "name": "Victoriahem",
        "origin": "https://minasidor.victoriahem.se",
        "login_path": "/Account/Login",
        "detail": "/ledigt/detalj/id/{object_id}",
    },
}

USER_FIELD = "UserId"
PASS_FIELD = "Password"
FORM_ID = "LoginForm"


def _site(source_id: str) -> dict:
    return SITES[source_id]


def _login(client: httpx.Client, source_id: str, secret: dict, guard: SiteGuard | None) -> StepResult:
    site = _site(source_id)
    name = site["name"]
    page_url = site["origin"] + site["login_path"]
    try:
        page = request(client, "GET", page_url, guard, follow_redirects=False)
    except RobotsBlocked:
        return paused("captcha", f"{name} tillåter inte anropet", f"Robots.txt spärrar inloggningen hos {name}. Inget skickades.")
    if captcha(page.status_code, page.text):
        return paused("captcha", f"{name} vill att du tar över", f"{name} visar en kontroll. Vi försöker inte igen. Inget lösenord skickades.")
    if not has_field(page.text, USER_FIELD) or not has_field(page.text, PASS_FIELD):
        return paused("site_changed", f"{name} har ändrat inloggningen", "Fälten för användarnamn och lösenord saknas. Inget skickades.")
    fields = input_values(page.text)
    fields[USER_FIELD] = str(secret.get("username") or "")
    fields[PASS_FIELD] = str(secret.get("password") or "")
    fields["RememberMe"] = "false"
    try:
        sent = request(
            client,
            "POST",
            page_url,
            guard,
            data=fields,
            headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": page_url},
            follow_redirects=False,
        )
    except RobotsBlocked:
        return paused("captcha", f"{name} tillåter inte anropet", "Robots.txt spärrar inloggningen. Inget skickades.")
    if captcha(sent.status_code, sent.text):
        return paused("captcha", f"{name} vill att du tar över", f"{name} visar en kontroll efter inloggningen. Vi försöker inte igen.")
    kind = classify_html(sent.status_code, sent.text)
    if kind == "password_changed" or (sent.status_code == 200 and has_field(sent.text, PASS_FIELD) and kind):
        return paused("password_changed", f"Lösenordet hos {name} stämmer inte", f"Kontrollera uppgifterna hos {name} och spara dem igen.")
    if kind == "captcha":
        return paused("captcha", f"{name} vill att du tar över", "Vi försöker inte igen.")
    if sent.status_code in (301, 302, 303, 307, 308):
        loc = (sent.headers.get("location") or "").lower()
        if "login" in loc and "fel" in loc:
            return paused("password_changed", f"Lösenordet hos {name} stämmer inte", f"Kontrollera uppgifterna hos {name}.")
        return finished(f"{name} är kopplat", f"Inloggningen hos {name} fungerar.", "logged_in")
    if sent.status_code == 200 and has_field(sent.text, PASS_FIELD):
        return paused("password_changed", f"Lösenordet hos {name} stämmer inte", f"Kontrollera uppgifterna hos {name} och spara dem igen.")
    if sent.status_code >= 400:
        return paused("site_changed", f"{name} har ändrat inloggningen", "Svaret gick inte att tolka. Försöket är pausat.")
    return finished(f"{name} är kopplat", f"Inloggningen hos {name} fungerar.", "logged_in")


def _apply_page(client: httpx.Client, source_id: str, payload: dict, guard: SiteGuard | None) -> StepResult:
    site = _site(source_id)
    name = site["name"]
    object_id = str(payload.get("object_id") or "")
    raw_url = str(payload.get("listing_url") or "")
    if raw_url:
        url = raw_url
    elif object_id:
        url = site["origin"] + site["detail"].format(object_id=object_id)
    else:
        return paused("site_changed", "Annonsens id saknas", f"Inget skickades till {name}.")
    try:
        page = request(client, "GET", url, guard, follow_redirects=False)
    except RobotsBlocked:
        return paused("captcha", f"{name} tillåter inte anropet", "Robots.txt spärrar annonsen. Inget skickades.")
    if page.status_code in (301, 302, 401, 403) or "logga in" in (page.headers.get("location") or "").lower():
        return paused("session_expired", f"Inloggningen hos {name} har gått ut", f"Logga in en gång till hos {name}.")
    if captcha(page.status_code, page.text):
        return paused("captcha", f"{name} vill att du tar över", "Sidan visar en kontroll. Inget skickades.")
    lowered = page.text.lower()
    if "redan anmält" in lowered or "redan har anmält" in lowered:
        return finished(f"Redan anmält hos {name}", f"Du har redan anmält intresse hos {name}.", "already_applied")
    if "uppfyller inte" in lowered or "inte behörig" in lowered:
        return finished(f"Inte aktuell hos {name}", f"{name} säger att du inte uppfyller kraven.", "not_eligible")
    import re

    match = None
    for block in re.finditer(r"<form\b[^>]*>[\s\S]*?</form>", page.text, flags=re.I):
        if re.search(r"intresse", block.group(0), flags=re.I):
            match = block.group(0)
            break
    if match is None:
        return paused("site_changed", f"Intresseknappen saknas hos {name}", "Formuläret saknas. Inget skickades.")
    action = re.search(r'action="([^"]*)"', match, flags=re.I)
    fields = input_values(match)
    try:
        sent = request(
            client,
            "POST",
            absolute(url, action.group(1) if action else url),
            guard,
            data=fields,
            headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": url},
            follow_redirects=False,
        )
    except RobotsBlocked:
        return paused("captcha", f"{name} tillåter inte anropet", "Robots.txt spärrar intresseanmälan. Inget skickades.")
    if captcha(sent.status_code, sent.text):
        return paused("captcha", f"{name} vill att du tar över", "Vi försöker inte igen.")
    body = sent.text.lower()
    if "redan" in body and "intresse" in body:
        return finished(f"Redan anmält hos {name}", f"Du har redan anmält intresse hos {name}.", "already_applied")
    if "uppfyller inte" in body or "inte behörig" in body:
        return finished(f"Inte aktuell hos {name}", f"{name} säger att du inte uppfyller kraven.", "not_eligible")
    if sent.status_code >= 400:
        return paused("site_changed", f"{name} tog inte emot anmälan", "Försöket är pausat.")
    return finished(f"Intresseanmälan skickad till {name}", f"Ansökan är skickad hos {name}.", "applied")


def login(client: httpx.Client, source_id: str, secret: dict, guard: SiteGuard | None = None) -> StepResult:
    return _login(client, source_id, secret, guard)


def apply(client: httpx.Client, source_id: str, secret: dict, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    signed = _login(client, source_id, secret, guard)
    if not signed.ok:
        return signed
    return _apply_page(client, source_id, payload, guard)


def renew(client: httpx.Client, source_id: str, secret: dict, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    return _login(client, source_id, secret, guard)


def session(client: httpx.Client, source_id: str, cookie: str, kind: str, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    site = _site(source_id)
    name = site["name"]
    client.headers["Cookie"] = cookie
    if kind == "apply":
        return _apply_page(client, source_id, payload, guard)
    try:
        page = request(client, "GET", site["origin"] + site["login_path"], guard, follow_redirects=False)
    except RobotsBlocked:
        return paused("captcha", f"{name} tillåter inte anropet", "Inget skickades.")
    if page.status_code in (401, 403) or "logga in" in (page.headers.get("location") or "").lower():
        return paused("session_expired", f"Inloggningen hos {name} har gått ut", f"Logga in en gång till hos {name}.")
    return finished(f"{name} är kopplat", "Sessionen fungerar.", "logged_in")
