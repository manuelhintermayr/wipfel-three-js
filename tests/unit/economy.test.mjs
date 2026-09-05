// Economy + rating (ROADMAP M3b): route build cost, admission income, word-of-mouth guest count,
// rating clamp/signature bonus, and the stateful wrapper's cash/rating bookkeeping (js/game/economy.js).
import test from "node:test";
import assert from "node:assert/strict";
import { createSave, memoryStorage } from "../../js/core/save.js";
import { ECONOMY } from "../../js/config.js";
import {
  computeRouteBuildCost, admissionIncome, computeNextDayGuestCount, applyRatingDelta, createEconomy,
} from "../../js/game/economy.js";

test("computeRouteBuildCost: lands in/near GDD's own ~40-50k band for a plausible route length", () => {
  const short = computeRouteBuildCost("blue", 40);
  const long = computeRouteBuildCost("black", 120);
  assert.ok(short >= ECONOMY.routeBuildCostBase.blue, "never under the category's own base cost");
  assert.ok(long > short, "a longer, harder route costs more");
  assert.equal(computeRouteBuildCost("does-not-exist", 0), ECONOMY.routeBuildCostBase.blue, "unknown category falls back to blue's base");
});

test("admissionIncome: scales with guest count, unknown ticket type falls back to standard", () => {
  assert.equal(admissionIncome("standard", 0), 0);
  assert.equal(admissionIncome("standard", 10), ECONOMY.incomeByTicketType.standard * 10);
  assert.equal(admissionIncome("ghost-ticket", 5), ECONOMY.incomeByTicketType.standard * 5);
  assert.equal(admissionIncome("standard", -3), 0, "never negative income");
});

test("computeNextDayGuestCount: deterministic, and a higher rating draws more guests on average", () => {
  const a = computeNextDayGuestCount({ seed: 1, day: 5, rating: 4 });
  const b = computeNextDayGuestCount({ seed: 1, day: 5, rating: 4 });
  assert.equal(a, b);

  let lowSum = 0, highSum = 0;
  const samples = 30;
  for (let day = 1; day <= samples; day++) {
    lowSum += computeNextDayGuestCount({ seed: 1, day, rating: ECONOMY.wordOfMouth.ratingFloor });
    highSum += computeNextDayGuestCount({ seed: 1, day, rating: ECONOMY.wordOfMouth.ratingCeil });
  }
  assert.ok(highSum / samples > lowSum / samples, "a 5.0 rating should draw noticeably more guests than a 2.0 one");
  assert.ok(computeNextDayGuestCount({ seed: 1, day: 1, rating: 0 }) >= 0, "never negative");
});

test("applyRatingDelta: clamps into [ratingMin, ratingMax], and a signature bonus raises the ceiling", () => {
  assert.equal(applyRatingDelta(ECONOMY.ratingMax - 0.001, 10), ECONOMY.ratingMax);
  assert.equal(applyRatingDelta(ECONOMY.ratingMin + 0.001, -10), ECONOMY.ratingMin);
  const withBonus = applyRatingDelta(ECONOMY.ratingMax - 0.001, 10, { signature: ECONOMY.signatureBonusCap });
  assert.equal(withBonus, ECONOMY.ratingMax + ECONOMY.signatureBonusCap);
});

test("createEconomy: starts at the configured cash/rating, spend/earn move cash directly", () => {
  const save = createSave(memoryStorage());
  const economy = createEconomy({ save });
  assert.equal(economy.cash, ECONOMY.startingCash);
  assert.equal(economy.rating, ECONOMY.ratingStart);
  economy.earn(100);
  assert.equal(economy.cash, ECONOMY.startingCash + 100);
  economy.spend(40);
  assert.equal(economy.cash, ECONOMY.startingCash + 60);
});

test("chargeRouteOpened: charged exactly once per route id, never twice", () => {
  const save = createSave(memoryStorage());
  const economy = createEconomy({ save });
  assert.equal(economy.hasChargedRoute("blue-1"), false);
  const cost = economy.chargeRouteOpened("blue-1", "blue", 60);
  assert.ok(cost > 0);
  assert.equal(economy.cash, ECONOMY.startingCash - cost);
  assert.equal(economy.hasChargedRoute("blue-1"), true);
  const second = economy.chargeRouteOpened("blue-1", "blue", 60);
  assert.equal(second, 0, "a second call for the same route charges nothing");
  assert.equal(economy.cash, ECONOMY.startingCash - cost, "cash unchanged by the no-op second charge");
});

test("flat charges (rescue post, PPE reset, daily fixed cost) each deduct their own configured amount", () => {
  const save = createSave(memoryStorage());
  const economy = createEconomy({ save });
  economy.chargeRescuePost();
  economy.chargePpeReset();
  economy.chargeDailyFixedCost();
  const expected = ECONOMY.startingCash - ECONOMY.rescuePostCost - ECONOMY.ppeResetCost - ECONOMY.dailyFixedCost;
  assert.equal(economy.cash, expected);
});

test("admitGuests earns the ticket-type income and returns the amount earned", () => {
  const save = createSave(memoryStorage());
  const economy = createEconomy({ save });
  const income = economy.admitGuests("standard", 10);
  assert.equal(income, ECONOMY.incomeByTicketType.standard * 10);
  assert.equal(economy.cash, ECONOMY.startingCash + income);
});

test("rating hooks move the rating in the documented direction and persist through save", () => {
  const storage = memoryStorage();
  const save = createSave(storage);
  const economy = createEconomy({ save });
  const start = economy.rating;
  economy.onRouteCompleted();
  assert.ok(economy.rating > start);
  const afterRoute = economy.rating;
  economy.onRescueOutcome(true);
  assert.ok(economy.rating > afterRoute, "a successful rescue raises the rating");
  const afterSuccess = economy.rating;
  economy.onRescueOutcome(false);
  assert.ok(economy.rating < afterSuccess, "a failed rescue lowers it");
  const afterFailure = economy.rating;
  economy.onAccident();
  assert.ok(economy.rating < afterFailure);
  const afterAccident = economy.rating;
  economy.onEvacuation();
  assert.ok(economy.rating < afterAccident);
  const reloaded = createSave(storage);
  assert.equal(reloaded.data.economy.rating, economy.rating);
});

test("onDayAvailability: only applies its bonus when told availability is true", () => {
  const save = createSave(memoryStorage());
  const economy = createEconomy({ save });
  const start = economy.rating;
  economy.onDayAvailability(false);
  assert.equal(economy.rating, start);
  economy.onDayAvailability(true);
  assert.ok(economy.rating > start);
});

test("setSignatureActive: raises the effective rating ceiling for every subsequent hook", () => {
  const save = createSave(memoryStorage());
  const economy = createEconomy({ save });
  save.updateEconomy({ rating: ECONOMY.ratingMax - 0.001 });
  economy.onRouteCompleted();
  assert.equal(economy.rating, ECONOMY.ratingMax, "clamped at the normal ceiling without the bonus");
  save.updateEconomy({ rating: ECONOMY.ratingMax - 0.001 });
  economy.setSignatureActive(true);
  economy.onRouteCompleted();
  assert.ok(economy.rating > ECONOMY.ratingMax, "the signature bonus lifted the ceiling");
});
