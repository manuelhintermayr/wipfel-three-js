// Procedural forest-floor texture sets (albedo + normal + packed height/roughness) drawn with
// Canvas2D: leaf litter, packed dirt path, moss/needle duff. Seamless (wrapped drawing + periodic
// noise), generated once per seed and cached. Roughness texture layout: R = height, G = roughness.
import { Rng } from "../../core/rng.js";
import {
  makeCanvas, canvasToTexture, heightToNormalCanvas, fillTileableNoise, addGrain, drawWrapped,
  multiplyByHeight, rgb, hexToRgb,
} from "./texture-utils.js";

const cache = new Map();

export const GROUND_TEXTURE_SIZE = 1024;

/** @returns {{ litter: TextureSet, dirt: TextureSet, duff: TextureSet }} – cached per seed/size. */
export function getGroundTextures(seed, size = GROUND_TEXTURE_SIZE) {
  const key = `${seed}:${size}`;
  if (!cache.has(key)) {
    const rng = new Rng(`ground:${seed}`);
    cache.set(key, {
      litter: makeTextureSet(drawLeafLitter, rng.fork("litter"), size, 2.4, [0.66, 0.34]),
      dirt: makeTextureSet(drawDirtPath, rng.fork("dirt"), size, 2.6, [0.8, 0.2]),
      duff: makeTextureSet(drawDuff, rng.fork("duff"), size, 2.2, [0.7, 0.3]),
    });
  }
  return cache.get(key);
}

/** Palette used by the leaf drawing (also exported for leaf clump cards). */
export const LEAF_COLOURS = ["#8a5a30", "#a06a34", "#b07c3f", "#c48c4a", "#7c4f2c", "#9c6f45", "#6b4d2c",
  "#b58a56", "#d0a060", "#c39a5a", "#8a6a3a", "#6f7a3a", "#7d8a3c", "#a5843e", "#5e4126"].map(hexToRgb);

/** Traces a leaf outline (no fill) centred at the origin, base at -L/2, tip at +L/2 on +x. */
export function traceLeafShape(ctx, kind, L, W) {
  ctx.beginPath();
  if (kind === "beech") {
    ctx.moveTo(-L / 2, 0);
    ctx.bezierCurveTo(-L * 0.35, -W * 0.62, L * 0.15, -W * 0.5, L / 2, 0);
    ctx.bezierCurveTo(L * 0.15, W * 0.5, -L * 0.35, W * 0.62, -L / 2, 0);
  } else if (kind === "oak") {
    const lobes = 6.5, n = 56;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2;
      const r = 1 + 0.2 * Math.cos(lobes * t) * Math.sin(t) ** 2 * 1.4;
      const x = Math.cos(t) * L * 0.5 * r, y = Math.sin(t) * W * 0.5 * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  } else { // maple – palmate, five rounded lobes
    const n = 72;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2;
      const r = 0.55 + 0.45 * Math.abs(Math.cos(2.5 * t)) ** 0.6;
      const x = Math.cos(t) * L * 0.5 * r, y = Math.sin(t) * W * 0.5 * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

/** Draws one shaded leaf (albedo) at the current origin. */
export function paintLeaf(ctx, rng, kind, L, W, colour, shade = 1) {
  const c = colour.map((v) => v * shade);
  ctx.save();
  ctx.translate(2.5, 2.5);
  traceLeafShape(ctx, kind, L, W);
  ctx.fillStyle = "rgba(15,10,5,0.4)";
  ctx.fill();
  ctx.restore();
  const g = ctx.createLinearGradient(0, -W / 2, 0, W / 2);
  g.addColorStop(0, rgb(c.map((v) => v * 1.12)));
  g.addColorStop(0.5, rgb(c));
  g.addColorStop(1, rgb(c.map((v) => v * 0.8)));
  traceLeafShape(ctx, kind, L, W);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = rgb(c.map((v) => v * 0.6));
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgb(c.map((v) => v * 1.25));
  ctx.beginPath(); ctx.moveTo(-L * 0.45, 0); ctx.lineTo(L * 0.42, 0); ctx.stroke();
  ctx.strokeStyle = rgb(c.map((v) => v * 0.7));
  for (let v = -0.3; v <= 0.3; v += 0.2) {
    ctx.beginPath(); ctx.moveTo(L * v, 0); ctx.lineTo(L * (v + 0.18), -W * 0.42); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L * v, 0); ctx.lineTo(L * (v + 0.18), W * 0.42); ctx.stroke();
  }
  if (rng.next() < 0.25) {
    ctx.fillStyle = "rgba(30,20,10,0.55)";
    for (let k = rng.int(1, 3); k > 0; k--) {
      ctx.beginPath(); ctx.arc(rng.float(-L * 0.3, L * 0.3), rng.float(-W * 0.3, W * 0.3), rng.float(1, 2.5), 0, Math.PI * 2); ctx.fill();
    }
  }
}

/** Height-map counterpart of paintLeaf: domed leaf, later leaves higher. */
function paintLeafHeight(ctx, kind, L, W, level) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(L, W) * 0.5);
  g.addColorStop(0, `rgb(${level},${level},${level})`);
  g.addColorStop(1, `rgb(${level - 40},${level - 40},${level - 40})`);
  traceLeafShape(ctx, kind, L, W);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = `rgb(${level - 55},${level - 55},${level - 55})`;
  ctx.stroke();
}

function noiseFill(ctx, rng, opts) {
  // noise is smooth → render at half resolution and upscale (4× cheaper)
  const small = makeCanvas(ctx.canvas.width / 2);
  fillTileableNoise(small.getContext("2d"), rng, opts);
  ctx.drawImage(small, 0, 0, ctx.canvas.width, ctx.canvas.height);
}

function drawTwigs(a, h, rng, size, count, colours) {
  for (let i = 0; i < count; i++) {
    const x = rng.float(0, size), y = rng.float(0, size), len = rng.float(40, 170), ang = rng.float(0, Math.PI);
    const w = rng.float(2, 4.5), bend = rng.float(-14, 14), col = rgb(rng.pick(colours), rng, 0.05);
    const stroke = (ctx, style, width) => {
      ctx.rotate(ang); ctx.lineCap = "round"; ctx.lineWidth = width; ctx.strokeStyle = style;
      ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.quadraticCurveTo(0, bend, len / 2, 0); ctx.stroke();
    };
    drawWrapped(a, size, x, y, len / 2 + 4, (ctx) => { stroke(ctx, "rgba(0,0,0,0.35)", w + 2); stroke(ctx, col, w); });
    drawWrapped(h, size, x, y, len / 2 + 4, (ctx) => stroke(ctx, "rgb(118,118,118)", w));
  }
}

function drawPebbles(a, h, rng, size, count, rMin, rMax, colours, level) {
  for (let i = 0; i < count; i++) {
    const x = rng.float(0, size), y = rng.float(0, size), r = rng.float(rMin, rMax);
    const sx = rng.float(0.7, 1.3), rot = rng.float(0, Math.PI), col = rng.pick(colours);
    drawWrapped(a, size, x, y, r * 1.5, (ctx) => {
      ctx.rotate(rot);
      ctx.fillStyle = "rgba(20,15,10,0.4)";
      ctx.beginPath(); ctx.ellipse(r * 0.3, r * 0.35, r * sx, r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgb(col, rng, 0.06);
      ctx.beginPath(); ctx.ellipse(0, 0, r * sx, r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,250,240,0.35)";
      ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.35, r * sx * 0.45, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    });
    drawWrapped(h, size, x, y, r * 1.5, (ctx) => {
      const g = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r * Math.max(sx, 1));
      g.addColorStop(0, `rgb(${level},${level},${level})`);
      g.addColorStop(1, `rgb(${level - 60},${level - 60},${level - 60})`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, 0, r * sx, r, rot, 0, Math.PI * 2); ctx.fill();
    });
  }
}

// ---------------------------------------------------------------------------------------------
// leaf litter: humus base, twigs, ~850 layered dry leaves (beech/oak/maple), debris on top
function drawLeafLitter(a, h, rng, size) {
  noiseFill(a, rng, { scale: 5, octaves: 4, colorA: hexToRgb("#2f2216"), colorB: hexToRgb("#5c4429") });
  noiseFill(h, rng, { scale: 5, octaves: 4, colorA: [40, 40, 40], colorB: [95, 95, 95] });
  drawTwigs(a, h, rng, size, 60, ["#4a3826", "#5e4830", "#6b5238"].map(hexToRgb));
  const count = Math.round(850 * (size / 1024) ** 2);
  const kinds = ["beech", "beech", "oak", "maple", "beech", "oak"];
  for (let i = 0; i < count; i++) {
    const kind = rng.pick(kinds);
    const L = rng.float(34, 82), W = kind === "maple" ? L * rng.float(0.85, 1.05) : L * rng.float(0.42, 0.62);
    const x = rng.float(0, size), y = rng.float(0, size), ang = rng.float(0, Math.PI * 2);
    const age = i / count;                                  // later = on top = fresher & lighter
    const shade = 0.55 + 0.45 * age ** 0.7 * rng.float(0.85, 1.05);
    const colour = rng.pick(LEAF_COLOURS);
    drawWrapped(a, size, x, y, Math.max(L, W) * 0.6 + 4, (ctx) => { ctx.rotate(ang); paintLeaf(ctx, rng, kind, L, W, colour, shade); });
    const level = Math.round(120 + 110 * age + rng.float(-12, 12));
    drawWrapped(h, size, x, y, Math.max(L, W) * 0.6 + 4, (ctx) => { ctx.rotate(ang); paintLeafHeight(ctx, kind, L, W, level); });
  }
  drawPebbles(a, h, rng, size, 240, 1.2, 3.5, ["#3d2c1c", "#55402a", "#6a5238", "#7d6444"].map(hexToRgb), 200);
  addGrain(a, rng, 0.04);
  return (height) => 0.96 - 0.14 * height;
}

// ---------------------------------------------------------------------------------------------
// packed dirt path: dusty earth, damp blotches, gravel, mud cracks, blown-in leaf flecks
function drawDirtPath(a, h, rng, size) {
  noiseFill(a, rng, { scale: 4, octaves: 5, colorA: hexToRgb("#7f6d55"), colorB: hexToRgb("#ab9981") });
  noiseFill(h, rng, { scale: 3, octaves: 5, colorA: [112, 112, 112], colorB: [140, 140, 140] });
  const blotch = (n, colour, alpha, rMin, rMax) => {
    for (let i = 0; i < n; i++) {
      const x = rng.float(0, size), y = rng.float(0, size), r = rng.float(rMin, rMax);
      drawWrapped(a, size, x, y, r, (ctx) => {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, `rgba(${colour},${alpha})`); g.addColorStop(1, `rgba(${colour},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      });
    }
  };
  blotch(40, "72,60,45", 0.35, 50, 140);
  blotch(30, "196,184,160", 0.28, 40, 120);
  for (let i = 0; i < 14; i++) {                              // dried mud cracks
    const x = rng.float(0, size), y = rng.float(0, size), segs = rng.int(4, 7), ang0 = rng.float(0, Math.PI * 2);
    const pts = [[0, 0]];
    let ang = ang0;
    for (let s = 0; s < segs; s++) { ang += rng.float(-0.7, 0.7); const l = rng.float(14, 34); pts.push([pts[s][0] + Math.cos(ang) * l, pts[s][1] + Math.sin(ang) * l]); }
    const path = (ctx, style, w) => { ctx.strokeStyle = style; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(0, 0); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.stroke(); };
    drawWrapped(a, size, x, y, 200, (ctx) => path(ctx, "rgba(48,38,28,0.55)", 1.2));
    drawWrapped(h, size, x, y, 200, (ctx) => path(ctx, "rgb(96,96,96)", 1.6));
  }
  const gravel = ["#8f8678", "#a39a8a", "#7a7264", "#b8ad9a", "#6d6353", "#9c8f7a", "#857a68"].map(hexToRgb);
  drawPebbles(a, h, rng, size, Math.round(2000 * (size / 1024) ** 2), 1.4, 4.5, gravel, 190);
  drawPebbles(a, h, rng, size, 36, 7, 15, gravel, 225);
  drawPebbles(a, h, rng, size, 70, 2.5, 6, ["#6e4e2e", "#8a643a", "#5c4228"].map(hexToRgb), 175);
  addGrain(a, rng, 0.035);
  return (height) => 0.95 - 0.3 * Math.max(0, height - 0.5);
}

// ---------------------------------------------------------------------------------------------
// moss / needle duff: dark humus, thousands of dry pine needles, stippled moss cushions, cones
function drawDuff(a, h, rng, size) {
  noiseFill(a, rng, { scale: 5, octaves: 4, colorA: hexToRgb("#241c12"), colorB: hexToRgb("#4b3a26") });
  noiseFill(h, rng, { scale: 5, octaves: 4, colorA: [50, 50, 50], colorB: [88, 88, 88] });
  const needles = ["#6e4522", "#86552a", "#9a6430", "#ad7538", "#b8834a", "#5c3b1e", "#7d5230"].map(hexToRgb);
  const count = Math.round(2600 * (size / 1024) ** 2);
  for (let i = 0; i < count; i++) {
    const x = rng.float(0, size), y = rng.float(0, size), len = rng.float(28, 72), ang = rng.float(0, Math.PI);
    const w = rng.float(1.4, 2.4), bend = rng.float(-6, 6), shade = 0.6 + 0.4 * i / count;
    const col = rgb(rng.pick(needles).map((v) => v * shade), rng, 0.04);
    const line = (ctx, style, width) => {
      ctx.rotate(ang); ctx.lineCap = "round"; ctx.lineWidth = width; ctx.strokeStyle = style;
      ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.quadraticCurveTo(0, bend, len / 2, 0); ctx.stroke();
    };
    drawWrapped(a, size, x, y, len / 2 + 3, (ctx) => line(ctx, col, w));
    const lvl = Math.round(105 + 65 * i / count);
    drawWrapped(h, size, x, y, len / 2 + 3, (ctx) => line(ctx, `rgb(${lvl},${lvl},${lvl})`, w));
  }
  const mossCols = ["#4a6a2a", "#61833a", "#78964a", "#8aa855", "#56732f", "#3f5c25", "#9aa64a"].map(hexToRgb);
  for (let p = 0; p < 22; p++) {
    const x = rng.float(0, size), y = rng.float(0, size), R = rng.float(45, 120), verts = 16;
    const radii = Array.from({ length: verts }, () => R * rng.float(0.7, 1.15));
    const blob = (ctx) => { ctx.beginPath(); for (let i = 0; i <= verts; i++) { const t = i / verts * Math.PI * 2, r = radii[i % verts]; const px = Math.cos(t) * r, py = Math.sin(t) * r; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); };
    const dots = Array.from({ length: 360 }, () => { const t = rng.float(0, Math.PI * 2), rr = R * Math.sqrt(rng.next()) * 0.95; return [Math.cos(t) * rr, Math.sin(t) * rr, rng.float(1.4, 3.4), rng.pick(mossCols)]; });
    drawWrapped(a, size, x, y, R * 1.2, (ctx) => {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, "rgba(72,104,44,0.95)"); g.addColorStop(1, "rgba(60,84,38,0.55)");
      blob(ctx); ctx.fillStyle = g; ctx.fill();
      for (const [dx, dy, r, c] of dots) { ctx.fillStyle = rgb(c); ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.fill(); }
    });
    drawWrapped(h, size, x, y, R * 1.2, (ctx) => {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, "rgb(175,175,175)"); g.addColorStop(1, "rgba(120,120,120,0.2)");
      blob(ctx); ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = "rgb(190,190,190)";
      for (const [dx, dy, r] of dots) { ctx.beginPath(); ctx.arc(dx, dy, r * 0.8, 0, Math.PI * 2); ctx.fill(); }
    });
  }
  for (let c = 0; c < 7; c++) {                              // pine cones
    const x = rng.float(0, size), y = rng.float(0, size), ang = rng.float(0, Math.PI * 2);
    drawWrapped(a, size, x, y, 30, (ctx) => {
      ctx.rotate(ang);
      ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.beginPath(); ctx.ellipse(3, 3, 12, 22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#3a2816"; ctx.beginPath(); ctx.ellipse(0, 0, 12, 22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#7a5632"; ctx.lineWidth = 2;
      for (let s = -16; s <= 16; s += 8) { ctx.beginPath(); ctx.arc(0, s, 9, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    });
    drawWrapped(h, size, x, y, 30, (ctx) => { ctx.rotate(ang); ctx.fillStyle = "rgb(200,200,200)"; ctx.beginPath(); ctx.ellipse(0, 0, 12, 22, 0, 0, Math.PI * 2); ctx.fill(); });
  }
  drawPebbles(a, h, rng, size, 40, 2, 4.5, ["#6e675a", "#857d6e", "#5a5348"].map(hexToRgb), 185);
  addGrain(a, rng, 0.04);
  return (height) => 0.9 + 0.05 * height;
}

// ---------------------------------------------------------------------------------------------
/** @typedef {{ map: THREE.Texture, normalMap: THREE.Texture, roughnessMap: THREE.Texture }} TextureSet */
function makeTextureSet(drawFn, rng, size, normalStrength, [aoBase, aoRange]) {
  const albedo = makeCanvas(size), height = makeCanvas(size);
  const roughOf = drawFn(albedo.getContext("2d"), height.getContext("2d"), rng, size);
  multiplyByHeight(albedo.getContext("2d"), height, aoBase, aoRange);
  const normal = heightToNormalCanvas(height, normalStrength);
  const rough = makeCanvas(size);
  const rctx = rough.getContext("2d");
  const hd = height.getContext("2d").getImageData(0, 0, size, size).data;
  const img = rctx.createImageData(size, size);
  for (let i = 0; i < hd.length; i += 4) {
    const hv = hd[i] / 255;
    img.data[i] = hd[i];
    img.data[i + 1] = Math.round(Math.min(1, Math.max(0, roughOf(hv))) * 255);
    img.data[i + 2] = hd[i];
    img.data[i + 3] = 255;
  }
  rctx.putImageData(img, 0, 0);
  return {
    map: canvasToTexture(albedo, { srgb: true }),
    normalMap: canvasToTexture(normal),
    roughnessMap: canvasToTexture(rough),
    canvases: { albedo, height, normal, rough },
  };
}
