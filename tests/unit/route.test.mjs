// Route run lifecycle: arm → countdown → running → done, obstacle dedupe, fall counting.
import test from "node:test";
import assert from "node:assert/strict";
import { createRouteRun, BLUE_I } from "../../js/game/route.js";

const tick = (run, seconds, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) run.update(dt); };

test("countdown runs 3-2-1 and starts the timer", () => {
  const run = createRouteRun(BLUE_I);
  assert.equal(run.state, "idle");
  run.arm();
  run.beginCountdown();
  assert.equal(run.state, "countdown");
  assert.equal(run.countdownStep, 3);
  tick(run, 1.05);
  assert.equal(run.countdownStep, 2);
  tick(run, 2.1);
  assert.equal(run.state, "running");
  tick(run, 5);
  assert.ok(run.elapsed > 4.9 && run.elapsed < 5.2);
});

test("obstacles count once each and only known ids", () => {
  const run = createRouteRun(BLUE_I);
  run.start();
  assert.equal(run.completeObstacle("ladder"), true);
  assert.equal(run.completeObstacle("ladder"), false);
  assert.equal(run.completeObstacle("nope"), false);
  assert.equal(run.completeObstacle("burma-1"), true);
  assert.equal(run.progress, 2);
  assert.equal(run.total, BLUE_I.obstacles.length);
});

test("finish reports time, falls and clean flag; reset clears", () => {
  const run = createRouteRun(BLUE_I);
  run.start();
  tick(run, 3);
  run.recordFall();
  for (const id of BLUE_I.obstacles) run.completeObstacle(id);
  const summary = run.finish();
  assert.equal(summary.progress, summary.total);
  assert.equal(summary.falls, 1);
  assert.equal(summary.clean, false);
  assert.ok(summary.seconds > 2.9);
  assert.equal(run.state, "done");
  run.reset();
  assert.equal(run.state, "idle");
  assert.equal(run.progress, 0);
  assert.equal(run.falls, 0);
});

test("completing an obstacle during countdown promotes the run to running", () => {
  const run = createRouteRun(BLUE_I);
  run.beginCountdown();
  assert.equal(run.completeObstacle("ladder"), true);
  assert.equal(run.state, "running");
});
