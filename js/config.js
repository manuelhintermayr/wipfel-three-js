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
    { id: "s110", minCm: 110, allowed: ["green", "blue"],                       massKg: 32 },
    { id: "s130", minCm: 130, allowed: ["green", "blue", "red"],                massKg: 45 },
    { id: "s150", minCm: 150, allowed: ["green", "blue", "red", "black"],       massKg: 60 },
    { id: "adult", minCm: 160, allowed: ["green", "blue", "red", "black", "legendary"], massKg: 78 },
  ]),
});

export const DEFAULTS = Object.freeze({
  seed: 1,
  locale: "en",
  belayMode: "smart",        // "continuous" | "smart" | "classic"
});
