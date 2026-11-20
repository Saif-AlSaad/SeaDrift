export type Difficulty = "calm" | "standard" | "tempest";
export type QualitySetting = "auto" | "high" | "medium" | "low";
export type SunGlareSetting = "soft" | "minimal";
export type TouchControl = "drag" | "follow" | "tilt";

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
}

export interface ScoreEntry {
  s: number; // score
  w: number; // wisps caught
  d: number; // distance (m)
  c: number; // best combo
  m?: Difficulty; // difficulty mode
  t: number; // timestamp
}

const SCORES_KEY = "drift.scores.v3";
const SETTINGS_KEY = "drift.settings.v1";
const LEGACY_MUTE_KEY = "drift.muted.v1";
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
