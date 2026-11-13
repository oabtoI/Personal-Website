// The landing + garden scene: Arianna's prism flower and its butterfly (from flowers/prism-flower.html),
// turned into reusable builders so the garden can grow three variations of the same flower.
// Two "rooms" share one scene: home (x = 0) and the garden to the left. The camera pans between them,
// and the butterfly leads the way.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const V3 = THREE.Vector3, D2R = Math.PI / 180;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let seedState = 7;
const rnd = () => (seedState = (seedState * 16807) % 2147483647) / 2147483647;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
// ambient wind, the twin of the garden's wind field: a steady breeze with flutter, and slow gusts rolling through
const WIND_DIR = { x: .86 / Math.hypot(.86, .5), z: -.5 / Math.hypot(.86, .5) };
function ambientWind(x, z, t, out) {
  if (reduce) { out.x = out.z = 0; return out; }
  const dx = WIND_DIR.x, dz = WIND_DIR.z;
  const sg = .5 + .5 * Math.sin((x * dx + z * dz) * .45 - t * 1.15 + Math.sin(z * .23 + t * .21) * 1.6);
  const gust = Math.pow(sg, 6) * (.65 + .35 * Math.sin(t * .13));
  const fl = Math.sin(t * 2.1 + x * 1.3 + z * .7) * .5 + Math.sin(t * 3.3 + x * 2.1 - z * 1.7) * .25;
  const mag = .32 * (1 + .35 * fl) + gust * 1.1;
  out.x = dx * mag - dz * fl * .12; out.z = dz * mag + dx * fl * .12;
  return out;
}
const aw = { x: 0, z: 0 };
// sway about a point far down the stem (below the screen), the way a stem bends from the ground, not from the bloom
function swayAbout(obj, base, D, rz) {
  obj.rotation.z = rz;
  obj.position.x = base.x - D * Math.sin(rz); obj.position.y = base.y - D + D * Math.cos(rz);
}

const stage = document.getElementById('stage');
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
catch (e) { document.body.classList.add('no-gl'); throw e; }
// phones: touch screens with a small side. They get fewer pixels and no automatic garden preload (see below)
const PHONE = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 700;
renderer.setPixelRatio(Math.min(devicePixelRatio, PHONE ? 1.25 : 1.5));   // soft glowing glass doesn't need retina pixels; this is the biggest saving
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 1);
renderer.domElement.id = 'gl';
renderer.domElement.setAttribute('role', 'img');
renderer.domElement.setAttribute('aria-label', 'A holographic glass flower drawn as a wireframe, with a glass butterfly flying around it');
stage.insertBefore(renderer.domElement, stage.querySelector('.frame'));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 200);

/* ---------- holographic glass shader (prism flower), plus hue shift and hover boost ---------- */
const VERT = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  void main(){
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const FRAG = /* glsl */`
  uniform float uTime, uSeed, uGridU, uGridV, uLine, uIri, uRim, uBase, uAlpha, uCore, uEdge, uStreakU, uStreakV, uHue, uBoost, uSpread;
  uniform vec3 uTint, uAccent;
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
  float fbm(vec2 p){ float a = .5, s = 0.; for(int i = 0; i < 4; i++){ s += a*noise(p); p = p*2.03 + 1.7; a *= .5; } return s; }
  vec3 spectrum(float h){
    h = fract(h) * 6.;
    vec3 c[7];
    c[0] = vec3(.10, .95, 1.0); c[1] = vec3(.18, .45, 1.0); c[2] = vec3(.62, .30, 1.0);
    c[3] = vec3(1.0, .35, .62); c[4] = vec3(1.0, .62, .25); c[5] = vec3(.25, 1.0, .78); c[6] = c[0];
    int i = int(floor(h)); float f = smoothstep(0., 1., fract(h));
    vec3 a = c[0], b = c[1];
    for (int k = 0; k < 6; k++) if (k == i) { a = c[k]; b = c[k + 1]; }
    return mix(a, b, f);
  }
  void main(){
    vec3 N = normalize(vN); if(!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vW);
    float ndv = abs(dot(N, V));
    float fres = pow(1. - ndv, 2.6);
    vec2 sp = vec2(vUv.x*uStreakU + uSeed + uTime*.035, vUv.y*uStreakV - uTime*.16);
    float s = fbm(sp);
    float s2 = fbm(sp*1.7 + 9.1);
    float band = smoothstep(.46, .70, s) * (.3 + .7*smoothstep(.15, .85, 1. - ndv*.6));
    band *= smoothstep(.06, .32, vUv.y);
    float wave = dot(vW, vec3(.45, .85, .28)) * 1.6 - uTime * .9;
    float sweep = .5 + .5 * sin(wave);
    float glint = pow(.5 + .5 * sin(wave * .5 + 1.3), 6.);
    band *= .45 + .9 * sweep + glint * .8;
    float h = -.08 + uHue + ((s2 - .47)*1.35 + pow(1. - ndv, 1.4)*.7 + (s - .55)*1.1 + sweep*.35) * uSpread + uTime*.025*uSpread;
    vec3 iri = spectrum(h);
    iri = mix(iri, uAccent, .16*(1. - smoothstep(.3, .8, 1. - ndv)));
    vec2 g = vec2(vUv.x*uGridU, vUv.y*uGridV);
    vec2 gd = abs(fract(g - .5) - .5) / max(fwidth(g), 1e-4);
    float line = 1. - min(min(gd.x, gd.y), 1.);
    float edge = smoothstep(1. - uEdge, 1., abs(vUv.x*2. - 1.)) + smoothstep(1. - uEdge*.6, 1., vUv.y)*step(vUv.y, 1.001)*.6;   // (a stem's tail has v past 1: no tip edge there)
    float core = 1. - smoothstep(0., .38, vUv.y);
    vec3 col = uTint*uBase;
    col += iri*iri*band*uIri*(.9 + .8*s2)*(1. + uBoost);
    col += vec3(1.)*pow(band, 3.)*uIri*.18;
    col += vec3(.80, .85, 1.)*line*uLine*(.55 + fres*1.4)*(1. + uBoost*.8);
    col += vec3(.82, .88, 1.)*fres*uRim;
    col += vec3(.92, .95, 1.)*edge*.3;
    col += vec3(.85, .9, 1.)*core*uCore;
    float a = clamp(uAlpha + band*.2 + fres*.2, 0., .9);
    gl_FragColor = vec4(col, a);
  }`;

const mats = [];
const uTime = { value: 0 };
function glass(o = {}, bag) {
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      uTime, uSeed: { value: o.seed ?? rnd() * 50 },
      uGridU: { value: o.gridU ?? 26 }, uGridV: { value: o.gridV ?? 40 },
      uLine: { value: o.line ?? .11 }, uIri: { value: o.iri ?? .55 }, uRim: { value: o.rim ?? .22 },
      uBase: { value: o.base ?? 1 }, uAlpha: { value: o.alpha ?? .3 }, uCore: { value: o.core ?? .09 },
      uEdge: { value: o.edge ?? .07 }, uStreakU: { value: o.streakU ?? 3.2 }, uStreakV: { value: o.streakV ?? 1.3 },
      uTint: { value: new THREE.Color(o.tint ?? (bag && bag.tint) ?? 0x0a1430) },
      uAccent: bag && bag.accent ? bag.accent : { value: new THREE.Color(.15, .9, 1.) },
      uSpread: { value: bag && bag.spread != null ? bag.spread : 1 },
      uHue: bag ? bag.hue : { value: 0 }, uBoost: bag ? bag.boost : { value: 0 },
    },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  mats.push(m);
  return m;
}

/* ---------- geometry builders (from prism-flower.html) ---------- */
function sweep(spine, nref, NU, shape, twist = () => 0) {
  const NV = spine.length - 1, pos = [], uv = [], idx = [];
  const T = new V3(), L = new V3(), N = new V3(), p = new V3();
  for (let j = 0; j <= NV; j++) {
    const v = j / NV;
    T.subVectors(spine[Math.min(NV, j + 1)], spine[Math.max(0, j - 1)]).normalize();
    L.crossVectors(nref[j], T).normalize();
    N.crossVectors(T, L).normalize();
    const tw = twist(v);
    if (tw) { L.applyAxisAngle(T, tw); N.applyAxisAngle(T, tw); }
    for (let i = 0; i <= NU; i++) {
      const s = i / NU * 2 - 1, q = shape(s, v);
      p.copy(spine[j]).addScaledVector(L, q.x).addScaledVector(N, q.z);
      pos.push(p.x, p.y, p.z); uv.push(i / NU, v);
    }
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = j * (NU + 1) + i, b = a + NU + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function petal(P, bag) {
  const NV = 80, NU = 52, ds = P.len / NV, spine = [], nref = [];
  let y = 0, z = P.z0 ?? .05;
  for (let j = 0; j <= NV; j++) {
    const v = j / NV;
    const a = (P.a0 + (P.a1 - P.a0) * Math.pow(v, P.ap ?? .8) + (P.a2 ?? 0) * smooth(.75, 1, v)) * D2R;
    spine.push(new V3(0, y, z)); nref.push(new V3(0, -Math.sin(a), Math.cos(a)));
    y += Math.cos(a) * ds; z += Math.sin(a) * ds;
  }
  const k = Math.log(.5) / Math.log(P.peak ?? .62), ph = P.seed;
  const width = v => {
    const body = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(v, k))), P.blunt ?? .6);
    const scal = 1 + .05 * Math.sin(v * 23 + ph) + .03 * Math.sin(v * 41 + ph * 2);
    return P.wid * (.06 * (1 - v) + .94 * body) * scal;
  };
  const shape = (s, v) => {
    const hw = width(v), as = s + (P.asym ?? 0) * v;
    const x = s * hw + (P.shift ?? 0) * v * v * hw;
    const m = Math.abs(as), tipw = smooth(.72, 1, v);
    const phase = v * P.rf + s * P.rf * .45 + ph;
    const ruf = (Math.sin(phase) + .55 * Math.sin(2.3 * phase + 1.3) + .3 * Math.sin(4.1 * phase + ph)) *
      (Math.pow(m, 2.2) * smooth(.18, .85, v) + tipw * .55);
    const zc = P.cup * m * m * hw - (P.groove ?? .04) * Math.exp(-s * s * 28) * smooth(0, .5, v) * (1 - v);
    return { x, z: zc + P.ruffle * ruf };
  };
  const geo = sweep(spine, nref, NU, shape, v => (P.twist ?? 0) * v * v);
  const mesh = new THREE.Mesh(geo, glass({ seed: P.seed * 3.1, gridU: 30, gridV: 44, streakU: P.streakU ?? 3.4 }, bag));
  const pivot = new THREE.Group();
  pivot.rotation.z = (P.phi - 90) * D2R;
  pivot.add(mesh);
  pivot.userData.base = pivot.rotation.z;
  return pivot;
}
function tube(curve, radius, NV = 120, NR = 22) {
  const frames = curve.computeFrenetFrames(NV, false), pos = [], uv = [], idx = [], p = new V3();
  for (let j = 0; j <= NV; j++) {
    const v = j / NV, c = curve.getPointAt(v), r = radius(v), Nn = frames.normals[j], B = frames.binormals[j];
    for (let i = 0; i <= NR; i++) {
      const t = i / NR * Math.PI * 2;
      p.copy(c).addScaledVector(Nn, Math.cos(t) * r).addScaledVector(B, Math.sin(t) * r);
      pos.push(p.x, p.y, p.z); uv.push(i / NR, v);
    }
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NR; i++) {
    const a = j * (NR + 1) + i, b = a + NR + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function leaf(points, L, bag) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const NV = 110, spine = curve.getSpacedPoints(NV), nref = [];
  for (let j = 0; j <= NV; j++) nref.push(L.ref.clone().normalize());
  const k = Math.log(.5) / Math.log(L.peak);
  const width = v => L.wid * (.12 * (1 - v) * (1 - v) + Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(v, k))), L.sharp));
  const shape = (s, v) => {
    const hw = width(v), m = Math.abs(s);
    let z = L.fold * m * hw + L.roll * Math.pow(Math.max(0, s), 3) * hw * smooth(.2, .9, v);
    z += .012 * Math.sin(v * 30 + s * 4) * m;
    return { x: s * hw, z };
  };
  return new THREE.Mesh(sweep(spine, nref, 28, shape, L.twist),
    glass({ seed: L.seed, gridU: 18, gridV: 70, streakU: 2.2, streakV: 2.4, iri: .9, core: 0, edge: .08 }, bag));
}

/* ---------- the plant ---------- */
const TEPALS = [
  { phi: 150, len: 2.7,  wid: .9,  a0: 30, a1: -6,  a2: -16, cup: .18, ruffle: .1,  rf: 15, twist: -.4,  seed: 1.3, peak: .58, shift: .3, z0: -.08 },
  { phi: 4,   len: 2.35, wid: .74, a0: 26, a1: -6,  a2: -24, cup: .2,  ruffle: .095, rf: 14, twist: .5,   seed: 4.2, peak: .6, shift: -.25, z0: -.08 },
  { phi: 266, len: 1.6,  wid: .7,  a0: 34, a1: -16, a2: -14, cup: .16, ruffle: .07,  rf: 13, twist: .2,   seed: 7.7, peak: .6, z0: -.04 },
  { phi: 100, len: 2.0,  wid: .8,  a0: 36, a1: 0,   a2: -24, cup: .22, ruffle: .095, rf: 16, twist: .12,  seed: 2.6, peak: .64 },
  { phi: 220, len: 2.2,  wid: .76, a0: 26, a1: -8,  a2: -18, cup: .18, ruffle: .09,  rf: 15, twist: .35,  seed: 5.9, peak: .6, shift: .15, z0: -.04 },
  { phi: 314, len: 2.3,  wid: .74, a0: 24, a1: -12, a2: -14, cup: .18, ruffle: .09,  rf: 14, twist: -.4,  seed: 9.1, peak: .6, shift: -.2, z0: -.04 },
  { phi: 50,  len: 1.45, wid: .58, a0: 44, a1: 8,   a2: -28, cup: .26, ruffle: .07,  rf: 14, twist: -.2,  seed: 3.3, peak: .62, z0: .08 },
];
const antherGeo = new THREE.SphereGeometry(1, 16, 12);
const PALETTE = { hue: .33, spread: .42, tint: 0x1c0a22, accent: new THREE.Color(1.0, .42, .78), stamen: 0xa070b8, anther: 0xf2cf9a };
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,246,240,1)'); g.addColorStop(.25, 'rgba(255,200,228,.45)');
  g.addColorStop(.6, 'rgba(200,140,255,.08)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

// o: { hue, lenK, widK, turn, tilt, seed, phiShift } — variations for the garden
function buildPlant(o = {}) {
  const bag = { hue: { value: o.hue ?? PALETTE.hue }, boost: { value: 0 }, tint: PALETTE.tint, accent: { value: PALETTE.accent }, spread: PALETTE.spread };
  seedState = o.seed ?? 7;
  const plant = new THREE.Group(), flower = new THREE.Group();
  plant.add(flower);
  flower.position.set(.05, .62, 0);
  const rx = -.88 + (o.tilt ?? 0);
  flower.rotation.set(rx, -.28 + (o.turn ?? 0), .06, 'YXZ');
  const tepals = TEPALS.map((P, i) => {
    const t = petal({ ...P, len: P.len * (o.lenK ?? 1) * (1 + (o.jitter ?? 0) * (rnd() - .5)), wid: P.wid * (o.widK ?? 1),
      phi: P.phi + (o.phiShift ?? 0), seed: P.seed + (o.seedShift ?? 0) }, bag);
    flower.add(t); return t;
  });
  const stamenMat = glass({ tint: PALETTE.stamen, base: .45, iri: .15, line: .12, rim: .9, alpha: .55, core: 0, gridU: 6, gridV: 18, edge: 0 }, bag);
  const antherMat = glass({ tint: PALETTE.anther, base: .6, iri: .2, line: .1, rim: 1, alpha: .8, core: 0, gridU: 8, gridV: 8, edge: 0 }, bag);
  seedState = (o.seed ?? 7) + 4;
  for (let i = 0; i < 30; i++) {
    const psi = (90 + (rnd() - .5) * 250) * D2R;
    const elev = (24 + rnd() * 34) * D2R, len = .6 + rnd() * .55;
    const dir = new V3(Math.cos(psi) * Math.cos(elev), Math.sin(psi) * Math.cos(elev), Math.sin(elev));
    const out = new V3(Math.cos(psi), Math.sin(psi), 0);
    const a = new V3(0, 0, .12).addScaledVector(out, .04);
    const b = a.clone().addScaledVector(dir, len * .55).addScaledVector(new V3(0, 0, 1), .06);
    const c = a.clone().addScaledVector(dir, len).addScaledVector(out, .12 + rnd() * .1);
    const curve = new THREE.QuadraticBezierCurve3(a, b, c);
    flower.add(new THREE.Mesh(tube(curve, v => .016 * (1 - .45 * v), 24, 8), stamenMat));
    const an = new THREE.Mesh(antherGeo, antherMat);
    an.position.copy(c); an.scale.set(.022, .022, .045);
    an.lookAt(c.clone().add(curve.getTangentAt(1)));
    flower.add(an);
  }
  {
    const curve = new THREE.QuadraticBezierCurve3(new V3(0, 0, .05), new V3(.02, .12, .55), new V3(.08, .3, .95));
    flower.add(new THREE.Mesh(tube(curve, v => .022 * (1 - .3 * v), 30, 10), stamenMat));
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(antherGeo, antherMat), t = i / 3 * Math.PI * 2;
      s.position.set(.08 + Math.cos(t) * .03, .3 + Math.sin(t) * .03, .96); s.scale.setScalar(.03);
      flower.add(s);
    }
  }
  for (let i = 0; i < 40; i++) {
    const psi = rnd() * Math.PI * 2, r = .05 + rnd() * .1;
    const a = new V3(Math.cos(psi) * r * .4, Math.sin(psi) * r * .4, .02);
    const c = new V3(Math.cos(psi) * r * 1.6, Math.sin(psi) * r * 1.6, .18 + rnd() * .15);
    flower.add(new THREE.Mesh(tube(new THREE.LineCurve3(a, c), () => .009, 6, 6), stamenMat));
  }
  const ovary = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), glass({ gridU: 24, gridV: 16, iri: .5, core: 0, edge: 0, alpha: .3 }, bag));
  ovary.scale.set(.2, .2, .34); ovary.position.set(0, 0, -.2);
  flower.add(ovary);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .35 }));
  glow.scale.setScalar(1.1); glow.position.set(0, .05, .25);
  flower.add(glow);

  flower.updateMatrixWorld(true);
  const stemTop = new V3(0, 0, -.5).applyMatrix4(flower.matrixWorld);
  const stemCurve = new THREE.CatmullRomCurve3([
    stemTop, new V3(0, 0, -.95).applyMatrix4(flower.matrixWorld).add(new V3(0, -.35, 0)), new V3(-.3, -1.2, 0), new V3(-.36, -2.2, .02), new V3(-.24, -3.2, 0), new V3(-.08, -4.1, 0),
  ], false, 'centripetal');
  const stemMesh = new THREE.Mesh(tube(stemCurve, v => .07 + .012 * v - .02 * (1 - smooth(0, .05, v)), 160, 24),
    glass({ gridU: 14, gridV: 120, iri: .35, core: 0, edge: 0, alpha: .26, streakU: 1, streakV: 4 }, bag));
  plant.add(stemMesh); plant.userData.stem = { mesh: stemMesh, curve: stemCurve };
  plant.add(leaf([
    new V3(-.32, -2.55, .02), new V3(-.55, -2.25, .14), new V3(-1.0, -1.85, .26), new V3(-1.5, -1.45, .26),
    new V3(-1.88, -1.12, .1), new V3(-2.02, -.98, -.06), new V3(-1.94, -.9, -.14),
  ], { ref: new V3(.25, .1, 1), wid: .3, peak: .38, sharp: 1.15, fold: .32, roll: .45, seed: 12.5 + (o.seedShift ?? 0),
    twist: v => -.5 * v - 1.2 * smooth(.75, 1, v) }, bag));
  plant.add(leaf([
    new V3(-.3, -2.05, -.02), new V3(-.05, -1.8, .12), new V3(.45, -1.5, .22), new V3(1.05, -1.22, .2),
    new V3(1.6, -1.04, .08), new V3(2.02, -.94, -.04), new V3(2.18, -.84, -.12),
  ], { ref: new V3(-.15, .35, 1), wid: .24, peak: .33, sharp: 1.4, fold: .28, roll: .35, seed: 17.9 + (o.seedShift ?? 0),
    twist: v => .7 * v + .9 * smooth(.8, 1, v) }, bag));
  plant.add(leaf([
    new V3(-.2, -3.0, .03), new V3(-.3, -2.75, .1), new V3(-.48, -2.45, .14), new V3(-.62, -2.25, .1),
  ], { ref: new V3(0, 0, 1), wid: .12, peak: .4, sharp: 1, fold: .5, roll: .2, seed: 22, twist: v => .4 * v }, bag));

  tepals.forEach(q => { q.userData.a = 0; q.userData.v = 0; });
  return { plant, flower, tepals, glow, bag, rx, ry: -.28 + (o.turn ?? 0), glowAmt: 0, flash: 0, ph: (o.seed ?? 7) * .37,
    lean: { x: 0, y: 0, vx: 0, vy: 0 } };
}

/* ---------- rooms ---------- */
const GARDEN_X = -18, FOOT = -3.7;   // stems end at the same ground line in both rooms
const home = buildPlant();
home.plant.position.y = .4;
scene.add(home.plant);

const garden = [];   // the garden room shows flowers/garden3d.html in an iframe; this scene only flies the butterfly there
const boxOf = list => { const b = new THREE.Box3(); list.forEach(p => b.expandByObject(p.plant)); return b; };
// on tall, narrow screens the three flowers stand closer together so they stay big
const gardenBox = new THREE.Box3();
function layoutGarden() {      // the space the butterfly roams in the garden room (over where the flowers appear)
  const k = innerWidth / innerHeight < .85 ? .5 : 1;
  gardenBox.set(new V3(GARDEN_X - 4.6 * k, FOOT, -1), new V3(GARDEN_X + 4.6 * k, 2.6, 1));
}
layoutGarden();
const homeBox = boxOf([home]);
// the stem runs on down past the bottom of the screen instead of ending in view (added after measuring, so the layout
// still frames the flower). Its uv carries on from the stem's, so the glass streaks and grid continue without a seam.
{
  const { mesh, curve } = home.plant.userData.stem, foot = curve.getPointAt(1), dir = curve.getTangentAt(1);
  // it carries on the way it was heading and only slowly gives in to gravity, with a faint waver: no corner
  const p = foot.clone(), d = dir.clone(), pts = [p.clone()], down = new V3(0, -1, 0);
  for (let s = 0, step = .1; s < 30; s += step) {
    d.lerp(down, .008 + .02 * Math.min(1, s / 5)); d.x += Math.sin(s * .7 + 1.3) * .004; d.normalize();
    p.addScaledVector(d, step); pts.push(p.clone()); if (s > 5) step = .4;
  }
  const tail = new THREE.CatmullRomCurve3(pts);
  const g = tube(tail, () => .082, 500, 24), uv = g.attributes.uv, k = tail.getLength() / curve.getLength();
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 + uv.getY(i) * k);
  home.plant.add(new THREE.Mesh(g, mesh.material));
}
// invisible spheres around each garden bloom, for hover and click
const pickMat = new THREE.MeshBasicMaterial({ visible: false });
garden.forEach(p => {
  const s = new THREE.Mesh(new THREE.SphereGeometry(1.9, 10, 8), pickMat);
  p.flower.add(s); s.userData.plant = p; p.pick = s;
});
home.pick = new THREE.Mesh(new THREE.SphereGeometry(1.9, 10, 8), pickMat); home.flower.add(home.pick); home.pick.userData.plant = home;

/* ---------- camera framing ---------- */
const poses = { home: null, garden: null };
let roomsReady = false;
function computePoses() {
  const aspect = innerWidth / innerHeight, tanv = Math.tan(camera.fov * D2R / 2), portrait = aspect < .85;
  {
    const c = homeBox.getCenter(new V3()), s = homeBox.getSize(new V3());
    let d, target;
    if (portrait) {      // flower in the upper part, name card below it
      d = Math.max(s.y * 1.05 / (2 * tanv * .62), s.x * 1.02 / (2 * tanv * aspect));
      target = c.clone().add(new V3(0, -2 * d * tanv * .17, 0));
    } else {             // flower on the left third, name card on the right
      d = Math.max(s.y * 1.1 / (2 * tanv), s.x * 1.04 / (2 * tanv * aspect * .56));
      target = c.clone().add(new V3(2 * d * tanv * aspect * (.5 - .32), 0, 0));
    }
    poses.home = { target, pos: target.clone().add(new V3(0, .2, d)) };
  }
  {
    const c = gardenBox.getCenter(new V3()), s = gardenBox.getSize(new V3());
    const d = Math.max(s.y * 1.32 / (2 * tanv), s.x * (portrait ? 1.08 : 1.32) / (2 * tanv * aspect));
    const target = c.clone().add(new V3(0, 2 * d * tanv * .07, 0));
    poses.garden = { target, pos: target.clone().add(new V3(0, .2, d)) };
  }
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .46, .42, .45);
composer.addPass(bloom);
composer.addPass(new OutputPass());
function resize() {
  if (roomsReady) { layoutGarden(); roomBounds(); }
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); bloom.setSize(innerWidth, innerHeight);
  computePoses();
}
resize();
addEventListener('resize', resize);

/* ---------- butterfly (prism-flower.html), made room-aware ---------- */
const keyed = (k, t) => {
  const n = k.length - 1, x = Math.min(n - 1e-6, Math.max(0, t * n)), i = Math.floor(x), f = x - i;
  const p0 = k[Math.max(0, i - 1)], p1 = k[i], p2 = k[i + 1], p3 = k[Math.min(n, i + 2)];
  return .5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
};
function wingGeo(th0, th1, radii, o) {
  const NU = 48, NV = 22, pos = [], uv = [], idx = [];
  for (let j = 0; j <= NV; j++) {
    const v = j / NV;
    for (let i = 0; i <= NU; i++) {
      const u = i / NU, th = (th0 + (th1 - th0) * u) * D2R;
      let R = keyed(radii, u) * o.scale;
      if (o.scallop) R *= 1 - o.scallop * (.5 + .5 * Math.cos(u * Math.PI * 2 * o.lobes));
      if (o.tail) R += o.tail * Math.exp(-(((u - .2) / .065) ** 2));
      const r = v * R;
      pos.push(Math.cos(th) * r, o.camber * Math.sin(Math.PI * v) * R - .06 * r * r, Math.sin(th) * r);
      uv.push(u, v);
    }
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = j * (NU + 1) + i, b = a + NU + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
seedState = 99;
const bfly = new THREE.Group();
bfly.scale.setScalar(2.2);
scene.add(bfly);
const bBag = { hue: { value: PALETTE.hue + .06 }, boost: { value: 0 }, tint: PALETTE.tint, accent: { value: PALETTE.accent }, spread: PALETTE.spread };
const wingMat = glass({ iri: 1.45, gridU: 14, gridV: 7, streakU: 2.6, streakV: 2.2, alpha: .22, core: .08, edge: .13, line: .3, rim: .42 }, bBag);
const bodyMat = glass({ tint: 0x7a5a9a, base: .5, iri: .4, line: .1, rim: .8, alpha: .5, core: 0, gridU: 10, gridV: 14, edge: 0 }, bBag);
const bStamen = glass({ tint: PALETTE.stamen, base: .45, iri: .15, line: .12, rim: .9, alpha: .55, core: 0, gridU: 6, gridV: 18, edge: 0 }, bBag);
const bAnther = glass({ tint: PALETTE.anther, base: .6, iri: .2, line: .1, rim: 1, alpha: .8, core: 0, gridU: 8, gridV: 8, edge: 0 }, bBag);
const foreG = wingGeo(-22, 88, [.40, .50, .60, .70, .80, .86, .80, .55, .18], { scale: .66, camber: .03 });
const hindG = wingGeo(-122, -10, [.32, .52, .64, .70, .68, .62, .52, .40, .30], { scale: .58, camber: .025, scallop: .045, lobes: 5, tail: .12 });
function wing(geo, side, z) {
  const p = new THREE.Group();
  p.position.set(side * .022, .012, z);
  if (side < 0) p.scale.x = -1;
  p.add(new THREE.Mesh(geo, wingMat));
  bfly.add(p);
  return p;
}
const W = { rf: wing(foreG, 1, .025), rh: wing(hindG, 1, -.01), lf: wing(foreG, -1, .025), lh: wing(hindG, -1, -.01) };
function setWings(fore, hind, sw) {
  W.rf.rotation.set(0, sw, fore);      W.lf.rotation.set(0, -sw, -fore);
  W.rh.rotation.set(0, sw * .4, hind); W.lh.rotation.set(0, -sw * .4, -hind);
}
{
  const ell = new THREE.SphereGeometry(1, 20, 14);
  const part = (z, y, sx, sy, sz) => { const m = new THREE.Mesh(ell, bodyMat); m.position.set(0, y, z); m.scale.set(sx, sy, sz); bfly.add(m); return m; };
  part(.02, 0, .034, .034, .08);
  part(-.16, -.006, .022, .02, .13).rotation.x = .08;
  part(.11, .006, .027, .027, .027);
  for (const s of [-1, 1]) {
    const c = new THREE.QuadraticBezierCurve3(new V3(s * .012, .02, .13), new V3(s * .045, .085, .25), new V3(s * .095, .11, .37));
    bfly.add(new THREE.Mesh(tube(c, () => .0042, 16, 5), bStamen));
    const club = new THREE.Mesh(antherGeo, bAnther);
    club.position.copy(c.v2); club.scale.set(.011, .011, .022); club.lookAt(c.v2.clone().add(c.getTangentAt(1)));
    bfly.add(club);
  }
}

const UP = new V3(0, 1, 0), ORIGIN = new V3(), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion();
const ROOMS = {
  home: { box: homeBox, spots: home.tepals.map(p => p.children[0]) },
  garden: { box: gardenBox, spots: garden.flatMap(p => p.tepals.map(t => t.children[0])) },
};
function roomBounds() {
  for (const r of Object.values(ROOMS)) {
    const c = r.box.getCenter(new V3());
    r.center = c;
    r.bound = { min: new V3(r.box.min.x - .4, c.y - .2, -1.4), max: new V3(r.box.max.x + .4, r.box.max.y + .7, 2.0) };
  }
}
roomBounds(); roomsReady = true;
let bRoom = ROOMS.home;
const B = {
  pos: new V3(homeBox.max.x + 1.2, homeBox.max.y - .3, 1.4), vel: new V3(-.9, -.1, -.3), fwd: new V3(-1, 0, 0),
  target: new V3(), jitter: new V3(), state: 'fly', phase: 0, glideUntil: 0, nextTarget: 0, perchAt: 7, roll: 0,
  spot: null, t0: 0, until: 0, from: new V3(), fromQ: new THREE.Quaternion(), fore: 0,
  path: null,
};
function perchFrame(mesh) {
  const g = mesh.geometry, i = mesh.userData.perchIndex ?? 48 * 53 + 26;   // light-mode petals name their own perch point
  const p = new V3().fromBufferAttribute(g.attributes.position, i), n = new V3().fromBufferAttribute(g.attributes.normal, i);
  mesh.localToWorld(p); n.transformDirection(mesh.matrixWorld);
  if (n.y < 0) n.negate();
  return { p, n };
}
const randomTarget = () => { const b = bRoom.bound; return new V3(
  THREE.MathUtils.lerp(b.min.x, b.max.x, rnd()), THREE.MathUtils.lerp(b.min.y, b.max.y, rnd()), THREE.MathUtils.lerp(b.min.z, b.max.z, rnd())); };
function flapAngles(phase) {
  const p = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), d = Math.PI * 2 * .4;
  const w = p < d ? p / d * Math.PI : Math.PI + (p - d) / (Math.PI * 2 - d) * Math.PI;
  const a = .5 - .5 * Math.cos(w);
  return { w, fore: (74 - 104 * a) * D2R };
}
function orient(fwd, up, rate, dt) {
  tmpM.lookAt(fwd, ORIGIN, up); tmpQ.setFromRotationMatrix(tmpM);
  bfly.quaternion.slerp(tmpQ, 1 - Math.exp(-dt * rate));
}
// fly to another room along a scripted arc, ahead of the camera
function travel(to, t) {
  const R = ROOMS[to];
  const from = bfly.position.clone();
  const end = R.center.clone().add(new V3((to === 'garden' ? 1 : -1) * .6, R.box.getSize(new V3()).y * .18, 1.2));
  const dir = Math.sign(end.x - from.x) || -1;
  const c1 = from.clone().add(new V3(dir * 1.5, 1.4, .8)), c2 = end.clone().add(new V3(-dir * 2.5, 1.6, .6));
  B.path = new THREE.CubicBezierCurve3(from, c1, c2, end);
  B.state = 'travel'; B.t0 = t; B.dur = reduce ? .01 : 2.3; B.spot = null; B.glideUntil = 0;
  bRoom = R;
}
function moveButterfly(t, dt) {
  dt = Math.min(dt, .05);
  if (reduce && B.state !== 'perch' && B.state !== 'travel') {
    if (bRoom.spots.length) { B.spot = bRoom.spots[3]; B.state = 'perch'; B.until = Infinity; }
    else { bfly.position.copy(bRoom.center).add(new V3(2.6, 1.6, 1)); setWings(40 * D2R, 36 * D2R, 0); return; }
  }
  if (B.state === 'travel') {
    const k = Math.min(1, (t - B.t0) / B.dur), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const p = B.path.getPoint(e), tan = B.path.getTangent(Math.min(.999, e + .001));
    p.y += Math.sin(t * 9) * .05;
    B.vel.copy(p).sub(bfly.position).divideScalar(Math.max(dt, 1e-3));
    bfly.position.copy(p); B.pos.copy(p);
    B.fwd.copy(tan).normalize();
    orient(B.fwd.clone().add(new V3(0, .25, 0)).normalize(), UP, 10, dt);
    B.phase += dt * 8 * Math.PI * 2;
    const { w, fore } = flapAngles(B.phase);
    B.fore = fore; setWings(fore, flapAngles(B.phase - .45).fore * .92, .22 * Math.sin(w));
    if (k >= 1) {
      B.state = 'fly'; B.nextTarget = 0; B.perchAt = t + 4 + rnd() * 4; B.vel.copy(B.fwd).multiplyScalar(.8);
      if (reduce && bRoom.spots.length) { B.spot = bRoom.spots[3]; B.state = 'perch'; B.until = Infinity; }
    }
    return;
  }
  if (B.state === 'fly' || B.state === 'approach') {
    if (B.state === 'fly') {
      if (t > B.nextTarget) {
        B.target.copy(randomTarget()); B.nextTarget = t + .9 + rnd() * 2.2;
        if (rnd() < .3) B.glideUntil = t + .3 + rnd() * .5;
      }
      if (t > B.perchAt && bRoom.spots.length) {
        const toCam = camera.position.clone().sub(bRoom.center).normalize();
        const score = f => f.n.y + f.n.dot(toCam);
        const ranked = bRoom.spots.map(m => ({ m, f: perchFrame(m) })).sort((a, b) => score(b.f) - score(a.f));
        B.spot = ranked[Math.floor(rnd() * Math.min(3, ranked.length))].m; B.state = 'approach';
      }
    }
    let speed = 1.15;
    if (B.state === 'approach') {
      const f = perchFrame(B.spot);
      B.target.copy(f.p).addScaledVector(f.n, .45);
      const dist = B.pos.distanceTo(B.target);
      speed = Math.min(1.1, .3 + dist * 1.2);
      B.glideUntil = 0;
      if (dist < .2) { B.state = 'land'; B.t0 = t; B.from.copy(B.pos); B.fromQ.copy(bfly.quaternion); }
    }
    const gliding = t < B.glideUntil;
    const prev = B.phase;
    B.phase += dt * (gliding ? 0 : 6.5) * Math.PI * 2;
    if (Math.floor(B.phase / (Math.PI * 2)) !== Math.floor(prev / (Math.PI * 2)))
      B.jitter.set(rnd() - .5, (rnd() - .5) * .6, rnd() - .5).multiplyScalar(4.5);
    B.jitter.multiplyScalar(Math.exp(-dt * 5));
    const { w, fore } = flapAngles(B.phase);
    const acc = B.target.clone().sub(B.pos).setLength(speed).sub(B.vel).multiplyScalar(2.2).add(B.jitter);
    acc.y += gliding ? -.45 : 2.6 * Math.sin(w) - .1;
    B.vel.addScaledVector(acc, dt);
    const sp = B.vel.length();
    if (sp > 1.7) B.vel.multiplyScalar(1.7 / sp); else if (sp < .25) B.vel.multiplyScalar(.25 / sp);
    B.pos.addScaledVector(B.vel, dt);
    bfly.position.copy(B.pos);
    B.fwd.lerp(B.vel.clone().normalize(), 1 - Math.exp(-dt * 4)).normalize();
    const right = new V3().crossVectors(B.fwd, UP).normalize();
    B.roll += (THREE.MathUtils.clamp(-acc.dot(right) * .12, -.55, .55) - B.roll) * (1 - Math.exp(-dt * 6));
    const look = B.fwd.clone().add(new V3(0, .3 + .12 * Math.sin(w), 0)).normalize();
    orient(look, UP.clone().applyAxisAngle(B.fwd, B.roll), 9, dt);
    B.fore = gliding ? (14 + 3 * Math.sin(t * 22)) * D2R : fore;
    const hind = gliding ? B.fore - .05 : flapAngles(B.phase - .45).fore * .92;
    setWings(B.fore, hind, gliding ? 0 : .22 * Math.sin(w));
  } else if (B.state === 'land') {
    const k = smooth(0, 1, (t - B.t0) / .7), f = perchFrame(B.spot);
    const seat = f.p.clone().addScaledVector(f.n, .08);
    bfly.position.lerpVectors(B.from, seat, k); B.pos.copy(bfly.position);
    const fw = B.fwd.clone().addScaledVector(f.n, -B.fwd.dot(f.n)).normalize();
    tmpM.lookAt(fw, ORIGIN, f.n); tmpQ.setFromRotationMatrix(tmpM);
    bfly.quaternion.slerpQuaternions(B.fromQ, tmpQ, k);
    B.phase += dt * 6.5 * (1 - k) * Math.PI * 2;
    const fl = flapAngles(B.phase).fore;
    B.fore = fl + (80 * D2R - fl) * k;
    setWings(B.fore, B.fore - .05, 0);
    if (k >= 1) { B.state = 'perch'; B.t0 = t; B.until = t + 4 + rnd() * 4; B.fwd.copy(fw); }
  } else if (B.state === 'perch') {
    const f = perchFrame(B.spot);
    bfly.position.copy(f.p).addScaledVector(f.n, .08); B.pos.copy(bfly.position);
    const fw = B.fwd.clone().addScaledVector(f.n, -B.fwd.dot(f.n)).normalize();
    tmpM.lookAt(fw, ORIGIN, f.n); bfly.quaternion.setFromRotationMatrix(tmpM);
    const o = reduce ? .55 : .5 - .5 * Math.cos((t - B.t0) * Math.PI * 2 / 2.8);
    const flick = reduce ? 0 : Math.max(0, Math.sin((t - B.t0) * 9)) * .08 * (Math.sin((t - B.t0) * .7) > .85);
    B.fore = (80 - 66 * o) * D2R + flick;
    setWings(B.fore, B.fore - .04, 0);
    if (t > B.until) {
      B.state = 'fly'; B.vel.copy(f.n).multiplyScalar(1.1).addScaledVector(B.fwd, .5);
      B.perchAt = t + 12 + rnd() * 10; B.nextTarget = 0; B.phase = 0;
    }
  }
}
for (const g of [foreG, hindG]) g.userData.base = g.attributes.position.array.slice();
const F = { pf: null, ph: null, wf: 0, wh: 0 };
function flexWing(g, omega, t, gain) {
  const base = g.userData.base, pos = g.attributes.position.array, uv = g.attributes.uv.array;
  const bend = -omega * .003 * gain, twist = -omega * .0045 * gain;
  const amp = (.008 + Math.min(.022, Math.abs(omega) * .0007)) * gain;
  for (let i = 0, n = pos.length / 3; i < n; i++) {
    const u = uv[i * 2], v = uv[i * 2 + 1], x = base[i * 3], z = base[i * 3 + 2];
    const ripple = Math.sin(t * 26 - v * 7 + u * 5) + .5 * Math.sin(t * 41 - v * 11 - u * 3);
    pos[i * 3 + 1] = base[i * 3 + 1] + bend * v * v + twist * z * v + amp * ripple * v * v * (.4 + .6 * Math.abs(x) / (Math.abs(x) + .1));
  }
  g.attributes.position.needsUpdate = true;
  g.computeVertexNormals();
}
function updateButterfly(t, dt) {
  dt = Math.min(dt, .05);
  moveButterfly(t, dt);
  if (reduce || dt <= 0) return;
  const f = W.rf.rotation.z, h = W.rh.rotation.z;
  if (F.pf !== null) {
    F.wf += ((f - F.pf) / dt - F.wf) * Math.min(1, dt * 30);
    F.wh += ((h - F.ph) / dt - F.wh) * Math.min(1, dt * 30);
  }
  F.pf = f; F.ph = h;
  flexWing(foreG, F.wf, t, 1);
  flexWing(hindG, F.wh, t + .4, 1.2);
  if (LIGHT.on) LIGHT.art.flex(t, F.wf, F.wh);
}

/* ---------- rooms: camera pan, labels, picking ---------- */
const root = document.documentElement;
const labels = Object.fromEntries(['art', 'projects', 'me'].map(p => [p, document.querySelector(`.glabel[data-page="${p}"]`)]));
let room = 'home', pan = 0, panFrom = 0, panTo = 0, panT0 = -1, panDur = 2.4;
const camPos = new V3(), camTarget = new V3();
function goRoom(r, instant) {
  if (r !== 'home' && r !== 'garden') return;
  const to = r === 'garden' ? 1 : 0;
  if (r === room && panTo === to) return;
  room = r;
  const t = clock.getElapsedTime();
  if (instant || reduce) {
    pan = panFrom = panTo = to; panT0 = -1;
    bRoom = ROOMS[r];
    const c = bRoom.center;
    B.pos.copy(c).add(new V3(1, 1.2, 1)); bfly.position.copy(B.pos);
    B.state = 'fly'; B.nextTarget = 0; B.perchAt = t + 3;
  } else {
    panFrom = pan; panTo = to; panT0 = t + .35;   // the butterfly sets off first, the camera follows
    travel(r, t);
  }
}
addEventListener('room', e => goRoom(e.detail));

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ptrIn = { v: false };
let hovered = null;
addEventListener('pointermove', e => { ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ptrIn.v = true; });
document.addEventListener('pointerleave', () => { ptrIn.v = false; });
function pickAt() {
  if (!ptrIn.v || document.body.classList.contains('sheet-open')) return null;
  ray.setFromCamera(ndc, camera);
  const list = room === 'garden' ? garden.map(p => p.pick) : LIGHT.on ? LIGHT.picks : [home.pick];
  const h = ray.intersectObjects(list, false)[0];
  return h ? h.object.userData.plant : null;
}
renderer.domElement.addEventListener('click', () => {
  const p = pickAt();
  if (!p) return;
  if (p.page) { location.hash = p.page; return; }
  touch(p);
});
function touch(p) {
  if (p.petals) {                    // a light-mode bouquet flower
    p.flash = 1;
    p.petals.forEach(q => q.v += (Math.random() - .3) * 2.4);
    p.lean.vx += (Math.random() - .5) * 1.2; p.lean.vy += (Math.random() - .5) * 1.2;
    if (!reduce) burst(p.head.localToWorld(new V3(0, .1, .3)));
    if (B.state === 'perch' && bRoom === ROOMS.home) B.until = 0;
    return;
  }
  p.flash = 1;
  p.tepals.forEach(q => q.userData.v += (Math.random() - .3) * 2.4);
  p.lean.vx += (Math.random() - .5) * 1.2; p.lean.vy += (Math.random() - .5) * 1.2;
  if (!reduce) burst(p.flower.localToWorld(new V3(0, .05, .4)));
  if (B.state === 'perch' && bRoom === ROOMS.home) B.until = 0;     // the butterfly startles and lifts off
}

/* ---------- light mode: a spinning glass bouquet and the painted-glass butterfly ----------
   Light mode used to show the dark glass keyed against black. Now it has its own models (flowers/light/), drawn with
   real transparency on a second canvas above the main one: a hand-tied tech bouquet where the home flower stands,
   turning slowly, and the butterfly on painted glass wings. The butterfly keeps its rig, flight and perching (it lands
   on the bouquet's petals). Dark mode is untouched: everything here only switches on with the light theme. */
const LIGHT = { on: false, ready: false, loading: false };
const darkSpots = ROOMS.home.spots;
function loadLight() {
  if (LIGHT.loading) return;
  LIGHT.loading = true;
  Promise.all([import('./flowers/light/bouquet.js?v=9'), import('./flowers/light/butterfly.js?v=1'), import('./flowers/light/glass.js'), import('./flowers/light/stem.js?v=3')])
    .then(async ([Bq, Bf, G, St]) => {
      const lscene = new THREE.Scene(), built = Bq.buildBouquet();
      const holder = new THREE.Group(); holder.add(built.plant); lscene.add(holder);
      // fit the bouquet into the home flower's space; it spins about its gathered stems
      const bb = new THREE.Box3().setFromObject(built.plant), sz = bb.getSize(new V3());
      const hs = homeBox.getSize(new V3()), hc = homeBox.getCenter(new V3());
      built.plant.position.y = -bb.getCenter(new V3()).y;
      holder.scale.setScalar(Math.min(hs.y * 1.1 / sz.y, hs.x * 1.3 / Math.max(sz.x, sz.z)) * .86);   // a touch smaller, clear of the name
      holder.position.set(hc.x, hc.y, 0);
      for (const L of built.flowers) St.addTail(L);   // stems run on off the bottom of the screen (after framing)
      // picking, and petals to perch on (each petal's geometry is centred on its middle: perch on the nearest point)
      const picks = [], spots = [];
      for (const L of built.flowers) {
        L.pick.userData.plant = L; picks.push(L.pick);
        for (const P of L.petals.slice(-5)) {
          const m = P.tilt.children[0]; if (!m || !m.geometry) continue;
          const pa = m.geometry.attributes.position; let best = 0, bd = Infinity;
          for (let i = 0; i < pa.count; i++) { const d = pa.getX(i) ** 2 + pa.getY(i) ** 2 + pa.getZ(i) ** 2; if (d < bd) { bd = d; best = i; } }
          m.userData.perchIndex = best; spots.push(m);
        }
      }
      // the butterfly's light-mode wings and body hang on the same pivots as its dark ones
      const art = await Bf.buildArtButterfly();
      const oldParts = bfly.children.filter(c => c.isMesh);
      for (const k of ['rf', 'rh', 'lf', 'lh']) oldParts.push(...W[k].children);
      const newParts = [art.body];
      for (const k of ['rf', 'lf']) { const w = art.fore(); W[k].add(w); newParts.push(w); }
      for (const k of ['rh', 'lh']) { const w = art.hind(); W[k].add(w); newParts.push(w); }
      bfly.add(art.body);
      newParts.forEach(o => { o.visible = false; });
      const overlay = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      overlay.setPixelRatio(renderer.getPixelRatio()); overlay.setSize(innerWidth, innerHeight); overlay.setClearColor(0x000000, 0);
      overlay.domElement.id = 'lightGl'; overlay.domElement.setAttribute('aria-hidden', 'true'); overlay.domElement.style.display = 'none';
      stage.insertBefore(overlay.domElement, stage.querySelector('.frame'));
      addEventListener('resize', () => overlay.setSize(innerWidth, innerHeight));
      Object.assign(LIGHT, { scene: lscene, holder, flowers: built.flowers, picks, spots, art, oldParts, newParts, overlay, time: G.glassTime, ready: true });
    })
    .catch(e => console.warn('light-mode models failed to load', e));
}
function setLight(on) {
  LIGHT.on = on;
  home.plant.visible = !on; bfly.visible = true;
  LIGHT.oldParts.forEach(o => { o.visible = !on; }); LIGHT.newParts.forEach(o => { o.visible = on; });
  (on ? LIGHT.scene : scene).add(bfly);
  ROOMS.home.spots = on ? LIGHT.spots : darkSpots;
  if (B.state === 'perch' || B.state === 'land' || B.state === 'approach') { B.state = 'fly'; B.spot = null; B.nextTarget = 0; B.perchAt = clock.getElapsedTime() + 3; }
  LIGHT.overlay.domElement.style.display = on ? '' : 'none';
}
// the bouquet's flowers behave like the site's flowers: idle sway, cursor wind on petals and blooms, hover glow, click flick
const lfp = new V3();
function lightTick(t, dt) {
  const d = Math.min(dt, .05);
  LIGHT.time.value = t;
  const bw = ambientWind(0, 0, t, aw);
  if (!reduce) swayAbout(LIGHT.holder, LIGHT.base ??= LIGHT.holder.position.clone(), 9, Math.sin(t * .45) * .012 - bw.x * .045);
  LIGHT.flowers.forEach((L, i) => {
    const w = ambientWind(i * 1.7 - 2.5, i * .9, t, aw), wm = Math.hypot(w.x, w.z);   // each bloom catches the gust a beat apart
    L.glow += ((L === hovered ? 1 : 0) - L.glow) * (1 - Math.exp(-d * 6)); L.flash *= Math.exp(-d * 2.2);
    L.boost.value = L.glow * .7 + L.flash * 1.4;
    L.head.getWorldPosition(lfp).project(camera);
    const dx = (ndc.x - lfp.x) * camera.aspect, dy = ndc.y - lfp.y, near = ptrIn.v && !reduce ? Math.exp(-(dx * dx + dy * dy) / .18) : 0;
    const wx = THREE.MathUtils.clamp(pVel.x * near, -3, 3), wy = THREE.MathUtils.clamp(pVel.y * near, -3, 3), Ln = L.lean;
    Ln.vx += (14 * (wx * .05 + w.x * .1 - Ln.x) - 3.2 * Ln.vx) * d; Ln.x += Ln.vx * d;
    Ln.vy += (14 * (-wy * .04 + w.z * .08 - Ln.y) - 3.2 * Ln.vy) * d; Ln.y += Ln.vy * d;
    if (!reduce) {
      L.plant.rotation.z = Math.sin(t * .45 + L.ph) * .012 - Ln.x * .12;
      L.head.rotation.x = L.rx + Math.sin(t * .6 + L.ph) * .015 + Math.sin(t * 2.3 + L.ph) * wm * .035 + Ln.y;
      L.head.rotation.y = L.ry + Ln.x;
      for (const P of L.petals) {
        const push = wx * P.push * Math.cos(P.az) + wy * P.push * Math.sin(P.az) + wm * P.amp * 1.6 * (Math.sin(t * P.freq + P.ph) + .5 * Math.sin(t * P.freq * 2.3 + P.ph * 1.7));
        P.v += (P.k * (push - P.a) - P.c * P.v) * d; P.a += P.v * d;
        P.tilt.rotation.x = Math.sin(t * P.freq + P.ph) * P.amp * .4 + P.a * .35 + L.glow * .04;
      }
      L.head.scale.setScalar(1 + L.glow * .025 + L.flash * .04);
    }
    L.tick?.(t, d);
  });
}

/* ---------- floating glitter, as in the garden: motes drifting through a soft beam from the top right ---------- */
const dust = (() => {
  const n = 460, r = (() => { let a = 4242; return () => (a = (a * 16807) % 2147483647) / 2147483647; })();
  const c = homeBox.getCenter(new V3()), sz = homeBox.getSize(new V3());
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), seed = new Float32Array(n), size = new Float32Array(n);
  const pal = [0xfff1d8, 0xfff6ea, 0xffe0b8, 0xffd0e8, 0xe8d4ff].map(h => new THREE.Color(h));
  for (let i = 0; i < n; i++) {
    pos[i * 3] = c.x + (r() - .5) * sz.x * 4.2; pos[i * 3 + 1] = r(); pos[i * 3 + 2] = (r() - .5) * 7;
    const k = pal[Math.floor(r() * pal.length)]; col[i * 3] = k.r; col[i * 3 + 1] = k.g; col[i * 3 + 2] = k.b;
    seed[i] = r(); size[i] = 1.8 + r() * r() * 4.5;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime, uMotion: { value: reduce ? 0 : 1 }, uY0: { value: homeBox.min.y }, uH: { value: sz.y * 1.25 },
      uBeamO: { value: new V3(c.x + sz.x * 1.4, homeBox.max.y + 2.5, -2) }, uBeamD: { value: new V3(-1, -1.25, .55).normalize() },
      uPx: { value: renderer.getPixelRatio() }, uDim: { value: 1 } },
    vertexShader: `attribute float aSeed, aSize; attribute vec3 aCol; uniform float uTime, uMotion, uY0, uH, uPx, uDim; uniform vec3 uBeamO, uBeamD;
      varying vec3 vC;
      void main(){
        float t = uTime * uMotion, sd = aSeed * 6.2832, rise = mod(position.y + t * (.006 + .012 * aSeed), 1.0);
        vec3 p = vec3(position.x + sin(t * .11 + sd) * .9 + sin(t * .37 + sd * 3.) * .2, uY0 + rise * uH, position.z + cos(t * .09 + sd * 2.) * .7);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        vec3 q = p - uBeamO; float d = length(q - uBeamD * dot(q, uBeamD));
        float beam = .55 + 1.3 * exp(-d * d / 6.0);
        float glint = pow(.5 + .5 * sin(uTime * (.6 + aSeed * 1.6) + sd * 7.), 6.0);
        float edge = smoothstep(0., .08, rise) * smoothstep(1., .9, rise);
        vC = aCol * beam * edge * (.5 + 1.5 * glint) * uDim;
        gl_PointSize = max(aSize * uPx * (12.0 / -mv.z) * (.8 + .5 * glint), 1.0);
      }`,
    fragmentShader: `varying vec3 vC; void main(){ float a = smoothstep(.5, 0., length(gl_PointCoord - .5)); gl_FragColor = vec4(vC * a * a, 1.0); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  return m;
})();

/* ---------- sparkles for a touch ---------- */
const SPARK_N = 120;
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SPARK_N * 3), 3));
sparkGeo.setAttribute('aCol', new THREE.Float32BufferAttribute(new Float32Array(SPARK_N * 3), 3));
sparkGeo.setAttribute('aLife', new THREE.Float32BufferAttribute(new Float32Array(SPARK_N), 1));
sparkGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(new Float32Array(SPARK_N), 1));
const sparks = new THREE.Points(sparkGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute vec3 aCol; attribute float aLife, aSize; varying vec3 vC; varying float vL;
    void main(){ vC = aCol; vL = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * 300.0 / -mv.z * (.6 + .4 * aLife); }`,
  fragmentShader: `varying vec3 vC; varying float vL; void main(){ float d = length(gl_PointCoord - .5);
    float a = smoothstep(.5, 0., d); a *= a; gl_FragColor = vec4(vC * a * vL * vL * 1.6, 1.0); }`,
}));
sparks.frustumCulled = false; scene.add(sparks);
const sparkList = Array.from({ length: SPARK_N }, () => ({ p: new V3(), v: new V3(), life: 0, d: 1 }));
let sparkNext = 0;
const SPARK_COLS = [0xffd6ec, 0xe39bff, 0xff86c8, 0xffd9a0, 0xffffff].map(c => new THREE.Color(c));
function burst(at) {
  const col = sparkGeo.attributes.aCol, size = sparkGeo.attributes.aSize;
  for (let i = 0; i < 36; i++) {
    const k = sparkNext = (sparkNext + 1) % SPARK_N, s = sparkList[k];
    const dir = new V3(Math.random() - .5, Math.random() * .8 + .1, Math.random() - .3).normalize();
    s.p.copy(at).addScaledVector(dir, .1); s.v.copy(dir).multiplyScalar(.8 + Math.random() * 1.6);
    s.life = 1; s.d = .9 + Math.random() * 1.1;
    const c = SPARK_COLS[Math.floor(Math.random() * SPARK_COLS.length)];
    col.setXYZ(k, c.r, c.g, c.b); size.setX(k, .03 + Math.random() * .05);
  }
  col.needsUpdate = size.needsUpdate = true;
}
function stepSparks(dt) {
  const pos = sparkGeo.attributes.position, life = sparkGeo.attributes.aLife;
  let any = false;
  sparkList.forEach((s, i) => {
    if (s.life <= 0) { if (life.getX(i) !== 0) { life.setX(i, 0); any = true; } return; }
    any = true;
    s.v.multiplyScalar(Math.exp(-dt * 1.6)); s.v.y -= .5 * dt;
    s.p.addScaledVector(s.v, dt); s.life -= dt / s.d;
    pos.setXYZ(i, s.p.x, s.p.y, s.p.z); life.setX(i, Math.max(0, s.life));
  });
  if (any) pos.needsUpdate = life.needsUpdate = true;
}

/* ---------- cursor wind: how fast the pointer moves near the flower ---------- */
const pPrev = new THREE.Vector2(), pVel = new THREE.Vector2(); let pHave = false;
const flowerNdc = new V3();

/* ---------- the embedded garden ---------- */
const GARDEN_VERSION = '22';
let gframe = null, gOn = null, gSheet = null, gLabels = [], gPan = -1;
const gpost = m => gframe && gframe.contentWindow && gframe.contentWindow.postMessage(m, '*');
function loadGarden() {
  if (gframe) return;
  gframe = document.createElement('iframe');
  gframe.id = 'gardenFrame'; gframe.title = 'The garden: a glass peony, lily and camellia. Click one to open its page.';
  gframe.src = 'flowers/garden3d.html?embed&v=' + GARDEN_VERSION;   // bump when garden3d.html changes so browsers don't reuse an old copy
  gframe.addEventListener('load', () => { gOn = null; gSheet = null; gPan = -1; lightMode = null; });   // force a full re-send once it can listen
  stage.prepend(gframe);
}
addEventListener('message', e => {
  if (!gframe || e.source !== gframe.contentWindow || !e.data) return;
  if (e.data.type === 'garden-labels') {
    // pin the labels: one shared baseline, and ignore anything short of a real layout change (resize)
    const base = Math.max(...e.data.items.map(it => it.y));
    const next = e.data.items.map(it => ({ page: it.page, x: Math.round(it.x), y: Math.round(base) }));
    const moved = next.length !== gLabels.length || next.some((it, i) => Math.abs(it.x - gLabels[i].x) > 3 || Math.abs(it.y - gLabels[i].y) > 3);
    if (moved) gLabels = next;
  }
  if (e.data.type === 'garden-open' && e.data.page) location.hash = e.data.page;
  if (e.data.type === 'garden-key') dispatchEvent(new KeyboardEvent('keydown', { key: e.data.key }));
});

const clock = new THREE.Clock();
let lastT = 0, firstFrame = true, sheetK = 0, lightMode = null;
const tmp = new V3(), tmp2v = new THREE.Vector2();
const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const initial = window.__room || (location.hash === '#garden' ? 'garden' : 'home');
goRoom(initial, true);
let sceneShown = false;
// The garden iframe shares this page's main thread, and building it takes a moment, so don't start it during the
// landing intro: wait until the intro has played and the browser is idle, or start at once if someone heads for it.
if (initial === 'garden') loadGarden();
else {
  const idle = window.requestIdleCallback || (f => setTimeout(f, 200));
  // phones skip the automatic preload: building a second 3D scene there stalls the page; it loads on the first tap instead
  if (!PHONE) addEventListener('scene-ready', () => setTimeout(() => idle(loadGarden, { timeout: 3000 }), 4500), { once: true });
  const way = document.querySelector('.explore');
  if (way) for (const ev of ['pointerenter', 'focus', 'touchstart']) way.addEventListener(ev, loadGarden, { once: true, passive: true });
}
addEventListener('room', e => { if (e.detail === 'garden') loadGarden(); });

const frame = () => {
  const t = clock.getElapsedTime(), dt = t - lastT; lastT = t;
  updateButterfly(t, dt);
  if (!reduce) uTime.value = t;

  // camera: pan between rooms with a gentle dolly back mid-way, plus pointer parallax
  if (panT0 >= 0 && t >= panT0) {
    const k = Math.min(1, (t - panT0) / panDur);
    pan = panFrom + (panTo - panFrom) * ease(k);
    if (k >= 1) { pan = panTo; panT0 = -1; }
  }
  const P0 = poses.home, P1 = poses.garden;
  camTarget.lerpVectors(P0.target, P1.target, pan);
  camPos.lerpVectors(P0.pos, P1.pos, pan);
  camPos.z += Math.sin(Math.PI * pan) * 3;
  if (!reduce && ptrIn.v) camPos.add(tmp.set(ndc.x * .35, ndc.y * .18, 0));
  // while a page is open, lift the view so the blooms sit in the banner strip above it
  sheetK += ((document.body.classList.contains('sheet-open') ? 1 : 0) - sheetK) * (1 - Math.exp(-dt * (reduce ? 60 : 3.5)));
  if (sheetK > 1e-3) {
    const lift = camPos.distanceTo(camTarget) * Math.tan(camera.fov * D2R / 2) * 2 * .4 * sheetK;
    camTarget.y -= lift; camPos.y -= lift;
  }
  if (firstFrame) { camera.position.copy(camPos); firstFrame = false; }
  else camera.position.lerp(camPos, panT0 >= 0 || Math.abs(pan - panTo) > 1e-3 || (sheetK > 1e-3 && sheetK < .999) ? 1 : 1 - Math.exp(-dt * 4));
  camera.lookAt(camTarget);
  root.style.setProperty('--pan', pan.toFixed(4));
  bfly.scale.setScalar((2.2 - .8 * (bRoom === ROOMS.garden ? Math.max(pan, B.state === 'travel' ? Math.min(1, (t - B.t0) / B.dur) : 1) : pan)) * (LIGHT.on ? .62 : 1));   // daintier in light mode

  // hover: the bloom under the cursor lights up a little
  const h = pickAt();
  if (h !== hovered) {
    hovered = h;
    renderer.domElement.style.cursor = h ? 'pointer' : '';
    Object.entries(labels).forEach(([k, el]) => el && el.classList.toggle('lit', !!(h && h.page === k)));
  }
  // light mode: the page inverts this canvas into ink on paper, so glows would turn into smudges; keep them faint
  const lm = root.dataset.theme === 'light';
  if (lm !== lightMode) {
    lightMode = lm;
    bloom.strength = lm ? .14 : .46;
    dust.uniforms.uDim.value = lm ? 0 : 1;   // glitter only reads on the dark sky
    // the dark glass tint would read as grey on paper: keep only the colour film and mesh
    for (const m of mats) { m.userData.base ??= m.uniforms.uBase.value; m.uniforms.uBase.value = m.userData.base * (lm ? .25 : 1); }
    gpost({ type: 'garden-theme', light: lm });
  }
  // light mode: load the bouquet and butterfly the first time it's needed, then swap them in and out with the theme
  if (lm && !LIGHT.loading) loadLight();
  if (!LIGHT.ready) { home.plant.visible = !lm; bfly.visible = !lm; }   // while they load, show nothing rather than the dark flower
  else if (LIGHT.on !== lm) setLight(lm);
  // pointer speed (screen units / s), eased
  if (ptrIn.v && dt > 0) {
    if (pHave) pVel.lerp(tmp2v.set((ndc.x - pPrev.x) / dt, (ndc.y - pPrev.y) / dt), 1 - Math.exp(-dt * 10));
    pPrev.copy(ndc); pHave = true;
  } else { pVel.multiplyScalar(Math.exp(-dt * 4)); pHave = false; }
  stepSparks(Math.min(dt, .05));

  for (const p of [home, ...garden]) {
    p.glowAmt += ((p === hovered ? 1 : 0) - p.glowAmt) * (1 - Math.exp(-dt * 6));
    p.flash *= Math.exp(-dt * 2.2);
    p.bag.boost.value = p.glowAmt * .7 + p.flash * 1.4;
    // wind from the cursor, strongest when it passes close to the bloom
    p.flower.getWorldPosition(flowerNdc).project(camera);
    const dx = (ndc.x - flowerNdc.x) * camera.aspect, dy = ndc.y - flowerNdc.y;
    const near = ptrIn.v && !reduce ? Math.exp(-(dx * dx + dy * dy) / .18) : 0;
    const wx = THREE.MathUtils.clamp(pVel.x * near, -3, 3), wy = THREE.MathUtils.clamp(pVel.y * near, -3, 3);
    const L = p.lean, kk = 14, cc = 3.2, d = Math.min(dt, .05);
    const w = ambientWind(0, 0, t, aw), wm = Math.hypot(w.x, w.z);
    L.vx += (kk * (wx * .05 + w.x * .1 - L.x) - cc * L.vx) * d; L.x += L.vx * d;
    L.vy += (kk * (-wy * .04 + w.z * .08 - L.y) - cc * L.vy) * d; L.y += L.vy * d;
    if (!reduce) {
      swayAbout(p.plant, p.base ??= p.plant.position.clone(), 8.4, Math.sin(t * .45 + p.ph) * .012 - L.x * .4);
      p.flower.rotation.x = p.rx + Math.sin(t * .6 + p.ph) * .015 + Math.sin(t * 2.3 + p.ph) * wm * .035 + L.y;
      p.flower.rotation.y = p.ry + L.x;
      p.tepals.forEach((q, i) => {
        const u = q.userData, push = wx * .05 * Math.cos(u.base + i) + wy * .03 * Math.sin(u.base * 2 + i)
          + wm * .06 * (Math.sin(t * (1.6 + i * .37) + i * 2.1) + .5 * Math.sin(t * (3.7 + i * .5) + i));   // flutter in the breeze
        u.v += (26 * (push - u.a) - 4 * u.v) * d; u.a += u.v * d;
        q.rotation.z = u.base + Math.sin(t * .8 + i * 1.3 + p.ph) * .012 + u.a * .35;
      });
      p.flower.scale.setScalar(1 + p.glowAmt * .025 + p.flash * .04);
    }
    p.glow.material.opacity = (.34 + (reduce ? 0 : Math.sin(t * 1.4 + p.ph) * .04) + p.glowAmt * .16 + p.flash * .3) * (lightMode ? .3 : 1);
  }

  // the embedded garden slides in with the pan; it only runs while it can be seen
  if (gframe) {
    const on = pan > .001;
    if (on !== gOn) { gOn = on; gframe.style.visibility = on ? 'visible' : 'hidden'; gpost({ type: 'garden-active', on }); }
    const sheet = document.body.classList.contains('sheet-open');
    if (sheet !== gSheet) { gSheet = sheet; gpost({ type: 'garden-sheet', on: sheet }); }
    if (on && pan !== gPan) { gPan = pan; gpost({ type: 'garden-pan', off: 1 - pan }); }
  }
  // labels sit under each flower, at the spots the garden reports, moving with the slide
  if (pan > .02) for (const it of gLabels) {
    const el = labels[it.page]; if (!el) continue;
    el.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px) translate(-50%, 0)`;   // the garden already reports them mid-pan
  }
  if (LIGHT.on) lightTick(t, dt);
  // in light mode the dark scene is empty (the bouquet and butterfly draw on their own canvas), so skip it entirely
  if (!LIGHT.on) composer.render();
  else LIGHT.overlay.render(LIGHT.scene, camera);
  if (!sceneShown) { sceneShown = true; requestAnimationFrame(() => { document.body.classList.add('gl-ready'); dispatchEvent(new Event('scene-ready')); }); }
};
// compile the shaders before the first frame, off the main thread where the browser allows it, so the page doesn't
// freeze while the GPU builds them (this was most of the wait on phones)
renderer.compileAsync(scene, camera).catch(() => {}).then(() => renderer.setAnimationLoop(frame));
