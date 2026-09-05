// Classic mode's hand brake on the Flying Fox (ROADMAP M2b, GDD §3.3 "Flying Fox mit Handbremse
// (Lederhandschuh hinter der Rolle)"): js/zipline/brakes.js#createNetBrake's "hand" profile. Same
// pure-logic testing style as tests/unit/zipline.test.mjs's own net-brake section – arbitrary but
// clearly-separated numbers (via the `hand` config override) so each of the three outcomes is isolated
// from the others, independent of whatever the shipped defaults happen to be tuned to.
import test from "node:test";
import assert from "node:assert/strict";
import { createNetBrake, HAND_BRAKE, ZIP_BRAKE } from "../../js/zipline/brakes.js";

const DT = 1 / 60;

/** Rides `brake` in the hand profile from `s`/`v`, applying `gripping(fraction)` every step. */
function rideHand(brake, { length, zoneLength, s, v, gripping, maxSteps = 6000 }) {
  let steps = 0;
  while (s < length && v > 0.02 && steps++ < maxSteps) {
    const fraction = (s - (length - zoneLength)) / zoneLength;
    v = brake.apply(DT, s, v, gripping(fraction), 1, "hand");
    s += v * DT;
  }
  return { s, v };
}

test("the hand profile's zone is its own, longer window – independent of the net's zoneStart", () => {
  const brake = createNetBrake({ length: 50 });
  assert.equal(50 - brake.zoneStart, ZIP_BRAKE.zoneLength, "net zone length untouched by the hand profile existing");
  assert.equal(brake.inZone(50 - HAND_BRAKE.zoneLength - 0.1, 1, "hand"), false);
  assert.equal(brake.inZone(50 - HAND_BRAKE.zoneLength + 0.1, 1, "hand"), true);
  assert.ok(HAND_BRAKE.zoneLength > ZIP_BRAKE.zoneLength, "task: 12 m hand zone vs the net's 6 m");
});

test("outside the zone the hand profile changes nothing, gripping or not", () => {
  const brake = createNetBrake({ length: 50 });
  const beforeZone = 50 - HAND_BRAKE.zoneLength - 1;
  assert.equal(brake.apply(DT, beforeZone, 6, true, 1, "hand"), 6);
  assert.equal(brake.apply(DT, beforeZone, 6, false, 1, "hand"), 6);
  assert.equal(brake.outcome, null);
});

test("too little braking: barely slows down, arrives fast and 'messy'", () => {
  const brake = createNetBrake({ length: 50, hand: { zoneLength: 12 } });
  const { s, v } = rideHand(brake, { length: 50, zoneLength: 12, s: 38, v: 6, gripping: () => false });
  assert.ok(s >= 50, "never gripping still coasts all the way to the deck");
  assert.equal(brake.outcome, "messy");
  assert.ok(v >= HAND_BRAKE.messyArriveSpeed, `should still be carrying speed, got ${v.toFixed(2)} m/s`);
});

test("gripping only after the early threshold: a controlled, clean arrival", () => {
  const brake = createNetBrake({ length: 50, hand: { zoneLength: 12, fullDecel: 1.0, earlyThreshold: 0.5 } });
  const { s, v } = rideHand(brake, { length: 50, zoneLength: 12, s: 38, v: 4, gripping: (f) => f >= 0.5 });
  assert.ok(s >= 50, "reaches the platform under its own speed");
  assert.equal(brake.outcome, "clean");
  assert.ok(v > 0.05 && v < HAND_BRAKE.messyArriveSpeed, `expected a controlled arrival, got ${v.toFixed(2)} m/s`);
});

test("gripping too early (right at the zone's start): stalls short of the platform, ready to be hauled", () => {
  const brake = createNetBrake({ length: 50, hand: { zoneLength: 12 } });
  const { s, v } = rideHand(brake, { length: 50, zoneLength: 12, s: 38, v: 4, gripping: () => true });
  assert.ok(s < 50, `should stall short of the platform, got s=${s.toFixed(2)} of 50`);
  assert.ok(v <= 0.05, "speed pinned near zero rather than crawling in");
});

test("a brief early grip permanently commits to the harsher deceleration, even after letting go", () => {
  const brake = createNetBrake({ length: 50, hand: { zoneLength: 12, earlyThreshold: 0.35, earlyStallDecel: 8, fullDecel: 1.0 } });
  const start = 50 - 12;
  brake.apply(DT, start + 0.1, 5, true, 1, "hand");     // one frame of grip, well inside the threshold
  brake.apply(DT, start + 2, 5, false, 1, "hand");      // let go again
  // Gripping again from here on with the *gentle* fullDecel (1.0) alone would never stall over the
  // ~6 m left (stopping distance 25/2 = 12.5 m) – so a stall here proves the harsh rate is still active.
  const { s } = rideHand(brake, { length: 50, zoneLength: 12, s: start + 6, v: 5, gripping: () => true });
  assert.ok(s < 50, `the early grip should still doom this ride to a stall, got s=${s.toFixed(2)}`);
});

test("reset() clears the hand profile's own latch and outcome for the next rider", () => {
  const brake = createNetBrake({ length: 50, hand: { zoneLength: 12 } });
  rideHand(brake, { length: 50, zoneLength: 12, s: 38, v: 4, gripping: () => true });   // stalls, latches
  assert.notEqual(brake.outcome, null);
  brake.reset();
  assert.equal(brake.outcome, null);
  const { s } = rideHand(brake, { length: 50, zoneLength: 12, s: 38, v: 4, gripping: () => false });
  assert.equal(brake.outcome, "messy", "the previous ride's latch must not leak into this one");
  assert.ok(s >= 50);
});

test("the net profile (default) is completely unaffected by the hand profile's own config", () => {
  const brake = createNetBrake({ length: 50, hand: { zoneLength: 12, fullDecel: 0.01 } });
  let s = brake.zoneStart, v = 8;
  while (s < 50) { v = brake.apply(DT, s, v, true); s += v * DT; }   // profile omitted → "net"
  assert.equal(brake.outcome, "clean");
  assert.ok(v < 1.2 && v >= ZIP_BRAKE.arriveSpeed, `net profile arrival should be unchanged, got ${v.toFixed(2)}`);
});
