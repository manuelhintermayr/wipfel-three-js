// Tileable timber texture sets (albedo + normal + roughness) for the park structures, painted on
// Canvas2D from seeded periodic noise. Three sets, all with the grain running along the U axis:
//   plank     – sawn deck board, warm grey-brown, growth-ring figure, knots, saw marks
//   log       – round debarked pole, drying checks, darker and warmer than a board
//   weathered – heavily silvered grey timber, raised grain, deep splits, lichen spots
// One tile covers `tileMetres` × `tileMetres`; the geometry helpers in js/park/timber.js scale the
// UVs accordingly. Results are cached per (seed, size).
import {
  clamp01, smoothstep, hsl, mixRgb, scaleRgb, makePeriodicNoise2D, fbmTile,
  heightToNormalMap, canvasFromPixels, toTexture, createCanvas,
} from "./tree-texture-utils.js";
import { Rng, hash32 } from "../../core/rng.js";

const cache = new Map();

/** Per-set tiling, normal strength and painter. */
const WOOD_SPECS = Object.freeze({
  plank: { tileMetres: 0.80, normalStrength: 2.0, normalScale: 0.8, generate: paintPlank },
  log: { tileMetres: 1.20, normalStrength: 2.8, normalScale: 1.0, generate: paintLog },
  weathered: { tileMetres: 0.90, normalStrength: 3.4, normalScale: 1.2, generate: paintWeathered },
});

export const WOOD_KINDS = Object.freeze(Object.keys(WOOD_SPECS));

/**
 * Timber texture sets for the whole park. Cached – calling it twice with the same seed is free.
 * @param {number|string} seed
 * @param {{ size?: number }} [options] texture edge length in pixels (power of two)
 * @returns {{ plank: WoodSet, log: WoodSet, weathered: WoodSet }}
 *   WoodSet = { map, normalMap, roughnessMap, tileMetres, normalScale }
 */
export function getWoodTextures(seed = 1, { size = 512 } = {}) {
  const key = `${seed}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const sets = {};
  for (const [kind, spec] of Object.entries(WOOD_SPECS)) sets[kind] = buildWoodSet(spec, `${seed}:wood:${kind}`, size);
  Object.freeze(sets);
  cache.set(key, sets);
  return sets;
}

export function disposeWoodTextures() {
  for (const sets of cache.values()) {
    for (const set of Object.values(sets)) { set.map.dispose(); set.normalMap.dispose(); set.roughnessMap.dispose(); }
  }
  cache.clear();
}

function buildWoodSet(spec, seed, size) {
  const n = size * size;
  const layers = { height: new Float32Array(n), albedo: new Uint8ClampedArray(n * 4), rough: new Uint8ClampedArray(n * 4) };
  const ctx = { size, seed, noise: makePeriodicNoise2D(seed), rng: new Rng(hash32(seed)) };
  spec.generate(ctx, layers);
  return {
    map: toTexture(canvasFromPixels(layers.albedo, size, size), { srgb: true }),
    normalMap: toTexture(canvasFromPixels(heightToNormalMap(layers.height, size, size, spec.normalStrength * (size / 512)), size, size)),
    roughnessMap: toTexture(canvasFromPixels(layers.rough, size, size)),
    tileMetres: spec.tileMetres,
    normalScale: spec.normalScale,
  };
}

/** Runs `fn(u, v, i)` for every texel; fn returns { h, rgb, rough }. u runs along the grain. */
function forEachTexel(ctx, layers, fn) {
  const { size } = ctx;
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;                 // v grows upwards (flipY canvas textures)
    for (let x = 0; x < size; x++) {
      const r = fn((x + 0.5) / size, v);
      const i = y * size + x, o = i * 4;
      layers.height[i] = r.h;
      layers.albedo[o] = r.rgb[0]; layers.albedo[o + 1] = r.rgb[1]; layers.albedo[o + 2] = r.rgb[2]; layers.albedo[o + 3] = 255;
      const g = clamp01(r.rough) * 255;
      layers.rough[o] = g; layers.rough[o + 1] = g; layers.rough[o + 2] = g; layers.rough[o + 3] = 255;
    }
  }
}

/**
 * Knot field on the torus: `field(u, v) → { d, dv, swirl }` with `d` = distance to the nearest knot
 * in knot radii (< 1 = inside the dark core) and `swirl` = 1 near the knot, fading outwards.
 * Knots are elongated along the grain because a board cuts the branch at an angle.
 */
function makeKnotField(seed, count, minR, maxR) {
  const rng = new Rng(hash32(seed));
  const knots = Array.from({ length: count }, () => ({
    u: rng.next(), v: rng.next(), r: rng.float(minR, maxR), lean: rng.float(1.4, 2.6), dark: rng.float(0.7, 1),
  }));
  return function field(u, v) {
    let best = knots[0], bestD = 1e9, bestDv = 0;
    for (const k of knots) {
      let du = u - k.u, dv = v - k.v;
      du -= Math.round(du); dv -= Math.round(dv);                       // wrap-aware
      const d = Math.hypot(du / k.lean, dv) / k.r;
      if (d < bestD) { bestD = d; bestDv = dv; best = k; }
    }
    return { d: bestD, dv: bestDv, dark: best.dark, swirl: Math.exp(-Math.max(0, bestD - 0.8) * 1.5) };
  };
}

// ---------------------------------------------------------------------------------------------
// Plank: flat-sawn board. Growth rings wander along the board (cathedral figure), latewood lines are
// darker and very slightly recessed, a few knots deflect the rings, faint circular-saw marks across.
function paintPlank(ctx, layers) {
  const { noise } = ctx;
  const knots = makeKnotField(`${ctx.seed}:knots`, 5, 0.030, 0.062);
  const early = hsl(33, 0.20, 0.55), late = hsl(26, 0.26, 0.37), pale = hsl(40, 0.13, 0.66);
  const knotCore = hsl(22, 0.34, 0.21), knotRing = hsl(24, 0.30, 0.32);
  forEachTexel(ctx, layers, (u, v) => {
    const k = knots(u, v);
    const wander = 0.034 * fbmTile(noise, u, v * 0.5, 3, 2, 4);          // slow arching of the rings
    const bulge = 0.038 * k.swirl * Math.sign(k.dv || 1);                // rings bow around a knot
    const ring = (v + wander + bulge) * 30;
    const frac = ring - Math.floor(ring);
    const band = smoothstep(0.58, 0.74, frac) * (1 - smoothstep(0.80, 0.96, frac));
    const fibre = fbmTile(noise, u, v, 3, 96, 2);                        // fine longitudinal streaks
    const blotch = fbmTile(noise, u + 0.4, v + 0.2, 2, 2, 3);
    const saw = 0.5 + 0.5 * Math.sin((u + 0.03 * fibre) * Math.PI * 2 * 34);
    let rgb = mixRgb(early, late, band * 0.62);
    rgb = mixRgb(rgb, pale, clamp01(0.35 * fibre + 0.12) * (1 - band));
    rgb = scaleRgb(rgb, 0.90 + 0.16 * blotch + 0.03 * saw);
    let h = 0.55 - 0.10 * band + 0.05 * fibre + 0.03 * blotch + 0.012 * saw;
    let rough = 0.74 + 0.10 * band + 0.05 * fibre;
    if (k.d < 2.2) {                                                     // knot core + halo
      const core = 1 - smoothstep(0.55, 1.0, k.d);
      const halo = (1 - smoothstep(1.0, 2.2, k.d)) * (1 - core);
      rgb = mixRgb(rgb, knotRing, halo * 0.55 * k.dark);
      rgb = mixRgb(rgb, knotCore, core * k.dark);
      h -= 0.14 * core;
      rough += 0.10 * core;
    }
    return { h: clamp01(h), rgb, rough };
  });
}

// ---------------------------------------------------------------------------------------------
// Log: round pole, bark peeled. Long fibres, spiral drying checks that run down the pole, a few
// branch stubs, and darker weather streaks. Warmer and more saturated than a sawn board.
function paintLog(ctx, layers) {
  const { noise } = ctx;
  const stubs = makeKnotField(`${ctx.seed}:stubs`, 4, 0.035, 0.070);
  const base = hsl(30, 0.30, 0.50), dark = hsl(22, 0.32, 0.33), pale = hsl(36, 0.22, 0.63);
  const checkCol = hsl(20, 0.30, 0.19), stubCol = hsl(20, 0.36, 0.23);
  forEachTexel(ctx, layers, (u, v) => {
    const k = stubs(u, v);
    const fibre = fbmTile(noise, u, v, 2, 110, 2);                       // dense lengthwise fibres
    const streak = fbmTile(noise, u * 0.5, v, 2, 14, 3);                 // wider weather streaks
    const blotch = fbmTile(noise, u + 0.7, v + 0.3, 2, 2, 4);
    // drying checks: a few deep splits that run nearly parallel to the fibres
    const checkLine = fbmTile(noise, u * 0.35, v, 1, 13, 2) + 0.35 * fibre;
    const check = 1 - smoothstep(0.0, 0.05, Math.abs(checkLine));
    let rgb = mixRgb(base, pale, clamp01(0.42 * fibre + 0.5 * smoothstep(0.1, 0.7, streak)));
    rgb = mixRgb(rgb, dark, clamp01(0.45 * smoothstep(0.1, 0.75, -streak) + 0.2 * (0.5 - blotch)));
    rgb = scaleRgb(rgb, 0.90 + 0.18 * blotch);
    rgb = mixRgb(rgb, checkCol, check * 0.60);
    let h = 0.60 + 0.10 * fibre + 0.06 * streak + 0.04 * blotch - 0.34 * check;
    let rough = 0.78 + 0.08 * (1 - streak) + 0.08 * check;
    if (k.d < 1.8) {                                                     // sawn-off branch stub
      const core = 1 - smoothstep(0.5, 1.0, k.d);
      const rim = (1 - smoothstep(1.0, 1.8, k.d)) * (1 - core);
      rgb = mixRgb(rgb, stubCol, (core + 0.45 * rim) * k.dark);
      h += 0.10 * rim - 0.06 * core;
      rough += 0.08 * core;
    }
    return { h: clamp01(h), rgb, rough };
  });
}

// ---------------------------------------------------------------------------------------------
// Weathered: years of rain and sun. The soft earlywood has eroded away, so the latewood stands proud
// (strong height contrast), the colour has silvered to grey with brown in the cracks, and lichen and
// algae have settled on the north side. This is the look of the park's older deck boards.
function paintWeathered(ctx, layers) {
  const { noise } = ctx;
  const knots = makeKnotField(`${ctx.seed}:wknots`, 4, 0.028, 0.058);
  const silver = hsl(44, 0.045, 0.61), grey = hsl(38, 0.05, 0.47), warm = hsl(28, 0.16, 0.38);
  const crack = hsl(26, 0.18, 0.18), lichen = hsl(80, 0.18, 0.49), knotCore = hsl(24, 0.25, 0.19);
  forEachTexel(ctx, layers, (u, v) => {
    const k = knots(u, v);
    const wander = 0.032 * fbmTile(noise, u, v * 0.5, 3, 2, 4);
    const bulge = 0.034 * k.swirl * Math.sign(k.dv || 1);
    const ring = (v + wander + bulge) * 27;
    const frac = ring - Math.floor(ring);
    const proud = smoothstep(0.55, 0.72, frac) * (1 - smoothstep(0.78, 0.95, frac));   // raised latewood
    const fibre = fbmTile(noise, u, v, 3, 120, 2);
    const blotch = fbmTile(noise, u + 0.25, v + 0.6, 2, 2, 4);
    // splits: long shakes that follow the grain, much deeper than on a fresh board
    const splitLine = fbmTile(noise, u * 0.4, v, 1, 15, 2) + 0.25 * fibre;
    const split = 1 - smoothstep(0.0, 0.032, Math.abs(splitLine));
    let rgb = mixRgb(grey, silver, clamp01(0.55 + 0.5 * proud + 0.3 * fibre));
    rgb = mixRgb(rgb, warm, clamp01(0.35 * (1 - proud) * (0.5 - blotch) + 0.25 * split));
    rgb = scaleRgb(rgb, 0.88 + 0.20 * blotch + 0.06 * fibre);
    const lichenMask = smoothstep(0.30, 0.75, fbmTile(noise, u + 0.8, v + 0.15, 3, 3, 3) + 0.25 * blotch) * 0.55;
    rgb = mixRgb(rgb, lichen, lichenMask * (1 - split));
    rgb = mixRgb(rgb, crack, split * 0.62);
    let h = 0.50 + 0.24 * proud + 0.08 * fibre + 0.04 * blotch - 0.32 * split;
    let rough = 0.86 + 0.07 * (1 - proud) + 0.05 * split - 0.06 * lichenMask;
    if (k.d < 2.0) {
      const core = 1 - smoothstep(0.5, 1.0, k.d);
      rgb = mixRgb(rgb, knotCore, core * k.dark);
      h += 0.14 * core;                                                  // knots weather proud
      rough += 0.06 * core;
    }
    return { h: clamp01(h), rgb, rough };
  });
}

/** Debug helper for dev harnesses: all three albedo tiles side by side in one canvas. */
export function makeWoodContactSheet(seed = 1, size = 256) {
  const sets = getWoodTextures(seed, { size });
  const kinds = WOOD_KINDS;
  const { canvas, ctx } = createCanvas(size * kinds.length, size);
  kinds.forEach((kind, i) => ctx.drawImage(sets[kind].map.image, i * size, 0));
  return canvas;
}
