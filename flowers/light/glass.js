// Shared glass for the light-mode flowers: thin tinted glass on a transparent canvas (premultiplied alpha).
// Body tint, deeper colour where the glass is seen edge-on, optional fine ribs running along the petal,
// a bright caught-light rim on petal margins, and studio highlights (softbox overhead, key light top right,
// strip light left). Lighting is in view space, so it behaves like a photo set as things move.
import * as THREE from 'three';

const VS = /* glsl */`
  varying vec2 vUv; varying vec3 vN, vV, vP;
  void main(){
    vUv = uv; vP = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
const FS = /* glsl */`
  uniform vec3 uBody, uEdge, uDeep, uRimC;
  uniform float uA, uEdgeA, uFresP, uRibs, uRibA, uRim, uBase, uSpec, uBoost, uSeed, uIri, uMetal, uGlit, uTime, uLilac, uCirc;
  varying vec2 vUv; varying vec3 vN, vV, vP;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){
    vec3 N = normalize(vN), V = normalize(vV);
    if (dot(N, V) < 0.) N = -N;
    float ndv = clamp(dot(N, V), 0., 1.), fr = pow(1. - ndv, uFresP);
    // fine ribs along the petal (lines of constant u fan out from the base); they tilt the normal a little too
    float rib = 0.;
    if (uRibs > 0.) {
      float ru = vUv.x * uRibs + sin(vUv.y * 4. + uSeed) * .35;
      float d = abs(fract(ru) - .5), w = fwidth(ru);
      rib = (1. - smoothstep(0., w * 1.2 + .06, .5 - d)) * smoothstep(.04, .25, vUv.y) * (1. - smoothstep(.88, 1., vUv.y));
      N = normalize(N + cross(N, vec3(0., 1., 0.)) * (fract(ru) - .5) * .35);
    }
    vec3 R = reflect(-V, N);
    float spec = smoothstep(.55, .97, R.y) * .4
      + pow(max(dot(R, normalize(vec3(.55, .6, .58))), 0.), 50.) * 1.4
      + pow(max(dot(R, normalize(vec3(-.8, .3, .52))), 0.), 18.) * .4;
    spec *= uSpec;
    // margins of a sheet (u = ±1, tip) read as a bright rounded glass edge
    float edge = uRim > 0. ? max(smoothstep(1. - uRim, 1., abs(vUv.x * 2. - 1.)), smoothstep(1. - uRim * .8, 1., vUv.y)) : 0.;
    float base = (1. - smoothstep(0., .45, vUv.y)) * uBase;
    vec3 col = mix(uBody, uEdge, fr);
    col = mix(col, uDeep, clamp(fr * fr * .7 + base * .6 + rib * .25, 0., 1.));
    float a = uA + fr * uEdgeA + rib * uRibA + base * .12;
    // just inside the bright margin the glass turns: a deeper line that defines each petal's edge
    float inner = uRim > 0. ? max(smoothstep(1. - uRim * 2.4, 1. - uRim * 1.2, abs(vUv.x * 2. - 1.)) * (1. - smoothstep(1. - uRim * 1.1, 1. - uRim * .6, abs(vUv.x * 2. - 1.))),
                                  smoothstep(1. - uRim * 2., 1. - uRim, vUv.y) * (1. - smoothstep(1. - uRim * .9, 1. - uRim * .5, vUv.y))) : 0.;
    col = mix(col, uDeep, inner * .55); a = max(a, a + inner * .18);
    col = mix(col, uRimC, edge * .9); a = max(a, edge * .78);
    // pearly thin-film colour in the sheen (pink, gold, aqua drifting with the angle)
    if (uIri > 0.) {
      vec3 film = .5 + .5 * cos(6.2832 * (ndv * 1.3 + vUv.y * .4 + uSeed * .07 + vec3(0., .33, .67)));
      film = mix(film, vec3(film.r, film.g * .7, max(film.b, film.g)), .6);   // lean the film toward pink, violet and blue
      // optional lilac film: only pink, lilac and pale blue, no greens or golds
      float f1 = .5 + .5 * cos(6.2832 * (ndv * 1.4 + vUv.y * .5 + uSeed * .07)), f2 = .5 + .5 * cos(6.2832 * (vUv.x * 1.3 - ndv + uSeed * .11));
      vec3 lil = mix(mix(vec3(1., .78, .9), vec3(.74, .64, 1.), f1), vec3(.72, .86, 1.), smoothstep(.55, 1., f2) * .8);
      film = mix(film, lil, uLilac);
      col = mix(col, col * .65 + film * .45, uIri * (.3 + .7 * fr));
    }
    // metallic: the surface mirrors a studio — bright softbox above, a dark band at the horizon, hot key and strip
    // lights — tinted by the metal's own colour, so it reads as polished pink chrome rather than paint
    if (uMetal > 0.) {
      vec3 kd = normalize(vec3(.55, .6, .58)), sd = normalize(vec3(-.8, .3, .52));
      float env = .22 + .8 * smoothstep(-.05, .8, R.y) - .3 * (1. - smoothstep(0., .22, abs(R.y + .05)))
        + 1.1 * pow(max(dot(R, kd), 0.), 6.) + .5 * pow(max(dot(R, sd), 0.), 5.) + .25 * smoothstep(-.3, -.9, R.y);
      vec3 mcol = mix(uDeep, uBody, smoothstep(.1, 1., env)) * (.62 + .6 * env);
      col = mix(col, mcol, uMetal);
      spec *= 1. + uMetal;
      a = mix(a, max(a, .97), uMetal);
    }
    float s = clamp(spec, 0., 1.);
    vec3 hc = .75 + .25 * cos(6.2832 * (R.x * .7 + R.y * .5 + vec3(0., .33, .67)));
    hc = mix(hc, mix(vec3(1., .86, .95), vec3(.84, .86, 1.), .5 + .5 * sin(R.x * 5. + R.y * 3.)), uLilac);   // lilac mode: pink-to-blue highlights only
    vec3 hi = uIri > 0. ? mix(vec3(1.), hc, uIri * .6) : vec3(1.);
    col = mix(col, hi, s); a = max(a, s * .85);
    // gold circuit traces (after the dark-mode camellia): lanes running out from the base in right-angle steps,
    // ending in round pads, with a soft light pulse travelling outward along them
    if (uCirc > 0.) {
      float lanes = 7., x = vUv.x * lanes, id = floor(x), hv = hash(vec2(id, 3.) + uSeed);
      float sy = vUv.y * 5. + hv * 3., seg = floor(sy);
      float jog = (hash(vec2(id, seg) + uSeed) - .5) * .5 * step(.35, fract(sy));
      float cx = fract(x) - .5 - jog, w = fwidth(x);
      float endv = .5 + hv * .38;
      float on = step(hv, .85) * smoothstep(.1, .16, vUv.y) * step(vUv.y, endv);
      float line = (1. - smoothstep(.035, .035 + w * 1.5, abs(cx))) * on;
      float pad = (1. - smoothstep(.1, .1 + w * 1.5, length(vec2(cx, (vUv.y - endv) * lanes * .9)))) * step(hv, .85);
      float tr = max(line, pad);
      float pl = fract(vUv.y * 1.2 - uTime * .3 + hv); pl = smoothstep(0., .04, pl) * (1. - smoothstep(.04, .16, pl));
      vec3 gold = vec3(.93, .76, .4) * (.85 + .3 * s);
      col = mix(col, gold, tr * uCirc); a = max(a, tr * uCirc);
      col = mix(col, vec3(1., .88, .95), line * pl * uCirc * .9);
    }
    // glitter suspended in the surface, each fleck twinkling on its own
    if (uGlit > 0.) {
      vec2 g = vUv * vec2(80., 80.), c = floor(g);
      float h = hash(c + uSeed), d = length(fract(g) - .5);
      float tw = .5 + .5 * sin(uTime * (2. + h * 5.) + h * 60.);
      float sp = step(1. - uGlit, h) * smoothstep(.36, .0, d) * (.25 + .75 * tw * tw);
      vec2 g2 = vUv * vec2(170., 170.), c2 = floor(g2);
      float h2 = hash(c2 + uSeed + 7.), d2 = length(fract(g2) - .5);
      sp = max(sp, step(1. - uGlit * .8, h2) * smoothstep(.3, .0, d2) * (.4 + .6 * sin(uTime * (3. + h2 * 4.) + h2 * 40.)));
      vec3 gc = mix(vec3(1.), .6 + .4 * cos(6.2832 * (h * 3. + vec3(0., .33, .67))), .55);
      col = mix(col, gc, sp); a = max(a, sp);
    }
    col += uBoost * (.06 + .2 * fr);
    a = clamp(a + uBoost * .05, 0., 1.);
    gl_FragColor = vec4(col * a, a);
  }`;

export const glassTime = { value: 0 };   // advanced by the page each frame (glitter twinkle)
const hex = h => new THREE.Vector3(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255);
export function glassMat(o = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS,
    uniforms: {
      uBody: { value: hex(o.body ?? 0xf6c4d8) }, uEdge: { value: hex(o.edge ?? 0xe08cb0) }, uDeep: { value: hex(o.deep ?? 0xc0507e) },
      uRimC: { value: hex(o.rimC ?? 0xfde4ee) }, uA: { value: o.a ?? .16 }, uEdgeA: { value: o.edgeA ?? .5 }, uFresP: { value: o.fresP ?? 2 },
      uRibs: { value: o.ribs ?? 0 }, uRibA: { value: o.ribA ?? .08 }, uRim: { value: o.rim ?? 0 }, uBase: { value: o.baseK ?? 0 },
      uSpec: { value: o.spec ?? 1 }, uBoost: o.boost ?? { value: 0 }, uSeed: { value: o.seed ?? 0 }, uIri: { value: o.iri ?? 0 },
      uMetal: { value: o.metal ?? 0 }, uGlit: { value: o.glit ?? 0 }, uTime: glassTime, uLilac: { value: o.lilac ?? 0 }, uCirc: { value: o.circ ?? 0 },
    },
    transparent: true, depthWrite: o.depthWrite ?? false, side: o.side ?? THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
}
