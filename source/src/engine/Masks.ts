/** Mask generators: procedural masks driven by the baked mesh maps. */
import { GLSL_NOISE, PatternType } from './Procedural';
import { SpSettings, SpInput, SpKind, SpValue, spDefaults, spFromPainter } from './PainterGen';
import { PAINTER_RECIPES } from './painterRecipes';

export type GenType = 'edge' | 'dirt' | 'ao' | 'gradient' | 'dust' | 'noise' | 'curvature' | 'thick' | 'id' | 'pattern' | 'shape' | 'painter';
/** Shapes for the Shape generator. */
export type ShapeKind = 'circle' | 'square' | 'rounded' | 'triangle' | 'star' | 'hexagon' | 'diamond' | 'ring' | 'heart' | 'cross'
  | 'capsule' | 'crescent' | 'brick' | 'paraboloid' | 'bell' | 'gaussian' | 'thorn' | 'pyramid' | 'cone' | 'gradation' | 'waves';
/** Order matters: it's the index the shader uses. */
export const SHAPE_KINDS: ShapeKind[] = ['circle', 'square', 'rounded', 'triangle', 'star', 'hexagon', 'diamond', 'ring', 'heart', 'cross',
  'capsule', 'crescent', 'brick', 'paraboloid', 'bell', 'gaussian', 'thorn', 'pyramid', 'cone', 'gradation', 'waves'];
export const SHAPE_LABEL: Record<ShapeKind, string> = {
  circle: 'Disc / circle', square: 'Square', rounded: 'Rounded square', triangle: 'Triangle', star: 'Star', hexagon: 'Hexagon',
  diamond: 'Diamond', ring: 'Ring', heart: 'Heart', cross: 'Cross / plus', capsule: 'Capsule', crescent: 'Crescent', brick: 'Brick',
  paraboloid: 'Paraboloid (soft dome)', bell: 'Bell (soft)', gaussian: 'Gaussian (very soft)', thorn: 'Thorn (spike)', pyramid: 'Pyramid',
  cone: 'Cone', gradation: 'Gradation (ramp)', waves: 'Waves (stripes)',
};
/** Shapes that are a smooth height profile rather than a hard outline. */
export const SOFT_SHAPES: ShapeKind[] = ['paraboloid', 'bell', 'gaussian', 'thorn', 'pyramid', 'cone', 'gradation', 'waves'];
/** How an effect combines with the effects below it (Substance / TextureCraft mask layers). */
export type FxBlend = 'normal' | 'multiply' | 'lighten' | 'darken' | 'add' | 'subtract' | 'screen' | 'overlay' | 'difference';
export const FX_BLENDS: FxBlend[] = ['normal', 'multiply', 'lighten', 'darken', 'add', 'subtract', 'screen', 'overlay', 'difference'];
export const FX_BLEND_LABEL: Record<FxBlend, string> = {
  normal: 'Normal', multiply: 'Multiply (cut away)', lighten: 'Lighten / max (add more)', darken: 'Darken / min', add: 'Add',
  subtract: 'Subtract', screen: 'Screen', overlay: 'Overlay', difference: 'Difference',
};
/** One more effect stacked on the mask's main generator. */
export interface MaskFx extends GenSettings { blend: FxBlend; opacity: number; on?: boolean }
export type Axis = 'x' | 'y' | 'z';

export interface GenSettings {
  type: GenType;
  /** How much of the surface the mask covers (0..1). */
  amount: number;
  /** Sharpness of the mask's edge (0 = soft, 1 = hard). */
  contrast: number;
  /** Noise breakup of the mask edge (0..1). */
  noise: number;
  /** Size of the noise; bigger = finer detail. */
  noiseScale: number;
  /** Direction for gradient and dust. */
  axis: Axis;
  flip: boolean;
  invert: boolean;
  seed: number;
  /** ID color selection: picked ID map colors (up to 8) and how close a color must be. */
  colors?: [number, number, number][];
  tolerance?: number;
  /** Pattern generator: which pattern and its size (cells across the model). */
  pattern?: PatternType;
  scale?: number;
  /** Shape generator: which shape, where it sits on the model (model space) and which way it faces. */
  shape?: ShapeKind;
  shapeAt?: [number, number, number];
  shapeNormal?: [number, number, number];
  /** Half width as a fraction of the model's size. */
  shapeSize?: number;
  /** Width ÷ height. */
  shapeAspect?: number;
  /** Degrees. */
  shapeRot?: number;
  /** 'decal' = placed on the model (default), 'uv' = repeats over the UVs with tiling (Substance's default). */
  shapeProj?: 'decal' | 'uv';
  shapeTile?: number;
  shapeOff?: [number, number];
  /** Micro details (Substance anchor points): the height stack up to an anchored layer adds rims and cavities. */
  micro?: { anchor: string; amount: number };
  /** Extra effects (bottom → top) blended over this one, like Substance's mask stack. */
  fx?: MaskFx[];
  /** Invert the whole stack at the end. */
  outInvert?: boolean;
  /** type 'painter': a Substance Painter-style generator (Dirt, Metal Edge Wear, Mask Editor…) with Painter's parameters. */
  sp?: SpSettings;
  /** Painter-style presets: the `amount` they were tuned at. Moving `amount` away from it grows / shrinks the whole mask. */
  spBase?: number;
}

export const GEN_LABEL: Record<GenType, string> = {
  edge: 'Edge wear',
  dirt: 'Dirt / cavity',
  ao: 'Ambient occlusion',
  gradient: 'Position gradient',
  dust: 'Dust (facing)',
  noise: 'Grunge noise',
  curvature: 'Curvature',
  thick: 'Thickness',
  id: 'ID color selection',
  pattern: 'Procedural pattern',
  shape: 'Shape (circle, star…)',
  painter: 'Painter generator',
};
export const GEN_TYPES = Object.keys(GEN_LABEL) as GenType[];
const GEN_INDEX: Record<GenType, number> = { edge: 0, dirt: 1, ao: 2, gradient: 3, dust: 4, noise: 5, curvature: 6, thick: 8, id: 7, pattern: 9, shape: 10, painter: 11 };

export function defaultGen(type: GenType): GenSettings {
  const base: GenSettings = {
    type, amount: 0.5, contrast: 0.6, noise: 0.35, noiseScale: 8, axis: 'y', flip: false, invert: false,
    seed: Math.round(Math.random() * 1000),
  };
  switch (type) {
    case 'edge': return { ...base, amount: 0.45, contrast: 0.7, noise: 0.45 };
    case 'dirt': return { ...base, amount: 0.45, contrast: 0.45, noise: 0.4 };
    case 'ao': return { ...base, amount: 0.4, contrast: 0.4, noise: 0 };
    case 'gradient': return { ...base, amount: 0.5, contrast: 0.3, noise: 0.15 };
    case 'dust': return { ...base, amount: 0.35, contrast: 0.5, noise: 0.5 };
    case 'noise': return { ...base, amount: 0.5, contrast: 0.55, noise: 0, noiseScale: 5 };
    case 'curvature': return { ...base, amount: 0.5, contrast: 0.2, noise: 0 };
    case 'thick': return { ...base, amount: 0.5, contrast: 0.3, noise: 0, invert: true };
    case 'id': return { ...base, amount: 1, contrast: 1, noise: 0, colors: [], tolerance: 0.1 };
    case 'pattern': return { ...base, amount: 0.5, contrast: 1 / 3, noise: 0, pattern: 'grunge', scale: 3 };
    case 'shape': return { ...base, amount: 1, contrast: 0.9, noise: 0, shape: 'circle', shapeSize: 0.2, shapeAspect: 1, shapeRot: 0 };
    case 'painter': return { ...base, amount: 1, contrast: 1, noise: 0, sp: spDefaults('dirt') };
  }
}

export interface LayerMaskSpec {
  /** Mask value where nothing is painted and no generator is set. */
  base: 'white' | 'black';
  gen: GenSettings | null;
}

export const genIndex = (t: GenType) => GEN_INDEX[t];
/** Generators that can follow anchor-point details. */
export const MICRO_TYPES: GenType[] = ['edge', 'dirt', 'ao', 'curvature'];
export const usesMicro = (g: GenSettings) => [g, ...(g.fx ?? [])].some((e) => !!e.micro?.anchor);

/**
 * Detail map of an anchor point's height: r = occlusion (dips are dark), g = curvature (0.5 flat, rims bright).
 * Looks a few texels around each point at two sizes, so thin painted lines and wide shapes both register.
 */
export const FRAG_MICRO = /* glsl */ `
uniform sampler2D heightTex;
uniform vec2 texel;
uniform float gain;
varying vec2 vUv;
float H(vec2 o) { return texture2D(heightTex, vUv + o * texel).r; }
void main() {
  float h0 = H(vec2(0.0));
  float a1 = 0.0, a2 = 0.0;
  for (int i = 0; i < 8; i++) {
    float t = float(i) * 0.785398;
    vec2 d = vec2(cos(t), sin(t));
    a1 += H(d * 2.0);
    a2 += H(d * 6.0);
  }
  float lap = (a1 / 8.0 - h0) * 0.6 + (a2 / 8.0 - h0) * 0.4;
  float cavity = clamp(lap * gain, 0.0, 1.0);
  float convex = clamp(-lap * gain, 0.0, 1.0);
  gl_FragColor = vec4(1.0 - cavity, 0.5 + 0.5 * (convex - cavity), 0.0, 1.0);
}`;
export const axisVec = (a: Axis, flip: boolean): [number, number, number] => {
  const s = flip ? -1 : 1;
  return a === 'x' ? [s, 0, 0] : a === 'y' ? [0, s, 0] : [0, 0, s];
};

// The shader evaluates in model space, so masks are seamless across UV islands.
export const FRAG_GEN = /* glsl */ `
uniform sampler2D posMap;
uniform sampler2D nrmMap;
uniform sampler2D meshMap;
uniform sampler2D paintMask;
uniform bool hasPaint;
uniform bool useGen;
uniform float baseValue;
uniform int type;
uniform float amount;
uniform float contrast;
uniform float noiseAmt;
uniform float noiseScale;
uniform float seed;
uniform vec3 axis;
uniform vec3 bmin;
uniform vec3 bmax;
uniform bool invert;
uniform sampler2D idMap;
uniform vec3 idCols[8];
uniform int idN;
uniform float idTol;
varying vec2 vUv;

uniform vec3 ctr;
uniform float rad;
uniform int patKind;
uniform float patScale;
uniform bool hasPrev;
uniform sampler2D prevMap;
uniform int fxBlend;
uniform float fxOpacity;
uniform bool outInv;
uniform int shpKind;
uniform vec3 shpC;
uniform vec3 shpN;
uniform vec3 shpU;
uniform vec3 shpV;
uniform vec2 shpHalf;
uniform float shpSoft;
uniform bool shpUV;
uniform float shpTile;
uniform vec2 shpOff;
uniform vec2 shpRotCS;
uniform vec2 shpScale;
uniform bool useMicro;
uniform sampler2D microMap;
uniform float microAmt;
${GLSL_NOISE}
// Signed distance of the Shape generator's shapes (negative inside, ~1 unit = half size).
float sdShape(int k, vec2 q) {
  if (k == 1) { vec2 d = abs(q) - 1.0; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
  if (k == 2) { vec2 d = abs(q) - 0.7; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.3; }
  if (k == 3) { q.y += 0.25; const float k3 = 1.7320508; q.x = abs(q.x) - 1.0; q.y = q.y + 1.0 / k3;
    if (q.x + k3 * q.y > 0.0) q = vec2(q.x - k3 * q.y, -k3 * q.x - q.y) / 2.0; q.x -= clamp(q.x, -2.0, 0.0); return -length(q) * sign(q.y); }
  if (k == 4) { float a = atan(q.x, q.y); float r = length(q); float seg = 6.2831853 / 5.0;
    float m = mod(a + seg * 0.5, seg) - seg * 0.5; float rr = mix(0.45, 1.0, pow(abs(cos(m * 2.5)), 6.0)); return r - rr; }
  if (k == 5) { vec2 p = abs(q); return max(p.x * 0.8660254 + p.y * 0.5, p.y) - 0.92; }
  if (k == 6) return (abs(q.x) + abs(q.y)) * 0.7071 - 0.7071;
  if (k == 7) return abs(length(q) - 0.72) - 0.28;
  if (k == 8) { vec2 p = vec2(abs(q.x), -q.y * 1.05 + 0.2); p *= 1.15;
    if (p.y + p.x > 1.0) return (sqrt(dot(p - vec2(0.25, 0.75), p - vec2(0.25, 0.75))) - 0.35355) / 1.15;
    return sqrt(min(dot(p - vec2(0.0, 1.0), p - vec2(0.0, 1.0)), dot(p - 0.5 * max(p.x + p.y, 0.0), p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y) / 1.15; }
  if (k == 9) { vec2 p = abs(q); vec2 a = p - vec2(1.0, 0.33); vec2 b = p - vec2(0.33, 1.0);
    float da = length(max(a, 0.0)) + min(max(a.x, a.y), 0.0); float db = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0); return min(da, db); }
  if (k == 10) { vec2 p = vec2(abs(q.x) - 0.5, q.y); p.x = max(p.x, 0.0); return length(p) - 0.5; }
  if (k == 11) return max(length(q) - 1.0, -(length(q - vec2(0.45, 0.2)) - 0.8));
  if (k == 12) { vec2 d = abs(q) - vec2(1.0, 0.5); return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
  return length(q) - 1.0;
}
/** 0..1 value of a shape: hard outlines from the distance, soft ones from their profile. */
float shapeValue(int k, vec2 q, float soft) {
  float r = length(q);
  if (k == 13) return clamp(1.0 - r * r, 0.0, 1.0);
  if (k == 14) return r < 1.0 ? 0.5 + 0.5 * cos(3.14159265 * r) : 0.0;
  if (k == 15) return exp(-r * r * 4.0);
  if (k == 16) return pow(clamp(1.0 - r, 0.0, 1.0), 3.0);
  if (k == 17) return clamp(1.0 - max(abs(q.x), abs(q.y)), 0.0, 1.0);
  if (k == 18) return clamp(1.0 - r, 0.0, 1.0);
  if (k == 19) return max(abs(q.x), abs(q.y)) <= 1.0 ? clamp(q.x * 0.5 + 0.5, 0.0, 1.0) : 0.0;
  if (k == 20) return max(abs(q.x), abs(q.y)) <= 1.0 ? 0.5 + 0.5 * sin(q.y * 3.14159265 * 3.0) : 0.0;
  return 1.0 - smoothstep(-soft, soft, sdShape(k, q));
}
float fxMix(int m, float a, float b) {
  if (m == 1) return a * b;
  if (m == 2) return max(a, b);
  if (m == 3) return min(a, b);
  if (m == 4) return a + b;
  if (m == 5) return a - b;
  if (m == 6) return 1.0 - (1.0 - a) * (1.0 - b);
  if (m == 7) return a < 0.5 ? 2.0 * a * b : 1.0 - 2.0 * (1.0 - a) * (1.0 - b);
  if (m == 8) return abs(a - b);
  return b;
}

void main() {
  vec4 P = texture2D(posMap, vUv);
  vec3 n = normalize(texture2D(nrmMap, vUv).xyz + vec3(1e-6));
  vec4 M = texture2D(meshMap, vUv);
  float ao = M.r;
  float cv = M.g;
  if (useMicro) {
    // Anchor point details: their rims count as edges, their dips as cavities.
    vec4 D = texture2D(microMap, vUv);
    cv = clamp(cv + (D.g - 0.5) * microAmt, 0.0, 1.0);
    ao = ao * mix(1.0, D.r, clamp(microAmt, 0.0, 1.0));
  }
  float v = baseValue;
  if (useGen) {
    float raw;
    vec3 pn = (P.xyz - ctr) / rad;
    uint us = uint(seed);
    if (type == 0) raw = clamp((cv - 0.5) * 2.0, 0.0, 1.0);
    else if (type == 1) raw = clamp(clamp((0.5 - cv) * 2.0, 0.0, 1.0) * 0.8 + (1.0 - ao) * 1.1, 0.0, 1.0);
    else if (type == 2) raw = 1.0 - ao;
    else if (type == 3) {
      vec3 ax = abs(axis);
      float e = max(dot(bmax - bmin, ax), 1e-4);
      float t = dot(P.xyz - bmin, ax) / e;
      raw = (axis.x + axis.y + axis.z) < 0.0 ? 1.0 - t : t;
    }
    else if (type == 4) raw = clamp(dot(n, axis) * 0.5 + 0.5, 0.0, 1.0);
    else if (type == 5) raw = fbmValue(pn * noiseScale, 5, us);
    else if (type == 9) raw = triPattern(patKind, pn, n, patScale, us);
    else if (type == 7) {
      vec3 c = texture2D(idMap, vUv).rgb;
      raw = 0.0;
      for (int i = 0; i < 8; i++) {
        if (i >= idN) break;
        raw = max(raw, 1.0 - smoothstep(idTol, idTol + 0.02, distance(c, idCols[i])));
      }
    }
    else if (type == 8) raw = M.b;
    else if (type == 10) {
      // Shape: projected onto the model like a decal, facing shpN.
      if (shpUV) {
        // UV mode (Substance's default): the shape repeats in a grid over the UVs.
        vec2 c = fract(vUv * shpTile + shpOff) * 2.0 - 1.0;
        vec2 q = vec2(c.x * shpRotCS.x + c.y * shpRotCS.y, -c.x * shpRotCS.y + c.y * shpRotCS.x) / shpScale;
        raw = shapeValue(shpKind, q, shpSoft);
      } else {
        vec3 d = P.xyz - shpC;
        vec2 q = vec2(dot(d, shpU) / shpHalf.x, dot(d, shpV) / shpHalf.y);
        float face = smoothstep(0.15, 0.45, dot(n, shpN));
        // Like a sticker: only surfaces close to where it was placed, so it doesn't smear over edges.
        float depth = abs(dot(d, shpN)) / max(max(shpHalf.x, shpHalf.y), 1e-4);
        raw = shapeValue(shpKind, q, shpSoft) * face * (1.0 - smoothstep(0.35, 0.7, depth));
      }
    }
    else raw = cv;
    // Noise breakup (TextureCraft's: world perlin fbm around the threshold).
    if (noiseAmt > 0.0 && type != 5 && type != 7 && type != 9 && type != 10) raw += (fbmPerlin(pn * noiseScale, 4, us) - 0.5) * noiseAmt;
    if (type == 7 || type == 10) v = raw; // ID selection and shapes: exact regions, no threshold
    else if (type == 9) v = patShape(raw, contrast * 3.0, amount - 0.5, false); // patterns: contrast/balance, no threshold
    else {
      float th = 1.0 - amount;
      float soft = mix(0.5, 0.004, clamp(contrast, 0.0, 1.0));
      v = smoothstep(th - soft, th + soft, raw);
    }
    if (invert) v = 1.0 - v;
  }
  if (hasPrev) {
    float a = texture2D(prevMap, vUv).r;
    v = clamp(a + (fxMix(fxBlend, a, v) - a) * fxOpacity, 0.0, 1.0);
  }
  if (outInv) v = 1.0 - v;
  if (hasPaint) {
    vec4 pm = texture2D(paintMask, vUv);
    v = mix(v, pm.r, pm.a);
  }
  gl_FragColor = vec4(v, v, v, 1.0);
}`;

// ------------------------------------------------------------------ smart mask presets
// The 24 presets of TextureCraft's smart masks (crates/engine/src/smart_masks.rs, MIT / Apache-2.0),
// rebuilt from TexPaint's generators with the same thresholds, softness, noise and patterns.

const soft2contrast = (softness: number) => Math.max(0, Math.min(1, (0.5 - softness) / 0.496));
function tg(type: GenType, level: number, softness: number, noise: number, o: Partial<GenSettings> = {}): GenSettings {
  return { ...defaultGen(type), amount: level, contrast: soft2contrast(softness), noise, noiseScale: 8, seed: 7, invert: false, ...o };
}
const tp = (pattern: PatternType, scale: number, seed: number, contrast: number): GenSettings =>
  ({ ...defaultGen('pattern'), pattern, scale, seed, contrast: contrast / 3, amount: 0.5, noise: 0 });
const fx = (g: GenSettings, blend: FxBlend, opacity = 1): MaskFx => ({ ...g, blend, opacity });
const EDGE = (l: number, s: number, n: number) => tg('edge', l, s, n);
const DIRT = (l: number, s: number, n: number) => tg('ao', l, s, n); // TextureCraft's Dirt = 1 − AO
const UPF = (l: number, s: number, n: number, inv = false) => tg('dust', l, s, n, { axis: 'y', flip: false, invert: inv });
const GROUND = (l: number, s: number, n: number) => tg('gradient', l * 0.7, s * 0.6, n, { axis: 'y', flip: true });

export interface SmartMaskPreset { id: string; label: string; build: () => GenSettings; painter?: boolean }
const stack = (base: GenSettings, ...rest: MaskFx[]): GenSettings => ({ ...base, fx: rest.length ? rest : undefined });
// Painter-style generator helpers for the presets below.
export const spGen = (kind: SpKind, p: Record<string, SpValue> = {}, seed = 7): GenSettings => ({ ...defaultGen('painter'), seed, sp: { kind, p: { ...spDefaults(kind).p, ...p } } });
/** A CC0 grunge (see PainterGen's grunge references), tri-planar by default. */
export const spGrungeGen = (ref: string, scale: number, balance = 0.5, contrast = 0, seed = 7, triplanar = true): GenSettings =>
  spGen('grunge', { grunge: ref, scale, balance, contrast, triplanar }, seed);
const P = spGen, GR = spGrungeGen;
const PRE = (g: GenSettings, base = 0.5): GenSettings => ({ ...g, amount: base, spBase: base });
const G = {
  spots: 'grunge:spots/SurfaceImperfections001', spots2: 'grunge:spots/SurfaceImperfections008', specks: 'grunge:spots/SurfaceImperfections012',
  soft: 'grunge:soft/SurfaceImperfections015', soft2: 'grunge:soft/SurfaceImperfections016', soft3: 'grunge:soft/SurfaceImperfections014',
  dust: 'grunge:dust/SurfaceImperfections007', leaks: 'grunge:leaks/SurfaceImperfections002', leaks2: 'grunge:leaks/SurfaceImperfections011',
  rings: 'grunge:stains/SurfaceImperfections010', stains: 'grunge:stains/Smear005', smear: 'grunge:smear/Smear008',
  scratches: 'grunge:scratches/Scratches002', scratchesFine: 'grunge:scratches/Scratches001', prints: 'grunge:fingerprints/Fingerprints002',
  concrete: 'grunge:concrete/Concrete049', rust: 'grunge:rust', chips: 'grunge:chips',
};
/** Up-facing surfaces (world space normal, top to bottom). */
const UP = (balance: number, contrast: number) => P('editor', { curvature_opacity: 0, ws_opacity: 1, ws_balance: balance, ws_contrast: contrast });
/** Down-facing / sheltered surfaces. */
const DOWN = (balance: number, contrast: number) => P('editor', { curvature_opacity: 0, ws_opacity: 1, ws_invert: true, ws_balance: balance, ws_contrast: contrast });

// LocalPaint's smart masks, built on the Painter-style generators (same ids as before, so smart materials keep working).
export const SMART_MASKS: SmartMaskPreset[] = [
  { id: 'edge_wear', label: 'Edges Worn', build: () => PRE(P('wear', { Wear_Level: 0.6, Wear_Contrast: 0.5, Grunge_Amount: 0.35 })) },
  { id: 'edge_chipped', label: 'Edges Chipped', build: () => PRE(P('wear', { Wear_Level: 0.68, Wear_Contrast: 0.75, Grunge_Amount: 0.6, Use_Custom_Grunge: true, grunge: G.spots2, grunge_scale: 6 })) },
  { id: 'dirt_cavities', label: 'Dirt in Cavities', build: () => PRE(P('dirt', { dirt_level: 0.6, dirt_contrast: 0.45, grunge_amount: 0.35 })) },
  { id: 'dust_top', label: 'Dust from Top', build: () => PRE(stack(P('dust', { level: 0.55, contrast: 0.4, occlusion_amount: 0.4 }), fx(GR(G.soft, 1.5, 0.6, 0.2, 9), 'multiply', 0.7))) },
  { id: 'ground_dirt', label: 'Ground Dirt', build: () => PRE(stack(P('grounddirt', { level: 0.5, Contrast: 0.3, dirt_height: 0.35 }), fx(GR(G.stains, 1.5, 0.55, 0.3, 12), 'multiply', 0.8))) },
  { id: 'rust_leaks', label: 'Rust Leaks', build: () => PRE(stack(GR(G.leaks, 1.5, 0.55, 0.3, 4, false), fx(DOWN(0.35, 0.3), 'multiply', 0.6), fx(P('dirt', { dirt_level: 0.5 }), 'lighten', 0.6))) },
  { id: 'scratches', label: 'Scratches', build: () => PRE(GR(G.scratches, 1.5, 0.5, 0.3, 6)) },
  { id: 'grunge', label: 'Grunge Blotches', build: () => PRE(GR(G.soft, 1, 0.5, 0.4, 8)) },
  { id: 'paint_chips', label: 'Paint Chips', build: () => PRE(stack(GR(G.spots2, 2, 0.4, 0.6, 2), fx(P('wear', { Wear_Level: 0.55 }), 'lighten'))) },
  { id: 'fingerprints', label: 'Fingerprints', build: () => PRE(GR(G.prints, 1.5, 0.5, 0.3, 3)) },
  { id: 'edges_soft', label: 'Edges Soft', build: () => PRE(P('wear', { Wear_Level: 0.5, Wear_Contrast: 0.2, Grunge_Amount: 0.1, Edges_Smoothness: 2.5 })) },
  { id: 'edges_sharp', label: 'Edges Sharp', build: () => PRE(P('curvature', { curvature_fine: 0.5, curvature_soft: 0, curvature_medium: 0, curvature_large: 0, curvature_big: 0, curvature_huge: 0, global_balance: 0.6, global_contrast: 0.4 })) },
  { id: 'exposed', label: 'Exposed Areas', build: () => PRE(P('ao', { ao_balance: 0.5, ao_contrast: 0.3 })) },
  { id: 'thin_areas', label: 'Thin Areas', build: () => PRE(P('editor', { curvature_opacity: 0, thickness_opacity: 1, thickness_invert: true, global_balance: 0.55, global_contrast: 0.3 })) },
  { id: 'dust_cavities', label: 'Dust in Cavities', build: () => PRE(stack(P('dirt', { dirt_level: 0.55, dirt_contrast: 0.35, grunge_amount: 0.5, edges_masking: 0.8 }), fx(GR(G.dust, 1.5, 0.6, 0.2, 21), 'multiply', 0.6))) },
  { id: 'moss_top', label: 'Moss from Top', build: () => PRE(stack(P('dust', { level: 0.6, contrast: 0.5, occlusion_amount: 0.6 }), fx(GR(G.spots2, 1.5, 0.55, 0.4, 17), 'multiply'))) },
  { id: 'water_stains', label: 'Water Stains', build: () => PRE(stack(GR(G.rings, 1.2, 0.5, 0.3, 13), fx(GR(G.leaks2, 1.5, 0.5, 0.2, 14), 'lighten', 0.6))) },
  { id: 'sun_faded', label: 'Sun Faded', build: () => PRE(UP(0.6, 0.3)) },
  { id: 'snow_top', label: 'Snow from Top', build: () => PRE(stack(UP(0.75, 0.7), fx(P('dust', { level: 0.6, contrast: 0.6, occlusion_amount: 0.3 }), 'lighten', 0.5))) },
  { id: 'moss_ground', label: 'Moss from Ground', build: () => PRE(stack(P('grounddirt', { level: 0.55, Contrast: 0.4, dirt_height: 0.4 }), fx(GR(G.spots2, 1.5, 0.55, 0.4, 25), 'multiply'))) },
  { id: 'rust_cavities', label: 'Rust in Cavities', build: () => PRE(P('dirt', { dirt_level: 0.62, dirt_contrast: 0.5, grunge_amount: 0.6, Use_Custom_Grunge: true, grunge: G.rust, Grunge_Scale: 3 })) },
  { id: 'edge_scratches', label: 'Edge Scratches', build: () => PRE(stack(P('wear', { Wear_Level: 0.72, Wear_Contrast: 0.4 }), fx(GR(G.scratches, 2, 0.6, 0.3, 29), 'multiply'))) },
  { id: 'dirt_streaks', label: 'Dirt Streaks', build: () => PRE(stack(GR(G.leaks2, 1.5, 0.55, 0.3, 31, false), fx(P('dirt', { dirt_level: 0.65 }), 'multiply'))) },
  { id: 'occluded', label: 'Occluded Areas', build: () => PRE(P('ao', { ao_invert: true, ao_balance: 0.5, ao_contrast: 0.3 })) },
  { id: 'rain_streaks', label: 'Rain Streaks', build: () => PRE(stack(GR(G.leaks, 1.2, 0.55, 0.4, 41, false), fx(DOWN(0.4, 0.2), 'multiply', 0.5), fx(GR(G.soft3, 1.5, 0.5, 0.2, 42), 'multiply', 0.6))) },
  { id: 'drips', label: 'Drips under Edges', build: () => PRE(stack(GR(G.leaks, 2, 0.6, 0.5, 43, false), fx(P('wear', { Wear_Level: 0.6 }), 'lighten', 0.5), fx(DOWN(0.3, 0.2), 'multiply'))) },
  { id: 'cavity_grime', label: 'Cavity Grime', build: () => PRE(stack(P('dirt', { dirt_level: 0.55, dirt_contrast: 0.6, grunge_amount: 0.5 }), fx(GR(G.stains, 2, 0.55, 0.3, 44), 'multiply', 0.8))) },
  { id: 'worn_paint_blotches', label: 'Worn Paint Blotches', build: () => PRE(stack(GR(G.soft2, 1.2, 0.45, 0.6, 45), fx(P('wear', { Wear_Level: 0.55 }), 'lighten'))) },
  { id: 'edges_fine', label: 'Edges Fine', build: () => PRE(P('wear', { Wear_Level: 0.45, Wear_Contrast: 0.8, Grunge_Amount: 0.2, Edges_Smoothness: 0.2 })) },
  { id: 'edges_heavy', label: 'Edges Heavy Wear', build: () => PRE(P('wear', { Wear_Level: 0.85, Wear_Contrast: 0.45, Grunge_Amount: 0.5, Edges_Smoothness: 2, Ambient_Occlusion_Masking: 0.3 })) },
  { id: 'dirt_soft', label: 'Dirt Soft', build: () => PRE(P('dirt', { dirt_level: 0.55, dirt_contrast: 0.15, grunge_amount: 0.25, Use_Triplanar: true })) },
  { id: 'dirt_heavy', label: 'Dirt Heavy', build: () => PRE(stack(P('dirt', { dirt_level: 0.85, dirt_contrast: 0.55, grunge_amount: 0.5 }), fx(GR(G.stains, 1.5, 0.6, 0.3, 51), 'multiply', 0.6))) },
  { id: 'dust_light', label: 'Dust Light', build: () => PRE(stack(P('dust', { level: 0.4, contrast: 0.3, occlusion_amount: 0.5, noise_opacity: 0.3 }), fx(GR(G.dust, 1.5, 0.55, 0.2, 52), 'multiply', 0.5))) },
  { id: 'dust_heavy', label: 'Dust Heavy', build: () => PRE(stack(P('dust', { level: 0.75, contrast: 0.45, occlusion_amount: 0.7 }), fx(GR(G.soft3, 1.2, 0.65, 0.2, 53), 'multiply', 0.5))) },
  { id: 'scratches_fine', label: 'Scratches Fine', build: () => PRE(GR(G.scratchesFine, 2, 0.45, 0.4, 54)) },
  { id: 'scratches_edges', label: 'Scratches near Edges', build: () => PRE(stack(GR(G.scratches, 1.5, 0.55, 0.3, 55), fx(P('wear', { Wear_Level: 0.8, Wear_Contrast: 0.2, Edges_Smoothness: 3 }), 'multiply'))) },
  { id: 'water_rings', label: 'Water Rings', build: () => PRE(GR('grunge:stains/SurfaceImperfections006', 1.2, 0.5, 0.4, 56)) },
  { id: 'smudges', label: 'Smudges', build: () => PRE(GR(G.smear, 1.2, 0.5, 0.3, 57)) },
  { id: 'rust_spots', label: 'Rust Spots', build: () => PRE(stack(GR(G.spots, 1.5, 0.4, 0.6, 58), fx(P('dirt', { dirt_level: 0.7, dirt_contrast: 0.3 }), 'lighten', 0.5))) },
  { id: 'paint_peeling', label: 'Paint Peeling', build: () => PRE(stack(GR(G.soft2, 1.5, 0.4, 0.8, 59), fx(P('wear', { Wear_Level: 0.7, Wear_Contrast: 0.7, Grunge_Amount: 0.6 }), 'lighten'), fx(P('dirt', { dirt_level: 0.5, dirt_contrast: 0.6 }), 'lighten', 0.6))) },
  { id: 'leaks_top', label: 'Leaks from Top', build: () => PRE(stack(GR(G.leaks2, 1.2, 0.55, 0.4, 60, false), fx(UP(0.35, 0.2), 'lighten', 0.4))) },
  { id: 'snow_light', label: 'Snow Light', build: () => PRE(stack(UP(0.6, 0.6), fx(GR(G.specks, 1.5, 0.6, 0.4, 61), 'multiply', 0.6))) },
  { id: 'cavities_sharp', label: 'Cavities Sharp', build: () => PRE(P('curvature', { curvature_mode: 2, curvature_fine: 0.5, curvature_soft: 0.2, curvature_medium: 0, curvature_large: 0, curvature_big: 0, curvature_huge: 0, global_balance: 0.6, global_contrast: 0.4 })) },
];
/** Painter's mask-stack blending codes → LocalPaint's mask effect blends. */
export const PAINTER_FX_BLEND: Record<number, FxBlend> = { 2: 'normal', 4: 'multiply', 7: 'darken', 8: 'lighten', 9: 'add', 10: 'add', 5: 'subtract', 12: 'difference', 14: 'overlay', 15: 'screen', 16: 'overlay' };
/** A Painter mask stack (bottom → top) as one LocalPaint mask. */
export function painterStack(effects: { res: string; proj?: number; blend: number; opacity: number; tw: Record<string, any>; inputs?: Record<string, SpInput> }[]): GenSettings | null {
  const list = effects.map((e) => ({ e, sp: spFromPainter(e.res, e.tw, e.inputs ?? {}, e.proj) }));
  if (!list.length) return null;
  const [first, ...rest] = list;
  // The bottom fill's opacity scales it over the black mask, like in Painter.
  const base = { ...defaultGen('painter'), seed: 7, sp: first.sp, blend: 'normal', opacity: Math.max(0, Math.min(1, first.e.opacity)) } as MaskFx;
  const fx: MaskFx[] = rest.map(({ e, sp }) => ({ ...defaultGen('painter'), seed: 7, sp, blend: PAINTER_FX_BLEND[e.blend] ?? 'normal', opacity: Math.max(0, Math.min(1, e.opacity)) }));
  return stack(base, ...fx);
}
const PAINTER_SMART: SmartMaskPreset[] = PAINTER_RECIPES.map((r) => ({
  id: 'sp_' + r.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label: r.name, painter: true,
  build: () => painterStack(r.effects)!,
}));
SMART_MASKS.unshift(...PAINTER_SMART);
export const findSmartMask = (id: string) => SMART_MASKS.find((m) => m.id === id || m.label.toLowerCase() === id.toLowerCase());
/** A preset as mask settings (fresh copy); `invert` keeps the layer where the preset is not. */
export function smartMask(id: string, invert = false): GenSettings {
  const p = findSmartMask(id);
  if (!p) throw new Error(`unknown smart mask ${id}`);
  const g = structuredClone(p.build());
  if (invert) g.outInvert = true;
  return g;
}
