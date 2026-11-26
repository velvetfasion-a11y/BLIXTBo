import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { listingById } from "@/app/(tabs)/hem";
import { apiFetch } from "@/src/api";
import { kronor } from "@/src/format";
import { theme } from "@/src/theme";
import { Button, ErrorText, Muted } from "@/src/ui";

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listing = listingById(String(id ?? ""));
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  if (!listing) {
    return (
      <View style={styles.screen}>
        <Muted>Annonsen finns inte kvar i listan. Gå tillbaka och hämta den igen.</Muted>
      </View>
    );
  }

  async function apply() {
    if (!listing) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      const { response, detail } = await apiFetch(`/listings/${listing.id}/apply`, {
        method: "POST",
        body: JSON.stringify({
          source_id: listing.sourceId,
          confirmed: true,
          confirmation: "Jag bekräftar intresseanmälan i Blixtbo.",
          object_ad_id: listing.objectAdId,
          lagenhet_id: listing.lagenhetId,
          annons_id: listing.annonsId,
          refid: listing.refid,
          qasa_id: listing.qasaId,
          listing_url: listing.url,
        }),
      });
      if (!response.ok) throw new Error(detail || "Ansökan kunde inte köas.");
      setDone("Köad. Ingenting skickas till hyresvärden förrän servern kör jobbet, och dry-run loggar inte in.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ansökan kunde inte köas.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>{listing.address}</Text>
      <Muted>
        {[listing.area, listing.city].filter(Boolean).join(", ")} · {listing.rooms} rum · {listing.sqm} m²
      </Muted>
      <Text style={styles.rent}>{kronor(listing.rent)}/mån</Text>
      <Text style={styles.source}>{listing.sourceName || listing.sourceId}</Text>
      {listing.messageApply ? (
        <>
          <Muted>Blixtbo skickar inte meddelandet åt dig. Öppna annonsen och skicka själv.</Muted>
          {listing.url ? <Button label="Öppna annonsen" onPress={() => void Linking.openURL(listing.url)} tone="outline" /> : null}
        </>
      ) : (
        <>
          {listing.bindingApply ? (
            <Muted>Intresset kan bli bindande hos hyresvärden. Ingenting skickas förrän du bekräftar här.</Muted>
          ) : (
            <Muted>En intresseanmälan köas via Blixtbos API. Appen loggar inte in hos hyresvärden själv.</Muted>
          )}
          <Button
            label={confirmed ? "Bekräftad" : "Jag vill skicka intresseanmälan"}
            onPress={() => setConfirmed(true)}
            tone={confirmed ? "pine" : "outline"}
          />
          <Button disabled={!confirmed || busy} label={busy ? "Köar…" : "Skicka"} onPress={() => void apply()} />
        </>
      )}
      {done ? <Text style={styles.done}>{done}</Text> : null}
      <ErrorText>{error}</ErrorText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.paper, flexGrow: 1, padding: 20 },
  title: { color: theme.ink, fontSize: 28, fontWeight: "700" },
  rent: { color: theme.pineDeep, fontSize: 20, fontWeight: "700", marginTop: 12 },
  source: { color: theme.faint, marginBottom: 16, marginTop: 4 },
  done: { color: theme.pineDeep, marginTop: 12 },
});
