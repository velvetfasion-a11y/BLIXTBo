import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { apiFetch } from "@/src/api";

const TOKEN_KEY = "blixtbo-push-token";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function enablePush() {
  if (!Device.isDevice) throw new Error("Aviseringar kan bara slås på på en riktig iPhone.");
  const current = await Notifications.getPermissionsAsync();
  const next = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
  if (next.status !== "granted") throw new Error("Aviseringar är avstängda i iOS-inställningarna. Appen fungerar ändå.");
  const device = await Notifications.getDevicePushTokenAsync();
  const token = String(device.data);
  const { response, detail } = await apiFetch("/devices", {
    method: "POST",
    body: JSON.stringify({ token, platform: "ios", kind: "apns" }),
  });
  if (!response.ok) throw new Error(detail || "Enheten kunde inte registreras.");
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  await AsyncStorage.setItem(TOKEN_KEY, token);
  return token;
}

export async function disablePush() {
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    await apiFetch("/devices/remove", { method: "POST", body: JSON.stringify({ token }) }).catch(() => undefined);
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

export async function pushEnabled() {
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  return Boolean(await AsyncStorage.getItem(TOKEN_KEY));
}
