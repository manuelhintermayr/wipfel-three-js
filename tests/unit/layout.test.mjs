// M1.1 layout generator: every constraint js/park/layout-validate.js enforces, checked explicitly for
// seeds 1..8 against the headless terrain sampler (tools/headless-terrain.mjs); determinism; per-route
// graph connectivity entry -> zip; and the pure route-run defs js/game/route.js#routesFromPark builds
// from a park definition.
import test from "node:test";
import assert from "node:assert/strict";
import { createHeadlessTerrain } from "../../tools/headless-terrain.mjs";
import { generateParkLayout, PARK_CONFIG } from "../../js/park/layout.js";
import { CATEGORY_RULES, LAYOUT_LIMITS, spanOk, farFromHubs, farFromPath, zipLandingOk, metricSum } from "../../js/park/layout-validate.js";
import { catalogueEntry } from "../../js/elements/catalogue-data.js";
import { routesFromPark } from "../../js/game/route.js";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const EXPECTED_PLATFORM_TOTAL = PARK_CONFIG.routes.reduce((sum, r) => sum + r.chainLength, 0);

/** Build once per seed and hand every test the same { terrain, parkDef } pair. */
function forEachSeed(fn) {
  for (const seed of SEEDS) {
    const terrain = createHeadlessTerrain({ seed });
    const parkDef = generateParkLayout({ seed, terrain });
    fn(seed, terrain, parkDef);
  }
}

test("six routes, two per category, platform counts match PARK_CONFIG", () => {
  forEachSeed((seed, terrain, parkDef) => {
    assert.equal(parkDef.routes.length, PARK_CONFIG.routes.length, `seed ${seed}: route count`);
    PARK_CONFIG.routes.forEach((plan, i) => {
      const route = parkDef.routes[i];
      assert.equal(route.category, plan.category, `seed ${seed}: route ${i} category`);
      assert.equal(route.platforms.length, plan.chainLength, `seed ${seed}: route ${route.id} platform count`);
      assert.equal(route.edges.length, plan.chainLength - 1, `seed ${seed}: route ${route.id} edge count`);
    });
    assert.equal(parkDef.heroTrees.length, EXPECTED_PLATFORM_TOTAL, `seed ${seed}: total platform/tree count`);
    assert.ok(parkDef.heroTrees.length <= LAYOUT_LIMITS.maxTotalPlatforms, `seed ${seed}: over the ${LAYOUT_LIMITS.maxTotalPlatforms}-platform hard cap`);
  });
});

test("every hero tree is a distinct position", () => {
  forEachSeed((seed, terrain, parkDef) => {
    const trees = parkDef.heroTrees;
    for (let i = 0; i < trees.length; i++) {
      for (let j = i + 1; j < trees.length; j++) {
        const d = Math.hypot(trees[i].x - trees[j].x, trees[i].z - trees[j].z);
        assert.ok(d > 1e-6, `seed ${seed}: trees #${i} and #${j} coincide`);
      }
    }
  });
});

test("consecutive platform spans are 6.0-13.5 m (layout-validate#spanOk)", () => {
  forEachSeed((seed, terrain, parkDef) => {
    for (const route of parkDef.routes) {
      for (let i = 1; i < route.platforms.length; i++) {
        const a = parkDef.heroTrees[route.platforms[i - 1].treeIndex];
        const b = parkDef.heroTrees[route.platforms[i].treeIndex];
        assert.ok(spanOk(b.x - a.x, b.z - a.z), `seed ${seed} ${route.id}: span ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(2)} m out of range`);
      }
    }
  });
});

test("same-route trees stay >= minSpan apart, cross-route trees stay >= routeTreeClearance apart", () => {
  forEachSeed((seed, terrain, parkDef) => {
    // route membership per hero-tree index, from each route's own platform.treeIndex list
    const routeOf = new Map();
    for (const route of parkDef.routes) for (const p of route.platforms) routeOf.set(p.treeIndex, route.id);
    const trees = parkDef.heroTrees;
    for (let i = 0; i < trees.length; i++) {
      for (let j = i + 1; j < trees.length; j++) {
        const d = Math.hypot(trees[i].x - trees[j].x, trees[i].z - trees[j].z);
        const sameRoute = routeOf.get(i) === routeOf.get(j);
        const min = sameRoute ? LAYOUT_LIMITS.minSpan : LAYOUT_LIMITS.routeTreeClearance;
        assert.ok(d >= min - 1e-6, `seed ${seed}: trees #${i}/#${j} (${sameRoute ? "same" : "different"} route) only ${d.toFixed(2)} m apart, need >= ${min}`);
      }
    }
  });
});

test("every platform tree clears the hubs and the paths", () => {
  forEachSeed((seed, terrain, parkDef) => {
    for (const tree of parkDef.heroTrees) {
      assert.ok(farFromHubs(terrain, tree.x, tree.z), `seed ${seed}: tree (${tree.x.toFixed(1)},${tree.z.toFixed(1)}) too close to a hub`);
      assert.ok(farFromPath(terrain, tree.x, tree.z), `seed ${seed}: tree (${tree.x.toFixed(1)},${tree.z.toFixed(1)}) too close to a path`);
    }
  });
});

test("deck heights sit inside their category window with the category's rise limit between neighbours", () => {
  forEachSeed((seed, terrain, parkDef) => {
    for (const route of parkDef.routes) {
      const rule = CATEGORY_RULES[route.category];
      route.platforms.forEach((p, i) => {
        assert.ok(p.deckHeight >= rule.minDeck && p.deckHeight <= rule.maxDeck,
          `seed ${seed} ${route.id} platform ${i}: deck ${p.deckHeight.toFixed(2)} m outside [${rule.minDeck},${rule.maxDeck}]`);
        if (i > 0) {
          const rise = Math.abs(p.deckHeight - route.platforms[i - 1].deckHeight);
          assert.ok(rise <= rule.riseLimit + 1e-9, `seed ${seed} ${route.id} platform ${i}: rise ${rise.toFixed(2)} m over the ${rule.riseLimit} m limit`);
        }
      });
    }
  });
});

test("edge kinds respect the category's exclude list and difficulty budget (metricSum)", () => {
  forEachSeed((seed, terrain, parkDef) => {
    for (const route of parkDef.routes) {
      const rule = CATEGORY_RULES[route.category];
      for (const edge of route.edges) {
        assert.ok(!rule.exclude.includes(edge.kind), `seed ${seed} ${route.id} ${edge.id}: kind "${edge.kind}" is excluded on ${route.category}`);
        const entry = catalogueEntry(edge.kind);
        assert.ok(entry, `seed ${seed} ${route.id} ${edge.id}: kind "${edge.kind}" is not in the catalogue`);
        assert.ok(metricSum(entry.metrics) <= rule.maxMetricSum, `seed ${seed} ${route.id} ${edge.id}: metric sum over budget for ${route.category}`);
      }
    }
  });
});

test("zip gradient 3-6%, length 40-56 m, and the landing clears slope/path/every course tree", () => {
  forEachSeed((seed, terrain, parkDef) => {
    for (const route of parkDef.routes) {
      const zip = route.zip;
      assert.ok(zip, `seed ${seed} ${route.id}: no zip line`);
      assert.ok(zip.gradient >= 0.03 - 1e-9 && zip.gradient <= 0.06 + 1e-9, `seed ${seed} ${route.id}: gradient ${(zip.gradient * 100).toFixed(2)} % outside 3-6 %`);
      assert.ok(zip.length >= 40 && zip.length <= 56, `seed ${seed} ${route.id}: length ${zip.length.toFixed(1)} m outside 40-56 m`);
      // zipLandingOk was checked at generation time against every tree placed *up to and including*
      // this route – not later routes, which did not exist yet – so replay that same prefix here.
      const lastTreeIndex = route.platforms[route.platforms.length - 1].treeIndex;
      const treesSoFar = parkDef.heroTrees.slice(0, lastTreeIndex + 1);
      assert.ok(zipLandingOk(terrain, zip.landing, treesSoFar), `seed ${seed} ${route.id}: zip landing fails slope/path/tree clearance`);
    }
  });
});

test("determinism: the same seed and terrain produce byte-identical JSON", () => {
  forEachSeed((seed, terrain, parkDef) => {
    const again = generateParkLayout({ seed, terrain });
    assert.equal(JSON.stringify(again), JSON.stringify(parkDef), `seed ${seed}: repeated generation diverged`);
    const freshTerrain = createHeadlessTerrain({ seed });
    const fromScratch = generateParkLayout({ seed, terrain: freshTerrain });
    assert.equal(JSON.stringify(fromScratch), JSON.stringify(parkDef), `seed ${seed}: fresh terrain + generator diverged`);
  });
});

test("each route's graph is one connected chain: entry -> platform 1 -> ... -> zip", () => {
  forEachSeed((seed, terrain, parkDef) => {
    for (const route of parkDef.routes) {
      // edge i must run from platform i+1 to platform i+2 (1-based ids), covering every platform once
      route.edges.forEach((edge, i) => {
        assert.equal(edge.from, route.platforms[i].id, `seed ${seed} ${route.id} edge ${i}: wrong "from"`);
        assert.equal(edge.to, route.platforms[i + 1].id, `seed ${seed} ${route.id} edge ${i}: wrong "to"`);
      });
      assert.equal(route.zip.fromPlatformId, route.platforms[route.platforms.length - 1].id, `seed ${seed} ${route.id}: zip does not leave from the last platform`);
    }
  });
});

test("routesFromPark: one pure run-def per route, obstacles = ladder + edges (+ zip)", () => {
  forEachSeed((seed, terrain, parkDef) => {
    const defs = routesFromPark(parkDef);
    assert.equal(defs.length, parkDef.routes.length, `seed ${seed}: def count`);
    defs.forEach((def, i) => {
      const route = parkDef.routes[i];
      assert.equal(def.id, route.id);
      assert.equal(def.category, route.category);
      assert.equal(def.numeral, route.numeral);
      assert.equal(def.nameKey, route.nameKey);
      const expected = ["ladder", ...route.edges.map((e) => e.id), `${route.id}-zip`];
      assert.deepEqual(def.obstacles, expected, `seed ${seed} ${route.id}: obstacle list`);
      assert.ok(Number.isFinite(def.heightM) && def.heightM > 0, `seed ${seed} ${route.id}: heightM`);
      assert.ok(Number.isFinite(def.lengthM) && def.lengthM > 0, `seed ${seed} ${route.id}: lengthM`);
    });
  });
});
