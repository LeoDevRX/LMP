import * as THREE from 'three';

export interface UVOverlap {
  /** Grid size of the check. */
  n: number;
  /** How many triangles cover each cell (rows bottom-up, v = 0 first). */
  count: Uint8Array;
  /** Per geometry: 1 for triangles that overlap another one in UV space. */
  flags: Uint8Array[];
  /** Separate overlapping areas (connected spots). */
  areas: number;
  /** Overlapping triangles. */
  tris: number;
}

/**
 * Find UV triangles that sit on top of each other: rasterise every triangle into a grid and count.
 * Cells only touched along a shared edge don't count (pixel centres must be strictly inside).
 */
export function findUVOverlaps(geometries: THREE.BufferGeometry[], n = 512): UVOverlap {
  const count = new Uint8Array(n * n);
  const owner = new Int32Array(n * n).fill(-1);
  const flags: Uint8Array[] = [];
  const triList: { g: number; t: number; a: number[] }[] = [];
  let triBase = 0;
  const raster = (u0: number, v0: number, u1: number, v1: number, u2: number, v2: number, cell: (i: number) => void) => {
    const x0 = u0 * n, y0 = v0 * n, x1 = u1 * n, y1 = v1 * n, x2 = u2 * n, y2 = v2 * n;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) return;
    const s = area > 0 ? 1 : -1, eps = 1e-4;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(n - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(n - 1, Math.ceil(Math.max(y0, y1, y2)));
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const w0 = s * ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py));
        const w1 = s * ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py));
        const w2 = s * ((x0 - px) * (y1 - py) - (x1 - px) * (y0 - py));
        if (w0 > eps && w1 > eps && w2 > eps) cell(y * n + x);
      }
    }
  };
  geometries.forEach((g, gi) => {
    const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
    const idx = g.index;
    const tc = Math.floor((idx ? idx.count : g.attributes.position.count) / 3);
    flags.push(new Uint8Array(tc));
    if (!uv) return;
    const at = (i: number) => (idx ? idx.getX(i) : i);
    for (let t = 0; t < tc; t++) {
      const a = at(t * 3), b = at(t * 3 + 1), c = at(t * 3 + 2);
      const tri = [uv.getX(a), uv.getY(a), uv.getX(b), uv.getY(b), uv.getX(c), uv.getY(c)];
      triList.push({ g: gi, t, a: tri });
      const id = triBase + t;
      raster(tri[0], tri[1], tri[2], tri[3], tri[4], tri[5], (i) => {
        if (count[i] < 255) count[i]++;
        if (owner[i] === -1) owner[i] = id;
      });
    }
    triBase += tc;
  });
  // A triangle overlaps when any of its cells is covered more than once.
  let tris = 0;
  for (const { g, t, a } of triList) {
    let hit = false;
    raster(a[0], a[1], a[2], a[3], a[4], a[5], (i) => { if (count[i] > 1) hit = true; });
    if (hit) { flags[g][t] = 1; tris++; }
  }
  // Count connected spots (flood fill).
  const seen = new Uint8Array(n * n);
  let areas = 0;
  const stack: number[] = [];
  for (let i = 0; i < n * n; i++) {
    if (count[i] < 2 || seen[i]) continue;
    areas++;
    stack.push(i); seen[i] = 1;
    while (stack.length) {
      const k = stack.pop()!, x = k % n, y = (k / n) | 0;
      // 8 neighbours: the thin line between two triangles of one quad must not split a spot in two.
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        const j = yy * n + xx;
        if (!seen[j] && count[j] > 1) { seen[j] = 1; stack.push(j); }
      }
    }
  }
  return { n, count, flags, areas, tris };
}

/** Dark overlay texture for the 2D view: darker the more pieces stack up. */
export function overlapTexture(o: UVOverlap): THREE.DataTexture {
  const d = new Uint8Array(o.n * o.n * 4);
  for (let i = 0; i < o.n * o.n; i++) {
    const c = o.count[i];
    if (c < 2) continue;
    d[i * 4 + 3] = Math.min(240, 195 + (c - 2) * 25);
  }
  const t = new THREE.DataTexture(d, o.n, o.n, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** The overlapping triangles as a mesh (for marking them dark on the 3D model). */
export function overlapMesh(geometries: THREE.BufferGeometry[], o: UVOverlap): THREE.BufferGeometry | null {
  const pts: number[] = [];
  geometries.forEach((g, gi) => {
    const f = o.flags[gi], pos = g.attributes.position, idx = g.index;
    const at = (i: number) => (idx ? idx.getX(i) : i);
    for (let t = 0; t < f.length; t++) {
      if (!f[t]) continue;
      for (let k = 0; k < 3; k++) { const v = at(t * 3 + k); pts.push(pos.getX(v), pos.getY(v), pos.getZ(v)); }
    }
  });
  if (!pts.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}
