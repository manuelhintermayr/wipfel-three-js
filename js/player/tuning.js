// Player tuning constants (M0.3). Kept in one place next to the player modules; candidates for
// js/config.js once the player is wired into main.js. Units: metres, seconds, radians, degrees where noted.

const DEG = Math.PI / 180;

export const PLAYER = Object.freeze({
  // capsule: total height = 2 * (halfHeight + radius) = 1.70 m; feet are `feetOffset` below the body centre
  radius: 0.3,
  halfHeight: 0.55,
  feetOffset: 0.85,
  massKg: 70,
  walkSpeed: 2.2,
  sprintSpeed: 4.6,
  groundAccel: 16,          // m/s² towards the wanted velocity
  groundDecel: 24,          // m/s² when the stick is released
  airAccel: 4,              // m/s² of steering while airborne
  jumpSpeed: 4.2,
  maxFallSpeed: 25,
  groundStick: 1.5,         // downward speed requested while grounded (keeps contact on slopes/steps)
  turnRate: 10,             // exponential yaw smoothing rate (1/s) towards the move direction
  coyoteTime: 0.12,         // seconds after leaving a ledge during which a jump is still accepted
  jumpBufferTime: 0.15,     // seconds a jump press is remembered before landing
  landPoseSpeed: 3.5,       // vertical landing speed (m/s) that gives a full land-squash weight
  fallbackDepth: 1.5,       // teleport back onto terrain.heightAt when the body ends up this far below it
  kcc: Object.freeze({
    offset: 0.02,
    autostepHeight: 0.35,
    autostepMinWidth: 0.2,
    snapToGround: 0.3,
    maxSlopeClimb: 45 * DEG,
    minSlopeSlide: 50 * DEG,
  }),
});

export const CAMERA = Object.freeze({
  pivotHeight: 1.35,        // above the feet, on the capsule axis (head slightly above screen centre)
  shoulderX: 0.45,          // right-shoulder offset (negative = left shoulder)
  shoulderY: 0.15,          // slightly above the pivot
  distanceMin: 2.9,         // standing / walking
  distanceMax: 3.4,         // sprinting
  pitchMin: -55 * DEG,      // looking down
  pitchMax: 70 * DEG,       // looking up
  pitchDefault: -14 * DEG,
  fovBase: 55,
  fovSprint: 6,             // extra degrees at full sprint
  probeRadius: 0.2,         // sphere cast radius for collision (> camera near plane 0.1)
  recoverRate: 3,           // 1/s – how fast the camera moves back out after an obstacle
  distanceRate: 4,          // 1/s – smoothing of the wanted distance (walk ↔ sprint)
  fovRate: 6,               // 1/s – smoothing of the field of view
  pivotYRate: 14,           // 1/s – vertical follow smoothing (steps, autostep pops)
  eyeHeight: 1.62,          // first-person camera above the feet when no eye anchor is given
});

export const RIG = Object.freeze({
  height: 1.72,
  strideWalk: 1.9,          // metres per gait cycle at walk speed
  strideRun: 3.2,           // metres per gait cycle at sprint speed
  gaitBlendSpeed: 0.6,      // m/s at which the idle→gait blend reaches 1
  poseSmoothing: 18,        // 1/s – exponential smoothing of joint targets
});
