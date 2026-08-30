// Assist mode (options screen "Gameplay" section, ROADMAP M1.7): a live-adjustable pair of scales
// that js/player/on-element.js and js/player/fall.js read every frame, mirroring the pattern
// js/player/belay.js#setMode already uses for the kassa's belay choice – a plain closure variable
// behind a getter, not a rebuilt player state – so flipping the toggle mid-crossing applies at once.
//
// What it changes, precisely (documented here so the options screen's description line stays honest):
// every wobble excitation js/player/on-element.js feeds into an element from the climber's own actions
// (footsteps, leaning, hurrying, a missed step) is multiplied by `disturbance` (0.6 = 40% gentler);
// every element's slip angle – the tilt beyond which js/player/balance.js lets the climber go, and the
// angle js/player/fall.js recovers to after a pull-up – is multiplied by `slipWindow` (a wider window
// before letting go). `BALANCE.topple`/`slipAngle` themselves (js/player/tuning.js) are left exactly as
// tuned; assist only scales what feeds them at the call site, so js/player/balance.js stays pure and
// its own unit tests are unaffected. Nothing else changes: no auto-catch, no invulnerability, no
// faster stamina/nerve recovery.
let enabled = false;

const SCALE = Object.freeze({
  off: Object.freeze({ disturbance: 1, slipWindow: 1 }),
  on: Object.freeze({ disturbance: 0.6, slipWindow: 1.35 }),
});

/** Options screen toggle (also `?assist=1`-style debug use if ever needed). */
export function setAssistMode(on) { enabled = !!on; }

export function isAssistMode() { return enabled; }

/** Current scale pair – read fresh every call, never cached, so a mid-route toggle applies at once. */
export function assistScale() { return enabled ? SCALE.on : SCALE.off; }
