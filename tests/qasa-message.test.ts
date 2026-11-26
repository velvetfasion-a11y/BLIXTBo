import assert from "node:assert/strict";
import test from "node:test";
import { draftQasaMessage, formatMoveIn, qasaListingUrl } from "../lib/qasa-message.ts";

const draft = draftQasaMessage({
  name: "Anna Lindström",
  occupation: "Produktdesigner",
  adults: 2,
  children: 1,
  letter: "Vi sköter om bostaden och betalar hyran i tid. Vi har inga husdjur.",
  moveIn: "2026-03-01",
  address: "Amiralitetsgatan 18",
  area: "Majorna",
  city: "Göteborg",
  rooms: 2,
  sqm: 55,
  rent: 10250,
});

test("draft uses the profile and the listing", () => {
  assert.match(draft, /Anna Lindström/);
  assert.match(draft, /Produktdesigner/);
  assert.match(draft, /två vuxna och ett barn/);
  assert.match(draft, /1 mars 2026/);
  assert.match(draft, /Amiralitetsgatan 18/);
  assert.match(draft, /Majorna/);
  assert.match(draft, /Göteborg/);
  assert.match(draft, /2 rum/);
  assert.match(draft, /55 m²/);
  assert.match(draft, /10\s250 kr/);
  assert.match(draft, /betalar hyran i tid/);
});

test("a missing letter still leaves a short presentation", () => {
  const text = draftQasaMessage({
    name: "",
    occupation: "",
    adults: 1,
    children: 0,
    letter: "",
    moveIn: "",
    address: "Torsgatan",
    area: "",
    city: "Stockholm",
    rooms: 1,
    sqm: 0,
    rent: 0,
  });
  assert.match(text, /Jag söker själv/);
  assert.match(text, /så snart det passar/);
  assert.match(text, /sköter om bostaden/);
  assert.doesNotMatch(text, /skickat automatiskt|vi skickar nu/i);
});

test("listing links stay on Qasa", () => {
  assert.equal(qasaListingUrl({ qasaId: "1506034" }), "https://qasa.se/se/sv/home/1506034");
  assert.equal(
    qasaListingUrl({ listingUrl: "https://qasa.com/se/sv/home/9", qasaId: "9" }),
    "https://qasa.com/se/sv/home/9",
  );
  assert.equal(qasaListingUrl({}), "https://qasa.se/se/sv/find-home");
});

test("dates stay in Swedish", () => {
  assert.equal(formatMoveIn("2026-12-15"), "15 december 2026");
  assert.equal(formatMoveIn(""), "");
});
