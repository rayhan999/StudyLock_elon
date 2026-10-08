import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, BackHandler, FlatList, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";
import Lock, { AppInfo } from "./modules/studylock-android";
import { Btn, Logo, Progress, Screen, colors, styles } from "./src/ui";

type Editing = "study" | "allowed" | null;

const START_URL = "https://elon.io/";
// Only these sites load inside Sanalukko (elon.io + its login providers), so time here really is study time.
const ALLOWED_HOSTS = ["elon.io", "appleid.apple.com", "accounts.google.com", "facebook.com"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const isAllowedUrl = (url: string) => {
  const host = url.match(/^https?:\/\/([^/:?#]+)/i)?.[1]?.toLowerCase();
  return !host || ALLOWED_HOSTS.some((h) => host === h || host.endsWith("." + h));
};

// Auto-dismisses elon.io's support interstitial (Headless UI dialog with a ~15s
// wait before the dismiss button appears). Copy rotates, so detection is
// structural, not text-based: the dialog panel containing Erik's photo
// (img src/alt with "erik" / "founder", stable asset — not the ad copy).
// The guard hides that panel immediately and clicks the dismiss button
// (never the donation CTA) as soon as it renders, so Headless UI tears down
// the overlay/scroll-lock cleanly. Persistent MutationObserver + interval
// survives Next.js SPA navigation inside the WebView.
const ELON_AD_GUARD_JS = `(function() {
  if (window.__elonAdGuard) return true;
  window.__elonAdGuard = true;
  function dialogRoot(panel) {
    var r = panel.parentElement ? panel.parentElement.closest('div[id^="headlessui-dialog"], div[data-headlessui-state]') : null;
    return r || panel;
  }
  function isAdPanel(panel) {
    try {
      // Stable fingerprint: Erik's photo. Copy (heading/paragraph/CTA) rotates.
      if (panel.querySelector('img[src*="erik" i], img[alt*="Erik" i], img[alt*="founder" i], img[src*="/images/team/" i]')) return true;
    } catch (e) {}
    return false;
  }
  function pickDismissButton(panel) {
    var btns = Array.prototype.slice.call(panel.querySelectorAll('button'));
    if (!btns.length) return null;
    var isCta = function (t) { return /deed|donat|support|contribut|coffee|sponsor|\\u2192/i.test(t); };
    var avail = btns.filter(function (b) { return !b.disabled; });
    if (!avail.length) return null;
    var prefer = [/start lesson/i, /continue/i, /^close$/i, /skip/i, /not now/i, /dismiss/i];
    for (var p = 0; p < prefer.length; p++) {
      for (var i = 0; i < avail.length; i++) {
        if (prefer[p].test(avail[i].textContent || '')) return avail[i];
      }
    }
    // Fallback for rotated copy: last non-CTA button, else last button.
    var nonCta = avail.filter(function (b) { return !isCta(b.textContent || ''); });
    return nonCta.length ? nonCta[nonCta.length - 1] : avail[avail.length - 1];
  }
  function dismiss() {
    try {
      var panels = document.querySelectorAll('div[id^="headlessui-dialog-panel"]');
      for (var i = 0; i < panels.length; i++) {
        var panel = panels[i];
        if (!isAdPanel(panel)) continue;
        var btn = pickDismissButton(panel);
        if (btn) { btn.click(); return; }
        // Wait phase (dismiss not rendered yet): hide whole dialog incl. backdrop.
        dialogRoot(panel).style.setProperty('display', 'none', 'important');
      }
    } catch (e) {}
  }
  new MutationObserver(dismiss).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  setInterval(dismiss, 500);
  dismiss();
  return true;
})();true;`;

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
        <Logo />
        <Text style={styles.p}>
          Until you've studied for your daily goal, Sanalukko sends you back here whenever you open an app that isn't a
          study app or an always-allowed app. Your progress resets every midnight.
        </Text>
        <Text style={styles.h2}>{usage ? "✅" : "1."} Usage access</Text>
        <Text style={styles.p}>Lets Sanalukko measure time spent in your study apps.</Text>
        {!usage && <Btn title="Open usage access settings" onPress={() => Lock.openUsageAccess()} />}
        <Text style={styles.h2}>{service ? "✅" : "2."} Accessibility service</Text>
        <Text style={styles.p}>
          Lets Sanalukko see which app is open so it can block it. If Android says the setting is restricted: go to
          App info → ⋮ (top right) → "Allow restricted settings", then try again.
        </Text>
        {!service && (
          <>
            <Btn title="Open accessibility settings" onPress={() => Lock.openAccessibility()} />
            <Btn title="Open Sanalukko app info" onPress={() => Lock.openAppDetails()} />
          </>
        )}
      </Screen>
    );
  }

  const settings = (
    <>
      <Text style={styles.h2}>Extra study apps (optional)</Text>
      <Text style={styles.p}>Time on elon.io inside Sanalukko always counts. Time in apps picked here counts too.</Text>
      <Btn title={`Choose study apps (${draft.study.length})`} onPress={() => setEditing("study")} />
      <Text style={styles.h2}>Always-allowed apps</Text>
      <Text style={styles.p}>Never blocked, e.g. Phone, Messages, Maps, banking.</Text>
      <Btn title={`Choose allowed apps (${draft.allowed.length})`} onPress={() => setEditing("allowed")} />
      <Text style={styles.h2}>Daily goal</Text>
      <View style={styles.row}>
        <Btn secondary title="−" onPress={() => setDraft({ ...draft, goal: Math.max(5, draft.goal - 5) })} />
        <Text style={styles.big}>{draft.goal} min / day</Text>
        <Btn secondary title="+" onPress={() => setDraft({ ...draft, goal: Math.min(120, draft.goal + 5) })} />
      </View>
      <Text style={styles.h2}>Lock starts at</Text>
      <Text style={styles.p}>Apps are free before this time. After it, they stay locked until you reach the goal.</Text>
      <View style={styles.row}>
        <Btn secondary title="−" onPress={() => setDraft({ ...draft, lockAt: (draft.lockAt + 1410) % 1440 })} />
        <Text style={styles.big}>{hhmm(draft.lockAt)}</Text>
        <Btn secondary title="+" onPress={() => setDraft({ ...draft, lockAt: (draft.lockAt + 30) % 1440 })} />
      </View>
    </>
  );

  if (!config.setup) {
    return (
      <Screen>
        <Text style={styles.h1}>Set up</Text>
        {settings}
        <Btn title="Start — lock my apps now" onPress={save} />
      </Screen>
    );
  }

  if (!showSettings) {
    return (
      <StudyView
        header={`${status} ${minutes} / ${config.goal} min today`}
        onSettings={() => setShowSettings(true)}
      />
    );
  }

  return (
    <Screen>
      <Btn secondary title="← Back to elon.io" onPress={() => setShowSettings(false)} />
      <Text style={styles.h1}>
        {locked ? "🔒 Apps locked" : goalMet ? "✅ Unlocked for today" : `🔓 Free until ${hhmm(config.lockAt)}`}
      </Text>
      <Text style={styles.big}>
        {minutes} / {config.goal} min studied
      </Text>
      <Progress value={minutes / config.goal} />
      {!goalMet ? (
        <Text style={styles.p}>Study on elon.io to unlock. Settings unlock once you reach today's goal.</Text>
      ) : (
        <>
          {settings}
          <Btn title="Save" onPress={save} />
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
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={[styles.row, styles.bar]}>
        <Text style={[styles.big, { flex: 1, fontSize: 17 }]}>{header}</Text>
        <Btn secondary title="Settings" onPress={onSettings} />
      </View>
      <WebView
        ref={web}
        source={{ uri: startUrl }}
        style={{ flex: 1 }}
        setSupportMultipleWindows={false}
        injectedJavaScriptBeforeContentLoaded={ELON_AD_GUARD_JS}
        injectedJavaScript={ELON_AD_GUARD_JS}
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
    <SafeAreaView style={styles.screen}>
      <View style={[styles.row, styles.pad]}>
        <Text style={[styles.h1, { flex: 1 }]}>{props.title}</Text>
        <Btn title="Done" onPress={props.onDone} />
      </View>
      <TextInput style={[styles.search]} placeholder="Search apps" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} />
      <FlatList
        data={shown}
        keyExtractor={(a) => a.packageName}
        renderItem={({ item }) => (
          <View style={[styles.row, styles.pad]}>
            <Text style={[styles.p, { flex: 1 }]}>{item.label}</Text>
            <Switch
              trackColor={{ true: colors.navy }}
              value={props.selected.includes(item.packageName)}
              onValueChange={(on) => toggle(item.packageName, on)}
            />
          </View>
        )}
      />
    </SafeAreaView>
  );
}
