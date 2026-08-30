// Einschulung (GDD §3.7/§5, ROADMAP M1.3): after the kassa, a short diegetic trainer sequence before
// free climbing – four HUD dialogue steps (RESEARCH-DATA §1's mandatory safety theory) advanced with
// E, then a practice gate at a ground-level practice anchor (js/park/practice-stand.js) the player
// must clip into with the real ritual (js/player/belay.js) before any route's entry cable accepts a
// clip (the actual refusal lives in js/player/interaction.js, gated on `save.data.briefingDone`).
// Skippable on later visits: once done it is done for good (the save flag), and `?briefing=0` bypasses
// it entirely for debugging. `completeForBot()` lets `?autoplay=1` skip the walk-and-clip altogether.
import { t } from "../core/i18n.js";
import { createPracticeStand } from "../park/practice-stand.js";

const STEP_KEYS = Object.freeze(["briefing.step1", "briefing.step2", "briefing.step3", "briefing.step4"]);
const PRACTICE_ANCHOR_ID = "practice-anchor";
const CLIP_RANGE = 1.6;   // matches js/park/loader.js#LOADER.interactRange

/**
 * @param {{ root: HTMLElement, scene, physics, terrain, parkDef, textures, rng, belay, player, input,
 *   save, events? }} options
 * @returns {{ active: boolean, phase: string, start(): void, update(): void, completeForBot(): void,
 *   dispose(): void }}
 */
export function createBriefing({ root, scene, physics, terrain, parkDef, textures, rng, belay, player, input, save, events = null }) {
  const panel = document.createElement("div");
  panel.className = "briefing-panel";
  panel.hidden = true;
  const title = document.createElement("div");
  title.className = "title";
  const text = document.createElement("div");
  text.className = "text";
  const hint = document.createElement("div");
  hint.className = "hint";
  panel.append(title, text, hint);
  root.appendChild(panel);

  const standPos = placement(parkDef, terrain);
  let stand = null;
  let phase = "idle";   // idle → dialogue → practiceGate → done
  let step = 0;

  function render() {
    title.textContent = t("briefing.trainer");
    if (phase === "dialogue") {
      text.textContent = t(STEP_KEYS[step]);
      hint.textContent = t("briefing.continue");
    } else if (phase === "practiceGate") {
      text.textContent = t("briefing.gate");
      hint.textContent = "";
    }
    panel.hidden = phase !== "dialogue" && phase !== "practiceGate";
  }

  function ensureStand() {
    if (stand) return;
    stand = createPracticeStand({ scene, physics, position: standPos, facing: standPos.facing, rng, textures });
  }

  function finish() {
    phase = "done";
    panel.hidden = true;
    belay.detach();
    if (stand) { stand.dispose(); stand = null; }
    const first = save.completeBriefing();
    if (events && first) events.emit("briefing:completed", {});
  }

  return {
    get active() { return phase === "dialogue" || phase === "practiceGate"; },
    get phase() { return phase; },

    /** Called right after the kassa confirms, unless `save.data.briefingDone` already. */
    start() {
      if (save.data.briefingDone || phase !== "idle") return;
      ensureStand();
      phase = "dialogue";
      step = 0;
      render();
    },

    /** Gameplay-phase update: E advances the dialogue; near the stand, the real ritual gates it. */
    update() {
      if (phase === "dialogue") {
        if (input.pressed("interact")) {
          step += 1;
          if (step >= STEP_KEYS.length) phase = "practiceGate";
          render();
        }
        return;
      }
      if (phase !== "practiceGate") return;
      const dist = stand ? player.position.distanceTo(stand.clipAnchor) : Infinity;
      const classic = belay.mode === "classic";
      if (dist <= CLIP_RANGE && player.mode === "ground" && (input.pressed("clip") || (classic && input.pressed("clip2")))) {
        belay.clipTo(PRACTICE_ANCHOR_ID, classic && input.pressed("clip2") ? "B" : "A");
      }
      if (belay.bothOnSameAnchor() && belay.currentAnchor() === PRACTICE_ANCHOR_ID) finish();
    },

    /** Autoplay hook (`?autoplay=1`): skip the walk-and-clip, no fragile bot navigation needed. */
    completeForBot() {
      if (phase === "done") return;
      if (save.data.briefingDone) { phase = "done"; return; }
      ensureStand();
      belay.detach();
      finish();
    },

    dispose() {
      panel.remove();
      if (stand) stand.dispose();
    },
  };
}

/** Practice stand near the spawn hub, opposite the mean bearing of every route entry (clear of the fan). */
function placement(parkDef, terrain) {
  const hub = terrain.hubs[0];
  let sx = 0, sz = 0;
  for (const route of parkDef.routes) {
    const bearing = Math.atan2(route.entry.x - hub.x, route.entry.z - hub.z);
    sx += Math.sin(bearing);
    sz += Math.cos(bearing);
  }
  const away = Math.atan2(sx, sz) + Math.PI;         // the empty side of the hub, away from every route
  const dist = Math.min(hub.radius * 0.4, 7);
  const x = hub.x + Math.sin(away) * dist;
  const z = hub.z + Math.cos(away) * dist;
  return { x, y: terrain.heightAt(x, z), z, facing: away + Math.PI };
}
