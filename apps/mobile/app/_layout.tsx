import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/src/session";
import { theme } from "@/src/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.paper } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="bostad/[id]" options={{ headerShown: true, title: "Bostad", headerTintColor: theme.ink }} />
          <Stack.Screen name="premium" options={{ headerShown: true, title: "Premium", headerTintColor: theme.ink }} />
          <Stack.Screen name="koppling/[id]" options={{ headerShown: true, title: "Hyresvärd", headerTintColor: theme.ink }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
