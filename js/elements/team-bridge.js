// Team bridge (ROADMAP M4, GDD §3.11 "co-op obstacles"): a loose chain of plank segments, each hung on
// its own two ropes from a pair of overhead carrier cables – structurally the same idea as
// js/elements/beam-swing.js (independent pendulums, walked continuously, not stepped one at a time),
// but flat boards instead of round logs, wobblier by default, and with one thing beam-swing does not
// have: a partner who can hold a tension rope at either end and calm it down.
//
// Movement problem (GDD §3.4 family "beams, planks" + §3.11): crossed solo it reads as the wobbliest
// blue-tier bridge in the park – still passable (RESEARCH-DATA §8 "real parks forbid two people on one
// obstacle, the game allows it if the group enables it" is about *sharing* an obstacle, not about
// making the solo case impossible). Crossed with a partner holding the rope, every footstep's kick is
// cut by `TEAM_BRIDGE.tensionKickScale` – the same "hold the far end steady" idea a real two-person
// carry has, just applied to a plank instead of a stretcher.
import { createElementBase, registerElementKind, ELEMENT } from "./element.js";
import { cableRun, cableTermination, ropeStrand, lifelineCable } from "./element-parts.js";
import { teamBridgeKickScale } from "../game/coop-elements.js";

export const TEAM_BRIDGE = Object.freeze({
  plankSpan: 0.62,           // across the walk direction, rope to rope
  plankTread: 0.24,          // along it – slightly wider tread than the solo hanging-planks family
  plankThickness: 0.05,
  segmentGap: 0.12,
  endMargin: 0.32,
  hangHeight: 1.88,          // carrier cables above the walking line
  hangSpread: 0.24,
  ropeRadius: 0.010,
  cableRadius: 0.006,
  minSegments: 4,
  maxSegments: 6,
  sagRatio: 0.014,
  swingHz: 0.40,             // lower/looser than beam-swing's 0.48 Hz – "loose" is the point
  swingDamping: 0.08,
  maxSwing: 0.34,            // more lateral travel than any solo blue/red element (GDD "wobbles heavily")
  kickPerStep: 0.72,
  neighbourCoupling: 0.32,
  walkSpeed: 0.50,
  slipAngle: 0.32,           // same tolerance band as beam-swing/hanging-planks – proven solo-passable
  staminaDrain: 0.009,
  lifelineHeight: ELEMENT.lifelineHeight,
  lifelineSag: 0.04,
  standBack: 0.45,
  windGain: 0.26,
  metrics: Object.freeze({ physical: 2, coordination: 4, psychological: 3, technical: 1 }),
  wobble: Object.freeze({
    lateralHz: 0.32, verticalHz: 0.95, lateralDamping: 0.06, verticalDamping: 0.18,
    maxLateral: 0.55, maxVertical: 0.11, verticalRatio: 0.35,
  }),
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * @param {object} spec see `createElementBase`
 * @param {{ scene, physics, rng, timber, wind }} ctx
 * @returns {object} element – additionally exposes `segments` and `setTensionHeld(held)`
 */
export function createTeamBridge(spec, ctx) {
  /** @type {Array<{ index, x, half, offset, velocity }>} */
  const segments = [];
  let tensionHeld = false;   // js/game/coop.js: true while the *other* climber holds F at either post

  const element = createElementBase(spec, ctx, {
    config: TEAM_BRIDGE,
    metrics: TEAM_BRIDGE.metrics,
    handHold: { available: true, heightAboveFoot: TEAM_BRIDGE.hangHeight, side: "overhead" },
    build: (builder, frame, el) => buildSegments(builder, frame, el, ctx, segments),
    footholdAt: (t, el) => footholdOnSegment(t, el, segments),
    update: (dt) => updateSegments(dt, segments),
    offsetAt: (u, out, el) => segmentOffset(u, out, el, segments),
    displace: (offsets) => {
      for (const s of segments) {
        offsets[s.index * 3] = 0;
        offsets[s.index * 3 + 1] = -Math.abs(s.offset) * 0.10;
        offsets[s.index * 3 + 2] = s.offset;
      }
    },
  });

  element.segments = segments;
  element.discrete = false;               // walked continuously, exactly like beam-swing
  // M4 (GDD §3.11, js/game/occupancy.js): a rider plus a helper holding the tension rope, never two
  // riders sharing the one rail parameter – see this file's header and js/game/coop.js's own comment
  // on why the helper never enters the "element" player state at all.
  element.occupancyCapacity = 2;
  /** A foot landed on segment `index`: kick it, damped by `TEAM_BRIDGE.tensionKickScale` while held. */
  element.stepOn = function stepOn(index, strength = 1, direction = 1) {
    const segment = segments[index];
    if (!segment) return;
    const scale = teamBridgeKickScale(tensionHeld);
    segment.velocity += TEAM_BRIDGE.kickPerStep * strength * direction * scale;
    for (const other of [segments[index - 1], segments[index + 1]]) {
      if (other) other.velocity += TEAM_BRIDGE.kickPerStep * strength * direction * scale * TEAM_BRIDGE.neighbourCoupling;
    }
  };
  /**
   * js/game/coop.js: the *other* climber is holding F at the entry or exit tension post. Only scales
   * every *future* kick (see `stepOn` above) – it does not retroactively calm a segment already swinging,
   * which is exactly the honest "steadies it, does not freeze it" reading of "holds a tension rope".
   */
  element.setTensionHeld = function setTensionHeld(held) { tensionHeld = !!held; };
  return element;
}

registerElementKind("team-bridge", createTeamBridge);

/** Independent lateral pendulums, same damped-spring step as the shared wobble model. */
function updateSegments(dt, segments) {
  if (!(dt > 0)) return;
  const omega = 2 * Math.PI * TEAM_BRIDGE.swingHz;
  for (const s of segments) {
    s.velocity += (-omega * omega * s.offset - 2 * TEAM_BRIDGE.swingDamping * omega * s.velocity) * dt;
    s.offset += s.velocity * dt;
    if (s.offset > TEAM_BRIDGE.maxSwing) { s.offset = TEAM_BRIDGE.maxSwing; s.velocity = Math.min(0, s.velocity); }
    else if (s.offset < -TEAM_BRIDGE.maxSwing) { s.offset = -TEAM_BRIDGE.maxSwing; s.velocity = Math.max(0, s.velocity); }
  }
}

/** Which segment is under `t` – the walking line follows *that* plank sideways, not the average. */
function segmentAt(u, element, segments) {
  const x = clamp01(u) * element.length;
  let best = segments[0] || null, bestD = Infinity;
  for (const s of segments) {
    const d = Math.abs(s.x - x);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

/** Reported `discrete: true` so js/player/on-element.js#stepImpulse kicks it on every footfall, even
 *  though the crossing itself is walked continuously (same convention as beam-swing.js). */
function footholdOnSegment(t, element, segments) {
  const s = segmentAt(t, element, segments);
  if (!s) return { discrete: false, index: -1, t, offset: 0, ready: 1, swing: 0 };
  const swing = s.offset / TEAM_BRIDGE.maxSwing;
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

/** Segment count and pitch – whole planks filling the span, never a stub at one end. */
function segmentLayout(span, cfg = TEAM_BRIDGE) {
  const usable = span - 2 * cfg.endMargin;
  const count = Math.max(cfg.minSegments, Math.min(cfg.maxSegments, Math.round(usable / 2.2)));
  const segLength = (usable - (count - 1) * cfg.segmentGap) / count;
  return { count, segLength, first: cfg.endMargin + segLength / 2, pitch: segLength + cfg.segmentGap };
}

function buildSegments(builder, frame, element, ctx, segments) {
  const L = frame.length;
  const { count, segLength, first, pitch } = segmentLayout(L, element.config);
  const top = (x) => frame.rise * (x / L) + TEAM_BRIDGE.hangHeight;

  // --- static: lifeline, the two carrier cables and their terminations ------------------------------
  lifelineCable(builder, frame, element);
  for (const side of [-1, 1]) {
    cableRun(builder, {
      from: { x: 0, y: TEAM_BRIDGE.hangHeight, z: side * TEAM_BRIDGE.hangSpread },
      to: { x: L, y: frame.rise + TEAM_BRIDGE.hangHeight, z: side * TEAM_BRIDGE.hangSpread },
      sag: element.config.sag, radius: TEAM_BRIDGE.cableRadius, material: "steel",
    });
    for (const [x, dir] of [[0, 1], [L, -1]]) {
      cableTermination(builder, {
        at: { x, y: (dir > 0 ? 0 : frame.rise) + TEAM_BRIDGE.hangHeight, z: side * TEAM_BRIDGE.hangSpread },
        along: { x: dir, y: 0, z: 0 }, radius: TEAM_BRIDGE.cableRadius,
      });
    }
  }
  const statics = builder.build(`${element.id}-fixed`);

  // --- swinging: one flat plank per segment ---------------------------------------------------------
  for (let i = 0; i < count; i++) {
    const x = first + i * pitch;
    const half = segLength / 2;
    const y = frame.rise * (x / L);
    segments.push({ index: i, x, half, offset: 0, velocity: 0 });
    builder.box({
      length: TEAM_BRIDGE.plankSpan, width: segLength, thickness: TEAM_BRIDGE.plankThickness,
      position: { x, y: y - TEAM_BRIDGE.plankThickness / 2, z: ctx.rng.float(-0.01, 0.01) },
      rotation: { x: 0, y: Math.PI / 2, z: 0 }, material: "weathered",
    });
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        const cx = x + end * (half - 0.06);
        ropeStrand(builder, {
          from: { x: cx, y: top(cx) - 0.03, z: side * TEAM_BRIDGE.hangSpread },
          to: { x: cx, y, z: side * TEAM_BRIDGE.plankSpan * 0.42 },
          radius: TEAM_BRIDGE.ropeRadius, material: "cord",
        });
      }
    }
  }
  const swinging = builder.build(`${element.id}-planks`);

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
