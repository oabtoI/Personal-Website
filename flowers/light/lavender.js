// Lavender iridescent glass flower, after the Midjourney reference: a semi-double bloom of thick, gracefully rounded,
// spoon-shaped glass petals in clear lavender — deep violet where the glass is thickest at the rims, a rainbow
// thin-film sheen through the bodies — around a warm golden tuft of stamens, on a smooth greenish-gold glass stem.
// Same rig as the other flowers.
import * as THREE from 'three';
import { glassMat } from './glass.js';

const V3 = THREE.Vector3, D2R = Math.PI / 180, GOLD = 137.508 * D2R, TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rng(seed) { let a = seed * 9973 + 7; return () => (a = (a * 16807) % 2147483647) / 2147483647; }

// a thick rounded petal, made as a closed "pillow": a front and a back sheet that meet at a rounded rim,
// so it has real thickness — the glass reads deep at the rim and clear across the middle
export function petalGeo(P, NU = 32, NV = 36) {
  const pos = [], uv = [], idx = [], ds = P.len / NV, spine = [];
  let y = 0, z = 0;
  for (let j = 0; j <= NV; j++) {
    const v = j / NV, th = (P.a0 + (P.a1 - P.a0) * Math.pow(v, 1.6)) * D2R;
    spine.push([y, z, -Math.sin(th), Math.cos(th)]);
    y += Math.cos(th) * ds; z += Math.sin(th) * ds;
  }
  const width = v => {
    const grow = .18 + .82 * Math.pow(Math.sin(Math.PI / 2 * Math.min(1, v / .6)), .75);
    const tip = v > .6 ? Math.sqrt(Math.max(0, 1 - ((v - .6) / .4) ** 2.6)) : 1;
    return P.wid * grow * (.12 + .88 * tip);
  };
  for (const side of [1, -1]) {
    for (let j = 0; j <= NV; j++) {
      const v = j / NV, [sy, sz, ny, nz] = spine[j], w = width(v);
      for (let i = 0; i <= NU; i++) {
        const u = i / NU * 2 - 1;
        // a deep spoon: the edges lift toward the centre; a little wave along the margin
        let off = -P.cup * u * u * w + P.wave * Math.sin(u * 5 + P.seed) * smooth(.5, 1, v) * Math.abs(u);
        // thickness: fullest in the middle, closing to a rounded rim at the edges and tip
        const th = P.thick * Math.sqrt(Math.max(0, 1 - u * u)) * Math.sqrt(Math.max(0, 1 - Math.pow(v, 6))) * (.5 + .5 * smooth(0, .25, v));
        off += side * th;
        pos.push(u * w, sy + ny * off, sz + nz * off);
        uv.push((u + 1) / 2, v);
      }
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

export function buildLavender() {
  const boost = { value: 0 }, rnd = rng(11);
  const plant = new THREE.Group(), head = new THREE.Group();
  plant.add(head);
  head.position.set(-.05, 1.55, 0);
  head.rotation.set(.98, 0, -.16);              // seen from the side and a little above, turning to the right, as in the reference
  const petals = [], N = 22;
  for (let k = 0; k < N; k++) {
    const t = .14 + .86 * k / (N - 1), seed = k * 1.9 + .5;
    const P = {
      len: (.42 + .6 * Math.pow(t, .8)) * (.92 + .16 * rnd()),
      wid: .3 + .26 * Math.pow(t, .8),
      a0: 14 + 56 * Math.pow(t, 1.1), a1: 4 + 90 * Math.pow(t, 1.2),
      cup: .72 - .3 * t, wave: .02 + .02 * t, thick: .038 + .014 * t, seed,
    };
    const mat = glassMat({ body: 0xd6bff4, edge: 0x8a5cd8, deep: 0x5e30b0, rimC: 0xf0e6ff, a: .15 + .06 * (1 - t), edgeA: .7, fresP: 1.5,
      rim: 0, baseK: .25, spec: 1.3, iri: .7, boost, seed, side: THREE.FrontSide });
    const g = petalGeo(P); g.computeBoundingBox(); const mid = g.boundingBox.getCenter(new V3()); g.translate(-mid.x, -mid.y, -mid.z);
    const az = new THREE.Group(); az.rotation.y = k * GOLD; head.add(az);
    const seat = new THREE.Group(); seat.position.set(0, .06 * (1 - t), .05 + .07 * t); az.add(seat);
    const tilt = new THREE.Group(); seat.add(tilt);
    const m = new THREE.Mesh(g, mat); m.position.copy(mid); tilt.add(m);
    petals.push({ az: k * GOLD, tilt, a: 0, v: 0, amp: .02 + .02 * t, push: .05 + .07 * t, k: 30 + 16 * (1 - t), c: 4, ph: seed, freq: 1.5 + (k % 4) * .3 });
  }
  // the golden heart: a tuft of short amber filaments with gold anthers, glowing warm through the petals
  const amber = glassMat({ body: 0xf2b45a, edge: 0xd08024, deep: 0x9a5414, rimC: 0xfff0c8, a: .7, edgeA: .3, fresP: 1.4, spec: 1.3, boost, side: THREE.FrontSide });
  const fil = [];
  for (let i = 0; i < 70; i++) {
    const a = rnd() * TAU, r0 = Math.sqrt(rnd()) * .1, el = (50 + rnd() * 34) * D2R, L = .13 + rnd() * .12;
    const p0 = new V3(Math.cos(a) * r0, .02, Math.sin(a) * r0), dir = new V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    const p1 = p0.clone().addScaledVector(dir, L);
    fil.push(new THREE.TubeGeometry(new THREE.LineCurve3(p0, p1), 2, .006, 5));
    fil.push(new THREE.SphereGeometry(.016 + rnd() * .006, 10, 8).scale(1, 1.4, 1).translate(p1.x, p1.y, p1.z));
  }
  const merge = gs => { const out = new THREE.BufferGeometry(), P = [], Nn = [], U = [], I = []; let o = 0;
    for (const g of gs) { P.push(...g.attributes.position.array); Nn.push(...g.attributes.normal.array); U.push(...g.attributes.uv.array); for (const x of g.index.array) I.push(x + o); o += g.attributes.position.count; }
    out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); out.setIndex(I); return out; };
  const tuft = new THREE.Mesh(merge(fil), amber); tuft.renderOrder = 10; head.add(tuft);   // drawn after the petals: the gold glows through the glass
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,214,140,.55)'); gr.addColorStop(.5, 'rgba(255,190,120,.15)'); gr.addColorStop(1, 'rgba(255,190,120,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.premultiplyAlpha = true; return t; })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, premultipliedAlpha: true }));
  glow.scale.setScalar(.9); glow.position.y = .12; glow.renderOrder = 11; head.add(glow);
  // a smooth greenish-gold glass stem
  const stemMat = glassMat({ body: 0xa8a84a, edge: 0x7a8030, deep: 0x4e5a18, rimC: 0xf4f0c0, a: .5, edgeA: .45, fresP: 1.6, spec: 1.2, iri: .15, boost, side: THREE.FrontSide });
  head.updateMatrixWorld(true);
  const top = new V3(0, -.04, 0).applyMatrix4(head.matrix);
  const stem = new THREE.CatmullRomCurve3([top, top.clone().add(new V3(-.03, -.35, -.1)), new V3(-.12, .5, -.08), new V3(-.04, -.4, 0), new V3(.04, -1.5, 0)]);
  plant.add(new THREE.Mesh(new THREE.TubeGeometry(stem, 120, .036, 14), stemMat));
  const cal = new THREE.Mesh(new THREE.SphereGeometry(.085, 20, 14), stemMat); cal.scale.y = .8; cal.position.y = -.03; head.add(cal);
  const pick = new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 8), new THREE.MeshBasicMaterial({ visible: false })); head.add(pick);
  return { plant, head, petals, boost, pick, rx: head.rotation.x, ry: 0, lean: { x: 0, y: 0, vx: 0, vy: 0 }, glow: 0, flash: 0, ph: .7 };
}
