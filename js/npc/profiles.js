// Guest archetypes (ROADMAP M3b, GDD §4 "Gäste als Agenten: Profile … mit Mut, Kraft, Erwartungen").
// Extends M1.6's three simple archetypes (kid/teen/sporty, still here as blue/red/black defaults) into
// the full roster the operator act asks for: a kid+chaperone pair, teens, adults, sporty guests,
// anxious guests and a school group of four with one chaperone. Pure data + pure picks – no THREE, same
// reasoning as js/elements/catalogue-data.js's header (js/npc/agents.js, which imports this, must stay
// importable under plain `node` for tests/unit/agents.test.mjs).
//
// Groups (`groupSize > 1`) are a documented simplification: this engine's occupancy rule is one climber
// per element/ladder (RULES.maxPerElement = 1, js/game/occupancy.js), so a family or class can never
// literally stand shoulder to shoulder on one rail. A group instead spawns its members together, all
// assigned to the very same route, and queues through it one at a time like any other cluster of
// strangers happens to – it reads as "arrived together, disperses along the route", not lock-step.
import { FEAR } from "../config.js";

/** id, default category (used by the deterministic boot roster, see pickRouteForProfile below),
 *  weight (relative roll odds), heightScale range, and the three GDD stats. `courage`/`strength` are
 *  0..1 base values (each guest jitters a little around them, js/npc/agents.js#planAgents);
 *  `patienceSeconds` is how long this archetype waits in a queue before giving up (GDD "Gäste brechen
 *  ab, wenn Geduld ausgeht"). `groupSize`/`chaperones` describe a linked cluster, see the header. */
export const PROFILES = Object.freeze([
  { id: "kid", category: "blue", weight: 2, heightScale: [0.76, 0.90], courage: 0.55, strength: 0.30, patienceSeconds: 55, groupSize: 1, chaperones: 0 },
  {
    id: "kidChaperone", category: "blue", weight: 2, heightScale: [0.76, 0.90], courage: 0.55, strength: 0.30,
    patienceSeconds: 70, groupSize: 2, chaperones: 1, companionHeightScale: [0.94, 1.04],
  },
  { id: "teen", category: "red", weight: 3, heightScale: [0.90, 1.00], courage: 0.68, strength: 0.55, patienceSeconds: 45, groupSize: 1, chaperones: 0 },
  { id: "adult", category: "red", weight: 2, heightScale: [0.96, 1.04], courage: 0.60, strength: 0.62, patienceSeconds: 60, groupSize: 1, chaperones: 0 },
  { id: "sporty", category: "black", weight: 2, heightScale: [0.96, 1.08], courage: 0.88, strength: 0.85, patienceSeconds: 40, groupSize: 1, chaperones: 0 },
  { id: "anxious", category: "blue", weight: 2, heightScale: [0.92, 1.02], courage: 0.20, strength: 0.45, patienceSeconds: 30, groupSize: 1, chaperones: 0 },
  {
    id: "schoolGroup", category: "blue", weight: 1, heightScale: [0.82, 0.94], courage: 0.50, strength: 0.42,
    patienceSeconds: 75, groupSize: 4, chaperones: 1, companionHeightScale: [0.95, 1.05],
  },
]);

/** Weighted pick of a guest archetype. Pure. */
export function pickProfile(rng) {
  const total = PROFILES.reduce((sum, p) => sum + p.weight, 0);
  let roll = rng.float(0, total);
  for (const profile of PROFILES) {
    if (roll < profile.weight) return profile;
    roll -= profile.weight;
  }
  return PROFILES[PROFILES.length - 1];
}

/** A route in the profile's own default category, or any route if the park has none (small/odd seeds).
 *  Used for the deterministic boot roster, where no live queue data exists yet – see
 *  `chooseRouteConsideringQueues` below for the courage/congestion-aware pick used at runtime. Pure. */
export function pickRouteForProfile(profile, routes, rng) {
  const matching = routes.filter((r) => r.category === profile.category);
  return rng.pick(matching.length ? matching : routes);
}

/** Courage bands → the category a guest at that courage level is drawn to (GDD "Farben stimmen"):
 *  timid guests gravitate to blue even if their archetype's *default* category is nominally something
 *  else (an anxious adult still eyes the blue routes), confident ones drift towards black. */
const COURAGE_CATEGORY_BANDS = Object.freeze([
  { max: 0.40, category: "blue" },
  { max: 0.62, category: "blue" },
  { max: 0.80, category: "red" },
  { max: 1.01, category: "black" },
]);
function categoryByCourage(courage) {
  for (const band of COURAGE_CATEGORY_BANDS) if (courage <= band.max) return band.category;
  return "black";
}

/**
 * Runtime route choice (GDD §4 "wählen nach Freigabe/Farbe/Wartezeit"): a weighted pick across every
 * route in the park, favouring the category this guest's courage draws them to (and, less strongly,
 * their archetype's own default category so a "red" adult does not instantly forget red exists), and
 * discouraged by how long the queue at that route's entry currently is. Pure given `queueLengthOf`.
 * @param {object} profile
 * @param {Array<{id,category}>} routes
 * @param {import("../core/rng.js").Rng} rng
 * @param {(routeId: string) => number} [queueLengthOf] guests currently waiting at that route's entry
 */
export function chooseRouteConsideringQueues(profile, routes, rng, queueLengthOf = () => 0) {
  if (!routes.length) return null;
  const preferred = categoryByCourage(profile.courage);
  const scored = routes.map((route) => {
    const categoryMatch = route.category === preferred ? 3 : route.category === profile.category ? 1.0 : 0.4;
    const congestionPenalty = queueLengthOf(route.id) * 0.6;
    return { route, weight: Math.max(0.05, categoryMatch - congestionPenalty) };
  });
  const total = scored.reduce((sum, s) => sum + s.weight, 0);
  let roll = rng.float(0, total);
  for (const s of scored) {
    if (roll < s.weight) return s.route;
    roll -= s.weight;
  }
  return scored[scored.length - 1].route;
}

/**
 * Deterministic fear roll for one guest crossing one element (GDD §4 "Angst-Ereignisse aus den
 * psychologischen Achsen"). Pure: `courage`/`psychMetric` are plain numbers (0..1 and 0..5), `rng`
 * exposes `.next()` (an `import("../core/rng.js").Rng`, or any duck-typed stand-in for tests).
 * Elements at or under `FEAR.psychThreshold` never trigger anything, however low the courage – there
 * has to be something genuinely demanding about the element first. Past that threshold, low courage
 * both raises the chance of freezing at all *and*, once frozen, the chance that freeze escalates into
 * a permanent panic. A courage of 1 (the ceiling) never freezes or panics, by construction.
 * @returns {"none"|"freeze"|"panic"}
 */
export function rollFearEvent({ courage, psychMetric, rng }) {
  const pressure = Math.max(0, psychMetric - FEAR.psychThreshold) / (5 - FEAR.psychThreshold);
  if (pressure <= 0) return "none";
  const fright = Math.max(0, 1 - courage);
  const freezeChance = pressure * fright * FEAR.freezeChanceScale;
  if (rng.next() >= freezeChance) return "none";
  return rng.next() < fright * FEAR.panicEscalation ? "panic" : "freeze";
}
