// Every registered rail-element kind, in one place. Importing this module registers all twelve
// concrete builders (the side effect `registerElementKind` relies on – see element.js) and re-exposes
// their static metadata from `catalogue-data.js`, so a future layout generator can enumerate what is
// buildable without importing each module – and a browser page like `tools/dev/elements.html` can
// build every one of them for inspection – by hand.
import { elementKinds, createElement, registerElementVariant } from "./element.js";
import { CATALOGUE_VARIANTS } from "./catalogue-data.js";
import "./burma-bridge.js";
import "./hanging-planks.js";
import "./net-bridge.js";
import "./zipline.js";
import "./beam-fixed.js";
import "./beam-swing.js";
import "./stirrups.js";
import "./wire-loops.js";
import "./barrels.js";
import "./rings.js";
import "./tarzan.js";
import "./skate.js";
// M4 co-op kinds (ROADMAP "Koop-Übungen", GDD §3.11) – each registers itself the same way every kind
// above does; js/park/layout-route.js#buildEdges places them deliberately (never the random pool).
import "./team-bridge.js";
import "./counterweight-lift.js";

// M2b parameter variants (ROADMAP "Übungskatalog auf 20–25 Familien/Varianten"): every base kind above
// has registered itself by now (ES modules run top to bottom, and every import above is a concrete
// module's own `registerElementKind` side effect) – registering the variants down here, once, keeps
// this the single place that turns catalogue-data.js's plain data into buildable kinds.
for (const variant of CATALOGUE_VARIANTS) registerElementVariant(variant.kind, variant.baseKind, variant.configOverride);

export { CATALOGUE, CATALOGUE_VARIANTS, COOP_CATALOGUE, catalogueEntry } from "./catalogue-data.js";
export { elementKinds, createElement };
