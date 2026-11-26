"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui";
import { Paywall, useBillingActions } from "@/components/paywall";
import { billingLabel } from "@/lib/billing";
import { useStore } from "@/lib/store";

export function SubscriptionCard({ preview = false }: { preview?: boolean }) {
  const store = useStore();
  const billing = preview ? { plan: "premium" as const, status: "active" as const, usedAutoApplies: store.billing.usedAutoApplies } : store.billing;
  const { error, pause, resume } = useBillingActions();
  const [paywall, setPaywall] = useState(false);
  const paused = billing.status === "paused";
  const premium = billing.plan === "premium" && billing.status === "active";

  return (
    <section className="mt-6 rounded-3xl border border-line bg-card px-4 py-4">
      <h2 className="text-sm font-medium">Prenumeration</h2>
      <p className="mt-1 text-sm leading-relaxed text-soft">{billingLabel(billing)}</p>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <div className="mt-4 flex flex-col gap-2">
        {premium || preview ? (
          <>
            <Button variant="outline" onClick={() => void pause()}>
              Pausa – jag har hittat bostad
            </Button>
            <Link href="/installningar/prenumeration" className="inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-ink hover:bg-black/5">
              Hantera prenumeration
            </Link>
          </>
        ) : null}
        {paused ? (
          <Button onClick={() => void resume()}>Återuppta Premium</Button>
        ) : null}
        {!premium && !paused && !preview ? (
          <Button onClick={() => setPaywall(true)}>Uppgradera</Button>
        ) : null}
      </div>
      <Paywall open={paywall} onClose={() => setPaywall(false)} />
    </section>
  );
}
