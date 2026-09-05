// Skateboard-Brücke – an 80 × 25 cm board rolling on two overhead cables through two hangers, the
// climber standing on top of it the whole way across (GDD §3.4 "Skateboard, Snowboard, Fässer ·
// 2·5·3·2": a moving surface, momentum instead of footsteps). W presses shove it forward, it glides
// and bleeds off speed on its own, and leaning matters more the faster it is already going.
//
// The board is not part of the merged static hardware: like the zip line's trolley, it is its own
// small group built once around its own local origin and then repositioned every frame along the two
// overhead cables, so it can actually travel instead of just sitting there while the climber pretends.

import * as THREE from "three";
import { createElementBase, registerElementKind, ELEMENT } from "./element.js";
import { cableRun, cableTermination, lifelineCable } from "./element-parts.js";

export const SKATE = Object.freeze({
  boardLength: 0.80,
  boardWidth: 0.25,
  boardThickness: 0.035,
  hangHeight: 1.62,           // the two overhead cables the hangers ride on – also the hanger rod length
  hangSpread: 0.11,
  hangerRadius: 0.010,
  wheelRadius: 0.035,
  cableRadius: 0.006,
  sagRatio: 0.010,
  maxSpeed: 1.6,               // m/s – RESEARCH-DATA-style Designannahme for this exercise
  pushAccel: 1.05,             // m/s² – takes a moment to build up speed, then coasts (see on-element.js#walk)
  tiltGain: 0.6,                // how much the board visibly rolls with the balance wobble
  walkSpeed: 1.6,
  slipAngle: 0.30,
  staminaDrain: 0.010,
  lifelineHeight: ELEMENT.lifelineHeight,
  lifelineSag: 0.05,
  standBack: 0.45,
  metrics: Object.freeze({ physical: 2, coordination: 5, psychological: 3, technical: 2 }),
  wobble: Object.freeze({
    lateralHz: 0.60, verticalHz: 1.3, lateralDamping: 0.16, verticalDamping: 0.30,
    maxLateral: 0.30, maxVertical: 0.06, verticalRatio: 0.25,
  }),
});

/**
 * @param {object} spec see `createElementBase`
 * @param {{ scene, physics, rng, timber, wind }} ctx
 * @returns {object} element
 */
export function createSkate(spec, ctx) {
  let boardGroup = null;

  const element = createElementBase(spec, ctx, {
    config: SKATE,
    metrics: SKATE.metrics,
    // no hand cable at all – balance comes from the feet and the lean, exactly like a real board
    handHold: { available: false, heightAboveFoot: 0, side: "none" },
    build: (builder, frame, el) => {
      const built = buildSkate(builder, frame, el, ctx);
      boardGroup = built.board;
      return built;
    },
    update: (dt, elapsed, el) => placeBoard(boardGroup, el),
  });

  // shove-and-coast instead of the shared snap-to-speed accel (js/player/on-element.js#walk) – reads
  // `element.config.pushAccel` (M2b "skate-long" variant: builds speed faster and holds a higher top
  // speed – config.js/catalogue-data.js override `pushAccel`/`maxSpeed`/`slipAngle` together) instead of
  // the frozen `SKATE` constant.
  element.railAccel = element.config.pushAccel;
  return element;
}

registerElementKind("skate", createSkate);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Slide the board (and tilt it with the balance wobble) to wherever the climber currently is. */
function placeBoard(board, element) {
  if (!board) return;
  const u = element.occupancy.active ? clamp01(element.occupancy.t) : 0;
  const L = element.length;
  const railY = (x) => element.frame.rise * (x / L) - element.config.sag * 4 * (x / L) * (1 - x / L);
  const x = u * L;
  board.position.set(x, railY(x), 0);
  board.rotation.z = element.wobble.lateral * SKATE.tiltGain;
  board.rotation.x = element.wobble.vertical * SKATE.tiltGain * 0.5;
}

function buildSkate(builder, frame, element, ctx) {
  const L = frame.length;
  const top = (x) => frame.rise * (x / L) + SKATE.hangHeight;

  // --- static: lifeline, the two overhead cables, terminations ----------------------------------------
  lifelineCable(builder, frame, element);
  for (const side of [-1, 1]) {
    cableRun(builder, {
      from: { x: 0, y: SKATE.hangHeight, z: side * SKATE.hangSpread },
      to: { x: L, y: frame.rise + SKATE.hangHeight, z: side * SKATE.hangSpread },
      sag: element.config.sag, radius: SKATE.cableRadius, material: "steel",
    });
    for (const [x, dir] of [[0, 1], [L, -1]]) {
      cableTermination(builder, {
        at: { x, y: (dir > 0 ? 0 : frame.rise) + SKATE.hangHeight, z: side * SKATE.hangSpread },
        along: { x: dir, y: 0, z: 0 }, radius: SKATE.cableRadius,
      });
    }
  }
  const statics = builder.build(`${element.id}-fixed`);

  // --- the board: its own group, built around local (0,0,0) so it can be repositioned every frame ----
  const board = buildBoard(builder, `${element.id}-board`);
  return { groups: [statics, board], board };
}

/** The board, its two hangers and four wheels, all around local origin (like the zip line's trolley). */
function buildBoard(builder, id) {
  builder.box({
    length: SKATE.boardLength, width: SKATE.boardWidth, thickness: SKATE.boardThickness,
    position: { x: 0, y: -SKATE.boardThickness / 2, z: 0 }, material: "weathered",
  });
  for (const z of [-SKATE.hangSpread, SKATE.hangSpread]) {                 // hangers UP to the cables
    builder.cylinderBetween({
      from: { x: 0, y: -SKATE.boardThickness, z }, to: { x: 0, y: SKATE.hangHeight, z },
      radius: SKATE.hangerRadius, segments: 8, material: "steel",
    });
  }
  for (const x of [-SKATE.boardLength * 0.32, SKATE.boardLength * 0.32]) {  // four small deck wheels, cosmetic
    for (const z of [-SKATE.boardWidth * 0.4, SKATE.boardWidth * 0.4]) {
      builder.cylinderBetween({
        from: { x, y: -SKATE.boardThickness - 0.006, z: z - 0.014 }, to: { x, y: -SKATE.boardThickness - 0.006, z: z + 0.014 },
        radius: SKATE.wheelRadius * 0.55, segments: 10, material: "rubber",
      });
    }
  }
  return builder.build(id);
}
