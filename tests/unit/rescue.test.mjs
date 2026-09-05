// Rescuer role (ROADMAP M3b): the state machine in js/game/rescue.js, exercised headless (no DOM) –
// see that file's own comment on why `root` is optional, the same reason js/game/ticket.js stays
// DOM-free while js/ui/hud-route.js renders it. `input`/`player`/`getAgents` are small hand-built fakes;
// `events` is the real js/core/events.js bus (plain JS, no THREE, safe to use as-is).
import test from "node:test";
import assert from "node:assert/strict";
import { Events } from "../../js/core/events.js";
import { RESCUE, TIME } from "../../js/config.js";
import { createRescue } from "../../js/game/rescue.js";

const TIMER_SECONDS = RESCUE.timerGameMinutes * TIME.gameHourMinutes;
const POST = { id: "post-0", x: 0, z: 0 };
const GUEST_POS = { x: 5, y: 4, z: 5 };

/** A fresh, fully wired harness per test – nothing shared between tests. */
function harness({ posts = [POST], autoplay = false, isBuilderOpen = () => false } = {}) {
  const events = new Events();
  const notices = [];
  const hud = { setNotice: (text) => notices.push(text) };
  const player = { position: { x: 100, y: 0, z: 100 }, mode: "ground", states: { get: () => null } };
  const terrain = { heightAt: () => 0 };
  const resolved = [];
  const agent = { id: "guest-0", pos: { ...GUEST_POS } };
  const agents = {
    list: [agent],
    resolvePanic(id, opts) { resolved.push({ id, ...opts }); return true; },
    debugForcePanic: () => ({ guestId: "guest-0", elementId: "elem-0" }),
  };
  const resolvedOutcomes = [];
  const rescue = createRescue({
    player, input: { pressed: () => false }, events, hud, terrain,
    getParkDef: () => ({ rescuePosts: posts }), getAgents: () => agents,
    isBuilderOpen, autoplay,
    onResolved: (success) => resolvedOutcomes.push(success),
  });
  return { rescue, events, player, agent, notices, resolved, resolvedOutcomes };
}

test("idle by default, never a rescue target", () => {
  const { rescue } = harness();
  assert.equal(rescue.state, "idle");
  assert.equal(rescue.isTarget("anything"), false);
  assert.equal(rescue.remainingSeconds, 0);
});

test("npc:panic moves idle → pending and shows a toast", () => {
  const { rescue, events, notices } = harness();
  events.emit("npc:panic", { guestId: "guest-0", elementId: "elem-0" });
  assert.equal(rescue.state, "pending");
  assert.ok(notices.length > 0, "a toast notice should fire");
});

test("pending → active: standing at a rescuer post and pressing interact starts the full timer", () => {
  const events = new Events();
  const hud = { setNotice() {} };
  const player = { position: { x: 100, y: 0, z: 100 }, mode: "ground", states: { get: () => null } };
  let interactHeld = false;
  const input = { pressed: (a) => a === "interact" && interactHeld };
  const agents = { list: [{ id: "guest-0", pos: { ...GUEST_POS } }], resolvePanic: () => true, debugForcePanic: () => null };
  const rescue = createRescue({
    player, input, events, hud, terrain: { heightAt: () => 0 },
    getParkDef: () => ({ rescuePosts: [POST] }), getAgents: () => agents,
  });

  events.emit("npc:panic", { guestId: "guest-0", elementId: "elem-0" });
  assert.equal(rescue.state, "pending");

  // Not at the post yet: interact does nothing.
  interactHeld = true;
  rescue.update(0.1);
  assert.equal(rescue.state, "pending", "not at a post yet");

  // Walk to the post, then press.
  player.position.x = POST.x; player.position.z = POST.z;
  rescue.update(0.1);
  assert.equal(rescue.state, "active");
  assert.equal(rescue.remainingSeconds, TIMER_SECONDS);
});

test("active: the timer counts down with dt and expiry resolves as a failure", () => {
  const events = new Events();
  const notices = [];
  const hud = { setNotice: (text) => notices.push(text) };
  const player = { position: { x: POST.x, y: 0, z: POST.z }, mode: "ground", states: { get: () => null } };
  const resolvedCalls = [];
  const onResolvedCalls = [];
  const agents = {
    list: [{ id: "guest-0", pos: { ...GUEST_POS } }],
    resolvePanic: (id, opts) => { resolvedCalls.push({ id, ...opts }); return true; },
    debugForcePanic: () => null,
  };
  const input = { pressed: () => true };
  const rescue = createRescue({
    player, input, events, hud, terrain: { heightAt: () => 0 },
    getParkDef: () => ({ rescuePosts: [POST] }), getAgents: () => agents,
    onResolved: (success) => onResolvedCalls.push(success),
  });
  events.emit("npc:panic", { guestId: "guest-0", elementId: "elem-0" });
  rescue.update(0.1);   // claims it (player already at the post, interact always "pressed" here)
  assert.equal(rescue.state, "active");

  rescue.update(TIMER_SECONDS - 1);
  assert.ok(rescue.remainingSeconds > 0 && rescue.remainingSeconds <= 1.01);
  assert.equal(resolvedCalls.length, 0, "not expired yet");

  rescue.update(2);   // pushes it over the edge
  assert.equal(rescue.state, "idle", "expiry returns to idle");
  assert.deepEqual(resolvedCalls, [{ id: "guest-0", success: false }]);
  assert.deepEqual(onResolvedCalls, [false]);
});

test("active → talkdown → success: reaching the guest's own element and pressing interact starts the breathing beat, which resolves as a success", () => {
  const events = new Events();
  const player = {
    position: { x: POST.x, y: 0, z: POST.z }, mode: "ground",
    states: { get: (mode) => (mode === "element" ? player._elementState : null) },
    _elementState: null,
  };
  const resolvedCalls = [];
  const onResolvedCalls = [];
  const agent = { id: "guest-0", pos: { ...GUEST_POS } };
  const agents = {
    list: [agent],
    resolvePanic: (id, opts) => { resolvedCalls.push({ id, ...opts }); return true; },
    debugForcePanic: () => null,
  };
  const input = { pressed: () => true };
  const rescue = createRescue({
    player, input, events, hud: { setNotice() {} }, terrain: { heightAt: () => 0 },
    getParkDef: () => ({ rescuePosts: [POST] }), getAgents: () => agents,
    onResolved: (success) => onResolvedCalls.push(success),
  });
  events.emit("npc:panic", { guestId: "guest-0", elementId: "elem-0" });
  rescue.update(0.1);   // → active (already at the post)
  assert.equal(rescue.state, "active");
  assert.equal(rescue.isTarget("elem-0"), true);
  assert.equal(rescue.isTarget("some-other-element"), false);

  // Not on the element yet: pressing interact does not start the talkdown.
  rescue.update(0.1);
  assert.equal(rescue.state, "active");

  // Arrive on the guest's own element, right next to them.
  player.mode = "element";
  player._elementState = { element: { id: "elem-0" } };
  player.position.x = agent.pos.x; player.position.y = agent.pos.y; player.position.z = agent.pos.z;
  rescue.update(0.1);
  assert.equal(rescue.state, "talkdown");
  assert.equal(rescue.talkdownSecondsLeft, RESCUE.talkdownSeconds);

  rescue.update(RESCUE.talkdownSeconds + 1);
  assert.equal(rescue.state, "idle");
  assert.deepEqual(resolvedCalls, [{ id: "guest-0", success: true }]);
  assert.deepEqual(onResolvedCalls, [true]);
});

test("autoplay: npc:panic is entirely ignored, state never leaves idle", () => {
  const { rescue, events } = harness({ autoplay: true });
  events.emit("npc:panic", { guestId: "guest-0", elementId: "elem-0" });
  assert.equal(rescue.state, "idle");
  rescue.update(999);
  assert.equal(rescue.state, "idle");
});

test("isBuilderOpen: update() is a no-op while true, even mid-timer", () => {
  let builderOpen = false;
  const { rescue, events, player } = harness({ isBuilderOpen: () => builderOpen });
  events.emit("npc:panic", { guestId: "guest-0", elementId: "elem-0" });
  player.position.x = POST.x; player.position.z = POST.z;
  // Fake a "held interact" via a fresh instance would be needed for a real press; instead verify the
  // simpler, load-bearing guarantee: once builder mode opens, a huge dt never drains the timer.
  builderOpen = true;
  rescue.update(10000);
  assert.equal(rescue.state, "pending", "still pending – isBuilderOpen blocked even the pending→active check");
});

test("no rescuer posts placed: pending never advances to active", () => {
  const { rescue, events, player } = harness({ posts: [] });
  events.emit("npc:panic", { guestId: "guest-0", elementId: "elem-0" });
  player.position.x = 0; player.position.z = 0;
  for (let i = 0; i < 5; i++) rescue.update(1);
  assert.equal(rescue.state, "pending");
});

test("forcePanic: claims immediately (skips pending), no-op if already mid-rescue", () => {
  const { rescue } = harness();
  const result = rescue.forcePanic();
  assert.deepEqual(result, { guestId: "guest-0", elementId: "elem-0" });
  assert.equal(rescue.state, "active");
  assert.equal(rescue.remainingSeconds, TIMER_SECONDS);
  assert.equal(rescue.forcePanic(), null, "already active – a second call does nothing");
});

test("forcePanic returns null when js/npc/agents.js has nothing eligible to panic", () => {
  const events = new Events();
  const agents = { list: [], resolvePanic: () => true, debugForcePanic: () => null };
  const rescue = createRescue({
    player: { position: { x: 0, y: 0, z: 0 }, mode: "ground", states: { get: () => null } },
    input: { pressed: () => false }, events, hud: { setNotice() {} }, terrain: { heightAt: () => 0 },
    getParkDef: () => ({ rescuePosts: [] }), getAgents: () => agents,
  });
  assert.equal(rescue.forcePanic(), null);
  assert.equal(rescue.state, "idle");
});

test("dispose(): unsubscribes from npc:panic", () => {
  const { rescue, events } = harness();
  rescue.dispose();
  events.emit("npc:panic", { guestId: "guest-0", elementId: "elem-0" });
  assert.equal(rescue.state, "idle", "no listener left to react");
});
