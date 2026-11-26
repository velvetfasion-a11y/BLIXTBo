"use client";

import { useEffect, useState } from "react";
import { Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import Link from "next/link";
import { Button } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { premiumPriceKr } from "@/lib/billing";
import { Mark } from "@/components/mark";
import { firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";
import { usablePublishableKey } from "@/lib/stripe-key";
import { useStore } from "@/lib/store";

function publishableKey() {
  return usablePublishableKey(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");
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
        {busy ? "Bekräftar…" : `Betala ${premiumPriceKr()} kr/mån`}
      </Button>
    </div>
  );
}

const BENEFITS = [
  "Håller dina köplatser aktiva och förnyar dem.",
  "Skickar din ansökan med profilen du redan fyllt i, så att du kan bli först till kvarn.",
  "Bevakar hyresvärdarnas annonser och köer.",
] as const;

type IapWindow = Window & {
  webkit?: { messageHandlers?: { blixtboPurchase?: { postMessage: (body: unknown) => void } } };
};

function appleIap() {
  if (typeof window === "undefined") return null;
  return (window as IapWindow).webkit?.messageHandlers?.blixtboPurchase ?? null;
}

export function Paywall({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="paywall-fade fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 bg-[#1c1916]/45" aria-label="Stäng" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="premium-title"
        className="paywall-pop relative max-h-[92dvh] w-full max-w-[420px] overflow-y-auto rounded-[28px] border border-line bg-card px-6 pt-7 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_24px_70px_rgba(28,25,22,0.18)] sm:px-8 sm:py-8"
      >
        {open ? <PaywallBody onClose={onClose} /> : null}
      </div>
    </div>
  );
}

function PaywallBody({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [error, setError] = useState("");
  const [secret, setSecret] = useState("");
  const [intentType, setIntentType] = useState<"setup" | "payment">("setup");
  const [done, setDone] = useState(false);
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
      setError("Kortfältet kräver en pk_test_- eller pk_live_-nyckel.");
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

  function pay() {
    const native = appleIap();
    if (native) {
      native.postMessage({ product: "blixtbo_premium_monthly", priceKr: price });
      return;
    }
    void prepare();
  }

  return (
    <>
      {done ? (
        <div className="text-center">
          <div className="flex justify-center">
            <Mark size={36} />
          </div>
          <h2 id="premium-title" className="mt-4 font-serif text-[1.85rem] leading-tight tracking-[-0.03em]">
            Premium är igång
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-soft">
            {price} kr/mån. Du kan pausa när du har hittat bostad.
          </p>
          <Button size="lg" className="mt-6 w-full" onClick={onClose}>
            Tillbaka
          </Button>
        </div>
      ) : (
        <div>
          <div className="flex justify-center">
            <Mark size={36} />
          </div>
          <h2 id="premium-title" className="mt-4 text-center font-serif text-[1.85rem] leading-[1.15] tracking-[-0.03em]">
            Missa inte nästa lägenhet
          </h2>
          <p className="mt-3 text-center text-sm leading-relaxed text-soft">
            De bästa lägenheterna försvinner på minuter. Blixtbo ansöker först och håller köerna vid liv.
          </p>
          <ul className="mt-5 space-y-2.5">
            {BENEFITS.map((point) => (
              <li key={point} className="flex gap-2.5 text-sm leading-5 text-ink">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pine" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-center font-serif text-3xl tracking-[-0.03em]">
            {price} kr<span className="text-base text-soft">/mån</span>
          </p>
          <p className="mt-3 text-center text-sm leading-relaxed text-soft">
            Genom att betala godkänner du{" "}
            <Link href="/villkor" className="font-medium text-ink underline decoration-pine/30 underline-offset-4">
              villkoren
            </Link>
            .
          </p>
          {error ? (
            <p className="mt-3 text-center text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          {secret && stripePromise && !appleIap() ? (
            <Elements stripe={stripePromise} options={{ clientSecret: secret, appearance }}>
              <PaymentForm intentType={intentType} onSuccess={() => void succeed()} />
            </Elements>
          ) : (
            <button
              type="button"
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-pine text-base font-medium text-white transition-colors hover:bg-pine-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
              onClick={pay}
            >
              Betala {price} kr/mån
            </button>
          )}
          <button type="button" className="mt-4 w-full py-1 text-center text-sm text-soft underline-offset-4 hover:underline" onClick={onClose}>
            Inte nu
          </button>
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
