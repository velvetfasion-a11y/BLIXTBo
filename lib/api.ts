import { apiDetail } from "@/lib/account";
import { firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";

export function apiBase() {
  return (process.env.NEXT_PUBLIC_API_URL || "/api").replace(/\/$/, "");
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const user = firebaseConfigured() ? firebaseAuth().currentUser : null;
  const token = user ? await user.getIdToken() : "";
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiBase()}${path}`, { ...init, headers });
  const data: unknown = await response.json().catch(() => ({}));
  return { response, data, detail: apiDetail(data) };
}
