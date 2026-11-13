// Iridescent pink hibiscus, after the sparkly "CGI icon … inflated leather" reference: five broad, ruffled, overlapping
// petals of satin lilac-pink with violet-blue thin-film streaks and twinkling glitter, deeper rose veins running out
// from the throat, and long fine stamens flecked with gold. Polished (part metallic) like the inflated flower, on a
// matching stem with a plump leaf. Same rig as the other flowers.
import * as THREE from 'three';
import { glassMat } from './glass.js';
import { plumpStem } from './stem.js';
import { glowMat, wire, beads, collar, metal } from './tech.js';

const V3 = THREE.Vector3, D2R = Math.PI / 180, TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rng(seed) { let a = seed * 9973 + 7; return () => (a = (a * 16807) % 2147483647) / 2147483647; }

// a broad hibiscus petal: narrow claw at the base, widest two-thirds out, a rounded, deeply ruffled margin;
// given a little thickness (front and back sheets meeting at a rounded rim) so it reads plump, not paper-thin
function petalGeo(P, NU = 48, NV = 46) {
  const pos = [], uv = [], idx = [], ds = P.len / NV, spine = [];
  let y = 0, z = 0;
  for (let j = 0; j <= NV; j++) {
    const v = j / NV, th = (P.a0 + (P.a1 - P.a0) * Math.pow(v, 1.2) + 26 * smooth(.6, 1, v)) * D2R;   // the outer third rolls back
    spine.push([y, z, -Math.sin(th), Math.cos(th)]);
    y += Math.cos(th) * ds; z += Math.sin(th) * ds;
  }
  const width = v => {
    const grow = .1 + .9 * Math.pow(Math.sin(Math.PI / 2 * Math.min(1, v / .7)), 1.1);
    const tip = v > .7 ? Math.sqrt(Math.max(0, 1 - ((v - .7) / .3) ** 2.4)) : 1;
    return P.wid * grow * (.25 + .75 * tip);
  };
  for (const side of [1, -1]) for (let j = 0; j <= NV; j++) {
    const v = j / NV, [sy, sz, ny, nz] = spine[j], w = width(v);
    for (let i = 0; i <= NU; i++) {
      const u = i / NU * 2 - 1, au = Math.abs(u);
      let off = -P.cup * u * u * w + P.twist * u * w * v;
      // the hibiscus ruffle: big slow waves at the margin, smaller crinkles on top, fading toward the throat
      off += P.ruffle * (Math.sin(u * 7 + P.seed) + .5 * Math.sin(u * 15 + P.seed * 2.3 + v * 4)) * Math.pow(au, 1.2) * smooth(.3, 1, v);
      off += P.ruffle * 1.1 * Math.sin(u * 11 + P.seed * 1.7) * smooth(.72, 1, v);
      off += P.fold * Math.sin(u * Math.PI) * smooth(.2, .8, v) * w;   // a soft crease down the middle
      // broad satin folds running out from the throat: they catch the light in wide bright and dark bands
      off += P.folds * Math.sin(u * 6.3 + P.seed + v * 1.5) * smooth(.12, .9, v) * w;
      const th = P.thick * Math.sqrt(Math.max(0, 1 - u * u)) * Math.sqrt(Math.max(0, 1 - Math.pow(v, 8)));
      off += side * th;
      pos.push(u * w, sy + ny * off, sz + nz * off);
      uv.push((u + 1) / 2, v);
    }
  }
  const row = NU + 1, half = (NV + 1) * row;
  for (const [o, flip] of [[0, false], [half, true]]) for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = o + j * row + i, b = a + row;
    if (flip) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function buildHibiscus() {
  const boost = { value: 0 }, rnd = rng(17);
  const plant = new THREE.Group(), head = new THREE.Group();
  plant.add(head);
  head.position.set(0, 1.5, 0);
  head.rotation.set(.82, 0, -.1);              // opened flat toward the viewer, seen from a little above, as in the reference
  const petals = [];
  for (let k = 0; k < 5; k++) {
    const az = k / 5 * TAU + (rnd() - .5) * .18, seed = k * 3.1 + 1;
    const P = { len: 1.1 * (.94 + rnd() * .12), wid: .72 * (.94 + rnd() * .12), a0: 52, a1: 104 + (rnd() - .5) * 16,
      cup: .3, ruffle: .075, fold: .05, folds: .11, twist: .22, thick: .06, seed };
    // satin pink deepening to peach-rose in the throat, a lilac-blue thin film out toward the edges, dense glitter
    const mat = glassMat({ body: 0xf4c2dc, edge: 0xc8a0e8, deep: 0xd46a7c, rimC: 0xffffff, a: .86, edgeA: .15, fresP: 1.6,
      baseK: 1, spec: 1.5, iri: 1, lilac: 1, metal: .45, glit: .45, circ: .9, boost, seed, side: THREE.FrontSide, depthWrite: true });
    const g = petalGeo(P); g.computeBoundingBox(); const mid = g.boundingBox.getCenter(new V3()); g.translate(-mid.x, -mid.y, -mid.z);
    const azG = new THREE.Group(); azG.rotation.y = az; head.add(azG);
    // each petal overlaps the next: a slight lift on one side
    const seat = new THREE.Group(); seat.position.set(0, k * .006, .05); seat.rotation.z = .1; azG.add(seat);
    const tilt = new THREE.Group(); seat.add(tilt);
    const m = new THREE.Mesh(g, mat); m.position.copy(mid); tilt.add(m);
    petals.push({ az, tilt, a: 0, v: 0, amp: .025, push: .1, k: 26, c: 3.8, ph: seed, freq: 1.4 + k * .2 });
  }
  // the throat: a deep rose cup; the stamens: long fine filaments fanning out low over the petals, flecked with gold
  const throat = glassMat({ body: 0xd0609a, edge: 0xa83c78, deep: 0x7a2050, rimC: 0xffd0e8, a: .95, edgeA: .05, fresP: 1.6, spec: 1.3, metal: .4, boost, side: THREE.FrontSide, depthWrite: true });
  const cup = new THREE.Mesh(new THREE.SphereGeometry(.12, 24, 16, 0, TAU, 0, Math.PI / 2), throat); cup.scale.y = .5; head.add(cup);
  const filMat = glassMat({ body: 0xf4b8b8, edge: 0xe08c94, deep: 0xb05a68, rimC: 0xffffff, a: .9, edgeA: .1, fresP: 1.5, spec: 1.2, metal: .3, boost, side: THREE.FrontSide, depthWrite: true });
  const gold = glassMat({ body: 0xf2cc6a, edge: 0xc88e2a, deep: 0x8a5410, rimC: 0xfff4d0, a: 1, edgeA: 0, fresP: 1.4, spec: 1.7, metal: .6, boost, side: THREE.FrontSide, depthWrite: true });
  const fil = [], dots = [];
  for (let i = 0; i < 40; i++) {
    const a = rnd() * TAU, el = (16 + rnd() * 34) * D2R, L = .4 + rnd() * .36;
    const p0 = new V3(Math.cos(a) * .03, .03, Math.sin(a) * .03), dir = new V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    const p2 = p0.clone().addScaledVector(dir, L), p1 = p0.clone().addScaledVector(dir, L * .5).add(new V3(0, .06, 0));
    const c = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    fil.push(new THREE.TubeGeometry(c, 12, .0045, 5));
    // a dusting of gold pollen clustered at the tip
    const tip = c.getPoint(1);
    for (let k = 0; k < 5; k++) dots.push(new THREE.SphereGeometry(.007 + rnd() * .007, 8, 6).translate(tip.x + (rnd() - .5) * .04, tip.y + (rnd() - .5) * .03, tip.z + (rnd() - .5) * .04));
  }
  const merge = gs => { const out = new THREE.BufferGeometry(), P = [], Nn = [], U = [], I = []; let o = 0;
    for (const g of gs) { P.push(...g.attributes.position.array); Nn.push(...g.attributes.normal.array); U.push(...g.attributes.uv.array); for (const x of g.index.array) I.push(x + o); o += g.attributes.position.count; }
    out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); out.setIndex(I); return out; };
  head.add(new THREE.Mesh(merge(fil), filMat), new THREE.Mesh(merge(dots), gold));
  // a stem in polished pink with one plump leaf
  const stemMat = glassMat({ body: 0xf6c4e0, edge: 0xdc94c0, deep: 0xbc6e9c, rimC: 0xffffff, a: .95, edgeA: .1, fresP: 1.8, spec: 1.4, iri: .4, metal: .7, boost, side: THREE.FrontSide, depthWrite: true });
  const st = plumpStem(plant, head, stemMat, { r: .05, foot: -1.7, leaves: [{ at: .5, side: -1, len: .8, wid: .3 }] });
  // tech stem, after the dark-mode camellia: gold wire wound round it, a silver cable strung with LED beads, a bolted collar
  const silver = metal.silver(), led = glowMat(0xffb6d8, boost, { rate: 2.4, min: .5 });   // `gold` is the stamens' gold, above
  plant.add(wire(st.curve, .068, gold, { turns: 2.4, thick: .0048, t0: .06, t1: .94 }), wire(st.curve, .085, silver, { turns: 0, ph: 2, thick: .0034, t0: .08, t1: .92 }),
    beads(st.curve, .085, led, [.18, .3, .42, .62, .74, .86], 2, .011), collar(st.curve, .07, .4, silver, gold));
  const pick = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 8), new THREE.MeshBasicMaterial({ visible: false })); head.add(pick);
  return { plant, head, petals, boost, pick, rx: head.rotation.x, ry: 0, lean: { x: 0, y: 0, vx: 0, vy: 0 }, glow: 0, flash: 0, ph: 2.6, stem: { curve: st.curve, mat: stemMat, r: .05 } };
}
