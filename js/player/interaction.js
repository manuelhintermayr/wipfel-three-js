// What happens when the player stands in front of something and presses a key: the belay ritual at
// an anchor (F / gamepad X, plus X for the second carabiner in classic mode) and stepping onto the
// block ladder (E). Owns the context prompt text; the belay logic itself is in js/player/belay.js and
// the geometry in js/park/first-course.js.
import * as THREE from "three";
import { FIRST_COURSE } from "../park/first-course.js";

export const INTERACTION = Object.freeze({
  chestHeight: 1.25,                 // anchors are judged from the harness, not from the feet
  clipRange: FIRST_COURSE.interactRange,
  ladderRange: FIRST_COURSE.ladderRange,
});

/** UI strings; they move to assets/strings/*.json with i18n in M0.7. */
export const PROMPTS = Object.freeze({
  clipIn: "Clip in [F]",
  clipSecond: "Clip second carabiner [F]",
  climb: "Climb [E]",
  onLadder: "Climb [W]  ·  Down [S]",
});

/**
 * @param {{ player, input, belay, course, hud?, events? }} options
 * @returns {{ update(dt: number): void, prompt: string|null, anchor: object|null, dispose(): void }}
 */
export function createInteraction({ player, input, belay, course, hud = null, events = null }) {
  const chest = new THREE.Vector3();
  const classic = belay.mode === "classic";
  let prompt = null;
  let anchor = null;

  const atLadderBase = () => player.position.distanceTo(course.ladder.rail.start) <= INTERACTION.ladderRange;
  const clippedToLadderCable = () => belay.currentAnchor() === course.ladderAnchorId;
  const established = (id) => belay.currentAnchor() === id && belay.bothOnSameAnchor();

  /** What the player could do right now, in the order the park would tell them to do it. */
  function resolvePrompt() {
    if (player.mode === "ladder") return PROMPTS.onLadder;
    if (anchor && !established(anchor.id)) return belay.pendingAnchor() === anchor.id ? PROMPTS.clipSecond : PROMPTS.clipIn;
    if (clippedToLadderCable() && atLadderBase() && player.mode === "ground") return PROMPTS.climb;
    return null;
  }

  function handleInput() {
    if (anchor && (input.pressed("clip") || (classic && input.pressed("clip2")))) {
      belay.clipTo(anchor.id, classic && input.pressed("clip2") ? "B" : "A");
      return;
    }
    if (input.pressed("interact") && player.mode === "ground" && clippedToLadderCable() && atLadderBase()) {
      player.climbLadder(course.ladder);
      if (events) events.emit("player:interact", { what: "ladder" });
    }
  }

  const api = {
    get prompt() { return prompt; },
    get anchor() { return anchor; },

    /** Gameplay phase, once per frame, after the player has moved. */
    update() {
      chest.copy(player.position);
      chest.y += INTERACTION.chestHeight;
      anchor = player.mode === "ladder" ? null : course.nearestAnchor(chest, INTERACTION.clipRange);
      handleInput();
      prompt = resolvePrompt();
      if (!hud) return;
      const state = belay.state();
      hud.setBelay(state.A.state, state.B.state);
      hud.setPrompt(prompt);
    },

    dispose() { anchor = null; prompt = null; },
  };
  return api;
}
