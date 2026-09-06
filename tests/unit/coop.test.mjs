// Local co-op (ROADMAP M4, GDD §3.11): the THREE-free parts – js/core/input-source.js (player 2's
// input facade), js/player/coop-camera.js (the shared-frame maths, ADR-030) and js/game/coop-elements.js
// (element linking/shared physics, the two co-op elements' haul/tension math, the leash curve, and the
// shared-run detection). js/game/coop.js itself pulls in THREE transitively (a real player, camera,
// belay, vitals, interaction) and is verified instead via tools/dev/verify-m4.mjs – see that file and
// HANDOVER.md.
import test from "node:test";
import assert from "node:assert/strict";
import { createGamepadInputSource, createTestInputSource, isGamepadConnected } from "../../js/core/input-source.js";
import { activityWeight, computeCoopFrame } from "../../js/player/coop-camera.js";
import {
  elementsShareSupport, applySharedPhysics, isHelperInRange, findCoopElements,
  decayHaulCharge, addHaulCharge, counterweightSpeed, teamBridgeKickScale,
  leashFactor, sharedRouteId, justFinishedSharedZip,
} from "../../js/game/coop-elements.js";
import { COOP, COOP_ELEMENTS } from "../../js/config.js";

// --- test doubles ------------------------------------------------------------------------------------

/** A plain {x,y,z} with just enough THREE.Vector3 surface for js/game/coop-elements.js's own reads –
 *  the same "duck-type just enough" idea js/npc/agents.js's own `vec3()` helper already uses. */
function vec3(x, y, z) {
  return { x, y, z, distanceTo(o) { return Math.hypot(x - o.x, y - o.y, z - o.z); } };
}

function fakePlayer(mode, position = vec3(0, 0, 0)) {
  return { mode, position };
}

function fakeWobble(lateral = 0, vertical = 0) {
  const excited = [];
  return {
    lateralVelocity: lateral, verticalVelocity: vertical,
    excite(l, v) { excited.push([l, v]); },
    get calls() { return excited; },
  };
}

function fakeElement(id, { entryPlatformId, exitPlatformId, wobble = fakeWobble() } = {}) {
  return {
    id, wobble,
    getEntryAnchor: () => ({ platformId: entryPlatformId, stand: vec3(0, 0, 0) }),
    getExitAnchor: () => ({ platformId: exitPlatformId, stand: vec3(10, 0, 0) }),
  };
}

// --- js/core/input-source.js ------------------------------------------------------------------------

test("isGamepadConnected: false under plain Node (no navigator.getGamepads)", () => {
  assert.equal(isGamepadConnected(), false);
});

test("createGamepadInputSource: exposes the full Input-like surface and is inert with no pad connected", () => {
  const src = createGamepadInputSource();
  src.poll();
  assert.equal(src.connected, false);
  // `Math.abs` sidesteps -0 vs +0 (node:assert/strict's strictEqual distinguishes them, unlike `===`) –
  // js/core/input-source.js#poll negates a still-zero axis value, which produces exactly that -0.
  assert.equal(Math.abs(src.move.x), 0);
  assert.equal(Math.abs(src.move.y), 0);
  assert.equal(src.down("interact"), false);
  assert.equal(src.pressed("jump"), false);
  for (const method of ["poll", "down", "pressed", "released", "consume", "requestPointerLock", "endFrame"]) {
    assert.equal(typeof src[method], "function", `missing method: ${method}`);
  }
  assert.doesNotThrow(() => { src.consume("jump"); src.requestPointerLock(); src.endFrame(); });
});

test("createTestInputSource: same method-name contract, never throws, always reports not-pressed", () => {
  const src = createTestInputSource();
  src.poll();
  assert.equal(src.connected, true);
  assert.equal(src.down("interact"), false);
  assert.equal(src.pressed("clip"), false);
  assert.equal(src.released("jump"), false);
  src.endFrame();
});

// --- js/player/coop-camera.js -------------------------------------------------------------------------

test("activityWeight: known modes match js/config.js#COOP.camera.activityWeight, unknown falls back to ground", () => {
  assert.equal(activityWeight("element"), COOP.camera.activityWeight.element);
  assert.equal(activityWeight("zipline"), COOP.camera.activityWeight.zipline);
  assert.equal(activityWeight("ground"), COOP.camera.activityWeight.ground);
  assert.equal(activityWeight("no-such-mode"), COOP.camera.activityWeight.ground);
});

test("computeCoopFrame: both on the ground, standing together, frames close to the midpoint", () => {
  const frame = computeCoopFrame(
    { position: { x: 0, y: 0, z: 0 }, mode: "ground" },
    { position: { x: 2, y: 0, z: 0 }, mode: "ground" },
  );
  // Same activity weight on both sides – player 1's own +epsilon tie-break (see this module's header)
  // pulls the blend a hair short of the exact midpoint, so this checks "close to 1", not "exactly 1".
  assert.ok(Math.abs(frame.position.x - 1) < 0.01, `expected close to the midpoint x=1, got ${frame.position.x}`);
  assert.ok(frame.position.x < 1, "the tie-break favours player 1, so the frame sits a hair towards them");
  assert.equal(frame.separation, 2);
});

test("computeCoopFrame: 'frame the climber' – an element/ground pair pulls the frame towards whoever climbs", () => {
  const frame = computeCoopFrame(
    { position: { x: 0, y: 0, z: 0 }, mode: "element" },
    { position: { x: 10, y: 0, z: 0 }, mode: "ground" },
  );
  assert.ok(frame.position.x < 5, `expected the frame closer to the climber (x<5), got ${frame.position.x}`);
  assert.ok(frame.weightP2 < 0.5, "player 2 (on the ground) pulls less than half the blend");
});

test("computeCoopFrame: distance grows with separation and is clamped at COOP.camera.distanceMax", () => {
  const together = computeCoopFrame({ position: { x: 0, y: 0, z: 0 }, mode: "ground" }, { position: { x: 0, y: 0, z: 0 }, mode: "ground" });
  assert.equal(together.distance, COOP.camera.distanceBase, "zero separation is exactly the base distance");
  assert.ok(together.distance >= COOP.camera.distanceMin && together.distance <= COOP.camera.distanceMax);
  const far = computeCoopFrame({ position: { x: 0, y: 0, z: 0 }, mode: "ground" }, { position: { x: 500, y: 0, z: 0 }, mode: "ground" });
  assert.equal(far.distance, COOP.camera.distanceMax, "clamped once separation grows large enough");
});

test("computeCoopFrame: a perfect tie (identical mode) still resolves deterministically towards player 1", () => {
  const frame = computeCoopFrame({ position: { x: 0, y: 0, z: 0 }, mode: "ground" }, { position: { x: 10, y: 0, z: 0 }, mode: "ground" });
  assert.ok(frame.weightP2 < 0.5, "the +epsilon on player 1's own weight breaks the tie in their favour");
});

// --- js/game/coop-elements.js: element linking + shared physics -------------------------------------

test("elementsShareSupport: identical, adjacent (exit==entry), a shared junction platform, and unrelated", () => {
  const a = fakeElement("a", { entryPlatformId: "p1", exitPlatformId: "p2" });
  const b = fakeElement("b", { entryPlatformId: "p2", exitPlatformId: "p3" });
  const c = fakeElement("c", { entryPlatformId: "p1", exitPlatformId: "p9" });   // shares p1 with `a`
  const unrelated = fakeElement("d", { entryPlatformId: "px", exitPlatformId: "py" });
  assert.equal(elementsShareSupport(a, a), true, "identical");
  assert.equal(elementsShareSupport(a, b), true, "a's exit is b's entry");
  assert.equal(elementsShareSupport(a, c), true, "both start from the same platform");
  assert.equal(elementsShareSupport(a, unrelated), false);
  assert.equal(elementsShareSupport(null, a), false);
  assert.equal(elementsShareSupport(null, null), false);
});

test("applySharedPhysics: symmetric, dt-scaled, bounded, and a no-op for null/identical/dt<=0", () => {
  const a = fakeElement("a", { entryPlatformId: "p1", exitPlatformId: "p2", wobble: fakeWobble(1.0, 0.2) });
  const b = fakeElement("b", { entryPlatformId: "p2", exitPlatformId: "p3", wobble: fakeWobble(-0.5, 0.1) });
  applySharedPhysics(a, b, 1 / 60, 0.6);
  assert.equal(a.wobble.calls.length, 1);
  assert.equal(b.wobble.calls.length, 1);
  const [lateralIntoA, verticalIntoA] = a.wobble.calls[0];
  assert.ok(Math.abs(lateralIntoA - (-0.5 * 0.6) / 60) < 1e-9, "a receives 60% of b's lateral velocity, dt-scaled");
  assert.ok(Math.abs(verticalIntoA - (0.1 * 0.6) / 60) < 1e-9);
  const [lateralIntoB] = b.wobble.calls[0];
  assert.ok(Math.abs(lateralIntoB - (1.0 * 0.6) / 60) < 1e-9, "b receives 60% of a's lateral velocity");

  const c = fakeElement("c", { entryPlatformId: "px", exitPlatformId: "py" });
  applySharedPhysics(null, c, 1 / 60);
  applySharedPhysics(a, a, 1 / 60);
  applySharedPhysics(a, b, 0);
  assert.equal(c.wobble.calls.length, 0);
  assert.equal(a.wobble.calls.length, 1, "no additional call from the identical-element or dt<=0 cases");
});

test("isHelperInRange: on foot and within COOP_ELEMENTS.helperRange only", () => {
  const stand = vec3(0, 0, 0);
  assert.equal(isHelperInRange(fakePlayer("ground", vec3(1, 0, 0)), stand), true);
  assert.equal(isHelperInRange(fakePlayer("ground", vec3(50, 0, 0)), stand), false, "too far");
  assert.equal(isHelperInRange(fakePlayer("element", vec3(0.1, 0, 0)), stand), false, "not on foot");
});

test("findCoopElements: partitions a course's elements by kind, ignoring every other kind", () => {
  const lift = { kind: "counterweight-lift" };
  const bridge = { kind: "team-bridge" };
  const other = { kind: "burma-bridge" };
  const course = { routes: [{ elements: [lift, other] }, { elements: [bridge] }, { elements: [] }] };
  const found = findCoopElements(course);
  assert.deepEqual(found.lifts, [lift]);
  assert.deepEqual(found.bridges, [bridge]);
});

// --- js/game/coop-elements.js: counterweight lift + team bridge math --------------------------------

test("decayHaulCharge: linear decay, floored at zero", () => {
  const cfg = COOP_ELEMENTS.counterweightLift;
  const after1s = decayHaulCharge(0.5, 1, cfg);
  assert.ok(Math.abs(after1s - Math.max(0, 0.5 - cfg.haulDecayPerSecond)) < 1e-9);
  assert.equal(decayHaulCharge(0.001, 10, cfg), 0, "never goes negative");
});

test("addHaulCharge: adds the tap boost, clamped at the configured maxSpeed", () => {
  const cfg = COOP_ELEMENTS.counterweightLift;
  assert.equal(addHaulCharge(0, cfg.haulTapBoost, cfg), cfg.haulTapBoost);
  assert.equal(addHaulCharge(cfg.maxSpeed, cfg.haulTapBoost, cfg), cfg.maxSpeed, "clamped, not overshot");
});

test("counterweightSpeed: the self-haul floor is always present, taps add on top up to maxSpeed", () => {
  const cfg = COOP_ELEMENTS.counterweightLift;
  assert.equal(counterweightSpeed(0, cfg), cfg.selfHaulSpeed, "solo (no haul charge) still moves");
  assert.ok(counterweightSpeed(cfg.maxSpeed, cfg) <= cfg.maxSpeed);
  assert.ok(counterweightSpeed(0.1, cfg) > cfg.selfHaulSpeed, "a partner's charge genuinely speeds it up");
});

test("teamBridgeKickScale: full kick normally, -60% while the tension rope is held", () => {
  assert.equal(teamBridgeKickScale(false), 1);
  assert.equal(teamBridgeKickScale(true), COOP_ELEMENTS.teamBridge.tensionKickScale);
  assert.equal(teamBridgeKickScale(true, 0.25), 0.25, "an explicit scale overrides the config default");
});

// --- js/game/coop-elements.js: the leash curve --------------------------------------------------------

test("leashFactor: no damping at or below COOP.leash.startM", () => {
  assert.equal(leashFactor(0), 1);
  assert.equal(leashFactor(COOP.leash.startM), 1);
  assert.equal(leashFactor(COOP.leash.startM - 5), 1);
});

test("leashFactor: ramps down linearly past startM, floored at minFactor, never lower", () => {
  const { startM, maxExtraM, minFactor } = COOP.leash;
  const half = leashFactor(startM + maxExtraM / 2);
  assert.ok(half > minFactor && half < 1, `expected a midpoint value strictly between minFactor and 1, got ${half}`);
  assert.equal(leashFactor(startM + maxExtraM), minFactor);
  assert.equal(leashFactor(startM + maxExtraM * 10), minFactor, "never damped below the floor, however far apart");
});

// --- js/game/coop-elements.js: the shared run (companion badge) ---------------------------------------

test("sharedRouteId: both climbers on the same ladder anchor resolve to that route's id", () => {
  const routeOf = (anchorId) => (anchorId === "blue-2-deck" ? { id: "blue-2" } : null);
  assert.equal(sharedRouteId("blue-2-deck", "blue-2-deck", routeOf), "blue-2");
});

test("sharedRouteId: null whenever the two anchors differ, are missing, or resolve to no route", () => {
  const routeOf = (anchorId) => (anchorId === "blue-2-deck" ? { id: "blue-2" } : null);
  assert.equal(sharedRouteId("blue-2-deck", "red-1-deck", routeOf), null, "different routes");
  assert.equal(sharedRouteId(null, null, routeOf), null);
  assert.equal(sharedRouteId("elem-e1", "elem-e1", routeOf), null, "same anchor id, but not a ladder anchor – resolves to no route");
});

test("justFinishedSharedZip: true only the instant a player leaves the shared route's own zip element", () => {
  assert.equal(justFinishedSharedZip("blue-2-zip", null, "blue-2"), true);
  assert.equal(justFinishedSharedZip("blue-2-zip2", null, "blue-2"), true, "a black route's second leg also counts");
  assert.equal(justFinishedSharedZip(null, null, "blue-2"), false, "was not on anything to begin with");
  assert.equal(justFinishedSharedZip("blue-2-zip", "blue-2-zip", "blue-2"), false, "still riding, no transition yet");
  assert.equal(justFinishedSharedZip("blue-2-e1", null, "blue-2"), false, "left an ordinary element, not the zip");
  assert.equal(justFinishedSharedZip("blue-2-zip", null, null), false, "no shared route is currently active");
});
