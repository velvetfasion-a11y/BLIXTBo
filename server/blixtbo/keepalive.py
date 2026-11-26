"""Daily keep-alive for paying users. Login plus one read, or a fee reminder.

Qasa, Akelius and Bostadsförmedlingen are never called. A captcha, 403 or 429
stops the run. BankID and queue fees are never performed here.
"""

import json
import logging
import os
import random
import time
from dataclasses import dataclass
from datetime import date, datetime, time as dtime, timedelta, timezone
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy.orm import Session

from blixtbo import adapters, crypto, landlords, mailer
from blixtbo.adapters.incit import SITES
from blixtbo.config import settings
from blixtbo.guard import SiteGuard
from blixtbo.models import AuditLog, Job, LandlordLogin, Notice, User
from blixtbo.outcomes import notice as outcome_notice
from blixtbo.readonly import ForbiddenRequest, ReadOnlyClient, allowlist, canonical_source
from blixtbo.steps import StepResult, finished, paused

log = logging.getLogger("blixtbo.keepalive")

STOCKHOLM = ZoneInfo("Europe/Stockholm")
HOST_GAP_SECONDS = 20
ATTEMPT_CAP = 3
MAIL_ACTION = "keepalive_mail"
SUCCESS_CODES = frozenset({"queue_ok", "logged_in", "queue_action"})
TRANSIENT_CODES = frozenset({"unreachable", "timeout", "network"})
CAPTCHA_CODES = frozenset({"captcha", "rate_limited"})
STOP_CODES = frozenset(
    {"password_changed", "session_expired", "needs_identity", "needs_email", "site_changed", "parked", "needs_profile"}
)
EMAIL_CODES = frozenset(
    {
        "password_changed",
        "session_expired",
        "needs_bankid",
        "needs_identity",
        "needs_email",
        "site_changed",
        "captcha",
        "rate_limited",
        "parked",
        "needs_profile",
        "premium_stopped",
        "fee_30",
        "fee_14",
        "fee_3",
        "fee_0",
        "fee_overdue",
        "fee_prompt",
        "fee_prompt_again",
        "queue_action",
    }
)
ZERO_CALLS = frozenset({"qasa", "akelius", "bostadsformedlingen", "boplats", "boplatssyd", "wallenstam"})
_MONTHS = (
    "januari",
    "februari",
    "mars",
    "april",
    "maj",
    "juni",
    "juli",
    "augusti",
    "september",
    "oktober",
    "november",
    "december",
)
_cache: dict[str, tuple[float, bool]] = {}
_host_next: dict[str, float] = {}


@dataclass(frozen=True)
class Keepalive:
    strategy: str
    interval_h: int = 24
    max_age_days: int | None = None
    fee_period_days: int | None = None
    grace_days: int | None = None
    verified: bool = True
    deadline_sv: str = ""
    name: str = ""


@dataclass(frozen=True)
class LandlordLinks:
    """Public pages. The app opens these; it never pays or signs BankID."""

    login: str
    account: str
    payment: str


@dataclass(frozen=True)
class Action:
    label: str
    href: str
    secondary_label: str = ""
    secondary_href: str = ""


# HomeQ's own terms say the account is personal and the password must not be shared.
# Julia accepted real logins for paying users. A terms block is still possible.
KEEPALIVE: dict[str, Keepalive] = {
    "homeq": Keepalive("login_read", max_age_days=540, deadline_sv="18 månader", name="HomeQ"),
    "heimstaden": Keepalive("login_read", max_age_days=180, deadline_sv="6 månader", name="Heimstaden"),
    "victoriahem": Keepalive("login_read", max_age_days=365, deadline_sv="12 månader", name="Victoriahem"),
    "wahlin": Keepalive("login_read", max_age_days=365, deadline_sv="1 år", name="Wåhlin"),
    "rikshem": Keepalive("login_read", max_age_days=365, deadline_sv="12 månader", name="Rikshem"),
    "sssb": Keepalive("login_read", deadline_sv="medlemskapet", name="SSSB"),
    "uppsala": Keepalive("fee_reminder", fee_period_days=365, grace_days=60, deadline_sv="60 dagar", name="Uppsala Bostadsförmedling"),
    "bostadsformedlingen": Keepalive(
        "fee_reminder", fee_period_days=365, grace_days=150, deadline_sv="5 månader", name="Bostadsförmedlingen"
    ),
    "boplatssyd": Keepalive("fee_reminder", fee_period_days=365, grace_days=60, deadline_sv="60 dagar", name="Boplats Syd"),
    "boplats": Keepalive("fee_reminder", fee_period_days=365, verified=False, name="Boplats Göteborg"),
    "stena": Keepalive("none", name="Stena Fastigheter"),
    "akelius": Keepalive("none", name="Akelius"),
    "qasa": Keepalive("none", name="Qasa"),
    "wallenstam": Keepalive("via:homeq", deadline_sv="18 månader", name="Wallenstam"),
}

LANDLORD_URLS: dict[str, LandlordLinks] = {
    "homeq": LandlordLinks("https://www.homeq.se/login", "https://www.homeq.se/login", "https://www.homeq.se/login"),
    "heimstaden": LandlordLinks("https://mitt.heimstaden.com/Account/Login", "https://mitt.heimstaden.com/", "https://mitt.heimstaden.com/"),
    "victoriahem": LandlordLinks(
        "https://minasidor.victoriahem.se/Account/Login",
        "https://minasidor.victoriahem.se/",
        "https://minasidor.victoriahem.se/",
    ),
    "wahlin": LandlordLinks(
        "https://minasidor.wahlinfastigheter.se/Account/Login",
        "https://minasidor.wahlinfastigheter.se/",
        "https://minasidor.wahlinfastigheter.se/",
    ),
    "rikshem": LandlordLinks(
        "https://minasidor.rikshem.se/mina-sidor/logga-in/",
        "https://minasidor.rikshem.se/mina-sidor/",
        "https://minasidor.rikshem.se/mina-sidor/",
    ),
    "uppsala": LandlordLinks(
        "https://www.bostad.uppsala.se/mypages/app/login",
        "https://www.bostad.uppsala.se/mypages/app/login",
        "https://www.bostad.uppsala.se/mypages/app/login",
    ),
    "bostadsformedlingen": LandlordLinks(
        "https://bostad.stockholm.se/minasidor/login/",
        "https://bostad.stockholm.se/minasidor/login/",
        "https://bostad.stockholm.se/minasidor/login/",
    ),
    "boplatssyd": LandlordLinks("https://www.boplatssyd.se/mina-sidor", "https://www.boplatssyd.se/", "https://www.boplatssyd.se/mina-sidor"),
    "boplats": LandlordLinks("https://www.boplats.se/mina-sidor", "https://www.boplats.se/", "https://www.boplats.se/mina-sidor"),
    "sssb": LandlordLinks("https://minasidor.sssb.se/login/", "https://minasidor.sssb.se/lediga-bostader/", "https://minasidor.sssb.se/login/"),
    "stena": LandlordLinks(
        "https://minasidor.stenafastigheter.se/login/",
        "https://minasidor.stenafastigheter.se/",
        "https://minasidor.stenafastigheter.se/",
    ),
    "wallenstam": LandlordLinks("https://www.homeq.se/login", "https://www.homeq.se/login", "https://www.homeq.se/login"),
    "qasa": LandlordLinks("https://qasa.com/se/sv/login", "https://qasa.com/se/sv/login", "https://qasa.com/se/sv/login"),
    "akelius": LandlordLinks("https://www.akelius.com/", "https://www.akelius.com/", "https://www.akelius.com/"),
}


class EntitlementUnavailable(Exception):
    pass


def canonical(source_id: str) -> str:
    return canonical_source(source_id)


def spec_for(source_id: str) -> Keepalive | None:
    return KEEPALIVE.get(canonical(source_id))


def display_name(source_id: str) -> str:
    spec = spec_for(source_id)
    if spec and spec.name:
        return spec.name
    return landlords.landlord_name(source_id)


def links_for(source_id: str) -> LandlordLinks:
    source = canonical(source_id)
    found = LANDLORD_URLS.get(source)
    if found:
        return found
    return LandlordLinks("https://www.homeq.se/login", "https://www.homeq.se/login", "https://www.homeq.se/login")


def effective_strategy(source_id: str, login: LandlordLogin | None = None) -> str:
    source = canonical(source_id)
    if source in {"qasa", "akelius"}:
        return "none"
    spec = KEEPALIVE.get(source)
    if spec is None:
        return "none"
    if source == "stena":
        if login is not None and login.secret_ciphertext:
            return "login_read"
        return "none"
    return spec.strategy


def renewal_disabled(source_id: str, login: LandlordLogin | None = None) -> bool:
    """Old 30-day renew must not run for a source keep-alive already covers."""
    source = canonical(source_id)
    if source in {"qasa", "akelius"}:
        return True
    return effective_strategy(source, login) != "none"


def interval_hours(source_id: str) -> float:
    spec = spec_for(source_id)
    default = float(spec.interval_h if spec else 24)
    raw = os.environ.get(f"KEEPALIVE_INTERVAL_HOURS_{canonical(source_id).upper()}")
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    if value <= 0 or value > 24 * 366:
        return default
    return value


def as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def stockholm_today(now: datetime) -> date:
    current = as_utc(now) or datetime.now(timezone.utc)
    return current.astimezone(STOCKHOLM).date()


def sv_day(value: date) -> str:
    return f"{value.day} {_MONTHS[value.month - 1]}"


def clamp_window(moment: datetime, rng: random.Random) -> datetime:
    """Keep the instant inside 07:00–22:00 Europe/Stockholm. Outside moves to the next morning."""
    local = as_utc(moment).astimezone(STOCKHOLM)
    minute_of_day = local.hour * 60 + local.minute
    if 7 * 60 <= minute_of_day < 22 * 60:
        return as_utc(moment)
    return _next_morning(local, rng)


def _next_morning(local: datetime, rng: random.Random) -> datetime:
    day = local.date()
    if local.hour * 60 + local.minute >= 7 * 60:
        day = day + timedelta(days=1)
    morning = datetime.combine(day, dtime(7, 0), tzinfo=STOCKHOLM)
    morning = morning + timedelta(minutes=rng.uniform(0, 60))
    return morning.astimezone(timezone.utc)


def next_keepalive_at(last: datetime, source_id: str, rng: random.Random | None = None) -> datetime:
    rng = rng or random.Random()
    last = as_utc(last)
    delta = timedelta(hours=interval_hours(source_id)) + timedelta(seconds=rng.uniform(-2 * 3600, 2 * 3600))
    target = last + delta
    slot = clamp_window(target, rng)
    earliest = last + timedelta(hours=interval_hours(source_id) - 2)
    if slot < earliest:
        slot = _next_morning(earliest.astimezone(STOCKHOLM), rng)
    return slot


def first_keepalive_at(connected_at: datetime, rng: random.Random | None = None) -> datetime:
    """No sooner than 6 hours after the connect login, and not the same minute for every user."""
    rng = rng or random.Random()
    connected_at = as_utc(connected_at)
    earliest = connected_at + timedelta(hours=6)
    target = earliest + timedelta(minutes=rng.uniform(0, 180))
    slot = clamp_window(target, rng)
    if slot < earliest:
        slot = _next_morning(earliest.astimezone(STOCKHOLM), rng)
    if slot < earliest:
        slot = earliest + timedelta(minutes=rng.uniform(0, 60))
        slot = clamp_window(slot, rng)
    return slot


def reset_host_gap() -> None:
    _host_next.clear()


def host_key(source_id: str) -> str:
    site = landlords.landlord(canonical(source_id))
    if site and site.login_url:
        return (urlparse(site.login_url).hostname or canonical(source_id)).lower()
    return canonical(source_id)


def host_wait(source_id: str, clock=time.monotonic) -> float:
    return max(0.0, _host_next.get(host_key(source_id), 0.0) - clock())


def mark_host(source_id: str, clock=time.monotonic) -> None:
    _host_next[host_key(source_id)] = clock() + HOST_GAP_SECONDS


def clear_entitlement_cache() -> None:
    _cache.clear()


def read_entitlement(uid: str) -> dict | None:
    from blixtbo.firebase_app import firestore_client

    snapshot = firestore_client().collection("users").document(uid).collection("billing").document("entitlement").get()
    if not getattr(snapshot, "exists", False):
        return None
    data = snapshot.to_dict() or None
    return data if isinstance(data, dict) else None


def entitled(user: User) -> bool:
    """True only for paid Premium that is active. A trial flag does not count. Errors raise."""
    if settings.data_backend != "firestore":
        return os.environ.get("KEEPALIVE_ASSUME_PAID") == "1"
    uid = getattr(user, "firebase_uid", None) or ""
    if not uid:
        return False
    now = time.monotonic()
    cached = _cache.get(uid)
    if cached and cached[0] > now:
        return cached[1]
    try:
        data = read_entitlement(uid)
    except Exception as exc:
        raise EntitlementUnavailable() from exc
    ok = (
        bool(data)
        and data.get("plan") == "premium"
        and data.get("status") == "active"
        and not data.get("trial")
        and data.get("autoApply") is not False
    )
    _cache[uid] = (now + 600, ok)
    return ok


def schedule_after_save(login: LandlordLogin, *, now: datetime | None = None, rng: random.Random | None = None) -> None:
    """A fresh password or session clears the stop and waits 6 hours before the next login."""
    now = as_utc(now or datetime.now(timezone.utc))
    rng = rng or random.Random()
    login.keepalive_failures = 0
    login.last_keepalive_code = None
    strategy = effective_strategy(login.source_id, login)
    if strategy == "login_read":
        login.keepalive_state = None
        login.next_keepalive_at = first_keepalive_at(now, rng)
        return
    if strategy == "fee_reminder":
        login.keepalive_state = "fee_due"
        return
    login.keepalive_state = "skipped"
    login.next_keepalive_at = None


def action_for(source_id: str, code: str, *, due: date | None = None) -> Action:
    source = canonical(source_id)
    links = links_for(source)
    name = display_name(source)
    password_href = f"/kopplingar?source={source}&intent=login"
    fee_href = f"/kopplingar?source={source}&fee=1"
    if code == "password_changed":
        return Action("Uppdatera lösenord", password_href, f"Öppna {name}", links.login)
    if code in {"fee_30", "fee_14", "fee_3", "fee_0"} and due is not None:
        return Action(f"Betala innan {sv_day(due)}", links.payment, f"Öppna {name}", links.login)
    if code == "fee_overdue":
        return Action(f"Betala hos {name}", links.payment, f"Öppna {name}", links.login)
    if code in {"fee_prompt", "fee_prompt_again"}:
        return Action(f"Öppna {name}", links.payment, "Lägg in datum", fee_href)
    if code == "needs_bankid":
        return Action(f"Öppna {name}", links.login, "Spara lösenord", password_href)
    if code in {"needs_identity", "needs_email"}:
        return Action(f"Verifiera hos {name}", links.account or links.login)
    if code == "premium_stopped":
        return Action(f"Öppna {name}", links.login)
    return Action(f"Öppna {name}", links.login)


def _kind(source_id: str, code: str) -> str:
    return f"keepalive:{canonical(source_id)}:{code}"[:80]


def notify_once(
    db: Session,
    user_id: str,
    source_id: str,
    code: str,
    title: str,
    body: str,
    *,
    ttl_days: int = 7,
    now: datetime | None = None,
    due: date | None = None,
) -> Notice | None:
    """One notice per code inside the ttl, and at most one keep-alive notice per user per day."""
    now = as_utc(now or datetime.now(timezone.utc))
    kind = _kind(source_id, code)
    if ttl_days > 0:
        cutoff = now - timedelta(days=ttl_days)
        existing = (
            db.query(Notice)
            .filter(Notice.user_id == user_id, Notice.kind == kind)
            .order_by(Notice.created_at.desc())
            .first()
        )
        if existing is not None and as_utc(existing.created_at) >= cutoff:
            return None
    action = action_for(source_id, code, due=due)
    if code != "recovered":
        day_ago = now - timedelta(hours=24)
        todays = (
            db.query(Notice)
            .filter(Notice.user_id == user_id, Notice.kind.like("keepalive:%"))
            .order_by(Notice.created_at.desc())
            .all()
        )
        recent = [row for row in todays if row.kind and as_utc(row.created_at) >= day_ago and not row.kind.endswith(":recovered")]
        if recent:
            first = recent[-1]
            extra = f"{title}\n{body}\n{action.label}: {action.href}"
            if action.secondary_href:
                extra += f"\n{action.secondary_label}: {action.secondary_href}"
            first.body = (first.body + "\n\n" + extra)[:4000]
            if not first.secondary_href:
                first.secondary_label = action.label[:80]
                first.secondary_href = action.href[:500]
            current = first.title
            if current.endswith("hyresvärdar behöver dig") and current.split(" ", 1)[0].isdigit():
                count = int(current.split(" ", 1)[0]) + 1
            else:
                count = 2
            first.title = f"{count} hyresvärdar behöver dig"[:160]
            return first
    row = Notice(
        user_id=user_id,
        kind=kind,
        title=title[:160],
        body=body,
        action_label=action.label[:80],
        action_href=action.href[:500],
        secondary_label=action.secondary_label[:80],
        secondary_href=action.secondary_href[:500],
    )
    db.add(row)
    return row


def _public_href(href: str) -> str:
    if href.startswith("http://") or href.startswith("https://"):
        return href
    base = (settings.public_app_url or "").rstrip("/")
    if not href.startswith("/"):
        href = "/" + href
    return f"{base}{href}" if base else href


def _deliverable(email: str) -> bool:
    if not email or "@" not in email:
        return False
    lowered = email.lower()
    if lowered.endswith("@deleted.blixtbo.invalid") or lowered.endswith("@anonymised.invalid"):
        return False
    return True


def _mailed_recently(db: Session, user_id: str, now: datetime) -> bool:
    since = now - timedelta(hours=24)
    rows = db.query(AuditLog).filter(AuditLog.action == MAIL_ACTION, AuditLog.target == user_id).all()
    return any(as_utc(row.created_at) >= since for row in rows)


def flush_mail(db: Session, now: datetime | None = None) -> int:
    """One digest per user per 24 hours, and only for notices that need the user."""
    now = as_utc(now or datetime.now(timezone.utc))
    since = now - timedelta(hours=24)
    rows = db.query(Notice).filter(Notice.kind.like("keepalive:%")).all()
    grouped: dict[str, list[Notice]] = {}
    for row in rows:
        code = (row.kind or "").split(":")[-1]
        if code not in EMAIL_CODES:
            continue
        if as_utc(row.created_at) < since:
            continue
        grouped.setdefault(row.user_id, []).append(row)
    sent = 0
    for user_id, items in grouped.items():
        if _mailed_recently(db, user_id, now):
            continue
        user = db.get(User, user_id)
        if user is None or user.deleted_at is not None or not _deliverable(user.email):
            continue
        blocks = []
        for item in items:
            blocks.append(item.title)
            blocks.append(item.body)
            if item.action_label and item.action_href:
                blocks.append(f"{item.action_label}: {_public_href(item.action_href)}")
            if item.secondary_label and item.secondary_href:
                blocks.append(f"{item.secondary_label}: {_public_href(item.secondary_href)}")
            blocks.append("")
        subject = "Blixtbo: en sak att göra" if len(items) == 1 else "Blixtbo: hyresvärdar behöver dig"
        if mailer.send(user.email, subject, "\n".join(blocks).strip()):
            db.add(AuditLog(actor_email="keepalive", action=MAIL_ACTION, target=user_id))
            sent += 1
    return sent


def _deadline_line(login: LandlordLogin) -> str:
    source = canonical(login.source_id)
    name = display_name(source)
    spec = spec_for(source)
    strategy = effective_strategy(source, login)
    links = links_for(source)
    if strategy == "fee_reminder":
        return f"Betala köavgiften hos {name} själv. Blixtbo betalar aldrig åt dig. {links.payment}"
    if source == "homeq" or strategy == "via:homeq":
        return f"Logga in hos HomeQ senast om 18 månader. {links_for('homeq').login}"
    if source == "sssb":
        return f"Ködagarna hos SSSB följer medlemskapet, inte inloggningen. {links.login}"
    if source == "stena" or strategy == "none":
        return f"{name} har ingen köplats som Blixtbo håller aktiv."
    if spec and spec.deadline_sv:
        return f"Logga in hos {name} senast om {spec.deadline_sv}. {links.login}"
    return f"Logga in hos {name} själv. {links.login}"


def _premium_notice(db: Session, user: User, now: datetime) -> None:
    rows = db.query(LandlordLogin).filter_by(user_id=user.id).all()
    lines = [_deadline_line(row) for row in rows]
    body = "Utan Blixtbo Premium håller vi inte köplatserna aktiva. " + " ".join(line for line in lines if line)
    first = rows[0].source_id if rows else "homeq"
    notify_once(
        db,
        user.id,
        first,
        "premium_stopped",
        "Utan Blixtbo Premium håller vi inte köplatserna aktiva",
        body.strip(),
        ttl_days=0,
        now=now,
    )


def _attempt_times(db: Session, login: LandlordLogin, now: datetime) -> list[datetime]:
    since = now - timedelta(hours=24)
    rows = db.query(Job).filter_by(user_id=login.user_id, source_id=login.source_id, kind="keepalive").all()
    found: list[datetime] = []
    for row in rows:
        try:
            data = json.loads(row.payload or "{}")
        except json.JSONDecodeError:
            data = {}
        raw = data.get("attempted_at") if isinstance(data, dict) else None
        if not isinstance(raw, str):
            continue
        try:
            stamp = as_utc(datetime.fromisoformat(raw))
        except ValueError:
            continue
        if stamp and stamp >= since:
            found.append(stamp)
    return found


def _open_secret(user: User, login: LandlordLogin) -> dict:
    dek = crypto.unwrap_dek(user.dek_nonce, user.dek_wrapped)
    secret = crypto.decrypt_secret(dek, login.secret_nonce, login.secret_ciphertext)
    crypto.reject_bankid_material(secret)
    return secret


def _robot_urls(source_id: str) -> list[str]:
    source = canonical(source_id)
    urls: list[str] = []
    site = landlords.landlord(source)
    if site and site.robots_url:
        urls.append(site.robots_url)
    extra = {
        "homeq": "https://api.homeq.se/robots.txt",
        "stena": "https://api.pigello.io/robots.txt",
    }.get(source)
    if extra and extra not in urls:
        urls.append(extra)
    return urls


def load_guard(source_id: str) -> SiteGuard:
    """Honor robots.txt when it can be read. A failure does not invent a block."""
    guard = SiteGuard(gap_seconds=0, sleeper=lambda _seconds: None)
    if settings.landlord_mode != "live":
        return guard
    for url in _robot_urls(source_id):
        host = (urlparse(url).hostname or "").lower()
        if not host:
            continue
        try:
            client = landlords._client(source_id)
            try:
                response = client.get(url)
            finally:
                client.close()
        except Exception:
            continue
        if response.status_code == 200 and response.text:
            guard.robots_by_host[host] = response.text
    return guard


def perform_read(source_id: str, secret: dict, guard: SiteGuard | None = None) -> StepResult:
    source = canonical(source_id)
    if settings.landlord_mode != "live":
        return finished("Dry-run", "Inget anrop gjordes.", "dry_run")
    if source in ZERO_CALLS or not allowlist(source):
        return finished("Hoppas över", "Inget anrop görs.", "skipped")
    mark_host(source)
    guard = load_guard(source) if guard is None else guard
    client = landlords._client(source)
    wrapped = ReadOnlyClient(client, allowlist(source))
    try:
        return adapters.keepalive(wrapped, source, secret, guard)
    except httpx.TransportError:
        name = display_name(source)
        return paused("unreachable", f"Vi når inte {name} just nu", "Vi försöker igen senare.")
    finally:
        wrapped.close()


def _notice_copy(login: LandlordLogin, result: StepResult) -> tuple[str, str]:
    name = display_name(login.source_id)
    code = result.error or ""
    if code == "password_changed":
        return (
            f"Inloggningen hos {name} fungerar inte längre – uppdatera ditt lösenord",
            "Spara lösenordet på nytt i Blixtbo. Vi provar inloggningen en gång och fortsätter sedan hålla kontot aktivt.",
        )
    if code == "needs_bankid":
        return (
            f"Logga in hos {name} igen eller spara lösenordet på nytt",
            f"Logga in hos {name} på deras sida, eller spara lösenordet på nytt i Blixtbo. Vi ser aldrig ditt BankID.",
        )
    if code == "needs_identity" and canonical(login.source_id) == "homeq":
        return ("Verifiera dig hos HomeQ", result.body or "Verifiera dig med BankID hos HomeQ. Blixtbo ser inte ditt BankID.")
    if code in {"captcha", "rate_limited"}:
        return (f"{name} vill att du tar över", f"{name} visar en kontroll. Vi försöker inte lösa den. Gör steget själv på deras sida.")
    if code == "unreachable":
        return (f"Vi når inte {name} just nu", "Inget du behöver göra just nu. Vi försöker igen en gång per dygn.")
    if code == "queue_action":
        return (result.title or f"Kön hos {name} behöver en titt", result.body or f"Logga in hos {name} om påminnelsen syns. Blixtbo gör inte det åt dig.")
    title, body = outcome_notice(code, name)
    return (result.title or title, result.body or body)


def apply_result(
    db: Session,
    user: User,
    login: LandlordLogin,
    job: Job,
    result: StepResult,
    *,
    now: datetime | None = None,
    rng: random.Random | None = None,
) -> None:
    now = as_utc(now or datetime.now(timezone.utc))
    rng = rng or random.Random()
    code = result.error or ""
    name = display_name(login.source_id)
    if result.ok and (code in SUCCESS_CODES or code == ""):
        previous_failures = login.keepalive_failures or 0
        previous_state = login.keepalive_state
        previous_code = login.last_keepalive_code
        login.last_kept_alive_at = now
        login.last_login_at = now
        login.keepalive_failures = 0
        login.keepalive_state = "ok"
        login.last_keepalive_code = None
        login.last_error = None
        login.status = "active"
        login.next_keepalive_at = next_keepalive_at(now, login.source_id, rng)
        job.status = "done"
        job.last_error = code or None
        if code == "queue_action":
            title, body = _notice_copy(login, result)
            notify_once(db, user.id, login.source_id, "queue_action", title, body, now=now)
        recover = previous_code == "unreachable" or previous_state == "retrying" or (
            previous_failures > 0 and previous_code not in STOP_CODES
        )
        if recover:
            notify_once(
                db,
                user.id,
                login.source_id,
                "recovered",
                "Det fungerar igen",
                f"Inloggningen hos {name} fungerar igen.",
                now=now,
            )
        return
    if code in TRANSIENT_CODES:
        login.keepalive_failures = (login.keepalive_failures or 0) + 1
        login.last_keepalive_code = "unreachable"
        login.keepalive_state = "retrying"
        login.next_keepalive_at = now + timedelta(hours=min(4 ** (login.keepalive_failures - 1), 24))
        if login.keepalive_failures >= 4:
            login.keepalive_state = "needs_user"
            login.last_keepalive_code = "unreachable"
            title, body = _notice_copy(login, paused("unreachable", "", ""))
            notify_once(db, user.id, login.source_id, "unreachable", title, body, now=now)
        job.status = "failed"
        job.last_error = "unreachable"
        return
    if code in CAPTCHA_CODES:
        repeat = login.last_keepalive_code in CAPTCHA_CODES
        login.last_keepalive_code = "captcha" if code == "captcha" else "rate_limited"
        login.keepalive_failures = (login.keepalive_failures or 0) + 1
        login.next_keepalive_at = now + timedelta(hours=24)
        if repeat:
            login.keepalive_state = "needs_user"
            login.status = "needs_user"
            login.last_error = login.last_keepalive_code
            title, body = _notice_copy(login, result)
            notify_once(db, user.id, login.source_id, login.last_keepalive_code, title, body, now=now)
        else:
            login.keepalive_state = "retrying"
        job.status = "failed"
        job.last_error = login.last_keepalive_code
        return
    if code == "needs_bankid" or result.needs_bankid_on_phone:
        login.keepalive_state = "needs_bankid"
        login.status = "needs_bankid"
        login.landlord_requires_bankid = True
        login.last_error = "needs_bankid"
        login.last_keepalive_code = "needs_bankid"
        title, body = _notice_copy(login, paused("needs_bankid", "", ""))
        notify_once(db, user.id, login.source_id, "needs_bankid", title, body, now=now)
        job.status = "failed"
        job.last_error = "needs_bankid"
        return
    if code in STOP_CODES or not result.ok:
        stop = code if code in STOP_CODES else (code or "site_changed")
        login.keepalive_state = "needs_user"
        login.status = "needs_user"
        login.last_error = stop[:64]
        login.last_keepalive_code = stop[:64]
        title, body = _notice_copy(login, result if result.error else paused(stop, "", ""))
        notify_once(db, user.id, login.source_id, stop, title, body, now=now)
        job.status = "failed"
        job.last_error = stop[:64]
        return
    job.status = "failed"
    job.last_error = (code or "failed")[:64]


def execute_job(db: Session, user: User, job: Job, *, now: datetime | None = None, rng: random.Random | None = None) -> None:
    """One keep-alive attempt. The job ends done or failed. State stays on the login."""
    now = as_utc(now or datetime.now(timezone.utc))
    rng = rng or random.Random()
    login = db.query(LandlordLogin).filter_by(user_id=user.id, source_id=job.source_id).one_or_none()
    if login is None:
        job.status = "failed"
        job.last_error = "no active login"
        return
    try:
        paid = entitled(user)
    except EntitlementUnavailable:
        log.info("entitlement_unavailable")
        return
    if not paid:
        login.keepalive_state = "paused"
        job.status = "done"
        job.last_error = "paused"
        return
    if effective_strategy(login.source_id, login) != "login_read":
        job.status = "done"
        job.last_error = "skipped"
        return
    if login.status not in {"active", "needs_retry"}:
        job.status = "done"
        job.last_error = "stopped"
        return
    times = _attempt_times(db, login, now)
    if len(times) >= ATTEMPT_CAP:
        login.next_keepalive_at = min(times) + timedelta(hours=24)
        job.status = "done"
        job.last_error = "capped"
        return
    if settings.landlord_mode != "live":
        login.keepalive_state = "dry_run"
        login.last_keepalive_attempt_at = now
        login.next_keepalive_at = next_keepalive_at(now, login.source_id, rng)
        job.status = "done"
        job.last_error = "dry_run"
        return
    if not login.secret_ciphertext or not login.secret_nonce:
        login.status = "needs_user"
        login.keepalive_state = "needs_user"
        login.last_keepalive_code = "session_expired"
        job.status = "failed"
        job.last_error = "no active login"
        return
    try:
        secret = _open_secret(user, login)
        crypto.reject_bankid_material(secret)
    except ValueError:
        job.status = "failed"
        job.last_error = "refused"
        return
    except Exception:
        job.status = "failed"
        job.last_error = "secret"
        return
    job.payload = json.dumps({"attempted_at": now.isoformat()})
    login.last_keepalive_attempt_at = now
    try:
        try:
            result = perform_read(login.source_id, secret)
        except ForbiddenRequest:
            log.info("keepalive_blocked")
            login.keepalive_state = "retrying"
            login.next_keepalive_at = now + timedelta(hours=24)
            job.status = "failed"
            job.last_error = "blocked"
            return
        apply_result(db, user, login, job, result, now=now, rng=rng)
    finally:
        if isinstance(secret, dict):
            secret["password"] = ""
    flush_mail(db, now)


def _fee_body(name: str, due: date, overdue: bool) -> str:
    when = sv_day(due)
    if overdue:
        return (
            f"Köavgiften hos {name} förföll {when}. Betala själv på deras sida med Swish eller kort. "
            "Blixtbo betalar aldrig åt dig."
        )
    return (
        f"Köavgiften hos {name} förfaller {when}. Betala själv på deras sida med Swish eller kort. "
        "Blixtbo betalar aldrig åt dig."
    )


def _grace_body(source_id: str, name: str) -> str:
    source = canonical(source_id)
    if source == "bostadsformedlingen":
        return f"Hos {name} blir kön vilande när avgiften är obetald, och efter 5 månader avregistreras du. Kötiden försvinner då."
    if source in {"uppsala", "boplatssyd"}:
        return f"Hos {name} avregistreras kontot 60 dagar efter att perioden tagit slut. Kötiden försvinner då."
    return f"En obetald köavgift hos {name} kan göra kontot inaktivt. Betala själv på deras sida. Blixtbo betalar aldrig åt dig."


def process_fee(db: Session, user: User, login: LandlordLogin, now: datetime) -> None:
    if login.keepalive_state != "fee_due":
        login.keepalive_state = "fee_due"
    name = display_name(login.source_id)
    if login.fee_due_at is None:
        created = notify_once(
            db,
            user.id,
            login.source_id,
            "fee_prompt",
            "Lägg in när köavgiften förfaller så påminner vi dig",
            f"Vi gissar inget datum för {name}. Lägg in förfallodagen så påminner vi dig.",
            ttl_days=3650,
            now=now,
        )
        if created is None:
            kind = _kind(login.source_id, "fee_prompt")
            first = db.query(Notice).filter_by(user_id=user.id, kind=kind).order_by(Notice.created_at.asc()).first()
            if first is not None and as_utc(first.created_at) <= now - timedelta(days=30):
                notify_once(
                    db,
                    user.id,
                    login.source_id,
                    "fee_prompt_again",
                    "Lägg in när köavgiften förfaller så påminner vi dig",
                    f"Vi påminner en sista gång. Utan datum säger vi inget mer om avgiften hos {name}.",
                    ttl_days=3650,
                    now=now,
                )
        return
    due = login.fee_due_at
    days = (due - stockholm_today(now)).days
    if days == 30:
        code = "fee_30"
    elif days == 14:
        code = "fee_14"
    elif days == 3:
        code = "fee_3"
    elif days == 0:
        code = "fee_0"
    elif days < 0:
        notify_once(
            db,
            user.id,
            login.source_id,
            "fee_overdue",
            f"Köavgiften hos {name} har förfallit",
            _fee_body(name, due, True) + " " + _grace_body(login.source_id, name),
            ttl_days=3650,
            now=now,
            due=due,
        )
        return
    else:
        return
    notify_once(
        db,
        user.id,
        login.source_id,
        code,
        f"Köavgiften hos {name}",
        _fee_body(name, due, False),
        now=now,
        due=due,
    )


def _due_rows(db: Session, now: datetime):
    query = (
        db.query(LandlordLogin, User)
        .join(User, User.id == LandlordLogin.user_id)
        .filter(User.deleted_at.is_(None))
        .filter(LandlordLogin.status.in_(("active", "needs_retry", "needs_user", "needs_bankid")))
    )
    bind = db.get_bind()
    if bind is not None and bind.dialect.name == "postgresql":
        query = query.with_for_update(skip_locked=True, of=LandlordLogin)
    return query.all()


def due_lock_sql() -> str:
    """PostgreSQL text for the row lock. Used by tests without a live server."""
    from sqlalchemy.dialects import postgresql
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import create_engine

    engine = create_engine("sqlite://")
    db = sessionmaker(engine)()
    query = (
        db.query(LandlordLogin)
        .join(User, User.id == LandlordLogin.user_id)
        .filter(User.deleted_at.is_(None))
        .with_for_update(skip_locked=True, of=LandlordLogin)
    )
    return str(query.statement.compile(dialect=postgresql.dialect()))


def queue_due_keepalives(db: Session, *, now: datetime | None = None, rng: random.Random | None = None) -> int:
    now = as_utc(now or datetime.now(timezone.utc))
    rng = rng or random.Random()
    rows = _due_rows(db, now)
    users = {user.id: user for _, user in rows}
    flags: dict[str, bool] = {}
    try:
        for user in users.values():
            flags[user.id] = entitled(user)
    except EntitlementUnavailable:
        log.info("entitlement_unavailable")
        return 0
    paused_users: set[str] = set()
    queued = 0
    for login, user in rows:
        if not flags.get(user.id):
            if login.keepalive_state != "paused":
                paused_users.add(user.id)
            login.keepalive_state = "paused"
            continue
        if login.keepalive_state == "paused":
            login.keepalive_state = None
        strategy = effective_strategy(login.source_id, login)
        if strategy == "fee_reminder":
            process_fee(db, user, login, now)
            continue
        if strategy in {"none", "via:homeq"}:
            if login.keepalive_state != "skipped":
                login.keepalive_state = "skipped"
            continue
        if strategy != "login_read" or login.status not in {"active", "needs_retry"}:
            continue
        if login.next_keepalive_at is None:
            anchor = as_utc(login.last_login_at) or now
            login.next_keepalive_at = first_keepalive_at(anchor, rng)
            if login.next_keepalive_at > now:
                continue
        elif as_utc(login.next_keepalive_at) > now:
            continue
        already = (
            db.query(Job)
            .filter(
                Job.user_id == login.user_id,
                Job.source_id == login.source_id,
                Job.kind == "keepalive",
                Job.status.in_(("queued", "waiting_user", "waiting_bankid")),
            )
            .first()
        )
        if already:
            continue
        times = _attempt_times(db, login, now)
        if len(times) >= ATTEMPT_CAP:
            login.next_keepalive_at = min(times) + timedelta(hours=24)
            continue
        db.add(Job(user_id=login.user_id, source_id=login.source_id, kind="keepalive", payload="{}", run_at=now))
        queued += 1
    for user_id in paused_users:
        user = users.get(user_id)
        if user is not None:
            _premium_notice(db, user, now)
    flush_mail(db, now)
    return queued


def parse_fee_date(raw: object) -> date:
    if not isinstance(raw, str) or len(raw) != 10:
        raise ValueError("date")
    try:
        due = date.fromisoformat(raw)
    except ValueError as exc:
        raise ValueError("date") from exc
    if due.year < 2000 or due.year > 2100:
        raise ValueError("date")
    return due


def latest_notice_title(db: Session, user_id: str, source_id: str) -> str | None:
    kind_prefix = f"keepalive:{canonical(source_id)}:"
    row = (
        db.query(Notice)
        .filter(Notice.user_id == user_id, Notice.kind.like(f"{kind_prefix}%"))
        .order_by(Notice.created_at.desc())
        .first()
    )
    if row is None:
        return None
    return row.title
