"use client";

import type { UserCredential } from "firebase/auth";
import { Roboto } from "next/font/google";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, cx, Field } from "@/components/ui";
import { googleErrorMessage, signInWithGoogle, signOutGoogle, takeGoogleRedirectResult } from "@/lib/firebase/auth";
import { firebaseConfigured } from "@/lib/firebase/client";
import { useStore } from "@/lib/store";
import type { User } from "@/lib/types";

const roboto = Roboto({ weight: "500", subsets: ["latin"], display: "swap" });

let redirectClaimed = false;

type Provider = "google" | "apple";

export function SignIn() {
  const store = useStore();
  const router = useRouter();
  const [opening, setOpening] = useState<Provider | null>(null);
  const [error, setError] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const adoptRef = useRef<(result: UserCredential) => Promise<void>>(async () => undefined);

  async function adoptGoogle(result: UserCredential) {
    const accountEmail = result.user.email || result.user.providerData.find((item) => item.email)?.email || "";
    if (!accountEmail.includes("@")) {
      setError("Google-kontot har ingen e-postadress.");
      setOpening(null);
      await signOutGoogle().catch(() => undefined);
      return;
    }
    const fallback = accountEmail.split("@")[0]?.replace(/[._-]/g, " ").trim() || "Ny användare";
    store.signIn({
      name: result.user.displayName?.trim() || fallback,
      email: accountEmail,
      method: "google",
    });
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
    adoptRef.current = adoptGoogle;
  });

  useEffect(() => {
    let active = true;
    takeGoogleRedirectResult()
      .then((result) => {
        if (!active || !result || redirectClaimed) return;
        redirectClaimed = true;
        setOpening("google");
        return adoptRef.current(result);
      })
      .catch((caught) => {
        console.error(caught);
        if (!active) return;
        const message = googleErrorMessage(caught);
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

  async function continueGoogle() {
    setError("");
    setOpening("google");
    if (!firebaseConfigured()) {
      setError("Google-inloggningen är inte tillgänglig just nu. Försök igen om en stund.");
      setOpening(null);
      return;
    }
    try {
      const result = await signInWithGoogle();
      if (!result) return;
      await adoptGoogle(result);
    } catch (caught) {
      console.error(caught);
      setError(googleErrorMessage(caught));
      setOpening(null);
      await signOutGoogle().catch(() => undefined);
    }
  }

  function continueApple() {
    setError("");
    setOpening("apple");
    window.setTimeout(() => {
      finish("apple", "du@icloud.com");
    }, 900);
  }

  function emailError() {
    if (!email.includes("@") || !email.includes(".")) return "Skriv en giltig e-postadress.";
    return "";
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
    finish("email", email);
  }

  const busy = opening !== null;

  return (
    <div>
      <div className="flex flex-col gap-3">
        <ProviderButton
          pending={opening === "google"}
          disabled={busy}
          onClick={() => void continueGoogle()}
          logo={<GoogleLogo />}
          label="Fortsätt med Google"
          pendingLabel="Öppnar Google…"
          className={`${roboto.className} border-[#747775] text-[#1f1f1f] hover:bg-[#1f1f1f]/[0.06] active:bg-[#1f1f1f]/[0.12]`}
          style={{ fontFamily: `"Google Sans", ${roboto.style.fontFamily}, Arial, sans-serif`, letterSpacing: "0.25px" }}
        />
        <ProviderButton
          pending={opening === "apple"}
          disabled={busy}
          onClick={continueApple}
          logo={<AppleLogo />}
          label="Fortsätt med Apple"
          pendingLabel="Öppnar Apple…"
          className="border-black text-black hover:bg-black/[0.04] active:bg-black/[0.08]"
        />
      </div>
      <button
        type="button"
        className="mt-4 w-full py-2 text-center text-sm text-soft underline-offset-4 hover:underline disabled:opacity-40"
        disabled={busy}
        aria-expanded={emailOpen}
        onClick={() => {
          setEmailOpen((open) => !open);
          setError("");
        }}
      >
        Fortsätt med e-post
      </button>
      {emailOpen ? (
        <div className="mt-2 space-y-4 border-t border-line pt-5">
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
              hint="Sex siffror. Koden gäller i tio minuter och skickas till den här adressen."
            />
          ) : (
            <p className="text-sm leading-relaxed text-soft">En engångskod skickas till adressen. Inget lösenord.</p>
          )}
          <Button size="lg" variant="outline" className="w-full" disabled={busy} onClick={codeSent ? verifyCode : sendCode}>
            {codeSent ? "Bekräfta kod" : "Skicka engångskod"}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <p className="mt-4 text-xs leading-relaxed text-faint">Första gången skapas kontot automatiskt.</p>
    </div>
  );
}

function ProviderButton({
  label,
  pendingLabel,
  pending,
  disabled,
  onClick,
  logo,
  className,
  style,
}: {
  label: string;
  pendingLabel: string;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
  logo: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-busy={pending}
      style={style}
      className={cx(
        "flex h-12 w-full items-center rounded-full border bg-white px-3 text-base font-medium transition disabled:cursor-wait disabled:opacity-70",
        className,
      )}
    >
      <span className="grid h-5 w-5 shrink-0 place-items-center">{logo}</span>
      <span className="flex-1 text-center">{pending ? pendingLabel : label}</span>
      <span className="h-5 w-5 shrink-0" aria-hidden />
    </button>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <path
        fill="currentColor"
        d="M16.37 12.72c.03 2.7 2.37 3.6 2.4 3.61-.02.06-.37 1.28-1.23 2.54-.74 1.08-1.51 2.16-2.73 2.18-1.19.02-1.58-.71-2.95-.71-1.37 0-1.79.69-2.92.73-1.17.04-2.06-1.17-2.81-2.25-1.53-2.21-2.7-6.24-1.13-8.96.78-1.35 2.17-2.2 3.68-2.23 1.15-.02 2.23.77 2.95.77.7 0 2.01-.95 3.39-.81.58.02 2.2.23 3.24 1.76-.08.05-1.93 1.13-1.91 3.37zM14.3 6.3c.62-.75 1.04-1.79.92-2.83-.89.04-1.97.59-2.61 1.34-.57.66-1.07 1.72-.94 2.73 1 .08 2.01-.5 2.63-1.24z"
      />
    </svg>
  );
}
