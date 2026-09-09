// Shape of the M1.8 element catalogue (js/elements/catalogue-data.js): every registered kind carries
// difficulty axes 0–5, a correct discrete-step flag, and an i18n label that actually resolves in both
// locales. Deliberately imports only the pure data module, never js/elements/catalogue.js itself –
// every concrete element pulls in THREE transitively through element.js, which plain `node --test`
// cannot resolve (no bundler, no node_modules; see the comment at the top of catalogue-data.js).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CATALOGUE, CATALOGUE_VARIANTS, catalogueEntry } from "../../js/elements/catalogue-data.js";

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

// --- M2b parameter variants (ROADMAP "obstacle catalogue to 20–25 families/variants") ----------------------

test("the catalogue lists exactly eight M2b variants, once each, every baseKind a real M1.8 kind", () => {
  assert.equal(CATALOGUE_VARIANTS.length, 8);
  const kinds = CATALOGUE_VARIANTS.map((v) => v.kind);
  assert.equal(new Set(kinds).size, 8, "duplicate variant kind");
  const baseKinds = new Set(CATALOGUE.map((e) => e.kind));
  for (const variant of CATALOGUE_VARIANTS) {
    assert.ok(baseKinds.has(variant.baseKind), `${variant.kind}: unknown baseKind '${variant.baseKind}'`);
    assert.notEqual(variant.kind, variant.baseKind, `${variant.kind}: a variant must not share its base kind's id`);
  }
});

test("every variant's metrics cover all four axes with a value 0–5, same shape as the base twelve", () => {
  for (const variant of CATALOGUE_VARIANTS) {
    assert.deepEqual(Object.keys(variant.metrics).sort(), [...AXES].sort(), `${variant.kind}: wrong axis set`);
    for (const axis of AXES) {
      const v = variant.metrics[axis];
      assert.ok(Number.isFinite(v), `${variant.kind}.${axis} is not a number`);
      assert.ok(v >= 0 && v <= 5, `${variant.kind}.${axis} = ${v} is outside 0–5`);
    }
  }
});

test("every variant carries a non-empty configOverride – the whole point is different numbers, not a new mechanic", () => {
  for (const variant of CATALOGUE_VARIANTS) {
    assert.ok(variant.configOverride && typeof variant.configOverride === "object", `${variant.kind}: missing configOverride`);
    assert.ok(Object.keys(variant.configOverride).length > 0, `${variant.kind}: empty configOverride`);
  }
});

test("every variant's discrete flag matches its own base kind's (the movement model is inherited, not overridden)", () => {
  for (const variant of CATALOGUE_VARIANTS) {
    const base = catalogueEntry(variant.baseKind);
    assert.equal(variant.discrete, base.discrete, `${variant.kind}: discrete flag disagrees with base kind '${variant.baseKind}'`);
  }
});

test("every variant label key exists in both en and de strings", async () => {
  const en = await loadStrings("en");
  const de = await loadStrings("de");
  for (const variant of CATALOGUE_VARIANTS) {
    assert.ok(Object.prototype.hasOwnProperty.call(en, variant.labelKey), `${variant.labelKey} missing in en.json`);
    assert.ok(Object.prototype.hasOwnProperty.call(de, variant.labelKey), `${variant.labelKey} missing in de.json`);
    assert.ok(en[variant.labelKey].length > 0 && de[variant.labelKey].length > 0, `${variant.labelKey}: empty label`);
  }
});

test("catalogueEntry also finds variants by kind, distinct from their base entry", () => {
  const variant = catalogueEntry("burma-narrow");
  assert.equal(variant.baseKind, "burma-bridge");
  assert.notEqual(variant, catalogueEntry("burma-bridge"));
});
