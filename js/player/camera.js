// Third-person shoulder camera with collision (Rapier sphere cast against TERRAIN|STATIC), adaptive
// FOV and a first-person toggle. Pure math + physics queries – never touches `document`.
//
// Conventions: yaw φ → ground forward (sin φ, 0, cos φ); pitch > 0 looks up.
// The camera looks along `look`; the character is framed over the right shoulder (shoulderX > 0).

import * as THREE from "three";
import { GROUP, groups } from "../core/physics.js";
import { CAMERA, PLAYER } from "./tuning.js";

const { clamp, lerp, smoothstep, damp } = THREE.MathUtils;
const UP = new THREE.Vector3(0, 1, 0);
const TWO_PI = Math.PI * 2;
// Probe groups: member PLAYER (so the player's own collider filter rejects it), sees TERRAIN|STATIC only.
const PROBE_GROUPS = groups(GROUP.PLAYER, GROUP.TERRAIN | GROUP.STATIC);
const IDENTITY_ROT = { x: 0, y: 0, z: 0, w: 1 };

const wrapAngle = (a) => a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI);

/**
 * @param {{ camera: THREE.PerspectiveCamera, physics: import("../core/physics.js").Physics,
 *           input?: { look: {x:number,y:number}, pressed(a:string): boolean },
 *           target?: { body?: object } }} options
 *   `target.body` (Rapier RigidBody) is excluded from collision probes.
 */
export function createCameraController({ camera, physics, input = null, target = null }) {
  const R = physics.RAPIER;
  const world = physics.world;
  const probeShape = new R.Ball(CAMERA.probeRadius);
  const excludeBody = target && target.body ? target.body : null;

  let yaw = 0;
  let pitch = CAMERA.pitchDefault;
  let firstPerson = false;
  let shoulderX = CAMERA.shoulderX;
  let shoulderY = CAMERA.shoulderY;
  let extraFov = 0;
  let fov = CAMERA.fovBase;
  let distance = CAMERA.distanceMin;   // smoothed wanted arm length
  let clearance = 1;                   // fraction of the arm currently free of obstacles
  let pivotY = null;                   // vertically smoothed pivot height
  let disposed = false;
  let trauma = 0;                      // 0..1 shake energy, decays on its own
  let shakeTime = 0;
  let breathing = 0;                   // radians of nerve-driven sway
  let breathPhase = 0;
  let pivotOffset = 0;                 // metres the pivot is pulled down (hanging in the harness)
  let reducedMotion = false;
  // M4 co-op (ADR-030 "dynamic shared frame", js/player/coop-camera.js): while set, the third-person
  // pivot follows this world position instead of `targetPos`, and the wanted arm length is this exact
  // distance instead of the walk/sprint `CAMERA.distanceMin/Max` blend – co-op computes both fresh every
  // frame from both climbers' positions. `null` (the default, and whenever co-op is off) is the original
  // single-player behaviour, untouched.
  let focusOverride = null;

  const forward = new THREE.Vector3(0, 0, 1);
  const right = new THREE.Vector3(-1, 0, 0);
  const look = new THREE.Vector3(0, 0, 1);
  const pivot = new THREE.Vector3();
  const arm = new THREE.Vector3();
  let offsetPitch = 0, offsetYaw = 0, offsetRoll = 0;

  camera.rotation.order = "YXZ";
  camera.fov = fov;
  camera.updateProjectionMatrix();

  function readInput() {
    if (!input) return;
    yaw = wrapAngle(yaw - input.look.x);
    pitch = clamp(pitch - input.look.y, CAMERA.pitchMin, CAMERA.pitchMax);
    if (input.pressed("camera")) firstPerson = !firstPerson;
  }

  function updateBasis() {
    forward.set(Math.sin(yaw), 0, Math.cos(yaw));
    right.crossVectors(forward, UP).normalize();
    const cp = Math.cos(pitch);
    look.set(cp * Math.sin(yaw), Math.sin(pitch), cp * Math.cos(yaw));
    camera.rotation.set(pitch + offsetPitch, yaw + Math.PI + offsetYaw, offsetRoll);
  }

  /**
   * Two things move the camera besides the player: the shake of a harness catch (trauma, squared so
   * it fades believably) and the slow sway of someone breathing too fast up there. Both collapse to
   * nothing when reduced motion is on – that switch lands in the options screen in M1.7.
   */
  function updateShake(dt) {
    shakeTime += dt;
    breathPhase += dt * (1.1 + 1.4 * breathing / Math.max(1e-4, CAMERA.breathMax));
    trauma = Math.max(0, trauma - dt / CAMERA.shakeDecay);
    if (reducedMotion) { offsetPitch = offsetYaw = offsetRoll = 0; return; }
    const k = trauma * trauma;
    offsetPitch = k * CAMERA.shakePitch * Math.sin(shakeTime * 37.1)
      + breathing * 0.6 * Math.sin(breathPhase);
    offsetYaw = k * CAMERA.shakeYaw * Math.sin(shakeTime * 29.3 + 1.7)
      + breathing * Math.sin(breathPhase * 0.63 + 0.9);
    offsetRoll = k * CAMERA.shakeRoll * Math.sin(shakeTime * 23.7 + 3.1)
      + breathing * 0.8 * Math.sin(breathPhase * 0.41 + 2.2);
  }

  function updateFov(dt, sprintMix) {
    const wanted = CAMERA.fovBase + CAMERA.fovSprint * sprintMix + extraFov;
    fov = damp(fov, wanted, CAMERA.fovRate, dt);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  /** Fraction (0..1) of `arm` from `pivot` that is free of TERRAIN|STATIC geometry. */
  function probe() {
    const hit = world.castShape(pivot, IDENTITY_ROT, arm, probeShape, 0, 1, true,
      R.QueryFilterFlags.EXCLUDE_SENSORS, PROBE_GROUPS, null, excludeBody);
    return hit ? clamp(hit.time_of_impact, 0, 1) : 1;
  }

  function updateThirdPerson(dt, targetPos, sprintMix) {
    const focusPos = focusOverride ? focusOverride.position : targetPos;
    const wantedY = focusPos.y + CAMERA.pivotHeight - pivotOffset;
    pivotY = pivotY == null ? wantedY : damp(pivotY, wantedY, CAMERA.pivotYRate, dt);
    pivot.set(focusPos.x, pivotY, focusPos.z);

    const wantedDistance = focusOverride ? focusOverride.distance : lerp(CAMERA.distanceMin, CAMERA.distanceMax, sprintMix);
    distance = damp(distance, wantedDistance, CAMERA.distanceRate, dt);
    arm.copy(right).multiplyScalar(shoulderX).addScaledVector(UP, shoulderY).addScaledVector(look, -distance);

    const free = probe();
    clearance = free < clearance ? free : damp(clearance, free, CAMERA.recoverRate, dt);
    camera.position.copy(pivot).addScaledVector(arm, clearance);
  }

  function updateFirstPerson(targetPos, eyePos) {
    if (eyePos) camera.position.copy(eyePos);
    else camera.position.copy(targetPos).addScaledVector(UP, CAMERA.eyeHeight);
    pivotY = null;
    clearance = 1;
  }

  return {
    get yaw() { return yaw; },
    set yaw(v) { yaw = wrapAngle(v); },
    get pitch() { return pitch; },
    set pitch(v) { pitch = clamp(v, CAMERA.pitchMin, CAMERA.pitchMax); },
    /** unit ground-plane direction the camera faces (for camera-relative movement) */
    forward,
    /** unit ground-plane right vector */
    right,
    /** unit view direction (with pitch) */
    look,
    get isFirstPerson() { return firstPerson; },
    get fov() { return fov; },
    /** actual arm length after collision (m) */
    get distance() { return firstPerson ? 0 : distance * clearance; },

    setFirstPerson(on) { firstPerson = !!on; },
    /** Forget smoothing state (after a teleport). */
    reset() { pivotY = null; clearance = 1; trauma = 0; },
    /** Shoulder offset in metres; negative x swaps to the left shoulder. */
    setShoulder(x, y = shoulderY) { shoulderX = x; shoulderY = y; },
    /** Additional FOV in degrees (zipline speed feel etc.). */
    setExtraFov(deg) { extraFov = deg; },

    /** Kick the camera: 0..1. A harness catch is ~0.85, a landing ~0.3. Decays by itself. */
    addShake(amount) { trauma = clamp(trauma + amount, 0, 1); },
    get shake() { return trauma; },
    /** Nerve-driven breathing sway in radians (js/player/nerves.js#cameraSway). */
    setBreathing(radians) { breathing = clamp(radians, 0, CAMERA.breathMax); },
    /** Sink the pivot – the camera drops with the climber into the harness. */
    setPivotOffset(metres) { pivotOffset = clamp(metres, -1, 1.5); },
    /** Accessibility switch (options screen, M1.7): no shake, no sway. */
    setReducedMotion(on) { reducedMotion = !!on; },

    /**
     * M4 co-op (js/player/coop-camera.js): follow `position` at exactly `distance` metres instead of the
     * normal single-player pivot/arm-length. Pass `null` to hand third-person framing back to the player
     * this controller actually belongs to (co-op disabled, or first person is active anyway).
     * @param {THREE.Vector3|null} position
     * @param {number} [distance] world metres – ignored when `position` is null
     */
    setFocusOverride(position, distance = CAMERA.distanceMin) {
      focusOverride = position ? { position, distance } : null;
    },
    get hasFocusOverride() { return !!focusOverride; },

    /**
     * Once per rendered frame, after the target's interpolated position is known.
     * @param {number} dt frame seconds
     * @param {THREE.Vector3} targetPos feet position of the character
     * @param {THREE.Vector3} [targetVel] velocity (m/s) – drives distance/FOV
     * @param {THREE.Vector3} [eyePos] world eye position for first person (falls back to eyeHeight)
     */
    update(dt, targetPos, targetVel = null, eyePos = null) {
      if (disposed) return;
      readInput();
      updateShake(dt);
      updateBasis();
      const speed = targetVel ? Math.hypot(targetVel.x, targetVel.z) : 0;
      const sprintMix = smoothstep(speed, PLAYER.walkSpeed * 1.15, PLAYER.sprintSpeed * 0.9);
      if (firstPerson) updateFirstPerson(targetPos, eyePos);
      else updateThirdPerson(dt, targetPos, sprintMix);
      updateFov(dt, sprintMix);
    },

    dispose() { disposed = true; },
  };
}
