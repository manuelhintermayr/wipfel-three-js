// Save schema: defaults, best-time logic, corrupt data collapses to defaults, persistence round-trip.
import test from "node:test";
import assert from "node:assert/strict";
import { createSave, memoryStorage } from "../../js/core/save.js";
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
