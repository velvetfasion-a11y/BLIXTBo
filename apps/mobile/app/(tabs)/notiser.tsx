import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { apiFetch } from "@/src/api";
import { routeFromNotice } from "@/src/links";
import { theme } from "@/src/theme";
import type { Notice } from "@/src/types";
import { ErrorText, Muted } from "@/src/ui";
import { when } from "@/src/format";

async function fetchNotices() {
  const { response, data, detail } = await apiFetch("/notices");
  if (!response.ok || !Array.isArray(data)) return { error: detail || "Notiserna kunde inte hämtas.", rows: [] as Notice[] };
  return { error: "", rows: data as Notice[] };
}

export default function NoticesScreen() {
  const [rows, setRows] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const apply = useCallback((result: { error: string; rows: Notice[] }) => {
    setError(result.error);
    setRows(result.rows);
  }, []);
  const refresh = useCallback(() => {
    setRefreshing(true);
    return fetchNotices().then(apply).finally(() => setRefreshing(false));
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    void fetchNotices().then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  async function open(notice: Notice) {
    setRows((current) => current.map((item) => (item.id === notice.id ? { ...item, read: true } : item)));
    await apiFetch(`/notices/${notice.id}/read`, { method: "POST" }).catch(() => undefined);
    router.push(routeFromNotice(notice.kind));
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={rows}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={<Muted>Inga notiser ännu. Aviseringar på telefonen är valfria.</Muted>}
      ListHeaderComponent={<ErrorText>{error}</ErrorText>}
      refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor={theme.pine} />}
      renderItem={({ item }) => (
        <Pressable accessibilityRole="button" onPress={() => void open(item)} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.title}>{item.title}</Text>
            {item.read ? null : <View style={styles.dot} />}
          </View>
          <Text style={styles.body}>{item.body}</Text>
          <Text style={styles.time}>{when(item.at)}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: theme.paper, flexGrow: 1, padding: 16 },
  card: { backgroundColor: theme.card, borderColor: theme.line, borderRadius: 18, borderWidth: 1, marginBottom: 12, padding: 16 },
  row: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  title: { color: theme.ink, flex: 1, fontSize: 16, fontWeight: "700" },
  dot: { backgroundColor: theme.pine, borderRadius: 5, height: 10, width: 10 },
  body: { color: theme.soft, marginTop: 6 },
  time: { color: theme.faint, marginTop: 8 },
});
