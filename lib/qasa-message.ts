/** Draft a Qasa message. The app never sends it. */

export type QasaDraftInput = {
  name: string;
  occupation: string;
  adults: number;
  children: number;
  letter: string;
  moveIn: string;
  address: string;
  area: string;
  city: string;
  rooms: number;
  sqm: number;
  rent: number;
};

const MONTHS = [
  "januari",
  "februari",
  "mars",
  "april",
  "maj",
  "juni",
  "juli",
  "augusti",
  "september",
  "oktober",
  "november",
  "december",
];

export function qasaListingUrl(listing: { listingUrl?: string; qasaId?: string }): string {
  const url = (listing.listingUrl || "").trim();
  if (/^https:\/\/([a-z0-9-]+\.)?qasa\.(se|com)\//i.test(url)) return url;
  if (listing.qasaId) return `https://qasa.se/se/sv/home/${encodeURIComponent(listing.qasaId)}`;
  return "https://qasa.se/se/sv/find-home";
}

export function draftQasaMessage(input: QasaDraftInput): string {
  const name = input.name.trim();
  const occupation = input.occupation.trim();
  const who = name ? `Jag heter ${name}.` : "Hej.";
  const work = occupation ? ` Jag arbetar som ${occupation}.` : "";
  const home = householdLine(input.adults, input.children);
  const when = moveInLine(input.moveIn);
  const place = placeLine(input);
  const about = shortPresentation(input.letter);
  const sign = name ? `\n\nVänliga hälsningar\n${name}` : "";
  return `${who}${work} ${home} ${when}\n\n${place}\n\n${about}${sign}`.replace(/[ ]+/g, " ").replace(/ \n/g, "\n").trim();
}

function householdLine(adults: number, children: number): string {
  const grown = Math.max(0, adults);
  const kids = Math.max(0, children);
  if (grown <= 1 && kids === 0) return "Jag söker själv.";
  const adultText = countWord(grown, "vuxen", "vuxna");
  if (kids === 0) return `Vi är ${adultText}.`;
  const childText = kids === 1 ? "ett barn" : countWord(kids, "barn", "barn");
  if (grown <= 1) return `Jag söker med ${childText}.`;
  return `Vi är ${adultText} och ${childText}.`;
}

function countWord(count: number, one: string, many: string): string {
  const words = ["noll", "en", "två", "tre", "fyra", "fem", "sex", "sju", "åtta", "nio"];
  const word = words[count] || String(count);
  return `${word} ${count === 1 ? one : many}`;
}

function moveInLine(value: string): string {
  const text = formatMoveIn(value);
  return text ? `Vi kan flytta in ${text}.` : "Vi kan flytta in så snart det passar.";
}

export function formatMoveIn(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return raw;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return raw;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

function placeLine(input: QasaDraftInput): string {
  const where = [input.address.trim(), input.area.trim(), input.city.trim()].filter(Boolean);
  const home = where.length ? where.join(", ") : "bostaden";
  const bits = [`Jag är intresserad av ${home}.`];
  if (input.rooms > 0) bits.push(`${input.rooms} rum.`);
  if (input.sqm > 0) bits.push(`${input.sqm} m².`);
  if (input.rent > 0) bits.push(`Hyra ${formatKr(input.rent)}.`);
  return bits.join(" ");
}

function shortPresentation(letter: string): string {
  const clean = letter.replace(/\s+/g, " ").trim();
  if (!clean) return "Jag sköter om bostaden och betalar hyran i tid.";
  const cut = clean.slice(0, 240);
  const end = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"));
  const text = (end > 40 ? cut.slice(0, end + 1) : cut).trim();
  return text;
}

function formatKr(value: number): string {
  return `${new Intl.NumberFormat("sv-SE").format(value)} kr`;
}
