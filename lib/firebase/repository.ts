import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { defaultFilters } from "@/lib/data";
import { firebaseConfigured, firebaseDb } from "@/lib/firebase/client";
import type { Application, Persisted, Profile, Queue, WaitingSpot } from "@/lib/types";

const OFFER = new Set(["erbjuden", "accepterad", "avbojd", "kontrakt"]);

export type CloudState = {
  user: Persisted["user"];
  filters: Persisted["filters"];
  prefs: Persisted["prefs"];
  waiting: WaitingSpot[];
  applications: Application[];
  queues: Queue[];
  dismissed: string[];
  limits: Record<string, { applicationLimit: number | null; plusLimit: number | null; plusPriceKr: number | null; plusUrl: string }>;
};

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function pushState(uid: string, state: Persisted) {
  if (!firebaseConfigured() || !state.user) return;
  const db = firebaseDb();
  const root = doc(db, "users", uid);
  await setDoc(
    root,
    plain({
      email: state.user.email,
      name: state.user.name,
      method: state.user.method,
      profile: state.user.profile,
      filters: state.filters,
      prefs: state.prefs,
      waiting: state.waiting,
      updatedAt: new Date().toISOString(),
    }),
    { merge: true },
  );
  for (const id of state.dismissed) {
    await setDoc(doc(db, "users", uid, "swipes", id), { direction: "no", listingId: id, at: new Date().toISOString() }, { merge: true });
  }
  for (const application of state.applications) {
    const listing = state.listings.find((item) => item.id === application.listingId);
    const body = plain({ ...application, sourceId: listing?.sourceId ?? null });
    await setDoc(doc(db, "users", uid, "swipes", application.listingId), {
      direction: "yes",
      listingId: application.listingId,
      at: application.appliedAt,
    }, { merge: true });
    await setDoc(doc(db, "users", uid, "applications", application.id), body);
    if (OFFER.has(application.status)) {
      await setDoc(doc(db, "users", uid, "offers", application.id), body);
    }
  }
  for (const queue of state.queues) {
    await setDoc(doc(db, "users", uid, "queues", queue.id), plain(queue));
  }
}

export async function pullState(uid: string): Promise<CloudState | null> {
  if (!firebaseConfigured()) return null;
  const db = firebaseDb();
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  const applications = (await getDocs(collection(db, "users", uid, "applications"))).docs.map((item) => item.data() as Application);
  const queues = (await getDocs(collection(db, "users", uid, "queues"))).docs.map((item) => item.data() as Queue);
  const swipes = (await getDocs(collection(db, "users", uid, "swipes"))).docs.map((item) => item.data() as { direction?: string; listingId?: string });
  const limitsSnap = await getDocs(collection(db, "config", "landlords", "sources")).catch(() => null);
  const limits: CloudState["limits"] = {};
  limitsSnap?.forEach((item) => {
    const row = item.data();
    limits[item.id] = {
      applicationLimit: row.applicationLimit ?? null,
      plusLimit: row.plusLimit ?? null,
      plusPriceKr: row.plusPriceKr ?? null,
      plusUrl: row.plusUrl ?? "",
    };
  });
  return {
    user: data.profile
      ? {
          name: String(data.name ?? ""),
          email: String(data.email ?? ""),
          method: data.method === "apple" || data.method === "email" ? data.method : "google",
          demo: false,
          createdAt: String(data.updatedAt ?? new Date().toISOString()),
          profile: data.profile as Profile,
        }
      : null,
    filters: data.filters ?? defaultFilters,
    prefs: data.prefs ?? { newListings: true, fees: true, status: true, keepQueues: true },
    waiting: Array.isArray(data.waiting) ? data.waiting : [],
    applications,
    queues,
    dismissed: swipes.filter((item) => item.direction === "no" && item.listingId).map((item) => String(item.listingId)),
    limits,
  };
}
