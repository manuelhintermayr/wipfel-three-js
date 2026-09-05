// The builder's screen furniture (M3a/M3b, GDD §5 "Builder: Werkzeugleiste, Overlays, Inspektor,
// Kalender, Kasse" – Kalender/Kasse are js/builder/operator-panel.js's own top bar, mounted by
// js/builder/builder.js alongside this module rather than inside it): left = route list, right = the
// js/builder/builder-inspector.js read-out, bottom = the toolbar that opens one of five data-editing
// panels (js/builder/builder-tool-panels.js, "rescue" new in M3b) or the Flying-Fox tool
// (js/builder/builder-zip-tool.js), plus a row of four independent overlay toggles (M3b, GDD "Overlays
// Warten·Angst·Rettung" + tree health – js/builder/builder-overlays.js owns the actual 3-D layers).
// Stateless by design – every render() call redraws from whatever (draft, selection) js/builder/
// builder.js hands it; every click only ever calls the one `dispatch(action)` callback, so this module
// never mutates the draft itself.
import { t } from "../core/i18n.js";
import { CATEGORIES, CATEGORY_BY_ID } from "../config.js";
import { mapColourOf, cssHex } from "../ui/map-render.js";
import { createInspector } from "./builder-inspector.js";
import { createZipTool } from "./builder-zip-tool.js";
import { treesPanel, platformsPanel, elementsPanel, categoryNamePanel, rescuePanel } from "./builder-tool-panels.js";

const TOOLS = Object.freeze(["trees", "platforms", "elements", "zip", "categoryName", "rescue"]);
/** Green is the Wichtel/practice-course colour (ROADMAP M2a) – never a builder-buildable route category. */
const BUILDABLE_CATEGORIES = CATEGORIES.filter((c) => c.id !== "green");
/** M3b overlay toggles – independent booleans, shown together, unlike the mutually-exclusive TOOLS above. */
export const OVERLAYS = Object.freeze(["wait", "fear", "rescue", "treeHealth"]);

/**
 * @param {{ root: HTMLElement, dispatch: (action: object) => void }} options
 * @returns {{ setVisible(on: boolean): void, render(draft: object, selection: object): void,
 *   getZipTool(): ReturnType<typeof createZipTool>, showWalkBanner(text: string): void,
 *   hideWalkBanner(): void, dispose(): void }}
 */
export function createBuilderUi({ root, dispatch }) {
  const container = el("div", "builder-ui");
  // Bug found verifying M3b (pre-existing since M3a): `setVisible()` is the only place that ever
  // touched `.hidden`, and it is only ever called from js/builder/builder.js's `enter()`/`exit()` –
  // neither runs on a fresh "closed" boot, so this container defaulted to *visible*, overlapping the
  // normal gameplay HUD on every single boot regardless of `?builder=1`. `js/builder/builder-zip-tool.js`'s
  // own panel already got this right (`panel.hidden = true` right at construction) – matched here.
  container.hidden = true;
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
  // M3b overlays: a second, visually distinct group – toggles, not exclusive tools, so their own active
  // state never clears when a tool panel opens/closes (js/builder/builder.js tracks it separately).
  const overlayGroup = el("div", "builder-overlay-toggles");
  const overlayButtons = new Map();
  for (const overlayId of OVERLAYS) {
    const btn = el("button", "btn builder-overlay-btn", t(`builder.overlay.${overlayId}`));
    btn.type = "button";
    btn.addEventListener("click", () => dispatch({ type: "toggleOverlay", overlay: overlayId }));
    overlayButtons.set(overlayId, btn);
    overlayGroup.appendChild(btn);
  }
  toolbar.appendChild(overlayGroup);
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
      // M3b: the inspector's own "Retter-Abdeckung" line (GDD §4) – park-wide coverage, filtered to this
      // route's own platforms by js/builder/builder-inspector.js.
      rescueCoverage: draft.rescueCoverage(), rescuePostCount: draft.rescuePosts.length,
    } : null;
    inspector.render(selected, derived);

    // "rescue" is the one park-wide tool (a rescuer post belongs to the park, not one route) – every
    // other tool/action here still needs a selected route.
    for (const [id, btn] of toolButtons) { btn.classList.toggle("active", selection.activeTool === id); btn.disabled = !selected && id !== "rescue"; }
    for (const [id, btn] of overlayButtons) btn.classList.toggle("active", !!(selection.overlays && selection.overlays[id]));
    walkBtn.disabled = !selected || !draft.canWalk(selected.id);
    validateBtn.disabled = !selected;
    removeRouteBtn.disabled = !selected;

    const activeIsZip = selection.activeTool === "zip";
    const activeIsRescue = selection.activeTool === "rescue";
    toolArea.hidden = !selection.activeTool || activeIsZip || (!selected && !activeIsRescue);
    if (!toolArea.hidden) toolArea.replaceChildren(buildToolPanel(selection.activeTool, draft, selected ? selected.id : null, selection));
    if (!selected || !activeIsZip) zipTool.hide();
  }

  function buildToolPanel(tool, draft, routeId, selection) {
    if (tool === "rescue") return rescuePanel({ draft, dispatch });
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
