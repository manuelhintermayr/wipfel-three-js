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

/** @returns {object|null} */
export function catalogueEntry(kind) {
  for (const entry of CATALOGUE) if (entry.kind === kind) return entry;
  return null;
}
