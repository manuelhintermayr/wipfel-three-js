// Shape of the M1.8 element catalogue (js/elements/catalogue-data.js): every registered kind carries
// difficulty axes 0–5, a correct discrete-step flag, and an i18n label that actually resolves in both
// locales. Deliberately imports only the pure data module, never js/elements/catalogue.js itself –
// every concrete element pulls in THREE transitively through element.js, which plain `node --test`
// cannot resolve (no bundler, no node_modules; see the comment at the top of catalogue-data.js).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CATALOGUE, catalogueEntry } from "../../js/elements/catalogue-data.js";

const AXES = ["physical", "coordination", "psychological", "technical"];
/** Kinds crossed one step at a time (js/player/on-element.js reads `element.discrete === true`). */
const DISCRETE_KINDS = ["hanging-planks", "stirrups", "wire-loops", "rings"];

async function loadStrings(locale) {
  const url = new URL(`../../assets/strings/${locale}.json`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

test("the catalogue lists exactly the twelve M1.8 kinds, once each", () => {
  assert.equal(CATALOGUE.length, 12);
  const kinds = CATALOGUE.map((e) => e.kind);
  assert.equal(new Set(kinds).size, 12, "duplicate kind in the catalogue");
});

test("every entry's metrics cover all four axes with a value 0–5", () => {
  for (const entry of CATALOGUE) {
    assert.deepEqual(Object.keys(entry.metrics).sort(), [...AXES].sort(), `${entry.kind}: wrong axis set`);
    for (const axis of AXES) {
      const v = entry.metrics[axis];
      assert.ok(Number.isFinite(v), `${entry.kind}.${axis} is not a number`);
      assert.ok(v >= 0 && v <= 5, `${entry.kind}.${axis} = ${v} is outside 0–5`);
    }
  }
});

test("discrete flags mark exactly the step-wise kinds", () => {
  for (const entry of CATALOGUE) {
    assert.equal(typeof entry.discrete, "boolean", `${entry.kind}.discrete is not a boolean`);
    assert.equal(entry.discrete, DISCRETE_KINDS.includes(entry.kind), `${entry.kind}: unexpected discrete flag`);
  }
});

test("every label key exists in both en and de strings", async () => {
  const en = await loadStrings("en");
  const de = await loadStrings("de");
  for (const entry of CATALOGUE) {
    assert.ok(Object.prototype.hasOwnProperty.call(en, entry.labelKey), `${entry.labelKey} missing in en.json`);
    assert.ok(Object.prototype.hasOwnProperty.call(de, entry.labelKey), `${entry.labelKey} missing in de.json`);
    assert.ok(en[entry.labelKey].length > 0 && de[entry.labelKey].length > 0, `${entry.labelKey}: empty label`);
  }
});

test("catalogueEntry looks up by kind and returns null for the unknown", () => {
  assert.equal(catalogueEntry("burma-bridge").labelKey, "element.burma");
  assert.equal(catalogueEntry("skate").kind, "skate");
  assert.equal(catalogueEntry("does-not-exist"), null);
});
