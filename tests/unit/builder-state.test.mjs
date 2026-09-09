// M3a builder: js/builder/survey-trees.js (deterministic candidate survey + health gate) and
// js/builder/builder-state.js (draft editing ops, validation wiring, walkthrough state transitions,
// customPark serialisation round-trip). Pure logic, no THREE/DOM – same headless terrain sampler
// tests/unit/layout.test.mjs already uses for the real generator (tools/headless-terrain.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { createHeadlessTerrain } from "../../tools/headless-terrain.mjs";
import { Rng } from "../../js/core/rng.js";
import { generateParkLayout, PARK_CONFIG_SMALL, PARK_CONFIG } from "../../js/park/layout.js";
import { surveyTrees, SURVEY } from "../../js/builder/survey-trees.js";
import { createBuilderDraft } from "../../js/builder/builder-state.js";
import { CATEGORY_RULES } from "../../js/park/layout-validate.js";
import { RESCUE } from "../../js/config.js";

const SEED = 1;
const terrain = createHeadlessTerrain({ seed: SEED });
const smallParkDef = generateParkLayout({ seed: SEED, terrain, config: PARK_CONFIG_SMALL });

function freshDraft(parkDef = smallParkDef, walkedStatus = {}) {
  return createBuilderDraft({ parkDef, terrain, rng: new Rng(SEED).fork("builder-test"), walkedStatus });
}

// --- survey-trees.js ---------------------------------------------------------------------------------

test("surveyTrees: deterministic for the same seed/terrain, ~targetCount candidates", () => {
  const a = surveyTrees(terrain, new Rng(SEED).fork("survey-a"));
  const b = surveyTrees(terrain, new Rng(SEED).fork("survey-a"));
  assert.equal(JSON.stringify(a), JSON.stringify(b), "same rng stream must reproduce byte-identical candidates");
  assert.ok(a.length > 0 && a.length <= SURVEY.targetCount, `expected 1..${SURVEY.targetCount} candidates, got ${a.length}`);
});

test("surveyTrees: a different rng stream changes the candidates", () => {
  const a = surveyTrees(terrain, new Rng(SEED).fork("survey-a"));
  const b = surveyTrees(terrain, new Rng(SEED).fork("survey-b"));
  assert.notEqual(JSON.stringify(a), JSON.stringify(b));
});

test("surveyTrees: health gate – some candidates are below and some at/above minHealthForPlatform", () => {
  const list = surveyTrees(terrain, new Rng(SEED).fork("survey-health"));
  const below = list.filter((c) => c.health < SURVEY.minHealthForPlatform);
  const atOrAbove = list.filter((c) => c.health >= SURVEY.minHealthForPlatform);
  assert.ok(below.length > 0, "expected at least one candidate too weak to carry a platform");
  assert.ok(atOrAbove.length > 0, "expected at least one candidate healthy enough to carry a platform");
  for (const c of list) assert.ok(c.health >= 0 && c.health <= 1, `health ${c.health} out of 0..1`);
});

test("surveyTrees: every candidate clears hubs/paths and the given exclusion radius", () => {
  const heroTrees = smallParkDef.heroTrees;
  const list = surveyTrees(terrain, new Rng(SEED).fork("survey-exclude"), { exclude: heroTrees, excludeRadius: 4 });
  for (const c of list) {
    for (const hero of heroTrees) {
      const d = Math.hypot(c.x - hero.x, c.z - hero.z);
      assert.ok(d >= 4, `candidate ${c.id} only ${d.toFixed(2)} m from an excluded tree`);
    }
  }
});

// --- builder-state.js: reading a freshly created draft ------------------------------------------------

test("createBuilderDraft: every generated route starts needsWalkthrough with zero issues", () => {
  const draft = freshDraft();
  for (const route of draft.routes) {
    assert.equal(route.issues.length, 0, `${route.id} should be violation-free straight out of the generator`);
    assert.equal(route.state, "needsWalkthrough", `${route.id} must wait for its first walkthrough`);
    assert.equal(route.walked, false);
  }
});

test("createBuilderDraft: walkedStatus restores which routes are already open", () => {
  const draft = freshDraft(smallParkDef, { "blue-1": true });
  assert.equal(draft.getRoute("blue-1").state, "open");
  assert.equal(draft.getRoute("blue-2").state, "needsWalkthrough");
});

test("candidates: existing hero trees are included and tagged, survey pool fills the rest", () => {
  const draft = freshDraft();
  const existing = draft.candidates.filter((c) => c.existing);
  const pool = draft.candidates.filter((c) => !c.existing);
  assert.equal(existing.length, draft.heroTrees.length);
  assert.ok(pool.length > 0);
});

// --- walkthrough state transitions --------------------------------------------------------------------

test("walkthrough: canWalk is true for a clean route, markWalked flips it to open", () => {
  const draft = freshDraft();
  assert.equal(draft.canWalk("blue-1"), true);
  const view = draft.markWalked("blue-1");
  assert.equal(view.state, "open");
  assert.equal(draft.getRoute("blue-1").walked, true);
});

test("walkthrough: any structural edit re-opens the obligation (walked resets to false)", () => {
  const draft = freshDraft();
  draft.markWalked("blue-1");
  assert.equal(draft.getRoute("blue-1").state, "open");
  const platform = draft.getRoute("blue-1").platforms[0];
  draft.setDeckHeight("blue-1", platform.id, platform.deckHeight); // same value, still a structural op
  assert.equal(draft.getRoute("blue-1").walked, false, "an edit must demand a fresh walkthrough");
});

test("walkthrough: renaming a route does NOT reset walked (cosmetic only)", () => {
  const draft = freshDraft();
  draft.markWalked("blue-1");
  draft.setRouteName("blue-1", "Custom Name");
  assert.equal(draft.getRoute("blue-1").walked, true);
  assert.equal(draft.getRoute("blue-1").nameKey, "Custom Name");
});

test("walkthrough: canWalk is false while issues exist", () => {
  const draft = freshDraft();
  draft.setCategory("red-1", "black");   // red-1's deck heights now sit outside black's 10-20 m window
  assert.ok(draft.getRoute("red-1").issues.length > 0);
  assert.equal(draft.canWalk("red-1"), false);
});

// --- validation wiring: detect then clear a violation --------------------------------------------------

test("validation: setCategory introduces deckHeightOutOfWindow issues, reverting clears them", () => {
  const draft = freshDraft();
  const before = draft.getRoute("blue-1").issues.length;
  assert.equal(before, 0);
  draft.setCategory("blue-1", "black");
  const afterBreak = draft.getRoute("blue-1");
  assert.ok(afterBreak.issues.some((i) => i.code === "deckHeightOutOfWindow"), "blue's low decks must violate black's 10-20 m window");
  draft.setCategory("blue-1", "blue");
  const afterFix = draft.getRoute("blue-1");
  assert.equal(afterFix.issues.length, 0, "reverting the category must clear the issues again");
});

test("validation: setEdgeKind refuses a kind excluded for the route's category", () => {
  const draft = freshDraft();
  const rule = CATEGORY_RULES.blue;
  assert.ok(rule.exclude.includes("tarzan"), "fixture assumption: tarzan is blue-excluded");
  const edgeId = draft.getRoute("blue-1").edges[0].id;
  const result = draft.setEdgeKind("blue-1", edgeId, "tarzan");
  assert.deepEqual(result, { ok: false, reason: "kindNotAllowed" });
  const allowed = draft.availableEdgeKinds("blue")[0].kind;
  assert.deepEqual(draft.setEdgeKind("blue-1", edgeId, allowed), { ok: true });
  assert.equal(draft.getRoute("blue-1").edges[0].kind, allowed);
});

// --- draft editing ops: add/remove/move platform, add/remove route ------------------------------------

test("addPlatform: refuses a candidate too weak to carry a platform", () => {
  const draft = freshDraft();
  const weak = draft.candidates.find((c) => !c.existing && c.health < SURVEY.minHealthForPlatform);
  assert.ok(weak, "fixture assumption: at least one weak candidate exists");
  assert.throws(() => draft.addPlatform("blue-1", weak.id));
});

test("addRoute + addPlatform: a brand-new route needs 2+ platforms and a zip before it can walk", () => {
  const draft = freshDraft();
  const route = draft.addRoute("blue");
  assert.equal(route.category, "blue");
  assert.equal(route.platforms.length, 0);
  assert.equal(draft.canWalk(route.id), false);

  // Reuse two of blue-1's own hero trees (`tree:<index>`) for a *deterministic* 6-13.5 m span, instead
  // of hoping the survey pool happens to offer one close enough by chance.
  const blue1 = draft.getRoute("blue-1");
  const firstTreeIndex = blue1.platforms[0].treeIndex, secondTreeIndex = blue1.platforms[1].treeIndex;
  draft.addPlatform(route.id, `tree:${firstTreeIndex}`);
  const afterFirst = draft.getRoute(route.id);
  assert.equal(afterFirst.platforms.length, 1);
  assert.ok(afterFirst.entry, "the first platform must also set the route's entry deck");
  assert.ok(afterFirst.issues.some((i) => i.code === "tooFewPlatforms"));

  draft.addPlatform(route.id, `tree:${secondTreeIndex}`);
  const afterSecond = draft.getRoute(route.id);
  assert.equal(afterSecond.platforms.length, 2);
  assert.equal(afterSecond.edges.length, 1);
  assert.ok(afterSecond.issues.some((i) => i.code === "missingZip"), "still needs a zip before it can walk");
  assert.equal(draft.canWalk(route.id), false);
});

test("removePlatform: pops the last platform and its incoming edge, clearing entry once empty", () => {
  const draft = freshDraft();
  const before = draft.getRoute("blue-2").platforms.length;
  const removed = draft.removePlatform("blue-2");
  assert.deepEqual(removed, { ok: true });
  const after = draft.getRoute("blue-2");
  assert.equal(after.platforms.length, before - 1);
  assert.equal(after.edges.length, before - 2);
  assert.equal(after.zip, null, "the zip departed from the platform that just disappeared");
});

test("movePlatform: repoints an existing platform to a different tree and refuses a junction platform", () => {
  const draft = freshDraft();
  const strong = draft.candidates.find((c) => c.health >= 0.7);
  const platformId = draft.getRoute("blue-2").platforms[1].id;
  const result = draft.movePlatform("blue-2", platformId, strong.id);
  assert.deepEqual(result, { ok: true });
  assert.equal(draft.getRoute("blue-2").platforms[1].treeIndex, draft.heroTrees.findIndex((t) => t.x === strong.x && t.z === strong.z));
});

test("removeRoute: refuses to delete a route that hosts another route's junction platform", () => {
  const draft = createBuilderDraft({ parkDef: PARK_CONFIG_full(), terrain, rng: new Rng(SEED).fork("junction-test") });
  assert.deepEqual(draft.removeRoute("red-2"), { ok: false, reason: "hostsJunction" });
  assert.deepEqual(draft.removeRoute("red-3"), { ok: true });
  assert.deepEqual(draft.removeRoute("unknown-route"), { ok: false, reason: "notFound" });
});
function PARK_CONFIG_full() { return generateParkLayout({ seed: SEED, terrain, config: PARK_CONFIG }); }

// --- zip evaluation + commit ---------------------------------------------------------------------------

test("evaluateZip/commitZip: refuses outside the 3-6% gradient window, accepts and stores a valid one", () => {
  const draft = freshDraft();
  const routeId = "blue-1";
  const last = draft.getRoute(routeId).platforms.at(-1);
  const tree = draft.heroTrees[last.treeIndex];
  // Directly below the platform (near-zero horizontal run) is a near-vertical, certainly-refused line.
  const bad = draft.evaluateZip(routeId, { x: tree.x + 0.5, z: tree.z + 0.5 });
  assert.equal(bad.ok, false);
  assert.deepEqual(draft.commitZip(routeId, { x: tree.x + 0.5, z: tree.z + 0.5 }), { ok: false, evaluated: bad });

  // Search a real 3-6% line the same way the generator itself would, and confirm it commits.
  let found = null;
  for (let a = 0; a < 360 && !found; a += 3) {
    const rad = (a * Math.PI) / 180;
    for (const len of [40, 45, 50, 55]) {
      const candidate = { x: tree.x + Math.cos(rad) * len, z: tree.z + Math.sin(rad) * len };
      const evaluated = draft.evaluateZip(routeId, candidate);
      if (evaluated && evaluated.ok) { found = candidate; break; }
    }
  }
  assert.ok(found, "fixture assumption: at least one valid zip line exists near blue-1's last platform");
  const commit = draft.commitZip(routeId, found);
  assert.deepEqual(commit, { ok: true });
  const zip = draft.getRoute(routeId).zip;
  assert.ok(zip.gradient >= 0.03 - 1e-6 && zip.gradient <= 0.06 + 1e-6);
  assert.equal(draft.getRoute(routeId).issues.some((i) => i.code === "missingZip"), false);
});

// --- customPark serialisation round-trip ----------------------------------------------------------------

test("serialize/restore: heroTrees, routes and walked-status all round-trip", () => {
  const draft = freshDraft();
  draft.markWalked("blue-1");
  const empty = draft.addRoute("red");                          // 0 platforms – not buildable yet
  const started = draft.addRoute("black");                      // 1 platform – buildable, still "draft"
  const candidate = draft.candidates.find((c) => !c.existing && c.health >= SURVEY.minHealthForPlatform);
  draft.addPlatform(started.id, candidate.id);

  const saved = draft.serialize();
  assert.equal(saved.schema, 1);
  assert.equal(saved.parkDef.routes.some((r) => r.id === empty.id), false, "a route with no entry deck yet is excluded from the buildable parkDef");
  assert.equal(saved.parkDef.routes.some((r) => r.id === started.id), true, "a 1-platform route already has an entry deck and IS buildable");
  assert.equal(saved.routeStatus["blue-1"].walked, true);
  assert.equal(saved.routeStatus["blue-2"].walked, false);

  const restored = createBuilderDraft({
    parkDef: saved.parkDef, terrain, rng: new Rng(SEED).fork("builder-test"),
    walkedStatus: Object.fromEntries(Object.entries(saved.routeStatus).map(([id, s]) => [id, s.walked])),
  });
  // `.walked` (not the combined `.state`) is what this test is about – `.state` also folds in
  // validation issues, which can legitimately depend on *other* routes' trees (cross-route clearance)
  // and are not what a serialise/restore round-trip is meant to prove here.
  assert.equal(restored.getRoute("blue-1").walked, true);
  assert.equal(restored.getRoute("blue-2").walked, false);
  assert.equal(restored.getRoute(started.id).state, "draft", "still too few platforms/no zip");
  assert.equal(restored.heroTrees.length, saved.parkDef.heroTrees.length);
  assert.deepEqual(restored.routes.map((r) => r.id).sort(), saved.parkDef.routes.map((r) => r.id).sort());

  const again = restored.serialize();
  assert.equal(JSON.stringify(again.parkDef), JSON.stringify(saved.parkDef), "serialising an unchanged restored draft must reproduce the same parkDef");
});

// --- M3b rescuer posts + coverage (GDD §4 "rescuer") ----------------------------------------------------

test("rescuePostCandidates: every hub plus every route's own entry, addRescuePost places one, capped at RESCUE.maxPosts", () => {
  const draft = freshDraft();
  const candidates = draft.rescuePostCandidates();
  assert.ok(candidates.some((c) => c.id === "hub:0"), "the spawn hub is always a candidate");
  assert.ok(candidates.some((c) => c.id.startsWith("entry:")), "every route's entry is a candidate");
  assert.ok(candidates.length >= 4, "the small park's own hub + six route entries should give plenty of candidates");
  assert.equal(draft.rescuePosts.length, 0);

  const first = draft.addRescuePost("hub:0");
  assert.equal(first.ok, true);
  assert.equal(draft.rescuePosts.length, 1);
  assert.equal(draft.rescuePosts[0].x, candidates.find((c) => c.id === "hub:0").x);
  assert.equal(draft.addRescuePost("hub:0").ok, false, "the same candidate cannot be placed twice");

  for (const c of candidates) { if (draft.rescuePosts.length >= RESCUE.maxPosts) break; draft.addRescuePost(c.id); }
  assert.equal(draft.rescuePosts.length, RESCUE.maxPosts);
  const stillFree = candidates.find((c) => !draft.rescuePosts.some((p) => p.id === `post-${c.id}`));
  assert.equal(draft.addRescuePost(stillFree.id).ok, false, `a ${RESCUE.maxPosts + 1}th post is refused`);
});

test("removeRescuePost: frees the slot back up", () => {
  const draft = freshDraft();
  const post = draft.addRescuePost("hub:0");
  assert.equal(post.ok, true);
  const id = draft.rescuePosts[0].id;
  assert.equal(draft.removeRescuePost("does-not-exist").ok, false);
  assert.equal(draft.removeRescuePost(id).ok, true);
  assert.equal(draft.rescuePosts.length, 0);
});

test("rescueCoverage: no posts placed leaves every platform uncovered", () => {
  const draft = freshDraft();
  const coverage = draft.rescueCoverage();
  assert.equal(coverage.covered.size, 0);
  assert.ok(coverage.uncovered.size > 0, "the small park has at least one platform to be uncovered");
  assert.ok(coverage.radiusM > 0);
});

test("rescueCoverage: a post at the hub covers routes near it, and never covers a platform impossibly far away", () => {
  const draft = freshDraft();
  draft.addRescuePost("hub:0");
  const coverage = draft.rescueCoverage();
  assert.ok(coverage.covered.size > 0, "at least the nearest route's own platforms should be reachable from the hub");
  // Every distance reported must be non-negative and finite – a broken graph walk would otherwise
  // silently produce NaN/Infinity here instead of a clean covered/uncovered split.
  for (const d of Object.values(coverage.distanceOf)) assert.ok(Number.isFinite(d) && d >= 0);
});

test("rescueCoverage: a junction platform (shared by two routes) keeps the shorter of the two distances", () => {
  // PARK_CONFIG's own red-III/black-II routes join an earlier route's platform (js/park/layout.js) –
  // reuse the real, full park so at least one junction actually exists.
  const fullParkDef = generateParkLayout({ seed: SEED, terrain, config: PARK_CONFIG });
  const draft = createBuilderDraft({ parkDef: fullParkDef, terrain, rng: new Rng(SEED).fork("builder-rescue-test") });
  draft.addRescuePost("hub:0");
  const coverage = draft.rescueCoverage();
  const junctionIds = new Set();
  const seen = new Set();
  for (const route of draft.routes) {
    for (const platform of route.platforms) {
      if (seen.has(platform.id)) junctionIds.add(platform.id);
      seen.add(platform.id);
    }
  }
  assert.ok(junctionIds.size > 0, "PARK_CONFIG is expected to have at least one junction platform");
  for (const id of junctionIds) assert.ok(Number.isFinite(coverage.distanceOf[id]), `junction platform ${id} should have a resolved distance`);
});
