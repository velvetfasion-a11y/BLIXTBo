import { GoogleAuthProvider, signInWithCredential, signInWithPopup, signOut } from "firebase/auth";
import { firebaseAuth, firebaseConfigured, usingEmulators } from "@/lib/firebase/client";

export async function signInWithGoogle() {
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
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);
}

export async function signOutGoogle() {
  if (!firebaseConfigured()) return;
  await signOut(firebaseAuth());
}
