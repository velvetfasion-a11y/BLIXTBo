"use client";

import { Button, Sheet } from "@/components/ui";
import { assess } from "@/lib/profile";
import { useStore } from "@/lib/store";
import type { Listing } from "@/lib/types";

export function ConfirmSend({
  open,
  title,
  body,
  onClose,
  onSend,
}: {
  open: boolean;
  title: string;
  body: string;
  onClose: () => void;
  onSend: () => void;
}) {
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="space-y-4">
        <h2 className="font-serif text-3xl tracking-[-0.03em]">{title}</h2>
        <p className="text-sm leading-relaxed text-soft">{body} Inget skickas förrän du bekräftar.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Avbryt
          </Button>
          <Button className="flex-1" variant="pine" onClick={onSend}>
            Bekräfta och skicka
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

export function ConfirmApply({
  listing,
  onClose,
  onSend,
}: {
  listing: Listing | null;
  onClose: () => void;
  onSend: () => void;
}) {
  const store = useStore();
  const result = listing ? assess(listing, store.user?.profile ?? null) : null;

  return (
    <Sheet open={Boolean(listing)} title="Saknas underlag" onClose={onClose}>
      {listing && result ? (
        <div className="space-y-4">
          <h2 className="font-serif text-3xl tracking-[-0.03em]">Något saknas</h2>
          <p className="text-sm leading-relaxed text-soft">
            Hyresvärden kan avslå {listing.address} om underlaget inte räcker. Du kan skicka ändå.
          </p>
          <ul className="space-y-1 text-sm">
            {result.lines.map((line) => (
              <li key={line.text} className={line.tone === "ok" ? "text-pine" : line.tone === "warn" ? "text-clay" : "text-soft"}>
                {line.text}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Avbryt
            </Button>
            <Button className="flex-1" variant="pine" onClick={onSend}>
              Skicka ändå
            </Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
