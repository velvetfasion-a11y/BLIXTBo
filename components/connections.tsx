"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConnectSheet } from "@/components/connect-sheet";
import { IconChevron } from "@/components/icons";
import { Button, PrivacyNote, cx } from "@/components/ui";
import { useStore } from "@/lib/store";

export function Connections() {
  const store = useStore();
  const [sheet, setSheet] = useState<{ id: string; intent: "login" | "signup" } | null>(null);

  useEffect(() => {
    document.title = "Hyresvärdar · Blixtbo";
  }, []);

  const connected = store.sources.filter((source) => store.connections[source.id]?.status === "connected").length;

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6 md:px-8 md:py-10">
      <Link href="/profil" className="inline-flex items-center gap-1 text-sm text-soft">
        <IconChevron className="h-4 w-4" />
        Profil
      </Link>
      <h1 className="mt-4 font-serif text-4xl tracking-[-0.03em]">Hyresvärdar</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-soft">
        {connected} av {store.sources.length} kopplade. Ansökan skickas bara dit kontot är kopplat.
      </p>
      <div className="mt-5">
        <PrivacyNote />
      </div>
      <ul className="mt-5 space-y-3">
        {store.sources.map((source) => {
          const link = store.connections[source.id];
          const on = link?.status === "connected";
          return (
            <li key={source.id} className="rounded-3xl border border-line bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-soft">{source.kind}</p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight">{source.name}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-soft">{source.blurb}</p>
                </div>
                <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", on ? "bg-pine-soft text-pine-deep" : "bg-paper-deep text-soft")}>
                  {on ? "Kopplad" : "Inte kopplad"}
                </span>
              </div>
              {on ? (
                <div className="mt-4 space-y-3">
                  {source.requiresBankId ? (
                    <p className="text-sm leading-relaxed text-soft">
                      Förnyelse kan kräva ett nytt BankID-godkännande. Du får en notis.
                    </p>
                  ) : null}
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <p className="truncate text-soft">{link?.email}</p>
                    <button type="button" className="text-clay" onClick={() => store.disconnect(source.id)}>
                      Koppla från
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex gap-2">
                  <Button size="sm" onClick={() => setSheet({ id: source.id, intent: "login" })}>
                    Logga in
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSheet({ id: source.id, intent: "signup" })}>
                    Skapa konto
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {sheet ? (
        <ConnectSheet
          key={`${sheet.id}-${sheet.intent}`}
          sourceId={sheet.id}
          open
          intent={sheet.intent}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}
