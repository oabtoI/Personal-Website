// Tech parts for the light-mode flowers, after the dark-mode garden: an Edison bulb blooming from a flower's heart,
// light channels pulsing up glass stems, wire wound round stems, knuckle rings and bolted collars, LED beads,
// a slowly turning gear ring, glowing fibre tips. Colours stay in the light palette: pink-white light, gold, silver.
import * as THREE from 'three';
import { glassMat, glassTime } from './glass.js';

const V3 = THREE.Vector3, TAU = Math.PI * 2;
const premul = {
  transparent: true, depthWrite: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
};
const vec = h => new V3(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255);

export const metal = {
  gold: () => glassMat({ body: 0xf2cc6a, edge: 0xc88e2a, deep: 0x8a5410, rimC: 0xfff4d0, a: 1, edgeA: 0, fresP: 1.4, spec: 1.7, metal: .6, side: THREE.FrontSide, depthWrite: true }),
  silver: () => glassMat({ body: 0xeceaf2, edge: 0xb2b0c4, deep: 0x6e6c84, rimC: 0xffffff, a: 1, edgeA: 0, fresP: 1.4, spec: 1.8, metal: .85, side: THREE.FrontSide, depthWrite: true }),
};

// something that lights up: its colour, breathing gently, brighter as the flower is hovered (boost)
export function glowMat(color = 0xffd2e6, boost = { value: 0 }, o = {}) {
  return new THREE.ShaderMaterial({
    ...premul, side: THREE.FrontSide,
    uniforms: { uTime: glassTime, uC: { value: vec(color) }, uBoost: boost, uRate: { value: o.rate ?? 1.3 }, uMin: { value: o.min ?? .65 } },
    vertexShader: `varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform float uTime, uBoost, uRate, uMin; uniform vec3 uC; varying vec3 vP;
      void main(){ float b = uMin + (1. - uMin) * (.5 + .5 * sin(uTime * uRate + dot(vP, vec3(9., 7., 5.))));
        vec3 c = mix(uC, vec3(1.), .25 + .25 * b + .3 * uBoost); gl_FragColor = vec4(c, 1.); }`,
  });
}

// a light channel: a slim core inside a stem with soft pulses of light climbing toward the bloom
export function lightChannel(curve, r, color = 0xff9cc8, boost = { value: 0 }) {
  const m = new THREE.ShaderMaterial({
    ...premul, side: THREE.FrontSide,
    uniforms: { uTime: glassTime, uC: { value: vec(color) }, uBoost: boost },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform float uTime, uBoost; uniform vec3 uC; varying vec2 vUv;
      void main(){ float ph = fract(vUv.x * 2.2 - uTime * .35);   // uv.x runs along the tube, root (0) to bloom (1)
        float p = smoothstep(0., .04, ph) * (1. - smoothstep(.04, .2, ph));
        float a = clamp(.28 + .2 * uBoost + p * (.75 + .25 * uBoost), 0., 1.);
        vec3 c = mix(uC, vec3(1.), .35 + .5 * p); gl_FragColor = vec4(c * a, a); }`,
  });
  // the stem curves run bloom → root, so reverse it for the pulses to climb
  const pts = curve.getPoints(60).reverse();
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, r, 8), m);
}

// points on a ring around a curve (frames that don't flip on gentle curves)
function frames(curve, n) {
  const f = curve.computeFrenetFrames(n, false);
  return t => { const i = Math.round(t * n); return { p: curve.getPointAt(t), N: f.normals[i], B: f.binormals[i], T: f.tangents[i] }; };
}
// wire wound round a stem: `turns` loops, at radius R, from t0 to t1 along the curve
export function wire(curve, R, mat, { turns = 3, t0 = .05, t1 = .95, ph = 0, thick = .006, wobble = 0 } = {}) {
  const at = frames(curve, 120), pts = [];
  for (let k = 0; k <= 160; k++) {
    const t = t0 + (t1 - t0) * k / 160, { p, N, B } = at(t), a = ph + t * turns * TAU, rr = R * (1 + wobble * Math.sin(t * 17 + ph));
    pts.push(p.clone().addScaledVector(N, Math.cos(a) * rr).addScaledVector(B, Math.sin(a) * rr));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 260, thick, 6), mat);
}
// knuckle rings at points along a stem
export function rings(curve, R, mat, ts, thick = .3) {
  const g = new THREE.Group(), at = frames(curve, 120);
  for (const t of ts) {
    const { p, T } = at(t), m = new THREE.Mesh(new THREE.TorusGeometry(R, R * thick, 8, 28), mat);
    m.position.copy(p); m.quaternion.setFromUnitVectors(new V3(0, 0, 1), T); g.add(m);
  }
  return g;
}
// a bolted collar part-way up a stem
export function collar(curve, R, t, mat, boltMat) {
  const { p, T } = frames(curve, 120)(t), g = new THREE.Group();
  g.position.copy(p); g.quaternion.setFromUnitVectors(new V3(0, 1, 0), T);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, R * 1.1, 20), mat));
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU, b = new THREE.Mesh(new THREE.SphereGeometry(R * .16, 8, 6), boltMat); b.position.set(Math.cos(a) * R, 0, Math.sin(a) * R); g.add(b); }
  return g;
}
// LED beads strung along a curve offset from the stem
export function beads(curve, R, mat, ts, ph = 2, size = .012) {
  const g = new THREE.Group(), at = frames(curve, 120);
  for (const t of ts) { const { p, N, B } = at(t), m = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), mat);
    m.position.copy(p).addScaledVector(N, Math.cos(ph) * R).addScaledVector(B, Math.sin(ph) * R); g.add(m); }
  return g;
}

// a slowly turning gear ring with status LEDs between its teeth
export function gearRing(R, mat, ledMat, { teeth = 28, leds = 6 } = {}) {
  const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
  spin.add(new THREE.Mesh(new THREE.TorusGeometry(R, R * .07, 8, 64), mat).rotateX(Math.PI / 2));
  for (let i = 0; i < teeth; i++) { const a = i / teeth * TAU, b = new THREE.Mesh(new THREE.BoxGeometry(R * .12, R * .09, R * .16), mat);
    b.position.set(Math.cos(a) * R * 1.1, 0, Math.sin(a) * R * 1.1); b.rotation.y = -a; spin.add(b); }
  for (let i = 0; i < leds; i++) { const a = (i + .5) / leds * TAU, l = new THREE.Mesh(new THREE.SphereGeometry(R * .07, 10, 8), ledMat);
    l.position.set(Math.cos(a) * R * .82, R * .06, Math.sin(a) * R * .82); g.add(l); }
  return { group: g, spin };
}

// an Edison bulb: ridged gold screw base, a pear-shaped clear glass envelope, a hot coiled filament, a warm halo
let halo = null;
export function bulb(k = 1, boost = { value: 0 }) {
  const g = new THREE.Group(); g.scale.setScalar(k);
  const gold = metal.gold(), silver = metal.silver();
  for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(.0215, .0035, 6, 24), gold); r.rotation.x = Math.PI / 2; r.position.y = .006 + i * .0085; g.add(r); }
  const sc = new THREE.Mesh(new THREE.CylinderGeometry(.021, .016, .036, 20), gold); sc.position.y = .016; g.add(sc);
  const prof = [], sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  for (let i = 0; i <= 32; i++) { const u = i / 32, y = .034 + u * .15, r = u < .62 ? .022 + .03 * sm(0, .5, u) : .052 * Math.sqrt(Math.max(0, 1 - ((u - .62) / .38) ** 2)); prof.push(new THREE.Vector2(Math.max(r, .0005), y)); }
  const glass = glassMat({ body: 0xfff6fa, edge: 0xe8c0d8, deep: 0xc890b4, rimC: 0xffffff, a: .05, edgeA: .55, fresP: 2.2, spec: 1.6, iri: .3, boost, side: THREE.FrontSide });
  const env = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), glass); env.renderOrder = 6; g.add(env);
  // support wires and the filament: a tight coil looping in a soft W between the supports
  const fy = .118, fw = .022;
  for (const sx of [-1, 1]) g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new V3(sx * .003, .062, 0), new V3(sx * fw, fy, 0)), 2, .0009, 4), silver));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(.004, .007, .03, 10).translate(0, .05, 0), silver));
  const coil = [];
  for (let i = 0; i <= 260; i++) { const u = i / 260, x = (u - .5) * 2 * fw, y = fy + .028 * Math.sin(u * Math.PI) - .012 * Math.sin(u * Math.PI * 3) ** 2, a = u * 70;
    coil.push(new V3(x, y + Math.cos(a) * .0022, Math.sin(a) * .0022)); }
  const fil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 520, .0011, 4), glowMat(0xffb070, boost, { rate: .9, min: .8 }));
  fil.renderOrder = 5; g.add(fil);
  if (!halo) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,226,180,.85)'); gr.addColorStop(.25, 'rgba(255,190,150,.35)'); gr.addColorStop(.6, 'rgba(255,170,190,.08)'); gr.addColorStop(1, 'rgba(255,170,190,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128); halo = new THREE.CanvasTexture(c); halo.premultiplyAlpha = true;
  }
  const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, transparent: true, depthWrite: false, premultipliedAlpha: true }));
  h.position.y = fy + .01; h.scale.setScalar(.16); h.renderOrder = 7; g.add(h);
  return { group: g, tick: (t, glow) => { const br = .92 + .08 * Math.sin(t * .9); h.material.opacity = (.7 + glow * .3) * br; h.scale.setScalar(.16 + glow * .05); } };
}
