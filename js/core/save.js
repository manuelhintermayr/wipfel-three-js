// Versioned save (schema 1): route best times and completion counters. Stored data is never
// trusted – anything malformed collapses to defaults; new fields must be additive with defaults.
import { GAME } from "../config.js";

const DEFAULTS = Object.freeze({
  schema: GAME.saveSchema,
  routes: {},               // routeId → { bestSeconds, completions, cleanRuns }
  locale: null,             // null = use DEFAULTS.locale / ?locale=
});

/** @returns {{ data, routeBest(id), recordRun(id, {seconds, falls}), setLocale(l), flush() }} */
export function createSave(storage = defaultStorage()) {
  const data = load(storage);

  function flush() {
    try { storage.setItem(GAME.saveKey, JSON.stringify(data)); } catch { /* quota/private mode – play on without saving */ }
  }

  return {
    data,
    routeBest(routeId) {
      const r = data.routes[routeId];
      return r && Number.isFinite(r.bestSeconds) ? r.bestSeconds : null;
    },
    /** @returns {boolean} true when this run set a new best */
    recordRun(routeId, { seconds, falls = 0 }) {
      const r = data.routes[routeId] || (data.routes[routeId] = { bestSeconds: null, completions: 0, cleanRuns: 0 });
      r.completions += 1;
      if (falls === 0) r.cleanRuns += 1;
      const best = Number.isFinite(r.bestSeconds) ? r.bestSeconds : Infinity;
      const isBest = Number.isFinite(seconds) && seconds < best;
      if (isBest) r.bestSeconds = seconds;
      flush();
      return isBest;
    },
    setLocale(locale) { data.locale = locale; flush(); },
    flush,
  };
}

function load(storage) {
  let raw = null;
  try { raw = storage.getItem(GAME.saveKey); } catch { /* storage unavailable */ }
  if (!raw) return structuredClone(DEFAULTS);
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return structuredClone(DEFAULTS); }
  if (!parsed || typeof parsed !== "object" || parsed.schema !== GAME.saveSchema) return structuredClone(DEFAULTS);
  const data = structuredClone(DEFAULTS);
  if (parsed.routes && typeof parsed.routes === "object") {
    for (const [id, r] of Object.entries(parsed.routes)) {
      if (!r || typeof r !== "object") continue;
      data.routes[id] = {
        bestSeconds: Number.isFinite(r.bestSeconds) ? r.bestSeconds : null,
        completions: Number.isFinite(r.completions) ? r.completions : 0,
        cleanRuns: Number.isFinite(r.cleanRuns) ? r.cleanRuns : 0,
      };
    }
  }
  if (typeof parsed.locale === "string") data.locale = parsed.locale;
  return data;
}

function defaultStorage() {
  try { return window.localStorage; } catch { return memoryStorage(); }
}

/** In-memory stand-in for tests and privacy modes. */
export function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}
