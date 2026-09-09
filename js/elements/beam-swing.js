// Wobble beam – three or four round-log segments, each hung on two chains from a pair of overhead
// carrier cables. Unlike the hanging planks you walk this one continuously: the segments butt up
// against each other, so there is always wood underfoot – but every segment swings on its own, and
// the one you are standing on is never the one you are about to step onto.
//
// Movement problem (GDD §3.4, "beams, planks, step logs · 1·4·4·1", here with real mass under the
// feet): strong lateral sway, and the answer is to keep walking evenly instead of correcting.

import { createElementBase, registerElementKind, ELEMENT } from "./element.js";
import { cableRun, cableTermination, lifelineCable } from "./element-parts.js";

export const BEAM_SWING = Object.freeze({
  logRadius: 0.095,          // Ø 19 cm segments
  minSegments: 3,
  maxSegments: 4,
  segmentGap: 0.10,          // clear air between two logs – you feel it through the boots
  endMargin: 0.30,
  hangHeight: 1.90,          // carrier cables above the walking line
  hangSpread: 0.22,
  chainRadius: 0.007,
  cableRadius: 0.006,
  sagRatio: 0.012,
  swingHz: 0.48,             // a 1.9 m chain pendulum, loaded
  swingDamping: 0.11,
  maxSwing: 0.26,            // metres of lateral travel per segment
  kickPerStep: 0.55,
  neighbourCoupling: 0.30,   // the carrier cable passes sway on to the next segment
  walkSpeed: 0.52,
  slipAngle: 0.32,
  staminaDrain: 0.008,
  lifelineHeight: ELEMENT.lifelineHeight,
  lifelineSag: 0.04,
  standBack: 0.45,
  windGain: 0.30,
  metrics: Object.freeze({ physical: 2, coordination: 4, psychological: 4, technical: 1 }),
  wobble: Object.freeze({
    lateralHz: 0.36, verticalHz: 1.0, lateralDamping: 0.07, verticalDamping: 0.20,
    maxLateral: 0.50, maxVertical: 0.10, verticalRatio: 0.35,
  }),
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * @param {object} spec see `createElementBase`
 * @param {{ scene, physics, rng, timber, wind }} ctx
 * @returns {object} element – additionally exposes `segments` (the pendulum states)
 */
export function createBeamSwing(spec, ctx) {
  /** @type {Array<{ index, x, half, offset, velocity }>} */
  const segments = [];

  const element = createElementBase(spec, ctx, {
    config: BEAM_SWING,
    metrics: BEAM_SWING.metrics,
    handHold: { available: true, heightAboveFoot: BEAM_SWING.hangHeight, side: "overhead" },
    build: (builder, frame, el) => buildSegments(builder, frame, el, ctx, segments),
    footholdAt: (t, el) => footholdOnSegment(t, el, segments),
    update: (dt) => updateSegments(dt, segments),
    offsetAt: (u, out, el) => segmentOffset(u, out, el, segments),
    displace: (offsets) => {
      for (const s of segments) {
        offsets[s.index * 3] = 0;
        offsets[s.index * 3 + 1] = -Math.abs(s.offset) * 0.10;   // a swung log also rises a little
        offsets[s.index * 3 + 2] = s.offset;                     // …and mostly moves sideways
      }
    },
  });

  element.segments = segments;
  /** Walked, not stepped: `on-element.js` drives a speed along the rail. */
  element.discrete = false;
  /** A foot landed on the segment under `t`: kick it, and let the carrier cable tell its neighbours. */
  element.stepOn = function stepOn(index, strength = 1, direction = 1) {
    const segment = segments[index];
    if (!segment) return;
    segment.velocity += BEAM_SWING.kickPerStep * strength * direction;
    for (const other of [segments[index - 1], segments[index + 1]]) {
      if (other) other.velocity += BEAM_SWING.kickPerStep * strength * direction * BEAM_SWING.neighbourCoupling;
    }
  };
  return element;
}

registerElementKind("beam-swing", createBeamSwing);

/** Independent lateral pendulums, same damped-spring step as the shared wobble model. */
function updateSegments(dt, segments) {
  if (!(dt > 0)) return;
  const omega = 2 * Math.PI * BEAM_SWING.swingHz;
  for (const s of segments) {
    s.velocity += (-omega * omega * s.offset - 2 * BEAM_SWING.swingDamping * omega * s.velocity) * dt;
    s.offset += s.velocity * dt;
    if (s.offset > BEAM_SWING.maxSwing) { s.offset = BEAM_SWING.maxSwing; s.velocity = Math.min(0, s.velocity); }
    else if (s.offset < -BEAM_SWING.maxSwing) { s.offset = -BEAM_SWING.maxSwing; s.velocity = Math.max(0, s.velocity); }
  }
}

/** Which segment is under `t` – the walking line follows *that* log sideways, not the average. */
function segmentAt(u, element, segments) {
  const x = clamp01(u) * element.length;
  let best = segments[0] || null, bestD = Infinity;
  for (const s of segments) {
    const d = Math.abs(s.x - x);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

/**
 * Which log is under the foot right now, and how ready it is (1 = hanging square, 0 = swung out from
 * under you). Reported as `discrete: true` so `on-element.js#stepImpulse` kicks it on every footfall
 * even though the crossing itself is walked continuously, not stepped plank by plank.
 */
function footholdOnSegment(t, element, segments) {
  const s = segmentAt(t, element, segments);
  if (!s) return { discrete: false, index: -1, t, offset: 0, ready: 1, swing: 0 };
  const swing = s.offset / BEAM_SWING.maxSwing;
  return { discrete: true, index: s.index, t: clamp01(s.x / element.length), offset: 0, ready: Math.max(0, 1 - Math.abs(swing)), swing };
}

function segmentOffset(u, out, element, segments) {
  const s = segmentAt(u, element, segments);
  const lateral = s ? s.offset : 0;
  return out.set(
    0,
    element.wobble.vertical * 0.6 - element.config.sag * 4 * clamp01(u) * (1 - clamp01(u)) - Math.abs(lateral) * 0.10,
    element.wobble.lateral * 0.5 + lateral,
  );
}

/**
 * Segment count and pitch: whole logs that fill the span, never a stub at one end. Reads `cfg` (default
 * `BEAM_SWING`) instead of the module constant, so M2b's "beam-swing-4seg" variant's `minSegments ===
 * maxSegments === 4` actually forces four logs regardless of span.
 */
function segmentLayout(span, cfg = BEAM_SWING) {
  const usable = span - 2 * cfg.endMargin;
  const count = Math.max(cfg.minSegments, Math.min(cfg.maxSegments, Math.round(usable / 3.0)));
  const logLength = (usable - (count - 1) * cfg.segmentGap) / count;
  return { count, logLength, first: cfg.endMargin + logLength / 2, pitch: logLength + cfg.segmentGap };
}

function buildSegments(builder, frame, element, ctx, segments) {
  const L = frame.length;
  const { count, logLength, first, pitch } = segmentLayout(L, element.config);
  const top = (x) => frame.rise * (x / L) + BEAM_SWING.hangHeight;

  // --- static: lifeline, the two carrier cables and their terminations ------------------------------
  lifelineCable(builder, frame, element);
  for (const side of [-1, 1]) {
    cableRun(builder, {
      from: { x: 0, y: BEAM_SWING.hangHeight, z: side * BEAM_SWING.hangSpread },
      to: { x: L, y: frame.rise + BEAM_SWING.hangHeight, z: side * BEAM_SWING.hangSpread },
      sag: element.config.sag, radius: BEAM_SWING.cableRadius, material: "steel",
    });
    for (const [x, dir] of [[0, 1], [L, -1]]) {
      cableTermination(builder, {
        at: { x, y: (dir > 0 ? 0 : frame.rise) + BEAM_SWING.hangHeight, z: side * BEAM_SWING.hangSpread },
        along: { x: dir, y: 0, z: 0 }, radius: BEAM_SWING.cableRadius,
      });
    }
  }
  const statics = builder.build(`${element.id}-fixed`);

  // --- swinging: one group per log ------------------------------------------------------------------
  for (let i = 0; i < count; i++) {
    const x = first + i * pitch;
    const half = logLength / 2;
    const y = frame.rise * (x / L);
    segments.push({ index: i, x, half, offset: 0, velocity: 0 });
    builder.cylinderBetween({                                 // the log lies ALONG the walk direction
      from: { x: x - half, y: y - BEAM_SWING.logRadius, z: 0 },
      to: { x: x + half, y: y - BEAM_SWING.logRadius, z: 0 },
      radius: BEAM_SWING.logRadius * ctx.rng.float(0.96, 1.04), segments: 12, material: "log",
    });
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        const cx = x + end * (half - 0.10);
        builder.cylinderBetween({                             // chain from the carrier cable to the log
          from: { x: cx, y: top(cx) - 0.03, z: side * BEAM_SWING.hangSpread },
          to: { x: cx, y, z: side * BEAM_SWING.logRadius * 0.6 },
          radius: BEAM_SWING.chainRadius, segments: 5, material: "steel",
        });
      }
    }
  }
  const swinging = builder.build(`${element.id}-logs`);

  const classify = (x, y) => {
    const s = segmentAt(x / L, element, segments) || segments[0];
    const anchorY = top(s.x);
    const span = Math.max(0.05, anchorY - frame.rise * (s.x / L));
    return { u: clamp01(x / L), group: s.index, weight: Math.max(0, Math.min(1, (anchorY - y) / span)) };
  };

  return {
    groups: [statics, swinging],
    swing: { meshes: swinging.children.filter((c) => c.isMesh), groupCount: count, classify },
  };
}
