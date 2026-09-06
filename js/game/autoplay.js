// ?autoplay=1 – a prompt-driven bot that plays the first course end to end: walk to the entry
// deck, clip (F,F), climb (E,W), re-clip and cross every element (F,F,E,W+Q), ride the Flying Fox
// (F,F,E,Space, legs up). It reads the same context prompt the player sees, so it exercises the
// real interaction rules; smoke tests assert on `window.WIPFEL.autoplay.state`.
import * as THREE from "three";

const BOT = Object.freeze({
  walkYawLerp: 9.0,
  arriveRange: 1.0,          // 2-D metres to the current goal
  stuckSeconds: 4,           // no progress for this long → note it and re-aim
});

/**
 * @param {{ player, course, interaction, input, events, belay?, session?, kassa?, briefing?, route? }} o –
 *   `input` is the real Input; the bot presses synthetic keyboard events on `window` so remapping
 *   still applies. `kassa`/`briefing` (M1.3) are fast-forwarded once, on the very first update, via
 *   their bot hooks – no fragile DOM clicking or scripted walk-to-the-practice-stand navigation.
 *   `route` (M3a, `?builder=1&autowalk=<id>`): walk this specific route object (js/park/loader.js's
 *   per-route shape – `ladderAnchorId`/`ladder`/`elements`/`entryDeck`, same field names `course` itself
 *   exposes at the top level for route "blue-1") instead of the course-level legacy surface – omit it
 *   and the bot keeps walking blue-1 exactly as it always has.
 * @returns {{ state: string, log: string[], update(dt): void, dispose(): void }}
 */
export function createAutoplay({ player, course, interaction, events, belay = null, session = null, kassa = null, briefing = null, route = null }) {
  const routeCtx = route || course;
  const belayAnchor = () => (belay ? belay.currentAnchor() : null);
  const done = (id) => (session ? session.run.completedIds.includes(id) : false);
  /** The next thing on the route: the ladder, then each unfinished element in route order. */
  function nextStep() {
    if (!done("ladder")) return { anchorId: routeCtx.ladderAnchorId, walkTo: routeCtx.ladder.rail.start, elementId: null };
    for (const element of routeCtx.elements) {
      if (done(element.id)) continue;
      const entry = element.getEntryAnchor();
      return { anchorId: element.lifeline.anchorId, walkTo: entry.stand || entry.position, elementId: element.id };
    }
    return { anchorId: null, walkTo: routeCtx.ladder.rail.start, elementId: null };
  }
  const log = [];
  let state = "walk-to-deck";
  let held = new Set();
  let cooldown = 0;
  let stuckTimer = 0;
  let lastPos = new THREE.Vector3().copy(player.position);
  const target = new THREE.Vector3();
  // Approach the deck through the free lane: in front of the step, then onto the deck. The lane
  // runs on the deck's local +X half (the bench parks on -X); see js/park/entry-deck.js.
  const deckGroup = routeCtx.entryDeck.group;
  const deckPoint = (x, z) => new THREE.Vector3(x, 0, z).applyEuler(deckGroup.rotation).add(deckGroup.position);
  // The smoke bot's subject is the route (ritual, ladder, elements, fall, zip), not open-ground
  // steering: it starts on the entry deck (documented shortcut; the approach walk is verified
  // manually – see HANDOVER). Everything from the first clip onwards is played for real.
  const onDeck = deckPoint(0.55, 0.1);
  player.teleport(onDeck.x, routeCtx.entryDeck.top + 0.05, onDeck.z);
  note("shortcut: started on the entry deck");
  let stuckCount = 0;
  let sidestepUntil = 0;
  let sidestepKey = "KeyD";
  let bootstrapped = false;   // kassa + briefing fast-forwarded once, on the first update()
  const offs = [];
  offs.push(events.on("route:completed", (s) => {
    state = "done";
    releaseAll();
    note(`route completed in ${s.seconds.toFixed(2)} s · falls ${s.falls} · best ${s.isBest}`);
  }));
  offs.push(events.on("player:fell", () => note("fell into the harness")));

  function note(text) { log.push(text); }
  function key(code, type) { window.dispatchEvent(new KeyboardEvent(type, { code })); }
  function press(code) { key(code, "keydown"); key(code, "keyup"); }
  function hold(code) { if (!held.has(code)) { held.add(code); key(code, "keydown"); } }
  function release(code) { if (held.has(code)) { held.delete(code); key(code, "keyup"); } }
  function releaseAll() { for (const code of Array.from(held)) release(code); }

  /** Aim the camera (and therefore W) at a world position. */
  function steerToward(pos, dt) {
    const cam = player.camera;
    const wanted = Math.atan2(pos.x - player.position.x, pos.z - player.position.z);
    let d = wanted - cam.yaw;
    d -= Math.PI * 2 * Math.floor((d + Math.PI) / (Math.PI * 2));
    cam.yaw += d * Math.min(1, BOT.walkYawLerp * dt);
    cam.pitch = -0.12;
  }

  function act(dt) {
    const prompt = interaction.prompt || "";
    const mode = player.mode;
    if (cooldown > 0) { cooldown -= dt; return; }

    if (mode === "ground") {
      if (sidestepUntil > 0) {
        sidestepUntil -= dt;
        hold("KeyW"); hold(sidestepKey);
        if (sidestepUntil <= 0) { release(sidestepKey); }
        return;
      }
      const step = nextStep();
      const offered = interaction.anchor ? interaction.anchor.id : null;
      // nextStep() already returns the ladder's own anchor id (routeCtx.ladderAnchorId) until the
      // ladder is done, so the wanted clip target is always just step.anchorId – no route-specific
      // literal here, unlike the old single-route "deck" id.
      const wantedClip = step.anchorId;
      // F only towards the anchor the route needs next – never back onto a finished element's cable
      if (prompt.includes("[F]") && offered && (offered === wantedClip || belay.pendingAnchor() === offered)) {
        press("KeyF"); cooldown = 0.45; return;
      }
      // E only onto the element the route needs next (or the ladder, which has no entry object)
      const entry = interaction.entry;
      const entryOk = !entry || (entry.element && entry.element.id === step.elementId);
      if (prompt.includes("[E]") && entryOk) { releaseAll(); press("KeyE"); cooldown = 0.6; return; }
      // otherwise walk towards the step's stand (or the deck stub before the first clip)
      target.copy(belayAnchor() == null ? routeCtx.entryDeck.clipAnchor : step.walkTo);
      const flat = Math.hypot(target.x - player.position.x, target.z - player.position.z);
      steerToward(target, dt);
      if (flat <= BOT.arriveRange) release("KeyW"); else hold("KeyW");
      return;
    }
    release("KeyW");
    stuckCount = 0;                                  // a non-ground mode is real progress
    if (mode === "ladder") { hold("KeyW"); return; }
    if (mode === "element") {
      hold("KeyQ");
      const state = player.states.get("element");
      const stepwise = !!(state && state.element && state.element.discrete === true);
      if (stepwise) {
        // one press = one step (plank, stirrup, ring, …) plus its swing pause – holding W does nothing
        if (cooldown <= 0) { press("KeyW"); cooldown = 0.75; }
      } else {
        hold("KeyW");
      }
      return;
    }
    if (mode === "zipline") {
      hold("Space");   // held Space is the whole ride: push off (down after the sit delay), tuck, legs up
      return;
    }
    if (mode === "tarzan") {
      // waiting for the rope: press when the prompt is asking for it, then climb once caught
      if (prompt.includes("[Space]")) { press("Space"); cooldown = 0.2; return; }
      hold("KeyW");
      return;
    }
    // Pull up (Space) only works close enough under the element (js/player/fall.js#underElement) – a
    // fall that settles mid-span otherwise has no way out from Space alone (confirmed live: the bot can
    // hang at the exact same swing position for minutes). Hold W too: it's a no-op unless pulling up is
    // unavailable, in which case it hauls the carabiner along the cable towards a platform instead
    // (`fall.js`'s own second, always-available way out) – one of the two always resolves.
    if (mode === "fall") { hold("Space"); hold("KeyW"); return; }
  }

  return {
    get state() { return state; },
    log,
    update(dt) {
      if (!bootstrapped) {
        bootstrapped = true;
        if (kassa) kassa.confirmDefaults();
        if (briefing) briefing.completeForBot();
        note("bootstrap: kassa + briefing fast-forwarded");
      }
      if (state === "done") return;
      // stuck watchdog: the bot must always be making progress somewhere
      if (player.position.distanceTo(lastPos) > 0.15) { lastPos.copy(player.position); stuckTimer = 0; }
      else if ((stuckTimer += dt) > BOT.stuckSeconds) {
        note(`stuck at ${player.position.x.toFixed(1)},${player.position.z.toFixed(1)} in mode ${player.mode}`);
        stuckTimer = 0;
        releaseAll();
        cooldown = 0;
        stuckCount++;
        if (player.mode === "ground") {
          // walking into a trunk or an edge: sidestep around it, alternating sides
          sidestepKey = stuckCount % 2 ? "KeyD" : "KeyA";
          sidestepUntil = 0.9;
          const step = nextStep();
          if (stuckCount >= 2 && step.walkTo && step.walkTo.y > player.position.y + 1.5) {
            // fell off a platform: ground navigation is a bot limitation, not the smoke's subject –
            // hop back up to the entry it was heading for and play on for real.
            player.teleport(step.walkTo.x, step.walkTo.y + 0.05, step.walkTo.z);
            note(`shortcut: hopped to ${step.elementId || "the ladder"} entry`);
            stuckCount = 0;
            sidestepUntil = 0;
          }
        }
      }
      act(dt);
    },
    dispose() { releaseAll(); for (const off of offs) off(); },
  };
}
