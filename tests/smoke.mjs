#!/usr/bin/env node
// Headless smoke test: starts serve.py, loads the game with ?autoplay=1&debug=1,
// counts console errors and non-local network requests, saves a screenshot to tests/out/.
// Requires playwright-core (dev-only, optional): `npm i -D playwright-core` in this folder
// plus a Chromium available to Playwright. If playwright-core is missing the test is SKIPPED
// (exit code 0) so the game itself never depends on Node.
// Usage: node tests/smoke.mjs [--port 8200] [--seconds 20]

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1]) || 8200;
const seconds = Number(args[args.indexOf("--seconds") + 1]) || 20;

let playwright;
try {
  playwright = await import("playwright-core");
} catch {
  console.log("SKIP: playwright-core not installed (npm i -D playwright-core). Game does not need it.");
  process.exit(0);
}

const server = spawn("python", ["serve.py", "--port", String(port)], { cwd: root, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));

const errors = [];
const external = [];
let browser;
try {
  browser = await playwright.chromium.launch({
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") errors.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("request", (req) => {
    const url = req.url();
    if (!url.startsWith(`http://127.0.0.1:${port}/`) && !url.startsWith("data:") && !url.startsWith("blob:")) {
      external.push(url);
    }
  });

  await page.goto(`http://127.0.0.1:${port}/?autoplay=1&debug=1&seed=1`, { waitUntil: "load" });
  await page.waitForTimeout(seconds * 1000);

  mkdirSync(join(root, "tests", "out"), { recursive: true });
  await page.screenshot({ path: join(root, "tests", "out", "smoke.png") });
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(`console errors/warnings: ${errors.length}`);
for (const e of errors) console.log("  " + e);
console.log(`external requests: ${external.length}`);
for (const u of external) console.log("  " + u);
console.log("screenshot: tests/out/smoke.png");
process.exit(errors.length || external.length ? 1 : 0);
