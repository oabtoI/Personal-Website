/* flora.js: soft, cursor-reactive flowers drawn with WebGL2.
   Each flower is a cut-out image laid on a grid mesh. Every grid point is a damped spring, so
   brushing the cursor through a petal or leaf drags it softly and it settles back on its own.
   The whole stem also bends from its base (idle breeze + cursor push + follow-through when moved). */
(function () {
  const VS = `#version 300 es
  in vec2 aRest; in vec2 aUV; in float aW; in vec2 aD;
  uniform vec2 uRes, uBase; uniform float uH, uRot, uTheta, uTime, uSeed, uFlutter;
  out vec2 vUV; out float vShine;
  void main(){
    float s = clamp(-aRest.y, 0., 1.);
    vec2 fl = vec2(sin(uTime*1.7 + aRest.x*11. + aRest.y*7. + uSeed),
                   cos(uTime*1.23 + aRest.x*8. - aRest.y*13. + uSeed*1.3)) * aW * uFlutter * .0032 * (.35 + s);
    vec2 p = aRest + aD + fl;
    float a = uRot + uTheta * pow(s, 1.4);
    float c = cos(a), sn = sin(a);
    p = vec2(c*p.x - sn*p.y, sn*p.x + c*p.y);
    vec2 px = uBase + p * uH;
    gl_Position = vec4(px / uRes * 2. - 1., 0., 1.);
    gl_Position.y = -gl_Position.y;
    vUV = aUV;
    vShine = clamp((aD.x - aD.y) * 7. + fl.x * 18., -.08, .14);
  }`;
  const FS = `#version 300 es
  precision mediump float;
  in vec2 vUV; in float vShine; uniform sampler2D uTex; uniform float uOpacity; out vec4 o;
  void main(){ vec4 c = texture(uTex, vUV); c.rgb *= 1. + vShine * c.a; o = c * uOpacity; }`;

  const COLS = 28, ROWS = 42, NV = COLS * ROWS;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  function create(canvas) {
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) { canvas.insertAdjacentHTML('afterend', '<p class="nogl">This browser can’t show the moving flowers.</p>'); return null; }
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o); return o; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw gl.getProgramInfoLog(prog);
    gl.useProgram(prog);
    const U = {}; ['uRes', 'uBase', 'uH', 'uRot', 'uTheta', 'uTime', 'uSeed', 'uFlutter', 'uTex', 'uOpacity']
      .forEach(n => U[n] = gl.getUniformLocation(prog, n));
    const A = { rest: gl.getAttribLocation(prog, 'aRest'), uv: gl.getAttribLocation(prog, 'aUV'),
      w: gl.getAttribLocation(prog, 'aW'), d: gl.getAttribLocation(prog, 'aD') };

    // shared triangle indices for the grid
    const idx = new Uint16Array((COLS - 1) * (ROWS - 1) * 6); let k = 0;
    for (let j = 0; j < ROWS - 1; j++) for (let i = 0; i < COLS - 1; i++) {
      const a = j * COLS + i; idx.set([a, a + 1, a + COLS, a + 1, a + COLS + 1, a + COLS], k); k += 6;
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const plants = [];
    let W = 0, H = 0, dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize(); addEventListener('resize', () => { resize(); garden.onresize && garden.onresize(W, H); });

    // pointer, with a smoothed velocity (px per second)
    const ptr = { x: -9999, y: -9999, vx: 0, vy: 0, t: 0, in: false };
    function move(e) {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, t = performance.now();
      if (ptr.in && t > ptr.t) {
        const dt = Math.max(8, t - ptr.t) / 1000;
        ptr.vx += ((x - ptr.x) / dt - ptr.vx) * .5; ptr.vy += ((y - ptr.y) / dt - ptr.vy) * .5;
      }
      ptr.x = x; ptr.y = y; ptr.t = t; ptr.in = true;
    }
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerdown', move, { passive: true });
    document.addEventListener('pointerleave', () => { ptr.in = false; });
    addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') ptr.in = false; });

    function add(src, opt = {}) {
      const p = Object.assign({ x: 0, y: 0, h: 400, rot: 0, opacity: 1, z: 0, seed: Math.random() * 6.28,
        ready: false, fade: 0, theta: 0, omega: 0, aspect: 1, bx: .5, pvx: 0, px0: null, flutter: 1 }, opt);
      p.d = new Float32Array(NV * 2); p.v = new Float32Array(NV * 2);
      p.rest = new Float32Array(NV * 2); p.wt = new Float32Array(NV); p.kk = new Float32Array(NV);
      p.vao = gl.createVertexArray(); p.dbuf = gl.createBuffer();
      const img = new Image(); img.decoding = 'async'; img.src = src;
      p.loaded = img.decode().then(() => { build(p, img); p.ready = true; });
      plants.push(p); return p;
    }

    function build(p, img) {
      p.aspect = img.naturalWidth / img.naturalHeight;
      // read a small copy of the alpha to find the stem line and what sticks out from it
      const sw = 64, shh = 96, c = document.createElement('canvas'); c.width = sw; c.height = shh;
      const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, sw, shh);
      const a = cx.getImageData(0, 0, sw, shh).data, al = (x, y) => a[(y * sw + x) * 4 + 3] / 255;
      const axis = new Float32Array(shh);
      for (let y = 0; y < shh; y++) { let s = 0, m = 0; for (let x = 0; x < sw; x++) { const v = al(x, y); s += v; m += v * x; } axis[y] = s > .5 ? m / s / sw : NaN; }
      for (let y = 0; y < shh; y++) if (isNaN(axis[y])) axis[y] = .5;
      const ax2 = axis.map((_, y) => { let s = 0, n = 0; for (let q = -6; q <= 6; q++) { const yy = y + q; if (yy >= 0 && yy < shh) { s += axis[yy]; n++; } } return s / n; });
      // stem base = where the alpha sits in the bottom rows
      let bs = 0, bm = 0; for (let y = shh - 4; y < shh; y++) for (let x = 0; x < sw; x++) { const v = al(x, y); bs += v; bm += v * x; }
      p.bx = bs > 0 ? (bm / bs + .5) / sw : .5;
      const st = new Float32Array(NV * 5);
      for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
        const n = j * COLS + i, u = i / (COLS - 1), v = j / (ROWS - 1);
        const lx = (u - p.bx) * p.aspect, ly = v - 1, s = -ly;
        const ay = ax2[Math.min(shh - 1, Math.round(v * (shh - 1)))];
        const off = Math.abs(u - ay) * p.aspect;           // distance from the stem line, in heights
        let w = Math.max(smooth(.05, .26, off), smooth(.5, .82, s) * .55) * smooth(.08, .3, s);
        p.rest[n * 2] = lx; p.rest[n * 2 + 1] = ly; p.wt[n] = w;
        p.kk[n] = 70 * (1 + 7 * Math.pow(1 - s, 4)) * (1 - .45 * w);   // stiff at the base, soft at petal tips
        st.set([lx, ly, u, v, w], n * 5);
      }
      gl.bindVertexArray(p.vao);
      const sb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sb); gl.bufferData(gl.ARRAY_BUFFER, st, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(A.rest); gl.vertexAttribPointer(A.rest, 2, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(A.uv); gl.vertexAttribPointer(A.uv, 2, gl.FLOAT, false, 20, 8);
      gl.enableVertexAttribArray(A.w); gl.vertexAttribPointer(A.w, 1, gl.FLOAT, false, 20, 16);
      gl.bindBuffer(gl.ARRAY_BUFFER, p.dbuf); gl.bufferData(gl.ARRAY_BUFFER, p.d, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(A.d); gl.vertexAttribPointer(A.d, 2, gl.FLOAT, false, 0, 0);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      p.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, p.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    // where a screen point lands in a plant's own (unbent, height = 1) space
    function toLocal(p, x, y) {
      let dx = (x - p.x) / p.h, dy = (y - p.y) / p.h, a = p.rot;
      for (let it = 0; it < 2; it++) {
        const c = Math.cos(-a), s = Math.sin(-a), lx = c * dx - s * dy, ly = s * dx + c * dy;
        a = p.rot + p.theta * Math.pow(Math.min(1, Math.max(0, -ly)), 1.4);
        if (it === 1) return [lx, ly];
      }
    }

    const DT = 1 / 120;
    function step(p, t, wind) {
      // local pointer position and velocity (in plant heights)
      let P = null, Vx = 0, Vy = 0;
      if (ptr.in && p.opacity > .05) {
        P = toLocal(p, ptr.x, ptr.y);
        const c = Math.cos(-p.rot - p.theta * .6), s = Math.sin(-p.rot - p.theta * .6);
        Vx = (c * ptr.vx - s * ptr.vy) / p.h; Vy = (s * ptr.vx + c * ptr.vy) / p.h;
        if (P[1] > .08 || P[1] < -1.12 || Math.abs(P[0]) > p.aspect) P = null;
      }
      // whole-stem bend: breeze + cursor push + follow-through when the plant itself moves
      let tq = wind * (Math.sin(t * .63 + p.seed) + .5 * Math.sin(t * 1.37 + p.seed * 2.1) + .25 * Math.sin(t * 2.31 + p.seed * .7)) * 9 * .022;
      if (P) {
        const lever = Math.min(1, Math.max(0, -P[1]));
        tq += Math.exp(-Math.pow(P[0] / (p.aspect * .45), 2)) * lever * Math.max(-3, Math.min(3, Vx)) * 1.1;
      }
      tq += p.accel || 0;
      p.omega += (tq - 9 * p.theta - 2.2 * p.omega) * DT;
      p.theta += p.omega * DT;
      p.theta = Math.max(-.35, Math.min(.35, p.theta));
      // per-point springs
      const d = p.d, v = p.v, r = p.rest, wt = p.wt, kk = p.kk, R2 = .13 * .13;
      const gx = P ? Math.max(-4, Math.min(4, Vx)) : 0, gy = P ? Math.max(-4, Math.min(4, Vy)) : 0;
      for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
        const n = j * COLS + i, n2 = n * 2;
        // pull toward neighbours so a push travels like a soft wave
        let sx = 0, sy = 0, cnt = 0;
        if (i > 0) { sx += d[n2 - 2]; sy += d[n2 - 1]; cnt++; }
        if (i < COLS - 1) { sx += d[n2 + 2]; sy += d[n2 + 3]; cnt++; }
        if (j > 0) { sx += d[n2 - COLS * 2]; sy += d[n2 - COLS * 2 + 1]; cnt++; }
        if (j < ROWS - 1) { sx += d[n2 + COLS * 2]; sy += d[n2 + COLS * 2 + 1]; cnt++; }
        let ax = -kk[n] * d[n2] - 7 * v[n2] + 38 * (sx / cnt - d[n2]);
        let ay = -kk[n] * d[n2 + 1] - 7 * v[n2 + 1] + 38 * (sy / cnt - d[n2 + 1]);
        if (P) {
          const ex = r[n2] + d[n2] - P[0], ey = r[n2 + 1] + d[n2 + 1] - P[1], e2 = ex * ex + ey * ey;
          if (e2 < R2 * 6) {
            const f = Math.exp(-e2 / R2) * (.25 + wt[n]);
            ax += f * 26 * (gx * .3 - v[n2]); ay += f * 26 * (gy * .3 - v[n2 + 1]);
          }
        }
        v[n2] += ax * DT; v[n2 + 1] += ay * DT;
      }
      for (let n = 0; n < NV * 2; n++) { d[n] += v[n] * DT; if (d[n] > .07) d[n] = .07; else if (d[n] < -.07) d[n] = -.07; }
    }

    let acc = 0, last = performance.now(), t0 = last;
    const garden = { plants, add, canvas, ptr, wind: reduce ? .3 : 1, onframe: null, onresize: null,
      get width() { return W; }, get height() { return H; } };

    function frame(now) {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      const t = (now - t0) / 1000;
      garden.onframe && garden.onframe(now, dt);
      // follow-through: a plant that is being moved sideways leans against the motion
      for (const p of plants) {
        if (p.px0 == null) p.px0 = p.x;
        const vx = (p.x - p.px0) / Math.max(dt, 1e-3) / p.h; p.px0 = p.x;
        p.accel = -(vx - p.pvx) / Math.max(dt, 1e-3) * .05; p.pvx = vx;
        p.accel = Math.max(-6, Math.min(6, p.accel));
      }
      acc += dt; let n = 0;
      while (acc >= DT && n < 6) { for (const p of plants) if (p.ready) step(p, t, garden.wind); acc -= DT; n++; }
      if (n === 6) acc = 0;
      ptr.vx *= Math.pow(.02, dt); ptr.vy *= Math.pow(.02, dt);   // a resting cursor stops pushing

      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(U.uRes, W, H); gl.uniform1f(U.uTime, reduce ? t * .4 : t); gl.uniform1i(U.uTex, 0);
      for (const p of plants) if (p.ready) p.fade = Math.min(1, p.fade + dt / .7);
      const order = plants.filter(p => p.ready && p.opacity > .003).sort((a, b) => a.z - b.z);
      for (const p of order) {
        gl.bindVertexArray(p.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, p.dbuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, p.d);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, p.tex);
        gl.uniform2f(U.uBase, p.x, p.y); gl.uniform1f(U.uH, p.h); gl.uniform1f(U.uRot, p.rot);
        gl.uniform1f(U.uTheta, p.theta); gl.uniform1f(U.uSeed, p.seed);
        gl.uniform1f(U.uFlutter, garden.wind * p.flutter); gl.uniform1f(U.uOpacity, p.opacity * p.fade * p.fade * (3 - 2 * p.fade));
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      }
      gl.bindVertexArray(null);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return garden;
  }
  window.Flora = { create };
})();
