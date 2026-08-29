// Balancierbalken – one debarked round log, Ø 20 cm, bolted rigid between two platforms with a
// slight camber. There is nothing to hold on to: no hand cable, no rope, only the log and the
// lifeline 2 m overhead that you can never reach without letting go of your balance.
//
// Movement problem (GDD §3.4, "Balken, Planken, Trittholz"): the beam does not move, so every
// correction has to come from the body. Coordination 3, psychological 4 – it is easy and it is
// frightening, which is exactly why every park has one.

import { createElementBase, registerElementKind, ELEMENT } from "./element.js";
import { cableTermination, lifelineCable } from "./element-parts.js";

export const BEAM_FIXED = Object.freeze({
  logRadius: 0.10,           // Ø 20 cm round timber (RESEARCH-DATA §3 Designannahmen)
  segments: 9,               // the camber is drawn as a short chain of straight logs
  camberRatio: -0.015,       // NEGATIVE sag = the beam bows *up* in the middle, as a laid log does
  bracketLength: 0.34,
  collarRadius: 0.055,
  walkSpeed: 0.55,           // m/s – nobody strolls a round log
  slipAngle: 0.30,           // radians ≈ 17°: narrower than a wire bridge because the hands are free
  staminaDrain: 0.004,
  lifelineHeight: ELEMENT.lifelineHeight,
  lifelineSag: 0.05,
  standBack: 0.45,
  sagRatio: -0.015,
  shape: "flat",
  windGain: 0.06,
  metrics: Object.freeze({ physical: 1, coordination: 3, psychological: 4, technical: 1 }),
  wobble: Object.freeze({
    lateralHz: 1.10, verticalHz: 2.20, lateralDamping: 0.55, verticalDamping: 0.60,
    maxLateral: 0.035, maxVertical: 0.02, verticalRatio: 0.20,
  }),
});

/**
 * @param {object} spec see `createElementBase`
 * @param {{ scene, physics, rng, timber, wind }} ctx
 * @returns {object} element
 */
export function createBeamFixed(spec, ctx) {
  return createElementBase(spec, ctx, {
    config: BEAM_FIXED,
    metrics: BEAM_FIXED.metrics,
    // the whole point of a balance beam: there is nothing up there for the hands
    handHold: { available: false, heightAboveFoot: 0, side: "none" },
    build: (builder, frame, el) => buildBeam(builder, frame, el, ctx),
  });
}

registerElementKind("beam-fixed", createBeamFixed);

/** A chain of short logs along the camber, a steel collar at each end, and the lifeline above. */
function buildBeam(builder, frame, element, ctx) {
  const L = frame.length;
  const camber = element.config.sag;                          // negative → rises at midspan
  const y = (u) => frame.rise * u - camber * 4 * u * (1 - u);

  lifelineCable(builder, frame, element);
  for (const [x, dir] of [[0, 1], [L, -1]]) {
    const top = dir > 0 ? 0 : frame.rise;
    builder.cylinderBetween({                                 // bearing collar onto the platform frame
      from: { x, y: top - BEAM_FIXED.logRadius, z: 0 },
      to: { x: x + dir * BEAM_FIXED.bracketLength, y: top - BEAM_FIXED.logRadius, z: 0 },
      radius: BEAM_FIXED.collarRadius, segments: 10, material: "steel",
    });
    cableTermination(builder, { at: { x, y: top + 0.02, z: 0 }, along: { x: dir, y: 0, z: 0 }, radius: 0.008 });
  }

  for (let i = 0; i < BEAM_FIXED.segments; i++) {
    const u0 = i / BEAM_FIXED.segments, u1 = (i + 1) / BEAM_FIXED.segments;
    builder.cylinderBetween({
      from: { x: u0 * L, y: y(u0) - BEAM_FIXED.logRadius, z: 0 },
      to: { x: u1 * L, y: y(u1) - BEAM_FIXED.logRadius, z: 0 },
      radius: BEAM_FIXED.logRadius * ctx.rng.float(0.97, 1.03), segments: 12, material: "log",
    });
  }
  const beam = builder.build(`${element.id}-beam`);
  // a bolted beam does not swing: no deformer group at all, which also saves a per-frame rewrite
  return { groups: [beam] };
}
