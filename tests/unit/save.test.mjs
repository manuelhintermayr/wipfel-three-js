// Save schema: defaults, best-time logic, corrupt data collapses to defaults, persistence round-trip,
// category gates (GDD §3.12: Blue → Red → Black).
import test from "node:test";
import assert from "node:assert/strict";
import { createSave, memoryStorage, nextGateCategory } from "../../js/core/save.js";
import { GAME } from "../../js/config.js";

test("first run has no best; faster runs replace slower ones", () => {
  const save = createSave(memoryStorage());
  assert.equal(save.routeBest("blue-1"), null);
  assert.equal(save.recordRun("blue-1", { seconds: 120, falls: 1 }), true);
  assert.equal(save.recordRun("blue-1", { seconds: 150, falls: 0 }), false);
  assert.equal(save.recordRun("blue-1", { seconds: 90, falls: 0 }), true);
  assert.equal(save.routeBest("blue-1"), 90);
  assert.equal(save.data.routes["blue-1"].completions, 3);
  assert.equal(save.data.routes["blue-1"].cleanRuns, 2);
});

test("persists and reloads through the same storage", () => {
  const storage = memoryStorage();
  createSave(storage).recordRun("blue-1", { seconds: 77, falls: 0 });
  const reloaded = createSave(storage);
  assert.equal(reloaded.routeBest("blue-1"), 77);
});

test("corrupt or foreign-schema data collapses to defaults", () => {
  const storage = memoryStorage();
  storage.setItem(GAME.saveKey, "{not json");
  assert.equal(createSave(storage).routeBest("blue-1"), null);
  storage.setItem(GAME.saveKey, JSON.stringify({ schema: 999, routes: { "blue-1": { bestSeconds: 1 } } }));
  assert.equal(createSave(storage).routeBest("blue-1"), null);
  storage.setItem(GAME.saveKey, JSON.stringify({ schema: GAME.saveSchema, routes: { "blue-1": { bestSeconds: "abc", completions: "x" } } }));
  const save = createSave(storage);
  assert.equal(save.routeBest("blue-1"), null);
  assert.equal(save.data.routes["blue-1"].completions, 0);
});

test("blue is always unlocked; red and black start locked", () => {
  const save = createSave(memoryStorage());
  assert.deepEqual(save.data.unlocks, { blue: true, red: false, black: false });
  assert.equal(save.isUnlocked("blue"), true);
  assert.equal(save.isUnlocked("red"), false);
  assert.equal(save.isUnlocked("black"), false);
  assert.equal(save.isUnlocked("green"), true, "categories without a gate default to open");
});

test("unlocking a category persists and only reports true the first time", () => {
  const storage = memoryStorage();
  const save = createSave(storage);
  assert.equal(save.unlockCategory("red"), true);
  assert.equal(save.isUnlocked("red"), true);
  assert.equal(save.unlockCategory("red"), false, "already unlocked");
  const reloaded = createSave(storage);
  assert.equal(reloaded.isUnlocked("red"), true);
  assert.equal(reloaded.isUnlocked("black"), false);
});

test("blue completion unlocks red, red unlocks black, black unlocks nothing", () => {
  assert.equal(nextGateCategory("blue"), "red");
  assert.equal(nextGateCategory("red"), "black");
  assert.equal(nextGateCategory("black"), null);
});

test("an older save without unlocks migrates to the default gate, blue forced open", () => {
  const storage = memoryStorage();
  storage.setItem(GAME.saveKey, JSON.stringify({ schema: GAME.saveSchema, routes: {} }));
  const save = createSave(storage);
  assert.deepEqual(save.data.unlocks, { blue: true, red: false, black: false });

  storage.setItem(GAME.saveKey, JSON.stringify({ schema: GAME.saveSchema, routes: {}, unlocks: { blue: false, red: "yes", black: true } }));
  const corrupt = createSave(storage);
  assert.equal(corrupt.isUnlocked("blue"), true, "blue can never be saved as locked");
  assert.equal(corrupt.isUnlocked("red"), false, "non-boolean values are ignored, default kept");
  assert.equal(corrupt.isUnlocked("black"), true);
});
