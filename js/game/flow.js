// Flow – the counterforce to nerves (ROADMAP M2a, GDD §3.10: "Flow will, dass du weitergehst"). Pure
// logic, no DOM/THREE, unit-tested (tests/unit/flow.test.mjs) the same way js/player/nerves.js is.
//
// Builds only while the climber is *progressing* cleanly (on an element/zipline/tarzan swing, having
// held that without a break for `cleanHoldSeconds`) and nerves stay under `nervesCeiling` – "nerves
// want you to stop, flow wants you to keep going", so the two are read from the same nerve value every
// step. A fall or a freeze (`onFall()`/`ctx.frozen`) snaps it straight back to `min`. Standing on a
// platform between elements *pauses* it (does not reset) for `pauseGraceSeconds`, then it decays back
// towards `min` over `decaySeconds` – a breather does not erase a good run, but dawdling does.
import { FLOW } from "../config.js";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * @returns {{ value: number, averageThisRun: number, resetRun(), creditCleanClip(), onFall(),
 *   update(dt: number, ctx: { progressing: boolean, frozen: boolean, nervesValue: number }): number }}
 */
export function createFlow() {
  let value = FLOW.min;
  let cleanSeconds = 0;      // how long the climber has been progressing cleanly, unbroken
  let pauseSeconds = 0;      // how long since progress last stopped (platform, ground, …)
  let weightedSum = 0, sampledSeconds = 0;   // time-weighted average this run – feeds the score + mastery's "in flow" tier

  function snapToBase() {
    value = FLOW.min;
    cleanSeconds = 0;
    pauseSeconds = 0;
  }

  return {
    get value() { return value; },
    /** Time-weighted mean flow since the last `resetRun()` – js/game/mastery.js's "in flow" tier and
     *  the per-run score both read this instead of the instantaneous value. */
    get averageThisRun() { return sampledSeconds > 0 ? weightedSum / sampledSeconds : value; },

    /** A fresh route attempt: back to the base multiplier, the running average starts over. */
    resetRun() { snapToBase(); weightedSum = 0; sampledSeconds = 0; },

    /** A fall or a freeze (main.js wires `player:fell`/`nerves.frozen`) – no partial credit. */
    onFall() { snapToBase(); },

    /** js/game/clip-meter.js: a clean (fast) re-clip is rewarded directly, no build-up required. */
    creditCleanClip() { value = Math.min(FLOW.max, value + FLOW.cleanClipBonus); },

    /**
     * One fixed step.
     * @param {number} dt seconds
     * @param {{ progressing: boolean, frozen: boolean, nervesValue: number }} ctx `progressing` = on an
     *   element/zipline/tarzan and actually crossing it; everything else (ground, ladder, standing on a
     *   platform) pauses instead of building.
     * @returns {number} the flow value after the step
     */
    update(dt, ctx) {
      if (!(dt > 0)) return value;
      if (ctx.frozen) {
        snapToBase();
      } else if (ctx.progressing && ctx.nervesValue < FLOW.nervesCeiling) {
        pauseSeconds = 0;
        cleanSeconds += dt;
        if (cleanSeconds > FLOW.cleanHoldSeconds) value = Math.min(FLOW.max, value + FLOW.buildRate * dt);
      } else {
        cleanSeconds = 0;
        pauseSeconds += dt;
        if (pauseSeconds > FLOW.pauseGraceSeconds) value = Math.max(FLOW.min, value - ((FLOW.max - FLOW.min) / FLOW.decaySeconds) * dt);
      }
      weightedSum += value * dt;
      sampledSeconds += dt;
      return clamp(value, FLOW.min, FLOW.max);
    },
  };
}

/**
 * Per-run score shown on the stamp card (ROADMAP M2a): kept deliberately simple – obstacles crossed
 * times the average flow multiplier during the crossing, rounded to a whole number. Documented here
 * rather than derived from anything fancier because there is no real-world "score" to calibrate
 * against (GDD's HUD mockup shows a flow multiplier, not a point total).
 * @param {number} obstaclesCrossed
 * @param {number} averageFlow
 */
export function computeFlowScore(obstaclesCrossed, averageFlow) {
  return Math.round(Math.max(0, obstaclesCrossed) * Math.max(FLOW.min, averageFlow));
}
