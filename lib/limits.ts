import type { Application, AppStatus, Listing, Source } from "@/lib/types";

const ACTIVE: ReadonlySet<AppStatus> = new Set(["skickad", "visning", "erbjuden", "accepterad"]);

export function isActiveApplication(status: AppStatus) {
  return ACTIVE.has(status);
}

export function activeForSource(applications: Application[], listings: Listing[], sourceId: string) {
  return applications.filter((application) => {
    if (!isActiveApplication(application.status)) return false;
    return listings.find((listing) => listing.id === application.listingId)?.sourceId === sourceId;
  });
}

export function applicationLimit(source: Source | undefined) {
  if (!source || source.applicationLimit == null || source.applicationLimit < 1) return null;
  return source.applicationLimit;
}

export function atApplicationLimit(sources: Source[], applications: Application[], listings: Listing[], sourceId: string) {
  const source = sources.find((item) => item.id === sourceId);
  const max = applicationLimit(source);
  if (max == null) return false;
  return activeForSource(applications, listings, sourceId).length >= max;
}

export function limitCounter(source: Source, count: number) {
  return `${count}/${source.applicationLimit} ansökningar hos ${source.name}`;
}

export function limitMessage(source: Source) {
  const max = source.applicationLimit;
  const base = `Du har nått max ${max} ansökningar hos ${source.name}.`;
  if (source.plusLimit == null) return base;
  const brand = source.id === "homeq" ? "HomeQ+" : `${source.name}+`;
  if (source.plusPriceKr != null) {
    return `${base} Med ${brand} (${source.plusPriceKr} kr/mån, via ${source.name}) kan du söka upp till ${source.plusLimit} lägenheter samtidigt.`;
  }
  return `${base} Med ${brand} kan du söka upp till ${source.plusLimit} lägenheter samtidigt.`;
}
