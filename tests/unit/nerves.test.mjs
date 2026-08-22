// Nerves of js/player/nerves.js – the psychological axis of GDD §3.1 and the real opponent.
import test from "node:test";
import assert from "node:assert/strict";
import { createNerves } from "../../js/player/nerves.js";
import { NERVES } from "../../js/player/tuning.js";

const DT = 1 / 60;
const run = (nerves, seconds, ctx) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) nerves.update(DT, ctx);
  return nerves.value;
};

test("standing on the ground is calm and stays calm", () => {
  const nerves = createNerves();
  assert.equal(nerves.value, 0);
  assert.equal(nerves.level, "calm");
  assert.equal(nerves.frozen, false);
  run(nerves, 20, { height: 0, onGround: true });
  assert.equal(nerves.value, 0);
});

test("height is logarithmic – the first five metres cost more than the next five", () => {
  const low = createNerves();
  const high = createNerves();
  run(low, 10, { height: 5, onElement: true });
  run(high, 10, { height: 10, onElement: true });
  assert.ok(low.value > 0);
  assert.ok(high.value > low.value, "higher is worse");
  assert.ok(high.value < 2 * low.value, `…but not twice as bad: ${low.value} → ${high.value}`);
});

test("exposure, wobble, gusts and looking down each add on top of the height", () => {
  const base = { height: 8, onElement: true };
  const plain = createNerves();
  run(plain, 8, base);
  for (const extra of ["exposure", "wobble", "gust", "lookDown"]) {
    const nerves = createNerves();
    run(nerves, 8, { ...base, [extra]: 1 });
    assert.ok(nerves.value > plain.value, `${extra} should make it worse`);
  }
});

test("a hand on the cable and a platform under the feet bring it back down", () => {
  const held = createNerves({ value: 0.6 });
  run(held, 5, { height: 8, onElement: true, handContact: 2 });
  const alone = createNerves({ value: 0.6 });
  run(alone, 5, { height: 8, onElement: true, exposure: 1 });
  assert.ok(held.value < alone.value, `${held.value} vs ${alone.value}`);

  const arrived = createNerves({ value: 0.6 });
  run(arrived, 3, { height: 8, onPlatform: true });
  assert.ok(arrived.value < 0.6, "a platform is a rest");
});

test("heart rate and tremor follow the value, and there is no bar to read them off", () => {
  const nerves = createNerves();
  assert.equal(Math.round(nerves.heartRate), NERVES.heartRateCalm);
  assert.equal(nerves.tremor, 0);
  run(nerves, 40, { height: 12, onElement: true, exposure: 1, wobble: 1 });
  assert.ok(nerves.heartRate > NERVES.heartRateCalm + 20, `bpm ${nerves.heartRate}`);
  assert.ok(nerves.heartRate <= NERVES.heartRateMax);
  assert.ok(nerves.tremor > 0);
  assert.ok(nerves.cameraSway > 0);
});

test("levels step from calm through tense and scared to frozen", () => {
  const nerves = createNerves();
  assert.equal(nerves.level, "calm");
  nerves.shock(0.4);
  assert.equal(nerves.level, "tense");
  nerves.shock(0.3);
  assert.equal(nerves.level, "scared");
  nerves.shock(0.3);
  assert.equal(nerves.level, "frozen");
});

test("above the freeze threshold the body locks up until three breaths are taken", () => {
  const nerves = createNerves();
  nerves.shock(NERVES.freezeThreshold + 0.05);
  assert.equal(nerves.frozen, true);
  assert.equal(nerves.breaths, 0);

  run(nerves, NERVES.breathSeconds * 0.9, { breathing: true });
  assert.equal(nerves.breaths, 0);
  assert.equal(nerves.frozen, true, "one unfinished breath changes nothing");

  run(nerves, NERVES.breathSeconds * 1.2, { breathing: true });
  assert.equal(nerves.breaths, 2);
  assert.equal(nerves.frozen, true, "two breaths are not enough either");

  run(nerves, NERVES.breathSeconds, { breathing: true });
  assert.equal(nerves.frozen, false);
  assert.ok(nerves.value <= NERVES.freezeRelease);
});

test("trust from finished elements dampens every later rise", () => {
  const green = createNerves();
  const seasoned = createNerves();
  for (let i = 0; i < 4; i++) seasoned.completeElement();
  assert.ok(seasoned.trust > 0);

  const ctx = { height: 10, onElement: true, exposure: 1 };
  run(green, 10, ctx);
  seasoned.reset(0);
  run(seasoned, 10, ctx);
  assert.ok(seasoned.value < green.value, `trust should help: ${green.value} vs ${seasoned.value}`);

  const trustBefore = seasoned.trust;
  seasoned.survivedFall();
  assert.ok(seasoned.trust > trustBefore, "a harmless fall teaches the same lesson");
});

test("the value is clamped, reset keeps trust and the model has no randomness", () => {
  const a = createNerves();
  const b = createNerves();
  const ctx = { height: 9, onElement: true, wobble: 0.4, gust: 0.2 };
  run(a, 12, ctx);
  run(b, 12, ctx);
  assert.equal(a.value, b.value);

  a.shock(5);
  assert.equal(a.value, 1);
  const trust = a.trust;
  a.reset(0);
  assert.equal(a.value, 0);
  assert.equal(a.frozen, false);
  assert.equal(a.trust, trust, "reset keeps what the climber has learned");
  a.reset(0, false);
  assert.equal(a.trust, 0);
});
