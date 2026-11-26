"use client";

import type { UserCredential } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AuthCard, type AuthErrors, type AuthMode, type AuthView } from "@/components/auth-card";
import {
  accountFromProvider,
  appleErrorMessage,
  consumeRedirectProvider,
  googleErrorMessage,
  providerMethod,
  rememberProviderName,
  signInWithApple,
  signInWithGoogle,
  signOutGoogle,
  takeRedirectResult,
} from "@/lib/firebase/auth";
import { firebaseConfigured } from "@/lib/firebase/client";
import { useStore } from "@/lib/store";
import type { User } from "@/lib/types";

let redirectClaimed = false;

type Provider = "google" | "apple";

function emailProblem(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "Skriv din e-postadress.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Skriv en giltig e-postadress.";
  return "";
}

function passwordProblem(value: string, mode: AuthMode) {
  if (!value) return "Skriv ditt lösenord.";
  if (mode === "signup" && value.length < 8) return "Lösenordet behöver minst 8 tecken.";
  return "";
}

function confirmProblem(password: string, confirm: string) {
  if (!confirm) return "Bekräfta lösenordet.";
  if (password !== confirm) return "Lösenorden matchar inte.";
  return "";
}

export function SignIn({ variant = "embedded" }: { variant?: "page" | "embedded" }) {
  const store = useStore();
  const router = useRouter();
  const [opening, setOpening] = useState<Provider | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<AuthMode>("login");
  const [view, setView] = useState<AuthView>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<AuthErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const adoptRef = useRef<(result: UserCredential, method: Provider) => Promise<void>>(async () => undefined);

  async function adopt(result: UserCredential, method: Provider) {
    const account = accountFromProvider(result, method);
    if (!account.email.includes("@")) {
      setError(method === "apple" ? "Apple-kontot har ingen e-postadress." : "Google-kontot har ingen e-postadress.");
      setOpening(null);
      await signOutGoogle().catch(() => undefined);
      return;
    }
    const fallback = account.email.split("@")[0]?.replace(/[._-]/g, " ").trim() || "Ny användare";
    if (method === "apple" && account.name) {
      await rememberProviderName(result, account.name).catch((caught) => console.error(caught));
    }
    store.signIn({ name: account.name || fallback, email: account.email, method });
    try {
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
    } catch (caught) {
      console.error(caught);
    }
    router.push("/guide");
  }

  useEffect(() => {
    adoptRef.current = adopt;
  });

  useEffect(() => {
    let active = true;
    takeRedirectResult()
      .then((result) => {
        if (!active || redirectClaimed) return;
        const pending = consumeRedirectProvider();
        if (!result) return;
        redirectClaimed = true;
        const method = providerMethod(result, pending);
        setOpening(method);
        return adoptRef.current(result, method);
      })
      .catch((caught) => {
        console.error(caught);
        if (!active || redirectClaimed) return;
        redirectClaimed = true;
        const pending = consumeRedirectProvider();
        const message = pending === "apple" ? appleErrorMessage(caught) : googleErrorMessage(caught);
        if (message) setError(message);
        setOpening(null);
      });
    return () => {
      active = false;
    };
  }, []);

  function finish(method: User["method"], accountEmail: string) {
    const fallback = accountEmail.split("@")[0]?.replace(/[._]/g, " ") || "Ny användare";
    store.signIn({ name: fallback, email: accountEmail.trim(), method });
    router.push("/guide");
  }

  async function continueProvider(provider: Provider) {
    setError("");
    setOpening(provider);
    if (!firebaseConfigured()) {
      setError(
        provider === "apple"
          ? "Apple-inloggningen är inte tillgänglig just nu. Försök igen om en stund."
          : "Google-inloggningen är inte tillgänglig just nu. Försök igen om en stund.",
      );
      setOpening(null);
      return;
    }
    try {
      const result = provider === "apple" ? await signInWithApple() : await signInWithGoogle();
      if (!result) return;
      await adopt(result, provider);
    } catch (caught) {
      console.error(caught);
      setError(provider === "apple" ? appleErrorMessage(caught) : googleErrorMessage(caught));
      setOpening(null);
      await signOutGoogle().catch(() => undefined);
    }
  }

  useEffect(() => {
    if (variant !== "page") return;
    const title =
      view === "credentials" ? (mode === "signup" ? "Skapa konto · Blixtbo" : "Logga in · Blixtbo") : "Återställ lösenord · Blixtbo";
    document.title = title;
  }, [variant, mode, view]);

  function clearField(field: keyof AuthErrors) {
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (opening || submitting) return;
    if (view === "forgot") {
      const emailMessage = emailProblem(email);
      setErrors({ email: emailMessage });
      if (emailMessage) {
        emailRef.current?.focus();
        return;
      }
      setSubmitting(true);
      setView("forgotSent");
      setSubmitting(false);
      return;
    }
    const next: AuthErrors = {
      email: emailProblem(email),
      password: passwordProblem(password, mode),
      confirm: mode === "signup" ? confirmProblem(password, confirm) : undefined,
    };
    setErrors(next);
    setError("");
    if (next.email) {
      emailRef.current?.focus();
      return;
    }
    if (next.password) {
      passwordRef.current?.focus();
      return;
    }
    if (next.confirm) {
      confirmRef.current?.focus();
      return;
    }
    setSubmitting(true);
    finish("email", email.trim());
  }

  return (
    <AuthCard
      variant={variant}
      mode={mode}
      view={view}
      email={email}
      password={password}
      confirm={confirm}
      showPassword={showPassword}
      showConfirm={showConfirm}
      errors={errors}
      formError={error}
      opening={opening}
      submitting={submitting}
      emailRef={emailRef}
      passwordRef={passwordRef}
      confirmRef={confirmRef}
      onEmail={(value) => {
        setEmail(value);
        clearField("email");
      }}
      onPassword={(value) => {
        setPassword(value);
        clearField("password");
      }}
      onConfirm={(value) => {
        setConfirm(value);
        clearField("confirm");
      }}
      onTogglePassword={() => setShowPassword((shown) => !shown)}
      onToggleConfirm={() => setShowConfirm((shown) => !shown)}
      onMode={(next) => {
        setMode(next);
        setView("credentials");
        setPassword("");
        setConfirm("");
        setShowPassword(false);
        setShowConfirm(false);
        setErrors({});
        setError("");
        setSubmitting(false);
      }}
      onForgot={() => {
        setView("forgot");
        setErrors({});
        setError("");
        setSubmitting(false);
      }}
      onBack={() => {
        setMode("login");
        setView("credentials");
        setErrors({});
        setError("");
        setSubmitting(false);
      }}
      onSubmit={submitCredentials}
      onProvider={(provider) => void continueProvider(provider)}
    />
  );
}
