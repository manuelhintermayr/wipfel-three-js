// Read-only keybinding list for the options screen's "Controls" section (ROADMAP M1.7: "Tastenbelegung
// vorbereitet" – remapping itself is a later step; this just reflects `core/input.js#bindings` so the
// list is never out of sync with what actually fires). Debug-only actions (`debug`, `physdebug`) are
// left out on purpose – CLAUDE.md "Debug-UI vom Produkt-UI trennbar".
import { t } from "../core/i18n.js";

/** Order to display in, and which i18n key labels each action. Movement is shown as one combined row. */
const ROWS = Object.freeze([
  { action: "move", labelKey: "options.controls.move" },
  { action: "sprint", labelKey: "options.controls.sprint" },
  { action: "jump", labelKey: "options.controls.jump" },
  { action: "clip", labelKey: "options.controls.clip" },
  { action: "clip2", labelKey: "options.controls.clip2" },
  { action: "handL", labelKey: "options.controls.handL" },
  { action: "handR", labelKey: "options.controls.handR" },
  { action: "interact", labelKey: "options.controls.interact" },
  { action: "breathe", labelKey: "options.controls.breathe" },
  { action: "map", labelKey: "options.controls.map" },
  { action: "camera", labelKey: "options.controls.camera" },
  { action: "trial", labelKey: "options.controls.trial" },
  { action: "pause", labelKey: "options.controls.pause" },
  { action: "photo", labelKey: "options.controls.photo" },
]);

const MOVE_ACTIONS = Object.freeze(["moveUp", "moveLeft", "moveDown", "moveRight"]);
/** Preferred on-screen order for the four movement keys (WASD before the arrow keys). */
const KEY_ORDER = Object.freeze(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"]);
const ARROW_GLYPH = Object.freeze({ ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" });

function formatKeyCode(code) {
  if (ARROW_GLYPH[code]) return ARROW_GLYPH[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code === "ShiftLeft" || code === "ShiftRight") return "Shift";
  if (code === "Escape") return "Esc";
  return code;
}

const formatMouseButton = (button) => (button === 0 ? "LMB" : button === 2 ? "RMB" : `M${button}`);

/** action name → display keys, e.g. "clip" → ["F"]. Built once per render from the live bindings. */
function collectKeys(bindings) {
  const byAction = new Map();
  const add = (action, label) => { if (!byAction.has(action)) byAction.set(action, []); byAction.get(action).push(label); };
  for (const [code, action] of Object.entries(bindings.keys)) add(action, formatKeyCode(code));
  for (const [button, action] of Object.entries(bindings.mouse || {})) add(action, formatMouseButton(Number(button)));
  return byAction;
}

/** The "Move" row's keys, in a stable WASD-then-arrows order regardless of object iteration order. */
function moveKeys(bindings) {
  const codes = Object.entries(bindings.keys).filter(([, action]) => MOVE_ACTIONS.includes(action)).map(([code]) => code);
  return KEY_ORDER.filter((code) => codes.includes(code)).map(formatKeyCode);
}

/**
 * @param {{ keys: object, mouse?: object }} bindings `core/input.js#Input.bindings`
 * @returns {HTMLElement} a `.opt-controls-list` grid, ready to append
 */
export function renderControlsList(bindings) {
  const list = el("div", "opt-controls-list");
  const byAction = collectKeys(bindings);
  for (const row of ROWS) {
    const keys = row.action === "move" ? moveKeys(bindings) : (byAction.get(row.action) || []);
    if (!keys.length) continue;
    list.append(el("div", "opt-controls-label", t(row.labelKey)), el("div", "opt-controls-keys", keys.join(" · ")));
  }
  return list;
}

function el(tag, className, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
