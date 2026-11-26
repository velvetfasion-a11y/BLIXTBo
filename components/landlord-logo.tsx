"use client";

import { useState } from "react";
import { cx } from "@/components/ui";
import { asset } from "@/lib/asset";
import { landlordById, monogramFor } from "@/lib/landlord-logos";

export function LandlordMark({
  id,
  name,
  labelled = false,
  className,
}: {
  id: string;
  name: string;
  labelled?: boolean;
  className?: string;
}) {
  const src = landlordById(id)?.src ?? null;
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    const mark = monogramFor(id, name);
    return (
      <span
        role="img"
        aria-label={labelled ? name : undefined}
        aria-hidden={labelled ? undefined : true}
        className={cx("grid h-9 w-9 place-items-center rounded-xl font-semibold tracking-tight", className)}
        style={{ background: mark.bg, color: mark.fg, fontSize: mark.letters.length > 1 ? "0.72rem" : "0.95rem" }}
      >
        <span aria-hidden>{mark.letters}</span>
      </span>
    );
  }

  return (
    <img
      src={asset(src)}
      alt={labelled ? name : ""}
      aria-label={labelled ? name : undefined}
      aria-hidden={labelled ? undefined : true}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={cx("h-full w-auto max-w-full object-contain", className)}
    />
  );
}

export function LandlordLogo({
  id,
  name,
  size = 44,
  layout = "tile",
  labelled = false,
  className,
}: {
  id: string;
  name: string;
  size?: number;
  layout?: "tile" | "inline";
  labelled?: boolean;
  className?: string;
}) {
  if (layout === "inline") {
    return (
      <span className={cx("inline-flex shrink-0 items-center", className)} style={{ height: size, maxWidth: size * 3.4 }}>
        <LandlordMark id={id} name={name} labelled={labelled} />
      </span>
    );
  }

  return (
    <span
      className={cx("inline-grid shrink-0 place-items-center rounded-2xl bg-paper px-2", className)}
      style={{ height: size, width: Math.round(size * 1.7) }}
    >
      <LandlordMark id={id} name={name} labelled={labelled} className="max-h-[62%] max-w-[88%]" />
    </span>
  );
}

export function LandlordIdentity({
  id,
  name,
  size = 40,
  className,
  nameClassName,
}: {
  id: string;
  name: string;
  size?: number;
  className?: string;
  nameClassName?: string;
}) {
  return (
    <span className={cx("inline-flex min-w-0 items-center gap-2.5", className)}>
      <LandlordLogo id={id} name={name} size={size} />
      <span className={cx("truncate", nameClassName)}>{name}</span>
    </span>
  );
}
