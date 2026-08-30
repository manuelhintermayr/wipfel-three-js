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

test("an older save without settings migrates to the defaults (M1.7)", () => {
  const storage = memoryStorage();
  storage.setItem(GAME.saveKey, JSON.stringify({ schema: GAME.saveSchema, routes: {} }));
  const save = createSave(storage);
  assert.deepEqual(save.data.settings, {
    audio: { master: 100, sfx: 100, ambience: 100, ui: 100 },
    lookSensitivity: null,
    invertY: false,
    reducedCameraMotion: false,
    reducedMotion: false,
    assist: false,
  });
});

test("updateSettings merges partial patches, persists, and reloads", () => {
  const storage = memoryStorage();
  const save = createSave(storage);
  save.updateSettings({ audio: { sfx: 40 }, assist: true, lookSensitivity: 0.004 });
  assert.equal(save.data.settings.audio.sfx, 40);
  assert.equal(save.data.settings.audio.master, 100, "untouched categories keep their value");
  assert.equal(save.data.settings.assist, true);
  assert.equal(save.data.settings.lookSensitivity, 0.004);

  const reloaded = createSave(storage);
  assert.equal(reloaded.data.settings.audio.sfx, 40);
  assert.equal(reloaded.data.settings.assist, true);
  assert.equal(reloaded.data.settings.lookSensitivity, 0.004);
  assert.equal(reloaded.data.settings.invertY, false, "fields never patched keep their default");
});

test("updateSettings ignores malformed fields and clamps volumes to 0..100", () => {
  const save = createSave(memoryStorage());
  save.updateSettings({ audio: { master: 500, sfx: -20, ambience: "loud" }, invertY: "yes" });
  assert.equal(save.data.settings.audio.master, 100, "clamped to the max");
  assert.equal(save.data.settings.audio.sfx, 0, "clamped to the min");
  assert.equal(save.data.settings.audio.ambience, 100, "non-numeric value ignored, default kept");
  assert.equal(save.data.settings.invertY, false, "non-boolean value ignored, default kept");
});

test("a corrupt settings block collapses only the bad fields, not the whole save", () => {
  const storage = memoryStorage();
  storage.setItem(GAME.saveKey, JSON.stringify({
    schema: GAME.saveSchema, routes: {},
    settings: { audio: { master: "loud", sfx: 55 }, lookSensitivity: "fast", assist: 1 },
  }));
  const save = createSave(storage);
  assert.equal(save.data.settings.audio.master, 100, "non-numeric volume ignored, default kept");
  assert.equal(save.data.settings.audio.sfx, 55, "valid sibling field still applied");
  assert.equal(save.data.settings.lookSensitivity, null, "non-numeric, non-null value ignored, default kept");
  assert.equal(save.data.settings.assist, false, "non-boolean value ignored, default kept");
});

test("export/import round-trips the whole save through the same validation as a page load", () => {
  const save = createSave(memoryStorage());
  save.recordRun("blue-1", { seconds: 88, falls: 1 });
  save.unlockCategory("red");
  save.updateSettings({ audio: { ui: 30 }, assist: true });
  const json = save.export();

  const fresh = createSave(memoryStorage());
  assert.equal(fresh.import(json), true);
  assert.equal(fresh.routeBest("blue-1"), 88);
  assert.equal(fresh.isUnlocked("red"), true);
  assert.equal(fresh.data.settings.audio.ui, 30);
  assert.equal(fresh.data.settings.assist, true);
});

test("import refuses malformed JSON or a foreign schema, leaving the existing save untouched", () => {
  const save = createSave(memoryStorage());
  save.recordRun("blue-1", { seconds: 50, falls: 0 });
  assert.equal(save.import("{not json"), false);
  assert.equal(save.import(JSON.stringify({ schema: 999, routes: {} })), false);
  assert.equal(save.routeBest("blue-1"), 50, "untouched by the refused imports");
});
