// Content builders for the four data-editing tool panels the M3a builder's bottom toolbar opens
// (Trees / Platforms / Elements / Category+Name – the Zip tool is its own module,
// js/builder/builder-zip-tool.js, because it needs a live canvas instead of a plain list). Every
// function here is a pure "data + dispatch → DOM" builder, called fresh by js/builder/builder-ui.js
// every time the panel needs to redraw; none of them touch the draft directly, only `dispatch(action)`.
import { t } from "../core/i18n.js";
import { mapColourOf, cssHex } from "../ui/map-render.js";
import { SURVEY } from "./survey-trees.js";

/**
 * @param {{ draft, routeId: string, mode: "add"|"move", targetPlatformId?: string, dispatch: (a:object)=>void }} o
 */
export function treesPanel({ draft, routeId, mode, targetPlatformId, dispatch }) {
  const route = draft.getRoute(routeId);
  const anchor = route.platforms[route.platforms.length - 1] || null;
  const anchorPos = anchor ? draft.heroTrees[anchor.treeIndex] : null;
  const distanceTo = (c) => (anchorPos ? Math.hypot(c.x - anchorPos.x, c.z - anchorPos.z) : 0);
  const candidates = draft.candidates
    .map((c) => ({ ...c, distance: distanceTo(c) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 24);

  const panel = el("div", "builder-panel builder-trees-panel");
  panel.appendChild(el("h3", "", t(mode === "move" ? "builder.trees.titleMove" : "builder.trees.titleAdd")));
  if (!candidates.length) { panel.appendChild(el("div", "builder-empty-small", t("builder.trees.empty"))); return panel; }
  const list = el("div", "builder-tree-list");
  for (const c of candidates) {
    const eligible = c.health >= SURVEY.minHealthForPlatform;
    const row = el("button", `builder-tree-row${eligible ? "" : " weak"}`);
    row.type = "button";
    row.disabled = !eligible;
    const dist = anchorPos ? `${c.distance.toFixed(0)} m · ` : "";
    row.append(
      el("span", "builder-tree-species", t(`builder.species.${c.species}`)),
      el("span", "builder-tree-meta", `${dist}${t("builder.trees.height", { m: c.height.toFixed(0) })}`),
      healthPip(c.health),
    );
    row.addEventListener("click", () => dispatch({ type: mode === "move" ? "movePlatform" : "addPlatform", routeId, platformId: targetPlatformId, candidateId: c.id }));
    list.appendChild(row);
  }
  panel.appendChild(list);
  return panel;
}

function healthPip(health) {
  const pip = el("span", "builder-health-pip", `${Math.round(health * 100)}%`);
  pip.classList.add(health < SURVEY.minHealthForPlatform ? "weak" : health < 0.8 ? "ok" : "good");
  return pip;
}

/** @param {{ draft, routeId: string, dispatch: (a:object)=>void, onStartMove: (platformId:string)=>void }} o */
export function platformsPanel({ draft, routeId, dispatch, onStartMove }) {
  const route = draft.getRoute(routeId);
  const panel = el("div", "builder-panel builder-platforms-panel");
  panel.appendChild(el("h3", "", t("builder.platforms.title")));
  if (!route.platforms.length) { panel.appendChild(el("div", "builder-empty-small", t("builder.platforms.empty"))); return panel; }
  const list = el("div", "builder-platform-list");
  route.platforms.forEach((p, i) => {
    const row = el("div", "builder-platform-row");
    row.append(el("span", "builder-platform-index", `#${i + 1}`), el("span", "builder-platform-kind", t(`builder.platformKind.${p.kind}`)));
    const height = document.createElement("input");
    height.type = "number"; height.step = "0.1"; height.className = "builder-height-input";
    height.value = p.deckHeight.toFixed(1);
    height.addEventListener("change", () => dispatch({ type: "setDeckHeight", routeId, platformId: p.id, height: Number(height.value) }));
    row.appendChild(height);
    row.appendChild(el("span", "builder-unit", "m"));
    if (p.kind !== "junction") {
      const moveBtn = el("button", "btn small", t("builder.platforms.move"));
      moveBtn.type = "button";
      moveBtn.addEventListener("click", () => onStartMove(p.id));
      row.appendChild(moveBtn);
    }
    list.appendChild(row);
  });
  panel.appendChild(list);
  const removeBtn = el("button", "btn small", t("builder.platforms.removeLast"));
  removeBtn.type = "button";
  removeBtn.addEventListener("click", () => dispatch({ type: "removePlatform", routeId }));
  panel.appendChild(removeBtn);
  return panel;
}

/** @param {{ draft, routeId: string, dispatch: (a:object)=>void }} o */
export function elementsPanel({ draft, routeId, dispatch }) {
  const route = draft.getRoute(routeId);
  const kinds = draft.availableEdgeKinds(route.category);
  const panel = el("div", "builder-panel builder-elements-panel");
  panel.appendChild(el("h3", "", t("builder.elements.title")));
  if (!route.edges.length) { panel.appendChild(el("div", "builder-empty-small", t("builder.elements.empty"))); return panel; }
  const list = el("div", "builder-element-list");
  route.edges.forEach((edge, i) => {
    const row = el("div", "builder-element-row");
    row.appendChild(el("span", "builder-element-index", `#${i + 1}`));
    const select = document.createElement("select");
    for (const k of kinds) {
      const option = document.createElement("option");
      option.value = k.kind; option.textContent = t(k.labelKey);
      if (k.kind === edge.kind) option.selected = true;
      select.appendChild(option);
    }
    if (!kinds.some((k) => k.kind === edge.kind)) {
      const current = document.createElement("option");
      current.value = edge.kind; current.textContent = edge.kind; current.selected = true;
      select.appendChild(current);
    }
    select.addEventListener("change", () => dispatch({ type: "setEdgeKind", routeId, edgeId: edge.id, kind: select.value }));
    row.appendChild(select);
    list.appendChild(row);
  });
  panel.appendChild(list);
  return panel;
}

/** @param {{ draft, routeId: string, categories: Array<{id,symbol,css}>, dispatch: (a:object)=>void }} o */
export function categoryNamePanel({ draft, routeId, categories, dispatch }) {
  const route = draft.getRoute(routeId);
  const panel = el("div", "builder-panel builder-category-panel");
  panel.appendChild(el("h3", "", t("builder.categoryName.title")));

  const nameRow = el("div", "builder-form-row");
  nameRow.appendChild(el("span", "builder-form-label", t("builder.categoryName.nameLabel")));
  const nameInput = document.createElement("input");
  nameInput.type = "text"; nameInput.value = t(route.nameKey);
  nameInput.maxLength = 40;
  nameInput.addEventListener("change", () => dispatch({ type: "setRouteName", routeId, name: nameInput.value }));
  nameRow.appendChild(nameInput);
  panel.appendChild(nameRow);

  const catRow = el("div", "builder-form-row");
  catRow.appendChild(el("span", "builder-form-label", t("builder.categoryName.categoryLabel")));
  const pills = el("div", "builder-category-pills");
  for (const category of categories) {
    const pill = el("button", `builder-category-pill${category.id === route.category ? " selected" : ""}`, category.symbol);
    pill.type = "button";
    // Same near-black-on-dark-panel clash js/ui/map-render.js#mapColourOf already solves for the
    // course map/legend – reused here instead of a second light-grey substitute.
    pill.style.setProperty("--c", cssHex(mapColourOf(category)));
    pill.title = t(`cat.${category.id}`);
    pill.addEventListener("click", () => dispatch({ type: "setCategory", routeId, category: category.id }));
    pills.appendChild(pill);
  }
  catRow.appendChild(pills);
  panel.appendChild(catRow);
  return panel;
}

function el(tag, className, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
