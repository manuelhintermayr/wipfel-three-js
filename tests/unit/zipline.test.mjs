// The Flying Fox model: js/zipline/physics.js (cable + gravity + drag + wind) and
// js/zipline/brakes.js (the braking net). Both are pure logic, so the numbers the ride is tuned on
// can be checked without a browser.
import test from "node:test";
import assert from "node:assert/strict";
import { createZipPhysics, ZIP_PHYSICS } from "../../js/zipline/physics.js";
import { createNetBrake, ZIP_BRAKE } from "../../js/zipline/brakes.js";
import { RULES } from "../../js/config.js";

const DT = 1 / 60;
const G = 9.81;

/** The first course's Flying Fox, near enough: 53.5 m, 5.9 % gradient. */
const START = { x: 0, y: 12.0, z: 0 };
const END = { x: 53.3, y: 8.85, z: 0 };

const massOf = (id) => RULES.sizeClasses.find((c) => c.id === id).massKg;

/** Ride to the end (or until it is clearly stuck) and report what happened. */
function ride(zip, { tuck = 0, maxSeconds = 90 } = {}) {
  zip.push();
  let t = 0;
  while (!zip.done && t < maxSeconds) {
    zip.update(DT, { tuck });
    t += DT;
    if (zip.stalled) break;
  }
  return { seconds: t, arrived: zip.done, stalled: zip.stalled, maxSpeed: zip.maxSpeed, s: zip.s };
}

test("the cable is a sagging parabola: longer than its chord, deepest in the middle", () => {
  const zip = createZipPhysics({ start: START, end: END });
  assert.ok(zip.sag > 0.9 && zip.sag < 1.2, `2 % of a 53 m span is about a metre, got ${zip.sag}`);
  assert.ok(zip.length > zip.chord, "an arc is longer than its chord");
  assert.ok(zip.length - zip.chord < 0.35, `…but only just: ${zip.length - zip.chord} m`);

  const mid = zip.pointAt(zip.length / 2);
  const chordY = (START.y + END.y) / 2;
  assert.ok(Math.abs(mid.y - (chordY - zip.sag)) < 0.05, `mid-span hangs one sag below the chord, got ${mid.y}`);
  assert.ok(Math.abs(zip.gradient - 3.15 / 53.3) < 1e-6, "gradient is drop over horizontal run");
});

test("the sag makes the first half steeper than the chord and the last half flatter", () => {
  const zip = createZipPhysics({ start: START, end: END });
  const atStart = zip.slopeAt(0);
  const atEnd = zip.slopeAt(zip.length);
  assert.ok(atStart > zip.gradient, `the start must fall away faster than the chord (${atStart})`);
  assert.ok(atEnd < zip.gradient, `the end must flatten out (${atEnd})`);
  assert.ok(atEnd < 0, "with 2 % sag on a 6 % line the last metres actually rise – that is the brake");
});

test("tangentAt is a unit vector that points at the far anchor", () => {
  const zip = createZipPhysics({ start: START, end: END });
  for (const s of [0, zip.length * 0.3, zip.length]) {
    const t = zip.tangentAt(s);
    assert.ok(Math.abs(Math.hypot(t.x, t.y, t.z) - 1) < 1e-9, "unit length");
    assert.ok(t.x > 0, "travel runs towards +x here");
  }
});

test("a heavier rider is faster and arrives sooner", () => {
  const light = ride(createZipPhysics({ start: START, end: END, massKg: massOf("s110") }));
  const heavy = ride(createZipPhysics({ start: START, end: END, massKg: massOf("adult") }));
  assert.ok(heavy.arrived && light.arrived, "both make it in still air");
  assert.ok(heavy.maxSpeed > light.maxSpeed, `heavier must be faster: ${light.maxSpeed} → ${heavy.maxSpeed}`);
  assert.ok(heavy.seconds < light.seconds, `heavier must arrive sooner: ${light.seconds} → ${heavy.seconds}`);
});

test("a heavier rider pulls the cable deeper", () => {
  const light = createZipPhysics({ start: START, end: END, massKg: massOf("s110") });
  const heavy = createZipPhysics({ start: START, end: END, massKg: 120 });
  assert.ok(heavy.sag > light.sag, `${light.sag} → ${heavy.sag}`);
});

test("a head wind slows the ride down, a tail wind speeds it up", () => {
  const still = ride(createZipPhysics({ start: START, end: END }));
  const head = ride(createZipPhysics({ start: START, end: END, windAlong: -4 }));
  const tail = ride(createZipPhysics({ start: START, end: END, windAlong: 4 }));
  assert.ok(head.maxSpeed < still.maxSpeed, `head wind: ${still.maxSpeed} → ${head.maxSpeed}`);
  assert.ok(tail.maxSpeed > still.maxSpeed, `tail wind: ${still.maxSpeed} → ${tail.maxSpeed}`);
});

test("tucking cuts the drag, so the same rider goes faster", () => {
  const open = ride(createZipPhysics({ start: START, end: END }));
  const tucked = ride(createZipPhysics({ start: START, end: END }), { tuck: 1 });
  assert.ok(tucked.maxSpeed > open.maxSpeed, `${open.maxSpeed} → ${tucked.maxSpeed}`);
});

test("a light rider in a head wind stalls short of the end and has to haul in", () => {
  const zip = createZipPhysics({ start: START, end: END, massKg: massOf("s110"), windAlong: -7 });
  const result = ride(zip);
  assert.equal(result.arrived, false, "the child must not reach the landing");
  assert.equal(result.stalled, true, "…and must be reported as stuck, not silently frozen");
  assert.ok(zip.s > 5, `they still get most of the way: stopped at ${zip.s} m`);

  const before = zip.s;
  zip.haul(1.0);
  assert.ok(zip.s > before, "hauling moves the trolley towards the end");
  assert.ok(zip.s - before <= ZIP_PHYSICS.haulSpeed + 1e-9, "…slowly");
});

test("energy sanity: the rider never goes faster than the drop they have used up", () => {
  const zip = createZipPhysics({ start: START, end: END });
  const v0 = zip.push();
  const point = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 60 * 40 && !zip.done; i++) {
    zip.update(DT);
    zip.pointAt(zip.s, point);
    const free = Math.sqrt(v0 * v0 + 2 * G * Math.max(0, START.y - point.y));
    assert.ok(zip.v <= free + 1e-6, `free fall from ${START.y - point.y} m allows ${free}, got ${zip.v}`);
  }
  assert.ok(zip.done, "the adult reaches the landing in still air");
});

test("the same setup always produces the same ride (no hidden randomness)", () => {
  const a = createZipPhysics({ start: START, end: END });
  const b = createZipPhysics({ start: START, end: END });
  a.push(); b.push();
  for (let i = 0; i < 400; i++) { a.update(DT); b.update(DT); }
  assert.equal(a.s, b.s);
  assert.equal(a.v, b.v);
});

test("reset puts the trolley back at the platform with a new rider", () => {
  const zip = createZipPhysics({ start: START, end: END });
  ride(zip);
  zip.reset({ massKg: massOf("s130"), windAlong: -2 });
  assert.equal(zip.s, 0);
  assert.equal(zip.v, 0);
  assert.equal(zip.massKg, massOf("s130"));
  assert.equal(zip.windAlong, -2);
  assert.equal(zip.stalled, false);
});

// --- the braking net --------------------------------------------------------------------------------

test("outside its zone the brake changes nothing at all", () => {
  const brake = createNetBrake({ length: 50 });
  assert.equal(brake.zoneStart, 50 - ZIP_BRAKE.zoneLength);
  assert.equal(brake.apply(DT, 10, 8, false), 8);
  assert.equal(brake.outcome, null);
});

test("legs up: the net bleeds the speed off and puts you on the deck at walking pace", () => {
  const brake = createNetBrake({ length: 50 });
  let s = brake.zoneStart, v = 8;
  while (s < 50) {
    v = brake.apply(DT, s, v, true);
    s += v * DT;
  }
  assert.equal(brake.outcome, "clean");
  assert.ok(v < 1.2, `arrival speed should be a walk, got ${v} m/s`);
  assert.ok(v >= ZIP_BRAKE.arriveSpeed, "…but the profile never brakes past its target");
});

test("a clean arrival is a walk whatever speed the rider brought into the zone", () => {
  for (const entry of [3, 5, 6.5, 8]) {          // 8 m/s is well above what this line can produce
    const brake = createNetBrake({ length: 50 });
    let s = brake.zoneStart, v = entry;
    while (s < 50) { v = brake.apply(DT, s, v, true); s += v * DT; }
    assert.ok(v < 1.2, `entering at ${entry} m/s should still arrive at a walk, got ${v}`);
  }
});

test("legs down: the net snags the feet – the arrival is fast, hard and 'messy'", () => {
  const brake = createNetBrake({ length: 50 });
  let s = brake.zoneStart, v = 8, steps = 0;
  while (s < 50 && v > 0.01 && steps++ < 6000) {
    v = brake.apply(DT, s, v, false);
    s += v * DT;
  }
  assert.equal(brake.outcome, "messy");
  assert.ok(s >= 50, "at this speed the net does not stop them short");
  assert.ok(v > 2, `they hit the deck hard, got ${v} m/s`);
});

test("the decision is latched at the marker sleeve – lifting the legs later does not help", () => {
  const brake = createNetBrake({ length: 50 });
  brake.apply(DT, brake.zoneStart + 0.01, 8, false);
  assert.equal(brake.outcome, "messy");
  brake.apply(DT, brake.zoneStart + 1.0, 7, true);
  assert.equal(brake.outcome, "messy", "the net already has the ankles");
});

test("a slow messy rider ends up hanging in the net short of the deck", () => {
  const brake = createNetBrake({ length: 50 });
  let s = brake.zoneStart, v = 3.5, steps = 0;
  while (s < 50 && v > 0.01 && steps++ < 6000) {
    v = brake.apply(DT, s, v, false);
    s += v * DT;
  }
  assert.ok(s < 50, `they stop short and have to haul in, got ${s} m of 50`);
});

test("reset makes the net usable by the next rider", () => {
  const brake = createNetBrake({ length: 50 });
  brake.apply(DT, brake.zoneStart, 8, false);
  brake.reset();
  assert.equal(brake.outcome, null);
  brake.apply(DT, brake.zoneStart, 8, true);
  assert.equal(brake.outcome, "clean");
});
