// Stirrups – a row of hanging stirrups, every 45 cm: a hemp rope down from each of the two
// overhead hand ropes, closed by a small wooden triangle you put a boot into. Crossed one stirrup at
// a time, exactly like the hanging planks, but the foot is *inside* the loop rather than on top of a
// board, so the loop swings with you instead of away from you.
//
// Movement problem (GDD §3.4, "rope bridges"): the hands are always on the two ropes overhead, so it
// costs strength; the timing is in the hips. Physical 2 · coordination 4 · psychological 3.

import { createElementBase, registerElementKind, ELEMENT } from "./element.js";
import { cableRun, cableTermination, ropeStrand, lifelineCable } from "./element-parts.js";
import { createHangingSteps, stepLayout } from "./hanging-steps.js";

export const STIRRUPS = Object.freeze({
  spacing: 0.45,             // stirrup pitch (RESEARCH-DATA §3 design assumptions)
  endMargin: 0.40,
  handHeight: 1.55,          // the two hand ropes, above the tread line
  handSpread: 0.30,
  ropeRadius: 0.010,
  cableRadius: 0.006,
  loopDrop: 0.34,            // how far the stirrup hangs below the hand rope's own line
  treadWidth: 0.20,          // the wooden triangle the boot sits on
  treadThickness: 0.035,
  sagRatio: 0.014,
  swingHz: 0.70,
  swingDamping: 0.18,
  maxSwing: 0.20,
  kickPerStep: 0.55,
  coupling: 0.16,
  walkSpeed: 0.55,
  slipAngle: 0.36,
  staminaDrain: 0.022,       // both hands are up the whole time
  lifelineHeight: ELEMENT.lifelineHeight,
  lifelineSag: 0.04,
  standBack: 0.45,
  metrics: Object.freeze({ physical: 2, coordination: 4, psychological: 3, technical: 1 }),
  wobble: Object.freeze({
    lateralHz: 0.44, verticalHz: 1.2, lateralDamping: 0.13, verticalDamping: 0.26,
    maxLateral: 0.22, maxVertical: 0.09, verticalRatio: 0.35,
  }),
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * @param {object} spec see `createElementBase`
 * @param {{ scene, physics, rng, timber, wind }} ctx
 * @returns {object} element – additionally exposes `steps`
 */
export function createStirrups(spec, ctx) {
  // M2b "stirrups-wide" variant: wider `spacing` must reach the line's own layout math, which runs
  // before `createElementBase` (below) has produced `element.config` – so this computes the same merge
  // a step early, purely to feed `createStirrupLine`.
  const cfg = { ...STIRRUPS, ...(spec.configOverride || null) };
  const line = createStirrupLine(spanOf(spec), cfg);

  const element = createElementBase(spec, ctx, {
    config: STIRRUPS,
    metrics: STIRRUPS.metrics,
    handHold: { available: true, heightAboveFoot: STIRRUPS.handHeight, side: "both" },
    build: (builder, frame, el) => buildStirrups(builder, frame, el, ctx, line),
    footholdAt: (t, el) => line.nearest(t, el.length),
    update: (dt) => line.update(dt),
    offsetAt: (u, out, el) => {
      const hit = line.nearest(clamp01(u), el.length);
      return out.set(0, el.wobble.vertical * 0.5, el.wobble.lateral * 0.5 + (hit.step ? hit.step.offset * 0.6 : 0));
    },
    displace: (offsets) => {
      for (const step of line.steps) {
        offsets[step.index * 3] = step.offset * 0.35;         // the loop drifts along the walk line …
        offsets[step.index * 3 + 1] = -Math.abs(step.offset) * 0.10;
        offsets[step.index * 3 + 2] = step.offset;            // … and mostly sideways
      }
    },
  });

  element.discrete = true;
  element.stepOn = (index, strength, direction) => line.stepOn(index, strength, direction);
  // `on-element.js` wants the plain array, not a getter function
  Object.defineProperty(element, "steps", { get: () => line.steps });
  return element;
}

registerElementKind("stirrups", createStirrups);

function spanOf(spec) {
  return Math.max(0.5, Math.hypot(spec.exit.position.x - spec.entry.position.x, spec.exit.position.z - spec.entry.position.z));
}

function createStirrupLine(span, cfg = STIRRUPS) {
  const { count, first, pitch } = stepLayout({ span, spacing: cfg.spacing, endMargin: cfg.endMargin, min: 6, max: 24 });
  return createHangingSteps({
    count, first, pitch,
    swingHz: cfg.swingHz, damping: cfg.swingDamping, maxSwing: cfg.maxSwing,
    kickPerStep: cfg.kickPerStep, coupling: cfg.coupling, readySlack: cfg.treadWidth * 0.5,
  });
}

function buildStirrups(builder, frame, element, ctx, line) {
  const L = frame.length;
  const top = (x) => frame.rise * (x / L) + STIRRUPS.handHeight;

  // --- static: lifeline, the two hand ropes, terminations -------------------------------------------
  lifelineCable(builder, frame, element);
  for (const side of [-1, 1]) {
    cableRun(builder, {
      from: { x: 0, y: STIRRUPS.handHeight, z: side * STIRRUPS.handSpread },
      to: { x: L, y: frame.rise + STIRRUPS.handHeight, z: side * STIRRUPS.handSpread },
      sag: element.config.sag, radius: STIRRUPS.cableRadius, material: "steel",
    });
    for (const [x, dir] of [[0, 1], [L, -1]]) {
      cableTermination(builder, {
        at: { x, y: (dir > 0 ? 0 : frame.rise) + STIRRUPS.handHeight, z: side * STIRRUPS.handSpread },
        along: { x: dir, y: 0, z: 0 }, radius: STIRRUPS.cableRadius,
      });
    }
  }
  const statics = builder.build(`${element.id}-fixed`);

  // --- swinging: one group per stirrup --------------------------------------------------------------
  for (const step of line.steps) {
    const x = step.x;
    const treadY = frame.rise * (x / L) - STIRRUPS.treadThickness / 2;
    for (const side of [-1, 1]) {
      ropeStrand(builder, {
        from: { x, y: top(x) - 0.03, z: side * STIRRUPS.handSpread },
        to: { x: x + ctx.rng.float(-0.015, 0.015), y: treadY, z: side * STIRRUPS.treadWidth * 0.5 },
        radius: STIRRUPS.ropeRadius, material: "cord",
      });
    }
    builder.box({                                             // the wooden triangle the boot goes into
      length: STIRRUPS.treadWidth, width: 0.075, thickness: STIRRUPS.treadThickness,
      position: { x, y: treadY, z: 0 }, rotation: { x: 0, y: Math.PI / 2, z: 0 }, material: "weathered",
    });
  }
  const swinging = builder.build(`${element.id}-loops`);

  const classify = (x, y) => {
    const hit = line.nearest(clamp01(x / L), L);
    const step = hit.step || line.steps[0];
    const anchorY = top(step.x);
    const span = Math.max(0.05, anchorY - frame.rise * (step.x / L));
    return { u: clamp01(x / L), group: step.index, weight: Math.max(0, Math.min(1, (anchorY - y) / span)) };
  };

  return {
    groups: [statics, swinging],
    swing: { meshes: swinging.children.filter((c) => c.isMesh), groupCount: line.steps.length, classify },
  };
}
