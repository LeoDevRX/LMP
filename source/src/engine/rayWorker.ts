/// <reference lib="webworker" />
/**
 * Ray-traced mesh map baker, run in parallel workers.
 *
 * The ambient occlusion, thickness and curvature ("from mesh") algorithms are
 * ported from TextureCraft's bake crate (https://github.com/storytold/texturecraft,
 * MIT OR Apache-2.0, © ArtCraft Team and the TextureCraft contributors), which
 * targets parity with Substance 3D Painter's bakers.
 *
 * Each texel sample is 10 floats: position (3), shading normal (3), geometric
 * normal (3), world size of one texel (1).
 */
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export interface RayParams {
  kind: 'ao' | 'curv' | 'thick';
  rays: number;
  minD: number;
  maxD: number;
  spread: number; // degrees
  dist: 'cosine' | 'uniform';
  atten: 'none' | 'linear' | 'smooth';
  ground: boolean;
  groundY: number;
  /** Ray origin offset along the geometric normal (1e-6 × diagonal). */
  eps: number;
  // curvature
  meshScale: number;
  /** Sampling radius in model units. */
  radius: number;
  /** Samples lie on a high poly (TextureCraft uses a separate tuning for it). */
  high?: boolean;
}
export const SAMPLE_FLOATS = 10;

interface Target { bvh: MeshBVH; pos: Float32Array; nrm: Float32Array | null; idx: Uint32Array | null }
let targets: Target[] = [];

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === 'init') {
    targets = m.geos.map((g: { pos: Float32Array; index: Uint32Array | null; nrm: Float32Array | null }) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3));
      if (g.index) geo.setIndex(new THREE.BufferAttribute(g.index.slice(), 1));
      const bvh = new MeshBVH(geo);
      // MeshBVH may reorder the index; read triangles back from the geometry it holds.
      const idx = geo.index ? (geo.index.array as Uint32Array) : null;
      return { bvh, pos: g.pos, nrm: g.nrm, idx };
    });
    (self as any).postMessage({ type: 'ready' });
  } else if (m.type === 'job') {
    const out = run(m.pts as Float32Array, m.params as RayParams, m.first as number);
    (self as any).postMessage({ type: 'done', id: m.id, out }, [out.buffer]);
  }
};

// ------------------------------------------------------------------ ray casting

interface Hit { t: number; g: number; tri: number; px: number; py: number; pz: number }
const ray = new THREE.Ray();
function closest(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, far: number): Hit | null {
  if (!(far > 0)) return null;
  ray.origin.set(ox, oy, oz);
  ray.direction.set(dx, dy, dz);
  let best: Hit | null = null;
  for (let g = 0; g < targets.length; g++) {
    const h = targets[g].bvh.raycastFirst(ray, THREE.DoubleSide, 0, far) as any;
    if (h && h.distance <= far && (!best || h.distance < best.t)) best = { t: h.distance, g, tri: h.faceIndex, px: h.point.x, py: h.point.y, pz: h.point.z };
  }
  return best;
}

const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), tmp = new THREE.Vector3(), bc = new THREE.Vector3();
const triT = new THREE.Triangle();
function corners(h: Hit): [number, number, number] {
  const T = targets[h.g];
  return T.idx ? [T.idx[h.tri * 3], T.idx[h.tri * 3 + 1], T.idx[h.tri * 3 + 2]] : [h.tri * 3, h.tri * 3 + 1, h.tri * 3 + 2];
}
/** Face normal of the hit triangle. */
function triNormal(h: Hit, out: THREE.Vector3) {
  const T = targets[h.g], [a, b, c] = corners(h);
  va.fromArray(T.pos, a * 3); vb.fromArray(T.pos, b * 3); vc.fromArray(T.pos, c * 3);
  return out.subVectors(vb, va).cross(tmp.subVectors(vc, va)).normalize();
}
/** Interpolated shading normal at the hit. */
function shadedNormal(h: Hit, out: THREE.Vector3, fallback: THREE.Vector3) {
  const T = targets[h.g];
  if (!T.nrm) return out.copy(fallback);
  const [a, b, c] = corners(h);
  va.fromArray(T.pos, a * 3); vb.fromArray(T.pos, b * 3); vc.fromArray(T.pos, c * 3);
  triT.set(va, vb, vc);
  triT.getBarycoord(tmp.set(h.px, h.py, h.pz), bc);
  out.set(
    T.nrm[a * 3] * bc.x + T.nrm[b * 3] * bc.y + T.nrm[c * 3] * bc.z,
    T.nrm[a * 3 + 1] * bc.x + T.nrm[b * 3 + 1] * bc.y + T.nrm[c * 3 + 1] * bc.z,
    T.nrm[a * 3 + 2] * bc.x + T.nrm[b * 3 + 2] * bc.y + T.nrm[c * 3 + 2] * bc.z,
  );
  return out.lengthSq() > 1e-12 ? out.normalize() : out.copy(fallback);
}

/** glam's any_orthonormal_pair (so the ray frames match TextureCraft). */
function orthoPair(n: THREE.Vector3, t: THREE.Vector3, b: THREE.Vector3) {
  const sign = n.z >= 0 ? 1 : -1;
  const a = -1 / (sign + n.z);
  const bb = n.x * n.y * a;
  t.set(1 + sign * n.x * n.x * a, sign * bb, -sign * n.x);
  b.set(bb, sign + n.y * n.y * a, -n.y);
}

function reverseBits(i: number) {
  i = ((i >>> 1) & 0x55555555) | ((i & 0x55555555) << 1);
  i = ((i >>> 2) & 0x33333333) | ((i & 0x33333333) << 2);
  i = ((i >>> 4) & 0x0f0f0f0f) | ((i & 0x0f0f0f0f) << 4);
  i = ((i >>> 8) & 0x00ff00ff) | ((i & 0x00ff00ff) << 8);
  return ((i >>> 16) | (i << 16)) >>> 0;
}
/** Two stable random numbers per texel (splitmix-style hash). */
function rot2(seed: number): [number, number] {
  let x = (seed + 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  let y = Math.imul(x ^ 0x27d4eb2f, 0x165667b1) >>> 0;
  y = (y ^ (y >>> 15)) >>> 0;
  return [x / 4294967296, y / 4294967296];
}

// ------------------------------------------------------------------ passes

const N = new THREE.Vector3(), G = new THREE.Vector3(), T = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3();
const hn = new THREE.Vector3(), fn = new THREE.Vector3();

function hemisphere(pts: Float32Array, o: number, p: RayParams, seed: number): number {
  const thick = p.kind === 'thick';
  N.set(pts[o + 3], pts[o + 4], pts[o + 5]);
  G.set(pts[o + 6], pts[o + 7], pts[o + 8]);
  if (N.lengthSq() < 1e-12) return thick ? p.maxD : 1;
  N.normalize();
  if (G.lengthSq() < 1e-12) G.copy(N); else G.normalize();
  if (G.dot(N) < 0) G.negate();
  if (thick) { N.negate(); G.negate(); }
  const ox = pts[o] + G.x * p.eps, oy = pts[o + 1] + G.y * p.eps, oz = pts[o + 2] + G.z * p.eps;
  orthoPair(N, T, B);
  const half = Math.min(Math.PI / 2, (Math.min(180, Math.max(0, p.spread)) * 0.5 * Math.PI) / 180);
  const cosMax = Math.cos(half), sinMax = Math.sin(half);
  const [r0, r1] = rot2(seed);
  let acc = 0, n = 0;
  for (let i = 0; i < p.rays; i++) {
    const az = (i / p.rays + r0) % 1;
    const el = (reverseBits(i) / 4294967296 + r1) % 1;
    let radius: number, height: number;
    if (p.dist === 'uniform') { height = 1 - el * (1 - cosMax); radius = Math.sqrt(Math.max(0, 1 - height * height)); }
    else { radius = sinMax * Math.sqrt(el); height = Math.sqrt(Math.max(0, 1 - radius * radius)); }
    const a = az * Math.PI * 2, ca = Math.cos(a) * radius, sa = Math.sin(a) * radius;
    D.set(T.x * ca + B.x * sa + N.x * height, T.y * ca + B.y * sa + N.y * height, T.z * ca + B.z * sa + N.z * height);
    if (D.dot(G) <= 0) continue;
    const len = Math.max(0, p.maxD - p.minD);
    const h = closest(ox + D.x * p.minD, oy + D.y * p.minD, oz + D.z * p.minD, D.x, D.y, D.z, len);
    let dist = h ? h.t + p.minD : -1;
    if (!thick && p.ground && D.y < -1e-8) {
      const gd = (p.groundY - oy) / D.y;
      if (gd >= p.minD && gd <= p.maxD) dist = dist < 0 ? gd : Math.min(dist, gd);
    }
    if (thick) acc += dist < 0 ? p.maxD : dist;
    else if (dist >= 0) {
      const f = Math.min(1, Math.max(0, (dist - p.minD) / Math.max(1e-12, p.maxD - p.minD)));
      acc += p.atten === 'none' ? 1 : p.atten === 'linear' ? 1 - f : 1 - f * f * (3 - 2 * f);
    }
    n++;
  }
  if (thick) return n ? acc / n : p.maxD;
  return n ? Math.min(1, Math.max(0, 1 - acc / n)) : 1;
}

// Curvature from mesh (TextureCraft's low-poly tuning).
const RING_COUNT = 4, WALL_RADIUS_TEXELS = 1.5, CONCAVE_WEIGHT = 1.5, HARD_EDGE = 0.05, GENTLE = 0.1;
const LOW = { convex: 1.5, ratio: 0.003, weight: 1.3 }, HIGH = { convex: 0.5, ratio: 0.0007, weight: 1.6 };

function curvature(pts: Float32Array, o: number, p: RayParams): number {
  N.set(pts[o + 3], pts[o + 4], pts[o + 5]);
  G.set(pts[o + 6], pts[o + 7], pts[o + 8]);
  if (N.lengthSq() < 1e-12) return 0;
  N.normalize();
  if (G.lengthSq() < 1e-12) G.copy(N); else G.normalize();
  if (G.dot(N) < 0) G.negate();
  const px = pts[o], py = pts[o + 1], pz = pts[o + 2];
  const texel = pts[o + 9] > 0 ? pts[o + 9] : p.meshScale * 1e-3;
  const radiusScale = p.radius / (p.meshScale * 0.001);
  const walls = WALL_RADIUS_TEXELS * radiusScale, spreadR = (walls * 4) / 3;
  const per = Math.max(1, Math.floor(p.rays / RING_COUNT));
  const r = walls * texel;
  const tune = p.high ? HIGH : LOW;
  const radii = [r, r, spreadR * texel, p.meshScale * tune.ratio * radiusScale];
  orthoPair(G, T, B);
  const dir = (k: number, out: THREE.Vector3) => { const a = (Math.PI * 2 * k) / per; return out.set(T.x * Math.cos(a) + B.x * Math.sin(a), T.y * Math.cos(a) + B.y * Math.sin(a), T.z * Math.cos(a) + B.z * Math.sin(a)); };

  // Rings 0 / 1: horizontal rays just above / below the surface hit nearby walls.
  const wall = (ring: number) => {
    const R = radii[ring], s = ring === 0 ? 0.15 : -0.15;
    const ox = px + G.x * s * R, oy = py + G.y * s * R, oz = pz + G.z * s * R;
    let sum = 0;
    for (let k = 0; k < per; k++) {
      dir(k, D);
      const h = closest(ox, oy, oz, D.x, D.y, D.z, R);
      if (!h) continue;
      if (ring === 0) {
        // keep only walls standing on the surface (a short ray down near the hit finds ground)
        const g = closest(px + G.x * 0.15 * r + D.x * h.t * 0.85, py + G.y * 0.15 * r + D.y * h.t * 0.85, pz + G.z * 0.15 * r + D.z * h.t * 0.85, -G.x, -G.y, -G.z, 0.5 * r);
        if (!g || g.t >= 0.3 * r) continue;
      }
      triNormal(h, fn);
      const upright = Math.sqrt(Math.max(0, 1 - fn.dot(G) ** 2));
      shadedNormal(h, hn, N);
      const hard = Math.min(1, Math.max(0, (1 - hn.dot(N)) / HARD_EDGE));
      sum += (1 - h.t / R) * upright * hard;
    }
    return sum / per;
  };
  // Rings 2 / 3: rays dropped from around the point onto the surface compare normals.
  const spread = (ring: number): [number, number] => {
    const R = radii[ring];
    let shading = 0, faces = 0;
    for (let k = 0; k < per; k++) {
      dir(k, D);
      const h = closest(px + D.x * R + G.x * 0.25 * R, py + D.y * R + G.y * 0.25 * R, pz + D.z * R + G.z * 0.25 * R, -G.x, -G.y, -G.z, 2.25 * R);
      if (!h) continue;
      shadedNormal(h, hn, N);
      shading += (hn.x - N.x) * D.x + (hn.y - N.y) * D.y + (hn.z - N.z) * D.z;
      triNormal(h, fn);
      if (fn.dot(G) < 0) fn.negate();
      faces += (fn.x - G.x) * D.x + (fn.y - G.y) * D.y + (fn.z - G.z) * D.z;
    }
    return [shading / per, faces / per];
  };
  const above = wall(0), below = wall(1);
  const [shading] = spread(2);
  const [ts, tf] = spread(3);
  const agreed = ts * tf <= 0 ? 0 : Math.sign(ts) * Math.min(Math.abs(ts), Math.abs(tf));
  const v = agreed * tune.weight;
  const tight = Math.sign(v) * Math.max(0, Math.abs(v) - GENTLE);
  const value = -above * CONCAVE_WEIGHT + Math.max(0, below - above) * tune.convex + shading * 0.5 + tight;
  return Math.min(1, Math.max(-1, value * 2));
}

function run(pts: Float32Array, p: RayParams, first: number): Float32Array {
  const n = pts.length / SAMPLE_FLOATS;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * SAMPLE_FLOATS;
    out[i] = p.kind === 'curv' ? curvature(pts, o, p) : hemisphere(pts, o, p, first + i);
  }
  return out;
}
