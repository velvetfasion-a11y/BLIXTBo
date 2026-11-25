"use client";

import { useState } from "react";
import { Button, Sheet } from "@/components/ui";
import { track } from "@/lib/analytics";
import { premiumPriceKr, trialDays } from "@/lib/billing";
import { firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";
import { useStore } from "@/lib/store";
import type { Billing } from "@/lib/types";

function apiBase() {
  return (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
}

async function postBilling(path: string) {
  const user = firebaseConfigured() ? firebaseAuth().currentUser : null;
  const token = user ? await user.getIdToken() : "";
  const response = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Betalningen gick inte att starta.");
  }
  return data as { url?: string; status?: string };
}

export function Paywall({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const days = trialDays();
  const price = premiumPriceKr();

  async function upgrade() {
    setBusy(true);
    setError("");
    try {
      const data = await postBilling("/billing/checkout");
      if (data.url) window.location.href = data.url;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Stripe-testnyckel saknas.");
    }
    setBusy(false);
  }

  return (
    <Sheet open={open} title="Blixtbo Premium" onClose={onClose}>
      <p className="text-sm font-medium text-pine">Gratis räcker för att titta</p>
      <h2 className="mt-2 font-serif text-[1.7rem] leading-tight tracking-[-0.03em]">Ansök utan tak</h2>
      <p className="mt-3 text-sm leading-relaxed text-soft">
        Svep och se bostäder utan att betala. Premium skickar ansökan åt dig, utan gräns.
      </p>
      <p className="mt-4 font-serif text-4xl tracking-[-0.03em]">
        {days} dagar<span className="text-base text-soft"> gratis</span>
      </p>
      <p className="mt-1 text-sm text-soft">
        Sedan {price} kr/mån. Ingen bindningstid. Testläge, ingen riktig debitering här.
      </p>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <Button size="lg" className="mt-5 w-full" disabled={busy} onClick={() => void upgrade()}>
        {busy ? "Öppnar Stripe…" : "Uppgradera"}
      </Button>
      <button type="button" className="mt-3 text-sm text-soft" onClick={onClose}>
        Inte nu
      </button>
    </Sheet>
  );
}

export function useBillingActions() {
  const store = useStore();
  const [error, setError] = useState("");

  async function pause() {
    setError("");
    try {
      await postBilling("/billing/pause");
      track("subscription_paused");
      store.setBilling({ ...store.billing, plan: "premium", status: "paused" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gick inte att pausa.");
    }
  }

  async function resume() {
    setError("");
    try {
      await postBilling("/billing/resume");
      store.setBilling({ ...store.billing, plan: "premium", status: "active" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gick inte att återuppta.");
    }
  }

  return { error, pause, resume };
}

export function billingLabel(billing: Billing) {
  if (billing.status === "paused") return "Premium är pausat. Automatiska ansökningar är av.";
  if (billing.plan === "premium" && billing.status === "active") return "Premium. Ansökningar går utan tak.";
  return "Gratis. Ett par automatiska ansökningar ingår.";
}
