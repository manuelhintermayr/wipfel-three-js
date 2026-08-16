// Boot: params → Rapier → renderer → bootstrap scene → loop. Everything else is wired from here.
import * as THREE from "three";
import { GAME } from "./config.js";
import { readParams } from "./core/params.js";
import { installGlobalHandlers, showFatal, log } from "./core/errors.js";
import { Loop } from "./core/loop.js";
import { Input } from "./core/input.js";
import { Rng } from "./core/rng.js";
import { createRenderer } from "./core/renderer.js";
import { initPhysics, GROUP, groups } from "./core/physics.js";
import { DebugPanel } from "./ui/debug.js";
import { events } from "./core/events.js";

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

  const rng = new Rng(params.seed);
  const input = new Input(window);
  const loop = new Loop({ timeScale: params.fast ? 4 : 1 });
  const { renderer, scene, camera } = view;

  // --- bootstrap scene (M0.1): sky, light, ground collider, a falling test body ------------------
  scene.background = new THREE.Color(0x9fc3d9);
  scene.fog = new THREE.Fog(0x9fc3d9, 60, 400);

  const hemi = new THREE.HemisphereLight(0xcfe3f5, 0x3a4a34, 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe7c2, 2.2);
  sun.position.set(40, 60, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 200;
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60; sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const R = physics.RAPIER;
  physics.world.createCollider(
    R.ColliderDesc.cuboid(100, 0.5, 100).setTranslation(0, -0.5, 0).setCollisionGroups(groups(GROUP.TERRAIN)),
  );

  const ballBody = physics.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, 8, 0).setLinearDamping(0.05));
  physics.world.createCollider(R.ColliderDesc.ball(0.5).setRestitution(0.55).setFriction(0.8).setCollisionGroups(groups(GROUP.DYNAMIC)), ballBody);
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), new THREE.MeshStandardMaterial({ color: 0xd8342c, roughness: 0.4, metalness: 0.05 }));
  ballMesh.castShadow = true;
  scene.add(ballMesh);
  const prevPos = new THREE.Vector3(0, 8, 0), currPos = new THREE.Vector3(0, 8, 0);

  camera.position.set(9, 4.5, 11);
  camera.lookAt(0, 1.5, 0);

  // --- debug panel ------------------------------------------------------------------------------
  const debug = new DebugPanel(document.getElementById("debug"), () => ({
    fps: loop.stats.fps.toFixed(0),
    "frame ms": loop.stats.frameMs.toFixed(2),
    "physics ms": loop.stats.physicsMs.toFixed(2),
    "draw calls": renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    bodies: physics.bodyCount,
    colliders: physics.colliderCount,
    seed: String(params.seed),
    "time scale": loop.timeScale,
    "ball y": currPos.y.toFixed(2),
  }));
  if (params.debug) { debug.toggle(true); physics.setDebug(scene, true); }

  // --- loop wiring ------------------------------------------------------------------------------
  loop.on("input", () => {
    input.poll();
    if (input.pressed("debug")) { debug.toggle(); physics.setDebug(scene, debug.visible); }
    if (input.pressed("pause")) loop.paused = !loop.paused;
  });
  loop.on("physics", () => {
    prevPos.copy(currPos);
    physics.step();
    const t = ballBody.translation();
    currPos.set(t.x, t.y, t.z);
  });
  loop.on("render", (alpha) => {
    ballMesh.position.lerpVectors(prevPos, currPos, alpha);
    physics.updateDebug();
    renderer.render(scene, camera);
  });
  loop.on("ui", (dt) => {
    debug.update(dt);
    input.endFrame();
  });

  container.addEventListener("click", () => input.requestPointerLock(renderer.domElement));

  window.WIPFEL = { version: GAME.version, params, loop, physics, scene, camera, renderer, rng, input, events, ready: true };
  loop.start();
  events.emit("boot:ready", { params });
  log.info("boot complete");
}

boot().catch((err) => showFatal("Unexpected error during start", err));
