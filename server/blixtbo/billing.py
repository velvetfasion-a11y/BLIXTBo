"""Stripe subscription entitlement. The monthly price and the trial length come from the environment.

The app confirms a SetupIntent or PaymentIntent inside its own sheet. The trial is trial_period_days on the subscription, not a second price and not a coupon.
Cancelling keeps access until the period ends (cancel_at_period_end). It does not open a Stripe-hosted page.
"""

from datetime import datetime, timezone

from blixtbo.config import settings


def price_ore() -> int:
    return int(round(settings.premium_price_kr * 100))


def price_lookup_key() -> str:
    """Existing Stripe Price. STRIPE_PRICE_ID wins when it is set."""
    return "blixtbo_premium_monthly"


def is_stripe_test_key(key: str) -> bool:
    """Secret or restricted test keys. Live keys (sk_live_, rk_live_) are refused."""
    return key.startswith(("sk_test_", "rk_test_"))


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
