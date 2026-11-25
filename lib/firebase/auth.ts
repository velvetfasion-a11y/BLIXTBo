import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type UserCredential,
} from "firebase/auth";
import { firebaseAuth, firebaseConfigured, usingEmulators } from "@/lib/firebase/client";
import { googleErrorMessage, isMobileSafari, isPopupBlocked } from "@/lib/firebase/google-browser";

export { googleErrorMessage, isMobileSafari, isPopupBlocked };

let redirectResult: Promise<UserCredential | null> | null = null;

function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

function redirectToGoogle(auth: ReturnType<typeof firebaseAuth>, provider: GoogleAuthProvider) {
  return signInWithRedirect(auth, provider).then(() => null);
}

/**
 * Popup first. Mobile Safari and blocked popups use a full-page redirect;
 * call `takeGoogleRedirectResult` on the next load to finish that sign-in.
 * Resolves to null when the browser is leaving for Google.
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
  const provider = googleProvider();
  if (isMobileSafari()) return redirectToGoogle(auth, provider);
  try {
    return await signInWithPopup(auth, provider);
  } catch (error) {
    if (!isPopupBlocked(error)) throw error;
    return redirectToGoogle(auth, provider);
  }
}

/** Result of a redirect started by `signInWithGoogle`. Safe to call more than once. */
export function takeGoogleRedirectResult() {
  if (typeof window === "undefined" || !firebaseConfigured() || usingEmulators()) return Promise.resolve(null);
  if (!redirectResult) redirectResult = getRedirectResult(firebaseAuth());
  return redirectResult;
}

export async function signOutGoogle() {
  if (!firebaseConfigured()) return;
  await signOut(firebaseAuth());
}
