import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import {
  EmailAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  updateProfile,
  type UserCredential,
} from "firebase/auth";
import { apiFetch } from "@/src/api";
import { firebaseAuth } from "@/src/firebase";

export async function signInWithApple(): Promise<UserCredential> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const apple = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    nonce: hashedNonce,
  });
  if (!apple.identityToken) throw new Error("Apple gav ingen identitet.");
  const provider = new OAuthProvider("apple.com");
  const credential = provider.credential({ idToken: apple.identityToken, rawNonce });
  const result = await signInWithCredential(firebaseAuth(), credential);
  const name = [apple.fullName?.givenName, apple.fullName?.familyName].filter(Boolean).join(" ").trim();
  if (name && !result.user.displayName) {
    await updateProfile(result.user, { displayName: name }).catch(() => undefined);
  }
  return result;
}

export function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
}

export function createEmailAccount(email: string, password: string) {
  return createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password);
}

export function resetEmailPassword(email: string) {
  return sendPasswordResetEmail(firebaseAuth(), email.trim());
}

export async function reauthenticate(password?: string) {
  const user = firebaseAuth().currentUser;
  if (!user) throw new Error("Logga in igen.");
  const providers = user.providerData.map((item) => item.providerId);
  if (providers.includes("apple.com")) {
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    const apple = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
    if (!apple.identityToken) throw new Error("Apple gav ingen identitet.");
    const provider = new OAuthProvider("apple.com");
    await reauthenticateWithCredential(user, provider.credential({ idToken: apple.identityToken, rawNonce }));
    return;
  }
  if (providers.includes("password") && user.email && password) {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    return;
  }
  throw new Error("Logga ut och in igen, och upprepa sedan valet.");
}

export async function linkApi() {
  const { response, detail } = await apiFetch("/auth/firebase", { method: "POST", body: "{}" });
  if (!response.ok) throw new Error(detail || "Kontot kunde inte kopplas till Blixtbo.");
}

export function authError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code ?? "") : "";
  if (code === "ERR_REQUEST_CANCELED" || code === "auth/cancelled-popup-request") return "Inloggningen avbröts.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found" || code === "auth/invalid-email") {
    return "E-post eller lösenord stämmer inte.";
  }
  if (code === "auth/email-already-in-use") return "Det finns redan ett konto med den e-postadressen. Logga in i stället.";
  if (code === "auth/weak-password") return "Lösenordet måste vara minst sex tecken.";
  if (code === "auth/too-many-requests") return "För många försök. Vänta en stund och prova igen.";
  if (error instanceof Error && error.message) return error.message;
  return "Det gick inte att logga in.";
}
