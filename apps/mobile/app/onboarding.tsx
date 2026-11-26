import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/src/session";
import { theme } from "@/src/theme";
import { Button, Muted } from "@/src/ui";

const PAGES = [
  {
    title: "Hinna se bostäderna",
    body: "Blixtbo samlar hyresannonser och håller koll på dina ansökningar. Blixtbo hyr inte ut bostäder och förmedlar inga kontrakt.",
  },
  {
    title: "Dina egna konton",
    body: "Du kan själv lämna inloggningen till en hyresvärd. Lösenordet skickas krypterat och sparas inte i klartext på telefonen. BankID gör du hos hyresvärden, inte i Blixtbo.",
  },
  {
    title: "Premium och aviseringar är valfria",
    body: "Appen går att använda utan att betala och utan push. Premium är en prenumeration i App Store, 99 kr i månaden efter 3 dagars prov.",
  },
];

export default function Onboarding() {
  const session = useSession();
  const [page, setPage] = useState(0);
  const current = PAGES[page] ?? PAGES[0];
  const last = page === PAGES.length - 1;

  async function finish() {
    await session.completeOnboarding();
    router.replace("/sign-in");
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.mark}>
        <Text style={styles.bolt}>⚡</Text>
      </View>
      <Text style={styles.title}>{current.title}</Text>
      <Muted>{current.body}</Muted>
      <View style={styles.dots}>
        {PAGES.map((item, index) => (
          <View key={item.title} style={[styles.dot, index === page && styles.dotOn]} />
        ))}
      </View>
      <Button label={last ? "Kom igång" : "Nästa"} onPress={() => (last ? void finish() : setPage(page + 1))} />
      {last ? null : (
        <Pressable accessibilityRole="button" onPress={() => void finish()} style={styles.skip}>
          <Text style={styles.skipText}>Hoppa över</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: theme.paper, flex: 1, justifyContent: "flex-end", padding: 24 },
  mark: {
    alignItems: "center",
    backgroundColor: theme.pine,
    borderRadius: 28,
    height: 88,
    justifyContent: "center",
    marginBottom: 28,
    width: 88,
  },
  bolt: { fontSize: 42 },
  title: { color: theme.ink, fontSize: 32, fontWeight: "700", marginBottom: 12 },
  dots: { flexDirection: "row", gap: 8, marginVertical: 28 },
  dot: { backgroundColor: theme.line, borderRadius: 4, height: 8, width: 8 },
  dotOn: { backgroundColor: theme.pine, width: 22 },
  skip: { alignItems: "center", padding: 14 },
  skipText: { color: theme.soft },
});
