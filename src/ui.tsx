import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

// Brand palette (logo/kit/GUIDELINES.md). Coral is decorative only: too low-contrast for text.
export const colors = {
  navy: "#1A3F8F",
  coral: "#FF6B5B",
  cream: "#FFF4E6",
  muted: "#5A6480",
  line: "#EADBC8",
  error: "#B3261E",
};

export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>{children}</ScrollView>
    </SafeAreaView>
  );
}

export function Btn(props: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.btn,
        props.secondary && styles.btnSecondary,
        (pressed || props.disabled) && { opacity: props.disabled ? 0.4 : 0.8 },
      ]}
    >
      <Text style={[styles.btnText, props.secondary && { color: colors.navy }]}>{props.title}</Text>
    </Pressable>
  );
}

export const Logo = () => (
  <Image source={require("../assets/logo.png")} style={styles.logo} resizeMode="contain" accessibilityLabel="Sanalukko" />
);

export function Progress({ value }: { value: number }) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.min(1, Math.max(0, value)) * 100}%` }]} />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  container: { padding: 24, gap: 12 },
  logo: { width: 191, height: 50, marginBottom: 8 },
  bar: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.line },
  pad: { paddingHorizontal: 24, paddingVertical: 8 },
  h1: { fontSize: 28, fontWeight: "700", color: colors.navy },
  h2: { fontSize: 18, fontWeight: "600", marginTop: 12, color: colors.navy },
  p: { fontSize: 15, color: colors.muted, flexShrink: 1 },
  big: { fontSize: 22, fontWeight: "600", color: colors.navy },
  warn: { fontSize: 15, color: colors.error },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  btn: { backgroundColor: colors.navy, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, alignItems: "center" },
  btnSecondary: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.navy },
  btnText: { color: colors.cream, fontSize: 16, fontWeight: "600" },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.line, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 5, backgroundColor: colors.coral },
  search: { marginHorizontal: 24, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.navy },
});
