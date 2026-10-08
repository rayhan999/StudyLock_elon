import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, BackHandler, Button, FlatList, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";
import Lock, { AppInfo } from "./modules/studylock-android";

type Editing = "study" | "allowed" | null;

const START_URL = "https://elon.io/";
// Only these sites load inside Sanalukko (elon.io + its login providers), so time here really is study time.
const ALLOWED_HOSTS = ["elon.io", "appleid.apple.com", "accounts.google.com", "facebook.com"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const isAllowedUrl = (url: string) => {
  const host = url.match(/^https?:\/\/([^/:?#]+)/i)?.[1]?.toLowerCase();
  return !host || ALLOWED_HOSTS.some((h) => host === h || host.endsWith("." + h));
};

export default function App() {
  const [, refresh] = useState(0);
  const [config, setConfig] = useState(Lock.getConfig);
  const [draft, setDraft] = useState(config);
  const [editing, setEditing] = useState<Editing>(null);
  const [showSettings, setShowSettings] = useState(false);

  const tick = useCallback(() => refresh((n) => n + 1), []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && tick());
    const timer = setInterval(tick, 30_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [tick]);

  const usage = Lock.hasUsageAccess();
  const service = Lock.isServiceEnabled();
  const minutes = config.setup ? Lock.minutesToday() : 0;
  const locked = config.setup && Lock.isLocked();
  const goalMet = minutes >= config.goal;
  const status = locked ? "🔒" : goalMet ? "✅" : `🔓 free until ${hhmm(config.lockAt)} ·`;

  const save = () => {
    Lock.setConfig(draft.goal, draft.lockAt, draft.study, draft.allowed);
    setConfig(Lock.getConfig());
  };

  if (editing) {
    return (
      <AppPicker
        title={editing === "study" ? "Study apps" : "Always-allowed apps"}
        selected={draft[editing]}
        onChange={(list) => setDraft({ ...draft, [editing]: list })}
        onDone={() => setEditing(null)}
      />
    );
  }

  if (!usage || !service) {
    return (
      <Screen>
        <Text style={styles.h1}>Sanalukko</Text>
        <Text style={styles.p}>
          Until you've studied for your daily goal, Sanalukko sends you back here whenever you open an app that isn't a
          study app or an always-allowed app. Your progress resets every midnight.
        </Text>
        <Text style={styles.h2}>{usage ? "✅" : "1."} Usage access</Text>
        <Text style={styles.p}>Lets Sanalukko measure time spent in your study apps.</Text>
        {!usage && <Button title="Open usage access settings" onPress={() => Lock.openUsageAccess()} />}
        <Text style={styles.h2}>{service ? "✅" : "2."} Accessibility service</Text>
        <Text style={styles.p}>
          Lets Sanalukko see which app is open so it can block it. If Android says the setting is restricted: go to
          App info → ⋮ (top right) → "Allow restricted settings", then try again.
        </Text>
        {!service && (
          <>
            <Button title="Open accessibility settings" onPress={() => Lock.openAccessibility()} />
            <Button title="Open Sanalukko app info" onPress={() => Lock.openAppDetails()} />
          </>
        )}
      </Screen>
    );
  }

  const settings = (
    <>
      <Text style={styles.h2}>Extra study apps (optional)</Text>
      <Text style={styles.p}>Time on elon.io inside Sanalukko always counts. Time in apps picked here counts too.</Text>
      <Button title={`Choose study apps (${draft.study.length})`} onPress={() => setEditing("study")} />
      <Text style={styles.h2}>Always-allowed apps</Text>
      <Text style={styles.p}>Never blocked, e.g. Phone, Messages, Maps, banking.</Text>
      <Button title={`Choose allowed apps (${draft.allowed.length})`} onPress={() => setEditing("allowed")} />
      <Text style={styles.h2}>Daily goal</Text>
      <View style={styles.row}>
        <Button title="−" onPress={() => setDraft({ ...draft, goal: Math.max(5, draft.goal - 5) })} />
        <Text style={styles.big}>{draft.goal} min / day</Text>
        <Button title="+" onPress={() => setDraft({ ...draft, goal: Math.min(120, draft.goal + 5) })} />
      </View>
      <Text style={styles.h2}>Lock starts at</Text>
      <Text style={styles.p}>Apps are free before this time. After it, they stay locked until you reach the goal.</Text>
      <View style={styles.row}>
        <Button title="−" onPress={() => setDraft({ ...draft, lockAt: (draft.lockAt + 1410) % 1440 })} />
        <Text style={styles.big}>{hhmm(draft.lockAt)}</Text>
        <Button title="+" onPress={() => setDraft({ ...draft, lockAt: (draft.lockAt + 30) % 1440 })} />
      </View>
    </>
  );

  if (!config.setup) {
    return (
      <Screen>
        <Text style={styles.h1}>Set up</Text>
        {settings}
        <Button title="Start — lock my apps now" onPress={save} />
      </Screen>
    );
  }

  if (!showSettings) {
    return (
      <StudyView
        header={`${status} ${Math.min(minutes, config.goal)} / ${config.goal} min today`}
        onSettings={() => setShowSettings(true)}
      />
    );
  }

  return (
    <Screen>
      <Button title="← Back to elon.io" onPress={() => setShowSettings(false)} />
      <Text style={styles.h1}>
        {locked ? "🔒 Apps locked" : goalMet ? "✅ Unlocked for today" : `🔓 Free until ${hhmm(config.lockAt)}`}
      </Text>
      <Text style={styles.big}>
        {Math.min(minutes, config.goal)} / {config.goal} min studied
      </Text>
      {!goalMet ? (
        <Text style={styles.p}>Study on elon.io to unlock. Settings unlock once you reach today's goal.</Text>
      ) : (
        <>
          {settings}
          <Button title="Save" onPress={save} />
        </>
      )}
    </Screen>
  );
}

function StudyView({ header, onSettings }: { header: string; onSettings: () => void }) {
  const web = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [startUrl] = useState(() => Lock.getLastUrl() ?? START_URL);

  // Android back button navigates inside the site first.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack) return false;
      web.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, [canGoBack]);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <View style={[styles.row, styles.bar]}>
        <Text style={[styles.big, { flex: 1, fontSize: 17 }]}>{header}</Text>
        <Button title="Settings" onPress={onSettings} />
      </View>
      <WebView
        ref={web}
        source={{ uri: startUrl }}
        style={{ flex: 1 }}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(r) => isAllowedUrl(r.url)}
        onNavigationStateChange={(s) => {
          setCanGoBack(s.canGoBack);
          // Reopen where you left off (only elon.io pages, never a login provider).
          if (/^https:\/\/([^/]+\.)?elon\.io(\/|$)/i.test(s.url) && !s.loading) Lock.setLastUrl(s.url);
        }}
      />
    </SafeAreaView>
  );
}

function AppPicker(props: {
  title: string;
  selected: string[];
  onChange: (list: string[]) => void;
  onDone: () => void;
}) {
  const apps = useMemo<AppInfo[]>(() => Lock.listApps(), []);
  const [query, setQuery] = useState("");
  const shown = apps.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()));
  const toggle = (pkg: string, on: boolean) =>
    props.onChange(on ? [...props.selected, pkg] : props.selected.filter((p) => p !== pkg));

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={[styles.row, styles.pad]}>
        <Text style={[styles.h1, { flex: 1 }]}>{props.title}</Text>
        <Button title="Done" onPress={props.onDone} />
      </View>
      <TextInput style={[styles.search]} placeholder="Search apps" value={query} onChangeText={setQuery} />
      <FlatList
        data={shown}
        keyExtractor={(a) => a.packageName}
        renderItem={({ item }) => (
          <View style={[styles.row, styles.pad]}>
            <Text style={[styles.p, { flex: 1 }]}>{item.label}</Text>
            <Switch
              value={props.selected.includes(item.packageName)}
              onValueChange={(on) => toggle(item.packageName, on)}
            />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.container}>{children}</ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12 },
  bar: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderColor: "#ddd" },
  pad: { paddingHorizontal: 24, paddingVertical: 8 },
  h1: { fontSize: 28, fontWeight: "700" },
  h2: { fontSize: 18, fontWeight: "600", marginTop: 12 },
  p: { fontSize: 15, color: "#555", flexShrink: 1 },
  big: { fontSize: 22, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  search: { marginHorizontal: 24, padding: 12, borderWidth: 1, borderColor: "#ccc", borderRadius: 8 },
});
