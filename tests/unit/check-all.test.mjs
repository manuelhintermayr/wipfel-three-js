// First unit test: the syntax gate itself must run and pass on the repository.
// Run: node --test tests/unit/
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("tools/check-all.mjs parses every JS file in the repo", () => {
  const res = spawnSync(process.execPath, [join(root, "tools", "check-all.mjs")], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /files parse OK/);
});
