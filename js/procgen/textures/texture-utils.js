// Generic Canvas2D helpers for procedural textures: canvases, tileable noise, Sobel normal maps,
// wrapped (seamless) drawing and canvas → THREE texture conversion. No game logic in here.
import * as THREE from "three";

/** Square (or w×h) canvas; its 2D context is created CPU-backed (we read pixels back a lot). */
export function makeCanvas(size, height = size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = height;
  canvas.getContext("2d", { willReadFrequently: true });
  return canvas;
}

/** Wraps a canvas as a repeating texture. `srgb` only for albedo/colour data. */
export function canvasToTexture(canvas, { srgb = false, repeat = 1, anisotropy = 8, wrap = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = anisotropy;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Sobel filter over the red channel of a grayscale height canvas → tangent-space normal map
 * (OpenGL convention, +Y = up in UV space; the canvas is assumed tileable so edges wrap).
 */
export function heightToNormalCanvas(heightCanvas, strength = 2) {
  const w = heightCanvas.width, h = heightCanvas.height;
  const rgba = heightCanvas.getContext("2d").getImageData(0, 0, w, h).data;
  const src = new Float32Array(w * h);                          // red channel only, 0..1
  for (let i = 0, j = 0; i < src.length; i++, j += 4) src[i] = rgba[j] / 255;
  const out = makeCanvas(w, h);
  const ctx = out.getContext("2d");
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const s = strength;
  for (let y = 0; y < h; y++) {
    const yu = ((y - 1 + h) % h) * w, yc = y * w, yd = ((y + 1) % h) * w;
    for (let x = 0; x < w; x++) {
      const xl = x === 0 ? w - 1 : x - 1, xr = x === w - 1 ? 0 : x + 1;
      const tl = src[yu + xl], t = src[yu + x], tr = src[yu + xr];
      const l = src[yc + xl], r = src[yc + xr];
      const bl = src[yd + xl], b = src[yd + x], br = src[yd + xr];
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);         // height gradient towards +x (right)
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);         // towards +canvas y (down)
      const nx = -dx * s, ny = dy * s;                          // UV up = canvas up → flip dy
      const len = 127.5 / Math.sqrt(nx * nx + ny * ny + 1);
      const o = (yc + x) * 4;
      d[o] = nx * len + 127.5;
      d[o + 1] = ny * len + 127.5;
      d[o + 2] = len + 127.5;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/**
 * Periodic value-noise sampler in [0, 1]: `sample(u, v)` with u, v in [0, 1) tiles seamlessly.
 * `cells` lattice cells per tile for the first octave (doubles per octave).
 */
export function makeTileableNoise2D(rng, { cells = 6, octaves = 4, gain = 0.5 } = {}) {
  const layers = [];
  let c = cells;
  for (let o = 0; o < octaves; o++) {
    const values = new Float32Array(c * c);
    for (let i = 0; i < values.length; i++) values[i] = rng.next();
    layers.push({ c, values });
    c *= 2;
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  return function sample(u, v) {
    let sum = 0, amp = 1, norm = 0;
    for (const { c, values } of layers) {
      const fx = (u - Math.floor(u)) * c, fy = (v - Math.floor(v)) * c;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = (x0 + 1) % c, y1 = (y0 + 1) % c;
      const tx = smooth(fx - x0), ty = smooth(fy - y0);
      const a = values[y0 * c + x0], b = values[y0 * c + x1];
      const cc = values[y1 * c + x0], dd = values[y1 * c + x1];
      const top = a + (b - a) * tx, bottom = cc + (dd - cc) * tx;
      sum += (top + (bottom - top) * ty) * amp;
      norm += amp;
      amp *= gain;
    }
    return sum / norm;
  };
}

/**
 * Fills the whole canvas of `ctx` with tileable value noise, mapped from colourA (noise 0) to
 * colourB (noise 1). `contrast` > 1 sharpens around 0.5, `bias` shifts the midpoint.
 */
export function fillTileableNoise(ctx, rng, {
  scale = 6, octaves = 4, gain = 0.5, contrast = 1, bias = 0,
  colorA = [0, 0, 0], colorB = [255, 255, 255], alpha = 255,
} = {}) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const noise = makeTileableNoise2D(rng, { cells: scale, octaves, gain });
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = noise(x / w, y / h);
      n = Math.min(1, Math.max(0, (n - 0.5) * contrast + 0.5 + bias));
      const o = (y * w + x) * 4;
      d[o] = colorA[0] + (colorB[0] - colorA[0]) * n;
      d[o + 1] = colorA[1] + (colorB[1] - colorA[1]) * n;
      d[o + 2] = colorA[2] + (colorB[2] - colorA[2]) * n;
      d[o + 3] = alpha;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Per-pixel luminance grain (±amount, 0..1) – cheap way to kill flat digital surfaces. */
export function addGrain(ctx, rng, amount = 0.05) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const span = amount * 255 * 2;
  for (let i = 0; i < d.length; i += 4) {
    const g = (rng.next() - 0.5) * span;
    d[i] = Math.min(255, Math.max(0, d[i] + g));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + g));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + g));
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Draws `draw(ctx)` translated to (x, y) and, when the shape (radius r) crosses the tile edge,
 * again at the wrapped positions – this is what makes hand-drawn textures seamless.
 */
export function drawWrapped(ctx, size, x, y, r, draw) {
  const xs = [0], ys = [0];
  if (x - r < 0) xs.push(size); else if (x + r > size) xs.push(-size);
  if (y - r < 0) ys.push(size); else if (y + r > size) ys.push(-size);
  for (const ox of xs) {
    for (const oy of ys) {
      ctx.save();
      ctx.translate(x + ox, y + oy);
      draw(ctx);
      ctx.restore();
    }
  }
}

/** Multiplies canvas RGB by (base + range * heightChannel) of another canvas – fake cavity/AO. */
export function multiplyByHeight(ctx, heightCanvas, base = 0.7, range = 0.3) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const hd = heightCanvas.getContext("2d").getImageData(0, 0, w, h).data;
  for (let i = 0; i < d.length; i += 4) {
    const f = base + range * (hd[i] / 255);
    d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
  }
  ctx.putImageData(img, 0, 0);
}

/** rgb triple → css colour with optional per-channel jitter (rng in [-j, j] * 255). */
export function rgb(c, rng = null, jitter = 0) {
  const j = () => (rng ? (rng.next() * 2 - 1) * jitter * 255 : 0);
  const cl = (v) => Math.round(Math.min(255, Math.max(0, v)));
  return `rgb(${cl(c[0] + j())},${cl(c[1] + j())},${cl(c[2] + j())})`;
}

/** Hex "#rrggbb" → [r, g, b] (0..255). */
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
