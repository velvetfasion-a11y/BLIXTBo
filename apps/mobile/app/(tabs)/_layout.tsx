import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "@/src/session";
import { theme } from "@/src/theme";

export default function TabsLayout() {
  const session = useSession();
  if (!session.ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.paper }}>
        <ActivityIndicator color={theme.pine} />
      </View>
    );
  }
  if (!session.user) return <Redirect href="/sign-in" />;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.paper },
        headerShadowVisible: false,
        headerTintColor: theme.ink,
        tabBarActiveTintColor: theme.pine,
        tabBarInactiveTintColor: theme.faint,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.line },
      }}
    >
      <Tabs.Screen name="hem" options={{ title: "Annonser", tabBarLabel: "Hem" }} />
      <Tabs.Screen name="ansokningar" options={{ title: "Ansökningar", tabBarLabel: "Ansök" }} />
      <Tabs.Screen name="notiser" options={{ title: "Notiser", tabBarLabel: "Notiser" }} />
      <Tabs.Screen name="kopplingar" options={{ title: "Hyresvärdar", tabBarLabel: "Värdar" }} />
      <Tabs.Screen name="installningar" options={{ title: "Inställningar", tabBarLabel: "Konto" }} />
    </Tabs>
  );
}
