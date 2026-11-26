import * as THREE from "three";

/**
 * Premium boat skins for SeaDrift.
 * Geometry, size, sails, rudder and lantern stay consistent across engine & garage —
 * hull loft profile, rig plan, materials and decorative parts change per level.
 */
export type BoatLevel = 1 | 2 | 3;

export const BOAT_SKIN_INFO: Record<BoatLevel, { name: string; blurb: string }> = {
  1: { name: "Heritage Oak", blurb: "Varnished oak, brass fittings, canvas sail." },
  2: { name: "Teal Voyager", blurb: "Gloss teal lacquer, teak deck, chrome fittings." },
  3: { name: "Starlight Royal", blurb: "Midnight lacquer, gold leaf, glowing rune inlay." },
};

export interface BoatSpec {
  level: BoatLevel;
  name: string;
  blurb: string;
  hpMult: number;
  speedMult: number;
  cost: number;
}

export const BOAT_SPECS: Record<BoatLevel, BoatSpec> = {
  1: {
    level: 1,
    name: BOAT_SKIN_INFO[1].name,
    blurb: BOAT_SKIN_INFO[1].blurb,
    hpMult: 1.0,
    speedMult: 1.0,
    cost: 0,
  },
  2: {
    level: 2,
    name: BOAT_SKIN_INFO[2].name,
    blurb: BOAT_SKIN_INFO[2].blurb,
    hpMult: 1.4,
    speedMult: 1.3,
    cost: 1500,
  },
  3: {
    level: 3,
    name: BOAT_SKIN_INFO[3].name,
    blurb: BOAT_SKIN_INFO[3].blurb,
    hpMult: 1.8,
    speedMult: 1.6,
    cost: 3500,
  },
};

export interface BoatSkin {
  level: BoatLevel;
  wood: THREE.MeshStandardMaterial;
  deck: THREE.MeshStandardMaterial;
  hull: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  caulk: THREE.MeshStandardMaterial;
  paint: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  rope: THREE.MeshStandardMaterial;
  sail: THREE.MeshStandardMaterial;
  cloth: THREE.Texture;
  glow: THREE.MeshStandardMaterial;
}

export interface HullShape {
  prof: (t: number) => { beam: number; top: number; keel: number; z: number; rake: number };
  hx: (aa: number, p: ReturnType<HullShape["prof"]>) => number;
  hy: (aa: number, p: ReturnType<HullShape["prof"]>) => number;
  hz: (aa: number, p: ReturnType<HullShape["prof"]>) => number;
}

/* ---------------- procedural textures ---------------- */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tex(draw: (g: CanvasRenderingContext2D, s: number) => void, size = 512): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

interface WoodOpt {
  hue: number; sat: number; light: number; vary: number;
  planks: number; grain: number; seam: string; seed: number; flake?: number;
}

/** Horizontal planks (long axis = u). */
function woodTexture(o: WoodOpt): THREE.CanvasTexture {
  return tex((g, s) => {
    const r = rng(o.seed);
    const ph = s / o.planks;
    for (let p = 0; p < o.planks; p++) {
      const l = o.light + (r() - 0.5) * o.vary * 100;
      g.fillStyle = `hsl(${o.hue + (r() - 0.5) * 6},${o.sat}%,${l}%)`;
      g.fillRect(0, p * ph, s, ph);
      for (let k = 0; k < o.grain; k++) {
        const y = p * ph + r() * ph;
        g.strokeStyle = `hsla(${o.hue},${o.sat}%,${Math.max(4, l - 14)}%,${0.1 + r() * 0.22})`;
        g.lineWidth = 0.4 + r() * 1.1;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= s; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + k) * 1.6 + (r() - 0.5) * 0.8);
        g.stroke();
      }
      if (r() < 0.45) { // knot
        const kx = r() * s, ky = p * ph + ph * (0.3 + r() * 0.4);
        g.strokeStyle = `hsla(${o.hue},${o.sat}%,${Math.max(4, l - 20)}%,0.5)`;
        for (let q = 1; q < 4; q++) { g.lineWidth = 0.8; g.beginPath(); g.ellipse(kx, ky, q * 4, q * 2, 0, 0, 6.3); g.stroke(); }
      }
      g.fillStyle = o.seam;
      g.fillRect(0, p * ph, s, 2);
    }
    if (o.flake) { // metallic flake speckle for lacquer finishes
      for (let i = 0; i < o.flake; i++) {
        g.fillStyle = `rgba(255,255,255,${r() * 0.16})`;
        g.fillRect(r() * s, r() * s, 1 + r() * 1.5, 1 + r() * 1.5);
      }
    }
  });
}

interface ClothOpt {
  base: string; seam: string; weave: string; edge: string; thread?: string; seed: number;
  stripes?: string; band?: [string, number, number]; emblem?: string;
}

/** Sail cloth: u = foot direction, v = luff direction. Horizontal panel seams, tabling on edges. */
function clothTexture(o: ClothOpt): THREE.CanvasTexture {
  return tex((g, s) => {
    const r = rng(o.seed);
    g.fillStyle = o.base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 2) { // weave
      g.fillStyle = o.weave;
      g.globalAlpha = 0.05 + r() * 0.05;
      g.fillRect(i, 0, 1, s);
      g.fillRect(0, i, s, 1);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 400; i++) { // slub & stains
      g.fillStyle = `rgba(90,70,40,${r() * 0.05})`;
      g.fillRect(r() * s, r() * s, 6 + r() * 26, 1 + r() * 2);
    }
    if (o.stripes) { // vertical stripes across the sail
      g.fillStyle = o.stripes;
      g.globalAlpha = 0.9;
      for (let i = 0; i < 8; i += 2) g.fillRect((i * s) / 8, 0, s / 8, s);
      g.globalAlpha = 1;
    }
    if (o.band) { // horizontal racing band
      g.fillStyle = o.band[0];
      g.fillRect(0, o.band[1] * s, s, (o.band[2] - o.band[1]) * s);
    }
    if (o.emblem) { // crescent moon: outer disc minus an offset inner disc
      g.save();
      g.beginPath(); g.arc(s * 0.5, s * 0.5, s * 0.17, 0, 6.3); g.clip();
      g.beginPath(); g.rect(0, 0, s, s); g.arc(s * 0.57, s * 0.47, s * 0.145, 0, 6.3);
      g.fillStyle = o.emblem; g.fill("evenodd");
      g.restore();
    }
    const panels = 6;
    for (let p = 1; p < panels; p++) {
      const y = (p * s) / panels;
      g.fillStyle = o.seam;
      g.fillRect(0, y - 1, s, 3);
      g.strokeStyle = o.thread ?? o.seam;
      g.lineWidth = 1;
      g.setLineDash([6, 4]);
      for (const dy of [-5, 5]) { g.beginPath(); g.moveTo(0, y + dy); g.lineTo(s, y + dy); g.stroke(); }
      g.setLineDash([]);
    }
    g.fillStyle = o.edge; // tabling along luff and foot
    g.fillRect(0, 0, 14, s);
    g.fillRect(0, s - 16, s, 16);
    g.fillRect(0, 0, s, 12);
    if (o.thread) {
      g.strokeStyle = o.thread;
      g.lineWidth = 2;
      g.strokeRect(20, 20, s - 40, s - 40);
    }
  });
}

/* ---------------- materials per level ---------------- */

export function makeBoatSkin(level: BoatLevel): BoatSkin {
  const DS = THREE.DoubleSide;
  const mk = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const phys = (o: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(o);

  let woodT: THREE.Texture, deckT: THREE.Texture, hullT: THREE.Texture, cloth: THREE.Texture;
  let hull: THREE.MeshStandardMaterial;
  let sail: THREE.MeshStandardMaterial;
  let dark: THREE.MeshStandardMaterial, paint: THREE.MeshStandardMaterial, metal: THREE.MeshStandardMaterial;
  let rope: THREE.MeshStandardMaterial;

  if (level === 1) {
    // Heritage Oak — varnished oak, brass, canvas
    woodT = woodTexture({ hue: 28, sat: 52, light: 38, vary: 0.1, planks: 8, grain: 22, seam: "#1a0f07", seed: 11 });
    hullT = woodTexture({ hue: 26, sat: 58, light: 33, vary: 0.09, planks: 9, grain: 26, seam: "#140b05", seed: 12 });
    deckT = woodTexture({ hue: 36, sat: 46, light: 46, vary: 0.08, planks: 10, grain: 20, seam: "#2a1a0c", seed: 13 });
    hull = phys({ map: hullT, bumpMap: hullT, bumpScale: 0.5, roughness: 0.5, clearcoat: 0.55, clearcoatRoughness: 0.3, vertexColors: true, side: DS });
    dark = mk({ color: 0x3a2413, roughness: 0.7 });
    paint = mk({ color: 0x2b4a3f, roughness: 0.42, metalness: 0.2 });
    metal = mk({ color: 0xb48c3c, roughness: 0.32, metalness: 0.92 });
    rope = mk({ color: 0x9a8258, roughness: 1 });
    cloth = clothTexture({ base: "#efe2c2", seam: "#bfa97c", weave: "#8b7650", edge: "#d6c498", seed: 21 });
    sail = mk({ map: cloth, roughness: 0.93, side: DS, emissive: 0xffb070, emissiveMap: cloth, emissiveIntensity: 0.18 });
  } else if (level === 2) {
    // Teal Voyager — gloss teal lacquer, teak, chrome
    woodT = woodTexture({ hue: 30, sat: 50, light: 36, vary: 0.08, planks: 8, grain: 22, seam: "#1b0f06", seed: 31 });
    hullT = woodTexture({ hue: 184, sat: 66, light: 26, vary: 0.025, planks: 9, grain: 4, seam: "rgba(0,30,34,0.55)", seed: 32, flake: 600 });
    deckT = woodTexture({ hue: 31, sat: 52, light: 42, vary: 0.07, planks: 11, grain: 20, seam: "#e9dcc0", seed: 33 }); // pale caulk lines
    hull = phys({ map: hullT, roughness: 0.26, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, vertexColors: true, side: DS });
    dark = mk({ color: 0x2b1a0e, roughness: 0.62 });
    paint = mk({ color: 0xf1e8d2, roughness: 0.35, metalness: 0.1 });
    metal = mk({ color: 0xdfe6ea, roughness: 0.12, metalness: 1 });
    rope = mk({ color: 0xe8e0cc, roughness: 0.95 });
    cloth = clothTexture({ base: "#f4f1e6", seam: "#cfc9b5", weave: "#9a9482", edge: "#2a8b92", band: ["#2a8b92", 0.66, 0.78], seed: 41 });
    sail = phys({ map: cloth, roughness: 0.82, side: DS, sheen: 0.7, sheenColor: new THREE.Color(0xdff6f4), sheenRoughness: 0.5, emissive: 0xffc890, emissiveMap: cloth, emissiveIntensity: 0.18 });
  } else {
    // Starlight Royal — midnight lacquer, gold leaf, glowing runes
    woodT = woodTexture({ hue: 22, sat: 40, light: 17, vary: 0.05, planks: 8, grain: 26, seam: "#07040a", seed: 51 });
    hullT = woodTexture({ hue: 226, sat: 62, light: 13, vary: 0.02, planks: 9, grain: 3, seam: "rgba(2,4,20,0.7)", seed: 52, flake: 1800 });
    deckT = woodTexture({ hue: 24, sat: 38, light: 22, vary: 0.06, planks: 11, grain: 24, seam: "#c9a45a", seed: 53 }); // gold inlay seams
    hull = phys({ map: hullT, roughness: 0.2, metalness: 0.38, clearcoat: 1, clearcoatRoughness: 0.04, vertexColors: true, side: DS });
    dark = mk({ color: 0x120d0a, roughness: 0.5, metalness: 0.15 });
    paint = mk({ color: 0xd8aa4a, roughness: 0.28, metalness: 0.9 });
    metal = mk({ color: 0xd4a34a, roughness: 0.26, metalness: 1 });
    rope = mk({ color: 0xcaa65a, roughness: 0.7, metalness: 0.2 });
    cloth = clothTexture({ base: "#f7ecd2", seam: "#d9bc78", weave: "#a58d5a", edge: "#caa34f", thread: "#d9b25a", stripes: "#27385f", emblem: "#e2b955", seed: 61 });
    sail = phys({ map: cloth, roughness: 0.6, side: DS, sheen: 1, sheenColor: new THREE.Color(0xfff0c8), sheenRoughness: 0.4, emissive: 0xffc27a, emissiveMap: cloth, emissiveIntensity: 0.3 });
  }

  const wood = mk({ map: woodT, bumpMap: woodT, bumpScale: 0.5, roughness: level === 1 ? 0.5 : 0.45, side: DS });
  const deck = mk({ map: deckT, bumpMap: deckT, bumpScale: 0.4, roughness: 0.78, side: DS });
  deckT.center.set(0.5, 0.5);
  deckT.rotation = Math.PI / 2; // deck planks run fore-aft
  const caulk = mk({ color: 0x140c06, roughness: 1 });
  const glow = mk({ color: 0x0a1a22, emissive: 0x6fe3ff, emissiveIntensity: 2.6, roughness: 0.4, fog: false });

  return { level, wood, deck, hull, dark, caulk, paint, metal, rope, sail, cloth, glow };
}

/* ---------------- hull shapes (same length, beam and height envelope) ---------------- */

const smooth = THREE.MathUtils.smoothstep;
type Prof = ReturnType<HullShape["prof"]>;

/** Level 1 = the original clinker boat. Level 2 = sleek fine-bowed cruiser. Level 3 = double-ended longship. */
export function makeHullShape(level: BoatLevel): HullShape {
  const z = (t: number) => -2.35 + 4.15 * t;
  let prof: HullShape["prof"];
  let ex: [number, number] = [0.55, 2.3];
  if (level === 1) {
    prof = (t) => {
      const fb = Math.pow(Math.sin(Math.min(1, t / 0.6) * Math.PI * 0.5), 0.85);
      const fs = 1 - 0.32 * smooth(t, 0.66, 1);
      return {
        beam: 0.95 * fb * fs,
        top: 0.62 + 0.55 * Math.pow(1 - t, 2.6) + 0.08 * t * t * t,
        keel: -0.34 * (0.25 + 0.75 * fb) + 0.3 * Math.pow(1 - t, 3),
        z: z(t),
        rake: 0.3 * (1 - t) * (1 - t),
      };
    };
  } else if (level === 2) {
    ex = [0.7, 1.7];
    prof = (t) => {
      const fb = Math.pow(Math.sin(Math.min(1, t / 0.52) * Math.PI * 0.5), 1.3);
      const fs = 1 - 0.12 * smooth(t, 0.7, 1);
      return {
        beam: 0.93 * fb * fs,
        top: 0.5 + 0.34 * Math.pow(1 - t, 2.2) + 0.05 * t * t * t,
        keel: -0.3 * (0.3 + 0.7 * fb) + 0.2 * Math.pow(1 - t, 3),
        z: z(t),
        rake: 0.12 * (1 - t) * (1 - t),
      };
    };
  } else {
    ex = [0.5, 2.6];
    prof = (t) => {
      const fb = Math.pow(Math.sin(Math.min(1, t / 0.5) * Math.PI * 0.5), 0.65);
      const fs = 1 - 0.62 * smooth(t, 0.5, 1);
      return {
        beam: 0.95 * fb * fs,
        top: 0.6 + 0.52 * Math.pow(1 - t, 3) + 0.45 * t * t * t,
        keel: -0.3 * (0.25 + 0.75 * fb) + 0.26 * Math.pow(1 - t, 3) + 0.18 * t * t * t,
        z: z(t),
        rake: 0.3 * (1 - t) * (1 - t) - 0.1 * t * t,
      };
    };
  }
  return {
    prof,
    hx: (aa: number, p: Prof) => Math.pow(aa, ex[0]) * p.beam,
    hy: (aa: number, p: Prof) => p.keel + (p.top - p.keel) * Math.pow(aa, ex[1]),
    hz: (aa: number, p: Prof) => p.z - p.rake * Math.pow(aa, 2.3),
  };
}

/* ---------------- sail plans (same mast, same animation hooks) ---------------- */

export interface SailPlan {
  boom: [THREE.Vector3, THREE.Vector3];
  yard?: [THREE.Vector3, THREE.Vector3];
  main: { c: THREE.Vector3[]; k: number };
  jib: { c: THREE.Vector3[]; k: number };
  rig: number[];
}

/** 1 = gaff lateen, 2 = tall Bermuda sloop + genoa, 3 = big square-cut lug sail + staysail. */
export function sailPlan(level: BoatLevel): SailPlan {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const mz = -0.35;
  if (level === 1) {
    return {
      boom: [V(0, 0.95, 0), V(0, 0.93, 1.85)],
      yard: [V(0, 2.8, 0), V(0, 3.25, 1.4)],
      main: { c: [V(0, 1.0, 0.06), V(0, 0.97, 1.78), V(0, 2.78, 0.06), V(0, 3.2, 1.34)], k: 1 },
      jib: { c: [V(0, 1.22, -2.58), V(0, 1.0, -0.72), V(0, 3.35, -0.42), V(0, 3.35, -0.42)], k: 0.6 },
      rig: [0, 3.58, mz, 0, 1.2, -2.62, 0, 3.58, mz, 0, 0.75, 1.78, 0, 3.5, mz, 0.92, 0.66, 0.2,
        0, 3.5, mz, -0.92, 0.66, 0.2, 0, 2.8, mz, 0, 0.97, 1.8, 0, 3.2, 1.35, 0, 0.68, 1.7],
    };
  }
  if (level === 2) {
    return {
      boom: [V(0, 1.02, 0), V(0, 1.0, 1.72)],
      main: { c: [V(0, 1.06, 0.06), V(0, 1.03, 1.66), V(0, 3.5, 0.06), V(0, 3.5, 0.06)], k: 1.1 },
      jib: { c: [V(0, 1.0, -2.5), V(0, 0.95, -0.6), V(0, 3.35, -0.4), V(0, 3.35, -0.4)], k: 0.75 },
      rig: [0, 3.58, mz, 0, 0.9, -2.5, 0, 3.58, mz, 0, 0.6, 1.78, 0, 3.4, mz, 0.7, 0.55, -0.1,
        0, 3.4, mz, -0.7, 0.55, -0.1, 0, 2.3, mz, 0.72, 0.55, -0.1, 0, 2.3, mz, -0.72, 0.55, -0.1],
    };
  }
  return {
    boom: [V(0, 1.12, 0), V(0, 1.08, 1.8)],
    yard: [V(0, 3.52, 0), V(0, 3.46, 1.8)],
    main: { c: [V(0, 1.14, 0.06), V(0, 1.08, 1.78), V(0, 3.5, 0.06), V(0, 3.45, 1.78)], k: 1.25 },
    jib: { c: [V(0, 1.3, -2.5), V(0, 1.1, -1.3), V(0, 3.0, -0.45), V(0, 3.0, -0.45)], k: 0.5 },
    rig: [0, 3.58, mz, 0, 1.25, -2.62, 0, 3.58, mz, 0, 0.75, 1.78, 0, 3.5, mz, 0.92, 0.66, 0.2,
      0, 3.5, mz, -0.92, 0.66, 0.2, 0, 3.0, mz, 0.9, 0.66, -0.9, 0, 3.0, mz, -0.9, 0.66, -0.9],
  };
}

/* ---------------- level-specific parts (inside the same footprint) ---------------- */

export function addBoatDecor(boat: THREE.Group, level: BoatLevel, skin: BoatSkin, hs: HullShape): THREE.Group {
  const { prof, hx, hy, hz } = hs;
  const g = new THREE.Group();
  g.name = "boat-decor";
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const mastZ = -0.35;
  const add = (m: THREE.Object3D, x: number, y: number, z: number) => { m.position.set(x, y, z); g.add(m); return m; };
  const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const cyl = (r: number, h: number, m: THREE.Material, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  const tube = (pts: THREE.Vector3[], r: number, m: THREE.Material) =>
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, r, 6), m));
  const lit = (c: number, i = 2.2) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: i, fog: false, side: THREE.DoubleSide });

  const hullLine = (aa: number, r: number, m: THREE.Material, t0 = 0, t1 = 1, off = 1.016) => {
    for (const side of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 20; i++) {
        const p = prof(t0 + ((t1 - t0) * i) / 20);
        pts.push(V(side * hx(aa, p) * off, hy(aa, p), hz(aa, p)));
      }
      tube(pts, r, m);
    }
  };
  const railLine = (r: number, m: THREE.Material, dy: number) => {
    for (const side of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 18; i++) {
        const p = prof(i / 18);
        pts.push(V(side * p.beam, p.top + dy, p.z - p.rake));
      }
      tube(pts, r, m);
    }
  };
  const cleat = (x: number, y: number, z: number) => {
    const c = new THREE.Group();
    c.add(box(0.05, 0.03, 0.17, skin.metal));
    for (const dz of [-0.06, 0.06]) {
      const horn = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), skin.metal);
      horn.position.set(0, 0.026, dz);
      c.add(horn);
    }
    add(c, x, y, z);
  };
  const band = (y: number, h: number, r = 0.059) => add(cyl(r, h, skin.metal), 0, y, mastZ);

  for (const t of [0.2, 0.88]) {
    const p = prof(t);
    for (const side of [-1, 1]) cleat(side * p.beam * 0.93, p.top + 0.035, p.z - p.rake);
  }
  const st = prof(1);

  if (level === 1) {
    /* Heritage Oak: brass-trimmed clinker rowing boat */
    add(new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), skin.metal), 0, 1.2, -2.55);
    add(box(0.34, 0.075, 0.012, skin.metal), 0, st.top - 0.2, st.z + 0.084);
    band(0.5, 0.05);
    band(3.4, 0.05, 0.056);
    const p = prof(0.55);
    for (const side of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.009, 6, 14), skin.metal);
      ring.rotation.y = Math.PI / 2;
      add(ring, side * p.beam, p.top + 0.1, p.z - p.rake);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.1, 6), skin.metal), side * p.beam, p.top + 0.05, p.z - p.rake);
    }
  } else if (level === 2) {
    /* Teal Voyager: modern cruiser with cuddy cabin, windscreen, helm and nav lights */
    hullLine(0.86, 0.01, skin.paint);
    hullLine(0.5, 0.014, skin.metal, 0.05, 0.95, 1.01);
    const cz = -1.15;
    add(box(1.08, 0.42, 1.02, skin.paint), 0, 0.47, cz);
    add(box(1.14, 0.05, 1.1, skin.wood), 0, 0.7, cz);
    for (const side of [-1, 1]) {
      for (const dz of [-0.3, 0, 0.3]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), lit(0xffb85a, 1.8));
        w.rotation.y = (side * Math.PI) / 2;
        add(w, side * 0.545, 0.52, cz + dz);
      }
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.95, 6), skin.metal), side * 0.4, 0.78, cz).rotation.x = Math.PI / 2;
    }
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x0b2a30, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.72, side: THREE.DoubleSide }),
    );
    glass.rotation.x = 0.6;
    add(glass, 0, 0.82, cz + 0.38);
    const bp = prof(0.78);
    add(box(bp.beam * 1.7, 0.075, 0.3, skin.wood), 0, 0.5, bp.z);
    add(cyl(0.05, 0.42, skin.metal, 10), 0, 0.47, 0.72);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.016, 6, 20), skin.dark);
    wheel.rotation.x = 0.5;
    add(wheel, 0, 0.82, 0.74);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), skin.metal), 0, 0.82, 0.74);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.12, 14), skin.metal);
    add(collar, 0, 0.34, mastZ);
    band(3.45, 0.04, 0.056);
    const np = prof(0.1);
    for (const [side, col] of [[-1, 0xff2a2a], [1, 0x2aff6a]] as const) {
      add(new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), lit(col, 2.6)), side * np.beam * 0.98, np.top + 0.07, np.z - np.rake);
    }
    add(new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), skin.metal), 0, 1.2, -2.55);
  } else {
    /* Starlight Royal: gilded longship with shield row, swan stern post, sea chests, rune glow */
    railLine(0.058, skin.metal, 0.03);
    hullLine(0.9, 0.012, skin.metal);
    hullLine(0.42, 0.009, skin.glow, 0.12, 0.9, 1.02);
    for (const y of [0.45, 1.5, 2.55, 3.45]) band(y, 0.045, 0.058);
    const gs = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.06, V(0, 0.5, -2.32).distanceTo(V(0, 1.2, -2.55)), 8), skin.metal);
    add(gs, 0, 0.85, -2.435).quaternion.setFromUnitVectors(V(0, 1, 0), V(0, 0.7, -0.23).normalize());
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin.glow);
    add(gem, 0, 1.22, -2.56);
    for (const side of [-1, 1]) { // carved scrolls beside the stem
      const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 6, 16, Math.PI * 1.5), skin.metal);
      scroll.rotation.y = Math.PI / 2;
      add(scroll, side * 0.07, 0.95, -2.44);
    }
    for (let k = 0; k < 7; k++) { // shield row
      const p = prof(0.2 + k * 0.095);
      for (const side of [-1, 1]) {
        const sh = new THREE.Group();
        const disc = cyl(0.115, 0.022, k % 2 ? skin.paint : skin.hull, 16);
        disc.rotation.z = Math.PI / 2;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.117, 0.011, 6, 18), skin.metal);
        rim.rotation.y = Math.PI / 2;
        const boss = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 6), skin.metal);
        boss.position.x = side * 0.014;
        sh.add(disc, rim, boss);
        add(sh, side * (p.beam + 0.035), p.top - 0.11, p.z - p.rake);
      }
    }
    // swan-neck stern post with glowing eye
    tube([V(0, 0.7, 1.84), V(0, 1.0, 1.93), V(0, 1.28, 1.9), V(0, 1.42, 1.78), V(0, 1.38, 1.66)], 0.042, skin.metal);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), skin.metal), 0, 1.36, 1.64);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 8), skin.metal);
    beak.rotation.x = -Math.PI / 2;
    add(beak, 0, 1.33, 1.55);
    for (const side of [-1, 1]) add(new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 6), skin.glow), side * 0.05, 1.39, 1.6);
    for (const t of [0.36, 0.62]) { // sea chests
      const p = prof(t);
      add(box(0.62, 0.26, 0.34, skin.dark), 0, 0.4, p.z);
      for (const dz of [-0.11, 0.11]) add(box(0.64, 0.275, 0.03, skin.metal), 0, 0.4, p.z + dz);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), skin.glow), 0, 0.42, p.z + 0.175);
    }
  }

  boat.add(g);
  return g;
}
