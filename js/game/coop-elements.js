// Pure helpers for local co-op (ROADMAP M4, GDD §3.11) – no THREE, no DOM, so every formula here is
// unit-testable (tests/unit/coop.test.mjs) the same way js/game/flow.js is. js/game/coop.js, js/elements/
// counterweight-lift.js and js/elements/team-bridge.js are the callers; none of them can themselves be
// imported under plain `node --test` (they pull in THREE transitively – js/elements/catalogue-data.js's
// header explains why), so the arithmetic that matters lives here instead, once, and they just call it.
import { COOP, COOP_ELEMENTS } from "../config.js";

/** The element a player is currently riding/crossing, or null (on foot, on a ladder, in the harness). */
export function currentElementOf(player) {
  if (player.mode !== "element" && player.mode !== "zipline") return null;
  const state = player.states.get(player.mode);
  return state && state.element ? state.element : null;
}

/**
 * "The same element, or two elements that share a support tree" (GDD §3.11 "jump onto the bridge
 * a friend is standing on"): identical, or one's exit platform is the other's entry (consecutive edges
 * of the same route), or both start from the same platform (a junction). Every one of those is "the
 * same tree feels both of you".
 */
export function elementsShareSupport(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const aEntry = a.getEntryAnchor().platformId, aExit = a.getExitAnchor().platformId;
  const bEntry = b.getEntryAnchor().platformId, bExit = b.getExitAnchor().platformId;
  return aExit === bEntry || bExit === aEntry || aEntry === bEntry;
}

/**
 * Shared physics opt-in (GDD §3.11/§4 "jump onto the bridge … allowed in the game when the group
 * switches it on"): each frame, a fraction of one linked element's current wobble *velocity* becomes an
 * excitation on the other's – the same shape js/elements/element.js#update already uses for its own
 * wind-gust coupling (`excite(gust * gain * dt)`), so this stays bounded and dt-scaled rather than an
 * unbounded per-frame snap. Symmetric: each nudges the other by `scale` (default 0.6, i.e. "60%").
 * @param {object|null} elementA
 * @param {object|null} elementB
 * @param {number} dt
 * @param {number} [scale]
 */
export function applySharedPhysics(elementA, elementB, dt, scale = 0.6) {
  if (!elementA || !elementB || elementA === elementB || !(dt > 0)) return;
  elementA.wobble.excite(elementB.wobble.lateralVelocity * scale * dt, elementB.wobble.verticalVelocity * scale * dt);
  elementB.wobble.excite(elementA.wobble.lateralVelocity * scale * dt, elementA.wobble.verticalVelocity * scale * dt);
}

/** On foot and within helper range of `stand` (an entry/exit anchor's stand point). */
export function isHelperInRange(player, stand) {
  return player.mode === "ground" && player.position.distanceTo(stand) <= COOP_ELEMENTS.helperRange;
}

/** Every `counterweight-lift`/`team-bridge` element currently built into the course, by kind. */
export function findCoopElements(course) {
  const lifts = [], bridges = [];
  for (const route of course.routes) {
    for (const element of route.elements) {
      if (element.kind === "counterweight-lift") lifts.push(element);
      else if (element.kind === "team-bridge") bridges.push(element);
    }
  }
  return { lifts, bridges };
}

// --- counterweight lift: haul math (js/elements/counterweight-lift.js) -----------------------------

/** One frame of haul-charge decay – always running, taps (`addHaulCharge`) are the only thing that add to it. */
export function decayHaulCharge(haulCharge, dt, cfg) {
  return Math.max(0, haulCharge - cfg.haulDecayPerSecond * dt);
}

/** A helper's W-tap (js/game/coop.js's own [interact] mapping) – clamped so it can never run away. */
export function addHaulCharge(haulCharge, boost, cfg) {
  return Math.min(cfg.maxSpeed, haulCharge + boost);
}

/** The rider's effective speed this instant: `selfHaulSpeed` is always available (solo-passable, GDD
 *  "sandbag preloaded"), `haulCharge` on top of it is only ever there because someone hauled. */
export function counterweightSpeed(haulCharge, cfg) {
  return Math.min(cfg.maxSpeed, cfg.selfHaulSpeed + haulCharge);
}

// --- team bridge: tension damping (js/elements/team-bridge.js) --------------------------------------

/** The footstep-kick multiplier: 1 normally, `COOP_ELEMENTS.teamBridge.tensionKickScale` (-60%) while
 *  the *other* climber holds the tension rope at either post. */
export function teamBridgeKickScale(tensionHeld, scale = COOP_ELEMENTS.teamBridge.tensionKickScale) {
  return tensionHeld ? scale : 1;
}

// --- the "stay together" leash (js/game/coop.js) ----------------------------------------------------

/**
 * Player 2's own move-input scale, 0..1: 1 up to `cfg.startM` separation, then ramping down to
 * `cfg.minFactor` over the next `cfg.maxExtraM` metres – never a hard stop (GDD §3.11, ADR-030's
 * "damped, not frozen" compromise instead of splitscreen).
 * @param {number} separationM
 * @param {typeof COOP.leash} [cfg]
 */
export function leashFactor(separationM, cfg = COOP.leash) {
  const over = separationM - cfg.startM;
  if (over <= 0) return 1;
  return Math.max(cfg.minFactor, 1 - over / cfg.maxExtraM);
}

// --- the shared run: which route (if any), and who just finished it (js/game/coop.js) ---------------

/**
 * Which route (if any) both climbers are attempting together, from each one's own last-clipped ladder
 * anchor id (sticky in the caller until they clip a *different* route's – this function itself is a
 * single, stateless frame of that: same anchor on both sides, resolved to a route, or null.
 * @param {string|null} p1LadderAnchorId
 * @param {string|null} p2LadderAnchorId
 * @param {(anchorId: string) => {id: string}|null} routeOfLadderAnchor
 * @returns {string|null}
 */
export function sharedRouteId(p1LadderAnchorId, p2LadderAnchorId, routeOfLadderAnchor) {
  if (!p1LadderAnchorId || p1LadderAnchorId !== p2LadderAnchorId) return null;
  const route = routeOfLadderAnchor(p1LadderAnchorId);
  return route ? route.id : null;
}

/**
 * True the one frame a climber's current element becomes null right after it was the shared route's
 * own zip (any leg, `${routeId}-zip`/`${routeId}-zip2`) – "just reached the end together" for the
 * stamp-card companion badge. Pure given the two element ids as plain strings/null.
 * @param {string|null} previousElementId what `currentElementOf(player)` reported last frame
 * @param {string|null} currentElementId what it reports this frame
 * @param {string|null} sharedRouteIdValue
 */
export function justFinishedSharedZip(previousElementId, currentElementId, sharedRouteIdValue) {
  return !currentElementId && !!previousElementId && !!sharedRouteIdValue && previousElementId.startsWith(`${sharedRouteIdValue}-zip`);
}
