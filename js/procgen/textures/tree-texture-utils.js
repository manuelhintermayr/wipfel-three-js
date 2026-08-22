// Helpers for the tree textures (bark + foliage): seeded periodic gradient noise, tileable fbm/ridged
// noise, periodic cell noise, colour maths, height→normal conversion and texture wrapping.
// (Separate from texture-utils.js, which belongs to the terrain textures.) No Math.random anywhere.
import * as THREE from "three";
import { Rng, hash32 } from "../../core/rng.js";

export function createCanvas(width, height = width) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  return { canvas, ctx };
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** h in degrees, s/l in [0,1] → [r,g,b] 0..255 */
export function hsl(h, s, l) {
  const c = new THREE.Color().setHSL((((h % 360) + 360) / 360) % 1, clamp01(s), clamp01(l));
  return [c.r * 255, c.g * 255, c.b * 255];
}
export const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const scaleRgb = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const cssRgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/**
 * Periodic gradient noise. `noise(x, y, periodX, periodY)` wraps its lattice at the given integer
 * periods, so an fbm whose octave periods are integers tiles perfectly. Output roughly [-1, 1].
 */
export function makePeriodicNoise2D(seed) {
  const rng = new Rng(hash32(seed));
  const p = Array.from({ length: 256 }, (_, i) => i);
  rng.shuffle(p);
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
      case 4: return x * 1.4142; case 5: return -x * 1.4142; case 6: return y * 1.4142; default: return -y * 1.4142;
    }
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return function noise(x, y, periodX, periodY) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X0 = ((xi % periodX) + periodX) % periodX, X1 = (X0 + 1) % periodX;
    const Y0 = ((yi % periodY) + periodY) % periodY, Y1 = (Y0 + 1) % periodY;
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[X0 & 255] + (Y0 & 255)], ba = perm[perm[X1 & 255] + (Y0 & 255)];
    const ab = perm[perm[X0 & 255] + (Y1 & 255)], bb = perm[perm[X1 & 255] + (Y1 & 255)];
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  };
}

/** Tileable fbm over tile coordinates (u, v) in [0,1). periodX/Y = lattice cells of the first octave. */
export function fbmTile(noise, u, v, periodX, periodY, octaves = 5, gain = 0.5) {
  let amp = 1, sum = 0, norm = 0, px = periodX, py = periodY;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(u * px, v * py, px, py);
    norm += amp;
    amp *= gain;
    px *= 2; py *= 2;
  }
  return sum / norm;
}

/** Ridged tileable fbm in [0,1] – sharp crests, good for bark furrows. */
export function ridgedTile(noise, u, v, periodX, periodY, octaves = 4, gain = 0.5) {
  let amp = 1, sum = 0, norm = 0, px = periodX, py = periodY;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise(u * px, v * py, px, py));
    sum += amp * n * n;
    norm += amp;
    amp *= gain;
    px *= 2; py *= 2;
  }
  return sum / norm;
}

/**
 * Periodic cell (Worley) noise on a torus with nx × ny jittered feature points.
 * Returns `cells(u, v) → { f1, f2, id }` – distances in cell units, id = stable per-cell hash.
 */
export function makePeriodicCells(seed, nx, ny, jitter = 0.85) {
  const rng = new Rng(hash32(seed));
  const px = new Float32Array(nx * ny), py = new Float32Array(nx * ny), ids = new Uint32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      px[k] = i + 0.5 + (rng.next() - 0.5) * jitter;
      py[k] = j + 0.5 + (rng.next() - 0.5) * jitter;
      ids[k] = hash32(`${seed}:${i}:${j}`);
    }
  }
  return function cells(u, v) {
    const x = u * nx, y = v * ny;
    const cx = Math.floor(x), cy = Math.floor(y);
    let f1 = 1e9, f2 = 1e9, id = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const gi = (((cx + di) % nx) + nx) % nx, gj = (((cy + dj) % ny) + ny) % ny;
        const k = gj * nx + gi;
        // wrap-aware offset: the feature point lives in the neighbour cell, possibly across the seam
        const dx = px[k] - x + (cx + di - gi), dy = py[k] - y + (cy + dj - gj);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) { f2 = f1; f1 = d; id = ids[k]; } else if (d < f2) f2 = d;
      }
    }
    return { f1, f2, id };
  };
}

/** Deterministic [0,1) from a 32-bit id and a salt – for per-cell colour variation. */
export function idRand(id, salt) {
  return (hash32(id * 31 + salt) % 100000) / 100000;
}

/**
 * Tangent-space normal map (RGBA bytes) from a tileable height field (values ~[0,1]).
 * Green = +v (up in the image), matching three.js' default flipY textures.
 */
export function heightToNormalMap(height, w, h, strength = 2.0) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const yu = (y - 1 + h) % h, yd = (y + 1) % h;
    for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w, xr = (x + 1) % w;
      const dx = (height[y * w + xr] - height[y * w + xl]) * strength;
      const dy = (height[yu * w + x] - height[yd * w + x]) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const o = (y * w + x) * 4;
      out[o] = (-dx / len * 0.5 + 0.5) * 255;
      out[o + 1] = (dy / len * 0.5 + 0.5) * 255;
      out[o + 2] = (1 / len * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Writes RGBA bytes into a fresh canvas of the given size. */
export function canvasFromPixels(pixels, w, h) {
  const { canvas, ctx } = createCanvas(w, h);
  const img = ctx.createImageData(w, h);
  img.data.set(pixels);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Copies a canvas with transparency into an sRGB DataTexture whose transparent texels are flooded
 * with the colours of their opaque neighbours (then the average), so mipmaps never darken towards
 * alpha edges. Canvas2D cannot store colour under alpha 0, hence the DataTexture detour.
 */
export function canvasToBledTexture(canvas, { passes = 4, anisotropy = 8 } = {}) {
  const w = canvas.width, h = canvas.height;
  const data = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  const filled = new Uint8Array(w * h);
  let sr = 0, sg = 0, sb = 0, count = 0;
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] > 8) { filled[i] = 1; sr += data[i * 4]; sg += data[i * 4 + 1]; sb += data[i * 4 + 2]; count++; }
  }
  const avg = count ? [sr / count, sg / count, sb / count] : [60, 90, 40];
  for (let pass = 0; pass < passes; pass++) {
    const next = filled.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (filled[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        const take = (k) => { r += data[k * 4]; g += data[k * 4 + 1]; b += data[k * 4 + 2]; n++; };
        if (x > 0 && filled[i - 1]) take(i - 1);
        if (x < w - 1 && filled[i + 1]) take(i + 1);
        if (y > 0 && filled[i - w]) take(i - w);
        if (y < h - 1 && filled[i + w]) take(i + w);
        if (!n) continue;
        data[i * 4] = r / n; data[i * 4 + 1] = g / n; data[i * 4 + 2] = b / n;
        next[i] = 1;
      }
    }
    filled.set(next);
  }
  for (let i = 0; i < w * h; i++) {
    if (!filled[i]) { data[i * 4] = avg[0]; data[i * 4 + 1] = avg[1]; data[i * 4 + 2] = avg[2]; }
  }
  const tex = new THREE.DataTexture(new Uint8Array(data.buffer), w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.flipY = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/** Wraps a canvas as a repeating CanvasTexture. `srgb` for colour maps, false for data maps. */
export function toTexture(canvas, { srgb = false, repeat = true, anisotropy = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}
