import * as THREE from 'three';

/** Vertex shader for full-screen passes in texture (UV) space. */
export const VERT_QUAD = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

export type RT = THREE.WebGLRenderTarget;

export interface RTOptions {
  type?: THREE.TextureDataType;
  nearest?: boolean;
  mips?: boolean;
}

export function makeRT(size: number, opts: RTOptions = {}): RT {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    type: opts.type ?? THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    magFilter: opts.nearest ? THREE.NearestFilter : THREE.LinearFilter,
    minFilter: opts.nearest
      ? THREE.NearestFilter
      : opts.mips
        ? THREE.LinearMipmapLinearFilter
        : THREE.LinearFilter,
    generateMipmaps: !!opts.mips,
    depthBuffer: false,
    stencilBuffer: false,
    colorSpace: THREE.NoColorSpace,
  });
  rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
  if (opts.mips) rt.texture.anisotropy = 4;
  return rt;
}

export function quadShader(
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform>,
  extra: Partial<THREE.ShaderMaterialParameters> = {},
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT_QUAD,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    ...extra,
  });
}

/** Small helper that runs full-screen shader passes into render targets. */
export class GPU {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private savedColor = new THREE.Color();

  /**
   * Scene backgrounds change the renderer's clear color, so every GPU pass
   * clears explicitly to transparent black and restores the previous state.
   */
  private clearTransparent() {
    const r = this.renderer;
    r.getClearColor(this.savedColor);
    const a = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.setClearColor(this.savedColor, a);
  }

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  run(material: THREE.Material, target: RT | null, clear = false) {
    const r = this.renderer;
    const auto = r.autoClear;
    r.autoClear = false;
    this.quad.material = material;
    r.setRenderTarget(target);
    if (clear) this.clearTransparent();
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    r.autoClear = auto;
  }

  /** Render an arbitrary scene (used for UV-space baking). */
  renderScene(scene: THREE.Scene, target: RT, clear = true) {
    const r = this.renderer;
    const auto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(target);
    if (clear) this.clearTransparent();
    r.render(scene, this.camera);
    r.setRenderTarget(null);
    r.autoClear = auto;
  }

  clear(target: RT) {
    const r = this.renderer;
    r.setRenderTarget(target);
    this.clearTransparent();
    r.setRenderTarget(null);
  }

  readPixels(target: RT): Uint8Array {
    const w = target.width, h = target.height;
    const buf = new Uint8Array(w * h * 4);
    this.renderer.readRenderTargetPixels(target, 0, 0, w, h, buf);
    return buf;
  }
}
