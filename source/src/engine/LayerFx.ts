/**
 * Content effects (Substance Painter's "Add filter / generator / levels / fill" on a layer's content): a small stack
 * that changes what the layer paints, before its own mask, opacity and blend mode. Shown as sub-rows under the layer.
 */
import type { Ch } from './TextureSet';
import { FxBlend, GenSettings, defaultGen } from './Masks';
import { spDefaults } from './PainterGen';

export type LayerFxKind = 'filter' | 'generator' | 'levels' | 'fill';
export type FilterType = 'blur' | 'sharpen' | 'invert' | 'hsl' | 'bc' | 'clamp' | 'gray' | 'posterize' | 'tint' | 'gradmap';

export interface LayerFx {
  id: number;
  kind: LayerFxKind;
  on: boolean;
  blend: FxBlend;
  opacity: number;
  /** Channels it changes (missing = all but normal). */
  chans?: Partial<Record<Ch, boolean>>;
  /** filter */
  filter?: FilterType | null;
  /** filter parameters (meaning depends on the filter) */
  p?: number[];
  /** generator */
  gen?: GenSettings | null;
  /** fill / generator colour (colour channels), fill value (grey channels) */
  color?: [number, number, number];
  value?: number;
  /** levels: in low, in high, gamma, out low, out high */
  lv?: [number, number, number, number, number];
}

export const FX_KIND_LABEL: Record<LayerFxKind, string> = { filter: 'Filter', generator: 'Generator', levels: 'Levels', fill: 'Fill' };

export interface FilterDef { label: string; desc: string; params: { label: string; min: number; max: number; step: number; def: number; fmt?: (v: number) => string }[] }
const pct = (v: number) => `${Math.round(v * 100)}%`;
export const FILTERS: Record<FilterType, FilterDef> = {
  blur: { label: 'Blur', desc: 'Softens the layer (stays inside UV islands).', params: [{ label: 'Intensity', min: 0, max: 1, step: 0.01, def: 0.3, fmt: pct }] },
  sharpen: { label: 'Sharpen', desc: 'Makes details crisper.', params: [{ label: 'Intensity', min: 0, max: 3, step: 0.01, def: 1, fmt: (v) => v.toFixed(2) }] },
  invert: { label: 'Invert', desc: 'Flips the values: black becomes white, rough becomes glossy.', params: [] },
  hsl: { label: 'HSL perceptive', desc: 'Hue, saturation and lightness of the colour.', params: [
    { label: 'Hue', min: -180, max: 180, step: 1, def: 0, fmt: (v) => `${v.toFixed(0)}°` },
    { label: 'Saturation', min: 0, max: 2, step: 0.01, def: 1, fmt: pct },
    { label: 'Lightness', min: -1, max: 1, step: 0.01, def: 0, fmt: (v) => v.toFixed(2) }] },
  bc: { label: 'Contrast / luminosity', desc: 'Brightness and contrast.', params: [
    { label: 'Luminosity', min: -1, max: 1, step: 0.01, def: 0, fmt: (v) => v.toFixed(2) },
    { label: 'Contrast', min: 0, max: 3, step: 0.01, def: 1, fmt: (v) => v.toFixed(2) }] },
  clamp: { label: 'Clamp', desc: 'Keeps values between a minimum and maximum.', params: [
    { label: 'Min', min: 0, max: 1, step: 0.01, def: 0, fmt: (v) => v.toFixed(2) },
    { label: 'Max', min: 0, max: 1, step: 0.01, def: 1, fmt: (v) => v.toFixed(2) }] },
  gray: { label: 'Grayscale conversion', desc: 'Removes the colour, keeps the brightness.', params: [] },
  posterize: { label: 'Posterize', desc: 'Cuts the values into a few flat steps.', params: [{ label: 'Steps', min: 2, max: 16, step: 1, def: 4, fmt: (v) => v.toFixed(0) }] },
  tint: { label: 'Color tint', desc: 'Multiplies the colour by a tint (set it under Colour).', params: [{ label: 'Strength', min: 0, max: 1, step: 0.01, def: 1, fmt: pct }] },
  gradmap: { label: 'Gradient map', desc: 'Maps dark → light to the black point and the colour below.', params: [{ label: 'Black point', min: 0, max: 1, step: 0.01, def: 0, fmt: (v) => v.toFixed(2) }] },
};
export const FILTER_TYPES = Object.keys(FILTERS) as FilterType[];
const FILTER_INDEX: Record<FilterType, number> = { blur: 1, sharpen: 2, invert: 3, hsl: 4, bc: 5, clamp: 6, gray: 7, posterize: 8, tint: 9, gradmap: 10 };
export const filterIndex = (f: FilterType) => FILTER_INDEX[f];

let nextFxId = 1;
export function newFxId() { return nextFxId++ + Math.floor(Math.random() * 1e6) * 1000; }

export function defaultFx(kind: LayerFxKind, opts: { filter?: FilterType; gen?: GenSettings } = {}): LayerFx {
  const base = { id: newFxId(), kind, on: true, opacity: 1 };
  switch (kind) {
    case 'filter': {
      const f = opts.filter ?? null;
      return { ...base, blend: 'normal', filter: f, p: f ? FILTERS[f].params.map((d) => d.def) : [], color: [1, 0.85, 0.6] };
    }
    case 'generator': return { ...base, blend: 'multiply', gen: opts.gen ?? { ...defaultGen('painter'), sp: spDefaults('dirt') }, color: [1, 1, 1] };
    case 'levels': return { ...base, blend: 'normal', lv: [0, 1, 1, 0, 1] };
    case 'fill': return { ...base, blend: 'normal', opacity: 0.5, color: [0.35, 0.22, 0.12], value: 0.5 };
  }
}

export function fxTitle(f: LayerFx, genName: (g: GenSettings) => string): string {
  if (f.kind === 'filter') return f.filter ? FILTERS[f.filter].label : 'Filter (empty)';
  if (f.kind === 'generator') return f.gen ? genName(f.gen) : 'Generator (empty)';
  return FX_KIND_LABEL[f.kind];
}

/** Does this effect touch channel `ch`? */
export const fxOnChannel = (f: LayerFx, ch: Ch) => (f.chans ? !!f.chans[ch] : ch !== 'normal');
/** Effects that actually do something. */
export const activeFx = (list: LayerFx[] | undefined) => (list ?? []).filter((f) => f.on && f.opacity > 0
  && (f.kind !== 'filter' || !!f.filter) && (f.kind !== 'generator' || !!f.gen));

// One pass per effect. Works on the layer's own content (rgb + coverage in a).
export const FRAG_LAYERFX = /* glsl */ `
uniform sampler2D src;
uniform sampler2D genTex;
uniform sampler2D maskTex;
uniform bool hasMask;
uniform bool maskInv;
uniform int op;          // 1..10 filters, 20 generator, 21 levels, 22 fill, 99 final (opacity × mask)
uniform vec4 p;
uniform vec4 p2;
uniform vec3 col;
uniform float val;
uniform int blend;
uniform float opacity;
uniform bool isColor;
uniform vec2 texel;
varying vec2 vUv;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 q = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 r = mix(vec4(q.xyw, c.r), vec4(c.r, q.yzx), step(q.x, c.r));
  float d = r.x - min(r.w, r.y);
  return vec3(abs(r.z + (r.w - r.y) / (6.0 * d + 1e-10)), d / (r.x + 1e-10), r.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 q = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(q - 1.0, 0.0, 1.0), c.y);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 fxBlend(int m, vec3 b, vec3 s) {
  if (m == 1) return b * s;
  if (m == 2) return max(b, s);
  if (m == 3) return min(b, s);
  if (m == 4) return b + s;
  if (m == 5) return b - s;
  if (m == 6) return 1.0 - (1.0 - b) * (1.0 - s);
  if (m == 7) return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
  if (m == 8) return abs(b - s);
  return s;
}
// Blur: weighted by coverage, so empty texels around UV islands don't darken the edges.
vec4 blurAt(float r) {
  vec4 acc = vec4(0.0);
  float wsum = 0.0, asum = 0.0;
  for (int i = 0; i < 32; i++) {
    float fi = float(i);
    float a = fi * 2.39996;
    float d = sqrt((fi + 0.5) / 32.0) * r;
    vec2 o = vec2(cos(a), sin(a)) * d * texel;
    vec4 s = texture2D(src, vUv + o);
    float w = s.a * exp(-2.0 * (d * d) / max(1.0, r * r));
    acc.rgb += s.rgb * w; wsum += w; asum += s.a;
  }
  vec4 c = texture2D(src, vUv);
  return vec4(wsum > 0.0 ? acc.rgb / wsum : c.rgb, c.a);
}
void main() {
  vec4 s = texture2D(src, vUv);
  float mk = 1.0;
  if (hasMask) { mk = texture2D(maskTex, vUv).r; if (maskInv) mk = 1.0 - mk; }
  if (op == 99) { gl_FragColor = vec4(s.rgb, s.a * opacity * mk); return; }
  if (op == 98) {
    vec3 w = texture2D(genTex, vUv).rgb;
    float A = clamp(1.0 - dot(w - s.rgb, vec3(1.0 / 3.0)), 0.0, 1.0);
    vec3 C = A > 1e-3 ? s.rgb / A : vec3(0.0);
    gl_FragColor = vec4(clamp(C, 0.0, 1.0), A * opacity * mk);
    return;
  }
  vec3 r = s.rgb;
  if (op == 1) r = blurAt(p.x * 48.0).rgb;
  else if (op == 2) {
    vec3 b = blurAt(3.0).rgb;
    r = s.rgb + (s.rgb - b) * p.x;
  }
  else if (op == 3) r = 1.0 - s.rgb;
  else if (op == 4) {
    if (isColor) {
      vec3 h = rgb2hsv(clamp(s.rgb, 0.0, 1.0));
      h.x = fract(h.x + p.x / 360.0); h.y = clamp(h.y * p.y, 0.0, 1.0);
      r = hsv2rgb(h);
    }
    r = p.z >= 0.0 ? mix(r, vec3(1.0), p.z) : r * (1.0 + p.z);
  }
  else if (op == 5) r = (s.rgb - 0.5) * p.y + 0.5 + p.x;
  else if (op == 6) r = clamp(s.rgb, vec3(p.x), vec3(max(p.x, p.y)));
  else if (op == 7) r = vec3(luma(s.rgb));
  else if (op == 8) { float n = max(2.0, p.x); r = floor(clamp(s.rgb, 0.0, 0.9999) * n) / (n - 1.0); }
  else if (op == 9) r = isColor ? mix(s.rgb, s.rgb * col, p.x) : s.rgb;
  else if (op == 10) { float l = isColor ? luma(s.rgb) : s.r; vec3 hi = isColor ? col : vec3(1.0); r = mix(vec3(p.x), hi, l); }
  else if (op == 20) { float g = texture2D(genTex, vUv).r; r = isColor ? g * col : vec3(g); }
  else if (op == 21) {
    vec3 x = clamp((s.rgb - p.x) / max(1e-4, p.y - p.x), 0.0, 1.0);
    x = pow(x, vec3(1.0 / max(0.01, p.z)));
    r = mix(vec3(p.w), vec3(p2.x), x);
  }
  else if (op == 22) r = isColor ? col : vec3(val);
  vec3 o = mix(s.rgb, fxBlend(blend, s.rgb, r), opacity);
  gl_FragColor = vec4(clamp(o, 0.0, 1.0), s.a);
}`;
