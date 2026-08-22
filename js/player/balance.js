// The balance pendulum – the momentary resource of GDD §3.1. Pure logic: no three.js, no DOM, no
// randomness of its own, so it can be unit-tested (tests/unit/balance.test.mjs) and reused by NPCs.
//
// Model: the climber's centre of gravity above the foot line as an *unstable* pendulum. Upright is
// an equilibrium you fall away from (`topple`), which is why standing on a wire is work. Three
// things fight it: leaning against the tilt (`input.move.x`), a hand on a hold (strong stiffness and
// damping, paid for in stamina) and body damping. Anything the element does – sway, a plank swinging
// back, a gust – arrives as `drive` in rad/s².
//
// Sign convention: angle > 0 = tipping to the climber's right, lean > 0 = weight shifted right.
// Leaning the way you are already falling makes it worse, exactly as it should.

import { BALANCE } from "./tuning.js";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * @param {{ config?: typeof BALANCE }} [options]
 * @returns {{ angle: number, angularVelocity: number, slipped: boolean, config: object,
 *   update(dt: number, input?: object): { angle: number, slipped: boolean, load: number },
 *   excite(angularAcceleration: number): void, nudge(angularVelocity: number): void,
 *   load(slipAngle?: number): number, catchAt(slipAngle?: number): void, reset(angle?: number): void }}
 */
export function createBalance({ config = BALANCE } = {}) {
  const C = config;
  let angle = 0;
  let angularVelocity = 0;
  let impulse = 0;                 // rad/s² queued by excite(), consumed by the next update
  let slipped = false;

  /** How close to letting go the climber is: 0 = upright, 1 = slipping. */
  const loadAt = (slipAngle) => clamp(Math.abs(angle) / Math.max(1e-4, slipAngle), 0, 1);

  const api = {
    get angle() { return angle; },
    get angularVelocity() { return angularVelocity; },
    get slipped() { return slipped; },
    config: C,

    /**
     * One fixed step.
     * @param {number} dt seconds
     * @param {{ lean?: number, hands?: number, speed?: number, drive?: number, noise?: number,
     *   slipAngle?: number, authority?: number }} [input]
     *   `lean` −1..1 stick, `hands` 0..2 hands on a hold, `speed` 0..1 of the element's top speed,
     *   `drive` rad/s² from the element, `noise` rad/s² from nerves, `slipAngle` element threshold.
     * @returns {{ angle, slipped, load }}
     */
    update(dt, input = {}) {
      if (!(dt > 0)) return { angle, slipped, load: loadAt(input.slipAngle || C.slipAngle) };
      const slipAngle = input.slipAngle || C.slipAngle;
      const hands = clamp(input.hands || 0, 0, 2);
      const lean = clamp(input.lean || 0, -1, 1);
      const speed = clamp(input.speed || 0, 0, 1);

      const stiffness = C.topple - C.handStiffness * hands;      // > 0 = unstable, < 0 = held upright
      const damping = C.damping + C.handDamping * hands;
      const authority = (input.authority == null ? 1 : input.authority)
        * C.leanAuthority * (1 - C.leanSpeedPenalty * speed);

      const acceleration = stiffness * angle
        - damping * angularVelocity
        + lean * authority
        + (input.drive || 0) + (input.noise || 0) + impulse;
      impulse = 0;

      angularVelocity = clamp(angularVelocity + acceleration * dt, -C.maxAngularVelocity, C.maxAngularVelocity);
      angle += angularVelocity * dt;

      slipped = Math.abs(angle) > slipAngle;
      if (slipped) angle = Math.sign(angle) * slipAngle;         // the body cannot tip past letting go
      return { angle, slipped, load: loadAt(slipAngle) };
    },

    /** Queue an angular acceleration for the next step (steps, plank kicks, gusts). */
    excite(angularAcceleration) { impulse += angularAcceleration; },

    /** Instant change of the angular velocity (a hard catch, someone bumping the bridge). */
    nudge(dOmega) { angularVelocity = clamp(angularVelocity + dOmega, -C.maxAngularVelocity, C.maxAngularVelocity); },

    load(slipAngle = C.slipAngle) { return loadAt(slipAngle); },

    /** Back on the rail after a fall: upright but not perfectly still. */
    catchAt(slipAngle = C.slipAngle) {
      angle = clamp(angle, -slipAngle, slipAngle) * C.recoverAngle;
      angularVelocity = 0;
      impulse = 0;
      slipped = false;
    },

    reset(startAngle = 0) {
      angle = startAngle;
      angularVelocity = 0;
      impulse = 0;
      slipped = false;
    },
  };
  return api;
}
