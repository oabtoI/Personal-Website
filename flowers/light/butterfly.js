// Light-mode butterfly: a crystal butterfly in pale pink glass, after the reference render.
// The wings are 3D panels carrying hand-painted glass art (painted here in code, top-down): a rounded rose rim,
// embossed veins, softly pillowed cells, studio highlights and amber glints. A thin 3D glass rim gives them an
// edge when seen side-on. The body and antennae are small 3D glass parts.
// Everything hangs on the dark-mode butterfly's rig, so flight, perching and flapping are unchanged.
import * as THREE from 'three';

const V3 = THREE.Vector3, TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------- materials ---------- */
// wing art: the painting's own colour and transparency, dimmed a little when tilted away, with a soft grazing sheen
const ART_VS = /* glsl */`
  attribute vec2 aW; varying vec2 vUv; varying vec3 vN, vV;
  void main(){
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
const ART_FS = /* glsl */`
  uniform sampler2D map; uniform float uBoost;
  varying vec2 vUv; varying vec3 vN, vV;
  void main(){
    vec4 t = texture2D(map, vUv);                 // premultiplied on upload
    if (t.a < .003) discard;
    float f = abs(dot(normalize(vN), normalize(vV)));
    float shade = mix(.84, 1.04, f);
    float sheen = pow(1. - f, 3.) * .25;
    float a = min(1., t.a * (1. + (1. - f) * .6));     // edge-on, the glass reads denser
    vec3 col = t.rgb / max(t.a, 1e-4) * shade + (sheen + uBoost * .12);
    gl_FragColor = vec4(col * a, a);
  }`;
// small 3D glass parts: tinted body, deeper colour at grazing angles, amber in the thick parts, studio highlights
const GLASS_VS = /* glsl */`
  attribute vec2 aW; varying vec3 vN, vV, vP;
  void main(){
    vP = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
const GLASS_FS = /* glsl */`
  uniform vec3 uBody, uEdge, uDeep, uWarm; uniform float uA, uEdgeA, uWarmK, uBoost;
  varying vec3 vN, vV, vP;
  void main(){
    vec3 N = normalize(vN), V = normalize(vV);
    if (dot(N, V) < 0.) N = -N;
    float ndv = clamp(dot(N, V), 0., 1.), fr = pow(1. - ndv, 1.5);
    vec3 R = reflect(-V, N);
    float spec = smoothstep(.55, .97, R.y) * .45
      + pow(max(dot(R, normalize(vec3(.55, .6, .58))), 0.), 60.) * 1.6
      + pow(max(dot(R, normalize(vec3(-.8, .3, .52))), 0.), 20.) * .45;
    vec3 col = mix(uBody, uEdge, fr);
    col = mix(col, uDeep, pow(fr, 2.) * .75);
    col = mix(col, uWarm, uWarmK * fr * (.5 + .5 * sin(vP.z * 90. + vP.x * 40.)));
    float a = uA + fr * uEdgeA;
    float s = clamp(spec, 0., 1.);
    col = mix(col, vec3(1.), s); a = max(a, s * .9);
    col += uBoost * .1;
    gl_FragColor = vec4(col * a, a);
  }`;
const premul = {
  transparent: true, depthWrite: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
};
const rgb = h => new THREE.Color().setRGB(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255, THREE.LinearSRGBColorSpace);   // painted colours, used as-is
function glassMat(o, boost) {
  return new THREE.ShaderMaterial({
    vertexShader: GLASS_VS, fragmentShader: GLASS_FS, ...premul, side: o.side ?? THREE.FrontSide,
    uniforms: { uBody: { value: rgb(o.body) }, uEdge: { value: rgb(o.edge) }, uDeep: { value: rgb(o.deep) }, uWarm: { value: rgb(o.warm) },
      uA: { value: o.a }, uEdgeA: { value: o.edgeA }, uWarmK: { value: o.warmK ?? .4 }, uBoost: boost },
  });
}

/* ---------- wing outlines (wing units: x out along the span, y toward the head; the hinge at 0,0) ---------- */
function outline(keys, n, scal, wob, seed) {
  const c = new THREE.CatmullRomCurve3(keys.map(([x, y]) => new V3(x, y, 0)), true, 'centripetal');
  return c.getSpacedPoints(n).slice(0, n).map((p, i) => {
    const s = i / n, r = Math.hypot(p.x, p.y), a = Math.atan2(p.y, p.x);
    let k = 1;
    if (scal) {
      const w = smooth(scal.from, scal.from + .04, s) * (1 - smooth(scal.to - .04, scal.to, s));
      k -= w * scal.amp * Math.pow(.5 + .5 * Math.cos((s - scal.from) / (scal.to - scal.from) * TAU * scal.lobes), 2.5);
    }
    k *= 1 + wob * (Math.sin(s * 41 + seed) * .6 + Math.sin(s * 97 + seed * 2.3) * .4) * smooth(0, .2, r);
    return [Math.cos(a) * r * k, Math.sin(a) * r * k];
  });
}
const quad = (a, m, b, n = 40) => { const r = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; r.push([u * u * a[0] + 2 * u * t * m[0] + t * t * b[0], u * u * a[1] + 2 * u * t * m[1] + t * t * b[1]]); } return r; };
// veins as polylines in wing units: the closed cell, main veins (root → margin) and forks near the edge
function veinLines(o) {
  const lines = [], [cx0, cy0, rx, ry, rot] = o.cell, cell = [];
  for (let i = 0; i <= 80; i++) { const a = i / 80 * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    cell.push([cx0 + x * Math.cos(rot) - y * Math.sin(rot), cy0 + x * Math.sin(rot) + y * Math.cos(rot)]); }
  lines.push({ pts: cell, w: .9 });
  for (const v of o.veins) {
    const mid = [(v.from[0] + v.to[0]) / 2 + (v.bend?.[0] ?? 0), (v.from[1] + v.to[1]) / 2 + (v.bend?.[1] ?? 0)];
    const main = quad(v.from, mid, v.to);
    lines.push({ pts: main, w: v.w ?? 1 });
    if (v.fork) { const at = main[Math.round(main.length * (v.fork.at ?? .64))];
      lines.push({ pts: quad(at, [(at[0] + v.fork.to[0]) / 2, (at[1] + v.fork.to[1]) / 2], v.fork.to, 20), w: (v.w ?? 1) * .75 }); }
  }
  return lines;
}

/* ---------- the painting ---------- */
function paintWing(o) {
  const S = 1024, pad = .03;
  const xs = o.rim.map(p => p[0]), ys = o.rim.map(p => p[1]);
  const minX = Math.min(...xs, 0) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys, 0) - pad, maxY = Math.max(...ys) + pad;
  const k = S / Math.max(maxX - minX, maxY - minY);
  const cw = Math.ceil((maxX - minX) * k), ch = Math.ceil((maxY - minY) * k);
  const P = ([x, y]) => [(x - minX) * k, (maxY - y) * k];
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  const path = (pts, close) => { g.beginPath(); pts.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); if (close) g.closePath(); };
  const L = o.reach * k;                          // a wing's length in pixels, for sizing strokes
  const [hx, hy] = P([0, 0]);
  const veins = veinLines(o);

  g.save(); path(o.rim, true); g.clip();
  // 1. the membrane: nearly clear near the body, a little more rose toward the margin
  let gr = g.createRadialGradient(hx, hy, L * .05, hx, hy, L * 1.05);
  gr.addColorStop(0, 'rgba(250,210,234,.26)'); gr.addColorStop(.55, 'rgba(246,172,216,.36)'); gr.addColorStop(1, 'rgba(236,126,188,.52)');
  g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
  // a lavender cast through the middle, like the reference
  gr = g.createLinearGradient(...P([0, o.reach * .6]), ...P([o.reach * .7, -o.reach * .1]));
  gr.addColorStop(0, 'rgba(226,206,246,0)'); gr.addColorStop(.5, 'rgba(226,206,246,.12)'); gr.addColorStop(1, 'rgba(226,206,246,0)');
  g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
  // 2. pillowed cells: the glass thickens beside each vein, so the colour deepens softly toward them
  g.filter = `blur(${L * .025}px)`;
  for (const v of veins) { path(v.pts); g.lineWidth = L * .06 * v.w; g.strokeStyle = 'rgba(222,150,192,.07)'; g.stroke(); }
  // 3. the rim: thick glass all round — deep rose band inside the edge, then a pale caught-light band, a dark lip at the very edge
  g.filter = `blur(${L * .03}px)`; path(o.rim, true); g.lineWidth = L * .14; g.strokeStyle = 'rgba(226,150,192,.2)'; g.stroke();
  g.filter = `blur(${L * .004}px)`;
  path(o.rim, true); g.lineWidth = L * .05; g.strokeStyle = 'rgba(250,222,238,.35)'; g.stroke();
  path(o.rim, true); g.lineWidth = L * .03; g.strokeStyle = 'rgba(214,120,166,.25)'; g.stroke();
  // amber where the thick glass bends the light, strongest along the trailing edge
  g.filter = `blur(${L * .006}px)`;
  gr = g.createLinearGradient(...P(o.amberFrom), ...P(o.amberTo));
  gr.addColorStop(0, 'rgba(232,150,80,0)'); gr.addColorStop(.6, 'rgba(232,150,80,.25)'); gr.addColorStop(1, 'rgba(236,160,84,.65)');
  path(o.rim, true); g.lineWidth = L * .05; g.strokeStyle = gr; g.stroke();
  // 4. veins: a rose line embossed into the glass — a shadow on one side, a light line on the other
  for (const v of veins) {
    const w = L * .0065 * v.w;
    g.filter = `blur(${w * .5}px)`;
    g.save(); g.translate(w * .35, w * .35); path(v.pts); g.lineWidth = w * 1.8; g.strokeStyle = 'rgba(196,96,148,.2)'; g.stroke(); g.restore();
    g.filter = 'none';
    path(v.pts); g.lineWidth = w; g.strokeStyle = 'rgba(204,64,124,.88)'; g.stroke();
    g.save(); g.translate(-w * .45, -w * .45); path(v.pts); g.lineWidth = w * .45; g.strokeStyle = 'rgba(255,236,246,.75)'; g.stroke(); g.restore();
  }
  // 5. studio light: a broad soft reflection across the upper wing, a couple of streaks, crisp glints on the rim
  g.filter = `blur(${L * .05}px)`;
  for (const h of o.lights) {
    const [x, y] = P(h.at);
    g.save(); g.translate(x, y); g.rotate(h.rot); g.scale(1, h.thin);
    gr = g.createRadialGradient(0, 0, 0, 0, 0, h.r * k);
    gr.addColorStop(0, `rgba(255,255,255,${h.a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, h.r * k, 0, TAU); g.fill(); g.restore();
  }
  g.filter = `blur(${L * .002}px)`;
  for (const [s0, s1] of o.glints) {
    const n = o.rim.length, seg = o.rim.slice(Math.floor(s0 * n), Math.floor(s1 * n));
    path(seg); g.lineWidth = L * .012; g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke();
  }
  g.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace; tex.premultiplyAlpha = true;
  tex.anisotropy = 8; tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, cw, ch, k, hinge: [hx, hy] };
}

/* ---------- geometry ---------- */
// the art panel: the canvas laid flat in the wing's plane (canvas right → out along the span, canvas up → toward the head)
function panelGeo(art, reach, NU = 56, NV = 56) {
  const { cw, ch, k, hinge: [hx, hy] } = art, pos = [], uv = [], aW = [], idx = [];
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
    const px = cw * i / NU, py = ch * j / NV, x = (px - hx) / k, z = -(py - hy) / k;
    pos.push(x, 0, z); uv.push(i / NU, 1 - j / NV);
    aW.push(.5 + Math.atan2(z, x) / Math.PI, Math.min(1, Math.hypot(x, z) / reach));
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + NU + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(aW, 2));
  g.setIndex(idx); g.computeVertexNormals();
  g.userData.base = g.attributes.position.array.slice();
  return g;
}
// a thin glass rod along the wing's outline, so the wing keeps an edge seen side-on
function rimGeo(rim, reach, r) {
  const n = rim.length, NR = 8, pos = [], aW = [], idx = [], T = new V3(), B = new V3(), N = new V3(), p = new V3(), up = new V3(0, 1, 0);
  const pts = rim.map(([x, y]) => new V3(x, 0, y));
  for (let j = 0; j < n; j++) {
    T.subVectors(pts[(j + 1) % n], pts[(j - 1 + n) % n]).normalize();
    B.crossVectors(T, up).normalize(); N.crossVectors(B, T);
    for (let i = 0; i <= NR; i++) {
      const t = i / NR * TAU;
      p.copy(pts[j]).addScaledVector(N, Math.cos(t) * r).addScaledVector(B, Math.sin(t) * r * 1.3);
      pos.push(p.x, p.y, p.z);
      aW.push(.5 + Math.atan2(pts[j].z, pts[j].x) / Math.PI, Math.min(1, Math.hypot(pts[j].x, pts[j].z) / reach));
    }
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < NR; i++) { const a = j * (NR + 1) + i, b = ((j + 1) % n) * (NR + 1) + i; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(aW, 2));
  g.setIndex(idx); g.computeVertexNormals();
  g.userData.base = g.attributes.position.array.slice();
  return g;
}

/* ---------- the two wings, after the reference: broad rounded forewings, smaller scalloped hindwings ---------- */
function wingSpec(o) {
  const sz = o.size, sc = ([x, y]) => [x * sz, y * sz];
  const rim = outline(o.keys.map(sc), 360, o.scal, o.wob, o.seed);
  return {
    rim, reach: o.reach * sz,
    cell: [o.cell[0] * sz, o.cell[1] * sz, o.cell[2] * sz, o.cell[3] * sz, o.cell[4]],
    veins: o.veins.map(v => ({ ...v, from: sc(v.from), to: sc(v.to), bend: sc(v.bend ?? [0, 0]), fork: v.fork && { ...v.fork, to: sc(v.fork.to) } })),
    lights: o.lights.map(h => ({ ...h, at: sc(h.at), r: h.r * sz })),
    glints: o.glints, amberFrom: sc(o.amberFrom), amberTo: sc(o.amberTo),
  };
}
const FORE = wingSpec({
  size: .66, reach: .88, wob: .005, seed: 1.3,
  keys: [[.02, .03], [.1, .17], [.21, .33], [.33, .47], [.45, .57], [.56, .62], [.66, .61], [.74, .53], [.78, .41], [.79, .27], [.75, .12], [.66, -.01], [.52, -.09], [.36, -.11], [.2, -.08], [.08, -.03]],
  cell: [.24, .2, .15, .045, .78],
  veins: [
    { from: [.03, .03], to: [.47, .56], bend: [-.03, .03], w: 1.1 },
    { from: [.34, .3], to: [.6, .6], bend: [0, .02], fork: { to: [.53, .58], at: .7 } },
    { from: [.35, .29], to: [.72, .51], bend: [.02, .03], fork: { to: [.68, .56], at: .66 } },
    { from: [.35, .27], to: [.77, .34], bend: [.03, .01] },
    { from: [.32, .24], to: [.76, .19], bend: [.03, -.01], fork: { to: [.77, .27], at: .7 } },
    { from: [.27, .17], to: [.7, .05], bend: [.02, -.02] },
    { from: [.17, .1], to: [.55, -.07], bend: [.02, -.02], fork: { to: [.63, -.02], at: .72 } },
    { from: [.03, .01], to: [.38, -.1], bend: [0, -.02], w: .85 },
  ],
  lights: [{ at: [.4, .38], r: .26, thin: .3, rot: -.75, a: .9 }, { at: [.6, .2], r: .15, thin: .22, rot: -1, a: .6 }, { at: [.22, .12], r: .08, thin: .5, rot: -.6, a: .7 }],
  glints: [[.18, .26], [.33, .38]], amberFrom: [.5, .4], amberTo: [.45, -.1],
});
const HIND = wingSpec({
  size: .62, reach: .66, wob: .008, seed: 4.1,
  keys: [[.03, -.01], [.17, -.02], [.32, -.07], [.45, -.15], [.53, -.27], [.55, -.39], [.49, -.49], [.38, -.56], [.25, -.57], [.14, -.5], [.07, -.36], [.02, -.17]],
  scal: { from: .14, to: .8, lobes: 6, amp: .045 },
  cell: [.2, -.2, .11, .036, -.78],
  veins: [
    { from: [.02, 0], to: [.42, -.11], bend: [0, .01], w: .9 },
    { from: [.27, -.25], to: [.51, -.24], bend: [.01, .02], fork: { to: [.47, -.17], at: .7 } },
    { from: [.28, -.27], to: [.53, -.37], bend: [.02, 0] },
    { from: [.27, -.29], to: [.47, -.48], bend: [.02, -.01], fork: { to: [.52, -.43], at: .7 } },
    { from: [.24, -.29], to: [.37, -.54], bend: [.02, -.01] },
    { from: [.17, -.25], to: [.24, -.55], bend: [.01, -.02], fork: { to: [.3, -.56], at: .72 } },
    { from: [.03, -.03], to: [.12, -.47], bend: [-.02, -.01], w: .85 },
  ],
  lights: [{ at: [.3, -.2], r: .17, thin: .28, rot: -.4, a: .7 }, { at: [.42, -.4], r: .07, thin: .5, rot: -.9, a: .6 }],
  glints: [[.08, .15]], amberFrom: [.3, -.1], amberTo: [.2, -.58],
});

/* ---------- build: meshes to hang on the rig's wing pivots, and a body for the butterfly group ---------- */
export async function buildArtButterfly() {
  const boost = { value: 0 };
  // the thick rounded glass edge of each wing: clear in the middle of the rod, deep rose and amber where you look through more glass
  const rimMat = glassMat({ body: 0xf9a8d0, edge: 0xd83e80, deep: 0x9c1656, warm: 0xf0924a, a: .42, edgeA: .75, warmK: .85 }, boost);
  const mk = spec => {
    const art = paintWing(spec);
    const mat = new THREE.ShaderMaterial({ vertexShader: ART_VS, fragmentShader: ART_FS, ...premul, side: THREE.DoubleSide,
      uniforms: { map: { value: art.tex }, uBoost: boost } });
    return { panel: panelGeo(art, spec.reach), rim: rimGeo(spec.rim, spec.reach, .013), mat };
  };
  const fore = mk(FORE), hind = mk(HIND);
  const wingGroup = (w, order) => {
    const grp = new THREE.Group();
    const a = new THREE.Mesh(w.panel, w.mat), b = new THREE.Mesh(w.rim, rimMat);
    a.renderOrder = order; b.renderOrder = order + .5;
    grp.add(a, b); return grp;
  };

  // body: slim rose-amber glass — a smooth thorax, a long tapering abdomen with soft rings, a small head
  // with dark-rose eyes, and fine antennae with clubbed tips
  const bodyMat = glassMat({ body: 0xf47eb2, edge: 0xd2407c, deep: 0x881444, warm: 0xf08a3c, a: .72, edgeA: .45, warmK: .85 }, boost);
  const eyeMat = glassMat({ body: 0xb85482, edge: 0x8a2a58, deep: 0x5e1a3c, warm: 0xc07040, a: .8, edgeA: .2, warmK: .2 }, boost);
  const body = new THREE.Group(); body.scale.setScalar(1.35);
  const ell = new THREE.SphereGeometry(1, 36, 24);
  const part = (mat, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(ell, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.renderOrder = 3; body.add(m); return m; };
  const prof = [];
  for (let i = 0; i <= 140; i++) {
    const s = i / 140, ring = 1 - .13 * Math.pow(Math.abs(Math.sin(s * 8 * Math.PI)), .6) * smooth(.06, .16, s);
    prof.push(new THREE.Vector2(Math.max(.0006, .027 * Math.pow(Math.sin(Math.PI * Math.min(1, .12 + s * .9)), .5) * (1 - .3 * s) * ring), -s * .28));
  }
  const abd = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), bodyMat);
  abd.position.set(0, .002, -.02); abd.rotation.set(Math.PI / 2 + .06, 0, 0); abd.renderOrder = 3;   // lathe's −y becomes the tail (−z)
  body.add(abd);
  part(bodyMat, 0, .005, .028, .026, .024, .06);
  part(bodyMat, 0, .01, .095, .018, .017, .017);
  for (const s of [-1, 1]) part(eyeMat, s * .013, .013, .1, .0085, .0095, .0085);
  for (const s of [-1, 1]) {
    const c = new THREE.CubicBezierCurve3(new V3(s * .006, .02, .105), new V3(s * .018, .1, .18), new V3(s * .045, .19, .28), new V3(s * .075, .24, .35));
    const ant = new THREE.Mesh(new THREE.TubeGeometry(c, 48, .0022, 6), bodyMat); ant.renderOrder = 3; body.add(ant);
    const e = c.getPoint(1), club = part(bodyMat, e.x, e.y, e.z, .007, .007, .017);
    club.lookAt(e.clone().add(c.getTangentAt(1)));
  }

  // the dark-mode wings' flex: bend, twist and ripple with the flapping speed (panel and rim together)
  function flexOne(g, omega, t, gain) {
    const base = g.userData.base, pos = g.attributes.position.array, w = g.attributes.aW.array;
    const bend = -omega * .003 * gain, twist = -omega * .0045 * gain, amp = (.008 + Math.min(.022, Math.abs(omega) * .0007)) * gain;
    for (let i = 0, n = pos.length / 3; i < n; i++) {
      const u = w[i * 2], v = w[i * 2 + 1], x = base[i * 3], z = base[i * 3 + 2];
      const ripple = Math.sin(t * 26 - v * 7 + u * 5) + .5 * Math.sin(t * 41 - v * 11 - u * 3);
      pos[i * 3 + 1] = base[i * 3 + 1] + bend * v * v + twist * z * v + amp * ripple * v * v * (.4 + .6 * Math.abs(x) / (Math.abs(x) + .1));
    }
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
  }
  let calmBefore = false;
  return {
    fore: () => wingGroup(fore, 2), hind: () => wingGroup(hind, 1), body, boost,
    flex(t, wf, wh) {
      const calm = Math.abs(wf) + Math.abs(wh) < 1e-3;
      if (calm && calmBefore) return;
      calmBefore = calm;
      flexOne(fore.panel, wf, t, 1); flexOne(fore.rim, wf, t, 1);
      flexOne(hind.panel, wh, t + .4, 1.2); flexOne(hind.rim, wh, t + .4, 1.2);
    },
  };
}
