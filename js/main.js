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

async function boot() {
  installGlobalHandlers();
  const params = readParams();
  log.info(`${GAME.name} ${GAME.version} · seed=${params.seed} · debug=${params.debug}`);

  const container = document.getElementById("app");
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
  const buildMs = Math.round(performance.now() - t0);
  log.info(`world built in ${buildMs} ms · trees ${forest.trees.length} · hubs ${terrain.hubs.length}`);

  // --- player ----------------------------------------------------------------------------------------
  const player = createPlayer({ physics, scene, camera, input, terrain, rng: rng.fork("player") });

  // --- debug panel -----------------------------------------------------------------------------------
  const debug = new DebugPanel(document.getElementById("debug"), () => ({
    fps: loop.stats.fps.toFixed(0),
    "frame ms": loop.stats.frameMs.toFixed(2),
    "physics ms": loop.stats.physicsMs.toFixed(2),
    "draw calls": renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    bodies: physics.bodyCount,
    colliders: physics.colliderCount,
    trees: forest.trees.length,
    seed: String(params.seed),
    "time of day": sky.timeOfDay.toFixed(2),
    "player": `${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)}`,
    mode: player.mode,
    "speed m/s": player.speed.toFixed(2),
    "world ms": buildMs,
  }));
  if (params.debug) debug.toggle(true);
  if (params.physics) physics.setDebug(scene, true);

  // --- loop wiring -----------------------------------------------------------------------------------
  loop.on("input", () => {
    input.poll();
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
    wind.update(dt);
    sky.update(dt, player.position);
    skyline.update(dt);
    groundDetail.update(dt);
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

  window.WIPFEL = { version: GAME.version, params, loop, physics, scene, camera, renderer, rng, input, events, terrain, forest, sky, wind, player, ready: true };
  loop.start();
  events.emit("boot:ready", { params });
  log.info("boot complete");
}

/**
 * Hero trees = trees the course will hang from. Until the park layout generator (M1.1) exists,
 * ring the spawn hub with pines so the player has real trunks to collide with and M0.4 can mount
 * the first platform on `heroTrees[0]`.
 */
function pickHeroTrees(terrain, rng) {
  const hub = terrain.hubs[0];
  const trees = [];
  const count = 7;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rng.float(-0.25, 0.25);
    const dist = hub.radius + rng.float(2, 7);
    const x = hub.x + Math.cos(angle) * dist;
    const z = hub.z + Math.sin(angle) * dist;
    if (terrain.isPath(x, z)) continue;
    trees.push({ x, z, species: "pine", height: rng.float(21, 26) });
  }
  return trees;
}

boot().catch((err) => showFatal("Unexpected error during start", err));
