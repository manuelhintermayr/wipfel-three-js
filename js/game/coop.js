// Local co-op session (ROADMAP M4, GDD §3.11; ADR-029 "lokal", ADR-030 "geteilte Kamera statt
// Splitscreen"). Owns everything about player 2 that js/main.js would otherwise have to duplicate by
// hand: spawning/tearing down a second js/player/controller.js bound to js/core/input-source.js's
// gamepad facade instead of keyboard+mouse, that player's own belay/vitals/interaction, the shared
// camera frame (js/player/coop-camera.js), the "stay together" leash, the two co-op elements' haul/
// tension/shared-physics wiring (js/game/coop-elements.js), periodic spectator calls, and a small
// companion badge on whichever route both climbers happen to finish together.
//
// Deliberately NOT integrated with js/builder/builder.js (M3a): that module rebuilds `course`/
// `interaction` out from under anything holding a reference to the old ones, and player 2 is exactly
// such a thing. js/main.js disables co-op the instant the builder is entered (mirroring how it already
// freezes `agents` while `builder.mode !== "closed"`) rather than teaching the builder's rebuild
// cascade about a fourth player-shaped thing to carry along – re-enabling co-op after leaving the
// builder spawns a fresh player 2 exactly like starting a new day does.
import * as THREE from "three";
import { COOP, COOP_ELEMENTS, NPC } from "../config.js";
import { DEFAULT_GAMEPAD_BINDINGS } from "../core/input.js";
import { createGamepadInputSource, isGamepadConnected } from "../core/input-source.js";
import { createPlayer } from "../player/controller.js";
import { createBelay } from "../player/belay.js";
import { createVitals } from "../player/vitals.js";
import { createInteraction } from "../player/interaction.js";
import { createElementState } from "../player/on-element.js";
import { createFallState } from "../player/fall.js";
import { createZiplineState } from "../player/on-zipline.js";
import { createTarzanState } from "../player/on-tarzan.js";
import { computeCoopFrame } from "../player/coop-camera.js";
import {
  currentElementOf, elementsShareSupport, applySharedPhysics, isHelperInRange, findCoopElements,
  leashFactor, sharedRouteId, justFinishedSharedZip,
} from "./coop-elements.js";
import { renderPromptNodes } from "../ui/hud.js";
import { t } from "../core/i18n.js";

export { isGamepadConnected };

const HOLDER_P1 = "player";
const HOLDER_P2 = "player2";
const EXTRA_STATE_NAMES = Object.freeze(["element", "fall", "zipline", "tarzan"]);

/** Cheer lines picked deterministically (js/core/rng.js) – never Math.random, same rule as every other
 *  procedural pick in this project. */
const CHEER_KEYS = Object.freeze(["coop.cheer.1", "coop.cheer.2", "coop.cheer.3", "coop.cheer.4"]);

/** Player 2's gamepad bindings: identical to solo play's, minus the "camera" button (index 5, RB) –
 *  player 2 never owns the one shared camera (js/player/camera.js#setFocusOverride is driven entirely
 *  by this module), so a stray press there must not flip their own invisible camera controller's
 *  `isFirstPerson` and hide their rig (js/player/controller.js#render ties body visibility to that). */
const P2_GAMEPAD_BINDINGS = Object.freeze({
  ...DEFAULT_GAMEPAD_BINDINGS,
  buttons: Object.fromEntries(Object.entries(DEFAULT_GAMEPAD_BINDINGS.buttons).filter(([, action]) => action !== "camera")),
});

/**
 * @param {{ scene, physics, terrain, sky, events, hud, root: HTMLElement, rng: import("../core/rng.js").Rng,
 *   player, input, belay, vitals, occupancy, save, ticket?, rescue?, operations?,
 *   getCourse(): object, getSession(): object|null, getAgents(): object|null }} deps
 *   `player`/`input`/`belay`/`vitals` are player 1's own instances – co-op only ever *reads* them
 *   (position/mode for the camera frame and spectator calls), never drives them. `occupancy` is the
 *   same js/game/occupancy.js instance player 1's own interaction and every guest already share.
 *   `getCourse`/`getSession`/`getAgents` are live getters because js/builder/builder.js (M3a) can
 *   rebuild all three – see this file's header on why co-op simply steps aside whenever the builder
 *   is open instead of following along.
 * @returns {{ active: boolean, available: boolean, player2: object|null, falls: {player1,player2},
 *   enable(opts?: {inputSource?: object}): boolean, disable(): void,
 *   pollInput(): void, fixedUpdate(dt): void, update(dt): void, render(alpha, dt): void,
 *   endFrame(): void, dispose(): void }}
 */
export function createCoop({
  scene, physics, terrain, sky, events, hud, root, rng, occupancy,
  player: player1, input: input1, belay: belay1, vitals: vitals1,
  save, ticket = null, rescue = null, operations = null,
  getCourse, getSession = () => null, getAgents = () => null,
}) {
  let active = false;
  let enableCount = 0;
  let player2 = null, input2 = null, belay2 = null, vitals2 = null, interaction2 = null;

  // --- per-frame tracking state (reset whenever a fresh player 2 spawns) --------------------------
  let p1WasFalling = false, p2WasFalling = false, p1Falls = 0, p2Falls = 0;
  let p1LastLadderAnchor = null, p2LastLadderAnchor = null;
  let companionRouteId = null, p1FinishedCompanion = false, p2FinishedCompanion = false;
  let p1JustArrivedFromSharedZip = () => false, p2JustArrivedFromSharedZip = () => false;
  let spectatorTimer = 0;
  let latestInteractionPrompt = null;
  let leashHinting = false;

  const promptBox = document.createElement("div");
  promptBox.className = "p2-prompt";
  promptBox.hidden = true;
  root.appendChild(promptBox);

  function renderPromptBox() {
    const text = latestInteractionPrompt || (leashHinting ? t("coop.leashHint") : null);
    if (!text) { promptBox.hidden = true; promptBox.replaceChildren(); return; }
    promptBox.replaceChildren(document.createTextNode(`${t("coop.p2Prefix")} `), ...renderPromptNodes(text));
    promptBox.hidden = false;
  }

  /** A tracker closure per player: true on the exact update() call where that player's current element
   *  just became null *and* the element they left was the shared route's own zip (any leg) – pure test
   *  in js/game/coop-elements.js#justFinishedSharedZip, this just remembers "what was it last frame"
   *  (js/player/on-zipline.js's `exit()` clears its own `element` reference, so that cannot be
   *  reconstructed after the transition). */
  function makeZipArrivalTracker(player) {
    let lastElementId = null;
    return () => {
      const el = currentElementOf(player);
      const justArrived = justFinishedSharedZip(lastElementId, el ? el.id : null, companionRouteId);
      lastElementId = el ? el.id : null;
      return justArrived;
    };
  }

  /** The route (if any) whose ladder anchor id is `anchorId`. */
  function routeOfLadderAnchor(anchorId) {
    if (!anchorId) return null;
    return getCourse().routes.find((r) => r.ladderAnchorId === anchorId) || null;
  }

  /** Which route (if any) *both* climbers are currently attempting together, tracked via each one's
   *  own last-clipped ladder anchor (sticky until they clip a *different* route's ladder). */
  function updateCompanionTracking() {
    const a1 = belay1.currentAnchor(), a2 = belay2.currentAnchor();
    if (routeOfLadderAnchor(a1)) p1LastLadderAnchor = a1;
    if (routeOfLadderAnchor(a2)) p2LastLadderAnchor = a2;
    const sharedId = sharedRouteId(p1LastLadderAnchor, p2LastLadderAnchor, routeOfLadderAnchor);
    if (sharedId !== companionRouteId) {
      companionRouteId = sharedId;
      p1FinishedCompanion = false;
      p2FinishedCompanion = false;
    }
  }

  /** Falls counted per player (GDD §3.11 "falls counted separately") – pure edge-detection on each
   *  player's own state machine; the shared `player:fell` event carries no player id to key off. */
  function trackFalls() {
    const p1Falling = player1.mode === "fall";
    if (p1Falling && !p1WasFalling) p1Falls += 1;
    p1WasFalling = p1Falling;
    const p2Falling = player2.mode === "fall";
    if (p2Falling && !p2WasFalling) p2Falls += 1;
    p2WasFalling = p2Falling;
  }

  /** Both climbers reaching the *same* route's finish (GDD §3.11 "companion rule flavour"): a small
   *  additive badge, not a gate on js/game/session.js's own (unchanged, single-run) completion – see
   *  this file's header on why the shared run pipeline itself is not rewired this late. */
  function checkCompanionFinish() {
    if (!companionRouteId) return;
    if (p1JustArrivedFromSharedZip()) p1FinishedCompanion = true;
    if (p2JustArrivedFromSharedZip()) p2FinishedCompanion = true;
    if (!(p1FinishedCompanion && p2FinishedCompanion)) return;
    hud.setNotice(t("coop.bothFinished"), 6);
    const session = getSession();
    const route = getCourse().routeFor(companionRouteId);
    if (session && route) {
      const entry = session.day.routes.slice().reverse().find((r) => r.category === route.category && r.numeral === route.numeral);
      if (entry) entry.companion = true;   // js/ui/stamp-card.js renders it if present, ignores it otherwise
    }
    companionRouteId = null;
    p1FinishedCompanion = false;
    p2FinishedCompanion = false;
  }

  /** "Stay together" (GDD §3.11, honest simplification instead of a hard wall or splitscreen, ADR-030):
   *  beyond COOP.leash.startM separation, player 2's own stick input is scaled down towards
   *  COOP.leash.minFactor. Always player 2 – never player 1 – per the milestone brief. */
  function applyLeash(separationM) {
    const factor = leashFactor(separationM);
    leashHinting = factor < 1;
    input2.move.x *= factor;
    input2.move.y *= factor;
  }

  /** Periodic encouragement (GDD §3.11 "Zuschauer-Rufe"): the other climber, or >= 1 guest, standing on
   *  the platform right next to whoever is currently out on an element or the zip – js/config.js#NPC's
   *  own watch radius/height (M1.6's trust hook), reused rather than a second set of numbers. */
  function updateSpectatorCalls(dt) {
    spectatorTimer -= dt;
    if (spectatorTimer > 0) return;
    const agents = getAgents();
    const pairs = [[player1, vitals1, player2], [player2, vitals2, player1]];
    for (const [climber, climberVitals, other] of pairs) {
      const element = currentElementOf(climber);
      if (!element) continue;
      const decks = [element.getEntryAnchor().stand, element.getExitAnchor().stand];
      const isNear = (pos) => decks.some((d) => Math.hypot(pos.x - d.x, pos.z - d.z) <= NPC.trustWatchRadius && Math.abs(pos.y - d.y) <= NPC.trustWatchHeight);
      const otherWatching = other.mode === "ground" && isNear(other.position);
      const guestWatching = !!agents && agents.list.some((g) => g.phase !== "wander" && g.phase !== "toEntry" && g.phase !== "return" && isNear(g.pos));
      if (!otherWatching && !guestWatching) continue;
      hud.setNotice(t(rng.pick(CHEER_KEYS)), 4);
      climberVitals.nerves.watchSuccess();
      spectatorTimer = rng.float(COOP.spectator.intervalSecondsMin, COOP.spectator.intervalSecondsMax);
      return;
    }
  }

  // Which holder id currently sits in a co-op element's *helper* slot, keyed by element id – so the
  // claim can be released explicitly the moment nobody is riding any more (the rider's own slot is
  // already released by their own js/player/interaction.js the instant they leave "element" mode; the
  // helper's slot is claimed directly by this module, bypassing interaction.js entirely, so nothing else
  // would ever release it).
  const helperClaims = new Map();

  /** Release a previously-claimed helper slot if the new one is different (or there is none now). */
  function updateHelperClaim(elementId, nextHolderId) {
    const previous = helperClaims.get(elementId);
    if (previous && previous !== nextHolderId) occupancy.releaseElement(elementId, previous);
    if (nextHolderId) helperClaims.set(elementId, nextHolderId);
    else helperClaims.delete(elementId);
  }

  /** Counterweight lift (js/elements/counterweight-lift.js): whoever rides gets the self-haul floor for
   *  free; the *other* climber standing at the entry platform tapping [interact] (P1's [E], P2's own
   *  mapped gamepad button – see this file's `P2_GAMEPAD_BINDINGS`) adds a burst on top. */
  function driveLifts(lifts) {
    for (const lift of lifts) {
      const helper = currentElementOf(player1) === lift ? { player: player2, input: input2, id: HOLDER_P2 }
        : currentElementOf(player2) === lift ? { player: player1, input: input1, id: HOLDER_P1 } : null;
      if (!helper) { updateHelperClaim(lift.id, null); continue; }
      const inRange = isHelperInRange(helper.player, lift.getEntryAnchor().stand);
      if (inRange) {
        occupancy.claimElement(lift.id, helper.id, lift.occupancyCapacity || 1);
        updateHelperClaim(lift.id, helper.id);
        if (helper.input.pressed("interact")) lift.addHaulPower(COOP_ELEMENTS.counterweightLift.haulTapBoost);
      } else {
        occupancy.releaseElement(lift.id, helper.id);
        updateHelperClaim(lift.id, null);
      }
    }
  }

  /** Team bridge (js/elements/team-bridge.js): the *other* climber holding [clip] at either platform end
   *  (P1's [F], P2's mapped gamepad button) damps every future footstep kick while they cross. */
  function driveBridges(bridges) {
    for (const bridge of bridges) {
      const helper = currentElementOf(player1) === bridge ? { player: player2, input: input2, id: HOLDER_P2 }
        : currentElementOf(player2) === bridge ? { player: player1, input: input1, id: HOLDER_P1 } : null;
      if (!helper) { bridge.setTensionHeld(false); updateHelperClaim(bridge.id, null); continue; }
      const atEitherEnd = isHelperInRange(helper.player, bridge.getEntryAnchor().stand) || isHelperInRange(helper.player, bridge.getExitAnchor().stand);
      if (atEitherEnd) { occupancy.claimElement(bridge.id, helper.id, bridge.occupancyCapacity || 1); updateHelperClaim(bridge.id, helper.id); }
      else { occupancy.releaseElement(bridge.id, helper.id); updateHelperClaim(bridge.id, null); }
      bridge.setTensionHeld(atEitherEnd && helper.input.down("clip"));
    }
  }

  /** GDD §3.11/§4 "geteilte Physik … wenn die Gruppe es einschaltet": both riding the same capacity-2
   *  co-op element, or two elements that share a support platform – see js/game/coop-elements.js. */
  function driveSharedPhysics(dt) {
    if (!save.data.settings.sharedPhysics) return;
    const e1 = currentElementOf(player1), e2 = currentElementOf(player2);
    if (elementsShareSupport(e1, e2)) applySharedPhysics(e1, e2, dt);
  }

  function disposeExtraStates(player) {
    for (const name of EXTRA_STATE_NAMES) {
      const state = player.states.get(name);
      if (state && typeof state.dispose === "function") state.dispose();
    }
  }

  const api = {
    get active() { return active; },
    /** js/ui/kassa.js gates the "Two climbers" toggle on this. */
    get available() { return isGamepadConnected(); },
    get player2() { return player2; },
    get falls() { return { player1: p1Falls, player2: p2Falls }; },

    /**
     * @param {{ inputSource?: object }} [opts] `inputSource` (tests/verification, `WIPFEL.debug.
     *   enableCoopForTest()`): an Input-like stand-in used instead of a real gamepad – see
     *   js/core/input-source.js's own header for the shared method-name contract.
     * @returns {boolean} false if there is no course to spawn player 2 into yet
     */
    enable(opts = {}) {
      if (active) return true;
      const course = getCourse();
      if (!course || !course.routes.length) return false;
      enableCount += 1;
      const sessionRng = rng.fork(`session-${enableCount}`);

      input2 = opts.inputSource || createGamepadInputSource(P2_GAMEPAD_BINDINGS);
      input1.setGamepadEnabled(false);   // player 1 becomes keyboard+mouse only – see js/core/input.js

      const sx = player1.position.x + 1.6, sz = player1.position.z;
      const spawn = { x: sx, y: terrain.heightAt(sx, sz), z: sz };
      const dummyCamera = new THREE.PerspectiveCamera();   // never added to the renderer, never rendered
      player2 = createPlayer({
        physics, scene, camera: dummyCamera, input: input2, terrain, events,
        rng: sessionRng.fork("player2"), spawn, rigVariant: "p2",
      });
      belay2 = createBelay({
        mode: belay1.mode,
        // "unsafe" (both carabiners open, classic mode) is namespaced away from the shared "belay:unsafe"
        // – js/main.js's own accident-state listener on that name closes over *player 1* specifically, and
        // must never fire because player 2 mishandled their own carabiners. Open/click still share the
        // real names so both climbers' clicks make the same carabiner sounds (js/main.js's SFX hooks).
        onEvent: (e) => events.emit(e.type === "unsafe" ? "coop:belay2-unsafe" : `belay:${e.type}`, e),
      });
      vitals2 = createVitals({ player: player2, input: input2, terrain, hud: null, events, sky });
      player2.addState("element", createElementState({
        input: input2, events, balance: vitals2.balance, stamina: vitals2.stamina, nerves: vitals2.nerves,
        rng: sessionRng.fork("player2-element"), camera: player2.camera, sky,
      }));
      player2.addState("fall", createFallState({
        physics, input: input2, scene, events, balance: vitals2.balance, stamina: vitals2.stamina,
        nerves: vitals2.nerves, camera: player2.camera, sky,
      }));
      player2.addState("zipline", createZiplineState({
        input: input2, events, camera: player2.camera, hud: null, stamina: vitals2.stamina, nerves: vitals2.nerves, belay: belay2, sky,
      }));
      player2.addState("tarzan", createTarzanState({ input: input2, events, nerves: vitals2.nerves, stamina: vitals2.stamina, sky }));

      interaction2 = createInteraction({
        player: player2, input: input2, belay: belay2, course, hud: { setBelay() {}, setPrompt: (text) => { latestInteractionPrompt = text; } },
        events, vitals: vitals2, save, ticket, occupancy, rescue, operations, holderId: HOLDER_P2,
      });

      p1WasFalling = p2WasFalling = false; p1Falls = p2Falls = 0;
      p1LastLadderAnchor = p2LastLadderAnchor = null;
      companionRouteId = null; p1FinishedCompanion = p2FinishedCompanion = false;
      p1JustArrivedFromSharedZip = makeZipArrivalTracker(player1);
      p2JustArrivedFromSharedZip = makeZipArrivalTracker(player2);
      spectatorTimer = COOP.spectator.intervalSecondsMin;
      latestInteractionPrompt = null;
      leashHinting = false;

      active = true;
      return true;
    },

    disable() {
      if (!active) return;
      active = false;
      disposeExtraStates(player2);
      interaction2.dispose();
      player2.dispose();
      player1.camera.setFocusOverride(null);
      input1.setGamepadEnabled(true);
      promptBox.hidden = true;
      promptBox.replaceChildren();
      // Release any co-op element helper slots still held (see `updateHelperClaim`) – the rider's own
      // slot is already released by their own interaction instance's dispose()/mode change.
      for (const [elementId, holderId] of helperClaims) occupancy.releaseElement(elementId, holderId);
      helperClaims.clear();
      player2 = null; input2 = null; belay2 = null; vitals2 = null; interaction2 = null;
    },

    pollInput() { if (active) input2.poll(); },
    fixedUpdate(dt) { if (active) player2.fixedUpdate(dt); },

    update(dt) {
      if (!active) return;
      player2.update(dt);
      vitals2.update(dt);
      interaction2.update(dt);
      updateCompanionTracking();
      trackFalls();
      checkCompanionFinish();

      const frame = computeCoopFrame({ position: player1.position, mode: player1.mode }, { position: player2.position, mode: player2.mode });
      player1.camera.setFocusOverride(frame.position, frame.distance);
      applyLeash(frame.separation);

      const { lifts, bridges } = findCoopElements(getCourse());
      driveLifts(lifts);
      driveBridges(bridges);
      driveSharedPhysics(dt);
      updateSpectatorCalls(dt);
      renderPromptBox();
    },

    render(alpha, dt) { if (active) player2.render(alpha, dt); },
    endFrame() { if (active) input2.endFrame(); },

    dispose() {
      api.disable();
      promptBox.remove();
    },
  };
  return api;
}
