import { GUBBY_B64, GUBBY_SIZE } from './gubby';
import * as THREE from 'three';
import { ALPHA_LIBRARY, drawAlpha, drawProcTip } from './alphas';

/** Brush presets (.tpbrush) and brush tips. Tips are grayscale: white = paint. */
export interface BrushSettings {
  radius: number; hardness: number; flow: number; spacing: number;
  angle: number; angleJitter: number; followStroke: boolean; sizeJitter: number; scatter: number;
  flowJitter?: number; hueJitter?: number; satJitter?: number; valJitter?: number;
  /** Stroke opacity (0..1). */
  opacity?: number;
}
export interface BrushPreset {
  format: 'texpaint-brush';
  version: 1;
  name: string;
  /** 'round', 'square', 'builtin:<id>' or 'image' (tipPng holds a PNG data URL). */
  tip: string;
  tipPng?: string;
  settings: Partial<BrushSettings>;
  /** Shelf group (Basic, Artistic, Dirt & dust…). */
  category?: string;
}

export const BUILTIN_TIPS: { id: string; label: string }[] = [
  { id: 'splatter', label: 'Splatter' },
  { id: 'grunge', label: 'Grunge' },
  { id: 'scratches', label: 'Scratches' },
  { id: 'dots', label: 'Dots' },
  { id: 'chalk', label: 'Chalk' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'star', label: 'Star' },
  { id: 'tcp_spray', label: 'Spray' },
  { id: 'tcp_streaks', label: 'Dry streaks' },
  { id: 'gubby', label: 'Gubby' },
  { id: 'leaks', label: 'Leaks / drips' },
  { id: 'rust', label: 'Rust blotches' },
  { id: 'fibers', label: 'Hair / fibers' },
  { id: 'woodgrain', label: 'Wood grain' },
  { id: 'tape', label: 'Torn tape' },
  { id: 'pencil', label: 'Pencil grain' },
  { id: 'bubbles', label: 'Bubbles' },
  { id: 'pores', label: 'Skin pores' },
  { id: 'gravel', label: 'Gravel' },
  { id: 'weave', label: 'Cloth weave' },
  { id: 'hatch', label: 'Cross hatch' },
  { id: 'hex', label: 'Hexagon' },
  { id: 'cracks2', label: 'Dry cracks' },
  { id: 'sponge2', label: 'Sea sponge' },
  { id: 'dents', label: 'Dents / bumps' },
  { id: 'smudge', label: 'Soft smudge' },
  // TextureCraft's alpha library (shapes, grunge, organic, hard surface, stencil letters).
  ...ALPHA_LIBRARY.map((a) => ({ id: a.id, label: a.label })),
];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

/** Value noise on a canvas-sized grid (0..1). */
function noiseField(n: number, cells: number, r: () => number): Float32Array {
  const g = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const fx = (x / n) * cells, fy = (y / n) * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[iy * (cells + 1) + ix], b = g[iy * (cells + 1) + ix + 1], c = g[(iy + 1) * (cells + 1) + ix], d = g[(iy + 1) * (cells + 1) + ix + 1];
    out[y * n + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  }
  return out;
}

/** Draw a built-in tip (256 × 256, white on black). */
function gubbyTip(): HTMLCanvasElement {
  const n = GUBBY_SIZE;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d')!;
  const raw = atob(GUBBY_B64);
  const img = g.createImageData(n, n);
  for (let i = 0; i < n * n; i++) { const v = raw.charCodeAt(i); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  return cv;
}

export function builtinTip(id: string): HTMLCanvasElement {
  if (id === 'gubby') return gubbyTip();
  if (id.startsWith('tc_')) { const a = drawAlpha(id); if (a) return a; }
  if (id.startsWith('tcp_')) return drawProcTip(id.slice(4) as 'spray' | 'grunge' | 'cloud' | 'streaks');
  const n = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
  const r = rng(id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const falloff = (x: number, y: number) => Math.max(0, 1 - Math.hypot(x / n - 0.5, y / n - 0.5) / 0.5);
  const fromField = (f: (x: number, y: number) => number) => {
    const img = g.getImageData(0, 0, n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = Math.round(Math.min(1, Math.max(0, f(x, y))) * 255), o = (y * n + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  };
  g.fillStyle = '#fff';
  if (id === 'splatter') {
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * n * 0.44, s = (1 - d / (n * 0.5)) * 14 * r() + 2;
      g.beginPath(); g.arc(n / 2 + Math.cos(a) * d, n / 2 + Math.sin(a) * d, s, 0, Math.PI * 2); g.fill();
    }
  } else if (id === 'dots') {
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
      const cx = (x + 0.5) * n / 6, cy = (y + 0.5) * n / 6;
      if (Math.hypot(cx - n / 2, cy - n / 2) > n * 0.46) continue;
      g.beginPath(); g.arc(cx, cy, n / 18, 0, Math.PI * 2); g.fill();
    }
  } else if (id === 'scratches') {
    g.strokeStyle = '#fff'; g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const y = n * (0.12 + 0.76 * r()), x0 = n * (0.08 + 0.3 * r()), x1 = n * (0.6 + 0.32 * r());
      g.globalAlpha = 0.5 + 0.5 * r(); g.lineWidth = 1 + r() * 3;
      g.beginPath(); g.moveTo(x0, y); g.quadraticCurveTo((x0 + x1) / 2, y + (r() - 0.5) * 20, x1, y + (r() - 0.5) * 30); g.stroke();
    }
    g.globalAlpha = 1;
  } else if (id === 'star') {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? n * 0.19 : n * 0.47;
      g.lineTo(n / 2 + Math.cos(a) * rr, n / 2 + Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
  } else if (id === 'grunge') {
    const a = noiseField(n, 6, r), b = noiseField(n, 22, r);
    fromField((x, y) => { const v = a[y * n + x] * 0.6 + b[y * n + x] * 0.4; return (v > 0.52 ? 1 : (v - 0.4) / 0.12) * Math.min(1, falloff(x, y) * 2.5); });
  } else if (id === 'chalk') {
    const b = noiseField(n, 48, r);
    fromField((x, y) => { const f = falloff(x, y); return f > 0.04 ? (b[y * n + x] > 0.45 ? 1 : 0) * Math.min(1, f * 4) : 0; });
  } else if (id === 'cloud') {
    const a = noiseField(n, 5, r), b = noiseField(n, 13, r);
    fromField((x, y) => (a[y * n + x] * 0.65 + b[y * n + x] * 0.35) * Math.pow(falloff(x, y), 0.8) * 1.6);
  } else if (id === 'leaks') {
    // Streaks running down from the top, thinning out (water / rust leaks).
    for (let i = 0; i < 34; i++) {
      const x = n * (0.18 + 0.64 * r()), w = 2 + r() * 7, len = n * (0.25 + 0.6 * r()), y0 = n * (0.08 + 0.12 * r());
      const gr = g.createLinearGradient(0, y0, 0, y0 + len);
      gr.addColorStop(0, `rgba(255,255,255,${0.5 + 0.5 * r()})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x - w / 2, y0);
      g.bezierCurveTo(x - w / 2 + (r() - 0.5) * 6, y0 + len * 0.5, x - w * 0.2, y0 + len * 0.9, x, y0 + len);
      g.bezierCurveTo(x + w * 0.2, y0 + len * 0.9, x + w / 2 + (r() - 0.5) * 6, y0 + len * 0.5, x + w / 2, y0); g.fill();
      if (r() < 0.4) { g.beginPath(); g.arc(x, y0 + len, w * 0.45, 0, Math.PI * 2); g.fill(); }
    }
    g.fillStyle = '#fff';
  } else if (id === 'rust') {
    const a = noiseField(n, 5, r), b = noiseField(n, 17, r), c = noiseField(n, 60, r);
    fromField((x, y) => { const i = y * n + x; const v = a[i] * 0.5 + b[i] * 0.35 + c[i] * 0.15; return Math.max(0, (v - 0.45) * 5) * Math.min(1, falloff(x, y) * 2.2); });
  } else if (id === 'fibers') {
    g.strokeStyle = '#fff'; g.lineCap = 'round';
    for (let i = 0; i < 160; i++) {
      const x = n * (0.1 + 0.8 * r()), y = n * (0.15 + 0.7 * r()), L = n * (0.08 + 0.22 * r()), bend = (r() - 0.5) * 18;
      g.globalAlpha = 0.25 + 0.6 * r(); g.lineWidth = 0.6 + r() * 1.6;
      g.beginPath(); g.moveTo(x - L / 2, y); g.quadraticCurveTo(x, y + bend, x + L / 2, y + (r() - 0.5) * 6); g.stroke();
    }
    g.globalAlpha = 1;
  } else if (id === 'woodgrain') {
    const a = noiseField(n, 4, r), b = noiseField(n, 40, r);
    fromField((x, y) => { const i = y * n + x; const v = Math.sin((y / n) * 70 + a[i] * 9 + b[i] * 0.8) * 0.5 + 0.5; return Math.pow(v, 3) * Math.min(1, falloff(x, y) * 3); });
  } else if (id === 'tape') {
    const b = noiseField(n, 40, r);
    fromField((x, y) => {
      const edgeL = n * 0.12 + b[y * n + 3] * n * 0.06, edgeR = n * 0.88 - b[y * n + n - 4] * n * 0.06;
      const inY = Math.abs(y / n - 0.5) < 0.22 + (b[(x * 7) % (n * n)] - 0.5) * 0.04;
      return inY && x > edgeL && x < edgeR ? 0.85 + 0.15 * b[y * n + x] : 0;
    });
  } else if (id === 'pencil') {
    const b = noiseField(n, 90, r);
    fromField((x, y) => { const f = falloff(x, y); return f > 0.2 ? (b[y * n + x] > 0.5 ? 1 : 0.15) * Math.min(1, (f - 0.2) * 5) : 0; });
  } else if (id === 'bubbles') {
    g.strokeStyle = '#fff';
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.6) * n * 0.4, s = 3 + r() * 18;
      g.lineWidth = 1 + s * 0.12; g.globalAlpha = 0.6 + 0.4 * r();
      g.beginPath(); g.arc(n / 2 + Math.cos(a) * d, n / 2 + Math.sin(a) * d, s, 0, Math.PI * 2); g.stroke();
    }
    g.globalAlpha = 1;
  } else if (id === 'pores') {
    for (let i = 0; i < 420; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * n * 0.46, s = 0.8 + r() * 2.4;
      g.globalAlpha = 0.4 + 0.6 * r();
      g.beginPath(); g.arc(n / 2 + Math.cos(a) * d, n / 2 + Math.sin(a) * d, s, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  } else if (id === 'gravel') {
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * n * 0.42, cx = n / 2 + Math.cos(a) * d, cy = n / 2 + Math.sin(a) * d, s = 4 + r() * 12;
      g.globalAlpha = 0.5 + 0.5 * r();
      g.beginPath();
      for (let k = 0; k < 7; k++) { const t = (k / 7) * Math.PI * 2, rr = s * (0.7 + 0.5 * r()); g.lineTo(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr); }
      g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
  } else if (id === 'weave') {
    fromField((x, y) => {
      const u = x / n * 16, v = y / n * 16, cu = Math.floor(u), cv = Math.floor(v);
      const over = (cu + cv) & 1;
      const t = over ? Math.sin((u - cu) * Math.PI) : Math.sin((v - cv) * Math.PI);
      return (0.35 + 0.65 * t) * Math.min(1, falloff(x, y) * 3);
    });
  } else if (id === 'hatch') {
    g.strokeStyle = '#fff'; g.lineWidth = 2.2;
    for (let k = -n; k < n * 2; k += 14) {
      g.globalAlpha = 0.7 + 0.3 * r();
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + n, n); g.stroke();
      g.beginPath(); g.moveTo(k + n, 0); g.lineTo(k, n); g.stroke();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-in';
    const gr = g.createRadialGradient(n / 2, n / 2, n * 0.3, n / 2, n / 2, n * 0.48);
    gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
    g.globalCompositeOperation = 'source-over';
    // the tip shader reads brightness, so flatten onto black
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = n;
    const tg = tmp.getContext('2d')!; tg.fillStyle = '#000'; tg.fillRect(0, 0, n, n); tg.drawImage(cv, 0, 0);
    g.clearRect(0, 0, n, n); g.drawImage(tmp, 0, 0);
  } else if (id === 'hex') {
    g.beginPath();
    for (let k = 0; k < 6; k++) { const t = (k / 6) * Math.PI * 2 + Math.PI / 6; g.lineTo(n / 2 + Math.cos(t) * n * 0.44, n / 2 + Math.sin(t) * n * 0.44); }
    g.closePath(); g.fill();
  } else if (id === 'cracks2') {
    g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    const crack = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      g.lineWidth = w; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * len / 6; y += Math.sin(a) * len / 6; g.lineTo(x, y); }
      g.stroke();
      if (depth > 0) for (let b = 0; b < 2; b++) crack(x, y, a + (r() - 0.5) * 2, len * 0.6, w * 0.65, depth - 1);
    };
    for (let i = 0; i < 4; i++) crack(n / 2, n / 2, r() * Math.PI * 2, n * 0.22, 3, 2);
  } else if (id === 'sponge2') {
    const a = noiseField(n, 28, r), b = noiseField(n, 9, r);
    fromField((x, y) => { const i = y * n + x; const v = a[i] * 0.7 + b[i] * 0.3; const f = falloff(x, y); return v > 0.5 ? Math.min(1, f * 3 * (b[i] + 0.4)) : 0; });
  } else if (id === 'dents') {
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * n * 0.38, cx = n / 2 + Math.cos(a) * d, cy = n / 2 + Math.sin(a) * d, s = 6 + r() * 22;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, s);
      gr.addColorStop(0, `rgba(255,255,255,${0.5 + 0.5 * r()})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, s, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#fff';
  } else if (id === 'smudge') {
    const a = noiseField(n, 3, r);
    fromField((x, y) => { const dx = (x / n - 0.5) / 0.48, dy = (y / n - 0.5) / 0.24; const e = Math.max(0, 1 - Math.hypot(dx, dy)); return Math.pow(e, 1.4) * (0.6 + 0.4 * a[y * n + x]); });
  }
  return cv;
}

/** Small preview of a built-in tip for the picker (cheap for the procedural library). */
export function builtinTipThumb(id: string, n = 48): HTMLCanvasElement {
  if (id.startsWith('tc_')) { const a = drawAlpha(id, n); if (a) return a; }
  if (id.startsWith('tcp_')) return drawProcTip(id.slice(4) as 'spray' | 'grunge' | 'cloud' | 'streaks', n);
  return builtinTip(id);
}

/** Turn any picture into a tip: its alpha if it has one, else its brightness. */
export async function imageTip(src: Blob | string): Promise<HTMLCanvasElement> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Could not read that image')); img.src = url; });
    const n = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = n;
    const g = cv.getContext('2d')!;
    g.drawImage(img, 0, 0, n, n);
    const d = g.getImageData(0, 0, n, n);
    let transparent = 0;
    for (let i = 3; i < d.data.length; i += 4) if (d.data[i] < 250) transparent++;
    const useAlpha = transparent > n * n * 0.02;
    for (let i = 0; i < d.data.length; i += 4) {
      const v = useAlpha ? d.data[i + 3] : Math.round(0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]);
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    return cv;
  } finally { if (typeof src !== 'string') URL.revokeObjectURL(url); }
}

export function tipTexture(cv: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** Preview of a tip shape for the UI (round / square drawn directly). */
export function tipPreview(tip: string, canvas?: HTMLCanvasElement, hardness = 0.6): HTMLCanvasElement {
  if (canvas && tip !== 'round' && tip !== 'square') return canvas;
  const n = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
  if (tip === 'square') {
    g.fillStyle = '#fff'; g.fillRect(n * 0.12, n * 0.12, n * 0.76, n * 0.76);
  } else {
    const gr = g.createRadialGradient(n / 2, n / 2, n * 0.38 * hardness, n / 2, n / 2, n * 0.38);
    gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000');
    g.fillStyle = gr; g.beginPath(); g.arc(n / 2, n / 2, n * 0.38, 0, Math.PI * 2); g.fill();
  }
  return cv;
}

/** Shelf groups for the starter brushes, like Substance Painter's brush categories. */
const BRUSH_CATEGORY: Record<string, string> = {
  'Basic hard': 'Basic', 'Basic soft': 'Basic', 'Square': 'Basic', 'Airbrush': 'Basic', 'Dots': 'Stamps & shapes', 'Dots (spaced)': 'Stamps & shapes',
  'Star stamp': 'Stamps & shapes', 'Stars': 'Stamps & shapes', 'Hexagons': 'Stamps & shapes',
  'Chalk': 'Artistic', 'Chalk (sponge)': 'Artistic', 'Dry brush': 'Artistic', 'Pencil': 'Artistic', 'Cross hatch (toon)': 'Artistic', 'Soft smudge': 'Artistic', 'Sea sponge': 'Artistic',
  'Cloud': 'Dirt & dust', 'Grunge': 'Dirt & dust', 'Grunge spots': 'Dirt & dust', 'Speckle': 'Dirt & dust', 'Gubby': 'Dirt & dust', 'Dust (soft spray)': 'Dirt & dust', 'Spray': 'Dirt & dust',
  'Splatter': 'Leaks & stains', 'Splatter drops': 'Leaks & stains', 'Drips': 'Leaks & stains', 'Leaks': 'Leaks & stains',
  'Scratches': 'Damage', 'Scratches (lines)': 'Damage', 'Chips': 'Damage', 'Cracks': 'Damage', 'Dry cracks': 'Damage', 'Dents and bumps': 'Damage', 'Chipped paint': 'Damage',
  'Rust blotches': 'Rust & paint',
  'Stitches': 'Fabric, skin & hair', 'Fur': 'Fabric, skin & hair', 'Hair - fur strands': 'Fabric, skin & hair', 'Cloth weave': 'Fabric, skin & hair', 'Skin pores': 'Fabric, skin & hair', 'Bubbles': 'Fabric, skin & hair',
  'Leaves': 'Nature', 'Wood grain': 'Nature', 'Gravel': 'Nature', 'Torn tape': 'Damage',
  'Rivets': 'Hard surface', 'Bolts': 'Hard surface', 'Screws': 'Hard surface', 'Vent slots': 'Hard surface',
};

const P = (name: string, tip: string, settings: Partial<BrushSettings>): BrushPreset => ({ format: 'texpaint-brush', version: 1, name, tip, settings });
export const STARTER_BRUSHES: BrushPreset[] = [
  P('Basic hard', 'round', { hardness: 0.9, flow: 1, spacing: 0.15, angle: 0, angleJitter: 0, followStroke: false, sizeJitter: 0, scatter: 0 }),
  P('Basic soft', 'round', { hardness: 0.1, flow: 0.6, spacing: 0.12, angleJitter: 0, followStroke: false, sizeJitter: 0, scatter: 0 }),
  P('Square', 'square', { hardness: 0.85, flow: 1, spacing: 0.2, angle: 0, angleJitter: 0, followStroke: true, sizeJitter: 0, scatter: 0 }),
  P('Splatter', 'builtin:splatter', { flow: 1, spacing: 0.8, angleJitter: 1, followStroke: false, sizeJitter: 0.4, scatter: 0.5 }),
  P('Grunge', 'builtin:grunge', { flow: 0.8, spacing: 0.6, angleJitter: 1, followStroke: false, sizeJitter: 0.3, scatter: 0.2 }),
  P('Scratches', 'builtin:scratches', { flow: 1, spacing: 0.9, angleJitter: 0.15, followStroke: true, sizeJitter: 0.3, scatter: 0.3 }),
  P('Dots', 'builtin:dots', { flow: 1, spacing: 1.2, angleJitter: 0, followStroke: true, sizeJitter: 0, scatter: 0 }),
  P('Chalk', 'builtin:chalk', { flow: 0.9, spacing: 0.25, angleJitter: 1, followStroke: false, sizeJitter: 0.1, scatter: 0 }),
  P('Cloud', 'builtin:cloud', { flow: 0.5, spacing: 0.35, angleJitter: 1, followStroke: false, sizeJitter: 0.3, scatter: 0.15 }),
  P('Star stamp', 'builtin:star', { flow: 1, spacing: 1.5, angleJitter: 0.3, followStroke: false, sizeJitter: 0.5, scatter: 0.6 }),
  // TextureCraft's brush presets (crates/paint/src/presets.rs). Its spacing is per diameter, TexPaint's per radius.
  ...TC_BRUSHES(),
  ...MORE_BRUSHES(),
  ...PAINTERLIKE_BRUSHES(),
].map((b) => ({ ...b, category: b.category ?? BRUSH_CATEGORY[b.name] ?? 'Basic' }));

/** A brush's shelf group: its own, else the built-in one with that name, else Basic (your own brushes: Custom). */
export function brushCategory(b: BrushPreset, custom = false): string {
  return b.category ?? BRUSH_CATEGORY[b.name] ?? STARTER_BRUSHES.find((x) => x.name === b.name)?.category ?? (custom ? 'Custom' : 'Basic');
}


/** v1.18: brushes covering Substance Painter's brush categories, on LocalPaint's own tips. */
function PAINTERLIKE_BRUSHES(): BrushPreset[] {
  const d = { hardness: 0.5, flow: 1, spacing: 0.3, angle: 0, angleJitter: 0, followStroke: false, sizeJitter: 0, scatter: 0 };
  const B = (cat: string, name: string, tip: string, o: Partial<BrushSettings>): BrushPreset => ({ ...P(name, tip, { ...d, ...o }), category: cat });
  const t = (id: string) => 'builtin:tc_' + id;
  return [
    // Artistic
    B('Artistic', 'Watercolour', t('watercolor'), { flow: 0.35, spacing: 0.25, angleJitter: 1, sizeJitter: 0.25, hueJitter: 0.03, valJitter: 0.12 }),
    B('Artistic', 'Watercolour wet edge', t('wet_edge'), { flow: 0.5, spacing: 0.35, angleJitter: 1, sizeJitter: 0.2 }),
    B('Artistic', 'Charcoal', t('charcoal'), { flow: 0.85, spacing: 0.18, followStroke: true, sizeJitter: 0.1 }),
    B('Artistic', 'Crayon', t('crayon'), { flow: 0.9, spacing: 0.12, followStroke: true }),
    B('Artistic', 'Oil paint', t('bristle'), { flow: 0.9, spacing: 0.08, followStroke: true, valJitter: 0.06 }),
    B('Artistic', 'Marker', 'round', { hardness: 0.75, flow: 0.45, spacing: 0.05, opacity: 0.85 }),
    B('Artistic', 'Hand-painted', 'round', { hardness: 0.55, flow: 0.35, spacing: 0.1, hueJitter: 0.04, satJitter: 0.08, valJitter: 0.12 }),
    B('Artistic', 'Ink splat', t('ink_splat'), { spacing: 1.6, angleJitter: 1, sizeJitter: 0.5, scatter: 0.8 }),
    // Dirt & dust
    B('Dirt & dust', 'Dirt', t('dirt_clump'), { flow: 0.7, spacing: 0.5, angleJitter: 1, sizeJitter: 0.4, scatter: 0.6 }),
    B('Dirt & dust', 'Dust specks', t('dust_specks'), { flow: 0.8, spacing: 0.7, angleJitter: 1, sizeJitter: 0.3, scatter: 0.5 }),
    B('Dirt & dust', 'Dust soft', 'builtin:cloud', { flow: 0.2, spacing: 0.3, angleJitter: 1, sizeJitter: 0.3, scatter: 0.3, flowJitter: 0.5 }),
    B('Dirt & dust', 'Sand', t('grain'), { flow: 0.7, spacing: 0.4, angleJitter: 1, sizeJitter: 0.2, scatter: 0.3 }),
    B('Dirt & dust', 'Fingerprints', t('fingerprint'), { flow: 0.55, spacing: 2.2, angleJitter: 0.35, sizeJitter: 0.25, scatter: 0.6 }),
    B('Dirt & dust', 'Smudged grime', t('smoke'), { flow: 0.35, spacing: 0.4, angleJitter: 1, sizeJitter: 0.3, flowJitter: 0.4 }),
    // Leaks & stains
    B('Leaks & stains', 'Leak drips', t('drip'), { spacing: 1.1, sizeJitter: 0.5, scatter: 0.35, flowJitter: 0.3 }),
    B('Leaks & stains', 'Coffee stains', t('stain_ring'), { flow: 0.8, spacing: 2.2, angleJitter: 1, sizeJitter: 0.5, scatter: 0.7 }),
    B('Leaks & stains', 'Water stains', t('wet_edge'), { flow: 0.35, spacing: 1.4, angleJitter: 1, sizeJitter: 0.5, scatter: 0.6 }),
    B('Leaks & stains', 'Ink splatter', t('ink_splat'), { spacing: 1.2, angleJitter: 1, sizeJitter: 0.7, scatter: 1 }),
    // Damage
    B('Damage', 'Scuffs', t('scuffs'), { flow: 0.8, spacing: 0.9, angleJitter: 1, sizeJitter: 0.3, scatter: 0.4 }),
    B('Damage', 'Edge chips', t('chips'), { spacing: 0.6, angleJitter: 1, sizeJitter: 0.6, scatter: 0.5 }),
    B('Damage', 'Scratches (fine)', t('scratches'), { flow: 0.7, spacing: 0.7, angleJitter: 0.1, followStroke: true, sizeJitter: 0.4, scatter: 0.4, flowJitter: 0.5 }),
    // Rust & paint
    B('Rust & paint', 'Rust flakes', t('rust_flake'), { spacing: 0.6, angleJitter: 1, sizeJitter: 0.4, scatter: 0.4, hueJitter: 0.02, valJitter: 0.15 }),
    B('Rust & paint', 'Spray paint', t('spray_fine'), { flow: 0.8, spacing: 0.15, angleJitter: 1 }),
    B('Rust & paint', 'Spray paint (soft)', 'round', { hardness: 0, flow: 0.15, spacing: 0.08 }),
    B('Rust & paint', 'Paint drips', t('drip'), { spacing: 1.4, sizeJitter: 0.6, scatter: 0.5 }),
    // Nature
    B('Nature', 'Grass', t('grass'), { spacing: 0.7, sizeJitter: 0.35, scatter: 0.5, hueJitter: 0.04, valJitter: 0.15 }),
    B('Nature', 'Moss', t('moss'), { flow: 0.8, spacing: 0.5, angleJitter: 1, sizeJitter: 0.4, scatter: 0.5, hueJitter: 0.03, valJitter: 0.12 }),
    B('Nature', 'Lichen spots', t('moss'), { flow: 0.6, spacing: 1.4, angleJitter: 1, sizeJitter: 0.6, scatter: 0.9, satJitter: 0.15 }),
    // Hard surface (one click per stamp works best: raise spacing or click)
    B('Hard surface', 'Rivet row', t('rivet_flat'), { hardness: 0.9, spacing: 2.6, followStroke: true }),
    B('Hard surface', 'Hex bolt', t('hex_bolt'), { spacing: 3 }),
    B('Hard surface', 'Seam line', t('seam'), { spacing: 0.25, followStroke: true }),
    B('Hard surface', 'Riveted seam', t('seam_riveted'), { spacing: 1.7, followStroke: true }),
    B('Hard surface', 'Weld bead', t('weld_bead'), { spacing: 0.35, followStroke: true, sizeJitter: 0.1 }),
    B('Hard surface', 'Panel line', t('panel_line'), { spacing: 3 }),
    B('Hard surface', 'Tread plate', t('tread_plate'), { spacing: 1.6 }),
    // FX
    B('FX', 'Smoke', t('smoke'), { flow: 0.4, spacing: 0.35, angleJitter: 1, sizeJitter: 0.4, scatter: 0.3, flowJitter: 0.4 }),
    B('FX', 'Glow dots', 'round', { hardness: 0, flow: 0.6, spacing: 1.5, sizeJitter: 0.6, scatter: 0.8 }),
  ];
}

/** v1.00: brushes like the ones in common texturing packs (surface imperfections, rust, cloth, fur, toon…). */
function MORE_BRUSHES(): BrushPreset[] {
  const d = { hardness: 0.5, flow: 1, spacing: 0.3, angle: 0, angleJitter: 0, followStroke: false, sizeJitter: 0, scatter: 0 };
  const B = (name: string, tip: string, o: Partial<BrushSettings>) => P(name, tip, { ...d, ...o });
  return [
    B('Gubby', 'builtin:gubby', { flow: 1, hardness: 1, spacing: 2.2 }),
    B('Leaks', 'builtin:leaks', { flow: 0.7, spacing: 1.1, sizeJitter: 0.3, scatter: 0.3 }),
    B('Rust blotches', 'builtin:rust', { flow: 0.8, spacing: 0.7, angleJitter: 1, sizeJitter: 0.4, scatter: 0.4 }),
    B('Hair - fur strands', 'builtin:fibers', { flow: 0.6, spacing: 0.25, followStroke: true, angleJitter: 0.08 }),
    B('Wood grain', 'builtin:woodgrain', { flow: 0.7, spacing: 0.4, followStroke: true }),
    B('Torn tape', 'builtin:tape', { flow: 1, spacing: 0.12, followStroke: true }),
    B('Pencil', 'builtin:pencil', { flow: 0.8, spacing: 0.08, hardness: 0.8 }),
    B('Bubbles', 'builtin:bubbles', { flow: 1, spacing: 1.3, angleJitter: 1, sizeJitter: 0.5, scatter: 0.6 }),
    B('Skin pores', 'builtin:pores', { flow: 0.6, spacing: 0.7, angleJitter: 1, sizeJitter: 0.3, scatter: 0.3 }),
    B('Gravel', 'builtin:gravel', { flow: 1, spacing: 0.9, angleJitter: 1, sizeJitter: 0.5, scatter: 0.5 }),
    B('Cloth weave', 'builtin:weave', { flow: 0.7, spacing: 0.5 }),
    B('Cross hatch (toon)', 'builtin:hatch', { flow: 0.8, spacing: 0.6, angle: 0 }),
    B('Hexagons', 'builtin:hex', { flow: 1, spacing: 1.4, hardness: 0.9 }),
    B('Dry cracks', 'builtin:cracks2', { flow: 1, spacing: 1.2, angleJitter: 1, sizeJitter: 0.4, scatter: 0.4 }),
    B('Sea sponge', 'builtin:sponge2', { flow: 0.75, spacing: 0.4, angleJitter: 1, sizeJitter: 0.2 }),
    B('Dents and bumps', 'builtin:dents', { flow: 0.7, spacing: 0.8, angleJitter: 1, sizeJitter: 0.4, scatter: 0.4 }),
    B('Soft smudge', 'builtin:smudge', { flow: 0.35, spacing: 0.15, followStroke: true }),
    B('Dust (soft spray)', 'builtin:tcp_spray', { flow: 0.3, spacing: 0.35, angleJitter: 1, sizeJitter: 0.4, scatter: 0.5, hardness: 0.3 }),
    B('Chipped paint', 'builtin:tc_chips', { flow: 1, spacing: 0.6, angleJitter: 1, sizeJitter: 0.6, scatter: 0.7 }),
  ];
}

function TC_BRUSHES(): BrushPreset[] {
  const d = { hardness: 0.5, flow: 1, spacing: 0.2, angle: 0, angleJitter: 0, followStroke: false, sizeJitter: 0, scatter: 0 };
  const T = (name: string, tip: string, o: Partial<BrushSettings>) => P(name, tip, { ...d, ...o, spacing: (o.spacing ?? 0.1) * 2 });
  return [
    T('Airbrush', 'round', { hardness: 0, flow: 0.12, spacing: 0.04 }),
    T('Dots (spaced)', 'round', { hardness: 0.9, spacing: 1.6 }),
    T('Dry brush', 'builtin:tcp_streaks', { followStroke: true, spacing: 0.04, flow: 0.5 }),
    T('Chalk (sponge)', 'builtin:tc_sponge', { angleJitter: 1, spacing: 0.15, flow: 0.7 }),
    T('Spray', 'builtin:tcp_spray', { angleJitter: 1, sizeJitter: 0.3, spacing: 0.3 }),
    T('Grunge spots', 'builtin:tc_grunge_spots', { angleJitter: 1, sizeJitter: 0.4, spacing: 0.4 }),
    T('Splatter drops', 'builtin:tc_splatter', { angleJitter: 1, sizeJitter: 0.5, scatter: 0.75, spacing: 1.2 }),
    T('Scratches (lines)', 'builtin:tc_scratches', { followStroke: true, angleJitter: 0.1, spacing: 0.5 }),
    T('Chips', 'builtin:tc_chips', { angleJitter: 1, sizeJitter: 0.5, scatter: 0.5, spacing: 0.8 }),
    T('Cracks', 'builtin:tc_cracks', { angleJitter: 1, spacing: 0.9 }),
    T('Drips', 'round', { hardness: 0.7, flow: 0.6 }),
    T('Stars', 'builtin:tc_star_5', { sizeJitter: 0.6, angleJitter: 1, scatter: 1, spacing: 1.5 }),
    T('Stitches', 'builtin:tc_stitches', { followStroke: true, spacing: 0.9 }),
    T('Rivets', 'builtin:tc_rivet', { spacing: 2 }),
    T('Bolts', 'builtin:tc_bolt_head', { spacing: 2 }),
    T('Screws', 'builtin:tc_screw_cross', { spacing: 2, angleJitter: 1 }),
    T('Fur', 'builtin:tc_fur', { followStroke: true, angleJitter: 0.15, spacing: 0.3 }),
    T('Leaves', 'builtin:tc_leaf', { angleJitter: 1, sizeJitter: 0.4, scatter: 0.6, spacing: 1 }),
    T('Vent slots', 'builtin:tc_vent', { followStroke: true, spacing: 1.2 }),
    T('Speckle', 'builtin:tc_speckle', { angleJitter: 1, spacing: 0.5 }),
  ];
}
