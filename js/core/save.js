// Versioned save (schema 1): route best times, completion counters and category gates. Stored data is
// never trusted – anything malformed collapses to defaults; new fields must be additive with defaults.
import { GAME, GRAPHICS } from "../config.js";

const DEFAULTS = Object.freeze({
  schema: GAME.saveSchema,
  routes: {},               // routeId → { bestSeconds, completions, cleanRuns }
  // Category gates (GDD §3.12: "Farben sind Tore" – Blue → Red → Black). Blue is always open; a
  // category unlocks once any route of the *previous* colour has been completed (js/game/session.js).
  // `legendary` (M2a) is the one exception – it needs *every* black route completed, not just one, so
  // js/game/session.js checks that directly instead of going through `nextGateCategory`.
  unlocks: Object.freeze({ blue: true, red: false, black: false, legendary: false }),
  locale: null,             // null = use DEFAULTS.locale / ?locale=
  // Einschulung (M1.3, GDD §3.7): once true the practice-anchor gate never shows again
  // (js/game/briefing.js, js/player/interaction.js).
  briefingDone: false,
  // Active ticket (M1.5) – null when no day is in progress (fresh boot, or after "Continue browsing").
  // Reopening the page with a ticket here resumes the day instead of showing the kassa (js/main.js).
  ticket: null,
  // Options screen (M1.7, js/ui/options.js) – applied live on every change and again once at boot.
  // `lookSensitivity: null` means "use core/input.js's own default", not "silent at 0".
  settings: Object.freeze({
    audio: Object.freeze({ master: 100, sfx: 100, ambience: 100, ui: 100 }),   // 0–100 sliders
    lookSensitivity: null,
    invertY: false,
    reducedCameraMotion: false,   // js/player/camera.js#setReducedMotion – fall shake + nerve breathing
    reducedMotion: false,         // HUD pulse animations (body class, css/base.css)
    assist: false,                // js/player/assist.js – gentler balance disturbance, wider slip window
    // M2b (ROADMAP "Grafikoptionen"): one of js/config.js#GRAPHICS.order ("high"|"medium"|"low").
    graphics: "high",
  }),
  // M2b (ROADMAP "drei Sicherungsmodi"/GDD §3.3): classic-mode accidents (both carabiners open on an
  // element/ladder/zip) – js/player/accident.js records one every time it happens, never reset.
  stats: Object.freeze({ accidents: 0 }),
  // M2a (ROADMAP): time trials, per-route best time only ever set by a trial run (js/game/route.js#isTrial).
  trials: {},               // routeId → bestSeconds
  // M2a (ROADMAP, GDD §3.12): four booleans per route, `MASTERY.tierOrder` order – a tier once earned
  // is never taken away (js/game/mastery.js#mergeTiers), even if a later run misses it.
  mastery: {},               // routeId → { tiers: [completed, noFalls, underPar, inFlow] }
  // M2a (ROADMAP, GDD §3.12 "Ausrüstung als Sidegrade") – null until unlocked *and* chosen at the kassa;
  // js/player/sidegrade.js reads this only through js/main.js's own setSidegrade() call, never directly.
  equipmentId: null,
});

const SETTINGS_BOOLEANS = Object.freeze(["invertY", "reducedCameraMotion", "reducedMotion", "assist"]);
const clampVolume = (v) => Math.max(0, Math.min(100, v));

/** What completing a route in `category` unlocks next, or null (GDD §3.12: Blue → Red → Black). */
export function nextGateCategory(category) {
  return category === "blue" ? "red" : category === "red" ? "black" : null;
}

/** @returns {{ data, routeBest(id), recordRun(id, {seconds, falls}), isUnlocked(category),
 *   unlockCategory(category), setLocale(l), flush(),
 *   hasCompletedAnyRoute(), trialBest(id), recordTrial(id, seconds),
 *   masteryOf(id), recordMastery(id, tiers), setEquipment(id), recordAccident() }} */
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
    /** @returns {boolean} true once any route has ever been completed – js/game/flow.js's HUD gate. */
    hasCompletedAnyRoute() { return Object.values(data.routes).some((r) => r.completions > 0); },

    /** M2a time trials: separate best-time bucket, only ever written by a trial run. */
    trialBest(routeId) {
      const seconds = data.trials[routeId];
      return Number.isFinite(seconds) ? seconds : null;
    },
    /** @returns {boolean} true when this trial set a new best */
    recordTrial(routeId, seconds) {
      const best = data.trials[routeId];
      const isBest = Number.isFinite(seconds) && (!Number.isFinite(best) || seconds < best);
      if (isBest) data.trials[routeId] = seconds;
      flush();
      return isBest;
    },

    /** M2a mastery tiers (GDD §3.12): read-only accessor, `[completed, noFalls, underPar, inFlow]|null`. */
    masteryOf(routeId) { return data.mastery[routeId] ? data.mastery[routeId].tiers.slice() : null; },
    /** Merge a freshly evaluated tier set in – a tier once earned is kept even if a later run misses it. */
    recordMastery(routeId, tiers) {
      const previous = data.mastery[routeId] ? data.mastery[routeId].tiers : tiers.map(() => false);
      data.mastery[routeId] = { tiers: previous.map((was, i) => was || tiers[i]) };
      flush();
      return data.mastery[routeId].tiers.slice();
    },

    /** M2a sidegrade (GDD §3.12): `id` one of js/config.js#SIDEGRADES' keys, or null for none. */
    setEquipment(id) { data.equipmentId = id; flush(); },

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

    /**
     * Options screen (M1.7): merge a partial settings patch, e.g. `{ audio: { sfx: 40 } }` or
     * `{ assist: true }`. Unknown keys are ignored; `data.settings` itself is never replaced wholesale
     * so other modules holding a reference to it keep seeing live values.
     */
    updateSettings(patch = {}) {
      if (patch.audio && typeof patch.audio === "object") {
        for (const key of Object.keys(data.settings.audio)) if (Number.isFinite(patch.audio[key])) data.settings.audio[key] = clampVolume(patch.audio[key]);
      }
      if (patch.lookSensitivity === null || Number.isFinite(patch.lookSensitivity)) data.settings.lookSensitivity = patch.lookSensitivity;
      for (const key of SETTINGS_BOOLEANS) if (typeof patch[key] === "boolean") data.settings[key] = patch[key];
      if (GRAPHICS.order.includes(patch.graphics)) data.settings.graphics = patch.graphics;
      flush();
    },

    /** Classic-mode accident (M2b, js/player/accident.js) – additive counter, never reset. */
    recordAccident() {
      data.stats.accidents += 1;
      flush();
      return data.stats.accidents;
    },

    /** A JSON string snapshot of the whole save (M3/M4: share/back up a profile). */
    export() { return JSON.stringify(data); },

    /**
     * Load a previously exported JSON string, through the exact same validation a page load uses –
     * malformed JSON, a foreign schema, or corrupt fields never touch the live save.
     * @returns {boolean} true if the import was applied
     */
    import(json) {
      let parsed;
      try { parsed = JSON.parse(json); } catch { return false; }
      if (!parsed || typeof parsed !== "object" || parsed.schema !== GAME.saveSchema) return false;
      const next = normalize(parsed);
      for (const key of Object.keys(DEFAULTS)) data[key] = next[key];
      flush();
      return true;
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
  return normalize(parsed);
}

/** Pure: an arbitrary parsed object → a full, defaulted, validated save. Shared by `load()` (storage) and `import()` (a pasted/exported string) so both paths trust the same rules. */
function normalize(parsed) {
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
  if (parsed.settings && typeof parsed.settings === "object") {
    const s = parsed.settings;
    if (s.audio && typeof s.audio === "object") {
      for (const key of Object.keys(data.settings.audio)) {
        if (Number.isFinite(s.audio[key])) data.settings.audio[key] = clampVolume(s.audio[key]);
      }
    }
    if (s.lookSensitivity === null || Number.isFinite(s.lookSensitivity)) data.settings.lookSensitivity = s.lookSensitivity;
    for (const key of SETTINGS_BOOLEANS) if (typeof s[key] === "boolean") data.settings[key] = s[key];
    if (GRAPHICS.order.includes(s.graphics)) data.settings.graphics = s.graphics;
  }
  if (parsed.stats && typeof parsed.stats === "object" && Number.isFinite(parsed.stats.accidents)) {
    data.stats.accidents = Math.max(0, parsed.stats.accidents);
  }
  // M2a: trials/mastery per route id, additive – an unknown/malformed entry is simply dropped, never
  // collapses the whole map back to defaults (same philosophy as `data.routes` above).
  if (parsed.trials && typeof parsed.trials === "object") {
    for (const [id, seconds] of Object.entries(parsed.trials)) if (Number.isFinite(seconds)) data.trials[id] = seconds;
  }
  if (parsed.mastery && typeof parsed.mastery === "object") {
    for (const [id, m] of Object.entries(parsed.mastery)) {
      if (!m || !Array.isArray(m.tiers) || m.tiers.length !== 4) continue;
      data.mastery[id] = { tiers: m.tiers.map((v) => v === true) };
    }
  }
  if (typeof parsed.equipmentId === "string" || parsed.equipmentId === null) data.equipmentId = parsed.equipmentId ?? null;
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
