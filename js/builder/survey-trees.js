// Tree survey (M3a, GDD §4 "Beginn im Winter mit Baumliste (Art, Durchmesser, Gesundheit)"): a
// deterministic grid scan of the terrain that stands in for a forester's clipboard – every cell that
// clears the same hub/path/slope rules the real forest placement (js/world/forest-placement.js) and
// the layout generator (js/park/layout-validate.js) already use gets one candidate tree, complete with
// a made-up but reproducible health score. This is deliberately independent of the *live* forest
// instancing: js/builder/builder-state.js#adoptCandidate only needs a position, species and health to
// grow the draft's own heroTrees list – the actual mesh for a newly adopted tree appears once the
// world rebuilds from the edited parkDef (js/main.js), exactly like any other hero tree already does.
//
// Pure, no THREE – importable under plain `node` (tests/unit/builder-state.test.mjs), same reasoning
// as js/park/layout-validate.js's own header.
import { TREE_SPECIES } from "../procgen/geometry/tree-species.js";
import { farFromHubs, farFromPath } from "../park/layout-validate.js";

export const SURVEY = Object.freeze({
  targetCount: 80,
  gridStep: 16,             // metres between candidate cells before jitter and rejection
  jitter: 5,                // metres of per-cell random offset (keeps the grid from looking gridded)
  boundsInset: 12,
  maxSlopeRad: (36 * Math.PI) / 180,
  minHealthForPlatform: 0.55,     // GDD "dünne/kranke tragen kein Podest"
  healthRange: [0.12, 1.0],
  // Candidates skew towards the same canopy species the forest actually plants most of (pine/oak/
  // beech/maple) – hazel is deliberately excluded here, matching layout-route.js's own TREE_HEIGHT_RANGE
  // assumption that every *platform* tree is a canopy species, never understory.
  species: Object.freeze(["pine", "oak", "beech", "maple"]),
});

/**
 * @param {{ x, z }} tree
 * @param {Array<{x,z}>} others
 * @param {number} minDist
 */
function farFromOthers(tree, others, minDist) {
  for (const o of others) if (Math.hypot(tree.x - o.x, tree.z - o.z) < minDist) return false;
  return true;
}

/**
 * A deterministic "winter tree list" for the builder's tree survey tool. Independent of whatever the
 * live forest actually instanced this session – see the module header.
 * @param {{ heightAt, isPath?, slopeAt?, hubs: Array<{x,z,radius}>, bounds?: {min:{x,z},max:{x,z}} }} terrain
 * @param {import("../core/rng.js").Rng} rng
 * @param {{ count?: number, exclude?: Array<{x,z}>, excludeRadius?: number }} [options]
 *   `exclude`/`excludeRadius` (optional): positions a candidate must stay clear of – js/builder/
 *   builder-state.js passes the draft's current heroTrees so the survey never re-offers a tree that is
 *   already carrying a platform.
 * @returns {Array<{ id: string, x: number, z: number, species: string, height: number,
 *   trunkRadius: number, health: number }>}
 */
export function surveyTrees(terrain, rng, { count = SURVEY.targetCount, exclude = [], excludeRadius = 3 } = {}) {
  const bounds = terrain.bounds || { min: { x: -240, z: -240 }, max: { x: 240, z: 240 } };
  const inset = SURVEY.boundsInset;
  const minX = bounds.min.x + inset, maxX = bounds.max.x - inset;
  const minZ = bounds.min.z + inset, maxZ = bounds.max.z - inset;
  const candidates = [];
  const placed = [];   // candidates already accepted this call – kept apart from each other too

  let row = 0;
  for (let gz = minZ; gz <= maxZ; gz += SURVEY.gridStep, row++) {
    let col = 0;
    for (let gx = minX; gx <= maxX; gx += SURVEY.gridStep, col++) {
      const cellRng = rng.fork(`cell:${row}:${col}`);
      const x = gx + cellRng.float(-SURVEY.jitter, SURVEY.jitter);
      const z = gz + cellRng.float(-SURVEY.jitter, SURVEY.jitter);
      if (!farFromHubs(terrain, x, z)) continue;
      if (!farFromPath(terrain, x, z)) continue;
      if (typeof terrain.slopeAt === "function" && terrain.slopeAt(x, z) > SURVEY.maxSlopeRad) continue;
      if (!farFromOthers({ x, z }, exclude, excludeRadius)) continue;
      if (!farFromOthers({ x, z }, placed, SURVEY.gridStep * 0.5)) continue;

      const species = cellRng.pick(SURVEY.species);
      const spec = TREE_SPECIES[species] || TREE_SPECIES.pine;
      const height = cellRng.float(spec.height[0], spec.height[1]);
      const sizeFraction = (height - spec.height[0]) / Math.max(1e-3, spec.height[1] - spec.height[0]);
      const trunkRadius = spec.trunkRadius[0] + (spec.trunkRadius[1] - spec.trunkRadius[0]) * sizeFraction;
      // Health leans on the same size fraction a real forester would eyeball (a slender-for-its-height
      // tree reads as suppressed/unwell) plus its own independent roll – documented invention (GDD gives
      // no real formula), 0..1, `minHealthForPlatform` gates which candidates may carry a platform.
      // Skewed towards healthy (a real stand is mostly fine trees with a visible minority of thin/sick
      // ones to watch for) – roughly a quarter fall under `minHealthForPlatform`, enough to matter for
      // the ghost-marker legend (green/grey/red) without making most of the survey unusable.
      const [hLo, hHi] = SURVEY.healthRange;
      const health = Math.max(hLo, Math.min(hHi, cellRng.float(0.30, 1.08) * 0.82 + sizeFraction * 0.18));

      const candidate = { id: `survey-${row}-${col}`, x, z, species, height, trunkRadius, health };
      placed.push(candidate);
      candidates.push(candidate);
    }
  }

  rng.fork("shuffle-pick").shuffle(candidates);
  return candidates.slice(0, count);
}
