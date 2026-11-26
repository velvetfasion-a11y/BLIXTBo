"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ApplicationLimitSheet } from "@/components/application-limit";
import { FullscreenSwipe } from "@/components/fullscreen-swipe";
import { IconExpand } from "@/components/icons";
import { LandlordLogo } from "@/components/landlord-logo";
import { canAutoApply } from "@/lib/billing";
import { ConfirmApply, ConfirmSend } from "@/components/confirm-apply";
import { Paywall } from "@/components/paywall";
import { QueueNudge } from "@/components/queue-nudge";
import { Countdown } from "@/components/countdown";
import { ConnectSheet } from "@/components/connect-sheet";
import { EmptyState, StatusPill } from "@/components/ui";
import { asset } from "@/lib/asset";
import { deadlineLabel, floorLabel, formatDateTime, freshness, kr, rokShort } from "@/lib/format";
import { isQasaListing, sendConfirmation } from "@/lib/landlord-api";
import { landlordLabel } from "@/lib/landlord-logos";
import { QasaSend } from "@/components/qasa-send";
import { atApplicationLimit } from "@/lib/limits";
import { assess, passesFilters } from "@/lib/profile";
import { useStore } from "@/lib/store";
import { decideHorizontal, fullscreenApiEnabled, requestElementFullscreen } from "@/lib/swipe";
import type { Listing } from "@/lib/types";

export function Feed() {
  const store = useStore();
  const [gate, setGate] = useState<string | null>(null);
  const [pendingApply, setPendingApply] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [limitId, setLimitId] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);
  const [sendId, setSendId] = useState<string | null>(null);
  const [qasaId, setQasaId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const fullscreenRoot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Hem · Blixtbo";
  }, []);

  const deck = useMemo(() => {
    const applied = new Set(store.applications.filter((item) => item.status !== "aterkallad").map((item) => item.listingId));
    const skipped = new Set(store.dismissed);
    const waiting = new Set(store.waiting.map((item) => item.listingId));
    return store.listings
      .filter((listing) => passesFilters(listing, store.filters, store.sources))
      .filter((listing) => !applied.has(listing.id) && !skipped.has(listing.id) && !waiting.has(listing.id))
      .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  }, [store.applications, store.dismissed, store.filters, store.listings, store.sources, store.waiting]);

  const recent = store.listings.filter((listing) => listing.active && listing.ageMinutes < 180).length;

  const activeChips = chips(store.filters);
  const dialogOpen = Boolean(gate || confirmId || limitId || paywall || sendId || qasaId);

  function requestApply(listing: Listing) {
    const source = store.sources.find((item) => item.id === listing.sourceId);
    if (isQasaListing(source, listing)) {
      setQasaId(listing.id);
      return false;
    }
    const connected = store.connections[listing.sourceId]?.status === "connected";
    if (listing.manualApply) return false;
    if (!connected) {
      setPendingApply(listing.id);
      setGate(listing.sourceId);
      return false;
    }
    if (atApplicationLimit(store.sources, store.applications, store.listings, listing.sourceId)) {
      setLimitId(listing.id);
      return false;
    }
    if (!canAutoApply(store.billing)) {
      setPaywall(true);
      return false;
    }
    if (!assess(listing, store.user?.profile ?? null).ready) {
      setConfirmId(listing.id);
      return false;
    }
    if (sendConfirmation(source, listing)) {
      setSendId(listing.id);
      return false;
    }
    return true;
  }

  function openFullscreen() {
    // The Fullscreen API only accepts the call in the same turn as the tap.
    flushSync(() => setFullscreen(true));
    const doc = document as Document & { webkitFullscreenEnabled?: boolean };
    requestElementFullscreen(fullscreenRoot.current, fullscreenApiEnabled(doc));
  }

  return (
    <>
    <div className="px-4 pt-5 md:px-8 md:pt-8" inert={fullscreen ? true : undefined}>
      <div className="mx-auto grid max-w-6xl lg:grid-cols-[minmax(320px,440px)_minmax(0,1fr)] lg:gap-8 lg:items-start">
        <div className="flex h-[calc(100dvh-6.75rem)] flex-col md:h-[calc(100dvh-4rem)]">
          {store.applications.some((item) => item.status === "erbjuden") ? <OfferBanner /> : null}
          <QueueNudge />
          <header className="mb-3 flex shrink-0 items-end justify-between gap-3">
            <div>
              <p className="text-sm text-soft">{recent > 0 ? `${recent} publicerade de senaste timmarna` : "Bevakningen är på"}</p>
              <h1 className="mt-1 font-serif text-4xl tracking-[-0.03em]">För dig</h1>
            </div>
            <Link href="/filter" className="rounded-full border border-line bg-card px-4 py-2 text-sm font-medium">
              Filter
            </Link>
          </header>
          {activeChips.length > 0 ? (
            <div className="mb-3 flex shrink-0 flex-wrap gap-2">
              {activeChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={chip.clear}
                  className="rounded-full bg-ink px-3 py-1 text-xs text-paper"
                >
                  {chip.label} · ta bort
                </button>
              ))}
            </div>
          ) : null}
          <div className="min-h-0 flex-1">
            {deck.length === 0 ? (
              <EmptyState
                title={store.listings.some((listing) => passesFilters(listing, store.filters, store.sources)) ? "Du är ikapp" : "Inget matchar filtren"}
                body={
                  store.listings.some((listing) => passesFilters(listing, store.filters, store.sources))
                    ? "Inga fler bostäder just nu. Vi lägger nästa annons överst så fort den publiceras."
                    : "Vidga hyra, område eller inflytt. Bevakningen fortsätter med de filter du sparar."
                }
                action={
                  <Link href="/filter" className="rounded-full bg-ink px-4 py-2 text-sm text-paper">
                    Justera filter
                  </Link>
                }
              />
            ) : (
              <Deck
                listings={deck}
                paused={fullscreen}
                onExpand={openFullscreen}
                onSkip={(id) => store.skip(id)}
                onYes={requestApply}
                onApply={(id) => store.apply(id)}
              />
            )}
          </div>
          <p className="mt-2 hidden shrink-0 text-center text-xs text-faint lg:block">Pil vänster nej · pil höger ja</p>
        </div>
        <div className="sticky top-8 hidden max-h-[calc(100dvh-4rem)] overflow-y-auto lg:block">
          {deck[0] ? <DetailPanel listing={deck[0]} /> : <div className="rounded-3xl border border-dashed border-line px-6 py-16 text-sm text-soft">När en bostad ligger överst syns detaljerna här.</div>}
        </div>
      </div>
    </div>
      {fullscreen ? (
        <FullscreenSwipe
          rootRef={fullscreenRoot}
          listings={deck}
          dialogOpen={dialogOpen}
          onClose={() => setFullscreen(false)}
          onSkip={(id) => store.skip(id)}
          onYes={requestApply}
          onApply={(id) => store.apply(id)}
        />
      ) : null}
      {gate ? (
        <ConnectSheet
          key={gate}
          sourceId={gate}
          listing={store.listings.find((item) => item.id === pendingApply) ?? null}
          open
          intent="signup"
          onClose={() => {
            setGate(null);
            setPendingApply(null);
          }}
        />
      ) : null}
      <ApplicationLimitSheet listing={store.listings.find((item) => item.id === limitId) ?? null} onClose={() => setLimitId(null)} />
      <Paywall open={paywall} onClose={() => setPaywall(false)} />
      <ConfirmApply
        listing={store.listings.find((item) => item.id === confirmId) ?? null}
        onClose={() => setConfirmId(null)}
        onSend={() => {
          if (confirmId) store.apply(confirmId);
          setConfirmId(null);
        }}
      />
      <ConfirmSend
        open={Boolean(sendId)}
        title="Bekräfta innan något skickas"
        body={sendConfirmation(
          store.sources.find((item) => item.id === store.listings.find((listing) => listing.id === sendId)?.sourceId),
          store.listings.find((listing) => listing.id === sendId),
        ) || ""}
        onClose={() => setSendId(null)}
        onSend={() => {
          const listing = store.listings.find((item) => item.id === sendId);
          const source = store.sources.find((item) => item.id === listing?.sourceId);
          const text = sendConfirmation(source, listing);
          if (sendId && text) store.apply(sendId, { confirmation: text });
          setSendId(null);
        }}
      />
      <QasaSend
        listing={store.listings.find((item) => item.id === qasaId) ?? null}
        open={Boolean(qasaId)}
        onClose={() => setQasaId(null)}
      />
    </>
  );

  function chips(filters: typeof store.filters) {
    const items: { id: string; label: string; clear: () => void }[] = [];
    if (filters.areas.length) {
      const label = filters.areas.length > 2 ? `${filters.areas.length} områden` : filters.areas.join(", ");
      items.push({ id: "areas", label, clear: () => store.setFilters({ areas: [] }) });
    }
    if (filters.maxRent < 20000) items.push({ id: "rent", label: `Max ${kr(filters.maxRent)}`, clear: () => store.setFilters({ maxRent: 20000 }) });
    if (filters.rooms !== "any") items.push({ id: "rooms", label: filters.rooms === "5+" ? "5+ rok" : `${filters.rooms} rok`, clear: () => store.setFilters({ rooms: "any" }) });
    if (filters.minSqm > 0) items.push({ id: "sqm", label: `Minst ${filters.minSqm} m²`, clear: () => store.setFilters({ minSqm: 0 }) });
    if (filters.minFloor > 0) items.push({ id: "floor", label: `Lägst våning ${filters.minFloor}`, clear: () => store.setFilters({ minFloor: 0 }) });
    if (filters.moveIn) items.push({ id: "move", label: `Inflytt senast ${filters.moveIn}`, clear: () => store.setFilters({ moveIn: "" }) });
    return items;
  }
}

function Deck({
  listings,
  paused,
  onExpand,
  onYes,
  onApply,
  onSkip,
}: {
  listings: Listing[];
  paused: boolean;
  onExpand: () => void;
  onYes: (listing: Listing) => boolean;
  onApply: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<"yes" | "no" | null>(null);
  const [seenId, setSeenId] = useState(listings[0]?.id);
  const xRef = useRef(0);
  const origin = useRef(0);
  const top = listings[0];
  const next = listings[1];

  if (top?.id !== seenId) {
    setSeenId(top?.id);
    setX(0);
    setLeaving(null);
    xRef.current = 0;
  }

  useEffect(() => {
    if (paused) return;
    function onKey(event: KeyboardEvent) {
      if (!top || leaving) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (event.key === "ArrowRight") commit("yes");
      if (event.key === "ArrowLeft") commit("no");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // commit skapas på nytt i samma render som värdena ovan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top, leaving, paused, onYes, onApply, onSkip]);

  function setDrag(value: number) {
    xRef.current = value;
    setX(value);
  }

  function commit(direction: "yes" | "no") {
    if (!top || leaving) return;
    if (direction === "yes" && !onYes(top)) {
      setDrag(0);
      return;
    }
    setLeaving(direction);
    setDrag(direction === "yes" ? 560 : -560);
    const id = top.id;
    window.setTimeout(() => {
      if (direction === "yes") onApply(id);
      else onSkip(id);
      setLeaving(null);
      setDrag(0);
    }, 240);
  }

  if (!top) return null;

  return (
    <div className="relative h-full">
      {next ? (
        <div className="absolute inset-x-4 top-4 bottom-0 overflow-hidden rounded-[28px] opacity-70">
          <img src={asset(next.photos[0])} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}
      <article
        className={`swipe-move absolute inset-0 flex touch-none flex-col overflow-hidden rounded-[28px] border border-line bg-card shadow-[0_18px_50px_rgba(48,36,22,0.08)]${dragging ? " is-dragging" : ""}`}
        style={{
          transform: `translate3d(${x}px, 0, 0) rotate(${x / 32}deg)`,
        }}
        onPointerDown={(event) => {
          if (leaving) return;
          if ((event.target as HTMLElement).closest("a, button")) return;
          origin.current = event.clientX;
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragging) return;
          setDrag(event.clientX - origin.current);
        }}
        onPointerUp={() => {
          if (!dragging) return;
          setDragging(false);
          const decision = decideHorizontal(xRef.current);
          if (decision === "yes") commit("yes");
          else if (decision === "no") commit("no");
          else setDrag(0);
        }}
        onPointerCancel={() => {
          setDragging(false);
          setDrag(0);
        }}
      >
        <div className="relative min-h-0 flex-1 basis-0">
          <img src={asset(top.photos[0])} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <button
            id="helskarm-knapp"
            type="button"
            onClick={onExpand}
            className={`absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-card/95 px-3 py-1.5 text-sm font-medium text-ink shadow-[0_8px_24px_rgba(28,25,22,0.12)]${dragging || leaving || x !== 0 ? " pointer-events-none opacity-0" : ""}`}
          >
            <IconExpand className="h-4 w-4" />
            Helskärm
          </button>
          <div className="absolute top-3 left-3">
            <StatusPill tone="ink">{freshness(top.publishedAt)}</StatusPill>
          </div>
          <div
            className="pointer-events-none absolute top-4 left-4 rounded-xl border-2 border-pine px-2 py-1 text-sm font-semibold tracking-wide text-pine"
            style={{ opacity: Math.max(0, Math.min(1, x / 90)) }}
          >
            JA
          </div>
          <div
            className="pointer-events-none absolute top-14 right-4 rounded-xl border-2 border-clay px-2 py-1 text-sm font-semibold tracking-wide text-clay"
            style={{ opacity: Math.max(0, Math.min(1, -x / 90)) }}
          >
            NEJ
          </div>
        </div>
        <div className="space-y-3 px-4 pt-4 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{top.address}</h2>
              <p className="mt-0.5 text-sm text-soft">
                {top.area}, {top.city} · {floorLabel(top.floor, top.floors)}
              </p>
            </div>
            <p className="num shrink-0 text-right text-lg font-semibold tracking-tight whitespace-nowrap">{kr(top.rent)}</p>
          </div>
          <p className="text-sm text-soft">
            {rokShort(top.rooms)} · {top.sqm} m² · {top.features.slice(0, 2).join(" · ") || "Förstahand"}
          </p>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex min-w-0 items-center gap-2 font-medium">
              <LandlordLogo id={top.sourceId} name={top.sourceName || landlordLabel(top.sourceId)} layout="inline" size={18} />
              <span className="truncate">{top.sourceName || landlordLabel(top.sourceId)}</span>
            </span>
            <span className={top.deadlineAt ? "text-clay" : "text-soft"}>{deadlineLabel(top.deadlineAt)}</span>
          </div>
          <MatchBlock listing={top} />
          <div className="flex items-center justify-between pt-1">
            <button type="button" className="grid h-14 w-14 place-items-center rounded-full border border-line text-sm font-medium" onClick={() => commit("no")} aria-label="Nej, hoppa över">
              Nej
            </button>
            <Link href={`/bostad?id=${top.id}`} className="text-sm text-soft">
              Mer om bostaden
            </Link>
            {top.manualApply ? (
              <a href={top.applyUrl} target="_blank" rel="noreferrer" className="inline-flex h-14 items-center rounded-full border border-line px-4 text-sm font-medium">
                Ansök själv
              </a>
            ) : (
              <button type="button" className="grid h-14 w-14 place-items-center rounded-full bg-pine text-sm font-medium text-white" onClick={() => commit("yes")} aria-label="Ja, ansök">
                Ja
              </button>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}

function MatchBlock({ listing }: { listing: Listing }) {
  const store = useStore();
  const profile = store.user?.profile ?? null;
  const result = assess(listing, profile);
  const connected = store.connections[listing.sourceId]?.status === "connected";
  return (
    <div className="space-y-1 text-sm">
      {result.lines.map((line) => (
        <p key={line.text} className={line.tone === "ok" ? "text-pine" : line.tone === "warn" ? "text-clay" : "text-soft"}>
          {line.text}
        </p>
      ))}
      {!connected && !listing.manualApply ? <p className="text-soft">Koppla {listing.sourceName || sourceName(listing.sourceId)} för att ansöka.</p> : null}
    </div>
  );
}

export function DetailPanel({ listing }: { listing: Listing }) {
  const store = useStore();
  const profile = store.user?.profile ?? null;
  const result = assess(listing, profile);
  const source = store.sources.find((item) => item.id === listing.sourceId);
  return (
    <article className="overflow-hidden rounded-[28px] border border-line bg-card">
      <img src={asset(listing.photos[0])} alt="" className="h-64 w-full object-cover" />
      <div className="space-y-4 p-6">
        <div>
          <p className="flex items-center gap-2 text-sm text-soft">
            <LandlordLogo id={listing.sourceId} name={listing.sourceName || source?.name || landlordLabel(listing.sourceId)} layout="inline" size={18} />
            <span className="min-w-0 truncate">{freshness(listing.publishedAt)} · {listing.sourceName || source?.name}</span>
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{listing.address}</h2>
          <p className="text-soft">{listing.area}, {listing.city}</p>
        </div>
        <p className="num text-3xl font-semibold tracking-tight">{kr(listing.rent)}<span className="text-base font-normal text-soft"> / mån</span></p>
        <p className="text-sm leading-relaxed text-soft">{listing.description}</p>
        <div className="space-y-1 text-sm">
          {result.lines.map((line) => (
            <p key={line.text} className={line.tone === "ok" ? "text-pine" : line.tone === "warn" ? "text-clay" : "text-soft"}>
              {line.text}
            </p>
          ))}
        </div>
        <Link href={`/bostad?id=${listing.id}`} className="inline-flex text-sm font-medium">
          Öppna hela annonsen
        </Link>
      </div>
    </article>
  );
}

function OfferBanner() {
  const store = useStore();
  const application = store.applications.find((item) => item.status === "erbjuden" && item.respondBy);
  const listing = store.listings.find((item) => item.id === application?.listingId);
  if (!application?.respondBy || !listing) return null;
  return (
    <Link href={`/erbjudande?id=${application.id}`} className="mb-3 block shrink-0 rounded-2xl border border-line bg-card px-4 py-3">
      <p className="text-sm font-medium">Grattis! Du har erbjudits {listing.address}</p>
      <p className="mt-1 text-sm text-soft">
        Svara senast {formatDateTime(application.respondBy)} · <Countdown deadline={application.respondBy} />
      </p>
    </Link>
  );
}

function sourceName(id: string) {
  const names: Record<string, string> = {
    homeq: "HomeQ",
    wahlin: "Wåhlin",
    heimstaden: "Heimstaden",
    akelius: "Akelius",
    qasa: "Qasa",
    bostadsformedlingen: "Bostadsförmedlingen",
    boplats: "Boplats Göteborg",
    boplatssyd: "Boplats Syd",
    uppsala: "Uppsala Bostadsförmedling",
    wallenstam: "Wallenstam",
    stena: "Stena Fastigheter",
  };
  return names[id] ?? id;
}
