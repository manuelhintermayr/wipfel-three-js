// Builds one route candidate for js/park/layout.js: a chain of hero trees fanning out from the spawn
// hub, deck heights and catalogue element kinds respecting layout-validate.js's rules, and a Flying
// Fox finale reusing js/park/zip-plan.js's search. Returns null when this attempt (one heading, one
// rng draw) cannot satisfy every hard constraint – layout.js retries with a new heading before giving
// up on the seed ("relax tree-angle first", ROADMAP M1.1). No THREE – see catalogue-data.js's header
// comment for why: this module (and everything it imports) must stay importable under plain `node`.
import { CATALOGUE } from "../elements/catalogue-data.js";
import { planZipline } from "./zip-plan.js";
import {
  CATEGORY_RULES, LAYOUT_LIMITS, spanOk, farFromHubs, farFromPath, farFromOtherRoutes, zipLandingOk, metricSum,
} from "./layout-validate.js";

// Duplicated from js/elements/zipline.js#ZIPLINE: that module pulls in THREE (and the timber/canvas
// builders) transitively, which plain `node --test` cannot resolve (no bundler, no node_modules – see
// the note at the top of js/elements/catalogue-data.js). Keep the two numbers in sync by hand.
const ZIP_HARDWARE = Object.freeze({ cableHeight: 2.05, seatDrop: 2.02 });
/** Loader-side gradient window (RESEARCH-DATA §6: "3–6 % Gefälle") – wider than zip-plan.js's own
 *  4.5–6 % default, which was tuned for the single hand-built M0 course. */
const ZIP_GRADIENT = Object.freeze({ min: 0.03, max: 0.06, ideal: 0.045 });

const PLATFORM_RADIUS = Object.freeze({ standard: 1.25, transition: 1.10 });
export const EDGE_OFFSET = 1.15;         // where an exercise/zip leaves the deck, from the trunk axis (FIRST_COURSE.edgeOffset)
const ENTRY_DECK_OFFSET = 1.75;          // trunk-radius estimate + deckGap + step-out (js/park/entry-deck.js); the
                                          // real forest tree's precise trunk radius is not known at generation time –
                                          // a few centimetres of slack does not matter for a 2.3 m wide deck.
const ENTRY_START_MARGIN = [2.0, 6.0];   // first tree clears the spawn hub rim by at least this much
const TREE_HEIGHT_RANGE = [20, 27];
const CHAIN_TURN = 0.5;                  // max heading change per span step (radians)
const MAX_TREE_ATTEMPTS = 60;            // per-tree placement tries before this route attempt fails

/**
 * Route "blue-1" keeps the M0 course's exact element kinds and ids, so the hand-written route
 * definition (js/game/route.js#BLUE_I) and its consumer (js/game/session.js, out of scope for M1.1 –
 * see ROADMAP M1.2) keep matching a *generated* course. Every other route gets generated ids.
 */
const LEGACY_BLUE_1 = Object.freeze({
  routeId: "blue-1",
  kinds: Object.freeze(["burma-bridge", "hanging-planks", "net-bridge"]),
  ids: Object.freeze(["burma-1", "planks-1", "net-1"]),
});

/**
 * @param {{ routeId: string, category: "blue"|"red"|"black"|"legendary", chainLength: number, bearing: number,
 *   terrain: { heightAt, isPath, slopeAt, hubs }, rng: import("../core/rng.js").Rng,
 *   otherTrees: Array<{x,z}>, spawnHub: {x,z,radius}, homePoint: {x,z},
 *   join?: { hostTree: object, hostTreeIndex: number, hostPlatformId: string, hostDeckHeight: number } }} options
 *   `join` (M2a, GDD §3.9 "Kreuzungspodeste"): this route's first platform is an existing platform of
 *   an earlier route of the *same* category instead of a freshly placed tree – see js/park/layout.js#JUNCTIONS.
 * @returns {{ trees: Array<{x,z,species,height,y}>, entry: {x,z,facing},
 *   platforms: Array<{id,treeIndex,deckHeight,kind,radius}>, edges: Array<{id,kind,from,to}>,
 *   zip: object, joinTreeIndex: number|null }|null}
 */
export function buildRouteCandidate({ routeId, category, chainLength, bearing, terrain, rng, otherTrees, spawnHub, homePoint, join = null }) {
  const trees = buildChain({
    chainLength, bearing, terrain, rng, otherTrees, spawnHub,
    startTree: join ? join.hostTree : null,
  });
  if (!trees) { if (typeof process !== "undefined" && process.env && process.env.LAYOUT_DEBUG) console.error("  chain failed"); return null; }

  const heights = assignDeckHeights({ category, chainLength, rng, startHeight: join ? join.hostDeckHeight : null });
  const entry = buildEntry(trees[0], spawnHub);

  const platforms = trees.map((tree, i) => ({
    id: i === 0 && join ? join.hostPlatformId : `${routeId}-p${i + 1}`,
    treeIndex: -1,                                       // js/park/layout.js fills in the global heroTrees index
    deckHeight: heights[i],
    kind: i === 0 ? (join ? "junction" : "standard") : (i === trees.length - 1 ? "standard" : "transition"),
    radius: i === 0 || i === trees.length - 1 ? PLATFORM_RADIUS.standard : PLATFORM_RADIUS.transition,
  }));

  const edges = buildEdges(routeId, category, trees.length - 1, rng, join ? platforms[0].id : null);

  const lastTree = trees[trees.length - 1];
  const platformTop = lastTree.y + heights[heights.length - 1];
  const courseTreesSoFar = otherTrees.concat(trees);
  const zip = buildZip({ tree: lastTree, platformTop, terrain, homePoint, courseTrees: courseTreesSoFar });
  if (!zip) { if (typeof process !== "undefined" && process.env && process.env.LAYOUT_DEBUG) console.error("  zip failed, platformTop", platformTop); return null; }
  zip.fromPlatformId = platforms[platforms.length - 1].id;

  return { trees, entry, platforms, edges, zip, joinTreeIndex: join ? join.hostTreeIndex : null };
}

/**
 * Random-walk chain of trees: span 6–13.5 m apart, clear of hubs/paths/other routes. With `startTree`
 * (a junction, M2a) the chain begins at that *existing* tree instead of fanning out from the hub, and
 * only the remaining `chainLength - 1` trees are freshly placed.
 */
function buildChain({ chainLength, bearing, terrain, rng, otherTrees, spawnHub, startTree = null }) {
  const trees = startTree ? [startTree] : [];
  let heading = bearing;
  const beginAt = startTree ? 1 : 0;
  for (let i = beginAt; i < chainLength; i++) {
    let placed = false;
    for (let attempt = 0; attempt < MAX_TREE_ATTEMPTS && !placed; attempt++) {
      let cx, cz, tryHeading;
      if (i === 0) {
        tryHeading = bearing;
        const dist = spawnHub.radius + rng.float(ENTRY_START_MARGIN[0], ENTRY_START_MARGIN[1]);
        cx = spawnHub.x + Math.cos(bearing) * dist;
        cz = spawnHub.z + Math.sin(bearing) * dist;
      } else {
        tryHeading = heading + rng.float(-CHAIN_TURN, CHAIN_TURN);
        const span = rng.float(LAYOUT_LIMITS.minSpan + 0.4, LAYOUT_LIMITS.maxSpan - 0.4);
        cx = trees[i - 1].x + Math.cos(tryHeading) * span;
        cz = trees[i - 1].z + Math.sin(tryHeading) * span;
      }
      if (i > 0 && !spanOk(cx - trees[i - 1].x, cz - trees[i - 1].z)) continue;
      if (!farFromHubs(terrain, cx, cz)) continue;
      if (!farFromPath(terrain, cx, cz)) continue;
      if (!farFromOtherRoutes(cx, cz, otherTrees)) continue;
      if (trees.some((t) => Math.hypot(t.x - cx, t.z - cz) < LAYOUT_LIMITS.minSpan)) continue;
      heading = tryHeading;
      trees.push({ x: cx, z: cz, species: "pine", height: rng.float(TREE_HEIGHT_RANGE[0], TREE_HEIGHT_RANGE[1]), y: terrain.heightAt(cx, cz) });
      placed = true;
    }
    if (!placed) return null;
  }
  return trees;
}

/**
 * Bounded random walk in *local* height-above-own-trunk-foot: clamping a step already inside the
 * category range can only shrink the step, never grow it (1-D interval clamp is non-expansive), so
 * this always satisfies both the [minDeck, maxDeck] range and the riseLimit step bound in one pass.
 * `startHeight` (a junction, M2a): the first entry is the *existing* shared platform's own deck height
 * (not a fresh random draw), so the guest route's deck keeps meeting the host's platform exactly.
 */
function assignDeckHeights({ category, chainLength, rng, startHeight = null }) {
  const rule = CATEGORY_RULES[category];
  const heights = [startHeight != null ? startHeight : rng.float(rule.minDeck, rule.maxDeck)];
  for (let i = 1; i < chainLength; i++) {
    const proposed = heights[i - 1] + rng.float(-rule.riseLimit, rule.riseLimit);
    heights.push(Math.min(rule.maxDeck, Math.max(rule.minDeck, proposed)));
  }
  return heights;
}

/** Entry deck position (an estimate – see ENTRY_DECK_OFFSET) and the shared entry/platform-1 facing. */
function buildEntry(firstTree, spawnHub) {
  const facing = Math.atan2(spawnHub.x - firstTree.x, spawnHub.z - firstTree.z);   // tree → hub yaw
  return {
    x: firstTree.x + Math.sin(facing) * ENTRY_DECK_OFFSET,
    z: firstTree.z + Math.cos(facing) * ENTRY_DECK_OFFSET,
    facing,
  };
}

/**
 * Catalogue kind per edge: within the category's difficulty budget, never the same kind twice running.
 * `firstPlatformId` (a junction, M2a): the first edge leaves from the host route's shared platform id
 * instead of this route's own `${routeId}-p1`, which was never built (see `buildRouteCandidate`).
 */
function buildEdges(routeId, category, edgeCount, rng, firstPlatformId = null) {
  if (routeId === LEGACY_BLUE_1.routeId) {
    return LEGACY_BLUE_1.ids.slice(0, edgeCount).map((id, i) => ({
      id, kind: LEGACY_BLUE_1.kinds[i], from: `${routeId}-p${i + 1}`, to: `${routeId}-p${i + 2}`,
    }));
  }
  const rule = CATEGORY_RULES[category];
  const pool = CATALOGUE.filter((e) => e.kind !== "zipline" && !rule.exclude.includes(e.kind) && metricSum(e.metrics) <= rule.maxMetricSum);
  const edges = [];
  let previousKind = null;
  for (let i = 0; i < edgeCount; i++) {
    const choices = pool.filter((e) => e.kind !== previousKind);
    const chosen = rng.pick(choices.length ? choices : pool);
    previousKind = chosen.kind;
    const from = i === 0 && firstPlatformId ? firstPlatformId : `${routeId}-p${i + 1}`;
    edges.push({ id: `${routeId}-e${i + 1}`, kind: chosen.kind, from, to: `${routeId}-p${i + 2}` });
  }
  return edges;
}

/** The Flying Fox off the last platform: js/park/zip-plan.js's search plus the M1.1 landing rules. */
function buildZip({ tree, platformTop, terrain, homePoint, courseTrees }) {
  const plan = planZipline({
    tree, platformTop, cableHeight: ZIP_HARDWARE.cableHeight, seatDrop: ZIP_HARDWARE.seatDrop,
    startOffset: EDGE_OFFSET, home: homePoint, terrain, forest: { trees: courseTrees },
    config: {
      minGradient: ZIP_GRADIENT.min, maxGradient: ZIP_GRADIENT.max, idealGradient: ZIP_GRADIENT.ideal,
      // The task's zip rules (gradient, landing slope/path/tree clearance) say nothing about the
      // arrival deck's own height, unlike zip-plan.js's original 1.6-2.8 m (tuned for the single
      // hand-built blue course). A black platform 10-20 m up its own tree rarely has that much natural
      // ground rise within reach, so the window here only caps at the game's own height ceiling
      // (CLAUDE.md: "keine Höhen über 20 m vor M2") – the score still prefers a low arrival when one exists.
      minDeckHeight: 1.6, maxDeckHeight: 20,
      relaxed: { minGradient: ZIP_GRADIENT.min, maxGradient: ZIP_GRADIENT.max, minClearance: 1.5, crownClear: 0.6, maxDeckHeight: 20 },
    },
  });
  if (!plan) { if (typeof process !== "undefined" && process.env && process.env.LAYOUT_DEBUG) console.error("    planZipline null"); return null; }
  if (!zipLandingOk(terrain, plan.landing, courseTrees)) { if (typeof process !== "undefined" && process.env && process.env.LAYOUT_DEBUG) console.error("    zipLandingOk false", plan.landing, "slope", terrain.slopeAt(plan.landing.x, plan.landing.z)); return null; }
  return {
    fromPlatformId: null,             // buildRouteCandidate fills this in (the chain's last platform id)
    landing: { x: plan.landing.x, z: plan.landing.z },
    dir: { x: plan.dir.x, z: plan.dir.z },
    length: plan.length,
    gradient: plan.gradient,
    deckTop: plan.deckTop,
    drop: plan.drop,
  };
}
