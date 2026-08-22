// Pure lighting maths for the sky/sun system: sun path, colour/intensity curves, exposure, tone-mapping.
// No THREE dependency – colours are linear-sRGB triplets [r, g, b] so everything is unit-testable in Node.
//
// World frame: +Y up, north = +Z, south = -Z (towards the city), west = +X, east = -X (right-handed).

const DEG = Math.PI / 180;

/** Stylised sun path: a real solar model, tuned so that 17.5 h gives a low warm sun in the south-west. */
export const SUN_PATH = Object.freeze({
  latitudeDeg: 48.2,          // Vienna
  declinationDeg: 13.5,       // mid-August
  solarNoonHour: 12.9,        // clock hour of the highest sun (sunrise ≈ 5.9 h, sunset ≈ 19.9 h)
  azimuthOffsetDeg: 30,       // rotates the whole path so the evening sun crosses the slope from the SW
});

/** Night blend by sun elevation: 0 at sunset, 1 once civil twilight is over (≈ 20.5 h and later). */
export const NIGHT_BLEND = Object.freeze({ startElevationDeg: 0, fullElevationDeg: -6 });

export const SUN_LIGHT = Object.freeze({
  intensityBase: 2.0,          // + intensityGain * sin(elevation)  → ≈ 2.4 at 22°, ≈ 2.9 at 60°
  intensityGain: 1.0,
  fadeStartElevationDeg: -1,   // light fades out between these two elevations (dawn/dusk)
  fadeEndElevationDeg: 6,
  nightKeyIntensity: 0.14,     // faint cool sky light at night so the forest keeps its shape (no moon)
  nightKeyColour: 0x8ea6cf,
  nightKeyDirection: Object.freeze({ x: 0.35, y: 0.82, z: -0.45 }),
});

export const HEMI_LIGHT = Object.freeze({ dayIntensity: 0.9, nightIntensity: 0.14 });

/** Exposure factor by sun elevation (multiplies the renderer's base exposure). */
const EXPOSURE_KEYS = [[-12, 1.35], [-4, 1.25], [0, 1.15], [8, 1.08], [25, 1.0], [90, 1.0]];

/** Sun light colour (sRGB hex) by elevation in degrees. */
const SUN_COLOUR_KEYS = [[-2, 0xff7a3c], [0, 0xff7a3c], [3, 0xffa055], [10, 0xffc48a], [25, 0xffe0b8], [60, 0xfff6ea], [90, 0xfffaf2]];

/** Sky palette (sRGB hex) by elevation: zenith, horizon (= fog), glow around the sun, hemisphere ground bounce. */
const SKY_KEYS = [
  //  el   zenith    horizon   sunGlow   ground
  [-14, [0x060b1a, 0x0c1424, 0x000000, 0x0a0d10]],
  [-6,  [0x0b1530, 0x1c2946, 0x2a1e2a, 0x10141a]],
  [-3,  [0x18305a, 0x4b5a86, 0x8d4a34, 0x22262c]],
  [0,   [0x3a5a9c, 0xd0a58a, 0xff9a4a, 0x3a3428]],
  [8,   [0x4d7fc0, 0xdcc4a8, 0xffc890, 0x4a4630]],
  [25,  [0x4a86cf, 0xcbd5de, 0xffd9a6, 0x4a5236]],
  [60,  [0x3d7ed3, 0xc9dcea, 0xfff0dc, 0x48563a]],
  [90,  [0x3d7ed3, 0xc9dcea, 0xfff0dc, 0x48563a]],
];

// ---------------------------------------------------------------- colour helpers (linear-sRGB triplets)

export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** 0xrrggbb → linear [r, g, b] */
export function hexToLinear(hex) {
  return [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];
}

export function mixColour(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function scaleColour(c, s) {
  return [c[0] * s, c[1] * s, c[2] * s];
}

export function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Piecewise-linear lookup in a sorted [[key, value], ...] table; `blend(a, b, t)` combines values. */
function lookup(keys, x, blend) {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (x <= keys[i][0]) {
      const [x0, v0] = keys[i - 1], [x1, v1] = keys[i];
      return blend(v0, v1, (x - x0) / (x1 - x0));
    }
  }
  return keys[keys.length - 1][1];
}

const lerpNumber = (a, b, t) => a + (b - a) * t;
const lerpHex = (a, b, t) => mixColour(hexToLinear(a), hexToLinear(b), t);

// ---------------------------------------------------------------- sun path

/** Sun elevation in degrees for a clock hour (0–24); negative below the horizon. */
export function sunElevationForHour(hour) {
  const lat = SUN_PATH.latitudeDeg * DEG, dec = SUN_PATH.declinationDeg * DEG;
  const hourAngle = (hour - SUN_PATH.solarNoonHour) * 15 * DEG;
  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, sinEl))) / DEG;
}

/** Sun azimuth in degrees: 0 = north (+Z), 90 = west (+X), 180 = south (-Z), 270 = east (-X); it decreases
 *  through the day (rises in the east/NE, culminates in the south, sets in the west/NW). */
export function sunAzimuthForHour(hour) {
  const lat = SUN_PATH.latitudeDeg * DEG, dec = SUN_PATH.declinationDeg * DEG;
  const hourAngle = (hour - SUN_PATH.solarNoonHour) * 15 * DEG;
  const el = sunElevationForHour(hour) * DEG;
  const cosEl = Math.max(1e-6, Math.cos(el));
  let cosAz = (Math.sin(dec) - Math.sin(el) * Math.sin(lat)) / (cosEl * Math.cos(lat));
  cosAz = Math.max(-1, Math.min(1, cosAz));
  let az = Math.acos(cosAz) / DEG;          // 0..180, measured from north towards the morning side
  if (hourAngle > 0) az = 360 - az;         // afternoon: mirror to the evening side
  az = 360 - az;                            // our frame counts north → west (+X) as positive
  return ((az + SUN_PATH.azimuthOffsetDeg) % 360 + 360) % 360;
}

/** Unit vector pointing FROM the scene TOWARDS the sun in world space (+Y up, north = +Z, west = +X). */
export function sunDirectionForHour(hour) {
  const el = sunElevationForHour(hour) * DEG, az = sunAzimuthForHour(hour) * DEG;
  return { x: Math.cos(el) * Math.sin(az), y: Math.sin(el), z: Math.cos(el) * Math.cos(az) };
}

/** 0 = day, 1 = full night, driven by sun elevation (≈ 20.5 h and later in the default path). */
export function nightFactorForHour(hour) {
  return smoothstep(NIGHT_BLEND.startElevationDeg, NIGHT_BLEND.fullElevationDeg, sunElevationForHour(hour));
}

// ---------------------------------------------------------------- light curves

/** Linear-sRGB sun light colour by elevation (warm and orange near the horizon, near-white at noon). */
export function sunColourForElevation(elevationDeg) {
  return lookup(SUN_COLOUR_KEYS, elevationDeg, lerpHex);
}

/** Directional sun intensity by elevation; 0 below the horizon (dawn/dusk fade). */
export function sunIntensityForElevation(elevationDeg) {
  const fade = smoothstep(SUN_LIGHT.fadeStartElevationDeg, SUN_LIGHT.fadeEndElevationDeg, elevationDeg);
  return fade * (SUN_LIGHT.intensityBase + SUN_LIGHT.intensityGain * Math.sin(Math.max(0, elevationDeg) * DEG));
}

/** Suggested tone-mapping exposure factor for the hour (1.0 by day, slightly higher at dusk/night). */
export function exposureForHour(hour) {
  return lookup(EXPOSURE_KEYS, sunElevationForHour(hour), lerpNumber);
}

/**
 * Sky palette for an hour – all colours linear-sRGB triplets:
 * `{ zenith, horizon, sunGlow, hemiSky, hemiGround, sunColour, sunIntensity, night, sunElevation }`.
 * `horizon` doubles as the fog colour (before tone mapping) so ground and dome meet seamlessly.
 */
export function skyColoursForHour(hour) {
  const el = sunElevationForHour(hour);
  const [zenith, horizon, sunGlow, ground] = lookup(SKY_KEYS, el, (a, b, t) => a.map((hex, i) => lerpHex(hex, b[i], t)));
  const night = nightFactorForHour(hour);
  const hemiSky = mixColour(mixColour(zenith, horizon, 0.45), [1, 1, 1], 0.05);
  const hemiGround = mixColour(ground, sunColourForElevation(el), 0.12 * (1 - night));
  return {
    zenith, horizon, sunGlow, hemiSky, hemiGround,
    sunColour: sunColourForElevation(el),
    sunIntensity: sunIntensityForElevation(el),
    hemiIntensity: lerpNumber(HEMI_LIGHT.dayIntensity, HEMI_LIGHT.nightIntensity, night),
    night,
    sunElevation: el,
  };
}

// ---------------------------------------------------------------- tone mapping (matches three.js ACESFilmic)

/** ACES filmic fit exactly as three.js applies it (input linear-sRGB, output display-linear, clamped 0–1). */
export function toneMapAcesFilmic(rgb, exposure = 1) {
  const s = exposure / 0.6;
  const r = rgb[0] * s, g = rgb[1] * s, b = rgb[2] * s;
  const a0 = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  const a1 = 0.07600 * r + 0.90834 * g + 0.01566 * b;
  const a2 = 0.02840 * r + 0.13383 * g + 0.83777 * b;
  const fit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
  const f0 = fit(a0), f1 = fit(a1), f2 = fit(a2);
  return [
    clamp01(1.60475 * f0 - 0.53108 * f1 - 0.07367 * f2),
    clamp01(-0.10208 * f0 + 1.10813 * f1 - 0.00605 * f2),
    clamp01(-0.00327 * f0 - 0.07276 * f1 + 1.07602 * f2),
  ];
}
