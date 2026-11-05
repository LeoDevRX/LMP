import * as THREE from 'three';
import type { Region, ViewSource } from './Viewport';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Shows one channel flat, dims texels outside the UV islands, and draws the
// brush footprint (3D sphere footprint, or a 2D circle when hovering here).
const FRAG = /* glsl */ `
uniform sampler2D map;
uniform sampler2D posMap;
uniform int mode;
uniform int cursorMode;
uniform vec3 cCenter;
uniform float cRadius;
uniform vec2 cUV;
uniform float cRadiusUV;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(map, vUv).rgb;
  if (mode == 1) c = vec3(c.r);
  if (mode == 2) c = vec3(c.g);
  if (mode == 4) c = vec3(c.b);
  if (mode == 3) c = mix(vec3(0.92, 0.18, 0.12), vec3(0.16, 0.42, 0.95), step(0.5, c.g));
  vec4 p = texture2D(posMap, vUv);
  if (p.a < 0.5) c *= 0.32;
  float d = -1.0;
  if (cursorMode == 1 && p.a > 0.5) d = length(p.xyz - cCenter) / cRadius;
  if (cursorMode == 2) d = length(vUv - cUV) / cRadiusUV;
  if (d >= 0.0) {
    if (d < 1.0) c = mix(c, vec3(1.0), 0.10);
    float w = max(fwidth(d), 1e-4) * 1.5;
    c = mix(c, vec3(1.0), (1.0 - smoothstep(0.0, w, abs(d - 1.0))) * 0.9);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

/** Flat 2D view of the texture with the UV layout drawn on top. */
export class UVView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  region: Region = { x: 0, y: 0, w: 1, h: 1 };
  /** Center of the view in UV space and visible UV height. */
  center = new THREE.Vector2(0.5, 0.5);
  viewH = 1.12;
  showWire = true;

  private mat: THREE.ShaderMaterial;
  private wire: THREE.LineSegments | null = null;
  private wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, toneMapped: false });
  private frameLine: THREE.LineLoop;

  constructor() {
    this.scene.background = new THREE.Color(0x141518);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        map: { value: null }, posMap: { value: null }, mode: { value: 0 },
        cursorMode: { value: 0 }, cCenter: { value: new THREE.Vector3() }, cRadius: { value: 0.1 },
        cUV: { value: new THREE.Vector2() }, cRadiusUV: { value: 0.03 },
      },
    });
    const plane = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);
    const quad = new THREE.Mesh(plane, this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);

    const fg = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0.1), new THREE.Vector3(1, 0, 0.1), new THREE.Vector3(1, 1, 0.1), new THREE.Vector3(0, 1, 0.1),
    ]);
    this.frameLine = new THREE.LineLoop(fg, new THREE.LineBasicMaterial({ color: 0x5a6068, toneMapped: false }));
    this.scene.add(this.frameLine);
  }

  private pathLine: THREE.Line | null = null;
  private pathDots: THREE.Points | null = null;

  /** Path (vector) tool drawn in UV space. */
  setPath(points: THREE.Vector2[], curve: THREE.Vector2[]) {
    if (!this.pathLine) {
      this.pathLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xc4a0ff, toneMapped: false }));
      this.pathDots = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xffffff, size: 7, sizeAttenuation: false, toneMapped: false }));
      this.pathLine.frustumCulled = this.pathDots.frustumCulled = false;
      this.scene.add(this.pathLine, this.pathDots);
    }
    const v3 = (a: THREE.Vector2[]) => a.map((p) => new THREE.Vector3(p.x, p.y, 0.2));
    this.pathLine.geometry.dispose(); this.pathDots!.geometry.dispose();
    this.pathLine.geometry = new THREE.BufferGeometry().setFromPoints(v3(curve));
    this.pathDots!.geometry = new THREE.BufferGeometry().setFromPoints(v3(points));
  }

  private selMesh: THREE.Mesh | null = null;
  /** Red overlay of the triangles a box selection will fill (geometry laid out in UV, or null). */
  setSelection(g: THREE.BufferGeometry | null) {
    if (this.selMesh) { this.selMesh.geometry.dispose(); this.scene.remove(this.selMesh); (this.selMesh.material as THREE.Material).dispose(); this.selMesh = null; }
    if (!g) return;
    g.translate(0, 0, 0.15);
    this.selMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthTest: false, toneMapped: false }));
    this.selMesh.frustumCulled = false;
    this.selMesh.renderOrder = 5;
    this.scene.add(this.selMesh);
  }

  /** Build the UV wireframe from the model's triangles (shared edges drawn once). */
  setModel(geometries: THREE.BufferGeometry[]) {
    if (this.wire) { this.scene.remove(this.wire); this.wire.geometry.dispose(); }
    const seen = new Set<string>();
    const pts: number[] = [];
    const q = (u: number, v: number) => `${Math.round(u * 65535)}:${Math.round(v * 65535)}`;
    for (const g of geometries) {
      const uv = g.attributes.uv;
      const idx = g.index;
      const n = idx ? idx.count : uv.count;
      const at = (i: number) => (idx ? idx.getX(i) : i);
      for (let t = 0; t + 2 < n; t += 3) {
        const tri = [at(t), at(t + 1), at(t + 2)];
        for (let e = 0; e < 3; e++) {
          const a = tri[e], b = tri[(e + 1) % 3];
          const ua = uv.getX(a), va = uv.getY(a), ub = uv.getX(b), vb = uv.getY(b);
          const ka = q(ua, va), kb = q(ub, vb);
          if (ka === kb) continue;
          const key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
          if (seen.has(key)) continue;
          seen.add(key);
          pts.push(ua, va, 0.05, ub, vb, 0.05);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.wire = new THREE.LineSegments(geo, this.wireMat);
    this.wire.frustumCulled = false;
    this.wire.visible = this.showWire;
    this.scene.add(this.wire);
  }

  private overlap: THREE.Mesh | null = null;
  showOverlap = false;
  /** Dark spots where UV islands overlap (null clears them). */
  setOverlap(tex: THREE.Texture | null) {
    if (this.overlap) { this.scene.remove(this.overlap); (this.overlap.material as THREE.MeshBasicMaterial).map?.dispose(); (this.overlap.material as THREE.Material).dispose(); this.overlap.geometry.dispose(); this.overlap = null; }
    if (!tex) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0.04),
      new THREE.MeshBasicMaterial({ map: tex, color: 0x000000, transparent: true, depthTest: false, toneMapped: false }));
    m.frustumCulled = false;
    m.renderOrder = 3;
    m.visible = this.showOverlap;
    this.overlap = m;
    this.scene.add(m);
  }
  setOverlapVisible(on: boolean) { this.showOverlap = on; if (this.overlap) this.overlap.visible = on; }

  setWire(on: boolean) {
    this.showWire = on;
    if (this.wire) this.wire.visible = on;
  }

  /** Keep lines readable on dense meshes: fade them as the UV layout gets crowded. */
  private updateWireOpacity() {
    const n = this.wire ? this.wire.geometry.attributes.position.count / 2 : 0;
    const pxPerUV = this.region.h / this.viewH;
    const density = n / (pxPerUV * pxPerUV + 1);
    this.wireMat.opacity = THREE.MathUtils.clamp(0.35 - density * 2.5, 0.08, 0.35);
  }

  bind(src: ViewSource, posMap: THREE.Texture) {
    this.mat.uniforms.map.value = src.tex;
    this.mat.uniforms.mode.value = src.mode;
    this.mat.uniforms.posMap.value = posMap;
  }

  /** null = no cursor; sphere = 3D brush footprint; uv = 2D brush. */
  setCursor(c: { kind: 'sphere'; center: THREE.Vector3; radius: number } | { kind: 'uv'; uv: THREE.Vector2; radius: number } | null) {
    const u = this.mat.uniforms;
    if (!c) u.cursorMode.value = 0;
    else if (c.kind === 'sphere') { u.cursorMode.value = 1; u.cCenter.value.copy(c.center); u.cRadius.value = c.radius; }
    else { u.cursorMode.value = 2; u.cUV.value.copy(c.uv); u.cRadiusUV.value = c.radius; }
  }

  /** True once the user zooms or pans; until then the view refits on resize. */
  userMoved = false;

  /** Fit the whole 0–1 texture square into the view. */
  frame() {
    const aspect = this.region.w / Math.max(1, this.region.h);
    this.center.set(0.5, 0.5);
    this.viewH = 1.08 * Math.max(1, 1 / Math.max(aspect, 1e-3));
    this.userMoved = false;
  }

  get viewW() { return this.viewH * (this.region.w / Math.max(1, this.region.h)); }

  /** Client (screen) position → UV. */
  toUV(clientX: number, clientY: number, canvasRect: DOMRect): THREE.Vector2 {
    const g = this.region;
    const px = (clientX - canvasRect.left - g.x) / g.w - 0.5;
    const py = (clientY - canvasRect.top - g.y) / g.h - 0.5;
    return new THREE.Vector2(this.center.x + px * this.viewW, this.center.y - py * this.viewH);
  }

  /** Zoom by factor, keeping the UV point under the mouse fixed. */
  zoomAt(factor: number, at: THREE.Vector2) {
    const nh = THREE.MathUtils.clamp(this.viewH * factor, 0.02, 8);
    const k = nh / this.viewH;
    this.center.set(at.x + (this.center.x - at.x) * k, at.y + (this.center.y - at.y) * k);
    this.viewH = nh;
    this.userMoved = true;
  }

  /** Pan by a screen-pixel delta. */
  pan(dx: number, dy: number) {
    const s = this.viewH / Math.max(1, this.region.h);
    this.center.x -= dx * s;
    this.center.y += dy * s;
    this.userMoved = true;
  }

  /** Pixels per UV unit (for sizing the 2D brush). */
  get pxPerUV() { return this.region.h / this.viewH; }

  updateCamera() {
    const hw = this.viewW / 2, hh = this.viewH / 2;
    const c = this.camera;
    c.left = this.center.x - hw; c.right = this.center.x + hw;
    c.top = this.center.y + hh; c.bottom = this.center.y - hh;
    c.updateProjectionMatrix();
    this.updateWireOpacity();
  }
}
