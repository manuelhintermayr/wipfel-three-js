// Quick multi-seed smoke check for the M1.1 layout generator: prints one line per seed with the
// route/platform/zip summary, or the failure reason. Not a unit test (tests/unit/layout.test.mjs
// asserts the actual constraints) – this is the fast eyeball version for a generator change.
// Usage: node tools/dev/smoke-layout.mjs
import { createHeadlessTerrain } from "../headless-terrain.mjs";
import { generateParkLayout } from "../../js/park/layout.js";

for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
  const t0 = Date.now();
  const terrain = createHeadlessTerrain({ seed });
  let def;
  try {
    def = generateParkLayout({ seed, terrain });
  } catch (err) {
    console.error(`seed ${seed}: FAILED - ${err.message}`);
    continue;
  }
  const ms = Date.now() - t0;
  console.log(`seed ${seed}: OK in ${ms} ms - trees ${def.heroTrees.length} - routes ${def.routes.map((r) => `${r.id}(${r.platforms.length}p/${r.edges.length}e,zip ${r.zip.length.toFixed(1)}m@${(r.zip.gradient * 100).toFixed(1)}%)`).join(" ")}`);
}
