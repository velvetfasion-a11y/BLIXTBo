import { apiDetail } from "@/lib/account";
import { apiBase, apiFetch } from "@/lib/api";
import { firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";

export type SavedReview = {
  id: string;
  applicationId: string;
  listingId: string;
  rating: number;
  text: string;
  landlord: string;
  publishConsent: boolean;
  createdAt: string;
};

export type ReviewDraft = {
  applicationId: string;
  listingId: string;
  rating: number;
  text: string;
  landlord: string;
  publishConsent: boolean;
};

export type ReviewSave = {
  review: SavedReview;
  googleReviewUrl: string;
};

const LOCAL = "blixtbo-reviews";
const NUDGES = "blixtbo-review-nudges";

function storageKey(email: string, name: string) {
  return `${name}:${email.trim().toLowerCase()}`;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function asReview(value: unknown): SavedReview | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.applicationId !== "string" || typeof row.rating !== "number") return null;
  return {
    id: String(row.id ?? row.applicationId),
    applicationId: row.applicationId,
    listingId: typeof row.listingId === "string" ? row.listingId : "",
    rating: row.rating,
    text: typeof row.text === "string" ? row.text : "",
    landlord: typeof row.landlord === "string" ? row.landlord : "",
    publishConsent: row.publishConsent === true,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
  };
}

export function readLocalReviews(email: string) {
  const rows = readJson<unknown[]>(storageKey(email, LOCAL), []);
  if (!Array.isArray(rows)) return [];
  return rows.map(asReview).filter((item): item is SavedReview => item !== null);
}

function writeLocalReviews(email: string, rows: SavedReview[]) {
  localStorage.setItem(storageKey(email, LOCAL), JSON.stringify(rows));
}

export function readSkips(email: string) {
  const value = readJson<Record<string, number>>(storageKey(email, NUDGES), {});
  return value && typeof value === "object" ? value : {};
}

export function writeSkips(email: string, skips: Record<string, number>) {
  localStorage.setItem(storageKey(email, NUDGES), JSON.stringify(skips));
}

function remember(email: string, review: SavedReview) {
  const next = readLocalReviews(email).filter((item) => {
    if (item.applicationId === review.applicationId) return false;
    if (review.listingId && item.listingId === review.listingId) return false;
    return true;
  });
  next.push(review);
  writeLocalReviews(email, next);
}

function googleUrl(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const url = (data as { googleReviewUrl?: unknown }).googleReviewUrl;
  return typeof url === "string" && (url.startsWith("https://") || url.startsWith("http://")) ? url : "";
}

export async function loadReviews(email: string, demo: boolean) {
  const local = readLocalReviews(email);
  if (demo || !email) return local;
  let response: Response;
  let data: unknown;
  try {
    ({ response, data } = await apiFetch("/reviews"));
  } catch {
    return local;
  }
  if (!response.ok) return local;
  const rows = data && typeof data === "object" && Array.isArray((data as { reviews?: unknown }).reviews)
    ? (data as { reviews: unknown[] }).reviews.map(asReview).filter((item): item is SavedReview => item !== null)
    : [];
  const byId = new Map(local.map((item) => [item.applicationId, item]));
  for (const row of rows) byId.set(row.applicationId, row);
  return [...byId.values()];
}

export async function submitReview(email: string, draft: ReviewDraft, existing: boolean, demo: boolean): Promise<ReviewSave> {
  if (demo) {
    const previous = readLocalReviews(email).find((item) => item.applicationId === draft.applicationId);
    const review: SavedReview = {
      ...draft,
      id: previous?.id ?? draft.applicationId,
      createdAt: previous?.createdAt ?? new Date().toISOString(),
    };
    remember(email, review);
    return { review, googleReviewUrl: "" };
  }
  const path = existing ? `/reviews/${encodeURIComponent(draft.applicationId)}` : "/reviews";
  const method = existing ? "PUT" : "POST";
  let { response, data, detail } = await apiFetch(path, { method, body: JSON.stringify(draft) });
  if (!existing && response.status === 409) {
    ({ response, data, detail } = await apiFetch(`/reviews/${encodeURIComponent(draft.applicationId)}`, {
      method: "PUT",
      body: JSON.stringify(draft),
    }));
  }
  if (!response.ok) throw new Error(detail || "Det gick inte att spara recensionen.");
  const review = asReview(data);
  if (!review) throw new Error("Det gick inte att spara recensionen.");
  remember(email, review);
  return { review, googleReviewUrl: googleUrl(data) };
}

export type AdminReview = SavedReview & { email: string };

export type AdminReviewReport = {
  average: number | null;
  count: number;
  distribution: Record<string, number>;
  reviews: AdminReview[];
};

function adminPath() {
  const path = (process.env.NEXT_PUBLIC_ADMIN_PATH || "/internal/ops").replace(/\/$/, "");
  return path.startsWith("/") ? path : `/${path}`;
}

export async function loadAdminReviews(rating: string) {
  const query = rating ? `?rating=${encodeURIComponent(rating)}` : "";
  const { response, data, detail } = await apiFetch(`${adminPath()}/reviews${query}`);
  return { response, data: data as AdminReviewReport, detail };
}

export async function downloadAdminReviews(rating: string) {
  const user = firebaseConfigured() ? firebaseAuth().currentUser : null;
  const token = user ? await user.getIdToken() : "";
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const query = rating ? `?rating=${encodeURIComponent(rating)}` : "";
  const response = await fetch(`${apiBase()}${adminPath()}/reviews.csv${query}`, { headers });
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => ({}));
    throw new Error(apiDetail(data) || "Exporten gick inte att hämta.");
  }
  return response.text();
}
