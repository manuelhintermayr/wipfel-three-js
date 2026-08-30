// Boot: params → Rapier → renderer → world (sky, terrain, forest) → player → loop.
import * as THREE from "three";
import { GAME, TIME, TICKET, TICKET_TYPES, RULES } from "./config.js";
import { readParams } from "./core/params.js";
import { installGlobalHandlers, showFatal, log } from "./core/errors.js";
import { Loop } from "./core/loop.js";
import { Input } from "./core/input.js";
import { Rng } from "./core/rng.js";
import { createRenderer } from "./core/renderer.js";
import { initPhysics } from "./core/physics.js";
import { DebugPanel } from "./ui/debug.js";
import { events } from "./core/events.js";
import { createWind } from "./world/wind.js";
import { createSky } from "./world/sky.js";
import { createSkyline } from "./world/skyline.js";
import { createTerrain } from "./world/terrain.js";
import { createGroundDetail } from "./world/ground-detail.js";
import { createForest } from "./world/forest.js";
import { createPlayer } from "./player/controller.js";
import { getWoodTextures } from "./procgen/textures/wood.js";
import { generateParkLayout } from "./park/layout.js";
import { loadPark } from "./park/loader.js";
import { createSigns } from "./park/signs.js";
import { createParkBoard } from "./park/park-board.js";
import { createOccupancy } from "./game/occupancy.js";
import { createAgents } from "./npc/agents.js";
import { createGuestRig } from "./npc/guest-rig.js";
import { createCourseMap } from "./ui/course-map.js";
import { createBelay } from "./player/belay.js";
import { createInteraction } from "./player/interaction.js";
import { createVitals } from "./player/vitals.js";
import { createElementState } from "./player/on-element.js";
import { createFallState } from "./player/fall.js";
import { createZiplineState } from "./player/on-zipline.js";
import { createTarzanState } from "./player/on-tarzan.js";
import { createHud } from "./ui/hud.js";
import { armAudio } from "./audio/synth.js";
import { initI18n, t, formatClock } from "./core/i18n.js";
import { createSave } from "./core/save.js";
import { createSession } from "./game/session.js";
import { createAutoplay } from "./game/autoplay.js";
import { createTicketClock } from "./game/ticket.js";
import { createKassa } from "./ui/kassa.js";
import { createBriefing } from "./game/briefing.js";
import { createStampCard } from "./ui/stamp-card.js";
import { sfxCarabinerOpen, sfxCarabinerLock, sfxHarnessCatch } from "./audio/sfx.js";

async function boot() {
  installGlobalHandlers();
  const params = readParams();
  log.info(`${GAME.name} ${GAME.version} · seed=${params.seed} · debug=${params.debug}`);

  const container = document.getElementById("app");
  const save = createSave();
  if (!params.briefing) save.completeBriefing();   // ?briefing=0: behave exactly as if it were already done
  await initI18n({ locale: save.data.locale || params.locale });
  let physics, view;
  try {
    physics = await initPhysics();
  } catch (err) {
    showFatal("Physics engine failed to start", err, "Rapier (WebAssembly) could not be initialised. Your browser needs WebAssembly support.");
    return;
  }
  try {
    view = createRenderer(container);
  } catch (err) {
    showFatal("Graphics could not be initialised", err, "WebGL 2 is required. Try another browser or enable hardware acceleration.");
    return;
  }
  const { renderer, scene, camera } = view;
  const rng = new Rng(params.seed);
  const input = new Input(window);
  const loop = new Loop({ timeScale: params.fast ? 4 : 1 });

  // --- world -----------------------------------------------------------------------------------------
  const t0 = performance.now();
  const wind = createWind({ rng: rng.fork("wind") });
  const sky = createSky({ scene, renderer, rng: rng.fork("sky") });
  const skyline = createSkyline({ scene, rng: rng.fork("skyline") });
  const terrain = createTerrain({ rng, physics, scene });
  const groundDetail = createGroundDetail({ rng: rng.fork("ground-detail"), scene, terrain, wind });
  const parkDef = generateParkLayout({ seed: params.seed, terrain });
  const forest = createForest({ rng: rng.fork("forest"), scene, physics, terrain, wind, heroTrees: parkDef.heroTrees });

  // --- park (M1.1: generated layout → six built routes; M1.2: signage) ------------------------------------
  const wood = getWoodTextures(params.seed);
  const course = loadPark(parkDef, { scene, physics, terrain, forest, rng: rng.fork("course"), textures: wood });
  const signs = createSigns({ parkDef, scene, terrain, textures: wood, rng: rng.fork("signs") });
  const parkBoard = createParkBoard({
    root: document.getElementById("hud"), scene, physics, parkDef, terrain, rng: rng.fork("park-board"), textures: wood,
  });
  const buildMs = Math.round(performance.now() - t0);
  log.info(`world built in ${buildMs} ms · trees ${forest.trees.length} · hubs ${terrain.hubs.length} · routes ${course.routes.length} · course on tree #${course.tree.id}`);

  // --- NPC guests (M1.6): occupancy is shared with the player's own belay/interaction below --------
  const occupancy = createOccupancy();
  const agents = params.npc ? createAgents({ course, parkDef, terrain, rng: rng.fork("npc"), occupancy, events }) : null;
  const guestRig = agents ? createGuestRig({ scene, guestCount: agents.count }) : null;
  if (agents) log.info(`guests: ${agents.count}`);

  // --- player + belay + HUD ----------------------------------------------------------------------------
  const player = createPlayer({ physics, scene, camera, input, terrain, rng: rng.fork("player"), events });
  // A resumed day (M1.5) keeps its own belay choice; otherwise the usual ?belay=/DEFAULTS fallback.
  const initialBelayMode = (save.data.ticket && save.data.ticket.belayMode) || params.belayMode;
  const belay = createBelay({ mode: initialBelayMode, onEvent: (e) => events.emit(`belay:${e.type}`, e) });
  const hud = createHud(document.getElementById("hud"));
  const vitals = createVitals({ player, input, terrain, hud, events });
  const { balance, stamina, nerves } = vitals;
  player.addState("element", createElementState({ input, events, balance, stamina, nerves, rng: rng.fork("element"), camera: player.camera }));
  player.addState("fall", createFallState({ physics, input, scene, events, balance, stamina, nerves, camera: player.camera }));
  player.addState("zipline", createZiplineState({ input, events, camera: player.camera, hud, stamina, nerves, wind }));
  player.addState("tarzan", createTarzanState({ input, events, nerves, stamina }));

  // --- kassa + Einschulung + ticket clock + stamp card (M1.3/M1.5) --------------------------------------
  const overlay = document.getElementById("overlay");
  const ticket = createTicketClock();
  const interaction = createInteraction({ player, input, belay, course, hud, events, vitals, save, ticket, occupancy });
  const courseMap = createCourseMap({ root: overlay, parkDef, terrain, save, player, getAgents: () => (agents ? agents.list : []) });
  if (params.map) courseMap.open();

  const ticketHoursFor = (typeId) => (TICKET_TYPES.find((tt) => tt.id === typeId) || TICKET_TYPES[0]).hours;
  const massForSizeClass = (id) => (RULES.sizeClasses.find((s) => s.id === id) || RULES.sizeClasses[RULES.sizeClasses.length - 1]).massKg;
  function applyChoice(choice) {
    belay.setMode(choice.belayMode);
    player.states.get("zipline").setRiderMass(massForSizeClass(choice.sizeClassId));
  }
  /** Kassa confirm: applies the choice, opens the day, then the Einschulung unless already done. */
  function startDay(choice) {
    save.startTicket(choice);
    ticket.reset({ ticketHours: ticketHoursFor(choice.type) });
    sky.setTimeOfDay(TICKET.openingHour);
    applyChoice(choice);
    session.beginDay();
    const endHour = TICKET.openingHour + ticket.totalGameMinutes / 60;
    hud.setNotice(t("notice.ticketStarted", { time: formatClock(endHour) }), 6);
    if (!save.data.briefingDone) briefing.start();
  }
  /** Reopening the page with an active ticket (and no `?kassa=1`): resume the day, skip the kassa. */
  function resumeDay() {
    const tk = save.data.ticket;
    ticket.reset({ ticketHours: ticketHoursFor(tk.type) });
    ticket.update(tk.elapsedReal);
    sky.setTimeOfDay(ticket.timeOfDay);
    applyChoice({ belayMode: tk.belayMode || params.belayMode, sizeClassId: tk.sizeClassId });
    session.beginDay();
  }

  const stampCard = createStampCard({
    root: overlay, save,
    onNewDay() { save.endTicket(); kassa.show(); },
    onContinue() { ticket.end(); save.endTicket(); },
  });
  const session = createSession({ player, course, parkDef, events, hud, save, root: document.getElementById("hud"), ticket, input, stampCard });
  const briefing = createBriefing({
    root: document.getElementById("hud"), scene, physics, terrain, parkDef, textures: wood,
    rng: rng.fork("briefing"), belay, player, input, save, events,
  });
  const kassa = createKassa({
    root: overlay,
    defaultChoice: { type: TICKET_TYPES[0].id, sizeClassId: "adult", belayMode: params.belayMode },
    onConfirm: startDay,
  });

  const resuming = !params.autoplay && !params.kassa && !!save.data.ticket;
  if (resuming) resumeDay();
  else if (!params.autoplay) kassa.show();

  const autoplay = params.autoplay ? createAutoplay({ player, course, interaction, events, belay, session, kassa, briefing }) : null;
  armAudio(window);
  events.on("belay:open", () => sfxCarabinerOpen());
  events.on("belay:click", () => sfxCarabinerLock(0.14));
  events.on("player:fell", (e) => sfxHarnessCatch(e && e.first ? 1 : 0.7));
  events.on("zip:finished", (e) => log.info(`flying fox: ${e.outcome} arrival, top speed ${e.maxKmh.toFixed(1)} km/h`));
  // Trust hook (GDD §3.4/§7 "Zusehen gibt Vertrauen", M1.6): watching a guest finish an element next
  // to the platform the player is standing on ticks trust up and nerves down a little – js/npc/agents.js
  // only emits the event, js/player/nerves.js#watchSuccess() decides what it is worth.
  events.on("npc:watched-success", () => vitals.nerves.watchSuccess());

  // --- debug panel -----------------------------------------------------------------------------------
  let npcMs = 0;   // set in the gameplay phase below – js/npc/agents.js's own per-frame budget
  const debug = new DebugPanel(document.getElementById("debug"), () => ({
    fps: loop.stats.fps.toFixed(0),
    "frame ms": loop.stats.frameMs.toFixed(2),
    "physics ms": loop.stats.physicsMs.toFixed(2),
    "draw calls": renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    "terrain lod": terrain.chunkStats.byLod.join("/"),
    bodies: physics.bodyCount,
    colliders: physics.colliderCount,
    trees: forest.trees.length,
    seed: String(params.seed),
    "time of day": sky.timeOfDay.toFixed(2),
    "player": `${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)}`,
    mode: player.mode,
    "speed m/s": player.speed.toFixed(2),
    belay: `${belay.state().A.state}/${belay.state().B.state} @ ${belay.currentAnchor() || "–"}`,
    prompt: interaction.prompt || "–",
    ...vitals.probe(),
    "npc count": agents ? agents.count : 0,
    "npc ms": npcMs.toFixed(3),
    "world ms": buildMs,
  }));
  if (params.debug) debug.toggle(true);
  if (params.physics) physics.setDebug(scene, true);

  // --- loop wiring -----------------------------------------------------------------------------------
  loop.on("input", (frameDt) => {
    input.poll();
    if (autoplay) autoplay.update(frameDt);   // synthesises key events – must run before consumers read edges
    if (input.pressed("debug")) debug.toggle();
    if (input.pressed("physdebug")) physics.setDebug(scene, !physics.debugEnabled);
    if (input.pressed("map")) courseMap.toggle();
    if (courseMap.visible) {
      // The world keeps living behind the dark overlay (no loop.paused) – only the player's own
      // movement input is gated, the same "a screen is up, check its `visible` flag" idea
      // js/ui/kassa.js and js/ui/stamp-card.js already use for themselves.
      input.move.x = 0; input.move.y = 0;
      if (input.pressed("pause")) courseMap.close();
    } else if (input.pressed("pause")) {
      loop.paused = !loop.paused;
    }
    if (input.pressed("camera")) player.setThirdPerson(player.camera.isFirstPerson);
  });
  loop.on("physics", (dt) => {
    player.fixedUpdate(dt);
    physics.step();
  });
  loop.on("gameplay", (dt, elapsed) => {
    player.update(dt);
    ticket.update(dt);
    session.update(dt);
    course.update(dt, elapsed);
    vitals.update(dt);
    interaction.update(dt);       // the player's own occupancy claim/release happens here first –
    if (agents) {                 // guests below only ever see a slot the player has already taken.
      const t0 = performance.now();
      agents.update(dt, player.position);
      npcMs = performance.now() - t0;
    }
    parkBoard.update(player, input, () => courseMap.open());
    briefing.update();
    wind.update(dt);
    sky.update(dt, player.position);
    skyline.update(dt);
    terrain.update(dt, player.position);
    groundDetail.update(dt, player.position);
    forest.update(dt, elapsed, player.position);
  });
  loop.on("render", (alpha, dt) => {
    player.render(alpha, dt);
    if (guestRig) guestRig.update(agents.list, player.position, dt);
    physics.updateDebug();
    renderer.render(scene, camera);
  });
  loop.on("ui", (dt) => {
    debug.update(dt);
    courseMap.update();
    input.endFrame();
  });

  // Kassa is a plain form, not a pointer-lock surface – clicking a choice must not also lock the mouse.
  container.addEventListener("click", () => { if (!kassa.visible) input.requestPointerLock(renderer.domElement); });

  window.WIPFEL = {
    version: GAME.version, params, loop, physics, scene, camera, renderer, rng, input, events,
    terrain, forest, sky, wind, player, parkDef, course, signs, belay, hud, interaction, vitals, session, save, autoplay,
    kassa, briefing, stampCard, ticket,
    parkBoard, courseMap, occupancy, agents, guestRig,
    debug: {
      /** Force the slip a play-test needs on demand (screenshots, smoke runs). */
      forceSlip(angle = 1) {
        const state = player.states.get("element");
        if (!state || !state.element) return false;
        balance.nudge(Math.sign(angle) * 6);
        return true;
      },
      /** Pin the wind along the zip cable (m/s, negative = head wind, null = back to the weather). */
      setWindAlong(v) { return player.states.get("zipline").setWindAlong(v); },
      /** Rider mass for the next Flying Fox – RULES.sizeClasses, normally set via the kassa (M1.3). */
      setRiderMass(kg) { return player.states.get("zipline").setRiderMass(kg); },
      /**
       * Jump straight to the stamp card (screenshots, smoke runs): exhausts the ticket's remaining
       * game minutes and skips the extend-prompt grace window. No-op before a ticket is active.
       */
      endTicket() {
        if (!ticket.started) return false;
        ticket.update(ticket.remainingGameMinutes * TIME.gameHourMinutes + 1);
        session.forceDayEnd();
        return true;
      },
      panel: debug,
    },
    ready: true,
  };
  loop.start();
  events.emit("boot:ready", { params });
  log.info("boot complete");
}

boot().catch((err) => showFatal("Unexpected error during start", err));
