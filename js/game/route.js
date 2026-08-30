// A route run: pure logic, no DOM/THREE – the session module renders it. Lifecycle:
// idle → armed (standing at the start banner) → countdown (3-2-1-GO while entering) → running
// (timer live) → done (zip finished). Obstacles complete in any order but each only counts once.
// M2a (ROADMAP "Zeitläufe"): `markTrial()`/`isTrial` flag the *next* attempt as a time trial – the
// countdown/timer/obstacle machinery above is completely unchanged, only js/game/session.js reads
// `isTrial` at `finish()` to decide which save bucket (`recordRun` vs `recordTrial`) the time goes into.
import { EDGE_OFFSET } from "../park/layout-route.js";
import { catalogueEntry } from "../elements/catalogue-data.js";
import { NPC, MASTERY } from "../config.js";

/**
 * Par-time speed estimate per edge, m/s (M2a "Meisterschaftsstufen", `js/game/mastery.js`'s "under par"
 * tier). Reuses the two speed constants the NPC guest simulation already needs for the same estimation
 * problem (js/npc/agents.js, js/config.js#NPC) instead of duplicating a 12-entry walkSpeed table into
 * the THREE-free catalogue-data.js just for this – a discrete kind's "seconds per step" already implies
 * a rough m/s once you know the typical foothold spacing, and NPC.elementSpeedFallback is exactly that
 * fallback for a continuous kind with no better number to hand. The zip line gets its own, much faster,
 * estimate (`NPC.zipSecondsPerMetre` inverted).
 */
function parSpeedFor(kind) {
  if (kind === "zipline") return 1 / NPC.zipSecondsPerMetre;
  const entry = catalogueEntry(kind);
  return entry && entry.discrete ? 0.35 : NPC.elementSpeedFallback;
}

/**
 * @param {{ id: string, category: string, numeral: string, nameKey: string,
 *   obstacles: string[], heightM: number, lengthM: number, parS: number|null }} def
 * @returns {{ def, state, progress, total, elapsed, falls, isTrial, update(dt), arm(), markTrial(),
 *   beginCountdown(), countdownStep, start(), completeObstacle(id): boolean, recordFall(),
 *   finish(): summary, reset() }}
 */
export function createRouteRun(def) {
  const total = def.obstacles.length;
  let state = "idle";
  let elapsed = 0;
  let countdown = 0;            // seconds remaining; steps 3→2→1→GO
  const completed = new Set();
  let falls = 0;
  let isTrial = false;

  return {
    def,
    get state() { return state; },
    get progress() { return completed.size; },
    get total() { return total; },
    get elapsed() { return elapsed; },
    get falls() { return falls; },
    get isTrial() { return isTrial; },
    get completedIds() { return Array.from(completed); },
    /** 3, 2, 1 while counting, 0 = "GO" flash, null = no countdown showing. */
    get countdownStep() {
      if (state === "countdown") return Math.max(0, Math.ceil(countdown - 0.0001));
      if (state === "running" && elapsed < 0.9) return 0;
      return null;
    },

    update(dt) {
      if (state === "countdown") {
        countdown -= dt;
        if (countdown <= 0) { state = "running"; elapsed = 0; }
      } else if (state === "running") {
        elapsed += dt;
      }
    },

    arm() { if (state === "idle") state = "armed"; },
    /** Re-arm a route that is "done" for a time trial (js/game/session.js, `[G]` at the start banner):
     *  a route must be replayable once completed even though `finish()` otherwise leaves it there for
     *  the rest of the day. Only ever allowed once a normal completion already exists (session's own
     *  `save.routeBest(id) != null` check) – this method itself does not gate that. */
    markTrial() {
      if (state === "done") { state = "idle"; elapsed = 0; countdown = 0; falls = 0; completed.clear(); }
      isTrial = true;
    },
    beginCountdown() {
      if (state !== "idle" && state !== "armed") return;
      state = "countdown";
      countdown = 3;
    },
    /** Skip straight to running (rescue reset, debugging). */
    start() { state = "running"; },

    completeObstacle(id) {
      if (state === "countdown") { state = "running"; }
      if (state !== "running" || !def.obstacles.includes(id) || completed.has(id)) return false;
      completed.add(id);
      return true;
    },

    recordFall() { if (state === "running" || state === "countdown") falls += 1; },

    finish() {
      state = "done";
      return { routeId: def.id, seconds: elapsed, falls, progress: completed.size, total, clean: falls === 0, isTrial };
    },

    reset() { state = "idle"; elapsed = 0; countdown = 0; falls = 0; isTrial = false; completed.clear(); },
  };
}

/** The first course as a route definition (M0: hand-made). Kept for tests/unit/route.test.mjs and as
 *  a worked example of the shape `routesFromPark` below produces; the real game reads that instead. */
export const BLUE_I = Object.freeze({
  id: "blue-1",
  category: "blue",
  numeral: "I",
  nameKey: "route.blue-1.name",
  obstacles: Object.freeze(["ladder", "burma-1", "planks-1", "net-1", "zip-1"]),
  heightM: 5,
  lengthM: 90,
  parS: 220,   // hand-picked for this fixture only – the real game always reads routesFromPark's own parS
});

/**
 * Route-run definitions for every route in a generated park (js/park/layout.js#generateParkLayout),
 * shaped exactly like `BLUE_I`: what js/game/session.js arms/counts down/times, and what
 * js/ui/hud-route.js shows on the header and the start banner. Pure – no THREE, no scene access –
 * every number comes straight out of `parkDef`, so this can run in a unit test the same way the
 * generator itself does (tests/unit/layout.test.mjs).
 *
 * The zip obstacle id (`${route.id}-zip`) must match what js/park/loader.js builds the zip element's
 * id as – kept in sync by hand, documented at both ends.
 * @param {object} parkDef see generateParkLayout's return shape
 * @returns {Array<object>} one def per route, in parkDef.routes order
 */
export function routesFromPark(parkDef) {
  return parkDef.routes.map((route) => {
    const obstacles = ["ladder", ...route.edges.map((e) => e.id)];
    if (route.zip) obstacles.push(`${route.id}-zip`);
    const deckHeights = route.platforms.map((p) => p.deckHeight);
    // Sum of edge lengths + zip length (sanity rule M1.2): each edge leaves the deck EDGE_OFFSET short
    // of the trunk axis at *both* ends (js/park/loader.js#buildRouteElement), so the walkable span is
    // the tree-to-tree distance minus twice that lead-in/out – not the raw hero-tree spacing. Also
    // feeds `parS` (M2a): sum of (edge length ÷ its kind's speed estimate) × MASTERY.parScale.
    let lengthM = 0;
    let parSeconds = 0;
    for (let i = 1; i < route.platforms.length; i++) {
      const a = parkDef.heroTrees[route.platforms[i - 1].treeIndex];
      const b = parkDef.heroTrees[route.platforms[i].treeIndex];
      const edgeLength = Math.max(0, Math.hypot(b.x - a.x, b.z - a.z) - 2 * EDGE_OFFSET);
      lengthM += edgeLength;
      parSeconds += edgeLength / parSpeedFor(route.edges[i - 1].kind);
    }
    if (route.zip) {
      lengthM += route.zip.length;
      parSeconds += route.zip.length / parSpeedFor("zipline");
    }
    return {
      id: route.id, category: route.category, numeral: route.numeral, nameKey: route.nameKey,
      obstacles, heightM: Math.round(Math.max(...deckHeights)), lengthM: Math.round(lengthM),
      parS: Math.round(parSeconds * MASTERY.parScale),
    };
  });
}
