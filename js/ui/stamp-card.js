// End-of-day stamp card (GDD §3.7/§5, ROADMAP M1.5): one stamp per completed route (category colour,
// numeral, name, time, falls), unlock progress, and the day's totals. Shown only at ticket end or
// right after finishing a route with no ticket time left (js/game/session.js decides when). Pure DOM;
// `save` is read-only here (unlock progress), never written.
//
// M2a: each stamp grows a mastery-pip row and, for a time trial, a "TRIAL" tag plus its own flow
// score (GDD §3.12/§3.10) – js/game/session.js already folds `mastery`/`isTrial`/`flowScore` into
// every `day.routes` entry, so this module only has to render whatever is there.
import { t, formatTime } from "../core/i18n.js";
import { CATEGORY_BY_ID, MASTERY } from "../config.js";

/**
 * @param {{ root: HTMLElement, save, onNewDay: () => void, onContinue: () => void }} options
 * @returns {{ visible: boolean, show(summary): void, hide(): void, dispose(): void }}
 *   `summary` = { routes: [{category,numeral,nameKey,seconds,falls,isTrial?,mastery?,flowScore?}],
 *   obstaclesTotal, maxZipKmh, rescues }
 */
export function createStampCard({ root, save, onNewDay, onContinue }) {
  const screen = el("div", "screen stamp-screen");
  screen.hidden = true;
  const sheet = el("div", "panel stamp-sheet");
  sheet.appendChild(el("h1", "", t("stamp.title")));
  const stampsRow = el("div", "stamp-row");
  const factsRow = el("div", "stamp-facts");
  const unlockRow = el("div", "stamp-unlocks");
  sheet.append(stampsRow, factsRow, unlockRow);

  const actions = el("div", "stamp-actions");
  const newDayBtn = el("button", "btn", t("stamp.newDay"));
  const continueBtn = el("button", "btn", t("stamp.continue"));
  newDayBtn.type = "button";
  continueBtn.type = "button";
  newDayBtn.addEventListener("click", () => { screen.hidden = true; onNewDay(); });
  continueBtn.addEventListener("click", () => { screen.hidden = true; onContinue(); });
  actions.append(newDayBtn, continueBtn);
  sheet.appendChild(actions);

  screen.appendChild(sheet);
  root.appendChild(screen);

  function render(summary) {
    stampsRow.replaceChildren();
    for (const route of summary.routes) {
      const category = CATEGORY_BY_ID[route.category];
      const stamp = el("div", "stamp");
      stamp.style.setProperty("--cat-color", category ? category.css : "var(--cat-blue)");
      // Colour is never the only cue (GDD §5) – the category symbol rides along with the numeral.
      const numeralText = `${category ? category.symbol : ""} ${route.numeral}`.trim();
      stamp.append(
        el("div", "numeral", route.isTrial ? `${numeralText} · ${t("stamp.trialTag")}` : numeralText),
        el("div", "name", t(route.nameKey)),
        el("div", "time", formatTime(route.seconds)),
        el("div", "falls", t("stamp.falls", { falls: route.falls })),
      );
      if (route.mastery) stamp.appendChild(masteryPips(route.mastery));
      if (Number.isFinite(route.flowScore)) stamp.appendChild(el("div", "flow-score", t("stamp.flowScore", { score: route.flowScore })));
      // M4 (ROADMAP "Koop 2 lokal", GDD §3.11 "companion rule flavour"): js/game/coop.js tags the day's
      // most recent matching entry once *both* climbers reach the route's own finish – a best-effort
      // badge (see that module's header for why it does not gate the run's own completion), absent for
      // every solo route and every session before this milestone.
      if (route.companion) stamp.appendChild(el("div", "companion-tag", t("stamp.companion")));
      stampsRow.appendChild(stamp);
    }
    if (!summary.routes.length) stampsRow.appendChild(el("div", "stamp-empty", t("stamp.none")));

    factsRow.replaceChildren(
      fact(String(summary.obstaclesTotal), "stamp.obstacles"),
      fact(`${summary.maxZipKmh.toFixed(0)} km/h`, "stamp.maxSpeed"),
      fact(String(summary.rescues), "stamp.rescues"),
    );

    unlockRow.replaceChildren(unlockChip("red", save.isUnlocked("red")), unlockChip("black", save.isUnlocked("black")));
  }

  return {
    get visible() { return !screen.hidden; },
    show(summary) { render(summary); screen.hidden = false; },
    hide() { screen.hidden = true; },
    dispose() { screen.remove(); },
  };
}

function fact(value, labelKey) {
  const cell = el("div", "stamp-fact");
  cell.append(el("b", "", value), el("span", "", t(labelKey).toUpperCase()));
  return cell;
}

/** Four tier pips (● earned / ○ not yet) – same rendering as js/ui/hud-route.js's start banner. */
function masteryPips(tiers) {
  const row = el("div", "mastery-pips");
  MASTERY.tierOrder.forEach((tier, i) => {
    const pip = el("span", `pip${tiers[i] ? " earned" : ""}`, tiers[i] ? "●" : "○");
    pip.title = t(`mastery.${tier}`);
    row.appendChild(pip);
  });
  return row;
}

function unlockChip(category, unlocked) {
  const chip = el("div", `stamp-unlock ${unlocked ? "unlocked" : "locked"}`);
  chip.textContent = `${t(`cat.${category}`)} ${unlocked ? "✓" : "–"}`;
  return chip;
}

function el(tag, className, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
