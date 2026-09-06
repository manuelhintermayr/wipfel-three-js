// i18n: interpolation, fallback chain (locale → en → key), time formatting.
import test from "node:test";
import assert from "node:assert/strict";
import { initI18n, t, formatTime, currentLocale } from "../../js/core/i18n.js";

const dicts = {
  en: { "a.b": "Hello {name}", "only.en": "english" },
  de: { "a.b": "Hallo {name}" },
};

test("active locale wins, en fills gaps, key is last resort", async () => {
  await initI18n({ locale: "de", dicts });
  assert.equal(currentLocale(), "de");
  assert.equal(t("a.b", { name: "Alex" }), "Hallo Alex");
  assert.equal(t("only.en"), "english");
  assert.equal(t("missing.key"), "missing.key");
});

test("en locale uses en directly", async () => {
  await initI18n({ locale: "en", dicts });
  assert.equal(t("a.b", { name: "X" }), "Hello X");
});

test("formatTime renders mm:ss.dd and survives bad input", async () => {
  assert.equal(formatTime(83.456), "01:23.46");
  assert.equal(formatTime(5.5), "00:05.50");
  assert.equal(formatTime(null), "–:––");
  assert.equal(formatTime(Number.NaN), "–:––");
});

test("string files contain the same keys in en and de", async () => {
  const { readFile } = await import("node:fs/promises");
  const en = JSON.parse(await readFile(new URL("../../assets/strings/en.json", import.meta.url), "utf8"));
  const de = JSON.parse(await readFile(new URL("../../assets/strings/de.json", import.meta.url), "utf8"));
  const keys = (d) => Object.keys(d).filter((k) => !k.startsWith("$") && k !== "locale").sort();
  assert.deepEqual(keys(de), keys(en));
});
