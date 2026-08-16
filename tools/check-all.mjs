#!/usr/bin/env node
// Runs `node --check` on every .js/.mjs file under js/, tools/ and tests/.
// Cheap syntax gate that also catches truncated files (a known editor pitfall on this mount).
// Usage: node tools/check-all.mjs

import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dirs = ["js", "tools", "tests"];
const files = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "out") continue;
      walk(full);
    } else if ([".js", ".mjs"].includes(extname(entry))) {
      files.push(full);
    }
  }
}

for (const d of dirs) walk(join(root, d));

let failed = 0;
for (const file of files) {
  const res = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (res.status !== 0) {
    failed++;
    console.error(`FAIL ${file}\n${res.stderr}`);
  }
}
console.log(`${files.length - failed}/${files.length} files parse OK`);
process.exit(failed ? 1 : 0);
