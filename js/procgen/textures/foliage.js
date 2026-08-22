// Alpha-tested foliage cluster atlases (2×2 variants per species) painted on Canvas2D: pine needle
// tufts on twigs, broadleaf clumps (oak/beech/maple/hazel silhouettes) with lit/shaded gradients.
// The GPU texture is a DataTexture whose transparent texels carry bled-out neighbour colours so
// mipmaps never darken towards leaf edges. Cached per (species, seed, size).
import { Rng, hash32 } from "../../core/rng.js";
import { createCanvas, hsl, cssRgb, clamp01, canvasToBledTexture } from "./tree-texture-utils.js";

const cache = new Map();
const TILES_PER_SIDE = 2;

const FOLIAGE_SPECS = Object.freeze({
  pine:  { paint: paintNeedleCluster, hue: [98, 128], sat: [0.30, 0.46], light: [0.15, 0.27], yellowChance: 0.0 },
  oak:   { paint: paintLeafCluster, leaf: oakLeaf, leaves: [58, 74], leafLen: 0.30, aspect: 0.62, hue: [86, 102], sat: [0.40, 0.55], light: [0.25, 0.36], yellowChance: 0.08 },
  beech: { paint: paintLeafCluster, leaf: beechLeaf, leaves: [70, 90], leafLen: 0.24, aspect: 0.62, hue: [84, 100], sat: [0.45, 0.60], light: [0.32, 0.44], yellowChance: 0.10 },
  maple: { paint: paintLeafCluster, leaf: mapleLeaf, leaves: [46, 60], leafLen: 0.34, aspect: 1.0, hue: [80, 96], sat: [0.42, 0.56], light: [0.29, 0.41], yellowChance: 0.12 },
  hazel: { paint: paintLeafCluster, leaf: hazelLeaf, leaves: [44, 58], leafLen: 0.34, aspect: 0.82, hue: [86, 102], sat: [0.36, 0.50], light: [0.28, 0.40], yellowChance: 0.06 },
});

/**
 * @returns {{ map: THREE.DataTexture, canvas: HTMLCanvasElement, tiles: number, tileUv(i:number): {u0,v0,u1,v1} }}
 */
export function getFoliageAtlas(species, { seed = 1, size = 1024 } = {}) {
  const key = `${species}:${seed}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const spec = FOLIAGE_SPECS[species] || FOLIAGE_SPECS.oak;
  const atlas = buildAtlas(spec, `${seed}:foliage:${species}`, size);
  cache.set(key, atlas);
  return atlas;
}

export function disposeFoliageTextures() {
  for (const a of cache.values()) a.map.dispose();
  cache.clear();
}

function buildAtlas(spec, seed, size) {
  const { canvas, ctx } = createCanvas(size, size);
  const tile = size / TILES_PER_SIDE;
  const rng = new Rng(hash32(seed));
  ctx.lineCap = "round";
  for (let ty = 0; ty < TILES_PER_SIDE; ty++) {
    for (let tx = 0; tx < TILES_PER_SIDE; tx++) {
      spec.paint(ctx, tx * tile + tile / 2, ty * tile + tile / 2, tile * 0.46, rng.fork(`tile${tx}${ty}`), spec);
    }
  }
  const map = canvasToBledTexture(canvas);
  const tileUv = (i) => {
    const tx = i % TILES_PER_SIDE, ty = TILES_PER_SIDE - 1 - Math.floor(i / TILES_PER_SIDE); // v grows upwards
    return { u0: tx / TILES_PER_SIDE, v0: ty / TILES_PER_SIDE, u1: (tx + 1) / TILES_PER_SIDE, v1: (ty + 1) / TILES_PER_SIDE };
  };
  return { map, canvas, tiles: TILES_PER_SIDE * TILES_PER_SIDE, tileUv };
}

function leafColour(rng, spec, shade = 1) {
  const yellow = rng.next() < spec.yellowChance;
  const h = yellow ? rng.float(62, 74) : rng.float(spec.hue[0], spec.hue[1]);
  const s = rng.float(spec.sat[0], spec.sat[1]) - (yellow ? 0.05 : 0);
  const l = rng.float(spec.light[0], spec.light[1]) * shade + (yellow ? 0.08 : 0);
  return { h, s, l };
}

// ---------------------------------------------------------------------------------------------
// Pine: twigs radiating from an off-centre node, needle tufts fanning along and around each twig.
function paintNeedleCluster(ctx, cx, cy, radius, rng, spec) {
  const twigs = rng.int(5, 7);
  const origin = { x: cx + rng.float(-0.15, 0.15) * radius, y: cy + rng.float(-0.1, 0.2) * radius };
  const twigColour = cssRgb(hsl(24, 0.28, 0.24));
  const px = radius / 235; // 1 unit ≈ 1 px at a 512 px tile
  const needleLen = [30 * px, 62 * px];
  const twigList = [];
  for (let t = 0; t < twigs; t++) {
    const a = (t / twigs) * Math.PI * 2 + rng.float(-0.35, 0.35);
    const len = radius * rng.float(0.62, 0.95);
    const bend = rng.float(-0.35, 0.35);
    const end = { x: origin.x + Math.cos(a) * len, y: origin.y + Math.sin(a) * len };
    const mid = { x: origin.x + Math.cos(a + bend) * len * 0.5, y: origin.y + Math.sin(a + bend) * len * 0.5 };
    twigList.push({ a, len, origin, mid, end });
    ctx.strokeStyle = twigColour;
    ctx.lineWidth = 5.5 * px;
    ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.quadraticCurveTo(mid.x, mid.y, end.x, end.y); ctx.stroke();
  }
  const drawTuft = (x, y, dir, count, spread, shade, widthMul) => {
    for (let n = 0; n < count; n++) {
      const c = leafColour(rng, spec, shade);
      const ang = dir + rng.float(-spread, spread);
      const len = rng.float(needleLen[0], needleLen[1]);
      const tip = { x: x + Math.cos(ang) * len, y: y + Math.sin(ang) * len };
      const grad = ctx.createLinearGradient(x, y, tip.x, tip.y);
      grad.addColorStop(0, cssRgb(hsl(c.h - 8, c.s, c.l * 0.75)));
      grad.addColorStop(1, cssRgb(hsl(c.h + 6, c.s + 0.05, c.l * 1.25)));
      ctx.strokeStyle = grad;
      ctx.lineWidth = rng.float(2.6, 3.8) * px * widthMul;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    }
  };
  // shadow pass (dark, slightly wider) then lit pass – gives the tufts depth
  for (const pass of [{ shade: 0.55, w: 1.25, k: 0.7 }, { shade: 1.0, w: 1.0, k: 1.0 }]) {
    for (const tw of twigList) {
      const steps = 5;
      for (let s = 1; s <= steps; s++) {
        const t = 0.3 + 0.7 * (s / steps);
        const q = 1 - t;
        const x = q * q * tw.origin.x + 2 * q * t * tw.mid.x + t * t * tw.end.x;
        const y = q * q * tw.origin.y + 2 * q * t * tw.mid.y + t * t * tw.end.y;
        const isTip = s === steps;
        drawTuft(x, y, tw.a, Math.round((isTip ? 34 : 22) * pass.k), isTip ? 1.5 : 1.05, pass.shade, pass.w);
      }
    }
    drawTuft(origin.x, origin.y, rng.float(0, Math.PI * 2), Math.round(30 * pass.k), Math.PI, pass.shade, pass.w);
  }
}

// ---------------------------------------------------------------------------------------------
// Broadleaf clusters: a few twigs, then leaves in a back (shaded) layer and a front (lit) layer.
function paintLeafCluster(ctx, cx, cy, radius, rng, spec) {
  const px = radius / 235;
  ctx.strokeStyle = cssRgb(hsl(28, 0.25, 0.28));
  ctx.lineWidth = 3.5 * px;
  const twigs = rng.int(3, 5);
  for (let t = 0; t < twigs; t++) {
    const a = rng.float(0, Math.PI * 2), len = radius * rng.float(0.5, 0.9);
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(cx + Math.cos(a + 0.3) * len * 0.5, cy + Math.sin(a + 0.3) * len * 0.5, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    ctx.stroke();
  }
  const total = rng.int(spec.leaves[0], spec.leaves[1]);
  const leafLen = spec.leafLen * radius * 2;
  for (let i = 0; i < total; i++) {
    const back = i < total * 0.4;
    // gaussian-ish placement, tighter for the back layer, clipped to the disc
    let dx, dy;
    do { dx = rng.gaussian(0, radius * (back ? 0.42 : 0.5)); dy = rng.gaussian(0, radius * (back ? 0.42 : 0.5)); }
    while (dx * dx + dy * dy > radius * radius * 0.85);
    const size = leafLen * rng.float(0.75, 1.2) * (back ? 0.9 : 1);
    const c = leafColour(rng, spec, back ? 0.62 : 1);
    ctx.save();
    ctx.translate(cx + dx, cy + dy);
    ctx.rotate(rng.float(0, Math.PI * 2));
    const grad = ctx.createLinearGradient(-size * 0.4, -size * 0.5, size * 0.4, size * 0.5);
    grad.addColorStop(0, cssRgb(hsl(c.h + 4, c.s - 0.05, c.l + 0.13)));
    grad.addColorStop(0.55, cssRgb(hsl(c.h, c.s, c.l)));
    grad.addColorStop(1, cssRgb(hsl(c.h - 6, c.s, c.l - 0.08)));
    ctx.fillStyle = grad;
    ctx.beginPath();
    spec.leaf(ctx, size, size * spec.aspect);
    ctx.closePath();
    ctx.fill();
    // midrib
    ctx.strokeStyle = cssRgb(hsl(c.h - 8, c.s - 0.1, c.l - 0.1), 0.6);
    ctx.lineWidth = Math.max(1, size * 0.02);
    ctx.beginPath(); ctx.moveTo(0, size * 0.48); ctx.lineTo(0, -size * 0.42); ctx.stroke();
    ctx.restore();
  }
}

/** Half-outline helper: leaf points +y up from (0, len/2) tip to (0, -len/2) base; widthFn(t) in [0,1]. */
function outlineFromWidth(ctx, len, width, widthFn, steps = 28) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;                    // 0 = tip, 1 = base
    pts.push([widthFn(t) * width * 0.5, len * 0.5 - t * len]);
  }
  ctx.moveTo(0, len * 0.5);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(-pts[i][0], pts[i][1]);
}

function oakLeaf(ctx, len, width) {
  outlineFromWidth(ctx, len, width, (t) => {
    const base = Math.pow(Math.sin(Math.PI * clamp01(t)), 0.75);
    const lobes = 0.55 + 0.45 * Math.abs(Math.sin(Math.PI * 3.5 * t + 0.4));
    return base * lobes;
  }, 42);
}
function beechLeaf(ctx, len, width) {
  outlineFromWidth(ctx, len, width, (t) => Math.pow(Math.sin(Math.PI * clamp01(t)), 0.85) * (1 + 0.03 * Math.sin(t * 40)));
}
function hazelLeaf(ctx, len, width) {
  outlineFromWidth(ctx, len, width, (t) => Math.pow(Math.sin(Math.PI * clamp01(Math.min(1, t * 1.05))), 0.55) * (1 + 0.035 * Math.sign(Math.sin(t * 46))), 46);
}
function mapleLeaf(ctx, len, width) {
  const R = len * 0.5;
  const lobeAngles = [-1.55, -0.78, 0, 0.78, 1.55];
  const lobeR = [0.62, 0.9, 1.0, 0.9, 0.62];
  const pts = [];
  for (let i = 0; i < lobeAngles.length; i++) {
    const a = lobeAngles[i];
    if (i > 0) {
      const mid = (lobeAngles[i - 1] + a) / 2;
      pts.push([Math.sin(mid) * R * 0.42, Math.cos(mid) * R * 0.42]);
    }
    pts.push([Math.sin(a - 0.12) * R * lobeR[i] * 0.72, Math.cos(a - 0.12) * R * lobeR[i] * 0.72]);
    pts.push([Math.sin(a) * R * lobeR[i], Math.cos(a) * R * lobeR[i]]);
    pts.push([Math.sin(a + 0.12) * R * lobeR[i] * 0.72, Math.cos(a + 0.12) * R * lobeR[i] * 0.72]);
  }
  ctx.moveTo(-width * 0.12, -R * 0.35);
  for (const [x, y] of pts) ctx.lineTo(x * (width / len), y);
  ctx.lineTo(width * 0.12, -R * 0.35);
  ctx.lineTo(0, -R * 0.55);
}

/** Debug helper: paints the atlases side by side (dev harness contact sheet). */
export function makeFoliageContactSheet(seed = 1, size = 256) {
  const species = Object.keys(FOLIAGE_SPECS);
  const { canvas, ctx } = createCanvas(size * species.length, size);
  ctx.fillStyle = "#334";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  species.forEach((s, i) => ctx.drawImage(getFoliageAtlas(s, { seed }).canvas, i * size, 0, size, size));
  return canvas;
}

export const FOLIAGE_SPECIES = Object.freeze(Object.keys(FOLIAGE_SPECS));
