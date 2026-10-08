import * as RNDA from "react-native-device-activity";

// No underscores: the library splits event keys on "_".
const ACTIVITY = "studylock";
export const STUDY = "study";
export const ALLOWED = "allowed";

const today = () => new Date().toDateString();

export const getGoal = () => RNDA.userDefaultsGet<number>("goalMinutes") ?? 30;
export const isSetUp = () => RNDA.userDefaultsGet<boolean>("setupDone") === true;
export const isLocked = () => RNDA.isShieldActive();

// iOS reports study time as threshold events every 5 min ("m5", "m10", ...).
export function minutesToday(): number {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const reached = RNDA.getEvents(ACTIVITY)
    .filter((e) => e.callbackName === "eventDidReachThreshold" && e.lastCalledAt >= midnight)
    .map((e) => Number(e.eventName?.slice(1)) || 0);
  return Math.max(0, ...reached);
}

function lockForToday() {
  RNDA.enableBlockAllMode("app");
  RNDA.userDefaultsSet("lockedDay", today());
}

// Saves settings and (re)starts the daily schedule.
// lockNow = true at onboarding. Later edits are only allowed while unlocked
// and take effect from tomorrow's midnight lock.
export async function applySetup(goal: number, lockNow: boolean) {
  RNDA.userDefaultsSet("goalMinutes", goal);
  RNDA.updateShield(
    {
      title: "Locked until you study",
      subtitle: "Finish today's study goal to unlock your apps. Open Sanalukko to see your progress.",
      primaryButtonLabel: "OK",
      iconSystemName: "lock.fill",
      backgroundColor: { red: 255, green: 244, blue: 230, alpha: 1 },
      titleColor: { red: 26, green: 63, blue: 143, alpha: 1 },
      subtitleColor: { red: 90, green: 100, blue: 128, alpha: 1 },
      iconTint: { red: 255, green: 107, blue: 91, alpha: 1 },
      primaryButtonBackgroundColor: { red: 26, green: 63, blue: 143, alpha: 1 },
      primaryButtonLabelColor: { red: 255, green: 244, blue: 230, alpha: 1 },
    },
    { primary: { behavior: "close" } },
  );

  // Everything is blocked except study targets + always-allowed apps.
  RNDA.clearWhitelist();
  RNDA.addSelectionToWhitelistAndUpdateBlock({ activitySelectionId: STUDY });
  RNDA.addSelectionToWhitelistAndUpdateBlock({ activitySelectionId: ALLOWED });

  const study = RNDA.getFamilyActivitySelectionId(STUDY);
  if (!study) throw new Error("No study apps selected");
  const events = [];
  for (let m = 5; m <= goal; m += 5) {
    events.push({ eventName: `m${m}`, familyActivitySelection: study, threshold: { minute: m }, includesPastActivity: true });
  }

  RNDA.stopMonitoring([ACTIVITY]);
  RNDA.userDefaultsClearWithPrefix(`actions_for_${ACTIVITY}`); // drop the old goal's unlock action

  // Restarting mid-day fires intervalDidStart right away; don't re-lock an unlocked day.
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 0, 0);
  RNDA.configureActions({
    activityName: ACTIVITY,
    callbackName: "intervalDidStart",
    actions: [{ type: "enableBlockAllMode", neverTriggerBefore: lockNow ? undefined : endOfToday }],
  });
  RNDA.configureActions({
    activityName: ACTIVITY,
    callbackName: "eventDidReachThreshold",
    eventName: `m${goal}`,
    actions: [{ type: "disableBlockAllMode" }],
  });

  await RNDA.startMonitoring(
    ACTIVITY,
    { intervalStart: { hour: 0, minute: 0, second: 0 }, intervalEnd: { hour: 23, minute: 59, second: 59 }, repeats: true },
    events,
  );

  if (lockNow) lockForToday();
  RNDA.userDefaultsSet("setupDone", true);
}

// Runs whenever the app comes to the foreground, in case the extension missed a callback.
export function syncLock() {
  if (!isSetUp()) return;
  if (minutesToday() >= getGoal()) RNDA.disableBlockAllMode("app");
  else if (RNDA.userDefaultsGet("lockedDay") !== today()) lockForToday();
}
