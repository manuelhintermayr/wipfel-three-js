// Horizontal cargo net – 1.2 m wide, 15 cm mesh, six metres of knotted rope slung between two side
// cables, with hand ropes overhead. It is the exercise nobody falls off (GDD §3.4, "Netze, Röhren ·
// 4·1·1·1"): no balance problem at all, but every step sinks into the mesh and has to be pulled out
// again, so it costs strength and time. Its job in a course is to let the nerves come back down.
//
// The net sags where the climber actually stands, which is the one thing that makes it read as rope
// and not as a carpet: the deformer's per-frame shape function is a bump that follows the feet.

import { createElementBase, registerElementKind, ELEMENT } from "./element.js";
import { cableRun, cableTermination, ropeStrand, lifelineCable, netKnot } from "./element-parts.js";

export const NET = Object.freeze({
  width: 1.20,               // clear width of the net
  mesh: 0.15,                // 10–15 cm mesh (RESEARCH-DATA §3)
  ropeRadius: 0.009,
  cableRadius: 0.006,
  handHeight: 1.32,          // hand ropes above the walking level, out over the side cables
  handSpread: 0.56,
  handSag: 0.09,
  standardSpacing: 1.4,      // stanchion ropes from the hand rope down to the side cable
  sagRatio: 0.022,           // the unloaded net already hangs
  loadSag: 0.20,             // metres the mesh gives way under a climber
  loadWidth: 0.11,           // width of that dent, in rail parameter
  loadRise: 4.5,             // 1/s – how fast the dent forms and recovers
  knotEvery: 2,              // knot lumps on every n-th crossing (all of them is a lot of geometry)
  walkSpeed: 0.58,
  slipAngle: 1.20,           // effectively unfalloffable – you sit down before you slip
  staminaDrain: 0.055,       // this is where the arms go
  lifelineHeight: ELEMENT.lifelineHeight,
  lifelineSag: 0.04,
  standBack: 0.45,
  metrics: Object.freeze({ physical: 4, coordination: 1, psychological: 1, technical: 1 }),
  wobble: Object.freeze({
    lateralHz: 0.30, verticalHz: 0.75, lateralDamping: 0.35, verticalDamping: 0.42,
    maxLateral: 0.06, maxVertical: 0.09, verticalRatio: 0.8,
  }),
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * @param {object} spec see `createElementBase`
 * @param {{ scene, physics, rng, timber, wind }} ctx
 * @returns {object} element
 */
export function createNetBridge(spec, ctx) {
  const load = { depth: 0, at: 0.5 };                          // the dent the climber presses into the net

  const element = createElementBase(spec, ctx, {
    config: NET,
    metrics: NET.metrics,
    handHold: { available: true, heightAboveFoot: NET.handHeight, side: "both" },
    build: (builder, frame, el) => buildNet(builder, frame, el, ctx),
    footholdAt: (t, el) => ({
      discrete: true, index: Math.round((t * el.length) / NET.mesh), t, offset: 0, ready: 1,
      swing: 0, plank: null,
    }),
    update: (dt, elapsed, el) => {
      const wanted = el.occupancy.active ? NET.loadSag : 0;
      load.depth += (wanted - load.depth) * Math.min(1, NET.loadRise * dt);
      if (el.occupancy.active) load.at += (el.occupancy.t - load.at) * Math.min(1, 8 * dt);
    },
    offsetAt: (u, out, el) => out.set(
      0,
      -el.config.sag * 4 * u * (1 - u) - load.depth * dentProfile(u, load.at) + el.wobble.vertical * 0.4,
      el.wobble.lateral * 0.4,
    ),
    displace: (offsets, el) => {
      offsets[0] = 0;
      offsets[1] = -(load.depth + Math.abs(el.wobble.vertical) * 0.4);
      offsets[2] = 0;
    },
    shape: (u) => dentProfile(u, load.at),
  });

  element.load = load;
  return element;
}

registerElementKind("net-bridge", createNetBridge);

/** A dent centred on the climber, pinned to zero at both platforms. */
function dentProfile(u, at) {
  const d = (clamp01(u) - at) / NET.loadWidth;
  return Math.exp(-d * d) * Math.sin(Math.PI * clamp01(u));
}

function buildNet(builder, frame, element, ctx) {
  const L = frame.length;
  const half = NET.width / 2;
  const sag = element.config.sag;
  const y = (x) => frame.rise * (x / L) - sag * 4 * (x / L) * (1 - x / L);

  // --- static: lifeline, side cables, hand ropes, stanchions ----------------------------------------
  lifelineCable(builder, frame, element);
  for (const side of [-1, 1]) {
    cableRun(builder, {
      from: { x: 0, y: 0, z: side * half }, to: { x: L, y: frame.rise, z: side * half },
      sag, radius: NET.cableRadius, material: "steel",
    });
    cableRun(builder, {
      from: { x: 0, y: NET.handHeight, z: side * NET.handSpread },
      to: { x: L, y: frame.rise + NET.handHeight, z: side * NET.handSpread },
      sag: NET.handSag, radius: NET.cableRadius, material: "steel",
    });
    for (const [x, dir] of [[0, 1], [L, -1]]) {
      const base = dir > 0 ? 0 : frame.rise;
      cableTermination(builder, { at: { x, y: base, z: side * half }, along: { x: dir, y: 0, z: 0 }, radius: NET.cableRadius });
      cableTermination(builder, { at: { x, y: base + NET.handHeight, z: side * NET.handSpread }, along: { x: dir, y: 0, z: 0 }, radius: NET.cableRadius });
    }
    const stanchions = Math.max(2, Math.round(L / NET.standardSpacing));
    for (let i = 1; i < stanchions; i++) {
      const x = (i / stanchions) * L;
      const bow = 4 * (x / L) * (1 - x / L);
      ropeStrand(builder, {
        from: { x, y: frame.rise * (x / L) + NET.handHeight - NET.handSag * bow, z: side * NET.handSpread },
        to: { x, y: y(x), z: side * half },
        radius: NET.ropeRadius * 0.85, material: "cord", twist: 0.7,
      });
    }
  }
  const statics = builder.build(`${element.id}-fixed`);

  // --- swinging: the mesh itself --------------------------------------------------------------------
  const lines = Math.max(5, Math.round(NET.width / NET.mesh) + 1);
  const rungs = Math.max(6, Math.round(L / NET.mesh));
  for (let j = 0; j < lines; j++) {                            // ropes along the walk direction
    const z = -half + (j / (lines - 1)) * NET.width;
    cableRun(builder, {
      from: { x: 0, y: 0, z }, to: { x: L, y: frame.rise, z },
      sag, radius: NET.ropeRadius, material: "cord", segments: Math.max(10, Math.round(L * 3)),
    });
  }
  for (let i = 0; i <= rungs; i++) {                           // ropes across it
    const x = (i / rungs) * L;
    builder.cylinderBetween({
      from: { x, y: y(x) + 0.004, z: -half }, to: { x, y: y(x) + 0.004, z: half },
      radius: NET.ropeRadius * 0.92, segments: 5, material: "cord",
    });
    if (i % NET.knotEvery) continue;
    for (let j = 0; j < lines; j++) {
      const z = -half + (j / (lines - 1)) * NET.width;
      netKnot(builder, { at: { x, y: y(x) + 0.004, z }, size: NET.ropeRadius * 2.6, yaw: ctx.rng.float(-0.5, 0.5) });
    }
  }
  const mesh = builder.build(`${element.id}-net`);

  return {
    groups: [statics, mesh],
    swing: {
      meshes: mesh.children.filter((c) => c.isMesh),
      groupCount: 1,
      // the mesh is pinned at the platforms; `shape` supplies the moving dent every frame
      classify: (x) => ({ u: clamp01(x / L), group: 0, weight: 1 }),
    },
  };
}
