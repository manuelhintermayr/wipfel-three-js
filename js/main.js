// Boot: params → Rapier → renderer → world (sky, terrain, forest) → player → loop.
import * as THREE from "three";
import { GAME } from "./config.js";
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
import { createFirstCourse } from "./park/first-course.js";
import { createBelay } from "./player/belay.js";
import { createInteraction } from "./player/interaction.js";
import { createVitals } from "./player/vitals.js";
import { createElementState } from "./player/on-element.js";
import { createFallState } from "./player/fall.js";
import { createZiplineState } from "./player/on-zipline.js";
import { createHud } from "./ui/hud.js";
import { armAudio } from "./audio/synth.js";
import { initI18n } from "./core/i18n.js";
import { createSave } from "./core/save.js";
import { createSession } from "./game/session.js";
import { createAutoplay } from "./game/autoplay.js";
import { sfxCarabinerOpen, sfxCarabinerLock, sfxHarnessCatch } from "./audio/sfx.js";

async function boot() {
  installGlobalHandlers();
  const params = readParams();
  log.info(`${GAME.name} ${GAME.version} · seed=${params.seed} · debug=${params.debug}`);

  const container = document.getElementById("app");
  const save = createSave();
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
  const heroTrees = pickHeroTrees(terrain, rng.fork("hero-trees"));
  const forest = createForest({ rng: rng.fork("forest"), scene, physics, terrain, wind, heroTrees });

  // --- park (M0.4: entry deck → block ladder → first platform) -----------------------------------------
  const wood = getWoodTextures(params.seed);
  const course = createFirstCourse({ scene, physics, terrain, forest, rng: rng.fork("course"), textures: wood });
  const buildMs = Math.round(performance.now() - t0);
  log.info(`world built in ${buildMs} ms · trees ${forest.trees.length} · hubs ${terrain.hubs.length} · course on tree #${course.tree.id}`);

  // --- player + belay + HUD ----------------------------------------------------------------------------
  const player = createPlayer({ physics, scene, camera, input, terrain, rng: rng.fork("player"), events });
  const belay = createBelay({ mode: params.belayMode, onEvent: (e) => events.emit(`belay:${e.type}`, e) });
  const hud = createHud(document.getElementById("hud"));
  const vitals = createVitals({ player, input, terrain, hud, events });
  const { balance, stamina, nerves } = vitals;
  player.addState("element", createElementState({ input, events, balance, stamina, nerves, rng: rng.fork("element"), camera: player.camera }));
  player.addState("fall", createFallState({ physics, input, scene, events, balance, stamina, nerves, camera: player.camera }));
  player.addState("zipline", createZiplineState({ input, events, camera: player.camera, hud, stamina, nerves, wind }));
  const interaction = createInteraction({ player, input, belay, course, hud, events, vitals });
  const session = createSession({ player, course, events, hud, save, root: document.getElementById("hud") });
  const autoplay = params.autoplay ? createAutoplay({ player, course, interaction, events, belay, session }) : null;
  armAudio(window);
  events.on("belay:open", () => sfxCarabinerOpen());
  events.on("belay:click", () => sfxCarabinerLock(0.14));
  events.on("player:fell", (e) => sfxHarnessCatch(e && e.first ? 1 : 0.7));
  events.on("zip:finished", (e) => log.info(`flying fox: ${e.outcome} arrival, top speed ${e.maxKmh.toFixed(1)} km/h`));

  // --- debug panel -----------------------------------------------------------------------------------
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
    if (input.pressed("pause")) loop.paused = !loop.paused;
    if (input.pressed("camera")) player.setThirdPerson(player.camera.isFirstPerson);
  });
  loop.on("physics", (dt) => {
    player.fixedUpdate(dt);
    physics.step();
  });
  loop.on("gameplay", (dt, elapsed) => {
    player.update(dt);
    session.update(dt);
    course.update(dt, elapsed);
    vitals.update(dt);
    interaction.update(dt);
    wind.update(dt);
    sky.update(dt, player.position);
    skyline.update(dt);
    terrain.update(dt, player.position);
    groundDetail.update(dt, player.position);
    forest.update(dt, elapsed, player.position);
  });
  loop.on("render", (alpha, dt) => {
    player.render(alpha, dt);
    physics.updateDebug();
    renderer.render(scene, camera);
  });
  loop.on("ui", (dt) => {
    debug.update(dt);
    input.endFrame();
  });

  container.addEventListener("click", () => input.requestPointerLock(renderer.domElement));

  window.WIPFEL = {
    version: GAME.version, params, loop, physics, scene, camera, renderer, rng, input, events,
    terrain, forest, sky, wind, player, course, belay, hud, interaction, vitals, session, save, autoplay,
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
      /** Rider mass for the next Flying Fox – RULES.sizeClasses until the ticket desk exists (M1.3). */
      setRiderMass(kg) { return player.states.get("zipline").setRiderMass(kg); },
      panel: debug,
    },
    ready: true,
  };
  loop.start();
  events.emit("boot:ready", { params });
  log.info("boot complete");
}

/** Course chain layout – `span` must sit inside FIRST_COURSE.min/maxSpan (6–13.5 m). */
const COURSE = Object.freeze({ trees: 4, span: 8.6, turn: 0.42, extras: 4, clear: 15 });

/**
 * Hero trees = trees the course will hang from. Until the park layout generator (M1.1) exists this
 * lays out a deterministic *chain* of pines walking away from the spawn hub, `COURSE.span` metres
 * apart – the distance first-course.js needs to hang an exercise between two of them. A few extra
 * trunks ring the hub for collision and silhouette; they stay `COURSE.clear` metres away from the
 * chain so the greedy chain search in first-course.js cannot pick one of them up by mistake.
 */
function pickHeroTrees(terrain, rng) {
  const hub = terrain.hubs[0];
  const pine = (x, z) => ({ x, z, species: "pine", height: rng.float(21, 26) });
  const chain = [];
  let heading = rng.float(0, Math.PI * 2);
  let x = hub.x + Math.cos(heading) * hub.radius * 0.55;
  let z = hub.z + Math.sin(heading) * hub.radius * 0.55;
  for (let i = 0; i < COURSE.trees; i++) {                     // the chain the exercises span
    chain.push(pine(x, z));
    heading += rng.float(-COURSE.turn, COURSE.turn);
    x += Math.cos(heading) * COURSE.span;
    z += Math.sin(heading) * COURSE.span;
  }
  const trees = chain.slice();
  for (let i = 0; i < COURSE.extras; i++) {                    // trunks for the clearing, well clear
    const angle = heading + Math.PI + (i / COURSE.extras) * Math.PI * 1.4 + rng.float(-0.2, 0.2);
    const ex = hub.x + Math.cos(angle) * (hub.radius + rng.float(1, 5));
    const ez = hub.z + Math.sin(angle) * (hub.radius + rng.float(1, 5));
    if (terrain.isPath(ex, ez)) continue;
    if (chain.some((t) => Math.hypot(t.x - ex, t.z - ez) < COURSE.clear)) continue;
    trees.push(pine(ex, ez));
  }
  return trees;
}

boot().catch((err) => showFatal("Unexpected error during start", err));
