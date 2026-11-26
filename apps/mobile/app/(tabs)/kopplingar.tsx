import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text } from "react-native";
import { apiFetch } from "@/src/api";
import { connectionStatus, when } from "@/src/format";
import { theme } from "@/src/theme";
import type { Connection, Landlord } from "@/src/types";
import { ErrorText, Muted } from "@/src/ui";

type Row = Landlord & { connection?: Connection };

async function fetchConnections() {
  const [landlords, connections] = await Promise.all([apiFetch("/landlords"), apiFetch("/connections")]);
  if (!landlords.response.ok || !Array.isArray(landlords.data)) {
    return { error: landlords.detail || "Hyresvärdarna kunde inte hämtas.", rows: [] as Row[] };
  }
  const linked = new Map<string, Connection>();
  if (connections.response.ok && Array.isArray(connections.data)) {
    for (const item of connections.data as Connection[]) linked.set(item.source_id, item);
  }
  return {
    error: "",
    rows: (landlords.data as Landlord[]).map((item) => ({ ...item, connection: linked.get(item.id) })),
  };
}

export default function ConnectionsScreen() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const apply = useCallback((result: { error: string; rows: Row[] }) => {
    setError(result.error);
    setRows(result.rows);
  }, []);
  const refresh = useCallback(() => {
    setRefreshing(true);
    return fetchConnections().then(apply).finally(() => setRefreshing(false));
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    void fetchConnections().then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={rows}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<Muted>Inga hyresvärdar att visa.</Muted>}
      ListHeaderComponent={
        <>
          <Muted>Du lämnar ditt eget konto frivilligt. Lösenordet skickas krypterat och sparas inte på telefonen. Logotyper visas inte här.</Muted>
          <ErrorText>{error}</ErrorText>
        </>
      }
      refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor={theme.pine} />}
      renderItem={({ item }) => (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/koppling/${item.id}`)} style={styles.card}>
          <Text style={styles.title}>{item.name}</Text>
          <Text style={styles.meta}>{connectionStatus(item.connection?.status ?? "none")}</Text>
          <Text style={styles.meta}>Senast inloggad: {when(item.connection?.last_login_at)}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: theme.paper, flexGrow: 1, padding: 16 },
  card: { backgroundColor: theme.card, borderColor: theme.line, borderRadius: 18, borderWidth: 1, marginBottom: 12, padding: 16 },
  title: { color: theme.ink, fontSize: 17, fontWeight: "700" },
  meta: { color: theme.soft, marginTop: 4 },
});
