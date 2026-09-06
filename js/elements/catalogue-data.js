// Pure metadata for the twelve rail-element kinds – no THREE, no imports at all. Every concrete
// element module pulls in THREE transitively through `element.js`, which plain `node --test` cannot
// resolve (this project has no bundler and no node_modules; "three" only exists via the browser
// import map in index.html) – so this file is the one place the catalogue's shape can be unit-tested.
//
// Each entry's `metrics` is a deliberate, documented duplicate of that kind's own exported config
// (e.g. `BARRELS.metrics` in barrels.js) – the one exception to "don't repeat the numbers" in this
// codebase, made only because there is no other way to check them without a browser. Keep both in
// sync by hand; `tests/unit/catalogue.test.mjs` only guards the *shape* (0–5 per axis), not drift.
export const CATALOGUE = Object.freeze([
  { kind: "burma-bridge", labelKey: "element.burma", discrete: false, metrics: Object.freeze({ physical: 2, coordination: 3, psychological: 3, technical: 1 }) },
  { kind: "hanging-planks", labelKey: "element.planks", discrete: true, metrics: Object.freeze({ physical: 1, coordination: 4, psychological: 4, technical: 1 }) },
  { kind: "net-bridge", labelKey: "element.net", discrete: false, metrics: Object.freeze({ physical: 4, coordination: 1, psychological: 1, technical: 1 }) },
  { kind: "zipline", labelKey: "element.zipline", discrete: false, metrics: Object.freeze({ physical: 1, coordination: 2, psychological: 2, technical: 3 }) },
  { kind: "beam-fixed", labelKey: "element.beamFixed", discrete: false, metrics: Object.freeze({ physical: 1, coordination: 3, psychological: 4, technical: 1 }) },
  { kind: "beam-swing", labelKey: "element.beamSwing", discrete: false, metrics: Object.freeze({ physical: 2, coordination: 4, psychological: 4, technical: 1 }) },
  { kind: "stirrups", labelKey: "element.stirrups", discrete: true, metrics: Object.freeze({ physical: 2, coordination: 4, psychological: 3, technical: 1 }) },
  { kind: "wire-loops", labelKey: "element.wireLoops", discrete: true, metrics: Object.freeze({ physical: 2, coordination: 5, psychological: 3, technical: 1 }) },
  { kind: "barrels", labelKey: "element.barrels", discrete: false, metrics: Object.freeze({ physical: 2, coordination: 5, psychological: 3, technical: 2 }) },
  { kind: "rings", labelKey: "element.rings", discrete: true, metrics: Object.freeze({ physical: 5, coordination: 3, psychological: 4, technical: 2 }) },
  { kind: "tarzan", labelKey: "element.tarzan", discrete: false, metrics: Object.freeze({ physical: 3, coordination: 3, psychological: 5, technical: 2 }) },
  { kind: "skate", labelKey: "element.skate", discrete: false, metrics: Object.freeze({ physical: 2, coordination: 5, psychological: 3, technical: 2 }) },
]);

/**
 * Parameter variants (ROADMAP M2b, GDD "Übungskatalog auf 20–25 Familien/Varianten"): each entry is an
 * existing base kind with a numeric `configOverride` – js/elements/element.js#registerElementVariant
 * (called once from js/elements/catalogue.js, after every base kind above has registered itself) merges
 * it over the base kind's own config, so no new mechanic exists anywhere for these eight. `metrics` is
 * the *variant's own* difficulty (documented against the base kind's own metrics above, so the delta is
 * visible at a glance) – js/park/layout-route.js#buildEdges only ever offers these to red-II-and-later
 * and black/legendary routes, so late routes feel meaner without changing what a blue beginner meets.
 */
export const CATALOGUE_VARIANTS = Object.freeze([
  {
    kind: "burma-narrow", baseKind: "burma-bridge", labelKey: "element.burmaNarrow", discrete: false,
    metrics: Object.freeze({ physical: 2, coordination: 4, psychological: 4, technical: 1 }),
    configOverride: Object.freeze({ handSpread: 0.30, slipAngle: 0.32 }),
  },
  {
    kind: "planks-long-gap", baseKind: "hanging-planks", labelKey: "element.planksLongGap", discrete: true,
    metrics: Object.freeze({ physical: 1, coordination: 4, psychological: 5, technical: 1 }),
    configOverride: Object.freeze({ gap: 0.62, maxPlanks: 8, slipAngle: 0.30 }),
  },
  {
    kind: "net-steep", baseKind: "net-bridge", labelKey: "element.netSteep", discrete: false,
    metrics: Object.freeze({ physical: 5, coordination: 1, psychological: 1, technical: 1 }),
    configOverride: Object.freeze({ sagRatio: 0.038, loadSag: 0.32, staminaDrain: 0.055 }),
  },
  {
    kind: "beam-swing-4seg", baseKind: "beam-swing", labelKey: "element.beamSwing4seg", discrete: false,
    metrics: Object.freeze({ physical: 3, coordination: 4, psychological: 4, technical: 1 }),
    configOverride: Object.freeze({ minSegments: 4, maxSegments: 4, maxSwing: 0.34 }),
  },
  {
    kind: "stirrups-wide", baseKind: "stirrups", labelKey: "element.stirrupsWide", discrete: true,
    metrics: Object.freeze({ physical: 3, coordination: 4, psychological: 4, technical: 1 }),
    configOverride: Object.freeze({ spacing: 0.62 }),
  },
  {
    kind: "rings-far", baseKind: "rings", labelKey: "element.ringsFar", discrete: true,
    metrics: Object.freeze({ physical: 5, coordination: 4, psychological: 4, technical: 2 }),
    configOverride: Object.freeze({ spacing: 0.68 }),
  },
  {
    kind: "barrels-3", baseKind: "barrels", labelKey: "element.barrels3", discrete: false,
    metrics: Object.freeze({ physical: 2, coordination: 5, psychological: 3, technical: 3 }),
    configOverride: Object.freeze({ minCount: 3, maxCount: 3 }),
  },
  {
    kind: "skate-long", baseKind: "skate", labelKey: "element.skateLong", discrete: false,
    metrics: Object.freeze({ physical: 3, coordination: 5, psychological: 3, technical: 2 }),
    configOverride: Object.freeze({ maxSpeed: 2.3, pushAccel: 1.6, slipAngle: 0.24 }),
  },
]);

/**
 * The two co-op catalogue kinds (ROADMAP M4, GDD §3.11 "Koop-Übungen"): js/elements/{team-bridge,
 * counterweight-lift}.js. Kept as their own array rather than appended to `CATALOGUE` above –
 * `tests/unit/catalogue.test.mjs` pins `CATALOGUE.length === 12` (the M1.8 twelve) on purpose, and
 * these two are never offered to the generator's own random pool (js/park/layout-route.js#buildEdges
 * places them deliberately via each route's `coopEdge` plan entry, js/park/layout.js#PARK_CONFIG) –
 * they are not "one of the kinds any route might roll", so they do not belong in that count either.
 * `catalogueEntry()` below still finds them, for the same label/metric lookups every other kind gets.
 */
export const COOP_CATALOGUE = Object.freeze([
  { kind: "team-bridge", labelKey: "element.teamBridge", discrete: false, metrics: Object.freeze({ physical: 2, coordination: 4, psychological: 3, technical: 1 }) },
  { kind: "counterweight-lift", labelKey: "element.counterweightLift", discrete: false, metrics: Object.freeze({ physical: 2, coordination: 2, psychological: 2, technical: 3 }) },
]);

/** @returns {object|null} looks up the base twelve, the eight M2b variants, and the two M4 co-op kinds. */
export function catalogueEntry(kind) {
  for (const entry of CATALOGUE) if (entry.kind === kind) return entry;
  for (const entry of CATALOGUE_VARIANTS) if (entry.kind === kind) return entry;
  for (const entry of COOP_CATALOGUE) if (entry.kind === kind) return entry;
  return null;
}
