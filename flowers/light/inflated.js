// Inflated pink flower, after the "CGI icon … pink plastic and inflated leather" reference (the pearly one with the
// gold centre): three rings of puffed-up pillow petals — broad, with a soft notch at the tip and a gentle crease down
// the middle — in glossy pearlescent pink, deeper rose in the folds, a heap of gold beads at the heart.
// It stands on a stem of the same pearly pink, with two sculpted pearl leaves: plump, creased along a gold midrib.
// Same rig as the other flowers (petal pivots that spring in the cursor's wind, hover/click boost).
import * as THREE from 'three';
import { glassMat } from './glass.js';
import { plumpStem } from './stem.js';
import { glowMat, gearRing, wire, beads as ledBeads, metal } from './tech.js';

const V3 = THREE.Vector3, D2R = Math.PI / 180, TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rng(seed) { let a = seed * 9973 + 7; return () => (a = (a * 16807) % 2147483647) / 2147483647; }

// A puffed pillow: base at the origin, growing up (+y) and leaning outward (+z) from a0 to a1 degrees.
// Each lengthwise column u ends at its own length, which traces the outline: rounded (or pointed), with an
// optional notch at the tip. Front and back sheets bulge apart and meet at a soft rounded rim.
// Returns the geometry and the top midline (for a vein to sit on).
export function pillow(P, NU = 40, NV = 40) {
  const M = 240, tab = [];
  let y = 0, z = 0;
  for (let k = 0; k <= M; k++) {
    const v = k / M, th = (P.a0 + (P.a1 - P.a0) * Math.pow(v, 1.4) + (P.roll ?? 0) * smooth(.6, 1, v)) * D2R;
    tab.push([y, z, th]); y += Math.cos(th) * P.len / M; z += Math.sin(th) * P.len / M;
  }
  const at = s => { const f = Math.min(M - 1e-6, Math.max(0, s / P.len * M)), i = Math.floor(f), t = f - i, a = tab[i], b = tab[i + 1];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  const colLen = u => P.len * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), P.round ?? 2.4)), P.point ?? .5) * (1 - (P.notch ?? 0) * Math.exp(-u * u / .035));
  const grow = sn => .14 + .86 * Math.pow(Math.sin(Math.PI / 2 * Math.min(1, sn / (P.belly ?? .5))), .7);
  // a point on the pillow: u across (-1..1), v along its own column (0..1), side +1 front / -1 back, lifted off the skin by `rise`
  const point = (u, v, side = 1, rise = 0) => {
    const L = Math.max(colLen(u), P.len * .02), s = v * L, sn = s / P.len;
    const [sy, sz, th] = at(s), ny = -Math.sin(th), nz = Math.cos(th);
    const x = u * P.wid * grow(sn);
    let off = -P.cup * u * u * P.wid;
    off -= (P.crease ?? 0) * Math.exp(-u * u / .02) * smooth(.08, .7, sn) * (1 - smooth(.85, 1, v));
    off += (P.wave ?? 0) * Math.sin(u * 5 + (P.seed ?? 0)) * smooth(.5, 1, sn) * Math.abs(u);
    off += side * P.thick * Math.sqrt(Math.max(0, 1 - u * u)) * Math.sqrt(Math.max(0, 1 - Math.pow(v, 5))) * (.45 + .55 * smooth(0, .2, sn));
    off += side * rise;
    return { p: new V3(x, sy + ny * off, sz + nz * off), sn };
  };
  const pos = [], uv = [], idx = [], mid = [];
  for (const side of [1, -1]) for (let j = 0; j <= NV; j++) {
    const v = j / NV;
    for (let i = 0; i <= NU; i++) {
      const u = i / NU * 2 - 1, { p, sn } = point(u, v, side);
      pos.push(p.x, p.y, p.z); uv.push((u + 1) / 2, sn);
    }
  }
  for (let j = 0; j <= NV * .95; j++) mid.push(point(0, j / NV, 1, .003).p);
  const row = NU + 1, half = (NV + 1) * row;
  for (const [o, flip] of [[0, false], [half, true]]) for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = o + j * row + i, b = a + row;
    if (flip) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return { geo: g, mid, point };
}

export function buildInflated() {
  const boost = { value: 0 }, rnd = rng(5);
  const plant = new THREE.Group(), head = new THREE.Group();
  plant.add(head);
  head.position.set(0, 1.45, 0);
  head.rotation.set(1.0, 0, .08);                 // seen from the front and above, as in the reference
  // glossy pearlescent pink: nearly opaque, deeper rose in the folds, a pearly film and bright gloss in the sheen
  const pink = (o = {}) => glassMat({ body: o.body ?? 0xf9cde3, edge: o.edge ?? 0xd9a6e6, deep: o.deep ?? 0xd06e9e, rimC: 0xffffff, a: .94, edgeA: .08, fresP: 1.7,
    baseK: o.baseK ?? .75, spec: 1.8, iri: .7, lilac: o.lilac ?? .6, ribs: o.ribs ?? 0, ribA: o.ribA ?? 0, boost, seed: rnd() * 9, side: THREE.FrontSide, depthWrite: true });
  const rings = [
    { n: 6, len: .84, wid: .5, a0: 64, a1: 92, cup: .32, thick: .13, r: .1, y: 0, notch: .07 },
    { n: 6, len: .66, wid: .42, a0: 48, a1: 66, cup: .45, thick: .115, r: .1, y: .04, notch: .06 },
    { n: 5, len: .46, wid: .31, a0: 34, a1: 44, cup: .6, thick: .095, r: .09, y: .08, notch: .04 },
  ];
  const petals = [];
  rings.forEach((R, L) => {
    for (let i = 0; i < R.n; i++) {
      const az = (i + L * .5) / R.n * TAU + (rnd() - .5) * .2, seed = L * 10 + i;
      const { geo: g } = pillow({ len: R.len * (.93 + rnd() * .14), wid: R.wid * (.93 + rnd() * .14), a0: R.a0, a1: R.a1 + (rnd() - .5) * 8,
        cup: R.cup, thick: R.thick, notch: R.notch, crease: .025, wave: .02, round: 2.6, point: .45, seed });
      g.computeBoundingBox(); const mid = g.boundingBox.getCenter(new V3()); g.translate(-mid.x, -mid.y, -mid.z);
      const azG = new THREE.Group(); azG.rotation.y = az; head.add(azG);
      const seat = new THREE.Group(); seat.position.set(0, R.y, R.r); azG.add(seat);
      const tilt = new THREE.Group(); seat.add(tilt);
      const m = new THREE.Mesh(g, pink()); m.position.copy(mid); tilt.add(m);
      petals.push({ az, tilt, a: 0, v: 0, amp: .015 + .01 * (2 - L), push: .04 + .03 * (2 - L), k: 34, c: 4.5, ph: seed, freq: 1.3 + i * .2 });
    }
  });
  // the heart: a heap of gold beads
  const gold = glassMat({ body: 0xf2cc6a, edge: 0xc88e2a, deep: 0x8a5410, rimC: 0xfff4d0, a: 1, edgeA: 0, fresP: 1.4, spec: 1.7, iri: .1, boost, side: THREE.FrontSide, depthWrite: true });
  const merge = gs => { const out = new THREE.BufferGeometry(), P = [], Nn = [], U = [], I = []; let o = 0;
    for (const g of gs) { P.push(...g.attributes.position.array); Nn.push(...g.attributes.normal.array); U.push(...g.attributes.uv.array); for (const x of g.index.array) I.push(x + o); o += g.attributes.position.count; }
    out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); out.setIndex(I); return out; };
  const beads = [];
  for (let i = 0; i < 60; i++) {
    const a = rnd() * TAU, r = Math.sqrt(rnd()) * .15, h = .2 + (.15 - r) * .7 + rnd() * .03;
    beads.push(new THREE.SphereGeometry(.026 + rnd() * .014, 14, 10).translate(Math.cos(a) * r, h, Math.sin(a) * r));
  }
  head.add(new THREE.Mesh(merge(beads), gold));
  const core = new THREE.Mesh(new THREE.SphereGeometry(.15, 24, 16), pink()); core.scale.y = .6; core.position.y = .1; head.add(core);

  // a calyx under the bloom: five small pointed pearl sepals, tipped up against the outer petals
  const leafPink = pink({ body: 0xf2b6d4, edge: 0xc9a0e8, deep: 0xb8558c, baseK: .5, lilac: .8 });
  for (let i = 0; i < 5; i++) {
    const { geo } = pillow({ len: .3, wid: .1, a0: 112, a1: 150, cup: .2, thick: .03, crease: .012, round: 1.5, point: .95, belly: .4, seed: i }, 16, 18);
    const az = new THREE.Group(); az.rotation.y = (i + .5) / 5 * TAU; az.position.y = -.04; head.add(az);
    const m = new THREE.Mesh(geo, leafPink); m.position.z = .06; az.add(m);
  }

  // the stem: pearly rose-mauve, finely fluted, tapering toward the bloom, ringed in gold where the leaves join;
  // the leaves: plump, pointed, dusty rose with a lilac sheen, a gold midrib and gold side veins, curling up at the tip
  const leafSpec = new Map();
  const leafGeo = L => { const r = pillow({ len: L.len, wid: L.wid, a0: 12, a1: 48, roll: 26, cup: .22, thick: .055, crease: .035, wave: .015,
    round: 1.6, point: .9, belly: .42, seed: L.at * 7 }, 34, 38); leafSpec.set(L, r); return r.geo; };
  const leafDeco = L => {
    const { mid, point } = leafSpec.get(L), grp = new THREE.Group();
    grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(mid), 40, .0055, 6), gold));
    // pairs of side veins sweeping out and up from the midrib toward the margin
    for (const v0 of [.22, .4, .58, .74]) for (const sd of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push(point(sd * t * .72, Math.min(.95, v0 + t * .16), 1, .004).p); }
      grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, .0032 * (1.2 - v0 * .5), 5), gold));
    }
    return grp;
  };
  const st = plumpStem(plant, head, pink({ body: 0xeeb0d2, edge: 0xc79ae0, deep: 0xa8508a, baseK: 0, ribs: 9, ribA: .05, lilac: .7 }), {
    r: .046, taper: .35, foot: -1.7, sway: .1, leafGeo, leafDeco, leafMat: leafPink, nodeMat: gold,
    leaves: [{ at: .4, side: 1, len: .82, wid: .3, lift: .2, spread: 1.0 }, { at: .64, side: -1, len: .68, wid: .26, lift: .1, spread: .9 }],
  });
  // tech, after the dark-mode camellia: a slowly turning silver gear ring round the gold heart, with status LEDs;
  // a silver cable with LED beads running up the stem
  const silver = metal.silver(), led = glowMat(0xffc2e0, boost, { rate: 2.2, min: .45 });
  const gear = gearRing(.19, silver, led, { teeth: 26, leds: 6 }); gear.group.position.y = .25; head.add(gear.group);
  plant.add(wire(st.curve, .062, silver, { turns: 0, ph: 1.2, thick: .0036, t0: .08, t1: .92 }), ledBeads(st.curve, .062, led, [.2, .32, .52, .78, .88], 1.2, .012));
  const pick = new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 8), new THREE.MeshBasicMaterial({ visible: false })); head.add(pick);
  const F = { plant, head, petals, boost, pick, rx: head.rotation.x, ry: 0, lean: { x: 0, y: 0, vx: 0, vy: 0 }, glow: 0, flash: 0, ph: 1.1, stem: { curve: st.curve, mat: st.tube.material, r: .046 } };
  F.tick = (t, dt) => { gear.spin.rotation.y += dt * (.25 + F.glow * 1.2); };
  return F;
}
