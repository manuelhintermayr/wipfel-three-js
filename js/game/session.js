// Glues every route run to the world: listens to gameplay events, drives the route HUD (header,
// banner, countdown, safety tip), stores best times. main.js stays thin; route logic stays pure.
//
// One `createRouteRun` per route in the park (js/game/route.js#routesFromPark), all updated every
// frame; the HUD follows whichever route the player has committed to (counting down or riding), and
// otherwise the nearest entry deck. Any obstacle/ladder/fall event is broadcast to every run – each
// run's own `completeObstacle` already ignores ids it does not own and states it is not running in,
// so at most one run ever actually advances.
//
// M1.5: also the ticket clock's day-end sequence. `js/game/ticket.js` is a pure, callback-free clock;
// this module polls it once a frame, does its own edge detection (same style as `bannerShown` below)
// and owns the `day` stats (routes completed, obstacles crossed, rescues, top zip speed) the stamp
// card reads. Passing `ticket`/`input`/`stampCard` is optional – omit them and the ticket HUD/day-end
// sequence simply never runs (older tests, dev harnesses).
import { t, formatTime } from "../core/i18n.js";
import { nextGateCategory } from "../core/save.js";
import { TICKET } from "../config.js";
import { createRouteRun, routesFromPark } from "./route.js";
import { createRouteHud } from "../ui/hud-route.js";

const SESSION = Object.freeze({
  bannerRange: 6,            // metres from an entry deck within which the start banner shows
  tipSeconds: 6,
});

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * @param {{ player, course, parkDef, events, hud, save, root: HTMLElement,
 *   ticket?, input?, stampCard? }} o
 * @returns {{ run, day: object, beginDay(): void, update(dt): void, dispose(): void }}
 */
export function createSession({ player, course, parkDef, events, hud, save, root, ticket = null, input = null, stampCard = null }) {
  const runs = new Map(routesFromPark(parkDef).map((def) => [def.id, createRouteRun(def)]));
  const routeHud = createRouteHud(root);

  let shown = runs.get(course.routes[0].id);   // header defaults to the primary (blue-1) route
  routeHud.setRoute(shown);

  let tipShown = false;
  let bannerShown = false;
  const offs = [];
  const on = (name, fn) => offs.push(events.on(name, fn));

  // --- day stats (M1.5) – reset by beginDay() at kassa confirm / resume, read by the stamp card ---
  const day = { routes: [], obstaclesTotal: 0, maxZipKmh: 0, rescues: 0 };
  let warnedShown = false;    // "30 min left" toast – once per day
  let dayEnding = false;      // grace window open: extend with [E], or fall through to the stamp card
  let dayGrace = 0;
  let dayOver = false;        // stamp card is up (or about to be) – the ticket HUD box hides
  on("player:rescued", () => { day.rescues += 1; });

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
    if (progress < 1) return;
    for (const run of runs.values()) if (run.completeObstacle("ladder")) day.obstaclesTotal += 1;
  });
  on("player:element-exit", ({ element, completed }) => {
    if (!completed) return;
    for (const run of runs.values()) if (run.completeObstacle(element)) day.obstaclesTotal += 1;
  });
  on("player:fell", () => {
    for (const run of runs.values()) if (run.state === "running" || run.state === "countdown") run.recordFall();
  });
  on("zip:finished", ({ element, maxKmh }) => {
    for (const run of runs.values()) {
      if (!run.completeObstacle(element)) continue;
      day.obstaclesTotal += 1;
      day.maxZipKmh = Math.max(day.maxZipKmh, maxKmh);
      const summary = run.finish();
      const isBest = save.recordRun(summary.routeId, summary);
      day.routes.push({ category: run.def.category, numeral: run.def.numeral, nameKey: run.def.nameKey, seconds: summary.seconds, falls: summary.falls });
      const name = t(run.def.nameKey);
      let line = t("notice.routeDone", { name, time: formatTime(summary.seconds), falls: summary.falls });
      if (isBest) line += ` · ${t("notice.newBest", { time: formatTime(summary.seconds) })}`;
      // Category gate (GDD §3.12): completing any route of one colour opens the next – one combined
      // notice, never two competing ones on the same frame (setNotice replaces, it does not queue).
      const unlocked = nextGateCategory(run.def.category);
      if (unlocked && save.unlockCategory(unlocked)) line += ` · ${t(`notice.unlocked${capitalize(unlocked)}`)}`;
      // Ticket end note (M1.5): finishing a route with no time left goes straight to the day-end
      // sequence instead of just a toast – "OR after completing a route when no ticket time left".
      if (ticket && ticket.expired) { beginDayEnd(); }
      else hud.setNotice(line, 8);
      events.emit("route:completed", { ...summary, category: run.def.category, isBest, maxKmh });
    }
  });

  /** Ticket expired (mid-route or just now): offer +30 min, else fall through to the stamp card. */
  function beginDayEnd() {
    if (!ticket || dayEnding || dayOver) return;
    dayEnding = true;
    dayGrace = TICKET.extendPromptSeconds;
    hud.setNotice(
      ticket.extensionsLeft > 0
        ? t("notice.ticketExpiredExtend", { left: ticket.extensionsLeft })
        : t("notice.ticketExpiredEnd"),
      TICKET.extendPromptSeconds,
    );
  }

  /** Grace window ran out (or was never offered): show the stamp card, the ticket HUD box hides. */
  function endDay() {
    dayEnding = false;
    dayOver = true;
    if (stampCard) stampCard.show({ routes: day.routes.slice(), obstaclesTotal: day.obstaclesTotal, maxZipKmh: day.maxZipKmh, rescues: day.rescues });
  }

  return {
    get run() { return shown; },
    /** Today's stamp-card stats – read-only, js/ui/stamp-card.js gets its own copy via endDay(). */
    get day() { return day; },
    /** Kassa confirm / resume (js/main.js): fresh day stats, the ticket HUD box comes back. */
    beginDay() {
      day.routes = []; day.obstaclesTotal = 0; day.maxZipKmh = 0; day.rescues = 0;
      warnedShown = false; dayEnding = false; dayGrace = 0; dayOver = false;
    },
    /** Debug/test shortcut (`WIPFEL.debug.endTicket`): skip the extend-grace window straight to the stamp card. */
    forceDayEnd() { if (!dayOver) endDay(); },
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

      if (!ticket) return;
      routeHud.setTicket(ticket.started && !dayOver ? ticket.remainingGameMinutes : null);
      if (dayOver) return;
      if (dayEnding) {
        if (input && input.pressed("interact") && ticket.extensionsLeft > 0) {
          ticket.extend();
          dayEnding = false;
          hud.setNotice(t("notice.ticketExtended", { minutes: Math.round(ticket.remainingGameMinutes) }), 5);
        } else if ((dayGrace -= dt) <= 0) {
          endDay();
        }
        return;
      }
      if (ticket.expired) { beginDayEnd(); return; }
      if (!warnedShown && ticket.started && ticket.remainingGameMinutes <= TICKET.warnMinutes) {
        warnedShown = true;
        hud.setNotice(t("notice.ticketWarning", { minutes: Math.round(ticket.remainingGameMinutes) }), 6);
      }
    },
    dispose() {
      for (const off of offs) off();
      routeHud.dispose();
    },
  };
}
