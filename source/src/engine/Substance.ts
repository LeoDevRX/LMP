/**
 * Substance material mode: the full description of an .sbsar (every graph, parameter,
 * group, preset, image input and output), the per-layer state, and helpers to drive
 * a renderer with it.
 *
 * Rendering itself happens in one of three places (see main.ts):
 *  - Adobe's engine (sbsrender from Substance 3D Designer / Automation Toolkit), when it's
 *    installed on this PC: the real graph runs with the chosen values, so it looks exact.
 *  - LocalPaint's own version of the graph (SbsNative.ts) for graphs LocalPaint knows.
 *  - A live approximation built from the parameter names, for everything else.
 */
import type { Ch } from './TextureSet';
import { unpack } from './SubstanceReader';

export type SbsWidget = 'slider' | 'color' | 'angle' | 'toggle' | 'combo' | 'image' | 'position' | 'text' | 'other';

export interface SbsParam {
  id: string;
  label: string;
  group: string;
  /** 0 float, 1 float2, 2 float3, 3 float4, 4 int, 5 image, 6 string, 8 int2, 9 int3, 10 int4 */
  type: number;
  widget: SbsWidget;
  def: number[];
  min?: number[]; max?: number[]; step?: number;
  /** guibutton labels (Off / On) or combobox items. */
  labels?: [string, string];
  items?: { value: number; label: string }[];
  /** Painter's visibility rule, e.g. `input.UseGradient == true`. */
  visibleIf?: string;
  /** Image inputs: grayscale or color. */
  gray?: boolean;
  description?: string;
}
export interface SbsOutput { id: string; label: string; usage: string; group: string }
export interface SbsPreset { label: string; values: Record<string, number[]> }
export interface SbsGraph {
  url: string; label: string; description: string; category: string; author: string;
  params: SbsParam[]; presets: SbsPreset[]; outputs: SbsOutput[];
  /** Hidden system inputs ($normalformat, $outputsize …) the graph has. */
  system: string[];
}
export interface SbsPackage { file: string; graphs: SbsGraph[]; icon?: Uint8Array }

/** What one image input is fed with. */
export type SbsFeed = 'ao' | 'curv' | 'wsn' | 'pos' | 'normal' | 'id' | 'thick' | 'height' | 'none';
export const FEED_LABEL: Record<SbsFeed, string> = {
  ao: 'Ambient occlusion', curv: 'Curvature', wsn: 'World space normals', pos: 'Position', normal: 'Normal',
  id: 'ID', thick: 'Thickness', height: 'Height', none: 'Nothing',
};

/** A fill layer in Substance material mode. */
export interface SbsState {
  /** Key of the .sbsar bytes in SBS_FILES (content hash). */
  key: string;
  file: string;
  graph: string;
  values: Record<string, number[]>;
  seed: number;
  /** Output size as a power of two (8 = 256 … 12 = 4096). */
  res: number;
  feeds: Record<string, SbsFeed>;
  /** Which output feeds which channel (output id → channel, or '' = unused). */
  map: Record<string, Ch | ''>;
  /** Last preset applied (for the Preset menu). */
  preset?: string;
}

/** Layers opened from a file with their rendered images: the state those images show. */
export const SBS_LOADED = new WeakMap<object, string>();

/** The .sbsar files used by layers in this session, by content hash. */
export const SBS_FILES = new Map<string, { bytes: Uint8Array; pkg: SbsPackage }>();

export function hashBytes(b: Uint8Array): string {
  let a = 0x811c9dc5, c = 0x9e3779b9;
  const step = b.length > 4e6 ? 3 : 1;
  for (let i = 0; i < b.length; i += step) { a = Math.imul(a ^ b[i], 0x01000193); c = Math.imul(c ^ b[i], 0x85ebca6b) ^ (c >>> 13); }
  return (a >>> 0).toString(36) + (c >>> 0).toString(36) + b.length.toString(36);
}

const nums = (s: string | null | undefined) => (s ?? '').split(',').map((x) => parseFloat(x)).filter((x) => !Number.isNaN(x));

function widgetOf(type: number, gui: Element | null): SbsWidget {
  if (type === 5) return 'image';
  if (type === 6) return 'text';
  const w = (gui?.getAttribute('widget') ?? '').toLowerCase();
  if (w === 'color' || gui?.querySelector('guicolor')) return 'color';
  if (w === 'angle' || gui?.querySelector('guiangle')) return 'angle';
  if (w === 'togglebutton' || gui?.querySelector('guibutton')) return 'toggle';
  if (w === 'combobox' || gui?.querySelector('guicombobox')) return 'combo';
  if (w === 'position' || gui?.querySelector('guiposition')) return 'position';
  if (w === 'slider' || gui?.querySelector('guislider')) return 'slider';
  if (type === 2 || type === 3) return 'color';
  return type === 0 || type === 1 || type === 4 || type >= 8 ? 'slider' : 'other';
}

/** Read every graph described in an .sbsar's XML. */
export function parseSbsXml(text: string, file: string): SbsGraph[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const out: SbsGraph[] = [];
  for (const g of doc.querySelectorAll('graph')) {
    const params: SbsParam[] = [];
    const system: string[] = [];
    for (const i of g.querySelectorAll(':scope > inputs > input')) {
      const id = i.getAttribute('identifier') ?? '';
      if (!id) continue;
      if (id.startsWith('$')) { system.push(id); continue; }
      const type = +(i.getAttribute('type') ?? 0);
      const gui = i.querySelector('inputgui');
      if (gui && gui.getAttribute('showasparam') === 'no') continue;
      const widget = widgetOf(type, gui);
      const p: SbsParam = {
        id, type, widget,
        label: gui?.getAttribute('label') || id.replace(/_/g, ' '),
        group: gui?.getAttribute('group') ?? '',
        def: nums(i.getAttribute('default')),
        visibleIf: gui?.getAttribute('visibleif') || undefined,
        description: gui?.getAttribute('description') || undefined,
      };
      const sl = gui?.querySelector('guislider, guiangle');
      if (sl) {
        if (sl.getAttribute('min') != null) p.min = nums(sl.getAttribute('min'));
        if (sl.getAttribute('max') != null) p.max = nums(sl.getAttribute('max'));
        if (sl.getAttribute('step') != null) p.step = nums(sl.getAttribute('step'))[0];
      }
      const bt = gui?.querySelector('guibutton');
      if (bt) p.labels = [bt.getAttribute('label0') || 'Off', bt.getAttribute('label1') || 'On'];
      const cb = gui?.querySelectorAll('guicombobox > guicomboboxitem');
      if (cb && cb.length) p.items = [...cb].map((c) => ({ value: +(c.getAttribute('value') ?? 0), label: c.getAttribute('text') ?? c.getAttribute('value') ?? '' }));
      const im = gui?.querySelector('guiimage');
      if (im) p.gray = im.getAttribute('colortype') === 'grayscale';
      if (!p.def.length && type !== 5 && type !== 6) p.def = [0];
      params.push(p);
    }
    const outputs: SbsOutput[] = [...g.querySelectorAll(':scope > outputs > output')].map((o) => {
      const gui = o.querySelector('outputgui');
      const usage = [...o.querySelectorAll('channel')].map((c) => c.getAttribute('names') ?? '')
        .concat([...o.querySelectorAll('usage')].map((u) => u.getAttribute('name') ?? '')).filter(Boolean).join(',');
      return { id: o.getAttribute('identifier') ?? '', label: gui?.getAttribute('label') ?? o.getAttribute('identifier') ?? '', usage, group: gui?.getAttribute('group') ?? '' };
    });
    const presets: SbsPreset[] = [...g.querySelectorAll('sbspresets > sbspreset')].map((p) => {
      const values: Record<string, number[]> = {};
      for (const pi of p.querySelectorAll('presetinput')) values[pi.getAttribute('identifier') ?? ''] = nums(pi.getAttribute('value'));
      return { label: p.getAttribute('label') ?? 'Preset', values };
    });
    out.push({
      url: g.getAttribute('pkgurl') ?? '', label: g.getAttribute('label') || file.replace(/\.[^.]+$/, ''),
      description: (g.getAttribute('description') ?? '').trim(), category: g.getAttribute('category') ?? '',
      author: g.getAttribute('author') ?? '', params, presets, outputs, system,
    });
  }
  return out;
}

export async function readSbsPackage(bytes: Uint8Array, file: string): Promise<SbsPackage> {
  const entries = await unpack(bytes);
  const xml = entries.find((e) => /\.xml$/i.test(e.path));
  if (!xml) throw new Error(`${file} doesn't look like a Substance material (no description inside).`);
  const graphs = parseSbsXml(new TextDecoder().decode(xml.data), file);
  if (!graphs.length) throw new Error(`${file} has no material graph in it.`);
  const icon = entries.find((e) => /icon[^/]*\.png$/i.test(e.path))?.data ?? entries.find((e) => /\.png$/i.test(e.path))?.data;
  return { file, graphs, icon };
}

/** Load (or reuse) a package and remember its bytes for saving. */
export async function registerSbs(bytes: Uint8Array, file: string): Promise<{ key: string; pkg: SbsPackage }> {
  const key = hashBytes(bytes);
  const have = SBS_FILES.get(key);
  if (have) return { key, pkg: have.pkg };
  const pkg = await readSbsPackage(bytes, file);
  SBS_FILES.set(key, { bytes, pkg });
  return { key, pkg };
}

// ------------------------------------------------------------------ outputs → channels

export function channelOf(o: SbsOutput): Ch | '' {
  const s = `${o.usage} ${o.id} ${o.label}`.toLowerCase();
  if (/ambient|occlusion|\bao\b|opacity|alpha|specular(?!.*level)|mask|transmi|scatter|anisotropy|sheen|coat/.test(s) && !/basecolor|base_color|diffuse/.test(s)) return '';
  if (/basecolou?r|base_colou?r|albedo|diffuse|\bcolou?r\b/.test(s)) return 'color';
  if (/normal/.test(s)) return 'normal';
  if (/rough|gloss/.test(s)) return 'rough';
  if (/metal/.test(s)) return 'metal';
  if (/height|displac|bump/.test(s)) return 'height';
  if (/emiss|emit|glow/.test(s)) return 'emit';
  return '';
}
export const isGlossy = (o: SbsOutput) => /gloss/i.test(`${o.usage} ${o.id}`) && !/rough/i.test(`${o.usage} ${o.id}`);

/** Mesh map an image input wants (Painter fills these automatically from the baked maps). */
export function feedOf(p: SbsParam): SbsFeed {
  const s = `${p.id} ${p.label}`.toLowerCase();
  if (/ambient|occlusion|\bao\b/.test(s)) return 'ao';
  if (/curv/.test(s)) return 'curv';
  if (/world.?space.?normal|normal.?world|\bwsn\b|normal_ws|ws_normal/.test(s)) return 'wsn';
  if (/position|\bpos\b/.test(s)) return 'pos';
  if (/thick/.test(s)) return 'thick';
  if (/\bid\b|_id\b|^id|color.?id|material.?id/.test(s)) return 'id';
  if (/normal/.test(s)) return 'normal';
  if (/height/.test(s)) return 'height';
  return 'none';
}

export function newSbsState(key: string, pkg: SbsPackage, g: SbsGraph, size: number): SbsState {
  const values: Record<string, number[]> = {};
  for (const p of g.params) if (p.type !== 5 && p.type !== 6) values[p.id] = [...p.def];
  const feeds: Record<string, SbsFeed> = {};
  for (const p of g.params) if (p.type === 5) feeds[p.id] = feedOf(p);
  const map: Record<string, Ch | ''> = {};
  const used = new Set<Ch>();
  for (const o of g.outputs) { const c = channelOf(o); map[o.id] = c && !used.has(c) ? c : ''; if (c) used.add(c); }
  return { key, file: pkg.file, graph: g.url, values, seed: 0, res: Math.max(8, Math.min(11, Math.round(Math.log2(size)))), feeds, map };
}

export function graphOf(st: SbsState): SbsGraph | null {
  const pkg = SBS_FILES.get(st.key)?.pkg;
  return pkg?.graphs.find((g) => g.url === st.graph) ?? pkg?.graphs[0] ?? null;
}

/** Identifies one rendered result (values + inputs). */
export function stateKey(st: SbsState, meshVersion = 0): string {
  return JSON.stringify([st.key, st.graph, st.values, st.seed, st.res, st.feeds, meshVersion]);
}

// ------------------------------------------------------------------ visibility rules

/**
 * Evaluate a Painter `visibleif` rule against the current values.
 * Supports input.X (and .x/.y/.z/.w), numbers, true/false, ! && || == != < > <= >= + - * / and ( ).
 * Anything it can't read counts as visible.
 */
export function visible(rule: string | undefined, values: Record<string, number[]>): boolean {
  if (!rule || !rule.trim() || rule.trim() === '1' || rule.trim() === 'true') return true;
  if (rule.trim() === '0' || rule.trim() === 'false') return false;
  try {
    const toks = rule.match(/input\.[A-Za-z_$][\w$]*(?:\.[xyzw])?|\d+\.?\d*(?:e[-+]?\d+)?|\.\d+|true|false|&&|\|\||==|!=|<=|>=|[-+*/!<>()]/g) ?? [];
    let i = 0;
    const peek = () => toks[i];
    const take = () => toks[i++];
    const prim = (): number => {
      const t = take();
      if (t === undefined) throw new Error('end');
      if (t === '(') { const v = or(); if (take() !== ')') throw new Error(')'); return v; }
      if (t === '!') return prim() ? 0 : 1;
      if (t === '-') return -prim();
      if (t === 'true') return 1;
      if (t === 'false') return 0;
      if (t.startsWith('input.')) {
        const [, name, comp] = t.split('.');
        const v = values[name];
        if (!v) throw new Error('unknown ' + name);
        return v['xyzw'.indexOf(comp ?? 'x')] ?? v[0] ?? 0;
      }
      const n = parseFloat(t);
      if (Number.isNaN(n)) throw new Error('bad ' + t);
      return n;
    };
    const mul = (): number => { let v = prim(); while (peek() === '*' || peek() === '/') { const o = take(); const r = prim(); v = o === '*' ? v * r : v / r; } return v; };
    const add = (): number => { let v = mul(); while (peek() === '+' || peek() === '-') { const o = take(); const r = mul(); v = o === '+' ? v + r : v - r; } return v; };
    const cmp = (): number => {
      let v = add();
      while (['==', '!=', '<', '>', '<=', '>='].includes(peek() ?? '')) {
        const o = take(); const r = add();
        v = +(o === '==' ? Math.abs(v - r) < 1e-6 : o === '!=' ? Math.abs(v - r) >= 1e-6 : o === '<' ? v < r : o === '>' ? v > r : o === '<=' ? v <= r : v >= r);
      }
      return v;
    };
    const and = (): number => { let v = cmp(); while (peek() === '&&') { take(); const r = cmp(); v = +(!!v && !!r); } return v; };
    const or = (): number => { let v = and(); while (peek() === '||') { take(); const r = and(); v = +(!!v || !!r); } return v; };
    const v = or();
    return !!v;
  } catch { return true; }
}

/** Command-line value for sbsrender (`id@v1,v2`). */
export function cliValue(p: SbsParam | undefined, v: number[]): string {
  const ints = p ? p.type === 4 || p.type >= 8 : v.every((x) => Number.isInteger(x));
  return v.map((x) => (ints ? String(Math.round(x)) : String(+x.toFixed(6)))).join(',');
}

// ------------------------------------------------------------------ live approximation

/** Roles a parameter can play in LocalPaint's approximation of an unknown graph. */
export interface ApproxRoles {
  base?: string; second?: string; edge?: string; dirt?: string; emit?: string;
  rough?: string; gloss?: string; metal?: string; scale?: string; edgeAmt?: string; dirtAmt?: string; bump?: string; varAmt?: string;
  hue?: string; sat?: string; lum?: string; glowAmt?: string; contrast?: string;
}
export function approxRoles(g: SbsGraph): ApproxRoles {
  const r: ApproxRoles = {};
  const col = g.params.filter((p) => p.widget === 'color' && p.def.length >= 3);
  const sl = g.params.filter((p) => (p.widget === 'slider' || p.widget === 'angle' || (p.widget === 'color' && p.type === 0)) && (p.type === 0 || p.type === 4) && !p.labels);
  const t = (p: SbsParam) => `${p.id} ${p.label} ${p.group}`;
  const pick = (list: SbsParam[], re: RegExp, not?: RegExp) => list.find((p) => re.test(t(p)) && !(not && not.test(t(p))))?.id;
  r.emit = pick(col, /emis|glow|emit/i);
  r.edge = pick(col, /edge|wear|curv|highlight|chip|scratch/i, /emis/i);
  r.dirt = pick(col, /dirt|grime|dust|cavity|\bao\b|occlusion|shadow|rust|stain/i, /emis/i);
  r.second = pick(col, /second|variation|dark|tint\s*2|color\s*2|_2\b/i, /emis|edge|dirt/i);
  r.base = pick(col, /base|albedo|diffuse|main|colou?r|tint/i, /emis|edge|wear|dirt|grime|second|variation|shadow|ao\b|occlusion|specular|highlight|light/i)
    ?? col.find((p) => ![r.emit, r.edge, r.dirt, r.second].includes(p.id))?.id;
  r.rough = pick(sl, /rough/i);
  r.gloss = r.rough ? undefined : pick(sl, /gloss|smooth/i);
  r.metal = pick(sl, /metal/i);
  r.scale = pick(sl, /scale|tiling|tile|size|freq|density/i);
  r.hue = pick(sl, /\bhue/i, /panel/i) ?? pick(sl, /\bhue/i);
  r.sat = pick(sl, /sat(u|ur)?a?r?a?t?i?o?n?\b|\bsat/i, /panel/i) ?? pick(sl, /satu|\bsat/i);
  r.lum = pick(sl, /lumin|bright|lightness|value\b/i, /light.?(opac|col)/i);
  r.contrast = pick(sl, /contrast/i);
  r.edgeAmt = pick(sl, /edge|wear|curv|chip|scratch/i);
  r.dirtAmt = pick(sl, /dirt|grime|dust|cavity|\bao\b|occlusion|rust|stain|\bage\b|aging|weather/i);
  r.bump = pick(sl, /height|bump|depth|relief|emboss|normal.?int/i, /surface|size|smooth/i);
  r.varAmt = pick(sl, /variation|noise|random/i);
  r.glowAmt = pick(sl, /heat|glow|emis|light.?opac|light.?int|temperature/i);
  if (r.scale && r.scale === r.bump) r.bump = undefined;
  return r;
}

export function norm01(p: SbsParam | undefined, v: number | undefined, fallback: number): number {
  if (!p || v === undefined) return fallback;
  const lo = p.min?.[0] ?? 0, hi = p.max?.[0] ?? 1;
  return hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : Math.min(1, Math.max(0, v));
}
