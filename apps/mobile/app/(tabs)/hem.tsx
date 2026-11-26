import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { apiFetch } from "@/src/api";
import { kronor } from "@/src/format";
import { theme } from "@/src/theme";
import type { Listing } from "@/src/types";
import { ErrorText, Muted } from "@/src/ui";

const cache = new Map<string, Listing>();

export function listingById(id: string) {
  return cache.get(id) ?? null;
}

function asListing(value: unknown): Listing | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<Listing>;
  if (!row.id) return null;
  return {
    id: String(row.id),
    address: String(row.address ?? "Bostad"),
    area: String(row.area ?? ""),
    city: String(row.city ?? ""),
    rent: Number(row.rent ?? 0),
    sqm: Number(row.sqm ?? 0),
    rooms: Number(row.rooms ?? 0),
    sourceId: String(row.sourceId ?? ""),
    sourceName: String(row.sourceName ?? ""),
    title: String(row.title ?? row.address ?? "Bostad"),
    url: String(row.url ?? ""),
    bindingApply: Boolean(row.bindingApply),
    messageApply: Boolean(row.messageApply),
    objectAdId: String(row.objectAdId ?? ""),
    lagenhetId: String(row.lagenhetId ?? ""),
    annonsId: String(row.annonsId ?? ""),
    refid: String(row.refid ?? ""),
    qasaId: String(row.qasaId ?? ""),
  };
}

async function fetchListings() {
  const { response, data, detail } = await apiFetch("/listings?areas=&max_rent=25000&rooms=any&min_sqm=0&min_floor=0");
  if (!response.ok) return { error: detail || "Annonserna kunde inte hämtas.", rows: [] as Listing[] };
  const list = data && typeof data === "object" && "listings" in data ? (data as { listings: unknown[] }).listings : [];
  const next = list.map(asListing).filter((item): item is Listing => item !== null);
  cache.clear();
  for (const item of next) cache.set(item.id, item);
  return { error: "", rows: next };
}

export default function HomeScreen() {
  const [rows, setRows] = useState<Listing[]>([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const apply = useCallback((result: { error: string; rows: Listing[] }) => {
    setError(result.error);
    setRows(result.rows);
  }, []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    return fetchListings()
      .then(apply)
      .finally(() => setRefreshing(false));
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    void fetchListings().then((result) => {
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
      ListEmptyComponent={<Muted>{error ? "" : "Inga annonser just nu. Dra nedåt för att hämta igen."}</Muted>}
      ListHeaderComponent={<ErrorText>{error}</ErrorText>}
      refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor={theme.pine} />}
      renderItem={({ item }) => (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/bostad/${item.id}`)} style={styles.card}>
          <Text style={styles.title}>{item.address}</Text>
          <Text style={styles.meta}>
            {[item.area, item.city].filter(Boolean).join(", ")} · {item.rooms} rum · {item.sqm} m²
          </Text>
          <View style={styles.row}>
            <Text style={styles.rent}>{kronor(item.rent)}/mån</Text>
            <Text style={styles.source}>{item.sourceName}</Text>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: theme.paper, flexGrow: 1, padding: 16 },
  card: { backgroundColor: theme.card, borderColor: theme.line, borderRadius: 18, borderWidth: 1, marginBottom: 12, padding: 16 },
  title: { color: theme.ink, fontSize: 18, fontWeight: "700" },
  meta: { color: theme.soft, marginTop: 4 },
  row: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  rent: { color: theme.pineDeep, fontWeight: "700" },
  source: { color: theme.faint },
});
