/* garden.js: glass flowers built from separate parts, several per page.
   Every part is rigid and hangs from a joint (stem collars, the flower's base, a leaf's stalk).
   - Wind: gusts roll across the page; each part answers in its own rhythm. Petals lift and open in
     the gusts, leaves breathe, stems barely sway.
   - Touch: only the part under the cursor lifts toward you (turns up, foreshortens, catches light).
   - Moving a whole flower (x, y, h, rot) makes its stem lean against the motion and settle. */
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IMPACT = 1.35;   // overall strength of the wind and touch motion
  const FEEL = {
    stem:   { wind: .7,  freq: .45, k: 14, c: 3.2 },
    wire:   { wind: 0,   freq: .5,  k: 40, c: 8 },
    head:   { wind: 1.4, freq: .8,  k: 18, c: 3.4 },
    center: { wind: .4,  freq: 1.2, k: 30, c: 5 },
    petal:  { wind: 2.6, freq: 1.1, k: 26, c: 4.2, touch: 1, liftTurn: 10, breath: .6, shorten: .07 },
    leaf:   { wind: 3.2, freq: .75, k: 16, c: 3,   touch: 1, liftTurn: 15, breath: .25, shorten: .2 },
  };
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const inv = m => { const d = m[0] * m[3] - m[1] * m[2]; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; };
  const about = (px, py, m) => mul([1, 0, 0, 1, px, py], mul(m, [1, 0, 0, 1, -px, -py]));
  const imgCache = {};
  function loadImg(src) {
    return imgCache[src] || (imgCache[src] = new Promise((res, rej) => {
      const im = new Image(); im.onload = () => {
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0);
        res({ img: im, alpha: cx.getImageData(0, 0, im.width, im.height).data });
      }; im.onerror = rej; im.src = src;
    }));
  }

  function Garden(canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    const base = opts.base || '';
    const flowers = [], extras = [];
    let W = 0, H = 0, dpr = 1;

    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      g.onresize && g.onresize(W, H);
    }

    function add(rig, place = {}) {
      const f = Object.assign({ x: 0, y: 0, h: 400, rot: 0, opacity: 1, z: 0, rig, seed: flowers.length * 1.7 }, place);
      f.parts = rig.parts.map((p, i) => {
        const q = Object.assign({ th: 0, w: 0, lift: 0, lv: 0, phase: (i * 2.399 + f.seed) % 6.283 }, FEEL[p.kind] || FEEL.stem, p);
        q.freq *= .85 + ((i * 37) % 30) / 100;          // no two parts share a rhythm
        q.wind *= IMPACT; q.liftTurn = (q.liftTurn || 0) * IMPACT; q.breath = (q.breath || 0) * IMPACT;
        const c = Math.cos(q.rot * Math.PI / 180) * q.s, s = Math.sin(q.rot * Math.PI / 180) * q.s, k = q.sx || 1;
        if (q.src) q.place = [c * k, s * k, -s, c, q.x - (c * k * q.cx - s * q.cy), q.y - (s * k * q.cx + c * q.cy)];
        const tx = q.tip ? q.tip[0] : (q.x ?? q.pivot[0]), ty = q.tip ? q.tip[1] : (q.y ?? q.pivot[1] - 1);
        const dx = tx - q.pivot[0], dy = ty - q.pivot[1], L = Math.hypot(dx, dy) || 1;
        q.axis = [dx / L, dy / L];
        if (q.liftDir == null) q.liftDir = dx < 0 ? 1 : -1;
        return q;
      });
      f.byId = Object.fromEntries(f.parts.map(p => [p.id, p]));
      f.order = f.parts.filter(p => p.src).sort((a, b) => a.z - b.z);
      f.ready = Promise.all(f.order.map(p => loadImg(base + p.src).then(r => { p.img = r.img; p.alpha = r.alpha; }))).then(() => f.loaded = true);
      f.px0 = null; f.pvx = 0; f.acc = 0;
      flowers.push(f); return f;
    }
    // a loose decorative sprite (like the ribbon ring tying a bouquet), drawn above flowers
    function addSprite(src, place) {
      const s = Object.assign({ x: 0, y: 0, w: 40, rot: 0, opacity: 1 }, place);
      loadImg(base + src).then(r => s.img = r.img); extras.push(s); return s;
    }

    function flowerMatrix(f) {
      const s = f.h / f.rig.h, c = Math.cos(f.rot) * s, n = Math.sin(f.rot) * s;
      return mul([c, n, -n, c, f.x, f.y], [1, 0, 0, 1, -f.rig.cx, -f.rig.bottom]);
    }
    function local(p) {
      const c = Math.cos(p.th), s = Math.sin(p.th);
      const fz = 1 - (p.shorten || 0) * p.lift, ax = p.axis[0], ay = p.axis[1];
      const S = [1 + (fz - 1) * ax * ax, (fz - 1) * ax * ay, (fz - 1) * ax * ay, 1 + (fz - 1) * ay * ay, 0, 0];
      return about(p.pivot[0], p.pivot[1], mul([c, s, -s, c, 0, 0], S));
    }
    function solve(f) {
      const F = flowerMatrix(f);
      for (const p of f.parts) p.M = null;
      const get = p => p.M || (p.M = mul(p.parent ? get(f.byId[p.parent]) : F, local(p)));
      f.parts.forEach(get);
    }

    // touch: the top-most part under the pointer, across all flowers
    let hover = null, last = null;
    function hit(x, y) {
      const fl = flowers.filter(f => f.loaded && f.opacity > .5).sort((a, b) => b.z - a.z);
      for (const f of fl) for (let i = f.order.length - 1; i >= 0; i--) {
        const p = f.order[i]; if (!p.touch || !p.M) continue;
        const m = inv(mul(p.M, p.place));
        const ix = Math.round(m[0] * x + m[2] * y + m[4]), iy = Math.round(m[1] * x + m[3] * y + m[5]);
        if (ix < 0 || iy < 0 || ix >= p.img.width || iy >= p.img.height) continue;
        if (p.alpha[(iy * p.img.width + ix) * 4 + 3] > 90) return p;
      }
      return null;
    }
    function onMove(e) {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, t = performance.now();
      let speed = 0; if (last) speed = Math.hypot(x - last.x, y - last.y) / Math.max(8, t - last.t) * 1000;
      last = { x, y, t };
      const p = hit(x, y);
      if (p && p !== hover) p.lv += Math.min(5.5, 1.6 + speed / 500) * p.touch * IMPACT;   // brushing onto a part lifts it
      else if (p) p.lv += Math.min(1.2, speed / 2500) * p.touch;                    // stroking keeps it up a little
      hover = p; canvas.style.cursor = p ? 'pointer' : '';
    }
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('pointerdown', e => { onMove(e); if (hover) hover.lv += 4 * hover.touch; }, { passive: true });
    document.addEventListener('pointerleave', () => { hover = null; last = null; });

    const gust = t => .55 + .3 * Math.sin(t * .21) + .15 * Math.sin(t * .53 + 1.3) + .12 * Math.sin(t * 1.1 + .4);
    const DT = 1 / 120;
    function step(f, t) {
      const g0 = gust(t - f.x * .0012) * (reduce ? .35 : 1);
      for (const p of f.parts) {
        const A = p.wind * Math.PI / 180;
        let target = A * g0 * (Math.sin(t * p.freq + p.phase) * .75 + Math.sin(t * p.freq * 2.3 + p.phase * 1.7) * .25) + A * .5 * (g0 - .55)
          + p.lift * p.liftDir * (p.liftTurn || 0) * Math.PI / 180;
        let push = 0;
        if (!p.parent) push = f.acc;                                    // follow-through when the flower moves
        p.w += ((target - p.th) * p.k - p.w * p.c + push) * DT; p.th += p.w * DT;
        let breathe = 0;
        if (p.breath) {   // gusts roll across, so petals rise one after another, each with its own flutter
          const tt = t - (f.x / (f.h / f.rig.h) + p.pivot[0]) * .0035;
          const wave = Math.pow(Math.max(0, Math.sin(tt * .55 + .3 * Math.sin(tt * .23))), 2.2);
          breathe = p.breath * g0 * (.25 + .75 * wave) * (.7 + .3 * (.5 + .5 * Math.sin(t * p.freq * 1.9 + p.phase * 3)));
        }
        p.lv += ((breathe - p.lift) * 16 - p.lv * 4.2) * DT; p.lift += p.lv * DT;
        if (p.lift > 1.15) { p.lift = 1.15; p.lv = Math.min(p.lv, 0); }
        if (p.lift < -.25) { p.lift = -.25; p.lv = Math.max(p.lv, 0); }
      }
    }

    let acc = 0, prev = performance.now(), t0 = prev;
    function frame(now) {
      const dt = Math.min(.05, (now - prev) / 1000); prev = now;
      const t = (now - t0) / 1000;
      g.onframe && g.onframe(dt, now);
      for (const f of flowers) {      // how hard the flower is being swung sideways right now
        if (f.px0 == null || Math.abs(f.x - f.px0) > f.h * .25) { f.px0 = f.x; f.pvx = 0; }  // placed or resized: no swing
        const vx = (f.x - f.px0) / Math.max(dt, 1e-3) / f.h; f.px0 = f.x;
        f.acc = Math.max(-25, Math.min(25, -(vx - f.pvx) / Math.max(dt, 1e-3) * .9)); f.pvx = vx;
      }
      acc += dt; let n = 0;
      while (acc >= DT && n < 8) { for (const f of flowers) if (f.loaded) step(f, t); acc -= DT; n++; }
      if (n === 8) acc = 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = 'high';
      const D = [dpr, 0, 0, dpr, 0, 0];
      for (const f of flowers) if (f.loaded) f.fade = Math.min(1, (f.fade || 0) + dt / .7);
      for (const f of flowers.filter(f => f.loaded && f.opacity > .003).sort((a, b) => a.z - b.z)) {
        solve(f);
        const op = f.opacity * f.fade * f.fade * (3 - 2 * f.fade);
        for (const p of f.order) {
          const m = mul(D, mul(p.M, p.place));
          ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = op;
          ctx.drawImage(p.img, 0, 0);
          if (p.lift > .04) {                               // a lifted part catches the light
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = op * Math.min(.22, p.lift * .2);
            ctx.drawImage(p.img, 0, 0);
          }
        }
      }
      for (const s of extras) if (s.img && s.opacity > .003) {
        const k = s.w / s.img.width, c = Math.cos(s.rot) * k * dpr, n = Math.sin(s.rot) * k * dpr;
        ctx.setTransform(c, n, -n, c, s.x * dpr, s.y * dpr);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = s.opacity;
        ctx.drawImage(s.img, -s.img.width / 2, -s.img.height / 2);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      requestAnimationFrame(frame);
    }

    const g = { add, addSprite, flowers, onframe: null, onresize: null,
      get width() { return W; }, get height() { return H; },
      // put a flower so that point L (in its own picture space) lands on screen point (sx, sy)
      pin(f, L, sx, sy) {
        const s = f.h / f.rig.h, c = Math.cos(f.rot) * s, n = Math.sin(f.rot) * s;
        const lx = L[0] - f.rig.cx, ly = L[1] - f.rig.bottom;
        return { x: sx - (c * lx - n * ly), y: sy - (n * lx + c * ly) };
      } };
    addEventListener('resize', resize);
    requestAnimationFrame(() => { resize(); requestAnimationFrame(frame); });
    return g;
  }
  window.GlassGarden = Garden;
})();
