"""Uppsala Bostadsförmedling password login and GraphQL apply.

The BankID endpoint under /mypages/api/bankid is never called.
Registration needs a personal identity number, so accounts are not created here.
"""

import httpx

from blixtbo.adapters.common import captcha, request
from blixtbo.guard import RobotsBlocked, SiteGuard
from blixtbo.steps import StepResult, finished, paused

ORIGIN = "https://www.bostad.uppsala.se"
LOGIN = ORIGIN + "/mypages/api/account/login"
ME = ORIGIN + "/mypages/api/account/me"
GRAPH = ORIGIN + "/mypages/api"

APPLY_QUERY = """mutation createApplication($application: CreateApplicationInput!) {
  createApplication(application: $application) { error errorText validationErrors { code text } }
}"""


def _headers(token: str = "") -> dict[str, str]:
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def login(client: httpx.Client, secret: dict, guard: SiteGuard | None = None) -> StepResult:
    body = {"username": secret.get("username"), "password": secret.get("password")}
    try:
        response = request(client, "POST", LOGIN, guard, json=body, headers=_headers())
    except RobotsBlocked:
        return paused("captcha", "Uppsala tillåter inte anropet", "Robots.txt spärrar inloggningen. Inget skickades.")
    if captcha(response.status_code, response.text):
        return paused("captcha", "Uppsala vill att du tar över", "Sidan visar en kontroll. Vi försöker inte igen.")
    if response.status_code in (400, 401, 403):
        return paused("password_changed", "Lösenordet hos Uppsala stämmer inte", "Kontrollera användarnamn och lösenord. Det här är lösenordet till Uppsala, inte BankID.")
    try:
        data = response.json()
    except Exception:
        data = {}
    if not isinstance(data, dict) or not data.get("success"):
        return paused("site_changed", "Uppsala har ändrat inloggningen", "Svaret saknar en bekräftad inloggning. Försöket är pausat.")
    token = str(data.get("token") or "")
    if token:
        secret["token"] = token
    return finished("Uppsala är kopplat", "Inloggningen med lösenord fungerar.", "logged_in")


def _me(client: httpx.Client, secret: dict, guard: SiteGuard | None) -> httpx.Response:
    return request(client, "GET", ME, guard, headers=_headers(str(secret.get("token") or "")))


def apply(client: httpx.Client, secret: dict, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    signed = login(client, secret, guard)
    if not signed.ok:
        return signed
    object_id = payload.get("object_id") or payload.get("listing_id")
    if not object_id:
        return paused("site_changed", "Annonsens id saknas", "Inget skickades till Uppsala.")
    variables = {"application": {"rentalObjectId": int(object_id) if str(object_id).isdigit() else object_id}}
    try:
        response = request(
            client,
            "POST",
            GRAPH,
            guard,
            json={"query": APPLY_QUERY, "variables": variables},
            headers=_headers(str(secret.get("token") or "")),
        )
    except RobotsBlocked:
        return paused("captcha", "Uppsala tillåter inte anropet", "Inget skickades.")
    if captcha(response.status_code, response.text):
        return paused("captcha", "Uppsala vill att du tar över", "Inget mer skickas.")
    if response.status_code in (401, 403):
        return paused("session_expired", "Inloggningen hos Uppsala har gått ut", "Logga in en gång till.")
    try:
        data = response.json()
    except Exception:
        return paused("site_changed", "Uppsala har ändrat ansökan", "Svaret gick inte att läsa.")
    created = ((data.get("data") or {}) if isinstance(data, dict) else {}).get("createApplication") or {}
    if created.get("error"):
        text = str(created.get("errorText") or "")
        lowered = text.lower()
        if "redan" in lowered:
            return finished("Redan anmält hos Uppsala", text or "Du har redan ansökt.", "already_applied")
        if "behörig" in lowered or "inte" in lowered:
            return finished("Inte aktuell hos Uppsala", text or "Uppsala säger att du inte kan söka den här bostaden.", "not_eligible")
        return paused("needs_profile", "Kolla profilen hos Uppsala", text or "Uppsala avvisade ansökan. Kontrollera profilen hos dem.")
    if response.status_code >= 400 or data.get("errors"):
        return paused("site_changed", "Uppsala har ändrat ansökan", "Ansökan gick inte fram. Försöket är pausat.")
    return finished("Intresseanmälan skickad till Uppsala", "Ansökan är skickad hos Uppsala Bostadsförmedling.", "applied")


def renew(client: httpx.Client, secret: dict, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    signed = login(client, secret, guard)
    if not signed.ok:
        return signed
    try:
        me = _me(client, secret, guard)
    except RobotsBlocked:
        return signed
    if me.status_code in (401, 403):
        return paused("session_expired", "Inloggningen hos Uppsala har gått ut", "Logga in en gång till.")
    text = me.text.lower()
    if "förnya" in text or "fornya" in text:
        return paused("needs_profile", "Kön hos Uppsala behöver dig", "Logga in hos Uppsala Bostadsförmedling och förnya kön.")
    return finished("Kön hos Uppsala är kollad", "Sessionen fungerar.", "queue_ok")
