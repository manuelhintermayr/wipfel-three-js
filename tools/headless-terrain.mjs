// A terrain sampler that runs under plain `node` – no THREE, no Rapier, no canvas. Used by
// tools/bake-park.mjs and tests/unit/layout.test.mjs, which both need js/park/layout.js's
// { heightAt, isPath, slopeAt, hubs } contract (js/world/terrain.js) without a browser.
//
// heightAt/normalAt/slopeAt/hubs come straight from js/world/terrain/heightfield.js, which is already
// pure (only imports js/core/rng.js) – the bilinear sampler below is a deliberate, documented
// duplicate of js/world/terrain.js#createSampler (same reasoning as js/elements/catalogue-data.js's
// header comment: the source of truth pulls in THREE transitively, so the one place this can be
// exercised without a browser keeps its own copy). isPath is a genuine stub: the real mask
// (js/world/terrain/paths.js) rasterises THREE.CatmullRomCurve3 splines through the same waypoints
// the routes are built from, which needs THREE; here a route is approximated as straight segments
// between the same hub points, which is topologically right (same junction, same four hubs) but not
// pixel-identical to the in-browser curve. Good enough to keep the generator's platform trees off the
// obvious throughways for a headless snapshot/test — the live game always validates against the real
// terrain.isPath() (js/main.js calls js/world/terrain.js#createTerrain, never this file).
import { buildHeightfield, sampleGrid } from "../js/world/terrain/heightfield.js";
import { Rng } from "../js/core/rng.js";

const PATH_WIDTH = 3.4;   // metres – roughly js/world/terrain/paths.js#PATHS.width.main

/** Exact copy of js/world/terrain.js#createSampler – see the header comment above for why. */
function createHeightSampler({ heights, N, resolution }) {
  const half = (N - 1) * resolution * 0.5, maxF = N - 1.000001;
  const heightAt = (x, z) => {
    const fx = Math.min(maxF, Math.max(0, (x + half) / resolution));
    const fz = Math.min(maxF, Math.max(0, (z + half) / resolution));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const i = iz * N + ix;
    const ha = heights[i], hb = heights[i + 1], hc = heights[i + N], hd = heights[i + N + 1];
    if (tx + tz <= 1) return ha + (hb - ha) * tx + (hc - ha) * tz;
    return hd + (hc - hd) * (1 - tx) + (hb - hd) * (1 - tz);
  };
  const eps = resolution * 0.5;
  const slopeAt = (x, z) => {
    const dx = heightAt(x + eps, z) - heightAt(x - eps, z);
    const dz = heightAt(x, z + eps) - heightAt(x, z - eps);
    const len = Math.hypot(dx, 2 * eps, dz);
    return Math.acos(Math.min(1, (2 * eps) / len));
  };
  return { heightAt, slopeAt };
}

/** Distance from (x,z) to the nearest point on segment [a,b]. */
function distanceToSegment(x, z, a, b) {
  const abx = b.x - a.x, abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / len2));
  const px = a.x + abx * t, pz = a.z + abz * t;
  return Math.hypot(x - px, z - pz);
}

/** Straight-segment stand-in for the real (spline-smoothed) path mask – see the header comment. */
function buildPathStub(hubs) {
  const [spawn, hut, east, top] = hubs;
  const junction = { x: (hut.x + top.x + east.x) / 3, z: Math.min(hut.z, top.z, east.z) - 12 };
  const segments = [
    [spawn, junction], [junction, top], [junction, hut], [junction, east], [hut, top], [east, top],
  ];
  return (x, z) => {
    for (const [a, b] of segments) if (distanceToSegment(x, z, a, b) < PATH_WIDTH / 2) return true;
    return false;
  };
}

/**
 * @param {{ seed: number, size?: number, resolution?: number }} options
 * @returns {{ heightAt, slopeAt, isPath, hubs: Array<{x,z,radius,y}> }}
 */
export function createHeadlessTerrain({ seed, size = 480, resolution = 2 }) {
  // Matches js/world/terrain.js#createTerrain: rng.fork("terrain").fork("heightfield") derives the
  // heightfield's own stream so this stays independent of whatever else forks off the root rng.
  const rng = new Rng(seed).fork("terrain").fork("heightfield");
  const field = buildHeightfield({ rng, size, resolution });
  const sampler = createHeightSampler(field);
  const hubs = field.hubs.map((h) => ({ id: h.id, x: h.x, z: h.z, radius: h.radius, y: sampleGrid(field.heights, field.N, field.resolution, h.x, h.z) }));
  return { heightAt: sampler.heightAt, slopeAt: sampler.slopeAt, isPath: buildPathStub(hubs), hubs, field };
}
