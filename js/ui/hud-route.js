// Route layer of the HUD (mockup 1:1): route header top left, flow placeholder bottom centre,
// start banner with key figures + countdown discs, and the one-time safety tooltip. Pure DOM;
// driven by js/game/session.js. Category colours come from css tokens (--cat-*).
import { t, formatTime } from "../core/i18n.js";
import { CATEGORY_BY_ID } from "../config.js";

/** Which lock notice a gated category shows on the start banner (GDD §3.12: Blue → Red → Black). */
const LOCK_NOTICE_KEY = Object.freeze({ red: "notice.lockedRed", black: "notice.lockedBlack" });

/**
 * @param {HTMLElement} root the `#hud` container (shared with createHud's layer)
 * @returns {{ setRoute(run|null): void, refresh(run): void, showBanner(def, best, locked?): void,
 *   hideBanner(): void, setCountdown(step|null): void, showSafetyTip(seconds?): void,
 *   dispose(): void }}
 */
export function createRouteHud(root) {
  const header = el("div", "hud-route");
  header.hidden = true;
  const bar = el("span", "bar");
  const body = el("div", "body");
  const cat = el("div", "cat");
  const name = el("div", "name");
  const stats = el("div", "stats");
  const progressRow = el("div", "row");
  const timeRow = el("div", "row");
  const bestRow = el("div", "row");
  stats.append(progressRow, timeRow, bestRow);
  body.append(cat, name, stats);
  header.append(bar, body);

  const flow = el("div", "hud-flow");
  flow.hidden = true;
  const flowValue = el("div", "value", "x1,0");
  const flowTrack = el("div", "track");
  const flowFill = el("div", "fill");
  flowTrack.appendChild(flowFill);
  flow.append(el("div", "label", t("hud.flow")), flowValue, flowTrack);

  const banner = el("div", "start-banner");
  banner.hidden = true;

  const countdown = el("div", "countdown");
  countdown.hidden = true;
  const discs = [3, 2, 1].map((n) => el("div", "disc", String(n)));
  const goDisc = el("div", "disc go", "GO");
  countdown.append(...discs, goDisc);

  const tip = el("div", "hud-tip");
  tip.hidden = true;

  root.append(header, flow, banner, countdown, tip);

  let shown = { progress: -1, time: "", best: "", step: undefined };
  let tipUntil = 0;

  return {
    /** Bind the header to a run (or hide it with null). */
    setRoute(run) {
      if (!run) { header.hidden = true; flow.hidden = true; return; }
      const category = CATEGORY_BY_ID[run.def.category];
      header.style.setProperty("--cat-color", category ? category.css : "var(--cat-blue)");
      cat.textContent = t(`cat.${run.def.category}`);
      name.textContent = `${category ? category.symbol : ""} ${run.def.numeral} · ${t(run.def.nameKey)}`.trim();
      header.hidden = false;
      flow.hidden = false;
      shown = { progress: -1, time: "", best: "", step: undefined };
    },

    /** Per-frame refresh of progress / time / best (cheap string diffing). */
    refresh(run, best) {
      if (header.hidden || !run) return;
      if (run.progress !== shown.progress) {
        shown.progress = run.progress;
        progressRow.textContent = `${run.progress} / ${run.total}`;
      }
      const time = run.state === "running" || run.state === "done" ? formatTime(run.elapsed) : "–:––";
      if (time !== shown.time) { shown.time = time; timeRow.textContent = time; }
      const bestText = `${t("hud.best")}: ${best != null ? formatTime(best) : "–:––"}`;
      if (bestText !== shown.best) { shown.best = bestText; bestRow.textContent = bestText; }
      // Flow is placeholder until M2 (ROADMAP): a quiet x1,0 while the run is live.
      flow.hidden = !(run.state === "running");
    },

    /** `locked`: the mockup's start banner, but with a lock line instead of stats/best/START. */
    showBanner(def, best, locked = false) {
      const category = CATEGORY_BY_ID[def.category];
      banner.style.setProperty("--cat-color", category ? category.css : "var(--cat-blue)");
      const head = [el("div", "cat", t(`cat.${def.category}`).toUpperCase()), el("div", "name", t(def.nameKey))];
      if (locked) {
        banner.replaceChildren(...head, el("div", "locked", t(LOCK_NOTICE_KEY[def.category] || "notice.lockedRed")));
      } else {
        banner.replaceChildren(
          ...head,
          facts(def),
          (() => { const b = el("div", "best"); b.appendChild(bestBlock(best)); return b; })(),
          el("div", "go", t("hud.start")),
        );
      }
      banner.hidden = false;
    },
    hideBanner() { banner.hidden = true; },

    /** 3 / 2 / 1 highlight, 0 = GO, null hides. */
    setCountdown(step) {
      if (step === shown.step) return;
      shown.step = step;
      if (step == null) { countdown.hidden = true; return; }
      countdown.hidden = false;
      discs.forEach((d, i) => { d.className = `disc${3 - i === step ? " active" : ""}`; });
      goDisc.className = `disc go${step === 0 ? "" : " idle"}`;
      goDisc.style.opacity = step === 0 ? "1" : "0.35";
    },

    showSafetyTip(seconds = 6) {
      tip.replaceChildren(
        (() => { const box = el("div", "text-wrap");
          box.append(el("div", "title", t("tip.safetyTitle")), el("div", "text", t("tip.safetyText")));
          return box; })(),
        el("div", "check", "✓"),
      );
      tip.hidden = false;
      tipUntil = performance.now() + seconds * 1000;
    },

    update() {
      if (!tip.hidden && performance.now() > tipUntil) tip.hidden = true;
    },

    dispose() { for (const node of [header, flow, banner, countdown, tip]) node.remove(); },
  };

  function facts(def) {
    const row = el("div", "facts");
    for (const [value, labelKey] of [
      [String(def.obstacles.length), "hud.obstacles"],
      [`${def.heightM} m`, "hud.height"],
      [`${def.lengthM} m`, "hud.length"],
    ]) {
      const cell = el("div", "fact");
      cell.append(el("b", "", value), el("span", "", t(labelKey).toUpperCase()));
      row.appendChild(cell);
    }
    return row;
  }

  function bestBlock(best) {
    const wrap = el("span", "");
    wrap.append(el("span", "", t("hud.bestTime").toUpperCase()), el("b", "", best != null ? formatTime(best) : "–:––"));
    return wrap;
  }
}

function el(tag, className, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
