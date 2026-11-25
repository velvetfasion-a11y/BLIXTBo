import { daysFromToday, kr } from "@/lib/format";
import type { Filters, Listing, Profile, Queue, Requirement, Source } from "@/lib/types";

export const EMPLOYMENT = [
  { id: "tillsvidare", title: "Tillsvidare", text: "Fast anställning utan slutdatum." },
  { id: "visstid", title: "Visstid", text: "Anställning med ett angivet slut." },
  { id: "provanstallning", title: "Provanställning", text: "Ofta sex månader, sedan tillsvidare." },
  { id: "foretag", title: "Egenföretagare", text: "Deklaration kan behövas som komplement." },
  { id: "student", title: "Student", text: "CSN eller annan inkomst behöver synas." },
  { id: "pension", title: "Pension", text: "Pensionsutbetalning räknas som inkomst." },
] as const;

export const HOUSING = [
  { id: "forstahand", title: "Förstahand", text: "Eget kontrakt med hyresvärden." },
  { id: "andrahand", title: "Andrahand", text: "Hyr av någon som har förstahand." },
  { id: "inneboende", title: "Inneboende", text: "Eget rum i någon annans bostad." },
  { id: "foraldrar", title: "Hos föräldrar", text: "Folkbokförd eller tillfälligt." },
  { id: "annat", title: "Annat", text: "Till exempel hus, utomlands eller utan fast adress." },
] as const;

export const DOCUMENTS: { key: "contract" | "payslips" | "personbevis"; title: string; why: string }[] = [
  {
    key: "contract",
    title: "Anställningsavtal",
    why: "Visar att inkomsten fortsätter. Ett foto eller en PDF räcker.",
  },
  {
    key: "payslips",
    title: "Tre senaste lönespecifikationerna",
    why: "Hyresvärden stämmer av beloppet mot det du angett.",
  },
  {
    key: "personbevis",
    title: "Personbevis",
    why: "Bekräftar vilka som ingår i hushållet. Beställs hos Skatteverket.",
  },
];

const WEIGHTS: { id: string; label: string; step: string; weight: number; ok: (profile: Profile) => boolean }[] = [
  { id: "occupation", label: "Yrke", step: "arbete", weight: 8, ok: (p) => p.occupation.trim().length > 1 },
  { id: "employer", label: "Arbetsgivare", step: "arbete", weight: 8, ok: (p) => p.employer.trim().length > 1 },
  { id: "employment", label: "Anställningsform", step: "arbete", weight: 8, ok: (p) => p.employmentType !== "" },
  { id: "income", label: "Månadsinkomst", step: "inkomst", weight: 18, ok: (p) => (p.monthlyIncome ?? 0) > 0 },
  { id: "household", label: "Hushåll", step: "hushall", weight: 8, ok: (p) => p.adults > 0 },
  { id: "housing", label: "Nuvarande boende", step: "boende", weight: 8, ok: (p) => p.housingType !== "" },
  { id: "letter", label: "Personligt brev", step: "brev", weight: 14, ok: (p) => p.letter.trim().length >= 80 },
  { id: "contract", label: "Anställningsavtal", step: "dokument", weight: 10, ok: (p) => Boolean(p.documents.contract) },
  { id: "payslips", label: "Lönespecifikationer", step: "dokument", weight: 12, ok: (p) => Boolean(p.documents.payslips) },
  { id: "personbevis", label: "Personbevis", step: "dokument", weight: 6, ok: (p) => Boolean(p.documents.personbevis) },
];

export function completeness(profile: Profile) {
  const got = WEIGHTS.reduce((sum, item) => sum + (item.ok(profile) ? item.weight : 0), 0);
  return {
    score: got,
    missing: WEIGHTS.filter((item) => !item.ok(profile)).map((item) => ({
      id: item.id,
      label: item.label,
      step: item.step,
    })),
  };
}

export function emptyProfile(): Profile {
  return {
    occupation: "",
    employer: "",
    employmentType: "",
    monthlyIncome: null,
    adults: 1,
    children: 0,
    housingType: "",
    currentCity: "",
    letter: "",
    phone: "",
    documents: { contract: null, payslips: null, personbevis: null },
  };
}

export type MatchLine = { tone: "ok" | "warn" | "muted"; text: string };

const REQUIREMENT_LABEL: Record<Requirement, string> = {
  contract: "anställningsavtal",
  payslips: "lönespecifikationer",
  personbevis: "personbevis",
  letter: "personligt brev",
};

export function assess(listing: Listing, profile: Profile | null) {
  if (!profile || !profile.monthlyIncome) {
    return {
      ready: false,
      incomeOk: null as boolean | null,
      requiredIncome: listing.rent * listing.incomeMultiple,
      missing: [] as string[],
      lines: [{ tone: "muted" as const, text: "Fyll i inkomst för att se matchning" }],
    };
  }

  const requiredIncome = listing.rent * listing.incomeMultiple;
  const incomeOk = profile.monthlyIncome >= requiredIncome;
  const missing = listing.requires.filter((key) => {
    if (key === "letter") return profile.letter.trim().length < 80;
    return !profile.documents[key];
  });

  const lines: MatchLine[] = [];
  lines.push(
    incomeOk
      ? { tone: "ok", text: "Du uppfyller inkomstkravet" }
      : { tone: "warn", text: `Inkomstkrav ${kr(requiredIncome)}` },
  );
  if (missing.length) {
    lines.push({
      tone: "warn",
      text: `Saknas: ${missing.map((key) => REQUIREMENT_LABEL[key]).join(", ")}`,
    });
  }

  return {
    ready: incomeOk && missing.length === 0,
    incomeOk,
    requiredIncome,
    missing: missing.map((key) => REQUIREMENT_LABEL[key]),
    lines,
  };
}

export function passesFilters(listing: Listing, filters: Filters, sources: Source[]) {
  if (!listing.active) return false;
  const source = sources.find((item) => item.id === listing.sourceId);
  if (source && !source.enabled) return false;
  if (filters.areas.length > 0 && !filters.areas.includes(listing.area)) return false;
  if (listing.rent > filters.maxRent) return false;
  if (filters.minSqm > 0 && listing.sqm < filters.minSqm) return false;
  if (filters.minFloor > 0 && listing.floor < filters.minFloor) return false;
  if (filters.rooms === "5+" && listing.rooms < 5) return false;
  if (filters.rooms !== "any" && filters.rooms !== "5+" && listing.rooms !== Number(filters.rooms)) return false;
  if (filters.moveIn && listing.moveIn && listing.moveIn > filters.moveIn) return false;
  return true;
}

export function queueAlert(queue: Queue) {
  const soon = (iso: string | null, within: number) => {
    if (!iso) return null;
    const target = new Date(`${iso}T12:00:00`).getTime();
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const days = Math.round((target - today.getTime()) / 86400000);
    if (days > within) return null;
    return days;
  };

  const feeDays = soon(queue.feeDue, 21);
  if (feeDays !== null && queue.feeKr) {
    const kept = queue.days ? `${new Intl.NumberFormat("sv-SE").format(queue.days)} ködagar` : "din kötid";
    return {
      level: feeDays <= 7 ? ("urgent" as const) : ("soon" as const),
      text:
        feeDays < 0
          ? `Årsavgiften förföll ${queue.feeDue}. Betala den innan ${kept} nollställs.`
          : `Betala ${kr(queue.feeKr)} senast ${queue.feeDue ? new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long" }).format(new Date(`${queue.feeDue}T12:00:00`)) : ""}. Annars nollställs ${kept}.`,
    };
  }

  const renewDays = soon(queue.renewDue, 21);
  if (renewDays !== null) {
    const kept = queue.days ? `${new Intl.NumberFormat("sv-SE").format(queue.days)} ködagar` : "din plats";
    return {
      level: renewDays <= 7 ? ("urgent" as const) : ("soon" as const),
      text: `Förnya kön senast ${new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long" }).format(new Date(`${queue.renewDue}T12:00:00`))} för att behålla ${kept}.`,
    };
  }

  return null;
}

export function queuePlace(queue: Queue, autoOn: boolean) {
  const last = queue.lastRenewed || queue.since;
  const next = queue.nextRenewal || queue.renewDue || last;
  const ago = -daysFromToday(last);
  const until = daysFromToday(next);
  const renewed = ago <= 0 ? "idag" : ago === 1 ? "igår" : `för ${ago} dagar sedan`;
  const upcoming = until <= 0 ? "idag" : `om ${until} dagar`;
  const active = `Aktiv – senast förnyad ${renewed}, nästa förnyelse ${upcoming}`;

  if (queue.block === "fee") {
    return {
      secured: false,
      badge: "Betala årsavgift",
      status: `Avgift krävs – senast förnyad ${renewed}`,
      detail: "Automatiken kan inte betala åt dig. Betala årsavgiften så står kön kvar.",
    };
  }
  if (queue.block === "bankid") {
    return {
      secured: false,
      badge: "BankID behövs",
      status: `Väntar på dig – förnyelse ${upcoming}`,
      detail: "Den här kön ber om BankID. Det godkänner du själv på mobilen. Blixtbo ser inte legitimeringen och kan inte göra steget åt dig.",
    };
  }
  if (!autoOn) {
    return {
      secured: false,
      badge: "Manuell",
      status: `Nästa förnyelse ${upcoming}`,
      detail: "Automatiken är av. Logga in och förnya själv innan datumet.",
    };
  }
  return {
    secured: true,
    badge: "Din plats är säkrad",
    status: active,
    detail: "Blixtbo loggar in och bekräftar intresset åt dig.",
  };
}

export const CITIES: { city: string; areas: string[] }[] = [
  {
    city: "Stockholm",
    areas: ["Södermalm", "Vasastan", "Kungsholmen", "Hammarby Sjöstad", "Solna", "Sundbyberg"],
  },
  { city: "Göteborg", areas: ["Majorna", "Linné", "Lindholmen"] },
  { city: "Malmö", areas: ["Möllevången", "Västra Hamnen", "Limhamn"] },
  { city: "Uppsala", areas: ["Luthagen"] },
];

export const ALL_AREAS = CITIES.flatMap((city) => city.areas.map((area) => ({ city: city.city, area })));

export function cityForArea(area: string) {
  return ALL_AREAS.find((item) => item.area === area)?.city ?? "";
}
