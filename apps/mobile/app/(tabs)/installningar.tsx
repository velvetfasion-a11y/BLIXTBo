import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text } from "react-native";
import { apiFetch } from "@/src/api";
import { authError, reauthenticate } from "@/src/auth";
import { hasPremium, when } from "@/src/format";
import { LEGAL } from "@/src/purchases";
import { disablePush, enablePush, pushEnabled } from "@/src/push";
import { useSession } from "@/src/session";
import { theme } from "@/src/theme";
import { Button, ErrorText, Field, Muted } from "@/src/ui";

const CHOICES = [
  {
    id: "erasure",
    title: "Radera alla uppgifter om mig",
    body: "Profil, ansökningar, notiser och sparade hyresvärdsinloggningar tas bort. Firebase-kontot tas bort. En Stripe-prenumeration avslutas. En Apple-prenumeration måste du avsluta själv under Inställningar på iPhone.",
  },
  {
    id: "account",
    title: "Radera bara Blixtbo-kontot",
    body: "Du kan inte logga in. Profil och sparade hyresvärdsinloggningar lämnas kvar. Det här räcker inte ensamt som radering av alla uppgifter.",
  },
  {
    id: "links",
    title: "Koppla bort hyresvärdar",
    body: "Sparade inloggningar hos hyresvärdar tas bort. Blixtbo-kontot finns kvar.",
  },
] as const;

export default function SettingsScreen() {
  const session = useSession();
  const [push, setPush] = useState(false);
  const [choice, setChoice] = useState<(typeof CHOICES)[number]["id"] | null>(null);
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const premium = hasPremium(session.entitlement);

  useEffect(() => {
    void pushEnabled().then(setPush).catch(() => undefined);
  }, []);

  async function togglePush(next: boolean) {
    setError("");
    setBusy(true);
    try {
      if (next) await enablePush();
      else await disablePush();
      setPush(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Aviseringen kunde inte ändras.");
      setPush(await pushEnabled().catch(() => false));
    } finally {
      setBusy(false);
    }
  }

  async function remove(retried: boolean) {
    if (!choice || phrase.trim() !== "RADERA") return;
    setBusy(true);
    setError("");
    const { response, detail } = await apiFetch("/account/delete", {
      method: "POST",
      body: JSON.stringify({ scope: choice, confirm: "RADERA" }),
    });
    if (response.status === 401 && detail === "recent-login-required" && !retried) {
      await reauthenticate(password);
      setPassword("");
      setBusy(false);
      await remove(true);
      return;
    }
    if (!response.ok) throw new Error(detail || "Inget är raderat.");
    setPhrase("");
    setPassword("");
    if (choice === "links") {
      setDone("Hyresvärdarnas inloggningar är borttagna. Kontot finns kvar.");
      setChoice(null);
      return;
    }
    await session.signOut();
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.name}>{session.user?.displayName || "Ditt konto"}</Text>
      <Muted>{session.user?.email || "Ingen e-post på kontot"}</Muted>
      <Button label={premium ? "Premium är igång" : "Blixtbo Premium"} onPress={() => router.push("/premium")} tone="outline" />
      {session.entitlement.currentPeriodEnd ? <Muted>Gäller till {when(session.entitlement.currentPeriodEnd)}</Muted> : null}
      <Text style={styles.section}>Aviseringar</Text>
      <Muted>Valfritt. Appen fungerar utan push. En avisering öppnar rätt skärm.</Muted>
      <Switch
        accessibilityLabel="Aviseringar"
        disabled={busy}
        onValueChange={(value) => void togglePush(value)}
        thumbColor="#fff"
        trackColor={{ false: theme.line, true: theme.pine }}
        value={push}
      />
      <Text style={styles.section}>Hjälp</Text>
      <Button label="Villkor" onPress={() => void Linking.openURL(LEGAL.terms)} tone="outline" />
      <Button label="Integritet" onPress={() => void Linking.openURL(LEGAL.privacy)} tone="outline" />
      <Button label="Kontakta support" onPress={() => void Linking.openURL(LEGAL.support)} tone="outline" />
      <Button label="Rapportera ett fel" onPress={() => void Linking.openURL(LEGAL.bug)} tone="outline" />
      <Button label="Logga ut" onPress={() => void session.signOut()} tone="outline" />
      <Text style={styles.section}>Radera</Text>
      <Muted>Skriv RADERA för att bekräfta. Apple-prenumerationen avslutas inte av den här knappen.</Muted>
      {CHOICES.map((item) => (
        <Button key={item.id} label={item.title} onPress={() => { setChoice(item.id); setDone(""); setError(""); }} tone={choice === item.id ? "pine" : "outline"} />
      ))}
      {choice ? (
        <>
          <Muted>{CHOICES.find((item) => item.id === choice)?.body}</Muted>
          <Field autoCapitalize="characters" label="Skriv RADERA" onChangeText={setPhrase} value={phrase} />
          <Field autoCapitalize="none" label="Lösenord om iOS ber dig logga in igen" onChangeText={setPassword} secureTextEntry value={password} />
          <Button
            disabled={busy || phrase.trim() !== "RADERA"}
            label={busy ? "Arbetar…" : "Bekräfta"}
            onPress={() => void remove(false).catch((caught) => setError(authError(caught))).finally(() => setBusy(false))}
            tone="danger"
          />
        </>
      ) : null}
      {done ? <Text style={styles.done}>{done}</Text> : null}
      <ErrorText>{error}</ErrorText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.paper, flexGrow: 1, padding: 20 },
  name: { color: theme.ink, fontSize: 28, fontWeight: "700" },
  section: { color: theme.ink, fontSize: 18, fontWeight: "700", marginTop: 22 },
  done: { color: theme.pineDeep, marginTop: 12 },
});
