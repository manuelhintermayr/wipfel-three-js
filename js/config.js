// Global constants. Everything tunable lives here or in the park/catalog data – never as magic numbers.

export const GAME = Object.freeze({
  name: "Wipfel",
  version: "0.1.0-m0",
  saveKey: "wipfel-save-v1",
  saveSchema: 1,
});

export const PHYSICS = Object.freeze({
  hz: 60,                    // fixed physics step
  maxSubSteps: 4,            // catch-up cap per frame (prevents spiral of death)
  gravity: { x: 0, y: -9.81, z: 0 },
});

export const TIME = Object.freeze({
  gameHourMinutes: 10,       // 1 in-game hour = 10 real minutes (ADR-008)
  ticketHours: 4,
  lastEntryHoursBeforeClose: 2,
});

/** Ticket clock tuning (js/game/ticket.js, ROADMAP M1.5). */
export const TICKET = Object.freeze({
  openingHour: 9,              // the park's opening time on the sky clock (GDD §3.7)
  warnMinutes: 30,             // game minutes remaining that trigger the "running out" toast
  extendGameMinutes: 30,       // one "+30 min" extension (RESEARCH-DATA §1: "+5 € je weitere 1/2 h")
  maxExtensions: 2,
  extendPromptSeconds: 8,      // real seconds the "extend?" prompt stays up before the day ends anyway
});

/** Ticket types sold at the kassa (GDD §3.7/§3.8). scoreMultiplier is a placeholder – applied in M2 (Flow). */
export const TICKET_TYPES = Object.freeze([
  { id: "standard", hours: TIME.ticketHours, labelKey: "kassa.ticket.standard.name", descKey: "kassa.ticket.standard.desc", scoreMultiplier: 1 },
  { id: "happyHour", hours: TIME.ticketHours / 2, labelKey: "kassa.ticket.happyHour.name", descKey: "kassa.ticket.happyHour.desc", scoreMultiplier: 1.25 },
]);

export const RENDER = Object.freeze({
  maxPixelRatio: 1.75,
  shadowMapSize: 2048,
  fov: 55,
  near: 0.1,
  far: 900,
  toneMappingExposure: 1.0,
});

export const WORLD = Object.freeze({
  size: 480,                 // metres per side of the playable slope
  seaLevel: 0,
});

/** Route categories – colour, symbol, human label keys. Order = difficulty gate order. */
export const CATEGORIES = Object.freeze([
  { id: "green",     colour: 0x6fbf3b, css: "var(--cat-green)",     symbol: "◈", labelKey: "cat.green" },
  { id: "blue",      colour: 0x2f6fd6, css: "var(--cat-blue)",      symbol: "●", labelKey: "cat.blue" },
  { id: "red",       colour: 0xd8342c, css: "var(--cat-red)",       symbol: "■", labelKey: "cat.red" },
  { id: "black",     colour: 0x1c1c1e, css: "var(--cat-black)",     symbol: "◆", labelKey: "cat.black" },
  { id: "legendary", colour: 0xe5b93c, css: "var(--cat-legendary)", symbol: "✦", labelKey: "cat.legendary" },
]);

export const CATEGORY_BY_ID = Object.freeze(Object.fromEntries(CATEGORIES.map((c) => [c.id, c])));

/** Real-park rules that shape pacing (docs/RESEARCH-DATA.md §8). */
export const RULES = Object.freeze({
  maxPerElement: 1,
  maxPerPlatform: 3,
  minHeightCm: 110,
  maxWeightKg: 120,
  sizeClasses: Object.freeze([
    { id: "s110", minCm: 110, allowed: ["green", "blue"],                       massKg: 32, labelKey: "kassa.size.s110" },
    { id: "s130", minCm: 130, allowed: ["green", "blue", "red"],                massKg: 45, labelKey: "kassa.size.s130" },
    { id: "s150", minCm: 150, allowed: ["green", "blue", "red", "black"],       massKg: 60, labelKey: "kassa.size.s150" },
    { id: "adult", minCm: 160, allowed: ["green", "blue", "red", "black", "legendary"], massKg: 78, labelKey: "kassa.size.adult" },
  ]),
});

/** Belay systems the park can be run with (GDD §safety, `?belay=`). Logic: js/player/belay.js. */
export const BELAY_MODES = Object.freeze(["continuous", "smart", "classic"]);

export const DEFAULTS = Object.freeze({
  seed: 1,
  locale: "en",
  belayMode: "smart",        // one of BELAY_MODES
});

/**
 * NPC guests (ROADMAP M1.6): count/profile/route assignment is deterministic per seed
 * (js/npc/agents.js#createAgents forks `rng`), occupancy caps come from RULES above.
 * `profiles` map a guest archetype to the category they head for – GDD §4 "Gäste als Agenten"
 * simplified to three archetypes for M1 (full profile roster is a Betreiber-era, M3, concern).
 */
export const NPC = Object.freeze({
  countMin: 8,
  countMax: 14,
  cullDistance: 90,            // metres from the player beyond which rig pose updates are skipped
  maxPerPlatformGuests: 2,     // RULES.maxPerPlatform stays 3 total – guests leave the player a slot
  walkSpeed: 1.35,             // hub wander / approach to the entry deck
  arriveRange: 0.6,
  wanderRadius: 16,            // metres around the hub for idle wandering
  wanderLegs: [1, 3],          // how many wander hops before heading to the assigned route
  dwellSeconds: [1.5, 4.5],    // idle pause on a platform
  clipPauseSeconds: 0.9,       // visible "two-click ritual" beat before climbing / after unclipping
  elementStepSeconds: [0.7, 1.3],  // discrete kinds (planks, stirrups, …): seconds per step incl. swing wait
  elementSpeedFallback: 0.5,   // m/s, used only if an element has no own walkSpeed
  zipSecondsPerMetre: 0.22,    // eased traversal duration ≈ length * this (a lazy ~16 km/h average)
  trustWatchRadius: 2.6,       // metres (flat) – "the player stands on the platform" proxy for the trust hook
  trustWatchHeight: 2.2,       // metres (vertical) – generous, decks vary a little in height
  profiles: Object.freeze([
    { id: "kid", category: "blue", weight: 3, heightScale: [0.76, 0.90] },
    { id: "teen", category: "red", weight: 2, heightScale: [0.90, 1.00] },
    { id: "sporty", category: "black", weight: 2, heightScale: [0.96, 1.08] },
  ]),
});

/** Course Map overlay + diegetic park board (ROADMAP M1.4). Logic: js/ui/map-render.js. */
export const MAP = Object.freeze({
  padding: 34,                 // px margin around the projected park bounds
  boardTexture: 1024,          // px, board texture width (height = 3/4 of that)
  reliefGridStep: 3.0,         // metres per relief-sample cell (coarse – it is cached once)
  hillLightDir: Object.freeze({ x: -0.55, z: -0.4 }),   // relief "sun" comes from the upper-left
  zoomLevels: Object.freeze([1, 2]),
});
