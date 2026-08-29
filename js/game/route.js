// A route run: pure logic, no DOM/THREE – the session module renders it. Lifecycle:
// idle → armed (standing at the start banner) → countdown (3-2-1-GO while entering) → running
// (timer live) → done (zip finished). Obstacles complete in any order but each only counts once.
import { EDGE_OFFSET } from "../park/layout-route.js";

/**
 * @param {{ id: string, category: string, numeral: string, nameKey: string,
 *   obstacles: string[], heightM: number, lengthM: number }} def
 * @returns {{ def, state, progress, total, elapsed, falls, update(dt), arm(), beginCountdown(),
 *   countdownStep, start(), completeObstacle(id): boolean, recordFall(), finish(): summary,
 *   reset() }}
 */
export function createRouteRun(def) {
  const total = def.obstacles.length;
  let state = "idle";
  let elapsed = 0;
  let countdown = 0;            // seconds remaining; steps 3→2→1→GO
  const completed = new Set();
  let falls = 0;

  return {
    def,
    get state() { return state; },
    get progress() { return completed.size; },
    get total() { return total; },
    get elapsed() { return elapsed; },
    get falls() { return falls; },
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
      return { routeId: def.id, seconds: elapsed, falls, progress: completed.size, total, clean: falls === 0 };
    },

    reset() { state = "idle"; elapsed = 0; countdown = 0; falls = 0; completed.clear(); },
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
    // the tree-to-tree distance minus twice that lead-in/out – not the raw hero-tree spacing.
    let lengthM = route.zip ? route.zip.length : 0;
    for (let i = 1; i < route.platforms.length; i++) {
      const a = parkDef.heroTrees[route.platforms[i - 1].treeIndex];
      const b = parkDef.heroTrees[route.platforms[i].treeIndex];
      lengthM += Math.max(0, Math.hypot(b.x - a.x, b.z - a.z) - 2 * EDGE_OFFSET);
    }
    return {
      id: route.id, category: route.category, numeral: route.numeral, nameKey: route.nameKey,
      obstacles, heightM: Math.round(Math.max(...deckHeights)), lengthM: Math.round(lengthM),
    };
  });
}
