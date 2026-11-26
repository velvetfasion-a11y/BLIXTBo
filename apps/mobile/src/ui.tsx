import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewProps } from "react-native";
import { theme } from "@/src/theme";

export function Screen({ children, style }: ViewProps) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={theme.faint} style={styles.input} {...props} />
    </View>
  );
}

export function Button({
  label,
  onPress,
  disabled,
  tone = "pine",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "pine" | "outline" | "danger";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === "outline" && styles.outline,
        tone === "danger" && styles.danger,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonText, tone === "outline" && styles.outlineText]}>{label}</Text>
    </Pressable>
  );
}

export function ErrorText({ children }: { children: string }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.paper, padding: 20 },
  card: {
    backgroundColor: theme.card,
    borderColor: theme.line,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  field: { marginBottom: 14 },
  label: { color: theme.soft, fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: theme.card,
    borderColor: theme.line,
    borderRadius: 14,
    borderWidth: 1,
    color: theme.ink,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: {
    alignItems: "center",
    backgroundColor: theme.pine,
    borderRadius: 14,
    marginTop: 8,
    paddingVertical: 14,
  },
  outline: { backgroundColor: "transparent", borderColor: theme.line, borderWidth: 1 },
  danger: { backgroundColor: theme.danger },
  outlineText: { color: theme.ink },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  error: { color: theme.danger, marginTop: 8 },
  muted: { color: theme.soft, fontSize: 15, lineHeight: 22 },
});
