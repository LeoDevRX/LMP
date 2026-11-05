/**
 * LocalPaint's CC0 grunge library (ambientCG surface imperfections, scratches, fingerprints, smears, leaks…),
 * published as grungeS-catalog.json + grunge-*.jpg in the "materials" release. Each grunge downloads the first
 * time a mask uses it; until then the generators use a procedural stand-in.
 */
import * as THREE from 'three';
import { imageTexture } from './images';
import { parseGrungeRef } from './PainterGen';

export interface GrungeInfo { id: string; name: string; cat: string; file: string; source?: string; thumb?: string }

export class GrungeLib {
  private byCat = new Map<string, GrungeInfo[]>();
  private tex = new Map<string, THREE.Texture>();
  private pending = new Set<string>();
  private failed = new Set<string>();
  /** Called when a grunge texture arrives (masks that use it re-render). */
  onLoad: (() => void) | null = null;
  loaded = false;

  constructor(private native: any) {}

  async loadCatalog() {
    if (!this.native?.grungeCatalog) return;
    try {
      const cat = await this.native.grungeCatalog();
      for (const g of (cat?.grunges ?? []) as GrungeInfo[]) {
        if (!this.byCat.has(g.cat)) this.byCat.set(g.cat, []);
        this.byCat.get(g.cat)!.push(g);
      }
      this.loaded = true;
      if (this.byCat.size) this.onLoad?.();
    } catch { /* offline: procedural stand-ins */ }
  }

  /** Categories without scans of their own borrow from a similar one. */
  private static ALIAS: Record<string, string> = { dust: 'spots', leaks: 'soft', smear: 'stains', rust: 'concrete' };
  private list(cat: string) {
    const l = this.byCat.get(cat);
    if (l?.length) return l;
    const a = GrungeLib.ALIAS[cat];
    return a ? this.byCat.get(a) : undefined;
  }
  count(cat: string) { return this.byCat.get(cat)?.length ?? 0; }
  /** All grunges, for pickers. */
  all(): GrungeInfo[] { return [...this.byCat.values()].flat(); }
  byId(id: string): GrungeInfo | null { for (const l of this.byCat.values()) { const g = l.find((x) => x.id === id); if (g) return g; } return null; }
  info(cat: string, n: number): GrungeInfo | null {
    const list = this.list(cat);
    return list?.length ? list[n % list.length] : null;
  }

  /** The texture for a `grunge:<cat>/<n>` reference, or null (and start downloading it). */
  resolve(ref: string): THREE.Texture | null {
    const { cat, n, id } = parseGrungeRef(ref);
    const g = (id ? this.byId(id) : null) ?? this.info(cat, n);
    if (!g) return null;
    const t = this.tex.get(g.id);
    if (t) return t;
    if (!this.pending.has(g.id) && !this.failed.has(g.id)) void this.fetch(g);
    return null;
  }

  private async fetch(g: GrungeInfo) {
    this.pending.add(g.id);
    try {
      const bytes: Uint8Array | null = await this.native.grungeGet(g.file);
      if (!bytes?.length) throw new Error('no data');
      const t = await imageTexture(bytes.slice().buffer, g.file);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      t.needsUpdate = true;
      this.tex.set(g.id, t);
      this.onLoad?.();
    } catch {
      this.failed.add(g.id);
    } finally {
      this.pending.delete(g.id);
    }
  }
}
