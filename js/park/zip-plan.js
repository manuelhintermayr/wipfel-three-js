// Where a Flying Fox may go. This is the first piece of the layout **validation** M1.1 will own for
// the whole park (ROADMAP: "cable angle, clearance, no tree penetration, landing zones, zip gradient
// 3–6 %"); for now it answers one question, for one cable, against the real terrain and the real
// forest, and it answers it the same way for the same seed.
//
// The rules, in the order a builder would check them (RESEARCH-DATA §6):
//   1. gradient 4.5–6 % of the chord – steeper needs a bungee block, flatter does not run
//   2. the arrival deck ends up between 1.6 and 2.8 m over the ground, so it can be reached by a ramp
//   3. the rider's feet keep `minClearance` metres of air over the middle of the span
//   4. the corridor is free: no trunk inside `trunkClear`, no crown the cable would run *through*
//   5. the landing is not on a walked path
// Nothing here touches THREE or the scene – it hands back numbers. js/park/layout-route.js is the
// production caller now (searches once per route at generation time); js/park/loader.js turns the
// already-searched result into a scene, never calling planZipline itself.

import { TREE_SPECIES } from "../procgen/geometry/tree-species.js";

export const ZIP_PLAN = Object.freeze({
  minLength: 40, maxLength: 56, lengthStep: 1,
  minGradient: 0.045, maxGradient: 0.060, gradientSteps: 7, idealGradient: 0.055,
  minDeckHeight: 1.6, maxDeckHeight: 2.8, idealDeckHeight: 2.1,
  minClearance: 2.2,           // metres of air under the rider's feet …
  clearFrom: 0.08, clearTo: 0.90,   // … over this part of the span (the ends are the platforms)
  clearSamples: 24,
  pathRadius: 3.5,             // the landing sits this far clear of a walked path
  trunkClear: 2.6,             // horizontal clearance to any trunk in the corridor
  crownClear: 1.5,             // …and to a crown the cable would pass through
  corridorWidth: 9,            // trees further out than this can never matter
  startClear: 3.0,             // the first metres belong to the platform's own tree
  angles: 120,
  /** Second pass when the seed left no clean line: still safe, just less pretty. */
  relaxed: Object.freeze({ minGradient: 0.035, maxGradient: 0.075, minClearance: 1.5, crownClear: 0.6, maxDeckHeight: 3.2 }),
});

/**
 * @param {{ tree: {x,z}, platformTop: number, cableHeight: number, seatDrop: number,
 *   startOffset?: number, home: {x,z}, terrain, forest, config?: object }} options
 *   `platformTop` = world y of the departure deck, `startOffset` = how far out from the trunk axis
 *   the cable leaves the deck, `home` = where the player has to walk back to.
 * @returns {{ dir: {x,z}, start: {x,z}, length: number, gradient: number, drop: number, deckTop: number,
 *   deckHeight: number, landing: {x,y,z}, clearance: number, margin: number, relaxed: boolean }|null}
 */
export function planZipline({ tree, platformTop, cableHeight, seatDrop, startOffset = 0, home, terrain, forest, config = {} }) {
  const base = { ...ZIP_PLAN, ...config };
  const input = { tree, platformTop, cableHeight, seatDrop, startOffset, home, terrain, forest };
  return search(base, false, input) || search({ ...base, ...base.relaxed }, true, input);
}

function search(C, relaxed, { tree, platformTop, cableHeight, seatDrop, startOffset, home, terrain, forest }) {
  const nearby = (forest ? forest.trees : []).filter(
    (t) => Math.hypot(t.x - tree.x, t.z - tree.z) <= C.maxLength + 8 && Math.hypot(t.x - tree.x, t.z - tree.z) > 0.5,
  );
  let best = null;

  for (let a = 0; a < C.angles; a++) {
    const angle = (a / C.angles) * Math.PI * 2;
    const dir = { x: Math.cos(angle), z: Math.sin(angle) };
    const profile = sampleProfile(terrain, tree, dir, startOffset + C.maxLength);
    const corridor = projectTrees(nearby, tree, dir, C);
    for (let length = C.minLength; length <= C.maxLength; length += C.lengthStep) {
      const landingY = heightOn(profile, startOffset + length);
      for (let g = 0; g < C.gradientSteps; g++) {
        const gradient = C.minGradient + (C.maxGradient - C.minGradient) * (g / (C.gradientSteps - 1));
        const candidate = evaluate({ C, dir, length, gradient, landingY, profile, corridor, startOffset,
          tree, platformTop, cableHeight, seatDrop, home, terrain, relaxed });
        if (candidate && (!best || candidate.score < best.score)) best = candidate;
      }
    }
  }
  return best;
}

function evaluate({ C, dir, length, gradient, landingY, profile, corridor, startOffset, tree, platformTop, cableHeight, seatDrop, home, terrain, relaxed }) {
  const deckTop = platformTop - gradient * length;
  const deckHeight = deckTop - landingY;
  if (deckHeight < C.minDeckHeight || deckHeight > C.maxDeckHeight) return null;

  const far = startOffset + length;
  const landing = { x: tree.x + dir.x * far, y: landingY, z: tree.z + dir.z * far };
  if (crossesPath(terrain, landing, C.pathRadius)) return null;

  const sag = 0.02 * length;
  const cableAt = (u) => platformTop + cableHeight + (deckTop - platformTop) * u - sag * 4 * u * (1 - u);
  let clearance = Infinity;
  for (let i = 0; i <= C.clearSamples; i++) {
    const u = C.clearFrom + (C.clearTo - C.clearFrom) * (i / C.clearSamples);
    clearance = Math.min(clearance, cableAt(u) - seatDrop - heightOn(profile, startOffset + u * length));
  }
  if (clearance < C.minClearance) return null;

  let margin = Infinity;
  for (const t of corridor) {
    if (t.along > far + 4) continue;
    const u = Math.max(0, Math.min(1, (t.along - startOffset) / length));
    const y = cableAt(u);
    const inCrown = y > t.crownBottom - 1 && y < t.top + 1;
    const need = inCrown ? t.crownRadius + C.crownClear : Math.max(C.trunkClear, t.trunkRadius + 2.2);
    margin = Math.min(margin, t.perp - need);
  }
  if (margin < 0) return null;

  const walkHome = Math.hypot(landing.x - home.x, landing.z - home.z);
  const score = Math.abs(gradient - C.idealGradient) * 260
    + Math.abs(deckHeight - C.idealDeckHeight) * 3
    + walkHome * 0.30 - length * 0.40 - clearance * 0.60 - Math.min(margin, 4) * 0.80
    + (relaxed ? 1000 : 0);
  return {
    dir, length, gradient, drop: platformTop - deckTop, deckTop, deckHeight, landing,
    start: { x: tree.x + dir.x * startOffset, z: tree.z + dir.z * startOffset },
    clearance, margin, score, relaxed,
  };
}

/** Terrain height every metre along the ray, so the clearance test is array lookups, not noise. */
function sampleProfile(terrain, tree, dir, maxLength) {
  const n = Math.ceil(maxLength) + 2;
  const heights = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) heights[i] = terrain.heightAt(tree.x + dir.x * i, tree.z + dir.z * i);
  return heights;
}

function heightOn(profile, distance) {
  const d = Math.max(0, Math.min(profile.length - 1.001, distance));
  const i = Math.floor(d);
  return profile[i] + (profile[i + 1] - profile[i]) * (d - i);
}

/** Trees inside the corridor, in (along, perp) coordinates, with the vertical extent of the crown. */
function projectTrees(trees, tree, dir, C) {
  const out = [];
  for (const t of trees) {
    const rx = t.x - tree.x, rz = t.z - tree.z;
    const along = rx * dir.x + rz * dir.z;
    if (along < C.startClear) continue;
    const perp = Math.abs(rx * -dir.z + rz * dir.x);
    if (perp > C.corridorWidth) continue;
    const species = TREE_SPECIES[t.species] || TREE_SPECIES.pine;
    out.push({ along, perp, trunkRadius: t.trunkRadius || 0.4, crownRadius: t.crownRadius || 3,
      crownBottom: t.y + species.crownBase * t.height, top: t.y + t.height });
  }
  return out;
}

/** A landing must not sit on – or right next to – a path the park walks on. */
function crossesPath(terrain, landing, radius) {
  if (typeof terrain.isPath !== "function") return false;
  if (terrain.isPath(landing.x, landing.z)) return true;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (terrain.isPath(landing.x + Math.cos(a) * radius, landing.z + Math.sin(a) * radius)) return true;
  }
  return false;
}
