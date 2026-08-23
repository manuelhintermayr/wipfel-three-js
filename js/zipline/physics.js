// The analytical Flying Fox (GDD §3.6, RESEARCH-DATA §6): a cable between two anchors, a trolley on
// it, and gravity. Pure logic – no THREE, no scene, no input – so it can be unit-tested and so the
// element (geometry) and the player state (ride) read the *same* curve.
//
// Shape: the loaded cable is drawn as a **parabola**, not a true catenary. For the sag ratios a park
// works with (~2 % of the span, RESEARCH-DATA §6) the two curves differ by well under a centimetre
// over 50 m, and the parabola has closed-form derivatives, which keeps `tangentAt` exact instead of
// numerically differenced. The parabola is hung under the straight chord: y(p) = chordY(p) − 4·S·p(1−p),
// with p the *horizontal* fraction of the span and S the mid-span sag.
//
// Dynamics along the cable, integrated semi-implicitly at the loop's fixed step:
//   dv/dt = g·slope(s) − (dragCoeff/m)·|v − windAlong|·(v − windAlong) − rollResist·g
// `slope(s)` is the downhill component of the unit tangent, so the sag makes the first half steeper
// than the chord and the last half flatter (often slightly uphill) – which is exactly why a real zip
// line that hangs too loose is "fast in the middle and slow at the end".
//
// Mass: heavier riders pull the cable deeper (`sagMassGain`), so their first half is steeper, and
// they carry more momentum per square metre of drag. Both push the same way: heavier = faster.

import { PHYSICS } from "../config.js";

export const ZIP_PHYSICS = Object.freeze({
  sagRatio: 0.020,           // loaded sag ≈ 2 % of the span (RESEARCH-DATA §6)
  refMassKg: 78,             // the size class the sag ratio is quoted for (RULES.sizeClasses "adult")
  sagMassGain: 0.35,         // how much of a relative mass change reaches the sag
  sagScaleMin: 0.75,         // …clamped, a cable does not go slack under a child
  sagScaleMax: 1.30,
  dragCoeff: 0.38,           // ½·ρ·Cd·A for a seated rider with the legs out (kg/m)
  tuckDrag: 0.65,            // multiplier at a full tuck ("Kanonenkugel" vs "Seestern")
  rollResist: 0.012,         // rolling resistance of the trolley, as a fraction of the normal load
  pushSpeed: 1.40,           // m/s the rider gets from pushing off the platform
  haulSpeed: 0.42,           // m/s hand over hand along the cable when stalled
  stallSpeed: 0.06,          // below this and with no drive left the rider is stuck
  samples: 64,               // arc-length table resolution
});

const G = Math.abs(PHYSICS.gravity.y);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * @param {{ start: {x,y,z}, end: {x,y,z}, sagRatio?: number, massKg?: number, dragCoeff?: number,
 *   rollResist?: number, windAlong?: number, samples?: number }} options
 *   `windAlong` is the wind component along the direction of travel in m/s: positive = tailwind.
 * @returns {object} the zip model – see the getters below
 */
export function createZipPhysics(options) {
  const start = { ...options.start };
  const end = { ...options.end };
  const dx = end.x - start.x, dz = end.z - start.z;
  const run = Math.hypot(dx, dz);                    // horizontal span
  const drop = start.y - end.y;                      // positive downhill
  const chord = Math.hypot(run, drop);
  const baseSagRatio = options.sagRatio == null ? ZIP_PHYSICS.sagRatio : options.sagRatio;

  let massKg = options.massKg || ZIP_PHYSICS.refMassKg;
  let dragCoeff = options.dragCoeff == null ? ZIP_PHYSICS.dragCoeff : options.dragCoeff;
  let rollResist = options.rollResist == null ? ZIP_PHYSICS.rollResist : options.rollResist;
  let windAlong = options.windAlong || 0;
  let sag = sagFor(massKg);
  let table = buildArcTable(sag);

  let s = 0, v = 0, maxSpeed = 0, stalled = false;

  /** Mid-span sag in metres. Heavier riders press the cable deeper (RESEARCH-DATA §6). */
  function sagFor(kg) {
    const scale = clamp(1 + ZIP_PHYSICS.sagMassGain * (kg / ZIP_PHYSICS.refMassKg - 1),
      ZIP_PHYSICS.sagScaleMin, ZIP_PHYSICS.sagScaleMax);
    return baseSagRatio * chord * scale;
  }

  /** Cumulative arc length over `samples` horizontal steps – the map between `s` and the parabola. */
  function buildArcTable(sagM) {
    const n = Math.max(8, options.samples || ZIP_PHYSICS.samples);
    const arc = new Float64Array(n + 1);
    let total = 0;
    let prevY = start.y;
    for (let i = 1; i <= n; i++) {
      const p = i / n;
      const y = heightAt(p, sagM);
      total += Math.hypot(run / n, y - prevY);
      arc[i] = total;
      prevY = y;
    }
    return { n, arc, length: total, sag: sagM };
  }

  function heightAt(p, sagM) { return start.y - drop * p - sagM * 4 * p * (1 - p); }

  /** Horizontal fraction for an arc position (linear interpolation inside the table). */
  function fractionAt(distance) {
    const { n, arc, length } = table;
    const d = clamp(distance, 0, length);
    let lo = 0, hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arc[mid] <= d) lo = mid; else hi = mid;
    }
    const span = arc[hi] - arc[lo];
    return (lo + (span > 1e-9 ? (d - arc[lo]) / span : 0)) / n;
  }

  /** Downhill component of the unit tangent at arc position `distance` (positive = accelerating). */
  function slopeAt(distance) {
    const p = fractionAt(distance);
    const dy = -drop - 4 * table.sag * (1 - 2 * p);   // dy/dp
    return -dy / Math.hypot(run, dy);
  }

  /** Acceleration along the cable for a given speed and tuck, in m/s². */
  function accelAt(distance, speed, tuck) {
    const air = speed - windAlong;
    const drag = dragCoeff * (1 - (1 - ZIP_PHYSICS.tuckDrag) * clamp(tuck, 0, 1));
    return G * slopeAt(distance) - (drag / massKg) * Math.abs(air) * air - rollResist * G;
  }

  const zip = {
    /** Arc length of the loaded cable, metres. */
    get length() { return table.length; },
    get chord() { return chord; },
    /** Horizontal span and vertical drop of the chord, metres. */
    get run() { return run; },
    get drop() { return drop; },
    /** Chord gradient as a fraction – the number a park quotes ("3–6 %"). */
    get gradient() { return run > 0 ? drop / run : 0; },
    get sag() { return table.sag; },
    get start() { return start; },
    get end() { return end; },
    get massKg() { return massKg; },
    get windAlong() { return windAlong; },

    /** Arc position of the trolley, 0 … length. */
    get s() { return s; },
    get progress() { return table.length > 0 ? s / table.length : 1; },
    /** Speed along the cable, m/s. */
    get v() { return v; },
    get speedKmh() { return v * 3.6; },
    get maxSpeed() { return maxSpeed; },
    get maxSpeedKmh() { return maxSpeed * 3.6; },
    /** True once the rider has run out of speed short of the end – they have to haul themselves in. */
    get stalled() { return stalled; },
    get done() { return s >= table.length; },

    slopeAt,
    /** Acceleration the rider would feel right now – used by the F1 panel and the tests. */
    accelAt,
    /** Horizontal fraction (0..1) for an arc position – lets the geometry read the same curve. */
    fractionAt,

    /**
     * One fixed step.
     * @param {number} dt seconds
     * @param {{ tuck?: number }} [input] `tuck` 0..1 – knees in, arms down, less drag
     * @returns {{ s: number, v: number, done: boolean, stalled: boolean }}
     */
    update(dt, input = {}) {
      if (!(dt > 0) || zip.done) return zip.state();
      const tuck = input.tuck || 0;
      v = Math.max(0, v + accelAt(s, v, tuck) * dt);
      s = Math.min(table.length, s + v * dt);
      if (v > maxSpeed) maxSpeed = v;
      // Stuck: no speed left and nothing to restart the roll (too flat, or the wind is against).
      stalled = !zip.done && v <= ZIP_PHYSICS.stallSpeed && accelAt(s, 0, tuck) <= 0;
      if (stalled) v = 0;
      return zip.state();
    },

    state() { return { s, v, done: zip.done, stalled }; },

    /** Push off the platform. */
    push(speed = ZIP_PHYSICS.pushSpeed) { v = Math.max(v, speed); stalled = false; return v; },

    /** Hand over hand towards the end when the ride has stalled. Returns the metres gained. */
    haul(dt, speed = ZIP_PHYSICS.haulSpeed) {
      if (!(dt > 0)) return 0;
      const step = Math.min(speed * dt, table.length - s);
      s += step;
      stalled = !zip.done;
      return step;
    },

    /** Brake modules own the speed inside their zone (js/zipline/brakes.js). */
    setSpeed(speed) { v = Math.max(0, speed); },
    setWindAlong(metresPerSecond) { windAlong = metresPerSecond || 0; },
    setMass(kg) {
      massKg = Math.max(1, kg);
      sag = sagFor(massKg);
      table = buildArcTable(sag);
    },

    /** World position on the loaded cable at arc position `distance`. Writes into `out`. */
    pointAt(distance, out = { x: 0, y: 0, z: 0 }) {
      const p = fractionAt(distance);
      out.x = start.x + dx * p;
      out.y = heightAt(p, table.sag);
      out.z = start.z + dz * p;
      return out;
    },

    /** Unit direction of travel at arc position `distance`. Writes into `out`. */
    tangentAt(distance, out = { x: 0, y: 0, z: 0 }) {
      const p = fractionAt(distance);
      const dy = -drop - 4 * table.sag * (1 - 2 * p);
      const inv = 1 / Math.hypot(run, dy);
      out.x = dx * inv;
      out.y = dy * inv;
      out.z = dz * inv;
      return out;
    },

    /** Back to the start of the ride; `options` may change the rider or the wind. */
    reset(o = {}) {
      if (o.massKg != null) zip.setMass(o.massKg);
      if (o.windAlong != null) windAlong = o.windAlong;
      if (o.dragCoeff != null) dragCoeff = o.dragCoeff;
      if (o.rollResist != null) rollResist = o.rollResist;
      s = o.s == null ? 0 : clamp(o.s, 0, table.length);
      v = o.v == null ? 0 : Math.max(0, o.v);
      maxSpeed = v;
      stalled = false;
      return zip;
    },
  };
  return zip;
}
