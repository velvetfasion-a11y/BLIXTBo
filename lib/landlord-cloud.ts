import { firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";
import { apiBase } from "@/lib/landlord-api";

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

export async function putJson(path: string, body: unknown) {
  const headers = await authHeaders();
  const response = await fetch(`${apiBase()}${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : "Något gick fel.";
    throw new Error(detail);
  }
  return data;
}
