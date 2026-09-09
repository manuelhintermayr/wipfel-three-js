// Season/day operations (ROADMAP M3b, GDD §4 "safety as a tech tree and obligation", RESEARCH-DATA §7
// "weather: evacuation on thunderstorm/storm/hail/heavy rain"). Pure-ish logic (no THREE, a tiny bit of DOM
// only for the storm warning line the ticket desk/operator panel read) driving three things:
//   - the season/day counter (a season is `OPERATIONS.seasonDays` in-game days, one per ticket desk "New day"),
//   - PPE wear (a fixed amount per guest-day and per player-day, an inspection becomes due once worn
//     past a threshold – the annual-inspection ritual compressed to a single day's own wear budget,
//     documented simplification, RESEARCH-DATA §7's real inspection cadence is a season, not a day),
//   - the day's weather: a deterministic forecast derived from (seed, day) alone, so the same day of the
//     same park always brings the same weather; a "storm" forecast evacuates the park for a fixed window
//     once the sky/ticket clock reaches `OPERATIONS.stormHour`.
// All persisted state lives in js/core/save.js#data.operations (additive, versioned) – this module never
// touches localStorage directly, only save's own `updateOperations`.
import { OPERATIONS, TIME } from "../config.js";
import { Rng } from "../core/rng.js";
import { t } from "../core/i18n.js";

/** Pure: which forecast day `day` (1-based, absolute since the park opened) gets, for `seed`. Exported
 *  so tests (and the operator panel, for a short look-ahead) can call it without a live save/wind. */
export function forecastForDay(seed, day) {
  const rng = new Rng(seed).fork(`weather:${day}`);
  const total = OPERATIONS.forecastWeights.reduce((sum, w) => sum + w, 0);
  let roll = rng.float(0, total);
  for (let i = 0; i < OPERATIONS.forecasts.length; i++) {
    if (roll < OPERATIONS.forecastWeights[i]) return OPERATIONS.forecasts[i];
    roll -= OPERATIONS.forecastWeights[i];
  }
  return OPERATIONS.forecasts[OPERATIONS.forecasts.length - 1];
}

/** Pure: 1-based season number and 1-based day-within-season for an absolute day counter. */
export function seasonOf(day) { return Math.floor((day - 1) / OPERATIONS.seasonDays) + 1; }
export function dayInSeasonOf(day) { return ((day - 1) % OPERATIONS.seasonDays) + 1; }

/** Pure: new PPE wear (0..1, clamped) after one day with `guestCount` admitted guests and one player. */
export function applyDailyWear(previousWear, guestCount) {
  return Math.min(1, Math.max(0, previousWear) + Math.max(0, guestCount) * OPERATIONS.ppeWearPerGuestDay + OPERATIONS.ppeWearPerPlayerDay);
}

/** Real seconds an evacuation lasts once triggered – `stormDurationHours` converted the same way the
 *  ticket clock converts game hours to real minutes (`TIME.gameHourMinutes`), so "the storm passes"
 *  takes a comparable, playable amount of real time regardless of what the game clock is doing. */
const EVACUATION_REAL_SECONDS = OPERATIONS.stormDurationHours * TIME.gameHourMinutes * 60;

/**
 * @param {{ save, seed: number, wind?: object }} options `seed` is the park's own seed
 *   (js/park/layout.js's `parkDef.seed`) – the forecast is keyed off it so a shared/exported park still
 *   "remembers" its own weather pattern per day. `wind` (optional, js/world/wind.js) is nudged by the
 *   day's forecast – omit it and only the forecast/evacuation logic itself still works (tests).
 * @returns {{ day, season, dayInSeason, ppeWear, ppeInspectionDue, forecast, isStormDay,
 *   isEvacuating(): boolean, update(dtReal: number, gameHour: number): void,
 *   beginDay(guestCount?): void, resetPpe(): void }}
 */
export function createOperations({ save, seed, wind = null }) {
  const applyWindBias = () => { if (wind && typeof wind.setDailyBias === "function") wind.setDailyBias(OPERATIONS.windBiasByForecast[forecast] ?? 1); };
  let forecast = forecastForDay(seed, save.data.operations.day);
  applyWindBias();
  // Evacuation runs on its own real-time countdown once triggered (see `update` below) rather than a
  // plain "is the game hour inside this window" check – the ticket clock is *paused* for the whole
  // storm (GDD "ticket clock pauses"), so comparing against it would freeze the window open forever the
  // moment js/main.js actually stops advancing it.
  let evacuating = false;
  let evacuationSecondsLeft = 0;

  return {
    get day() { return save.data.operations.day; },
    get season() { return seasonOf(save.data.operations.day); },
    get dayInSeason() { return dayInSeasonOf(save.data.operations.day); },
    get ppeWear() { return save.data.operations.ppeWear; },
    get ppeInspectionDue() { return save.data.operations.ppeWear >= OPERATIONS.ppeInspectionThreshold; },
    get forecast() { return forecast; },
    get isStormDay() { return forecast === "storm"; },
    /** A translated one-line warning for the ticket desk/operator panel, or null on a calm day. */
    get stormWarningLine() {
      return forecast === "storm" ? t("operations.stormWarning", { hour: String(OPERATIONS.stormHour).padStart(2, "0") }) : null;
    },

    isEvacuating() { return evacuating; },

    /**
     * js/main.js's gameplay phase, every frame, with REAL `dtReal` (unaffected by whether the ticket
     * clock itself is currently paused) and the live game hour (`ticket.timeOfDay` while a ticket is
     * running, `sky.timeOfDay` otherwise) – only used to detect the *rising* edge into the storm hour;
     * once evacuating, the countdown runs on `dtReal` alone. Triggering js/npc/agents.js#evacuate() and
     * any rating hit is js/main.js's own job (this module only tracks the boolean).
     */
    update(dtReal, gameHour) {
      if (!evacuating) {
        if (forecast === "storm" && gameHour >= OPERATIONS.stormHour) { evacuating = true; evacuationSecondsLeft = EVACUATION_REAL_SECONDS; }
        return;
      }
      evacuationSecondsLeft -= Math.max(0, dtReal);
      if (evacuationSecondsLeft <= 0) evacuating = false;
    },

    /** Ticket desk "New day" (js/main.js#startDay): advance the counter, wear the PPE by yesterday's traffic,
     *  roll tomorrow's forecast. `guestCount` is the *modelled* admission count for the day just ended
     *  (js/game/economy.js#nextDayGuestCount) – intentionally decoupled from the live NPC roster size
     *  (js/npc/agents.js), which stays a fixed-per-session simulation for M3b rather than being rebuilt
     *  every in-game day; documented simplification. */
    beginDay(guestCount = 0) {
      const next = save.data.operations.day + 1;
      const wear = applyDailyWear(save.data.operations.ppeWear, guestCount);
      save.updateOperations({ day: next, ppeWear: wear });
      forecast = forecastForDay(seed, next);
      evacuating = false; evacuationSecondsLeft = 0;
      applyWindBias();
    },

    /** Operator panel "Inspect" button (js/builder/operator-panel.js) – js/game/economy.js charges the
     *  cash cost separately, this only clears the wear counter and bumps the lifetime count. */
    resetPpe() {
      save.updateOperations({ ppeWear: 0, ppeResets: save.data.operations.ppeResets + 1 });
    },

    /** `WIPFEL.debug.forceStorm()` (verification/screenshots): today's forecast becomes "storm" and the
     *  evacuation starts immediately, without waiting for the game clock to reach `OPERATIONS.stormHour`. */
    debugForceStorm() {
      forecast = "storm";
      applyWindBias();
      evacuating = true;
      evacuationSecondsLeft = EVACUATION_REAL_SECONDS;
    },
  };
}
