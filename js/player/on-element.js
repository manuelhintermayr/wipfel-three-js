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

const TWO_PI = Math.PI * 2;
const wrapAngle = (a) => a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampSigned = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);

/**
 * @param {{ input, events?, balance, stamina, nerves, rng?, camera? }} options
 *   `balance`, `stamina` and `nerves` are the pure logic modules; this state only feeds them.
 * @returns {object} a state for the player's state machine – register it with `player.addState("element", …)`
 */
export function createElementState({ input, events = null, balance, stamina, nerves, rng = null, camera = null }) {
  const point = new THREE.Vector3(), tangent = new THREE.Vector3(), side = new THREE.Vector3();
  let element = null;
  let t = 0, railSpeed = 0, stepPhase = 0;
  let handL = 0, handR = 0;              // smoothed 0..1 per hand, for the pose
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

  /** Each footfall kicks the element; a plank that has swung away kicks back much harder. */
  function stepImpulse(dt, drive) {
    const before = stepPhase;
    stepPhase += Math.abs(railSpeed) * dt / ELEMENT_MOVE.stepLength;
    if (Math.floor(stepPhase) === Math.floor(before)) return 0;
    const foot = Math.floor(stepPhase) % 2 === 0 ? 1 : -1;
    const hurry = Math.abs(railSpeed) / Math.max(0.1, element.walkSpeed);
    element.wobble.excite(foot * ELEMENT_MOVE.stepExcite * (0.4 + hurry));
    const hold = element.footholdAt(t);
    if (hold.discrete && element.stepOn) element.stepOn(hold.index, 0.6 + 0.6 * hurry, drive >= 0 ? 1 : -1);
    // stepping onto something that is not where it should be is what throws you
    return (1 - clamp01(hold.ready)) * (0.8 + hurry) * foot;
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
      lastFoothold = -1;
      balance.reset(0);
      element.occupancy.active = true;
      element.occupancy.t = t;
      player.velocity.set(0, 0, 0);
      place(player, 0);
      if (events) events.emit("player:element-enter", { element: element.id, kind: element.kind, from: data && data.fromEnd });
    },

    exit(player) {
      if (element) element.occupancy.active = false;
      player.velocity.set(0, 0, 0);
      element = null;
    },

    update(player, dt) {
      if (!element) return "ground";
      const frozen = nerves.frozen;
      const breathing = input.down("breathe");
      const hands = readHands(dt);

      // --- travel along the rail ----------------------------------------------------------------
      const drive = frozen || breathing ? 0 : clampSigned(input.move.y);
      const nerveSpeed = 1 - 0.55 * nerves.value;
      const wanted = drive * element.walkSpeed * nerveSpeed * (1 - 0.25 * hands);
      const previous = railSpeed;
      railSpeed += (wanted - railSpeed) * Math.min(1, ELEMENT_MOVE.accel * dt);
      t = clamp01(t + railSpeed * dt / element.length);
      element.occupancy.t = t;

      // --- what the element does about it -------------------------------------------------------
      const lean = frozen ? 0 : clampSigned(input.move.x);
      const misStep = stepImpulse(dt, drive);
      element.wobble.excite(lean * ELEMENT_MOVE.leanExcite * dt
        + (railSpeed - previous) * ELEMENT_MOVE.hurryExcite * Math.sign(lean || 1) * 0.5);

      noisePhase += dt * (3.1 + 7.0 * nerves.value);
      const tremor = nerves.tremor * Math.sin(noisePhase);
      const drivenBy = element.wobble.lateralVelocity * 2.2 + misStep * 2.6;
      const result = balance.update(dt, {
        lean, hands, drive: drivenBy, noise: tremor,
        speed: Math.abs(railSpeed) / Math.max(0.1, element.walkSpeed),
        slipAngle: element.slipAngle,
      });

      // --- resources ----------------------------------------------------------------------------
      stamina.update(dt, {
        onElement: true, hands, moving: Math.abs(railSpeed) > 0.05,
        extraDrain: element.staminaDrain,
      });
      const groundY = element.groundY == null ? player.position.y - 6 : element.groundY;
      nerves.update(dt, {
        height: player.position.y - groundY,
        exposure: element.handHold.available ? (hands > 0 ? 0 : 0.55) : 1,
        wobble: element.wobble.amplitude,
        lookDown: camera ? clamp01(-camera.pitch / 0.9) : 0,
        handContact: hands,
        onElement: true,
        breathing: breathing && Math.abs(railSpeed) < 0.05,
      });

      place(player, dt);
      updatePose(result.angle, breathing, frozen);

      if (result.slipped) {
        if (events) events.emit("player:slip", { element: element.id, t, angle: result.angle });
        return { state: "fall", data: { element, t, angle: result.angle } };
      }
      if (t >= 1 - ELEMENT_MOVE.exitMargin && drive > 0) return stepOff(player, "exit");
      if (t <= ELEMENT_MOVE.exitMargin && drive < 0) return stepOff(player, "entry");
      return undefined;
    },
  };

  /** Put the body on the rail, leaning with the pendulum, facing the way it runs. */
  function place(player, dt) {
    element.pointAt(t, point);
    element.tangentAt(t, tangent);
    side.set(-tangent.z, 0, tangent.x).normalize();
    const lean = balance.angle / Math.max(1e-3, element.slipAngle) * ELEMENT_MOVE.leanOffset;
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
