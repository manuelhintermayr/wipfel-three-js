// Arm strength – the reserve of GDD §3.1. Pure logic, unit-tested (tests/unit/stamina.test.mjs).
//
// One number, 0..1. Gripping a hand cable, hanging in the harness, hauling along the lifeline and
// pulling yourself back up all cost; a platform fills the reserve back up, standing still on an
// element trickles it back. At zero the hands open by themselves – the climber cannot hold on and
// cannot pull up until the reserve is back above `recoverThreshold`, which is what makes running
// out of strength a decision point instead of a soft cap.

import { STAMINA } from "./tuning.js";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * @param {{ config?: typeof STAMINA, value?: number }} [options]
 * @returns {{ value: number, isEmpty: boolean, canGrip: boolean, config: object,
 *   update(dt: number, load?: object): number, spend(amount: number): boolean,
 *   drain(rate: number, dt: number): number, reset(value?: number): void }}
 */
export function createStamina({ config = STAMINA, value = 1 } = {}) {
  const C = config;
  let reserve = clamp01(value);
  let exhausted = reserve <= 0;      // starting empty means starting with the hands open

  /** Fraction per second the current load costs (negative = the reserve fills). */
  function rateOf(load) {
    if (load.hanging) {
      return C.hangDrain + (load.hauling ? C.haulDrain : 0) + (load.pullingUp ? C.pullUpDrain : 0);
    }
    if (load.onPlatform) return -C.regenPlatform;
    if (load.onElement) {
      const hands = exhausted ? 0 : Math.max(0, load.hands || 0);
      const cost = C.elementDrain + C.gripDrain * hands + (load.extraDrain || 0);
      const rest = load.moving ? C.regenMoving : C.regenStanding;
      return cost - (hands > 0 ? 0 : rest);
    }
    return -C.regenPlatform * (load.moving ? 0.5 : 1);           // on the ground: recover fast
  }

  const api = {
    get value() { return reserve; },
    get isEmpty() { return reserve <= 0; },
    /** False while the hands are forced open after running out – they need a moment back. */
    get canGrip() { return !exhausted; },
    get exhausted() { return exhausted; },
    config: C,

    /**
     * One fixed step.
     * @param {number} dt seconds
     * @param {{ onPlatform?: boolean, onElement?: boolean, hanging?: boolean, hauling?: boolean,
     *   pullingUp?: boolean, moving?: boolean, hands?: number, extraDrain?: number }} [load]
     *   `extraDrain` is the element's own cost (a cargo net is hard work, a wire bridge is not).
     * @returns {number} the reserve after the step
     */
    update(dt, load = {}) {
      if (!(dt > 0)) return reserve;
      reserve = clamp01(reserve - rateOf(load) * dt);
      if (reserve <= 0) exhausted = true;
      else if (exhausted && reserve >= C.recoverThreshold) exhausted = false;
      return reserve;
    },

    /**
     * Take a one-off chunk (starting a pull-up). Fails – and takes nothing – when it is not there.
     * @returns {boolean} true when the climber could pay
     */
    spend(amount) {
      if (amount <= 0) return true;
      if (reserve < amount) return false;
      reserve = clamp01(reserve - amount);
      if (reserve <= 0) exhausted = true;
      return true;
    },

    /** Continuous cost outside the standard loads; returns the reserve. */
    drain(rate, dt) {
      reserve = clamp01(reserve - rate * dt);
      if (reserve <= 0) exhausted = true;
      return reserve;
    },

    reset(startValue = 1) {
      reserve = clamp01(startValue);
      exhausted = reserve <= 0;
    },
  };
  return api;
}
