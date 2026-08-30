// Shared park-map renderer (ROADMAP M1.4): both js/ui/course-map.js (the full-screen overlay, `Tab`)
// and js/park/park-board.js (the diegetic board in the world) paint the same park from the same two
// pure sources – `parkDef` (js/park/layout.js#generateParkLayout) and the terrain sampler – exactly
// like js/park/signs.js already does, so this module never touches the built `course` either and can
// run before or after js/park/loader.js.
//
// Two style presets:
//   "relief" – dark hillshade (height → green-dark gradient, a fixed "sun" direction shading the
//              slope via `terrain.normalAt`) with pale paths, the mockup's satellite-relief look.
//   "print"  – flat light-green base with darker green forest-patch blobs (seeded noise, not the real
//              terrain height) and pale paths, the real park-board photo's printed-map look.
// Both are baked at a small offscreen resolution and scaled up (soft/blurred on purpose – the mockup
// is not sharp either), because sampling the terrain per output pixel is the expensive part; the
// caller does that once and caches the canvas. Routes/legend/title are a second, cheap, vector pass –
// course-map.js redraws that part every frame (for hover/filter/pan/zoom), the park board bakes it in
// once alongside the background since a physical board never changes.
import * as THREE from "three";
import { CATEGORY_BY_ID, MAP } from "../config.js";
import { t } from "../core/i18n.js";
import { makeNoise2D, fbm2D } from "../core/rng.js";

const PATH_COLOUR = [214, 208, 190];
const RELIEF_LOW_LONG_EDGE = 150;   // samples along the longer edge of the *destination* canvas
// CATEGORY_BY_ID.black's true colour (near-black, 0x1c1c1e) reads fine on the white signage it was
// picked for, but disappears against this map's dark background/relief – every map surface (overlay
// and printed board alike) substitutes a light, still-neutral grey for "black" only; every other
// colour renders as its real category colour.
const MAP_BLACK_SUBSTITUTE = 0xd7d7dc;
export const mapColourOf = (category) => (category.id === "black" ? MAP_BLACK_SUBSTITUTE : category.colour);
const PRINT_GREEN_LIGHT = [186, 208, 150];
const PRINT_GREEN_DARK = [108, 138, 82];
const RELIEF_DARK = [16, 26, 19];
const RELIEF_LIGHT = [46, 64, 40];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v) | 0;
const mix3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
export const cssHex = (colour) => `#${colour.toString(16).padStart(6, "0")}`;

/** World-space bounding box the map needs to cover: the hub, every hero tree and every zip landing. */
export function computeBounds(parkDef, terrain) {
  const hub = terrain.hubs[0];
  let minX = hub.x - hub.radius, maxX = hub.x + hub.radius, minZ = hub.z - hub.radius, maxZ = hub.z + hub.radius;
  const grow = (x, z) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); };
  for (const tree of parkDef.heroTrees) grow(tree.x, tree.z);
  for (const route of parkDef.routes) { grow(route.entry.x, route.entry.z); if (route.zip) grow(route.zip.landing.x, route.zip.landing.z); }
  const marginX = (maxX - minX) * 0.08 + 4, marginZ = (maxZ - minZ) * 0.08 + 4;
  return { minX: minX - marginX, maxX: maxX + marginX, minZ: minZ - marginZ, maxZ: maxZ + marginZ };
}

/** Uniform-scale affine map from world (x, z) to canvas pixels, centred and padded to fit. */
export function createProjector(bounds, width, height, padding = MAP.padding) {
  const spanX = Math.max(1e-3, bounds.maxX - bounds.minX), spanZ = Math.max(1e-3, bounds.maxZ - bounds.minZ);
  const availW = Math.max(1, width - padding * 2), availH = Math.max(1, height - padding * 2);
  const scale = Math.min(availW / spanX, availH / spanZ);
  const offX = padding + (availW - spanX * scale) / 2, offY = padding + (availH - spanZ * scale) / 2;
  return {
    scale, width, height,
    toPx(x, z) { return [offX + (x - bounds.minX) * scale, offY + (z - bounds.minZ) * scale]; },
    toWorld(px, py) { return [bounds.minX + (px - offX) / scale, bounds.minZ + (py - offY) / scale]; },
  };
}

/**
 * Paints the expensive background (relief or print) into `canvas` (or a sub-rectangle of it, so
 * js/park/park-board.js can reserve a header strip above the map) and returns the projector it was
 * drawn with – callers reuse that projector for every dynamic overlay so world points land on the
 * exact same pixels the cached bitmap already has.
 * @param {HTMLCanvasElement} canvas
 * @param {{ parkDef, terrain, style?: "relief"|"print", seed?: number,
 *   viewport?: { x, y, width, height } }} options
 */
export function paintBackground(canvas, { parkDef, terrain, style = "relief", seed = 1, viewport = null }) {
  const vp = viewport || { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const ctx = canvas.getContext("2d");
  const bounds = computeBounds(parkDef, terrain);
  const projector = createProjector(bounds, vp.width, vp.height);
  // Sample at a fixed *budget* along the viewport's own longer edge – matching its aspect ratio, not
  // an arbitrary fixed one, so world-space sampling density stays even on both axes regardless of shape.
  const aspect = vp.width / vp.height;
  const lowW = aspect >= 1 ? RELIEF_LOW_LONG_EDGE : Math.max(8, Math.round(RELIEF_LOW_LONG_EDGE * aspect));
  const lowH = aspect >= 1 ? Math.max(8, Math.round(RELIEF_LOW_LONG_EDGE / aspect)) : RELIEF_LOW_LONG_EDGE;
  // Same aspect ratio as the viewport (so the upscale below is a uniform stretch) *and* the same
  // padding fraction, i.e. a scaled-down copy of `projector` itself – every low-res pixel lands on
  // exactly the world point the full-size routes/markers will later be drawn at, so the two layers
  // never drift apart the way independent linear-interpolation-over-bounds would on a non-matching
  // world aspect ratio (a tall, narrow park inside a landscape viewport, for instance).
  const lowProjector = createProjector(bounds, lowW, lowH, MAP.padding * (lowW / vp.width));
  const low = document.createElement("canvas");
  low.width = lowW; low.height = lowH;
  const lctx = low.getContext("2d");
  const img = lctx.createImageData(lowW, lowH);
  if (style === "print") paintPrintPixels(img.data, lowW, lowH, lowProjector, terrain, seed);
  else paintReliefPixels(img.data, lowW, lowH, lowProjector, terrain);
  lctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(vp.x, vp.y, vp.width, vp.height);
  ctx.drawImage(low, 0, 0, lowW, lowH, vp.x, vp.y, vp.width, vp.height);
  // `projector` above is relative to the viewport's own top-left; every caller that reuses the
  // returned projector draws straight onto the full canvas, so fold the viewport's offset in here –
  // once – rather than making every future caller remember to add it back.
  return {
    scale: projector.scale, width: canvas.width, height: canvas.height,
    toPx(x, z) { const [px, py] = projector.toPx(x, z); return [px + vp.x, py + vp.y]; },
    toWorld(px, py) { return projector.toWorld(px - vp.x, py - vp.y); },
  };
}

function paintReliefPixels(data, w, h, projector, terrain) {
  const heights = new Float32Array(w * h);
  let hMin = Infinity, hMax = -Infinity;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const [wx, wz] = projector.toWorld(px, py);
      const height = terrain.heightAt(wx, wz);
      heights[py * w + px] = height;
      if (height < hMin) hMin = height;
      if (height > hMax) hMax = height;
    }
  }
  const span = Math.max(1e-3, hMax - hMin);
  const light = MAP.hillLightDir;
  const lightLen = Math.hypot(light.x, light.z) || 1;
  const lx = light.x / lightLen, lz = light.z / lightLen;
  const normal = new THREE.Vector3();
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const [wx, wz] = projector.toWorld(px, py);
      const i = (py * w + px) * 4;
      if (terrain.isPath(wx, wz)) { data[i] = PATH_COLOUR[0]; data[i + 1] = PATH_COLOUR[1]; data[i + 2] = PATH_COLOUR[2]; data[i + 3] = 255; continue; }
      terrain.normalAt(wx, wz, normal);
      const shade = clamp01(0.62 + 0.55 * (normal.x * lx + normal.z * lz) + 0.15 * (normal.y - 1));
      const heightNorm = clamp01((heights[py * w + px] - hMin) / span);
      const base = mix3(RELIEF_DARK, RELIEF_LIGHT, heightNorm);
      data[i] = clampByte(base[0] * shade); data[i + 1] = clampByte(base[1] * shade); data[i + 2] = clampByte(base[2] * shade); data[i + 3] = 255;
    }
  }
}

/** Stylised printed-map look: flat green + seeded forest-patch blobs, independent of real elevation. */
function paintPrintPixels(data, w, h, projector, terrain, seed) {
  const noise = makeNoise2D(`map-print-${seed}`);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const [wx, wz] = projector.toWorld(px, py);
      const i = (py * w + px) * 4;
      if (terrain.isPath(wx, wz)) { data[i] = PATH_COLOUR[0]; data[i + 1] = PATH_COLOUR[1]; data[i + 2] = PATH_COLOUR[2]; data[i + 3] = 255; continue; }
      const n = fbm2D(noise, wx * 0.035, wz * 0.035, 4, 2, 0.55);
      const patch = clamp01((n + 0.35) / 0.7);
      const colour = mix3(PRINT_GREEN_LIGHT, PRINT_GREEN_DARK, patch > 0.55 ? clamp01((patch - 0.55) * 2.4) : 0);
      data[i] = clampByte(colour[0]); data[i + 1] = clampByte(colour[1]); data[i + 2] = clampByte(colour[2]); data[i + 3] = 255;
    }
  }
}

/**
 * Cheap vector overlay: every route as a coloured line through its platforms, a white dot per
 * platform, a ring at the entry and a dashed segment out to the zip landing. Redrawn every frame by
 * course-map.js (filter/hover/pan/zoom all live here); baked once into the board's texture.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ parkDef, projector, filterCategory?: string|null, hoverRouteId?: string|null,
 *   style?: "relief"|"print", lineWidth?: number, dotRadius?: number, numerals?: boolean }} options
 */
export function paintRoutes(ctx, { parkDef, projector, filterCategory = null, hoverRouteId = null, style = "relief", lineWidth = 2.4, dotRadius = 3.2, numerals = false }) {
  for (const route of parkDef.routes) {
    const category = CATEGORY_BY_ID[route.category];
    // The light "print" board has plenty of contrast for the true near-black; only the dark relief
    // overlay needs the lighter stand-in (see `mapColourOf`'s own comment).
    const colour = category ? (style === "print" ? category.colour : mapColourOf(category)) : 0x999999;
    const dimmed = filterCategory && filterCategory !== "all" && filterCategory !== route.category;
    const hovered = hoverRouteId === route.id;
    ctx.globalAlpha = dimmed ? 0.22 : 1;
    ctx.strokeStyle = cssHex(colour);
    ctx.fillStyle = cssHex(colour);
    ctx.lineWidth = hovered ? lineWidth * 2 : lineWidth;
    ctx.lineJoin = "round"; ctx.lineCap = "round";

    const points = [[route.entry.x, route.entry.z], ...route.platforms.map((p) => { const tree = parkDef.heroTrees[p.treeIndex]; return [tree.x, tree.z]; })];
    ctx.beginPath();
    points.forEach(([x, z], i) => { const [px, py] = projector.toPx(x, z); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
    ctx.stroke();

    if (route.zip) {
      const last = points[points.length - 1];
      const [px0, py0] = projector.toPx(last[0], last[1]);
      const [px1, py1] = projector.toPx(route.zip.landing.x, route.zip.landing.z);
      ctx.setLineDash([dotRadius * 1.6, dotRadius * 1.4]);
      ctx.beginPath(); ctx.moveTo(px0, py0); ctx.lineTo(px1, py1); ctx.stroke();
      ctx.setLineDash([]);
      dot(ctx, px1, py1, dotRadius * 0.85, "#f5f3ed", colour);
    }

    points.slice(1).forEach(([x, z]) => { const [px, py] = projector.toPx(x, z); dot(ctx, px, py, dotRadius, "#f5f3ed", colour); });
    const [ex, ey] = projector.toPx(route.entry.x, route.entry.z);
    ring(ctx, ex, ey, dotRadius * 1.6, colour);
    if (numerals) paintNumeralBadge(ctx, ex, ey - dotRadius * 2.6, route.numeral, colour);
  }
  ctx.globalAlpha = 1;
}

function dot(ctx, x, y, r, fill, strokeColour) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.5); ctx.strokeStyle = cssHex(strokeColour); ctx.stroke();
}
function ring(ctx, x, y, r, colour) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = 2; ctx.strokeStyle = cssHex(colour); ctx.fillStyle = "rgba(245,243,237,0.9)"; ctx.fill(); ctx.stroke();
}

/** White circle with the route's roman numeral – the park-board's trailhead numbering. */
export function paintNumeralBadge(ctx, x, y, numeral, colour, r = 9) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#f5f3ed"; ctx.fill();
  ctx.lineWidth = r * 0.22; ctx.strokeStyle = cssHex(colour); ctx.stroke();
  ctx.fillStyle = "#15181a";
  ctx.font = `700 ${r * (numeral.length > 1 ? 1.0 : 1.3)}px "Bahnschrift","Barlow Condensed",sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(numeral, x, y + r * 0.06);
}

/** Legend row: symbol + category word per colour (accessibility – colour is never the only cue). */
export function paintLegend(ctx, { x, y, fontPx = 15, gap = 96 }) {
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.font = `700 ${fontPx}px "Bahnschrift","Barlow Condensed",sans-serif`;
  Object.values(CATEGORY_BY_ID).forEach((category, i) => {
    const cx = x + i * gap;
    ctx.fillStyle = cssHex(category.colour);
    ctx.fillText(category.symbol, cx, y);
    ctx.fillStyle = "#20241f";
    ctx.fillText(t(`sign.${category.id}`).toUpperCase(), cx + fontPx * 1.3, y);
  });
}

/** Title bar text, centred – used only by the baked print board (course-map's title is DOM/CSS). */
export function paintTitle(ctx, text, { x, y, width, fontPx = 34 }) {
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `700 ${fontPx}px "Bahnschrift","Barlow Condensed",sans-serif`;
  ctx.fillStyle = "#20241f";
  ctx.fillText(text.toUpperCase(), x + width / 2, y);
}

/**
 * One-shot bake for the physical park board (js/park/park-board.js): background + routes + numerals +
 * legend + title, all in one texture that never redraws.
 * @param {HTMLCanvasElement} canvas
 * @param {{ parkDef, terrain, seed, title }} options
 * @returns {{ projector }}
 */
export function paintStaticBoard(canvas, { parkDef, terrain, seed, title }) {
  const ctx = canvas.getContext("2d");
  const headerH = Math.round(canvas.height * 0.115);
  // The map itself lives *below* the header bar – one shared viewport for both the baked background
  // and the route overlay, so numerals/lines land exactly on the terrain/paths under them (see
  // `paintBackground`'s own header comment on why an independently-fitted second projector drifts).
  const projector = paintBackground(canvas, {
    parkDef, terrain, style: "print", seed,
    viewport: { x: 0, y: headerH, width: canvas.width, height: canvas.height - headerH },
  });
  ctx.fillStyle = "#eef1ea";
  ctx.fillRect(0, 0, canvas.width, headerH);
  paintTitle(ctx, title, { x: 0, y: headerH / 2, width: canvas.width, fontPx: headerH * 0.42 });
  paintRoutes(ctx, { parkDef, projector, style: "print", numerals: true, lineWidth: 3.4, dotRadius: 4.5 });
  paintLegend(ctx, { x: canvas.width * 0.04, y: canvas.height - headerH * 0.55, fontPx: headerH * 0.30, gap: canvas.width * 0.16 });
  return { projector };
}
