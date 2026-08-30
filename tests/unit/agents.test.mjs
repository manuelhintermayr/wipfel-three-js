// NPC guests (ROADMAP M1.6): the THREE-free parts of js/npc/agents.js and js/game/occupancy.js –
// occupancy bookkeeping, queue ordering and deterministic route assignment. Everything that walks a
// real element/ladder rail needs the built course (THREE) and is verified instead via the Playwright
// smoke run documented in HANDOVER.md.
import test from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../../js/core/rng.js";
import { NPC, RULES } from "../../js/config.js";
import { createOccupancy, createQueue, createQueueRegistry } from "../../js/game/occupancy.js";
import { pickProfile, pickRouteForProfile, planAgents } from "../../js/npc/agents.js";

// --- occupancy: element cap 1, platform cap 2 for guests, player priority --------------------------

test("element occupancy: one holder at a time, released before another may claim it", () => {
  const occupancy = createOccupancy();
  assert.equal(occupancy.holderOfElement("e1"), null);
  assert.equal(occupancy.claimElement("e1", "guest-0"), true);
  assert.equal(occupancy.holderOfElement("e1"), "guest-0");
  assert.equal(occupancy.claimElement("e1", "guest-1"), false, "capacity is 1 – a second holder is refused");
  assert.equal(occupancy.claimElement("e1", "guest-0"), true, "the current holder claiming again is a no-op success");
  occupancy.releaseElement("e1", "guest-0");
  assert.equal(occupancy.holderOfElement("e1"), null);
  assert.equal(occupancy.claimElement("e1", "guest-1"), true, "free again once released");
});

test("element occupancy honours RULES.maxPerElement (1) by default", () => {
  assert.equal(RULES.maxPerElement, 1);
  const occupancy = createOccupancy();
  occupancy.claimElement("e1", "a");
  assert.equal(occupancy.claimElement("e1", "b"), false);
});

test("player priority: the player claiming an element first refuses a guest in the same tick", () => {
  // Mirrors js/main.js's loop order: interaction.update() (the player) runs before agents.update()
  // (the guests) within the same gameplay-phase frame, so a tie always resolves to the player.
  const occupancy = createOccupancy();
  assert.equal(occupancy.claimElement("e1", "player"), true, "player claims first this frame");
  assert.equal(occupancy.claimElement("e1", "guest-0"), false, "the guest's own attempt the same tick is refused");
  occupancy.releaseElement("e1", "player");
  assert.equal(occupancy.claimElement("e1", "guest-0"), true, "free once the player leaves the element");
  assert.equal(occupancy.claimElement("e1", "player"), false, "and now the player would have to wait for the guest");
});

test("platform occupancy: guests capped at maxGuestsPerPlatform, the player is never counted or refused", () => {
  assert.equal(NPC.maxPerPlatformGuests, 2);
  assert.ok(NPC.maxPerPlatformGuests < RULES.maxPerPlatform, "guest cap must leave the player a slot");
  const occupancy = createOccupancy();
  assert.equal(occupancy.claimPlatform("p1", "guest-0", true), true);
  assert.equal(occupancy.claimPlatform("p1", "guest-1", true), true);
  assert.equal(occupancy.guestsOnPlatform("p1"), 2);
  assert.equal(occupancy.claimPlatform("p1", "guest-2", true), false, "a third guest is refused");
  // The player is never tracked here – js/player/interaction.js never calls claimPlatform for itself,
  // but a defensive `isGuest: false` call must never be refused either.
  assert.equal(occupancy.claimPlatform("p1", "player", false), true);
  assert.equal(occupancy.guestsOnPlatform("p1"), 2, "the player call did not consume a guest slot");
  occupancy.releasePlatform("p1", "guest-0", true);
  assert.equal(occupancy.guestsOnPlatform("p1"), 1);
  assert.equal(occupancy.claimPlatform("p1", "guest-2", true), true, "a slot freed up");
});

test("reset() clears every ledger", () => {
  const occupancy = createOccupancy();
  occupancy.claimElement("e1", "guest-0");
  occupancy.claimPlatform("p1", "guest-0", true);
  occupancy.reset();
  assert.equal(occupancy.holderOfElement("e1"), null);
  assert.equal(occupancy.guestsOnPlatform("p1"), 0);
});

// --- queue ordering -----------------------------------------------------------------------------------

test("queue is FIFO: join order is serve order, join is idempotent", () => {
  const queue = createQueue();
  assert.equal(queue.front(), null);
  queue.join("guest-0");
  queue.join("guest-1");
  queue.join("guest-0");   // already queued – must not move to the back or duplicate
  queue.join("guest-2");
  assert.deepEqual(queue.positions(), ["guest-0", "guest-1", "guest-2"]);
  assert.equal(queue.size, 3);
  assert.ok(queue.isFront("guest-0"));
  assert.ok(!queue.isFront("guest-1"));
});

test("queue: leaving the front admits the next in line without reordering the rest", () => {
  const queue = createQueue();
  for (const id of ["guest-0", "guest-1", "guest-2"]) queue.join(id);
  queue.leave("guest-0");
  assert.deepEqual(queue.positions(), ["guest-1", "guest-2"]);
  assert.ok(queue.isFront("guest-1"));
  queue.leave("guest-9");   // not queued – a no-op, not an error
  assert.deepEqual(queue.positions(), ["guest-1", "guest-2"]);
});

test("queue registry hands out one independent FIFO per element id", () => {
  const registry = createQueueRegistry();
  registry.queueFor("e1").join("guest-0");
  registry.queueFor("e2").join("guest-1");
  assert.deepEqual(registry.queueFor("e1").positions(), ["guest-0"]);
  assert.deepEqual(registry.queueFor("e2").positions(), ["guest-1"]);
  assert.strictEqual(registry.queueFor("e1"), registry.queueFor("e1"), "same id returns the same queue instance");
});

// --- route assignment: deterministic per seed --------------------------------------------------------

const FAKE_ROUTES = Object.freeze([
  { id: "blue-1", category: "blue" }, { id: "blue-2", category: "blue" },
  { id: "red-1", category: "red" }, { id: "red-2", category: "red" },
  { id: "black-1", category: "black" }, { id: "black-2", category: "black" },
]);
const FAKE_PARK_DEF = Object.freeze({ routes: FAKE_ROUTES });

test("pickProfile only ever returns a configured profile", () => {
  const rng = new Rng(7);
  const ids = new Set(NPC.profiles.map((p) => p.id));
  for (let i = 0; i < 50; i++) assert.ok(ids.has(pickProfile(rng).id));
});

test("pickRouteForProfile stays within the profile's category when the park has one", () => {
  const rng = new Rng(3);
  const profile = NPC.profiles.find((p) => p.category === "red");
  for (let i = 0; i < 20; i++) assert.equal(pickRouteForProfile(profile, FAKE_ROUTES, rng).category, "red");
});

test("pickRouteForProfile falls back to any route if none match the category", () => {
  const rng = new Rng(3);
  const profile = { id: "ghost", category: "legendary", weight: 1, heightScale: [1, 1] };
  const picked = pickRouteForProfile(profile, FAKE_ROUTES, rng);
  assert.ok(FAKE_ROUTES.includes(picked));
});

test("planAgents: guest count is within NPC.countMin..countMax and stable for a fixed seed", () => {
  const planA = planAgents({ rng: new Rng(42).fork("npc"), parkDef: FAKE_PARK_DEF });
  assert.ok(planA.length >= NPC.countMin && planA.length <= NPC.countMax);
  const planB = planAgents({ rng: new Rng(42).fork("npc"), parkDef: FAKE_PARK_DEF });
  assert.equal(planB.length, planA.length);
});

test("planAgents: the same seed reproduces byte-identical profiles/routes/looks", () => {
  const planA = planAgents({ rng: new Rng(11).fork("npc"), parkDef: FAKE_PARK_DEF });
  const planB = planAgents({ rng: new Rng(11).fork("npc"), parkDef: FAKE_PARK_DEF });
  assert.deepEqual(planB, planA);
  // …and a different seed is not merely coincidentally the same (flakiness guard for tiny rosters).
  const planC = planAgents({ rng: new Rng(12).fork("npc"), parkDef: FAKE_PARK_DEF });
  assert.notDeepEqual(planC, planA);
});

test("planAgents: every guest's route matches its profile's category (or falls back honestly)", () => {
  const plan = planAgents({ rng: new Rng(5).fork("npc"), parkDef: FAKE_PARK_DEF });
  const routeCategory = new Map(FAKE_ROUTES.map((r) => [r.id, r.category]));
  for (const guest of plan) assert.equal(routeCategory.get(guest.routeId), guest.category);
});

test("planAgents: a fixed count is honoured exactly", () => {
  const plan = planAgents({ rng: new Rng(1).fork("npc"), parkDef: FAKE_PARK_DEF, count: 10 });
  assert.equal(plan.length, 10);
  assert.equal(new Set(plan.map((g) => g.id)).size, 10, "ids are unique");
});
