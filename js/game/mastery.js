// Mastery stamps per route (ROADMAP M2a, GDD §3.12): four tiers evaluated once, at the moment a route
// is finished – completed / no falls / under par / in flow. Pure logic, no DOM/THREE, so the same
// evaluator runs in js/game/session.js and in tests/unit/mastery-adjacent assertions.
import { MASTERY } from "../config.js";

export { MASTERY };

/**
 * @param {{ falls: number, seconds: number, parS: number|null, averageFlow: number }} run
 * @returns {boolean[]} four booleans in `MASTERY.tierOrder` order – completed is always true (this is
 *   only ever called on a finished run); `underPar` is false when the route has no `parS` estimate.
 */
export function evaluateMastery({ falls, seconds, parS, averageFlow }) {
  return [
    true,                                                          // completed – finishing is what got us here
    falls === 0,                                                    // noFalls
    Number.isFinite(parS) && parS > 0 && seconds <= parS,           // underPar
    averageFlow >= MASTERY.inFlowAverage,                           // inFlow
  ];
}

/** Merge a freshly evaluated tier set into whatever the save already has – a badge earned once stays earned. */
export function mergeTiers(previous, current) {
  const base = previous && previous.length === current.length ? previous : current.map(() => false);
  return base.map((was, i) => was || current[i]);
}
