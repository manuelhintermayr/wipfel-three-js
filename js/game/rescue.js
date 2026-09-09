// Rescuer role (ROADMAP M3b, GDD §4 "rescuer: guest in panic, 10 game-minute timer", RESEARCH-DATA §7
// "every station reachable by a rescuer within ≤ 10 min" – the IAPA rule, borrowed here as the timer
// itself rather than a coverage guarantee, which is the builder's own inspector concern instead
// (js/builder/builder-metrics.js#rescueCoverage). A small state machine glued onto the *existing*
// climbing controls: there is no special "rescuer" player state (js/player/controller.js is untouched)
// – reaching the panicked guest is just normal walking/climbing/belaying, the same "reuse ordinary
// play instead of inventing a second camera or movement model" idea js/builder/builder.js's own
// walkthrough already leans on, just with nothing to switch away from here (the player is already in
// normal first/third-person play the whole time a rescue runs).
//
// idle → pending (js/npc/agents.js emitted "npc:panic", nobody has claimed it yet – a toast + the
// course map's own red marker, js/ui/course-map.js reads `agent.fear` directly) → active (claimed at a
// rescuer post, the timer is running) → talkdown (reached the guest, a fixed 3 s breathing beat – the
// outcome is already decided the moment this starts) → back to idle. Exactly one panic is ever open at
// once (js/npc/agents.js's own `panicked` guard), so this machine never juggles more than one.
import { t, formatTime } from "../core/i18n.js";
import { RESCUE } from "../config.js";
import { TIME } from "../config.js";

const TIMER_REAL_SECONDS = RESCUE.timerGameMinutes * TIME.gameHourMinutes;

/**
 * @param {{ player, input, events, hud, terrain, root: HTMLElement,
 *   getParkDef: () => object, getAgents: () => object|null, isBuilderOpen?: () => boolean,
 *   autoplay?: boolean, onResolved?: (success: boolean) => void }} options
 *   `onResolved` (optional): js/main.js wires this to js/game/economy.js's rating update – this module
 *   only runs the state machine and its own small HUD, it never touches cash/rating itself.
 * @returns {{ state: string, isTarget(elementId): boolean, update(dt: number): void,
 *   forcePanic(): object|null, dispose(): void }}
 */
export function createRescue({ player, input, events, hud, terrain, root = null, getParkDef, getAgents, isBuilderOpen = () => false, autoplay = false, onResolved = null }) {
  let state = "idle";       // idle | pending | active | talkdown
  let guestId = null, elementId = null;
  let timeLeft = 0, talkdownLeft = 0;

  // `root` is optional and DOM-only – tests/unit/rescue.test.mjs exercises the state machine itself
  // under plain `node --test` (no `document`), the same reason js/game/ticket.js stays DOM-free; the
  // real game always passes a root (js/main.js), so the HUD panel is never actually skipped in play.
  const panel = root ? document.createElement("div") : null;
  if (panel) {
    panel.className = "rescue-panel";
    panel.hidden = true;
    root.appendChild(panel);
  }

  function targetAgent() {
    const agents = getAgents();
    return agents ? agents.list.find((a) => a.id === guestId) || null : null;
  }

  function nearAnyPost() {
    const parkDef = getParkDef();
    const posts = parkDef && parkDef.rescuePosts;
    if (!posts || !posts.length) return false;
    for (const post of posts) {
      const y = terrain.heightAt(post.x, post.z);
      const d = Math.hypot(player.position.x - post.x, player.position.y - y, player.position.z - post.z);
      if (d <= RESCUE.postInteractRange) return true;
    }
    return false;
  }

  /** Standing close enough to the frozen guest, on the very element they are stuck on, to talk them down. */
  function canTalkDown() {
    if (player.mode !== "element") return false;
    const onElement = player.states.get("element");
    if (!onElement || !onElement.element || onElement.element.id !== elementId) return false;
    const agent = targetAgent();
    if (!agent) return false;
    return Math.hypot(player.position.x - agent.pos.x, player.position.y - agent.pos.y, player.position.z - agent.pos.z) <= RESCUE.talkdownRange;
  }

  function reset() {
    state = "idle"; guestId = null; elementId = null; timeLeft = 0; talkdownLeft = 0;
  }

  function resolve(success) {
    const agents = getAgents();
    if (agents) agents.resolvePanic(guestId, { success });
    hud.setNotice(success ? t("rescue.success") : t("rescue.failure"), 5);
    if (onResolved) onResolved(success);
    reset();
    render();
  }

  function beginActive() {
    state = "active";
    timeLeft = TIMER_REAL_SECONDS;
  }

  function beginTalkdown() {
    state = "talkdown";
    talkdownLeft = RESCUE.talkdownSeconds;
  }

  function render() {
    if (!panel) return;
    if (state === "idle") { panel.hidden = true; return; }
    if (state === "pending") {
      const show = nearAnyPost();
      panel.hidden = !show;
      if (show) panel.textContent = t("rescue.startPrompt");
      return;
    }
    panel.hidden = false;
    if (state === "active") {
      panel.textContent = canTalkDown()
        ? t("rescue.talkdownPrompt")
        : t("rescue.timerLabel", { time: formatTime(Math.max(0, timeLeft)) });
      return;
    }
    if (state === "talkdown") {
      panel.textContent = t("rescue.breathing", { seconds: Math.max(0, talkdownLeft).toFixed(1) });
    }
  }

  const offPanic = events.on("npc:panic", (payload) => {
    if (autoplay || state !== "idle") return;
    state = "pending";
    guestId = payload.guestId;
    elementId = payload.elementId;
    hud.setNotice(t("rescue.panicToast"), 6);
    render();
  });

  return {
    get state() { return state; },
    /** Real seconds left on the active rescue timer, or 0 outside "active" – tests/unit/rescue.test.mjs
     *  and, if ever needed, a numeric HUD readout. */
    get remainingSeconds() { return state === "active" ? Math.max(0, timeLeft) : 0; },
    get talkdownSecondsLeft() { return state === "talkdown" ? Math.max(0, talkdownLeft) : 0; },
    /** js/player/interaction.js: is `elementId` the one active/talked-down rescue currently targets? */
    isTarget(id) { return (state === "active" || state === "talkdown") && id === elementId; },

    update(dt) {
      if (autoplay || isBuilderOpen() || state === "idle") return;
      if (state === "pending") {
        if (nearAnyPost() && input.pressed("interact")) beginActive();
        render();
        return;
      }
      if (state === "active") {
        timeLeft -= dt;
        if (timeLeft <= 0) { resolve(false); return; }
        if (canTalkDown() && input.pressed("interact")) { beginTalkdown(); render(); return; }
        render();
        return;
      }
      if (state === "talkdown") {
        talkdownLeft -= dt;
        if (talkdownLeft <= 0) { resolve(true); return; }
        render();
      }
    },

    /** `WIPFEL.debug.forcePanic()`: panics a guest AND claims the rescue immediately, so the timer HUD
     *  is on screen for a screenshot without first walking to a post. */
    forcePanic() {
      const agents = getAgents();
      if (!agents || state !== "idle") return null;
      const panic = agents.debugForcePanic();
      if (!panic) return null;
      guestId = panic.guestId;
      elementId = panic.elementId;
      beginActive();
      render();
      return panic;
    },

    dispose() { offPanic(); if (panel) panel.remove(); },
  };
}
