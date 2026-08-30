// Flow (ROADMAP M2a, GDD §3.10): builds while progressing cleanly with calm nerves, pauses (no reset)
// on a platform, decays after the pause grace, and snaps back to the minimum on a fall/freeze.
// Deterministic – a fixed dt sequence always produces the same trajectory.
import test from "node:test";
import assert from "node:assert/strict";
import { createFlow, computeFlowScore } from "../../js/game/flow.js";
import { FLOW } from "../../js/config.js";

const DT = 1 / 60;
const run = (flow, seconds, ctx) => { for (let t = 0; t < seconds; t += DT) flow.update(DT, ctx); };

test("starts at the minimum multiplier", () => {
  const flow = createFlow();
  assert.equal(flow.value, FLOW.min);
});

test("does not build during the first cleanHoldSeconds of progress", () => {
  const flow = createFlow();
  run(flow, FLOW.cleanHoldSeconds - 0.1, { progressing: true, frozen: false, nervesValue: 0.1 });
  assert.equal(flow.value, FLOW.min);
});

test("builds towards the maximum while progressing cleanly with calm nerves", () => {
  const flow = createFlow();
  run(flow, 5, { progressing: true, frozen: false, nervesValue: 0.1 });
  assert.ok(flow.value > FLOW.min, `expected some build-up, got ${flow.value}`);
  assert.ok(flow.value <= FLOW.max);
});

test("never exceeds the maximum, however long the clean run", () => {
  const flow = createFlow();
  run(flow, 500, { progressing: true, frozen: false, nervesValue: 0.1 });
  assert.equal(flow.value, FLOW.max);
});

test("does not build while nerves are at or above the ceiling", () => {
  const flow = createFlow();
  run(flow, 10, { progressing: true, frozen: false, nervesValue: FLOW.nervesCeiling });
  assert.equal(flow.value, FLOW.min, "nerves at the ceiling count as not-calm (strict <)");
});

test("standing on a platform pauses without resetting, within the grace window", () => {
  const flow = createFlow();
  run(flow, 8, { progressing: true, frozen: false, nervesValue: 0.1 });
  const built = flow.value;
  assert.ok(built > FLOW.min);
  run(flow, FLOW.pauseGraceSeconds - 0.2, { progressing: false, frozen: false, nervesValue: 0 });
  assert.equal(flow.value, built, "unchanged while still inside the pause grace window");
});

test("a pause past the grace window decays the value back towards the minimum", () => {
  const flow = createFlow();
  run(flow, 20, { progressing: true, frozen: false, nervesValue: 0.1 });
  const built = flow.value;
  run(flow, FLOW.pauseGraceSeconds + FLOW.decaySeconds + 1, { progressing: false, frozen: false, nervesValue: 0 });
  assert.ok(flow.value < built, "decayed");
  assert.ok(flow.value >= FLOW.min);
});

test("a fall (onFall) snaps straight back to the minimum, discarding any build-up", () => {
  const flow = createFlow();
  run(flow, 10, { progressing: true, frozen: false, nervesValue: 0.1 });
  assert.ok(flow.value > FLOW.min);
  flow.onFall();
  assert.equal(flow.value, FLOW.min);
});

test("freezing (ctx.frozen) resets exactly like a fall, every frame it stays true", () => {
  const flow = createFlow();
  run(flow, 10, { progressing: true, frozen: false, nervesValue: 0.1 });
  assert.ok(flow.value > FLOW.min);
  flow.update(DT, { progressing: true, frozen: true, nervesValue: 0.1 });
  assert.equal(flow.value, FLOW.min);
});

test("creditCleanClip adds a flat bonus, clamped at the maximum", () => {
  const flow = createFlow();
  flow.creditCleanClip();
  assert.equal(flow.value, FLOW.min + FLOW.cleanClipBonus);
  run(flow, 500, { progressing: true, frozen: false, nervesValue: 0.1 });
  flow.creditCleanClip();
  assert.equal(flow.value, FLOW.max, "credit at the ceiling is clamped, not overshot");
});

test("resetRun returns to the minimum and restarts the running average", () => {
  const flow = createFlow();
  run(flow, 10, { progressing: true, frozen: false, nervesValue: 0.1 });
  assert.ok(flow.averageThisRun > FLOW.min);
  flow.resetRun();
  assert.equal(flow.value, FLOW.min);
  assert.equal(flow.averageThisRun, FLOW.min);
});

test("averageThisRun sits between the minimum and the peak value reached", () => {
  const flow = createFlow();
  run(flow, 10, { progressing: true, frozen: false, nervesValue: 0.1 });
  const peak = flow.value;
  assert.ok(flow.averageThisRun >= FLOW.min && flow.averageThisRun <= peak);
});

test("determinism: the same input sequence always produces the same trajectory", () => {
  const a = createFlow(), b = createFlow();
  const seq = [
    [2, { progressing: true, frozen: false, nervesValue: 0.1 }],
    [1, { progressing: false, frozen: false, nervesValue: 0 }],
    [3, { progressing: true, frozen: false, nervesValue: 0.6 }],
    [7, { progressing: true, frozen: false, nervesValue: 0.2 }],
  ];
  for (const [seconds, ctx] of seq) { run(a, seconds, ctx); run(b, seconds, ctx); }
  assert.equal(a.value, b.value);
  assert.equal(a.averageThisRun, b.averageThisRun);
});

test("computeFlowScore multiplies obstacles crossed by the average flow, rounded", () => {
  assert.equal(computeFlowScore(5, 1.0), 5);
  assert.equal(computeFlowScore(5, 2.4), 12);
  assert.equal(computeFlowScore(0, 3.0), 0);
  assert.equal(computeFlowScore(4, 0), 4, "a below-minimum average is clamped up to FLOW.min, never zeroed");
});
