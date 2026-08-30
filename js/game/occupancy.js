// Occupancy bookkeeping shared between the player and the NPC guests (ROADMAP M1.6, RESEARCH-DATA
// §8: "1 Person pro Übung, 3 pro Podest"). Pure – no THREE, no DOM – so it is unit-testable the same
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
import { RULES, NPC } from "../config.js";

/**
 * @param {{ maxPerElement?: number, maxGuestsPerPlatform?: number }} [options]
 * @returns {{
 *   holderOfElement(id): string|null,
 *   claimElement(id, holderId): boolean,
 *   releaseElement(id, holderId): void,
 *   guestsOnPlatform(id): number,
 *   claimPlatform(id, holderId, isGuest): boolean,
 *   releasePlatform(id, holderId, isGuest): void,
 *   reset(): void,
 * }}
 */
export function createOccupancy({ maxPerElement = RULES.maxPerElement, maxGuestsPerPlatform = NPC.maxPerPlatformGuests } = {}) {
  const elementHolder = new Map();     // elementId -> holderId (only ever one; maxPerElement is 1 in this game)
  const platformGuests = new Map();    // platformId -> Set<holderId> (guests only)

  return {
    /** Who currently holds this element/ladder rail, or null if it is free. */
    holderOfElement(id) { return elementHolder.get(id) ?? null; },

    /**
     * @returns {boolean} true if `holderId` now holds (or already held) this element. Capacity is
     *   `maxPerElement` (1) shared between the player and every guest – whoever asks first wins;
     *   everyone else must wait for `releaseElement`.
     */
    claimElement(id, holderId) {
      const current = elementHolder.get(id);
      if (current != null && current !== holderId) return false;
      if (maxPerElement <= 0) return false;
      elementHolder.set(id, holderId);
      return true;
    },

    releaseElement(id, holderId) {
      if (elementHolder.get(id) === holderId) elementHolder.delete(id);
    },

    guestsOnPlatform(id) { const set = platformGuests.get(id); return set ? set.size : 0; },

    /**
     * The player always gets a slot (never tracked, never refused) – GDD §3.4's "drei pro Podest"
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

    reset() { elementHolder.clear(); platformGuests.clear(); },
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
