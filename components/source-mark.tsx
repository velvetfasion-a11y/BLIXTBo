const MARKS: Record<string, { letters: string; bg: string; fg: string }> = {
  wahlin: { letters: "W", bg: "#1c3d5a", fg: "#f4f7fb" },
  stena: { letters: "SF", bg: "#0e3a2f", fg: "#f3f7f4" },
  homeq: { letters: "HQ", bg: "#243024", fg: "#f4f7f2" },
  heimstaden: { letters: "H", bg: "#3d2a22", fg: "#f8f3ef" },
  bostadsformedlingen: { letters: "BF", bg: "#1e3a5f", fg: "#f4f7fb" },
  boplats: { letters: "BG", bg: "#1f3d36", fg: "#f3f7f4" },
  boplatssyd: { letters: "BS", bg: "#3a2f4a", fg: "#f7f4fb" },
  uppsala: { letters: "UB", bg: "#4a341f", fg: "#fbf6ef" },
};

export function SourceMark({ id, name, size = 52 }: { id: string; name: string; size?: number }) {
  const fallback = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
  const mark = MARKS[id] ?? { letters: fallback || "•", bg: "#1c1916", fg: "#f3f0ea" };
  return (
    <span
      className="grid shrink-0 place-items-center rounded-2xl font-semibold tracking-tight"
      style={{ width: size, height: size, background: mark.bg, color: mark.fg, fontSize: mark.letters.length > 1 ? size * 0.32 : size * 0.42 }}
      aria-hidden
    >
      {mark.letters}
    </span>
  );
}
