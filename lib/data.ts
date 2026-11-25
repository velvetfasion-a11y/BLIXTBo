import { addDays, atHour, hoursAgo, minutesAgo } from "@/lib/format";
import { emptyProfile } from "@/lib/profile";
import type {
  Application,
  Connection,
  DirectoryUser,
  Filters,
  Listing,
  Notice,
  Persisted,
  Profile,
  Push,
  Queue,
  Source,
  User,
} from "@/lib/types";

const photo = (id: string) => `/photos/${id}.jpg`;

type SeedListing = Omit<Listing, "publishedAt" | "deadlineAt">;

const LISTINGS: SeedListing[] = [
  {
    id: "sundbyberg",
    address: "Järnvägsgatan 12",
    area: "Sundbyberg",
    city: "Stockholm",
    rent: 11840,
    sqm: 58,
    rooms: 2,
    floor: 3,
    floors: 6,
    moveIn: "2026-03-01",
    ageMinutes: 3,
    deadlineHours: null,
    sourceId: "homeq",
    photos: [photo("17"), photo("01")],
    title: "Två rum nära stationen",
    description:
      "Ny på marknaden. Två rum med kvällssol, hiss från gatan och tvättstuga på gården. Köket är från 2019 med induktionshäll.",
    near: "3 min gång till Sundbybergs station",
    features: ["Hiss", "Tvättstuga", "Induktionshäll"],
    requires: ["contract", "payslips", "letter"],
    incomeMultiple: 3,
    active: true,
  },
  {
    id: "blekinge",
    address: "Blekingegatan 42",
    area: "Södermalm",
    city: "Stockholm",
    rent: 12450,
    sqm: 54,
    rooms: 2,
    floor: 3,
    floors: 5,
    moveIn: "2026-03-01",
    ageMinutes: 11,
    deadlineHours: null,
    sourceId: "homeq",
    photos: [photo("01"), photo("04")],
    title: "Två rum mot lugn gård",
    description:
      "Tre trappor utan hiss, fönster mot en tyst innergård. Köket renoverades 2022 och har diskmaskin. Badrummet är äldre men helt.",
    near: "6 min gång till Medborgarplatsen",
    features: ["Balkong", "Diskmaskin", "Gård"],
    requires: ["contract", "payslips", "letter"],
    incomeMultiple: 3,
    active: true,
  },
  {
    id: "asogatan",
    address: "Åsögatan 140",
    area: "Södermalm",
    city: "Stockholm",
    rent: 13200,
    sqm: 51,
    rooms: 2,
    floor: 1,
    floors: 5,
    moveIn: "2026-03-15",
    ageMinutes: 28,
    deadlineHours: 8,
    sourceId: "stena",
    photos: [photo("13"), photo("15")],
    title: "Två rum i gatuplan mot gård",
    description:
      "Stena tar emot ansökningar till klockan i kväll. Lägenheten ligger mot gården, med sovalkov och ett rymligt kök. Ingen hiss.",
    near: "5 min gång till Medborgarplatsen",
    features: ["Gård", "Diskmaskin"],
    requires: ["contract", "payslips", "letter"],
    incomeMultiple: 3,
    active: true,
  },
  {
    id: "solna",
    address: "Solnavägen 20",
    area: "Solna",
    city: "Stockholm",
    rent: 10950,
    sqm: 46,
    rooms: 2,
    floor: 7,
    floors: 12,
    moveIn: "2026-02-15",
    ageMinutes: 46,
    deadlineHours: null,
    sourceId: "heimstaden",
    photos: [photo("08"), photo("03")],
    title: "Högt upp med kvällssol",
    description:
      "Enkel men nymålad tvåa på sjunde våningen. Hiss hela vägen upp. Fönster i två väderstreck och en garderobsvägg i sovrummet.",
    near: "8 min till Solna centrum",
    features: ["Hiss", "Förråd"],
    requires: ["contract", "payslips", "letter"],
    incomeMultiple: 3,
    active: true,
  },
  {
    id: "karlberg",
    address: "Karlbergsvägen 18",
    area: "Vasastan",
    city: "Stockholm",
    rent: 14180,
    sqm: 48,
    rooms: 2,
    floor: 4,
    floors: 6,
    moveIn: "2026-02-01",
    ageMinutes: 74,
    deadlineHours: null,
    sourceId: "wahlin",
    photos: [photo("03"), photo("08")],
    title: "Ljust hörnrum i Vasastan",
    description:
      "Hiss i porten och fönster åt två håll. Vardagsrummet rymmer ett matbord för fyra. Tvättstuga i källaren, bokas i porten.",
    near: "4 min gång till Odenplan",
    features: ["Hiss", "Tvättstuga"],
    requires: ["contract", "payslips", "letter"],
    incomeMultiple: 3,
    active: true,
  },
  {
    id: "hammarby",
    address: "Hammarby Allé 44",
    area: "Hammarby Sjöstad",
    city: "Stockholm",
    rent: 15690,
    sqm: 72,
    rooms: 3,
    floor: 5,
    floors: 8,
    moveIn: "2026-04-01",
    ageMinutes: 95,
    deadlineHours: null,
    sourceId: "wallenstam",
    photos: [photo("02"), photo("10")],
    title: "Tre rum med balkong mot kanalen",
    description:
      "Balkong i söder, hiss och förråd i källaren. Wallenstam vill ha personbevis för alla som ska bo i lägenheten, även vuxna utan inkomst.",
    near: "4 min gång till Tvärbanan, Luma",
    features: ["Hiss", "Balkong", "Diskmaskin", "Förråd"],
    requires: ["contract", "payslips", "personbevis", "letter"],
    incomeMultiple: 3,
    active: true,
  },
  {
    id: "fleming",
    address: "Fleminggatan 62",
    area: "Kungsholmen",
    city: "Stockholm",
    rent: 16850,
    sqm: 69,
    rooms: 3,
    floor: 5,
    floors: 7,
    moveIn: "2026-05-01",
    ageMinutes: 180,
    deadlineHours: null,
    sourceId: "wahlin",
    photos: [photo("05"), photo("06")],
    title: "Tre rum med balkong mot gård",
    description:
      "Renoverad trea på Kungsholmen. Hyran ligger högt och inkomstkravet följer med: tre gånger hyran i bruttoinkomst per månad.",
    near: "6 min gång till Fridhemsplan",
    features: ["Hiss", "Balkong", "Diskmaskin"],
    requires: ["contract", "payslips", "letter"],
    incomeMultiple: 3,
    active: true,
  },
  {
    id: "heleneborg",
    address: "Heleneborgsgatan 9",
    area: "Södermalm",
    city: "Stockholm",
    rent: 9750,
    sqm: 32,
    rooms: 1,
    floor: 2,
    floors: 4,
    moveIn: "2026-01-15",
    ageMinutes: 210,
    deadlineHours: null,
    sourceId: "heimstaden",
    photos: [photo("19"), photo("06")],
    title: "Ett rum och kök mot gatan",
    description:
      "Liten lägenhet för en person. Kokvrå med två plattor, duschrum och ett klädskåp i hallen. Två trappor, ingen hiss.",
    near: "8 min gång till Hornstull",
    features: ["Gård"],
    requires: ["contract", "payslips", "letter"],
    incomeMultiple: 3,
    active: true,
  },
  {
    id: "norrbacka",
    address: "Norrbackagatan 22",
    area: "Vasastan",
    city: "Stockholm",
    rent: 18900,
    sqm: 84,
    rooms: 3,
    floor: 2,
    floors: 5,
    moveIn: "2026-04-01",
    ageMinutes: 400,
    deadlineHours: 30,
    sourceId: "akelius",
    photos: [photo("10"), photo("16")],
    title: "Stor trea med öppen planlösning",
    description:
      "Akelius högsta hyra i den här omgången. Öppet kök, två sovrum och en klädkammare. Inkomstkravet är tre gånger hyran.",
    near: "5 min gång till S:t Eriksplan",
    features: ["Hiss", "Diskmaskin", "Förråd"],
    requires: ["contract", "payslips", "personbevis", "letter"],
    incomeMultiple: 3,
    active: true,
  },
  {
    id: "majorna",
    address: "Amiralitetsgatan 18",
    area: "Majorna",
    city: "Göteborg",
    rent: 10250,
    sqm: 55,
    rooms: 2,
    floor: 2,
    floors: 4,
    moveIn: "2026-03-01",
    ageMinutes: 320,
    deadlineHours: null,
    sourceId: "qasa",
    photos: [photo("04"), photo("19")],
    title: "Två rum med balkong i Majorna",
    description:
      "Trägolv, balkong mot gården och en lång hall med förvaring. Qasa förmedlar förstahandskontraktet. Ingen hiss.",
    near: "7 min gång till Stigbergstorget",
    features: ["Balkong", "Gård"],
    requires: ["contract", "payslips", "letter"],
    incomeMultiple: 3,
    active: true,
  },
  {
    id: "linne",
    address: "Linnégatan 48",
    area: "Linné",
    city: "Göteborg",
    rent: 12100,
    sqm: 61,
    rooms: 3,
    floor: 4,
    floors: 5,
    moveIn: "2026-02-01",
    ageMinutes: 60 * 26,
    deadlineHours: null,
    sourceId: "heimstaden",
    photos: [photo("15"), photo("13")],
    title: "Trea högst upp i Linné",
    description:
      "Tre rum i en sekelskiftesfastighet. Fjärde våningen utan hiss, men takhöjd och två garderober. Köket vetter mot gatan.",
    near: "3 min gång till Linnégatan",
    features: ["Gård"],
    requires: ["contract", "payslips", "letter"],
    incomeMultiple: 3,
    active: true,
  },
  {
    id: "luthagen",
    address: "Luthagsesplanaden 12",
    area: "Luthagen",
    city: "Uppsala",
    rent: 9650,
    sqm: 57,
    rooms: 2,
    floor: 3,
    floors: 4,
    moveIn: "2026-04-01",
    ageMinutes: 64,
    deadlineHours: null,
    sourceId: "homeq",
    photos: [photo("04"), photo("01")],
    title: "Två rum vid Luthagsesplanaden",
    description:
      "Lugn gata, balkong i väster och ett separat sovrum. HomeQ samlar ansökningarna. Först till kvarn bland kompletta profiler.",
    near: "10 min cykel till Uppsala central",
    features: ["Balkong", "Förråd"],
    requires: ["contract", "payslips", "letter"],
    incomeMultiple: 3,
    active: true,
  },
  {
    id: "hamnen",
    address: "Sundspromenaden 7",
    area: "Västra Hamnen",
    city: "Malmö",
    rent: 13400,
    sqm: 66,
    rooms: 3,
    floor: 8,
    floors: 12,
    moveIn: "2026-05-01",
    ageMinutes: 60 * 20,
    deadlineHours: null,
    sourceId: "stena",
    photos: [photo("16"), photo("02")],
    title: "Trea med utsikt mot sundet",
    description:
      "Hiss, balkong och ett kök mot vardagsrummet. Stena vill ha samma underlag som övriga privata värdar: avtal, lön och brev.",
    near: "6 min gång till Dockan",
    features: ["Hiss", "Balkong", "Diskmaskin"],
    requires: ["contract", "payslips", "letter"],
    incomeMultiple: 3,
    active: true,
  },
  {
    id: "limhamn",
    address: "Sibbarpsvägen 4",
    area: "Limhamn",
    city: "Malmö",
    rent: 11900,
    sqm: 70,
    rooms: 3,
    floor: 2,
    floors: 3,
    moveIn: "2026-06-15",
    ageMinutes: 130,
    deadlineHours: null,
    sourceId: "heimstaden",
    photos: [photo("13"), photo("05")],
    title: "Trea med uteplats i Limhamn",
    description:
      "Marklägenhet är det inte, men balkongen är djup och gården är grön. Inflytt först i juni. Hissen stannar på våning 2.",
    near: "12 min cykel till Limhamn station",
    features: ["Hiss", "Balkong", "Gård"],
    requires: ["contract", "payslips", "letter"],
    incomeMultiple: 3,
    active: true,
  },
  {
    id: "gotgatan",
    address: "Götgatan 78",
    area: "Södermalm",
    city: "Stockholm",
    rent: 10420,
    sqm: 34,
    rooms: 1,
    floor: 3,
    floors: 6,
    moveIn: "2026-01-01",
    ageMinutes: 60 * 24 * 3,
    deadlineHours: null,
    sourceId: "bostadsformedlingen",
    photos: [photo("06"), photo("19")],
    title: "Ett rum via bostadskön",
    description:
      "En etta som förmedlats genom Bostadsförmedlingen. Erbjudandet ligger kvar en kort tid. Hiss finns, fönster mot gatan.",
    near: "2 min gång till Medborgarplatsen",
    features: ["Hiss"],
    requires: ["contract", "payslips", "letter"],
    incomeMultiple: 3,
    active: true,
  },
  {
    id: "lindholmen",
    address: "Lindholmsallén 12",
    area: "Lindholmen",
    city: "Göteborg",
    rent: 11350,
    sqm: 60,
    rooms: 2,
    floor: 6,
    floors: 8,
    moveIn: "2026-02-01",
    ageMinutes: 60 * 30,
    deadlineHours: null,
    sourceId: "qasa",
    photos: [photo("05"), photo("10")],
    title: "Två rum på Lindholmen",
    description:
      "Hiss och balkong mot innergården. Visning bokas när hyresvärden vill träffa de som hunnit ansöka tidigt.",
    near: "4 min gång till Lindholmens spårvagn",
    features: ["Hiss", "Balkong"],
    requires: ["contract", "payslips", "letter"],
    incomeMultiple: 3,
    active: true,
  },
  {
    id: "folkunga",
    address: "Folkungagatan 88",
    area: "Södermalm",
    city: "Stockholm",
    rent: 13640,
    sqm: 63,
    rooms: 3,
    floor: 4,
    floors: 6,
    moveIn: "2026-03-01",
    ageMinutes: 60 * 8,
    deadlineHours: null,
    sourceId: "heimstaden",
    photos: [photo("10"), photo("02")],
    title: "Trea på Folkungagatan",
    description:
      "Tre rum med balkong mot gården och ett kök som rymmer ett bord. Heimstaden har tagit emot ansökan och har inte svarat ännu.",
    near: "7 min gång till Medborgarplatsen",
    features: ["Hiss", "Balkong", "Diskmaskin"],
    requires: ["contract", "payslips", "letter"],
    incomeMultiple: 3,
    active: true,
  },
  {
    id: "amirals",
    address: "Amiralsgatan 19",
    area: "Möllevången",
    city: "Malmö",
    rent: 8900,
    sqm: 49,
    rooms: 2,
    floor: 1,
    floors: 4,
    moveIn: "2026-01-01",
    ageMinutes: 60 * 24 * 18,
    deadlineHours: null,
    sourceId: "akelius",
    photos: [photo("15"), photo("04")],
    title: "Två rum vid Möllevångstorget",
    description:
      "En tvåa i gatuplan som redan är tillsatt. Ansökan nekades för att hyresvärden valde ett annat hushåll.",
    near: "1 min gång till Möllevångstorget",
    features: ["Gård"],
    requires: ["contract", "payslips", "letter"],
    incomeMultiple: 3,
    active: true,
  },
];

export const SOURCE_SEED: Omit<Source, "enabled">[] = [
  { id: "homeq", name: "HomeQ", kind: "Portal", blurb: "Köfri portal för privata hyresvärdar.", syncMin: 2, health: "ok", requiresBankId: false },
  { id: "wahlin", name: "Wåhlin", kind: "Hyresvärd", blurb: "Bostäder i Stockholm, egen ansökan.", syncMin: 6, health: "ok", requiresBankId: true },
  { id: "heimstaden", name: "Heimstaden", kind: "Hyresvärd", blurb: "Lägenheter i flera städer.", syncMin: 11, health: "ok", requiresBankId: false },
  { id: "akelius", name: "Akelius", kind: "Hyresvärd", blurb: "Centrala lägenheter och egen kö.", syncMin: 190, health: "delayed", requiresBankId: false },
  { id: "qasa", name: "Qasa", kind: "Portal", blurb: "Förstahandskontrakt via Qasa.", syncMin: 4, health: "ok", requiresBankId: false },
  { id: "bostadsformedlingen", name: "Bostadsförmedlingen", kind: "Kommunal kö", blurb: "Stockholms stads bostadskö.", syncMin: 18, health: "ok", requiresBankId: true },
  { id: "boplats", name: "Boplats Göteborg", kind: "Kommunal kö", blurb: "Göteborgs bostadskö.", syncMin: 27, health: "ok", requiresBankId: true },
  { id: "boplatssyd", name: "Boplats Syd", kind: "Kommunal kö", blurb: "Malmö och sydvästra Skåne.", syncMin: 35, health: "ok", requiresBankId: true },
  { id: "uppsala", name: "Uppsala Bostadsförmedling", kind: "Kommunal kö", blurb: "Kommunal kö i Uppsala.", syncMin: 60 * 9, health: "delayed", requiresBankId: true },
  { id: "wallenstam", name: "Wallenstam", kind: "Hyresvärd", blurb: "Egna bostäder, ofta via HomeQ.", syncMin: 9, health: "ok", requiresBankId: false },
  { id: "stena", name: "Stena Fastigheter", kind: "Hyresvärd", blurb: "Bostäder i storstäderna.", syncMin: 15, health: "ok", requiresBankId: true },
];

export const DIRECTORY: DirectoryUser[] = [
  { id: "u-anna", name: "Anna Lindström", email: "anna.lindstrom@mail.com", city: "Stockholm", completeness: 94, applications: 4, queues: 5, queueWarning: true, joined: "2026-08-12", missing: "Personbevis" },
  { id: "u-elias", name: "Elias Berg", email: "elias.berg@mail.com", city: "Stockholm", completeness: 100, applications: 2, queues: 2, queueWarning: false, joined: "2026-06-02", missing: "Inget" },
  { id: "u-nora", name: "Nora Holm", email: "nora.holm@mail.com", city: "Göteborg", completeness: 72, applications: 1, queues: 1, queueWarning: false, joined: "2026-10-19", missing: "Lönespecifikationer" },
  { id: "u-samir", name: "Samir Haddad", email: "samir.haddad@mail.com", city: "Malmö", completeness: 61, applications: 0, queues: 1, queueWarning: true, joined: "2026-09-30", missing: "Brev och avtal" },
  { id: "u-freja", name: "Freja Nilsson", email: "freja.nilsson@mail.com", city: "Uppsala", completeness: 100, applications: 3, queues: 1, queueWarning: true, joined: "2026-04-11", missing: "Inget" },
  { id: "u-leo", name: "Leo Andersson", email: "leo.andersson@mail.com", city: "Stockholm", completeness: 40, applications: 0, queues: 0, queueWarning: false, joined: "2026-11-20", missing: "Nästan hela profilen" },
  { id: "u-mira", name: "Mira Ek", email: "mira.ek@mail.com", city: "Göteborg", completeness: 88, applications: 2, queues: 1, queueWarning: false, joined: "2026-07-08", missing: "Personbevis" },
  { id: "u-jon", name: "Jon Persson", email: "jon.persson@mail.com", city: "Stockholm", completeness: 100, applications: 5, queues: 3, queueWarning: false, joined: "2025-12-01", missing: "Inget" },
];

export const SEGMENTS = [
  { id: "alla", label: "Alla användare" },
  { id: "stockholm", label: "Stockholm" },
  { id: "goteborg", label: "Göteborg" },
  { id: "malmo", label: "Malmö" },
  { id: "ofullstandig", label: "Ofullständig profil" },
  { id: "varning", label: "Kö med varning" },
  { id: "aktiva", label: "Har ansökt" },
] as const;

export type SegmentId = (typeof SEGMENTS)[number]["id"];

export const defaultFilters: Filters = {
  areas: [],
  maxRent: 20000,
  rooms: "any",
  minSqm: 0,
  minFloor: 0,
  moveIn: "",
};

const demoFilters: Filters = {
  areas: ["Södermalm", "Vasastan", "Kungsholmen", "Hammarby Sjöstad", "Solna", "Sundbyberg"],
  maxRent: 17000,
  rooms: "any",
  minSqm: 30,
  minFloor: 0,
  moveIn: "",
};

function stamp(listings: SeedListing[], now: number): Listing[] {
  return listings.map((listing) => ({
    ...listing,
    publishedAt: new Date(now - listing.ageMinutes * 60000).toISOString(),
    deadlineAt:
      listing.deadlineHours == null ? null : new Date(now + listing.deadlineHours * 3600000).toISOString(),
  }));
}

function blankConnections(): Record<string, Connection> {
  return Object.fromEntries(
    SOURCE_SEED.map((source) => [source.id, { sourceId: source.id, status: "none" as const }]),
  );
}

function sources(): Source[] {
  return SOURCE_SEED.map((source) => ({ ...source, enabled: true }));
}

const DEMO_LETTER =
  "Vi är Anna och Elias, båda tillsvidareanställda i Stockholm. Jag är produktdesigner och Elias arbetar som sjuksköterska. Vi söker en lugn lägenhet med plats för ett hemmakontor, betalar hyran i tid och sköter om bostaden. Inflytt kan ske med kort varsel.";

function demoProfile(now: number): Profile {
  return {
    occupation: "Produktdesigner",
    employer: "Studio Nord",
    employmentType: "tillsvidare",
    monthlyIncome: 48500,
    adults: 2,
    children: 0,
    housingType: "andrahand",
    currentCity: "Stockholm",
    letter: DEMO_LETTER,
    phone: "070-418 22 60",
    documents: {
      contract: { name: "anstallningsavtal-studio-nord.pdf", addedAt: hoursAgo(24 * 20, now) },
      payslips: { name: "lonespec-aug-okt.pdf", addedAt: hoursAgo(24 * 20, now) },
      personbevis: null,
    },
  };
}

function connected(ids: string[], email: string, now: number): Record<string, Connection> {
  const all = blankConnections();
  for (const id of ids) {
    all[id] = { sourceId: id, status: "connected", email, connectedAt: hoursAgo(24 * 12, now) };
  }
  return all;
}

export function queueForSource(sourceId: string, now = Date.now()): Queue | null {
  if (sourceId === "bostadsformedlingen") {
    return {
      id: "q-bf",
      sourceId,
      name: "Bostadsförmedlingen",
      city: "Stockholm",
      days: 1,
      points: null,
      since: addDays(0, now),
      feeKr: 250,
      feeDue: addDays(365, now),
      renewDue: null,
      lastRenewed: addDays(0, now),
      nextRenewal: addDays(30, now),
      block: null,
    };
  }
  if (sourceId === "boplats") {
    return {
      id: "q-boplats",
      sourceId,
      name: "Boplats Göteborg",
      city: "Göteborg",
      days: 1,
      points: null,
      since: addDays(0, now),
      feeKr: 200,
      feeDue: addDays(365, now),
      renewDue: null,
      lastRenewed: addDays(0, now),
      nextRenewal: addDays(30, now),
      block: null,
    };
  }
  if (sourceId === "boplatssyd") {
    return {
      id: "q-syd",
      sourceId,
      name: "Boplats Syd",
      city: "Malmö",
      days: 1,
      points: null,
      since: addDays(0, now),
      feeKr: 250,
      feeDue: null,
      renewDue: addDays(365, now),
      lastRenewed: addDays(0, now),
      nextRenewal: addDays(30, now),
      block: null,
    };
  }
  if (sourceId === "uppsala") {
    return {
      id: "q-uppsala",
      sourceId,
      name: "Uppsala Bostadsförmedling",
      city: "Uppsala",
      days: 1,
      points: null,
      since: addDays(0, now),
      feeKr: null,
      feeDue: null,
      renewDue: addDays(365, now),
      lastRenewed: addDays(0, now),
      nextRenewal: addDays(30, now),
      block: null,
    };
  }
  return null;
}

export function createLoggedOut(now = Date.now()): Persisted {
  return {
    version: 1,
    user: null,
    filters: defaultFilters,
    connections: blankConnections(),
    applications: [],
    queues: [],
    notifications: [],
    dismissed: [],
    listings: stamp(LISTINGS, now),
    sources: sources(),
    pushes: [
      {
        id: "p-seed",
        title: "En tvåa dök upp på Södermalm",
        body: "Blekingegatan 42, 12 450 kr. Öppna Blixtbo om profilen är redo.",
        segment: "stockholm",
        sentAt: hoursAgo(26, now),
        recipients: 4,
      },
    ],
    directory: DIRECTORY,
    prefs: { newListings: true, fees: true, status: true, keepQueues: true },
  };
}

export function createDemo(now = Date.now()): Persisted {
  const base = createLoggedOut(now);
  const email = "anna.lindstrom@mail.com";
  const user: User = {
    name: "Anna Lindström",
    email,
    method: "google",
    demo: true,
    createdAt: "2026-08-12T08:00:00.000Z",
    profile: demoProfile(now),
  };

  const applications: Application[] = [
    {
      id: "app-gotgatan",
      listingId: "gotgatan",
      status: "erbjuden",
      appliedAt: hoursAgo(50, now),
      eventAt: hoursAgo(20, now),
      position: 4,
      minutesAfterPublish: 26,
      note: "Hyresvärden har valt ditt hushåll. Svara i tid, annars går bostaden vidare.",
      respondBy: new Date(now + 90 * 60 * 1000).toISOString(),
      viewingAt: atHour(1, 18, 0, now),
      viewingBooked: true,
      contractStart: "2026-02-01",
      depositKr: 10420,
      nextSteps: ["Skriv under kontraktet", "Betala depositionen, 10 420 kr"],
      affectsQueue: true,
    },
    {
      id: "app-lindholmen",
      listingId: "lindholmen",
      status: "visning",
      appliedAt: hoursAgo(30, now),
      eventAt: hoursAgo(6, now),
      position: 2,
      minutesAfterPublish: 14,
      note: "Visning bokad. Ta med legitimation.",
      viewingAt: atHour(2, 18, 30, now),
    },
    {
      id: "app-folkunga",
      listingId: "folkunga",
      status: "skickad",
      appliedAt: hoursAgo(5, now),
      eventAt: hoursAgo(5, now),
      position: 6,
      minutesAfterPublish: 41,
      note: "Ansökan ligger hos Heimstaden. Inget besked ännu.",
    },
    {
      id: "app-amirals",
      listingId: "amirals",
      status: "nekad",
      appliedAt: hoursAgo(24 * 12, now),
      eventAt: hoursAgo(24 * 9, now),
      position: 11,
      minutesAfterPublish: 180,
      note: "Hyresvärden valde ett annat hushåll.",
    },
  ];

  const listings = base.listings.map((listing) => {
    const application = applications.find((item) => item.listingId === listing.id);
    if (!application) return listing;
    const applied = new Date(application.appliedAt).getTime();
    return {
      ...listing,
      publishedAt: new Date(applied - application.minutesAfterPublish * 60000).toISOString(),
    };
  });

  const queues: Queue[] = [
    {
      id: "q-bf",
      sourceId: "bostadsformedlingen",
      name: "Bostadsförmedlingen",
      city: "Stockholm",
      days: 1846,
      points: null,
      since: "2021-03-14",
      feeKr: 250,
      feeDue: addDays(17, now),
      renewDue: null,
      lastRenewed: addDays(-1, now),
      nextRenewal: addDays(23, now),
      block: "fee",
    },
    {
      id: "q-boplats",
      sourceId: "boplats",
      name: "Boplats Göteborg",
      city: "Göteborg",
      days: 642,
      points: null,
      since: "2024-09-02",
      feeKr: 200,
      feeDue: addDays(128, now),
      renewDue: null,
      lastRenewed: addDays(-1, now),
      nextRenewal: addDays(23, now),
      block: null,
    },
    {
      id: "q-syd",
      sourceId: "boplatssyd",
      name: "Boplats Syd",
      city: "Malmö",
      days: 218,
      points: null,
      since: "2025-12-18",
      feeKr: 250,
      feeDue: null,
      renewDue: addDays(48, now),
      lastRenewed: addDays(-4, now),
      nextRenewal: addDays(26, now),
      block: null,
    },
    {
      id: "q-uppsala",
      sourceId: "uppsala",
      name: "Uppsala Bostadsförmedling",
      city: "Uppsala",
      days: 96,
      points: null,
      since: "2026-08-20",
      feeKr: null,
      feeDue: null,
      renewDue: addDays(7, now),
      lastRenewed: addDays(-20, now),
      nextRenewal: addDays(2, now),
      block: "bankid",
    },
    {
      id: "q-wallenstam",
      sourceId: "wallenstam",
      name: "Wallenstam poängkö",
      city: "Stockholm",
      days: null,
      points: 28,
      since: "2025-06-01",
      feeKr: null,
      feeDue: null,
      renewDue: null,
      lastRenewed: addDays(-1, now),
      nextRenewal: addDays(89, now),
      block: null,
    },
  ];

  const notifications: Notice[] = [
    {
      id: "n-sund",
      kind: "listing",
      title: "Ny bostad på Järnvägsgatan",
      body: "2 rok i Sundbyberg, 11 840 kr. Du uppfyller inkomstkravet.",
      at: minutesAgo(4, now),
      read: false,
      href: "/bostad?id=sundbyberg",
    },
    {
      id: "n-visning",
      kind: "status",
      title: "Visning bokad",
      body: "Lindholmsallén 12, torsdag 18:30. Ta med legitimation.",
      at: hoursAgo(1, now),
      read: false,
      href: "/koll",
    },
    {
      id: "n-offer",
      kind: "status",
      title: "Grattis! Du har erbjudits Götgatan 78",
      body: "Svara senast i kväll. Visningen är bokad i morgon klockan 18:00.",
      at: minutesAgo(8, now),
      read: false,
      href: "/erbjudande?id=app-gotgatan",
      deadlineAt: new Date(now + 90 * 60 * 1000).toISOString(),
    },
    {
      id: "n-offer-2",
      kind: "status",
      title: "2 timmar kvar",
      body: "Götgatan 78. Erbjudandet går ut snart.",
      at: minutesAgo(30, now),
      read: false,
      href: "/erbjudande?id=app-gotgatan",
      deadlineAt: new Date(now + 90 * 60 * 1000).toISOString(),
    },
    {
      id: "n-offer-24",
      kind: "status",
      title: "24 timmar kvar",
      body: "Götgatan 78. Svara innan tiden går ut, annars går ettan vidare.",
      at: hoursAgo(22.5, now),
      read: true,
      href: "/erbjudande?id=app-gotgatan",
      deadlineAt: new Date(now + 90 * 60 * 1000).toISOString(),
    },
    {
      id: "n-fee",
      kind: "fee",
      title: "Årsavgift Bostadsförmedlingen",
      body: "250 kr förfaller om 17 dagar. Obetald avgift nollställer 1 846 ködagar.",
      at: hoursAgo(24 * 2, now),
      read: false,
      href: "/koll?flik=koer",
    },
    {
      id: "n-uppsala",
      kind: "queue",
      title: "Förnya Uppsala-kön",
      body: "Logga in senast om en vecka, annars försvinner 96 ködagar.",
      at: hoursAgo(24 * 5, now),
      read: true,
      href: "/koll?flik=koer",
    },
  ];

  return {
    ...base,
    user,
    filters: demoFilters,
    connections: connected(
      ["homeq", "wahlin", "heimstaden", "bostadsformedlingen", "boplats", "boplatssyd", "uppsala", "wallenstam"],
      email,
      now,
    ),
    applications,
    queues,
    notifications,
    listings,
  };
}

export function createFreshUser(input: { name: string; email: string; method: User["method"] }, now = Date.now()): User {
  return {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    method: input.method,
    demo: false,
    createdAt: new Date(now).toISOString(),
    profile: emptyProfile(),
  };
}

export function welcomeNotice(now = Date.now()): Notice {
  return {
    id: `n-welcome-${now}`,
    kind: "system",
    title: "Bevakningen är igång",
    body: "Vi hör av oss när en bostad matchar dina filter. Komplettera profilen så syns kraven på varje annons.",
    at: new Date(now).toISOString(),
    read: false,
    href: "/guide",
  };
}

export function segmentMatches(
  segment: string,
  person: { city: string; completeness: number; queueWarning: boolean; applications: number },
) {
  if (segment === "alla") return true;
  if (segment === "stockholm") return person.city === "Stockholm";
  if (segment === "goteborg") return person.city === "Göteborg";
  if (segment === "malmo") return person.city === "Malmö";
  if (segment === "ofullstandig") return person.completeness < 100;
  if (segment === "varning") return person.queueWarning;
  if (segment === "aktiva") return person.applications > 0;
  return false;
}

export function emptyPushDraft() {
  return { title: "", body: "", segment: "alla" };
}

export type { Push };
