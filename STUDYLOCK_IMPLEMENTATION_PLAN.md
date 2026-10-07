# StudyLock — Implementation Plan v3 (Expo + EAS)

## Values
| Name | Value |
|---|---|
| Team ID | `SL769XQ9JR` |
| App | `studylock.com.app` |
| Extensions | `studylock.com.app.ActivityMonitorExtension`, `.ShieldAction`, `.ShieldConfiguration` |
| App Group | `group.studylock.com.app` |
| Stack | Expo SDK 54, `react-native-device-activity` 0.6.x, EAS Build → TestFlight |
| iOS | App 16.0+, extensions 18.0+ (plugin default), iPhone only |

## How it works
1. Onboarding: Screen Time permission → pick **study** apps/websites → pick **always-allowed** apps (StudyLock, Phone, Safari if studying on a website…) → daily goal (5–120 min, step 5) → lock now.
2. The library's "block all mode" shields everything except the whitelist (study + allowed), for apps and Safari websites.
3. A daily schedule (00:00–23:59, repeats) runs in the ActivityMonitor extension, which runs without the app open:
   - `intervalDidStart` → `enableBlockAllMode` (re-lock at midnight).
   - Threshold events every 5 min of study time (`m5`, `m10`, …). The `m<goal>` event → `disableBlockAllMode`.
4. App on foreground (`syncLock`): unlock if today's events reached the goal; re-lock if it hasn't locked yet today (in case the extension missed midnight).
5. Settings (goal, study apps, allowed apps) can only be edited while unlocked, and apply from the next midnight lock (`neverTriggerBefore`).

Code: `src/lock.ts` (all Screen Time logic) and `App.tsx` (UI). The native extensions in `targets/` come from the library's config plugin.

## Gotchas found while building
- `@expo/prebuild-config` must be a direct dependency, or `expo prebuild` fails to load the library's plugin.
- Activity and event names must not contain `_`, because the library splits event keys on it.
- The shield can't show live minutes (no placeholder for it), so it tells the user to open StudyLock.

## Apple setup (manual)
1. **Request Family Controls (Distribution)** for all 4 bundle IDs: https://developer.apple.com/contact/request/family-controls-distribution. Without approval EAS can't build anything installable. This blocks all testing.
2. developer.apple.com → Identifiers: register the 4 App IDs + App Group. After approval, enable "Family Controls (Distribution)" on each.
3. App Store Connect → New App, bundle `studylock.com.app`.

## Build & ship
```
npx eas-cli login
npx eas-cli build -p ios --profile production --auto-submit
```
Then add the build to an internal TestFlight group and install it with TestFlight. TestFlight builds expire after 90 days.

## Test checklist (on iPhone via TestFlight)
- [ ] Onboarding → non-allowed apps are shielded; study + allowed apps open; only study sites load in Safari.
- [ ] 5-min goal: 5 min in a study app unlocks everything; the app shows progress.
- [ ] Next midnight re-locks without opening the app.
- [ ] Settings are hidden while locked; saved changes apply the next day.
- [ ] Check: does website blocking break web content in allowed apps (banking login, Maps)?

## Publishing to the App Store
Privacy policy URL, App Privacy = "Data Not Collected", screenshots, and review notes explaining the Screen Time use (self-control, on-device only). Don't name elon.io or any other site.

## Out of scope
Android / Google Play: Android has no equivalent API, so it would be a separate native app.

## Android (built first, no Apple approval needed)
- Native code: local Expo module `modules/studylock-android` (Kotlin). UI: `App.android.tsx` (Metro picks it over `App.tsx` on Android).
- Study time = foreground time in study apps since midnight, from `UsageStatsManager` events. It resets daily by itself, with no scheduler.
- Blocking = `BlockService` (AccessibilityService). When a blockable app opens while locked, it brings StudyLock to the front.
- Never blocked: StudyLock, study apps, allowed apps, the home launcher, the keyboard, Android Settings, and system UI.
- Websites: install the site with Chrome → "Add to Home screen". It becomes its own app that you can pick.
- Build an APK: `npx eas-cli build -p android --profile preview`, then install it from the link or QR code.
- Sideloaded APKs on Android 13+: App info → ⋮ → "Allow restricted settings" before you enable the accessibility service.
- Google Play later: you'd need an Accessibility API declaration plus a prominent-disclosure screen.
