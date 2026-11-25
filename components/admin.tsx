"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Boot } from "@/components/boot";
import { Mark } from "@/components/mark";
import { Statistik } from "@/components/statistik";
import { Button, Field, Switch, cx } from "@/components/ui";
import { SEGMENTS, segmentMatches } from "@/lib/data";
import { formatDate, freshness, kr, relative, syncLabel } from "@/lib/format";
import { ALL_AREAS, cityForArea, completeness, queueAlert } from "@/lib/profile";
import { useStore } from "@/lib/store";
import type { Listing } from "@/lib/types";

const NAV = [
  { href: "/admin", label: "Översikt" },
  { href: "/admin/annonser", label: "Annonser" },
  { href: "/admin/kallor", label: "Källor" },
  { href: "/admin/anvandare", label: "Användare" },
  { href: "/admin/utskick", label: "Utskick" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const store = useStore();
  if (!store.ready) return <Boot />;

  return (
    <div className="min-h-dvh bg-paper md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="border-b border-line px-4 py-4 md:border-r md:border-b-0 md:px-4 md:py-6">
        <Link href="/admin" className="flex items-center gap-2 px-2">
          <Mark size={26} />
          <span>
            <span className="block text-sm font-semibold tracking-tight">Blixtbo</span>
            <span className="block text-xs text-soft">Admin</span>
          </span>
        </Link>
        <nav className="mt-4 flex flex-wrap gap-1 md:mt-8 md:flex-col md:flex-nowrap">
          {NAV.map((item) => {
            const active = item.href === "/admin" ? path === "/admin" : path.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "shrink-0 rounded-full px-3 py-2 text-sm md:rounded-2xl",
                  active ? "bg-ink text-paper" : "text-soft hover:bg-card",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/hem" className="mt-4 hidden px-3 text-sm text-soft md:inline-block">
          Till appen
        </Link>
      </aside>
      <div className="px-4 py-6 md:px-8 md:py-8">{children}</div>
    </div>
  );
}

export function AdminHome() {
  const store = useStore();
  useEffect(() => {
    document.title = "Översikt · Blixtbo admin";
  }, []);

  const complete = store.directory.filter((person) => person.completeness >= 100).length;
  const applications = store.directory.reduce((sum, person) => sum + person.applications, 0);
  const activeListings = store.listings.filter((listing) => listing.active).length;
  const sourcesOn = store.sources.filter((source) => source.enabled).length;
  const minutes = store.applications.map((item) => item.minutesAfterPublish);
  const median = minutes.length ? [...minutes].sort((a, b) => a - b)[Math.floor(minutes.length / 2)] : null;
  const newest = [...store.listings].sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt)).slice(0, 5);
  const slow = store.sources.filter((source) => source.health === "delayed" || !source.enabled);
  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm text-soft">De fyra korten är exempeldata. Statistik är riktig data från servern.</p>
      <h1 className="mt-1 font-serif text-4xl tracking-[-0.03em]">Översikt</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Hushåll i registret" value={String(store.directory.length)} detail={`${complete} med komplett profil`} />
        <Stat label="Ansökningar i registret" value={String(applications)} detail={median == null ? "Ingen session ännu" : `Median ${median} min till ansökan i sessionen`} />
        <Stat label="Aktiva annonser" value={String(activeListings)} detail={`${store.listings.length - activeListings} dolda`} />
        <Stat label="Källor igång" value={`${sourcesOn}/${store.sources.length}`} detail={slow.length ? `${slow.length} behöver tillsyn` : "Alla synkar"} />
      </div>
      <Statistik />
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-line bg-card p-5">
          <h2 className="text-sm font-medium">Senaste annonser</h2>
          <ul className="mt-3 divide-y divide-line">
            {newest.map((listing) => (
              <li key={listing.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>
                  <span className="block font-medium">{listing.address}</span>
                  <span className="text-soft">{listing.area} · {kr(listing.rent)}</span>
                </span>
                <span className="text-xs text-faint">{freshness(listing.publishedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-3xl border border-line bg-card p-5">
          <h2 className="text-sm font-medium">Källor som släpar</h2>
          {slow.length === 0 ? <p className="mt-3 text-sm text-soft">Alla källor är i tid.</p> : null}
          <ul className="mt-3 space-y-3">
            {slow.map((source) => (
              <li key={source.id} className="text-sm">
                <p className="font-medium">{source.name}</p>
                <p className="text-soft">{source.enabled ? syncLabel(source.syncMin) : "Pausad"} · {source.health === "delayed" ? "fördröjd" : "ok"}</p>
              </li>
            ))}
          </ul>
          <h2 className="mt-6 text-sm font-medium">Senaste utskick</h2>
          {store.pushes[0] ? (
            <p className="mt-2 text-sm text-soft">
              {store.pushes[0].title} · {store.pushes[0].recipients} mottagare · {relative(store.pushes[0].sentAt)}
            </p>
          ) : (
            <p className="mt-2 text-sm text-soft">Inga utskick ännu.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-3xl border border-line bg-card px-4 py-4">
      <p className="text-xs text-soft">{label}</p>
      <p className="num mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-faint">{detail}</p>
    </div>
  );
}

export function AdminListings() {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    document.title = "Annonser · Blixtbo admin";
  }, []);

  const rows = store.listings.filter((listing) => {
    const hay = `${listing.address} ${listing.area} ${listing.city}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-[-0.03em]">Annonser</h1>
          <p className="mt-2 text-sm text-soft">Dolda annonser syns inte i flödet. Nya annonser hamnar överst.</p>
        </div>
        <Button onClick={() => setOpen(true)}>Lägg till annons</Button>
      </div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Sök adress eller område"
        className="mt-5 h-11 w-full rounded-2xl border border-line bg-card px-4 text-sm"
      />
      <div className="mt-4 overflow-hidden rounded-3xl border border-line bg-card">
        <div className="hidden grid-cols-[1.4fr_0.8fr_0.6fr_0.7fr_0.5fr] gap-3 border-b border-line px-4 py-3 text-xs text-soft md:grid">
          <span>Bostad</span>
          <span>Källa</span>
          <span>Hyra</span>
          <span>Status</span>
          <span />
        </div>
        <ul className="divide-y divide-line">
          {rows.map((listing) => {
            const source = store.sources.find((item) => item.id === listing.sourceId);
            return (
              <li key={listing.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1.4fr_0.8fr_0.6fr_0.7fr_0.5fr] md:items-center">
                <div>
                  <p className="text-sm font-medium">{listing.address}</p>
                  <p className="text-xs text-soft">{listing.area}, {listing.city} · {listing.rooms} rok · {listing.sqm} m²</p>
                </div>
                <p className="text-sm text-soft">{source?.name}</p>
                <p className="num text-sm">{kr(listing.rent)}</p>
                <p className="text-sm">{listing.active ? "Synlig" : "Dold"}</p>
                <div className="md:justify-self-end">
                  <Switch on={listing.active} label={`Visa ${listing.address}`} onClick={() => store.toggleListing(listing.id)} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {open ? <ListingForm onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function ListingForm({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [address, setAddress] = useState("");
  const [area, setArea] = useState(ALL_AREAS[0].area);
  const [rent, setRent] = useState("12500");
  const [sqm, setSqm] = useState("52");
  const [rooms, setRooms] = useState("2");
  const [floor, setFloor] = useState("3");
  const [sourceId, setSourceId] = useState(store.sources[0]?.id ?? "homeq");
  const [error, setError] = useState("");

  function save() {
    if (address.trim().length < 3) {
      setError("Skriv en adress.");
      return;
    }
    const now = new Date().toISOString();
    const listing: Listing = {
      id: `custom-${Date.now()}`,
      address: address.trim(),
      area,
      city: cityForArea(area),
      rent: Number(rent) || 0,
      sqm: Number(sqm) || 0,
      rooms: Number(rooms) || 1,
      floor: Number(floor) || 1,
      floors: Math.max(Number(floor) || 1, 5),
      moveIn: new Date().toISOString().slice(0, 10),
      ageMinutes: 0,
      deadlineHours: null,
      publishedAt: now,
      deadlineAt: null,
      sourceId,
      photos: ["/photos/03.jpg", "/photos/01.jpg"],
      title: "Ny annons",
      description: "Tillagd från admin. Först till kvarn bland de som matchar filtren.",
      near: area,
      features: ["Hiss"],
      requires: ["contract", "payslips", "letter"],
      incomeMultiple: 3,
      active: true,
    };
    store.addListing(listing);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-[#1c1916]/40 sm:place-items-center">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-paper p-5 sm:max-w-md sm:rounded-3xl">
        <h2 className="font-serif text-3xl tracking-[-0.03em]">Ny annons</h2>
        <div className="mt-4 space-y-4">
          <Field label="Adress" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Bondegatan 12" />
          <label className="block text-sm font-medium">
            Område
            <select value={area} onChange={(event) => setArea(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-line bg-card px-3">
              {ALL_AREAS.map((item) => (
                <option key={item.area} value={item.area}>{item.area}, {item.city}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Hyra" inputMode="numeric" value={rent} onChange={(event) => setRent(event.target.value)} />
            <Field label="m²" inputMode="numeric" value={sqm} onChange={(event) => setSqm(event.target.value)} />
            <Field label="Rum" inputMode="numeric" value={rooms} onChange={(event) => setRooms(event.target.value)} />
          </div>
          <Field label="Våning" inputMode="numeric" value={floor} onChange={(event) => setFloor(event.target.value)} />
          <label className="block text-sm font-medium">
            Källa
            <select value={sourceId} onChange={(event) => setSourceId(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-line bg-card px-3">
              {store.sources.map((source) => (
                <option key={source.id} value={source.id}>{source.name}</option>
              ))}
            </select>
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Avbryt</Button>
            <Button className="flex-1" onClick={save}>Publicera</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminSources() {
  const store = useStore();
  useEffect(() => {
    document.title = "Källor · Blixtbo admin";
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-serif text-4xl tracking-[-0.03em]">Källor</h1>
      <p className="mt-2 text-sm text-soft">En pausad källa slutar mata flödet. Användarnas kopplingar finns kvar.</p>
      <ul className="mt-5 space-y-3">
        {store.sources.map((source) => {
          const count = store.listings.filter((listing) => listing.sourceId === source.id && listing.active).length;
          return (
            <li key={source.id} className="rounded-3xl border border-line bg-card px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{source.name}</p>
                  <p className="mt-1 text-sm text-soft">
                    {source.kind} · {count} synliga · {syncLabel(source.syncMin)}
                    {source.health === "delayed" ? " · fördröjd" : ""}
                  </p>
                </div>
                <Switch on={source.enabled} label={`Aktivera ${source.name}`} onClick={() => store.toggleSource(source.id)} />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <LimitField
                  label="Max aktiva ansökningar"
                  value={source.applicationLimit}
                  onChange={(value) => store.setSourceLimit(source.id, { applicationLimit: value })}
                />
                <LimitField
                  label="Max med plus"
                  value={source.plusLimit}
                  onChange={(value) => store.setSourceLimit(source.id, { plusLimit: value })}
                />
                <LimitField
                  label="Pluspris kr/mån"
                  value={source.plusPriceKr}
                  onChange={(value) => store.setSourceLimit(source.id, { plusPriceKr: value })}
                />
                <label className="block text-sm">
                  <span className="text-soft">Länk till hyresvärdens plus</span>
                  <input
                    value={source.plusUrl ?? ""}
                    placeholder="https://"
                    onChange={(event) => store.setSourceLimit(source.id, { plusUrl: event.target.value })}
                    className="mt-1 h-11 w-full rounded-2xl border border-line bg-paper px-3 outline-none focus:border-ink"
                  />
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AdminUsers() {
  const store = useStore();
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    document.title = "Användare · Blixtbo admin";
  }, []);

  const session = store.user;
  const sessionScore = session ? completeness(session.profile).score : null;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-serif text-4xl tracking-[-0.03em]">Användare</h1>
      <p className="mt-2 text-sm text-soft">Registret är exempeldata. Den inloggade sessionen markeras om e-posten matchar.</p>
      <ul className="mt-5 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
        {store.directory.map((person) => {
          const here = session?.email === person.email;
          const open = selected === person.id;
          return (
            <li key={person.id}>
              <button type="button" className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left" onClick={() => setSelected(open ? null : person.id)}>
                <span>
                  <span className="block text-sm font-medium">
                    {person.name}
                    {here ? <span className="ml-2 text-xs font-normal text-pine">den här sessionen</span> : null}
                  </span>
                  <span className="mt-1 block text-xs text-soft">{person.city} · {person.email}</span>
                </span>
                <span className="num text-right text-sm">
                  {here && sessionScore != null ? sessionScore : person.completeness}%
                  <span className="mt-1 block text-xs font-normal text-faint">profil</span>
                </span>
              </button>
              {open ? (
                <div className="grid gap-2 px-4 pb-4 text-sm sm:grid-cols-3">
                  <Mini label="Ansökningar" value={String(here ? store.applications.length : person.applications)} />
                  <Mini label="Köer" value={String(here ? store.queues.length : person.queues)} />
                  <Mini label="Saknas" value={person.missing} />
                  <Mini label="Medlem sedan" value={formatDate(person.joined)} />
                  <Mini label="Kovarning" value={person.queueWarning ? "Ja" : "Nej"} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LimitField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-soft">{label}</span>
      <input
        inputMode="numeric"
        value={value ?? ""}
        placeholder="Ingen gräns"
        onChange={(event) => {
          const trimmed = event.target.value.trim();
          if (!trimmed) {
            onChange(null);
            return;
          }
          const parsed = Number(trimmed);
          if (Number.isInteger(parsed) && parsed > 0) onChange(parsed);
        }}
        className="mt-1 h-11 w-full rounded-2xl border border-line bg-paper px-3 outline-none focus:border-ink"
      />
    </label>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-paper px-3 py-2">
      <p className="text-xs text-soft">{label}</p>
      <p className="mt-1">{value}</p>
    </div>
  );
}

export function AdminCompose() {
  const store = useStore();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [segment, setSegment] = useState("alla");
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Utskick · Blixtbo admin";
  }, []);

  const recipients = useMemo(() => {
    const base = store.directory.filter((person) => segmentMatches(segment, person)).length;
    if (!store.user) return base;
    const listed = store.directory.some((person) => person.email === store.user?.email);
    if (listed) return base;
    const matches = segmentMatches(segment, {
      city: store.user.profile.currentCity,
      completeness: completeness(store.user.profile).score,
      queueWarning: store.queues.some((queue) => queueAlert(queue)),
      applications: store.applications.length,
    });
    return base + (matches ? 1 : 0);
  }, [segment, store.directory, store.queues, store.user, store.applications.length]);

  function send() {
    if (title.trim().length < 3 || body.trim().length < 3) {
      setError("Skriv både rubrik och text.");
      return;
    }
    store.sendPush({ title, body, segment });
    setTitle("");
    setBody("");
    setError("");
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <h1 className="font-serif text-4xl tracking-[-0.03em]">Utskick</h1>
        <p className="mt-2 text-sm leading-relaxed text-soft">
          Skickas som notis i appen. Om den inloggade personen ingår i segmentet dyker meddelandet upp under Notiser.
        </p>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium">
            Målgrupp
            <select value={segment} onChange={(event) => setSegment(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-line bg-card px-3">
              {SEGMENTS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <p className="text-sm text-soft">{recipients} {recipients === 1 ? "mottagare" : "mottagare"} i exemplet.</p>
          <Field label="Rubrik" value={title} maxLength={48} onChange={(event) => setTitle(event.target.value)} placeholder="Ny tvåa på Södermalm" />
          <label className="block text-sm font-medium">
            Text
            <textarea
              value={body}
              maxLength={140}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Blekingegatan 42, 12 450 kr. Du uppfyller inkomstkravet."
              className="mt-2 min-h-28 w-full rounded-2xl border border-line bg-card px-4 py-3 text-base outline-none focus:border-ink"
            />
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button onClick={send}>Skicka notis</Button>
        </div>
        <h2 className="mt-10 text-sm font-medium">Skickade</h2>
        {store.pushes.length === 0 ? <p className="mt-2 text-sm text-soft">Inga utskick ännu.</p> : null}
        <ul className="mt-3 space-y-3">
          {store.pushes.map((push) => (
            <li key={push.id} className="rounded-2xl border border-line bg-card px-4 py-3">
              <p className="text-sm font-medium">{push.title}</p>
              <p className="mt-1 text-sm text-soft">{push.body}</p>
              <p className="mt-2 text-xs text-faint">
                {SEGMENTS.find((item) => item.id === push.segment)?.label ?? push.segment} · {push.recipients} mottagare · {relative(push.sentAt)}
              </p>
            </li>
          ))}
        </ul>
      </div>
      <aside>
        <p className="text-xs font-medium tracking-wide text-faint">FÖRHANDSVISNING</p>
        <div className="mt-3 rounded-[28px] bg-[#e7e1d6] p-4">
          <div className="mt-10 rounded-2xl bg-card p-3 shadow-[0_10px_30px_rgba(48,36,22,0.08)]">
            <div className="flex items-center gap-2">
              <Mark size={18} />
              <span className="text-xs font-medium">Blixtbo</span>
              <span className="ml-auto text-xs text-faint">nu</span>
            </div>
            <p className="mt-2 text-sm font-medium">{title || "Rubrik på notisen"}</p>
            <p className="mt-1 text-sm leading-relaxed text-soft">{body || "Texten användaren ser på låsskärmen."}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
