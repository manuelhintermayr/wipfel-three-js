// Belay logic: two carabiners on a Y-lanyard and the rule that makes a climbing park safe – you may
// never have both of them off the cable. Pure state machine, no three.js and no DOM, so it can be
// unit-tested (tests/unit/belay.test.mjs) and reused by NPCs later.
//
// Three modes (GDD / ADR: `?belay=` picks one):
//   "continuous" – one continuous cable, `attach(anchor)` moves the whole system in one press
//   "smart"      – the two-click ritual: press 1 moves the lead carabiner, press 2 the follower;
//                  the follower is locked while the lead is off, so both can never be open
//   "classic"    – the honest version: open and clip each carabiner yourself, and yes, you can get
//                  it wrong (`isSafe() === false`)
//
// Carabiner states: "clipped" (on an anchor), "locked" (closed, cannot be opened right now),
// "open" (off the anchor). `attachedTo` is the anchor id or null.

import { BELAY_MODES } from "../config.js";

export const CARABINERS = Object.freeze(["A", "B"]);
export { BELAY_MODES };

const other = (carabiner) => (carabiner === "A" ? "B" : "A");

/**
 * @param {{ mode?: "continuous"|"smart"|"classic", onEvent?: (e: {type: string, carabiner: string, anchor: string|null}) => void }} [options]
 * @returns {{ mode: string, state(), isSafe(), bothOnSameAnchor(), currentAnchor(), pendingAnchor(),
 *   clipTo(anchorId: string, carabiner?: string), attach(anchorId: string), open(carabiner: string),
 *   clip(carabiner: string, anchorId: string), detach(), reset(), setOnEvent(fn) }}
 *   `clipTo` is the one entry point the player code needs: it performs exactly one step of whatever
 *   ritual the current mode prescribes and returns `{ changed, step, carabiner, anchor }`.
 */
export function createBelay({ mode = "smart", onEvent = null } = {}) {
  if (!BELAY_MODES.includes(mode)) throw new Error(`belay: unknown mode '${mode}'`);
  const hooks = { onEvent };
  const gear = { A: { state: "open", attachedTo: null }, B: { state: "open", attachedTo: null } };
  let lead = "A";          // the carabiner that moves first in the smart ritual
  let anchor = null;       // anchor both carabiners agree on (the belay is established here)
  let pending = null;      // anchor the lead has already reached, waiting for the follower

  const emit = (type, carabiner) => {
    if (hooks.onEvent) hooks.onEvent({ type, carabiner, anchor: gear[carabiner] ? gear[carabiner].attachedTo : anchor });
  };
  const isSafe = () => !(gear.A.state === "open" && gear.B.state === "open");
  const bothOnSameAnchor = () => gear.A.attachedTo != null && gear.A.attachedTo === gear.B.attachedTo;

  /** Take a carabiner off whatever it holds. Reports "unsafe" the moment both are open. */
  function openCarabiner(carabiner) {
    gear[carabiner].state = "open";
    gear[carabiner].attachedTo = null;
    emit("open", carabiner);
    if (!isSafe()) emit("unsafe", carabiner);
    return true;
  }

  function clipCarabiner(carabiner, anchorId) {
    gear[carabiner].state = "clipped";
    gear[carabiner].attachedTo = anchorId;
    emit("click", carabiner);
    if (bothOnSameAnchor()) anchor = gear.A.attachedTo;
    return true;
  }

  /** One hand movement: open, travel, clip, click – atomic, so the pair is never both open. */
  function moveCarabiner(carabiner, anchorId) {
    openCarabiner(carabiner);
    clipCarabiner(carabiner, anchorId);
  }

  function lockCarabiner(carabiner) {
    if (gear[carabiner].state === "locked") return;
    gear[carabiner].state = "locked";
    emit("locked", carabiner);
  }

  const result = (changed, step = 0, carabiner = null, target = null) => ({ changed, step, carabiner, anchor: target });

  /** Smart mode: press 1 = lead crosses over, press 2 = follower follows. */
  function smartStep(anchorId) {
    if (pending == null) {
      if (anchor === anchorId && bothOnSameAnchor()) return result(false);
      lockCarabiner(other(lead));
      moveCarabiner(lead, anchorId);
      pending = anchorId;
      return result(true, 1, lead, anchorId);
    }
    const follower = other(lead);
    if (anchorId !== pending) {                       // player changed their mind – lead moves again
      moveCarabiner(lead, anchorId);
      pending = anchorId;
      return result(true, 1, lead, anchorId);
    }
    moveCarabiner(follower, anchorId);
    anchor = anchorId;
    pending = null;
    lead = follower;                                  // hands alternate, like in the real park
    return result(true, 2, follower, anchorId);
  }

  /** Continuous mode: one system, one press, both carabiners travel together. */
  function attach(anchorId) {
    if (mode !== "continuous") return result(false);
    if (anchor === anchorId && bothOnSameAnchor()) return result(false);
    for (const carabiner of CARABINERS) {
      gear[carabiner].state = "clipped";
      gear[carabiner].attachedTo = anchorId;
    }
    anchor = anchorId;
    pending = null;
    emit("click", "A");
    return result(true, 1, "A", anchorId);
  }

  return {
    mode,

    /** Immutable snapshot for the HUD and for tests. */
    state() {
      return Object.freeze({
        mode,
        A: Object.freeze({ ...gear.A }),
        B: Object.freeze({ ...gear.B }),
        anchor, pending, lead,
        safe: isSafe(),
      });
    },

    isSafe,
    bothOnSameAnchor,
    /** The anchor the belay is established on – only changes once both carabiners arrived. */
    currentAnchor() { return anchor; },
    /** Target of a half-finished ritual (the lead is already there), else null. */
    pendingAnchor() { return pending; },

    /**
     * The player pressed the clip key. Performs exactly one step of the current mode's ritual.
     * @param {string} anchorId
     * @param {"A"|"B"} [carabiner] classic mode only: which carabiner the key belongs to
     */
    clipTo(anchorId, carabiner = "A") {
      if (!anchorId) return result(false);
      if (mode === "continuous") return attach(anchorId);
      if (mode === "smart") return smartStep(anchorId);
      if (gear[carabiner].state === "open") {         // classic: press once to open, once to clip
        clipCarabiner(carabiner, anchorId);
        return result(true, 2, carabiner, anchorId);
      }
      openCarabiner(carabiner);
      return result(true, 1, carabiner, null);
    },

    attach,

    /** Classic mode only – take one carabiner off. Both open is allowed here, and unsafe. */
    open(carabiner) {
      if (mode !== "classic" || !gear[carabiner] || gear[carabiner].state === "open") return false;
      return openCarabiner(carabiner);
    },

    /** Classic mode only – clip one carabiner onto an anchor. */
    clip(carabiner, anchorId) {
      if (mode !== "classic" || !gear[carabiner] || !anchorId) return false;
      return clipCarabiner(carabiner, anchorId);
    },

    /** Leave the system (back on the ground): both carabiners come off. */
    detach() {
      if (gear.A.attachedTo == null && gear.B.attachedTo == null && gear.A.state === "open" && gear.B.state === "open") return false;
      for (const carabiner of CARABINERS) { gear[carabiner].state = "open"; gear[carabiner].attachedTo = null; }
      anchor = null;
      pending = null;
      emit("open", "A");
      return true;
    },

    reset() {
      for (const carabiner of CARABINERS) { gear[carabiner].state = "open"; gear[carabiner].attachedTo = null; }
      lead = "A";
      anchor = null;
      pending = null;
    },

    setOnEvent(fn) { hooks.onEvent = fn; },
  };
}
