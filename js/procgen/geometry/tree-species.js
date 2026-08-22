// Species archetype parameters for the procedural trees (metres, radians, fractions of height).
// Calibrated on the Kahlenberg photos: tall straight black pines with crowns only in the top third,
// broad oaks/beeches, smaller maples, multi-stem hazel understory.

export const TREE_SPECIES = Object.freeze({
  pine: {
    label: "Schwarzkiefer",
    height: [18, 28], trunkRadius: [0.30, 0.42],
    taper: 1.0, lean: 0.012, wobble: 0.010,
    crownBase: 0.60, crownRadius: 0.19, crownShape: "umbrella",
    branching: { kind: "whorls", whorls: [5, 7], perWhorl: [3, 5], elevationLow: -0.05, elevationHigh: 0.55, curl: 0.25, children: [1, 2], radiusRatio: 0.32 },
    cards: { count: [190, 260], size: [1.4, 2.1], orientation: "plates", tipFraction: 1.0 },
    bark: "pine", foliage: "pine",
    trunkTintLow: [0.80, 0.80, 0.82], trunkTintHigh: [1.25, 0.98, 0.78],
    sway: 0.55, flutter: 0.045, translucency: 0.10,
    ringSegments: [12, 7], branchSegments: [7, 5],
    variants: 2,
  },
  oak: {
    label: "Eiche",
    height: [14, 22], trunkRadius: [0.34, 0.52],
    taper: 1.15, lean: 0.03, wobble: 0.03,
    crownBase: 0.34, crownRadius: 0.31, crownShape: "round",
    branching: { kind: "main", count: [5, 7], elevationLow: 0.25, elevationHigh: 0.75, curl: 0.18, children: [2, 3], radiusRatio: 0.48, trunkTop: 0.62 },
    cards: { count: [230, 320], size: [1.7, 2.6], orientation: "random", tipFraction: 0.45 },
    bark: "oak", foliage: "oak",
    trunkTintLow: [0.85, 0.85, 0.85], trunkTintHigh: [1.05, 1.02, 0.98],
    sway: 0.35, flutter: 0.06, translucency: 0.22,
    ringSegments: [14, 8], branchSegments: [7, 5],
    variants: 2,
  },
  beech: {
    label: "Buche",
    height: [16, 24], trunkRadius: [0.30, 0.44],
    taper: 1.05, lean: 0.015, wobble: 0.015,
    crownBase: 0.36, crownRadius: 0.27, crownShape: "round",
    branching: { kind: "main", count: [4, 6], elevationLow: 0.45, elevationHigh: 0.95, curl: 0.12, children: [2, 3], radiusRatio: 0.45, trunkTop: 0.68 },
    cards: { count: [220, 300], size: [1.6, 2.4], orientation: "random", tipFraction: 0.45 },
    bark: "beech", foliage: "beech",
    trunkTintLow: [0.92, 0.92, 0.90], trunkTintHigh: [1.04, 1.04, 1.02],
    sway: 0.38, flutter: 0.07, translucency: 0.30,
    ringSegments: [12, 7], branchSegments: [7, 5],
    variants: 2,
  },
  maple: {
    label: "Ahorn",
    height: [10, 16], trunkRadius: [0.22, 0.34],
    taper: 1.1, lean: 0.04, wobble: 0.03,
    crownBase: 0.33, crownRadius: 0.32, crownShape: "round",
    branching: { kind: "main", count: [4, 6], elevationLow: 0.4, elevationHigh: 0.9, curl: 0.15, children: [2, 3], radiusRatio: 0.5, trunkTop: 0.62 },
    cards: { count: [170, 240], size: [1.4, 2.1], orientation: "random", tipFraction: 0.45 },
    bark: "maple", foliage: "maple",
    trunkTintLow: [0.90, 0.92, 0.88], trunkTintHigh: [1.02, 1.0, 0.98],
    sway: 0.30, flutter: 0.075, translucency: 0.30,
    ringSegments: [11, 7], branchSegments: [6, 5],
    variants: 2,
  },
  hazel: {
    label: "Hasel",
    height: [3, 6], trunkRadius: [0.05, 0.08],
    taper: 1.0, lean: 0.06, wobble: 0.04,
    crownBase: 0.30, crownRadius: 0.40, crownShape: "round",
    branching: { kind: "stems", stems: [3, 5], spread: 0.35, elevationLow: 0.9, elevationHigh: 1.35, curl: 0.1, children: [1, 2], radiusRatio: 0.55 },
    cards: { count: [90, 130], size: [0.8, 1.2], orientation: "random", tipFraction: 0.5 },
    bark: "maple", foliage: "hazel",
    trunkTintLow: [0.85, 0.85, 0.82], trunkTintHigh: [0.95, 0.95, 0.9],
    sway: 0.18, flutter: 0.06, translucency: 0.30,
    ringSegments: [8, 6], branchSegments: [6, 5],
    variants: 1,
  },
});

export const SPECIES_IDS = Object.freeze(Object.keys(TREE_SPECIES));

/** LOD budgets: card keep-ratio and card scale per LOD (0 = full, 1 = mid). LOD 2 = impostor. */
export const TREE_LOD = Object.freeze({
  cardKeep: [1.0, 0.36],
  cardScale: [1.0, 1.45],
  ringsPerMetre: [1.0, 0.5],
  branchDepth: [2, 1],
});
