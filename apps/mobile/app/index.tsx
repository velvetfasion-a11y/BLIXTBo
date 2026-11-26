import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "@/src/session";
import { theme } from "@/src/theme";

export default function Index() {
  const session = useSession();
  if (!session.ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.paper }}>
        <ActivityIndicator color={theme.pine} />
      </View>
    );
  }
  if (!session.onboarded) return <Redirect href="/onboarding" />;
  if (!session.user) return <Redirect href="/sign-in" />;
  return <Redirect href="/hem" />;
}
