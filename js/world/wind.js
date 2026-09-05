// Global wind state. One instance per world; its uniform objects are shared by every wind-aware
// shader (foliage cards, tree trunks, later grass and cables) so a single update moves everything.
import * as THREE from "three";

const WIND = Object.freeze({
  minStrength: 0.3,
  maxStrength: 1.0,
  baseLow: 0.32,        // calm baseline
  baseHigh: 0.68,       // baseline during a slow swell
  gustGain: 0.42,       // how much a gust adds on top of the baseline
  swellPeriodSec: 57,   // slow swell of the baseline
  swellPeriod2Sec: 23,
  gustPeriodSec: 17,    // typical spacing between gusts
  gustRipplePeriodSec: 4.3,
  directionWobbleRad: 0.22,
  directionWobblePeriodSec: 41,
});

/**
 * @param {{ rng?: import("../core/rng.js").Rng }} options
 * @returns {{ time:number, strength:number, gust:number, direction:THREE.Vector2,
 *            uniforms:{ uTime:{value:number}, uWindStrength:{value:number}, uWindDir:{value:THREE.Vector2} },
 *            update(dt:number):void }}
 */
export function createWind({ rng } = {}) {
  const r = rng ? rng.fork("wind") : null;
  const rand = (lo, hi) => (r ? r.float(lo, hi) : (lo + hi) / 2);
  // M3b (js/game/operations.js#createOperations): a day's forecast nudges the wind's own baseline –
  // "windy"/"storm" days scale everything up, "clear" scales it down a touch. 1 = no change.
  let dailyBias = 1;

  const baseAngle = rand(0, Math.PI * 2);
  const phaseSwell = rand(0, 100);
  const phaseSwell2 = rand(0, 100);
  const phaseGust = rand(0, 100);
  const phaseRipple = rand(0, 100);
  const phaseDir = rand(0, 100);

  const direction = new THREE.Vector2(Math.cos(baseAngle), Math.sin(baseAngle));
  const uniforms = {
    uTime: { value: 0 },
    uWindStrength: { value: WIND.baseLow },
    uWindDir: { value: direction },
  };

  const wind = {
    time: 0,
    strength: WIND.baseLow,
    gust: 0,
    direction,
    uniforms,
    update(dt) {
      wind.time += dt;
      const t = wind.time;
      const swell = 0.5 + 0.5 * Math.sin((t / WIND.swellPeriodSec) * Math.PI * 2 + phaseSwell);
      const swell2 = 0.5 + 0.5 * Math.sin((t / WIND.swellPeriod2Sec) * Math.PI * 2 + phaseSwell2);
      const base = WIND.baseLow + (WIND.baseHigh - WIND.baseLow) * (0.65 * swell + 0.35 * swell2);
      // Gusts: sharp positive lobes of a slow sine, rippled by a faster one so no two gusts look alike.
      const lobe = Math.max(0, Math.sin((t / WIND.gustPeriodSec) * Math.PI * 2 + phaseGust));
      const ripple = 0.7 + 0.3 * Math.sin((t / WIND.gustRipplePeriodSec) * Math.PI * 2 + phaseRipple);
      wind.gust = lobe * lobe * lobe * ripple;
      wind.strength = THREE.MathUtils.clamp((base + WIND.gustGain * wind.gust) * dailyBias, WIND.minStrength, WIND.maxStrength * 1.6);

      const angle = baseAngle + WIND.directionWobbleRad * Math.sin((t / WIND.directionWobblePeriodSec) * Math.PI * 2 + phaseDir);
      direction.set(Math.cos(angle), Math.sin(angle));

      uniforms.uTime.value = t;
      uniforms.uWindStrength.value = wind.strength;
    },
    /** js/game/operations.js: `bias` multiplies the whole strength/gust computation above (1 = no change,
     *  >1 a windier/stormier day, <1 an unusually calm one). */
    setDailyBias(bias) { dailyBias = Number.isFinite(bias) && bias > 0 ? bias : 1; },
  };
  return wind;
}
