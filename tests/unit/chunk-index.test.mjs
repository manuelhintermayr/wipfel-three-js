// Terrain chunk topology: index ranges per LOD, skirt walls, and the hysteretic LOD rule.
import test from "node:test";
import assert from "node:assert/strict";
import { buildChunkIndex, chunkLodFor, rimVertex } from "../../js/world/terrain/chunk-index.js";

const THRESHOLDS = { near: 85, mid: 190, hysteresis: 14 };

test("each LOD has grid + skirt triangles for its stride", () => {
  const { ranges } = buildChunkIndex(30, [1, 2, 3]);
  const triangles = ranges.map((r) => r.count / 3);
  assert.deepEqual(triangles, [30 * 30 * 2 + 30 * 8, 15 * 15 * 2 + 15 * 8, 10 * 10 * 2 + 10 * 8]);
});

test("ranges are contiguous and cover the whole index buffer", () => {
  const { index, ranges } = buildChunkIndex(12, [1, 2, 4]);
  let cursor = 0;
  for (const r of ranges) {
    assert.equal(r.start, cursor);
    cursor += r.count;
  }
  assert.equal(cursor, index.length);
});

test("every index stays inside the vertex buffer", () => {
  const { index, vertexCount } = buildChunkIndex(8, [1, 2, 4]);
  assert.equal(vertexCount, 9 * 9 + 4 * 9);
  for (let i = 0; i < index.length; i++) assert.ok(index[i] < vertexCount, `index ${i} = ${index[i]}`);
});

test("the finest LOD uses every grid vertex, the coarsest only every fourth", () => {
  const { index, ranges } = buildChunkIndex(8, [1, 4]);
  const used = (r) => new Set(Array.from(index.slice(r.start, r.start + r.count)).filter((v) => v < 81));
  assert.equal(used(ranges[0]).size, 81);
  assert.equal(used(ranges[1]).size, 9);          // 3 × 3 corners of the four coarse cells
});

test("skirt walls hang off rim vertices only", () => {
  const cells = 6, grid = 49;
  const { index, ranges } = buildChunkIndex(cells, [1]);
  const gridTris = cells * cells * 2;
  const skirt = index.slice(ranges[0].start + gridTris * 3, ranges[0].start + ranges[0].count);
  const rim = new Set();
  for (let edge = 0; edge < 4; edge++) for (let i = 0; i <= cells; i++) rim.add(rimVertex(cells, edge, i));
  for (const v of skirt) assert.ok(v >= grid || rim.has(v), `vertex ${v} is neither skirt nor rim`);
  assert.ok(Array.from(skirt).some((v) => v >= grid));
});

test("stride must divide the chunk", () => {
  assert.throws(() => buildChunkIndex(30, [4]), /does not divide/);
  assert.throws(() => buildChunkIndex(0, [1]), /positive cell count/);
});

test("LOD follows the distance to the nearest point of the chunk", () => {
  assert.equal(chunkLodFor(10, -1, THRESHOLDS), 0);
  assert.equal(chunkLodFor(120, -1, THRESHOLDS), 1);
  assert.equal(chunkLodFor(400, -1, THRESHOLDS), 2);
});

test("hysteresis keeps a chunk on the finer level until it is clearly out", () => {
  assert.equal(chunkLodFor(90, 0, THRESHOLDS), 0);          // was fine: 85 + 14 still counts as near
  assert.equal(chunkLodFor(90, 1, THRESHOLDS), 1);          // was mid: no free upgrade at the same distance
  assert.equal(chunkLodFor(200, 1, THRESHOLDS), 1);
  assert.equal(chunkLodFor(205, 2, THRESHOLDS), 2);
});
