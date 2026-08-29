// Fässer – four to six floating barrels (Ø 60 cm, 0.9 m long) strung on a steel axle cable that hangs
// from two overhead carrier cables. There is no hand cable at all: the whole exercise is the barrel
// rolling under the foot the moment weight comes onto it (RESEARCH-DATA §3 Designannahmen, GDD §3.4
// "Skateboard, Snowboard, Fässer · 2·5·3·2" – a moving surface you have to read, not fight).
//
// The roll itself needs a true rotation, which the shared vertex deformer cannot do (it only ever
// offsets vertices, never spins them) – so each barrel is its own small mesh, sitting next to the
// merged static hardware, and `update()` spins whichever one the climber's weight is currently over.

import * as THREE from "three";
import { createElementBase, registerElementKind, ELEMENT } from "./element.js";
import { cableRun, cableTermination, lifelineCable } from "./element-parts.js";

export const BARRELS = Object.freeze({
  radius: 0.30,              // Ø 60 cm (RESEARCH-DATA §3 Designannahmen)
  length: 0.90,
  spacing: 1.45,              // axle to axle
  endMargin: 0.55,
  minCount: 4,
  maxCount: 6,
  hangHeight: 1.55,           // the two overhead carrier cables
  hangSpread: 0.30,
  chainRadius: 0.008,
  cableRadius: 0.006,
  axleRadius: 0.012,          // the steel rod the barrels roll on
  sagRatio: 0.010,
  walkSpeed: 0.55,
  slipAngle: 0.30,
  staminaDrain: 0.010,
  lifelineHeight: ELEMENT.lifelineHeight,
  lifelineSag: 0.05,
  standBack: 0.45,
  windGain: 0.10,
  metrics: Object.freeze({ physical: 2, coordination: 5, psychological: 3, technical: 2 }),
  wobble: Object.freeze({
    lateralHz: 0.85, verticalHz: 1.6, lateralDamping: 0.14, verticalDamping: 0.28,
    maxLateral: 0.22, maxVertical: 0.10, verticalRatio: 0.40,
  }),
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * @param {object} spec see `createElementBase`
 * @param {{ scene, physics, rng, timber, wind }} ctx
 * @returns {object} element
 */
export function createBarrels(spec, ctx) {
  /** @type {Array<{ index, x, mesh: THREE.Mesh }>} */
  const barrels = [];
  let lastOccupiedT = 0;

  const element = createElementBase(spec, ctx, {
    config: BARRELS,
    metrics: BARRELS.metrics,
    // the whole point: nothing to hold onto, the barrel itself is the balance problem
    handHold: { available: false, heightAboveFoot: 0, side: "none" },
    build: (builder, frame, el) => buildBarrels(builder, frame, el, ctx, barrels),
    update: (dt, elapsed, el) => rollUnderfoot(dt, el, barrels, lastOccupiedT, (t) => { lastOccupiedT = t; }),
  });

  return element;
}

registerElementKind("barrels", createBarrels);

/** Spin whichever barrel the climber's weight is currently over, at the speed they crossed it. */
function rollUnderfoot(dt, element, barrels, lastT, setLastT) {
  if (!barrels.length || !(dt > 0) || !element.occupancy.active) { setLastT(element.occupancy.t); return; }
  // clamped: a teleport-like re-entry (recovering from a fall elsewhere on the span) must not spin a
  // barrel through several turns in one frame, only a normal step's worth of roll
  const raw = (element.occupancy.t - lastT) * element.length;
  const travelled = Math.max(-BARRELS.spacing, Math.min(BARRELS.spacing, raw));
  setLastT(element.occupancy.t);
  const nearest = nearestBarrel(element.occupancy.t * element.length, barrels);
  if (nearest) nearest.mesh.rotation.z += travelled / BARRELS.radius;
}

function nearestBarrel(x, barrels) {
  let best = null, bestD = Infinity;
  for (const barrel of barrels) {
    const d = Math.abs(barrel.x - x);
    if (d < bestD) { bestD = d; best = barrel; }
  }
  return best;
}

/** How many barrels fit the span, and how far apart – whole barrels, never a stub at either end. */
function barrelLayout(span) {
  const usable = Math.max(BARRELS.spacing, span - 2 * BARRELS.endMargin);
  const count = Math.max(BARRELS.minCount, Math.min(BARRELS.maxCount, Math.round(usable / BARRELS.spacing) + 1));
  return { count, first: BARRELS.endMargin, pitch: count > 1 ? usable / (count - 1) : 0 };
}

function buildBarrels(builder, frame, element, ctx, barrels) {
  const L = frame.length;
  const { count, first, pitch } = barrelLayout(L);
  const railY = (x) => frame.rise * (x / L) - element.config.sag * 4 * (x / L) * (1 - x / L);
  const top = (x) => frame.rise * (x / L) + BARRELS.hangHeight;

  // --- static: lifeline, carrier cables, the axle rod, terminations ---------------------------------
  lifelineCable(builder, frame, element);
  for (const side of [-1, 1]) {
    cableRun(builder, {
      from: { x: 0, y: BARRELS.hangHeight, z: side * BARRELS.hangSpread },
      to: { x: L, y: frame.rise + BARRELS.hangHeight, z: side * BARRELS.hangSpread },
      sag: element.config.sag, radius: BARRELS.cableRadius, material: "steel",
    });
    for (const [x, dir] of [[0, 1], [L, -1]]) {
      cableTermination(builder, {
        at: { x, y: (dir > 0 ? 0 : frame.rise) + BARRELS.hangHeight, z: side * BARRELS.hangSpread },
        along: { x: dir, y: 0, z: 0 }, radius: BARRELS.cableRadius,
      });
    }
  }
  builder.cylinderBetween({                                   // the steel axle the barrels roll on
    from: { x: 0, y: railY(0), z: 0 }, to: { x: L, y: railY(L), z: 0 },
    radius: BARRELS.axleRadius, segments: 10, material: "steel",
  });
  const statics = builder.build(`${element.id}-fixed`);

  // --- the barrels: one small mesh each, individually rotatable, plus their hanger chains ------------
  const barrelsGroup = new THREE.Group();
  barrelsGroup.name = `${element.id}-barrels`;
  const geometry = new THREE.CylinderGeometry(BARRELS.radius, BARRELS.radius, BARRELS.length, 18, 1, false);
  geometry.rotateX(Math.PI / 2);                               // long axis → local Z, across the path
  const material = ctx.timber.materials.weathered;
  for (let i = 0; i < count; i++) {
    const x = first + i * pitch + ctx.rng.float(-0.02, 0.02);
    const y = railY(x) + BARRELS.radius;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, 0);
    // random roll start phase (spin around the barrel's own axis, .z after the geometry rotation
    // above) – NOT .y or .x, which would tilt the barrel off its cross-path alignment
    mesh.rotation.z = ctx.rng.float(0, Math.PI * 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    barrelsGroup.add(mesh);
    barrels.push({ index: i, x, mesh });
    for (const side of [-1, 1]) {                              // the two hanger chains from the cables
      builder.cylinderBetween({
        from: { x, y: top(x) - 0.03, z: side * BARRELS.hangSpread },
        to: { x, y: y + BARRELS.radius * 0.35, z: side * BARRELS.radius * 0.7 },
        radius: BARRELS.chainRadius, segments: 6, material: "steel",
      });
    }
  }
  const hangers = builder.build(`${element.id}-hangers`);

  return { groups: [statics, hangers, barrelsGroup] };
}
