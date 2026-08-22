// The balance pendulum of js/player/balance.js – the momentary resource of GDD §3.1.
import test from "node:test";
import assert from "node:assert/strict";
import { createBalance } from "../../js/player/balance.js";
import { BALANCE } from "../../js/player/tuning.js";

const DT = 1 / 60;

/** Run `steps` fixed steps with the same input and hand back the last result. */
function run(balance, steps, input = {}) {
  let last = null;
  for (let i = 0; i < steps; i++) last = balance.update(DT, input);
  return last;
}

test("upright is an unstable equilibrium – a perfect stance never moves", () => {
  const balance = createBalance();
  const result = run(balance, 300);
  assert.equal(result.angle, 0);
  assert.equal(result.slipped, false);
  assert.equal(result.load, 0);
});

test("the smallest tilt topples on its own, and faster the longer it runs", () => {
  const balance = createBalance();
  balance.reset(0.01);
  const early = Math.abs(run(balance, 30).angle);
  const late = Math.abs(run(balance, 30).angle);
  assert.ok(early > 0.01, `the tilt should grow, got ${early}`);
  assert.ok(late > early, `toppling should accelerate: ${early} → ${late}`);
});

test("leaning away from the tilt holds the stance, leaning into it throws you off", () => {
  const held = createBalance();
  held.reset(0.05);
  const saved = run(held, 60, { lean: -1 });
  assert.ok(saved.angle < 0.05, `a counter-lean should bring the body back, got ${saved.angle}`);

  const lost = createBalance();
  lost.reset(0.05);
  assert.equal(run(lost, 60, { lean: 1 }).slipped, true);
});

test("a hand on the cable turns the unstable stance into a stable one", () => {
  assert.ok(BALANCE.handStiffness > BALANCE.topple, "one hand must overcome the toppling term");
  const balance = createBalance();
  balance.reset(0.20);
  const result = run(balance, 120, { hands: 1 });
  assert.ok(Math.abs(result.angle) < 0.05, `a hand should pull the body upright, got ${result.angle}`);
  assert.equal(result.slipped, false);
});

test("slipping happens at the element's own angle, not at the default one", () => {
  const forgiving = createBalance();
  forgiving.reset(0.30);
  assert.equal(run(forgiving, 20, { slipAngle: 1.2 }).slipped, false, "a cargo net does not throw you off");

  const strict = createBalance();
  strict.reset(0.30);
  const result = run(strict, 20, { slipAngle: 0.34 });
  assert.equal(result.slipped, true);
  assert.equal(result.load, 1);
  assert.ok(Math.abs(result.angle) <= 0.34, "the angle is clamped at the slip threshold");
});

test("the same inputs always produce the same angle (no hidden randomness)", () => {
  const inputs = { lean: 0.3, hands: 0, drive: 0.8, noise: -0.2, speed: 0.5 };
  const a = createBalance();
  const b = createBalance();
  a.reset(0.02);
  b.reset(0.02);
  for (let i = 0; i < 200; i++) {
    a.update(DT, inputs);
    b.update(DT, inputs);
  }
  assert.equal(a.angle, b.angle);
  assert.equal(a.angularVelocity, b.angularVelocity);
});

test("excite is consumed by exactly one step, nudge changes the velocity at once", () => {
  const balance = createBalance();
  balance.excite(3);
  balance.update(DT);
  const after = balance.angularVelocity;
  balance.update(DT);
  assert.ok(Math.abs(balance.angularVelocity) < Math.abs(after) + 1e-6, "the impulse must not repeat");

  const nudged = createBalance();
  nudged.nudge(1.5);
  assert.equal(nudged.angularVelocity, 1.5);
  nudged.nudge(1e6);
  assert.equal(nudged.angularVelocity, BALANCE.maxAngularVelocity, "the velocity is clamped");
});

test("catchAt puts the climber back on the rail, upright but not settled", () => {
  const balance = createBalance();
  balance.reset(0.9);
  balance.update(DT, { slipAngle: 0.4 });
  assert.equal(balance.slipped, true);
  balance.catchAt(0.4);
  assert.equal(balance.slipped, false);
  assert.equal(balance.angularVelocity, 0);
  assert.ok(Math.abs(balance.angle) < 0.4, "the recovery angle stays inside the slip threshold");
  assert.ok(Math.abs(balance.angle) > 0, "…but the body is not perfectly still");
});

test("a zero or negative step changes nothing", () => {
  const balance = createBalance();
  balance.reset(0.1);
  const result = balance.update(0, { slipAngle: 0.4 });
  assert.equal(balance.angle, 0.1);
  assert.ok(result.load > 0);
});
