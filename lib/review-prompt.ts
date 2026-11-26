export const WON_STATUS = new Set(["accepterad", "kontrakt"]);

export type PromptApplication = {
  id: string;
  status: string;
  eventAt: string;
  listingId: string;
};

/** Automatic prompt: once when the apartment is won, then one later visit after Inte nu. */
export function shouldAutoPrompt(skips: number, reviewed: boolean, shownThisVisit: boolean) {
  if (reviewed || shownThisVisit || skips >= 2) return false;
  return true;
}

export function pickAutoPrompt(
  applications: PromptApplication[],
  reviewedListingIds: Set<string>,
  reviewedApplicationIds: Set<string>,
  skips: Record<string, number>,
  shown: Set<string>,
) {
  const ready = applications
    .filter((item) => {
      if (!WON_STATUS.has(item.status)) return false;
      const reviewed = reviewedApplicationIds.has(item.id) || (item.listingId !== "" && reviewedListingIds.has(item.listingId));
      return shouldAutoPrompt(skips[item.id] ?? 0, reviewed, shown.has(item.id));
    })
    .sort((a, b) => (a.eventAt < b.eventAt ? 1 : -1));
  return ready[0]?.id ?? null;
}
