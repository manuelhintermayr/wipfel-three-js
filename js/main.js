// Boot: params → Rapier → renderer → world (sky, terrain, forest) → player → loop.
import * as THREE from "three";
import { GAME, TIME, TICKET, TICKET_TYPES, RULES, NIGHT, GRAPHICS } from "./config.js";
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
import { generateParkLayout, PARK_CONFIG, PARK_CONFIG_SMALL } from "./park/layout.js";
import { loadPark } from "./park/loader.js";
import { createSigns } from "./park/signs.js";
import { createParkBoard } from "./park/park-board.js";
import { createWichtelCourses } from "./park/wichtel.js";
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
import { createAccidentState } from "./player/accident.js";
import { createHeadlamp } from "./player/headlamp.js";
import { setSidegrade } from "./player/sidegrade.js";
import { createLampions } from "./park/lampions.js";
import { createPhotoMode } from "./game/photo-mode.js";
import { createTouchControls, isTouchDevice } from "./ui/touch-controls.js";
import { createAccidentReport } from "./ui/accident-report.js";
import { createHud } from "./ui/hud.js";
import { armAudio } from "./audio/synth.js";
import { initI18n, t, formatClock } from "./core/i18n.js";
import { createSave } from "./core/save.js";
import { createSession } from "./game/session.js";
import { createFlow } from "./game/flow.js";
import { createClipMeter } from "./game/clip-meter.js";
import { createAutoplay } from "./game/autoplay.js";
import { createTicketClock } from "./game/ticket.js";
import { createKassa } from "./ui/kassa.js";
import { createBriefing } from "./game/briefing.js";
import { createStampCard } from "./ui/stamp-card.js";
import { createOptions } from "./ui/options.js";
import { createBuilder } from "./builder/builder.js";
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
  // M3a builder (js/builder/builder-state.js#serialize): a previously saved custom park def is preferred
  // over a freshly generated one whenever present – js/core/save.js#normalize() already refused anything
  // structurally unsound, so `save.data.customPark` is either null or safe to hand straight to loadPark.
  // `?routes=6` (M2a "quick dev") only ever affects the *generated* fallback.
  let parkDef = save.data.customPark
    ? save.data.customPark.parkDef
    : generateParkLayout({ seed: params.seed, terrain, config: params.routes === 6 ? PARK_CONFIG_SMALL : PARK_CONFIG });
  let forest = createForest({ rng: rng.fork("forest"), scene, physics, terrain, wind, heroTrees: parkDef.heroTrees });

  // --- park (M1.1: generated layout → routes; M1.2: signage; M2a: 15 routes + legendary + junctions) -----
  const wood = getWoodTextures(params.seed);
  let course = loadPark(parkDef, { scene, physics, terrain, forest, rng: rng.fork("course"), textures: wood });
  let signs = createSigns({ parkDef, scene, terrain, textures: wood, rng: rng.fork("signs") });
  // The legendary finale has no parkplan entry at all (GDD §3.12) – the park board and course map both
  // read this filtered copy instead of `parkDef` directly (js/park/signs.js filters internally instead,
  // since it also needs the un-filtered park for its per-hub route grouping).
  let publicParkDef = { ...parkDef, routes: parkDef.routes.filter((r) => r.category !== "legendary") };
  let parkBoard = createParkBoard({
    root: document.getElementById("hud"), scene, physics, parkDef: publicParkDef, terrain, rng: rng.fork("park-board"), textures: wood,
  });
  const wichtel = createWichtelCourses({ scene, physics, terrain, parkDef, rng: rng.fork("wichtel"), textures: wood });
  // Night climbing (M2b, GDD §3.7/RESEARCH-DATA §1): lampions strung along the two blue routes –
  // pure flavour, always built, only glowing once it is actually dark (js/world/sky.js#night).
  const lampions = createLampions({ scene, parkDef, terrain, rng: rng.fork("lampions") });
  const buildMs = Math.round(performance.now() - t0);
  log.info(`world built in ${buildMs} ms · trees ${forest.trees.length} · hubs ${terrain.hubs.length} · routes ${course.routes.length} · course on tree #${course.tree.id}`);

  // --- NPC guests (M1.6): occupancy is shared with the player's own belay/interaction below --------
  const occupancy = createOccupancy();
  let agents = params.npc ? createAgents({ course, parkDef, terrain, rng: rng.fork("npc"), occupancy, events }) : null;
  let guestRig = agents ? createGuestRig({ scene, guestCount: agents.count }) : null;
  if (agents) log.info(`guests: ${agents.count}`);

  // --- player + belay + HUD ----------------------------------------------------------------------------
  const player = createPlayer({ physics, scene, camera, input, terrain, rng: rng.fork("player"), events });
  // A resumed day (M1.5) keeps its own belay choice; otherwise the usual ?belay=/DEFAULTS fallback.
  const initialBelayMode = (save.data.ticket && save.data.ticket.belayMode) || params.belayMode;
  const belay = createBelay({ mode: initialBelayMode, onEvent: (e) => events.emit(`belay:${e.type}`, e) });
  const hud = createHud(document.getElementById("hud"));
  const vitals = createVitals({ player, input, terrain, hud, events, sky });
  const { balance, stamina, nerves } = vitals;
  player.addState("element", createElementState({ input, events, balance, stamina, nerves, rng: rng.fork("element"), camera: player.camera, sky }));
  player.addState("fall", createFallState({ physics, input, scene, events, balance, stamina, nerves, camera: player.camera, sky }));
  player.addState("zipline", createZiplineState({ input, events, camera: player.camera, hud, stamina, nerves, wind, belay, sky }));
  player.addState("tarzan", createTarzanState({ input, events, nerves, stamina, sky }));
  // Classic-mode accident (M2b, GDD §3.5): a fall with no harness catch, straight to the ground.
  player.addState("accident", createAccidentState({ terrain, camera: player.camera, events }));
  // Night climbing (M2b): a spotlight parented to the rig's head anchor, on once it is dark enough.
  const headlamp = createHeadlamp({ rig: player.rig });

  // --- flow (M2a, GDD §3.10): advanced here (next to vitals), read by js/game/session.js's HUD/mastery ---
  const flow = createFlow();
  events.on("player:fell", () => flow.onFall());

  // --- kassa + Einschulung + ticket clock + stamp card (M1.3/M1.5) --------------------------------------
  const overlay = document.getElementById("overlay");
  const ticket = createTicketClock();
  let interaction = createInteraction({ player, input, belay, course, hud, events, vitals, save, ticket, occupancy });
  let courseMap = createCourseMap({ root: overlay, parkDef: publicParkDef, terrain, save, player, getAgents: () => (agents ? agents.list : []) });
  if (params.map) courseMap.open();

  // M2b night debug hook (`WIPFEL.debug.setNight`): while true, the periodic ticket→sky sync in the
  // gameplay loop below stands down so a forced test/screenshot state is not immediately overwritten.
  let nightDebugOverride = false;
  const ticketHoursFor = (typeId) => (TICKET_TYPES.find((tt) => tt.id === typeId) || TICKET_TYPES[0]).hours;
  // M2b (ROADMAP "Nachtklettern"): only the "night" ticket type carries its own `openingHour`
  // (js/config.js#TICKET_TYPES) – every other type falls back to the park's usual opening time.
  const openingHourFor = (typeId) => (TICKET_TYPES.find((tt) => tt.id === typeId) || TICKET_TYPES[0]).openingHour ?? TICKET.openingHour;
  const massForSizeClass = (id) => (RULES.sizeClasses.find((s) => s.id === id) || RULES.sizeClasses[RULES.sizeClasses.length - 1]).massKg;
  function applyChoice(choice) {
    belay.setMode(choice.belayMode);
    player.states.get("zipline").setRiderMass(massForSizeClass(choice.sizeClassId));
    // M2a sidegrade (GDD §3.12): a kassa-level choice like belay/size, not part of the ticket itself –
    // js/player/sidegrade.js is the live-read switch every call site (stamina, on-element, on-zipline) uses.
    const equipmentId = choice.equipmentId ?? null;
    setSidegrade(equipmentId);
    save.setEquipment(equipmentId);
  }
  /** Kassa confirm: applies the choice, opens the day, then the Einschulung unless already done. */
  function startDay(choice) {
    save.startTicket(choice);
    const openingHour = openingHourFor(choice.type);
    ticket.reset({ ticketHours: ticketHoursFor(choice.type), openingHour });
    sky.setTimeOfDay(openingHour);
    nightDebugOverride = false;   // a fresh day always follows the ticket's own clock again
    applyChoice(choice);
    session.beginDay();
    const endHour = openingHour + ticket.totalGameMinutes / 60;
    hud.setNotice(t("notice.ticketStarted", { time: formatClock(endHour) }), 6);
    if (!save.data.briefingDone) briefing.start();
  }
  /** Reopening the page with an active ticket (and no `?kassa=1`): resume the day, skip the kassa. */
  function resumeDay() {
    const tk = save.data.ticket;
    ticket.reset({ ticketHours: ticketHoursFor(tk.type), openingHour: openingHourFor(tk.type) });
    ticket.update(tk.elapsedReal);
    sky.setTimeOfDay(ticket.timeOfDay);
    nightDebugOverride = false;
    applyChoice({ belayMode: tk.belayMode || params.belayMode, sizeClassId: tk.sizeClassId, equipmentId: save.data.equipmentId });
    session.beginDay();
  }

  const stampCard = createStampCard({
    root: overlay, save,
    onNewDay() { save.endTicket(); kassa.show(); },
    onContinue() { ticket.end(); save.endTicket(); },
  });
  let session = createSession({ player, course, parkDef, events, hud, save, root: document.getElementById("hud"), ticket, input, stampCard, flow });
  const briefing = createBriefing({
    root: document.getElementById("hud"), scene, physics, terrain, parkDef, textures: wood,
    rng: rng.fork("briefing"), belay, player, input, save, events,
  });
  const kassa = createKassa({
    root: overlay, save,
    defaultChoice: { type: TICKET_TYPES[0].id, sizeClassId: "adult", belayMode: params.belayMode, equipmentId: save.data.equipmentId },
    onConfirm: startDay,
  });
  // Re-clip feedback (M2a, ROADMAP "Umhäng-Feedback"): purely event-driven, suppressed while the
  // Einschulung dialogue/practice ritual is still running (a beginner's first fumble is not "clean").
  const clipMeter = createClipMeter({ belay, events, hud, flow, isSuppressed: () => briefing.active });

  // --- pause/options screen (M1.7) --------------------------------------------------------------------
  /** Shared by the options screen's official "End day" button and the WIPFEL.debug.endTicket() dev hook
   * (M1.5) – exhausts the ticket's remaining game minutes and skips the extend-grace window. Guards
   * against the season pass's `Infinity` remaining time (M2a) – there is nothing to "exhaust" there,
   * `session.forceDayEnd()` already shows the stamp card on demand regardless of the ticket's own state. */
  function endTicketNow() {
    if (!ticket.started) return false;
    const bump = Number.isFinite(ticket.remainingGameMinutes) ? ticket.remainingGameMinutes * TIME.gameHourMinutes + 1 : TIME.gameHourMinutes;
    ticket.update(bump);
    session.forceDayEnd();
    return true;
  }
  // --- M3a builder (GDD §4 "Betreiber-Gameplay") -------------------------------------------------------
  // Applying an edited draft means rebuilding every system that was constructed from the *old* parkDef/
  // course – the same construction calls boot() already ran once above, just callable again. `forest`
  // is only rebuilt when the draft actually grew `heroTrees` (a brand-new platform tree needs to exist
  // as a real, collidable, instanced tree) – a route/edge/zip-only edit never touches it.
  let rebuildSeq = 0;
  function rebuildFromParkDef(nextParkDef) {
    rebuildSeq += 1;
    const heroCountChanged = nextParkDef.heroTrees.length !== parkDef.heroTrees.length;
    if (agents) { agents.dispose(); agents = null; }
    if (guestRig) { guestRig.dispose(); guestRig = null; }
    courseMap.dispose();
    session.dispose();
    interaction.dispose();
    parkBoard.dispose();
    signs.dispose();
    course.dispose();
    if (heroCountChanged) {
      forest.dispose();
      forest = createForest({ rng: rng.fork(`forest-rebuild-${rebuildSeq}`), scene, physics, terrain, wind, heroTrees: nextParkDef.heroTrees });
      // Keep whatever graphics preset was already active (js/ui/options.js) applied to the new instance
      // instead of silently reverting to forest.js's own High-quality defaults.
      const preset = GRAPHICS.presets[save.data.settings.graphics] || GRAPHICS.presets.high;
      forest.setLodDistances({ near: Math.round(preset.impostorNear * 0.45), mid: preset.impostorNear });
    }
    parkDef = nextParkDef;
    course = loadPark(parkDef, { scene, physics, terrain, forest, rng: rng.fork(`course-rebuild-${rebuildSeq}`), textures: wood });
    signs = createSigns({ parkDef, scene, terrain, textures: wood, rng: rng.fork(`signs-rebuild-${rebuildSeq}`) });
    publicParkDef = { ...parkDef, routes: parkDef.routes.filter((r) => r.category !== "legendary") };
    parkBoard = createParkBoard({ root: document.getElementById("hud"), scene, physics, parkDef: publicParkDef, terrain, rng: rng.fork(`park-board-rebuild-${rebuildSeq}`), textures: wood });
    interaction = createInteraction({ player, input, belay, course, hud, events, vitals, save, ticket, occupancy });
    session = createSession({ player, course, parkDef, events, hud, save, root: document.getElementById("hud"), ticket, input, stampCard, flow });
    courseMap = createCourseMap({ root: overlay, parkDef: publicParkDef, terrain, save, player, getAgents: () => (agents ? agents.list : []) });
    agents = params.npc ? createAgents({ course, parkDef, terrain, rng: rng.fork(`npc-rebuild-${rebuildSeq}`), occupancy, events }) : null;
    guestRig = agents ? createGuestRig({ scene, guestCount: agents.count }) : null;
    return { course, parkDef };
  }
  const builder = createBuilder({
    scene, terrain, rng: rng.fork("builder"), player, camera, renderer, input, events, loop,
    save, ticket, kassa, briefing, belay, hud, root: overlay,
    world: {
      getParkDef: () => parkDef, getCourse: () => course, getGuests: () => ({ agents, guestRig }),
      // `interaction` is rebuilt right alongside `course` (both close over the old, disposed course
      // otherwise) – a getter here, not a plain constructor param, so js/builder/builder.js's own
      // walkthrough bot always binds to whichever instance is actually live.
      getInteraction: () => interaction,
      applyParkDef: (nextParkDef) => rebuildFromParkDef(nextParkDef),
    },
  });

  const options = createOptions({
    root: overlay, save, input, camera: player.camera, loop, ticket,
    onEndDay: endTicketNow,
    onCourseMap: () => courseMap.open(),
    onBuilder: () => builder.enter(),
    // M2b Graphics section: any/all may be omitted (see js/ui/options.js's own header) – all four exist
    // here. `forest` is a small live-forwarding proxy (not the object itself) because js/builder/
    // builder.js may rebuild the real one after a hero-tree-adding edit – the proxy always calls
    // whichever instance is current instead of latching onto the one that existed at boot.
    renderer, sky, forest: { setLodDistances: (v) => forest.setLodDistances(v) }, groundDetail,
  });
  options.applyAll();   // settings from a previous visit, applied once before the first frame

  // --- classic-mode accident (M2b, GDD §3.5) --------------------------------------------------------
  const accidentReport = createAccidentReport({
    root: overlay,
    onContinue() {
      const hub = terrain.spawn || { x: 0, y: 0, z: 0 };
      player.teleport(hub.x, hub.y, hub.z);
      player.setState("ground");
      belay.reset();
    },
  });
  // Classic mode's F/X ritual only ever runs in "ground" ("standing at an anchor", js/player/
  // interaction.js#update – `anchor` is null in every other mode), so that is the only mode this can
  // ever fire in; `vitals.onPlatform` (already > 1.6 m, the same line that separates a low entry deck
  // from "up in the trees") keeps a fumble at the ground-level entry cable from playing the same
  // dramatic fall a real height would.
  events.on("belay:unsafe", () => {
    if (player.mode !== "ground" || !vitals.onPlatform) return;
    // Only a "lifeline" anchor's label is already localised (js/park/loader.js#buildRouteElement calls
    // `t()` on it); the entry-cable/ring anchors' own `.label` are internal English literals never meant
    // for players, so those fall back to the accident report's own "unknown" copy instead of leaking
    // untranslated text into the German UI (CLAUDE.md "UI-Texte nur über assets/strings").
    const anchor = interaction.anchor;
    const elementLabel = anchor && anchor.kind === "lifeline" ? anchor.label : null;
    const routeName = session.run ? t(session.run.def.nameKey) : null;
    player.setState("accident", { cause: "bothCarabinersOpen", elementLabel, routeName });
  });
  events.on("player:accident-fall", () => { flow.onFall(); accidentReport.showFade(); });
  events.on("player:accident-landed", ({ elementLabel, routeName, seconds }) => {
    save.recordAccident();
    session.abandonActiveRun();
    accidentReport.showReport({ routeName, elementLabel, seconds });
  });

  // --- photo mode (M2b) -----------------------------------------------------------------------------
  const photoMode = createPhotoMode({ camera, input, renderer, loop });
  const photoHint = document.createElement("div");
  photoHint.className = "photo-hint";
  photoHint.hidden = true;
  overlay.appendChild(photoHint);
  function setPhotoHintText() { photoHint.textContent = t("photo.hint"); }
  setPhotoHintText();

  // --- touch overlay (M2b, ROADMAP "Touch-Steuerung") -----------------------------------------------
  const touchControls = (params.touch || isTouchDevice())
    ? createTouchControls({ root: document.getElementById("hud"), input })
    : null;

  const resuming = !params.autoplay && !params.kassa && !params.builder && !!save.data.ticket;
  if (params.builder) {
    // `?builder=1` (verification/testing, GDD §4): straight into builder mode, no kassa at all.
    // `?autowalk=<routeId>` additionally starts that route's walkthrough with the `?autoplay=1` bot
    // immediately – no human at the keyboard needed to prove the obligation actually opens a route.
    if (params.autowalk) builder.startAutowalk(params.autowalk);
    else builder.enter();
  } else if (resuming) resumeDay();
  else if (!params.autoplay) kassa.show();
  if (params.options) { kassa.hide(); options.open(); }   // ?options=1: screenshots (M1.7)

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
    flow: flow.value.toFixed(2),
    routes: course.routes.length,
  }));
  if (params.debug) debug.toggle(true);
  if (params.physics) physics.setDebug(scene, true);

  // --- loop wiring -----------------------------------------------------------------------------------
  loop.on("input", (frameDt) => {
    input.poll();
    if (touchControls) touchControls.update();   // pushes the overlay's held state in before anything reads it
    if (autoplay) autoplay.update(frameDt);   // synthesises key events – must run before consumers read edges
    builder.onInputPhase(frameDt);   // same rule: drives a `?builder=1&autowalk=` bot's own key events
    if (input.pressed("debug")) debug.toggle();
    if (input.pressed("physdebug")) physics.setDebug(scene, !physics.debugEnabled);
    // M3a: none of the screens below make sense while the builder owns the camera/HUD ("editing") or
    // is mid-walkthrough ("walking") – Esc gets its own two builder-specific branches instead.
    const builderOpen = builder.mode !== "closed";
    // Photo mode (M2b): one `toggle()` per press, guarded the same way "pause" above is – never while
    // another screen owns the input, never during `?autoplay=1`.
    if (input.pressed("photo") && !photoMode.active && !options.visible && !courseMap.visible && !params.autoplay && !builderOpen) {
      photoMode.enter();
      document.body.classList.add("photo-mode-active");
      setPhotoHintText();
      photoHint.hidden = false;
    } else if (input.pressed("photo") && photoMode.active) {
      photoMode.exit();
      document.body.classList.remove("photo-mode-active");
      photoHint.hidden = true;
    }
    if (photoMode.active) {
      // Space is "jump" everywhere else – consumed here so it never *also* reaches player.update()'s
      // jump-buffer once the loop unpauses (that buffer does not decay while physics is not stepping).
      if (input.pressed("jump")) photoMode.requestSnapshot();
      input.consume("jump");
    } else if (input.pressed("map") && !options.visible && !builderOpen) {
      courseMap.toggle();
    }
    if (courseMap.visible) {
      // The world keeps living behind the dark overlay (no loop.paused) – only the player's own
      // movement input is gated, the same "a screen is up, check its `visible` flag" idea
      // js/ui/kassa.js and js/ui/stamp-card.js already use for themselves.
      input.move.x = 0; input.move.y = 0;
      if (input.pressed("pause")) courseMap.close();
    } else if (options.visible) {
      // Options itself sets loop.paused (M1.7) – Esc here only toggles its own visibility.
      if (input.pressed("pause")) options.close();
    } else if (builder.mode === "editing" && input.pressed("pause")) {
      builder.exit();   // Esc is the same "leave the builder" affordance as the toolbar's Exit button
    } else if (builder.mode === "walking" && input.pressed("pause")) {
      builder.requestAbortWalk();   // a manual escape hatch if a walkthrough attempt gets stuck
    } else if (!params.autoplay && !photoMode.active && !builderOpen && input.pressed("pause")) {
      options.open();   // `?autoplay=1` never presses this action, but never trust that silently.
    }
    if (input.pressed("camera")) player.setThirdPerson(player.camera.isFirstPerson);
  });
  loop.on("physics", (dt) => {
    player.fixedUpdate(dt);
    physics.step();
  });
  loop.on("gameplay", (dt, elapsed) => {
    // M3a: the builder's own top-down "editing" mode freezes the whole simulation (player/guests hidden,
    // loop.paused already stops physics) – "walking" (the walkthrough) runs every line below completely
    // normally, exactly like the ordinary game, only `agents` stays frozen (see below).
    if (builder.mode === "editing") return;
    player.update(dt);
    ticket.update(dt);
    // Sky follows the ticket's own clock once a day is running (M2b: this is what makes the night
    // ticket's dusk-to-night drift happen at all) – `nightDebugOverride` stands down for
    // `WIPFEL.debug.setNight()` so a forced test state is not immediately overwritten.
    if (ticket.started && !nightDebugOverride) sky.setTimeOfDay(ticket.timeOfDay);
    session.update(dt);
    course.update(dt, elapsed, player.position);
    vitals.update(dt);
    // Flow (M2a, GDD §3.10): "progressing" = actually crossing an obstacle, not just standing on one –
    // js/game/flow.js#update also pauses (not resets) on the ladder and on a platform between elements.
    const onElement = player.mode === "element" || player.mode === "zipline" || player.mode === "tarzan";
    flow.update(dt, { progressing: onElement, frozen: vitals.nerves.frozen, nervesValue: vitals.nerves.value });
    interaction.update(dt);       // the player's own occupancy claim/release happens here first –
    if (agents && builder.mode === "closed") {   // guests below only ever see a slot the player has already taken.
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
    // Night climbing (M2b): the headlamp and the lampions both just read the same continuous factor.
    headlamp.update(sky.night);
    lampions.update(sky.night, camera.position);
  });
  loop.on("render", (alpha, dt) => {
    if (builder.mode === "editing") {
      builder.onRenderPhase(dt);   // orbit camera + span/length labels – owns the shared `camera` instead
    } else {
      player.render(alpha, dt);
      if (photoMode.active) photoMode.update(dt);   // overrides the camera js/player/render just set
      if (guestRig && builder.mode === "closed") guestRig.update(agents.list, player.position, dt, sky.night);
    }
    physics.updateDebug();
    renderer.render(scene, camera);
    if (photoMode.consumeSnapshotRequest()) photoMode.takeSnapshot();
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
    terrain, sky, wind, player, belay, hud, vitals, save, autoplay,
    kassa, briefing, stampCard, ticket, options, occupancy,
    // M3a's builder can rebuild any of these mid-session (js/main.js#rebuildFromParkDef) – getters so
    // this debug surface always reads whichever instance is actually live, never one it disposed.
    get forest() { return forest; }, get parkDef() { return parkDef; }, get course() { return course; },
    get signs() { return signs; }, get interaction() { return interaction; }, get session() { return session; },
    get parkBoard() { return parkBoard; }, get courseMap() { return courseMap; },
    get agents() { return agents; }, get guestRig() { return guestRig; },
    // M2a
    flow, clipMeter, wichtel,
    // M2b
    accidentReport, photoMode, headlamp, lampions, touchControls,
    // M3a
    builder,
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
       * Same path as the options screen's "End day" button (M1.7) – see `endTicketNow` above.
       */
      endTicket() { return endTicketNow(); },
      /**
       * M2b: force the sky to a well-into-the-night hour (screenshots, smoke runs) without needing a
       * real night ticket – stands down the ticket-driven sky sync above until called with `false`.
       * @returns {boolean} the new override state
       */
      setNight(on = true) {
        nightDebugOverride = !!on;
        sky.setTimeOfDay(on ? NIGHT.openingHour + 1.5 : TICKET.openingHour + 4);
        return nightDebugOverride;
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
