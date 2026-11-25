"""Match a listing to a profile without a paid model.

Hard requirements (income, documents) are rules. Fuzzy wording in the ad
is compared with a small open embedding model.
"""

import math

import httpx

from blixtbo.config import settings

MODEL = "intfloat/multilingual-e5-small"


def rule_check(profile: dict, listing: dict) -> dict:
    rent = float(listing.get("rent") or 0)
    multiple = float(listing.get("income_multiple") or 3)
    income = float(profile.get("monthly_income") or 0)
    required = rent * multiple
    missing = []
    for key in listing.get("requires") or []:
        if key == "letter" and len((profile.get("letter") or "").strip()) < 80:
            missing.append("personligt brev")
        elif key != "letter" and not (profile.get("documents") or {}).get(key):
            missing.append(key)
    return {
        "income_ok": income >= required if required else True,
        "required_income": required,
        "missing_documents": missing,
        "ready": income >= required and not missing,
    }


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _embed_remote(texts: list[str]) -> list[list[float]] | None:
    headers = {"Content-Type": "application/json"}
    if settings.hf_token:
        headers["Authorization"] = f"Bearer {settings.hf_token}"
    url = f"https://router.huggingface.co/hf-inference/models/{settings.hf_model}/pipeline/feature-extraction"
    try:
        response = httpx.post(url, headers=headers, json={"inputs": texts}, timeout=30)
        response.raise_for_status()
        data = response.json()
    except Exception:
        return None
    if not data or not isinstance(data, list):
        return None
    # The endpoint may return token vectors. Mean-pool those.
    pooled = []
    for item in data:
        if item and isinstance(item[0], list):
            width = len(item[0])
            pooled.append([sum(row[i] for row in item) / len(item) for i in range(width)])
        else:
            pooled.append(item)
    return pooled


def semantic_fit(profile: dict, listing: dict) -> float | None:
    if settings.match_backend != "hf-inference":
        return None
    profile_text = "query: " + " ".join(
        str(profile.get(key) or "")
        for key in ("occupation", "employment_type", "letter", "city")
    )
    listing_text = "passage: " + " ".join(
        str(listing.get(key) or "") for key in ("title", "description", "requirements_text")
    )
    vectors = _embed_remote([profile_text, listing_text])
    if not vectors or len(vectors) < 2:
        return None
    return _cosine(vectors[0], vectors[1])


def match_listing(profile: dict, listing: dict) -> dict:
    result = rule_check(profile, listing)
    result["semantic_fit"] = semantic_fit(profile, listing)
    result["model"] = settings.hf_model
    return result
