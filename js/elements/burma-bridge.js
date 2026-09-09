// Burma bridge – one 12 mm foot cable and two hand cables about 1.1 m higher, the classic wire
// bridge of every climbing park (RESEARCH-DATA §3: "Burma = 1 foot cable + 2 hand cables"). The hand
// cables fan out towards midspan and are tied down to the foot cable with hemp stirrups, so the
// whole thing is one triangular system that walks away sideways the moment you hurry.
//
// Movement problem (GDD §3.4, rope bridges · 2·3·3·1): the lateral swing builds up with speed, so
// the answer is rhythm – walk, stand, walk. Holding on kills the swing and costs strength.

import { createElementBase, registerElementKind, ELEMENT } from "./element.js";
import { cableRun, cableTermination, ropeStrand, lifelineCable } from "./element-parts.js";

export const BURMA = Object.freeze({
  footRadius: 0.006,         // 12 mm wire rope
  handRadius: 0.006,
  handHeight: 1.32,          // hand cables above the foot cable – chest height, as in the photos
  handSpread: 0.46,          // half-distance of the hand cables at midspan
  handSag: 0.10,             // the hand cables hang more than the loaded foot cable
  stirrupSpacing: 1.15,      // hemp ties from hand cable down to the foot cable
  stirrupRadius: 0.009,
  sagRatio: 0.02,            // 2 % of the span (RESEARCH-DATA §6)
  walkSpeed: 0.60,           // m/s – a wire is crossed at a deliberate pace, never strolled
  slipAngle: 0.40,           // radians ≈ 23°
  staminaDrain: 0.0,         // the wire itself is not hard work – the hands are
  lifelineHeight: ELEMENT.lifelineHeight,
  lifelineSag: 0.05,
  standBack: 0.5,
  metrics: Object.freeze({ physical: 2, coordination: 3, psychological: 3, technical: 1 }),
  wobble: Object.freeze({
    lateralHz: 0.38, verticalHz: 1.15, lateralDamping: 0.085, verticalDamping: 0.20,
    maxLateral: 0.44, maxVertical: 0.13, verticalRatio: 0.40,
  }),
});

/**
 * @param {object} spec see `createElementBase`
 * @param {{ scene, physics, rng, timber, wind }} ctx
 * @returns {object} element
 */
export function createBurmaBridge(spec, ctx) {
  const element = createElementBase(spec, ctx, {
    config: BURMA,
    metrics: BURMA.metrics,
    handHold: { available: true, heightAboveFoot: BURMA.handHeight, side: "both" },
    build: (builder, frame, el) => buildBridge(builder, frame, el, ctx),
  });
  return element;
}

registerElementKind("burma-bridge", createBurmaBridge);

/**
 * Static hardware first (lifeline, terminations), then everything that swings. `element.config.
 * handSpread` (default `BURMA.handSpread`, M2b's "burma-narrow" variant tightens it) is read fresh here
 * instead of the frozen `BURMA` constant, since that is the one dimension a narrower-bridge variant
 * actually needs to change at build time.
 */
function buildBridge(builder, frame, element, ctx) {
  const L = frame.length;
  const rise = frame.rise;
  const handSpread = element.config.handSpread;
  // `element.config.sag` is already `sagRatio × span` – createElementBase works it out per span.

  lifelineCable(builder, frame, element);
  for (const [x, dir] of [[0, 1], [L, -1]]) {
    const y = dir > 0 ? 0 : rise;
    cableTermination(builder, { at: { x, y, z: 0 }, along: { x: dir, y: 0, z: 0 }, radius: BURMA.footRadius });
    for (const side of [-1, 1]) {
      cableTermination(builder, {
        at: { x, y: y + BURMA.handHeight, z: 0 }, along: { x: dir, y: 0, z: side * 0.25 }, radius: BURMA.handRadius,
      });
    }
  }
  const statics = builder.build(`${element.id}-fixed`);

  const foot = cableRun(builder, {
    from: { x: 0, y: 0, z: 0 }, to: { x: L, y: rise, z: 0 },
    sag: element.config.sag, radius: BURMA.footRadius, material: "steel",
  });
  const hands = [];
  for (const side of [-1, 1]) {
    hands.push(cableRun(builder, {
      from: { x: 0, y: BURMA.handHeight, z: 0 }, to: { x: L, y: rise + BURMA.handHeight, z: 0 },
      sag: BURMA.handSag, spread: side * handSpread, radius: BURMA.handRadius, material: "steel",
    }));
  }
  buildStirrups(builder, { length: L, rise, sag: element.config.sag, rng: ctx.rng, handSpread });
  const swinging = builder.build(`${element.id}-span`);

  const shape = (u) => Math.sin(Math.PI * Math.max(0, Math.min(1, u)));
  return {
    groups: [statics, swinging],
    swing: {
      meshes: swinging.children.filter((c) => c.isMesh),
      groupCount: 1,
      classify: (x) => ({ u: x / L, group: 0, weight: shape(x / L) }),
    },
    cables: { foot, hands },
  };
}

/**
 * The hemp stirrups that tie the hand cables down to the foot cable. Without them the hand cables
 * would be two independent lines; with them the bridge reads as one woven system.
 */
function buildStirrups(builder, { length, rise, sag, rng, handSpread }) {
  const count = Math.max(2, Math.round(length / BURMA.stirrupSpacing) - 1);
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const bow = 4 * t * (1 - t);
    const x = t * length;
    const footY = rise * t - sag * bow;
    const handY = rise * t + BURMA.handHeight - BURMA.handSag * bow;
    for (const side of [-1, 1]) {
      ropeStrand(builder, {
        from: { x, y: handY, z: side * handSpread * bow },
        to: { x: x + rng.float(-0.02, 0.02), y: footY, z: side * 0.035 },
        radius: BURMA.stirrupRadius, material: "cord",
      });
    }
  }
}
