// Nerves – the psychological axis of GDD §3.1 and the actual opponent of the game. Pure logic,
// unit-tested (tests/unit/nerves.test.mjs). No bar in the HUD: this value drives a heartbeat, a
// camera that breathes, hands that tremble and, at the very top, a body that will not move.
//
// Rises with height (logarithmic – the first five metres cost more than the next five), with being
// exposed (nothing to hold), with how much the element is swinging, with gusts, with looking down
// and simply with time spent out there. Falls on a platform, while breathing (R held, standing
// still), on hand contact and on the ground. Every completed element and every harmless fall adds
// *trust*, which dampens every future rise – "I can trust the harness" as progression without a menu.
//
// Above `freezeThreshold` the climber freezes and only three deliberate breaths get them going again.

import { NERVES } from "./tuning.js";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const LEVEL_NAMES = Object.freeze(["calm", "tense", "scared", "frozen"]);

/**
 * @param {{ config?: typeof NERVES, value?: number, trust?: number }} [options]
 * @returns {object} see the getters below; `update(dt, context)` is the only thing the game calls
 *   per step, plus `completeElement()` / `survivedFall()` for the trust bonuses.
 */
export function createNerves({ config = NERVES, value = 0, trust = 0 } = {}) {
  const C = config;
  const logSpan = Math.log1p(C.heightMax / C.heightReference);
  let level = clamp01(value);
  let trustValue = clamp01(trust);
  let frozen = false;
  let breathProgress = 0;
  let breaths = 0;

  /** 0 at the ground, 1 at `heightMax` – logarithmic, so low platforms already feel like something. */
  const heightTerm = (height) => clamp01(Math.log1p(Math.max(0, height) / C.heightReference) / logSpan);

  function riseRate(ctx) {
    const rise = C.heightGain * heightTerm(ctx.height || 0)
      + C.exposureGain * clamp01(ctx.exposure || 0)
      + C.wobbleGain * clamp01(ctx.wobble || 0)
      + C.gustGain * clamp01(ctx.gust || 0)
      + C.lookDownGain * clamp01(ctx.lookDown || 0)
      + (ctx.onElement ? C.elementGain : 0);
    return rise * (1 - C.trustGain * trustValue);
  }

  function fallRate(ctx) {
    let fall = C.handRelief * Math.max(0, ctx.handContact || 0);
    if (ctx.breathing) fall += C.breathRelief;
    if (ctx.onPlatform) fall += C.platformRelief;
    if (ctx.onGround) fall += C.groundRelief;
    return fall;
  }

  /** Deliberate breathing: three of them release the freeze, each one takes a bite out of the value. */
  function breathe(dt) {
    breathProgress += dt / C.breathSeconds;
    while (breathProgress >= 1) {
      breathProgress -= 1;
      breaths += 1;
      level = clamp01(level - C.breathRelief * C.breathSeconds);
      if (frozen && breaths >= C.breathsToRelease) {
        frozen = false;
        breaths = 0;
        level = Math.min(level, C.freezeRelease);
      }
    }
  }

  const api = {
    get value() { return level; },
    get trust() { return trustValue; },
    /** "calm" | "tense" | "scared" | "frozen" – for HUD colouring and audio filtering. */
    get level() {
      if (frozen) return "frozen";
      for (let i = 0; i < C.levels.length; i++) if (level < C.levels[i]) return LEVEL_NAMES[i];
      return LEVEL_NAMES[LEVEL_NAMES.length - 1];
    },
    /** True while the body refuses to move – the climber has to breathe through it. */
    get frozen() { return frozen; },
    get breaths() { return breaths; },
    get breathProgress() { return breathProgress; },
    /** Beats per minute – drives the heartbeat sound and the HUD pulse. */
    get heartRate() { return C.heartRateCalm + (C.heartRateMax - C.heartRateCalm) * Math.pow(level, 1.2); },
    /** Balance noise in rad/s² that trembling hands add at this nerve level. */
    get tremor() { return C.tremorGain * level * level; },
    /** Radians of camera breathing sway at this nerve level. */
    get cameraSway() { return C.cameraSwayGain * level; },
    config: C,

    /**
     * One fixed step.
     * @param {number} dt seconds
     * @param {{ height?: number, exposure?: number, wobble?: number, gust?: number, lookDown?: number,
     *   handContact?: number, onElement?: boolean, onPlatform?: boolean, onGround?: boolean,
     *   breathing?: boolean }} [ctx] `height` in metres above the ground below the climber.
     * @returns {number} the nerve value after the step
     */
    update(dt, ctx = {}) {
      if (!(dt > 0)) return level;
      if (ctx.breathing) breathe(dt);
      else if (!frozen) breathProgress = 0;
      level = clamp01(level + (riseRate(ctx) - fallRate(ctx)) * dt);
      if (!frozen && level >= C.freezeThreshold) {
        frozen = true;
        breaths = 0;
        breathProgress = 0;
      }
      return level;
    },

    /** An element behind you: trust up, nerves down a notch. */
    completeElement() {
      trustValue = clamp01(trustValue + C.trustPerElement);
      level = clamp01(level - C.platformRelief);
      return trustValue;
    },

    /** A fall that hurt nothing teaches the same lesson, more slowly. */
    survivedFall() {
      trustValue = clamp01(trustValue + C.trustPerFall);
      return trustValue;
    },

    /** Jolt the value (a slip, a gust that catches the bridge). */
    shock(amount) {
      level = clamp01(level + amount);
      if (!frozen && level >= C.freezeThreshold) { frozen = true; breaths = 0; breathProgress = 0; }
      return level;
    },

    reset(startValue = 0, keepTrust = true) {
      level = clamp01(startValue);
      if (!keepTrust) trustValue = 0;
      frozen = false;
      breaths = 0;
      breathProgress = 0;
    },
  };
  return api;
}
