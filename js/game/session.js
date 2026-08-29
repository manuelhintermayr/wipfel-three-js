// Glues every route run to the world: listens to gameplay events, drives the route HUD (header,
// banner, countdown, safety tip), stores best times. main.js stays thin; route logic stays pure.
//
// One `createRouteRun` per route in the park (js/game/route.js#routesFromPark), all updated every
// frame; the HUD follows whichever route the player has committed to (counting down or riding), and
// otherwise the nearest entry deck. Any obstacle/ladder/fall event is broadcast to every run – each
// run's own `completeObstacle` already ignores ids it does not own and states it is not running in,
// so at most one run ever actually advances.
import { t, formatTime } from "../core/i18n.js";
import { nextGateCategory } from "../core/save.js";
import { createRouteRun, routesFromPark } from "./route.js";
import { createRouteHud } from "../ui/hud-route.js";

const SESSION = Object.freeze({
  bannerRange: 6,            // metres from an entry deck within which the start banner shows
  tipSeconds: 6,
});

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * @param {{ player, course, parkDef, events, hud, save, root: HTMLElement }} o
 * @returns {{ run, update(dt): void, dispose(): void }}
 */
export function createSession({ player, course, parkDef, events, hud, save, root }) {
  const runs = new Map(routesFromPark(parkDef).map((def) => [def.id, createRouteRun(def)]));
  const routeHud = createRouteHud(root);

  let shown = runs.get(course.routes[0].id);   // header defaults to the primary (blue-1) route
  routeHud.setRoute(shown);

  let tipShown = false;
  let bannerShown = false;
  const offs = [];
  const on = (name, fn) => offs.push(events.on(name, fn));

  /** Whichever route the player has committed to (counting down / riding), else the nearest deck. */
  function activeRun() {
    for (const run of runs.values()) if (run.state === "countdown" || run.state === "running") return run;
    let nearest = null, nearestD = SESSION.bannerRange;
    for (const route of course.routes) {
      const d = player.position.distanceTo(route.entryDeck.clipAnchor);
      if (d <= nearestD) { nearest = route; nearestD = d; }
    }
    return nearest ? runs.get(nearest.id) : shown;   // nothing nearby: keep showing the last route
  }

  // The run arms at its deck, counts down while climbing that route's ladder, and the timer starts at GO.
  on("player:interact", ({ what, anchorId }) => {
    if (what !== "ladder") return;
    const route = course.routes.find((r) => r.ladderAnchorId === anchorId);
    // Defence in depth: js/player/interaction.js already refuses to clip a locked route's entry
    // anchor, so belay.currentAnchor() can never legitimately be here – but a run must never start
    // for a category the save says is still locked.
    if (!route || !save.isUnlocked(route.category)) return;
    const run = runs.get(route.id);
    if (run && (run.state === "idle" || run.state === "armed")) run.beginCountdown();
  });
  on("belay:click", () => {
    if (!tipShown) { tipShown = true; routeHud.showSafetyTip(SESSION.tipSeconds); }
  });
  on("player:ladder-exit", ({ progress }) => {
    if (progress >= 1) for (const run of runs.values()) run.completeObstacle("ladder");
  });
  on("player:element-exit", ({ element, completed }) => {
    if (completed) for (const run of runs.values()) run.completeObstacle(element);
  });
  on("player:fell", () => {
    for (const run of runs.values()) if (run.state === "running" || run.state === "countdown") run.recordFall();
  });
  on("zip:finished", ({ element, maxKmh }) => {
    for (const run of runs.values()) {
      if (!run.completeObstacle(element)) continue;
      const summary = run.finish();
      const isBest = save.recordRun(summary.routeId, summary);
      const name = t(run.def.nameKey);
      let line = t("notice.routeDone", { name, time: formatTime(summary.seconds), falls: summary.falls });
      if (isBest) line += ` · ${t("notice.newBest", { time: formatTime(summary.seconds) })}`;
      // Category gate (GDD §3.12): completing any route of one colour opens the next – one combined
      // notice, never two competing ones on the same frame (setNotice replaces, it does not queue).
      const unlocked = nextGateCategory(run.def.category);
      if (unlocked && save.unlockCategory(unlocked)) line += ` · ${t(`notice.unlocked${capitalize(unlocked)}`)}`;
      hud.setNotice(line, 8);
      events.emit("route:completed", { ...summary, category: run.def.category, isBest, maxKmh });
    }
  });

  return {
    get run() { return shown; },
    update(dt) {
      for (const run of runs.values()) run.update(dt);
      const active = activeRun();
      if (active !== shown) { shown = active; routeHud.setRoute(shown); bannerShown = false; }
      routeHud.setCountdown(shown.countdownStep);
      routeHud.refresh(shown, save.routeBest(shown.def.id));
      routeHud.update();
      // Start banner: visible while idle/armed near the shown route's entry deck, gone once it begins.
      const route = course.routeFor(shown.def.id);
      const nearDeck = route && player.position.distanceTo(route.entryDeck.clipAnchor) <= SESSION.bannerRange;
      const wantBanner = nearDeck && (shown.state === "idle" || shown.state === "armed");
      if (wantBanner && !bannerShown) {
        const locked = !save.isUnlocked(shown.def.category);
        routeHud.showBanner(shown.def, save.routeBest(shown.def.id), locked);
        bannerShown = true;
        if (!locked) shown.arm();   // a locked route stays idle – there is nothing to arm towards
      } else if (!wantBanner && bannerShown) {
        routeHud.hideBanner();
        bannerShown = false;
      }
    },
    dispose() {
      for (const off of offs) off();
      routeHud.dispose();
    },
  };
}
