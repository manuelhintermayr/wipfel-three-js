// Hanging planks – nine weathered boards, each on two ropes from a pair of overhead carrier cables,
// with a 40 cm gap between them. Step on one and it swings away; step on the next one too early and
// it is not where your foot expects it. That is the whole exercise (GDD §3.4, "Balken, Planken,
// Trittholz · 1·4·4·1": timing and patience, not strength).
//
// Every plank is its own pendulum, so the deformer runs with one group per plank: the plank body
// follows the swing completely, its hanger ropes follow it in proportion to how far down they are.

import { createElementBase, registerElementKind, ELEMENT } from "./element.js";
import { cableRun, cableTermination, ropeStrand, lifelineCable } from "./element-parts.js";

export const PLANKS = Object.freeze({
  plankSpan: 0.60,           // across the walk direction, rope to rope (RESEARCH-DATA §3: 20 × 60 cm)
  plankTread: 0.22,          // along it – this is what one foot lands on
  plankThickness: 0.05,
  gap: 0.40,                 // nominal clear air between two planks; the exact pitch fits the span
  endMargin: 0.35,           // no plank closer than this to a deck edge
  hangHeight: 1.85,          // carrier cables above the plank tops
  hangSpread: 0.26,          // half-distance of the two carrier cables and of the hanger ropes
  ropeRadius: 0.010,
  cableRadius: 0.006,
  sagRatio: 0.012,           // the carrier cables barely sag – the planks hang from them
  minPlanks: 6,
  maxPlanks: 12,
  swingHz: 0.62,             // a 1.85 m pendulum swings at about 0.37 Hz; the rope is stiffer
  swingDamping: 0.16,
  maxSwing: 0.30,            // metres of plank travel before it would throw you off
  kickPerStep: 0.85,         // m/s the plank picks up when a foot lands on it
  neighbourCoupling: 0.22,   // the carrier cable passes some of that on to the next plank
  walkSpeed: 0.75,
  slipAngle: 0.34,           // less forgiving than a wire bridge – the tilt is along the walk line
  staminaDrain: 0.006,
  lifelineHeight: ELEMENT.lifelineHeight,
  lifelineSag: 0.04,
  standBack: 0.45,
  metrics: Object.freeze({ physical: 1, coordination: 4, psychological: 4, technical: 1 }),
  wobble: Object.freeze({
    lateralHz: 0.55, verticalHz: 1.4, lateralDamping: 0.16, verticalDamping: 0.3,
    maxLateral: 0.16, maxVertical: 0.07, verticalRatio: 0.3,
  }),
});

/**
 * @param {object} spec see `createElementBase`
 * @param {{ scene, physics, rng, timber, wind }} ctx
 * @returns {object} element – additionally exposes `planks` (the pendulum states)
 */
export function createHangingPlanks(spec, ctx) {
  /** @type {Array<{ index, x, offset, velocity, lastStep }>} */
  const planks = [];

  const element = createElementBase(spec, ctx, {
    config: PLANKS,
    metrics: PLANKS.metrics,
    handHold: { available: true, heightAboveFoot: PLANKS.hangHeight, side: "overhead" },
    build: (builder, frame, el) => buildPlanks(builder, frame, el, ctx, planks),
    footholdAt: (t, el) => nearestPlank(t, el, planks),
    update: (dt) => updatePlanks(dt, planks),
    offsetAt: (u, out, el) => plankOffset(u, out, el, planks),
    displace: (offsets) => {
      for (const plank of planks) {
        offsets[plank.index * 3] = plank.offset;               // planks swing along the walk line
        offsets[plank.index * 3 + 1] = -Math.abs(plank.offset) * 0.16;   // …and rise a little as they do
        offsets[plank.index * 3 + 2] = 0;
      }
    },
  });

  element.planks = planks;
  /** Crossed one plank per press of W, not walked (js/player/on-element.js). */
  element.discrete = true;
  /** A foot landed on plank `index`: kick it, and let the carrier cable tell its neighbours. */
  element.stepOn = function stepOn(index, strength = 1, direction = 1) {
    const plank = planks[index];
    if (!plank) return;
    plank.velocity += PLANKS.kickPerStep * strength * direction;
    for (const other of [planks[index - 1], planks[index + 1]]) {
      if (other) other.velocity += PLANKS.kickPerStep * strength * direction * PLANKS.neighbourCoupling;
    }
  };
  return element;
}

registerElementKind("hanging-planks", createHangingPlanks);

/** Independent pendulums, integrated with the same damped-spring step as the element wobble. */
function updatePlanks(dt, planks) {
  if (!(dt > 0)) return;
  const omega = 2 * Math.PI * PLANKS.swingHz;
  for (const plank of planks) {
    plank.velocity += (-omega * omega * plank.offset - 2 * PLANKS.swingDamping * omega * plank.velocity) * dt;
    plank.offset += plank.velocity * dt;
    if (plank.offset > PLANKS.maxSwing) { plank.offset = PLANKS.maxSwing; plank.velocity = Math.min(0, plank.velocity); }
    else if (plank.offset < -PLANKS.maxSwing) { plank.offset = -PLANKS.maxSwing; plank.velocity = Math.max(0, plank.velocity); }
  }
}

/** The walking line follows whichever plank is under the foot – that is why the timing matters. */
function plankOffset(u, out, element, planks) {
  const hit = nearestPlank(u, element, planks);
  const drop = hit.plank ? -Math.abs(hit.plank.offset) * 0.16 : 0;
  return out.set(0, element.wobble.vertical * 0.5 + drop, element.wobble.lateral * 0.5);
}

/**
 * Which plank is under `t`, how far the foot is from its centre, and how ready it is to be stepped
 * on. `ready` 1 = the plank is where it belongs, 0 = it has swung away.
 */
function nearestPlank(t, element, planks) {
  if (!planks.length) return { discrete: true, index: -1, t, offset: 0, ready: 0, swing: 0, plank: null };
  const x = t * element.length;
  let index = 0, best = Infinity;
  for (const plank of planks) {
    const d = Math.abs(plank.x + plank.offset - x);
    if (d < best) { best = d; index = plank.index; }
  }
  const plank = planks[index];
  const swing = plank.offset / PLANKS.maxSwing;
  return {
    discrete: true,
    index,
    plank,
    /** rail parameter of the plank's centre right now */
    t: (plank.x + plank.offset) / element.length,
    /** metres from the foot to that centre */
    offset: best,
    /** 1 = solid underfoot, 0 = it has swung out from under you */
    ready: Math.max(0, 1 - Math.abs(swing) - Math.max(0, best - PLANKS.plankTread * 0.5) * 2.2),
    swing,
  };
}

/**
 * How many planks fit between the two decks, and how far apart. The count comes from the nominal
 * pitch, the *actual* pitch is then stretched to fill the span exactly – otherwise a short span
 * hangs its first plank behind the platform it starts from.
 */
function plankLayout(span) {
  const usable = span - 2 * PLANKS.endMargin - PLANKS.plankTread;
  const nominal = PLANKS.plankTread + PLANKS.gap;
  const count = Math.max(PLANKS.minPlanks, Math.min(PLANKS.maxPlanks, Math.round(usable / nominal) + 1));
  return { count, first: PLANKS.endMargin + PLANKS.plankTread / 2, pitch: count > 1 ? usable / (count - 1) : 0 };
}

function buildPlanks(builder, frame, element, ctx, planks) {
  const L = frame.length;
  const { count, first, pitch } = plankLayout(L);
  const top = (x) => frame.rise * (x / L) + PLANKS.hangHeight;

  // --- static: lifeline, carrier cables, terminations -----------------------------------------------
  lifelineCable(builder, frame, element);
  for (const side of [-1, 1]) {
    cableRun(builder, {
      from: { x: 0, y: PLANKS.hangHeight, z: side * PLANKS.hangSpread },
      to: { x: L, y: frame.rise + PLANKS.hangHeight, z: side * PLANKS.hangSpread },
      sag: element.config.sag, radius: PLANKS.cableRadius, material: "steel",
    });
    for (const [x, dir] of [[0, 1], [L, -1]]) {
      cableTermination(builder, {
        at: { x, y: (dir > 0 ? 0 : frame.rise) + PLANKS.hangHeight, z: side * PLANKS.hangSpread },
        along: { x: dir, y: 0, z: 0 }, radius: PLANKS.cableRadius,
      });
    }
  }
  const statics = builder.build(`${element.id}-fixed`);

  // --- swinging: one group per plank ----------------------------------------------------------------
  for (let i = 0; i < count; i++) {
    const x = first + i * pitch;
    const y = frame.rise * (x / L);
    planks.push({ index: i, x, offset: 0, velocity: 0 });
    // the board lies across the path: its long side (and its grain) runs left to right
    builder.box({
      length: PLANKS.plankSpan, width: PLANKS.plankTread, thickness: PLANKS.plankThickness,
      position: { x, y: y - PLANKS.plankThickness / 2, z: ctx.rng.float(-0.012, 0.012) },
      rotation: { x: 0, y: Math.PI / 2 + ctx.rng.float(-0.02, 0.02), z: 0 }, material: "weathered",
    });
    const eye = PLANKS.plankSpan / 2 - 0.05;
    for (const side of [-1, 1]) {
      ropeStrand(builder, {
        from: { x, y: top(x) - 0.03, z: side * PLANKS.hangSpread },
        to: { x, y, z: side * eye },
        radius: PLANKS.ropeRadius, material: "cord",
      });
      builder.cylinderBetween({                                // the eye bolt through the plank end
        from: { x, y: y - PLANKS.plankThickness - 0.01, z: side * eye },
        to: { x, y: y + 0.015, z: side * eye },
        radius: 0.008, segments: 6, material: "steel",
      });
    }
  }
  const swinging = builder.build(`${element.id}-planks`);

  const classify = (x, y) => {
    let index = 0, best = Infinity;
    for (const plank of planks) {
      const d = Math.abs(plank.x - x);
      if (d < best) { best = d; index = plank.index; }
    }
    const plankTop = frame.rise * (planks[index].x / L);
    const span = Math.max(0.05, top(planks[index].x) - plankTop);
    const weight = Math.max(0, Math.min(1, (top(planks[index].x) - y) / span));
    return { u: x / L, group: index, weight };
  };

  return {
    groups: [statics, swinging],
    swing: { meshes: swinging.children.filter((c) => c.isMesh), groupCount: count, classify },
  };
}
