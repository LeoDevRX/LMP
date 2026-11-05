import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ChannelValues, Ch } from './TextureSet';
import { GLSL_NOISE, ProcSource, patternIndex } from './Procedural';
import { GenSettings, MaskFx, FX_BLENDS, genIndex, findSmartMask, defaultGen } from './Masks';

// A procedural channel on the preview sphere (equirect UVs of THREE.SphereGeometry).
const PROC_SPHERE = /* glsl */ `
uniform int kind; uniform float scale; uniform float seedF; uniform float contrast; uniform float balance; uniform bool inv;
uniform vec3 lo; uniform vec3 hi; uniform bool srgbOut;
varying vec2 vUv;
${GLSL_NOISE}
void main() {
  float u = vUv.x, v = 1.0 - vUv.y;
  vec3 p = vec3(-cos(6.2831853 * u) * sin(3.14159265 * v), cos(3.14159265 * v), sin(6.2831853 * u) * sin(3.14159265 * v));
  float t = patShape(triPattern(kind, p / 1.7320508, p, scale, uint(seedF)), contrast, balance, inv);
  vec3 c = mix(lo, hi, t);
  if (srgbOut) c = pow(max(c, vec3(0.0)), vec3(2.2));
  gl_FragColor = vec4(c, 1.0);
}`;

// A smart mask preview: a beveled tile where the generators are faked in 2D (edges at the border,
// cavities inside, "up" at the top) and patterns are real.
const MASK_TILE = /* glsl */ `
uniform int n; uniform int types[5]; uniform int pats[5]; uniform float amts[5]; uniform float cons[5]; uniform float noi[5];
uniform float scales[5]; uniform float seeds[5]; uniform int blends[5]; uniform float ops[5]; uniform bool invs[5]; uniform vec3 axes[5]; uniform bool outInv;
varying vec2 vUv;
${GLSL_NOISE}
float fxMix(int m, float a, float b) {
  if (m == 1) return a * b; if (m == 2) return max(a, b); if (m == 3) return min(a, b); if (m == 4) return a + b;
  if (m == 5) return a - b; if (m == 6) return 1.0 - (1.0 - a) * (1.0 - b); if (m == 8) return abs(a - b);
  if (m == 7) return a < 0.5 ? 2.0 * a * b : 1.0 - 2.0 * (1.0 - a) * (1.0 - b);
  return b;
}
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float border = 1.0 - max(abs(q.x), abs(q.y));
  float curv = 0.5 + 0.5 * (1.0 - smoothstep(0.0, 0.3, border)) - 0.35 * (1.0 - smoothstep(0.0, 0.05, abs(border - 0.45)));
  float ao = smoothstep(0.0, 0.25, border) * (1.0 - 0.6 * (1.0 - smoothstep(0.0, 0.06, abs(border - 0.45))));
  vec3 pn = vec3(q, 0.3);
  float acc = 0.0;
  for (int i = 0; i < 5; i++) {
    if (i >= n) break;
    int t = types[i];
    float raw = 0.5;
    if (t == 0) raw = clamp((curv - 0.5) * 2.0, 0.0, 1.0);
    else if (t == 1) raw = clamp((1.0 - ao) * 1.1 + max(0.0, 0.5 - curv) * 1.6, 0.0, 1.0);
    else if (t == 2) raw = 1.0 - ao;
    else if (t == 3) raw = axes[i].y < 0.0 ? 1.0 - vUv.y : vUv.y;
    else if (t == 4) raw = clamp(dot(normalize(vec3(0.0, 0.6, 0.8)), axes[i]) * 0.5 + 0.5 + (vUv.y - 0.5) * 0.8, 0.0, 1.0);
    else if (t == 5) raw = fbmValue(pn * 4.0, 5, uint(seeds[i]));
    else if (t == 6) raw = curv;
    else if (t == 8) raw = 1.0 - smoothstep(0.0, 0.5, length(q));
    else if (t == 9) raw = triPattern(pats[i], pn, vec3(0.0, 0.0, 1.0), scales[i], uint(seeds[i]));
    float v;
    if (t == 9) v = patShape(raw, cons[i] * 3.0, amts[i] - 0.5, false);
    else {
      if (noi[i] > 0.0 && t != 5) raw += (fbmPerlin(pn * 8.0, 4, uint(seeds[i])) - 0.5) * noi[i];
      float th = 1.0 - amts[i], soft = mix(0.5, 0.004, clamp(cons[i], 0.0, 1.0));
      v = smoothstep(th - soft, th + soft, raw);
    }
    if (invs[i]) v = 1.0 - v;
    acc = i == 0 ? v : clamp(acc + (fxMix(blends[i], acc, v) - acc) * ops[i], 0.0, 1.0);
  }
  if (outInv) acc = 1.0 - acc;
  vec3 c = mix(vec3(0.07, 0.075, 0.085), vec3(0.93), acc);
  gl_FragColor = vec4(pow(c, vec3(2.2)), 1.0);
}`;

/**
 * Renders material preview spheres for the assets shelf (own small WebGL
 * context, so it never disturbs the painting renderer).
 */
export class ThumbRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
  private sphere: THREE.Mesh;
  private mat: THREE.MeshStandardMaterial;
  private cache = new Map<string, string>();
  private queue: (() => void)[] = [];
  private busy = false;
  readonly size: number;

  constructor(size = 112) {
    this.size = size;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size, size, false);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.9;
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(2, 3, 2.5);
    this.scene.add(key);
    this.mat = new THREE.MeshStandardMaterial();
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), this.mat);
    this.scene.add(this.sphere);
    this.camera.position.set(0, 0, 4.1);
    this.camera.lookAt(0, 0, 0);
  }

  private srgb(c: [number, number, number]) {
    return new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
  }

  /** Data URL of a sphere with this material (cached by key). */
  material(key: string, v: ChannelValues, enabled?: Partial<Record<Ch, boolean>>): Promise<string> {
    return this.enqueue(key, () => {
      const m = this.mat;
      m.map = m.roughnessMap = m.metalnessMap = m.normalMap = null;
      m.color = this.srgb(enabled?.color === false ? [0.6, 0.6, 0.6] : v.color);
      m.roughness = enabled?.rough === false ? 0.5 : Math.max(0.04, v.rough);
      m.metalness = enabled?.metal === false ? 0 : v.metal;
      const e = enabled?.emit ? v.emit : [0, 0, 0];
      m.emissive = this.srgb(e as [number, number, number]);
      m.emissiveIntensity = 1.6;
      m.needsUpdate = true;
    });
  }

  /** A model's shape (built-in starter models) with a plain clay material. */
  model(key: string, geometries: THREE.BufferGeometry[]): Promise<string> {
    return this.enqueue(key, () => {
      const m = this.mat;
      m.map = m.roughnessMap = m.metalnessMap = m.normalMap = null; m.bumpMap = null;
      m.color = new THREE.Color(0.72, 0.7, 0.76); m.roughness = 0.55; m.metalness = 0; m.emissive = new THREE.Color(0, 0, 0);
      m.needsUpdate = true;
      const g = new THREE.Group();
      const box = new THREE.Box3();
      for (const geo of geometries) { geo.computeBoundingBox(); box.union(geo.boundingBox!); g.add(new THREE.Mesh(geo, m)); }
      const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2 || 1;
      g.position.copy(c).multiplyScalar(-1 / r); g.scale.setScalar(1 / r);
      g.rotation.set(0.35, -0.6, 0);
      const wrap = new THREE.Group(); wrap.add(g); wrap.rotation.set(0.3, -0.5, 0); g.rotation.set(0, 0, 0);
      this.sphere.visible = false;
      this.scene.add(wrap);
      this.after = () => { this.scene.remove(wrap); this.sphere.visible = true; };
    });
  }
  private after: (() => void) | null = null;

  private previewMesh?: THREE.Mesh;
  /** A real smart-material preview: the preview shape with the maps the layer stack produced. */
  previewMaps(key: string, geometry: THREE.BufferGeometry, px: { size: number; color: Uint8Array; rough: Uint8Array; metal: Uint8Array; normal: Uint8Array; emit: Uint8Array }): Promise<string> {
    const texs: THREE.DataTexture[] = [];
    const tex = (d: Uint8Array, srgb: boolean) => {
      const t = new THREE.DataTexture(d, px.size, px.size, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
      t.needsUpdate = true; texs.push(t); return t;
    };
    return this.enqueue(key, () => {
      if (!this.previewMesh) {
        geometry.computeBoundingSphere();
        const bs = geometry.boundingSphere!;
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
        const inner = new THREE.Group(); inner.add(mesh);
        mesh.position.copy(bs.center).multiplyScalar(-1);
        inner.scale.setScalar(1.12 / bs.radius);
        inner.rotation.set(0.52, -0.72, 0, 'XYZ');
        this.previewMesh = mesh;
        (mesh as any).wrap = inner;
      }
      const mesh = this.previewMesh, wrap = (mesh as any).wrap as THREE.Group;
      const m = mesh.material as THREE.MeshStandardMaterial;
      m.map = tex(px.color, true); m.roughnessMap = tex(px.rough, false); m.metalnessMap = tex(px.metal, false);
      m.normalMap = tex(px.normal, false); m.emissiveMap = tex(px.emit, true);
      m.color.setRGB(1, 1, 1); m.roughness = 1; m.metalness = 1; m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = 1.4;
      m.needsUpdate = true;
      this.sphere.visible = false;
      this.scene.add(wrap);
      this.after = () => { this.scene.remove(wrap); this.sphere.visible = true; texs.forEach((t) => t.dispose()); };
    });
  }

  /** Sphere textured with a texture set's maps (files are image Blobs). */
  async textures(key: string, files: Partial<Record<string, Blob>>): Promise<string> {
    if (this.cache.has(key)) return this.cache.get(key)!;
    const load = async (b: Blob | undefined, srgb: boolean) => {
      if (!b) return null;
      const bmp = await createImageBitmap(b, { imageOrientation: 'flipY' } as ImageBitmapOptions);
      const t = new THREE.Texture(bmp as any);
      t.flipY = false;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(2, 1);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    };
    const [map, rough, metal, normal] = await Promise.all([
      load(files.color, true), load(files.rough, false), load(files.metal, false), load(files.normal, false),
    ]);
    const url = await this.enqueue(key, () => {
      const m = this.mat;
      m.color = new THREE.Color(1, 1, 1);
      m.map = map; m.roughnessMap = rough; m.metalnessMap = metal; m.normalMap = normal;
      m.roughness = rough ? 1 : 0.6;
      m.metalness = metal ? 1 : 0;
      m.emissive = new THREE.Color(0, 0, 0);
      m.needsUpdate = true;
    });
    [map, rough, metal, normal].forEach((t) => t?.dispose());
    return url;
  }

  private enqueue(key: string, setup: () => void): Promise<string> {
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key)!);
    return new Promise((resolve) => {
      this.queue.push(() => {
        setup();
        this.renderer.render(this.scene, this.camera);
        const url = this.renderer.domElement.toDataURL('image/png');
        if (this.after) { this.after(); this.after = null; }
        this.cache.set(key, url);
        resolve(url);
      });
      this.pump();
    });
  }

  private pump() {
    if (this.busy) return;
    this.busy = true;
    const step = () => {
      const job = this.queue.shift();
      if (!job) { this.busy = false; return; }
      job();
      setTimeout(step, 4);
    };
    step();
  }

  forget(key: string) { this.cache.delete(key); }

  private quadScene?: { scene: THREE.Scene; cam: THREE.OrthographicCamera; mesh: THREE.Mesh };
  private renderQuad(mat: THREE.ShaderMaterial, w: number, h: number): THREE.WebGLRenderTarget {
    if (!this.quadScene) {
      const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
      scene.add(mesh);
      this.quadScene = { scene, cam, mesh };
    }
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType });
    this.quadScene.mesh.material = mat;
    this.renderer.setRenderTarget(rt);
    this.renderer.render(this.quadScene.scene, this.quadScene.cam);
    this.renderer.setRenderTarget(null);
    return rt;
  }
  private procMat?: THREE.ShaderMaterial;
  private procRT(p: ProcSource, color: boolean): THREE.WebGLRenderTarget {
    this.procMat ??= new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: PROC_SPHERE,
      uniforms: { kind: { value: 0 }, scale: { value: 1 }, seedF: { value: 0 }, contrast: { value: 1 }, balance: { value: 0 }, inv: { value: false },
        lo: { value: new THREE.Vector3() }, hi: { value: new THREE.Vector3() }, srgbOut: { value: false } },
    });
    const u = this.procMat.uniforms;
    u.kind.value = patternIndex(p.pattern); u.scale.value = p.scale; u.seedF.value = Math.max(0, Math.round(p.seed));
    u.contrast.value = p.contrast; u.balance.value = p.balance ?? 0; u.inv.value = !!p.invert;
    (u.lo.value as THREE.Vector3).fromArray(color ? p.low : [p.low[0], p.low[0], p.low[0]]);
    (u.hi.value as THREE.Vector3).fromArray(color ? p.high : [p.high[0], p.high[0], p.high[0]]);
    u.srgbOut.value = color;
    return this.renderQuad(this.procMat, 256, 128);
  }

  /** Sphere with a procedural fill layer's channels (patterns rendered on the sphere). */
  procMaterial(key: string, v: ChannelValues, procs: Partial<Record<Ch, ProcSource>>, enabled?: Partial<Record<Ch, boolean>>): Promise<string> {
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key)!);
    const rts: THREE.WebGLRenderTarget[] = [];
    return this.enqueue(key, () => {
      const m = this.mat;
      m.map = m.roughnessMap = m.metalnessMap = m.normalMap = null;
      m.bumpMap = null;
      m.color = this.srgb(v.color); m.roughness = Math.max(0.04, v.rough); m.metalness = enabled?.metal === false ? 0 : v.metal;
      m.emissive = new THREE.Color(0, 0, 0);
      if (procs.color) { const rt = this.procRT(procs.color, true); rts.push(rt); m.map = rt.texture; m.color = new THREE.Color(1, 1, 1); }
      if (procs.rough) {
        // roughnessMap reads green: a gray render works for it.
        const rt = this.procRT(procs.rough, false); rts.push(rt); m.roughnessMap = rt.texture; m.roughness = 1;
      }
      if (procs.height) { const rt = this.procRT(procs.height, false); rts.push(rt); m.bumpMap = rt.texture; m.bumpScale = 6; }
      m.needsUpdate = true;
    }).then((url) => { rts.forEach((r) => r.dispose()); this.mat.bumpMap = null; return url; });
  }

  private maskMat?: THREE.ShaderMaterial;
  /** Flat preview tile of a smart mask preset. */
  smartMask(id: string): Promise<string> {
    const key = 'mask:' + id;
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key)!);
    return new Promise((resolve) => {
      this.queue.push(() => {
        const p = findSmartMask(id);
        const g: GenSettings = p ? p.build() : defaultGen('noise');
        const list: GenSettings[] = [g, ...(g.fx ?? [])].slice(0, 5);
        this.maskMat ??= new THREE.ShaderMaterial({
          vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
          fragmentShader: MASK_TILE,
          uniforms: { n: { value: 0 }, types: { value: [0, 0, 0, 0, 0] }, pats: { value: [0, 0, 0, 0, 0] }, amts: { value: [0, 0, 0, 0, 0] },
            cons: { value: [0, 0, 0, 0, 0] }, noi: { value: [0, 0, 0, 0, 0] }, scales: { value: [1, 1, 1, 1, 1] }, seeds: { value: [0, 0, 0, 0, 0] },
            blends: { value: [0, 0, 0, 0, 0] }, ops: { value: [1, 1, 1, 1, 1] }, invs: { value: [false, false, false, false, false] },
            axes: { value: Array.from({ length: 5 }, () => new THREE.Vector3(0, 1, 0)) }, outInv: { value: false } },
        });
        const u = this.maskMat.uniforms;
        u.n.value = list.length;
        list.forEach((e, i) => {
          u.types.value[i] = genIndex(e.type); u.pats.value[i] = patternIndex(e.pattern ?? 'grunge');
          u.amts.value[i] = e.amount; u.cons.value[i] = e.contrast; u.noi.value[i] = e.noise; u.scales.value[i] = e.scale ?? 3;
          u.seeds.value[i] = Math.max(0, Math.round(e.seed)); u.invs.value[i] = e.invert;
          u.blends.value[i] = Math.max(0, FX_BLENDS.indexOf((e as MaskFx).blend ?? 'normal')); u.ops.value[i] = (e as MaskFx).opacity ?? 1;
          (u.axes.value[i] as THREE.Vector3).set(e.axis === 'x' ? 1 : 0, e.axis === 'y' ? 1 : 0, e.axis === 'z' ? 1 : 0).multiplyScalar(e.flip ? -1 : 1);
        });
        u.outInv.value = !!g.outInvert;
        const rt = this.renderQuad(this.maskMat, this.size, this.size);
        const px = new Uint8Array(this.size * this.size * 4);
        this.renderer.readRenderTargetPixels(rt, 0, 0, this.size, this.size, px);
        rt.dispose();
        const cv = document.createElement('canvas');
        cv.width = cv.height = this.size;
        const ctx = cv.getContext('2d')!;
        const img = ctx.createImageData(this.size, this.size);
        // linear → sRGB for display, flipped (GL rows are bottom-up)
        for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
          const s = ((this.size - 1 - y) * this.size + x) * 4, d = (y * this.size + x) * 4;
          for (let c = 0; c < 3; c++) img.data[d + c] = Math.round(Math.pow(px[s + c] / 255, 1 / 2.2) * 255);
          img.data[d + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        const url = cv.toDataURL('image/png');
        this.cache.set(key, url);
        resolve(url);
      });
      this.pump();
    });
  }
}
