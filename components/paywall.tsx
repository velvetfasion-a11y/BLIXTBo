"use client";

import { useState } from "react";
import { Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Button, Sheet } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { premiumPriceKr, trialDays } from "@/lib/billing";
import { firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";
import { useStore } from "@/lib/store";

function publishableKey() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
  return key.startsWith("pk_test_") ? key : "";
}

const stripePromise: Promise<Stripe | null> | null = publishableKey() ? loadStripe(publishableKey()) : null;

async function postBilling(path: string) {
  const { response, data, detail } = await apiFetch(path, { method: "POST" });
  if (!response.ok) {
    throw new Error(detail || "Betalningen gick inte att starta.");
  }
  return data as { clientSecret?: string; intentType?: "setup" | "payment"; status?: string };
}

const appearance = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#146048",
    colorBackground: "#fffcf8",
    colorText: "#1c1916",
    colorDanger: "#8e3330",
    borderRadius: "16px",
    fontFamily: "Familjen Grotesk, Avenir Next, sans-serif",
  },
};

function PaymentForm({
  intentType,
  onSuccess,
}: {
  intentType: "setup" | "payment";
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!stripe || !elements) return;
    setBusy(true);
    setError("");
    const submitted = await elements.submit();
    if (submitted.error) {
      setError(submitted.error.message || "Kortet gick inte att bekräfta.");
      setBusy(false);
      return;
    }
    const confirmParams = { return_url: window.location.href };
    const result = intentType === "setup"
      ? await stripe.confirmSetup({ elements, confirmParams, redirect: "if_required" })
      : await stripe.confirmPayment({ elements, confirmParams, redirect: "if_required" });
    if (result.error) {
      setError(result.error.message || "Kortet gick inte att bekräfta.");
      setBusy(false);
      return;
    }
    onSuccess();
  }

  return (
    <div className="mt-4 space-y-4">
      <ExpressCheckoutElement onConfirm={() => void confirm()} />
      <PaymentElement options={{ layout: "tabs", wallets: { applePay: "never", googlePay: "never" } }} />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button size="lg" className="w-full" disabled={!stripe || busy} onClick={() => void confirm()}>
        {busy ? "Bekräftar…" : "Starta 3 dagar gratis"}
      </Button>
    </div>
  );
}

export function Paywall({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} title="Blixtbo Premium" onClose={onClose}>
      {open ? <PaywallBody onClose={onClose} /> : null}
    </Sheet>
  );
}

function PaywallBody({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [error, setError] = useState("");
  const [secret, setSecret] = useState("");
  const [intentType, setIntentType] = useState<"setup" | "payment">("setup");
  const [done, setDone] = useState(false);
  const days = trialDays();
  const price = premiumPriceKr();
  const key = publishableKey();

  async function refresh() {
    const user = firebaseConfigured() ? firebaseAuth().currentUser : null;
    if (!user) return;
    const { response, data } = await apiFetch("/billing/entitlement");
    if (!response.ok || !data || typeof data !== "object") return;
    const entitlement = data as { plan?: string; status?: string };
    store.setBilling({
      plan: entitlement.plan === "premium" ? "premium" : "free",
      status: entitlement.status === "paused" || entitlement.status === "canceled" || entitlement.status === "active" ? entitlement.status : "free",
      usedAutoApplies: store.billing.usedAutoApplies,
    });
  }

  async function prepare() {
    setError("");
    if (!key || !stripePromise) {
      setError("Kortfältet kräver en pk_test-nyckel. Inga live-nycklar.");
      return;
    }
    if (!firebaseConfigured() || !firebaseAuth().currentUser) {
      setError("Logga in med Google så att betalningen stannar i appen.");
      return;
    }
    try {
      const data = await postBilling("/billing/subscribe");
      if (!data.clientSecret) throw new Error("Stripe gav ingen client_secret.");
      setIntentType(data.intentType === "payment" ? "payment" : "setup");
      setSecret(data.clientSecret);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Betalningen gick inte att starta.");
    }
  }

  async function succeed() {
    setDone(true);
    store.setBilling({ plan: "premium", status: "active", usedAutoApplies: store.billing.usedAutoApplies });
    await refresh();
  }

  return (
    <>
      {done ? (
        <div>
          <h2 className="font-serif text-[1.7rem] leading-tight tracking-[-0.03em]">Premium är igång</h2>
          <p className="mt-3 text-sm leading-relaxed text-soft">
            {days} dagar gratis, sedan {price} kr/mån. Du kan pausa när du har hittat bostad.
          </p>
          <Button size="lg" className="mt-5 w-full" onClick={onClose}>Tillbaka</Button>
        </div>
      ) : (
        <div>
          <p className="text-sm font-medium text-pine">Betala här i appen</p>
          <h2 className="mt-2 font-serif text-[1.7rem] leading-tight tracking-[-0.03em]">Ansök utan tak</h2>
          <p className="mt-3 text-sm leading-relaxed text-soft">
            Svep gratis. Premium skickar ansökan åt dig. Kort, Apple Pay och Google Pay visas när enheten har dem.
          </p>
          <p className="mt-4 font-serif text-4xl tracking-[-0.03em]">
            {days} dagar<span className="text-base text-soft"> gratis</span>
          </p>
          <p className="mt-1 text-sm text-soft">Sedan {price} kr/mån. Ingen bindningstid. Bara testkort.</p>
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
          {secret && stripePromise ? (
            <Elements stripe={stripePromise} options={{ clientSecret: secret, appearance }}>
              <PaymentForm intentType={intentType} onSuccess={() => void succeed()} />
            </Elements>
          ) : (
            <Button size="lg" className="mt-5 w-full" onClick={() => void prepare()}>
              Lägg till kort
            </Button>
          )}
          <button type="button" className="mt-3 text-sm text-soft" onClick={onClose}>Inte nu</button>
        </div>
      )}
    </>
  );
}

export function useBillingActions() {
  const store = useStore();
  const [error, setError] = useState("");

  async function pause() {
    setError("");
    try {
      await postBilling("/billing/pause");
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
