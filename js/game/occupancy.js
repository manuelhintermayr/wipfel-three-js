// Occupancy bookkeeping shared between the player and the NPC guests (ROADMAP M1.6, RESEARCH-DATA
// §8: "1 person per obstacle, 3 per platform"). Pure – no THREE, no DOM – so it is unit-testable the same
// way js/player/belay.js is, and importable from both js/npc/agents.js (which must itself stay
// THREE-free, see that file's header) and js/player/interaction.js (which already imports plain
// modules like js/core/save.js the same way) without creating a player → npc (or npc → player)
// folder dependency in either direction – this is a course-wide game rule, not an NPC-only concern.
//
// Two ledgers:
//   elements  – one holder at a time (RULES.maxPerElement = 1), keyed by an element id or a route's
//               ladderAnchorId. Whoever claims it first keeps it until they release it explicitly.
//   platforms – guests only, capped below the real platform capacity (RULES.maxPerPlatform = 3) so a
//               platform never fills up in front of the player; the player is never counted here and
//               never refused (js/park/platform.js#capacity is the *design* limit including the
//               player, but only guest-vs-guest contention is worth enforcing at runtime).
//
// A `createQueue` FIFO sits next to it: js/npc/agents.js joins the queue for a contested element and
// only attempts the claim once it is at the front, so waiting guests are served in arrival order
// instead of whichever one happens to run first in the update loop that frame. Player vs. guest
// contention needs no queue: js/player/interaction.js already refuses the E press outright (a human
// does not "queue" – they read the "wait for the climber ahead" prompt and try again).
//
// M4 (ROADMAP "co-op obstacles", GDD §3.11): `claimElement`'s optional `capacity` argument lets exactly
// two of the catalogue's twenty-plus kinds (js/elements/{counterweight-lift,team-bridge}.js,
// `element.occupancyCapacity === 2`) hold two simultaneous holders – a rider plus a helper standing at
// the platform end, never two riders on the same rail parameter (see each element's own header for why
// that stays honest). Every existing caller omits `capacity` and keeps the original one-holder rule.
import { RULES, NPC } from "../config.js";

/**
 * @param {{ maxPerElement?: number, maxGuestsPerPlatform?: number }} [options]
 * @returns {{
 *   holderOfElement(id): string|null,
 *   holdersOfElement(id): string[],
 *   claimElement(id, holderId, capacity?): boolean,
 *   releaseElement(id, holderId): void,
 *   guestsOnPlatform(id): number,
 *   claimPlatform(id, holderId, isGuest): boolean,
 *   releasePlatform(id, holderId, isGuest): void,
 *   reset(): void,
 * }}
 */
export function createOccupancy({ maxPerElement = RULES.maxPerElement, maxGuestsPerPlatform = NPC.maxPerPlatformGuests } = {}) {
  const elementHolders = new Map();     // elementId -> Set<holderId> (size 1 unless capacity > 1 is passed)
  const platformGuests = new Map();    // platformId -> Set<holderId> (guests only)

  return {
    /** Who currently holds this element/ladder rail (the first holder, for the common one-holder case), or null. */
    holderOfElement(id) {
      const set = elementHolders.get(id);
      return set && set.size ? set.values().next().value : null;
    },
    /** Every current holder – js/player/interaction.js reads this for capacity-2 co-op elements. */
    holdersOfElement(id) {
      const set = elementHolders.get(id);
      return set ? Array.from(set) : [];
    },

    /**
     * @param {number} [capacity] how many simultaneous holders this element allows – defaults to
     *   `maxPerElement` (1, RULES.maxPerElement). A capacity-2 co-op element (js/config.js#COOP_ELEMENTS)
     *   passes 2 explicitly; every other caller is unaffected.
     * @returns {boolean} true if `holderId` now holds (or already held) this element.
     */
    claimElement(id, holderId, capacity = maxPerElement) {
      let set = elementHolders.get(id);
      if (!set) { set = new Set(); elementHolders.set(id, set); }
      if (set.has(holderId)) return true;
      if (set.size >= capacity) return false;
      set.add(holderId);
      return true;
    },

    releaseElement(id, holderId) {
      const set = elementHolders.get(id);
      if (!set) return;
      set.delete(holderId);
      if (!set.size) elementHolders.delete(id);
    },

    guestsOnPlatform(id) { const set = platformGuests.get(id); return set ? set.size : 0; },

    /**
     * The player always gets a slot (never tracked, never refused) – GDD §3.4's "three per platform"
     * stays a real cap only for guests, capped one below it, so a platform can never be too full for
     * the climber who actually needs to stand there.
     * @returns {boolean} false only for a guest when the platform's guest cap is already full
     */
    claimPlatform(id, holderId, isGuest = true) {
      if (!isGuest) return true;
      let set = platformGuests.get(id);
      if (!set) { set = new Set(); platformGuests.set(id, set); }
      if (set.has(holderId)) return true;
      if (set.size >= maxGuestsPerPlatform) return false;
      set.add(holderId);
      return true;
    },

    releasePlatform(id, holderId, isGuest = true) {
      if (!isGuest) return;
      const set = platformGuests.get(id);
      if (set) set.delete(holderId);
    },

    reset() { elementHolders.clear(); platformGuests.clear(); },
  };
}

/**
 * A plain FIFO of holder ids waiting on one contested element. `join` is idempotent (an agent that
 * calls it again while already queued does not lose its place); `leave` removes it from anywhere in
 * the line (a guest that gives up, or the one at the front once it has claimed the element).
 * @returns {{ join(id): void, leave(id): void, front(): string|null, isFront(id): boolean,
 *   positions(): string[], size: number }}
 */
export function createQueue() {
  const order = [];
  return {
    join(id) { if (!order.includes(id)) order.push(id); },
    leave(id) { const i = order.indexOf(id); if (i !== -1) order.splice(i, 1); },
    front() { return order.length ? order[0] : null; },
    isFront(id) { return order.length > 0 && order[0] === id; },
    /** Snapshot in arrival order – js/npc/guest-rig.js offsets waiting guests along this. */
    positions() { return order.slice(); },
    get size() { return order.length; },
  };
}

/**
 * One `createQueue()` per contested element/ladder, created on first use. `js/npc/agents.js` calls
 * this instead of managing its own `Map` of queues.
 * @returns {{ queueFor(id): ReturnType<typeof createQueue>, reset(): void }}
 */
export function createQueueRegistry() {
  const queues = new Map();
  return {
    queueFor(id) {
      let q = queues.get(id);
      if (!q) { q = createQueue(); queues.set(id, q); }
      return q;
    },
    reset() { queues.clear(); },
  };
}

/**
 * A running mean per key (ROADMAP M3b): js/npc/agents.js feeds it real seconds waited in a queue
 * (keyed by route id, for the wait-time overlay/operator panel) or a bare event count (keyed by
 * element id, for the fear-event overlay – `record(id, 1)` each freeze/panic). Pure bookkeeping, no
 * decay – the whole session's own average, cheap enough that it never needs to forget anything.
 * @returns {{ record(key: string, value: number): void, averageOf(key): number, snapshot(): object }}
 */
export function createStatTracker() {
  const stats = new Map();   // key -> { sum, count }
  return {
    record(key, value) {
      if (!key) return;
      const s = stats.get(key) || { sum: 0, count: 0 };
      s.sum += value; s.count += 1;
      stats.set(key, s);
    },
    averageOf(key) { const s = stats.get(key); return s && s.count ? s.sum / s.count : 0; },
    /** @returns {Record<string, number>} key -> running mean, for an overlay/dashboard to read once a frame. */
    snapshot() {
      const out = {};
      for (const [key, s] of stats) out[key] = s.count ? s.sum / s.count : 0;
      return out;
    },
  };
}
