// Pure geometric predicates the M1.1 layout generator (js/park/layout.js, layout-route.js) checks
// every candidate route against (ROADMAP M1.1; docs/RESEARCH-DATA.md §1/§4). No THREE, no scene
// access – these run against the same { heightAt, isPath, slopeAt, hubs } contract js/world/terrain.js
// exposes, so the generator, tools/bake-park.mjs and tests/unit/layout.test.mjs can all call them
// headless (see tools/headless-terrain.mjs for the Node-side sampler).

/**
 * Per-category geometry rules. `maxMetricSum` bounds the sum of an element's four difficulty axes
 * (js/elements/catalogue-data.js), `exclude` are catalogue kinds that never appear on that category
 * (tarzan is a black-only finale move; rings/skate need more grip strength than a blue guest has).
 */
export const CATEGORY_RULES = Object.freeze({
  blue: Object.freeze({ minDeck: 3.5, maxDeck: 7, riseLimit: 1.2, maxMetricSum: 11, exclude: Object.freeze(["tarzan", "rings", "skate"]) }),
  red: Object.freeze({ minDeck: 3.5, maxDeck: 10, riseLimit: 1.2, maxMetricSum: 15, exclude: Object.freeze(["tarzan"]) }),
  black: Object.freeze({ minDeck: 10, maxDeck: 20, riseLimit: 2.5, maxMetricSum: Infinity, exclude: Object.freeze([]) }),
  // M2a (ROADMAP): the hidden finale, unlocked only once every black route is done (js/core/save.js).
  // Kept inside the same 10-20 m ceiling black already uses (CLAUDE.md: "keine Höhen über 20 m vor M2",
  // and M2 itself does not ask to raise it) – "high metrics kinds" is delivered by allowing every
  // catalogue kind (nothing excluded) rather than by exceeding black's own height window.
  legendary: Object.freeze({ minDeck: 14, maxDeck: 20, riseLimit: 2.5, maxMetricSum: Infinity, exclude: Object.freeze([]) }),
});

export const LAYOUT_LIMITS = Object.freeze({
  minSpan: 6.0,                 // metres between consecutive trees on one route
  maxSpan: 13.5,
  routeTreeClearance: 4.0,      // trees of *different* routes stay at least this far apart
  pathClearance: 3.0,           // platform trees stay this far from a walked path
  hubClearance: 1.5,            // …and this far outside every hub radius (the entry deck is exempt)
  entryBearingGap: (35 * Math.PI) / 180,
  zipLandingSlopeMax: (15 * Math.PI) / 180,
  zipLandingTreeClearance: 6.0, // a zip landing stays this far from every course tree
  // M2a: scaled from M1.1's 26 (6 routes) for 15 secured routes + the legendary finale (ROADMAP M2,
  // "Keep total platforms ≤ 52"). A junction platform is listed by two routes but built once, so it
  // only ever *helps* this budget (see js/park/layout.js#JUNCTIONS).
  maxTotalPlatforms: 52,
});

/** Horizontal span between two points is inside the rule that governs every rope/rail crossing. */
export function spanOk(dx, dz, limits = LAYOUT_LIMITS) {
  const d = Math.hypot(dx, dz);
  return d >= limits.minSpan && d <= limits.maxSpan;
}

/** Outside every hub's flat terrace (plus a buffer for the trunk and its canopy). */
export function farFromHubs(terrain, x, z, buffer = LAYOUT_LIMITS.hubClearance) {
  for (const hub of terrain.hubs) {
    if (Math.hypot(x - hub.x, z - hub.z) < hub.radius + buffer) return false;
  }
  return true;
}

/** Not on, or within `radius` of, a walked path – sampled on an eight-point ring like zip-plan.js. */
export function farFromPath(terrain, x, z, radius = LAYOUT_LIMITS.pathClearance) {
  if (typeof terrain.isPath !== "function") return true;
  if (terrain.isPath(x, z)) return false;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (terrain.isPath(x + Math.cos(a) * radius, z + Math.sin(a) * radius)) return false;
  }
  return true;
}

/** Clear of every tree already committed to another route. */
export function farFromOtherRoutes(x, z, otherTrees, buffer = LAYOUT_LIMITS.routeTreeClearance) {
  for (const t of otherTrees) {
    if (Math.hypot(x - t.x, z - t.z) < buffer) return false;
  }
  return true;
}

/** At least `gap` radians from every bearing already claimed by an earlier route's entry. */
export function bearingsClear(bearing, usedBearings, gap = LAYOUT_LIMITS.entryBearingGap) {
  for (const other of usedBearings) {
    let d = Math.abs(bearing - other) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < gap) return false;
  }
  return true;
}

/**
 * A Flying Fox landing: gentle ground (< 15°), off any path, and clear of every course tree placed
 * so far – a rider who overshoots the net must not end up standing in someone's platform tree.
 */
export function zipLandingOk(terrain, landing, allCourseTrees) {
  if (terrain.slopeAt(landing.x, landing.z) >= LAYOUT_LIMITS.zipLandingSlopeMax) return false;
  if (!farFromPath(terrain, landing.x, landing.z, LAYOUT_LIMITS.pathClearance)) return false;
  for (const t of allCourseTrees) {
    if (Math.hypot(landing.x - t.x, landing.z - t.z) < LAYOUT_LIMITS.zipLandingTreeClearance) return false;
  }
  return true;
}

/** Sum of an element's four 0–5 difficulty axes (js/elements/catalogue-data.js#CATALOGUE). */
export function metricSum(metrics) {
  return metrics.physical + metrics.coordination + metrics.psychological + metrics.technical;
}
