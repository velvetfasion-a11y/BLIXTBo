"""Create the Blixtbo Premium product, the monthly price, and the billing webhook.

The price is PREMIUM_PRICE_KR per month (default 99 SEK). The 3-day trial is trial_period_days
on the subscription, not part of the price and not a coupon. The same script works for a test
key (sk_test_ or rk_test_) and a live key (sk_live_ or rk_live_). A second run reuses the
product, the price, and the webhook. Prints ids. Never prints the key.
"""

import os
import sys

from blixtbo.billing import (
    WEBHOOK_URL,
    ensure_billing_webhook,
    ensure_premium_catalog,
    is_stripe_secret_key,
    redact_stripe_secret,
)
from blixtbo.config import settings


def main(stripe_client=None) -> int:
    key = settings.stripe_secret_key or os.environ.get("STRIPE_SECRET_KEY", "")
    if not is_stripe_secret_key(key):
        print(
            "Sätt STRIPE_SECRET_KEY till en giltig nyckel (sk_test_, rk_test_, sk_live_ eller rk_live_).",
            file=sys.stderr,
        )
        return 1
    client = stripe_client
    if client is None:
        import stripe

        stripe.api_key = key
        client = stripe
    try:
        product_id, price_id = ensure_premium_catalog(client)
        webhook_id = ensure_billing_webhook(client)
    except Exception as exc:
        print(f"Stripe-uppsättningen misslyckades: {redact_stripe_secret(str(exc), key)}", file=sys.stderr)
        return 1
    print(f"STRIPE_PRODUCT_ID={product_id}")
    print(f"STRIPE_PRICE_ID={price_id}")
    print(f"STRIPE_WEBHOOK_ENDPOINT_ID={webhook_id}")
    print(int(settings.premium_price_kr), "kr/mån efter", int(settings.trial_days), "dagars provperiod.")
    print("Webhook:", WEBHOOK_URL)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
