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
  // M2b parameter variants (js/elements/catalogue-data.js#CATALOGUE_VARIANTS) – `element.kind` reports
  // the variant kind itself (js/elements/element.js#registerElementVariant leaves `spec.kind` alone),
  // so each one needs its own prompt label instead of silently falling back to the base kind's.
  "burma-narrow": "element.burmaNarrow",
  "planks-long-gap": "element.planksLongGap",
  "net-steep": "element.netSteep",
  "beam-swing-4seg": "element.beamSwing4seg",
  "stirrups-wide": "element.stirrupsWide",
  "rings-far": "element.ringsFar",
  "barrels-3": "element.barrels3",
  "skate-long": "element.skateLong",
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
  /** Category gate (GDD §3.12): shown instead of the clip prompt at a locked route's entry anchor. */
  locked: (category) => t(category === "legendary" ? "notice.lockedLegendary" : category === "black" ? "notice.lockedBlack" : "notice.lockedRed"),
  /** Einschulung gate (M1.3): shown instead of the clip prompt until the practice gate is done. */
  get briefingRequired() { return t("notice.briefingRequired"); },
  /** Ticket gate (M1.5): no ticket, or the day's ticket has run out (js/game/ticket.js). */
  get noTicket() { return t("notice.noActiveTicket"); },
  /** Occupancy gate (M1.6): a guest is already on this element (js/game/occupancy.js, cap 1). */
  get waitForClimber() { return t("notice.waitForClimber"); },
  /** Continuous belay (M2b, GDD §3.3): shown once per route, right after the entry clip. */
  get continuousHint() { return t("notice.continuousBelay"); },
  /** Weather evacuation (M3b, js/game/operations.js): shown instead of any clip/step-on prompt. */
  get evacuated() { return t("notice.stormEvacuated"); },
});

/** The player's own id in js/game/occupancy.js's ledgers – guests are always "guest-<n>" (js/npc/agents.js). */
const PLAYER_HOLDER_ID = "player";

/**
 * @param {{ player, input, belay, course, hud?, events?, vitals?, save?, ticket?, occupancy?, rescue?, operations? }} options
 *   `save` gates category entry anchors (GDD §3.12) and the Einschulung practice gate (M1.3) – omit it
 *   (dev harnesses, older tests) and nothing is ever locked. `ticket` gates every anchor once a day is
 *   over (M1.5, js/game/ticket.js) – omit it and clipping is never refused for lack of a ticket.
 *   `occupancy` (M1.6, js/game/occupancy.js) makes the player take a slot on an element like every
 *   guest does – omit it and stepping onto an element is never refused for lack of room. `rescue` (M3b,
 *   js/game/rescue.js) lets the player share a panicked guest's own element slot while an active rescue
 *   targets it – omit it and occupancy is never relaxed. `operations` (M3b, js/game/operations.js)
 *   refuses every new clip-in during a storm evacuation with its own notice – omit it and weather never
 *   gates the belay.
 * @returns {{ update(dt: number): void, prompt: string|null, anchor: object|null,
 *   entry: {element: object, end: string}|null, dispose(): void }}
 */
export function createInteraction({ player, input, belay, course, hud = null, events = null, vitals = null, save = null, ticket = null, occupancy = null, rescue = null, operations = null }) {
  const chest = new THREE.Vector3();
  let prompt = null;
  let heldElementId = null;   // the element the player currently occupies, for js/game/occupancy.js
  let anchor = null;
  let entry = null;
  // Continuous belay (M2b): which routes' entry anchors have already shown the one-time "no
  // re-clipping" hint this session – keyed by the entry anchor id, so every distinct route still gets
  // it once, the first time it is used.
  const continuousHintShownFor = new Set();

  /** The category this anchor's route is gated behind, or null if it is an entry anchor and unlocked/not an entry at all. */
  const lockedCategoryOf = (anchorId) => {
    if (!save) return null;
    const route = course.routes.find((r) => r.ladderAnchorId === anchorId);
    return route && !save.isUnlocked(route.category) ? route.category : null;
  };

  /** Einschulung (M1.3): a route's entry cable refuses the ritual until the practice gate is done. */
  const briefingRequiredAt = (anchorId) => {
    if (!save || save.data.briefingDone) return false;
    return course.routes.some((r) => r.ladderAnchorId === anchorId);
  };

  /** Ticket gate (M1.5): no new clip-in once the day has no active, unexpired ticket. */
  const ticketBlocks = () => !!ticket && !ticket.clippable;

  /** Weather evacuation (M3b, GDD §4 "Gewitter = Räumung"): no new clip-in while the park is cleared. */
  const evacuating = () => !!operations && operations.isEvacuating();

  /** Occupancy gate (M1.6): someone else (a guest) is already on this element – RULES.maxPerElement
   *  is 1, shared with js/npc/agents.js via js/game/occupancy.js. The ladder is deliberately not
   *  gated here (see this module's own header note on scope – guests queue for it among themselves,
   *  but a human is not expected to "wait its turn" behind an NPC on a rail as short as the ladder).
   *  M3b: an active rescue (js/game/rescue.js) shares its one target element's slot with the player –
   *  "guests yield" for that element only, everywhere else the normal cap-1 rule still applies. */
  const elementBlockedByGuest = (element) => {
    if (!occupancy || !element) return false;
    if (rescue && rescue.isTarget(element.id)) return false;
    const holder = occupancy.holderOfElement(element.id);
    return holder != null && holder !== PLAYER_HOLDER_ID;
  };

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
    if (readyToStepOn()) {
      if (evacuating() && !(rescue && rescue.isTarget(next.element.id))) return PROMPTS.evacuated;
      if (elementBlockedByGuest(next.element)) return PROMPTS.waitForClimber;
      return next.element.enterPrompt || PROMPTS.stepOn(next.element);
    }
    if (anchor) {
      const locked = lockedCategoryOf(anchor.id);
      if (locked) return PROMPTS.locked(locked);
      if (briefingRequiredAt(anchor.id)) return PROMPTS.briefingRequired;
      if (!established(anchor.id) && evacuating()) return PROMPTS.evacuated;
      if (!established(anchor.id) && ticketBlocks()) return PROMPTS.noTicket;
      if (!established(anchor.id)) return belay.pendingAnchor() === anchor.id ? PROMPTS.clipSecond : PROMPTS.clipIn;
    }
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
    // M3b: a rescue target is shared with whichever guest still holds it (see `elementBlockedByGuest`)
    // – the player never claims it themselves, so releasing it later never fights the guest's own hold.
    if (occupancy && !(rescue && rescue.isTarget(element.id))) { occupancy.claimElement(element.id, PLAYER_HOLDER_ID); heldElementId = element.id; }
    player.setState(element.playerState || "element", { element, fromEnd: end, t: end === "exit" ? 1 : 0 });
    if (events) events.emit("player:interact", { what: element.kind, element: element.id, end });
  }

  /**
   * Continuous mode (M2b, GDD §3.3 "Durchlaufend … kein Umhängen"): once the belay is established
   * anywhere on the route, every later platform/element transition happens on its own – there is no
   * ritual left to click, and js/game/clip-meter.js is told separately to ignore it entirely (there is
   * nothing to be fast or slow at). The very first clip-in at the route's entry deck stays a real
   * keypress (`handleInput` below) – "entering a route clips once at the entry" – so a player still
   * consciously starts each route.
   */
  function autoAdvanceContinuous() {
    if (belay.mode !== "continuous" || !anchor || belay.currentAnchor() == null) return;
    if (established(anchor.id)) return;
    if (lockedCategoryOf(anchor.id) || briefingRequiredAt(anchor.id) || ticketBlocks()) return;
    belay.attach(anchor.id);
  }

  function handleInput() {
    // element, fall and zipline read the keys themselves and must not have them eaten here
    if (player.mode === "element" || player.mode === "fall" || player.mode === "zipline") return;
    const classic = belay.mode === "classic";
    if (anchor && (input.pressed("clip") || (classic && input.pressed("clip2")))) {
      if (lockedCategoryOf(anchor.id)) return;         // refused: the route's category is not unlocked yet
      if (briefingRequiredAt(anchor.id)) return;       // refused: the Einschulung practice gate is not done
      if (!established(anchor.id) && evacuating()) return;     // refused: storm evacuation in progress
      if (!established(anchor.id) && ticketBlocks()) return;   // refused: no active, unexpired ticket
      const firstClipOfRoute = belay.mode === "continuous" && belay.currentAnchor() == null;
      belay.clipTo(anchor.id, classic && input.pressed("clip2") ? "B" : "A");
      if (firstClipOfRoute && hud && !continuousHintShownFor.has(anchor.id)) {
        continuousHintShownFor.add(anchor.id);
        hud.setNotice(PROMPTS.continuousHint, 5);
      }
      return;
    }
    if (!input.pressed("interact") || player.mode !== "ground" || justSwitched()) return;
    if (readyToStepOn()) {
      const target = startable().element;
      const isRescueTarget = !!(rescue && rescue.isTarget(target.id));
      if (evacuating() && !isRescueTarget) return;   // refused: storm evacuation in progress
      if (elementBlockedByGuest(target)) return;     // refused: a guest already holds this element
      stepOntoElement();
      return;
    }
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
      // The rail state's own exit() already ran in the physics phase (js/player/on-element.js) by the
      // time this runs – release the slot exactly one frame later, however the climber left it
      // (finished, slipped into "fall", …): see js/game/occupancy.js's header for why that is fine.
      if (occupancy && heldElementId && player.mode !== "element") { occupancy.releaseElement(heldElementId, PLAYER_HOLDER_ID); heldElementId = null; }
      const onFoot = player.mode === "ground";
      chest.copy(player.position);
      chest.y += INTERACTION.chestHeight;
      entry = onFoot ? course.nearestEntry(player.position, INTERACTION.stepRange) : null;
      anchor = onFoot ? reachableAnchor() : null;
      if (onFoot) autoAdvanceContinuous();
      handleInput();
      prompt = resolvePrompt();
      if (!hud) return;
      const state = belay.state();
      hud.setBelay(state.A.state, state.B.state);
      hud.setPrompt(prompt);
    },

    dispose() {
      if (occupancy && heldElementId) { occupancy.releaseElement(heldElementId, PLAYER_HOLDER_ID); heldElementId = null; }
      anchor = null; entry = null; prompt = null;
    },
  };
  return api;
}
