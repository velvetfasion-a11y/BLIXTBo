"""Own event log. No names, emails, or listing text. Umami is optional."""

import json
import re
from datetime import datetime, timedelta, timezone

from blixtbo.config import settings
from blixtbo.models import AnalyticsEvent

ALLOWED_EVENTS = {
    "pageview",
    "signup",
    "login",
    "swipe",
    "apply",
    "payment_success",
    "payment_failed",
    "trial_started",
    "subscription_paused",
}
PROP_KEYS = {"direction", "sourceId", "mode"}


def sanitize_event(name: str, data: dict | None) -> tuple[str, dict]:
    if name not in ALLOWED_EVENTS:
        raise ValueError("unknown event")
    clean: dict[str, str] = {}
    for key, value in (data or {}).items():
        if key not in PROP_KEYS or isinstance(value, (dict, list)):
            continue
        text = str(value)
        if "@" in text or len(text) > 64:
            continue
        if key == "direction" and text not in ("yes", "no"):
            continue
        if key == "mode" and text not in ("auto", "manual"):
            continue
        if key == "sourceId" and not re.fullmatch(r"[A-Za-z0-9-]{1,64}", text):
            continue
        clean[key] = text
    return name, clean


def record_event(db, name: str, data: dict | None = None) -> AnalyticsEvent:
    event_name, props = sanitize_event(name, data)
    row = AnalyticsEvent(name=event_name, props=json.dumps(props, separators=(",", ":")))
    db.add(row)
    db.commit()
    if settings.data_backend == "firestore":
        _write_firestore(event_name, props, row.created_at)
    return row


def _write_firestore(name: str, props: dict, created_at: datetime) -> None:
    try:
        from blixtbo.firebase_app import firestore_client

        firestore_client().collection("analytics").add(
            {"name": name, "props": props, "createdAt": created_at.isoformat()}
        )
    except Exception:
        return


def _day(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).date().isoformat()


def registrations_per_day(db, days: int = 14) -> list[dict]:
    start = datetime.now(timezone.utc) - timedelta(days=days - 1)
    rows = db.query(AnalyticsEvent).filter(AnalyticsEvent.name == "signup", AnalyticsEvent.created_at >= start).all()
    counts: dict[str, int] = {}
    for row in rows:
        key = _day(row.created_at)
        counts[key] = counts.get(key, 0) + 1
    return [{"day": day, "count": counts[day]} for day in sorted(counts)]


def recent_events(db, limit: int = 50) -> list[dict]:
    rows = db.query(AnalyticsEvent).order_by(AnalyticsEvent.id.desc()).limit(limit).all()
    return [
        {"name": row.name, "props": json.loads(row.props or "{}"), "at": row.created_at.isoformat()}
        for row in rows
    ]


def umami_configured() -> bool:
    return bool(settings.umami_api_url and settings.umami_api_token and settings.umami_website_id)


def umami_pageviews() -> list[dict] | None:
    if not umami_configured():
        return None
    import httpx

    end = int(datetime.now(timezone.utc).timestamp() * 1000)
    start = end - 14 * 24 * 60 * 60 * 1000
    url = settings.umami_api_url.rstrip("/") + f"/api/websites/{settings.umami_website_id}/pageviews"
    try:
        response = httpx.get(
            url,
            params={"startAt": start, "endAt": end, "unit": "day"},
            headers={"Authorization": f"Bearer {settings.umami_api_token}"},
            timeout=8,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return None
    series = payload.get("pageviews") or payload.get("sessions") or []
    points = []
    for item in series:
        if isinstance(item, dict) and "x" in item and "y" in item:
            points.append({"day": str(item["x"])[:10], "count": int(item["y"])})
    return points
