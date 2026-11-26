"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ApplicationLimitSheet } from "@/components/application-limit";
import { Boot } from "@/components/boot";
import { ConfirmApply, ConfirmSend } from "@/components/confirm-apply";
import { ConnectSheet } from "@/components/connect-sheet";
import { IconChevron } from "@/components/icons";
import { LandlordLogo } from "@/components/landlord-logo";
import { Button, StatusPill } from "@/components/ui";
import { asset } from "@/lib/asset";
import { deadlineLabel, floorLabel, formatDate, freshness, kr, rok } from "@/lib/format";
import { canAutoApply } from "@/lib/billing";
import { Paywall } from "@/components/paywall";
import { isQasaListing, sendConfirmation } from "@/lib/landlord-api";
import { QasaSend } from "@/components/qasa-send";
import { atApplicationLimit } from "@/lib/limits";
import { assess } from "@/lib/profile";
import { useStore } from "@/lib/store";

function ListingInner() {
  const store = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const listing = store.listings.find((item) => item.id === id);
  const [gate, setGate] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [limited, setLimited] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [sendConfirm, setSendConfirm] = useState(false);
  const [qasaOpen, setQasaOpen] = useState(false);

  useEffect(() => {
    document.title = listing ? `${listing.address} · Blixtbo` : "Bostad · Blixtbo";
  }, [listing]);

  if (!store.ready) return <Boot />;
  if (!listing) {
    return (
      <div className="px-5 py-10">
        <p className="text-sm text-soft">Annonsen finns inte längre.</p>
        <Link href="/hem" className="mt-4 inline-block text-sm font-medium">Till flödet</Link>
      </div>
    );
  }

  const source = store.sources.find((item) => item.id === listing.sourceId);
  const connected = store.connections[listing.sourceId]?.status === "connected";
  const application = store.applications.find((item) => item.listingId === listing.id);
  const result = assess(listing, store.user?.profile ?? null);

  function apply() {
    if (isQasaListing(source, listing)) {
      setQasaOpen(true);
      return;
    }
    if (!connected) {
      setGate(true);
      return;
    }
    if (atApplicationLimit(store.sources, store.applications, store.listings, listing!.sourceId)) {
      setLimited(true);
      return;
    }
    if (!listing!.manualApply && !canAutoApply(store.billing)) {
      setPaywall(true);
      return;
    }
    if (!assess(listing!, store.user?.profile ?? null).ready) {
      setConfirm(true);
      return;
    }
    if (sendConfirmation(source, listing)) {
      setSendConfirm(true);
      return;
    }
    store.apply(listing!.id);
  }

  const qasaSent = Boolean(store.qasaNotes[listing.id]?.sent);

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 md:px-8 md:py-8">
      <button type="button" onClick={() => router.push("/hem")} className="inline-flex items-center gap-1 text-sm text-soft">
        <IconChevron className="h-4 w-4" />
        Flödet
      </button>
      <div className="enter mt-4 overflow-hidden rounded-[28px] border border-line bg-card">
        <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto">
          {listing.photos.map((src) => (
            <img key={src} src={asset(src)} alt="" className="h-72 w-[88%] shrink-0 snap-center object-cover sm:h-96 sm:w-full" />
          ))}
        </div>
        <div className="space-y-6 p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="ink">{freshness(listing.publishedAt)}</StatusPill>
            <StatusPill tone={listing.deadlineAt ? "clay" : "pine"}>{deadlineLabel(listing.deadlineAt)}</StatusPill>
          </div>
          <div>
            <h1 className="font-serif text-4xl tracking-[-0.03em]">{listing.address}</h1>
            <p className="mt-2 text-soft">{listing.area}, {listing.city} · {listing.near}</p>
          </div>
          <p className="num text-3xl font-semibold tracking-tight">
            {kr(listing.rent)}
            <span className="text-base font-normal text-soft"> / mån</span>
          </p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact label="Storlek" value={`${listing.sqm} m²`} />
            <Fact label="Rum" value={rok(listing.rooms)} />
            <Fact label="Våning" value={floorLabel(listing.floor, listing.floors)} />
            <Fact label="Inflytt" value={listing.moveIn ? formatDate(listing.moveIn) : "Enligt överenskommelse"} />
          </dl>
          <div className="flex flex-wrap gap-2">
            {listing.features.map((feature) => (
              <span key={feature} className="rounded-full bg-paper-deep px-3 py-1 text-sm">{feature}</span>
            ))}
          </div>
          <p className="text-base leading-relaxed text-soft">{listing.description}</p>
          <section className="rounded-2xl bg-paper px-4 py-4">
            <h2 className="text-sm font-medium">Krav mot din profil</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li className={result.incomeOk ? "text-pine" : "text-clay"}>
                {result.incomeOk === null
                  ? "Inkomst saknas i profilen"
                  : result.incomeOk
                    ? `Inkomst uppfylld. Kravet är ${kr(result.requiredIncome)} och du har angett ${kr(store.user?.profile.monthlyIncome ?? 0)}.`
                    : `Inkomstkravet är ${kr(result.requiredIncome)}. Du har angett ${kr(store.user?.profile.monthlyIncome ?? 0)}.`}
              </li>
              {listing.requires.map((key) => {
                const labels = {
                  contract: "Anställningsavtal",
                  payslips: "Lönespecifikationer",
                  personbevis: "Personbevis",
                  letter: "Personligt brev",
                };
                const ok =
                  key === "letter"
                    ? (store.user?.profile.letter.trim().length ?? 0) >= 80
                    : Boolean(store.user?.profile.documents[key]);
                return (
                  <li key={key} className={ok ? "text-pine" : "text-clay"}>
                    {labels[key]} · {ok ? "finns i profilen" : "saknas"}
                  </li>
                );
              })}
            </ul>
          </section>
          <p className="flex items-center gap-2.5 text-sm text-soft">
            {source ? <LandlordLogo id={source.id} name={source.name} size={40} /> : null}
            <span>Källa: {source?.name}. {connected ? "Kontot är kopplat." : "Kontot är inte kopplat ännu."}</span>
          </p>
          {isQasaListing(source, listing) ? (
            <div className="space-y-3">
              {qasaSent ? (
                <div className="rounded-2xl bg-pine-soft px-4 py-4 text-sm text-pine-deep">Skickad? Ja. Du skickade meddelandet själv på Qasa.</div>
              ) : null}
              <Button size="lg" variant="pine" className="h-12 w-full" onClick={() => setQasaOpen(true)}>
                Skriv till hyresvärden
              </Button>
            </div>
          ) : store.waiting.some((item) => item.listingId === listing.id) ? (
            <div className="rounded-2xl bg-paper px-4 py-4 text-sm leading-relaxed text-soft">
              Sparad i Väntar på plats. Du får en notis när en ansökan hos {source?.name ?? "hyresvärden"} avslutas.
            </div>
          ) : application && application.status !== "aterkallad" ? (
            <div className="rounded-2xl bg-pine-soft px-4 py-4 text-sm text-pine-deep">
              {application.note || (application.position === 1 ? "Du var först." : `Du var nummer ${application.position}.`)}
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              {listing.manualApply ? (
                <a href={listing.applyUrl} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center rounded-full border border-line bg-card px-5 text-base font-medium">
                  Ansök själv
                </a>
              ) : (
                <Button size="lg" variant="pine" className="h-12 w-full shrink-0 sm:flex-1" onClick={apply}>
                  {isQasaListing(source, listing) ? "Skriv till hyresvärden" : connected ? "Ansök nu" : `Koppla ${source?.name ?? "källan"} och ansök`}
                </Button>
              )}
              <Button size="lg" variant="outline" className="h-12 w-full shrink-0 sm:w-auto" onClick={() => { store.skip(listing.id); router.push("/hem"); }}>
                Inte aktuell
              </Button>
            </div>
          )}
        </div>
      </div>
      {gate ? (
        <ConnectSheet
          key={listing.sourceId}
          sourceId={listing.sourceId}
          listing={listing}
          open
          intent="signup"
          onClose={() => setGate(false)}
        />
      ) : null}
      <ApplicationLimitSheet listing={limited ? listing : null} onClose={() => setLimited(false)} />
      <Paywall open={paywall} onClose={() => setPaywall(false)} />
      <ConfirmApply
        listing={confirm ? listing : null}
        onClose={() => setConfirm(false)}
        onSend={() => {
          store.apply(listing.id);
          setConfirm(false);
        }}
      />
      <ConfirmSend
        open={sendConfirm}
        title="Bekräfta innan något skickas"
        body={sendConfirmation(source, listing) || ""}
        onClose={() => setSendConfirm(false)}
        onSend={() => {
          const text = sendConfirmation(source, listing);
          if (text) store.apply(listing.id, { confirmation: text });
          setSendConfirm(false);
        }}
      />
      <QasaSend listing={listing} open={qasaOpen} onClose={() => setQasaOpen(false)} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-paper px-3 py-3">
      <dt className="text-xs text-soft">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

export function ListingScreen() {
  return (
    <Suspense fallback={<Boot />}>
      <ListingInner />
    </Suspense>
  );
}
