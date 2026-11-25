"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Boot } from "@/components/boot";
import { IconChevron, IconLock } from "@/components/icons";
import { Button, Field } from "@/components/ui";
import { track } from "@/lib/analytics";
import { signInWithGoogle, signOutGoogle } from "@/lib/firebase/auth";
import { firebaseConfigured } from "@/lib/firebase/client";
import { useStore } from "@/lib/store";
import type { User } from "@/lib/types";

type Provider = "google" | "apple";

export function Account() {
  const store = useStore();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [opening, setOpening] = useState<Provider | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Skapa konto · Blixtbo";
  }, []);

  useEffect(() => {
    if (store.ready && store.user) router.replace("/hem");
  }, [store.ready, store.user, router]);

  if (!store.ready || store.user) return <Boot />;

  function emailError() {
    if (!email.includes("@") || !email.includes(".")) return "Skriv en giltig e-postadress.";
    return "";
  }

  function finish(method: User["method"], accountEmail: string, accountName: string) {
    const fallback = accountEmail.split("@")[0]?.replace(/[._]/g, " ") || "Ny användare";
    store.signIn({
      name: accountName.trim().length > 1 ? accountName.trim() : fallback,
      email: accountEmail.trim(),
      method,
    });
    router.push("/guide");
  }

  async function continueProvider(provider: Provider) {
    setError("");
    setOpening(provider);
    if (provider === "google" && firebaseConfigured()) {
      try {
        const result = await signInWithGoogle();
        const accountEmail = result.user.email || email;
        const accountName = result.user.displayName || name;
        const created = result.user.metadata.creationTime === result.user.metadata.lastSignInTime;
        track(created ? "signup" : "login");
        finish("google", accountEmail, accountName);
        await store.attachGoogle(result.user.uid);
        const token = await result.user.getIdToken();
        const api = process.env.NEXT_PUBLIC_API_URL;
        if (api) {
          await fetch(`${api.replace(/\/$/, "")}/auth/firebase`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ idToken: token }),
          }).catch(() => undefined);
        }
        router.push("/guide");
      } catch (caught) {
        console.error(caught);
        setError("Google-inloggningen avbröts. Försök igen.");
        setOpening(null);
        await signOutGoogle().catch(() => undefined);
      }
      return;
    }
    window.setTimeout(() => {
      const accountEmail = email.includes("@") ? email : provider === "google" ? "du@gmail.com" : "du@icloud.com";
      finish(provider, accountEmail, name);
    }, 900);
  }

  function sendCode() {
    const message = emailError();
    if (message) {
      setError(message);
      return;
    }
    setError("");
    setCodeSent(true);
  }

  function verifyCode() {
    const message = emailError();
    if (message) {
      setError(message);
      return;
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Koden är sex siffror.");
      return;
    }
    track("signup");
    finish("email", email, name);
  }

  return (
    <div className="min-h-dvh bg-paper px-6 py-8 sm:px-10">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-md flex-col">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-soft">
          <IconChevron className="h-4 w-4" />
          Tillbaka
        </Link>
        <div className="enter mt-10">
          <p className="text-sm font-medium text-pine">Konto</p>
          <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">Skapa konto</h1>
          <p className="mt-3 text-sm leading-relaxed text-soft">
            Ett konto räcker. Profilen återanvänds hos varje hyresvärd. Inget lösenord att komma ihåg.
          </p>
          <div className="mt-8 space-y-3">
            <Field label="Namn" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Anna Lindström" hint="Valfritt om du fortsätter med Google eller Apple." />
            <Button size="lg" className="w-full" disabled={opening !== null} onClick={() => continueProvider("google")}>
              {opening === "google" ? "Öppnar Google…" : "Fortsätt med Google"}
            </Button>
            <Button size="lg" variant="outline" className="w-full" disabled={opening !== null} onClick={() => continueProvider("apple")}>
              {opening === "apple" ? "Öppnar Apple…" : "Fortsätt med Apple"}
            </Button>
          </div>
          <p className="my-6 text-center text-xs tracking-wide text-faint">ELLER MED E-POST</p>
          <div className="space-y-4">
            <Field
              label="E-post"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError("");
              }}
              placeholder="anna@mail.com"
            />
            {codeSent ? (
              <Field
                label="Engångskod"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  setError("");
                }}
                placeholder="000000"
                hint="Sex siffror. Koden gäller i tio minuter och skickas bara till den här adressen. I prototypen fungerar vilken kod som helst."
              />
            ) : null}
          </div>
          {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
          <Button size="lg" variant="outline" className="mt-4 w-full" onClick={codeSent ? verifyCode : sendCode}>
            {codeSent ? "Bekräfta kod" : "Skicka engångskod"}
          </Button>
          <div className="mt-6 flex gap-3 rounded-2xl bg-pine-soft px-4 py-3 text-sm leading-relaxed text-pine-deep">
            <IconLock className="mt-0.5 h-5 w-5 shrink-0" />
            <p>Inget lösenord sparas. Google, Apple eller en engångskod räcker. Inloggningen krypteras och bara du har nyckeln.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
