export const DELETE_CONFIRMATION = "RADERA";

export type DeleteScope = "account" | "erasure" | "links";

export function confirmationMatches(value: string) {
  return value.trim() === DELETE_CONFIRMATION;
}

export function needsRecentLogin(detail: unknown) {
  if (detail === "recent-login-required") return true;
  if (typeof detail === "object" && detail && "code" in detail) {
    return (detail as { code?: unknown }).code === "auth/requires-recent-login";
  }
  return false;
}

export function apiDetail(data: unknown) {
  if (typeof data === "object" && data && "detail" in data) {
    const detail = (data as { detail: unknown }).detail;
    return typeof detail === "string" ? detail : "";
  }
  return "";
}

export type DeleteChoice = {
  id: DeleteScope;
  title: string;
  summary: string;
  removes: string[];
  keeps: string[];
  caution?: string;
};

export const DELETE_SCOPES: DeleteChoice[] = [
  {
    id: "account",
    title: "Radera bara Blixtbo-kontot",
    summary: "Kontot stängs och går inte att logga in på. Sådant som inte är själva kontot lämnas kvar.",
    removes: ["Namn, e-post och kopplingen till inloggningen i Blixtbo", "Möjligheten att öppna det här kontot", "Recensioner du lämnat i Blixtbo"],
    keeps: [
      "Profil, ansökningar, sparade sökningar och filter",
      "Meddelanden och notiser",
      "Sparade inloggningar hos hyresvärdar",
      "Loggar som pekar på dig",
      "Stripe-kund och betalunderlag",
      "Firebase-kontot, alltså Google, Apple eller e-post",
    ],
  },
  {
    id: "erasure",
    title: "Radera alla uppgifter om mig",
    summary: "Det här är radering enligt dataskyddsförordningen (GDPR). Vi tar bort det som går att koppla till dig.",
    removes: [
      "Profil, ansökningar, köer, svep och erbjudanden",
      "Recensioner du lämnat i Blixtbo",
      "Sparade sökningar och filter",
      "Meddelanden och notiser",
      "Sparade inloggningar hos hyresvärdar",
      "Loggar som pekar på dig",
      "Prenumerationen avslutas",
      "Stripe-kunden anonymiseras",
      "Firebase-kontot tas bort",
    ],
    keeps: [
      "Fakturor och andra betalunderlag hos Stripe. Bokföringslagen kräver att de sparas. De kopplas inte längre till ditt namn eller din e-post.",
    ],
  },
  {
    id: "links",
    title: "Koppla bort länkade konton",
    summary: "Blixtbo-kontot finns kvar. Inloggningar som appen har sparat hos andra tas bort.",
    removes: ["Sparade inloggningar hos hyresvärdar", "Kopplingen till Google och Apple"],
    keeps: ["Blixtbo-kontot, profilen, ansökningar, filter, meddelanden och recensioner", "Prenumerationen", "Loggar"],
    caution: "Om Google eller Apple är ditt enda sätt att logga in behöver du en ny inloggning nästa gång. Kontot och uppgifterna finns kvar.",
  },
];
