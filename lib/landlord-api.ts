import type { Listing, Source } from "@/lib/types";

export function apiBase() {
  return (process.env.NEXT_PUBLIC_API_URL || "/api").replace(/\/$/, "");
}

export function isQasaListing(source: Source | undefined, listing: Listing | undefined): boolean {
  return listing?.sourceId === "qasa" || Boolean(listing?.messageApply) || source?.id === "qasa";
}

export function sendConfirmation(source: Source | undefined, listing: Listing | undefined): string | null {
  if (isQasaListing(source, listing)) return null;
  if (source?.bindingApply || listing?.bindingApply || listing?.sourceId === "bostadsformedlingen") {
    return "Intresset blir bindande för den sökande med längst kötid när annonstiden tar slut.";
  }
  return null;
}
