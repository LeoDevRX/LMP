import * as THREE from 'three';

/**
 * Thickness map (like Substance's): from each texel, rays go into the model
 * (around the inverted normal); the average distance to the far side is the
 * local thickness. White = thick, black = thin. Runs on the CPU with the BVH.
 */
export interface ThicknessSettings {
  rays: number;
  /** Max distance as a fraction of the bounding box diagonal (Substance's default is 0.1–0.3). */
  maxDist: number;
}
export const DEFAULT_THICK: ThicknessSettings = { rays: 64, maxDist: 0.1 };

export async function bakeThickness(
  pos: Float32Array, nrm: Float32Array, size: number, targets: THREE.BufferGeometry[], diag: number,
  s: ThicknessSettings, onProgress?: (f: number) => void, isCancelled?: () => boolean,
): Promise<Uint8Array | null> {
  for (const g of targets) if (!(g as any).boundsTree) (g as any).computeBoundsTree();
  const maxD = Math.max(1e-4, s.maxDist * diag);
  const rays = Math.max(4, Math.min(128, Math.round(s.rays)));
  // Cosine-weighted hemisphere directions (z = up), a fixed Fibonacci set.
  const dirs: [number, number, number][] = [];
  for (let i = 0; i < rays; i++) {
    const u = (i + 0.5) / rays, phi = i * 2.399963;
    const r = Math.sqrt(u);
    dirs.push([r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(Math.max(0, 1 - u))]);
  }
  const N = size * size;
  const out = new Uint8Array(N * 4);
  const ray = new THREE.Ray();
  const n = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3();
  const eps = 1e-4 * diag;
  let last = performance.now();
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    if (pos[o + 3] < 0.5) continue;
    n.set(-nrm[o], -nrm[o + 1], -nrm[o + 2]);
    if (n.lengthSq() < 1e-8) continue;
    n.normalize();
    up.set(Math.abs(n.y) < 0.9 ? 0 : 1, Math.abs(n.y) < 0.9 ? 1 : 0, 0);
    t.crossVectors(up, n).normalize();
    b.crossVectors(n, t);
    // Rotate the set per texel so the noise doesn't form a pattern.
    const rot = ((i * 0.618034) % 1) * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot);
    let sum = 0;
    for (const [dx0, dy0, dz] of dirs) {
      const dx = dx0 * cr - dy0 * sr, dy = dx0 * sr + dy0 * cr;
      ray.direction.set(t.x * dx + b.x * dy + n.x * dz, t.y * dx + b.y * dy + n.y * dz, t.z * dx + b.z * dy + n.z * dz);
      ray.origin.set(pos[o] + n.x * eps, pos[o + 1] + n.y * eps, pos[o + 2] + n.z * eps);
      let d = maxD;
      for (const g of targets) {
        const hit = (g as any).boundsTree.raycastFirst(ray, THREE.DoubleSide, 0, maxD);
        if (hit && hit.distance < d) d = hit.distance;
      }
      sum += d;
    }
    const v = Math.min(1, sum / (rays * maxD));
    out[o] = out[o + 1] = out[o + 2] = Math.round(v * 255);
    out[o + 3] = 255;
    if ((i & 1023) === 0 && performance.now() - last > 30) {
      onProgress?.(i / N);
      await new Promise((r) => setTimeout(r, 0));
      if (isCancelled?.()) return null;
      last = performance.now();
    }
  }
  onProgress?.(1);
  return out;
}

/** Nearest-neighbour downsample of an RGBA float texel buffer (keeps covered texels). */
export function downsample(src: Float32Array, size: number, to: number): Float32Array {
  if (to >= size) return src;
  const k = size / to;
  const out = new Float32Array(to * to * 4);
  for (let y = 0; y < to; y++) for (let x = 0; x < to; x++) {
    const o = (y * to + x) * 4;
    // take the first covered texel in the block
    let found = -1;
    for (let yy = 0; yy < k && found < 0; yy++) for (let xx = 0; xx < k; xx++) {
      const q = ((Math.floor(y * k) + yy) * size + Math.floor(x * k) + xx) * 4;
      if (src[q + 3] > 0.5) { found = q; break; }
    }
    if (found >= 0) for (let c = 0; c < 4; c++) out[o + c] = src[found + c];
  }
  return out;
}
