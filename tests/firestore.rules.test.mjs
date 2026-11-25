import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8088").split(":");
const testEnv = await initializeTestEnvironment({
  projectId: "blixtbo-rules",
  firestore: {
    rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    host,
    port: Number(port),
  },
});

const alice = testEnv.authenticatedContext("alice");
const bob = testEnv.authenticatedContext("bob");

await testEnv.withSecurityRulesDisabled(async (context) => {
  await setDoc(doc(context.firestore(), "config/landlords/sources/homeq"), {
    applicationLimit: 5,
    plusLimit: 10,
    plusPriceKr: 349,
    plusUrl: "https://www.homeq.se/plus",
  });
  await setDoc(doc(context.firestore(), "credentials/alice/landlords/homeq"), {
    secret_ciphertext: "already-encrypted",
  });
});

await assertSucceeds(setDoc(doc(alice.firestore(), "users/alice/swipes/blekinge"), { direction: "yes", listingId: "blekinge" }));
await assertSucceeds(setDoc(doc(alice.firestore(), "users/alice/applications/app-1"), { status: "skickad", listingId: "blekinge" }));
await assertSucceeds(setDoc(doc(alice.firestore(), "users/alice/customLandlords/exempel"), { name: "Exempelbyggen", kind: "byggbolag" }));
await testEnv.withSecurityRulesDisabled(async (context) => {
  await setDoc(doc(context.firestore(), "users/alice/billing/entitlement"), { plan: "premium", status: "active" });
});
await assertSucceeds(getDoc(doc(alice.firestore(), "users/alice/billing/entitlement")));
await assertFails(setDoc(doc(alice.firestore(), "users/alice/billing/entitlement"), { plan: "premium" }));
await assertFails(setDoc(doc(bob.firestore(), "users/alice/customLandlords/exempel"), { name: "Inte din" }));
await assertFails(getDoc(doc(bob.firestore(), "users/alice/customLandlords/exempel")));
await assertFails(setDoc(doc(bob.firestore(), "users/alice/swipes/blekinge"), { direction: "no" }));
await assertFails(getDoc(doc(alice.firestore(), "credentials/alice/landlords/homeq")));
await assertFails(setDoc(doc(alice.firestore(), "credentials/alice/landlords/homeq"), { secret_ciphertext: "nope" }));
await assertFails(setDoc(doc(alice.firestore(), "config/landlords/sources/homeq"), { applicationLimit: 99 }));
await assertSucceeds(getDoc(doc(alice.firestore(), "config/landlords/sources/homeq")));
await assertFails(
  setDoc(doc(alice.firestore(), "users/alice/swipes/bankid"), { direction: "yes", autoStartToken: "secret" }),
);

await testEnv.cleanup();
console.log("firestore rules ok");
