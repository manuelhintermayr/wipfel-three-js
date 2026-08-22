// Packed-dirt path network: routes between the hubs (Catmull-Rom through jittered waypoints with
// switchbacks up the slope), rasterised into a 1 m mask, and the height field graded along them
// (bench cut, along-path slope ≤ PATHS.maxSlopeDeg). Mutates `field.heights` in place.
import * as THREE from "three";
import { makeNoise2D } from "../../core/rng.js";
import { sampleGrid } from "./heightfield.js";

export const PATHS = Object.freeze({
  maskResolution: 1,                 // metres per mask texel
  width: { entry: 3.6, main: 3.4, branch: 2.8, traverse: 2.6 },
  widthWobble: 0.4,                  // ± metres along the route
  shoulder: 4.5,                     // metres of terrain blending beyond the path edge
  maxSlopeDeg: 12,
  smoothWindow: 8,                   // metres half-window for the along-path profile smoothing
  anchorLength: 8,                   // metres over which route ends stick to the original height
  sampleStep: 1,                     // metres between polyline samples
});

const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Waypoint lists (x, z) for every route – spawn → junction → top with switchbacks, branches, traverses. */
function buildRoutes(rng, hubs, size) {
  const [spawn, hut, east, top] = hubs;
  const half = size / 2, s = rng.sign();
  const jit = (v, r) => v + rng.float(-r, r);
  const J = { x: jit(spawn.x * 0.4, 0.04 * size), z: rng.float(-0.14, -0.08) * size };
  const mid = (a, b, dx, dz) => [(a.x + b.x) / 2 + dx, (a.z + b.z) / 2 + dz];
  return [
    { kind: "entry", points: [[jit(spawn.x, 8), -half - 6], [jit(spawn.x, 4), spawn.z - spawn.radius * 0.7], [spawn.x, spawn.z]] },
    { kind: "main", points: [[spawn.x, spawn.z], [spawn.x + s * jit(58, 8), spawn.z + jit(42, 6)], [spawn.x - s * jit(42, 8), spawn.z + jit(84, 8)], [J.x, J.z]] },
    { kind: "main", points: [[J.x, J.z], [J.x + s * jit(52, 8), J.z + jit(58, 8)], [J.x - s * jit(38, 8), J.z + jit(118, 8)], [top.x, top.z]] },
    { kind: "branch", points: [[J.x, J.z], mid(J, hut, jit(0, 12), jit(-14, 8)), [hut.x, hut.z]] },
    { kind: "branch", points: [[J.x, J.z], mid(J, east, jit(0, 12), jit(-12, 8)), [east.x, east.z]] },
    { kind: "traverse", points: [[hut.x, hut.z], mid(hut, top, jit(-14, 10), jit(12, 10)), [top.x, top.z]] },
    { kind: "traverse", points: [[east.x, east.z], mid(east, top, jit(14, 10), jit(12, 10)), [top.x, top.z]] },
  ].map((r) => ({ ...r, width: PATHS.width[r.kind] }));
}

/** Samples a route every `sampleStep` metres → { x, z, w } arrays (Float32) + count. */
function sampleRoute(route, noise, routeIndex) {
  const curve = new THREE.CatmullRomCurve3(route.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal", 0.5);
  const count = Math.max(2, Math.ceil(curve.getLength() / PATHS.sampleStep));
  const pts = curve.getSpacedPoints(count);
  const x = new Float32Array(pts.length), z = new Float32Array(pts.length), w = new Float32Array(pts.length);
  for (let k = 0; k < pts.length; k++) {
    x[k] = pts[k].x; z[k] = pts[k].z;
    w[k] = route.width + PATHS.widthWobble * noise(k * PATHS.sampleStep / 9, routeIndex * 3.7);
  }
  return { x, z, w, count: pts.length, kind: route.kind };
}

/** Along-path height profile: smoothed, slope-limited, anchored to the terrain at both ends. */
function gradeProfile(field, sample) {
  const { heights, N, resolution } = field;
  const n = sample.count, step = PATHS.sampleStep;
  const original = new Float32Array(n);
  for (let k = 0; k < n; k++) original[k] = sampleGrid(heights, N, resolution, sample.x[k], sample.z[k]);
  let h = Float32Array.from(original);
  const W = Math.max(1, Math.round(PATHS.smoothWindow / step));
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const a = Math.max(0, k - W), b = Math.min(n - 1, k + W);
      let sum = 0;
      for (let j = a; j <= b; j++) sum += h[j];
      out[k] = sum / (b - a + 1);
    }
    h = out;
  }
  const maxStep = Math.tan(PATHS.maxSlopeDeg * Math.PI / 180) * step;
  for (let k = 1; k < n; k++) h[k] = Math.min(h[k - 1] + maxStep, Math.max(h[k - 1] - maxStep, h[k]));
  for (let k = n - 2; k >= 0; k--) h[k] = Math.min(h[k + 1] + maxStep, Math.max(h[k + 1] - maxStep, h[k]));
  const A = PATHS.anchorLength / step;
  for (let k = 0; k < n; k++) {
    const wEnd = Math.min(smoothstep(0, A, k), smoothstep(0, A, n - 1 - k));
    h[k] = original[k] + (h[k] - original[k]) * wEnd;
  }
  return h;
}

/** Writes the graded profiles into the height field (bench cut with soft shoulders). */
function stampHeights(field, samples, profiles) {
  const { heights, N, resolution, size } = field;
  const half = size / 2;
  const dist = new Float32Array(N * N).fill(Infinity), pathH = new Float32Array(N * N), halfW = new Float32Array(N * N);
  samples.forEach((s, r) => {
    const prof = profiles[r];
    for (let k = 0; k < s.count; k++) {
      const R = s.w[k] * 0.5 + PATHS.shoulder;
      const ix0 = Math.max(0, Math.floor((s.x[k] - R + half) / resolution)), ix1 = Math.min(N - 1, Math.ceil((s.x[k] + R + half) / resolution));
      const iz0 = Math.max(0, Math.floor((s.z[k] - R + half) / resolution)), iz1 = Math.min(N - 1, Math.ceil((s.z[k] + R + half) / resolution));
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const d = Math.hypot(-half + ix * resolution - s.x[k], -half + iz * resolution - s.z[k]);
          const i = iz * N + ix;
          if (d < dist[i]) { dist[i] = d; pathH[i] = prof[k]; halfW[i] = s.w[k] * 0.5; }
        }
      }
    }
  });
  for (let i = 0; i < heights.length; i++) {
    if (dist[i] === Infinity) continue;
    const w = 1 - smoothstep(halfW[i] * 0.5, halfW[i] + PATHS.shoulder, dist[i]);
    heights[i] += (pathH[i] - heights[i]) * w;
  }
}

/** Rasterises the routes into a soft-edged coverage mask (Uint8, M×M texels of maskResolution). */
function rasterizeMask(samples, size) {
  const res = PATHS.maskResolution, M = Math.round(size / res), half = size / 2;
  const mask = new Uint8Array(M * M);
  for (const s of samples) {
    for (let k = 0; k < s.count; k++) {
      const hw = s.w[k] * 0.5, R = hw + 1.2;
      const j0 = Math.max(0, Math.floor((s.x[k] - R + half) / res)), j1 = Math.min(M - 1, Math.ceil((s.x[k] + R + half) / res));
      const i0 = Math.max(0, Math.floor((s.z[k] - R + half) / res)), i1 = Math.min(M - 1, Math.ceil((s.z[k] + R + half) / res));
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const d = Math.hypot(-half + (j + 0.5) * res - s.x[k], -half + (i + 0.5) * res - s.z[k]);
          const v = Math.round(255 * (1 - smoothstep(hw - 0.5, hw + 1.0, d)));
          if (v > mask[i * M + j]) mask[i * M + j] = v;
        }
      }
    }
  }
  return { mask, M, res };
}

/**
 * @param {{ rng, field }} o  field = result of buildHeightfield (heights are graded in place)
 * @returns {{ mask: Uint8Array, maskSize: number, maskAt(x,z): number, isPath(x,z): boolean, routes }}
 */
export function buildPaths({ rng, field }) {
  const noise = makeNoise2D(rng.fork("path-noise").seed);
  const routes = buildRoutes(rng, field.hubs, field.size);
  const samples = routes.map((r, i) => sampleRoute(r, noise, i));
  const profiles = samples.map((s) => gradeProfile(field, s));   // all from the un-stamped field → consistent junctions
  stampHeights(field, samples, profiles);
  const { mask, M, res } = rasterizeMask(samples, field.size);
  const half = field.size / 2;
  const maskAt = (x, z) => {
    const fx = Math.min(M - 1.0001, Math.max(0, (x + half) / res - 0.5));
    const fz = Math.min(M - 1.0001, Math.max(0, (z + half) / res - 0.5));
    const j = Math.floor(fx), i = Math.floor(fz), tx = fx - j, tz = fz - i;
    const a = mask[i * M + j], b = mask[i * M + j + 1], c = mask[(i + 1) * M + j], d = mask[(i + 1) * M + j + 1];
    return ((a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz) / 255;
  };
  return {
    mask, maskSize: M, maskAt,
    isPath: (x, z) => maskAt(x, z) >= 0.5,
    routes: samples.map((s, i) => ({ kind: s.kind, width: routes[i].width, x: s.x, z: s.z, heights: profiles[i] })),
  };
}
