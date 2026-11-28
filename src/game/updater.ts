import { Capacitor, registerPlugin } from "@capacitor/core";

export const APP_BUILD_VERSION: string =
  typeof __SEADRIFT_BUILD_HASH__ !== "undefined" ? __SEADRIFT_BUILD_HASH__ : "dev";

const PUBLIC_BASE_URL = "https://saif-alsaad.github.io/SeaDrift";
export const UPDATE_MANIFEST_URL = `${PUBLIC_BASE_URL}/version.json`;
export const DEFAULT_BUNDLE_URL = `${PUBLIC_BASE_URL}/index.html`;

const BACKUP_KEYS = [
  "drift.scores.v3",
  "drift.settings.v1",
  "drift.muted.v1",
  "drift.lights.v1",
  "drift.unlocked.v1",
  "drift.boats.v1",
] as const;

interface AppUpdaterPlugin {
  getUpdateInfo(): Promise<{ usingOta: boolean; otaVersion: string; serverBasePath: string }>;
  checkUpdate(options: { manifestUrl: string }): Promise<{
    online: boolean;
    version?: string;
    bundleUrl?: string;
    builtAt?: string;
  }>;
  applyUpdate(options: { bundleUrl: string; version: string }): Promise<{
    updated: boolean;
    version: string;
    path: string;
  }>;
  rollbackToBundled(): Promise<void>;
  saveProgressBackup(options: { snapshot: string }): Promise<void>;
  loadProgressBackup(): Promise<{ snapshot: string | null }>;
}

const AppUpdater = registerPlugin<AppUpdaterPlugin>("AppUpdater");

export interface UpdateInfo {
  version: string;
  bundleUrl: string;
  builtAt?: string;
}

export type UpdateCheckResult =
  | { available: true; info: UpdateInfo }
  | { available: false; reason: "up-to-date" | "offline" | "unsupported" };

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) {
    return { available: false, reason: "unsupported" };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { available: false, reason: "offline" };
  }
  try {
    const res = await AppUpdater.checkUpdate({ manifestUrl: UPDATE_MANIFEST_URL });
    if (!res.online || !res.version) {
      return { available: false, reason: "offline" };
    }
    if (res.version !== APP_BUILD_VERSION) {
      return {
        available: true,
        info: {
          version: res.version,
          bundleUrl: res.bundleUrl || DEFAULT_BUNDLE_URL,
          builtAt: res.builtAt,
        },
      };
    }
    return { available: false, reason: "up-to-date" };
  } catch {
    return { available: false, reason: "offline" };
  }
}

export async function applyAppUpdate(info: UpdateInfo): Promise<void> {
  await syncProgressBackup();
  await AppUpdater.applyUpdate({
    bundleUrl: info.bundleUrl || DEFAULT_BUNDLE_URL,
    version: info.version,
  });
}

export async function syncProgressBackup(): Promise<void> {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return;
  try {
    const keys: Record<string, string> = {};
    for (const key of BACKUP_KEYS) {
      const val = localStorage.getItem(key);
      if (val !== null) keys[key] = val;
    }
    const snapshot = JSON.stringify({ keys, savedAt: Date.now() });
    await AppUpdater.saveProgressBackup({ snapshot });
  } catch {
    /* ignore native backup failures */
  }
}

export async function restoreProgressBackupIfNeeded(): Promise<boolean> {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return false;
  try {
    const hasProgress =
      localStorage.getItem("drift.scores.v3") !== null ||
      localStorage.getItem("drift.lights.v1") !== null ||
      localStorage.getItem("drift.boats.v1") !== null ||
      localStorage.getItem("drift.unlocked.v1") !== null;
    if (hasProgress) {
      void syncProgressBackup();
      return false;
    }

    const res = await AppUpdater.loadProgressBackup();
    if (!res?.snapshot) return false;

    const parsed = JSON.parse(res.snapshot) as { keys?: Record<string, unknown> };
    if (!parsed?.keys || typeof parsed.keys !== "object") return false;

    let restored = false;
    for (const key of BACKUP_KEYS) {
      const val = parsed.keys[key];
      if (typeof val === "string" && localStorage.getItem(key) === null) {
        localStorage.setItem(key, val);
        restored = true;
      }
    }
    return restored;
  } catch {
    return false;
  }
}
