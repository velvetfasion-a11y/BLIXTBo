"use client";

import { useEffect, useState } from "react";

export function remainingParts(deadline: string, now = Date.now()) {
  const diff = new Date(deadline).getTime() - now;
  if (diff <= 0) return { label: "Tiden har gått ut", urgent: true, expired: true };
  const total = Math.floor(diff / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const urgent = diff < 2 * 60 * 60 * 1000;
  const label =
    days > 0
      ? `${days} dag ${hours} tim ${minutes} min`
      : `${hours} tim ${String(minutes).padStart(2, "0")} min ${String(seconds).padStart(2, "0")} sek`;
  return { label, urgent, expired: false };
}

export function Countdown({ deadline, className = "" }: { deadline: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const parts = remainingParts(deadline, now);
  return <span className={`num ${parts.urgent ? "text-clay" : ""} ${className}`}>{parts.label}</span>;
}
