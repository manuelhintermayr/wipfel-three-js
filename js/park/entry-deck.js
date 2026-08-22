// The entry deck at the foot of the first tree (photo 02): a knee-high platform of planks on round
// log posts, a bench to sit on while the trainer checks your harness, a short piece of 12 mm steel
// cable on two posts – the "Einhängepunkt" where the carabiners go on for the first time – and a
// round pictogram sign on a post.
//
// Local frame: origin on the ground at the deck centre, +Z towards the tree, +Y up.
import * as THREE from "three";
import { GROUP, groups } from "../core/physics.js";
import { createTimberBuilder, disposeStructure } from "./timber.js";
import { createCanvas, toTexture } from "../procgen/textures/tree-texture-utils.js";

export const ENTRY_DECK = Object.freeze({
  width: 2.30,               // along X
  depth: 1.60,               // along Z (towards the tree)
  deckHeight: 0.42,          // ~40 cm as in the photo
  plankWidth: 0.22,
  plankThickness: 0.05,
  plankGap: 0.016,
  deckColliderDepth: 0.16,   // reaches into the substructure so the KCC cannot sink through
  postRadius: 0.07,
  postSink: 0.28,            // how far the posts go into the ground
  benchSeatHeight: 0.44,     // above the deck
  benchDepth: 0.30,
  stubHeight: 1.00,          // cable above the deck
  stubPostHeight: 1.18,
  stubSpan: 1.10,            // distance between the two stub posts
  cableRadius: 0.006,
  signRadius: 0.16,
  signHeight: 1.42,          // above the deck
});

/**
 * @param {{ scene: THREE.Scene, physics: import("../core/physics.js").Physics|null,
 *   position: {x,y,z}, facing: number, rng, textures }} options
 *   `facing` = yaw (radians) of the deck's +Z axis, pointing at the tree that carries the ladder.
 * @returns {{ group: THREE.Group, top: number, clipAnchor: THREE.Vector3, colliders: Array, dispose(): void }}
 */
export function createEntryDeck({ scene, physics, position, facing = 0, rng, textures }) {
  const D = ENTRY_DECK;
  const signMap = createPictogramTexture();
  const builder = createTimberBuilder({ textures, signMap });
  const deckY = D.deckHeight;
  const frameY = deckY - D.plankThickness - D.postRadius;

  buildSubstructure(builder, { frameY, rng });
  buildDeckPlanks(builder, { deckY, rng });
  buildBench(builder, { deckY, rng });
  buildClipStub(builder, { deckY, rng });
  buildSign(builder, { deckY });

  const group = builder.build("entry-deck");
  group.position.set(position.x, position.y, position.z);
  group.rotation.y = facing;
  scene.add(group);

  const colliders = physics ? createColliders(physics, { position, facing, deckY }) : [];
  const clipAnchor = new THREE.Vector3(0, deckY + D.stubHeight, D.depth / 2 - 0.22)
    .applyEuler(group.rotation).add(group.position);

  return {
    group,
    /** World y of the deck surface. */
    top: position.y + deckY,
    /** World position of the cable stub – walk here and press the clip key. */
    clipAnchor,
    colliders,
    dispose() {
      if (physics) for (const collider of colliders) physics.world.removeCollider(collider, false);
      disposeStructure(group, builder);
      signMap.dispose();
    },
  };
}

/** Six round posts sunk into the forest floor, carrying two bearer logs. */
function buildSubstructure(builder, { frameY, rng }) {
  const D = ENTRY_DECK;
  const hx = D.width / 2, hz = D.depth / 2;
  for (const x of [-hx + 0.18, 0, hx - 0.18]) {
    for (const z of [-hz + 0.18, hz - 0.18]) {
      builder.cylinderBetween({
        from: { x, y: -D.postSink, z }, to: { x: x + rng.float(-0.02, 0.02), y: frameY, z: z + rng.float(-0.02, 0.02) },
        radius: D.postRadius, segments: 9,
      });
    }
  }
  for (const z of [-hz + 0.18, hz - 0.18]) {
    builder.cylinderBetween({ from: { x: -hx, y: frameY, z }, to: { x: hx, y: frameY, z }, radius: D.postRadius * 0.85 });
  }
}

/** Planks along X with the usual finger-wide gaps. */
function buildDeckPlanks(builder, { deckY, rng }) {
  const D = ENTRY_DECK;
  const pitch = D.plankWidth + D.plankGap;
  const count = Math.max(3, Math.round(D.depth / pitch));
  for (let i = 0; i < count; i++) {
    builder.box({
      length: D.width, width: D.plankWidth, thickness: D.plankThickness,
      position: { x: 0, y: deckY - D.plankThickness / 2 + rng.float(-0.002, 0.002), z: (i - (count - 1) / 2) * pitch },
      material: "weathered",
    });
  }
}

/** Bench along the far edge – where you wait, and where the harness gets checked. */
function buildBench(builder, { deckY, rng }) {
  const D = ENTRY_DECK;
  const z = -D.depth / 2 + 0.24;
  const seatY = deckY + D.benchSeatHeight;
  for (const x of [-0.72, 0.72]) {
    builder.cylinderBetween({ from: { x, y: deckY - 0.06, z }, to: { x, y: seatY - 0.03, z }, radius: 0.055, segments: 8 });
  }
  for (let i = 0; i < 2; i++) {
    builder.box({
      length: 1.85, width: D.plankWidth * 0.85, thickness: 0.045,
      position: { x: 0, y: seatY + rng.float(-0.002, 0.002), z: z + (i - 0.5) * (D.plankWidth * 0.85 + D.plankGap) },
      material: "plank",
    });
  }
}

/** Two posts and a taut 12 mm cable: the first anchor of the whole park. */
function buildClipStub(builder, { deckY, rng }) {
  const D = ENTRY_DECK;
  const z = D.depth / 2 - 0.22;
  const top = deckY + D.stubPostHeight;
  const cableY = deckY + D.stubHeight;
  const hx = D.stubSpan / 2;
  for (const x of [-hx, hx]) {
    builder.cylinderBetween({ from: { x, y: deckY - 0.30, z }, to: { x: x + rng.float(-0.015, 0.015), y: top, z }, radius: 0.065, segments: 9 });
    builder.box({                                              // steel cable eye plate
      length: 0.10, width: 0.05, thickness: 0.10,
      position: { x: x - Math.sign(x) * 0.05, y: cableY, z }, material: "steel",
    });
  }
  builder.tube({ points: [{ x: -hx, y: cableY, z }, { x: 0, y: cableY - 0.012, z }, { x: hx, y: cableY, z }], radius: D.cableRadius, segments: 10, material: "steel" });
}

/** Round pictogram sign on its own post, facing the climber. */
function buildSign(builder, { deckY }) {
  const D = ENTRY_DECK;
  const x = -D.width / 2 + 0.16, z = D.depth / 2 - 0.30;
  const top = deckY + D.signHeight + D.signRadius;
  builder.cylinderBetween({ from: { x, y: deckY - 0.34, z }, to: { x, y: top, z }, radius: 0.045, segments: 8 });
  builder.plate({ radius: D.signRadius, position: { x, y: deckY + D.signHeight, z: z - 0.05 }, rotation: { x: 0, y: Math.PI, z: 0 } });
}

/**
 * White disc with a black pictogram of a climber clipped to a cable – the park's "clip in here"
 * sign. Bold strokes so it still reads from ten metres away. Canvas only, no image files.
 */
function createPictogramTexture(size = 256) {
  const { canvas, ctx } = createCanvas(size, size);
  const c = size / 2, r = size * 0.5;
  ctx.fillStyle = "#f5f3ed";
  ctx.beginPath(); ctx.arc(c, c, r * 0.98, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#15181a";
  ctx.fillStyle = "#15181a";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.lineWidth = r * 0.075;                                   // rim
  ctx.beginPath(); ctx.arc(c, c, r * 0.86, 0, Math.PI * 2); ctx.stroke();

  const cableY = c - r * 0.50;                                 // the steel cable overhead
  ctx.lineWidth = r * 0.07;
  ctx.beginPath(); ctx.moveTo(c - r * 0.66, cableY); ctx.lineTo(c + r * 0.66, cableY); ctx.stroke();

  ctx.lineWidth = r * 0.085;                                   // carabiner hanging on it
  ctx.beginPath(); ctx.ellipse(c - r * 0.02, cableY + r * 0.19, r * 0.11, r * 0.17, 0, 0, Math.PI * 2); ctx.stroke();

  ctx.lineWidth = r * 0.06;                                    // lanyard down to the harness
  ctx.beginPath(); ctx.moveTo(c - r * 0.02, cableY + r * 0.36); ctx.lineTo(c + r * 0.03, c + r * 0.02); ctx.stroke();

  ctx.beginPath();                                             // climber: head, body, arms, legs
  ctx.arc(c + r * 0.05, c - r * 0.02, r * 0.115, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = r * 0.105;
  ctx.beginPath(); ctx.moveTo(c + r * 0.05, c + r * 0.10); ctx.lineTo(c + r * 0.04, c + r * 0.42); ctx.stroke();
  ctx.lineWidth = r * 0.075;
  ctx.beginPath();
  ctx.moveTo(c - r * 0.22, c + r * 0.06); ctx.lineTo(c + r * 0.05, c + r * 0.18); ctx.lineTo(c + r * 0.30, c + r * 0.04);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(c - r * 0.20, c + r * 0.72); ctx.lineTo(c + r * 0.04, c + r * 0.42); ctx.lineTo(c + r * 0.26, c + r * 0.70);
  ctx.stroke();
  return toTexture(canvas, { srgb: true, repeat: false });
}

/** Deck slab and bench as fixed colliders. */
function createColliders(physics, { position, facing, deckY }) {
  const D = ENTRY_DECK;
  const R = physics.RAPIER;
  const rotation = { x: 0, y: Math.sin(facing / 2), z: 0, w: Math.cos(facing / 2) };
  const sin = Math.sin(facing), cos = Math.cos(facing);
  const local = (x, z) => ({ x: position.x + x * cos + z * sin, z: position.z - x * sin + z * cos });
  const half = D.deckColliderDepth / 2;
  const deckCentre = local(0, 0);
  const deck = R.ColliderDesc.cuboid(D.width / 2, half, D.depth / 2)
    .setTranslation(deckCentre.x, position.y + deckY - half, deckCentre.z)
    .setRotation(rotation).setCollisionGroups(groups(GROUP.STATIC)).setFriction(0.95);
  const seat = local(0, -D.depth / 2 + 0.24);
  const bench = R.ColliderDesc.cuboid(0.95, 0.03, 0.16)
    .setTranslation(seat.x, position.y + deckY + D.benchSeatHeight, seat.z)
    .setRotation(rotation).setCollisionGroups(groups(GROUP.STATIC));
  return [physics.world.createCollider(deck), physics.world.createCollider(bench)];
}
