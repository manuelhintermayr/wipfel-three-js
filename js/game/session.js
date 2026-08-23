// Glues one route run to the world: listens to gameplay events, drives the route HUD (header,
// banner, countdown, safety tip), stores best times. main.js stays thin; route logic stays pure.
import { t, formatTime } from "../core/i18n.js";
import { createRouteRun, BLUE_I } from "./route.js";
import { createRouteHud } from "../ui/hud-route.js";

const SESSION = Object.freeze({
  bannerRange: 5,            // metres from the entry deck within which the start banner shows
  tipSeconds: 6,
});

/**
 * @param {{ player, course, events, hud, save, root: HTMLElement }} o
 * @returns {{ run, update(dt): void, dispose(): void }}
 */
export function createSession({ player, course, events, hud, save, root }) {
  const run = createRouteRun(BLUE_I);
  const routeHud = createRouteHud(root);
  routeHud.setRoute(run);

  let tipShown = false;
  let bannerShown = false;
  const offs = [];
  const on = (name, fn) => offs.push(events.on(name, fn));

  // The run arms at the deck, counts down while climbing the ladder, and the timer starts at GO.
  on("player:interact", ({ what }) => {
    if (what === "ladder" && (run.state === "idle" || run.state === "armed")) run.beginCountdown();
  });
  on("belay:click", () => {
    if (!tipShown) { tipShown = true; routeHud.showSafetyTip(SESSION.tipSeconds); }
  });
  on("player:ladder-exit", ({ progress }) => {
    if (progress >= 1) run.completeObstacle("ladder");
  });
  on("player:element-exit", ({ element, completed }) => {
    if (completed) run.completeObstacle(element);
  });
  on("player:fell", () => run.recordFall());
  on("zip:finished", ({ element, maxKmh }) => {
    run.completeObstacle(element);
    const summary = run.finish();
    const isBest = save.recordRun(summary.routeId, summary);
    const name = t(run.def.nameKey);
    const line = t("notice.routeDone", { name, time: formatTime(summary.seconds), falls: summary.falls });
    hud.setNotice(isBest ? `${line} · ${t("notice.newBest", { time: formatTime(summary.seconds) })}` : line, 8);
    events.emit("route:completed", { ...summary, isBest, maxKmh });
  });

  return {
    run,
    update(dt) {
      run.update(dt);
      routeHud.setCountdown(run.countdownStep);
      routeHud.refresh(run, save.routeBest(run.def.id));
      routeHud.update();
      // Start banner: visible while idle/armed near the entry deck, gone once the run begins.
      const nearDeck = player.position.distanceTo(course.entryDeck.clipAnchor) <= SESSION.bannerRange;
      const wantBanner = nearDeck && (run.state === "idle" || run.state === "armed");
      if (wantBanner && !bannerShown) {
        routeHud.showBanner(run.def, save.routeBest(run.def.id));
        bannerShown = true;
        run.arm();
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
