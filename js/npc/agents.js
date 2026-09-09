// NPC guests (ROADMAP M1.6/M3b, GDD §3.4/§4/§7): agents that walk the hub paths, queue at a route's
// entry deck, climb the ladder, cross the catalogue elements along their rail (t 0→1, discrete kinds
// step-wise) and ride the Flying Fox, then wander back and pick another route. They share the course's
// occupancy rules with the player (js/game/occupancy.js): one climber per element/ladder, and a
// platform cap one below the real capacity so the player always has room.
//
// M3b adds three things on top of the M1.6 machinery: fear events (a guest may freeze, or – rarer –
// panic permanently, on a psychologically demanding element; js/npc/profiles.js#rollFearEvent), patience
// (a queued guest gives up and picks a different route once its own wait exceeds its profile's
// patience), and two running-average trackers (wait time per route, fear events per element –
// js/game/occupancy.js#createStatTracker) the M3b operator overlays/panel read once a frame.
//
// THREE-free by design, like js/park/layout-route.js and js/game/route.js: `planAgents` (profile +
// route assignment, deterministic per seed) and the occupancy/queue/fear bookkeeping it drives are
// unit-tested under plain `node --test` (tests/unit/agents.test.mjs), which cannot resolve "three" (no
// bundler, no node_modules – see js/elements/catalogue-data.js's header for the full reason). The
// runtime step functions below *do* call into the built course's THREE-backed objects (`element.
// pointAt/tangentAt`, `ladder.rail`, …) but only ever read `.x/.y/.z` off what they are handed and write
// through a tiny local `vec3` that duck-types THREE.Vector3's `.set(x,y,z)` – so this file itself never
// needs to `import * as THREE`.
import { NPC, FEAR } from "../config.js";
import { createOccupancy, createQueueRegistry, createStatTracker } from "../game/occupancy.js";
import { catalogueEntry } from "../elements/catalogue-data.js";
import { PROFILES, pickProfile, pickRouteForProfile, chooseRouteConsideringQueues, rollFearEvent } from "./profiles.js";

export { PROFILES, pickProfile, pickRouteForProfile, rollFearEvent };

// Duplicated from js/player/climb-ladder.js#LADDER_MOVE: that module pulls in THREE (for the player's
// own kinematic rail state), which plain `node --test` cannot resolve – see this file's header and
// js/park/layout-route.js#ZIP_HARDWARE for the same, already-established reason. Keep in sync by hand.
const LADDER_MOVE = Object.freeze({ speed: 0.9, phaseRate: 5.2 });

const TWO_PI = Math.PI * 2;
const wrapAngle = (a) => a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// Duck-types just enough of THREE.Vector3 for element.js's `pointAt`/`tangentAt` (which writes through
// plain property assignment or `.set()`, and – for `tangentAt` specifically – also calls `.sub().
// normalize()` on its `out` argument) without this file importing "three" itself (see the header).
const vec3 = (x = 0, y = 0, z = 0) => ({
  x, y, z,
  set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; return this; },
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; },
  normalize() { const len = Math.hypot(this.x, this.y, this.z) || 1; this.x /= len; this.y /= len; this.z /= len; return this; },
});
const _tangent = vec3();

/**
 * Deterministic guest roster: count, per-guest profile/route/looks/stats – no course, no terrain, so
 * this is the part `tests/unit/agents.test.mjs` calls directly under plain node. A profile with
 * `groupSize > 1` (a kid+chaperone pair, a school group) pushes several linked entries at once, sharing
 * a `groupId` and the very same route – see this file's header for why they do not literally move as
 * one unit past that.
 * @param {{ rng, parkDef, count?: number }} options
 * @returns {Array<{ id, profileId, category, routeId, heightScale, hue, wanderLegs, courage, strength,
 *   patienceSeconds, groupId: string|null, isChaperone: boolean }>}
 */
export function planAgents({ rng, parkDef, count = null }) {
  const total = count ?? rng.int(NPC.countMin, NPC.countMax);
  const plan = [];
  let groupSeq = 0;
  while (plan.length < total) {
    const grng = rng.fork(`guest-${plan.length}`);
    const profile = pickProfile(grng);
    const route = pickRouteForProfile(profile, parkDef.routes, grng);
    const members = Math.min(profile.groupSize, total - plan.length);
    const groupId = profile.groupSize > 1 ? `group-${groupSeq++}` : null;
    for (let m = 0; m < members; m++) {
      const mrng = grng.fork(`member-${m}`);
      const isChaperone = m < profile.chaperones;
      const heightRange = isChaperone && profile.companionHeightScale ? profile.companionHeightScale : profile.heightScale;
      plan.push({
        id: `guest-${plan.length}`, profileId: profile.id, category: profile.category, routeId: route.id,
        heightScale: mrng.float(heightRange[0], heightRange[1]),
        hue: mrng.float(0, 1),
        wanderLegs: mrng.int(NPC.wanderLegs[0], NPC.wanderLegs[1]),
        courage: clamp01(mrng.float(profile.courage - 0.08, profile.courage + 0.08)),
        strength: clamp01(mrng.float(profile.strength - 0.08, profile.strength + 0.08)),
        patienceSeconds: Math.max(8, mrng.float(profile.patienceSeconds * 0.75, profile.patienceSeconds * 1.25)),
        groupId, isChaperone,
      });
    }
  }
  return plan;
}

/** Which pose family js/npc/guest-rig.js should blend towards right now. */
export function poseKindOf(agent) {
  if (agent.phase === "onRail") return agent.sequence[agent.stepIndex].kind;   // "ladder"|"element"|"zip"
  if (agent.phase === "wander" || agent.phase === "toEntry" || agent.phase === "return") return "walk";
  return "idle";   // queue, clipIn, unclip, dwell
}

/**
 * @param {{ course, parkDef, terrain, rng, occupancy?, events?, count?: number }} options
 *   `course` is js/park/loader.js#loadPark's return value, `rng` the top-level seeded Rng.
 * @returns {{ list: object[], count: number, update(dt, playerPosition): void,
 *   waitStats(): Record<string,number>, fearStats(): Record<string,number>,
 *   resolvePanic(guestId, {success}): boolean, evacuate(): void, debugForcePanic(): object|null,
 *   dispose(): void }}
 */
export function createAgents({ course, parkDef, terrain, rng, occupancy = createOccupancy(), events = null, count = null, allowPanic = true }) {
  const plan = planAgents({ rng: rng.fork("npc-plan"), parkDef, count });
  const runtimeBase = rng.fork("npc-runtime");
  const hub = terrain.hubs[0];
  const queues = createQueueRegistry();
  const waitStats = createStatTracker();
  const fearStats = createStatTracker();
  const panicked = { active: false, guestId: null };   // at most one open panic at a time, by design
  const platformById = new Map();
  for (const route of course.routes) for (const platform of route.platforms) platformById.set(platform.id, platform);

  const list = plan.map((p, i) => makeAgent(p, runtimeBase.fork(`guest-${i}`), hub, terrain));
  // `?autoplay=1` (js/game/autoplay.js) has no way to walk to a rescuer post and resolve a panic – a
  // guest left permanently frozen on the very element the smoke bot needs would deadlock it forever.
  // A plain freeze still happens and still self-clears; only the *permanent* escalation is suppressed.
  const ctxBase = { course, parkDef, terrain, hub, occupancy, queues, events, platformById, waitStats, fearStats, panicked, allowPanic };

  return {
    list,
    count: list.length,
    update(dt, playerPosition) {
      const ctx = { ...ctxBase, playerPosition };
      for (const agent of list) {
        stepAgent(agent, dt, ctx);
        if (playerPosition) {
          agent.distanceToPlayer = Math.hypot(agent.pos.x - playerPosition.x, agent.pos.y - playerPosition.y, agent.pos.z - playerPosition.z);
        }
      }
    },
    /** routeId → average real seconds a guest waited in that route's entry queue this session. */
    waitStats() { return waitStats.snapshot(); },
    /** elementId → accumulated freeze/panic event count this session. */
    fearStats() { return fearStats.snapshot(); },
    /**
     * js/game/rescue.js resolving the one open panic: `success` calms the guest (they finish crossing,
     * then head down, js/game/rescue.js's own doc note on the teleport-fade simplification); failure
     * whisks them away immediately from wherever they were stuck.
     * @returns {boolean} true if there was an open panic for this guest id
     */
    resolvePanic(guestId, { success = false } = {}) {
      if (!panicked.active || panicked.guestId !== guestId) return false;
      const agent = list.find((a) => a.id === guestId);
      panicked.active = false;
      panicked.guestId = null;
      if (!agent) return false;
      agent.fear = "none";
      agent.fearTimer = 0;
      if (success) { agent.calmedAfterRescue = true; return true; }
      const step = agent.sequence ? agent.sequence[agent.stepIndex] : null;
      if (step) { occupancy.releaseElement(step.railId, agent.id); if (step.element) step.element.occupancy.active = false; }
      if (agent.currentPlatformId) { occupancy.releasePlatform(agent.currentPlatformId, agent.id, true); agent.currentPlatformId = null; }
      beginReturn(agent, ctxBase);
      return true;
    },
    /** Weather evacuation (js/game/operations.js): every guest heads for the hub right away, wherever
     *  they are – "immediately head to ground/exits" simplified to the same walk-back every guest
     *  already does at the end of a route, just triggered mid-route instead of at its end. */
    evacuate() {
      for (const agent of list) {
        if (agent.phase === "wander" || agent.phase === "return") continue;
        if (agent.sequence) {
          const held = agent.sequence[agent.stepIndex];
          if (held) occupancy.releaseElement(held.railId, agent.id);
          const pending = agent.pendingIndex >= 0 ? agent.sequence[agent.pendingIndex] : null;
          if (pending) queues.queueFor(pending.railId).leave(agent.id);
        }
        if (agent.currentPlatformId) { occupancy.releasePlatform(agent.currentPlatformId, agent.id, true); agent.currentPlatformId = null; }
        agent.fear = "none"; agent.fearTimer = 0; agent.calmedAfterRescue = false; agent.queueWait = 0;
        beginReturn(agent, ctxBase);
      }
    },
    /** `WIPFEL.debug.forcePanic()` (verification/screenshots): panics an eligible guest immediately –
     *  one already crossing an element if any is, otherwise the first guest in the roster is dropped
     *  onto its assigned route's first element so the mechanic is reliably demonstrable regardless of
     *  whatever phase the live simulation happens to be in. @returns {{guestId,elementId}|null} */
    debugForcePanic() {
      if (panicked.active) return null;
      let agent = list.find((a) => a.phase === "onRail" && a.fear === "none" && a.sequence && a.sequence[a.stepIndex] && a.sequence[a.stepIndex].kind === "element");
      let step = agent ? agent.sequence[agent.stepIndex] : null;
      if (!agent) {
        agent = list[0];
        if (!agent) return null;
        const route = course.routeFor(agent.routeId) || course.routes[0];
        agent.routeId = route.id;
        agent.sequence = buildSequence(route);
        const idx = agent.sequence.findIndex((s) => s.kind === "element");
        if (idx === -1) return null;
        if (agent.currentPlatformId) { occupancy.releasePlatform(agent.currentPlatformId, agent.id, true); agent.currentPlatformId = null; }
        agent.stepIndex = idx;
        agent.pendingIndex = -1;
        agent.t = 0.5;
        step = agent.sequence[idx];
        occupancy.claimElement(step.railId, agent.id);
        applyElementPose(agent, step);
        agent.phase = "onRail";
      }
      agent.fear = "panicked";
      agent.fearTimer = 0;
      panicked.active = true;
      panicked.guestId = agent.id;
      if (events) events.emit("npc:panic", { guestId: agent.id, elementId: step.element.id });
      return { guestId: agent.id, elementId: step.element.id };
    },
    dispose() { for (const agent of list) releaseAll(agent, occupancy, queues); },
  };
}

function makeAgent(plan, grng, hub, terrain) {
  const angle = grng.float(0, TWO_PI);
  const radius = grng.float(hub.radius * 0.3, hub.radius * 0.9);
  const x = hub.x + Math.sin(angle) * radius, z = hub.z + Math.cos(angle) * radius;
  return {
    id: plan.id, profileId: plan.profileId, category: plan.category, routeId: plan.routeId,
    heightScale: plan.heightScale, hue: plan.hue, rng: grng,
    courage: plan.courage, strength: plan.strength, patienceSeconds: plan.patienceSeconds,
    groupId: plan.groupId, isChaperone: plan.isChaperone,
    pos: vec3(x, terrain.heightAt(x, z), z), heading: grng.float(0, TWO_PI),
    phase: "wander", wanderLegsLeft: plan.wanderLegs, target: null,
    sequence: null, stepIndex: -1, pendingIndex: -1, currentPlatformId: null,
    t: 0, stepPhase: 0, discreteIndex: 0, discreteTimer: 0, timer: 0, afterUnclip: null,
    speed01: 0, distanceToPlayer: Infinity,
    fear: "none", fearTimer: 0, calmedAfterRescue: false, queueWait: 0,
  };
}

// --- per-tick dispatch -------------------------------------------------------------------------------

function stepAgent(agent, dt, ctx) {
  switch (agent.phase) {
    case "wander": stepWander(agent, dt, ctx); break;
    case "toEntry": if (moveToward(agent, dt, ctx.terrain)) beginTransition(agent, ctx); break;
    case "queue": {
      agent.speed01 = 0;
      const claimed = tryClaim(agent, ctx);
      if (!claimed) {
        agent.queueWait = (agent.queueWait || 0) + dt;
        if (agent.queueWait > agent.patienceSeconds) abandonQueue(agent, ctx);
      }
      break;
    }
    case "clipIn": stepPause(agent, dt, () => beginOnRail(agent, ctx)); break;
    case "onRail": stepOnRail(agent, dt, ctx); break;
    case "unclip": stepPause(agent, dt, () => afterUnclip(agent, ctx)); break;
    case "dwell": agent.speed01 = 0; if ((agent.timer -= dt) <= 0) beginTransition(agent, ctx); break;
    case "return": stepReturn(agent, dt, ctx); break;
    default: agent.phase = "wander";
  }
}

function stepPause(agent, dt, onDone) { agent.speed01 = 0; if ((agent.timer -= dt) <= 0) onDone(); }

/** Walk to a random point around the hub; after a few legs, head for the assigned route's entry deck. */
function stepWander(agent, dt, ctx) {
  if (!agent.target) pickWanderTarget(agent, ctx.hub);
  if (!moveToward(agent, dt, ctx.terrain)) return;
  agent.wanderLegsLeft -= 1;
  if (agent.wanderLegsLeft > 0) { pickWanderTarget(agent, ctx.hub); return; }
  const route = ctx.course.routeFor(agent.routeId);
  agent.sequence = buildSequence(route);
  agent.stepIndex = -1;
  agent.target = route.entryDeck.clipAnchor;
  agent.phase = "toEntry";
}

function pickWanderTarget(agent, hub) {
  const angle = agent.rng.float(0, TWO_PI);
  const radius = agent.rng.float(hub.radius * 0.3, NPC.wanderRadius);
  agent.target = { x: hub.x + Math.sin(angle) * radius, z: hub.z + Math.cos(angle) * radius };
}

/** Straight-line steer to `agent.target` (2-D); no pathfinding – same honest limitation as the ground
 *  navigation js/game/autoplay.js already documents for the smoke bot. @returns {boolean} arrived */
function moveToward(agent, dt, terrain) {
  const dx = agent.target.x - agent.pos.x, dz = agent.target.z - agent.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= NPC.arriveRange) { agent.speed01 = 0; return true; }
  const step = Math.min(dist, NPC.walkSpeed * dt);
  const nx = agent.pos.x + (dx / dist) * step, nz = agent.pos.z + (dz / dist) * step;
  agent.pos.set(nx, terrain.heightAt(nx, nz), nz);
  agent.heading += wrapAngle(Math.atan2(dx, dz) - agent.heading) * Math.min(1, 8 * dt);
  agent.speed01 = 1;
  return false;
}

/** The route as a linear chain of rails a guest walks in order: ladder, then every element/zip. */
function buildSequence(route) {
  const platformById = new Map(route.platforms.map((p) => [p.id, p]));
  const steps = [{
    kind: "ladder", railId: route.ladderAnchorId, length: Math.max(0.5, route.ladder.rail.length),
    ladder: route.ladder, fromNodeId: null, toNodeId: route.platforms[0].id,
    toIsPlatform: true, toStand: route.platforms[0].anchorPoints.deck,
  }];
  for (const element of route.elements) {
    const fromNodeId = element.getEntryAnchor().platformId;
    if (element.kind === "zipline") {
      // The element's own exit anchor (not the route-level `zipLanding.stand`, which only ever names
      // the *last* arrival deck) is correct for every leg of a route, including a black route's
      // transfer station (M2b) where an earlier zip element's landing is the transfer platform, not the
      // route's final one – a few centimetres off the hand-tuned dismount spot, invisible on a guest.
      const exit = element.getExitAnchor();
      steps.push({
        kind: "zip", railId: element.id, element, length: Math.max(0.5, element.length), fromNodeId,
        toNodeId: exit.platformId, toIsPlatform: false, toStand: exit.stand,
      });
    } else {
      const toNodeId = element.getExitAnchor().platformId;
      const platform = platformById.get(toNodeId);
      steps.push({
        kind: "element", railId: element.id, element, length: Math.max(0.5, element.length), fromNodeId,
        toNodeId, toIsPlatform: true, toStand: platform ? platform.anchorPoints.deck : element.getExitAnchor().stand,
      });
    }
  }
  return steps;
}

function beginTransition(agent, ctx) {
  const nextIndex = agent.stepIndex + 1;
  if (nextIndex >= agent.sequence.length) { beginReturn(agent, ctx); return; }
  agent.pendingIndex = nextIndex;
  agent.phase = "queue";
  agent.queueWait = 0;
}

/** One-way, FIFO, capacity 1: join the line for this rail, and only claim it once at the front.
 *  @returns {boolean} true once this agent actually holds the rail (queueing does not count) */
function tryClaim(agent, ctx) {
  const step = agent.sequence[agent.pendingIndex];
  if (step.toIsPlatform && ctx.occupancy.guestsOnPlatform(step.toNodeId) >= NPC.maxPerPlatformGuests) return false;
  const queue = ctx.queues.queueFor(step.railId);
  queue.join(agent.id);
  if (!queue.isFront(agent.id)) return false;
  if (!ctx.occupancy.claimElement(step.railId, agent.id)) return false;   // held by the player, or (defensively) another guest
  queue.leave(agent.id);
  ctx.waitStats.record(agent.routeId, agent.queueWait || 0);
  agent.queueWait = 0;
  if (agent.currentPlatformId) { ctx.occupancy.releasePlatform(agent.currentPlatformId, agent.id, true); agent.currentPlatformId = null; }
  agent.stepIndex = agent.pendingIndex;
  agent.pendingIndex = -1;
  agent.t = 0; agent.stepPhase = 0; agent.discreteIndex = 0; agent.discreteTimer = 0;
  agent.phase = "clipIn";
  agent.timer = NPC.clipPauseSeconds;   // the visible two-click ritual beat before setting off
  return true;
}

/** Patience ran out (GDD §4 "guests give up when their patience runs out"): leave the line, give up whatever
 *  platform slot was still held while waiting, and walk back towards the hub for a fresh route pick. */
function abandonQueue(agent, ctx) {
  const step = agent.pendingIndex >= 0 ? agent.sequence[agent.pendingIndex] : null;
  if (step) ctx.queues.queueFor(step.railId).leave(agent.id);
  ctx.waitStats.record(agent.routeId, agent.queueWait);
  agent.queueWait = 0;
  agent.pendingIndex = -1;
  if (agent.currentPlatformId) { ctx.occupancy.releasePlatform(agent.currentPlatformId, agent.id, true); agent.currentPlatformId = null; }
  beginReturn(agent, ctx);
}

/** The clip-in beat just finished: settle onto the rail, and – on an element only – roll for a fear
 *  event (GDD §4 "fear events from the psychological axes"). Ladders and the Flying Fox never
 *  roll: neither carries a "psychological" catalogue metric, and a guest cannot sensibly freeze mid-air
 *  on a cable the way they can on a wobbling bridge. */
function beginOnRail(agent, ctx) {
  agent.phase = "onRail";
  agent.fear = "none";
  agent.fearTimer = 0;
  const step = agent.sequence[agent.stepIndex];
  if (step.kind !== "element") return;
  const entry = catalogueEntry(step.element.kind);
  const psych = entry ? entry.metrics.psychological : 0;
  const roll = rollFearEvent({ courage: agent.courage, psychMetric: psych, rng: agent.rng });
  if (roll === "none") return;
  ctx.fearStats.record(step.railId, 1);
  if (roll === "panic" && !ctx.panicked.active && ctx.allowPanic) {
    agent.fear = "panicked";
    ctx.panicked.active = true;
    ctx.panicked.guestId = agent.id;
    if (ctx.events) ctx.events.emit("npc:panic", { guestId: agent.id, elementId: step.element.id });
  } else {
    // Either a plain freeze, or a would-be panic downgraded because a rescue is already open for
    // someone else (js/game/rescue.js only ever tracks one at a time) or `?autoplay=1` cannot resolve
    // one at all (see this file's own `allowPanic` comment above) – a longer freeze instead of no event
    // at all keeps the roll from silently vanishing.
    agent.fear = "freezing";
    agent.fearTimer = agent.rng.float(FEAR.freezeSeconds[0], FEAR.freezeSeconds[1]);
  }
}

function stepOnRail(agent, dt, ctx) {
  const step = agent.sequence[agent.stepIndex];
  if (step.kind === "element" && agent.fear !== "none") {
    agent.speed01 = 0;
    if (agent.fear === "freezing" && (agent.fearTimer -= dt) <= 0) agent.fear = "none";
    applyElementPose(agent, step);   // stays visually put – a small tremor is js/npc/guest-rig.js's job
    return;
  }
  agent.speed01 = 1;
  if (step.kind === "ladder") advanceLadder(agent, step, dt);
  else if (step.kind === "zip") advanceZip(agent, step, dt);
  else advanceElement(agent, step, dt);
  if (agent.t >= 1) onArrive(agent, step, ctx);
}

function advanceLadder(agent, step, dt) {
  agent.t = Math.min(1, agent.t + (LADDER_MOVE.speed * dt) / step.length);
  agent.stepPhase += LADDER_MOVE.speed * dt * LADDER_MOVE.phaseRate;
  const rail = step.ladder.rail;
  agent.pos.set(
    rail.start.x + (rail.end.x - rail.start.x) * agent.t,
    rail.start.y + (rail.end.y - rail.start.y) * agent.t,
    rail.start.z + (rail.end.z - rail.start.z) * agent.t,
  );
  agent.heading = wrapAngle(step.ladder.side + Math.PI);   // face the trunk, like the player's own climb
}

/** Places `agent.pos`/`heading` and re-arms the element's own wobble-deform hook for the current
 *  `agent.t` – shared by normal advancement and a frozen/panicked hold (which stops `t`, not this). */
function applyElementPose(agent, step) {
  const element = step.element;
  element.pointAt(agent.t, agent.pos);
  element.tangentAt(agent.t, _tangent);
  agent.heading = Math.atan2(_tangent.x, _tangent.z);
  element.occupancy.active = true;
  element.occupancy.t = agent.t;
}

/** Continuous rails use the element's own `walkSpeed` (kind-appropriate for free); discrete ones
 *  (planks, stirrups, wire loops, rings) step once every `elementStepSeconds`, reusing whatever step
 *  row the element already built (`element.steps`/`.planks`) for a plausible step count. */
function advanceElement(agent, step, dt) {
  const element = step.element;
  if (element.discrete === true) {
    if ((agent.discreteTimer -= dt) <= 0) {
      const rows = element.steps || element.planks || null;
      const count = rows ? Math.max(2, rows.length) : Math.max(3, Math.round(element.length / 0.6));
      agent.discreteIndex = Math.min(count - 1, agent.discreteIndex + 1);
      agent.t = agent.discreteIndex / (count - 1);
      agent.discreteTimer = agent.rng.float(NPC.elementStepSeconds[0], NPC.elementStepSeconds[1]);
      agent.stepPhase += 1;
    }
  } else {
    const speed = element.walkSpeed || NPC.elementSpeedFallback;
    agent.t = Math.min(1, agent.t + (speed * dt) / element.length);
  }
  applyElementPose(agent, step);
}

/** Lightly reuses the real ride: `setRider`/`trolleyAt` puts the guest on the same sagging cable curve
 *  the player would see, eased in time rather than driven by js/zipline/physics.js. */
function advanceZip(agent, step, dt) {
  const element = step.element;
  const duration = Math.max(2, element.length * NPC.zipSecondsPerMetre);
  agent.stepPhase = Math.min(duration, agent.stepPhase + dt);
  const raw = agent.stepPhase / duration;
  agent.t = raw * raw * (3 - 2 * raw);   // smoothstep ease-in/out
  const s = agent.t * (element.zip ? element.zip.length : element.length);
  if (element.zip && typeof element.setRider === "function") element.setRider(s, 0.12);
  if (typeof element.trolleyAt === "function") element.trolleyAt(s, agent.pos);
  else element.pointAt(agent.t, agent.pos);
  element.tangentAt(agent.t, _tangent);
  agent.heading = Math.atan2(_tangent.x, _tangent.z);
}

/** Arrival: release the rail, take a platform slot if there is one, then a short "unclip" beat before
 *  the next dwell (or, past the last step, before wandering off to pick a new route). Watching a
 *  neighbour finish an element is the GDD §3.4 trust hook ("watching builds trust") – js/main.js
 *  turns the event into a tiny nerve tick. */
function onArrive(agent, step, ctx) {
  if (step.kind === "element") step.element.occupancy.active = false;
  if (step.kind === "zip" && typeof step.element.setRider === "function") step.element.setRider(null);
  ctx.occupancy.releaseElement(step.railId, agent.id);
  agent.pos.set(step.toStand.x, step.toStand.y, step.toStand.z);
  if (step.toIsPlatform && step.toNodeId) { ctx.occupancy.claimPlatform(step.toNodeId, agent.id, true); agent.currentPlatformId = step.toNodeId; }
  else agent.currentPlatformId = null;
  if (step.kind === "element" && ctx.events && (isPlayerOnPlatform(ctx, step.fromNodeId) || isPlayerOnPlatform(ctx, step.toNodeId))) {
    ctx.events.emit("npc:watched-success", { guestId: agent.id, elementId: step.railId });
  }
  if (agent.calmedAfterRescue) {
    // Rescued (js/game/rescue.js#resolvePanic success): calmed at the next platform, then straight back
    // down instead of continuing the route – the same "descend" simplification a normal end-of-route
    // return already uses, just triggered mid-route instead of at the very end.
    agent.calmedAfterRescue = false;
    beginReturn(agent, ctx);
    return;
  }
  agent.phase = "unclip";
  agent.timer = NPC.clipPauseSeconds;
  agent.afterUnclip = agent.stepIndex + 1 < agent.sequence.length ? "dwell" : "return";
}

function afterUnclip(agent, ctx) {
  if (agent.afterUnclip === "dwell") { agent.phase = "dwell"; agent.timer = agent.rng.float(NPC.dwellSeconds[0], NPC.dwellSeconds[1]); }
  else beginReturn(agent, ctx);
}

function isPlayerOnPlatform(ctx, platformId) {
  if (!platformId || !ctx.playerPosition) return false;
  const platform = ctx.platformById.get(platformId);
  if (!platform) return false;
  const deck = platform.anchorPoints.deck;
  const flat = Math.hypot(ctx.playerPosition.x - deck.x, ctx.playerPosition.z - deck.z);
  return flat <= NPC.trustWatchRadius && Math.abs(ctx.playerPosition.y - deck.y) <= NPC.trustWatchHeight;
}

function beginReturn(agent, ctx) {
  agent.currentPlatformId = null;
  agent.target = { x: ctx.hub.x, z: ctx.hub.z };
  agent.phase = "return";
}

/** Guests currently waiting at `routeId`'s own ladder – js/npc/profiles.js#chooseRouteConsideringQueues'
 *  congestion term. */
function queueLengthOf(ctx) {
  return (routeId) => {
    const route = ctx.course.routeFor(routeId);
    return route ? ctx.queues.queueFor(route.ladderAnchorId).size : 0;
  };
}

/** Back near the hub: same profile (an identity, not a die roll every lap), a fresh route pick within
 *  it – courage- and queue-length-aware (GDD §4 "choose by unlock/colour/waiting time"). */
function stepReturn(agent, dt, ctx) {
  if (!moveToward(agent, dt, ctx.terrain)) return;
  const profile = PROFILES.find((p) => p.id === agent.profileId) || PROFILES[0];
  const route = chooseRouteConsideringQueues(profile, ctx.parkDef.routes, agent.rng, queueLengthOf(ctx));
  agent.routeId = route.id;
  agent.sequence = null;
  agent.wanderLegsLeft = agent.rng.int(NPC.wanderLegs[0], NPC.wanderLegs[1]);
  agent.target = null;
  agent.phase = "wander";
}

function releaseAll(agent, occupancy, queues) {
  if (agent.sequence) {
    const held = agent.sequence[agent.stepIndex];
    if (held) occupancy.releaseElement(held.railId, agent.id);
    const pending = agent.pendingIndex >= 0 ? agent.sequence[agent.pendingIndex] : null;
    if (pending) queues.queueFor(pending.railId).leave(agent.id);
  }
  if (agent.currentPlatformId) occupancy.releasePlatform(agent.currentPlatformId, agent.id, true);
}
