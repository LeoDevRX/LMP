/**
 * Export templates (like Substance Painter's "Output templates"): each output map is a file whose
 * channels are filled from LMP's channels, the baked mesh maps or converted maps
 * (glossiness, diffuse, specular, DirectX normal…). Built-in templates cover the usual engines and
 * renderers; users can make their own.
 */

// ------------------------------------------------------------------ sources

export type ExpSrc =
  | 'baseColor' | 'roughness' | 'metallic' | 'height' | 'emissive' | 'normalGL' | 'opacity'
  | 'glossiness' | 'normalDX' | 'diffuse' | 'specular' | 'emissiveMask' | 'colorAO' | 'mixedAO'
  | 'ao' | 'curvature' | 'thickness' | 'position' | 'wsn' | 'id' | 'meshNormal' | 'meshHeight'
  | 'white' | 'black';

export interface SrcInfo { label: string; group: 'input' | 'mesh' | 'converted' | 'constant'; color: boolean; tint: string }
export const SOURCES: Record<ExpSrc, SrcInfo> = {
  baseColor: { label: 'Base color', group: 'input', color: true, tint: '#c98b4a' },
  roughness: { label: 'Roughness', group: 'input', color: false, tint: '#7d8a99' },
  metallic: { label: 'Metallic', group: 'input', color: false, tint: '#a9b4c2' },
  height: { label: 'Height', group: 'input', color: false, tint: '#8a8a8a' },
  emissive: { label: 'Emissive', group: 'input', color: true, tint: '#e0a030' },
  normalGL: { label: 'Normal', group: 'input', color: true, tint: '#8080ff' },
  opacity: { label: 'Opacity', group: 'input', color: false, tint: '#b0306a' },
  ao: { label: 'Ambient occlusion', group: 'mesh', color: false, tint: '#6b6b6b' },
  curvature: { label: 'Curvature', group: 'mesh', color: false, tint: '#9a9a9a' },
  thickness: { label: 'Thickness', group: 'mesh', color: false, tint: '#9a7b5a' },
  position: { label: 'Position', group: 'mesh', color: true, tint: '#5aa06a' },
  wsn: { label: 'World space normal', group: 'mesh', color: true, tint: '#7a6ad0' },
  id: { label: 'ID', group: 'mesh', color: true, tint: '#c05080' },
  meshNormal: { label: 'Normal (baked)', group: 'mesh', color: true, tint: '#8080ff' },
  meshHeight: { label: 'Height (baked)', group: 'mesh', color: false, tint: '#8a8a8a' },
  glossiness: { label: 'Glossiness', group: 'converted', color: false, tint: '#3a9a5a' },
  normalDX: { label: 'Normal DirectX', group: 'converted', color: true, tint: '#a050a0' },
  diffuse: { label: 'Diffuse', group: 'converted', color: true, tint: '#3a3a8a' },
  specular: { label: 'Specular', group: 'converted', color: true, tint: '#8a8a40' },
  emissiveMask: { label: 'Emissive mask', group: 'converted', color: false, tint: '#e0a030' },
  colorAO: { label: 'Color × AO (unlit)', group: 'converted', color: true, tint: '#a07040' },
  mixedAO: { label: 'Mixed AO', group: 'converted', color: false, tint: '#6b6b6b' },
  white: { label: 'White', group: 'constant', color: false, tint: '#e8e8e8' },
  black: { label: 'Black', group: 'constant', color: false, tint: '#202020' },
};

// ------------------------------------------------------------------ templates

/** gray = 1 channel; rgb = one color source; r+g+b = 3 gray sources; rgb+a; r+g+b+a. */
export type MapMode = 'gray' | 'rgb' | 'r+g+b' | 'rgb+a' | 'r+g+b+a';
export const MODE_SLOTS: Record<MapMode, ('L' | 'RGB' | 'R' | 'G' | 'B' | 'A')[]> = {
  gray: ['L'], rgb: ['RGB'], 'r+g+b': ['R', 'G', 'B'], 'rgb+a': ['RGB', 'A'], 'r+g+b+a': ['R', 'G', 'B', 'A'],
};
export type FileType = 'png' | 'jpg' | 'tga';
export interface OutMap {
  name: string;
  mode: MapMode;
  src: (ExpSrc | null)[];
  /** Per-map overrides ('' = the global setting). */
  format?: FileType | '';
  bits?: 8 | 16 | 0;
}
export interface ExportTemplate {
  id: string;
  label: string;
  group: string;
  note?: string;
  maxSize?: number;
  maps: OutMap[];
  custom?: boolean;
}

const T = '$textureSet';
const m = (suffix: string, mode: MapMode, ...src: ExpSrc[]): OutMap => ({ name: `${T}_${suffix}`, mode, src });
const pbr = (n: { color: string; rough: string; metal: string; normal: string; height?: string; emit?: string; ao?: string }, dx = false): OutMap[] => [
  m(n.color, 'rgb', 'baseColor'), m(n.metal, 'gray', 'metallic'), m(n.rough, 'gray', 'roughness'), m(n.normal, 'rgb', dx ? 'normalDX' : 'normalGL'),
  ...(n.height ? [m(n.height, 'gray', 'height')] : []), ...(n.emit ? [m(n.emit, 'rgb', 'emissive')] : []), ...(n.ao ? [m(n.ao, 'gray', 'ao')] : []),
];

export const BUILTIN_TEMPLATES: ExportTemplate[] = [
  // ---- general
  { id: 'pbr-gl', label: 'PBR Metallic Roughness', group: 'General', note: 'One file per channel. Normal is OpenGL (Y+).',
    maps: pbr({ color: 'BaseColor', rough: 'Roughness', metal: 'Metallic', normal: 'Normal', height: 'Height', emit: 'Emissive', ao: 'AmbientOcclusion' }) },
  { id: 'pbr-dx', label: 'PBR Metallic Roughness (DirectX normal)', group: 'General', note: 'Like PBR Metallic Roughness, with a DirectX (Y−) normal map.',
    maps: pbr({ color: 'BaseColor', rough: 'Roughness', metal: 'Metallic', normal: 'Normal', height: 'Height', emit: 'Emissive', ao: 'AmbientOcclusion' }, true) },
  { id: 'pbr-sg', label: 'PBR Specular Glossiness', group: 'General', note: 'Diffuse, Specular and Glossiness, converted from metal / rough.',
    maps: [m('Diffuse', 'rgb', 'diffuse'), m('Specular', 'rgb', 'specular'), m('Glossiness', 'gray', 'glossiness'), m('Normal', 'rgb', 'normalGL'), m('Height', 'gray', 'height'), m('Emissive', 'rgb', 'emissive'), m('AmbientOcclusion', 'gray', 'ao')] },
  { id: 'non-pbr', label: 'Non-PBR (Diffuse / Specular / Glossiness)', group: 'General', note: 'For older engines: diffuse with AO baked in, specular, glossiness, DirectX normal.',
    maps: [m('Diffuse', 'rgb', 'colorAO'), m('Specular', 'rgb', 'specular'), m('Glossiness', 'gray', 'glossiness'), m('Normal', 'rgb', 'normalDX'), m('Height', 'gray', 'height')] },
  { id: 'unlit', label: 'Unlit / hand-painted (color with baked AO)', group: 'General', note: 'One color map with the ambient occlusion baked in. Good for mobile, low-poly and stylized games.',
    maps: [m('Color', 'rgb', 'colorAO')] },
  { id: 'mesh-maps', label: 'Mesh maps (baked)', group: 'General', note: 'The baked mesh maps, as Painter\'s "Mesh Maps" preset. Bake them first.',
    maps: [m('ambient_occlusion', 'gray', 'ao'), m('curvature', 'gray', 'curvature'), m('normal_base', 'rgb', 'meshNormal'), m('world_space_normals', 'rgb', 'wsn'), m('position', 'rgb', 'position'), m('thickness', 'gray', 'thickness'), m('id', 'rgb', 'id'), m('height', 'gray', 'meshHeight')] },
  // ---- game engines
  { id: 'unity-builtin', label: 'Unity (Built-in, Standard Metallic)', group: 'Game engines', note: 'Smoothness goes in the alpha of MetallicSmoothness. Normal is OpenGL.',
    maps: [m('AlbedoTransparency', 'rgb+a', 'baseColor', 'opacity'), m('MetallicSmoothness', 'r+g+b+a', 'metallic', 'black', 'black', 'glossiness'), m('Normal', 'rgb', 'normalGL'), m('Emission', 'rgb', 'emissive'), m('Occlusion', 'gray', 'ao'), m('Height', 'gray', 'height')] },
  { id: 'unity-urp', label: 'Unity Universal Render Pipeline (Metallic)', group: 'Game engines', note: 'BaseMap, MetallicSmoothness (smoothness in alpha), Normal (OpenGL), Emission, Occlusion.',
    maps: [m('BaseMap', 'rgb+a', 'baseColor', 'opacity'), m('MetallicSmoothness', 'r+g+b+a', 'metallic', 'black', 'black', 'glossiness'), m('Normal', 'rgb', 'normalGL'), m('Emission', 'rgb', 'emissive'), m('Occlusion', 'gray', 'ao'), m('Height', 'gray', 'height')] },
  { id: 'unity-urp-spec', label: 'Unity Universal Render Pipeline (Specular)', group: 'Game engines', note: 'Specular workflow: BaseMap (diffuse), SpecularSmoothness (smoothness in alpha).',
    maps: [m('BaseMap', 'rgb+a', 'diffuse', 'opacity'), m('SpecularSmoothness', 'rgb+a', 'specular', 'glossiness'), m('Normal', 'rgb', 'normalGL'), m('Emission', 'rgb', 'emissive'), m('Occlusion', 'gray', 'ao')] },
  { id: 'unity-hdrp', label: 'Unity HD Render Pipeline (Metallic)', group: 'Game engines', note: 'MaskMap = R metallic, G ambient occlusion, B detail mask, A smoothness.',
    maps: [m('BaseMap', 'rgb+a', 'baseColor', 'opacity'), m('MaskMap', 'r+g+b+a', 'metallic', 'ao', 'white', 'glossiness'), m('Normal', 'rgb', 'normalGL'), m('Emissive', 'rgb', 'emissive'), m('Height', 'gray', 'height')] },
  { id: 'unreal', label: 'Unreal Engine (Packed)', group: 'Game engines', note: 'OcclusionRoughnessMetallic = R AO, G roughness, B metallic. Normal is DirectX.',
    maps: [m('BaseColor', 'rgb', 'baseColor'), m('OcclusionRoughnessMetallic', 'r+g+b', 'ao', 'roughness', 'metallic'), m('Normal', 'rgb', 'normalDX'), m('Emissive', 'rgb', 'emissive'), m('Height', 'gray', 'height')] },
  { id: 'unreal-opacity', label: 'Unreal Engine (Packed, with opacity)', group: 'Game engines', note: 'Like Unreal Engine (Packed), with opacity in the BaseColor alpha (glass, leaves, fences).',
    maps: [m('BaseColor', 'rgb+a', 'baseColor', 'opacity'), m('OcclusionRoughnessMetallic', 'r+g+b', 'ao', 'roughness', 'metallic'), m('Normal', 'rgb', 'normalDX'), m('Emissive', 'rgb', 'emissive')] },
  { id: 'godot', label: 'Godot 4 (ORM)', group: 'Game engines', note: 'ORM = R AO, G roughness, B metallic. Normal is OpenGL.',
    maps: [m('albedo', 'rgb+a', 'baseColor', 'opacity'), m('orm', 'r+g+b', 'ao', 'roughness', 'metallic'), m('normal', 'rgb', 'normalGL'), m('emission', 'rgb', 'emissive'), m('height', 'gray', 'height')] },
  { id: 'roblox', label: 'Roblox (SurfaceAppearance)', group: 'Game engines', maxSize: 1024,
    note: 'Roblox caps textures at 1024. Roblox glows in the ColorMap color: set EmissiveTint and EmissiveStrength on the SurfaceAppearance.',
    maps: [m('ColorMap', 'rgb', 'baseColor'), m('NormalMap', 'rgb', 'normalGL'), m('RoughnessMap', 'gray', 'roughness'), m('MetalnessMap', 'gray', 'metallic'), m('EmissiveMask', 'gray', 'emissiveMask')] },
  { id: 'roblox-mv', label: 'Roblox (MaterialVariant)', group: 'Game engines', maxSize: 1024, note: 'For MaterialService MaterialVariants (tiling materials). Roblox caps textures at 1024.',
    maps: [m('ColorMap', 'rgb', 'baseColor'), m('NormalMap', 'rgb', 'normalGL'), m('RoughnessMap', 'gray', 'roughness'), m('MetalnessMap', 'gray', 'metallic')] },
  { id: 'roblox-color', label: 'Roblox (Color only, Texture / Decal)', group: 'Game engines', maxSize: 1024, note: 'One color map with AO baked in, for MeshPart.TextureID, Decals and Textures.',
    maps: [m('Color', 'rgb', 'colorAO')] },
  { id: 'lumberyard', label: 'Amazon Lumberyard / O3DE', group: 'Game engines', note: 'diff (diffuse + opacity), spec, ddna (DirectX normal + glossiness in alpha).',
    maps: [m('diff', 'rgb+a', 'diffuse', 'opacity'), m('spec', 'rgb', 'specular'), m('ddna', 'rgb+a', 'normalDX', 'glossiness')] },
  { id: 'cryengine', label: 'CryEngine', group: 'Game engines', note: 'diff (diffuse + opacity), spec, ddna (DirectX normal + glossiness in alpha).',
    maps: [m('diff', 'rgb+a', 'diffuse', 'opacity'), m('spec', 'rgb', 'specular'), m('ddna', 'rgb+a', 'normalDX', 'glossiness')] },
  { id: 'source2', label: 'Source 2 (Metal / Rough)', group: 'Game engines', note: 'Color, Rough, Metal, AO and a DirectX normal.',
    maps: [m('color', 'rgb', 'baseColor'), m('rough', 'gray', 'roughness'), m('metal', 'gray', 'metallic'), m('normal', 'rgb', 'normalDX'), m('ao', 'gray', 'ao')] },
  { id: 'lens-studio', label: 'Lens Studio', group: 'Game engines', note: 'Material params = R metallic, G roughness, B AO.',
    maps: [m('BaseColor', 'rgb+a', 'baseColor', 'opacity'), m('Normal', 'rgb', 'normalGL'), m('Params', 'r+g+b', 'metallic', 'roughness', 'ao'), m('Emissive', 'rgb', 'emissive')] },
  // ---- 3D programs and renderers
  { id: 'blender', label: 'Blender (Principled BSDF)', group: '3D programs & renderers', note: 'Plug Normal into a Normal Map node (OpenGL). Height can drive Displacement.',
    maps: pbr({ color: 'Base_Color', rough: 'Roughness', metal: 'Metallic', normal: 'Normal', height: 'Height', emit: 'Emission' }) },
  { id: 'adobe-standard', label: 'Adobe Standard Material', group: '3D programs & renderers',
    maps: [...pbr({ color: 'baseColor', rough: 'roughness', metal: 'metallic', normal: 'normal', height: 'height', emit: 'emissive', ao: 'ambientOcclusion' }), m('opacity', 'gray', 'opacity')] },
  { id: 'arnold', label: 'Arnold (aiStandardSurface) – Maya, 3ds Max, Houdini', group: '3D programs & renderers',
    maps: pbr({ color: 'BaseColor', rough: 'Roughness', metal: 'Metalness', normal: 'Normal', height: 'Height', emit: 'Emissive' }) },
  { id: 'vray', label: 'V-Ray (Metallic Roughness)', group: '3D programs & renderers',
    maps: pbr({ color: 'BaseColor', rough: 'Roughness', metal: 'Metalness', normal: 'Normal', height: 'Height', emit: 'Emissive' }) },
  { id: 'vray-sg', label: 'V-Ray (Specular Glossiness)', group: '3D programs & renderers',
    maps: [m('Diffuse', 'rgb', 'diffuse'), m('Reflection', 'rgb', 'specular'), m('Glossiness', 'gray', 'glossiness'), m('Normal', 'rgb', 'normalGL'), m('Height', 'gray', 'height')] },
  { id: 'redshift', label: 'Redshift (rsMaterial)', group: '3D programs & renderers',
    maps: pbr({ color: 'BaseColor', rough: 'Roughness', metal: 'Metalness', normal: 'Normal', height: 'Height', emit: 'Emissive' }) },
  { id: 'corona', label: 'Corona', group: '3D programs & renderers',
    maps: pbr({ color: 'BaseColor', rough: 'Roughness', metal: 'Metalness', normal: 'Normal', height: 'Displacement', emit: 'Emissive' }) },
  { id: 'renderman', label: 'RenderMan (PxrSurface)', group: '3D programs & renderers',
    maps: [...pbr({ color: 'BaseColor', rough: 'Roughness', metal: 'Metallic', normal: 'Normal', height: 'Height', emit: 'Emissive' }), m('Presence', 'gray', 'opacity')] },
  { id: 'c4d', label: 'Cinema 4D', group: '3D programs & renderers',
    maps: pbr({ color: 'BaseColor', rough: 'Roughness', metal: 'Metallic', normal: 'Normal', height: 'Height', emit: 'Emission', ao: 'AO' }) },
  { id: 'keyshot', label: 'KeyShot', group: '3D programs & renderers',
    maps: [...pbr({ color: 'BaseColor', rough: 'Roughness', metal: 'Metallic', normal: 'Normal', height: 'Height' }), m('Opacity', 'gray', 'opacity')] },
  { id: 'marmoset', label: 'Marmoset Toolbag', group: '3D programs & renderers',
    maps: [m('Albedo', 'rgb', 'baseColor'), m('Gloss', 'gray', 'glossiness'), m('Metalness', 'gray', 'metallic'), m('Normal', 'rgb', 'normalGL'), m('AO', 'gray', 'ao'), m('Height', 'gray', 'height'), m('Emissive', 'rgb', 'emissive')] },
  // ---- web and AR
  { id: 'gltf', label: 'glTF / GLB (packed ORM)', group: 'Web & AR', note: 'occlusionRoughnessMetallic = R AO, G roughness, B metallic. Also works for three.js and Babylon.js.',
    maps: [m('baseColor', 'rgb+a', 'baseColor', 'opacity'), m('occlusionRoughnessMetallic', 'r+g+b', 'ao', 'roughness', 'metallic'), m('normal', 'rgb', 'normalGL'), m('emissive', 'rgb', 'emissive')] },
  { id: 'sketchfab', label: 'Sketchfab', group: 'Web & AR',
    maps: [m('BaseColor', 'rgb+a', 'baseColor', 'opacity'), m('Metallic', 'gray', 'metallic'), m('Roughness', 'gray', 'roughness'), m('Normal', 'rgb', 'normalGL'), m('AO', 'gray', 'ao'), m('Emissive', 'rgb', 'emissive'), m('Height', 'gray', 'height')] },
  { id: 'usd', label: 'USD / USDZ (UsdPreviewSurface)', group: 'Web & AR', note: 'For Apple Reality Composer / AR Quick Look and Omniverse.',
    maps: [m('diffuseColor', 'rgb', 'baseColor'), m('metallic', 'gray', 'metallic'), m('roughness', 'gray', 'roughness'), m('normal', 'rgb', 'normalGL'), m('occlusion', 'gray', 'ao'), m('emissiveColor', 'rgb', 'emissive'), m('opacity', 'gray', 'opacity')] },
];

export const TEMPLATE_GROUPS = ['General', 'Game engines', '3D programs & renderers', 'Web & AR', 'Your templates'];

// ------------------------------------------------------------------ settings kept between sessions

export type PadMode = 'infinite' | 'dilate' | 'transparent' | 'dilate+transparent' | 'none';
export const PAD_LABEL: Record<PadMode, string> = {
  infinite: 'Dilation infinite', dilate: 'Dilation', 'dilate+transparent': 'Dilation + transparent', transparent: 'Transparent', none: 'Passthrough',
};
export interface ExportState {
  template: string;
  format: FileType;
  bits: 8 | 16;
  /** 0 = the texture set's size. */
  size: number;
  padding: PadMode;
  padPx: number;
  dir: string;
  openAfter: boolean;
  custom: ExportTemplate[];
}
export const DEFAULT_EXPORT: ExportState = { template: 'pbr-gl', format: 'png', bits: 8, size: 0, padding: 'infinite', padPx: 16, dir: '', openAfter: true, custom: [] };
const KEY = 'lmp-export';
export function loadExportState(): ExportState {
  try { const s = { ...DEFAULT_EXPORT, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; s.custom = Array.isArray(s.custom) ? s.custom : []; return s; } catch { return structuredClone(DEFAULT_EXPORT); }
}
export function saveExportState(s: ExportState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}
export function allTemplates(s: ExportState): ExportTemplate[] { return [...BUILTIN_TEMPLATES, ...s.custom]; }

export function fileName(pattern: string, textureSet: string, ext: string) {
  const n = pattern.replace(/\$textureSet/g, textureSet).replace(/\$mesh/g, textureSet).replace(/\$project/g, textureSet);
  return `${n.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'texture'}.${ext}`;
}
export const channelsOf = (mode: MapMode, alpha: boolean) => (mode === 'gray' ? (alpha ? 2 : 1) : mode === 'rgb' || mode === 'r+g+b' ? (alpha ? 4 : 3) : 4);

// ------------------------------------------------------------------ composing and padding

/** Pixels of one source: RGBA, rows bottom-up (GL order). 8-bit or 0..1 floats. */
export type Pix = Uint8Array | Float32Array;

/**
 * Build one output map. Returns interleaved channels (1, 2, 3 or 4), rows bottom-up, as 8- or 16-bit values.
 * Gray slots take a gray source's value, or a color source's luminance.
 */
export function compose(map: OutMap, get: (s: ExpSrc) => Pix, w: number, h: number, bits: 8 | 16, alpha: boolean): Uint8Array | Uint16Array {
  const slots = MODE_SLOTS[map.mode];
  const nc = channelsOf(map.mode, alpha);
  const n = w * h;
  const max = bits === 16 ? 65535 : 255;
  const out = bits === 16 ? new Uint16Array(n * nc) : new Uint8Array(n * nc);
  const srcs = slots.map((_, i) => map.src[i] ?? 'black');
  const pix = srcs.map((s) => get(s));
  const scale = pix.map((p) => (p instanceof Float32Array ? max : max / 255));
  const lum = srcs.map((s) => SOURCES[s].color);
  let o = 0;
  for (let i = 0; i < n; i++) {
    const k = i * 4;
    for (let si = 0; si < slots.length; si++) {
      const p = pix[si], sc = scale[si];
      const slot = slots[si];
      if (slot === 'RGB') {
        out[o++] = Math.round(Math.min(1, Math.max(0, p[k] * sc / max)) * max);
        out[o++] = Math.round(Math.min(1, Math.max(0, p[k + 1] * sc / max)) * max);
        out[o++] = Math.round(Math.min(1, Math.max(0, p[k + 2] * sc / max)) * max);
      } else {
        const v = lum[si] ? 0.299 * p[k] + 0.587 * p[k + 1] + 0.114 * p[k + 2] : p[k];
        out[o++] = Math.round(Math.min(max, Math.max(0, v * sc)));
      }
    }
    if (alpha && (map.mode === 'gray' || map.mode === 'rgb' || map.mode === 'r+g+b')) out[o++] = max;
  }
  return out;
}

/**
 * For every empty texel (outside the UV islands), the nearest texel inside one (breadth-first,
 * up to `limit` steps; 0 = no limit). -1 = stays as it is.
 */
export function nearestFill(cov: Uint8Array, w: number, h: number, limit: number): Int32Array {
  const n = w * h;
  const near = new Int32Array(n).fill(-1);
  const dist = new Uint16Array(n);
  const q = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) if (cov[i]) { near[i] = i; q[tail++] = i; }
  if (!tail) return near;
  const lim = limit > 0 ? limit : 65535;
  while (head < tail) {
    const p = q[head++];
    const d = dist[p];
    if (d >= lim) continue;
    const x = p % w, y = (p / w) | 0;
    const src = near[p];
    if (x > 0 && near[p - 1] < 0) { near[p - 1] = src; dist[p - 1] = d + 1; q[tail++] = p - 1; }
    if (x < w - 1 && near[p + 1] < 0) { near[p + 1] = src; dist[p + 1] = d + 1; q[tail++] = p + 1; }
    if (y > 0 && near[p - w] < 0) { near[p - w] = src; dist[p - w] = d + 1; q[tail++] = p - w; }
    if (y < h - 1 && near[p + w] < 0) { near[p + w] = src; dist[p + w] = d + 1; q[tail++] = p + w; }
  }
  return near;
}

/** Apply padding to a composed map (in place). */
export function pad(data: Uint8Array | Uint16Array, nc: number, w: number, h: number, cov: Uint8Array, near: Int32Array | null, mode: PadMode) {
  const n = w * h;
  if ((mode === 'infinite' || mode === 'dilate' || mode === 'dilate+transparent') && near) {
    for (let i = 0; i < n; i++) {
      const s = near[i];
      if (s >= 0 && s !== i) for (let c = 0; c < nc; c++) data[i * nc + c] = data[s * nc + c];
    }
  }
  if ((mode === 'transparent' || mode === 'dilate+transparent') && (nc === 2 || nc === 4)) {
    const a = nc - 1;
    for (let i = 0; i < n; i++) {
      if (cov[i]) continue;
      if (mode === 'transparent' || !near || near[i] < 0) data[i * nc + a] = 0;
    }
  }
}

// ------------------------------------------------------------------ file encoders

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b: Uint8Array, start: number, end: number) { let c = 0xffffffff; for (let i = start; i < end; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
async function zlib(data: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** PNG (gray, gray+alpha, RGB or RGBA; 8 or 16 bit). Input rows bottom-up. */
export async function encodePNG(data: Uint8Array | Uint16Array, w: number, h: number, nc: number, bits: 8 | 16): Promise<Blob> {
  const bpp = nc * (bits / 8);
  const stride = w * bpp;
  const raw = new Uint8Array((stride + 1) * h);
  const row = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const src = h - 1 - y; // top-down
    if (bits === 8) row.set((data as Uint8Array).subarray(src * w * nc, (src + 1) * w * nc));
    else { const d = data as Uint16Array; const o = src * w * nc; for (let i = 0; i < w * nc; i++) { const v = d[o + i]; row[i * 2] = v >> 8; row[i * 2 + 1] = v & 255; } }
    const o = y * (stride + 1);
    raw[o] = 2; // "Up" filter: smaller files
    for (let i = 0; i < stride; i++) raw[o + 1 + i] = (row[i] - prev[i]) & 255;
    prev.set(row);
  }
  const idat = await zlib(raw);
  const chunks: Uint8Array[] = [];
  const chunk = (type: string, body: Uint8Array) => {
    const c = new Uint8Array(12 + body.length);
    const dv = new DataView(c.buffer);
    dv.setUint32(0, body.length);
    for (let i = 0; i < 4; i++) c[4 + i] = type.charCodeAt(i);
    c.set(body, 8);
    dv.setUint32(8 + body.length, crc32(c, 4, 8 + body.length));
    chunks.push(c);
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h);
  ihdr[8] = bits; ihdr[9] = nc === 1 ? 0 : nc === 2 ? 4 : nc === 3 ? 2 : 6;
  chunk('IHDR', ihdr);
  chunk('IDAT', idat);
  chunk('IEND', new Uint8Array(0));
  return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks] as BlobPart[], { type: 'image/png' });
}

/** TGA (uncompressed, 8-bit gray / BGR / BGRA). Rows stay bottom-up, as TGA expects. */
export function encodeTGA(data: Uint8Array, w: number, h: number, nc: number): Blob {
  const gray = nc === 1;
  const outC = gray ? 1 : nc === 2 || nc === 4 ? 4 : 3;
  const head = new Uint8Array(18);
  head[2] = gray ? 3 : 2;
  head[12] = w & 255; head[13] = w >> 8; head[14] = h & 255; head[15] = h >> 8;
  head[16] = outC * 8; head[17] = outC === 4 ? 8 : 0;
  const body = new Uint8Array(w * h * outC);
  for (let i = 0, n = w * h; i < n; i++) {
    const s = i * nc, d = i * outC;
    if (gray) { body[d] = data[s]; continue; }
    if (nc === 2) { body[d] = body[d + 1] = body[d + 2] = data[s]; body[d + 3] = data[s + 1]; continue; }
    body[d] = data[s + 2]; body[d + 1] = data[s + 1]; body[d + 2] = data[s];
    if (outC === 4) body[d + 3] = data[s + 3];
  }
  return new Blob([head, body] as BlobPart[], { type: 'image/x-tga' });
}

/** JPG (8-bit, no alpha) through a canvas. */
export async function encodeJPG(data: Uint8Array, w: number, h: number, nc: number): Promise<Blob> {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const s = (sy * w + x) * nc, d = (y * w + x) * 4;
      if (nc <= 2) rgba[d] = rgba[d + 1] = rgba[d + 2] = data[s];
      else { rgba[d] = data[s]; rgba[d + 1] = data[s + 1]; rgba[d + 2] = data[s + 2]; }
      rgba[d + 3] = 255;
    }
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(rgba, w, h), 0, 0);
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('JPG encode failed'))), 'image/jpeg', 0.95));
}
