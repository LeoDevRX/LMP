/**
 * Procedural grayscale patterns (GPU), ported from TextureCraft (MIT / Apache-2.0,
 * https://github.com/storytold/texturecraft — crates/texel/src/noise.rs and
 * crates/compose/src/pattern.rs). Same hashes (pcg3d), same noises and the same pattern recipes,
 * so smart masks and procedural materials look like TextureCraft's.
 *
 * Coordinates are model positions normalized by the bounding box (centre 0, half diagonal 1).
 */

export const PATTERNS = [
  'clouds', 'perlin', 'noise', 'cells', 'grunge', 'scratches', 'checker', 'stripes', 'gradient', 'wood', 'bricks', 'tiles',
  'weave', 'twill', 'leather', 'hammered', 'brushed', 'marble', 'voronoi', 'streaks', 'smudges', 'pores', 'chips',
] as const;
export type PatternType = (typeof PATTERNS)[number];
export const PATTERN_LABEL: Record<PatternType, string> = {
  clouds: 'Clouds', perlin: 'Perlin noise', noise: 'Fine noise', cells: 'Cells', grunge: 'Grunge', scratches: 'Scratches',
  checker: 'Checker', stripes: 'Stripes', gradient: 'Linear gradient', wood: 'Wood grain', bricks: 'Bricks', tiles: 'Tiles',
  weave: 'Weave', twill: 'Twill', leather: 'Leather', hammered: 'Hammered', brushed: 'Brushed', marble: 'Marble',
  voronoi: 'Voronoi', streaks: 'Streaks / leaks', smudges: 'Smudges / fingerprints', pores: 'Pores', chips: 'Chips',
};
export const patternIndex = (p: PatternType) => Math.max(0, PATTERNS.indexOf(p));

/** A procedural channel source of a fill layer: the pattern's 0..1 value maps to low..high. */
export interface ProcSource {
  pattern: PatternType;
  scale: number;
  seed: number;
  contrast: number;
  balance?: number;
  invert?: boolean;
  /** Values at pattern = 0 and 1 (sRGB color, or a scalar in [0]). */
  low: [number, number, number];
  high: [number, number, number];
}
export const procKey = (p: ProcSource) => `${p.pattern}|${p.scale}|${p.seed}|${p.contrast}|${p.balance ?? 0}|${p.invert ? 1 : 0}`;

export const GLSL_NOISE = /* glsl */ `
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
float u2f(uint v) { return float(v) / 4294967295.0; }
float hash01(ivec3 c, uint seed) { return u2f(pcg3d(uvec3(uint(c.x) ^ (seed * 0x9E3779B9u), uint(c.y), uint(c.z))).x); }
float sq5(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float tcValue(vec3 p, uint seed) {
  vec3 fl = floor(p); ivec3 i = ivec3(fl); vec3 f = p - fl;
  vec3 s = vec3(sq5(f.x), sq5(f.y), sq5(f.z));
  float a = mix(hash01(i, seed), hash01(i + ivec3(1, 0, 0), seed), s.x);
  float b = mix(hash01(i + ivec3(0, 1, 0), seed), hash01(i + ivec3(1, 1, 0), seed), s.x);
  float c = mix(hash01(i + ivec3(0, 0, 1), seed), hash01(i + ivec3(1, 0, 1), seed), s.x);
  float d = mix(hash01(i + ivec3(0, 1, 1), seed), hash01(i + ivec3(1, 1, 1), seed), s.x);
  return mix(mix(a, b, s.y), mix(c, d, s.y), s.z);
}
float tcGrad(ivec3 c, uint seed, vec3 f) {
  uint h = pcg3d(uvec3(uint(c.x) ^ (seed * 0x85EBCA6Bu), uint(c.y), uint(c.z))).y % 12u;
  vec2 ab = h < 4u ? f.xy : h < 8u ? f.xz : f.yz;
  float sa = (h & 1u) == 1u ? -1.0 : 1.0, sb = (h & 2u) == 2u ? -1.0 : 1.0;
  return sa * ab.x + sb * ab.y;
}
float tcPerlin(vec3 p, uint seed) {
  vec3 fl = floor(p); ivec3 i = ivec3(fl); vec3 f = p - fl;
  vec3 s = vec3(sq5(f.x), sq5(f.y), sq5(f.z));
  float a = mix(tcGrad(i, seed, f), tcGrad(i + ivec3(1, 0, 0), seed, f - vec3(1, 0, 0)), s.x);
  float b = mix(tcGrad(i + ivec3(0, 1, 0), seed, f - vec3(0, 1, 0)), tcGrad(i + ivec3(1, 1, 0), seed, f - vec3(1, 1, 0)), s.x);
  float c = mix(tcGrad(i + ivec3(0, 0, 1), seed, f - vec3(0, 0, 1)), tcGrad(i + ivec3(1, 0, 1), seed, f - vec3(1, 0, 1)), s.x);
  float d = mix(tcGrad(i + ivec3(0, 1, 1), seed, f - vec3(0, 1, 1)), tcGrad(i + ivec3(1, 1, 1), seed, f - vec3(1, 1, 1)), s.x);
  return clamp(mix(mix(a, b, s.y), mix(c, d, s.y), s.z) * 0.5 + 0.5, 0.0, 1.0);
}
// (F1, F2, cell id) of 3D Worley noise.
vec3 tcCellular(vec3 p, uint seed) {
  vec3 fl = floor(p); ivec3 i = ivec3(fl); vec3 f = p - fl;
  float f1 = 1e9, f2 = 1e9; uint id = 0u;
  for (int dz = -1; dz <= 1; dz++) for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
    uvec3 h = pcg3d(uvec3(uint(i.x + dx) ^ (seed * 0xC2B2AE35u), uint(i.y + dy), uint(i.z + dz)));
    vec3 o = vec3(u2f(h.x), u2f(h.y), u2f(h.z));
    vec3 d = vec3(float(dx), float(dy), float(dz)) + o - f;
    float d2 = dot(d, d);
    if (d2 < f1) { f2 = f1; f1 = d2; id = h.x ^ h.y; }
    else if (d2 < f2) f2 = d2;
  }
  return vec3(min(sqrt(f1), 1.0), min(sqrt(f2), 1.0), u2f(id));
}
float fbmValue(vec3 p, int oct, uint seed) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  for (int o = 0; o < 12; o++) {
    if (o >= oct) break;
    sum += amp * tcValue(p, seed + uint(o) * 31u); norm += amp;
    p = p * 2.0 + 17.13; amp *= 0.5;
  }
  return sum / norm;
}
float fbmPerlin(vec3 p, int oct, uint seed) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  for (int o = 0; o < 12; o++) {
    if (o >= oct) break;
    sum += amp * tcPerlin(p, seed + uint(o) * 31u); norm += amp;
    p = p * 2.0 + 17.13; amp *= 0.5;
  }
  return sum / norm;
}
float tcDrip(float x, uint salt, vec3 p, uint seed) {
  float cx = x * 6.0;
  int col = int(floor(cx));
  float h0 = hash01(ivec3(col, 0, int(salt)), seed), h1 = hash01(ivec3(col, 1, int(salt)), seed);
  float h2 = hash01(ivec3(col, 2, int(salt)), seed), h3 = hash01(ivec3(col, 3, int(salt)), seed);
  float width = 0.08 + 0.25 * h0;
  float across = 1.0 - smoothstep(width * 0.3, width, abs(cx - floor(cx) - 0.5 - (h1 - 0.5) * 0.5));
  float yy = p.y * (0.35 + 0.4 * h2) + h3 * 7.0;
  float t = yy - floor(yy);
  float on = hash01(ivec3(col, int(floor(yy)), 3 + int(salt)), seed) > 0.5 ? 1.0 : 0.0;
  return across * on * pow(t, 1.6) * (1.0 - smoothstep(0.9, 1.0, t));
}
float tcPattern(int k, vec3 p, uint seed) {
  const float PI = 3.14159265;
  if (k == 0) return fbmValue(p, 6, seed);
  if (k == 1) return fbmPerlin(p, 4, seed);
  if (k == 2) return tcValue(p * 16.0, seed);
  if (k == 3) return tcCellular(p, seed).x;
  if (k == 4) {
    float n = fbmPerlin(p, 6, seed) * 0.7 + fbmValue(p * 3.7, 3, seed ^ 0x55u) * 0.3;
    return clamp((n - 0.45) * 4.0 + 0.5, 0.0, 1.0);
  }
  if (k == 5) {
    float n = tcPerlin(vec3(p.x * 0.15, p.y * 6.0, p.z * 6.0), seed);
    float line = 1.0 - min(abs(n - 0.5) * 40.0, 1.0);
    float gate = tcValue(p * 0.8, seed ^ 0x99u);
    return line * clamp((gate - 0.45) * 4.0, 0.0, 1.0);
  }
  if (k == 6) { vec3 c = floor(p); return mod(c.x + c.y + c.z, 2.0) < 1.0 ? 1.0 : 0.0; }
  if (k == 7) return fract(p.x) < 0.5 ? 1.0 : 0.0;
  if (k == 8) return fract(p.x);
  if (k == 9) {
    float warp = fbmPerlin(vec3(p.x * 0.18, p.y * 0.6, p.z), 3, seed);
    float t = fract((p.y + (warp - 0.5) * 0.9) * 5.0);
    float ring = 1.0 - smoothstep(0.45, 1.0, t);
    float fiber = tcValue(vec3(p.x * 2.0, p.y * 40.0, p.z), seed ^ 0x3Cu);
    float tone = fbmValue(vec3(p.x * 0.6, p.y * 3.0, p.z), 2, seed ^ 0x71u);
    return clamp(ring * 0.6 + fiber * 0.25 + tone * 0.15, 0.0, 1.0);
  }
  if (k == 10) {
    float row = floor(p.y * 2.0);
    float x = p.x + (mod(row, 2.0) >= 0.5 ? 0.5 : 0.0);
    float col = floor(x), fx = fract(x), fy = fract(p.y * 2.0);
    float d = min(min(fx, 1.0 - fx), min(fy, 1.0 - fy) * 0.5);
    float tone = hash01(ivec3(int(col), int(row), 0), seed) * 0.6 + tcValue(p * 9.0, seed) * 0.4;
    return smoothstep(0.02, 0.045, d) * (0.85 + 0.15 * tone);
  }
  if (k == 11) {
    vec3 c = floor(p), f = p - c;
    float d = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    return smoothstep(0.015, 0.035, d) * (0.9 + 0.1 * hash01(ivec3(int(c.x), int(c.y), 0), seed));
  }
  if (k == 12 || k == 13) {
    vec3 c = floor(p * 2.0), f = p * 2.0 - c;
    bool twill = k == 13;
    float period = twill ? 4.0 : 2.0, cells = twill ? 2.0 : 1.0;
    bool warpTop = mod(c.x + c.y, period) < cells;
    float across = warpTop ? f.y : f.x, along = warpTop ? f.x : f.y;
    float thread = sqrt(max(sin(PI * across), 0.0)) * (0.8 + 0.2 * sin(PI * along));
    float tone = twill && !warpTop ? 0.55 : 1.0;
    float fiber = tcValue(vec3(p.x * 40.0, p.y * 40.0, p.z), seed);
    return clamp(thread * tone * (0.88 + 0.12 * fiber), 0.0, 1.0);
  }
  if (k == 14) {
    float w = tcPerlin(p * 0.7, seed ^ 0x2Du) - 0.5;
    vec3 c = tcCellular(vec3(p.x + w * 0.4, p.y - w * 0.4, p.z), seed);
    float crease = smoothstep(0.0, 0.16, c.y - c.x);
    float pebble = 1.0 - c.x * 0.5;
    float fine = tcValue(p * 7.0, seed ^ 0x13u);
    return clamp(crease * pebble * (0.85 + 0.15 * fine), 0.0, 1.0);
  }
  if (k == 15) {
    float a = pow(min(tcCellular(p, seed).x * 1.25, 1.0), 2.0);
    float b = pow(min(tcCellular(p * 2.3 + 5.1, seed ^ 0x5Au).x * 1.25, 1.0), 2.0);
    return clamp(a * 0.75 + b * 0.25, 0.0, 1.0);
  }
  if (k == 16) {
    float a = tcValue(vec3(p.x * 1.5, p.y * 60.0, p.z), seed);
    float b = tcValue(vec3(p.x * 0.4, p.y * 18.0, p.z), seed ^ 0x77u);
    return clamp(a * 0.6 + b * 0.4, 0.0, 1.0);
  }
  if (k == 17) {
    float turb = fbmPerlin(p, 5, seed);
    float veins = pow(abs(sin((p.x + p.y * 0.5) * 2.5 + turb * 9.0)), 0.3);
    float cloud = fbmValue(p * 2.0, 3, seed ^ 0x19u);
    return clamp(veins * 0.85 + cloud * 0.15, 0.0, 1.0);
  }
  if (k == 18) return tcCellular(p, seed).z;
  if (k == 19) {
    float fine = tcValue(vec3(p.x * 37.0, p.y * 1.3, p.z), seed ^ 0x2Bu);
    return clamp(max(tcDrip(p.x, 0u, p, seed), tcDrip(p.x + 0.37, 1u, p, seed) * 0.8) * (0.6 + 0.4 * fine), 0.0, 1.0);
  }
  if (k == 20) {
    float w = tcPerlin(p * 1.3, seed ^ 0x61u) - 0.5;
    vec3 c = tcCellular(vec3(p.x * 1.15 + w * 0.3, p.y * 0.85 + w * 0.3, p.z), seed);
    float print = (1.0 - smoothstep(0.18 + 0.1 * c.z, 0.3 + 0.12 * c.z, c.x)) * (c.z > 0.4 ? 1.0 : 0.0);
    float ridges = 0.5 + 0.5 * sin(c.x * 190.0 + w * 12.0);
    float smudge = clamp((fbmValue(p * 1.7, 4, seed ^ 0x33u) - 0.55) * 3.0, 0.0, 1.0);
    return clamp(print * ridges * 0.9 + smudge * 0.4, 0.0, 1.0);
  }
  if (k == 21) {
    float f1 = tcCellular(p, seed).x;
    float g1 = tcCellular(p * 2.7 + 13.0, seed ^ 0x6Bu).x;
    return min(smoothstep(0.08, 0.16, f1), smoothstep(0.06, 0.12, g1));
  }
  // 22: chips
  float f1 = tcCellular(p * 2.0, seed ^ 0x45u).x;
  float n = fbmPerlin(p, 5, seed) + (f1 - 0.5) * 0.25;
  return smoothstep(0.55, 0.58, n);
}
// Triplanar pattern (sharpness 8, like TextureCraft's masks); planes with no weight are skipped.
float triPattern(int k, vec3 pn, vec3 n, float scale, uint seed) {
  vec3 p = pn * scale;
  vec3 w = pow(abs(n) + 1e-5, vec3(8.0));
  w /= (w.x + w.y + w.z);
  float s = 0.0, ws = 0.0;
  if (w.x > 0.004) { s += tcPattern(k, vec3(p.z, p.y, 0.0), seed) * w.x; ws += w.x; }
  if (w.y > 0.004) { s += tcPattern(k, vec3(p.x, p.z, 0.0), seed) * w.y; ws += w.y; }
  if (w.z > 0.004) { s += tcPattern(k, vec3(p.x, p.y, 0.0), seed) * w.z; ws += w.z; }
  return s / max(ws, 1e-5);
}
float patShape(float v, float contrast, float balance, bool inv) {
  v = clamp((v - 0.5) * max(contrast, 0.0) + 0.5 + balance, 0.0, 1.0);
  return inv ? 1.0 - v : v;
}
`;

/** Fills a UV-space target with one pattern's value (r), evaluated on the model's surface. */
export const FRAG_PROC = /* glsl */ `
uniform sampler2D posMap;
uniform sampler2D nrmMap;
uniform vec3 ctr;
uniform float rad;
uniform int kind;
uniform float scale;
uniform float seedF;
uniform float contrast;
uniform float balance;
uniform bool inv;
varying vec2 vUv;
${GLSL_NOISE}
void main() {
  vec4 P = texture2D(posMap, vUv);
  vec3 n = normalize(texture2D(nrmMap, vUv).xyz + vec3(1e-6));
  vec3 pn = (P.xyz - ctr) / rad;
  float v = patShape(triPattern(kind, pn, n, scale, uint(seedF)), contrast, balance, inv);
  gl_FragColor = vec4(v, v, v, 1.0);
}`;

/** TextureCraft stores linear colors; TexPaint's values are sRGB. */
export const lin2srgb = (c: number) => {
  c = Math.max(0, Math.min(1, c));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
};
