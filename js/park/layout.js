// M2a park layout generator (ROADMAP "Ein Park"): a seeded, validated arrangement of hero trees,
// platforms, catalogue elements, junctions and Flying Foxes for 15 secured routes (blue I-V, red I-VI,
// black I-IV) plus one hidden legendary finale, fanned out from four terrain hubs instead of the one
// M1.1 used (spawn only) – packing 16 routes' entry bearings around a single hub cannot clear the
// 35° `entryBearingGap` (16 routes = 22.5° apart at best), so each route is assigned a `hub` index and
// fans out only against the *other routes at that same hub* (js/world/terrain.js#hubs: 0 spawn, 1 hut,
// 2 deck-east, 3 deck-top – all 100+ m apart, so cross-hub route trees never need to check each other's
// bearings, only the existing `routeTreeClearance`/`farFromOtherRoutes` distance rule, already global).
//
// Chain lengths deliberately stay short and mostly flat (2-4 platforms) rather than literally scaling
// GDD's "blue 4, red 4-5, black 5-6" fifteen-fold: 15 × (4..6) is 60-90 platforms, far past the ≤ 52
// total-platform performance budget this milestone sets (measured draw calls/triangles at spawn) – the
// same trade-off M1.1's own PARK_CONFIG comment already made for six routes against a ≤ 26 cap. Category
// difficulty keeps escalating the way it always has here: deck-height window and excluded/heavier
// catalogue kinds (layout-validate.js#CATEGORY_RULES), not raw platform count (ROADMAP M1's own
// acceptance line: "Rot fühlt sich anders an als Blau … nicht nur schwerer").
//
// Pure and THREE-free – js/park/loader.js turns the result into a scene, tools/bake-park.mjs snapshots
// it to assets/parks/sonnwendberg.json, tests/unit/layout.test.mjs asserts every constraint in
// layout-validate.js holds for seeds 1..8. Contract: docs/architecture.md → "Park layout (M2a)".
import { Rng } from "../core/rng.js";
import { buildRouteCandidate } from "./layout-route.js";
import { LAYOUT_LIMITS, bearingsClear } from "./layout-validate.js";

/**
 * Default park: 15 secured routes across four hubs + the hidden legendary finale at the hut hub.
 * `hub` indexes `terrain.hubs` (0 spawn / 1 hut / 2 deck-east / 3 deck-top). `join` (GDD §3.9
 * "Kreuzungspodeste", M2a) makes this route's *first* platform an existing platform of the named
 * host route of the same category – see js/park/layout-route.js#buildRouteCandidate's `join` option
 * and this module's `resolveJoin`. Route "blue-1" keeps chainLength 4 for `LEGACY_BLUE_1`
 * (js/park/layout-route.js) – every other chain length is chosen to fit the platform budget.
 */
export const PARK_CONFIG = Object.freeze({
  id: "sonnwendberg",
  routes: Object.freeze([
    // --- hub 0 · spawn (6 routes: blue I-III, red I-III; red III is a junction off red II) ----------
    Object.freeze({ category: "blue", numeral: "I", chainLength: 4, hub: 0 }),
    // M4 (ROADMAP "Koop-Übungen", GDD §3.11): `coopEdge` forces this route's edge #0 to a specific
    // catalogue kind instead of the generator's usual random pool pick – js/park/layout-route.js#buildEdges
    // honours it. One blue + one red route, deterministic across every seed (see js/park/layout-route.js's
    // own header on why this is safe for the "same seed, same JSON" determinism test).
    Object.freeze({ category: "blue", numeral: "II", chainLength: 3, hub: 0, coopEdge: { index: 0, kind: "team-bridge" } }),
    Object.freeze({ category: "blue", numeral: "III", chainLength: 3, hub: 0 }),
    Object.freeze({ category: "red", numeral: "I", chainLength: 3, hub: 0 }),
    Object.freeze({ category: "red", numeral: "II", chainLength: 3, hub: 0, coopEdge: { index: 0, kind: "counterweight-lift" } }),
    Object.freeze({ category: "red", numeral: "III", chainLength: 2, hub: 0, join: { hostNumeral: "II", hostPlatformIndex: 1 } }),
    // --- hub 1 · hut (blue IV-V, black I-II – black II is a junction off black I – + legendary) -----
    Object.freeze({ category: "blue", numeral: "IV", chainLength: 3, hub: 1 }),
    Object.freeze({ category: "blue", numeral: "V", chainLength: 2, hub: 1 }),
    Object.freeze({ category: "black", numeral: "I", chainLength: 4, hub: 1 }),
    Object.freeze({ category: "black", numeral: "II", chainLength: 3, hub: 1, join: { hostNumeral: "I", hostPlatformIndex: 2 } }),
    Object.freeze({ category: "legendary", numeral: "", chainLength: 6, hub: 1 }),
    // --- hub 2 · deck-east (red IV-V, black III) -----------------------------------------------------
    Object.freeze({ category: "red", numeral: "IV", chainLength: 3, hub: 2 }),
    Object.freeze({ category: "red", numeral: "V", chainLength: 3, hub: 2 }),
    Object.freeze({ category: "black", numeral: "III", chainLength: 3, hub: 2 }),
    // --- hub 3 · deck-top (red VI, black IV) ---------------------------------------------------------
    Object.freeze({ category: "red", numeral: "VI", chainLength: 3, hub: 3 }),
    Object.freeze({ category: "black", numeral: "IV", chainLength: 3, hub: 3 }),
  ]),
  headingAttempts: 60,       // bounded retries per route before this seed gives up (relax tree-angle first)
});

/**
 * `?routes=6` (ROADMAP M2a "quick dev"): the M1 six-route park (2 blue/2 red/2 black, all at the spawn
 * hub, no junctions, no legendary) – js/main.js picks this instead of the default `PARK_CONFIG` above
 * when the URL asks for it, unchanged from M1.1/M1.2 so the old, fast-to-load park stays available for
 * quick iteration on anything that is not the M2a content itself.
 */
export const PARK_CONFIG_SMALL = Object.freeze({
  id: "sonnwendberg-small",
  routes: Object.freeze([
    Object.freeze({ category: "blue", numeral: "I", chainLength: 4, hub: 0 }),
    Object.freeze({ category: "blue", numeral: "II", chainLength: 4, hub: 0 }),
    Object.freeze({ category: "red", numeral: "I", chainLength: 4, hub: 0 }),
    Object.freeze({ category: "red", numeral: "II", chainLength: 4, hub: 0 }),
    Object.freeze({ category: "black", numeral: "I", chainLength: 5, hub: 0 }),
    Object.freeze({ category: "black", numeral: "II", chainLength: 5, hub: 0 }),
  ]),
  headingAttempts: 60,
});

const ROMAN_INDEX = Object.freeze({ I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 });

/** `blue-2`, `legendary` (no numeral suffix – there is only one), … */
function routeIdFor(plan) {
  if (plan.category === "legendary") return "legendary";
  const n = ROMAN_INDEX[plan.numeral];
  if (!n) throw new Error(`park layout: route numeral "${plan.numeral}" is not in ROMAN_INDEX`);
  return `${plan.category}-${n}`;
}

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
  const hubs = terrain.hubs;

  // One fan (base bearing + retried-bearing list) per hub actually used, so a route's 35° entry gap
  // only ever competes with the handful of *other* routes fanning out of the very same hub.
  const hubGroups = new Map();
  config.routes.forEach((plan, index) => {
    const hubIndex = plan.hub || 0;
    if (!hubGroups.has(hubIndex)) hubGroups.set(hubIndex, { slots: [], usedBearings: [] });
    hubGroups.get(hubIndex).slots.push(index);
  });
  for (const [hubIndex, group] of hubGroups) {
    group.baseBearing = rng.fork(`hub-bearing:${hubIndex}`).float(0, Math.PI * 2);
    group.spread = (Math.PI * 2) / group.slots.length;
  }

  const heroTrees = [];
  const routes = [];
  const routesById = new Map();

  config.routes.forEach((plan, index) => {
    const routeId = routeIdFor(plan);
    const routeRng = rng.fork(`route:${routeId}`);
    const hubIndex = plan.hub || 0;
    const hub = hubs[hubIndex] || hubs[0];
    const group = hubGroups.get(hubIndex);
    const slot = group.slots.indexOf(index);
    const homePoint = { x: hub.x, z: hub.z };
    const join = resolveJoin(plan, routesById, heroTrees);

    const candidate = findRoute({
      routeId, plan, slot, spread: group.spread, baseBearing: group.baseBearing, terrain, routeRng,
      otherTrees: heroTrees, spawnHub: hub, homePoint, usedBearings: group.usedBearings,
      attempts: config.headingAttempts, join,
    });
    if (!candidate) {
      throw new Error(`park layout: seed ${seed} could not place route "${routeId}" after ${config.headingAttempts} heading attempts`);
    }

    const newTreesStart = candidate.joinTreeIndex != null ? 1 : 0;
    const treeOffset = heroTrees.length;
    for (const tree of candidate.trees.slice(newTreesStart)) {
      heroTrees.push({ x: tree.x, z: tree.z, species: tree.species, height: tree.height });
    }
    candidate.platforms.forEach((platform, i) => {
      platform.treeIndex = i === 0 && candidate.joinTreeIndex != null ? candidate.joinTreeIndex : treeOffset + (i - newTreesStart);
    });

    const route = {
      id: routeId, category: plan.category, numeral: plan.numeral, nameKey: `route.${routeId}.name`,
      hub: hubIndex, entry: candidate.entry, platforms: candidate.platforms, edges: candidate.edges, zip: candidate.zip,
    };
    routes.push(route);
    routesById.set(routeId, route);
  });

  if (heroTrees.length > LAYOUT_LIMITS.maxTotalPlatforms) {
    throw new Error(`park layout: seed ${seed} produced ${heroTrees.length} platforms, over the ${LAYOUT_LIMITS.maxTotalPlatforms} cap`);
  }

  return { id: config.id, seed, generated: true, heroTrees, routes };
}

/** `plan.join` → the concrete `join` option `buildRouteCandidate` understands, or null. */
function resolveJoin(plan, routesById, heroTrees) {
  if (!plan.join) return null;
  const hostId = `${plan.category}-${ROMAN_INDEX[plan.join.hostNumeral]}`;
  const host = routesById.get(hostId);
  if (!host) throw new Error(`park layout: route "${plan.category} ${plan.numeral}" joins unknown/not-yet-built host "${hostId}"`);
  const hostPlatform = host.platforms[plan.join.hostPlatformIndex];
  if (!hostPlatform) throw new Error(`park layout: host "${hostId}" has no platform #${plan.join.hostPlatformIndex} to join`);
  return {
    hostTree: heroTrees[hostPlatform.treeIndex],
    hostTreeIndex: hostPlatform.treeIndex,
    hostPlatformId: hostPlatform.id,
    hostDeckHeight: hostPlatform.deckHeight,
  };
}

/**
 * Try increasingly relaxed headings for one route until a candidate satisfies every constraint in
 * layout-validate.js, or give up after `attempts` tries. The first try is an even 360°/hub-routeCount
 * fan-out slot; later tries widen the jitter, which is the "relax tree-angle first" the ROADMAP asks
 * for. A junction route's "bearing" only seeds which way its own new platforms walk off from the
 * shared host platform – it does not need (and is not checked against) the hub's entry-bearing fan,
 * since its real entry sits wherever the host's interior platform already is.
 */
function findRoute({ routeId, plan, slot, spread, baseBearing, terrain, routeRng, otherTrees, spawnHub, homePoint, usedBearings, attempts, join }) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const relax = Math.min(1, attempt / 6);
    const jitter = attempt === 0 ? 0 : routeRng.float(-spread * 0.4, spread * 0.4) * relax;
    const bearing = join ? routeRng.float(0, Math.PI * 2) : baseBearing + slot * spread + jitter;
    if (!join && !bearingsClear(bearing, usedBearings)) continue;
    const candidate = buildRouteCandidate({
      routeId, category: plan.category, chainLength: plan.chainLength, bearing,
      terrain, rng: routeRng, otherTrees, spawnHub, homePoint, join,
      // M4 (ROADMAP "Koop-Übungen"): a fixed, seed-independent edge-kind override – see PARK_CONFIG above.
      coopEdge: plan.coopEdge || null,
    });
    if (candidate) { if (!join) usedBearings.push(bearing); return candidate; }
  }
  return null;
}
