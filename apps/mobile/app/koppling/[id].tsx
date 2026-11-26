import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { apiFetch } from "@/src/api";
import { connectionStatus, when } from "@/src/format";
import { clearCachedSecrets } from "@/src/secure";
import { theme } from "@/src/theme";
import type { Connection, Landlord } from "@/src/types";
import { Button, ErrorText, Field, Muted } from "@/src/ui";

export default function ConnectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sourceId = String(id ?? "");
  const [landlord, setLandlord] = useState<Landlord | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([apiFetch("/landlords"), apiFetch("/connections")]).then(([landlords, connections]) => {
      if (!active) return;
      const list = Array.isArray(landlords.data) ? (landlords.data as Landlord[]) : [];
      const found = list.find((item) => item.id === sourceId) ?? null;
      setLandlord(found);
      const linked = Array.isArray(connections.data) ? (connections.data as Connection[]) : [];
      const row = linked.find((item) => item.source_id === sourceId) ?? null;
      setConnection(row);
      if (row?.username) setUsername(row.username);
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : "Kunde inte hämta kopplingen.");
    });
    return () => {
      active = false;
    };
  }, [sourceId]);

  async function save() {
    setBusy(true);
    setError("");
    setDone("");
    const secret = password;
    setPassword("");
    try {
      const { response, detail } = await apiFetch(`/connections/${sourceId}/credentials`, {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password: secret }),
      });
      await clearCachedSecrets();
      if (!response.ok) throw new Error(detail || "Lösenordet kunde inte sparas.");
      setDone("Skickat över HTTPS. Det lagras krypterat hos Blixtbo och ligger inte kvar i appen.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Lösenordet kunde inte sparas.");
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    setBusy(true);
    setError("");
    const { response, detail } = await apiFetch(`/connections/${sourceId}/resume`, { method: "POST" });
    setBusy(false);
    if (!response.ok) setError(detail || "Det gick inte att försöka igen.");
    else setDone("Ett nytt försök är köat. Inget nytt lösenord skickades.");
  }

  const bankOnly = Boolean(landlord && landlord.requiresBankid && !landlord.acceptsPassword);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>{landlord?.name || "Hyresvärd"}</Text>
      <Muted>
        {connectionStatus(connection?.status ?? "none")}. Senast inloggad: {when(connection?.last_login_at)}
      </Muted>
      {connection?.last_error ? <Text style={styles.warn}>{connection.last_error}</Text> : null}
      {bankOnly ? (
        <Muted>Den här hyresvärden använder BankID. Logga in på deras sida på din egen enhet. Blixtbo tar inte emot BankID.</Muted>
      ) : (
        <>
          <Muted>Skriv användarnamn och lösenord på nytt när det behöver bytas. Appen sparar dem inte.</Muted>
          <Field autoCapitalize="none" autoCorrect={false} label="Användarnamn" onChangeText={setUsername} value={username} />
          <Field autoCapitalize="none" label="Lösenord" onChangeText={setPassword} secureTextEntry textContentType="password" value={password} />
          <Button disabled={busy || !username.trim() || !password} label={busy ? "Skickar…" : connection ? "Spara lösenordet igen" : "Koppla"} onPress={() => void save()} />
          {connection ? <Button disabled={busy} label="Försök igen utan nytt lösenord" onPress={() => void retry()} tone="outline" /> : null}
        </>
      )}
      {done ? <Text style={styles.done}>{done}</Text> : null}
      <ErrorText>{error}</ErrorText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.paper, flexGrow: 1, padding: 20 },
  title: { color: theme.ink, fontSize: 28, fontWeight: "700", marginBottom: 8 },
  warn: { color: theme.danger, marginVertical: 8 },
  done: { color: theme.pineDeep, marginTop: 12 },
});
