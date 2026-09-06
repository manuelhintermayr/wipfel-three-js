// State "tarzan": the Tarzan swing (`js/elements/tarzan.js`). Not a rail walk – there is nothing to
// walk on – so it is its own small state with three phases: `wait` at the edge for the rope to swing
// back within reach, `swing` (automatic: the body just follows `element.rope`, the same deterministic
// clock the geometry animates from) and `climb` (W lifts the climber from the net onto the platform).
//
// A jump outside the ±0.25 s catch window is not a failure state of its own – it simply hands off to
// the existing `fall` state on this element's safety cable, exactly like a slip anywhere else.
import * as THREE from "three";
import { elementPose, fallPose, ladderPose } from "./rig-poses.js";
import { t } from "../core/i18n.js";

export const TARZAN_MOVE = Object.freeze({
  climbSeconds: 1.1,          // seconds of held W to climb from the net onto the platform
  climbPhaseRate: 6.0,
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * @param {{ input, events?, nerves, stamina, sky? }} options `sky` (optional, M2b) reads `sky.night`
 *   into the nerves' night terms.
 * @returns {object} a state for the player's state machine – register it as "tarzan".
 */
export function createTarzanState({ input, events = null, nerves, stamina, sky = null }) {
  const netPoint = new THREE.Vector3(), exitPoint = new THREE.Vector3(), pos = new THREE.Vector3();
  let element = null;
  let phase = "wait";                 // "wait" | "swing" | "climb"
  let grabElapsed = 0, climbProgress = 0, climbPhase = 0;
  let wasJumpDown = false;

  /** Edge-detect Space ourselves via `.down()` – `.pressed()` can miss its edge on a frame with no
   *  fixed physics step (documented in docs/architecture.md), which a one-shot jump attempt cannot afford. */
  function jumpPressed() {
    const down = input.down("jump");
    const edge = down && !wasJumpDown;
    wasJumpDown = down;
    return edge;
  }

  function faceExit(player) { player.setHeading(Math.atan2(element.frame.axis.x, element.frame.axis.z)); }

  function attemptJump() {
    const rope = element.rope;
    const m = ((rope.elapsed - (0.75 * rope.period)) % rope.period + rope.period) % rope.period;
    const distanceToWindow = Math.min(m, rope.period - m);
    if (distanceToWindow > rope.window) return false;
    grabElapsed = rope.elapsed;
    phase = "swing";
    return true;
  }

  const state = {
    ownsMovement: true,
    blendRate: 9,
    get element() { return element; },
    get phase() { return phase; },
    get prompt() {
      if (phase === "wait") return t("prompt.tarzanJump");
      if (phase === "climb") return t("prompt.tarzanClimb");
      return null;                                      // mid-swing: nothing to press
    },
    pose(out) {
      if (phase === "climb") return ladderPose(out, climbPhase);
      if (phase === "swing") return fallPose(out, { swing: element ? element.rope.angle : 0 });
      return elementPose(out, {});
    },

    enter(player, data) {
      element = (data && data.element) || null;
      if (!element) return;
      phase = "wait";
      grabElapsed = 0; climbProgress = 0; climbPhase = 0; wasJumpDown = false;
      nerves.shock(0.05);
      element.occupancy.active = true;
      element.occupancy.t = 0;
      player.velocity.set(0, 0, 0);
      element.pointAt(0, pos);
      player.moveTo(pos.x, pos.y, pos.z);
      faceExit(player);
      if (events) events.emit("player:element-enter", { element: element.id, kind: element.kind, from: "entry" });
    },

    exit(player) {
      if (element) element.occupancy.active = false;
      player.velocity.set(0, 0, 0);
      element = null;
    },

    update(player, dt) {
      if (!element) return "ground";
      const groundY = element.groundY == null ? player.position.y - 6 : element.groundY;
      nerves.update(dt, {
        height: player.position.y - groundY, exposure: 1, wobble: phase === "swing" ? 0.6 : 0.1,
        onElement: true, breathing: false, night: sky ? sky.night : 0,
      });
      stamina.update(dt, { onElement: true, moving: phase !== "wait" });

      if (phase === "wait") {
        element.pointAt(0, pos);
        player.moveTo(pos.x, pos.y, pos.z);
        if (jumpPressed()) {
          if (!attemptJump()) {
            if (events) events.emit("player:slip", { element: element.id, t: 0.5, angle: 0 });
            return { state: "fall", data: { element, t: 0.5, angle: 0 } };
          }
        }
        return undefined;
      }

      if (phase === "swing") {
        const rope = element.rope;
        element.rope.tipAt(rope.angle, pos);
        player.moveTo(pos.x, pos.y, pos.z);
        element.occupancy.t = clamp01(0.5 + (rope.angle / rope.amplitude) * 0.5);
        if (rope.elapsed >= grabElapsed + rope.period / 2) {
          element.rope.tipAt(rope.amplitude, netPoint);        // the far extreme = the net
          const exit = element.getExitAnchor();
          exitPoint.copy(exit.stand);
          phase = "climb";
          climbProgress = 0;
        }
        return undefined;
      }

      // --- climb: net → platform, W held --------------------------------------------------------
      const drive = Math.max(0, input.move.y);
      climbProgress = clamp01(climbProgress + (drive > 0.05 ? drive : 0.3) * dt / TARZAN_MOVE.climbSeconds);
      climbPhase += dt * TARZAN_MOVE.climbPhaseRate;
      pos.lerpVectors(netPoint, exitPoint, climbProgress);
      player.moveTo(pos.x, pos.y, pos.z);
      element.occupancy.t = 1;
      if (climbProgress >= 1) return finish(player);
      return undefined;
    },
  };

  function finish(player) {
    const anchor = element.getExitAnchor();
    nerves.completeElement();
    if (events) {
      events.emit("player:element-exit", { element: element.id, kind: element.kind, end: "exit", completed: true, platform: anchor.platformId });
    }
    player.teleport(anchor.stand.x, anchor.stand.y, anchor.stand.z);
    return "ground";
  }

  return state;
}
