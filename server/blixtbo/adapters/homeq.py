"""HomeQ JSON API. Endpoints and the login fields live here."""

import uuid

import httpx

from blixtbo.adapters.common import captcha, request
from blixtbo.guard import RobotsBlocked, SiteGuard
from blixtbo.steps import StepResult, finished, paused

API = "https://api.homeq.se"
LOGIN = "/api/v1/user/profile/login"
VERIFY = "/api/v1/user/token/verify/"
SIGNUP = "/api/v1/user/profile"
APPLY = "/api/v4/applications"
APPLICATIONS = "/api/v4/applications"
SEARCH = "/api/v3/search"
OBJECT = "/api/v1/object/{id}"

# DOM fallback, used only if LANDLORD_BROWSER=1 and the JSON call says the page changed.
USER_SEL = "#signin-email-input"
PASS_SEL = 'input[type=password][aria-label="Lösenord"]'
SUBMIT_SEL = "button:has-text('Fortsätt')"
SIGNUP_EMAIL_SEL = "[data-testid=signupEmailInput]"

ERRORS = {
    "UnexpectedError": ("not_eligible", "HomeQ svarade med ett oväntat fel. Försöket är stoppat."),
    "GroupReachedApplyLimit": ("not_eligible", "Gruppen har nått sin gräns för intresseanmälningar hos HomeQ."),
    "GroupLocked": ("not_eligible", "Gruppen är låst hos HomeQ. Intresseanmälan gick inte att skicka."),
    "IllegalAds": ("not_eligible", "Annonsen är inte öppen för intresseanmälan hos HomeQ."),
    "IncompleteProfile": ("needs_profile", "Fyll i profilen hos HomeQ."),
    "MissingOccupation": ("needs_profile", "Fyll i profilen hos HomeQ. Sysselsättning saknas."),
    "ProjectNotActive": ("not_eligible", "Projektet är inte aktivt hos HomeQ."),
    "AlreadyApplied": ("already_applied", "Du har redan anmält intresse hos HomeQ."),
    "RestrictedForStudents": ("not_eligible", "Annonsen är bara för studenter."),
    "RestrictedForSeniors": ("not_eligible", "Annonsen är bara för seniorer."),
    "RestrictedForYouths": ("not_eligible", "Annonsen är bara för ungdomar."),
    "InactiveAd": ("not_eligible", "Annonsen är inte längre aktiv hos HomeQ."),
    "CoApplicantNotLandlordQueueMember": ("not_eligible", "Medsökande finns inte i hyresvärdens kö."),
    "PendingFellowConnection": ("needs_profile", "En medsökande behöver godkänna kopplingen hos HomeQ."),
}

RESTRICTED = {
    "student": ("not_eligible", "Annonsen är bara för studenter."),
    "senior": ("not_eligible", "Annonsen är bara för seniorer."),
    "youth": ("not_eligible", "Annonsen är bara för ungdomar."),
    "applied": ("already_applied", "Du har redan anmält intresse hos HomeQ."),
    "inactive": ("not_eligible", "Annonsen är inte längre aktiv hos HomeQ."),
}


def _headers(token: str | None = None) -> dict[str, str]:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"JWT {token}"
    return headers


def _json(response: httpx.Response) -> dict:
    try:
        data = response.json()
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _token_from(data: dict) -> str:
    if isinstance(data.get("token"), str):
        return data["token"]
    inner = data.get("data")
    if isinstance(inner, dict) and isinstance(inner.get("token"), str):
        return inner["token"]
    return ""


def _flags(data: dict) -> tuple[bool, bool]:
    info = data.get("data") if isinstance(data.get("data"), dict) else data
    user = info.get("user_info") if isinstance(info, dict) else None
    if not isinstance(user, dict):
        user = info if isinstance(info, dict) else {}
    return bool(user.get("has_verified_email")), bool(user.get("has_kyc_verified"))


def _verification(email_ok: bool, kyc_ok: bool) -> StepResult | None:
    if email_ok and kyc_ok:
        return None
    parts = []
    if not email_ok:
        parts.append("Bekräfta e-posten från HomeQ.")
    if not kyc_ok:
        parts.append("Verifiera dig med BankID hos HomeQ.")
    code = "needs_email" if not email_ok else "needs_identity"
    title = "Bekräfta e-posten från HomeQ" if not email_ok else "Verifiera dig med BankID hos HomeQ"
    return paused(code, title, " ".join(parts) + " Blixtbo ser inte ditt BankID.")


def _map_error(response: httpx.Response) -> StepResult | None:
    if captcha(response.status_code, response.text):
        return paused("captcha", "HomeQ vill att du tar över", "HomeQ visar en kontroll eller captcha. Vi försöker inte igen.")
    if response.status_code in (401,):
        return paused("session_expired", "Inloggningen hos HomeQ har gått ut", "Logga in en gång till hos HomeQ.")
    data = _json(response)
    if response.status_code == 412 or data.get("error") == "RestrictedAds":
        reasons: list[str] = []
        extra = data.get("extra") if isinstance(data.get("extra"), dict) else {}
        for row in extra.get("restricted") or []:
            if isinstance(row, list) and row:
                reasons.append(str(row[-1]).lower())
            elif isinstance(row, str):
                reasons.append(row.lower())
        for reason in reasons:
            if reason in RESTRICTED:
                code, text = RESTRICTED[reason]
                if code == "already_applied":
                    return finished("Redan anmält hos HomeQ", text, "already_applied")
                return finished("Inte aktuell hos HomeQ", text, "not_eligible")
        return finished("Inte aktuell hos HomeQ", "HomeQ släpper inte igenom den här annonsen.", "not_eligible")
    code = str(data.get("error") or "")
    if code in ERRORS:
        mapped, text = ERRORS[code]
        if mapped == "needs_profile":
            return paused("needs_profile", "Fyll i profilen hos HomeQ", text)
        if mapped == "already_applied":
            return finished("Redan anmält hos HomeQ", text, "already_applied")
        return finished("Inte aktuell hos HomeQ", text, "not_eligible")
    if response.status_code >= 400:
        return paused("site_changed", "HomeQ har ändrat svaret", "HomeQ svarade på ett sätt vi inte känner igen. Försöket är pausat.")
    return None


def login(client: httpx.Client, secret: dict, guard: SiteGuard | None = None) -> StepResult:
    try:
        response = request(
            client,
            "POST",
            API + LOGIN,
            guard,
            json={"email": secret.get("username"), "password": secret.get("password")},
            headers=_headers(),
        )
    except RobotsBlocked:
        return paused("captcha", "HomeQ tillåter inte anropet", "Robots.txt spärrar inloggningen. Inget skickades.")
    if captcha(response.status_code, response.text):
        return paused("captcha", "HomeQ vill att du tar över", "HomeQ visar en kontroll eller captcha. Vi försöker inte igen.")
    data = _json(response)
    token = _token_from(data) or str(secret.get("token") or "")
    if response.status_code >= 400 or not token:
        kind = classify_login(response)
        if kind == "captcha":
            return paused("captcha", "HomeQ vill att du tar över", "HomeQ visar en kontroll eller captcha. Vi försöker inte igen.")
        if kind == "password_changed" or response.status_code in (400, 401):
            return paused("password_changed", "Lösenordet hos HomeQ stämmer inte", "Kontrollera e-post och lösenord och spara dem igen.")
        if kind == "session_expired":
            return paused("session_expired", "Inloggningen hos HomeQ har gått ut", "Logga in en gång till hos HomeQ.")
        return paused("site_changed", "HomeQ har ändrat inloggningen", "HomeQ tog inte emot inloggningen. Försöket är pausat.")
    secret["token"] = token
    secret.setdefault("device_id", str(uuid.uuid4()))
    return _after_token(client, token, guard)


def classify_login(response: httpx.Response) -> str | None:
    from blixtbo.adapters.common import classify_html

    text = response.text.lower()
    if response.status_code in (400, 401) or "fel lösenord" in text or "wrong password" in text:
        return "password_changed"
    return classify_html(response.status_code, response.text)


def _after_token(client: httpx.Client, token: str, guard: SiteGuard | None) -> StepResult:
    try:
        checked = request(client, "GET", API + VERIFY, guard, headers=_headers(token))
    except RobotsBlocked:
        return paused("captcha", "HomeQ tillåter inte anropet", "Robots.txt spärrar kontrollen. Inget mer skickades.")
    if captcha(checked.status_code, checked.text):
        return paused("captcha", "HomeQ vill att du tar över", "HomeQ visar en kontroll eller captcha. Vi försöker inte igen.")
    if checked.status_code in (401, 403):
        return paused("session_expired", "Inloggningen hos HomeQ har gått ut", "Logga in en gång till hos HomeQ.")
    waiting = _verification(*_flags(_json(checked)))
    if waiting:
        return waiting
    return finished("HomeQ är kopplat", "E-post och identitet är bekräftade hos HomeQ.", "logged_in")


def keepalive(client: httpx.Client, secret: dict, guard: SiteGuard | None = None) -> StepResult:
    """Login and token check only. No applications list and no apply."""
    try:
        response = request(
            client,
            "POST",
            API + LOGIN,
            guard,
            json={"email": secret.get("username"), "password": secret.get("password")},
            headers=_headers(),
        )
    except RobotsBlocked:
        return paused("captcha", "HomeQ vill att du tar över", "Robots.txt spärrar inloggningen. Inget skickades.")
    except httpx.TransportError:
        return paused("unreachable", "Vi når inte HomeQ just nu", "Vi försöker igen senare.")
    if response.status_code >= 500:
        return paused("unreachable", "Vi når inte HomeQ just nu", "Vi försöker igen senare.")
    if response.status_code == 429:
        return paused("rate_limited", "HomeQ vill att du tar över", "HomeQ ber oss vänta. Vi försöker inte igen nu.")
    if captcha(response.status_code, response.text):
        return paused("captcha", "HomeQ vill att du tar över", "HomeQ visar en kontroll eller captcha. Vi försöker inte igen.")
    data = _json(response)
    token = _token_from(data)
    if response.status_code >= 400 or not token:
        kind = classify_login(response)
        if kind == "captcha":
            return paused("captcha", "HomeQ vill att du tar över", "HomeQ visar en kontroll eller captcha. Vi försöker inte igen.")
        if kind == "password_changed" or response.status_code in (400, 401):
            return paused("password_changed", "Lösenordet hos HomeQ stämmer inte", "Kontrollera e-post och lösenord och spara dem igen.")
        if kind == "session_expired":
            return paused("session_expired", "Inloggningen hos HomeQ har gått ut", "Logga in en gång till hos HomeQ.")
        return paused("site_changed", "HomeQ har ändrat inloggningen", "HomeQ tog inte emot inloggningen. Försöket är pausat.")
    try:
        checked = request(client, "GET", API + VERIFY, guard, headers=_headers(token))
    except RobotsBlocked:
        return paused("captcha", "HomeQ vill att du tar över", "Robots.txt spärrar kontrollen. Inget mer skickades.")
    except httpx.TransportError:
        return paused("unreachable", "Vi når inte HomeQ just nu", "Vi försöker igen senare.")
    if checked.status_code >= 500:
        return paused("unreachable", "Vi når inte HomeQ just nu", "Vi försöker igen senare.")
    if checked.status_code == 429:
        return paused("rate_limited", "HomeQ vill att du tar över", "HomeQ ber oss vänta. Vi försöker inte igen nu.")
    if captcha(checked.status_code, checked.text):
        return paused("captcha", "HomeQ vill att du tar över", "HomeQ visar en kontroll eller captcha. Vi försöker inte igen.")
    if checked.status_code in (401, 403):
        return paused("session_expired", "Inloggningen hos HomeQ har gått ut", "Logga in en gång till hos HomeQ.")
    waiting = _verification(*_flags(_json(checked)))
    if waiting:
        return waiting
    return finished("HomeQ är kollat", "Inloggningen hos HomeQ fungerar.", "queue_ok")


def create(client: httpx.Client, username: str, password: str, guard: SiteGuard | None = None) -> StepResult:
    body = {"email": username, "password": password, "accepted_terms": True}
    try:
        response = request(client, "POST", API + SIGNUP, guard, json=body, headers=_headers())
    except RobotsBlocked:
        return paused("captcha", "HomeQ tillåter inte anropet", "Robots.txt spärrar registreringen. Inget skickades.")
    if captcha(response.status_code, response.text):
        return paused("captcha", "HomeQ vill att du tar över", "HomeQ visar en kontroll eller captcha. Vi försöker inte igen.")
    if response.status_code >= 400 and response.status_code not in (409,):
        return paused("site_changed", "HomeQ har ändrat registreringen", "Kontot skapades inte. Försöket är pausat.")
    secret = {"username": username, "password": password, "device_id": str(uuid.uuid4())}
    return login(client, secret, guard)


def apply(client: httpx.Client, secret: dict, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    signed = login(client, secret, guard)
    if not signed.ok:
        return signed
    object_id = payload.get("object_ad_id")
    if object_id in (None, ""):
        return paused("site_changed", "Annonsens id saknas", "HomeQ-annonsen saknar objectAdId. Inget skickades.")
    body = {
        "entity": {"id": int(object_id), "type": "listing"},
        "homeq_tracking": {"container": "blixtbo", "details": "listing", "position": 0, "source": "blixtbo"},
        "utm": {},
        "device": {"id": secret.get("device_id") or str(uuid.uuid4()), "name": ""},
    }
    try:
        response = request(client, "POST", API + APPLY, guard, json=body, headers=_headers(str(secret.get("token") or "")))
    except RobotsBlocked:
        return paused("captcha", "HomeQ tillåter inte anropet", "Robots.txt spärrar intresseanmälan. Inget skickades.")
    mapped = _map_error(response)
    if mapped:
        return mapped
    return finished("Intresseanmälan skickad till HomeQ", "Ansökan är skickad hos HomeQ.", "applied")


def renew(client: httpx.Client, secret: dict, payload: dict, guard: SiteGuard | None = None) -> StepResult:
    token = str(secret.get("token") or "")
    if token:
        try:
            checked = request(client, "GET", API + VERIFY, guard, headers=_headers(token))
        except RobotsBlocked:
            return paused("captcha", "HomeQ tillåter inte anropet", "Robots.txt spärrar kontrollen.")
        if checked.status_code == 200 and not captcha(checked.status_code, checked.text):
            waiting = _verification(*_flags(_json(checked)))
            if waiting:
                return waiting
            request(client, "GET", API + APPLICATIONS, guard, headers=_headers(token))
            return finished("HomeQ är kollat", "Sessionen hos HomeQ fungerar. Det finns ingen kö att förnya.", "logged_in")
    return login(client, secret, guard)


def search_body(filters: dict) -> dict:
    body: dict = {"exclude_reserved": True, "amount": 24}
    areas = " ".join(filters.get("areas") or []).lower()
    if "göteborg" in areas or "goteborg" in areas:
        center = (57.7089, 11.9746)
    elif "malmö" in areas or "malmo" in areas:
        center = (55.6050, 13.0038)
    elif "uppsala" in areas:
        center = (59.8586, 17.6389)
    else:
        center = (59.3293, 18.0686)
    body["geo_radius"] = {"latitude": center[0], "longitude": center[1], "radius": "50km"}
    return body


def parse_search(data: dict) -> list[dict]:
    rows = data.get("results") or data.get("objects") or data.get("hits") or []
    if isinstance(data.get("object_ad"), dict):
        rows = [data["object_ad"]]
    found = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        ad = row.get("object_ad") if isinstance(row.get("object_ad"), dict) else row
        object_id = ad.get("id") or ad.get("object_ad_id") or row.get("id")
        if object_id in (None, ""):
            continue
        found.append(
            {
                "id": f"homeq-{object_id}",
                "source_id": "homeq",
                "object_ad_id": str(object_id),
                "address": str(ad.get("street") or ad.get("address") or "Bostad"),
                "area": str(ad.get("area") or ad.get("district") or ""),
                "city": str(ad.get("city") or ""),
                "rent": _num(ad.get("rent")),
                "sqm": _num(ad.get("area_size") or ad.get("square_meters") or ad.get("sqm")),
                "rooms": _num(ad.get("rooms") or ad.get("room_count")),
                "floor": _num(ad.get("floor")),
                "landlord": str(ad.get("landlord_company") or ""),
                "url": f"https://www.homeq.se/lagenhet/{object_id}",
            }
        )
    return found


def _num(value) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0
