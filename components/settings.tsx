"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconChevron } from "@/components/icons";
import { SupportDesk } from "@/components/support";
import { Button, Field } from "@/components/ui";
import { DELETE_SCOPES, confirmationMatches, needsRecentLogin, type DeleteScope } from "@/lib/account";
import { apiFetch } from "@/lib/api";
import { billingLabel } from "@/lib/billing";
import { reauthenticate, signOutGoogle } from "@/lib/firebase/auth";
import { firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";
import { setCloudSession } from "@/lib/firebase/session";
import { useStore } from "@/lib/store";

function failureMessage(caught: unknown) {
  const code = typeof caught === "object" && caught && "code" in caught ? String((caught as { code?: string }).code ?? "") : "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "Inloggningen avbröts. Inget är raderat.";
  }
  if (code.startsWith("auth/")) return "Det gick inte att bekräfta inloggningen. Inget är raderat.";
  if (caught instanceof Error && caught.message) return caught.message;
  return "Det gick inte att slutföra. Inget mer är ändrat.";
}

const NOTICES = {
  konto: "konto",
  erasure: "uppgifter",
} as const;

export function Settings() {
  const store = useStore();
  const router = useRouter();
  const user = store.user;
  const [choice, setChoice] = useState<DeleteScope | null>(null);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const selected = DELETE_SCOPES.find((item) => item.id === choice) ?? null;
  const confirmed = confirmationMatches(phrase);

  useEffect(() => {
    document.title = "Inställningar · Blixtbo";
  }, []);

  if (!user) return null;

  function methodLabel() {
    if (user?.method === "google") return "Google";
    if (user?.method === "apple") return "Apple";
    return "Engångskod till e-post";
  }

  async function disconnectLocal() {
    for (const [sourceId, connection] of Object.entries(store.connections)) {
      if (connection.status === "connected") store.disconnect(sourceId);
    }
  }

  async function leave(kind: "konto" | "uppgifter" | "exempel") {
    sessionStorage.setItem("blixtbo-notice", kind);
    setCloudSession(null);
    await signOutGoogle().catch(() => undefined);
    store.logout();
    router.replace("/");
  }

  async function requestDelete(scope: DeleteScope, retried: boolean) {
    const { response, detail } = await apiFetch("/account/delete", {
      method: "POST",
      body: JSON.stringify({ scope, confirm: "RADERA" }),
    });
    if (response.status === 401 && needsRecentLogin(detail) && !retried) {
      await reauthenticate();
      await requestDelete(scope, true);
      return;
    }
    if (!response.ok) throw new Error(detail || "Det gick inte att slutföra. Inget mer är ändrat.");
  }

  async function confirm() {
    if (!user || !choice || !confirmed || busy) return;
    setBusy(true);
    setError("");
    const localOnly = user.demo || !firebaseConfigured() || !firebaseAuth().currentUser;
    try {
      if (localOnly) {
        if (!user.demo) {
          setError("Logga in med Google eller Apple för att göra det här mot kontot.");
          return;
        }
        if (choice === "links") {
          await disconnectLocal();
          setDone("Hyresvärdarna är bortkopplade i den här webbläsaren. Exempelkontot har ingen molninloggning.");
          setPhrase("");
          return;
        }
        await leave("exempel");
        return;
      }
      await requestDelete(choice, false);
      if (choice === "links") {
        await disconnectLocal();
        setDone("Klart. Inloggningar hos hyresvärdar är borttagna, och Google och Apple är bortkopplade. Blixtbo-kontot finns kvar.");
        setPhrase("");
        return;
      }
      await leave(choice === "erasure" ? NOTICES.erasure : NOTICES.konto);
    } catch (caught) {
      setError(failureMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-6 md:px-8 md:py-10">
      <Link href="/profil" className="inline-flex items-center gap-1 text-sm text-soft">
        <IconChevron className="h-4 w-4" />
        Profil
      </Link>
      <h1 className="mt-6 font-serif text-4xl tracking-[-0.03em]">Inställningar</h1>
      <p className="mt-3 text-sm leading-relaxed text-soft">
        Här hanterar du kontot. Prenumerationen ligger ett steg in. Radering ligger längst ner och kräver att du skriver ordet RADERA.
      </p>

      <section className="mt-8 rounded-3xl border border-line bg-card px-4 py-4">
        <h2 className="text-sm font-medium">Konto</h2>
        <p className="mt-2 text-base font-medium">{user.name}</p>
        <p className="text-sm text-soft">{user.email}</p>
        <p className="mt-1 text-sm text-soft">{methodLabel()}</p>
      </section>

      <ul className="mt-6 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
        <li>
          <Link href="/installningar/prenumeration" className="flex items-center justify-between gap-4 px-4 py-4">
            <span>
              <span className="block text-sm font-medium">Prenumeration</span>
              <span className="mt-0.5 block text-sm text-soft">{billingLabel(store.billing)}</span>
            </span>
            <span className="text-soft">→</span>
          </Link>
        </li>
        <li>
          <Link href="/hjalp" className="flex items-center justify-between gap-4 px-4 py-4">
            <span>
              <span className="block text-sm font-medium">Hjälp</span>
              <span className="mt-0.5 block text-sm text-soft">Så fungerar Blixtbo, betalning och uppgifter</span>
            </span>
            <span className="text-soft">→</span>
          </Link>
        </li>
      </ul>

      <SupportDesk />

      <section className="mt-10">
        <h2 className="font-serif text-2xl tracking-[-0.03em]">Radera eller koppla bort</h2>
        <p className="mt-2 text-sm leading-relaxed text-soft">
          Välj ett alternativ. Läs vad som tas bort och vad som lämnas kvar innan du bekräftar. Det går inte att ångra i efterhand.
        </p>
        <div role="radiogroup" aria-label="Vad vill du göra?" className="mt-4 space-y-3">
          {DELETE_SCOPES.map((scope) => {
            const on = choice === scope.id;
            return (
              <button
                key={scope.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setChoice(scope.id);
                  setError("");
                  setDone("");
                }}
                className={
                  on
                    ? "w-full rounded-2xl border border-ink bg-ink px-4 py-3 text-left text-paper"
                    : "w-full rounded-2xl border border-line bg-card px-4 py-3 text-left hover:border-[#cfc6b8]"
                }
              >
                <span className="block text-sm font-medium">{scope.title}</span>
                <span className={on ? "mt-1 block text-sm leading-relaxed text-paper/75" : "mt-1 block text-sm leading-relaxed text-soft"}>
                  {scope.summary}
                </span>
              </button>
            );
          })}
        </div>

        {selected ? (
          <div className="mt-4 rounded-3xl border border-line bg-card px-4 py-4">
            <h3 className="text-sm font-medium">Det här tas bort</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-soft">
              {selected.removes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h3 className="mt-4 text-sm font-medium">Det här lämnas kvar</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-soft">
              {selected.keeps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {selected.caution ? <p className="mt-4 text-sm leading-relaxed text-soft">{selected.caution}</p> : null}
            <div className="mt-5">
              <Field
                label="Skriv RADERA för att bekräfta"
                value={phrase}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                onChange={(event) => setPhrase(event.target.value)}
                placeholder="RADERA"
                hint="Knappen går att trycka först när ordet står exakt så."
              />
            </div>
            {error ? (
              <p className="mt-4 text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            {done ? <p className="mt-4 text-sm leading-relaxed text-pine-deep">{done}</p> : null}
            <Button variant="danger" className="mt-4 w-full" disabled={!confirmed || busy} onClick={() => void confirm()}>
              {busy ? "Arbetar…" : "Bekräfta"}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
