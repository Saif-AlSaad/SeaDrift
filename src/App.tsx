import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { BoatPreview } from "./components/BoatPreview";
import { EnvironmentPreview } from "./components/EnvironmentPreview";
import { BOAT_SPECS, type BoatLevel } from "./game/boatSkins";
import { COMBO_WINDOW, GameEngine } from "./game/engine";
import type { AlertData, GameState, PopupData, RunStats } from "./game/engine";
import { GameAudio } from "./game/audio";
import {
  MANGROVE_UNLOCK_COST,
  addLights,
  addScore,
  clearScores,
  formatDate,
  loadLights,
  loadScores,
  loadSettings,
  loadUnlockedBoats,
  loadUnlockedModes,
  saveSettings,
  unlockBoatWithLights,
  unlockMangroveWithLights,
  type Difficulty,
  type EnvironmentMode,
  type GameSettings,
  type QualitySetting,
  type ScoreEntry,
  type TouchControl,
} from "./game/storage";

/* ------------------------------ inline icons ------------------------------ */

const I = {
  pause: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1.4" />
      <rect x="14" y="4" width="4" height="16" rx="1.4" />
    </svg>
  ),
  play: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="currentColor">
      <path d="M8 5.3c0-1.2 1.3-2 2.4-1.3l10 6.7c1 .7 1 2.1 0 2.7l-10 6.7c-1 .7-2.4-.1-2.4-1.3V5.3z" />
    </svg>
  ),
  soundOn: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="currentColor">
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path
        d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  soundOff: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="currentColor">
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path
        d="M16.5 9.5l5 5m0-5l-5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  gear: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  trophy: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 01-10 0V4z" />
      <path d="M7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3" />
    </svg>
  ),
  close: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  flame: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="currentColor">
      <path d="M12 2c1 4-3 5.5-3 9a3 3 0 006 .2c1.6 1 2.5 2.6 2.5 4.3A5.5 5.5 0 016.5 15c0-2 .8-3.6 2-5C9.6 7.6 11.4 5.6 12 2z" />
    </svg>
  ),
  boat: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="currentColor">
      <path d="M12 3v10H5l7-10z" opacity=".85" />
      <path d="M13 6l6 7h-6V6z" opacity=".55" />
      <path d="M2 17h20l-3 4H5l-3-4z" />
    </svg>
  ),
  medal: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="currentColor">
      <path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.4 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8L12 2z" />
    </svg>
  ),
  expand: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  ),
  shrink: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  ),
  warn: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="currentColor">
      <path d="M12 3l10 17H2L12 3zm-1 6v5h2V9h-2zm0 7v2h2v-2h-2z" />
    </svg>
  ),
  download: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  android: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="currentColor">
      <path d="M17.52 14.34c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1m-11.04 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1m11.4-6.02l2-3.46a.42.42 0 00-.15-.57.42.42 0 00-.57.15l-2.02 3.5A11.7 11.7 0 0012 8.08c-1.85 0-3.59.33-5.14.87L4.84 5.45a.42.42 0 00-.57-.15.42.42 0 00-.15.57l2 3.46C2.69 11.19.34 14.66 0 18.76h24c-.34-4.1-2.69-7.57-6.12-9.44" />
    </svg>
  ),
  flag: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  ),
  monitor: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  sun: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  ),
  shake: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 8v8M6 5v14M18 5v14M22 8v8" />
      <rect x="9" y="4" width="6" height="16" rx="2" />
    </svg>
  ),
  phone: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="3" />
      <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3" />
    </svg>
  ),
  lock: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  ),
  leaf: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  ),
};

const IS_NATIVE = typeof window !== "undefined" && Capacitor.isNativePlatform();
const APK_DOWNLOAD_URL = "https://github.com/Saif-AlSaad/SeaDrift/releases/latest/download/SeaDrift.apk";

const IS_TOUCH =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window);
const CAN_FULLSCREEN = typeof document !== "undefined" && !!document.fullscreenEnabled;
const SAFE_TL = {
  top: "max(1rem, env(safe-area-inset-top))",
  left: "max(1rem, env(safe-area-inset-left))",
} as const;
const SAFE_TR = {
  top: "max(1rem, env(safe-area-inset-top))",
  right: "max(1rem, env(safe-area-inset-right))",
} as const;

const DIFF_INFO: Record<Difficulty, { label: string; desc: string; mult: string }> = {
  calm: {
    label: "Calm",
    desc: "1.0× Difficulty · Relaxed cruise with forgiving lamp drain, steady wisps, and open seas.",
    mult: "1.0×",
  },
  standard: {
    label: "Standard",
    desc: "1.4× Difficulty · Balanced voyage with active steering, fair hazard pacing, and 1.4× score.",
    mult: "1.4×",
  },
  tempest: {
    label: "Tempest",
    desc: "1.9× Difficulty · High-speed storm sailing, swift squalls, intense thrills, and 1.9× score.",
    mult: "1.9×",
  },
};

/* ------------------------------ small pieces ------------------------------ */

function WaveLine() {
  return (
    <div className="mx-auto mt-3 h-3 w-52 overflow-hidden opacity-90">
      <svg width="280" height="12" viewBox="0 0 280 12" className="wave-line" fill="none">
        <path
          d="M0 6 Q14 0 28 6 T56 6 T84 6 T112 6 T140 6 T168 6 T196 6 T224 6 T252 6 T280 6"
          stroke="#ffb454"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M0 10 Q14 4 28 10 T56 10 T84 10 T112 10 T140 10 T168 10 T196 10 T224 10 T252 10 T280 10"
          stroke="#3fd9c0"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity=".55"
        />
      </svg>
    </div>
  );
}

function ScoreList({
  scores,
  highlightRank,
  limit = 5,
}: {
  scores: ScoreEntry[];
  highlightRank?: number;
  limit?: number;
}) {
  if (scores.length === 0) {
    return (
      <p className="py-5 text-center text-sm italic text-foam/45">
        No voyages recorded yet.
      </p>
    );
  }
  return (
    <ol className="space-y-1.5">
      {scores.slice(0, limit).map((e, i) => {
        const isNew = highlightRank === i + 1;
        return (
          <li
            key={`${e.t}-${i}`}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
              isNew
                ? "border border-amber/60 bg-amber/15 shadow-[0_0_18px_rgba(255,180,84,0.25)]"
                : "border border-transparent bg-foam/[0.04]"
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center font-display text-[10px] ${
                i === 0
                  ? "text-amber"
                  : i === 1
                    ? "text-lumen"
                    : i === 2
                      ? "text-ember"
                      : "text-foam/40"
              }`}
            >
              {i < 3 ? I.medal("h-4 w-4") : i + 1}
            </span>
            <span className="font-display text-[13px] tracking-wide text-foam">
              {e.s.toLocaleString("en-US")}
            </span>
            {e.m && (
              <span className="rounded bg-foam/[0.07] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-foam/55">
                {e.m}
              </span>
            )}
            {e.env === "mangrove" && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
                Mangrove
              </span>
            )}
            <span className="ml-auto whitespace-nowrap text-[11px] text-foam/45">
              {e.d}m · {formatDate(e.t)}
            </span>
            {isNew && (
              <span className="font-display text-[9px] tracking-widest text-amber">NEW</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* --------------------------------- App --------------------------------- */

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const audioRef = useRef<GameAudio | null>(null);

  const [state, setState] = useState<GameState>("menu");
  const [menuView, setMenuView] = useState<"home" | "modes">("home");
  const [previewMode, setPreviewMode] = useState<EnvironmentMode>("sea");
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());
  const [lights, setLights] = useState<number>(() => loadLights());
  const [unlockedModes, setUnlockedModes] = useState<EnvironmentMode[]>(() => loadUnlockedModes());
  const [unlockedBoats, setUnlockedBoats] = useState<BoatLevel[]>(() => loadUnlockedBoats());
  const [garageBoat, setGarageBoat] = useState<BoatLevel>(() => loadSettings().boatLevel);
  const [confirmBuyBoat, setConfirmBuyBoat] = useState<BoatLevel | null>(null);
  const [boatLackToast, setBoatLackToast] = useState(0);
  const [earnedLights, setEarnedLights] = useState(0);
  const [final, setFinal] = useState<RunStats | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [newRank, setNewRank] = useState(-1);
  const [popups, setPopups] = useState<Array<PopupData & { id: number }>>([]);
  const [alert, setAlert] = useState<(AlertData & { id: number }) | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [modal, setModal] = useState<"none" | "settings" | "scores" | "unlock" | "garage">("none");
  const [unlockPhase, setUnlockPhase] = useState<"idle" | "gathering" | "gateway" | "revealed">("idle");
  const [confirmClear, setConfirmClear] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const histArmed = useRef(false);
  const settledRunId = useRef(0);

  const scoreEl = useRef<HTMLSpanElement>(null);
  const wispsEl = useRef<HTMLSpanElement>(null);
  const distEl = useRef<HTMLSpanElement>(null);
  const comboEl = useRef<HTMLDivElement>(null);
  const comboNumEl = useRef<HTMLSpanElement>(null);
  const comboBarEl = useRef<HTMLDivElement>(null);
  const energyEl = useRef<HTMLDivElement>(null);
  const energyWrap = useRef<HTMLDivElement>(null);
  const hitFlash = useRef<HTMLDivElement>(null);
  const jellyFlash = useRef<HTMLDivElement>(null);
  const boltFlash = useRef<HTMLDivElement>(null);
  const lastScore = useRef(-1);
  const lastWisps = useRef(-1);
  const lastDist = useRef(-1);
  const lastBiome = useRef("");
  const lastCombo = useRef(0);
  const popupId = useRef(0);
  const alertTimer = useRef(0);
  const boatLackTimer = useRef(0);
  const unlockTimers = useRef<number[]>([]);

  const stateRef = useRef<GameState>("menu");
  stateRef.current = state;
  const menuViewRef = useRef(menuView);
  menuViewRef.current = menuView;
  const modalRef = useRef(modal);
  modalRef.current = modal;
  const unlockPhaseRef = useRef(unlockPhase);
  unlockPhaseRef.current = unlockPhase;

  useEffect(() => {
    engineRef.current?.setModalOpen(modal !== "none" || unlockPhase !== "idle");
  }, [modal, unlockPhase]);

  useEffect(() => {
    if (state !== "menu") return;
    if (menuView === "home") {
      engineRef.current?.previewEnvironment("sea", false);
    } else {
      engineRef.current?.previewEnvironment(previewMode, false);
    }
  }, [state, menuView, previewMode]);

  useEffect(() => {
    const initial = loadSettings();
    const audio = new GameAudio(initial.muted, initial.volume);
    audioRef.current = audio;

    const engine = new GameEngine(containerRef.current!, audio, initial, {
      onState: (s) => {
        setState(s);
        if (s !== "playing" && s !== "paused") {
          setAlert(null);
          setModal("none");
        }
      },
      onHud: (h) => {
        const s = Math.floor(h.score);
        if (scoreEl.current && s !== lastScore.current) {
          lastScore.current = s;
          scoreEl.current.textContent = s.toLocaleString("en-US");
        }
        if (wispsEl.current && h.wisps !== lastWisps.current) {
          lastWisps.current = h.wisps;
          wispsEl.current.textContent = h.wisps.toLocaleString("en-US");
        }
        if (distEl.current && (h.dist !== lastDist.current || h.biome !== lastBiome.current)) {
          lastDist.current = h.dist;
          lastBiome.current = h.biome;
          distEl.current.textContent = `${h.dist.toLocaleString("en-US")} m · ${h.biome}`;
        }
        if (comboEl.current) {
          const show = h.combo >= 2;
          comboEl.current.style.opacity = show ? "1" : "0";
          comboEl.current.style.transform = show ? "scale(1)" : "scale(0.6)";
          if (comboNumEl.current) comboNumEl.current.textContent = `×${h.combo}`;
          if (show && h.combo > lastCombo.current) {
            for (const el of [comboNumEl.current, scoreEl.current]) {
              if (!el) continue;
              const cls = el === scoreEl.current ? "bump" : "combo-pop";
              el.classList.remove(cls);
              void el.offsetWidth;
              el.classList.add(cls);
            }
          }
          if (comboBarEl.current)
            comboBarEl.current.style.transform = `scaleX(${Math.max(0, h.comboT / COMBO_WINDOW)})`;
        }
        lastCombo.current = h.combo;
        if (energyEl.current) energyEl.current.style.width = `${h.energy}%`;
        if (energyWrap.current) energyWrap.current.classList.toggle("energy-low", h.energy < 28);
      },
      onGameOver: (stats) => {
        if (settledRunId.current !== stats.runId) {
          settledRunId.current = stats.runId;
          const nextLights = addLights(stats.wisps);
          setLights(nextLights);
          setEarnedLights(stats.wisps);
        }
        const entry: ScoreEntry = {
          s: stats.score,
          w: stats.wisps,
          d: stats.dist,
          c: stats.maxCombo,
          m: stats.difficulty,
          env: stats.environment,
          t: Date.now(),
        };
        const { list, rank, isBest } = addScore(entry);
        setScores(list);
        setFinal(stats);
        setNewBest(isBest);
        setNewRank(rank);
      },
      onPopup: (p) => {
        const id = ++popupId.current;
        setPopups((ps) => [...ps.slice(-8), { ...p, id }]);
        window.setTimeout(() => setPopups((ps) => ps.filter((q) => q.id !== id)), 1000);
      },
      onFlash: (kind) => {
        const el =
          kind === "hit" ? hitFlash.current : kind === "bolt" ? boltFlash.current : jellyFlash.current;
        if (!el) return;
        el.style.transition = "none";
        el.style.opacity = "1";
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            el.style.transition = `opacity ${kind === "bolt" ? 420 : 700}ms ease-out`;
            el.style.opacity = "0";
          }),
        );
      },
      onAlert: (a) => {
        const id = ++popupId.current;
        setAlert({ ...a, id });
        window.clearTimeout(alertTimer.current);
        alertTimer.current = window.setTimeout(() => setAlert(null), 2800);
      },
    });
    engineRef.current = engine;

    const unlock = () => {
      audioRef.current?.ensure();
      audioRef.current?.startAmbient();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    const onKey = (e: KeyboardEvent) => {
      if (unlockPhaseRef.current !== "idle") {
        if (e.code === "Escape" && unlockPhaseRef.current === "revealed") {
          e.preventDefault();
          setUnlockPhase("idle");
        }
        return;
      }
      if (modalRef.current !== "none") {
        if (e.code === "Escape") {
          e.preventDefault();
          setModal("none");
          setConfirmClear(false);
        }
        return;
      }
      if (stateRef.current === "menu" && menuViewRef.current === "modes" && e.code === "Escape") {
        e.preventDefault();
        setMenuView("home");
        return;
      }
      if (e.code === "Space" || e.code === "Enter") {
        if (stateRef.current === "menu" && menuViewRef.current === "home") {
          e.preventDefault();
          audioRef.current?.ensure();
          audioRef.current?.startAmbient();
          audioRef.current?.click();
          setMenuView("modes");
        } else if (stateRef.current === "gameover") {
          e.preventDefault();
          audioRef.current?.ensure();
          audioRef.current?.startAmbient();
          if (!histArmed.current) {
            history.pushState({ drift: 1 }, "");
            histArmed.current = true;
          }
          engine.startRun();
        }
      }
    };
    window.addEventListener("keydown", onKey);

    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);

    // Android back button / gesture: pause or step back cleanly
    const onPop = () => {
      histArmed.current = false;
      const rearm = () => {
        history.pushState({ drift: 1 }, "");
        histArmed.current = true;
      };
      if (unlockPhaseRef.current !== "idle") {
        if (unlockPhaseRef.current === "revealed") setUnlockPhase("idle");
        rearm();
        return;
      }
      if (modalRef.current !== "none") {
        setModal("none");
        setConfirmClear(false);
        if (stateRef.current !== "menu") rearm();
        return;
      }
      const st = stateRef.current;
      if (st === "playing") {
        engine.pause();
        rearm();
      } else if (st === "paused") {
        setMenuView("modes");
        engine.toMenu();
      } else if (st === "gameover") {
        setMenuView("modes");
        engine.toMenu();
      } else if (st === "menu" && menuViewRef.current === "modes") {
        setMenuView("home");
        rearm();
      }
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("popstate", onPop);
      window.clearTimeout(alertTimer.current);
      window.clearTimeout(boatLackTimer.current);
      for (const tid of unlockTimers.current) window.clearTimeout(tid);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // show opening hint at run start only
  const prevState = useRef<GameState>("menu");
  useEffect(() => {
    const from = prevState.current;
    prevState.current = state;
    if (state !== "playing" || from === "paused") return;
    setShowHint(true);
    const id = window.setTimeout(() => setShowHint(false), 4200);
    return () => window.clearTimeout(id);
  }, [state]);

  const updateSettings = (patch: Partial<GameSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      audioRef.current?.setMuted(next.muted);
      audioRef.current?.setVolume(next.volume);
      engineRef.current?.applySettings(next);
      return next;
    });
  };

  const blurActive = () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };
  const armHistory = () => {
    if (histArmed.current) return;
    history.pushState({ drift: 1 }, "");
    histArmed.current = true;
  };
  const enterFullscreen = () => {
    if (!CAN_FULLSCREEN || document.fullscreenElement) return;
    document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  };
  const toggleFullscreen = () => {
    blurActive();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else enterFullscreen();
  };
  const chooseSteering = async (mode: TouchControl) => {
    if (mode === "tilt") {
      const DOE = window.DeviceOrientationEvent as unknown as
        | { requestPermission?: () => Promise<string> }
        | undefined;
      if (DOE && typeof DOE.requestPermission === "function") {
        try {
          if ((await DOE.requestPermission()) !== "granted") return;
        } catch {
          return;
        }
      }
    }
    updateSettings({ touchControl: mode });
  };
  const openModeSelect = () => {
    blurActive();
    setModal("none");
    armHistory();
    audioRef.current?.ensure();
    audioRef.current?.startAmbient();
    audioRef.current?.click();
    setPreviewMode(settings.environment);
    setMenuView("modes");
  };
  const returnHome = () => {
    blurActive();
    setModal("none");
    audioRef.current?.click();
    setMenuView("home");
  };
  const startMode = (env: EnvironmentMode) => {
    blurActive();
    if (env === "mangrove" && !unlockedModes.includes("mangrove")) {
      setPreviewMode("mangrove");
      setModal("unlock");
      audioRef.current?.ensure();
      audioRef.current?.click();
      return;
    }
    setModal("none");
    setUnlockPhase("idle");
    armHistory();
    if (IS_TOUCH && settings.autoFullscreen) enterFullscreen();
    audioRef.current?.ensure();
    audioRef.current?.startAmbient();
    audioRef.current?.click();
    updateSettings({ environment: env });
    engineRef.current?.startRun(env);
  };
  const togglePause = () => {
    blurActive();
    setModal("none");
    audioRef.current?.click();
    engineRef.current?.togglePause();
  };
  const restart = () => {
    blurActive();
    setModal("none");
    armHistory();
    audioRef.current?.click();
    engineRef.current?.startRun();
  };
  const toModes = () => {
    blurActive();
    setModal("none");
    audioRef.current?.click();
    setPreviewMode(final?.environment ?? settings.environment);
    setMenuView("modes");
    engineRef.current?.toMenu();
  };
  const toHome = () => {
    blurActive();
    setModal("none");
    audioRef.current?.click();
    setMenuView("home");
    engineRef.current?.toMenu();
  };
  const toggleMute = () => {
    blurActive();
    updateSettings({ muted: !settings.muted });
  };
  const openModal = (m: "settings" | "scores" | "unlock" | "garage") => {
    blurActive();
    audioRef.current?.ensure();
    audioRef.current?.click();
    setConfirmClear(false);
    setConfirmBuyBoat(null);
    window.clearTimeout(boatLackTimer.current);
    setBoatLackToast(0);
    if (m === "unlock") setPreviewMode("mangrove");
    if (m === "garage") setGarageBoat(settings.boatLevel);
    setModal(m);
  };

  const equippedBoat = BOAT_SPECS[settings.boatLevel];
  const selectedBoatSpec = BOAT_SPECS[garageBoat];
  const selectedBoatUnlocked = unlockedBoats.includes(garageBoat);
  const selectedBoatEquipped = settings.boatLevel === garageBoat;
  const canAffordSelectedBoat = lights >= selectedBoatSpec.cost;
  const remainingBoatLights = Math.max(0, selectedBoatSpec.cost - lights);

  const triggerNeedMoreLights = () => {
    audioRef.current?.ensure();
    audioRef.current?.warn();
    window.clearTimeout(boatLackTimer.current);
    setBoatLackToast((n) => n + 1);
    boatLackTimer.current = window.setTimeout(() => setBoatLackToast(0), 2200);
  };

  const closeGarage = () => {
    setModal("none");
    setConfirmBuyBoat(null);
    window.clearTimeout(boatLackTimer.current);
    setBoatLackToast(0);
  };

  const equipBoat = (lvl: BoatLevel) => {
    blurActive();
    if (!unlockedBoats.includes(lvl)) return;
    audioRef.current?.ensure();
    audioRef.current?.chime(2, lvl === 3);
    updateSettings({ boatLevel: lvl });
  };

  const confirmUnlockBoat = (lvl: BoatLevel) => {
    blurActive();
    const spec = BOAT_SPECS[lvl];
    const res = unlockBoatWithLights(lvl, spec.cost);
    if (!res.ok) {
      audioRef.current?.ensure();
      audioRef.current?.warn();
      return;
    }
    setLights(res.balance);
    setUnlockedBoats(res.unlocked);
    setConfirmBuyBoat(null);
    updateSettings({ boatLevel: lvl });
    audioRef.current?.ensure();
    [0, 2, 4].forEach((s, i) => window.setTimeout(() => audioRef.current?.chime(s, true), i * 110));
  };

  const mangroveUnlocked = unlockedModes.includes("mangrove");
  const canUnlockMangrove = lights >= MANGROVE_UNLOCK_COST;
  const remainingLights = Math.max(0, MANGROVE_UNLOCK_COST - lights);

  const confirmUnlockMangrove = () => {
    blurActive();
    if (mangroveUnlocked) {
      setModal("none");
      return;
    }
    const res = unlockMangroveWithLights(MANGROVE_UNLOCK_COST);
    if (!res.ok) {
      audioRef.current?.ensure();
      audioRef.current?.warn();
      return;
    }
    setLights(res.balance);
    setUnlockedModes(res.unlocked);
    setModal("none");
    updateSettings({ environment: "mangrove" });
    setPreviewMode("mangrove");

    for (const tid of unlockTimers.current) window.clearTimeout(tid);
    unlockTimers.current = [];

    audioRef.current?.ensure();
    audioRef.current?.startAmbient();
    [0, 2, 4, 6, 8].forEach((step, idx) => {
      const tid = window.setTimeout(() => audioRef.current?.chime(step, idx >= 3), idx * 145);
      unlockTimers.current.push(tid);
    });

    setUnlockPhase("gathering");
    unlockTimers.current.push(
      window.setTimeout(() => {
        engineRef.current?.previewEnvironment("mangrove", true);
        audioRef.current?.biomeCue();
        setUnlockPhase("gateway");
      }, 920),
    );
    unlockTimers.current.push(
      window.setTimeout(() => {
        setUnlockPhase("revealed");
      }, 1900),
    );
  };

  const best = scores[0]?.s ?? 0;
  const inGame = state === "playing" || state === "paused";

  return (
    <div className="fixed inset-0 overflow-hidden bg-ink font-body text-foam">
      {/* 3D canvas */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* subtle framing vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 120% 90% at 50% 42%, transparent 58%, rgba(2,10,14,0.42) 100%)",
        }}
      />
      {state === "menu" && <div className="pointer-events-none absolute inset-0 bg-ink/25" />}

      {/* flashes */}
      <div
        ref={hitFlash}
        className="pointer-events-none absolute inset-0 opacity-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 60%, rgba(255,92,48,0.3), rgba(120,20,10,0.2) 60%, rgba(120,10,0,0.28))",
        }}
      />
      <div
        ref={jellyFlash}
        className="pointer-events-none absolute inset-0 opacity-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(255,244,214,0.35), rgba(120,240,255,0.14) 55%, transparent)",
        }}
      />
      <div
        ref={boltFlash}
        className="pointer-events-none absolute inset-0 opacity-0"
        style={{ background: "rgba(214,230,255,0.2)" }}
      />

      {/* floating score popups */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {popups.map((p) => (
          <span
            key={p.id}
            className={`score-popup absolute whitespace-nowrap font-display font-bold ${
              p.tone === "gold"
                ? "text-2xl text-[#ffe9a8] [text-shadow:0_0_22px_rgba(255,220,140,0.9)]"
                : p.tone === "danger"
                  ? "text-xl text-[#ff7a5c] [text-shadow:0_0_18px_rgba(255,60,30,0.9),0_2px_6px_rgba(0,0,0,0.7)]"
                  : p.tone === "teal"
                    ? "text-lg text-[#7df5e0] [text-shadow:0_0_16px_rgba(80,240,210,0.8)]"
                    : "text-lg text-[#ffcf7d] [text-shadow:0_0_16px_rgba(255,170,80,0.8)]"
            }`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            {p.text}
          </span>
        ))}
      </div>

      {/* ------------------------- HUD ------------------------- */}
      {inGame && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-ink/50 to-transparent" />
          <div className="pointer-events-none absolute left-4 top-4 md:left-6 md:top-6" style={SAFE_TL}>
            <div className="text-[10px] font-semibold tracking-[0.3em] text-foam/60">SCORE</div>
            <span
              ref={scoreEl}
              className="block origin-left font-display text-3xl font-bold leading-tight text-foam [text-shadow:0_2px_18px_rgba(0,0,0,0.7)] md:text-4xl"
            >
              0
            </span>
            <span
              ref={distEl}
              className="block text-xs font-medium tracking-wider text-foam/55 [text-shadow:0_1px_8px_rgba(0,0,0,0.8)]"
            >
              0 m
            </span>
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-[#05141a]/75 px-2.5 py-0.5 text-xs font-bold text-amber shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
              {I.flame("h-3 w-3 text-amber")}
              <span ref={wispsEl}>0</span>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-foam/65">Lights</span>
            </div>
            <div
              ref={comboEl}
              className="mt-2 inline-flex flex-col overflow-hidden rounded-lg border border-amber/50 bg-[#05141a]/80 px-3 py-1.5 opacity-0 transition-all duration-200"
              style={{ transform: "scale(0.6)" }}
            >
              <span
                ref={comboNumEl}
                className="inline-block font-display text-xl font-bold text-amber [text-shadow:0_0_14px_rgba(255,180,84,0.7)]"
              >
                ×1
              </span>
              <div className="mt-1 h-0.5 w-full overflow-hidden rounded bg-foam/15">
                <div
                  ref={comboBarEl}
                  className="h-full w-full origin-left bg-amber"
                  style={{ transform: "scaleX(0)" }}
                />
              </div>
            </div>
          </div>

          <div className="absolute right-4 top-4 flex gap-2 md:right-6 md:top-6" style={SAFE_TR}>
            {IS_TOUCH && CAN_FULLSCREEN && (
              <button
                onClick={toggleFullscreen}
                aria-label={isFs ? "Exit fullscreen" : "Fullscreen"}
                className="icon-btn flex h-11 w-11 items-center justify-center text-foam/85"
              >
                {isFs ? I.shrink("h-5 w-5") : I.expand("h-5 w-5")}
              </button>
            )}
            <button
              onClick={toggleMute}
              aria-label={settings.muted ? "Unmute" : "Mute"}
              className="icon-btn flex h-11 w-11 items-center justify-center text-foam/85"
            >
              {settings.muted ? I.soundOff("h-5 w-5") : I.soundOn("h-5 w-5")}
            </button>
            <button
              onClick={togglePause}
              aria-label={state === "paused" ? "Resume" : "Pause"}
              className="icon-btn flex h-11 w-11 items-center justify-center text-foam/85"
            >
              {state === "paused" ? I.play("h-5 w-5") : I.pause("h-5 w-5")}
            </button>
          </div>

          {/* hazard alerts */}
          {alert && state === "playing" && (
            <div className="pointer-events-none absolute inset-x-0 top-[15%] flex justify-center px-4">
              <div
                key={alert.id}
                className={`alert-banner flex items-center gap-2.5 rounded-full border px-5 py-2 font-display text-xs font-bold tracking-[0.16em] md:text-sm ${
                  alert.tone === "warn"
                    ? "border-[#ff7a5c]/60 bg-[#2a0d08]/85 text-[#ffb09a] shadow-[0_0_30px_rgba(255,90,50,0.35)]"
                    : alert.tone === "milestone"
                    ? "border-amber/70 bg-[#261304]/90 text-amber shadow-[0_0_35px_rgba(255,180,84,0.45)]"
                    : "border-lumen/50 bg-[#05201f]/85 text-[#9ff3e2] shadow-[0_0_30px_rgba(63,217,192,0.25)]"
                }`}
              >
                {alert.tone === "warn" && (
                  <span className="warn-blink">{I.warn("h-4 w-4")}</span>
                )}
                {alert.tone === "milestone" && (
                  <span className="text-amber">{I.flame("h-4 w-4")}</span>
                )}
                {alert.text.toUpperCase()}
              </div>
            </div>
          )}

          {/* lamplight meter */}
          <div className="pointer-events-none absolute inset-x-0 bottom-5 flex flex-col items-center md:bottom-7" style={{ bottom: "max(1.25rem, calc(env(safe-area-inset-bottom) + 0.75rem))" }}>
            <div
              ref={energyWrap}
              className="h-2.5 w-[min(78vw,520px)] overflow-hidden rounded-full border border-foam/25 bg-[#041014]/85"
            >
              <div
                ref={energyEl}
                className="energy-fill h-full rounded-full"
                style={{
                  width: "100%",
                  background: "linear-gradient(90deg, #ff7a45 0%, #ffb454 55%, #ffd98a 100%)",
                  boxShadow: "0 0 14px rgba(255,158,69,0.65)",
                }}
              />
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.32em] text-foam/60 [text-shadow:0_1px_6px_rgba(0,0,0,0.8)]">
              {I.flame("h-3 w-3 text-amber")}
              LAMPLIGHT
            </div>
          </div>

          {showHint && state === "playing" && !alert && (
            <div className="pointer-events-none absolute inset-x-0 top-[15%] flex justify-center px-4">
              <div className="anim-popIn rounded-full border border-foam/15 bg-[#05141a]/75 px-5 py-2 text-center text-sm text-foam/90">
                {IS_TOUCH ? "Slide anywhere to steer · catch the lights" : "Steer for lights · dodge rocks, mines & swells"}
              </div>
            </div>
          )}
        </>
      )}

      {/* ------------------------- MENU HUB (HOME / MODE SELECTION) ------------------------- */}
      {state === "menu" && (
        <div className="absolute inset-0 overflow-y-auto">
          {/* top-left: home back button (in modes view) or lights wallet */}
          <div className="absolute left-4 top-4 z-10 flex items-center gap-2 md:left-6 md:top-6" style={SAFE_TL}>
            {menuView === "modes" && (
              <button
                type="button"
                onClick={returnHome}
                className="flex h-11 items-center gap-1.5 rounded-full border border-foam/20 bg-[#05141a]/75 px-4 text-xs font-semibold tracking-wide text-foam/90 shadow-[0_4px_20px_rgba(0,0,0,0.35)] backdrop-blur-xs transition-all hover:border-amber/50 hover:text-amber"
              >
                <span>←</span>
                <span>Home</span>
              </button>
            )}
            <div
              title="Collect glowing lights during voyages to unlock new environments"
              className="flex h-11 items-center gap-2 rounded-full border border-amber/35 bg-[#05141a]/75 px-4 text-xs font-bold tracking-wide text-amber shadow-[0_4px_20px_rgba(0,0,0,0.35)] backdrop-blur-xs"
            >
              {I.flame("h-4 w-4 text-amber")}
              <span>{lights.toLocaleString("en-US")}</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-foam/65">
                Lights
              </span>
            </div>
          </div>

          {/* top-right utility bar */}
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2 md:right-6 md:top-6" style={SAFE_TR}>
            {CAN_FULLSCREEN && (
              <button
                onClick={toggleFullscreen}
                aria-label={isFs ? "Exit fullscreen" : "Fullscreen"}
                title={isFs ? "Exit fullscreen" : "Fullscreen"}
                className="icon-btn flex h-11 w-11 items-center justify-center text-foam/85"
              >
                {isFs ? I.shrink("h-5 w-5") : I.expand("h-5 w-5")}
              </button>
            )}
            {!IS_NATIVE && (
              <a
                href={APK_DOWNLOAD_URL}
                download="SeaDrift.apk"
                aria-label="Download Android APK"
                title="Download Android APK (100% Offline Play)"
                className="icon-btn flex h-11 w-11 items-center justify-center text-emerald-400 transition-colors hover:text-emerald-300"
              >
                {I.android("h-5 w-5")}
              </a>
            )}
            <button
              onClick={() => openModal("scores")}
              aria-label="Best Voyages"
              title="Best Voyages"
              className="icon-btn flex h-11 w-11 items-center justify-center text-amber"
            >
              {I.trophy("h-5 w-5")}
            </button>
            <button
              onClick={() => openModal("settings")}
              aria-label="Settings"
              title="Settings"
              className="icon-btn flex h-11 w-11 items-center justify-center text-foam/85"
            >
              {I.gear("h-5 w-5")}
            </button>
            <button
              onClick={toggleMute}
              aria-label={settings.muted ? "Unmute" : "Mute"}
              title={settings.muted ? "Unmute" : "Mute"}
              className="icon-btn flex h-11 w-11 items-center justify-center text-foam/85"
            >
              {settings.muted ? I.soundOff("h-5 w-5") : I.soundOn("h-5 w-5")}
            </button>
          </div>

          {menuView === "home" ? (
            <div className="flex min-h-full flex-col items-center justify-between px-4 pb-6 pt-20 md:py-10">
              <div />

              {/* homepage hero */}
              <div className="anim-fadeUp flex flex-col items-center text-center">
                <div className="mb-3 flex items-center justify-center gap-2 text-[10px] font-semibold tracking-[0.36em] text-foam/70">
                  {I.boat("h-4 w-4 shrink-0 text-amber")}
                  DUSK VOYAGE
                  {I.boat("h-4 w-4 shrink-0 -scale-x-100 text-amber")}
                </div>
                <h1 className="title-glow font-title text-6xl font-normal tracking-wide text-foam sm:text-7xl md:text-8xl">
                  Sea Drift
                </h1>
                <WaveLine />

                <div className="mt-7 flex flex-col items-center gap-3">
                  <button
                    onClick={openModeSelect}
                    className="btn-primary flex items-center gap-3 px-12 py-4 text-base font-bold tracking-[0.2em]"
                  >
                    {I.play("h-5 w-5")}
                    PLAY
                  </button>

                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      onClick={() => openModal("settings")}
                      className="inline-flex items-center gap-1.5 rounded-full border border-foam/18 bg-[#05141a]/65 px-3.5 py-1 text-xs font-medium text-foam/80 transition-colors hover:border-foam/35 hover:text-foam"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-lumen" />
                      {DIFF_INFO[settings.difficulty].label} ({DIFF_INFO[settings.difficulty].mult})
                    </button>
                    {best > 0 && (
                      <button
                        onClick={() => openModal("scores")}
                        className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/10 px-3.5 py-1 text-xs font-semibold tracking-wider text-amber transition-colors hover:bg-amber/20"
                      >
                        {I.flame("h-3.5 w-3.5")}
                        BEST {best.toLocaleString("en-US")}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div />
            </div>
          ) : (
            /* ------------------------- MODE SELECTION SCREEN ------------------------- */
            <div className="flex min-h-full flex-col items-center justify-center px-4 pb-8 pt-24 md:py-16">
              <div className="anim-fadeUp w-full max-w-4xl">
                <div className="mb-6 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.34em] text-amber/85">
                    Select Environment
                  </div>
                  <h2 className="mt-1 font-display text-3xl font-black tracking-tight text-foam sm:text-4xl">
                    CHOOSE YOUR VOYAGE
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  {/* Card 1: Sea Mode */}
                  <div
                    onMouseEnter={() => setPreviewMode("sea")}
                    onFocus={() => setPreviewMode("sea")}
                    className={`group relative flex flex-col overflow-hidden rounded-3xl border bg-[#061820]/82 backdrop-blur-md transition-all duration-300 ${
                      previewMode === "sea"
                        ? "border-amber/75 shadow-[0_12px_45px_rgba(255,180,84,0.22)]"
                        : "border-foam/15 hover:border-amber/50"
                    }`}
                  >
                    {/* Ocean visual preview banner */}
                    <div className="relative h-48 sm:h-52 w-full overflow-hidden bg-[#061820]">
                      <div className="h-full w-full transition-transform duration-700 ease-out group-hover:scale-[1.03]">
                        <EnvironmentPreview mode="sea" className="h-full w-full" />
                      </div>
                      {/* Subtle atmospheric vignette & seamless bottom melt */}
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_50%,rgba(4,19,26,0.48)_100%)]" />
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber/30 to-transparent" />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#061820] via-[#061820]/65 to-transparent" />

                      <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/45 bg-[#051a1d]/80 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300 shadow-[0_4px_16px_rgba(0,0,0,0.45)] backdrop-blur-md">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                        Unlocked
                      </div>
                      <div className="pointer-events-none absolute bottom-5 left-5 right-5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-amber/80">
                        <span className="rounded-full border border-amber/20 bg-[#041820]/70 px-2.5 py-0.5 backdrop-blur-xs">
                          Open Ocean
                        </span>
                      </div>
                    </div>

                    <div className="relative z-10 -mt-3 flex flex-1 flex-col justify-between p-6 pt-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-xl font-black tracking-wide text-foam">
                          Sea Mode
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() => startMode("sea")}
                        className="btn-primary mt-5 flex w-full items-center justify-center gap-2 py-3.5 text-xs font-bold uppercase tracking-[0.2em]"
                      >
                        {I.play("h-4 w-4")}
                        Play Sea Mode
                      </button>
                    </div>
                  </div>

                  {/* Card 2: Enchanted Mangrove */}
                  <div
                    onMouseEnter={() => setPreviewMode("mangrove")}
                    onFocus={() => setPreviewMode("mangrove")}
                    onClick={() => {
                      if (!mangroveUnlocked) openModal("unlock");
                    }}
                    className={`group relative flex flex-col overflow-hidden rounded-3xl border bg-[#06181a]/84 backdrop-blur-md transition-all duration-300 ${
                      !mangroveUnlocked ? "cursor-pointer" : ""
                    } ${
                      previewMode === "mangrove"
                        ? "border-[#43E6C1]/80 shadow-[0_12px_45px_rgba(67,230,193,0.22)]"
                        : "border-foam/15 hover:border-[#43E6C1]/50"
                    }`}
                  >
                    {/* Midnight Mangrove visual preview banner */}
                    <div className="relative h-48 sm:h-52 w-full overflow-hidden bg-[#06181a]">
                      <div className="h-full w-full transition-transform duration-700 ease-out group-hover:scale-[1.03]">
                        <EnvironmentPreview
                          mode="mangrove"
                          locked={!mangroveUnlocked}
                          className="h-full w-full"
                        />
                      </div>
                      {/* Atmospheric vignette & seamless bottom melt */}
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_48%,rgba(4,20,19,0.55)_100%)]" />
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#43E6C1]/30 to-transparent" />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#06181a] via-[#06181a]/65 to-transparent" />

                      <div
                        className={`absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest shadow-[0_4px_16px_rgba(0,0,0,0.45)] backdrop-blur-md ${
                          mangroveUnlocked
                            ? "border-[#43E6C1]/50 bg-[#051d1b]/85 text-[#43E6C1]"
                            : "border-amber/45 bg-[#121614]/85 text-amber"
                        }`}
                      >
                        {mangroveUnlocked ? (
                          <>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#43E6C1] shadow-[0_0_8px_#43E6C1]" />
                            Unlocked
                          </>
                        ) : (
                          <>
                            {I.lock("h-3 w-3")}
                            Locked
                          </>
                        )}
                      </div>
                      <div className="pointer-events-none absolute bottom-5 left-5 right-5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-[#43E6C1]/85">
                        <span className="rounded-full border border-[#43E6C1]/25 bg-[#041b19]/75 px-2.5 py-0.5 backdrop-blur-xs">
                          Midnight Canopy
                        </span>
                      </div>
                    </div>

                    <div className="relative z-10 -mt-3 flex flex-1 flex-col justify-between p-6 pt-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <h3 className="font-display text-xl font-black tracking-wide text-foam">
                            Enchanted Mangrove
                          </h3>
                          {!mangroveUnlocked && (
                            <span className="flex items-center gap-1 text-xs font-bold text-amber">
                              {I.flame("h-3.5 w-3.5")}
                              {MANGROVE_UNLOCK_COST.toLocaleString("en-US")}
                            </span>
                          )}
                        </div>

                        {!mangroveUnlocked && (
                          <div className="mt-3 space-y-2 rounded-2xl border border-foam/10 bg-ink/50 p-3.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-foam/65">Progress</span>
                              <span className="font-bold text-foam">
                                {lights.toLocaleString("en-US")} / {MANGROVE_UNLOCK_COST.toLocaleString("en-US")}
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-foam/10">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  canUnlockMangrove
                                    ? "bg-gradient-to-r from-[#43E6C1] to-amber shadow-[0_0_12px_rgba(67,230,193,0.65)]"
                                    : "bg-gradient-to-r from-ember to-amber"
                                }`}
                                style={{
                                  width: `${Math.min(100, (lights / MANGROVE_UNLOCK_COST) * 100)}%`,
                                }}
                              />
                            </div>
                            <div className="text-[11px] font-semibold">
                              {canUnlockMangrove ? (
                                <span className="text-[#43E6C1]">Ready to unlock</span>
                              ) : (
                                <span className="text-amber/90">
                                  {remainingLights.toLocaleString("en-US")} Lights needed
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {mangroveUnlocked ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startMode("mangrove");
                          }}
                          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-[#43E6C1]/60 bg-gradient-to-b from-[#43E6C1] to-[#1aa88a] py-3.5 text-xs font-bold uppercase tracking-[0.2em] text-[#031915] shadow-[0_6px_24px_rgba(67,230,193,0.3)] transition-all hover:brightness-105 active:scale-[0.98]"
                        >
                          {I.play("h-4 w-4")}
                          Play Mangrove
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openModal("unlock");
                          }}
                          className={`mt-5 flex w-full items-center justify-center gap-2 rounded-xl border py-3.5 text-xs font-bold uppercase tracking-[0.18em] transition-all ${
                            canUnlockMangrove
                              ? "border-[#43E6C1]/70 bg-[#43E6C1]/18 text-[#43E6C1] shadow-[0_0_24px_rgba(67,230,193,0.22)] hover:bg-[#43E6C1]/28"
                              : "border-foam/20 bg-foam/[0.06] text-foam/85 hover:border-amber/40 hover:text-amber"
                          }`}
                        >
                          {I.lock("h-4 w-4")}
                          {canUnlockMangrove ? "Unlock Mangrove" : "View Unlock Details"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Boat Garage Bar */}
                <button
                  type="button"
                  onClick={() => openModal("garage")}
                  className="group mt-5 flex w-full items-center justify-between gap-4 rounded-3xl border border-foam/15 bg-[#061820]/86 px-5 py-4 text-left backdrop-blur-md transition-all duration-300 hover:border-amber/55 hover:bg-[#081f29]/90 hover:shadow-[0_10px_36px_rgba(255,180,84,0.14)] sm:px-6"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber/35 bg-amber/10 text-amber shadow-[0_0_18px_rgba(255,180,84,0.18)] transition-transform duration-300 group-hover:scale-105">
                      {I.boat("h-5 w-5")}
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-amber/85">
                        Boat Garage
                      </div>
                      <div className="mt-0.5 font-display text-sm font-black tracking-wide text-foam sm:text-base">
                        {equippedBoat.name}
                      </div>
                    </div>
                  </div>

                  <div className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber/45 bg-amber/15 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-amber transition-all group-hover:border-amber group-hover:bg-amber group-hover:text-ink">
                    {I.boat("h-3.5 w-3.5")}
                    <span>Garage</span>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------- PAUSE ------------------------- */}
      {state === "paused" && modal === "none" && (
        <div className="absolute inset-0 overflow-y-auto bg-ink/60 backdrop-blur-[3px]">
          <div className="flex min-h-full items-center justify-center px-4 py-6">
          <div className="panel anim-popIn w-full max-w-sm p-7 text-center">
            <h2 className="font-display text-3xl font-bold tracking-wide text-foam">ADRIFT</h2>
            <p className="mt-1.5 text-sm italic text-foam/60">the sea will wait for you</p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                onClick={togglePause}
                className="btn-primary flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold tracking-[0.15em]"
              >
                {I.play("h-4 w-4")} RESUME
              </button>
              <button
                onClick={restart}
                className="btn-ghost px-6 py-3 text-sm font-semibold tracking-wide"
              >
                Restart voyage{!IS_TOUCH && <> · <kbd>R</kbd></>}
              </button>
              <button
                onClick={() => openModal("settings")}
                className="btn-ghost flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold tracking-wide"
              >
                {I.gear("h-4 w-4")} Settings
              </button>
              <button
                onClick={toModes}
                className="btn-ghost px-6 py-3 text-sm font-semibold tracking-wide"
              >
                Mode Selection
              </button>
              <button
                onClick={toHome}
                className="text-xs font-medium text-foam/50 transition-colors hover:text-foam pt-1"
              >
                Return to Home
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* ------------------------- REWARD SETTLEMENT / GAME OVER ------------------------- */}
      {state === "gameover" && final && (
        <div className="anim-modal-backdrop absolute inset-0 z-20 flex items-center justify-center bg-ink/70 px-4 backdrop-blur-md">
          <div className="glass-modal anim-modal-card relative w-full max-w-sm p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.6)] sm:p-7">
            {newBest && (
              <div className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-amber/50 bg-ink2/95 px-3.5 py-0.5 font-display text-[10px] font-black tracking-[0.22em] text-amber shadow-[0_0_24px_rgba(255,180,84,0.45)]">
                ★ NEW BEST
              </div>
            )}

            <h2 className="font-display text-2xl font-black tracking-wider text-foam sm:text-3xl">
              THE LAMP GOES OUT
            </h2>

            {/* Score */}
            <div className="mt-4">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-foam/10 bg-foam/[0.04] px-3 py-0.5 text-[10px] font-semibold tracking-wider text-foam/60">
                <span>{final.environment === "mangrove" ? "Enchanted Mangrove" : "Sea Mode"}</span>
                <span className="text-foam/30">·</span>
                <span>{DIFF_INFO[final.difficulty].label}</span>
              </div>

              <div className="mt-2 font-display text-5xl font-black text-amber [text-shadow:0_0_35px_rgba(255,180,84,0.45)] sm:text-6xl">
                {final.score.toLocaleString("en-US")}
              </div>

              {!newBest && scores[0]?.s > 0 && (
                <div className="mt-1 text-[11px] font-medium tracking-wide text-foam/45">
                  BEST <span className="text-foam/75">{scores[0].s.toLocaleString("en-US")}</span>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                ["LIGHTS", `${final.wisps}`],
                ["DISTANCE", `${final.dist}m`],
                ["COMBO", `×${final.maxCombo}`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-foam/10 bg-foam/[0.04] py-2.5 px-1"
                >
                  <div className="font-display text-base font-bold text-foam sm:text-lg">{value}</div>
                  <div className="mt-0.5 text-[9px] font-semibold tracking-wider text-foam/45">
                    {label}
                  </div>
                </div>
              ))}
            </div>

            {/* Reward Settlement */}
            <div className="mt-3 rounded-xl border border-amber/25 bg-amber/[0.07] p-3 text-left">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-bold text-amber">
                  {I.flame("h-3.5 w-3.5")}
                  +{earnedLights.toLocaleString("en-US")} Lights Earned
                </span>
                <span className="font-semibold text-foam/80">
                  Total: {lights.toLocaleString("en-US")}
                </span>
              </div>
              {!mangroveUnlocked && (
                <div className="mt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-foam/10">
                    <div
                      className={`h-full rounded-full ${canUnlockMangrove ? "bg-[#43E6C1]" : "bg-amber"}`}
                      style={{
                        width: `${Math.min(100, (lights / MANGROVE_UNLOCK_COST) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="mt-1 text-[10px] font-medium text-foam/65">
                    {canUnlockMangrove
                      ? "Enough Lights collected — Enchanted Mangrove ready to unlock!"
                      : `${remainingLights.toLocaleString("en-US")} more Lights to unlock Enchanted Mangrove`}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
              <button
                onClick={toModes}
                className="btn-primary flex flex-1 items-center justify-center gap-2 py-3 text-xs font-bold tracking-[0.14em]"
              >
                MODE SELECTION
              </button>
              <button
                onClick={restart}
                className="btn-ghost flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-semibold tracking-wider"
              >
                {I.play("h-3.5 w-3.5")} SAIL AGAIN
              </button>
            </div>

            {/* Home & Leaderboard Links */}
            <div className="mt-4 flex items-center justify-center gap-5">
              <button
                onClick={toHome}
                className="text-[11px] font-medium text-foam/45 transition-colors hover:text-foam"
              >
                Home
              </button>
              <span className="text-foam/20">·</span>
              <button
                onClick={() => setModal("scores")}
                className="flex items-center gap-1.5 text-[11px] font-medium text-foam/45 transition-colors hover:text-amber"
              >
                {I.trophy("h-3.5 w-3.5")}
                <span>Leaderboard</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------- MANGROVE UNLOCK / CONFIRMATION MODAL ------------------------- */}
      {modal === "unlock" && (
        <div
          className="anim-modal-backdrop fixed inset-0 z-30 flex items-center justify-center bg-ink/75 px-4 backdrop-blur-md"
          onClick={() => setModal("none")}
        >
          <div
            className="glass-modal anim-modal-card w-full max-w-md overflow-hidden border-[#43E6C1]/25 shadow-[0_24px_80px_rgba(0,0,0,0.75)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header preview */}
            <div className="relative h-36 overflow-hidden bg-[#04151c]">
              <EnvironmentPreview mode="mangrove" locked className="h-full w-full" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#071e23] via-[#071e23]/45 to-transparent" />
              <div className="absolute inset-0 flex items-end justify-between p-5 pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-amber/35 bg-black/45 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber backdrop-blur-xs">
                    {I.lock("h-3 w-3")}
                    Locked Environment
                  </div>
                  <h3 className="mt-2 font-display text-2xl font-black text-foam">
                    Enchanted Mangrove
                  </h3>
                </div>
                <button
                  onClick={() => setModal("none")}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/40 text-foam/70 backdrop-blur-xs hover:bg-white/15 hover:text-white"
                >
                  {I.close("h-4 w-4")}
                </button>
              </div>
            </div>

            <div className="p-6">
              <p className="text-xs leading-relaxed text-foam/70">
                Venture into a midnight tropical river surrounded by towering arching roots, floating fireflies, glowing cyan flora, and dense mist.
              </p>

              {/* Currency summary */}
              <div className="mt-4 space-y-2.5 rounded-2xl border border-foam/10 bg-ink/60 p-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-foam/65">Unlock Cost</span>
                  <span className="flex items-center gap-1 font-bold text-amber">
                    {I.flame("h-3.5 w-3.5")}
                    {MANGROVE_UNLOCK_COST.toLocaleString("en-US")} Lights
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foam/65">Your Current Balance</span>
                  <span className="font-bold text-foam">
                    {lights.toLocaleString("en-US")} Lights
                  </span>
                </div>
                <div className="border-t border-foam/10 pt-2 flex items-center justify-between">
                  <span className="text-foam/65">
                    {canUnlockMangrove ? "Balance After Purchase" : "Remaining Needed"}
                  </span>
                  <span className={`font-bold ${canUnlockMangrove ? "text-[#43E6C1]" : "text-ember"}`}>
                    {canUnlockMangrove
                      ? `${(lights - MANGROVE_UNLOCK_COST).toLocaleString("en-US")} Lights`
                      : `${remainingLights.toLocaleString("en-US")} more Lights`}
                  </span>
                </div>
              </div>

              {canUnlockMangrove ? (
                <div className="mt-5">
                  <p className="mb-4 text-center text-xs font-medium text-foam/80">
                    Confirm spending{" "}
                    <span className="font-bold text-amber">
                      {MANGROVE_UNLOCK_COST.toLocaleString("en-US")} Lights
                    </span>{" "}
                    to permanently unlock Enchanted Mangrove?
                  </p>
                  <div className="flex flex-col gap-2.5 sm:flex-row">
                    <button
                      type="button"
                      onClick={confirmUnlockMangrove}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#43E6C1] to-[#1aa88a] py-3 text-xs font-bold uppercase tracking-[0.16em] text-[#031915] shadow-[0_6px_24px_rgba(67,230,193,0.35)] transition-all hover:brightness-105 active:scale-[0.98]"
                    >
                      {I.flame("h-4 w-4")}
                      Confirm Unlock
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal("none")}
                      className="btn-ghost flex-1 py-3 text-xs font-semibold tracking-wider"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-5">
                  <p className="mb-4 text-center text-xs leading-relaxed text-foam/65">
                    Insufficient Lights. Sail through <span className="font-semibold text-amber">Sea Mode</span> and catch glowing wisps to gather the remaining Lights.
                  </p>
                  <div className="flex flex-col gap-2.5 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => startMode("sea")}
                      className="btn-primary flex flex-1 items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-[0.14em]"
                    >
                      {I.play("h-3.5 w-3.5")}
                      Sail Sea Mode
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal("none")}
                      className="btn-ghost flex-1 py-3 text-xs font-semibold tracking-wider"
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------- UNLOCK GATEWAY ANIMATION ------------------------- */}
      {unlockPhase !== "idle" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center overflow-hidden">
          {/* Parting dark forest curtains revealing live Enchanted Mangrove behind */}
          {(unlockPhase === "gathering" || unlockPhase === "gateway") && (
            <>
              <div
                className={`pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-[#020d11] via-[#041b1e] to-[#062624]/95 ${
                  unlockPhase === "gateway" ? "anim-gate-left" : "opacity-92"
                }`}
              />
              <div
                className={`pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-[#020d11] via-[#041b1e] to-[#062624]/95 ${
                  unlockPhase === "gateway" ? "anim-gate-right" : "opacity-92"
                }`}
              />
            </>
          )}

          {/* Converging glowing lights */}
          {unlockPhase === "gathering" && (
            <div className="pointer-events-none relative flex items-center justify-center">
              {Array.from({ length: 16 }).map((_, i) => {
                const ang = (i / 16) * Math.PI * 2;
                const rad = 180 + (i % 3) * 55;
                const sx = `${Math.round(Math.cos(ang) * rad)}px`;
                const sy = `${Math.round(Math.sin(ang) * rad)}px`;
                return (
                  <span
                    key={i}
                    className="anim-light-gather absolute h-3.5 w-3.5 rounded-full"
                    style={
                      {
                        "--sx": sx,
                        "--sy": sy,
                        animationDelay: `${(i % 4) * 55}ms`,
                        background: i % 2 === 0 ? "#FFB85C" : "#43E6C1",
                        boxShadow:
                          i % 2 === 0
                            ? "0 0 18px 4px rgba(255,184,92,0.85)"
                            : "0 0 18px 4px rgba(67,230,193,0.85)",
                      } as React.CSSProperties
                    }
                  />
                );
              })}
              <div className="anim-unlock-seal flex h-20 w-20 items-center justify-center rounded-full border-2 border-amber/70 bg-amber/15 text-amber shadow-[0_0_45px_rgba(255,180,84,0.6)]">
                {I.lock("h-8 w-8")}
              </div>
            </div>
          )}

          {/* Expanding gateway portal ring */}
          {unlockPhase === "gateway" && (
            <div className="pointer-events-none relative flex items-center justify-center">
              <div className="anim-portal-ring h-48 w-48 rounded-full border-2 border-[#43E6C1]/85 shadow-[0_0_70px_rgba(67,230,193,0.75),inset_0_0_45px_rgba(255,184,92,0.4)]" />
            </div>
          )}

          {/* Revealed celebration banner */}
          {unlockPhase === "revealed" && (
            <div className="anim-modal-card relative mx-4 w-full max-w-md rounded-3xl border border-[#43E6C1]/50 bg-[#051a1b]/88 p-7 text-center shadow-[0_24px_80px_rgba(0,0,0,0.7)] backdrop-blur-md">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#43E6C1]/50 bg-[#43E6C1]/15 text-[#43E6C1] shadow-[0_0_28px_rgba(67,230,193,0.4)]">
                {I.leaf("h-7 w-7")}
              </div>
              <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.34em] text-[#43E6C1]">
                Gateway Opened
              </div>
              <h3 className="mt-1.5 font-display text-2xl font-black tracking-wide text-foam sm:text-3xl">
                ENCHANTED MANGROVE UNLOCKED
              </h3>
              <p className="mt-2.5 text-xs leading-relaxed text-foam/75">
                The midnight river awaits. Sail through ancient arching roots, fireflies, and glowing bioluminescent waters.
              </p>
              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="button"
                  onClick={() => startMode("mangrove")}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#43E6C1] to-[#1aa88a] py-3.5 text-xs font-bold uppercase tracking-[0.18em] text-[#031915] shadow-[0_6px_24px_rgba(67,230,193,0.35)] transition-all hover:brightness-105"
                >
                  {I.play("h-4 w-4")}
                  Enter Mangrove
                </button>
                <button
                  type="button"
                  onClick={() => setUnlockPhase("idle")}
                  className="btn-ghost flex-1 py-3.5 text-xs font-semibold tracking-wider"
                >
                  Mode Selection
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------- BOAT GARAGE MODAL ------------------------- */}
      {modal === "garage" && (
        <div
          className="anim-modal-backdrop fixed inset-0 z-30 overflow-y-auto bg-ink/80 px-4 py-6 backdrop-blur-md"
          onClick={closeGarage}
        >
          <div className="flex min-h-full items-center justify-center">
            <div
              className="glass-modal anim-modal-card relative w-full max-w-2xl overflow-hidden border-amber/25 bg-[#061820]/95 shadow-[0_28px_90px_rgba(0,0,0,0.86)]"
              onClick={(e) => e.stopPropagation()}
            >
              {boatLackToast > 0 && (
                <div
                  key={boatLackToast}
                  role="alert"
                  className="anim-popIn pointer-events-none absolute inset-x-0 bottom-20 z-30 flex justify-center px-4"
                >
                  <div className="inline-flex items-center gap-2.5 rounded-2xl border border-amber/65 bg-[#0a1d24]/95 px-4 py-2.5 text-xs font-bold tracking-wide text-amber shadow-[0_14px_40px_rgba(0,0,0,0.78)] backdrop-blur-md">
                    {I.flame("h-4 w-4 text-ember")}
                    <span>Need more Lights</span>
                    <span className="text-[11px] font-medium text-foam/70">
                      ({remainingBoatLights.toLocaleString("en-US")} needed)
                    </span>
                  </div>
                </div>
              )}
              {/* Full-bleed 3D Interactive Showcase Stage */}
              <div className="relative h-56 w-full bg-[#04141c] sm:h-64">
                <BoatPreview
                  level={garageBoat}
                  locked={!selectedBoatUnlocked}
                  className="h-full w-full"
                />
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(3,14,20,0.62)_100%)]" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber/35 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#061820] via-[#061820]/70 to-transparent" />

                {/* Floating Glass Top Bar */}
                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4 sm:p-5">
                  <div className="flex items-center gap-2.5 rounded-full border border-foam/15 bg-[#04161e]/80 px-3.5 py-1.5 backdrop-blur-md">
                    {I.boat("h-4 w-4 text-amber")}
                    <span className="font-display text-xs font-black tracking-[0.18em] text-foam">
                      BOAT GARAGE
                    </span>
                  </div>

                  <div className="pointer-events-auto flex items-center gap-2">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-amber/35 bg-[#04161e]/85 px-3 py-1.5 text-xs font-bold text-amber backdrop-blur-md">
                      {I.flame("h-3.5 w-3.5")}
                      <span>{lights.toLocaleString("en-US")}</span>
                    </div>
                    <button
                      onClick={closeGarage}
                      aria-label="Close"
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-[#04161e]/85 text-foam/70 backdrop-blur-md transition-colors hover:bg-white/15 hover:text-white"
                    >
                      {I.close("h-4 w-4")}
                    </button>
                  </div>
                </div>

                {/* Stage Title + 360° Hint */}
                <div className="pointer-events-none absolute inset-x-4 bottom-4 flex items-end justify-between sm:inset-x-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-xl font-black tracking-wide text-foam sm:text-2xl">
                        {selectedBoatSpec.name}
                      </h3>
                      {!selectedBoatUnlocked && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber/40 bg-[#121614]/85 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber">
                          {I.lock("h-2.5 w-2.5")}
                          Locked
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="rounded-full border border-white/12 bg-black/45 px-2.5 py-1 text-[10px] font-medium tracking-wide text-foam/70 backdrop-blur-xs">
                    Drag to rotate 360°
                  </span>
                </div>
              </div>

              <div className="relative z-10 p-5 pt-2 sm:p-6 sm:pt-3">
                {/* 3 Vessel Selector Cards */}
                <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                  {([1, 2, 3] as BoatLevel[]).map((lvl) => {
                    const spec = BOAT_SPECS[lvl];
                    const owned = unlockedBoats.includes(lvl);
                    const equipped = settings.boatLevel === lvl;
                    const active = garageBoat === lvl;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => {
                          audioRef.current?.click();
                          setConfirmBuyBoat(null);
                          window.clearTimeout(boatLackTimer.current);
                          setBoatLackToast(0);
                          setGarageBoat(lvl);
                        }}
                        className={`group relative flex flex-col justify-between rounded-2xl border p-3 text-left transition-all duration-200 sm:p-3.5 ${
                          active
                            ? "border-amber/80 bg-gradient-to-b from-amber/16 to-amber/[0.05] shadow-[0_8px_28px_rgba(255,180,84,0.16)]"
                            : "border-foam/12 bg-ink/55 hover:border-foam/30 hover:bg-ink/75"
                        }`}
                      >
                        <div className="flex w-full items-center justify-between">
                          {/* Tier Pips */}
                          <span className="flex items-center gap-1" aria-hidden="true">
                            {[1, 2, 3].map((dot) => (
                              <span
                                key={dot}
                                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                                  dot <= lvl
                                    ? active
                                      ? "bg-amber shadow-[0_0_6px_#ffb454]"
                                      : "bg-foam/65"
                                    : "bg-foam/15"
                                }`}
                              />
                            ))}
                          </span>

                          {equipped ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/18 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              Active
                            </span>
                          ) : owned ? (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-[#43E6C1]">
                              Owned
                            </span>
                          ) : (
                            <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber">
                              {I.flame("h-2.5 w-2.5")}
                              {spec.cost.toLocaleString("en-US")}
                            </span>
                          )}
                        </div>

                        <div className="mt-2 font-display text-xs font-bold leading-tight text-foam sm:text-sm">
                          {spec.name}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Visual Performance Bars (No .x numeric clutter) */}
                <div className="mt-4 grid grid-cols-1 gap-3.5 rounded-2xl border border-foam/12 bg-[#04141b]/80 p-4 sm:grid-cols-2 sm:gap-5">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#43E6C1]">
                        HP
                      </span>
                    </div>
                    <div className="relative h-3 w-full overflow-hidden rounded-full border border-foam/10 bg-foam/[0.06]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#1aa88a] via-[#2cd0ad] to-[#43E6C1] shadow-[0_0_14px_rgba(67,230,193,0.45)] transition-all duration-500 ease-out"
                        style={{ width: `${(selectedBoatSpec.hpMult / 2.0) * 100}%` }}
                      />
                      <div className="pointer-events-none absolute inset-0 grid grid-cols-5">
                        <span className="border-r border-[#04141b]/55" />
                        <span className="border-r border-[#04141b]/55" />
                        <span className="border-r border-[#04141b]/55" />
                        <span className="border-r border-[#04141b]/55" />
                        <span />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber">
                        Speed
                      </span>
                    </div>
                    <div className="relative h-3 w-full overflow-hidden rounded-full border border-foam/10 bg-foam/[0.06]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-ember via-[#ff9848] to-amber shadow-[0_0_14px_rgba(255,180,84,0.45)] transition-all duration-500 ease-out"
                        style={{ width: `${(selectedBoatSpec.speedMult / 1.8) * 100}%` }}
                      />
                      <div className="pointer-events-none absolute inset-0 grid grid-cols-5">
                        <span className="border-r border-[#04141b]/55" />
                        <span className="border-r border-[#04141b]/55" />
                        <span className="border-r border-[#04141b]/55" />
                        <span className="border-r border-[#04141b]/55" />
                        <span />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Purchase / Equip Controls */}
                <div className="mt-4">
                  {selectedBoatUnlocked ? (
                    selectedBoatEquipped ? (
                      <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/45 bg-emerald-400/12 py-3.5 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                        Equipped
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => equipBoat(garageBoat)}
                        className="btn-primary flex w-full items-center justify-center gap-2 py-3.5 text-xs font-bold uppercase tracking-[0.2em]"
                      >
                        Equip {selectedBoatSpec.name}
                      </button>
                    )
                  ) : confirmBuyBoat === garageBoat ? (
                    <div className="rounded-2xl border border-[#43E6C1]/35 bg-[#43E6C1]/[0.07] p-4">
                      <p className="mb-3 text-center text-xs font-medium text-foam/85">
                        Unlock <span className="font-bold text-foam">{selectedBoatSpec.name}</span> for{" "}
                        <span className="font-bold text-amber">
                          {selectedBoatSpec.cost.toLocaleString("en-US")} Lights
                        </span>
                        ?
                      </p>
                      <div className="flex gap-2.5">
                        <button
                          type="button"
                          onClick={() => confirmUnlockBoat(garageBoat)}
                          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#43E6C1] to-[#1aa88a] py-3 text-xs font-bold uppercase tracking-[0.16em] text-[#031915] shadow-[0_6px_24px_rgba(67,230,193,0.35)] transition-all hover:brightness-105"
                        >
                          {I.flame("h-4 w-4")}
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmBuyBoat(null)}
                          className="btn-ghost flex-1 py-3 text-xs font-semibold tracking-wider"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (canAffordSelectedBoat) setConfirmBuyBoat(garageBoat);
                        else triggerNeedMoreLights();
                      }}
                      className={
                        canAffordSelectedBoat
                          ? "flex w-full items-center justify-center gap-2 rounded-xl border border-[#43E6C1]/65 bg-gradient-to-b from-[#43E6C1] to-[#1aa88a] py-3.5 text-xs font-bold uppercase tracking-[0.18em] text-[#031915] shadow-[0_6px_24px_rgba(67,230,193,0.3)] transition-all hover:brightness-105"
                          : "flex w-full items-center justify-center gap-2 rounded-xl border border-amber/35 bg-amber/10 py-3.5 text-xs font-bold uppercase tracking-[0.18em] text-amber transition-all hover:border-amber/60 hover:bg-amber/18"
                      }
                    >
                      {I.flame("h-4 w-4")}
                      Unlock
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------- HIGH SCORES MODAL ------------------------- */}
      {modal === "scores" && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-ink/65 px-4 backdrop-blur-xs"
          onClick={() => setModal("none")}
        >
          <div
            className="panel anim-popIn w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-sm font-bold tracking-[0.24em] text-amber">
                {I.trophy("h-4 w-4")} BEST VOYAGES
              </h2>
              <button
                onClick={() => setModal("none")}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-foam/60 hover:bg-foam/10 hover:text-foam"
              >
                {I.close("h-4 w-4")}
              </button>
            </div>
            <div className="mt-4">
              <ScoreList scores={scores} highlightRank={newRank} limit={8} />
            </div>
            <button
              onClick={() => setModal("none")}
              className="btn-ghost mt-5 w-full py-2.5 text-xs font-semibold uppercase tracking-[0.2em]"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ------------------------- SETTINGS MODAL ------------------------- */}
      {modal === "settings" && (
        <div
          className="anim-modal-backdrop absolute inset-0 z-30 overflow-y-auto bg-black/75 px-4 py-6 backdrop-blur-sm"
          onClick={() => {
            setModal("none");
            setConfirmClear(false);
          }}
        >
          <div className="flex min-h-full items-center justify-center">
            <div
              className="anim-modal-card w-full max-w-[430px] rounded-3xl border border-[#1b2b33] bg-[#0d171d]/95 p-6 shadow-2xl sm:p-7 backdrop-blur-md"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber/40 bg-amber/10 text-amber shadow-[0_0_12px_rgba(255,180,84,0.2)]">
                    {I.gear("h-5 w-5")}
                  </div>
                  <h2 className="text-lg font-bold tracking-tight text-white">
                    Settings
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setModal("none");
                    setConfirmClear(false);
                  }}
                  aria-label="Close settings"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-foam/60 transition-all hover:bg-white/10 hover:text-white"
                >
                  {I.close("h-4 w-4")}
                </button>
              </div>

              <div className="space-y-4">
                {/* 1. Difficulty */}
                <div>
                  <div className="mb-2.5 flex items-center gap-2 text-sm font-bold text-white">
                    {I.flag("h-4 w-4 text-amber")}
                    <span>Difficulty</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      {
                        id: "calm" as Difficulty,
                        label: "Calm",
                        wave: (
                          <path
                            d="M 4 12 C 16 7, 24 15, 38 10 C 48 7, 52 12, 56 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                          />
                        ),
                      },
                      {
                        id: "standard" as Difficulty,
                        label: "Standard",
                        wave: (
                          <path
                            d="M 4 12 C 10 5, 15 5, 21 12 C 27 19, 32 19, 38 12 C 44 5, 49 5, 56 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ),
                      },
                      {
                        id: "tempest" as Difficulty,
                        label: "Tempest",
                        wave: (
                          <path
                            d="M 4 13 C 8 13, 11 5, 15 5 C 19 16, 22 16, 26 8 C 30 1, 33 18, 38 18 C 42 4, 46 14, 50 14 C 53 14, 54 8, 56 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ),
                      },
                    ].map((d) => {
                      const active = settings.difficulty === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => updateSettings({ difficulty: d.id })}
                          className={`group relative flex flex-col items-center justify-center rounded-2xl py-4 px-2 transition-all duration-200 ${
                            active
                              ? "border border-amber/80 bg-[#122026] text-amber shadow-[0_0_16px_rgba(255,180,84,0.18)]"
                              : "border border-[#1b2b33] bg-[#0c161c] text-foam/60 hover:border-foam/25 hover:text-foam"
                          }`}
                        >
                          <svg viewBox="0 0 60 22" className="h-5 w-12 stroke-current mb-2.5">
                            {d.wave}
                          </svg>
                          <span
                            className={`text-sm tracking-wide ${
                              active ? "font-bold text-amber" : "font-semibold text-foam/80"
                            }`}
                          >
                            {d.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Audio Volume Slider */}
                <div className="flex items-center gap-3.5 py-1">
                  <button
                    type="button"
                    onClick={() => updateSettings({ muted: !settings.muted })}
                    aria-label={settings.muted ? "Unmute" : "Mute"}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-500/30 bg-teal-950/30 text-teal-300 transition-colors hover:border-teal-400 hover:text-teal-200"
                  >
                    {settings.muted ? I.soundOff("h-4 w-4 text-ember") : I.soundOn("h-4 w-4 text-teal-300")}
                  </button>
                  <div className="relative flex flex-1 items-center">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={settings.muted ? 0 : Math.round(settings.volume * 100)}
                      onChange={(e) => {
                        const v = Number(e.target.value) / 100;
                        updateSettings({ volume: v, muted: v === 0 });
                      }}
                      className="custom-slider w-full"
                      style={{
                        background: `linear-gradient(to right, #f5a75b ${settings.muted ? 0 : Math.round(settings.volume * 100)}%, rgba(255,255,255,0.08) ${settings.muted ? 0 : Math.round(settings.volume * 100)}%)`,
                      }}
                    />
                  </div>
                  <span className="w-10 text-right text-sm font-bold text-white shrink-0">
                    {settings.muted ? "0%" : `${Math.round(settings.volume * 100)}%`}
                  </span>
                </div>

                {/* 3. Graphics Quality */}
                <div>
                  <div className="mb-2.5 flex items-center gap-2 text-sm font-bold text-white">
                    {I.monitor("h-4 w-4 text-amber/80")}
                    <span>Graphics</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 rounded-xl border border-[#1b2b33] bg-[#0c161c] p-1">
                    {(["auto", "high", "medium", "low"] as QualitySetting[]).map((q) => {
                      const active = settings.quality === q;
                      const label = q.charAt(0).toUpperCase() + q.slice(1);
                      return (
                        <button
                          key={q}
                          type="button"
                          onClick={() => updateSettings({ quality: q })}
                          className={`rounded-lg py-2 text-xs transition-all duration-150 ${
                            active
                              ? "bg-[#f5a75b] font-bold text-[#121c22] shadow-[0_0_12px_rgba(245,167,91,0.35)]"
                              : "font-medium text-foam/60 hover:text-foam"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Sun Glare */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    {I.sun("h-4 w-4 text-foam/65")}
                    <span>Sun glare</span>
                  </div>
                  <div className="flex rounded-xl border border-[#1b2b33] bg-[#0c161c] p-1">
                    {(["soft", "minimal"] as const).map((v) => {
                      const active = settings.sunGlare === v;
                      const label = v.charAt(0).toUpperCase() + v.slice(1);
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => updateSettings({ sunGlare: v })}
                          className={`rounded-lg px-4 py-1.5 text-xs transition-all duration-150 ${
                            active
                              ? "bg-[#f5a75b] font-bold text-[#121c22] shadow-[0_0_12px_rgba(245,167,91,0.35)]"
                              : "font-medium text-foam/60 hover:text-foam"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 5. Screen Shake */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    {I.shake("h-4 w-4 text-foam/65")}
                    <span>Screen shake</span>
                  </div>
                  <div className="flex rounded-xl border border-[#1b2b33] bg-[#0c161c] p-1">
                    {(["on", "off"] as const).map((v) => {
                      const active = (settings.screenShake ? "on" : "off") === v;
                      const label = v.charAt(0).toUpperCase() + v.slice(1);
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => updateSettings({ screenShake: v === "on" })}
                          className={`rounded-lg px-4 py-1.5 text-xs transition-all duration-150 ${
                            active
                              ? "bg-[#f5a75b] font-bold text-[#121c22] shadow-[0_0_12px_rgba(245,167,91,0.35)]"
                              : "font-medium text-foam/60 hover:text-foam"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Touch steering if on touch devices */}
                {IS_TOUCH && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <span>Touch steering</span>
                    </div>
                    <div className="flex rounded-xl border border-[#1b2b33] bg-[#0c161c] p-1">
                      {([
                        { id: "drag" as TouchControl, label: "Slide" },
                        { id: "follow" as TouchControl, label: "Follow" },
                        { id: "tilt" as TouchControl, label: "Tilt" },
                      ]).map((t) => {
                        const active = settings.touchControl === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => void chooseSteering(t.id)}
                            className={`rounded-lg px-3 py-1.5 text-xs transition-all duration-150 ${
                              active
                                ? "bg-[#f5a75b] font-bold text-[#121c22] shadow-[0_0_12px_rgba(245,167,91,0.35)]"
                                : "font-medium text-foam/60 hover:text-foam"
                            }`}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 6. Android App Download */}
                {!IS_NATIVE && (
                  <div className="flex items-center justify-between rounded-2xl border border-teal-500/30 bg-[#0c1c1f]/80 px-4 py-3.5">
                    <div className="flex items-center gap-2.5 text-sm font-bold text-white">
                      {I.phone("h-4 w-4 text-teal-400")}
                      <span>Android app</span>
                    </div>
                    <a
                      href={APK_DOWNLOAD_URL}
                      download="SeaDrift.apk"
                      className="flex items-center gap-1.5 rounded-xl border border-teal-500/40 bg-teal-950/60 px-3.5 py-1.5 text-xs font-bold text-teal-300 transition-all hover:border-teal-400 hover:bg-teal-900/60 active:scale-[0.98]"
                    >
                      {I.download("h-3.5 w-3.5 text-teal-300")}
                      <span>Get APK</span>
                    </a>
                  </div>
                )}

                {/* 7. Clear High Scores */}
                {scores.length > 0 && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirmClear) {
                          setConfirmClear(true);
                          return;
                        }
                        setScores(clearScores());
                        setConfirmClear(false);
                      }}
                      className={`w-full rounded-xl border py-2.5 text-xs font-medium transition-colors ${
                        confirmClear
                          ? "border-[#ff7a5c]/80 bg-[#ff7a5c]/20 text-[#ffb5a0] shadow-[0_0_14px_rgba(255,90,50,0.3)]"
                          : "border-[#1b2b33] text-foam/60 hover:border-foam/25 hover:text-foam"
                      }`}
                    >
                      {confirmClear ? "Tap again to confirm clearing high scores" : "Clear high scores"}
                    </button>
                  </div>
                )}
              </div>

              {/* Done button */}
              <button
                onClick={() => {
                  setModal("none");
                  setConfirmClear(false);
                }}
                className="mt-5 w-full rounded-2xl bg-[#f5a75b] py-3.5 text-sm font-bold text-[#121c22] shadow-[0_0_20px_rgba(245,167,91,0.35)] transition-all hover:brightness-105 active:scale-[0.99]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
