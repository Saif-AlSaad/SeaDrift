export type Difficulty = "calm" | "standard" | "tempest";
export type QualitySetting = "auto" | "high" | "medium" | "low";
export type SunGlareSetting = "soft" | "minimal";
export type TouchControl = "drag" | "follow" | "tilt";
export type EnvironmentMode = "sea" | "mangrove";

export const MANGROVE_UNLOCK_COST = 150;

export interface GameSettings {
  volume: number; // 0..1
  muted: boolean;
  difficulty: Difficulty;
  quality: QualitySetting;
  sunGlare: SunGlareSetting;
  screenShake: boolean;
  touchControl: TouchControl;
  haptics: boolean;
  autoFullscreen: boolean;
  environment: EnvironmentMode;
}

export interface ScoreEntry {
  s: number; // score
  w: number; // wisps caught
  d: number; // distance (m)
  c: number; // best combo
  m?: Difficulty; // difficulty mode
  env?: EnvironmentMode; // environment mode
  t: number; // timestamp
}

const SCORES_KEY = "drift.scores.v3";
const SETTINGS_KEY = "drift.settings.v1";
const LEGACY_MUTE_KEY = "drift.muted.v1";
const LIGHTS_KEY = "drift.lights.v1";
const UNLOCKED_KEY = "drift.unlocked.v1";
const MAX_ENTRIES = 8;

export const DEFAULT_SETTINGS: GameSettings = {
  volume: 0.8,
  muted: false,
  difficulty: "standard",
  quality: "auto",
  sunGlare: "soft",
  screenShake: true,
  touchControl: "drag",
  haptics: true,
  autoFullscreen: true,
  environment: "sea",
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
      difficulty:
        parsed.difficulty === "calm" ||
        parsed.difficulty === "standard" ||
        parsed.difficulty === "tempest"
          ? parsed.difficulty
          : DEFAULT_SETTINGS.difficulty,
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
        parsed.environment === "mangrove" && loadUnlockedModes().includes("mangrove")
          ? "mangrove"
          : "sea",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: GameSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    localStorage.setItem(LEGACY_MUTE_KEY, s.muted ? "1" : "0");
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
  } catch {
    /* ignore */
  }
  return next;
}

/** Load unlocked environment modes ("sea" is always available as base mode). */
export function loadUnlockedModes(): EnvironmentMode[] {
  const base: EnvironmentMode[] = ["sea"];
  try {
    const raw = localStorage.getItem(UNLOCKED_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.includes("mangrove")) {
      return ["sea", "mangrove"];
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
  const nextUnlocked: EnvironmentMode[] = ["sea", "mangrove"];
  try {
    localStorage.setItem(LIGHTS_KEY, String(nextBalance));
    localStorage.setItem(UNLOCKED_KEY, JSON.stringify(nextUnlocked));
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
  } catch {
    /* storage unavailable — play on */
  }
  const rank = list.indexOf(entry);
  return { list, rank: rank === -1 ? -1 : rank + 1, isBest: entry.s > prevBest };
}

export function clearScores(): ScoreEntry[] {
  try {
    localStorage.removeItem(SCORES_KEY);
  } catch {
    /* ignore */
  }
  return [];
}

export function formatDate(t: number): string {
  const d = new Date(t);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
