// What happens when the player stands in front of something and presses a key: the belay ritual at
// an anchor (F / gamepad X, plus X for the second carabiner in classic mode), stepping onto the
// block ladder (E) and – since M0.5 – stepping onto an exercise (E), which the park only allows once
// both carabiners are on that exercise's lifeline. Owns the context prompt text; the belay logic is
// in js/player/belay.js, the geometry in js/park/first-course.js, and the states themselves in
// js/player/{climb-ladder,on-element,fall}.js.
import * as THREE from "three";
import { FIRST_COURSE } from "../park/first-course.js";

export const INTERACTION = Object.freeze({
  chestHeight: 1.25,                 // anchors are judged from the harness, not from the feet
  clipRange: FIRST_COURSE.interactRange,
  ladderRange: FIRST_COURSE.ladderRange,
  stepRange: FIRST_COURSE.stepRange,
});

/** UI strings; they move to assets/strings/*.json with i18n in M0.7. */
export const PROMPTS = Object.freeze({
  clipIn: "Clip in [F]",
  clipSecond: "Clip second carabiner [F]",
  clipFirst: "Clip to the cable first [F]",
  climb: "Climb [E]",
  onLadder: "Climb [W]  ·  Down [S]",
  onElement: "Go [W]  ·  Lean [A][D]  ·  Hold [Q][RMB]  ·  Breathe [R]",
  frozen: "Breathe [R]  ·  hold until the hands stop shaking",
  hanging: "Pull up [Space]  ·  Haul [W][S]",
  rescue: "Pull up [Space]  ·  Haul [W][S]  ·  Rescue [E]",
  stepOn: (label) => `Step onto the ${label} [E]`,
});

/**
 * @param {{ player, input, belay, course, hud?, events?, vitals? }} options
 * @returns {{ update(dt: number): void, prompt: string|null, anchor: object|null,
 *   entry: {element: object, end: string}|null, dispose(): void }}
 */
export function createInteraction({ player, input, belay, course, hud = null, events = null, vitals = null }) {
  const chest = new THREE.Vector3();
  const classic = belay.mode === "classic";
  let prompt = null;
  let anchor = null;
  let entry = null;

  const atLadderBase = () => player.position.distanceTo(course.ladder.rail.start) <= INTERACTION.ladderRange;
  const clippedToLadderCable = () => belay.currentAnchor() === course.ladderAnchorId;
  const established = (id) => belay.currentAnchor() === id && belay.bothOnSameAnchor();
  const readyToStepOn = () => entry != null && established(entry.element.lifeline.anchorId);
  /** True on the very frame a state was entered – E must not be consumed twice. */
  const justSwitched = () => player.states.time <= 0;

  /**
   * The anchor F would work on. Standing at the deck edge in front of an exercise that exercise's
   * lifeline wins, even though the platform ring may be nearer – the ring circles the trunk and
   * would otherwise swallow every clip on a small deck.
   */
  function reachableAnchor() {
    if (entry) {
      const lifeline = course.anchorById(entry.element.lifeline.anchorId);
      if (lifeline) return lifeline;
    }
    return course.nearestAnchor(chest, INTERACTION.clipRange);
  }

  /** Hanging in the harness: what the climber can still do about it. */
  function fallPrompt() {
    const state = player.states.get("fall");
    return state && state.canRescue ? PROMPTS.rescue : PROMPTS.hanging;
  }

  /** What the player could do right now, in the order the park would tell them to do it. */
  function resolvePrompt() {
    if (player.mode === "fall") return fallPrompt();
    if (vitals && vitals.nerves.frozen) return PROMPTS.frozen;
    if (player.mode === "element") return PROMPTS.onElement;
    if (player.mode === "ladder") return PROMPTS.onLadder;
    if (anchor && !established(anchor.id)) return belay.pendingAnchor() === anchor.id ? PROMPTS.clipSecond : PROMPTS.clipIn;
    if (readyToStepOn()) return PROMPTS.stepOn(entry.element.label);
    if (entry) return PROMPTS.clipFirst;
    if (clippedToLadderCable() && atLadderBase() && player.mode === "ground") return PROMPTS.climb;
    return null;
  }

  /** Onto the exercise – but only clipped in, exactly like the trainer teaches it. */
  function stepOntoElement() {
    const { element, end } = entry;
    player.setState("element", { element, fromEnd: end, t: end === "exit" ? 1 : 0 });
    if (events) events.emit("player:interact", { what: "element", element: element.id, end });
  }

  function handleInput() {
    if (player.mode === "element" || player.mode === "fall") return;   // those states read input themselves
    if (anchor && (input.pressed("clip") || (classic && input.pressed("clip2")))) {
      belay.clipTo(anchor.id, classic && input.pressed("clip2") ? "B" : "A");
      return;
    }
    if (!input.pressed("interact") || player.mode !== "ground" || justSwitched()) return;
    if (readyToStepOn()) { stepOntoElement(); return; }
    if (clippedToLadderCable() && atLadderBase()) {
      player.climbLadder(course.ladder);
      if (events) events.emit("player:interact", { what: "ladder" });
    }
  }

  const api = {
    get prompt() { return prompt; },
    get anchor() { return anchor; },
    /** The exercise end the climber is standing in front of, or null. */
    get entry() { return entry; },

    /** Gameplay phase, once per frame, after the player has moved. */
    update() {
      const onFoot = player.mode === "ground";
      chest.copy(player.position);
      chest.y += INTERACTION.chestHeight;
      entry = onFoot ? course.nearestEntry(player.position, INTERACTION.stepRange) : null;
      anchor = onFoot ? reachableAnchor() : null;
      handleInput();
      prompt = resolvePrompt();
      if (!hud) return;
      const state = belay.state();
      hud.setBelay(state.A.state, state.B.state);
      hud.setPrompt(prompt);
    },

    dispose() { anchor = null; entry = null; prompt = null; },
  };
  return api;
}
