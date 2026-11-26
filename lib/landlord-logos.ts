import { SOURCE_SEED } from "@/lib/data";

/**
 * Official marks, saved unmodified from each company's own site.
 * A landlord added to SOURCE_SEED without a file falls back to a monogram.
 */
const FILES: Record<string, string> = {
  homeq: "/landlords/homeq.png",
  wahlin: "/landlords/wahlin.svg",
  heimstaden: "/landlords/heimstaden.png",
  akelius: "/landlords/akelius.svg",
  qasa: "/landlords/qasa.svg",
  bostadsformedlingen: "/landlords/bostadsformedlingen.svg",
  boplats: "/landlords/boplats.png",
  boplatssyd: "/landlords/boplatssyd.svg",
  uppsala: "/landlords/uppsala.svg",
  wallenstam: "/landlords/wallenstam.svg",
  stena: "/landlords/stena.png",
  sssb: "/landlords/sssb.png",
  rikshem: "/landlords/rikshem.svg",
  victoriahem: "/landlords/victoriahem.svg",
};

const MONOGRAMS: Record<string, { letters: string; bg: string; fg: string }> = {
  homeq: { letters: "HQ", bg: "#1b3a6b", fg: "#f4f7fb" },
  wahlin: { letters: "W", bg: "#1c1916", fg: "#f6f2e8" },
  heimstaden: { letters: "H", bg: "#e4572e", fg: "#fff8f4" },
  akelius: { letters: "A", bg: "#162a53", fg: "#f4f7fb" },
  qasa: { letters: "Q", bg: "#342620", fg: "#f7f3ef" },
  bostadsformedlingen: { letters: "BF", bg: "#4a4a4d", fg: "#f4f4f5" },
  boplats: { letters: "BG", bg: "#e87722", fg: "#fff8f3" },
  boplatssyd: { letters: "BS", bg: "#0e6b4f", fg: "#f3faf7" },
  uppsala: { letters: "UB", bg: "#6d2e86", fg: "#f8f4fb" },
  wallenstam: { letters: "W", bg: "#111111", fg: "#f4f4f4" },
  stena: { letters: "SF", bg: "#0a2f6b", fg: "#f3f6fb" },
  sssb: { letters: "SS", bg: "#1d4e89", fg: "#f4f7fb" },
  rikshem: { letters: "R", bg: "#5d0096", fg: "#f7f2fb" },
  victoriahem: { letters: "V", bg: "#005a69", fg: "#f2f8f8" },
};

const PALETTE = ["#1c3d5a", "#0e3a2f", "#3d2a22", "#1e3a5f", "#1f3d36", "#3a2f4a", "#4a341f", "#5d0096"];

export type LandlordBrand = {
  id: string;
  name: string;
  src: string | null;
  official: boolean;
};

export function landlordRoster(): LandlordBrand[] {
  return SOURCE_SEED.map((source) => {
    const src = FILES[source.id] ?? null;
    return { id: source.id, name: source.name, src, official: Boolean(src) };
  });
}

export function landlordById(id: string): LandlordBrand | undefined {
  return landlordRoster().find((item) => item.id === id);
}

export function landlordLabel(id: string, fallback?: string) {
  return landlordById(id)?.name || fallback || id;
}

export function monogramFor(id: string, name: string) {
  const known = MONOGRAMS[id];
  if (known) return known;
  const letters =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "•";
  let hash = 0;
  for (const char of id) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return { letters: letters.slice(0, 2), bg: PALETTE[hash % PALETTE.length] ?? PALETTE[0], fg: "#f4f7f2" };
}
