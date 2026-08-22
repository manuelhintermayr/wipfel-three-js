// Terrain: slope height field (terrain/heightfield.js) graded along the path network
// (terrain/paths.js) → BufferGeometry with the same triangulation as the Rapier heightfield
// collider, blended ground material (terrain/material.js) and a sampling API for placement.
// Contract: docs/architecture.md → "World modules → js/world/terrain.js".
import * as THREE from "three";
import { WORLD } from "../config.js";
import { GROUP, groups } from "../core/physics.js";
import { makeNoise2D } from "../core/rng.js";
import { buildHeightfield, hubWeightAt } from "./terrain/heightfield.js";
import { buildPaths } from "./terrain/paths.js";
import { createTerrainMaterial } from "./terrain/material.js";
import { getGroundTextures } from "../procgen/textures/ground.js";

export const TERRAIN = Object.freeze({
  duffSlopeDeg: [22, 34],      // moss/needle duff fades in between these slopes
  friction: 0.9,
});

const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const clamp01 = (v) => Math.min(1, Math.max(0, v));

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

/** Grid mesh: positions, uv (0..1 over the square), vertex colours (macro tint), aTerrain (duff, moisture, hub). */
function buildGeometry(field, sampler, rng) {
  const { heights, moisture, N, n, resolution, size, hubs } = field;
  const half = size / 2, count = N * N;
  const positions = new Float32Array(count * 3), uvs = new Float32Array(count * 2);
  const colors = new Float32Array(count * 3), terrain = new Float32Array(count * 3);
  const nMacro = makeNoise2D(rng.fork("macro").seed), nFine = makeNoise2D(rng.fork("fine").seed), nPatch = makeNoise2D(rng.fork("patch").seed);
  const [s0, s1] = TERRAIN.duffSlopeDeg.map((d) => d * Math.PI / 180);
  for (let iz = 0; iz < N; iz++) {
    const z = -half + iz * resolution;
    for (let ix = 0; ix < N; ix++) {
      const x = -half + ix * resolution, i = iz * N + ix;
      positions[i * 3] = x; positions[i * 3 + 1] = heights[i]; positions[i * 3 + 2] = z;
      uvs[i * 2] = (x + half) / size; uvs[i * 2 + 1] = (z + half) / size;
      const hubW = hubWeightAt(hubs, x, z);
      const slopeW = smoothstep(s0, s1, sampler.slopeAt(x, z));
      const patchW = smoothstep(0.55, 0.85, 0.5 + 0.5 * (nPatch(x / 28, z / 28) + 0.5 * nPatch(x / 9 + 7, z / 9))) * 0.75;
      const moist = moisture[i] * (1 - hubW);
      terrain[i * 3] = clamp01(slopeW + moist * 0.9 + patchW) * (1 - hubW * 0.85);
      terrain[i * 3 + 1] = moist;
      terrain[i * 3 + 2] = hubW;
      const m = nMacro(x / 41, z / 41), f = nFine(x / 9, z / 9);
      const bright = (1 + 0.14 * m + 0.06 * f) * (1 + 0.06 * hubW);
      colors[i * 3] = bright * (1 + 0.05 * m);
      colors[i * 3 + 1] = bright;
      colors[i * 3 + 2] = bright * (1 - 0.06 * m);
    }
  }
  const index = new Uint32Array(n * n * 6);
  let k = 0;
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const a = iz * N + ix, b = a + 1, c = a + N, d = c + 1;   // same split as Rapier: diagonal c–b
      index[k++] = a; index[k++] = c; index[k++] = b;
      index[k++] = c; index[k++] = d; index[k++] = b;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aTerrain", new THREE.BufferAttribute(terrain, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
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
  const geometry = buildGeometry(field, sampler, trng.fork("vertex-colour"));
  const textures = getGroundTextures(trng.fork("textures").seed);
  const maskTexture = createMaskTexture(paths);
  const material = createTerrainMaterial({ textures, pathMask: maskTexture, size });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "terrain";
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const collider = physics ? createCollider(physics, field) : null;

  const half = size / 2;
  const hubs = field.hubs.map((h) => ({ id: h.id, x: h.x, z: h.z, radius: h.radius, y: sampler.heightAt(h.x, h.z) }));
  const spawn = { x: hubs[0].x, y: hubs[0].y, z: hubs[0].z };

  return {
    mesh,
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
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      maskTexture.dispose();
      if (collider) physics.world.removeCollider(collider, false);
    },
  };
}
