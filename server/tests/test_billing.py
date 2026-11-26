from blixtbo.billing import can_auto_apply, client_secret_from_subscription, entitlement_from_event, entitlement_from_subscription, is_stripe_test_key, period_end_iso, price_lookup_key, price_ore, resume_subscription, schedule_cancel, subscription_data, subscription_view
from blixtbo.config import settings


def test_price_is_99_sek_and_trial_is_three_days():
    settings.premium_price_kr = 99
    settings.trial_days = 3
    assert price_ore() == 9900
    assert price_lookup_key() == "blixtbo_premium_monthly"
    assert is_stripe_test_key("sk_test_abc")
    assert is_stripe_test_key("rk_test_abc")
    assert not is_stripe_test_key("sk_live_abc")
    assert not is_stripe_test_key("rk_live_abc")
    assert not is_stripe_test_key("")
    data = subscription_data("uid-1")
    assert data["trial_period_days"] == 3
    assert data["metadata"]["firebaseUid"] == "uid-1"
    secret, kind = client_secret_from_subscription({"pending_setup_intent": {"client_secret": "seti_secret"}})
    assert secret == "seti_secret" and kind == "setup"
    secret, kind = client_secret_from_subscription({"latest_invoice": {"payment_intent": {"client_secret": "pi_secret"}}})
    assert secret == "pi_secret" and kind == "payment"


def test_free_limit_premium_trial_and_pause():
    assert can_auto_apply("free", "free", 0, 2) is True
    assert can_auto_apply("free", "free", 2, 2) is False
    assert can_auto_apply("premium", "active", 9, 2) is True
    assert can_auto_apply("premium", "paused", 0, 2) is False
    trialing = entitlement_from_subscription({"id": "sub_1", "customer": "cus_1", "status": "trialing", "pause_collection": None})
    assert trialing["plan"] == "premium"
    assert trialing["autoApply"] is True
    assert trialing["trial"] is True


def test_cancel_at_period_end_keeps_access_until_the_period_ends():
    ending = entitlement_from_subscription({
        "id": "sub_1",
        "customer": "cus_1",
        "status": "active",
        "cancel_at_period_end": True,
        "current_period_end": 1_800_000_000,
    })
    assert ending["plan"] == "premium"
    assert ending["status"] == "active"
    assert ending["autoApply"] is True
    assert ending["cancelAtPeriodEnd"] is True
    assert ending["currentPeriodEnd"] == period_end_iso({"current_period_end": 1_800_000_000})
    view = subscription_view({"id": "sub_1", "customer": "cus_1", "status": "active", "cancel_at_period_end": True, "current_period_end": 1_800_000_000})
    assert view["status"] == "active"
    assert view["cancelAtPeriodEnd"] is True
    assert subscription_view(None)["status"] == "free"


class _CancelStripe:
    def __init__(self, subscription):
        self.subscription = dict(subscription)
        self.modifies = []
        self.cancels = []

    def Subscription_modify(self, sub_id, **params):
        self.modifies.append(params)
        self.subscription.update(params)
        if params.get("pause_collection") == "":
            self.subscription["pause_collection"] = None
        return dict(self.subscription)

    class Subscription:
        def __init__(self, owner):
            self.owner = owner

        def modify(self, sub_id, **params):
            return self.owner.Subscription_modify(sub_id, **params)

        def cancel(self, sub_id):
            self.owner.cancels.append(sub_id)


def test_schedule_cancel_is_idempotent_and_does_not_end_now():
    stripe = _CancelStripe({"id": "sub_1", "status": "active", "cancel_at_period_end": False, "pause_collection": None})
    stripe.Subscription = _CancelStripe.Subscription(stripe)
    first = schedule_cancel(stripe, dict(stripe.subscription))
    assert first["cancel_at_period_end"] is True
    assert stripe.cancels == []
    second = schedule_cancel(stripe, dict(stripe.subscription))
    assert second["cancel_at_period_end"] is True
    assert len(stripe.modifies) == 1
    resumed = resume_subscription(stripe, dict(stripe.subscription))
    assert resumed["cancel_at_period_end"] is False
    again = resume_subscription(stripe, dict(stripe.subscription))
    assert again["cancel_at_period_end"] is False
    assert len(stripe.modifies) == 2


def test_resume_clears_pause_and_a_scheduled_cancel():
    stripe = _CancelStripe({
        "id": "sub_1",
        "status": "active",
        "cancel_at_period_end": True,
        "pause_collection": {"behavior": "void"},
    })
    stripe.Subscription = _CancelStripe.Subscription(stripe)
    resumed = resume_subscription(stripe, dict(stripe.subscription))
    assert resumed["cancel_at_period_end"] is False
    assert resumed["pause_collection"] is None
    assert stripe.cancels == []


def test_webhook_events_map_to_entitlement():
    paused = entitlement_from_event({
        "type": "customer.subscription.updated",
        "data": {"object": {"id": "sub_1", "customer": "cus_1", "status": "active", "pause_collection": {"behavior": "void"}, "metadata": {"firebaseUid": "uid-1"}}},
    })
    assert paused["status"] == "paused"
    assert paused["autoApply"] is False
    deleted = entitlement_from_event({
        "type": "customer.subscription.deleted",
        "data": {"object": {"id": "sub_1", "customer": "cus_1", "status": "active"}},
    })
    assert deleted["plan"] == "free"
    assert deleted["status"] == "canceled"
    created = entitlement_from_event({
        "type": "customer.subscription.created",
        "data": {"object": {"id": "sub_1", "customer": "cus_1", "status": "trialing", "metadata": {"firebaseUid": "uid-1"}}},
    })
    assert created["plan"] == "premium"
    assert created["trial"] is True
    started = entitlement_from_event({
        "type": "checkout.session.completed",
        "data": {"object": {"customer": "cus_1", "subscription": "sub_1", "client_reference_id": "uid-1"}},
    })
    assert started["plan"] == "premium"
    assert started["trial"] is True
