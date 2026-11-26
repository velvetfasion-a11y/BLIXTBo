import assert from "node:assert/strict";
import test from "node:test";
import { appleDisplayName, appleErrorMessage, googleErrorMessage, isMobileSafari, isPopupBlocked } from "../lib/firebase/google-browser.ts";

const iphoneSafari = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  platform: "iPhone",
  maxTouchPoints: 5,
};

const iphoneChrome = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  platform: "iPhone",
  maxTouchPoints: 5,
};

const ipadSafari = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  platform: "MacIntel",
  maxTouchPoints: 5,
};

const desktopSafari = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  platform: "MacIntel",
  maxTouchPoints: 0,
};

const desktopChrome = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  platform: "Win32",
  maxTouchPoints: 0,
};

test("mobile Safari uses the redirect fallback", () => {
  assert.equal(isMobileSafari(iphoneSafari), true);
  assert.equal(isMobileSafari(ipadSafari), true);
});

test("other browsers keep the popup", () => {
  assert.equal(isMobileSafari(iphoneChrome), false);
  assert.equal(isMobileSafari(desktopSafari), false);
  assert.equal(isMobileSafari(desktopChrome), false);
});

test("only a blocked popup falls back to redirect", () => {
  assert.equal(isPopupBlocked({ code: "auth/popup-blocked" }), true);
  assert.equal(isPopupBlocked({ code: "auth/operation-not-supported-in-this-environment" }), true);
  assert.equal(isPopupBlocked({ code: "auth/popup-closed-by-user" }), false);
  assert.equal(isPopupBlocked(new Error("no")), false);
});

test("a closed Google popup is not shown as a failure", () => {
  assert.equal(googleErrorMessage({ code: "auth/popup-closed-by-user" }), "");
  assert.equal(googleErrorMessage({ code: "auth/cancelled-popup-request" }), "");
  assert.match(googleErrorMessage({ code: "auth/unauthorized-domain" }), /inte godkänd/);
  assert.match(googleErrorMessage({ code: "auth/network-request-failed" }), /Nätverket/);
  assert.match(googleErrorMessage({ code: "auth/account-exists-with-different-credential" }), /redan/);
});

test("Apple errors are Swedish", () => {
  assert.match(appleErrorMessage({ code: "auth/popup-closed-by-user" }), /avbröts/);
  assert.match(appleErrorMessage({ code: "auth/cancelled-popup-request" }), /avbröts/);
  assert.match(appleErrorMessage({ code: "auth/account-exists-with-different-credential" }), /redan/);
  assert.match(appleErrorMessage({ code: "auth/unauthorized-domain" }), /Apple/);
  assert.match(appleErrorMessage(new Error("no")), /Apple/);
});

test("Apple's name is kept from the first sign-in payload", () => {
  assert.equal(appleDisplayName({ displayName: "Anna Lindström", profile: null }), "Anna Lindström");
  assert.equal(
    appleDisplayName({
      displayName: "  ",
      profile: { name: { firstName: "Anna", lastName: "Lindström" } },
    }),
    "Anna Lindström",
  );
  assert.equal(appleDisplayName({ displayName: null, profile: { name: "Erik Ek" } }), "Erik Ek");
  assert.equal(appleDisplayName({ displayName: null, profile: { email: "a@icloud.com" } }), "");
});
