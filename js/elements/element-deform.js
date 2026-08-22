// Cheap CPU deformation of a merged element mesh. The timber builder welds a whole Burma bridge into
// one mesh per material, which is what keeps the draw calls down – but a bridge has to move. So each
// vertex is classified once at build time into a *station* `u` (0..1 along the span), a *group*
// (the whole span, or one plank) and a *weight* (how much of the group's motion it follows), and
// every frame the rest positions are offset by `weight × offset[group]`.
//
// Nothing here knows what an element is; the shapes come from js/elements/element.js.

import * as THREE from "three";

/**
 * @param {THREE.Mesh[]} meshes merged meshes whose geometry may be rewritten every frame
 * @param {{ classify: (x:number, y:number, z:number) => { u:number, group?:number, weight:number },
 *   groupCount?: number, margin?: number }} options
 *   `margin` inflates the bounding sphere so the deformed mesh is not culled at the screen edge.
 * @returns {{ groupCount: number, vertexCount: number, offsets: Float32Array,
 *   update(shape?: ((u:number, group:number) => number)|null): boolean, rest(): void, dispose(): void }}
 *   Write into `offsets` (3 floats per group, element-local metres), then call `update()`.
 */
export function createDeformer(meshes, { classify, groupCount = 1, margin = 0.6 }) {
  const entries = [];
  let vertexCount = 0;

  for (const mesh of meshes) {
    const attribute = mesh.geometry.getAttribute("position");
    if (!attribute) continue;
    const count = attribute.count;
    const rest = new Float32Array(attribute.array);        // copy: the rest shape never changes
    const weight = new Float32Array(count);
    const station = new Float32Array(count);
    const group = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      const c = classify(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]);
      station[i] = c.u;
      weight[i] = c.weight;
      group[i] = Math.min(groupCount - 1, Math.max(0, c.group || 0));
    }
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    mesh.geometry.boundingSphere.radius += margin;
    entries.push({ attribute, rest, weight, station, group, count });
    vertexCount += count;
  }

  const offsets = new Float32Array(Math.max(1, groupCount) * 3);
  let dirty = false;

  return {
    groupCount,
    vertexCount,
    /** Element-local offset per group: [x0, y0, z0, x1, …]. Write, then call `update()`. */
    offsets,

    /**
     * Apply `offsets` to every vertex. `shape(u, group)` optionally scales the weight per frame –
     * that is how a cargo net sags under the climber instead of always in the middle.
     * @returns {boolean} true when geometry was actually rewritten
     */
    update(shape = null) {
      let moving = false;
      for (let g = 0; g < groupCount * 3; g++) {
        if (Math.abs(offsets[g]) > 1e-4) { moving = true; break; }
      }
      if (!moving && !dirty) return false;                 // at rest and already written: free frame
      for (const e of entries) {
        const array = e.attribute.array;
        for (let i = 0; i < e.count; i++) {
          const g = e.group[i] * 3;
          const w = shape ? e.weight[i] * shape(e.station[i], e.group[i]) : e.weight[i];
          const i3 = i * 3;
          array[i3] = e.rest[i3] + offsets[g] * w;
          array[i3 + 1] = e.rest[i3 + 1] + offsets[g + 1] * w;
          array[i3 + 2] = e.rest[i3 + 2] + offsets[g + 2] * w;
        }
        e.attribute.needsUpdate = true;
      }
      dirty = moving;
      return true;
    },

    /** Snap everything back onto the rest shape (dispose, teleport, editor reset). */
    rest() {
      offsets.fill(0);
      for (const e of entries) {
        e.attribute.array.set(e.rest);
        e.attribute.needsUpdate = true;
      }
      dirty = false;
    },

    dispose() { entries.length = 0; },
  };
}
