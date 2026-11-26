import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pickAutoPrompt, shouldAutoPrompt, type PromptApplication } from "../lib/review-prompt.ts";

const won: PromptApplication = { id: "app-1", status: "accepterad", eventAt: "2026-11-01T10:00:00.000Z", listingId: "home-1" };

test("Inte nu hides the prompt for this visit and allows one later prompt", () => {
  assert.equal(shouldAutoPrompt(0, false, false), true);
  assert.equal(shouldAutoPrompt(0, false, true), false);
  assert.equal(shouldAutoPrompt(1, false, false), true);
  assert.equal(shouldAutoPrompt(1, false, true), false);
  assert.equal(shouldAutoPrompt(2, false, false), false);
  assert.equal(shouldAutoPrompt(0, true, false), false);
});

test("only an accepted or signed application is prompted, and a review stops it", () => {
  const sent: PromptApplication = { ...won, id: "app-2", status: "skickad", eventAt: "2026-11-02T10:00:00.000Z" };
  const contract: PromptApplication = { ...won, id: "app-3", status: "kontrakt", eventAt: "2026-11-03T10:00:00.000Z", listingId: "home-3" };
  const none = new Set<string>();
  assert.equal(pickAutoPrompt([sent, won], none, none, {}, new Set()), "app-1");
  assert.equal(pickAutoPrompt([won, contract], none, none, {}, new Set()), "app-3");
  assert.equal(pickAutoPrompt([won], none, new Set(["app-1"]), {}, new Set()), null);
  assert.equal(pickAutoPrompt([won], new Set(["home-1"]), none, {}, new Set()), null);
  assert.equal(pickAutoPrompt([won], none, none, { "app-1": 2 }, new Set()), null);
  assert.equal(pickAutoPrompt([won], none, none, { "app-1": 1 }, new Set(["app-1"])), null);
  assert.equal(pickAutoPrompt([won], none, none, { "app-1": 1 }, new Set()), "app-1");
});

test("public pages do not mark up self-collected reviews", () => {
  for (const path of ["../lib/seo.ts", "../components/json-ld.tsx", "../app/page.tsx", "../app/layout.tsx", "../app/integritet/page.tsx", "../components/privacy.tsx"]) {
    const text = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.equal(text.includes("AggregateRating"), false, path);
    assert.equal(text.includes('type": "Review"') || text.includes('type":"Review"'), false, path);
  }
});
