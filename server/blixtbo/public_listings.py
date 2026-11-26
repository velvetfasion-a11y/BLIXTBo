"""Public listing reads. Cached, filtered, and never an application."""

import time

import httpx

from blixtbo.adapters import bostadsformedlingen, homeq, qasa, sssb
from blixtbo.adapters.common import captcha

_cache: dict[str, tuple[float, list[dict]]] = {}
TTL_SECONDS = 600


def reset_cache() -> None:
    _cache.clear()


def _remember(key: str, rows: list[dict], now: float | None = None) -> list[dict]:
    _cache[key] = (now if now is not None else time.time(), rows)
    return rows


def _fresh(key: str, now: float | None = None) -> list[dict] | None:
    if key not in _cache:
        return None
    stamp, rows = _cache[key]
    if (now if now is not None else time.time()) - stamp > TTL_SECONDS:
        return None
    return rows


def _get(client: httpx.Client, url: str, *, method: str = "GET", json_body: dict | None = None) -> httpx.Response:
    if method == "POST":
        return client.post(url, json=json_body, headers={"Accept": "application/json"})
    return client.get(url, headers={"Accept": "application/json, text/html"})


def homeq_listings(client: httpx.Client, filters: dict) -> list[dict]:
    cached = _fresh("homeq")
    if cached is not None:
        return _filter(cached, filters)
    try:
        response = _get(client, homeq.API + homeq.SEARCH, method="POST", json_body=homeq.search_body(filters))
    except Exception:
        return []
    if captcha(response.status_code, response.text) or response.status_code >= 400:
        return _remember("homeq", [])
    try:
        rows = homeq.parse_search(response.json())
    except Exception:
        rows = []
    _remember("homeq", rows)
    return _filter(rows, filters)


def bf_listings(client: httpx.Client, filters: dict) -> list[dict]:
    cached = _fresh("bf")
    if cached is not None:
        return _filter(cached, filters)
    try:
        response = _get(client, bostadsformedlingen.ADS)
    except Exception:
        return []
    if captcha(response.status_code, response.text) or response.status_code >= 400:
        return _remember("bf", [])
    try:
        rows = bostadsformedlingen.parse_ads(response.json())
    except Exception:
        rows = []
    _remember("bf", rows)
    return _filter(rows, filters)


def qasa_listings(client: httpx.Client, filters: dict) -> list[dict]:
    cached = _fresh("qasa")
    if cached is not None:
        return _filter(cached, filters)
    try:
        response = _get(client, qasa.FIND)
    except Exception:
        return []
    if captcha(response.status_code, response.text):
        return _remember("qasa", [])
    rows = qasa.parse_page(response.text, response.headers.get("content-type", ""))
    _remember("qasa", rows)
    return _filter(rows, filters)


def sssb_listings(client: httpx.Client, filters: dict, body: str | None = None) -> list[dict]:
    cached = _fresh("sssb")
    if cached is not None:
        return _filter(cached, filters)
    text = body
    if text is None:
        try:
            response = _get(client, sssb.WIDGETS + "?widgets[]=objektlistabilder@lagenheter")
        except Exception:
            return []
        if captcha(response.status_code, response.text):
            return _remember("sssb", [])
        text = response.text
    rows = sssb.parse_widgets(text)
    _remember("sssb", rows)
    return _filter(rows, filters)


def collect(client: httpx.Client, filters: dict) -> list[dict]:
    rows = []
    rows.extend(homeq_listings(client, filters))
    rows.extend(bf_listings(client, filters))
    rows.extend(qasa_listings(client, filters))
    rows.extend(sssb_listings(client, filters))
    return rows


def _filter(rows: list[dict], filters: dict) -> list[dict]:
    areas = [str(item).lower() for item in (filters.get("areas") or []) if str(item).strip()]
    max_rent = _int(filters.get("max_rent") or filters.get("maxRent") or 0)
    min_sqm = _int(filters.get("min_sqm") or filters.get("minSqm") or 0)
    min_floor = _int(filters.get("min_floor") or filters.get("minFloor") or 0)
    rooms = str(filters.get("rooms") or "any")
    kept = []
    for row in rows:
        if max_rent and row.get("rent") and int(row["rent"]) > max_rent:
            continue
        if min_sqm and int(row.get("sqm") or 0) < min_sqm:
            continue
        if min_floor and int(row.get("floor") or 0) < min_floor:
            continue
        if rooms not in ("", "any"):
            count = int(row.get("rooms") or 0)
            if rooms == "5+":
                if count < 5:
                    continue
            elif count != _int(rooms):
                continue
        if areas:
            blob = f"{row.get('area', '')} {row.get('city', '')} {row.get('address', '')}".lower()
            if not any(area in blob for area in areas):
                continue
        kept.append(row)
    return kept


def _int(value) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def to_listing(row: dict) -> dict:
    return {
        "id": row["id"],
        "address": row.get("address") or "Bostad",
        "area": row.get("area") or "",
        "city": row.get("city") or "",
        "rent": int(row.get("rent") or 0),
        "sqm": int(row.get("sqm") or 0),
        "rooms": int(row.get("rooms") or 1),
        "floor": int(row.get("floor") or 0),
        "floors": max(int(row.get("floor") or 0), 1),
        "moveIn": "",
        "sourceId": row.get("source_id"),
        "sourceName": row.get("landlord") or "",
        "title": row.get("address") or "Bostad",
        "description": row.get("landlord") or "",
        "near": row.get("area") or row.get("city") or "",
        "features": [row["landlord"]] if row.get("landlord") else [],
        "url": row.get("url") or "",
        "externalId": row.get("object_ad_id") or row.get("lagenhet_id") or row.get("refid") or row.get("qasa_id") or "",
        "objectAdId": row.get("object_ad_id") or "",
        "lagenhetId": row.get("lagenhet_id") or "",
        "annonsId": row.get("annons_id") or "",
        "refid": row.get("refid") or "",
        "qasaId": row.get("qasa_id") or "",
        "bindingApply": bool(row.get("binding")),
        "messageApply": bool(row.get("message")),
        "active": True,
    }
