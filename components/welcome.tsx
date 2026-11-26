"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Boot } from "@/components/boot";
import { LandlordLogoCloud } from "@/components/landlord-logo-cloud";
import { Wordmark } from "@/components/mark";
import { SignIn } from "@/components/sign-in";
import { SiteFooter } from "@/components/site-footer";
import { asset } from "@/lib/asset";
import { useStore } from "@/lib/store";

const PROMISES = [
  {
    title: "Först till ansökan",
    body: "Nya annonser läggs överst. Ett ja skickar ansökan medan andra fortfarande läser.",
  },
  {
    title: "Koll på varje kö",
    body: "Ködagar, årsavgift och sista dag att förnya. I tid, innan kötiden nollställs.",
  },
  {
    title: "En profil räcker",
    body: "Inkomst, brev och dokument en gång. Samma underlag till varje hyresvärd.",
  },
];

function noticeText(kind: string) {
  if (kind === "uppgifter") {
    return "Uppgifterna om dig är raderade och du är utloggad. Stripe-kunden är anonymiserad. Fakturor och betalunderlag behålls enligt bokföringslagen.";
  }
  if (kind === "exempel") {
    return "Exempelkontot fanns bara i den här webbläsaren och är borttaget. Inget konto i molnet berördes.";
  }
  return "Blixtbo-kontot är stängt och du är utloggad. Ansökningar, meddelanden, hyresvärdarnas inloggningar och loggar ligger kvar tills du ber om att alla uppgifter raderas.";
}

export function Welcome() {
  const store = useStore();
  const router = useRouter();
  const signedInOnArrival = useRef<boolean | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!store.ready) return;
    if (signedInOnArrival.current === null) signedInOnArrival.current = Boolean(store.user);
    if (signedInOnArrival.current && store.user) router.replace("/hem");
  }, [store.ready, store.user, router]);

  useEffect(() => {
    document.title = "Blixtbo";
  }, []);

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

  if (!store.ready || store.user) return <Boot />;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12 lg:px-16 lg:py-12">
        <Wordmark />
        {notice ? (
          <p className="mt-8 max-w-md rounded-2xl bg-pine-soft px-4 py-3 text-sm leading-relaxed text-pine-deep">{noticeText(notice)}</p>
        ) : null}
        <div className="enter mt-12 max-w-xl lg:mt-auto">
          <h1 className="font-serif text-[2.7rem] leading-[1.02] tracking-[-0.035em] sm:text-6xl">
            Var först
            <br />
            på varje ny
            <br />
            lägenhet.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-soft sm:text-lg">
            Förstahandskontrakt går till den som ansöker först. Blixtbo bevakar hyresvärdarna och har din ansökan redo.
          </p>
          <div className="mt-8">
            <LandlordLogoCloud />
          </div>
          <div className="mt-8 sm:max-w-sm">
            <SignIn />
          </div>
        </div>
        <ul className="mt-12 divide-y divide-line border-y border-line lg:mt-16">
          {PROMISES.map((item) => (
            <li key={item.title} className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-sm leading-relaxed text-soft">{item.body}</p>
            </li>
          ))}
        </ul>
        <SiteFooter flush />
      </div>
      <div className="relative hidden overflow-hidden bg-[#e7e0d4] lg:block">
        <div className="absolute inset-0 grid place-items-center">
          <div className="relative w-[380px]">
            <img
              src={asset("/photos/03.jpg")}
              alt=""
              className="absolute -left-16 top-16 h-72 w-52 -rotate-6 rounded-[28px] object-cover opacity-90 shadow-[0_20px_50px_rgba(48,36,22,0.18)]"
            />
            <article className="relative overflow-hidden rounded-[32px] bg-card shadow-[0_30px_80px_rgba(48,36,22,0.22)]">
              <img src={asset("/photos/01.jpg")} alt="Vardagsrum i en lägenhet på Södermalm" className="h-[520px] w-full object-cover" />
              <div className="absolute top-4 left-4 rounded-full bg-card/95 px-3 py-1 text-sm font-medium">Ny – 3 min sedan</div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#1c1916] via-[#1c1916]/80 to-transparent p-6 pt-24 text-paper">
                <p className="text-sm font-medium text-white">Södermalm · HomeQ</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">Blekingegatan 42</p>
                <p className="num mt-1 text-sm text-paper/85">12 450 kr · 2 rok · 54 m²</p>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
