"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { IconChevron } from "@/components/icons";
import { Paywall } from "@/components/paywall";
import { Button, Sheet, StatusPill } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { premiumPriceKr, trialDays } from "@/lib/billing";
import { firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";
import { formatLongDate } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Billing } from "@/lib/types";

type SubscriptionView = {
  plan: "free" | "premium";
  status: "free" | "active" | "paused" | "canceled";
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  trial?: boolean;
};

function isView(value: unknown): value is SubscriptionView {
  if (!value || typeof value !== "object") return false;
  const view = value as SubscriptionView;
  return (view.plan === "free" || view.plan === "premium") && typeof view.cancelAtPeriodEnd === "boolean";
}

function statusCopy(view: SubscriptionView) {
  const date = view.currentPeriodEnd ? formatLongDate(view.currentPeriodEnd) : "";
  const price = premiumPriceKr();
  if (view.cancelAtPeriodEnd && view.plan === "premium") {
    const when = date ? ` den ${date}` : "";
    return `Premium avslutas${when}. Du har tillgång tills perioden tar slut, och inga fler dragningar görs.`;
  }
  if (view.status === "paused") return "Premium är pausat. Automatiska ansökningar är av, och inga nya dragningar görs förrän du återupptar.";
  if (view.status === "canceled") return "Prenumerationen är avslutad. Inga fler dragningar görs.";
  if (view.plan === "premium" && view.trial) return `Premium, provperiod. Därefter ${price} kr i månaden.`;
  if (view.plan === "premium") return `Premium är igång. ${price} kr i månaden.`;
  return "Gratis. Ett par automatiska ansökningar ingår.";
}

function storeStatus(view: SubscriptionView): Billing["status"] {
  if (view.status === "active" || view.status === "paused" || view.status === "canceled") return view.status;
  return "free";
}

export function SubscriptionManage() {
  const store = useStore();
  const [view, setView] = useState<SubscriptionView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [authReady, setAuthReady] = useState(!firebaseConfigured());
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    document.title = "Prenumeration · Blixtbo";
  }, []);

  useEffect(() => {
    if (!firebaseConfigured()) return;
    return onAuthStateChanged(firebaseAuth(), (user) => {
      setSignedIn(Boolean(user));
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!store.user || !signedIn) return;
    let cancelled = false;
    void (async () => {
      const { response, data, detail } = await apiFetch("/billing/subscription");
      if (cancelled) return;
      if (!response.ok || !isView(data)) {
        setError(detail || "Prenumerationen kunde inte hämtas.");
        return;
      }
      setView(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, store.user]);

  if (!store.user) return null;
  const account = store.user;

  const current = view ?? {
    plan: store.billing.plan,
    status: store.billing.status,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    trial: false,
  };
  const loading = (firebaseConfigured() && !authReady) || (signedIn && !view && !error);
  const premium = current.plan === "premium" && (current.status === "active" || current.status === "paused");
  const showCancel = signedIn && premium && !current.cancelAtPeriodEnd;
  const showResume = signedIn && (current.cancelAtPeriodEnd || current.status === "paused");
  const showUpgrade = !premium && current.status !== "paused";
  const endLabel = current.currentPeriodEnd ? formatLongDate(current.currentPeriodEnd) : "";

  function remember(next: SubscriptionView) {
    setView(next);
    store.setBilling({
      plan: next.plan === "premium" ? "premium" : "free",
      status: storeStatus(next),
      usedAutoApplies: store.billing.usedAutoApplies,
    });
  }

  async function run(path: string) {
    setBusy(true);
    setError("");
    try {
      const { response, data, detail } = await apiFetch(path, { method: "POST" });
      if (!response.ok || !isView(data)) {
        setError(detail || "Det gick inte att uppdatera prenumerationen.");
        return;
      }
      remember(data);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-6 md:px-8 md:py-10">
      <Link href="/installningar" className="inline-flex items-center gap-1 text-sm text-soft">
        <IconChevron className="h-4 w-4" />
        Inställningar
      </Link>
      <p className="mt-6 text-sm font-medium text-pine">Prenumeration</p>
      <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">Blixtbo Premium</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-soft">
        {trialDays()} dagar gratis, sedan {premiumPriceKr()} kr i månaden. Ingen bindningstid. Om du avslutar behåller du Premium tills perioden tar slut. Därefter blir kontot gratis, och inga fler dragningar görs. Du kan ångra avslutet innan dess.
      </p>

      <section className="mt-8 rounded-3xl border border-line bg-card px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium">Status</h2>
          {current.cancelAtPeriodEnd ? <StatusPill tone="gold">Avslutas</StatusPill> : null}
          {current.status === "paused" ? <StatusPill tone="info">Pausad</StatusPill> : null}
          {current.plan === "premium" && current.status === "active" && !current.cancelAtPeriodEnd ? <StatusPill tone="pine">Aktiv</StatusPill> : null}
          {current.plan !== "premium" ? <StatusPill tone="ink">Gratis</StatusPill> : null}
        </div>
        {loading ? <p className="mt-3 text-sm text-soft">Hämtar prenumeration…</p> : <p className="mt-3 text-sm leading-relaxed text-soft">{statusCopy(current)}</p>}
        {!signedIn ? (
          <p className="mt-3 text-sm leading-relaxed text-soft">
            Avslut mot Stripe kräver att du är inloggad med Google eller Apple.
            {account.demo ? " Exempelkontot har ingen riktig prenumeration." : ""}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex flex-col gap-2">
          {showCancel ? (
            <Button variant="outline" disabled={busy} onClick={() => setConfirm(true)}>
              Avsluta prenumeration
            </Button>
          ) : null}
          {showResume ? (
            <Button disabled={busy} onClick={() => void run("/billing/resume")}>
              {busy ? "Uppdaterar…" : current.cancelAtPeriodEnd ? "Återuppta prenumerationen" : "Återuppta Premium"}
            </Button>
          ) : null}
          {signedIn && premium && current.status === "active" && !current.cancelAtPeriodEnd ? (
            <Button variant="outline" disabled={busy} onClick={() => void run("/billing/pause")}>
              Pausa – jag har hittat bostad
            </Button>
          ) : null}
          {showUpgrade && signedIn ? <Button onClick={() => setPaywall(true)}>Uppgradera</Button> : null}
        </div>
      </section>

      <Sheet open={confirm} title="Avsluta prenumerationen" onClose={() => setConfirm(false)}>
        <h2 className="font-serif text-[1.7rem] leading-tight tracking-[-0.03em]">Avsluta prenumerationen?</h2>
        <p className="mt-3 text-sm leading-relaxed text-soft">
          Du behåller Premium tills den här perioden tar slut{endLabel ? ` (${endLabel})` : ""}. Därefter blir kontot gratis. Inga fler dragningar görs.
        </p>
        <Button variant="danger" className="mt-5 w-full" disabled={busy} onClick={() => void run("/billing/cancel")}>
          {busy ? "Avslutar…" : "Avsluta prenumerationen"}
        </Button>
        <button type="button" className="mt-3 w-full text-sm text-soft" onClick={() => setConfirm(false)}>
          Behåll Premium
        </button>
      </Sheet>
      <Paywall open={paywall} onClose={() => setPaywall(false)} />
    </div>
  );
}
