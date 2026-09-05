// State "element": the climber is on an exercise. This is the heart of the game (GDD §3.4 –
// "Übungen sind Schienen"): the body is locked to the element's rail, forward/back is `move.y`,
// sideways is not a step but a *lean* against the balance pendulum, and Q / right mouse put a hand
// on the hand cable, which steadies everything and burns strength.
//
// Every step shakes the element; hurrying shakes it more; the element shakes back into the
// pendulum. When the pendulum runs past the element's slip angle the state hands over to "fall".
//
// The controller leaves the character controller alone here (`ownsMovement`) and the state drives
// the body with `player.moveTo` / `player.setHeading`.

import * as THREE from "three";
import { ELEMENT_MOVE } from "./tuning.js";
import { elementPose } from "./rig-poses.js";
import { lookDownAmount } from "./vitals.js";
import { assistScale } from "./assist.js";
import { sidegradeEffects } from "./sidegrade.js";

const TWO_PI = Math.PI * 2;
const wrapAngle = (a) => a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampSigned = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);

/**
 * @param {{ input, events?, balance, stamina, nerves, rng?, camera?, sky? }} options
 *   `balance`, `stamina` and `nerves` are the pure logic modules; this state only feeds them. `sky`
 *   (optional, M2b) reads `sky.night` into the nerves' night terms.
 * @returns {object} a state for the player's state machine – register it with `player.addState("element", …)`
 */
export function createElementState({ input, events = null, balance, stamina, nerves, rng = null, camera = null, sky = null }) {
  const point = new THREE.Vector3(), tangent = new THREE.Vector3(), side = new THREE.Vector3();
  let element = null;
  let t = 0, railSpeed = 0, stepPhase = 0;
  let handL = 0, handR = 0;              // smoothed 0..1 per hand, for the pose
  let stepIndex = 0, stepTimer = 0;      // discrete elements: which plank, and the swing wait
  let noisePhase = rng ? rng.float(0, TWO_PI) : 0;
  const params = { angle: 0, phase: 0, speed: 0, elevation: 0, handL: 0, handR: 0, breath: 0, freeze: 0 };

  /** Hands may only grip what the element offers, and only while there is strength left. */
  function readHands(dt) {
    const hold = element.handHold;
    const allowed = hold.available && stamina.canGrip;
    const wantL = allowed && input.down("handL") ? 1 : 0;
    const wantR = allowed && input.down("handR") ? 1 : 0;
    const rate = Math.min(1, 12 * dt);
    handL += (wantL - handL) * rate;
    handR += (wantR - handR) * rate;
    return wantL + wantR;
  }

  /** Assist mode (M1.7) and the "light shoes" sidegrade (M2a) both scale the climber's own wobble
   *  excitation the same way – neither touches BALANCE.topple/slipAngle itself, only what feeds it. */
  function disturbanceScale() { return assistScale().disturbance * sidegradeEffects().balanceDisturbanceScale; }

  /** Each footfall kicks the element; a plank that has swung away kicks back much harder. */
  function stepImpulse(dt, drive) {
    const before = stepPhase;
    stepPhase += Math.abs(railSpeed) * dt / ELEMENT_MOVE.stepLength;
    if (Math.floor(stepPhase) === Math.floor(before)) return 0;
    const foot = Math.floor(stepPhase) % 2 === 0 ? 1 : -1;
    const hurry = Math.abs(railSpeed) / Math.max(0.1, element.walkSpeed);
    element.wobble.excite(foot * ELEMENT_MOVE.stepExcite * (0.4 + hurry) * disturbanceScale());
    const hold = element.footholdAt(t);
    if (hold.discrete && element.stepOn) element.stepOn(hold.index, 0.6 + 0.6 * hurry, drive >= 0 ? 1 : -1);
    // stepping onto something that is not where it should be is what throws you
    return (1 - clamp01(hold.ready)) * (0.8 + hurry) * foot;
  }

  /**
   * Continuous rails (wire bridge, cargo net): the stick drives a speed along the rail. A element may
   * publish its own `railAccel` (skate: a shove takes a moment to build up and coasts afterwards)
   * instead of the shared rate – every element that does not is unaffected.
   */
  function walk(dt, drive, hands) {
    const wanted = drive * element.walkSpeed
      * (1 - ELEMENT_MOVE.nervePenalty * nerves.value)
      * (1 - ELEMENT_MOVE.handSlow * hands);
    const accel = element.railAccel || ELEMENT_MOVE.accel;
    railSpeed += (wanted - railSpeed) * Math.min(1, accel * dt);
    t = clamp01(t + railSpeed * dt / element.length);
    return stepImpulse(dt, drive);
  }

  /** The step row a discrete element crosses – `element.steps` (stirrups, rings, …) or the older `element.planks`. */
  function stepRow() { return element.steps || element.planks || []; }

  /** Where the body wants to be: over step `stepIndex`, wherever that step has swung to. */
  function plankTarget() {
    const steps = stepRow();
    if (stepIndex < 0) return 0;
    if (stepIndex >= steps.length) return 1;
    const step = steps[stepIndex];
    return clamp01((step.x + step.offset) / element.length);
  }

  /**
   * One press of W = one step. Stepping past either end walks off onto the platform, and a step
   * that has swung out from under the foot goes straight into the balance pendulum.
   */
  function stride(direction) {
    const steps = stepRow();
    stepTimer = ELEMENT_MOVE.stepWait;
    stepIndex += direction;
    stepPhase += 1;
    if (stepIndex < 0 || stepIndex >= steps.length) return 0;
    const step = steps[stepIndex];
    const hold = element.footholdAt((step.x + step.offset) / element.length);
    element.stepOn(stepIndex, 1, direction);
    element.wobble.excite(direction * ELEMENT_MOVE.stepExcite * 0.5 * disturbanceScale());
    return (1 - clamp01(hold.ready)) * ELEMENT_MOVE.missStepKick * (stepIndex % 2 === 0 ? 1 : -1);
  }

  /** +1 / −1 once a discrete step went past the last / first one, 0 while still on the element. */
  function pastEnd() {
    const steps = stepRow();
    return stepIndex < 0 ? -1 : stepIndex >= steps.length ? 1 : 0;
  }

  /** Discrete elements (hanging planks): step, wait for the swing, step again. */
  function stepAcross(dt, blocked) {
    stepTimer = Math.max(0, stepTimer - dt);
    let kick = 0;
    if (!blocked && stepTimer <= 0) {
      const wanted = (input.pressed("moveUp") ? 1 : 0) - (input.pressed("moveDown") ? 1 : 0);
      if (wanted) kick = stride(wanted);
    }
    const before = t;
    t += (plankTarget() - t) * Math.min(1, ELEMENT_MOVE.stepGlide * dt);
    railSpeed = dt > 0 ? (t - before) * element.length / dt : 0;
    return kick;
  }

  const state = {
    ownsMovement: true,
    blendRate: 7,
    get element() { return element; },
    get progress() { return t; },
    get railSpeed() { return railSpeed; },
    get hands() { return handL + handR; },
    /** Rig overlay – one composite pose, see rig-poses.js#elementPose. */
    pose(out) { return elementPose(out, params); },

    enter(player, data) {
      element = (data && data.element) || null;
      if (!element) return;
      // `t` is set after a pull-up (back on the rail where you left it), the end otherwise
      t = data.t != null ? clamp01(data.t) : (data.fromEnd === "exit" ? 1 : 0);
      railSpeed = 0;
      stepPhase = 0;
      handL = handR = 0;
      stepIndex = element.discrete ? element.footholdAt(t).index : 0;
      stepTimer = 0;
      balance.reset(0);
      element.occupancy.active = true;
      element.occupancy.t = t;
      player.velocity.set(0, 0, 0);
      if (camera) camera.setPivotOffset(-ELEMENT_MOVE.cameraLift);
      place(player, 0);
      if (events) events.emit("player:element-enter", { element: element.id, kind: element.kind, from: data && data.fromEnd });
    },

    exit(player) {
      if (element) element.occupancy.active = false;
      if (camera) camera.setPivotOffset(0);
      player.velocity.set(0, 0, 0);
      element = null;
    },

    update(player, dt) {
      if (!element) return "ground";
      const frozen = nerves.frozen;
      const breathing = input.down("breathe");
      const hands = readHands(dt);
      const assist = assistScale();   // options screen "Assist mode" (M1.7) – 1/1 when off

      // --- travel along the rail ----------------------------------------------------------------
      const blocked = frozen || breathing;
      const drive = blocked ? 0 : clampSigned(input.move.y);
      const previous = railSpeed;
      const misStep = element.discrete ? stepAcross(dt, blocked) : walk(dt, drive, hands);
      element.occupancy.t = t;

      // --- what the element does about it -------------------------------------------------------
      const gear = sidegradeEffects();   // M2a equipment (kassa "Equipment" row) – neutral (all 1) when none equipped
      const lean = frozen ? 0 : clampSigned(input.move.x);
      element.wobble.excite((lean * ELEMENT_MOVE.leanExcite * dt
        + (railSpeed - previous) * ELEMENT_MOVE.hurryExcite * Math.sign(lean || 1) * 0.5) * assist.disturbance * gear.balanceDisturbanceScale);

      noisePhase += dt * (3.1 + 7.0 * nerves.value);
      const tremor = nerves.tremor * Math.sin(noisePhase);
      const drivenBy = element.wobble.lateralVelocity * ELEMENT_MOVE.wobbleDrive + misStep * 2.6 * assist.disturbance * gear.balanceDisturbanceScale;
      const result = balance.update(dt, {
        lean, hands, drive: drivenBy, noise: tremor,
        speed: Math.abs(railSpeed) / Math.max(0.1, element.walkSpeed),
        slipAngle: element.slipAngle * assist.slipWindow,
      });

      // --- resources ----------------------------------------------------------------------------
      stamina.update(dt, {
        onElement: true, hands, moving: Math.abs(railSpeed) > 0.05,
        extraDrain: element.staminaDrain, gripDrainScale: gear.gripDrainScale,
      });
      const groundY = element.groundY == null ? player.position.y - 6 : element.groundY;
      nerves.update(dt, {
        height: player.position.y - groundY,
        exposure: element.handHold.available ? (hands > 0 ? 0 : 0.55) : 1,
        wobble: element.wobble.amplitude,
        lookDown: lookDownAmount(camera),
        handContact: hands,
        onElement: true,
        breathing: breathing && Math.abs(railSpeed) < 0.05,
        night: sky ? sky.night : 0,
      });

      place(player, dt);
      updatePose(result.angle, breathing, frozen);

      if (result.slipped) {
        if (events) events.emit("player:slip", { element: element.id, t, angle: result.angle });
        return { state: "fall", data: { element, t, angle: result.angle } };
      }
      const leaving = element.discrete ? pastEnd() : drive;
      if (t >= 1 - ELEMENT_MOVE.exitMargin && leaving > 0) return stepOff(player, "exit");
      if (t <= ELEMENT_MOVE.exitMargin && leaving < 0) return stepOff(player, "entry");
      return undefined;
    },
  };

  /** Put the body on the rail, leaning with the pendulum, facing the way it runs. */
  function place(player, dt) {
    element.pointAt(t, point);
    element.tangentAt(t, tangent);
    side.set(-tangent.z, 0, tangent.x).normalize();
    // Divide by the same effective slip angle balance.update() was given (assist widens it) – otherwise
    // the visual lean would overshoot leanOffset once the pendulum is allowed past the raw slipAngle.
    const lean = balance.angle / Math.max(1e-3, element.slipAngle * assistScale().slipWindow) * ELEMENT_MOVE.leanOffset;
    player.moveTo(point.x - side.x * lean, point.y, point.z - side.z * lean);
    const yaw = Math.atan2(tangent.x, tangent.z);      // always facing the far platform
    player.setHeading(dt > 0
      ? player.heading + wrapAngle(yaw - player.heading) * (1 - Math.exp(-ELEMENT_MOVE.turnRate * dt))
      : yaw);
  }

  function updatePose(angle, breathing, frozen) {
    params.angle = angle;
    params.phase = stepPhase * Math.PI;
    params.speed = Math.min(1, Math.abs(railSpeed) / Math.max(0.1, element.walkSpeed));
    params.elevation = clamp01((element.handHold.heightAboveFoot - 1.35) / 0.55);
    params.handL = handL;
    params.handR = handR;
    params.breath = breathing ? 1 : 0;
    params.freeze = frozen ? 1 : 0;
  }

  /** Step off onto the platform at that end and hand control back to the ground state. */
  function stepOff(player, end) {
    const anchor = end === "exit" ? element.getExitAnchor() : element.getEntryAnchor();
    const finished = end === "exit";
    if (finished) nerves.completeElement();
    if (events) {
      events.emit("player:element-exit", { element: element.id, kind: element.kind, end, completed: finished, platform: anchor.platformId });
    }
    player.teleport(anchor.stand.x, anchor.stand.y, anchor.stand.z);
    return "ground";
  }

  return state;
}
