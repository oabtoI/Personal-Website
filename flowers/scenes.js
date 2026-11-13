/* scenes.js: loads the glass flowers (each cut from its original picture) and arranges them.
   - bouquet: the bouquet picture itself, in moving pieces
   - garden:  the rose, lily and camellia standing side by side
   - for the unravel: where each single flower sits over its twin inside the bouquet */
(function () {
  const NAMES = ['rose', 'lily', 'camellia'];
  // in the bouquet picture: head centre, head width, and how far the stem leans
  const IN_BQ = {
    rose:     { head: [270, 565], w: 500, rot: -.28, z: 3 },
    lily:     { head: [620, 300], w: 730, rot: .19,  z: 1 },
    camellia: { head: [700, 780], w: 570, rot: .5,   z: 2 },
  };
  // in each single picture: head centre and head width
  const OWN = { rose: { head: [510, 330], w: 970 }, lily: { head: [520, 400], w: 1000 }, camellia: { head: [510, 420], w: 1000 } };
  const rig = n => fetch(`${n}/rig.json`).then(r => r.json());

  async function loadFlowers(g, opts = {}) {
    const rigs = await Promise.all(NAMES.map(rig));
    return Object.fromEntries(NAMES.map((n, i) => [n, g.add(rigs[i], { z: IN_BQ[n].z, opacity: opts.hidden ? 0 : 1 })]));
  }
  async function loadBouquet(g) { return g.add(await rig('bouquet'), { z: 10 }); }

  function placeBouquet(W, H) {
    const h = Math.min(H * .88, W * 1.3);
    return { x: W / 2, y: H / 2 + h / 2 + H * .02, h, rot: 0 };
  }
  function placeGarden(W, H) {
    const h = Math.min(H * .8, W / 3 / .6), gap = Math.min(W / 3, h * .62), res = {};
    NAMES.forEach((n, i) => res[n] = { x: W / 2 + (i - 1) * gap, y: H / 2 + h / 2 + H * .03, h, rot: 0 });
    return res;
  }
  // each single flower laid exactly over its twin inside the bouquet
  function placeInBouquet(g, F, B) {
    const s = B.h / 1536, res = {};
    for (const n of NAMES) {
      const b = IN_BQ[n], o = OWN[n], f = F[n];
      const sx = B.x + (b.head[0] - 500) * s, sy = B.y + (b.head[1] - 1508) * s;
      const tmp = { h: B.h * b.w / o.w, rot: b.rot, rig: f.rig };
      const p = g.pin(tmp, o.head, sx, sy);
      res[n] = { x: p.x, y: p.y, h: tmp.h, rot: b.rot };
    }
    return res;
  }
  window.Scenes = { NAMES, loadFlowers, loadBouquet, placeBouquet, placeGarden, placeInBouquet };
})();
