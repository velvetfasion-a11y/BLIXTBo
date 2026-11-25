"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Boot } from "@/components/boot";
import { Button, Choice, Field, Ring, TextArea, Why, cx } from "@/components/ui";
import { parseMoney } from "@/lib/format";
import { DOCUMENTS, EMPLOYMENT, HOUSING, completeness } from "@/lib/profile";
import { useStore } from "@/lib/store";
import type { EmploymentType, HousingType } from "@/lib/types";

const STEPS = ["arbete", "inkomst", "hushall", "boende", "brev", "dokument", "klar"] as const;
type Step = (typeof STEPS)[number];

const STEP_TITLE: Record<Step, string> = {
  arbete: "Vad arbetar du med?",
  inkomst: "Vad tjänar du i månaden?",
  hushall: "Vilka ska bo i lägenheten?",
  boende: "Hur bor du idag?",
  brev: "Ett kort brev om er",
  dokument: "Underlag hyresvärden vill se",
  klar: "Så här redo är profilen",
};

function WizardInner() {
  const store = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("steg");
  const [step, setStep] = useState<Step>(STEPS.includes(requested as Step) ? (requested as Step) : "arbete");
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Profil · Blixtbo";
  }, []);

  useEffect(() => {
    if (store.ready && !store.user) router.replace("/");
  }, [store.ready, store.user, router]);

  if (!store.ready || !store.user) return <Boot />;

  const profile = store.user.profile;
  const score = completeness(profile);
  const index = STEPS.indexOf(step);

  function go(next: Step) {
    setError("");
    setStep(next);
  }

  function back() {
    if (index === 0) {
      router.push("/profil");
      return;
    }
    go(STEPS[index - 1]);
  }

  function next() {
    if (step === "arbete") {
      if (profile.occupation.trim().length < 2 || profile.employer.trim().length < 2 || !profile.employmentType) {
        setError("Fyll i yrke, arbetsgivare och anställningsform.");
        return;
      }
    }
    if (step === "inkomst" && !(profile.monthlyIncome && profile.monthlyIncome > 0)) {
      setError("Ange månadsinkomst före skatt.");
      return;
    }
    if (step === "hushall" && profile.adults < 1) {
      setError("Minst en vuxen behöver ingå.");
      return;
    }
    if (step === "boende" && !profile.housingType) {
      setError("Välj hur du bor idag.");
      return;
    }
    if (step === "brev" && profile.letter.trim().length < 40) {
      setError("Skriv minst ett par meningar. 80 tecken fyller mätaren.");
      return;
    }
    go(STEPS[index + 1]);
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      <header className="border-b border-line px-5 py-4">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-soft">
              Profil · steg {Math.min(index + 1, 6)} av 6
            </p>
            <p className="mt-1 text-sm">Komplett till {score.score}%</p>
          </div>
          <Ring value={score.score} size={64} />
        </div>
        <div className="mx-auto mt-3 h-1 max-w-lg overflow-hidden rounded-full bg-paper-deep">
          <div className="h-full rounded-full bg-pine transition-all" style={{ width: `${score.score}%` }} />
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="enter mx-auto max-w-lg">
          <h1 className="font-serif text-4xl tracking-[-0.03em]">{STEP_TITLE[step]}</h1>
          <div className="mt-6 space-y-4">
            {step === "arbete" ? (
              <>
                <Field
                  label="Yrke"
                  value={profile.occupation}
                  onChange={(event) => store.updateProfile({ occupation: event.target.value })}
                  placeholder="Produktdesigner"
                />
                <Field
                  label="Arbetsgivare"
                  value={profile.employer}
                  onChange={(event) => store.updateProfile({ employer: event.target.value })}
                  placeholder="Studio Nord"
                />
                <div className="grid gap-2">
                  {EMPLOYMENT.map((item) => (
                    <Choice
                      key={item.id}
                      selected={profile.employmentType === item.id}
                      title={item.title}
                      text={item.text}
                      onClick={() => store.updateProfile({ employmentType: item.id as EmploymentType })}
                    />
                  ))}
                </div>
                <Why>Hyresvärden vill se att inkomsten är stabil. Titel, arbetsgivare och anställningsform är det första de läser.</Why>
              </>
            ) : null}
            {step === "inkomst" ? (
              <>
                <Field
                  label="Månadsinkomst före skatt"
                  inputMode="numeric"
                  value={profile.monthlyIncome ? new Intl.NumberFormat("sv-SE").format(profile.monthlyIncome) : ""}
                  onChange={(event) => store.updateProfile({ monthlyIncome: parseMoney(event.target.value) })}
                  placeholder="48 500"
                  hint="Bruttolön, innan skatt. Räkna inte med bostadsbidrag om det inte är stadigvarande."
                />
                <Why>
                  En vanlig tumregel är att hyran får vara högst en tredjedel av bruttoinkomsten. Blixtbo jämför varje annons mot beloppet du anger här.
                </Why>
              </>
            ) : null}
            {step === "hushall" ? (
              <>
                <Counter
                  label="Vuxna"
                  value={profile.adults}
                  min={1}
                  max={8}
                  onChange={(adults) => store.updateProfile({ adults })}
                />
                <Counter
                  label="Barn"
                  value={profile.children}
                  min={0}
                  max={8}
                  onChange={(children) => store.updateProfile({ children })}
                />
                <Why>Antalet personer styr både hur stor lägenhet som är rimlig och om personbevis krävs.</Why>
              </>
            ) : null}
            {step === "boende" ? (
              <>
                <div className="grid gap-2">
                  {HOUSING.map((item) => (
                    <Choice
                      key={item.id}
                      selected={profile.housingType === item.id}
                      title={item.title}
                      text={item.text}
                      onClick={() => store.updateProfile({ housingType: item.id as HousingType })}
                    />
                  ))}
                </div>
                <Field
                  label="Ort idag"
                  value={profile.currentCity}
                  onChange={(event) => store.updateProfile({ currentCity: event.target.value })}
                  placeholder="Stockholm"
                  hint="Används så att påminnelser och köer hamnar i rätt stad."
                />
                <Why>Nuvarande boende visar att situationen är ordnad och när du kan flytta.</Why>
              </>
            ) : null}
            {step === "brev" ? (
              <>
                <TextArea
                  label="Personligt brev"
                  value={profile.letter}
                  onChange={(event) => store.updateProfile({ letter: event.target.value })}
                  placeholder="Vilka ni är, vad ni arbetar med och hur ni vill bo. Tre meningar räcker."
                  hint={`${profile.letter.trim().length} tecken. 80 tecken fyller den här delen av mätaren.`}
                />
                <Why>Ett konkret brev väger tyngre än ett långt. Skriv vilka ni är, inte en allmän önskan om en fin lägenhet.</Why>
              </>
            ) : null}
            {step === "dokument" ? (
              <>
                {DOCUMENTS.map((doc) => {
                  const file = profile.documents[doc.key];
                  return (
                    <div key={doc.key} className="rounded-2xl border border-line bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{doc.title}</p>
                          <p className="mt-1 text-sm leading-relaxed text-soft">{doc.why}</p>
                        </div>
                        <span className={cx("shrink-0 rounded-full px-2 py-1 text-xs", file ? "bg-pine-soft text-pine-deep" : "bg-paper-deep text-soft")}>
                          {file ? "Tillagt" : "Saknas"}
                        </span>
                      </div>
                      {file ? (
                        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                          <p className="truncate text-soft">{file.name}</p>
                          <button type="button" className="text-clay" onClick={() => store.setDocument(doc.key, null)}>
                            Ta bort
                          </button>
                        </div>
                      ) : (
                        <label className="mt-3 inline-flex cursor-pointer">
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            className="sr-only"
                            onChange={(event) => {
                              const picked = event.target.files?.[0];
                              if (!picked) return;
                              store.setDocument(doc.key, { name: picked.name, addedAt: new Date().toISOString() });
                            }}
                          />
                          <span className="rounded-full bg-ink px-3 py-2 text-sm text-paper">Ladda upp</span>
                        </label>
                      )}
                    </div>
                  );
                })}
                <Why>Utan avtal och tre lönespecifikationer stannar de flesta ansökningar. Personbevis behövs när fler än du själv ska stå på kontraktet.</Why>
              </>
            ) : null}
            {step === "klar" ? (
              <>
                <p className="text-sm leading-relaxed text-soft">
                  {score.score === 100
                    ? "Allt hyresvärdar brukar be om finns på plats. Ansökningar kan gå iväg direkt."
                    : "Du kan ansöka ändå. Annonser där något saknas markeras tydligt, så du ser det innan du svarar ja."}
                </p>
                <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
                  {score.missing.length === 0 ? (
                    <li className="px-4 py-3 text-sm">Inget saknas.</li>
                  ) : (
                    score.missing.map((item) => (
                      <li key={item.id} className="flex items-center justify-between px-4 py-3 text-sm">
                        <span>{item.label}</span>
                        <button type="button" className="text-pine" onClick={() => go(item.step as Step)}>
                          Fyll i
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </>
            ) : null}
            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </div>
        </div>
      </div>
      <footer className="border-t border-line bg-paper/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-lg gap-3">
          {step === "klar" ? (
            <Button size="lg" className="flex-1" onClick={() => router.push("/hem")}>
              Till bostäderna
            </Button>
          ) : (
            <>
              <Button size="lg" variant="outline" onClick={back}>
                Tillbaka
              </Button>
              <Button size="lg" className="flex-1" onClick={next}>
                Fortsätt
              </Button>
            </>
          )}
        </div>
        {step !== "klar" ? (
          <button type="button" className="mx-auto mt-3 block text-sm text-soft" onClick={() => router.push("/hem")}>
            Spara och stäng
          </button>
        ) : null}
      </footer>
    </div>
  );
}

function Counter({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-card px-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-paper-deep" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Färre ${label.toLowerCase()}`}>
          −
        </button>
        <span className="num w-6 text-center text-lg">{value}</span>
        <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-ink text-paper" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`Fler ${label.toLowerCase()}`}>
          +
        </button>
      </div>
    </div>
  );
}

export function Wizard() {
  return (
    <Suspense fallback={<Boot />}>
      <WizardInner />
    </Suspense>
  );
}
