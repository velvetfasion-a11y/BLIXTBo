"""Create the Blixtbo Premium price in Stripe test mode.

The price is PREMIUM_PRICE_KR per month (default 99 SEK). The 3-day trial is trial_period_days on the subscription, not part of the price and not a coupon. The API also creates this price by lookup key. Does not charge anyone.
"""

import os
import sys

import stripe

from blixtbo.billing import price_lookup_key, price_ore
from blixtbo.config import settings


def main() -> int:
    key = settings.stripe_secret_key or os.environ.get("STRIPE_SECRET_KEY", "")
    if not key.startswith("sk_test_"):
        print("Sätt STRIPE_SECRET_KEY till en testnyckel (sk_test_...). Inga live-nycklar.", file=sys.stderr)
        return 1
    stripe.api_key = key
    key_name = price_lookup_key()
    existing = stripe.Price.list(lookup_keys=[key_name], active=True, limit=1)
    if existing.data:
        print(f"STRIPE_PRICE_ID={existing.data[0].id}")
        return 0
    product = stripe.Product.create(name="Blixtbo Premium")
    price = stripe.Price.create(
        product=product.id,
        unit_amount=price_ore(),
        currency="sek",
        recurring={"interval": "month"},
        lookup_key=key_name,
    )
    print(f"STRIPE_PRICE_ID={price.id}")
    print(int(settings.premium_price_kr), "kr/mån efter", int(settings.trial_days), "dagars provperiod.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
