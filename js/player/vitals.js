// The climber's three resources in one place (GDD §3.1): balance, strength, nerves. The pure logic
// lives in balance.js / stamina.js / nerves.js; this module owns the *instances*, decides who steps
// them (a rail state does it itself, otherwise this module does), and turns their values into things
// the player can feel – the strength ring and heartbeat in the HUD, the camera breathing, the
// heartbeat and breathing sounds.
//
// It exists so main.js stays a wiring file and so the element and fall states can be handed exactly
// the three objects they need instead of reaching for globals.

import { createBalance } from "./balance.js";
import { createStamina } from "./stamina.js";
import { createNerves } from "./nerves.js";
import { NERVES, VITALS } from "./tuning.js";
import { sfxHeartbeat, sfxBreath } from "../audio/sfx.js";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * How much the climber is looking down, 0..1. Nothing below `lookDownStart` counts – glancing at
 * your feet on a wire is normal, staring into the drop is not.
 * @param {{ pitch: number }|null} camera
 */
export function lookDownAmount(camera) {
  if (!camera) return 0;
  return clamp01((-camera.pitch - VITALS.lookDownStart) / (VITALS.lookDownFull - VITALS.lookDownStart));
}

/**
 * @param {{ player, input, terrain?, hud?, events? }} options
 * @returns {{ balance, stamina, nerves, height: number, onPlatform: boolean,
 *   update(dt: number): void, reset(): void, probe(): object, dispose(): void }}
 *   `update` runs in the gameplay phase, after the player has moved.
 */
export function createVitals({ player, input, terrain = null, hud = null, events = null }) {
  const balance = createBalance();
  const stamina = createStamina();
  const nerves = createNerves();
  let height = 0;                 // metres of air under the feet
  let onPlatform = false;
  let beatTimer = 0;              // seconds until the next heartbeat
  let breathTimer = 0;            // seconds until the next breath swell

  const onRail = () => player.mode === "element" || player.mode === "fall";

  function groundY() {
    if (!terrain || typeof terrain.heightAt !== "function") return 0;
    const h = terrain.heightAt(player.position.x, player.position.z);
    return Number.isFinite(h) ? h : 0;
  }

  /** Resources while the climber walks: the rail states run their own step, this covers the rest. */
  function stepOnFoot(dt) {
    const moving = player.speed > 0.15;
    stamina.update(dt, { onPlatform, moving });
    nerves.update(dt, {
      height,
      onPlatform,
      onGround: !onPlatform,
      lookDown: onPlatform ? lookDownAmount(player.camera) : 0,
      breathing: input.down("breathe") && !moving,
    });
  }

  /** A heartbeat on the beat, and one breath per press-and-hold of R. */
  function stepAudio(dt) {
    beatTimer -= dt;
    if (beatTimer <= 0) {
      beatTimer = 60 / Math.max(30, nerves.heartRate);
      if (nerves.value > VITALS.heartbeatFrom) {
        sfxHeartbeat(VITALS.heartbeatMax * (nerves.value - VITALS.heartbeatFrom) / (1 - VITALS.heartbeatFrom));
      }
    }
    if (!input.down("breathe")) { breathTimer = 0; return; }
    breathTimer -= dt;
    if (breathTimer > 0) return;
    breathTimer = NERVES.breathSeconds;
    sfxBreath(NERVES.breathSeconds);
  }

  const vitals = {
    balance,
    stamina,
    nerves,
    /** Metres between the feet and the terrain below them. */
    get height() { return height; },
    /** True while the climber is up in the trees rather than on the forest floor. */
    get onPlatform() { return onPlatform; },

    update(dt) {
      if (!(dt > 0)) return;
      height = Math.max(0, player.position.y - groundY());
      onPlatform = height > VITALS.platformHeight;
      if (!onRail()) stepOnFoot(dt);
      player.camera.setBreathing(nerves.cameraSway);
      stepAudio(dt);
      if (hud) {
        hud.setVitals({
          stamina: stamina.value,
          heartRate: nerves.heartRate,
          level: nerves.level,
          frozen: nerves.frozen,
        });
      }
    },

    /** Back at the start of a run (rescue, respawn): full strength, calm, trust kept. */
    reset() {
      balance.reset(0);
      stamina.reset(1);
      nerves.reset(0);
      beatTimer = breathTimer = 0;
      if (events) events.emit("player:vitals-reset", {});
    },

    /** Rows for the F1 panel – the exercise row reads the same on a rail and under one. */
    probe() {
      const state = player.states.get(player.mode);
      const t = state && state.element ? (state.progress == null ? state.cableT : state.progress) : null;
      return {
        element: t == null ? "–" : `${state.element.id} t=${t.toFixed(2)}`,
        balance: balance.angle.toFixed(3),
        stamina: stamina.value.toFixed(2),
        nerves: `${nerves.value.toFixed(2)} ${nerves.level}${nerves.frozen ? " ❄" : ""}`,
        "heart bpm": nerves.heartRate.toFixed(0),
        trust: nerves.trust.toFixed(2),
        "air below": `${height.toFixed(1)} m`,
      };
    },

    dispose() { if (hud) hud.setVitals({ stamina: 1, heartRate: NERVES.heartRateCalm }); },
  };
  return vitals;
}
