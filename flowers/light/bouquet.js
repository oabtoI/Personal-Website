// A hand-tied bouquet of the light-mode flowers: ranunculus, lilac poppy and hibiscus.
// Each flower is the same model (and the same rig) as on its own; here every plant hangs from a pivot at the tie,
// so the stems gather to one point and the blooms fan out above it, each at its own height.
import * as THREE from 'three';
import { buildRanunculus } from './ranunculus.js?v=2';
import { buildPoppy } from './poppy.js?v=2';
import { buildHibiscus } from './hibiscus.js?v=2';

const V3 = THREE.Vector3;

export function buildBouquet() {
  const plant = new THREE.Group(), flowers = [];
  const TIE = new V3(0, -.9, 0);   // where the stems gather
  // A real hand-tied bouquet is a dome: stems fan out from the tie in every direction, and each bloom faces outward
  // and up along its own stem — so it reads naturally from any side, not just the front.
  //   phi: which way around the bouquet the stem leans (0 = toward the front), alpha: how far it leans out,
  //   face: how much the bloom turns out past its stem, twist: a spin about its own stem so no two sit alike,
  //   foot/below: where that stem ends and how much of it passes the tie (sets each bloom's height).
  const place = (F, o) => {
    const pivot = new THREE.Group(); pivot.position.copy(TIE); pivot.rotation.set(o.alpha, o.phi, 0, 'YXZ'); pivot.scale.setScalar(o.scale);
    const hang = new THREE.Group(); hang.position.set(0, -(o.foot + o.below), 0); hang.rotation.y = o.twist ?? 0; hang.add(F.plant);
    F.rx = o.face; F.head.rotation.x = o.face;   // the rig sways around this rest pose
    pivot.add(hang); plant.add(pivot); flowers.push(F);
  };
  // three blooms in a loose fan, all turned toward the viewer so each one reads clearly, at three different heights
  place(buildRanunculus(), { phi: 0, alpha: .06, face: .4, twist: 0, foot: -1.4, below: -.45, scale: .86 });       // tallest, in the middle
  place(buildHibiscus(), { phi: .85, alpha: .5, face: .35, twist: -.75, foot: -1.7, below: .25, scale: .84 });   // out to the right, a little lower
  place(buildPoppy(), { phi: -.7, alpha: .5, face: .2, twist: 1.25, foot: -1.5, below: .8, scale: .86 });     // out to the left, lowest
  return { plant, flowers };
}
