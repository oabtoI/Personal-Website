/* petals.js: a flower built from separate glass parts.
   Every part is rigid and hangs from a joint (stem collars, the stamen, a leaf's base). Wind gives
   each part its own sway, and a part you touch lifts toward you (it rotates up and foreshortens),
   catches the light, then settles back. Nothing bends or stretches. */
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function Flower(canvas, rig, opts = {}) {
    const ctx = canvas.getContext('2d');
    const parts = rig.parts.map(p => Object.assign({ th: 0, w: 0, lift: 0, lv: 0, kick: 0, phase: Math.random() * 6.28 }, p));
    const byId = Object.fromEntries(parts.map(p => [p.id, p]));
    const order = parts.slice().sort((a, b) => a.z - b.z);
    let W = 0, H = 0, dpr = 1, view = { s: 1, x: 0, y: 0 };

    // load images and keep a small alpha copy of each for hit-testing
    const loads = parts.map(p => new Promise(res => {
      const im = new Image(); im.onload = () => {
        p.img = im;
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0);
        p.alpha = cx.getImageData(0, 0, im.width, im.height).data;
        res();
      }; im.src = p.src;
    }));

    // rest placement: image px -> flower space
    for (const p of parts) {
      const c = Math.cos(p.rot * Math.PI / 180) * p.s, s = Math.sin(p.rot * Math.PI / 180) * p.s, k = p.sx || 1;
      p.place = [c * k, s * k, -s, c, p.x - (c * k * p.cx - s * p.cy), p.y - (s * k * p.cx + c * p.cy)];
      // the direction the part points away from its joint, for lifting
      const tx = p.tip ? p.tip[0] : p.x, ty = p.tip ? p.tip[1] : p.y;
      const dx = tx - p.pivot[0], dy = ty - p.pivot[1], L = Math.hypot(dx, dy) || 1;
      p.axis = [dx / L, dy / L];
      if (p.liftDir == null) p.liftDir = dx < 0 ? 1 : -1;   // which way lifting turns this part
    }

    const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    const inv = m => { const d = m[0] * m[3] - m[1] * m[2]; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; };
    const about = (px, py, m) => mul([1, 0, 0, 1, px, py], mul(m, [1, 0, 0, 1, -px, -py]));

    function local(p) {
      // rotate about the joint, and foreshorten along the part's own length when it lifts
      const c = Math.cos(p.th), s = Math.sin(p.th);
      const f = 1 - (p.shorten ?? .2) * p.lift, ax = p.axis[0], ay = p.axis[1];
      const S = [1 + (f - 1) * ax * ax, (f - 1) * ax * ay, (f - 1) * ax * ay, 1 + (f - 1) * ay * ay, 0, 0];
      return about(p.pivot[0], p.pivot[1], mul([c, s, -s, c, 0, 0], S));
    }
    function solve() {
      for (const p of parts) p.M = null;
      const get = p => {
        if (p.M) return p.M;
        const parent = p.parent ? get(byId[p.parent]) : [1, 0, 0, 1, 0, 0];
        return p.M = mul(parent, local(p));
      };
      parts.forEach(get);
    }

    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      const fit = opts.fit ? opts.fit(W, H) : { h: H * .9, cx: W / 2, bottom: H * .96 };
      view.s = fit.h / rig.h; view.x = fit.cx - rig.cx * view.s; view.y = fit.bottom - rig.bottom * view.s;
    }
    resize(); addEventListener('resize', resize);

    // touching: find the top-most part under the pointer
    let hover = null, last = null;
    function hit(x, y) {
      const fx = (x - view.x) / view.s, fy = (y - view.y) / view.s;
      for (let i = order.length - 1; i >= 0; i--) {
        const p = order[i]; if (!p.alpha || !p.touch) continue;
        const m = inv(mul(p.M, p.place));
        const ix = Math.round(m[0] * fx + m[2] * fy + m[4]), iy = Math.round(m[1] * fx + m[3] * fy + m[5]);
        if (ix < 0 || iy < 0 || ix >= p.img.width || iy >= p.img.height) continue;
        if (p.alpha[(iy * p.img.width + ix) * 4 + 3] > 90) return p;
      }
      return null;
    }
    function onMove(e) {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, t = performance.now();
      let speed = 0;
      if (last) speed = Math.hypot(x - last.x, y - last.y) / Math.max(8, t - last.t) * 1000;
      last = { x, y, t };
      const p = hit(x, y);
      if (p && p !== hover) p.lv += Math.min(5.5, 1.6 + speed / 500) * p.touch;   // brushing onto a part lifts it
      else if (p) p.lv += Math.min(1.2, speed / 2500) * p.touch;                    // stroking it keeps it up a little
      hover = p; canvas.style.cursor = p ? 'pointer' : '';
    }
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('pointerdown', e => { onMove(e); if (hover) hover.lv += 4 * hover.touch; }, { passive: true });
    document.addEventListener('pointerleave', () => { hover = null; last = null; });

    // wind: a slow gust envelope; each part answers with its own rhythm
    const gust = t => .55 + .3 * Math.sin(t * .21) + .15 * Math.sin(t * .53 + 1.3) + .12 * Math.sin(t * 1.1 + .4);
    const DT = 1 / 120;
    function step(t) {
      const g = gust(t) * (reduce ? .35 : 1);
      for (const p of parts) {
        const A = p.wind * Math.PI / 180;
        const target = A * g * (Math.sin(t * p.freq + p.phase) * .75 + Math.sin(t * p.freq * 2.3 + p.phase * 1.7) * .25) + A * .5 * (g - .55)
          + p.lift * p.liftDir * (p.liftTurn || 0) * Math.PI / 180;
        p.w += ((target - p.th) * p.k - p.w * p.c) * DT; p.th += p.w * DT;
        // lift is its own spring: 0 at rest, ~1 fully raised; a soft overshoot then settle
        // gusts roll across the flower from left to right, so petals rise one after another,
        // each with its own small flutter on top
        let breathe = 0;
        if (p.breath) {
          const tt = t - p.pivot[0] * .0035;
          const wave = Math.pow(Math.max(0, Math.sin(tt * .55 + .3 * Math.sin(tt * .23))), 2.2);
          const flutter = .5 + .5 * Math.sin(t * p.freq * 1.9 + p.phase * 3);
          breathe = p.breath * g * (.25 + .75 * wave) * (.7 + .3 * flutter);
        }
        p.lv += ((breathe - p.lift) * 16 - p.lv * 4.2) * DT; p.lift += p.lv * DT;
        if (p.lift > 1.15) { p.lift = 1.15; p.lv = Math.min(p.lv, 0); }
        if (p.lift < -.25) { p.lift = -.25; p.lv = Math.max(p.lv, 0); }
      }
    }

    let acc = 0, prev = performance.now(), t0 = prev, ready = false;
    Promise.all(loads).then(() => { ready = true; opts.onready && opts.onready(); });
    function frame(now) {
      const dt = Math.min(.05, (now - prev) / 1000); prev = now;
      const t = (now - t0) / 1000;
      acc += dt; let n = 0; while (acc >= DT && n < 8) { step(t); acc -= DT; n++; } if (n === 8) acc = 0;
      solve();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (ready) {
        const V = [view.s * dpr, 0, 0, view.s * dpr, view.x * dpr, view.y * dpr];
        ctx.imageSmoothingQuality = 'high';
        for (const p of order) {
          const m = mul(V, mul(p.M, p.place));
          ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(p.img, 0, 0);
          if (p.lift > .04) {                                    // a lifted part catches the light
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(.22, p.lift * .2);
            ctx.drawImage(p.img, 0, 0);
          }
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return { parts, byId };
  }
  window.GlassFlower = Flower;
})();
