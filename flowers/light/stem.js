// A stem for the plump, polished flowers: a smooth tube curving down from under the bloom, with one or two
// inflated leaves (thick, rounded, the same pillow construction as the petals), all in the given material.
import * as THREE from 'three';
import { petalGeo } from './lavender.js';

const V3 = THREE.Vector3;

// Carry a flower's stem on past its foot, straight down (in the world, as the flower is placed now), so it runs off
// the bottom of the screen instead of ending in view. Call it after the flower is placed and any framing is measured.
// The path a stem takes on from its foot: it carries on the way it was heading and only slowly gives in to gravity,
// with a faint lazy waver, so there's no corner where the drawn stem stops and the continuation begins.
export function tailCurve(foot, dir, down, len = 40, seed = 0) {
  const p = foot.clone(), d = dir.clone().normalize(), pts = [p.clone()];
  const side = new V3().crossVectors(down, new V3(0, 0, 1)).normalize();
  for (let s = 0, step = .1; s < len; s += step) {
    d.lerp(down, .01 + .025 * Math.min(1, s / 5)).addScaledVector(side, Math.sin(s * .8 + seed) * .003).normalize();
    p.addScaledVector(d, step); pts.push(p.clone());
    if (s > 4) step = .4;   // far below the screen, coarser is fine
  }
  return new THREE.CatmullRomCurve3(pts);
}
export function addTail(F, len = 40) {
  const { curve, mat, r } = F.stem;
  F.plant.updateWorldMatrix(true, false);
  const down = new V3(0, -1, 0).applyQuaternion(F.plant.getWorldQuaternion(new THREE.Quaternion()).invert());
  const path = tailCurve(curve.getPointAt(1), curve.getTangentAt(1), down, len, F.ph ?? 0);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(path, 420, r, 16), mat);
  F.plant.add(tail);
  return tail;
}
export function plumpStem(plant, head, mat, o = {}) {
  head.updateMatrixWorld(true);
  const top = new V3(0, -.05, 0).applyMatrix4(head.matrix);
  const foot = o.foot ?? -1.6, sway = o.sway ?? .14;
  const curve = new THREE.CatmullRomCurve3([
    top, top.clone().add(new V3(.02, -.3, -.1)),
    new V3(sway, top.y + (foot - top.y) * .4, -.06), new V3(-sway * .5, top.y + (foot - top.y) * .72, 0), new V3(0, foot, 0),
  ]);
  const TS = 140, RS = 18, tg = new THREE.TubeGeometry(curve, TS, o.r ?? .05, RS);
  // optional taper: slimmer under the bloom, fuller at the foot
  if (o.taper) {
    const pa = tg.attributes.position, c = new V3(), q = new V3();
    for (let i = 0; i <= TS; i++) {
      curve.getPointAt(i / TS, c); const k = 1 - o.taper * (1 - i / TS);
      for (let j = 0; j <= RS; j++) { const n = i * (RS + 1) + j; q.fromBufferAttribute(pa, n).sub(c).multiplyScalar(k).add(c); pa.setXYZ(n, q.x, q.y, q.z); }
    }
    tg.computeVertexNormals();
  }
  const tube = new THREE.Mesh(tg, mat);
  plant.add(tube);
  const leaves = [];
  for (const L of o.leaves ?? [{ at: .55, side: 1 }]) {
    const p = curve.getPointAt(L.at), tan = curve.getTangentAt(L.at);
    const g = o.leafGeo ? o.leafGeo(L) : petalGeo({ len: L.len ?? .78, wid: L.wid ?? .26, a0: 8, a1: 34, cup: .3, wave: .02, thick: .055, seed: L.at * 9 }, 28, 32);
    const leaf = new THREE.Mesh(g, o.leafMat ?? mat);
    // the leaf grows out of the stem, angled up and away to one side
    const pivot = new THREE.Group(); pivot.position.copy(p);
    pivot.quaternion.setFromUnitVectors(new V3(0, 1, 0), tan.clone().negate());
    // swing the leaf out to one side in the plane facing the viewer, so its face (not its edge) shows; a little lift toward the front
    const turn = new THREE.Group(); turn.rotation.z = -Math.sign(L.side) * (L.spread ?? .95); pivot.add(turn);
    const lift = new THREE.Group(); lift.rotation.x = L.lift ?? .15; turn.add(lift); lift.add(leaf);
    if (o.leafDeco) lift.add(o.leafDeco(L, g));
    plant.add(pivot);
    // a node where the leaf joins: a small swelling ringed in the accent material
    if (o.nodeMat) {
      const r = (o.r ?? .05) * (o.taper ? 1 - o.taper * (1 - L.at) : 1);
      const node = new THREE.Group(); node.position.copy(p); node.quaternion.setFromUnitVectors(new V3(0, 1, 0), tan);
      const bulge = new THREE.Mesh(new THREE.SphereGeometry(r * 1.35, 20, 14), mat); bulge.scale.y = 1.6; node.add(bulge);
      for (const dy of [-r * 1.5, r * 1.5]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.12, r * .2, 8, 28), o.nodeMat); ring.rotation.x = Math.PI / 2; ring.position.y = dy; node.add(ring); }
      plant.add(node);
    }
    leaves.push(lift);
  }
  return { tube, leaves, curve };
}
