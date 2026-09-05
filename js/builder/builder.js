// Builder mode orchestration (M3a, GDD §4 "Betreiber-Gameplay"): the one module js/main.js talks to.
// Three modes: "closed" (normal game), "editing" (top-down camera, builder UI, player/guests hidden,
// world simulation frozen – js/main.js gates its own gameplay/render phases on this), "walking" (the
// walkthrough obligation – normal player control and HUD, builder UI hidden, a small persistent banner
// on top). Owns the draft (js/builder/builder-state.js), the orbit camera (js/builder/builder-camera.js),
// the 3D ghost/highlight overlays (js/builder/builder-overlays.js) and the screen furniture (js/builder/
// builder-ui.js); asks `world` (four callbacks js/main.js implements) to turn a finished draft into a
// real, playable park – this module never touches forest/course/session/etc. construction itself.
import * as THREE from "three";
import { t } from "../core/i18n.js";
import { CATEGORY_BY_ID, ECONOMY } from "../config.js";
import { LAYOUT_LIMITS, farFromOtherRoutes } from "../park/layout-validate.js";
import { createBuilderDraft } from "./builder-state.js";
import { createBuilderCamera } from "./builder-camera.js";
import { createBuilderOverlays } from "./builder-overlays.js";
import { createBuilderUi } from "./builder-ui.js";
import { createOperatorPanel } from "./operator-panel.js";
import { createRouteRun } from "../game/route.js";
import { createAutoplay } from "../game/autoplay.js";

const OVERLAY_DEFAULTS = Object.freeze({ wait: false, fear: false, rescue: false, treeHealth: false });
// Fixed heat-scale ceilings for the wait/fear overlays (js/builder/builder-overlays.js's 0..1 "value")
// – documented design assumptions, not measured against real data: two minutes' average wait already
// reads as "bad", six lifetime freeze/panic events on one element already reads as "worst".
const WAIT_SECONDS_CEILING = 120;
const FEAR_EVENTS_CEILING = 6;

/**
 * @param {{ scene, terrain, rng, player, camera, renderer, input, events, loop, save, ticket, kassa,
 *   briefing, belay, hud, root: HTMLElement, operations, economy,
 *   world: { getParkDef(): object, getCourse(): object, getGuests(): {agents, guestRig},
 *     getInteraction(): object, applyParkDef(next: object): { course: object, parkDef: object } } }} options
 *   `operations`/`economy` (M3b, js/game/operations.js / js/game/economy.js) drive the operator panel's
 *   top bar and the one-time cash charge when a route's walkthrough opens it for the first time.
 */
export function createBuilder({ scene, terrain, rng, player, camera, renderer, input, events, loop, save, ticket, kassa, briefing, belay, hud, root, world, operations, economy }) {
  const cameraCtl = createBuilderCamera({ camera, input, dom: renderer.domElement, terrain });
  const overlays = createBuilderOverlays({ scene });
  const labels = createLabelLayer(root);
  const ui = createBuilderUi({ root, dispatch });
  const operatorPanel = createOperatorPanel({ root });

  let mode = "closed";
  let draft = null;
  let selection = { routeId: null, activeTool: null, treesMode: null, overlays: { ...OVERLAY_DEFAULTS } };
  let walkthrough = null;   // { routeId, run, offs: Array<()=>void>, bot: ReturnType<createAutoplay>|null }

  // --- rendering the draft --------------------------------------------------------------------------
  function refreshOverlays() {
    overlays.setRoute(selection.routeId ? routeGeometry(draft, terrain, selection.routeId) : null);
    overlays.setCandidates(candidateGeometry(draft, terrain));
    refreshOperatorOverlays();
  }

  /** M3b: the four independent toggle layers (GDD "Overlays Warten·Angst·Rettung" + tree health) –
   *  read from the live guest simulation (js/npc/agents.js, frozen while editing but its own running
   *  averages survive the freeze) and the draft's own tree/rescuer-post data. Each layer is only ever
   *  computed while its toggle is on, and cleared (a `null`/`.setXOverlay([])`) the moment it is off. */
  function refreshOperatorOverlays() {
    const { agents } = world.getGuests();
    overlays.setWaitOverlay(selection.overlays.wait ? waitOverlayPoints(draft, terrain, agents) : []);
    overlays.setFearOverlay(selection.overlays.fear ? fearOverlayPoints(draft, terrain, agents) : []);
    overlays.setTreeHealthOverlay(selection.overlays.treeHealth ? treeHealthPoints(draft, terrain) : []);
    overlays.setRescueOverlay(selection.overlays.rescue ? rescueOverlayView(draft, terrain) : null);
  }

  function refreshOperatorPanel() {
    if (mode !== "editing" || !operations || !economy) { operatorPanel.setVisible(false); return; }
    const { agents } = world.getGuests();
    const waitStats = agents ? agents.waitStats() : {};
    const values = Object.values(waitStats);
    const averageWaitSeconds = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    operatorPanel.setVisible(true);
    operatorPanel.render({
      season: operations.season, dayInSeason: operations.dayInSeason, forecast: operations.forecast,
      guestsToday: agents ? agents.count : 0, averageWaitSeconds,
      rating: economy.rating, cash: economy.cash,
      ppeWear: operations.ppeWear, ppeInspectionDue: operations.ppeInspectionDue, ppeCost: ECONOMY.ppeResetCost,
      stormWarningLine: operations.stormWarningLine,
      onInspectPpe: () => { economy.chargePpeReset(); operations.resetPpe(); refreshOperatorPanel(); },
    });
  }

  function refreshUi() { ui.render(draft, selection); refreshOverlays(); refreshOperatorPanel(); }

  function selectRoute(id) {
    selection = { ...selection, routeId: id, treesMode: null };
    refreshUi();
  }

  function persistDraft() { save.setCustomPark(draft.serialize()); }

  function openZipTool() {
    if (!selection.routeId) return;
    const routeId = selection.routeId;
    ui.getZipTool().show({
      originWorld: lastPlatformOf(draft, routeId),
      evaluate: (landing) => draft.evaluateZip(routeId, landing),
      onCommit(landing) {
        draft.commitZip(routeId, landing);
        selection = { ...selection, activeTool: null };
        refreshUi();
        persistDraft();
      },
    });
  }

  function dispatch(action) {
    if (!draft) return;
    switch (action.type) {
      case "selectRoute": selectRoute(action.id); return;
      case "setActiveTool":
        selection = { ...selection, activeTool: action.tool, treesMode: action.tool === "trees" ? { mode: "add", targetPlatformId: null } : null };
        if (action.tool === "zip") openZipTool();
        refreshUi();
        return;
      case "openTreesForMove":
        selection = { ...selection, activeTool: "trees", treesMode: { mode: "move", targetPlatformId: action.platformId } };
        refreshUi();
        return;
      case "addRoute": { const r = draft.addRoute(action.category); selectRoute(r.id); return; }
      case "removeRoute": {
        if (!selection.routeId) return;
        draft.removeRoute(selection.routeId);
        selection = { routeId: draft.routes[0] ? draft.routes[0].id : null, activeTool: null, treesMode: null };
        refreshUi(); persistDraft();
        return;
      }
      case "addPlatform": draft.addPlatform(action.routeId, action.candidateId); refreshUi(); persistDraft(); return;
      case "movePlatform": draft.movePlatform(action.routeId, action.platformId, action.candidateId); refreshUi(); persistDraft(); return;
      case "removePlatform": draft.removePlatform(action.routeId); refreshUi(); persistDraft(); return;
      case "setDeckHeight": draft.setDeckHeight(action.routeId, action.platformId, action.height); refreshUi(); persistDraft(); return;
      case "setEdgeKind": draft.setEdgeKind(action.routeId, action.edgeId, action.kind); refreshUi(); persistDraft(); return;
      case "setCategory": draft.setCategory(action.routeId, action.category); refreshUi(); persistDraft(); return;
      case "setRouteName": draft.setRouteName(action.routeId, action.name); refreshUi(); persistDraft(); return;
      case "validate": draft.revalidate(action.routeId || selection.routeId); refreshUi(); return;
      case "toggleOverlay":
        selection = { ...selection, overlays: { ...selection.overlays, [action.overlay]: !selection.overlays[action.overlay] } };
        refreshUi();
        return;
      case "addRescuePost": {
        const result = draft.addRescuePost(action.candidateId);
        if (result.ok && economy) economy.chargeRescuePost();
        refreshUi(); persistDraft();
        return;
      }
      case "removeRescuePost": draft.removeRescuePost(action.postId); refreshUi(); persistDraft(); return;
      case "walk": if (selection.routeId) startWalkthrough(selection.routeId, { bot: false }); return;
      case "exit": exit(); return;
      case "resetToGenerated": save.clearCustomPark(); window.location.reload(); return;
      default: return;
    }
  }

  // --- editing mode ----------------------------------------------------------------------------------
  function hideLive() {
    player.rig.root.visible = false;
    const { guestRig } = world.getGuests();
    if (guestRig) guestRig.group.visible = false;
  }
  function showLive() {
    player.rig.root.visible = true;
    const { guestRig } = world.getGuests();
    if (guestRig) guestRig.group.visible = true;
  }

  function enter() {
    if (mode !== "closed") return;
    mode = "editing";
    loop.paused = true;
    const parkDef = world.getParkDef();
    const saved = save.data.customPark && save.data.customPark.parkDef.id === parkDef.id ? save.data.customPark : null;
    const walkedStatus = saved ? Object.fromEntries(Object.entries(saved.routeStatus).map(([id, s]) => [id, s.walked])) : {};
    draft = createBuilderDraft({ parkDef, terrain, rng: rng.fork("draft"), walkedStatus });
    selection = { routeId: draft.routes[0] ? draft.routes[0].id : null, activeTool: null, treesMode: null, overlays: selection.overlays };
    hideLive();
    document.body.classList.add("builder-editing-active");   // hides the normal HUD (css/builder.css)
    ui.setVisible(true);
    const focusRoute = selection.routeId ? draft.getRoute(selection.routeId) : null;
    cameraCtl.enter(focusRoute && focusRoute.entry ? focusRoute.entry : terrain.hubs[0]);
    refreshUi();
  }

  /** Rebuilds the live park from the draft only if it actually diverges from what is loaded – exiting
   *  (or walking) after a purely cosmetic look-around never pays for a reload. */
  function applyIfChanged() {
    const nextDef = draft.toParkDef();
    if (JSON.stringify(nextDef) === JSON.stringify(world.getParkDef())) return world.getCourse();
    return world.applyParkDef(nextDef).course;
  }

  function exit() {
    if (mode !== "editing") return;
    applyIfChanged();
    persistDraft();
    cameraCtl.exit();
    ui.setVisible(false);
    operatorPanel.setVisible(false);
    showLive();
    document.body.classList.remove("builder-editing-active");
    loop.paused = false;
    mode = "closed";
    draft = null;
  }

  // --- walkthrough (GDD §4 "Begehung": camera drops onto the entry deck, climber mode) ----------------
  function startWalkthrough(routeId, { bot = false } = {}) {
    if (!draft || !draft.canWalk(routeId)) return false;
    const course = applyIfChanged();
    const route = course.routeFor(routeId);
    if (!route || !route.entryDeck) return false;
    const def = draft.estimate(routeId);
    const run = createRouteRun(def);
    run.start();

    ui.setVisible(false);
    cameraCtl.exit();
    loop.paused = false;
    document.body.classList.remove("builder-editing-active");   // the normal HUD comes back for the walk
    document.body.classList.add("builder-walkthrough-active");
    ui.showWalkBanner(t("builder.walk.banner", { name: t(def.nameKey) }));

    if (!ticket.started) kassa.confirmDefaults();
    if (!save.data.briefingDone) briefing.completeForBot();
    belay.reset();
    const onDeck = route.entryDeck.group.localToWorld(new THREE.Vector3(0.4, 0, 0.1));
    player.teleport(onDeck.x, route.entryDeck.top + 0.05, onDeck.z);
    player.setState("ground");

    const finishIfDone = () => { if (run.progress >= run.total) finishWalkthrough(routeId); };
    const offs = [
      events.on("player:ladder-exit", ({ progress }) => { if (progress >= 1 && run.completeObstacle("ladder")) finishIfDone(); }),
      events.on("player:element-exit", ({ element, completed }) => { if (completed && run.completeObstacle(element)) finishIfDone(); }),
      events.on("zip:finished", ({ element }) => { if (run.completeObstacle(element)) finishIfDone(); }),
      events.on("player:rescued", () => abortWalkthrough(t("builder.walk.aborted"))),
    ];
    // `session: { run }` gives the bot the one thing it reads from a real session (`run.completedIds`,
    // js/game/autoplay.js#done) without wiring the route into the real js/game/session.js at all – this
    // walkthrough's own `run` (above) already tracks completion from the exact same events.
    const autoplayBot = bot ? createAutoplay({ player, course, interaction: world.getInteraction(), events, belay, session: { run }, route }) : null;
    walkthrough = { routeId, run, offs, bot: autoplayBot };
    mode = "walking";
    return true;
  }

  function endWalkthrough() {
    if (!walkthrough) return;
    for (const off of walkthrough.offs) off();
    if (walkthrough.bot) walkthrough.bot.dispose();
    walkthrough = null;
    document.body.classList.remove("builder-walkthrough-active");
    ui.hideWalkBanner();
  }

  function returnToEditing() {
    mode = "editing";
    loop.paused = true;
    document.body.classList.add("builder-editing-active");
    ui.setVisible(true);
    hideLive();
    const focus = selection.routeId ? draft.getRoute(selection.routeId).entry : null;
    cameraCtl.enter(focus || terrain.hubs[0]);
    refreshUi();
  }

  function finishWalkthrough(routeId) {
    if (!walkthrough || walkthrough.routeId !== routeId) return;
    // M3b economy (GDD §4 "Fixkosten … je Parcours"): charged exactly once, the moment a route first
    // becomes open – re-walking an already-open route (allowed; the Walk button only checks validation
    // issues, not `walked`) must never charge it twice. `draft.getRoute` still reports the *previous*
    // state here, before `markWalked` below flips it.
    const wasOpen = draft.getRoute(routeId).walked;
    draft.markWalked(routeId);
    if (!wasOpen && economy) {
      const route = draft.getRoute(routeId);
      const est = draft.estimate(routeId);
      economy.chargeRouteOpened(routeId, route.category, est ? est.lengthM : 0);
    }
    persistDraft();
    endWalkthrough();
    hud.setNotice(t("builder.walk.completed"), 5);
    returnToEditing();
  }
  function abortWalkthrough(message) {
    if (!walkthrough) return;
    endWalkthrough();
    hud.setNotice(message, 5);
    returnToEditing();
  }

  return {
    /** "closed" | "editing" | "walking" – js/main.js's loop wiring branches on this. */
    get mode() { return mode; },
    enter,
    exit,
    /** `?builder=1&autowalk=<routeId>` (verification/testing): open the builder, then immediately walk
     *  the given route with the existing `?autoplay=1` bot instead of waiting for a human. */
    startAutowalk(routeId) {
      enter();
      if (!draft.getRoute(routeId)) return false;
      selectRoute(routeId);
      return startWalkthrough(routeId, { bot: true });
    },
    /** A manual escape hatch while walking (stuck, changed your mind) – same path a rescue takes. */
    requestAbortWalk() { if (mode === "walking") abortWalkthrough(t("builder.walk.aborted")); },

    /** Input phase, every frame regardless of mode – only ever does anything while a bot is walking
     *  (synthetic key events must fire before any consumer reads this frame's edges, same rule
     *  js/game/autoplay.js's own header already states). */
    onInputPhase(frameDt) { if (walkthrough && walkthrough.bot) walkthrough.bot.update(frameDt); },
    /** Render phase, only meaningful in "editing" – drives the orbit camera and the span/length labels. */
    onRenderPhase(dt) {
      if (mode !== "editing") return;
      cameraCtl.update(dt);
      labels.project(camera, renderer.domElement, overlays.getLabels());
    },

    dispose() {
      endWalkthrough();
      cameraCtl.dispose();
      overlays.dispose();
      ui.dispose();
      operatorPanel.dispose();
      labels.dispose();
    },
  };
}

/** World-space point + deck-top height for every platform of one draft route, for the 3D lifeline
 *  highlight and the zip tool's origin. */
function routeGeometry(draft, terrain, routeId) {
  const route = draft.getRoute(routeId);
  const category = CATEGORY_BY_ID[route.category];
  const points = route.platforms.map((p) => {
    const tree = draft.heroTrees[p.treeIndex];
    return { x: tree.x, y: terrain.heightAt(tree.x, tree.z) + p.deckHeight, z: tree.z };
  });
  let zip = null;
  if (route.zip && points.length) {
    const landing = route.zip.landing;
    zip = { from: points[points.length - 1], to: { x: landing.x, y: terrain.heightAt(landing.x, landing.z) + 1, z: landing.z } };
  }
  return { points, colour: category ? category.colour : 0x2f6fd6, zip };
}

function lastPlatformOf(draft, routeId) {
  const route = draft.getRoute(routeId);
  const last = route.platforms[route.platforms.length - 1];
  return last ? draft.heroTrees[last.treeIndex] : null;
}

/** Ghost-marker colour per not-yet-adopted survey candidate: too weak to carry a platform at all, in
 *  conflict with an already-placed tree (a coarse, visual-only distance check – the real gate is
 *  js/builder/builder-validate.js's `farFromOtherRoutes`, run per route at edit time), or clear to use. */
function candidateGeometry(draft, terrain) {
  const heroTrees = draft.heroTrees;
  return draft.candidates
    .filter((c) => !c.existing)
    .map((c) => {
      const status = c.health < 0.55 ? "weak" : farFromOtherRoutes(c.x, c.z, heroTrees, LAYOUT_LIMITS.routeTreeClearance) ? "ok" : "conflict";
      return { x: c.x, y: terrain.heightAt(c.x, c.z), z: c.z, status };
    });
}

/** Route-entry markers coloured by that route's own average queue wait (js/npc/agents.js#waitStats),
 *  normalised against a fixed ceiling for a stable heat scale. */
function waitOverlayPoints(draft, terrain, agents) {
  if (!agents) return [];
  const stats = agents.waitStats();
  return draft.routes.filter((r) => r.entry).map((r) => ({
    x: r.entry.x, y: terrain.heightAt(r.entry.x, r.entry.z) + 1.6, z: r.entry.z,
    value: Math.min(1, (stats[r.id] || 0) / WAIT_SECONDS_CEILING),
  }));
}

/** One marker per element that has ever recorded a freeze/panic (js/npc/agents.js#fearStats), placed
 *  at that element's own midpoint. */
function fearOverlayPoints(draft, terrain, agents) {
  if (!agents) return [];
  const stats = agents.fearStats();
  const points = [];
  for (const route of draft.routes) {
    const platformById = new Map(route.platforms.map((p) => [p.id, p]));
    for (const edge of route.edges) {
      const count = stats[edge.id];
      if (!count) continue;
      const a = platformById.get(edge.from), b = platformById.get(edge.to);
      const treeA = a && draft.heroTrees[a.treeIndex], treeB = b && draft.heroTrees[b.treeIndex];
      if (!treeA || !treeB) continue;
      const x = (treeA.x + treeB.x) / 2, z = (treeA.z + treeB.z) / 2;
      points.push({ x, y: terrain.heightAt(x, z) + 3, z, value: Math.min(1, count / FEAR_EVENTS_CEILING) });
    }
  }
  return points;
}

/** Every hero tree, coloured by 1 - health (a sick/thin tree reads red, a healthy one green). */
function treeHealthPoints(draft, terrain) {
  return draft.heroTrees.map((tree) => ({
    x: tree.x, y: terrain.heightAt(tree.x, tree.z) + 1, z: tree.z,
    value: 1 - Math.max(0, Math.min(1, tree.health)),
  }));
}

/** Rescuer posts + every platform recoloured by js/builder/builder-metrics.js#rescueCoverage's verdict
 *  (a junction platform, listed by two routes, is pushed twice – a harmless duplicate marker at the
 *  same spot, not worth de-duplicating for at most a couple of dozen platforms). */
function rescueOverlayView(draft, terrain) {
  const coverage = draft.rescueCoverage();
  const platforms = [];
  for (const route of draft.routes) {
    for (const platform of route.platforms) {
      const tree = draft.heroTrees[platform.treeIndex];
      if (!tree) continue;
      platforms.push({
        x: tree.x, y: terrain.heightAt(tree.x, tree.z) + platform.deckHeight, z: tree.z,
        covered: coverage.covered.has(platform.id),
      });
    }
  }
  const posts = draft.rescuePosts.map((p) => ({ x: p.x, y: terrain.heightAt(p.x, p.z), z: p.z }));
  return { posts, radiusM: coverage.radiusM, platforms };
}

/** Screen-space `<span>` pool for the overlays' world-space length labels – reused across frames. */
function createLabelLayer(root) {
  const layer = document.createElement("div");
  layer.className = "builder-label-layer";
  root.appendChild(layer);
  let pool = [];
  const v = new THREE.Vector3();

  function ensure(n) {
    while (pool.length < n) { const s = document.createElement("span"); s.className = "builder-label"; layer.appendChild(s); pool.push(s); }
    while (pool.length > n) pool.pop().remove();
  }

  return {
    project(camera, dom, worldLabels) {
      ensure(worldLabels.length);
      const rect = dom.getBoundingClientRect();
      worldLabels.forEach((label, i) => {
        v.set(label.x, label.y, label.z).project(camera);
        const span = pool[i];
        if (v.z < -1 || v.z > 1) { span.hidden = true; return; }
        span.hidden = false;
        span.style.left = `${rect.left + (v.x * 0.5 + 0.5) * rect.width}px`;
        span.style.top = `${rect.top + (-v.y * 0.5 + 0.5) * rect.height}px`;
        span.textContent = label.text;
      });
    },
    dispose() { layer.remove(); },
  };
}
