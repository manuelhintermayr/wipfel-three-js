// Runs the exact same geometric/difficulty predicates the layout generator itself is checked against
// (js/park/layout-validate.js, tests/unit/layout.test.mjs) on ONE draft route at a time – the M3a
// builder's whole promise (ADR-003 "the builder writes what the generator emits") only holds if a
// hand-edited route is judged by the same rules a generated one already passes. Pure, no THREE, no i18n
// (issues carry a `code` + plain data; js/builder/builder-ui.js turns that into localised text) – so
// this stays unit-testable exactly like layout-validate.js itself.
import { CATEGORY_RULES, LAYOUT_LIMITS, spanOk, farFromHubs, farFromPath, farFromOtherRoutes, zipLandingOk, metricSum } from "../park/layout-validate.js";
import { catalogueEntry } from "../elements/catalogue-data.js";
import { ZIP_GRADIENT } from "../park/layout-route.js";
import { SURVEY } from "./survey-trees.js";

/** One line per broken rule. `target` tells the UI what to highlight red. */
function issue(code, target, data = {}) {
  return { code, target, data };
}

/**
 * @param {object} route a draft route – same shape as js/park/layout.js#generateParkLayout's
 *   `routes[i]`, plus the builder's own `_status` bag (ignored here)
 * @param {{ terrain, heroTrees: Array<{x,z,health?}>, otherRouteTreeIndexes: Set<number> }} ctx
 *   `heroTrees` is the WHOLE draft's tree list (platform.treeIndex indexes into it);
 *   `otherRouteTreeIndexes` are the indexes that belong to every *other* route, for cross-route
 *   clearance – a route is never checked against its own trees for this rule (spanOk already covers
 *   consecutive same-route spacing).
 * @returns {{ ok: boolean, issues: Array<{code:string, target:{type:string,id:string}, data:object}> }}
 */
export function validateRoute(route, { terrain, heroTrees, otherRouteTreeIndexes }) {
  const issues = [];
  const rule = CATEGORY_RULES[route.category];
  if (!rule) {
    issues.push(issue("unknownCategory", { type: "route", id: route.id }, { category: route.category }));
    return { ok: false, issues };
  }
  if (route.platforms.length < 2) {
    issues.push(issue("tooFewPlatforms", { type: "route", id: route.id }, { count: route.platforms.length }));
  }

  const treeAt = (i) => heroTrees[i];
  const otherTrees = Array.from(otherRouteTreeIndexes, (i) => heroTrees[i]).filter(Boolean);

  route.platforms.forEach((platform, i) => {
    const tree = treeAt(platform.treeIndex);
    if (!tree) { issues.push(issue("missingTree", { type: "platform", id: platform.id }, { treeIndex: platform.treeIndex })); return; }
    if (Number.isFinite(tree.health) && tree.health < SURVEY.minHealthForPlatform) {
      issues.push(issue("weakTree", { type: "platform", id: platform.id }, { health: tree.health }));
    }
    if (platform.deckHeight < rule.minDeck - 1e-6 || platform.deckHeight > rule.maxDeck + 1e-6) {
      issues.push(issue("deckHeightOutOfWindow", { type: "platform", id: platform.id },
        { deckHeight: platform.deckHeight, minDeck: rule.minDeck, maxDeck: rule.maxDeck }));
    }
    if (i > 0) {
      const rise = Math.abs(platform.deckHeight - route.platforms[i - 1].deckHeight);
      if (rise > rule.riseLimit + 1e-6) {
        issues.push(issue("riseTooSteep", { type: "platform", id: platform.id }, { rise, riseLimit: rule.riseLimit }));
      }
    }
    if (!farFromHubs(terrain, tree.x, tree.z)) issues.push(issue("tooCloseToHub", { type: "platform", id: platform.id }, {}));
    if (!farFromPath(terrain, tree.x, tree.z)) issues.push(issue("tooCloseToPath", { type: "platform", id: platform.id }, {}));
    if (!farFromOtherRoutes(tree.x, tree.z, otherTrees, LAYOUT_LIMITS.routeTreeClearance)) {
      issues.push(issue("tooCloseToOtherRoute", { type: "platform", id: platform.id }, {}));
    }
  });

  const byId = new Map(route.platforms.map((p) => [p.id, p]));
  for (const edge of route.edges) {
    const a = byId.get(edge.from), b = byId.get(edge.to);
    if (!a || !b) { issues.push(issue("danglingEdge", { type: "edge", id: edge.id }, { from: edge.from, to: edge.to })); continue; }
    const ta = treeAt(a.treeIndex), tb = treeAt(b.treeIndex);
    if (ta && tb && !spanOk(tb.x - ta.x, tb.z - ta.z)) {
      issues.push(issue("spanOutOfRange", { type: "edge", id: edge.id }, { span: Math.hypot(tb.x - ta.x, tb.z - ta.z) }));
    }
    const entry = catalogueEntry(edge.kind);
    if (!entry) { issues.push(issue("unknownKind", { type: "edge", id: edge.id }, { kind: edge.kind })); continue; }
    const baseKind = entry.baseKind || entry.kind;
    if (rule.exclude.includes(baseKind)) issues.push(issue("kindExcludedForCategory", { type: "edge", id: edge.id }, { kind: edge.kind }));
    if (metricSum(entry.metrics) > rule.maxMetricSum) {
      issues.push(issue("metricBudgetExceeded", { type: "edge", id: edge.id }, { sum: metricSum(entry.metrics), max: rule.maxMetricSum }));
    }
  }

  if (!route.zip) {
    issues.push(issue("missingZip", { type: "route", id: route.id }, {}));
  } else {
    const zip = route.zip;
    if (zip.gradient < ZIP_GRADIENT.min - 1e-6 || zip.gradient > ZIP_GRADIENT.max + 1e-6) {
      issues.push(issue("zipGradientOutOfRange", { type: "zip", id: route.id }, { pct: zip.gradient * 100 }));
    }
    // The generator itself only ever checks a zip landing against the trees that existed *up to and
    // including* this route at generation time (tests/unit/layout.test.mjs's own "replay that same
    // prefix" comment) – never against routes generated after it. heroTrees only ever grows by
    // appending (js/park/layout.js, and this module's own `resolveTreeIndex`), so "every tree up to this
    // route's own highest index" reproduces that exact rule instead of over-checking against the whole
    // park, which would flag long-shipped, already-valid routes the moment an unrelated later route's
    // tree happens to land within the landing's clearance radius.
    const prefixEnd = Math.max(...route.platforms.map((p) => p.treeIndex)) + 1;
    if (!zipLandingOk(terrain, zip.landing, heroTrees.slice(0, prefixEnd))) {
      issues.push(issue("zipLandingBlocked", { type: "zip", id: route.id }, {}));
    }
  }

  return { ok: issues.length === 0, issues };
}

/** Park-wide checks that are not any one route's fault – js/builder/builder-state.js runs this once. */
export function validatePark({ heroTrees }) {
  const issues = [];
  if (heroTrees.length > LAYOUT_LIMITS.maxTotalPlatforms) {
    issues.push(issue("platformCapExceeded", { type: "park", id: "park" }, { count: heroTrees.length, max: LAYOUT_LIMITS.maxTotalPlatforms }));
  }
  return { ok: issues.length === 0, issues };
}
