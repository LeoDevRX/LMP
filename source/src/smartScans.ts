/**
 * "Realistic" smart materials, layered the way Substance's are: a scanned base material, then
 * scanned rust / paint / wear layers placed by smart masks (cavities, edges, grunge, dust).
 * The scans are CC0 from ambientCG and download the first time a material is used.
 */
import type { SmartMaterial, LayerJSON } from './engine/Project';
import type { Ch, ChannelValues, ScanRef } from './engine/TextureSet';
import { smartMask, defaultGen, GenSettings, MaskFx } from './engine/Masks';

const scan = (id: string, name: string, cat: string, use?: Ch[]): ScanRef => ({ file: `mat-${id}.zip`, name, cat, use });
const ALL: Ch[] = ['color', 'rough', 'metal', 'normal', 'height'];
const NOMETAL: Ch[] = ['color', 'rough', 'normal', 'height'];

// Scans used below (see the materials release catalog).
const S = {
  steel: (u = ALL) => scan('Metal032', 'Metal 032', 'Metal', u),
  steelPolished: (u = ALL) => scan('Metal061B', 'Metal 061 B', 'Metal', u),
  steelDark: (u = ALL) => scan('Metal046A', 'Metal 046 A', 'Metal', u),
  gunmetal: (u = ALL) => scan('Metal046B', 'Metal 046 B', 'Metal', u),
  chrome: (u = ALL) => scan('Metal049A', 'Metal 049 A', 'Metal', u),
  scratched: (u = ALL) => scan('Metal062C', 'Metal 062 C', 'Metal', u),
  gold: (u = ALL) => scan('Metal048A', 'Metal 048 A', 'Metal', u),
  goldWorn: (u = ALL) => scan('Metal048C', 'Metal 048 C', 'Metal', u),
  rustHeavy: (u = ALL) => scan('Metal022', 'Metal 022', 'Rust', u),
  rustOnSteel: (u = ALL) => scan('Metal053C', 'Metal 053 C', 'Metal', u),
  rustyIron: (u = ALL) => scan('Metal041B', 'Metal 041 B', 'Rust', u),
  oldIron: (u = ALL) => scan('Metal024', 'Metal 024', 'Rust', u),
  paintRed: (u = ALL) => scan('PaintedMetal004', 'Painted Metal 004', 'Painted metal', u),
  paintGreen: (u = ALL) => scan('PaintedMetal006', 'Painted Metal 006', 'Painted metal', u),
  paintWhite: (u = ALL) => scan('PaintedMetal012', 'Painted Metal 012', 'Painted metal', u),
  plates: (u = ALL) => scan('MetalPlates006', 'Metal Plates 006', 'Metal plates & sci-fi', u),
  platesBright: (u = ALL) => scan('MetalPlates008', 'Metal Plates 008', 'Metal plates & sci-fi', u),
  diamond: (u = ALL) => scan('DiamondPlate008C', 'Diamond Plate 008 C', 'Metal plates & sci-fi', u),
  planks: (u = NOMETAL) => scan('WoodFloor051', 'Wood Floor 051', 'Wood', u),
  wood: (u = NOMETAL) => scan('Wood051', 'Wood 051', 'Wood', u),
  concrete: (u = NOMETAL) => scan('Concrete049', 'Concrete 049', 'Stone & concrete', u),
  rock: (u = NOMETAL) => scan('Rock058', 'Rock 058', 'Stone & concrete', u),
  ground: (u = NOMETAL) => scan('Ground110', 'Ground 110', 'Ground', u),
  leather: (u = NOMETAL) => scan('Leather037', 'Leather 037', 'Fabric & leather', u),
  leatherWorn: (u = NOMETAL) => scan('Leather030', 'Leather 030', 'Fabric & leather', u),
  rubber: (u = NOMETAL) => scan('Rubber004', 'Rubber 004', 'Plastic & rubber', u),
};

const V = (color: [number, number, number], rough: number, metal: number, height = 0.5): ChannelValues => ({ color, rough, metal, height, emit: [0, 0, 0] });
const EN = (...chs: Ch[]): Record<Ch, boolean> => {
  const e = { color: false, rough: false, metal: false, height: false, emit: false, normal: false } as Record<Ch, boolean>;
  for (const c of chs) e[c] = true;
  return e;
};
const TRI = { proj: 'tri' as const, rot: 0, offU: 0, offV: 0, sharp: 6 };

interface FillOpts { values?: ChannelValues; enabled?: Ch[]; scan?: ScanRef; tiling?: number; opacity?: number; mask?: GenSettings | null; maskBase?: 'white' | 'black' }
function fill(name: string, o: FillOpts): LayerJSON {
  const use = o.scan?.use ?? [];
  // A scan without its own metal map is a non-metal: keep metal on (value 0) so the layer below doesn't show through.
  const enabled = EN(...(o.enabled ?? [...use, ...(use.length && !use.includes('metal') ? ['metal' as Ch] : [])]));
  return {
    kind: 'fill', name, visible: true, opacity: o.opacity ?? 1, blend: 'normal',
    values: o.values ?? V([0.5, 0.5, 0.5], 0.5, 0), enabled,
    tiling: o.tiling ?? 2, xf: o.scan ? TRI : undefined, scan: o.scan,
    mask: o.mask === undefined ? undefined : { base: o.maskBase ?? 'black', gen: o.mask },
  } as LayerJSON;
}
/** A smart-mask preset with a few settings changed. */
const M = (id: string, tweak: Partial<GenSettings> = {}, extra: MaskFx[] = []): GenSettings => {
  const g = { ...smartMask(id), ...tweak };
  if (extra.length) g.fx = [...(g.fx ?? []), ...extra];
  return g;
};
const fxOf = (g: GenSettings, blend: MaskFx['blend'], opacity = 1): MaskFx => ({ ...g, blend, opacity });
const pat = (pattern: GenSettings['pattern'], scale: number, seed: number, contrast = 1, amount = 0.5): GenSettings =>
  ({ ...defaultGen('pattern'), pattern, scale, seed, contrast: contrast / 3, amount, noise: 0 });

const SM = (name: string, layers: LayerJSON[]): SmartMaterial => ({ format: 'texpaint-smart', version: 1, name, layers });

export const SCAN_SMART: SmartMaterial[] = [
  SM('Rusty Metal', [
    fill('Steel base', { scan: S.steel() }),
    fill('Rust (cavities)', { scan: S.rustHeavy(), mask: M('rust_cavities', { amount: 0.62 }) }),
    fill('Fine rust', { scan: S.rustOnSteel(), opacity: 0.85, mask: { ...pat('grunge', 2.5, 21, 1.2, 0.42), fx: [fxOf(M('dirt_cavities', { amount: 0.4 }), 'lighten', 0.6)] } }),
    fill('Dirt', { values: V([0.12, 0.09, 0.07], 0.92, 0, 0.47), enabled: ['color', 'rough', 'metal', 'height'], opacity: 0.8, mask: M('cavity_grime', { amount: 0.45 }) }),
    fill('Polished edges', { scan: S.steelPolished(), mask: M('edge_wear', { amount: 0.42 }) }),
  ]),
  SM('Heavy Rust', [
    fill('Old iron', { scan: S.oldIron() }),
    fill('Rust', { scan: S.rustHeavy(), mask: { ...pat('grunge', 1.8, 7, 1.4, 0.62), fx: [fxOf(M('dirt_cavities', { amount: 0.55 }), 'lighten')] } }),
    fill('Rust streaks', { scan: S.rustyIron(), opacity: 0.8, mask: M('rust_leaks') }),
    fill('Bare edges', { scan: S.steelDark(), opacity: 0.9, mask: M('edges_sharp', { amount: 0.35 }) }),
  ]),
  SM('Chipped Red Paint', [
    fill('Steel', { scan: S.steelDark() }),
    fill('Red paint', { scan: S.paintRed(), mask: M('edge_wear', { amount: 0.38, invert: true }) }),
    fill('Rust in cavities', { scan: S.rustHeavy(), opacity: 0.8, mask: M('rust_cavities', { amount: 0.36 }) }),
    fill('Dust', { values: V([0.55, 0.5, 0.44], 0.95, 0, 0.5), enabled: ['color', 'rough', 'metal'], opacity: 0.55, mask: M('dust_top') }),
  ]),
  SM('Worn Green Paint', [
    fill('Steel', { scan: S.steel() }),
    fill('Green paint', { scan: S.paintGreen(), mask: M('worn_paint_blotches', { invert: true }), maskBase: 'white' }),
    fill('Edge scratches', { scan: S.steelPolished(), mask: M('edge_scratches') }),
    fill('Grime', { values: V([0.1, 0.09, 0.07], 0.9, 0, 0.48), enabled: ['color', 'rough', 'metal', 'height'], opacity: 0.75, mask: M('dirt_streaks') }),
  ]),
  SM('Industrial White Paint', [
    fill('Painted metal', { scan: S.paintWhite() }),
    fill('Rust leaks', { scan: S.rustHeavy(), opacity: 0.9, mask: M('rust_leaks') }),
    fill('Rust in cavities', { scan: S.rustOnSteel(), mask: M('rust_cavities', { amount: 0.45 }) }),
    fill('Dirt', { values: V([0.14, 0.12, 0.09], 0.92, 0, 0.48), enabled: ['color', 'rough', 'metal'], opacity: 0.7, mask: M('cavity_grime') }),
  ]),
  SM('Sci-Fi Panels', [
    fill('Panels', { scan: S.platesBright(), tiling: 1 }),
    fill('Dark trim', { scan: S.gunmetal(), opacity: 0.6, mask: M('occluded', { amount: 0.3 }) }),
    fill('Bright edges', { scan: S.steelPolished(), mask: M('edges_sharp', { amount: 0.5 }) }),
    fill('Grime', { values: V([0.08, 0.08, 0.08], 0.85, 0, 0.49), enabled: ['color', 'rough', 'metal'], opacity: 0.7, mask: M('cavity_grime', { amount: 0.4 }) }),
    fill('Dust', { values: V([0.5, 0.48, 0.45], 0.95, 0, 0.5), enabled: ['color', 'rough', 'metal'], opacity: 0.4, mask: M('dust_top') }),
  ]),
  SM('Scratched Gunmetal', [
    fill('Gunmetal', { scan: S.gunmetal() }),
    fill('Scratches', { scan: S.scratched(), opacity: 0.9, mask: M('scratches') }),
    fill('Polished edges', { scan: S.chrome(), mask: M('edge_scratches') }),
    fill('Fingerprints', { values: V([0.2, 0.2, 0.2], 0.7, 1, 0.5), enabled: ['rough'], opacity: 0.6, mask: M('fingerprints') }),
  ]),
  SM('Tarnished Gold', [
    fill('Gold', { scan: S.gold() }),
    fill('Tarnish', { scan: S.goldWorn(), mask: M('dirt_cavities', { amount: 0.55 }) }),
    fill('Polished edges', { values: V([1, 0.84, 0.5], 0.12, 1), enabled: ['color', 'rough', 'metal'], mask: M('edges_soft') }),
    fill('Grime', { values: V([0.1, 0.08, 0.05], 0.9, 0, 0.48), enabled: ['color', 'rough', 'metal'], opacity: 0.6, mask: M('cavity_grime', { amount: 0.4 }) }),
  ]),
  SM('Worn Chrome', [
    fill('Chrome', { scan: S.chrome() }),
    fill('Scratched patches', { scan: S.scratched(), mask: pat('grunge', 2, 33, 1.2, 0.45) }),
    fill('Dirt', { values: V([0.1, 0.09, 0.08], 0.9, 0, 0.48), enabled: ['color', 'rough', 'metal'], opacity: 0.7, mask: M('dirt_cavities', { amount: 0.4 }) }),
  ]),
  SM('Worn Diamond Plate', [
    fill('Diamond plate', { scan: S.diamond(), tiling: 1.5 }),
    fill('Rust', { scan: S.rustHeavy(), opacity: 0.85, mask: M('rust_cavities', { amount: 0.42 }) }),
    fill('Polished edges', { scan: S.steelPolished(), mask: M('edge_wear', { amount: 0.4 }) }),
  ]),
  SM('Old Wood Planks', [
    fill('Planks', { scan: S.planks() }),
    fill('Weathered', { scan: S.wood(), opacity: 0.6, mask: M('sun_faded') }),
    fill('Dirt', { values: V([0.09, 0.07, 0.05], 0.95, 0, 0.47), enabled: ['color', 'rough', 'metal', 'height'], opacity: 0.8, mask: M('cavity_grime') }),
    fill('Worn edges', { values: V([0.62, 0.5, 0.36], 0.75, 0), enabled: ['color', 'rough', 'metal'], opacity: 0.7, mask: M('edges_soft') }),
  ]),
  SM('Mossy Rock', [
    fill('Rock', { scan: S.rock() }),
    fill('Moss', { values: V([0.16, 0.26, 0.06], 0.95, 0, 0.53), enabled: ['color', 'rough', 'metal', 'height'], opacity: 0.9, mask: M('moss_top', { amount: 0.3 }) }),
    fill('Soil in cracks', { scan: S.ground(), mask: M('dirt_cavities', { amount: 0.5 }) }),
  ]),
  SM('Dirty Concrete', [
    fill('Concrete', { scan: S.concrete() }),
    fill('Water stains', { values: V([0.2, 0.19, 0.17], 0.85, 0, 0.5), enabled: ['color', 'rough', 'metal'], opacity: 0.6, mask: M('water_stains') }),
    fill('Grime', { values: V([0.08, 0.07, 0.06], 0.95, 0, 0.48), enabled: ['color', 'rough', 'metal', 'height'], opacity: 0.8, mask: M('ground_dirt') }),
  ]),
  SM('Worn Leather', [
    fill('Leather', { scan: S.leather() }),
    fill('Worn patches', { scan: S.leatherWorn(), mask: M('worn_paint_blotches') }),
    fill('Rubbed edges', { values: V([0.5, 0.36, 0.24], 0.55, 0), enabled: ['color', 'rough', 'metal'], opacity: 0.7, mask: M('edges_soft') }),
    fill('Dirt', { values: V([0.07, 0.05, 0.04], 0.9, 0, 0.49), enabled: ['color', 'rough', 'metal'], opacity: 0.6, mask: M('dirt_cavities', { amount: 0.4 }) }),
  ]),
  SM('Dusty Rubber', [
    fill('Rubber', { scan: S.rubber() }),
    fill('Dust', { values: V([0.5, 0.48, 0.45], 0.97, 0, 0.5), enabled: ['color', 'rough', 'metal'], opacity: 0.7, mask: M('dust_cavities') }),
    fill('Shiny wear', { values: V([0.08, 0.08, 0.08], 0.35, 0), enabled: ['rough'], mask: M('edges_soft') }),
  ]),
];
