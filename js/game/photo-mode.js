// Photo mode (ROADMAP M2b): `P` freezes the loop like Esc/options (no menu, though) and hands the
// camera to the player – a small free-fly spectator cam seeded at wherever the shoulder/first-person
// camera already was, so the cut in is not jarring. Mouse look re-uses `input.look` (already computed
// every frame regardless of pause – js/core/input.js's poll() runs in the input phase, which never
// stops), WASD dollies/strafes along the camera's own look direction, Q/E move it straight up/down.
// `js/main.js` owns the actual freeze (`loop.paused = true`) and the HUD hide (a body class, same idea
// as the course map's own `course-map-open`); this module only owns the camera and the snapshot.
import * as THREE from "three";
import { PHOTO } from "../config.js";

const HALF_PI = Math.PI / 2 - 0.001;

/**
 * @param {{ camera: THREE.PerspectiveCamera, input, renderer: THREE.WebGLRenderer, loop }} options
 *   `loop` (js/core/loop.js) is paused for the duration – exactly like js/ui/options.js's Esc screen,
 *   physics stops stepping and gameplay callbacks see `dt = 0` – so this module owns that toggle itself
 *   instead of making every caller remember to do it.
 * @returns {{ active: boolean, enter(): void, exit(): void, toggle(): void, update(frameDt: number): void,
 *   requestSnapshot(): void, dispose(): void }}
 */
export function createPhotoMode({ camera, input, renderer, loop }) {
  const pos = new THREE.Vector3();
  const forward = new THREE.Vector3(), right = new THREE.Vector3();
  let active = false;
  let yaw = 0, pitch = 0;
  let savedFov = camera.fov;
  let pendingSnapshot = false;

  function enter() {
    if (active) return;
    active = true;
    loop.paused = true;
    pos.copy(camera.position);
    savedFov = camera.fov;
    // Match the camera's *current* look direction exactly, so the cut into photo mode is invisible –
    // this codebase's own convention (js/player/camera.js#updateBasis): rotation.y = yaw + PI.
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    pitch = euler.x;
    yaw = euler.y - Math.PI;
    camera.fov = PHOTO.fov;
    camera.updateProjectionMatrix();
  }

  function exit() {
    if (!active) return;
    active = false;
    loop.paused = false;
    camera.fov = savedFov;
    camera.updateProjectionMatrix();
  }

  return {
    get active() { return active; },
    enter,
    exit,
    toggle() { if (active) exit(); else enter(); },

    /** Render phase, every frame while active – overwrites whatever js/player/camera.js just wrote. */
    update(frameDt) {
      if (!active) return;
      yaw -= input.look.x;
      pitch = Math.max(-HALF_PI, Math.min(HALF_PI, pitch - input.look.y));
      const cosPitch = Math.cos(pitch);
      forward.set(Math.sin(yaw) * cosPitch, Math.sin(pitch), Math.cos(yaw) * cosPitch);
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const speed = PHOTO.dollySpeed * (input.down("sprint") ? PHOTO.sprintScale : 1);
      pos.addScaledVector(forward, input.move.y * speed * frameDt);
      pos.addScaledVector(right, input.move.x * speed * frameDt);
      if (input.down("handL")) pos.y -= PHOTO.heightSpeed * frameDt;    // Q
      if (input.down("interact")) pos.y += PHOTO.heightSpeed * frameDt; // E
      camera.position.copy(pos);
      camera.rotation.set(pitch, yaw + Math.PI, 0);
    },

    /** Space, while active: the actual `toBlob` read happens after the *next* render (js/main.js), so
     *  the canvas holds the frame this camera move just produced, not the previous one. */
    requestSnapshot() { pendingSnapshot = true; },
    /** @returns {boolean} true once, the first time it is checked after `requestSnapshot()`. */
    consumeSnapshotRequest() {
      if (!pendingSnapshot) return false;
      pendingSnapshot = false;
      return true;
    },

    /** Saves the current canvas as a PNG – a local download the player triggered themselves. */
    takeSnapshot() {
      renderer.domElement.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `wipfel-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "image/png");
    },

    dispose() { if (active) exit(); },
  };
}
