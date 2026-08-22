// Tileable bark texture sets (albedo + normal + roughness) per species, generated on Canvas2D from
// seeded noise. One tile = `tileMetres` × `tileMetres` of bark. Results are cached per (species, seed, size).
import {
  clamp01, lerp, smoothstep, hsl, mixRgb, scaleRgb, makePeriodicNoise2D, fbmTile, ridgedTile,
  makePeriodicCells, idRand, heightToNormalMap, canvasFromPixels, toTexture, createCanvas,
} from "./tree-texture-utils.js";
import { Rng, hash32 } from "../../core/rng.js";

const cache = new Map();

/** Per-species tiling + normal strength; the generators below paint height + albedo + roughness. */
const BARK_SPECS = Object.freeze({
  pine:  { tileMetres: 1.0, normalStrength: 3.2, normalScale: 1.0, generate: paintPine },
  oak:   { tileMetres: 1.0, normalStrength: 2.8, normalScale: 1.0, generate: paintOak },
  beech: { tileMetres: 1.6, normalStrength: 1.2, normalScale: 0.5, generate: paintBeech },
  maple: { tileMetres: 1.2, normalStrength: 2.0, normalScale: 0.75, generate: paintMaple },
});

/**
 * @param {"pine"|"oak"|"beech"|"maple"|"hazel"} species  (hazel shares the maple bark)
 * @param {{ seed?: number|string, size?: number }} options
 * @returns {{ map, normalMap, roughnessMap, tileMetres:number, normalScale:number }}
 */
export function getBarkTextures(species, { seed = 1, size = 512 } = {}) {
  const key = `${species}:${seed}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const spec = BARK_SPECS[species] || BARK_SPECS.maple;
  const set = buildBarkSet(spec, `${seed}:bark:${species}`, size);
  cache.set(key, set);
  return set;
}

export function disposeBarkTextures() {
  for (const set of cache.values()) { set.map.dispose(); set.normalMap.dispose(); set.roughnessMap.dispose(); }
  cache.clear();
}

function buildBarkSet(spec, seed, size) {
  const n = size * size;
  const layers = { height: new Float32Array(n), albedo: new Uint8ClampedArray(n * 4), rough: new Uint8ClampedArray(n * 4) };
  const ctx = { size, seed, noise: makePeriodicNoise2D(seed), rng: new Rng(hash32(seed)) };
  spec.generate(ctx, layers);
  const albedoCanvas = canvasFromPixels(layers.albedo, size, size);
  const normalCanvas = canvasFromPixels(heightToNormalMap(layers.height, size, size, spec.normalStrength * (size / 512)), size, size);
  const roughCanvas = canvasFromPixels(layers.rough, size, size);
  return {
    map: toTexture(albedoCanvas, { srgb: true }),
    normalMap: toTexture(normalCanvas),
    roughnessMap: toTexture(roughCanvas),
    tileMetres: spec.tileMetres,
    normalScale: spec.normalScale,
  };
}

/** Runs `fn(u, v, i)` for every texel; fn returns { h, rgb, rough }. */
function forEachTexel(ctx, layers, fn) {
  const { size } = ctx;
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size; // v grows upwards (flipY canvas textures)
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const i = y * size + x;
      const r = fn(u, v, i);
      layers.height[i] = r.h;
      const o = i * 4;
      layers.albedo[o] = r.rgb[0]; layers.albedo[o + 1] = r.rgb[1]; layers.albedo[o + 2] = r.rgb[2]; layers.albedo[o + 3] = 255;
      const g = clamp01(r.rough) * 255;
      layers.rough[o] = g; layers.rough[o + 1] = g; layers.rough[o + 2] = g; layers.rough[o + 3] = 255;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Pine (Schwarzkiefer): thick irregular plates separated by deep dark fissures; grey-brown plates,
// some warmer/redder, fine flaky scales on top.
function paintPine(ctx, layers) {
  const { noise } = ctx;
  const cells = makePeriodicCells(`${ctx.seed}:cells`, 7, 4, 0.9);
  const cellsFine = makePeriodicCells(`${ctx.seed}:flakes`, 22, 14, 0.9);
  const greyPlate = hsl(26, 0.10, 0.36), warmPlate = hsl(18, 0.30, 0.34), redWall = hsl(14, 0.45, 0.24);
  const fissure = hsl(22, 0.25, 0.09), light = hsl(30, 0.10, 0.50);
  forEachTexel(ctx, layers, (u, v) => {
    // domain warp so plate edges wander
    const wu = u + 0.035 * fbmTile(noise, u + 0.31, v, 3, 3, 3);
    const wv = v + 0.035 * fbmTile(noise, u, v + 0.77, 3, 3, 3);
    const c = cells(wu, wv);
    const edge = c.f2 - c.f1;                                   // 0 at fissure centre
    const plate = smoothstep(0.06, 0.26, edge);                 // 1 on the plate top
    const flakes = cellsFine(u, v);
    const flake = smoothstep(0.05, 0.2, flakes.f2 - flakes.f1);
    const detail = fbmTile(noise, u, v, 24, 24, 3) * 0.5;
    const plateLift = idRand(c.id, 3) * 0.22;
    const h = plate * (0.62 + plateLift + 0.10 * flake + 0.05 * detail) + (1 - plate) * (0.06 + 0.05 * detail);
    const warm = idRand(c.id, 7);
    let rgb = mixRgb(greyPlate, warmPlate, smoothstep(0.35, 0.8, warm));
    rgb = mixRgb(rgb, light, 0.35 * flake * clamp01(0.5 + detail));
    rgb = mixRgb(redWall, rgb, smoothstep(0.0, 0.5, plate));  // fissure walls glow reddish
    rgb = mixRgb(fissure, rgb, smoothstep(0.02, 0.18, edge));
    rgb = scaleRgb(rgb, 0.92 + 0.16 * fbmTile(noise, u + 0.5, v + 0.5, 2, 2, 2));
    const rough = 0.78 + 0.18 * (1 - plate) + 0.04 * detail;
    return { h, rgb, rough };
  });
}

// ---------------------------------------------------------------------------------------------
// Oak: deep, wandering vertical furrows between rough grey-brown ridges, mossy tint low in furrows.
function paintOak(ctx, layers) {
  const { noise } = ctx;
  const ridgeGrey = hsl(32, 0.09, 0.44), ridgeBrown = hsl(28, 0.18, 0.36), furrow = hsl(24, 0.24, 0.15);
  const moss = hsl(88, 0.30, 0.34);
  forEachTexel(ctx, layers, (u, v) => {
    const warp = 0.05 * fbmTile(noise, u, v + 0.3, 2, 2, 3);
    const ridges = ridgedTile(noise, u + warp, v, 10, 3, 4, 0.55);       // anisotropic: vertical
    const secondary = ridgedTile(noise, u * 1 + 0.5 + warp * 0.5, v, 20, 6, 3, 0.5);
    const grain = fbmTile(noise, u, v, 30, 6, 3);
    const h = clamp01(0.15 + 0.62 * Math.pow(ridges, 1.4) + 0.18 * secondary + 0.05 * grain);
    const top = smoothstep(0.35, 0.8, h);
    let rgb = mixRgb(furrow, mixRgb(ridgeBrown, ridgeGrey, smoothstep(0.55, 0.9, h)), top);
    rgb = scaleRgb(rgb, 0.9 + 0.2 * (0.5 + 0.5 * grain));
    const mossMask = smoothstep(0.15, 0.6, fbmTile(noise, u + 0.2, v + 0.6, 2, 2, 3)) * (1 - top) * 0.7;
    rgb = mixRgb(rgb, moss, mossMask);
    const rough = 0.86 + 0.1 * (1 - top);
    return { h, rgb, rough };
  });
}

// ---------------------------------------------------------------------------------------------
// Beech: smooth silver-grey, mottled, horizontal lenticel dashes, patches of green algae.
function paintBeech(ctx, layers) {
  const { noise, size, rng } = ctx;
  const grey = hsl(70, 0.05, 0.60), greyDark = hsl(60, 0.05, 0.50), algae = hsl(92, 0.28, 0.42), dark = hsl(50, 0.06, 0.40);
  forEachTexel(ctx, layers, (u, v) => {
    const mottle = fbmTile(noise, u, v, 3, 3, 4);
    const fine = fbmTile(noise, u + 0.4, v, 18, 18, 3);
    const algaeMask = smoothstep(0.05, 0.55, fbmTile(noise, u + 0.7, v + 0.2, 2, 2, 3) + 0.25 * fine) * 0.7;
    const h = 0.5 + 0.06 * mottle + 0.03 * fine + 0.04 * algaeMask;
    let rgb = mixRgb(greyDark, grey, 0.5 + 0.5 * mottle);
    rgb = mixRgb(rgb, dark, smoothstep(0.35, 0.8, -fine) * 0.35);
    rgb = mixRgb(rgb, algae, algaeMask);
    const rough = 0.58 + 0.25 * algaeMask + 0.06 * fine;
    return { h, rgb, rough };
  });
  // lenticels: short dark horizontal dashes stamped into albedo + a shallow dent in height
  const dashes = 260;
  const dashRgb = hsl(50, 0.05, 0.36);
  for (let k = 0; k < dashes; k++) {
    const cx = rng.int(0, size - 1), cy = rng.int(0, size - 1);
    const len = rng.int(3, 8) * (size / 512), thick = Math.max(1, Math.round(1.5 * (size / 512)));
    for (let dy = 0; dy < thick; dy++) {
      for (let dx = -len; dx <= len; dx++) {
        const x = (cx + dx + size) % size, y = (cy + dy) % size;
        const i = y * size + x, o = i * 4;
        const t = 0.75 - 0.4 * (Math.abs(dx) / len);
        layers.albedo[o] = lerp(layers.albedo[o], dashRgb[0], t);
        layers.albedo[o + 1] = lerp(layers.albedo[o + 1], dashRgb[1], t);
        layers.albedo[o + 2] = lerp(layers.albedo[o + 2], dashRgb[2], t);
        layers.height[i] -= 0.05 * t;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Maple (sycamore-like): grey-brown with shallow vertical fissures and small flaking plates,
// often green with algae on the shaded side (see the on-site photo).
function paintMaple(ctx, layers) {
  const { noise } = ctx;
  const cells = makePeriodicCells(`${ctx.seed}:mcells`, 9, 5, 0.9);
  const base = hsl(30, 0.10, 0.42), lightGrey = hsl(40, 0.06, 0.52), fissure = hsl(24, 0.18, 0.20), algae = hsl(85, 0.32, 0.40);
  forEachTexel(ctx, layers, (u, v) => {
    const warp = 0.04 * fbmTile(noise, u + 0.1, v + 0.5, 2, 2, 3);
    const ridges = ridgedTile(noise, u + warp, v, 8, 2.5, 4, 0.5);
    const c = cells(u + warp * 0.5, v);
    const plate = smoothstep(0.04, 0.16, c.f2 - c.f1);
    const grain = fbmTile(noise, u, v, 24, 8, 3);
    const h = clamp01(0.3 + 0.35 * ridges + 0.15 * plate * (0.7 + 0.3 * idRand(c.id, 2)) + 0.05 * grain);
    let rgb = mixRgb(fissure, mixRgb(base, lightGrey, smoothstep(0.4, 0.9, h)), smoothstep(0.25, 0.6, h));
    rgb = scaleRgb(rgb, 0.92 + 0.14 * grain);
    const algaeMask = smoothstep(0.0, 0.5, fbmTile(noise, u + 0.6, v + 0.8, 2, 2, 3) + 0.2 * grain) * 0.75;
    rgb = mixRgb(rgb, algae, algaeMask);
    const rough = 0.72 + 0.15 * (1 - smoothstep(0.3, 0.7, h)) + 0.1 * algaeMask;
    return { h, rgb, rough };
  });
}

/** Debug helper for the dev harness: paints all bark albedo tiles side by side into one canvas. */
export function makeBarkContactSheet(seed = 1, size = 256) {
  const species = Object.keys(BARK_SPECS);
  const { canvas, ctx } = createCanvas(size * species.length, size);
  species.forEach((s, i) => ctx.drawImage(getBarkTextures(s, { seed, size }).map.image, i * size, 0));
  return canvas;
}
