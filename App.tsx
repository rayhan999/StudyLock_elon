import { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Button, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as RNDA from "react-native-device-activity";
import { ALLOWED, STUDY, applySetup, getGoal, isLocked, isSetUp, minutesToday, syncLock } from "./src/lock";

type Picker = typeof STUDY | typeof ALLOWED | null;

export default function App() {
  const auth = RNDA.useAuthorizationStatus();
  const [setUp, setSetUp] = useState(isSetUp);
  const [goal, setGoal] = useState(getGoal);
  const [picker, setPicker] = useState<Picker>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [studyLockPicked, setStudyLockPicked] = useState(false);
  const [, refresh] = useState(0);

  const tick = useCallback(() => {
    syncLock();
    refresh((n) => n + 1);
  }, []);

  useEffect(() => {
    tick();
    const sub = AppState.addEventListener("change", (s) => s === "active" && tick());
    return () => sub.remove();
  }, [tick]);

  const save = async (lockNow: boolean) => {
    try {
      await applySetup(goal, lockNow);
      setSetUp(true);
      tick();
      if (!lockNow) Alert.alert("Saved", "Changes apply from tomorrow's lock.");
    } catch (e: any) {
      Alert.alert("Couldn't save", e.message);
    }
  };

  const pickerSheet = picker && (
    <RNDA.DeviceActivitySelectionSheetViewPersisted
      style={{ width: 1, height: 1, position: "absolute" }}
      familyActivitySelectionId={picker}
      includeEntireCategory
      headerText={picker === STUDY ? "Study apps & websites" : "Always-allowed apps"}
      onSelectionChange={(e) => {
        const { applicationCount, categoryCount, webDomainCount } = e.nativeEvent;
        setCounts((c) => ({ ...c, [picker]: applicationCount + categoryCount + webDomainCount }));
      }}
      onDismissRequest={() => setPicker(null)}
    />
  );

  const goalStepper = (
    <View style={styles.row}>
      <Button title="−" onPress={() => setGoal((g) => Math.max(5, g - 5))} />
      <Text style={styles.big}>{goal} min / day</Text>
      <Button title="+" onPress={() => setGoal((g) => Math.min(120, g + 5))} />
    </View>
  );

  if (auth !== RNDA.AuthorizationStatus.approved) {
    return (
      <Screen>
        <Text style={styles.h1}>StudyLock</Text>
        <Text style={styles.p}>
          Every day at midnight StudyLock locks all your apps except your study apps and a few you always need. Study
          for your daily goal and everything unlocks until the next day.
        </Text>
        <Text style={styles.p}>
          You can always turn this off in Settings → Screen Time. For a strict lock, let someone else set a Screen Time
          passcode.
        </Text>
        {auth === RNDA.AuthorizationStatus.denied && (
          <Text style={styles.warn}>Screen Time access was denied. StudyLock can't work without it.</Text>
        )}
        <Button title="Allow Screen Time access" onPress={() => RNDA.requestAuthorization("individual").catch(() => {})} />
      </Screen>
    );
  }

  if (!setUp) {
    const ready = (counts[STUDY] ?? 0) > 0 && studyLockPicked;
    return (
      <Screen>
        {pickerSheet}
        <Text style={styles.h1}>Set up</Text>

        <Text style={styles.h2}>1. Study apps & websites</Text>
        <Text style={styles.p}>
          Time spent here counts toward your goal. For a website, open it once in Safari first so it shows up in the
          list.
        </Text>
        <Button title={`Choose study apps (${counts[STUDY] ?? 0} selected)`} onPress={() => setPicker(STUDY)} />

        <Text style={styles.h2}>2. Always-allowed apps</Text>
        <Text style={styles.p}>
          Never locked. Pick StudyLock itself, Phone, Messages, Maps, banking — and Safari if you study on a website.
        </Text>
        <Button title={`Choose allowed apps (${counts[ALLOWED] ?? 0} selected)`} onPress={() => setPicker(ALLOWED)} />
        <View style={styles.row}>
          <Switch value={studyLockPicked} onValueChange={setStudyLockPicked} />
          <Text style={styles.p}>I selected StudyLock in the allowed apps</Text>
        </View>

        <Text style={styles.h2}>3. Daily goal</Text>
        {goalStepper}

        <Button title="Start — lock my apps now" disabled={!ready} onPress={() => save(true)} />
      </Screen>
    );
  }

  const locked = isLocked();
  const done = minutesToday();
  return (
    <Screen>
      {pickerSheet}
      <Text style={styles.h1}>{locked ? "🔒 Apps locked" : "✅ Unlocked for today"}</Text>
      <Text style={styles.big}>
        {Math.min(done, getGoal())} / {getGoal()} min studied
      </Text>
      <Text style={styles.p}>Progress updates every 5 minutes of study time.</Text>

      <Text style={styles.h2}>Settings</Text>
      {locked ? (
        <Text style={styles.p}>Settings unlock once you reach today's goal.</Text>
      ) : (
        <>
          {goalStepper}
          <Button title="Edit study apps" onPress={() => setPicker(STUDY)} />
          <Button title="Edit allowed apps" onPress={() => setPicker(ALLOWED)} />
          <Button title="Save (applies from tomorrow)" onPress={() => save(false)} />
        </>
      )}
    </Screen>
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
  h1: { fontSize: 28, fontWeight: "700" },
  h2: { fontSize: 18, fontWeight: "600", marginTop: 12 },
  p: { fontSize: 15, color: "#555", flexShrink: 1 },
  big: { fontSize: 22, fontWeight: "600" },
  warn: { fontSize: 15, color: "#c00" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
