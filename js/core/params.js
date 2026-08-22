// URL parameters → runtime flags. ?debug=1 ?autoplay=1 ?seed=42 ?fast=1 ?locale=de
import { BELAY_MODES, DEFAULTS } from "../config.js";

export function readParams(search = location.search) {
  const q = new URLSearchParams(search);
  const flag = (k) => q.has(k) && q.get(k) !== "0" && q.get(k) !== "false";
  const seedRaw = q.get("seed");
  const seed = seedRaw == null || seedRaw === "" ? DEFAULTS.seed : (Number.isFinite(Number(seedRaw)) ? Number(seedRaw) : seedRaw);
  const belay = q.get("belay");
  return Object.freeze({
    debug: flag("debug"),
    physics: flag("physics"),   // Rapier wireframe (F2) – separate from the stats panel
    autoplay: flag("autoplay"),
    fast: flag("fast"),
    seed,
    locale: q.get("locale") || DEFAULTS.locale,
    belayMode: BELAY_MODES.includes(belay) ? belay : DEFAULTS.belayMode,
  });
}
