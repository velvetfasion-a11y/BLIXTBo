"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { billingLabel, Paywall, useBillingActions } from "@/components/paywall";
import { useStore } from "@/lib/store";

export function SubscriptionCard({ preview = false }: { preview?: boolean }) {
  const store = useStore();
  const billing = preview ? { plan: "premium" as const, status: "active" as const, usedAutoApplies: store.billing.usedAutoApplies } : store.billing;
  const { error, pause, resume, cancel } = useBillingActions();
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
            <Button variant="ghost" onClick={() => void cancel()}>
              Avsluta prenumerationen
            </Button>
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
