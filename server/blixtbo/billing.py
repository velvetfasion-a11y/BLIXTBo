"""Stripe subscription entitlement. The monthly price and the trial length come from the environment.

Checkout uses one recurring Price in SEK. The free trial is trial_period_days on that checkout, not a second price and not a coupon.
"""

from blixtbo.config import settings


def price_ore() -> int:
    return int(round(settings.premium_price_kr * 100))


def subscription_data(firebase_uid: str) -> dict:
    return {
        "trial_period_days": settings.trial_days,
        "metadata": {"firebaseUid": firebase_uid},
    }


def can_auto_apply(plan: str, status: str, used: int, free_limit: int | None = None) -> bool:
    limit = settings.free_auto_apply_limit if free_limit is None else free_limit
    if status == "paused":
        return False
    if plan == "premium" and status == "active":
        return True
    return used < limit


def entitlement_from_subscription(subscription: dict) -> dict:
    status = str(subscription.get("status") or "")
    paused = bool(subscription.get("pause_collection"))
    customer = subscription.get("customer")
    sub_id = subscription.get("id")
    base = {
        "stripeCustomerId": customer if isinstance(customer, str) else (customer or {}).get("id", ""),
        "stripeSubscriptionId": sub_id or "",
    }
    if status in ("canceled", "incomplete_expired", "unpaid"):
        return {**base, "plan": "free", "status": "canceled", "autoApply": False}
    if paused or status == "paused":
        return {**base, "plan": "premium", "status": "paused", "autoApply": False}
    if status in ("active", "trialing"):
        return {**base, "plan": "premium", "status": "active", "autoApply": True, "trial": status == "trialing"}
    return {**base, "plan": "free", "status": "free", "autoApply": False}


def entitlement_from_event(event: dict) -> dict | None:
    kind = event.get("type")
    data = (event.get("data") or {}).get("object") or {}
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
