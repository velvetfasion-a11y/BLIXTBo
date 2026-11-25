"use client";

import { useState } from "react";
import { Button, Field } from "@/components/ui";
import { passesFilters } from "@/lib/profile";
import { useStore } from "@/lib/store";
import type { CustomLandlordKind, Listing } from "@/lib/types";

const KINDS: { id: CustomLandlordKind; label: string }[] = [
  { id: "hyresvard", label: "Hyresvärd" },
  { id: "byggbolag", label: "Byggbolag / nyproduktion" },
  { id: "annat", label: "Annat" },
];

type Candidate = { url: string; title: string; score: number; snippet?: string };

function apiBase() {
  return (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
}

export function CustomLandlords() {
  const store = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [country, setCountry] = useState("Sverige");
  const [city, setCity] = useState("");
  const [kind, setKind] = useState<CustomLandlordKind>("hyresvard");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  function reset() {
    setEditing(null);
    setName("");
    setWebsiteUrl("");
    setCountry("Sverige");
    setCity("");
    setKind("hyresvard");
    setError("");
    setPendingId(null);
    setCandidates([]);
  }

  function edit(id: string) {
    const item = store.customLandlords.find((landlord) => landlord.id === id);
    if (!item) return;
    setEditing(id);
    setName(item.name);
    setWebsiteUrl(item.websiteUrl);
    setCountry(item.country);
    setCity(item.city);
    setKind(item.kind);
    setCandidates([]);
    setPendingId(null);
  }

  async function submit() {
    if (name.trim().length < 2) {
      setError("Skriv namnet på hyresvärden.");
      return;
    }
    setError("");
    setBusy(true);
    const id = store.saveCustomLandlord({ id: editing ?? undefined, name, websiteUrl, country, city, kind });
    try {
      const response = await fetch(`${apiBase()}/custom-landlords/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, websiteUrl, country, city, kind }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.detail || "Sökningen gick inte att göra.");
        setBusy(false);
        return;
      }
      setPendingId(id);
      setCandidates(data.candidates || []);
      if (!data.candidates?.length) {
        setError("Ingen sida hittades. Skriv en webbadress så kan vi försöka igen.");
      }
    } catch {
      setError("Servern svarade inte. Hyresvärden är sparad, men sidan är inte bekräftad.");
    }
    setBusy(false);
  }

  async function confirm(candidate: Candidate) {
    if (!pendingId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${apiBase()}/custom-landlords/listings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: candidate.url,
          filters: store.filters,
          profile: store.user?.profile ?? {},
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data.detail === "string" ? data.detail : "Sidan gick inte att läsa.");
        setBusy(false);
        return;
      }
      const landlord = store.customLandlords.find((item) => item.id === pendingId);
      const listings: Listing[] = (data.listings || []).map((item: Record<string, string | number>, index: number) => ({
        id: `${pendingId}-${index}-${String(item.url).slice(-12)}`,
        address: String(item.title || "Bostad").split(",")[0].trim(),
        area: String(item.area || ""),
        city: String(item.city || landlord?.city || ""),
        rent: Number(item.rent) || 0,
        sqm: Number(item.sqm) || 0,
        rooms: Number(item.rooms) || 1,
        floor: Number(item.floor) || 1,
        floors: Math.max(Number(item.floor) || 1, 4),
        moveIn: "",
        ageMinutes: 1,
        deadlineHours: null,
        publishedAt: new Date().toISOString(),
        deadlineAt: null,
        sourceId: pendingId,
        sourceName: landlord?.name,
        photos: ["/photos/03.jpg"],
        title: String(item.title || "Bostad"),
        description: String(item.description || ""),
        near: landlord?.city || "",
        features: landlord?.kind === "byggbolag" ? ["Nyproduktion"] : ["Förstahand"],
        requires: [],
        incomeMultiple: 3,
        active: true,
        manualApply: data.applyMode !== "adapter",
        applyUrl: String(item.url || candidate.url),
        rankScore: Number(item.rankScore) || 0,
      }));
      const visible = listings.filter((item) => passesFilters(item, store.filters, store.sources));
      store.confirmCustomLandlord(pendingId, candidate.url, data.applyMode === "adapter" ? "adapter" : "manual", visible);
      reset();
    } catch {
      setError("Servern svarade inte.");
    }
    setBusy(false);
  }

  return (
    <section className="mt-8">
      <h2 className="font-serif text-3xl tracking-[-0.03em]">Lägg till egen hyresvärd</h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-soft">
        Ett byggbolag, en privat värd eller någon i ett annat land. Bara namnet räcker. Vi letar upp sidan och frågar dig innan den används.
      </p>
      <form
        className="mt-4 space-y-4 rounded-3xl border border-line bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label="Namn" value={name} onChange={(event) => setName(event.target.value)} placeholder="Exempelbyggen" />
        <Field label="Webbplats" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="Valfri, om du redan har adressen" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Land" value={country} onChange={(event) => setCountry(event.target.value)} placeholder="Sverige" />
          <Field label="Ort" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Stockholm" />
        </div>
        <label className="block text-sm font-medium">
          Typ
          <select value={kind} onChange={(event) => setKind(event.target.value as CustomLandlordKind)} className="mt-2 h-12 w-full rounded-2xl border border-line bg-card px-3">
            {KINDS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex gap-2">
          {editing ? (
            <Button type="button" variant="outline" onClick={reset}>Avbryt</Button>
          ) : null}
          <Button type="submit" disabled={busy}>{busy ? "Letar…" : editing ? "Spara" : "Lägg till"}</Button>
        </div>
      </form>
      {candidates.length > 0 ? (
        <div className="mt-4 rounded-3xl border border-line bg-card p-4">
          <h3 className="text-sm font-medium">Stämmer någon av de här?</h3>
          <p className="mt-1 text-sm leading-relaxed text-soft">Sidan används inte förrän du bekräftar den.</p>
          <ul className="mt-3 space-y-2">
            {candidates.map((candidate) => (
              <li key={candidate.url} className="rounded-2xl bg-paper px-3 py-3">
                <p className="text-sm font-medium">{candidate.title || candidate.url}</p>
                <p className="mt-1 truncate text-xs text-soft">{candidate.url}</p>
                <Button size="sm" className="mt-3" disabled={busy} onClick={() => void confirm(candidate)}>
                  Använd den här
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ul className="mt-4 space-y-3">
        {store.customLandlords.map((landlord) => (
          <li key={landlord.id} className="rounded-3xl border border-line bg-card p-4">
            <p className="text-xs text-soft">{KINDS.find((item) => item.id === landlord.kind)?.label}</p>
            <h3 className="mt-1 text-lg font-semibold">{landlord.name}</h3>
            <p className="mt-1 text-sm text-soft">
              {[landlord.city, landlord.country].filter(Boolean).join(", ") || "Ort saknas"}
              {landlord.confirmed ? "" : " · inte bekräftad"}
              {landlord.applyMode === "manual" && landlord.confirmed ? " · ansök själv" : ""}
            </p>
            <div className="mt-3 flex gap-3 text-sm">
              <button type="button" className="text-pine" onClick={() => edit(landlord.id)}>Redigera</button>
              <button type="button" className="text-clay" onClick={() => store.removeCustomLandlord(landlord.id)}>Ta bort</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
