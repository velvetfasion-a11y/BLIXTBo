"""Stripe subscription entitlement. The monthly price and the trial length come from the environment.

The app confirms a SetupIntent or PaymentIntent inside its own sheet. The trial is trial_period_days on the subscription, not a second price and not a coupon.
"""

from blixtbo.config import settings


def price_ore() -> int:
    return int(round(settings.premium_price_kr * 100))


def price_lookup_key() -> str:
    return f"blixtbo_premium_monthly_{int(settings.premium_price_kr)}_sek"


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
