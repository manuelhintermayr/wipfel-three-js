// Sun path, colour curves and tone-mapping helpers of js/world/lighting.js.
import test from "node:test";
import assert from "node:assert/strict";
import {
  sunElevationForHour, sunDirectionForHour, nightFactorForHour, sunColourForElevation,
  sunIntensityForElevation, skyColoursForHour, exposureForHour, toneMapAcesFilmic, hexToLinear,
} from "../../js/world/lighting.js";

const length = (v) => Math.hypot(v.x, v.y, v.z);

test("sun is below the horizon at night and above by day", () => {
  assert.ok(sunElevationForHour(22) < 0);
  assert.ok(sunElevationForHour(3) < 0);
  assert.ok(sunDirectionForHour(23).y < 0);
  assert.ok(sunElevationForHour(13) > 50);
  assert.ok(sunDirectionForHour(13).y > 0.75);
  assert.equal(sunIntensityForElevation(-5), 0);
  assert.ok(sunIntensityForElevation(24) > 2 && sunIntensityForElevation(24) < 3);
});

test("elevation rises monotonically before solar noon and falls after it", () => {
  let previous = sunElevationForHour(5);
  for (let h = 5.5; h <= 12.5; h += 0.5) {
    const el = sunElevationForHour(h);
    assert.ok(el > previous, `elevation must rise at ${h} h`);
    previous = el;
  }
  previous = sunElevationForHour(13.5);
  for (let h = 14; h <= 22; h += 0.5) {
    const el = sunElevationForHour(h);
    assert.ok(el < previous, `elevation must fall at ${h} h`);
    previous = el;
  }
});

test("late afternoon default: low sun in the south-west, unit direction", () => {
  const dir = sunDirectionForHour(17.5);
  assert.ok(Math.abs(length(dir) - 1) < 1e-9);
  const el = sunElevationForHour(17.5);
  assert.ok(el > 18 && el < 28, `elevation ${el}`);
  assert.ok(dir.x > 0.5, "west component (+X)");
  assert.ok(dir.z < -0.3, "south component (-Z)");
});

test("sun colour is warmer (more red than blue) at low elevation than at noon", () => {
  const low = sunColourForElevation(4), high = sunColourForElevation(60);
  assert.ok(low[0] / low[2] > high[0] / high[2]);
  assert.deepEqual(sunColourForElevation(25).map((c) => c.toFixed(4)), hexToLinear(0xffe0b8).map((c) => c.toFixed(4)));
});

test("night factor and sky palette darken after dusk", () => {
  assert.equal(nightFactorForHour(12), 0);
  assert.ok(nightFactorForHour(20.5) > 0.9);
  assert.equal(nightFactorForHour(21), 1);
  const noon = skyColoursForHour(13), night = skyColoursForHour(21);
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  assert.ok(lum(night.zenith) < lum(noon.zenith) * 0.1);
  assert.ok(lum(night.horizon) < lum(noon.horizon) * 0.1);
  assert.equal(night.sunIntensity, 0);
  assert.ok(exposureForHour(21) > exposureForHour(13));
});

test("ACES fit matches three.js behaviour: black stays black, white ≈ 0.76, monotonic", () => {
  assert.deepEqual(toneMapAcesFilmic([0, 0, 0]), [0, 0, 0]);
  const white = toneMapAcesFilmic([1, 1, 1]);
  for (const c of white) assert.ok(Math.abs(c - 0.7634) < 0.01, `white → ${c}`);
  let previous = 0;
  for (let x = 0.05; x <= 20; x *= 1.5) {
    const v = toneMapAcesFilmic([x, x, x])[1];
    assert.ok(v >= previous && v <= 1);
    previous = v;
  }
});
