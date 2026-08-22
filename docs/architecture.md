# ARCHITECTURE – Wipfel (living document, update with every new module)

Static ES-module site. `js/main.js` boots and wires everything; modules never reach into each other's
internals – they talk through the constructor options below, the `events` bus (`core/events.js`) and
the loop phases (`core/loop.js`: input → physics → gameplay → render → ui).

## Runtime skeleton (M0.1 – done)
| Module | Owns | API |
|---|---|---|
| `js/config.js` | all constants (physics Hz, categories, rules, size classes, defaults) | frozen objects |
| `js/core/params.js` | URL flags | `readParams() → {debug, autoplay, fast, seed, locale, belayMode}` |
| `js/core/rng.js` | determinism | `new Rng(seed)`, `.next/.float/.int/.bool/.pick/.gaussian/.shuffle/.fork(label)`, `hash32`, `makeNoise2D(seed)`, `fbm2D` |
| `js/core/loop.js` | fixed 60 Hz physics + interpolated render | `loop.on(phase, fn)`, `loop.start()`, `loop.paused`, `loop.timeScale`, `loop.stats {fps, frameMs, physicsMs}` |
| `js/core/input.js` | keyboard/mouse/gamepad → actions | `input.poll()`, `.move{x,y}`, `.look{x,y}`, `.down(a)`, `.pressed(a)`, `.released(a)`, `.endFrame()`, `.requestPointerLock(el)`; actions: moveUp/Down/Left/Right, sprint, jump, clip, clip2, handL, handR, interact, breathe, map, pause, camera, debug, photo |
| `js/core/renderer.js` | WebGLRenderer (ACES, sRGB, PCF shadows), scene, camera, resize | `createRenderer(container) → {renderer, scene, camera, resize}` |
| `js/core/physics.js` | Rapier world, step, collision groups, debug lines | `initPhysics() → Physics {RAPIER, world, step(), bodyCount, colliderCount, setDebug(scene,on), updateDebug()}`, `GROUP`, `groups(membership, filter)` |
| `js/core/errors.js` | fatal screen, tagged logging | `showFatal(title, err, hint)`, `installGlobalHandlers()`, `log.info/warn/error` |
| `js/core/events.js` | event bus | `events.on/once/off/emit` |
| `js/ui/debug.js` | F1 panel | `new DebugPanel(root, probe)`, `.toggle()`, `.update(dt)` |

Collision groups (`GROUP`): TERRAIN, STATIC (platforms, trunks, ladders), PLAYER, NPC, DYNAMIC, SENSOR.
Units: metres, seconds, kilograms. +Y up. The slope descends towards −Z (south = towards the city).

## World modules (M0.2 – contracts)

### `js/world/terrain.js`
```js
createTerrain({ rng, physics, scene, size = WORLD.size, resolution = 2 }) → {
  mesh,                       // THREE.Mesh, receives shadows, procedural ground material
  heightAt(x, z),             // metres (bilinear), for placement + spawn
  normalAt(x, z, out?),       // THREE.Vector3
  slopeAt(x, z),              // radians
  isPath(x, z),               // true on packed forest paths (no trees/scatter there)
  bounds: { min: {x,z}, max: {x,z} },
  hubs: [{x, z, radius}],     // flat areas for kassa/hut/start decks
  spawn: {x, y, z},           // default player spawn (on a hub, facing the slope)
  dispose()
}
```
Heightfield: layered coherent noise (fbm) + slope N→S + erosion-inspired shaping (talweg carving,
smoothing on paths, flattened hubs) – never raw white noise. Rapier: `ColliderDesc.heightfield` in
GROUP.TERRAIN. Material: procedural canvas albedo/normal/roughness for leaf litter, dirt, moss; blend by
slope/height/moisture in the fragment shader (onBeforeCompile) or vertex colours. `ground-detail.js`
scatters stones, roots, grass tufts, twigs as InstancedMesh (seeded, exclusion via `isPath`, later via
platform positions).

### `js/world/forest.js` (+ `js/procgen/geometry/tree.js`, `js/procgen/textures/bark.js`, `foliage.js`)
```js
createForest({ rng, scene, physics, terrain, wind, heroTrees = [], targetCount }) → {
  trees: [{ id, x, y, z, species, height, trunkRadius, crownRadius, isHero }],
  update(dt, elapsed),        // wind animation uniforms
  dispose()
}
```
Species archetypes: `pine` (Schwarzkiefer – dominant near platforms: straight, 18–28 m, plated bark,
needle clusters high up), `oak`, `beech`, `maple`, `hazel` (understory). Trunk = tapered, slightly bent
tube; branches = few L-system tubes; foliage = instanced alpha-tested cluster cards (procedural leaf/
needle textures) with wind displacement in the vertex shader; LOD (near full geometry, mid reduced
cards, far crossed impostor quads). Density map + exclusion (paths, hubs, hero-tree clearance) +
course-aware "hero" trees with Rapier cylinder colliders (GROUP.STATIC). All instancing; target
< 120 draw calls for the whole forest.

### `js/world/wind.js`
```js
createWind({ rng }) → { time, strength, direction: THREE.Vector2, gust, update(dt), uniforms }
```
Shared uniforms `{ uTime, uWindStrength, uWindDir }` for foliage/grass/cable shaders.

### `js/world/sky.js` + `js/world/lighting.js` + `js/world/skyline.js`
```js
createSky({ scene, renderer, rng }) → { sun /* DirectionalLight */, hemi, setTimeOfDay(hours), update(dt, focusPos), dispose() }
```
Procedural sky dome (gradient + sun disc + haze band), fog matched to sky, sun shadow frustum follows
`focusPos`, late-afternoon default, night mode later; `skyline.js` adds a distant city silhouette + hills
on the southern horizon (fog-tinted planes).

## Player (M0.3 – contract)
```js
createPlayer({ physics, scene, camera, input, terrain, rng, spawn }) → {
  body, position: THREE.Vector3, velocity, mode: "ground"|"ladder"|"element"|"fall"|"zipline",
  rig: { root, setPose(name, weight), attach: { hipsFront, handL, handR, back } },
  fixedUpdate(dt),            // physics phase: KCC move, ground detection, jump, slopes
  update(dt),                 // gameplay phase: state machine, camera
  render(alpha),              // interpolation, rig pose blending
  setThirdPerson(bool)
}
```
Camera: shoulder (default) with collision (Rapier ray/shape cast against TERRAIN|STATIC), adaptive FOV,
first-person toggle. Rig: procedural humanoid (climber per mockup) with pose blending – see
`docs/reference/mockup/README.md`.

## Conventions
- Every module exports a `create*(options)` factory returning a plain object with `dispose()`.
- No module touches `document` except `ui/*`. No module reads `location` except `core/params.js`.
- Files ≤ ~400 lines; split by responsibility. JSDoc on public factories.
- Debug-only globals live on `window.WIPFEL` (set in `main.js`).
