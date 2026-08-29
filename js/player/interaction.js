// What happens when the player stands in front of something and presses a key: the belay ritual at
// an anchor (F / gamepad X, plus X for the second carabiner in classic mode), stepping onto the
// block ladder (E) and – since M0.5 – stepping onto an exercise (E), which the park only allows once
// both carabiners are on that exercise's lifeline. Owns the context prompt text; the belay logic is
// in js/player/belay.js, the geometry in js/park/loader.js, and the states themselves in
// js/player/{climb-ladder,on-element,fall}.js.
import * as THREE from "three";
import { LOADER } from "../park/loader.js";
import { t } from "../core/i18n.js";

export const INTERACTION = Object.freeze({
  chestHeight: 1.25,                 // anchors are judged from the harness, not from the feet
  clipRange: LOADER.interactRange,
  ladderRange: LOADER.ladderRange,
  stepRange: LOADER.stepRange,
});

/** Prompt text comes from i18n (assets/strings/*.json); labels resolve per element kind. */
const ELEMENT_LABEL_KEYS = Object.freeze({
  "burma-bridge": "element.burma",
  "hanging-planks": "element.planks",
  "net-bridge": "element.net",
  "zipline": "element.zipline",
  "beam-fixed": "element.beamFixed",
  "beam-swing": "element.beamSwing",
  "stirrups": "element.stirrups",
  "wire-loops": "element.wireLoops",
  "barrels": "element.barrels",
  "rings": "element.rings",
  "tarzan": "element.tarzan",
  "skate": "element.skate",
});
export const PROMPTS = Object.freeze({
  get clipIn() { return t("prompt.clipIn"); },
  get clipSecond() { return t("prompt.clipSecond"); },
  get clipFirst() { return t("prompt.clipFirst"); },
  get climb() { return t("prompt.climb"); },
  get onLadder() { return t("prompt.onLadder"); },
  get onElement() { return t("prompt.onElement"); },
  get frozen() { return t("prompt.frozen"); },
  get hanging() { return t("prompt.hanging"); },
  get rescue() { return t("prompt.rescue"); },
  stepOn: (element) => t("prompt.stepOn", { label: t(ELEMENT_LABEL_KEYS[element.kind] || "element.burma") }),
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

  /** The ladder the belay is currently clipped to, whichever of the six routes that is – or null. */
  const clippedLadder = () => course.ladderFor(belay.currentAnchor());
  const atLadderBase = () => { const l = clippedLadder(); return !!l && player.position.distanceTo(l.rail.start) <= INTERACTION.ladderRange; };
  const clippedToLadderCable = () => !!clippedLadder();
  const established = (id) => belay.currentAnchor() === id && belay.bothOnSameAnchor();
  /** The end of an exercise you may set off from – a one-way element (a zip line) only has one. */
  const startable = () => (entry && !(entry.element.oneWay && entry.end === "exit") ? entry : null);
  const readyToStepOn = () => { const e = startable(); return !!e && established(e.element.lifeline.anchorId); };
  /** True on the very frame a state was entered – E must not be consumed twice. */
  const justSwitched = () => player.states.time <= 0;

  /**
   * The anchor F would work on. Standing at the deck edge in front of an exercise that exercise's
   * lifeline wins, even though the platform ring may be nearer – the ring circles the trunk and
   * would otherwise swallow every clip on a small deck. The anchor the belay is *already*
   * established on is never a target: what anyone wants there is the way onwards (the platform
   * ring, or the stub on the zip line's landing deck).
   */
  function reachableAnchor() {
    const settled = belay.bothOnSameAnchor() ? belay.currentAnchor() : null;
    const next = startable();
    if (next && next.element.lifeline.anchorId !== settled) {
      const lifeline = course.anchorById(next.element.lifeline.anchorId);
      if (lifeline) return lifeline;
    }
    return course.nearestAnchor(chest, INTERACTION.clipRange, settled);
  }

  /** Hanging in the harness: what the climber can still do about it. */
  function fallPrompt() {
    const state = player.states.get("fall");
    return state && state.canRescue ? PROMPTS.rescue : PROMPTS.hanging;
  }

  /** What the player could do right now, in the order the park would tell them to do it. */
  function resolvePrompt() {
    if (player.mode === "fall") return fallPrompt();
    const state = player.states.get();
    if (state && state.prompt) return state.prompt;          // a state that speaks for itself (zipline)
    if (vitals && vitals.nerves.frozen) return PROMPTS.frozen;
    if (player.mode === "element") return PROMPTS.onElement;
    if (player.mode === "ladder") return PROMPTS.onLadder;
    const next = startable();
    if (readyToStepOn()) return next.element.enterPrompt || PROMPTS.stepOn(next.element);
    if (anchor && !established(anchor.id)) return belay.pendingAnchor() === anchor.id ? PROMPTS.clipSecond : PROMPTS.clipIn;
    if (next) return next.element.clipPrompt || PROMPTS.clipFirst;
    if (clippedToLadderCable() && atLadderBase() && player.mode === "ground") return PROMPTS.climb;
    return null;
  }

  /**
   * Onto the exercise – but only clipped in, exactly like the trainer teaches it. An element names
   * the state that takes over (`playerState`), so the Flying Fox lands in "zipline" and everything
   * on rails in "element" without this module knowing what either of them is.
   */
  function stepOntoElement() {
    const { element, end } = startable();
    player.setState(element.playerState || "element", { element, fromEnd: end, t: end === "exit" ? 1 : 0 });
    if (events) events.emit("player:interact", { what: element.kind, element: element.id, end });
  }

  function handleInput() {
    // element, fall and zipline read the keys themselves and must not have them eaten here
    if (player.mode === "element" || player.mode === "fall" || player.mode === "zipline") return;
    if (anchor && (input.pressed("clip") || (classic && input.pressed("clip2")))) {
      belay.clipTo(anchor.id, classic && input.pressed("clip2") ? "B" : "A");
      return;
    }
    if (!input.pressed("interact") || player.mode !== "ground" || justSwitched()) return;
    if (readyToStepOn()) { stepOntoElement(); return; }
    const ladder = clippedLadder();
    if (ladder && atLadderBase()) {
      player.climbLadder(ladder);
      if (events) events.emit("player:interact", { what: "ladder", anchorId: belay.currentAnchor() });
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
