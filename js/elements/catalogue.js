// Every registered rail-element kind, in one place. Importing this module registers all twelve
// concrete builders (the side effect `registerElementKind` relies on – see element.js) and re-exposes
// their static metadata from `catalogue-data.js`, so a future layout generator can enumerate what is
// buildable without importing each module – and a browser page like `tools/dev/elements.html` can
// build every one of them for inspection – by hand.
import { elementKinds, createElement } from "./element.js";
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

export { CATALOGUE, catalogueEntry } from "./catalogue-data.js";
export { elementKinds, createElement };
