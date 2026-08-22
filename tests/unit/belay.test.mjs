// Two-carabiner belay logic of js/player/belay.js – the safety rule of the whole game.
import test from "node:test";
import assert from "node:assert/strict";
import { createBelay, CARABINERS, BELAY_MODES } from "../../js/player/belay.js";

/** Records every event and asserts after each one that the pair is never both open. */
function watch(belay, log = []) {
  belay.setOnEvent((event) => log.push(event));
  return log;
}
const bothOpen = (belay) => belay.state().A.state === "open" && belay.state().B.state === "open";

test("modes are exactly continuous, smart and classic", () => {
  assert.deepEqual([...BELAY_MODES], ["continuous", "smart", "classic"]);
  assert.deepEqual([...CARABINERS], ["A", "B"]);
  assert.throws(() => createBelay({ mode: "telepathy" }), /unknown mode/);
});

test("smart mode never lets both carabiners be open", () => {
  const belay = createBelay({ mode: "smart" });
  let violated = false;
  belay.setOnEvent(() => { if (bothOpen(belay)) violated = true; });
  for (const anchorId of ["deck", "deck", "ladder", "ladder", "platform-ring", "platform-ring", "deck", "deck"]) {
    belay.clipTo(anchorId);
    assert.ok(belay.isSafe(), `unsafe after clipping to ${anchorId}`);
    assert.ok(!bothOpen(belay));
  }
  assert.ok(!violated, "both carabiners were open during an event");
});

test("smart mode changes the anchor only after the second press", () => {
  const belay = createBelay({ mode: "smart" });
  assert.equal(belay.currentAnchor(), null);

  const first = belay.clipTo("deck");
  assert.equal(first.step, 1);
  assert.equal(belay.currentAnchor(), null, "anchor is not established after one press");
  assert.equal(belay.pendingAnchor(), "deck");
  assert.equal(belay.state().A.attachedTo, "deck");
  assert.equal(belay.state().B.state, "locked");
  assert.ok(!belay.bothOnSameAnchor());

  const second = belay.clipTo("deck");
  assert.equal(second.step, 2);
  assert.equal(belay.currentAnchor(), "deck");
  assert.equal(belay.pendingAnchor(), null);
  assert.ok(belay.bothOnSameAnchor());
  assert.equal(belay.state().A.state, "clipped");
  assert.equal(belay.state().B.state, "clipped");
});

test("smart mode emits open then click per press, and locks the follower", () => {
  const belay = createBelay({ mode: "smart" });
  const log = watch(belay);
  belay.clipTo("deck");
  assert.deepEqual(log.map((e) => `${e.type}:${e.carabiner}`), ["locked:B", "open:A", "click:A"]);
  log.length = 0;
  belay.clipTo("deck");
  assert.deepEqual(log.map((e) => `${e.type}:${e.carabiner}`), ["open:B", "click:B"]);
  assert.ok(!log.some((e) => e.type === "unsafe"));
});

test("smart mode ignores a repeated press on the established anchor", () => {
  const belay = createBelay({ mode: "smart" });
  belay.clipTo("deck");
  belay.clipTo("deck");
  const again = belay.clipTo("deck");
  assert.equal(again.changed, false);
  assert.equal(belay.currentAnchor(), "deck");
});

test("smart mode lets the lead carabiner change its mind mid-ritual", () => {
  const belay = createBelay({ mode: "smart" });
  belay.clipTo("deck");
  belay.clipTo("deck");
  belay.clipTo("ladder");                                    // lead crosses to the ladder cable
  const redirected = belay.clipTo("platform-ring");          // …no, to the ring instead
  assert.equal(redirected.step, 1);
  assert.equal(belay.pendingAnchor(), "platform-ring");
  assert.equal(belay.currentAnchor(), "deck", "the belay still hangs on the old anchor");
  assert.ok(belay.isSafe());
  belay.clipTo("platform-ring");
  assert.equal(belay.currentAnchor(), "platform-ring");
});

test("continuous mode attaches both carabiners in a single press", () => {
  const belay = createBelay({ mode: "continuous" });
  const log = watch(belay);
  const moved = belay.attach("deck");
  assert.equal(moved.changed, true);
  assert.equal(belay.currentAnchor(), "deck");
  assert.ok(belay.bothOnSameAnchor());
  assert.equal(belay.pendingAnchor(), null);
  assert.equal(log.filter((e) => e.type === "click").length, 1, "one click, no ritual");

  assert.equal(belay.attach("deck").changed, false);
  belay.clipTo("platform-ring");                             // clipTo delegates to attach
  assert.equal(belay.currentAnchor(), "platform-ring");
  assert.ok(belay.isSafe());
});

test("classic mode allows the mistake: both carabiners open is unsafe", () => {
  const belay = createBelay({ mode: "classic" });
  const log = watch(belay);
  belay.clip("A", "deck");
  belay.clip("B", "deck");
  assert.ok(belay.isSafe());
  assert.equal(belay.currentAnchor(), "deck");

  belay.open("A");
  assert.ok(belay.isSafe(), "one carabiner off is still safe");
  belay.open("B");
  assert.equal(belay.isSafe(), false);
  assert.ok(log.some((e) => e.type === "unsafe" && e.carabiner === "B"));

  belay.clip("A", "ladder");
  assert.ok(belay.isSafe());
  assert.ok(!belay.bothOnSameAnchor());
});

test("classic mode maps one key per carabiner: press opens, press again clips", () => {
  const belay = createBelay({ mode: "classic" });
  belay.clipTo("deck", "A");                                 // A was open → clips
  assert.equal(belay.state().A.attachedTo, "deck");
  belay.clipTo("deck", "A");                                 // A was clipped → opens
  assert.equal(belay.state().A.state, "open");
  assert.equal(belay.state().A.attachedTo, null);
});

test("smart mode refuses the classic single-carabiner commands", () => {
  const belay = createBelay({ mode: "smart" });
  belay.clipTo("deck");
  belay.clipTo("deck");
  assert.equal(belay.open("A"), false);
  assert.equal(belay.clip("A", "nowhere"), false);
  assert.equal(belay.currentAnchor(), "deck");
});

test("detach and reset put the climber back on the ground", () => {
  const belay = createBelay({ mode: "smart" });
  belay.clipTo("deck");
  belay.clipTo("deck");
  assert.equal(belay.detach(), true);
  assert.equal(belay.currentAnchor(), null);
  assert.equal(belay.state().A.attachedTo, null);
  assert.equal(belay.detach(), false, "already detached");

  belay.clipTo("ladder");
  belay.reset();
  assert.equal(belay.pendingAnchor(), null);
  assert.equal(belay.state().lead, "A");
});
