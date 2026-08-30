// NPC guests (ROADMAP M1.6, GDD §3.4/§4/§7): agents that walk the hub paths, queue at a route's entry
// deck, climb the ladder, cross the catalogue elements along their rail (t 0→1, discrete kinds
// step-wise) and ride the Flying Fox, then wander back and pick another route. They share the course's
// occupancy rules with the player (js/game/occupancy.js): one climber per element/ladder, and a
// platform cap one below the real capacity so the player always has room.
//
// THREE-free by design, like js/park/layout-route.js and js/game/route.js: `planAgents` (profile +
// route assignment, deterministic per seed) and the occupancy/queue bookkeeping it drives are unit-
// tested under plain `node --test` (tests/unit/agents.test.mjs), which cannot resolve "three" (no
// bundler, no node_modules – see js/elements/catalogue-data.js's header for the full reason). The
// runtime step functions below *do* call into the built course's THREE-backed objects (`element.
// pointAt`, `ladder.rail`, …) but only ever read `.x/.y/.z` off what they are handed and write through
// a tiny local `vec3` that duck-types THREE.Vector3's `.set(x,y,z)` – so this file itself never needs
// to `import * as THREE`.
import { NPC } from "../config.js";
import { createOccupancy, createQueueRegistry } from "../game/occupancy.js";

// Duplicated from js/player/climb-ladder.js#LADDER_MOVE: that module pulls in THREE (for the player's
// own kinematic rail state), which plain `node --test` cannot resolve – see this file's header and
// js/park/layout-route.js#ZIP_HARDWARE for the same, already-established reason. Keep in sync by hand.
const LADDER_MOVE = Object.freeze({ speed: 0.9, phaseRate: 5.2 });

const TWO_PI = Math.PI * 2;
const wrapAngle = (a) => a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI);
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

/** Weighted pick of a guest archetype (`js/config.js#NPC.profiles`) – kids/teens/sporty. Pure. */
export function pickProfile(rng) {
  const total = NPC.profiles.reduce((sum, p) => sum + p.weight, 0);
  let roll = rng.float(0, total);
  for (const profile of NPC.profiles) {
    if (roll < profile.weight) return profile;
    roll -= profile.weight;
  }
  return NPC.profiles[NPC.profiles.length - 1];
}

/** A route in the profile's own category, or any route if the park has none (small/odd seeds). Pure. */
export function pickRouteForProfile(profile, routes, rng) {
  const matching = routes.filter((r) => r.category === profile.category);
  return rng.pick(matching.length ? matching : routes);
}

/**
 * Deterministic guest roster: count, per-guest profile/route/looks – no course, no terrain, so this
 * is the part `tests/unit/agents.test.mjs` calls directly under plain node.
 * @param {{ rng, parkDef, count?: number }} options
 * @returns {Array<{ id, profileId, category, routeId, heightScale, hue, wanderLegs }>}
 */
export function planAgents({ rng, parkDef, count = null }) {
  const total = count ?? rng.int(NPC.countMin, NPC.countMax);
  const plan = [];
  for (let i = 0; i < total; i++) {
    const grng = rng.fork(`guest-${i}`);
    const profile = pickProfile(grng);
    const route = pickRouteForProfile(profile, parkDef.routes, grng);
    plan.push({
      id: `guest-${i}`, profileId: profile.id, category: profile.category, routeId: route.id,
      heightScale: grng.float(profile.heightScale[0], profile.heightScale[1]),
      hue: grng.float(0, 1),
      wanderLegs: grng.int(NPC.wanderLegs[0], NPC.wanderLegs[1]),
    });
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
 * @returns {{ list: object[], count: number, update(dt, playerPosition): void, dispose(): void }}
 */
export function createAgents({ course, parkDef, terrain, rng, occupancy = createOccupancy(), events = null, count = null }) {
  const plan = planAgents({ rng: rng.fork("npc-plan"), parkDef, count });
  const runtimeBase = rng.fork("npc-runtime");
  const hub = terrain.hubs[0];
  const queues = createQueueRegistry();
  const platformById = new Map();
  for (const route of course.routes) for (const platform of route.platforms) platformById.set(platform.id, platform);

  const list = plan.map((p, i) => makeAgent(p, runtimeBase.fork(`guest-${i}`), hub, terrain));
  const ctxBase = { course, parkDef, terrain, hub, occupancy, queues, events, platformById };

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
    pos: vec3(x, terrain.heightAt(x, z), z), heading: grng.float(0, TWO_PI),
    phase: "wander", wanderLegsLeft: plan.wanderLegs, target: null,
    sequence: null, stepIndex: -1, pendingIndex: -1, currentPlatformId: null,
    t: 0, stepPhase: 0, discreteIndex: 0, discreteTimer: 0, timer: 0, afterUnclip: null,
    speed01: 0, distanceToPlayer: Infinity,
  };
}

// --- per-tick dispatch -------------------------------------------------------------------------------

function stepAgent(agent, dt, ctx) {
  switch (agent.phase) {
    case "wander": stepWander(agent, dt, ctx); break;
    case "toEntry": if (moveToward(agent, dt, ctx.terrain)) beginTransition(agent, ctx); break;
    case "queue": agent.speed01 = 0; tryClaim(agent, ctx); break;
    case "clipIn": stepPause(agent, dt, () => { agent.phase = "onRail"; }); break;
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
      steps.push({
        kind: "zip", railId: element.id, element, length: Math.max(0.5, element.length), fromNodeId,
        toNodeId: route.zipLanding ? `${route.id}-zip-landing` : null, toIsPlatform: false,
        toStand: route.zipLanding ? route.zipLanding.stand : element.getExitAnchor().stand,
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
}

/** One-way, FIFO, capacity 1: join the line for this rail, and only claim it once at the front. */
function tryClaim(agent, ctx) {
  const step = agent.sequence[agent.pendingIndex];
  if (step.toIsPlatform && ctx.occupancy.guestsOnPlatform(step.toNodeId) >= NPC.maxPerPlatformGuests) return false;
  const queue = ctx.queues.queueFor(step.railId);
  queue.join(agent.id);
  if (!queue.isFront(agent.id)) return false;
  if (!ctx.occupancy.claimElement(step.railId, agent.id)) return false;   // held by the player, or (defensively) another guest
  queue.leave(agent.id);
  if (agent.currentPlatformId) { ctx.occupancy.releasePlatform(agent.currentPlatformId, agent.id, true); agent.currentPlatformId = null; }
  agent.stepIndex = agent.pendingIndex;
  agent.t = 0; agent.stepPhase = 0; agent.discreteIndex = 0; agent.discreteTimer = 0;
  agent.phase = "clipIn";
  agent.timer = NPC.clipPauseSeconds;   // the visible two-click ritual beat before setting off
  return true;
}

function stepOnRail(agent, dt, ctx) {
  const step = agent.sequence[agent.stepIndex];
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
  element.pointAt(agent.t, agent.pos);
  element.tangentAt(agent.t, _tangent);
  agent.heading = Math.atan2(_tangent.x, _tangent.z);
  element.occupancy.active = true;   // reuse the player's own wobble-deform hook – a guest's weight sways it too
  element.occupancy.t = agent.t;
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
 *  neighbour finish an element is the GDD §3.4 trust hook ("Zusehen gibt Vertrauen") – js/main.js
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

/** Back near the hub: same profile (an identity, not a die roll every lap), a fresh route pick within it. */
function stepReturn(agent, dt, ctx) {
  if (!moveToward(agent, dt, ctx.terrain)) return;
  const profile = NPC.profiles.find((p) => p.id === agent.profileId) || NPC.profiles[0];
  const route = pickRouteForProfile(profile, ctx.parkDef.routes, agent.rng);
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
    const pending = agent.sequence[agent.pendingIndex];
    if (pending) queues.queueFor(pending.railId).leave(agent.id);
  }
  if (agent.currentPlatformId) occupancy.releasePlatform(agent.currentPlatformId, agent.id, true);
}
