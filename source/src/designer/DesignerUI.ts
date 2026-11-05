import * as THREE from 'three';
import { el, slider, select, toast, hexToRgb, rgbToHex, pickFile } from '../ui';
import { GraphRunner, GraphJSON, GNode, NodeDef, newNode, presetGraphs, OUTPUT_CHANNELS, OutCh, BUILTIN_DEFS, parseNode } from './Graph';

/**
 * Material Designer (node graph of tileable textures) and Shader Maker (write custom nodes in GLSL),
 * in the spirit of Material Painter's. The graph drives a fill layer's channels live.
 */
export interface DesignerHost {
  renderer: THREE.WebGLRenderer;
  /** Put the graph's outputs on a fill layer (new, or the linked one). Returns the layer's name. */
  applyGraph(g: GraphJSON, runner: GraphRunner, mode: 'new' | 'linked'): Promise<string | null>;
  /** Name of the fill layer this graph is linked to (null = none). */
  linkedName(): string | null;
  saveJSON(fileName: string, data: unknown): Promise<string>;
  rebuildSide(): void;
}

const CUSTOM_KEY = 'tp-custom-nodes';
const NEW_NODE = `// @name My Node
// @category Custom
// @description What this node does
// @input input
// @output gray
// @param scale: float(1, 64) = 6
// @param rings: float(1, 20) = 6
// @param seed: int(0, 1000) = 0
vec4 node(vec2 uv) {
  vec3 c = tcells(uv, scale, 1.0, float(seed));
  float n = tfbm(uv, scale * 2.0, 4, 0.5, float(seed) + 7.0);
  float r = 0.5 + 0.5 * sin((c.x + n * 0.3) * rings * 6.2831853);
  if (has_input) r *= input_input(uv).r;
  return vec4(r);
}
`;

export class Designer {
  runner: GraphRunner;
  graph: GraphJSON;
  sel = new Set<number>();
  tab: 'graph' | 'shader' = 'graph';
  live = true;
  private host: DesignerHost;
  private root: HTMLElement;
  private view!: HTMLElement;
  private world!: HTMLElement;
  private wires!: SVGSVGElement;
  private pan = { x: 40, y: 40, z: 1 };
  private nodeEls = new Map<number, { box: HTMLElement; cv: HTMLCanvasElement; ins: Map<string, HTMLElement>; out: HTMLElement }>();
  private nextId = 1;
  private pending = false;
  private bigPreview?: HTMLCanvasElement;
  customCodes: string[] = [];
  /** Shader Maker state. */
  private editing: { code: string; builtin: boolean; id?: string } = { code: NEW_NODE, builtin: false };
  private shaderPreview?: HTMLCanvasElement;
  private shaderErr?: HTMLElement;
  private drag: { kind: 'node' | 'pan' | 'wire' | 'box'; sx: number; sy: number; ids?: number[]; orig?: [number, number][]; from?: number; px?: number; py?: number; tmp?: SVGPathElement } | null = null;

  constructor(root: HTMLElement, host: DesignerHost) {
    this.root = root;
    this.host = host;
    this.runner = new GraphRunner(host.renderer);
    try { this.customCodes = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '[]'); } catch { this.customCodes = []; }
    for (const c of this.customCodes) this.runner.setCustom(c);
    this.graph = presetGraphs()[0];
    this.syncNextId();
    this.build();
  }

  private syncNextId() { this.nextId = Math.max(0, ...this.graph.nodes.map((n) => n.id)) + 1; }
  private saveCustom() { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(this.customCodes)); } catch { /* private mode */ } }

  // ---------------------------------------------------------------- graph lifecycle

  async open(g: GraphJSON) {
    this.graph = structuredClone(g);
    for (const c of g.custom ?? []) {
      const d = (() => { try { return parseNode(c); } catch { return null; } })();
      if (d && !this.runner.defs.has(d.id)) { this.runner.setCustom(c); if (!this.customCodes.includes(c)) { this.customCodes.push(c); this.saveCustom(); } }
    }
    this.sel.clear();
    this.syncNextId();
    this.needFit = true;
    this.build();
    await this.changed(false);
  }

  private needFit = true;
  /** Zoom and pan so every node is visible. */
  fit() {
    if (!this.view || !this.graph.nodes.length) return;
    const r = this.view.getBoundingClientRect();
    if (r.width < 50) return;
    const xs = this.graph.nodes.map((n) => n.x), ys = this.graph.nodes.map((n) => n.y);
    const x0 = Math.min(...xs) - 20, y0 = Math.min(...ys) - 20, x1 = Math.max(...xs) + 170, y1 = Math.max(...ys) + 130;
    const z = Math.min(1.2, Math.max(0.2, Math.min(r.width / (x1 - x0), (r.height - 40) / (y1 - y0))));
    this.pan = { z, x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: (r.height - 30 - (y1 - y0) * z) / 2 - y0 * z };
    this.applyPan();
    this.needFit = false;
  }

  private busy = false;
  private again = false;
  private againPush = false;
  /** Re-evaluate after an edit (coalesced per frame); pushes to the linked layer when live. */
  async changed(push = true): Promise<void> {
    if (this.busy) { this.again = true; this.againPush ||= push; return; }
    this.busy = true;
    try {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const g = this.graph;
      g.custom = this.customUsed();
      const done = await this.runner.run(g);
      for (const id of done) { const e = this.nodeEls.get(id); if (e) this.runner.preview(id, e.cv); }
      this.updateBig();
      if (push && this.live && this.host.linkedName()) await this.host.applyGraph(g, this.runner, 'linked');
    } finally { this.busy = false; }
    if (this.again) { const p = this.againPush; this.again = false; this.againPush = false; await this.changed(p); }
  }

  private customUsed(): string[] | undefined {
    const ids = new Set(this.graph.nodes.map((n) => n.type).filter((t) => t.startsWith('custom:')));
    const out = [...ids].map((id) => this.runner.defs.get(id)?.code).filter((c): c is string => !!c);
    return out.length ? out : undefined;
  }

  // ---------------------------------------------------------------- layout

  build() {
    this.root.innerHTML = '';
    this.nodeEls.clear();
    const tabs = el('div', { class: 'dz-tabs' },
      el('button', { class: this.tab === 'graph' ? 'on' : '', onclick: () => { this.tab = 'graph'; this.build(); this.host.rebuildSide(); this.changed(false); } }, 'Graph'),
      el('button', { class: this.tab === 'shader' ? 'on' : '', onclick: () => { this.tab = 'shader'; this.build(); this.host.rebuildSide(); } }, 'Shader Maker'),
      el('span', { class: 'grow' }),
      this.tab === 'graph' ? el('button', { title: 'Show all nodes', onclick: () => this.fit() }, 'Frame all') : null,
      this.tab === 'graph' ? el('span', { class: 'dz-name' }, this.graph.name) : null,
    );
    this.root.append(tabs);
    if (this.tab === 'shader') { this.buildShader(); return; }
    this.view = el('div', { class: 'dz-view' });
    this.world = el('div', { class: 'dz-world' });
    this.wires = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.wires.classList.add('dz-wires');
    this.world.append(this.wires);
    this.view.append(this.world, el('div', { class: 'dz-hint' }, 'Drag from an output (right dot) to an input · MMB / RMB drag pans · wheel zooms · Delete removes · double-click adds a node'));
    this.root.append(this.view);
    for (const n of this.graph.nodes) this.addNodeEl(n);
    this.applyPan();
    this.redrawWires();
    this.bindView();
    if (this.needFit) requestAnimationFrame(() => this.fit());
  }

  private applyPan() {
    this.world.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.pan.z})`;
  }

  private toWorld(cx: number, cy: number) {
    const r = this.view.getBoundingClientRect();
    return { x: (cx - r.left - this.pan.x) / this.pan.z, y: (cy - r.top - this.pan.y) / this.pan.z };
  }

  private addNodeEl(n: GNode) {
    const def = this.runner.defs.get(n.type);
    const box = el('div', { class: 'dz-node' + (this.sel.has(n.id) ? ' sel' : '') + (n.type === 'builtin:output' ? ' out' : '') + (!def ? ' missing' : '') });
    box.style.left = n.x + 'px'; box.style.top = n.y + 'px';
    const title = n.type === 'builtin:output' ? `Output · ${['Base color', 'Roughness', 'Metallic', 'Height', 'Normal', 'Emissive'][Math.round(+(n.params.channel ?? 0))]}` : def?.name ?? `Missing: ${n.type}`;
    const out = el('span', { class: 'dz-sock out', title: 'Drag to an input' });
    const head = el('div', { class: 'dz-head' }, el('span', { class: 'grow' }, title), n.type === 'builtin:output' ? null : out);
    const cv = el('canvas', { width: 96, height: 96, class: 'dz-prev' }) as HTMLCanvasElement;
    const ins = new Map<string, HTMLElement>();
    const insBox = el('div', { class: 'dz-ins' });
    for (const i of def?.inputs ?? []) {
      const s = el('span', { class: 'dz-sock in' + (n.inputs[i] != null ? ' on' : ''), title: n.inputs[i] != null ? 'Drag away (or click) to disconnect' : 'Drop a wire here' });
      ins.set(i, s);
      insBox.append(el('div', { class: 'dz-in' }, s, el('span', {}, i)));
    }
    box.append(head, el('div', { class: 'dz-body' }, insBox, cv));
    this.world.append(box);
    this.nodeEls.set(n.id, { box, cv, ins, out });
    this.runner.preview(n.id, cv);

    head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).classList.contains('dz-sock')) return;
      e.stopPropagation();
      if (e.shiftKey || e.ctrlKey) { if (this.sel.has(n.id)) this.sel.delete(n.id); else this.sel.add(n.id); }
      else if (!this.sel.has(n.id)) { this.sel.clear(); this.sel.add(n.id); }
      this.refreshSel();
      const ids = [...this.sel];
      const orig = ids.map((id) => { const m = this.graph.nodes.find((q) => q.id === id)!; return [m.x, m.y] as [number, number]; });
      this.drag = { kind: 'node', sx: e.clientX, sy: e.clientY, ids, orig };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    });
    box.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).classList.contains('dz-sock')) return;
      e.stopPropagation();
      if (!this.sel.has(n.id) || this.sel.size > 1) { if (!e.shiftKey && !e.ctrlKey) this.sel.clear(); this.sel.add(n.id); this.refreshSel(); }
    });
    out.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tmp.classList.add('dz-wire', 'tmp');
      this.wires.append(tmp);
      this.drag = { kind: 'wire', sx: e.clientX, sy: e.clientY, from: n.id, tmp };
      this.view.setPointerCapture(e.pointerId);
    });
    for (const [name, s] of ins) {
      s.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        const src = n.inputs[name];
        if (src == null) return;
        // Pick the wire up from this input.
        n.inputs[name] = null;
        const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        tmp.classList.add('dz-wire', 'tmp');
        this.wires.append(tmp);
        this.drag = { kind: 'wire', sx: e.clientX, sy: e.clientY, from: src, tmp };
        this.view.setPointerCapture(e.pointerId);
        s.classList.remove('on');
        this.redrawWires();
        this.changed();
      });
    }
  }

  private refreshSel() {
    for (const [id, e] of this.nodeEls) e.box.classList.toggle('sel', this.sel.has(id));
    this.host.rebuildSide();
  }

  private sockPos(id: number, input?: string): { x: number; y: number } | null {
    const e = this.nodeEls.get(id);
    if (!e) return null;
    const s = input ? e.ins.get(input) : e.out;
    if (!s) return null;
    const n = this.graph.nodes.find((q) => q.id === id)!;
    // Position relative to the node box (layout units, unaffected by zoom).
    let x = s.offsetLeft + s.offsetWidth / 2, y = s.offsetTop + s.offsetHeight / 2;
    let p = s.offsetParent as HTMLElement | null;
    while (p && p !== e.box) { x += p.offsetLeft; y += p.offsetTop; p = p.offsetParent as HTMLElement | null; }
    return { x: n.x + x, y: n.y + y };
  }

  private wirePath(a: { x: number; y: number }, b: { x: number; y: number }) {
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
    return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
  }

  redrawWires() {
    const svg = this.wires;
    svg.querySelectorAll('path:not(.tmp)').forEach((p) => p.remove());
    for (const n of this.graph.nodes) {
      for (const [inp, src] of Object.entries(n.inputs)) {
        if (src == null) continue;
        const a = this.sockPos(src), b = this.sockPos(n.id, inp);
        if (!a || !b) continue;
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', this.wirePath(a, b));
        p.classList.add('dz-wire');
        svg.append(p);
      }
    }
  }

  private bindView() {
    const v = this.view;
    v.addEventListener('contextmenu', (e) => e.preventDefault());
    v.addEventListener('pointerdown', (e) => {
      if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
        this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: this.pan.x, py: this.pan.y };
        v.setPointerCapture(e.pointerId);
      } else if (e.button === 0) {
        if (!e.shiftKey && !e.ctrlKey && this.sel.size) { this.sel.clear(); this.refreshSel(); }
      }
    });
    v.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      if (d.kind === 'pan') { this.pan.x = d.px! + e.clientX - d.sx; this.pan.y = d.py! + e.clientY - d.sy; this.applyPan(); }
      else if (d.kind === 'node') {
        const dx = (e.clientX - d.sx) / this.pan.z, dy = (e.clientY - d.sy) / this.pan.z;
        d.ids!.forEach((id, k) => {
          const n = this.graph.nodes.find((q) => q.id === id)!;
          n.x = Math.round(d.orig![k][0] + dx); n.y = Math.round(d.orig![k][1] + dy);
          const b = this.nodeEls.get(id)!.box; b.style.left = n.x + 'px'; b.style.top = n.y + 'px';
        });
        this.redrawWires();
      } else if (d.kind === 'wire') {
        const a = this.sockPos(d.from!);
        if (a) d.tmp!.setAttribute('d', this.wirePath(a, this.toWorld(e.clientX, e.clientY)));
      }
    });
    const end = (e: PointerEvent) => {
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      if (d.kind === 'wire') {
        d.tmp?.remove();
        const t = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.classList.contains('dz-sock') && x.classList.contains('in')) as HTMLElement | undefined;
        if (t) {
          for (const [id, ne] of this.nodeEls) for (const [name, s] of ne.ins) if (s === t) {
            if (id === d.from || this.runner.wouldLoop(this.graph, d.from!, id)) { toast('That would make a loop', true); return; }
            this.graph.nodes.find((q) => q.id === id)!.inputs[name] = d.from!;
            s.classList.add('on');
          }
        }
        this.redrawWires();
        this.changed();
      }
    };
    v.addEventListener('pointerup', end);
    v.addEventListener('pointercancel', end);
    v.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = v.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const z = Math.min(2.5, Math.max(0.2, this.pan.z * Math.exp(-e.deltaY * 0.0015)));
      this.pan.x = mx - ((mx - this.pan.x) * z) / this.pan.z;
      this.pan.y = my - ((my - this.pan.y) * z) / this.pan.z;
      this.pan.z = z;
      this.applyPan();
    }, { passive: false });
    v.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('.dz-node')) return;
      this.quickAdd(e.clientX, e.clientY);
    });
    v.tabIndex = 0;
    v.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel.size) { e.preventDefault(); e.stopPropagation(); this.deleteSel(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && this.sel.size) { e.preventDefault(); e.stopPropagation(); this.duplicateSel(); }
    });
    v.addEventListener('pointerenter', () => v.focus({ preventScroll: true }));
    // Drag a node type from the library onto the graph.
    v.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('text/x-tp-node')) e.preventDefault(); });
    v.addEventListener('drop', (e) => {
      const t = e.dataTransfer?.getData('text/x-tp-node');
      if (!t) return;
      e.preventDefault(); e.stopPropagation();
      const p = this.toWorld(e.clientX, e.clientY);
      this.addNode(t, p.x - 60, p.y - 20);
    });
  }

  private quickAdd(cx: number, cy: number) {
    document.querySelectorAll('.dz-quick').forEach((x) => x.remove());
    const p = this.toWorld(cx, cy);
    const search = el('input', { type: 'search', placeholder: 'Add node…' }) as HTMLInputElement;
    const list = el('div', { class: 'dz-quick-list' });
    const menu = el('div', { class: 'dz-quick' }, search, list);
    const r = this.view.getBoundingClientRect();
    menu.style.left = cx - r.left + 'px'; menu.style.top = cy - r.top + 'px';
    const fill = () => {
      list.innerHTML = '';
      const q = search.value.toLowerCase();
      for (const d of this.runner.defs.values()) {
        if (q && !d.name.toLowerCase().includes(q) && !d.category.toLowerCase().includes(q)) continue;
        list.append(el('button', { onclick: () => { menu.remove(); this.addNode(d.id, p.x, p.y); } }, el('b', {}, d.name), el('span', { class: 'muted' }, ' ' + d.category)));
      }
    };
    search.addEventListener('input', fill);
    search.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') menu.remove();
      if (e.key === 'Enter') (list.querySelector('button') as HTMLButtonElement | null)?.click();
    });
    fill();
    this.view.append(menu);
    search.focus();
    setTimeout(() => document.addEventListener('pointerdown', function off(ev) { if (!menu.contains(ev.target as Node)) { menu.remove(); document.removeEventListener('pointerdown', off); } }), 0);
  }

  addNode(type: string, x?: number, y?: number) {
    const def = this.runner.defs.get(type);
    if (!def) return;
    if (x === undefined || y === undefined) {
      const r = this.view?.getBoundingClientRect();
      const c = r ? this.toWorld(r.left + r.width / 2, r.top + r.height / 2) : { x: 200, y: 200 };
      x = c.x - 60 + (Math.random() - 0.5) * 40; y = c.y - 40 + (Math.random() - 0.5) * 40;
    }
    const n = newNode(def, this.nextId++, Math.round(x), Math.round(y));
    // Wire a selected node into the new one's first input (fast chaining).
    const s = [...this.sel][0];
    if (s != null && def.inputs.length && s !== n.id && this.graph.nodes.find((q) => q.id === s)?.type !== 'builtin:output') n.inputs[def.inputs[0]] = s;
    this.graph.nodes.push(n);
    this.sel.clear(); this.sel.add(n.id);
    if (this.tab !== 'graph') { this.tab = 'graph'; this.build(); } else { this.addNodeEl(n); this.redrawWires(); this.refreshSel(); }
    this.host.rebuildSide();
    this.changed();
  }

  deleteSel() {
    const ids = this.sel;
    this.graph.nodes = this.graph.nodes.filter((n) => !ids.has(n.id));
    for (const n of this.graph.nodes) for (const k of Object.keys(n.inputs)) if (n.inputs[k] != null && ids.has(n.inputs[k]!)) n.inputs[k] = null;
    this.sel.clear();
    this.build();
    this.host.rebuildSide();
    this.changed();
  }

  duplicateSel() {
    const map = new Map<number, number>();
    const copies: GNode[] = [];
    for (const n of this.graph.nodes) if (this.sel.has(n.id)) { const c = structuredClone(n); c.id = this.nextId++; c.x += 30; c.y += 30; map.set(n.id, c.id); copies.push(c); }
    for (const c of copies) for (const k of Object.keys(c.inputs)) { const s = c.inputs[k]; if (s != null && map.has(s)) c.inputs[k] = map.get(s)!; }
    this.graph.nodes.push(...copies);
    this.sel = new Set(copies.map((c) => c.id));
    this.build();
    this.host.rebuildSide();
    this.changed();
  }

  // ---------------------------------------------------------------- side panels

  /** Left column: graphs and the node library. */
  buildLeft(host: HTMLElement) {
    host.innerHTML = '';
    const body = el('div', { class: 'dock-body dz-left' });
    if (this.tab === 'shader') {
      body.append(el('h4', {}, 'Your shaders'),
        el('button', { class: 'primary', onclick: () => { this.editing = { code: NEW_NODE.replace('My Node', 'My Node ' + (this.customCodes.length + 1)), builtin: false }; this.build(); } }, '+ New shader'));
      for (const c of this.customCodes) {
        let d: NodeDef | null = null;
        try { d = parseNode(c); } catch { /* broken */ }
        body.append(el('button', { class: 'dz-lib-item' + (this.editing.id === d?.id ? ' on' : ''), onclick: () => { this.editing = { code: c, builtin: false, id: d?.id }; this.build(); this.host.rebuildSide(); } }, d?.name ?? 'Broken shader'));
      }
      if (!this.customCodes.length) body.append(el('p', { class: 'note' }, 'None yet. Write one, or open a built-in node below and make an editable copy.'));
      body.append(el('h4', {}, 'Built-in (read-only)'));
      for (const cat of [...new Set(BUILTIN_DEFS.map((d) => d.category))]) {
        const det = el('details', {}, el('summary', {}, cat));
        for (const d of BUILTIN_DEFS.filter((x) => x.category === cat)) det.append(el('button', { class: 'dz-lib-item', onclick: () => { this.editing = { code: d.code, builtin: true, id: d.id }; this.build(); } }, d.name));
        body.append(det);
      }
      host.append(body);
      return;
    }
    const graphs = el('div', { class: 'dz-graphs' },
      el('div', { class: 'row' },
        el('button', { class: 'grow', onclick: () => this.open({ format: 'texpaint-graph', version: 1, name: 'New graph', size: this.graph.size, nodes: [] }) }, 'New'),
        el('button', { class: 'grow', onclick: async () => {
          const f = await pickFile('.tpgraph,application/json');
          if (!f) return;
          try { const g = JSON.parse(await f.text()) as GraphJSON; if (g.format !== 'texpaint-graph') throw new Error('not a graph'); await this.open(g); toast(`Opened “${g.name}”`); } catch (e: any) { toast('Could not open graph: ' + e.message, true); }
        } }, 'Open…'),
        el('button', { class: 'grow', onclick: async () => { this.graph.custom = this.customUsed(); toast(await this.host.saveJSON(`${this.graph.name.replace(/[^\w\- ]+/g, '_') || 'graph'}.tpgraph`, this.graph)); } }, 'Save…')),
      el('div', { class: 'row' }, el('label', {}, 'Presets'), select<string>([{ value: '', label: 'Open a preset graph…' }, ...presetGraphs().map((g) => ({ value: g.name, label: g.name }))], '',
        (v) => { const g = presetGraphs().find((x) => x.name === v); if (g) this.open({ ...g, size: this.graph.size }); })),
    );
    body.append(el('h4', {}, 'Graph'), graphs, el('h4', {}, 'Nodes'), el('p', { class: 'note' }, 'Click to add (wired to the selected node), or drag onto the graph.'));
    const cats = [...new Set([...this.runner.defs.values()].map((d) => d.category))];
    for (const cat of cats) {
      const det = el('details', { open: cat === 'Generators' || cat === 'Outputs' || cat === 'Custom' }, el('summary', {}, cat));
      for (const d of [...this.runner.defs.values()].filter((x) => x.category === cat)) {
        const b = el('button', { class: 'dz-lib-item', title: d.description, onclick: () => this.addNode(d.id) }, d.name);
        b.draggable = true;
        b.addEventListener('dragstart', (e) => { e.dataTransfer!.setData('text/x-tp-node', d.id); e.dataTransfer!.effectAllowed = 'copy'; });
        det.append(b);
      }
      body.append(det);
    }
    host.append(body);
  }

  /** Right column: selected node's parameters, preview, outputs. */
  buildRight(host: HTMLElement) {
    host.innerHTML = '';
    const body = el('div', { class: 'dock-body dz-right' });
    if (this.tab === 'shader') {
      this.shaderPreview = el('canvas', { width: 256, height: 256, class: 'dz-big' }) as HTMLCanvasElement;
      body.append(el('h4', {}, 'Preview'), this.shaderPreview, el('p', { class: 'note' }, 'Updates as you type. Unconnected inputs see a test noise.'));
      host.append(body);
      this.previewShader();
      return;
    }
    const g = this.graph;
    const name = el('input', { type: 'text', value: g.name }) as HTMLInputElement;
    name.addEventListener('change', () => { g.name = name.value || 'Graph'; this.build(); });
    const linked = this.host.linkedName();
    const liveBox = el('input', { type: 'checkbox', checked: this.live }) as HTMLInputElement;
    liveBox.addEventListener('change', () => { this.live = liveBox.checked; });
    body.append(
      el('h4', {}, 'Graph'),
      el('div', { class: 'row' }, el('label', {}, 'Name'), name),
      el('div', { class: 'row' }, el('label', {}, 'Size'), select<number>([256, 512, 1024, 2048].map((s) => ({ value: s, label: `${s} × ${s}` })), g.size, (v) => { g.size = v; this.changed(); })),
      el('div', { class: 'row' },
        el('button', { class: 'primary grow', onclick: async () => { const n = await this.host.applyGraph(g, this.runner, 'new'); if (n) { toast(`Added fill layer “${n}” driven by this graph`); this.host.rebuildSide(); } } }, 'Add as fill layer'),
        el('button', { class: 'grow', disabled: !linked, onclick: async () => { const n = await this.host.applyGraph(g, this.runner, 'linked'); if (n) toast(`Updated “${n}”`); } }, 'Update layer')),
      el('label', { class: 'check-row' }, liveBox, linked ? ` Live: changes update “${linked}”` : ' Live update (select a graph fill layer to link it)'),
      el('div', { class: 'row' }, el('button', { class: 'grow', onclick: () => this.exportOutputs() }, 'Export outputs (PNG)…')),
    );
    const outs = this.runner.outputs(g);
    if (!Object.keys(outs).length) body.append(el('p', { class: 'note warn' }, 'Add an Output node (Outputs → Output) and pick its channel, so the graph drives a layer.'));
    const sel = [...this.sel].map((id) => g.nodes.find((n) => n.id === id)).filter((n): n is GNode => !!n);
    if (sel.length === 1) {
      const n = sel[0];
      const def = this.runner.defs.get(n.type);
      this.bigPreview = el('canvas', { width: 256, height: 256, class: 'dz-big' }) as HTMLCanvasElement;
      body.append(el('h4', {}, def?.name ?? n.type), ...(def?.description ? [el('p', { class: 'note' }, def.description)] : []), this.bigPreview);
      this.updateBig();
      if (def) body.append(...this.paramControls(n, def));
      if (def?.name === 'Image' && def.builtin) body.append(el('div', { class: 'row' }, el('button', { class: 'grow', onclick: async () => {
        const f = await pickFile('image/*');
        if (!f) return;
        n.image = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(f); });
        this.changed();
      } }, n.image ? 'Replace image…' : 'Load image…')));
      body.append(el('div', { class: 'row' }, el('button', { class: 'grow', onclick: () => this.duplicateSel() }, 'Duplicate'), el('button', { class: 'grow', onclick: () => this.deleteSel() }, 'Delete')));
      if (def && !def.builtin) body.append(el('button', { class: 'link', onclick: () => { this.editing = { code: def.code, builtin: false, id: def.id }; this.tab = 'shader'; this.build(); this.host.rebuildSide(); } }, 'Edit this node in Shader Maker'));
    } else {
      this.bigPreview = undefined;
      body.append(el('p', { class: 'note' }, sel.length ? `${sel.length} nodes selected` : 'Select a node to edit its settings.'));
    }
    host.append(body);
  }

  private updateBig() {
    const id = [...this.sel][0];
    if (this.bigPreview && id != null) this.runner.preview(id, this.bigPreview);
  }

  private paramControls(n: GNode, def: NodeDef): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const p of def.params) {
      const v = n.params[p.name] ?? p.def;
      const label = p.name.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
      if (p.kind === 'color') {
        const inp = el('input', { type: 'color', value: rgbToHex(v as [number, number, number]) }) as HTMLInputElement;
        inp.addEventListener('input', () => { n.params[p.name] = hexToRgb(inp.value); this.changed(); });
        out.push(el('div', { class: 'row' }, el('label', {}, label), inp));
      } else if (p.kind === 'enum') {
        out.push(el('div', { class: 'row' }, el('label', {}, label), select<number>((p.options ?? []).map((o, i) => ({ value: i, label: o })), Math.round(+v), (x) => {
          n.params[p.name] = x; this.changed();
          if (n.type === 'builtin:output') { this.build(); }
        })));
      } else if (p.kind === 'bool') {
        const c = el('input', { type: 'checkbox', checked: !!v }) as HTMLInputElement;
        c.addEventListener('change', () => { n.params[p.name] = c.checked ? 1 : 0; this.changed(); });
        out.push(el('label', { class: 'check-row' }, c, ' ' + label));
      } else {
        const step = p.kind === 'int' ? 1 : (p.max - p.min) / 200;
        out.push(slider(label, { min: p.min, max: p.max, step, value: +v, fmt: (x) => (p.kind === 'int' ? x.toFixed(0) : x.toFixed(3)), onInput: (x) => { n.params[p.name] = x; this.changed(); } }).el);
      }
    }
    return out;
  }

  private async exportOutputs() {
    const outs = this.runner.outputs(this.graph);
    let k = 0;
    for (const [ch, id] of Object.entries(outs) as [OutCh, number][]) {
      const b = await this.runner.png(id, this.graph.size);
      if (!b) continue;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `${this.graph.name}_${ch}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      k++;
    }
    toast(k ? `Exported ${k} map${k > 1 ? 's' : ''}` : 'No outputs to export', !k);
  }

  // ---------------------------------------------------------------- Shader Maker

  private buildShader() {
    const ed = this.editing;
    let def: NodeDef | null = null;
    try { def = parseNode(ed.code, ed.builtin); } catch { /* shown below */ }
    const title = el('div', { class: 'dz-shader-bar' },
      el('b', {}, (def?.name ?? 'Shader') + (ed.builtin ? ' (built-in, read-only)' : '')),
      el('span', { class: 'grow' }),
      ed.builtin
        ? el('button', { class: 'primary', onclick: () => { this.editing = { code: ed.code.replace(/@name\s+(.*)/, (_, nm) => `@name ${nm} Copy`).replace(/@category\s+.*/, '@category Custom'), builtin: false }; this.build(); } }, 'Make editable copy')
        : el('button', { class: 'primary', onclick: () => this.saveShader(false) }, 'Save'),
      !ed.builtin ? el('button', { onclick: () => this.saveShader(true) }, 'Save & add to graph') : null,
      !ed.builtin && ed.id ? el('button', { onclick: () => {
        this.customCodes = this.customCodes.filter((c) => { try { return parseNode(c).id !== ed.id; } catch { return true; } });
        this.saveCustom(); this.runner.removeCustom(ed.id!); this.editing = { code: NEW_NODE, builtin: false }; this.build(); this.host.rebuildSide(); toast('Shader deleted');
      } }, 'Delete') : null,
      el('button', { onclick: async () => toast(await this.host.saveJSON(`${(def?.name ?? 'node').replace(/[^\w\- ]+/g, '_')}.tpnode`, { format: 'texpaint-node', version: 1, code: ed.code })) }, 'Export…'),
      el('button', { onclick: async () => {
        const f = await pickFile('.tpnode,.glsl,.txt,application/json');
        if (!f) return;
        let code = await f.text();
        try { const j = JSON.parse(code); if (j.format === 'texpaint-node') code = j.code; } catch { /* plain GLSL */ }
        this.editing = { code, builtin: false }; this.build();
      } }, 'Import…'),
    );
    const lines = el('div', { class: 'dz-lines' });
    const ta = el('textarea', { class: 'dz-code', spellcheck: false, readOnly: ed.builtin }) as HTMLTextAreaElement;
    ta.value = ed.code;
    const hl = el('pre', { class: 'dz-hl' });
    const syncLines = () => {
      const n = ta.value.split('\n').length;
      lines.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
      hl.innerHTML = highlight(ta.value) + '\n';
      lines.scrollTop = ta.scrollTop; hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft;
    };
    ta.addEventListener('scroll', () => { lines.scrollTop = ta.scrollTop; hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; });
    let timer = 0;
    ta.addEventListener('input', () => { ed.code = ta.value; syncLines(); clearTimeout(timer); timer = window.setTimeout(() => this.previewShader(), 300); });
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); ed.code = ta.value; syncLines(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); this.saveShader(false); }
    });
    this.shaderErr = el('pre', { class: 'dz-err' });
    const help = el('details', { class: 'dz-help' }, el('summary', {}, 'How to write a node'),
      el('pre', {}, `Header lines describe the node:
  // @name, @category, @description
  // @input name        → input_name(uv) returns vec4, has_name says if it's connected
  // @output gray|color
  // @param name: float(min, max) = default   (also int, bool, enum(A|B|C), color = r, g, b)
Then write  vec4 node(vec2 uv) { ... }  — uv is 0..1 across the (tiling) texture.
Helpers: tnoise(uv, period, seed), tperlin(...), tfbm(uv, period, octaves, roughness, seed),
  tcells(uv, period, jitter, seed) → (F1, F2, id), hash12(cell, seed), hash22, rot2(p, angle),
  lum(rgb), shapeAt(q, kind, size, softness), texel (= 1 / size). Use whole-number periods to tile.`));
    this.root.append(title, el('div', { class: 'dz-editor' }, lines, el('div', { class: 'dz-code-wrap' }, hl, ta)), this.shaderErr, help);
    syncLines();
    this.previewShader();
  }

  private testGraph(def: NodeDef): GraphJSON {
    const nodes: GNode[] = [];
    let id = 1;
    const noiseDef = BUILTIN_DEFS.find((d) => d.id === 'builtin:noise')!;
    const test = newNode(noiseDef, id++, 0, 0);
    nodes.push(test);
    const n = newNode(def, id++, 0, 0);
    for (const i of def.inputs) n.inputs[i] = test.id;
    nodes.push(n);
    return { format: 'texpaint-graph', version: 1, name: 'preview', size: 256, nodes };
  }

  private shaderRunner?: GraphRunner;
  private async previewShader() {
    const ed = this.editing;
    const err = this.shaderErr;
    let def: NodeDef;
    try { def = parseNode(ed.code, ed.builtin); } catch (e: any) { if (err) { err.textContent = e.message; err.classList.add('on'); } return; }
    this.shaderRunner ??= new GraphRunner(this.host.renderer);
    const r = this.shaderRunner;
    const res = ed.builtin ? {} : r.setCustom(ed.code);
    if ((res as any).error) { if (err) { err.textContent = (res as any).error; err.classList.add('on'); } return; }
    if (err) { err.textContent = '✓ Compiles. The preview updates as you type.'; err.classList.remove('on'); }
    const useDef = r.defs.get(def.id);
    if (!useDef) return;
    const g = this.testGraph(useDef);
    await r.run(g);
    if (this.shaderPreview) r.preview(2, this.shaderPreview);
  }

  private saveShader(addToGraph: boolean) {
    const ed = this.editing;
    const res = this.runner.setCustom(ed.code);
    if (res.error) { toast('Fix the errors first: ' + res.error.split('\n')[0], true); return; }
    const id = res.def!.id;
    this.customCodes = this.customCodes.filter((c) => { try { const d = parseNode(c); return d.id !== id && d.id !== ed.id; } catch { return true; } });
    this.customCodes.push(ed.code);
    this.saveCustom();
    ed.id = id;
    toast(`Saved “${res.def!.name}” — it's in the node library under ${res.def!.category}`);
    if (addToGraph) { this.tab = 'graph'; this.build(); this.addNode(id); }
    else this.host.rebuildSide();
    this.changed();
  }
}

/** Tiny GLSL highlighter for the Shader Maker. */
function highlight(src: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const KW = /\b(if|else|for|while|return|break|continue|const|in|out|inout|uniform|true|false)\b/;
  const TY = /\b(float|int|uint|bool|vec[234]|ivec[234]|uvec[234]|mat[234]|void|sampler2D)\b/;
  const FN = /\b(sin|cos|tan|atan|pow|exp|log|sqrt|abs|floor|ceil|fract|mod|min|max|clamp|mix|step|smoothstep|length|distance|dot|cross|normalize|radians|texture2D|tnoise|tperlin|tfbm|tcells|hash12|hash22|rot2|lum|shapeAt|input_\w+)\b/;
  return src.split('\n').map((line) => {
    const c = line.indexOf('//');
    const code = c >= 0 ? line.slice(0, c) : line, com = c >= 0 ? line.slice(c) : '';
    const toks = code.split(/(\b\w+\b|\d+\.?\d*)/);
    const out = toks.map((t) => {
      if (KW.test(t) && t.match(KW)![0] === t) return `<span class="k">${esc(t)}</span>`;
      if (TY.test(t) && t.match(TY)![0] === t) return `<span class="t">${esc(t)}</span>`;
      if (FN.test(t) && t.match(FN)![0] === t) return `<span class="f">${esc(t)}</span>`;
      if (/^\d+\.?\d*$/.test(t)) return `<span class="n">${t}</span>`;
      return esc(t);
    }).join('');
    const cm = com ? `<span class="c">${esc(com).replace(/(@\w+)/g, '<b>$1</b>')}</span>` : '';
    return out + cm;
  }).join('\n');
}

export { OUTPUT_CHANNELS };
