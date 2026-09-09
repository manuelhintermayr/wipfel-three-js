// Equipment sidegrades (ticket desk "Equipment" row, ROADMAP M2a, GDD §3.12: "equipment as sidegrade").
// Exactly one may be selected, or none – a plain closure variable behind a getter, the same shape
// js/player/belay.js#setMode and js/player/assist.js already use for a live, ticket-desk-driven choice that
// every call site reads fresh instead of a rebuilt player state. Each sidegrade trades one axis for
// another (SIDEGRADES in js/config.js documents exactly what and where); nothing here is a flat upgrade.
import { SIDEGRADES } from "../config.js";

let selectedId = null;

const NEUTRAL = Object.freeze({
  gripDrainScale: 1, reclipSecondsPenalty: 0,
  balanceDisturbanceScale: 1, pullUpDrainScale: 1,
  zipDragScale: 1, zipBrakeZoneScale: 1,
});

/** Ticket desk confirm / options screen (once unlocked): `null` clears the selection. */
export function setSidegrade(id) {
  selectedId = id != null && SIDEGRADES[id] ? id : null;
}

export function getSidegrade() { return selectedId; }

/**
 * Current effect scales – read fresh every call, never cached, so a ticket desk change between days applies
 * at once. Every field is 1 (or 0 for the additive penalty) when nothing is equipped, so every call
 * site can multiply/add unconditionally without an `if (sidegrade)` guard.
 */
export function sidegradeEffects() {
  const gear = selectedId ? SIDEGRADES[selectedId] : null;
  if (!gear) return NEUTRAL;
  return {
    gripDrainScale: gear.gripDrainScale ?? NEUTRAL.gripDrainScale,
    reclipSecondsPenalty: gear.reclipSecondsPenalty ?? NEUTRAL.reclipSecondsPenalty,
    balanceDisturbanceScale: gear.balanceDisturbanceScale ?? NEUTRAL.balanceDisturbanceScale,
    pullUpDrainScale: gear.pullUpDrainScale ?? NEUTRAL.pullUpDrainScale,
    zipDragScale: gear.zipDragScale ?? NEUTRAL.zipDragScale,
    zipBrakeZoneScale: gear.zipBrakeZoneScale ?? NEUTRAL.zipBrakeZoneScale,
  };
}
