import type { BoatLevel } from "./boatSkins";
import { syncProgressBackup } from "./updater";

export type { BoatLevel };
export type QualitySetting = "auto" | "high" | "medium" | "low";
export type SunGlareSetting = "soft" | "minimal";
export type TouchControl = "drag" | "follow" | "tilt";
export type EnvironmentMode = "sea" | "mangrove" | "canal";

/** Fixed difficulty multipliers per game mode: Sea Mode = 1.0x, Canal Mode = 1.15x, Mangrove Mode = 1.3x. */
export const MODE_DIFFICULTY_MULT: Record<EnvironmentMode, number> = {
  sea: 1.0,
  mangrove: 1.3,
  canal: 1.15,
};

export const MANGROVE_UNLOCK_COST = 2000;
/** Temporary flag to keep Enchanted Mangrove unlocked for testing; set false to re-enable 2,000-Lights gate. */
const TEST_UNLOCK_MANGROVE: boolean = true;

export interface GameSettings {
  volume: number; // 0..1
  muted: boolean;
  quality: QualitySetting;
  sunGlare: SunGlareSetting;
  screenShake: boolean;
  touchControl: TouchControl;
  haptics: boolean;
  autoFullscreen: boolean;
  environment: EnvironmentMode;
  boatLevel: BoatLevel;
}

export interface ScoreEntry {
  s: number; // score
  w: number; // wisps caught
  d: number; // distance (m)
  c: number; // best combo
  m?: string; // legacy difficulty field
  env?: EnvironmentMode; // environment mode
  t: number; // timestamp
}

const SCORES_KEY = "drift.scores.v3";
const SETTINGS_KEY = "drift.settings.v1";
const LEGACY_MUTE_KEY = "drift.muted.v1";
const LIGHTS_KEY = "drift.lights.v1";
const UNLOCKED_KEY = "drift.unlocked.v1";
const BOATS_KEY = "drift.boats.v1";
const MAX_ENTRIES = 8;

export const DEFAULT_SETTINGS: GameSettings = {
  volume: 0.8,
  muted: false,
  quality: "auto",
  sunGlare: "soft",
  screenShake: true,
  touchControl: "drag",
  haptics: true,
  autoFullscreen: true,
  environment: "sea",
  boatLevel: 1,
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      const legacyMute = localStorage.getItem(LEGACY_MUTE_KEY) === "1";
      return { ...DEFAULT_SETTINGS, muted: legacyMute };
    }
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      volume:
        typeof parsed.volume === "number"
          ? Math.max(0, Math.min(1, parsed.volume))
          : DEFAULT_SETTINGS.volume,
      muted:
        typeof parsed.muted === "boolean" ? parsed.muted : DEFAULT_SETTINGS.muted,
      quality:
        parsed.quality === "auto" ||
        parsed.quality === "high" ||
        parsed.quality === "medium" ||
        parsed.quality === "low"
          ? parsed.quality
          : DEFAULT_SETTINGS.quality,
      sunGlare:
        parsed.sunGlare === "soft" || parsed.sunGlare === "minimal"
          ? parsed.sunGlare
          : DEFAULT_SETTINGS.sunGlare,
      screenShake:
        typeof parsed.screenShake === "boolean"
          ? parsed.screenShake
          : DEFAULT_SETTINGS.screenShake,
      touchControl:
        parsed.touchControl === "drag" ||
        parsed.touchControl === "follow" ||
        parsed.touchControl === "tilt"
          ? parsed.touchControl
          : DEFAULT_SETTINGS.touchControl,
      haptics:
        typeof parsed.haptics === "boolean" ? parsed.haptics : DEFAULT_SETTINGS.haptics,
      autoFullscreen:
        typeof parsed.autoFullscreen === "boolean"
          ? parsed.autoFullscreen
          : DEFAULT_SETTINGS.autoFullscreen,
      environment:
        (parsed.environment === "mangrove" || parsed.environment === "canal") &&
        loadUnlockedModes().includes(parsed.environment)
          ? parsed.environment
          : "sea",
      boatLevel:
        (parsed.boatLevel === 2 || parsed.boatLevel === 3) &&
        loadUnlockedBoats().includes(parsed.boatLevel)
          ? parsed.boatLevel
          : 1,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: GameSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    localStorage.setItem(LEGACY_MUTE_KEY, s.muted ? "1" : "0");
    void syncProgressBackup();
  } catch {
    /* ignore */
  }
}

/** Load the player's banked Lights (wisps collected across voyages). */
export function loadLights(): number {
  try {
    const raw = localStorage.getItem(LIGHTS_KEY);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Bank newly collected Lights and return the updated wallet total. */
export function addLights(amount: number): number {
  const delta = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  const next = loadLights() + delta;
  try {
    localStorage.setItem(LIGHTS_KEY, String(next));
    void syncProgressBackup();
  } catch {
    /* ignore */
  }
  return next;
}

/** Load unlocked environment modes ("sea" and "canal" are unlocked by default). */
export function loadUnlockedModes(): EnvironmentMode[] {
  if (TEST_UNLOCK_MANGROVE) return ["sea", "mangrove", "canal"];
  const base: EnvironmentMode[] = ["sea", "canal"];
  try {
    const raw = localStorage.getItem(UNLOCKED_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.includes("mangrove")) {
      return ["sea", "mangrove", "canal"];
    }
    return base;
  } catch {
    return base;
  }
}

/** Spend banked Lights to permanently unlock Enchanted Mangrove mode. */
export function unlockMangroveWithLights(cost = MANGROVE_UNLOCK_COST): {
  ok: boolean;
  balance: number;
  unlocked: EnvironmentMode[];
} {
  const currentUnlocked = loadUnlockedModes();
  const currentBalance = loadLights();
  if (currentUnlocked.includes("mangrove")) {
    return { ok: true, balance: currentBalance, unlocked: currentUnlocked };
  }
  if (currentBalance < cost) {
    return { ok: false, balance: currentBalance, unlocked: currentUnlocked };
  }
  const nextBalance = currentBalance - cost;
  const nextUnlocked: EnvironmentMode[] = ["sea", "mangrove", "canal"];
  try {
    localStorage.setItem(LIGHTS_KEY, String(nextBalance));
    localStorage.setItem(UNLOCKED_KEY, JSON.stringify(nextUnlocked));
    void syncProgressBackup();
  } catch {
    /* ignore */
  }
  return { ok: true, balance: nextBalance, unlocked: nextUnlocked };
}

/** Load unlocked boat levels (Level 1 is always available by default). */
export function loadUnlockedBoats(): BoatLevel[] {
  const base: BoatLevel[] = [1];
  try {
    const raw = localStorage.getItem(BOATS_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return base;
    const out: BoatLevel[] = [1];
    if (parsed.includes(2)) out.push(2);
    if (parsed.includes(3)) out.push(3);
    return out;
  } catch {
    return base;
  }
}

/** Spend banked Lights to permanently unlock a Boat tier (Level 2 or 3). */
export function unlockBoatWithLights(
  level: BoatLevel,
  cost: number,
): {
  ok: boolean;
  balance: number;
  unlocked: BoatLevel[];
} {
  const currentUnlocked = loadUnlockedBoats();
  const currentBalance = loadLights();
  if (currentUnlocked.includes(level)) {
    return { ok: true, balance: currentBalance, unlocked: currentUnlocked };
  }
  if (currentBalance < cost) {
    return { ok: false, balance: currentBalance, unlocked: currentUnlocked };
  }
  const nextBalance = currentBalance - cost;
  const nextUnlocked: BoatLevel[] = [...currentUnlocked, level].sort((a, b) => a - b) as BoatLevel[];
  try {
    localStorage.setItem(LIGHTS_KEY, String(nextBalance));
    localStorage.setItem(BOATS_KEY, JSON.stringify(nextUnlocked));
    void syncProgressBackup();
  } catch {
    /* ignore */
  }
  return { ok: true, balance: nextBalance, unlocked: nextUnlocked };
}

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (e): e is ScoreEntry =>
          e && typeof e.s === "number" && typeof e.t === "number",
      )
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function addScore(entry: ScoreEntry): {
  list: ScoreEntry[];
  rank: number;
  isBest: boolean;
} {
  const prevBest = loadScores()[0]?.s ?? 0;
  const list = [...loadScores(), entry]
    .sort((a, b) => b.s - a.s)
    .slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(list));
    void syncProgressBackup();
  } catch {
    /* storage unavailable — play on */
  }
  const rank = list.indexOf(entry);
  return { list, rank: rank === -1 ? -1 : rank + 1, isBest: entry.s > prevBest };
}

export function clearScores(): ScoreEntry[] {
  try {
    localStorage.removeItem(SCORES_KEY);
    void syncProgressBackup();
  } catch {
    /* ignore */
  }
  return [];
}

export function formatDate(t: number): string {
  const d = new Date(t);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
