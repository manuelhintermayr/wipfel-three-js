// UI strings. English is the default (mockup language, ADR-026); German is complete (park
// vocabulary). Strings live in assets/strings/<locale>.json – never hard-coded in modules.
// `t("prompt.stepOn", {label})` interpolates `{label}`. Missing keys fall back to English,
// then to the key itself (visible in the UI on purpose: a missing string is a bug to see).

let active = Object.create(null);
let fallback = Object.create(null);
let activeLocale = "en";

/**
 * Load locale files. Pass `dicts` directly in tests; in the game `initI18n({locale})` fetches
 * `assets/strings/en.json` (fallback) and the requested locale.
 * @param {{ locale?: string, dicts?: { en?: object, [locale: string]: object } }} options
 */
export async function initI18n({ locale = "en", dicts = null } = {}) {
  if (dicts) {
    fallback = dicts.en || Object.create(null);
    active = dicts[locale] || fallback;
    activeLocale = locale;
    return;
  }
  fallback = await fetchDict("en");
  active = locale === "en" ? fallback : await fetchDict(locale, fallback);
  activeLocale = locale;
}

async function fetchDict(locale, fallbackDict = null) {
  try {
    const res = await fetch(`./assets/strings/${locale}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[wipfel] strings for '${locale}' failed to load (${err && err.message}); falling back`);
    return fallbackDict || Object.create(null);
  }
}

/** Translate a key, interpolating `{name}` placeholders from `vars`. */
export function t(key, vars = null) {
  let text = active[key] != null ? active[key] : fallback[key];
  if (text == null) return key;
  if (vars) for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}

export function currentLocale() { return activeLocale; }

/** mm:ss.d – route times are short; hours never happen inside one course. */
export function formatTime(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return "–:––";
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}
