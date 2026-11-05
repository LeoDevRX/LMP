/**
 * Built-in material library: TextureCraft's materials and smart materials
 * (crates/engine/src/materials.rs, MIT / Apache-2.0, https://github.com/storytold/texturecraft),
 * rebuilt as TexPaint fill layers with procedural channels and smart masks. Everything is procedural,
 * so it works on any model at any resolution.
 *
 * TextureCraft's colors are linear; they're converted to sRGB here. Its extra lobes (clear coat,
 * sheen, transmission, subsurface) don't exist in TexPaint and are left out.
 */
import type { Ch, ChannelValues } from './engine/TextureSet';
import type { LayerJSON, SmartMaterial } from './engine/Project';
import { lin2srgb, PatternType, ProcSource } from './engine/Procedural';
import { smartMask, GenSettings, MaskFx, FxBlend, defaultGen } from './engine/Masks';

type V3 = [number, number, number];
interface Pat { pat: PatternType; scale: number; seed: number; contrast: number; lo: V3; hi: V3 }
type Src = number | V3 | Pat;

const pat = (p: PatternType, scale: number, seed: number, contrast: number, lo: V3, hi: V3): Pat => ({ pat: p, scale, seed, contrast, lo, hi });
const gray = (p: PatternType, scale: number, seed: number, lo: number, hi: number): Pat => pat(p, scale, seed, 1, [lo, lo, lo], [hi, hi, hi]);

type Sources = Partial<Record<'color' | 'metal' | 'rough' | 'height', Src>>;
const metal = (color: Src, rough: Src): Sources => ({ color, metal: 1, rough });
const diel = (color: Src, rough: Src): Sources => ({ color, metal: 0, rough });
const plus = (s: Sources, height?: Src): Sources => (height === undefined ? s : { ...s, height });

/** TextureCraft height units → TexPaint height (0.5 = flat). */
const HK = 5;
const srgb = (c: V3): V3 => [lin2srgb(c[0]), lin2srgb(c[1]), lin2srgb(c[2])];
const scale3 = (c: V3, k: number): V3 => [c[0] * k, c[1] * k, c[2] * k];

function fillLayer(name: string, s: Sources, mask?: GenSettings): LayerJSON {
  const values: ChannelValues = { color: [0.5, 0.5, 0.5], rough: 0.5, metal: 0, height: 0.5, emit: [0, 0, 0] };
  const enabled: Record<Ch, boolean> = { color: false, rough: false, metal: false, height: false, emit: false, normal: false };
  const procs: Partial<Record<Ch, ProcSource>> = {};
  for (const [ch, src] of Object.entries(s) as ['color' | 'metal' | 'rough' | 'height', Src][]) {
    enabled[ch] = true;
    const isColor = ch === 'color';
    const conv = (v: V3): V3 => (isColor ? srgb(v) : ch === 'height' ? [0.5 + v[0] * HK, 0.5 + v[0] * HK, 0.5 + v[0] * HK] : [v[0], v[0], v[0]]);
    if (typeof src === 'number') {
      const v = conv([src, src, src]);
      if (isColor) values.color = v; else (values as any)[ch] = v[0];
    } else if (Array.isArray(src)) {
      const v = conv(src);
      if (isColor) values.color = v; else (values as any)[ch] = v[0];
    } else {
      const lo = conv(src.lo), hi = conv(src.hi);
      procs[ch] = { pattern: src.pat, scale: src.scale, seed: src.seed, contrast: src.contrast, low: lo, high: hi };
      const mid: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
      if (isColor) values.color = mid; else (values as any)[ch] = mid[0];
    }
  }
  return {
    kind: 'fill', name, visible: true, opacity: 1, blend: 'normal', values, enabled, tiling: 1,
    procs: Object.keys(procs).length ? procs : undefined,
    mask: mask ? { base: 'black', gen: mask } : undefined,
  };
}

// Mask stacks for `masked` layers (same helpers as Masks.ts' presets).
const soft2c = (s: number) => Math.max(0, Math.min(1, (0.5 - s) / 0.496));
const G = (type: 'edge' | 'ao' | 'dust', level: number, softness: number, noise: number, inv = false): GenSettings =>
  ({ ...defaultGen(type), amount: level, contrast: soft2c(softness), noise, noiseScale: 8, seed: 7, axis: 'y', flip: false, invert: inv });
const P = (p: PatternType, scale: number, seed: number, contrast: number): GenSettings =>
  ({ ...defaultGen('pattern'), pattern: p, scale, seed, contrast: contrast / 3, amount: 0.5, noise: 0 });
const fxOf = (g: GenSettings, blend: FxBlend): MaskFx => ({ ...g, blend, opacity: 1 });
const stackOf = (first: GenSettings, ...rest: [GenSettings, FxBlend][]): GenSettings => ({ ...first, fx: rest.map(([g, b]) => fxOf(g, b)) });

interface MatDef { id: string; label: string; category: string; base: V3; metal: number; rough: number; smart?: boolean }
const METAL = 'Metal', WOOD = 'Wood', STONE = 'Stone & Masonry', PLASTIC = 'Plastic & Rubber', FABRIC = 'Fabric & Leather', GLASS = 'Ceramic & Glass', ORGANIC = 'Organic';
const m = (id: string, label: string, category: string, base: V3, metal: number, rough: number): MatDef => ({ id, label, category, base, metal, rough });
const sm = (id: string, label: string, category: string, base: V3, metal: number, rough: number): MatDef => ({ id, label, category, base, metal, rough, smart: true });

export const MATERIALS: MatDef[] = [
  m('steel', 'Steel', METAL, [0.56, 0.57, 0.58], 1, 0.34),
  m('steel_stainless', 'Steel Stainless', METAL, [0.65, 0.64, 0.62], 1, 0.24),
  m('steel_dark', 'Steel Dark', METAL, [0.48, 0.48, 0.5], 1, 0.3),
  m('iron', 'Iron Raw', METAL, [0.53, 0.53, 0.54], 1, 0.5),
  m('cast_iron', 'Cast Iron', METAL, [0.48, 0.48, 0.48], 1, 0.65),
  m('copper', 'Copper', METAL, [0.955, 0.638, 0.538], 1, 0.26),
  m('copper_hammered', 'Copper Hammered', METAL, [0.92, 0.6, 0.5], 1, 0.3),
  m('brass', 'Brass', METAL, [0.91, 0.778, 0.423], 1, 0.27),
  m('bronze', 'Bronze', METAL, [0.8, 0.56, 0.32], 1, 0.36),
  m('gold_polished', 'Gold Polished', METAL, [1, 0.766, 0.336], 1, 0.17),
  m('silver', 'Silver', METAL, [0.972, 0.96, 0.915], 1, 0.22),
  m('aluminium', 'Aluminium Raw', METAL, [0.913, 0.922, 0.924], 1, 0.42),
  m('aluminium_brushed', 'Aluminium Brushed', METAL, [0.913, 0.922, 0.924], 1, 0.32),
  m('steel_brushed_aniso', 'Steel Brushed', METAL, [0.56, 0.57, 0.58], 1, 0.3),
  m('chrome', 'Chrome', METAL, [0.55, 0.556, 0.554], 1, 0.05),
  m('titanium', 'Titanium', METAL, [0.542, 0.497, 0.449], 1, 0.32),
  m('nickel', 'Nickel', METAL, [0.66, 0.609, 0.526], 1, 0.25),
  m('platinum', 'Platinum', METAL, [0.673, 0.637, 0.585], 1, 0.2),
  m('zinc', 'Zinc', METAL, [0.664, 0.824, 0.85], 1, 0.38),
  m('cobalt', 'Cobalt', METAL, [0.662, 0.655, 0.634], 1, 0.3),
  m('galvanized', 'Steel Galvanized', METAL, [0.69, 0.71, 0.72], 1, 0.4),
  m('rust', 'Rust', METAL, [0.3, 0.1, 0.03], 0, 0.85),
  m('wood', 'Wood Varnished', WOOD, [0.29, 0.15, 0.06], 0, 0.26),
  m('wood_oak', 'Oak', WOOD, [0.33, 0.2, 0.09], 0, 0.62),
  m('wood_walnut', 'Walnut', WOOD, [0.12, 0.06, 0.03], 0, 0.5),
  m('wood_pine', 'Pine', WOOD, [0.52, 0.33, 0.16], 0, 0.65),
  m('plywood', 'Plywood', WOOD, [0.55, 0.38, 0.21], 0, 0.75),
  m('bark', 'Bark', WOOD, [0.14, 0.1, 0.07], 0, 0.9),
  m('wood_maple', 'Maple', WOOD, [0.62, 0.45, 0.27], 0, 0.55),
  m('wood_cherry', 'Cherry', WOOD, [0.35, 0.13, 0.06], 0, 0.45),
  m('bamboo', 'Bamboo', WOOD, [0.6, 0.5, 0.28], 0, 0.5),
  m('wood_painted', 'Wood Painted', WOOD, [0.61, 0.59, 0.54], 0, 0.48),
  m('concrete', 'Concrete', STONE, [0.27, 0.26, 0.25], 0, 0.9),
  m('brick', 'Brick Red', STONE, [0.3, 0.075, 0.04], 0, 0.85),
  m('tiles_ceramic', 'Tiles Ceramic', STONE, [0.8, 0.8, 0.78], 0, 0.1),
  m('marble', 'Marble', STONE, [0.78, 0.78, 0.76], 0, 0.14),
  m('marble_black', 'Marble Black', STONE, [0.03, 0.03, 0.032], 0, 0.1),
  m('granite', 'Granite', STONE, [0.3, 0.27, 0.25], 0, 0.3),
  m('asphalt', 'Asphalt', STONE, [0.06, 0.06, 0.058], 0, 0.9),
  m('clay', 'Clay Earthenware', STONE, [0.45, 0.18, 0.09], 0, 0.8),
  m('slate', 'Slate', STONE, [0.11, 0.115, 0.13], 0, 0.72),
  m('sandstone', 'Sandstone', STONE, [0.52, 0.38, 0.23], 0, 0.9),
  m('terrazzo', 'Terrazzo', STONE, [0.7, 0.69, 0.66], 0, 0.3),
  m('sand', 'Sand', STONE, [0.52, 0.41, 0.26], 0, 0.95),
  m('mud', 'Mud', STONE, [0.12, 0.08, 0.05], 0, 0.6),
  m('cobblestone', 'Cobblestone', STONE, [0.3, 0.29, 0.27], 0, 0.8),
  m('gravel', 'Gravel', STONE, [0.35, 0.33, 0.3], 0, 0.85),
  m('plaster', 'Plaster', STONE, [0.78, 0.76, 0.72], 0, 0.88),
  m('plastic_glossy', 'Plastic Glossy', PLASTIC, [0.8, 0.12, 0.08], 0, 0.16),
  m('plastic_matte', 'Plastic Matte', PLASTIC, [0.18, 0.18, 0.19], 0, 0.6),
  m('plastic_textured', 'Plastic Textured', PLASTIC, [0.035, 0.035, 0.04], 0, 0.55),
  m('rubber', 'Rubber', PLASTIC, [0.03, 0.03, 0.03], 0, 0.88),
  m('carbon_fiber', 'Carbon Fiber', PLASTIC, [0.035, 0.035, 0.04], 0, 0.15),
  m('fabric', 'Fabric Cotton', FABRIC, [0.45, 0.47, 0.54], 0, 0.95),
  m('denim', 'Denim', FABRIC, [0.06, 0.09, 0.19], 0, 0.92),
  m('leather', 'Leather', FABRIC, [0.17, 0.08, 0.04], 0, 0.52),
  m('leather_black', 'Leather Black', FABRIC, [0.025, 0.025, 0.028], 0, 0.42),
  m('velvet', 'Velvet', FABRIC, [0.12, 0.015, 0.09], 0, 0.9),
  m('linen', 'Linen', FABRIC, [0.72, 0.66, 0.55], 0, 0.9),
  m('wool', 'Wool', FABRIC, [0.55, 0.52, 0.48], 0, 0.97),
  m('ceramic', 'Ceramic White', GLASS, [0.8, 0.8, 0.78], 0, 0.08),
  m('glass', 'Glass Clear', GLASS, [0.88, 0.9, 0.9], 0, 0.03),
  m('glass_frosted', 'Glass Frosted', GLASS, [0.84, 0.88, 0.88], 0, 0.45),
  m('ice', 'Ice', GLASS, [0.72, 0.82, 0.88], 0, 0.12),
  m('car_paint', 'Car Paint', PLASTIC, [0.45, 0.025, 0.03], 0, 0.4),
  m('skin', 'Skin', ORGANIC, [0.56, 0.35, 0.27], 0, 0.5),
  m('wax', 'Candle Wax', ORGANIC, [0.8, 0.72, 0.55], 0, 0.35),
  m('cork', 'Cork', ORGANIC, [0.36, 0.21, 0.1], 0, 0.85),
  m('paper', 'Paper', ORGANIC, [0.82, 0.81, 0.77], 0, 0.92),
  m('snow', 'Snow', ORGANIC, [0.85, 0.87, 0.9], 0, 0.6),
  m('bone', 'Bone', ORGANIC, [0.7, 0.63, 0.5], 0, 0.55),
  m('moss', 'Moss', ORGANIC, [0.09, 0.14, 0.04], 0, 0.85),
  sm('steel_painted_worn', 'Steel Painted Worn', METAL, [0.42, 0.06, 0.04], 0.2, 0.45),
  sm('steel_painted_rust', 'Steel Painted Rust Leaks', METAL, [0.62, 0.62, 0.6], 0.1, 0.5),
  sm('military_paint', 'Military Paint', METAL, [0.07, 0.08, 0.035], 0.1, 0.6),
  sm('iron_rusted', 'Iron Rusted', METAL, [0.38, 0.14, 0.05], 0.3, 0.8),
  sm('aluminium_scratched', 'Aluminium Scratched', METAL, [0.913, 0.922, 0.924], 1, 0.3),
  sm('copper_patina', 'Copper Oxidized', METAL, [0.6, 0.45, 0.35], 0.6, 0.5),
  sm('bronze_statue', 'Bronze Statue', METAL, [0.35, 0.4, 0.3], 0.5, 0.6),
  sm('brass_tarnished', 'Brass Tarnished', METAL, [0.7, 0.58, 0.3], 0.8, 0.4),
  sm('gold_dirty', 'Gold Dirty', METAL, [0.9, 0.68, 0.3], 0.9, 0.3),
  sm('chrome_smudged', 'Chrome Smudged', METAL, [0.55, 0.556, 0.554], 1, 0.12),
  sm('wood_weathered', 'Wood Weathered', WOOD, [0.33, 0.3, 0.27], 0, 0.8),
  sm('wood_chipped_paint', 'Wood Chipped Paint', WOOD, [0.04, 0.22, 0.22], 0, 0.55),
  sm('concrete_dirty', 'Concrete Dirty', STONE, [0.28, 0.26, 0.23], 0, 0.92),
  sm('brick_mossy', 'Brick Mossy', STONE, [0.22, 0.12, 0.05], 0, 0.9),
  sm('plastic_dusty', 'Plastic Dusty', PLASTIC, [0.05, 0.2, 0.45], 0, 0.4),
  sm('plastic_scuffed', 'Plastic Scuffed', PLASTIC, [0.06, 0.06, 0.065], 0, 0.5),
  sm('leather_worn', 'Leather Worn', FABRIC, [0.22, 0.12, 0.07], 0, 0.5),
  sm('stone_mossy', 'Stone Mossy', STONE, [0.36, 0.35, 0.33], 0, 0.85),
  sm('paint_sun_faded', 'Paint Sun Faded', PLASTIC, [0.55, 0.06, 0.05], 0, 0.45),
  sm('steel_water_stained', 'Steel Water Stained', METAL, [0.56, 0.57, 0.58], 1, 0.35),
  sm('plastic_grimy', 'Plastic Grimy', PLASTIC, [0.75, 0.74, 0.7], 0, 0.45),
];

const find = (id: string) => MATERIALS.find((x) => x.id === id)!;

/** Layers (bottom → top) of material `id`. */
function build(id: string): LayerJSON[] {
  const md = find(id);
  const r = md.rough;
  const one = (s: Sources) => [fillLayer(md.label, s)];
  const clouds = (seed: number): Pat => gray('clouds', 6, seed, r * 0.85, Math.min(1, r * 1.2));
  const plainMetal = (rough: Src) => one(metal(pat('clouds', 3, 5, 1, scale3(md.base, 0.94), md.base), rough));
  const preset = (name: string, s: Sources, mask: string, inv = false) => fillLayer(name, s, smartMask(mask, inv));
  const masked = (name: string, s: Sources, g: GenSettings) => fillLayer(name, s, g);
  const dirt = (c: V3) => preset('Dirt', diel(c, 0.9), 'dirt_cavities');
  switch (id) {
    case 'steel': case 'steel_dark': case 'iron': case 'copper': case 'brass': case 'bronze': case 'gold_polished': case 'silver':
    case 'aluminium': case 'chrome': case 'nickel': case 'platinum': case 'cobalt':
      return plainMetal(clouds(7));
    case 'steel_stainless': case 'aluminium_brushed': case 'titanium': return plainMetal(gray('brushed', 3, 3, r * 0.75, r * 1.25));
    case 'zinc': return one(metal(pat('voronoi', 6, 21, 1, scale3(md.base, 0.8), md.base), gray('voronoi', 6, 21, r * 1.5, r * 0.6)));
    case 'steel_brushed_aniso': return one(metal(pat('brushed', 3, 5, 1, scale3(md.base, 0.92), md.base), gray('brushed', 3, 5, r * 0.8, r * 1.2)));
    case 'cast_iron': return one(plus(metal(pat('noise', 1, 4, 1, [0.44, 0.44, 0.44], [0.52, 0.52, 0.52]), gray('grunge', 3, 9, 0.55, 0.75)), gray('pores', 14, 3, -0.02, 0)));
    case 'copper_hammered': return one(plus(metal(pat('hammered', 6, 1, 1, [0.86, 0.55, 0.45], [0.955, 0.638, 0.538]), gray('hammered', 6, 1, 0.38, 0.24)), gray('hammered', 6, 1, -0.04, 0)));
    case 'rust': return one(plus(diel(pat('grunge', 3, 11, 1, [0.12, 0.035, 0.012], [0.36, 0.13, 0.04]), gray('clouds', 5, 11, 0.95, 0.75)), gray('pores', 10, 11, -0.015, 0)));
    case 'slate': return one(plus(diel(pat('clouds', 3, 5, 1.2, [0.07, 0.075, 0.085], [0.16, 0.17, 0.19]), gray('noise', 1, 5, 0.64, 0.8)), gray('cells', 4, 5, -0.01, 0)));
    case 'sandstone': return one(plus(diel(pat('noise', 4, 13, 1, [0.42, 0.3, 0.18], [0.6, 0.45, 0.28]), 0.9), gray('perlin', 6, 13, -0.01, 0)));
    case 'terrazzo': return one(diel(pat('voronoi', 18, 9, 1, [0.55, 0.55, 0.53], [0.85, 0.84, 0.8]), gray('voronoi', 18, 9, 0.34, 0.26)));
    case 'sand': return one(plus(diel(pat('noise', 12, 27, 1, [0.42, 0.32, 0.19], [0.6, 0.48, 0.31]), 0.95), gray('perlin', 4, 27, -0.012, 0)));
    case 'mud': return one(plus(diel(pat('clouds', 3, 29, 1, [0.05, 0.035, 0.02], [0.17, 0.12, 0.075]), gray('grunge', 3, 29, 0.85, 0.2)), gray('clouds', 3, 29, -0.03, 0)));
    case 'cobblestone': return one(plus(diel(pat('cells', 6, 37, 1, scale3(md.base, 1.4), [0.16, 0.15, 0.14]), gray('cells', 6, 37, 0.7, 0.95)), gray('cells', 6, 37, 0, -0.05)));
    case 'gravel': return one(plus(diel(pat('voronoi', 30, 39, 1.2, [0.18, 0.17, 0.15], [0.52, 0.5, 0.46]), gray('voronoi', 30, 39, 0.92, 0.78)), gray('cells', 30, 39, -0.03, 0)));
    case 'plaster': return one(plus(diel(pat('clouds', 2, 41, 0.6, [0.7, 0.68, 0.64], [0.84, 0.82, 0.78]), gray('noise', 1, 41, 0.82, 0.92)), gray('clouds', 2, 41, -0.008, 0)));
    case 'moss': return one(plus(diel(pat('clouds', 5, 43, 1.3, [0.04, 0.07, 0.015], [0.18, 0.26, 0.07]), gray('noise', 1, 43, 0.75, 0.95)), gray('clouds', 5, 43, -0.03, 0)));
    case 'cork': return one(plus(diel(pat('noise', 6, 17, 1, [0.25, 0.14, 0.06], [0.45, 0.28, 0.13]), 0.85), gray('pores', 20, 17, -0.01, 0)));
    case 'paper': return one(plus(diel(pat('clouds', 8, 19, 1, [0.78, 0.77, 0.73], [0.86, 0.85, 0.81]), 0.92), gray('noise', 1, 19, -0.002, 0)));
    case 'galvanized': return one(metal(pat('voronoi', 10, 4, 1, [0.6, 0.62, 0.63], [0.78, 0.8, 0.81]), gray('voronoi', 10, 4, 0.5, 0.28)));
    case 'wood': return one(plus(diel(pat('wood', 2, 7, 1, [0.12, 0.05, 0.018], [0.42, 0.22, 0.09]), clouds(3)), gray('wood', 2, 7, -0.004, 0)));
    case 'wood_oak': return one(plus(diel(pat('wood', 2, 7, 1, [0.2, 0.11, 0.045], [0.46, 0.29, 0.14]), gray('wood', 2, 7, 0.74, 0.56)), gray('wood', 2, 7, -0.012, 0)));
    case 'wood_walnut': return one(plus(diel(pat('wood', 2.5, 21, 1, [0.05, 0.025, 0.012], [0.2, 0.1, 0.05]), gray('wood', 2.5, 21, 0.56, 0.46)), gray('wood', 2.5, 21, -0.008, 0)));
    case 'wood_pine': return one(plus(diel(pat('wood', 1.5, 4, 1, [0.33, 0.17, 0.065], [0.7, 0.48, 0.25]), gray('wood', 1.5, 4, 0.72, 0.62)), gray('wood', 1.5, 4, -0.012, 0)));
    case 'plywood': return one(diel(pat('wood', 1.2, 15, 0.6, [0.42, 0.27, 0.13], [0.66, 0.47, 0.27]), gray('wood', 1.2, 15, 0.8, 0.7)));
    case 'bark': return one(plus(diel(pat('streaks', 8, 25, 1.4, [0.13, 0.105, 0.08], [0.03, 0.022, 0.015]), 0.9), gray('streaks', 8, 25, 0, -0.06)));
    case 'wood_maple': return one(plus(diel(pat('wood', 3, 31, 0.5, [0.52, 0.36, 0.2], [0.7, 0.53, 0.33]), gray('wood', 3, 31, 0.6, 0.5)), gray('wood', 3, 31, -0.006, 0)));
    case 'wood_cherry': return one(plus(diel(pat('wood', 2.2, 33, 0.9, [0.22, 0.07, 0.03], [0.45, 0.19, 0.09]), gray('wood', 2.2, 33, 0.5, 0.4)), gray('wood', 2.2, 33, -0.008, 0)));
    case 'bamboo': return one(plus(diel(pat('streaks', 2, 35, 0.6, [0.5, 0.4, 0.2], [0.68, 0.58, 0.34]), gray('streaks', 2, 35, 0.55, 0.45)), gray('stripes', 1.5, 35, 0, -0.01)));
    case 'wood_painted': return one(plus(diel(pat('clouds', 3, 4, 1, [0.57, 0.55, 0.5], [0.64, 0.62, 0.57]), gray('wood', 2, 7, 0.56, 0.42)), gray('wood', 2, 7, -0.015, 0)));
    case 'concrete': return one(plus(diel(pat('clouds', 6, 4, 1.3, [0.2, 0.19, 0.18], [0.35, 0.34, 0.32]), gray('noise', 1, 6, 0.85, 0.95)), gray('pores', 14, 6, -0.03, 0)));
    case 'brick': return one(plus(diel(pat('bricks', 3, 4, 1, [0.27, 0.26, 0.24], [0.3, 0.075, 0.04]), gray('bricks', 3, 4, 0.95, 0.82)), gray('bricks', 3, 4, -0.04, 0)));
    case 'tiles_ceramic': return one(plus(diel(pat('tiles', 4, 2, 1, [0.33, 0.32, 0.3], [0.82, 0.82, 0.8]), gray('tiles', 4, 2, 0.85, 0.08)), gray('tiles', 4, 2, -0.03, 0)));
    case 'marble': return one(diel(pat('marble', 2, 12, 1, [0.38, 0.38, 0.37], [0.86, 0.86, 0.84]), clouds(12)));
    case 'marble_black': return one(diel(pat('marble', 2, 5, 1, [0.55, 0.55, 0.53], [0.015, 0.015, 0.017]), clouds(5)));
    case 'granite': return one(diel(pat('voronoi', 70, 8, 1, [0.1, 0.095, 0.09], [0.5, 0.47, 0.45]), gray('voronoi', 70, 8, 0.25, 0.35)));
    case 'asphalt': return one(plus(diel(pat('voronoi', 90, 3, 1, [0.025, 0.025, 0.025], [0.11, 0.105, 0.1]), gray('voronoi', 90, 3, 0.95, 0.75)), gray('pores', 10, 5, -0.02, 0)));
    case 'clay': return one(plus(diel(pat('clouds', 5, 2, 1, [0.4, 0.15, 0.07], [0.5, 0.21, 0.11]), clouds(2)), gray('noise', 0.8, 3, -0.005, 0.005)));
    case 'plastic_glossy': case 'plastic_matte': case 'ceramic': return one(diel(md.base, clouds(9)));
    case 'plastic_textured': return one(plus(diel(md.base, gray('leather', 40, 5, 0.66, 0.5)), gray('leather', 40, 5, -0.01, 0)));
    case 'rubber': return one(diel(pat('noise', 0.5, 3, 1, [0.025, 0.025, 0.025], [0.035, 0.035, 0.035]), gray('noise', 0.5, 3, 0.84, 0.94)));
    case 'carbon_fiber': return one(plus(diel(pat('twill', 12, 1, 1, [0.004, 0.004, 0.005], [0.08, 0.08, 0.085]), gray('twill', 12, 1, 0.5, 0.28)), gray('twill', 12, 1, 0, 0.002)));
    case 'fabric': return one(plus(diel(pat('weave', 18, 2, 1, [0.27, 0.29, 0.34], [0.6, 0.62, 0.7]), r), gray('weave', 18, 2, -0.01, 0)));
    case 'denim': return one(plus(diel(pat('twill', 22, 5, 1, [0.015, 0.025, 0.07], [0.15, 0.2, 0.38]), r), gray('twill', 22, 5, -0.01, 0)));
    case 'linen': return one(plus(diel(pat('weave', 30, 45, 1, [0.58, 0.52, 0.42], [0.8, 0.74, 0.62]), r), gray('weave', 30, 45, -0.006, 0)));
    case 'wool': return one(plus(diel(pat('noise', 2, 47, 1, [0.45, 0.42, 0.38], [0.6, 0.57, 0.53]), r), gray('noise', 2, 47, -0.004, 0)));
    case 'leather': return one(plus(diel(pat('leather', 42, 2, 1, [0.07, 0.03, 0.013], [0.25, 0.12, 0.06]), gray('leather', 42, 2, 0.62, 0.46)), gray('leather', 42, 2, -0.02, 0)));
    case 'leather_black': return one(plus(diel(pat('leather', 42, 6, 1, [0.01, 0.01, 0.01], [0.04, 0.04, 0.045]), gray('leather', 42, 6, 0.52, 0.36)), gray('leather', 42, 6, -0.02, 0)));
    case 'velvet': return one(plus(diel(pat('clouds', 3, 3, 1, [0.06, 0.006, 0.045], md.base), r), gray('noise', 1, 3, -0.002, 0)));
    case 'car_paint': return one(diel(pat('noise', 0.3, 8, 1, [0.38, 0.02, 0.025], md.base), gray('noise', 0.3, 8, 0.3, 0.45)));
    case 'skin': return one(plus(diel(pat('clouds', 4, 6, 1, [0.5, 0.3, 0.23], md.base), gray('pores', 30, 2, 0.42, 0.58)), gray('pores', 30, 2, -0.004, 0)));
    case 'wax': return one(diel(pat('clouds', 2, 11, 1, [0.74, 0.66, 0.5], md.base), clouds(11)));
    case 'glass': return one(diel(md.base, r));
    case 'ice': return one(diel(pat('clouds', 4, 31, 1, md.base, [0.84, 0.88, 0.9]), clouds(31)));
    case 'snow': return one(plus(diel(pat('clouds', 4, 33, 1, [0.8, 0.82, 0.86], [0.88, 0.89, 0.9]), gray('noise', 1, 33, 0.5, 0.7)), gray('perlin', 3, 33, -0.02, 0)));
    case 'bone': return one(plus(diel(pat('clouds', 5, 35, 1, [0.58, 0.5, 0.37], md.base), clouds(35)), gray('pores', 16, 35, -0.006, 0)));
    case 'glass_frosted': return one(diel(md.base, gray('noise', 1, 2, 0.4, 0.5)));
    // ---- smart materials
    case 'steel_painted_worn': return [...build('steel'), preset('Paint', plus(diel(md.base, gray('clouds', 3, 9, 0.38, 0.55)), 0.004), 'edge_chipped', true), dirt([0.12, 0.09, 0.06])];
    case 'steel_painted_rust': return [...build('steel'),
      preset('Paint', plus(diel(pat('clouds', 4, 3, 1, [0.58, 0.58, 0.56], [0.66, 0.66, 0.64]), 0.45), 0.004), 'edge_wear', true),
      preset('Rust leaks', diel(pat('grunge', 4, 2, 1, [0.1, 0.03, 0.01], [0.24, 0.08, 0.025]), 0.85), 'rust_leaks')];
    case 'military_paint': return [...build('steel_dark'),
      preset('Olive drab', plus(diel(pat('clouds', 3, 6, 1, [0.06, 0.07, 0.03], [0.085, 0.095, 0.042]), 0.62), 0.004), 'edge_chipped', true),
      dirt([0.06, 0.05, 0.035]), preset('Dust', diel([0.36, 0.31, 0.23], 0.95), 'dust_top')];
    case 'iron_rusted': return [...build('cast_iron'),
      masked('Rust', plus(diel(pat('grunge', 5, 3, 0.8, [0.045, 0.018, 0.008], [0.14, 0.05, 0.018]), 0.88), gray('noise', 1, 1, 0, 0.04)),
        stackOf(P('grunge', 2, 8, 1.2), [G('ao', 0.5, 0.25, 0.3), 'lighten'])),
      preset('Rust leaks', diel([0.11, 0.04, 0.014], 0.8), 'rust_leaks')];
    case 'aluminium_scratched': return [...build('aluminium_brushed'),
      preset('Polished edges', metal([0.95, 0.95, 0.95], 0.14), 'edge_wear'),
      preset('Scratches', plus(metal([0.95, 0.95, 0.95], 0.12), -0.006), 'scratches')];
    case 'copper_patina': return [...build('copper'),
      preset('Tarnish', diel(pat('clouds', 4, 2, 1, [0.18, 0.07, 0.04], [0.3, 0.13, 0.07]), 0.6), 'grunge'),
      masked('Patina', plus(diel(pat('clouds', 4, 11, 1.4, [0.15, 0.38, 0.32], [0.33, 0.6, 0.5]), 0.85), 0.02),
        stackOf(G('ao', 0.65, 0.25, 0.6), [P('streaks', 3, 9, 1), 'lighten']))];
    case 'bronze_statue': return [...build('bronze'),
      preset('Dark oxide', diel(pat('clouds', 4, 5, 1, [0.05, 0.035, 0.02], [0.12, 0.08, 0.04]), 0.6), 'grunge'),
      preset('Verdigris', plus(diel(pat('clouds', 5, 8, 1.3, [0.1, 0.3, 0.24], [0.25, 0.5, 0.42]), 0.88), 0.015), 'rust_leaks')];
    case 'brass_tarnished': return [...build('brass'),
      masked('Tarnish', diel(pat('clouds', 4, 4, 1, [0.08, 0.06, 0.025], [0.16, 0.12, 0.05]), 0.7), stackOf(G('ao', 0.6, 0.25, 0.5), [P('grunge', 2.5, 3, 0.9), 'lighten'])),
      preset('Fingerprints', metal([0.8, 0.68, 0.37], 0.45), 'fingerprints')];
    case 'gold_dirty': return [...build('gold_polished'), preset('Smudges', metal([0.85, 0.64, 0.28], 0.4), 'fingerprints'), dirt([0.06, 0.045, 0.03])];
    case 'chrome_smudged': return [...build('chrome'), preset('Smudges', metal([0.5, 0.505, 0.5], 0.3), 'fingerprints'), preset('Dust', diel([0.5, 0.48, 0.45], 0.9), 'dust_top')];
    case 'wood_weathered': return [...build('wood_pine'),
      masked('Weathered', plus(diel(pat('wood', 1.5, 4, 1, [0.17, 0.16, 0.14], [0.42, 0.4, 0.37]), 0.85), gray('wood', 1.5, 4, -0.03, 0)),
        stackOf(P('grunge', 2, 15, 0.8), [G('dust', 0.45, 0.2, 0.4), 'lighten'])),
      dirt([0.05, 0.04, 0.03])];
    case 'wood_chipped_paint': return [...build('wood_oak'),
      preset('Paint', plus(diel(pat('clouds', 3, 2, 1, [0.035, 0.19, 0.19], [0.05, 0.25, 0.25]), 0.55), 0.01), 'paint_chips', true), dirt([0.05, 0.04, 0.03])];
    case 'concrete_dirty': return [...build('concrete'),
      preset('Water stains', diel([0.13, 0.13, 0.12], 0.9), 'rust_leaks'), dirt([0.08, 0.065, 0.05]), preset('Ground mud', diel([0.12, 0.09, 0.06], 0.95), 'ground_dirt')];
    case 'brick_mossy': return [...build('brick'),
      preset('Grime', diel([0.07, 0.06, 0.05], 0.95), 'ground_dirt'),
      masked('Moss', plus(diel(pat('noise', 1, 7, 1, [0.02, 0.035, 0.008], [0.05, 0.075, 0.015]), 0.95), 0.02),
        stackOf(G('dust', 0.45, 0.15, 0.3), [P('grunge', 2, 5, 1), 'multiply'], [G('ao', 0.4, 0.2, 0.5), 'lighten']))];
    case 'stone_mossy': return [...build('granite'),
      preset('Dust', diel([0.42, 0.4, 0.36], 0.95), 'dust_cavities'),
      preset('Moss', plus(diel(pat('noise', 1, 11, 1, [0.03, 0.05, 0.01], [0.07, 0.1, 0.02]), 0.95), 0.015), 'moss_top')];
    case 'paint_sun_faded': return [fillLayer(md.label, diel(md.base, 0.4)),
      preset('Faded', diel(pat('clouds', 3, 4, 1, [0.62, 0.36, 0.33], [0.72, 0.48, 0.45]), 0.7), 'sun_faded'),
      preset('Chipped edges', diel([0.75, 0.73, 0.7], 0.6), 'edges_sharp')];
    case 'steel_water_stained': return [...build('steel'), preset('Stains', diel(pat('grunge', 4, 8, 1, [0.2, 0.18, 0.15], [0.32, 0.29, 0.25]), 0.75), 'water_stains')];
    case 'plastic_grimy': return [fillLayer(md.label, diel(md.base, 0.45)),
      preset('Worn edges', diel([0.86, 0.85, 0.82], 0.3), 'edges_soft'), preset('Grime', diel([0.16, 0.14, 0.11], 0.9), 'dust_cavities')];
    case 'plastic_dusty': return [fillLayer(md.label, diel(md.base, 0.35)),
      preset('Dust', diel([0.5, 0.46, 0.4], 0.95), 'dust_top'), dirt([0.1, 0.09, 0.08])];
    case 'plastic_scuffed': return [fillLayer(md.label, diel(md.base, gray('leather', 40, 5, 0.45, 0.35))),
      preset('Scuffed edges', diel([0.2, 0.2, 0.21], 0.7), 'edge_wear'), preset('Scratches', diel([0.14, 0.14, 0.15], 0.6), 'scratches')];
    case 'leather_worn': return [...build('leather'), preset('Worn', diel([0.3, 0.18, 0.1], 0.36), 'edge_wear'), dirt([0.035, 0.022, 0.014])];
  }
  return one(md.metal > 0.5 ? metal(md.base, r) : diel(md.base, r));
}

/** Every library material as a TexPaint smart material, with its shelf category and swatch values. */
export function libraryMaterials(): { def: MatDef; smart: SmartMaterial; swatch: { color: V3; rough: number; metal: number } }[] {
  return MATERIALS.map((def) => ({
    def,
    smart: { format: 'texpaint-smart', version: 1, name: def.label, layers: build(def.id) },
    swatch: { color: srgb(def.base), rough: def.rough, metal: def.metal },
  }));
}
