// Ringe – wooden rings (Ø 22 cm) on short ropes from an overhead cable every ~50 cm: an overhead
// monkey-ring traverse. The climber hangs the whole way across (feet free, nothing underfoot at all),
// hauling from ring to ring one at a time – GDD §3.4 "Hangeln, Ringe, Jakobsleiter · 5·3·4·2":
// strength spent in an alternating rhythm, a missed grab drops you straight into the harness.
//
// Crossed one ring per press of W, exactly like the hanging planks or the stirrups – it shares that
// model with `hanging-steps.js` (its header names "monkey rings" as one of the three intended uses).
// There is no rig pose named "hang" yet, so this reuses `fallPose` (arms up, body hanging) at close to
// full elevation – the closest existing shape to "gripping something overhead and hanging from it".

import { createElementBase, registerElementKind, ELEMENT } from "./element.js";
import { cableRun, cableTermination, ropeStrand, lifelineCable } from "./element-parts.js";
import { createHangingSteps, stepLayout } from "./hanging-steps.js";

export const RINGS = Object.freeze({
  ringRadius: 0.11,          // Ø 22 cm wooden ring
  ringTube: 0.017,
  ropeLength: 0.30,          // short rope from the overhead cable down to the ring
  ropeRadius: 0.009,
  spacing: 0.50,              // a ring every ~50 cm
  endMargin: 0.40,
  hangCableHeight: 2.55,      // the overhead cable itself, well above the rings
  swingHeight: 1.80,          // how far the climber's feet swing above the nominal walking line
  cableRadius: 0.006,
  sagRatio: 0.008,
  swingHz: 0.62,
  swingDamping: 0.12,
  maxSwing: 0.26,
  kickPerStep: 0.75,
  coupling: 0.18,
  walkSpeed: 0.55,             // reference only – rings are crossed by discrete stride, not a stick speed
  slipAngle: 1.4,              // generous: stamina and timing are the real gate here, not tipping
  staminaDrain: 0.065,         // heavy: hanging costs, and every stride costs again on top of that
  lifelineHeight: ELEMENT.lifelineHeight,
  lifelineSag: 0.05,
  standBack: 0.45,
  metrics: Object.freeze({ physical: 5, coordination: 3, psychological: 4, technical: 2 }),
  wobble: Object.freeze({
    lateralHz: 0.50, verticalHz: 1.1, lateralDamping: 0.18, verticalDamping: 0.30,
    maxLateral: 0.20, maxVertical: 0.08, verticalRatio: 0.30,
  }),
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * @param {object} spec see `createElementBase`
 * @param {{ scene, physics, rng, timber, wind }} ctx
 * @returns {object} element – additionally exposes `steps`
 */
export function createRings(spec, ctx) {
  // M2b "rings-far" variant: wider `spacing` must reach the line's own layout math, which runs before
  // `createElementBase` (below) has produced `element.config` – see js/elements/stirrups.js's identical
  // comment for the same reason.
  const cfg = { ...RINGS, ...(spec.configOverride || null) };
  const line = createRingLine(spanOf(spec), cfg);

  const element = createElementBase(spec, ctx, {
    config: RINGS,
    metrics: RINGS.metrics,
    handHold: { available: true, heightAboveFoot: RINGS.swingHeight, side: "overhead" },
    build: (builder, frame, el) => buildRings(builder, frame, el, ctx, line),
    footholdAt: (t, el) => line.nearest(t, el.length),
    update: (dt) => line.update(dt),
    // the whole body hangs `swingHeight` above the nominal walking line – arms overhead, feet free
    offsetAt: (u, out, el) => {
      const hit = line.nearest(clamp01(u), el.length);
      return out.set(0, RINGS.swingHeight + el.wobble.vertical * 0.4, el.wobble.lateral * 0.4 + (hit.step ? hit.step.offset * 0.5 : 0));
    },
    displace: (offsets) => {
      for (const step of line.steps) {
        offsets[step.index * 3] = step.offset * 0.4;            // the ring drifts a little along the walk line …
        offsets[step.index * 3 + 1] = -Math.abs(step.offset) * 0.08;
        offsets[step.index * 3 + 2] = step.offset;               // … and mostly sideways, on its rope
      }
    },
  });

  element.discrete = true;
  element.stepOn = (index, strength, direction) => line.stepOn(index, strength, direction);
  Object.defineProperty(element, "steps", { get: () => line.steps });
  return element;
}

registerElementKind("rings", createRings);

function spanOf(spec) {
  return Math.max(0.5, Math.hypot(spec.exit.position.x - spec.entry.position.x, spec.exit.position.z - spec.entry.position.z));
}

function createRingLine(span, cfg = RINGS) {
  const { count, first, pitch } = stepLayout({ span, spacing: cfg.spacing, endMargin: cfg.endMargin, min: 6, max: 28 });
  return createHangingSteps({
    count, first, pitch,
    swingHz: cfg.swingHz, damping: cfg.swingDamping, maxSwing: cfg.maxSwing,
    kickPerStep: cfg.kickPerStep, coupling: cfg.coupling, readySlack: cfg.ringRadius * 0.6,
  });
}

function buildRings(builder, frame, element, ctx, line) {
  const L = frame.length;
  const top = (x) => frame.rise * (x / L) + RINGS.hangCableHeight;

  // --- static: lifeline, the overhead cable, terminations --------------------------------------------
  lifelineCable(builder, frame, element);
  cableRun(builder, {
    from: { x: 0, y: RINGS.hangCableHeight, z: 0 }, to: { x: L, y: frame.rise + RINGS.hangCableHeight, z: 0 },
    sag: element.config.sag, radius: RINGS.cableRadius, material: "steel",
  });
  for (const [x, dir] of [[0, 1], [L, -1]]) {
    cableTermination(builder, {
      at: { x, y: (dir > 0 ? 0 : frame.rise) + RINGS.hangCableHeight, z: 0 },
      along: { x: dir, y: 0, z: 0 }, radius: RINGS.cableRadius,
    });
  }
  const statics = builder.build(`${element.id}-fixed`);

  // --- swinging: one rope + ring per step -------------------------------------------------------------
  for (const step of line.steps) {
    const x = step.x;
    const ringY = top(x) - RINGS.ropeLength;
    ropeStrand(builder, {
      from: { x, y: top(x) - 0.03, z: 0 },
      to: { x: x + ctx.rng.float(-0.01, 0.01), y: ringY + RINGS.ringTube, z: 0 },
      radius: RINGS.ropeRadius, material: "cord",
    });
    builder.torus({ centre: { x, y: ringY, z: 0 }, radius: RINGS.ringRadius, tube: RINGS.ringTube, segments: 20, material: "weathered" });
  }
  const swinging = builder.build(`${element.id}-rings`);

  const classify = (x, y) => {
    const hit = line.nearest(clamp01(x / L), L);
    const step = hit.step || line.steps[0];
    const anchorY = top(step.x);
    const span = Math.max(0.05, anchorY - (anchorY - RINGS.ropeLength));
    return { u: clamp01(x / L), group: step.index, weight: Math.max(0, Math.min(1, (anchorY - y) / span)) };
  };

  return {
    groups: [statics, swinging],
    swing: { meshes: swinging.children.filter((c) => c.isMesh), groupCount: line.steps.length, classify },
  };
}
