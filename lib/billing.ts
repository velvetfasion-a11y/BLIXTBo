import type { Billing, Filters, Listing, Source } from "@/lib/types";

export const DEFAULT_FREE_AUTO_APPLIES = 5;
export const DEFAULT_PREMIUM_KR = 99;

export function freeAutoApplyLimit() {
  const raw = Number(process.env.NEXT_PUBLIC_FREE_AUTO_APPLY_LIMIT ?? DEFAULT_FREE_AUTO_APPLIES);
  return Number.isInteger(raw) && raw >= 0 ? raw : DEFAULT_FREE_AUTO_APPLIES;
}

export function premiumPriceKr() {
  const raw = Number(process.env.NEXT_PUBLIC_PREMIUM_PRICE_KR ?? DEFAULT_PREMIUM_KR);
  return raw > 0 ? raw : DEFAULT_PREMIUM_KR;
}

export function emptyBilling(): Billing {
  return { plan: "free", status: "free", usedAutoApplies: 0 };
}

export function billingLabel(billing: Billing) {
  const price = premiumPriceKr();
  if (billing.status === "paused") return "Premium är pausat. Automatiska ansökningar är av.";
  if (billing.status === "canceled") return "Prenumerationen är avslutad.";
  if (billing.plan === "premium" && billing.status === "active") return `Premium är igång. ${price} kr i månaden.`;
  return "Ingen Premium just nu.";
}

/** Premium that is not paused may auto-apply without a cap. A pause turns it off. */
export function canAutoApply(billing: Billing, freeLimit = freeAutoApplyLimit()) {
  if (billing.status === "paused") return false;
  if (billing.plan === "premium" && billing.status === "active") return true;
  return billing.usedAutoApplies < freeLimit;
}

export function isSameDay(iso: string, now: Date) {
  const date = new Date(iso);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

/** Listings from today that match the filters and that premium would auto-apply to. */
export function dailyQueueCount(
  listings: Listing[],
  filters: Filters,
  sources: Source[],
  passes: (listing: Listing, filters: Filters, sources: Source[]) => boolean,
  now = new Date(),
) {
  return listings.filter((listing) => {
    if (!listing.active || listing.manualApply) return false;
    if (!isSameDay(listing.publishedAt, now)) return false;
    return passes(listing, filters, sources);
  }).length;
}
