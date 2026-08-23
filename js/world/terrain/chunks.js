// Terrain chunk grid. The height field is cut into `CHUNKS.perSide²` meshes that share one material.
// Each chunk owns ONE vertex buffer and ONE index buffer that holds three triangle lists back to
// back (full / half / third resolution); `geometry.setDrawRange` picks the level, so switching LOD
// costs no upload and can never crack *inside* a chunk. Between neighbouring chunks at different
// levels the classic fix is used: every level also draws a skirt – a short wall hanging down along
// the four chunk edges – which hides the T-junction gaps. Chunk meshes carry real bounding boxes,
// so the frustum removes most of them in a ground-level view.
// Contract: docs/architecture.md → "World modules → js/world/terrain.js".
import * as THREE from "three";
import { makeNoise2D } from "../../core/rng.js";
import { hubWeightAt } from "./heightfield.js";
import { buildChunkIndex, chunkLodFor, rimVertex } from "./chunk-index.js";

// 6 × 6 rather than a finer grid: every chunk is a draw call, and the budget (< 300 calls for the
// whole frame) is tighter than the triangle budget once the LODs are in.
export const CHUNKS = Object.freeze({
  perSide: 6,                  // 6 × 6 chunks of 80 m over the 480 m world
  strides: [1, 2, 4],          // vertex stride per LOD → 2 m / 4 m / 8 m grid inside a chunk
  skirtDepth: 2.6,             // metres the skirt hangs below the chunk rim
  near: 70,                    // metres to the *nearest point* of the chunk: LOD 0 inside
  mid: 170,                    // LOD 1 inside, LOD 2 beyond
  hysteresis: 14,              // metres of overlap before a chunk falls back to the coarser level
});

const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Per-vertex ground attributes (duff/moisture/hub weights, litter macro variation, macro tint). */
function makeVertexPainter({ field, sampler, rng, duffSlopeDeg }) {
  const { moisture, size, hubs } = field;
  const half = size / 2;
  const nMacro = makeNoise2D(rng.fork("macro").seed);
  const nFine = makeNoise2D(rng.fork("fine").seed);
  const nPatch = makeNoise2D(rng.fork("patch").seed);
  const nLitter = makeNoise2D(rng.fork("litter-macro").seed);
  const [s0, s1] = duffSlopeDeg.map((d) => (d * Math.PI) / 180);
  const normal = new THREE.Vector3();
  return function paint(x, z, gi, v, attr) {
    sampler.normalAt(x, z, normal);
    const hubW = hubWeightAt(hubs, x, z);
    const slopeW = smoothstep(s0, s1, Math.acos(Math.min(1, normal.y)));
    const patchW = smoothstep(0.55, 0.85, 0.5 + 0.5 * (nPatch(x / 28, z / 28) + 0.5 * nPatch(x / 9 + 7, z / 9))) * 0.75;
    const moist = moisture[gi] * (1 - hubW);
    const m = nMacro(x / 41, z / 41), f = nFine(x / 9, z / 9);
    const bright = (1 + 0.14 * m + 0.06 * f) * (1 + 0.06 * hubW);
    attr.normal[v * 3] = normal.x; attr.normal[v * 3 + 1] = normal.y; attr.normal[v * 3 + 2] = normal.z;
    attr.uv[v * 2] = (x + half) / size; attr.uv[v * 2 + 1] = (z + half) / size;
    attr.color[v * 3] = bright * (1 + 0.05 * m);
    attr.color[v * 3 + 1] = bright;
    attr.color[v * 3 + 2] = bright * (1 - 0.06 * m);
    attr.terrain[v * 4] = clamp01(slopeW + moist * 0.9 + patchW) * (1 - hubW * 0.85);
    attr.terrain[v * 4 + 1] = moist;
    attr.terrain[v * 4 + 2] = hubW;
    attr.terrain[v * 4 + 3] = clamp01(0.5 + 0.32 * (nLitter(x / 34, z / 34) + 0.5 * nLitter(x / 11 + 5, z / 11)));
  };
}

/** Builds the (cells+1)² grid + four skirt rows of one chunk into a BufferGeometry. */
function buildChunkGeometry({ field, paint, index, cx, cz, cells }) {
  const { heights, N, resolution, size } = field;
  const half = size / 2, row = cells + 1, grid = row * row;
  const count = grid + 4 * row;
  const attr = {
    position: new Float32Array(count * 3), normal: new Float32Array(count * 3),
    uv: new Float32Array(count * 2), color: new Float32Array(count * 3), terrain: new Float32Array(count * 4),
  };
  for (let iz = 0; iz < row; iz++) {
    const gz = cz * cells + iz, z = -half + gz * resolution;
    for (let ix = 0; ix < row; ix++) {
      const gx = cx * cells + ix, x = -half + gx * resolution, v = iz * row + ix;
      attr.position[v * 3] = x; attr.position[v * 3 + 1] = heights[gz * N + gx]; attr.position[v * 3 + 2] = z;
      paint(x, z, gz * N + gx, v, attr);
    }
  }
  // skirt rows: copy the rim vertex, drop it by CHUNKS.skirtDepth (same normal → no dark seam)
  for (let edge = 0; edge < 4; edge++) {
    for (let i = 0; i < row; i++) {
      const src = rimVertex(cells, edge, i), dst = grid + edge * row + i;
      attr.position[dst * 3] = attr.position[src * 3];
      attr.position[dst * 3 + 1] = attr.position[src * 3 + 1] - CHUNKS.skirtDepth;
      attr.position[dst * 3 + 2] = attr.position[src * 3 + 2];
      for (let c = 0; c < 3; c++) { attr.normal[dst * 3 + c] = attr.normal[src * 3 + c]; attr.color[dst * 3 + c] = attr.color[src * 3 + c]; }
      for (let c = 0; c < 2; c++) attr.uv[dst * 2 + c] = attr.uv[src * 2 + c];
      for (let c = 0; c < 4; c++) attr.terrain[dst * 4 + c] = attr.terrain[src * 4 + c];
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(attr.position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(attr.normal, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(attr.uv, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(attr.color, 3));
  geometry.setAttribute("aTerrain", new THREE.BufferAttribute(attr.terrain, 4));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * @param {{ field, sampler, rng, material: THREE.Material, duffSlopeDeg: number[] }} o
 * @returns {{ group: THREE.Group, chunks, stats, update(focusPos): void, dispose(): void }}
 *   `update(focusPos)` picks a level per chunk from the distance to its nearest point – geometry is
 *   generated once and never depends on the camera, so the world stays deterministic.
 */
export function createTerrainChunks({ field, sampler, rng, material, duffSlopeDeg }) {
  const perSide = CHUNKS.perSide;
  const cells = field.n / perSide;
  if (!Number.isInteger(cells)) throw new Error(`terrain grid ${field.n} does not split into ${perSide} chunks`);
  const { index, ranges } = buildChunkIndex(cells, CHUNKS.strides);
  const paint = makeVertexPainter({ field, sampler, rng, duffSlopeDeg });

  const group = new THREE.Group();
  group.name = "terrain";
  const chunks = [];
  const span = cells * field.resolution, half = field.size / 2;
  for (let cz = 0; cz < perSide; cz++) {
    for (let cx = 0; cx < perSide; cx++) {
      const geometry = buildChunkGeometry({ field, paint, index, cx, cz, cells });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `terrain-chunk-${cx}-${cz}`;
      mesh.receiveShadow = true;
      mesh.castShadow = false;          // the ground never casts – the sun shadow box is for trees and timber
      mesh.matrixAutoUpdate = false;    // vertices are already in world space
      mesh.updateMatrix();
      group.add(mesh);
      chunks.push({ mesh, lod: -1, minX: -half + cx * span, maxX: -half + (cx + 1) * span, minZ: -half + cz * span, maxZ: -half + (cz + 1) * span });
    }
  }

  const stats = { chunks: chunks.length, cells, byLod: [0, 0, 0] };

  function update(focus) {
    const fx = focus.x, fz = focus.z;
    stats.byLod[0] = stats.byLod[1] = stats.byLod[2] = 0;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const dx = Math.max(c.minX - fx, 0, fx - c.maxX);
      const dz = Math.max(c.minZ - fz, 0, fz - c.maxZ);
      const lod = chunkLodFor(Math.sqrt(dx * dx + dz * dz), c.lod, CHUNKS);
      stats.byLod[lod]++;
      if (lod === c.lod) continue;
      c.lod = lod;
      c.mesh.geometry.setDrawRange(ranges[lod].start, ranges[lod].count);
    }
  }

  update({ x: 0, z: 0 });
  return {
    group, chunks, stats, ranges, update,
    dispose() {
      for (const c of chunks) c.mesh.geometry.dispose();
      group.clear();
    },
  };
}
