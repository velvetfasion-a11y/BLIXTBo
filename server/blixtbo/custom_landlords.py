"""Find a landlord the user typed, then read public listings.

Search results are ranked with the same Hugging Face embedding as ads,
or with word overlap when that call is unavailable. Fetches follow
robots.txt, wait between requests, and never send BankID.
"""

import ipaddress
import re
import time
from urllib.parse import parse_qs, urljoin, urlparse
from urllib.robotparser import RobotFileParser
import xml.etree.ElementTree as ET

import httpx

from blixtbo.landlords import LANDLORDS
from blixtbo.matching import _cosine, _embed_remote

AGENT = "BlixtboBot/0.1"
RATE_SECONDS = 2.0
_last_fetch: dict[str, float] = {}


def reset_rate_limit() -> None:
    _last_fetch.clear()


def public_url(url: str) -> bool:
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    host = parsed.hostname.lower()
    if host in ("localhost", "127.0.0.1"):
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return True
    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved)


def robots_allows(robots_text: str, url: str) -> bool:
    parser = RobotFileParser()
    parser.parse(robots_text.splitlines())
    return parser.can_fetch(AGENT, url) and parser.can_fetch("*", url)


def apply_mode(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    for site in LANDLORDS.values():
        known = (urlparse(site.login_url).hostname or "").lower()
        if known and (host == known or host.endswith("." + known)):
            return "adapter"
    return "manual"


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9åäö]+", text.lower()))


def lexical_score(query: str, text: str) -> float:
    wanted = _tokens(query)
    if not wanted:
        return 0.0
    return len(wanted & _tokens(text)) / len(wanted)


def rank_candidates(name: str, city: str, kind: str, candidates: list[dict], embed=None) -> list[dict]:
    query = " ".join(part for part in (name, city, kind) if part).strip()
    ranked: list[dict] = []
    if embed and candidates:
        vectors = embed(["query: " + query, *["passage: " + f"{item.get('title', '')} {item.get('snippet', '')}" for item in candidates]])
        if vectors and len(vectors) == len(candidates) + 1:
            for item, vector in zip(candidates, vectors[1:]):
                ranked.append({**item, "score": round(_cosine(vectors[0], vector), 4)})
    if not ranked:
        for item in candidates:
            text = f"{item.get('title', '')} {item.get('snippet', '')} {item.get('url', '')}"
            ranked.append({**item, "score": round(lexical_score(query, text), 4)})
    ranked.sort(key=lambda item: item["score"], reverse=True)
    return ranked


def hf_embed(texts: list[str]):
    return _embed_remote(texts)


def _unwrap_duckduckgo(href: str) -> str:
    parsed = urlparse(href)
    target = parse_qs(parsed.query).get("uddg", [""])[0]
    return target or href


def search_web(name: str, city: str, kind: str) -> list[dict]:
    query = f"{name} {city} hyresvärd bostäder".strip()
    try:
        response = httpx.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query},
            headers={"User-Agent": AGENT},
            timeout=12,
            follow_redirects=True,
        )
        response.raise_for_status()
    except Exception:
        return []
    found = []
    for match in re.finditer(r'<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', response.text, re.I | re.S):
        url = _unwrap_duckduckgo(match.group(1))
        title = re.sub(r"<[^>]+>", "", match.group(2))
        if public_url(url):
            found.append({"url": url, "title": title.strip(), "snippet": kind})
        if len(found) >= 5:
            break
    return found


_RENT = re.compile(r"(\d[\d\s]{2,6})\s*kr", re.I)
_FLOOR = re.compile(r"våning\s*(\d+)", re.I)
_ROOMS = re.compile(r"(\d+)\s*rok", re.I)
_SQM = re.compile(r"(\d+)\s*m", re.I)


def _money(text: str) -> int:
    match = _RENT.search(text.replace("\xa0", " "))
    if not match:
        return 0
    return int(re.sub(r"\s", "", match.group(1)))


def _details(text: str) -> dict:
    floor = _FLOOR.search(text)
    rooms = _ROOMS.search(text)
    sqm = _SQM.search(text)
    return {
        "rent": _money(text),
        "floor": int(floor.group(1)) if floor else 1,
        "rooms": int(rooms.group(1)) if rooms else 1,
        "sqm": int(sqm.group(1)) if sqm else 0,
    }


def parse_rss(xml_text: str) -> list[dict]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []
    items = []
    for node in root.iter():
        if not str(node.tag).lower().endswith("item"):
            continue
        title = link = description = ""
        for child in list(node):
            tag = str(child.tag).lower()
            value = "".join(child.itertext()).strip()
            if tag.endswith("title"):
                title = value
            elif tag.endswith("link"):
                link = value
            elif tag.endswith("description"):
                description = value
        text = f"{title} {description}"
        details = _details(text)
        items.append({"title": title, "url": link, "description": description or title, **details, "area": _area(text), "city": _city(text)})
    return items


AREAS = ("Södermalm", "Vasastan", "Kungsholmen", "Hammarby Sjöstad", "Solna", "Sundbyberg", "Majorna", "Linné", "Luthagen")


def _area(text: str) -> str:
    for area in AREAS:
        if area.lower() in text.lower():
            return area
    return ""


def _city(text: str) -> str:
    for city in ("Stockholm", "Göteborg", "Malmö", "Uppsala"):
        if city.lower() in text.lower():
            return city
    return ""


def parse_html(html: str, page_url: str) -> list[dict]:
    chunks = re.findall(r"<article[\s\S]*?</article>|<li[\s\S]*?</li>", html, re.I)
    items = []
    for chunk in chunks:
        if "kr" not in chunk.lower():
            continue
        href = re.search(r'href="([^"]+)"', chunk)
        title = re.sub(r"<[^>]+>", " ", chunk)
        title = re.sub(r"\s+", " ", title).strip()[:140]
        text = title
        details = _details(text)
        if details["rent"] <= 0:
            continue
        items.append({
            "title": title,
            "url": urljoin(page_url, href.group(1)) if href else page_url,
            "description": title,
            **details,
            "area": _area(text),
            "city": _city(text),
        })
    return items[:20]


def keep_listing(item: dict, filters: dict) -> bool:
    max_rent = filters.get("maxRent")
    if max_rent is not None and item.get("rent", 0) > int(max_rent):
        return False
    min_floor = filters.get("minFloor")
    if min_floor is not None and item.get("floor", 1) < int(min_floor):
        return False
    areas = filters.get("areas") or []
    if areas and item.get("area") not in areas and item.get("city") not in areas:
        return False
    min_sqm = filters.get("minSqm") or 0
    if min_sqm and item.get("sqm", 0) and item["sqm"] < int(min_sqm):
        return False
    return True


def rank_listings(profile_text: str, listings: list[dict]) -> list[dict]:
    if not listings:
        return []
    vectors = _embed_remote(["query: " + profile_text, *["passage: " + item.get("description", "") for item in listings]])
    scored = []
    if vectors and len(vectors) == len(listings) + 1:
        for item, vector in zip(listings, vectors[1:]):
            scored.append({**item, "rankScore": round(_cosine(vectors[0], vector), 4)})
    else:
        for item in listings:
            scored.append({**item, "rankScore": round(lexical_score(profile_text, item.get("description", "")), 4)})
    scored.sort(key=lambda item: item["rankScore"], reverse=True)
    return scored


def _wait(host: str) -> None:
    previous = _last_fetch.get(host, 0)
    delay = RATE_SECONDS - (time.monotonic() - previous)
    if delay > 0:
        time.sleep(delay)
    _last_fetch[host] = time.monotonic()


def fetch_listings(page_url: str, client: httpx.Client | None = None) -> tuple[list[dict], str | None]:
    if not public_url(page_url):
        return [], "Adressen kan inte hämtas."
    own_client = client is None
    client = client or httpx.Client(timeout=12, follow_redirects=True, headers={"User-Agent": AGENT})
    try:
        parsed = urlparse(page_url)
        host = parsed.hostname or ""
        _wait(host)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        robots = client.get(robots_url)
        if robots.status_code == 200 and not robots_allows(robots.text, page_url):
            return [], "Sidan ber oss att inte hämta den."
        _wait(host)
        page = client.get(page_url)
        page.raise_for_status()
        body = page.text
        if "<rss" in body.lower() or body.lstrip().startswith("<?xml") or page_url.endswith(".xml"):
            return parse_rss(body), None
        return parse_html(body, page_url), None
    except Exception:
        return [], "Sidan gick inte att läsa."
    finally:
        if own_client:
            client.close()
