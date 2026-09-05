// The right-hand inspector panel (M3a, GDD §4 "Parcours-Inspektor: Dramaturgiekurve, Achsen,
// Variation, Staurisiko, Retter-Abdeckung"): a read-only analysis of whichever route is selected, built
// from js/builder/builder-state.js's derived numbers (aggregateAxes/dramaturgyCurve/variationScore/
// jamRisk/estimate) plus its validation issues. Pure DOM – no draft mutation happens here, matching the
// GDD's own split between the inspector (read-out) and the toolbar (the editing actions).
import { t, formatTime } from "../core/i18n.js";
import { CATEGORY_BY_ID } from "../config.js";
import { mapColourOf, cssHex } from "../ui/map-render.js";
import { catalogueEntry } from "../elements/catalogue-data.js";

const AXES = Object.freeze(["physical", "coordination", "psychological", "technical"]);
const AXIS_MAX_PER_EDGE = 5;
const JAM_WARN_AT = 3;   // GDD "Staurisiko" – three or more discrete obstacles in a row starts to queue

/**
 * @param {{ root: HTMLElement }} options
 * @returns {{ element: HTMLElement, render(view: object|null, derived: object|null): void, dispose(): void }}
 */
export function createInspector({ root }) {
  const panel = el("div", "builder-inspector");
  root.appendChild(panel);

  function render(view, derived) {
    panel.replaceChildren();
    if (!view) { panel.appendChild(el("div", "builder-empty", t("builder.inspector.none"))); return; }
    const category = CATEGORY_BY_ID[view.category];

    const head = el("div", "builder-inspector-head");
    head.style.setProperty("--c", category ? cssHex(mapColourOf(category)) : "var(--cat-blue)");
    head.append(
      el("span", "builder-cat-symbol", category ? category.symbol : "?"),
      el("span", "builder-route-name", `${view.numeral ? `${view.numeral} · ` : ""}${t(view.nameKey)}`),
      statusChip(view.state),
    );
    panel.appendChild(head);

    panel.appendChild(axesSection(derived.axes, view.edges.length));
    panel.appendChild(dramaturgySection(derived.dramaturgy));
    panel.appendChild(factsSection(derived, view));
    panel.appendChild(issuesSection(view.issues));
  }

  return { element: panel, render, dispose() { panel.remove(); } };
}

function statusChip(state) {
  const chip = el("span", `builder-status builder-status-${state}`, t(`builder.status.${state}`));
  return chip;
}

function axesSection(axes, edgeCount) {
  const section = el("div", "builder-section");
  section.appendChild(el("h3", "", t("builder.inspector.axes")));
  const max = Math.max(1, edgeCount * AXIS_MAX_PER_EDGE);
  const bars = el("div", "builder-axes");
  for (const axis of AXES) {
    const row = el("div", "builder-axis-row");
    row.append(el("span", "builder-axis-label", t(`builder.axis.${axis}`)));
    const track = el("div", "builder-axis-track");
    const fill = el("div", "builder-axis-fill");
    fill.style.width = `${Math.min(100, (axes[axis] / max) * 100)}%`;
    track.appendChild(fill);
    row.append(track, el("span", "builder-axis-value", String(axes[axis])));
    bars.appendChild(row);
  }
  section.appendChild(bars);
  return section;
}

/** Per-edge bars (deck height + metric sum, category colour), a final bar in blue for the zip. */
function dramaturgySection(bars) {
  const section = el("div", "builder-section");
  section.appendChild(el("h3", "", t("builder.inspector.dramaturgy")));
  if (!bars.length) { section.appendChild(el("div", "builder-empty-small", t("builder.inspector.noObstacles"))); return section; }
  const maxHeight = Math.max(1, ...bars.map((b) => b.deckHeight));
  const chart = el("div", "builder-dramaturgy");
  for (const bar of bars) {
    const col = el("div", "builder-dram-col");
    const stick = el("div", bar.isZip ? "builder-dram-bar zip" : "builder-dram-bar");
    stick.style.height = `${Math.max(6, (bar.deckHeight / maxHeight) * 64)}px`;
    const entry = bar.isZip ? null : catalogueEntry(bar.kind);
    stick.title = bar.isZip
      ? `${t("element.zipline")} · ${bar.length.toFixed(0)} m · ${(bar.gradient * 100).toFixed(1)}%`
      : `${entry ? t(entry.labelKey) : bar.kind} · ${t("builder.inspector.metricSum")} ${bar.metricSum}`;
    col.appendChild(stick);
    chart.appendChild(col);
  }
  section.appendChild(chart);
  return section;
}

function factsSection(derived, view) {
  const section = el("div", "builder-section");
  const facts = el("div", "builder-facts");
  const variationPct = Math.round(derived.variation * 100);
  facts.append(
    fact(t("builder.inspector.variation"), `${variationPct}%`),
    fact(t("builder.inspector.jamRisk"), String(derived.jamRisk), derived.jamRisk >= JAM_WARN_AT ? "warn" : ""),
    fact(t("builder.inspector.parTime"), derived.estimate ? formatTime(derived.estimate.parS) : "–:––"),
    fact(t("builder.inspector.length"), derived.estimate ? `${derived.estimate.lengthM} m` : "– m"),
  );
  section.appendChild(facts);
  const note = el("div", "builder-rescuer-note", rescueNote(derived, view));
  if (derived.rescuePostCount && view.platforms.some((p) => derived.rescueCoverage.uncovered.has(p.id))) note.classList.add("warn");
  section.appendChild(note);
  return section;
}

/** GDD §4 "Retter-Abdeckung" – js/builder/builder-metrics.js#rescueCoverage's park-wide verdict,
 *  filtered down to this one route's own platforms. */
function rescueNote(derived, view) {
  if (!derived.rescuePostCount) return t("builder.inspector.rescueNoPosts");
  const covered = view.platforms.filter((p) => derived.rescueCoverage.covered.has(p.id)).length;
  return t("builder.inspector.rescueCoverage", { covered, total: view.platforms.length });
}

function fact(label, value, tone = "") {
  const cell = el("div", `builder-fact${tone ? ` ${tone}` : ""}`);
  cell.append(el("b", "", value), el("span", "", label));
  return cell;
}

function issuesSection(issues) {
  const section = el("div", "builder-section builder-issues-section");
  section.appendChild(el("h3", "", t("builder.inspector.issues")));
  if (!issues.length) { section.appendChild(el("div", "builder-empty-small ok", t("builder.inspector.noIssues"))); return section; }
  const list = el("div", "builder-issues");
  for (const issue of issues) list.appendChild(el("div", "builder-issue", t(`builder.issue.${issue.code}`, formatIssueVars(issue.data))));
  section.appendChild(list);
  return section;
}

/** Numeric issue data rounded to one decimal for a readable inline message ("9.4 m outside 6.0-13.5 m"). */
function formatIssueVars(data) {
  const out = {};
  for (const [key, value] of Object.entries(data)) out[key] = typeof value === "number" ? Number(value.toFixed(1)) : value;
  return out;
}

function el(tag, className, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
