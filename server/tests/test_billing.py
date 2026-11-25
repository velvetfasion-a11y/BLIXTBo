from blixtbo.billing import can_auto_apply, client_secret_from_subscription, entitlement_from_event, entitlement_from_subscription, is_stripe_test_key, price_lookup_key, price_ore, subscription_data
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
