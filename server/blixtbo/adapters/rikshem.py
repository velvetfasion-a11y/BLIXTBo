"""Rikshem password tab. BankID buttons on the same page are never used.

The username field is the site's own login id. It is stored as username, never as a BankID field.
"""

import re

import httpx

from blixtbo.adapters.common import absolute, captcha, classify_html, input_values, request
from blixtbo.guard import RobotsBlocked, SiteGuard
from blixtbo.steps import StepResult, finished, paused

ORIGIN = "https://minasidor.rikshem.se"
LOGIN = ORIGIN + "/mina-sidor/logga-in/"
USER_FIELD = "ctl00$ctl01$DefaultSiteContentPlaceHolder1$Col1$LoginControl1$txtUserID"
PASS_FIELD = "ctl00$ctl01$DefaultSiteContentPlaceHolder1$Col1$LoginControl1$txtPassword"
SUBMIT_FIELD = "ctl00$ctl01$DefaultSiteContentPlaceHolder1$Col1$LoginControl1$btnLogin"


def _post_login(client: httpx.Client, secret: dict, guard: SiteGuard | None, *, keepalive: bool = False) -> StepResult:
    try:
        page = request(client, "GET", LOGIN, guard, follow_redirects=False)
    except RobotsBlocked:
        return paused("captcha", "Rikshem tillåter inte anropet", "Robots.txt spärrar inloggningen. Inget skickades.")
    if keepalive and page.status_code >= 500:
        return paused("unreachable", "Vi når inte Rikshem just nu", "Vi försöker igen senare.")
    if keepalive and page.status_code == 429:
        return paused("rate_limited", "Rikshem vill att du tar över", "Rikshem ber oss vänta. Vi försöker inte igen nu.")
    if captcha(page.status_code, page.text):
        return paused("captcha", "Rikshem vill att du tar över", "Rikshem visar en kontroll. Vi försöker inte igen.")
    if USER_FIELD not in page.text or PASS_FIELD not in page.text:
        return paused("site_changed", "Rikshem har ändrat inloggningen", "Lösenordsfälten saknas. Inget skickades.")
    fields = input_values(page.text)
    fields[USER_FIELD] = str(secret.get("username") or "")
    fields[PASS_FIELD] = str(secret.get("password") or "")
    fields[SUBMIT_FIELD] = "Logga in"
    for blocked in ("btnBankId", "hdnToken", "txtPersno"):
        for key in list(fields):
            if blocked.lower() in key.lower():
                fields.pop(key, None)
    try:
        sent = request(
            client,
            "POST",
            LOGIN,
            guard,
            data=fields,
            headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": LOGIN},
            follow_redirects=False,
        )
    except RobotsBlocked:
        return paused("captcha", "Rikshem tillåter inte anropet", "Inget skickades.")
    if keepalive and sent.status_code >= 500:
        return paused("unreachable", "Vi når inte Rikshem just nu", "Vi försöker igen senare.")
    if keepalive and sent.status_code == 429:
        return paused("rate_limited", "Rikshem vill att du tar över", "Rikshem ber oss vänta. Vi försöker inte igen nu.")
    if captcha(sent.status_code, sent.text):
        return paused("captcha", "Rikshem vill att du tar över", "Vi försöker inte igen.")
    kind = classify_html(sent.status_code, sent.text)
    if kind == "password_changed" or (sent.status_code == 200 and PASS_FIELD in sent.text and "fel" in sent.text.lower()):
        return paused("password_changed", "Lösenordet hos Rikshem stämmer inte", "Kontrollera uppgifterna och spara dem igen.")
    if sent.status_code in (301, 302, 303, 307, 308) and "logga-in" not in (sent.headers.get("location") or "").lower():
        return finished("Rikshem är kopplat", "Inloggningen hos Rikshem fungerar.", "logged_in")
    if sent.status_code == 200 and PASS_FIELD in sent.text:
        return paused("password_changed", "Lösenordet hos Rikshem stämmer inte", "Kontrollera uppgifterna och spara dem igen.")
    if sent.status_code >= 400:
        return paused("site_changed", "Rikshem har ändrat inloggningen", "Svaret gick inte att tolka.")
    return finished("Rikshem är kopplat", "Inloggningen hos Rikshem fungerar.", "logged_in")


def login(client: httpx.Client, secret: dict, guard: SiteGuard | None = None) -> StepResult:
    return _post_login(client, secret, guard)


def apply(client: httpx.Client, secret: dict, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    signed = _post_login(client, secret, guard)
    if not signed.ok:
        return signed
    url = str(payload.get("listing_url") or "")
    object_id = str(payload.get("object_id") or "")
    if not url and object_id:
        url = f"{ORIGIN}/ledigt/detalj/id/{object_id}"
    if not url:
        return paused("site_changed", "Annonsens adress saknas", "Inget skickades till Rikshem.")
    try:
        page = request(client, "GET", url, guard, follow_redirects=False)
    except RobotsBlocked:
        return paused("captcha", "Rikshem tillåter inte anropet", "Inget skickades.")
    if captcha(page.status_code, page.text):
        return paused("captcha", "Rikshem vill att du tar över", "Inget skickades.")
    lowered = page.text.lower()
    if "redan anmält" in lowered:
        return finished("Redan anmält hos Rikshem", "Du har redan anmält intresse.", "already_applied")
    if "uppfyller inte" in lowered or "inte behörig" in lowered:
        return finished("Inte aktuell hos Rikshem", "Rikshem säger att du inte uppfyller kraven.", "not_eligible")
    if "stockholms" in lowered and "bostadsförmedlingen" in lowered and "intresse" not in lowered:
        return finished("Söks via Bostadsförmedlingen", "Den här bostaden förmedlas via Bostadsförmedlingen, inte på Rikshems egen sida.", "not_eligible")
    form = None
    for block in re.finditer(r"<form\b[^>]*>[\s\S]*?</form>", page.text, flags=re.I):
        if re.search(r"intresse", block.group(0), flags=re.I):
            form = block.group(0)
            break
    if form is None:
        return paused("site_changed", "Intresseknappen saknas hos Rikshem", "Inget skickades.")
    action = re.search(r'action="([^"]*)"', form, flags=re.I)
    try:
        sent = request(
            client,
            "POST",
            absolute(url, action.group(1) if action else url),
            guard,
            data=input_values(form),
            headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": url},
            follow_redirects=False,
        )
    except RobotsBlocked:
        return paused("captcha", "Rikshem tillåter inte anropet", "Inget skickades.")
    if captcha(sent.status_code, sent.text):
        return paused("captcha", "Rikshem vill att du tar över", "Vi försöker inte igen.")
    if sent.status_code >= 400:
        return paused("site_changed", "Rikshem tog inte emot anmälan", "Försöket är pausat.")
    return finished("Intresseanmälan skickad till Rikshem", "Ansökan är skickad hos Rikshem.", "applied")


def keepalive(client: httpx.Client, secret: dict, guard: SiteGuard | None = None) -> StepResult:
    """Login, then GET /mina-sidor/. A renewal reminder becomes a notice, never an action."""
    signed = _post_login(client, secret, guard, keepalive=True)
    if not signed.ok:
        return signed
    try:
        page = request(client, "GET", ORIGIN + "/mina-sidor/", guard, follow_redirects=False)
    except RobotsBlocked:
        return paused("captcha", "Rikshem vill att du tar över", "Robots.txt spärrar sidan. Inget mer skickades.")
    except httpx.TransportError:
        return paused("unreachable", "Vi når inte Rikshem just nu", "Vi försöker igen senare.")
    if page.status_code >= 500:
        return paused("unreachable", "Vi når inte Rikshem just nu", "Vi försöker igen senare.")
    if page.status_code == 429:
        return paused("rate_limited", "Rikshem vill att du tar över", "Rikshem ber oss vänta. Vi försöker inte igen nu.")
    if captcha(page.status_code, page.text):
        return paused("captcha", "Rikshem vill att du tar över", "Rikshem visar en kontroll. Vi försöker inte igen.")
    lowered = page.text.lower()
    if "36 månader" in lowered or ("förnya" in lowered and "kö" in lowered):
        return finished(
            "Kön hos Rikshem behöver en titt",
            "Rikshem visar en påminnelse om kön. Logga in själv om du vill förnya. Blixtbo gör inte det åt dig.",
            "queue_action",
        )
    return finished("Rikshem är kollat", "Inloggningen hos Rikshem fungerar.", "queue_ok")


def renew(client: httpx.Client, secret: dict, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    signed = _post_login(client, secret, guard)
    if not signed.ok:
        return signed
    try:
        page = request(client, "GET", ORIGIN + "/mina-sidor/", guard, follow_redirects=False)
    except RobotsBlocked:
        return signed
    if "36 månader" in page.text.lower() or "förnya" in page.text.lower() and "kö" in page.text.lower():
        return paused("needs_profile", "Logga in hos Rikshem", "Poängen kräver att du loggar in hos Rikshem. Gör det själv om påminnelsen syns.")
    return signed
