// Seeded, deterministic random numbers (sfc32). Math.random() is forbidden in gameplay/procgen code.

/** 32-bit string/number hash (MurmurHash3 finaliser style) used to derive sub-seeds. */
export function hash32(input) {
  const str = String(input);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Deterministic RNG. `new Rng(seed)`; `rng.fork("trees")` derives an independent stream so that
 * adding calls in one subsystem never shifts another subsystem's sequence.
 */
export class Rng {
  constructor(seed = 1) {
    const s = typeof seed === "number" ? seed >>> 0 : hash32(seed);
    this.seed = s;
    this.a = s ^ 0x9e3779b9;
    this.b = hash32(s + 1);
    this.c = hash32(s + 2);
    this.d = hash32(s + 3);
    for (let i = 0; i < 12; i++) this.next(); // warm up
  }

  /** float in [0, 1) */
  next() {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  float(min = 0, max = 1) { return min + (max - min) * this.next(); }
  int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
  bool(p = 0.5) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  /** approx. normal distribution via Box-Muller */
  gaussian(mean = 0, sd = 1) {
    const u = 1 - this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  fork(label) { return new Rng(hash32(`${this.seed}:${label}`)); }
}

/** 2-D value noise helpers (deterministic, seed-based) – enough for terrain/bark base layers. */
export function makeNoise2D(seed) {
  const s = hash32(seed);
  const perm = new Uint8Array(512);
  const rng = new Rng(s);
  const p = Array.from({ length: 256 }, (_, i) => i);
  rng.shuffle(p);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
      case 4: return x; case 5: return -x; case 6: return y; default: return -y;
    }
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  /** Perlin-style gradient noise in roughly [-1, 1] */
  return function noise2D(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
    return lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v,
    );
  };
}

/** Fractal Brownian motion over a 2-D noise function. */
export function fbm2D(noise, x, y, octaves = 5, lacunarity = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
