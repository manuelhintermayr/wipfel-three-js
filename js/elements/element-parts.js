// The hardware every rail element is made of, drawn once and reused: sagging steel cables, swaged
// end clamps with thimbles, laid rope with a visible twist, and the safety cable that runs above
// everything. All of it is queued into a timber builder (js/park/timber.js) in element-local metres
// and merged into one mesh per material.

import { ELEMENT } from "./element.js";

export const PARTS = Object.freeze({
  cableSegments: 3.2,        // tube segments per metre of cable
  clampRadius: 0.019,        // swaged aluminium sleeve on a 12 mm wire
  clampLength: 0.085,
  thimbleRadius: 0.045,
  bracketRadius: 0.014,
  ropeTwistPitch: 0.055,     // metres per lay of a laid rope
  ropeTwistDepth: 0.55,      // fraction of the rope radius the lay wanders
});

/**
 * A cable hanging between two points with a parabolic sag.
 * @param {object} builder timber builder
 * @param {{ from: {x,y,z}, to: {x,y,z}, sag?: number, radius?: number, material?: string,
 *   segments?: number, spread?: number }} o
 *   `spread` bows the cable sideways at midspan (the hand cables of a Burma bridge fan out).
 * @returns {Array<{x:number,y:number,z:number}>} the sampled centre line, for hanging things off it
 */
export function cableRun(builder, { from, to, sag = 0, radius = ELEMENT.cableRadius, material = "steel", segments = 0, spread = 0 }) {
  const span = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const knots = Math.max(6, segments || Math.round(span * PARTS.cableSegments));
  const points = [];
  for (let i = 0; i <= knots; i++) {
    const t = i / knots;
    const bow = 4 * t * (1 - t);
    points.push({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t - sag * bow,
      z: from.z + (to.z - from.z) * t + spread * bow,
    });
  }
  builder.tube({ points, radius, segments: knots * 2, radialSegments: 5, material });
  return points;
}

/**
 * Laid rope: a tube whose centre line wanders in a helix, so the lay of the strands is visible
 * from a metre away without a single texture.
 * @param {{ from, to, radius?, material?, twist?: number }} o
 */
export function ropeStrand(builder, { from, to, radius = 0.011, material = "cord", twist = 1 }) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const span = Math.hypot(dx, dy, dz) || 1e-4;
  const ux = dx / span, uy = dy / span, uz = dz / span;
  // two axes perpendicular to the rope: p = u × reference, q = u × p
  const ref = Math.abs(uy) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let px = uy * ref[2] - uz * ref[1], py = uz * ref[0] - ux * ref[2], pz = ux * ref[1] - uy * ref[0];
  const pl = Math.hypot(px, py, pz) || 1;
  px /= pl; py /= pl; pz /= pl;
  const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px;

  const knots = Math.max(8, Math.round((span / PARTS.ropeTwistPitch) * 3));
  const wander = radius * PARTS.ropeTwistDepth * twist;
  const points = [];
  for (let i = 0; i <= knots; i++) {
    const t = i / knots;
    const a = (span * t / PARTS.ropeTwistPitch) * Math.PI * 2;
    const c = Math.cos(a) * wander, s = Math.sin(a) * wander;
    points.push({
      x: from.x + dx * t + px * c + qx * s,
      y: from.y + dy * t + py * c + qy * s,
      z: from.z + dz * t + pz * c + qz * s,
    });
  }
  builder.tube({ points, radius, segments: knots, radialSegments: 5, material });
  return points;
}

/**
 * The swaged sleeves and the shackle pin that terminate a cable at a platform – the detail that
 * tells the player this is real hardware and not a line drawn in the air.
 * @param {{ at: {x,y,z}, along: {x,y,z}, radius?: number }} o `along` points back into the span
 */
export function cableTermination(builder, { at, along, radius = ELEMENT.cableRadius }) {
  const l = Math.hypot(along.x, along.y, along.z) || 1;
  const d = { x: along.x / l, y: along.y / l, z: along.z / l };
  const off = (m) => ({ x: at.x + d.x * m, y: at.y + d.y * m, z: at.z + d.z * m });
  for (const m of [0.10, 0.19]) {                              // two swaged aluminium sleeves
    builder.cylinderBetween({ from: off(m), to: off(m + PARTS.clampLength), radius: PARTS.clampRadius, segments: 8, material: "steel" });
  }
  builder.cylinderBetween({                                    // shackle pin across the eye
    from: { x: at.x + d.z * 0.05, y: at.y, z: at.z - d.x * 0.05 },
    to: { x: at.x - d.z * 0.05, y: at.y, z: at.z + d.x * 0.05 },
    radius: radius * 2.2, segments: 8, material: "steel",
  });
}

/**
 * The 12 mm lifeline above the walking line, from platform ring to platform ring, on two standoff
 * brackets. Static: the carabiners ride it and it must not move with the exercise.
 * @param {object} builder
 * @param {{ length: number, rise: number }} frame
 * @param {{ lifeline: { heightAboveFoot: number }, config: object }} element
 */
export function lifelineCable(builder, frame, element) {
  const h = element.lifeline.heightAboveFoot;
  const sag = element.config.lifelineSag == null ? 0.06 : element.config.lifelineSag;
  cableRun(builder, {
    from: { x: 0, y: h, z: 0 }, to: { x: frame.length, y: frame.rise + h, z: 0 },
    sag, radius: ELEMENT.lifelineRadius, material: "steel",
  });
  for (const [x, y] of [[0, h], [frame.length, frame.rise + h]]) {
    const dir = x === 0 ? 1 : -1;
    cableTermination(builder, { at: { x, y, z: 0 }, along: { x: dir, y: 0, z: 0 }, radius: ELEMENT.lifelineRadius });
    builder.cylinderBetween({                                  // standoff arm back towards the trunk
      from: { x: x - dir * 0.02, y, z: 0 }, to: { x: x - dir * 0.30, y: y - 0.06, z: 0 },
      radius: PARTS.bracketRadius, segments: 6, material: "steel",
    });
  }
}

/** A knot on a cargo net: a small hemp lump where two ropes cross. */
export function netKnot(builder, { at, size = 0.028, yaw = 0 }) {
  builder.box({
    length: size * 2.1, width: size * 1.6, thickness: size * 1.6,
    position: at, rotation: { x: 0, y: yaw, z: Math.PI / 5 }, material: "cord",
  });
}
