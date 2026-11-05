import type { BrushPreset } from '../brushes';
import type { FillTransform, FillAdjust } from './TextureSet';

/** .tptex: an image material in one file (maps embedded as base64 PNG/JPG). */
export interface TexMaterialFile {
  format: 'texpaint-texmat';
  version: 1;
  name: string;
  normalDX?: boolean;
  tiling?: number;
  xf?: FillTransform;
  adj?: FillAdjust;
  maps: Partial<Record<string, { name: string; data: string }>>;
}
import { CHANNELS, Ch, ChannelValues } from './TextureSet';
import type { SmartMaterial } from './Project';

/** TexPaint material preset (.tpmat): plain JSON, easy to share and edit. */
export interface MaterialPreset {
  format: 'texpaint-material';
  version: 1;
  name: string;
  values: ChannelValues;
  enabled: Record<Ch, boolean>;
}

export type MapSlot = Ch | 'ao';

export type ShelfItem =
  | { kind: 'material'; name: string; file: string; preset: MaterialPreset }
  | { kind: 'textures'; name: string; files: Partial<Record<MapSlot, File>>; thumb?: string; normalDX?: boolean; file?: string; tiling?: number; xf?: FillTransform; adj?: FillAdjust }
  | { kind: 'smart'; name: string; file: string; smart: SmartMaterial; category?: string; swatch?: { color: [number, number, number]; rough: number; metal: number } }
  | { kind: 'mask'; name: string; file: string; preset: string }
  | { kind: 'env'; name: string; file: string; src: () => Promise<File> }
  | { kind: 'model'; name: string; file: string; model: string }
  | { kind: 'graph'; name: string; file: string; graph: any }
  | { kind: 'unsupported'; name: string; file: string; reason: string; src?: () => Promise<File> }
  | { kind: 'brush'; name: string; file: string; brush: BrushPreset; tipFile?: File }
  /** A CC0 scanned material from LMP's materials release; downloaded the first time it's used. */
  | { kind: 'cloud'; name: string; file: string; cat: string; thumb: string; size: number; tags: string[]; maps: string[]; downloaded?: boolean; source?: string };

const ADOBE: Record<string, string> = {
  sbsar: 'Substance material (.sbsar)',
  spsm: 'Substance smart material (.spsm)',
  spmsk: 'Substance smart mask (.spmsk)',
  sppr: 'Substance preset (.sppr)',
  spp: 'Substance Painter project (.spp)',
  sbs: 'Substance Designer graph (.sbs)',
  spexp: 'Substance export preset (.spexp)',
  spbrs: 'Substance brush (.spbrs)',
};
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp'];

// Common texture-set suffixes (Substance, Roblox, Poly Haven, ambientCG, Quixel…)
const SLOT_NAMES: Record<MapSlot, string[]> = {
  color: ['basecolor', 'basecolour', 'albedo', 'diffuse', 'diff', 'col', 'color', 'colour', 'colormap', 'basecolormap', 'albedomap'],
  rough: ['rough', 'roughness', 'roughnessmap'],
  metal: ['metal', 'metallic', 'metalness', 'metalnessmap', 'metallicmap'],
  height: ['height', 'heightmap', 'displacement', 'disp', 'bump'],
  emit: ['emissive', 'emission', 'emit', 'glow', 'emissivemask', 'emissivemap'],
  normal: ['normal', 'normalmap', 'nrm', 'nor', 'normalgl', 'normaldx', 'normalopengl', 'normaldirectx', 'norgl', 'nordx'],
  ao: ['ao', 'ambientocclusion', 'occlusion', 'mixedao'],
};

const DX_NAMES = ['normaldx', 'normaldirectx', 'nordx'];

/** "Rusty Metal_Roughness" → { set: "Rusty Metal", slot: rough }. Keeps the set name as written. */
export function splitMapName(base: string): { set: string; slot: MapSlot; dx: boolean } | null {
  const re = /[_\-. ]+/g;
  const seps: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(base))) seps.push(m.index);
  const parts = base.split(/[_\-. ]+/).filter(Boolean);
  for (let k = Math.min(3, parts.length - 1); k >= 1; k--) {
    const suffix = parts.slice(-k).join('').toLowerCase();
    for (const [slot, names] of Object.entries(SLOT_NAMES) as [MapSlot, string[]][]) {
      if (!names.includes(suffix)) continue;
      const cut = seps[seps.length - k];
      const set = (cut !== undefined ? base.slice(0, cut) : parts.slice(0, -k).join(' ')).replace(/[_\-. ]+$/, '');
      return { set, slot, dx: DX_NAMES.includes(suffix) };
    }
  }
  return null;
}

export function presetSwatchCSS(p: MaterialPreset): string {
  const c = p.values.color.map((v) => Math.round(v * 255)).join(',');
  const shine = p.values.metal > 0.5
    ? `radial-gradient(circle at 32% 28%, rgba(255,255,255,${0.9 - p.values.rough * 0.7}) 0, transparent ${30 + p.values.rough * 40}%), `
    : `radial-gradient(circle at 32% 28%, rgba(255,255,255,${0.45 - p.values.rough * 0.4}) 0, transparent 35%), `;
  return `${shine}radial-gradient(circle at 50% 55%, rgb(${c}) 30%, rgba(0,0,0,.55) 100%)`;
}

/** Turn a list of files into shelf items. */
export async function scanFiles(files: { name: string; file: () => Promise<File>; dir?: string }[]): Promise<ShelfItem[]> {
  const materials: ShelfItem[] = [];
  const brushes: ShelfItem[] = [];
  const envs: ShelfItem[] = [];
  const graphs: ShelfItem[] = [];
  const texmats: ShelfItem[] = [];
  const unsupported: ShelfItem[] = [];
  const smart: ShelfItem[] = [];
  const sets = new Map<string, { name: string; files: Partial<Record<MapSlot, File>>; normalDX: boolean }>();
  for (const f of files) {
    const ext = f.name.split('.').pop()!.toLowerCase();
    const base = f.name.replace(/\.[^.]+$/, '');
    if (ext === 'tpmat') {
      try {
        const preset = JSON.parse(await (await f.file()).text()) as MaterialPreset;
        if (preset.format !== 'texpaint-material') continue;
        preset.values = { color: [0.5, 0.5, 0.5], rough: 0.5, metal: 0, height: 0.5, emit: [0, 0, 0], ...(preset.values as Partial<ChannelValues>) };
        preset.enabled = { color: true, rough: true, metal: true, height: false, emit: false, normal: false, ...(preset.enabled as Partial<Record<Ch, boolean>>) };
        materials.push({ kind: 'material', name: preset.name || base, file: f.name, preset });
      } catch { /* skip broken files */ }
    } else if (ext === 'tpsmart') {
      try {
        const sm = JSON.parse(await (await f.file()).text()) as SmartMaterial;
        if (sm.format !== 'texpaint-smart' || !Array.isArray(sm.layers)) continue;
        smart.push({ kind: 'smart', name: sm.name || base, file: f.name, smart: sm });
      } catch { /* skip broken files */ }
    } else if (ext === 'tptex') {
      // One-file image material: every map embedded (made by the Substance bridge, or Save material in TexPaint).
      try {
        const t = JSON.parse(await (await f.file()).text()) as TexMaterialFile;
        if (t.format !== 'texpaint-texmat' || !t.maps) continue;
        const files: Partial<Record<MapSlot, File>> = {};
        for (const [k, m] of Object.entries(t.maps) as [MapSlot, { name: string; data: string }][]) {
          const bin = atob(m.data);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          files[k] = new File([bytes], m.name || `${base}_${k}.png`, { type: 'image/png' });
        }
        const thumbFile = files.color ?? files.rough ?? files.height ?? files.normal;
        texmats.push({
          kind: 'textures', name: t.name || base, files, normalDX: !!t.normalDX, file: f.name,
          thumb: thumbFile ? URL.createObjectURL(thumbFile) : undefined, tiling: t.tiling, xf: t.xf, adj: t.adj,
        });
      } catch { /* skip broken files */ }
    } else if (ext === 'tpbrush') {
      try {
        const b = JSON.parse(await (await f.file()).text()) as BrushPreset;
        if (b.format !== 'texpaint-brush') continue;
        b.settings = b.settings ?? {};
        brushes.push({ kind: 'brush', name: b.name || base, file: f.name, brush: b });
      } catch { /* skip broken files */ }
    } else if (IMAGE_EXTS.includes(ext) && /(^|[\\/])(brushes|brush|alphas|alpha|tips)$/i.test(f.dir ?? '')) {
      // Pictures inside a "brushes" / "alphas" folder are brush tips.
      brushes.push({
        kind: 'brush', name: base, file: f.name, tipFile: await f.file(),
        brush: { format: 'texpaint-brush', version: 1, name: base, tip: 'image', settings: { spacing: 0.5 } },
      });
    } else if (ext === 'hdr') {
      envs.push({ kind: 'env', name: base, file: f.name, src: f.file });
    } else if (ext === 'tpgraph') {
      try {
        const g = JSON.parse(await (await f.file()).text());
        if (g.format === 'texpaint-graph') graphs.push({ kind: 'graph', name: g.name || base, file: f.name, graph: g });
      } catch { /* skip */ }
    } else if (ADOBE[ext]) {
      unsupported.push({ kind: 'unsupported', name: base, file: f.name, reason: ADOBE[ext], src: f.file });
    } else if (IMAGE_EXTS.includes(ext)) {
      // "rusty_metal/rough.jpg": a bare map name takes its folder's name as the set name.
      const bare = (Object.entries(SLOT_NAMES) as [MapSlot, string[]][]).find(([, names]) => names.includes(base.toLowerCase().replace(/[_\-. ]+/g, '')));
      const dirName = (f.dir ?? '').split('/').filter(Boolean).pop();
      const split = splitMapName(base) ?? (bare && dirName
        ? { set: dirName.replace(/[_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), slot: bare[0], dx: DX_NAMES.includes(base.toLowerCase()) }
        : { set: base, slot: 'color' as MapSlot, dx: false });
      const key = split.set.toLowerCase() || base.toLowerCase();
      if (!sets.has(key)) sets.set(key, { name: split.set || base, files: {}, normalDX: false });
      const entry = sets.get(key)!;
      if (!entry.files[split.slot]) {
        entry.files[split.slot] = await f.file();
        if (split.slot === 'normal') entry.normalDX = split.dx;
      }
    }
  }
  const textures: ShelfItem[] = [...texmats];
  for (const s of sets.values()) {
    if (!CHANNELS.some((c) => s.files[c])) continue;
    const thumbFile = s.files.color ?? s.files.rough ?? s.files.height ?? s.files.normal;
    textures.push({ kind: 'textures', name: s.name, files: s.files, normalDX: s.normalDX, thumb: thumbFile ? URL.createObjectURL(thumbFile) : undefined });
  }
  const byName = (a: ShelfItem, b: ShelfItem) => a.name.localeCompare(b.name);
  return [...smart.sort(byName), ...materials.sort(byName), ...textures.sort(byName), ...graphs.sort(byName), ...brushes, ...envs.sort(byName), ...unsupported.sort(byName)];
}

// ------------------------------------------------------------ linked folder (File System Access API)

const DB = 'texpaint';
const STORE = 'handles';
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  return new Promise((res, rej) => {
    const q = db.transaction(STORE).objectStore(STORE).get(key);
    q.onsuccess = () => res(q.result as T);
    q.onerror = () => rej(q.error);
  });
}
async function idbSet(key: string, value: unknown) {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(value, key);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

async function walk(dir: any, depth: number, out: { name: string; file: () => Promise<File>; dir?: string }[], path = '') {
  for await (const entry of dir.values()) {
    if (entry.kind === 'file') out.push({ name: entry.name, file: () => entry.getFile(), dir: path });
    else if (entry.kind === 'directory' && depth > 0) await walk(entry, depth - 1, out, path ? `${path}/${entry.name}` : entry.name);
  }
}

export type FolderState = 'unsupported' | 'none' | 'needs-permission' | 'ready';

/** The desktop app's bridge (TexPaint.exe), if running there. */
const NATIVE = (globalThis as any).texpaintNative as undefined | {
  isApp: boolean;
  listPresets(): Promise<{ root: string; files: { name: string; dir: string; path: string; size: number }[] }>;
  readPreset(p: string): Promise<ArrayBuffer>;
  writePreset(name: string, data: ArrayBuffer): Promise<string>;
  openPresetsFolder(): Promise<string>;
};
export const isDesktopApp = !!NATIVE?.isApp;
export const openNativePresets = () => NATIVE?.openPresetsFolder();

export class PresetShelf {
  handle: any = null;
  /** Desktop app: the presets folder next to TexPaint.exe, read directly. */
  nativeRoot = '';
  state: FolderState = 'none';
  items: ShelfItem[] = [];
  /** Built-in library items (material library, smart masks), listed after the folder's. */
  builtins: ShelfItem[] = [];
  private extraFiles: File[] = [];

  get supported() { return typeof (window as any).showDirectoryPicker === 'function'; }
  get folderName() { return this.handle?.name ?? (this.nativeRoot ? this.nativeRoot.split(/[\\/]/).slice(-2).join('\\') : ''); }

  /** Reconnect the folder linked last time (may need a click to re-grant access). */
  async restore() {
    if (NATIVE) {
      try { const l = await NATIVE.listPresets(); this.nativeRoot = l.root; this.state = 'ready'; await this.scan(); return; } catch (e) { console.warn('presets', e); }
    }
    if (!this.supported) { this.state = 'unsupported'; return; }
    try {
      const h = await idbGet<any>('presets');
      if (!h) return;
      this.handle = h;
      const perm = await h.queryPermission({ mode: 'readwrite' });
      this.state = perm === 'granted' ? 'ready' : 'needs-permission';
      if (this.state === 'ready') await this.scan();
    } catch { this.state = 'none'; }
  }

  async link(): Promise<boolean> {
    try {
      const h = await (window as any).showDirectoryPicker({ id: 'texpaint-presets', mode: 'readwrite' });
      this.handle = h;
      this.state = 'ready';
      await idbSet('presets', h).catch(() => {});
      await this.scan();
      return true;
    } catch (e: any) {
      if (e?.name !== 'AbortError') throw e;
      return false;
    }
  }

  async reconnect(): Promise<boolean> {
    if (!this.handle) return this.link();
    const perm = await this.handle.requestPermission({ mode: 'readwrite' });
    this.state = perm === 'granted' ? 'ready' : 'needs-permission';
    if (this.state === 'ready') await this.scan();
    return this.state === 'ready';
  }

  /** Fallback for browsers without folder access: add loose files for this session. */
  async addFiles(files: File[]) {
    this.extraFiles.push(...files);
    await this.scan();
  }

  async scan() {
    for (const it of this.items) if (it.kind === 'textures' && it.thumb) URL.revokeObjectURL(it.thumb);
    const list: { name: string; file: () => Promise<File>; dir?: string }[] = [];
    if (this.handle && this.state === 'ready') await walk(this.handle, 3, list);
    else if (NATIVE && this.nativeRoot) {
      const l = await NATIVE.listPresets();
      for (const f of l.files) list.push({ name: f.name, dir: f.dir, file: async () => new File([await NATIVE.readPreset(f.path)], f.name) });
    }
    for (const f of this.extraFiles) list.push({ name: f.name, file: async () => f });
    // Folder files come first, so a linked copy of a starter asset replaces the built-in one.
    const seen = new Set<string>();
    this.items = [...(await scanFiles(list)), ...this.builtins].filter((it) => {
      const k = it.kind + ':' + it.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /** Save any JSON preset into the linked folder (or download it). Returns a status message. */
  async saveJSON(fileName: string, data: unknown): Promise<string> {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    if (NATIVE && this.nativeRoot && !this.handle) {
      await NATIVE.writePreset(fileName, await blob.arrayBuffer());
      await this.scan();
      return `Saved ${fileName} to the presets folder`;
    }
    if (this.handle && this.state === 'ready') {
      const fh = await this.handle.getFileHandle(fileName, { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
      await this.scan();
      return `Saved ${fileName} to "${this.folderName}"`;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return `Downloaded ${fileName} (link a presets folder to save there directly)`;
  }

  /** Save a material preset into the linked folder. Returns the file name, or null if no folder. */
  async saveMaterial(p: MaterialPreset): Promise<string | null> {
    const name = `${p.name.replace(/[^\w\- ]+/g, '_').trim() || 'material'}.tpmat`;
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    if (NATIVE && this.nativeRoot && !this.handle) { await NATIVE.writePreset(name, await blob.arrayBuffer()); await this.scan(); return name; }
    if (!this.handle || this.state !== 'ready') return null;
    const fh = await this.handle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    await this.scan();
    return name;
  }
}
