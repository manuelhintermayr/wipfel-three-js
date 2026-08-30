// Versioned save (schema 1): route best times, completion counters and category gates. Stored data is
// never trusted – anything malformed collapses to defaults; new fields must be additive with defaults.
import { GAME } from "../config.js";

const DEFAULTS = Object.freeze({
  schema: GAME.saveSchema,
  routes: {},               // routeId → { bestSeconds, completions, cleanRuns }
  // Category gates (GDD §3.12: "Farben sind Tore" – Blue → Red → Black). Blue is always open; a
  // category unlocks once any route of the *previous* colour has been completed (js/game/session.js).
  unlocks: Object.freeze({ blue: true, red: false, black: false }),
  locale: null,             // null = use DEFAULTS.locale / ?locale=
  // Einschulung (M1.3, GDD §3.7): once true the practice-anchor gate never shows again
  // (js/game/briefing.js, js/player/interaction.js).
  briefingDone: false,
  // Active ticket (M1.5) – null when no day is in progress (fresh boot, or after "Continue browsing").
  // Reopening the page with a ticket here resumes the day instead of showing the kassa (js/main.js).
  ticket: null,
});

/** What completing a route in `category` unlocks next, or null (GDD §3.12: Blue → Red → Black). */
export function nextGateCategory(category) {
  return category === "blue" ? "red" : category === "red" ? "black" : null;
}

/** @returns {{ data, routeBest(id), recordRun(id, {seconds, falls}), isUnlocked(category),
 *   unlockCategory(category), setLocale(l), flush() }} */
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
    /** Categories not tracked in `unlocks` (green, legendary – no gate yet) default to open. */
    isUnlocked(category) { return data.unlocks[category] !== false; },
    /** @returns {boolean} true the first time this category is unlocked, false if it already was */
    unlockCategory(category) {
      if (data.unlocks[category] === true) return false;
      data.unlocks[category] = true;
      flush();
      return true;
    },
    setLocale(locale) { data.locale = locale; flush(); },

    /** @returns {boolean} true the first time the briefing is completed, false if it already was */
    completeBriefing() {
      if (data.briefingDone) return false;
      data.briefingDone = true;
      flush();
      return true;
    },

    /** Kassa confirm: start a fresh ticket for today (js/game/ticket.js owns the running clock). */
    startTicket({ type, sizeClassId, belayMode = null }) {
      data.ticket = { type, sizeClassId, belayMode, elapsedReal: 0, extensionsUsed: 0 };
      flush();
    },

    /** Low-frequency progress write (caller throttles) so a reload can resume close to where it left off. */
    updateTicket(patch) {
      if (!data.ticket) return;
      Object.assign(data.ticket, patch);
      flush();
    },

    /** "New day" / "Continue browsing": no ticket is in progress any more. */
    endTicket() {
      data.ticket = null;
      flush();
    },

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
  if (parsed.unlocks && typeof parsed.unlocks === "object") {
    for (const category of Object.keys(data.unlocks)) {
      if (typeof parsed.unlocks[category] === "boolean") data.unlocks[category] = parsed.unlocks[category];
    }
  }
  data.unlocks.blue = true;   // always open, regardless of what an older/corrupt save says
  if (typeof parsed.locale === "string") data.locale = parsed.locale;
  if (typeof parsed.briefingDone === "boolean") data.briefingDone = parsed.briefingDone;
  if (parsed.ticket && typeof parsed.ticket === "object") {
    const tk = parsed.ticket;
    data.ticket = {
      type: typeof tk.type === "string" ? tk.type : "standard",
      sizeClassId: typeof tk.sizeClassId === "string" ? tk.sizeClassId : "adult",
      belayMode: typeof tk.belayMode === "string" ? tk.belayMode : null,
      elapsedReal: Number.isFinite(tk.elapsedReal) ? tk.elapsedReal : 0,
      extensionsUsed: Number.isFinite(tk.extensionsUsed) ? tk.extensionsUsed : 0,
    };
  }
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
