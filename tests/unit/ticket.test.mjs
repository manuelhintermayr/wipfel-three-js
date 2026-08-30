// Ticket clock (js/game/ticket.js): game-time mapping, remaining time, warning threshold, expiry,
// extension cap. Pure logic – no DOM, no session.js wiring.
import test from "node:test";
import assert from "node:assert/strict";
import { createTicketClock, gameHoursElapsed, timeOfDayFor } from "../../js/game/ticket.js";
import { TIME, TICKET } from "../../js/config.js";

const REAL_SECONDS_PER_GAME_HOUR = TIME.gameHourMinutes * 60;

test("gameHoursElapsed maps real seconds to game hours via TIME.gameHourMinutes", () => {
  assert.equal(gameHoursElapsed(0), 0);
  assert.equal(gameHoursElapsed(REAL_SECONDS_PER_GAME_HOUR), 1);
  assert.equal(gameHoursElapsed(REAL_SECONDS_PER_GAME_HOUR * 2.5), 2.5);
});

test("timeOfDayFor wraps around midnight from a given opening hour", () => {
  assert.equal(timeOfDayFor(0, 9), 9);
  assert.equal(timeOfDayFor(4, 9), 13);
  assert.equal(timeOfDayFor(20, 9), 5, "9 + 20 wraps past 24 back to 5");
  assert.equal(timeOfDayFor(-2, 9), 7, "negative elapsed still wraps into [0, 24)");
});

test("a fresh clock has not started: not clippable, not expired, ticks ignored", () => {
  const clock = createTicketClock({ ticketHours: 4 });
  assert.equal(clock.started, false);
  assert.equal(clock.clippable, false);
  assert.equal(clock.expired, false);
  clock.update(100);
  assert.equal(clock.elapsedReal, 0, "update() before reset() must be a no-op");
});

test("reset starts a standard 4 h ticket at 240 game minutes, opening hour on the clock", () => {
  const clock = createTicketClock({ ticketHours: 4 });
  clock.reset();
  assert.equal(clock.started, true);
  assert.equal(clock.clippable, true);
  assert.equal(clock.totalGameMinutes, 240);
  assert.equal(clock.remainingGameMinutes, 240);
  assert.equal(clock.timeOfDay, TICKET.openingHour);
});

test("remaining time tracks real seconds through the game-hour mapping", () => {
  const clock = createTicketClock({ ticketHours: 4, openingHour: 9 });
  clock.reset();
  clock.update(REAL_SECONDS_PER_GAME_HOUR);           // one full game hour elapses
  assert.equal(clock.remainingGameMinutes, 180);
  assert.equal(clock.timeOfDay, 10);
  clock.update(REAL_SECONDS_PER_GAME_HOUR * 1.5);      // + 1.5 game hours
  assert.ok(Math.abs(clock.remainingGameMinutes - 90) < 1e-9);
  assert.equal(clock.timeOfDay, 11.5);
});

test("happy hour ticket runs 2 h = 120 game minutes", () => {
  const clock = createTicketClock({ ticketHours: 4 });
  clock.reset({ ticketHours: 2 });
  assert.equal(clock.totalGameMinutes, 120);
  assert.equal(clock.remainingGameMinutes, 120);
});

test("the warning threshold is a plain remaining-time comparison at the right real-time offset", () => {
  const clock = createTicketClock({ ticketHours: 4 });
  clock.reset();
  // 30 game minutes remain once 210 of the 240 have elapsed.
  const secondsFor210Minutes = (210 / 60) * REAL_SECONDS_PER_GAME_HOUR;
  clock.update(secondsFor210Minutes - 1);
  assert.ok(clock.remainingGameMinutes > TICKET.warnMinutes, "not yet at the threshold");
  clock.update(1 + 0.001 * REAL_SECONDS_PER_GAME_HOUR);   // cross just past the 30-minute mark
  assert.ok(clock.remainingGameMinutes <= TICKET.warnMinutes, "past the threshold now");
});

test("the clock expires exactly when the ticket's game minutes run out, clippable flips off", () => {
  const clock = createTicketClock({ ticketHours: 4 });
  clock.reset();
  clock.update(REAL_SECONDS_PER_GAME_HOUR * 4 - 0.01);
  assert.equal(clock.expired, false);
  assert.equal(clock.clippable, true);
  clock.update(0.02);
  assert.equal(clock.remainingGameMinutes, 0);
  assert.equal(clock.expired, true);
  assert.equal(clock.clippable, false);
});

test("extend adds minutes back and un-expires the clock, capped at maxExtensions", () => {
  const clock = createTicketClock({ ticketHours: 4, extendGameMinutes: 30, maxExtensions: 2 });
  clock.reset();
  clock.update(REAL_SECONDS_PER_GAME_HOUR * 4);        // exactly expired
  assert.equal(clock.expired, true);
  assert.equal(clock.extensionsLeft, 2);

  assert.equal(clock.extend(), true);
  assert.equal(clock.extensionsUsed, 1);
  assert.equal(clock.extensionsLeft, 1);
  assert.equal(clock.remainingGameMinutes, 30);
  assert.equal(clock.expired, false);
  assert.equal(clock.clippable, true);

  clock.update(REAL_SECONDS_PER_GAME_HOUR * 0.5);      // burn through the extension
  assert.equal(clock.expired, true);
  assert.equal(clock.extend(), true, "second extension still allowed");
  assert.equal(clock.extensionsUsed, 2);
  assert.equal(clock.extensionsLeft, 0);

  clock.update(REAL_SECONDS_PER_GAME_HOUR * 0.5);
  assert.equal(clock.extend(), false, "capped at maxExtensions");
  assert.equal(clock.extensionsUsed, 2);
});

test("end() closes the day: not started, not clippable, not expired (there is simply no ticket)", () => {
  const clock = createTicketClock({ ticketHours: 4 });
  clock.reset();
  clock.update(REAL_SECONDS_PER_GAME_HOUR * 4.5);
  assert.equal(clock.expired, true);
  clock.end();
  assert.equal(clock.started, false);
  assert.equal(clock.clippable, false);
  assert.equal(clock.expired, false, "expired implies started – with no ticket there is nothing to expire");
});

test("reset after end starts a brand new day at full time", () => {
  const clock = createTicketClock({ ticketHours: 4 });
  clock.reset();
  clock.update(REAL_SECONDS_PER_GAME_HOUR * 4);
  clock.extend();
  clock.end();
  clock.reset();
  assert.equal(clock.started, true);
  assert.equal(clock.remainingGameMinutes, 240);
  assert.equal(clock.extensionsUsed, 0, "a new day resets the extension count");
});
