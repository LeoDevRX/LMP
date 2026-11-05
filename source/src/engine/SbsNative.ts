/**
 * LocalPaint's own versions of Substance graphs, run on the GPU with the baked mesh maps.
 *
 *  - Graphs LocalPaint knows (matched by name / parameters) get a shader written for them,
 *    so every slider does what it does in Painter.
 *  - Any other graph gets a live approximation: its parameters are sorted into roles
 *    (base color, edge wear, dirt, roughness, scale …) by name, and drive a layered
 *    procedural material.
 */
import * as THREE from 'three';
import { GPU, RT, makeRT, quadShader } from './gpu';
import type { Ch, TextureSet } from './TextureSet';
import { SbsGraph, SbsState, approxRoles, norm01 } from './Substance';
import { guessLook } from './SubstanceReader';

const NOISE = /* glsl */ `
float h21(vec2 p, float s) { p = fract(p * vec2(123.34, 456.21) + s * 0.1031); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 h22(vec2 p, float s) { return vec2(h21(p, s), h21(p + 17.17, s + 3.1)); }
uniform float period; // > 0: patterns repeat every \`period\` cells, so the texture tiles without seams
vec2 wrapc(vec2 c, float per) { return per > 0.0 ? mod(c, per) : c; }
vec2 wrapc(vec2 c, vec2 per) { return per.x > 0.0 ? mod(c, per) : c; }
float vnoiseP(vec2 p, float s, float per) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(wrapc(i, per), s), h21(wrapc(i + vec2(1, 0), per), s), u.x), mix(h21(wrapc(i + vec2(0, 1), per), s), h21(wrapc(i + vec2(1, 1), per), s), u.x), u.y);
}
// p is in pattern cells (0..period over the texture); frequency multipliers must be whole numbers to tile
float vnoise(vec2 p, float s) { return vnoiseP(p, s, period); }
float fbmP(vec2 p, float s, float per) { float a = 0.5, v = 0.0; for (int i = 0; i < 5; i++) { v += a * vnoiseP(p, s + float(i), per); p *= 2.0; per *= 2.0; a *= 0.5; } return v; }
float fbm(vec2 p, float s) { return fbmP(p, s, period); }
float fbmK(vec2 p, float k, float s) { return fbmP(p * k, s, period * k); }
`;

// ------------------------------------------------------------------ SimpleDiffuse

const FRAG_SIMPLE_DIFFUSE = /* glsl */ `
uniform sampler2D meshMap; uniform sampler2D wsnMap; uniform sampler2D posMap; uniform sampler2D covMap;
uniform bool hasWsn; uniform bool hasPos;
uniform vec4 baseC, shadowC, aoC, curvC, specC, spec2C, gradDark, gradLight, mulC, ovC, bsHi;
uniform float shadowPow, aoPow, curvOp, curvOff, specH, specR, specE, spec2H, spec2R, spec2E;
uniform int nLights, nLights2;
uniform bool use2, useGrad, invGrad, usePost, useBS, bsFx, skin;
uniform float gradPow, lightGradPow, seed, bsSeed, bsPow, bsContrast, maskRand, bsScale, bsScaleRand, bsRot, bsRandRot, bsNrmRot, bsOpacity;
uniform vec2 bsAmount;
varying vec2 vUv;
${NOISE}
const float TAU = 6.2831853;
vec3 lightDir(float height, float rot) {
  float el = height * TAU, az = rot * TAU;
  return normalize(vec3(sin(az) * cos(el), sin(el), cos(az) * cos(el)));
}
float specular(vec3 n, float height, float rot, float e, int count) {
  float p = mix(2.0, 160.0, pow(clamp(e, 0.0, 1.0), 0.8));
  float s = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= count) break;
    vec3 L = lightDir(height, rot + float(i) / float(count));
    s += pow(max(dot(n, L), 0.0), p);
  }
  return clamp(s, 0.0, 1.0);
}
vec3 overlay(vec3 a, vec3 b) { return mix(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), step(0.5, a)); }
// Brush strokes: overlapping elongated dabs, each with its own tone, following the surface.
// Returns the tone of the top-most dab (0.5 = neutral).
float strokes(vec2 uv, vec3 n) {
  vec2 cells = max(floor(bsAmount * 0.5), vec2(2.0));
  vec2 p = uv * cells;
  vec2 ip = floor(p);
  float best = -1.0, tone = 0.5;
  float flow = atan(n.x, n.z) * bsNrmRot;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    for (int k = 0; k < 2; k++) {
      vec2 c = mod(ip + vec2(x, y), cells);
      vec2 r = h22(c + float(k) * 31.7, bsSeed + seed * 7.0);
      vec2 ctr = ip + vec2(x, y) + r;
      float ang = (bsRot + (h21(c + float(k) * 5.1, bsSeed) - 0.5) * bsRandRot) * TAU + flow;
      float len = (0.9 + bsScale / 30.0) * (1.0 + (r.y - 0.5) * bsScaleRand * 1.5);
      vec2 d = p - ctr;
      vec2 q = vec2(cos(ang) * d.x + sin(ang) * d.y, -sin(ang) * d.x + cos(ang) * d.y);
      // tapered dab with ragged bristle edges
      float t = clamp(q.x / len * 0.5 + 0.5, 0.0, 1.0);
      float w = len * 0.42 * (0.55 + 0.45 * sin(t * 3.14159));
      if (bsFx) w *= 0.85 + 0.15 * sin(q.x * 11.0 + r.x * 20.0);
      float m = step(abs(q.x), len) * step(abs(q.y), w);
      if (m < 0.5) continue;
      float z = h21(c + float(k) * 13.3, bsSeed + 1.0);
      if (z > best) {
        best = z;
        float bristle = bsFx ? 0.04 * sin(q.y / max(w, 1e-3) * 9.0 + r.x * 9.0) : 0.0;
        tone = mix(0.5, h21(c + float(k) * 3.9, bsSeed + 2.0), bsOpacity * 0.7) - maskRand * 0.5 * h21(c + 9.1, bsSeed) + bristle + (1.0 - t) * 0.05;
      }
    }
  }
  float s = tone;
  if (skin) s = mix(s, fbm(uv * cells * 2.0, bsSeed), 0.5);
  return clamp((s - 0.5) * (1.0 + bsContrast * 4.0) + 0.5, 0.0, 1.0);
}
void main() {
  vec4 mm = texture2D(meshMap, vUv);
  float ao = mm.r, cv = mm.g;
  vec3 n = hasWsn ? normalize(texture2D(wsnMap, vUv).xyz * 2.0 - 1.0) : vec3(0.0, 1.0, 0.0);
  float y = hasPos ? texture2D(posMap, vUv).y : vUv.y;
  vec3 c = baseC.rgb;
  // shadow side (key light from above and in front)
  vec3 key = lightDir(0.125, 0.0);
  float lam = dot(n, key) * 0.5 + 0.5;
  float sh = clamp((1.0 - smoothstep(0.1, 0.5 + 0.5 * shadowPow, lam)) * shadowC.a * 2.0, 0.0, 1.0);
  c = mix(c, shadowC.rgb, sh);
  // ambient occlusion
  float occ = clamp((1.0 - ao) * aoPow * 2.0, 0.0, 1.0) * aoC.a;
  c = mix(c, aoC.rgb, occ);
  // curvature (convex edges)
  float edge = smoothstep(0.5 + curvOff * 0.12, 0.62 + curvOff * 0.2, cv);
  c = mix(c, curvC.rgb, edge * curvOp * curvC.a);
  // painted light
  c += specC.rgb * specular(n, specH, specR, specE, nLights) * specC.a * 2.5;
  if (use2) c += spec2C.rgb * specular(n, spec2H, spec2R, spec2E, nLights2) * spec2C.a * 1.5;
  // gradient over the model's height
  if (useGrad) {
    float g = invGrad ? 1.0 - y : y;
    c = mix(c, c * gradDark.rgb, clamp((1.0 - g) * gradPow, 0.0, 1.0) * gradDark.a);
    c = mix(c, 1.0 - (1.0 - c) * (1.0 - gradLight.rgb), clamp(g * lightGradPow * 2.0, 0.0, 1.0) * gradLight.a * 4.0);
  }
  if (useBS) {
    float s = strokes(vUv, n);
    c *= 1.0 + (s - 0.5) * bsPow * 0.9;
    c = mix(c, bsHi.rgb, clamp((s - 0.62) * 3.0, 0.0, 1.0) * bsHi.a * bsPow);
  }
  if (usePost) { c *= mulC.rgb; c = overlay(clamp(c, 0.0, 1.0), ovC.rgb); }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export interface NativeGraph {
  id: string;
  label: string;
  match(g: SbsGraph): boolean;
  /** Channels it renders. */
  outputs: Ch[];
}

const NATIVE: NativeGraph[] = [
  {
    id: 'simple-diffuse', label: 'SimpleDiffuse',
    match: (g) => /simple.?diffuse/i.test(g.label + g.url) || ['Shadow_Power', 'AO_Power', 'Specular_Exponent', 'UseBrushStrokes'].every((k) => g.params.some((p) => p.id === k)),
    outputs: ['color'],
  },
];

export function nativeFor(g: SbsGraph): NativeGraph | null { return NATIVE.find((n) => n.match(g)) ?? null; }

// ------------------------------------------------------------------ generic approximation

const FRAG_APPROX = /* glsl */ `
uniform sampler2D meshMap;
uniform vec3 baseC, secondC, edgeC, dirtC, emitC;
uniform float rough, metal, scale, edgeAmt, dirtAmt, bump, varAmt, seed, hueShift, satMul, lumAdd, contrast, glow;
uniform bool hasEdge, hasDirt;
uniform int pattern; // 0 noise, 1 panels, 2 bricks, 3 tiles, 4 planks, 5 cracks (lava), 6 cobbles
uniform int outMode; // 0 color, 1 rough, 2 metal, 3 height, 4 emit
varying vec2 vUv;
${NOISE}
vec3 rgb2hsv(vec3 c) { vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x); }
vec3 hsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
// x = groove (1 in the gaps), y = random per piece, z = bolts / bubbles
vec3 pat(vec2 p) {
  if (pattern == 1) {
    vec2 c = wrapc(floor(p), period), f = fract(p);
    float r = h21(c, seed);
    vec2 lo = vec2(0.0), hi = vec2(1.0);
    float sp = 0.3 + 0.4 * h21(c + 1.7, seed);
    if (r < 0.5) { if (f.x < sp) hi.x = sp; else lo.x = sp; } else { if (f.y < sp) hi.y = sp; else lo.y = sp; }
    if (h21(c + 5.3, seed) > 0.55) { float sp2 = mix(lo.y, hi.y, 0.5); if (r < 0.5) { if (f.y < sp2) hi.y = sp2; else lo.y = sp2; } }
    vec2 d = min(f - lo, hi - f);
    float e = min(d.x, d.y);
    float groove = 1.0 - smoothstep(0.008, 0.022, e);
    float inset = 1.0 - smoothstep(0.035, 0.05, e);
    vec2 sz = hi - lo;
    float bd = 9.0;
    if (min(sz.x, sz.y) > 0.22) {
      bd = min(min(length(f - (lo + 0.045)), length(f - vec2(hi.x - 0.045, lo.y + 0.045))), min(length(f - (hi - 0.045)), length(f - vec2(lo.x + 0.045, hi.y - 0.045))));
    }
    float bolt = 1.0 - smoothstep(0.011, 0.016, bd);
    return vec3(max(groove, inset * 0.35), h21(c + lo * 7.0 + hi * 3.0, seed), bolt);
  }
  if (pattern == 2 || pattern == 3 || pattern == 6) {
    vec2 q = pattern == 2 ? vec2(p.x, p.y * 2.0) : p;
    float row = floor(q.y);
    if (pattern == 2) q.x += mod(row, 2.0) * 0.5;
    if (pattern == 6) q += (vec2(vnoiseP(p * 3.0, seed, period * 3.0), vnoiseP(p * 3.0 + 9.0, seed, period * 3.0)) - 0.5) * 0.18;
    vec2 c = wrapc(floor(q), pattern == 2 ? period * vec2(1.0, 2.0) : vec2(period)), f = fract(q);
    vec2 d = min(f, 1.0 - f);
    if (pattern == 2) d.y *= 0.5;
    float e = pattern == 6 ? length(max(vec2(0.18) - d, 0.0)) : min(d.x, d.y);
    float groove = pattern == 6 ? smoothstep(0.02, 0.12, e) : 1.0 - smoothstep(0.02, 0.05, e);
    return vec3(groove, h21(c, seed), 0.0);
  }
  if (pattern == 4) {
    vec2 q = vec2(p.x * 0.25, p.y);
    float row = mod(floor(q.y), period);
    q.x += floor(h21(vec2(row, 1.0), seed) * 4.0) * 0.25;
    float c = mod(floor(q.x), max(1.0, period * 0.25));
    float f = fract(q.x), fy = fract(q.y);
    float groove = 1.0 - smoothstep(0.012, 0.03, min(min(f, 1.0 - f) * 4.0, min(fy, 1.0 - fy)));
    float r = h21(vec2(c, row), seed);
    float grain = fbmP(vec2(p.x, p.y * 16.0), seed + r * 3.0, period * 16.0) * 0.5 + fbmP(vec2(p.x, p.y * 16.0), seed + 7.0, period * 16.0) * 0.5;
    return vec3(groove, r * 0.6 + grain * 0.4, grain);
  }
  if (pattern == 5) {
    // cells (cooled crust) with glowing cracks between them
    vec2 c = floor(p), f = fract(p);
    float d1 = 9.0, d2 = 9.0; vec2 id = vec2(0.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(x, y); vec2 r = h22(wrapc(c + o, period), seed);
      float d = length(o + r - f);
      if (d < d1) { d2 = d1; d1 = d; id = wrapc(c + o, period); } else if (d < d2) d2 = d;
    }
    float crack = 1.0 - smoothstep(0.02, 0.14, d2 - d1);
    return vec3(crack, h21(id, seed), 1.0 - smoothstep(0.0, 0.5, d1));
  }
  return vec3(0.0, fbm(p, seed + 2.0), 0.0);
}
void main() {
  vec4 mm = texture2D(meshMap, vUv);
  vec2 p = vUv * scale;
  float n1 = fbm(p, seed), n2 = fbmK(p, 3.0, seed + 5.0), n3 = fbmK(p, 9.0, seed + 9.0);
  vec3 pt = pat(p);
  float groove = pt.x, piece = pt.y;
  float vmask = smoothstep(0.35, 0.75, n1);
  vec3 c = mix(baseC, secondC, vmask * varAmt);
  if (pattern != 0) c *= 0.82 + 0.36 * piece * (0.4 + varAmt);
  c *= 0.9 + 0.2 * n3;
  float r = rough + (n2 - 0.5) * 0.25 * (0.4 + varAmt) + (piece - 0.5) * 0.12;
  float m = metal;
  float h = 0.5 + (n1 - 0.5) * bump * 0.25 + (n3 - 0.5) * bump * 0.12;
  vec3 e = vec3(0.0);
  if (pattern == 1) { h -= groove * 0.22 * (0.5 + bump); h += pt.z * 0.12; c = mix(c, c * 0.35, groove); c = mix(c, c * 1.15 + 0.03, pt.z); r = mix(r, 1.0, groove * 0.5); e = emitC * glow * smoothstep(0.85, 1.0, groove) * step(0.7, piece); }
  else if (pattern == 2 || pattern == 3 || pattern == 6) { h -= groove * 0.25 * (0.5 + bump); vec3 mortar = mix(baseC, vec3(0.62, 0.6, 0.56), 0.6) * (0.8 + 0.3 * n3); c = mix(c, mortar, groove); r = mix(r, 0.95, groove); }
  else if (pattern == 4) { c *= 0.75 + 0.5 * pt.z; h += (pt.z - 0.5) * 0.06 - groove * 0.18; c = mix(c, c * 0.3, groove); }
  else if (pattern == 5) { h += (1.0 - groove) * 0.2 * (0.5 + bump) + pt.z * 0.05; c = mix(c, c * 0.6, groove); r = mix(r, 0.6, groove); e = emitC * glow * (groove * (0.6 + 0.4 * n2) + 0.15 * smoothstep(0.6, 0.9, n2)); c = mix(c, emitC * 0.9, groove * glow * 0.6); }
  if (hasEdge) {
    float edge = smoothstep(0.52, 0.7, mm.g + (n2 - 0.5) * 0.12) * edgeAmt;
    c = mix(c, edgeC, edge); r = mix(r, r * 0.6, edge); h += edge * 0.03;
  }
  if (hasDirt) {
    float dirt = clamp((1.0 - mm.r) * 1.6 * dirtAmt + (n1 - 0.62) * 1.5 * dirtAmt + groove * dirtAmt * 0.8, 0.0, 1.0);
    c = mix(c, dirtC, dirt); r = mix(r, 1.0, dirt * 0.7); m *= 1.0 - dirt; h -= dirt * 0.02;
  }
  // colour adjustments (hue / saturation / luminosity / contrast sliders)
  vec3 hsv = rgb2hsv(clamp(c, 0.0, 1.0));
  hsv.x = fract(hsv.x + hueShift); hsv.y = clamp(hsv.y * satMul, 0.0, 1.0);
  c = hsv2rgb(hsv) + lumAdd;
  c = (c - 0.5) * (1.0 + contrast) + 0.5;
  vec4 o = vec4(0.0, 0.0, 0.0, 1.0);
  if (outMode == 0) o.rgb = clamp(c, 0.0, 1.0);
  else if (outMode == 1) o.rgb = vec3(clamp(r, 0.02, 1.0));
  else if (outMode == 2) o.rgb = vec3(clamp(m, 0.0, 1.0));
  else if (outMode == 3) o.rgb = vec3(clamp(h, 0.0, 1.0));
  else o.rgb = clamp(e, 0.0, 1.0);
  gl_FragColor = o;
}`;

/** Which pattern a material's name suggests. */
export function approxPattern(text: string): number {
  if (/lava|magma|molten|volcan|ember/i.test(text)) return 5;
  if (/sci.?fi|panel|plate|hull|armou?r|spaceship|mech/i.test(text)) return 1;
  if (/brick|masonry/i.test(text)) return 2;
  if (/cobble|paving|pavement|flagstone/i.test(text)) return 6;
  if (/tile|ceramic|checker/i.test(text)) return 3;
  if (/plank|parquet|deck|floor.?board|wood.?floor|wood/i.test(text)) return 4;
  return 0;
}

const v4 = (v: number[] | undefined, d: [number, number, number, number]) => new THREE.Vector4(v?.[0] ?? d[0], v?.[1] ?? d[1], v?.[2] ?? d[2], v?.[3] ?? d[3]);
const v3 = (v: number[] | undefined, d: [number, number, number]) => new THREE.Vector3(v?.[0] ?? d[0], v?.[1] ?? d[1], v?.[2] ?? d[2]);

export class SbsNativeRunner {
  private sd = quadShader(FRAG_SIMPLE_DIFFUSE, {
    meshMap: { value: null }, wsnMap: { value: null }, posMap: { value: null }, covMap: { value: null }, hasWsn: { value: false }, hasPos: { value: false },
    baseC: { value: new THREE.Vector4() }, shadowC: { value: new THREE.Vector4() }, aoC: { value: new THREE.Vector4() }, curvC: { value: new THREE.Vector4() },
    specC: { value: new THREE.Vector4() }, spec2C: { value: new THREE.Vector4() }, gradDark: { value: new THREE.Vector4() }, gradLight: { value: new THREE.Vector4() },
    mulC: { value: new THREE.Vector4() }, ovC: { value: new THREE.Vector4() }, bsHi: { value: new THREE.Vector4() },
    shadowPow: { value: 0.5 }, aoPow: { value: 0.5 }, curvOp: { value: 0.25 }, curvOff: { value: 0.25 },
    specH: { value: 0.1 }, specR: { value: 0 }, specE: { value: 0.17 }, spec2H: { value: 0.5 }, spec2R: { value: 0.5 }, spec2E: { value: 0.2 },
    nLights: { value: 2 }, nLights2: { value: 1 }, use2: { value: false }, useGrad: { value: true }, invGrad: { value: false }, usePost: { value: false },
    useBS: { value: false }, bsFx: { value: true }, skin: { value: false }, period: { value: 0 },
    gradPow: { value: 0.75 }, lightGradPow: { value: 0.25 }, seed: { value: 0 }, bsSeed: { value: 1 }, bsPow: { value: 0.5 }, bsContrast: { value: 0 },
    maskRand: { value: 0.1 }, bsScale: { value: 25 }, bsScaleRand: { value: 0 }, bsRot: { value: 0 }, bsRandRot: { value: 0 }, bsNrmRot: { value: 1 }, bsOpacity: { value: 1 },
    bsAmount: { value: new THREE.Vector2(128, 128) },
  });
  private ap = quadShader(FRAG_APPROX, {
    meshMap: { value: null }, baseC: { value: new THREE.Vector3() }, secondC: { value: new THREE.Vector3() }, edgeC: { value: new THREE.Vector3() },
    dirtC: { value: new THREE.Vector3() }, emitC: { value: new THREE.Vector3() }, rough: { value: 0.5 }, metal: { value: 0 }, scale: { value: 4 },
    edgeAmt: { value: 0 }, dirtAmt: { value: 0 }, bump: { value: 0.3 }, varAmt: { value: 0.5 }, seed: { value: 0 },
    hueShift: { value: 0 }, satMul: { value: 1 }, lumAdd: { value: 0 }, contrast: { value: 0 }, glow: { value: 1 }, pattern: { value: 0 },
    hasEdge: { value: false }, hasDirt: { value: false }, outMode: { value: 0 }, period: { value: 0 },
  });
  constructor(private gpu: GPU) {}

  /** Render into `targets` (created / resized as needed). Returns the channels written. */
  render(ts: TextureSet, g: SbsGraph, st: SbsState, targets: Partial<Record<Ch, RT>>): Partial<Record<Ch, RT>> {
    const size = 1 << st.res;
    const rt = (ch: Ch) => {
      let t = targets[ch];
      if (!t || t.width !== size) { t?.dispose(); t = makeRT(size); t.texture.wrapS = t.texture.wrapT = THREE.RepeatWrapping; targets[ch] = t; }
      return t;
    };
    const out: Partial<Record<Ch, RT>> = {};
    const val = st.values;
    const native = nativeFor(g);
    if (native?.id === 'simple-diffuse') {
      const u = this.sd.uniforms;
      u.meshMap.value = ts.meshRT.texture; u.wsnMap.value = ts.wsnRT.texture; u.posMap.value = ts.posNRT.texture;
      u.hasWsn.value = ts.baked.has('wsn'); u.hasPos.value = ts.baked.has('pos');
      const c4 = (k: string, d: [number, number, number, number]) => v4(val[k], d);
      u.baseC.value = c4('Base_Color', [0.44, 0.35, 0.16, 1]); u.shadowC.value = c4('Shadow', [0.26, 0.11, 0.15, 0.5]);
      u.aoC.value = c4('AO', [0.22, 0.07, 0.07, 0.89]); u.curvC.value = c4('Curvature_Color', [1, 1, 1, 1]);
      u.specC.value = c4('Specular_Color', [1, 0.78, 0.56, 0.15]); u.spec2C.value = c4('Specular2_color', [0.93, 0.07, 0.16, 1]);
      u.gradDark.value = c4('GradientColor', [0.58, 0.54, 0.66, 1]); u.gradLight.value = c4('GradientLightColor', [1, 0.6, 0, 0.1]);
      u.mulC.value = c4('Color_Multiply', [1, 1, 1, 1]); u.ovC.value = c4('Color_Overlay', [0.5, 0.5, 0.5, 1]); u.bsHi.value = c4('BS_HighlightColor', [1, 1, 1, 0.6]);
      const f = (k: string, d: number) => val[k]?.[0] ?? d;
      const b = (k: string, d: boolean) => (val[k] ? val[k][0] > 0.5 : d);
      u.shadowPow.value = f('Shadow_Power', 0.5); u.aoPow.value = f('AO_Power', 0.5); u.curvOp.value = f('CurvatureOpacity', 0.25); u.curvOff.value = f('Curvature_Color_Offset', 0.25);
      u.specH.value = f('Specular_Height', 0.1); u.specR.value = f('Specular_Rotation', 0); u.specE.value = f('Specular_Exponent', 0.17); u.nLights.value = Math.round(f('Number_Of_Lights', 2));
      u.use2.value = b('UseSecondaryLight', false); u.spec2H.value = f('Specular2_Height', 0.5); u.spec2R.value = f('SecondaryLight_Rotation', 0.5); u.spec2E.value = f('Specular2_Exponent', 0.2); u.nLights2.value = Math.round(f('numberof_lights2', 1));
      u.useGrad.value = b('UseGradient', true); u.invGrad.value = b('InvertGradient', false); u.gradPow.value = f('Gradient_Power', 0.75); u.lightGradPow.value = f('Light_Gradient_Power', 0.25);
      u.usePost.value = b('UsePostProcess', false);
      u.useBS.value = b('UseBrushStrokes', false); u.bsFx.value = b('BS_Use_Extra_Brushstroke_FX', true); u.skin.value = b('UseSkinNoise', false);
      u.seed.value = st.seed; u.bsSeed.value = f('BS_RandomSeed', 1); u.bsPow.value = f('BS_Power', 0.5); u.bsContrast.value = f('BS_Contrast', 0);
      u.maskRand.value = f('MaskRandom', 0.1); u.bsScale.value = f('BS_Scale', 25); u.bsScaleRand.value = f('BS_ScaleRandom', 0);
      u.bsRot.value = f('BS_Rotation', 0); u.bsRandRot.value = f('BS_RandomRotation', 0); u.bsNrmRot.value = f('BSNormalRotation', 1); u.bsOpacity.value = f('BS_RandomOpacity', 1);
      u.bsAmount.value.set(val.BS_XY_Amount?.[0] ?? 128, val.BS_XY_Amount?.[1] ?? 128);
      this.gpu.run(this.sd, out.color = rt('color'));
      out.color.texture.needsUpdate = false;
      return out;
    }
    // generic approximation
    const roles = approxRoles(g);
    const P = (id?: string) => (id ? g.params.find((p) => p.id === id) : undefined);
    const num = (id: string | undefined, d: number) => (id ? val[id]?.[0] ?? d : d);
    const n01 = (id: string | undefined, d: number) => (id ? norm01(P(id), val[id]?.[0], d) : d);
    /** Change from the default, scaled to the slider's range (hue / saturation / luminosity sliders). */
    const delta = (id: string | undefined) => { const p = P(id); if (!p || !id) return 0; const lo = p.min?.[0] ?? 0, hi = p.max?.[0] ?? 1; return ((val[id]?.[0] ?? p.def[0] ?? 0) - (p.def[0] ?? 0)) / Math.max(1e-6, hi - lo); };
    const pkgText = `${g.label} ${g.category} ${g.url} ${st.file}`;
    const look = guessLook(`${g.label} ${st.file.replace(/_/g, ' ')}`, g.category.replace(/\//g, ' '), g.description);
    const u = this.ap.uniforms;
    u.meshMap.value = ts.meshRT.texture;
    const base = roles.base ? val[roles.base] : undefined;
    u.baseC.value = v3(base, look?.color ?? [0.6, 0.6, 0.6]);
    const sec = roles.second ? val[roles.second] : undefined;
    u.secondC.value = sec ? v3(sec, [0, 0, 0]) : (u.baseC.value as THREE.Vector3).clone().multiplyScalar(0.62);
    u.hasEdge.value = !!(roles.edge || roles.edgeAmt); u.edgeC.value = roles.edge ? v3(val[roles.edge], [1, 1, 1]) : (u.baseC.value as THREE.Vector3).clone().addScalar(0.25).clampScalar(0, 1);
    const rusty = /rust/i.test(pkgText + ' ' + (roles.dirtAmt ? P(roles.dirtAmt)!.label : ''));
    u.hasDirt.value = !!(roles.dirt || roles.dirtAmt); u.dirtC.value = roles.dirt ? v3(val[roles.dirt], [0.1, 0.08, 0.06]) : rusty ? new THREE.Vector3(0.36, 0.17, 0.08) : new THREE.Vector3(0.09, 0.08, 0.065);
    const pattern = approxPattern(pkgText + ' ' + (look?.word ?? ''));
    u.pattern.value = pattern;
    const emitCol = roles.emit ? v3(val[roles.emit], [0, 0, 0]) : pattern === 5 ? new THREE.Vector3(1, 0.36, 0.05) : pattern === 1 && roles.glowAmt ? new THREE.Vector3(0.3, 0.75, 1) : new THREE.Vector3();
    u.emitC.value = emitCol;
    u.glow.value = roles.glowAmt ? Math.min(2, n01(roles.glowAmt, 0.5) * 2) : 1;
    u.rough.value = roles.rough ? n01(roles.rough, 0.6) : roles.gloss ? 1 - n01(roles.gloss, 0.4) : look?.rough ?? 0.6;
    u.metal.value = roles.metal && P(roles.metal)!.widget !== 'color' ? n01(roles.metal, 0) : roles.metal ? num(roles.metal, 0) : look?.metal ?? (/metal|iron|steel|gold|copper|brass|silver|bronze|alumin|sci.?fi/i.test(pkgText) ? 1 : 0);
    const sc = P(roles.scale);
    const defScale = pattern === 1 ? 3 : pattern === 2 ? 5 : pattern === 4 ? 4 : pattern === 5 ? 5 : pattern === 3 || pattern === 6 ? 6 : 4;
    u.scale.value = Math.max(1, Math.round(sc ? Math.min(64, defScale * (num(sc.id, sc.def[0] ?? 1) / Math.max(1e-3, sc.def[0] || 1))) : defScale));
    u.period.value = u.scale.value;
    u.edgeAmt.value = n01(roles.edgeAmt, 0.5);
    u.dirtAmt.value = n01(roles.dirtAmt, 0.4);
    u.bump.value = n01(roles.bump, 0.5);
    u.varAmt.value = n01(roles.varAmt, 0.5);
    u.hueShift.value = delta(roles.hue); u.satMul.value = Math.max(0, 1 + delta(roles.sat) * 2); u.lumAdd.value = delta(roles.lum) * 0.6; u.contrast.value = delta(roles.contrast);
    u.seed.value = st.seed;
    const modes: [Ch, number][] = [['color', 0], ['rough', 1], ['metal', 2], ['height', 3]];
    if (emitCol.lengthSq() > 0) modes.push(['emit', 4]);
    for (const [ch, m] of modes) { u.outMode.value = m; this.gpu.run(this.ap, out[ch] = rt(ch)); }
    return out;
  }
}
