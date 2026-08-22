// The first thing the player ever climbs: entry deck → block ladder → platform, all on the hero pine
// nearest the spawn hub. Until the layout generator (M1.1) exists this module owns the whole
// arrangement so main.js stays a wiring file.
//
// Belay anchors: the entry stub and the ladder cable are one continuous system (anchor id "deck"),
// exactly like in the real park – you clip in at the bottom and stay on that cable until you reach
// the platform's safety ring ("platform-ring") and perform the ritual again.
import * as THREE from "three";
import { getWoodTextures } from "../procgen/textures/wood.js";
import { trunkRadiusAt } from "../procgen/geometry/tree-species.js";
import { createPlatform } from "./platform.js";
import { createEntryDeck } from "./entry-deck.js";
import { createBlockLadder } from "../elements/ladder.js";

export const FIRST_COURSE = Object.freeze({
  platformHeight: 4.5,       // deck surface above the trunk foot
  platformRadius: 1.25,
  deckGap: 0.55,             // clearance between trunk surface and the entry deck edge
  interactRange: 1.6,        // how close you must be to an anchor to clip in
  ladderRange: 1.5,          // …and to the ladder base to start climbing
});

/**
 * @param {{ scene: THREE.Scene, physics, terrain, forest, rng, textures?, seed? }} options
 *   `textures` = a set from `procgen/textures/wood.js`; omitted, it is fetched for `seed`.
 * @returns {{ tree, platform, ladder, entryDeck, anchors: Array<{id, position: THREE.Vector3, kind: string}>,
 *   anchorById(id): object|null, nearestAnchor(position, range): object|null, dispose(): void }}
 */
export function createFirstCourse({ scene, physics, terrain, forest, rng, textures = null, seed = 1 }) {
  const wood = textures || getWoodTextures(seed);
  const tree = pickCourseTree(forest, terrain);
  if (!tree) throw new Error("first course: the forest has no hero tree to build on");

  const hub = terrain.spawn || { x: 0, z: 0 };
  const facing = Math.atan2(hub.x - tree.x, hub.z - tree.z);   // yaw from the trunk towards the hub
  const outward = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));

  const platform = createPlatform({
    scene, physics, tree, height: FIRST_COURSE.platformHeight, radius: FIRST_COURSE.platformRadius,
    kind: "entry", facing, rng: rng.fork("platform"), textures: wood,
  });

  // clear of the root flare, not of the nominal trunk radius
  const deckDistance = trunkRadiusAt(tree, 0.5) + FIRST_COURSE.deckGap + 0.80;
  const deckX = tree.x + outward.x * deckDistance;
  const deckZ = tree.z + outward.z * deckDistance;
  const entryDeck = createEntryDeck({
    scene, physics, position: { x: deckX, y: terrain.heightAt(deckX, deckZ), z: deckZ },
    facing: facing + Math.PI,                                  // the deck looks back at the tree
    rng: rng.fork("entry-deck"), textures: wood,
  });

  const ladder = createBlockLadder({
    scene, physics, tree, fromY: entryDeck.top, toY: platform.top, side: facing,
    rng: rng.fork("ladder"), textures: wood,
  });

  const anchors = [
    { id: "deck", position: entryDeck.clipAnchor, kind: "cable-stub", label: "entry cable" },
    { id: "platform-ring", position: platform.anchorPoints.ring, kind: "ring", label: "platform ring" },
  ];

  return {
    tree,
    facing,
    platform,
    ladder,
    entryDeck,
    anchors,
    /** Anchor the ladder cable belongs to – you may start climbing while clipped to it. */
    ladderAnchorId: "deck",
    /** Anchor you must reach at the top before leaving the ladder cable. */
    topAnchorId: "platform-ring",

    anchorById(id) { return anchors.find((a) => a.id === id) || null; },

    /** Closest anchor within `range` metres of a world position, or null. */
    nearestAnchor(position, range = FIRST_COURSE.interactRange) {
      let best = null, bestDistance = range;
      for (const anchor of anchors) {
        const d = anchor.position.distanceTo(position);
        if (d <= bestDistance) { best = anchor; bestDistance = d; }
      }
      return best;
    },

    dispose() {
      ladder.dispose();
      entryDeck.dispose();
      platform.dispose();
    },
  };
}

/** The hero pine closest to the spawn hub – hero trees have trunk colliders and room around them. */
function pickCourseTree(forest, terrain) {
  const spawn = terrain.spawn || { x: 0, z: 0 };
  let best = null, bestDistance = Infinity;
  for (const tree of forest.trees) {
    if (!tree.isHero) continue;
    const d = Math.hypot(tree.x - spawn.x, tree.z - spawn.z);
    if (d < bestDistance) { best = tree; bestDistance = d; }
  }
  return best;
}
