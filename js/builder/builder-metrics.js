// Read-only inspector numbers for one draft route (js/builder/builder-state.js delegates here): the
// four difficulty axes, the dramaturgy curve, variation and jam-risk scores, and the par-time estimate.
// Pure data in, pure data out – no draft mutation, so js/builder/builder-inspector.js (and unit tests)
// can call these against any route snapshot without touching the live draft.
import { metricSum } from "../park/layout-validate.js";
import { catalogueEntry } from "../elements/catalogue-data.js";
import { routesFromPark } from "../game/route.js";

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
