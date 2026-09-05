// Operator dashboard top bar (ROADMAP M3b, GDD §5 "Builder: Kopfzeile (Saison/Datum/Uhr, Wetter+Böen,
// Gäste/Warten Ø, Kasse, Bewertung)"). Pure DOM, stateless like js/builder/builder-ui.js – every
// render() call redraws from whatever js/builder/builder.js hands it (js/game/operations.js +
// js/game/economy.js + js/npc/agents.js's own running averages); this module never reads those directly.
import { t } from "../core/i18n.js";

const CELLS = Object.freeze([
  ["day", "operator.day"], ["weather", "operator.weather"], ["guests", "operator.guests"],
  ["wait", "operator.wait"], ["rating", "operator.rating"], ["cash", "operator.cash"],
]);

/**
 * @param {{ root: HTMLElement }} options
 * @returns {{ setVisible(on: boolean): void, render(view: object): void, dispose(): void }}
 *   `view` = { season, dayInSeason, forecast, guestsToday, averageWaitSeconds, rating, cash, ppeWear,
 *   ppeInspectionDue, ppeCost, stormWarningLine, onInspectPpe }
 */
export function createOperatorPanel({ root }) {
  const bar = document.createElement("div");
  bar.className = "operator-panel";
  bar.hidden = true;

  const cells = {};
  for (const [key, labelKey] of CELLS) {
    const wrap = document.createElement("div");
    wrap.className = "operator-cell";
    const value = document.createElement("b");
    const label = document.createElement("span");
    label.textContent = t(labelKey);
    wrap.append(value, label);
    bar.appendChild(wrap);
    cells[key] = value;
  }

  const ppeButton = document.createElement("button");
  ppeButton.type = "button";
  ppeButton.className = "btn operator-ppe-btn";
  ppeButton.hidden = true;
  bar.appendChild(ppeButton);
  let onInspect = null;
  ppeButton.addEventListener("click", () => { if (onInspect) onInspect(); });

  const stormLine = document.createElement("div");
  stormLine.className = "operator-storm-line";
  stormLine.hidden = true;
  bar.appendChild(stormLine);

  root.appendChild(bar);

  return {
    setVisible(on) { bar.hidden = !on; },

    render(view) {
      cells.day.textContent = t("operator.dayValue", { season: view.season, day: view.dayInSeason });
      cells.weather.textContent = t(`operator.forecast.${view.forecast}`);
      cells.guests.textContent = String(Math.round(view.guestsToday));
      cells.wait.textContent = view.averageWaitSeconds > 0.05 ? t("operator.waitSeconds", { s: view.averageWaitSeconds.toFixed(0) }) : "–";
      cells.rating.textContent = view.rating.toFixed(1);
      cells.cash.textContent = formatCash(view.cash);

      onInspect = view.onInspectPpe || null;
      ppeButton.hidden = !view.ppeInspectionDue;
      ppeButton.textContent = t("operator.inspectPpe", { pct: Math.round(view.ppeWear * 100), cost: formatCash(view.ppeCost) });

      stormLine.hidden = !view.stormWarningLine;
      if (view.stormWarningLine) stormLine.textContent = view.stormWarningLine;
    },

    dispose() { bar.remove(); },
  };
}

/** Thin-space-grouped digits (locale-neutral, unlike a comma/period which reads as a decimal in some
 *  locales) with the currency symbol from i18n – RESEARCH-DATA's own comparison parks quote € prices. */
function formatCash(value) {
  const sign = value < 0 ? "-" : "";
  const grouped = String(Math.round(Math.abs(value))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${t("operator.currency")}${grouped}`;
}
