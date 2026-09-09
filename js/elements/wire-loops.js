// Rope loops – a row of plain rope loops, the simpler cousin of the stirrups (RESEARCH-DATA §3:
// "rope loops, stirrups" are two separate catalogue entries under rope bridges). Where a stirrup
// gives the boot a rigid wooden tread to stand on, a wire loop is just a soft eye of rope: the foot
// goes *through* it and can twist inside it, so it is a step less stable for the same rhythm –
// coordination is a notch higher than the stirrups, everything else about the crossing is identical.
// A thin variant of `stirrups.js`, sharing the same `hanging-steps.js` base.

import { createElementBase, registerElementKind, ELEMENT } from "./element.js";
import { cableRun, cableTermination, ropeStrand, lifelineCable } from "./element-parts.js";
import { createHangingSteps, stepLayout } from "./hanging-steps.js";

export const WIRE_LOOPS = Object.freeze({
  spacing: 0.45,
  endMargin: 0.40,
  handHeight: 1.55,
  handSpread: 0.30,
  ropeRadius: 0.009,
  cableRadius: 0.006,
  loopRadius: 0.10,           // the foot goes through this eye – no rigid tread underneath it
  loopTube: 0.013,
  sagRatio: 0.014,
  swingHz: 0.72,
  swingDamping: 0.16,
  maxSwing: 0.22,
  kickPerStep: 0.60,
  coupling: 0.16,
  walkSpeed: 0.52,
  slipAngle: 0.32,             // a hair tighter than the stirrups – the loop can twist underfoot
  staminaDrain: 0.024,
  lifelineHeight: ELEMENT.lifelineHeight,
  lifelineSag: 0.04,
  standBack: 0.45,
  metrics: Object.freeze({ physical: 2, coordination: 5, psychological: 3, technical: 1 }),
  wobble: Object.freeze({
    lateralHz: 0.46, verticalHz: 1.25, lateralDamping: 0.12, verticalDamping: 0.24,
    maxLateral: 0.24, maxVertical: 0.10, verticalRatio: 0.35,
  }),
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * @param {object} spec see `createElementBase`
 * @param {{ scene, physics, rng, timber, wind }} ctx
 * @returns {object} element – additionally exposes `steps`
 */
export function createWireLoops(spec, ctx) {
  const line = createLoopLine(spanOf(spec));

  const element = createElementBase(spec, ctx, {
    config: WIRE_LOOPS,
    metrics: WIRE_LOOPS.metrics,
    handHold: { available: true, heightAboveFoot: WIRE_LOOPS.handHeight, side: "both" },
    build: (builder, frame, el) => buildLoops(builder, frame, el, ctx, line),
    footholdAt: (t, el) => line.nearest(t, el.length),
    update: (dt) => line.update(dt),
    offsetAt: (u, out, el) => {
      const hit = line.nearest(clamp01(u), el.length);
      return out.set(0, el.wobble.vertical * 0.5, el.wobble.lateral * 0.5 + (hit.step ? hit.step.offset * 0.6 : 0));
    },
    displace: (offsets) => {
      for (const step of line.steps) {
        offsets[step.index * 3] = step.offset * 0.35;
        offsets[step.index * 3 + 1] = -Math.abs(step.offset) * 0.10;
        offsets[step.index * 3 + 2] = step.offset;
      }
    },
  });

  element.discrete = true;
  element.stepOn = (index, strength, direction) => line.stepOn(index, strength, direction);
  Object.defineProperty(element, "steps", { get: () => line.steps });
  return element;
}

registerElementKind("wire-loops", createWireLoops);

function spanOf(spec) {
  return Math.max(0.5, Math.hypot(spec.exit.position.x - spec.entry.position.x, spec.exit.position.z - spec.entry.position.z));
}

function createLoopLine(span) {
  const { count, first, pitch } = stepLayout({ span, spacing: WIRE_LOOPS.spacing, endMargin: WIRE_LOOPS.endMargin, min: 6, max: 24 });
  return createHangingSteps({
    count, first, pitch,
    swingHz: WIRE_LOOPS.swingHz, damping: WIRE_LOOPS.swingDamping, maxSwing: WIRE_LOOPS.maxSwing,
    kickPerStep: WIRE_LOOPS.kickPerStep, coupling: WIRE_LOOPS.coupling, readySlack: WIRE_LOOPS.loopRadius * 0.5,
  });
}

function buildLoops(builder, frame, element, ctx, line) {
  const L = frame.length;
  const top = (x) => frame.rise * (x / L) + WIRE_LOOPS.handHeight;

  // --- static: lifeline, the two hand ropes, terminations ---------------------------------------------
  lifelineCable(builder, frame, element);
  for (const side of [-1, 1]) {
    cableRun(builder, {
      from: { x: 0, y: WIRE_LOOPS.handHeight, z: side * WIRE_LOOPS.handSpread },
      to: { x: L, y: frame.rise + WIRE_LOOPS.handHeight, z: side * WIRE_LOOPS.handSpread },
      sag: element.config.sag, radius: WIRE_LOOPS.cableRadius, material: "steel",
    });
    for (const [x, dir] of [[0, 1], [L, -1]]) {
      cableTermination(builder, {
        at: { x, y: (dir > 0 ? 0 : frame.rise) + WIRE_LOOPS.handHeight, z: side * WIRE_LOOPS.handSpread },
        along: { x: dir, y: 0, z: 0 }, radius: WIRE_LOOPS.cableRadius,
      });
    }
  }
  const statics = builder.build(`${element.id}-fixed`);

  // --- swinging: one rope eye per step, no rigid tread --------------------------------------------------
  for (const step of line.steps) {
    const x = step.x;
    const loopY = frame.rise * (x / L) - WIRE_LOOPS.loopRadius * 0.5;
    for (const side of [-1, 1]) {
      ropeStrand(builder, {
        from: { x, y: top(x) - 0.03, z: side * WIRE_LOOPS.handSpread },
        to: { x: x + ctx.rng.float(-0.012, 0.012), y: loopY, z: side * WIRE_LOOPS.loopRadius * 0.55 },
        radius: WIRE_LOOPS.ropeRadius, material: "cord",
      });
    }
    builder.torus({ centre: { x, y: loopY, z: 0 }, radius: WIRE_LOOPS.loopRadius, tube: WIRE_LOOPS.loopTube, segments: 16, material: "cord" });
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
