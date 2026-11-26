"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { dailyQueueCount } from "@/lib/billing";
import { Paywall } from "@/components/paywall";
import { passesFilters } from "@/lib/profile";
import { useStore } from "@/lib/store";

export function QueueNudge() {
  const store = useStore();
  const [paywall, setPaywall] = useState(false);
  if (store.billing.plan === "premium" && store.billing.status === "active") return null;
  const count = dailyQueueCount(store.listings, store.filters, store.sources, passesFilters);
  if (count < 1) return null;
  return (
    <>
      <div className="mb-3 shrink-0 rounded-2xl bg-pine-soft px-4 py-3">
        <p className="text-sm font-medium text-pine-deep">
          Du hade kommit med i {count} {count === 1 ? "kö" : "köer"} i dag
        </p>
        <p className="mt-1 text-sm leading-relaxed text-pine-deep/80">
          Premium hade ansökt automatiskt på {count === 1 ? "bostaden" : "bostäderna"} som matchade dina filter.
        </p>
        <Button size="sm" className="mt-3" onClick={() => setPaywall(true)}>
          Uppgradera
        </Button>
      </div>
      <Paywall open={paywall} onClose={() => setPaywall(false)} />
    </>
  );
}
