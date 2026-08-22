// Keyboard + mouse (pointer lock) + gamepad → abstract actions. Remappable via `bindings`.
// Actions: move (x,y), look (x,y), sprint, jump, handL, handR, clip, breathe, map, interact,
// pause, camera, debug, photo. Query with `input.down(name)`, `input.pressed(name)` (edge).

const DEFAULT_BINDINGS = {
  keys: {
    KeyW: "moveUp", KeyS: "moveDown", KeyA: "moveLeft", KeyD: "moveRight",
    ArrowUp: "moveUp", ArrowDown: "moveDown", ArrowLeft: "moveLeft", ArrowRight: "moveRight",
    ShiftLeft: "sprint", ShiftRight: "sprint",
    Space: "jump", KeyF: "clip", KeyQ: "handL", KeyE: "interact", KeyR: "breathe",
    Tab: "map", Escape: "pause", KeyT: "camera", F1: "debug", F2: "physdebug", KeyP: "photo",
    KeyX: "clip2", // classic belay mode: second carabiner
  },
  // right hand on keyboard: E is interact per GDD; hands are Q (left) and mouse right button (right)
  mouse: { 0: "handR", 2: "handR" },
  gamepad: {
    axes: { moveX: 0, moveY: 1, lookX: 2, lookY: 3 },
    buttons: { 0: "jump", 1: "breathe", 2: "clip", 3: "map", 4: "sprint", 5: "camera", 6: "handL", 7: "handR", 9: "pause", 8: "photo" },
    deadzone: 0.15,
  },
  lookSensitivity: 0.0022,
  gamepadLookSpeed: 2.6, // rad/s at full stick
};

export class Input {
  constructor(target = window, bindings = DEFAULT_BINDINGS) {
    this.bindings = bindings;
    this._down = new Set();
    this._pressed = new Set();      // actions pressed since last frame
    this._released = new Set();
    this._mouseDelta = { x: 0, y: 0 };
    this._padAxes = { moveX: 0, moveY: 0, lookX: 0, lookY: 0 };
    this._padDown = new Set();
    this.pointerLocked = false;
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this._target = target;
    this._bind();
  }

  _bind() {
    const t = this._target;
    t.addEventListener("keydown", (e) => {
      const a = this.bindings.keys[e.code];
      if (!a) return;
      if (e.code === "Tab" || e.code === "F1" || e.code === "F2") e.preventDefault();
      if (!e.repeat) { this._down.add(a); this._pressed.add(a); }
    });
    t.addEventListener("keyup", (e) => {
      const a = this.bindings.keys[e.code];
      if (a) { this._down.delete(a); this._released.add(a); }
    });
    t.addEventListener("blur", () => { this._down.clear(); });
    t.addEventListener("mousemove", (e) => {
      if (!this.pointerLocked) return;
      this._mouseDelta.x += e.movementX || 0;
      this._mouseDelta.y += e.movementY || 0;
    });
    t.addEventListener("mousedown", (e) => {
      const a = this.bindings.mouse[e.button];
      if (a) { this._down.add(a); this._pressed.add(a); }
    });
    t.addEventListener("mouseup", (e) => {
      const a = this.bindings.mouse[e.button];
      if (a) { this._down.delete(a); this._released.add(a); }
    });
    t.addEventListener("contextmenu", (e) => { if (this.pointerLocked) e.preventDefault(); });
    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement != null;
    });
  }

  /** Call from a user gesture to capture the mouse for look control. */
  requestPointerLock(element) {
    if (element.requestPointerLock) element.requestPointerLock();
  }

  /** Read gamepad state; called once per frame in the input phase. */
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((p) => p && p.connected);
    const gb = this.bindings.gamepad;
    const prevPad = this._padDown;
    this._padDown = new Set();
    if (pad) {
      const dz = (v) => (Math.abs(v) < gb.deadzone ? 0 : v);
      this._padAxes.moveX = dz(pad.axes[gb.axes.moveX] || 0);
      this._padAxes.moveY = dz(pad.axes[gb.axes.moveY] || 0);
      this._padAxes.lookX = dz(pad.axes[gb.axes.lookX] || 0);
      this._padAxes.lookY = dz(pad.axes[gb.axes.lookY] || 0);
      for (const [idx, action] of Object.entries(gb.buttons)) {
        const b = pad.buttons[idx];
        if (b && (b.pressed || b.value > 0.5)) {
          this._padDown.add(action);
          if (!prevPad.has(action)) this._pressed.add(action);
        } else if (prevPad.has(action)) {
          this._released.add(action);
        }
      }
    } else {
      this._padAxes.moveX = this._padAxes.moveY = this._padAxes.lookX = this._padAxes.lookY = 0;
    }
    // compose analog vectors
    const kx = (this._down.has("moveRight") ? 1 : 0) - (this._down.has("moveLeft") ? 1 : 0);
    const ky = (this._down.has("moveUp") ? 1 : 0) - (this._down.has("moveDown") ? 1 : 0);
    let mx = kx || this._padAxes.moveX, my = ky || -this._padAxes.moveY;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.move.x = mx; this.move.y = my;
    this.look.x = this._mouseDelta.x * this.bindings.lookSensitivity + this._padAxes.lookX * this.bindings.gamepadLookSpeed / 60;
    this.look.y = this._mouseDelta.y * this.bindings.lookSensitivity + this._padAxes.lookY * this.bindings.gamepadLookSpeed / 60;
    this._mouseDelta.x = 0; this._mouseDelta.y = 0;
  }

  down(action) { return this._down.has(action) || this._padDown.has(action); }
  pressed(action) { return this._pressed.has(action); }
  released(action) { return this._released.has(action); }

  /** Clear edge sets; call at the very end of the frame. */
  endFrame() { this._pressed.clear(); this._released.clear(); }
}
