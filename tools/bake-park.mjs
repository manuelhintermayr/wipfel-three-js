#!/usr/bin/env node
// Bakes the sonnwendberg park to assets/parks/sonnwendberg.json: a pretty-printed snapshot of
// generateParkLayout()'s output, built off the headless terrain sampler (tools/headless-terrain.mjs)
// so this runs under plain `node`, no browser. The live game never reads this file – js/main.js#boot
// calls generateParkLayout() itself against the real terrain – so the snapshot is the reproducibility
// record ROADMAP M1.1 asks for and a fixture future tools/tests can diff a seed against.
// Usage: node tools/bake-park.mjs [seed]
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHeadlessTerrain } from "./headless-terrain.mjs";
import { generateParkLayout } from "../js/park/layout.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const seed = Number(process.argv[2]) || 1;

const terrain = createHeadlessTerrain({ seed });
const parkDef = generateParkLayout({ seed, terrain });

const outDir = join(root, "assets", "parks");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${parkDef.id}.json`);
writeFileSync(outFile, `${JSON.stringify(parkDef, null, 2)}\n`, "utf8");

console.log(`baked ${outFile}`);
console.log(`  seed ${seed} · trees ${parkDef.heroTrees.length} · routes ${parkDef.routes.map((r) => `${r.id}(${r.platforms.length}p)`).join(" ")}`);
