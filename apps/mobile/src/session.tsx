import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/src/api";
import { firebaseAuth, firebaseConfigured } from "@/src/firebase";
import { routeFromHref } from "@/src/links";
import { disablePush } from "@/src/push";
import { clearCachedSecrets } from "@/src/secure";
import type { Entitlement } from "@/src/types";

const ONBOARDING = "blixtbo-onboarding-done";

type SessionValue = {
  ready: boolean;
  onboarded: boolean;
  user: User | null;
  entitlement: Entitlement;
  refreshEntitlement: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  signOut: () => Promise<void>;
};

const emptyEntitlement: Entitlement = { plan: "free", status: "free" };
const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement>(emptyEntitlement);
  const opened = useRef<string | null>(null);

  const refreshEntitlement = useCallback(async () => {
    if (!firebaseConfigured() || !firebaseAuth().currentUser) {
      setEntitlement(emptyEntitlement);
      return;
    }
    const { response, data } = await apiFetch("/billing/entitlement");
    if (!response.ok || !data || typeof data !== "object") return;
    const row = data as Entitlement;
    setEntitlement({
      plan: row.plan === "premium" ? "premium" : "free",
      status: typeof row.status === "string" ? row.status : "free",
      source: row.source,
      trial: row.trial,
      autoApply: row.autoApply,
      currentPeriodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    });
  }, []);

  useEffect(() => {
    let active = true;
    const stop = firebaseConfigured()
      ? onAuthStateChanged(firebaseAuth(), (next) => {
          if (!active) return;
          setUser(next);
          setReady(true);
          if (next) void refreshEntitlement();
          else setEntitlement(emptyEntitlement);
        })
      : null;
    void AsyncStorage.getItem(ONBOARDING).then((value) => {
      if (!active) return;
      setOnboarded(value === "1");
      if (!firebaseConfigured()) setReady(true);
    });
    return () => {
      active = false;
      stop?.();
    };
  }, [refreshEntitlement]);

  useEffect(() => {
    if (!user) return;
    function open(response: Notifications.NotificationResponse | null) {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (opened.current === id) return;
      opened.current = id;
      const href = response.notification.request.content.data?.href;
      router.push(routeFromHref(typeof href === "string" ? href : undefined));
    }
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    return () => subscription.remove();
  }, [user]);

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      onboarded,
      user,
      entitlement,
      refreshEntitlement,
      async completeOnboarding() {
        await AsyncStorage.setItem(ONBOARDING, "1");
        setOnboarded(true);
      },
      async signOut() {
        await disablePush().catch(() => undefined);
        await clearCachedSecrets();
        if (firebaseConfigured()) await firebaseSignOut(firebaseAuth()).catch(() => undefined);
        setUser(null);
        setEntitlement(emptyEntitlement);
        router.replace("/sign-in");
      },
    }),
    [ready, onboarded, user, entitlement, refreshEntitlement],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Sessionen saknas.");
  return value;
}
