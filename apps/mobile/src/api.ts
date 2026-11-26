import { firebaseAuth, firebaseConfigured } from "@/src/firebase";
import { assertSecureApi } from "@/src/secure";

export function apiBase() {
  return (process.env.EXPO_PUBLIC_API_URL || "https://blixtbo.se/api").replace(/\/$/, "");
}

export function detailOf(data: unknown) {
  if (typeof data === "object" && data && "detail" in data) {
    const detail = (data as { detail: unknown }).detail;
    return typeof detail === "string" ? detail : "";
  }
  return "";
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const base = apiBase();
  assertSecureApi(base);
  const headers = new Headers(init.headers);
  if (firebaseConfigured()) {
    const user = firebaseAuth().currentUser;
    const token = user ? await user.getIdToken() : "";
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const data: unknown = await response.json().catch(() => ({}));
  return { response, data, detail: detailOf(data) };
}
