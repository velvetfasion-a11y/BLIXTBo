"use client";

import { useState } from "react";
import { IconCheck } from "@/components/icons";
import { Button, PrivacyNote, Sheet, cx } from "@/components/ui";
import { kr, parseMoney } from "@/lib/format";
import { assess } from "@/lib/profile";
import { useStore } from "@/lib/store";
import type { Listing } from "@/lib/types";

const DOC_LABEL = {
  contract: "Anställningsavtal",
  payslips: "Lönespecifikationer",
  personbevis: "Personbevis",
} as const;

export function ConnectSheet({
  sourceId,
  open,
  intent,
  listing = null,
  onClose,
}: {
  sourceId: string | null;
  open: boolean;
  intent: "login" | "signup";
  listing?: Listing | null;
  onClose: () => void;
}) {
  const store = useStore();
  const source = store.sources.find((item) => item.id === sourceId);
  const user = store.user;
  const [mode, setMode] = useState<"create" | "existing">(intent === "login" ? "existing" : "create");
  const [step, setStep] = useState<"review" | "approve" | "done">("review");
  const [phase, setPhase] = useState<"idle" | "wait" | "done">("idle");
  const [editing, setEditing] = useState<"details" | "documents" | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.profile.phone ?? "");
  const [income, setIncome] = useState(user?.profile.monthlyIncome ? String(user.profile.monthlyIncome) : "");

  function saveDetails() {
    store.updateAccount({
      name,
      email,
      phone,
      monthlyIncome: parseMoney(income),
    });
    setEditing(null);
  }

  function approve() {
    if (!sourceId || phase !== "idle") return;
    store.dismissToast();
    setPhase("wait");
    window.setTimeout(() => {
      store.connect(sourceId, email.trim() || user?.email || "", { quiet: true });
      let nextPosition: number | null = null;
      if (listing) {
        const result = store.apply(listing.id, { quiet: true });
        if (result.status === "applied") nextPosition = result.position;
      }
      setPosition(nextPosition);
      setPhase("done");
      setStep("done");
    }, 1300);
  }

  if (!source) return null;

  const docs = user?.profile.documents;
  const sharedDocs = (["contract", "payslips", "personbevis"] as const).map((key) => ({
    key,
    label: DOC_LABEL[key],
    file: docs?.[key]?.name ?? null,
  }));

  const headline =
    mode === "create"
      ? `Du har inget konto hos ${source.name} – vi skapar ett åt dig`
      : `Logga in en gång hos ${source.name}`;

  const success =
    mode === "create"
      ? listing
        ? `Konto skapat hos ${source.name} – ansökan skickad`
        : `Konto skapat hos ${source.name}`
      : listing
        ? `${source.name} är kopplat – ansökan skickad`
        : `${source.name} är kopplat`;

  return (
    <Sheet open={open} title={headline} onClose={onClose}>
      <Steps current={step === "review" ? 0 : step === "approve" ? 1 : 2} />
      {step === "review" ? (
        <div className="mt-5 space-y-4">
          <h2 className="font-serif text-[1.7rem] leading-tight tracking-[-0.03em]">{headline}</h2>
          {mode === "create" ? (
            <ol className="space-y-2 text-sm leading-relaxed text-soft">
              <li>1. Ett konto skapas hos {source.name} med uppgifterna nedan.</li>
              <li>2. {listing ? `Ansökan till ${listing.address} skickas i samma stund.` : "Du kan sedan svara ja utan att logga in igen."}</li>
              <li>3. Nästa bostad hos {source.name} kräver ingen ny inloggning.</li>
            </ol>
          ) : (
            <p className="text-sm leading-relaxed text-soft">
              Du har redan konto. Ett godkännande räcker. Blixtbo kan därefter skicka ansökningar och läsa status åt dig. Inget nytt konto skapas.
            </p>
          )}

          {mode === "create" ? (
            <section className="rounded-2xl border border-line bg-card">
              <div className="flex items-center justify-between px-4 pt-3">
                <h3 className="text-sm font-medium">Det här delas</h3>
                <button type="button" className="text-sm text-pine" onClick={() => setEditing(editing === "details" ? null : "details")}>
                  {editing === "details" ? "Stäng" : "Ändra"}
                </button>
              </div>
              {editing === "details" ? (
                <div className="space-y-3 px-4 py-3">
                  <MiniField label="Namn" value={name} onChange={setName} />
                  <MiniField label="E-post" value={email} onChange={setEmail} />
                  <MiniField label="Telefon" value={phone} onChange={setPhone} placeholder="070-000 00 00" />
                  <MiniField label="Månadsinkomst före skatt" value={income} onChange={setIncome} inputMode="numeric" />
                  <Button size="sm" onClick={saveDetails}>Spara</Button>
                </div>
              ) : (
                <dl className="divide-y divide-line px-4 text-sm">
                  <Row label="Namn" value={name || "Saknas"} />
                  <Row label="E-post" value={email || "Saknas"} />
                  <Row label="Telefon" value={phone || "Saknas"} />
                  <Row label="Inkomst" value={parseMoney(income) ? `${kr(parseMoney(income) ?? 0)}/mån` : "Saknas"} />
                </dl>
              )}
              <div className="border-t border-line px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Dokument</p>
                  <button type="button" className="text-sm text-pine" onClick={() => setEditing(editing === "documents" ? null : "documents")}>
                    {editing === "documents" ? "Stäng" : "Ändra"}
                  </button>
                </div>
                <ul className="mt-2 space-y-2">
                  {sharedDocs.map((doc) => (
                    <li key={doc.key} className="flex items-center justify-between gap-3 text-sm">
                      <span>{doc.label}</span>
                      <span className={doc.file ? "truncate text-soft" : "text-clay"}>{doc.file ?? "Saknas"}</span>
                    </li>
                  ))}
                </ul>
                {editing === "documents" ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm leading-relaxed text-soft">Ett foto eller en PDF ersätter det som följer med till {source.name}.</p>
                    {sharedDocs.map((doc) => (
                      <label key={doc.key} className="flex cursor-pointer items-center justify-between rounded-xl bg-paper px-3 py-2 text-sm">
                        <span>Byt {doc.label.toLowerCase()}</span>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            store.setDocument(doc.key, { name: file.name, addedAt: new Date().toISOString() });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          ) : (
            <MiniField label={`E-post hos ${source.name}`} value={email} onChange={setEmail} />
          )}

          {listing ? <MatchNote listing={listing} /> : null}
          <button
            type="button"
            className="w-full text-center text-sm text-soft"
            onClick={() => setMode(mode === "create" ? "existing" : "create")}
          >
            {mode === "create" ? "Jag har redan konto" : "Jag har inget konto – skapa ett"}
          </button>
          <PrivacyNote />
          <Button size="lg" className="w-full" onClick={() => setStep("approve")}>
            Logga in en gång
          </Button>
        </div>
      ) : null}

      {step === "approve" ? (
        <div className="mt-5 space-y-4">
          <h2 className="font-serif text-[1.7rem] leading-tight tracking-[-0.03em]">Bekräfta en gång</h2>
          <p className="text-sm leading-relaxed text-soft">
            {mode === "create"
              ? `Ett godkännande i appen räcker. Då skapar Blixtbo kontot hos ${source.name} och kan ansöka åt dig utan att du loggar in igen.`
              : `Ett godkännande i appen räcker. Då kopplas ditt konto hos ${source.name}, och nästa ansökan går utan en ny inloggning.`}
          </p>
          <div className="rounded-3xl border border-line bg-card px-5 py-6">
            <p className="text-xs font-medium tracking-wide text-soft">{user?.method === "apple" ? "APPLE" : user?.method === "email" ? "ENGÅNGSKOD" : "GOOGLE"}</p>
            <p className="mt-3 text-lg font-semibold">
              {phase === "done" ? "Godkänt" : phase === "wait" ? "Väntar på bekräftelse…" : user?.method === "email" ? "Bekräfta med e-postkod" : user?.method === "apple" ? "Bekräfta med Apple" : "Bekräfta med Google"}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-soft">
              {name ? `${name} ger Blixtbo lov att hantera ${source.name}.` : `Ge Blixtbo lov att hantera ${source.name}.`} Lösenordet skapas på din enhet. Vi ser det inte.
            </p>
            <Button size="lg" className="mt-5 w-full" disabled={phase !== "idle"} onClick={approve}>
              {phase === "idle" ? "Bekräfta en gång" : phase === "wait" ? "Väntar…" : "Godkänt"}
            </Button>
          </div>
          {source.requiresBankId ? (
            <p className="rounded-2xl bg-clay-soft px-4 py-3 text-sm leading-relaxed text-clay">
              {source.name} ber om BankID i ett eget steg. Det godkänner du själv på mobilen. Blixtbo ser inte den legitimeringen och kan inte göra den åt dig.
            </p>
          ) : null}
          <PrivacyNote />
          <button type="button" className="text-sm text-soft" onClick={() => setStep("review")}>
            Tillbaka
          </button>
        </div>
      ) : null}

      {step === "done" ? (
        <div className="mt-6 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-pine-soft text-pine">
            <IconCheck className="h-7 w-7" />
          </div>
          <h2 className="mt-5 font-serif text-[1.7rem] leading-tight tracking-[-0.03em]">{success}</h2>
          <p className="mt-3 text-sm leading-relaxed text-soft">
            {position === 1
              ? "Du var först på den här bostaden."
              : position
                ? `Du var nummer ${position} att ansöka.`
                : `Nästa ja hos ${source.name} går utan en ny inloggning.`}
            {" "}Du kan koppla bort {source.name} när som helst under Hyresvärdar.
          </p>
          <Button size="lg" className="mt-6 w-full" onClick={onClose}>
            Fortsätt
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}

function MatchNote({ listing }: { listing: Listing }) {
  const store = useStore();
  const result = assess(listing, store.user?.profile ?? null);
  if (result.ready) return null;
  return (
    <p className="text-sm leading-relaxed text-clay">
      {result.lines.filter((line) => line.tone !== "ok").map((line) => line.text).join(" ")} Ansökan kan skickas ändå.
    </p>
  );
}

function Steps({ current }: { current: 0 | 1 | 2 }) {
  const labels = ["Granska", "Godkänn", "Klart"];
  return (
    <ol className="flex items-center gap-2">
      {labels.map((label, index) => (
        <li key={label} className="flex items-center gap-2">
          <span className={cx("grid h-6 w-6 place-items-center rounded-full text-xs", index <= current ? "bg-ink text-paper" : "bg-paper-deep text-faint")}>
            {index + 1}
          </span>
          <span className={cx("text-xs", index === current ? "font-medium" : "text-faint")}>{label}</span>
          {index < labels.length - 1 ? <span className="mx-1 h-px w-3 bg-line sm:w-5" /> : null}
        </li>
      ))}
    </ol>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="text-soft">{label}</dt>
      <dd className="truncate text-right">{value}</dd>
    </div>
  );
}

function MiniField({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "numeric" | "text";
}) {
  return (
    <label className="block text-sm">
      <span className="text-soft">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-11 w-full rounded-2xl border border-line bg-card px-3 outline-none focus:border-ink"
      />
    </label>
  );
}
