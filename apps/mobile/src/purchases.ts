import {
  deepLinkToSubscriptions,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  requestPurchase,
  type Purchase,
} from "expo-iap";
import { apiFetch } from "@/src/api";

export const PREMIUM_PRODUCT_ID = process.env.EXPO_PUBLIC_APPLE_PRODUCT_ID || "se.blixtbo.premium.monthly";

const APPLE_EULA = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
export const LEGAL = {
  terms: "https://blixtbo.se/villkor",
  privacy: "https://blixtbo.se/integritet",
  help: "https://blixtbo.se/hjalp",
  appleEula: APPLE_EULA,
  support: "mailto:support@blixtbo.se?subject=Blixtbo%20iOS",
  bug: "mailto:support@blixtbo.se?subject=Felrapport%20Blixtbo%20iOS&body=Beskriv%20vad%20som%20h%C3%A4nde%3A%0A",
};

const finished = new Set<string>();

export function subscriptionDisclosure(price: string) {
  return `Blixtbo Premium är en automatiskt förnybar prenumeration på en månad. Du får 3 dagars gratis provperiod. Därefter kostar den ${price} per månad. Prenumerationen förnyas automatiskt tills du säger upp den, minst 24 timmar före periodens slut. Betalningen dras från ditt Apple-konto. Du avslutar den under Inställningar, ditt namn och Prenumerationer. Att radera Blixtbo-kontot tar bort dina uppgifter hos Blixtbo men avslutar inte Apple-prenumerationen.`;
}

export async function loadStorePrice() {
  await initConnection();
  const products = await fetchProducts({ skus: [PREMIUM_PRODUCT_ID], type: "subs" });
  const list = Array.isArray(products) ? products : [];
  const first = list[0] as { displayPrice?: string } | undefined;
  return first?.displayPrice || "99 kr";
}

export async function accountToken() {
  const { response, data, detail } = await apiFetch("/billing/apple/account-token");
  if (!response.ok || !data || typeof data !== "object" || !("appAccountToken" in data)) {
    throw new Error(detail || "Apple-kontot kunde inte kopplas.");
  }
  return String((data as { appAccountToken: string }).appAccountToken);
}

export async function buyPremium(appAccountToken: string) {
  await initConnection();
  await fetchProducts({ skus: [PREMIUM_PRODUCT_ID], type: "subs" });
  const result = await requestPurchase({
    request: { apple: { sku: PREMIUM_PRODUCT_ID, appAccountToken } },
    type: "subs",
  });
  const purchases = Array.isArray(result) ? result : result ? [result] : [];
  if (!purchases.length) return false;
  await submitPurchases(purchases);
  return true;
}

export async function restorePremium() {
  await initConnection();
  const purchases = await getAvailablePurchases();
  if (!purchases.length) throw new Error("Inga tidigare köp hittades för det här Apple-kontot.");
  await submitPurchases(purchases);
}

export async function openSubscriptionManagement() {
  await deepLinkToSubscriptions();
}

export async function submitPurchases(purchases: Purchase[]) {
  for (const purchase of purchases) {
    const id = "transactionId" in purchase && purchase.transactionId ? purchase.transactionId : purchase.id;
    if (finished.has(id)) continue;
    const signed = purchase.purchaseToken || "";
    if (!signed) throw new Error("App Store gav ingen signerad transaktion.");
    const { response, detail } = await apiFetch("/billing/apple/transactions", {
      method: "POST",
      body: JSON.stringify({ signedTransaction: signed }),
    });
    if (!response.ok) throw new Error(detail || "Köpet kunde inte bekräftas.");
    await finishTransaction({ purchase, isConsumable: false });
    finished.add(id);
  }
}
