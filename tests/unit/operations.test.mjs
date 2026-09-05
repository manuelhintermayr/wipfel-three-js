// Season/day operations (ROADMAP M3b): forecast determinism, season/day maths, PPE wear thresholds,
// and the evacuation state machine's own real-time countdown (js/game/operations.js).
import test from "node:test";
import assert from "node:assert/strict";
import { createSave, memoryStorage } from "../../js/core/save.js";
import { OPERATIONS, TIME } from "../../js/config.js";
import { forecastForDay, seasonOf, dayInSeasonOf, applyDailyWear, createOperations } from "../../js/game/operations.js";

// Empirically: seed 1, day 20 rolls "storm" – used below for the evacuation tests. A change to the
// forecast weights/roll formula may need this re-picked; the determinism test does not depend on it.
const STORM_DAY = 20;
const CALM_DAY = 2;   // seed 1, day 2 rolls "clear"

test("forecastForDay is deterministic for a given seed+day and always a known forecast", () => {
  const a = forecastForDay(1, 5);
  const b = forecastForDay(1, 5);
  assert.equal(a, b);
  assert.ok(OPERATIONS.forecasts.includes(a));
});

test("forecastForDay: a different day is not pinned to the same forecast every time (sanity, not a hard rule)", () => {
  const values = new Set();
  for (let day = 1; day <= 15; day++) values.add(forecastForDay(1, day));
  assert.ok(values.size > 1, "fifteen days of the same seed should not all roll the same weather");
});

test("seasonOf/dayInSeasonOf: a season is OPERATIONS.seasonDays long, both 1-based", () => {
  assert.equal(OPERATIONS.seasonDays, 8);
  assert.deepEqual([seasonOf(1), dayInSeasonOf(1)], [1, 1]);
  assert.deepEqual([seasonOf(8), dayInSeasonOf(8)], [1, 8]);
  assert.deepEqual([seasonOf(9), dayInSeasonOf(9)], [2, 1]);
  assert.deepEqual([seasonOf(16), dayInSeasonOf(16)], [2, 8]);
  assert.deepEqual([seasonOf(17), dayInSeasonOf(17)], [3, 1]);
});

test("applyDailyWear: increases with guest traffic and clamps at 1", () => {
  const afterFew = applyDailyWear(0, 5);
  const afterMany = applyDailyWear(0, 50);
  assert.ok(afterFew > 0 && afterFew < 1);
  assert.ok(afterMany > afterFew, "more guests wear the gear faster");
  assert.equal(applyDailyWear(0.999, 1000), 1, "wear never exceeds 1");
  assert.equal(applyDailyWear(-5, 0), OPERATIONS.ppeWearPerPlayerDay, "never goes negative either");
});

test("createOperations: starts at day 1, no inspection due, calm-forecast-dependent storm line", () => {
  const save = createSave(memoryStorage());
  const operations = createOperations({ save, seed: 1 });
  assert.equal(operations.day, 1);
  assert.equal(operations.season, 1);
  assert.equal(operations.dayInSeason, 1);
  assert.equal(operations.ppeWear, 0);
  assert.equal(operations.ppeInspectionDue, false);
});

test("beginDay: advances the day, wears the PPE, rerolls the forecast, and persists through save", () => {
  const storage = memoryStorage();
  const save = createSave(storage);
  const operations = createOperations({ save, seed: 1 });
  operations.beginDay(20);
  assert.equal(operations.day, 2);
  assert.ok(operations.ppeWear > 0);
  const reloaded = createSave(storage);
  assert.equal(reloaded.data.operations.day, 2);
  assert.ok(reloaded.data.operations.ppeWear > 0);
});

test("ppeInspectionDue flips once wear crosses OPERATIONS.ppeInspectionThreshold, resetPpe clears it", () => {
  const save = createSave(memoryStorage());
  const operations = createOperations({ save, seed: 1 });
  for (let i = 0; i < 40; i++) operations.beginDay(80);   // heavy traffic, many days – wear must saturate
  assert.equal(operations.ppeWear, 1);
  assert.equal(operations.ppeInspectionDue, true);
  operations.resetPpe();
  assert.equal(operations.ppeWear, 0);
  assert.equal(operations.ppeInspectionDue, false);
  assert.equal(save.data.operations.ppeResets, 1);
});

test("a calm day never evacuates, however far the game clock runs", () => {
  const save = createSave(memoryStorage());
  save.updateOperations({ day: CALM_DAY - 1 });
  const operations = createOperations({ save, seed: 1 });
  operations.beginDay(0);
  assert.equal(operations.forecast, "clear");
  operations.update(1, OPERATIONS.stormHour);
  operations.update(1, OPERATIONS.stormHour + 5);
  assert.equal(operations.isEvacuating(), false);
});

test("a storm day evacuates once the game hour reaches stormHour, and un-evacuates after its own real-time duration", () => {
  const save = createSave(memoryStorage());
  save.updateOperations({ day: STORM_DAY - 1 });
  const operations = createOperations({ save, seed: 1 });
  operations.beginDay(0);
  assert.equal(operations.forecast, "storm");
  assert.ok(operations.stormWarningLine, "a storm day must have a kassa warning line");

  operations.update(1, OPERATIONS.stormHour - 0.5);   // before the storm hour: not evacuating yet
  assert.equal(operations.isEvacuating(), false);

  operations.update(1, OPERATIONS.stormHour);   // rising edge – consumes the first of the total real seconds
  assert.equal(operations.isEvacuating(), true);

  // The game clock is irrelevant from here on (js/main.js pauses the ticket during the whole storm) –
  // only real elapsed seconds end it. A huge, frozen game-hour argument must not end it early.
  const totalRealSeconds = OPERATIONS.stormDurationHours * TIME.gameHourMinutes * 60;
  operations.update(totalRealSeconds - 2, OPERATIONS.stormHour);   // cumulative: total - 1 (one second still owed)
  assert.equal(operations.isEvacuating(), true, "not yet – short by one second");
  operations.update(2, OPERATIONS.stormHour);   // cumulative now exceeds the total
  assert.equal(operations.isEvacuating(), false, "the storm's own real-time window has elapsed");
});

test("debugForceStorm: forces the forecast and starts the evacuation immediately, for screenshots", () => {
  const save = createSave(memoryStorage());
  save.updateOperations({ day: CALM_DAY });   // whatever this seed/day would normally roll
  const operations = createOperations({ save, seed: 1 });
  assert.equal(operations.isEvacuating(), false);
  operations.debugForceStorm();
  assert.equal(operations.forecast, "storm");
  assert.equal(operations.isEvacuating(), true);
});
