// Terrain: slope height field (terrain/heightfield.js) graded along the path network
// (terrain/paths.js) → a grid of chunk meshes with index-only LOD and skirts (terrain/chunks.js),
// the same triangulation as the Rapier heightfield collider, a blended ground material
// (terrain/material.js) and a sampling API for placement.
// Contract: docs/architecture.md → "World modules → js/world/terrain.js".
import * as THREE from "three";
import { WORLD } from "../config.js";
import { GROUP, groups } from "../core/physics.js";
import { buildHeightfield } from "./terrain/heightfield.js";
import { buildPaths } from "./terrain/paths.js";
import { createTerrainMaterial } from "./terrain/material.js";
import { createTerrainChunks } from "./terrain/chunks.js";
import { getGroundTextures } from "../procgen/textures/ground.js";

export const TERRAIN = Object.freeze({
  duffSlopeDeg: [22, 34],      // moss/needle duff fades in between these slopes
  friction: 0.9,
});

/** heightAt / normalAt / slopeAt over the grid, using the exact mesh/collider triangulation. */
function createSampler({ heights, N, resolution, size }) {
  const half = size / 2, maxF = N - 1.000001;
  const heightAt = (x, z) => {
    const fx = Math.min(maxF, Math.max(0, (x + half) / resolution));
    const fz = Math.min(maxF, Math.max(0, (z + half) / resolution));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const i = iz * N + ix;
    const ha = heights[i], hb = heights[i + 1], hc = heights[i + N], hd = heights[i + N + 1];
    if (tx + tz <= 1) return ha + (hb - ha) * tx + (hc - ha) * tz;   // triangle (a, c, b)
    return hd + (hc - hd) * (1 - tx) + (hb - hd) * (1 - tz);        // triangle (c, d, b)
  };
  const eps = resolution * 0.5;
  const normalAt = (x, z, out = new THREE.Vector3()) => {
    const dx = heightAt(x + eps, z) - heightAt(x - eps, z);
    const dz = heightAt(x, z + eps) - heightAt(x, z - eps);
    return out.set(-dx, 2 * eps, -dz).normalize();
  };
  const tmp = new THREE.Vector3();
  const slopeAt = (x, z) => Math.acos(Math.min(1, normalAt(x, z, tmp).y));
  return { heightAt, normalAt, slopeAt };
}

function createMaskTexture(paths) {
  const tex = new THREE.DataTexture(paths.mask, paths.maskSize, paths.maskSize, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

/** Rapier heightfield: heights matrix column-major, rows along z, columns along x, centred at origin. */
function createCollider(physics, { heights, N, n, size }) {
  const R = physics.RAPIER;
  const hf = new Float32Array(N * N);
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) hf[iz + ix * N] = heights[iz * N + ix];
  const desc = R.ColliderDesc.heightfield(n, n, hf, { x: size, y: 1, z: size })
    .setFriction(TERRAIN.friction)
    .setCollisionGroups(groups(GROUP.TERRAIN));
  return physics.world.createCollider(desc);
}

/**
 * @param {{ rng: import("../core/rng.js").Rng, physics, scene: THREE.Scene, size?: number, resolution?: number }} o
 */
export function createTerrain({ rng, physics, scene, size = WORLD.size, resolution = 2 }) {
  const trng = rng.fork("terrain");
  const field = buildHeightfield({ rng: trng.fork("heightfield"), size, resolution });
  const paths = buildPaths({ rng: trng.fork("paths"), field });
  const sampler = createSampler(field);
  const textures = getGroundTextures(trng.fork("textures").seed);
  const maskTexture = createMaskTexture(paths);
  const material = createTerrainMaterial({ textures, pathMask: maskTexture, size });
  const chunks = createTerrainChunks({
    field, sampler, material, duffSlopeDeg: TERRAIN.duffSlopeDeg, rng: trng.fork("vertex-colour"),
  });
  scene.add(chunks.group);
  const collider = physics ? createCollider(physics, field) : null;

  const half = size / 2;
  const hubs = field.hubs.map((h) => ({ id: h.id, x: h.x, z: h.z, radius: h.radius, y: sampler.heightAt(h.x, h.z) }));
  const spawn = { x: hubs[0].x, y: hubs[0].y, z: hubs[0].z };

  return {
    group: chunks.group,
    chunks: chunks.chunks,
    chunkStats: chunks.stats,
    /** gameplay phase: pick a mesh LOD per chunk from the camera/player position (never geometry). */
    update(dt, focusPos) { if (focusPos) chunks.update(focusPos); },
    heightAt: sampler.heightAt,
    normalAt: sampler.normalAt,
    slopeAt: sampler.slopeAt,
    isPath: paths.isPath,
    pathMaskAt: paths.maskAt,
    bounds: { min: { x: -half, z: -half }, max: { x: half, z: half } },
    hubs,
    spawn,
    routes: paths.routes,
    field,
    dispose() {
      scene.remove(chunks.group);
      chunks.dispose();
      material.dispose();
      maskTexture.dispose();
      if (collider) physics.world.removeCollider(collider, false);
    },
  };
}
