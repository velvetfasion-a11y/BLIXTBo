"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Ring, Switch } from "@/components/ui";
import { completeness } from "@/lib/profile";
import { useStore } from "@/lib/store";

export function Profile() {
  const store = useStore();
  const router = useRouter();
  const user = store.user;
  const score = user ? completeness(user.profile) : { score: 0, missing: [] };
  const connected = store.sources.filter((source) => store.connections[source.id]?.status === "connected").length;

  useEffect(() => {
    document.title = "Profil · Blixtbo";
  }, []);

  if (!user) return null;

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-6 md:px-8 md:py-10">
      <div className="flex items-center gap-4">
        <Ring value={score.score} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
          <p className="text-sm text-soft">{user.email}</p>
          <p className="mt-1 text-sm text-soft">{user.method === "google" ? "Google" : user.method === "apple" ? "Apple" : "Engångskod till e-post"}</p>
        </div>
      </div>
      <div className="mt-5 rounded-3xl bg-card px-4 py-4 ring-1 ring-line">
        <p className="text-sm font-medium">Profilen är komplett till {score.score}%</p>
        <p className="mt-1 text-sm leading-relaxed text-soft">
          {score.missing.length === 0
            ? "Allt underlag som hyresvärdar brukar be om finns på plats."
            : `Saknas: ${score.missing.map((item) => item.label.toLowerCase()).join(", ")}.`}
        </p>
        <Link href="/guide" className="mt-3 inline-block text-sm font-medium text-pine">
          {score.score === 100 ? "Redigera profilen" : "Komplettera profilen"}
        </Link>
      </div>

      <ul className="mt-6 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
        <Row href="/guide?steg=arbete" title="Profiluppgifter" detail="Yrke, inkomst, hushåll, brev" />
        <Row href="/guide?steg=dokument" title="Dokument" detail="Avtal, lönespecifikationer, personbevis" />
        <Row href="/filter" title="Filter" detail="Område, hyra, storlek, inflytt" />
        <Row href="/kopplingar" title="Hyresvärdar" detail={`${connected} kopplade`} />
      </ul>

      <section className="mt-6 rounded-3xl border border-line bg-card px-4 pb-4">
        <h2 className="pt-4 text-sm font-medium">Behåll din plats</h2>
        <p className="mt-1 text-sm leading-relaxed text-soft">
          En missad förnyelse kan nollställa flera års kötid. Med automatiken loggar Blixtbo in och bekräftar varje kö i tid.
        </p>
        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="text-sm font-medium">Håll mina köplatser aktiva automatiskt</p>
          <Switch on={store.prefs.keepQueues !== false} label="Håll mina köplatser aktiva automatiskt" onClick={() => store.setPrefs({ keepQueues: store.prefs.keepQueues === false })} />
        </div>
        <Link href="/koll?flik=koer" className="mt-3 inline-block text-sm font-medium text-pine">
          Se status per kö
        </Link>
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-card px-4">
        <h2 className="pt-4 text-sm font-medium">Aviseringar</h2>
        <Pref label="Nya bostäder direkt" on={store.prefs.newListings} onClick={() => store.setPrefs({ newListings: !store.prefs.newListings })} />
        <Pref label="Köavgifter och förnyelse" on={store.prefs.fees} onClick={() => store.setPrefs({ fees: !store.prefs.fees })} />
        <Pref label="Status på ansökningar" on={store.prefs.status} onClick={() => store.setPrefs({ status: !store.prefs.status })} />
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-card">
        <Link href="/admin" className="flex items-center justify-between px-4 py-4">
          <span>
            <span className="block text-sm font-medium">Admin</span>
            <span className="mt-0.5 block text-sm text-soft">Förhandsvisning för ägaren</span>
          </span>
          <span className="text-soft">→</span>
        </Link>
      </section>

      <div className="mt-6 flex flex-col items-start gap-3">
        <button
          type="button"
          className="text-sm text-soft"
          onClick={() => {
            store.logout();
            router.replace("/");
          }}
        >
          Logga ut
        </button>
        <button
          type="button"
          className="text-sm text-faint"
          onClick={() => {
            store.reset();
            router.replace("/");
          }}
        >
          Återställ prototypen
        </button>
      </div>
    </div>
  );
}

function Row({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-4 px-4 py-4">
        <span>
          <span className="block text-sm font-medium">{title}</span>
          <span className="mt-0.5 block text-sm text-soft">{detail}</span>
        </span>
        <span className="text-soft">→</span>
      </Link>
    </li>
  );
}

function Pref({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-t-0">
      <p className="text-sm">{label}</p>
      <Switch on={on} label={label} onClick={onClick} />
    </div>
  );
}
