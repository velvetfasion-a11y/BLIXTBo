import assert from "node:assert/strict";
import test from "node:test";
import { usablePublishableKey } from "../lib/stripe-key.ts";

test("publishable keys accept test and live and reject the rest", () => {
  assert.equal(usablePublishableKey("pk_test_abc"), "pk_test_abc");
  assert.equal(usablePublishableKey("pk_live_abc"), "pk_live_abc");
  assert.equal(usablePublishableKey(""), "");
  assert.equal(usablePublishableKey("pk_test_"), "");
  assert.equal(usablePublishableKey("pk_live"), "");
  assert.equal(usablePublishableKey("pk_test"), "");
  assert.equal(usablePublishableKey("sk_live_abc"), "");
  assert.equal(usablePublishableKey("sk_test_abc"), "");
  assert.equal(usablePublishableKey(" pk_live_abc"), "");
  assert.equal(usablePublishableKey("pk_live_abc "), "");
});
