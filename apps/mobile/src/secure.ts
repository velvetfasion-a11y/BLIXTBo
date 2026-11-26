import * as SecureStore from "expo-secure-store";

const FORBIDDEN_KEY = "blixtbo.landlord-password";

/** Landlord passwords are never written to the Keychain or anywhere else on device. */
export function cacheLandlordPassword(_password: string): Promise<void> {
  return Promise.reject(new Error("Hyresvärdens lösenord sparas inte på enheten."));
}

export async function clearCachedSecrets() {
  await SecureStore.deleteItemAsync(FORBIDDEN_KEY).catch(() => undefined);
}

export function assertSecureApi(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("API-adressen är ogiltig.");
  }
  if (parsed.protocol === "https:") return;
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol === "http:" && local && process.env.EXPO_PUBLIC_ALLOW_INSECURE_API === "1") return;
  throw new Error("Anropet stoppades. Lösenord och konto skickas bara över HTTPS.");
}
