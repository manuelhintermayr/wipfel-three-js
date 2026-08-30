// Course Map overlay (ROADMAP M1.4, mockup Screen 4): full-screen dark overlay, `Tab` to open/close
// (also Esc/EXIT). The relief background is baked ONCE per park onto an offscreen canvas
// (js/ui/map-render.js#paintBackground) and just blitted every frame; routes, the player chevron and
// the NPC dots are a cheap vector pass redrawn every frame on top of that (js/ui/map-render.js
// #paintRoutes plus two small draws here), so filter/hover/pan/zoom never touch the expensive part.
//
// Opening the map does not pause the loop (js/main.js keeps stepping physics/gameplay/render behind
// the dark overlay) – it only stops the player's own movement input, the same "a screen is up, gate
// input for it" idea js/ui/kassa.js and js/ui/stamp-card.js already use via their own `visible` flag
// (js/main.js zeroes `input.move` for one frame at a time while `courseMap.visible`, see the loop's
// input phase) and releases pointer lock so the mouse can hover/click FILTER/PLAYER/ZOOM/EXIT.
import { t, formatTime } from "../core/i18n.js";
import { CATEGORY_BY_ID, MAP } from "../config.js";
import { routesFromPark } from "../game/route.js";
import { paintBackground, paintRoutes, cssHex, mapColourOf } from "./map-render.js";

const FILTERS = Object.freeze(["all", "blue", "red", "black"]);
const CACHE_SIZE = Object.freeze({ width: 1000, height: 700 });
const HOVER_PX = 16;

/**
 * @param {{ root: HTMLElement, parkDef, terrain, save, player, getAgents?: () => object[] }} options
 * @returns {{ visible: boolean, open(): void, close(): void, toggle(): void, update(dt): void, dispose(): void }}
 */
export function createCourseMap({ root, parkDef, terrain, save, player, getAgents = () => [] }) {
  const routeInfo = new Map(routesFromPark(parkDef).map((def) => [def.id, def]));

  const screen = el("div", "course-map");
  screen.hidden = true;
  const head = el("div", "head");
  const title = el("div", "title", t("map.title"));
  const filterChip = el("button", "filter-chip");
  filterChip.type = "button";
  head.append(title, filterChip);

  const wrap = el("div", "map-wrap");
  const canvas = document.createElement("canvas");
  canvas.width = CACHE_SIZE.width; canvas.height = CACHE_SIZE.height;
  const info = el("div", "info");
  info.hidden = true;
  wrap.append(canvas, info);

  const foot = el("div", "foot");
  const legend = el("div", "legend");
  for (const category of Object.values(CATEGORY_BY_ID)) {
    const chip = el("i", "", "");
    chip.style.setProperty("--c", cssHex(mapColourOf(category)));
    chip.textContent = `${category.symbol} ${t(`sign.${category.id}`).toUpperCase()}`;
    legend.appendChild(chip);
  }
  const actions = el("div", "actions");
  const btnFilter = el("button", "btn", t("map.filter"));
  const btnPlayer = el("button", "btn", t("map.player"));
  const btnZoom = el("button", "btn", t("map.zoom"));
  const btnExit = el("button", "btn", t("map.exit"));
  for (const b of [btnFilter, btnPlayer, btnZoom, btnExit]) b.type = "button";
  actions.append(btnFilter, btnPlayer, btnZoom, btnExit);
  foot.append(legend, actions);

  screen.append(head, wrap, foot);
  root.appendChild(screen);

  const ctx = canvas.getContext("2d");
  let cache = null, projector = null;      // baked once, on first open()
  let zoom = MAP.zoomLevels[0];
  let panX = 0, panY = 0;
  let filterIndex = 0;
  let hoverRouteId = null;
  let dragging = false, dragStartX = 0, dragStartY = 0, dragPanX = 0, dragPanY = 0;

  function bake() {
    cache = document.createElement("canvas");
    cache.width = canvas.width; cache.height = canvas.height;
    projector = paintBackground(cache, { parkDef, terrain, style: "relief", seed: parkDef.seed });
  }

  function clampPan() {
    const minX = canvas.width - canvas.width * zoom, minY = canvas.height - canvas.height * zoom;
    panX = Math.min(0, Math.max(minX, panX));
    panY = Math.min(0, Math.max(minY, panY));
  }

  function setFilterChip() {
    const key = FILTERS[filterIndex];
    filterChip.textContent = t(`map.filter.${key}`);
  }
  setFilterChip();

  /** Screen event → cache-canvas pixel space (undoes CSS scaling, then pan/zoom). */
  function bufferPoint(evt) {
    const rect = canvas.getBoundingClientRect();
    const bx = (evt.clientX - rect.left) * (canvas.width / rect.width);
    const by = (evt.clientY - rect.top) * (canvas.height / rect.height);
    return [(bx - panX) / zoom, (by - panY) / zoom];
  }

  function routePolyline(route) {
    const pts = [[route.entry.x, route.entry.z], ...route.platforms.map((p) => { const tr = parkDef.heroTrees[p.treeIndex]; return [tr.x, tr.z]; })];
    if (route.zip) pts.push([route.zip.landing.x, route.zip.landing.z]);
    return pts.map(([x, z]) => projector.toPx(x, z));
  }
  function nearestRoute(x, y) {
    let best = null, bestD = HOVER_PX;
    for (const route of parkDef.routes) {
      const pts = routePolyline(route);
      for (let i = 1; i < pts.length; i++) {
        const d = distToSegment(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
        if (d < bestD) { bestD = d; best = route; }
      }
    }
    return best;
  }

  function renderInfo(route) {
    if (!route) { info.hidden = true; return; }
    const def = routeInfo.get(route.id);
    const category = CATEGORY_BY_ID[route.category];
    const locked = !save.isUnlocked(route.category);
    const best = save.routeBest(route.id);
    info.replaceChildren();
    const nameRow = el("div", "info-name");
    nameRow.style.setProperty("--c", cssHex(mapColourOf(category)));
    nameRow.textContent = `${category.symbol} ${route.numeral} · ${t(route.nameKey)}`;
    info.appendChild(nameRow);
    if (locked) {
      info.appendChild(el("div", "info-locked", t(route.category === "black" ? "notice.lockedBlack" : "notice.lockedRed")));
    } else if (def) {
      const facts = el("div", "info-facts");
      for (const [value, key] of [[String(def.obstacles.length), "hud.obstacles"], [`${def.heightM} m`, "hud.height"], [`${def.lengthM} m`, "hud.length"], [best != null ? formatTime(best) : "–:––", "hud.bestTime"]]) {
        const cell = el("div", "info-fact");
        cell.append(el("b", "", value), el("span", "", t(key).toUpperCase()));
        facts.appendChild(cell);
      }
      info.appendChild(facts);
    }
    info.hidden = false;
  }

  canvas.addEventListener("mousemove", (evt) => {
    if (dragging) {
      const rect = canvas.getBoundingClientRect();
      panX = dragPanX + (evt.clientX - dragStartX) * (canvas.width / rect.width);
      panY = dragPanY + (evt.clientY - dragStartY) * (canvas.height / rect.height);
      clampPan();
      return;
    }
    const [x, y] = bufferPoint(evt);
    const route = nearestRoute(x, y);
    hoverRouteId = route ? route.id : null;
    renderInfo(route);
  });
  canvas.addEventListener("pointerdown", (evt) => {
    if (zoom <= MAP.zoomLevels[0]) return;
    dragging = true; dragStartX = evt.clientX; dragStartY = evt.clientY; dragPanX = panX; dragPanY = panY;
    canvas.setPointerCapture(evt.pointerId);
  });
  canvas.addEventListener("pointerup", () => { dragging = false; });
  canvas.addEventListener("mouseleave", () => { if (!dragging) { hoverRouteId = null; info.hidden = true; } });

  btnFilter.addEventListener("click", () => { filterIndex = (filterIndex + 1) % FILTERS.length; setFilterChip(); });
  btnPlayer.addEventListener("click", () => centreOn(player.position.x, player.position.z));
  btnZoom.addEventListener("click", () => toggleZoom());
  btnExit.addEventListener("click", () => api.close());
  filterChip.addEventListener("click", () => btnFilter.click());

  function centreOn(x, z) {
    if (!projector) return;
    const [px, py] = projector.toPx(x, z);
    panX = canvas.width / 2 - px * zoom;
    panY = canvas.height / 2 - py * zoom;
    clampPan();
  }
  function toggleZoom() {
    const cx = (canvas.width / 2 - panX) / zoom, cy = (canvas.height / 2 - panY) / zoom;
    zoom = zoom === MAP.zoomLevels[0] ? MAP.zoomLevels[MAP.zoomLevels.length - 1] : MAP.zoomLevels[0];
    panX = canvas.width / 2 - cx * zoom;
    panY = canvas.height / 2 - cy * zoom;
    clampPan();
  }

  function drawDynamic() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);
    ctx.drawImage(cache, 0, 0);
    paintRoutes(ctx, { parkDef, projector, filterCategory: FILTERS[filterIndex], hoverRouteId });
    for (const agent of getAgents()) {
      const [ax, ay] = projector.toPx(agent.pos.x, agent.pos.z);
      const category = CATEGORY_BY_ID[agent.category];
      ctx.beginPath(); ctx.arc(ax, ay, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = cssHex(category ? mapColourOf(category) : 0xffffff);
      ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
    }
    drawPlayer();
    ctx.restore();
  }

  function drawPlayer() {
    const [px, py] = projector.toPx(player.position.x, player.position.z);
    const ahead = { x: player.position.x + Math.sin(player.heading) * 3, z: player.position.z + Math.cos(player.heading) * 3 };
    const [tx, ty] = projector.toPx(ahead.x, ahead.z);
    const angle = Math.atan2(ty - py, tx - px);
    const size = 9;
    ctx.save();
    ctx.translate(px, py); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * 0.7, size * 0.62); ctx.lineTo(-size * 0.35, 0); ctx.lineTo(-size * 0.7, -size * 0.62); ctx.closePath();
    ctx.fillStyle = "#f2c635"; ctx.strokeStyle = "#20241f"; ctx.lineWidth = 1.4;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  const api = {
    get visible() { return !screen.hidden; },
    open() {
      if (!cache) bake();
      screen.hidden = false;
      // The route header/ticket box/prompt live in the separate #hud layer underneath (js/ui/hud.js,
      // js/ui/hud-route.js) – the overlay's own tint dims them but does not hide them, and they sit in
      // the same corners as this screen's own title/filter chip. A body class is simpler than wiring
      // every HUD sub-module through this module just to hide them (css/screens.css).
      document.body.classList.add("course-map-open");
      if (document.exitPointerLock) document.exitPointerLock();
    },
    close() { screen.hidden = true; document.body.classList.remove("course-map-open"); },
    toggle() { if (api.visible) api.close(); else api.open(); },
    /** ui/render phase, only meaningfully while visible – repaints the cheap dynamic layer. */
    update() { if (!screen.hidden && cache) drawDynamic(); },
    dispose() { screen.remove(); document.body.classList.remove("course-map-open"); },
  };
  return api;
}

/** Squared-distance-free point-to-segment distance (2-D). */
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function el(tag, className, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
