/**
 * Smart materials rebuilt from the layer recipes of Substance 3D Painter's starter smart materials (layer names,
 * flat colour / roughness / metal values, blending, mask generator settings — numbers only, read from the user's own
 * Painter install). Grunges are CC0 lookalikes, the few whole materials are CC0 scans, and the masks run on
 * LocalPaint's Painter-style generators (PainterGen.ts).
 */
import type { LayerJSON, SmartMaterial } from './engine/Project';
import type { Ch, ScanRef } from './engine/TextureSet';
import { painterStack } from './engine/Masks';
import DATA from './assets/painterSmart.json';

interface RecipeLayer {
  kind: 'fill' | 'group'; name: string; visible: boolean; opacity: number; blend: string;
  values?: any; enabled?: Record<Ch, boolean>; tiling?: number; procs?: any; scanId?: [string, string]; tri?: boolean;
  maskRecipe?: any[]; maskBlack?: boolean; children?: RecipeLayer[]; open?: boolean;
}
const TRI = { proj: 'tri' as const, rot: 0, offU: 0, offV: 0, sharp: 6 };
const ALL: Ch[] = ['color', 'rough', 'metal', 'normal', 'height'];

function layer(r: RecipeLayer): LayerJSON {
  const mask = r.maskRecipe?.length ? { base: 'black' as const, gen: painterStack(r.maskRecipe) } : r.maskBlack ? { base: 'black' as const, gen: null } : undefined;
  if (r.kind === 'group') {
    return { kind: 'group', name: r.name, visible: r.visible, opacity: r.opacity, blend: r.blend as any, open: false, children: (r.children ?? []).map(layer), mask } as LayerJSON;
  }
  const scan: ScanRef | undefined = r.scanId ? { file: `mat-${r.scanId[0]}.zip`, name: r.scanId[0].replace(/(\d+)/, ' $1'), cat: r.scanId[1], use: ALL } : undefined;
  const enabled = { ...(r.enabled as Record<Ch, boolean>) };
  if (scan) for (const c of ['color', 'rough', 'metal', 'normal', 'height'] as Ch[]) enabled[c] = true;
  return {
    kind: 'fill', name: r.name, visible: r.visible, opacity: r.opacity, blend: r.blend as any,
    values: r.values, enabled, tiling: r.tiling ?? 2, procs: r.procs, scan, xf: scan || r.tri ? TRI : undefined, mask,
  } as LayerJSON;
}

export interface PainterSmart { cat: string; smart: SmartMaterial }
export const PAINTER_SMART: PainterSmart[] = (DATA as { name: string; cat: string; layers: RecipeLayer[] }[]).map((d) => ({
  cat: d.cat.replace(' - ', ' & ').replace(/^Marble & granite$/, 'Stone'),
  smart: { format: 'texpaint-smart', version: 1, name: d.name, layers: d.layers.map(layer) },
}));
