// Determinism and basic distribution of the seeded RNG + noise helpers.
import test from "node:test";
import assert from "node:assert/strict";
import { Rng, hash32, makeNoise2D, fbm2D } from "../../js/core/rng.js";

test("same seed → identical sequence", () => {
  const a = new Rng(42), b = new Rng(42);
  for (let i = 0; i < 1000; i++) assert.equal(a.next(), b.next());
});

test("different seeds → different sequences", () => {
  const a = new Rng(1), b = new Rng(2);
  let same = 0;
  for (let i = 0; i < 200; i++) if (a.next() === b.next()) same++;
  assert.ok(same < 3);
});

test("string seeds hash deterministically", () => {
  assert.equal(hash32("wipfel"), hash32("wipfel"));
  assert.notEqual(hash32("wipfel"), hash32("wipfel2"));
  assert.equal(new Rng("park-a").next(), new Rng("park-a").next());
});

test("fork() yields independent, reproducible streams", () => {
  const r1 = new Rng(7), r2 = new Rng(7);
  const t1 = r1.fork("trees"), t2 = r2.fork("trees");
  r1.next(); r1.next(); // consuming the parent must not affect the fork
  assert.equal(t1.next(), t2.next());
  assert.notEqual(new Rng(7).fork("trees").next(), new Rng(7).fork("rocks").next());
});

test("float/int ranges and rough uniformity", () => {
  const r = new Rng(99);
  let min = 1, max = 0, sum = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) { const v = r.next(); if (v < min) min = v; if (v > max) max = v; sum += v; }
  assert.ok(min >= 0 && max < 1);
  assert.ok(Math.abs(sum / N - 0.5) < 0.01, `mean ${sum / N}`);
  for (let i = 0; i < 1000; i++) { const v = r.int(3, 5); assert.ok(v >= 3 && v <= 5 && Number.isInteger(v)); }
});

test("noise is deterministic per seed and bounded", () => {
  const n1 = makeNoise2D("terrain"), n2 = makeNoise2D("terrain");
  for (let i = 0; i < 100; i++) {
    const x = i * 0.37, y = i * 0.11;
    assert.equal(n1(x, y), n2(x, y));
    const v = fbm2D(n1, x, y, 5);
    assert.ok(v >= -1.01 && v <= 1.01);
  }
});
