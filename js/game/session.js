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
//
// M2a: also reads (never advances) the optional `flow` module for the HUD/mastery/score, evaluates
// mastery tiers and records time trials at `zip:finished`, and offers `[G]` time trials from a
// completed route's revisited start banner. `flow` advancing itself (js/game/flow.js#update) is
// js/main.js's job, alongside vitals – this module only resets the running average per attempt and
// reads the live value, exactly like it only *reads* `ticket`.
import { t, formatTime } from "../core/i18n.js";
import { nextGateCategory } from "../core/save.js";
import { TICKET, TRIALS } from "../config.js";
import { createRouteRun, routesFromPark } from "./route.js";
import { createRouteHud } from "../ui/hud-route.js";
import { evaluateMastery } from "./mastery.js";
import { computeFlowScore } from "./flow.js";

const SESSION = Object.freeze({
  bannerRange: 6,            // metres from an entry deck within which the start banner shows
  tipSeconds: 6,
  trialArmedSeconds: 3,
});

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * @param {{ player, course, parkDef, events, hud, save, root: HTMLElement,
 *   ticket?, input?, stampCard?, flow? }} o
 * @returns {{ run, day: object, beginDay(): void, update(dt): void, dispose(): void }}
 */
export function createSession({ player, course, parkDef, events, hud, save, root, ticket = null, input = null, stampCard = null, flow = null }) {
  const runs = new Map(routesFromPark(parkDef).map((def) => [def.id, createRouteRun(def)]));
  const routeHud = createRouteHud(root);

  let shown = runs.get(course.routes[0].id);   // header defaults to the primary (blue-1) route
  routeHud.setRoute(shown);

  let tipShown = false;
  let bannerShown = false;
  const offs = [];
  const on = (name, fn) => offs.push(events.on(name, fn));

  // --- day stats (M1.5) – reset by beginDay() at ticket desk confirm / resume, read by the stamp card ---
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
    // `runs.get(nearest.id)` is normally guaranteed (this module is always built from the same parkDef
    // as `course`) – the fallback only matters the instant M3's builder rebuilds `course` around an
    // edited/new route before rebuilding this module too (js/main.js#applyParkDef does both together,
    // so it is defence in depth, never the expected path): keep showing whatever was already shown
    // rather than handing the HUD an `undefined` run.
    return nearest ? (runs.get(nearest.id) || shown) : shown;
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
    if (run && (run.state === "idle" || run.state === "armed")) {
      run.beginCountdown();
      if (flow) flow.resetRun();   // M2a: the flow average (mastery's "in flow" tier, the score) is per attempt
    }
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
      // M2b transfer station (GDD §3.6): a black route can cross two zip obstacles – the transfer leg,
      // then the real arrival. Only the one that actually finishes every obstacle ends the run; an
      // intermediate leg still counts towards `progress`/`day.obstaclesTotal` like any other obstacle,
      // it just does not trigger the completion ceremony below. For every other route the zip is always
      // the *last* obstacle anyway (a one-way course), so `progress === total` here exactly as before.
      if (run.progress < run.total) continue;
      const summary = run.finish();
      const isBest = save.recordRun(summary.routeId, summary);
      // M2a: mastery (GDD §3.12) is evaluated once, right here, from this run's own numbers plus the
      // flow module's running average since it was last reset (the ladder-climb handler above).
      const averageFlow = flow ? flow.averageThisRun : 1;
      const tiers = evaluateMastery({ falls: summary.falls, seconds: summary.seconds, parS: run.def.parS, averageFlow });
      const mastery = save.recordMastery(summary.routeId, tiers);
      const flowScore = computeFlowScore(summary.progress, averageFlow);
      const isBestTrial = summary.isTrial ? save.recordTrial(summary.routeId, summary.seconds) : false;
      if (flow) flow.resetRun();
      day.routes.push({
        category: run.def.category, numeral: run.def.numeral, nameKey: run.def.nameKey,
        seconds: summary.seconds, falls: summary.falls, isTrial: summary.isTrial, mastery, flowScore,
      });
      const name = t(run.def.nameKey);
      let line;
      if (summary.isTrial) {
        line = t("notice.trialDone", { name, time: formatTime(summary.seconds) });
        if (isBestTrial) line += ` · ${t("notice.trialNewBest", { time: formatTime(summary.seconds) })}`;
      } else {
        line = t("notice.routeDone", { name, time: formatTime(summary.seconds), falls: summary.falls });
        if (isBest) line += ` · ${t("notice.newBest", { time: formatTime(summary.seconds) })}`;
      }
      // Category gate (GDD §3.12): completing any route of one colour opens the next – one combined
      // notice, never two competing ones on the same frame (setNotice replaces, it does not queue).
      const unlocked = nextGateCategory(run.def.category);
      if (unlocked && save.unlockCategory(unlocked)) line += ` · ${t(`notice.unlocked${capitalize(unlocked)}`)}`;
      // M2a: the legendary finale is the one gate that is not "any route of the previous colour" –
      // GDD §3.12 wants *every* black route done first, so this checks the actual black run set
      // instead of going through nextGateCategory (which stops at black → null, on purpose).
      if (run.def.category === "black" && runs.has("legendary") && !save.isUnlocked("legendary")) {
        const blackIds = Array.from(runs.values()).filter((r) => r.def.category === "black").map((r) => r.def.id);
        const allBlackDone = blackIds.every((id) => save.data.routes[id] && save.data.routes[id].completions > 0);
        if (allBlackDone && save.unlockCategory("legendary")) line += ` · ${t("notice.unlockedLegendary")}`;
      }
      // Ticket end note (M1.5): finishing a route with no time left goes straight to the day-end
      // sequence instead of just a toast – "OR after completing a route when no ticket time left".
      if (ticket && ticket.expired) { beginDayEnd(); }
      else hud.setNotice(line, 8);
      events.emit("route:completed", { ...summary, category: run.def.category, isBest, maxKmh, mastery, flowScore });
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
    /** Ticket desk confirm / resume (js/main.js): fresh day stats, the ticket HUD box comes back. */
    beginDay() {
      day.routes = []; day.obstaclesTotal = 0; day.maxZipKmh = 0; day.rescues = 0;
      warnedShown = false; dayEnding = false; dayGrace = 0; dayOver = false;
    },
    /** Debug/test shortcut (`WIPFEL.debug.endTicket`): skip the extend-grace window straight to the stamp card. */
    forceDayEnd() { if (!dayOver) endDay(); },
    /**
     * Classic-mode accident (M2b, GDD §3.5): whichever run was counting down or riding when both
     * carabiners came open at once ends there and then – no completion, no partial credit, back to
     * "idle" so the same route can be attempted again fresh. `js/main.js` calls this once the fall has
     * landed (`player:accident-landed`), right before showing the accident report.
     */
    abandonActiveRun() {
      for (const run of runs.values()) {
        if (run.state === "running" || run.state === "countdown") { run.recordFall(); run.reset(); }
      }
    },
    update(dt) {
      for (const run of runs.values()) run.update(dt);
      const active = activeRun();
      if (active !== shown) { shown = active; routeHud.setRoute(shown); bannerShown = false; }
      routeHud.setCountdown(shown.countdownStep);
      routeHud.refresh(shown, save.routeBest(shown.def.id));
      routeHud.update();
      if (flow) routeHud.setFlow(flow.value, save.hasCompletedAnyRoute());
      // Start banner: idle/armed near the shown route's entry deck (a fresh attempt), or – M2a – a
      // *finished* route revisited once it has a best time, offering a time trial instead of START.
      const route = course.routeFor(shown.def.id);
      const nearDeck = route && player.position.distanceTo(route.entryDeck.clipAnchor) <= SESSION.bannerRange;
      const best = save.routeBest(shown.def.id);
      const canTrial = best != null && (shown.state === "idle" || shown.state === "armed" || shown.state === "done");
      const wantBanner = nearDeck && (shown.state === "idle" || shown.state === "armed" || (shown.state === "done" && canTrial));
      if (wantBanner && !bannerShown) {
        const locked = !save.isUnlocked(shown.def.category);
        routeHud.showBanner(shown.def, best, locked, { canTrial: canTrial && !locked, mastery: save.masteryOf(shown.def.id) });
        bannerShown = true;
        if (!locked && shown.state !== "done") shown.arm();   // a locked/finished route stays as it is
      } else if (!wantBanner && bannerShown) {
        routeHud.hideBanner();
        bannerShown = false;
      }
      // M2a time trials: `[G]` at a revisited, previously-completed banner re-arms the very same run
      // (js/game/route.js#markTrial handles the done→idle transition) for a timed re-attempt.
      if (bannerShown && input && input.pressed(TRIALS.inputAction) && canTrial && save.isUnlocked(shown.def.category)) {
        shown.markTrial();
        hud.setNotice(t("notice.trialArmed"), SESSION.trialArmedSeconds);
      }

      if (!ticket) return;
      // Season pass (M2a): open-ended tickets never show the countdown box – there is nothing counting.
      routeHud.setTicket(ticket.started && !dayOver && !ticket.isOpenEnded ? ticket.remainingGameMinutes : null);
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
