import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { hasPremium, when } from "@/src/format";
import { LEGAL, accountToken, buyPremium, loadStorePrice, openSubscriptionManagement, restorePremium, subscriptionDisclosure } from "@/src/purchases";
import { useSession } from "@/src/session";
import { theme } from "@/src/theme";
import { Button, ErrorText, Muted } from "@/src/ui";

export default function PremiumScreen() {
  const session = useSession();
  const [price, setPrice] = useState("99 kr");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const premium = hasPremium(session.entitlement);

  useEffect(() => {
    let active = true;
    void loadStorePrice()
      .then((next) => {
        if (active) setPrice(next);
      })
      .catch(() => {
        if (active) setPrice("99 kr");
      });
    return () => {
      active = false;
    };
  }, []);

  async function buy() {
    setBusy(true);
    setError("");
    try {
      const token = await accountToken();
      await buyPremium(token);
      await session.refreshEntitlement();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Köpet kunde inte startas.");
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    setError("");
    try {
      await restorePremium();
      await session.refreshEntitlement();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Inga köp kunde återställas.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Blixtbo Premium</Text>
      <Text style={styles.price}>{price}/månad</Text>
      <Muted>3 dagars gratis provperiod. Därefter {price} per månad, tills du säger upp den.</Muted>
      <Muted>{subscriptionDisclosure(price)}</Muted>
      {premium ? (
        <Muted>
          Premium är {session.entitlement.status === "trialing" ? "i provperiod" : "igång"}
          {session.entitlement.source === "apple" ? " via App Store" : ""}.
          {session.entitlement.cancelAtPeriodEnd ? " Den är uppsagd och gäller tills perioden tar slut." : ""}
          {session.entitlement.currentPeriodEnd ? ` Till ${when(session.entitlement.currentPeriodEnd)}.` : ""}
        </Muted>
      ) : (
        <Button disabled={busy} label={busy ? "Väntar på App Store…" : "Starta 3 dagar gratis"} onPress={() => void buy()} />
      )}
      <Button disabled={busy} label="Återställ köp" onPress={() => void restore()} tone="outline" />
      <Button disabled={busy} label="Hantera i App Store" onPress={() => void openSubscriptionManagement().catch((caught) => setError(caught instanceof Error ? caught.message : "App Store kunde inte öppnas."))} tone="outline" />
      <Text style={styles.links} onPress={() => void Linking.openURL(LEGAL.terms)}>Villkor</Text>
      <Text style={styles.links} onPress={() => void Linking.openURL(LEGAL.privacy)}>Integritetspolicy</Text>
      <Text style={styles.links} onPress={() => void Linking.openURL(LEGAL.appleEula)}>Apples standardlicensavtal (EULA)</Text>
      <ErrorText>{error}</ErrorText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.paper, flexGrow: 1, padding: 20 },
  title: { color: theme.ink, fontSize: 28, fontWeight: "700" },
  price: { color: theme.pineDeep, fontSize: 22, fontWeight: "700", marginVertical: 8 },
  links: { color: theme.pineDeep, marginTop: 14, textDecorationLine: "underline" },
});
