"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ConnectSheet } from "@/components/connect-sheet";
import { CustomLandlords } from "@/components/custom-landlords";
import { LandlordLogo } from "@/components/landlord-logo";
import { IconChevron } from "@/components/icons";
import { Button, PrivacyNote, cx } from "@/components/ui";
import { formatDayMonth } from "@/lib/format";
import { cloudReady, putJson } from "@/lib/landlord-cloud";
import { useStore } from "@/lib/store";
import type { Connection } from "@/lib/types";

const FEE_SOURCES = new Set(["bostadsformedlingen", "uppsala", "boplats", "boplatssyd"]);

function keepaliveLine(link: Connection | undefined): string | null {
  if (!link?.keepaliveState || link.keepaliveState === "skipped" || link.keepaliveState === "dry_run") return null;
  if (link.keepaliveCode === "password_changed") return "Behöver nytt lösenord";
  if (link.keepaliveState === "ok") {
    return link.lastKeptAliveAt ? `Hålls aktiv · senast ${formatDayMonth(link.lastKeptAliveAt)}` : "Hålls aktiv";
  }
  if (link.keepaliveState === "fee_due") {
    return link.feeDueAt ? `Betala köavgiften före ${formatDayMonth(link.feeDueAt)}` : null;
  }
  if (link.keepaliveState === "paused") return "Pausad – kräver Premium";
  if (link.keepaliveState === "needs_user" || link.keepaliveState === "needs_bankid") {
    return link.keepaliveNotice || "Behöver dig";
  }
  return null;
}

export function Connections() {
  const store = useStore();
  const params = useSearchParams();
  const [sheet, setSheet] = useState<{ id: string; intent: "login" | "signup" } | null>(null);

  useEffect(() => {
    document.title = "Hyresvärdar · Blixtbo";
  }, []);

  useEffect(() => {
    const source = params.get("source");
    const intent = params.get("intent");
    if (source && (intent === "login" || intent === "signup")) {
      setSheet({ id: source, intent });
    }
  }, [params]);

  const builtin = store.sources.filter((source) => !store.customLandlords.some((item) => item.id === source.id));
  const connected = builtin.filter((source) => store.connections[source.id]?.status === "connected").length;

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6 md:px-8 md:py-10">
      <Link href="/profil" className="inline-flex items-center gap-1 text-sm text-soft">
        <IconChevron className="h-4 w-4" />
        Profil
      </Link>
      <h1 className="mt-4 font-serif text-4xl tracking-[-0.03em]">Hyresvärdar</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-soft">
        {connected} av {builtin.length} kopplade. Ansökan skickas bara dit kontot är kopplat.
      </p>
      <div className="mt-5">
        <PrivacyNote />
      </div>
      <CustomLandlords />
      <ul className="mt-8 space-y-3">
        {builtin.map((source) => {
          const link = store.connections[source.id];
          const on = link?.status === "connected";
          const waiting = link?.status === "pending" || link?.status === "needs_user" || link?.status === "needs_bankid";
          const needsPassword = link?.keepaliveCode === "password_changed";
          const paused = link?.keepaliveState === "paused";
          const label = needsPassword
            ? "Behöver nytt lösenord"
            : paused
              ? "Pausad – kräver Premium"
              : on
                ? "Kopplad"
                : link?.status === "needs_bankid"
                  ? "BankID behövs"
                  : link?.status === "needs_user"
                    ? "Kräver dig"
                    : link?.status === "pending"
                      ? "Väntar"
                      : "Inte kopplad";
          const line = keepaliveLine(link);
          const fee = link?.keepaliveStrategy === "fee_reminder" || FEE_SOURCES.has(source.id);
          return (
            <li key={source.id} className="rounded-3xl border border-line bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <LandlordLogo id={source.id} name={source.name} size={52} />
                  <div className="min-w-0">
                    <p className="text-xs text-soft">{source.kind}</p>
                    <h2 className="mt-1 text-lg font-semibold tracking-tight">{source.name}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-soft">{source.blurb}</p>
                    {line ? <p className="mt-2 text-sm text-ink">{line}</p> : null}
                  </div>
                </div>
                <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", on ? "bg-pine-soft text-pine-deep" : waiting ? "bg-paper-deep text-clay" : "bg-paper-deep text-soft")}>
                  {label}
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
                    {needsPassword ? "Uppdatera lösenord" : "Logga in"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSheet({ id: source.id, intent: "signup" })}>
                    Skapa konto
                  </Button>
                </div>
              )}
              {fee && (on || waiting) ? (
                <FeeDate sourceId={source.id} value={link?.feeDueAt} focus={params.get("fee") === "1" && params.get("source") === source.id} />
              ) : null}
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

function FeeDate({ sourceId, value, focus }: { sourceId: string; value?: string | null; focus: boolean }) {
  const [date, setDate] = useState(value ? value.slice(0, 10) : "");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDate(value ? value.slice(0, 10) : "");
  }, [value]);

  async function save() {
    setMessage("");
    if (!cloudReady()) {
      setMessage("Logga in för att spara datumet.");
      return;
    }
    try {
      await putJson(`/connections/${sourceId}/fee-due`, { date });
      setMessage("Sparat. Vi påminner dig.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Kunde inte spara.");
    }
  }

  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="text-sm text-soft">
        Köavgift förfaller
        <input
          type="date"
          value={date}
          autoFocus={focus}
          onChange={(event) => setDate(event.target.value)}
          className="mt-1 block rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink"
        />
      </label>
      <Button size="sm" type="submit">
        Spara
      </Button>
      {message ? <p className="text-sm text-soft">{message}</p> : null}
    </form>
  );
}
