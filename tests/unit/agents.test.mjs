// NPC guests (ROADMAP M1.6/M3b): the THREE-free parts of js/npc/agents.js, js/npc/profiles.js and
// js/game/occupancy.js – occupancy bookkeeping, queue ordering, deterministic route assignment, and
// (M3b) profile stats/groups, courage+queue-aware route choice and the fear-event roll. Everything that
// walks a real element/ladder rail needs the built course (THREE) and is verified instead via the
// Playwright smoke run documented in HANDOVER.md.
import test from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../../js/core/rng.js";
import { NPC, RULES, FEAR } from "../../js/config.js";
import { createOccupancy, createQueue, createQueueRegistry, createStatTracker } from "../../js/game/occupancy.js";
import { pickProfile, pickRouteForProfile, planAgents, rollFearEvent } from "../../js/npc/agents.js";
import { PROFILES, chooseRouteConsideringQueues } from "../../js/npc/profiles.js";

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

// --- M3b: wait-time / fear-event running averages (js/game/occupancy.js#createStatTracker) -----------

test("stat tracker: running mean per key, zero for an unseen key", () => {
  const tracker = createStatTracker();
  assert.equal(tracker.averageOf("blue-1"), 0);
  tracker.record("blue-1", 10);
  tracker.record("blue-1", 20);
  assert.equal(tracker.averageOf("blue-1"), 15);
  tracker.record("red-1", 4);
  assert.deepEqual(tracker.snapshot(), { "blue-1": 15, "red-1": 4 });
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
  const ids = new Set(PROFILES.map((p) => p.id));
  for (let i = 0; i < 50; i++) assert.ok(ids.has(pickProfile(rng).id));
});

test("pickRouteForProfile stays within the profile's category when the park has one", () => {
  const rng = new Rng(3);
  const profile = PROFILES.find((p) => p.category === "red");
  for (let i = 0; i < 20; i++) assert.equal(pickRouteForProfile(profile, FAKE_ROUTES, rng).category, "red");
});

test("pickRouteForProfile falls back to any route if none match the category", () => {
  const rng = new Rng(3);
  const profile = { id: "ghost", category: "legendary", weight: 1, heightScale: [1, 1] };
  const picked = pickRouteForProfile(profile, FAKE_ROUTES, rng);
  assert.ok(FAKE_ROUTES.includes(picked));
});

test("chooseRouteConsideringQueues: a timid guest is drawn to blue even from a non-blue default profile", () => {
  const rng = new Rng(9);
  const bold = PROFILES.find((p) => p.id === "sporty");             // default category "black"
  const timidVariant = { ...bold, courage: 0.1 };                    // but this particular guest is scared
  let blueCount = 0;
  for (let i = 0; i < 40; i++) if (chooseRouteConsideringQueues(timidVariant, FAKE_ROUTES, rng).category === "blue") blueCount += 1;
  assert.ok(blueCount > 22, `expected courage to dominate the pick most of the time, got ${blueCount}/40 blue`);
});

test("chooseRouteConsideringQueues: a long queue makes a route less likely to be picked again", () => {
  const rng = new Rng(4);
  const profile = PROFILES.find((p) => p.id === "adult");
  const busy = (id) => (id === "red-1" ? 12 : 0);
  let redOne = 0;
  for (let i = 0; i < 60; i++) if (chooseRouteConsideringQueues(profile, FAKE_ROUTES, rng, busy).id === "red-1") redOne += 1;
  assert.ok(redOne < 10, `a heavily queued route should rarely win, got ${redOne}/60`);
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

test("planAgents: every guest carries courage/strength/patience within a sane range", () => {
  const plan = planAgents({ rng: new Rng(21).fork("npc"), parkDef: FAKE_PARK_DEF, count: 30 });
  for (const guest of plan) {
    assert.ok(guest.courage >= 0 && guest.courage <= 1, `courage out of range: ${guest.courage}`);
    assert.ok(guest.strength >= 0 && guest.strength <= 1, `strength out of range: ${guest.strength}`);
    assert.ok(guest.patienceSeconds >= 8, `patience implausibly short: ${guest.patienceSeconds}`);
  }
});

test("planAgents: a group profile (kid+chaperone, school group) shares one route and one groupId", () => {
  // Force count high enough that group profiles are very likely rolled at least once, then verify
  // whichever groups DID appear are internally consistent, rather than asserting a fragile exact roll.
  const plan = planAgents({ rng: new Rng(77).fork("npc"), parkDef: FAKE_PARK_DEF, count: 40 });
  const groups = new Map();
  for (const guest of plan) {
    if (!guest.groupId) continue;
    if (!groups.has(guest.groupId)) groups.set(guest.groupId, []);
    groups.get(guest.groupId).push(guest);
  }
  assert.ok(groups.size > 0, "a 40-guest roster should roll at least one grouped profile");
  for (const members of groups.values()) {
    const routeIds = new Set(members.map((m) => m.routeId));
    const profileIds = new Set(members.map((m) => m.profileId));
    assert.equal(routeIds.size, 1, "every member of a group heads to the same route");
    assert.equal(profileIds.size, 1, "every member of a group shares one archetype");
    assert.ok(members.some((m) => m.isChaperone), "a group always has at least one chaperone");
  }
});

// --- M3b: fear-event roll (js/npc/profiles.js#rollFearEvent) – deterministic, no THREE, no course ------

test("rollFearEvent: an element at or under the psychological threshold never triggers anything", () => {
  const rng = { next: () => 0 };   // would trigger everything if the threshold gate were missing
  assert.equal(rollFearEvent({ courage: 0, psychMetric: FEAR.psychThreshold, rng }), "none");
  assert.equal(rollFearEvent({ courage: 0, psychMetric: 0, rng }), "none");
});

test("rollFearEvent: full courage (1) never freezes or panics, however demanding the element", () => {
  const rng = { next: () => 0 };   // the least lucky possible draw
  assert.equal(rollFearEvent({ courage: 1, psychMetric: 5, rng }), "none");
});

test("rollFearEvent: a low first roll plus a low second roll on a demanding element escalates to panic", () => {
  const calls = [];
  const rng = { next: () => { calls.push(1); return calls.length === 1 ? 0 : 0; } };
  assert.equal(rollFearEvent({ courage: 0, psychMetric: 5, rng }), "panic");
});

test("rollFearEvent: a low first roll but a high second roll on a demanding element only freezes", () => {
  const sequence = [0, 0.999];
  let i = 0;
  const rng = { next: () => sequence[i++] };
  assert.equal(rollFearEvent({ courage: 0, psychMetric: 5, rng }), "freeze");
});

test("rollFearEvent: a high first roll never even reaches the freeze/panic branch", () => {
  const rng = { next: () => 0.999 };
  assert.equal(rollFearEvent({ courage: 0, psychMetric: 5, rng }), "none");
});

test("rollFearEvent: deterministic given the same rng sequence", () => {
  const makeRng = () => new Rng(13).fork("fear-test");
  const a = rollFearEvent({ courage: 0.15, psychMetric: 4, rng: makeRng() });
  const b = rollFearEvent({ courage: 0.15, psychMetric: 4, rng: makeRng() });
  assert.equal(a, b);
});
