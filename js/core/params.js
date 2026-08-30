// URL parameters → runtime flags. ?debug=1 ?autoplay=1 ?seed=42 ?fast=1 ?locale=de ?kassa=1 ?briefing=0 ?npc=0 ?map=1
import { BELAY_MODES, DEFAULTS } from "../config.js";

export function readParams(search = location.search) {
  const q = new URLSearchParams(search);
  const flag = (k) => q.has(k) && q.get(k) !== "0" && q.get(k) !== "false";
  /** Opt-out flag: on unless explicitly `=0`/`=false` (e.g. `?briefing=0`). */
  const flagOff = (k) => !(q.has(k) && (q.get(k) === "0" || q.get(k) === "false"));
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
    kassa: flag("kassa"),       // force the kassa even with an active ticket in the save (M1.3)
    briefing: flagOff("briefing"),   // ?briefing=0 skips the Einschulung gate entirely (debug)
    npc: flagOff("npc"),        // ?npc=0 disables guest agents entirely (M1.6)
    map: flag("map"),           // ?map=1 opens the Course Map overlay at boot (screenshots, M1.4)
  });
}
