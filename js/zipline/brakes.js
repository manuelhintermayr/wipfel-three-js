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
 * Classic-mode hand brake (RESEARCH-DATA §5/§6, ROADMAP M2b, GDD §3.3: "Flying Fox mit Handbremse
 * (Lederhandschuh hinter der Rolle)"). No net, no latched legs-up/down decision at one instant – the
 * rider grips the cable behind the trolley for however much of the (longer) zone they choose, and the
 * result is a skill check instead of a single well-timed keypress: hold too little and momentum carries
 * you in hot ("messy" – same bucket the net brake already uses for "too fast"); grab hard too early and
 * you bleed off all your speed with metres still to go, and – exactly like a rider too light for the
 * net – you haul yourself the rest of the way by hand.
 */
export const HAND_BRAKE = Object.freeze({
  zoneLength: 12.0,          // metres – twice the net's zone; there is no latch instant to aim for
  fullDecel: 4.6,            // m/s² with a firm, continuous grip the whole zone
  noDecel: 0.15,             // m/s² with the hand off the cable – barely slows the rider at all
  earlyStallDecel: 7.5,      // m/s² once a full grip has ever been taken this early – a hard, early grab
  earlyThreshold: 0.35,      // fraction of the zone (from its start) beyond which gripping counts as "early"
  messyArriveSpeed: 2.4,     // m/s or faster at the cable's end = "messy" (too little braking)
});

/**
 * @param {{ length: number, zoneLength?: number, arriveSpeed?: number, maxDecel?: number,
 *   messyDecel?: number, messyJolt?: number, hand?: Partial<typeof HAND_BRAKE> }} options
 *   `length` = arc length of the cable.
 * @returns {{ zoneStart: number, netAt: number, outcome: "clean"|"messy"|null, legsUpAtEntry: boolean,
 *   inZone(s: number, zoneScale?: number, profile?: "net"|"hand"): boolean,
 *   apply(dt: number, s: number, v: number, engaged: boolean, zoneScale?: number, profile?: "net"|"hand"): number,
 *   reset(): void }}
 *   `profile` (default `"net"`) picks which of the two braking systems is live for this ride – the same
 *   brake object serves both, since only the belay mode active *this ride* decides which one applies
 *   (js/player/on-zipline.js reads `belay.mode` once at `enter()`), never anything baked in at build time.
 */
export function createNetBrake({ length, hand: handOverride, ...config }) {
  const C = { ...ZIP_BRAKE, ...config };
  const H = { ...HAND_BRAKE, ...handOverride };
  const netZoneStart = Math.max(0, length - C.zoneLength);
  const handZoneStart = Math.max(0, length - H.zoneLength);
  let outcome = null;
  let jolted = false;
  let earlyGripLatched = false;   // hand profile: a full grip was ever taken inside `earlyThreshold`

  /**
   * The "fast trolley" sidegrade (M2a, js/player/sidegrade.js#SIDEGRADES.trolley) makes the brake
   * window 20% narrower – the *decision* point (where legs-up-or-not gets latched) moves closer to the
   * end of the cable, giving less cable to shed the sidegrade's own extra speed on. The net panel's own
   * rest position/geometry (`netAt`, built once in js/elements/zipline.js) is left exactly where it
   * is – a small, documented seam between "how far the marker sleeve visually sits" and "where the
   * ride actually decides", acceptable because the zone is only ever a few metres of a much longer ride.
   */
  function effectiveZoneStart(profile, zoneScale = 1) {
    const base = profile === "hand" ? handZoneStart : netZoneStart;
    return length - (length - base) * zoneScale;
  }

  /** Continuous grip strength decides the deceleration; an early full grip stays "harsh" for the rest
   *  of the zone (letting go again does not un-stall you – that would defeat the lesson). */
  function handDecel(engaged, fraction) {
    if (engaged && fraction < H.earlyThreshold) earlyGripLatched = true;
    if (!engaged) return H.noDecel;
    return earlyGripLatched ? H.earlyStallDecel : H.fullDecel;
  }

  const brake = {
    /** Arc position where the marker sleeve sits and where the net's decision is latched (`zoneScale` 1). */
    zoneStart: netZoneStart,
    /** Arc position of the net panel itself – what the rider actually sees coming. */
    netAt: Math.min(length, netZoneStart + C.netOffset),
    /** "clean" | "messy" once the rider has entered the zone, null before. */
    get outcome() { return outcome; },
    get legsUpAtEntry() { return outcome === "clean"; },

    inZone(s, zoneScale = 1, profile = "net") { return s >= effectiveZoneStart(profile, zoneScale); },

    /**
     * Speed after `dt` seconds of braking. Outside the zone the speed is handed straight back, so
     * the caller can call this every step without asking where it is. `engaged` means "legs up" for
     * the net profile and "gripping the cable" for the hand profile.
     * @returns {number} the new speed in m/s
     */
    apply(dt, s, v, engaged, zoneScale = 1, profile = "net") {
      const start = effectiveZoneStart(profile, zoneScale);
      if (s < start || !(dt > 0)) return v;

      if (profile === "hand") {
        const fraction = (s - start) / Math.max(0.01, length - start);
        const speed = Math.max(0, v - handDecel(engaged, fraction) * dt);
        if (outcome === null && s >= length - 0.06) outcome = speed >= H.messyArriveSpeed ? "messy" : "clean";
        // Stalled short of the platform (too early/too hard a grip): the rider needs hauling in exactly
        // like a net-braked rider too light for the net – that is never a "clean" arrival either, and
        // without this the outcome would stay `null` forever (js/player/on-zipline.js#arrive() reads a
        // `null` outcome as clean by default).
        else if (outcome === null && speed <= 0.02 && s < length - 0.06) outcome = "messy";
        return speed;
      }

      if (outcome === null) outcome = engaged ? "clean" : "messy";
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

    reset() { outcome = null; jolted = false; earlyGripLatched = false; },
  };
  return brake;
}
