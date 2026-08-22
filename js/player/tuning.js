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
  shakeDecay: 1.05,         // seconds for full trauma to fall back to zero
  shakePitch: 0.055,        // radians at full trauma
  shakeYaw: 0.045,
  shakeRoll: 0.070,
  breathMax: 0.05,          // radians of nerve-driven sway at full panic
});

export const RIG = Object.freeze({
  height: 1.72,
  strideWalk: 1.9,          // metres per gait cycle at walk speed
  strideRun: 3.2,           // metres per gait cycle at sprint speed
  gaitBlendSpeed: 0.6,      // m/s at which the idle→gait blend reaches 1
  poseSmoothing: 18,        // 1/s – exponential smoothing of joint targets
});

/**
 * Balance pendulum (js/player/balance.js). Positive angle = tipping to the climber's right.
 * `topple` makes upright unstable, so standing still is not free – you steer all the time.
 */
export const BALANCE = Object.freeze({
  // Measured against a no-input run on the Burma bridge: from a resting stance the climber has
  // roughly four seconds before the tilt runs away, and every step shortens that. Any hotter and a
  // green course becomes unplayable; any cooler and you can let go of the stick and walk across.
  topple: 3.2,              // 1/s² per radian – the destabilising term (this is the whole game)
  damping: 2.4,             // 1/s – body damping without hands (ankles and hips, not conscious)
  handStiffness: 13.0,      // 1/s² per radian and per hand – a hand on a cable pulls you upright
  handDamping: 3.4,         // 1/s per hand
  leanAuthority: 5.6,       // 1/s² at full stick – how hard the climber can lean
  leanSpeedPenalty: 0.45,   // fraction of authority lost at full walking speed
  maxAngularVelocity: 4.5,  // rad/s clamp so a huge excitation cannot teleport the angle
  slipAngle: 0.42,          // default threshold (radians ≈ 24°); elements override it
  recoverAngle: 0.6,        // fraction of the slip angle the angle is reset to after a catch
});

/** Arm strength (js/player/stamina.js). Rates are "fraction of the full reserve per second". */
export const STAMINA = Object.freeze({
  gripDrain: 0.016,         // per hand on a hold – both hands for a whole span still leaves a reserve
  elementDrain: 0.014,      // just being out there on a rail
  netDrain: 0.055,          // extra for wading through a cargo net
  hangDrain: 0.085,         // hanging in the harness
  haulDrain: 0.13,          // hand-over-hand along the lifeline
  pullUpDrain: 0.40,        // pulling yourself back up onto the rail
  regenPlatform: 0.24,      // standing on a platform
  regenStanding: 0.085,     // standing still on an element
  regenMoving: 0.02,
  recoverThreshold: 0.16,   // hands stay open until the reserve is back above this
});

/**
 * Nerves (js/player/nerves.js) – the real opponent. All gains are "per second at full input".
 * Height uses a logarithm: the first five metres cost far more than the next five.
 */
export const NERVES = Object.freeze({
  heightReference: 3.0,     // metres – knee of the logarithm
  heightMax: 20.0,          // metres – where the height term saturates
  // Budget, measured on the first Burma bridge (4.5 m up, ~12 s, no hands): the crossing should end
  // around "scared" and never freeze a beginner mid-span, while one hand on the cable (handRelief)
  // more than cancels the whole rise – that is the lesson the exercise is supposed to teach.
  heightGain: 0.038,
  exposureGain: 0.020,      // no hand hold available / no hand on a hold
  wobbleGain: 0.020,
  gustGain: 0.030,
  lookDownGain: 0.030,
  elementGain: 0.008,       // simply standing on an element for another second
  platformRelief: 0.20,
  breathRelief: 0.26,
  handRelief: 0.055,        // per hand actually holding on
  groundRelief: 0.55,
  trustGain: 0.42,          // how much full trust dampens every rise
  trustPerElement: 0.18,    // trust gained per completed element
  trustPerFall: 0.07,       // …and per fall that turned out to be harmless
  freezeThreshold: 0.88,
  freezeRelease: 0.62,      // value the climber is left at after breathing through it
  breathSeconds: 1.6,       // one deliberate breath
  breathsToRelease: 3,
  heartRateCalm: 58,
  heartRateMax: 168,
  tremorGain: 0.55,         // rad/s² of balance noise at full nerves
  cameraSwayGain: 0.030,    // radians of camera breathing at full nerves
  levels: Object.freeze([0.32, 0.62, 0.88]),   // calm | tense | scared | frozen
});

/**
 * The bookkeeping around the three resources (js/player/vitals.js): when the climber counts as
 * "up in the trees", when looking down starts to matter, and when the heartbeat becomes audible.
 */
export const VITALS = Object.freeze({
  platformHeight: 1.6,      // metres above the terrain from which "on foot" means "on a platform"
  lookDownStart: 25 * DEG,  // camera pitch below this counts as looking down (GDD §3.1)
  lookDownFull: 52 * DEG,
  heartbeatFrom: 0.40,      // nerve value above which the heartbeat is audible
  heartbeatMax: 0.42,       // sfx gain at full panic
});

/** Walking a rail element (js/player/on-element.js). */
export const ELEMENT_MOVE = Object.freeze({
  accel: 2.4,               // m/s² towards the wanted rail speed
  turnRate: 8,              // 1/s towards the rail tangent
  stepLength: 0.62,         // metres per step – drives the step rhythm that shakes the element
  stepExcite: 0.24,         // wobble impulse (m/s of sideways cable travel) per step
  wobbleDrive: 1.6,         // rad/s² of balance disturbance per m/s the element moves sideways
  hurryExcite: 1.9,         // extra impulse per m/s² of acceleration along the rail
  leanExcite: 0.22,         // wobble impulse per second at full lateral stick
  leanOffset: 0.16,         // metres the body shifts sideways at the slip angle
  exitMargin: 0.02,         // rail parameter tolerance at the ends
  handSlow: 0.12,           // fraction of the walking speed lost per hand on a hold
  nervePenalty: 0.35,       // fraction of the walking speed lost at full nerves
  cameraLift: 0.18,         // metres the camera pivot rises on an exercise (see over the rail)
  // …and for elements you cross step by step (hanging planks): one press of W = one plank
  stepWait: 0.35,           // seconds before the next step is accepted – let the plank settle
  stepGlide: 7,             // 1/s – how fast the body arrives over the plank it stepped onto
  missStepKick: 2.9,        // rad/s² into the balance when the plank was not where the foot went
});

/** Hanging in the harness after a slip (js/player/fall.js). */
export const FALL = Object.freeze({
  lanyard: 0.85,            // Smart Belay lanyard (RESEARCH-DATA §5)
  slack: 0.85,              // give in the whole system, so the harness ends up under the walking line
  lanyardRadius: 0.016,     // the webbing, drawn from the carabiner down to the harness
  harnessHeight: 1.05,      // attachment point above the feet
  bodyRadius: 0.28,
  bodyDensity: 260,         // gives roughly a 70 kg climber on a 0.28 m ball
  linearDamping: 1.40,      // the harness and the air settle the pendulum in about two seconds
  angularDamping: 3.0,
  catchShake: 0.85,         // camera trauma on the first catch
  catchShakeLater: 0.42,
  cameraDrop: 0.35,         // metres the camera pivot sinks while hanging
  haulSpeed: 0.34,          // m/s hand-over-hand along the lifeline
  pullUpSeconds: 1.2,
  pullUpReach: 1.35,        // max distance to the rail point that still allows a pull-up
  rescueDelay: 3.0,         // seconds before the rescue prompt appears
  rescueFadeSeconds: 1.1,
  settleSeconds: 2.0,       // after this the pendulum is considered calm (HUD, prompts)
});
