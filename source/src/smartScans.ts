/**
 * "Realistic" smart materials, layered the way Substance's are: a scanned base material, then
 * scanned rust / paint / wear layers placed by smart masks (cavities, edges, grunge, dust).
 * The scans are CC0 from ambientCG and download the first time a material is used.
 */
import type { SmartMaterial, LayerJSON } from './engine/Project';
import type { Ch, ChannelValues, ScanRef } from './engine/TextureSet';
import { smartMask, GenSettings, MaskFx, spGrungeGen } from './engine/Masks';

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
/** A CC0 grunge mask (the old procedural pattern names map to similar scans). */
const PAT: Record<string, string> = { grunge: 'grunge:soft/SurfaceImperfections015', streaks: 'grunge:leaks/SurfaceImperfections002', clouds: 'grunge:soft/SurfaceImperfections014' };
const pat = (pattern: GenSettings['pattern'], scale: number, seed: number, contrast = 1, amount = 0.5): GenSettings =>
  spGrungeGen(PAT[pattern ?? 'grunge'] ?? PAT.grunge, Math.max(0.5, scale * 0.6), amount, Math.min(0.8, contrast * 0.3), seed);

const SM = (name: string, layers: LayerJSON[]): SmartMaterial => ({ format: 'texpaint-smart', version: 1, name, layers });
/** Any CC0 scan from the materials release by id (category as in its catalog). */
const X = (id: string, cat: string, u: Ch[] = NOMETAL) => scan(id, id.replace(/(\d+)/, ' $1').replace(/([A-Z])$/, ' $1'), cat, u);
const XM = (id: string, cat: string) => X(id, cat, ALL);
const DIRT_V = (c: [number, number, number] = [0.1, 0.085, 0.065]) => V(c, 0.92, 0, 0.48);
const DUST_V = (c: [number, number, number] = [0.52, 0.49, 0.44]) => V(c, 0.96, 0, 0.5);
const CRM = ['color', 'rough', 'metal'] as Ch[];

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

// ---------------------------------------------------------------- more scanned smart materials (v1.06)

/** Paint over metal, chipped at the edges, with dirt and dust. */
const painted = (name: string, paint: ScanRef | [number, number, number], metalScan: ScanRef, o: { rust?: boolean; dust?: number; chip?: number } = {}) => SM(name, [
  fill('Bare metal', { scan: metalScan }),
  Array.isArray(paint)
    ? fill('Paint', { values: V(paint, 0.55, 0, 0.505), enabled: ['color', 'rough', 'metal', 'height'], mask: M('edge_chipped', { amount: o.chip ?? 0.5, invert: true }), maskBase: 'white' })
    : fill('Paint', { scan: paint, mask: M('edge_chipped', { amount: o.chip ?? 0.5, invert: true }), maskBase: 'white' }),
  ...(o.rust ? [fill('Rust', { scan: S.rustHeavy(), opacity: 0.85, mask: M('rust_cavities', { amount: 0.45 }) })] : []),
  fill('Dirt', { values: DIRT_V(), enabled: CRM, opacity: 0.75, mask: M('cavity_grime', { amount: 0.5 }) }),
  fill('Dust', { values: DUST_V(), enabled: CRM, opacity: o.dust ?? 0.45, mask: M('dust_top') }),
]);
/** Sheet / plate metal with rust in the cavities, rust leaks and bright edges. */
const rusted = (name: string, base: ScanRef, heavy = false) => SM(name, [
  fill('Metal', { scan: base }),
  fill('Rust', { scan: heavy ? S.rustHeavy() : S.rustOnSteel(), mask: M('rust_cavities', { amount: heavy ? 0.62 : 0.48 }) }),
  fill('Rust leaks', { scan: S.rustyIron(), opacity: 0.8, mask: M('rust_leaks', { amount: heavy ? 0.6 : 0.5 }) }),
  fill('Worn edges', { scan: S.steelPolished(), opacity: 0.9, mask: M('edge_wear', { amount: 0.45 }) }),
]);
/** Clean metal with handling marks: fingerprints, light scratches, a little dust. */
const handled = (name: string, base: ScanRef) => SM(name, [
  fill('Metal', { scan: base }),
  fill('Scratches', { scan: S.scratched(), opacity: 0.7, mask: M('scratches', { amount: 0.45 }) }),
  fill('Fingerprints', { values: V([0.3, 0.3, 0.3], 0.62, 1, 0.5), enabled: ['rough'], opacity: 0.7, mask: M('fingerprints') }),
  fill('Dust', { values: DUST_V(), enabled: CRM, opacity: 0.35, mask: M('dust_cavities', { amount: 0.45 }) }),
]);
/** Wood with dirt in the gaps, worn edges and sun on top. */
const woodWorn = (name: string, base: ScanRef, o: { paint?: [number, number, number]; moss?: boolean } = {}) => SM(name, [
  fill('Wood', { scan: base }),
  ...(o.paint ? [fill('Paint', { values: V(o.paint, 0.7, 0, 0.505), enabled: ['color', 'rough', 'metal', 'height'], mask: M('worn_paint_blotches', { invert: true }), maskBase: 'white' })] : []),
  fill('Sun bleached', { values: V([0.55, 0.5, 0.42], 0.85, 0), enabled: CRM, opacity: 0.35, mask: M('sun_faded') }),
  fill('Dirt', { values: DIRT_V([0.08, 0.06, 0.04]), enabled: ['color', 'rough', 'metal', 'height'], opacity: 0.8, mask: M('cavity_grime', { amount: 0.5 }) }),
  ...(o.moss ? [fill('Moss', { values: V([0.15, 0.24, 0.06], 0.95, 0, 0.52), enabled: ['color', 'rough', 'metal', 'height'], opacity: 0.85, mask: M('moss_ground') })] : []),
  fill('Worn edges', { values: V([0.6, 0.5, 0.38], 0.7, 0), enabled: CRM, opacity: 0.5, mask: M('edges_soft') }),
]);
/** Stone / concrete / brick, weathered: grime from the ground, stains, moss or dust. */
const weathered = (name: string, base: ScanRef, o: { moss?: boolean; stains?: boolean; dust?: boolean } = {}) => SM(name, [
  fill('Stone', { scan: base }),
  ...(o.stains ? [fill('Water stains', { values: V([0.16, 0.15, 0.13], 0.85, 0), enabled: CRM, opacity: 0.6, mask: M('water_stains') })] : []),
  fill('Ground grime', { values: DIRT_V([0.09, 0.08, 0.06]), enabled: ['color', 'rough', 'metal', 'height'], opacity: 0.8, mask: M('ground_dirt') }),
  fill('Dirt in gaps', { values: DIRT_V(), enabled: ['color', 'rough', 'metal', 'height'], opacity: 0.75, mask: M('dirt_cavities', { amount: 0.5 }) }),
  ...(o.moss ? [fill('Moss', { values: V([0.14, 0.23, 0.05], 0.95, 0, 0.53), enabled: ['color', 'rough', 'metal', 'height'], opacity: 0.9, mask: M('moss_top', { amount: 0.42 }) })] : []),
  ...(o.dust ? [fill('Dust', { values: DUST_V([0.6, 0.57, 0.52]), enabled: CRM, opacity: 0.5, mask: M('dust_top') })] : []),
]);
/** Fabric / leather / plastic / rubber that's been used: dust, rubbed edges, grime. */
const used = (name: string, base: ScanRef, o: { edge?: [number, number, number]; shiny?: boolean } = {}) => SM(name, [
  fill('Base', { scan: base }),
  fill('Rubbed edges', o.shiny ? { values: V([0.1, 0.1, 0.1], 0.3, 0), enabled: ['rough'], mask: M('edges_soft') }
    : { values: V(o.edge ?? [0.6, 0.58, 0.55], 0.6, 0), enabled: CRM, opacity: 0.55, mask: M('edges_soft') }),
  fill('Grime', { values: DIRT_V(), enabled: CRM, opacity: 0.6, mask: M('dirt_cavities', { amount: 0.45 }) }),
  fill('Dust', { values: DUST_V(), enabled: CRM, opacity: 0.5, mask: M('dust_top', { amount: 0.45 }) }),
]);

const MP = 'Painted metal', MT = 'Metal', PL = 'Metal plates & sci-fi', WD = 'Wood', ST = 'Stone & concrete', BR = 'Bricks & tiles', FB = 'Fabric & leather', PR = 'Plastic & rubber', PP = 'Paint & plaster', GR = 'Ground';
export const SCAN_SMART_MORE: [string, SmartMaterial][] = [
  // Painted metal
  ['Painted metal', painted('Chipped Yellow Paint', [0.85, 0.62, 0.08], S.steelDark(), { rust: true })],
  ['Painted metal', painted('Worn Blue Paint', XM('PaintedMetal013', MP), S.steel())],
  ['Painted metal', painted('Old Olive Paint', [0.24, 0.26, 0.13], S.steelDark(), { rust: true, dust: 0.55 })],
  ['Painted metal', painted('Hazard Stripes', XM('PaintedMetal016', MP), S.gunmetal(), { chip: 0.45 })],
  ['Painted metal', painted('Peeling White Paint', [0.86, 0.85, 0.81], S.rustOnSteel(), { rust: true, chip: 0.6 })],
  ['Painted metal', painted('Chipped Orange Paint', [0.8, 0.3, 0.05], S.steel(), { chip: 0.55 })],
  ['Painted metal', painted('Scuffed Black Paint', [0.04, 0.04, 0.045], S.steelPolished(), { chip: 0.42, dust: 0.6 })],
  ['Painted metal', painted('Rusty Red Paint', XM('Metal027', MP), S.steelDark(), { rust: true })],
  ['Painted metal', painted('Rusty Grey Paint', XM('Metal029', MP), S.steel(), { dust: 0.55 })],
  ['Painted metal', painted('Rusty Painted Steel', XM('Metal028', MP), S.oldIron(), { rust: true, chip: 0.58 })],
  // Rusted sheet metal
  ['Rusty metal', rusted('Rusty Corrugated Steel', XM('CorrugatedSteel005', MP))],
  ['Rusty metal', rusted('Rusted Sheet Metal', XM('SheetMetal001', PL), true)],
  ['Rusty metal', rusted('Old Sheet Metal', XM('SheetMetal002', PL))],
  ['Rusty metal', rusted('Rusty Metal Plates', XM('MetalPlates004', PL), true)],
  ['Rusty metal', rusted('Weathered Diamond Plate', XM('DiamondPlate009', PL))],
  ['Rusty metal', rusted('Rusted Corrugated Roof', XM('CorrugatedSteel007B', PL), true)],
  ['Rusty metal', rusted('Rusty Iron Plates', XM('MetalPlates014', PL))],
  ['Rusty metal', rusted('Corroded Steel', XM('Metal063', MT), true)],
  // Clean metals, handled
  ['Metal', handled('Brushed Steel', XM('Metal055A', MT))],
  ['Metal', handled('Polished Aluminium', XM('Metal050A', MT))],
  ['Metal', handled('Smudged Chrome', S.chrome())],
  ['Metal', handled('Dark Steel', XM('Metal041A', MT))],
  ['Metal', handled('Perforated Steel', XM('SheetMetal004', PL))],
  ['Metal', handled('Brushed Gold', S.gold())],
  // Wood
  ['Wood', woodWorn('Weathered Planks', X('Planks037A', WD))],
  ['Wood', woodWorn('Old Oak', X('Wood092', WD))],
  ['Wood', woodWorn('Sanded Wood', X('Wood094', WD))],
  ['Wood', woodWorn('Light Pine', X('Wood095', WD))],
  ['Wood', woodWorn('Worn Wood Floor', X('WoodFloor043', WD))],
  ['Wood', woodWorn('Painted Wood, Blue', X('WoodFloor040', WD), { paint: [0.16, 0.32, 0.5] })],
  ['Wood', woodWorn('Painted Wood, White', X('Wood096', WD), { paint: [0.82, 0.8, 0.75] })],
  ['Wood', woodWorn('Mossy Old Wood', X('WoodFloor062', WD), { moss: true })],
  // Stone, concrete, brick
  ['Stone', weathered('Weathered Concrete', X('Concrete048', ST), { stains: true })],
  ['Stone', weathered('Stained Concrete', X('Concrete034', ST), { stains: true, dust: true })],
  ['Stone', weathered('Old Concrete Wall', X('Concrete047A', ST), { moss: true })],
  ['Stone', weathered('Mossy Cliff Rock', X('Rock063', ST), { moss: true })],
  ['Stone', weathered('Lichen Rock', X('Rock064', ST), { dust: true })],
  ['Stone', weathered('Old Marble', X('Marble012', ST), { stains: true })],
  ['Stone', weathered('Weathered Travertine', X('Travertine009', ST), { dust: true })],
  ['Stone', weathered('Mossy Bricks', X('Bricks105', BR), { moss: true })],
  ['Stone', weathered('Dirty Red Bricks', X('Bricks106A', BR), { stains: true })],
  ['Stone', weathered('Old Paving Stones', X('PavingStones138', BR), { moss: true })],
  ['Stone', weathered('Grimy Bathroom Tiles', X('Tiles141', BR), { stains: true })],
  ['Stone', weathered('Dusty Plaster Wall', X('PaintedPlaster015', PP), { stains: true, dust: true })],
  // Fabric, leather, plastic, rubber
  ['Fabric & plastic', used('Dusty Fabric', X('Fabric023', FB))],
  ['Fabric & plastic', used('Worn Denim', X('Fabric026', FB), { edge: [0.55, 0.62, 0.72] })],
  ['Fabric & plastic', used('Old Carpet', X('Carpet012', FB))],
  ['Fabric & plastic', used('Worn Brown Leather', X('Leather026', FB), { edge: [0.55, 0.38, 0.24] })],
  ['Fabric & plastic', used('Scuffed Plastic', X('Plastic006', PR), { edge: [0.8, 0.8, 0.78] })],
  ['Fabric & plastic', used('Grimy Plastic', X('Plastic010', PR))],
  ['Fabric & plastic', used('Worn Tyre Rubber', X('Rubber001', PR), { shiny: true })],
  ['Fabric & plastic', used('Muddy Ground', X('Ground112', GR))],
];
