"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Boot } from "@/components/boot";
import { LandlordIdentity, LandlordLogo } from "@/components/landlord-logo";
import { Countdown } from "@/components/countdown";
import { EmptyState, Segmented, StatusPill, Switch, cx } from "@/components/ui";
import { formatDate, formatDateTime, formatNumber, kr, monthYear, relative, rokShort } from "@/lib/format";
import { activeForSource, applicationLimit, limitCounter } from "@/lib/limits";
import { landlordLabel } from "@/lib/landlord-logos";
import { queueAlert, queuePlace } from "@/lib/profile";
import { useStore } from "@/lib/store";
import type { AppStatus, Queue } from "@/lib/types";

const STATUS: Record<AppStatus, { label: string; tone: "info" | "gold" | "pine" | "danger" }> = {
  skickad: { label: "Skickad", tone: "info" },
  visning: { label: "Visning", tone: "gold" },
  erbjuden: { label: "Erbjuden", tone: "pine" },
  accepterad: { label: "Accepterad", tone: "pine" },
  avbojd: { label: "Avböjd", tone: "danger" },
  kontrakt: { label: "Kontrakt", tone: "pine" },
  nekad: { label: "Nekad", tone: "danger" },
  aterkallad: { label: "Tillbakadragen", tone: "danger" },
};

const OFFER_STATUS = new Set<AppStatus>(["erbjuden", "accepterad", "avbojd", "kontrakt"]);

function OfferTrail({ status }: { status: AppStatus }) {
  if (!OFFER_STATUS.has(status)) return null;
  const steps = status === "avbojd" ? ["Erbjuden", "Avböjd"] : ["Erbjuden", "Accepterad", "Kontrakt"];
  const current = status === "erbjuden" ? 0 : status === "accepterad" || status === "avbojd" ? 1 : 2;
  return (
    <p className="mt-2 text-xs">
      {steps.map((label, index) => (
        <span key={label} className={index <= current ? "font-medium text-ink" : "text-faint"}>
          {index > 0 ? " → " : ""}
          {label}
        </span>
      ))}
    </p>
  );
}

function TrackerInner() {
  const store = useStore();
  const params = useSearchParams();
  const initial = params.get("flik") === "koer" ? "koer" : "ansokningar";
  const [tab, setTab] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Koll · Blixtbo";
  }, []);

  const autoKeep = store.prefs.keepQueues !== false;
  const warnings = store.queues
    .map((queue) => ({ queue, place: queuePlace(queue, autoKeep), alert: queueAlert(queue) }))
    .filter((item) => item.place.badge === "Betala årsavgift" || item.place.badge === "BankID behövs");

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6 md:px-8 md:py-10">
      <p className="text-sm text-soft">Ansökningar och köer</p>
      <h1 className="mt-1 font-serif text-4xl tracking-[-0.03em]">Koll</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-soft">
        Allt du har sökt, och varje kö du står i. Varningarna kommer innan kötiden kan nollställas.
      </p>
      <ApplicationCounters />
      {warnings.length > 0 ? (
        <div className="mt-5 space-y-2">
          {warnings.map(({ queue, place, alert }) => (
            <button
              key={queue.id}
              type="button"
              onClick={() => setTab("koer")}
              className={cx(
                "block w-full rounded-2xl px-4 py-3 text-left text-sm leading-relaxed",
                place.badge === "BankID behövs" ? "bg-danger-soft text-danger" : "bg-clay-soft text-clay",
              )}
            >
              <span className="font-medium">{queue.name}. </span>
              {place.badge === "BankID behövs"
                ? `BankID behövs. Det godkänner du själv på mobilen, Blixtbo kan inte legitimera dig. Annars kan ${queue.days ? `${formatNumber(queue.days)} ködagar` : "platsen"} nollställas.`
                : alert?.text}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-6">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: "ansokningar", label: `Ansökningar ${store.applications.length}` },
            { id: "koer", label: `Köer ${store.queues.length}` },
          ]}
        />
      </div>
      <div className="mt-5 space-y-3">
        {tab === "ansokningar" ? (
          store.applications.length === 0 ? (
            <EmptyState
              title="Inga ansökningar ännu"
              body="När du svarar ja på en bostad hamnar den här, med status från hyresvärden."
              action={<Link href="/hem" className="rounded-full bg-ink px-4 py-2 text-sm text-paper">Till flödet</Link>}
            />
          ) : (
            <>
              <WaitingList />
              {store.applications.map((application) => {
              const listing = store.listings.find((item) => item.id === application.listingId);
              const status = STATUS[application.status];
              const expanded = open === application.id;
              if (!listing) return null;
              return (
                <article key={application.id} className="rounded-3xl border border-line bg-card p-4">
                  <button type="button" className="w-full text-left" onClick={() => setOpen(expanded ? null : application.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <StatusPill tone={status.tone}>{status.label}</StatusPill>
                      <span className="text-xs text-faint">{relative(application.eventAt)}</span>
                    </div>
                    <LandlordIdentity
                      id={listing.sourceId}
                      name={listing.sourceName || landlordLabel(listing.sourceId)}
                      size={36}
                      className="mt-3"
                      nameClassName="text-sm font-medium"
                    />
                    <h2 className="mt-2 text-lg font-semibold tracking-tight">{listing.address}</h2>
                    <p className="mt-1 text-sm text-soft">
                      {listing.area} · {rokShort(listing.rooms)} · {kr(listing.rent)}
                    </p>
                    <p className="mt-2 text-sm">
                      {application.minutesAfterPublish < 60
                        ? `${application.minutesAfterPublish} min efter publicering`
                        : `${Math.round(application.minutesAfterPublish / 60)} tim efter publicering`}
                      {" · "}
                      {application.position === 1 ? "plats 1" : `plats ${application.position}`}
                    </p>
                    <OfferTrail status={application.status} />
                  </button>
                  {expanded ? (
                    <div className="mt-4 border-t border-line pt-4">
                      <p className="text-sm leading-relaxed text-soft">{application.note}</p>
                      {application.viewingAt ? (
                        <p className="mt-2 text-sm font-medium">Visning {formatDateTime(application.viewingAt)}</p>
                      ) : null}
                      {application.respondBy && application.status === "erbjuden" ? (
                        <p className="mt-2 text-sm font-medium text-clay">Svara senast {formatDateTime(application.respondBy)} · <Countdown deadline={application.respondBy} /></p>
                      ) : null}
                      <ol className="mt-4 space-y-3 text-sm">
                        <li className="flex justify-between gap-4">
                          <span>Publicerad</span>
                          <span className="text-soft">{relative(new Date(new Date(application.appliedAt).getTime() - application.minutesAfterPublish * 60000).toISOString())}</span>
                        </li>
                        <li className="flex justify-between gap-4">
                          <span>Ansökan skickad</span>
                          <span className="text-soft">{formatDateTime(application.appliedAt)}</span>
                        </li>
                        {application.status !== "skickad" ? (
                          <li className="flex justify-between gap-4">
                            <span>{status.label}</span>
                            <span className="text-soft">{formatDateTime(application.eventAt)}</span>
                          </li>
                        ) : null}
                      </ol>
                      <Link href={OFFER_STATUS.has(application.status) ? `/erbjudande?id=${application.id}` : `/bostad?id=${listing.id}`} className="mt-4 inline-block text-sm font-medium">
                        {OFFER_STATUS.has(application.status) ? "Öppna erbjudandet" : "Visa bostad"}
                      </Link>
                    </div>
                  ) : null}
                </article>
              );
            })}
            </>
          )
        ) : store.queues.length === 0 ? (
          <EmptyState
            title="Inga köer kopplade"
            body="Koppla Bostadsförmedlingen, Boplats eller Boplats Syd så syns kötid, avgift och förnyelse här."
            action={<Link href="/kopplingar" className="rounded-full bg-ink px-4 py-2 text-sm text-paper">Koppla en kö</Link>}
          />
        ) : (
          <>
            <QueueKeep storeKeep={store.prefs.keepQueues !== false} queues={store.queues} onToggle={() => store.setPrefs({ keepQueues: store.prefs.keepQueues === false })} />
            {store.queues.map((queue) => {
              const place = queuePlace(queue, store.prefs.keepQueues !== false);
              return (
                <article key={queue.id} className="rounded-3xl border border-line bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <LandlordLogo id={queue.sourceId} name={queue.name} size={48} />
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold tracking-tight">{queue.name}</h2>
                        <p className="text-sm text-soft">{queue.city} · i kön sedan {monthYear(queue.since)}</p>
                      </div>
                    </div>
                    <p className="num text-right text-2xl font-semibold tracking-tight">
                      {queue.days != null ? formatNumber(queue.days) : queue.points != null ? formatNumber(queue.points) : "–"}
                      <span className="mt-1 block text-xs font-normal text-soft">{queue.days != null ? "dagar" : "poäng"}</span>
                    </p>
                  </div>
                  <div className="mt-3">
                    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", place.secured ? "bg-pine-soft text-pine-deep" : "bg-clay-soft text-clay")}>
                      <span className={cx("h-2 w-2 rounded-full", place.secured ? "bg-pine" : "bg-clay")} />
                      {place.badge}
                    </span>
                    <p className="mt-2 text-sm">{place.status}</p>
                    <p className="mt-1 text-sm leading-relaxed text-soft">{place.detail}</p>
                  </div>
                  <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                    <div className="rounded-2xl bg-paper px-3 py-2">
                      <dt className="text-xs text-soft">Årsavgift</dt>
                      <dd className="mt-1">{queue.feeKr ? `${kr(queue.feeKr)}${queue.feeDue ? ` · ${formatDate(queue.feeDue)}` : ""}` : "Ingen avgift"}</dd>
                    </div>
                    <div className="rounded-2xl bg-paper px-3 py-2">
                      <dt className="text-xs text-soft">Förnyelse</dt>
                      <dd className="mt-1">{queue.renewDue ? formatDate(queue.renewDue) : queue.nextRenewal ? formatDate(queue.nextRenewal) : "Ingen spärr"}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function ApplicationCounters() {
  const store = useStore();
  const rows = store.sources.flatMap((source) => {
    if (applicationLimit(source) == null) return [];
    const connected = store.connections[source.id]?.status === "connected";
    const count = activeForSource(store.applications, store.listings, source.id).length;
    if (!connected && count === 0) return [];
    return [{ id: source.id, name: source.name, label: limitCounter(source, count) }];
  });
  if (rows.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {rows.map((row) => (
        <p key={row.id} className="inline-flex items-center gap-2 rounded-full bg-paper-deep px-3 py-1 text-sm text-ink">
          <LandlordLogo id={row.id} name={row.name} layout="inline" size={16} />
          {row.label}
        </p>
      ))}
    </div>
  );
}

function WaitingList() {
  const store = useStore();
  if (store.waiting.length === 0) return null;
  return (
    <section className="rounded-3xl border border-line bg-card p-4">
      <h2 className="text-sm font-medium">Väntar på plats</h2>
      <ul className="mt-3 space-y-3">
        {store.waiting.map((spot) => {
          const listing = store.listings.find((item) => item.id === spot.listingId);
          const source = store.sources.find((item) => item.id === spot.sourceId);
          if (!listing) return null;
          return (
            <li key={spot.listingId} className="text-sm">
              <Link href={`/bostad?id=${listing.id}`} className="font-medium">{listing.address}</Link>
              <p className="mt-0.5 flex items-center gap-2 text-soft">
                {source ? <LandlordLogo id={source.id} name={source.name} layout="inline" size={16} /> : null}
                <span>{source?.name}. Vi säger till när en ansökan avslutas och en plats öppnas.</span>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function QueueKeep({
  storeKeep,
  queues,
  onToggle,
}: {
  storeKeep: boolean;
  queues: Queue[];
  onToggle: () => void;
}) {
  const secured = queues.filter((queue) => queuePlace(queue, storeKeep).secured).length;
  return (
    <section className="rounded-3xl border border-line bg-card p-4">
      <h2 className="text-sm font-medium">Behåll din plats</h2>
      <p className="mt-1 text-sm leading-relaxed text-soft">
        En missad förnyelse kan nollställa flera års kötid. Blixtbo loggar in och bekräftar intresset i den takt varje kö kräver.
      </p>
      <div className="mt-4 flex items-center justify-between gap-4 border-t border-line pt-3">
        <p className="text-sm font-medium">Håll mina köplatser aktiva automatiskt</p>
        <Switch on={storeKeep} label="Håll mina köplatser aktiva automatiskt" onClick={onToggle} />
      </div>
      <p className={cx("mt-3 text-sm", secured === queues.length && storeKeep ? "text-pine" : "text-soft")}>
        {storeKeep ? `${secured} av ${queues.length} platser är säkrade` : "Automatiken är av. Du förnyar själv."}
      </p>
    </section>
  );
}

export function Tracker() {
  return (
    <Suspense fallback={<Boot />}>
      <TrackerInner />
    </Suspense>
  );
}
