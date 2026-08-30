// Route layer of the HUD (mockup 1:1): route header top left, flow bar bottom centre, start banner
// with key figures + countdown discs, and the one-time safety tooltip. Pure DOM; driven by
// js/game/session.js. Category colours come from css tokens (--cat-*).
//
// M2a: the flow bar goes from a static "x1,0" placeholder to a live value + fill (js/game/flow.js),
// hidden until `save.hasCompletedAnyRoute()` – GDD §3.10 only promises it "after the first clean
// crossing", and the simplest honest reading of that is "once you have ever finished a route, ever"
// rather than tracking a separate in-run "was this crossing clean" flag just for a visibility gate.
// The start banner also grows a mastery-pip row (GDD §3.12) and, once a route has a best time, a
// `[G]` time-trial hint instead of START; the header shows a small "TIME TRIAL" tag while `run.isTrial`.
import { t, formatTime } from "../core/i18n.js";
import { CATEGORY_BY_ID, FLOW, MASTERY, TRIALS } from "../config.js";

/** Which lock notice a gated category shows on the start banner (GDD §3.12: Blue → Red → Black → the
 *  legendary finale, which needs every black route done rather than "any route of the previous colour"). */
const LOCK_NOTICE_KEY = Object.freeze({ red: "notice.lockedRed", black: "notice.lockedBlack", legendary: "notice.lockedLegendary" });
const TRIAL_KEY_LABEL = "G";   // core/input.js: TRIALS.inputAction is bound to KeyG

/**
 * @param {HTMLElement} root the `#hud` container (shared with createHud's layer)
 * @returns {{ setRoute(run|null): void, refresh(run): void, setFlow(value, unlocked): void,
 *   showBanner(def, best, locked?, extra?: {canTrial?, mastery?}): void,
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
  const nameText = el("span", "");
  const trialTag = el("span", "trial-tag", t("hud.trialTag"));
  trialTag.hidden = true;
  name.append(nameText, trialTag);
  const stats = el("div", "stats");
  const progressRow = el("div", "row");
  const timeRow = el("div", "row time");   // M2a: a distinct class so a trial run can style just this row
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

  const ticketBox = el("div", "hud-ticket");
  ticketBox.hidden = true;

  root.append(header, flow, banner, countdown, tip, ticketBox);

  let shown = { progress: -1, time: "", best: "", step: undefined };
  let tipUntil = 0;
  let shownTicketMinutes;
  let flowUnlocked = false;    // save.hasCompletedAnyRoute() – "ever", not per-run
  let runningNow = false;

  /** `${symbol} ${numeral} · ${name}` – the legendary route has no numeral, so drop the extra dot/space. */
  const routeLabel = (def, category) => {
    const bits = [category ? category.symbol : ""];
    if (def.numeral) bits.push(def.numeral);
    return `${bits.join(" ")}${def.numeral ? " · " : " "}${t(def.nameKey)}`.trim();
  };

  return {
    /** Bind the header to a run (or hide it with null). */
    setRoute(run) {
      if (!run) { header.hidden = true; flow.hidden = true; return; }
      const category = CATEGORY_BY_ID[run.def.category];
      header.style.setProperty("--cat-color", category ? category.css : "var(--cat-blue)");
      cat.textContent = t(`cat.${run.def.category}`);
      nameText.textContent = routeLabel(run.def, category);
      header.hidden = false;
      flow.hidden = true;   // setFlow()/refresh() below decide real visibility on the next tick
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
      trialTag.hidden = !run.isTrial;
      header.classList.toggle("trial", !!run.isTrial);
      runningNow = run.state === "running";
      flow.hidden = !(runningNow && flowUnlocked);
    },

    /**
     * M2a: the live flow multiplier + fill bar. `unlocked` is `save.hasCompletedAnyRoute()` – shown
     * from the moment any route has ever been completed once (documented simplification of GDD §3.10's
     * "counts after the first clean crossing": tracking a separate in-run "was this one clean" flag
     * just to gate visibility once, ever, was not worth the extra state).
     */
    setFlow(value, unlocked) {
      flowUnlocked = unlocked;
      flow.hidden = !(runningNow && flowUnlocked);
      const clamped = Math.max(FLOW.min, Math.min(FLOW.max, value));
      flowValue.textContent = `x${clamped.toFixed(1).replace(".", ",")}`;
      flowFill.style.width = `${((clamped - FLOW.min) / (FLOW.max - FLOW.min)) * 100}%`;
    },

    /**
     * `locked`: the mockup's start banner, but with a lock line instead of stats/best/START.
     * `extra.canTrial` (M2a) swaps the START line for a `[G]` time-trial hint once the route already
     * has a best time; `extra.mastery` (four booleans, `MASTERY.tierOrder` order) draws the pip row.
     */
    showBanner(def, best, locked = false, extra = {}) {
      const category = CATEGORY_BY_ID[def.category];
      banner.style.setProperty("--cat-color", category ? category.css : "var(--cat-blue)");
      // Colour is never the only cue (GDD §5) – the category symbol goes wherever the colour does.
      const catLabel = `${category ? category.symbol : ""} ${t(`cat.${def.category}`).toUpperCase()}`.trim();
      const head = [el("div", "cat", catLabel), el("div", "name", t(def.nameKey))];
      if (locked) {
        banner.replaceChildren(...head, el("div", "locked", t(LOCK_NOTICE_KEY[def.category] || "notice.lockedRed")));
      } else {
        const children = [
          ...head,
          facts(def),
          (() => { const b = el("div", "best"); b.appendChild(bestBlock(best)); return b; })(),
        ];
        if (extra.mastery) children.push(masteryPips(extra.mastery));
        children.push(el("div", "go", extra.canTrial ? t("hud.trialHint", { key: TRIAL_KEY_LABEL }) : t("hud.start")));
        banner.replaceChildren(...children);
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

    /** Remaining ticket time in game minutes (M1.5), or `null` to hide the box (no active ticket). */
    setTicket(remainingGameMinutes) {
      if (remainingGameMinutes == null) {
        if (shownTicketMinutes !== null) { ticketBox.hidden = true; shownTicketMinutes = null; }
        return;
      }
      const rounded = Math.max(0, Math.ceil(remainingGameMinutes));
      if (rounded === shownTicketMinutes) return;
      shownTicketMinutes = rounded;
      const h = Math.floor(rounded / 60), m = rounded % 60;
      ticketBox.textContent = `${t("hud.ticket")} ${h}h ${String(m).padStart(2, "0")}`;
      ticketBox.hidden = false;
    },

    dispose() { for (const node of [header, flow, banner, countdown, tip, ticketBox]) node.remove(); },
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

  /** Four tier pips (● earned / ○ not yet), GDD §3.12: completed · no falls · under par · in flow. */
  function masteryPips(tiers) {
    const row = el("div", "mastery-pips");
    MASTERY.tierOrder.forEach((tier, i) => {
      const pip = el("span", `pip${tiers[i] ? " earned" : ""}`, tiers[i] ? "●" : "○");
      pip.title = t(`mastery.${tier}`);
      row.appendChild(pip);
    });
    return row;
  }
}

function el(tag, className, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
