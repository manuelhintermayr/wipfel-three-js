// Basic touch overlay (ROADMAP M2b): a left virtual stick (move), a right drag area (look) and three
// buttons (F clip, E interact, Space jump/push-off/brake) on pointer-coarse devices, or forced on with
// `?touch=1` for desktop testing. Feeds js/core/input.js's `setVirtualState`/`addVirtualLook` – every
// consumer (player movement, belay, the zip ride) reads the same actions/move a keyboard would produce,
// so nothing downstream needs to know a touch overlay exists at all.
//
// Deliberately basic (ROADMAP's own words): one stick, one look area, three buttons – no remapping, no
// haptics, no on-screen prompts of its own (the existing HUD prompt already names the action; this only
// gives a touch a way to *press* it). Full mobile UX (bigger tap targets tuned per device, a proper
// settings pass, gamepad-style deadzones) is future work – see docs/architecture.md's "Offen" list.
import { TOUCH } from "../config.js";

const BUTTONS = Object.freeze([
  { action: "clip", label: "F" },
  { action: "interact", label: "E" },
  { action: "jump", label: "⎵" },   // ⎵ – jump / push off / (classic zip) hold the brake
]);

/**
 * @param {{ root: HTMLElement, input }} options `root` is appended to directly (fixed-position overlay,
 *   independent of the `#hud`/`#overlay` layers so it survives photo mode/course-map's own body classes).
 * @returns {{ update(): void, dispose(): void }}
 */
export function createTouchControls({ root, input }) {
  const layer = el("div", "touch-controls");
  // Sizing lives in js/config.js (single source of truth); css/hud.css reads these as custom properties
  // instead of duplicating the numbers.
  layer.style.setProperty("--touch-stick-radius", `${TOUCH.stickRadius}px`);
  layer.style.setProperty("--touch-button-size", `${TOUCH.buttonSize}px`);

  const stickZone = el("div", "touch-stick-zone");
  const stickBase = el("div", "touch-stick-base");
  const stickKnob = el("div", "touch-stick-knob");
  stickBase.appendChild(stickKnob);
  stickZone.appendChild(stickBase);

  const lookZone = el("div", "touch-look-zone");

  const buttonRow = el("div", "touch-buttons");
  const buttons = new Map();
  for (const b of BUTTONS) {
    const button = el("button", "touch-btn", b.label);
    button.type = "button";
    buttonRow.appendChild(button);
    buttons.set(button, b.action);
  }

  layer.append(stickZone, lookZone, buttonRow);
  root.appendChild(layer);

  // --- state pushed into core/input.js once per update() -------------------------------------------
  const move = { x: 0, y: 0 };
  const held = new Set();

  // --- left stick: one active pointer, clamped to TOUCH.stickMaxDrag -------------------------------
  let stickPointerId = null;
  let stickCentre = { x: 0, y: 0 };

  function stickFrom(evt) {
    const dx = evt.clientX - stickCentre.x, dz = evt.clientY - stickCentre.y;
    const dist = Math.hypot(dx, dz);
    const clamped = Math.min(dist, TOUCH.stickMaxDrag);
    const nx = dist > 0.001 ? dx / dist : 0, nz = dist > 0.001 ? dz / dist : 0;
    move.x = nx * (clamped / TOUCH.stickMaxDrag);
    move.y = -nz * (clamped / TOUCH.stickMaxDrag);   // screen +y is down; forward is -y
    stickKnob.style.transform = `translate(${nx * clamped}px, ${nz * clamped}px)`;
  }

  function stickReset() {
    stickPointerId = null;
    move.x = 0; move.y = 0;
    stickKnob.style.transform = "translate(0, 0)";
  }

  stickZone.addEventListener("pointerdown", (evt) => {
    stickPointerId = evt.pointerId;
    const rect = stickBase.getBoundingClientRect();
    stickCentre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    stickFrom(evt);
    stickZone.setPointerCapture(evt.pointerId);
  });
  stickZone.addEventListener("pointermove", (evt) => { if (evt.pointerId === stickPointerId) stickFrom(evt); });
  stickZone.addEventListener("pointerup", (evt) => { if (evt.pointerId === stickPointerId) stickReset(); });
  stickZone.addEventListener("pointercancel", (evt) => { if (evt.pointerId === stickPointerId) stickReset(); });

  // --- right drag area: look delta, forwarded straight into input.addVirtualLook -------------------
  let lookPointerId = null;
  let lastLook = { x: 0, y: 0 };

  lookZone.addEventListener("pointerdown", (evt) => {
    lookPointerId = evt.pointerId;
    lastLook = { x: evt.clientX, y: evt.clientY };
    lookZone.setPointerCapture(evt.pointerId);
  });
  lookZone.addEventListener("pointermove", (evt) => {
    if (evt.pointerId !== lookPointerId) return;
    input.addVirtualLook((evt.clientX - lastLook.x) * TOUCH.lookSensitivity, (evt.clientY - lastLook.y) * TOUCH.lookSensitivity);
    lastLook = { x: evt.clientX, y: evt.clientY };
  });
  lookZone.addEventListener("pointerup", (evt) => { if (evt.pointerId === lookPointerId) lookPointerId = null; });
  lookZone.addEventListener("pointercancel", (evt) => { if (evt.pointerId === lookPointerId) lookPointerId = null; });

  // --- three buttons: held while a finger is down ----------------------------------------------------
  const buttonOffs = [];
  for (const [button, action] of buttons) {
    const down = (evt) => { held.add(action); button.classList.add("down"); evt.preventDefault(); };
    const up = () => { held.delete(action); button.classList.remove("down"); };
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("pointerleave", up);
    buttonOffs.push(() => {
      button.removeEventListener("pointerdown", down);
      button.removeEventListener("pointerup", up);
      button.removeEventListener("pointercancel", up);
      button.removeEventListener("pointerleave", up);
    });
  }

  return {
    /** Input phase, once per frame: pushes the overlay's current state into core/input.js. */
    update() { input.setVirtualState(held, move); },
    dispose() {
      for (const off of buttonOffs) off();
      layer.remove();
    },
  };
}

/** @returns {boolean} true on a touch-primary device (`matchMedia`), independent of screen size. */
export function isTouchDevice() {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

function el(tag, className, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
