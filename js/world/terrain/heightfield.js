// Height field of the slope: N→S descent + layered gradient noise + erosion-inspired shaping
// (meandering gullies with moist floors, flat hub terraces). Pure typed-array data – no THREE, no
// Rapier – so it stays unit-testable. Index convention everywhere: i = iz * N + ix (row = z).
import { makeNoise2D, fbm2D } from "../../core/rng.js";

export const SHAPE = Object.freeze({
  drop: 52,                                    // metres of descent from the north to the south edge
  tiltRange: 0.022,                            // lateral tilt (m/m), random sign
  macro: { scale: 170, amp: 7.5, octaves: 3 },
  mid: { scale: 55, amp: 2.6, octaves: 3, stretchZ: 1.8 },
  fine: { scale: 14, amp: 0.55, octaves: 2 },
  micro: { scale: 4.5, amp: 0.14, octaves: 1 },
  gully: {
    depth: [2.2, 3.6], halfWidth: [9, 14], meander: [12, 18], meanderLen: [70, 110], wobble: 6,
    fadeIn: [0.72, 0.85], fadeOut: [0.2, 0.32],   // as fractions of the N–S extent (0 = south)
  },
  hubBlend: 12,                                // metres of soft shoulder around a hub terrace
});

/** Hub layout as fractions of `size` (x, z relative to centre) + radius in metres. [0] = spawn. */
const HUB_LAYOUT = Object.freeze([
  { id: "spawn", x: [-0.05, 0.05], z: [-0.38, -0.34], radius: 20 },
  { id: "hut", x: [-0.25, -0.15], z: [-0.04, 0.08], radius: 15 },
  { id: "deck-east", x: [0.13, 0.25], z: [-0.12, 0.04], radius: 14 },
  { id: "deck-top", x: [-0.06, 0.08], z: [0.25, 0.33], radius: 13 },
]);

const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Slope profile 0..1 over t (0 = south foot, 1 = north crest): gentle foot, convex crest. */
export function slopeProfile(t) {
  return (t ** 1.35 * (1 - 0.15 * t ** 4)) / 0.85;
}

/** Bilinear sample of a row-major N×N grid covering [-size/2, size/2]². */
export function sampleGrid(grid, N, resolution, x, z) {
  const half = (N - 1) * resolution * 0.5;
  const fx = Math.min(N - 1.0001, Math.max(0, (x + half) / resolution));
  const fz = Math.min(N - 1.0001, Math.max(0, (z + half) / resolution));
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const a = grid[iz * N + ix], b = grid[iz * N + ix + 1], c = grid[(iz + 1) * N + ix], d = grid[(iz + 1) * N + ix + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

function layoutHubs(rng, size) {
  return HUB_LAYOUT.map((h) => ({
    id: h.id,
    x: rng.float(h.x[0], h.x[1]) * size,
    z: rng.float(h.z[0], h.z[1]) * size,
    radius: h.radius,
    y: 0,
  }));
}

/** Gullies run N→S in the gaps between hub columns (never through a hub). */
function layoutGullies(rng, size, hubs) {
  const G = SHAPE.gully;
  const hut = hubs[1], east = hubs[2], top = hubs[3];
  const centres = [(hut.x + top.x) * 0.5, (top.x + east.x) * 0.5];
  if (rng.bool(0.6)) centres.push(rng.bool() ? hut.x - 0.16 * size : east.x + 0.16 * size);
  return centres.map((x0, k) => ({
    x0: x0 + rng.float(-8, 8),
    meanderAmp: rng.float(G.meander[0], G.meander[1]),
    meanderLen: rng.float(G.meanderLen[0], G.meanderLen[1]),
    phase: rng.float(0, Math.PI * 2),
    halfWidth: rng.float(G.halfWidth[0], G.halfWidth[1]),
    depth: rng.float(G.depth[0], G.depth[1]),
    seed: k * 17.3 + rng.float(0, 5),
  }));
}

function gullyCarve(gullies, noise, x, z, t) {
  const G = SHAPE.gully;
  let carve = 0;
  for (const g of gullies) {
    const fade = (1 - smoothstep(G.fadeIn[0], G.fadeIn[1], t)) * smoothstep(G.fadeOut[0], G.fadeOut[1], t);
    if (fade <= 0) continue;
    const depth = g.depth * fade * (0.6 + 0.4 * (1 - t)) * (0.85 + 0.25 * noise(z / 60 + 3.1, g.seed + 5));
    const cx = g.x0 + g.meanderAmp * Math.sin(z / g.meanderLen + g.phase) + G.wobble * noise(z / 35, g.seed);
    const w = g.halfWidth * (1 + 0.3 * noise(z / 50, g.seed + 9));
    const u = Math.abs(x - cx) / w;
    if (u >= 1) continue;
    const profile = (1 - u * u) ** 2;               // smooth U-shaped cross-section
    carve += depth * profile;
  }
  return carve;
}

/** 1 inside a hub terrace, fading to 0 over SHAPE.hubBlend metres outside its radius. */
export function hubWeightAt(hubs, x, z) {
  let w = 0;
  for (const h of hubs) {
    const d = Math.hypot(x - h.x, z - h.z);
    if (d < h.radius + SHAPE.hubBlend) w = Math.max(w, 1 - smoothstep(h.radius - 1, h.radius + SHAPE.hubBlend, d));
  }
  return w;
}

/**
 * @param {{ rng: import("../../core/rng.js").Rng, size: number, resolution: number }} o
 * @returns {{ n, N, size, resolution, heights: Float32Array, moisture: Float32Array, hubs, gullies }}
 */
export function buildHeightfield({ rng, size, resolution }) {
  const n = Math.round(size / resolution), N = n + 1, half = size / 2;
  const heights = new Float32Array(N * N);
  const moisture = new Float32Array(N * N);
  const nz = {
    macro: makeNoise2D(rng.fork("macro").seed),
    mid: makeNoise2D(rng.fork("mid").seed),
    fine: makeNoise2D(rng.fork("fine").seed),
    micro: makeNoise2D(rng.fork("micro").seed),
    gully: makeNoise2D(rng.fork("gully").seed),
  };
  const tilt = rng.sign() * rng.float(0.5, 1) * SHAPE.tiltRange;
  const hubs = layoutHubs(rng, size);
  const gullies = layoutGullies(rng, size, hubs);
  const S = SHAPE;

  for (let iz = 0; iz < N; iz++) {
    const z = -half + iz * resolution;
    const t = (z + half) / size;
    for (let ix = 0; ix < N; ix++) {
      const x = -half + ix * resolution;
      let h = S.drop * slopeProfile(t) + tilt * x;
      h += S.macro.amp * fbm2D(nz.macro, x / S.macro.scale, z / S.macro.scale, S.macro.octaves);
      h += S.mid.amp * fbm2D(nz.mid, x / S.mid.scale, z / (S.mid.scale * S.mid.stretchZ), S.mid.octaves);
      h += S.fine.amp * fbm2D(nz.fine, x / S.fine.scale, z / S.fine.scale, S.fine.octaves);
      h += S.micro.amp * nz.micro(x / S.micro.scale, z / S.micro.scale);
      const carve = gullyCarve(gullies, nz.gully, x, z, t) * (1 - hubWeightAt(hubs, x, z));
      heights[iz * N + ix] = h - carve;
      moisture[iz * N + ix] = clamp01(carve / 2.2);
    }
  }

  for (const hub of hubs) hub.y = sampleGrid(heights, N, resolution, hub.x, hub.z);
  for (let iz = 0; iz < N; iz++) {
    const z = -half + iz * resolution;
    for (let ix = 0; ix < N; ix++) {
      const x = -half + ix * resolution;
      for (const hub of hubs) {
        const d = Math.hypot(x - hub.x, z - hub.z);
        if (d >= hub.radius + S.hubBlend) continue;
        const w = 1 - smoothstep(hub.radius - 1, hub.radius + S.hubBlend, d);
        const i = iz * N + ix;
        heights[i] += (hub.y + 0.06 * nz.micro(x / 3, z / 3) - heights[i]) * w;
        moisture[i] *= 1 - w;
      }
    }
  }
  return { n, N, size, resolution, heights, moisture, hubs, gullies };
}
