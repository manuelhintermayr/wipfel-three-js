// M1.1 park layout generator (ROADMAP): a seeded, validated arrangement of hero trees, platforms,
// catalogue elements and Flying Foxes for six routes (2 blue, 2 red, 2 black), fanned out from the
// spawn hub. Pure and THREE-free – js/park/loader.js turns the result into a scene, tools/bake-park.mjs
// snapshots it to assets/parks/sonnwendberg.json, tests/unit/layout.test.mjs asserts every constraint
// in layout-validate.js holds for seeds 1..8. Contract: docs/architecture.md → "Park layout (M1.1)".
import { Rng } from "../core/rng.js";
import { buildRouteCandidate } from "./layout-route.js";
import { LAYOUT_LIMITS, bearingsClear } from "./layout-validate.js";

/**
 * Default park: 2 blue / 2 red / 2 black routes. Chain lengths are platform counts (ladder + N
 * platforms + zip). Blue stays at the M0 course's 4 platforms (3 elements) so route "blue-1" can keep
 * its legacy kind sequence (js/park/layout-route.js#LEGACY_BLUE_1). Red and black are one platform
 * shorter than the prose spec (5/6) because 2×(4+5+6) = 30 breaks the ≤ 26 total-platform hard limit;
 * 2×(4+4+5) = 26 keeps blue exact and still orders blue ≤ red ≤ black. See HANDOVER.md for the note.
 */
export const PARK_CONFIG = Object.freeze({
  id: "sonnwendberg",
  routes: Object.freeze([
    Object.freeze({ category: "blue", numeral: "I", chainLength: 4 }),
    Object.freeze({ category: "blue", numeral: "II", chainLength: 4 }),
    Object.freeze({ category: "red", numeral: "I", chainLength: 4 }),
    Object.freeze({ category: "red", numeral: "II", chainLength: 4 }),
    Object.freeze({ category: "black", numeral: "I", chainLength: 5 }),
    Object.freeze({ category: "black", numeral: "II", chainLength: 5 }),
  ]),
  headingAttempts: 60,       // bounded retries per route before this seed gives up (relax tree-angle first)
});

const ROMAN_INDEX = Object.freeze({ I: 1, II: 2, III: 3, IV: 4 });

/**
 * @param {{ seed: number, terrain: { heightAt, isPath, slopeAt, hubs: Array<{x,z,radius}> },
 *   config?: typeof PARK_CONFIG }} options
 * @returns {{ id: string, seed: number, generated: true,
 *   heroTrees: Array<{x,z,species,height}>,
 *   routes: Array<{ id, category, numeral, nameKey, entry: {x,z,facing},
 *     platforms: Array<{id,treeIndex,deckHeight,kind,radius}>, edges: Array<{id,kind,from,to}>,
 *     zip: { fromPlatformId, landing: {x,z}, dir: {x,z}, length, gradient, deckTop, drop } }> }}
 *   parkDef – JSON-serialisable; the same seed + terrain always produce a byte-identical result.
 */
export function generateParkLayout({ seed, terrain, config = PARK_CONFIG }) {
  const rng = new Rng(seed);
  const spawnHub = terrain.hubs[0];
  const homePoint = { x: spawnHub.x, z: spawnHub.z };
  const baseBearing = rng.float(0, Math.PI * 2);
  const spread = (Math.PI * 2) / config.routes.length;

  const heroTrees = [];
  const routes = [];
  const usedBearings = [];

  config.routes.forEach((plan, index) => {
    const routeId = `${plan.category}-${ROMAN_INDEX[plan.numeral] || index + 1}`;
    const routeRng = rng.fork(`route:${routeId}`);
    const candidate = findRoute({
      routeId, plan, index, spread, baseBearing, terrain, routeRng,
      otherTrees: heroTrees, spawnHub, homePoint, usedBearings, attempts: config.headingAttempts,
    });
    if (!candidate) {
      throw new Error(`park layout: seed ${seed} could not place route "${routeId}" after ${config.headingAttempts} heading attempts`);
    }

    const treeOffset = heroTrees.length;
    for (const tree of candidate.trees) heroTrees.push({ x: tree.x, z: tree.z, species: tree.species, height: tree.height });
    candidate.platforms.forEach((platform, i) => { platform.treeIndex = treeOffset + i; });

    routes.push({
      id: routeId, category: plan.category, numeral: plan.numeral, nameKey: `route.${routeId}.name`,
      entry: candidate.entry, platforms: candidate.platforms, edges: candidate.edges, zip: candidate.zip,
    });
  });

  if (heroTrees.length > LAYOUT_LIMITS.maxTotalPlatforms) {
    throw new Error(`park layout: seed ${seed} produced ${heroTrees.length} platforms, over the ${LAYOUT_LIMITS.maxTotalPlatforms} cap`);
  }

  return { id: config.id, seed, generated: true, heroTrees, routes };
}

/**
 * Try increasingly relaxed headings for one route until a candidate satisfies every constraint in
 * layout-validate.js, or give up after `attempts` tries. The first try is an even 360°/routeCount
 * fan-out slot; later tries widen the jitter, which is the "relax tree-angle first" the ROADMAP asks for.
 */
function findRoute({ routeId, plan, index, spread, baseBearing, terrain, routeRng, otherTrees, spawnHub, homePoint, usedBearings, attempts }) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const relax = Math.min(1, attempt / 6);
    const jitter = attempt === 0 ? 0 : routeRng.float(-spread * 0.4, spread * 0.4) * relax;
    const bearing = baseBearing + index * spread + jitter;
    if (!bearingsClear(bearing, usedBearings)) continue;
    const candidate = buildRouteCandidate({
      routeId, category: plan.category, chainLength: plan.chainLength, bearing,
      terrain, rng: routeRng, otherTrees, spawnHub, homePoint,
    });
    if (candidate) { usedBearings.push(bearing); return candidate; }
  }
  return null;
}
