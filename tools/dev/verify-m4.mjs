// One-shot M4 verification against system Chrome (headless): (a) plain ?debug=1 boot, (b) ?autoplay=1&
// fast=1 still completes blue-1 with co-op untouched, (c) a co-op smoke test with no real gamepad
// (WIPFEL.debug.enableCoopForTest()) – two rigs, a screenshot, shrunk under 300 KB via PIL.
//
// Uses a fully manual clock throughout rather than the natural requestAnimationFrame + waitForTimeout
// pattern (see tools/dev/verify-m3b.mjs): this session's headless tab delivered a first rAF timestamp in
// stark disagreement with `performance.now()` at `loop.start()`, driving `loop.accumulator` to roughly
// -20 to -36 and keeping it there for tens of seconds (js/core/loop.js's accumulator only claws that back
// at +1/60 s per frame) – physics never took a single step, so the player stayed in "air" forever. This
// reproduces in plain solo play too (confirmed live), so it is an environment/headless-compositor quirk,
// not an M4 regression – js/core/loop.js is untouched by this milestone. HANDOVER.md's own "Achtung
// headless" note already prescribes the fix: stop the loop, neutralise real rAF, and pump fixed 60 Hz
// steps by hand – `pumpTicks()` below does exactly that, so every check here is driven by a fully
// deterministic, self-paced clock instead of hoping the compositor cooperates.
//
// `setReducedMotion(true)` before the co-op screenshot works around a second, related observation: the
// same abnormal clock history left js/player/camera.js's shake/breathing offset large enough to roll the
// rendered view ~90° (confirmed live: identical player/camera *state* – position, pitch, yaw, distance –
// with and without it, only the visible roll changes) – reduced motion zeroes exactly that cosmetic
// term and does not affect anything this script asserts on. Not a code fix (js/player/camera.js is
// untouched); a verification-harness-only accommodation for a self-inflicted clock artefact.
//
// Run from C:\repos\game-remakes\wipfel:  node tools/dev/verify-m4.mjs
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://127.0.0.1:8200";
const RAW_SHOT = "C:/repos/game-remakes/wipfel/docs/screenshots/m4-coop-raw.png";
const FINAL_SHOT = "C:/repos/game-remakes/wipfel/docs/screenshots/m4-coop.png";

async function freshPage(browser, path) {
  const errors = [], external = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (m) => { const t = m.type(); if (t === "error" || t === "warning") errors.push(`${t}: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on("request", (r) => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith("data:") && !u.startsWith("blob:")) external.push(u); });
  await page.goto(`${BASE}${path}&x=${Date.now()}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.WIPFEL && window.WIPFEL.ready, null, { timeout: 60000 });
  await page.bringToFront();
  return { page, errors, external };
}

/** Freeze the natural loop and pump exactly `n` fixed 60 Hz steps by hand; leaves it stopped (no real
 *  rAF re-armed) so every check stays on this same self-paced clock until explicitly resumed. */
async function pumpTicks(page, n) {
  return page.evaluate((count) => {
    const W = window.WIPFEL;
    W.loop.stop();
    W.loop.accumulator = 0;
    W.loop.running = true;
    let t = performance.now();
    for (let i = 0; i < count; i++) { t += 1000 / 60; W.loop._tick(t); }
    W.loop.running = false;
  }, n);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [] });
const results = {};

// --- (a) plain ?debug=1 boot: 0 console errors/warnings, 0 external requests -----------------------
console.error("(a) booting…");
{
  const { page, errors, external } = await freshPage(browser, "/?debug=1");
  console.error("(a) page ready, pumping ticks…");
  await pumpTicks(page, 150);   // 2.5 simulated seconds
  results.boot = { errors: errors.slice(0, 6), externalCount: external.length };
  await page.close();
}
console.error("(a) done:", JSON.stringify(results.boot));

// --- (b) ?autoplay=1&fast=1: co-op OFF path untouched, blue-1 still completes ------------------------
console.error("(b) booting autoplay…");
{
  // `?seed=1` (the same seed already used to confirm blue-2/red-2's forced co-op edges earlier in this
  // milestone) pins the park layout. A real, pre-existing bug in the bot itself was found and fixed
  // while verifying this section (unrelated to M4, autoplay.js belongs to M1/M1.3): several runs stalled
  // for minutes at the exact same position once the bot happened to fall, because its old fall-recovery
  // only held Space ("pull up") – which js/player/fall.js only allows close enough under the element
  // (`underElement()`) – with no fallback, so a fall settling further along the span had no way out at
  // all. Fixed by also holding W (`js/game/autoplay.js`'s `act()`, "fall" branch), which hauls the
  // carabiner to a platform instead (fall.js's other, always-available exit) whenever pull-up isn't – one
  // of the two now always resolves. Confirmed live post-fix on this exact seed: "route completed in
  // 309.00 s · falls 0 · best true", zero console/page errors.
  const { page, errors, external } = await freshPage(browser, "/?autoplay=1&fast=1&debug=1&seed=1");
  console.error("(b) page ready, pumping batches…");
  let bot = null;
  const BATCH = 300;          // 5 simulated seconds/batch (fast=1 → timeScale 4 → 20 game-seconds/batch)
  for (let batch = 0; batch < 90 && bot !== "done" && bot !== "failed"; batch++) {   // up to ~1800 game-s
    await pumpTicks(page, BATCH);
    const progress = await page.evaluate(() => {
      const r = window.WIPFEL.session.run;
      return { bot: window.WIPFEL.autoplay.state, progress: r ? `${r.progress}/${r.total}` : null };
    });
    bot = progress.bot;
    console.error(`(b) batch ${batch + 1}: bot=${bot} progress=${progress.progress}`);
  }
  const final = await page.evaluate(() => {
    const W = window.WIPFEL;
    return {
      bot: W.autoplay.state,
      run: W.session.run ? { state: W.session.run.state, progress: `${W.session.run.progress}/${W.session.run.total}`, falls: W.session.run.falls } : null,
      coopActive: W.coop.active,   // must stay false – nothing in the co-op-off path may enable it
    };
  });
  results.autoplay = { final, errors: errors.slice(0, 6), externalCount: external.length };
  await page.close();
}
console.error("(b) done:", JSON.stringify(results.autoplay.final));

// --- (c) co-op smoke, no real gamepad --------------------------------------------------------------
console.error("(c) booting co-op smoke…");
{
  const { page, errors, external } = await freshPage(browser, "/?debug=1&briefing=0");
  console.error("(c) page ready…");
  await page.evaluate(() => window.WIPFEL.player.camera.setReducedMotion(true));   // see header
  await pumpTicks(page, 120);
  await page.evaluate(() => window.WIPFEL.kassa.confirmDefaults());   // close the ticket desk so the 3-D view is visible
  await pumpTicks(page, 60);

  const enabled = await page.evaluate(() => window.WIPFEL.debug.enableCoopForTest());
  await pumpTicks(page, 30);
  const afterEnable = await page.evaluate(() => {
    const W = window.WIPFEL;
    const rigCount = W.scene.children.filter((o) => o.name === "player-rig").length;
    return { enabled: true, active: W.coop.active, hasPlayer2: !!W.coop.player2, rigCount };
  });

  // Both players land at blue-1's SECOND element's entry stand (elements[1], "planks-1") – not the
  // entry deck's clip anchor (that is within js/game/session.js's SESSION.bannerRange of 6 m, so the
  // big route-start banner would cover the whole screen alongside the prompt) and not elements[0]
  // either (measured 3.0 m from the deck – still inside that same 6 m banner range; elements[1] measured
  // 15.0 m away, safely clear of it). Gives both rigs a real "[F] Clip in" prompt each with nothing else
  // fighting the HUD for screen space.
  await page.evaluate(() => {
    const W = window.WIPFEL;
    const entry = W.course.elements[1].getEntryAnchor();
    const stand = entry.stand || entry.position;
    W.player.teleport(stand.x + 0.4, stand.y, stand.z);
    W.coop.player2.teleport(stand.x - 0.4, stand.y, stand.z);
  });
  await pumpTicks(page, 60);

  const afterTeleport = await page.evaluate(() => {
    const W = window.WIPFEL;
    const p1 = W.player.position, p2 = W.coop.player2.position;
    const box = document.querySelector(".p2-prompt");
    return {
      separation: Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z),
      p1Mode: W.player.mode, p2Mode: W.coop.player2.mode, p1Grounded: W.player.grounded, p2Grounded: W.coop.player2.grounded,
      p1Prompt: W.interaction.prompt || null,
      p2BoxExists: !!box, p2BoxHidden: box ? box.hidden : null, p2BoxText: box ? box.textContent : null,
    };
  });
  await page.screenshot({ path: RAW_SHOT });
  results.coop = { enabled, afterEnable, afterTeleport, errors: errors.slice(0, 6), externalCount: external.length };
  await page.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();

// --- shrink the screenshot under 300 KB (PIL: long edge + colour palette, both stepped down until the
// saved file actually fits – a busier framing than last tried can otherwise land over the cap even at
// the previous fixed 900 px/160-colour settings, so verify rather than assume) --------------------------
const pil = `
import os
from PIL import Image
CAP = 300 * 1024
src = Image.open(r"${RAW_SHOT}").convert("RGB")
for long_edge, colors in [(900, 160), (900, 96), (700, 96), (700, 64), (520, 48)]:
    w, h = src.size
    scale = min(1.0, long_edge / max(w, h))
    img = src.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    img = img.quantize(colors=colors, method=Image.MEDIANCUT).convert("RGB")
    img.save(r"${FINAL_SHOT}", optimize=True)
    size = os.path.getsize(r"${FINAL_SHOT}")
    print(f"tried {long_edge}px/{colors}c -> {size} bytes")
    if size <= CAP:
        print("saved", img.size, size, "bytes")
        break
else:
    print("WARNING: still over cap at smallest setting –", size, "bytes")
`;
execFileSync("python", ["-c", pil], { stdio: "inherit" });
