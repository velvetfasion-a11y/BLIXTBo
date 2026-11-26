import * as AppleAuthentication from "expo-apple-authentication";
import { Link, router } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authError, createEmailAccount, linkApi, resetEmailPassword, signInWithApple, signInWithEmail } from "@/src/auth";
import { firebaseConfigured } from "@/src/firebase";
import { LEGAL } from "@/src/purchases";
import { theme } from "@/src/theme";
import { Button, ErrorText, Field, Muted } from "@/src/ui";
import * as Linking from "expo-linking";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function finish(action: () => Promise<unknown>) {
    setError("");
    if (!firebaseConfigured()) {
      setError("Firebase är inte konfigurerat. Lägg in EXPO_PUBLIC_FIREBASE_* i appens miljö.");
      return;
    }
    setBusy(true);
    try {
      await action();
      await linkApi();
      setPassword("");
      router.replace("/hem");
    } catch (caught) {
      setError(authError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.kicker}>Blixtbo</Text>
      <Text style={styles.title}>Logga in</Text>
      <Muted>Apple använder samma konto som på blixtbo.se. E-post skapar eller öppnar ett Firebase-konto i samma projekt.</Muted>
      {Platform.OS === "ios" ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={14}
          onPress={() => void finish(signInWithApple)}
          style={styles.apple}
        />
      ) : null}
      <Field autoCapitalize="none" autoCorrect={false} keyboardType="email-address" label="E-post" onChangeText={setEmail} textContentType="emailAddress" value={email} />
      <Field
        autoCapitalize="none"
        label="Lösenord"
        onChangeText={setPassword}
        secureTextEntry
        textContentType={mode === "up" ? "newPassword" : "password"}
        value={password}
      />
      <Button
        disabled={busy}
        label={busy ? "Vänta…" : mode === "up" ? "Skapa konto" : "Logga in med e-post"}
        onPress={() => void finish(() => (mode === "up" ? createEmailAccount(email, password) : signInWithEmail(email, password)))}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setMode(mode === "up" ? "in" : "up");
          setError("");
        }}
      >
        <Text style={styles.link}>{mode === "up" ? "Jag har redan ett konto" : "Skapa konto med e-post"}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => void resetEmailPassword(email).then(() => setError("")).catch((caught) => setError(authError(caught)))}>
        <Text style={styles.link}>Glömt lösenordet</Text>
      </Pressable>
      <ErrorText>{error}</ErrorText>
      <View style={styles.legal}>
        <Text style={styles.legalText} onPress={() => void Linking.openURL(LEGAL.terms)}>
          Villkor
        </Text>
        <Text style={styles.legalText} onPress={() => void Linking.openURL(LEGAL.privacy)}>
          Integritet
        </Text>
      </View>
      <Link href="/onboarding" style={styles.back}>
        Tillbaka
      </Link>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: theme.paper, flex: 1, padding: 24 },
  kicker: { color: theme.pine, fontWeight: "700", marginTop: 12 },
  title: { color: theme.ink, fontSize: 34, fontWeight: "700", marginBottom: 8 },
  apple: { height: 48, marginVertical: 18, width: "100%" },
  link: { color: theme.pineDeep, marginTop: 14, textAlign: "center" },
  legal: { flexDirection: "row", gap: 16, justifyContent: "center", marginTop: 28 },
  legalText: { color: theme.soft, textDecorationLine: "underline" },
  back: { color: theme.faint, marginTop: 18, textAlign: "center" },
});
