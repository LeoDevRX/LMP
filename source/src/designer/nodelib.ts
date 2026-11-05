/**
 * Built-in nodes of the Material Designer. Every node is plain GLSL with a comment header, the same
 * format custom nodes use (Shader Maker), so they double as examples:
 *
 *   // @name My Node
 *   // @category Custom
 *   // @description What it does
 *   // @input a                       (sampled with input_a(uv), has_a tells if it's connected)
 *   // @output gray | color
 *   // @param scale: float(1, 64) = 6
 *   // @param count: int(1, 16) = 4
 *   // @param tint: color = 1, 0.5, 0
 *   // @param mode: enum(Add|Multiply) = 0
 *   // @param flip: bool = 0
 *   vec4 node(vec2 uv) { ... }
 *
 * Helpers available to every node: tnoise / tperlin / tfbm / tcells (tileable: the period is
 * rounded to a whole number so textures repeat seamlessly), hash12, rot2, lum, texel (1 / size).
 */

export const NODE_LIB_GLSL = /* glsl */ `
uvec3 _pcg(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
float hash12(vec2 c, float seed) {
  ivec2 i = ivec2(floor(c));
  return float(_pcg(uvec3(uint(i.x), uint(i.y), uint(int(seed)) * 747796405u + 1u)).x) / 4294967295.0;
}
vec2 hash22(vec2 c, float seed) {
  ivec2 i = ivec2(floor(c));
  uvec3 h = _pcg(uvec3(uint(i.x), uint(i.y), uint(int(seed)) * 747796405u + 1u));
  return vec2(h.xy) / 4294967295.0;
}
float _per(float p) { return max(1.0, floor(p + 0.5)); }
vec2 _wrap(vec2 c, float per) { return mod(c, per); }
// Tileable value noise: 'period' cells across the texture.
float tnoise(vec2 uv, float period, float seed) {
  float P = _per(period);
  vec2 p = uv * P, i = floor(p), f = p - i;
  vec2 s = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash12(_wrap(i, P), seed), b = hash12(_wrap(i + vec2(1, 0), P), seed);
  float c = hash12(_wrap(i + vec2(0, 1), P), seed), d = hash12(_wrap(i + vec2(1, 1), P), seed);
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}
float _g(vec2 c, float P, float seed, vec2 f) {
  float a = hash12(_wrap(c, P), seed + 17.0) * 6.2831853;
  return dot(vec2(cos(a), sin(a)), f);
}
// Tileable gradient (Perlin) noise, 0..1.
float tperlin(vec2 uv, float period, float seed) {
  float P = _per(period);
  vec2 p = uv * P, i = floor(p), f = p - i;
  vec2 s = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float v = mix(mix(_g(i, P, seed, f), _g(i + vec2(1, 0), P, seed, f - vec2(1, 0)), s.x),
                mix(_g(i + vec2(0, 1), P, seed, f - vec2(0, 1)), _g(i + vec2(1, 1), P, seed, f - vec2(1, 1)), s.x), s.y);
  return clamp(v * 0.7071 + 0.5, 0.0, 1.0);
}
// Tileable fractal noise: octaves double the period; roughness = amplitude falloff.
float tfbm(vec2 uv, float period, int octaves, float roughness, float seed) {
  float sum = 0.0, amp = 1.0, norm = 0.0, P = _per(period);
  for (int o = 0; o < 12; o++) {
    if (o >= octaves) break;
    sum += amp * tperlin(uv, P, seed + float(o) * 31.0); norm += amp;
    P *= 2.0; amp *= roughness;
  }
  return sum / max(norm, 1e-5);
}
// Tileable Worley cells: (F1, F2, cell id).
vec3 tcells(vec2 uv, float period, float jitter, float seed) {
  float P = _per(period);
  vec2 p = uv * P, i = floor(p), f = p - i;
  float f1 = 9.0, f2 = 9.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 c = _wrap(i + o, P);
    vec2 r = o + 0.5 + (hash22(c, seed) - 0.5) * jitter - f;
    float d = length(r);
    if (d < f1) { f2 = f1; f1 = d; id = hash12(c, seed + 91.0); } else if (d < f2) f2 = d;
  }
  return vec3(f1, f2, id);
}
vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// Shapes in a unit cell (q in -1..1): 0 square, 1 disc, 2 diamond, 3 ring, 4 hexagon, 5 star, 6 bell.
float shapeAt(vec2 q, int kind, float size, float soft) {
  q /= max(size, 1e-3);
  float d;
  if (kind == 0) d = max(abs(q.x), abs(q.y));
  else if (kind == 1) d = length(q);
  else if (kind == 2) d = abs(q.x) + abs(q.y);
  else if (kind == 3) d = abs(length(q) - 0.7) + 0.7;
  else if (kind == 4) { vec2 a = abs(q); d = max(a.x * 0.866 + a.y * 0.5, a.y); }
  else if (kind == 5) { float an = atan(q.y, q.x); d = length(q) / (0.65 + 0.35 * cos(an * 5.0)); }
  else return exp(-dot(q, q) * 3.0) * step(length(q), 1.0);
  float s = max(soft, 0.002);
  return 1.0 - smoothstep(1.0 - s, 1.0, d);
}
`;

const n = (s: string) => s.trim() + '\n';

export const BUILTIN_NODES: string[] = [
  // ---------------------------------------------------------------- generators
  n(`// @name Uniform Color
// @category Generators
// @description One flat color (or gray value).
// @output color
// @param color: color = 0.5, 0.5, 0.5
vec4 node(vec2 uv) { return vec4(color, 1.0); }`),
  n(`// @name Gradient
// @category Generators
// @description Linear, radial or angular ramp.
// @output gray
// @param mode: enum(Linear|Radial|Angular|Mirror) = 0
// @param angle: float(0, 360) = 90
// @param repeat: int(1, 32) = 1
vec4 node(vec2 uv) {
  vec2 q = uv - 0.5;
  float v;
  if (mode == 1) v = 1.0 - clamp(length(q) * 2.0, 0.0, 1.0);
  else if (mode == 2) v = atan(q.y, q.x) / 6.2831853 + 0.5;
  else { vec2 d = vec2(cos(radians(angle)), sin(radians(angle))); v = dot(q, d) + 0.5; if (mode == 3) v = 1.0 - abs(v * 2.0 - 1.0); }
  v = fract(v * float(repeat) - 1e-4 * float(repeat > 1));
  return vec4(clamp(v, 0.0, 1.0));
}`),
  n(`// @name Noise
// @category Generators
// @description Tileable fractal (Perlin) noise.
// @output gray
// @param scale: float(1, 64) = 6
// @param octaves: int(1, 10) = 5
// @param roughness: float(0.1, 0.9) = 0.5
// @param seed: int(0, 1000) = 0
vec4 node(vec2 uv) { return vec4(tfbm(uv, scale, octaves, roughness, float(seed))); }`),
  n(`// @name Clouds
// @category Generators
// @description Soft value-noise clouds.
// @output gray
// @param scale: float(1, 32) = 4
// @param seed: int(0, 1000) = 1
vec4 node(vec2 uv) {
  float s = 0.0, a = 0.5, nrm = 0.0, P = scale;
  for (int o = 0; o < 7; o++) { s += a * tnoise(uv, P, float(seed + o * 13)); nrm += a; P *= 2.0; a *= 0.5; }
  return vec4(s / nrm);
}`),
  n(`// @name Directional Noise
// @category Generators
// @description Noise stretched along one direction (brushed metal, wood fibres).
// @output gray
// @param scale: float(1, 64) = 4
// @param stretch: int(1, 64) = 16
// @param seed: int(0, 1000) = 2
vec4 node(vec2 uv) {
  float s = 0.0, a = 0.5, nrm = 0.0;
  for (int o = 0; o < 5; o++) {
    float k = pow(2.0, float(o));
    vec2 P = vec2(max(1.0, floor(scale * k + 0.5)), max(1.0, floor(scale * k * float(stretch) + 0.5)));
    vec2 q = uv * P, i = floor(q), f = q - i; f = f * f * (3.0 - 2.0 * f);
    float sd = float(seed + o * 7);
    float h00 = hash12(mod(i, P), sd), h10 = hash12(mod(i + vec2(1, 0), P), sd);
    float h01 = hash12(mod(i + vec2(0, 1), P), sd), h11 = hash12(mod(i + vec2(1, 1), P), sd);
    s += a * mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y); nrm += a; a *= 0.5;
  }
  return vec4(s / nrm);
}`),
  n(`// @name Cells
// @category Generators
// @description Worley cells: distance to the nearest point, borders, or random cell tones.
// @output gray
// @param scale: float(1, 64) = 8
// @param mode: enum(Distance|Borders|Cell tone|Inverted) = 0
// @param jitter: float(0, 1) = 1
// @param seed: int(0, 1000) = 3
vec4 node(vec2 uv) {
  vec3 c = tcells(uv, scale, jitter, float(seed));
  float v = mode == 0 ? clamp(c.x, 0.0, 1.0) : mode == 1 ? clamp((c.y - c.x) * 2.0, 0.0, 1.0) : mode == 2 ? c.z : 1.0 - clamp(c.x, 0.0, 1.0);
  return vec4(v);
}`),
  n(`// @name Tiles
// @category Generators
// @description Tiles or bricks with mortar gaps and per-tile tone.
// @output gray
// @param columns: int(1, 32) = 4
// @param rows: int(1, 64) = 8
// @param offset: float(0, 1) = 0.5
// @param gap: float(0, 0.3) = 0.04
// @param bevel: float(0, 0.5) = 0.05
// @param variation: float(0, 1) = 0.3
// @param seed: int(0, 1000) = 4
vec4 node(vec2 uv) {
  float R = float(rows), C = float(columns);
  float r = floor(uv.y * R);
  float x = uv.x * C + mod(r, 2.0) * offset;
  vec2 cell = vec2(mod(floor(x), C), r);
  vec2 f = vec2(fract(x), fract(uv.y * R));
  float d = min(min(f.x, 1.0 - f.x) * (R / C), min(f.y, 1.0 - f.y));
  float m = smoothstep(gap * 0.5, gap * 0.5 + bevel + 1e-4, d);
  float tone = 1.0 - variation * hash12(cell, float(seed));
  return vec4(m * tone);
}`),
  n(`// @name Checker
// @category Generators
// @description Checkerboard.
// @output gray
// @param tiles: int(1, 64) = 8
vec4 node(vec2 uv) { vec2 c = floor(uv * float(tiles)); return vec4(mod(c.x + c.y, 2.0)); }`),
  n(`// @name Shape
// @category Generators
// @description A soft-edged shape, repeated in a grid.
// @output gray
// @param shape: enum(Square|Disc|Diamond|Ring|Hexagon|Star|Bell) = 0
// @param size: float(0.05, 1) = 0.72
// @param softness: float(0, 1) = 0.56
// @param repeat: int(1, 64) = 1
// @param rotation: float(0, 360) = 0
vec4 node(vec2 uv) {
  vec2 q = (fract(uv * float(repeat)) - 0.5) * 2.0;
  return vec4(shapeAt(rot2(q, radians(rotation)), shape, size, softness));
}`),
  n(`// @name Tile Sampler
// @category Generators
// @description Scatters a shape (or the input) on a grid with random size, rotation, position and tone.
// @input pattern
// @output gray
// @param count: int(1, 64) = 8
// @param shape: enum(Square|Disc|Diamond|Ring|Hexagon|Star|Bell) = 1
// @param size: float(0.05, 2) = 0.7
// @param sizeRandom: float(0, 1) = 0.4
// @param rotationRandom: float(0, 1) = 1
// @param positionRandom: float(0, 1) = 0.6
// @param toneRandom: float(0, 1) = 0.5
// @param seed: int(0, 1000) = 5
vec4 node(vec2 uv) {
  float N = float(count), v = 0.0;
  vec2 g = uv * N, i = floor(g);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = i + vec2(float(x), float(y)), cw = mod(c, N);
    vec2 h = hash22(cw, float(seed));
    vec2 ctr = c + 0.5 + (h - 0.5) * positionRandom;
    float s = size * (1.0 - sizeRandom * hash12(cw, float(seed) + 7.0)) * 0.5;
    vec2 q = rot2(g - ctr, hash12(cw, float(seed) + 3.0) * 6.2831853 * rotationRandom) / max(s, 1e-3);
    float t = 1.0 - toneRandom * hash12(cw, float(seed) + 11.0);
    float m = has_pattern ? (max(abs(q.x), abs(q.y)) < 1.0 ? input_pattern(q * 0.5 + 0.5).r : 0.0) : shapeAt(q, shape, 1.0, 0.3);
    v = max(v, m * t);
  }
  return vec4(v);
}`),
  n(`// @name Scratches
// @category Generators
// @description Thin random scratches along a main direction.
// @output gray
// @param count: int(1, 200) = 60
// @param len: float(0.02, 1) = 0.25
// @param width: float(0.0005, 0.02) = 0.0025
// @param angle: float(0, 180) = 30
// @param spread: float(0, 1) = 0.3
// @param seed: int(0, 1000) = 6
vec4 node(vec2 uv) {
  float v = 0.0;
  for (int k = 0; k < 200; k++) {
    if (k >= count) break;
    float fk = float(k);
    vec2 c = vec2(hash12(vec2(fk, 1.0), float(seed)), hash12(vec2(fk, 2.0), float(seed)));
    float a = radians(angle) + (hash12(vec2(fk, 3.0), float(seed)) - 0.5) * 3.14159 * spread;
    float L = len * (0.4 + 0.6 * hash12(vec2(fk, 4.0), float(seed)));
    vec2 d = vec2(cos(a), sin(a));
    vec2 p = uv - c; p -= floor(p + 0.5); // nearest tile copy: seamless
    float t = clamp(dot(p, d) / L, -0.5, 0.5);
    float dist = length(p - d * t * L);
    float taper = sqrt(max(0.0, 1.0 - 4.0 * t * t));
    v = max(v, (1.0 - smoothstep(width * taper * 0.5, width * taper, dist)) * (0.5 + 0.5 * hash12(vec2(fk, 5.0), float(seed))));
  }
  return vec4(v);
}`),
  n(`// @name Grunge
// @category Generators
// @description Blotchy grunge: thresholded fractal noise with fine speckles.
// @output gray
// @param scale: float(1, 32) = 3
// @param coverage: float(0, 1) = 0.5
// @param sharpness: float(1, 20) = 5
// @param seed: int(0, 1000) = 8
vec4 node(vec2 uv) {
  float n1 = tfbm(uv, scale, 6, 0.55, float(seed));
  float n2 = tnoise(uv, scale * 12.0, float(seed) + 5.0);
  float v = clamp((n1 * 0.85 + n2 * 0.15 - (1.0 - coverage) * 0.5 - 0.25) * sharpness + 0.5, 0.0, 1.0);
  return vec4(v);
}`),
  n(`// @name Wood Rings
// @category Generators
// @description Wavy growth rings with fibres.
// @output gray
// @param rings: float(1, 40) = 8
// @param warp: float(0, 2) = 0.6
// @param seed: int(0, 1000) = 7
vec4 node(vec2 uv) {
  float w = tfbm(uv, 2.0, 4, 0.5, float(seed)) - 0.5;
  float t = fract(uv.y * floor(rings + 0.5) + w * warp * 2.0);
  float ring = 1.0 - smoothstep(0.4, 1.0, t);
  float fibre = hash12(floor(vec2(uv.x * 4.0, uv.y * 256.0)), float(seed)) * 0.15;
  return vec4(clamp(ring * 0.75 + fibre + 0.1, 0.0, 1.0));
}`),
  n(`// @name Stripes
// @category Generators
// @description Parallel stripes.
// @output gray
// @param count: int(1, 128) = 8
// @param width: float(0, 1) = 0.5
// @param softness: float(0, 0.5) = 0.02
// @param vertical: bool = 0
vec4 node(vec2 uv) {
  float t = fract((vertical ? uv.x : uv.y) * float(count));
  float d = abs(t - 0.5) * 2.0;
  return vec4(1.0 - smoothstep(width - softness, width + softness + 1e-4, d));
}`),
  n(`// @name Weave
// @category Generators
// @description Plain-weave fabric threads.
// @output gray
// @param threads: int(2, 128) = 16
vec4 node(vec2 uv) {
  vec2 p = uv * float(threads), c = floor(p), f = p - c;
  bool over = mod(c.x + c.y, 2.0) < 1.0;
  float across = over ? f.y : f.x, along = over ? f.x : f.y;
  float th = sqrt(max(sin(3.14159 * across), 0.0)) * (0.8 + 0.2 * sin(3.14159 * along));
  return vec4(th);
}`),
  n(`// @name Image
// @category Inputs
// @description A picture loaded from a file (click "Load image" in the node settings).
// @output color
// @param tiling: int(1, 16) = 1
vec4 node(vec2 uv) { return has_image ? image(uv * float(tiling)) : vec4(0.5, 0.5, 0.5, 1.0); }`),
  // ---------------------------------------------------------------- adjust
  n(`// @name Levels
// @category Adjust
// @description Input range, gamma and output range.
// @input input
// @output color
// @param inLow: float(0, 1) = 0
// @param inHigh: float(0, 1) = 1
// @param gamma: float(0.1, 5) = 1
// @param outLow: float(0, 1) = 0
// @param outHigh: float(0, 1) = 1
vec4 node(vec2 uv) {
  vec3 c = input_input(uv).rgb;
  c = clamp((c - inLow) / max(inHigh - inLow, 1e-4), 0.0, 1.0);
  c = pow(c, vec3(1.0 / gamma));
  return vec4(mix(vec3(outLow), vec3(outHigh), c), 1.0);
}`),
  n(`// @name Invert
// @category Adjust
// @description 1 − input.
// @input input
// @output color
vec4 node(vec2 uv) { return vec4(1.0 - input_input(uv).rgb, 1.0); }`),
  n(`// @name HSL
// @category Adjust
// @description Hue shift, saturation and lightness.
// @input input
// @output color
// @param hue: float(-0.5, 0.5) = 0
// @param saturation: float(0, 2) = 1
// @param lightness: float(-1, 1) = 0
vec4 node(vec2 uv) {
  vec3 c = input_input(uv).rgb;
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  vec3 h = vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
  h.x = fract(h.x + hue); h.y = clamp(h.y * saturation, 0.0, 1.0);
  vec3 rgb = h.z * mix(vec3(1.0), clamp(abs(fract(h.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0), h.y);
  return vec4(clamp(rgb + lightness, 0.0, 1.0), 1.0);
}`),
  n(`// @name Posterize
// @category Adjust
// @description Reduce to a few steps.
// @input input
// @output color
// @param steps: int(2, 32) = 4
vec4 node(vec2 uv) { return vec4(floor(input_input(uv).rgb * float(steps)) / float(steps - 1), 1.0); }`),
  n(`// @name Gradient Map
// @category Adjust
// @description Colors a grayscale input with a 3-color ramp.
// @input input
// @output color
// @param low: color = 0.12, 0.05, 0.02
// @param mid: color = 0.55, 0.25, 0.08
// @param high: color = 0.95, 0.75, 0.45
// @param midPoint: float(0.01, 0.99) = 0.5
vec4 node(vec2 uv) {
  float t = clamp(input_input(uv).r, 0.0, 1.0);
  vec3 c = t < midPoint ? mix(low, mid, t / midPoint) : mix(mid, high, (t - midPoint) / (1.0 - midPoint));
  return vec4(c, 1.0);
}`),
  n(`// @name Histogram Scan
// @category Adjust
// @description Threshold with a soft edge: position picks the level, contrast the edge.
// @input input
// @output gray
// @param position: float(0, 1) = 0.5
// @param contrast: float(0, 1) = 0.5
vec4 node(vec2 uv) {
  float v = input_input(uv).r, w = mix(0.5, 0.002, contrast);
  float t = 1.0 - position;
  return vec4(smoothstep(t - w, t + w, v));
}`),
  n(`// @name Grayscale
// @category Adjust
// @description Luminance of a color.
// @input input
// @output gray
vec4 node(vec2 uv) { return vec4(lum(input_input(uv).rgb)); }`),
  n(`// @name Brightness Contrast
// @category Adjust
// @description Brightness and contrast.
// @input input
// @output color
// @param brightness: float(-1, 1) = 0
// @param contrast: float(0, 4) = 1
vec4 node(vec2 uv) { vec3 c = input_input(uv).rgb; return vec4(clamp((c - 0.5) * contrast + 0.5 + brightness, 0.0, 1.0), 1.0); }`),
  n(`// @name Math
// @category Adjust
// @description Combine two inputs (or an input and a value).
// @input a
// @input b
// @output color
// @param op: enum(Add|Subtract|Multiply|Divide|Min|Max|Power|Difference) = 2
// @param value: float(0, 4) = 1
vec4 node(vec2 uv) {
  vec3 a = input_a(uv).rgb, b = has_b ? input_b(uv).rgb : vec3(value);
  vec3 r = op == 0 ? a + b : op == 1 ? a - b : op == 2 ? a * b : op == 3 ? a / max(b, vec3(1e-4)) : op == 4 ? min(a, b) : op == 5 ? max(a, b) : op == 6 ? pow(max(a, 0.0), b) : abs(a - b);
  return vec4(clamp(r, 0.0, 1.0), 1.0);
}`),
  n(`// @name Colorize
// @category Adjust
// @description Lerp between two colors with a grayscale input.
// @input input
// @output color
// @param black: color = 0, 0, 0
// @param white: color = 1, 1, 1
vec4 node(vec2 uv) { return vec4(mix(black, white, input_input(uv).r), 1.0); }`),
  // ---------------------------------------------------------------- blend
  n(`// @name Blend
// @category Blend
// @description Foreground over background, optionally through a mask.
// @input foreground
// @input background
// @input mask
// @output color
// @param mode: enum(Copy|Add|Subtract|Multiply|Screen|Overlay|Max|Min|Difference) = 0
// @param opacity: float(0, 1) = 1
vec4 node(vec2 uv) {
  vec3 f = input_foreground(uv).rgb, b = input_background(uv).rgb, r;
  if (mode == 1) r = b + f; else if (mode == 2) r = b - f; else if (mode == 3) r = b * f;
  else if (mode == 4) r = 1.0 - (1.0 - b) * (1.0 - f);
  else if (mode == 5) r = mix(2.0 * b * f, 1.0 - 2.0 * (1.0 - b) * (1.0 - f), step(0.5, b));
  else if (mode == 6) r = max(b, f); else if (mode == 7) r = min(b, f); else if (mode == 8) r = abs(b - f); else r = f;
  float m = (has_mask ? input_mask(uv).r : 1.0) * opacity;
  return vec4(clamp(mix(b, r, m), 0.0, 1.0), 1.0);
}`),
  // ---------------------------------------------------------------- filters
  n(`// @name Blur
// @category Filters
// @description Gaussian-ish blur (wraps around, so it stays tileable).
// @input input
// @output color
// @param radius: float(0, 32) = 4
vec4 node(vec2 uv) {
  vec3 s = vec3(0.0); float w = 0.0;
  for (int y = -4; y <= 4; y++) for (int x = -4; x <= 4; x++) {
    vec2 o = vec2(float(x), float(y));
    float k = exp(-dot(o, o) / 8.0);
    s += input_input(uv + o * texel * radius / 4.0).rgb * k; w += k;
  }
  return vec4(s / w, 1.0);
}`),
  n(`// @name Warp
// @category Filters
// @description Pushes the input along the slope of a gradient input (organic distortion).
// @input input
// @input gradient
// @output color
// @param intensity: float(0, 1) = 0.1
vec4 node(vec2 uv) {
  float e = 2.0;
  float gx = input_gradient(uv + vec2(texel.x * e, 0.0)).r - input_gradient(uv - vec2(texel.x * e, 0.0)).r;
  float gy = input_gradient(uv + vec2(0.0, texel.y * e)).r - input_gradient(uv - vec2(0.0, texel.y * e)).r;
  return input_input(uv + vec2(gx, gy) * intensity * 10.0);
}`),
  n(`// @name Directional Warp
// @category Filters
// @description Shifts the input along an angle by the value of an intensity input.
// @input input
// @input intensity
// @output color
// @param amount: float(0, 0.5) = 0.05
// @param angle: float(0, 360) = 0
vec4 node(vec2 uv) {
  float k = has_intensity ? input_intensity(uv).r : 1.0;
  vec2 d = vec2(cos(radians(angle)), sin(radians(angle)));
  return input_input(uv + d * k * amount);
}`),
  n(`// @name Slope Blur
// @category Filters
// @description Smears the input downhill along a slope input (melted, streaky looks).
// @input input
// @input slope
// @output color
// @param amount: float(0, 0.2) = 0.03
// @param samples: int(2, 16) = 8
vec4 node(vec2 uv) {
  vec3 s = vec3(0.0); vec2 p = uv;
  for (int i = 0; i < 16; i++) {
    if (i >= samples) break;
    float gx = input_slope(p + vec2(texel.x, 0.0)).r - input_slope(p - vec2(texel.x, 0.0)).r;
    float gy = input_slope(p + vec2(0.0, texel.y)).r - input_slope(p - vec2(0.0, texel.y)).r;
    vec2 g = vec2(gx, gy); float l = length(g);
    p -= (l > 1e-6 ? g / l : vec2(0.0)) * amount / float(samples);
    s += input_input(p).rgb;
  }
  return vec4(s / float(samples), 1.0);
}`),
  n(`// @name Edge Detect
// @category Filters
// @description Outlines where the input changes.
// @input input
// @output gray
// @param width: float(0.5, 8) = 1.5
// @param strength: float(0, 20) = 6
vec4 node(vec2 uv) {
  vec2 e = texel * width;
  float gx = input_input(uv + vec2(e.x, 0.0)).r - input_input(uv - vec2(e.x, 0.0)).r;
  float gy = input_input(uv + vec2(0.0, e.y)).r - input_input(uv - vec2(0.0, e.y)).r;
  return vec4(clamp(length(vec2(gx, gy)) * strength, 0.0, 1.0));
}`),
  n(`// @name Normal From Height
// @category Filters
// @description Tangent-space normal map (OpenGL) from a height input.
// @input height
// @output color
// @param strength: float(0, 20) = 4
vec4 node(vec2 uv) {
  float l = input_height(uv - vec2(texel.x, 0.0)).r, r = input_height(uv + vec2(texel.x, 0.0)).r;
  float d = input_height(uv - vec2(0.0, texel.y)).r, u = input_height(uv + vec2(0.0, texel.y)).r;
  vec3 nn = normalize(vec3((l - r) * strength, (d - u) * strength, 1.0));
  return vec4(nn * 0.5 + 0.5, 1.0);
}`),
  n(`// @name Ambient Occlusion (texture)
// @category Filters
// @description Cavity darkening estimated from a height input.
// @input height
// @output gray
// @param radius: float(1, 32) = 8
// @param strength: float(0, 4) = 1.5
vec4 node(vec2 uv) {
  float h = input_height(uv).r, occ = 0.0;
  for (int k = 0; k < 12; k++) {
    float a = float(k) * 2.39996, rr = (float(k) + 1.0) / 12.0 * radius;
    occ += max(0.0, input_height(uv + vec2(cos(a), sin(a)) * texel * rr).r - h);
  }
  return vec4(clamp(1.0 - occ / 12.0 * strength * 4.0, 0.0, 1.0));
}`),
  n(`// @name Transform
// @category Filters
// @description Tile, rotate and offset the input.
// @input input
// @output color
// @param tiling: int(1, 16) = 1
// @param rotation: enum(0°|90°|180°|270°) = 0
// @param offsetX: float(0, 1) = 0
// @param offsetY: float(0, 1) = 0
vec4 node(vec2 uv) {
  vec2 q = uv * float(tiling) + vec2(offsetX, offsetY);
  q = rotation == 1 ? vec2(-q.y, q.x) : rotation == 2 ? -q : rotation == 3 ? vec2(q.y, -q.x) : q;
  return input_input(q);
}`),
  // ---------------------------------------------------------------- output
  n(`// @name Output
// @category Outputs
// @description Sends its input to a channel of the fill layer this graph drives.
// @input input
// @output color
// @param channel: enum(Base color|Roughness|Metallic|Height|Normal|Emissive) = 0
vec4 node(vec2 uv) { return has_input ? input_input(uv) : vec4(0.5, 0.5, channel == 4 ? 1.0 : 0.5, 1.0); }`),
];
