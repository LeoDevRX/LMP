import { CHANNELS, Ch, ChannelValues, FillImage, Layer, TextureSet, BlendMode, GroupLayer, FillTransform, FillAdjust, DEFAULT_XF, DEFAULT_ADJ, BakeKey, ScanRef } from './TextureSet';
import { imageTexture } from './images';
import type { ModelSource } from './ModelLoader';
import type { GenSettings } from './Masks';
import type { ProcSource } from './Procedural';
import type { GraphJSON } from '../designer/Graph';

/** One layer as stored in a project (.tpaint) or smart material (.tpsmart). */
export type LayerJSON =
  | {
      kind: 'fill'; name: string; visible: boolean; opacity: number; blend?: BlendMode;
      values: ChannelValues; enabled: Record<Ch, boolean>;
      tiling?: number; images?: Partial<Record<Ch, { name: string; data: string; flipG?: boolean }>>;
      xf?: FillTransform; adj?: FillAdjust; note?: string;
      procs?: Partial<Record<Ch, ProcSource>>;
      graph?: GraphJSON;
      /** Maps from a scanned material (downloaded on first use). */
      scan?: ScanRef;
      mask?: MaskJSON;
    }
  | {
      kind: 'paint'; name: string; visible: boolean; opacity: number; blend?: BlendMode;
      channels: Partial<Record<Ch, string>>;
      mask?: MaskJSON;
    }
  | {
      kind: 'group'; name: string; visible: boolean; opacity: number; blend?: BlendMode; open?: boolean;
      children: LayerJSON[];
      mask?: MaskJSON;
    };
export interface MaskJSON { base: 'white' | 'black'; gen: GenSettings | null; paint?: string }

/** Project file (.tpaint): JSON with gzipped raw layer pixels, so nothing is lost. */
export interface ProjectFile {
  format: 'texpaint-project';
  version: 1 | 2 | 3;
  name: string;
  resolution: number;
  model: { kind: 'builtin'; id: string } | { kind: 'file'; name: string; data: string };
  activeIndex: number;
  layers: LayerJSON[];
  settings?: Record<string, unknown>;
  /** Baked mesh maps (gzipped RGBA8), so high-poly bakes survive without the high poly. */
  meshMaps?: { mesh: string; bn: string; bh: string; id?: string; wsn?: string; pos?: string; baked?: BakeKey[]; highName?: string };
}

/** Smart material (.tpsmart): fill layers + masks. Masks use generators, so they adapt to any model. */
export interface SmartMaterial {
  format: 'texpaint-smart';
  version: 1;
  name: string;
  layers: LayerJSON[];
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([bytes as any]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([bytes as any]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
export function toB64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}
export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function serializeLayer(ts: TextureSet, l: Layer, withPaint = true): Promise<LayerJSON | null> {
  let mask: MaskJSON | undefined;
  if (l.mask) {
    mask = { base: l.mask.base, gen: l.mask.gen ? { ...l.mask.gen } : null };
    if (withPaint && l.mask.painted) mask.paint = toB64(await gzip(ts.readRT(l.mask.paintRT)));
  }
  if (l.kind === 'fill') {
    const images: Partial<Record<Ch, { name: string; data: string; flipG?: boolean }>> = {};
    for (const [ch, img] of Object.entries(l.images ?? {}) as [Ch, FillImage][]) {
      if (img.name.startsWith('graph:') && l.graph) continue; // rebuilt from the graph
      images[ch] = { name: img.name, data: toB64(new Uint8Array(img.bytes)), flipG: img.flipG };
    }
    return {
      kind: 'fill', name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend,
      values: structuredClone(l.values), enabled: { ...l.enabled }, tiling: l.tiling, images, mask,
      xf: l.xf ? { ...l.xf } : undefined, adj: l.adj ? structuredClone(l.adj) : undefined, note: l.note,
      procs: l.procs ? structuredClone(l.procs) : undefined,
      graph: l.graph ? structuredClone(l.graph) : undefined,
    };
  }
  if (l.kind === 'group') {
    const children: LayerJSON[] = [];
    for (const c of l.children) { const j = await serializeLayer(ts, c, withPaint); if (j) children.push(j); }
    return { kind: 'group', name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, open: l.open, children, mask };
  }
  if (!withPaint) return null;
  const channels = {} as Record<Ch, string>;
  for (const ch of CHANNELS) channels[ch] = toB64(await gzip(ts.readLayerChannel(l, ch)));
  return { kind: 'paint', name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, channels, mask };
}

/** Add a stored layer to the texture set (above the active layer when `aboveActive`). */
export async function restoreLayer(ts: TextureSet, l: LayerJSON, resolution: number, aboveActive = false, parent?: GroupLayer): Promise<Layer> {
  let layer: Layer;
  if (l.kind === 'group') {
    const g = ts.addGroup(l.name, aboveActive, parent);
    g.open = l.open ?? true;
    for (const c of l.children) await restoreLayer(ts, c, resolution, false, g);
    ts.activeId = g.id;
    layer = g;
  } else if (l.kind === 'fill') {
    let images: Partial<Record<Ch, FillImage>> | undefined;
    if (l.images && Object.keys(l.images).length) {
      images = {};
      for (const [ch, im] of Object.entries(l.images) as [Ch, { name: string; data: string; flipG?: boolean }][]) {
        const bytes = fromB64(im.data).buffer as ArrayBuffer;
        images[ch] = { name: im.name, bytes, tex: await imageTexture(bytes, im.name), flipG: im.flipG };
      }
    }
    if (l.graph && ts.graphBaker) {
      try { images = { ...(images ?? {}), ...(await ts.graphBaker(l.graph)) }; } catch (e) { console.warn('graph', e); }
    }
    if (l.scan && ts.scanResolver && !images) {
      try {
        const got = await ts.scanResolver(l.scan);
        const use = l.scan.use ?? (Object.keys(got) as Ch[]);
        images = {};
        for (const ch of use) if (got[ch]) images[ch] = got[ch];
      } catch (e) { console.warn('scan', e); }
    }
    const fl = ts.addFillLayer(l.name, l.values, l.enabled, aboveActive, images, l.tiling ?? 1, parent);
    if (l.graph) fl.graph = structuredClone(l.graph);
    if (l.xf) fl.xf = { ...DEFAULT_XF, ...l.xf };
    if (l.adj) fl.adj = { ...DEFAULT_ADJ, ...structuredClone(l.adj) };
    if (l.note) fl.note = l.note;
    if (l.procs) fl.procs = structuredClone(l.procs);
    layer = fl;
  } else {
    const pl = ts.addPaintLayer(l.name, aboveActive, parent);
    for (const ch of CHANNELS) {
      if (!l.channels[ch]) continue; // older projects lack newer channels
      ts.writeLayerChannel(pl, ch, await gunzip(fromB64(l.channels[ch]!)), resolution);
    }
    layer = pl;
  }
  layer.visible = l.visible;
  layer.opacity = l.opacity;
  layer.blend = l.blend ?? 'normal';
  if (l.mask) {
    ts.addMask(layer, { base: l.mask.base, gen: l.mask.gen ? structuredClone(l.mask.gen) : null });
    if (l.mask.paint) {
      ts.writeRT(layer.mask!.paintRT, await gunzip(fromB64(l.mask.paint)), resolution);
      layer.mask!.painted = true;
      ts.maskChanged(layer);
    }
  }
  return layer;
}

export async function serializeProject(
  ts: TextureSet, name: string, model: ModelSource, settings: Record<string, unknown>,
): Promise<Blob> {
  const layers: LayerJSON[] = [];
  for (const l of ts.layers) layers.push((await serializeLayer(ts, l, true))!);
  const file: ProjectFile = {
    format: 'texpaint-project', version: 3, name, resolution: ts.size,
    model: model.kind === 'builtin'
      ? { kind: 'builtin', id: model.id }
      : { kind: 'file', name: model.name, data: toB64(new Uint8Array(model.bytes)) },
    activeIndex: ts.layers.findIndex((l) => l.id === ts.activeId),
    layers, settings,
  };
  if (ts.bakedOnce) {
    const m = ts.readMeshMaps();
    file.meshMaps = {
      mesh: toB64(await gzip(m.mesh)), bn: toB64(await gzip(m.bn)), bh: toB64(await gzip(m.bh)),
      id: toB64(await gzip(m.id!)), wsn: toB64(await gzip(m.wsn!)), pos: toB64(await gzip(m.pos!)), baked: m.baked,
      highName: ts.highName || undefined,
    };
  }
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

export async function parseProject(text: string): Promise<ProjectFile> {
  const f = JSON.parse(text) as ProjectFile;
  if (f.format !== 'texpaint-project') throw new Error('Not a texture painter project file.');
  return f;
}

export async function restoreMeshMaps(ts: TextureSet, f: ProjectFile): Promise<boolean> {
  if (!f.meshMaps) return false;
  ts.writeMeshMaps({
    mesh: await gunzip(fromB64(f.meshMaps.mesh)),
    bn: await gunzip(fromB64(f.meshMaps.bn)),
    bh: await gunzip(fromB64(f.meshMaps.bh)),
    id: f.meshMaps.id ? await gunzip(fromB64(f.meshMaps.id)) : undefined,
    wsn: f.meshMaps.wsn ? await gunzip(fromB64(f.meshMaps.wsn)) : undefined,
    pos: f.meshMaps.pos ? await gunzip(fromB64(f.meshMaps.pos)) : undefined,
    baked: f.meshMaps.baked,
  }, f.resolution);
  ts.highName = f.meshMaps.highName ?? '';
  return true;
}

/** Rebuild layers into an (empty) texture set. */
export async function restoreLayers(ts: TextureSet, f: ProjectFile) {
  const rec = ts.recording;
  ts.recording = false; // opening a project isn't an undo step
  try {
    for (const l of f.layers) await restoreLayer(ts, l, f.resolution, false);
  } finally { ts.recording = rec; }
  ts.clearHistory();
  const active = ts.layers[f.activeIndex] ?? ts.layers[ts.layers.length - 1];
  ts.activeId = active?.id ?? -1;
  ts.layerChanged();
}

export async function makeSmartMaterial(ts: TextureSet, name: string): Promise<{ smart: SmartMaterial; skipped: number }> {
  const layers: LayerJSON[] = [];
  let skipped = 0;
  // A selected folder becomes the smart material (like Substance); otherwise the whole stack.
  const act = ts.activeLayer;
  const source = act?.kind === 'group' ? act.children : ts.layers;
  for (const l of source) {
    const j = await serializeLayer(ts, l, false);
    if (j) layers.push(j); else skipped++;
  }
  return { smart: { format: 'texpaint-smart', version: 1, name, layers }, skipped };
}

/** Insert a smart material as a folder above the active layer (like Substance). */
export async function applySmartMaterial(ts: TextureSet, sm: SmartMaterial, parent?: GroupLayer): Promise<Layer> {
  // A one-layer material is just that layer (like TextureCraft's simple materials).
  if (sm.layers.length === 1 && sm.layers[0].kind !== 'group') {
    const l = await restoreLayer(ts, sm.layers[0], ts.size, !parent, parent);
    ts.activeId = l.id;
    ts.layerChanged();
    return l;
  }
  const g = ts.addGroup(sm.name, !parent, parent);
  for (const l of sm.layers) await restoreLayer(ts, l, ts.size, false, g);
  ts.activeId = g.id;
  ts.layerChanged();
  return g;
}
