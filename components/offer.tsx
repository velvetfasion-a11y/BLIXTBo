"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Boot } from "@/components/boot";
import { Countdown } from "@/components/countdown";
import { IconChevron } from "@/components/icons";
import { Button, Sheet } from "@/components/ui";
import { asset } from "@/lib/asset";
import { floorLabel, formatDate, formatDateTime, kr, rok } from "@/lib/format";
import { useStore } from "@/lib/store";

function OfferInner() {
  const store = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const application = store.applications.find((item) => item.id === id);
  const listing = store.listings.find((item) => item.id === application?.listingId);
  const source = store.sources.find((item) => item.id === listing?.sourceId);
  const [confirm, setConfirm] = useState<"ja" | "nej" | "kontrakt" | null>(null);

  useEffect(() => {
    document.title = listing ? `Erbjudande · ${listing.address}` : "Erbjudande · Blixtbo";
  }, [listing]);

  if (!store.ready) return <Boot />;
  if (!application || !listing || !application.respondBy) {
    return (
      <div className="px-5 py-10">
        <p className="text-sm text-soft">Inget öppet erbjudande.</p>
        <Link href="/koll" className="mt-4 inline-block text-sm font-medium">Till koll</Link>
      </div>
    );
  }

  const open = application.status === "erbjuden";
  const accepted = application.status === "accepterad";
  const declined = application.status === "avbojd";
  const contracted = application.status === "kontrakt";
  const stage = contracted ? 2 : accepted ? 1 : 0;

  return (
    <div className={`mx-auto max-w-3xl px-4 py-5 md:px-8 md:py-8 ${open || accepted ? "pb-36 md:pb-28" : ""}`}>
      <button type="button" onClick={() => router.push("/koll")} className="inline-flex items-center gap-1 text-sm text-soft">
        <IconChevron className="h-4 w-4" />
        Koll
      </button>
      <article className="enter mt-4 overflow-hidden rounded-[28px] border border-line bg-card">
        <img src={asset(listing.photos[0])} alt="" className="h-56 w-full object-cover sm:h-72" />
        <div className="space-y-6 p-5 sm:p-7">
          <div>
            <p className="text-sm font-medium text-pine">Erbjudande</p>
            <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">Grattis. Du har erbjudits {listing.address}.</h1>
            <p className="mt-2 text-soft">{listing.area}, {listing.city} · {source?.name}</p>
          </div>
          {open ? (
            <div className="rounded-2xl bg-paper px-4 py-4">
              <p className="text-sm text-soft">Svara senast {formatDateTime(application.respondBy)}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">
                <Countdown deadline={application.respondBy} />
              </p>
            </div>
          ) : (
            <p className="text-sm text-soft">{application.note}</p>
          )}
          <Stage current={declined ? -1 : stage} declined={declined} />
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact label="Hyra" value={`${kr(listing.rent)}/mån`} />
            <Fact label="Storlek" value={`${listing.sqm} m² · ${rok(listing.rooms)}`} />
            <Fact label="Våning" value={floorLabel(listing.floor, listing.floors)} />
            <Fact label="Kontrakt från" value={application.contractStart ? formatDate(application.contractStart) : formatDate(listing.moveIn)} />
          </dl>
          <section>
            <h2 className="text-sm font-medium">Visning</h2>
            <p className="mt-1 text-sm leading-relaxed text-soft">
              {application.viewingBooked && application.viewingAt
                ? `Bokad ${formatDateTime(application.viewingAt)}. Ta med legitimation.`
                : "Ingen visning är bokad ännu."}
            </p>
          </section>
          <section>
            <h2 className="text-sm font-medium">Vad hyresvärden behöver nu</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {(application.nextSteps ?? ["Skriv under kontraktet"]).map((step) => (
                <li key={step} className="rounded-2xl bg-paper px-3 py-2">{contracted ? `Klart · ${step}` : step}</li>
              ))}
            </ul>
          </section>
          <p className="text-sm leading-relaxed text-soft">{listing.description}</p>
        </div>
      </article>
      {open || accepted ? (
        <div className="fixed inset-x-0 bottom-[4.6rem] z-20 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60">
          <div className="mx-auto flex max-w-3xl gap-3">
            {open ? (
              <>
                <Button size="lg" variant="pine" className="h-12 flex-1" onClick={() => setConfirm("ja")}>Tacka ja</Button>
                <Button size="lg" variant="outline" className="h-12 flex-1" onClick={() => setConfirm("nej")}>Tacka nej</Button>
              </>
            ) : (
              <Button size="lg" className="h-12 w-full" onClick={() => setConfirm("kontrakt")}>Kontraktet är signerat</Button>
            )}
          </div>
        </div>
      ) : null}
      <Sheet open={confirm === "ja"} title="Tacka ja" onClose={() => setConfirm(null)}>
        <h2 className="font-serif text-3xl tracking-[-0.03em]">Tacka ja till {listing.address}?</h2>
        <p className="mt-3 text-sm leading-relaxed text-soft">
          Du går vidare till kontrakt. Inflytt {application.contractStart ? formatDate(application.contractStart) : formatDate(listing.moveIn)}
          {application.depositKr ? ` och deposition ${kr(application.depositKr)}` : ""}.
        </p>
        <div className="mt-6 flex gap-2">
          <Button variant="outline" onClick={() => setConfirm(null)}>Avbryt</Button>
          <Button variant="pine" className="flex-1" onClick={() => { store.answerOffer(application.id, true); setConfirm(null); }}>Tacka ja</Button>
        </div>
      </Sheet>
      <Sheet open={confirm === "nej"} title="Tacka nej" onClose={() => setConfirm(null)}>
        <h2 className="font-serif text-3xl tracking-[-0.03em]">Tacka nej till {listing.address}?</h2>
        <p className="mt-3 text-sm leading-relaxed text-soft">Bostaden går vidare till nästa hushåll.</p>
        {application.affectsQueue ? (
          <p className="mt-3 rounded-2xl bg-clay-soft px-4 py-3 text-sm leading-relaxed text-clay">
            Ett nej kan påverka dina köpoäng hos {source?.name ?? "kön"}. Det går inte att ångra i efterhand.
          </p>
        ) : null}
        <div className="mt-6 flex gap-2">
          <Button variant="outline" onClick={() => setConfirm(null)}>Behåll erbjudandet</Button>
          <Button className="flex-1" onClick={() => { store.answerOffer(application.id, false); setConfirm(null); }}>Tacka nej ändå</Button>
        </div>
      </Sheet>
      <Sheet open={confirm === "kontrakt"} title="Kontrakt" onClose={() => setConfirm(null)}>
        <h2 className="font-serif text-3xl tracking-[-0.03em]">Markera kontraktet som signerat?</h2>
        <p className="mt-3 text-sm leading-relaxed text-soft">Statusen i koll blir Kontrakt. Själva underskriften gör du hos hyresvärden.</p>
        <div className="mt-6 flex gap-2">
          <Button variant="outline" onClick={() => setConfirm(null)}>Avbryt</Button>
          <Button variant="pine" className="flex-1" onClick={() => { store.signContract(application.id); setConfirm(null); }}>Ja, det är signerat</Button>
        </div>
      </Sheet>
    </div>
  );
}

function Stage({ current, declined }: { current: number; declined: boolean }) {
  const steps = declined ? ["Erbjuden", "Avböjd"] : ["Erbjuden", "Accepterad", "Kontrakt"];
  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {steps.map((label, index) => {
        const on = declined ? index === 1 : index <= current;
        return (
          <li key={label} className={`rounded-full px-2.5 py-1 ${on ? "bg-ink text-paper" : "bg-paper text-soft"}`}>
            {label}
          </li>
        );
      })}
    </ol>
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

export function OfferScreen() {
  return (
    <Suspense fallback={<Boot />}>
      <OfferInner />
    </Suspense>
  );
}
