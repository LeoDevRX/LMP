/**
 * Best-effort reader for Substance material files, entirely in the browser.
 *
 * An .sbsar is a 7z archive with an XML description (name, outputs, parameters
 * and their defaults) and a compiled graph (.sbsasm) that only Adobe's engine
 * can run. We read the archive and the XML, take any pictures stored inside,
 * and build the closest TexPaint material we can. The compiled graph itself is
 * left alone, so procedural patterns are approximated, not reproduced.
 * An .spsm (smart material) is read the same way: any .sbsar / pictures inside
 * become layers.
 */
import type { Ch, ChannelValues } from './TextureSet';

export interface SbsInput { id: string; label: string; type: number; widget: string; def: number[]; min?: number; max?: number }
export interface SbsInfo {
  file: string;
  name: string;
  description: string;
  category: string;
  keywords: string;
  author: string;
  outputs: { id: string; label: string; usage: string }[];
  inputs: SbsInput[];
  /** Pictures stored inside the archive (by entry path). */
  images: { path: string; data: Uint8Array }[];
}
export interface Translation {
  name: string;
  values: ChannelValues;
  enabled: Record<Ch, boolean>;
  /** Maps taken from pictures inside the file. */
  maps: Partial<Record<Ch, File>>;
  normalDX: boolean;
  /** What was read and what was guessed, for the Properties panel. */
  note: string;
  exact: boolean;
  /** Glow color for emissive materials (lava, neon…), approximated as a glowing layer. */
  glow?: [number, number, number];
  /** The roughness map is really glossiness (invert it). */
  glossy?: boolean;
}

let modP: Promise<any> | null = null;
async function sevenZip() {
  if (!modP) {
    modP = (async () => {
      // The 7-Zip engine (WASM) is embedded in TexPaint.html; it's loaded on first use.
      const { default: factory } = await import('7z-wasm');
      return factory({ print: () => {}, printErr: () => {} } as any);
    })();
  }
  return modP;
}

let jobN = 0;
/** Unpack any archive 7-Zip understands (7z, zip, …). */
export async function unpack(bytes: Uint8Array): Promise<{ path: string; data: Uint8Array }[]> {
  const sz = await sevenZip();
  const FS = sz.FS;
  const dir = `/job${++jobN}`;
  FS.mkdir(dir);
  FS.writeFile(`${dir}/in.bin`, bytes);
  try { sz.callMain(['x', `${dir}/in.bin`, `-o${dir}/out`, '-y', '-bso0', '-bsp0']); } catch { /* exit() throws in emscripten */ }
  const out: { path: string; data: Uint8Array }[] = [];
  const walk = (p: string, rel: string) => {
    let names: string[] = [];
    try { names = FS.readdir(p); } catch { return; }
    for (const n of names) {
      if (n === '.' || n === '..') continue;
      const full = `${p}/${n}`, r = rel ? `${rel}/${n}` : n;
      const st = FS.stat(full);
      if (FS.isDir(st.mode)) walk(full, r);
      else out.push({ path: r, data: FS.readFile(full) });
    }
  };
  walk(`${dir}/out`, '');
  // free the virtual disk
  const rm = (p: string) => {
    for (const n of FS.readdir(p)) {
      if (n === '.' || n === '..') continue;
      const f = `${p}/${n}`;
      if (FS.isDir(FS.stat(f).mode)) { rm(f); FS.rmdir(f); } else FS.unlink(f);
    }
  };
  try { rm(dir); FS.rmdir(dir); } catch { /* ignore */ }
  return out;
}

const IMG = /\.(png|jpe?g|webp|bmp|gif)$/i;
const num = (s: string | null) => (s ?? '').split(',').map((x) => parseFloat(x)).filter((x) => !Number.isNaN(x));

function parseXml(text: string, file: string): Omit<SbsInfo, 'images'> {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const g = doc.querySelector('graph');
  const outputs = [...doc.querySelectorAll('graph > outputs > output')].map((o) => ({
    id: o.getAttribute('identifier') ?? '',
    label: o.querySelector('outputgui')?.getAttribute('label') ?? o.getAttribute('identifier') ?? '',
    usage: [...o.querySelectorAll('channel')].map((c) => c.getAttribute('names') ?? '').join(','),
  }));
  const inputs: SbsInput[] = [...doc.querySelectorAll('graph > inputs > input')].map((i) => {
    const gui = i.querySelector('inputgui');
    const sl = i.querySelector('guislider');
    return {
      id: i.getAttribute('identifier') ?? '',
      label: gui?.getAttribute('label') ?? i.getAttribute('identifier') ?? '',
      type: +(i.getAttribute('type') ?? 0),
      widget: gui?.getAttribute('widget') ?? '',
      def: num(i.getAttribute('default')),
      min: sl ? num(sl.getAttribute('min'))[0] : undefined,
      max: sl ? num(sl.getAttribute('max'))[0] : undefined,
    };
  }).filter((i) => !i.id.startsWith('$'));
  return {
    file,
    name: g?.getAttribute('label') || file.replace(/\.[^.]+$/, ''),
    description: (g?.getAttribute('description') ?? '').trim(),
    category: g?.getAttribute('category') ?? '',
    keywords: g?.getAttribute('keywords') ?? '',
    author: g?.getAttribute('author') ?? '',
    outputs, inputs,
  };
}

export async function readSbsar(bytes: Uint8Array, file: string): Promise<SbsInfo> {
  const entries = await unpack(bytes);
  const xml = entries.find((e) => /\.xml$/i.test(e.path));
  if (!xml) throw new Error(`${file} doesn't look like a Substance archive (no description inside).`);
  const info = parseXml(new TextDecoder().decode(xml.data), file);
  return { ...info, images: entries.filter((e) => IMG.test(e.path)) };
}

/** A smart material: every .sbsar / picture inside it. */
export async function readSpsm(bytes: Uint8Array, file: string): Promise<{ name: string; parts: SbsInfo[]; images: { path: string; data: Uint8Array }[]; names: string[] }> {
  let entries: { path: string; data: Uint8Array }[];
  try { entries = await unpack(bytes); } catch { entries = []; }
  if (!entries.length) throw new Error(`${file} couldn't be opened (it isn't a readable archive).`);
  const parts: SbsInfo[] = [];
  for (const e of entries.filter((x) => /\.sbsar$/i.test(x.path))) {
    try { parts.push(await readSbsar(e.data, e.path.split('/').pop()!)); } catch { /* skip */ }
  }
  // Layer / material names mentioned in any text descriptors (for naming the layers).
  const names: string[] = [];
  for (const e of entries.filter((x) => /\.(xml|json|txt|spsl|spt)$/i.test(x.path) && x.data.length < 4e6)) {
    const t = new TextDecoder().decode(e.data);
    for (const m of t.matchAll(/"(?:name|label)"\s*:\s*"([^"]{2,60})"/g)) names.push(m[1]);
  }
  return { name: file.replace(/\.[^.]+$/, ''), parts, images: entries.filter((x) => IMG.test(x.path)), names };
}

// ------------------------------------------------------------------ translation

const COLOR_WORDS: [RegExp, [number, number, number], number?, number?][] = [
  // [words, sRGB color, metal, rough]
  [/\blava|magma|volcan|molten/i, [0.07, 0.055, 0.05], 0, 0.85],
  [/\bgold/i, [1.0, 0.78, 0.34], 1, 0.3], [/\bcopper/i, [0.95, 0.64, 0.54], 1, 0.3], [/\bbrass/i, [0.89, 0.75, 0.42], 1, 0.35],
  [/\bsilver|chrome/i, [0.97, 0.96, 0.92], 1, 0.15], [/\balumin/i, [0.91, 0.92, 0.92], 1, 0.3],
  [/\brust/i, [0.42, 0.2, 0.1], 0, 0.85], [/\biron|steel|metal/i, [0.56, 0.57, 0.58], 1, 0.4],
  [/\bwood|oak|pine|plank|bark/i, [0.5, 0.33, 0.2], 0, 0.65], [/\bleather/i, [0.35, 0.2, 0.12], 0, 0.6],
  [/\bbrick/i, [0.55, 0.27, 0.2], 0, 0.85], [/\bmoss|grass|leaf|foliage/i, [0.3, 0.42, 0.15], 0, 0.85],
  [/\bsand|desert/i, [0.76, 0.66, 0.48], 0, 0.9], [/\bsoil|dirt|mud|ground/i, [0.38, 0.3, 0.22], 0, 0.9],
  [/\bconcrete|cement|asphalt|pavement|paving|stone|rock|granite|marble|tile/i, [0.55, 0.54, 0.52], 0, 0.8],
  [/\bsnow|ice/i, [0.9, 0.93, 0.96], 0, 0.5], [/\bfabric|cloth|cotton|linen|wool|denim/i, [0.55, 0.53, 0.5], 0, 0.9],
  [/\bplastic|rubber/i, [0.2, 0.2, 0.22], 0, 0.5], [/\bpaint/i, [0.7, 0.18, 0.14], 0, 0.45],
  [/\bred\b/i, [0.7, 0.1, 0.08]], [/\bblue\b/i, [0.12, 0.25, 0.7]], [/\bgreen\b/i, [0.15, 0.5, 0.2]],
  [/\bblack\b/i, [0.04, 0.04, 0.045]], [/\bwhite\b/i, [0.88, 0.88, 0.86]], [/\byellow\b/i, [0.85, 0.7, 0.1]],
];

/** Look (sRGB color, metal, rough) suggested by words in a material's name / category / keywords. */
export function guessLook(...texts: string[]): { color: [number, number, number]; metal?: number; rough?: number; word: string } | null {
  for (const t of texts) {
    const hit = COLOR_WORDS.find(([re]) => re.test(t));
    if (hit) return { color: [...hit[1]] as [number, number, number], metal: hit[2], rough: hit[3], word: (t.match(hit[0]) ?? [''])[0].trim() };
  }
  return null;
}

const SLOT_WORDS: [RegExp, Ch | 'gloss'][] = [
  [/base.?colou?r|albedo|diffuse|_col(or)?\b|_bc\b/i, 'color'], [/normal|_nrm\b|_nor\b/i, 'normal'],
  [/rough/i, 'rough'], [/gloss|smooth/i, 'gloss'], [/metal/i, 'metal'],
  [/height|disp|bump/i, 'height'], [/emiss|emit|glow/i, 'emit'],
];

const lin2s = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function translateSbs(info: SbsInfo): Translation {
  const values: ChannelValues = { color: [0.6, 0.6, 0.6], rough: 0.6, metal: 0, height: 0.5, emit: [0, 0, 0] };
  const enabled: Record<Ch, boolean> = { color: true, rough: true, metal: true, height: false, emit: false, normal: false };
  const read: string[] = [], guessed: string[] = [];
  // 1. hints from the name, then the category, then the keywords
  let text = '';
  let hit: (typeof COLOR_WORDS)[number] | undefined;
  for (const t of [`${info.name} ${info.file.replace(/_/g, ' ')}`, info.category.replace(/\//g, ' '), info.keywords]) {
    hit = COLOR_WORDS.find(([re]) => re.test(t));
    if (hit) { text = t; break; }
  }
  if (hit) {
    values.color = [...hit[1]] as [number, number, number];
    if (hit[2] !== undefined) values.metal = hit[2];
    if (hit[3] !== undefined) values.rough = hit[3];
    guessed.push(`look of “${(text.match(hit[0]) ?? [''])[0].trim()}” from the name/category`);
  }
  // 2. exposed parameters (more specific than the name)
  for (const i of info.inputs) {
    const l = `${i.label} ${i.id}`;
    if ((i.widget === 'color' || i.type === 2 || i.type === 3) && i.def.length >= 3 && /base|albedo|diffuse|colou?r|tint|main/i.test(l) && !/emis|edge|dirt|second|variation/i.test(l)) {
      values.color = [lin2s(i.def[0]), lin2s(i.def[1]), lin2s(i.def[2])].map((v) => Math.min(1, Math.max(0, v))) as [number, number, number];
      read.push(`color from “${i.label}”`);
    } else if (i.type === 0 && i.def.length) {
      const v = i.def[0];
      const norm = i.max !== undefined && i.min !== undefined && i.max > i.min ? (v - i.min) / (i.max - i.min) : v;
      if (/rough/i.test(l)) { values.rough = Math.min(1, Math.max(0, norm)); read.push(`roughness from “${i.label}”`); }
      else if (/gloss|smooth/i.test(l)) { values.rough = 1 - Math.min(1, Math.max(0, norm)); read.push(`roughness from “${i.label}” (inverted)`); }
      else if (/metal/i.test(l)) { values.metal = Math.min(1, Math.max(0, norm)); read.push(`metallic from “${i.label}”`); }
    }
  }
  // 3. pictures stored inside the file
  const maps: Partial<Record<Ch, File>> = {};
  let gloss: File | null = null;
  for (const im of info.images) {
    const base = im.path.split('/').pop()!;
    const slot = SLOT_WORDS.find(([re]) => re.test(base))?.[1];
    const f = new File([im.data as BlobPart], base, { type: /\.png$/i.test(base) ? 'image/png' : 'image/jpeg' });
    if (slot === 'gloss') { if (!maps.rough) gloss = f; continue; }
    if (slot && !maps[slot]) maps[slot] = f;
  }
  if (!maps.color && info.images.length === 1) maps.color = new File([info.images[0].data as BlobPart], info.images[0].path.split('/').pop()!);
  if (gloss && !maps.rough) { maps.rough = gloss; read.push('glossiness picture (used inverted)'); }
  const found = Object.keys(maps);
  if (found.length) read.push(`pictures inside the file: ${found.join(', ')}`);
  const exact = !!maps.color && found.length >= 2;
  const procedural = info.outputs.length ? `outputs ${info.outputs.map((o) => o.label).join(', ')}` : 'no outputs listed';
  const note = [
    `Translated from ${info.file}${info.author ? ' (' + info.author + ')' : ''}.`,
    exact
      ? 'Uses the texture pictures stored in the file.'
      : `Its pattern is a compiled Substance graph (${procedural}) that only Adobe's engine can run, so this is an approximation: a single material with the right look, not the pattern.`,
    read.length ? `Read: ${read.join('; ')}.` : '',
    guessed.length ? `Guessed: ${guessed.join('; ')}.` : '',
    info.inputs.length ? `Its sliders: ${info.inputs.slice(0, 12).map((i) => `${i.label} ${i.def.map((v) => +v.toFixed(2)).join(',')}`).join(' · ')}${info.inputs.length > 12 ? ' …' : ''}.` : '',
    info.description ? `Description: ${info.description.split('\n')[0].slice(0, 200)}` : '',
  ].filter(Boolean).join(' ');
  const emissive = info.outputs.some((o) => /emiss/i.test(o.id + o.usage));
  const glow: [number, number, number] | undefined = !exact && (emissive || /lava|magma|molten|ember|fire/i.test(text))
    ? (/neon|cyan|blue/i.test(text) ? [0.1, 0.8, 1] : /green|toxic|acid/i.test(text) ? [0.3, 1, 0.2] : [1, 0.38, 0.06])
    : undefined;
  return { glow, name: info.name, values, enabled, maps, normalDX: /directx|_dx\b/i.test(info.inputs.map((i) => i.id).join(' ')), note, exact };
}

// ================================================================== .spsm (smart material)
//
// A Substance Painter smart material is an HDF5 file holding the layer stack
// ("preset.bin": a tagged binary tree of DataLayerColor / DataLayerGroup /
// DataActionFill … objects) plus the .sbsar resources it uses (mask generators,
// grunges, materials). We read the tree and rebuild it with TexPaint layers:
// uniform channel values carry over exactly, generators become the matching
// TexPaint smart masks, and embedded materials go through readSbsar.

import * as hdf5 from 'jsfive';
import { GenSettings, GenType, defaultGen, painterStack } from './Masks';
import type { SpInput } from './PainterGen';
import type { BlendMode } from './TextureSet';

export type SpNode =
  | { kind: 'group'; name: string; visible: boolean; opacity: number; blend: BlendMode; mask?: SpMask; children: SpNode[] }
  | { kind: 'fill'; name: string; visible: boolean; opacity: number; blend: BlendMode; mask?: SpMask; values: ChannelValues; enabled: Record<Ch, boolean>; maps: Partial<Record<Ch, File>>; tri: boolean; glossInv: boolean; note: string };
export interface SpMask {
  base: 'white' | 'black'; gen: GenSettings | null;
  /** A grunge picture to use as the mask (from the file's previews), with levels. */
  image?: File; amount?: number; contrast?: number; invert?: boolean;
}

/**
 * Painter stores 512 px previews of every output of each resource (WEBP) in its
 * metadata, each after a UTF-16 string naming the output. Returns output → image bytes.
 */
export function outputPreviews(meta: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const dv = new DataView(meta.buffer, meta.byteOffset, meta.byteLength);
  let prev = 0;
  for (let i = 0; i + 12 < meta.length; i++) {
    if (meta[i] !== 0x52 || meta[i + 1] !== 0x49 || meta[i + 2] !== 0x46 || meta[i + 3] !== 0x46) continue; // RIFF
    if (meta[i + 8] !== 0x57 || meta[i + 9] !== 0x45 || meta[i + 10] !== 0x42 || meta[i + 11] !== 0x50) continue; // WEBP
    const n = dv.getUint32(i + 4, true);
    // last plausible UTF-16 (big endian, length-prefixed) string just before the image
    let label = '';
    for (let j = Math.max(prev, i - 600); j + 4 < i; j++) {
      const L = dv.getUint32(j, false);
      if (L < 2 || L > 120 || L % 2 || j + 4 + L > i) continue;
      let str = '', ok = true;
      for (let k = 0; k < L; k += 2) {
        const c = dv.getUint16(j + 4 + k, false);
        if (c < 32 || c > 126) { ok = false; break; }
        str += String.fromCharCode(c);
      }
      if (ok && /^[\w\-./ :#]+$/.test(str)) { label = str; j += 3 + L; }
    }
    if (label && !out.has(label.toLowerCase())) out.set(label.toLowerCase(), meta.slice(i, i + 8 + n));
    prev = i + 8 + n;
    i = prev - 1;
  }
  return out;
}

const OUT_SLOT: [RegExp, Ch | 'gloss'][] = [
  [/^basecolou?r$|^albedo$/, 'color'], [/^roughness$/, 'rough'], [/^glossiness$/, 'gloss'], [/^metallic$|^metalness$/, 'metal'],
  [/^height$|^displacement$/, 'height'], [/^normal$/, 'normal'], [/^emissive$|^emission$/, 'emit'],
];

/** A friendly error for a file (or part of one) that can't be read. */
function unreadable(file: string, e: unknown): Error {
  const m = String((e as any)?.message ?? e);
  if (e instanceof RangeError || /outside the bounds|out of range|offset/i.test(m))
    return new Error(`LocalPaint couldn't read ${file}. Part of it is stored in a way LocalPaint doesn't understand yet (often a paid or newer Substance material packed inside), or the file is incomplete.`);
  return e instanceof Error ? e : new Error(m);
}

/** Decode the tagged binary tree in preset.bin. */
function parsePreset(d: Uint8Array): any {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const td = new TextDecoder();
  let o = 0;
  const u8 = () => d[o++];
  const u16 = () => { const v = dv.getUint16(o, true); o += 2; return v; };
  const u32 = () => { const v = dv.getUint32(o, true); o += 4; return v; };
  const str = () => { const n = u32(); const s = td.decode(d.subarray(o, o + n)); o += n; return s; };
  const vec = (n: number, f: boolean) => { const a: number[] = []; for (let i = 0; i < n; i++) { a.push(f ? dv.getFloat32(o, true) : dv.getInt32(o, true)); o += 4; } return n === 1 ? a[0] : a; };
  const val = (t: number): any => {
    switch (t) {
      case 0x01: return vec(1, true);
      case 0x02: return vec(2, true);
      case 0x03: return vec(3, true);
      case 0x04: return vec(4, true);
      case 0x05: return vec(1, false);
      case 0x06: return vec(2, false);
      case 0x07: return vec(3, false);
      case 0x08: return vec(4, false);
      case 0x09: { const v = Number(dv.getBigInt64(o, true)); o += 8; return v; }
      case 0x0a: return u8() !== 0;
      case 0x0b: return u32();
      case 0x0c: { const v = Number(dv.getBigUint64(o, true)); o += 8; return v; }
      case 0x0f: return vec(2, false);
      case 0x10: return str();
      case 0x12: case 0x14: {
        if (u8() === 0xff) return null;
        const end = u32();
        const obj: any = { _class: str() };
        const n = u16();
        try {
          for (let i = 0; i < n; i++) { const k = str(); obj[k] = val(u8()); }
        } catch { /* unknown field type: skip to the end of this object */ }
        o = end;
        return obj;
      }
      case 0x11: case 0x13: {
        const end = u32(), n = u32();
        const arr: any[] = [];
        try { for (let i = 0; i < n; i++) arr.push(val(u8())); } catch { /* skip */ }
        o = end;
        return arr;
      }
      default: throw new Error('unknown type ' + t);
    }
  };
  if (d[0] !== 0xdd || d[1] !== 0x2f || d[2] !== 0x7c || d[3] !== 0x1b) throw new Error('not a Substance layer stack');
  o = 12;
  return val(u8());
}

// Substance channel bits (same in old and new files).
const CH_BIT: [number, Ch | 'gloss'][] = [[1, 'color'], [2, 'height'], [16, 'emit'], [128, 'rough'], [64, 'gloss'], [8192, 'metal']];
const SP_BLEND: Record<number, BlendMode> = { 2: 'normal', 4: 'multiply', 7: 'darken', 8: 'lighten', 9: 'add', 10: 'add', 14: 'overlay', 15: 'screen', 16: 'overlay' };

const bits = (v: number) => (v >>> 0);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const resName = (url: string) => (url.split('?')[0].split('/').filter(Boolean).pop() ?? url).toLowerCase();

/** Substance mask generator / grunge → the closest TexPaint smart mask. */
function genFrom(url: string, tw: Record<string, any>): GenSettings {
  const n = resName(url);
  const num = (...keys: string[]) => { for (const k of keys) if (typeof tw[k] === 'number') return tw[k] as number; return undefined; };
  const flag = (...keys: string[]) => keys.some((k) => tw[k] === 1 || tw[k] === true);
  let type: GenType = 'noise';
  let amount = num('Balance', 'balance', 'histogram_position', 'Level', 'level', 'global_balance');
  let contrast = num('Contrast', 'contrast', 'historgram_contrast', 'histogram_contrast', 'global_contrast');
  let noise: number | undefined;
  let invert = flag('invert', 'Invert', 'global_invert');
  if (/dirt/.test(n) && !/ground/.test(n)) {
    type = 'dirt'; amount = num('dirt_level', 'Level') ?? amount; contrast = num('dirt_contrast') ?? contrast; noise = num('grunge_amount', 'Grunge');
  } else if (/edge|wear|damage/.test(n)) {
    type = 'edge'; amount = num('wear_level', 'edge_level', 'damage_level', 'Level') ?? amount; contrast = num('wear_contrast', 'damage_contrast') ?? contrast; noise = num('grunge_amount', 'Grunge');
  } else if (/ground|gradient/.test(n)) {
    type = 'gradient';
  } else if (/dust|snow|top/.test(n)) {
    type = 'dust';
  } else if (/mask_builder/.test(n)) {
    const w: [GenType, number][] = [['ao', num('AO') ?? 0], ['edge', num('Curvature') ?? 0], ['gradient', num('Top_Down_Gradient') ?? 0], ['dust', num('World_Space_Normal') ?? 0], ['noise', (num('Grunge') ?? 0) + (num('Scratches') ?? 0)]];
    type = w.sort((a, b) => b[1] - a[1])[0][1] > 0 ? w[0][0] : 'noise';
    if (type === 'ao' && flag('AO_Invert')) invert = !invert;
    noise = num('Grunge');
  } else if (/mask_editor/.test(n)) {
    const w: [GenType, number][] = [['ao', num('ao') ?? 0], ['curvature', num('curv') ?? 0], ['dust', num('ws') ?? 0], ['gradient', num('Position_Gradient') ?? 0], ['noise', Math.max(num('tex') ?? 0, num('tex2') ?? 0)]];
    type = w.sort((a, b) => b[1] - a[1])[0][1] > 0 ? w[0][0] : 'noise';
    if (type === 'ao' && flag('invert_ao')) invert = !invert;
  } else if (/curv/.test(n)) type = 'curvature';
  else if (/ambient|occlusion|\bao\b/.test(n)) type = 'ao';
  else if (/thick/.test(n)) type = 'thick';
  const g = defaultGen(type);
  if (amount !== undefined) g.amount = clamp01(amount);
  if (contrast !== undefined) g.contrast = clamp01(0.3 + contrast * 0.7);
  if (noise !== undefined) g.noise = clamp01(noise);
  if (type === 'gradient' || type === 'dust') { g.axis = 'y'; g.flip = /ground/.test(n); }
  g.invert = invert;
  g.seed = typeof tw.$randomseed === 'number' && tw.$randomseed ? tw.$randomseed : g.seed;
  return g;
}

const tweaks = (p: any): Record<string, any> => Object.fromEntries((p?.tweaks ?? []).map((t: any) => [t.identifier, t.value]));

export async function translateSpsm(bytes: Uint8Array, file: string): Promise<{ root: SpNode; skipped: string[] }> {
  let h: any;
  try {
    h = new hdf5.File(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, file);
  } catch {
    throw new Error(`${file} isn't a smart material file Substance Painter 2018 or newer wrote.`);
  }
  const raw = (path: string): Uint8Array | null => {
    try { const v = h.get(path)?.value; return v ? Uint8Array.from(v as ArrayLike<number>) : null; } catch { return null; }
  };
  const pre = raw('preset.bin');
  if (!pre) throw new Error(`${file} has no layer stack inside.`);
  let tree: any;
  try { tree = parsePreset(pre); } catch (e) { throw unreadable(file, e); }
  const skipped: string[] = [];
  const sbsCache = new Map<string, Translation | null>();
  const material = async (url: string): Promise<Translation | null> => {
    const hash = (url.match(/version=([0-9a-f]+)\.sbsar/) ?? [])[1];
    if (!hash) return null;
    if (sbsCache.has(hash)) return sbsCache.get(hash)!;
    let tr: Translation | null = null;
    // Real maps: Painter's stored previews of the material's outputs (at its default settings).
    const pv = previews(hash);
    const hasMaps = [...pv.keys()].filter((k) => OUT_SLOT.some(([re]) => re.test(k))).length >= 2;
    if (hasMaps) {
      const nm = resName(url).replace(/_/g, ' ');
      tr = translateSbs({ file: resName(url) + '.sbsar', name: nm, description: '', category: '', keywords: '', author: '', outputs: [], inputs: [], images: [] });
    } else {
      const b = raw(`resources/${hash}.sbsar`);
      if (b) { try { tr = translateSbs(await readSbsar(b, resName(url) + '.sbsar')); } catch { tr = null; } }
    }
    if (tr && pv.size) {
      let got = 0;
      for (const [label, data] of pv) {
        const slot = OUT_SLOT.find(([re]) => re.test(label))?.[1];
        if (!slot) continue;
        const f = new File([data as BlobPart], `${resName(url)}_${label}.webp`, { type: 'image/webp' });
        if (slot === 'gloss') { if (!tr.maps.rough) { tr.maps.rough = f; tr.glossy = true; got++; } continue; }
        if (slot === 'rough' && tr.glossy) { tr.glossy = false; }
        tr.maps[slot] = f; got++;
      }
      if (got >= 2) tr.exact = true;
    }
    sbsCache.set(hash, tr);
    return tr;
  };
  const pvCache = new Map<string, Map<string, Uint8Array>>();
  const previews = (hash: string) => {
    if (!pvCache.has(hash)) { const m = raw(`resources/.alg_meta/${hash}.sbsar`); pvCache.set(hash, m ? outputPreviews(m) : new Map()); }
    return pvCache.get(hash)!;
  };
  const hashOf = (url: string) => (url.match(/version=([0-9a-f]+)\.sbsar/) ?? [])[1] ?? '';
  /** A grunge's own picture (its "output" preview). */
  const patternImage = (url: string): File | null => {
    const pv = previews(hashOf(url));
    const data = pv.get('output') ?? [...pv.entries()].find(([k]) => k !== '__default_preview__')?.[1];
    return data ? new File([data as BlobPart], `${resName(url)}.webp`, { type: 'image/webp' }) : null;
  };

  const blendOf = (it: any, used: number): { blend: BlendMode; opacity: number } => {
    const list: any[] = it.perChannelBlending ?? [];
    const pick = list.find((b) => bits(b.channelTypes) === 1 && used & 1) ?? list.find((b) => bits(b.channelTypes) & used) ?? list.find((b) => bits(b.channelTypes) === 1);
    if (!pick) return { blend: 'normal', opacity: 1 };
    let blend = SP_BLEND[pick.blendingMode] ?? 'normal';
    if (blend === 'add' && bits(pick.channelTypes) === 2) blend = 'offset';
    return { blend, opacity: clamp01(pick.opacity ?? 1) };
  };

  /** The fills of a Painter mask stack (bottom → top) with their generator / grunge, settings, blending and inputs. */
  const maskEffects = (actions: any[]) => {
    const out: { res: string; proj: number; blend: number; opacity: number; tw: Record<string, any>; inputs: Record<string, SpInput> }[] = [];
    for (const a of actions) {
      if (a?._class !== 'DataActionFill' || a.enabled === false) continue;
      const bl: any[] = (a.perChannelBlending ?? []).filter(Boolean);
      const mb = bl.find((b) => bits(b.channelTypes) === 2147483648) ?? bl[0];
      for (const src of a.sources ?? []) {
        const p = src?._class === 'DataSourceProcedural' ? src.procedural : null;
        if (!p?.urlToSbsRes) continue;
        const inputs: Record<string, SpInput> = {};
        for (const si of p.sourcesInputs ?? []) {
          const id = (si?.inputs ?? [])[0]?.identifier;
          const r = si?.source?.procedural?.urlToSbsRes;
          if (id && r) inputs[id] = { res: resName(r), tw: tweaks(si.source.procedural) };
        }
        out.push({ res: resName(p.urlToSbsRes), proj: a.projection ?? 0, blend: mb?.blendingMode ?? 2, opacity: clamp01(mb?.opacity ?? 1), tw: tweaks(p), inputs });
      }
    }
    return out;
  };

  const maskOf = (it: any, name: string): SpMask | undefined => {
    const items: any[] = it.maskActions?.items ?? [];
    const flat: any[] = [];
    const walk = (xs: any[]) => { for (const x of xs) { if (x?._class === 'DataActionGroup') walk(x.actions?.items ?? x.items ?? x.subStack?.items ?? []); else if (x) flat.push(x); } };
    walk(items);
    const base: 'white' | 'black' = it.maskInitial === 0 ? 'black' : 'white';
    if (flat.some((a) => /Paint/.test(a._class))) skipped.push(`hand-painted mask on “${name}”`);
    if (flat.some((a) => /Filter|Levels/.test(a._class))) skipped.push(`mask filter on “${name}”`);
    const effects = maskEffects(flat);
    if (effects.length) {
      // Painter's generators and grunges, rebuilt with LocalPaint's Painter-style generators (same settings).
      const g = painterStack(effects);
      if (g) return { base: 'black', gen: g };
    }
    if (base === 'black') return { base: 'black', gen: null };
    return undefined;
  };

  const fillOf = async (it: any): Promise<SpNode | null> => {
    const name: string = it.label ?? 'Layer';
    const values: ChannelValues = { color: [0.5, 0.5, 0.5], rough: 0.5, metal: 0, height: 0.5, emit: [0, 0, 0] };
    const enabled: Record<Ch, boolean> = { color: false, rough: false, metal: false, height: false, emit: false, normal: false };
    const maps: Partial<Record<Ch, File>> = {};
    let tri = false, used = 0, patterned = false, glossInv = false;
    const notes: string[] = [];
    const actions: any[] = [];
    const walk = (xs: any[]) => { for (const x of xs) { if (x?._class === 'DataActionGroup') walk(x.actions?.items ?? x.items ?? []); else if (x) actions.push(x); } };
    walk(it.actions?.items ?? []);
    for (const a of actions) {
      if (a._class !== 'DataActionFill' || a.enabled === false) { if (/Filter/.test(a._class)) skipped.push(`filter on “${name}”`); if (/Paint/.test(a._class)) skipped.push(`hand painting on “${name}”`); continue; }
      if (a.projection === 2) tri = true;
      for (const s of a.sources ?? []) {
        if (!s) continue;
        const ct = bits(s.channelTypes);
        if (s._class === 'DataSourceUniform' && Array.isArray(s.color)) {
          for (const [bit, ch] of CH_BIT) {
            if (ct !== bit) continue;
            used |= bit;
            const c = s.color as number[];
            if (ch === 'color' || ch === 'emit') { values[ch] = [lin2s(c[0]), lin2s(c[1]), lin2s(c[2])].map(clamp01) as [number, number, number]; enabled[ch] = true; }
            else if (ch === 'gloss') { if (!enabled.rough) { values.rough = clamp01(1 - c[0]); enabled.rough = true; } }
            else if (ch === 'height') { values.height = clamp01(0.5 + c[0] * 0.5); enabled.height = true; }
            else { values[ch] = clamp01(c[0]); enabled[ch] = true; }
          }
        } else if (s._class === 'DataSourceProcedural' && s.procedural) {
          const p = s.procedural;
          const outs: string[] = (p.outputs ?? []).map((x: any) => String(x.identifier).toLowerCase());
          if (outs.includes('basecolor') || outs.length >= 3) {
            // A whole material (e.g. "Granite Rock Mossy")
            const tr = await material(p.urlToSbsRes ?? '');
            if (tr) {
              values.color = tr.values.color; values.rough = tr.values.rough; values.metal = tr.values.metal;
              enabled.color = enabled.rough = enabled.metal = true;
              Object.assign(maps, tr.maps);
              if (tr.glossy) glossInv = true;
              notes.push(tr.exact ? `material “${resName(p.urlToSbsRes)}” (its textures)` : `material “${resName(p.urlToSbsRes)}” (approximated)`);
            }
            used |= 1;
          } else {
            // A grunge / pattern driving a channel: keep the channel, the pattern becomes a noise mask below.
            const img = patternImage(p.urlToSbsRes ?? '');
            let placed = false;
            for (const [bit, ch] of CH_BIT) {
              if (!(ct & bit)) continue;
              used |= bit;
              const c: Ch = ch === 'gloss' ? 'rough' : ch;
              // Gray channels take the grunge picture itself; color keeps its uniform color.
              if (img && c !== 'color' && c !== 'emit' && !maps[c]) { maps[c] = img; enabled[c] = true; placed = true; if (ch === 'gloss') glossInv = true; }
              else if (c !== 'color' || !enabled.color) enabled[c] = true;
            }
            if (!placed) patterned = true;
            notes.push(`pattern “${resName(p.urlToSbsRes ?? '')}”${placed ? ' (its picture)' : ' (shown as grunge)'}`);
          }
        }
      }
    }
    if (!Object.values(enabled).some(Boolean)) { if (actions.length) skipped.push(`“${name}” (nothing LocalPaint can show)`); return null; }
    const { blend, opacity } = blendOf(it, used || 1);
    let mask = maskOf(it, name);
    if (patterned && !mask) { const g = defaultGen('noise'); g.amount = 0.5; g.contrast = 0.5; mask = { base: 'black', gen: g }; }
    return {
      kind: 'fill', name, visible: it.enabled !== false, opacity, blend, mask, values, enabled, maps, tri, glossInv,
      note: `From ${file}: layer “${name}”${notes.length ? ' — ' + notes.join(', ') : ''}. Uniform colors and values are exact; materials and grunges use the previews stored in the file; mask generators become LocalPaint smart masks.`,
    };
  };

  // One layer LocalPaint can't read (a paid or newer Substance material packed in a way it doesn't know, a damaged
  // part of the file…) is skipped and listed instead of stopping the whole import.
  const nodeOf = async (it: any): Promise<SpNode | null> => {
    try { return await nodeOf1(it); } catch {
      skipped.push(`layer “${it?.label ?? '?'}” (LocalPaint couldn't read it: it may use a paid or newer Substance material)`);
      return null;
    }
  };
  const nodeOf1 = async (it: any): Promise<SpNode | null> => {
    if (!it) return null;
    if (it._class === 'DataLayerGroup') {
      const children: SpNode[] = [];
      for (const c of it.subStack?.items ?? []) { const n = await nodeOf(c); if (n) children.push(n); }
      const { blend, opacity } = blendOf(it, 1);
      return { kind: 'group', name: it.label ?? 'Folder', visible: it.enabled !== false, opacity, blend, mask: maskOf(it, it.label ?? 'Folder'), children };
    }
    if (it._class === 'DataLayerColor' || it._class === 'DataLayerFill') return fillOf(it);
    skipped.push(`${String(it._class).replace(/^DataLayer/, '').toLowerCase() || 'unknown'} layer “${it.label ?? '?'}”`);
    return null;
  };

  const root = await nodeOf(tree.layerGroup);
  if (!root) throw new Error(`${file}: no layers LocalPaint can use.`);
  if (root.kind === 'group' && (!root.name || root.name === 'Folder')) root.name = file.replace(/\.[^.]+$/, '');
  return { root, skipped };
}

/** A Painter smart mask (.spmsk): its mask stack as LocalPaint mask settings. */
export async function translateSpmsk(bytes: Uint8Array, file: string): Promise<{ name: string; gen: GenSettings; skipped: string[] }> {
  let h: any;
  try {
    h = new hdf5.File(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, file);
  } catch {
    throw new Error(`${file} isn't a smart mask file Substance Painter 2018 or newer wrote.`);
  }
  let pre: Uint8Array | null = null;
  try { const v = h.get('preset.bin')?.value; pre = v ? Uint8Array.from(v as ArrayLike<number>) : null; } catch { pre = null; }
  if (!pre) throw new Error(`${file} has no mask inside.`);
  const tree = parsePreset(pre);
  const fills: any[] = [];
  const skipped: string[] = [];
  const walk = (n: any) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!n || typeof n !== 'object') return;
    if (n._class === 'DataActionFill') { fills.push(n); return; }
    if (/Filter|Levels/.test(n._class ?? '')) skipped.push('a mask filter');
    if (/Paint/.test(n._class ?? '')) skipped.push('hand-painted strokes');
    for (const v of Object.values(n)) if (v && typeof v === 'object') walk(v);
  };
  walk(tree);
  const effects: { res: string; proj: number; blend: number; opacity: number; tw: Record<string, any>; inputs: Record<string, SpInput> }[] = [];
  for (const a of fills) {
    const bl: any[] = (a.perChannelBlending ?? []).filter(Boolean);
    const mb = bl.find((b) => bits(b.channelTypes) === 2147483648) ?? bl[0];
    for (const src of a.sources ?? []) {
      const p = src?._class === 'DataSourceProcedural' ? src.procedural : null;
      if (!p?.urlToSbsRes) continue;
      const inputs: Record<string, SpInput> = {};
      for (const si of p.sourcesInputs ?? []) {
        const id = (si?.inputs ?? [])[0]?.identifier;
        const r = si?.source?.procedural?.urlToSbsRes;
        if (id && r) inputs[id] = { res: resName(r), tw: tweaks(si.source.procedural) };
      }
      effects.push({ res: resName(p.urlToSbsRes), proj: a.projection ?? 0, blend: mb?.blendingMode ?? 2, opacity: clamp01(mb?.opacity ?? 1), tw: tweaks(p), inputs });
    }
  }
  const gen = painterStack(effects);
  if (!gen) throw new Error(`${file} has no generators or grunges LocalPaint can rebuild.`);
  return { name: file.replace(/\.spmsk$/i, '').replace(/^.*[\\/]/, ''), gen, skipped: [...new Set(skipped)] };
}
