// Builder mode's top-down orbit camera (M3a, GDD §4 "Vogelperspektive"): pan with WASD or a mouse
// drag, zoom with the wheel, rotate with Q/E – no player control, no collision, just an orbit around a
// ground-plane focus point at a fixed, steep pitch. Reuses the shared `Input`'s already-composed
// `move` vector (keyboard+gamepad+touch, exactly what js/player/controller.js reads) for WASD, but adds
// its own raw pointer/wheel listeners for drag-pan and zoom – those need a free cursor over the canvas,
// which this mode has and gameplay never does (js/main.js only requests pointer lock outside builder).
import * as THREE from "three";

export const BUILDER_CAMERA = Object.freeze({
  zoomMin: 16, zoomMax: 160,
  zoomWheelScale: 0.0011,     // exponential: distance *= exp(deltaY * this)
  pitchDeg: 58,               // fixed angle below horizontal – "top-down", not straight-down (reads the park)
  panSpeedAt10m: 9,           // m/s of focus movement at zoom distance 10 m, scales linearly with zoom
  rotateSpeed: 1.5,           // rad/s while Q or E is held
  dragPanScale: 0.0017,       // world metres per CSS pixel of drag, × current zoom distance
});

/**
 * @param {{ camera: THREE.PerspectiveCamera, input: import("../core/input.js").Input,
 *   dom: HTMLElement, terrain?: { heightAt(x:number,z:number): number } }} options
 * @returns {{ active: boolean, enter(focus?: {x,z}): void, exit(): void, focusOn(x,z): void,
 *   update(dt: number): void, dispose(): void }}
 */
export function createBuilderCamera({ camera, input, dom, terrain = null }) {
  const C = BUILDER_CAMERA;
  const pitchRad = (C.pitchDeg * Math.PI) / 180;
  const focus = new THREE.Vector3();
  let distance = 55;
  let yaw = 0;
  let active = false;
  let dragging = false;
  let lastX = 0, lastY = 0;

  const groundY = (x, z) => (terrain ? terrain.heightAt(x, z) : 0);

  function onPointerDown(e) {
    if (!active || e.button !== 0) return;
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
  }
  function onPointerMove(e) {
    if (!active || !dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    pan(-dx, -dy, distance * C.dragPanScale);
  }
  function onPointerUp() { dragging = false; }
  function onWheel(e) {
    if (!active) return;
    e.preventDefault();
    distance = clamp(distance * Math.exp(e.deltaY * C.zoomWheelScale), C.zoomMin, C.zoomMax);
  }
  dom.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  dom.addEventListener("wheel", onWheel, { passive: false });

  /** Move `focus` by (right, forward) ground-plane units (in the camera's own yaw), scaled by `unit`. */
  function pan(rightAmount, forwardAmount, unit) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);   // forward: camera → focus, ground-projected
    const rx = -fz, rz = fx;                          // right: forward rotated -90° around +Y
    focus.x += (rx * rightAmount + fx * forwardAmount) * unit;
    focus.z += (rz * rightAmount + fz * forwardAmount) * unit;
  }

  function place() {
    const horiz = distance * Math.cos(pitchRad), vert = distance * Math.sin(pitchRad);
    const focusY = groundY(focus.x, focus.z);
    camera.position.set(focus.x + Math.sin(yaw) * horiz, focusY + vert, focus.z + Math.cos(yaw) * horiz);
    camera.lookAt(focus.x, focusY, focus.z);
  }

  return {
    get active() { return active; },
    /** `centre` (optional, world x/z): where the camera starts looking – usually the selected route. */
    enter(centre = null) {
      active = true;
      if (centre) focus.set(centre.x, 0, centre.z);
      place();
    },
    exit() { active = false; dragging = false; },
    focusOn(x, z) { focus.set(x, 0, z); place(); },

    update(dt) {
      if (!active) return;
      const speed = C.panSpeedAt10m * (distance / 10);
      pan(input.move.x, input.move.y, speed * dt);
      if (input.down("handL")) yaw -= C.rotateSpeed * dt;      // Q
      if (input.down("interact")) yaw += C.rotateSpeed * dt;   // E
      place();
    },

    dispose() {
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("wheel", onWheel);
    },
  };
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
