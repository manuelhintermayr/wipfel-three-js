// Rail locomotion on a block ladder. The character controller is switched off while this state is
// active (`ownsMovement`) and the body is driven kinematically along `ladder.rail`: W climbs, S goes
// back down, and reaching either end drops the player back into the normal ground state – on the
// platform at the top, on the entry deck at the bottom.
import * as THREE from "three";

export const LADDER_MOVE = Object.freeze({
  speed: 0.9,                // metres per second along the rail
  phaseRate: 5.2,            // pose cycle radians per metre climbed
  turnRate: 9,               // 1/s – how fast the climber turns to face the trunk
});

const TWO_PI = Math.PI * 2;
const wrapAngle = (a) => a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampSigned = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);

/**
 * @param {{ input: { move: {x:number,y:number} }, events?: { emit(name, payload): void } }} options
 * @returns {object} a state for the player's state machine – register it as "ladder".
 *   The state exposes `phase` (radians) so the rig can animate the climb, and `progress` (0..1).
 */
export function createLadderState({ input, events = null }) {
  const start = new THREE.Vector3(), end = new THREE.Vector3(), axis = new THREE.Vector3();
  const point = new THREE.Vector3();
  let ladder = null, length = 1, t = 0, facing = 0;

  const place = (player) => {
    point.copy(start).addScaledVector(axis, t * length);
    player.moveTo(point.x, point.y, point.z);
  };

  const state = {
    /** Tells the controller to leave the Rapier character controller alone this step. */
    ownsMovement: true,
    phase: 0,
    get progress() { return t; },
    get ladder() { return ladder; },

    enter(player, data) {
      ladder = (data && data.ladder) || null;
      if (!ladder) return;
      start.copy(ladder.rail.start);
      end.copy(ladder.rail.end);
      axis.subVectors(end, start);
      length = Math.max(0.001, axis.length());
      axis.divideScalar(length);
      t = clamp01(point.subVectors(player.position, start).dot(axis) / length);
      facing = wrapAngle(ladder.side + Math.PI);              // look at the trunk, not away from it
      state.phase = 0;
      player.velocity.set(0, 0, 0);
      place(player);
      if (events) events.emit("player:ladder-enter", { ladder, progress: t });
    },

    exit(player) {
      player.velocity.set(0, 0, 0);
      if (events) events.emit("player:ladder-exit", { ladder, progress: t });
      ladder = null;
    },

    update(player, dt) {
      if (!ladder) return "ground";
      const drive = clampSigned(input.move.y);
      const step = drive * LADDER_MOVE.speed * dt;
      const before = t;
      t = clamp01(t + step / length);
      state.phase += Math.abs(t - before) * length * LADDER_MOVE.phaseRate;
      place(player);
      player.setHeading(player.heading + wrapAngle(facing - player.heading) * (1 - Math.exp(-LADDER_MOVE.turnRate * dt)));
      if (t >= 1 && drive >= 0) return "ground";              // step off onto the platform
      if (t <= 0 && drive < 0) return "ground";               // back down onto the entry deck
      return undefined;
    },
  };
  return state;
}
