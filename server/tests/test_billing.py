from blixtbo.billing import WEBHOOK_EVENTS, WEBHOOK_URL, can_auto_apply, client_secret_from_subscription, ensure_billing_webhook, ensure_premium_catalog, entitlement_from_event, entitlement_from_subscription, is_stripe_secret_key, period_end_iso, price_lookup_key, price_ore, redact_stripe_secret, resume_subscription, schedule_cancel, subscription_data, subscription_view
from blixtbo.config import settings


def test_price_is_99_sek_and_trial_is_three_days():
    settings.premium_price_kr = 99
    settings.trial_days = 3
    assert price_ore() == 9900
    assert price_lookup_key() == "blixtbo_premium_monthly"
    assert is_stripe_secret_key("sk_test_abc")
    assert is_stripe_secret_key("rk_test_abc")
    assert is_stripe_secret_key("sk_live_abc")
    assert is_stripe_secret_key("rk_live_abc")
    assert not is_stripe_secret_key("")
    assert not is_stripe_secret_key("sk_live")
    assert not is_stripe_secret_key("sk_live_")
    assert not is_stripe_secret_key("rk_test_")
    assert not is_stripe_secret_key("pk_test_abc")
    assert not is_stripe_secret_key("pk_live_abc")
    assert not is_stripe_secret_key(" sk_test_abc")
    assert not is_stripe_secret_key("not-a-key")
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
    assert can_auto_apply("premium", "trialing", 9, 2) is True
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


class _Page:
    def __init__(self, data, has_more=False):
        self.data = data
        self.has_more = has_more


class _Obj:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class _CatalogStripe:
    def __init__(self):
        self.products = []
        self.prices = []
        self.endpoints = []
        self.modifies = []
        self.Product = self._Product(self)
        self.Price = self._Price(self)
        self.WebhookEndpoint = self._Hooks(self)

    class _Product:
        def __init__(self, owner):
            self.owner = owner

        def list(self, **kwargs):
            rows = [item for item in self.owner.products if item.get("active", True)]
            return _Page([_Obj(**item) for item in rows])

        def create(self, **kwargs):
            item = {"id": f"prod_{len(self.owner.products) + 1}", "active": True, **kwargs}
            self.owner.products.append(item)
            return _Obj(**item)

    class _Price:
        def __init__(self, owner):
            self.owner = owner

        def list(self, **kwargs):
            keys = set(kwargs.get("lookup_keys") or [])
            rows = [item for item in self.owner.prices if item.get("active", True) and item.get("lookup_key") in keys]
            return _Page([_Obj(**item) for item in rows[: kwargs.get("limit", 10)]])

        def create(self, **kwargs):
            item = {"id": f"price_{len(self.owner.prices) + 1}", "active": True, **kwargs}
            self.owner.prices.append(item)
            return _Obj(**item)

    class _Hooks:
        def __init__(self, owner):
            self.owner = owner

        def list(self, **kwargs):
            return _Page([_Obj(**item) for item in self.owner.endpoints])

        def create(self, **kwargs):
            item = {"id": f"we_{len(self.owner.endpoints) + 1}", "secret": "whsec_do_not_print", **kwargs}
            self.owner.endpoints.append(item)
            return _Obj(**item)

        def modify(self, endpoint_id, **kwargs):
            self.owner.modifies.append((endpoint_id, kwargs))
            for item in self.owner.endpoints:
                if item["id"] == endpoint_id:
                    item.update(kwargs)
                    return _Obj(**item)
            raise AssertionError(endpoint_id)


def test_catalog_and_webhook_are_created_once_for_the_key_mode():
    settings.premium_price_kr = 99
    settings.trial_days = 3
    stripe = _CatalogStripe()
    product_id, price_id = ensure_premium_catalog(stripe)
    webhook_id = ensure_billing_webhook(stripe)
    assert product_id == "prod_1"
    assert price_id == "price_1"
    assert webhook_id == "we_1"
    assert stripe.products[0]["name"] == "Blixtbo Premium"
    assert stripe.prices[0]["unit_amount"] == 9900
    assert stripe.prices[0]["currency"] == "sek"
    assert stripe.prices[0]["recurring"] == {"interval": "month"}
    assert stripe.prices[0]["lookup_key"] == "blixtbo_premium_monthly"
    assert stripe.endpoints[0]["url"] == WEBHOOK_URL
    assert tuple(stripe.endpoints[0]["enabled_events"]) == WEBHOOK_EVENTS
    again_product, again_price = ensure_premium_catalog(stripe)
    again_webhook = ensure_billing_webhook(stripe)
    assert (again_product, again_price, again_webhook) == (product_id, price_id, webhook_id)
    assert len(stripe.products) == 1
    assert len(stripe.prices) == 1
    assert len(stripe.endpoints) == 1
    assert stripe.modifies == []


def test_missing_price_reuses_the_named_product():
    settings.premium_price_kr = 99
    stripe = _CatalogStripe()
    stripe.products.append({"id": "prod_existing", "active": True, "name": "Blixtbo Premium"})
    product_id, price_id = ensure_premium_catalog(stripe)
    assert product_id == "prod_existing"
    assert price_id == "price_1"
    assert len(stripe.products) == 1
    assert stripe.prices[0]["product"] == "prod_existing"


def test_webhook_gains_missing_events_without_a_second_endpoint():
    stripe = _CatalogStripe()
    stripe.endpoints.append({"id": "we_old", "url": WEBHOOK_URL, "enabled_events": ["invoice.paid"]})
    webhook_id = ensure_billing_webhook(stripe)
    assert webhook_id == "we_old"
    assert len(stripe.endpoints) == 1
    assert set(WEBHOOK_EVENTS).issubset(set(stripe.endpoints[0]["enabled_events"]))
    assert stripe.endpoints[0]["enabled_events"][0] == "invoice.paid"


def test_setup_prints_ids_and_never_the_key(capsys):
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parents[1] / "scripts" / "stripe_setup.py"
    spec = importlib.util.spec_from_file_location("blixtbo_stripe_setup", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    secret = "sk_live_supersecretvalue"
    previous = settings.stripe_secret_key
    settings.stripe_secret_key = secret
    settings.premium_price_kr = 99
    settings.trial_days = 3
    stripe = _CatalogStripe()
    try:
        code = module.main(stripe)
        captured = capsys.readouterr()
        assert code == 0
        text = captured.out + captured.err
        assert "STRIPE_PRODUCT_ID=prod_1" in captured.out
        assert "STRIPE_PRICE_ID=price_1" in captured.out
        assert "STRIPE_WEBHOOK_ENDPOINT_ID=we_1" in captured.out
        assert "99 kr/mån efter 3 dagars provperiod." in captured.out
        assert secret not in text
        assert "whsec_" not in text
        assert redact_stripe_secret(f"failed {secret} whsec_abc", secret) == "failed [redacted] [redacted]"
        settings.stripe_secret_key = "not-a-key"
        refused = module.main(stripe)
        refused_text = capsys.readouterr()
        assert refused == 1
        assert "not-a-key" not in refused_text.out + refused_text.err
        assert len(stripe.products) == 1
    finally:
        settings.stripe_secret_key = previous


class _BoomStripe:
    class Price:
        @staticmethod
        def list(**kwargs):
            raise RuntimeError("auth failed for sk_live_supersecretvalue")


def test_setup_failure_redacts_the_key(capsys):
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parents[1] / "scripts" / "stripe_setup.py"
    spec = importlib.util.spec_from_file_location("blixtbo_stripe_setup_fail", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    secret = "sk_live_supersecretvalue"
    previous = settings.stripe_secret_key
    settings.stripe_secret_key = secret
    try:
        code = module.main(_BoomStripe())
    finally:
        settings.stripe_secret_key = previous
    captured = capsys.readouterr()
    assert code == 1
    assert secret not in captured.out + captured.err
    assert "[redacted]" in captured.err
