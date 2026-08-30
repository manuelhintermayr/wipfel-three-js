// The diegetic park board (ROADMAP M1.4b), modelled on docs/reference/photos/README.md's 03/04: two
// round wooden posts, a header bar across the top and a large printed board between them – the
// physical, walk-up equivalent of the Course Map overlay (js/ui/course-map.js). It reuses the same
// renderer (js/ui/map-render.js#paintStaticBoard) with the "print" style preset (flat colours, no dark
// overlay) so the two views of the park are visibly the same map, just two different renderings of it.
//
// Placed next to js/park/signs.js's hub fingerpost cluster (same trailhead-anchor math, reused via
// that module's exported `averageBearing`/`findNearPath`), offset sideways so the two clusters read as
// neighbours at a real trailhead, not a collision. Interacting (E within `PARK_BOARD.interactRange`)
// opens the Course Map – js/main.js wires that, this module only reports `standPosition` and shows its
// own small prompt panel (the same "do not fight js/player/interaction.js's own prompt line" pattern
// js/game/briefing.js already uses for its `.briefing-panel`).
//
// Local frame: origin on the ground at the board's centre, +Z the readable face's normal (the
// direction a climber walks up from), +Y up.
import * as THREE from "three";
import { GROUP, groups } from "../core/physics.js";
import { createTimberBuilder, disposeStructure } from "./timber.js";
import { averageBearing, findNearPath } from "./signs.js";
import { paintStaticBoard } from "../ui/map-render.js";
import { t } from "../core/i18n.js";
import { MAP } from "../config.js";

export const PARK_BOARD = Object.freeze({
  clearance: 3.4,          // outside the hub rim, on the same trailhead row as the category fingerposts
  sideOffset: 2.6,         // sideways from that anchor, clear of the fingerpost row (js/park/signs.js)
  width: 2.2, height: 1.55,
  boardBottom: 0.60,       // board's bottom edge above the ground
  postRadius: 0.09,
  postSpacing: 2.0,
  postExtra: 0.55,         // how far the posts rise above the board top / sink below its bottom
  headerHeight: 0.16,
  headerDepth: 0.06,
  backingThickness: 0.05,
  faceForwardOffset: 0.035,
  interactRange: 2.0,
  standDistance: 2.1,
  colliderThickness: 0.14,
});

/**
 * @param {{ root: HTMLElement, scene: THREE.Scene, physics, parkDef, terrain, rng, textures }} options
 *   `root` is the `#hud` container (shared with js/game/briefing.js's own bespoke panel).
 * @returns {{ group: THREE.Group, standPosition: THREE.Vector3, interactRange: number,
 *   update(player, input, onOpen: () => void): void, dispose(): void }}
 */
export function createParkBoard({ root, scene, physics, parkDef, terrain, rng, textures }) {
  const B = PARK_BOARD;
  const builder = createTimberBuilder({ textures });
  const hub = terrain.hubs[0];
  const overall = averageBearing(parkDef.routes.map((r) => r.entry), hub);
  const base = findNearPath(terrain, hub, hub.radius + B.clearance, overall, rng, 16);
  const rightAxis = overall + Math.PI / 2;
  const centreX = base.x + Math.sin(rightAxis) * B.sideOffset;
  const centreZ = base.z + Math.cos(rightAxis) * B.sideOffset;
  const centreY = terrain.heightAt(centreX, centreZ);
  const facing = overall;   // face the same way the fingerposts do – towards the hub's open side

  const hx = B.postSpacing / 2;
  const boardTop = B.boardBottom + B.height;
  for (const side of [-1, 1]) {
    builder.cylinderBetween({
      from: { x: side * hx, y: -0.30, z: 0 }, to: { x: side * hx, y: boardTop + B.postExtra, z: 0 },
      radius: B.postRadius, segments: 10,
    });
  }
  builder.box({
    length: B.postSpacing + B.postRadius * 3, width: 0.16, thickness: B.headerDepth,
    position: { x: 0, y: boardTop + B.postExtra * 0.55, z: 0 }, material: "weathered",
  });

  const timberGroup = builder.build("park-board-timber");
  const group = new THREE.Group();
  group.name = "park-board";
  group.add(timberGroup);

  // Plain THREE.BoxGeometry here (not timber.js#box, whose length/width/thickness convention assumes
  // a flat plank lying down): a standing panel just needs width along X and height along Y directly.
  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(B.width + 0.06, B.height + 0.06, B.backingThickness),
    new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 0.85, metalness: 0 }),
  );
  backing.name = "park-board-backing";
  backing.userData.ownMaterial = true;
  backing.position.set(0, B.boardBottom + B.height / 2, -B.backingThickness / 2);
  backing.castShadow = false;
  backing.receiveShadow = true;
  group.add(backing);

  const texture = bakeBoardTexture(parkDef, terrain);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(B.width, B.height),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55, metalness: 0 }),
  );
  face.name = "park-board-face";
  face.userData.ownMaterial = true;
  face.position.set(0, B.boardBottom + B.height / 2, B.faceForwardOffset);
  face.castShadow = false;
  face.receiveShadow = true;
  group.add(face);

  group.position.set(centreX, centreY, centreZ);
  group.rotation.y = facing;
  scene.add(group);

  const standPosition = new THREE.Vector3(0, 0, B.standDistance).applyEuler(group.rotation).add(group.position);
  const colliders = physics ? [createCollider(physics, { centreX, centreY, centreZ, facing, boardTop, boardBottom: B.boardBottom })] : [];

  const prompt = document.createElement("div");
  prompt.className = "board-prompt";
  prompt.hidden = true;
  prompt.textContent = t("parkBoard.open");
  root.appendChild(prompt);

  return {
    group,
    standPosition,
    interactRange: B.interactRange,

    /** Gameplay phase: independent of js/player/interaction.js (that module is scoped to belay/ladder/
     *  element interactions) – its own tiny range check, its own prompt, so the two never fight over
     *  the shared `hud.setPrompt` line the way js/game/briefing.js's dialogue avoids the same clash. */
    update(player, input, onOpen) {
      const inRange = player.mode === "ground" && player.position.distanceTo(standPosition) <= B.interactRange;
      prompt.hidden = !inRange;
      if (inRange && input.pressed("interact")) onOpen();
    },

    dispose() {
      if (physics) for (const collider of colliders) physics.world.removeCollider(collider, false);
      // face/backing are plain THREE.Mesh, not built by the shared timber builder – their own
      // materials (and the baked texture) need disposing by hand, same as js/park/signs.js's faces.
      face.material.dispose();
      backing.material.dispose();
      texture.dispose();
      disposeStructure(group, builder);
      prompt.remove();
    },
  };
}

/** Bakes the "print" style park map (js/ui/map-render.js) once – a physical board never redraws. */
function bakeBoardTexture(parkDef, terrain) {
  const canvas = document.createElement("canvas");
  canvas.width = MAP.boardTexture;
  canvas.height = Math.round(MAP.boardTexture * 0.75);
  paintStaticBoard(canvas, { parkDef, terrain, seed: parkDef.seed, title: t("parkBoard.title") });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** One thin static box over the board's face – "the player doesn't walk through it", nothing more. */
function createCollider(physics, { centreX, centreY, centreZ, facing, boardTop, boardBottom }) {
  const R = physics.RAPIER;
  const B = PARK_BOARD;
  const half = B.colliderThickness / 2;
  const midY = (boardTop + boardBottom) / 2;
  const rotation = { x: 0, y: Math.sin(facing / 2), z: 0, w: Math.cos(facing / 2) };
  const desc = R.ColliderDesc.cuboid(B.width / 2, (boardTop - boardBottom) / 2, half)
    .setTranslation(centreX, centreY + midY, centreZ)
    .setRotation(rotation)
    .setCollisionGroups(groups(GROUP.STATIC));
  return physics.world.createCollider(desc);
}
