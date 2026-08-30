// A tiny ground-level anchor for the Einschulung practice gate (GDD §3.7, ROADMAP M1.3): one post and
// a short taut cable at "1 m height" (RESEARCH-DATA §1: the mandatory practice course sits at ground
// level before the real park). js/game/briefing.js clips the player onto it with the same F,F ritual
// (js/player/belay.js) any real anchor uses – this module only builds the hardware.
//
// Local frame: origin on the ground at the post's base, +Y up.
import * as THREE from "three";
import { GROUP, groups } from "../core/physics.js";
import { createTimberBuilder, disposeStructure } from "./timber.js";

export const PRACTICE_STAND = Object.freeze({
  postHeight: 1.35,
  postRadius: 0.05,
  postSink: 0.22,
  cableHeight: 1.0,      // the real park's practice-parcours height (RESEARCH-DATA §1)
  cableSpan: 0.70,
  cableRadius: 0.005,
});

/**
 * @param {{ scene: THREE.Scene, physics: import("../core/physics.js").Physics|null,
 *   position: {x,y,z}, facing?: number, rng, textures }} options
 * @returns {{ group: THREE.Group, top: number, clipAnchor: THREE.Vector3, dispose(): void }}
 */
export function createPracticeStand({ scene, physics = null, position, facing = 0, rng, textures }) {
  const P = PRACTICE_STAND;
  const builder = createTimberBuilder({ textures });
  const half = P.cableSpan / 2;

  builder.cylinderBetween({
    from: { x: 0, y: -P.postSink, z: 0 }, to: { x: rng.float(-0.01, 0.01), y: P.postHeight, z: rng.float(-0.01, 0.01) },
    radius: P.postRadius, segments: 9,
  });
  for (const x of [-half, half]) {                             // steel cable-eye plates, like the entry deck's stub
    builder.box({ length: 0.09, width: 0.045, thickness: 0.07, position: { x, y: P.cableHeight, z: 0 }, material: "steel" });
  }
  builder.tube({
    points: [{ x: -half, y: P.cableHeight, z: 0 }, { x: 0, y: P.cableHeight - 0.01, z: 0 }, { x: half, y: P.cableHeight, z: 0 }],
    radius: P.cableRadius, segments: 10, material: "steel",
  });

  const group = builder.build("practice-stand");
  group.position.set(position.x, position.y, position.z);
  group.rotation.y = facing;
  scene.add(group);

  const collider = physics ? createCollider(physics, position) : null;
  const clipAnchor = new THREE.Vector3(0, P.cableHeight, 0).applyEuler(group.rotation).add(group.position);

  return {
    group,
    /** World y of the ground the post stands on. */
    top: position.y,
    /** World position of the practice cable – the same F,F ritual as any real anchor. */
    clipAnchor,
    dispose() {
      if (physics && collider) physics.world.removeCollider(collider, false);
      disposeStructure(group, builder);
    },
  };
}

/** A thin cylinder so the player cannot walk straight through the post at point-blank range. */
function createCollider(physics, position) {
  const P = PRACTICE_STAND;
  const R = physics.RAPIER;
  const collider = physics.world.createCollider(
    R.ColliderDesc.cylinder(P.postHeight / 2, P.postRadius + 0.02)
      .setTranslation(position.x, position.y + P.postHeight / 2, position.z)
      .setCollisionGroups(groups(GROUP.STATIC)),
  );
  return collider;
}
