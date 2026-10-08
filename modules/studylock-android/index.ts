import { requireNativeModule } from "expo";

export type AppInfo = { packageName: string; label: string };
export type Config = { goal: number; lockAt: number; study: string[]; allowed: string[]; setup: boolean };

type StudyLockAndroid = {
  listApps(): AppInfo[];
  getConfig(): Config;
  setConfig(goal: number, lockAt: number, study: string[], allowed: string[]): void;
  minutesToday(): number;
  isLocked(): boolean;
  getLastUrl(): string | null;
  setLastUrl(url: string): void;
  hasUsageAccess(): boolean;
  isServiceEnabled(): boolean;
  openUsageAccess(): void;
  openAccessibility(): void;
  openAppDetails(): void;
};

export default requireNativeModule<StudyLockAndroid>("StudyLockAndroid");
