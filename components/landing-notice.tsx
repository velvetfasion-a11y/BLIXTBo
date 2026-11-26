"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";

function noticeText(kind: string) {
  if (kind === "uppgifter") {
    return "Uppgifterna om dig, inklusive recensioner, är raderade och du är utloggad. Stripe-kunden är anonymiserad. Fakturor och betalunderlag behålls enligt bokföringslagen.";
  }
  if (kind === "exempel") {
    return "Exempelkontot fanns bara i den här webbläsaren och är borttaget. Inget konto i molnet berördes.";
  }
  return "Blixtbo-kontot är stängt och du är utloggad. Recensioner är borttagna. Ansökningar, meddelanden, hyresvärdarnas inloggningar och loggar ligger kvar tills du ber om att alla uppgifter raderas.";
}

export function LandingNotice() {
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const value = sessionStorage.getItem("blixtbo-notice");
        if (!value) return;
        sessionStorage.removeItem("blixtbo-notice");
        setNotice(value);
      } catch {
        /* storage blocked */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!notice) return null;
  return <p className="mt-8 max-w-md rounded-2xl bg-pine-soft px-4 py-3 text-sm leading-relaxed text-pine-deep">{noticeText(notice)}</p>;
}

/** Sends someone who already has a session to Hem. Signing in on this page still goes to the guide. */
export function SignedInRedirect() {
  const store = useStore();
  const router = useRouter();
  const signedInOnArrival = useRef<boolean | null>(null);

  useEffect(() => {
    if (!store.ready) return;
    if (signedInOnArrival.current === null) signedInOnArrival.current = Boolean(store.user);
    if (signedInOnArrival.current && store.user) router.replace("/hem");
  }, [store.ready, store.user, router]);

  return null;
}
