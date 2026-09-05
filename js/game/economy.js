// Economy + rating (ROADMAP M3b, GDD §4 "Ökonomie", RESEARCH-DATA §7 "Fixkosten vorne, variable Kosten
// je Gast gering"). Pure formulas below (route build cost, admission income, word-of-mouth guest count,
// rating clamp with the signature bonus) plus a thin stateful wrapper around js/core/save.js#data.economy
// (additive, versioned – this module never touches localStorage itself, only `save.updateEconomy`).
//
// Deliberate scope cut, documented: the live NPC roster (js/npc/agents.js) is a fixed-size simulation
// for the whole session, not rebuilt per in-game day – so "guests today"/admission income here is a
// *modelled* number (this file's own word-of-mouth formula), not a literal count of wandering guests.
// Rebuilding the crowd every day is a natural follow-up, out of scope for this milestone.
import { ECONOMY } from "../config.js";
import { Rng } from "../core/rng.js";

/** Pure: one-time cost to open a new route from the builder, within GDD's own "~40-50k" band. */
export function computeRouteBuildCost(category, lengthM) {
  const base = ECONOMY.routeBuildCostBase[category] ?? ECONOMY.routeBuildCostBase.blue;
  return Math.round(base + Math.max(0, lengthM) * ECONOMY.routeBuildLengthScale);
}

/** Pure: income for admitting `guestCount` guests on `ticketType` (variable cost per guest ≈ 0, so this
 *  is the whole per-guest economics – RESEARCH-DATA §7). */
export function admissionIncome(ticketType, guestCount) {
  const perGuest = ECONOMY.incomeByTicketType[ticketType] ?? ECONOMY.incomeByTicketType.standard;
  return Math.round(perGuest * Math.max(0, guestCount));
}

/** Pure: deterministic word-of-mouth guest count for the day after `day` (js/game/operations.js's own
 *  day counter), from the park's seed, the day and the current rating – GDD "8 → 16 Gäste" band. */
export function computeNextDayGuestCount({ seed, day, rating }) {
  const rng = new Rng(seed).fork(`guests:${day}`);
  const { guestsAtFloor, guestsAtCeil, ratingFloor, ratingCeil } = ECONOMY.wordOfMouth;
  const clamped = Math.max(ratingFloor, Math.min(ratingCeil, rating));
  const share = (clamped - ratingFloor) / (ratingCeil - ratingFloor);
  const mean = guestsAtFloor + (guestsAtCeil - guestsAtFloor) * share;
  return Math.max(0, Math.round(mean + rng.float(-2, 2)));
}

/** Pure: clamp a rating change into [ratingMin, ratingMax], the ceiling optionally raised by the
 *  signature bonus (GDD "Signature-Logik", simplified to one flat cap bump rather than 149+1 obstacles). */
export function applyRatingDelta(rating, delta, { signature = 0 } = {}) {
  const max = ECONOMY.ratingMax + Math.max(0, signature);
  return Math.max(ECONOMY.ratingMin, Math.min(max, rating + delta));
}

/**
 * @param {{ save }} options
 * @returns {{ cash, rating, hasChargedRoute(routeId), setSignatureActive(active),
 *   spend(amount), earn(amount), chargeRouteOpened(routeId, category, lengthM): number,
 *   chargeRescuePost(): void, chargePpeReset(): void, chargeDailyFixedCost(): void,
 *   admitGuests(ticketType, guestCount): number, nextDayGuestCount(seed, day): number,
 *   onRouteCompleted(), onRescueOutcome(success), onAccident(), onEvacuation(), onDayAvailability(bonusAvailable) }}
 */
export function createEconomy({ save }) {
  let signatureActive = false;

  function applyRating(delta) {
    const bonus = signatureActive ? ECONOMY.signatureBonusCap : 0;
    const next = applyRatingDelta(save.data.economy.rating, delta, { signature: bonus });
    save.updateEconomy({ rating: next });
    return next;
  }

  return {
    get cash() { return save.data.economy.cash; },
    get rating() { return save.data.economy.rating; },

    hasChargedRoute(routeId) { return save.data.economy.routesCharged[routeId] === true; },
    /** GDD "Signature-Logik" (a route with > 100 m of total zip length, or the legendary route open) –
     *  js/main.js recomputes this whenever the park/unlocks change and calls this once. */
    setSignatureActive(active) { signatureActive = !!active; },

    spend(amount) { save.updateEconomy({ cash: save.data.economy.cash - Math.max(0, amount) }); },
    earn(amount) { save.updateEconomy({ cash: save.data.economy.cash + Math.max(0, amount) }); },

    /** js/builder/builder.js, on a route's first successful walkthrough. @returns {number} cost charged (0 if already charged). */
    chargeRouteOpened(routeId, category, lengthM) {
      if (this.hasChargedRoute(routeId)) return 0;
      const cost = computeRouteBuildCost(category, lengthM);
      save.updateEconomy({
        cash: save.data.economy.cash - cost,
        routesCharged: { ...save.data.economy.routesCharged, [routeId]: true },
      });
      return cost;
    },
    chargeRescuePost() { this.spend(ECONOMY.rescuePostCost); },
    chargePpeReset() { this.spend(ECONOMY.ppeResetCost); },
    chargeDailyFixedCost() { this.spend(ECONOMY.dailyFixedCost); },

    /** js/main.js#startDay: admits `guestCount` (js/game/operations.js's own modelled figure) at `ticketType`. */
    admitGuests(ticketType, guestCount) { const income = admissionIncome(ticketType, guestCount); this.earn(income); return income; },
    /** The operator panel's "tomorrow" preview / js/main.js's next-day admission figure. */
    nextDayGuestCount(seed, day) { return computeNextDayGuestCount({ seed, day, rating: save.data.economy.rating }); },

    onRouteCompleted() { return applyRating(ECONOMY.ratingDeltas.routeCompleted); },
    /** js/game/rescue.js's `onResolved` callback. */
    onRescueOutcome(success) { return applyRating(success ? ECONOMY.ratingDeltas.rescueSuccess : ECONOMY.ratingDeltas.rescueFailure); },
    onAccident() { return applyRating(ECONOMY.ratingDeltas.accident); },
    /** Applied once per storm (js/main.js, rising edge of js/game/operations.js#isEvacuating) – this
     *  milestone always shows the kassa's own storm-warning line ahead of time (ROADMAP M3b), so the
     *  harsher "no warning" wording in the GDD never has a *softer* counterpart to compare against here;
     *  documented simplification. */
    onEvacuation() { return applyRating(ECONOMY.ratingDeltas.evacuationNoWarning); },
    /** Once per day (js/main.js#startDay) while the night ticket or the legendary route is available. */
    onDayAvailability(bonusAvailable) { return bonusAvailable ? applyRating(ECONOMY.ratingDeltas.nightAvailable) : this.rating; },
  };
}
