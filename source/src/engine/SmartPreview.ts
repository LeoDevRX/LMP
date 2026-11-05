import * as THREE from 'three';
import type { GPU } from './gpu';
import { TextureSet } from './TextureSet';
import { applySmartMaterial, SmartMaterial } from './Project';
import { previewModel } from './ModelLoader';

export interface PreviewMaps { size: number; color: Uint8Array; rough: Uint8Array; metal: Uint8Array; normal: Uint8Array; emit: Uint8Array }

/**
 * Real smart-material previews: the actual layer stack (fill layers, smart masks, generators)
 * is run on a small preview shape whose mesh maps (AO, curvature, thickness…) are baked once.
 */
export class SmartPreview {
  readonly geometry: THREE.BufferGeometry;
  private ts: TextureSet | null = null;
  private ready: Promise<void> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  graphBaker: TextureSet['graphBaker'] = null;
  scanResolver: TextureSet['scanResolver'] = null;

  constructor(private gpu: GPU, readonly size = 256) {
    this.geometry = previewModel().geometries[0];
  }

  private init() {
    return (this.ready ??= (async () => {
      const ts = new TextureSet(this.gpu, [this.geometry], this.size);
      ts.graphBaker = this.graphBaker;
      ts.scanResolver = this.scanResolver;
      ts.bakeMaps = { normal: false, height: false, wsn: true, id: true, ao: true, curv: true, pos: true, thick: true };
      ts.bakeSettings = { ...ts.bakeSettings, aoRays: 48, curvRays: 24 };
      await ts.bakeMeshMaps();
      this.ts = ts;
    })());
  }

  /** Bake once ahead of time (loading screen). */
  warmup() { return this.init(); }

  /** Run a smart material on the preview shape and read back its maps (rows bottom-up). One at a time. */
  maps(sm: SmartMaterial): Promise<PreviewMaps> {
    const job = this.chain.then(() => this.run(sm));
    this.chain = job.catch(() => undefined);
    return job;
  }

  private async run(sm: SmartMaterial): Promise<PreviewMaps> {
    await this.init();
    const ts = this.ts!;
    ts.layers = [];
    ts.activeId = -1;
    ts.clearHistory();
    // Neutral base under everything, like an untextured mesh in Substance.
    ts.addFillLayer('Base', { color: [0.5, 0.5, 0.5], rough: 0.6, metal: 0, height: 0.5 }, { color: true, rough: true, metal: true, height: true }, false);
    await applySmartMaterial(ts, sm);
    const s = this.size;
    const out: PreviewMaps = {
      size: s,
      color: ts.renderExport({ kind: 'rgb', ch: 'color' }, s),
      rough: ts.renderExport({ kind: 'gray', ch: 'rough' }, s),
      metal: ts.renderExport({ kind: 'gray', ch: 'metal' }, s),
      normal: ts.renderExport({ kind: 'normal', directX: false }, s),
      emit: ts.renderExport({ kind: 'rgb', ch: 'emit' }, s),
    };
    ts.layers = [];
    ts.clearHistory();
    return out;
  }
}
