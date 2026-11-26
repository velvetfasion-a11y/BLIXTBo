import assert from "node:assert/strict";
import test from "node:test";
import { DELETE_CONFIRMATION, DELETE_SCOPES, apiDetail, confirmationMatches, needsRecentLogin } from "../lib/account.ts";

test("the confirm word is exactly RADERA", () => {
  assert.equal(DELETE_CONFIRMATION, "RADERA");
  assert.equal(confirmationMatches("RADERA"), true);
  assert.equal(confirmationMatches("  RADERA  "), true);
  assert.equal(confirmationMatches("radera"), false);
  assert.equal(confirmationMatches("RADERA "), true);
  assert.equal(confirmationMatches(""), false);
});

test("a stale Firebase login is recognised", () => {
  assert.equal(needsRecentLogin("recent-login-required"), true);
  assert.equal(needsRecentLogin({ code: "auth/requires-recent-login" }), true);
  assert.equal(needsRecentLogin("Logga in igen."), false);
  assert.equal(needsRecentLogin({ code: "auth/popup-closed-by-user" }), false);
});

test("API errors stay a string", () => {
  assert.equal(apiDetail({ detail: "Skriv RADERA för att bekräfta." }), "Skriv RADERA för att bekräfta.");
  assert.equal(apiDetail({ detail: { code: "x" } }), "");
  assert.equal(apiDetail(null), "");
});

test("each delete choice says what goes and what stays", () => {
  const account = DELETE_SCOPES.find((item) => item.id === "account");
  const erasure = DELETE_SCOPES.find((item) => item.id === "erasure");
  const links = DELETE_SCOPES.find((item) => item.id === "links");
  assert.ok(account && erasure && links);
  assert.match(account.keeps.join(" "), /ansökningar/);
  assert.match(account.keeps.join(" "), /Firebase/);
  assert.match(erasure.summary, /GDPR/);
  assert.match(erasure.removes.join(" "), /filter/);
  assert.match(erasure.removes.join(" "), /notiser/);
  assert.match(erasure.removes.join(" "), /hyresvärdar/);
  assert.match(erasure.removes.join(" "), /Loggar/);
  assert.match(erasure.removes.join(" "), /anonymiseras/);
  assert.match(erasure.keeps.join(" "), /Bokföringslagen/);
  assert.match(links.removes.join(" "), /Google och Apple/);
  assert.match(links.caution ?? "", /enda sätt att logga in/);
  assert.match(links.keeps.join(" "), /Prenumerationen/);
});
