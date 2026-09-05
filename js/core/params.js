// URL parameters → runtime flags. ?debug=1 ?autoplay=1 ?seed=42 ?fast=1 ?locale=de ?kassa=1 ?briefing=0
// ?npc=0 ?map=1 ?options=1 ?routes=6 ?touch=1 ?builder=1 ?autowalk=<routeId>
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
    options: flag("options"),   // ?options=1 opens the pause/options screen at boot (screenshots, M1.7)
    // M2a: `?routes=6` swaps js/park/layout.js's 15-route+legendary default for the old M1 six-route
    // park (js/park/layout.js#PARK_CONFIG_SMALL) – quick dev iteration on anything that is not the
    // M2a content itself. Any other value (or none) keeps the new default.
    routes: q.get("routes") === "6" ? 6 : null,
    // M2b: force the touch overlay on for desktop testing (js/ui/touch-controls.js) – normally it only
    // appears on a `pointer: coarse` device (matchMedia).
    touch: flag("touch"),
    // M3a builder (js/builder/builder.js): boot straight into builder mode instead of the kassa –
    // `?autowalk=<routeId>` additionally starts that route's walkthrough with the `?autoplay=1` bot
    // immediately (verification/testing, GDD §4's walkthrough obligation with no human at the keyboard).
    builder: flag("builder"),
    autowalk: q.get("autowalk") || null,
  });
}
