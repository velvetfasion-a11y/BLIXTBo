"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, useState } from "react";
import { canAutoApply } from "@/lib/billing";
import { createDemo, createFreshUser, createLoggedOut, queueForSource, segmentMatches, welcomeNotice } from "@/lib/data";
import { signOutGoogle } from "@/lib/firebase/auth";
import { pushState, type CloudState } from "@/lib/firebase/repository";
import { cloudUid, setCloudSession } from "@/lib/firebase/session";
import { hydrateCloud, scheduleCloudSync, watchAuth } from "@/lib/firebase/sync";
import { applicationLimit, atApplicationLimit, isActiveApplication } from "@/lib/limits";
import { completeness, queueAlert } from "@/lib/profile";
import type { AppStatus, Billing, Connection, CustomLandlord, Filters, Listing, Notice, Persisted, Prefs, Profile, Push, Source, User } from "@/lib/types";

const KEY = "blixtbo-v1";
const SERVER_STATE = createLoggedOut(0);
const EMPTY_STATE = createLoggedOut(0);

let cache: { raw: string; value: Persisted } | null = null;

function subscribe(callback: () => void) {
  window.addEventListener("blixtbo-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("blixtbo-change", callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): Persisted {
  const raw = localStorage.getItem(KEY) ?? "";
  if (cache && cache.raw === raw) return cache.value;
  if (!raw) {
    cache = { raw: "", value: EMPTY_STATE };
    return EMPTY_STATE;
  }
  try {
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed.version !== 1 || !Array.isArray(parsed.listings)) throw new Error("bad");
    const value = {
      ...parsed,
      waiting: parsed.waiting ?? [],
      customLandlords: parsed.customLandlords ?? [],
      billing: parsed.billing ?? { plan: "free", status: "free", usedAutoApplies: 0 },
    };
    cache = { raw, value };
    return value;
  } catch {
    cache = { raw: "", value: EMPTY_STATE };
    return EMPTY_STATE;
  }
}

function getServerSnapshot() {
  return SERVER_STATE;
}

function latest() {
  return cache?.value && cache.value !== SERVER_STATE ? cache.value : getSnapshot();
}

function slotNotice(current: Persisted, sourceId: string): Notice | null {
  const source = current.sources.find((item) => item.id === sourceId);
  if (!source || applicationLimit(source) == null) return null;
  if (atApplicationLimit(current.sources, current.applications, current.listings, sourceId)) return null;
  const waiting = current.waiting.find((item) => item.sourceId === sourceId);
  if (!waiting) return null;
  const listing = current.listings.find((item) => item.id === waiting.listingId);
  if (!listing) return null;
  return {
    id: `n-slot-${sourceId}-${Date.now()}`,
    kind: "system",
    title: `En plats har öppnats hos ${source.name}`,
    body: `${listing.address} ligger i Väntar på plats. Du kan söka den nu.`,
    at: new Date().toISOString(),
    read: false,
    href: `/bostad?id=${listing.id}`,
  };
}

function commit(next: Persisted) {
  const raw = JSON.stringify(next);
  try {
    localStorage.setItem(KEY, raw);
    cache = { raw, value: next };
  } catch {
    cache = { raw: localStorage.getItem(KEY) ?? "", value: next };
  }
  window.dispatchEvent(new Event("blixtbo-change"));
  scheduleCloudSync(next);
}

type Undo =
  | { kind: "skip"; listingId: string; applicationId: string }
  | { kind: "apply"; listingId: string; applicationId: string }
  | null;

type Store = Persisted & {
  ready: boolean;
  toast: string | null;
  canUndo: boolean;
  dismissToast: () => void;
  undo: () => void;
  signInDemo: () => void;
  signIn: (input: { name: string; email: string; method: User["method"] }) => void;
  attachGoogle: (uid: string) => Promise<void>;
  logout: () => void;
  reset: () => void;
  updateProfile: (patch: Partial<Profile>) => void;
  setDocument: (key: keyof Profile["documents"], file: Profile["documents"]["contract"]) => void;
  setFilters: (patch: Partial<Filters>) => void;
  toggleArea: (area: string) => void;
  setCityAreas: (areas: string[], on: boolean) => void;
  clearFilters: () => void;
  skip: (listingId: string) => void;
  apply: (listingId: string, options?: { quiet?: boolean }) => { status: "applied"; position: number } | { status: "connected-needed" | "exists" | "missing" | "limit" | "paywall" };
  setBilling: (billing: Billing) => void;
  deferListing: (listingId: string) => void;
  swapApplication: (applicationId: string, listingId: string) => void;
  setSourceLimit: (id: string, patch: Partial<Pick<Source, "applicationLimit" | "plusLimit" | "plusPriceKr" | "plusUrl">>) => void;
  updateAccount: (patch: { name?: string; email?: string; phone?: string; monthlyIncome?: number | null }) => void;
  connect: (sourceId: string, email: string, options?: { quiet?: boolean; bankIdSession?: boolean }) => void;
  disconnect: (sourceId: string) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  setPrefs: (patch: Partial<Prefs>) => void;
  toggleListing: (id: string) => void;
  addListing: (listing: Listing) => void;
  toggleSource: (id: string) => void;
  saveCustomLandlord: (input: Omit<CustomLandlord, "id" | "createdAt" | "confirmed" | "applyMode"> & { id?: string }) => string;
  removeCustomLandlord: (id: string) => void;
  confirmCustomLandlord: (id: string, websiteUrl: string, applyMode: CustomLandlord["applyMode"], listings: Listing[]) => void;
  sendPush: (input: { title: string; body: string; segment: string }) => number;
  answerOffer: (applicationId: string, accept: boolean) => void;
  signContract: (applicationId: string) => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [toast, setToast] = useState<string | null>(null);
  const [undo, setUndo] = useState<Undo>(null);

  useEffect(() => {
    return watchAuth((uid) => {
      const state = latest();
      if (!state?.user || state.user.demo) return;
      void pushState(uid, state);
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast(null);
      setUndo(null);
    }, 4800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const signInDemo = useCallback(() => {
    setCloudSession(null);
    void signOutGoogle();
    commit(createDemo());
    setToast("Exempelkonto öppnat");
    setUndo(null);
  }, []);

  const signIn = useCallback(
    (input: { name: string; email: string; method: User["method"] }) => {
      if (input.method === "email") setCloudSession(null);
      const current = latest() ?? createLoggedOut();
      const user = createFreshUser(input);
      commit({
        ...current,
        user,
        filters: { ...current.filters, areas: [] },
        connections: Object.fromEntries(
          current.sources.map((source) => [source.id, { sourceId: source.id, status: "none" as const }]),
        ),
        applications: [],
        queues: [],
        notifications: [welcomeNotice()],
        dismissed: [],
        prefs: { newListings: true, fees: true, status: true, keepQueues: true },
      });
    },
    [],
  );

  const attachGoogle = useCallback(async (uid: string) => {
    await hydrateCloud(uid, (remote: CloudState) => {
      const current = latest() ?? createLoggedOut();
      const sources = current.sources.map((source) => {
        const limit = remote.limits[source.id];
        return limit ? { ...source, ...limit } : source;
      });
      const remoteUser = remote.user?.profile ? remote.user : null;
      const keptName = remoteUser?.name?.trim() || current.user?.name || "";
      commit({
        ...current,
        user: remoteUser ? { ...remoteUser, name: keptName } : current.user,
        filters: remote.filters ?? current.filters,
        prefs: remote.prefs ?? current.prefs,
        waiting: remote.waiting ?? [],
        applications: remote.applications ?? [],
        queues: remote.queues ?? [],
        dismissed: remote.dismissed ?? [],
        customLandlords: remote.customLandlords ?? current.customLandlords,
        sources,
      });
    });
    const uidNow = cloudUid();
    const state = latest();
    if (uidNow && state) await pushState(uidNow, state);
  }, []);

  const logout = useCallback(() => {
    setCloudSession(null);
    void signOutGoogle();
    const current = latest() ?? createLoggedOut();
    const fresh = createLoggedOut();
    commit({
      ...fresh,
      listings: current.listings,
      sources: current.sources,
      pushes: current.pushes,
      directory: current.directory,
    });
    setToast(null);
    setUndo(null);
  }, []);

  const reset = useCallback(() => {
    setCloudSession(null);
    commit(createLoggedOut());
    setToast("Prototypen är återställd");
    setUndo(null);
  }, []);

  const updateProfile = useCallback((patch: Partial<Profile>) => {
    const current = latest();
    if (!current?.user) return;
    commit({
      ...current,
      user: { ...current.user, profile: { ...current.user.profile, ...patch } },
    });
  }, []);

  const updateAccount = useCallback((patch: { name?: string; email?: string; phone?: string; monthlyIncome?: number | null }) => {
    const current = latest();
    if (!current?.user) return;
    commit({
      ...current,
      user: {
        ...current.user,
        name: patch.name?.trim() || current.user.name,
        email: patch.email?.trim() || current.user.email,
        profile: {
          ...current.user.profile,
          phone: patch.phone !== undefined ? patch.phone : current.user.profile.phone ?? "",
          monthlyIncome: patch.monthlyIncome !== undefined ? patch.monthlyIncome : current.user.profile.monthlyIncome,
        },
      },
    });
  }, []);

  const setDocument = useCallback(
    (key: keyof Profile["documents"], file: Profile["documents"]["contract"]) => {
      const current = latest();
      if (!current?.user) return;
      commit({
        ...current,
        user: {
          ...current.user,
          profile: {
            ...current.user.profile,
            documents: { ...current.user.profile.documents, [key]: file },
          },
        },
      });
    },
    [],
  );

  const setFilters = useCallback((patch: Partial<Filters>) => {
    const current = latest();
    if (!current) return;
    commit({ ...current, filters: { ...current.filters, ...patch } });
  }, []);

  const toggleArea = useCallback((area: string) => {
    const current = latest();
    if (!current) return;
    const has = current.filters.areas.includes(area);
    commit({
      ...current,
      filters: {
        ...current.filters,
        areas: has ? current.filters.areas.filter((item) => item !== area) : [...current.filters.areas, area],
      },
    });
  }, []);

  const setCityAreas = useCallback((areas: string[], on: boolean) => {
    const current = latest();
    if (!current) return;
    const rest = current.filters.areas.filter((area) => !areas.includes(area));
    commit({
      ...current,
      filters: { ...current.filters, areas: on ? [...rest, ...areas] : rest },
    });
  }, []);

  const clearFilters = useCallback(() => {
    const current = latest();
    if (!current) return;
    commit({
      ...current,
      filters: { areas: [], maxRent: 20000, rooms: "any", minSqm: 0, minFloor: 0, moveIn: "" },
    });
  }, []);

  const skip = useCallback((listingId: string) => {
    const current = latest();
    if (!current || current.dismissed.includes(listingId)) return;
    const listing = current.listings.find((item) => item.id === listingId);
    commit({ ...current, dismissed: [...current.dismissed, listingId] });
    setUndo({ kind: "skip", listingId, applicationId: "" });
    setToast(`Överhoppad · ${listing?.address ?? "bostaden"}`);
  }, []);

  const apply = useCallback((listingId: string, options?: { quiet?: boolean }) => {
    const current = latest();
    if (!current) return { status: "missing" as const };
    const listing = current.listings.find((item) => item.id === listingId);
    if (!listing) return { status: "missing" as const };
    if (current.applications.some((item) => item.listingId === listingId && isActiveApplication(item.status))) return { status: "exists" as const };
    const connection = current.connections[listing.sourceId];
    if (!connection || connection.status !== "connected") return { status: "connected-needed" as const };
    if (atApplicationLimit(current.sources, current.applications, current.listings, listing.sourceId)) return { status: "limit" as const };
    if (!listing.manualApply && !canAutoApply(current.billing)) return { status: "paywall" as const };
    const published = new Date(listing.publishedAt).getTime();
    const minutesAfter = Math.max(0, Math.round((Date.now() - published) / 60000));
    const position = minutesAfter < 15 ? 1 : minutesAfter < 60 ? 2 : minutesAfter < 180 ? 5 : 9;
    const id = `app-${Date.now()}`;
    const source = current.sources.find((item) => item.id === listing.sourceId);
    const note = position === 1 ? "Du var först att ansöka." : `Du var nummer ${position} att ansöka.`;
    const notice: Notice | null = current.prefs.status
      ? {
          id,
          kind: "status",
          title: "Ansökan skickad",
          body: `${listing.address} · ${position === 1 ? "du var först" : `plats ${position}`}`,
          at: new Date().toISOString(),
          read: false,
          href: "/koll",
        }
      : null;
    commit({
      ...current,
      applications: [
        {
          id,
          listingId,
          status: "skickad",
          appliedAt: new Date().toISOString(),
          eventAt: new Date().toISOString(),
          position,
          minutesAfterPublish: minutesAfter,
          note,
        },
        ...current.applications,
      ],
      waiting: current.waiting.filter((item) => item.listingId !== listingId),
      notifications: notice ? [notice, ...current.notifications] : current.notifications,
      billing: listing.manualApply
        ? current.billing
        : { ...current.billing, usedAutoApplies: current.billing.usedAutoApplies + 1 },
    });
    setUndo({ kind: "apply", listingId, applicationId: id });
    if (!options?.quiet) {
      setToast(
        position === 1
          ? `Ansökan skickad till ${source?.name ?? "hyresvärden"} · du var först`
          : `Ansökan skickad till ${source?.name ?? "hyresvärden"} · plats ${position}`,
      );
    }
    return { status: "applied" as const, position };
  }, []);

  const deferListing = useCallback((listingId: string) => {
    const current = latest();
    if (!current) return;
    const listing = current.listings.find((item) => item.id === listingId);
    if (!listing) return;
    if (current.waiting.some((item) => item.listingId === listingId)) {
      setToast(`${listing.address} ligger redan i Väntar på plats`);
      return;
    }
    commit({
      ...current,
      waiting: [...current.waiting, { listingId, sourceId: listing.sourceId, savedAt: new Date().toISOString() }],
    });
    setToast(`${listing.address} sparad i Väntar på plats`);
    setUndo(null);
  }, []);

  const swapApplication = useCallback((applicationId: string, listingId: string) => {
    const current = latest();
    if (!current) return;
    const withdrawn = current.applications.find((item) => item.id === applicationId);
    const listing = current.listings.find((item) => item.id === listingId);
    if (!withdrawn || !listing || !isActiveApplication(withdrawn.status)) return;
    if (current.applications.some((item) => item.listingId === listingId && isActiveApplication(item.status))) return;
    const connection = current.connections[listing.sourceId];
    if (!connection || connection.status !== "connected") return;
    const published = new Date(listing.publishedAt).getTime();
    const minutesAfter = Math.max(0, Math.round((Date.now() - published) / 60000));
    const position = minutesAfter < 15 ? 1 : minutesAfter < 60 ? 2 : minutesAfter < 180 ? 5 : 9;
    const id = `app-${Date.now()}`;
    const previous = current.listings.find((item) => item.id === withdrawn.listingId);
    const notice: Notice = {
      id,
      kind: "status",
      title: "Ansökan ersatt",
      body: `${listing.address} skickades. ${previous?.address ?? "Den förra"} är tillbakadragen.`,
      at: new Date().toISOString(),
      read: false,
      href: "/koll",
    };
    commit({
      ...current,
      applications: [
        {
          id,
          listingId,
          status: "skickad",
          appliedAt: new Date().toISOString(),
          eventAt: new Date().toISOString(),
          position,
          minutesAfterPublish: minutesAfter,
          note: previous ? `Ersatte ansökan till ${previous.address}.` : "Ersatte en tidigare ansökan.",
        },
        ...current.applications.map((item) =>
          item.id === applicationId
            ? { ...item, status: "aterkallad" as const, eventAt: new Date().toISOString(), note: `Tillbakadragen för att söka ${listing.address}.` }
            : item,
        ),
      ],
      waiting: current.waiting.filter((item) => item.listingId !== listingId),
      notifications: [notice, ...current.notifications],
    });
    setToast(`${listing.address} ersatte ${previous?.address ?? "en ansökan"}`);
    setUndo(null);
  }, []);

  const setSourceLimit = useCallback((id: string, patch: Partial<Pick<Source, "applicationLimit" | "plusLimit" | "plusPriceKr" | "plusUrl">>) => {
    const current = latest();
    if (!current) return;
    commit({
      ...current,
      sources: current.sources.map((source) => (source.id === id ? { ...source, ...patch } : source)),
    });
  }, []);

  const connect = useCallback((sourceId: string, email: string, options?: { quiet?: boolean; bankIdSession?: boolean }) => {
    const current = latest();
    if (!current) return;
    const source = current.sources.find((item) => item.id === sourceId);
    const bankIdSession = Boolean(options?.bankIdSession && source?.requiresBankId);
    const connection: Connection = {
      sourceId,
      status: "connected",
      email,
      connectedAt: new Date().toISOString(),
      bankIdSession,
    };
    const born = queueForSource(sourceId);
    const queues = born && !current.queues.some((queue) => queue.sourceId === sourceId) ? [...current.queues, born] : current.queues;
    const notice: Notice | null = bankIdSession
      ? {
          id: `n-bankid-${sourceId}-${Date.now()}`,
          kind: "system",
          title: `${source?.name ?? "Hyresvärden"} är kopplat`,
          body: `Sessionen hos ${source?.name ?? "hyresvärden"} är kopplad. En förnyelse kan kräva ett nytt BankID-godkännande. Du får en notis då. Blixtbo ser inte ditt BankID.`,
          at: new Date().toISOString(),
          read: false,
          href: "/kopplingar",
        }
      : null;
    commit({
      ...current,
      connections: { ...current.connections, [sourceId]: connection },
      queues,
      notifications: notice ? [notice, ...current.notifications] : current.notifications,
    });
    if (!options?.quiet) setToast(`${source?.name ?? "Kontot"} är kopplat`);
    setUndo(null);
  }, []);

  const disconnect = useCallback((sourceId: string) => {
    const current = latest();
    if (!current) return;
    commit({
      ...current,
      connections: {
        ...current.connections,
        [sourceId]: { sourceId, status: "none" },
      },
    });
  }, []);

  const markRead = useCallback((id: string) => {
    const current = latest();
    if (!current) return;
    commit({
      ...current,
      notifications: current.notifications.map((notice) => (notice.id === id ? { ...notice, read: true } : notice)),
    });
  }, []);

  const markAllRead = useCallback(() => {
    const current = latest();
    if (!current) return;
    commit({
      ...current,
      notifications: current.notifications.map((notice) => ({ ...notice, read: true })),
    });
  }, []);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    const current = latest();
    if (!current) return;
    commit({ ...current, prefs: { ...current.prefs, ...patch } });
  }, []);

  const toggleListing = useCallback((id: string) => {
    const current = latest();
    if (!current) return;
    commit({
      ...current,
      listings: current.listings.map((listing) => (listing.id === id ? { ...listing, active: !listing.active } : listing)),
    });
  }, []);

  const addListing = useCallback((listing: Listing) => {
    const current = latest();
    if (!current) return;
    commit({ ...current, listings: [listing, ...current.listings] });
    setToast("Annonsen är publicerad i flödet");
    setUndo(null);
  }, []);

  const setBilling = useCallback((billing: Billing) => {
    const current = latest();
    if (!current) return;
    commit({ ...current, billing });
  }, []);

  const saveCustomLandlord = useCallback((input: Omit<CustomLandlord, "id" | "createdAt" | "confirmed" | "applyMode"> & { id?: string }) => {
    const current = latest();
    if (!current) return "";
    const id = input.id || `custom-${Date.now()}`;
    const existing = current.customLandlords.find((item) => item.id === id);
    const next: CustomLandlord = {
      id,
      name: input.name.trim(),
      websiteUrl: input.websiteUrl.trim(),
      country: input.country.trim(),
      city: input.city.trim(),
      kind: input.kind,
      confirmed: existing?.confirmed ?? false,
      applyMode: existing?.applyMode ?? "manual",
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    const customLandlords = existing
      ? current.customLandlords.map((item) => (item.id === id ? next : item))
      : [next, ...current.customLandlords];
    commit({ ...current, customLandlords });
    return id;
  }, []);

  const removeCustomLandlord = useCallback((id: string) => {
    const current = latest();
    if (!current) return;
    commit({
      ...current,
      customLandlords: current.customLandlords.filter((item) => item.id !== id),
      sources: current.sources.filter((item) => item.id !== id),
      listings: current.listings.filter((item) => item.sourceId !== id),
    });
  }, []);

  const confirmCustomLandlord = useCallback((id: string, websiteUrl: string, applyMode: CustomLandlord["applyMode"], listings: Listing[]) => {
    const current = latest();
    if (!current) return;
    const landlord = current.customLandlords.find((item) => item.id === id);
    if (!landlord) return;
    const source: Source = {
      id,
      name: landlord.name,
      kind: landlord.kind === "byggbolag" ? "Byggbolag" : landlord.kind === "annat" ? "Annat" : "Hyresvärd",
      blurb: [landlord.city, landlord.country].filter(Boolean).join(", ") || "Egen källa",
      syncMin: 60,
      health: "ok",
      enabled: true,
      requiresBankId: false,
    };
    const known = new Set(current.listings.map((item) => item.id));
    const fresh = listings.filter((item) => !known.has(item.id));
    commit({
      ...current,
      customLandlords: current.customLandlords.map((item) =>
        item.id === id ? { ...item, websiteUrl, confirmed: true, applyMode } : item,
      ),
      sources: [source, ...current.sources.filter((item) => item.id !== id)],
      listings: [...fresh, ...current.listings],
    });
    setToast(fresh.length === 1 ? `En bostad från ${landlord.name}` : fresh.length ? `${fresh.length} bostäder från ${landlord.name}` : `${landlord.name} är tillagd`);
  }, []);

  const toggleSource = useCallback((id: string) => {
    const current = latest();
    if (!current) return;
    commit({
      ...current,
      sources: current.sources.map((source) => (source.id === id ? { ...source, enabled: !source.enabled } : source)),
    });
  }, []);

  const answerOffer = useCallback((applicationId: string, accept: boolean) => {
    const current = latest();
    if (!current) return;
    const application = current.applications.find((item) => item.id === applicationId);
    if (!application || application.status !== "erbjuden") return;
    const listing = current.listings.find((item) => item.id === application.listingId);
    const address = listing?.address ?? "bostaden";
    const status: AppStatus = accept ? "accepterad" : "avbojd";
    const note = accept
      ? "Du tackade ja. Nästa steg är att skriva under kontraktet och betala depositionen."
      : application.affectsQueue
        ? "Du tackade nej. Bostaden går vidare. Ett nej kan påverka köpoängen."
        : "Du tackade nej. Bostaden går vidare till nästa hushåll.";
    const notice: Notice = {
      id: `n-answer-${Date.now()}`,
      kind: "status",
      title: accept ? `Du tackade ja till ${address}` : `Du tackade nej till ${address}`,
      body: note,
      at: new Date().toISOString(),
      read: false,
      href: `/erbjudande?id=${applicationId}`,
    };
    const applications = current.applications.map((item) =>
      item.id === applicationId ? { ...item, status, note, eventAt: new Date().toISOString() } : item,
    );
    const freed = isActiveApplication(application.status) && !isActiveApplication(status)
      ? slotNotice({ ...current, applications }, listing?.sourceId ?? "")
      : null;
    commit({
      ...current,
      applications,
      notifications: freed ? [freed, notice, ...current.notifications] : [notice, ...current.notifications],
    });
    setToast(accept ? `Du tackade ja till ${address}` : `Erbjudandet på ${address} är avböjt`);
  }, []);

  const signContract = useCallback((applicationId: string) => {
    const current = latest();
    if (!current) return;
    const application = current.applications.find((item) => item.id === applicationId);
    if (!application || application.status !== "accepterad") return;
    const listing = current.listings.find((item) => item.id === application.listingId);
    const address = listing?.address ?? "bostaden";
    const notice: Notice = {
      id: `n-contract-${Date.now()}`,
      kind: "status",
      title: `Kontrakt för ${address}`,
      body: "Kontraktet är markerat som signerat.",
      at: new Date().toISOString(),
      read: false,
      href: "/koll",
    };
    const applications = current.applications.map((item) =>
      item.id === applicationId
        ? { ...item, status: "kontrakt" as const, note: "Kontraktet är signerat. Inflytt enligt datumet i erbjudandet.", eventAt: new Date().toISOString() }
        : item,
    );
    const freed = slotNotice({ ...current, applications }, listing?.sourceId ?? "");
    commit({
      ...current,
      applications,
      notifications: freed ? [freed, notice, ...current.notifications] : [notice, ...current.notifications],
    });
    setToast(`Kontrakt signerat · ${address}`);
  }, []);

  const sendPush = useCallback((input: { title: string; body: string; segment: string }) => {
    const current = latest();
    if (!current) return 0;
    const directoryHits = current.directory.filter((person) => segmentMatches(input.segment, person));
    let recipients = directoryHits.length;
    const user = current.user;
    let notices = current.notifications;
    if (user) {
      const already = current.directory.some((person) => person.email === user.email);
      const ctx = {
        city: user.profile.currentCity,
        completeness: completeness(user.profile).score,
        queueWarning: current.queues.some((queue) => queueAlert(queue)),
        applications: current.applications.length,
      };
      const matches = segmentMatches(input.segment, ctx);
      if (!already && matches) recipients += 1;
      if (matches) {
        const notice: Notice = {
          id: `push-${Date.now()}`,
          kind: "system",
          title: input.title.trim(),
          body: input.body.trim(),
          at: new Date().toISOString(),
          read: false,
          href: "/notiser",
        };
        notices = [notice, ...notices];
      }
    }
    const push: Push = {
      id: `push-${Date.now()}`,
      title: input.title.trim(),
      body: input.body.trim(),
      segment: input.segment,
      sentAt: new Date().toISOString(),
      recipients,
    };
    commit({ ...current, pushes: [push, ...current.pushes], notifications: notices });
    setToast(`Utskick skickat till ${recipients} ${recipients === 1 ? "person" : "personer"}`);
    setUndo(null);
    return recipients;
  }, []);

  const undoAction = useCallback(() => {
    const current = latest();
    const action = undo;
    if (!current || !action) return;
    if (action.kind === "skip") {
      commit({ ...current, dismissed: current.dismissed.filter((id) => id !== action.listingId) });
    } else {
      const removed = current.applications.find((item) => item.id === action.applicationId);
      const applications = current.applications.filter((item) => item.id !== action.applicationId);
      const sourceId = current.listings.find((item) => item.id === removed?.listingId)?.sourceId ?? "";
      const freed = removed && isActiveApplication(removed.status) ? slotNotice({ ...current, applications }, sourceId) : null;
      commit({
        ...current,
        applications,
        notifications: [
          ...(freed ? [freed] : []),
          ...current.notifications.filter((item) => item.id !== action.applicationId),
        ],
      });
    }
    setUndo(null);
    setToast(action.kind === "skip" ? "Bostaden ligger kvar" : "Ansökan ångrad");
  }, [undo]);

  const value = useMemo<Store>(() => {
    return {
      ...state,
      ready: state !== SERVER_STATE,
      toast,
      canUndo: Boolean(undo),
      dismissToast: () => {
        setToast(null);
        setUndo(null);
      },
      undo: undoAction,
      signInDemo,
      signIn,
      attachGoogle,
      logout,
      reset,
      updateProfile,
      updateAccount,
      setDocument,
      setFilters,
      toggleArea,
      setCityAreas,
      clearFilters,
      skip,
      apply,
      deferListing,
      swapApplication,
      setSourceLimit,
      connect,
      disconnect,
      markRead,
      markAllRead,
      setPrefs,
      toggleListing,
      addListing,
      toggleSource,
      setBilling,
      saveCustomLandlord,
      removeCustomLandlord,
      confirmCustomLandlord,
      sendPush,
      answerOffer,
      signContract,
    };
  }, [
    state,
    toast,
    undo,
    undoAction,
    signInDemo,
    signIn,
    attachGoogle,
    logout,
    reset,
    updateProfile,
    updateAccount,
    setDocument,
    setFilters,
    toggleArea,
    setCityAreas,
    clearFilters,
    skip,
    apply,
    deferListing,
    swapApplication,
    setSourceLimit,
    connect,
    disconnect,
    markRead,
    markAllRead,
    setPrefs,
    toggleListing,
    addListing,
    toggleSource,
    setBilling,
    saveCustomLandlord,
    removeCustomLandlord,
    confirmCustomLandlord,
    sendPush,
    answerOffer,
    signContract,
  ]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4 md:top-6">
          <div className="pointer-events-auto flex max-w-md items-center gap-4 rounded-full border border-line bg-ink px-4 py-3 text-sm text-paper shadow-[0_18px_50px_rgba(28,25,22,0.28)]">
            <p className="min-w-0 flex-1 leading-snug">{toast}</p>
            {undo ? (
              <button type="button" className="font-semibold text-white" onClick={undoAction}>
                Ångra
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}

export function useStore() {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error("Store saknas");
  }
  return value;
}

export function useMaybeStore() {
  return useContext(Ctx);
}
