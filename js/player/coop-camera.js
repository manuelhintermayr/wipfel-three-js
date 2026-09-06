// Shared camera frame for local co-op (ROADMAP M4, GDD §3.11; ADR-030 "dynamic shared frame – no
// splitscreen"). Pure maths: given both climbers' positions and locomotion modes, decide where the one
// shared third-person camera should look and how far back it should stand. js/game/coop.js calls
// `computeCoopFrame` once a frame and hands the result straight to player 1's own camera controller
// (js/player/camera.js#setFocusOverride) – this module never touches THREE, physics or the DOM, so it
// is unit-testable exactly like js/game/flow.js.
//
// The idea: whoever is doing the harder thing right now (crossing an element, riding the zip, hanging
// in the harness) pulls the frame towards them – "frame the climber, companion visible when possible" –
// while the distance always grows with how far apart the two of them actually are, clamped to
// `COOP.camera.distanceMin/Max`. Separation itself is kept in check by the leash (js/game/coop.js), not
// by this module – past a point, more separation just means a wider, more compromised shot, exactly as
// honest as the milestone brief asks for.
import { COOP } from "../config.js";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * @param {string} mode a player's `player.mode` ("ground", "ladder", "element", "fall", "zipline", "tarzan")
 * @returns {number} 0..1 – how much this player's position should pull the shared frame towards them
 */
export function activityWeight(mode) {
  const w = COOP.camera.activityWeight[mode];
  return w == null ? COOP.camera.activityWeight.ground : w;
}

/**
 * @param {{ position: {x,y,z}, mode: string }} p1
 * @param {{ position: {x,y,z}, mode: string }} p2
 * @returns {{ position: {x,y,z}, distance: number, separation: number, weightP2: number }}
 *   `position`/`distance` are exactly what js/player/camera.js#setFocusOverride expects.
 */
export function computeCoopFrame(p1, p2) {
  const dx = p2.position.x - p1.position.x, dy = p2.position.y - p1.position.y, dz = p2.position.z - p1.position.z;
  const separation = Math.hypot(dx, dy, dz);
  const w1 = activityWeight(p1.mode) + 0.001;   // +epsilon: a perfect tie still favours player 1 a hair
  const w2 = activityWeight(p2.mode);
  const t = w2 / (w1 + w2);
  const C = COOP.camera;
  return {
    position: { x: p1.position.x + dx * t, y: p1.position.y + dy * t, z: p1.position.z + dz * t },
    distance: clamp(C.distanceBase + separation * C.distanceGain, C.distanceMin, C.distanceMax),
    separation,
    weightP2: t,
  };
}
