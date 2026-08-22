// State "fall": half a metre into the harness, then swinging under the lifeline (GDD §3.5). No
// death, no loading screen – just a very loud reminder that the system works.
//
// Physics: a dynamic Rapier body at the harness attachment point, tied with a rope joint (lanyard
// 0.85 m + slack) to a kinematic anchor that sits on the lifeline. The anchor is the carabiner: it
// starts at the projection of the slip point onto the cable and slides along it when the climber
// hauls themselves hand over hand towards a platform. The dynamic body carries a collider in a
// group that collides with nothing, so the pendulum is clean and deterministic and cannot snag on
// the exercise it just fell off.
//
// Three ways out: pull up (W / space, costs strength, only under the element), haul to a platform
// (move.y, slow but safe), or call the rescuer (E) – which marks the element as abandoned.

import * as THREE from "three";
import { GROUP, groups } from "../core/physics.js";
import { FALL } from "./tuning.js";
import { fallPose } from "./rig-poses.js";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const NO_CONTACTS = groups(GROUP.DYNAMIC, 0);

const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * @param {{ physics, input, scene?, events?, balance, stamina, nerves, camera? }} options
 * @returns {object} a state for the player's state machine – register it with `player.addState("fall", …)`
 */
export function createFallState({ physics, input, scene = null, events = null, balance, stamina, nerves, camera = null }) {
  const R = physics.RAPIER;
  const world = physics.world;
  const anchorPoint = new THREE.Vector3(), hang = new THREE.Vector3(), rail = new THREE.Vector3();
  const tangent = new THREE.Vector3(), side = new THREE.Vector3();
  const reach = new THREE.Vector3();
  const params = { swing: 0, pull: 0, haul: 0, phase: 0 };

  let body = null, anchorBody = null, joint = null, collider = null, lanyard = null;
  let element = null, railT = 0, cableT = 0, heading = 0;
  let elapsed = 0, pullTimer = 0, hauling = 0, fades = 0;
  let falls = 0;                       // the first catch is the dramatic one

  /** Build (once) the two bodies and the rope between them; they are parked when nobody is falling. */
  function ensureBodies() {
    if (body) return;
    anchorBody = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    body = world.createRigidBody(R.RigidBodyDesc.dynamic()
      .setLinearDamping(FALL.linearDamping).setAngularDamping(FALL.angularDamping).setCcdEnabled(false));
    collider = world.createCollider(
      R.ColliderDesc.ball(FALL.bodyRadius).setDensity(FALL.bodyDensity).setCollisionGroups(NO_CONTACTS),
      body,
    );
    joint = world.createImpulseJoint(
      R.JointData.rope(FALL.lanyard + FALL.slack, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
      anchorBody, body, true,
    );
    body.setEnabled(false);
  }

  /**
   * The webbing itself. Without it the climber just floats: the one line from the carabiner down to
   * the harness is what makes the catch readable. A unit cylinder that hangs from its own origin, so
   * every frame is a position, a rotation and one scale.
   */
  function ensureLanyard() {
    if (lanyard || !scene) return;
    const geometry = new THREE.CylinderGeometry(FALL.lanyardRadius, FALL.lanyardRadius * 0.85, 1, 6, 1, true);
    geometry.translate(0, -0.5, 0);
    lanyard = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xdc6a1e, roughness: 0.92, metalness: 0 }));
    lanyard.name = "harness-lanyard";
    lanyard.visible = false;
    lanyard.frustumCulled = false;
    scene.add(lanyard);
  }

  function drawLanyard() {
    if (!lanyard) return;
    reach.subVectors(hang, anchorPoint);
    const length = Math.max(0.05, reach.length());
    lanyard.position.copy(anchorPoint);
    lanyard.quaternion.setFromUnitVectors(DOWN, reach.divideScalar(length));
    lanyard.scale.set(1, length, 1);
  }

  /** Move the carabiner to `t` along the lifeline. */
  function placeAnchor(t, immediate = false) {
    cableT = clamp01(t);
    element.lifeline.pointAt(cableT, anchorPoint);
    if (immediate) anchorBody.setTranslation(anchorPoint, true);
    anchorBody.setNextKinematicTranslation(anchorPoint);
  }

  const state = {
    ownsMovement: true,
    blendRate: 12,
    get element() { return element; },
    get hanging() { return body != null && element != null; },
    get seconds() { return elapsed; },
    get cableT() { return cableT; },
    get canPullUp() { return underElement() && stamina.canGrip; },
    get canRescue() { return elapsed >= FALL.rescueDelay || stamina.isEmpty; },
    get rescueFade() { return fades; },
    pose(out) { return fallPose(out, params); },

    enter(player, data) {
      element = (data && data.element) || null;
      if (!element) return;
      railT = data.t == null ? 0.5 : clamp01(data.t);
      elapsed = 0; pullTimer = 0; hauling = 0; fades = 0;
      falls += 1;

      ensureBodies();
      ensureLanyard();
      element.pointAt(railT, rail);
      element.tangentAt(railT, tangent);
      side.set(-tangent.z, 0, tangent.x).normalize();
      heading = Math.atan2(tangent.x, tangent.z);
      hang.set(rail.x, rail.y + FALL.harnessHeight, rail.z);
      // never start the carabiner exactly on a platform – there would be nothing left to do
      placeAnchor(Math.min(0.96, Math.max(0.04, element.lifeline.closestT(hang))), true);
      body.setEnabled(true);
      body.setTranslation({ x: hang.x, y: hang.y, z: hang.z }, true);
      body.setLinvel({ x: player.velocity.x * 0.4, y: -0.6, z: player.velocity.z * 0.4 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      player.setHeading(heading);
      if (lanyard) { lanyard.visible = true; drawLanyard(); }

      if (camera) {
        camera.addShake(falls === 1 ? FALL.catchShake : FALL.catchShakeLater);
        camera.setPivotOffset(FALL.cameraDrop);
      }
      nerves.shock(0.18);
      balance.reset(0);
      if (events) events.emit("player:fell", { element: element.id, kind: element.kind, t: railT, first: falls === 1 });
    },

    exit(player) {
      if (camera) camera.setPivotOffset(0);
      if (element) element.occupancy.active = false;
      if (lanyard) lanyard.visible = false;
      if (body) { body.setLinvel({ x: 0, y: 0, z: 0 }, false); body.setEnabled(false); }
      player.velocity.set(0, 0, 0);
      element = null;
    },

    update(player, dt) {
      if (!element || !body) return "ground";
      elapsed += dt;
      params.phase += dt * 3.4 * hauling;

      // W / S walk the carabiner along the cable – towards the exit platform and back again
      const drive = input.move.y;
      hauling = Math.abs(drive) > 0.15 ? 1 : 0;
      if (hauling) placeAnchor(cableT + Math.sign(drive) * FALL.haulSpeed * dt / Math.max(0.5, element.lifeline.length));

      const pulling = input.down("jump") && state.canPullUp;
      pullTimer = pulling ? pullTimer + dt : Math.max(0, pullTimer - dt * 2);

      stamina.update(dt, { hanging: true, hauling: hauling > 0, pullingUp: pulling });
      const groundY = element.groundY == null ? player.position.y - 6 : element.groundY;
      nerves.update(dt, {
        height: player.position.y - groundY,
        exposure: 0.4, wobble: 0.2, onElement: true,
        breathing: input.down("breathe"),
      });

      followBody(player, dt);

      if (pullTimer >= FALL.pullUpSeconds) return recover(player);
      if (cableT <= 0.001 || cableT >= 0.999) return arrive(player);
      if (input.pressed("interact") && state.canRescue) return rescue(player);
      return undefined;
    },
  };

  /** Drive the visible body from the pendulum and tilt the rig with the lanyard. */
  function followBody(player, dt) {
    const t = body.translation();
    hang.set(t.x, t.y, t.z);
    player.moveTo(hang.x, hang.y - FALL.harnessHeight, hang.z);
    player.setHeading(heading);                       // still facing the way the exercise runs
    const dx = hang.x - anchorPoint.x, dz = hang.z - anchorPoint.z;
    const drop = Math.max(0.2, anchorPoint.y - hang.y);
    params.swing = Math.atan2(dx * side.x + dz * side.z, drop);   // sideways under the cable
    params.pull += (pullTimer / FALL.pullUpSeconds - params.pull) * Math.min(1, 10 * dt);
    params.haul += (hauling - params.haul) * Math.min(1, 8 * dt);
    drawLanyard();
  }

  /** Is the harness close enough under the exercise to get a knee back over it? */
  function underElement() {
    if (!element) return false;
    element.pointAt(element.lifeline.closestT(hang), rail);
    return hang.distanceTo(rail) <= FALL.pullUpReach;
  }

  /** Pull-up finished: back on the rail where the carabiner is, with the balance barely held. */
  function recover(player) {
    const t = element.lifeline.closestT(hang);
    stamina.spend(0.12);
    balance.catchAt(element.slipAngle);
    nerves.survivedFall();
    if (events) events.emit("player:recovered", { element: element.id, t, how: "pull-up" });
    return { state: "element", data: { element, t } };
  }

  /** Hauled all the way to a platform: step off there, still clipped to the same lifeline. */
  function arrive(player) {
    const anchor = cableT <= 0.5 ? element.getEntryAnchor() : element.getExitAnchor();
    nerves.survivedFall();
    if (events) events.emit("player:recovered", { element: element.id, how: "haul", platform: anchor.platformId });
    player.teleport(anchor.stand.x, anchor.stand.y, anchor.stand.z);
    return "ground";
  }

  /** The rescuer: the run counts the element as abandoned and the climber is put back where they started. */
  function rescue(player) {
    const anchor = element.getEntryAnchor();
    fades = 1;
    nerves.survivedFall();
    nerves.reset(0.35);
    stamina.reset(0.55);
    if (events) events.emit("player:rescued", { element: element.id, platform: anchor.platformId });
    player.teleport(anchor.stand.x, anchor.stand.y, anchor.stand.z);
    return "ground";
  }

  state.dispose = function dispose() {
    if (joint) world.removeImpulseJoint(joint, false);
    if (collider) world.removeCollider(collider, false);
    if (body) world.removeRigidBody(body);
    if (anchorBody) world.removeRigidBody(anchorBody);
    if (lanyard) { lanyard.removeFromParent(); lanyard.geometry.dispose(); lanyard.material.dispose(); }
    joint = collider = body = anchorBody = lanyard = null;
  };
  return state;
}
