import { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Switch, Text, View } from "react-native";
import * as RNDA from "react-native-device-activity";
import { ALLOWED, STUDY, applySetup, getGoal, isLocked, isSetUp, minutesToday, syncLock } from "./src/lock";
import { Btn, Logo, Progress, Screen, colors, styles } from "./src/ui";

type Picker = typeof STUDY | typeof ALLOWED | null;

export default function App() {
  const auth = RNDA.useAuthorizationStatus();
  const [setUp, setSetUp] = useState(isSetUp);
  const [goal, setGoal] = useState(getGoal);
  const [picker, setPicker] = useState<Picker>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [studyLockPicked, setSanalukkoPicked] = useState(false);
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
      <Btn secondary title="−" onPress={() => setGoal((g) => Math.max(5, g - 5))} />
      <Text style={styles.big}>{goal} min / day</Text>
      <Btn secondary title="+" onPress={() => setGoal((g) => Math.min(120, g + 5))} />
    </View>
  );

  if (auth !== RNDA.AuthorizationStatus.approved) {
    return (
      <Screen>
        <Logo />
        <Text style={styles.p}>
          Every day at midnight Sanalukko locks all your apps except your study apps and a few you always need. Study
          for your daily goal and everything unlocks until the next day.
        </Text>
        <Text style={styles.p}>
          You can always turn this off in Settings → Screen Time. For a strict lock, let someone else set a Screen Time
          passcode.
        </Text>
        {auth === RNDA.AuthorizationStatus.denied && (
          <Text style={styles.warn}>Screen Time access was denied. Sanalukko can't work without it.</Text>
        )}
        <Btn title="Allow Screen Time access" onPress={() => RNDA.requestAuthorization("individual").catch(() => {})} />
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
        <Btn title={`Choose study apps (${counts[STUDY] ?? 0} selected)`} onPress={() => setPicker(STUDY)} />

        <Text style={styles.h2}>2. Always-allowed apps</Text>
        <Text style={styles.p}>
          Never locked. Pick Sanalukko itself, Phone, Messages, Maps, banking — and Safari if you study on a website.
        </Text>
        <Btn title={`Choose allowed apps (${counts[ALLOWED] ?? 0} selected)`} onPress={() => setPicker(ALLOWED)} />
        <View style={styles.row}>
          <Switch trackColor={{ true: colors.navy }} value={studyLockPicked} onValueChange={setSanalukkoPicked} />
          <Text style={styles.p}>I selected Sanalukko in the allowed apps</Text>
        </View>

        <Text style={styles.h2}>3. Daily goal</Text>
        {goalStepper}

        <Btn title="Start — lock my apps now" disabled={!ready} onPress={() => save(true)} />
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
      <Progress value={done / getGoal()} />
      <Text style={styles.p}>Progress updates every 5 minutes of study time.</Text>

      <Text style={styles.h2}>Settings</Text>
      {locked ? (
        <Text style={styles.p}>Settings unlock once you reach today's goal.</Text>
      ) : (
        <>
          {goalStepper}
          <Btn secondary title="Edit study apps" onPress={() => setPicker(STUDY)} />
          <Btn secondary title="Edit allowed apps" onPress={() => setPicker(ALLOWED)} />
          <Btn title="Save (applies from tomorrow)" onPress={() => save(false)} />
        </>
      )}
    </Screen>
  );
}
