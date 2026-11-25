/* Procedural tropical mangrove trees, twisted prop roots & canopy arches for DRIFT.
   All geometry and textures are generated procedurally at startup for WebGL 2.0
   and rendered via InstancedMesh batches for 60 FPS desktop & Android performance. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  let xf = x - xi;
  let yf = y - yi;
  let zf = z - zi;
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

function seededRand(seed: number): () => number {
  let s = Math.sin(seed * 91.345) * 47453.5453;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return Math.abs(s) / 4294967296;
  };
}

/** Generate a realistic wet mangrove bark texture with fissures, lenticels, and moss. */
export function makeMangroveBarkTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 512;
  const g = c.getContext("2d")!;

  // Base warm brown-gray mangrove bark (#49372B)
  const baseGrad = g.createLinearGradient(0, 0, 0, 512);
  baseGrad.addColorStop(0, "#4c3b2e");
  baseGrad.addColorStop(0.65, "#423226");
  baseGrad.addColorStop(1, "#222019"); // wet base darkening
  g.fillStyle = baseGrad;
  g.fillRect(0, 0, 256, 512);

  // Longitudinal bark ridges & fissures
  for (let i = 0; i < 360; i++) {
    const x = Math.random() * 256;
    const w = 0.7 + Math.random() * 2.3;
    const isDark = Math.random() < 0.6;
    g.strokeStyle = isDark
      ? `rgba(24,16,11,${0.25 + Math.random() * 0.35})`
      : `rgba(116,94,76,${0.12 + Math.random() * 0.2})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(
      x + (Math.random() - 0.5) * 14,
      170,
      x + (Math.random() - 0.5) * 14,
      340,
      x + (Math.random() - 0.5) * 8,
      512,
    );
    g.stroke();
  }

  // Characteristic mangrove lenticel pores (horizontal breathing marks)
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 480;
    g.fillStyle = `rgba(140,115,92,${0.18 + Math.random() * 0.22})`;
    g.fillRect(x, y, 4 + Math.random() * 8, 1.3);
  }

  // Organic damp moss & algae mottling
  for (let i = 0; i < 85; i++) {
    const x = Math.random() * 256;
    const y = 90 + Math.random() * 410;
    const r = 6 + Math.random() * 18;
    const mGrad = g.createRadialGradient(x, y, 0, x, y, r);
    mGrad.addColorStop(0, "rgba(26,64,39,0.42)");
    mGrad.addColorStop(1, "rgba(26,64,39,0)");
    g.fillStyle = mGrad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 4);
  tex.anisotropy = 8;
  return tex;
}

/**
 * Create a tapered tubular geometry along a CatmullRomCurve3 with bark/wetness vertex colors.
 * Much more organic than uniform TubeGeometry for mangrove trunks and prop roots.
 */
function buildTaperedBranchGeo(
  points: THREE.Vector3[],
  rStart: number,
  rEnd: number,
  tubularSegs: number,
  radialSegs: number,
  colorFn: (p: THREE.Vector3, t: number) => [number, number, number],
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(tubularSegs, false);

  const pos: number[] = [];
  const norm: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];

  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  const v = new THREE.Vector3();

  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    curve.getPointAt(t, P);
    const nVec = frames.normals[i];
    const bVec = frames.binormals[i];
    const r = lerp(rStart, rEnd, Math.pow(t, 0.85));

    for (let j = 0; j <= radialSegs; j++) {
      const a = (j / radialSegs) * Math.PI * 2;
      const sin = Math.sin(a);
      const cos = -Math.cos(a);

      // Subtle bark fluting
      const flute = 1.0 + 0.08 * Math.sin(a * 3.0 + t * 5.0);
      N.x = cos * nVec.x + sin * bVec.x;
      N.y = cos * nVec.y + sin * bVec.y;
      N.z = cos * nVec.z + sin * bVec.z;
      N.normalize();

      v.copy(P).addScaledVector(N, r * flute);
      pos.push(v.x, v.y, v.z);
      norm.push(N.x, N.y, N.z);
      uv.push(j / radialSegs, t);

      const c = colorFn(v, t);
      col.push(c[0], c[1], c[2]);
    }
  }

  for (let i = 0; i < tubularSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = (radialSegs + 1) * i + j;
      const b = (radialSegs + 1) * (i + 1) + j;
      const c = (radialSegs + 1) * (i + 1) + (j + 1);
      const d = (radialSegs + 1) * i + (j + 1);
      idx.push(a, b, d, b, c, d);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(norm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g.toNonIndexed();
}

/** Vertex coloring function for mangrove bark: dark wet algae near waterline, moss patches higher up. */
function barkColorAt(v: THREE.Vector3): [number, number, number] {
  const n = noise3(v.x * 1.4, v.y * 0.9, v.z * 1.4);
  // Tidal wet zone below y = 0.75
  const wet = 1.0 - clamp((v.y + 0.2) / 0.95, 0, 1);
  // Moss mottling between y = 0.35 and 4.8
  const mossMask = clamp((n - 0.56) * 3.5, 0, 1) * clamp(1 - Math.abs(v.y - 2.2) / 3.0, 0, 1);

  // Base bark #49372B -> linearish [0.28, 0.21, 0.16] with natural variation
  let r = 0.26 + n * 0.08;
  let g = 0.19 + n * 0.06;
  let b = 0.14 + n * 0.05;

  // Blend moss #184027 -> [0.09, 0.25, 0.15]
  r = lerp(r, 0.09, mossMask * 0.72);
  g = lerp(g, 0.26, mossMask * 0.72);
  b = lerp(b, 0.14, mossMask * 0.72);

  // Dark wet algae tint near waterline
  r = lerp(r, 0.07, wet * 0.75);
  g = lerp(g, 0.12, wet * 0.65);
  b = lerp(b, 0.08, wet * 0.7);

  return [r, g, b];
}

/** Prepare an arbitrary geometry with normalized UV and foliage vertex color for clean merging. */
function buildFoliageLobeGeo(
  center: THREE.Vector3,
  sx: number,
  sy: number,
  sz: number,
  seed: number,
): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const ly = pos.getY(i);
    const lz = pos.getZ(i);
    const n = noise3(lx * 2.1 + seed, ly * 2.1 - seed, lz * 2.1 + seed * 0.5);
    const disp = 0.82 + n * 0.36;

    const wx = center.x + lx * sx * disp;
    const wy = center.y + ly * sy * disp;
    const wz = center.z + lz * sz * disp;
    pos.setXYZ(i, wx, wy, wz);

    // Darker deep emerald underside -> moonlit tropical canopy highlights (#123D2A)
    const topFactor = clamp((ly + 0.8) / 1.6, 0, 1);
    const shade = 0.65 + topFactor * 0.55 + (n - 0.5) * 0.18;
    col[i * 3] = 0.065 * shade;
    col[i * 3 + 1] = 0.24 * shade;
    col[i * 3 + 2] = 0.155 * shade;
  }

  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export interface MangroveArchetype {
  barkGeo: THREE.BufferGeometry;
  canopyGeo: THREE.BufferGeometry;
}

/**
 * Build a distinct procedural mangrove tree archetype with gnarled leaning trunk,
 * multi-tiered prop roots plunging underwater, secondary branching roots, hanging vines,
 * and layered foliage crowns. River-facing roots stay within +2.0m local X.
 */
export function makeMangroveArchetype(seed: number): MangroveArchetype {
  const rnd = seededRand(seed);
  const barkParts: THREE.BufferGeometry[] = [];
  const canopyParts: THREE.BufferGeometry[] = [];

  // Local space assumes +X faces the river channel, -X faces deeper forest
  const leanX = 1.0 + rnd() * 1.4;
  const leanZ = (rnd() - 0.5) * 1.6;
  const height = 9.5 + rnd() * 4.0;
  const baseSplitY = 2.6 + rnd() * 1.2;

  // 1. Main leaning irregular trunk
  const trunkPts = [
    new THREE.Vector3(0, baseSplitY - 0.8, 0),
    new THREE.Vector3(leanX * 0.25, baseSplitY + 1.2, leanZ * 0.2),
    new THREE.Vector3(leanX * 0.65, height * 0.58, leanZ * 0.6),
    new THREE.Vector3(leanX * 1.15, height * 0.85, leanZ * 0.9),
    new THREE.Vector3(leanX * 1.45, height, leanZ),
  ];
  barkParts.push(buildTaperedBranchGeo(trunkPts, 0.44 + rnd() * 0.14, 0.14, 10, 7, barkColorAt));

  // 2. Primary spreading upper limbs + canopy crowns
  const limbCount = 3 + Math.floor(rnd() * 2);
  for (let b = 0; b < limbCount; b++) {
    const startT = 0.52 + (b / limbCount) * 0.36;
    const origin = new THREE.CatmullRomCurve3(trunkPts).getPointAt(clamp(startT, 0.4, 0.95));
    const ang = (b / limbCount) * Math.PI * 1.6 - 0.8 + (rnd() - 0.5) * 0.5;
    const reach = 2.6 + rnd() * 2.4;
    const tip = new THREE.Vector3(
      origin.x + Math.cos(ang) * reach * 0.85,
      origin.y + 1.4 + rnd() * 2.2,
      origin.z + Math.sin(ang) * reach,
    );
    const mid = origin.clone().lerp(tip, 0.5);
    mid.y += 0.6 + rnd() * 0.6;
    mid.x += (rnd() - 0.3) * 0.7;

    barkParts.push(buildTaperedBranchGeo([origin, mid, tip], 0.19, 0.06, 6, 5, barkColorAt));

    // Clustered foliage crowns along branch mid and tip
    for (let f = 0; f < 3; f++) {
      const fCenter = f === 0 ? tip.clone() : mid.clone().lerp(tip, 0.45 + f * 0.25);
      fCenter.x += (rnd() - 0.5) * 1.4;
      fCenter.y += (rnd() - 0.3) * 0.7;
      fCenter.z += (rnd() - 0.5) * 1.4;
      canopyParts.push(
        buildFoliageLobeGeo(
          fCenter,
          1.7 + rnd() * 1.1,
          0.95 + rnd() * 0.55,
          1.6 + rnd() * 1.1,
          seed + b * 13 + f * 5,
        ),
      );
    }

    // Hanging vine tendrils (terminating well above boat mast/camera height)
    if (tip.y > 7.4 && rnd() < 0.72) {
      const vineLen = 2.0 + rnd() * 2.1;
      const vx = mid.x + (rnd() - 0.5) * 0.6;
      const vz = mid.z + (rnd() - 0.5) * 0.6;
      const vy0 = mid.y - 0.1;
      barkParts.push(
        buildTaperedBranchGeo(
          [
            new THREE.Vector3(vx, vy0, vz),
            new THREE.Vector3(vx + (rnd() - 0.5) * 0.35, vy0 - vineLen * 0.5, vz + (rnd() - 0.5) * 0.35),
            new THREE.Vector3(vx + (rnd() - 0.5) * 0.2, Math.max(4.4, vy0 - vineLen), vz),
          ],
          0.032,
          0.014,
          5,
          4,
          () => [0.11, 0.23, 0.13],
        ),
      );
    }
  }

  // Crown canopy tuft at trunk apex
  const apex = trunkPts[trunkPts.length - 1];
  canopyParts.push(buildFoliageLobeGeo(apex, 2.2 + rnd() * 0.8, 1.2, 2.1 + rnd() * 0.8, seed + 99));

  // 3. Complex mangrove aerial prop root arches plunging into the water
  const rootCount = 8 + Math.floor(rnd() * 4);
  for (let r = 0; r < rootCount; r++) {
    const ang = (r / rootCount) * Math.PI * 2 + (rnd() - 0.5) * 0.45;
    const attachY = baseSplitY - 0.4 + rnd() * 1.9;
    // Constrain inward (+X) river spread to <= 2.0m so roots never block the navigation lane
    const rawSpread = 1.6 + rnd() * 1.8;
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    const spreadX = cosA > 0 ? Math.min(rawSpread * cosA, 1.95) : rawSpread * cosA;
    const spreadZ = rawSpread * sinA;

    const p0 = new THREE.Vector3(leanX * 0.12, attachY, 0);
    const p1 = new THREE.Vector3(spreadX * 0.62, attachY * 0.58 + 0.35, spreadZ * 0.62);
    const p2 = new THREE.Vector3(spreadX * 0.94, 0.35, spreadZ * 0.94);
    const p3 = new THREE.Vector3(spreadX, -1.7, spreadZ);

    const rRoot = 0.085 + rnd() * 0.065;
    barkParts.push(buildTaperedBranchGeo([p0, p1, p2, p3], rRoot, rRoot * 0.48, 7, 5, barkColorAt));

    // Secondary branching aerial roots forking mid-arch
    if (rnd() < 0.7) {
      const forkStart = p1.clone().lerp(p2, 0.3 + rnd() * 0.3);
      const subSpreadX = clamp(forkStart.x + (rnd() - 0.4) * 1.0, -3.5, 2.0);
      const subSpreadZ = forkStart.z + (rnd() - 0.5) * 1.3;
      barkParts.push(
        buildTaperedBranchGeo(
          [
            forkStart,
            new THREE.Vector3((forkStart.x + subSpreadX) * 0.5, forkStart.y * 0.4, (forkStart.z + subSpreadZ) * 0.5),
            new THREE.Vector3(subSpreadX, -1.6, subSpreadZ),
          ],
          rRoot * 0.62,
          rRoot * 0.32,
          5,
          4,
          barkColorAt,
        ),
      );
    }
  }

  const barkGeo = mergeGeometries(barkParts, false);
  const canopyGeo = mergeGeometries(canopyParts, false);
  for (const p of barkParts) p.dispose();
  for (const p of canopyParts) p.dispose();
  return { barkGeo, canopyGeo };
}

/**
 * Build a tall overarching mangrove root/limb bridge arching high over the river channel.
 * Anchored on the riverbank (x = 0) and peaking at y = 10..13m so it frames the canopy
 * without ever intersecting the boat (y <= 3.6m) or camera (y ~ 6.1m).
 */
export function makeMangroveArchGeometry(seed: number): MangroveArchetype {
  const rnd = seededRand(seed);
  const barkParts: THREE.BufferGeometry[] = [];
  const canopyParts: THREE.BufferGeometry[] = [];

  const spanX = 11.5 + rnd() * 3.5;
  const peakY = 9.8 + rnd() * 2.8;
  const zDrift = (rnd() - 0.5) * 3.2;

  const mainPts = [
    new THREE.Vector3(0, -1.6, 0),
    new THREE.Vector3(spanX * 0.16, 4.2, zDrift * 0.2),
    new THREE.Vector3(spanX * 0.48, peakY * 0.86, zDrift * 0.55),
    new THREE.Vector3(spanX * 0.85, peakY, zDrift * 0.85),
    new THREE.Vector3(spanX * 1.15, peakY - 0.9, zDrift),
  ];
  barkParts.push(buildTaperedBranchGeo(mainPts, 0.34, 0.10, 12, 6, barkColorAt));

  // Secondary intertwined root buttress joining higher on the arch
  const bracePts = [
    new THREE.Vector3(1.1, -1.6, zDrift * 0.25 + 1.2),
    new THREE.Vector3(spanX * 0.24, 3.8, zDrift * 0.35 + 0.5),
    new THREE.Vector3(spanX * 0.55, peakY * 0.88, zDrift * 0.55),
  ];
  barkParts.push(buildTaperedBranchGeo(bracePts, 0.18, 0.08, 7, 5, barkColorAt));

  // Canopy leaf tufts & hanging moss vines high overhead (y >= 7.6m)
  const curve = new THREE.CatmullRomCurve3(mainPts);
  for (let i = 0; i < 4; i++) {
    const t = 0.38 + i * 0.18;
    const pt = curve.getPointAt(t);
    canopyParts.push(
      buildFoliageLobeGeo(
        pt.clone().add(new THREE.Vector3(0, 0.7, (rnd() - 0.5) * 1.1)),
        1.7 + rnd() * 0.7,
        0.85 + rnd() * 0.35,
        1.6 + rnd() * 0.7,
        seed + i * 17,
      ),
    );
    if (pt.y > 9.0) {
      const drop = 1.6 + rnd() * 1.8;
      barkParts.push(
        buildTaperedBranchGeo(
          [
            pt.clone(),
            pt.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.3, -drop * 0.5, (rnd() - 0.5) * 0.3)),
            pt.clone().add(new THREE.Vector3(0, -drop, 0)),
          ],
          0.028,
          0.012,
          4,
          4,
          () => [0.1, 0.22, 0.13],
        ),
      );
    }
  }

  const barkGeo = mergeGeometries(barkParts, false);
  const canopyGeo = mergeGeometries(canopyParts, false);
  for (const p of barkParts) p.dispose();
  for (const p of canopyParts) p.dispose();
  return { barkGeo, canopyGeo };
}

export interface MangroveCorridorParams {
  innerMinX: number;
  innerMaxX: number;
  spacing: number;
  archChance: number;
  scaleMin: number;
  scaleMax: number;
}

/** Distance-driven corridor composition smoothly varying across the 4 Mangrove areas. */
export function getMangroveCorridorParams(distMeters: number): MangroveCorridorParams {
  if (distMeters >= 850) {
    // Area 4 — Ancient Mangrove
    return {
      innerMinX: 18.8,
      innerMaxX: 24.5,
      spacing: 5.2,
      archChance: 0.45,
      scaleMin: 1.22,
      scaleMax: 1.56,
    };
  }
  if (distMeters >= 550) {
    // Area 3 — Bioluminescent Grove
    return {
      innerMinX: 19.6,
      innerMaxX: 26.2,
      spacing: 6.0,
      archChance: 0.24,
      scaleMin: 1.04,
      scaleMax: 1.35,
    };
  }
  if (distMeters >= 250) {
    // Area 2 — Dense Mangrove Passage
    return {
      innerMinX: 18.4,
      innerMaxX: 23.2,
      spacing: 4.9,
      archChance: 0.36,
      scaleMin: 1.0,
      scaleMax: 1.30,
    };
  }
  // Area 1 — Forest Entrance
  return {
    innerMinX: 20.5,
    innerMaxX: 27.0,
    spacing: 6.4,
    archChance: 0.16,
    scaleMin: 0.92,
    scaleMax: 1.18,
  };
}

/** Build a single curved, tapered botanical leaf frond along a radial direction. */
function buildLeafBladeGeo(
  angle: number,
  length: number,
  width: number,
  archHeight: number,
  droopY: number,
  baseCol: [number, number, number],
  tipCol: [number, number, number],
): THREE.BufferGeometry {
  const segs = 5;
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const px = -sinA;
  const pz = cosA;

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const r = t * length;
    const y = Math.sin(t * Math.PI * 0.85) * archHeight + t * t * droopY;
    const w = Math.sin(Math.pow(t, 0.72) * Math.PI) * width * 0.5 + (i === 0 ? 0.03 : 0);

    const cx = cosA * r;
    const cz = sinA * r;
    const cr = lerp(baseCol[0], tipCol[0], t);
    const cg = lerp(baseCol[1], tipCol[1], t);
    const cb = lerp(baseCol[2], tipCol[2], t);

    // Left, center midrib (slightly raised), right
    pos.push(cx - px * w, y - 0.03 * w, cz - pz * w);
    pos.push(cx, y + 0.05 * w, cz);
    pos.push(cx + px * w, y - 0.03 * w, cz + pz * w);

    for (let k = 0; k < 3; k++) {
      col.push(cr, cg, cb);
      uv.push(k * 0.5, t);
    }

    if (i < segs) {
      const a = i * 3;
      const b = (i + 1) * 3;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
      idx.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const nonIdx = g.toNonIndexed();
  g.dispose();
  nonIdx.computeVertexNormals();
  return nonIdx;
}

/** Multi-frond tropical shoreline fern / broad-leaf cluster (#123D2A). */
export function makeFernBushGeometry(seed = 1.7): THREE.BufferGeometry {
  const rnd = seededRand(seed);
  const parts: THREE.BufferGeometry[] = [];
  const fronds = 9;
  for (let i = 0; i < fronds; i++) {
    const ang = (i / fronds) * Math.PI * 2 + (rnd() - 0.5) * 0.25;
    const tier = i % 2;
    const len = (tier === 0 ? 1.55 : 1.15) + rnd() * 0.45;
    const w = 0.42 + rnd() * 0.16;
    const arch = tier === 0 ? 0.55 + rnd() * 0.2 : 0.85 + rnd() * 0.25;
    const droop = tier === 0 ? -0.35 : -0.15;
    parts.push(
      buildLeafBladeGeo(ang, len, w, arch, droop, [0.04, 0.14, 0.09], [0.11, 0.34, 0.21]),
    );
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** Cluster of notched floating water lily pads & a pale lotus bud. */
export function makeWaterLilyGeometry(seed = 4.2): THREE.BufferGeometry {
  const rnd = seededRand(seed);
  const parts: THREE.BufferGeometry[] = [];
  const pads = 4;
  for (let i = 0; i < pads; i++) {
    const r = 0.34 + rnd() * 0.28;
    const notchStart = rnd() * Math.PI * 2;
    const pad = new THREE.CircleGeometry(r, 14, notchStart, Math.PI * 1.82).toNonIndexed();
    pad.rotateX(-Math.PI / 2);

    const pos = pad.getAttribute("position") as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const ox = (rnd() - 0.5) * 1.15;
    const oz = (rnd() - 0.5) * 1.15;
    const shade = 0.78 + rnd() * 0.35;

    for (let k = 0; k < pos.count; k++) {
      const px = pos.getX(k);
      const pz = pos.getZ(k);
      const radial = clamp(Math.hypot(px, pz) / r, 0, 1);
      // Slight upturned edge curl on the lily pad rim
      pos.setXYZ(k, px + ox, 0.04 + Math.pow(radial, 3) * 0.035, pz + oz);
      col[k * 3] = lerp(0.05, 0.13, radial) * shade;
      col[k * 3 + 1] = lerp(0.20, 0.36, radial) * shade;
      col[k * 3 + 2] = lerp(0.11, 0.18, radial) * shade;
    }
    pad.setAttribute("color", new THREE.BufferAttribute(col, 3));
    pad.computeVertexNormals();
    parts.push(pad);
  }

  // Subtle closed water-lily bud nestled among the pads
  const bud = new THREE.ConeGeometry(0.075, 0.22, 6).toNonIndexed();
  bud.translate(0.1, 0.14, 0.05);
  const bPos = bud.getAttribute("position") as THREE.BufferAttribute;
  const bCol = new Float32Array(bPos.count * 3);
  for (let k = 0; k < bPos.count; k++) {
    const y = bPos.getY(k);
    const tip = clamp((y - 0.03) / 0.22, 0, 1);
    bCol[k * 3] = lerp(0.25, 0.68, tip);
    bCol[k * 3 + 1] = lerp(0.45, 0.78, tip);
    bCol[k * 3 + 2] = lerp(0.32, 0.65, tip);
  }
  bud.setAttribute("color", new THREE.BufferAttribute(bCol, 3));
  bud.computeVertexNormals();
  parts.push(bud);

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** Delicate riverbank bioluminescent foliage spray glowing softly cyan-turquoise (#43E6C1). */
export function makeBioPlantGeometry(seed = 9.1): THREE.BufferGeometry {
  const rnd = seededRand(seed);
  const parts: THREE.BufferGeometry[] = [];
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const ang = (i / blades) * Math.PI * 2 + (rnd() - 0.5) * 0.3;
    parts.push(
      buildLeafBladeGeo(
        ang,
        0.95 + rnd() * 0.45,
        0.24 + rnd() * 0.08,
        0.65 + rnd() * 0.35,
        -0.12,
        [0.04, 0.20, 0.18],
        [0.26, 0.90, 0.76], // #43E6C1 luminous leaf tips
      ),
    );
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** Exposed river-channel mangrove root snag hazard (replaces ocean rocks in Mangrove mode). */
export function makeRootSnagGeometry(seed = 15.7): THREE.BufferGeometry {
  const rnd = seededRand(seed);
  const parts: THREE.BufferGeometry[] = [];

  // Stump core
  parts.push(
    buildTaperedBranchGeo(
      [
        new THREE.Vector3(0, -1.2, 0),
        new THREE.Vector3((rnd() - 0.5) * 0.3, 0.4, (rnd() - 0.5) * 0.3),
        new THREE.Vector3((rnd() - 0.5) * 0.5, 1.35 + rnd() * 0.45, (rnd() - 0.5) * 0.4),
      ],
      0.42,
      0.14,
      6,
      6,
      (v) => {
        const top = clamp((v.y - 0.3) / 1.2, 0, 1);
        return [lerp(0.10, 0.36, top), lerp(0.14, 0.29, top), lerp(0.10, 0.23, top)];
      },
    ),
  );

  // 4 arching knees rising clearly above the dark river surface
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rnd() * 0.5;
    const rad = 0.75 + rnd() * 0.45;
    const peak = 0.75 + rnd() * 0.65;
    parts.push(
      buildTaperedBranchGeo(
        [
          new THREE.Vector3(Math.cos(a) * 0.15, 0.2, Math.sin(a) * 0.15),
          new THREE.Vector3(Math.cos(a) * rad * 0.55, peak, Math.sin(a) * rad * 0.55),
          new THREE.Vector3(Math.cos(a) * rad, -1.0, Math.sin(a) * rad),
        ],
        0.16,
        0.09,
        6,
        5,
        (v) => {
          const rim = clamp((v.y - 0.25) / 0.85, 0, 1);
          return [lerp(0.08, 0.34, rim), lerp(0.13, 0.28, rim), lerp(0.09, 0.22, rim)];
        },
      ),
    );
  }

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** Floating tangled mangrove root & vegetation clump geometry (replaces sea mine iron sphere). */
export function makeTangledHazardGeometry(seed = 21.3): THREE.BufferGeometry {
  const rnd = seededRand(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rnd() * 0.4;
    const r = 0.5 + rnd() * 0.35;
    parts.push(
      buildTaperedBranchGeo(
        [
          new THREE.Vector3(Math.cos(a) * r, -0.45, Math.sin(a) * r),
          new THREE.Vector3(Math.cos(a + 0.7) * r * 0.55, 0.35 + rnd() * 0.35, Math.sin(a + 0.7) * r * 0.55),
          new THREE.Vector3(-Math.cos(a) * r * 0.85, -0.35, -Math.sin(a) * r * 0.85),
        ],
        0.13,
        0.07,
        6,
        5,
        () => [0.22, 0.20, 0.15],
      ),
    );
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}
