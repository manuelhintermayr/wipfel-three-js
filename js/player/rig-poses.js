// Procedural poses for the climber rig. A pose is a Float32Array: [pelvis dx, dy, dz, then rx, ry, rz per
// joint in JOINT_NAMES order]. Pose functions write into an `out` buffer; blending is linear (angles are small).
//
// Sign conventions (character faces +Z, left = +X): thigh/upper-arm rotation.x = -forwardSwing,
// shin rotation.x = +kneeBend, forearm rotation.x = -elbowBend, foot rotation.x > 0 = toes down,
// arm abduction: left rz > 0, right rz < 0.

import * as THREE from "three";

const { lerp, smoothstep, clamp } = THREE.MathUtils;
const TWO_PI = Math.PI * 2;

export const JOINT_NAMES = Object.freeze([
  "pelvis", "spine", "chest", "neck", "head",
  "shoulderL", "elbowL", "wristL", "shoulderR", "elbowR", "wristR",
  "hipL", "kneeL", "ankleL", "hipR", "kneeR", "ankleR",
]);
export const POSE_SIZE = 3 + JOINT_NAMES.length * 3;
const J = Object.fromEntries(JOINT_NAMES.map((n, i) => [n, 3 + i * 3]));

export function createPose() { return new Float32Array(POSE_SIZE); }

export function lerpPose(out, a, b, t) {
  for (let i = 0; i < POSE_SIZE; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

const rot = (out, joint, rx, ry = 0, rz = 0) => { const i = J[joint]; out[i] = rx; out[i + 1] = ry; out[i + 2] = rz; };
const setLeg = (out, side, hip, knee, foot) => {
  rot(out, "hip" + side, -hip);
  rot(out, "knee" + side, knee);
  rot(out, "ankle" + side, foot);
};
const setArm = (out, side, forward, abduct, elbow, twist = 0) => {
  const sign = side === "L" ? 1 : -1;
  rot(out, "shoulder" + side, -forward, twist * sign, abduct * sign);
  rot(out, "elbow" + side, -elbow);
  rot(out, "wrist" + side, 0);
};

/** Standing idle: breathing, slow weight shift, small head motion. `seeds` = per-rig phase offsets. */
export function idlePose(out, t, seeds) {
  out.fill(0);
  const breath = Math.sin(TWO_PI * 0.23 * t + seeds[0]);
  const shift = Math.sin(TWO_PI * 0.055 * t + seeds[1]);
  const headYaw = 0.06 * Math.sin(TWO_PI * 0.045 * t + seeds[2]) + 0.03 * Math.sin(TWO_PI * 0.11 * t + seeds[3]);
  const headPitch = 0.02 * Math.sin(TWO_PI * 0.07 * t + seeds[4]);
  const sway = 0.02 * Math.sin(TWO_PI * 0.15 * t + seeds[5]);

  out[0] = 0.015 * shift;                       // weight over one leg
  rot(out, "pelvis", 0, 0.01 * shift, -0.03 * shift);
  rot(out, "spine", 0.01 * breath, 0, 0.035 * shift);
  rot(out, "chest", 0.012 + 0.02 * breath, 0.01 * shift, 0);
  rot(out, "neck", 0.02, 0, 0);
  rot(out, "head", headPitch - 0.02, headYaw, 0);
  setArm(out, "L", 0.05 + sway, 0.14 + 0.01 * breath, 0.28);
  setArm(out, "R", 0.05 - sway, 0.14 + 0.01 * breath, 0.28);
  setLeg(out, "L", 0.02, 0.05 + 0.08 * Math.max(0, -shift), 0);
  setLeg(out, "R", 0.02, 0.05 + 0.08 * Math.max(0, shift), 0);
  return out;
}

/** Foot pitch: flat on the ground during stance, relaxed toe drop in swing. */
function footPitch(phase, hip, knee, run) {
  const p = phase - TWO_PI * Math.floor(phase / TWO_PI);
  const stance = smoothstep(p, 0.5 * Math.PI, 0.75 * Math.PI) * (1 - smoothstep(p, 1.3 * Math.PI, 1.55 * Math.PI));
  const swing = -0.25 * Math.sin(phase) + 0.25 * run * Math.max(0, Math.cos(phase + 0.35));
  return lerp(swing, hip - knee, stance);
}

/**
 * Walk ↔ run gait cycle. `phase` in radians (2π = one stride of both legs), `run` 0 = walk, 1 = sprint.
 * Left leg: heel strike at π/2, toe-off at 3π/2, mid-swing at 0. Right leg is offset by π.
 */
export function gaitPose(out, phase, run) {
  out.fill(0);
  const swingAmp = lerp(0.40, 0.70, run);
  const kneeSwing = lerp(0.85, 1.55, run);
  const kneeStance = lerp(0.10, 0.35, run);
  const armRatio = lerp(0.65, 0.95, run);
  const armForward = lerp(0.0, 0.35, run);
  const elbowBase = lerp(0.35, 1.45, run);
  const lean = lerp(0.03, 0.17, run);
  const hipRot = lerp(0.10, 0.15, run);

  for (const [side, offset] of [["L", 0], ["R", Math.PI]]) {
    const p = phase + offset;
    const hip = swingAmp * Math.sin(p);
    const knee = kneeSwing * Math.pow(Math.max(0, Math.cos(p + 0.35)), 1.5)
      + kneeStance * Math.pow(Math.max(0, Math.sin(p - 0.35)), 2);
    setLeg(out, side, hip, knee, footPitch(p, hip, knee, run));
    // arms swing opposite to their own leg
    const armSwing = -hip * armRatio + armForward;
    const elbow = elbowBase + lerp(0.15, 0.35, run) * Math.max(0, armSwing);
    setArm(out, side, armSwing, lerp(0.14, 0.22, run), elbow);
  }

  const c2 = Math.cos(2 * phase);
  const walkBob = -0.03 + 0.03 * c2;          // highest at mid-stance, lowest in double support
  const runBob = 0.02 - 0.04 * c2;            // lowest at mid-stance, highest in flight
  out[0] = -lerp(0.02, 0.01, run) * Math.cos(phase);
  out[1] = lerp(walkBob, runBob, run);
  const s = Math.sin(phase), c = Math.cos(phase);
  rot(out, "pelvis", 0, -hipRot * s, -lerp(0.04, 0.05, run) * c);
  rot(out, "spine", 0.02, 0, 0.03 * c);
  rot(out, "chest", lean, 0.7 * hipRot * s, 0.01 * c);
  rot(out, "neck", 0.02, 0, 0);
  rot(out, "head", -0.6 * lean, -0.3 * hipRot * s, 0);
  return out;
}

/** Airborne (jump / short fall). */
export function airPose(out) {
  out.fill(0);
  out[1] = -0.01;
  rot(out, "chest", 0.06);
  rot(out, "head", -0.05);
  setLeg(out, "L", 0.55, 1.05, 0.30);
  setLeg(out, "R", -0.15, 0.45, 0.35);
  setArm(out, "L", 0.35, 0.7, 0.7);
  setArm(out, "R", 0.35, 0.7, 0.7);
  return out;
}

/** Landing squash: deep crouch with flat feet, upper body leaning forward. */
export function landPose(out) {
  out.fill(0);
  const hip = 0.65, knee = 1.25;
  out[1] = -0.16;
  rot(out, "spine", 0.10);
  rot(out, "chest", 0.35);
  rot(out, "head", -0.28);
  setLeg(out, "L", hip, knee, hip - knee);
  setLeg(out, "R", hip, knee, hip - knee);
  setArm(out, "L", 0.5, 0.3, 0.5);
  setArm(out, "R", 0.5, 0.3, 0.5);
  return out;
}

/**
 * Climbing a block ladder: chest close to the spine, one hand reaching for the next hold, the
 * opposite knee high on a step block. `phase` (radians) alternates the diagonal – left hand with
 * right foot, as everyone climbs without being told to.
 */
export function ladderPose(out, phase = 0) {
  out.fill(0);
  const s = Math.sin(phase);
  out[1] = -0.05 - 0.02 * Math.cos(2 * phase);   // pelvis dips with every pull
  out[2] = 0.07;                                  // hips in towards the ladder
  rot(out, "pelvis", 0, 0.06 * s, 0.04 * s);
  rot(out, "spine", 0.05, -0.04 * s, 0);
  rot(out, "chest", 0.10, -0.08 * s, 0);
  rot(out, "neck", 0.06);
  rot(out, "head", -0.34, 0.06 * s, 0);
  setArm(out, "L", 1.95 + 0.42 * s, 0.24, 0.45 + 0.55 * Math.max(0, -s));
  setArm(out, "R", 1.95 - 0.42 * s, 0.24, 0.45 + 0.55 * Math.max(0, s));
  setLeg(out, "L", 0.55 - 0.42 * s, 0.85 - 0.55 * s, 0.22);
  setLeg(out, "R", 0.55 + 0.42 * s, 0.85 + 0.55 * s, 0.22);
  return out;
}

/**
 * Standing on a rail (M0.5). One composite pose covers the whole exercise, because the arms are the
 * only part that really changes: out to the sides like a tightrope walker while balancing, up on
 * the hand cable while gripping. `angle` is the balance angle (> 0 = tipping to the climber's
 * right), `elevation` 0 = hand hold at hip height, 1 = straight overhead.
 *
 * @param {Float32Array} out
 * @param {{ angle?, phase?, speed?, elevation?, handL?, handR?, breath?, freeze? }} [p]
 */
export function elementPose(out, p = {}) {
  const angle = p.angle || 0, phase = p.phase || 0, speed = clamp(p.speed || 0, 0, 1);
  const elevation = clamp(p.elevation == null ? 0 : p.elevation, 0, 1);
  const breath = p.breath || 0, freeze = p.freeze || 0;
  const s = Math.sin(phase), tip = clamp(angle, -0.6, 0.6);
  out.fill(0);

  out[0] = -tip * 0.11;                              // weight shifts towards the low side
  out[1] = -0.04 - 0.03 * speed - 0.05 * freeze;     // knees stay soft, and softer when scared
  out[2] = 0.01;
  rot(out, "pelvis", 0.02, 0.06 * s * speed, tip * 0.26);
  rot(out, "spine", 0.04 + 0.03 * breath, -0.03 * s * speed, tip * 0.42);
  rot(out, "chest", 0.06 + 0.05 * breath + 0.10 * freeze, -0.05 * s * speed, tip * 0.30);
  rot(out, "neck", 0.05);
  rot(out, "head", -0.14 - 0.22 * freeze, 0.05 * s * speed, tip * 0.16);

  // legs walk the line: short stride, feet almost on one axis, knees never locked
  const stride = lerp(0.10, 0.34, speed);
  for (const [side, sign] of [["L", 1], ["R", -1]]) {
    const swing = stride * s * sign;
    setLeg(out, side, swing, 0.20 + 0.45 * Math.max(0, swing) + 0.10 * freeze, 0.06);
  }

  // arms: balance wing → hand on the cable, per hand
  const wing = 1.24 + 0.34 * Math.abs(tip);
  const holdForward = lerp(0.02, 2.32, elevation);
  const holdAbduct = lerp(1.18, 0.32, elevation);
  const holdElbow = lerp(0.34, 0.58, elevation);
  for (const [side, sign, grip] of [["L", 1, clamp(p.handL || 0, 0, 1)], ["R", -1, clamp(p.handR || 0, 0, 1)]]) {
    const balanceForward = 0.03 + 0.12 * s * sign * speed;
    const balanceElbow = 0.20 + 0.30 * Math.abs(tip);
    setArm(out, side,
      lerp(balanceForward, holdForward, grip),
      lerp(wing - 0.30 * tip * sign, holdAbduct, grip),
      lerp(balanceElbow, holdElbow, grip));
  }
  return out;
}

/**
 * Hanging in the harness after a slip, and the two ways out of it: pulling up (`pull` 0..1) and
 * hand-over-hand along the lifeline (`haul` 0..1, `phase` alternates the arms).
 * @param {Float32Array} out
 * @param {{ swing?, pull?, haul?, phase? }} [p] `swing` = lanyard tilt in radians
 */
export function fallPose(out, p = {}) {
  const swing = clamp(p.swing || 0, -0.7, 0.7);
  const pull = clamp(p.pull || 0, 0, 1), haul = clamp(p.haul || 0, 0, 1);
  const s = Math.sin(p.phase || 0);
  out.fill(0);

  out[1] = -0.02 + 0.14 * pull;                      // the pull-up lifts the hips towards the hands
  out[2] = -0.06 + 0.10 * pull;
  rot(out, "pelvis", -0.30 + 0.55 * pull, 0.10 * s * haul, swing * 0.30);
  rot(out, "spine", -0.10 + 0.30 * pull, 0, swing * 0.35);
  rot(out, "chest", 0.05 + 0.25 * pull, -0.12 * s * haul, swing * 0.25);
  rot(out, "neck", 0.06 + 0.10 * pull);
  rot(out, "head", -0.10 + 0.24 * pull, 0.10 * s * haul, swing * 0.20);

  // legs hang, then tuck as the climber hauls themselves back over the rail
  const hip = lerp(0.62, 1.05, pull), knee = lerp(0.55, 1.35, pull);
  setLeg(out, "L", hip + 0.10 * s * haul, knee, 0.30);
  setLeg(out, "R", hip - 0.10 * s * haul, knee, 0.30);

  // arms: both up on the lanyard; hauling alternates them, pulling up folds them
  for (const [side, sign] of [["L", 1], ["R", -1]]) {
    const reach = 2.30 + 0.45 * s * sign * haul - 0.35 * pull;
    setArm(out, side, reach, 0.26 + 0.10 * haul, lerp(0.55, 1.85, pull) + 0.35 * Math.max(0, -s * sign) * haul);
  }
  return out;
}

/** Stride length (metres per gait cycle) blended between walk and run. */
export function strideLength(run, walkStride, runStride) { return lerp(walkStride, runStride, clamp(run, 0, 1)); }
