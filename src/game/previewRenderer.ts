/* Photorealistic 3D Three.js preview renderer for Mode Selection & Unlock modals.
   Shares a single offscreen WebGLRenderer across all mounted <EnvironmentPreview>
   canvases so desktop and Android WebViews never hit WebGL context limits. */
import * as THREE from "three";
import type { EnvironmentMode } from "./storage";
import {
  ISLAND_FRAG,
  ISLAND_VERT,
  islandTreeSpots,
  makeDeckTexture,
  makeDetailedClothTexture,
  makeDetailedWoodTexture,
  makeIslandGeometry,
  makeLighthouseGroup,
  makePineTreeGeometry,
} from "./scenery";
import {
  makeBioPlantGeometry,
  makeFernBushGeometry,
  makeMangroveArchGeometry,
  makeMangroveArchetype,
  makeMangroveBarkTexture,
  makeRootSnagGeometry,
  makeWaterLilyGeometry,
} from "./mangrove";

const clamp = THREE.MathUtils.clamp;
const smooth = THREE.MathUtils.smoothstep;

/* ---------------- shared procedural wave & sky shaders ---------------- */

function waveH(x: number, z: number, t: number): number {
  return (
    0.5 * Math.sin((x * 1.0 + z * 0.35) * 0.14 + t * 0.8) +
    0.3 * Math.sin((x * -0.6 + z * 1.0) * 0.23 + t * 1.15) +
    0.16 * Math.sin((x * 0.9 - z * 0.45) * 0.42 + t * 1.9)
  );
}

const PREVIEW_GLSL_NOISE = /* glsl */ `
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
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}
`;

const PREVIEW_GLSL_WAVE = /* glsl */ `
uniform float uTime;
uniform float uAmp;
float waveH(vec2 p, float t) {
  float h = 0.0;
  h += 0.50 * sin((p.x * 1.00 + p.y * 0.35) * 0.14 + t * 0.80);
  h += 0.30 * sin((p.x * -0.60 + p.y * 1.00) * 0.23 + t * 1.15);
  h += 0.16 * sin((p.x * 0.90 - p.y * 0.45) * 0.42 + t * 1.90);
  return h;
}
`;

const PREVIEW_GLSL_SKY = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uMid;
uniform vec3 uZenith;
uniform vec3 uHaze;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uSunGlare;
uniform float uMangrove;
vec3 skyColor(vec3 d) {
  float y = max(d.y, 0.0);
  float s = max(dot(d, uSunDir), 0.0);
  float m = max(dot(d, uMoonDir), 0.0);
  float hz = 1.0 - smoothstep(0.0, 0.34, y);
  vec3 warm = mix(uHaze, uHorizon, pow(s, 1.8));
  vec3 col = mix(warm, uMid, smoothstep(0.0, 0.2, y));
  col = mix(col, uZenith, smoothstep(0.08, 0.62, y));
  col += uSunColor * (pow(s, 9.0) * 0.24 * hz + pow(s, 68.0) * 0.40) * uSunGlare * (1.0 - uMangrove);
  col += uSunColor * (pow(m, 14.0) * 0.18 + pow(m, 88.0) * 0.28) * uMangrove;
  return col;
}
`;

function makeWaterGrid(seg: number, half: number, power: number): THREE.BufferGeometry {
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

function makeGlowSpriteTex(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.18, "rgba(255,255,255,0.64)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.22)");
  grad.addColorStop(0.75, "rgba(255,255,255,0.05)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeFoamRingTex(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 650; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = 64 + Math.pow(Math.random(), 1.8) * 56;
    const fade = 1 - (rr - 64) / 56;
    const x = 128 + Math.cos(a) * rr;
    const y = 128 + Math.sin(a) * rr;
    const s = 2 + Math.random() * 6 * fade;
    const grad = g.createRadialGradient(x, y, 0, x, y, s);
    grad.addColorStop(0, `rgba(255,255,255,${0.12 + fade * 0.36})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(x - s, y - s, s * 2, s * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, d.length(), 7), mat);
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

interface SailMeshData {
  geo: THREE.BufferGeometry;
  c: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  k: number;
}

function makeSailMeshData(
  c: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3],
  k: number,
  n = 8,
): SailMeshData {
  const geo = new THREE.BufferGeometry();
  const count = (n + 1) * (n + 1);
  const uv = new Float32Array(count * 2);
  const idx: number[] = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const id = j * (n + 1) + i;
      uv[id * 2] = i / n;
      uv[id * 2 + 1] = j / n;
      if (i < n && j < n) idx.push(id, id + 1, id + n + 1, id + 1, id + n + 2, id + n + 1);
    }
  }
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);

  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const btm = new THREE.Vector3();
  const top = new THREE.Vector3();
  for (let j = 0; j <= n; j++) {
    const v = j / n;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      btm.lerpVectors(c[0], c[1], u);
      top.lerpVectors(c[2], c[3], u);
      p.lerpVectors(btm, top, v);
      const belly = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.34 * k;
      p.x += belly;
      pos.setXYZ(j * (n + 1) + i, p.x, p.y, p.z);
    }
  }
  geo.computeVertexNormals();
  return { geo, c, k };
}

interface PreviewBoat {
  group: THREE.Group;
  lanternPivot: THREE.Group;
  lanternLight: THREE.PointLight;
  lanternHalo: THREE.Sprite;
  flameMesh: THREE.Mesh;
  lanternWorldPos: THREE.Vector3;
}

/** Build the realistic planked clinker sailboat with lateen sails & glowing bow lantern. */
function buildPreviewBoat(
  woodTex: THREE.CanvasTexture,
  deckTex: THREE.CanvasTexture,
  clothTex: THREE.CanvasTexture,
  glowTex: THREE.Texture,
  lanternIntensity = 42,
): PreviewBoat {
  const boat = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    bumpMap: woodTex,
    bumpScale: 0.55,
    roughness: 0.72,
    side: THREE.DoubleSide,
  });
  const hullMat = woodMat.clone();
  hullMat.vertexColors = true;
  hullMat.roughness = 0.66;
  const deckMat = new THREE.MeshStandardMaterial({
    map: deckTex,
    bumpMap: deckTex,
    bumpScale: 0.4,
    roughness: 0.82,
    side: THREE.DoubleSide,
  });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x3a2413, roughness: 0.82 });
  const caulk = new THREE.MeshStandardMaterial({ color: 0x140c06, roughness: 1 });
  const paint = new THREE.MeshStandardMaterial({ color: 0x263a38, roughness: 0.55, metalness: 0.18 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x24221f, roughness: 0.42, metalness: 0.75 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8a7350, roughness: 1 });

  const NS = 28;
  const NR = 16;
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
  const hx = (aa: number, p: ReturnType<typeof prof>) => Math.pow(aa, 0.55) * p.beam;
  const hy = (aa: number, p: ReturnType<typeof prof>) => p.keel + (p.top - p.keel) * Math.pow(aa, 2.3);
  const hz = (aa: number, p: ReturnType<typeof prof>) => p.z - p.rake * Math.pow(aa, 2.3);

  const pos: number[] = [];
  const uv: number[] = [];
  const hcol: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= NS; i++) {
    const p = prof(i / NS);
    for (let j = 0; j <= NR; j++) {
      const a = (j / NR) * 2 - 1;
      const aa = Math.abs(a);
      const y = hy(aa, p);
      pos.push(Math.sign(a) * hx(aa, p), y, hz(aa, p));
      uv.push((i / NS) * 3.2, aa);
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

  // Deck planks
  const fpos: number[] = [];
  const fuv: number[] = [];
  const fidx: number[] = [];
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

  // Gunwales & waterline strake
  for (const side of [-1, 1]) {
    const rail: THREE.Vector3[] = [];
    const stripe: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const p = prof(i / 16);
      rail.push(new THREE.Vector3(side * p.beam, p.top + 0.02, p.z - p.rake));
      stripe.push(new THREE.Vector3(side * hx(0.62, p) * 1.014, hy(0.62, p), hz(0.62, p)));
    }
    boat.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 28, 0.052, 6), darkWood));
    boat.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stripe), 24, 0.02, 5), paint));
  }
  for (const aa of [0.35, 0.72]) {
    for (const side of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 14; i++) {
        const p = prof(i / 14);
        pts.push(new THREE.Vector3(side * hx(aa, p) * 1.008, hy(aa, p), hz(aa, p)));
      }
      boat.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.011, 4), caulk));
    }
  }

  // Transom, stem, benches, crate, barrel, rope coil
  const transom = new THREE.Mesh(new THREE.BoxGeometry(stern.beam * 1.85, 0.36, 0.075), woodMat);
  transom.position.set(0, stern.top - 0.21, stern.z + 0.035);
  boat.add(transom);
  boat.add(rod(new THREE.Vector3(0, 0.5, -2.32), new THREE.Vector3(0, 1.2, -2.55), 0.042, darkWood));
  for (const t of [0.38, 0.72]) {
    const p = prof(t);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(p.beam * 1.78, 0.075, 0.32), woodMat);
    bench.position.set(0, p.top - 0.15, p.z);
    boat.add(bench);
  }
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.42), woodMat);
  crate.position.set(0.3, 0.45, 0.34);
  crate.rotation.y = 0.3;
  boat.add(crate);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.155, 0.42, 12), woodMat);
  barrel.position.set(-0.34, 0.5, 1.2);
  boat.add(barrel);
  for (let k = 0; k < 2; k++) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.11 + k * 0.02, 0.014, 5, 16), ropeMat);
    coil.rotation.x = Math.PI / 2;
    coil.position.set(-0.48, 0.32 + k * 0.025, 0.82);
    boat.add(coil);
  }

  // Mast, rigging & woven lateen sails
  const mastZ = -0.35;
  boat.add(rod(new THREE.Vector3(0, 0.28, mastZ), new THREE.Vector3(0, 3.6, mastZ), 0.05, darkWood));
  const rigGeo = new THREE.BufferGeometry();
  rigGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0, 3.58, mastZ, 0, 1.2, -2.62,
        0, 3.58, mastZ, 0, 0.75, 1.78,
        0, 3.5, mastZ, 0.92, 0.66, 0.2,
        0, 3.5, mastZ, -0.92, 0.66, 0.2,
      ],
      3,
    ),
  );
  boat.add(new THREE.LineSegments(rigGeo, new THREE.LineBasicMaterial({ color: 0x2a2016 })));

  const sailMat = new THREE.MeshStandardMaterial({
    map: clothTex,
    roughness: 0.92,
    side: THREE.DoubleSide,
    emissive: 0xffb070,
    emissiveMap: clothTex,
    emissiveIntensity: 0.16,
  });
  const rig = new THREE.Group();
  rig.position.set(0, 0, mastZ);
  rig.rotation.y = 0.22;
  rig.add(rod(new THREE.Vector3(0, 0.95, 0), new THREE.Vector3(0, 0.93, 1.85), 0.035, darkWood));
  rig.add(rod(new THREE.Vector3(0, 2.8, 0), new THREE.Vector3(0, 3.25, 1.4), 0.03, darkWood));
  const mainSail = makeSailMeshData(
    [
      new THREE.Vector3(0, 1.0, 0.06),
      new THREE.Vector3(0, 0.97, 1.78),
      new THREE.Vector3(0, 2.78, 0.06),
      new THREE.Vector3(0, 3.2, 1.34),
    ],
    1.0,
  );
  rig.add(new THREE.Mesh(mainSail.geo, sailMat));
  boat.add(rig);

  const jibSail = makeSailMeshData(
    [
      new THREE.Vector3(0, 1.22, -2.58),
      new THREE.Vector3(0, 1.0, -0.72),
      new THREE.Vector3(0, 3.35, -0.42),
      new THREE.Vector3(0, 3.35, -0.42),
    ],
    0.6,
  );
  boat.add(new THREE.Mesh(jibSail.geo, sailMat));

  // Bow lantern hook & swinging warm brass lantern
  const hook = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.08, -2.58),
    new THREE.Vector3(0, 1.6, -2.78),
    new THREE.Vector3(0, 1.9, -3.02),
    new THREE.Vector3(0, 1.84, -3.22),
  ]);
  boat.add(new THREE.Mesh(new THREE.TubeGeometry(hook, 14, 0.028, 6), metal));

  const lanternPivot = new THREE.Group();
  lanternPivot.position.set(0, 1.84, -3.22);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.1, 8), metal);
  cap.position.y = -0.1;
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 6), metal);
  roof.position.y = -0.035;
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.088, 0.098, 0.22, 8, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x3a1c08,
      emissive: new THREE.Color(1.0, 0.56, 0.2),
      emissiveIntensity: 4.5,
      roughness: 0.18,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
    }),
  );
  glass.position.y = -0.25;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.105, 0.045, 8), metal);
  base.position.y = -0.37;
  const flameMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.036, 0.14, 7),
    new THREE.MeshStandardMaterial({
      color: 0xffd28a,
      emissive: 0xffb43c,
      emissiveIntensity: 5.5,
      roughness: 0.4,
    }),
  );
  flameMesh.position.y = -0.26;
  const lanternHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: new THREE.Color(1.0, 0.52, 0.18),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      opacity: 0.88,
      fog: false,
    }),
  );
  lanternHalo.scale.setScalar(3.4);
  lanternHalo.position.y = -0.25;

  const lanternLight = new THREE.PointLight(0xffa456, lanternIntensity, 38, 1.8);
  lanternLight.position.y = -0.25;
  lanternPivot.add(cap, roof, glass, base, flameMesh, lanternHalo, lanternLight);
  boat.add(lanternPivot);

  return {
    group: boat,
    lanternPivot,
    lanternLight,
    lanternHalo,
    flameMesh,
    lanternWorldPos: new THREE.Vector3(),
  };
}

/* ---------------- scene shader factory ---------------- */

interface PreviewSceneRig {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update: (t: number, locked: boolean) => void;
}

function createSkyAndWater(
  scene: THREE.Scene,
  opts: {
    mangrove: number;
    horizon: THREE.Color;
    mid: THREE.Color;
    zenith: THREE.Color;
    haze: THREE.Color;
    sunColor: THREE.Color;
    sunDir: THREE.Vector3;
    moonDir: THREE.Vector3;
    sunGlare: number;
    deep: THREE.Color;
    scatter: THREE.Color;
    fogDensity: number;
    amp: number;
  },
) {
  const glowPos = Array.from({ length: 6 }, () => new THREE.Vector4(0, -100, 0, 0));
  const glowCol = Array.from({ length: 6 }, () => new THREE.Color(0, 0, 0));

  const sharedUniforms = {
    uTime: { value: 0 },
    uAmp: { value: opts.amp },
    uHorizon: { value: opts.horizon },
    uMid: { value: opts.mid },
    uZenith: { value: opts.zenith },
    uHaze: { value: opts.haze },
    uSunColor: { value: opts.sunColor },
    uSunDir: { value: opts.sunDir },
    uMoonDir: { value: opts.moonDir },
    uSunGlare: { value: opts.sunGlare },
    uMangrove: { value: opts.mangrove },
    uDeep: { value: opts.deep },
    uScatter: { value: opts.scatter },
    uFogDensity: { value: opts.fogDensity },
    uGlowPos: { value: glowPos },
    uGlowCol: { value: glowCol },
  };

  // Sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: sharedUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vDir;
      ${PREVIEW_GLSL_SKY}
      ${PREVIEW_GLSL_NOISE}
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = skyColor(d);
        float s = max(dot(d, uSunDir), 0.0);
        float md = max(dot(d, uMoonDir), 0.0);

        // Stars
        float starMask = smoothstep(0.12, 0.72, d.y) * mix(0.85, 0.45, uMangrove);
        if (starMask > 0.01) {
          vec2 sp = d.xz / (d.y + 0.35) * 48.0;
          vec2 cell = floor(sp);
          float h = hash21(cell);
          vec2 off = vec2(hash21(cell + 7.3), hash21(cell + 13.1)) - 0.5;
          float dd = length(fract(sp) - 0.5 - off * 0.6);
          float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 2.5) + h * 35.0);
          col += vec3(0.82, 0.92, 1.0) * step(0.90 + uMangrove * 0.03, h) * smoothstep(0.11, 0.0, dd) * tw * starMask * 1.15;
        }

        // Warm dusk sun disk / midnight silver-teal moon disk
        col += uSunColor * smoothstep(0.9987, 0.9995, s) * 2.2 * uSunGlare * (1.0 - uMangrove);
        col += uSunColor * smoothstep(0.9985, 0.99935, md) * 1.75 * uMangrove;

        // Backlit procedural FBM cloud decks
        float cm = smoothstep(-0.01, 0.11, d.y);
        if (cm > 0.0) {
          vec2 cp = d.xz / (d.y + 0.16) * 0.9 + vec2(uTime * 0.008 + 2.4, 1.3);
          float c = fbm(cp) * 0.78 + fbm(cp * 2.8 + 11.0) * 0.22;
          float dens = smoothstep(0.49, 0.77, c) * cm;
          float thin = 1.0 - smoothstep(0.49, 0.88, c);
          float lit = mix(pow(s, 4.0) * uSunGlare, pow(md, 5.0) * 0.85, uMangrove);
          vec3 cDark = mix(vec3(0.08, 0.068, 0.095), vec3(0.012, 0.025, 0.032), uMangrove);
          vec3 cLit = mix(uHorizon * 0.78, uSunColor * 1.18, lit);
          vec3 cc = mix(cDark, cLit, thin * (0.28 + 0.72 * lit));
          col = mix(col, cc, dens * mix(0.9, 0.72, uMangrove));
        }

        // Distant misty mangrove tree wall silhouettes
        if (uMangrove > 0.01 && d.y < 0.28) {
          float az = atan(d.x, -d.z);
          float crown = 0.06 + 0.075 * vnoise(vec2(az * 9.0 + 3.0, 2.1)) + 0.035 * vnoise(vec2(az * 24.0, 7.4));
          float bankWall = smoothstep(0.14, 0.56, abs(d.x)) * 0.09;
          float mask = (1.0 - smoothstep(crown + bankWall - 0.018, crown + bankWall + 0.012, d.y)) * smoothstep(-0.04, 0.015, d.y);
          col = mix(col, vec3(0.014, 0.038, 0.035), mask * 0.92);
        }

        gl_FragColor = vec4(max(col, 0.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), skyMat);
  skyMesh.renderOrder = -10;
  scene.add(skyMesh);

  // Fresnel wave water shader
  const waterMat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: sharedUniforms,
    vertexShader: /* glsl */ `
      ${PREVIEW_GLSL_WAVE}
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += waveH(wp.xz, uTime) * uAmp;
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep;
      uniform vec3 uScatter;
      uniform float uFogDensity;
      uniform vec4 uGlowPos[6];
      uniform vec3 uGlowCol[6];
      varying vec3 vWorld;
      ${PREVIEW_GLSL_WAVE}
      ${PREVIEW_GLSL_SKY}
      ${PREVIEW_GLSL_NOISE}

      vec2 dw(vec2 p, vec2 dir, float f, float a, float ph) {
        return dir * (a * f * cos(dot(dir, p) * f + ph));
      }

      void main() {
        vec2 p = vWorld.xz;
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        float t = uTime;

        float e = 0.25;
        float h0 = waveH(p, t) * uAmp;
        vec2 grad = vec2(waveH(p + vec2(e, 0.0), t) * uAmp - h0, waveH(p + vec2(0.0, e), t) * uAmp - h0) / e;

        vec2 q = p + 0.65 * vec2(sin(p.y * 0.21 + t * 0.35), cos(p.x * 0.17 - t * 0.3));
        float fMid = exp(-dist * 0.008);
        float fFine = exp(-dist * 0.028);
        vec2 g = vec2(0.0);
        g += dw(q, vec2(0.80, 0.60), 0.95, 0.056, t * 1.6) * fMid;
        g += dw(q, vec2(-0.55, 0.83), 1.4, 0.042, t * 1.9) * fMid;
        g += dw(q, vec2(0.30, -0.95), 2.1, 0.028, t * 2.3) * fMid;
        g += dw(q, vec2(-0.92, -0.38), 3.1, 0.017, t * 2.9) * fFine;
        g += dw(q, vec2(0.66, 0.75), 4.6, 0.011, t * 3.6) * fFine;
        g += dw(q, vec2(-0.20, 0.98), 6.5, 0.007, t * 4.4) * fFine;
        vec2 np = q * 2.2 + vec2(t * 0.45, -t * 0.32);
        float na = vnoise(np);
        g += vec2(vnoise(np + vec2(0.28, 0.0)) - na, vnoise(np + vec2(0.0, 0.28)) - na) * 0.46 * fFine;
        grad += g;

        vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
        float NdV = max(dot(N, V), 0.0);
        float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
        vec3 R = reflect(-V, N);
        vec3 refl = skyColor(normalize(vec3(R.x, abs(R.y) + 0.03, R.z)));

        float sunFace = pow(max(dot(-V, uSunDir), 0.0), 2.0);
        float crest = clamp(h0 / max(uAmp, 0.35) * 0.6 + 0.45, 0.0, 1.0);
        vec3 body = uDeep + uScatter * (0.12 + 0.30 * sunFace * (1.0 - uMangrove)) * crest;

        // Mangrove canopy overhang shadow + sunlit/moonlit center gap
        if (uMangrove > 0.01) {
          float channel = smoothstep(14.0, 2.5, abs(p.x));
          float dapple = smoothstep(0.30, 0.78, vnoise(p * 0.09 + vec2(0.0, 1.1)));
          float mask = mix(0.32, 1.0, channel * dapple);
          body = mix(body, body * (0.55 + 0.65 * mask) + uScatter * 0.14 * mask, uMangrove);
          refl *= mix(1.0, 0.42 + 0.58 * channel, uMangrove);
        }

        vec3 col = mix(body, refl, F);

        // Specular sun / moon shimmer column
        float sd = max(dot(R, uSunDir), 0.0);
        col += uSunColor * pow(sd, mix(90.0, 560.0, fFine)) * mix(1.0, 4.2, fFine) * uSunGlare * (1.0 - uMangrove);
        float md = max(dot(R, uMoonDir), 0.0);
        float mChan = smoothstep(16.0, 2.0, abs(p.x));
        col += uSunColor * pow(md, mix(55.0, 250.0, fFine)) * mix(0.45, 1.7, fFine) * uMangrove * (0.35 + 0.65 * mChan);

        // Lantern, wisp, and bioluminescent light reflections on ripples
        vec3 glowDiff = vec3(0.0);
        for (int i = 0; i < 6; i++) {
          float inten = uGlowPos[i].w;
          vec3 Lv = uGlowPos[i].xyz - vWorld;
          float d2 = dot(Lv, Lv);
          if (inten > 0.001 && d2 < 2400.0) {
            vec3 L = Lv * inversesqrt(d2);
            float nh = max(dot(N, normalize(L + V)), 0.0);
            glowDiff += uGlowCol[i] * (inten / (1.0 + d2 * 0.08)) * max(dot(N, L), 0.0);
            col += uGlowCol[i] * inten * (pow(nh, 150.0) * 3.2 + pow(nh, 20.0) * 0.25) / (1.0 + d2 * 0.015);
          }
        }
        col += glowDiff * (uScatter * 1.6 + 0.08);

        // Aerial perspective into horizon sky
        vec3 fogCol = skyColor(normalize(vec3(-V.x, 0.015, -V.z)));
        float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        col = mix(col, fogCol, fog);

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const water = new THREE.Mesh(makeWaterGrid(110, 420, 2.2), waterMat);
  water.frustumCulled = false;
  scene.add(water);

  return { sharedUniforms, glowPos, glowCol };
}

/* ---------------- Sea Mode 3D Scene ---------------- */

function buildSeaPreviewScene(
  woodTex: THREE.CanvasTexture,
  deckTex: THREE.CanvasTexture,
  clothTex: THREE.CanvasTexture,
  glowTex: THREE.Texture,
  foamTex: THREE.Texture,
): PreviewSceneRig {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(44, 2, 0.3, 900);

  const horizon = new THREE.Color("#e88448");
  const haze = new THREE.Color("#73848e");
  const sunColor = new THREE.Color("#f4ad6c");
  const sunDir = new THREE.Vector3(0.14, 0.105, -0.984).normalize();

  const { sharedUniforms, glowPos, glowCol } = createSkyAndWater(scene, {
    mangrove: 0,
    horizon,
    mid: new THREE.Color("#856876"),
    zenith: new THREE.Color("#1d3b52"),
    haze,
    sunColor,
    sunDir,
    moonDir: new THREE.Vector3(0, 0.4, -1),
    sunGlare: 1.0,
    deep: new THREE.Color("#08323f"),
    scatter: new THREE.Color("#1ea49c"),
    fogDensity: 0.0036,
    amp: 0.56,
  });

  // Dusk lighting
  const hemi = new THREE.HemisphereLight(0x7492ae, 0x1a3038, 1.12);
  const sunLight = new THREE.DirectionalLight(0xffb474, 2.5);
  sunLight.position.copy(sunDir).multiplyScalar(120);
  const fillLight = new THREE.DirectionalLight(0x528090, 0.62);
  fillLight.position.set(30, 25, 40);
  scene.add(hemi, sunLight, fillLight);

  // Hero Sailboat framed at left rule-of-thirds in 3/4 profile sailing toward horizon
  const boat = buildPreviewBoat(woodTex, deckTex, clothTex, glowTex, 48);
  boat.group.position.set(-0.45, 0, -1.5);
  boat.group.rotation.y = -0.52;
  scene.add(boat.group);

  // Left Alpine Coastal Island + Pine Trees + Surf Foam
  const islandMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunColor: { value: sunColor },
      uHaze: { value: haze },
      uHorizon: { value: horizon },
      uStorm: { value: 0 },
      uFlash: { value: 0 },
    },
    vertexShader: ISLAND_VERT,
    fragmentShader: ISLAND_FRAG,
    side: THREE.DoubleSide,
  });
  const pineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.06 });
  const foamMat = new THREE.MeshBasicMaterial({
    map: foamTex,
    color: new THREE.Color(0.92, 0.94, 0.95),
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const islGroup = new THREE.Group();
  islGroup.add(new THREE.Mesh(makeIslandGeometry(2.1), islandMat));
  const spots = islandTreeSpots(2.1, 75);
  if (spots.length) {
    const pines = new THREE.InstancedMesh(makePineTreeGeometry(), pineMat, spots.length);
    const d = new THREE.Object3D();
    spots.forEach((sp, k) => {
      d.position.set(sp.x, sp.y + sp.s * 0.12, sp.z);
      d.rotation.set(sp.lean, k * 1.7, sp.lean * 0.5);
      d.scale.set(sp.s, sp.s * 1.25, sp.s);
      d.updateMatrix();
      pines.setMatrixAt(k, d.matrix);
    });
    pines.instanceMatrix.needsUpdate = true;
    islGroup.add(pines);
  }
  const surfGeo = new THREE.PlaneGeometry(2.55, 2.55);
  surfGeo.rotateX(-Math.PI / 2);
  const surf = new THREE.Mesh(surfGeo, foamMat);
  surf.position.y = 0.055;
  islGroup.add(surf);
  islGroup.position.set(-46, -0.35, -82);
  islGroup.scale.set(34, 24, 34);
  islGroup.rotation.y = 0.7;
  scene.add(islGroup);

  // Right Distant Coastal Lighthouse Haven
  const lighthouse = makeLighthouseGroup();
  lighthouse.group.position.set(54, -1.2, -98);
  lighthouse.group.scale.setScalar(0.56);
  lighthouse.beamPivot.rotation.y = -1.9;
  scene.add(lighthouse.group);

  // Floating Collectible Wisps casting water reflections
  const wispSpecs = [
    { x: -3.1, z: 0.8, col: new THREE.Color(1.0, 0.62, 0.24), ph: 0.5 },
    { x: 2.35, z: -2.6, col: new THREE.Color(0.24, 0.92, 0.78), ph: 2.1 },
    { x: 3.4, z: -9.5, col: new THREE.Color(1.0, 0.68, 0.30), ph: 3.8 },
  ];
  const wispNodes = wispSpecs.map((ws) => {
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 10),
      new THREE.MeshBasicMaterial({ color: ws.col }),
    );
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: ws.col,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.9,
      }),
    );
    halo.scale.setScalar(1.9);
    core.add(halo);
    core.position.set(ws.x, 1.0, ws.z);
    scene.add(core);
    return { mesh: core, spec: ws };
  });

  glowCol[0].setRGB(1.0, 0.54, 0.18);
  glowCol[1].copy(wispSpecs[0].col);
  glowCol[2].copy(wispSpecs[1].col);
  glowCol[3].copy(wispSpecs[2].col);

  return {
    scene,
    camera,
    update: (t: number) => {
      sharedUniforms.uTime.value = t;

      // Subtle camera hover over ocean swells
      camera.position.set(
        2.4 + Math.sin(t * 0.35) * 0.22,
        2.25 + Math.sin(t * 0.52) * 0.08,
        8.2 + Math.cos(t * 0.28) * 0.2,
      );
      camera.lookAt(-0.2, 1.65, -18);

      // Boat buoyancy & pitch/roll on live wave surface
      const bx = boat.group.position.x;
      const bz = boat.group.position.z;
      const h = waveH(bx, bz, t) * 0.56;
      const hx = waveH(bx + 0.8, bz, t) * 0.56;
      const hz = waveH(bx, bz + 1.2, t) * 0.56;
      boat.group.position.y = h - 0.12;
      boat.group.rotation.z = clamp((h - hx) * 0.35, -0.14, 0.14);
      boat.group.rotation.x = clamp((hz - h) * 0.22, -0.1, 0.1);

      // Live bow lantern flicker & gentle swing
      boat.lanternPivot.rotation.z = Math.sin(t * 2.1) * 0.08;
      boat.lanternPivot.rotation.x = Math.cos(t * 1.7) * 0.06;
      const flicker = 1 + 0.09 * Math.sin(t * 11.3) + 0.05 * Math.sin(t * 23.1);
      boat.lanternLight.intensity = 46 * flicker;
      boat.flameMesh.scale.set(1, flicker, 1);
      boat.lanternHalo.scale.setScalar(3.35 * flicker);

      updateLanternGlowUniform(boat, glowPos[0], 2.5 * flicker);

      // Slow lighthouse beam sweep
      lighthouse.beamPivot.rotation.y = -2.2 + Math.sin(t * 0.32) * 0.55;

      // Floating wisps
      for (let i = 0; i < wispNodes.length; i++) {
        const wn = wispNodes[i];
        const wy = waveH(wn.spec.x, wn.spec.z, t) * 0.56 + 0.92 + Math.sin(t * 1.6 + wn.spec.ph) * 0.2;
        wn.mesh.position.y = wy;
        glowPos[i + 1].set(wn.spec.x, wy, wn.spec.z, 1.65);
      }
    },
  };
}

// Small helper attached via helper method below cleanly using local vector
function updateLanternGlowUniform(boat: PreviewBoat, out: THREE.Vector4, intensity: number) {
  boat.lanternLight.getWorldPosition(boat.lanternWorldPos);
  out.set(boat.lanternWorldPos.x, boat.lanternWorldPos.y, boat.lanternWorldPos.z, intensity);
}

/* ---------------- Enchanted Mangrove 3D Scene ---------------- */

function buildMangrovePreviewScene(
  woodTex: THREE.CanvasTexture,
  deckTex: THREE.CanvasTexture,
  clothTex: THREE.CanvasTexture,
  barkTex: THREE.CanvasTexture,
  glowTex: THREE.Texture,
): PreviewSceneRig {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 2, 0.3, 700);
  scene.fog = new THREE.FogExp2(0x061b20, 0.022);

  const moonDir = new THREE.Vector3(-0.07, 0.24, -0.968).normalize();
  const moonColor = new THREE.Color("#b4d5de");

  const { sharedUniforms, glowPos, glowCol } = createSkyAndWater(scene, {
    mangrove: 1.0,
    horizon: new THREE.Color("#0d3036"),
    mid: new THREE.Color("#071C25"),
    zenith: new THREE.Color("#020911"),
    haze: new THREE.Color("#0a272d"),
    sunColor: moonColor,
    sunDir: moonDir,
    moonDir,
    sunGlare: 0.32,
    deep: new THREE.Color("#062D2B"),
    scatter: new THREE.Color("#155D55"),
    fogDensity: 0.0115,
    amp: 0.20,
  });

  // Cool midnight forest lighting + moonlight
  const hemi = new THREE.HemisphereLight(0x467382, 0x0a201c, 0.88);
  const moonLight = new THREE.DirectionalLight(0xb2d8e4, 1.25);
  moonLight.position.copy(moonDir).multiplyScalar(90);
  const rimBack = new THREE.DirectionalLight(0x326b66, 0.52);
  rimBack.position.set(0, 14, 30);
  scene.add(hemi, moonLight, rimBack);

  const barkMat = new THREE.MeshStandardMaterial({
    map: barkTex,
    bumpMap: barkTex,
    bumpScale: 0.34,
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.08,
    emissive: new THREE.Color(0x061412),
    emissiveIntensity: 0.45,
  });
  const canopyMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.04,
  });

  // Left & Right Bank Mangrove Trees framing the canal
  const archetypes = [
    makeMangroveArchetype(11.3),
    makeMangroveArchetype(31.0),
    makeMangroveArchetype(50.7),
  ];
  const treePlacements = [
    { x: -6.4, z: 0.2, side: -1, yaw: 0.16, sx: 0.85, sy: 0.78, v: 0 },
    { x: 6.5, z: -0.6, side: 1, yaw: -0.14, sx: 0.88, sy: 0.82, v: 1 },
    { x: -7.1, z: -7.5, side: -1, yaw: -0.18, sx: 1.0, sy: 0.92, v: 2 },
    { x: 7.3, z: -8.6, side: 1, yaw: 0.2, sx: 0.98, sy: 0.90, v: 0 },
    { x: -7.8, z: -18.5, side: -1, yaw: 0.1, sx: 1.15, sy: 1.04, v: 1 },
    { x: 8.0, z: -19.8, side: 1, yaw: -0.14, sx: 1.12, sy: 1.02, v: 2 },
    { x: -8.6, z: -31.5, side: -1, yaw: 0.05, sx: 1.28, sy: 1.14, v: 0 },
    { x: 8.8, z: -33.0, side: 1, yaw: -0.06, sx: 1.25, sy: 1.12, v: 1 },
  ];
  for (const tp of treePlacements) {
    const a = archetypes[tp.v];
    const g = new THREE.Group();
    g.add(new THREE.Mesh(a.barkGeo, barkMat), new THREE.Mesh(a.canopyGeo, canopyMat));
    g.position.set(tp.x, -0.12, tp.z);
    g.rotation.y = (tp.side === -1 ? 0 : Math.PI) + tp.yaw;
    g.scale.set(tp.sx, tp.sy, tp.sx);
    scene.add(g);
  }

  // Overarching Mangrove Root & Canopy Tunnels scaled to frame upper canopy arch
  const arch0 = makeMangroveArchGeometry(53.1);
  const arch1 = makeMangroveArchGeometry(82.4);
  const archPlacements = [
    { x: -5.8, z: -9.5, side: -1, s: 0.68, a: arch0 },
    { x: 6.1, z: -18.5, side: 1, s: 0.78, a: arch1 },
    { x: -6.5, z: -28.0, side: -1, s: 0.92, a: arch0 },
  ];
  for (const ap of archPlacements) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(ap.a.barkGeo, barkMat), new THREE.Mesh(ap.a.canopyGeo, canopyMat));
    g.position.set(ap.x, -0.2, ap.z);
    g.rotation.y = ap.side === -1 ? 0 : Math.PI;
    g.scale.setScalar(ap.s);
    scene.add(g);
  }

  // Riverbank Ferns, Water Lilies, Snag Roots, & Glowing Cyan Bio-Flora
  const vegMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const bioMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    emissive: new THREE.Color("#43E6C1"),
    emissiveIntensity: 1.15,
    roughness: 0.42,
    side: THREE.DoubleSide,
  });
  const fernGeo = makeFernBushGeometry(3.3);
  const lilyGeo = makeWaterLilyGeometry(7.1);
  const snagGeo = makeRootSnagGeometry(15.7);
  const bioGeo = makeBioPlantGeometry(11.9);

  const fernSpots = [
    [-5.8, -0.6, 1.0],
    [5.6, -1.8, 1.05],
    [-5.4, -7.2, 1.15],
    [5.7, -9.4, 0.95],
    [-6.1, -15.5, 1.2],
    [6.0, -17.2, 1.1],
  ];
  for (let i = 0; i < fernSpots.length; i++) {
    const [fx, fz, fs] = fernSpots[i];
    const m = new THREE.Mesh(fernGeo, vegMat);
    m.position.set(fx, -0.04, fz);
    m.rotation.y = i * 1.4;
    m.scale.setScalar(fs);
    scene.add(m);
  }

  const lilySpots = [
    [-3.6, 1.2, 1.05],
    [3.8, -0.4, 0.95],
    [-3.9, -4.6, 1.12],
    [4.1, -6.8, 1.0],
    [-3.4, -12.8, 0.9],
  ];
  for (let i = 0; i < lilySpots.length; i++) {
    const [lx, lz, ls] = lilySpots[i];
    const m = new THREE.Mesh(lilyGeo, vegMat);
    m.position.set(lx, 0.05, lz);
    m.rotation.y = i * 2.1;
    m.scale.setScalar(ls);
    scene.add(m);
  }

  for (const [sx, sz, rot] of [
    [-4.1, 1.4, 0.35],
    [4.2, 0.9, -0.55],
    [-4.9, -5.2, 0.6],
    [5.0, -7.1, -0.4],
  ]) {
    const sn = new THREE.Mesh(snagGeo, barkMat);
    sn.position.set(sx, -0.15, sz);
    sn.rotation.y = rot;
    sn.scale.setScalar(0.88);
    scene.add(sn);
  }

  const bioSpots = [
    { x: -4.6, z: -1.8, s: 1.05 },
    { x: 4.5, z: -2.9, s: 1.0 },
    { x: -4.9, z: -11.5, s: 1.15 },
    { x: 4.8, z: -14.0, s: 1.1 },
  ];
  const bioLights: THREE.PointLight[] = [];
  bioSpots.forEach((bs, i) => {
    const bm = new THREE.Mesh(bioGeo, bioMat);
    bm.position.set(bs.x, 0.02, bs.z);
    bm.rotation.y = i * 1.3;
    bm.scale.setScalar(bs.s);
    scene.add(bm);

    if (i < 2) {
      const pl = new THREE.PointLight(0x43e6c1, 8.5, 11, 2);
      pl.position.set(bs.x, 0.65, bs.z);
      scene.add(pl);
      bioLights.push(pl);
    }
  });

  // Soft Volumetric Moonlight Shafts filtering through canopy gap
  const rayMat = new THREE.MeshBasicMaterial({
    color: 0xaad8e2,
    transparent: true,
    opacity: 0.055,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const [rx, rz, tilt] of [
    [-1.2, -13.0, 0.14],
    [1.6, -21.0, 0.11],
  ]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(4.4, 24, 16, 1, true), rayMat);
    cone.position.set(rx, 10.5, rz);
    cone.rotation.z = tilt;
    scene.add(cone);
  }

  // Hero Boat gliding slowly down the misty canal ahead (warm amber vs cool forest contrast)
  const boat = buildPreviewBoat(woodTex, deckTex, clothTex, glowTex, 40);
  boat.group.position.set(-0.4, -0.08, -8.4);
  boat.group.scale.setScalar(0.84);
  boat.group.rotation.y = 0.58;
  scene.add(boat.group);

  // Soft low mist drifts hovering over dark canal water
  const mistMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: new THREE.Color(0x286668),
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
  });
  for (const [mx, my, mz, mw, mh] of [
    [-2.5, 0.55, -13, 14, 3.2],
    [2.8, 0.65, -19, 16, 3.6],
    [0, 0.85, -27, 22, 4.4],
  ]) {
    const sp = new THREE.Sprite(mistMat);
    sp.position.set(mx, my, mz);
    sp.scale.set(mw, mh, 1);
    scene.add(sp);
  }

  // Drifting Yellow-Green Fireflies (#C9E88B)
  const fCount = 56;
  const fBase = new Float32Array(fCount * 3);
  const fPos = new Float32Array(fCount * 3);
  const fSeed = new Float32Array(fCount * 3);
  for (let i = 0; i < fCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    fBase[i * 3] = side * (1.8 + ((i * 37) % 100) * 0.048);
    fBase[i * 3 + 1] = 0.65 + ((i * 53) % 100) * 0.042;
    fBase[i * 3 + 2] = 3.2 - ((i * 29) % 100) * 0.26;
    fPos[i * 3] = fBase[i * 3];
    fPos[i * 3 + 1] = fBase[i * 3 + 1];
    fPos[i * 3 + 2] = fBase[i * 3 + 2];
    fSeed[i * 3] = i * 1.9;
    fSeed[i * 3 + 1] = 0.65 + (i % 5) * 0.16;
    fSeed[i * 3 + 2] = 0.7 + (i % 4) * 0.25;
  }
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute("position", new THREE.BufferAttribute(fPos, 3));
  fGeo.setAttribute("aSeed", new THREE.BufferAttribute(fSeed, 3));
  const fMat = new THREE.ShaderMaterial({
    uniforms: { uTime: sharedUniforms.uTime },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aSeed;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (1.8 + aSeed.y) + aSeed.x), 2.0);
        vAlpha = tw;
        gl_PointSize = clamp((34.0 * aSeed.z) / max(-mv.z, 1.0), 3.0, 14.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float glow = exp(-d * d * 4.5);
        gl_FragColor = vec4(vec3(0.84, 0.96, 0.58) * glow * 1.4, glow * vAlpha);
      }
    `,
  });
  scene.add(new THREE.Points(fGeo, fMat));

  // Water glow reflections: boat lantern + 2 foreground cyan plants
  glowCol[0].setRGB(1.0, 0.56, 0.20);
  glowCol[1].setRGB(0.26, 0.90, 0.76);
  glowCol[2].setRGB(0.26, 0.90, 0.76);
  glowPos[1].set(bioSpots[0].x, 0.5, bioSpots[0].z, 1.35);
  glowPos[2].set(bioSpots[1].x, 0.5, bioSpots[1].z, 1.35);

  return {
    scene,
    camera,
    update: (t: number, locked: boolean) => {
      sharedUniforms.uTime.value = t;

      // Smooth floating canoe POV down the arched river
      camera.position.set(
        0.35 + Math.sin(t * 0.32) * 0.28,
        1.85 + Math.sin(t * 0.55) * 0.07,
        7.8 + Math.cos(t * 0.25) * 0.2,
      );
      camera.lookAt(0, 1.7, -18);

      // Gentle river buoyancy for canal lantern boat
      const bx = boat.group.position.x;
      const bz = boat.group.position.z;
      const h = waveH(bx, bz, t) * 0.20;
      boat.group.position.y = h - 0.09;
      boat.group.rotation.z = Math.sin(t * 1.2) * 0.035;

      const dim = locked ? 0.76 : 1.0;
      const flicker = 1 + 0.08 * Math.sin(t * 10.5) + 0.04 * Math.sin(t * 21.4);
      boat.lanternLight.intensity = 38 * flicker * dim;
      boat.lanternHalo.scale.setScalar(3.2 * flicker);
      boat.lanternPivot.rotation.z = Math.sin(t * 1.8) * 0.06;

      updateLanternGlowUniform(boat, glowPos[0], 2.2 * flicker * dim);

      // Bioluminescence pulse
      const pulse = 0.8 + 0.25 * Math.sin(t * 1.9);
      bioMat.emissiveIntensity = (locked ? 0.88 : 1.25) * pulse;
      for (let i = 0; i < bioLights.length; i++) {
        bioLights[i].intensity = (locked ? 6.2 : 9.0) * pulse;
      }

      // Update drifting firefly coordinates
      const posAttr = fGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < fCount; i++) {
        const s = fSeed[i * 3];
        posAttr.setXYZ(
          i,
          fBase[i * 3] + Math.sin(t * 0.65 + s) * 0.55,
          fBase[i * 3 + 1] + Math.cos(t * 0.85 + s * 1.3) * 0.32,
          fBase[i * 3 + 2] + Math.sin(t * 0.5 + s * 0.7) * 0.45,
        );
      }
      posAttr.needsUpdate = true;
    },
  };
}

/* ---------------- singleton offscreen WebGL manager ---------------- */

interface TargetEntry {
  canvas: HTMLCanvasElement;
  mode: EnvironmentMode;
  locked: boolean;
}

class PreviewManager {
  private renderer: THREE.WebGLRenderer | null = null;
  private seaRig: PreviewSceneRig | null = null;
  private mangroveRig: PreviewSceneRig | null = null;
  private targets = new Map<HTMLCanvasElement, TargetEntry>();
  private raf = 0;
  private lastDraw = 0;
  private t0 = performance.now();
  private failed = false;

  private ensureInit(): boolean {
    if (this.failed) return false;
    if (this.renderer) return true;

    try {
      const offscreen = document.createElement("canvas");
      const renderer = new THREE.WebGLRenderer({
        canvas: offscreen,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer = renderer;

      const woodTex = makeDetailedWoodTexture();
      const deckTex = makeDeckTexture();
      const clothTex = makeDetailedClothTexture();
      const barkTex = makeMangroveBarkTexture();
      const glowTex = makeGlowSpriteTex();
      const foamTex = makeFoamRingTex();

      this.seaRig = buildSeaPreviewScene(woodTex, deckTex, clothTex, glowTex, foamTex);
      this.mangroveRig = buildMangrovePreviewScene(woodTex, deckTex, clothTex, barkTex, glowTex);
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  register(canvas: HTMLCanvasElement, mode: EnvironmentMode, locked: boolean) {
    this.targets.set(canvas, { canvas, mode, locked });
    if (!this.raf && this.ensureInit()) {
      this.lastDraw = 0;
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  unregister(canvas: HTMLCanvasElement) {
    this.targets.delete(canvas);
    if (this.targets.size === 0 && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private loop = (now: number) => {
    this.raf = 0;
    if (this.targets.size === 0 || !this.renderer) return;

    // Schedule next frame first
    this.raf = requestAnimationFrame(this.loop);

    // Pause rendering when tab is backgrounded, cap to ~32 FPS for thermal/battery efficiency
    if (document.hidden) return;
    if (now - this.lastDraw < 30) return;
    this.lastDraw = now;

    const t = (now - this.t0) * 0.001;
    const renderer = this.renderer;

    for (const entry of this.targets.values()) {
      const { canvas, mode, locked } = entry;
      const w = canvas.width;
      const h = canvas.height;
      if (w < 4 || h < 4) continue;

      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      const rig = mode === "sea" ? this.seaRig : this.mangroveRig;
      if (!rig) continue;

      if (renderer.domElement.width !== w || renderer.domElement.height !== h) {
        renderer.setSize(w, h, false);
      }
      const aspect = w / h;
      if (Math.abs(rig.camera.aspect - aspect) > 0.01) {
        rig.camera.aspect = aspect;
        rig.camera.updateProjectionMatrix();
      }

      rig.update(t, locked);
      renderer.render(rig.scene, rig.camera);
      ctx.drawImage(renderer.domElement, 0, 0, w, h);
    }
  };
}

export const previewManager = new PreviewManager();
