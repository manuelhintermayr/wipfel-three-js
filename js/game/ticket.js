// The ticket as a clock (GDD §3.7/§3.8, ROADMAP M1.5): pure logic, no DOM/THREE, so the game-time
// mapping, expiry and extension cap are unit-testable the same way js/player/belay.js is. Everything
// that *reacts* to the clock (HUD notices, the day-end sequence, the stamp card) lives in
// js/game/session.js, which polls these getters once a frame – the clock itself has no callbacks.
import { TIME, TICKET } from "../config.js";

/** Real seconds elapsed → game hours elapsed (TIME.gameHourMinutes real minutes = 1 game hour). Pure. */
export function gameHoursElapsed(realSeconds) {
  return realSeconds / (TIME.gameHourMinutes * 60);
}

/** Game hours elapsed since opening → wall-clock hour of day, wrapped into [0, 24). Pure. */
export function timeOfDayFor(hoursElapsed, openingHour = TICKET.openingHour) {
  return (((openingHour + hoursElapsed) % 24) + 24) % 24;
}

/**
 * @param {{ ticketHours?: number, openingHour?: number, extendGameMinutes?: number,
 *   maxExtensions?: number }} [options]
 * @returns {{ elapsedReal: number, totalGameMinutes: number, remainingGameMinutes: number,
 *   timeOfDay: number, started: boolean, expired: boolean, clippable: boolean,
 *   extensionsUsed: number, extensionsLeft: number,
 *   update(dtSeconds: number): void, extend(): boolean, reset(next?: {ticketHours?: number}): void,
 *   end(): void }}
 */
export function createTicketClock(options = {}) {
  let ticketHours = options.ticketHours ?? TIME.ticketHours;
  const openingHour = options.openingHour ?? TICKET.openingHour;
  const extendGameMinutes = options.extendGameMinutes ?? TICKET.extendGameMinutes;
  const maxExtensions = options.maxExtensions ?? TICKET.maxExtensions;

  let totalGameMinutes = ticketHours * 60;
  let elapsedReal = 0;
  let extensionsUsed = 0;
  let started = false;

  const elapsedGameMinutes = () => gameHoursElapsed(elapsedReal) * 60;
  const remaining = () => Math.max(0, totalGameMinutes - elapsedGameMinutes());

  return {
    get elapsedReal() { return elapsedReal; },
    get totalGameMinutes() { return totalGameMinutes; },
    get remainingGameMinutes() { return remaining(); },
    get timeOfDay() { return timeOfDayFor(gameHoursElapsed(elapsedReal), openingHour); },
    get started() { return started; },
    /** Ran out of game time – no more clip-ins, the day is winding down (js/game/session.js). */
    get expired() { return started && remaining() <= 0; },
    /** May a *new* clip-in start right now (js/player/interaction.js)? */
    get clippable() { return started && remaining() > 0; },
    get extensionsUsed() { return extensionsUsed; },
    get extensionsLeft() { return Math.max(0, maxExtensions - extensionsUsed); },

    /** Advance the clock by `dtSeconds` of real time. No-op before the first `reset()`. */
    update(dtSeconds) {
      if (!started || !(dtSeconds > 0)) return;
      elapsedReal += dtSeconds;
    },

    /**
     * "+30 min" at the expiry prompt (RESEARCH-DATA §1: "+5 € je weitere 1/2 h" – no real money here).
     * @returns {boolean} true if applied, false once `maxExtensions` is used up.
     */
    extend() {
      if (extensionsUsed >= maxExtensions) return false;
      totalGameMinutes += extendGameMinutes;
      extensionsUsed += 1;
      return true;
    },

    /** Start (or restart) a ticket – kassa confirm, or restoring a resumed day from the save. */
    reset(next = {}) {
      if (Number.isFinite(next.ticketHours)) ticketHours = next.ticketHours;
      totalGameMinutes = ticketHours * 60;
      elapsedReal = 0;
      extensionsUsed = 0;
      started = true;
    },

    /** "Continue browsing" (stamp card): no ticket – the day is simply over, clipping stays refused. */
    end() { started = false; },
  };
}
