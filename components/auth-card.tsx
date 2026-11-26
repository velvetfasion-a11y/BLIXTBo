"use client";

import { Roboto } from "next/font/google";
import Link from "next/link";
import type { FormEvent, ReactNode, RefObject } from "react";
import { Wordmark } from "@/components/mark";

const roboto = Roboto({ weight: "500", subsets: ["latin"], display: "swap" });

export type AuthMode = "login" | "signup";
export type AuthView = "credentials" | "forgot" | "forgotSent";
export type AuthProviderName = "google" | "apple";

export type AuthErrors = {
  email?: string;
  password?: string;
  confirm?: string;
};

type AuthCardProps = {
  variant: "page" | "embedded";
  mode: AuthMode;
  view: AuthView;
  email: string;
  password: string;
  confirm: string;
  showPassword: boolean;
  showConfirm: boolean;
  errors: AuthErrors;
  formError: string;
  opening: AuthProviderName | null;
  submitting: boolean;
  emailRef?: RefObject<HTMLInputElement | null>;
  passwordRef?: RefObject<HTMLInputElement | null>;
  confirmRef?: RefObject<HTMLInputElement | null>;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onConfirm: (value: string) => void;
  onTogglePassword: () => void;
  onToggleConfirm: () => void;
  onMode: (mode: AuthMode) => void;
  onForgot: () => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onProvider: (provider: AuthProviderName) => void;
};

const cardClass =
  "w-full rounded-[28px] border border-line bg-card px-5 py-5 shadow-[0_16px_48px_rgba(28,25,22,0.06)] sm:px-7 sm:py-7";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function copyFor(mode: AuthMode, view: AuthView) {
  if (view === "forgot") {
    return {
      title: "Återställ lösenord",
      subtitle: "Skriv e-postadressen som hör till kontot.",
    };
  }
  if (view === "forgotSent") {
    return {
      title: "Kolla din e-post",
      subtitle: "Om adressen hör till ett konto får du ett meddelande med nästa steg.",
    };
  }
  if (mode === "signup") {
    return {
      title: "Skapa konto",
      subtitle: "Ett konto räcker. Profilen följer med till varje hyresvärd.",
    };
  }
  return {
    title: "Logga in",
    subtitle: "Fortsätt till dina bostäder, köer och ansökningar.",
  };
}

export function AuthCard(props: AuthCardProps) {
  const heading = copyFor(props.mode, props.view);
  const HeadingTag = props.variant === "page" ? "h1" : "h2";
  const busy = props.opening !== null || props.submitting;
  const emailId = "blixtbo-auth-email";
  const passwordId = "blixtbo-auth-password";
  const confirmId = "blixtbo-auth-confirm";
  const headingId = "blixtbo-auth-heading";

  return (
    <section className={cardClass} aria-labelledby={headingId}>
      {props.variant === "page" ? (
        <div className="mb-5 flex justify-center">
          <Link href="/" className={cx("inline-flex rounded-lg", focusClass)} aria-label="Blixtbo, till startsidan">
            <Wordmark />
          </Link>
        </div>
      ) : null}
      <header className="text-center">
        <HeadingTag id={headingId} className="font-serif text-3xl tracking-[-0.03em] text-ink">
          {heading.title}
        </HeadingTag>
        <p className="mx-auto mt-2 min-h-12 max-w-[34ch] text-sm leading-6 text-soft">{heading.subtitle}</p>
      </header>

      {props.view === "forgotSent" ? (
        <div className="mt-6">
          <button type="button" className={primaryButtonClass} onClick={props.onBack}>
            Tillbaka till inloggning
          </button>
        </div>
      ) : null}

      {props.view === "forgot" ? (
        <form className="mt-6" noValidate onSubmit={props.onSubmit}>
          <TextField
            id={emailId}
            label="E-post"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={props.email}
            error={props.errors.email}
            placeholder="namn@exempel.se"
            inputRef={props.emailRef}
            onChange={props.onEmail}
          />
          <button type="submit" className={cx(primaryButtonClass, "mt-2")} disabled={busy} aria-busy={props.submitting}>
            {props.submitting ? "Skickar…" : "Skicka länk"}
          </button>
          <p className="mt-4 text-center text-sm text-soft">
            <button type="button" className={textActionClass} onClick={props.onBack}>
              Tillbaka till inloggning
            </button>
          </p>
        </form>
      ) : null}

      {props.view === "credentials" ? (
        <>
          <div className="mt-5 grid grid-cols-1 gap-3">
            <ProviderButton
              provider="apple"
              label={props.mode === "signup" ? "Registrera dig med Apple" : "Logga in med Apple"}
              pendingLabel="Öppnar Apple…"
              pending={props.opening === "apple"}
              disabled={busy}
              onClick={() => props.onProvider("apple")}
            />
            <ProviderButton
              provider="google"
              label={props.mode === "signup" ? "Registrera dig med Google" : "Logga in med Google"}
              pendingLabel="Öppnar Google…"
              pending={props.opening === "google"}
              disabled={busy}
              onClick={() => props.onProvider("google")}
            />
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {props.opening === "apple" ? "Öppnar Apple" : props.opening === "google" ? "Öppnar Google" : ""}
          </p>
          {props.formError ? (
            <p className="mt-3 text-center text-sm leading-5 text-danger" role="alert">
              {props.formError}
            </p>
          ) : null}

          <div className="mt-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" aria-hidden />
            <span className="text-sm text-soft">eller</span>
            <span className="h-px flex-1 bg-line" aria-hidden />
          </div>

          <form className="mt-5" noValidate onSubmit={props.onSubmit}>
            <TextField
              id={emailId}
              label="E-post"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={props.email}
              error={props.errors.email}
              placeholder="namn@exempel.se"
              inputRef={props.emailRef}
              onChange={props.onEmail}
            />
            <TextField
              id={passwordId}
              label="Lösenord"
              type={props.showPassword ? "text" : "password"}
              autoComplete={props.mode === "signup" ? "new-password" : "current-password"}
              value={props.password}
              error={props.errors.password}
              hint={props.mode === "signup" ? "Minst 8 tecken." : undefined}
              inputRef={props.passwordRef}
              onChange={props.onPassword}
              labelAction={
                props.mode === "login" ? (
                  <button type="button" className={textActionClass} onClick={props.onForgot}>
                    Glömt lösenord?
                  </button>
                ) : null
              }
              trailing={
                <RevealButton shown={props.showPassword} onClick={props.onTogglePassword} />
              }
            />
            {props.mode === "signup" ? (
              <TextField
                id={confirmId}
                label="Bekräfta lösenord"
                type={props.showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={props.confirm}
                error={props.errors.confirm}
                inputRef={props.confirmRef}
                onChange={props.onConfirm}
                trailing={<RevealButton shown={props.showConfirm} onClick={props.onToggleConfirm} controls={confirmId} />}
              />
            ) : null}
            <button type="submit" className={cx(primaryButtonClass, "mt-2")} disabled={busy} aria-busy={props.submitting}>
              {props.submitting ? (
                <>
                  <Spinner />
                  {props.mode === "signup" ? "Skapar konto…" : "Loggar in…"}
                </>
              ) : props.mode === "signup" ? (
                "Skapa konto"
              ) : (
                "Logga in"
              )}
            </button>
          </form>

          <p className="mt-3 text-center text-sm leading-6 text-soft">
            {props.mode === "login" ? "Inget konto än?" : "Har du redan ett konto?"}{" "}
            <button
              type="button"
              className={textActionClass}
              onClick={() => props.onMode(props.mode === "login" ? "signup" : "login")}
              disabled={busy}
            >
              {props.mode === "login" ? "Skapa konto" : "Logga in"}
            </button>
          </p>
        </>
      ) : null}

      <footer className="mt-5 border-t border-line pt-3 text-center">
        <p className="text-xs leading-5 text-soft">Krypterad inloggning. Vi säljer inte dina uppgifter.</p>
        <p className="mt-1.5 text-xs leading-5">
          <Link href="/villkor" className={cx(textActionClass, "text-xs")}>
            Villkor
          </Link>
          <span className="px-1.5 text-faint" aria-hidden>
            ·
          </span>
          <Link href="/integritet" className={cx(textActionClass, "text-xs")}>
            Integritet
          </Link>
        </p>
      </footer>
    </section>
  );
}

const noop = () => undefined;

export function AuthCardSkeleton() {
  return (
    <div className="w-full">
      <p className="sr-only" role="status">
        Laddar inloggning…
      </p>
      <div inert className="w-full">
        <AuthCard
          variant="embedded"
          mode="login"
          view="credentials"
          email=""
          password=""
          confirm=""
          showPassword={false}
          showConfirm={false}
          errors={{}}
          formError=""
          opening={null}
          submitting={false}
          onEmail={noop}
          onPassword={noop}
          onConfirm={noop}
          onTogglePassword={noop}
          onToggleConfirm={noop}
          onMode={noop}
          onForgot={noop}
          onBack={noop}
          onSubmit={(event) => event.preventDefault()}
          onProvider={noop}
        />
      </div>
    </div>
  );
}

const primaryButtonClass = cx(
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-pine text-base font-medium text-white transition-[background-color]",
  "hover:bg-pine-deep disabled:cursor-not-allowed disabled:opacity-60",
  focusClass,
);

const textActionClass = cx(
  "font-medium text-pine underline decoration-pine/30 underline-offset-4 hover:decoration-pine",
  "rounded-sm disabled:opacity-40",
  focusClass,
);

function TextField({
  id,
  label,
  type,
  value,
  onChange,
  error,
  hint,
  inputRef,
  labelAction,
  trailing,
  ...input
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  labelAction?: ReactNode;
  trailing?: ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange" | "children">) {
  const messageId = `${id}-message`;
  return (
    <div>
      <div className="flex min-h-6 items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative mt-1.5">
        <input
          {...input}
          ref={inputRef}
          id={id}
          type={type}
          value={value}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          onChange={(event) => onChange(event.target.value)}
          className={cx(
            "h-12 w-full rounded-xl border bg-white px-3.5 text-base text-ink transition-[border-color] placeholder:text-[#8a847b]",
            trailing ? "pr-12" : "",
            error ? "border-danger" : "border-line",
            "focus-visible:border-pine",
            focusClass,
          )}
        />
        {trailing ? <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div> : null}
      </div>
      <p id={messageId} className="mt-1.5 min-h-5 text-sm leading-5" role={error ? "alert" : undefined}>
        {error ? <span className="text-danger">{error}</span> : hint ? <span className="text-soft">{hint}</span> : null}
      </p>
    </div>
  );
}

function RevealButton({
  shown,
  onClick,
  controls,
}: {
  shown: boolean;
  onClick: () => void;
  controls?: string;
}) {
  return (
    <button
      type="button"
      className={cx("grid h-9 w-9 place-items-center rounded-lg text-soft hover:text-ink", focusClass)}
      aria-pressed={shown}
      aria-controls={controls}
      aria-label={shown ? "Dölj lösenord" : "Visa lösenord"}
      onClick={onClick}
    >
      {shown ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  );
}

function ProviderButton({
  provider,
  label,
  pendingLabel,
  pending,
  disabled,
  onClick,
}: {
  provider: AuthProviderName;
  label: string;
  pendingLabel: string;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const apple = provider === "apple";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-busy={pending}
      style={
        apple
          ? { fontFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` }
          : {
              fontFamily: `"Google Sans", ${roboto.style.fontFamily}, Arial, sans-serif`,
              letterSpacing: "0.25px",
            }
      }
      className={cx(
        "flex h-11 w-full items-center rounded-lg px-3 transition-[background-color] disabled:cursor-not-allowed disabled:opacity-60",
        focusClass,
        apple
          ? "border border-black bg-black text-[16px] font-medium text-white hover:bg-[#1a1a1a] active:bg-black"
          : cx(
              roboto.className,
              "border border-[#747775] bg-white text-[14px] font-medium text-[#1f1f1f] hover:bg-[#1f1f1f]/[0.06] active:bg-[#1f1f1f]/[0.12]",
            ),
      )}
    >
      <span className="grid h-5 w-5 shrink-0 place-items-center">{apple ? <AppleLogo /> : <GoogleLogo />}</span>
      <span className="flex-1 text-center whitespace-nowrap">{pending ? pendingLabel : label}</span>
      <span className="h-5 w-5 shrink-0" aria-hidden />
    </button>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none"
      aria-hidden
    />
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden>
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

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M4 5.5 19 19" />
      <path d="M9.2 9.4A3.2 3.2 0 0 0 12 15.2c.7 0 1.3-.2 1.8-.6" />
      <path d="M6.2 7.8C4.1 9.3 2.5 12 2.5 12S6 17.5 12 17.5c1.3 0 2.5-.3 3.5-.8" />
      <path d="M10 6.7c.6-.1 1.3-.2 2-.2 6 0 9.5 5.5 9.5 5.5a16 16 0 0 1-3.1 3.4" />
    </svg>
  );
}
