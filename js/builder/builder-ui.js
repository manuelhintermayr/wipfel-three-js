// The builder's screen furniture (M3a, GDD §5 "Builder: Werkzeugleiste, Overlays, Inspektor, Kalender,
// Kasse" – Kalender/Kasse are M3b/economy, out of scope here): left = route list, right = the
// js/builder/builder-inspector.js read-out, bottom = the toolbar that opens one of four data-editing
// panels (js/builder/builder-tool-panels.js) or the Flying-Fox tool (js/builder/builder-zip-tool.js).
// Stateless by design – every render() call redraws from whatever (draft, selection) js/builder/
// builder.js hands it; every click only ever calls the one `dispatch(action)` callback, so this module
// never mutates the draft itself.
import { t } from "../core/i18n.js";
import { CATEGORIES, CATEGORY_BY_ID } from "../config.js";
import { mapColourOf, cssHex } from "../ui/map-render.js";
import { createInspector } from "./builder-inspector.js";
import { createZipTool } from "./builder-zip-tool.js";
import { treesPanel, platformsPanel, elementsPanel, categoryNamePanel } from "./builder-tool-panels.js";

const TOOLS = Object.freeze(["trees", "platforms", "elements", "zip", "categoryName"]);
/** Green is the Wichtel/practice-course colour (ROADMAP M2a) – never a builder-buildable route category. */
const BUILDABLE_CATEGORIES = CATEGORIES.filter((c) => c.id !== "green");

/**
 * @param {{ root: HTMLElement, dispatch: (action: object) => void }} options
 * @returns {{ setVisible(on: boolean): void, render(draft: object, selection: object): void,
 *   getZipTool(): ReturnType<typeof createZipTool>, showWalkBanner(text: string): void,
 *   hideWalkBanner(): void, dispose(): void }}
 */
export function createBuilderUi({ root, dispatch }) {
  const container = el("div", "builder-ui");
  root.appendChild(container);

  container.appendChild(el("div", "builder-hint", t("builder.hint")));
  const routeList = el("div", "builder-route-list");
  container.appendChild(routeList);

  const inspector = createInspector({ root: container });
  inspector.element.classList.add("builder-inspector-dock");

  const toolArea = el("div", "builder-tool-area");
  container.appendChild(toolArea);
  const zipTool = createZipTool({ root: container, t });
  zipTool.element.classList.add("builder-tool-area", "builder-zip-dock");

  const toolbar = el("div", "builder-toolbar");
  const toolButtons = new Map();
  for (const toolId of TOOLS) {
    const btn = el("button", "btn builder-tool-btn", t(`builder.toolbar.${toolId}`));
    btn.type = "button";
    btn.addEventListener("click", () => dispatch({ type: "setActiveTool", tool: toolId }));
    toolButtons.set(toolId, btn);
    toolbar.appendChild(btn);
  }
  const validateBtn = toolbarButton(t("builder.toolbar.validate"), () => dispatch({ type: "validate" }));
  const walkBtn = toolbarButton(t("builder.toolbar.walk"), () => dispatch({ type: "walk" }));
  walkBtn.classList.add("builder-walk-btn");
  const exitBtn = toolbarButton(t("builder.toolbar.exit"), () => dispatch({ type: "exit" }));
  toolbar.append(validateBtn, walkBtn, exitBtn);
  container.appendChild(toolbar);

  routeList.appendChild(el("h3", "", t("builder.routeList.title")));
  const routeRows = el("div", "builder-route-rows");
  routeList.appendChild(routeRows);

  const addRouteRow = el("div", "builder-add-route");
  addRouteRow.appendChild(el("span", "builder-form-label", t("builder.addRoute")));
  for (const category of BUILDABLE_CATEGORIES) {
    const pill = categoryPill(category, false, () => dispatch({ type: "addRoute", category: category.id }));
    addRouteRow.appendChild(pill);
  }
  routeList.appendChild(addRouteRow);
  const removeRouteBtn = toolbarButton(t("builder.removeRoute"), () => dispatch({ type: "removeRoute" }));
  const resetBtn = toolbarButton(t("builder.resetToGenerated"), () => { if (window.confirm(t("builder.resetConfirm"))) dispatch({ type: "resetToGenerated" }); });
  resetBtn.classList.add("warn");
  routeList.append(removeRouteBtn, resetBtn);

  const walkBanner = el("div", "builder-walk-banner");
  walkBanner.hidden = true;
  root.appendChild(walkBanner);

  function render(draft, selection) {
    routeRows.replaceChildren();
    for (const route of draft.routes) {
      const category = CATEGORY_BY_ID[route.category];
      const row = el("button", `builder-route-row${route.id === selection.routeId ? " selected" : ""}`);
      row.type = "button";
      row.style.setProperty("--c", category ? cssHex(mapColourOf(category)) : "var(--cat-blue)");
      row.append(
        el("span", "builder-cat-symbol", category ? category.symbol : "?"),
        el("span", "builder-route-row-name", `${route.numeral ? `${route.numeral} · ` : ""}${t(route.nameKey)}`),
        el("span", `builder-status builder-status-${route.state}`, t(`builder.status.${route.state}`)),
      );
      row.addEventListener("click", () => dispatch({ type: "selectRoute", id: route.id }));
      routeRows.appendChild(row);
    }
    const parkStatus = draft.parkStatus();
    routeList.classList.toggle("has-park-warning", !parkStatus.ok);
    let warning = routeList.querySelector(".builder-park-warning");
    if (!parkStatus.ok) {
      if (!warning) { warning = el("div", "builder-park-warning"); routeList.insertBefore(warning, addRouteRow); }
      warning.textContent = parkStatus.issues.map((i) => t(`builder.issue.${i.code}`, i.data)).join(" ");
    } else if (warning) warning.remove();

    const selected = selection.routeId ? draft.getRoute(selection.routeId) : null;
    const derived = selected ? {
      axes: draft.aggregateAxes(selected.id), dramaturgy: draft.dramaturgyCurve(selected.id),
      variation: draft.variationScore(selected.id), jamRisk: draft.jamRisk(selected.id), estimate: draft.estimate(selected.id),
    } : null;
    inspector.render(selected, derived);

    for (const [id, btn] of toolButtons) { btn.classList.toggle("active", selection.activeTool === id); btn.disabled = !selected; }
    walkBtn.disabled = !selected || !draft.canWalk(selected.id);
    validateBtn.disabled = !selected;
    removeRouteBtn.disabled = !selected;

    const activeIsZip = selection.activeTool === "zip";
    toolArea.hidden = !selected || !selection.activeTool || activeIsZip;
    if (!toolArea.hidden) toolArea.replaceChildren(buildToolPanel(selection.activeTool, draft, selected.id, selection));
    if (!selected || !activeIsZip) zipTool.hide();
  }

  function buildToolPanel(tool, draft, routeId, selection) {
    if (tool === "trees") {
      const mode = selection.treesMode || { mode: "add", targetPlatformId: null };
      return treesPanel({ draft, routeId, mode: mode.mode, targetPlatformId: mode.targetPlatformId, dispatch });
    }
    if (tool === "platforms") return platformsPanel({ draft, routeId, dispatch, onStartMove: (platformId) => dispatch({ type: "openTreesForMove", platformId }) });
    if (tool === "elements") return elementsPanel({ draft, routeId, dispatch });
    if (tool === "categoryName") return categoryNamePanel({ draft, routeId, categories: BUILDABLE_CATEGORIES, dispatch });
    return el("div");
  }

  return {
    setVisible(on) { container.hidden = !on; if (!on) zipTool.hide(); },
    render,
    getZipTool() { return zipTool; },
    showWalkBanner(text) { walkBanner.textContent = text; walkBanner.hidden = false; },
    hideWalkBanner() { walkBanner.hidden = true; },
    dispose() { inspector.dispose(); zipTool.dispose(); container.remove(); walkBanner.remove(); },
  };
}

function toolbarButton(label, onClick) {
  const btn = el("button", "btn", label);
  btn.type = "button";
  btn.addEventListener("click", onClick);
  return btn;
}

function categoryPill(category, selected, onClick) {
  const pill = el("button", `builder-category-pill${selected ? " selected" : ""}`, category.symbol);
  pill.type = "button";
  // The category's own colour on a dark panel – black's real colour is near-black too (js/ui/
  // map-render.js#mapColourOf already solves this exact clash for the course map/legend).
  pill.style.setProperty("--c", cssHex(mapColourOf(category)));
  pill.title = t(`cat.${category.id}`);
  pill.addEventListener("click", onClick);
  return pill;
}

function el(tag, className, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
