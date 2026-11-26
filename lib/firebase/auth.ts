import {
  GoogleAuthProvider,
  OAuthProvider,
  getAdditionalUserInfo,
  getRedirectResult,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type AuthProvider,
  type UserCredential,
} from "firebase/auth";
import { firebaseAuth, firebaseConfigured, usingEmulators } from "@/lib/firebase/client";
import { appleDisplayName, appleErrorMessage, googleErrorMessage, isMobileSafari, isPopupBlocked } from "@/lib/firebase/google-browser";

export { appleDisplayName, appleErrorMessage, googleErrorMessage, isMobileSafari, isPopupBlocked };

const PENDING_KEY = "blixtbo-auth-redirect";
let redirectResult: Promise<UserCredential | null> | null = null;

type ProviderName = "google" | "apple";

function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

function appleProvider() {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  provider.setCustomParameters({ locale: "sv_SE" });
  return provider;
}

function rememberRedirect(provider: ProviderName) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(PENDING_KEY, provider);
}

export function consumeRedirectProvider(): ProviderName | null {
  if (typeof sessionStorage === "undefined") return null;
  const value = sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  return value === "apple" || value === "google" ? value : null;
}

function beginRedirect(auth: ReturnType<typeof firebaseAuth>, provider: AuthProvider, name: ProviderName) {
  rememberRedirect(name);
  return signInWithRedirect(auth, provider).then(() => null);
}

/** Popup first. Mobile Safari and blocked popups use a full-page redirect. */
async function signInWithOAuth(provider: AuthProvider, name: ProviderName): Promise<UserCredential | null> {
  const auth = firebaseAuth();
  if (isMobileSafari()) return beginRedirect(auth, provider, name);
  try {
    return await signInWithPopup(auth, provider);
  } catch (error) {
    if (!isPopupBlocked(error)) throw error;
    return beginRedirect(auth, provider, name);
  }
}

/**
 * Popup first. Mobile Safari and blocked popups use a full-page redirect;
 * call `takeRedirectResult` on the next load to finish that sign-in.
 * Resolves to null when the browser is leaving for the provider.
 */
export async function signInWithGoogle(): Promise<UserCredential | null> {
  if (!firebaseConfigured()) {
    throw new Error("Firebase är inte konfigurerat.");
  }
  const auth = firebaseAuth();
  if (usingEmulators()) {
    const credential = GoogleAuthProvider.credential(
      JSON.stringify({
        sub: "emulator-anna",
        email: "anna.emulator@gmail.com",
        email_verified: true,
        name: "Anna Emulator",
      }),
    );
    return signInWithCredential(auth, credential);
  }
  return signInWithOAuth(googleProvider(), "google");
}

/** Same popup and redirect rules as Google. Apple is not faked when Firebase is off. */
export function signInWithApple(): Promise<UserCredential | null> {
  if (!firebaseConfigured()) {
    throw new Error("Firebase är inte konfigurerat.");
  }
  return signInWithOAuth(appleProvider(), "apple");
}

export function providerMethod(result: UserCredential, fallback: ProviderName | null = null): ProviderName {
  if (result.providerId === "apple.com") return "apple";
  if (result.providerId === "google.com") return "google";
  const ids = result.user.providerData.map((item) => item.providerId);
  if (ids.includes("apple.com") && !ids.includes("google.com")) return "apple";
  return fallback ?? "google";
}

/** Email, and the name Apple only includes the first time. */
export function accountFromProvider(result: UserCredential, method: ProviderName) {
  const info = getAdditionalUserInfo(result);
  const profile = info?.profile ?? null;
  const providerId = method === "apple" ? "apple.com" : "google.com";
  const fromProvider = result.user.providerData.find((item) => item.providerId === providerId)?.displayName;
  const name = method === "apple"
    ? appleDisplayName({ displayName: result.user.displayName || fromProvider, profile })
    : (result.user.displayName || fromProvider || "").trim();
  const profileEmail = profile && typeof profile.email === "string" ? profile.email : "";
  const email = (result.user.email || result.user.providerData.find((item) => item.email)?.email || profileEmail).trim();
  return { name, email };
}

/** Keep Apple's one-time name on the Firebase user so the next sign-in still has it. */
export async function rememberProviderName(result: UserCredential, name: string) {
  const trimmed = name.trim();
  if (!trimmed || result.user.displayName?.trim()) return;
  await updateProfile(result.user, { displayName: trimmed });
}

/** Result of a redirect started by Google or Apple. Safe to call more than once. */
export function takeRedirectResult() {
  if (typeof window === "undefined" || !firebaseConfigured() || usingEmulators()) return Promise.resolve(null);
  if (!redirectResult) redirectResult = getRedirectResult(firebaseAuth());
  return redirectResult;
}

export function takeGoogleRedirectResult() {
  return takeRedirectResult();
}

export async function signOutGoogle() {
  if (!firebaseConfigured()) return;
  await signOut(firebaseAuth());
}
