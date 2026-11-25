import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";
import { pullState, pushState, type CloudState } from "@/lib/firebase/repository";
import { cloudUid, isHydrating, setCloudSession, setHydrating } from "@/lib/firebase/session";
import type { Persisted } from "@/lib/types";

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Persisted | null = null;

export function scheduleCloudSync(state: Persisted) {
  const uid = cloudUid();
  if (!uid || isHydrating()) return;
  pending = state;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const next = pending;
    const current = cloudUid();
    pending = null;
    timer = null;
    if (!next || !current) return;
    void pushWhenSignedIn(current, next).catch((error) => {
      console.error("Firestore-synk misslyckades", error);
    });
  }, 250);
}

async function pushWhenSignedIn(uid: string, state: Persisted) {
  if (!firebaseConfigured()) return;
  const auth = firebaseAuth();
  if (!auth.currentUser) {
    await new Promise<void>((resolve) => {
      const stop = onAuthStateChanged(auth, () => {
        stop();
        resolve();
      });
    });
  }
  if (auth.currentUser?.uid !== uid) return;
  await pushState(uid, state);
}

export function watchAuth(onSignedIn: (uid: string) => void) {
  if (!firebaseConfigured()) return () => undefined;
  return onAuthStateChanged(firebaseAuth(), (user) => {
    if (!user) return;
    setCloudSession(user.uid);
    onSignedIn(user.uid);
  });
}

export async function hydrateCloud(uid: string, apply: (remote: CloudState) => void) {
  setHydrating(true);
  setCloudSession(null);
  try {
    const remote = await pullState(uid);
    if (remote?.user) apply(remote);
  } finally {
    setHydrating(false);
    setCloudSession(uid);
  }
}
