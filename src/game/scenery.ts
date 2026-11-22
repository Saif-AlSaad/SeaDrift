/* Procedural scenery & creature geometry for DRIFT.
   Everything here is generated at startup — no external assets. */
import * as THREE from "three";

const clamp = (v: number, a: number, b: number) =>
  v < a ? a : v > b ? b : v;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (v: number, a: number, b: number) => {
  const t = clamp((v - a) / (b - a || 1), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ---------------- value noise ---------------- */

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
  const c = (dx: number, dy: number, dz: number) =>
    hash3(xi + dx, yi + dy, zi + dz);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), xf);
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), xf);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), xf);
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), xf);
  return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf);
}
function fbm3(x: number, y: number, z: number, oct = 4): number {
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < oct; i++) {
    v += a * noise3(x, y, z);
    x = x * 2.02 + 11.3;
    y = y * 2.02 + 5.7;
    z = z * 2.02 + 7.9;
    a *= 0.5;
  }
  return v;
}
export function ridged(x: number, y: number, z: number): number {
  const n = fbm3(x, y, z, 4);
  return 1 - Math.abs(n * 2 - 1);
}
function ridgedMF(x: number, y: number, z: number, oct = 4): number {
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < oct; i++) {
    const n = noise3(x, y, z);
    const r = 1.0 - Math.abs(n * 2.0 - 1.0);
    v += a * r * r;
    x = x * 2.08 + 7.3;
    y = y * 2.08 + 11.5;
    z = z * 2.08 + 3.1;
    a *= 0.5;
  }
  return v;
}

function canvasTex(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/* ================================================================
   WOOD — planked hull with grain, knots, caulking and iron nails
   ================================================================ */

export function makeDetailedWoodTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d")!;
  const planks = 9;
  const ph = 512 / planks;

  g.fillStyle = "#1a1008";
  g.fillRect(0, 0, 512, 512);

  for (let i = 0; i < planks; i++) {
    const tint = 0.78 + Math.random() * 0.42;
    const base = [
      Math.round(126 * tint),
      Math.round(80 * tint),
      Math.round(46 * tint),
    ];
    const grad = g.createLinearGradient(0, i * ph, 0, (i + 1) * ph);
    grad.addColorStop(0, `rgb(${base[0] + 18},${base[1] + 12},${base[2] + 8})`);
    grad.addColorStop(0.45, `rgb(${base[0]},${base[1]},${base[2]})`);
    grad.addColorStop(1, `rgb(${Math.round(base[0] * 0.72)},${Math.round(base[1] * 0.7)},${Math.round(base[2] * 0.7)})`);
    g.fillStyle = grad;
    g.fillRect(0, i * ph, 512, ph);

    // long wavy grain
    for (let k = 0; k < 95; k++) {
      const dark = Math.random() < 0.62;
      g.strokeStyle = dark
        ? `rgba(28,14,6,${0.05 + Math.random() * 0.2})`
        : `rgba(214,168,112,${0.035 + Math.random() * 0.1})`;
      g.lineWidth = 0.4 + Math.random() * 1.5;
      const y = i * ph + 3 + Math.random() * (ph - 6);
      const wob = (Math.random() - 0.5) * 7;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(160, y + wob, 350, y - wob, 512, y + (Math.random() - 0.5) * 4);
      g.stroke();
    }

    // knots with concentric rings
    const knots = 1 + Math.floor(Math.random() * 2);
    for (let k = 0; k < knots; k++) {
      const kx = 40 + Math.random() * 430;
      const ky = i * ph + 10 + Math.random() * (ph - 20);
      for (let r = 9; r > 1; r -= 2.2) {
        g.strokeStyle = `rgba(36,18,8,${0.1 + (9 - r) * 0.045})`;
        g.lineWidth = 1.1;
        g.beginPath();
        g.ellipse(kx, ky, r * 1.6, r * 0.62, 0.1, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = "rgba(28,14,6,0.55)";
      g.beginPath();
      g.ellipse(kx, ky, 3.2, 1.6, 0.1, 0, Math.PI * 2);
      g.fill();
    }

    // caulked seam + salt-faded top edge
    g.fillStyle = "rgba(9,6,4,0.92)";
    g.fillRect(0, i * ph + ph - 3, 512, 3);
    g.fillStyle = "rgba(232,206,166,0.14)";
    g.fillRect(0, i * ph + 1, 512, 1.5);

    // butt joints and pairs of hand-driven nails
    const joint = 60 + Math.random() * 390;
    g.fillStyle = "rgba(10,6,3,0.7)";
    g.fillRect(joint, i * ph + 2, 2, ph - 4);
    for (const dx of [-9, 9]) {
      for (const dy of [ph * 0.28, ph * 0.72]) {
        g.fillStyle = "rgba(18,17,16,0.85)";
        g.beginPath();
        g.arc(joint + dx, i * ph + dy, 2.1, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "rgba(190,175,150,0.28)";
        g.beginPath();
        g.arc(joint + dx - 0.6, i * ph + dy - 0.6, 0.8, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // weathered salt streaks
  for (let i = 0; i < 220; i++) {
    g.fillStyle = `rgba(226,220,202,${0.015 + Math.random() * 0.04})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 8 + Math.random() * 46);
  }
  return canvasTex(c, true);
}

/** Deck planks run along the boat's length. */
export function makeDeckTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d")!;
  const planks = 7;
  const pw = 512 / planks;
  g.fillStyle = "#100a05";
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < planks; i++) {
    const tint = 0.73 + Math.random() * 0.4;
    const grad = g.createLinearGradient(i * pw, 0, (i + 1) * pw, 0);
    grad.addColorStop(0, `rgb(${Math.round(142 * tint)},${Math.round(96 * tint)},${Math.round(58 * tint)})`);
    grad.addColorStop(0.6, `rgb(${Math.round(118 * tint)},${Math.round(76 * tint)},${Math.round(44 * tint)})`);
    grad.addColorStop(1, `rgb(${Math.round(86 * tint)},${Math.round(54 * tint)},${Math.round(30 * tint)})`);
    g.fillStyle = grad;
    g.fillRect(i * pw, 0, pw, 512);
    for (let k = 0; k < 90; k++) {
      g.strokeStyle =
        Math.random() < 0.6
          ? `rgba(30,15,6,${0.05 + Math.random() * 0.18})`
          : `rgba(218,178,126,${0.03 + Math.random() * 0.09})`;
      g.lineWidth = 0.4 + Math.random() * 1.3;
      const x = i * pw + 2 + Math.random() * (pw - 4);
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 3, 170, x - 3, 340, x, 512);
      g.stroke();
    }
    g.fillStyle = "rgba(10,6,3,0.85)";
    g.fillRect(i * pw + pw - 2.5, 0, 2.5, 512);
    g.fillStyle = "rgba(240,220,180,0.11)";
    g.fillRect(i * pw + 1, 0, 1, 512);
  }
  for (let i = 0; i < 180; i++) {
    g.fillStyle = `rgba(230,222,200,${0.012 + Math.random() * 0.035})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1, 6 + Math.random() * 30);
  }
  return canvasTex(c, true);
}

/** Weathered woven sail canvas: warp/weft, panel seams, reef points, patches. */
export function makeDetailedClothTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, "#e6dbc2");
  grad.addColorStop(0.55, "#d5c6a9");
  grad.addColorStop(1, "#b9a689");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);

  // weave
  for (let y = 0; y < 512; y += 3) {
    g.fillStyle = y % 6 === 0 ? "rgba(94,72,46,0.075)" : "rgba(255,250,236,0.075)";
    g.fillRect(0, y, 512, 1);
  }
  for (let x = 0; x < 512; x += 3) {
    g.fillStyle = x % 6 === 0 ? "rgba(94,72,46,0.06)" : "rgba(255,250,236,0.06)";
    g.fillRect(x, 0, 1, 512);
  }

  // horizontal cloth panels with double-stitched seams
  for (let y = 64; y < 512; y += 82) {
    g.fillStyle = "rgba(70,50,30,0.36)";
    g.fillRect(0, y, 512, 2.4);
    g.fillStyle = "rgba(255,248,226,0.3)";
    g.fillRect(0, y + 3, 512, 1.3);
    g.strokeStyle = "rgba(78,56,34,0.28)";
    g.setLineDash([4, 5]);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, y + 8);
    g.lineTo(512, y + 8);
    g.stroke();
    g.setLineDash([]);
    // reef points
    for (let x = 40; x < 512; x += 62) {
      g.fillStyle = "rgba(62,44,26,0.45)";
      g.beginPath();
      g.arc(x, y + 8, 2.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,248,226,0.35)";
      g.fillRect(x - 0.5, y + 10, 1, 5);
    }
  }

  // batten shadows
  for (let y = 18; y < 512; y += 82) {
    const bg = g.createLinearGradient(0, y, 0, y + 13);
    bg.addColorStop(0, "rgba(60,42,26,0.22)");
    bg.addColorStop(1, "rgba(60,42,26,0)");
    g.fillStyle = bg;
    g.fillRect(0, y, 512, 13);
  }

  // salt / wear near the foot, stains and a stitched repair patch
  const wear = g.createLinearGradient(0, 512, 0, 250);
  wear.addColorStop(0, "rgba(86,64,40,0.42)");
  wear.addColorStop(1, "rgba(86,64,40,0)");
  g.fillStyle = wear;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 24; i++) {
    g.fillStyle = `rgba(110,84,54,${0.025 + Math.random() * 0.055})`;
    g.beginPath();
    g.ellipse(Math.random() * 512, Math.random() * 512, 8 + Math.random() * 30, 4 + Math.random() * 16, Math.random(), 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "rgba(166,142,106,0.55)";
  g.fillRect(298, 252, 68, 58);
  g.strokeStyle = "rgba(60,44,28,0.65)";
  g.setLineDash([4, 4]);
  g.lineWidth = 1.5;
  g.strokeRect(298, 252, 68, 58);
  g.setLineDash([]);
  return canvasTex(c);
}

/** Fine overlapping cycloid scales with iridescent pearlescence and lateral line shimmer. */
export function makeFishScaleTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;

  // Silvery iridescent pearlescent wash
  const bg = g.createLinearGradient(0, 0, 512, 512);
  bg.addColorStop(0, "#f2f8f8");
  bg.addColorStop(0.5, "#e4f0f2");
  bg.addColorStop(1, "#f4faf9");
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 512);

  const step = 16;
  for (let row = -1; row <= 512 / step + 1; row++) {
    for (let col = -1; col <= 512 / step + 1; col++) {
      const x = col * step + (row % 2 ? step * 0.5 : 0);
      const y = row * step;
      const shade = 0.88 + hash3(col, row, 3) * 0.12;

      // Overlapping scale body
      g.fillStyle = `rgba(${Math.round(242 * shade)},${Math.round(250 * shade)},${Math.round(248 * shade)},0.60)`;
      g.beginPath();
      g.ellipse(x, y, step * 0.62, step * 0.72, 0, 0, Math.PI * 2);
      g.fill();

      // Circuli (fine concentric scale rings)
      g.strokeStyle = "rgba(38, 80, 92, 0.17)";
      g.lineWidth = 0.9;
      g.beginPath();
      g.arc(x, y + 1, step * 0.54, 0.1, Math.PI - 0.1);
      g.stroke();

      // Pearlescent turquoise / gold iridescent rim
      const irid = (col + row) % 3 === 0
        ? "rgba(160, 245, 235, 0.40)"
        : "rgba(255, 232, 175, 0.32)";
      g.strokeStyle = irid;
      g.lineWidth = 1.1;
      g.beginPath();
      g.arc(x - 1, y - 1, step * 0.44, 0.25, Math.PI - 0.25);
      g.stroke();

      // Specular pearl highlight point
      g.fillStyle = "rgba(255, 255, 255, 0.65)";
      g.fillRect(x - 1, y - step * 0.35, 1.2, 1.2);
    }
  }

  // Shimmering lateral sensory line through the middle
  const latGrad = g.createLinearGradient(0, 230, 0, 282);
  latGrad.addColorStop(0, "rgba(60, 180, 180, 0)");
  latGrad.addColorStop(0.35, "rgba(80, 225, 215, 0.22)");
  latGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.40)");
  latGrad.addColorStop(0.65, "rgba(80, 225, 215, 0.22)");
  latGrad.addColorStop(1, "rgba(60, 180, 180, 0)");
  g.fillStyle = latGrad;
  g.fillRect(0, 230, 512, 52);

  // Micro guanine crystal speckles
  for (let i = 0; i < 2400; i++) {
    const rx = Math.random() * 512;
    const ry = Math.random() * 512;
    g.fillStyle = Math.random() < 0.65
      ? `rgba(255,255,255,${0.08 + Math.random() * 0.18})`
      : `rgba(90,205,215,${0.05 + Math.random() * 0.12})`;
    g.fillRect(rx, ry, 1, 1);
  }

  return canvasTex(c, true);
}

/* ================================================================
   FISH — fusiform body, fins with rays, eyes, gill plates, mouth
   `aFlex.x` = body undulation weight, `aFlex.y` = pectoral flutter
   ================================================================ */

type RGB = [number, number, number];
interface Builder {
  pos: number[];
  uv: number[];
  col: number[];
  flex: number[];
  idx: number[];
}

function addPart(
  b: Builder,
  geo: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
  colorFn: (x: number, y: number, z: number) => RGB,
  flexFn: (x: number, y: number, z: number) => [number, number],
  uvFn?: (u: number, v: number, x: number, y: number, z: number) => [number, number],
) {
  const base = b.pos.length / 3;
  const p = geo.getAttribute("position");
  const uv = geo.getAttribute("uv");
  const index = geo.getIndex();
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(matrix);
    b.pos.push(v.x, v.y, v.z);
    const u0 = uv ? uv.getX(i) : 0;
    const v0 = uv ? uv.getY(i) : 0;
    const [uu, vv] = uvFn ? uvFn(u0, v0, v.x, v.y, v.z) : [u0, v0];
    b.uv.push(uu, vv);
    const c = colorFn(v.x, v.y, v.z);
    b.col.push(c[0], c[1], c[2]);
    const f = flexFn(v.x, v.y, v.z);
    b.flex.push(f[0], f[1]);
  }
  if (index) {
    for (let i = 0; i < index.count; i++) b.idx.push(base + index.getX(i));
  } else {
    for (let i = 0; i < p.count; i++) b.idx.push(base + i);
  }
  geo.dispose();
}

function addFin(
  b: Builder,
  root: [number, number, number],
  outline: Array<[number, number, number]>,
  colors: RGB[],
  flexY: number,
) {
  const base = b.pos.length / 3;
  const pts = [root, ...outline];
  for (let i = 0; i < pts.length; i++) {
    const [x, y, z] = pts[i];
    b.pos.push(x, y, z);
    b.uv.push(i / pts.length, 0.5);
    const c = colors[Math.min(i, colors.length - 1)];
    b.col.push(c[0], c[1], c[2]);
    const w = clamp((0.3 - z) / 0.75, 0, 1);
    b.flex.push(w * w, flexY);
  }
  for (let i = 1; i < pts.length - 1; i++) {
    b.idx.push(base, base + i, base + i + 1);
  }
}

const eyeSphereGeo = new THREE.SphereGeometry(1, 10, 8);
function addEyes(
  b: Builder,
  ex: number,
  ey: number,
  ez: number,
  r: number,
  irisCol: RGB,
) {
  for (const side of [-1, 1]) {
    const x = side * ex;
    // Sclera / dark orbit
    const m1 = new THREE.Matrix4().makeScale(r * 1.15, r * 1.15, r * 1.05);
    m1.setPosition(x, ey, ez);
    addPart(b, eyeSphereGeo.clone(), m1, () => [0.03, 0.05, 0.07], () => [0, 0]);

    // Iris (golden, amber, or copper)
    const m2 = new THREE.Matrix4().makeScale(r * 0.92, r * 0.92, r * 0.86);
    m2.setPosition(x + side * (r * 0.28), ey, ez);
    addPart(b, eyeSphereGeo.clone(), m2, () => irisCol, () => [0, 0]);

    // Pupil (jet black)
    const m3 = new THREE.Matrix4().makeScale(r * 0.58, r * 0.58, r * 0.54);
    m3.setPosition(x + side * (r * 0.55), ey, ez);
    addPart(b, eyeSphereGeo.clone(), m3, () => [0.008, 0.012, 0.016], () => [0, 0]);

    // Specular corneal catchlight reflection
    const m4 = new THREE.Matrix4().makeScale(r * 0.24, r * 0.24, r * 0.24);
    m4.setPosition(x + side * (r * 0.72), ey + r * 0.26, ez + r * 0.24);
    addPart(b, eyeSphereGeo.clone(), m4, () => [0.98, 0.99, 1.0], () => [0, 0]);
  }
}

function buildFishBody(
  b: Builder,
  profile: Array<[number, number, number]>,
  segs: number,
  colorShader: (sa: number, ca: number, z: number, top: number, normZ: number) => RGB,
  ridgeScale = 0.16,
) {
  const rings = profile.length;
  const bp: number[] = [], bu: number[] = [], bc: number[] = [], bf: number[] = [], bi: number[] = [];
  const zMax = profile[0][0];
  const zMin = profile[rings - 1][0];
  const zLen = zMax - zMin;

  for (let i = 0; i < rings; i++) {
    const [z, w, h] = profile[i];
    const normZ = (zMax - z) / zLen;
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const sa = Math.sin(a), ca = Math.cos(a);
      const belly = ca < 0 ? 1.08 : 1;
      const ridge = ca > 0.75 ? 1 + (ca - 0.75) * ridgeScale : 1;
      const x = sa * w;
      const y = ca * h * belly * ridge;
      bp.push(x, y, z);
      bu.push((j / segs) * 3.2, normZ * 4.2);

      const top = ca;
      const col = colorShader(sa, ca, z, top, normZ);
      const speck = 0.96 + hash3(i, j, 7) * 0.08;
      bc.push(col[0] * speck, col[1] * speck, col[2] * speck);

      const wave = clamp((0.28 - z) / 0.72, 0, 1);
      bf.push(wave * wave, 0);
    }
  }

  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j;
      const c = a + segs + 1;
      bi.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }

  // Snout and tail caps
  const nose = bp.length / 3;
  bp.push(0, 0, zMax + 0.015); bu.push(0, 0); bc.push(0.18, 0.22, 0.26); bf.push(0, 0);
  for (let j = 0; j < segs; j++) bi.push(nose, j + 1, j);

  const tailCap = bp.length / 3;
  bp.push(0, 0, zMin - 0.015); bu.push(0, 0); bc.push(0.12, 0.18, 0.22); bf.push(1, 0);
  const last = (rings - 1) * (segs + 1);
  for (let j = 0; j < segs; j++) bi.push(tailCap, last + j, last + j + 1);

  for (let i = 0; i < bp.length; i++) b.pos.push(bp[i]);
  for (let i = 0; i < bu.length; i++) b.uv.push(bu[i]);
  for (let i = 0; i < bc.length; i++) b.col.push(bc[i]);
  for (let i = 0; i < bf.length; i++) b.flex.push(bf[i]);
  for (let i = 0; i < bi.length; i++) b.idx.push(bi[i]);
}

/* ---------------- Species 1: Pelagic Bluefin Trevally / Yellowfin Tuna ---------------- */
export function makeTunaGeometry(): THREE.BufferGeometry {
  const b: Builder = { pos: [], uv: [], col: [], flex: [], idx: [] };
  const profile: Array<[number, number, number]> = [
    [0.54, 0.012, 0.018],
    [0.49, 0.042, 0.056],
    [0.42, 0.076, 0.098],
    [0.32, 0.108, 0.144],
    [0.20, 0.124, 0.168],
    [0.08, 0.120, 0.164],
    [-0.05, 0.106, 0.144],
    [-0.18, 0.082, 0.114],
    [-0.28, 0.056, 0.078],
    [-0.36, 0.034, 0.046],
    [-0.42, 0.020, 0.026],
    [-0.47, 0.013, 0.018],
  ];

  buildFishBody(b, profile, 18, (sa, _ca, z, top) => {
    const back = smooth(top, -0.05, 0.68);
    let r = lerp(0.88, 0.04, back);
    let gg = lerp(0.92, 0.18, back);
    let bb = lerp(0.96, 0.42, back);

    // Lateral electric cyan / gold keel line
    const latDist = Math.abs(top - 0.03);
    const lateral = Math.exp(-latDist * latDist * 80.0);
    r = lerp(r, 0.20, lateral * 0.85);
    gg = lerp(gg, 0.90, lateral * 0.85);
    bb = lerp(bb, 0.88, lateral * 0.85);

    // Warm silver pearlescent belly
    const belly = smooth(-top, 0.35, 0.95);
    r = lerp(r, 0.95, belly * 0.65);
    gg = lerp(gg, 0.97, belly * 0.65);
    bb = lerp(bb, 0.99, belly * 0.65);

    // Operculum (golden gill cover)
    if (z > 0.26 && z < 0.38 && Math.abs(sa) > 0.55) {
      r = lerp(r, 0.78, 0.52);
      gg = lerp(gg, 0.62, 0.52);
      bb = lerp(bb, 0.32, 0.52);
    }
    return [r, gg, bb];
  }, 0.22);

  const finCobalt: RGB = [0.06, 0.20, 0.38];
  const finCyan: RGB = [0.24, 0.76, 0.82];
  const finYellow: RGB = [0.96, 0.84, 0.16];
  const finDark: RGB = [0.03, 0.08, 0.14];

  // Crescent high-aspect ratio tail
  addFin(b, [0, 0, -0.46], [
    [0.008, 0.08, -0.52],
    [0.022, 0.19, -0.63],
    [0.030, 0.29, -0.76],
    [0.014, 0.15, -0.65],
    [0.004, 0.03, -0.56],
  ], [finCobalt, finCyan, finYellow, finCobalt], 0);

  addFin(b, [0, 0, -0.46], [
    [-0.008, -0.075, -0.52],
    [-0.022, -0.185, -0.63],
    [-0.030, -0.28, -0.75],
    [-0.014, -0.145, -0.64],
    [-0.004, -0.028, -0.56],
  ], [finCobalt, finCyan, finYellow, finCobalt], 0);

  // Falcate primary dorsal fin
  addFin(b, [0, 0.155, 0.18], [
    [0.006, 0.29, 0.08],
    [0.012, 0.33, -0.02],
    [0.008, 0.24, -0.11],
    [0.004, 0.17, -0.18],
  ], [finDark, finCobalt, finCyan, finCobalt], 0);

  // Sickle secondary dorsal & anal fins
  addFin(b, [0, 0.085, -0.22], [
    [0.004, 0.19, -0.26],
    [0.006, 0.21, -0.32],
    [0.002, 0.11, -0.35],
  ], [finYellow, finYellow, finDark], 0);

  addFin(b, [0, -0.085, -0.22], [
    [0.004, -0.18, -0.26],
    [0.006, -0.20, -0.32],
    [0.002, -0.10, -0.35],
  ], [finYellow, finYellow, finDark], 0);

  // Yellow dorsal & ventral finlets (signature tuna feature)
  for (let k = 0; k < 4; k++) {
    const fz = -0.33 - k * 0.032;
    addFin(b, [0, 0.045 - k * 0.006, fz], [
      [0.002, 0.075 - k * 0.006, fz - 0.012],
      [0.002, 0.042 - k * 0.006, fz - 0.024],
    ], [finYellow, finDark], 0);

    addFin(b, [0, -0.045 + k * 0.006, fz], [
      [0.002, -0.072 + k * 0.006, fz - 0.012],
      [0.002, -0.040 + k * 0.006, fz - 0.024],
    ], [finYellow, finDark], 0);
  }

  // Falcate pectoral & pelvic fins
  for (const side of [-1, 1]) {
    addFin(b, [side * 0.09, -0.015, 0.16], [
      [side * 0.17, -0.04, 0.08],
      [side * 0.22, -0.075, -0.02],
      [side * 0.14, -0.065, -0.09],
    ], [finCyan, finCobalt, finDark], 1);

    addFin(b, [side * 0.04, -0.09, -0.06], [
      [side * 0.08, -0.15, -0.14],
      [side * 0.045, -0.10, -0.18],
    ], [finCobalt, finYellow], 0.3);
  }

  // Eyes and mouth
  addEyes(b, 0.072, 0.05, 0.37, 0.033, [0.82, 0.65, 0.22]);
  const mouthM = new THREE.Matrix4().makeScale(0.034, 0.012, 0.022);
  mouthM.setPosition(0, -0.02, 0.53);
  addPart(b, eyeSphereGeo.clone(), mouthM, () => [0.06, 0.07, 0.09], () => [0, 0]);

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
  out.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
  out.setAttribute("aFlex", new THREE.Float32BufferAttribute(b.flex, 2));
  out.setIndex(b.idx);
  out.computeVertexNormals();
  return out;
}

/* ---------------- Species 2: Mahi-Mahi / Green Dorado (Dolphinfish) ---------------- */
export function makeDoradoGeometry(): THREE.BufferGeometry {
  const b: Builder = { pos: [], uv: [], col: [], flex: [], idx: [] };
  // Steep blunt forehead and laterally compressed deep body
  const profile: Array<[number, number, number]> = [
    [0.50, 0.015, 0.032],
    [0.46, 0.045, 0.088],
    [0.40, 0.068, 0.150],
    [0.30, 0.082, 0.184],
    [0.18, 0.086, 0.178],
    [0.05, 0.080, 0.162],
    [-0.09, 0.068, 0.136],
    [-0.22, 0.050, 0.098],
    [-0.33, 0.032, 0.060],
    [-0.41, 0.018, 0.034],
    [-0.46, 0.012, 0.020],
  ];

  buildFishBody(b, profile, 18, (sa, _ca, z, top) => {
    // Top: intense electric neon emerald green
    const back = smooth(top, -0.10, 0.65);
    let r = lerp(0.92, 0.06, back);
    let gg = lerp(0.86, 0.58, back);
    let bb = lerp(0.35, 0.22, back);

    // Flank: radiant gold / chartreuse with electric turquoise transition
    const midFlank = Math.exp(-Math.pow(top + 0.05, 2) * 16.0);
    r = lerp(r, 0.95, midFlank * 0.75);
    gg = lerp(gg, 0.88, midFlank * 0.75);
    bb = lerp(bb, 0.18, midFlank * 0.75);

    // Deep sapphire / indigo speckles along golden flank
    const speckle = Math.sin(z * 42.0 + top * 8.0) * Math.cos(sa * 12.0);
    if (speckle > 0.65 && top < 0.35 && top > -0.45) {
      r = 0.08; gg = 0.35; bb = 0.82;
    }

    // Belly: shimmering pale gold and pearl white
    const belly = smooth(-top, 0.35, 0.95);
    r = lerp(r, 0.95, belly * 0.55);
    gg = lerp(gg, 0.95, belly * 0.55);
    bb = lerp(bb, 0.78, belly * 0.55);

    return [r, gg, bb];
  }, 0.28);

  const crestGreen: RGB = [0.08, 0.65, 0.28];
  const crestCyan: RGB = [0.18, 0.88, 0.78];
  const goldFin: RGB = [0.94, 0.82, 0.18];
  const darkEdge: RGB = [0.04, 0.16, 0.12];

  // Continuous dorsal crest from head to tail
  addFin(b, [0, 0.18, 0.32], [
    [0.006, 0.27, 0.25],
    [0.010, 0.29, 0.10],
    [0.010, 0.26, -0.06],
    [0.008, 0.21, -0.20],
    [0.006, 0.15, -0.32],
    [0.003, 0.08, -0.42],
  ], [crestGreen, crestCyan, crestGreen, crestCyan, goldFin, darkEdge], 0);

  // Continuous ventral anal fin
  addFin(b, [0, -0.10, -0.08], [
    [0.005, -0.18, -0.16],
    [0.006, -0.18, -0.28],
    [0.004, -0.12, -0.38],
    [0.002, -0.06, -0.42],
  ], [crestCyan, goldFin, darkEdge], 0);

  // Golden forked caudal tail
  addFin(b, [0, 0, -0.45], [
    [0.008, 0.08, -0.51],
    [0.020, 0.19, -0.62],
    [0.028, 0.28, -0.72],
    [0.012, 0.14, -0.62],
    [0.004, 0.025, -0.54],
  ], [goldFin, crestCyan, goldFin, darkEdge], 0);

  addFin(b, [0, 0, -0.45], [
    [-0.008, -0.075, -0.51],
    [-0.020, -0.18, -0.62],
    [-0.028, -0.27, -0.71],
    [-0.012, -0.135, -0.62],
    [-0.004, -0.022, -0.54],
  ], [goldFin, crestCyan, goldFin, darkEdge], 0);

  // Pectoral and long trailing pelvic fins
  for (const side of [-1, 1]) {
    addFin(b, [side * 0.08, -0.02, 0.18], [
      [side * 0.15, -0.05, 0.09],
      [side * 0.19, -0.08, 0.00],
      [side * 0.12, -0.06, -0.07],
    ], [crestCyan, goldFin], 1);

    // Trailing pelvic fin
    addFin(b, [side * 0.035, -0.12, 0.12], [
      [side * 0.05, -0.22, 0.02],
      [side * 0.03, -0.16, -0.05],
    ], [goldFin, darkEdge], 0.4);
  }

  addEyes(b, 0.065, 0.06, 0.35, 0.032, [0.22, 0.85, 0.75]);
  const mouthM = new THREE.Matrix4().makeScale(0.030, 0.012, 0.020);
  mouthM.setPosition(0, -0.025, 0.49);
  addPart(b, eyeSphereGeo.clone(), mouthM, () => [0.08, 0.16, 0.12], () => [0, 0]);

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
  out.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
  out.setAttribute("aFlex", new THREE.Float32BufferAttribute(b.flex, 2));
  out.setIndex(b.idx);
  out.computeVertexNormals();
  return out;
}

/* ---------------- Species 3: Oceanic Flying Fish (Exocoetidae) ---------------- */
export function makeFlyingFishGeometry(): THREE.BufferGeometry {
  const b: Builder = { pos: [], uv: [], col: [], flex: [], idx: [] };
  const profile: Array<[number, number, number]> = [
    [0.52, 0.011, 0.014],
    [0.47, 0.030, 0.038],
    [0.38, 0.050, 0.062],
    [0.26, 0.062, 0.074],
    [0.12, 0.064, 0.074],
    [-0.04, 0.058, 0.068],
    [-0.18, 0.046, 0.054],
    [-0.30, 0.032, 0.038],
    [-0.40, 0.018, 0.022],
    [-0.47, 0.011, 0.014],
  ];

  buildFishBody(b, profile, 16, (_sa, _ca, _z, top) => {
    const back = smooth(top, -0.10, 0.62);
    let r = lerp(0.92, 0.08, back);
    let gg = lerp(0.94, 0.16, back);
    let bb = lerp(0.98, 0.45, back);

    const latDist = Math.abs(top - 0.02);
    const lateral = Math.exp(-latDist * latDist * 70.0);
    r = lerp(r, 0.35, lateral * 0.65);
    gg = lerp(gg, 0.88, lateral * 0.65);
    bb = lerp(bb, 0.98, lateral * 0.65);

    const belly = smooth(-top, 0.30, 0.90);
    r = lerp(r, 0.98, belly * 0.7);
    gg = lerp(gg, 0.98, belly * 0.7);
    bb = lerp(bb, 1.0, belly * 0.7);
    return [r, gg, bb];
  }, 0.10);

  const wingTranslucent: RGB = [0.35, 0.75, 0.92];
  const wingEdge: RGB = [0.92, 0.95, 0.99];
  const wingRay: RGB = [0.12, 0.28, 0.48];
  const tailDark: RGB = [0.08, 0.22, 0.38];

  // Huge wing-like pectoral glider fins
  for (const side of [-1, 1]) {
    addFin(b, [side * 0.055, 0.02, 0.20], [
      [side * 0.18, 0.045, 0.12],
      [side * 0.34, 0.065, -0.04],
      [side * 0.44, 0.075, -0.22],
      [side * 0.32, 0.055, -0.26],
      [side * 0.15, 0.035, -0.18],
    ], [wingTranslucent, wingEdge, wingRay, wingTranslucent, wingEdge], 1.2);

    // Secondary pelvic glider fins
    addFin(b, [side * 0.035, -0.03, -0.12], [
      [side * 0.12, -0.04, -0.22],
      [side * 0.06, -0.035, -0.28],
    ], [wingTranslucent, wingEdge], 0.5);
  }

  // Hypocaudal asymmetric tail
  addFin(b, [0, 0, -0.46], [
    [0.005, 0.06, -0.51],
    [0.014, 0.14, -0.60],
    [0.006, 0.08, -0.58],
    [0.002, 0.02, -0.52],
  ], [tailDark, wingTranslucent], 0);

  addFin(b, [0, 0, -0.46], [
    [-0.006, -0.08, -0.52],
    [-0.018, -0.21, -0.64],
    [-0.026, -0.32, -0.76],
    [-0.012, -0.16, -0.66],
    [-0.003, -0.03, -0.54],
  ], [tailDark, wingTranslucent, wingEdge, tailDark], 0);

  addFin(b, [0, 0.045, -0.25], [[0.002, 0.09, -0.32], [0.001, 0.04, -0.38]], [tailDark, wingTranslucent], 0);
  addFin(b, [0, -0.045, -0.25], [[0.002, -0.085, -0.32], [0.001, -0.04, -0.38]], [tailDark, wingTranslucent], 0);

  addEyes(b, 0.052, 0.035, 0.36, 0.028, [0.72, 0.78, 0.85]);
  const mouthM = new THREE.Matrix4().makeScale(0.024, 0.009, 0.018);
  mouthM.setPosition(0, -0.012, 0.51);
  addPart(b, eyeSphereGeo.clone(), mouthM, () => [0.08, 0.12, 0.18], () => [0, 0]);

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
  out.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
  out.setAttribute("aFlex", new THREE.Float32BufferAttribute(b.flex, 2));
  out.setIndex(b.idx);
  out.computeVertexNormals();
  return out;
}

/* ---------------- Species 4: Ruby Coral Snapper / Red Sea Bream ---------------- */
export function makeSnapperGeometry(): THREE.BufferGeometry {
  const b: Builder = { pos: [], uv: [], col: [], flex: [], idx: [] };
  const profile: Array<[number, number, number]> = [
    [0.50, 0.014, 0.022],
    [0.44, 0.046, 0.068],
    [0.35, 0.080, 0.138],
    [0.22, 0.100, 0.186],
    [0.08, 0.106, 0.194],
    [-0.06, 0.096, 0.178],
    [-0.20, 0.076, 0.142],
    [-0.32, 0.052, 0.096],
    [-0.41, 0.028, 0.050],
    [-0.46, 0.015, 0.026],
  ];

  buildFishBody(b, profile, 18, (sa, _ca, z, top) => {
    const back = smooth(top, -0.15, 0.65);
    let r = lerp(0.96, 0.82, back);
    let gg = lerp(0.85, 0.18, back);
    let bb = lerp(0.88, 0.22, back);

    const flank = Math.exp(-Math.pow(top + 0.1, 2) * 18.0);
    r = lerp(r, 0.98, flank * 0.7);
    gg = lerp(gg, 0.62, flank * 0.7);
    bb = lerp(bb, 0.42, flank * 0.7);

    const belly = smooth(-top, 0.35, 0.95);
    r = lerp(r, 0.96, belly * 0.6);
    gg = lerp(gg, 0.88, belly * 0.6);
    bb = lerp(bb, 0.90, belly * 0.6);

    if (z > 0.24 && z < 0.36 && Math.abs(sa) > 0.52) {
      r = lerp(r, 0.95, 0.55);
      gg = lerp(gg, 0.22, 0.55);
      bb = lerp(bb, 0.24, 0.55);
    }
    return [r, gg, bb];
  }, 0.24);

  const rubyRed: RGB = [0.88, 0.18, 0.18];
  const flameGold: RGB = [0.96, 0.68, 0.24];
  const finPearl: RGB = [0.95, 0.85, 0.85];
  const spineDark: RGB = [0.55, 0.08, 0.08];

  // Continuous spiny dorsal fin with prominent anterior ray spines
  addFin(b, [0, 0.18, 0.18], [
    [0.006, 0.32, 0.12],
    [0.010, 0.35, 0.02],
    [0.012, 0.34, -0.08],
    [0.009, 0.28, -0.18],
    [0.006, 0.22, -0.28],
    [0.002, 0.12, -0.36],
  ], [spineDark, flameGold, rubyRed, flameGold, finPearl, rubyRed], 0);

  addFin(b, [0, -0.12, -0.10], [
    [0.006, -0.23, -0.18],
    [0.008, -0.24, -0.27],
    [0.003, -0.14, -0.36],
  ], [spineDark, rubyRed, flameGold], 0);

  // Broad paddle tail with gold/ruby rays
  addFin(b, [0, 0, -0.45], [
    [0.008, 0.09, -0.51],
    [0.018, 0.20, -0.61],
    [0.022, 0.23, -0.69],
    [0.012, 0.12, -0.63],
    [0.004, 0.025, -0.54],
  ], [rubyRed, flameGold, finPearl], 0);

  addFin(b, [0, 0, -0.45], [
    [-0.008, -0.085, -0.51],
    [-0.018, -0.19, -0.61],
    [-0.022, -0.22, -0.68],
    [-0.012, -0.11, -0.62],
    [-0.004, -0.022, -0.54],
  ], [rubyRed, flameGold, finPearl], 0);

  // Broad fan-shaped pectoral & pelvic fins
  for (const side of [-1, 1]) {
    addFin(b, [side * 0.08, -0.02, 0.15], [
      [side * 0.16, -0.04, 0.08],
      [side * 0.20, -0.07, -0.02],
      [side * 0.13, -0.06, -0.08],
    ], [flameGold, rubyRed, finPearl], 1);

    addFin(b, [side * 0.04, -0.11, 0.02], [
      [side * 0.08, -0.18, -0.08],
      [side * 0.04, -0.13, -0.14],
    ], [spineDark, flameGold], 0.4);
  }

  addEyes(b, 0.068, 0.05, 0.33, 0.035, [0.92, 0.68, 0.18]);
  const mouthM = new THREE.Matrix4().makeScale(0.028, 0.012, 0.020);
  mouthM.setPosition(0, -0.02, 0.49);
  addPart(b, eyeSphereGeo.clone(), mouthM, () => [0.18, 0.06, 0.08], () => [0, 0]);

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
  out.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
  out.setAttribute("aFlex", new THREE.Float32BufferAttribute(b.flex, 2));
  out.setIndex(b.idx);
  out.computeVertexNormals();
  return out;
}

/** Backward compatibility alias */
export function makeDetailedFishGeometry(): THREE.BufferGeometry {
  return makeTunaGeometry();
}

/* ================================================================
   ISLANDS — Alpine fjord coastal mountains with sharp arêtes,
   glacial couloirs, lush conifer mantle, rock strata & PBR shading
   ================================================================ */

export function islandHeight(u: number, v: number, seed: number): number {
  // Domain warping for natural tectonic folding
  const s1 = seed * 1.73;
  const warpX = u + 0.22 * noise3(u * 2.4 + s1, v * 2.4, 1.2);
  const warpZ = v + 0.22 * noise3(u * 2.4, v * 2.4 - s1, 2.5);
  const rW = Math.hypot(warpX, warpZ);
  const aW = Math.atan2(warpZ, warpX);

  // Coastline footprint: irregular fjord coastline with craggy headlands
  const coast = 1.0 + 0.22 * Math.sin(aW * 3.0 + seed * 2.1) + 0.14 * Math.cos(aW * 5.0 - seed);
  const rNorm = rW / coast;
  if (rNorm >= 1.05) return -0.32;

  // Primary mountain spine: sharp knife-edge arête crossing the island
  const spineAngle = seed * 1.85;
  const sX = Math.cos(spineAngle), sZ = Math.sin(spineAngle);
  const spineDist = Math.abs(-sZ * warpX + sX * warpZ + 0.18 * Math.sin((sX * warpX + sZ * warpZ) * 3.8 + seed));
  const arete = Math.exp(-spineDist * 4.2);

  // Towering alpine peaks along the ridge
  const p1Dist = Math.hypot(warpX - sX * 0.26, warpZ - sZ * 0.26);
  const p2Dist = Math.hypot(warpX + sX * 0.32, warpZ + sZ * 0.32);
  const peak1 = Math.exp(-p1Dist * p1Dist * 6.5) * 1.35;
  const peak2 = Math.exp(-p2Dist * p2Dist * 8.0) * 1.10;
  const centralMass = Math.exp(-rW * rW * 5.2) * 1.25;

  // Multi-octave ridged multifractal: sharp rock couloirs and craggy knife ridges
  const r1 = ridgedMF(warpX * 3.2 + seed, warpZ * 3.2 - seed, seed * 0.7, 4);
  const r2 = ridgedMF(warpX * 7.5 - seed, warpZ * 7.5 + seed, seed * 1.3, 3);
  const alpineTexture = r1 * 0.72 + r2 * 0.28;

  // Glacial couloirs & erosion gullies carving down into the sea
  const couloir = Math.abs(Math.sin(aW * 4.0 + seed * 2.5 + rW * 6.0));
  const erosion = (1.0 - couloir) * 0.20 * smooth(rNorm, 0.15, 0.88);

  let h = (centralMass * 0.48 + peak1 * 0.36 + peak2 * 0.24 + arete * 0.46) * (0.64 + 0.56 * alpineTexture) - erosion;

  // Natural high-altitude spires
  const spireN = fbm3(warpX * 14.0 + seed, warpZ * 14.0, 3.2, 3);
  if (h > 0.6) h += (spireN - 0.45) * 0.24 * (h - 0.6);

  // Coastal dropoff into steep sea cliffs and rocky headlands
  const falloff = smooth(1.0 - rNorm, 0.0, 0.42);
  h *= Math.pow(falloff, 1.25);

  // Sea level cliff base: steep vertical drop right at water level
  if (rNorm > 0.88) {
    h -= (rNorm - 0.88) * 2.8;
  }
  return h;
}

export function makeIslandGeometry(seed: number): THREE.BufferGeometry {
  const NR = 48;
  const NS = 108;
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];

  const shade = (x: number, y: number, z: number) => {
    const e = 0.010;
    const dhdu = (islandHeight(x + e, z, seed) - islandHeight(x - e, z, seed)) / (2 * e);
    const dhdv = (islandHeight(x, z + e, seed) - islandHeight(x, z - e, seed)) / (2 * e);
    const slope = Math.hypot(dhdu, dhdv);
    const n2 = fbm3(x * 8 + seed * 3, y * 6, z * 8 - seed, 4);
    const strata = 0.90 + 0.10 * Math.sin(y * 42 + n2 * 5);

    // 1. Waterline Sea Rock (dark wet oceanic basalt)
    let R = lerp(0.09, 0.28, smooth(y, 0.01, 0.45));
    let G = lerp(0.12, 0.27, smooth(y, 0.01, 0.45));
    let B = lerp(0.14, 0.26, smooth(y, 0.01, 0.45));

    // 2. Coastal shoreline shelf (warm maritime pebble beach)
    const sandZone = (1 - smooth(slope, 0.32, 0.95)) * (1 - smooth(y, 0.015, 0.075));
    R = lerp(R, 0.48, sandZone * 0.72);
    G = lerp(G, 0.41, sandZone * 0.72);
    B = lerp(B, 0.32, sandZone * 0.72);

    // 3. Lush Green Vibe (coastal temperate rainforest, pine groves, emerald alpine moss)
    // Covers low-to-mid mountain slopes up to subalpine crags
    const greenZone = smooth(y, 0.035, 0.18) * (1 - smooth(y, 0.62, 0.88));
    const greenSlope = 1 - smooth(slope, 0.65, 1.75);
    const greenCover = greenZone * greenSlope;

    // Organic forest patches and mossy gully variance
    const patch = smooth(n2, 0.28, 0.75);
    const pineR = lerp(0.07, 0.16, patch);
    const pineG = lerp(0.26, 0.46, patch);
    const pineB = lerp(0.11, 0.19, patch);

    R = lerp(R, pineR, greenCover * 0.94);
    G = lerp(G, pineG, greenCover * 0.94);
    B = lerp(B, pineB, greenCover * 0.94);

    // 4. Exposed rocky cliff faces on sheer vertical drops
    const cliff = smooth(slope, 1.15, 2.1) * smooth(y, 0.06, 0.85);
    R = lerp(R, 0.32 * strata, cliff * 0.78);
    G = lerp(G, 0.30 * strata, cliff * 0.78);
    B = lerp(B, 0.28 * strata, cliff * 0.78);

    // 5. Pale granite crags on high ridges
    const crag = smooth(y, 0.60, 0.92) * smooth(slope, 0.25, 1.35);
    R = lerp(R, 0.55, crag * 0.68);
    G = lerp(G, 0.52, crag * 0.68);
    B = lerp(B, 0.49, crag * 0.68);

    // 6. Alpine snow / frost on highest mountain peaks
    const snow = smooth(y, 0.82, 0.98) * (1 - smooth(slope, 1.25, 2.1));
    R = lerp(R, 0.88, snow * 0.88);
    G = lerp(G, 0.93, snow * 0.88);
    B = lerp(B, 0.98, snow * 0.88);

    // 7. Wet shoreline darkening at tide level
    const wet = 1 - smooth(y, -0.02, 0.05);
    R *= 1 - wet * 0.50;
    G *= 1 - wet * 0.42;
    B *= 1 - wet * 0.30;

    const grain = 0.95 + n2 * 0.10;
    return [R * grain, G * grain, B * grain] as RGB;
  };

  for (let i = 0; i <= NR; i++) {
    const r = i / NR;
    for (let j = 0; j <= NS; j++) {
      const a = (j / NS) * Math.PI * 2;
      // irregular coastline
      const coast = 1 + 0.12 * (fbm3(Math.cos(a) * 2.2 + seed, Math.sin(a) * 2.2, 4.4, 3) - 0.5);
      const u = Math.cos(a) * r * coast;
      const v = Math.sin(a) * r * coast;
      const y = islandHeight(u, v, seed);
      pos.push(u, y, v);
      uv.push((j / NS) * 6, r * 5);
      const c = shade(u, y, v);
      col.push(c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < NR; i++) {
    for (let j = 0; j < NS; j++) {
      const a = i * (NS + 1) + j;
      const c = a + NS + 1;
      idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  // underwater skirt ring
  const skirt = pos.length / 3;
  for (let j = 0; j <= NS; j++) {
    const k = (NR * (NS + 1) + j) * 3;
    pos.push(pos[k], -0.42, pos[k + 2]);
    uv.push((j / NS) * 6, 5.4);
    col.push(0.04, 0.07, 0.08);
    const base = NR * (NS + 1) + j;
    if (j < NS) idx.push(base, base + 1, skirt + j, base + 1, skirt + j + 1, skirt + j);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface TreeSpot {
  x: number;
  y: number;
  z: number;
  s: number;
  lean: number;
}

/** Realistic tiered alpine conifer tree with trunk and layered foliage boughs */
export function makePineTreeGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];

  const addSubGeo = (
    geo: THREE.BufferGeometry,
    mat: THREE.Matrix4,
    colorFn: (x: number, y: number, z: number) => RGB,
  ) => {
    const base = pos.length / 3;
    const p = geo.getAttribute("position");
    const n = geo.getAttribute("normal");
    const index = geo.getIndex();
    const v = new THREE.Vector3();
    const norm = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mat);

    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(mat);
      pos.push(v.x, v.y, v.z);
      if (n) {
        norm.set(n.getX(i), n.getY(i), n.getZ(i)).applyMatrix3(normalMatrix).normalize();
        nrm.push(norm.x, norm.y, norm.z);
      } else {
        nrm.push(0, 1, 0);
      }
      const c = colorFn(v.x, v.y, v.z);
      col.push(c[0], c[1], c[2]);
    }

    if (index) {
      for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
    } else {
      for (let i = 0; i < p.count; i++) idx.push(base + i);
    }
    geo.dispose();
  };

  // 1. Cedar trunk
  const trunk = new THREE.CylinderGeometry(0.06, 0.09, 0.55, 6);
  const trunkM = new THREE.Matrix4().makeTranslation(0, 0.25, 0);
  addSubGeo(trunk, trunkM, () => [0.24, 0.16, 0.10]);

  // 2. Layered evergreen foliage tiers
  const tiers: Array<[number, number, number, RGB, RGB]> = [
    [0.55, 0.65, 0.48, [0.08, 0.28, 0.13], [0.14, 0.42, 0.19]],
    [0.44, 0.60, 0.78, [0.10, 0.34, 0.15], [0.18, 0.48, 0.21]],
    [0.32, 0.55, 1.08, [0.12, 0.38, 0.17], [0.22, 0.54, 0.24]],
    [0.18, 0.42, 1.34, [0.15, 0.44, 0.20], [0.26, 0.58, 0.26]],
  ];

  for (const [r, h, y, bCol, tCol] of tiers) {
    const cone = new THREE.ConeGeometry(r, h, 7);
    const m = new THREE.Matrix4().makeTranslation(0, y, 0);
    addSubGeo(cone, m, (_x, py) => {
      const t = clamp((py - (y - h * 0.5)) / h, 0, 1);
      return [lerp(bCol[0], tCol[0], t), lerp(bCol[1], tCol[1], t), lerp(bCol[2], tCol[2], t)];
    });
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}

export function islandTreeSpots(seed: number, count: number): TreeSpot[] {
  const spots: TreeSpot[] = [];
  let tries = 0;
  while (spots.length < count && tries++ < count * 16) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.20 + Math.random() * 0.56;
    const u = Math.cos(a) * r;
    const v = Math.sin(a) * r;
    const y = islandHeight(u, v, seed);
    if (y < 0.04 || y > 0.62) continue;
    // ensure trees grow on mountain slopes, not sheer vertical drops
    const e = 0.015;
    const dhdu = (islandHeight(u + e, v, seed) - islandHeight(u - e, v, seed)) / (2 * e);
    const dhdv = (islandHeight(u, v + e, seed) - islandHeight(u, v - e, seed)) / (2 * e);
    const slope = Math.hypot(dhdu, dhdv);
    if (slope > 1.25) continue;
    spots.push({
      x: u,
      y,
      z: v,
      s: 0.024 + Math.random() * 0.024,
      lean: (Math.random() - 0.5) * 0.20,
    });
  }
  return spots;
}

export const ISLAND_VERT = /* glsl */ `
  attribute vec3 aCol;
  varying vec3 vCol;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vCol = aCol;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const ISLAND_FRAG = /* glsl */ `
  uniform vec3 uSunColor;
  uniform vec3 uHaze;
  uniform vec3 uHorizon;
  uniform float uStorm;
  uniform float uFlash;
  varying vec3 vCol;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormal);
    
    // Directional sunlight with Half-Lambert wrap for natural mountain illumination
    vec3 sunDir = normalize(vec3(-0.38, 0.16, -0.92));
    float ndotl = clamp((dot(N, sunDir) + 0.22) / 1.22, 0.0, 1.0);
    vec3 sunLight = uSunColor * (ndotl * 1.35) * (1.0 - uStorm * 0.82);

    // Sky hemisphere ambient fill (cool twilight sky dome)
    vec3 skyZenith = vec3(0.16, 0.24, 0.38);
    vec3 skyHorizon = mix(vec3(0.44, 0.48, 0.52), vec3(0.58, 0.46, 0.38), 1.0 - uStorm * 0.7);
    vec3 ambient = mix(skyHorizon * 0.55, skyZenith * 0.85, clamp(N.y * 0.5 + 0.5, 0.0, 1.0));

    // Sunset rim & ridge backlight glow against the sky
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.5);
    float backSun = max(dot(sunDir, -V), 0.0);
    vec3 rimGlow = uSunColor * (rim * (0.28 + 0.52 * backSun)) * (1.0 - uStorm * 0.75);

    // Subtle micro-surface strata based on world elevation
    float strata = 1.0 + 0.06 * sin(vWorld.y * 1.8 + sin(vWorld.x * 0.12 + vWorld.z * 0.12) * 3.5);

    vec3 col = vCol * strata * (ambient + sunLight) + rimGlow;
    col = mix(col, col * 0.36, uStorm * 0.7);
    col += uFlash * vec3(0.35, 0.40, 0.50);

    // Atmospheric aerial perspective (soft distant mountains into dusk haze)
    float dist = length(cameraPosition - vWorld);
    float haze = 1.0 - exp(-dist * (0.00065 + uStorm * 0.0008));
    float seaMist = exp(-max(vWorld.y, 0.0) * 0.055) * 0.22;
    float totalHaze = clamp(haze + seaMist, 0.0, 0.86);

    vec3 hazeCol = mix(uHaze * 0.68, uHorizon * 0.78, 0.35) * (1.0 - uStorm * 0.65) + uFlash * 0.12;
    col = mix(col, hazeCol, totalHaze);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
