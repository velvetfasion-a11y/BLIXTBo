import { firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";
import type { Listing, Source } from "@/lib/types";

export function apiBase() {
  return (process.env.NEXT_PUBLIC_API_URL || "/api").replace(/\/$/, "");
}

export function cloudReady() {
  return firebaseConfigured() && Boolean(firebaseAuth().currentUser);
}

export async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!firebaseConfigured()) return headers;
  const user = firebaseAuth().currentUser;
  if (!user) return headers;
  headers.Authorization = `Bearer ${await user.getIdToken()}`;
  return headers;
}

export function isQasaListing(source: Source | undefined, listing: Listing | undefined): boolean {
  return listing?.sourceId === "qasa" || Boolean(listing?.messageApply) || source?.id === "qasa";
}

export function sendConfirmation(source: Source | undefined, listing: Listing | undefined): string | null {
  if (isQasaListing(source, listing)) return null;
  if (source?.bindingApply || listing?.bindingApply || listing?.sourceId === "bostadsformedlingen") {
    return "Intresset blir bindande för den sökande med längst kötid när annonstiden tar slut.";
  }
  return null;
}

export async function postJson(path: string, body?: unknown) {
  const headers = await authHeaders();
  const response = await fetch(`${apiBase()}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : "Något gick fel.";
    throw new Error(detail);
  }
  return data;
}
