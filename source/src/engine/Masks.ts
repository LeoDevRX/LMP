/** Mask generators: procedural masks driven by the baked mesh maps. */
import { GLSL_NOISE, PatternType } from './Procedural';

export type GenType = 'edge' | 'dirt' | 'ao' | 'gradient' | 'dust' | 'noise' | 'curvature' | 'thick' | 'id' | 'pattern';
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
  /** Extra effects (bottom → top) blended over this one, like Substance's mask stack. */
  fx?: MaskFx[];
  /** Invert the whole stack at the end. */
  outInvert?: boolean;
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
};
export const GEN_TYPES = Object.keys(GEN_LABEL) as GenType[];
const GEN_INDEX: Record<GenType, number> = { edge: 0, dirt: 1, ao: 2, gradient: 3, dust: 4, noise: 5, curvature: 6, thick: 8, id: 7, pattern: 9 };

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
  }
}

export interface LayerMaskSpec {
  /** Mask value where nothing is painted and no generator is set. */
  base: 'white' | 'black';
  gen: GenSettings | null;
}

export const genIndex = (t: GenType) => GEN_INDEX[t];
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
${GLSL_NOISE}
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
    else raw = cv;
    // Noise breakup (TextureCraft's: world perlin fbm around the threshold).
    if (noiseAmt > 0.0 && type != 5 && type != 7 && type != 9) raw += (fbmPerlin(pn * noiseScale, 4, us) - 0.5) * noiseAmt;
    if (type == 7) v = raw; // ID selection: exact regions, no threshold
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

export interface SmartMaskPreset { id: string; label: string; build: () => GenSettings }
const stack = (base: GenSettings, ...rest: MaskFx[]): GenSettings => ({ ...base, fx: rest.length ? rest : undefined });
export const SMART_MASKS: SmartMaskPreset[] = [
  { id: 'edge_wear', label: 'Edges Worn', build: () => EDGE(0.55, 0.12, 0.5) },
  { id: 'edge_chipped', label: 'Edges Chipped', build: () => stack(EDGE(0.8, 0.2, 0.3), fx(tp('chips', 3, 5, 1), 'multiply'), fx(EDGE(0.45, 0.06, 0.6), 'lighten')) },
  { id: 'dirt_cavities', label: 'Dirt in Cavities', build: () => DIRT(0.55, 0.25, 0.4) },
  { id: 'dust_top', label: 'Dust from Top', build: () => stack(UPF(0.3, 0.15, 0.3), fx(tp('clouds', 3, 9, 1.4), 'multiply')) },
  { id: 'ground_dirt', label: 'Ground Dirt', build: () => stack(GROUND(0.35, 0.25, 0.5), fx(tp('grunge', 2, 12, 0.8), 'multiply')) },
  { id: 'rust_leaks', label: 'Rust Leaks', build: () => stack(tp('streaks', 3, 4, 1.2), fx(UPF(0.2, 0.1, 0, true), 'multiply'), fx(DIRT(0.45, 0.2, 0.5), 'lighten')) },
  { id: 'scratches', label: 'Scratches', build: () => tp('scratches', 3, 6, 1) },
  { id: 'grunge', label: 'Grunge Blotches', build: () => tp('grunge', 2, 8, 1) },
  { id: 'paint_chips', label: 'Paint Chips', build: () => stack(tp('chips', 5, 2, 1), fx(EDGE(0.6, 0.12, 0.5), 'lighten')) },
  { id: 'fingerprints', label: 'Fingerprints', build: () => tp('smudges', 4, 3, 1) },
  { id: 'edges_soft', label: 'Edges Soft', build: () => EDGE(0.35, 0.35, 0.15) },
  { id: 'edges_sharp', label: 'Edges Sharp', build: () => EDGE(0.65, 0.05, 0) },
  { id: 'exposed', label: 'Exposed Areas', build: () => tg('ao', 0.5, 0.3, 0, { invert: true }) },
  { id: 'thin_areas', label: 'Thin Areas', build: () => tg('thick', 0.7, 0.2, 0.2, { invert: true }) },
  { id: 'dust_cavities', label: 'Dust in Cavities', build: () => stack(DIRT(0.5, 0.3, 0.2), fx(tp('clouds', 4, 21, 1.2), 'multiply')) },
  { id: 'moss_top', label: 'Moss from Top', build: () => stack(UPF(0.45, 0.2, 0.6), fx(tp('cells', 6, 17, 1.4), 'multiply')) },
  { id: 'water_stains', label: 'Water Stains', build: () => stack(tp('streaks', 2, 13, 0.9), fx(UPF(0.15, 0.2, 0, true), 'multiply'), fx(tp('clouds', 2.5, 14, 1), 'multiply')) },
  { id: 'sun_faded', label: 'Sun Faded', build: () => UPF(0.5, 0.45, 0.1) },
  { id: 'snow_top', label: 'Snow from Top', build: () => UPF(0.6, 0.08, 0.6) },
  { id: 'moss_ground', label: 'Moss from Ground', build: () => stack(GROUND(0.4, 0.3, 0.5), fx(tp('cells', 6, 25, 1.4), 'multiply')) },
  { id: 'rust_cavities', label: 'Rust in Cavities', build: () => stack(DIRT(0.6, 0.25, 0.5), fx(tp('grunge', 3, 27, 1.3), 'multiply')) },
  { id: 'edge_scratches', label: 'Edge Scratches', build: () => stack(EDGE(0.75, 0.3, 0.2), fx(tp('scratches', 4, 29, 1.2), 'multiply')) },
  { id: 'dirt_streaks', label: 'Dirt Streaks', build: () => stack(tp('streaks', 2.5, 31, 1.1), fx(DIRT(0.5, 0.25, 0.4), 'multiply')) },
  { id: 'occluded', label: 'Occluded Areas', build: () => tg('ao', 0.5, 0.3, 0) },
  // Extra presets in the spirit of Material Painter's generators (TexPaint's own recipes).
  { id: 'rain_streaks', label: 'Rain Streaks', build: () => stack(tp('streaks', 4, 41, 1.4), fx(UPF(0.3, 0.15, 0, true), 'multiply'), fx(tp('clouds', 3, 42, 1.2), 'multiply', 0.7)) },
  { id: 'drips', label: 'Drips under Edges', build: () => stack(tp('streaks', 6, 43, 1.8), fx(EDGE(0.7, 0.25, 0.3), 'lighten', 0.6), fx(UPF(0.1, 0.1, 0, true), 'multiply')) },
  { id: 'cavity_grime', label: 'Cavity Grime', build: () => stack(tg('dirt', 0.55, 0.15, 0.6), fx(tp('grunge', 4, 44, 1.2), 'multiply', 0.8)) },
  { id: 'worn_paint_blotches', label: 'Worn Paint Blotches', build: () => stack(tp('grunge', 2.5, 45, 1.3), fx(EDGE(0.55, 0.15, 0.5), 'lighten')) },
];
export const findSmartMask = (id: string) => SMART_MASKS.find((m) => m.id === id || m.label.toLowerCase() === id.toLowerCase());
/** A preset as mask settings (fresh copy); `invert` keeps the layer where the preset is not. */
export function smartMask(id: string, invert = false): GenSettings {
  const p = findSmartMask(id);
  if (!p) throw new Error(`unknown smart mask ${id}`);
  const g = structuredClone(p.build());
  if (invert) g.outInvert = true;
  return g;
}
