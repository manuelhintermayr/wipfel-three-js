// Where the Flying Fox puts you down (RESEARCH-DATA §6: "lands on a platform or the ground with
// Hackschnitzeln, mitlaufen"). On this hillside the ground falls away faster than a 3–6 % cable may,
// so the arrival is a small platform on posts – the "Zip-Ankunft" deck of GDD §M1.2 – with a plank
// ramp down to a mound of wood chips, a rail on the far edge, a stub of cable to clip into while you
// take the trolley off, and the end anchor: a steel tube on a log post with a turnbuckle, exactly
// like the ground anchor in reference photo 01.
//
// Local frame: origin on the ground at the deck centre, +Z back towards the start tree (so the rider
// travels in −Z), +Y up.
import * as THREE from "three";
import { GROUP, groups } from "../core/physics.js";
import { createTimberBuilder, disposeStructure } from "./timber.js";

export const ZIP_LANDING = Object.freeze({
  width: 3.20,               // along X
  depth: 2.60,               // along Z (the rider's braking direction)
  plankWidth: 0.22,
  plankThickness: 0.05,
  plankGap: 0.016,
  colliderDepth: 0.22,       // the slab reaches into the frame – a 5 cm plate lets the KCC sink
  postRadius: 0.085,
  postSink: 0.35,
  logRadius: 0.075,
  railHeight: 0.98,          // rail on the far edge, so nobody walks off while still braking
  rampRun: 3.60,             // horizontal length of the way down
  rampWidth: 0.90,
  stubHeight: 1.00,          // clip-out cable above the deck
  stubSpan: 1.05,
  stubInset: 0.40,           // from the far edge, in front of the rail
  cableRadius: 0.006,
  anchorRadius: 0.095,       // log post carrying the dead end
  anchorTube: 0.050,         // steel tube the cable is dead-ended on
  // Where a clean arrival puts the feet: forward of the deck centre and a step to the ramp side, so
  // the anchor post ends up beside the shoulder camera instead of straight down its arm.
  standInset: 0.60,
  standSide: 0.75,
  moundRadius: 4.80,
  moundHeight: 0.30,
  moundFlat: 0.62,           // fraction of the radius that is flat before the edge falls away
  moundRings: 6,
  moundSegments: 32,
  moundTile: 0.42,           // metres per texture tile – chips read coarser than the leaf litter
});

/**
 * @param {{ scene: THREE.Scene, physics, position: {x,y,z}, facing: number, deckHeight: number,
 *   cableHeight: number, groundAt?: (x:number,z:number)=>number, rng, textures }} options
 *   `position.y` is the terrain height at the deck centre, `facing` the yaw of the local +Z axis,
 *   `deckHeight` the deck surface above that terrain, `cableHeight` the zip cable above the deck.
 * @returns {{ group: THREE.Group, top: number, stand: THREE.Vector3, clipAnchor: THREE.Vector3,
 *   anchorTop: THREE.Vector3, colliders: Array, dispose(): void }}
 */
export function createZipLanding({ scene, physics, position, facing = 0, deckHeight, cableHeight,
  groundAt = null, rng, textures }) {
  const L = ZIP_LANDING;
  const builder = createTimberBuilder({ textures });
  const deckY = deckHeight;
  const frameY = deckY - L.plankThickness - L.logRadius;
  const sin = Math.sin(facing), cos = Math.cos(facing);
  const toWorldX = (x, z) => position.x + x * cos + z * sin;
  const toWorldZ = (x, z) => position.z - x * sin + z * cos;
  const ground = (x, z) => (groundAt ? groundAt(toWorldX(x, z), toWorldZ(x, z)) - position.y : 0);

  buildSubstructure(builder, { frameY, ground, rng });
  buildDeck(builder, { deckY, rng });
  buildRail(builder, { deckY, rng });
  buildRamp(builder, { deckY, ground, rng });
  buildClipStub(builder, { deckY, rng });
  buildEndAnchor(builder, { deckY, cableHeight, ground });

  const timber = builder.build("zip-landing");
  timber.position.set(position.x, position.y, position.z);
  timber.rotation.y = facing;

  const group = new THREE.Group();
  group.name = "zip-landing";
  group.add(timber);
  const mound = buildMound({ position, ground: groundAt, rng, textures });
  group.add(mound);
  scene.add(group);

  const world = (x, y, z) => new THREE.Vector3(toWorldX(x, z), position.y + y, toWorldZ(x, z));
  const colliders = physics ? createColliders(physics, { position, facing, deckY, cableHeight, ground }) : [];

  return {
    group,
    /** World y of the deck surface. */
    top: position.y + deckY,
    /** Where the rider ends up standing after a clean arrival. */
    stand: world(L.standSide, deckY, -L.standInset),
    /** The short cable you clip into before you take the trolley off. */
    clipAnchor: world(0, deckY + L.stubHeight, -L.depth / 2 + L.stubInset),
    /** Where the zip cable is dead-ended – the geometry in elements/zipline.js meets this point. */
    anchorTop: world(0, deckY + cableHeight, L.depth / 2 - 0.20),
    colliders,
    dispose() {
      if (physics) for (const collider of colliders) physics.world.removeCollider(collider, false);
      mound.geometry.dispose();
      mound.material.dispose();
      disposeStructure(group, builder);
    },
  };
}

/** Six posts into the chips, two bearer logs across them. */
function buildSubstructure(builder, { frameY, ground, rng }) {
  const L = ZIP_LANDING;
  const hx = L.width / 2 - 0.22, hz = L.depth / 2 - 0.22;
  for (const x of [-hx, 0, hx]) {
    for (const z of [-hz, hz]) {
      builder.cylinderBetween({
        from: { x, y: ground(x, z) - L.postSink, z },
        to: { x: x + rng.float(-0.02, 0.02), y: frameY, z: z + rng.float(-0.02, 0.02) },
        radius: L.postRadius, segments: 9,
      });
    }
  }
  for (const z of [-hz, hz]) {
    builder.cylinderBetween({ from: { x: -L.width / 2, y: frameY, z }, to: { x: L.width / 2, y: frameY, z }, radius: L.logRadius });
  }
  for (const x of [-hx, hx]) {                                 // diagonal bracing, both sides
    builder.cylinderBetween({
      from: { x, y: frameY - 0.05, z: -hz }, to: { x: x * 0.35, y: ground(x * 0.35, hz) - 0.1, z: hz },
      radius: L.logRadius * 0.8, segments: 8,
    });
  }
}

/** Deck boards across the arrival direction, so a running foot never falls into a gap. */
function buildDeck(builder, { deckY, rng }) {
  const L = ZIP_LANDING;
  const pitch = L.plankWidth + L.plankGap;
  const count = Math.max(4, Math.round(L.depth / pitch));
  for (let i = 0; i < count; i++) {
    builder.box({
      length: L.width, width: L.plankWidth, thickness: L.plankThickness,
      position: { x: 0, y: deckY - L.plankThickness / 2 + rng.float(-0.002, 0.002), z: (i - (count - 1) / 2) * pitch },
      material: "weathered",
    });
  }
}

/** A single log rail on the far edge – the last thing between a fast arrival and the drop. */
function buildRail(builder, { deckY, rng }) {
  const L = ZIP_LANDING;
  const z = -L.depth / 2 + 0.10;
  for (const x of [-L.width / 2 + 0.18, 0, L.width / 2 - 0.18]) {
    builder.cylinderBetween({ from: { x, y: deckY - 0.12, z }, to: { x: x + rng.float(-0.01, 0.01), y: deckY + L.railHeight, z }, radius: 0.06, segments: 8 });
  }
  builder.cylinderBetween({
    from: { x: -L.width / 2 + 0.05, y: deckY + L.railHeight, z }, to: { x: L.width / 2 - 0.05, y: deckY + L.railHeight, z },
    radius: 0.055, segments: 8,
  });
}

/** Plank ramp off the side of the deck down onto the chips. */
function buildRamp(builder, { deckY, ground, rng }) {
  const L = ZIP_LANDING;
  const x0 = L.width / 2 - 0.05;
  const x1 = x0 + L.rampRun;
  const y1 = ground(x1, 0) + 0.06;
  const pitch = Math.atan2(y1 - deckY, L.rampRun);
  const length = Math.hypot(L.rampRun, deckY - y1);
  const mid = { x: (x0 + x1) / 2, y: (deckY + y1) / 2, z: 0 };
  builder.box({
    length, width: L.rampWidth, thickness: 0.055,
    position: { x: mid.x, y: mid.y - 0.027, z: mid.z }, rotation: { x: 0, y: 0, z: pitch }, material: "plank",
  });
  for (const z of [-L.rampWidth / 2 + 0.05, L.rampWidth / 2 - 0.05]) {
    builder.cylinderBetween({ from: { x: x0, y: deckY - 0.10, z }, to: { x: x1, y: y1 - 0.06, z }, radius: 0.055, segments: 8 });
  }
  for (let i = 1; i < 6; i++) {                                // cleats you can feel through the shoe
    const t = i / 6;
    builder.box({
      length: 0.035, width: L.rampWidth - 0.06, thickness: 0.022,
      position: { x: x0 + L.rampRun * t, y: deckY + (y1 - deckY) * t + 0.02 + rng.float(-0.002, 0.002), z: 0 },
      rotation: { x: 0, y: 0, z: pitch }, material: "plank",
    });
  }
}

/**
 * Two posts and a taut 12 mm cable: what you clip into before the trolley comes off. It stands in
 * front of the rail, on the side the rider ends up on, and clear of the way down the ramp.
 */
function buildClipStub(builder, { deckY, rng }) {
  const L = ZIP_LANDING;
  const z = -L.depth / 2 + L.stubInset;
  const top = deckY + L.stubHeight + 0.18;
  const hx = L.stubSpan / 2;
  for (const x of [-hx, hx]) {
    builder.cylinderBetween({ from: { x, y: deckY - 0.30, z }, to: { x: x + rng.float(-0.012, 0.012), y: top, z }, radius: 0.062, segments: 9 });
    builder.box({ length: 0.10, width: 0.05, thickness: 0.10, position: { x: x - Math.sign(x) * 0.05, y: deckY + L.stubHeight, z }, material: "steel" });
  }
  builder.tube({
    points: [{ x: -hx, y: deckY + L.stubHeight, z }, { x: 0, y: deckY + L.stubHeight - 0.012, z }, { x: hx, y: deckY + L.stubHeight, z }],
    radius: L.cableRadius, segments: 10, material: "steel",
  });
}

/** The dead end of the zip cable: log post, steel tube, turnbuckle and a raked earth anchor. */
function buildEndAnchor(builder, { deckY, cableHeight, ground }) {
  const L = ZIP_LANDING;
  const z = L.depth / 2 - 0.20;
  const top = deckY + cableHeight;
  builder.cylinderBetween({ from: { x: 0, y: ground(0, z) - 0.55, z }, to: { x: 0, y: top - 0.10, z }, radius: L.anchorRadius, segments: 12 });
  builder.cylinderBetween({ from: { x: 0, y: top - 0.42, z }, to: { x: 0, y: top + 0.12, z }, radius: L.anchorTube, segments: 12, material: "steel" });
  builder.box({ length: 0.30, width: 0.06, thickness: 0.06, position: { x: 0, y: top, z: z + 0.10 }, rotation: { x: 0, y: Math.PI / 2, z: 0 }, material: "steel" });
  builder.box({ length: 0.13, width: 0.045, thickness: 0.045, position: { x: 0, y: top, z: z + 0.24 }, rotation: { x: 0, y: Math.PI / 2, z: 0 }, material: "steel" });
  builder.cylinderBetween({                                    // the rod raked back into the ground
    from: { x: 0, y: top - 0.30, z }, to: { x: 0, y: ground(0, z + 1.5) - 0.35, z: z + 1.55 },
    radius: 0.022, segments: 8, material: "steel",
  });
}

/**
 * The wood-chip bed: a flat pad of displaced ground under the arrival deck. Wood chips are
 * chopped-up timber, so it borrows the round-pole texture at a small tile – pale, warm and coarse
 * against the leaf litter around it. Vertices sit on the terrain plus the lift, so the pad beds into
 * the slope instead of floating on it, and the UVs are world-scaled like every other park surface.
 */
function buildMound({ position, ground, rng, textures }) {
  const L = ZIP_LANDING;
  const rings = L.moundRings, segs = L.moundSegments;
  const count = rings * segs + 1;
  const pos = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  const index = [];
  const heightAt = (x, z) => (ground ? ground(x, z) : position.y);
  const put = (i, x, z, lift) => {
    pos[i * 3] = x; pos[i * 3 + 1] = heightAt(x, z) + lift; pos[i * 3 + 2] = z;
    uv[i * 2] = x / L.moundTile; uv[i * 2 + 1] = z / L.moundTile;
  };
  put(0, position.x, position.z, L.moundHeight);
  for (let r = 1; r <= rings; r++) {
    const t = r / rings;
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const radius = L.moundRadius * t * rng.float(0.92, 1.06);
      // flat pad with a spilled edge: a chip bed is tipped out of a barrow, not a dome
      const lift = L.moundHeight * Math.min(1, (1 - t) / (1 - L.moundFlat)) * rng.float(0.8, 1.15);
      put(1 + (r - 1) * segs + s, position.x + Math.cos(a) * radius, position.z + Math.sin(a) * radius, lift);
    }
  }
  // wound clockwise seen from above, so the face normals come out pointing at the sky
  for (let s = 0; s < segs; s++) index.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * segs, a1 = 1 + r * segs;
    for (let s = 0; s < segs; s++) {
      const n = (s + 1) % segs;
      index.push(a0 + s, a1 + n, a1 + s, a0 + s, a0 + n, a1 + n);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const chips = textures.log;
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: 0xe2c79c, map: chips.map, normalMap: chips.normalMap, roughnessMap: chips.roughnessMap,
    normalScale: new THREE.Vector2(1.4, 1.4), roughness: 1, metalness: 0,
  }));
  mesh.name = "zip-landing-chips";
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/**
 * Deck slab, ramp and the anchor post as fixed colliders. The ramp is the only way back down; the
 * post is solid because it stands right behind the arrival stand – without it the shoulder camera
 * happily sits inside a 20 cm log and fills half the screen with bark.
 */
function createColliders(physics, { position, facing, deckY, cableHeight, ground }) {
  const L = ZIP_LANDING;
  const R = physics.RAPIER;
  const sin = Math.sin(facing), cos = Math.cos(facing);
  const world = (x, z) => ({ x: position.x + x * cos + z * sin, z: position.z - x * sin + z * cos });
  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing);

  const half = L.colliderDepth / 2;
  const centre = world(0, 0);
  const deck = R.ColliderDesc.cuboid(L.width / 2, half, L.depth / 2)
    .setTranslation(centre.x, position.y + deckY - half, centre.z)
    .setRotation({ x: yaw.x, y: yaw.y, z: yaw.z, w: yaw.w })
    .setCollisionGroups(groups(GROUP.STATIC)).setFriction(0.95);

  const x0 = L.width / 2 - 0.05, x1 = x0 + L.rampRun;
  const y1 = ground(x1, 0) + 0.06;
  const pitch = Math.atan2(y1 - deckY, L.rampRun);
  const length = Math.hypot(L.rampRun, deckY - y1);
  const rampCentre = world((x0 + x1) / 2, 0);
  const rotation = yaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pitch));
  const ramp = R.ColliderDesc.cuboid(length / 2, 0.07, L.rampWidth / 2)
    .setTranslation(rampCentre.x, position.y + (deckY + y1) / 2 - 0.07, rampCentre.z)
    .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
    .setCollisionGroups(groups(GROUP.STATIC)).setFriction(0.95);

  const postZ = L.depth / 2 - 0.20;
  const postFoot = ground(0, postZ) - 0.55;
  const postTop = deckY + cableHeight;
  const postAt = world(0, postZ);
  const post = R.ColliderDesc.cylinder((postTop - postFoot) / 2, L.anchorRadius + 0.02)
    .setTranslation(postAt.x, position.y + (postFoot + postTop) / 2, postAt.z)
    .setCollisionGroups(groups(GROUP.STATIC));

  return [deck, ramp, post].map((desc) => physics.world.createCollider(desc));
}
