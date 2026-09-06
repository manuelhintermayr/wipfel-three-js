// Block ladder – the classic ropes-park entry deck: a dark spine plank clamped flat against
// the pine trunk with wooden blocks bolted to it, left, right, left, right, all the way up. Beside it
// runs the steel safety cable the carabiners travel on, and a thin blue helper rope for the hands.
// The steps carry no colliders: climbing is rail locomotion (js/player/climb-ladder.js), so the
// player slides along `rail` instead of fighting sixteen little boxes.
//
// Local frame: origin at the trunk foot, +Z = `side` (outwards from the trunk), +Y up.
import * as THREE from "three";
import { GROUP, groups } from "../core/physics.js";
import { createTimberBuilder, disposeStructure, uprightQuaternion } from "../park/timber.js";
import { trunkRadiusAt } from "../procgen/geometry/tree-species.js";

export const BLOCK_LADDER = Object.freeze({
  spineWidth: 0.26,          // ~25 cm board
  spineThickness: 0.045,
  spineOverhang: 0.22,       // spine runs past the first and last step
  spineClearance: 0.05,      // the trunk mesh is wider than `trunkRadius` further up
  stepRise: 0.28,            // vertical spacing of the blocks
  stepLength: 0.20,          // how far a block sticks out from the spine
  stepSize: 0.105,           // 10 × 10 cm cross-section
  stepOffset: 0.145,         // left/right offset from the spine centre line
  clampCount: 3,
  rodRadius: 0.008,
  cableOffset: 0.15,         // steel cable in front of the spine face
  cableSide: 0.30,           // …and to the side, clear of the blocks
  cableRadius: 0.006,
  ropeSide: -0.29,
  ropeOffset: 0.11,
  ropeRadius: 0.008,
  railGap: 0.36,             // body centre line in front of the spine face while climbing
});

const UPRIGHT = uprightQuaternion(0);

/**
 * @param {{ scene: THREE.Scene, physics: import("../core/physics.js").Physics|null,
 *   tree: { x, y, z, trunkRadius }, fromY: number, toY: number, side: number, rng, textures }} options
 *   `fromY`/`toY` are world heights (deck level → platform level), `side` is the yaw around the trunk.
 * @returns {{ group: THREE.Group, rail: { start: THREE.Vector3, end: THREE.Vector3, length: number },
 *   safetyCable: { start: THREE.Vector3, end: THREE.Vector3 }, steps: THREE.Vector3[],
 *   colliders: Array, side: number, dispose(): void }}
 */
export function createBlockLadder({ scene, physics, tree, fromY, toY, side = 0, rng, textures }) {
  const L = BLOCK_LADDER;
  const builder = createTimberBuilder({ textures });
  const y0 = fromY - tree.y, y1 = toY - tree.y;                 // local heights
  // The trunk is much fatter at the foot (root flare) than at the platform, so every part that
  // touches it asks for the radius at its own height instead of assuming a cylinder.
  const trunkAt = (y) => trunkRadiusAt(tree, y);
  const faceAt = (y) => trunkAt(y) + L.spineClearance + L.spineThickness;

  buildSpine(builder, { y0, y1, trunkAt, rng });
  const steps = buildSteps(builder, { y0, y1, faceAt, rng });
  buildSafetyCable(builder, { y0, y1, faceAt, trunkAt });
  buildHelperRope(builder, { y0, y1, faceAt, rng });

  const group = builder.build("block-ladder");
  group.position.set(tree.x, tree.y, tree.z);
  group.rotation.y = side;
  scene.add(group);

  const toWorld = (x, y, z) => new THREE.Vector3(x, y, z).applyEuler(group.rotation).add(group.position);
  const rail = {                                               // leans in with the trunk, like the spine
    start: toWorld(0, y0, faceAt(y0) + L.railGap),
    end: toWorld(0, y1 + 0.02, faceAt(y1) + L.railGap),
    length: 0,
  };
  rail.length = rail.start.distanceTo(rail.end);
  const safetyCable = {
    start: toWorld(L.cableSide, y0 + 0.15, faceAt(y0 + 0.15) + L.cableOffset),
    end: toWorld(L.cableSide, y1 + 0.10, faceAt(y1 + 0.10) + L.cableOffset),
  };
  const colliders = physics ? createColliders(physics, { tree, y0, y1, trunkAt, side }) : [];

  return {
    group,
    side,
    /** Straight line the climber's feet travel along; `t` 0 → 1 maps start → end. */
    rail,
    /** The steel cable the carabiners run on, from the entry stub up to the platform ring. */
    safetyCable,
    /** World positions of the step block top faces (foot placement, later foot IK). */
    steps: steps.map((s) => toWorld(s.x, s.y, s.z)),
    colliders,
    dispose() {
      if (physics) for (const collider of colliders) physics.world.removeCollider(collider, false);
      disposeStructure(group, builder);
    },
  };
}

/**
 * The dark spine board, held to the trunk by clamp blocks and rods that never bite into the bark.
 * It is built as a short stack of boards rather than one long one, so it hugs the tapering trunk
 * the way a real ladder does instead of floating off it at the top.
 */
function buildSpine(builder, { y0, y1, trunkAt, rng }) {
  const L = BLOCK_LADDER;
  const bottom = y0 - L.spineOverhang, top = y1 + L.spineOverhang;
  const boards = Math.max(2, Math.round((top - bottom) / 1.1));
  const span = (top - bottom) / boards;
  for (let i = 0; i < boards; i++) {
    const y = bottom + (i + 0.5) * span;
    builder.box({                                              // UPRIGHT: length → Y, width → X, thickness → Z
      length: span + 0.01, width: L.spineWidth, thickness: L.spineThickness,
      position: { x: 0, y, z: trunkAt(y) + L.spineClearance + L.spineThickness / 2 },
      quaternion: UPRIGHT, material: "dark",
    });
  }
  for (let i = 0; i < L.clampCount; i++) {
    const y = bottom + ((i + 0.5) / L.clampCount) * (top - bottom) + rng.float(-0.08, 0.08);
    const r = trunkAt(y);
    for (const sign of [-1, 1]) {                              // a pad on each flank of the trunk
      const a = sign * Math.PI / 2;
      builder.box({
        length: 0.24, width: 0.10, thickness: 0.08,
        position: { x: Math.sin(a) * (r + 0.04), y, z: Math.cos(a) * (r + 0.04) },
        rotation: { x: 0, y: a, z: 0 }, material: "log",
      });
    }
    for (const dy of [-0.05, 0.05]) {                          // rods around the trunk, front and back
      const rod = r + 0.05;
      builder.tube({
        points: [
          { x: -rod, y: y + dy, z: 0.02 }, { x: -rod * 0.7, y: y + dy, z: -rod * 0.75 },
          { x: 0, y: y + dy, z: -rod }, { x: rod * 0.7, y: y + dy, z: -rod * 0.75 }, { x: rod, y: y + dy, z: 0.02 },
        ],
        radius: L.rodRadius, segments: 12, radialSegments: 5, material: "steel",
      });
    }
  }
}

/** Alternating blocks, each with a bolt head – the tread pattern of the photo. */
function buildSteps(builder, { y0, y1, faceAt, rng }) {
  const L = BLOCK_LADDER;
  const first = y0 + L.stepRise * 0.9;
  const count = Math.max(2, Math.floor((y1 - 0.10 - first) / L.stepRise) + 1);
  const steps = [];
  for (let i = 0; i < count; i++) {
    const y = first + i * L.stepRise;
    const x = (i % 2 === 0 ? -1 : 1) * L.stepOffset;
    const face = faceAt(y);
    const z = face + L.stepLength / 2;
    builder.box({
      length: L.stepLength, width: L.stepSize, thickness: L.stepSize,
      position: { x, y, z }, rotation: { x: 0, y: Math.PI / 2, z: rng.float(-0.012, 0.012) }, material: "plank",
    });
    builder.cylinderBetween({                                  // the bolt through spine and block
      from: { x, y, z: face - 0.05 }, to: { x, y, z: face + 0.03 },
      radius: 0.011, segments: 6, material: "steel",
    });
    steps.push({ x, y: y + L.stepSize / 2, z });
  }
  return steps;
}

/** 12 mm steel cable on standoff brackets, parallel to the ladder – the carabiners live here. */
function buildSafetyCable(builder, { y0, y1, faceAt, trunkAt }) {
  const L = BLOCK_LADDER;
  const x = L.cableSide;
  const bottom = y0 + 0.15, top = y1 + 0.10;
  const at = (y) => ({ x, y, z: faceAt(y) + L.cableOffset });
  const points = [];
  const knots = 4;
  for (let i = 0; i <= knots; i++) points.push(at(bottom + (i / knots) * (top - bottom)));
  builder.tube({ points, radius: L.cableRadius, segments: 16, radialSegments: 5, material: "steel" });
  const brackets = Math.max(2, Math.round((top - bottom) / 1.6));
  for (let i = 0; i <= brackets; i++) {
    const y = bottom + (i / brackets) * (top - bottom);
    const r = trunkAt(y);
    builder.cylinderBetween({
      from: { x: Math.sign(x) * (r * 0.5), y, z: r * 0.8 }, to: at(y),
      radius: 0.012, segments: 6, material: "steel",
    });
  }
}

/** Thin blue rope hanging beside the ladder – decoration and a hint where to put your hands. */
function buildHelperRope(builder, { y0, y1, faceAt, rng }) {
  const L = BLOCK_LADDER;
  const points = [];
  const knots = 6;
  for (let i = 0; i <= knots; i++) {
    const t = i / knots;
    const y = y0 + 0.35 + t * (y1 - y0 - 0.35);
    const sag = Math.sin(t * Math.PI) * 0.06;
    points.push({ x: L.ropeSide - sag * 0.3 + rng.float(-0.01, 0.01), y, z: faceAt(y) + L.ropeOffset + sag });
  }
  builder.tube({ points, radius: L.ropeRadius, segments: 26, radialSegments: 5, material: "rope" });
}

/** One thin slab in front of the spine so the character controller cannot walk into the trunk here. */
function createColliders(physics, { tree, y0, y1, trunkAt, side }) {
  const L = BLOCK_LADDER;
  const R = physics.RAPIER;
  const centreY = tree.y + (y0 + y1) / 2;
  const spineZ = trunkAt((y0 + y1) / 2) + L.spineClearance + L.spineThickness / 2;
  const x = tree.x + Math.sin(side) * spineZ;
  const z = tree.z + Math.cos(side) * spineZ;
  const desc = R.ColliderDesc.cuboid(L.spineWidth / 2, (y1 - y0) / 2 + L.spineOverhang, L.spineThickness)
    .setTranslation(x, centreY, z)
    .setRotation({ x: 0, y: Math.sin(side / 2), z: 0, w: Math.cos(side / 2) })
    .setCollisionGroups(groups(GROUP.STATIC));
  return [physics.world.createCollider(desc)];
}
