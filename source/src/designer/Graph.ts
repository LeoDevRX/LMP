import * as THREE from 'three';
import { NODE_LIB_GLSL, BUILTIN_NODES } from './nodelib';

/** Material Designer: node graphs of tileable textures, evaluated on the GPU. */

export type ParamKind = 'float' | 'int' | 'color' | 'bool' | 'enum';
export interface ParamDef { name: string; kind: ParamKind; min: number; max: number; def: number | number[]; options?: string[] }
export interface NodeDef {
  id: string; name: string; category: string; description: string;
  inputs: string[]; output: 'gray' | 'color'; params: ParamDef[]; code: string; builtin: boolean;
}
export interface GNode {
  id: number; type: string; x: number; y: number;
  params: Record<string, number | number[]>;
  inputs: Record<string, number | null>;
  /** Image node: the picture (data URL). */
  image?: string;
}
export interface GraphJSON {
  format: 'texpaint-graph'; version: 1; name: string; size: number;
  nodes: GNode[];
  /** Source of the custom (Shader Maker) nodes this graph uses, so it opens anywhere. */
  custom?: string[];
}
export const OUTPUT_CHANNELS = ['color', 'rough', 'metal', 'height', 'normal', 'emit'] as const;
export type OutCh = (typeof OUTPUT_CHANNELS)[number];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Read a node's comment header (see nodelib.ts). Throws with a readable message on bad headers. */
export function parseNode(code: string, builtin = false): NodeDef {
  const tag = (t: string) => [...code.matchAll(new RegExp(`^\\s*//\\s*@${t}\\s+(.*)$`, 'gm'))].map((m) => m[1].trim());
  const name = tag('name')[0] || 'Custom node';
  const params: ParamDef[] = [];
  for (const line of tag('param')) {
    const m = line.match(/^(\w+)\s*:\s*(float|int|color|bool|enum)\s*(?:\(([^)]*)\))?\s*(?:=\s*(.*))?$/);
    if (!m) throw new Error(`Can't read "@param ${line}". Use e.g. "@param scale: float(1, 64) = 6".`);
    const [, pname, kind, range = '', defS = ''] = m;
    const p: ParamDef = { name: pname, kind: kind as ParamKind, min: 0, max: 1, def: 0 };
    if (kind === 'enum') { p.options = range.split('|').map((x) => x.trim()).filter(Boolean); p.min = 0; p.max = Math.max(0, p.options.length - 1); p.def = Math.round(+defS || 0); }
    else if (kind === 'color') p.def = (defS || '0.5,0.5,0.5').split(',').map((x) => +x.trim() || 0).slice(0, 3);
    else if (kind === 'bool') { p.max = 1; p.def = +defS ? 1 : 0; }
    else { const r = range.split(',').map((x) => +x.trim()); p.min = Number.isFinite(r[0]) ? r[0] : 0; p.max = Number.isFinite(r[1]) ? r[1] : 1; p.def = defS ? +defS : p.min; }
    params.push(p);
  }
  const out = (tag('output')[0] || 'color').toLowerCase().startsWith('gray') ? 'gray' : 'color';
  if (!/vec4\s+node\s*\(\s*vec2\s+\w+\s*\)/.test(code)) throw new Error('A node needs a function "vec4 node(vec2 uv) { ... }".');
  return {
    id: (builtin ? 'builtin:' : 'custom:') + slug(name), name, category: tag('category')[0] || 'Custom', description: tag('description')[0] || '',
    inputs: tag('input').map((x) => x.split(/\s+/)[0]).filter(Boolean), output: out, params, code, builtin,
  };
}

export const BUILTIN_DEFS: NodeDef[] = BUILTIN_NODES.map((c) => parseNode(c, true));

const GLSL_TYPE: Record<ParamKind, string> = { float: 'float', int: 'int', enum: 'int', bool: 'bool', color: 'vec3' };

/** The fragment shader of a node (three.js ShaderMaterial dialect). Returns the source and the line where the user's code starts. */
export function nodeShader(def: NodeDef): { src: string; userLine: number } {
  const head: string[] = ['uniform vec2 texel;', NODE_LIB_GLSL];
  for (const i of def.inputs) head.push(`uniform sampler2D in_${i};`, `uniform bool has_${i};`, `vec4 input_${i}(vec2 uv) { return has_${i} ? texture2D(in_${i}, uv) : vec4(0.0, 0.0, 0.0, 1.0); }`);
  if (def.name === 'Image' && def.builtin) head.push('uniform sampler2D u_img;', 'uniform bool has_image;', 'vec4 image(vec2 uv) { return texture2D(u_img, uv); }');
  for (const p of def.params) head.push(`uniform ${GLSL_TYPE[p.kind]} u_${p.name};`);
  for (const p of def.params) head.push(`#define ${p.name} u_${p.name}`);
  head.push('varying vec2 vUv;');
  const pre = head.join('\n') + '\n';
  const src = pre + def.code + `\nvoid main() { vec4 c = node(vUv); gl_FragColor = ${def.output === 'gray' ? 'vec4(vec3(c.r), 1.0)' : 'vec4(c.rgb, 1.0)'}; }\n`;
  return { src, userLine: pre.split('\n').length };
}

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

/** Compile a node's shader on its own to get readable errors (line numbers relative to the user's code). */
export function checkNode(gl: WebGL2RenderingContext, def: NodeDef): string | null {
  const { src, userLine } = nodeShader(def);
  const prefix = '#version 300 es\nprecision highp float;\nprecision highp int;\nout highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n#define texture2D texture\n#define varying in\n';
  const sh = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(sh, prefix + src);
  gl.compileShader(sh);
  const ok = gl.getShaderParameter(sh, gl.COMPILE_STATUS);
  const log = gl.getShaderInfoLog(sh) || '';
  gl.deleteShader(sh);
  if (ok) return null;
  const off = prefix.split('\n').length - 1 + userLine - 1;
  return log.split('\n').filter(Boolean).map((l) => l.replace(/ERROR:\s*\d+:(\d+):/, (_, n) => `Line ${Math.max(1, +n - off)}:`)).join('\n');
}

type RT = THREE.WebGLRenderTarget;
function makeRT(size: number): RT {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
    magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, depthBuffer: false,
  });
  rt.texture.colorSpace = THREE.NoColorSpace;
  return rt;
}

/** Evaluates graphs. Node results are cached by a signature, so only what changed is re-rendered. */
export class GraphRunner {
  readonly renderer: THREE.WebGLRenderer;
  defs = new Map<string, NodeDef>();
  private mats = new Map<string, THREE.ShaderMaterial>();
  private rts = new Map<number, { rt: RT; sig: string }>();
  private images = new Map<string, THREE.Texture>();
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  private copyMat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: 'uniform sampler2D src; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(src, vUv).rgb, 1.0); }',
    uniforms: { src: { value: null } }, depthTest: false, depthWrite: false,
  });
  errors = new Map<string, string>();

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    for (const d of BUILTIN_DEFS) this.defs.set(d.id, d);
  }

  /** Add or replace a custom node. Returns an error message (and keeps the old version) if it doesn't compile. */
  setCustom(code: string): { def?: NodeDef; error?: string } {
    let def: NodeDef;
    try { def = parseNode(code, false); } catch (e: any) { return { error: e.message }; }
    const err = checkNode(this.renderer.getContext() as WebGL2RenderingContext, def);
    if (err) { this.errors.set(def.id, err); return { def, error: err }; }
    this.errors.delete(def.id);
    this.defs.set(def.id, def);
    this.mats.get(def.id)?.dispose();
    this.mats.delete(def.id);
    this.rts.forEach((v) => (v.sig = '')); // re-render everything (a node's code changed)
    return { def };
  }

  removeCustom(id: string) { this.defs.delete(id); this.mats.get(id)?.dispose(); this.mats.delete(id); }

  private mat(def: NodeDef): THREE.ShaderMaterial {
    let m = this.mats.get(def.id);
    if (m) return m;
    const uniforms: Record<string, THREE.IUniform> = { texel: { value: new THREE.Vector2() }, u_img: { value: null }, has_image: { value: false } };
    for (const i of def.inputs) { uniforms['in_' + i] = { value: null }; uniforms['has_' + i] = { value: false }; }
    for (const p of def.params) uniforms['u_' + p.name] = { value: p.kind === 'color' ? new THREE.Vector3() : p.kind === 'bool' ? false : 0 };
    m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: nodeShader(def).src, uniforms, depthTest: false, depthWrite: false });
    this.mats.set(def.id, m);
    return m;
  }

  private draw(mat: THREE.Material, target: RT | null) {
    this.quad.material = mat;
    const prev = this.renderer.getRenderTarget();
    const ac = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
    this.renderer.setRenderTarget(prev);
    this.renderer.autoClear = ac;
  }

  async imageTex(url: string): Promise<THREE.Texture> {
    let t = this.images.get(url);
    if (t) return t;
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob, { imageOrientation: 'flipY', colorSpaceConversion: 'none', premultiplyAlpha: 'none' } as ImageBitmapOptions);
    t = new THREE.Texture(bmp as any);
    t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
    this.images.set(url, t);
    return t;
  }

  /** Compile every node's shader (loading screen). */
  warmup() {
    const rt = makeRT(4);
    for (const d of this.defs.values()) { try { this.draw(this.mat(d), rt); } catch { /* skip */ } }
    try { this.draw(this.copyMat, rt); } catch { /* skip */ }
    rt.dispose();
  }

  /** Nodes in dependency order (cycles are cut). */
  order(g: GraphJSON): GNode[] {
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const out: GNode[] = [], state = new Map<number, number>();
    const visit = (n: GNode) => {
      const s = state.get(n.id);
      if (s === 2 || s === 1) return;
      state.set(n.id, 1);
      for (const src of Object.values(n.inputs)) { const m = src != null ? byId.get(src) : undefined; if (m) visit(m); }
      state.set(n.id, 2);
      out.push(n);
    };
    g.nodes.forEach(visit);
    return out;
  }

  /** Would connecting `from` → `to` make a loop? */
  wouldLoop(g: GraphJSON, from: number, to: number): boolean {
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const seen = new Set<number>();
    const up = (id: number): boolean => {
      if (id === to) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      const n = byId.get(id);
      return !!n && Object.values(n.inputs).some((s) => s != null && up(s));
    };
    return up(from);
  }

  /** Evaluate the graph; returns the ids of nodes that were re-rendered. */
  async run(g: GraphJSON): Promise<Set<number>> {
    const size = g.size;
    const sigs = new Map<number, string>();
    const changed = new Set<number>();
    const alive = new Set<number>();
    for (const n of this.order(g)) {
      alive.add(n.id);
      const def = this.defs.get(n.type);
      const insig = def ? def.inputs.map((i) => { const s = n.inputs[i]; return s != null ? sigs.get(s) ?? '' : '-'; }).join('|') : '';
      const sig = `${n.type}#${size}#${JSON.stringify(n.params)}#${n.image ? n.image.length + n.image.slice(-32) : ''}#${insig}#${def?.code.length ?? 0}`;
      sigs.set(n.id, sig);
      let slot = this.rts.get(n.id);
      if (slot && slot.sig === sig && slot.rt.width === size) continue;
      if (!slot || slot.rt.width !== size) { slot?.rt.dispose(); slot = { rt: makeRT(size), sig: '' }; this.rts.set(n.id, slot); }
      slot.sig = sig;
      changed.add(n.id);
      if (!def) { this.renderer.setRenderTarget(slot.rt); this.renderer.setClearColor(0xff00ff, 1); this.renderer.clear(); this.renderer.setRenderTarget(null); continue; }
      const m = this.mat(def), u = m.uniforms;
      (u.texel.value as THREE.Vector2).set(1 / size, 1 / size);
      for (const i of def.inputs) {
        const s = n.inputs[i];
        const src = s != null ? this.rts.get(s) : undefined;
        u['in_' + i].value = src ? src.rt.texture : null;
        u['has_' + i].value = !!src;
      }
      for (const p of def.params) {
        const v = n.params[p.name] ?? p.def;
        if (p.kind === 'color') (u['u_' + p.name].value as THREE.Vector3).fromArray(v as number[]);
        else if (p.kind === 'bool') u['u_' + p.name].value = !!v;
        else u['u_' + p.name].value = p.kind === 'float' ? +v : Math.round(+v);
      }
      if (def.name === 'Image' && def.builtin) {
        const t = n.image ? await this.imageTex(n.image).catch(() => null) : null;
        u.u_img.value = t; u.has_image.value = !!t;
      }
      this.draw(m, slot.rt);
      for (const i of def.inputs) u['in_' + i].value = null;
    }
    for (const [id, slot] of this.rts) if (!alive.has(id)) { slot.rt.dispose(); this.rts.delete(id); }
    return changed;
  }

  result(id: number): THREE.Texture | null { return this.rts.get(id)?.rt.texture ?? null; }

  /** The node feeding each output channel. */
  outputs(g: GraphJSON): Partial<Record<OutCh, number>> {
    const res: Partial<Record<OutCh, number>> = {};
    for (const n of g.nodes) if (n.type === 'builtin:output') res[OUTPUT_CHANNELS[Math.round(+(n.params.channel ?? 0))] ?? 'color'] = n.id;
    return res;
  }

  /** Copy a node's result into a new texture owned by the caller (for fill layers). */
  copyOut(id: number, size: number): THREE.WebGLRenderTarget | null {
    const src = this.rts.get(id);
    if (!src) return null;
    const rt = makeRT(size);
    this.copyMat.uniforms.src.value = src.rt.texture;
    this.draw(this.copyMat, rt);
    this.copyMat.uniforms.src.value = null;
    return rt;
  }

  /** Re-render a node's result into an existing target (same size). */
  copyInto(id: number, rt: RT): boolean {
    const src = this.rts.get(id);
    if (!src) return false;
    this.copyMat.uniforms.src.value = src.rt.texture;
    this.draw(this.copyMat, rt);
    this.copyMat.uniforms.src.value = null;
    return true;
  }

  private small?: RT;
  /** Draw a node's result into a 2D canvas (preview). */
  preview(id: number, cv: HTMLCanvasElement) {
    const src = this.rts.get(id);
    const n = cv.width;
    const ctx = cv.getContext('2d')!;
    if (!src) { ctx.fillStyle = '#222'; ctx.fillRect(0, 0, n, cv.height); return; }
    if (!this.small || this.small.width !== n) {
      this.small?.dispose();
      this.small = new THREE.WebGLRenderTarget(n, n, { type: THREE.UnsignedByteType, depthBuffer: false });
    }
    this.copyMat.uniforms.src.value = src.rt.texture;
    this.draw(this.copyMat, this.small);
    this.copyMat.uniforms.src.value = null;
    const px = new Uint8Array(n * n * 4);
    this.renderer.readRenderTargetPixels(this.small, 0, 0, n, n, px);
    const img = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++) img.data.set(px.subarray((n - 1 - y) * n * 4, (n - y) * n * 4), y * n * 4);
    ctx.putImageData(img, 0, 0);
  }

  /** Read a node's result as an 8-bit RGBA PNG blob (export). */
  async png(id: number, size: number): Promise<Blob | null> {
    const src = this.rts.get(id);
    if (!src) return null;
    const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.copyMat.uniforms.src.value = src.rt.texture;
    this.draw(this.copyMat, rt);
    const px = new Uint8Array(size * size * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    rt.dispose();
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    return new Promise((r) => cv.toBlob((b) => r(b), 'image/png'));
  }

  dispose() {
    this.rts.forEach((s) => s.rt.dispose()); this.rts.clear();
    this.mats.forEach((m) => m.dispose()); this.mats.clear();
    this.images.forEach((t) => t.dispose()); this.images.clear();
    this.small?.dispose();
  }
}

/** A new node of `def` with default parameters. */
export function newNode(def: NodeDef, id: number, x: number, y: number): GNode {
  const params: Record<string, number | number[]> = {};
  for (const p of def.params) params[p.name] = Array.isArray(p.def) ? [...p.def] : p.def;
  const inputs: Record<string, number | null> = {};
  for (const i of def.inputs) inputs[i] = null;
  return { id, type: def.id, x, y, params, inputs };
}

/** Starter graphs (the shelf's "graph presets"). */
export function presetGraphs(): GraphJSON[] {
  let id = 1;
  const N = (type: string, x: number, y: number, params: Record<string, number | number[]> = {}, inputs: Record<string, number | null> = {}): GNode => {
    const def = BUILTIN_DEFS.find((d) => d.id === 'builtin:' + type)!;
    const n = newNode(def, id++, x, y);
    Object.assign(n.params, params); Object.assign(n.inputs, inputs);
    return n;
  };
  const graph = (name: string, nodes: GNode[]): GraphJSON => ({ format: 'texpaint-graph', version: 1, name, size: 1024, nodes });
  const out: GraphJSON[] = [];
  {
    id = 1;
    const noise = N('noise', 40, 60, { scale: 4, octaves: 6, roughness: 0.55, seed: 11 });
    const scan = N('histogram_scan', 260, 60, { position: 0.45, contrast: 0.7 }, { input: noise.id });
    const grad = N('gradient_map', 260, 260, { low: [0.12, 0.04, 0.01], mid: [0.42, 0.16, 0.05], high: [0.62, 0.32, 0.12] }, { input: noise.id });
    const metal = N('uniform_color', 40, 460, { color: [0.62, 0.63, 0.64] });
    const blend = N('blend', 480, 160, { mode: 0 }, { foreground: grad.id, background: metal.id, mask: scan.id });
    const rough = N('levels', 480, 380, { outLow: 0.3, outHigh: 0.9 }, { input: scan.id });
    const metalOut = N('invert', 480, 560, {}, { input: scan.id });
    const h = N('blur', 700, 560, { radius: 2 }, { input: scan.id });
    out.push(graph('Rusty Metal', [noise, scan, grad, metal, blend, rough, metalOut, h,
      N('output', 720, 120, { channel: 0 }, { input: blend.id }), N('output', 720, 320, { channel: 1 }, { input: rough.id }),
      N('output', 900, 480, { channel: 2 }, { input: metalOut.id }), N('output', 900, 640, { channel: 3 }, { input: h.id })]));
  }
  {
    id = 1;
    const tiles = N('tiles', 40, 60, { columns: 4, rows: 8, gap: 0.05, bevel: 0.06, variation: 0.35 });
    const noise = N('noise', 40, 300, { scale: 12, seed: 3 });
    const tone = N('blend', 260, 160, { mode: 3, opacity: 0.35 }, { foreground: noise.id, background: tiles.id });
    const col = N('gradient_map', 480, 60, { low: [0.25, 0.24, 0.22], mid: [0.45, 0.14, 0.08], high: [0.62, 0.24, 0.14], midPoint: 0.3 }, { input: tone.id });
    const rough = N('levels', 480, 300, { outLow: 0.95, outHigh: 0.75 }, { input: tone.id });
    out.push(graph('Brick Wall', [tiles, noise, tone, col, rough,
      N('output', 700, 60, { channel: 0 }, { input: col.id }), N('output', 700, 300, { channel: 1 }, { input: rough.id }),
      N('output', 700, 500, { channel: 3 }, { input: tone.id })]));
  }
  {
    id = 1;
    const rings = N('wood_rings', 40, 60, { rings: 10, warp: 0.7 });
    const dn = N('directional_noise', 40, 300, { scale: 3, stretch: 24 });
    const mix = N('blend', 260, 160, { mode: 3, opacity: 0.5 }, { foreground: dn.id, background: rings.id });
    const col = N('gradient_map', 480, 60, { low: [0.2, 0.09, 0.03], mid: [0.45, 0.24, 0.1], high: [0.66, 0.45, 0.24], midPoint: 0.55 }, { input: mix.id });
    const rough = N('levels', 480, 300, { outLow: 0.7, outHigh: 0.5 }, { input: mix.id });
    out.push(graph('Wood Planks', [rings, dn, mix, col, rough,
      N('output', 700, 60, { channel: 0 }, { input: col.id }), N('output', 700, 300, { channel: 1 }, { input: rough.id }),
      N('output', 700, 500, { channel: 3 }, { input: mix.id })]));
  }
  {
    id = 1;
    const shape = N('shape', 40, 60, { shape: 0, size: 0.72, softness: 0.56, repeat: 26 });
    const noise = N('noise', 40, 300, { scale: 5 });
    const col = N('colorize', 260, 60, { black: [0.08, 0.08, 0.09], white: [0.85, 0.86, 0.87] }, { input: shape.id });
    out.push(graph('Metal Grid', [shape, noise, col,
      N('output', 480, 60, { channel: 0 }, { input: col.id }), N('output', 480, 260, { channel: 2 }, { input: shape.id }),
      N('output', 480, 460, { channel: 1 }, { input: noise.id }), N('output', 480, 640, { channel: 3 }, { input: shape.id })]));
  }
  return out;
}
