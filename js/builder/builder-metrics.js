// Read-only inspector numbers for one draft route (js/builder/builder-state.js delegates here): the
// four difficulty axes, the dramaturgy curve, variation and jam-risk scores, and the par-time estimate.
// Pure data in, pure data out – no draft mutation, so js/builder/builder-inspector.js (and unit tests)
// can call these against any route snapshot without touching the live draft.
import { metricSum } from "../park/layout-validate.js";
import { catalogueEntry } from "../elements/catalogue-data.js";
import { routesFromPark } from "../game/route.js";
import { RESCUE, TIME } from "../config.js";

/** Sum of each of the four 0-5 axes across every edge – a route-level difficulty profile, not the
 *  per-edge budget check (that lives in js/builder/builder-validate.js). */
export function aggregateAxes(route) {
  const totals = { physical: 0, coordination: 0, psychological: 0, technical: 0 };
  for (const edge of route.edges) {
    const entry = catalogueEntry(edge.kind);
    if (!entry) continue;
    for (const axis of Object.keys(totals)) totals[axis] += entry.metrics[axis];
  }
  return totals;
}

/** One bar per edge (deck height at its *entry* platform + its own metric sum) plus a final zip bar –
 *  js/builder/builder-inspector.js paints edges in the category colour and the zip bar in blue. */
export function dramaturgyCurve(route) {
  const bars = route.edges.map((edge, i) => {
    const entry = catalogueEntry(edge.kind);
    return { id: edge.id, kind: edge.kind, deckHeight: route.platforms[i].deckHeight, metricSum: entry ? metricSum(entry.metrics) : 0, isZip: false };
  });
  if (route.zip) {
    const last = route.platforms[route.platforms.length - 1];
    bars.push({ id: `${route.id}-zip`, kind: "zipline", deckHeight: last ? last.deckHeight : 0, metricSum: null, isZip: true, length: route.zip.length, gradient: route.zip.gradient });
  }
  return bars;
}

/** 1.0 = every edge a different kind from its neighbour, down towards 0 the more adjacent repeats. */
export function variationScore(route) {
  const edges = route.edges;
  if (edges.length < 2) return 1;
  let repeats = 0;
  for (let i = 1; i < edges.length; i++) if (edges[i].kind === edges[i - 1].kind) repeats++;
  return 1 - repeats / (edges.length - 1);
}

/** Longest run of consecutive discrete-stepping kinds (planks, stirrups, rings, …) – GDD's own
 *  "Staurisiko" concern: a long discrete chain is where guests queue up behind a slow stepper. */
export function jamRisk(route) {
  let longest = 0, current = 0;
  for (const edge of route.edges) {
    const entry = catalogueEntry(edge.kind);
    if (entry && entry.discrete) { current++; longest = Math.max(longest, current); } else current = 0;
  }
  return longest;
}

/** Length/height/par time straight from the same pure formula the real game uses – reusing
 *  js/game/route.js#routesFromPark instead of a second copy of the par-time estimate. `heroTrees` must
 *  be the *whole* draft's list – `route.platforms[i].treeIndex` indexes into it globally. */
export function estimate(route, heroTrees) {
  const defs = routesFromPark({ heroTrees, routes: [route] });
  return defs[0] || null;
}

/**
 * Rescue coverage (GDD §4 "rescuer coverage", RESEARCH-DATA §7 "every station reachable within ≤ 10 min") –
 * a graph/ground-distance approximation, not a real pathfind: for every route, walk from whichever
 * rescuer post is nearest that route's own entry (straight line – "to the trailhead"), then add up the
 * route's own tree-to-tree spans out to each platform in turn ("along the route" – there is no shortcut
 * through the canopy). A junction platform, listed by two routes, keeps the *shorter* of the two
 * distances found for it, which falls out for free from iterating every route without special-casing it.
 * @param {{ routes: object[], heroTrees: Array<{x,z}>, rescuePosts: Array<{x,z}> }} draftLike
 * @returns {{ radiusM: number, covered: Set<string>, uncovered: Set<string>, distanceOf: Record<string, number> }}
 */
export function rescueCoverage({ routes, heroTrees, rescuePosts }) {
  const radiusM = RESCUE.walkSpeedMps * RESCUE.timerGameMinutes * TIME.gameHourMinutes;
  const distanceOf = new Map();   // platformId -> shortest known distance from any rescuer post
  if (rescuePosts.length) {
    for (const route of routes) {
      if (!route.entry) continue;
      let nearestPostToEntry = Infinity;
      for (const post of rescuePosts) nearestPostToEntry = Math.min(nearestPostToEntry, Math.hypot(post.x - route.entry.x, post.z - route.entry.z));
      let cumulative = 0;
      let prev = { x: route.entry.x, z: route.entry.z };
      for (const platform of route.platforms) {
        const tree = heroTrees[platform.treeIndex];
        if (!tree) continue;
        cumulative += Math.hypot(tree.x - prev.x, tree.z - prev.z);
        const total = nearestPostToEntry + cumulative;
        const known = distanceOf.get(platform.id);
        if (known == null || total < known) distanceOf.set(platform.id, total);
        prev = { x: tree.x, z: tree.z };
      }
    }
  }
  const covered = new Set(), uncovered = new Set();
  for (const route of routes) {
    for (const platform of route.platforms) {
      const d = distanceOf.get(platform.id);
      (d != null && d <= radiusM ? covered : uncovered).add(platform.id);
    }
  }
  return { radiusM, covered, uncovered, distanceOf: Object.fromEntries(distanceOf) };
}
