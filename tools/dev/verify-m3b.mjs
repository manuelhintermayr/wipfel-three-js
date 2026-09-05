// One-shot M3b verification against system Chrome (headless): autoplay run + storm screenshot.
// Run from C:\repos\game-remakes\wipfel:  node <scratchpad>\verify-m3b.mjs
import { chromium } from "playwright-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://127.0.0.1:8200";
const errors = [], external = [];

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => { const t = m.type(); if (t === "error" || t === "warning") errors.push(t + ": " + m.text().slice(0, 140)); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 140)));
page.on("request", (r) => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith("data:") && !u.startsWith("blob:")) external.push(u); });

await page.goto(`${BASE}/?autoplay=1&fast=1&debug=1&x=${Date.now()}`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => window.WIPFEL && window.WIPFEL.ready, null, { timeout: 120000 });
await page.bringToFront();

const started = Date.now();
let bot = null;
while (Date.now() - started < 420000) {
  await page.waitForTimeout(5000);
  bot = await page.evaluate(() => window.WIPFEL.autoplay.state);
  if (bot === "done" || bot === "failed") break;
}
const final = await page.evaluate(() => {
  const W = window.WIPFEL;
  return { bot: W.autoplay.state, run: W.session.run ? { state: W.session.run.state, progress: `${W.session.run.progress}/${W.session.run.total}`, falls: W.session.run.falls } : null,
           calls: W.renderer.info.render.calls, tris: W.renderer.info.render.triangles };
});

let storm = "n/a";
try { storm = await page.evaluate(() => { window.WIPFEL.debug.forceStorm(); return "forced"; }); } catch (e) { storm = "failed: " + e.message.slice(0, 110); }
await page.waitForTimeout(4000);
let shot = "failed";
try { await page.screenshot({ path: "C:/repos/game-remakes/wipfel/docs/screenshots/m3-storm.png", timeout: 10000 }); shot = "ok"; } catch {}

console.log(JSON.stringify({ final, storm, shot, errors: errors.slice(0, 6), externalCount: external.length }, null, 2));
await browser.close();
