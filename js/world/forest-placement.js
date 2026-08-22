// Seeded tree placement: density map (noise + north bias + gullies + spawn focus), exclusions
// (paths, hubs, steep slopes, hero clearance), Poisson-like spacing by crown radius, species mix
// with hazel as understory. Pure logic – no three.js objects, so it stays unit-testable.
import { makeNoise2D, fbm2D } from "../core/rng.js";
import { TREE_SPECIES } from "../procgen/geometry/tree-species.js";

export const FOREST_RULES = Object.freeze({
  mix: Object.freeze({ pine: 0.40, oak: 0.15, beech: 0.15, maple: 0.15, hazel: 0.15 }),
  maxSlopeRad: (38 * Math.PI) / 180,
  pathClearance: 3.0,          // metres of trunk-free ground next to a path
  hubEdgeBand: 3.0,            // ring outside a hub where a few edge trees may stand
  hubEdgeChance: 0.22,
  spacingFactor: 0.55,         // × (crownA + crownB): crowns may interlace
  minSpacing: 2.4,             // trunks never closer than this
  hazelSpacing: 1.7,           // understory may hug big trunks
  hazelNearRadius: 9,          // hazel only within this distance of a canopy tree
  heroClearance: 2.5,          // free ring around hero trunks (platform room)
  attemptsPerTree: 45,
  boundsInset: 4,
  densityAccept: 0.8,
  focusRadius: 110,            // dense core around the spawn …
  focusFalloff: 260,           // … thinning towards this distance
  focusFloor: 0.3,             // relative density far away
});

const SPECIES = Object.keys(FOREST_RULES.mix);
const CELL = 6;

/**
 * @param {{ rng, terrain, heroTrees:Array, targetCount:number, archetypes: Record<string, Array> }} o
 *   archetypes[species][variant] = { height, trunkRadius, crownRadius }
 * @returns {Array<object>} tree records (see createForest)
 */
export function placeTrees({ rng, terrain, heroTrees = [], targetCount = 600, archetypes }) {
  const bounds = terrain.bounds || { min: { x: -240, z: -240 }, max: { x: 240, z: 240 } };
  const spawn = terrain.spawn || { x: 0, y: 0, z: 0 };
  const hubs = terrain.hubs || [];
  const noise = makeNoise2D(`${rng.seed}:forest-density`);
  const grid = new Map();
  const trees = [];

  const cellKey = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  const neighbours = (x, z, radius) => {
    const out = [], r = Math.ceil(radius / CELL);
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const list = grid.get(`${cx + i},${cz + j}`);
      if (list) out.push(...list);
    }
    return out;
  };
  const insert = (tree) => {
    const k = cellKey(tree.x, tree.z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(tree);
    trees.push(tree);
  };

  const densityAt = (x, z) => {
    const n = fbm2D(noise, x / 55, z / 55, 4);
    let d = 0.55 + 0.45 * n;
    const nz = (z - bounds.min.z) / Math.max(1, bounds.max.z - bounds.min.z);
    d *= 0.75 + 0.5 * nz;                                              // denser to the north (uphill)
    const h = terrain.heightAt(x, z);
    const around = (terrain.heightAt(x + 6, z) + terrain.heightAt(x - 6, z) + terrain.heightAt(x, z + 6) + terrain.heightAt(x, z - 6)) / 4;
    d *= 1 + Math.max(-0.35, Math.min(0.6, (around - h) / 2.5));      // gullies denser, ridges sparser
    const ds = Math.hypot(x - spawn.x, z - spawn.z);
    const focus = ds < FOREST_RULES.focusRadius ? 1 : Math.max(0, 1 - (ds - FOREST_RULES.focusRadius) / (FOREST_RULES.focusFalloff - FOREST_RULES.focusRadius));
    d *= FOREST_RULES.focusFloor + (1 - FOREST_RULES.focusFloor) * focus;
    return Math.max(0.03, Math.min(1.5, d));
  };

  const nearPath = (x, z) => {
    if (!terrain.isPath) return false;
    if (terrain.isPath(x, z)) return true;
    const c = FOREST_RULES.pathClearance;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (terrain.isPath(x + Math.cos(a) * c, z + Math.sin(a) * c)) return true;
    }
    return false;
  };

  const hubVerdict = (x, z) => {
    for (const hub of hubs) {
      const d = Math.hypot(x - hub.x, z - hub.z);
      if (d < hub.radius + 0.5) return "reject";
      if (d < hub.radius + FOREST_RULES.hubEdgeBand) return "edge";
    }
    return "ok";
  };

  const requiredSpacing = (a, b) => {
    const hazelA = a.species === "hazel", hazelB = b.species === "hazel";
    if (hazelA || hazelB) {
      const big = hazelA ? b : a;
      return Math.max(FOREST_RULES.hazelSpacing + (hazelA && hazelB ? 0.5 : 0.8), big.trunkRadius + 0.7);
    }
    return Math.max(FOREST_RULES.minSpacing, FOREST_RULES.spacingFactor * (a.crownRadius + b.crownRadius));
  };

  const fits = (cand) => {
    for (const other of neighbours(cand.x, cand.z, 14)) {
      const d = Math.hypot(cand.x - other.x, cand.z - other.z);
      if (d < requiredSpacing(cand, other)) return false;
      if (other.isHero && d < other.trunkRadius + FOREST_RULES.heroClearance) return false;
    }
    return true;
  };

  const makeRecord = (id, x, z, species, variant, height, isHero) => {
    const arch = archetypes[species][variant];
    const scale = height / arch.height;
    const widthScale = rng.float(0.88, 1.12);
    return {
      id, x, y: terrain.heightAt(x, z), z, species, height,
      trunkRadius: arch.trunkRadius * scale * widthScale,
      crownRadius: arch.crownRadius * scale * widthScale,
      isHero, variant, scale, widthScale, yaw: rng.float(0, Math.PI * 2),
      foliageTint: [rng.float(0.9, 1.08), rng.float(0.94, 1.06), rng.float(0.86, 1.08)],
      trunkTint: rng.float(0.86, 1.1),
    };
  };

  const pickSpecies = (x, z) => {
    let u = rng.next();
    for (const s of SPECIES) { u -= FOREST_RULES.mix[s]; if (u <= 0) return s; }
    return "pine";
  };
  const hasCanopyNear = (x, z) => neighbours(x, z, FOREST_RULES.hazelNearRadius).some((t) => t.species !== "hazel" && Math.hypot(t.x - x, t.z - z) < FOREST_RULES.hazelNearRadius);
  const sampleHeight = (species) => { const [lo, hi] = TREE_SPECIES[species].height; return rng.float(lo, hi); };

  // 1. hero trees – exact positions, always placed
  heroTrees.forEach((h, i) => {
    const species = h.species && archetypes[h.species] ? h.species : "pine";
    const variant = rng.int(0, archetypes[species].length - 1);
    insert(makeRecord(trees.length, h.x, h.z, species, variant, h.height ?? sampleHeight(species), true));
  });

  // 2. dart throwing with density + exclusions + spacing
  const w = bounds.max.x - bounds.min.x - 2 * FOREST_RULES.boundsInset;
  const dpt = bounds.max.z - bounds.min.z - 2 * FOREST_RULES.boundsInset;
  const maxAttempts = targetCount * FOREST_RULES.attemptsPerTree;
  for (let attempt = 0; attempt < maxAttempts && trees.length < targetCount + heroTrees.length; attempt++) {
    const x = bounds.min.x + FOREST_RULES.boundsInset + rng.next() * w;
    const z = bounds.min.z + FOREST_RULES.boundsInset + rng.next() * dpt;
    if (rng.next() > densityAt(x, z) * FOREST_RULES.densityAccept) continue;
    if (terrain.slopeAt && terrain.slopeAt(x, z) > FOREST_RULES.maxSlopeRad) continue;
    if (nearPath(x, z)) continue;
    const hub = hubVerdict(x, z);
    if (hub === "reject" || (hub === "edge" && rng.next() > FOREST_RULES.hubEdgeChance)) continue;
    let species = pickSpecies(x, z);
    if (species === "hazel" && !hasCanopyNear(x, z)) species = rng.next() < 0.5 ? "pine" : "maple";
    const variant = rng.int(0, archetypes[species].length - 1);
    const cand = makeRecord(trees.length, x, z, species, variant, sampleHeight(species), false);
    if (!fits(cand)) continue;
    insert(cand);
  }
  return trees;
}
