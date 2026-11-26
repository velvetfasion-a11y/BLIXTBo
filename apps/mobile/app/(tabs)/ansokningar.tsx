import { collection, getDocs } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text } from "react-native";
import { applicationStatus, when } from "@/src/format";
import { firebaseAuth, firebaseConfigured, firebaseDb } from "@/src/firebase";
import { theme } from "@/src/theme";
import type { ApplicationRow } from "@/src/types";
import { ErrorText, Muted } from "@/src/ui";

type ApplicationResult = { error: string; rows: ApplicationRow[] };

async function fetchApplications(): Promise<ApplicationResult> {
  if (!firebaseConfigured()) return { error: "Firebase är inte konfigurerat.", rows: [] };
  const user = firebaseAuth().currentUser;
  if (!user) return { error: "", rows: [] };
  try {
    const snap = await getDocs(collection(firebaseDb(), "users", user.uid, "applications"));
    return {
      error: "",
      rows: snap.docs.map((item) => ({ ...(item.data() as ApplicationRow), id: item.id })),
    };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Ansökningarna kunde inte hämtas.", rows: [] };
  }
}

export default function ApplicationsScreen() {
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const apply = useCallback((result: ApplicationResult) => {
    setError(result.error);
    setRows(result.rows);
  }, []);
  const refresh = useCallback(() => {
    setRefreshing(true);
    return fetchApplications().then(apply).finally(() => setRefreshing(false));
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    void fetchApplications().then((result) => {
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
      ListEmptyComponent={<Muted>Inga ansökningar på kontot ännu.</Muted>}
      ListHeaderComponent={<ErrorText>{error}</ErrorText>}
      refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor={theme.pine} />}
      renderItem={({ item }) => (
        <Text style={styles.card}>
          <Text style={styles.title}>{applicationStatus(item.status)}</Text>
          {"\n"}
          <Text style={styles.meta}>{item.note || item.listingId || "Ansökan"} · {when(item.appliedAt)}</Text>
        </Text>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: theme.paper, flexGrow: 1, padding: 16 },
  card: { backgroundColor: theme.card, borderColor: theme.line, borderRadius: 18, borderWidth: 1, marginBottom: 12, overflow: "hidden", padding: 16 },
  title: { color: theme.ink, fontSize: 17, fontWeight: "700" },
  meta: { color: theme.soft },
});
