export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#146048" />
      <path d="M17.6 6.2 9.4 17.4h6.3l-1.7 8.4 8.6-12.1h-6.5l1.5-7.5Z" fill="#F3F0EA" />
    </svg>
  );
}

export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Mark size={28} />
      <span className={`text-[1.15rem] font-semibold tracking-[-0.03em] ${light ? "text-paper" : "text-ink"}`}>
        Blixtbo
      </span>
    </span>
  );
}
