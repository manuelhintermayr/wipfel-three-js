// Topology of a terrain chunk: the index lists of its three LODs and the distance rule that picks
// one. Pure integer/float maths – no THREE, no Rapier – so it stays unit-testable in Node.
// Used by terrain/chunks.js; contract: docs/architecture.md → "World modules → js/world/terrain.js".

/**
 * One index buffer holding a triangle list per LOD, back to back, so switching LOD is a
 * `setDrawRange` and never a buffer upload.
 *
 * Vertex layout of a chunk: `(cells + 1)²` grid vertices row-major (`v = iz * row + ix`), followed
 * by four skirt rows of `cells + 1` vertices – the −Z, +Z, −X and +X rim pushed straight down. Skirt
 * vertices are shared by every level, which is why a coarse level can hang its wall off the same
 * points as the fine one; the wall is what hides the T-junction crack against a finer neighbour.
 *
 * @param {number} cells grid cells per chunk side at full resolution
 * @param {number[]} strides vertex stride per LOD; each must divide `cells`
 * @returns {{ index: Uint32Array, ranges: {start:number,count:number}[], vertexCount:number }}
 */
export function buildChunkIndex(cells, strides) {
  if (!Number.isInteger(cells) || cells < 1) throw new Error(`terrain chunk needs a positive cell count, got ${cells}`);
  for (const stride of strides) {
    if (!Number.isInteger(stride) || stride < 1 || cells % stride !== 0) {
      throw new Error(`terrain chunk LOD stride ${stride} does not divide ${cells} cells`);
    }
  }
  const row = cells + 1, grid = row * row, vertexCount = grid + 4 * row;
  let total = 0;
  for (const s of strides) total += ((cells / s) ** 2 * 2 + (cells / s) * 8) * 3;
  const index = new Uint32Array(total);
  const ranges = [];
  let k = 0;
  // t0/t1 = rim pair, b0/b1 = their skirt twins; `flip` turns the wall around so it faces outwards.
  const wall = (t0, t1, b0, b1, flip) => {
    if (flip) { index[k++] = t0; index[k++] = b1; index[k++] = b0; index[k++] = t0; index[k++] = t1; index[k++] = b1; }
    else { index[k++] = t0; index[k++] = b0; index[k++] = b1; index[k++] = t0; index[k++] = b1; index[k++] = t1; }
  };
  for (const stride of strides) {
    const start = k;
    for (let iz = 0; iz < cells; iz += stride) {
      for (let ix = 0; ix < cells; ix += stride) {
        const a = iz * row + ix, b = a + stride, c = a + stride * row, d = c + stride;
        index[k++] = a; index[k++] = c; index[k++] = b;      // same diagonal as the Rapier heightfield
        index[k++] = c; index[k++] = d; index[k++] = b;
      }
    }
    for (let i = 0; i < cells; i += stride) {
      const j = i + stride;
      wall(i, j, grid + i, grid + j, true);                                                  // −Z rim
      wall(cells * row + i, cells * row + j, grid + row + i, grid + row + j, false);         // +Z rim
      wall(i * row, j * row, grid + 2 * row + i, grid + 2 * row + j, false);                 // −X rim
      wall(i * row + cells, j * row + cells, grid + 3 * row + i, grid + 3 * row + j, true);  // +X rim
    }
    ranges.push({ start, count: k - start });
  }
  return { index, ranges, vertexCount };
}

/** Index of the skirt twin of rim vertex `i` on `edge` (0 = −Z, 1 = +Z, 2 = −X, 3 = +X). */
export function rimVertex(cells, edge, i) {
  const row = cells + 1;
  if (edge === 0) return i;
  if (edge === 1) return cells * row + i;
  if (edge === 2) return i * row;
  return i * row + cells;
}

/**
 * LOD for a chunk whose nearest point is `distance` metres away. `current` (−1 = never assigned)
 * widens the band it already sits in by `hysteresis`, so a chunk on a threshold cannot flicker.
 * @param {number} distance
 * @param {number} current
 * @param {{ near:number, mid:number, hysteresis:number }} t
 * @returns {0|1|2}
 */
export function chunkLodFor(distance, current, t) {
  const near = current === 0 ? t.near + t.hysteresis : t.near;
  const mid = current === 0 || current === 1 ? t.mid + t.hysteresis : t.mid;
  if (distance < near) return 0;
  if (distance < mid) return 1;
  return 2;
}
