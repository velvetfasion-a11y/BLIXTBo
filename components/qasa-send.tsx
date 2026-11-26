"use client";

import { useState } from "react";
import { Button, Sheet } from "@/components/ui";
import { draftQasaMessage, qasaListingUrl } from "@/lib/qasa-message";
import { useStore } from "@/lib/store";
import type { Listing } from "@/lib/types";

export function QasaSend({
  listing,
  open,
  onClose,
}: {
  listing: Listing | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!listing) return null;
  return (
    <QasaForm
      key={listing.id}
      listing={listing}
      open={open}
      onClose={onClose}
    />
  );
}

function QasaForm({
  listing,
  open,
  onClose,
}: {
  listing: Listing;
  open: boolean;
  onClose: () => void;
}) {
  const store = useStore();
  const saved = store.qasaNotes[listing.id];
  const draft = draftFor(listing, store.user?.name ?? "", store.user?.profile);
  const [text, setText] = useState(saved?.message || draft);
  const [hint, setHint] = useState(false);
  const sent = Boolean(store.qasaNotes[listing.id]?.sent);
  const url = qasaListingUrl(listing);

  async function copyAndOpen() {
    store.saveQasaNote(listing!.id, { message: text });
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // The text stays in the field if the browser blocks the clipboard.
    }
    window.open(url, "_blank", "noopener,noreferrer");
    setHint(true);
  }

  return (
    <Sheet open={open} title="Meddelande till hyresvärden" onClose={onClose}>
      <div className="space-y-4">
        <h2 className="font-serif text-[1.7rem] leading-tight tracking-[-0.03em]">Skriv till hyresvärden</h2>
        <p className="text-sm leading-relaxed text-soft">
          Blixtbo skickar inget till Qasa. Du klistrar in texten själv.
        </p>
        <label className="block text-sm">
          <span className="text-soft">Meddelande</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={() => store.saveQasaNote(listing.id, { message: text })}
            rows={10}
            className="mt-1 w-full rounded-2xl border border-line bg-card px-3 py-2 outline-none focus:border-ink"
          />
        </label>
        <Button size="lg" className="w-full" onClick={() => void copyAndOpen()}>
          Kopiera & öppna Qasa
        </Button>
        {hint ? <p className="text-sm leading-relaxed text-pine">Klistra in och tryck Skicka</p> : null}
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3 text-sm">
          <span>Skickad?</span>
          <button
            type="button"
            role="switch"
            aria-checked={sent}
            onClick={() => store.saveQasaNote(listing.id, { message: text, sent: !sent })}
            className={sent ? "rounded-full bg-pine px-3 py-1 text-paper" : "rounded-full bg-paper-deep px-3 py-1"}
          >
            {sent ? "Ja" : "Nej"}
          </button>
        </label>
      </div>
    </Sheet>
  );
}

function draftFor(listing: Listing, name: string, profile: { occupation: string; adults: number; children: number; letter: string } | undefined) {
  return draftQasaMessage({
    name,
    occupation: profile?.occupation ?? "",
    adults: profile?.adults ?? 1,
    children: profile?.children ?? 0,
    letter: profile?.letter ?? "",
    moveIn: listing.moveIn,
    address: listing.address,
    area: listing.area,
    city: listing.city,
    rooms: listing.rooms,
    sqm: listing.sqm,
    rent: listing.rent,
  });
}
