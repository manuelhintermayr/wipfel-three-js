// Player (M0.3): Rapier kinematic character controller + ground/air state machine + render
// interpolation. Owns the procedural rig and the shoulder camera. Physics is authoritative;
// `terrain.heightAt` is only a spawn helper and a last-resort fallback.
//
// Loop wiring (main.js): physics → player.fixedUpdate(dt) before physics.step(); gameplay →
// player.update(dt); render → player.render(alpha, dt).

import * as THREE from "three";
import { PHYSICS } from "../config.js";
import { GROUP, groups } from "../core/physics.js";
import { PLAYER } from "./tuning.js";
import { createStateMachine } from "./states.js";
import { createCameraController } from "./camera.js";
import { createRig } from "./rig.js";

const { damp } = THREE.MathUtils;
const TWO_PI = Math.PI * 2;
const wrapAngle = (a) => a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI);
const COLLISION_GROUPS = groups(GROUP.PLAYER, GROUP.TERRAIN | GROUP.STATIC | GROUP.DYNAMIC);
const SPAWN_LIFT = 0.05;

/**
 * @param {{ physics: import("../core/physics.js").Physics, scene: THREE.Scene, camera: THREE.PerspectiveCamera,
 *           input: import("../core/input.js").Input, terrain?: { heightAt(x:number,z:number): number, spawn?: {x,y,z} },
 *           rng: import("../core/rng.js").Rng, spawn?: {x:number,y:number,z:number} }} options
 *   `spawn` is the feet position (defaults to terrain.spawn, then heightAt(0,0)).
 */
export function createPlayer({ physics, scene, camera, input, terrain = null, rng, spawn = null }) {
  const R = physics.RAPIER;
  const world = physics.world;
  const gravity = PHYSICS.gravity.y;

  const start = resolveSpawn(terrain, spawn);
  const body = world.createRigidBody(
    R.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, start.y + PLAYER.feetOffset, start.z),
  );
  const collider = world.createCollider(
    R.ColliderDesc.capsule(PLAYER.halfHeight, PLAYER.radius).setCollisionGroups(COLLISION_GROUPS).setFriction(0),
    body,
  );
  const kcc = createCharacterController(world);
  const rig = createRig({ rng });
  scene.add(rig.root);
  const cameraCtl = createCameraController({ camera, physics, input, target: { body } });

  // --- state ---------------------------------------------------------------------------------------
  const position = new THREE.Vector3(start.x, start.y, start.z);   // feet, physics (authoritative)
  const prevPosition = position.clone();
  const renderPosition = position.clone();                          // interpolated, used by rig + camera
  const velocity = new THREE.Vector3();
  const wish = new THREE.Vector3();                                 // wanted horizontal velocity (world)
  const desired = { x: 0, y: 0, z: 0 };
  const eye = new THREE.Vector3();
  let heading = 0, prevHeading = 0, renderHeading = 0;
  let grounded = false;
  let jumpBuffer = 0, coyote = 0;
  let airWeight = 0, landWeight = 0;
  let frameDt = 1 / PHYSICS.hz;

  // --- locomotion states ---------------------------------------------------------------------------
  const groundState = {
    enter() { coyote = PLAYER.coyoteTime; },
    update(_, dt) {
      accelerateHorizontal(dt, wish.lengthSq() > 0 ? PLAYER.groundAccel : PLAYER.groundDecel);
      coyote = PLAYER.coyoteTime;
      if (jumpBuffer > 0) return jump();
      velocity.y = -PLAYER.groundStick;
    },
    postMove() { if (!grounded) return "air"; },
  };
  const airState = {
    update(_, dt) {
      velocity.y = Math.max(velocity.y + gravity * dt, -PLAYER.maxFallSpeed);
      if (wish.lengthSq() > 0) accelerateHorizontal(dt, PLAYER.airAccel);
      if (jumpBuffer > 0 && coyote > 0) return jump();
      coyote = Math.max(0, coyote - dt);
    },
    postMove() {
      if (!grounded || velocity.y > 0) return;
      if (-velocity.y > 1) landWeight = Math.min(1, -velocity.y / PLAYER.landPoseSpeed);
      velocity.y = 0;
      return "ground";
    },
  };
  const fsm = createStateMachine({ states: { ground: groundState, air: airState }, initial: "air" });

  function jump() {
    jumpBuffer = 0;
    coyote = 0;
    velocity.y = PLAYER.jumpSpeed;
    return "air";
  }

  /** Move the horizontal velocity towards `wish` at `rate` m/s². */
  function accelerateHorizontal(dt, rate) {
    const dx = wish.x - velocity.x, dz = wish.z - velocity.z;
    const dist = Math.hypot(dx, dz);
    const step = rate * dt;
    if (dist <= step || dist < 1e-6) { velocity.x = wish.x; velocity.z = wish.z; return; }
    velocity.x += dx / dist * step;
    velocity.z += dz / dist * step;
  }

  function readMoveInput() {
    const mx = input.move.x, my = input.move.y;
    const len = Math.hypot(mx, my);
    if (len < 0.01) { wish.set(0, 0, 0); return; }
    const speed = (input.down("sprint") ? PLAYER.sprintSpeed : PLAYER.walkSpeed) * Math.min(1, len);
    wish.copy(cameraCtl.forward).multiplyScalar(my).addScaledVector(cameraCtl.right, mx);
    wish.y = 0;
    wish.normalize().multiplyScalar(speed);
  }

  /** One KCC step: desired = velocity·dt, corrected by Rapier, applied as next kinematic translation. */
  function moveBody(dt) {
    desired.x = velocity.x * dt; desired.y = velocity.y * dt; desired.z = velocity.z * dt;
    kcc.computeColliderMovement(collider, desired, R.QueryFilterFlags.EXCLUDE_SENSORS, COLLISION_GROUPS);
    const moved = kcc.computedMovement();
    grounded = kcc.computedGrounded();
    const t = body.translation();
    position.set(t.x + moved.x, t.y + moved.y - PLAYER.feetOffset, t.z + moved.z);
    body.setNextKinematicTranslation({ x: position.x, y: position.y + PLAYER.feetOffset, z: position.z });
    // keep `velocity` truthful: walls/steps/slopes change what actually happened
    velocity.x = moved.x / dt;
    velocity.z = moved.z / dt;
    if (velocity.y > 0 && moved.y < desired.y - 1e-4) velocity.y = 0;   // head bump
  }

  function updateHeading(dt) {
    let target = heading;
    if (cameraCtl.isFirstPerson) { heading = cameraCtl.yaw; return; }
    if (wish.lengthSq() > 0.0025) target = Math.atan2(wish.x, wish.z);
    heading = wrapAngle(heading + wrapAngle(target - heading) * (1 - Math.exp(-PLAYER.turnRate * dt)));
  }

  /** Physics is authoritative – but if the body tunnelled below the terrain, put it back on top. */
  function applyTerrainFallback() {
    if (!terrain || typeof terrain.heightAt !== "function") return;
    const h = terrain.heightAt(position.x, position.z);
    if (Number.isFinite(h) && position.y < h - PLAYER.fallbackDepth) player.teleport(position.x, h + SPAWN_LIFT, position.z);
  }

  function updatePoseWeights(dt) {
    const inAir = fsm.is("air");
    airWeight = damp(airWeight, inAir ? 1 : 0, inAir ? 7 : 12, dt);
    landWeight = damp(landWeight, 0, 5, dt);
    rig.setMoveBlend(Math.hypot(velocity.x, velocity.z) / PLAYER.sprintSpeed);
    rig.setPose("air", airWeight);
    rig.setPose("land", landWeight);
  }

  // --- public object -------------------------------------------------------------------------------
  const player = {
    body,
    collider,
    controller: kcc,
    rig,
    camera: cameraCtl,
    /** feet position after the last physics step (authoritative) */
    position,
    /** feet position interpolated for the current frame */
    renderPosition,
    velocity,
    get mode() { return fsm.current; },
    get grounded() { return grounded; },
    get heading() { return heading; },
    get speed() { return Math.hypot(velocity.x, velocity.z); },
    states: fsm,

    /** physics phase (fixed dt), before physics.step() */
    fixedUpdate(dt) {
      prevPosition.copy(position);
      prevHeading = heading;
      readMoveInput();
      fsm.tick(dt);
      fsm.dispatch("update", player, dt);
      moveBody(dt);
      fsm.dispatch("postMove", player);
      updateHeading(dt);
      jumpBuffer = Math.max(0, jumpBuffer - dt);
      applyTerrainFallback();
    },

    /** gameplay phase (once per frame): edge-triggered input */
    update(dt) {
      frameDt = dt;
      if (input.pressed("jump")) jumpBuffer = PLAYER.jumpBufferTime;
    },

    /** render phase: interpolation, pose blending, camera */
    render(alpha, dt = frameDt) {
      renderPosition.lerpVectors(prevPosition, position, alpha);
      renderHeading = prevHeading + wrapAngle(heading - prevHeading) * alpha;
      rig.root.position.copy(renderPosition);
      rig.root.rotation.y = renderHeading;
      updatePoseWeights(dt);
      rig.update(dt);
      const firstPerson = cameraCtl.isFirstPerson;
      rig.setVisible(!firstPerson);
      const eyePos = firstPerson ? rig.attach.head.getWorldPosition(eye) : null;
      cameraCtl.update(dt, renderPosition, velocity, eyePos);
    },

    setThirdPerson(on) { cameraCtl.setFirstPerson(!on); },

    /** Place the feet at (x, y, z) immediately, resetting motion and interpolation. */
    teleport(x, y, z) {
      position.set(x, y, z);
      prevPosition.copy(position);
      renderPosition.copy(position);
      velocity.set(0, 0, 0);
      body.setTranslation({ x, y: y + PLAYER.feetOffset, z }, true);
      body.setNextKinematicTranslation({ x, y: y + PLAYER.feetOffset, z });
      cameraCtl.reset();
    },

    dispose() {
      world.removeCharacterController(kcc);
      world.removeCollider(collider, false);
      world.removeRigidBody(body);
      scene.remove(rig.root);
      rig.dispose();
      cameraCtl.dispose();
    },
  };

  fsm.start(player);
  return player;
}

function createCharacterController(world) {
  const k = PLAYER.kcc;
  const kcc = world.createCharacterController(k.offset);
  kcc.setUp({ x: 0, y: 1, z: 0 });
  kcc.setMaxSlopeClimbAngle(k.maxSlopeClimb);
  kcc.setMinSlopeSlideAngle(k.minSlopeSlide);
  kcc.enableAutostep(k.autostepHeight, k.autostepMinWidth, true);
  kcc.enableSnapToGround(k.snapToGround);
  kcc.setSlideEnabled(true);
  kcc.setApplyImpulsesToDynamicBodies(true);
  kcc.setCharacterMass(PLAYER.massKg);
  return kcc;
}

function resolveSpawn(terrain, spawn) {
  const s = spawn || (terrain && terrain.spawn) || null;
  if (s) return { x: s.x, y: s.y + SPAWN_LIFT, z: s.z };
  const h = terrain && typeof terrain.heightAt === "function" ? terrain.heightAt(0, 0) : 0;
  return { x: 0, y: (Number.isFinite(h) ? h : 0) + SPAWN_LIFT, z: 0 };
}
