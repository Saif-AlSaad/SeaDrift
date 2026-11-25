/* DRIFT — 3D engine v3.
   Realistic dusk sea: fresnel water, soft-glare sunset sky, HDR bloom,
   swimming fish schools, plus rocks, sea mines, driftwood, rogue waves,
   whirlpools and storm squalls with lightning. */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { GameAudio } from "./audio";
import type { Difficulty, EnvironmentMode, GameSettings } from "./storage";
import {
  makeDetailedWoodTexture,
  makeDeckTexture,
  makeDetailedClothTexture,
  makeFishScaleTexture,
  makeTunaGeometry,
  makeDoradoGeometry,
  makeFlyingFishGeometry,
  makeSnapperGeometry,
  makeIslandGeometry,
  makePineTreeGeometry,
  islandTreeSpots,
  ISLAND_VERT,
  ISLAND_FRAG,
  makeLighthouseGroup,
  makeShipwreckGroup,
  makeBellBuoyGroup,
} from "./scenery";

export type GameState = "menu" | "playing" | "paused" | "gameover";

export interface HudData {
  score: number;
  combo: number;
  comboT: number;
  energy: number;
  dist: number;
  biome: string;
}

export interface RunStats {
  score: number;
  wisps: number;
  dist: number;
  maxCombo: number;
  difficulty: Difficulty;
  environment: EnvironmentMode;
}

export interface PopupData {
  x: number; // percent of viewport
  y: number;
  text: string;
  tone: "amber" | "teal" | "gold" | "danger";
}

export interface AlertData {
  text: string;
  tone: "warn" | "calm" | "milestone";
}

export interface EngineCallbacks {
  onHud: (h: HudData) => void;
  onState: (s: GameState) => void;
  onGameOver: (s: RunStats) => void;
  onPopup: (p: PopupData) => void;
  onFlash: (kind: "hit" | "jelly" | "bolt") => void;
  onAlert: (a: AlertData) => void;
}

export const COMBO_WINDOW = 3.0;

const STEER_RANGE = 15;
const MAX_PARTICLES = 900;
const MAX_RINGS = 30;
const SAIL_N = 8;
const STRIKE_R = 4.2;
const BOLT_SEG = 16;
const WHIRL_DEPTH = 1.9;
const WHIRL_K = 0.16;
const FISH_SCHOOLS = 4;
const FISH_PER_SCHOOL = 6;
const FISH_TOTAL = FISH_SCHOOLS * FISH_PER_SCHOOL;

const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;
const lerp = THREE.MathUtils.lerp;
const smooth = THREE.MathUtils.smoothstep;

interface DiffTune {
  baseSpeed: number;
  maxExtraSpeed: number;
  baseDrain: number;
  extraDrain: number;
  stormDrain: number;
  amberFuel: number;
  tealFuel: number;
  wispGapBase: number;
  wispGapExtra: number;
  wispClusterMin: number;
  wispClusterMax: number;
  magnetPull: number;
  magnetRange: number;
  catchReach: number;
  rockPaceStart: number;
  rockPaceEnd: number;
  mineUnlock: number;
  minePaceStart: number;
  minePaceEnd: number;
  logUnlock: number;
  waveUnlock: number;
  whirlUnlock: number;
  stormStart: number;
  scoreMultiplier: number;
}

const DIFF_TUNING: Record<Difficulty, DiffTune> = {
  calm: {
    baseSpeed: 16.5,
    maxExtraSpeed: 11.0,
    baseDrain: 2.8,
    extraDrain: 2.0,
    stormDrain: 0.5,
    amberFuel: 5.5,
    tealFuel: 9.0,
    wispGapBase: 32,
    wispGapExtra: 10,
    wispClusterMin: 2,
    wispClusterMax: 4,
    magnetPull: 2.4,
    magnetRange: 3.4,
    catchReach: 2.4,
    rockPaceStart: 2.8,
    rockPaceEnd: 1.5,
    mineUnlock: 24,
    minePaceStart: 9.0,
    minePaceEnd: 5.5,
    logUnlock: 30,
    waveUnlock: 38,
    whirlUnlock: 48,
    stormStart: 56,
    scoreMultiplier: 1.0,
  },
  standard: {
    baseSpeed: 18.2,
    maxExtraSpeed: 14.0,
    baseDrain: 3.8,
    extraDrain: 2.8,
    stormDrain: 0.8,
    amberFuel: 4.2,
    tealFuel: 6.8,
    wispGapBase: 40,
    wispGapExtra: 14,
    wispClusterMin: 1,
    wispClusterMax: 3,
    magnetPull: 1.6,
    magnetRange: 2.6,
    catchReach: 2.15,
    rockPaceStart: 2.2,
    rockPaceEnd: 1.1,
    mineUnlock: 14,
    minePaceStart: 6.8,
    minePaceEnd: 3.8,
    logUnlock: 20,
    waveUnlock: 26,
    whirlUnlock: 34,
    stormStart: 42,
    scoreMultiplier: 1.4,
  },
  tempest: {
    baseSpeed: 20.2,
    maxExtraSpeed: 17.0,
    baseDrain: 4.8,
    extraDrain: 3.6,
    stormDrain: 1.1,
    amberFuel: 3.4,
    tealFuel: 5.5,
    wispGapBase: 46,
    wispGapExtra: 16,
    wispClusterMin: 1,
    wispClusterMax: 3,
    magnetPull: 1.2,
    magnetRange: 2.1,
    catchReach: 1.95,
    rockPaceStart: 1.75,
    rockPaceEnd: 0.85,
    mineUnlock: 9,
    minePaceStart: 5.0,
    minePaceEnd: 2.8,
    logUnlock: 14,
    waveUnlock: 18,
    whirlUnlock: 24,
    stormStart: 30,
    scoreMultiplier: 1.9,
  },
};

/* ---------------- shared wave field (GLSL + JS must match) ---------------- */

function waveH(x: number, z: number, t: number): number {
  return (
    0.5 * Math.sin((x * 1.0 + z * 0.35) * 0.14 + t * 0.8) +
    0.3 * Math.sin((x * -0.6 + z * 1.0) * 0.23 + t * 1.15) +
    0.16 * Math.sin((x * 0.9 - z * 0.45) * 0.42 + t * 1.9)
  );
}

const GLSL_WAVE = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform vec4 uWhirl[2];
float waveH(vec2 p, float t) {
  float h = 0.0;
  h += 0.50 * sin((p.x * 1.00 + p.y * 0.35) * 0.14 + t * 0.80);
  h += 0.30 * sin((p.x * -0.60 + p.y * 1.00) * 0.23 + t * 1.15);
  h += 0.16 * sin((p.x * 0.90 - p.y * 0.45) * 0.42 + t * 1.90);
  return h;
}
float surfH(vec2 p) {
  float h = waveH(p, uTime) * uAmp;
  for (int i = 0; i < 2; i++) {
    vec2 d = p - uWhirl[i].xy;
    h -= uWhirl[i].w * ${WHIRL_DEPTH.toFixed(2)} * exp(-dot(d, d) / (uWhirl[i].z * uWhirl[i].z * ${WHIRL_K.toFixed(2)}));
  }
  return h;
}
`;

const GLSL_SKY = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uMid;
uniform vec3 uZenith;
uniform vec3 uHaze;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uSunGlare;
uniform float uStorm;
uniform float uFlash;
vec3 skyColor(vec3 d) {
  float y = max(d.y, 0.0);
  float s = max(dot(d, uSunDir), 0.0);
  float hz = 1.0 - smoothstep(0.0, 0.34, y);
  vec3 warm = mix(uHaze, uHorizon, pow(s, 1.8));
  vec3 col = mix(warm, uMid, smoothstep(0.0, 0.2, y));
  col = mix(col, uZenith, smoothstep(0.08, 0.62, y));
  col += uSunColor * (pow(s, 9.0) * 0.21 * hz + pow(s, 72.0) * 0.34) * uSunGlare;
  col = mix(col, mix(col, vec3(dot(col, vec3(0.3, 0.5, 0.2))), 0.6) * 0.24 + vec3(0.010, 0.015, 0.019), uStorm * 0.85);
  col += uFlash * vec3(0.10, 0.13, 0.2);
  return col;
}
`;

const GLSL_NOISE = /* glsl */ `
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec2 i0 = mod(i, 289.0);
  vec2 i1 = mod(i + 1.0, 289.0);
  float a = hash21(i0);
  float b = hash21(vec2(i1.x, i0.y));
  float c = hash21(vec2(i0.x, i1.y));
  float d = hash21(i1);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < FBM_OCT; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}
`;

/* ---------------- JS noise (for carving rocks, logs, waves) ---------------- */

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}
function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let xf = x - xi, yf = y - yi, zf = z - zi;
  xf = xf * xf * (3 - 2 * xf);
  yf = yf * yf * (3 - 2 * yf);
  zf = zf * zf * (3 - 2 * zf);
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), xf);
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), xf);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), xf);
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), xf);
  return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf);
}
function fbm3(x: number, y: number, z: number): number {
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < 4; i++) {
    v += a * noise3(x, y, z);
    x = x * 2.02 + 11.3;
    y = y * 2.02 + 5.7;
    z = z * 2.02 + 7.9;
    a *= 0.5;
  }
  return v;
}

/* ---------------- palette (linear) ---------------- */

const C = {
  amber: new THREE.Color(1.0, 0.5, 0.12),
  teal: new THREE.Color(0.22, 0.95, 0.78),
  gold: new THREE.Color(1.0, 0.85, 0.5),
  crimson: new THREE.Color(1.0, 0.18, 0.12),
  foam: new THREE.Color(0.68, 0.78, 0.80),
  spray: new THREE.Color(0.52, 0.74, 0.78),
  wood: new THREE.Color(0.45, 0.26, 0.11),
  bolt: new THREE.Color(0.55, 0.72, 1.0),
  fogCalm: new THREE.Color("#6b7c87"),
  fogStorm: new THREE.Color("#1b2226"),
};

/* ---------------- entity types ---------------- */

interface Whirl {
  x: number;
  z: number;
  r: number;
  strength: number;
  active: boolean;
  inCore: boolean;
  idx: number;
}

interface Wisp {
  group: THREE.Group;
  core: THREE.Mesh;
  halo: THREE.Sprite;
  x: number;
  z: number;
  phase: number;
  teal: boolean;
  active: boolean;
  orbit: Whirl | null;
  oang: number;
  orad: number;
}

interface Rock {
  group: THREE.Group;
  body: THREE.Mesh;
  foam: THREE.Mesh;
  x: number;
  z: number;
  s: number;
  active: boolean;
  passed: boolean;
}

interface Mine {
  group: THREE.Group;
  body: THREE.Group;
  beacon: THREE.MeshStandardMaterial;
  halo: THREE.Sprite;
  x: number;
  z: number;
  phase: number;
  active: boolean;
  passed: boolean;
}

interface RogueWave {
  group: THREE.Group;
  crest: THREE.Mesh;
  foamMat: THREE.MeshBasicMaterial;
  x: number;
  z: number;
  vx: number;
  vz: number;
  halfW: number;
  active: boolean;
  hit: boolean;
  passed: boolean;
}

interface Log {
  group: THREE.Group;
  roll: THREE.Group;
  x: number;
  z: number;
  vx: number;
  ang: number;
  half: number;
  active: boolean;
  hit: boolean;
  sink: number;
  minD: number;
  passed: boolean;
}

interface Jelly {
  group: THREE.Group;
  tentacles: THREE.Line[];
  x: number;
  z: number;
  phase: number;
  active: boolean;
}

interface Ring {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  age: number;
  life: number;
  grow: number;
  active: boolean;
}

interface Shipwreck {
  group: THREE.Group;
  active: boolean;
  x: number;
  z: number;
  s: number;
}

interface BellBuoy {
  group: THREE.Group;
  light: THREE.PointLight;
  active: boolean;
  x: number;
  z: number;
  sounded: boolean;
  phase: number;
}

const BIOMES = {
  dusk: {
    name: "Dusk Shallows",
    horizon: new THREE.Color("#e88448"),
    mid: new THREE.Color("#856876"),
    zenith: new THREE.Color("#1d3b52"),
    haze: new THREE.Color("#73848e"),
    sunColor: new THREE.Color("#f4ad6c"),
    sunGlare: 1.0,
    starBoost: 1.0,
    deep: new THREE.Color("#08323f"),
    scatter: new THREE.Color("#1ea49c"),
    fogDensity: 0.0036,
    fogColor: new THREE.Color("#6b7c87"),
    hemiInt: 1.0,
    sunInt: 2.0,
  },
  abyss: {
    name: "The Starlit Abyss",
    horizon: new THREE.Color("#081528"),
    mid: new THREE.Color("#0b1932"),
    zenith: new THREE.Color("#020512"),
    haze: new THREE.Color("#071220"),
    sunColor: new THREE.Color("#2a4565"),
    sunGlare: 0.02,
    starBoost: 2.5,
    deep: new THREE.Color("#020b18"),
    scatter: new THREE.Color("#0b3a56"),
    fogDensity: 0.0042,
    fogColor: new THREE.Color("#071322"),
    hemiInt: 0.45,
    sunInt: 0.35,
  },
  graveyard: {
    name: "The Sunken Graveyard",
    horizon: new THREE.Color("#102227"),
    mid: new THREE.Color("#14282e"),
    zenith: new THREE.Color("#081418"),
    haze: new THREE.Color("#183036"),
    sunColor: new THREE.Color("#243d3a"),
    sunGlare: 0.02,
    starBoost: 1.2,
    deep: new THREE.Color("#041014"),
    scatter: new THREE.Color("#0e3c36"),
    fogDensity: 0.0125,
    fogColor: new THREE.Color("#122328"),
    hemiInt: 0.50,
    sunInt: 0.40,
  },
};

interface Strike {
  x: number;
  z: number;
  t: number;
  dur: number;
  active: boolean;
  idx: number;
}

interface Sail {
  geo: THREE.BufferGeometry;
  c: THREE.Vector3[];
  k: number;
}

interface FishSchool {
  x: number;
  z: number;
  vx: number;
  vz: number;
  phase: number;
  ampX: number;
}

interface Fish {
  school: number;
  ox: number;
  oz: number;
  scale: number;
  phase: number;
  agility: number;
  depth: number;
  bodyDepth: number;
  heading: number;
  bank: number;
  pitch: number;
  vx: number;
  vz: number;
  tail: number;
  amp: number;
  effort: number;
  porp: number;
  porpRate: number;
  bob: number;
  leapT: number;
  leapDur: number;
  leapH: number;
  leapCooldown: number;
  x: number;
  y: number;
  z: number;
}

export class GameEngine {
  state: GameState = "menu";

  private container: HTMLElement;
  private audio: GameAudio;
  private cb: EngineCallbacks;
  private isMobile: boolean;
  private NG: number;

  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private fog: THREE.FogExp2;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private waterMat!: THREE.ShaderMaterial;
  private waterMesh!: THREE.Mesh;
  private skyMesh!: THREE.Mesh;
  private islands: THREE.Group[] = [];
  private rockGeos: THREE.BufferGeometry[] = [];
  private islandGeos: THREE.BufferGeometry[] = [];
  private flameMesh?: THREE.Mesh;
  private pennant?: THREE.Mesh;

  // shared uniforms (sky + water)
  private U = {
    uTime: { value: 0 },
    uAmp: { value: 1 },
    uStorm: { value: 0 },
    uFlash: { value: 0 },
    uSunGlare: { value: 1.0 },
    uStarBoost: { value: 1.0 },
    uSunDir: { value: sunDir() },
    uSunColor: { value: new THREE.Color("#f4ad6c") },
    uHorizon: { value: new THREE.Color("#e88448") },
    uMid: { value: new THREE.Color("#856876") },
    uZenith: { value: new THREE.Color("#1d3b52") },
    uHaze: { value: new THREE.Color("#73848e") },
    uWhirl: { value: [new THREE.Vector4(0, 0, 1, 0), new THREE.Vector4(0, 0, 1, 0)] },
  };
  private uGlowPos: THREE.Vector4[] = [];
  private uGlowCol: THREE.Vector3[] = [];
  private uStrike = [new THREE.Vector4(0, 0, 1, 0), new THREE.Vector4(0, 0, 1, 0)];
  private uBoat = new THREE.Vector4(0, 0, 0, 1);
  private uCloudShift = { value: 0 };
  private uFogDensity = { value: 0.0036 };
  private uFishTime = { value: 0 };
  private uDeepColor = new THREE.Color("#08323f");
  private uScatterColor = new THREE.Color("#1ea49c");

  // Biomes & Lighthouse Haven
  private currentBiome: "dusk" | "abyss" | "graveyard" = "dusk";
  private currentBiomeName = "Dusk Shallows";
  private lastBiomeAnnounced = "dusk";
  private lastLighthouseTriggered = 0;
  private lighthouse!: THREE.Group;
  private lighthouseBeam!: THREE.Group;
  private lighthouseLight!: THREE.PointLight;
  private shipwrecks: Shipwreck[] = [];
  private buoys: BellBuoy[] = [];
  private shipwreckTimer = 14;
  private buoyTimer = 18;

  // boat
  private boat!: THREE.Group;
  private rig!: THREE.Group;
  private rudder!: THREE.Mesh;
  private sails: Sail[] = [];
  private lanternPivot!: THREE.Group;
  private lanternLight!: THREE.PointLight;
  private lanternGlass!: THREE.MeshStandardMaterial;
  private lanternHalo!: THREE.Sprite;
  private hullMat!: THREE.MeshStandardMaterial;
  private lanternPulse = 0;
  private lanternFade = 1;
  private hullFlash = 0;
  private boatY = 0;
  private boatVy = 0;
  private belly = 0.25;
  private sheet = 0.4;
  private swingZ = 0;
  private swingZv = 0;
  private vxSmooth = 0;
  private pushVx = 0;
  private coreAmt = 0;

  // pools
  private wisps: Wisp[] = [];
  private rocks: Rock[] = [];
  private mines: Mine[] = [];
  private waves: RogueWave[] = [];
  private logs: Log[] = [];
  private jellies: Jelly[] = [];
  private rings: Ring[] = [];
  private whirls: Whirl[] = [];
  private strikes: Strike[] = [];

  // swimming fish
  private speciesMeshes: THREE.InstancedMesh[] = [];
  private speciesSwim: Float32Array[] = [];
  private speciesSwimAttrs: THREE.InstancedBufferAttribute[] = [];
  private schools: FishSchool[] = [];
  private fishes: Fish[] = [];
  private fishDummy = new THREE.Object3D();

  // particles
  private pGeo!: THREE.BufferGeometry;
  private pMat!: THREE.ShaderMaterial;
  private pPos!: Float32Array;
  private pVel!: Float32Array;
  private pCol!: Float32Array;
  private pSize!: Float32Array;
  private pAlpha!: Float32Array;
  private pLife!: Float32Array;
  private pMax!: Float32Array;
  private pGrav!: Float32Array;
  private pDrag!: Float32Array;
  private pCount = 0;

  // weather
  private rain!: THREE.LineSegments;
  private rainPos!: Float32Array;
  private rainN = 0;
  private bolt!: THREE.Mesh;
  private boltGlow!: THREE.Mesh;
  private boltT = 0;
  private storm = 0;
  private stormOn = false;
  private stormTimer = 36;
  private strikeTimer = 3;
  private ambientBoltT = 5;
  private flash = 0;
  private windX = 0;
  private amp = 1;
  private lastRumble = 0;
  private lastRain = 0;

  // input
  private keyL = false;
  private keyR = false;
  private pointerDown = false;
  private pointerX = 0;
  private kbX = 0;
  private activePointerId = -1;
  private modalOpen = false;
  private touchControl: "drag" | "follow" | "tilt" = "drag";
  private haptics = true;
  private dragRelative = false;
  private dragStartX = 0;
  private dragStartTarget = 0;
  private tiltRaw = 0;
  private tiltZero = 0;
  private tiltReady = false;
  private wakeLock: { release: () => Promise<void> } | null = null;
  private resizeObs: ResizeObserver | null = null;

  // settings & difficulty
  private difficulty: Difficulty = "standard";
  private environment: EnvironmentMode = "sea";
  private screenShakeEnabled = true;

  // run state
  private t = 0;
  private runTime = 0;
  private speed = 12;
  private timeScale = 1;
  private slowmoT = 0;
  private score = 0;
  private combo = 1;
  private comboT = 0;
  private maxCombo = 1;
  private energy = 100;
  private wispsCaught = 0;
  private invulnT = 0;
  private shake = 0;
  private godMode = false;

  private patternTimer = 0.5;
  private rockTimer = 2.6;
  private mineTimer = 9;
  private logTimer = 15;
  private waveTimer = 21;
  private whirlTimer = 28;
  private jellyTimer = 14;
  private waveAlertShown = false;
  private mineAlertShown = false;
  private sprayTimer = 0;
  private overTimer = 0;

  // quality
  private levels: { bloom: boolean; dpr: number }[];
  private quality = 0;
  private qualityLocked = false;
  private frameAcc = 0;
  private frameN = 0;
  private warm = 0;
  private viewH = 720;
  private fovBase = 56;

  private raf = 0;
  private lastNow = 0;
  private disposed = false;

  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();

  constructor(
    container: HTMLElement,
    audio: GameAudio,
    initialSettings: GameSettings,
    cb: EngineCallbacks,
  ) {
    this.container = container;
    this.audio = audio;
    this.cb = cb;
    this.isMobile =
      window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window;
    this.NG = this.isMobile ? 4 : 6;

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    this.levels = this.isMobile
      ? [
          { bloom: false, dpr: Math.min(dpr, 1.5) },
          { bloom: false, dpr: Math.min(dpr, 1.15) },
          { bloom: false, dpr: Math.min(dpr, 0.85) },
        ]
      : [
          { bloom: true, dpr: Math.min(dpr, 2) },
          { bloom: true, dpr: Math.min(dpr, 1.25) },
          { bloom: false, dpr: 1 },
        ];
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q !== null && /^[0-2]$/.test(q)) {
      this.quality = parseInt(q, 10);
      this.qualityLocked = true;
    }

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(this.levels[this.quality].dpr);
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.domElement.style.touchAction = "none";
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.fog = new THREE.FogExp2(C.fogCalm.getHex(), 0.006);
    this.scene.fog = this.fog;

    this.fovBase = this.fovFor(w / h);
    this.viewH = h;
    this.camera = new THREE.PerspectiveCamera(this.fovBase, w / h, 0.1, 2000);
    this.camera.position.set(0, 7, 13);

    this.hemi = new THREE.HemisphereLight(0x8fa9bd, 0x1a2a30, 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xf6aa68, 2.0);
    this.sun.position.copy(sunDir()).multiplyScalar(200);
    this.scene.add(this.sun);
    const fill = new THREE.DirectionalLight(0xffcf9e, 0.62);
    fill.position.set(6, 8, 15);
    this.scene.add(fill);

    for (let i = 0; i < this.NG; i++) {
      this.uGlowPos.push(new THREE.Vector4(0, 0, 0, 0));
      this.uGlowCol.push(new THREE.Vector3(1, 0.6, 0.2));
    }
    for (let i = 0; i < 2; i++) {
      this.whirls.push({ x: 0, z: 0, r: 8, strength: 0, active: false, inCore: false, idx: i });
      this.strikes.push({ x: 0, z: 0, t: 0, dur: 1, active: false, idx: i });
    }

    const glowTex = makeGlowTexture();
    this.buildSky();
    this.buildWater();
    for (let i = 0; i < 4; i++) {
      this.rockGeos.push(makeRockGeometry(3.7 + i * 11.3));
      this.islandGeos.push(makeIslandGeometry(2.1 + i * 3.7));
    }
    this.buildIslands();
    this.buildBoat(glowTex);
    this.buildPools(glowTex);
    this.buildFishes();
    this.buildParticles();
    this.buildWeather();
    this.buildBiomes();
    this.buildComposer(w, h);
    this.applySettings(initialSettings);

    // warm every shader program up-front so nothing hitches mid-run
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    this.renderer.compile(this.scene, this.camera);
    for (const o of hidden) o.visible = false;

    for (let i = 0; i < 2; i++) this.spawnPattern(-42 - i * 44);

    this.bindEvents();
    this.onResize();
    if (window.location.search.includes("debug")) {
      (window as unknown as { __drift?: GameEngine }).__drift = this;
    }
    this.lastNow = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const ms = Math.max(0, now - this.lastNow);
      const dt = Math.min(ms / 1000, 0.05);
      this.lastNow = now;
      if (this.state !== "paused") {
        this.update(dt);
        this.monitor(ms);
      }
      this.render();
    };
    this.raf = requestAnimationFrame(loop);
  }

  /* ================= public API ================= */

  setModalOpen(open: boolean) {
    this.modalOpen = open;
  }

  applySettings(s: GameSettings) {
    this.difficulty = s.difficulty;
    this.environment = s.environment ?? "sea";
    this.screenShakeEnabled = s.screenShake;
    this.touchControl = s.touchControl;
    this.haptics = s.haptics;
    if (!s.screenShake) this.shake = 0;
    this.U.uSunGlare.value = s.sunGlare === "minimal" ? 0.42 : 1.0;

    if (s.quality === "auto") {
      this.qualityLocked = false;
    } else {
      this.qualityLocked = true;
      const target = s.quality === "high" ? 0 : s.quality === "medium" ? 1 : 2;
      if (target !== this.quality) {
        this.quality = target;
        this.applyQuality();
      }
    }
  }

  startRun() {
    if (this.state === "playing") return;
    const tune = DIFF_TUNING[this.difficulty];
    this.clearEntities();
    this.score = 0;
    this.combo = 1;
    this.maxCombo = 1;
    this.comboT = 0;
    this.energy = 100;
    this.wispsCaught = 0;
    this.runTime = 0;
    this.speed = tune.baseSpeed;
    this.timeScale = 1;
    this.slowmoT = 0;
    this.invulnT = 0;
    this.shake = 0;
    this.patternTimer = 0.9;
    this.rockTimer = 2.6;
    this.mineTimer = tune.mineUnlock;
    this.logTimer = tune.logUnlock;
    this.waveTimer = tune.waveUnlock;
    this.whirlTimer = tune.whirlUnlock;
    this.jellyTimer = 15 + Math.random() * 6;
    this.waveAlertShown = false;
    this.mineAlertShown = false;
    this.stormOn = false;
    this.stormTimer = tune.stormStart;
    this.pushVx = 0;
    this.coreAmt = 0;
    this.currentBiome = "dusk";
    this.currentBiomeName = "Dusk Shallows";
    this.lastBiomeAnnounced = "dusk";
    this.lastLighthouseTriggered = 0;
    this.shipwreckTimer = 14;
    this.buoyTimer = 18;
    if (this.lighthouse) this.lighthouse.visible = false;
    for (const s of this.shipwrecks) {
      s.active = false;
      s.group.visible = false;
    }
    for (const b of this.buoys) {
      b.active = false;
      b.group.visible = false;
      b.sounded = false;
    }
    // re-centre the world on the boat without moving the camera relative to it
    const sx = -this.boat.position.x;
    const sz = -this.boat.position.z;
    this.camera.position.x += sx;
    this.camera.position.z += sz;
    for (const isle of this.islands) isle.position.z += sz;
    this.resetFishPositions(0, 0);
    this.boat.position.set(0, this.boat.position.y, 0);
    this.boatY = this.surf(0, 0);
    this.boatVy = 0;
    this.vxSmooth = 0;
    this.kbX = 0;
    this.pointerX = 0;
    this.pointerDown = false;
    this.activePointerId = -1;
    // re-centre tilt steering on however the player is holding the phone
    if (this.tiltReady) this.tiltZero = clamp(this.tiltRaw, -25, 25);
    this.lanternFade = 1;
    this.overTimer = 0;
    // a short opening line of 3 wisps — then you must actively steer
    for (let i = 0; i < 3; i++) this.spawnWisp(0, -30 - i * 7.5, false);
    this.setState("playing");
    this.audio.startSwell();
  }

  togglePause() {
    if (this.state === "playing") this.setState("paused");
    else if (this.state === "paused") this.resume();
  }

  pause() {
    if (this.state === "playing") this.setState("paused");
  }

  resume() {
    if (this.state === "paused") {
      this.lastNow = performance.now();
      this.setState("playing");
    }
  }

  toMenu() {
    this.clearEntities();
    for (let i = 0; i < 2; i++) this.spawnPattern(this.boat.position.z - 42 - i * 44);
    this.lanternFade = 1;
    this.stormOn = false;
    this.setState("menu");
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unbindEvents();
    this.releaseWakeLock();
    this.audio.setRumble(0);
    this.audio.setRain(0);
    this.composer?.dispose();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  /* ================= input ================= */

  private onKeyDown = (e: KeyboardEvent) => {
    const code = e.code;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(code)) {
      e.preventDefault();
    }
    if (e.repeat && code !== "ArrowLeft" && code !== "ArrowRight") return;
    switch (code) {
      case "ArrowLeft":
      case "KeyA":
        this.keyL = true;
        break;
      case "ArrowRight":
      case "KeyD":
        this.keyR = true;
        break;
      case "Escape":
      case "KeyP":
        if (this.state === "playing" || this.state === "paused") this.togglePause();
        break;
      case "KeyR":
        if (this.state !== "menu") {
          if (this.state === "playing") this.state = "paused";
          this.startRun();
        }
        break;
      case "Space":
      case "Enter":
        if (this.state === "paused" && !this.modalOpen) this.resume();
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") this.keyL = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") this.keyR = false;
  };

  private onBlur = () => {
    this.keyL = false;
    this.keyR = false;
    if (this.isMobile && this.state === "playing") this.setState("paused");
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.activePointerId !== -1) return;
    if (this.touchControl === "tilt" && this.tiltReady && e.pointerType !== "mouse") return;
    this.activePointerId = e.pointerId;
    this.pointerDown = true;
    // phones: the boat moves with the thumb's slide, so it is never hidden under it
    this.dragRelative = this.touchControl === "drag" && e.pointerType !== "mouse";
    this.dragStartX = e.clientX;
    this.dragStartTarget = this.boat.position.x;
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.updatePointer(e);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.activePointerId) return;
    this.updatePointer(e);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.activePointerId) return;
    this.activePointerId = -1;
    this.pointerDown = false;
    this.kbX = this.pointerX;
  };

  private onContextMenu = (e: Event) => e.preventDefault();

  private updatePointer(e: PointerEvent) {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    if (this.dragRelative) {
      // a short thumb slide crosses the whole sailing lane
      const sens = (STEER_RANGE * 2) / Math.min(w * 0.55, 420);
      this.pointerX = clamp(
        this.dragStartTarget + (e.clientX - this.dragStartX) * sens,
        -STEER_RANGE,
        STEER_RANGE,
      );
      // re-anchor at the edges so reversing responds instantly
      if (Math.abs(this.pointerX) >= STEER_RANGE) {
        this.dragStartX = e.clientX;
        this.dragStartTarget = this.pointerX;
      }
    } else {
      const nx = ((e.clientX - rect.left) / w) * 2 - 1;
      this.pointerX = clamp(nx * 1.25, -1, 1) * STEER_RANGE;
    }
  }

  private onOrient = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    const so = screen.orientation;
    const ang =
      so && typeof so.angle === "number"
        ? so.angle
        : ((window as unknown as { orientation?: number }).orientation ?? 0);
    let tilt = e.gamma;
    if (ang === 90) tilt = e.beta;
    else if (ang === 270 || ang === -90) tilt = -e.beta;
    else if (ang === 180) tilt = -e.gamma;
    const first = !this.tiltReady;
    this.tiltReady = true;
    // low-pass the sensor so steering is smooth, not twitchy
    this.tiltRaw = first ? tilt : this.tiltRaw + (tilt - this.tiltRaw) * 0.3;
    if (first) this.tiltZero = clamp(tilt, -25, 25);
  };

  private haptic(p: number | number[]) {
    if (!this.haptics || typeof navigator.vibrate !== "function") return;
    try {
      navigator.vibrate(p);
    } catch {
      /* ignore */
    }
  }

  private async requestWakeLock() {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock || this.wakeLock || document.hidden) return;
    try {
      this.wakeLock = await nav.wakeLock.request("screen");
    } catch {
      this.wakeLock = null;
    }
  }

  private releaseWakeLock() {
    const wl = this.wakeLock;
    this.wakeLock = null;
    if (wl) wl.release().catch(() => {});
  }

  private onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.viewH = h;
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
    this.camera.aspect = w / h;
    this.fovBase = this.fovFor(w / h);
    this.camera.fov = this.fovBase;
    this.camera.updateProjectionMatrix();
  };

  private onVisibility = () => {
    if (document.hidden) {
      if (this.state === "playing") this.setState("paused");
      this.wakeLock = null; // the OS drops it while hidden
      this.audio.suspend();
    } else {
      this.audio.resume();
      this.lastNow = performance.now();
    }
  };

  private bindEvents() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("deviceorientation", this.onOrient);
    window.visualViewport?.addEventListener("resize", this.onResize);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObs = new ResizeObserver(() => this.onResize());
      this.resizeObs.observe(this.container);
    }
    document.addEventListener("visibilitychange", this.onVisibility);
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    el.addEventListener("contextmenu", this.onContextMenu);
  }

  private unbindEvents() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("deviceorientation", this.onOrient);
    window.visualViewport?.removeEventListener("resize", this.onResize);
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    document.removeEventListener("visibilitychange", this.onVisibility);
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    el.removeEventListener("contextmenu", this.onContextMenu);
  }

  private fovFor(aspect: number): number {
    return aspect < 1.05 ? Math.min(80, 56 + (1.05 - aspect) * 32) : 56;
  }

  /* ================= quality ================= */

  private buildComposer(w: number, h: number) {
    if (!this.levels.some((l) => l.bloom)) return;
    const pr = this.renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    const composer = new EffectComposer(this.renderer, rt);
    composer.addPass(new RenderPass(this.scene, this.camera));
    // threshold above 1.15 keeps sun glare gentle while wisps & lantern still glow
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.46, 1.18));
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  private applyQuality() {
    this.renderer.setPixelRatio(this.levels[this.quality].dpr);
    this.onResize();
  }

  private monitor(ms: number) {
    if (this.qualityLocked || ms > 250) return;
    if (this.warm < 90) {
      this.warm++;
      return;
    }
    this.frameAcc += ms;
    this.frameN++;
    if (this.frameN >= (this.isMobile ? 70 : 100)) {
      const avg = this.frameAcc / this.frameN;
      this.frameAcc = 0;
      this.frameN = 0;
      if (avg > (this.isMobile ? 20 : 21.5) && this.quality < this.levels.length - 1) {
        this.quality++;
        this.applyQuality();
        this.warm = 30;
      }
    }
  }

  private render() {
    if (this.composer && this.levels[this.quality].bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /* ================= build: sky & water ================= */

  private buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      defines: { FBM_OCT: this.isMobile ? 3 : 5 },
      uniforms: { ...this.U, uCloudShift: this.uCloudShift },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uCloudShift;
        uniform float uStarBoost;
        varying vec3 vDir;
        ${GLSL_SKY}
        ${GLSL_NOISE}
        void main() {
          vec3 d = normalize(vDir);
          vec3 col = skyColor(d);
          float s = max(dot(d, uSunDir), 0.0);
          float calm = 1.0 - uStorm;

          // stars
          float starMask = smoothstep(0.15, 0.75, d.y) * calm;
          if (starMask > 0.01) {
            vec2 sp = d.xz / (d.y + 0.35) * 48.0;
            vec2 cell = floor(sp);
            float h = hash21(cell);
            vec2 off = vec2(hash21(cell + 7.3), hash21(cell + 13.1)) - 0.5;
            float dd = length(fract(sp) - 0.5 - off * 0.6);
            float tw = 0.6 + 0.4 * sin(uTime * (1.5 + h * 3.0) + h * 40.0);
            float thresh = 0.90 - (uStarBoost - 1.0) * 0.04;
            col += vec3(0.8, 0.9, 1.0) * step(thresh, h) * smoothstep(0.1, 0.0, dd) * tw * starMask * (1.2 + (uStarBoost - 1.0) * 0.8);

            // Milky Way galactic dust lane (prominent in Starlit Abyss)
            float mw = smoothstep(0.2, 0.85, sin(d.x * 2.1 + d.z * 1.5 + 1.2)) * smoothstep(0.18, 0.75, d.y);
            col += vec3(0.08, 0.14, 0.28) * mw * (1.0 - uSunGlare) * starMask * 0.9;

            // Shooting stars in the night sky
            if (uStarBoost > 1.3) {
              float mt = mod(uTime * 0.4, 6.0);
              if (mt < 0.65) {
                float prog = mt / 0.65;
                vec2 p1 = vec2(-0.4, 0.6);
                vec2 p2 = vec2(0.5, -0.3);
                vec2 curP = d.xz / (d.y + 0.35);
                vec2 head = mix(p1, p2, prog);
                vec2 tail = mix(p1, p2, max(0.0, prog - 0.25));
                vec2 pa = curP - tail, ba = head - tail;
                float segH = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
                float mDist = length(pa - ba * segH);
                col += vec3(0.9, 0.96, 1.0) * smoothstep(0.02, 0.002, mDist) * (1.0 - prog) * 2.8;
              }
            }
          }

          // soft dusk sun disk (eye-friendly, no blinding flare)
          col += uSunColor * smoothstep(0.99935, 0.99985, s) * 1.85 * calm * uSunGlare;

          // clouds
          float cm = smoothstep(-0.01, 0.1, d.y);
          if (cm > 0.0) {
            vec2 cp = d.xz / (d.y + 0.16) * 0.85 + vec2(uTime * 0.008 + 3.0, uCloudShift);
            float c1 = fbm(cp);
            float c2 = fbm(cp * 2.9 + 11.0);
            float c = c1 * 0.78 + c2 * 0.22;
            float cover = mix(0.5, 0.27, uStorm);
            float dens = smoothstep(cover, cover + 0.28, c) * cm;
            float thin = 1.0 - smoothstep(cover, cover + 0.4, c);
            float sunAmt = pow(s, 4.0) * uSunGlare;
            vec3 cDark = mix(vec3(0.085, 0.07, 0.10), vec3(0.008, 0.011, 0.014), uStorm);
            vec3 cLit = mix(uHorizon * 0.78, uSunColor * 1.15, sunAmt) * (0.3 + 0.7 * calm);
            vec3 cc = mix(cDark, cLit, thin * (0.25 + 0.75 * sunAmt));
            cc += uFlash * vec3(0.3, 0.37, 0.56) * (0.3 + 0.7 * c2);
            col = mix(col, cc, dens * 0.9);
          }

          col += (hash21(gl_FragCoord.xy) - 0.5) * 0.004;
          gl_FragColor = vec4(max(col, 0.0), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    this.skyMesh.frustumCulled = false;
    this.skyMesh.renderOrder = -10;
    this.scene.add(this.skyMesh);
  }

  private buildWater() {
    this.waterMat = new THREE.ShaderMaterial({
      fog: false,
      defines: { NG: this.NG, FBM_OCT: 3 },
      uniforms: {
        ...this.U,
        uDeep: { value: this.uDeepColor },
        uScatter: { value: this.uScatterColor },
        uFogDensity: this.uFogDensity,
        uGlowPos: { value: this.uGlowPos },
        uGlowCol: { value: this.uGlowCol },
        uStrike: { value: this.uStrike },
        uBoat: { value: this.uBoat },
      },
      vertexShader: /* glsl */ `
        ${GLSL_WAVE}
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          wp.y += surfH(wp.xz);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeep;
        uniform vec3 uScatter;
        uniform float uFogDensity;
        uniform vec4 uGlowPos[NG];
        uniform vec3 uGlowCol[NG];
        uniform vec4 uStrike[2];
        uniform vec4 uBoat;
        varying vec3 vWorld;
        ${GLSL_WAVE}
        ${GLSL_SKY}
        ${GLSL_NOISE}

        vec2 dw(vec2 p, vec2 dir, float f, float a, float ph) {
          return dir * (a * f * cos(dot(dir, p) * f + ph));
        }

        void main() {
          vec2 p = vWorld.xz;
          vec3 toCam = cameraPosition - vWorld;
          float dist = length(toCam);
          vec3 V = toCam / dist;
          float t = uTime;

          // --- macro normal from the true wave field ---
          float e = 0.3;
          float h0 = surfH(p);
          vec2 grad = vec2(surfH(p + vec2(e, 0.0)) - h0, surfH(p + vec2(0.0, e)) - h0) / e;

          // --- detail ripples (analytic), faded with distance ---
          vec2 q = p + 0.7 * vec2(sin(p.y * 0.21 + t * 0.35), cos(p.x * 0.17 - t * 0.3));
          float fMid = exp(-dist * 0.007);
          float fFine = exp(-dist * 0.03);
          vec2 g = vec2(0.0);
          g += dw(q, vec2(0.80, 0.60), 0.9, 0.060, t * 1.6) * fMid;
          g += dw(q, vec2(-0.55, 0.83), 1.3, 0.045, t * 1.9) * fMid;
          g += dw(q, vec2(0.30, -0.95), 1.9, 0.030, t * 2.3) * fMid;
          g += dw(q, vec2(-0.92, -0.38), 2.9, 0.018, t * 2.9) * fFine;
          g += dw(q, vec2(0.66, 0.75), 4.3, 0.012, t * 3.6) * fFine;
          g += dw(q, vec2(-0.20, 0.98), 6.1, 0.008, t * 4.4) * fFine;
          vec2 np = q * 2.1 + vec2(t * 0.5, -t * 0.35);
          float na = vnoise(np);
          g += vec2(vnoise(np + vec2(0.3, 0.0)) - na, vnoise(np + vec2(0.0, 0.3)) - na) * 0.5 * fFine;
          grad += g * (1.0 + uStorm * 1.1);
          vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));

          // --- reflection / body ---
          float NdV = max(dot(N, V), 0.0);
          float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
          vec3 R = reflect(-V, N);
          vec3 Rs = normalize(vec3(R.x, abs(R.y) + 0.03, R.z));
          vec3 refl = skyColor(Rs);

          float calm = 1.0 - uStorm;
          float sunFace = max(dot(-V, uSunDir), 0.0);
          sunFace *= sunFace;
          float crest = clamp(h0 / max(uAmp, 0.5) * 0.6 + 0.45, 0.0, 1.0);
          vec3 body = uDeep + uScatter * (0.10 + 0.28 * sunFace * calm) * crest;
          body *= 1.0 - uStorm * 0.5;
          vec3 col = mix(body, refl, F);

          // --- controlled sun glitter (gentle on the eyes) ---
          float sd = max(dot(R, uSunDir), 0.0);
          col += uSunColor * pow(sd, mix(90.0, 580.0, fFine)) * mix(0.9, 4.0, fFine) * calm * uSunGlare;

          // --- lantern, wisps & mine beacon light on the water ---
          vec3 glowDiff = vec3(0.0);
          for (int i = 0; i < NG; i++) {
            float inten = uGlowPos[i].w;
            vec3 Lv = uGlowPos[i].xyz - vWorld;
            float d2 = dot(Lv, Lv);
            if (inten > 0.001 && d2 < 3600.0) {
              vec3 L = Lv * inversesqrt(d2);
              float nh = max(dot(N, normalize(L + V)), 0.0);
              glowDiff += uGlowCol[i] * (inten / (1.0 + d2 * 0.07)) * max(dot(N, L), 0.0);
              col += uGlowCol[i] * inten * (pow(nh, 160.0) * 3.0 + pow(nh, 22.0) * 0.22) / (1.0 + d2 * 0.012);
            }
          }
          col += glowDiff * (uScatter * 1.6 + 0.07);

          // --- foam: crests, hull wash, kelvin wake ---
          float fn = vnoise(p * 1.1 + vec2(t * 0.25, t * 0.1)) * 0.6 + vnoise(p * 3.3 - vec2(t * 0.3)) * 0.4;
          float foam = smoothstep(0.5, 0.95, h0 / max(uAmp, 0.5)) * smoothstep(0.38, 0.75, fn) * (0.1 + uStorm * 0.8);

          vec2 bp = p - uBoat.xy;
          if (bp.y > -4.0 && bp.y < 70.0 && abs(bp.x) < 40.0) {
            float back = max(bp.y, 0.0);
            float ax = abs(bp.x + uBoat.z * back);
            float qa = (ax - (0.6 + back * 0.3)) / (0.26 + back * 0.04);
            float vArm = exp(-qa * qa) * smoothstep(-0.5, 2.5, bp.y) * exp(-back * 0.06);
            float qc = ax / (0.75 + back * 0.05);
            float coreW = exp(-qc * qc) * smoothstep(1.2, 3.2, bp.y) * exp(-back * 0.11);
            float hullD = length(bp * vec2(1.0, 0.46));
            float hullF = smoothstep(1.55, 1.0, hullD) * smoothstep(0.35, 0.7, fn + 0.25);
            col *= 1.0 - 0.45 * smoothstep(2.0, 0.7, hullD);
            foam += uBoat.w * ((vArm * 0.8 + coreW * 0.6) * (0.3 + 0.7 * fn) + hullF * 0.6);
          }

          // --- whirlpools ---
          for (int i = 0; i < 2; i++) {
            float ws = uWhirl[i].w;
            if (ws > 0.001) {
              vec2 d = p - uWhirl[i].xy;
              float r = length(d);
              float rn = r / uWhirl[i].z;
              if (rn < 1.5) {
                float ang = atan(d.y, d.x);
                float spiral = sin(ang * 3.0 + log(r + 0.5) * 5.5 + t * 2.8);
                float mask = smoothstep(1.35, 0.55, rn) * smoothstep(0.02, 0.16, rn);
                col *= 1.0 - ws * 0.85 * smoothstep(0.55, 0.0, rn);
                col += uScatter * ws * 0.3 * mask;
                foam += ws * mask * smoothstep(0.1, 0.95, spiral) * (0.45 + 0.55 * fn);
              }
            }
          }

          vec3 foamCol = mix(vec3(0.70, 0.80, 0.82), vec3(0.22, 0.26, 0.28), uStorm * 0.8)
            + uSunColor * 0.20 * calm * uSunGlare + glowDiff * 2.2 + uFlash * vec3(0.5, 0.56, 0.7);
          col = mix(col, foamCol, clamp(foam, 0.0, 1.0) * 0.92);

          // --- lightning target markers ---
          for (int i = 0; i < 2; i++) {
            float si = uStrike[i].w;
            if (si > 0.001) {
              vec2 d = p - uStrike[i].xy;
              float r = length(d) / uStrike[i].z;
              if (r < 1.3) {
                float ring = smoothstep(0.1, 0.0, abs(r - 1.0));
                float pulse = smoothstep(0.09, 0.0, abs(r - (1.0 - fract(t * 1.6)))) * step(r, 1.0);
                float fill = smoothstep(1.0, 0.0, r) * (0.1 + 0.25 * vnoise(d * 2.5 + t * 9.0));
                col += vec3(0.5, 0.8, 1.7) * si * (ring * 1.8 + pulse * 0.8 + fill);
              }
            }
          }

          col *= 1.0 + uFlash * 0.5;

          // --- aerial perspective into the sky at the horizon ---
          vec3 fogCol = skyColor(normalize(vec3(-V.x, 0.012, -V.z)));
          float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
          col = mix(col, fogCol, fog);

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.waterMesh = new THREE.Mesh(
      makeWaterGeometry(this.isMobile ? 120 : 180, 700, 2.2),
      this.waterMat,
    );
    this.waterMesh.frustumCulled = false;
    this.scene.add(this.waterMesh);
  }

  private buildIslands() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSunColor: this.U.uSunColor,
        uHaze: this.U.uHaze,
        uHorizon: this.U.uHorizon,
        uStorm: this.U.uStorm,
        uFlash: this.U.uFlash,
      },
      vertexShader: ISLAND_VERT,
      fragmentShader: ISLAND_FRAG,
      side: THREE.DoubleSide,
    });
    const rockMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      fog: false,
      emissive: 0x182422,
      emissiveIntensity: 0.5,
    });
    const treeMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.78,
      metalness: 0.08,
      fog: false,
    });
    const treeGeo = makePineTreeGeometry();
    const foamMat = new THREE.MeshBasicMaterial({
      map: makeFoamRingTexture(),
      color: new THREE.Color(0.88, 0.94, 0.96),
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      fog: false,
    });
    const foamGeo = new THREE.PlaneGeometry(2.6, 2.6);
    foamGeo.rotateX(-Math.PI / 2);

    for (let i = 0; i < 8; i++) {
      const seed = 2.1 + (i % 4) * 3.7;
      const g = new THREE.Group();
      g.add(new THREE.Mesh(this.islandGeos[i % this.islandGeos.length], mat));

      // satellite sea stacks clustered off the coast
      for (let k = 0; k < 3; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.72 + Math.random() * 0.32;
        const spire = new THREE.Mesh(this.rockGeos[(i + k) % this.rockGeos.length], rockMat);
        spire.position.set(Math.cos(a) * r, -0.02, Math.sin(a) * r);
        const sc = 0.09 + Math.random() * 0.11;
        spire.scale.set(sc, sc * (1.5 + Math.random()), sc);
        spire.rotation.y = Math.random() * 6;
        g.add(spire);
      }

      // broken surf around the shoreline
      const foam = new THREE.Mesh(foamGeo, foamMat);
      foam.position.y = 0.055;
      foam.rotation.y = Math.random() * 6;
      g.add(foam);

      // wind-sculpted alpine pines on the lush mountain slopes
      const spots = islandTreeSpots(seed, 90);
      if (spots.length) {
        const trees = new THREE.InstancedMesh(treeGeo, treeMat, spots.length);
        const dummy = new THREE.Object3D();
        spots.forEach((sp, k) => {
          dummy.position.set(sp.x, sp.y + sp.s * 0.12, sp.z);
          dummy.rotation.set(sp.lean, Math.random() * 6, sp.lean * 0.6);
          dummy.scale.set(sp.s, sp.s * (1.0 + Math.random() * 0.6), sp.s);
          dummy.updateMatrix();
          trees.setMatrixAt(k, dummy.matrix);
        });
        trees.instanceMatrix.needsUpdate = true;
        trees.frustumCulled = false;
        g.add(trees);
      }

      this.islands.push(g);
      this.scene.add(g);
      this.recycleIsland(g, -180 - Math.random() * 320);
    }
  }

  /* ================= build: boat ================= */

  private buildBoat(glowTex: THREE.Texture) {
    const boat = new THREE.Group();
    const wood = makeDetailedWoodTexture();
    const deckTex = makeDeckTexture();
    const woodMat = new THREE.MeshStandardMaterial({
      map: wood,
      bumpMap: wood,
      bumpScale: 0.55,
      roughness: 0.74,
      side: THREE.DoubleSide,
    });
    const deckMat = new THREE.MeshStandardMaterial({
      map: deckTex,
      bumpMap: deckTex,
      bumpScale: 0.4,
      roughness: 0.82,
      side: THREE.DoubleSide,
    });
    const hullMat = woodMat.clone();
    hullMat.vertexColors = true;
    hullMat.roughness = 0.68;
    this.hullMat = hullMat;
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x3a2413, roughness: 0.84 });
    const caulk = new THREE.MeshStandardMaterial({ color: 0x140c06, roughness: 1 });
    const paint = new THREE.MeshStandardMaterial({
      color: 0x263a38,
      roughness: 0.58,
      metalness: 0.18,
    });
    const metal = new THREE.MeshStandardMaterial({
      color: 0x22211e,
      roughness: 0.44,
      metalness: 0.72,
    });
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8a7350, roughness: 1 });

    /* ---- lofted clinker hull ---- */
    const NS = 30;
    const NR = 18;
    const prof = (t: number) => {
      const fb = Math.pow(Math.sin(Math.min(1, t / 0.6) * Math.PI * 0.5), 0.85);
      const fs = 1 - 0.32 * smooth(t, 0.66, 1);
      return {
        beam: 0.95 * fb * fs,
        top: 0.62 + 0.55 * Math.pow(1 - t, 2.6) + 0.08 * t * t * t,
        keel: -0.34 * (0.25 + 0.75 * fb) + 0.3 * Math.pow(1 - t, 3),
        z: -2.35 + 4.15 * t,
        rake: 0.3 * (1 - t) * (1 - t),
      };
    };
    const hx = (aa: number, p: ReturnType<typeof prof>) =>
      Math.pow(aa, 0.55) * p.beam;
    const hy = (aa: number, p: ReturnType<typeof prof>) =>
      p.keel + (p.top - p.keel) * Math.pow(aa, 2.3);
    const hz = (aa: number, p: ReturnType<typeof prof>) =>
      p.z - p.rake * Math.pow(aa, 2.3);

    const pos: number[] = [], uv: number[] = [], hcol: number[] = [], idx: number[] = [];
    for (let i = 0; i <= NS; i++) {
      const t = i / NS;
      const p = prof(t);
      for (let j = 0; j <= NR; j++) {
        const a = (j / NR) * 2 - 1;
        const aa = Math.abs(a);
        const x = Math.sign(a) * hx(aa, p);
        const y = hy(aa, p);
        pos.push(x, y, hz(aa, p));
        uv.push(t * 3.2, aa);
        // dark antifouling band at the waterline, subtle plank-to-plank variation
        const band = 1 - smooth(Math.abs(y - 0.06), 0, 0.19);
        const grain = 0.93 + 0.07 * Math.sin(i * 1.3 + j * 0.72);
        hcol.push(grain * (1 - band * 0.5), grain * (1 - band * 0.62), grain * (1 - band * 0.68));
      }
    }
    for (let i = 0; i < NS; i++) {
      for (let j = 0; j < NR; j++) {
        const a = i * (NR + 1) + j;
        const c = a + NR + 1;
        idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    }
    const stern = prof(1);
    const ci = pos.length / 3;
    pos.push(0, stern.keel + (stern.top - stern.keel) * 0.55, stern.z);
    uv.push(3.2, 0.5);
    hcol.push(0.85, 0.85, 0.85);
    for (let j = 0; j < NR; j++) idx.push(NS * (NR + 1) + j, ci, NS * (NR + 1) + j + 1);
    const hullGeo = new THREE.BufferGeometry();
    hullGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    hullGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    hullGeo.setAttribute("color", new THREE.Float32BufferAttribute(hcol, 3));
    hullGeo.setIndex(idx);
    hullGeo.computeVertexNormals();
    boat.add(new THREE.Mesh(hullGeo, hullMat));

    /* ---- deck planks ---- */
    const fpos: number[] = [], fuv: number[] = [], fidx: number[] = [];
    for (let i = 0; i <= NS; i++) {
      const t = i / NS;
      const p = prof(t);
      const y = Math.max(0.26, p.keel + 0.14);
      fpos.push(-p.beam * 0.84, y, p.z, p.beam * 0.84, y, p.z);
      fuv.push(0, t * 3, 1, t * 3);
      if (i < NS) fidx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const floorGeo = new THREE.BufferGeometry();
    floorGeo.setAttribute("position", new THREE.Float32BufferAttribute(fpos, 3));
    floorGeo.setAttribute("uv", new THREE.Float32BufferAttribute(fuv, 2));
    floorGeo.setIndex(fidx);
    floorGeo.computeVertexNormals();
    boat.add(new THREE.Mesh(floorGeo, deckMat));

    /* ---- gunwales, plank strakes, painted waterline ---- */
    for (const side of [-1, 1]) {
      const rail: THREE.Vector3[] = [];
      const inner: THREE.Vector3[] = [];
      for (let i = 0; i <= 18; i++) {
        const p = prof(i / 18);
        rail.push(new THREE.Vector3(side * p.beam, p.top + 0.02, p.z - p.rake));
        inner.push(new THREE.Vector3(side * p.beam * 0.9, p.top - 0.04, p.z - p.rake));
      }
      boat.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 40, 0.055, 7), darkWood));
      boat.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(inner), 40, 0.026, 6), woodMat));
    }
    for (const aa of [0.3, 0.52, 0.72, 0.9]) {
      for (const side of [-1, 1]) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 20; i++) {
          const p = prof(i / 20);
          pts.push(new THREE.Vector3(side * hx(aa, p) * 1.008, hy(aa, p), hz(aa, p)));
        }
        boat.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.011, 4), caulk));
      }
    }
    for (const side of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 20; i++) {
        const p = prof(i / 20);
        const aa = 0.62;
        pts.push(new THREE.Vector3(side * hx(aa, p) * 1.014, hy(aa, p), hz(aa, p)));
      }
      boat.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.021, 5), paint));
    }

    /* ---- visible ribs & stringers inside the hull ---- */
    for (let k = 0; k < 7; k++) {
      const t = 0.14 + k * 0.115;
      const p = prof(t);
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 16; j++) {
        const a = -1 + (j / 16) * 2;
        const aa = Math.abs(a);
        pts.push(new THREE.Vector3(
          Math.sign(a) * hx(aa, p) * 0.88,
          p.keel + 0.055 + (p.top - p.keel - 0.12) * Math.pow(aa, 2.3),
          hz(aa, p),
        ));
      }
      boat.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 26, 0.022, 5), darkWood));
    }

    /* ---- transom, stem, thwarts ---- */
    const transom = new THREE.Mesh(new THREE.BoxGeometry(stern.beam * 1.85, 0.36, 0.075), woodMat);
    transom.position.set(0, stern.top - 0.21, stern.z + 0.035);
    boat.add(transom);
    const transomTrim = new THREE.Mesh(new THREE.BoxGeometry(stern.beam * 1.9, 0.045, 0.095), darkWood);
    transomTrim.position.set(0, stern.top - 0.025, stern.z + 0.035);
    boat.add(transomTrim);
    boat.add(rod(new THREE.Vector3(0, 0.5, -2.32), new THREE.Vector3(0, 1.2, -2.55), 0.042, darkWood));
    for (const t of [0.38, 0.72]) {
      const p = prof(t);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(p.beam * 1.78, 0.075, 0.32), woodMat);
      bench.position.set(0, p.top - 0.15, p.z);
      boat.add(bench);
      for (const side of [-1, 1]) {
        const knee = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.2), darkWood);
        knee.position.set(side * p.beam * 0.72, p.top - 0.23, p.z);
        boat.add(knee);
      }
    }

    /* ---- working gear: crate, barrel, rope coil, bucket, oar ---- */
    const crate = new THREE.Group();
    crate.position.set(0.3, 0.45, 0.34);
    crate.rotation.y = 0.3;
    crate.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.42), woodMat));
    for (let k = 0; k < 3; k++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.025, 0.045), darkWood);
      slat.position.set(0, -0.1 + k * 0.1, 0.215);
      crate.add(slat);
    }
    boat.add(crate);

    const barrel = new THREE.Group();
    barrel.position.set(-0.34, 0.5, 1.2);
    barrel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.155, 0.42, 12), woodMat));
    for (const yy of [-0.13, 0.13]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.171, 0.012, 5, 14), metal);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = yy;
      barrel.add(hoop);
    }
    boat.add(barrel);

    for (let k = 0; k < 3; k++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.105 + k * 0.018, 0.014, 6, 18), ropeMat);
      coil.rotation.x = Math.PI / 2;
      coil.position.set(-0.48, 0.31 + k * 0.025, 0.82);
      boat.add(coil);
    }
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.09, 0.2, 10), woodMat);
    bucket.position.set(0.45, 0.38, 1.02);
    boat.add(bucket);
    const bucketRim = new THREE.Mesh(new THREE.TorusGeometry(0.113, 0.011, 5, 12), metal);
    bucketRim.rotation.x = Math.PI / 2;
    bucketRim.position.set(0.45, 0.48, 1.02);
    boat.add(bucketRim);

    boat.add(rod(new THREE.Vector3(-0.88, 0.76, 0.12), new THREE.Vector3(0.96, 0.69, 1.46), 0.027, darkWood));
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.022, 0.44), woodMat);
    blade.position.set(1.08, 0.685, 1.66);
    blade.rotation.set(0.16, -0.62, 0);
    boat.add(blade);

    /* ---- mast, hoops and standing/running rigging ---- */
    const mastZ = -0.35;
    boat.add(rod(new THREE.Vector3(0, 0.28, mastZ), new THREE.Vector3(0, 3.6, mastZ), 0.05, darkWood));
    for (const yy of [1.15, 2.25, 3.25]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.009, 5, 10), metal);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.set(0, yy, mastZ);
      boat.add(hoop);
    }
    const rigging = new THREE.BufferGeometry();
    rigging.setAttribute("position", new THREE.Float32BufferAttribute([
      0, 3.58, mastZ, 0, 1.2, -2.62,
      0, 3.58, mastZ, 0, 0.75, 1.78,
      0, 3.5, mastZ, 0.92, 0.66, 0.2,
      0, 3.5, mastZ, -0.92, 0.66, 0.2,
      0, 2.8, mastZ, 0, 0.97, 1.8,
      0, 3.2, 1.35, 0, 0.68, 1.7,
    ], 3));
    boat.add(new THREE.LineSegments(rigging, new THREE.LineBasicMaterial({ color: 0x2a2016 })));

    /* ---- woven lateen sails ---- */
    const cloth = makeDetailedClothTexture();
    const sailMat = new THREE.MeshStandardMaterial({
      map: cloth,
      roughness: 0.93,
      side: THREE.DoubleSide,
      emissive: 0xffb070,
      emissiveMap: cloth,
      emissiveIntensity: 0.18,
    });
    this.rig = new THREE.Group();
    this.rig.position.set(0, 0, mastZ);
    this.rig.add(rod(new THREE.Vector3(0, 0.95, 0), new THREE.Vector3(0, 0.93, 1.85), 0.035, darkWood));
    this.rig.add(rod(new THREE.Vector3(0, 2.8, 0), new THREE.Vector3(0, 3.25, 1.4), 0.03, darkWood));
    const main: Sail = {
      geo: makeSailGeometry(SAIL_N),
      c: [
        new THREE.Vector3(0, 1.0, 0.06),
        new THREE.Vector3(0, 0.97, 1.78),
        new THREE.Vector3(0, 2.78, 0.06),
        new THREE.Vector3(0, 3.2, 1.34),
      ],
      k: 1,
    };
    this.rig.add(new THREE.Mesh(main.geo, sailMat));
    boat.add(this.rig);
    const jib: Sail = {
      geo: makeSailGeometry(SAIL_N),
      c: [
        new THREE.Vector3(0, 1.22, -2.58),
        new THREE.Vector3(0, 1.0, -0.72),
        new THREE.Vector3(0, 3.35, -0.42),
        new THREE.Vector3(0, 3.35, -0.42),
      ],
      k: 0.6,
    };
    boat.add(new THREE.Mesh(jib.geo, sailMat));
    this.sails = [main, jib];
    this.updateSails(0.25);

    // masthead pennant (animated in update)
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.Float32BufferAttribute([
      0, 3.58, 0, 0, 3.5, 0, 0, 3.46, 0.44,
      0, 3.58, 0, 0, 3.46, 0.44, 0, 3.57, 0.47,
    ], 3));
    pg.computeVertexNormals();
    this.pennant = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({
      map: cloth,
      color: 0xffbe76,
      emissive: 0xff8a3c,
      emissiveIntensity: 0.28,
      side: THREE.DoubleSide,
    }));
    boat.add(this.pennant);

    /* ---- rudder & tiller ---- */
    const rudderGeo = new THREE.BoxGeometry(0.05, 0.75, 0.42);
    rudderGeo.translate(0, -0.1, 0.21);
    this.rudder = new THREE.Mesh(rudderGeo, darkWood);
    this.rudder.position.set(0, 0.3, 1.8);
    boat.add(this.rudder);
    boat.add(rod(new THREE.Vector3(0, 0.62, 1.8), new THREE.Vector3(0.44, 0.76, 2.18), 0.022, darkWood));

    /* ---- hanging glass lantern with a live flame ---- */
    const hook = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 1.08, -2.58),
      new THREE.Vector3(0, 1.6, -2.78),
      new THREE.Vector3(0, 1.9, -3.02),
      new THREE.Vector3(0, 1.84, -3.22),
    ]);
    boat.add(new THREE.Mesh(new THREE.TubeGeometry(hook, 14, 0.028, 6), metal));

    this.lanternPivot = new THREE.Group();
    this.lanternPivot.position.set(0, 1.84, -3.22);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.1, 8), metal);
    cap.position.y = -0.1;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 6), metal);
    roof.position.y = -0.035;
    this.lanternGlass = new THREE.MeshStandardMaterial({
      color: 0x3a1c08,
      emissive: new THREE.Color(1.0, 0.56, 0.2),
      emissiveIntensity: 4.4,
      roughness: 0.18,
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide,
    });
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.098, 0.22, 8, 1, true), this.lanternGlass);
    glass.position.y = -0.25;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.105, 0.045, 8), metal);
    base.position.y = -0.37;
    const ringH = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 5, 10), metal);
    ringH.position.y = -0.015;
    ringH.rotation.x = Math.PI / 2;
    this.flameMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.032, 0.13, 7),
      new THREE.MeshStandardMaterial({
        color: 0xffd28a,
        emissive: 0xffb43c,
        emissiveIntensity: 5,
        roughness: 0.5,
      }),
    );
    this.flameMesh.position.y = -0.27;
    this.lanternHalo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex,
      color: new THREE.Color(1.0, 0.48, 0.14),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
      fog: false,
    }));
    this.lanternHalo.scale.setScalar(3.3);
    this.lanternHalo.position.y = -0.25;
    this.lanternLight = new THREE.PointLight(0xffa456, 42, 36, 2);
    this.lanternLight.position.y = -0.25;
    this.lanternPivot.add(cap, roof, glass, base, ringH, this.flameMesh, this.lanternHalo, this.lanternLight);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const px = Math.cos(a) * 0.098, pz = Math.sin(a) * 0.098;
      this.lanternPivot.add(rod(
        new THREE.Vector3(px, -0.36, pz),
        new THREE.Vector3(px, -0.14, pz),
        0.008,
        metal,
      ));
    }
    boat.add(this.lanternPivot);

    boat.scale.setScalar(1.15);
    this.boat = boat;
    this.scene.add(boat);
  }

  private updateSails(belly: number) {
    const n = SAIL_N;
    for (const s of this.sails) {
      const attr = s.geo.getAttribute("position") as THREE.BufferAttribute;
      const [T, Cl, H, P] = s.c;
      let i = 0;
      for (let j = 0; j <= n; j++) {
        const v = j / n;
        for (let k = 0; k <= n; k++) {
          const u = k / n;
          const y = lerp(lerp(T.y, Cl.y, u), lerp(H.y, P.y, u), v);
          const z = lerp(lerp(T.z, Cl.z, u), lerp(H.z, P.z, u), v);
          const b = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
          const flutter = Math.sin(u * 7 - this.t * 6.5 + v * 3) * 0.018 * u * (1 - v * 0.4);
          attr.setXYZ(i++, belly * s.k * b + flutter, y, z);
        }
      }
      attr.needsUpdate = true;
      s.geo.computeVertexNormals();
    }
  }

  /* ================= build: pools ================= */

  private buildPools(glowTex: THREE.Texture) {
    // --- wisps ---
    const coreGeo = new THREE.IcosahedronGeometry(0.17, 1);
    for (let i = 0; i < 40; i++) {
      const core = new THREE.Mesh(
        coreGeo,
        new THREE.MeshStandardMaterial({
          color: 0x120c04,
          emissive: new THREE.Color().copy(C.amber),
          emissiveIntensity: 2.2,
          roughness: 0.35,
          fog: false,
        }),
      );
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: new THREE.Color().copy(C.amber),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0.92,
          fog: false,
        }),
      );
      halo.scale.setScalar(2.8);
      const group = new THREE.Group();
      group.add(core, halo);
      group.visible = false;
      this.scene.add(group);
      this.wisps.push({
        group,
        core,
        halo,
        x: 0,
        z: 0,
        phase: Math.random() * 10,
        teal: false,
        active: false,
        orbit: null,
        oang: 0,
        orad: 0,
      });
    }

    // --- rocks ---
    const rockMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.80,
      metalness: 0.08,
    });
    const foamTex = makeFoamRingTexture();
    const foamGeo = new THREE.PlaneGeometry(1, 1);
    foamGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 24; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(this.rockGeos[i % this.rockGeos.length], rockMat);
      const foam = new THREE.Mesh(
        foamGeo,
        new THREE.MeshBasicMaterial({
          map: foamTex,
          color: new THREE.Color(0.85, 0.94, 0.96),
          transparent: true,
          opacity: 0.82,
          depthWrite: false,
        }),
      );
      g.add(body, foam);
      g.visible = false;
      this.scene.add(g);
      this.rocks.push({ group: g, body, foam, x: 0, z: 0, s: 1.6, active: false, passed: false });
    }

    // --- tethered sea mines ---
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x36393e,
      roughness: 0.42,
      metalness: 0.75,
    });
    const rustMat = new THREE.MeshStandardMaterial({
      color: 0x543220,
      roughness: 0.82,
      metalness: 0.35,
    });
    const sphereGeo = new THREE.IcosahedronGeometry(0.68, 2);
    const hornGeo = new THREE.ConeGeometry(0.11, 0.34, 6);
    const chainGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.3, 6);
    const beaconGeo = new THREE.SphereGeometry(0.11, 8, 8);
    const hornDirs = [
      [0, 1, 0],
      [1, 0.35, 0],
      [-1, 0.35, 0],
      [0, 0.35, 1],
      [0, 0.35, -1],
      [0.72, 0.65, 0.72],
      [-0.72, 0.65, 0.72],
      [0.72, 0.65, -0.72],
      [-0.72, 0.65, -0.72],
    ];
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const body = new THREE.Group();
      body.add(new THREE.Mesh(sphereGeo, ironMat));
      for (const [dx, dy, dz] of hornDirs) {
        const dir = new THREE.Vector3(dx, dy, dz).normalize();
        const horn = new THREE.Mesh(hornGeo, rustMat);
        horn.position.copy(dir).multiplyScalar(0.76);
        horn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        body.add(horn);
      }
      const chain = new THREE.Mesh(chainGeo, rustMat);
      chain.position.y = -1.1;
      body.add(chain);

      const beaconMat = new THREE.MeshStandardMaterial({
        color: 0xff1a10,
        emissive: new THREE.Color(1.0, 0.15, 0.08),
        emissiveIntensity: 4.8,
        roughness: 0.2,
        fog: false,
      });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.y = 0.96;
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: new THREE.Color(1.0, 0.18, 0.10),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0.90,
          fog: false,
        }),
      );
      halo.scale.setScalar(2.4);
      halo.position.y = 0.96;
      body.add(beacon, halo);

      g.add(body);
      g.visible = false;
      this.scene.add(g);
      this.mines.push({
        group: g,
        body,
        beacon: beaconMat,
        halo,
        x: 0,
        z: 0,
        phase: Math.random() * 10,
        active: false,
        passed: false,
      });
    }

    // --- rogue breaker waves ---
    const breakerGeo = makeBreakerGeometry(10.5, 4.2);
    const breakerMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.08,
      transparent: true,
      opacity: 0.94,
    });
    const crestFoamGeo = new THREE.PlaneGeometry(10.6, 1.5);
    crestFoamGeo.rotateX(-Math.PI / 2.6);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const crest = new THREE.Mesh(breakerGeo, breakerMat);
      const foamMat = new THREE.MeshBasicMaterial({
        map: foamTex,
        color: new THREE.Color(0.85, 0.92, 0.94),
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const lipFoam = new THREE.Mesh(crestFoamGeo, foamMat);
      lipFoam.position.set(0, 1.65, 0.55);
      g.add(crest, lipFoam);
      g.visible = false;
      this.scene.add(g);
      this.waves.push({
        group: g,
        crest,
        foamMat,
        x: 0,
        z: 0,
        vx: 0,
        vz: 0,
        halfW: 5.1,
        active: false,
        hit: false,
        passed: false,
      });
    }

    // --- driftwood logs ---
    const bark = makeBarkTexture();
    const logMat = new THREE.MeshStandardMaterial({
      map: bark,
      bumpMap: bark,
      bumpScale: 1.4,
      roughness: 0.85,
      metalness: 0.05,
    });
    const logGeo = makeLogGeometry(6.6);
    const stubGeo = new THREE.CylinderGeometry(0.09, 0.14, 0.8, 6);
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const roll = new THREE.Group();
      roll.add(new THREE.Mesh(logGeo, logMat));
      for (let k = 0; k < 2; k++) {
        const stub = new THREE.Mesh(stubGeo, logMat);
        stub.position.set(-1.6 + k * 2.6 + Math.random(), 0.5, 0);
        stub.rotation.set(Math.random() * 6, 0, 0.5 - Math.random());
        stub.position.applyAxisAngle(new THREE.Vector3(1, 0, 0), stub.rotation.x);
        roll.add(stub);
      }
      g.add(roll);
      g.visible = false;
      this.scene.add(g);
      this.logs.push({
        group: g,
        roll,
        x: 0,
        z: 0,
        vx: 0,
        ang: 0,
        half: 3.3,
        active: false,
        hit: false,
        sink: 0,
        minD: 99,
        passed: false,
      });
    }

    // --- star jellies ---
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(1.15, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({
          color: 0x0d3f42,
          emissive: new THREE.Color(0.3, 0.85, 1.0),
          emissiveIntensity: 2.2,
          transparent: true,
          opacity: 0.92,
          roughness: 0.3,
          fog: false,
        }),
      );
      dome.scale.y = 0.78;
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: new THREE.Color(0.3, 0.85, 1.0),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0.55,
          fog: false,
        }),
      );
      glow.scale.setScalar(5.2);
      g.add(dome, glow);
      const tentacles: THREE.Line[] = [];
      for (let k = 0; k < 6; k++) {
        const tg = new THREE.BufferGeometry();
        tg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6 * 3), 3));
        const line = new THREE.Line(
          tg,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(0.5, 1.2, 1.5),
            transparent: true,
            opacity: 0.6,
            fog: false,
          }),
        );
        line.frustumCulled = false;
        g.add(line);
        tentacles.push(line);
      }
      g.visible = false;
      this.scene.add(g);
      this.jellies.push({ group: g, tentacles, x: 0, z: 0, phase: Math.random() * 8, active: false });
    }

    // --- ripple rings ---
    for (let i = 0; i < MAX_RINGS; i++) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.72, 36),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(0.55, 0.6, 0.6),
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);
      this.rings.push({ mesh, age: 0, life: 1, grow: 2, active: false });
    }
  }

  /* ================= build: swimming fishes ================= */

  private buildFishes() {
    const speciesGeos = [
      makeTunaGeometry(),
      makeDoradoGeometry(),
      makeFlyingFishGeometry(),
      makeSnapperGeometry(),
    ];

    const WAVE = /* glsl */ `
      float swimS = clamp((0.53 - position.z) / 1.24, 0.0, 1.0);
      float swimEnv = 0.03 + 0.12 * swimS + 0.85 * swimS * swimS;
      float swimArg = swimS * 5.6 - aSwim.x;
      float swimLat = sin(swimArg) * swimEnv * aSwim.y
        - sin(-aSwim.x) * 0.16 * aSwim.y * (1.0 - swimS) * (1.0 - swimS);
      float swimSlope = -cos(swimArg) * swimEnv * aSwim.y * (5.6 / 1.24);
    `;

    const scaleMap = makeFishScaleTexture();
    this.speciesMeshes = [];
    this.speciesSwim = [];
    this.speciesSwimAttrs = [];

    for (let s = 0; s < FISH_SCHOOLS; s++) {
      const geo = speciesGeos[s % speciesGeos.length];
      const swim = new THREE.InstancedBufferAttribute(new Float32Array(FISH_PER_SCHOOL * 2), 2);
      swim.setUsage(THREE.DynamicDrawUsage);
      this.speciesSwim.push(swim.array as Float32Array);
      this.speciesSwimAttrs.push(swim);
      geo.setAttribute("aSwim", swim);

      const mat = new THREE.MeshStandardMaterial({
        map: scaleMap,
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 0.22,
        metalness: 0.55,
        emissive: new THREE.Color(0x0e3632),
        emissiveIntensity: 0.35,
      });

      mat.onBeforeCompile = (shader) => {
        shader.vertexShader =
          `attribute vec2 aSwim;\nattribute vec2 aFlex;\n` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>
          {
            ${WAVE}
            objectNormal = normalize(vec3(
              objectNormal.x + objectNormal.z * swimSlope,
              objectNormal.y,
              objectNormal.z - objectNormal.x * swimSlope));
          }`,
        );
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          {
            ${WAVE}
            transformed.x += swimLat;
            transformed.z += 0.5 * swimSlope * swimSlope * (0.53 - position.z) * 0.3;
            float scull = sin(aSwim.x * 0.55 + position.z * 6.0);
            transformed.y += scull * aFlex.y * 0.045;
            transformed.x += cos(aSwim.x * 0.55) * aFlex.y * sign(position.x) * 0.018;
          }`,
        );
      };

      const mesh = new THREE.InstancedMesh(geo, mat, FISH_PER_SCHOOL);
      mesh.frustumCulled = false;
      for (let k = 0; k < FISH_PER_SCHOOL; k++) {
        mesh.setColorAt(k, new THREE.Color(1, 1, 1).multiplyScalar(0.92 + Math.random() * 0.16));
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.scene.add(mesh);
      this.speciesMeshes.push(mesh);
    }

    this.fishDummy.rotation.order = "YXZ";

    for (let s = 0; s < FISH_SCHOOLS; s++) {
      this.schools.push({
        x: (s % 2 === 0 ? -1 : 1) * (5 + Math.random() * 10),
        z: -6 - s * 9,
        vx: 0,
        vz: -12,
        phase: Math.random() * 10,
        ampX: 2.5 + Math.random() * 3,
      });
    }
    for (let i = 0; i < FISH_TOTAL; i++) {
      const school = Math.floor(i / FISH_PER_SCHOOL);
      const sc = this.schools[school];
      const k = i % FISH_PER_SCHOOL;
      const ox = ((k % 3) - 1) * 1.5 + (Math.random() - 0.5) * 0.8;
      const oz = (Math.floor(k / 3) - 0.5) * 2.2 + (Math.random() - 0.5) * 0.9;
      const tail = Math.random() * Math.PI * 2;
      this.speciesSwim[school][k * 2] = tail;
      this.speciesSwim[school][k * 2 + 1] = 0.08;

      const isFlyer = school === 2;
      const isDorado = school === 1;
      const isSnapper = school === 3;
      const scale = isFlyer ? 0.95 + Math.random() * 0.35
                  : isDorado ? 1.15 + Math.random() * 0.50
                  : isSnapper ? 1.10 + Math.random() * 0.42
                  : 1.05 + Math.random() * 0.50;

      this.fishes.push({
        school,
        ox,
        oz,
        scale,
        phase: Math.random() * 10,
        agility: isFlyer ? 1.1 : isDorado ? 0.95 : 0.8,
        depth: isFlyer ? -0.01 + Math.random() * 0.03 : -0.02 + Math.random() * 0.06,
        bodyDepth: isDorado ? 1.15 : isSnapper ? 1.25 : isFlyer ? 0.85 : 0.95,
        heading: Math.PI,
        bank: 0,
        pitch: 0,
        vx: 0,
        vz: -12,
        tail,
        amp: 0.08,
        effort: 0.2,
        porp: Math.random() * Math.PI * 2,
        porpRate: isFlyer ? 2.4 : 1.9 + Math.random() * 1.2,
        bob: 0,
        leapT: 0,
        leapDur: isFlyer ? 1.35 : 0.9,
        leapH: isFlyer ? 2.3 : 1.4,
        leapCooldown: isFlyer ? 1.2 + Math.random() * 3.5 : 2.0 + Math.random() * 5.0,
        x: sc.x + ox,
        y: -0.3,
        z: sc.z + oz,
      });
    }
  }

  private resetFishPositions(bx: number, bz: number) {
    for (let s = 0; s < this.schools.length; s++) {
      const sc = this.schools[s];
      sc.x = bx + (s % 2 === 0 ? -1 : 1) * (5 + Math.random() * 9);
      sc.z = bz - 6 - s * 9;
      sc.vx = 0;
      sc.vz = -Math.max(this.speed, 8);
    }
    for (const f of this.fishes) {
      const sc = this.schools[f.school];
      f.x = sc.x + f.ox;
      f.z = sc.z + f.oz;
      f.vx = 0;
      f.vz = sc.vz;
      f.heading = Math.PI;
      f.bank = 0;
      f.pitch = 0;
      f.leapT = 0;
      f.leapCooldown = 1.5 + Math.random() * 5;
    }
  }

  private updateFishes(dt: number, bx: number, bz: number) {
    this.uFishTime.value = this.t;
    const dummy = this.fishDummy;
    const cruiseBase = Math.max(this.speed, 8);

    for (let s = 0; s < this.schools.length; s++) {
      const sc = this.schools[s];
      sc.vz = -cruiseBase * (0.9 + (s % 2) * 0.17);
      sc.vx = Math.cos(this.t * 0.3 + sc.phase) * sc.ampX * 0.6;
      sc.z += sc.vz * dt;
      sc.x = clamp(sc.x + sc.vx * dt, -STEER_RANGE - 6, STEER_RANGE + 6);
      let jump = false;
      if (sc.z > bz + 18) {
        sc.z = bz - (40 + Math.random() * 18);
        jump = true;
      } else if (sc.z < bz - 80) {
        sc.z = bz + 12;
        jump = true;
      }
      if (!jump) continue;
      sc.x = bx + (Math.random() < 0.5 ? -1 : 1) * (4.5 + Math.random() * 10);
      for (const f of this.fishes) {
        if (f.school !== s) continue;
        f.x = sc.x + f.ox;
        f.z = sc.z + f.oz;
        f.vx = sc.vx;
        f.vz = sc.vz;
        f.heading = Math.atan2(f.vx, f.vz);
        f.leapT = 0;
        f.y = this.surf(f.x, f.z) - 0.35;
      }
    }

    for (let i = 0; i < this.fishes.length; i++) {
      const f = this.fishes[i];
      const sc = this.schools[f.school];

      // --- steering: follow a slowly drifting slot in the shoal ---
      const slotX = sc.x + f.ox + Math.sin(this.t * 0.55 + f.phase) * 0.7;
      const slotZ = sc.z + f.oz + Math.cos(this.t * 0.42 + f.phase * 1.3) * 0.9;
      let dvx = sc.vx + (slotX - f.x) * 1.5;
      let dvz = sc.vz + (slotZ - f.z) * 1.5;
      const j0 = f.school * FISH_PER_SCHOOL;
      for (let j = j0; j < j0 + FISH_PER_SCHOOL; j++) {
        if (j === i) continue;
        const o = this.fishes[j];
        const ex = f.x - o.x;
        const ez = f.z - o.z;
        const d2 = ex * ex + ez * ez;
        if (d2 < 1.2 && d2 > 1e-5) {
          const push = (1.2 - d2) * 2.4;
          dvx += ex * push;
          dvz += ez * push;
        }
      }
      // inertia: fish accelerate smoothly instead of snapping to the slot
      const resp = 1 - Math.exp(-2.4 * f.agility * dt);
      const ax = (dvx - f.vx) * resp;
      const az = (dvz - f.vz) * resp;
      f.vx += ax;
      f.vz += az;
      f.x += f.vx * dt;
      f.z += f.vz * dt;

      // --- heading & banking (smooth, wrap-safe) ---
      const yawT = Math.atan2(f.vx, f.vz);
      const dYaw = Math.atan2(Math.sin(yawT - f.heading), Math.cos(yawT - f.heading));
      f.heading += dYaw * (1 - Math.exp(-6 * dt));
      f.bank = damp(f.bank, clamp(dYaw * 2.6, -0.5, 0.5), 3.5, dt);

      // --- tail beat: effort rises when accelerating, turning or leaping ---
      const accel = Math.hypot(ax, az) / Math.max(dt, 1e-4);
      const effortT = clamp(accel / 12 + Math.abs(dYaw) * 3 + (f.leapT > 0 ? 0.85 : 0), 0, 1);
      f.effort = damp(f.effort, effortT, 2.5, dt);
      f.tail += (8.5 + f.effort * 8.5) * dt;
      f.amp = damp(f.amp, (0.075 + f.effort * 0.06) * (f.leapT > 0 ? 1.2 : 1), 4, dt);

      const school = f.school;
      const k = i % FISH_PER_SCHOOL;
      if (this.speciesSwim[school]) {
        this.speciesSwim[school][k * 2] = f.tail;
        this.speciesSwim[school][k * 2 + 1] = f.amp;
      }

      // --- vertical: porpoise along the surface, with occasional full leaps ---
      const waterY = this.surf(f.x, f.z);
      const near = Math.abs(f.z - bz) < 42 && Math.abs(f.x - bx) < 30;
      let vy = 0;
      const isFlyer = school === 2;
      if (f.leapT > 0) {
        f.leapT += dt / f.leapDur;
        if (f.leapT >= 1) {
          f.leapT = 0;
          f.leapCooldown = isFlyer ? 1.2 + Math.random() * 3.5 : 2.5 + Math.random() * 5.0;
          f.y = waterY - 0.12;
          if (near) {
            this.spawnRing(f.x, f.z, isFlyer ? 1.8 : 1.6, 0.9, 0.45);
            this.burst(f.x, waterY + 0.1, f.z, C.foam, 6, 3, 0.12, 0.55, 7, 2);
          }
        } else {
          const lt = f.leapT;
          f.y = waterY - 0.12 + Math.sin(lt * Math.PI) * f.leapH;
          vy = Math.cos(lt * Math.PI) * Math.PI * (f.leapH / f.leapDur);
        }
      } else {
        f.leapCooldown -= dt;
        f.porp += f.porpRate * dt;
        const bob = Math.sin(f.porp);
        const target = waterY + f.depth + bob * 0.12 - this.storm * 0.12;
        const prevY = f.y;
        f.y = damp(f.y, target, 6, dt);
        vy = (f.y - prevY) / Math.max(dt, 1e-4);
        // a small ripple each time the back breaks the surface
        if (near && f.bob < 0 && bob >= 0 && Math.random() < 0.3) {
          this.spawnRing(f.x, f.z, 0.9, 0.7, 0.28);
        }
        f.bob = bob;
        if (f.leapCooldown <= 0 && near && this.storm < 0.55 && bob > 0.35) {
          f.leapT = 0.001;
          f.leapH = isFlyer ? 2.3 + Math.random() * 1.3 : 1.1 + Math.random() * 0.9;
          f.leapDur = isFlyer ? 1.35 + f.leapH * 0.25 : 0.62 + f.leapH * 0.2;
          this.spawnRing(f.x, f.z, isFlyer ? 1.8 : 1.3, 0.85, 0.38);
          this.burst(f.x, waterY + 0.1, f.z, C.foam, 5, 2.6, 0.1, 0.45, 7, 2);
        }
      }

      // pitch follows the real arc: nose up while rising, nose down while falling
      const pitchT = clamp(-Math.atan2(vy, 7.5), -0.9, 0.9);
      f.pitch = damp(f.pitch, pitchT, f.leapT > 0 ? 12 : 5, dt);

      dummy.position.set(f.x, f.y, f.z);
      dummy.rotation.set(f.pitch, f.heading, f.bank);
      dummy.scale.set(f.scale * 0.94, f.scale * f.bodyDepth, f.scale * (0.94 + f.bodyDepth * 0.1));
      dummy.updateMatrix();
      if (this.speciesMeshes[school]) {
        this.speciesMeshes[school].setMatrixAt(k, dummy.matrix);
      }
    }
    for (let s = 0; s < this.speciesMeshes.length; s++) {
      if (this.speciesSwimAttrs[s]) this.speciesSwimAttrs[s].needsUpdate = true;
      if (this.speciesMeshes[s]) this.speciesMeshes[s].instanceMatrix.needsUpdate = true;
    }
  }

  private buildParticles() {
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pVel = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    this.pSize = new Float32Array(MAX_PARTICLES);
    this.pAlpha = new Float32Array(MAX_PARTICLES);
    this.pLife = new Float32Array(MAX_PARTICLES);
    this.pMax = new Float32Array(MAX_PARTICLES);
    this.pGrav = new Float32Array(MAX_PARTICLES);
    this.pDrag = new Float32Array(MAX_PARTICLES);

    const dyn = (arr: Float32Array, n: number) =>
      new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.pGeo = new THREE.BufferGeometry();
    this.pGeo.setAttribute("position", dyn(this.pPos, 3));
    this.pGeo.setAttribute("aColor", dyn(this.pCol, 3));
    this.pGeo.setAttribute("aSize", dyn(this.pSize, 1));
    this.pGeo.setAttribute("aAlpha", dyn(this.pAlpha, 1));
    this.pGeo.setDrawRange(0, 0);

    this.pMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        uniform float uScale;
        varying float vA;
        varying vec3 vC;
        void main() {
          vA = aAlpha;
          vC = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(aSize * uScale / max(0.1, -mv.z), 96.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        varying vec3 vC;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          float a = smoothstep(0.5, 0.05, d) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vC * a, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const points = new THREE.Points(this.pGeo, this.pMat);
    points.frustumCulled = false;
    this.scene.add(points);
  }

  private buildWeather() {
    this.rainN = this.isMobile ? 320 : 640;
    this.rainPos = new Float32Array(this.rainN * 6);
    for (let i = 0; i < this.rainN; i++) {
      const k = i * 6;
      this.rainPos[k] = (Math.random() - 0.5) * 64;
      this.rainPos[k + 1] = -8 + Math.random() * 34;
      this.rainPos[k + 2] = -60 + Math.random() * 66;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute(
      "position",
      new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.rain = new THREE.LineSegments(
      rg,
      new THREE.LineBasicMaterial({
        color: new THREE.Color(0.5, 0.6, 0.68),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
      }),
    );
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);

    const mk = (color: THREE.Color) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array((BOLT_SEG + 1) * 6), 3).setUsage(
          THREE.DynamicDrawUsage,
        ),
      );
      const ix: number[] = [];
      for (let i = 0; i < BOLT_SEG; i++) {
        const a = i * 2;
        ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      g.setIndex(ix);
      const m = new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({
          color,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
        }),
      );
      m.frustumCulled = false;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    this.bolt = mk(new THREE.Color(5, 6, 9));
    this.boltGlow = mk(new THREE.Color(0.2, 0.28, 0.6));
  }

  private buildBiomes() {
    const lh = makeLighthouseGroup();
    this.lighthouse = lh.group;
    this.lighthouseBeam = lh.beamPivot;
    this.lighthouseLight = lh.light;
    this.lighthouse.visible = false;
    this.scene.add(this.lighthouse);

    for (let i = 0; i < 6; i++) {
      const grp = makeShipwreckGroup();
      grp.visible = false;
      this.scene.add(grp);
      this.shipwrecks.push({ group: grp, active: false, x: 0, z: 0, s: 3.5 });
    }

    for (let i = 0; i < 6; i++) {
      const bb = makeBellBuoyGroup();
      bb.group.visible = false;
      this.scene.add(bb.group);
      this.buoys.push({
        group: bb.group,
        light: bb.light,
        active: false,
        x: 0,
        z: 0,
        sounded: false,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private spawnShipwreck() {
    const s = this.shipwrecks.find((q) => !q.active);
    if (!s) return;
    s.active = true;
    s.x = (Math.random() * 2 - 1) * (STEER_RANGE - 2);
    s.z = this.boat.position.z - (90 + Math.random() * 30);
    s.s = 3.2 + Math.random() * 0.8;
    s.group.scale.setScalar(s.s / 3.5);
    s.group.rotation.y = (Math.random() - 0.5) * 0.8;
    s.group.position.set(s.x, this.surf(s.x, s.z) - 0.5, s.z);
    s.group.visible = true;
  }

  private spawnBellBuoy() {
    const b = this.buoys.find((q) => !q.active);
    if (!b) return;
    b.active = true;
    b.x = (Math.random() * 2 - 1) * (STEER_RANGE + 3);
    b.z = this.boat.position.z - (85 + Math.random() * 25);
    b.sounded = false;
    b.phase = Math.random() * Math.PI * 2;
    b.group.position.set(b.x, this.surf(b.x, b.z), b.z);
    b.group.visible = true;
  }

  private hitShipwreck(s: Shipwreck) {
    s.active = false;
    s.group.visible = false;
    const bx = this.boat.position.x;
    const bz = this.boat.position.z;
    const side = bx >= s.x ? 1 : -1;
    this.pushVx = side * 13;
    this.audio.thud();
    this.burst(bx, 0.6, bz - 1.6, C.wood, 24, 6.5, 0.25, 1.0, 9, 1.4);
    this.burst(bx, 0.4, bz - 1.6, C.foam, 16, 5, 0.3, 0.8, 6, 2.2);
    this.damage(22, 0.95, bx, bz);
  }

  /* ================= surface ================= */

  private surf(x: number, z: number): number {
    let h = waveH(x, z, this.t) * this.amp;
    for (const w of this.whirls) {
      if (w.strength <= 0) continue;
      const dx = x - w.x;
      const dz = z - w.z;
      h -= w.strength * WHIRL_DEPTH * Math.exp(-(dx * dx + dz * dz) / (w.r * w.r * WHIRL_K));
    }
    return h;
  }

  /* ================= spawning ================= */

  private spawnWisp(x: number, z: number, forceTeal?: boolean): Wisp | null {
    const w = this.wisps.find((q) => !q.active);
    if (!w) return null;
    for (const r of this.rocks) {
      if (r.active && Math.abs(r.z - z) < r.s + 3 && Math.abs(r.x - x) < r.s + 2.2) {
        x = clamp(r.x + (x >= r.x ? 1 : -1) * (r.s + 3), -STEER_RANGE, STEER_RANGE);
      }
    }
    w.active = true;
    w.x = x;
    w.z = z;
    w.orbit = null;
    w.phase = Math.random() * 10;
    w.teal = forceTeal !== undefined ? forceTeal : Math.random() < 0.22;
    w.group.visible = true;
    const col = w.teal ? C.teal : C.amber;
    (w.core.material as THREE.MeshStandardMaterial).emissive.copy(col);
    (w.halo.material as THREE.SpriteMaterial).color.copy(col);
    w.core.scale.setScalar(w.teal ? 0.85 : 1);
    return w;
  }

  private spawnPattern(atZ?: number) {
    const tune = DIFF_TUNING[this.difficulty];
    const bz = this.boat.position.z;
    const base = atZ ?? bz - (96 + Math.random() * 34);
    let lane = (Math.random() * 2 - 1) * (STEER_RANGE - 2.5);
    // force active steering during runs — avoid handing free wisps dead ahead
    if (atZ === undefined && this.state === "playing") {
      for (let i = 0; i < 3 && Math.abs(lane - this.boat.position.x) < 6; i++) {
        lane = (Math.random() * 2 - 1) * (STEER_RANGE - 2.5);
      }
    }
    const span = tune.wispClusterMax - tune.wispClusterMin + 1;
    const n = tune.wispClusterMin + Math.floor(Math.random() * span);
    const kind = Math.floor(Math.random() * 3);
    if (kind === 0) {
      for (let i = 0; i < n; i++) this.spawnWisp(lane, base - i * 8.2);
    } else if (kind === 1) {
      const dir = lane > 0 ? -1 : 1;
      for (let i = 0; i < n; i++) {
        this.spawnWisp(
          clamp(lane + dir * i * 2.8, -STEER_RANGE + 1.5, STEER_RANGE - 1.5),
          base - i * 7.8,
        );
      }
    } else {
      for (let i = 0; i < n; i++) {
        this.spawnWisp(
          clamp(lane + (i % 2 ? 3.2 : -3.2), -STEER_RANGE + 1.5, STEER_RANGE - 1.5),
          base - i * 8.4,
        );
      }
    }
  }

  private spawnRockAt(x: number, z: number, s: number) {
    const r = this.rocks.find((q) => !q.active);
    if (!r) return;
    r.active = true;
    r.passed = false;
    r.x = x;
    r.z = z;
    r.s = s;
    r.group.visible = true;
    r.group.position.set(x, 0, z);
    r.body.rotation.y = Math.random() * Math.PI * 2;
    r.body.scale.set(s, s * (1.5 + Math.random() * 0.7), s);
    r.body.position.y = -0.25 * s;
    r.foam.scale.setScalar(s * 3.5);
    r.foam.rotation.y = Math.random() * 6;
  }

  private spawnRocks(d: number, dist?: number) {
    const bz = this.boat.position.z;
    const z = bz - (dist ?? 102 + Math.random() * 32);
    if (d > 0.16 && Math.random() < 0.22 + d * 0.42) {
      // reef wall with one narrow gap and a teal reward inside
      const gap = (Math.random() * 2 - 1) * (STEER_RANGE - 5);
      for (let x = -STEER_RANGE - 1; x <= STEER_RANGE + 1; x += 4.8 + Math.random() * 1.2) {
        if (Math.abs(x - gap) < 4.9) continue;
        this.spawnRockAt(
          x + (Math.random() - 0.5),
          z + (Math.random() - 0.5) * 5,
          1.35 + Math.random() * 0.7,
        );
      }
      this.spawnWisp(gap, z, true);
      return;
    }
    let x = (Math.random() * 2 - 1) * (STEER_RANGE - 1);
    const s = 1.45 + Math.random() * (0.95 + d * 0.8);
    for (const w of this.wisps) {
      if (w.active && Math.abs(w.z - z) < 9 && Math.abs(w.x - x) < s + 2.2) {
        x = clamp(w.x + (x > w.x ? 1 : -1) * (s + 4.0), -STEER_RANGE + 1, STEER_RANGE - 1);
      }
    }
    this.spawnRockAt(x, z, s);
    if (Math.random() < 0.35 + d * 0.45) {
      const x2 = clamp(
        x + (Math.random() < 0.5 ? -1 : 1) * (6.2 + Math.random() * 6),
        -STEER_RANGE,
        STEER_RANGE,
      );
      this.spawnRockAt(x2, z - 6 + Math.random() * 12, 1.3 + Math.random() * 0.8);
    }
  }

  private spawnMine(d: number) {
    const m = this.mines.find((q) => !q.active);
    if (!m) return;
    const z = this.boat.position.z - (100 + Math.random() * 28);
    const x = clamp(
      this.boat.position.x + (Math.random() - 0.5) * 20,
      -STEER_RANGE + 1.5,
      STEER_RANGE - 1.5,
    );
    m.active = true;
    m.passed = false;
    m.x = x;
    m.z = z;
    m.phase = Math.random() * 10;
    m.group.visible = true;
    if (!this.mineAlertShown) {
      this.mineAlertShown = true;
      this.cb.onAlert({ text: "Sea mines — keep clear of red beacons", tone: "warn" });
      this.audio.warn();
    }
    // high-risk pairing later in the run
    if (d > 0.35 && Math.random() < 0.45) {
      const m2 = this.mines.find((q) => !q.active);
      if (m2) {
        m2.active = true;
        m2.passed = false;
        m2.x = clamp(x + (x > 0 ? -7.5 : 7.5), -STEER_RANGE + 1.5, STEER_RANGE - 1.5);
        m2.z = z - 8;
        m2.phase = Math.random() * 10;
        m2.group.visible = true;
      }
    }
  }

  private spawnRogueWave(d: number) {
    const rw = this.waves.find((q) => !q.active);
    if (!rw) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    rw.active = true;
    rw.hit = false;
    rw.passed = false;
    rw.halfW = 4.9 + d * 1.1;
    rw.crest.scale.set(rw.halfW / 5.1, 0.9 + d * 0.3, 1);
    rw.x = clamp(this.boat.position.x + (Math.random() - 0.5) * 14, -STEER_RANGE + 3, STEER_RANGE - 3);
    rw.z = this.boat.position.z - 122;
    rw.vx = side * (1.2 + d * 1.4);
    rw.vz = 6.5 + d * 3.5; // rolls toward the boat
    rw.group.visible = true;
    if (!this.waveAlertShown) {
      this.waveAlertShown = true;
      this.cb.onAlert({ text: "Rogue breaker ahead", tone: "warn" });
      this.audio.warn();
    }
  }

  private spawnLog(dist?: number) {
    const l = this.logs.find((q) => !q.active);
    if (!l) return;
    const d = Math.min(1, this.runTime / 140);
    const fromLeft = Math.random() < 0.5;
    const ahead = dist ?? 95 + Math.random() * 30;
    const eta = ahead / Math.max(this.speed, 10);
    l.vx = (fromLeft ? 1 : -1) * (2.6 + Math.random() * 2.8 + d * 2.6);
    const meetX = clamp(this.boat.position.x + (Math.random() - 0.5) * 14, -STEER_RANGE, STEER_RANGE);
    l.x = dist ? meetX : meetX - l.vx * eta;
    l.z = this.boat.position.z - ahead;
    l.ang = (Math.random() - 0.5) * 0.9;
    l.active = true;
    l.hit = false;
    l.sink = 0;
    l.minD = 99;
    l.passed = false;
    l.group.visible = true;
    l.roll.rotation.x = Math.random() * 6;
  }

  private spawnWhirl(dist?: number) {
    const w = this.whirls.find((q) => !q.active);
    if (!w) return;
    const d = Math.min(1, this.runTime / 140);
    w.active = true;
    w.inCore = false;
    w.strength = 1;
    w.r = 7.8 + Math.random() * 1.6 + d * 1.6;
    w.x = (Math.random() * 2 - 1) * (STEER_RANGE - 5);
    w.z = this.boat.position.z - (dist ?? 120 + Math.random() * 20);
    // only 2 risk-reward teal wisps on the outer rim
    for (let i = 0; i < 2; i++) {
      const wisp = this.spawnWisp(w.x, w.z, true);
      if (wisp) {
        wisp.orbit = w;
        wisp.oang = i * Math.PI;
        wisp.orad = w.r * 0.72;
      }
    }
    this.cb.onAlert({ text: "Whirlpool ahead", tone: "warn" });
    this.audio.warn();
  }

  private spawnStrike() {
    const s = this.strikes.find((q) => !q.active);
    if (!s) return;
    const d = Math.min(1, this.runTime / 140);
    s.dur = 1.2 - d * 0.25;
    s.t = s.dur;
    s.active = true;
    s.x = clamp(this.boat.position.x + (Math.random() - 0.5) * 5, -STEER_RANGE, STEER_RANGE);
    s.z = this.boat.position.z - this.speed * s.dur;
    this.audio.sizzle();
  }

  private spawnJelly() {
    const j = this.jellies.find((q) => !q.active);
    if (!j) return;
    j.active = true;
    j.x = (Math.random() * 2 - 1) * (STEER_RANGE - 4);
    j.z = this.boat.position.z - (100 + Math.random() * 30);
    j.phase = Math.random() * 8;
    j.group.visible = true;
  }

  private clearEntities() {
    for (const w of this.wisps) {
      w.active = false;
      w.orbit = null;
      w.group.visible = false;
    }
    for (const r of this.rocks) {
      r.active = false;
      r.group.visible = false;
    }
    for (const m of this.mines) {
      m.active = false;
      m.group.visible = false;
    }
    for (const w of this.waves) {
      w.active = false;
      w.group.visible = false;
    }
    for (const l of this.logs) {
      l.active = false;
      l.group.visible = false;
    }
    for (const j of this.jellies) {
      j.active = false;
      j.group.visible = false;
    }
    for (const ring of this.rings) {
      ring.active = false;
      ring.mesh.visible = false;
    }
    for (const w of this.whirls) {
      w.active = false;
      w.strength = 0;
      this.U.uWhirl.value[w.idx].set(0, 0, 1, 0);
    }
    for (const s of this.strikes) {
      s.active = false;
      this.uStrike[s.idx].w = 0;
    }
    this.boltT = 0;
    this.bolt.visible = false;
    this.boltGlow.visible = false;
    for (const s of this.shipwrecks) {
      s.active = false;
      s.group.visible = false;
    }
    for (const b of this.buoys) {
      b.active = false;
      b.group.visible = false;
      b.sounded = false;
    }
    if (this.lighthouse) this.lighthouse.visible = false;
    this.currentBiome = "dusk";
    this.currentBiomeName = "Dusk Shallows";
    this.lastBiomeAnnounced = "dusk";
    this.lastLighthouseTriggered = 0;
    this.pCount = 0;
    this.pGeo.setDrawRange(0, 0);
  }

  private recycleIsland(g: THREE.Group, z?: number) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const s = 34 + Math.random() * 40;
    const sx = s * (0.95 + Math.random() * 0.5);
    const sy = s * (0.58 + Math.random() * 0.42);
    const sz = s * (0.95 + Math.random() * 0.5);
    g.scale.set(sx, sy, sz);
    g.position.set(
      side * (85 + Math.random() * 155),
      -g.scale.y * 0.16,
      z ?? this.boat.position.z - (360 + Math.random() * 260),
    );
    g.rotation.y = Math.random() * Math.PI * 2;
  }

  /* ================= fx helpers ================= */

  private emit(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    color: THREE.Color, size: number, life: number, grav: number, drag: number,
  ) {
    if (this.pCount >= MAX_PARTICLES) return;
    const k = this.pCount++;
    this.pPos[k * 3] = x;
    this.pPos[k * 3 + 1] = y;
    this.pPos[k * 3 + 2] = z;
    this.pVel[k * 3] = vx;
    this.pVel[k * 3 + 1] = vy;
    this.pVel[k * 3 + 2] = vz;
    this.pCol[k * 3] = color.r;
    this.pCol[k * 3 + 1] = color.g;
    this.pCol[k * 3 + 2] = color.b;
    this.pSize[k] = size;
    this.pLife[k] = life;
    this.pMax[k] = life;
    this.pGrav[k] = grav;
    this.pDrag[k] = drag;
  }

  private burst(
    x: number, y: number, z: number, color: THREE.Color,
    n: number, speed: number, size: number, life: number, grav: number, drag: number,
  ) {
    if (this.isMobile) n = Math.ceil(n * 0.65);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.emit(
        x + (Math.random() - 0.5) * 0.4,
        y + (Math.random() - 0.5) * 0.4,
        z + (Math.random() - 0.5) * 0.4,
        Math.cos(a) * sp,
        (Math.random() * 0.9 + 0.25) * sp,
        Math.sin(a) * sp - this.speed * 0.25,
        color,
        size * (0.6 + Math.random() * 0.8),
        life * (0.6 + Math.random() * 0.6),
        grav,
        drag,
      );
    }
  }

  private spawnRing(x: number, z: number, grow: number, life: number, scale = 1) {
    const r = this.rings.find((q) => !q.active);
    if (!r) return;
    r.active = true;
    r.age = 0;
    r.life = life;
    r.grow = grow;
    r.mesh.visible = true;
    r.mesh.userData.s0 = scale;
    r.mesh.position.set(x, this.surf(x, z) + 0.08, z);
    r.mesh.scale.setScalar(scale);
  }

  private addShake(m: number) {
    if (!this.screenShakeEnabled) return;
    this.shake = Math.min(this.shake + m, 1.7);
  }

  private popup(worldPos: THREE.Vector3, text: string, tone: PopupData["tone"]) {
    this.tmpV.copy(worldPos).project(this.camera);
    if (this.tmpV.z > 1) return;
    this.cb.onPopup({
      x: clamp((this.tmpV.x + 1) * 50, 6, 94),
      y: clamp((1 - this.tmpV.y) * 50, 10, 86),
      text,
      tone,
    });
  }

  private buildBolt(x: number, z: number) {
    const yBot = this.surf(x, z);
    const yTop = 70;
    const walk: number[] = [0];
    const walkZ: number[] = [0];
    for (let i = 1; i <= BOLT_SEG; i++) {
      walk.push(walk[i - 1] + (Math.random() - 0.5) * 6);
      walkZ.push(walkZ[i - 1] + (Math.random() - 0.5) * 2.5);
    }
    const lean = (Math.random() - 0.5) * 16;
    const fill = (mesh: THREE.Mesh, width: number) => {
      const attr = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i <= BOLT_SEG; i++) {
        const f = i / BOLT_SEG;
        const px = x + walk[i] - walk[BOLT_SEG] * f + lean * (1 - f);
        const pz = z + walkZ[i] - walkZ[BOLT_SEG] * f;
        const py = lerp(yTop, yBot, f);
        const wd = width * (1 - f * 0.45);
        attr.setXYZ(i * 2, px - wd, py, pz);
        attr.setXYZ(i * 2 + 1, px + wd, py, pz);
      }
      attr.needsUpdate = true;
    };
    fill(this.bolt, 0.18);
    fill(this.boltGlow, 1.1);
    this.boltT = 0.26;
  }

  /* ================= gameplay events ================= */

  private catchWisp(w: Wisp, scoring: boolean) {
    w.active = false;
    w.orbit = null;
    w.group.visible = false;
    const y = w.group.position.y;
    const x = w.group.position.x;
    const color = w.teal ? C.teal : C.amber;
    this.burst(x, y, w.z, color, 20, 5.5, 0.34, 0.9, 3.5, 2.2);
    this.spawnRing(x, w.z, 2.6, 1.1);
    this.lanternPulse = 1;

    if (!scoring) return;
    const tune = DIFF_TUNING[this.difficulty];
    this.wispsCaught++;
    const gained = Math.round((w.teal ? 30 : 12) * this.combo * tune.scoreMultiplier);
    this.score += gained;
    this.combo = Math.min(this.combo + 1, 12);
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboT = COMBO_WINDOW;
    this.energy = Math.min(100, this.energy + (w.teal ? tune.tealFuel : tune.amberFuel));
    this.audio.chime(this.combo - 2, w.teal);
    this.haptic(w.teal ? 14 : 7);
    this.addShake(0.05);
    this.tmpV2.set(x, y + 0.6, w.z);
    this.popup(this.tmpV2, `+${gained}`, w.teal ? "teal" : "amber");
  }

  private damage(amount: number, shake: number, wx: number, wz: number) {
    if (this.state !== "playing") return;
    this.haptic(amount >= 22 ? [45, 35, 70] : 40);
    this.invulnT = 1.0;
    if (!this.godMode) this.energy = Math.max(0, this.energy - amount);
    this.combo = 1;
    this.comboT = 0;
    this.hullFlash = 1;
    this.addShake(shake);
    this.cb.onFlash("hit");
    this.tmpV2.set(wx, this.boatY + 2.2, wz);
    this.popup(this.tmpV2, `−${amount} LAMP`, "danger");
    if (this.energy <= 0) this.endRun();
  }

  private closeCall() {
    if (this.state !== "playing" || this.invulnT > 0) return;
    const tune = DIFF_TUNING[this.difficulty];
    const bonus = Math.round(45 * this.combo * tune.scoreMultiplier);
    this.score += bonus;
    this.energy = Math.min(100, this.energy + 1.5);
    this.audio.closeCall();
    this.tmpV2.set(this.boat.position.x, this.boatY + 2.4, this.boat.position.z);
    this.popup(this.tmpV2, `CLOSE +${bonus}`, "teal");
  }

  private hitRock(r: Rock) {
    const bx = this.boat.position.x;
    const bz = this.boat.position.z;
    const side = bx >= r.x ? 1 : -1;
    this.pushVx = side * 13;
    this.audio.thud();
    const mx = (bx + r.x) / 2;
    this.burst(mx, 0.6, bz - 1, C.foam, 26, 7, 0.34, 0.9, 7, 2.2);
    this.burst(mx, 0.5, bz - 1, C.wood, 8, 5, 0.2, 0.8, 9, 1.5);
    this.spawnRing(mx, bz - 1, 4, 1.3, 1.4);
    this.damage(20, 0.85, bx, bz);
  }

  private hitMine(m: Mine) {
    m.active = false;
    m.group.visible = false;
    const bx = this.boat.position.x;
    const bz = this.boat.position.z;
    const side = bx >= m.x ? 1 : -1;
    this.pushVx = side * 15;
    this.audio.mineBoom();
    const y = this.surf(m.x, m.z);
    this.burst(m.x, y + 0.6, m.z, C.amber, 32, 10, 0.48, 1.0, 6, 1.8);
    this.burst(m.x, y + 0.4, m.z, C.crimson, 20, 8, 0.4, 0.8, 5, 2.0);
    this.burst(m.x, y + 0.5, m.z, C.foam, 24, 9, 0.36, 1.1, 9, 1.8);
    this.spawnRing(m.x, m.z, 6.5, 1.4, 1.5);
    this.spawnRing(m.x, m.z, 4.2, 1.0, 1.1);
    this.damage(22, 1.15, bx, bz);
  }

  private hitRogueWave(rw: RogueWave) {
    rw.hit = true;
    const bx = this.boat.position.x;
    const bz = this.boat.position.z;
    const side = bx >= rw.x ? 1 : -1;
    this.pushVx = side * 12 + rw.vx * 1.4;
    this.boatVy += 3.2;
    this.audio.waveRoar();
    this.burst(bx, this.boatY + 0.7, bz - 1.5, C.foam, 30, 8, 0.36, 1.0, 8, 2.0);
    this.spawnRing(bx, bz - 1, 5.2, 1.2, 1.3);
    this.damage(16, 0.75, bx, bz);
  }

  private hitLog(l: Log) {
    const bx = this.boat.position.x;
    const bz = this.boat.position.z;
    l.hit = true;
    this.pushVx = clamp(l.vx * 2.2, -11, 11);
    this.audio.crack();
    this.burst(bx, 0.6, bz - 1.6, C.wood, 22, 6.5, 0.22, 1.0, 9, 1.4);
    this.burst(bx, 0.4, bz - 1.6, C.foam, 14, 5, 0.3, 0.8, 6, 2.2);
    this.spawnRing(bx, bz - 1.6, 3.6, 1.2, 1.2);
    this.damage(14, 0.7, bx, bz);
  }

  private fireStrike(s: Strike) {
    s.active = false;
    this.uStrike[s.idx].w = 0;
    this.buildBolt(s.x, s.z);
    this.flash = 1;
    this.cb.onFlash("bolt");
    this.audio.zap();
    this.audio.thunder(0.12);
    this.addShake(0.4);
    const y = this.surf(s.x, s.z);
    this.burst(s.x, y + 0.3, s.z, C.bolt, 34, 9, 0.42, 0.9, 5, 2);
    this.burst(s.x, y + 0.3, s.z, C.foam, 18, 6, 0.4, 1.1, 6, 2);
    this.spawnRing(s.x, s.z, 7, 1.2, 1.6);
    if (this.state !== "playing") return;
    const dist = Math.hypot(s.x - this.boat.position.x, s.z - this.boat.position.z);
    if (dist < STRIKE_R + 0.6) {
      this.damage(24, 1.1, this.boat.position.x, this.boat.position.z);
    } else if (dist < STRIKE_R + 4.5) {
      this.closeCall();
    }
  }

  private catchJelly(j: Jelly) {
    j.active = false;
    j.group.visible = false;
    const tune = DIFF_TUNING[this.difficulty];
    const gained = Math.round(300 * tune.scoreMultiplier);
    this.score += gained;
    this.energy = Math.min(100, this.energy + 20);
    this.slowmoT = 1.1;
    this.timeScale = 0.45;
    this.addShake(0.25);
    this.audio.jelly();
    this.haptic([15, 45, 20]);
    this.cb.onFlash("jelly");
    const y = j.group.position.y;
    this.burst(j.x, y, j.z, C.gold, 46, 7, 0.5, 1.4, 1.5, 1.6);
    this.burst(j.x, y, j.z, C.teal, 16, 4.5, 0.36, 1.2, 2, 1.8);
    this.spawnRing(j.x, j.z, 6, 1.6, 1.6);
    this.spawnRing(j.x, j.z, 4, 1.2, 1);
    this.tmpV2.set(j.x, y + 1.4, j.z);
    this.popup(this.tmpV2, `+${gained} LUMEN`, "gold");
  }

  private endRun() {
    if (this.state !== "playing") return;
    this.overTimer = 0;
    this.stormOn = false;
    this.setState("gameover");
    this.audio.gameOver();
    this.haptic([90, 60, 140]);
    this.addShake(0.2);
    this.cb.onGameOver({
      score: Math.floor(this.score),
      wisps: this.wispsCaught,
      dist: Math.floor(-this.boat.position.z / 10),
      maxCombo: this.maxCombo,
      difficulty: this.difficulty,
      environment: this.environment,
    });
  }

  private setState(s: GameState) {
    this.state = s;
    if (s === "playing") void this.requestWakeLock();
    else this.releaseWakeLock();
    if (s === "playing") this.lastNow = performance.now();
    if (s === "paused") {
      this.audio.setRumble(0);
      this.audio.setRain(0);
      this.lastRumble = 0;
      this.lastRain = 0;
    }
    this.cb.onState(s);
  }

  private distToLog(l: Log, px: number, pz: number): number {
    const ax = Math.cos(l.ang);
    const az = Math.sin(l.ang);
    const dx = px - l.x;
    const dz = pz - l.z;
    const u = clamp(dx * ax + dz * az, -l.half, l.half);
    return Math.hypot(dx - ax * u, dz - az * u);
  }

  /* ================= update ================= */

  private update(rawDt: number) {
    if (!(rawDt > 0)) return;
    if (this.slowmoT > 0) this.slowmoT -= rawDt;
    else this.timeScale += (1 - this.timeScale) * Math.min(1, rawDt * 2.2);
    const dt = rawDt * this.timeScale;
    this.t += dt;
    const U = this.U;
    U.uTime.value = this.t;

    const tune = DIFF_TUNING[this.difficulty];
    const boat = this.boat;
    const menu = this.state === "menu";
    const over = this.state === "gameover";
    if (this.state === "playing") this.runTime += dt;
    const d = menu ? 0 : clamp(this.runTime / 135, 0, 1);

    // ---------- weather ----------
    if (this.state === "playing") {
      this.stormTimer -= dt;
      if (this.stormTimer <= 0) {
        if (this.stormOn) {
          this.stormOn = false;
          this.stormTimer = Math.max(14, 24 - this.runTime * 0.04) + Math.random() * 5;
          this.cb.onAlert({ text: "The squall passes", tone: "calm" });
        } else {
          this.stormOn = true;
          this.stormTimer = 15 + Math.min(9, this.runTime * 0.03);
          this.strikeTimer = 2.8;
          this.cb.onAlert({ text: "Squall — dodge the lightning", tone: "warn" });
          this.audio.warn();
        }
      }
    }
    this.storm = damp(this.storm, this.stormOn ? 1 : 0, 0.6, rawDt);
    if (this.storm < 0.002 && !this.stormOn) this.storm = 0;
    this.amp = 1 + this.storm * 0.8 + d * 0.16;
    this.flash *= Math.exp(-5.5 * rawDt);
    if (this.flash < 0.003) this.flash = 0;
    this.windX = this.storm * 7.8 * Math.sin(this.t * 0.45 + 1.3);
    U.uAmp.value = this.amp;
    U.uStorm.value = this.storm;
    U.uFlash.value = this.flash;
    if (Math.abs(this.storm - this.lastRain) > 0.04) {
      this.lastRain = this.storm;
      this.audio.setRain(this.storm);
    }
    if (this.storm > 0.5) {
      this.ambientBoltT -= dt;
      if (this.ambientBoltT <= 0) {
        this.ambientBoltT = 3.5 + Math.random() * 5;
        this.flash = Math.max(this.flash, 0.42);
        this.audio.thunder(0.6 + Math.random() * 0.8, 0.5);
      }
    }

    // ---------- speed ----------
    if (this.state === "playing") this.speed = tune.baseSpeed + tune.maxExtraSpeed * Math.pow(d, 0.8);
    else if (over) this.speed += (3.5 - this.speed) * Math.min(1, rawDt * 0.8);
    else this.speed += (12 - this.speed) * Math.min(1, rawDt * 2);
    boat.position.z -= this.speed * dt;
    const bz = boat.position.z;
    const distMeters = Math.max(0, Math.floor(-bz / 10));

    // ---------- biomes & atmosphere ----------
    let targetBiome: "dusk" | "abyss" | "graveyard" = "dusk";
    if (distMeters >= 700) targetBiome = "graveyard";
    else if (distMeters >= 400) targetBiome = "abyss";

    if (this.state === "playing" && targetBiome !== this.lastBiomeAnnounced) {
      this.lastBiomeAnnounced = targetBiome;
      this.currentBiome = targetBiome;
      this.currentBiomeName = BIOMES[targetBiome].name;
      this.cb.onAlert({ text: `Entering ${this.currentBiomeName}`, tone: "milestone" });
      this.audio.biomeCue();
    }

    const tb = BIOMES[this.currentBiome];
    const bLerp = Math.min(1, dt * 1.5);
    U.uHorizon.value.lerp(tb.horizon, bLerp);
    U.uMid.value.lerp(tb.mid, bLerp);
    U.uZenith.value.lerp(tb.zenith, bLerp);
    U.uHaze.value.lerp(tb.haze, bLerp);
    U.uSunColor.value.lerp(tb.sunColor, bLerp);
    U.uSunGlare.value = lerp(U.uSunGlare.value, tb.sunGlare, bLerp);
    U.uStarBoost.value = lerp(U.uStarBoost.value, tb.starBoost, bLerp);
    this.uDeepColor.lerp(tb.deep, bLerp);
    this.uScatterColor.lerp(tb.scatter, bLerp);

    const baseFog = tb.fogDensity + this.storm * 0.004;
    this.uFogDensity.value = lerp(this.uFogDensity.value, baseFog, bLerp);
    this.fog.density = this.uFogDensity.value;
    this.fog.color.lerp(tb.fogColor, bLerp).lerp(C.fogStorm, this.storm * 0.9);
    this.hemi.intensity = tb.hemiInt * (1.0 - this.storm * 0.5) + this.flash * 2.2;
    this.sun.intensity = tb.sunInt * (1.0 - this.storm * 0.88);

    // ---------- lighthouse havens (every 200m) ----------
    const nextMilestoneM = Math.floor(distMeters / 200 + 1) * 200;
    const milestoneZ = -nextMilestoneM * 10;
    const distToMilestoneM = (bz - milestoneZ) / 10;

    if (distToMilestoneM < 220 && distToMilestoneM > -30) {
      this.lighthouse.visible = true;
      this.lighthouse.position.set(34, this.surf(34, milestoneZ) - 2.5, milestoneZ);
      this.lighthouseBeam.rotation.y = this.t * 0.8;
      this.lighthouseLight.intensity = 180;

      if (this.state === "playing" && bz <= milestoneZ && this.lastLighthouseTriggered < nextMilestoneM) {
        this.lastLighthouseTriggered = nextMilestoneM;
        this.audio.foghorn();
        this.energy = Math.min(100, this.energy + 50);
        const havenBonus = 500;
        this.score += havenBonus;
        this.cb.onPopup({
          text: `+${havenBonus} HAVEN`,
          x: 50,
          y: 35,
          tone: "gold",
        });
        this.cb.onAlert({
          text: `Lighthouse Haven · ${nextMilestoneM}m Reached!`,
          tone: "milestone",
        });
        this.lanternPulse = 2.0;
        const bpx = boat.position.x;
        for (let p = 0; p < 26; p++) {
          this.emit(
            bpx + (Math.random() - 0.5) * 3,
            this.boatY + 1.2,
            bz + (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 6,
            2 + Math.random() * 4,
            (Math.random() - 0.5) * 6,
            new THREE.Color("#facc15"),
            0.18,
            1.2,
            6,
            0.5,
          );
        }
      }
    } else {
      if (this.lighthouse) this.lighthouse.visible = false;
    }

    // ---------- currents: whirlpools + crosswind ----------
    let ext = this.windX;
    let rumble = 0;
    let anyCore = false;
    for (const w of this.whirls) {
      if (!w.active) continue;
      if (w.z > bz + 28) {
        w.active = false;
        w.strength = 0;
        U.uWhirl.value[w.idx].set(0, 0, 1, 0);
        continue;
      }
      U.uWhirl.value[w.idx].set(w.x, w.z, w.r, w.strength);
      const dx = w.x - boat.position.x;
      const dz = w.z - bz;
      const dist = Math.hypot(dx, dz);
      rumble = Math.max(rumble, 1 - dist / (w.r * 4.5));
      if (this.state !== "playing") continue;
      const reach = w.r * 1.85;
      if (dist < reach) ext += (dx / Math.max(dist, 0.6)) * 18.5 * (1 - dist / reach);
      const inCore = dist < w.r * 0.44;
      if (inCore) {
        anyCore = true;
        if (!this.godMode) this.energy -= 22 * dt;
        if (this.screenShakeEnabled) this.shake = Math.max(this.shake, 0.38);
        if (!w.inCore) {
          this.haptic(60);
          this.combo = 1;
          this.comboT = 0;
          this.cb.onFlash("hit");
          this.audio.thud();
          this.tmpV2.set(boat.position.x, this.boatY + 2.2, bz);
          this.popup(this.tmpV2, "DRAGGED UNDER", "danger");
        }
        if (Math.random() < 0.5)
          this.burst(boat.position.x, this.boatY + 0.3, bz, C.foam, 1, 5, 0.3, 0.7, 6, 2);
      }
      w.inCore = inCore;
      if (dist < 80 && Math.random() < 0.6) {
        const a = Math.random() * Math.PI * 2;
        const rr = w.r * (0.25 + Math.random() * 0.6);
        const px = w.x + Math.cos(a) * rr;
        const pz = w.z + Math.sin(a) * rr;
        this.emit(px, this.surf(px, pz) + 0.15, pz, -Math.sin(a) * 5, 1 + Math.random(), Math.cos(a) * 5, C.spray, 0.22, 0.7, 3, 1.5);
      }
    }
    this.coreAmt = damp(this.coreAmt, anyCore ? 1 : 0, 6, dt);
    rumble = clamp(rumble, 0, 1);
    if (Math.abs(rumble - this.lastRumble) > 0.04) {
      this.lastRumble = rumble;
      this.audio.setRumble(rumble);
    }

    // ---------- steering ----------
    if (this.state === "playing") {
      if (!this.pointerDown) {
        const dir = (this.keyL ? -1 : 0) + (this.keyR ? 1 : 0);
        if (this.touchControl === "tilt" && this.tiltReady && dir === 0) {
          const tl = this.tiltRaw - this.tiltZero;
          const dz = Math.abs(tl) < 1.5 ? 0 : tl - Math.sign(tl) * 1.5;
          this.kbX = clamp((dz / 18) * STEER_RANGE + ext * 0.35, -STEER_RANGE, STEER_RANGE);
        } else {
          this.kbX = clamp(
            this.kbX + (dir * 32 + ext * 0.85 + this.pushVx) * dt,
            -STEER_RANGE,
            STEER_RANGE,
          );
        }
      }
    } else if (menu) {
      let best: Wisp | null = null;
      let bd = Infinity;
      for (const w of this.wisps) {
        if (!w.active) continue;
        const dz = w.z - bz;
        if (dz > -70 && dz < -6) {
          const sc = Math.abs(w.x - boat.position.x) - dz * 0.05;
          if (sc < bd) {
            bd = sc;
            best = w;
          }
        }
      }
      const want = best ? best.x : Math.sin(this.t * 0.35) * 8;
      this.kbX += clamp(want - this.kbX, -1, 1) * 14 * dt;
      this.kbX = clamp(this.kbX, -STEER_RANGE, STEER_RANGE);
    }
    const targetX = this.pointerDown && !menu ? this.pointerX + ext * 0.3 : this.kbX;
    const prevX = boat.position.x;
    let nx = damp(prevX, clamp(targetX, -STEER_RANGE, STEER_RANGE), 5.4, dt);
    nx += this.pushVx * dt;
    this.pushVx *= Math.exp(-4 * dt);
    boat.position.x = clamp(nx, -STEER_RANGE - 1, STEER_RANGE + 1);
    const vx = (boat.position.x - prevX) / Math.max(dt, 0.0001);
    this.vxSmooth = damp(this.vxSmooth, vx, 5, dt);
    const bx = boat.position.x;

    // ---------- buoyancy ----------
    const targetY = this.surf(bx, bz) + 0.03;
    this.boatVy += ((targetY - this.boatY) * 110 - this.boatVy * 14) * dt;
    this.boatY += this.boatVy * dt;
    boat.position.y = this.boatY;
    const pitch = Math.atan2(this.surf(bx, bz - 1.9) - this.surf(bx, bz + 1.7), 3.6);
    const rollW = Math.atan2(this.surf(bx + 0.9, bz) - this.surf(bx - 0.9, bz), 1.8);
    const wob = this.coreAmt;
    boat.rotation.x = damp(boat.rotation.x, pitch * 0.9 + 0.03, 7, dt);
    boat.rotation.z = damp(
      boat.rotation.z,
      rollW * 0.8 - vx * 0.017 - this.windX * 0.012 + Math.sin(this.t * 11) * 0.14 * wob,
      7,
      dt,
    );
    boat.rotation.y = damp(
      boat.rotation.y,
      -vx * 0.012 + Math.sin(this.t * 7.5) * 0.4 * wob,
      7,
      dt,
    );
    this.rudder.rotation.y = clamp(vx * 0.04, -0.6, 0.6);

    let wantBelly = clamp(-vx * 0.04 - this.windX * 0.05, -0.42, 0.42);
    if (Math.abs(wantBelly) < 0.16) wantBelly = 0.16 * (this.belly >= 0 ? 1 : -1);
    this.belly = damp(this.belly, wantBelly, 3, dt);
    this.sheet = damp(this.sheet, clamp(this.belly * 1.6, -0.55, 0.55), 2.5, dt);
    this.rig.rotation.y = this.sheet;
    this.updateSails(this.belly * (1 + this.storm * 0.3));

    const swingT = clamp(vx * 0.022, -0.6, 0.6) - boat.rotation.z;
    this.swingZv += ((swingT - this.swingZ) * 30 - this.swingZv * 2.4) * dt;
    this.swingZ += this.swingZv * dt;
    this.lanternPivot.rotation.z = this.swingZ;
    this.lanternPivot.rotation.x = -boat.rotation.x + Math.sin(this.t * 2.1) * 0.05;
    this.lanternPulse = Math.max(0, this.lanternPulse - dt * 2.4);
    if (over) this.lanternFade = Math.max(0, this.lanternFade - rawDt * 0.5);
    const lampLevel =
      (menu ? 1 : 0.4 + 0.6 * (this.energy / 100)) *
      this.lanternFade *
      (1 + Math.sin(this.t * 9.3) * 0.06 + Math.sin(this.t * 23.7) * 0.04) *
      (1 + this.lanternPulse * 0.8);
    this.lanternLight.intensity = 42 * lampLevel;
    this.lanternGlass.emissiveIntensity = 4.4 * lampLevel;
    if (this.flameMesh) {
      const fl = 0.84 + Math.sin(this.t * 13.7) * 0.15 + Math.sin(this.t * 29.3) * 0.07;
      this.flameMesh.scale.set(1, fl * lampLevel, 1);
      this.flameMesh.rotation.y += dt * 2.2;
    }
    if (this.pennant) {
      this.pennant.rotation.y = Math.sin(this.t * 2.6) * 0.34 + this.windX * 0.012;
      this.pennant.rotation.z = Math.sin(this.t * 4.1) * 0.09;
    }
    this.lanternHalo.scale.setScalar(3.3 * (0.45 + 0.55 * lampLevel));
    (this.lanternHalo.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.82 * lampLevel);
    this.hullFlash = Math.max(0, this.hullFlash - dt * 3);
    this.hullMat.emissive.setRGB(this.hullFlash * 0.5, this.hullFlash * 0.12, this.hullFlash * 0.04);

    // ---------- timers & spawning ----------
    if (this.state === "playing") {
      this.patternTimer -= dt;
      if (this.patternTimer <= 0) {
        this.spawnPattern();
        this.patternTimer = (tune.wispGapBase + d * tune.wispGapExtra + Math.random() * 14) / this.speed;
      }
      this.rockTimer -= dt;
      if (this.rockTimer <= 0) {
        this.spawnRocks(d);
        this.rockTimer = lerp(tune.rockPaceStart, tune.rockPaceEnd, d) + Math.random() * 0.55;
      }
      if (this.runTime > tune.mineUnlock) {
        this.mineTimer -= dt;
        if (this.mineTimer <= 0) {
          this.spawnMine(d);
          this.mineTimer = lerp(tune.minePaceStart, tune.minePaceEnd, d) + Math.random() * 1.4;
        }
      }
      if (this.runTime > tune.logUnlock) {
        this.logTimer -= dt;
        if (this.logTimer <= 0) {
          this.spawnLog();
          this.logTimer = lerp(6.8, 3.2, d) + Math.random() * 2.2;
        }
      }
      if (this.runTime > tune.waveUnlock) {
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) {
          this.spawnRogueWave(d);
          this.waveTimer = lerp(11, 6.2, d) + Math.random() * 3.0;
        }
      }
      if (this.runTime > tune.whirlUnlock) {
        this.whirlTimer -= dt;
        if (this.whirlTimer <= 0) {
          this.spawnWhirl();
          this.whirlTimer = lerp(20, 13, d) + Math.random() * 5;
        }
      }
      this.jellyTimer -= dt;
      if (this.jellyTimer <= 0) {
        this.spawnJelly();
        this.jellyTimer = (this.currentBiome === "abyss" ? 7 : 21) + Math.random() * 8;
      }
      if (this.currentBiome === "graveyard" || distMeters >= 680) {
        this.shipwreckTimer -= dt;
        if (this.shipwreckTimer <= 0) {
          this.spawnShipwreck();
          this.shipwreckTimer = 8 + Math.random() * 6;
        }
        this.buoyTimer -= dt;
        if (this.buoyTimer <= 0) {
          this.spawnBellBuoy();
          this.buoyTimer = 10 + Math.random() * 7;
        }
      }
      if (this.stormOn && this.storm > 0.6) {
        this.strikeTimer -= dt;
        if (this.strikeTimer <= 0) {
          this.spawnStrike();
          this.strikeTimer = 2.3 - d * 0.85 + Math.random();
        }
      }

      const drain = tune.baseDrain + tune.extraDrain * d + this.storm * tune.stormDrain;
      if (!this.godMode) this.energy = Math.max(0, this.energy - drain * dt);
      this.score += this.speed * dt * 0.5 * tune.scoreMultiplier;
      this.comboT = Math.max(0, this.comboT - dt);
      if (this.comboT <= 0 && this.combo > 1) this.combo = 1;
      this.invulnT = Math.max(0, this.invulnT - dt);
      if (this.energy <= 0) this.endRun();
    } else if (menu) {
      this.patternTimer -= dt;
      if (this.patternTimer <= 0) {
        this.spawnPattern();
        this.patternTimer = 2.2 + Math.random();
      }
    }
    const playing = this.state === "playing";

    // ---------- wisps ----------
    const behind = bz + 26;
    for (const w of this.wisps) {
      if (!w.active) continue;
      if (w.orbit) {
        if (!w.orbit.active) {
          w.active = false;
          w.orbit = null;
          w.group.visible = false;
          continue;
        }
        w.oang += dt * 1.15;
        w.x = w.orbit.x + Math.cos(w.oang) * w.orad;
        w.z = w.orbit.z + Math.sin(w.oang) * w.orad;
      }
      if (w.z > behind) {
        w.active = false;
        w.orbit = null;
        w.group.visible = false;
        continue;
      }
      const dz = w.z - bz;
      if (playing && !w.orbit && dz > -8 && dz < 0 && Math.abs(w.x - bx) < tune.magnetRange) {
        w.x += clamp(bx - w.x, -1, 1) * tune.magnetPull * dt;
      }
      const wx = w.x + Math.sin(this.t * 0.7 + w.phase) * 0.3;
      w.group.position.set(
        wx,
        this.surf(w.x, w.z) + 1.3 + Math.sin(this.t * 2 + w.phase) * 0.25,
        w.z,
      );
      w.core.rotation.y += dt * 1.4;
      w.core.rotation.x += dt * 0.7;
      w.halo.scale.setScalar((w.teal ? 2.5 : 2.8) * (1 + Math.sin(this.t * 3 + w.phase) * 0.12));
      const reach = playing ? tune.catchReach : 2.6;
      if ((playing || menu) && dz > -3.4 && dz < 3.4 && Math.abs(wx - bx) < reach) {
        this.catchWisp(w, playing);
      }
    }

    // ---------- rocks ----------
    for (const r of this.rocks) {
      if (!r.active) continue;
      if (r.z > behind) {
        r.active = false;
        r.group.visible = false;
        continue;
      }
      const sy = this.surf(r.x, r.z);
      r.foam.position.y = sy + 0.1;
      r.foam.rotation.y += dt * 0.25;
      (r.foam.material as THREE.MeshBasicMaterial).opacity = 0.62 + Math.sin(this.t * 1.7 + r.x) * 0.2;
      if (!playing) continue;
      const dz = r.z - bz;
      const dx = Math.abs(r.x - bx);
      const hx = r.s * 0.95 + 0.8;
      if (this.invulnT <= 0 && Math.abs(dz) < r.s * 0.95 + 1.9 && dx < hx) {
        this.hitRock(r);
      } else if (!r.passed && dz > r.s + 2.2) {
        r.passed = true;
        if (dx < hx + 1.5) this.closeCall();
      }
    }

    // ---------- sea mines ----------
    for (const m of this.mines) {
      if (!m.active) continue;
      if (m.z > behind) {
        m.active = false;
        m.group.visible = false;
        continue;
      }
      const my = this.surf(m.x, m.z);
      m.group.position.set(m.x, my + Math.sin(this.t * 2.2 + m.phase) * 0.08, m.z);
      m.body.rotation.z = Math.sin(this.t * 1.6 + m.phase) * 0.22;
      m.body.rotation.x = Math.cos(this.t * 1.3 + m.phase) * 0.18;
      m.body.rotation.y += dt * 0.4;
      const pulse = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(this.t * 5.2 + m.phase), 2);
      m.beacon.emissiveIntensity = 1.4 + pulse * 3.8;
      (m.halo.material as THREE.SpriteMaterial).opacity = 0.4 + pulse * 0.55;
      m.halo.scale.setScalar(1.8 + pulse * 1.1);
      if (!playing) continue;
      const dist = Math.hypot(m.x - bx, m.z - bz);
      if (this.invulnT <= 0 && dist < 2.75) {
        this.hitMine(m);
      } else if (!m.passed && m.z > bz + 3.2) {
        m.passed = true;
        if (Math.abs(m.x - bx) < 4.2) this.closeCall();
      }
    }

    // ---------- rogue breaker waves ----------
    for (const rw of this.waves) {
      if (!rw.active) continue;
      if (rw.z > behind + 8) {
        rw.active = false;
        rw.group.visible = false;
        continue;
      }
      rw.x = clamp(rw.x + rw.vx * dt, -STEER_RANGE - 2, STEER_RANGE + 2);
      rw.z += rw.vz * dt;
      const wy = this.surf(rw.x, rw.z);
      rw.group.position.set(rw.x, wy - 0.15, rw.z);
      rw.foamMat.opacity = 0.72 + Math.sin(this.t * 6 + rw.x) * 0.16;
      if (Math.random() < 0.75) {
        const px = rw.x + (Math.random() * 2 - 1) * rw.halfW;
        this.emit(
          px,
          wy + 1.55,
          rw.z + 0.5,
          rw.vx * 0.4 + (Math.random() - 0.5) * 2.5,
          1.2 + Math.random() * 1.8,
          rw.vz * 0.6,
          C.foam,
          0.22 + Math.random() * 0.18,
          0.55,
          6,
          1.5,
        );
      }
      if (!playing || rw.hit) continue;
      const dz = rw.z - bz;
      const dx = Math.abs(rw.x - bx);
      if (this.invulnT <= 0 && Math.abs(dz) < 1.95 && dx < rw.halfW) {
        this.hitRogueWave(rw);
      } else if (!rw.passed && dz > 3.2) {
        rw.passed = true;
        if (dx < rw.halfW + 1.9) this.closeCall();
      }
    }

    // ---------- driftwood ----------
    for (const l of this.logs) {
      if (!l.active) continue;
      if (l.z > behind || l.sink > 1.6) {
        l.active = false;
        l.group.visible = false;
        continue;
      }
      l.x += l.vx * dt;
      const ax = Math.cos(l.ang) * l.half;
      const az = Math.sin(l.ang) * l.half;
      const ly = this.surf(l.x, l.z);
      const tilt = Math.atan2(
        this.surf(l.x + ax, l.z + az) - this.surf(l.x - ax, l.z - az),
        l.half * 2,
      );
      if (l.hit) l.sink += dt;
      l.group.position.set(l.x, ly - 0.14 - l.sink * 1.1, l.z);
      l.group.rotation.set(0, -l.ang, tilt + l.sink * 0.5);
      l.roll.rotation.x += dt * (0.5 + (l.hit ? 4 : 0));
      if (Math.random() < 0.25) {
        const e = Math.random() < 0.5 ? 1 : -1;
        this.emit(l.x + ax * e, ly + 0.15, l.z + az * e, -l.vx * 0.3, 0.8, 1, C.spray, 0.2, 0.6, 3, 2);
      }
      if (!playing || l.hit) continue;
      const dd = Math.min(
        this.distToLog(l, bx, bz),
        this.distToLog(l, bx, bz - 1.8),
        this.distToLog(l, bx, bz + 1.4),
      );
      l.minD = Math.min(l.minD, dd);
      if (this.invulnT <= 0 && dd < 1.25) {
        this.hitLog(l);
      } else if (!l.passed && l.z > bz + 5) {
        l.passed = true;
        if (l.minD < 3.1) this.closeCall();
      }
    }

    // ---------- jellies ----------
    for (const j of this.jellies) {
      if (!j.active) continue;
      if (j.z > behind) {
        j.active = false;
        j.group.visible = false;
        continue;
      }
      const jy = this.surf(j.x, j.z) + 1.8 + Math.sin(this.t * 1.4 + j.phase) * 0.35;
      j.group.position.set(j.x, jy, j.z);
      j.group.rotation.y += dt * 0.5;
      const breathe = 1 + Math.sin(this.t * 2.4 + j.phase) * 0.08;
      j.group.scale.set(breathe, 1 / breathe, breathe);
      for (let k = 0; k < j.tentacles.length; k++) {
        const ang = (k / j.tentacles.length) * Math.PI * 2;
        const px = Math.cos(ang) * 0.8;
        const pz = Math.sin(ang) * 0.8;
        const attr = j.tentacles[k].geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let p = 0; p < 6; p++) {
          const f = p / 5;
          attr.setXYZ(
            p,
            px * (1 - f * 0.35) + Math.sin(this.t * 2 + j.phase + k + f * 3) * 0.22 * f,
            -f * 1.7,
            pz * (1 - f * 0.35) + Math.cos(this.t * 1.7 + j.phase + k) * 0.22 * f,
          );
        }
        attr.needsUpdate = true;
      }
      if (playing) {
        const dz = j.z - bz;
        if (dz > -4.5 && dz < 4.5 && Math.abs(j.x - bx) < 3.1) this.catchJelly(j);
      }
    }

    // ---------- lightning ----------
    for (const s of this.strikes) {
      if (!s.active) continue;
      s.t -= dt;
      if (s.t > 0) {
        this.uStrike[s.idx].set(s.x, s.z, STRIKE_R, 0.45 + (1 - s.t / s.dur) * 0.95);
      } else {
        this.fireStrike(s);
      }
    }
    if (this.boltT > 0) {
      this.boltT -= rawDt;
      const on = this.boltT > 0 && (this.boltT > 0.17 || Math.sin(this.boltT * 95) > -0.2);
      this.bolt.visible = on;
      this.boltGlow.visible = on;
    }

    // ---------- swimming fishes ----------
    this.updateFishes(dt, bx, bz);

    // ---------- shipwrecks ----------
    for (const s of this.shipwrecks) {
      if (!s.active) continue;
      if (s.z > bz + 30) {
        s.active = false;
        s.group.visible = false;
        continue;
      }
      s.group.position.y = this.surf(s.x, s.z) - 0.4;
      if (playing && this.invulnT <= 0) {
        const dz = Math.abs(s.z - bz);
        const dx = Math.abs(s.x - bx);
        if (dz < 4.2 && dx < s.s * 0.9) {
          this.hitShipwreck(s);
        }
      }
    }

    // ---------- bell buoys ----------
    for (const b of this.buoys) {
      if (!b.active) continue;
      if (b.z > bz + 30) {
        b.active = false;
        b.group.visible = false;
        continue;
      }
      b.group.position.y = this.surf(b.x, b.z) - 0.2;
      b.group.rotation.z = Math.sin(this.t * 2.2 + b.phase) * 0.16;
      b.group.rotation.x = Math.cos(this.t * 1.8 + b.phase) * 0.12;
      b.light.intensity = 1.4 + Math.sin(this.t * 6 + b.phase) * 1.0;

      if (!b.sounded && Math.abs(b.z - bz) < 22 && Math.abs(b.x - bx) < 18) {
        b.sounded = true;
        this.audio.bellBuoy();
      }
      if (playing && Math.abs(b.z - bz) < 3.2 && Math.abs(b.x - bx) < 2.2) {
        this.closeCall();
      }
    }

    // ---------- bow spray ----------
    if (this.speed > 6 && !over) {
      this.sprayTimer -= dt;
      if (this.sprayTimer <= 0) {
        this.sprayTimer = this.isMobile ? 0.05 : 0.025;
        for (const side of [-1, 1]) {
          this.emit(
            bx + side * 0.35,
            this.boatY + 0.2,
            bz - 2.3,
            side * (1.2 + Math.random() * 3) + vx * 0.4,
            0.8 + Math.random() * 2.2 + Math.max(0, -this.boatVy) * 0.7,
            2 + Math.random() * 4,
            C.spray,
            0.07 + Math.random() * 0.1,
            0.45 + Math.random() * 0.35,
            7,
            1.2,
          );
        }
      }
    }

    // ---------- rings ----------
    for (const r of this.rings) {
      if (!r.active) continue;
      r.age += dt;
      if (r.age >= r.life) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const f = r.age / r.life;
      r.mesh.scale.setScalar((0.6 + f * r.grow) * (r.mesh.userData.s0 || 1));
      r.mesh.material.opacity = (1 - f) * 0.4;
      r.mesh.position.y = this.surf(r.mesh.position.x, r.mesh.position.z) + 0.08;
    }

    // ---------- particles ----------
    for (let i = this.pCount - 1; i >= 0; i--) {
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) {
        this.removeParticle(i);
        continue;
      }
      const dr = Math.exp(-this.pDrag[i] * dt);
      const k = i * 3;
      this.pVel[k] *= dr;
      this.pVel[k + 1] = this.pVel[k + 1] * dr - this.pGrav[i] * dt;
      this.pVel[k + 2] *= dr;
      this.pPos[k] += this.pVel[k] * dt;
      this.pPos[k + 1] += this.pVel[k + 1] * dt;
      this.pPos[k + 2] += this.pVel[k + 2] * dt;
      this.pAlpha[i] = Math.min(1, (this.pLife[i] / this.pMax[i]) * 1.6);
    }
    this.pGeo.setDrawRange(0, this.pCount);
    this.pGeo.getAttribute("position").needsUpdate = true;
    this.pGeo.getAttribute("aColor").needsUpdate = true;
    this.pGeo.getAttribute("aSize").needsUpdate = true;
    this.pGeo.getAttribute("aAlpha").needsUpdate = true;

    // ---------- camera ----------
    const cam = this.camera;
    if (menu) {
      this.tmpV.set(bx * 0.8 + Math.sin(this.t * 0.12) * 4.5, this.boatY + 5.4, bz + 12.5);
    } else if (over) {
      this.overTimer += rawDt;
      this.tmpV.set(
        bx * 0.8,
        this.boatY + 6.4 + Math.min(3, this.overTimer * 0.8),
        bz + 11.5 + Math.min(5, this.overTimer * 1.4),
      );
    } else {
      this.tmpV.set(bx * 0.86, this.boatY * 0.6 + 6.1, bz + 10.6);
    }
    cam.position.lerp(this.tmpV, 1 - Math.exp(-4.6 * rawDt));
    this.shake *= Math.exp(-3.4 * rawDt);
    if (this.shake < 0.002) this.shake = 0;
    const shX = (Math.random() - 0.5) * this.shake;
    const shY = (Math.random() - 0.5) * this.shake;
    cam.position.x += shX;
    cam.position.y += shY + Math.sin(this.t * 0.5) * 0.06;
    this.tmpV2.set(bx * 1.04 - vx * 0.05, this.boatY * 0.5 + 1.3, bz - 12);
    cam.lookAt(this.tmpV2);
    cam.rotateZ(-this.vxSmooth * 0.004 + shX * 0.05);
    const fov = this.fovBase + ((this.speed - 19) / 17) * 6;
    if (Math.abs(fov - cam.fov) > 0.02) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    this.pMat.uniforms.uScale.value =
      (this.viewH / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2))) *
      this.renderer.getPixelRatio();

    // ---------- scenery & uniforms ----------
    this.waterMesh.position.set(bx, 0, bz - 4);
    this.skyMesh.position.copy(cam.position);
    this.uCloudShift.value = bz * 0.0006;
    this.uBoat.set(bx, bz, this.vxSmooth / Math.max(this.speed, 6), clamp(this.speed / 19, 0, 1.25));
    for (const isle of this.islands) {
      if (isle.position.z > bz - 120) this.recycleIsland(isle);
    }
    boat.updateMatrixWorld();
    this.gatherGlows(bz, lampLevel);
    this.updateRain(dt, cam);

    // ---------- HUD ----------
    if (this.state === "playing") {
      this.cb.onHud({
        score: this.score,
        combo: this.combo,
        comboT: this.comboT,
        energy: this.energy,
        dist: Math.floor(-bz / 10),
        biome: this.currentBiomeName,
      });
    }
  }

  /** Feed the brightest nearby lights (lantern, jellies, mine beacons, wisps) to water shader. */
  private gatherGlows(bz: number, lampLevel: number) {
    const pos = this.uGlowPos;
    const col = this.uGlowCol;
    this.lanternLight.getWorldPosition(this.tmpV);
    pos[0].set(this.tmpV.x, this.tmpV.y, this.tmpV.z, 1.5 * lampLevel);
    col[0].set(1.0, 0.52, 0.2);
    let n = 1;
    for (const j of this.jellies) {
      if (j.active && n < this.NG && Math.abs(j.z - bz) < 70) {
        pos[n].set(j.x, j.group.position.y, j.z, 2.4);
        col[n].set(0.3, 0.85, 1.0);
        n++;
      }
    }
    for (const m of this.mines) {
      if (m.active && n < this.NG && Math.abs(m.z - bz) < 60) {
        pos[n].set(m.x, m.group.position.y + 1.0, m.z, 0.85);
        col[n].set(1.0, 0.16, 0.12);
        n++;
      }
    }
    for (const b of this.buoys) {
      if (b.active && n < this.NG && Math.abs(b.z - bz) < 70) {
        pos[n].set(b.x, b.group.position.y + 2.5, b.z, 1.8);
        col[n].set(0.12, 0.95, 0.55);
        n++;
      }
    }
    let last = -Infinity;
    while (n < this.NG) {
      let best: Wisp | null = null;
      let bd = Infinity;
      for (const w of this.wisps) {
        if (!w.active) continue;
        const dz = w.z - bz;
        const sc = dz > 0 ? dz * 6 : -dz;
        if (sc > last && sc < bd && sc < 70) {
          bd = sc;
          best = w;
        }
      }
      if (!best) break;
      last = bd;
      const p = best.group.position;
      pos[n].set(p.x, p.y, p.z, 0.6);
      const c = best.teal ? C.teal : C.amber;
      col[n].set(c.r, c.g, c.b);
      n++;
    }
    for (; n < this.NG; n++) pos[n].w = 0;
  }

  private updateRain(dt: number, cam: THREE.Camera) {
    const vis = this.storm > 0.03;
    this.rain.visible = vis;
    if (!vis) return;
    (this.rain.material as THREE.LineBasicMaterial).opacity = this.storm * 0.4;
    this.rain.position.copy(cam.position);
    const a = this.rainPos;
    const vx = this.windX * 1.8;
    const vy = -44;
    const vz = this.speed;
    for (let i = 0; i < this.rainN; i++) {
      const k = i * 6;
      let x = a[k] + vx * dt;
      let y = a[k + 1] + vy * dt;
      let z = a[k + 2] + vz * dt;
      if (y < -8) {
        y += 34;
        x = (Math.random() - 0.5) * 64;
        z = -60 + Math.random() * 66;
      }
      if (z > 6) z -= 66;
      if (x > 32) x -= 64;
      else if (x < -32) x += 64;
      a[k] = x;
      a[k + 1] = y;
      a[k + 2] = z;
      a[k + 3] = x - vx * 0.028;
      a[k + 4] = y - vy * 0.028;
      a[k + 5] = z - vz * 0.028;
    }
    this.rain.geometry.getAttribute("position").needsUpdate = true;
  }

  private removeParticle(i: number) {
    const last = this.pCount - 1;
    if (i !== last) {
      for (let c = 0; c < 3; c++) {
        this.pPos[i * 3 + c] = this.pPos[last * 3 + c];
        this.pVel[i * 3 + c] = this.pVel[last * 3 + c];
        this.pCol[i * 3 + c] = this.pCol[last * 3 + c];
      }
      this.pSize[i] = this.pSize[last];
      this.pAlpha[i] = this.pAlpha[last];
      this.pLife[i] = this.pLife[last];
      this.pMax[i] = this.pMax[last];
      this.pGrav[i] = this.pGrav[last];
      this.pDrag[i] = this.pDrag[last];
    }
    this.pCount--;
  }
}

/* ---------------- helpers ---------------- */

function sunDir(): THREE.Vector3 {
  return new THREE.Vector3(-0.38, 0.115, -0.918).normalize();
}

function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, len, 7), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

/** Sculpted oceanic fish facing +Z, tail extending to -Z for GPU swim wave. */
/** Curling ocean breaker wave crest. */
function makeBreakerGeometry(width: number, depth: number): THREE.BufferGeometry {
  const nx = 26;
  const nz = 12;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nz; j++) {
    const v = j / nz; // 0 = back trough, 1 = curling front lip
    for (let i = 0; i <= nx; i++) {
      const u = (i / nx) * 2 - 1; // -1..1 across width
      const taper = 1 - Math.pow(Math.abs(u), 2.8);
      const arch = Math.sin(Math.pow(v, 0.85) * Math.PI * 0.92);
      const curl = v > 0.72 ? (v - 0.72) * 1.4 : 0;
      const n = (fbm3(u * 3.5, v * 3.0, 2.1) - 0.5) * 0.38;
      const x = u * (width * 0.5);
      const y = (arch * 1.95 + n * 0.6) * taper;
      const z = (v - 0.5) * depth + curl * taper;
      pos.push(x, y, z);

      const foam = smooth(v, 0.55, 0.95) * taper;
      col.push(
        lerp(0.05, 0.78, foam),
        lerp(0.24, 0.86, foam),
        lerp(0.29, 0.88, foam),
      );
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const c = a + nx + 1;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Grid that is dense near the boat and stretches out to the horizon. */
function makeWaterGeometry(seg: number, half: number, power: number): THREE.BufferGeometry {
  const n = seg + 1;
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u = (i / seg) * 2 - 1;
      const v = (j / seg) * 2 - 1;
      const k = (j * n + i) * 3;
      pos[k] = Math.sign(u) * Math.pow(Math.abs(u), power) * half;
      pos[k + 2] = Math.sign(v) * Math.pow(Math.abs(v), power) * half;
    }
  }
  const idx = new Uint32Array(seg * seg * 6);
  let q = 0;
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * n + i;
      const c = a + n;
      idx[q++] = a;
      idx[q++] = c;
      idx[q++] = a + 1;
      idx[q++] = a + 1;
      idx[q++] = c;
      idx[q++] = c + 1;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

function makeSailGeometry(n: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const count = (n + 1) * (n + 1);
  const uv = new Float32Array(count * 2);
  const idx: number[] = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const k = j * (n + 1) + i;
      uv[k * 2] = i / n;
      uv[k * 2 + 1] = j / n;
      if (i < n && j < n) idx.push(k, k + 1, k + n + 1, k + 1, k + n + 2, k + n + 1);
    }
  }
  g.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage),
  );
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Noise-carved sea stack with a wet, algae-dark waterline. */
function makeRockGeometry(seed: number): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 5);
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  geo = mergeVertices(geo, 1e-4);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = fbm3(x * 1.7 + seed, y * 1.7 + seed * 1.7, z * 1.7 - seed);
    const n2 = fbm3(x * 5.1 + seed * 3, y * 5.1, z * 5.1 + seed);
    const ridge = 1 - Math.abs(2 * n - 1);
    const r = 0.72 + n * 0.46 + ridge * 0.23 + (n2 - 0.5) * 0.22;
    const taper = 1 - 0.32 * Math.max(0, y);
    let py = y * r * 1.12;
    py += Math.sin(py * 11 + n * 6) * 0.035;
    // weathered sedimentary benches
    py = lerp(py, Math.round(py * 15) / 15, 0.16);
    pos.setXYZ(i, x * r * taper, py, z * r * taper);
    const wet = 1 - smooth(py, -0.06, 0.36);
    const top = smooth(py, 0.45, 0.95);
    const strata = 0.84 + 0.16 * Math.sin(py * 42 + n * 7);
    const b = (0.34 + n2 * 0.20 + top * 0.18) * strata;
    col[i * 3] = b * (1 - wet * 0.45) + top * 0.06;
    col[i * 3 + 1] = b * (1 - wet * 0.30) + wet * 0.025 + top * 0.04;
    col[i * 3 + 2] = b * 1.04 * (1 - wet * 0.22) + wet * 0.035;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

function makeLogGeometry(len: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.42, 0.52, len, 12, 10, false);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = fbm3(x * 2.2 + 3, y * 0.7, z * 2.2) - 0.45;
    pos.setXYZ(i, x * (1 + n * 0.55) + Math.sin(y * 0.5) * 0.16, y, z * (1 + n * 0.55));
  }
  geo.rotateZ(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/* ---------------- procedural textures ---------------- */

function canvasTex(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function makeGlowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.16, "rgba(255,255,255,0.62)");
  grad.addColorStop(0.42, "rgba(255,255,255,0.2)");
  grad.addColorStop(0.7, "rgba(255,255,255,0.05)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return canvasTex(c);
}

function makeBarkTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#523c28";
  g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 280; i++) {
    const x = Math.random() * 256;
    const isMoss = Math.random() < 0.12;
    g.strokeStyle = isMoss
      ? `rgba(45,85,40,${0.2 + Math.random() * 0.3})`
      : Math.random() < 0.55
      ? `rgba(22,14,8,${0.2 + Math.random() * 0.35})`
      : `rgba(165,135,100,${0.1 + Math.random() * 0.22})`;
    g.lineWidth = 0.6 + Math.random() * 2.4;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + (Math.random() - 0.5) * 10, 42, x + (Math.random() - 0.5) * 10, 86, x, 128);
    g.stroke();
  }
  return canvasTex(c, true);
}

function makeFoamRingTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = 62 + Math.pow(Math.random(), 1.8) * 58;
    const fade = 1 - (rr - 62) / 58;
    const x = 128 + Math.cos(a) * rr;
    const y = 128 + Math.sin(a) * rr;
    const s = 2 + Math.random() * 7 * fade;
    const grad = g.createRadialGradient(x, y, 0, x, y, s);
    grad.addColorStop(0, `rgba(255,255,255,${0.12 + fade * 0.4})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(x - s, y - s, s * 2, s * 2);
  }
  return canvasTex(c);
}
