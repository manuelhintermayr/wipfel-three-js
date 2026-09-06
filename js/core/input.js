// Keyboard + mouse (pointer lock) + gamepad → abstract actions. Remappable via `bindings`.
// Actions: move (x,y), look (x,y), sprint, jump, handL, handR, clip, breathe, map, interact,
// pause, camera, debug, photo, trial. Query with `input.down(name)`, `input.pressed(name)` (edge).

const DEFAULT_BINDINGS = {
  keys: {
    KeyW: "moveUp", KeyS: "moveDown", KeyA: "moveLeft", KeyD: "moveRight",
    ArrowUp: "moveUp", ArrowDown: "moveDown", ArrowLeft: "moveLeft", ArrowRight: "moveRight",
    ShiftLeft: "sprint", ShiftRight: "sprint",
    Space: "jump", KeyF: "clip", KeyQ: "handL", KeyE: "interact", KeyR: "breathe",
    Tab: "map", Escape: "pause", KeyT: "camera", F1: "debug", F2: "physdebug", KeyP: "photo",
    KeyX: "clip2", // classic belay mode: second carabiner
    // M2a time trials (ROADMAP): GDD's own key suggestion "[T]" is already "camera" here (the design docs's
    // control list, since M0.7) – KeyG is the nearest free key instead of overloading T with a second,
    // unrelated meaning.
    KeyG: "trial",
  },
  // right hand on keyboard: E is interact per GDD; hands are Q (left) and mouse right button (right)
  mouse: { 0: "handR", 2: "handR" },
  gamepad: {
    axes: { moveX: 0, moveY: 1, lookX: 2, lookY: 3 },
    // M4 (ROADMAP "Koop 2 lokal", ADR-030): index 10 (left-stick click, "L3" on a standard Gamepad API
    // mapping) is otherwise unused by this project – GDD's own control table lists "interact" as "–" on
    // gamepad (never mapped), which is fine for a keyboard-primary solo game but leaves a gamepad-only
    // player 2 unable to clip in, climb a ladder or step onto anything at all. Added here rather than in
    // a rebinding UI (none exists, and none is asked for) – every existing index is untouched, so solo
    // gamepad play (already possible via js/core/input.js#Input before M4) only gains a button, it loses
    // nothing.
    buttons: { 0: "jump", 1: "breathe", 2: "clip", 3: "map", 4: "sprint", 5: "camera", 6: "handL", 7: "handR", 9: "pause", 8: "photo", 10: "interact" },
    deadzone: 0.15,
  },
  lookSensitivity: 0.0022,
  gamepadLookSpeed: 2.6, // rad/s at full stick
};

/** The gamepad half of the default bindings, reused as-is by js/core/input-source.js's player-2 facade. */
export const DEFAULT_GAMEPAD_BINDINGS = DEFAULT_BINDINGS.gamepad;

export class Input {
  constructor(target = window, bindings = DEFAULT_BINDINGS) {
    this.bindings = bindings;
    this._down = new Set();
    this._pressed = new Set();      // actions pressed since last frame
    this._released = new Set();
    this._mouseDelta = { x: 0, y: 0 };
    this._padAxes = { moveX: 0, moveY: 0, lookX: 0, lookY: 0 };
    this._padDown = new Set();
    // Touch overlay (js/ui/touch-controls.js, ROADMAP M2b): a virtual stick + buttons pushed in every
    // frame via `setVirtualState`, merged alongside the keyboard/gamepad the same way the gamepad's own
    // axes/buttons already are – every consumer (`down`/`pressed`/`move`) stays unaware of the source.
    this._virtualDown = new Set();
    this._virtualMove = { x: 0, y: 0 };
    this._virtualLook = { x: 0, y: 0 };   // accumulated drag delta, consumed once per poll()
    this.pointerLocked = false;
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    /** Accessibility (options screen, M1.7): flips vertical look – camera pitch, not the actions above. */
    this.invertY = false;
    // M4 (js/game/coop.js): once co-op is enabled the gamepad drives player 2 exclusively (js/core/
    // input-source.js#GamepadInputSource) – this instance (player 1) must stop reading it, or the same
    // physical stick would move both climbers. Off by default: solo play keeps today's "gamepad is a P1
    // alternative" behaviour untouched.
    this._useGamepad = true;
    this._target = target;
    this._bind();
  }

  /** js/game/coop.js: false while co-op owns the gamepad for player 2; true (default) otherwise. */
  setGamepadEnabled(on) {
    this._useGamepad = !!on;
    if (!this._useGamepad) { this._padAxes.moveX = this._padAxes.moveY = this._padAxes.lookX = this._padAxes.lookY = 0; this._padDown.clear(); }
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
    const pads = this._useGamepad && navigator.getGamepads ? navigator.getGamepads() : [];
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
    // Touch overlay buttons (F/E/Space): same edge-detection shape as the gamepad loop above, kept as
    // its own small pass so a touch device without a gamepad still gets `pressed()`/`released()` edges.
    for (const action of this._virtualDown) if (!this._touchDownPrev || !this._touchDownPrev.has(action)) this._pressed.add(action);
    if (this._touchDownPrev) for (const action of this._touchDownPrev) if (!this._virtualDown.has(action)) this._released.add(action);
    this._touchDownPrev = new Set(this._virtualDown);

    // compose analog vectors
    const kx = (this._down.has("moveRight") ? 1 : 0) - (this._down.has("moveLeft") ? 1 : 0);
    const ky = (this._down.has("moveUp") ? 1 : 0) - (this._down.has("moveDown") ? 1 : 0);
    let mx = kx || this._padAxes.moveX || this._virtualMove.x, my = ky || -this._padAxes.moveY || this._virtualMove.y;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.move.x = mx; this.move.y = my;
    const invert = this.invertY ? -1 : 1;
    this.look.x = this._mouseDelta.x * this.bindings.lookSensitivity + this._padAxes.lookX * this.bindings.gamepadLookSpeed / 60 + this._virtualLook.x;
    this.look.y = (this._mouseDelta.y * this.bindings.lookSensitivity + this._padAxes.lookY * this.bindings.gamepadLookSpeed / 60 + this._virtualLook.y) * invert;
    this._mouseDelta.x = 0; this._mouseDelta.y = 0;
    this._virtualLook.x = 0; this._virtualLook.y = 0;
  }

  down(action) { return this._down.has(action) || this._padDown.has(action) || this._virtualDown.has(action); }
  pressed(action) { return this._pressed.has(action); }
  released(action) { return this._released.has(action); }
  /** Drop a just-pressed edge before anything else reads it this frame (e.g. Space doubling as both
   *  "jump" and a photo-mode snapshot, ROADMAP M2b) – rare enough not to need a general priority system. */
  consume(action) { this._pressed.delete(action); }

  /**
   * Touch overlay (js/ui/touch-controls.js): the virtual stick's analog vector (already -1..1 per axis,
   * camera-relative composition happens downstream exactly like the keyboard's) and the set of virtual
   * buttons currently held, replacing the keyboard's `_down` contribution for the same action names.
   * @param {Iterable<string>} actions
   * @param {{x:number,y:number}} move
   */
  setVirtualState(actions, move) {
    this._virtualDown = new Set(actions);
    this._virtualMove.x = move ? move.x : 0;
    this._virtualMove.y = move ? move.y : 0;
  }

  /**
   * Touch overlay's right-side look-drag area. Takes *radians already*, not a raw pixel delta – unlike
   * mouse look (scaled by `bindings.lookSensitivity`, tuned for OS pointer counts), a touch drag is in
   * CSS pixels at a very different scale, so js/ui/touch-controls.js applies its own
   * `js/config.js#TOUCH.lookSensitivity` before calling this.
   */
  addVirtualLook(yawRadians, pitchRadians) {
    this._virtualLook.x += yawRadians;
    this._virtualLook.y += pitchRadians;
  }

  /** Clear edge sets; call at the very end of the frame. */
  endFrame() { this._pressed.clear(); this._released.clear(); }
}
