"""SSSB WordPress password login. Student housing only.

The username is whatever the member types. The public form labels it as a personal identity number,
but it is stored only as username. reCAPTCHA responses pause the job. We never solve them.
"""

import re

import httpx

from blixtbo.adapters.common import absolute, captcha, has_field, request
from blixtbo.guard import RobotsBlocked, SiteGuard
from blixtbo.steps import StepResult, finished, paused

ORIGIN = "https://minasidor.sssb.se"
LOGIN_PAGE = ORIGIN + "/login/"
LOGIN_POST = ORIGIN + "/wp-login.php"
WIDGETS = ORIGIN + "/widgets/"

USER_FIELD = "log"
PASS_FIELD = "pwd"


def _headers(cookie: str = "") -> dict[str, str]:
    headers = {"Accept": "text/html"}
    if cookie:
        headers["Cookie"] = cookie
    return headers


def login(client: httpx.Client, secret: dict, guard: SiteGuard | None = None) -> StepResult:
    try:
        page = request(client, "GET", LOGIN_PAGE, guard, follow_redirects=False)
    except RobotsBlocked:
        return paused("captcha", "SSSB tillåter inte anropet", "Robots.txt spärrar inloggningen. Inget skickades.")
    if captcha(page.status_code, page.text):
        return paused("captcha", "SSSB vill att du tar över", "SSSB visar en kontroll. Logga in själv och klistra in sessionen. Vi försöker inte igen.")
    if not has_field(page.text, USER_FIELD) or not has_field(page.text, PASS_FIELD):
        return paused("site_changed", "SSSB har ändrat inloggningen", "Fälten log och pwd saknas. Inget skickades.")
    form = {
        USER_FIELD: str(secret.get("username") or ""),
        PASS_FIELD: str(secret.get("password") or ""),
        "redirect_to": ORIGIN,
    }
    try:
        sent = request(
            client,
            "POST",
            LOGIN_POST,
            guard,
            data=form,
            headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": LOGIN_PAGE},
            follow_redirects=False,
        )
    except RobotsBlocked:
        return paused("captcha", "SSSB tillåter inte anropet", "Inget skickades.")
    if captcha(sent.status_code, sent.text):
        return paused("captcha", "SSSB vill att du tar över", "SSSB visar en kontroll efter inloggningen. Vi försöker inte igen.")
    lowered = sent.text.lower()
    if "felaktigt" in lowered or "incorrect" in lowered or "ogiltigt" in lowered:
        return paused("password_changed", "Lösenordet hos SSSB stämmer inte", "Kontrollera användarnamn och lösenord.")
    if sent.status_code in (301, 302, 303, 307, 308):
        loc = (sent.headers.get("location") or "").lower()
        if "wp-login" in loc or "login" in loc and "fel" in loc:
            return paused("password_changed", "Lösenordet hos SSSB stämmer inte", "Kontrollera användarnamn och lösenord.")
        return finished("SSSB är kopplat", "Inloggningen hos SSSB fungerar.", "logged_in")
    if sent.status_code == 200 and has_field(sent.text, PASS_FIELD):
        return paused("password_changed", "Lösenordet hos SSSB stämmer inte", "Kontrollera användarnamn och lösenord.")
    if sent.status_code >= 400:
        return paused("site_changed", "SSSB har ändrat inloggningen", "Svaret gick inte att tolka.")
    return finished("SSSB är kopplat", "Inloggningen hos SSSB fungerar.", "logged_in")


def _interest(client: httpx.Client, payload: dict, guard: SiteGuard | None, cookie: str = "") -> StepResult:
    refid = str(payload.get("refid") or "")
    url = str(payload.get("listing_url") or "")
    if not url and refid:
        url = f"{ORIGIN}/lediga-bostader/lagenhet/?refid={refid}"
    if not url:
        return paused("site_changed", "Annonsens id saknas", "SSSB-annonsen saknar refid. Inget skickades.")
    try:
        page = request(client, "GET", url, guard, headers=_headers(cookie), follow_redirects=False)
    except RobotsBlocked:
        return paused("captcha", "SSSB tillåter inte anropet", "Inget skickades.")
    if page.status_code in (401, 403) or "wp-login" in (page.headers.get("location") or ""):
        return paused("session_expired", "Inloggningen hos SSSB har gått ut", "Logga in en gång till.")
    if captcha(page.status_code, page.text):
        return paused("captcha", "SSSB vill att du tar över", "Inget skickades.")
    lowered = page.text.lower()
    if "intyg" in lowered and ("saknas" in lowered or "ladda upp" in lowered):
        return paused("needs_profile", "Ladda upp intyg hos SSSB", "SSSB vill ha studentintyg innan du kan anmäla intresse. Gör det själv på Mina sidor.")
    if "inte behörig" in lowered or "uppfyller inte" in lowered or "endast studenter" in lowered or "not eligible" in lowered:
        return finished("Inte aktuell hos SSSB", "SSSB säger att du inte är behörig. Studentbostäder kräver studier som ger CSN.", "not_eligible")
    if "redan" in lowered and "intresse" in lowered:
        return finished("Redan anmält hos SSSB", "Du har redan anmält intresse.", "already_applied")
    form = None
    for block in re.finditer(r"<form\b[^>]*>[\s\S]*?</form>", page.text, flags=re.I):
        if re.search(r"intresse", block.group(0), flags=re.I):
            form = block.group(0)
            break
    if form is None:
        return paused("site_changed", "Intresseknappen saknas hos SSSB", "Inget skickades.")
    action = re.search(r'action="([^"]*)"', form, flags=re.I)
    from blixtbo.adapters.common import input_values

    try:
        sent = request(
            client,
            "POST",
            absolute(url, action.group(1) if action else url),
            guard,
            data=input_values(form),
            headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": url, **_headers(cookie)},
            follow_redirects=False,
        )
    except RobotsBlocked:
        return paused("captcha", "SSSB tillåter inte anropet", "Inget skickades.")
    if captcha(sent.status_code, sent.text):
        return paused("captcha", "SSSB vill att du tar över", "Vi försöker inte igen.")
    if "inte behörig" in sent.text.lower() or "endast student" in sent.text.lower():
        return finished("Inte aktuell hos SSSB", "SSSB säger att du inte är behörig.", "not_eligible")
    if sent.status_code >= 400:
        return paused("site_changed", "SSSB tog inte emot anmälan", "Försöket är pausat.")
    return finished("Intresseanmälan skickad till SSSB", "Ansökan är skickad hos SSSB.", "applied")


def apply(client: httpx.Client, secret: dict, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    if secret.get("cookie") and not secret.get("password"):
        return _interest(client, payload, guard, cookie=str(secret.get("cookie")))
    signed = login(client, secret, guard)
    if not signed.ok:
        return signed
    return _interest(client, payload, guard)


def renew(client: httpx.Client, secret: dict, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    return login(client, secret, guard)


def session(client: httpx.Client, cookie: str, kind: str, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    if kind == "apply":
        return _interest(client, payload, guard, cookie=cookie)
    try:
        page = request(client, "GET", ORIGIN + "/lediga-bostader/", guard, headers=_headers(cookie), follow_redirects=False)
    except RobotsBlocked:
        return paused("captcha", "SSSB tillåter inte anropet", "Inget skickades.")
    if page.status_code in (401, 403) or "wp-login" in (page.headers.get("location") or ""):
        return paused("session_expired", "Inloggningen hos SSSB har gått ut", "Logga in en gång till.")
    return finished("SSSB är kopplat", "Sessionen fungerar.", "logged_in")


def parse_widgets(text: str) -> list[dict]:
    raw = text.strip()
    if raw.startswith("{") or raw.startswith("["):
        import json

        data = json.loads(raw)
    else:
        match = re.search(r"\((\{.*\})\)\s*;?\s*$", raw, flags=re.S)
        if not match:
            return []
        import json

        data = json.loads(match.group(1))
    rows = data.get("lagenheter") if isinstance(data, dict) else data
    found = []
    for row in rows or []:
        if not isinstance(row, dict) or not row.get("refid"):
            continue
        found.append(
            {
                "id": f"sssb-{row.get('refid')}",
                "source_id": "sssb",
                "refid": str(row.get("refid")),
                "address": str(row.get("adress") or row.get("address") or "Studentbostad"),
                "area": str(row.get("omrade") or ""),
                "city": str(row.get("stad") or "Stockholm"),
                "rent": int(row.get("hyra") or 0),
                "sqm": int(row.get("yta") or 0),
                "rooms": int(row.get("rum") or 1),
                "floor": int(row.get("vaning") or 0),
                "landlord": "SSSB",
                "url": f"{ORIGIN}/lediga-bostader/lagenhet/?refid={row.get('refid')}",
            }
        )
    return found
