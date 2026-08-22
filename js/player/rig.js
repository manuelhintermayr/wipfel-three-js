// Procedural climber rig (mockup: female climber, dark tank top, dark capri pants, full-body harness with
// orange/black webbing, gloves, hair in a bun, Y-lanyard with two roller carabiners, trolley on the hip).
// Body: rig-body.js · gear: rig-gear.js · poses: rig-poses.js. This file owns materials, pose blending
// and the public API. All geometry is procedural; no textures, no `document`.

import * as THREE from "three";
import { PLAYER, RIG } from "./tuning.js";
import { buildBody } from "./rig-body.js";
import { addHarness, addLanyard, addTrolley } from "./rig-gear.js";
import { JOINT_NAMES, POSE_SIZE, createPose, lerpPose, idlePose, gaitPose, airPose, landPose, strideLength } from "./rig-poses.js";

const { clamp, smoothstep, damp } = THREE.MathUtils;
const TWO_PI = Math.PI * 2;

function createMaterials() {
  const std = (color, roughness, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  return {
    skin: std(0xd2a07e, 0.62),
    top: std(0x24272c, 0.9),
    pants: std(0x1e2126, 0.85),
    hair: std(0x1c1411, 0.55),
    glove: std(0x2b2523, 0.7),
    shoe: std(0x2c2f2b, 0.75),
    webbing: std(0x2a2b2f, 0.85),
    orange: std(0xf0741c, 0.7),
    metal: std(0xb9bec6, 0.35, 0.9),
    rope: std(0x45464a, 0.8),
  };
}

/**
 * @param {{ rng: import("../core/rng.js").Rng }} options – rng only seeds idle phase offsets
 * @returns {{ root: THREE.Group, joints: Record<string, THREE.Group>, attach: Record<string, THREE.Object3D>,
 *   setPose(name: string, weight: number): void, setMoveBlend(speedNormalized: number): void,
 *   registerPose(name: string, fn: (out: Float32Array) => void): void, update(dt: number): void,
 *   setVisible(on: boolean): void, dispose(): void }}
 */
export function createRig({ rng }) {
  const materials = createMaterials();
  const { root, joints, attach } = buildBody(materials);
  addHarness(joints, materials, attach);
  const lanyard = addLanyard(attach, materials);
  addTrolley(joints, materials);
  const pelvisRestY = joints.pelvis.position.y;
  const jointList = JOINT_NAMES.map((n) => joints[n]);

  // --- animation state -----------------------------------------------------------------------------
  const seeds = Array.from({ length: 6 }, () => (rng ? rng.float(0, TWO_PI) : 0));
  const overlays = { air: airPose, land: landPose };            // name → pose fn (static poses)
  const overlayOrder = ["air", "land"];
  const weights = { air: 0, land: 0 };
  const idleBuf = createPose(), gaitBuf = createPose(), overlayBuf = createPose();
  const target = createPose(), applied = createPose();
  let time = 0, phase = 0, moveBlend = 0, prevMoveBlend = 0, gaitWeight = 0;
  let lanyardTilt = 0, lanyardVel = 0;
  let firstFrame = true;

  function computeTarget(dt) {
    const speed = moveBlend * PLAYER.sprintSpeed;
    const run = smoothstep(moveBlend, 0.5, 1.0);
    gaitWeight = damp(gaitWeight, clamp(speed / RIG.gaitBlendSpeed, 0, 1), 12, dt);
    phase += dt * speed / strideLength(run, RIG.strideWalk, RIG.strideRun) * TWO_PI;
    idlePose(idleBuf, time, seeds);
    gaitPose(gaitBuf, phase, run);
    lerpPose(target, idleBuf, gaitBuf, gaitWeight);
    for (const name of overlayOrder) {
      const w = weights[name];
      if (w <= 0.001) continue;
      overlays[name](overlayBuf);
      lerpPose(target, target, overlayBuf, clamp(w, 0, 1));
    }
  }

  function applyTarget(dt) {
    const k = firstFrame ? 1 : 1 - Math.exp(-RIG.poseSmoothing * dt);
    firstFrame = false;
    for (let i = 0; i < POSE_SIZE; i++) applied[i] += (target[i] - applied[i]) * k;
    joints.pelvis.position.set(applied[0], pelvisRestY + applied[1], applied[2]);
    for (let j = 0; j < jointList.length; j++) {
      const i = 3 + j * 3;
      jointList[j].rotation.set(applied[i], applied[i + 1], applied[i + 2]);
    }
  }

  /** Lanyard swings back when accelerating, forward when braking, and sways with the gait. */
  function updateLanyard(dt) {
    const accel = dt > 0 ? (moveBlend - prevMoveBlend) / dt * PLAYER.sprintSpeed : 0;
    prevMoveBlend = moveBlend;
    const rest = 0.06 * Math.sin(phase * 2) * gaitWeight - 0.04 * moveBlend;
    lanyardVel += (-40 * (lanyardTilt - rest) - 6 * lanyardVel + accel * 0.35) * dt;
    lanyardTilt += lanyardVel * dt;
    lanyard.rotation.x = clamp(lanyardTilt, -0.6, 0.6);
    lanyard.rotation.z = 0.05 * Math.sin(phase) * gaitWeight;
  }

  return {
    root,
    joints,
    attach,
    /** Overlay weight 0..1 for "air", "land" (and poses added via registerPose). */
    setPose(name, weight) {
      if (!(name in overlays)) return;
      weights[name] = clamp(weight, 0, 1);
    },
    /** 0 = standing, walkSpeed/sprintSpeed ≈ 0.48 = walk, 1 = sprint. */
    setMoveBlend(speedNormalized) { moveBlend = clamp(speedNormalized, 0, 1.2); },
    /** Add an overlay pose (ladder, hang, sit …); blended after "air"/"land" in registration order. */
    registerPose(name, fn) {
      overlays[name] = fn;
      weights[name] = 0;
      if (!overlayOrder.includes(name)) overlayOrder.push(name);
    },
    update(dt) {
      time += dt;
      computeTarget(dt);
      applyTarget(dt);
      updateLanyard(dt);
    },
    setVisible(on) { root.visible = !!on; },
    dispose() {
      root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      for (const mat of Object.values(materials)) mat.dispose();
      root.removeFromParent();
    },
  };
}
