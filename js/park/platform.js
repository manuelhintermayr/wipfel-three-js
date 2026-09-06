// A platform around a tree, built like the ones at a real high-ropes park:
// a rectangle of round logs clamped around the trunk, planks with finger-wide gaps laid on top and
// cut around the trunk, a rubber sleeve so nothing chafes the bark, wooden clamp blocks held by
// threaded rods (never a bolt into the tree), diagonal round-log struts down to the ground on the
// low platforms – and no railing. Head height above the deck runs the 12 mm steel safety cable ring
// that the carabiners live on.
//
// Local frame: origin at the trunk foot, +X right, +Z towards `facing`, +Y up.
import * as THREE from "three";
import { GROUP, groups } from "../core/physics.js";
import { createTimberBuilder, disposeStructure, uprightQuaternion } from "./timber.js";
import { trunkRadiusAt } from "../procgen/geometry/tree-species.js";

export const PLATFORM = Object.freeze({
  plankWidth: 0.22,          // 20–25 cm boards as in the photos
  plankThickness: 0.05,
  plankGap: 0.016,           // water and pine needles fall through
  deckColliderDepth: 0.16,   // collider slab reaches into the frame – see createColliders
  logRadius: 0.06,           // 12 cm round timber
  depthRatio: 0.86,          // deck depth (Z) relative to its width (X)
  trunkClearance: 0.05,      // gap between plank ends and the clamp collar
  sleeveBelow: 0.26,
  sleeveAbove: 0.05,
  sleeveThickness: 0.02,
  clampCount: 8,             // staves standing around the trunk, visible above the deck
  clampBelow: 0.14,          // clamp block reaches this far below the deck …
  clampAbove: 0.24,          // … and this far above it
  clampWidth: 0.13,
  clampThickness: 0.075,
  rodRadius: 0.009,
  cableHeight: 1.90,         // safety cable above the deck – chest/head height
  cableRadius: 0.006,        // 12 mm steel
  cableStandoff: 0.24,       // ring radius beyond the trunk surface
  bracketCount: 4,
  strutMaxHeight: 6.5,       // below this the platform also stands on diagonal struts
  strutSpread: 0.62,         // strut foot distance from the trunk, per metre of height
  capacity: 3,               // climbers allowed on one platform (RULES.maxPerPlatform)
});

/**
 * @param {{ scene: THREE.Scene, physics: import("../core/physics.js").Physics|null,
 *   tree: { x, y, z, trunkRadius }, height: number, radius?: number,
 *   kind?: "standard"|"entry"|"transfer", facing?: number, rng, textures }} options
 *   `height` = deck surface above the trunk foot, `radius` = half the deck width,
 *   `facing` = yaw (radians) of the deck's +Z axis, normally towards the ladder.
 * @returns {{ group: THREE.Group, top: number, anchorPoints: { ring, ringCentre, ringRadius, deck },
 *   colliders: Array, kind: string, capacity: number, dispose(): void }}
 */
export function createPlatform({ scene, physics, tree, height, radius = 1.2, kind = "standard", facing = 0, rng, textures }) {
  const P = PLATFORM;
  const builder = createTimberBuilder({ textures });
  const trunkRadius = trunkRadiusAt(tree, height);             // the trunk is thinner up here
  const width = radius * 2;
  const depth = width * P.depthRatio;
  const deckY = height;                                        // local y of the deck surface
  const frameY = deckY - P.plankThickness - P.logRadius;       // centres of the frame logs
  const cut = trunkRadius + P.clampThickness + P.trunkClearance;   // clear of the clamp staves
  const lowPlatform = kind === "entry" || height <= P.strutMaxHeight;

  buildFrame(builder, { width, depth, frameY, trunkRadius, rng });
  buildDeck(builder, { width, depth, deckY, cut, rng });
  buildTrunkCollar(builder, { trunkRadius, deckY, frameY, rng });
  if (lowPlatform) buildStruts(builder, { width, depth, frameY, height, rng });
  const ringRadius = trunkRadius + P.cableStandoff;
  buildSafetyRing(builder, { trunkRadius, ringRadius, y: deckY + P.cableHeight, rng });

  const group = builder.build(`platform-${kind}`);
  group.position.set(tree.x, tree.y, tree.z);
  group.rotation.y = facing;
  scene.add(group);

  const colliders = physics ? createColliders(physics, { tree, deckY, width, depth, trunkRadius, facing }) : [];
  const toWorld = (x, y, z) => new THREE.Vector3(x, y, z).applyEuler(group.rotation).add(group.position);

  return {
    group,
    kind,
    capacity: P.capacity,
    /** World y of the deck surface – stand here. */
    top: tree.y + deckY,
    anchorPoints: {
      /** The point on the cable ring the ladder arrives at (front of the platform). */
      ring: toWorld(0, deckY + P.cableHeight, ringRadius),
      ringCentre: toWorld(0, deckY + P.cableHeight, 0),
      ringRadius,
      deck: toWorld(0, deckY, 0),
    },
    colliders,
    dispose() {
      if (physics) for (const collider of colliders) physics.world.removeCollider(collider, false);
      disposeStructure(group, builder);
    },
  };
}

/** Rectangle of round logs around the trunk plus two joists that hug it – this carries everything. */
function buildFrame(builder, { width, depth, frameY, trunkRadius, rng }) {
  const P = PLATFORM;
  const hx = width / 2, hz = depth / 2;
  const overhang = P.logRadius * 1.6;
  for (const x of [-hx, hx]) {                                 // bearers, run under every plank
    builder.cylinderBetween({ from: { x, y: frameY, z: -hz - overhang }, to: { x, y: frameY, z: hz + overhang }, radius: P.logRadius });
  }
  for (const z of [-hz, hz]) {                                 // headers, close the rectangle
    builder.cylinderBetween({ from: { x: -hx - overhang, y: frameY - P.logRadius * 0.2, z }, to: { x: hx + overhang, y: frameY - P.logRadius * 0.2, z }, radius: P.logRadius });
  }
  const inner = trunkRadius + P.logRadius + 0.10;              // two radial joists either side of the trunk
  for (const side of [-1, 1]) {
    const x = side * (inner + rng.float(0, 0.06));
    builder.cylinderBetween({ from: { x, y: frameY, z: -hz }, to: { x, y: frameY, z: hz }, radius: P.logRadius * 0.92 });
  }
}

/** Planks across the width, gapped, with a circular cut-out around the trunk sleeve. */
function buildDeck(builder, { width, depth, deckY, cut, rng }) {
  const P = PLATFORM;
  const pitch = P.plankWidth + P.plankGap;
  const count = Math.max(3, Math.round(depth / pitch));
  const y = deckY - P.plankThickness / 2;
  const hx = width / 2;
  for (let i = 0; i < count; i++) {
    const z = (i - (count - 1) / 2) * pitch;
    const half = Math.abs(z) < cut ? Math.sqrt(Math.max(0, cut * cut - z * z)) : 0;
    const plank = (from, to) => builder.box({
      length: to - from, width: P.plankWidth, thickness: P.plankThickness,
      position: { x: (from + to) / 2, y: y + rng.float(-0.002, 0.002), z }, material: "weathered",
    });
    if (half <= 0.01) plank(-hx, hx);
    else { plank(-hx, -half); plank(half, hx); }
  }
}

/**
 * The joint that carries the whole platform without hurting the tree: a rubber liner against the
 * bark, a ring of upright wooden clamp blocks pressed onto it, and two threaded steel bands drawing
 * them tight. Half of it stands above the deck, where the climber can see that nothing is screwed
 * into the trunk.
 */
function buildTrunkCollar(builder, { trunkRadius, deckY, frameY, rng }) {
  const P = PLATFORM;
  // The trunk leans a few centimetres off the placement axis, so the sleeve stops under the planks –
  // its top face would otherwise show as a dark ring around a trunk that has wandered off centre.
  builder.cylinderBetween({
    from: { x: 0, y: deckY - P.sleeveBelow, z: 0 }, to: { x: 0, y: deckY - P.plankThickness - 0.01, z: 0 },
    radius: trunkRadius + P.sleeveThickness, segments: 16, material: "rubber",
  });
  const blockR = trunkRadius + 0.005 + P.clampThickness / 2;   // staves pressed onto the bark
  const height = P.clampBelow + P.clampAbove;
  const centreY = deckY - P.clampBelow + height / 2;
  const stave = new THREE.Quaternion();
  for (let i = 0; i < P.clampCount; i++) {
    const a = (i / P.clampCount) * Math.PI * 2 + rng.float(-0.06, 0.06);
    builder.box({                                              // upright stave, flat side to the bark
      length: height, width: P.clampWidth, thickness: P.clampThickness,
      position: { x: Math.sin(a) * blockR, y: centreY, z: Math.cos(a) * blockR },
      quaternion: uprightQuaternion(a, stave), material: "log",
    });
  }
  const bandR = blockR + P.clampThickness / 2;
  for (const y of [deckY + P.clampAbove - 0.10, deckY - P.clampBelow + 0.06]) {
    builder.torus({ centre: { x: 0, y, z: 0 }, radius: bandR, tube: P.rodRadius, segments: 22, material: "steel" });
    for (let i = 0; i < 2; i++) {                              // turnbuckle nuts on the band
      const a = i * Math.PI + Math.PI / 4;
      builder.box({
        length: 0.07, width: 0.035, thickness: 0.035,
        position: { x: Math.sin(a) * bandR, y, z: Math.cos(a) * bandR }, rotation: { x: 0, y: a + Math.PI / 2, z: 0 }, material: "steel",
      });
    }
  }
  // bearer blocks under the deck that actually transfer the load into the frame
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    builder.box({
      length: 0.26, width: 0.10, thickness: 0.08,
      position: { x: Math.sin(a) * (blockR + 0.08), y: frameY - P.logRadius * 0.3, z: Math.cos(a) * (blockR + 0.08) },
      rotation: { x: 0, y: a, z: 0 }, material: "log",
    });
  }
}

/** Two diagonal round-log struts to the ground – the low platform of photo 01. */
function buildStruts(builder, { width, depth, frameY, height, rng }) {
  const P = PLATFORM;
  const foot = Math.max(1.2, height * P.strutSpread);
  const hx = width / 2, hz = depth / 2;
  for (const side of [-1, 1]) {                                // behind the deck, clear of the ladder
    builder.cylinderBetween({
      from: { x: side * hx, y: frameY - P.logRadius * 0.5, z: -hz * 0.75 },
      to: { x: side * (hx + foot * 0.45), y: -0.22, z: -hz * 0.75 - foot * rng.float(0.85, 1.0) },
      radius: P.logRadius * 1.25, segments: 9,
    });
  }
}

/** The 12 mm safety cable ring on standoff brackets – this is what the carabiners clip to. */
function buildSafetyRing(builder, { trunkRadius, ringRadius, y, rng }) {
  const P = PLATFORM;
  builder.torus({ centre: { x: 0, y, z: 0 }, radius: ringRadius, tube: P.cableRadius, segments: 40, material: "steel" });
  for (let i = 0; i < P.bracketCount; i++) {
    const a = (i / P.bracketCount) * Math.PI * 2 + Math.PI / P.bracketCount + rng.float(-0.05, 0.05);
    const sin = Math.sin(a), cos = Math.cos(a);
    builder.box({                                              // pad against the bark
      length: 0.16, width: 0.09, thickness: 0.05,
      position: { x: sin * (trunkRadius + 0.025), y, z: cos * (trunkRadius + 0.025) }, rotation: { x: 0, y: a, z: 0 }, material: "log",
    });
    builder.cylinderBetween({                                  // standoff arm out to the ring
      from: { x: sin * trunkRadius, y, z: cos * trunkRadius },
      to: { x: sin * (ringRadius + 0.02), y, z: cos * (ringRadius + 0.02) },
      radius: 0.013, segments: 6, material: "steel",
    });
  }
}

/**
 * Deck slab + trunk sleeve as Rapier fixed colliders so the character controller can stand up here.
 * The slab reaches down into the log frame (`deckColliderDepth`, not just the plank thickness) –
 * the KCC pushes itself into the ground every step and would eventually sink through 5 cm.
 */
function createColliders(physics, { tree, deckY, width, depth, trunkRadius, facing }) {
  const R = physics.RAPIER;
  const top = tree.y + deckY;
  const half = PLATFORM.deckColliderDepth / 2;
  const rotation = { x: 0, y: Math.sin(facing / 2), z: 0, w: Math.cos(facing / 2) };
  const deck = R.ColliderDesc.cuboid(width / 2, half, depth / 2)
    .setTranslation(tree.x, top - half, tree.z)
    .setRotation(rotation)
    .setCollisionGroups(groups(GROUP.STATIC))
    .setFriction(0.95);
  const sleeve = R.ColliderDesc.cylinder(PLATFORM.sleeveBelow / 2, trunkRadius + PLATFORM.sleeveThickness)
    .setTranslation(tree.x, top - PLATFORM.sleeveBelow / 2, tree.z)
    .setCollisionGroups(groups(GROUP.STATIC));
  return [physics.world.createCollider(deck), physics.world.createCollider(sleeve)];
}
