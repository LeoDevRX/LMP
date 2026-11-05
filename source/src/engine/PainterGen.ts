/**
 * Painter-style mask generators: Dirt, Metal Edge Wear, Dust, Mask Editor, Mask Builder, Light, Position,
 * Ambient Occlusion, Curvature, 3D Linear Gradient, 3D Distance, Ground Dirt and a plain Grunge fill.
 *
 * Parameter names, ranges and defaults are the ones Substance 3D Painter's generators use, so settings read from
 * .spsm / .spmsk files carry over 1:1. The maths follows the public Substance node definitions
 * (histogram scan, blend modes, blur HQ, levels); grunge textures come from LocalPaint's CC0 grunge library.
 */
import { GLSL_NOISE } from './Procedural';

export type SpKind = 'dirt' | 'wear' | 'fiberwear' | 'dust' | 'editor' | 'builder' | 'light' | 'position' | 'ao' | 'curvature'
  | 'gradient3d' | 'distance3d' | 'grounddirt' | 'grunge';

export type SpValue = number | boolean | string | [number, number, number];
export interface SpParam {
  id: string;
  label: string;
  kind: 'f' | 'b' | 'i' | 'enum' | 'grunge' | 'vec3';
  def: SpValue;
  min?: number;
  max?: number;
  grp?: string;
  /** enum: [value, label] */
  opts?: [number, string][];
  /** Only show when this other parameter is truthy. */
  if?: string;
}
export interface SpDef { label: string; desc: string; params: SpParam[] }

/** Substance blend modes as Painter's generators list them (value = index). */
export const SP_BLEND: [number, string][] = [
  [0, 'Normal'], [1, 'Linear Dodge (Add)'], [2, 'Subtract'], [3, 'Multiply'], [4, 'Add/Sub'], [5, 'Max (Lighten)'],
  [6, 'Min (Darken)'], [7, 'Overlay'], [8, 'Screen'], [9, 'Soft light'], [10, 'Override (Switch)'],
];
const CURV_MODE: [number, string][] = [[1, 'Edges'], [2, 'Cavities'], [3, 'Dual'], [4, 'Unprocessed']];

const f = (id: string, label: string, def: number, grp?: string, min = 0, max = 1, cond?: string): SpParam => ({ id, label, kind: 'f', def, min, max, grp, if: cond });
const b = (id: string, label: string, def: boolean, grp?: string, cond?: string): SpParam => ({ id, label, kind: 'b', def, grp, if: cond });
const i = (id: string, label: string, def: number, min: number, max: number, grp?: string): SpParam => ({ id, label, kind: 'i', def, min, max, grp });
const e = (id: string, label: string, def: number, opts: [number, string][], grp?: string, cond?: string): SpParam => ({ id, label, kind: 'enum', def, opts, grp, if: cond });
const g = (id: string, label: string, def: string, grp?: string, cond?: string): SpParam => ({ id, label, kind: 'grunge', def, grp, if: cond });
const v3 = (id: string, label: string, def: [number, number, number], grp?: string): SpParam => ({ id, label, kind: 'vec3', def, grp });

/** The texture inputs of the AO / Curvature / Position generators (Painter's "Use Texture"). */
const texIn = (): SpParam[] => [
  b('visibleifTexture', 'Use Texture', false),
  g('texture', 'Texture', 'grunge:clouds', 'Texture', 'visibleifTexture'),
  f('texture_opacity', 'Texture Opacity', 0, 'Texture', 0, 1, 'visibleifTexture'),
  b('texutre_invert', 'Invert', false, 'Texture', 'visibleifTexture'),
  e('texture_blendmode', 'Blending Mode', 7, SP_BLEND, 'Texture', 'visibleifTexture'),
  f('texture_scale', 'Scale', 1, 'Texture', 0.1, 32, 'visibleifTexture'),
  f('texture_contrast', 'Contrast', 0, 'Texture', -1, 1, 'visibleifTexture'),
  f('texture_brightness', 'Brightness', 0, 'Texture', -1, 1, 'visibleifTexture'),
  b('texture_triplanar', 'Triplanar', false, 'Texture', 'visibleifTexture'),
  f('texture_triplanar_contrast', 'Triplanar Contrast', 0.5, 'Texture', 0, 1, 'visibleifTexture'),
];
const globals = (): SpParam[] => [
  b('global_invert', 'Global Invert', false),
  f('global_blur', 'Global Blur', 0),
  f('global_balance', 'Global Balance', 0.5),
  f('global_contrast', 'Global Contrast', 0),
];
const curvBands = (grp: string): SpParam[] => [
  b('curvature_invert', 'Invert', false, grp),
  e('curvature_mode', 'Mode', 1, CURV_MODE, grp),
  f('curvature_sharp', 'Sharp', 1, grp), f('curvature_fine', 'Fine', 0.9, grp), f('curvature_soft', 'Soft', 0.75, grp),
  f('curvature_medium', 'Medium', 0.5, grp), f('curvature_large', 'Large', 0.25, grp), f('curvature_big', 'Big', 0.15, grp),
  f('curvature_huge', 'Huge', 0.1, grp),
  f('curvature_contrast', 'Contrast', 0, grp, -1, 1), f('curvature_brightness', 'Brightness', 0, grp, -1, 1),
];
const dirs = (pre: string, grp: string, topOp: number): SpParam[] => ['rightleft', 'topbottom', 'frontback'].flatMap((d, k) => {
  const name = ['Right to Left', 'Top To Bottom', 'Front to Back'][k];
  return [
    f(`${pre}_direction_${d}_opacity`, name, d === 'topbottom' ? topOp : 0, grp),
    b(`${pre}_direction_${d}_invert`, `${name}: Invert`, false, grp),
    e(`${pre}_direction_${d}_blendmode`, `${name}: Blending Mode`, 1, SP_BLEND, grp),
  ];
});

export const SP_DEFS: Record<SpKind, SpDef> = {
  dirt: {
    label: 'Dirt', desc: 'Dirt in the cavities and occluded areas, broken up by a grunge (Painter\'s Dirt generator).',
    params: [
      b('invert', 'Invert', false),
      f('dirt_level', 'Dirt Level', 0.75), f('dirt_contrast', 'Dirt Contrast', 0.5),
      f('grunge_amount', 'Grunge Amount', 0.3), i('Grunge_Scale', 'Grunge Scale', 4, 1, 32),
      f('edges_masking', 'Edges Masking', 0.5),
      b('Use_Triplanar', 'Use Triplanar', false), f('Triplanar_Blending_Contrast', 'Triplanar Blending Contrast', 0.5, undefined, 0, 1, 'Use_Triplanar'),
      b('Use_Custom_Grunge', 'Use Custom Grunge', false), g('grunge', 'Custom grunge', 'grunge:spots/SurfaceImperfections001', undefined, 'Use_Custom_Grunge'),
    ],
  },
  wear: {
    label: 'Metal Edge Wear', desc: 'Worn, scratched edges from the curvature, masked by the occlusion (Painter\'s Metal Edge Wear).',
    params: [
      b('invert', 'Invert', false),
      f('Wear_Level', 'Wear Level', 0.75), f('Wear_Contrast', 'Wear Contrast', 0.5),
      f('Grunge_Amount', 'Grunge Amount', 0.3), i('grunge_scale', 'Grunge Scale', 4, 1, 32),
      f('Edges_Smoothness', 'Edges Smoothness', 1, undefined, 0, 4), f('Ambient_Occlusion_Masking', 'Ambient Occlusion Masking', 0.5),
      f('Curvature_Weight', 'Curvature Weight', 1),
      b('Use_Triplanar', 'Use Triplanar', false), f('Triplanar_Blending_Contrast', 'Triplanar Blending Contrast', 0.5, undefined, 0, 1, 'Use_Triplanar'),
      b('Use_Custom_Grunge', 'Use Custom Grunge', false), g('grunge', 'Custom grunge', 'grunge:scratches', undefined, 'Use_Custom_Grunge'),
    ],
  },
  fiberwear: {
    label: 'Fiber Glass Edge Wear', desc: 'Softer, chipped edge wear for plastic and fiber glass.',
    params: [
      b('invert', 'Invert', false),
      f('Wear_Level', 'Wear Level', 0.75), f('Wear_Contrast', 'Wear Contrast', 0.5),
      f('Grunge_Amount', 'Grunge Amount', 0.3), i('grunge_scale', 'Grunge Scale', 4, 1, 32),
      f('Edges_Smoothness', 'Edges Smoothness', 1, undefined, 0, 4), f('Ambient_Occlusion_Masking', 'Ambient Occlusion Masking', 0.5),
      f('Curvature_Weight', 'Curvature Weight', 0.25),
      b('Use_Triplanar', 'Use Triplanar', false), f('Triplanar_Blending_Contrast', 'Triplanar Blending Contrast', 0.5, undefined, 0, 1, 'Use_Triplanar'),
      b('Use_Custom_Grunge', 'Use Custom Grunge', false), g('grunge', 'Custom grunge', 'grunge:chips', undefined, 'Use_Custom_Grunge'),
    ],
  },
  dust: {
    label: 'Dust', desc: 'Dust settling on surfaces that face up and in sheltered spots.',
    params: [
      b('invert', 'Invert', false),
      f('level', 'Level', 0.5), f('contrast', 'Contrast', 0.5), f('occlusion_amount', 'Occlusion Amount', 0.5),
      f('noise_opacity', 'Noise Opacity', 0), f('noise_scale', 'Noise Scale', 512, undefined, 16, 2048),
    ],
  },
  editor: {
    label: 'Mask Editor', desc: 'Painter\'s multi-purpose generator: two textures, AO, multi-scale curvature, world space normal, position and thickness, each with a blending mode.',
    params: [
      ...globals(),
      f('texture_opacity', 'Texture Opacity', 0), f('texture2_opacity', 'Texture 2 Opacity', 0),
      f('ao_opacity', 'Ambient Occlusion Opacity', 0), f('curvature_opacity', 'Curvature Opacity', 0.5),
      f('ws_opacity', 'World Space Normal Opacity', 0), f('position_opacity', 'Position Gradient Opacity', 0), f('thickness_opacity', 'Thickness Opacity', 0),
      g('texture', 'Texture', 'grunge:clouds', 'Texture'), f('texture_in_balance', 'Texture Balance', 0.5, 'Texture'), f('texture_in_contrast', 'Texture Contrast', 0, 'Texture'),
      b('texutre_invert', 'Invert', false, 'Texture'),
      e('texture_blendmode', 'Blending Mode', 7, SP_BLEND, 'Texture'), f('texture_scale', 'Scale', 1, 'Texture', 0.1, 32),
      f('texture_contrast', 'Contrast', 0, 'Texture', -1, 1), f('texture_brightness', 'Brightness', 0, 'Texture', -1, 1),
      b('texture_triplanar', 'Triplanar', false, 'Texture'), f('texture_triplanar_contrast', 'Triplanar Contrast', 0.5, 'Texture'),
      g('texture_sec', 'Texture', 'grunge:spots', 'Texture 2'), f('texture2_in_balance', 'Texture Balance', 0.5, 'Texture 2'), f('texture2_in_contrast', 'Texture Contrast', 0, 'Texture 2'),
      b('texture2_invert', 'Invert', false, 'Texture 2'),
      e('texture2_blendmode', 'Blending Mode', 7, SP_BLEND, 'Texture 2'), f('texture2_scale', 'Scale', 1, 'Texture 2', 0.1, 32),
      f('texture2_contrast', 'Contrast', 0, 'Texture 2', -1, 1), f('texture2_brightness', 'Brightness', 0, 'Texture 2', -1, 1),
      b('texture2_triplanar', 'Triplanar', false, 'Texture 2'), f('texture2_triplanar_contrast', 'Triplanar Contrast', 0.5, 'Texture 2'),
      b('ao_invert', 'Invert', false, 'Ambient Occlusion'), e('ao_blendmode', 'Blending Mode', 3, SP_BLEND, 'Ambient Occlusion'),
      f('ao_blur', 'Blur', 0, 'Ambient Occlusion'), f('ao_balance', 'Balance', 0.5, 'Ambient Occlusion'), f('ao_contrast', 'Contrast', 0, 'Ambient Occlusion'),
      e('curvature_blendmode', 'Blending Mode', 1, SP_BLEND, 'Curvature'), ...curvBands('Curvature'),
      b('ws_invert', 'Invert', false, 'World Space Normal'), e('ws_blendmode', 'Blending Mode', 1, SP_BLEND, 'World Space Normal'),
      f('ws_blur', 'Blur', 0, 'World Space Normal'), f('ws_balance', 'Balance', 0.5, 'World Space Normal'), f('ws_contrast', 'Contrast', 0, 'World Space Normal'),
      f('ws_brightness', 'Brightness', 0, 'World Space Normal', -1, 1), ...dirs('ws', 'World Space Normal', 1),
      b('position_invert', 'Invert', false, 'Position Gradient'), e('position_blendmode', 'Blending Mode', 1, SP_BLEND, 'Position Gradient'),
      f('position_balance', 'Balance', 0.5, 'Position Gradient'), f('position_contrast', 'Contrast', 0, 'Position Gradient'),
      f('position_brightness', 'Brightness', 0, 'Position Gradient', -1, 1), ...dirs('position', 'Position Gradient', 1),
      b('thickness_invert', 'Invert', false, 'Thickness'), f('thickness_blur', 'Blur', 0, 'Thickness'),
      f('thickness_contrast', 'Contrast', 0, 'Thickness', -1, 1), f('thickness_brightness', 'Brightness', 0, 'Thickness', -1, 1),
    ],
  },
  builder: {
    label: 'Mask Builder', desc: 'Painter\'s legacy Mask Builder: AO, convex / concave curvature, top-down gradient and world space normal mixed with a grunge.',
    params: [
      f('Level', 'Level', 0.6), f('Contrast', 'Contrast', 0.4), b('Invert', 'Invert', false),
      b('Use_Triplanar', 'Use Triplanar', false), f('Triplanar_Blending_Contrast', 'Triplanar Blending Contrast', 0.5, undefined, 0, 1, 'Use_Triplanar'),
      f('Grunge', 'Grunge', 0.25), i('Grunge_Scale', 'Scale', 2, 1, 32, 'Grunge'),
      b('Grunge_Use_Custom_Grunge', 'Use Custom Grunge', false, 'Grunge'), g('grunge', 'Custom grunge 1', 'grunge:soft/SurfaceImperfections016', 'Grunge', 'Grunge_Use_Custom_Grunge'),
      b('Grunge_Invert', 'Invert', false, 'Grunge'),
      f('AO', 'AO', 1, undefined, -1, 1), f('AO_Range', 'Range', 0.5, 'AO'), f('AO_Contrast', 'Contrast', 0, 'AO'),
      f('AO_Noisiness', 'Noisiness', 0.25, 'AO'), b('AO_Invert', 'Invert', false, 'AO'),
      f('Curvature', 'Curvature', 1), f('Curvature_Convex_Range', 'Convex Range', 0.5, 'Curvature', -1, 1), f('Curvature_Convex_Contrast', 'Convex Contrast', 0, 'Curvature', -1, 1),
      b('Curvature_Convex_Invert', 'Convex Invert', false, 'Curvature'), f('Curvature_Concave_Range', 'Concave Range', 0, 'Curvature', -1, 1),
      f('Curvature_Concave_Contrast', 'Concave Contrast', 0, 'Curvature', -1, 1), b('Curvature_Concave_Invert', 'Concave Invert', false, 'Curvature'),
      f('Curvature_Smoothness', 'Smoothness', 0, 'Curvature', 0, 16), f('Curvature_Level_Boost', 'Level Boost', 0.25, 'Curvature', 0, 0.99),
      f('Curvature_Noisiness', 'Noisiness', 0.25, 'Curvature'),
      f('Top_Down_Gradient', 'Top/Down Gradient', 0, undefined, -1, 1), f('Gradient_Range', 'Range', 0.5, 'Gradient'),
      f('Gradient_Contrast', 'Contrast', 0.5, 'Gradient'), b('Gradient_Invert', 'Invert', false, 'Gradient'),
      f('World_Space_Normal', 'World Space Normal', 0, undefined, -1, 1),
      ...['Top', 'Bottom', 'Front', 'Back', 'Right', 'Left'].map((d) => f(`World_Space_Normal_${d}_Intensity`, `${d} Intensity`, 0, 'World Space Normal', -1, 1)),
    ],
  },
  light: {
    label: 'Light', desc: 'Lights the model from one direction, for sun-bleached or lit-side effects.',
    params: [
      b('invert', 'Invert', false),
      f('Horizontal_Angle', 'Horizontal Angle', 0.25), f('Vertical_Angle', 'Vertical Angle', 0.125),
      f('Highlight_Glossiness', 'Highlight Glossiness', 0.5), f('Highlight_Level', 'Highlight Level', 0), f('light_attenuation', 'Light Attenuation', 0.25),
    ],
  },
  position: {
    label: 'Position', desc: 'A gradient over the model\'s height, width or depth.',
    params: [
      ...globals(),
      b('position_invert', 'Invert', false, 'Position Gradient'), f('position_balance', 'Balance', 0.5, 'Position Gradient'),
      f('position_contrast', 'Contrast', 0, 'Position Gradient'), f('position_brightness', 'Brightness', 0, 'Position Gradient', -1, 1),
      ...dirs('position', 'Position Gradient', 1), ...texIn(),
    ],
  },
  ao: {
    label: 'Ambient Occlusion', desc: 'The baked ambient occlusion with balance, contrast and blur.',
    params: [
      ...globals(),
      b('ao_invert', 'Invert', false, 'Ambient Occlusion'), f('ao_blur', 'Blur', 0, 'Ambient Occlusion'),
      f('ao_balance', 'Balance', 0.5, 'Ambient Occlusion'), f('ao_contrast', 'Contrast', 0, 'Ambient Occlusion'), ...texIn(),
    ],
  },
  curvature: {
    label: 'Curvature', desc: 'Edges or cavities from the baked curvature, mixed over seven sizes like Painter\'s.',
    params: [...globals(), ...curvBands('Curvature'), ...texIn()],
  },
  gradient3d: {
    label: '3D Linear Gradient', desc: 'A straight gradient between two points on the model.',
    params: [
      b('invert', 'Invert', false), f('Position', 'Balance', 0.5), f('contrast', 'Contrast', 0),
      v3('point_1_world', '3D Position Start', [0.5, 0, 0.5]), v3('point_2_world', '3D Position End', [0.5, 1, 0.5]),
    ],
  },
  distance3d: {
    label: '3D Distance', desc: 'A round falloff around a point on the model.',
    params: [
      b('invert', 'Invert', false), v3('position_xyz', 'Position', [0.5, 0.5, 0.5]),
      f('light_radius', 'Radius', 1, undefined, 0, 2), f('histogram_position', 'Offset', 0.5), f('histogram_contrast', 'Contrast', 0.5),
    ],
  },
  grounddirt: {
    label: 'Ground Dirt', desc: 'Dirt rising from the bottom of the model.',
    params: [b('invert', 'Invert', false), f('level', 'Level', 0.5), f('Contrast', 'Contrast', 0), f('dirt_height', 'Dirt Height', 0.5)],
  },
  grunge: {
    label: 'Grunge', desc: 'A grunge texture over the model, like dragging a grunge into a mask in Painter.',
    params: [
      g('grunge', 'Grunge', 'grunge:soft'), f('scale', 'Scale', 1, undefined, 0.1, 32), b('triplanar', 'Triplanar', true),
      f('triplanar_contrast', 'Triplanar Contrast', 0.5, undefined, 0, 1, 'triplanar'),
      f('balance', 'Balance', 0.5), f('contrast', 'Contrast', 0), b('invert', 'Invert', false),
    ],
  },
};
export const SP_KINDS = Object.keys(SP_DEFS) as SpKind[];

/** Settings of a Painter-style generator: which one and its parameters (Painter's names). */
export interface SpSettings { kind: SpKind; p: Record<string, SpValue> }

export function spDefaults(kind: SpKind): SpSettings {
  const p: Record<string, SpValue> = {};
  for (const d of SP_DEFS[kind].params) p[d.id] = Array.isArray(d.def) ? [...d.def] as [number, number, number] : d.def;
  return { kind, p };
}
export const spNum = (s: SpSettings, id: string): number => {
  const v = s.p[id] ?? SP_DEFS[s.kind].params.find((d) => d.id === id)?.def;
  return typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'number' ? v : 0;
};
/** Grunge parameters of a generator, in slot order (the shader has two grunge slots). */
export const spGrungeParams = (kind: SpKind) => SP_DEFS[kind].params.filter((d) => d.kind === 'grunge');
/** Numeric parameters (f / b / i / enum) get one float each, vec3s get three. */
export function spLayout(kind: SpKind): Map<string, number> {
  const m = new Map<string, number>();
  let k = 0;
  for (const d of SP_DEFS[kind].params) {
    if (d.kind === 'grunge') continue;
    m.set(d.id, k);
    k += d.kind === 'vec3' ? 3 : 1;
  }
  return m;
}
export const SP_MAXP = 96;
/** Fill the shader's parameter array. */
export function spPack(s: SpSettings, out: Float32Array) {
  out.fill(0);
  const lay = spLayout(s.kind);
  for (const d of SP_DEFS[s.kind].params) {
    const k = lay.get(d.id);
    if (k === undefined) continue;
    const v = s.p[d.id] ?? d.def;
    if (Array.isArray(v)) { out[k] = v[0]; out[k + 1] = v[1]; out[k + 2] = v[2]; }
    else out[k] = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v) || 0;
  }
}
/** Does this generator need its raw result blurred before the final levels (Global Blur)? */
export const spGlobalBlur = (s: SpSettings) => ('global_blur' in s.p || SP_DEFS[s.kind].params.some((d) => d.id === 'global_blur')) ? spNum(s, 'global_blur') : 0;

// ------------------------------------------------------------------ GLSL

const COMMON = /* glsl */ `
uniform sampler2D uPos;
uniform sampler2D uNrm;
uniform sampler2D uMesh;
uniform sampler2D uL0;
uniform sampler2D uL1;
uniform sampler2D uL2;
uniform sampler2D uL3;
uniform sampler2D uL4;
uniform sampler2D uL5;
uniform sampler2D uG0;
uniform sampler2D uG1;
uniform bool uGOk0;
uniform bool uGOk1;
uniform int uGPat0;
uniform int uGPat1;
uniform vec3 uBmin;
uniform vec3 uBmax;
uniform float uSize;
uniform float uSeed;
uniform float P[${SP_MAXP}];
uniform int uStage;
uniform sampler2D uSrc;
uniform bool uHasPrev;
uniform sampler2D uPrev;
uniform int uFxBlend;
uniform float uFxOp;
uniform bool uOutInv;
varying vec2 vUv;
${GLSL_NOISE}
vec3 gPos, gN, gPn, gP01;
float gAO, gCv, gTh;

// Substance's Histogram Scan (Position / Contrast / Invert Position), exactly as the node computes it.
float hscan(float x, float pos, float con, bool invPos) {
  float p = invPos ? pos : 1.0 - pos;
  float A = min(2.0 * p, 1.0), B = (max(p, 0.5) - 0.5) * 2.0, c = clamp(con * 0.5, 0.0, 1.0);
  float lo = mix(B, A, c), hi = mix(A, B, c);
  if (hi - lo < 1e-5) return x >= lo ? 1.0 : 0.0;
  return clamp((x - lo) / (hi - lo), 0.0, 1.0);
}
// Substance's Contrast / Luminosity.
float conLum(float x, float con, float lum) {
  x += lum;
  float k = con > 0.0 ? 1.0 / max(1.0 - con, 1e-3) : 1.0 + con;
  return clamp((x - 0.5) * k + 0.5, 0.0, 1.0);
}
float levels(float x, float inLo, float inHi, float outLo, float outHi) {
  float t = clamp((x - inLo) / max(inHi - inLo, 1e-5), 0.0, 1.0);
  return mix(outLo, outHi, t);
}
// Substance blend node (grayscale): mode values as in Painter's Blending Mode lists.
float sblend(int m, float d, float s) {
  if (m == 1) return d + s;
  if (m == 2) return d - s;
  if (m == 3) return d * s;
  if (m == 4) return d + 2.0 * s - 1.0;
  if (m == 5) return max(d, s);
  if (m == 6) return min(d, s);
  if (m == 7) return d < 0.5 ? 2.0 * d * s : 1.0 - 2.0 * (1.0 - d) * (1.0 - s);
  if (m == 8) return 1.0 - (1.0 - d) * (1.0 - s);
  if (m == 9) return (1.0 - 2.0 * s) * d * d + 2.0 * s * d;
  return s;
}
float sblendOp(int m, float d, float s, float op) {
  if (op <= 0.0) return d;
  if (m == 10) return mix(d, s, clamp(op, 0.0, 1.0));
  return clamp(mix(d, sblend(m, d, s), clamp(op, 0.0, 1.0)), 0.0, 1.0);
}
// The blurred mesh maps: r = curvature, g = convex edges, b = ambient occlusion, a = thickness.
vec4 Lv(int i) {
  if (i <= 0) return texture2D(uL0, vUv);
  if (i == 1) return texture2D(uL1, vUv);
  if (i == 2) return texture2D(uL2, vUv);
  if (i == 3) return texture2D(uL3, vUv);
  if (i == 4) return texture2D(uL4, vUv);
  return texture2D(uL5, vUv);
}
vec4 rawPack() { return vec4(gCv, clamp((gCv - 0.5) * 2.0, 0.0, 1.0), gAO, gTh); }
// Blur HQ in Substance's units: intensity 1 is about 1/256 of the texture.
vec4 blurred(float intensity) {
  float px = intensity * uSize / 256.0;
  if (px <= 0.01) return rawPack();
  float lod = log2(px / 1.5);
  if (lod < 0.0) return mix(rawPack(), Lv(0), clamp(px / 1.5, 0.0, 1.0));
  lod = min(lod, 5.0);
  int a = int(floor(lod));
  return mix(Lv(a), Lv(a + 1), lod - float(a));
}
// Painter's seven curvature sizes, mixed by their weights (0.5 = flat).
float curvBands(float w0, float w1, float w2, float w3, float w4, float w5, float w6) {
  float s = w0 * (gCv - 0.5) + w1 * (Lv(0).r - 0.5) + w2 * (Lv(1).r - 0.5) + w3 * (Lv(2).r - 0.5)
    + w4 * (Lv(3).r - 0.5) + w5 * (Lv(4).r - 0.5) + w6 * (Lv(5).r - 0.5);
  float ws = max(w0 + w1 + w2 + w3 + w4 + w5 + w6, 1e-3);
  return clamp(0.5 + s / ws * min(ws, 2.0), 0.0, 1.0);
}
float curvMode(float c, float mode) {
  if (mode < 1.5) return clamp((c - 0.5) * 2.0, 0.0, 1.0);
  if (mode < 2.5) return clamp((0.5 - c) * 2.0, 0.0, 1.0);
  if (mode < 3.5) return clamp(abs(c - 0.5) * 2.0, 0.0, 1.0);
  return c;
}
float procG(int k, float sc, bool tri, float triC) {
  uint us = uint(uSeed) + uint(k) * 7919u;
  if (tri) return triPattern(k, gPn, gN, sc * 2.0, us);
  return tcPattern(k, vec3(vUv * sc * 2.0, 0.0), us);
}
float texG(sampler2D t, float sc, bool tri, float triC) {
  if (!tri) return texture2D(t, vUv * sc).r;
  vec3 w = pow(abs(gN) + 1e-5, vec3(1.0 + triC * 15.0));
  w /= (w.x + w.y + w.z);
  vec3 p = gPn * sc;
  float s = 0.0;
  if (w.x > 0.003) s += texture2D(t, p.zy).r * w.x;
  if (w.y > 0.003) s += texture2D(t, p.xz).r * w.y;
  if (w.z > 0.003) s += texture2D(t, p.xy).r * w.z;
  return s;
}
// Grunge slot 0 or 1: the library texture, or a procedural stand-in until it has downloaded.
float grunge(int slot, float sc, bool tri, float triC) {
  if (slot == 0) return uGOk0 ? texG(uG0, sc, tri, triC) : procG(uGPat0, sc, tri, triC);
  return uGOk1 ? texG(uG1, sc, tri, triC) : procG(uGPat1, sc, tri, triC);
}
float whiteNoise(float sc) { return hash01(ivec3(floor(gPn * sc)), uint(uSeed) + 101u); }
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
`;

/** The generator-specific part: spRaw() (before Global Blur) and spPost() (levels / invert after it). */
const BODY: Record<SpKind, string> = {
  dirt: /* glsl */ `
float spRaw() {
  float cb = blurred(0.25).r;
  float cavity = 1.0 - clamp(cb / 0.5, 0.0, 1.0);
  float convex = clamp((cb - 0.5) / 0.5, 0.0, 1.0);
  float X = clamp(gAO - 0.25 * cavity, 0.0, 1.0);
  X = clamp(X + p_edges_masking * convex, 0.0, 1.0);
  bool tri = p_Use_Triplanar > 0.5;
  float gr = p_Use_Custom_Grunge > 0.5 ? grunge(0, p_Grunge_Scale, tri, p_Triplanar_Blending_Contrast)
    : mix(grunge(0, p_Grunge_Scale, tri, p_Triplanar_Blending_Contrast), grunge(1, p_Grunge_Scale, tri, p_Triplanar_Blending_Contrast), 0.5);
  X = mix(X, X * gr, p_grunge_amount);
  return clamp(1.0 - X, 0.0, 1.0);
}
float spPost(float x) { x = hscan(x, p_dirt_level, p_dirt_contrast, false); return p_invert > 0.5 ? 1.0 - x : x; }`,
  wear: /* glsl */ `
float spRaw() {
  float cw = clamp((gCv - 0.5) / 0.5, 0.0, 1.0) * p_Curvature_Weight;
  cw = clamp(cw + blurred(p_Edges_Smoothness).g * p_Curvature_Weight, 0.0, 1.0);
  bool tri = p_Use_Triplanar > 0.5;
  float g0 = grunge(0, p_grunge_scale, tri, p_Triplanar_Blending_Contrast);
  // The built-in scratch grunge goes through levels; a custom grunge is used as it is.
  float gr = p_Use_Custom_Grunge > 0.5 ? g0 : levels(g0, 0.1647, 0.7961, 0.0, 1.0);
  cw = clamp(sblendOp(4, cw, gr, p_Grunge_Amount), 0.0, 1.0);
  float aoL = mix(gAO, 1.0, gAO);
  cw *= hscan(aoL, p_Ambient_Occlusion_Masking, 0.0, true);
  return cw;
}
float spPost(float x) { x = hscan(x, p_Wear_Level, p_Wear_Contrast, false); return p_invert > 0.5 ? 1.0 - x : x; }`,
  fiberwear: '',
  dust: /* glsl */ `
float spRaw() {
  float up = clamp(gN.y * 0.5 + 0.5, 0.0, 1.0);
  float v = mix(up, hscan(1.0 - gAO, p_occlusion_amount, 0.0, false), 0.5);
  return v;
}
float spPost(float x) {
  x = hscan(x, p_level, p_contrast, false);
  x *= mix(1.0, whiteNoise(p_noise_scale), p_noise_opacity);
  return p_invert > 0.5 ? 1.0 - x : x;
}`,
  editor: /* glsl */ `
float dirLayer(float base, float vx, float vy, float vz, float oX, float iX, float bX, float oY, float iY, float bY, float oZ, float iZ, float bZ) {
  float a = base;
  a = sblendOp(int(bX + 0.5), a, iX > 0.5 ? 1.0 - vx : vx, oX);
  a = sblendOp(int(bY + 0.5), a, iY > 0.5 ? 1.0 - vy : vy, oY);
  a = sblendOp(int(bZ + 0.5), a, iZ > 0.5 ? 1.0 - vz : vz, oZ);
  return a;
}
float spRaw() {
  float acc = 0.0;
  if (p_position_opacity > 0.0) {
    float w = dirLayer(0.0, gP01.x, gP01.y, gP01.z,
      p_position_direction_rightleft_opacity, p_position_direction_rightleft_invert, p_position_direction_rightleft_blendmode,
      p_position_direction_topbottom_opacity, p_position_direction_topbottom_invert, p_position_direction_topbottom_blendmode,
      p_position_direction_frontback_opacity, p_position_direction_frontback_invert, p_position_direction_frontback_blendmode);
    if (p_position_invert > 0.5) w = 1.0 - w;
    w = clamp(hscan(w, p_position_balance, p_position_contrast, false) + p_position_brightness, 0.0, 1.0);
    acc = sblendOp(int(p_position_blendmode + 0.5), acc, w, p_position_opacity);
  }
  if (p_ws_opacity > 0.0) {
    vec3 n = gN * 0.5 + 0.5;
    float w = dirLayer(0.0, n.x, n.y, n.z,
      p_ws_direction_rightleft_opacity, p_ws_direction_rightleft_invert, p_ws_direction_rightleft_blendmode,
      p_ws_direction_topbottom_opacity, p_ws_direction_topbottom_invert, p_ws_direction_topbottom_blendmode,
      p_ws_direction_frontback_opacity, p_ws_direction_frontback_invert, p_ws_direction_frontback_blendmode);
    if (p_ws_invert > 0.5) w = 1.0 - w;
    w = clamp(hscan(w, p_ws_balance, p_ws_contrast, false) + p_ws_brightness, 0.0, 1.0);
    acc = sblendOp(int(p_ws_blendmode + 0.5), acc, w, p_ws_opacity);
  }
  if (p_thickness_opacity > 0.0) {
    float t = blurred(p_thickness_blur * 16.0).a;
    if (p_thickness_invert > 0.5) t = 1.0 - t;
    t = conLum(t, p_thickness_contrast, p_thickness_brightness);
    acc = sblendOp(1, acc, t, p_thickness_opacity);
  }
  if (p_curvature_opacity > 0.0) {
    float c = curvBands(p_curvature_sharp, p_curvature_fine, p_curvature_soft, p_curvature_medium, p_curvature_large, p_curvature_big, p_curvature_huge);
    c = curvMode(c, p_curvature_mode);
    if (p_curvature_invert > 0.5) c = 1.0 - c;
    c = conLum(c, p_curvature_contrast, p_curvature_brightness);
    acc = sblendOp(int(p_curvature_blendmode + 0.5), acc, c, p_curvature_opacity);
  }
  if (p_ao_opacity > 0.0) {
    float a = blurred(p_ao_blur * 16.0).b;
    if (p_ao_invert > 0.5) a = 1.0 - a;
    a = hscan(a, p_ao_balance, p_ao_contrast, false);
    acc = sblendOp(int(p_ao_blendmode + 0.5), acc, a, p_ao_opacity);
  }
  if (p_texture_opacity > 0.0) {
    float t = grunge(0, p_texture_scale, p_texture_triplanar > 0.5, p_texture_triplanar_contrast);
    t = hscan(t, p_texture_in_balance, p_texture_in_contrast, false);
    if (p_texutre_invert > 0.5) t = 1.0 - t;
    t = conLum(t, p_texture_contrast, p_texture_brightness);
    acc = sblendOp(int(p_texture_blendmode + 0.5), acc, t, p_texture_opacity);
  }
  if (p_texture2_opacity > 0.0) {
    float t = grunge(1, p_texture2_scale, p_texture2_triplanar > 0.5, p_texture2_triplanar_contrast);
    t = hscan(t, p_texture2_in_balance, p_texture2_in_contrast, false);
    if (p_texture2_invert > 0.5) t = 1.0 - t;
    t = conLum(t, p_texture2_contrast, p_texture2_brightness);
    acc = sblendOp(int(p_texture2_blendmode + 0.5), acc, t, p_texture2_opacity);
  }
  return clamp(acc, 0.0, 1.0);
}
float spPost(float x) { x = hscan(x, p_global_balance, p_global_contrast, false); return p_global_invert > 0.5 ? 1.0 - x : x; }`,
  builder: /* glsl */ `
// Traced from Painter's mg_mask_builder: every step clamps to 0..1 like Substance's blend nodes.
float spRaw() {
  bool tri = p_Use_Triplanar > 0.5;
  float tc = p_Triplanar_Blending_Contrast;
  // Curvature: half sharp, half slightly blurred; convex and concave sides; Smoothness blurs further.
  float cs = mix(gCv, blurred(0.5).r, 0.5);
  if (p_Curvature_Smoothness > 0.0) cs = mix(cs, blurred(0.5 + p_Curvature_Smoothness).r, 0.85);
  float convex = clamp((cs - 0.5) * 2.0, 0.0, 1.0);
  float concave = clamp(1.0 - cs * 2.0, 0.0, 1.0);
  float noiseC = whiteNoise(uSize * 0.5);
  float boost = 1.0 - p_Curvature_Level_Boost;
  float cvx = hscan(convex, abs(p_Curvature_Convex_Range), 0.0, false);
  cvx = levels(cvx, 0.0, boost, 0.0, p_Curvature);
  cvx = conLum(cvx, p_Curvature_Convex_Contrast, 0.0);
  if (p_Curvature_Convex_Invert > 0.5) cvx = 1.0 - cvx;
  cvx = clamp(cvx - p_Curvature_Noisiness * cvx * noiseC, 0.0, 1.0);
  float ccv = hscan(concave, abs(p_Curvature_Concave_Range), 0.0, false);
  ccv = levels(ccv, 0.0, boost, 0.0, p_Curvature);
  ccv = conLum(ccv, p_Curvature_Concave_Contrast, 0.0);
  if (p_Curvature_Concave_Invert > 0.5) ccv = 1.0 - ccv;
  ccv = clamp(ccv - p_Curvature_Noisiness * ccv * noiseC, 0.0, 1.0);
  float acc = 0.0;
  if (p_Curvature_Convex_Range >= 0.0) acc = clamp(acc + cvx, 0.0, 1.0);
  if (p_Curvature_Concave_Range >= 0.0) acc = clamp(acc + ccv, 0.0, 1.0);
  // Top / down gradient.
  float gy = p_Gradient_Invert > 0.5 ? 1.0 - gP01.y : gP01.y;
  float grad = hscan(gy, p_Gradient_Range, p_Gradient_Contrast, false);
  if (p_Top_Down_Gradient > 0.0) acc = clamp(acc + grad * p_Top_Down_Gradient, 0.0, 1.0);
  // Ambient occlusion: occluded areas (inverted AO), then broken up by spots noise.
  float aoV = hscan(1.0 - gAO, p_AO_Range, p_AO_Contrast, false);
  if (p_AO_Invert > 0.5) aoV = 1.0 - aoV;
  aoV = clamp(aoV - p_AO_Noisiness * aoV * grunge(1, 2.0, tri, tc), 0.0, 1.0);
  if (p_AO > 0.0) acc = clamp(acc + aoV * p_AO, 0.0, 1.0);
  // Grunge (Add/Sub).
  float gr = grunge(0, p_Grunge_Scale, tri, tc);
  if (p_Grunge_Invert > 0.5) gr = 1.0 - gr;
  acc = clamp(acc + abs(p_Grunge) * (2.0 * gr - 1.0), 0.0, 1.0);
  // Negative intensities subtract.
  if (p_Curvature_Convex_Range < 0.0) acc = clamp(acc - cvx, 0.0, 1.0);
  if (p_Curvature_Concave_Range < 0.0) acc = clamp(acc - ccv, 0.0, 1.0);
  if (p_Top_Down_Gradient < 0.0) acc = clamp(acc - grad * -p_Top_Down_Gradient, 0.0, 1.0);
  if (p_AO < 0.0) acc = clamp(acc - aoV * -p_AO, 0.0, 1.0);
  // World space normal: six directions around mid gray, sharpened by the World Space Normal slider, Add/Sub.
  float cmp = 0.498;
  cmp = clamp(cmp + 0.5 * p_World_Space_Normal_Top_Intensity * max(gN.y, 0.0), 0.0, 1.0);
  cmp = clamp(cmp + 0.5 * p_World_Space_Normal_Bottom_Intensity * max(-gN.y, 0.0), 0.0, 1.0);
  cmp = clamp(cmp + 0.5 * p_World_Space_Normal_Back_Intensity * max(-gN.x, 0.0), 0.0, 1.0);
  cmp = clamp(cmp + 0.5 * p_World_Space_Normal_Front_Intensity * max(gN.x, 0.0), 0.0, 1.0);
  cmp = clamp(cmp + 0.5 * p_World_Space_Normal_Left_Intensity * max(-gN.z, 0.0), 0.0, 1.0);
  cmp = clamp(cmp + 0.5 * p_World_Space_Normal_Right_Intensity * max(gN.z, 0.0), 0.0, 1.0);
  cmp = conLum(cmp, 0.5 * p_World_Space_Normal, 0.0);
  acc = clamp(acc + 2.0 * cmp - 1.0, 0.0, 1.0);
  return acc;
}
float spPost(float x) { x = hscan(x, p_Level, p_Contrast, false); return p_Invert > 0.5 ? 1.0 - x : x; }`,
  light: /* glsl */ `
float spRaw() {
  float h = p_Horizontal_Angle * 6.2831853, el = p_Vertical_Angle * 3.14159265;
  vec3 L = normalize(vec3(cos(h) * cos(el), sin(el), sin(h) * cos(el)));
  float d = dot(gN, L);
  float lit = clamp(d, 0.0, 1.0);
  // Light attenuation: the far side of the model (along the light) gets less.
  float along = dot(gP01 - 0.5, L) + 0.5;
  lit *= mix(1.0, clamp(along * 1.5, 0.0, 1.0), p_light_attenuation);
  float spec = pow(clamp(d, 0.0, 1.0), 1.0 + p_Highlight_Glossiness * 120.0) * p_Highlight_Level;
  return clamp(lit + spec, 0.0, 1.0);
}
float spPost(float x) { return p_invert > 0.5 ? 1.0 - x : x; }`,
  position: /* glsl */ `
float spRaw() {
  float a = 0.0;
  a = sblendOp(int(p_position_direction_rightleft_blendmode + 0.5), a, p_position_direction_rightleft_invert > 0.5 ? 1.0 - gP01.x : gP01.x, p_position_direction_rightleft_opacity);
  a = sblendOp(int(p_position_direction_topbottom_blendmode + 0.5), a, p_position_direction_topbottom_invert > 0.5 ? 1.0 - gP01.y : gP01.y, p_position_direction_topbottom_opacity);
  a = sblendOp(int(p_position_direction_frontback_blendmode + 0.5), a, p_position_direction_frontback_invert > 0.5 ? 1.0 - gP01.z : gP01.z, p_position_direction_frontback_opacity);
  if (p_position_invert > 0.5) a = 1.0 - a;
  a = clamp(hscan(a, p_position_balance, p_position_contrast, false) + p_position_brightness, 0.0, 1.0);
  return TEXTURE_IN(a);
}
float spPost(float x) { x = hscan(x, p_global_balance, p_global_contrast, false); return p_global_invert > 0.5 ? 1.0 - x : x; }`,
  ao: /* glsl */ `
float spRaw() {
  float a = blurred(p_ao_blur * 16.0).b;
  if (p_ao_invert > 0.5) a = 1.0 - a;
  a = hscan(a, p_ao_balance, p_ao_contrast, false);
  return TEXTURE_IN(a);
}
float spPost(float x) { x = hscan(x, p_global_balance, p_global_contrast, false); return p_global_invert > 0.5 ? 1.0 - x : x; }`,
  curvature: /* glsl */ `
float spRaw() {
  float c = curvBands(p_curvature_sharp, p_curvature_fine, p_curvature_soft, p_curvature_medium, p_curvature_large, p_curvature_big, p_curvature_huge);
  c = curvMode(c, p_curvature_mode);
  if (p_curvature_invert > 0.5) c = 1.0 - c;
  c = conLum(c, p_curvature_contrast, p_curvature_brightness);
  return TEXTURE_IN(c);
}
float spPost(float x) { x = hscan(x, p_global_balance, p_global_contrast, false); return p_global_invert > 0.5 ? 1.0 - x : x; }`,
  gradient3d: /* glsl */ `
float spRaw() {
  vec3 a = vec3(p_point_1_world, P[IDX_point_1_world + 1], P[IDX_point_1_world + 2]);
  vec3 b = vec3(p_point_2_world, P[IDX_point_2_world + 1], P[IDX_point_2_world + 2]);
  vec3 d = b - a;
  return clamp(dot(gP01 - a, d) / max(dot(d, d), 1e-5), 0.0, 1.0);
}
float spPost(float x) { x = hscan(x, p_Position, p_contrast, false); return p_invert > 0.5 ? 1.0 - x : x; }`,
  distance3d: /* glsl */ `
float spRaw() {
  vec3 c = vec3(p_position_xyz, P[IDX_position_xyz + 1], P[IDX_position_xyz + 2]);
  return clamp(1.0 - length(gP01 - c) / max(p_light_radius, 1e-3), 0.0, 1.0);
}
float spPost(float x) { x = hscan(x, p_histogram_position, p_histogram_contrast, false); return p_invert > 0.5 ? 1.0 - x : x; }`,
  grounddirt: /* glsl */ `
float spRaw() { return clamp(1.0 - gP01.y / max(p_dirt_height, 1e-3), 0.0, 1.0); }
float spPost(float x) { x = hscan(x, p_level, p_Contrast, false); return p_invert > 0.5 ? 1.0 - x : x; }`,
  grunge: /* glsl */ `
float spRaw() { return grunge(0, p_scale, p_triplanar > 0.5, p_triplanar_contrast); }
// Painter's grunges invert first, then balance / contrast.
float spPost(float x) { if (p_invert > 0.5) x = 1.0 - x; return hscan(x, p_balance, p_contrast, false); }`,
};
BODY.fiberwear = BODY.wear;

/** Use Texture of the AO / Curvature / Position generators. */
const TEXTURE_IN = /* glsl */ `
float TEXTURE_IN(float a) {
  if (p_visibleifTexture < 0.5 || p_texture_opacity <= 0.0) return a;
  float t = grunge(0, p_texture_scale, p_texture_triplanar > 0.5, p_texture_triplanar_contrast);
  if (p_texutre_invert > 0.5) t = 1.0 - t;
  t = conLum(t, p_texture_contrast, p_texture_brightness);
  return sblendOp(int(p_texture_blendmode + 0.5), a, t, p_texture_opacity);
}`;

const MAIN = /* glsl */ `
void main() {
  vec4 Pm = texture2D(uPos, vUv);
  gPos = Pm.xyz;
  gN = normalize(texture2D(uNrm, vUv).xyz + vec3(1e-6));
  vec3 ext = max(uBmax - uBmin, vec3(1e-4));
  gP01 = clamp((gPos - uBmin) / ext, 0.0, 1.0);
  gPn = (gPos - uBmin) / max(max(ext.x, ext.y), ext.z);
  vec4 M = texture2D(uMesh, vUv);
  gAO = M.r; gCv = M.g; gTh = M.b;
  float v;
  if (uStage == 1) v = texture2D(uSrc, vUv).r; else v = spRaw();
  if (uStage == 0) { gl_FragColor = vec4(v, v, v, 1.0); return; }
  v = clamp(spPost(v), 0.0, 1.0);
  if (uHasPrev) { float a = texture2D(uPrev, vUv).r; v = clamp(a + (fxMix(uFxBlend, a, v) - a) * uFxOp, 0.0, 1.0); }
  else v *= uFxOp;
  if (uOutInv) v = 1.0 - v;
  gl_FragColor = vec4(v, v, v, 1.0);
}`;

/** The full fragment shader of one generator kind. */
export function spShader(kind: SpKind): string {
  const lay = spLayout(kind);
  const defs = [...lay].map(([id, k]) => `#define p_${id} P[${k}]\n#define IDX_${id} ${k}`).join('\n');
  const usesTex = SP_DEFS[kind].params.some((d) => d.id === 'visibleifTexture');
  return `${defs}\n${COMMON}\n${usesTex ? TEXTURE_IN : ''}\n${BODY[kind]}\n${MAIN}`;
}

/** Packs the mesh maps for the blur pyramid: r = curvature, g = convex edges, b = AO, a = coverage (for dilation). */
export const FRAG_SP_PACK = /* glsl */ `
uniform sampler2D uMesh; uniform sampler2D uPos; varying vec2 vUv;
void main() { vec4 M = texture2D(uMesh, vUv); float cov = texture2D(uPos, vUv).a > 0.5 ? 1.0 : 0.0;
  gl_FragColor = vec4(M.g, clamp((M.g - 0.5) * 2.0, 0.0, 1.0), M.r, cov); }`;
/** After dilation, put thickness into alpha (the pyramid's 4th channel). */
export const FRAG_SP_PACK2 = /* glsl */ `
uniform sampler2D uSrc; uniform sampler2D uMesh; varying vec2 vUv;
void main() { vec4 c = texture2D(uSrc, vUv); gl_FragColor = vec4(c.rgb, texture2D(uMesh, vUv).b); }`;
/** 9-tap separable Gaussian (sigma ≈ 1.5 texels) in one direction. */
export const FRAG_SP_BLUR = /* glsl */ `
uniform sampler2D uSrc; uniform vec2 uDir; varying vec2 vUv;
void main() {
  const float w0 = 0.2270270, w1 = 0.1945946, w2 = 0.1216216, w3 = 0.0540541, w4 = 0.0162162;
  vec4 s = texture2D(uSrc, vUv) * w0;
  s += (texture2D(uSrc, vUv + uDir) + texture2D(uSrc, vUv - uDir)) * w1;
  s += (texture2D(uSrc, vUv + 2.0 * uDir) + texture2D(uSrc, vUv - 2.0 * uDir)) * w2;
  s += (texture2D(uSrc, vUv + 3.0 * uDir) + texture2D(uSrc, vUv - 3.0 * uDir)) * w3;
  s += (texture2D(uSrc, vUv + 4.0 * uDir) + texture2D(uSrc, vUv - 4.0 * uDir)) * w4;
  gl_FragColor = s;
}`;

// ------------------------------------------------------------------ grunge names

/**
 * Painter's grunge resources and which CC0 grunge category LocalPaint uses in their place.
 * Values are `grunge:<category>` (first of that category) or `grunge:<category>/<n>`.
 */
export const PAINTER_GRUNGE: Record<string, string> = {
  bnw_spots_1: 'grunge:spots/SurfaceImperfections012', bnw_spots_2: 'grunge:spots/SurfaceImperfections001', bnw_spots_3: 'grunge:spots/SurfaceImperfections008',
  grunge_map_001: 'grunge:soft/SurfaceImperfections014', grunge_map_002: 'grunge:soft/SurfaceImperfections020', grunge_map_003: 'grunge:soft/SurfaceImperfections003',
  grunge_map_004: 'grunge:leaks/SurfaceImperfections011', grunge_map_005: 'grunge:spots/SurfaceImperfections008', grunge_map_006: 'grunge:soft/SurfaceImperfections015',
  grunge_map_007: 'grunge:soft/SurfaceImperfections016', grunge_map_008: 'grunge:stains/Smear002', grunge_map_009: 'grunge:soft/SurfaceImperfections014',
  grunge_map_010: 'grunge:soft/SurfaceImperfections015', grunge_map_011: 'grunge:soft/SurfaceImperfections003', grunge_map_012: 'grunge:soft/SurfaceImperfections016',
  grunge_map_013: 'grunge:stains/Smear004', grunge_map_014: 'grunge:spots/SurfaceImperfections008', grunge_map_015: 'grunge:spots/SurfaceImperfections001',
  // "~": this CC0 scan is dark where Painter's grunge is light, so it gets inverted.
  grunge_map_31_bitmap: 'grunge:dust/SurfaceImperfections013~',
  grunge_concrete_dirty: 'grunge:concrete/Concrete049', grunge_concrete: 'grunge:concrete/Concrete047A', grunge_concrete_old: 'grunge:concrete/Concrete042A',
  grunge_dirt_stains: 'grunge:stains/Smear005', grunge_dirt_dried: 'grunge:stains/Smear001', grunge_water_stains: 'grunge:stains/SurfaceImperfections010',
  grunge_leaks: 'grunge:leaks/SurfaceImperfections002', grunge_leaks_dirty: 'grunge:leaks/SurfaceImperfections011', grunge_drips: 'grunge:leaks/SurfaceImperfections002',
  grunge_scratches_rough: 'grunge:scratches/Scratches002', grunge_scratches_fine: 'grunge:scratches/Scratches001', grunge_scratches_dirty: 'grunge:scratches/Scratches003',
  scratches_generator: 'grunge:scratches/Scratches004', grunge_scratched_plastic: 'grunge:scratches/Scratches005', grunge_paint_scratched: 'grunge:scratches/Scratches003',
  scratch_damage: 'grunge:scratches/Scratches002', scratched_metal: 'grunge:scratches/Scratches001',
  grunge_fingerprints: 'grunge:fingerprints/Fingerprints002', grunge_fingerprints_smudge: 'grunge:fingerprints/Fingerprints008', fingerprints: 'grunge:fingerprints/Fingerprints002',
  plastic_dust: 'grunge:dust/SurfaceImperfections007', grunge_dust: 'grunge:dust/SurfaceImperfections012', grunge_dust_soft: 'grunge:dust/SurfaceImperfections019', dust: 'grunge:dust/SurfaceImperfections007',
  grunge_rust_fine: 'grunge:rust', grunge_rust: 'grunge:rust/1', grunge_galvanic: 'grunge:rust/2',
  grunge_chipped: 'grunge:chips', grunge_damaged_paint: 'grunge:chips/1', grunge_paint_peeled: 'grunge:chips/2',
  grunge_smears: 'grunge:smear/Smear008', grunge_smudges: 'grunge:smear/Smear007', grunge_marble_shapes: 'grunge:soft/SurfaceImperfections016',
  clouds_1: 'grunge:clouds', clouds_2: 'grunge:clouds/1', clouds_3: 'grunge:clouds/2', moisture_noise: 'grunge:clouds/3',
  white_noise: 'grunge:noise', perlin_noise: 'grunge:clouds/4', fractal_sum_base: 'grunge:clouds/5',
};
/** Turn a Painter resource name (e.g. "Grunge Map 010", "grunge_map_010.sbsar") into LocalPaint's grunge reference. */
export function painterGrunge(name: string): string {
  const k = name.toLowerCase().replace(/\.(sbsar|sbs|png|jpg|tif)$/, '').replace(/[\s-]+/g, '_').replace(/^.*[\\/]/, '').replace(/^ratio_/, '');
  if (PAINTER_GRUNGE[k]) return PAINTER_GRUNGE[k];
  for (const [cat, re] of GRUNGE_GUESS) if (re.test(k)) return 'grunge:' + cat;
  return 'grunge:soft';
}
const GRUNGE_GUESS: [string, RegExp][] = [
  ['scratches', /scratch/], ['fingerprints', /finger|print/], ['dust', /dust/], ['leaks', /leak|drip|streak/], ['rust', /rust|corro|galvan/],
  ['chips', /chip|peel|damage/], ['smear', /smear|smudge/], ['concrete', /concrete|cement|plaster/], ['spots', /spot|bnw|dot/],
  ['stains', /stain|water|dirt/], ['clouds', /cloud|noise|perlin|fractal|moist/],
];
/** Fallback procedural pattern (Procedural.ts index) for each grunge category until the CC0 texture is there. */
export const GRUNGE_FALLBACK: Record<string, string> = {
  spots: 'grunge', soft: 'clouds', stains: 'grunge', concrete: 'grunge', leaks: 'streaks', scratches: 'scratches',
  fingerprints: 'smudges', dust: 'clouds', rust: 'grunge', chips: 'chips', smear: 'smudges', clouds: 'clouds', noise: 'grunge',
};
export const GRUNGE_CATS = Object.keys(GRUNGE_FALLBACK);
export const GRUNGE_CAT_LABEL: Record<string, string> = {
  spots: 'Spots', soft: 'Soft grunge', stains: 'Stains', concrete: 'Concrete & plaster', leaks: 'Leaks & drips', scratches: 'Scratches',
  fingerprints: 'Fingerprints', dust: 'Dust', rust: 'Rust & corrosion', chips: 'Chips & peeling', smear: 'Smears', clouds: 'Clouds & noise', noise: 'Noise',
};
/** `grunge:<category>`, `grunge:<category>/<n>` or `grunge:<category>/<scan id>` (the category is the fallback). */
export const parseGrungeRef = (ref: string): { cat: string; n: number; id?: string } => {
  const m = /^grunge:([a-z]+)(?:\/([\w.-]+))?$/.exec(ref);
  if (!m) return { cat: 'soft', n: 0 };
  return /^\d+$/.test(m[2] ?? '0') ? { cat: m[1], n: Number(m[2] ?? 0) } : { cat: m[1], n: 0, id: m[2] };
};

// ------------------------------------------------------------------ reading Painter's settings

/** Older Painter versions name the Mask Editor's parameters differently; this maps them to the current names. */
const EDITOR_OLD: Record<string, string> = {
  invert_tex: 'texutre_invert', tex_blend_mode: 'texture_blendmode', scale_tex: 'texture_scale', tex_contrast: 'texture_contrast',
  tex_lum: 'texture_brightness', tex1_trip: 'texture_triplanar', tex1_trip_control: 'texture_triplanar_contrast', tex: 'texture_opacity',
  invert_tex_sec: 'texture2_invert', tex2_blend_mode: 'texture2_blendmode', tex2_scale: 'texture2_scale', tex2_contrast: 'texture2_contrast',
  tex2_lum: 'texture2_brightness', tex2_trip: 'texture2_triplanar', tex2_trip_control: 'texture2_triplanar_contrast', tex2: 'texture2_opacity',
  invert_ao: 'ao_invert', ao_blend_mode: 'ao_blendmode', ao: 'ao_opacity',
  invert_invert: 'curvature_invert', curv_blend_mode: 'curvature_blendmode', Curvature_Mode: 'curvature_mode',
  Curvature_Sharp: 'curvature_sharp', Curvature_Fine: 'curvature_fine', Curvature_Soft: 'curvature_soft', Curvature_Medium: 'curvature_medium',
  Curvature_Large: 'curvature_large', Curvature_Big: 'curvature_big', Curvature_Huge: 'curvature_huge',
  curv_contrast: 'curvature_contrast', curv_lum: 'curvature_brightness', curv: 'curvature_opacity',
  ws_blend: 'ws_blendmode', world_balance: 'ws_balance', ws_lum: 'ws_brightness', ws: 'ws_opacity',
  grad_invert: 'position_invert', Gradient_Direction_Balance: 'position_balance', grad_contrast: 'position_contrast', grad_lum: 'position_brightness',
  grad_blend: 'position_blendmode', Position_Gradient: 'position_opacity',
  thick_invert: 'thickness_invert', thick_blur: 'thickness_blur', Thickness_thick_Contrast: 'thickness_contrast',
  Thickness_thick_Luminosity: 'thickness_brightness', thick: 'thickness_opacity',
};
for (const [pre, to] of [['Object_Space_Direction', 'ws'], ['Gradient_Direction', 'position']] as const) {
  for (const [d, k] of [['Right_to_Left', 'rightleft'], ['Top_To_Bottom', 'topbottom'], ['Front_to_Back', 'frontback']] as const) {
    EDITOR_OLD[`${pre}_${d}`] = `${to}_direction_${k}_opacity`;
    EDITOR_OLD[`${pre}_${d}_Invert`] = `${to}_direction_${k}_invert`;
    EDITOR_OLD[`${pre}_${d}_Blending_Mode`] = `${to}_direction_${k}_blendmode`;
  }
}

const KIND_OF: [RegExp, SpKind][] = [
  [/^mg_mask_editor/, 'editor'], [/^mg_mask_builder/, 'builder'], [/^mg_metal_edge_wear/, 'wear'], [/^mg_fiber_glass_edge_wear/, 'fiberwear'],
  [/^mg_dirt/, 'dirt'], [/^mg_dust/, 'dust'], [/^mg_ground_dirt/, 'grounddirt'], [/^mg_position/, 'position'], [/^mg_ambient_occlusion/, 'ao'],
  [/^mg_curvature/, 'curvature'], [/^light$/, 'light'], [/^3d_linear_gradient/, 'gradient3d'], [/^3d_distance/, 'distance3d'],
  [/^mg_world_space_normals/, 'editor'], [/^mg_(edge_wear|paint_wear|edge_dirt|selective_dirt)/, 'wear'],
];

/**
 * A Painter generator or grunge fill (its resource name, e.g. "mg_dirt" or "grunge_concrete_dirty", and its parameter values)
 * as LocalPaint generator settings. `inputs` are the textures plugged into it (Mask Editor's Texture / Texture 2, custom grunges).
 * `projection` is Painter's fill projection (2 = tri-planar).
 */
export type SpInput = string | { res: string; tw?: Record<string, any> };
export function spFromPainter(res: string, tw: Record<string, any>, inputs: Record<string, SpInput> = {}, projection?: number): SpSettings {
  const name = res.toLowerCase().replace(/\.sbsar$/, '').replace(/^ratio_/, '');
  const kind = KIND_OF.find(([re]) => re.test(name))?.[1];
  if (!kind) {
    // A grunge / noise map used directly as the mask.
    const s = spDefaults('grunge');
    const ref = painterGrunge(name);
    s.p.grunge = ref.replace(/~$/, '');
    s.p.triplanar = projection === 2;
    if (typeof tw.balance === 'number') s.p.balance = tw.balance;
    if (typeof tw.contrast === 'number') s.p.contrast = tw.contrast;
    s.p.invert = (tw.invert === 1 || tw.invert === true) !== ref.endsWith('~');
    return s;
  }
  const s = spDefaults(kind);
  const defs = new Map(SP_DEFS[kind].params.map((d) => [d.id, d]));
  for (const [k0, v] of Object.entries(tw)) {
    const k = kind === 'editor' && EDITOR_OLD[k0] ? EDITOR_OLD[k0] : k0;
    const d = defs.get(k) ?? (kind === 'distance3d' && /^position_[xyz]$/.test(k) ? defs.get('position_xyz') : undefined);
    if (!d) continue;
    if (d.kind === 'vec3') {
      const cur = (s.p[d.id] as [number, number, number]).slice() as [number, number, number];
      if (Array.isArray(v)) s.p[d.id] = [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
      else if (typeof v === 'number') { cur['xyz'.indexOf(k.slice(-1))] = v; s.p[d.id] = cur; }
    } else if (d.kind === 'b') s.p[d.id] = v === 1 || v === true;
    else if (typeof v === 'number') s.p[d.id] = v;
  }
  if (name.startsWith('mg_world_space_normals')) { s.p.curvature_opacity = 0; s.p.ws_opacity = 1; }
  // Textures plugged into the generator.
  const tex = (slot: string, key: string, use?: string) => {
    const inp = inputs[slot];
    if (!inp || !defs.has(key)) return;
    const r = typeof inp === 'string' ? inp : inp.res;
    const ref = painterGrunge(r);
    s.p[key] = ref.replace(/~$/, '');
    if (use && defs.has(use)) s.p[use] = true;
    // The grunge's own balance / contrast (Painter grunges have histogram settings of their own).
    const itw = typeof inp === 'string' ? {} : inp.tw ?? {};
    const bal = itw.balance ?? itw.histogram_position ?? itw.position;
    const con = itw.contrast ?? itw.histogram_contrast;
    const pre = key === 'texture_sec' ? 'texture2_in_' : 'texture_in_';
    if (typeof bal === 'number' && defs.has(pre + 'balance')) s.p[pre + 'balance'] = bal;
    if (typeof con === 'number' && defs.has(pre + 'contrast')) s.p[pre + 'contrast'] = con;
    if (((itw.invert === 1 || itw.invert === true) !== ref.endsWith('~')) && key !== 'grunge') {
      const inv = key === 'texture_sec' ? 'texture2_invert' : 'texutre_invert';
      if (defs.has(inv)) s.p[inv] = !s.p[inv];
    }
  };
  tex('texture', 'texture', 'visibleifTexture');
  tex('texture_sec', 'texture_sec');
  tex('grunge', 'grunge', kind === 'builder' ? 'Grunge_Use_Custom_Grunge' : 'Use_Custom_Grunge');
  return s;
}
