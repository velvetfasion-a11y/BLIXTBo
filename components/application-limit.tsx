"use client";

import { useState } from "react";
import { Button, Sheet } from "@/components/ui";
import { kr, rokShort } from "@/lib/format";
import { activeForSource, limitMessage } from "@/lib/limits";
import { useStore } from "@/lib/store";
import type { Listing } from "@/lib/types";

export function ApplicationLimitSheet({
  listing,
  onClose,
}: {
  listing: Listing | null;
  onClose: () => void;
}) {
  const store = useStore();
  const [swapping, setSwapping] = useState(false);
  const source = store.sources.find((item) => item.id === listing?.sourceId);
  const current = listing ? activeForSource(store.applications, store.listings, listing.sourceId) : [];

  if (!listing || !source || source.applicationLimit == null) return null;

  function leave() {
    store.deferListing(listing!.id);
    onClose();
  }

  function swap(applicationId: string) {
    store.swapApplication(applicationId, listing!.id);
    onClose();
  }

  return (
    <Sheet open title={swapping ? "Byt ut en ansökan" : `Ansökningar hos ${source.name}`} onClose={onClose}>
      {swapping ? (
        <div className="space-y-4">
          <h2 className="font-serif text-[1.7rem] leading-tight tracking-[-0.03em]">Byt ut en ansökan</h2>
          <p className="text-sm leading-relaxed text-soft">
            Dra tillbaka en ansökan hos {source.name} så skickas {listing.address} i stället. De andra ligger kvar.
          </p>
          <ul className="space-y-2">
            {current.map((application) => {
              const item = store.listings.find((row) => row.id === application.listingId);
              if (!item) return null;
              return (
                <li key={application.id} className="rounded-2xl border border-line bg-card px-4 py-3">
                  <p className="text-sm font-medium">{item.address}</p>
                  <p className="mt-0.5 text-sm text-soft">
                    {item.area} · {rokShort(item.rooms)} · {kr(item.rent)}
                  </p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => swap(application.id)}>
                    Dra tillbaka den här
                  </Button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="text-sm text-soft" onClick={() => setSwapping(false)}>
            Tillbaka
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="font-serif text-[1.65rem] leading-tight tracking-[-0.03em]">{limitMessage(source)}</h2>
          <p className="text-sm leading-relaxed text-soft">
            Inget brådskar. Byt en ansökan, spara bostaden tills en plats öppnas, eller läs om {source.id === "homeq" ? "HomeQ+" : "deras plus"} hos {source.name}. Blixtbo säljer det inte.
          </p>
          <div className="flex flex-col gap-2">
            {source.plusUrl ? (
              <a
                href={source.plusUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center justify-center rounded-full border border-line bg-card px-5 text-base font-medium"
              >
                Skaffa {source.id === "homeq" ? "HomeQ+" : `${source.name}+`}
              </a>
            ) : null}
            <Button size="lg" variant="outline" onClick={() => setSwapping(true)}>
              Byt ut en ansökan
            </Button>
            <Button size="lg" variant="outline" onClick={leave}>
              Låt allt vara
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
