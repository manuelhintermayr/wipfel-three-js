// The M3a builder's data model (GDD §4, ADR-003 "the builder writes what the generator emits"): a
// draft copy of a parkDef (js/park/layout.js#generateParkLayout's shape) that the operator edits with
// the SAME rules the generator itself is held to (js/builder/builder-validate.js, which re-runs
// js/park/layout-validate.js's predicates). Pure, no THREE, no DOM – importable under plain `node`
// (tests/unit/builder-state.test.mjs) exactly like the generator it mirrors.
//
// Shape kept deliberately close to parkDef: `draft.heroTrees[i]` gains one extra field (`health`,
// 0..1 – GDD "tree list … health", gates whether a tree may carry a platform at all) and every
// route gains a builder-only `_status` bag (`{ walked, issues }`, stripped again by `toParkDef()`).
// Everything else round-trips byte-for-byte through js/park/loader.js#loadPark unchanged.
import { CATEGORY_RULES, LAYOUT_LIMITS, metricSum, zipLandingOk } from "../park/layout-validate.js";
import { CATALOGUE, CATALOGUE_VARIANTS } from "../elements/catalogue-data.js";
import { buildEntry, ZIP_GRADIENT } from "../park/layout-route.js";
import { createZipPhysics } from "../zipline/physics.js";
import { RESCUE } from "../config.js";
import { surveyTrees, SURVEY } from "./survey-trees.js";
import { validateRoute, validatePark } from "./builder-validate.js";
import * as metrics from "./builder-metrics.js";

export const BUILDER = Object.freeze({
  zipRiderMassKg: 78,          // RULES.sizeClasses "adult" – the live zip-tool speed estimate's rider
  zipMaxSimSeconds: 90,        // simulation cap for evaluateZip – a hopeless uphill line must not spin forever
  newRouteDeckHeight: Object.freeze({ blue: 4.5, red: 5.5, black: 12, legendary: 15 }),
  candidateExcludeRadius: LAYOUT_LIMITS.routeTreeClearance,
});

const ROMAN_INDEX = Object.freeze({ I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 });
const numeralToInt = (numeral) => ROMAN_INDEX[numeral] || Number(numeral) || 1;

/** Deep, plain-data clone of one generated route – `structuredClone` is enough, nothing here holds a function. */
function cloneRoute(route) {
  const cloned = structuredClone(route);
  cloned._status = { walked: true, issues: [] };
  return cloned;
}

/** First and last platform are always "standard" (the generator's own convention); a pre-existing
 *  "junction" platform (a park-scale route joining another, ROADMAP M2a) is never touched here – the
 *  builder does not create junctions of its own. */
function recomputeKinds(route) {
  const last = route.platforms.length - 1;
  route.platforms.forEach((p, i) => {
    if (p.kind === "junction") return;
    p.kind = i === 0 || i === last ? "standard" : "transition";
  });
}

/** Every catalogue kind (base + M2b variants) whose metrics fit inside `category`'s budget – the exact
 *  filter js/park/layout-route.js#buildEdges applies at generation time. */
function availableEdgeKinds(category) {
  const rule = CATEGORY_RULES[category];
  if (!rule) return [];
  const eligible = (e) => e.kind !== "zipline" && !rule.exclude.includes(e.baseKind || e.kind) && metricSum(e.metrics) <= rule.maxMetricSum;
  return [...CATALOGUE, ...CATALOGUE_VARIANTS].filter(eligible);
}

/**
 * @param {{ parkDef: object, terrain: object, rng: import("../core/rng.js").Rng,
 *   walkedStatus?: Record<string, boolean> }} options
 *   `walkedStatus` (optional) restores each route's "already walked" flag from a previously saved
 *   customPark (js/core/save.js#data.customPark) – omit it and a fresh draft starts every route
 *   `needsWalkthrough` (GDD §4 "no route opens before the operator has walked it themselves"),
 *   including ones the generator itself produced: the walkthrough obligation applies to the whole park
 *   the moment an operator starts inspecting it, not only to hand-edited routes.
 */
export function createBuilderDraft({ parkDef, terrain, rng, walkedStatus = {} }) {
  const surveyRng = rng.fork("survey");
  const heroTrees = parkDef.heroTrees.map((t) => ({ x: t.x, z: t.z, species: t.species, height: t.height, health: t.health ?? 1 }));
  const routes = parkDef.routes.map((r) => {
    const cloned = cloneRoute(r);
    cloned._status.walked = walkedStatus[r.id] === true;
    return cloned;
  });
  // M3b rescuer posts (GDD §4 "rescuer", RESEARCH-DATA §7 "each station reachable within ≤ 10 min"): up to
  // RESCUE.maxPosts world points, each placed near an existing hub or route entry rather than an
  // arbitrary 3-D click (this builder's own established convention – see the module header on M3a's
  // "no 3-D click targets" choice, restated in the design docs). `{ id, x, z }`, plain data, round-trips through
  // toParkDef() like every other field here.
  const rescuePosts = Array.isArray(parkDef.rescuePosts)
    ? parkDef.rescuePosts.map((p) => ({ id: p.id, x: p.x, z: p.z })) : [];
  let surveyPool = null;   // lazily built – terrain sampling is not free, and tests may never ask for it

  const findRoute = (routeId) => {
    const route = routes.find((r) => r.id === routeId);
    if (!route) throw new Error(`builder: unknown route "${routeId}"`);
    return route;
  };
  const groundY = (tree) => terrain.heightAt(tree.x, tree.z);

  function ensureSurveyPool() {
    if (!surveyPool) {
      surveyPool = surveyTrees(terrain, surveyRng, { exclude: heroTrees, excludeRadius: BUILDER.candidateExcludeRadius })
        .map((c) => ({ ...c, adopted: false, heroIndex: -1 }));
    }
    return surveyPool;
  }

  /** `candidateId` is either `"tree:<heroIndex>"` (already carrying a platform somewhere) or a
   *  `surveyTrees` candidate id ("survey-<row>-<col>") – resolves to a heroTrees index, growing the
   *  list the first time a survey candidate is actually used (exactly how the generator itself grows
   *  `heroTrees` one route at a time, js/park/layout.js). */
  function resolveTreeIndex(candidateId) {
    if (typeof candidateId === "string" && candidateId.startsWith("tree:")) {
      const index = Number(candidateId.slice(5));
      if (!heroTrees[index]) throw new Error(`builder: candidate "${candidateId}" is not a known tree`);
      return index;
    }
    const pool = ensureSurveyPool();
    const found = pool.find((c) => c.id === candidateId);
    if (!found) throw new Error(`builder: unknown tree candidate "${candidateId}"`);
    if (found.adopted) return found.heroIndex;
    if (found.health < SURVEY.minHealthForPlatform) throw new Error(`builder: candidate "${candidateId}" is too weak to carry a platform (health ${found.health.toFixed(2)})`);
    heroTrees.push({ x: found.x, z: found.z, species: found.species, height: found.height, health: found.health });
    found.adopted = true;
    found.heroIndex = heroTrees.length - 1;
    return found.heroIndex;
  }

  /** Hero-tree indexes claimed by every route OTHER than `routeId` – js/builder/builder-validate.js's
   *  cross-route clearance check needs exactly this, never this route's own trees (spanOk already
   *  covers same-route consecutive spacing). */
  function otherRouteTreeIndexes(routeId) {
    const mine = new Set(findRoute(routeId).platforms.map((p) => p.treeIndex));
    const set = new Set();
    for (const route of routes) {
      if (route.id === routeId) continue;
      for (const p of route.platforms) if (!mine.has(p.treeIndex)) set.add(p.treeIndex);
    }
    return set;
  }

  function revalidate(routeId) {
    const route = findRoute(routeId);
    const { issues } = validateRoute(route, { terrain, heroTrees, otherRouteTreeIndexes: otherRouteTreeIndexes(routeId) });
    route._status.issues = issues;
    return route._status;
  }

  /** Any structural edit re-opens the walkthrough obligation – renaming does not (see `setRouteName`). */
  function markDirty(routeId) {
    findRoute(routeId)._status.walked = false;
    revalidate(routeId);
  }

  /** Is `routeId` the *host* of a junction another route's first platform shares (ROADMAP M2a)? Only
   *  matters for routes carried over from the generated park – the builder never creates a junction of
   *  its own, but must not silently corrupt one it inherited. */
  function hostsAJunction(routeId) {
    const mine = new Set(findRoute(routeId).platforms.map((p) => p.id));
    return routes.some((r) => r.id !== routeId && r.platforms[0] && r.platforms[0].kind === "junction" && mine.has(r.platforms[0].id));
  }

  // --- reads -----------------------------------------------------------------------------------------
  function routeState(route) {
    if (route._status.issues.length > 0) return "draft";
    return route._status.walked ? "open" : "needsWalkthrough";
  }
  function routeView(route) {
    const { _status, ...rest } = route;
    return { ...structuredClone(rest), state: routeState(route), issues: _status.issues, walked: _status.walked };
  }

  // --- difficulty / dramaturgy read-outs for the inspector, delegated to js/builder/builder-metrics.js ---
  const aggregateAxes = (routeId) => metrics.aggregateAxes(findRoute(routeId));
  const dramaturgyCurve = (routeId) => metrics.dramaturgyCurve(findRoute(routeId));
  const variationScore = (routeId) => metrics.variationScore(findRoute(routeId));
  const jamRisk = (routeId) => metrics.jamRisk(findRoute(routeId));
  const estimate = (routeId) => metrics.estimate(findRoute(routeId), heroTrees);

  // --- edit ops ----------------------------------------------------------------------------------------
  function addRoute(category) {
    if (!CATEGORY_RULES[category]) throw new Error(`builder: unknown category "${category}"`);
    const existingOfCategory = routes.filter((r) => r.id.startsWith(`custom-${category}-`)).length;
    const id = `custom-${category}-${existingOfCategory + 1}`;
    // `nameKey` normally holds an i18n key (js/core/i18n.js#t resolves it); a fresh custom route has no
    // dictionary entry at all, so `t()`'s own documented "missing key renders as the key" fallback shows
    // this raw id verbatim until `setRouteName` gives it a real one – no i18n import needed in this
    // module for that to work.
    const route = { id, category, numeral: String(existingOfCategory + 1), nameKey: id, hub: 0, entry: null, platforms: [], edges: [], zip: null, _status: { walked: false, issues: [] } };
    routes.push(route);
    revalidate(id);
    return routeView(route);
  }

  /** Placement candidates for a rescuer post: the hub(s) plus every route's own entry deck – reusing
   *  positions the draft already knows about instead of an arbitrary 3-D pick (see the field's own
   *  comment above). */
  function rescuePostCandidates() {
    const candidates = terrain.hubs.map((h, i) => ({ id: `hub:${i}`, x: h.x, z: h.z, labelKey: "builder.rescue.hub", labelData: { n: i + 1 } }));
    for (const route of routes) {
      if (!route.entry) continue;
      candidates.push({ id: `entry:${route.id}`, x: route.entry.x, z: route.entry.z, labelKey: "builder.rescue.entry", labelData: { name: route.nameKey } });
    }
    return candidates;
  }

  function addRescuePost(candidateId) {
    if (rescuePosts.length >= RESCUE.maxPosts) return { ok: false, reason: "capReached" };
    const postId = `post-${candidateId}`;
    if (rescuePosts.some((p) => p.id === postId)) return { ok: false, reason: "alreadyPlaced" };
    const candidate = rescuePostCandidates().find((c) => c.id === candidateId);
    if (!candidate) return { ok: false, reason: "notFound" };
    rescuePosts.push({ id: postId, x: candidate.x, z: candidate.z });
    return { ok: true };
  }

  function removeRescuePost(postId) {
    const index = rescuePosts.findIndex((p) => p.id === postId);
    if (index === -1) return { ok: false, reason: "notFound" };
    rescuePosts.splice(index, 1);
    return { ok: true };
  }

  function removeRoute(routeId) {
    const index = routes.findIndex((r) => r.id === routeId);
    if (index === -1) return { ok: false, reason: "notFound" };
    if (hostsAJunction(routeId)) return { ok: false, reason: "hostsJunction" };
    routes.splice(index, 1);
    return { ok: true };
  }

  function addPlatform(routeId, candidateId) {
    const route = findRoute(routeId);
    const treeIndex = resolveTreeIndex(candidateId);
    const tree = heroTrees[treeIndex];
    const rule = CATEGORY_RULES[route.category];
    const seq = route.platforms.length + 1;
    const id = `${routeId}-p${seq}`;
    if (route.platforms.length === 0) {
      const hub = terrain.hubs[route.hub || 0];
      route.entry = buildEntry(tree, hub);
      route.platforms.push({ id, treeIndex, deckHeight: clamp(BUILDER.newRouteDeckHeight[route.category] ?? rule.minDeck, rule.minDeck, rule.maxDeck), kind: "standard", radius: 1.25 });
    } else {
      const prev = route.platforms[route.platforms.length - 1];
      route.platforms.push({ id, treeIndex, deckHeight: clamp(prev.deckHeight, rule.minDeck, rule.maxDeck), kind: "standard", radius: 1.1 });
      route.edges.push({ id: `${routeId}-e${route.edges.length + 1}`, kind: defaultEdgeKindFor(route.category), from: prev.id, to: id });
      route.zip = null;   // the zip departed from the platform that just stopped being the last one
    }
    recomputeKinds(route);
    markDirty(routeId);
    return routeView(route);
  }

  function removePlatform(routeId) {
    const route = findRoute(routeId);
    if (route.platforms.length === 0) return { ok: false, reason: "empty" };
    const last = route.platforms[route.platforms.length - 1];
    if (last.kind === "junction") return { ok: false, reason: "sharedJunctionPlatform" };
    route.platforms.pop();
    route.edges = route.edges.filter((e) => e.to !== last.id);
    route.zip = null;
    if (route.platforms.length === 0) route.entry = null;
    else recomputeKinds(route);
    markDirty(routeId);
    return { ok: true };
  }

  function movePlatform(routeId, platformId, candidateId) {
    const route = findRoute(routeId);
    const platform = route.platforms.find((p) => p.id === platformId);
    if (!platform) return { ok: false, reason: "notFound" };
    if (platform.kind === "junction") return { ok: false, reason: "sharedJunctionPlatform" };
    const treeIndex = resolveTreeIndex(candidateId);
    platform.treeIndex = treeIndex;
    const rule = CATEGORY_RULES[route.category];
    platform.deckHeight = clamp(platform.deckHeight, rule.minDeck, rule.maxDeck);
    const isFirst = route.platforms[0] === platform, isLast = route.platforms[route.platforms.length - 1] === platform;
    if (isFirst) route.entry = buildEntry(heroTrees[treeIndex], terrain.hubs[route.hub || 0]);
    if (isLast) route.zip = null;
    markDirty(routeId);
    return { ok: true };
  }

  function setDeckHeight(routeId, platformId, height) {
    const route = findRoute(routeId);
    const platform = route.platforms.find((p) => p.id === platformId);
    if (!platform) return { ok: false, reason: "notFound" };
    const rule = CATEGORY_RULES[route.category];
    platform.deckHeight = clamp(height, rule.minDeck, rule.maxDeck);
    if (route.platforms[route.platforms.length - 1] === platform) route.zip = null;
    markDirty(routeId);
    return { ok: true, value: platform.deckHeight };
  }

  function defaultEdgeKindFor(category) {
    const kinds = availableEdgeKinds(category);
    return kinds.length ? kinds[0].kind : "burma-bridge";
  }

  function setEdgeKind(routeId, edgeId, kind) {
    const route = findRoute(routeId);
    const edge = route.edges.find((e) => e.id === edgeId);
    if (!edge) return { ok: false, reason: "notFound" };
    if (!availableEdgeKinds(route.category).some((e) => e.kind === kind)) return { ok: false, reason: "kindNotAllowed" };
    edge.kind = kind;
    markDirty(routeId);
    return { ok: true };
  }

  function setCategory(routeId, category) {
    if (!CATEGORY_RULES[category]) return { ok: false, reason: "unknownCategory" };
    findRoute(routeId).category = category;
    markDirty(routeId);
    return { ok: true };
  }

  function setRouteName(routeId, name) {
    const trimmed = String(name ?? "").trim();
    if (!trimmed) return { ok: false, reason: "empty" };
    findRoute(routeId).nameKey = trimmed;   // literal display text – see addRoute's comment on nameKey
    return { ok: true };
  }

  /** Live read-out while the builder drags a landing point – never mutates the draft. */
  function evaluateZip(routeId, landing) {
    const route = findRoute(routeId);
    if (!route.platforms.length) return null;
    const lastPlatform = route.platforms[route.platforms.length - 1];
    const tree = heroTrees[lastPlatform.treeIndex];
    const departureTop = groundY(tree) + lastPlatform.deckHeight;
    const landingY = terrain.heightAt(landing.x, landing.z);
    const length = Math.hypot(landing.x - tree.x, landing.z - tree.z);
    const drop = departureTop - landingY;
    const gradient = length > 0 ? drop / length : 0;
    const withinGradient = gradient >= ZIP_GRADIENT.min - 1e-6 && gradient <= ZIP_GRADIENT.max + 1e-6;
    const landingClear = withinGradient && zipLandingOk(terrain, landing, heroTrees);
    const zip = createZipPhysics({ start: { x: tree.x, y: departureTop, z: tree.z }, end: { x: landing.x, y: landingY, z: landing.z }, massKg: BUILDER.zipRiderMassKg });
    zip.push();
    for (let t = 0, dt = 1 / 60; !zip.done && !zip.stalled && t < BUILDER.zipMaxSimSeconds; t += dt) zip.update(dt);
    return { length, gradient, drop, withinGradient, landingClear, ok: withinGradient && landingClear, arrivalKmh: zip.speedKmh, stalled: zip.stalled };
  }

  function commitZip(routeId, landing) {
    const evaluated = evaluateZip(routeId, landing);
    if (!evaluated || !evaluated.ok) return { ok: false, evaluated };
    const route = findRoute(routeId);
    const lastPlatform = route.platforms[route.platforms.length - 1];
    const tree = heroTrees[lastPlatform.treeIndex];
    route.zip = {
      fromPlatformId: lastPlatform.id, landing: { x: landing.x, z: landing.z },
      dir: { x: (landing.x - tree.x) / evaluated.length, z: (landing.z - tree.z) / evaluated.length },
      length: evaluated.length, gradient: evaluated.gradient,
      deckTop: groundY(tree) + lastPlatform.deckHeight, drop: evaluated.drop,
    };
    markDirty(routeId);
    return { ok: true };
  }

  // --- walkthrough ---------------------------------------------------------------------------------
  function canWalk(routeId) { return findRoute(routeId)._status.issues.length === 0; }
  function markWalked(routeId) { const r = findRoute(routeId); r._status.walked = true; return routeView(r); }

  // --- export / persistence -------------------------------------------------------------------------
  function toParkDef() {
    return {
      id: parkDef.id, seed: parkDef.seed, generated: false, custom: true,
      heroTrees: structuredClone(heroTrees),
      // js/park/loader.js needs at least an entry deck to build a route at all – a freshly `addRoute()`d
      // route with no platform yet (`entry === null`) is excluded rather than handed to the loader,
      // which would otherwise throw reading `entry.x` off `null` (js/main.js#applyParkDef calls this on
      // the *whole* draft whenever any one route is walked, so one half-started route must never break
      // every other, already-valid one – "keep it robust and loading-tolerant").
      routes: routes.filter((r) => r.entry != null).map((r) => { const { _status, ...rest } = r; return structuredClone(rest); }),
      // M3b: rescuer posts (js/game/rescue.js reads these at runtime, js/builder/builder-overlays.js's
      // coverage overlay reads them at edit time) – plain data, same round-trip as everything above.
      rescuePosts: structuredClone(rescuePosts),
    };
  }

  /** js/core/save.js#data.customPark – schema-versioned, additive; `walkedStatus` above restores the
   *  other half of this on the next `createBuilderDraft()` call. */
  function serialize() {
    return { schema: 1, parkDef: toParkDef(), routeStatus: Object.fromEntries(routes.map((r) => [r.id, { walked: r._status.walked }])) };
  }

  for (const route of routes) revalidate(route.id);

  return {
    get heroTrees() { return heroTrees; },
    get routes() { return routes.map(routeView); },
    get candidates() {
      const existing = heroTrees.map((t, i) => ({ id: `tree:${i}`, x: t.x, z: t.z, species: t.species, height: t.height, health: t.health, existing: true }));
      const pool = ensureSurveyPool().filter((c) => !c.adopted).map((c) => ({ id: c.id, x: c.x, z: c.z, species: c.species, height: c.height, health: c.health, existing: false }));
      return [...existing, ...pool];
    },
    getRoute(routeId) { return routeView(findRoute(routeId)); },
    parkStatus() { return validatePark({ heroTrees }); },
    availableEdgeKinds,
    aggregateAxes, dramaturgyCurve, variationScore, jamRisk, estimate,

    addRoute, removeRoute,
    addPlatform, removePlatform, movePlatform,
    setDeckHeight, setEdgeKind, setCategory, setRouteName,
    evaluateZip, commitZip,
    canWalk, markWalked, markDirty,
    revalidate,

    // M3b rescuer posts (up to RESCUE.maxPosts, GDD §4)
    get rescuePosts() { return rescuePosts.map((p) => ({ ...p })); },
    rescuePostCandidates,
    addRescuePost, removeRescuePost,
    /** GDD §4 "rescuer coverage" – delegated to js/builder/builder-metrics.js like every other derived
     *  read-out here (aggregateAxes, dramaturgyCurve, …). */
    rescueCoverage() { return metrics.rescueCoverage({ routes, heroTrees, rescuePosts }); },

    toParkDef, serialize,
  };
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
