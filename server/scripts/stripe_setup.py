"""Create the Blixtbo Premium price in Stripe test mode.

The price is PREMIUM_PRICE_KR per month (default 99 SEK). The 3-day trial is not part of the price. Checkout adds trial_period_days from TRIAL_DAYS. No coupon. Does not charge anyone.
"""

import os
import sys

import stripe

from blixtbo.billing import price_ore
from blixtbo.config import settings


def main() -> int:
    key = settings.stripe_secret_key or os.environ.get("STRIPE_SECRET_KEY", "")
    if not key.startswith("sk_test_"):
        print("Sätt STRIPE_SECRET_KEY till en testnyckel (sk_test_...). Inga live-nycklar.", file=sys.stderr)
        return 1
    stripe.api_key = key
    product = stripe.Product.create(name="Blixtbo Premium")
    price = stripe.Price.create(
        product=product.id,
        unit_amount=price_ore(),
        currency="sek",
        recurring={"interval": "month"},
    )
    print(f"STRIPE_PRICE_ID={price.id}")
    print(int(settings.premium_price_kr), "kr/mån efter", int(settings.trial_days), "dagars provperiod.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
