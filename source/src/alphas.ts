/**
 * Brush alpha library and brush presets ported from TextureCraft (MIT / Apache-2.0,
 * https://github.com/storytold/texturecraft — crates/paint/src/alphas.rs, presets.rs, brush.rs and
 * crates/texel/src/noise.rs). Every alpha is drawn procedurally, so there are no image assets.
 */

// ------------------------------------------------------------------ noise (same hashes as TextureCraft)
function pcg3d(x: number, y: number, z: number): [number, number, number] {
  let a = (Math.imul(x >>> 0, 1664525) + 1013904223) >>> 0;
  let b = (Math.imul(y >>> 0, 1664525) + 1013904223) >>> 0;
  let c = (Math.imul(z >>> 0, 1664525) + 1013904223) >>> 0;
  a = (a + Math.imul(b, c)) >>> 0; b = (b + Math.imul(c, a)) >>> 0; c = (c + Math.imul(a, b)) >>> 0;
  a = (a ^ (a >>> 16)) >>> 0; b = (b ^ (b >>> 16)) >>> 0; c = (c ^ (c >>> 16)) >>> 0;
  a = (a + Math.imul(b, c)) >>> 0; b = (b + Math.imul(c, a)) >>> 0; c = (c + Math.imul(a, b)) >>> 0;
  return [a, b, c];
}
const U = 4294967295;
const hash01 = (x: number, y: number, z: number, seed: number) => pcg3d((x ^ Math.imul(seed, 0x9e3779b9)) >>> 0, y, z)[0] / U;
const sq5 = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function value(p: number[], seed: number): number {
  const ix = Math.floor(p[0]), iy = Math.floor(p[1]), iz = Math.floor(p[2]);
  const sx = sq5(p[0] - ix), sy = sq5(p[1] - iy), sz = sq5(p[2] - iz);
  const h = (dx: number, dy: number, dz: number) => hash01(ix + dx, iy + dy, iz + dz, seed);
  return lerp(lerp(lerp(h(0, 0, 0), h(1, 0, 0), sx), lerp(h(0, 1, 0), h(1, 1, 0), sx), sy),
    lerp(lerp(h(0, 0, 1), h(1, 0, 1), sx), lerp(h(0, 1, 1), h(1, 1, 1), sx), sy), sz);
}
function grad(x: number, y: number, z: number, seed: number, f: number[]) {
  const h = pcg3d((x ^ Math.imul(seed, 0x85ebca6b)) >>> 0, y, z)[1] % 12;
  const [a, b] = h < 4 ? [f[0], f[1]] : h < 8 ? [f[0], f[2]] : [f[1], f[2]];
  return (h & 1 ? -a : a) + (h & 2 ? -b : b);
}
export function perlin(p: number[], seed: number): number {
  const ix = Math.floor(p[0]), iy = Math.floor(p[1]), iz = Math.floor(p[2]);
  const fx = p[0] - ix, fy = p[1] - iy, fz = p[2] - iz;
  const sx = sq5(fx), sy = sq5(fy), sz = sq5(fz);
  const g = (dx: number, dy: number, dz: number) => grad(ix + dx, iy + dy, iz + dz, seed, [fx - dx, fy - dy, fz - dz]);
  const v = lerp(lerp(lerp(g(0, 0, 0), g(1, 0, 0), sx), lerp(g(0, 1, 0), g(1, 1, 0), sx), sy),
    lerp(lerp(g(0, 0, 1), g(1, 0, 1), sx), lerp(g(0, 1, 1), g(1, 1, 1), sx), sy), sz);
  return Math.min(1, Math.max(0, v * 0.5 + 0.5));
}
export function cellular(p: number[], seed: number): [number, number, number] {
  const ix = Math.floor(p[0]), iy = Math.floor(p[1]), iz = Math.floor(p[2]);
  const fx = p[0] - ix, fy = p[1] - iy, fz = p[2] - iz;
  let f1 = Infinity, f2 = Infinity, id = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const h = pcg3d(((ix + dx) ^ Math.imul(seed, 0xc2b2ae35)) >>> 0, iy + dy, iz + dz);
    const d0 = dx + h[0] / U - fx, d1 = dy + h[1] / U - fy, d2 = dz + h[2] / U - fz;
    const d = d0 * d0 + d1 * d1 + d2 * d2;
    if (d < f1) { f2 = f1; f1 = d; id = (h[0] ^ h[1]) >>> 0; } else if (d < f2) f2 = d;
  }
  return [Math.min(1, Math.sqrt(f1)), Math.min(1, Math.sqrt(f2)), id / U];
}
export const worley = (p: number[], seed: number) => cellular(p, seed)[0];
export function fbm(p: number[], octaves: number, seed: number, base: (p: number[], s: number) => number): number {
  let sum = 0, amp = 0.5, norm = 0, q = p.slice();
  for (let o = 0; o < Math.max(1, Math.min(12, octaves)); o++) {
    sum += amp * base(q, (seed + o * 31) >>> 0); norm += amp;
    q = q.map((v) => v * 2 + 17.13); amp *= 0.5;
  }
  return sum / norm;
}

// ------------------------------------------------------------------ alpha shapes
const SEED = 0x7c0a;
const AA = 3 / 512;
type Gen = (x: number, y: number) => number;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (e0: number, e1: number, x: number) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const fill = (d: number) => clamp01(0.5 - d / AA);
const len = (x: number, y: number) => Math.sqrt(x * x + y * y);
function seg(px: number, py: number, a: number[], b: number[]): [number, number] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = clamp01(((px - a[0]) * dx + (py - a[1]) * dy) / Math.max(1e-12, dx * dx + dy * dy));
  return [len(px - a[0] - dx * t, py - a[1] - dy * t), t];
}
function ngon(x: number, y: number, n: number, a: number, phase: number) {
  let m = -Infinity;
  for (let k = 0; k < n; k++) { const t = phase + (k * Math.PI * 2) / n; m = Math.max(m, x * Math.cos(t) + y * Math.sin(t)); }
  return m - a;
}
function star(x: number, y: number, k: number, inner: number, outer: number, curve: number) {
  const r = Math.atan2(x, y) / ((Math.PI * 2) / k);
  const t = Math.abs((r - Math.floor(r)) - 0.5) * 2;
  return fill(len(x, y) - (inner + (outer - inner) * Math.pow(t, curve)));
}
const fade = (x: number, y: number) => 1 - smooth(0.55, 0.97, len(x, y));
function dome(r: number, radius: number) { const q = r / radius; return 0.35 * fill(r - radius) + 0.65 * Math.sqrt(Math.max(0, 1 - q * q)); }
const rnd = (i: number, k: number) => hash01(i, k, 0, SEED);
const fb = (x: number, y: number, z: number, o: number) => fbm([x, y, z], o, SEED, perlin);

const SHAPES: Record<string, () => Gen> = {
  round_soft: () => (x, y) => Math.pow(Math.max(0, 1 - (x * x + y * y)), 2),
  round_hard: () => (x, y) => fill(len(x, y) - 0.95),
  square: () => (x, y) => fill(Math.max(Math.abs(x), Math.abs(y)) - 0.9),
  rectangle: () => (x, y) => fill(Math.max(Math.abs(x) - 0.95, Math.abs(y) - 0.45)),
  triangle: () => (x, y) => fill(ngon(x, y + 0.24, 3, 0.475, -Math.PI / 2)),
  hexagon: () => (x, y) => fill(ngon(x, y, 6, 0.82, 0)),
  ring: () => (x, y) => fill(Math.abs(len(x, y) - 0.72) - 0.2),
  cross: () => (x, y) => fill(Math.min(Math.max(Math.abs(x) - 0.22, Math.abs(y) - 0.92), Math.max(Math.abs(x) - 0.92, Math.abs(y) - 0.22))),
  star_5: () => (x, y) => star(x, y + 0.06, 5, 0.4, 0.97, 1),
  star_4: () => (x, y) => star(x, y, 4, 0.1, 0.97, 3),
  star_6: () => (x, y) => star(x, y, 6, 0.55, 0.95, 1),
  arrow: () => (x, y) => fill(Math.min(Math.max(Math.abs(x) - 0.16, y - 0.15, -0.9 - y), ngon(x, y - 0.35, 3, 0.25, -Math.PI / 2))),
  dots_grid: () => {
    const c = (v: number) => Math.min(3, Math.max(0, Math.floor((v + 0.9) / 0.45))) * 0.45 - 0.675;
    return (x, y) => fill(len(x - c(x), y - c(y)) - 0.14);
  },
  scratches: () => {
    const lines = Array.from({ length: 16 }, (_, i) => {
      const cx = rnd(i, 0) * 1.2 - 0.6, cy = rnd(i, 1) * 1.2 - 0.6;
      const ang = 0.5 + (rnd(i, 2) - 0.5) * 0.6, half = 0.15 + rnd(i, 3) * 0.4;
      const dx = Math.cos(ang) * half, dy = Math.sin(ang) * half;
      return { a: [cx - dx, cy - dy], b: [cx + dx, cy + dy], w: 0.004 + rnd(i, 4) * 0.012, k: 0.5 + rnd(i, 5) * 0.5 };
    });
    return (x, y) => {
      let m = 0;
      for (const l of lines) { const [d, t] = seg(x, y, l.a, l.b); m = Math.max(m, fill(d - l.w * Math.sqrt(Math.max(0, 1 - (t * 2 - 1) ** 2))) * l.k); }
      return m * fade(x, y);
    };
  },
  chips: () => (x, y) => {
    const w = fb(x * 3, y * 3, 1.7, 3) - 0.5;
    const [f1, f2, id] = cellular([x * 3.5 + w * 0.8, y * 3.5 + w * 0.8, 0.5], SEED);
    if (id >= 0.45) return 0;
    const rough = fbm([x * 14, y * 14, 2.3], 3, SEED + 1, value);
    return fill(0.1 + 0.12 * rough - (f2 - f1)) * fade(x, y);
  },
  splatter: () => {
    const drops = Array.from({ length: 28 }, (_, i) => {
      const a = rnd(i, 0) * Math.PI * 2, d = 0.42 + Math.pow(rnd(i, 1), 0.7) * 0.45;
      return [Math.cos(a) * d, Math.sin(a) * d, 0.015 + rnd(i, 2) ** 2 * 0.07];
    });
    return (x, y) => {
      const a = Math.atan2(y, x);
      const edge = 0.36 + 0.3 * (fb(Math.cos(a) * 1.5 + 4, Math.sin(a) * 1.5, 0, 3) - 0.5);
      let m = fill(len(x, y) - edge);
      for (const d of drops) m = Math.max(m, fill(len(x - d[0], y - d[1]) - d[2]));
      return m;
    };
  },
  sponge: () => (x, y) => {
    const holes = worley([x * 7, y * 7, 0.3], SEED), fine = worley([x * 15, y * 15, 1.1], SEED + 3);
    const body = fill(len(x, y) - 0.75 - 0.4 * (fb(x * 2, y * 2, 0.8, 3) - 0.5));
    return clamp01((holes - 0.28) * 5) * clamp01((fine - 0.2) * 4) * body;
  },
  grunge_spots: () => (x, y) => {
    const spots = clamp01((fb(x * 2.6, y * 2.6, 3.1, 5) - 0.55) * 7);
    const specks = Math.min(0.6, Math.max(0, (value([x * 30, y * 30, 0.5], SEED) - 0.86) * 8));
    return Math.min(1, spots + specks) * fade(x, y);
  },
  cracks: () => (x, y) => {
    const w = fb(x * 2, y * 2, 5, 3) - 0.5;
    const [f1, f2] = cellular([x * 2.6 + w, y * 2.6 + w * 0.7, 0.2], SEED + 5);
    const line = 1 - smooth(0.015, 0.045, f2 - f1);
    const breakup = clamp01((fbm([x * 4, y * 4, 7], 3, SEED + 2, value) - 0.35) * 4);
    return line * breakup * fade(x, y);
  },
  speckle: () => (x, y) => clamp01((value([x * 40, y * 40, 0], SEED) - 0.78) * 10) * fade(x, y),
  fur: () => {
    const strands = Array.from({ length: 40 }, (_, i) => {
      const x0 = rnd(i, 0) * 1.4 - 0.7, y0 = -0.85 + rnd(i, 1) * 0.3;
      const length = 0.8 + rnd(i, 2) * 0.7, bend = (rnd(i, 3) - 0.5) * 0.9;
      const p = [0, 1, 2, 3].map((k) => { const t = k / 3; return [x0 + bend * t * t * length, Math.min(0.95, y0 + t * length)]; });
      const w = 0.008 + rnd(i, 4) * 0.01;
      const bb = [Math.min(...p.map((q) => q[0])) - w, Math.min(...p.map((q) => q[1])) - w, Math.max(...p.map((q) => q[0])) + w, Math.max(...p.map((q) => q[1])) + w];
      return { p, w, bb };
    });
    return (x, y) => {
      let m = 0;
      for (const s of strands) {
        if (x < s.bb[0] || y < s.bb[1] || x > s.bb[2] || y > s.bb[3]) continue;
        for (let k = 0; k < 3; k++) { const [d, t] = seg(x, y, s.p[k], s.p[k + 1]); m = Math.max(m, fill(d - s.w * (1 - (k + t) / 3))); }
      }
      return m;
    };
  },
  leaf: () => {
    const s = Math.sin(Math.PI / 6), c = Math.cos(Math.PI / 6);
    return (x, y) => {
      const u = x * c - y * s, v = x * s + y * c;
      const stem = fill(seg(u, v, [0, -0.97], [0, -0.8])[0] - 0.015);
      const t = (v + 0.85) / 1.7;
      if (t < 0 || t > 1) return stem;
      const half = 0.38 * Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.8) * (1 - 0.3 * t);
      const q = (v - Math.abs(u) * 0.8) * 6;
      const vein = Math.max(fill(Math.abs(u) - 0.012), fill(Math.abs(q - Math.round(q)) / 6 - 0.006));
      return Math.max(fill(Math.abs(u) - half) * (1 - 0.45 * vein), stem);
    };
  },
  wood_knot: () => (x, y) => {
    const d = len(x / 0.55, y) + (fb(x * 2.5, y * 2.5, 9, 3) - 0.5) * 0.25;
    const rings = 0.5 + 0.5 * Math.cos(d * 30), core = 1 - smooth(0.12, 0.22, d);
    return Math.max(rings * 0.7, core) * (1 - smooth(0.7, 0.95, d));
  },
  rivet: () => (x, y) => dome(len(x, y), 0.7),
  bolt_head: () => (x, y) => { const r = len(x, y); return Math.max(fill(r - 0.95) * 0.4, fill(ngon(x, y, 6, 0.7, 0)) * 0.75, fill(r - 0.6)); },
  screw_slot: () => (x, y) => dome(len(x, y), 0.9) * (1 - fill(Math.max(Math.abs(y) - 0.08, Math.abs(x) - 0.7))),
  screw_cross: () => (x, y) => {
    const cut = Math.min(Math.max(Math.abs(y) - 0.08, Math.abs(x) - 0.5), Math.max(Math.abs(x) - 0.08, Math.abs(y) - 0.5));
    return dome(len(x, y), 0.9) * (1 - fill(cut));
  },
  stitches: () => (x, y) => { let m = 0; for (let i = 0; i < 6; i++) { const cx = -0.75 + i * 0.3; m = Math.max(m, fill(seg(x, y, [cx - 0.07, -0.2], [cx + 0.07, 0.2])[0] - 0.05)); } return m; },
  vent: () => (x, y) => { let m = 0; for (let i = 0; i < 5; i++) { const cy = -0.6 + i * 0.3; m = Math.max(m, fill(seg(x, y, [-0.7, cy], [0.7, cy])[0] - 0.07)); } return m; },
  fabric: () => (x, y) => {
    const u = x * 7, v = y * 7;
    const over = ((Math.floor(u) + Math.floor(v)) % 2 + 2) % 2 === 0;
    const thread = over ? Math.sin(Math.PI * (v - Math.floor(v))) : Math.sin(Math.PI * (u - Math.floor(u)));
    return thread * fill(Math.max(Math.abs(x), Math.abs(y)) - 0.92);
  },
  bricks: () => (x, y) => {
    const sx = 1.6, sy = 3.2, v = y * sy, row = Math.floor(v);
    const u = x * sx + ((row % 2 + 2) % 2 === 0 ? 0.5 : 0);
    const fu = u - Math.floor(u), fv = v - Math.floor(v);
    const d = Math.max((Math.abs(fu - 0.5) - 0.47) / sx, (Math.abs(fv - 0.5) - 0.44) / sy);
    const tint = 0.7 + 0.3 * hash01(Math.floor(u), row, 0, SEED);
    return fill(d) * tint * fill(Math.max(Math.abs(x), Math.abs(y)) - 0.92);
  },
};

const GLYPHS: [string, string][] = [
  ['A', '060110304146 0343'], ['B', '06003041423303 3344453606'], ['C', '4130100105163645'], ['D', '00304145360600'],
  ['E', '40000646 0333'], ['F', '400006 0333'], ['G', '41301001051636454323'], ['H', '0006 4046 0343'], ['I', '1030 2026 1636'],
  ['J', '4045361605'], ['K', '0006 400346'], ['L', '000646'], ['M', '0600234046'], ['N', '06004640'], ['O', '103041453616050110'],
  ['P', '06003041423303'], ['Q', '103041453616050110 3346'], ['R', '06003041423303 2346'], ['S', '413010010213334445361605'],
  ['T', '0040 2026'], ['U', '000516364540'], ['V', '002640'], ['W', '0016233640'], ['X', '0046 4006'], ['Y', '002340 2326'],
  ['Z', '00400646'], ['0', '103041453616050110 0541'], ['1', '112026 1636'], ['2', '01103041420646'], ['3', '01103041423313 334445361605'],
  ['4', '300343 3036'], ['5', '400002324345361605'], ['6', '413010010516364543321203'], ['7', '00404116'],
  ['8', '130201103041423313 130405163645443313'], ['9', '4313020110304145361605'],
];
function glyph(strokes: string): Gen {
  const UNIT = 0.27;
  const segs: [number[], number[]][] = [];
  for (const run of strokes.split(/\s+/)) {
    const pts: number[][] = [];
    for (let i = 0; i + 1 < run.length; i += 2) pts.push([(+run[i] - 2) * UNIT, (3 - +run[i + 1]) * UNIT]);
    for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]]);
  }
  return (x, y) => { let d = Infinity; for (const [a, b] of segs) d = Math.min(d, seg(x, y, a, b)[0]); return fill(d - 0.11); };
}

export const ALPHA_LIBRARY: { id: string; label: string; category: string }[] = [
  ...([
    ['round_soft', 'Soft round', 'Basic'], ['round_hard', 'Hard round', 'Basic'], ['square', 'Square', 'Basic'], ['rectangle', 'Rectangle', 'Basic'],
    ['triangle', 'Triangle', 'Basic'], ['hexagon', 'Hexagon', 'Basic'], ['ring', 'Ring', 'Basic'], ['cross', 'Cross', 'Basic'],
    ['star_5', 'Star', 'Basic'], ['star_4', 'Sparkle', 'Basic'], ['star_6', 'Star 6', 'Basic'], ['arrow', 'Arrow', 'Basic'], ['dots_grid', 'Dots grid', 'Basic'],
    ['scratches', 'Scratches', 'Grunge'], ['chips', 'Chips', 'Grunge'], ['splatter', 'Splatter', 'Grunge'], ['sponge', 'Sponge', 'Grunge'],
    ['grunge_spots', 'Grunge spots', 'Grunge'], ['cracks', 'Cracks', 'Grunge'], ['speckle', 'Speckle', 'Grunge'],
    ['fur', 'Fur strands', 'Organic'], ['leaf', 'Leaf', 'Organic'], ['wood_knot', 'Wood knot', 'Organic'],
    ['rivet', 'Rivet', 'Hard surface'], ['bolt_head', 'Bolt head', 'Hard surface'], ['screw_slot', 'Screw slot', 'Hard surface'],
    ['screw_cross', 'Screw cross', 'Hard surface'], ['stitches', 'Stitches', 'Hard surface'], ['vent', 'Vent slots', 'Hard surface'],
    ['fabric', 'Fabric stamp', 'Hard surface'], ['bricks', 'Bricks stamp', 'Hard surface'],
  ] as const).map(([id, label, category]) => ({ id: 'tc_' + id, label, category })),
  ...GLYPHS.map(([c]) => ({ id: 'tc_letter_' + c.toLowerCase(), label: `Stencil ${c}`, category: 'Stencil letters' })),
];

/** Draw a library alpha (white on black) at n × n with 2× supersampling. Returns null for unknown ids. */
export function drawAlpha(id: string, n = 256): HTMLCanvasElement | null {
  const key = id.replace(/^tc_/, '');
  let g: Gen | null = null;
  if (SHAPES[key]) g = SHAPES[key]();
  else if (key.startsWith('letter_')) { const gl = GLYPHS.find(([c]) => c.toLowerCase() === key.slice(7)); if (gl) g = glyph(gl[1]); }
  if (!g) return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  const ss = 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let s = 0;
    for (let i = 0; i < ss * ss; i++) {
      const sx = (x + ((i % ss) + 0.5) / ss) / n, sy = (y + (Math.floor(i / ss) + 0.5) / ss) / n;
      s += g(sx * 2 - 1, 1 - sy * 2);
    }
    const v = Math.round(clamp01(Number.isFinite(s) ? s / (ss * ss) : 0) * 255), o = (y * n + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** TextureCraft's procedural tips (used when no library alpha is set). */
export function drawProcTip(kind: 'spray' | 'grunge' | 'cloud' | 'streaks', n = 256, seed = 1): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  const hardness = 0.5;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const lx = (x + 0.5) / n * 2 - 1, ly = 1 - (y + 0.5) / n * 2;
    const r = len(lx, ly), fall = 1 - smooth(hardness, 1, r);
    let v = 0;
    if (kind === 'spray') v = fall * (value([lx * 14, ly * 14, seed * 0.37], seed) > 0.72 ? 1 : 0);
    else if (kind === 'grunge') v = fall * clamp01((fbm([lx * 2.5 + seed * 0.13, ly * 2.5, 0.5], 5, seed, perlin) - 0.42) * 5);
    else if (kind === 'cloud') v = fall * fbm([lx * 1.8, ly * 1.8, seed * 0.21], 4, seed, value);
    else v = fall * clamp01((value([lx * 0.8, ly * 18, seed * 0.7], seed) - 0.35) * 3);
    const o = (y * n + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(clamp01(v) * 255); img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
