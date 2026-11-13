// Lilac glass poppy, after the "стеклянные цветы" (glass flowers) reference: six broad, thin, crinkled petals of
// pale lilac glass with a pearly enamel sheen and a fine darker edging, opening into a wide cup; a dark plum heart
// with a spray of fine glass filaments tipped with tiny silver-pearl anthers; a slender clear lilac glass stem.
// Same rig as the other flowers: petal pivots that spring in the cursor's wind, a leaning head, hover/click boost.
import * as THREE from 'three';
import { glassMat } from './glass.js';
import { glowMat, lightChannel, wire, rings, metal } from './tech.js';

const V3 = THREE.Vector3, D2R = Math.PI / 180, TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rng(seed) { let a = seed * 9973 + 7; return () => (a = (a * 16807) % 2147483647) / 2147483647; }

// a broad poppy petal: a fan that widens fast, a rounded crinkled margin, radial pleats, cupped across
function petalGeo(P, NU = 44, NV = 44) {
  const pos = [], uv = [], idx = [], ds = P.len / NV;
  let y = 0, z = 0;
  const width = v => {
    const grow = .12 + .88 * Math.pow(Math.sin(Math.PI / 2 * Math.min(1, v / .62)), .7);
    const tip = v > .62 ? Math.sqrt(Math.max(0, 1 - ((v - .62) / .38) ** 2.2)) : 1;
    return P.wid * grow * (.2 + .8 * tip);
  };
  for (let j = 0; j <= NV; j++) {
    const v = j / NV, th = (P.a0 + (P.a1 - P.a0) * Math.pow(v, 1.15)) * D2R;
    const ny = -Math.sin(th), nz = Math.cos(th), w = width(v);
    for (let i = 0; i <= NU; i++) {
      const u = i / NU * 2 - 1, au = Math.abs(u);
      let off = -P.cup * u * u * w;
      // radial pleats that deepen toward the rim, and a crinkled, waving margin
      off += P.pleat * Math.sin(u * P.np + P.seed) * smooth(.15, .9, v) * w;
      off += P.ruffle * (Math.sin(u * 9 + P.seed * 1.3 + v * 3) + .6 * Math.sin(u * 17 - P.seed)) * Math.pow(au, 1.4) * smooth(.4, 1, v);
      off += P.ruffle * .9 * Math.sin(u * 13 + P.seed * 2.1) * smooth(.8, 1, v);
      pos.push(u * w, y + ny * off, z + nz * off);
      uv.push((u + 1) / 2, v);
    }
    y += Math.cos(th) * ds; z += Math.sin(th) * ds;
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + NU + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function buildPoppy() {
  const boost = { value: 0 }, rnd = rng(3);
  const plant = new THREE.Group(), head = new THREE.Group();
  plant.add(head);
  head.position.set(.1, 1.7, 0);
  head.rotation.set(.92, 0, .28);                  // the cup opens up and toward the viewer, a little to the left, as in the reference
  const petals = [];
  // two rings of three, the inner ring standing a little more upright
  for (let k = 0; k < 6; k++) {
    const inner = k % 2 === 1, az = k / 6 * TAU + (rnd() - .5) * .25, seed = k * 2.3 + 1;
    const P = { len: (inner ? 1.0 : 1.12) * (.95 + rnd() * .1), wid: inner ? .62 : .7, a0: inner ? 22 : 32, a1: inner ? 58 : 76,
      cup: .38, pleat: .035, np: 7 + rnd() * 3, ruffle: .05, seed };
    const mat = glassMat({ body: 0xe2cff4, edge: 0xb898e4, deep: 0x8a64c0, rimC: 0xa684d6, a: .24, edgeA: .5, fresP: 2,
      ribs: 16, ribA: .06, rim: .03, baseK: .4, spec: 1.35, iri: .35, boost, seed });
    const g = petalGeo(P); g.computeBoundingBox(); const mid = g.boundingBox.getCenter(new V3()); g.translate(-mid.x, -mid.y, -mid.z);
    const azG = new THREE.Group(); azG.rotation.y = az; head.add(azG);
    const seat = new THREE.Group(); seat.position.set(0, inner ? .02 : 0, .05); azG.add(seat);
    const tilt = new THREE.Group(); seat.add(tilt);
    const m = new THREE.Mesh(g, mat); m.position.copy(mid); tilt.add(m);
    petals.push({ az, tilt, a: 0, v: 0, amp: .03, push: .1, k: 26, c: 3.6, ph: seed, freq: 1.5 + k * .17 });
  }
  // the heart: a dark plum boss, a spray of fine filaments, tiny silver-pearl anthers
  const plum = glassMat({ body: 0x5a3270, edge: 0x3c1c50, deep: 0x2a1038, rimC: 0xc8a8e0, a: .85, edgeA: .15, fresP: 1.5, spec: 1.2, boost, side: THREE.FrontSide });
  const boss = new THREE.Mesh(new THREE.SphereGeometry(.11, 28, 18), plum); boss.scale.y = .7; boss.position.y = .06; head.add(boss);
  const filMat = glassMat({ body: 0xd8c4f0, edge: 0xa688d6, deep: 0x7e5cb0, rimC: 0xffffff, a: .55, edgeA: .3, fresP: 1.4, spec: .9, boost, side: THREE.FrontSide });
  const pearl = glassMat({ body: 0xf4f0f8, edge: 0xc8c0d8, deep: 0x9a90b0, rimC: 0xffffff, a: .9, edgeA: .1, fresP: 1.4, spec: 1.6, iri: .5, boost, side: THREE.FrontSide });
  const fils = [], beads = [];
  for (let i = 0; i < 60; i++) {
    const a = rnd() * TAU, r0 = .04 + rnd() * .05, el = (42 + rnd() * 34) * D2R, L = .2 + rnd() * .14;
    const p0 = new V3(Math.cos(a) * r0, .06, Math.sin(a) * r0);
    const dir = new V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    const p2 = p0.clone().addScaledVector(dir, L), p1 = p0.clone().addScaledVector(dir, L * .5).add(new V3(0, .05, 0));
    fils.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0, p1, p2), 10, .0045, 5));
    beads.push(new THREE.SphereGeometry(.014 + rnd() * .008, 12, 8).translate(p2.x, p2.y, p2.z));
  }
  const merge = gs => { const out = new THREE.BufferGeometry(), P = [], Nn = [], U = [], I = []; let o = 0;
    for (const g of gs) { const gi = g.index ? g : null; P.push(...g.attributes.position.array); Nn.push(...g.attributes.normal.array); U.push(...g.attributes.uv.array); for (const x of gi.index.array) I.push(x + o); o += g.attributes.position.count; }
    out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); out.setIndex(I); return out; };
  // fibre optics: the filaments carry light, and their pearl tips glow and twinkle
  const filM = new THREE.Mesh(merge(fils), glowMat(0xd6bcf6, boost, { rate: 2.2, min: .55 })), beadM = new THREE.Mesh(merge(beads), glowMat(0xffd6ee, boost, { rate: 3.1, min: .4 }));
  filM.renderOrder = beadM.renderOrder = 5; boss.renderOrder = 4;
  head.add(filM, beadM);
  // a slender clear lilac glass stem with a gentle curve
  const stemMat = glassMat({ body: 0xe2d4f2, edge: 0xb49ad8, deep: 0x8a6cbc, rimC: 0xffffff, a: .28, edgeA: .5, fresP: 1.6, spec: 1.1, iri: .2, boost, side: THREE.FrontSide });
  head.updateMatrixWorld(true);
  const top = new V3(0, -.02, 0).applyMatrix4(head.matrix);
  const stem = new THREE.CatmullRomCurve3([top, top.clone().add(new V3(.04, -.4, -.08)), new V3(.22, .3, -.06), new V3(.12, -.6, 0), new V3(-.05, -1.5, 0)]);
  plant.add(new THREE.Mesh(new THREE.TubeGeometry(stem, 120, .026, 12), stemMat));
  const cal = new THREE.Mesh(new THREE.SphereGeometry(.07, 20, 14), stemMat); cal.scale.y = .8; cal.position.y = -.02; head.add(cal);
  const pick = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), new THREE.MeshBasicMaterial({ visible: false })); head.add(pick);
  // tech stem: a lilac light channel pulsing up the clear glass, a silver wire wound round it, silver rings
  const silver = metal.silver();
  plant.add(lightChannel(stem, .011, 0xc8a0ff, boost), wire(stem, .04, silver, { turns: 5, thick: .0035, t0: .08, t1: .93, ph: 1 }), rings(stem, .036, silver, [.3, .62]));
  return { plant, head, petals, boost, pick, rx: head.rotation.x, ry: 0, lean: { x: 0, y: 0, vx: 0, vy: 0 }, glow: 0, flash: 0, ph: 2.1, stem: { curve: stem, mat: stemMat, r: .026 } };
}
