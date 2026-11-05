import * as THREE from 'three';
import RayWorker from './rayWorker?worker&inline';
import type { RayParams } from './rayWorker';
/** Floats per texel sample (keep in sync with rayWorker.ts). */
export const SAMPLE_FLOATS = 10;

/** A pool of ray-tracing workers holding a BVH of the meshes rays can hit. */
export class RayBaker {
  private workers: Worker[] = [];
  private ready: Promise<void>;
  private nextId = 1;
  cancelled = false;

  constructor(targets: THREE.BufferGeometry[]) {
    const n = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
    const geos = targets.map((g) => {
      const pos = g.attributes.position;
      const p = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) { p[i * 3] = pos.getX(i); p[i * 3 + 1] = pos.getY(i); p[i * 3 + 2] = pos.getZ(i); }
      const idx = g.index ? Uint32Array.from(g.index.array as ArrayLike<number>) : null;
      const na = g.attributes.normal;
      let nrm: Float32Array | null = null;
      if (na) { nrm = new Float32Array(na.count * 3); for (let i = 0; i < na.count; i++) { nrm[i * 3] = na.getX(i); nrm[i * 3 + 1] = na.getY(i); nrm[i * 3 + 2] = na.getZ(i); } }
      return { pos: p, index: idx, nrm };
    });
    const ready: Promise<void>[] = [];
    for (let i = 0; i < n; i++) {
      const w = new RayWorker();
      this.workers.push(w);
      ready.push(new Promise((res, rej) => {
        const on = (e: MessageEvent) => { if (e.data?.type === 'ready') { w.removeEventListener('message', on); res(); } };
        w.addEventListener('message', on);
        w.addEventListener('error', (e) => rej(new Error(e.message || 'ray worker failed')), { once: true });
      }));
      w.postMessage({ type: 'init', geos });
    }
    this.ready = Promise.all(ready).then(() => {});
  }

  /**
   * Trace every texel in `pts` (SAMPLE_FLOATS per texel: position, normal, geometric normal, texel size). Work is split in
   * chunks shared between the workers; returns one value per texel.
   */
  async run(pts: Float32Array, params: RayParams, onProgress?: (f: number) => void): Promise<Float32Array | null> {
    await this.ready;
    const n = pts.length / SAMPLE_FLOATS;
    const out = new Float32Array(n);
    const CH = 2048;
    let next = 0, done = 0;
    await Promise.all(this.workers.map((w) => new Promise<void>((res) => {
      const take = () => {
        if (this.cancelled || next >= n) { res(); return; }
        const first = next, count = Math.min(CH, n - next);
        next += count;
        const id = this.nextId++;
        const on = (e: MessageEvent) => {
          if (e.data?.type !== 'done' || e.data.id !== id) return;
          w.removeEventListener('message', on);
          out.set(e.data.out as Float32Array, first);
          done += count;
          onProgress?.(done / n);
          take();
        };
        w.addEventListener('message', on);
        w.postMessage({ type: 'job', id, first, params, pts: pts.slice(first * SAMPLE_FLOATS, (first + count) * SAMPLE_FLOATS) });
      };
      take();
    })));
    return this.cancelled ? null : out;
  }

  dispose() { this.workers.forEach((w) => w.terminate()); this.workers = []; }
}
