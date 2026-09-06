// Player 2's input facade (ROADMAP M4, GDD §3.11): the first connected gamepad, read directly –
// never through js/core/input.js#Input (that instance stays player 1's keyboard+mouse once co-op is
// on, see Input#setGamepadEnabled). Same public method names as Input (`down`/`pressed`/`released`/
// `consume`/`move`/`look`/`poll`/`endFrame`) so every consumer (player/controller.js, on-element.js,
// belay/interaction.js, …) can hold either one without knowing which it has – "Input-like facade" per
// the milestone brief, not a subclass (Input also owns keyboard/mouse DOM listeners this has no use for).
import { DEFAULT_GAMEPAD_BINDINGS } from "./input.js";

/** True while at least one gamepad is connected – js/ui/kassa.js gates the "Two climbers" toggle on this. */
export function isGamepadConnected() {
  if (!navigator.getGamepads) return false;
  return Array.from(navigator.getGamepads()).some((p) => p && p.connected);
}

/**
 * @param {{ bindings?: typeof DEFAULT_GAMEPAD_BINDINGS }} [options]
 * @returns {{ move: {x,y}, look: {x,y}, invertY: boolean, connected: boolean,
 *   poll(): void, down(action): boolean, pressed(action): boolean, released(action): boolean,
 *   consume(action): void, requestPointerLock(): void, endFrame(): void }}
 */
export function createGamepadInputSource(bindings = DEFAULT_GAMEPAD_BINDINGS) {
  const state = {
    bindings,
    _down: new Set(),
    _pressed: new Set(),
    _released: new Set(),
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    /** Kept for interface parity with Input – no rebinding UI reads/writes this for player 2. */
    invertY: false,
    connected: false,

    poll() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = Array.from(pads).find((p) => p && p.connected);
      state.connected = !!pad;
      const gb = state.bindings;
      const nextDown = new Set();
      let mx = 0, my = 0, lx = 0, ly = 0;
      if (pad) {
        const dz = (v) => (Math.abs(v) < gb.deadzone ? 0 : v);
        mx = dz(pad.axes[gb.axes.moveX] || 0);
        my = dz(pad.axes[gb.axes.moveY] || 0);
        lx = dz(pad.axes[gb.axes.lookX] || 0);
        ly = dz(pad.axes[gb.axes.lookY] || 0);
        for (const [idx, action] of Object.entries(gb.buttons)) {
          const b = pad.buttons[idx];
          if (b && (b.pressed || b.value > 0.5)) {
            nextDown.add(action);
            if (!state._down.has(action)) state._pressed.add(action);
          }
        }
      }
      for (const action of state._down) if (!nextDown.has(action)) state._released.add(action);
      state._down = nextDown;

      const len = Math.hypot(mx, my);
      if (len > 1) { mx /= len; my /= len; }
      state.move.x = mx;
      state.move.y = -my;   // stick forward is a negative axis value – same convention as Input#poll
      const invert = state.invertY ? -1 : 1;
      const gamepadLookSpeed = 2.6;   // matches core/input.js#DEFAULT_BINDINGS.gamepadLookSpeed
      state.look.x = (lx * gamepadLookSpeed) / 60;
      state.look.y = ((ly * gamepadLookSpeed) / 60) * invert;
    },

    down(action) { return state._down.has(action); },
    pressed(action) { return state._pressed.has(action); },
    released(action) { return state._released.has(action); },
    /** Same "drop a just-pressed edge before another consumer reads it" escape hatch as Input#consume. */
    consume(action) { state._pressed.delete(action); },
    /** Player 2 never owns the mouse cursor – a harmless no-op so shared code can call it unconditionally. */
    requestPointerLock() {},
    endFrame() { state._pressed.clear(); state._released.clear(); },
  };
  return state;
}

/**
 * A do-nothing stand-in satisfying the exact same shape as `createGamepadInputSource`'s return value,
 * for verification without real gamepad hardware (`WIPFEL.debug.enableCoopForTest()`,
 * tools/dev/verify-m4.mjs). `_down`/`move`/`look` are plain, directly mutable fields – a script can poke
 * them between frames – but nothing in this module ever populates them on its own; `poll()` is a no-op.
 * @returns {ReturnType<typeof createGamepadInputSource>}
 */
export function createTestInputSource() {
  return {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    invertY: false,
    connected: true,
    _down: new Set(),
    poll() {},
    down(action) { return this._down.has(action); },
    pressed() { return false; },
    released() { return false; },
    consume() {},
    requestPointerLock() {},
    endFrame() {},
  };
}
