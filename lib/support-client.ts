import { apiDetail } from "@/lib/account";
import { APP_VERSION } from "@/lib/version";

export const SUPPORT_PROMISE = "Vi svarar inom 24 timmar.";
export const SUPPORT_CONFIRMATION = "Tack! Vi har fått ditt ärende och svarar inom 24 timmar.";

export type SupportMessage = {
  id: string;
  role: string;
  body: string;
  createdAt: string;
};

export function supportMetadata() {
  if (typeof window === "undefined") {
    return { appVersion: APP_VERSION, route: "", userAgent: "", language: "" };
  }
  return {
    appVersion: APP_VERSION,
    route: `${window.location.pathname}${window.location.search}`.slice(0, 300),
    userAgent: window.navigator.userAgent.slice(0, 400),
    language: window.navigator.language.slice(0, 40),
  };
}

function apiBase() {
  try {
    const value = process.env.NEXT_PUBLIC_API_URL;
    if (value) return value.replace(/\/$/, "");
  } catch {
    // The packed HTML file has no process object.
  }
  return "/api";
}

export async function supportFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  try {
    const firebase = await import("@/lib/firebase/client");
    if (firebase.firebaseConfigured()) {
      const current = firebase.firebaseAuth().currentUser;
      if (current) headers.set("Authorization", `Bearer ${await current.getIdToken()}`);
    }
  } catch {
    // Signed out, or the static pack without Firebase.
  }
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiBase()}${path}`, { ...init, headers, credentials: "include" });
  const data: unknown = await response.json().catch(() => ({}));
  return { response, data, detail: apiDetail(data) };
}

export function readScreenshot(file: File) {
  if (!file.type.startsWith("image/")) return Promise.reject(new Error("Välj en bild."));
  if (file.size > 600_000) return Promise.reject(new Error("Bilden är för stor. Högst 600 kB."));
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Bilden gick inte att läsa."));
    reader.readAsDataURL(file);
  });
}
