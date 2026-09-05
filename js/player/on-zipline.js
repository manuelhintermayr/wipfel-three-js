// State "zipline": the reward at the end of the course (GDD §3.6). Sit into the harness, push off,
// and for the next ten seconds the game wants exactly one thing from you – and it is the same thing
// a real park wants: **legs up**. Holding Space tucks the knees, which cuts the drag and makes you
// faster, and it is also the position the braking net needs. One input, two meanings, exactly like
// riding one.
//
// The state owns nothing physical. `element.zip` (js/zipline/physics.js) integrates the ride,
// `element.brake` (js/zipline/brakes.js) owns the last six metres, and `element.setRider(s, dip)`
// tells the geometry where the trolley is. This module places the body under the trolley, points the
// camera down the line, and turns speed into field of view, wind noise and a trolley whirr.
//
// Camera: first person for the whole ride and the shoulder camera back afterwards, automatically –
// the one place in the game where the player does not choose (GDD §controls: "im Flying Fox
// automatisch Ego").

import * as THREE from "three";
import { ZIP_RIDE } from "./tuning.js";
import { ZIP_PHYSICS } from "../zipline/physics.js";
import { createWobble } from "../elements/element.js";
import { ziplinePose } from "./rig-poses.js";
import { lookDownAmount } from "./vitals.js";
import { sfxTrolley, sfxWindRush, sfxZipArrive } from "../audio/sfx.js";
import { t } from "../core/i18n.js";
import { sidegradeEffects } from "./sidegrade.js";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampSigned = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);

export const ZIP_PROMPTS = Object.freeze({
  get seated() { return t("prompt.zipPush"); },
  get riding() { return t("prompt.zipRiding"); },
  get zone() { return t("prompt.zipZone"); },
  get handZone() { return t("prompt.zipHandZone"); },
  get stalled() { return t("prompt.zipStalled"); },
});

/**
 * @param {{ input, events?, camera?, hud?, stamina, nerves, wind?, belay?, sky? }} options
 *   `belay` (optional, M2b): read once per ride (`belay.mode`) to pick the net or the classic hand
 *   brake – see js/zipline/brakes.js's "profile" parameter. Omit it and the ride always uses the net,
 *   exactly like before this milestone. `sky` (optional, M2b): `sky.night` (0..1) feeds the nerves'
 *   night relief/unknown terms – see js/player/nerves.js.
 * @returns {object} a state for the player's state machine – register it with `player.addState("zipline", …)`
 */
export function createZiplineState({ input, events = null, camera = null, hud = null, stamina, nerves, wind = null, belay = null, sky = null }) {
  const point = new THREE.Vector3(), tangent = new THREE.Vector3();
  const bounce = createWobble(ZIP_RIDE.bounce);
  const params = { tuck: 0, twist: 0, speed: 0, haul: 0, phase: 0, brace: 0 };

  let element = null, zip = null, brake = null;
  let phase = "seated";                  // seated → riding → (arrival hands back to "ground")
  let sitTimer = 0, hauling = 0, tuck = 0, twist = 0, braked = false;
  let restoreThirdPerson = false;
  let trolleySound = null, windSound = null;
  let windOverride = null;
  let riderMass = ZIP_RIDE.massKg;
  /** Classic mode (M2b, GDD §3.3): decided once at `enter()`, not re-read mid-ride – the belay choice
   *  cannot change while sitting in the harness anyway (the kassa is not reachable there). */
  let brakeProfile = "net";

  /** Wind component along the direction of travel, m/s: positive is a tail wind. */
  function windAlong() {
    if (windOverride != null) return windOverride;
    if (!wind) return 0;
    zip.tangentAt(zip.s, tangent);
    const speed = wind.strength * ZIP_RIDE.windScale;
    return -(wind.direction.x * tangent.x + wind.direction.y * tangent.z) * speed;
  }

  /** Put the body under the trolley, facing the way the cable runs. */
  function place(player) {
    zip.pointAt(zip.s, point);
    zip.tangentAt(zip.s, tangent);
    const dip = bounce.vertical;
    element.setRider(zip.s, dip);
    player.moveTo(point.x + bounce.lateral * -tangent.z, point.y - element.seatDrop - dip, point.z + bounce.lateral * tangent.x);
    player.setHeading(Math.atan2(tangent.x, tangent.z));
  }

  /** Speed as 0..1 against the reference speed – drives FOV, audio and how far the head ducks. */
  function speed01() { return clamp01(zip.v / ZIP_RIDE.referenceSpeed); }

  function startAudio() {
    trolleySound = sfxTrolley(0);
    windSound = sfxWindRush(0);
  }

  function stopAudio() {
    if (trolleySound) trolleySound.stop();
    if (windSound) windSound.stop();
    trolleySound = windSound = null;
  }

  const state = {
    ownsMovement: true,
    blendRate: 6,
    /** The rig stays visible in first person here – you are meant to see your own knees come up. */
    showBody: true,
    get element() { return element; },
    get progress() { return zip ? zip.progress : 0; },
    get speedKmh() { return zip ? zip.speedKmh : 0; },
    get riding() { return phase === "riding"; },
    get outcome() { return brake ? brake.outcome : null; },
    /** The prompt line while the state is active – js/player/interaction.js lets a state speak. */
    get prompt() {
      if (phase === "seated") return ZIP_PROMPTS.seated;
      if (zip && (zip.stalled || handBrakeStalled())) return ZIP_PROMPTS.stalled;
      if (brake && brake.inZone(zip.s, sidegradeEffects().zipBrakeZoneScale, brakeProfile)) {
        return brakeProfile === "hand" ? ZIP_PROMPTS.handZone : ZIP_PROMPTS.zone;
      }
      return ZIP_PROMPTS.riding;
    },
    pose(out) { return ziplinePose(out, params); },

    /**
     * Debug/test hook (`WIPFEL.debug.setWindAlong`): pin the wind along the cable in m/s instead of
     * reading it off world/wind.js. Negative is a head wind, which is how you make a light rider
     * stall. `null` hands it back to the weather.
     */
    setWindAlong(metresPerSecond) {
      windOverride = metresPerSecond;
      if (zip) zip.setWindAlong(windAlong());
    },

    /** Rider mass in kg for the next ride – RULES.sizeClasses, until the ticket desk exists (M1.3). */
    setRiderMass(kg) {
      riderMass = Math.max(1, kg);
      if (zip) zip.setMass(riderMass);
      return riderMass;
    },

    enter(player, data) {
      element = (data && data.element) || null;
      if (!element || !element.zip) return;
      zip = element.zip;
      brake = element.brake;
      // Classic mode (M2b, GDD §3.3 "Flying Fox mit Handbremse"): the belay choice for *this* ride,
      // frozen at the moment the harness is sat into – js/zipline/brakes.js's "hand" profile replaces
      // the net's legs-up-at-entry latch with a continuous grip over a longer zone.
      brakeProfile = belay && belay.mode === "classic" ? "hand" : "net";
      // "Fast trolley" sidegrade (M2a): a lower effective drag coefficient for this ride only – the
      // cable/trolley geometry (built once in js/elements/zipline.js) never changes, only the physics
      // model's own drag term does, exactly like a heavier rider already changes `massKg` per ride.
      zip.reset({ massKg: riderMass, windAlong: 0, dragCoeff: ZIP_PHYSICS.dragCoeff * sidegradeEffects().zipDragScale });
      zip.setWindAlong(windAlong());
      brake.reset();
      bounce.reset();
      phase = "seated";
      sitTimer = 0; hauling = 0; tuck = 0; twist = 0; braked = false;
      params.brace = 0;
      element.setRider(0, 0);
      player.velocity.set(0, 0, 0);
      place(player);
      if (camera) {
        restoreThirdPerson = !camera.isFirstPerson;
        camera.setFirstPerson(true);
        zip.tangentAt(0, tangent);
        camera.yaw = Math.atan2(tangent.x, tangent.z);
        camera.pitch = ZIP_RIDE.lookPitch;              // down the line, net and landing in the frame
      }
      if (events) events.emit("zip:seated", { element: element.id });
    },

    exit(player) {
      stopAudio();
      if (camera) {
        camera.setExtraFov(0);
        if (restoreThirdPerson) camera.setFirstPerson(false);
      }
      if (hud) hud.setSpeed(null);
      if (element) element.setRider(null, 0);
      player.velocity.set(0, 0, 0);
      element = null; zip = null; brake = null;
    },

    update(player, dt) {
      if (!element || !zip) return "ground";
      sitTimer += dt;
      readInput(dt);

      if (phase === "seated") {
        // `down`, not `pressed`: holding Space *is* the ride input (legs up), and above 60 fps a
        // frame can run no fixed step at all, so an edge read here can be missed. `pushDelay` keeps
        // the E that sat you down from launching you.
        if (sitTimer >= ZIP_RIDE.pushDelay && input.down("jump")) pushOff();
        else if (input.down("interact") && sitTimer > ZIP_RIDE.stepBackDelay) return stepBack(player);
      } else {
        ride(dt);
      }

      bounce.update(dt);
      place(player);
      updateFeel(player, dt);
      if (phase === "riding" && zip.done) return arrive(player);
      return undefined;
    },
  };

  /** A/D twist the body (cosmetic), Space tucks the legs – smoothed, because a body has mass. */
  function readInput(dt) {
    const wantTuck = input.down("jump") ? 1 : 0;
    tuck += (wantTuck - tuck) * Math.min(1, ZIP_RIDE.tuckRate * dt);
    twist += (clampSigned(input.move.x) - twist) * Math.min(1, ZIP_RIDE.twistRate * dt);
  }

  function pushOff() {
    phase = "riding";
    zip.push();
    bounce.excite(0, ZIP_RIDE.pushBounce);
    startAudio();
    if (events) events.emit("zip:push", { element: element.id });
  }

  /** Second thoughts at the gate: stand up again, still clipped to the cable. */
  function stepBack(player) {
    const anchor = element.getEntryAnchor();
    player.teleport(anchor.stand.x, anchor.stand.y, anchor.stand.z);
    return "ground";
  }

  /** True once the hand brake has pinned the speed near zero short of the end – js/zipline/physics.js's
   *  own `stalled` getter only ever considers gravity/drag, so a deliberate hand-braked stop needs its
   *  own check here before the shared "hauling" path below can see it. */
  function handBrakeStalled() {
    return brakeProfile === "hand" && zip.v <= 0.05 && zip.s < zip.length - 0.05
      && brake.inZone(zip.s, sidegradeEffects().zipBrakeZoneScale, "hand");
  }

  /** One step of the ride: gravity, then the brake, then everything the rider can feel. */
  function ride(dt) {
    zip.setWindAlong(windAlong());
    zip.update(dt, { tuck });
    const zoneScale = sidegradeEffects().zipBrakeZoneScale;
    if (brake.inZone(zip.s, zoneScale, brakeProfile)) {
      if (!braked) { braked = true; bounce.excite(0, ZIP_RIDE.brakeBounce); }
      const engaged = brakeProfile === "hand" ? input.down("handR") : tuck > 0.5;
      zip.setSpeed(brake.apply(dt, zip.s, zip.v, engaged, zoneScale, brakeProfile));
    }
    // Stalled: hand over hand to the end. Per RESEARCH-DATA §6 the hands must stay off the cable in
    // front of the trolley, so the rider reaches *behind* the roller and pulls – slow, and it hurts.
    hauling = (zip.stalled || handBrakeStalled()) && input.move.y > 0.3 ? 1 : 0;
    if (hauling) zip.haul(dt * (ZIP_RIDE.haulTired + (1 - ZIP_RIDE.haulTired) * stamina.value));
    bounce.excite(0, ZIP_RIDE.rumble * zip.v * dt * (zip.s % 2 < 1 ? 1 : -1));
  }

  /** Field of view, sound, nerves, strength and the pose – everything that is not position. */
  function updateFeel(player, dt) {
    const fast = speed01();
    const eased = Math.pow(fast, ZIP_RIDE.fovEase);
    if (camera) camera.setExtraFov(ZIP_RIDE.fovGain * eased);
    if (hud) hud.setSpeed(phase === "riding" ? zip.speedKmh : null);
    if (trolleySound) trolleySound.set(fast);
    if (windSound) windSound.set(fast);

    // Sitting in a harness costs almost nothing – the weight is on the webbing, not on the arms.
    // Hauling yourself in when the line stalls is the part that hurts, and it gets slower as the
    // reserve runs out (the ground crew's pull line arrives with the park staff in M1).
    stamina.update(dt, { onElement: true, extraDrain: hauling * ZIP_RIDE.haulDrain });
    const groundY = element.groundY == null ? player.position.y - 6 : element.groundY;
    nerves.update(dt, {
      height: Math.max(0, player.position.y - groundY),
      exposure: ZIP_RIDE.exposure * (1 - 0.4 * tuck),
      wobble: fast,
      lookDown: lookDownAmount(camera),
      onElement: true,
      night: sky ? sky.night : 0,
    });

    params.tuck = tuck;
    params.twist = twist;
    params.speed = fast;
    params.haul = hauling;
    params.phase += dt * 3.2 * hauling;
    params.brace = Math.max(0, params.brace - dt * 2);
  }

  /** The far anchor: feet on the deck if you listened, a stumble if you did not. */
  function arrive(player) {
    const outcome = brake.outcome || "clean";
    const maxKmh = zip.maxSpeedKmh;
    const anchor = element.getExitAnchor();
    params.brace = 1;
    sfxZipArrive(outcome === "clean");
    if (camera) camera.addShake(outcome === "clean" ? ZIP_RIDE.arriveShake : ZIP_RIDE.messyShake);
    if (outcome === "clean") nerves.completeElement();
    else nerves.shock(ZIP_RIDE.messyNerves);
    if (hud) hud.setNotice(t("notice.topSpeed", { kmh: maxKmh.toFixed(0) }), ZIP_RIDE.noticeSeconds);
    if (events) events.emit("zip:finished", { element: element.id, maxKmh, outcome, platform: anchor.platformId });
    player.teleport(anchor.stand.x, anchor.stand.y, anchor.stand.z);
    return "ground";
  }

  return state;
}
