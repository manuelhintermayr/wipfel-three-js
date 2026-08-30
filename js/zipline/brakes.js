// The braking net at the end of a Flying Fox (RESEARCH-DATA §6: "Auffangnetz (Beine anziehen)").
// Pure logic, no THREE – the geometry lives in js/elements/zipline.js, the ride in
// js/player/on-zipline.js.
//
// The rule the park teaches with one sentence and the game teaches with one key: **legs up before
// the net.** A red-and-white sleeve on the cable marks where the zone starts, and whether the legs
// are up *at that moment* is the whole decision – it is latched there, exactly like the real thing:
// once the net has your ankles, changing your mind is not an option.
//
//   legs up   → the weighted panel slides along with you and bleeds the speed off smoothly, so you
//               arrive at walking pace and put your feet on the deck ("clean")
//   legs down → the panel snags the feet: an immediate jolt and a harder, uglier deceleration
//               ("messy"). Slow riders end up hanging in the net and have to haul themselves in.

export const ZIP_BRAKE = Object.freeze({
  zoneLength: 6.0,           // metres of cable the braking net covers
  netOffset: 0.9,            // where the panel itself hangs, measured from the zone start
  arriveSpeed: 0.55,         // m/s a clean arrival still carries when the feet touch the deck
  maxDecel: 5.5,             // m/s² (0.56 g) – what the panel is sized for, so even the fastest
                             //       rider on this line still gets a clean arrival
  // Legs down: the net grabs the ankles instead of sliding along with the rider. Tuned so every
  // size class still reaches the deck – hard, and at a speed you feel – while a rider who was
  // already slow ends up hanging in the mesh and has to haul themselves the last metres.
  messyDecel: 1.70,
  messyJolt: 0.60,           // m/s taken away the instant the feet snag
});

/**
 * @param {{ length: number, zoneLength?: number, arriveSpeed?: number, maxDecel?: number,
 *   messyDecel?: number, messyJolt?: number }} options `length` = arc length of the cable
 * @returns {{ zoneStart: number, netAt: number, outcome: "clean"|"messy"|null, legsUpAtEntry: boolean,
 *   inZone(s: number, zoneScale?: number): boolean,
 *   apply(dt: number, s: number, v: number, legsUp: boolean, zoneScale?: number): number,
 *   reset(): void }}
 */
export function createNetBrake({ length, ...config }) {
  const C = { ...ZIP_BRAKE, ...config };
  const zoneStart = Math.max(0, length - C.zoneLength);
  let outcome = null;
  let jolted = false;

  /**
   * The "fast trolley" sidegrade (M2a, js/player/sidegrade.js#SIDEGRADES.trolley) makes the brake
   * window 20% narrower – the *decision* point (where legs-up-or-not gets latched) moves closer to the
   * end of the cable, giving less cable to shed the sidegrade's own extra speed on. The net panel's own
   * rest position/geometry (`netAt`, built once in js/elements/zipline.js) is left exactly where it
   * is – a small, documented seam between "how far the marker sleeve visually sits" and "where the
   * ride actually decides", acceptable because the zone is only ever a few metres of a much longer ride.
   */
  function effectiveZoneStart(zoneScale = 1) { return length - (length - zoneStart) * zoneScale; }

  const brake = {
    /** Arc position where the marker sleeve sits and where the decision is latched (`zoneScale` 1). */
    zoneStart,
    /** Arc position of the net panel itself – what the rider actually sees coming. */
    netAt: Math.min(length, zoneStart + C.netOffset),
    /** "clean" | "messy" once the rider has entered the zone, null before. */
    get outcome() { return outcome; },
    get legsUpAtEntry() { return outcome === "clean"; },

    inZone(s, zoneScale = 1) { return s >= effectiveZoneStart(zoneScale); },

    /**
     * Speed after `dt` seconds of braking. Outside the zone the speed is handed straight back, so
     * the caller can call this every step without asking where it is.
     * @returns {number} the new speed in m/s
     */
    apply(dt, s, v, legsUp, zoneScale = 1) {
      const start = effectiveZoneStart(zoneScale);
      if (s < start || !(dt > 0)) return v;
      if (outcome === null) outcome = legsUp ? "clean" : "messy";
      let speed = v;
      if (outcome === "messy") {
        if (!jolted) { jolted = true; speed = Math.max(0, speed - C.messyJolt); }
        return Math.max(0, speed - C.messyDecel * dt);
      }
      // Clean: aim at `arriveSpeed` exactly at the end of the cable. Recomputing the profile every
      // step makes it self-correcting – wind or a tuck cannot spoil the arrival.
      const remaining = Math.max(0.15, length - s);
      const wanted = (speed * speed - C.arriveSpeed * C.arriveSpeed) / (2 * remaining);
      return Math.max(C.arriveSpeed, speed - Math.min(Math.max(0, wanted), C.maxDecel) * dt);
    },

    reset() { outcome = null; jolted = false; },
  };
  return brake;
}
