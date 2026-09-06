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
import { createLadderState } from "./climb-ladder.js";
import { ladderPose } from "./rig-poses.js";

const { damp } = THREE.MathUtils;
const TWO_PI = Math.PI * 2;
const wrapAngle = (a) => a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI);
const COLLISION_GROUPS = groups(GROUP.PLAYER, GROUP.TERRAIN | GROUP.STATIC | GROUP.DYNAMIC);
const SPAWN_LIFT = 0.05;

/**
 * @param {{ physics: import("../core/physics.js").Physics, scene: THREE.Scene, camera: THREE.PerspectiveCamera,
 *           input: import("../core/input.js").Input, terrain?: { heightAt(x:number,z:number): number, spawn?: {x,y,z} },
 *           rng: import("../core/rng.js").Rng, spawn?: {x:number,y:number,z:number},
 *           events?: { emit(name: string, payload?: object): void }, rigVariant?: "p1"|"p2" }} options
 *   `spawn` is the feet position (defaults to terrain.spawn, then heightAt(0,0)). `rigVariant` (M4,
 *   js/game/coop.js): passed straight to js/player/rig.js#createRig's own colour-variant option – the
 *   controller has no opinion on it besides carrying it through.
 */
export function createPlayer({ physics, scene, camera, input, terrain = null, rng, spawn = null, events = null, rigVariant = "p1" }) {
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
  const rig = createRig({ rng, colourVariant: rigVariant });
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
  const ladderState = createLadderState({ input, events });
  const fsm = createStateMachine({ states: { ground: groundState, air: airState, ladder: ladderState }, initial: "air" });
  rig.registerPose("ladder", (out) => ladderPose(out, ladderState.phase));
  let ladderWeight = 0;
  /** States registered from outside (element, fall) plus their blended pose weight. */
  const extraStates = [];

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
    // Keep `velocity` truthful: walls, steps and slopes change what actually happened. But the KCC
    // also reports the push it needed to get the capsule out of a penetration, and reading a
    // velocity back from *that* launches the character – a rail state that teleports onto a deck
    // (zip arrival, step-off, rescue) can leave the capsule a few centimetres inside the planks and
    // come out doing 25 m/s. An obstacle can only ever take speed away, never add it.
    const asked = Math.hypot(velocity.x, velocity.z);
    velocity.x = moved.x / dt;
    velocity.z = moved.z / dt;
    const got = Math.hypot(velocity.x, velocity.z);
    if (got > asked + 1e-4) {
      velocity.x *= asked / got;
      velocity.z *= asked / got;
    }
    if (velocity.y > 0 && moved.y < desired.y - 1e-4) velocity.y = 0;   // head bump
  }

  function updateHeading(dt) {
    let target = heading;
    if (cameraCtl.isFirstPerson) { heading = cameraCtl.yaw; return; }
    if (wish.lengthSq() > 0.0025) target = Math.atan2(wish.x, wish.z);
    heading = wrapAngle(heading + wrapAngle(target - heading) * (1 - Math.exp(-PLAYER.turnRate * dt)));
  }

  /** True while the active state moves the body itself (ladder, later element/zipline rails). */
  function ownsMovement() {
    const state = fsm.get();
    return !!(state && state.ownsMovement);
  }

  /** Physics is authoritative – but if the body tunnelled below the terrain, put it back on top. */
  function applyTerrainFallback() {
    if (!terrain || typeof terrain.heightAt !== "function") return;
    if (ownsMovement()) return;
    const h = terrain.heightAt(position.x, position.z);
    if (Number.isFinite(h) && position.y < h - PLAYER.fallbackDepth) player.teleport(position.x, h + SPAWN_LIFT, position.z);
  }

  function updatePoseWeights(dt) {
    const inAir = fsm.is("air");
    const onLadder = fsm.is("ladder");
    const onRail = onLadder || extraStates.some((s) => fsm.is(s.name));
    airWeight = damp(airWeight, inAir ? 1 : 0, inAir ? 7 : 12, dt);
    landWeight = damp(landWeight, 0, 5, dt);
    ladderWeight = damp(ladderWeight, onLadder ? 1 : 0, 9, dt);
    rig.setMoveBlend(onRail ? 0 : Math.hypot(velocity.x, velocity.z) / PLAYER.sprintSpeed);
    rig.setPose("air", airWeight);
    rig.setPose("land", landWeight);
    rig.setPose("ladder", ladderWeight);
    for (const extra of extraStates) {
      extra.weight = damp(extra.weight, fsm.is(extra.name) ? 1 : 0, extra.blendRate, dt);
      rig.setPose(extra.poseName, extra.weight);
    }
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
      if (!ownsMovement()) {                     // ladder & co. drive the body themselves
        moveBody(dt);
        fsm.dispatch("postMove", player);
        updateHeading(dt);
      }
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
      // A state may declare that its body stays in view in first person (`showBody`): sitting in a
      // zip harness, the legs coming up are the readout, so hiding the rig would hide the mechanic.
      const active = fsm.get();
      const showBody = !!(active && active.showBody);
      rig.setVisible(!firstPerson || showBody, firstPerson);
      const eyePos = firstPerson ? rig.attach.head.getWorldPosition(eye) : null;
      cameraCtl.update(dt, renderPosition, velocity, eyePos);
    },

    setThirdPerson(on) { cameraCtl.setFirstPerson(!on); },

    /** Face this yaw (radians) – used by states that steer the body themselves. */
    setHeading(yaw) { heading = wrapAngle(yaw); },

    /**
     * Register a locomotion state built outside the controller (element, fall, zipline). A state
     * that exposes `pose(out)` also gets a rig overlay that fades in while the state is active.
     * @param {string} name
     * @param {{ ownsMovement?: boolean, pose?: (out: Float32Array) => void, blendRate?: number }} state
     */
    addState(name, state) {
      fsm.add(name, state);
      if (typeof state.pose === "function") {
        const poseName = `state-${name}`;
        rig.registerPose(poseName, state.pose);
        extraStates.push({ name, poseName, weight: 0, blendRate: state.blendRate || 9 });
      }
      return player;
    },

    /**
     * Switch locomotion state from the outside (stepping onto an element, a rescue putting the
     * climber back on a platform). `data` is handed to the state's `enter` hook.
     * @returns {boolean} true when the state exists and is now active
     */
    setState(name, data = null) {
      if (!fsm.has(name)) return false;
      jumpBuffer = 0;
      fsm.set(name, player, data);
      return fsm.is(name);
    },

    /**
     * Switch to rail locomotion on a block ladder (js/elements/ladder.js).
     * @returns {boolean} false when the player is not in a state that may start climbing
     */
    climbLadder(ladder) {
      if (!ladder || fsm.is("ladder")) return false;
      jumpBuffer = 0;
      fsm.set("ladder", player, { ladder });
      return fsm.is("ladder");
    },

    /** Leave the ladder wherever the climber currently is. */
    leaveLadder() {
      if (!fsm.is("ladder")) return false;
      fsm.set("ground", player);
      return true;
    },

    /** Move the feet without touching camera smoothing or interpolation history (rail states). */
    moveTo(x, y, z) {
      position.set(x, y, z);
      body.setNextKinematicTranslation({ x, y: y + PLAYER.feetOffset, z });
    },

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
