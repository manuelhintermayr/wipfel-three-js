// The Flying Fox as a piece of hardware (GDD §3.6): one 12 mm cable from the last platform down
// across the clearing, a trolley that rides it, a weighted braking net near the end with a
// red-and-white marker sleeve where "legs up" stops being optional, and a start gate on the platform
// with the pictogram that says the same thing without words.
//
// It is built on the M0.5 element interface, because everything around it – belay anchors, the
// two-click ritual, the platform prompts, the course graph – already works in those terms. What is
// different is that the climber does not walk a rail: `element.playerState` sends the interaction to
// js/player/on-zipline.js, and the ride itself is `element.zip` (js/zipline/physics.js) and
// `element.brake` (js/zipline/brakes.js), so the geometry here and the ride there are the same curve.
//
// The cable is drawn with its *loaded* sag (2 % of the span, RESEARCH-DATA §6) plus a travelling dip
// under the trolley, which is the deformer trick from net-bridge.js: one merged mesh, one shape
// function per frame.

import { createElementBase, registerElementKind } from "./element.js";
import { cableRun, cableTermination, netKnot } from "./element-parts.js";
import { createZipPhysics, ZIP_PHYSICS } from "../zipline/physics.js";
import { createNetBrake } from "../zipline/brakes.js";
import { createCanvas, toTexture } from "../procgen/textures/tree-texture-utils.js";

export const ZIPLINE = Object.freeze({
  cableRadius: 0.006,        // 12 mm steel, same wire as every lifeline in the park
  cableHeight: 2.05,         // above both decks – clears the platform's own safety ring by 15 cm
  sagRatio: ZIP_PHYSICS.sagRatio,
  slingLength: 0.85,         // trolley pin down to the hand bar (the harness hangs a little lower)
  seatDrop: 2.02,            // cable down to the seated rider's feet origin (harness + seated pelvis)
  standBack: 0.55,
  dipWidth: 0.10,            // width of the travelling dip under the rider, in span fraction
  gate: Object.freeze({ height: 2.42, halfWidth: 0.58, back: 0.30, postRadius: 0.055, signRadius: 0.20 }),
  /** Striped cable ahead of the brake zone: `lead` of it is warning, the rest reaches the net. */
  marker: Object.freeze({ length: 3.40, lead: 0.75, bands: 10, radius: 0.038 }),
  net: Object.freeze({
    width: 1.85, drop: 1.45, mesh: 0.20, rope: 0.011, weight: 0.17, bar: 0.045,
    push: 0.35,              // metres the rider keeps the panel ahead of themselves
    returnSpeed: 0.55,       // m/s it slides back to its rest position once the cable is clear
  }),
  /**
   * The sling leans forward and hangs off a spreader, so the straps run down the *sides* of the
   * rider's view instead of straight through it – hung plumb they sit exactly where the face is.
   */
  trolley: Object.freeze({ wheel: 0.055, body: 0.16, bar: 0.60, reach: 0.23, spread: 0.15, strapSpread: 0.30, strap: 0.010 }),
  /** GDD §3.4 difficulty table: the Flying Fox is easy on the body and hard on the head. */
  metrics: Object.freeze({ physical: 1, coordination: 2, psychological: 2, technical: 3 }),
  walkSpeed: 0.6, slipAngle: 1.5, staminaDrain: 0,
  windGain: 0.06,
  wobble: Object.freeze({
    lateralHz: 0.22, verticalHz: 0.62, lateralDamping: 0.30, verticalDamping: 0.28,
    maxLateral: 0.10, maxVertical: 0.22, verticalRatio: 1.0,
  }),
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * @param {object} spec see `createElementBase`; additionally `spec.landing` = { stand, groundY }
 * @param {{ scene, physics, rng, timber, wind }} ctx
 * @returns {object} element
 */
export function createZipline(spec, ctx) {
  const run = Math.hypot(spec.exit.position.x - spec.entry.position.x, spec.exit.position.z - spec.entry.position.z);
  const config = { ...ZIPLINE, lifelineHeight: ZIPLINE.cableHeight, lifelineSag: ZIPLINE.sagRatio * run };
  const rider = { s: null, dip: 0 };
  let netRest = 0, netAt = 0;
  let cableGeometry = null, trolleyGroup = null, netGroup = null;

  const element = createElementBase(spec, ctx, {
    config,
    metrics: ZIPLINE.metrics,
    handHold: { available: true, heightAboveFoot: ZIPLINE.cableHeight, side: "both" },
    build: (builder, frame, el) => buildZipline(builder, frame, el, ctx),
    update: (dt, elapsed, el) => {
      const at = rider.s == null ? 0 : cableGeometry.fractionOf(rider.s);
      // The net is a loose weighted panel: a rider shoves it along the cable, and once they are off
      // it slides back down to where it hangs at rest – slowly, because the cable is nearly level
      // there and the panel is heavy.
      const back = (ZIPLINE.net.returnSpeed * dt) / Math.max(1, cableGeometry.length);
      netAt = rider.s == null
        ? Math.max(netRest, netAt - back)
        : Math.max(netAt, cableGeometry.fractionOf(rider.s + ZIPLINE.net.push));
      place(netGroup, cableGeometry, netAt);
      if (trolleyGroup) place(trolleyGroup, cableGeometry, at);
      el.dip = rider.dip;
      el.dipAt = at;
    },
    displace: (offsets, el) => {
      offsets[0] = 0;
      offsets[1] = -(el.dip || 0) - Math.abs(el.wobble.vertical) * 0.35;
      offsets[2] = el.wobble.lateral * 0.5;
    },
    shape: (u, group, el) => dipProfile(u, el.dipAt == null ? 0.5 : el.dipAt),
  });

  // --- the ride ---------------------------------------------------------------------------------------
  const zip = createZipPhysics({
    start: element.lifeline.start, end: element.lifeline.end,
    sagRatio: ZIPLINE.sagRatio, massKg: ZIP_PHYSICS.refMassKg,
  });
  const brake = createNetBrake({ length: zip.length });
  netRest = brake.netAt / zip.length;
  netAt = netRest;

  /** The ride model – js/player/on-zipline.js drives it, this module draws what it says. */
  element.zip = zip;
  element.brake = brake;
  /** Hand the interaction over to the zipline state instead of the walk-a-rail one. */
  element.playerState = "zipline";
  /** Downhill only (GDD §3.4 "Einbahn") – you cannot clip in at the landing and ride back up. */
  element.oneWay = true;
  /** Both cable ends are dead-ends on a post: reachable from anywhere on their deck. */
  element.anchorRange = 2.6;
  element.enterPrompt = "Sit in [E]";
  element.clipPrompt = "Clip to the zip line [F]";
  element.seatDrop = ZIPLINE.seatDrop;
  element.slingLength = ZIPLINE.slingLength;
  element.landing = spec.landing || null;
  element.dip = 0;
  element.dipAt = 0;

  /**
   * Where the trolley is and how far the cable is pulled down under it.
   * @param {number|null} s arc position, or null to park the trolley at the start gate
   * @param {number} [dip] metres the cable gives way under the rider
   */
  element.setRider = function setRider(s, dip = 0) {
    rider.s = s;
    rider.dip = dip;
    if (s == null) { brake.reset(); netAt = Math.max(netAt, netRest); }
  };

  /** World position of the trolley pin at arc position `s`. */
  element.trolleyAt = function trolleyAt(s, out) { return zip.pointAt(s, out); };

  const baseExit = element.getExitAnchor;
  element.getExitAnchor = function getExitAnchor() {
    const anchor = baseExit();
    if (spec.landing && spec.landing.stand) anchor.stand = spec.landing.stand.clone();
    return anchor;
  };

  function buildZipline(builder, frame, el, context) {
    const groups = [];
    cableGeometry = createCableGeometry(frame, el.config, zip);
    groups.push(buildFixed(builder, frame, el, cableGeometry));
    const cable = buildCable(builder, frame, el);
    groups.push(cable);
    netGroup = buildNet(builder, el.id, context.rng);
    groups.push(netGroup);
    trolleyGroup = buildTrolley(builder, el.id);
    groups.push(trolleyGroup);
    return {
      groups,
      swing: {
        meshes: cable.children.filter((c) => c.isMesh),
        groupCount: 1,
        classify: (x) => ({ u: clamp01(x / frame.length), group: 0, weight: 1 }),
      },
    };
  }

  return element;
}

registerElementKind("zipline", createZipline);

/** A dip that travels with the rider and is pinned to zero at both anchors. */
function dipProfile(u, at) {
  const d = (clamp01(u) - at) / ZIPLINE.dipWidth;
  return Math.exp(-d * d) * Math.sin(Math.PI * clamp01(u));
}

/**
 * Element-local shape of the cable, so the geometry, the trolley and the net all read one curve.
 * `fractionOf(s)` maps an arc position from the ride model onto that span fraction.
 */
function createCableGeometry(frame, config, zip) {
  const L = frame.length, h = config.lifelineHeight, sag = config.sag, rise = frame.rise;
  return {
    length: L,
    yAt(u) { return h + rise * u - sag * 4 * u * (1 - u); },
    /** Cable pitch at `u` (radians, negative going down) – the trolley and net hang square to it. */
    pitchAt(u) { return Math.atan2(rise - sag * 4 * (1 - 2 * u), L); },
    /** Arc position (metres, from the ride model) → span fraction – the ride model owns that map. */
    fractionOf(s) { return zip.fractionAt(s); },
  };
}

/** Put a hanging group (net, trolley) onto the cable at span fraction `u`. */
function place(group, cable, u) {
  if (!group) return;
  const t = clamp01(u);
  group.position.set(t * cable.length, cable.yAt(t), 0);
  group.rotation.z = cable.pitchAt(t);
}

/** The main cable on its own, so the deformer can pull it down without moving the hardware. */
function buildCable(builder, frame, element) {
  const h = element.config.lifelineHeight;
  cableRun(builder, {
    from: { x: 0, y: h, z: 0 }, to: { x: frame.length, y: frame.rise + h, z: 0 },
    sag: element.config.sag, radius: ZIPLINE.cableRadius, material: "steel",
    segments: Math.max(48, Math.round(frame.length * 2.2)),
  });
  return builder.build(`${element.id}-cable`);
}

/** Everything that does not move: terminations, the start gate and the marker sleeve. */
function buildFixed(builder, frame, element, cable) {
  const h = element.config.lifelineHeight;
  const end = frame.rise + h;
  cableTermination(builder, { at: { x: 0, y: h, z: 0 }, along: { x: 1, y: 0, z: 0 }, radius: ZIPLINE.cableRadius });
  cableTermination(builder, { at: { x: frame.length, y: end, z: 0 }, along: { x: -1, y: 0, z: 0 }, radius: ZIPLINE.cableRadius });
  builder.cylinderBetween({                                    // dead end back around the trunk
    from: { x: 0.02, y: h, z: 0 }, to: { x: -1.25, y: h + 0.03, z: 0 }, radius: 0.026, segments: 8, material: "steel",
  });
  builder.box({ length: 0.30, width: 0.06, thickness: 0.06, position: { x: -0.55, y: h + 0.015, z: 0 }, material: "steel" });
  buildGate(builder, element);
  buildMarker(builder, element, cable);
  return builder.build(`${element.id}-fixed`);
}

/**
 * The start gate: two posts, a beam the cable runs under, and the round pictogram every park hangs
 * there – sit down, legs up. It is the last thing the rider reads before they push off.
 */
function buildGate(builder, element) {
  const G = ZIPLINE.gate;
  const x = -G.back;
  for (const z of [-G.halfWidth, G.halfWidth]) {
    builder.cylinderBetween({ from: { x, y: -0.12, z }, to: { x, y: G.height, z }, radius: G.postRadius, segments: 9 });
  }
  builder.cylinderBetween({
    from: { x, y: G.height - 0.04, z: -G.halfWidth - 0.08 }, to: { x, y: G.height - 0.04, z: G.halfWidth + 0.08 },
    radius: G.postRadius * 0.85, segments: 9,
  });
  for (let i = 0; i < 4; i++) {                                // red/white banding down one post
    builder.cylinderBetween({
      from: { x, y: 0.35 + i * 0.36, z: -G.halfWidth }, to: { x, y: 0.53 + i * 0.36, z: -G.halfWidth },
      radius: G.postRadius + 0.004, segments: 9, material: i % 2 ? "chalk" : "signal",
    });
  }
  builder.plate({
    radius: G.signRadius, position: { x: x - 0.075, y: G.height - 0.46, z: 0 },
    rotation: { x: 0, y: -Math.PI / 2, z: 0 },
  });
  builder.cylinderBetween({
    from: { x, y: G.height - 0.06, z: 0 }, to: { x, y: G.height - 0.46 + G.signRadius, z: 0 },
    radius: 0.012, segments: 6, material: "steel",
  });
}

/** Red-and-white sleeve on the cable: from here on the legs stay up. */
function buildMarker(builder, element, cable) {
  const M = ZIPLINE.marker;
  const u0 = cable.fractionOf(Math.max(0, element.brake.zoneStart - M.length * M.lead));
  const step = M.length / M.bands / cable.length;
  for (let i = 0; i < M.bands; i++) {
    const a = u0 + i * step, b = u0 + (i + 1) * step;
    builder.cylinderBetween({
      from: { x: a * cable.length, y: cable.yAt(a), z: 0 },
      to: { x: b * cable.length, y: cable.yAt(b), z: 0 },
      radius: M.radius, segments: 8, material: i % 2 ? "chalk" : "signal",
    });
  }
}

/**
 * The braking net: a weighted panel of hemp mesh hanging from a short carrier on the cable. Built
 * around its own origin so it can slide along the cable when a rider pushes into it.
 */
function buildNet(builder, id, rng) {
  const N = ZIPLINE.net;
  const half = N.width / 2;
  builder.cylinderBetween({ from: { x: -0.16, y: 0, z: 0 }, to: { x: 0.16, y: 0, z: 0 }, radius: 0.028, segments: 10, material: "steel" });
  for (const z of [-half, half]) {
    builder.cylinderBetween({ from: { x: 0, y: -0.04, z: 0 }, to: { x: 0, y: -0.34, z }, radius: 0.012, segments: 6, material: "steel" });
    builder.cylinderBetween({ from: { x: 0, y: -0.34, z }, to: { x: 0, y: -0.34 - N.drop, z }, radius: N.rope, segments: 6, material: "cord" });
  }
  // The spreader along the top is painted like every warning in a park: you are meant to spot this
  // from thirty metres away and remember what it wants from you.
  const bands = 7;
  for (let i = 0; i < bands; i++) {
    const a = -half + (i / bands) * N.width, b = -half + ((i + 1) / bands) * N.width;
    builder.cylinderBetween({
      from: { x: 0, y: -0.34, z: a }, to: { x: 0, y: -0.34, z: b },
      radius: N.bar, segments: 8, material: i % 2 ? "chalk" : "signal",
    });
  }
  const columns = Math.max(4, Math.round(N.width / N.mesh));
  const rows = Math.max(4, Math.round(N.drop / N.mesh));
  for (let c = 1; c < columns; c++) {
    const z = -half + (c / columns) * N.width;
    builder.cylinderBetween({ from: { x: 0, y: -0.34, z }, to: { x: 0, y: -0.34 - N.drop, z }, radius: N.rope * 0.85, segments: 5, material: "cord" });
  }
  for (let r = 1; r <= rows; r++) {
    const y = -0.34 - (r / rows) * N.drop;
    builder.cylinderBetween({ from: { x: 0, y, z: -half }, to: { x: 0, y, z: half }, radius: N.rope * 0.85, segments: 5, material: "cord" });
    for (let c = 0; c <= columns; c += 2) {
      netKnot(builder, { at: { x: 0, y, z: -half + (c / columns) * N.width }, size: N.rope * 2.4, yaw: rng.float(-0.5, 0.5) });
    }
  }
  builder.box({                                                // the weight that makes it brake
    length: N.width * 0.9, width: 0.16, thickness: N.weight,
    position: { x: 0, y: -0.34 - N.drop - N.weight / 2, z: 0 }, rotation: { x: 0, y: Math.PI / 2, z: 0 }, material: "rubber",
  });
  return builder.build(`${id}-net`);
}

/**
 * The gate sign: a rider seated in the harness under a trolley with the knees pulled up, and a red
 * arc under the feet for the net. Two strokes of information – sit down, legs up – which is exactly
 * what the brake zone asks for. Canvas only; `js/park/first-course.js` hands it to the timber kit.
 * @param {number} [size] texture edge in pixels
 */
export function createZipPictogram(size = 256) {
  const { canvas, ctx } = createCanvas(size, size);
  const c = size / 2, r = size * 0.5;
  ctx.fillStyle = "#f5f3ed";
  ctx.beginPath(); ctx.arc(c, c, r * 0.98, 0, Math.PI * 2); ctx.fill();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#15181a";
  ctx.fillStyle = "#15181a";

  ctx.lineWidth = r * 0.075;                                   // rim
  ctx.beginPath(); ctx.arc(c, c, r * 0.86, 0, Math.PI * 2); ctx.stroke();

  const cableY = c - r * 0.56;                                 // the zip cable, running downhill
  ctx.lineWidth = r * 0.07;
  ctx.beginPath(); ctx.moveTo(c - r * 0.68, cableY - r * 0.10); ctx.lineTo(c + r * 0.68, cableY + r * 0.10); ctx.stroke();

  ctx.lineWidth = r * 0.09;                                    // trolley and sling
  ctx.beginPath(); ctx.rect(c - r * 0.11, cableY - r * 0.03, r * 0.22, r * 0.17); ctx.stroke();
  ctx.lineWidth = r * 0.06;
  ctx.beginPath(); ctx.moveTo(c, cableY + r * 0.14); ctx.lineTo(c - r * 0.04, c - r * 0.06); ctx.stroke();

  ctx.beginPath();                                             // head
  ctx.arc(c - r * 0.10, c - r * 0.16, r * 0.115, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = r * 0.105;                                   // torso, sitting back in the harness
  ctx.beginPath(); ctx.moveTo(c - r * 0.12, c - r * 0.04); ctx.lineTo(c - r * 0.02, c + r * 0.24); ctx.stroke();
  ctx.lineWidth = r * 0.075;                                   // arms up on the sling
  ctx.beginPath(); ctx.moveTo(c - r * 0.10, c + r * 0.02); ctx.lineTo(c - r * 0.02, cableY + r * 0.20); ctx.stroke();
  ctx.lineWidth = r * 0.095;                                   // thigh forward, shin tucked up
  ctx.beginPath();
  ctx.moveTo(c - r * 0.02, c + r * 0.24); ctx.lineTo(c + r * 0.34, c + r * 0.14); ctx.lineTo(c + r * 0.30, c - r * 0.18);
  ctx.stroke();

  ctx.strokeStyle = "#d8342c";                                 // the net, safely below the feet
  ctx.lineWidth = r * 0.075;
  ctx.beginPath(); ctx.arc(c + r * 0.10, c + r * 0.96, r * 0.55, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  return toTexture(canvas, { srgb: true, repeat: false });
}

/**
 * Two steel rollers in an orange housing, the sling and the bar the hands find on their own. The
 * sling leans forward by `reach`: hung straight down it would sit exactly where the rider's face is
 * and fill half the first-person view with a blue post.
 */
function buildTrolley(builder, id) {
  const T = ZIPLINE.trolley;
  const barY = -ZIPLINE.slingLength;
  for (const x of [-T.body / 2, T.body / 2]) {                 // the two wheels, straddling the cable
    builder.cylinderBetween({ from: { x, y: 0, z: -0.016 }, to: { x, y: 0, z: 0.016 }, radius: T.wheel, segments: 14, material: "steel" });
  }
  for (const z of [-0.05, 0.05]) {                             // side plates
    builder.box({ length: T.body + 0.10, width: 0.012, thickness: 0.15, position: { x: 0, y: -0.03, z }, rotation: { x: 0, y: Math.PI / 2, z: 0 }, material: "signal" });
  }
  builder.box({ length: T.body, width: 0.09, thickness: 0.035, position: { x: 0, y: -0.105, z: 0 }, material: "steel" });
  builder.torus({ centre: { x: 0, y: -0.15, z: 0 }, radius: 0.035, tube: 0.007, segments: 16, material: "steel" });
  builder.cylinderBetween({                                    // spreader the straps hang from
    from: { x: 0.02, y: -0.175, z: -T.spread }, to: { x: 0.02, y: -0.175, z: T.spread },
    radius: 0.016, segments: 8, material: "steel",
  });
  for (const side of [-1, 1]) {                                // two straps out to the ends of the bar
    builder.cylinderBetween({
      from: { x: 0.02, y: -0.18, z: side * T.spread },
      to: { x: T.reach, y: barY, z: side * T.strapSpread },
      radius: T.strap, segments: 6, material: "rope",
    });
  }
  builder.cylinderBetween({
    from: { x: T.reach, y: barY, z: -T.bar / 2 }, to: { x: T.reach, y: barY, z: T.bar / 2 },
    radius: 0.024, segments: 10, material: "rubber",
  });
  return builder.build(`${id}-trolley`);
}
