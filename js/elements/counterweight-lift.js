// Counterweight lift (ROADMAP M4, GDD §3.11 "co-op obstacles"): a wooden basket that rides a pair of
// overhead guide cables from one platform to the next. Alone, a preloaded sandbag on the far side of
// the pulley gives just enough of a trickle to inch across (RESEARCH-DATA §8's "real parks forbid two
// people on one obstacle, the game allows it if the group enables it" reads the other way around here –
// a *helper* is the optional part, not the obstacle itself). With a partner hauling the return rope from
// the platform, the basket picks up real speed.
//
// Movement problem: none of the balance family at all (the basket does the standing for you – GDD
// §3.4's own "nets, tubes · no balance, but strength and slowness" family, minus even the
// strength cost) – the whole obstacle is about *pace*, and pace is a co-op decision.
import { createElementBase, registerElementKind, ELEMENT } from "./element.js";
import { cableRun, cableTermination, lifelineCable } from "./element-parts.js";
import { COOP_ELEMENTS } from "../config.js";
import { decayHaulCharge, addHaulCharge, counterweightSpeed } from "../game/coop-elements.js";

export const COUNTERWEIGHT_LIFT = Object.freeze({
  basketWidth: 0.72,
  basketDepth: 0.62,
  basketHeight: 0.46,
  basketThickness: 0.035,
  guideHeight: 1.95,        // overhead guide cables above the walking line
  guideSpread: 0.30,
  hangRopeRadius: 0.010,
  cableRadius: 0.006,
  drumRadius: 0.075,        // the haul winch at the entry post
  drumLength: 0.22,
  sagRatio: 0.008,          // the guide cables themselves barely sag – the basket does the moving
  slipAngle: 1.4,           // effectively unfalloffable – you are standing in a box, not on a rail
  staminaDrain: 0,          // riding costs nothing; only the *hauling* partner spends effort (GDD)
  lifelineHeight: ELEMENT.lifelineHeight,
  lifelineSag: 0.04,
  standBack: 0.45,
  metrics: Object.freeze({ physical: 2, coordination: 2, psychological: 2, technical: 3 }),
  wobble: Object.freeze({
    lateralHz: 0.34, verticalHz: 0.8, lateralDamping: 0.30, verticalDamping: 0.40,
    maxLateral: 0.05, maxVertical: 0.06, verticalRatio: 0.6,
  }),
});

/**
 * @param {object} spec see `createElementBase`
 * @param {{ scene, physics, rng, timber, wind }} ctx
 * @returns {object} element – additionally exposes `addHaulPower(metresPerSecond)`
 */
export function createCounterweightLift(spec, ctx) {
  const C = COOP_ELEMENTS.counterweightLift;
  let haulCharge = 0;   // m/s of bonus speed on top of the self-haul floor, decays without fresh taps

  const element = createElementBase(spec, ctx, {
    config: COUNTERWEIGHT_LIFT,
    metrics: COUNTERWEIGHT_LIFT.metrics,
    handHold: { available: true, heightAboveFoot: COUNTERWEIGHT_LIFT.guideHeight, side: "both" },
    build: (builder, frame, el) => buildLift(builder, frame, el, ctx),
    /**
     * `walkSpeed` is read fresh every fixed step by js/player/on-element.js's own `walk()` – mutating it
     * here (rather than exposing a getter the base class would have to special-case) is enough for the
     * self-haul floor / haul-tap boost to actually change how fast the ride goes, solo or in co-op.
     */
    update: (dt) => {
      haulCharge = decayHaulCharge(haulCharge, dt, C);
      element.walkSpeed = counterweightSpeed(haulCharge, C);
    },
  });

  element.discrete = false;
  // M4 (GDD §3.11, js/game/occupancy.js): the rider plus a helper hauling from the platform – never two
  // riders in the one basket (see js/game/coop.js's own comment on why the helper stays in "ground" mode).
  element.occupancyCapacity = 2;
  /**
   * js/game/coop.js: one W-tap from the helper standing at the entry platform. Solo play (or co-op with
   * nobody hauling) never calls this – the ride still completes at `C.selfHaulSpeed` alone.
   * @param {number} amountMetresPerSecond
   */
  element.addHaulPower = function addHaulPower(amountMetresPerSecond) {
    haulCharge = addHaulCharge(haulCharge, amountMetresPerSecond, C);
  };
  return element;
}

registerElementKind("counterweight-lift", createCounterweightLift);

function buildLift(builder, frame, element, ctx) {
  const L = frame.length;
  const C = COUNTERWEIGHT_LIFT;

  // --- static: lifeline, the two guide cables and their terminations, the entry-side winch -----------
  lifelineCable(builder, frame, element);
  for (const side of [-1, 1]) {
    cableRun(builder, {
      from: { x: 0, y: C.guideHeight, z: side * C.guideSpread },
      to: { x: L, y: frame.rise + C.guideHeight, z: side * C.guideSpread },
      sag: element.config.sag, radius: C.cableRadius, material: "steel",
    });
    for (const [x, dir] of [[0, 1], [L, -1]]) {
      cableTermination(builder, {
        at: { x, y: (dir > 0 ? 0 : frame.rise) + C.guideHeight, z: side * C.guideSpread },
        along: { x: dir, y: 0, z: 0 }, radius: C.cableRadius,
      });
    }
  }
  // The haul winch: a horizontal drum on a post at the entry, plus a crank handle – the prop that tells
  // a helper standing there "this is what you turn" without needing its own catalogue entry.
  builder.cylinderBetween({
    from: { x: 0.34, y: 1.05, z: -C.drumLength / 2 }, to: { x: 0.34, y: 1.05, z: C.drumLength / 2 },
    radius: C.drumRadius, segments: 14, material: "log",
  });
  builder.cylinderBetween({ from: { x: 0.34, y: 0, z: 0 }, to: { x: 0.34, y: 1.05 - C.drumRadius, z: 0 }, radius: 0.035, segments: 8, material: "log" });
  builder.cylinderBetween({
    from: { x: 0.34, y: 1.05, z: C.drumLength / 2 }, to: { x: 0.34 + 0.16, y: 1.05 + 0.10, z: C.drumLength / 2 + 0.02 },
    radius: 0.014, segments: 6, material: "steel",
  });
  const statics = builder.build(`${element.id}-fixed`);

  // --- swinging: the basket itself, hung from the guide cables on four corner ropes -------------------
  const y = 0;   // local frame origin already sits at the entry walking-line height
  builder.box({
    length: C.basketDepth, width: C.basketWidth, thickness: C.basketThickness,
    position: { x: 0, y: y - C.basketThickness / 2, z: 0 }, material: "weathered",
  });
  for (const side of [-1, 1]) {
    builder.box({
      length: C.basketDepth, width: C.basketThickness, thickness: C.basketHeight,
      position: { x: 0, y: y + C.basketHeight / 2, z: side * (C.basketWidth / 2 - C.basketThickness / 2) },
      material: "weathered",
    });
  }
  for (const side of [-1, 1]) {
    builder.box({
      length: C.basketThickness, width: C.basketWidth - 2 * C.basketThickness, thickness: C.basketHeight * 0.55,
      position: { x: side * (C.basketDepth / 2 - C.basketThickness / 2), y: y + C.basketHeight * 0.275, z: 0 },
      material: "weathered",
    });
  }
  for (const cx of [-1, 1]) {
    for (const cz of [-1, 1]) {
      builder.cylinderBetween({
        from: { x: cx * (C.basketDepth / 2 - 0.05), y: C.guideHeight - 0.03, z: cz * C.guideSpread },
        to: { x: cx * (C.basketDepth / 2 - 0.05), y: y + C.basketHeight, z: cz * (C.basketWidth / 2 - 0.05) },
        radius: C.hangRopeRadius, segments: 6, material: "cord",
      });
    }
  }
  const basket = builder.build(`${element.id}-basket`);

  return {
    groups: [statics, basket],
    // One swinging group (the whole basket) – js/elements/element.js's default `displace`/`shapeAt`
    // (a gentle whole-span arch, this kind's own `wobble` config keeps it barely perceptible) is enough,
    // so no custom `offsetAt`/`displace`/`shape` is passed to `createElementBase` above.
    swing: { meshes: basket.children.filter((c) => c.isMesh), groupCount: 1, classify: (x) => ({ u: x / L, group: 0, weight: 1 }) },
  };
}
