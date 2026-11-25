/** Which Firebase user the local store should mirror. Null for the demo account. */

const UID_KEY = "blixtbo-firebase-uid";

let uid: string | null = null;
let hydrating = false;

export function setCloudSession(next: string | null) {
  uid = next;
  if (typeof sessionStorage === "undefined") return;
  if (next) sessionStorage.setItem(UID_KEY, next);
  else sessionStorage.removeItem(UID_KEY);
}

export function cloudUid() {
  if (uid) return uid;
  if (typeof sessionStorage === "undefined") return null;
  uid = sessionStorage.getItem(UID_KEY);
  return uid;
}

export function setHydrating(next: boolean) {
  hydrating = next;
}

export function isHydrating() {
  return hydrating;
}
