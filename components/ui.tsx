"use client";

import { useEffect } from "react";
import { IconLock } from "@/components/icons";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "pine" | "outline" | "ghost" | "soft";
  size?: "sm" | "md" | "lg";
};

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center justify-center gap-2 font-medium transition disabled:pointer-events-none disabled:opacity-40",
        size === "lg" && "h-12 rounded-full px-5 text-base",
        size === "md" && "h-11 rounded-full px-4 text-sm",
        size === "sm" && "h-9 rounded-full px-3 text-sm",
        variant === "primary" && "bg-ink text-paper hover:bg-[#2c2824]",
        variant === "pine" && "bg-pine text-white hover:bg-pine-deep",
        variant === "outline" && "border border-line bg-card text-ink hover:bg-paper",
        variant === "ghost" && "text-ink hover:bg-black/5",
        variant === "soft" && "bg-paper-deep text-ink hover:bg-[#ddd4c6]",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  className,
  ...props
}: { label: string; hint?: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        {...props}
        className={cx(
          "mt-2 h-12 w-full rounded-2xl border bg-card px-4 text-base outline-none transition placeholder:text-faint focus:border-ink",
          error ? "border-danger" : "border-line",
          className,
        )}
      />
      {error ? <span className="mt-2 block text-sm text-danger">{error}</span> : null}
      {!error && hint ? <span className="mt-2 block text-sm leading-relaxed text-soft">{hint}</span> : null}
    </label>
  );
}

export function TextArea({
  label,
  hint,
  className,
  ...props
}: { label: string; hint?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <textarea
        {...props}
        className={cx(
          "mt-2 min-h-40 w-full resize-y rounded-2xl border border-line bg-card px-4 py-3 text-base leading-relaxed outline-none placeholder:text-faint focus:border-ink",
          className,
        )}
      />
      {hint ? <span className="mt-2 block text-sm leading-relaxed text-soft">{hint}</span> : null}
    </label>
  );
}

export function Why({ title = "Varför det efterfrågas", children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-paper-deep/80 px-4 py-3 text-sm leading-relaxed text-soft">
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-1">{children}</p>
    </div>
  );
}

export function Choice({
  selected,
  title,
  text,
  onClick,
}: {
  selected: boolean;
  title: string;
  text?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "w-full rounded-2xl border px-4 py-3 text-left transition",
        selected ? "border-ink bg-ink text-paper" : "border-line bg-card hover:border-[#cfc6b8]",
      )}
    >
      <span className="block text-sm font-medium">{title}</span>
      {text ? <span className={cx("mt-0.5 block text-sm", selected ? "text-paper/70" : "text-soft")}>{text}</span> : null}
    </button>
  );
}

export function Ring({ value, size = 76 }: { value: number; size?: number }) {
  const radius = 28;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (Math.max(0, Math.min(100, value)) / 100) * circ;
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <circle cx="36" cy="36" r={radius} stroke="var(--line)" strokeWidth="5" fill="none" />
      <circle
        cx="36"
        cy="36"
        r={radius}
        stroke="var(--pine)"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform="rotate(-90 36 36)"
      />
      <text x="36" y="40" textAnchor="middle" fontSize="15" fontWeight="600" fill="currentColor">
        {value}
      </text>
    </svg>
  );
}

export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" className="absolute inset-0 bg-[#1c1916]/40" aria-label="Stäng" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-paper px-5 pt-4 pb-6 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line sm:hidden" />
        {children}
      </div>
    </div>
  );
}

export function PrivacyNote() {
  return (
    <div className="flex gap-3 rounded-2xl bg-pine-soft px-4 py-3 text-sm leading-relaxed text-pine-deep">
      <IconLock className="mt-0.5 h-5 w-5 shrink-0" />
      <p>
        <span className="font-medium">Vi ser inte dina uppgifter.</span> Din inloggning krypteras och bara du har nyckeln. Du kan koppla bort när som helst.
      </p>
    </div>
  );
}

export function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="grid rounded-full bg-paper-deep p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cx(
            "h-10 rounded-full text-sm font-medium transition",
            value === option.id ? "bg-card text-ink shadow-[0_1px_2px_rgba(28,25,22,0.06)]" : "text-soft",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cx("relative h-7 w-12 shrink-0 rounded-full transition", on ? "bg-pine" : "bg-[#d5cec3]")}
    >
      <span className={cx("absolute top-0.5 h-6 w-6 rounded-full bg-white transition", on ? "left-5" : "left-0.5")} />
    </button>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-card px-6 py-12 text-center">
      <h2 className="font-serif text-3xl tracking-[-0.03em]">{title}</h2>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-soft">{body}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function StatusPill({ tone, children }: { tone: "pine" | "gold" | "info" | "danger" | "clay" | "ink"; children: React.ReactNode }) {
  const styles = {
    pine: "bg-pine-soft text-pine-deep",
    gold: "bg-gold-soft text-gold",
    info: "bg-info-soft text-info",
    danger: "bg-danger-soft text-danger",
    clay: "bg-clay-soft text-clay",
    ink: "bg-ink text-paper",
  };
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", styles[tone])}>{children}</span>;
}
