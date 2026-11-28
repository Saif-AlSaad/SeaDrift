/* Procedural Dutch canal-town scenery for DRIFT's "Canal" mode.
   Historic gabled canal houses (step / bell / neck / cornice gables, hoist beams,
   stoops, shutters, leaning facades), stone quay walls with bollards, cast-iron
   street lamps, plane trees, moored houseboats, a humpback stone bridge and a
   Westerkerk-style church tower.

   Everything is generated at startup — no external assets. A "block" is one 48 m
   slice of canal with both banks baked into 5 merged geometries (one per
   material), so the whole mode costs ~30 draw calls: the engine just leap-frogs
   a handful of blocks along -Z exactly like the mangrove corridor does.

   Frame: water surface y = 0, boat travels along -Z, banks at x = ±QUAY_X. */
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* constants                                                           */
/* ------------------------------------------------------------------ */

/** Inner face of the stone quay walls (steering range is ±15). */
export const CANAL_QUAY_X = 17.0;
/** Height of the cobbled quay street above the water. */
export const CANAL_STREET_Y = 1.4;
/** Front plane of the first row of canal houses. */
export const CANAL_HOUSE_X = 21.6;
/** Length of one scenery block along Z. */
export const CANAL_BLOCK_LENGTH = 48;

const HOUSE_DEPTH = 9.5;
const FAR_ROW_1 = CANAL_HOUSE_X + HOUSE_DEPTH + 2.6;
const FAR_ROW_2 = FAR_ROW_1 + 10.5;
const TILE = 3; // world units per texture repeat

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => {
  const k = clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
};

function seededRand(seed: number): () => number {
  let s = Math.floor(Math.abs(seed) * 9973 + 7) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 48271) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

type RGB = [number, number, number];
type V3 = [number, number, number];
type P2 = [number, number];

/** Hex (sRGB) → linear working-space colour, which is what vertex colours expect. */
const hex = (h: string): RGB => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};
const mulC = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mixC = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/* ------------------------------------------------------------------ */
/* districts (the engine maps distance → district)                     */
/* ------------------------------------------------------------------ */

export interface CanalDistrict {
  name: string;
  bricks: RGB[];
  trims: RGB[];
  roofs: RGB[];
  doors: RGB[];
  /** probability a window is lit */
  lit: number;
  /** gable weights: step, bell, neck, cornice */
  gables: [number, number, number, number];
  hoistChance: number;
  shutterChance: number;
  leaf: RGB[];
  floorsMin: number;
  floorsMax: number;
}

export const CANAL_DISTRICTS: CanalDistrict[] = [
  {
    name: "Golden Quay",
    bricks: [hex("#9a4a38"), hex("#8c4332"), hex("#a8573f"), hex("#7d3b2f"), hex("#b8734f")],
    trims: [hex("#d9cfb8"), hex("#cfc4aa")],
    roofs: [hex("#3a3d48"), hex("#9a4a35"), hex("#2e3038")],
    doors: [hex("#1f4a36"), hex("#1d2a52"), hex("#6a1a1a"), hex("#2b2b2e")],
    lit: 0.22,
    gables: [0.38, 0.32, 0.12, 0.18],
    hoistChance: 0.28,
    shutterChance: 0.18,
    leaf: [hex("#6f9a2c"), hex("#86a936"), hex("#5b8a2a")],
    floorsMin: 3,
    floorsMax: 5,
  },
  {
    name: "Merchant Row",
    bricks: [hex("#c9b48f"), hex("#b59f7d"), hex("#8f6a55"), hex("#a8583f"), hex("#6f6a6e")],
    trims: [hex("#ece4d2"), hex("#e0d6bf")],
    roofs: [hex("#34363f"), hex("#272930")],
    doors: [hex("#143e2c"), hex("#17224a"), hex("#4f1414"), hex("#1c1c20")],
    lit: 0.4,
    gables: [0.1, 0.22, 0.4, 0.28],
    hoistChance: 0.12,
    shutterChance: 0.32,
    leaf: [hex("#5f8c2b"), hex("#78a233"), hex("#4f7a28")],
    floorsMin: 4,
    floorsMax: 5,
  },
  {
    name: "Warehouse Row",
    bricks: [hex("#6b3426"), hex("#5a2c22"), hex("#4a3a35"), hex("#7a4632"), hex("#3a2a26")],
    trims: [hex("#b8ac96"), hex("#a39882")],
    roofs: [hex("#232329"), hex("#2f2b2c")],
    doors: [hex("#2a1c12"), hex("#1f2a22"), hex("#3a1612")],
    lit: 0.5,
    gables: [0.55, 0.15, 0.2, 0.1],
    hoistChance: 0.72,
    shutterChance: 0.14,
    leaf: [hex("#7d8a2c"), hex("#a39a30"), hex("#6e8028")],
    floorsMin: 4,
    floorsMax: 6,
  },
  {
    name: "Midnight Old Town",
    bricks: [hex("#7f3d33"), hex("#5e3a38"), hex("#a9856a"), hex("#4b4350"), hex("#8c5238")],
    trims: [hex("#cfc6b4"), hex("#b9b0a0")],
    roofs: [hex("#22242c"), hex("#2c2a30")],
    doors: [hex("#183a2c"), hex("#1a244a"), hex("#5a1818")],
    lit: 0.68,
    gables: [0.3, 0.3, 0.22, 0.18],
    hoistChance: 0.3,
    shutterChance: 0.22,
    leaf: [hex("#b0802a"), hex("#c9922e"), hex("#8a7a2a"), hex("#a8602a")],
    floorsMin: 3,
    floorsMax: 6,
  },
];

/** Distance (in game metres) → district index. */
export function getCanalDistrictIndex(distMeters: number): number {
  return distMeters >= 850 ? 3 : distMeters >= 550 ? 2 : distMeters >= 250 ? 1 : 0;
}

/* ------------------------------------------------------------------ */
/* low-level mesher (typed-array writer; much cheaper than THREE prims) */
/* ------------------------------------------------------------------ */

class Mesher {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  /** optional per-vertex brightness multiplier (x, y, z) → k */
  shade: ((x: number, y: number, z: number) => number) | null = null;

  get count(): number {
    return this.pos.length / 3;
  }

  private push(p: V3, n: V3, c: RGB, tile: number) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    if (tile > 0) {
      const ax = Math.abs(n[0]);
      const ay = Math.abs(n[1]);
      const az = Math.abs(n[2]);
      if (ax >= ay && ax >= az) this.uv.push(p[2] / tile, p[1] / tile);
      else if (az >= ay) this.uv.push(p[0] / tile, p[1] / tile);
      else this.uv.push(p[0] / tile, p[2] / tile);
    } else this.uv.push(0, 0);
    const k = this.shade ? this.shade(p[0], p[1], p[2]) : 1;
    this.col.push(c[0] * k, c[1] * k, c[2] * k);
  }

  tri(a: V3, b: V3, c: V3, col: RGB, tile = 0, hint?: V3) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;
    nx /= len; ny /= len; nz /= len;
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) {
      const t = b; b = c; c = t;
      nx = -nx; ny = -ny; nz = -nz;
    }
    const n: V3 = [nx, ny, nz];
    this.push(a, n, col, tile);
    this.push(b, n, col, tile);
    this.push(c, n, col, tile);
  }

  quad(a: V3, b: V3, c: V3, d: V3, col: RGB, tile = 0, hint?: V3) {
    this.tri(a, b, c, col, tile, hint);
    this.tri(a, c, d, col, tile, hint);
  }

  /** Window-style quad facing +X with a vertical colour gradient. */
  glassX(x: number, z0: number, z1: number, y0: number, y1: number, cb: RGB, ct: RGB) {
    const v = (z: number, y: number, c: RGB) => {
      this.pos.push(x, y, z);
      this.nor.push(1, 0, 0);
      this.uv.push(0, 0);
      this.col.push(c[0], c[1], c[2]);
    };
    v(z0, y0, cb); v(z1, y1, ct); v(z1, y0, cb);
    v(z0, y0, cb); v(z0, y1, ct); v(z1, y1, ct);
  }

  /** Axis-aligned box. skip bit-mask: 1=+x 2=-x 4=+y 8=-y 16=+z 32=-z */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: RGB, tile = 0, skip = 0) {
    if (!(skip & 1)) this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], col, tile, [1, 0, 0]);
    if (!(skip & 2)) this.quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], col, tile, [-1, 0, 0]);
    if (!(skip & 4)) this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], col, tile, [0, 1, 0]);
    if (!(skip & 8)) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col, tile, [0, -1, 0]);
    if (!(skip & 16)) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col, tile, [0, 0, 1]);
    if (!(skip & 32)) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], col, tile, [0, 0, -1]);
  }

  /** Extrude a 2-D outline. axis 'z': (u,v)=(x,y); 'x': (u,v)=(z,y); 'y': (u,v)=(x,z). */
  prism(poly: P2[], axis: "x" | "y" | "z", a0: number, a1: number, col: RGB, tile = 0) {
    const pts = poly.slice();
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      area += p[0] * q[1] - q[0] * p[1];
    }
    if (area < 0) pts.reverse();
    const map = (p: P2, a: number): V3 => (axis === "z" ? [p[0], p[1], a] : axis === "x" ? [a, p[1], p[0]] : [p[0], a, p[1]]);
    const dirv: V3 = axis === "z" ? [0, 0, 1] : axis === "x" ? [1, 0, 0] : [0, 1, 0];
    const tris = THREE.ShapeUtils.triangulateShape(
      pts.map((p) => new THREE.Vector2(p[0], p[1])),
      [],
    );
    for (const t of tris) {
      this.tri(map(pts[t[0]], a1), map(pts[t[1]], a1), map(pts[t[2]], a1), col, tile, dirv);
      this.tri(map(pts[t[0]], a0), map(pts[t[1]], a0), map(pts[t[2]], a0), col, tile, [-dirv[0], -dirv[1], -dirv[2]]);
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const hint: V3 = axis === "z" ? [dy, -dx, 0] : axis === "x" ? [0, -dx, dy] : [dy, 0, -dx];
      this.quad(map(p, a0), map(q, a0), map(q, a1), map(p, a1), col, tile, hint);
    }
  }

  /** Bake any THREE geometry in (optionally transformed, optionally per-vertex coloured). */
  geo(
    g: THREE.BufferGeometry,
    mat: THREE.Matrix4 | null,
    col: RGB | ((x: number, y: number, z: number, ny: number) => RGB),
    tile = 0,
  ) {
    const p = g.getAttribute("position");
    const nrm = g.getAttribute("normal");
    const idx = g.index;
    const n = idx ? idx.count : p.count;
    const nm = mat ? new THREE.Matrix3().getNormalMatrix(mat) : null;
    const v = new THREE.Vector3();
    const vn = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const k = idx ? idx.getX(i) : i;
      v.fromBufferAttribute(p, k);
      vn.fromBufferAttribute(nrm, k);
      if (mat) v.applyMatrix4(mat);
      if (nm) vn.applyMatrix3(nm).normalize();
      const c = typeof col === "function" ? col(v.x, v.y, v.z, vn.y) : col;
      this.push([v.x, v.y, v.z], [vn.x, vn.y, vn.z], c, tile);
    }
  }

  /** Shear (lean) + yaw + translate every vertex appended since `from`. */
  place(from: number, yaw: number, tx: number, ty: number, tz: number, leanX = 0, leanZ = 0, sc = 1) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (let i = from; i < this.count; i++) {
      const o = i * 3;
      let x = this.pos[o] * sc;
      const y = this.pos[o + 1] * sc;
      let z = this.pos[o + 2] * sc;
      x += leanX * y;
      z += leanZ * y;
      this.pos[o] = x * c + z * s + tx;
      this.pos[o + 1] = y + ty;
      this.pos[o + 2] = -x * s + z * c + tz;
      const nx = this.nor[o];
      const nz = this.nor[o + 2];
      this.nor[o] = nx * c + nz * s;
      this.nor[o + 2] = -nx * s + nz * c;
    }
  }

  build(): THREE.BufferGeometry {
    if (this.count === 0) this.tri([0, 0, 0], [0.001, 0, 0], [0, 0.001, 0], [0, 0, 0]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

interface Buckets {
  brick: Mesher;
  stone: Mesher;
  paint: Mesher;
  roof: Mesher;
  glass: Mesher;
}
const newBuckets = (): Buckets => ({
  brick: new Mesher(),
  stone: new Mesher(),
  paint: new Mesher(),
  roof: new Mesher(),
  glass: new Mesher(),
});
const marks = (b: Buckets) => [b.brick.count, b.stone.count, b.paint.count, b.roof.count, b.glass.count];
function placeAll(b: Buckets, from: number[], yaw: number, tx: number, ty: number, tz: number, lx = 0, lz = 0, sc = 1) {
  b.brick.place(from[0], yaw, tx, ty, tz, lx, lz, sc);
  b.stone.place(from[1], yaw, tx, ty, tz, lx, lz, sc);
  b.paint.place(from[2], yaw, tx, ty, tz, lx, lz, sc);
  b.roof.place(from[3], yaw, tx, ty, tz, lx, lz, sc);
  b.glass.place(from[4], yaw, tx, ty, tz, lx, lz, sc);
}

/* ------------------------------------------------------------------ */
/* textures + materials                                                */
/* ------------------------------------------------------------------ */

function canvasTex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Greyscale running-bond brick — vertex colour supplies the hue. */
export function makeCanalBrickTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fafafa";
  g.fillRect(0, 0, S, S);
  const rows = 14;
  const per = 6;
  const rh = S / rows;
  const bw = S / per;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let i = -1; i <= per; i++) {
      const v = 208 + Math.random() * 40;
      g.fillStyle = `rgb(${v},${v - 3},${v - 5})`;
      g.fillRect(i * bw + off + 1.6, r * rh + 1.5, bw - 3.2, rh - 3);
      if (Math.random() < 0.28) {
        g.fillStyle = `rgba(30,22,20,${0.1 + Math.random() * 0.16})`;
        g.fillRect(i * bw + off + 2, r * rh + 2, bw - 4, rh - 4);
      }
    }
  }
  for (let i = 0; i < 700; i++) {
    g.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.06)";
    g.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 2, 1);
  }
  return canvasTex(c);
}

/** Weathered ashlar blocks for quay walls, plinths and bridge masonry. */
export function makeCanalStoneTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#b4b4ae";
  g.fillRect(0, 0, S, S);
  const rows = 5;
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = -Math.random() * 60;
    while (x < S) {
      const w = 55 + Math.random() * 70;
      const v = 208 + Math.random() * 42;
      const grad = g.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
      grad.addColorStop(0, `rgb(${v + 12},${v + 10},${v + 4})`);
      grad.addColorStop(1, `rgb(${v - 14},${v - 14},${v - 18})`);
      g.fillStyle = grad;
      g.fillRect(x + 2, r * rh + 2, w - 4, rh - 4);
      x += w;
    }
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() < 0.55 ? "rgba(20,24,18,0.09)" : "rgba(255,255,240,0.07)";
    g.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 3, 1 + Math.random() * 2);
  }
  return canvasTex(c);
}

/** Greyscale Dutch pantile / slate courses. */
export function makeCanalRoofTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#9a9a9a";
  g.fillRect(0, 0, S, S);
  const rows = 12;
  const per = 10;
  const rh = S / rows;
  const tw = S / per;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? tw / 2 : 0;
    for (let i = -1; i <= per; i++) {
      const v = 205 + Math.random() * 50;
      const grad = g.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
      grad.addColorStop(0, `rgb(${v},${v},${v})`);
      grad.addColorStop(1, `rgb(${v * 0.62},${v * 0.62},${v * 0.62})`);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(i * tw + off + 1, r * rh);
      g.lineTo(i * tw + off + tw - 1, r * rh);
      g.lineTo(i * tw + off + tw - 1, r * rh + rh * 0.62);
      g.quadraticCurveTo(i * tw + off + tw / 2, r * rh + rh * 1.18, i * tw + off + 1, r * rh + rh * 0.62);
      g.closePath();
      g.fill();
    }
  }
  return canvasTex(c);
}

export interface CanalMaterials {
  brick: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  paint: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  glass: THREE.MeshBasicMaterial;
}

export function makeCanalMaterials(): CanalMaterials {
  const brickTex = makeCanalBrickTexture();
  const stoneTex = makeCanalStoneTexture();
  const roofTex = makeCanalRoofTexture();
  return {
    brick: new THREE.MeshStandardMaterial({ map: brickTex, bumpMap: brickTex, bumpScale: 0.4, vertexColors: true, roughness: 0.92, metalness: 0.0 }),
    stone: new THREE.MeshStandardMaterial({ map: stoneTex, bumpMap: stoneTex, bumpScale: 0.4, vertexColors: true, roughness: 0.88, metalness: 0.0 }),
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 }),
    roof: new THREE.MeshStandardMaterial({ map: roofTex, bumpMap: roofTex, bumpScale: 0.5, vertexColors: true, roughness: 0.82, metalness: 0.04 }),
    // windows and lantern glass: unlit so lit panes glow warmly in the dusk
    glass: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
}

/* ------------------------------------------------------------------ */
/* shared palette                                                      */
/* ------------------------------------------------------------------ */

const WHITE_PAINT = hex("#e8e2d2");
const IRON = hex("#1c2220");
const WOOD = hex("#4a3322");
const PAVER = hex("#6f625a");
const LIT_B = hex("#ffd27a");
const LIT_T = hex("#f2902e");
const DARK_B = hex("#7f93a6");
const DARK_T = hex("#1d2b3d");
const GOLD = hex("#d9a53a");
const COPPER = hex("#2f7a74");

/* ------------------------------------------------------------------ */
/* canal houses                                                        */
/* ------------------------------------------------------------------ */

const FLOOR_H = [3.9, 3.6, 3.2, 3.0, 2.8, 2.7, 2.7, 2.6];

type GableKind = 0 | 1 | 2 | 3; // step, bell, neck, cornice

interface HouseSpec {
  z0: number;
  W: number;
  floors: number;
  brick: RGB;
  trim: RGB;
  roof: RGB;
  door: RGB;
  gable: GableKind;
  hoist: boolean;
  shutters: boolean;
  quoins: boolean;
  lit: number;
  /** 1 = full architectural detail, 0 = cheap backdrop house */
  detail: 0 | 1;
  mullions: boolean;
}

function stepChain(W: number, gh: number): P2[] {
  const n = W < 6.2 ? 4 : W < 7.6 ? 5 : 6;
  const top = 0.6;
  const dx = (W / 2 - top) / n;
  const s = gh / n;
  const left: P2[] = [[0, 0]];
  let u = 0;
  for (let i = 1; i <= n; i++) {
    left.push([u, i * s]);
    u += dx;
    left.push([u, i * s]);
  }
  const right = left.slice().reverse().map((p): P2 => [W - p[0], p[1]]);
  return left.concat(right);
}

function bellChain(W: number, gh: number): P2[] {
  const topHalf = (W / 2) * 0.3;
  const span = W / 2 - topHalf;
  const N = 16;
  const left: P2[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    left.push([span * smooth(t) + Math.sin(t * Math.PI * 2) * 0.1 * (W / 7), t * gh]);
  }
  const right = left.slice().reverse().map((p): P2 => [W - p[0], p[1]]);
  const cap: P2[] = [[W / 2, gh + topHalf * 0.55]];
  return left.concat(cap, right);
}

function neckChain(W: number, gh: number): P2[] {
  const neckHalf = W * 0.17 + 0.2;
  const neckU = W / 2 - neckHalf;
  const s1 = gh * 0.2;
  const r = gh * 0.3;
  const gh0 = gh * 0.78;
  const left: P2[] = [[0, 0], [0, s1]];
  for (let i = 1; i <= 8; i++) {
    const th = (i / 8) * (Math.PI / 2);
    left.push([neckU * Math.sin(th), s1 + r * (1 - Math.cos(th))]);
  }
  left.push([neckU, gh0], [neckU - 0.28, gh0], [neckU - 0.28, gh0 + 0.18]);
  const right = left.slice().reverse().map((p): P2 => [W - p[0], p[1]]);
  return left.concat([[W / 2, gh]], right);
}

function corniceChain(W: number, h1: number, gh: number): P2[] {
  return [[0, 0], [0, h1], [W * 0.3, h1], [W / 2, gh], [W * 0.7, h1], [W, h1], [W, 0]];
}

/** One window: lit/dark glass pane, white frame with muntins, stone lintel + sill, optional shutters. */
function addWindow(b: Buckets, cx: number, y0: number, w: number, h: number, spec: HouseSpec, rnd: () => number, shutterC: RGB | null) {
  const lit = rnd() < spec.lit;
  const k = lit ? 0.82 + rnd() * 0.3 : 0.8 + rnd() * 0.4;
  const cb = mulC(lit ? LIT_B : DARK_B, k);
  const ct = mulC(lit ? LIT_T : DARK_T, k);
  const t = spec.detail ? 0.11 : 0;
  b.glass.glassX(0.05, cx - w / 2 + t, cx + w / 2 - t, y0 + t, y0 + h - t, cb, ct);
  if (!spec.detail) return;
  const P = WHITE_PAINT;
  const pa = b.paint;
  pa.box(0, y0, cx - w / 2, 0.12, y0 + h, cx - w / 2 + t, P, 0, 2 | 8);
  pa.box(0, y0, cx + w / 2 - t, 0.12, y0 + h, cx + w / 2, P, 0, 2 | 8);
  pa.box(0, y0 + h - t, cx - w / 2 + t, 0.12, y0 + h, cx + w / 2 - t, P, 0, 2);
  pa.box(0, y0, cx - w / 2 + t, 0.14, y0 + t, cx + w / 2 - t, P, 0, 2);
  if (spec.mullions) {
    pa.box(0, y0 + t, cx - 0.04, 0.09, y0 + h - t, cx + 0.04, P, 0, 2 | 8);
    pa.box(0, y0 + h * 0.36 - 0.03, cx - w / 2 + t, 0.09, y0 + h * 0.36 + 0.03, cx + w / 2 - t, P, 0, 2 | 8);
    pa.box(0, y0 + h * 0.7 - 0.03, cx - w / 2 + t, 0.09, y0 + h * 0.7 + 0.03, cx + w / 2 - t, P, 0, 2 | 8);
  }
  b.stone.box(0, y0 + h, cx - w / 2 - 0.18, 0.2, y0 + h + 0.26, cx + w / 2 + 0.18, spec.trim, TILE, 2);
  b.stone.box(0, y0 - 0.15, cx - w / 2 - 0.1, 0.3, y0, cx + w / 2 + 0.1, spec.trim, TILE, 2);
  if (shutterC) {
    pa.box(0, y0, cx - w / 2 - 0.58, 0.1, y0 + h, cx - w / 2 - 0.04, shutterC, 0, 2);
    pa.box(0, y0, cx + w / 2 + 0.04, 0.1, y0 + h, cx + w / 2 + 0.58, shutterC, 0, 2);
  }
}

/** Build one canal house in its local frame: front plane x = 0, body toward -x, width along +z from z0, y = 0 at street. */
function buildHouse(b: Buckets, spec: HouseSpec, rnd: () => number) {
  const { z0, W, floors } = spec;
  const near = spec.detail === 1;
  const D = near ? HOUSE_DEPTH : 8;
  let H = 0;
  const base: number[] = [];
  for (let i = 0; i < floors; i++) {
    base.push(H);
    H += FLOOR_H[Math.min(i, FLOOR_H.length - 1)];
  }
  const zc = z0 + W / 2;
  const nCol = W < 6.6 ? 2 : 3;

  // body + plinth
  b.brick.box(-D, 0, z0, 0, H, z0 + W, spec.brick, TILE, 8);
  if (near) {
    b.stone.box(0, 0, z0, 0.2, 1.0, z0 + W, mulC(spec.trim, 0.62), TILE, 2);
    for (let f = 1; f < floors; f++) {
      const y = base[f];
      b.stone.box(0, y - 0.1, z0, 0.16, y + 0.12, z0 + W, spec.trim, TILE, 2);
    }
    b.stone.box(0, H - 0.2, z0, 0.55, H + 0.06, z0 + W, spec.trim, TILE, 2);
    if (spec.quoins) {
      b.stone.box(0, 1.0, z0, 0.12, H - 0.2, z0 + 0.4, spec.trim, TILE, 2);
      b.stone.box(0, 1.0, z0 + W - 0.4, 0.12, H - 0.2, z0 + W, spec.trim, TILE, 2);
    }
  }

  const shutterC = spec.shutters && nCol === 2 && near ? mixC(spec.door, spec.brick, 0.1) : null;

  // ground floor: door + windows
  const doorIdx = Math.floor(rnd() * nCol);
  for (let i = 0; i < nCol; i++) {
    const cx = z0 + (W * (i + 0.5)) / nCol;
    if (i === doorIdx && near) {
      const dw = 1.4, dy0 = 0.9, dh = 2.55;
      const dcol = spec.door;
      b.paint.box(0, dy0, cx - dw / 2, 0.14, dy0 + dh, cx + dw / 2, dcol, 0, 2);
      for (const px of [-0.3, 0.3]) {
        b.paint.box(0.14, dy0 + 0.25, cx + px - 0.2, 0.18, dy0 + 1.15, cx + px + 0.2, mulC(dcol, 1.6), 0, 2);
        b.paint.box(0.14, dy0 + 1.35, cx + px - 0.2, 0.18, dy0 + 2.3, cx + px + 0.2, mulC(dcol, 1.6), 0, 2);
      }
      const lit = rnd() < spec.lit + 0.2;
      b.glass.glassX(0.05, cx - dw / 2 + 0.1, cx + dw / 2 - 0.1, dy0 + dh + 0.06, dy0 + dh + 0.4, mulC(lit ? LIT_B : DARK_B, 1), mulC(lit ? LIT_T : DARK_T, 1));
      b.stone.box(0, dy0 + dh + 0.4, cx - dw / 2 - 0.26, 0.28, dy0 + dh + 0.68, cx + dw / 2 + 0.26, spec.trim, TILE, 2);
      b.stone.box(0, dy0, cx - dw / 2 - 0.22, 0.2, dy0 + dh + 0.4, cx - dw / 2, spec.trim, TILE, 2);
      b.stone.box(0, dy0, cx + dw / 2, 0.2, dy0 + dh + 0.4, cx + dw / 2 + 0.22, spec.trim, TILE, 2);
      const stoneDark = mulC(spec.trim, 0.78);
      for (let s = 0; s < 3; s++) b.stone.box(0, 0, cx - dw / 2 - 0.4, 1.4 - s * 0.45, 0.3 * (s + 1), cx + dw / 2 + 0.4, stoneDark, TILE, 2);
      for (const side of [-1, 1]) {
        const zr = cx + side * (dw / 2 + 0.34);
        for (let p = 0; p < 3; p++) b.paint.box(0.2 + p * 0.45, 0.3 * (p + 1), zr - 0.025, 0.24 + p * 0.45, 0.3 * (p + 1) + 0.85, zr + 0.025, IRON, 0, 8);
        b.paint.box(0.2, 1.05, zr - 0.03, 1.3, 1.1, zr + 0.03, IRON, 0, 0);
      }
    } else {
      addWindow(b, cx, 1.45, 1.5, 1.85, spec, rnd, shutterC);
    }
  }

  // upper floors
  for (let f = 1; f < floors; f++) {
    const fh = FLOOR_H[Math.min(f, FLOOR_H.length - 1)];
    const y0 = base[f] + 0.5;
    const h = fh - 1.15;
    for (let i = 0; i < nCol; i++) {
      const cx = z0 + (W * (i + 0.5)) / nCol;
      addWindow(b, cx, y0, 1.5, h, spec, rnd, shutterC);
    }
  }

  // gable + roof
  const R = W * 0.34;
  let gh = R + 1.0 + W * lerp(0.2, 0.48, rnd());
  let chain: P2[];
  const h1 = R + 0.9;
  switch (spec.gable) {
    case 0: chain = stepChain(W, gh); break;
    case 1: chain = bellChain(W, gh); break;
    case 2: chain = neckChain(W, gh); break;
    default:
      gh = h1 + W * 0.22;
      chain = corniceChain(W, h1, gh);
  }
  const stoneGable = spec.gable >= 2 && rnd() < 0.5;
  const gableCol = stoneGable ? mulC(spec.trim, 0.9) : spec.brick;
  const poly: P2[] = chain.map((p): P2 => [z0 + p[0], H + p[1]]);
  (stoneGable ? b.stone : b.brick).prism(poly, "x", -0.6, 0, gableCol, TILE);

  b.roof.prism([[z0, H], [z0 + W, H], [zc, H + R]], "x", -D, -0.5, spec.roof, TILE);

  if (near) {
    // stone coping band along every upper edge of the gable
    const c = 0.26;
    for (let i = 0; i < chain.length - 1; i++) {
      const p = chain[i];
      const q = chain[i + 1];
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const len = Math.hypot(dx, dy);
      if (len < 0.05) continue;
      const nx = -dy / len, ny = dx / len;
      // only edges whose outward normal points up/out
      if (ny < -0.2) continue;
      const a: P2 = [z0 + p[0], H + p[1]];
      const bb: P2 = [z0 + q[0], H + q[1]];
      b.stone.prism([a, bb, [bb[0] + nx * c, bb[1] + ny * c], [a[0] + nx * c, a[1] + ny * c]], "x", -0.72, 0.2, spec.trim, TILE);
    }
    // finial
    let topV = 0;
    for (const p of chain) topV = Math.max(topV, p[1]);
    const g = new THREE.SphereGeometry(0.3, 7, 5);
    b.stone.geo(g, new THREE.Matrix4().makeTranslation(-0.25, H + topV + 0.55, zc), spec.trim, TILE);
    g.dispose();
    b.stone.box(-0.45, H + topV, zc - 0.2, -0.05, H + topV + 0.3, zc + 0.2, spec.trim, TILE);

    // attic window in the gable
    if (gh > 3.4) addWindow(b, zc, H + 0.7, 1.1, Math.min(1.7, gh * 0.4), spec, rnd, null);

    // chimney
    const cxm = -D * 0.6;
    b.brick.box(cxm - 0.45, H + R * 0.4, zc - 0.45, cxm + 0.45, H + R + 1.7, zc + 0.45, mulC(spec.brick, 0.9), TILE);
    b.stone.box(cxm - 0.58, H + R + 1.7, zc - 0.58, cxm + 0.58, H + R + 1.86, zc + 0.58, spec.trim, TILE);

    // hoist beam, pulley, rope + hook (warehouse-style houses)
    if (spec.hoist && spec.gable !== 3) {
      const y = H + gh * 0.72;
      b.paint.box(-0.3, y - 0.11, zc - 0.11, 2.4, y + 0.11, zc + 0.11, WOOD, 0);
      b.paint.box(0, y - 1.0, zc - 0.08, 0.16, y, zc + 0.08, WOOD, 0, 2);
      const wg = new THREE.CylinderGeometry(0.3, 0.3, 0.12, 10);
      wg.rotateX(Math.PI / 2);
      b.paint.geo(wg, new THREE.Matrix4().makeTranslation(2.15, y - 0.22, zc), IRON);
      wg.dispose();
      b.paint.box(2.12, y - 2.7, zc - 0.02, 2.17, y - 0.25, zc + 0.02, hex("#8b7048"), 0);
      b.paint.box(2.02, y - 2.95, zc - 0.07, 2.26, y - 2.7, zc + 0.07, IRON, 0);
    }
  }
}

function pickGable(d: CanalDistrict, rnd: () => number): GableKind {
  const r = rnd();
  let acc = 0;
  for (let i = 0; i < 4; i++) {
    acc += d.gables[i];
    if (r <= acc) return i as GableKind;
  }
  return 0;
}

function houseSpec(d: CanalDistrict, rnd: () => number, z0: number, W: number, detail: 0 | 1, quality: "high" | "low"): HouseSpec {
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const gable = pickGable(d, rnd);
  const base = pick(d.bricks);
  return {
    z0,
    W,
    floors: detail ? d.floorsMin + Math.floor(rnd() * (d.floorsMax - d.floorsMin + 1)) : 5 + Math.floor(rnd() * 4),
    brick: mixC(base, [base[0] * 0.8, base[1] * 0.8, base[2] * 0.8], rnd()),
    trim: pick(d.trims),
    roof: pick(d.roofs),
    door: pick(d.doors),
    gable,
    hoist: rnd() < d.hoistChance,
    shutters: rnd() < d.shutterChance,
    quoins: rnd() < 0.4,
    lit: detail ? d.lit : d.lit * 0.9,
    detail,
    mullions: quality === "high",
  };
}

/* ------------------------------------------------------------------ */
/* street furniture, trees, boats                                      */
/* ------------------------------------------------------------------ */

function addLamp(b: Buckets, x: number, y0: number, z: number) {
  const post = new THREE.CylinderGeometry(0.1, 0.14, 3.9, 6);
  b.paint.geo(post, new THREE.Matrix4().makeTranslation(x, y0 + 2.2, z), IRON);
  post.dispose();
  const base = new THREE.CylinderGeometry(0.24, 0.3, 0.55, 6);
  b.paint.geo(base, new THREE.Matrix4().makeTranslation(x, y0 + 0.28, z), IRON);
  base.dispose();
  const collar = new THREE.CylinderGeometry(0.17, 0.12, 0.2, 6);
  b.paint.geo(collar, new THREE.Matrix4().makeTranslation(x, y0 + 4.2, z), IRON);
  collar.dispose();
  const lan = new THREE.CylinderGeometry(0.36, 0.22, 0.85, 4, 1);
  lan.rotateY(Math.PI / 4);
  b.glass.geo(lan, new THREE.Matrix4().makeTranslation(x, y0 + 4.78, z), (_x, y) => {
    const t = clamp((y - (y0 + 4.3)) / 0.85, 0, 1);
    return mixC(hex("#ffe3a6"), hex("#ffb24a"), t);
  });
  lan.dispose();
  const cap = new THREE.ConeGeometry(0.5, 0.4, 4);
  cap.rotateY(Math.PI / 4);
  b.paint.geo(cap, new THREE.Matrix4().makeTranslation(x, y0 + 5.4, z), IRON);
  cap.dispose();
  const ball = new THREE.SphereGeometry(0.09, 5, 4);
  b.paint.geo(ball, new THREE.Matrix4().makeTranslation(x, y0 + 5.65, z), GOLD);
  ball.dispose();
}

function addBollard(b: Buckets, x: number, y0: number, z: number) {
  const g = new THREE.CylinderGeometry(0.15, 0.18, 0.68, 7);
  b.paint.geo(g, new THREE.Matrix4().makeTranslation(x, y0 + 0.34, z), IRON);
  g.dispose();
  const t = new THREE.CylinderGeometry(0.17, 0.17, 0.1, 7);
  b.paint.geo(t, new THREE.Matrix4().makeTranslation(x, y0 + 0.62, z), hex("#d8d4c6"));
  t.dispose();
}

function addBicycle(b: Buckets, x: number, y0: number, z: number, rnd: () => number) {
  const col = [hex("#1a1a1c"), hex("#7a1c1c"), hex("#1e3a5a"), hex("#4b5a2a")][Math.floor(rnd() * 4)];
  // bicycle lies along Z, leaning on the quay
  for (const dz of [-0.55, 0.55]) {
    const w = new THREE.TorusGeometry(0.4, 0.035, 5, 14);
    w.rotateY(Math.PI / 2);
    b.paint.geo(w, new THREE.Matrix4().makeTranslation(x, y0 + 0.42, z + dz), IRON);
    w.dispose();
  }
  b.paint.box(x - 0.025, y0 + 0.42, z - 0.55, x + 0.025, y0 + 0.47, z + 0.55, col, 0);
  b.paint.box(x - 0.025, y0 + 0.42, z - 0.1, x + 0.025, y0 + 0.95, z - 0.04, col, 0);
  b.paint.box(x - 0.025, y0 + 0.9, z - 0.5, x + 0.025, y0 + 0.95, z - 0.0, col, 0);
  b.paint.box(x - 0.2, y0 + 0.95, z + 0.5, x + 0.2, y0 + 1.0, z + 0.54, IRON, 0);
  b.paint.box(x - 0.06, y0 + 0.98, z - 0.56, x + 0.06, y0 + 1.03, z - 0.3, IRON, 0);
}

const hash2 = (x: number, y: number, z: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

function addTree(b: Buckets, x: number, y0: number, z: number, rnd: () => number, leaf: RGB[]) {
  const trunk = new THREE.CylinderGeometry(0.2, 0.34, 5.4, 6);
  b.paint.geo(trunk, new THREE.Matrix4().makeTranslation(x, y0 + 2.7, z), hex("#4a3a2c"));
  trunk.dispose();
  const lobes = 4 + Math.floor(rnd() * 2);
  const baseLeaf = leaf[Math.floor(rnd() * leaf.length)];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + rnd();
    const rr = i === 0 ? 0 : 0.9 + rnd() * 0.9;
    const cy = y0 + 6.6 + (i === 0 ? 1.0 : rnd() * 1.6);
    const cx = x + Math.cos(a) * rr;
    const cz = z + Math.sin(a) * rr;
    const s = 1.7 + rnd() * 0.9;
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pa = g.getAttribute("position");
    for (let k = 0; k < pa.count; k++) {
      const px = pa.getX(k), py = pa.getY(k), pz = pa.getZ(k);
      const f = 1 + (hash2(px * 3 + i, py * 3, pz * 3 + z) - 0.5) * 0.4;
      pa.setXYZ(k, px * f, py * f * 0.88, pz * f);
    }
    g.computeVertexNormals();
    const tint = mixC(baseLeaf, leaf[Math.floor(rnd() * leaf.length)], rnd());
    b.paint.geo(g, new THREE.Matrix4().makeScale(s, s, s).premultiply(new THREE.Matrix4().makeTranslation(cx, cy, cz)), (_px, py, _pz, ny) => {
      const lit = 0.5 + 0.55 * clamp(ny * 0.5 + 0.5, 0, 1) + clamp((py - (y0 + 6)) * 0.05, 0, 0.25);
      return mulC(tint, lit);
    });
    g.dispose();
  }
}

const HULLS = [hex("#16202a"), hex("#1f3d2f"), hex("#6a2020"), hex("#263a5c"), hex("#2a2a2c")];
const CABINS = [hex("#e6dfcf"), hex("#c9d4c6"), hex("#d8c9a6"), hex("#b8c6d4"), hex("#8c6a48")];

/** Moored woonboot / barge lying along the quay wall. */
function addBoat(b: Buckets, side: number, zc: number, len: number, rnd: () => number, litP: number) {
  const B = 1.8;
  const cx = side * (CANAL_QUAY_X - 1.0);
  const hull = HULLS[Math.floor(rnd() * HULLS.length)];
  const outline: P2[] = [
    [cx - B / 2, zc - len / 2],
    [cx + B / 2, zc - len / 2],
    [cx + B / 2, zc + len / 2 - 1.5],
    [cx, zc + len / 2],
    [cx - B / 2, zc + len / 2 - 1.5],
  ];
  b.paint.prism(outline, "y", -0.9, 0.34, hull, 0);
  const inner: P2[] = outline.map((p): P2 => [cx + (p[0] - cx) * 0.9, zc + (p[1] - zc) * 0.96]);
  b.paint.prism(inner, "y", 0.34, 0.4, mulC(WOOD, 1.2), 0);
  b.paint.box(cx - B / 2 - 0.02, 0.2, zc - len / 2 + 0.05, cx - B / 2 + 0.02, 0.34, zc + len / 2 - 1.6, hex("#d8d2c0"), 0);
  b.paint.box(cx + B / 2 - 0.02, 0.2, zc - len / 2 + 0.05, cx + B / 2 + 0.02, 0.34, zc + len / 2 - 1.6, hex("#d8d2c0"), 0);
  const cab = CABINS[Math.floor(rnd() * CABINS.length)];
  const cl = len * (0.42 + rnd() * 0.18);
  const z0 = zc - len / 2 + 0.55;
  const cw = B * 0.4;
  b.paint.box(cx - cw, 0.4, z0, cx + cw, 1.75, z0 + cl, cab, 0);
  b.paint.box(cx - cw - 0.12, 1.75, z0 - 0.15, cx + cw + 0.12, 1.9, z0 + cl + 0.15, mulC(cab, 0.55), 0);
  const nWin = Math.max(2, Math.floor(cl / 1.1));
  for (let i = 0; i < nWin; i++) {
    const wz = z0 + (cl * (i + 0.5)) / nWin;
    const lit = rnd() < litP + 0.1;
    const gc = lit ? mulC(LIT_B, 0.9) : mulC(DARK_B, 0.7);
    b.glass.box(cx + cw, 0.85, wz - 0.28, cx + cw + 0.02, 1.5, wz + 0.28, gc, 0, 0b111110);
    b.glass.box(cx - cw - 0.02, 0.85, wz - 0.28, cx - cw, 1.5, wz + 0.28, gc, 0, 0b111101);
  }
  if (rnd() < 0.6) {
    // flower box / crates on the fore-deck
    b.paint.box(cx - 0.4, 0.4, z0 + cl + 0.4, cx + 0.4, 0.75, z0 + cl + 0.8, hex("#5c4630"), 0);
    b.paint.box(cx - 0.36, 0.75, z0 + cl + 0.42, cx + 0.36, 0.95, z0 + cl + 0.78, hex("#b5453a"), 0);
  }
}

/* ------------------------------------------------------------------ */
/* Westerkerk-style church tower                                       */
/* ------------------------------------------------------------------ */

/** Brick tower, clock stage, octagonal lantern, blue-and-gold imperial crown and spire.
    Built around (0,0) on y = 0, scaled 1.25x, then moved to (tx, ty, tz). ~75 m tall. */
const TOWER_SCALE = 1.25;

function buildTower(b: Buckets, tx: number, ty: number, tz: number, brick: RGB, trim: RGB) {
  const start = marks(b);
  const S1 = 3.5; // half width of stage 1
  const H1 = 26;
  const S2 = 2.8;
  const H2 = 10;
  b.brick.box(-S1, 0, -S1, S1, H1, S1, brick, TILE, 8);
  b.stone.box(-S1 - 0.35, 0, -S1 - 0.35, S1 + 0.35, 1.4, S1 + 0.35, mulC(trim, 0.7), TILE, 8);
  for (const y of [8.5, 17.5, H1 - 0.3]) b.stone.box(-S1 - 0.2, y, -S1 - 0.2, S1 + 0.2, y + 0.4, S1 + 0.2, trim, TILE);
  // corner buttress strips
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const xa = sx > 0 ? S1 - 0.3 : -S1 - 0.2;
      const za = sz > 0 ? S1 - 0.3 : -S1 - 0.2;
      b.stone.box(xa, 1.4, za, xa + 0.5, H1, za + 0.5, mulC(trim, 0.92), TILE);
    }
  }
  b.brick.box(-S2, H1, -S2, S2, H1 + H2, S2, brick, TILE, 8);
  b.stone.box(-S2 - 0.25, H1 + H2 - 0.2, -S2 - 0.25, S2 + 0.25, H1 + H2 + 0.3, S2 + 0.25, trim, TILE);

  // per-face detail: tall arched louvres in stage 1, clock in stage 2 (built on +X, rotated ×4)
  for (let k = 0; k < 4; k++) {
    const m = marks(b);
    for (const zz of [-1.3, 1.3]) {
      b.glass.glassX(S1 + 0.04, zz - 0.55, zz + 0.55, 12.5, 16.5, mulC(DARK_B, 0.5), mulC(DARK_T, 0.7));
      b.stone.box(S1, 12.4, zz - 0.8, S1 + 0.14, 12.7, zz + 0.8, trim, TILE, 2);
      b.stone.box(S1, 16.5, zz - 0.8, S1 + 0.14, 17.0, zz + 0.8, trim, TILE, 2);
      b.stone.box(S1, 12.4, zz - 0.8, S1 + 0.14, 17.0, zz - 0.58, trim, TILE, 2);
      b.stone.box(S1, 12.4, zz + 0.58, S1 + 0.14, 17.0, zz + 0.8, trim, TILE, 2);
    }
    b.glass.glassX(S1 + 0.04, -0.4, 0.4, 20.5, 24.2, mulC(LIT_B, 0.55), mulC(LIT_T, 0.5));
    // clock face
    const disc = new THREE.CylinderGeometry(1.9, 1.9, 0.14, 24);
    disc.rotateZ(Math.PI / 2);
    b.paint.geo(disc, new THREE.Matrix4().makeTranslation(S2 + 0.1, H1 + 5.4, 0), hex("#ece6d2"));
    disc.dispose();
    const ring = new THREE.TorusGeometry(1.95, 0.09, 6, 28);
    ring.rotateY(Math.PI / 2);
    b.paint.geo(ring, new THREE.Matrix4().makeTranslation(S2 + 0.12, H1 + 5.4, 0), GOLD);
    ring.dispose();
    b.paint.box(S2 + 0.17, H1 + 5.4, -0.07, S2 + 0.22, H1 + 6.9, 0.07, IRON, 0);
    b.paint.box(S2 + 0.17, H1 + 5.33, 0, S2 + 0.22, H1 + 5.47, 1.2, IRON, 0);
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2;
      b.paint.box(S2 + 0.17, H1 + 5.4 + Math.cos(a) * 1.6 - 0.05, Math.sin(a) * 1.6 - 0.05, S2 + 0.21, H1 + 5.4 + Math.cos(a) * 1.6 + 0.05, Math.sin(a) * 1.6 + 0.05, GOLD, 0);
    }
    b.stone.box(S2, H1 + 1.0, -1.0, S2 + 0.16, H1 + 1.2, 1.0, trim, TILE, 2);
    b.stone.box(S2, H1 + 9.0, -1.0, S2 + 0.16, H1 + 9.2, 1.0, trim, TILE, 2);
    placeAll(b, m, (k * Math.PI) / 2, 0, 0, 0);
  }

  // octagonal open lantern
  const yL = H1 + H2 + 0.3;
  const oct = new THREE.CylinderGeometry(2.7, 2.95, 6.6, 8, 1);
  oct.rotateY(Math.PI / 8);
  b.stone.geo(oct, new THREE.Matrix4().makeTranslation(0, yL + 3.3, 0), mulC(trim, 0.95), TILE);
  oct.dispose();
  for (let k = 0; k < 8; k++) {
    const m = marks(b);
    const ap = 2.78;
    b.glass.glassX(ap, -0.5, 0.5, yL + 1.4, yL + 5.0, mulC(LIT_B, 0.75), mulC(LIT_T, 0.7));
    b.stone.box(ap - 0.1, yL + 1.3, -0.72, ap + 0.1, yL + 1.45, 0.72, trim, TILE, 2);
    placeAll(b, m, (k * Math.PI) / 4, 0, 0, 0);
  }
  b.paint.geo(new THREE.CylinderGeometry(3.15, 3.15, 0.35, 8), new THREE.Matrix4().makeTranslation(0, yL + 6.75, 0), GOLD);

  // imperial crown: four copper arch ribs meeting at an orb
  const yC = yL + 6.9;
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const dx = Math.cos(a), dz = Math.sin(a);
    const pts = [
      new THREE.Vector3(dx * 2.3, yC, dz * 2.3),
      new THREE.Vector3(dx * 2.9, yC + 1.6, dz * 2.9),
      new THREE.Vector3(dx * 2.3, yC + 3.4, dz * 2.3),
      new THREE.Vector3(dx * 1.0, yC + 5.0, dz * 1.0),
      new THREE.Vector3(0, yC + 5.7, 0),
    ];
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.2, 5, false);
    b.paint.geo(tube, null, COPPER);
    tube.dispose();
    const pearl = new THREE.SphereGeometry(0.26, 6, 4);
    b.paint.geo(pearl, new THREE.Matrix4().makeTranslation(dx * 2.9, yC + 1.6, dz * 2.9), GOLD);
    pearl.dispose();
  }
  const orb = new THREE.SphereGeometry(0.85, 10, 8);
  b.paint.geo(orb, new THREE.Matrix4().makeTranslation(0, yC + 6.1, 0), GOLD);
  orb.dispose();
  const spire = new THREE.ConeGeometry(0.62, 7.5, 8);
  b.paint.geo(spire, new THREE.Matrix4().makeTranslation(0, yC + 10.4, 0), COPPER);
  spire.dispose();
  const ball = new THREE.SphereGeometry(0.34, 7, 5);
  b.paint.geo(ball, new THREE.Matrix4().makeTranslation(0, yC + 14.3, 0), GOLD);
  ball.dispose();
  b.paint.box(-0.05, yC + 14.5, -0.05, 0.05, yC + 16.1, 0.05, GOLD, 0);
  b.paint.box(-0.45, yC + 15.4, -0.04, 0.45, yC + 15.5, 0.04, GOLD, 0);
  placeAll(b, start, 0, tx, ty, tz, 0, 0, TOWER_SCALE);
}

/* ------------------------------------------------------------------ */
/* humpback stone bridge                                               */
/* ------------------------------------------------------------------ */

const BRIDGE_CROWN = 11.2; // deck height at the crown
const ARCH_SPRING = 3.2;
const ARCH_RISE = 6.8; // crown soffit = 10.0 — clears the 7 m chase camera
const BRIDGE_HALF_SPAN = CANAL_QUAY_X;
const BRIDGE_END = 23;
const BRIDGE_HALF_W = 3.9;

const deckY = (x: number) => CANAL_STREET_Y + (BRIDGE_CROWN - CANAL_STREET_Y) * (1 - (x / BRIDGE_END) ** 2);
const soffitY = (x: number) => ARCH_SPRING + ARCH_RISE * Math.sqrt(Math.max(0, 1 - (x / BRIDGE_HALF_SPAN) ** 2));

/** Single wide elliptical arch over the whole channel, parapets, keystones and four lanterns.
    Returns the lamp positions so the engine can add glow. */
function buildBridge(b: Buckets, trim: RGB, lamps: V3[]) {
  const stoneC = mulC(trim, 0.82);
  const NS = 28;
  const upper: P2[] = [];
  for (let i = 0; i <= NS; i++) {
    const x = lerp(-BRIDGE_END, BRIDGE_END, i / NS);
    upper.push([x, deckY(x)]);
  }
  const lower: P2[] = [[BRIDGE_END, CANAL_STREET_Y], [BRIDGE_HALF_SPAN, CANAL_STREET_Y], [BRIDGE_HALF_SPAN, ARCH_SPRING]];
  const NA = 26;
  for (let i = 1; i < NA; i++) {
    const x = lerp(BRIDGE_HALF_SPAN, -BRIDGE_HALF_SPAN, i / NA);
    lower.push([x, soffitY(x)]);
  }
  lower.push([-BRIDGE_HALF_SPAN, ARCH_SPRING], [-BRIDGE_HALF_SPAN, CANAL_STREET_Y], [-BRIDGE_END, CANAL_STREET_Y]);

  // arch shadow gradient: dark at the soffit, full colour a few metres up the spandrel
  b.stone.shade = (x, y) => {
    if (Math.abs(x) > BRIDGE_HALF_SPAN + 0.2) return 1;
    return lerp(0.42, 1, smooth((y - soffitY(x)) / 3.2));
  };
  b.stone.prism(upper.concat(lower), "z", -BRIDGE_HALF_W, BRIDGE_HALF_W, stoneC, TILE);
  b.stone.shade = null;

  // paver road surface laid on the deck
  const roadTop: P2[] = [];
  for (let i = 0; i <= NS; i++) roadTop.push([upper[i][0], upper[i][1] + 0.05]);
  b.brick.prism(upper.concat(roadTop.slice().reverse()), "z", -BRIDGE_HALF_W + 0.5, BRIDGE_HALF_W - 0.5, PAVER, TILE);

  // parapets + coping
  for (const sz of [-1, 1]) {
    const z0 = sz < 0 ? -BRIDGE_HALF_W : BRIDGE_HALF_W - 0.5;
    const par: P2[] = upper.map((p): P2 => [p[0], p[1] + 0.95]);
    b.stone.prism(upper.concat(par.slice().reverse()), "z", z0, z0 + 0.5, stoneC, TILE);
    const cap: P2[] = upper.map((p): P2 => [p[0], p[1] + 1.12]);
    b.stone.prism(par.concat(cap.slice().reverse()), "z", z0 - 0.1, z0 + 0.6, trim, TILE);
  }
  // keystones + arch ring accent
  for (const sz of [-1, 1]) {
    const zf = sz * BRIDGE_HALF_W;
    b.stone.box(-0.55, soffitY(0) - 0.35, Math.min(zf, zf + sz * 0.12), 0.55, soffitY(0) + 1.5, Math.max(zf, zf + sz * 0.12), trim, TILE);
    for (let i = -6; i <= 6; i++) {
      if (i === 0) continue;
      const x = (i / 6) * (BRIDGE_HALF_SPAN - 1.4);
      const y = soffitY(x);
      b.stone.box(x - 0.28, y - 0.1, Math.min(zf, zf + sz * 0.08), x + 0.28, y + 0.7, Math.max(zf, zf + sz * 0.08), mulC(trim, 0.92), TILE);
    }
  }
  // lanterns on the parapets and finial balls at the abutments
  for (const x of [-9.5, 9.5]) {
    for (const sz of [-1, 1]) {
      const z = sz * (BRIDGE_HALF_W - 0.25);
      const y = deckY(x) + 1.12;
      addLamp(b, x, y, z);
      lamps.push([x, y + 4.8, z]);
    }
  }
  for (const x of [-BRIDGE_END + 0.6, BRIDGE_END - 0.6]) {
    for (const sz of [-1, 1]) {
      const g = new THREE.SphereGeometry(0.42, 8, 6);
      b.stone.geo(g, new THREE.Matrix4().makeTranslation(x, deckY(x) + 1.55, sz * (BRIDGE_HALF_W - 0.25)), trim, TILE);
      g.dispose();
    }
  }
}

/* ------------------------------------------------------------------ */
/* block composer                                                      */
/* ------------------------------------------------------------------ */

export type CanalBlockKind = "plain" | "bridge" | "tower";

export interface CanalBlock {
  brick: THREE.BufferGeometry;
  stone: THREE.BufferGeometry;
  paint: THREE.BufferGeometry;
  roof: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  /** world-space (block-local) lantern glow positions, for sprites/lights */
  lamps: V3[];
  length: number;
  district: number;
  kind: CanalBlockKind;
}

function layRow(
  b: Buckets,
  rnd: () => number,
  d: CanalDistrict,
  side: number,
  xFront: number,
  zFrom: number,
  zTo: number,
  avgW: number,
  detail: 0 | 1,
  quality: "high" | "low",
) {
  const span = zTo - zFrom;
  if (span < 3) return;
  const n = Math.max(1, Math.round(span / avgW));
  const ws: number[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.8 + rnd() * 0.5;
    ws.push(w);
    sum += w;
  }
  let z = zFrom;
  for (let i = 0; i < n; i++) {
    const W = (ws[i] / sum) * span;
    const spec = houseSpec(d, rnd, side > 0 ? -(z + W) : z, W, detail, quality);
    const m = marks(b);
    buildHouse(b, spec, rnd);
    const jitter = (rnd() - 0.5) * (detail ? 0.32 : 1.2);
    placeAll(b, m, side > 0 ? Math.PI : 0, side * (xFront + jitter), CANAL_STREET_Y, 0, rnd() * 0.02, (rnd() - 0.5) * 0.012);
    z += W;
  }
}

export function makeCanalBlock(seed: number, districtIdx: number, kind: CanalBlockKind = "plain", quality: "high" | "low" = "high"): CanalBlock {
  const rnd = seededRand(seed * 7.31 + districtIdx * 13.7 + (kind === "bridge" ? 3 : kind === "tower" ? 5 : 0));
  const d = CANAL_DISTRICTS[districtIdx];
  const b = newBuckets();
  const L = CANAL_BLOCK_LENGTH;
  const half = L / 2;
  const lamps: V3[] = [];
  const gap = kind === "bridge" ? 4.7 : 0;
  const towerSide = rnd() < 0.5 ? -1 : 1;

  for (const side of [-1, 1]) {
    // quay wall (mossy at the waterline), coping, paved quay + back-lots
    const xs = (a: number, c: number): [number, number] => (side > 0 ? [a, c] : [-c, -a]);
    const [w0, w1] = xs(CANAL_QUAY_X, CANAL_QUAY_X + 0.8);
    b.stone.shade = (_x, y) => (y < 0.3 ? 0.5 : y < 1.0 ? lerp(0.5, 1, (y - 0.3) / 0.7) : 1);
    b.stone.box(w0, -6, -half, w1, CANAL_STREET_Y, half, mulC(hex("#9d9686"), 1), TILE, 8 | 16 | 32);
    b.stone.shade = null;
    const [c0, c1] = xs(CANAL_QUAY_X - 0.1, CANAL_QUAY_X + 0.95);
    b.stone.box(c0, CANAL_STREET_Y, -half, c1, CANAL_STREET_Y + 0.16, half, hex("#c9c1ae"), TILE, 8 | 16 | 32);
    const [s0, s1] = xs(CANAL_QUAY_X + 0.8, 74);
    b.brick.box(s0, -1, -half, s1, CANAL_STREET_Y, half, PAVER, TILE, 8 | 16 | 32);

    // rows of houses
    const rowFronts: Array<[number, number, 0 | 1]> = [
      [CANAL_HOUSE_X, 7.0, 1],
      [FAR_ROW_1, 9.0, 0],
      [FAR_ROW_2 + 1.5, 10.5, 0],
    ];
    for (const [xf, avg, det] of rowFronts) {
      const clearTower = kind === "tower" && side === towerSide && xf > CANAL_HOUSE_X + 1;
      if (gap > 0) {
        layRow(b, rnd, d, side, xf, -half, -gap, avg, det, quality);
        layRow(b, rnd, d, side, xf, gap, half, avg, det, quality);
      } else if (clearTower) {
        layRow(b, rnd, d, side, xf, -half, -9, avg, det, quality);
        layRow(b, rnd, d, side, xf, 9, half, avg, det, quality);
      } else layRow(b, rnd, d, side, xf, -half, half, avg, det, quality);
    }

    // lamps, bollards, bikes
    const lampX = side * (CANAL_QUAY_X + 1.25);
    for (let z = -half + 4 + rnd() * 3; z < half - 2; z += 11 + rnd() * 4) {
      if (Math.abs(z) < gap + 2.2) continue;
      addLamp(b, lampX, CANAL_STREET_Y, z);
      lamps.push([lampX, CANAL_STREET_Y + 4.8, z]);
      if (rnd() < 0.5) addBicycle(b, side * (CANAL_QUAY_X + 1.9), CANAL_STREET_Y, z + 0.9, rnd);
    }
    for (let z = -half + 2; z < half; z += 6.5) {
      if (Math.abs(z) < gap + 1.5) continue;
      addBollard(b, side * (CANAL_QUAY_X + 0.45), CANAL_STREET_Y + 0.16, z + (rnd() - 0.5) * 1.2);
    }

    // plane trees along the quay
    for (let z = -half + 6 + rnd() * 5; z < half - 4; z += 14 + rnd() * 6) {
      if (Math.abs(z) < gap + 4.5) continue;
      addTree(b, side * (CANAL_QUAY_X + 2.65), CANAL_STREET_Y, z, rnd, d.leaf);
    }

    // moored houseboats hugging the wall
    let zb = -half + 3 + rnd() * 4;
    while (zb < half - 5) {
      const len = 4.5 + rnd() * 3.2;
      const zc = zb + len / 2;
      const clear = gap === 0 || Math.abs(zc) > gap + len / 2 + 1;
      if (rnd() < 0.42 && clear && zc + len / 2 < half - 0.5) addBoat(b, side, zc, len, rnd, d.lit);
      zb += len + 2 + rnd() * 9;
    }
  }

  if (kind === "bridge") buildBridge(b, d.trims[0], lamps);
  if (kind === "tower") {
    buildTower(b, towerSide * (FAR_ROW_1 + 6.2), CANAL_STREET_Y, 0, d.bricks[0], d.trims[0]);
  }

  const out: CanalBlock = {
    brick: b.brick.build(),
    stone: b.stone.build(),
    paint: b.paint.build(),
    roof: b.roof.build(),
    glass: b.glass.build(),
    lamps,
    length: L,
    district: districtIdx,
    kind,
  };
  return out;
}

/** Convenience: all three block kinds for one district (plain A, plain B, feature). */
export function makeCanalDistrictBlocks(districtIdx: number, quality: "high" | "low" = "high"): CanalBlock[] {
  const feature: CanalBlockKind = districtIdx === 1 || districtIdx === 3 ? "tower" : "bridge";
  return [
    makeCanalBlock(11 + districtIdx * 3.1, districtIdx, "plain", quality),
    makeCanalBlock(29 + districtIdx * 5.3, districtIdx, "plain", quality),
    makeCanalBlock(47 + districtIdx * 2.9, districtIdx, feature, quality),
  ];
}

/* ------------------------------------------------------------------ */
/* Canal Mode City Obstacles                                           */
/* ------------------------------------------------------------------ */

export interface CanalJettyRig {
  group: THREE.Group;
  lanternMat: THREE.MeshStandardMaterial;
  halo: THREE.Sprite;
  length: number;
}

export interface CanalBargeRig {
  group: THREE.Group;
  lanternMat: THREE.MeshStandardMaterial;
  halo: THREE.Sprite;
  halfW: number;
  halfL: number;
}

/** 1. Dutch mooring dolphin ("ducdalf"): lashed oak harbor pilings with iron bands & painted caps. */
export function makeCanalPilingGeometry(seed: number): THREE.BufferGeometry {
  const rnd = seededRand(seed);
  const m = new Mesher();
  const oakDark = hex("#3b281a");
  const oakWet = hex("#261a12");
  const redCap = hex("#9c2d23");

  const count = 4;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.45;
    const rad = i === 0 ? 0.05 : 0.36 + rnd() * 0.1;
    const h = i === 0 ? 2.15 : 1.7 + rnd() * 0.35;
    const rBot = i === 0 ? 0.22 : 0.17 + rnd() * 0.03;
    const rTop = rBot * 0.86;
    const px = Math.cos(a) * rad;
    const pz = Math.sin(a) * rad;
    const tiltX = -Math.sin(a) * 0.07;
    const tiltZ = Math.cos(a) * 0.07;

    const cyl = new THREE.CylinderGeometry(rTop, rBot, h, 8);
    const mat = new THREE.Matrix4()
      .makeRotationFromEuler(new THREE.Euler(tiltX, rnd() * 0.5, tiltZ))
      .setPosition(px, h * 0.5 - 0.55, pz);
    m.geo(cyl, mat, (_x, y) => (y < 0.2 ? oakWet : oakDark));
    cyl.dispose();

    const cap = new THREE.CylinderGeometry(rTop * 0.94, rTop * 1.02, 0.22, 8);
    const capMat = new THREE.Matrix4()
      .makeRotationFromEuler(new THREE.Euler(tiltX, 0, tiltZ))
      .setPosition(px - tiltZ * (h * 0.5), h - 0.55 + 0.06, pz + tiltX * (h * 0.5));
    m.geo(cap, capMat, i === 0 ? redCap : WHITE_PAINT);
    cap.dispose();
  }

  for (const bandY of [0.38, 0.92]) {
    const band = new THREE.TorusGeometry(0.46, 0.045, 6, 16);
    band.rotateX(Math.PI / 2);
    m.geo(band, new THREE.Matrix4().makeTranslation(0, bandY, 0), IRON);
    band.dispose();
  }

  return m.build();
}

/** 2. Canal harbor hazard buoy: riveted conical float + iron lantern cage fitting y=0.96 beacon. */
export function makeCanalBuoyBodyGeometry(): THREE.BufferGeometry {
  const m = new Mesher();
  const hullRed = hex("#9f2920");
  const hullDark = hex("#262b30");

  const floatBase = new THREE.CylinderGeometry(0.62, 0.72, 0.44, 12);
  m.geo(floatBase, new THREE.Matrix4().makeTranslation(0, 0.02, 0), (_x, y) =>
    y < -0.02 ? hullDark : hullRed,
  );
  floatBase.dispose();

  const cone = new THREE.CylinderGeometry(0.28, 0.58, 0.32, 12);
  m.geo(cone, new THREE.Matrix4().makeTranslation(0, 0.36, 0), hullRed);
  cone.dispose();

  const deckRing = new THREE.TorusGeometry(0.62, 0.045, 6, 16);
  deckRing.rotateX(Math.PI / 2);
  m.geo(deckRing, new THREE.Matrix4().makeTranslation(0, 0.24, 0), WHITE_PAINT);
  deckRing.dispose();

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const strut = new THREE.CylinderGeometry(0.032, 0.038, 0.52, 5);
    const rx = Math.cos(a) * 0.24;
    const rz = Math.sin(a) * 0.24;
    const mat = new THREE.Matrix4()
      .makeRotationFromEuler(new THREE.Euler(Math.sin(a) * 0.26, 0, -Math.cos(a) * 0.26))
      .setPosition(rx, 0.64, rz);
    m.geo(strut, mat, IRON);
    strut.dispose();
  }

  const topCollar = new THREE.CylinderGeometry(0.22, 0.24, 0.08, 10);
  m.geo(topCollar, new THREE.Matrix4().makeTranslation(0, 0.87, 0), IRON);
  topCollar.dispose();

  return m.build();
}

/** 3. Floating lashed timber cargo raft with merchant crates and strapped barrel. */
export function makeCanalCargoRaftGeometry(seed: number): THREE.BufferGeometry {
  const rnd = seededRand(seed);
  const m = new Mesher();
  const baulk = hex("#5a3e28");
  const crateLight = hex("#8f6b43");
  const crateDark = hex("#6b4c2d");
  const rope = hex("#b69b6b");

  // 4 squared oak baulk timbers aligned along X (-3.15 .. +3.15)
  for (let i = 0; i < 4; i++) {
    const z = -0.48 + i * 0.32;
    const tint = mixC(baulk, WOOD, (i % 2) * 0.35 + rnd() * 0.15);
    m.box(-3.15, -0.16, z - 0.13, 3.15, 0.2, z + 0.13, tint, 0);
  }
  // cross cleats & rope lashings
  for (const cx of [-2.3, 0, 2.3]) {
    m.box(cx - 0.14, 0.2, -0.66, cx + 0.14, 0.3, 0.66, WOOD, 0);
    m.box(cx - 0.06, 0.29, -0.64, cx + 0.06, 0.33, 0.64, rope, 0);
  }
  // merchant cargo crates
  m.box(-1.55, 0.3, -0.4, -0.55, 1.05, 0.42, crateLight, 0);
  m.box(-1.57, 0.62, -0.42, -0.53, 0.7, 0.44, IRON, 0);
  m.box(0.55, 0.3, -0.34, 1.35, 0.86, 0.36, crateDark, 0);

  // strapped cargo barrel
  const barrel = new THREE.CylinderGeometry(0.28, 0.28, 0.74, 10);
  barrel.rotateZ(Math.PI / 2);
  m.geo(barrel, new THREE.Matrix4().makeTranslation(1.85, 0.56, 0.05), hex("#6d4527"));
  barrel.dispose();
  for (const hx of [1.62, 2.08]) {
    const hoop = new THREE.TorusGeometry(0.29, 0.024, 5, 12);
    hoop.rotateY(Math.PI / 2);
    m.geo(hoop, new THREE.Matrix4().makeTranslation(hx, 0.56, 0.05), IRON);
    hoop.dispose();
  }

  return m.build();
}

/** 4. Quay repair jetty / wooden pier extending inward along +X from x=0 to x=length. */
export function makeCanalJettyGroup(
  glowTex: THREE.Texture,
  paintMat: THREE.Material,
  length = 8.4,
): CanalJettyRig {
  const group = new THREE.Group();
  const m = new Mesher();
  const deckCol = hex("#654930");
  const stringerCol = hex("#3d2a1b");
  const pilingCol = hex("#2f2014");

  // Main side stringers
  for (const sz of [-0.95, 0.95]) {
    m.box(0, 0.48, sz - 0.1, length - 0.15, 0.72, sz + 0.1, stringerCol, 0);
  }
  // Transverse oak planks
  const nPlanks = Math.floor(length / 0.48);
  for (let i = 0; i < nPlanks; i++) {
    const px = 0.24 + i * (length / nPlanks);
    const shade = i % 3 === 0 ? 0.92 : i % 2 === 0 ? 1.0 : 1.07;
    m.box(px - 0.18, 0.72, -1.16, px + 0.18, 0.82, 1.16, mulC(deckCol, shade), 0);
  }
  // Driven pier pilings + cross braces
  for (let x = 1.6; x <= length - 0.3; x += 2.2) {
    for (const sz of [-1.05, 1.05]) {
      const post = new THREE.CylinderGeometry(0.14, 0.16, 2.15, 7);
      m.geo(post, new THREE.Matrix4().makeTranslation(x, 0.38, sz), pilingCol);
      post.dispose();
    }
    m.box(x - 0.08, 0.3, -1.05, x + 0.08, 0.46, 1.05, stringerCol, 0);
  }
  // Quay-end supply crate & warning lantern post at tip
  m.box(1.1, 0.82, -0.75, 2.0, 1.56, 0.1, hex("#8b673f"), 0);
  const tipX = length - 0.45;
  const lampPost = new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6);
  m.geo(lampPost, new THREE.Matrix4().makeTranslation(tipX, 1.85, 0), IRON);
  lampPost.dispose();
  const cap = new THREE.ConeGeometry(0.28, 0.24, 4);
  cap.rotateY(Math.PI / 4);
  m.geo(cap, new THREE.Matrix4().makeTranslation(tipX, 3.24, 0), IRON);
  cap.dispose();

  const bodyMesh = new THREE.Mesh(m.build(), paintMat);
  group.add(bodyMesh);

  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xffd27a,
    emissive: new THREE.Color(1.0, 0.65, 0.24),
    emissiveIntensity: 3.4,
    roughness: 0.25,
    fog: false,
  });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, 0.42, 4), lanternMat);
  glass.rotation.y = Math.PI / 4;
  glass.position.set(tipX, 2.95, 0);
  group.add(glass);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: new THREE.Color(1.0, 0.72, 0.34),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.85,
      fog: false,
    }),
  );
  halo.scale.setScalar(3.4);
  halo.position.set(tipX, 2.95, 0);
  group.add(halo);

  return { group, lanternMat, halo, length };
}

/** 5. Cruising Dutch canal supply barge / cargo skiff (~7.8m long, bow facing +Z). */
export function makeCanalBargeRig(
  seed: number,
  glowTex: THREE.Texture,
  paintMat: THREE.Material,
): CanalBargeRig {
  const rnd = seededRand(seed);
  const group = new THREE.Group();
  const m = new Mesher();

  const halfW = 1.15;
  const halfL = 3.9;
  const hullC = HULLS[Math.floor(rnd() * HULLS.length)];
  const cabinC = CABINS[Math.floor(rnd() * CABINS.length)];
  const tarpC = hex("#6c6448");
  const stripeC = hex("#dcd4be");

  // Rounded-bow barge hull extruded vertically
  const outline: P2[] = [
    [-halfW * 0.92, -halfL],
    [halfW * 0.92, -halfL],
    [halfW, -halfL + 1.1],
    [halfW, halfL - 1.65],
    [0, halfL],
    [-halfW, halfL - 1.65],
    [-halfW, -halfL + 1.1],
  ];
  m.prism(outline, "y", -0.55, 0.56, hullC, 0);

  // Sheer gunwale stripe & oak deck
  const deckPoly: P2[] = outline.map((p): P2 => [p[0] * 0.88, p[1] * 0.95]);
  m.prism(deckPoly, "y", 0.56, 0.64, mulC(WOOD, 1.25), 0);
  m.box(-halfW - 0.02, 0.38, -halfL + 1.1, -halfW + 0.03, 0.52, halfL - 1.7, stripeC, 0);
  m.box(halfW - 0.03, 0.38, -halfL + 1.1, halfW + 0.02, 0.52, halfL - 1.7, stripeC, 0);

  // Forward canvas-tarped cargo hold
  m.box(-0.74, 0.64, -0.3, 0.74, 1.38, 2.05, tarpC, 0);
  m.box(-0.62, 1.38, -0.2, 0.62, 1.56, 1.95, mulC(tarpC, 0.88), 0);

  // Aft wheelhouse cabin
  m.box(-0.78, 0.64, -3.1, 0.78, 2.05, -0.85, cabinC, 0);
  m.box(-0.88, 2.05, -3.22, 0.88, 2.2, -0.75, mulC(cabinC, 0.55), 0);
  // Dark wood rudder/tiller at stern
  m.box(-0.07, 0.0, -halfL - 0.35, 0.07, 0.8, -halfL + 0.05, WOOD, 0);

  // Bow lantern bracket
  const post = new THREE.CylinderGeometry(0.04, 0.05, 0.85, 5);
  m.geo(post, new THREE.Matrix4().makeTranslation(0, 1.02, halfL - 0.45), IRON);
  post.dispose();

  const bodyMesh = new THREE.Mesh(m.build(), paintMat);
  group.add(bodyMesh);

  // Warm cabin windows + bow lantern
  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xffd27a,
    emissive: new THREE.Color(1.0, 0.62, 0.22),
    emissiveIntensity: 3.6,
    roughness: 0.25,
    fog: false,
  });
  const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.46), lanternMat);
  frontGlass.position.set(0, 1.55, -0.84);
  group.add(frontGlass);
  const backGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.46), lanternMat);
  backGlass.rotation.y = Math.PI;
  backGlass.position.set(0, 1.55, -3.11);
  group.add(backGlass);

  const bowLamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), lanternMat);
  bowLamp.position.set(0, 1.48, halfL - 0.45);
  group.add(bowLamp);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: new THREE.Color(1.0, 0.72, 0.34),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.85,
      fog: false,
    }),
  );
  halo.scale.setScalar(3.2);
  halo.position.copy(bowLamp.position);
  group.add(halo);

  return { group, lanternMat, halo, halfW, halfL };
}

export interface CanalLanternFloatRig {
  group: THREE.Group;
  coreMat: THREE.MeshStandardMaterial;
  halo: THREE.Sprite;
  satellites: THREE.Group;
}

/** 6. Grand Festival Lantern Float: gilded Dutch canal chandelier pontoon awarding bonus Lights. */
export function makeCanalLanternFloatRig(
  glowTex: THREE.Texture,
  paintMat: THREE.Material,
): CanalLanternFloatRig {
  const group = new THREE.Group();
  const m = new Mesher();

  // Ornate octagonal dark-oak & gold-trimmed floating pontoon ring
  const ringHull = new THREE.CylinderGeometry(1.42, 1.18, 0.36, 8);
  m.geo(ringHull, new THREE.Matrix4().makeTranslation(0, -0.04, 0), hex("#382315"));
  ringHull.dispose();

  const goldRim = new THREE.TorusGeometry(1.38, 0.065, 6, 16);
  goldRim.rotateX(Math.PI / 2);
  m.geo(goldRim, new THREE.Matrix4().makeTranslation(0, 0.16, 0), GOLD);
  goldRim.dispose();

  // 4 curved wrought-iron & gold filigree arches supporting the grand lantern
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const pts = [
      new THREE.Vector3(dx * 1.24, 0.16, dz * 1.24),
      new THREE.Vector3(dx * 1.38, 1.15, dz * 1.38),
      new THREE.Vector3(dx * 0.92, 2.25, dz * 0.92),
      new THREE.Vector3(dx * 0.25, 2.68, dz * 0.25),
    ];
    const rib = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.055, 5, false);
    m.geo(rib, null, IRON);
    rib.dispose();

    // Small perimeter brass candle pedestals on pontoon corners
    const cup = new THREE.CylinderGeometry(0.09, 0.07, 0.26, 6);
    m.geo(cup, new THREE.Matrix4().makeTranslation(dx * 1.24, 0.29, dz * 1.24), GOLD);
    cup.dispose();
  }

  // Crown collar & gilded Dutch finial spire atop the dome
  const crown = new THREE.CylinderGeometry(0.55, 0.85, 0.24, 8);
  m.geo(crown, new THREE.Matrix4().makeTranslation(0, 2.48, 0), GOLD);
  crown.dispose();

  const spire = new THREE.ConeGeometry(0.24, 0.85, 8);
  m.geo(spire, new THREE.Matrix4().makeTranslation(0, 3.02, 0), GOLD);
  spire.dispose();

  const orb = new THREE.SphereGeometry(0.16, 8, 6);
  m.geo(orb, new THREE.Matrix4().makeTranslation(0, 3.52, 0), GOLD);
  orb.dispose();

  group.add(new THREE.Mesh(m.build(), paintMat));

  // Giant faceted glowing stained-glass octagon core
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xffe49e,
    emissive: new THREE.Color(1.0, 0.72, 0.22),
    emissiveIntensity: 3.0,
    transparent: true,
    opacity: 0.94,
    roughness: 0.22,
    fog: false,
  });
  const coreDome = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.76, 1.55, 8), coreMat);
  coreDome.position.y = 1.62;
  group.add(coreDome);

  // Turquoise-gold filigree equatorial band around core glass
  const bandMesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.86, 0.045, 6, 16),
    new THREE.MeshStandardMaterial({
      color: 0x2f7a74,
      emissive: new THREE.Color(0.25, 0.85, 0.78),
      emissiveIntensity: 1.6,
      roughness: 0.3,
      fog: false,
    }),
  );
  bandMesh.rotation.x = Math.PI / 2;
  bandMesh.position.y = 1.62;
  group.add(bandMesh);

  // Bright warm festival halo visible far down the canal
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: new THREE.Color(1.0, 0.76, 0.28),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.78,
      fog: false,
    }),
  );
  halo.scale.setScalar(5.8);
  halo.position.y = 1.65;
  group.add(halo);

  // 6 orbiting miniature glowing paper/glass lanterns circling the pavilion
  const satellites = new THREE.Group();
  const satMat = new THREE.MeshStandardMaterial({
    color: 0xffefc2,
    emissive: new THREE.Color(1.0, 0.78, 0.32),
    emissiveIntensity: 3.2,
    roughness: 0.25,
    fog: false,
  });
  const satGeo = new THREE.OctahedronGeometry(0.16, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const orbMesh = new THREE.Mesh(satGeo, satMat);
    orbMesh.position.set(Math.cos(a) * 1.55, 1.65 + (i % 2) * 0.45, Math.sin(a) * 1.55);
    satellites.add(orbMesh);
  }
  group.add(satellites);

  return { group, coreMat, halo, satellites };
}
