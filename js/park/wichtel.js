// Toddler courses (ROADMAP M2a, RESEARCH-DATA §1: "2 toddler courses (35 cm high, without belay, for
// small children)"): tiny ground-level log-and-plank courses near the spawn hub, pure flavour – no
// belay, no lifeline, no anchors, walkable by anyone (the character controller's own autostep already
// clears 35 cm, so no ramp is needed either). Built directly with js/park/timber.js, entirely outside
// the routes/generator/loader pipeline: these never appear in `parkDef.routes`, are not "platforms" for
// the ≤ 52 budget, and are not part of the belay graph at all.
//
// Local convention: every builder call below is fed *world* coordinates directly (unlike every other
// timber structure in this codebase, which builds in a local frame and positions the whole group
// afterwards) – two courses share one builder/one merged mesh pair, so there is no single local origin
// to hang a group transform off; baking world coordinates in up front sidesteps that without a second
// per-course group.
import * as THREE from "three";
import { GROUP, groups } from "../core/physics.js";
import { WICHTEL } from "../config.js";
import { createTimberBuilder, disposeStructure } from "./timber.js";
import { farFromOtherRoutes, farFromPath } from "./layout-validate.js";

const SEGMENT_LENGTH = 0.5;     // metres of path per log/plank segment
const WANDER = 0.22;            // radians of heading drift per segment – a gentle, not dead-straight, line
const PLACEMENT_TRIES = 24;
const PLACEMENT_CLEARANCE = 5.0;   // metres clear of every real route's hero trees

/**
 * @param {{ scene: THREE.Scene, physics, terrain: { heightAt, isPath, hubs }, parkDef, rng, textures }} options
 * @returns {{ group: THREE.Group, courses: Array<{ origin: {x,y,z} }>, dispose(): void }}
 */
export function createWichtelCourses({ scene, physics, terrain, parkDef, rng, textures }) {
  const builder = createTimberBuilder({ textures });
  const colliders = [];
  const courses = [];

  for (let i = 0; i < WICHTEL.count; i++) {
    const courseRng = rng.fork(`wichtel-${i}`);
    const origin = placeCourse({ terrain, parkDef, index: i, rng: courseRng });
    const heading = courseRng.float(0, Math.PI * 2);
    buildOneCourse({ builder, physics, colliders, origin, heading, rng: courseRng });
    courses.push({ origin });
  }

  const group = new THREE.Group();
  group.name = "wichtel";
  group.add(builder.build("wichtel-timber"));
  scene.add(group);

  return {
    group,
    courses,
    dispose() {
      if (physics) for (const collider of colliders) physics.world.removeCollider(collider, false);
      disposeStructure(group, builder);
    },
  };
}

/** A spot near the hub, clear of every real route's hero trees and (best-effort) off any mapped path. */
function placeCourse({ terrain, parkDef, index, rng }) {
  const hub = terrain.hubs[0];
  let best = null;
  for (let attempt = 0; attempt < PLACEMENT_TRIES; attempt++) {
    const bearing = rng.float(0, Math.PI * 2);
    const radius = hub.radius + WICHTEL.clearance + index * WICHTEL.spacing + rng.float(-1, 1);
    const x = hub.x + Math.sin(bearing) * radius, z = hub.z + Math.cos(bearing) * radius;
    if (!farFromOtherRoutes(x, z, parkDef.heroTrees, PLACEMENT_CLEARANCE)) continue;
    if (!farFromPath(terrain, x, z, 2.0)) { best = best || { x, z }; continue; }
    return { x, y: terrain.heightAt(x, z), z };
  }
  const fallback = best || { x: hub.x + Math.sin(index) * (hub.radius + WICHTEL.clearance), z: hub.z + Math.cos(index) * (hub.radius + WICHTEL.clearance) };
  return { x: fallback.x, y: terrain.heightAt(fallback.x, fallback.z), z: fallback.z };
}

/** A short wandering line of stepping logs with a plank every third segment, all `WICHTEL.deckHeight` up. */
function buildOneCourse({ builder, physics, colliders, origin, heading, rng }) {
  let x = origin.x, z = origin.z, yaw = heading;
  const topY = origin.y + WICHTEL.deckHeight;
  for (let i = 0; i < WICHTEL.logCount; i++) {
    yaw += rng.float(-WANDER, WANDER);
    const isPlank = i % 3 === 2;
    const length = isPlank ? WICHTEL.plankSpan : WICHTEL.logSpan;
    const dx = Math.sin(yaw) * length, dz = Math.cos(yaw) * length;
    const midX = x + dx / 2, midZ = z + dz / 2;

    if (isPlank) {
      // js/park/timber.js#box's "length" is its local +X (the grain axis); a plain Euler Y-rotation by
      // `yaw` alone would point that at world (cos yaw, 0, -sin yaw) – rotated a further -90° so it
      // lands on (sin yaw, 0, cos yaw), the same "yaw → direction" convention every dx/dz in this file
      // (and js/park/layout-route.js's chain walk) already uses.
      builder.box({
        length: length + 0.05, width: 0.34, thickness: 0.05,
        position: { x: midX, y: topY - 0.025, z: midZ }, rotation: { x: 0, y: yaw - Math.PI / 2, z: 0 }, material: "weathered",
      });
    } else {
      builder.cylinderBetween({
        from: { x, y: topY - WICHTEL.logRadius * 0.35, z }, to: { x: x + dx, y: topY - WICHTEL.logRadius * 0.35, z: z + dz },
        radius: WICHTEL.logRadius, segments: 10,
      });
    }
    if (physics) colliders.push(segmentCollider(physics, midX, topY, midZ, yaw, length));
    x += dx; z += dz;
  }
}

/** A thin static box matching the segment's walkable top – the same "slab, not the true surface" trick js/park/platform.js's deck uses. */
function segmentCollider(physics, x, topY, z, yaw, length) {
  const R = physics.RAPIER;
  const half = 0.045;
  const rotation = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
  const desc = R.ColliderDesc.cuboid(0.17, half, length / 2 + 0.02)
    .setTranslation(x, topY - half, z)
    .setRotation(rotation)
    .setCollisionGroups(groups(GROUP.STATIC))
    .setFriction(0.9);
  return physics.world.createCollider(desc);
}
