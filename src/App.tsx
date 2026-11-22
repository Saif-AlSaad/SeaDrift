import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { COMBO_WINDOW, GameEngine } from "./game/engine";
import type { AlertData, GameState, PopupData, RunStats } from "./game/engine";
import { GameAudio } from "./game/audio";
import {
  addScore,
  clearScores,
  formatDate,
  loadScores,
  loadSettings,
  saveSettings,
  type Difficulty,
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
};

const IS_NATIVE = typeof window !== "undefined" && Capacitor.isNativePlatform();
const APK_DOWNLOAD_URL = "https://github.com/Saif-AlSaad/SeaDrift/releases/latest/download/SeaDrift.apk";

const IS_TOUCH =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window);
const CAN_FULLSCREEN = typeof document !== "undefined" && !!document.fullscreenEnabled;
const CAN_VIBRATE = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
const SAFE_TL = {
  top: "max(1rem, env(safe-area-inset-top))",
  left: "max(1rem, env(safe-area-inset-left))",
} as const;
const SAFE_TR = {
  top: "max(1rem, env(safe-area-inset-top))",
  right: "max(1rem, env(safe-area-inset-right))",
} as const;
const STEER_INFO: Record<TouchControl, string> = {
  drag: "Slide anywhere — the boat moves with your thumb, never under it.",
  follow: "The boat steers toward the spot you touch.",
  tilt: "Tilt your phone left and right. Re-centres at the start of each voyage.",
};

const DIFF_INFO: Record<Difficulty, { label: string; desc: string }> = {
  calm: { label: "Calm", desc: "Gentler lamp drain and wider gaps between hazards." },
  standard: { label: "Standard", desc: "Scarce wisps, active steering, full sea hazards." },
  tempest: { label: "Tempest", desc: "Fierce drain, narrow margins, relentless squalls." },
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

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg border border-foam/12 bg-ink/60 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all ${
              active
                ? "bg-amber text-[#241005] shadow-sm"
                : "text-foam/65 hover:bg-foam/[0.06] hover:text-foam"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------- App --------------------------------- */

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const audioRef = useRef<GameAudio | null>(null);

  const [state, setState] = useState<GameState>("menu");
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());
  const [final, setFinal] = useState<RunStats | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [newRank, setNewRank] = useState(-1);
  const [popups, setPopups] = useState<Array<PopupData & { id: number }>>([]);
  const [alert, setAlert] = useState<(AlertData & { id: number }) | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [modal, setModal] = useState<"none" | "settings" | "scores">("none");
  const [confirmClear, setConfirmClear] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const histArmed = useRef(false);

  const scoreEl = useRef<HTMLSpanElement>(null);
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
  const lastDist = useRef(-1);
  const lastCombo = useRef(0);
  const popupId = useRef(0);
  const alertTimer = useRef(0);

  const stateRef = useRef<GameState>("menu");
  stateRef.current = state;
  const modalRef = useRef(modal);
  modalRef.current = modal;

  useEffect(() => {
    engineRef.current?.setModalOpen(modal !== "none");
  }, [modal]);

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
        if (distEl.current && h.dist !== lastDist.current) {
          lastDist.current = h.dist;
          distEl.current.textContent = `${h.dist.toLocaleString("en-US")} m`;
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
        const entry: ScoreEntry = {
          s: stats.score,
          w: stats.wisps,
          d: stats.dist,
          c: stats.maxCombo,
          m: stats.difficulty,
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
      if (modalRef.current !== "none") {
        if (e.code === "Escape") {
          e.preventDefault();
          setModal("none");
          setConfirmClear(false);
        }
        return;
      }
      if (
        (e.code === "Space" || e.code === "Enter") &&
        (stateRef.current === "menu" || stateRef.current === "gameover")
      ) {
        e.preventDefault();
        audioRef.current?.ensure();
        audioRef.current?.startAmbient();
        if (!histArmed.current) {
          history.pushState({ drift: 1 }, "");
          histArmed.current = true;
        }
        engine.startRun();
      }
    };
    window.addEventListener("keydown", onKey);

    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);

    // Android back button / gesture: pause instead of leaving the game
    const onPop = () => {
      histArmed.current = false;
      const rearm = () => {
        history.pushState({ drift: 1 }, "");
        histArmed.current = true;
      };
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
      } else if (st === "paused" || st === "gameover") {
        engine.toMenu();
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
  const start = () => {
    blurActive();
    setModal("none");
    armHistory();
    if (IS_TOUCH && settings.autoFullscreen) enterFullscreen();
    audioRef.current?.ensure();
    audioRef.current?.startAmbient();
    audioRef.current?.click();
    engineRef.current?.startRun();
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
  const toMenu = () => {
    blurActive();
    setModal("none");
    audioRef.current?.click();
    engineRef.current?.toMenu();
  };
  const toggleMute = () => {
    blurActive();
    updateSettings({ muted: !settings.muted });
  };
  const openModal = (m: "settings" | "scores") => {
    blurActive();
    audioRef.current?.click();
    setConfirmClear(false);
    setModal(m);
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
                    : "border-lumen/50 bg-[#05201f]/85 text-[#9ff3e2] shadow-[0_0_30px_rgba(63,217,192,0.25)]"
                }`}
              >
                {alert.tone === "warn" && (
                  <span className="warn-blink">{I.warn("h-4 w-4")}</span>
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

      {/* ------------------------- START (clean & airy) ------------------------- */}
      {state === "menu" && (
        <div className="absolute inset-0 overflow-y-auto">
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

          <div className="flex min-h-full flex-col items-center justify-between px-4 pb-6 pt-20 md:py-10">
            <div />

            {/* hero */}
            <div className="anim-fadeUp flex flex-col items-center text-center">
              <div className="mb-3 flex items-center justify-center gap-2 text-[10px] font-semibold tracking-[0.36em] text-foam/70">
                {I.boat("h-4 w-4 shrink-0 text-amber")}
                DUSK SEA VOYAGE
                {I.boat("h-4 w-4 shrink-0 -scale-x-100 text-amber")}
              </div>
              <h1 className="title-glow font-display text-7xl font-black tracking-tight text-foam md:text-8xl">
                DRIFT
              </h1>
              <WaveLine />
              <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed text-foam/80 [text-shadow:0_1px_12px_rgba(0,0,0,0.65)]">
                Gather wisps to keep your lamp burning. Outlast the sea.
              </p>

              <div className="mt-7 flex flex-col items-center gap-3">
                <button
                  onClick={start}
                  className="btn-primary flex items-center gap-3 px-11 py-4 text-base font-bold tracking-[0.18em]"
                >
                  {I.play("h-5 w-5")}
                  SET SAIL
                </button>

                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={() => openModal("settings")}
                    className="inline-flex items-center gap-1.5 rounded-full border border-foam/18 bg-[#05141a]/65 px-3.5 py-1 text-xs font-medium text-foam/80 transition-colors hover:border-foam/35 hover:text-foam"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-lumen" />
                    {DIFF_INFO[settings.difficulty].label} mode
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
                  {!IS_NATIVE && (
                    <a
                      href={APK_DOWNLOAD_URL}
                      download="SeaDrift.apk"
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-950/45 px-3.5 py-1 text-xs font-semibold text-emerald-300 transition-all hover:border-emerald-400 hover:bg-emerald-900/60"
                      title="Download Android APK for 100% offline play"
                    >
                      {I.download("h-3.5 w-3.5")}
                      <span>Android APK</span>
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                        Offline
                      </span>
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* unobtrusive control hint */}
            <div className="anim-fadeUp mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 rounded-full border border-foam/12 bg-[#05141a]/60 px-5 py-2 text-xs text-foam/65 backdrop-blur-sm">
              {IS_TOUCH ? (
                <>
                  <span>
                    {settings.touchControl === "tilt"
                      ? "Tilt your phone to steer"
                      : settings.touchControl === "follow"
                        ? "Touch where you want to sail"
                        : "Slide your thumb anywhere to steer"}
                  </span>
                  <span className="text-foam/25">·</span>
                  <span>tap ❚❚ to pause</span>
                </>
              ) : (
                <>
                  <span>
                    <kbd>◀</kbd> <kbd>▶</kbd> / <kbd>A</kbd> <kbd>D</kbd> or drag to steer
                  </span>
                  <span className="hidden text-foam/25 sm:inline">·</span>
                  <span>
                    <kbd>P</kbd> pause
                  </span>
                  <span className="hidden text-foam/25 sm:inline">·</span>
                  <span>
                    <kbd>R</kbd> restart
                  </span>
                </>
              )}
            </div>
          </div>
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
                onClick={toMenu}
                className="btn-ghost px-6 py-3 text-sm font-semibold tracking-wide"
              >
                Return to harbor
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* ------------------------- GAME OVER ------------------------- */}
      {state === "gameover" && final && (
        <div className="absolute inset-0 overflow-y-auto bg-ink/50">
          <div className="flex min-h-full items-center justify-center px-4 py-8">
            <div className="panel anim-popIn relative w-full max-w-md p-7 text-center md:p-8">
              {newBest && (
                <div className="stamp pointer-events-none absolute -top-4 right-5 rounded-md border-2 border-amber bg-ink2 px-3 py-1 font-display text-xs font-black tracking-[0.2em] text-amber shadow-[0_0_24px_rgba(255,180,84,0.5)]">
                  NEW BEST
                </div>
              )}
              <h2 className="font-display text-3xl font-bold tracking-wide text-foam md:text-4xl">
                THE LAMP GOES OUT
              </h2>
              <p className="mt-2 text-sm italic text-foam/60">
                {final.score >= 5000
                  ? "the horizon glows where you passed"
                  : final.score >= 2500
                    ? "the dusk will remember your wake"
                    : final.score >= 1000
                      ? "every light finds its way back to the sea"
                      : "even short voyages leave a shimmer"}
              </p>

              <div className="mt-6">
                <div className="text-[10px] font-semibold tracking-[0.34em] text-foam/55">
                  VOYAGE SCORE · {DIFF_INFO[final.difficulty].label.toUpperCase()}
                </div>
                <div className="mt-1 font-display text-5xl font-black text-amber [text-shadow:0_0_30px_rgba(255,180,84,0.45)]">
                  {final.score.toLocaleString("en-US")}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {[
                  ["WISPS", `${final.wisps}`],
                  ["DISTANCE", `${final.dist}m`],
                  ["BEST COMBO", `×${final.maxCombo}`],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-foam/10 bg-foam/[0.04] px-2 py-2.5"
                  >
                    <div className="font-display text-lg font-bold text-foam">{value}</div>
                    <div className="mt-0.5 text-[9px] font-semibold tracking-[0.2em] text-foam/50">
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 text-left">
                <h3 className="font-display text-[11px] font-bold tracking-[0.28em] text-lumen">
                  BEST VOYAGES
                </h3>
                <div className="mt-2.5">
                  <ScoreList scores={scores} highlightRank={newRank} />
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
                <button
                  onClick={restart}
                  className="btn-primary flex flex-1 items-center justify-center gap-2 px-6 py-3.5 text-sm font-bold tracking-[0.15em]"
                >
                  {I.play("h-4 w-4")} SAIL AGAIN
                </button>
                <button
                  onClick={toMenu}
                  className="btn-ghost flex-1 px-6 py-3.5 text-sm font-semibold tracking-wide"
                >
                  Harbor
                </button>
              </div>
              <p className="mt-3 text-[11px] text-foam/45">
                {IS_TOUCH ? (
                  "tap Sail Again to set out once more"
                ) : (
                  <>
                    press <kbd>R</kbd> or <kbd>SPACE</kbd> to sail again
                  </>
                )}
              </p>
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
              <ScoreList scores={scores} limit={8} />
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
          className="absolute inset-0 z-20 overflow-y-auto bg-ink/65 px-4 py-6 backdrop-blur-xs"
          onClick={() => {
            setModal("none");
            setConfirmClear(false);
          }}
        >
          <div className="flex min-h-full items-center justify-center">
            <div
              className="panel anim-popIn w-full max-w-md p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-display text-sm font-bold tracking-[0.24em] text-lumen">
                  {I.gear("h-4 w-4")} SETTINGS
                </h2>
                <button
                  onClick={() => {
                    setModal("none");
                    setConfirmClear(false);
                  }}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-foam/60 hover:bg-foam/10 hover:text-foam"
                >
                  {I.close("h-4 w-4")}
                </button>
              </div>

              <div className="mt-5 space-y-5">
                {/* Difficulty */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-foam/75">
                      Difficulty
                    </span>
                    {state === "paused" && (
                      <span className="text-[11px] text-amber/80">Applies immediately</span>
                    )}
                  </div>
                  <Segmented<Difficulty>
                    value={settings.difficulty}
                    onChange={(difficulty) => updateSettings({ difficulty })}
                    options={[
                      { value: "calm", label: "Calm" },
                      { value: "standard", label: "Standard" },
                      { value: "tempest", label: "Tempest" },
                    ]}
                  />
                  <p className="mt-1.5 text-xs text-foam/50">
                    {DIFF_INFO[settings.difficulty].desc}
                  </p>
                </div>

                {/* Volume & Mute */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-foam/75">
                      Sound Volume
                    </span>
                    <button
                      type="button"
                      onClick={() => updateSettings({ muted: !settings.muted })}
                      className="text-xs font-semibold text-amber hover:underline"
                    >
                      {settings.muted
                        ? "Muted (Unmute)"
                        : `${Math.round(settings.volume * 100)}% · Mute`}
                    </button>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={settings.muted ? 0 : Math.round(settings.volume * 100)}
                    onChange={(e) => {
                      const v = Number(e.target.value) / 100;
                      updateSettings({ volume: v, muted: v === 0 });
                    }}
                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-foam/15 accent-amber"
                  />
                </div>

                {/* Graphics Quality */}
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-foam/75">
                    Graphics Quality
                  </div>
                  <Segmented<QualitySetting>
                    value={settings.quality}
                    onChange={(quality) => updateSettings({ quality })}
                    options={[
                      { value: "auto", label: "Auto" },
                      { value: "high", label: "High" },
                      { value: "medium", label: "Medium" },
                      { value: "low", label: "Low" },
                    ]}
                  />
                </div>

                {/* Sun Glare & Screen Shake */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-foam/75">
                      Sun Glare
                    </div>
                    <Segmented<"soft" | "minimal">
                      value={settings.sunGlare}
                      onChange={(sunGlare) => updateSettings({ sunGlare })}
                      options={[
                        { value: "soft", label: "Soft" },
                        { value: "minimal", label: "Minimal" },
                      ]}
                    />
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-foam/75">
                      Screen Shake
                    </div>
                    <Segmented<"on" | "off">
                      value={settings.screenShake ? "on" : "off"}
                      onChange={(v) => updateSettings({ screenShake: v === "on" })}
                      options={[
                        { value: "on", label: "On" },
                        { value: "off", label: "Off" },
                      ]}
                    />
                  </div>
                </div>

                {IS_TOUCH && (
                  <div className="space-y-3 border-t border-foam/10 pt-4">
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-foam/75">
                        Touch Steering
                      </div>
                      <Segmented<TouchControl>
                        value={settings.touchControl}
                        onChange={(m) => void chooseSteering(m)}
                        options={[
                          { value: "drag", label: "Slide" },
                          { value: "follow", label: "Follow" },
                          { value: "tilt", label: "Tilt" },
                        ]}
                      />
                      <p className="mt-1.5 text-xs text-foam/50">{STEER_INFO[settings.touchControl]}</p>
                    </div>
                    {(CAN_VIBRATE || CAN_FULLSCREEN) && (
                      <div className="grid grid-cols-2 gap-3">
                        {CAN_VIBRATE && (
                          <div>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-foam/75">
                              Vibration
                            </div>
                            <Segmented<"on" | "off">
                              value={settings.haptics ? "on" : "off"}
                              onChange={(v) => updateSettings({ haptics: v === "on" })}
                              options={[
                                { value: "on", label: "On" },
                                { value: "off", label: "Off" },
                              ]}
                            />
                          </div>
                        )}
                        {CAN_FULLSCREEN && (
                          <div>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-foam/75">
                              Auto Fullscreen
                            </div>
                            <Segmented<"on" | "off">
                              value={settings.autoFullscreen ? "on" : "off"}
                              onChange={(v) => updateSettings({ autoFullscreen: v === "on" })}
                              options={[
                                { value: "on", label: "On" },
                                { value: "off", label: "Off" },
                              ]}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Mobile & Native App */}
                {!IS_NATIVE && (
                  <div className="border-t border-foam/10 pt-4">
                    <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/30 p-3.5 shadow-xs">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 pr-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-[0.16em] text-foam">
                              Android APK Package
                            </span>
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                              Offline Ready
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-foam/60">
                            Direct standalone Android app with native 60 FPS performance and 100% offline play.
                          </p>
                        </div>
                        <a
                          href={APK_DOWNLOAD_URL}
                          download="SeaDrift.apk"
                          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/70 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-emerald-300 transition-all hover:border-emerald-400 hover:bg-emerald-900/80"
                        >
                          {I.download("h-3.5 w-3.5 text-emerald-400")}
                          Download APK
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* Clear local scores */}
                {scores.length > 0 && (
                  <div className="border-t border-foam/10 pt-4">
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
                      className={`w-full rounded-lg border py-2 text-xs font-semibold transition-colors ${
                        confirmClear
                          ? "border-[#ff7a5c]/70 bg-[#ff7a5c]/15 text-[#ffb09a]"
                          : "border-foam/15 text-foam/55 hover:border-foam/30 hover:text-foam/80"
                      }`}
                    >
                      {confirmClear ? "Tap again to clear all saved scores" : "Clear High Scores"}
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  setModal("none");
                  setConfirmClear(false);
                }}
                className="btn-primary mt-6 w-full py-3 text-xs font-bold uppercase tracking-[0.2em]"
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
