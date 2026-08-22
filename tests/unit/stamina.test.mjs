// Arm strength of js/player/stamina.js – the reserve of GDD §3.1.
import test from "node:test";
import assert from "node:assert/strict";
import { createStamina } from "../../js/player/stamina.js";
import { STAMINA } from "../../js/player/tuning.js";

const DT = 1 / 60;
const run = (stamina, seconds, load) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) stamina.update(DT, load);
  return stamina.value;
};

test("a fresh climber is full and can grip", () => {
  const stamina = createStamina();
  assert.equal(stamina.value, 1);
  assert.equal(stamina.canGrip, true);
  assert.equal(stamina.isEmpty, false);
});

test("every extra hand on a hold costs exactly one grip rate more", () => {
  const seconds = 5;
  const one = createStamina();
  const two = createStamina();
  run(one, seconds, { onElement: true, hands: 1 });
  run(two, seconds, { onElement: true, hands: 2 });
  assert.ok(one.value < 1, "gripping must cost something");
  assert.ok(two.value < one.value, `two hands must cost more: ${one.value} vs ${two.value}`);
  const extra = (1 - two.value) - (1 - one.value);
  assert.ok(Math.abs(extra - STAMINA.gripDrain * seconds) < 0.01, `second hand cost ${extra}`);
});

test("a cargo net drains through extraDrain while a bare wire bridge does not", () => {
  const bare = createStamina();
  const net = createStamina();
  run(bare, 10, { onElement: true, hands: 0, moving: true });
  run(net, 10, { onElement: true, hands: 0, moving: true, extraDrain: STAMINA.netDrain });
  assert.ok(net.value < bare.value - 0.4, `the net is the hard one: ${bare.value} vs ${net.value}`);
});

test("a platform fills the reserve back up, hanging in the harness empties it", () => {
  const stamina = createStamina({ value: 0.4 });
  run(stamina, 2, { onPlatform: true });
  assert.ok(stamina.value > 0.4);
  const hanging = createStamina({ value: 0.5 });
  run(hanging, 2, { hanging: true });
  assert.ok(hanging.value < 0.5);
  assert.ok(STAMINA.pullUpDrain > STAMINA.haulDrain, "pulling up must cost more than hauling");
});

test("running out forces the hands open until the reserve is back above the threshold", () => {
  const stamina = createStamina({ value: 0.05 });
  run(stamina, 2, { hanging: true });
  assert.equal(stamina.isEmpty, true);
  assert.equal(stamina.canGrip, false);

  run(stamina, 0.5, { onPlatform: true });
  assert.ok(stamina.value > 0 && stamina.value < STAMINA.recoverThreshold);
  assert.equal(stamina.canGrip, false, "a sip of rest is not enough to close the hands again");

  run(stamina, 2, { onPlatform: true });
  assert.ok(stamina.value >= STAMINA.recoverThreshold);
  assert.equal(stamina.canGrip, true);
});

test("an empty climber starts with the hands open and stops paying for a grip", () => {
  const stamina = createStamina({ value: 0 });
  assert.equal(stamina.canGrip, false, "an empty reserve cannot hold on");
  const held = createStamina({ value: 0 });
  run(held, 1, { onElement: true, hands: 2 });
  const free = createStamina({ value: 0 });
  run(free, 1, { onElement: true, hands: 0 });
  assert.equal(held.value, free.value, "open hands cost the same as no hands");
  assert.ok(held.value > 0, "standing still on the rail trickles the reserve back");
});

test("spend takes a chunk only when it is actually there", () => {
  const stamina = createStamina({ value: 0.3 });
  assert.equal(stamina.spend(0.35), false);
  assert.equal(stamina.value, 0.3, "a failed pull-up costs nothing");
  assert.equal(stamina.spend(0.2), true);
  assert.ok(Math.abs(stamina.value - 0.1) < 1e-9);
  assert.equal(stamina.spend(0), true);
});

test("drain and the value stay inside 0..1 whatever is thrown at them", () => {
  const stamina = createStamina();
  stamina.drain(100, 1);
  assert.equal(stamina.value, 0);
  assert.equal(stamina.isEmpty, true);
  stamina.reset(5);
  assert.equal(stamina.value, 1);
  stamina.reset(-3);
  assert.equal(stamina.value, 0);
  assert.equal(stamina.canGrip, false);
});

test("standing still on an element recovers, crossing it does not", () => {
  const standing = createStamina({ value: 0.5 });
  const moving = createStamina({ value: 0.5 });
  run(standing, 10, { onElement: true, hands: 0, moving: false });
  run(moving, 10, { onElement: true, hands: 0, moving: true });
  assert.ok(standing.value > 0.5, "a pause on the wire is a rest – walk, stand, walk");
  assert.ok(standing.value > moving.value, `${standing.value} vs ${moving.value}`);
});
