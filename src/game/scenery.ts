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
function ridged(x: number, y: number, z: number): number {
  const n = fbm3(x, y, z, 4);
  return 1 - Math.abs(n * 2 - 1);
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

/** Fine overlapping cycloid scales, tileable, near-neutral so vertex colours show. */
export function makeFishScaleTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f2f5f3";
  g.fillRect(0, 0, 256, 256);
  const step = 16;
  for (let row = -1; row <= 256 / step + 1; row++) {
    for (let col = -1; col <= 256 / step + 1; col++) {
      const x = col * step + (row % 2 ? step * 0.5 : 0);
      const y = row * step;
      const shade = 0.86 + hash3(col, row, 3) * 0.14;
      g.fillStyle = `rgba(${Math.round(255 * shade)},${Math.round(255 * shade)},${Math.round(255 * shade)},0.55)`;
      g.beginPath();
      g.ellipse(x, y, step * 0.58, step * 0.66, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(36,72,84,0.19)";
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y + 1, step * 0.52, 0.12, Math.PI - 0.12);
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.42)";
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(x - 1, y - 1, step * 0.42, 0.3, Math.PI - 0.3);
      g.stroke();
    }
  }
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(30,60,72,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
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

export function makeDetailedFishGeometry(): THREE.BufferGeometry {
  const b: Builder = { pos: [], uv: [], col: [], flex: [], idx: [] };

  /* --- body: hand-shaped fusiform profile, 16-ring cross sections --- */
  const profile: Array<[number, number, number]> = [
    [0.52, 0.014, 0.022],
    [0.49, 0.040, 0.052],
    [0.44, 0.065, 0.083],
    [0.37, 0.084, 0.113],
    [0.29, 0.098, 0.139],
    [0.20, 0.107, 0.156],
    [0.10, 0.110, 0.163],
    [0.00, 0.106, 0.157],
    [-0.10, 0.092, 0.137],
    [-0.19, 0.073, 0.109],
    [-0.27, 0.052, 0.080],
    [-0.34, 0.033, 0.052],
    [-0.40, 0.020, 0.032],
    [-0.45, 0.014, 0.023],
  ];
  const segs = 18;
  const rings = profile.length;
  const bp: number[] = [], bu: number[] = [], bc: number[] = [], bf: number[] = [], bi: number[] = [];
  for (let i = 0; i < rings; i++) {
    const [z, w, h] = profile[i];
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const sa = Math.sin(a), ca = Math.cos(a);
      const belly = ca < 0 ? 1.09 : 1;
      // slight dorsal ridge and ventral keel
      const ridge = ca > 0.75 ? 1 + (ca - 0.75) * 0.16 : 1;
      const x = sa * w;
      const y = ca * h * belly * ridge;
      bp.push(x, y, z);
      bu.push((j / segs) * 3.2, ((0.55 - z) / 1.0) * 4.2);

      const top = ca;
      const back = smooth(top, -0.12, 0.72);
      let r = lerp(0.78, 0.075, back);
      let gg = lerp(0.83, 0.34, back);
      let bb = lerp(0.79, 0.47, back);
      // warm silver flank, iridescent lateral line
      const flank = Math.exp(-Math.pow(top + 0.28, 2) * 26);
      r += flank * 0.12;
      gg += flank * 0.16;
      bb += flank * 0.1;
      if (Math.abs(top) < 0.13 && z > -0.34 && z < 0.22) {
        r *= 0.72; gg *= 0.78; bb *= 0.8;
      }
      // gill cover arc behind the head
      if (z > 0.27 && z < 0.34 && Math.abs(sa) > 0.55) {
        r *= 0.64; gg *= 0.66; bb *= 0.68;
      }
      // darker snout
      if (z > 0.45) {
        r *= 0.82; gg *= 0.84; bb *= 0.86;
      }
      const speck = 0.94 + hash3(i, j, 7) * 0.12;
      bc.push(r * speck, gg * speck, bb * speck);
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
  // nose and tail caps
  const nose = bp.length / 3;
  bp.push(0, 0, 0.535); bu.push(0, 0); bc.push(0.42, 0.47, 0.46); bf.push(0, 0);
  for (let j = 0; j < segs; j++) bi.push(nose, j + 1, j);
  const tailCap = bp.length / 3;
  bp.push(0, 0, -0.46); bu.push(0, 0); bc.push(0.12, 0.34, 0.4); bf.push(1, 0);
  const last = (rings - 1) * (segs + 1);
  for (let j = 0; j < segs; j++) bi.push(tailCap, last + j, last + j + 1);

  // body is the first part, so its indices need no offset
  for (let i = 0; i < bp.length; i++) b.pos.push(bp[i]);
  for (let i = 0; i < bu.length; i++) b.uv.push(bu[i]);
  for (let i = 0; i < bc.length; i++) b.col.push(bc[i]);
  for (let i = 0; i < bf.length; i++) b.flex.push(bf[i]);
  for (let i = 0; i < bi.length; i++) b.idx.push(bi[i]);

  /* --- fins --- */
  const finDark: RGB = [0.16, 0.40, 0.48];
  const finLight: RGB = [0.34, 0.66, 0.70];
  const finCols = [finDark, finLight, finDark, finLight, finDark, finLight, finDark];

  // forked caudal fin, upper + lower lobes
  addFin(
    b,
    [0, 0, -0.44],
    [
      [0.008, 0.075, -0.49],
      [0.018, 0.175, -0.60],
      [0.028, 0.255, -0.71],
      [0.012, 0.135, -0.615],
      [0.004, 0.025, -0.535],
    ],
    finCols,
    0,
  );
  addFin(
    b,
    [0, 0, -0.44],
    [
      [-0.008, -0.070, -0.49],
      [-0.018, -0.165, -0.60],
      [-0.028, -0.245, -0.70],
      [-0.012, -0.128, -0.61],
      [-0.004, -0.022, -0.535],
    ],
    finCols,
    0,
  );

  // dorsal fin with spiny rays
  addFin(
    b,
    [0, 0.145, 0.16],
    [
      [0.006, 0.275, 0.045],
      [0.012, 0.305, -0.035],
      [0.01, 0.255, -0.13],
      [0.006, 0.175, -0.245],
      [0.002, 0.105, -0.315],
    ],
    finCols,
    0,
  );
  // second small dorsal + anal fin
  addFin(
    b,
    [0, 0.065, -0.29],
    [[0.003, 0.135, -0.34], [0.002, 0.105, -0.40]],
    [finDark, finLight, finDark],
    0,
  );
  addFin(
    b,
    [0, -0.075, -0.09],
    [[0.004, -0.18, -0.17], [0.003, -0.20, -0.26], [0.002, -0.09, -0.33]],
    [finDark, finLight, finDark, finLight],
    0,
  );

  // paired pectoral fins (fluttering) and pelvic fins
  for (const side of [-1, 1]) {
    addFin(
      b,
      [side * 0.082, -0.015, 0.145],
      [
        [side * 0.155, -0.045, 0.075],
        [side * 0.205, -0.085, -0.015],
        [side * 0.125, -0.07, -0.085],
      ],
      [finLight, finDark, finLight, finDark],
      1,
    );
    addFin(
      b,
      [side * 0.045, -0.09, -0.09],
      [[side * 0.09, -0.145, -0.16], [side * 0.055, -0.10, -0.20]],
      [finDark, finLight, finDark],
      0.4,
    );
  }

  /* --- eyes: socket, golden iris, black pupil, catchlight --- */
  const eyeGeo = () => new THREE.SphereGeometry(1, 10, 8);
  for (const side of [-1, 1]) {
    const ex = side * 0.071;
    const layers: Array<[number, number, number, number, number, number, RGB]> = [
      [ex, 0.046, 0.355, 0.036, 0.036, 0.032, [0.045, 0.09, 0.11]],
      [ex + side * 0.012, 0.046, 0.359, 0.027, 0.027, 0.024, [0.64, 0.46, 0.19]],
      [ex + side * 0.022, 0.046, 0.363, 0.017, 0.018, 0.015, [0.012, 0.02, 0.028]],
      [ex + side * 0.031, 0.056, 0.371, 0.006, 0.006, 0.006, [0.96, 0.99, 1.0]],
    ];
    for (const [x, y, z, sx, sy, sz, col] of layers) {
      const m = new THREE.Matrix4().makeScale(sx, sy, sz);
      m.setPosition(x, y, z);
      addPart(b, eyeGeo(), m, () => col, () => [0, 0]);
    }
  }
  // mouth
  const mouthM = new THREE.Matrix4().makeScale(0.032, 0.011, 0.02);
  mouthM.setPosition(0, -0.022, 0.515);
  addPart(b, eyeGeo(), mouthM, () => [0.055, 0.065, 0.07] as RGB, () => [0, 0]);

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
  out.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
  out.setAttribute("aFlex", new THREE.Float32BufferAttribute(b.flex, 2));
  out.setIndex(b.idx);
  out.computeVertexNormals();
  return out;
}

/* ================================================================
   ISLANDS — layered coastal mountains with ridges, strata, scrub
   ================================================================ */

export function islandHeight(u: number, v: number, seed: number): number {
  const r = Math.hypot(u, v);
  const a = Math.atan2(v, u);
  const p = (k: number) => Math.sin(seed * 12.9898 + k * 7.233) * 0.5;
  const peaks: Array<[number, number, number]> = [
    [p(1) * 0.16, p(2) * 0.16, 1.0],
    [Math.cos(seed + 1.2) * 0.34, Math.sin(seed + 1.2) * 0.34, 0.72],
    [Math.cos(seed * 1.7 + 2.1) * 0.42, Math.sin(seed * 1.7 + 2.1) * 0.42, 0.58],
  ];
  let h = 0;
  for (const [px, py, ph] of peaks) {
    const d = Math.hypot(u - px, v - py);
    h += ph * Math.exp(-d * d * 9.5);
  }
  // ridged mountain creases radiating from the centre
  const ridgeN = ridged(u * 3.1 + seed, v * 3.1 - seed, seed * 0.6);
  const crease = 0.82 + 0.42 * ridgeN + 0.12 * Math.cos(a * 5 + seed * 3 + r * 6);
  const detail = fbm3(u * 13 + seed * 2, v * 13 - seed, 2.7, 4) - 0.5;
  h *= crease + detail * 0.28;
  h *= Math.max(0, 1 - Math.pow(r, 1.65));
  // sedimentary terraces
  const terr = Math.round(h * 16) / 16;
  h = lerp(h, terr, 0.22);
  // steep coastal cliffs and underwater skirt
  if (r > 0.9) h -= (r - 0.9) * 2.4;
  return h;
}

export function makeIslandGeometry(seed: number): THREE.BufferGeometry {
  const NR = 30;
  const NS = 72;
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const sun = new THREE.Vector3(-0.38, 0.115, -0.918).normalize();

  const shade = (x: number, y: number, z: number) => {
    const e = 0.012;
    const dhdu = (islandHeight(x + e, z, seed) - islandHeight(x - e, z, seed)) / (2 * e);
    const dhdv = (islandHeight(x, z + e, seed) - islandHeight(x, z - e, seed)) / (2 * e);
    const n = new THREE.Vector3(-dhdu, 1, -dhdv).normalize();
    const slope = Math.hypot(dhdu, dhdv);
    const sunlight = Math.max(0, n.dot(sun));
    const n2 = fbm3(x * 9 + seed * 3, y * 7, z * 9 - seed, 4);
    const strata = 0.86 + 0.14 * Math.sin(y * 46 + n2 * 6);

    // wet dark rock at the waterline
    let R = lerp(0.12, 0.42, smooth(y, 0.02, 0.62));
    let G = lerp(0.16, 0.38, smooth(y, 0.02, 0.62));
    let B = lerp(0.18, 0.36, smooth(y, 0.02, 0.62));
    // sparse rich pine/moss scrub on gentler mid slopes
    const scrub = (1 - smooth(slope, 0.5, 1.5)) * smooth(y, 0.06, 0.22) * (1 - smooth(y, 0.55, 0.85));
    const scrubN = smooth(n2, 0.40, 0.72);
    R = lerp(R, 0.14, scrub * scrubN);
    G = lerp(G, 0.34, scrub * scrubN);
    B = lerp(B, 0.20, scrub * scrubN);
    // pale exposed granite rock on the highest crags
    const crag = smooth(y, 0.58, 0.92) * smooth(slope, 0.35, 1.3);
    R = lerp(R, 0.58, crag * 0.75);
    G = lerp(G, 0.52, crag * 0.75);
    B = lerp(B, 0.48, crag * 0.75);
    // stratification + warm dusk illumination
    const lit = 0.75 + sunlight * 0.65;
    R *= (strata + sunlight * 0.45 + 0.08) * lit;
    G *= (strata + sunlight * 0.22 + 0.08) * lit;
    B *= (strata + sunlight * 0.12 + 0.08) * lit;
    // stone highlights on peaks
    const cap = smooth(y, 0.76, 1.02) * 0.25;
    R += cap * 0.42;
    G += cap * 0.38;
    B += cap * 0.34;
    // wet shoreline
    const wet = 1 - smooth(y, -0.03, 0.10);
    R *= 1 - wet * 0.50;
    G *= 1 - wet * 0.35;
    B *= 1 - wet * 0.22;
    const grain = 0.92 + n2 * 0.18;
    return [R * grain, G * grain, B * grain] as RGB;
  };

  for (let i = 0; i <= NR; i++) {
    const r = i / NR;
    for (let j = 0; j <= NS; j++) {
      const a = (j / NS) * Math.PI * 2;
      // irregular coastline
      const coast = 1 + 0.11 * (fbm3(Math.cos(a) * 2.2 + seed, Math.sin(a) * 2.2, 4.4, 3) - 0.5);
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
    pos.push(pos[k], -0.34, pos[k + 2]);
    uv.push((j / NS) * 6, 5.4);
    col.push(0.035, 0.065, 0.07);
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

export function islandTreeSpots(seed: number, count: number): TreeSpot[] {
  const spots: TreeSpot[] = [];
  let tries = 0;
  while (spots.length < count && tries++ < count * 12) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.3 + Math.random() * 0.48;
    const u = Math.cos(a) * r;
    const v = Math.sin(a) * r;
    const y = islandHeight(u, v, seed);
    if (y < 0.1 || y > 0.62) continue;
    spots.push({
      x: u,
      y,
      z: v,
      s: 0.026 + Math.random() * 0.022,
      lean: (Math.random() - 0.5) * 0.28,
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
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    
    // Directional sunlight + ambient sky fill on the hills
    vec3 sunDir = normalize(vec3(-0.38, 0.14, -0.92));
    float ndotl = max(dot(N, sunDir), 0.0);
    vec3 ambient = mix(vec3(0.36, 0.42, 0.50), vec3(0.52, 0.40, 0.46), 1.0 - uStorm * 0.7);
    vec3 directSun = uSunColor * (ndotl * 1.25 + rim * 0.35) * (1.0 - uStorm * 0.85);
    
    vec3 col = vCol * (ambient + directSun);
    col = mix(col, col * 0.38, uStorm * 0.7);
    col += uFlash * vec3(0.12, 0.15, 0.20);

    // Atmospheric aerial perspective (soft distant mountains into dusk haze)
    float dist = length(cameraPosition - vWorld);
    float haze = 1.0 - exp(-dist * (0.00075 + uStorm * 0.0008));
    vec3 hazeCol = mix(uHaze * 0.65, uHorizon * 0.75, 0.35) * (1.0 - uStorm * 0.65) + uFlash * 0.1;
    col = mix(col, hazeCol, clamp(haze, 0.0, 0.84));

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
