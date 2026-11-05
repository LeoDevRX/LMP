import type { ExportKind, TextureSet } from './TextureSet';

export interface ExportMap { suffix: string; kind: ExportKind }
export interface ExportPreset {
  id: string;
  label: string;
  maxSize?: number;
  note?: string;
  maps: (normalStrength: number) => ExportMap[];
}

export const PRESETS: ExportPreset[] = [
  {
    id: 'roblox',
    label: 'Roblox SurfaceAppearance',
    maxSize: 1024,
    note: 'ColorMap, NormalMap (OpenGL), RoughnessMap, MetalnessMap, EmissiveMask. Roblox caps textures at 1024. Roblox glows in the ColorMap color: set EmissiveTint and EmissiveStrength on the SurfaceAppearance.',
    maps: (s) => [
      { suffix: 'ColorMap', kind: { kind: 'rgb', ch: 'color' } },
      { suffix: 'NormalMap', kind: { kind: 'normal', directX: false } },
      { suffix: 'RoughnessMap', kind: { kind: 'gray', ch: 'rough' } },
      { suffix: 'MetalnessMap', kind: { kind: 'gray', ch: 'metal' } },
      { suffix: 'EmissiveMask', kind: { kind: 'mask', ch: 'emit' } },
    ],
  },
  {
    id: 'pbr-gl',
    label: 'PBR Metal/Rough (OpenGL) – Blender, Unity',
    note: 'BaseColor, Roughness, Metallic, Height, Emissive, AmbientOcclusion and Normal (OpenGL, Y+).',
    maps: (s) => [
      { suffix: 'BaseColor', kind: { kind: 'rgb', ch: 'color' } },
      { suffix: 'Roughness', kind: { kind: 'gray', ch: 'rough' } },
      { suffix: 'Metallic', kind: { kind: 'gray', ch: 'metal' } },
      { suffix: 'Height', kind: { kind: 'gray', ch: 'height' } },
      { suffix: 'Emissive', kind: { kind: 'rgb', ch: 'emit' } },
      { suffix: 'AmbientOcclusion', kind: { kind: 'ao' } },
      { suffix: 'Normal', kind: { kind: 'normal', directX: false } },
    ],
  },
  {
    id: 'unreal',
    label: 'Unreal Engine (packed ORM)',
    note: 'BaseColor, OcclusionRoughnessMetallic (R=baked AO, G=Rough, B=Metal), Emissive, Normal (DirectX, Y−).',
    maps: (s) => [
      { suffix: 'BaseColor', kind: { kind: 'rgb', ch: 'color' } },
      { suffix: 'OcclusionRoughnessMetallic', kind: { kind: 'orm' } },
      { suffix: 'Emissive', kind: { kind: 'rgb', ch: 'emit' } },
      { suffix: 'Normal', kind: { kind: 'normal', directX: true } },
    ],
  },
];

/** GL rows are bottom-up; images are top-down. */
export function flipRows(px: Uint8Array, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(px.length);
  const row = w * 4;
  for (let y = 0; y < h; y++) out.set(px.subarray(y * row, (y + 1) * row), (h - 1 - y) * row);
  return out;
}

export async function pixelsToPng(px: Uint8Array, size: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(flipRows(px, size, size) as any, size, size), 0, 0);
  return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG encode failed'))), 'image/png'));
}

export interface ExportedFile { name: string; blob: Blob }

export async function exportMaps(
  ts: TextureSet, preset: ExportPreset, baseName: string, size: number, normalStrength: number,
): Promise<ExportedFile[]> {
  const out: ExportedFile[] = [];
  const s = preset.maxSize ? Math.min(size, preset.maxSize) : size;
  for (const m of preset.maps(normalStrength)) {
    const px = ts.renderExport(m.kind, s);
    out.push({ name: `${baseName}_${m.suffix}.png`, blob: await pixelsToPng(px, s) });
  }
  return out;
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Save into a folder the user picks (Chrome/Edge). Falls back to downloads. */
export async function saveFiles(files: ExportedFile[]): Promise<string> {
  const picker = (window as any).showDirectoryPicker;
  if (picker) {
    let dir: any;
    try {
      dir = await picker({ id: 'texpaint-export', mode: 'readwrite' });
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'cancelled';
      throw e;
    }
    for (const f of files) {
      const fh = await dir.getFileHandle(f.name, { create: true });
      const w = await fh.createWritable();
      await w.write(f.blob);
      await w.close();
    }
    return `Saved ${files.length} maps to "${dir.name}".`;
  }
  for (const f of files) downloadBlob(f.blob, f.name);
  return `Downloaded ${files.length} maps.`;
}
