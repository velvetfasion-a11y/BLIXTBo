"use client";

import { useEffect, useState } from "react";

type Stats = {
  source: "umami" | "event-log" | "unavailable";
  umami: boolean;
  visitorsPerDay: { day: string; count: number }[] | null;
  registrationsPerDay: { day: string; count: number }[];
  payingCustomers: { active: number; trialing: number } | null;
  revenue: { day: string; amountOre: number; currency: string }[] | null;
  events: { name: string; props: Record<string, string>; at: string }[];
};

const EMPTY: Stats = {
  source: "unavailable",
  umami: false,
  visitorsPerDay: null,
  registrationsPerDay: [],
  payingCustomers: null,
  revenue: null,
  events: [],
};

function Bars({ points }: { points: { day: string; count: number }[] }) {
  const max = Math.max(1, ...points.map((item) => item.count));
  return (
    <div className="mt-4 flex h-36 items-end gap-2">
      {points.map((item) => (
        <div key={item.day} className="flex h-full flex-1 flex-col justify-end gap-2">
          <div className="flex h-28 items-end">
            <div className="w-full rounded-t-lg bg-pine" style={{ height: `${Math.max(8, (item.count / max) * 100)}%` }} />
          </div>
          <span className="text-center text-[10px] text-faint">{item.day.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

export function Statistik() {
  const [stats, setStats] = useState<Stats>(EMPTY);

  useEffect(() => {
    void fetch("/api/stats")
      .then((response) => response.json())
      .then((data: Stats) => setStats(data))
      .catch(() => setStats(EMPTY));
  }, []);

  const revenueKr = stats.revenue?.reduce((sum, item) => sum + item.amountOre, 0) ?? null;
  const paying = stats.payingCustomers ? stats.payingCustomers.active + stats.payingCustomers.trialing : null;

  return (
    <section className="mt-6 rounded-3xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Statistik</h2>
        <p className="text-xs text-pine-deep">Riktig data. Inga exempeltal.</p>
      </div>
      <p className="mt-1 text-xs text-faint">
        {stats.umami ? "Besökare kommer från Umami på vår egen domän." : "Umami är inte konfigurerat. Besökssiffror visas inte. Tabellen är vår egen händelselogg."}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Betalande" value={paying == null ? "–" : String(paying)} detail={stats.payingCustomers ? `${stats.payingCustomers.active} aktiva · ${stats.payingCustomers.trialing} i provperiod` : "Stripe-testnyckel saknas"} />
        <Metric label="Intäkt" value={revenueKr == null ? "–" : `${(revenueKr / 100).toLocaleString("sv-SE")} kr`} detail="Betalda fakturor i testläge, SEK" />
        <Metric label="Registreringar" value={String(stats.registrationsPerDay.reduce((sum, item) => sum + item.count, 0))} detail="Egna signup-händelser" />
      </div>
      <h3 className="mt-6 text-sm font-medium">Besökare per dag</h3>
      {stats.visitorsPerDay && stats.visitorsPerDay.length > 0 ? <Bars points={stats.visitorsPerDay} /> : <p className="mt-2 text-sm text-soft">Ingen Umami-serie. Ingen påhittad stapel.</p>}
      <h3 className="mt-6 text-sm font-medium">Registreringar per dag</h3>
      {stats.registrationsPerDay.length > 0 ? <Bars points={stats.registrationsPerDay.map((item) => ({ day: item.day, count: item.count }))} /> : <p className="mt-2 text-sm text-soft">Inga registreringar i loggen ännu.</p>}
      <h3 className="mt-6 text-sm font-medium">Händelselogg</h3>
      {stats.events.length === 0 ? <p className="mt-2 text-sm text-soft">Inga händelser ännu.</p> : (
        <ul className="mt-2 divide-y divide-line text-sm">
          {stats.events.slice(0, 12).map((event, index) => (
            <li key={`${event.at}-${index}`} className="flex justify-between gap-3 py-2">
              <span>{event.name}{event.props.direction ? ` · ${event.props.direction}` : ""}{event.props.sourceId ? ` · ${event.props.sourceId}` : ""}</span>
              <span className="text-xs text-faint">{event.at.slice(0, 16).replace("T", " ")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl bg-paper px-3 py-3">
      <p className="text-xs text-soft">{label}</p>
      <p className="num mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-faint">{detail}</p>
    </div>
  );
}
