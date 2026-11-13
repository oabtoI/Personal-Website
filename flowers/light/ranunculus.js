// Pink glass ranunculus, after the reference: ~44 thin rounded glass petals in a spiral — a tight cup of
// small petals at the heart, upright cupped petals around it, broad open outer petals with a soft droop and
// ruffle — fine ribs along every petal, bright glass margins, and a smooth green glass stem.
// Returns the same kind of rig the site's flowers use: petal pivots that spring in the cursor's wind,
// a head that leans, a boost for hover glow and click.
import * as THREE from 'three';
import { glassMat } from './glass.js';
import { bulb, lightChannel, wire, rings, metal } from './tech.js';

const V3 = THREE.Vector3, D2R = Math.PI / 180, GOLD = 137.508 * D2R;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// one petal: base at the origin, it grows up (+y) and leans outward (+z) by a0 at the base to a1 at the tip
function petalGeo(P, NU = 30, NV = 40) {
  const pos = [], uv = [], idx = [], ds = P.len / NV;
  let y = 0, z = 0;
  const width = v => {
    const grow = .2 + .8 * Math.pow(Math.sin(Math.PI / 2 * Math.min(1, v / .68)), .8);
    const tip = v > .7 ? Math.sqrt(Math.max(0, 1 - ((v - .7) / .3) ** 2)) : 1;
    return P.wid * grow * (.15 + .85 * tip);
  };
  for (let j = 0; j <= NV; j++) {
    const v = j / NV, th = (P.a0 + (P.a1 - P.a0) * Math.pow(v, P.ap ?? 1.3)) * D2R;
    const ny = -Math.sin(th), nz = Math.cos(th), w = width(v);
    for (let i = 0; i <= NU; i++) {
      const u = i / NU * 2 - 1;
      // cupped across (edges curl toward the centre), a ruffle growing toward the margin
      const off = -P.cup * u * u * w + P.ruffle * Math.sin(u * P.rf + v * 5 + P.seed) * u * u * smooth(.35, 1, v)
        + P.ruffle * .7 * Math.sin(u * P.rf * 1.9 + P.seed * 2) * smooth(.75, 1, v);
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

export function buildRanunculus() {
  const boost = { value: 0 };
  const plant = new THREE.Group(), head = new THREE.Group();
  plant.add(head);
  head.position.set(0, 1.55, 0);
  head.rotation.x = .95;                       // the bloom turned up toward the viewer, as in the reference
  const petals = [], N = 38;
  for (let k = 0; k < N; k++) {
    const t = k / (N - 1), seed = k * 1.7;
    const P = {
      len: (.3 + .88 * Math.pow(t, .75)) * (.94 + .12 * Math.sin(k * 2.3)),
      wid: .26 + .52 * Math.pow(t, .9),
      a0: -6 + 72 * Math.pow(t, 1.3), a1: -34 + 122 * Math.pow(t, 1.5), ap: 1.2,
      cup: .95 - .62 * t, ruffle: .015 + .045 * t, rf: 7 + 3 * Math.sin(k), seed,
    };
    // inner petals are deeper rose and a touch denser; outer ones paler and clearer
    const mat = glassMat({
      body: t < .35 ? 0xf09cbe : 0xf6b8d2, edge: 0xe27aa8, deep: 0xbf3f76, rimC: 0xfde6f0,
      a: .24 + .1 * (1 - t), edgeA: .45, fresP: 2, ribs: Math.round(10 + 14 * t), ribA: .16, rim: .06, baseK: .55,
      spec: 1.25, boost, seed,
    });
    const az = new THREE.Group(); az.rotation.y = k * GOLD; head.add(az);
    const seat = new THREE.Group(); seat.position.set(0, .1 * (1 - t), .03 + .1 * t); az.add(seat);
    const tilt = new THREE.Group(); seat.add(tilt);
    // each petal's origin sits at its middle, so three sorts the transparent petals back to front by where they really are
    const g = petalGeo(P); g.computeBoundingBox(); const mid = g.boundingBox.getCenter(new V3()); g.translate(-mid.x, -mid.y, -mid.z);
    const m = new THREE.Mesh(g, mat); m.position.copy(mid); tilt.add(m);
    petals.push({ az: k * GOLD, tilt, a: 0, v: 0, amp: .02 + .03 * t, push: .04 + .07 * t, k: 30 + 20 * (1 - t), c: 4, ph: seed, freq: 1.6 + (k % 5) * .3 });
  }
  // a small green glass receptacle under the bloom, and the stem
  const green = glassMat({ body: 0x86c06a, edge: 0x5c9a44, deep: 0x3c7a2c, rimC: 0xe2f6d4, a: .42, edgeA: .45, fresP: 1.6, spec: 1.1, boost, side: THREE.FrontSide });
  const rec = new THREE.Mesh(new THREE.SphereGeometry(.09, 24, 16), green); rec.scale.y = .8; rec.position.y = -.02; head.add(rec);
  head.updateMatrixWorld(true);
  const top = new V3(0, -.06, 0).applyMatrix4(head.matrix);
  const stem = new THREE.CatmullRomCurve3([top, top.clone().add(new V3(.02, -.35, -.12)), new V3(.06, .6, -.1), new V3(-.02, -.3, 0), new V3(0, -1.4, 0)]);
  const sm = new THREE.Mesh(new THREE.TubeGeometry(stem, 120, .042, 16), green); plant.add(sm);
  const pick = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), new THREE.MeshBasicMaterial({ visible: false })); head.add(pick);
  // tech, after the dark-mode lily: an Edison bulb blooming from the heart, a light channel pulsing up the glass stem,
  // a fine silver wire spiralling round it, and silver knuckle rings
  const silver = metal.silver();
  const B = bulb(2.3, boost); B.group.position.y = .04; head.add(B.group);
  plant.add(lightChannel(stem, .014, 0xff9cc8, boost), wire(stem, .052, silver, { turns: 4, thick: .0042, t0: .1, t1: .92 }), rings(stem, .047, silver, [.34, .66]));
  const F = { plant, head, petals, boost, pick, rx: head.rotation.x, ry: 0, lean: { x: 0, y: 0, vx: 0, vy: 0 }, glow: 0, flash: 0, ph: 1.3, stem: { curve: stem, mat: green, r: .042 } };
  F.tick = t => B.tick(t, F.glow);
  return F;
}
