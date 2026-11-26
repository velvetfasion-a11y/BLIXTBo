"""Stripe subscription entitlement. The monthly price and the trial length come from the environment.

The app confirms a SetupIntent or PaymentIntent inside its own sheet. The trial is trial_period_days on the subscription, not a second price and not a coupon.
Cancelling keeps access until the period ends (cancel_at_period_end). It does not open a Stripe-hosted page.
"""

import re
from datetime import datetime, timezone

from blixtbo.config import settings

PRODUCT_NAME = "Blixtbo Premium"
WEBHOOK_URL = "https://blixtbo.se/api/billing/webhook"
WEBHOOK_EVENTS = (
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.trial_will_end",
    "invoice.paid",
    "invoice.payment_failed",
    "setup_intent.succeeded",
    "payment_intent.succeeded",
    "checkout.session.completed",
)
_SECRET_KEY = re.compile(r"^(?:sk|rk)_(?:test|live)_\S+$")


def price_ore() -> int:
    return int(round(settings.premium_price_kr * 100))


def price_lookup_key() -> str:
    """Existing Stripe Price. STRIPE_PRICE_ID wins when it is set."""
    return "blixtbo_premium_monthly"


def is_stripe_secret_key(key: str) -> bool:
    """Secret or restricted keys in test or live mode. Empty, publishable, and malformed keys are refused."""
    return isinstance(key, str) and bool(_SECRET_KEY.fullmatch(key))


def redact_stripe_secret(text: str, key: str = "") -> str:
    if key:
        text = text.replace(key, "[redacted]")
    text = re.sub(r"\b(?:sk|rk|pk)_(?:test|live)_\S+", "[redacted]", text)
    return re.sub(r"\bwhsec_\S+", "[redacted]", text)


def _stripe_id(value) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return str(value.get("id") or "")
    return str(getattr(value, "id", "") or "")


def _stripe_get(value, name: str, default=None):
    if isinstance(value, dict):
        return value.get(name, default)
    return getattr(value, name, default)


def _page_data(page) -> list:
    return list(getattr(page, "data", []) or [])


def _find_product(stripe, name: str) -> str:
    starting_after = None
    while True:
        params: dict = {"active": True, "limit": 100}
        if starting_after:
            params["starting_after"] = starting_after
        page = stripe.Product.list(**params)
        data = _page_data(page)
        for item in data:
            if _stripe_get(item, "name") == name:
                return _stripe_id(item)
        if not data or not getattr(page, "has_more", False):
            return ""
        starting_after = _stripe_id(data[-1])


def ensure_premium_catalog(stripe) -> tuple[str, str]:
    """Product plus the monthly price. A second call returns the same ids."""
    key = price_lookup_key()
    existing = stripe.Price.list(lookup_keys=[key], active=True, limit=1)
    found = _page_data(existing)
    if found:
        price = found[0]
        product = _stripe_get(price, "product", "")
        product_id = product if isinstance(product, str) else _stripe_id(product)
        return product_id, _stripe_id(price)
    product_id = _find_product(stripe, PRODUCT_NAME)
    if not product_id:
        created = stripe.Product.create(name=PRODUCT_NAME)
        product_id = _stripe_id(created)
    price = stripe.Price.create(
        product=product_id,
        unit_amount=price_ore(),
        currency="sek",
        recurring={"interval": "month"},
        lookup_key=key,
    )
    return product_id, _stripe_id(price)


def ensure_billing_webhook(stripe, url: str = WEBHOOK_URL) -> str:
    """One endpoint for the billing URL. Missing events are added. The secret is not returned."""
    starting_after = None
    while True:
        params: dict = {"limit": 100}
        if starting_after:
            params["starting_after"] = starting_after
        page = stripe.WebhookEndpoint.list(**params)
        data = _page_data(page)
        for item in data:
            if _stripe_get(item, "url") != url:
                continue
            endpoint_id = _stripe_id(item)
            current = list(_stripe_get(item, "enabled_events", []) or [])
            if "*" not in current:
                merged = list(dict.fromkeys([*current, *WEBHOOK_EVENTS]))
                if set(merged) != set(current):
                    stripe.WebhookEndpoint.modify(endpoint_id, enabled_events=merged)
            return endpoint_id
        if not data or not getattr(page, "has_more", False):
            break
        starting_after = _stripe_id(data[-1])
    created = stripe.WebhookEndpoint.create(url=url, enabled_events=list(WEBHOOK_EVENTS))
    return _stripe_id(created)


def subscription_data(firebase_uid: str) -> dict:
    return {
        "trial_period_days": settings.trial_days,
        "metadata": {"firebaseUid": firebase_uid},
    }


def client_secret_from_subscription(subscription: dict) -> tuple[str, str]:
    """Trial checkouts confirm a SetupIntent. A charge confirms the invoice PaymentIntent."""
    setup = subscription.get("pending_setup_intent")
    if isinstance(setup, dict) and setup.get("client_secret"):
        return str(setup["client_secret"]), "setup"
    invoice = subscription.get("latest_invoice") or {}
    if isinstance(invoice, dict):
        intent = invoice.get("payment_intent")
        if isinstance(intent, dict) and intent.get("client_secret"):
            return str(intent["client_secret"]), "payment"
    raise ValueError("no client secret")


def can_auto_apply(plan: str, status: str, used: int, free_limit: int | None = None) -> bool:
    limit = settings.free_auto_apply_limit if free_limit is None else free_limit
    if status == "paused":
        return False
    if plan == "premium" and status in ("active", "trialing"):
        return True
    return used < limit


def as_dict(value) -> dict:
    if value is None:
        return {}
    if hasattr(value, "to_dict"):
        return value.to_dict()
    if isinstance(value, dict):
        return value
    return {}


def period_end_iso(subscription: dict) -> str | None:
    raw = subscription.get("current_period_end")
    if raw in (None, ""):
        items = subscription.get("items") or {}
        data = items.get("data") if isinstance(items, dict) else None
        if data:
            raw = data[0].get("current_period_end")
    if isinstance(raw, (int, float)) and raw > 0:
        return datetime.fromtimestamp(int(raw), timezone.utc).isoformat()
    if isinstance(raw, str) and raw:
        return raw
    return None


def entitlement_from_subscription(subscription: dict) -> dict:
    status = str(subscription.get("status") or "")
    paused = bool(subscription.get("pause_collection"))
    customer = subscription.get("customer")
    sub_id = subscription.get("id")
    base = {
        "stripeCustomerId": customer if isinstance(customer, str) else (customer or {}).get("id", ""),
        "stripeSubscriptionId": sub_id or "",
        "cancelAtPeriodEnd": bool(subscription.get("cancel_at_period_end")),
        "currentPeriodEnd": period_end_iso(subscription),
    }
    if status in ("canceled", "incomplete_expired", "unpaid"):
        return {**base, "plan": "free", "status": "canceled", "autoApply": False}
    if paused or status == "paused":
        return {**base, "plan": "premium", "status": "paused", "autoApply": False}
    if status in ("active", "trialing"):
        return {**base, "plan": "premium", "status": "active", "autoApply": True, "trial": status == "trialing"}
    return {**base, "plan": "free", "status": "free", "autoApply": False}


def subscription_view(subscription: dict | None) -> dict:
    """What the app shows. Access stays until currentPeriodEnd when cancel is scheduled."""
    if not subscription:
        return {"plan": "free", "status": "free", "cancelAtPeriodEnd": False, "currentPeriodEnd": None, "trial": False}
    entitlement = entitlement_from_subscription(subscription)
    return {
        "plan": entitlement["plan"],
        "status": entitlement["status"],
        "cancelAtPeriodEnd": bool(entitlement.get("cancelAtPeriodEnd")),
        "currentPeriodEnd": entitlement.get("currentPeriodEnd"),
        "trial": bool(entitlement.get("trial")),
    }


def schedule_cancel(stripe, subscription: dict) -> dict:
    """Idempotent. A second call does not change a subscription that already ends at period end."""
    status = str(subscription.get("status") or "")
    if status in ("canceled", "incomplete_expired"):
        return subscription
    if subscription.get("cancel_at_period_end"):
        return subscription
    updated = stripe.Subscription.modify(subscription["id"], cancel_at_period_end=True)
    return as_dict(updated)


def resume_subscription(stripe, subscription: dict) -> dict:
    """Clear a scheduled cancel, a pause, or both. A fully ended subscription is left as it is."""
    status = str(subscription.get("status") or "")
    if status in ("canceled", "incomplete_expired"):
        return subscription
    params: dict = {}
    if subscription.get("cancel_at_period_end"):
        params["cancel_at_period_end"] = False
    if subscription.get("pause_collection"):
        params["pause_collection"] = ""
    if not params:
        return subscription
    updated = stripe.Subscription.modify(subscription["id"], **params)
    return as_dict(updated)


def entitlement_from_event(event: dict) -> dict | None:
    kind = event.get("type")
    data = (event.get("data") or {}).get("object") or {}
    if kind in ("customer.subscription.created", "customer.subscription.updated"):
        return entitlement_from_subscription(data)
    if kind == "checkout.session.completed":
        subscription = data.get("subscription")
        if isinstance(subscription, dict):
            return entitlement_from_subscription(subscription)
        return {
            "plan": "premium",
            "status": "active",
            "autoApply": True,
            "trial": True,
            "stripeCustomerId": data.get("customer") or "",
            "stripeSubscriptionId": subscription or "",
        }
    if kind == "customer.subscription.updated":
        return entitlement_from_subscription(data)
    if kind == "customer.subscription.deleted":
        return entitlement_from_subscription({**data, "status": "canceled", "pause_collection": None})
    return None


def firebase_uid_from_event(event: dict) -> str:
    data = (event.get("data") or {}).get("object") or {}
    metadata = data.get("metadata") or {}
    if metadata.get("firebaseUid"):
        return str(metadata["firebaseUid"])
    return str(data.get("client_reference_id") or "")
