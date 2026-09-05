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
Belay modes live in `js/config.js#BELAY_MODES`; `core/params.js` validates `?belay=` against them.
Units: metres, seconds, kilograms. +Y up. The slope descends towards −Z (south = towards the city).

## World modules (M0.2 – contracts)

### `js/world/terrain.js`
```js
createTerrain({ rng, physics, scene, size = WORLD.size, resolution = 2 }) → {
  group,                      // THREE.Group of chunk meshes, receive shadows, never cast
  chunks, chunkStats,         // [{ mesh, lod, minX, maxX, minZ, maxZ }] · { chunks, cells, byLod }
  update(dt, focusPos),       // gameplay phase: LOD per chunk (call it from main.js after sky.update)
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
GROUP.TERRAIN (one collider over the whole field, independent of the mesh LOD). Material: procedural
canvas albedo/normal/roughness for leaf litter, dirt, moss; blend by slope/height/moisture in the
fragment shader (onBeforeCompile) and vertex colours.

### `js/world/terrain/chunks.js` + `js/world/terrain/chunk-index.js`
```js
buildChunkIndex(cells, strides) → { index: Uint32Array, ranges: [{start,count}], vertexCount }   // pure
chunkLodFor(distance, current, { near, mid, hysteresis }) → 0|1|2                                 // pure
createTerrainChunks({ field, sampler, rng, material, duffSlopeDeg }) → { group, chunks, stats, ranges, update(focusPos), dispose() }
```
`CHUNKS` = 6 × 6 chunks of 80 m, strides `[1, 2, 4]` (2 / 4 / 8 m grid), `near` 70 m, `mid` 170 m,
`hysteresis` 14 m, `skirtDepth` 2.6 m. Every chunk owns **one** vertex buffer and **one** index
buffer holding the three triangle lists back to back – `geometry.setDrawRange` picks the level, so an
LOD switch uploads nothing and can never crack *inside* a chunk. Against a neighbour at a different
level each level also draws a **skirt**: a wall along the four chunk edges hanging `skirtDepth` below
the rim, built from four extra vertex rows that all levels share. Vertex normals come from
`sampler.normalAt` (not `computeVertexNormals`), so shading is continuous across chunk borders.
Vertices are in world space (`matrixAutoUpdate = false`); LOD selection uses the distance to the
chunk's nearest point, so **geometry never depends on the camera** and the world stays deterministic.
Chunk meshes carry real bounding boxes: in a ground-level view the frustum keeps 4–12 of the 36.

### `js/world/ground-detail.js`
```js
createGroundDetail({ rng, scene, terrain, wind?, exclude? }) → { meshes, uniforms, update(dt, focusPos?), dispose() }
```
Scatters pebbles, stones, roots, twigs, grass tufts and leaf clumps as six InstancedMeshes (seeded,
exclusion via `isPath` and hubs). Each spot is baked into a matrix + colour **once**; `update` re-packs
the instance buffers with the spots inside `GROUND_DETAIL.radius` (45–90 m per family) whenever the
focus has moved `refreshMoveMetres`, and sets `mesh.count`. Pebbles, twigs and leaf clumps do not cast
shadows – they are smaller than a shadow-map texel (`SKY.shadow.size` 70 m over 2048).

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
< 120 draw calls for the whole forest. `FOREST_LOD`: `near` 45 m, `mid` 100 m, hysteresis 1.12.
Only LOD 0 casts shadows – a LOD 1 tree is already outside the 70 m sun shadow box, so submitting it
would cost draw calls for nothing.

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

States are plain objects (`player/states.js`). A state that moves the body itself sets
`ownsMovement: true`; the controller then skips the KCC step, `postMove` and heading smoothing for
that frame and the state calls `player.moveTo(x, y, z)` / `player.setHeading(yaw)` instead.

## Park (M0.4 – contracts)

Structures are described part by part in a local frame and merged into **one mesh per material**
(`js/park/timber.js`), so one platform costs 3–5 draw calls instead of ~20. All parts get
world-scaled UVs, so the wood grain keeps its real size and runs along each part's long axis.

### `js/procgen/textures/wood.js`
```js
getWoodTextures(seed, { size = 512 }) → {
  plank, log, weathered           // each { map, normalMap, roughnessMap, tileMetres, normalScale }
}
```
Canvas2D, seeded, cached per (seed, size). Growth-ring figure with cathedral wander, knots that
deflect the rings, drying checks on the round poles, silvered raised grain and lichen on the
weathered boards. Grain runs along U in every set.

### `js/park/timber.js`
```js
createTimberBuilder({ textures, signMap? }) → {
  materials,                                        // plank, log, weathered, dark, steel, rubber, rope, cord, sign, signal, chalk
  box({ length, width, thickness, position, rotation?|quaternion?, material }),   // length = X = grain
  cylinderBetween({ from, to, radius, segments?, material }),
  tube({ points, radius, segments?, radialSegments?, material }),                 // cables, ropes, rods
  torus({ centre, radius, tube, segments?, material }),                           // cable rings, bands
  plate({ radius, position, rotation?, material }),                               // pictogram signs
  build(name) → THREE.Group,                        // one merged, shadow-casting mesh per material
  dispose()
}
uprightQuaternion(yaw)          // length → +Y, thickness → outwards at yaw, width → tangential
disposeStructure(group, builder)
```

### `js/park/platform.js`
```js
createPlatform({ scene, physics, tree, height, radius = 1.2, kind = "standard", facing = 0, rng, textures }) → {
  group, top,                                       // world y of the deck surface
  anchorPoints: { ring, ringCentre, ringRadius, deck },   // THREE.Vector3 world positions
  colliders, kind, capacity, dispose()
}
```
Rectangle of round logs + two joists around the trunk, planks with 16 mm gaps and a circular
cut-out, rubber sleeve under the deck, eight wooden clamp staves pressed onto the bark by two
threaded steel bands (never a bolt into the tree), diagonal struts to the ground below 6.5 m, and a
12 mm steel safety-cable ring 1.9 m above the deck on four standoff brackets. No railing.
Rapier: one cuboid for the deck (16 cm thick – a 5 cm slab lets the KCC's ground-stick sink through)
and a cylinder for the sleeve, both GROUP.STATIC.

### `js/park/entry-deck.js`
```js
createEntryDeck({ scene, physics, position, facing, rng, textures }) → { group, top, clipAnchor, colliders, dispose() }
```
40 cm deck on six round posts, bench, two posts with a short 12 mm cable (`clipAnchor` = the world
position of that stub) and a round pictogram sign painted on canvas. `facing` points at the tree.

### `js/elements/ladder.js`
```js
createBlockLadder({ scene, physics, tree, fromY, toY, side, rng, textures }) → {
  group, rail: { start, end, length }, safetyCable: { start, end }, steps: THREE.Vector3[], colliders, side, dispose()
}
```
Dark spine boards (stacked, so they follow the tapering trunk), step blocks 10 × 10 × 20 cm
alternating left/right every 28 cm, clamp pads with rods around the trunk, the steel cable 15 cm off
the spine face, a blue helper rope. No colliders on the steps – climbing is rail locomotion; only a
thin slab on the spine. `rail` is the line the feet travel along.

`trunkRadiusAt(tree, y)` (`procgen/geometry/tree-species.js`) reproduces the trunk taper and root
flare of the mesh. Anything clamped to a trunk must use it, or it floats at the top and sinks in at
the foot.

## Park layout + loader (M1.1 – contracts)

Two halves, split the way the M0.5 catalogue already split *what* an element is (`catalogue-data.js`,
no THREE) from *how it is built* (`element.js` + twelve concrete modules): the **generator** decides
where every tree, platform, exercise and zip line goes and is pure JSON-serialisable data, importable
under plain `node`; the **loader** turns one generator output into a scene. Supersedes M0.4's
`js/park/first-course.js` (deleted): that module heuristically picked a hero-pine chain and hand-built
one four-platform blue course; the generator now decides every route, so the loader only builds what
it is told.

### `js/park/layout.js` + `layout-route.js` + `layout-validate.js`
```js
generateParkLayout({ seed, terrain: { heightAt, isPath, slopeAt, hubs }, config? }) → {
  id, seed, generated: true,
  heroTrees: [{ x, z, species, height }],
  routes: [{ id, category, numeral, nameKey, entry: {x,z,facing},
    platforms: [{ id, treeIndex, deckHeight, kind, radius }],   // treeIndex → heroTrees
    edges: [{ id, kind, from, to }],                            // kind = a catalogue.js element kind
    zip: { fromPlatformId, landing: {x,z}, dir: {x,z}, length, gradient, deckTop, drop } }]
}
```
`PARK_CONFIG` (in `layout.js`): 2 blue / 2 red / 2 black routes, chain lengths 4/4/5 platforms
(§ the file's own header comment explains why red/black are one platform short of the GDD's 5/6 –
the ≤ 26 total-platform hard cap). Routes are placed one at a time, fanned out from the spawn hub at
even bearings with retried jitter on failure ("relax tree-angle first"); `layout-validate.js` is the
predicate library every candidate is checked against (span 6–13.5 m, category deck-height window and
rise limit, hub/path/cross-route clearance, zip gradient/landing rules) and is reused verbatim by
`tests/unit/layout.test.mjs` and `tools/bake-park.mjs`/`tools/dev/smoke-layout.mjs`
(headless via `tools/headless-terrain.mjs`, which duplicates `terrain.js`'s sampler for the documented
reason at the top of that file – no THREE, no browser). Route "blue-1" keeps the M0 course's exact
element kinds/ids (`layout-route.js#LEGACY_BLUE_1`) so the hand-tuned course stays reachable by name.

### `js/park/loader.js`
```js
loadPark(parkDef, { scene, physics, terrain, forest, rng, textures?, wind? }) → course {
  routes: [{ id, category, numeral, nameKey, tree, trees, facing, platform, platforms, ladder,
    entryDeck, elements, zipline, zipLanding, ladderAnchorId, topAnchorId }],
  anchors, graph: { nodes, edges },
  anchorById(id), nearestAnchor(pos, range?, excludeId?), nearestEntry(pos, range?),
  entryFor(anchorId, pos, range?), elementFor(anchorId), ladderFor(anchorId), routeFor(id),
  update(dt, elapsed), dispose(),
  // + route "blue-1" spread onto the top level (tree, platforms, ladder, entryDeck, …) so the M0
  // consumers that only know one route (js/player/interaction.js, js/game/autoplay.js) keep working
}
```
Builds all six routes: platforms via `platform.js` on `forest.trees[platform.treeIndex]` (hero trees
land in `forest.trees` in `parkDef.heroTrees` order – `forest-placement.js` inserts them first, before
the dart-throwing pass), entry deck + ladder via `entry-deck.js`/`elements/ladder.js`, exercises via
`elements/catalogue.js#createElement` (`edge.kind` looked up directly – no per-kind switch), the zip
+ arrival deck via `zip-landing.js` using the generator's already-searched `route.zip` (never calls
`zip-plan.js#planZipline` again). Anchor ids are route-scoped so six routes never collide:
`${routeId}-deck` (entry cable), `${platform.id}-ring`, `elem-${edge.id}` (exercise lifeline),
`${routeId}-zip` (== the zip element's id), `${routeId}-zip-out` (landing clip-out).

**Draw-call SCALE CHECK:** `createPlatform`/`createEntryDeck`/`createBlockLadder`/`createZipLanding`
each build with their own `timber.js` builder, so a route's platforms alone start life as 16–20 tiny
meshes. None of that geometry moves again once built (unlike the zip's cable/net/trolley, which are
repositioned every frame, or a rail element's wobble-deformed mesh), so `loader.js#mergeRouteStatics`
bakes every structure's already world-positioned mesh – plus the zip's own static "fixed" hardware
(gate, terminations, marker) – back down to one mesh per material *per route* (`timber.mergeParts`,
exported for exactly this reuse), using the park's one shared `timber.materials` so the merged meshes
need no material lifetime of their own. Per-route (not park-wide) so a route out of frame still culls
as a whole. Cuts the six-route park from ~590 to ~430 draw calls at the default spawn view (target
≤ 420; the remainder is per-instance dynamic geometry – zip rides, element wobble meshes, the player
rig – that cannot be merged without breaking their own animation).

### `tools/bake-park.mjs`
`node tools/bake-park.mjs [seed]` writes a pretty-printed `generateParkLayout()` snapshot to
`assets/parks/<parkDef.id>.json` off the headless terrain sampler. The live game never reads this
file (`js/main.js#boot` calls `generateParkLayout` itself against the real terrain) – it is the
reproducibility record ROADMAP M1.1 asks for.

## Park signage (M1.2 – contract)

### `js/park/signs.js`
```js
createSigns({ parkDef, scene, terrain, textures, rng }) → { group: THREE.Group, dispose() }
```
A second, small "loader": reads `parkDef` and the terrain sampler directly (never the built `course`,
so it can run before or after `loadPark` without caring which) and builds the signage from
`docs/reference/photos/README.md`'s "Wegweiser" – arrow-shaped white boards, thick category-colour
border, the category word in capitals, the category symbol (accessibility: colour is never the only
cue) and route numerals in white circles. Two kinds: a **hub cluster** near the spawn hub's rim, one
post + board per category present in the park, each board yawed to the average bearing (circular mean)
of that category's own route entries – a real trailhead fingerpost, every blade turns to face its own
trail; and an **entry sign** per route beside its entry deck (numeral + localised name). Every board is
two flat arrow silhouettes (`arrowGeometry`, a `THREE.Shape` with hand-remapped 0–1 UVs, no extrusion):
a white face with a unique baked canvas texture (`paintCategoryBoard`/`paintEntryBoard`, `ctx.fillText`
– the first use of real text rendering in this codebase, existing signs are icon-only) and a slightly
larger category-colour backer sat behind it. The board is mounted shifted forward from its post by half
its own length, so the post lands at the arrow's *tail* – mounted at the board's centre instead, the
post would stand straight through the middle of the printed face and blot out whatever sits there
(found the hard way: every board was losing its text at the same point regardless of word length).
Draw calls stay low the same way `js/park/loader.js` does it: one merged mesh for every post
(`timber.js` builder, shared "log" bucket) and one merged mesh **per category colour** for every backer
board (`timber.js#mergeParts`, reused directly – a category's hub board and its routes' entry boards
all fold into the same colour bucket) regardless of how many signs use it; only the white face stays
one mesh per board, because its text is unique. None of it casts a shadow (a thin board's shadow is a
sliver not worth a doubled draw call – the same call `world/ground-detail.js` already made for
pebbles/twigs). Category words shrink to fit ahead of the numeral circles (`fitText`, measures then
rescales) – German runs longer than English ("SCHWARZ" vs "BLACK") and both must clear the *edge* of
the first circle, not its centre.

## Rail elements (M0.5 – contracts)

### `js/elements/element.js`
```js
registerElementKind(kind, factory)                  // concrete modules register themselves on import
createElement(spec, ctx) → element                  // spec: { id, kind, label, lifelineAnchorId,
                                                    //   groundY, entry: {platformId, position}, exit: {…} }
createWobble(config) → { lateral, vertical, lateralVelocity, amplitude, excite(a, v?), update(dt), reset() }
createElementBase(spec, ctx, impl) → {
  id, kind, label, length, frame, config, group, colliders, wobble, handHold, lifeline,
  walkSpeed, slipAngle, staminaDrain, occupancy: { active, t }, groundY,
  pointAt(t, out), tangentAt(t, out), footholdAt(t), localOffsetAt(u, out),
  getEntryAnchor(), getExitAnchor(),                // { id, elementId, platformId, position, stand, end }
  getDifficultyMetrics(),                           // { physical, coordination, psychological, technical } 0–5
  build(), createPhysics(), update(dt, elapsed), dispose()
}
```
Local frame: origin at the entry foot point, +X along the span, +Y up, +Z to the climber's right; the
visual group is placed and yawed to match, so every builder works in plain local metres. `wobble` is
two damped harmonic oscillators (lateral sway, vertical bounce) excited by steps, leaning and wind.
`lifeline` is the 12 mm steel cable from platform ring to platform ring, 2.05 m above the walking
line, with `pointAt(t)` and `closestT(position)` – the carabiners ride it and it never moves.

### `js/elements/element-parts.js` + `js/elements/element-deform.js`
```js
cableRun(builder, { from, to, sag?, radius?, material?, spread? }) → points[]
ropeStrand(builder, { from, to, radius?, material?, twist? })      // visible lay of the strands
cableTermination(builder, { at, along, radius? })                  // swaged sleeves + shackle pin
lifelineCable(builder, frame, element)   netKnot(builder, { at, size?, yaw? })
createDeformer(meshes, { classify, groupCount?, margin? }) → { offsets, update(shape?), rest(), dispose() }
```
The timber builder welds a whole element into one mesh per material, which is what keeps the draw
calls down – so the deformer classifies every vertex once into a station `u`, a group (whole span, or
one plank) and a weight, and rewrites the rest positions from `offsets` each frame.

### The element library (M0.5 + M1.8 – 12 traversable kinds)
`js/elements/catalogue.js` imports all twelve concrete modules for their `registerElementKind` side
effect and re-exports their static metadata (`labelKey`, `discrete`, `metrics`) from the THREE-free
`catalogue-data.js`, so a layout generator (M1.1) can enumerate what is buildable without importing
each module, and `tools/dev/elements.html` can build every kind side by side for inspection.
`element.discrete === true` marks the kinds crossed one step at a time (`js/player/on-element.js`
reads it instead of a hardcoded kind check; `js/game/autoplay.js` does the same for the smoke bot).

| Module | kind | Hardware | Movement | Metrics (p/c/ψ/t) |
|---|---|---|---|---|
| `js/elements/burma-bridge.js` | `burma-bridge` | 12 mm foot cable, two hand cables 1.32 m up fanning out, hemp stirrups every 1.15 m, 2 % sag | walk, 0.60 m/s, strong lateral wobble | 2·3·3·1 |
| `js/elements/hanging-planks.js` | `hanging-planks` | 6–12 boards 60 × 22 × 5 cm on rope pairs from two carrier cables, pitch fitted to the span | **one press of W per plank**, 0.35 s swing wait, each plank its own pendulum | 1·4·4·1 |
| `js/elements/net-bridge.js` | `net-bridge` | 1.2 m wide cargo net, 15 cm mesh, side cables + hand ropes, dent that follows the climber | crawl, 0.50 m/s, no balance loss, drains strength | 4·1·1·1 |
| `js/elements/zipline.js` | `zipline` | 12 mm cable with 2 % sag, trolley, braking net + marker sleeve, start gate | **not a rail** – see the Flying Fox section below | 1·2·2·3 |
| `js/elements/beam-fixed.js` | `beam-fixed` | one bolted Ø 20 cm log, slight upward camber, no hand hold at all | walk, 0.55 m/s, nothing to correct with but the body | 1·3·4·1 |
| `js/elements/beam-swing.js` | `beam-swing` | 3–4 Ø 19 cm log segments on chain hangers from two carrier cables, butted end to end | walk continuously; whichever log is underfoot sways sideways on its own | 2·4·4·1 |
| `js/elements/stirrups.js` | `stirrups` | hemp stirrups (wooden tread) every 45 cm from two hand ropes | **one press of W per stirrup**, both hands always occupied | 2·4·3·1 |
| `js/elements/wire-loops.js` | `wire-loops` | plain rope eyes every 45 cm, same two-hand-rope rig as the stirrups | **one press of W per loop** – no rigid tread, the foot can twist in it | 2·5·3·1 |
| `js/elements/barrels.js` | `barrels` | 4–6 Ø 60 cm barrels strung on a hung axle cable, no hand cable | walk continuously, 0.55 m/s; the barrel underfoot rolls (own mesh, true rotation – the deformer only offsets, so it cannot spin one) | 2·5·3·2 |
| `js/elements/rings.js` | `rings` | wooden rings Ø 22 cm every 50 cm on an overhead cable | **one press of W per ring**; hangs the whole way, feet free, heavy stamina drain | 5·3·4·2 |
| `js/elements/tarzan.js` | `tarzan` | rope from an overhead pivot at mid-span (deterministic sine swing), catch net on the far side | its own player state (`js/player/on-tarzan.js`, `element.playerState = "tarzan"`): Space at the edge, ±0.25 s catch window or hand-off to `fall` on the safety cable, then W climbs from the net | 3·3·5·2 |
| `js/elements/skate.js` | `skate` | 80 × 25 cm board on two hangers riding two overhead cables (repositioned every frame, like the zip line's trolley) | W shoves, glides with momentum + damping (`element.railAccel` overrides the shared rate), max 1.6 m/s | 2·5·3·2 |

## Flying Fox (M0.6 – contracts)

The ride is split three ways: **pure model** (`js/zipline/*.js`), **hardware** (`js/elements/zipline.js`
+ `js/park/zip-landing.js`) and **player state** (`js/player/on-zipline.js`). The element owns one
`createZipPhysics` instance; the geometry and the ride read the same curve from it, so the trolley is
always exactly where the model says it is.

### `js/zipline/physics.js` + `js/zipline/brakes.js` (pure logic, unit-tested)
```js
createZipPhysics({ start, end, sagRatio?, massKg?, dragCoeff?, rollResist?, windAlong?, samples? }) → {
  length, chord, run, drop, gradient, sag, massKg, windAlong,
  s, v, speedKmh, maxSpeed, maxSpeedKmh, progress, stalled, done,
  update(dt, { tuck }) → { s, v, done, stalled },
  pointAt(s, out), tangentAt(s, out), slopeAt(s), fractionAt(s), accelAt(s, v, tuck),
  push(speed?), haul(dt, speed?), setSpeed(v), setWindAlong(v), setMass(kg), reset(options?)
}
createNetBrake({ length, zoneLength?, arriveSpeed?, maxDecel?, messyDecel?, messyJolt? }) → {
  zoneStart, netAt, outcome: "clean"|"messy"|null, inZone(s), apply(dt, s, v, legsUp) → v', reset()
}
```
The cable is a **parabola** hung under the chord, not a true catenary: at 2 % sag the two differ by
under a centimetre over 50 m, and the parabola has closed-form derivatives. `dv/dt = g·slope(s) −
(drag/m)·|v−wind|·(v−wind) − rollResist·g`, semi-implicit at the fixed step. Sag scales with mass
(`sagMassGain`), so a heavier rider gets a steeper first half *and* more momentum per square metre of
drag – heavier is faster, exactly as RESEARCH-DATA §6 says. The sag also makes the last metres flatter
than the chord (often slightly uphill), which is why a loose line is "fast in the middle, slow at the
end" and why a light rider in a head wind can stall short (`stalled` → haul in by hand).
The brake **latches its outcome at `zoneStart`** – the red-and-white sleeve on the cable – because
once the net has your ankles, changing your mind is not a thing.

### `js/park/zip-plan.js`
```js
planZipline({ tree, platformTop, cableHeight, seatDrop, startOffset?, home, terrain, forest, config? })
  → { dir, start, length, gradient, drop, deckTop, deckHeight, landing, clearance, margin, relaxed } | null
```
The first piece of the layout **validation** M1.1 will own for the whole park: gradient 4.5–6 % of the
chord, arrival deck 1.6–2.8 m over the ground, ≥ 2.2 m of air under the rider's feet across the middle
of the span, no trunk inside 2.6 m, no crown the cable would pass *through*, landing clear of a path.
Deterministic grid search over 120 directions × lengths × gradients, scored towards ~5.5 %, a long
span and a short walk home; a second, relaxed pass runs only if the seed leaves nothing (`relaxed`).
Nothing here touches THREE.

### `js/elements/zipline.js` (kind `zipline`)
```js
createZipline(spec, ctx) → element      // element + { zip, brake, playerState: "zipline", oneWay: true,
                                        //   seatDrop, slingLength, landing, anchorRange,
                                        //   setRider(s|null, dip), trolleyAt(s, out) }
createZipPictogram(size?) → THREE.Texture   // "sit down, legs up" – the timber kit's sign map
```
Built on `createElementBase` with `lifelineHeight = cableHeight` (2.05 m), so **the zip cable is the
lifeline**: the belay anchors, the two-click ritual and the platform prompts all work unchanged. Four
groups: the fixed hardware (terminations, start gate, marker sleeve), the cable on its own (so the
deformer can pull it down under the trolley, the dent trick from `net-bridge.js`), the braking net and
the trolley – the last two slide along the cable from `setRider`. `element.playerState` is what sends
the interaction to the zipline state instead of the walk-a-rail one; `oneWay` stops you clipping in at
the landing and riding back up. Difficulty metrics 1·2·2·3 (GDD §3.4).

### `js/park/zip-landing.js`
```js
createZipLanding({ scene, physics, position, facing, deckHeight, cableHeight, groundAt?, rng, textures })
  → { group, top, stand, clipAnchor, anchorTop, colliders, dispose() }
```
The "Zip-Ankunft" deck: on this hillside the ground falls away faster than a 3–6 % cable may, so the
arrival is a small platform on posts with a plank ramp down to a bed of wood chips, a rail on the far
edge, a cable stub to clip into while the trolley comes off, and the dead-end anchor (log post, steel
tube, turnbuckle, raked earth rod). Colliders: deck slab, ramp and the anchor post. The chip bed is a
displaced disc that samples the terrain per vertex, so it beds into the slope.

### `js/player/on-zipline.js`
```js
createZiplineState({ input, events?, camera?, hud?, stamina, nerves, wind? }) → state   // "zipline"
```
`ownsMovement` **and** `showBody`: first person for the whole ride (restoring the shoulder camera
afterwards), but the rig stays visible with the head hidden, because the knees coming up *are* the
readout. Space is the whole ride: hold it to tuck (less drag) and to have the legs up when the net
takes hold – one input, two meanings. A/D twist the body (cosmetic). FOV widens with speed, the HUD
speedometer is on only here, `sfxTrolley`/`sfxWindRush` follow the speed and `sfxZipArrive(clean)`
ends it. Debug: `setWindAlong(m/s|null)`, `setRiderMass(kg)`. Events: `zip:seated`, `zip:push`,
`zip:finished { maxKmh, outcome }`.

## Belay, interaction, HUD and audio (M0.4)

### `js/player/belay.js` (pure logic, unit-tested)
```js
createBelay({ mode = "smart", onEvent }) → {
  mode, setMode(next),                 // M1.3: live getter + kassa mode switch (resets both carabiners open)
  state(), isSafe(), bothOnSameAnchor(), currentAnchor(), pendingAnchor(),
  clipTo(anchorId, carabiner?),        // ONE step of the current mode's ritual
  attach(anchorId),                    // continuous only
  open(carabiner), clip(carabiner, anchorId),   // classic only
  detach(), reset(), setOnEvent(fn)
}
```
Carabiner states `clipped | locked | open`. In "smart" mode press 1 locks the follower and moves the
lead across (`pendingAnchor`), press 2 brings the follower over and only then does `currentAnchor`
change – both can never be open. "continuous" attaches both in one press. "classic" lets you get it
wrong (`isSafe() === false`, event `unsafe`). Events `open | click | locked | unsafe` are forwarded
to the bus as `belay:*` by main.js. `mode` was a plain field until M1.3 turned it into a live getter
backed by the same mutable variable every closure already reads, so `setMode` (the kassa's belay
choice) takes effect instantly everywhere without reconstructing the belay.

### `js/player/interaction.js` + `js/player/climb-ladder.js`
```js
createInteraction({ player, input, belay, course, hud, events, vitals?, save?, ticket? }) → { update(dt), prompt, anchor, entry, dispose() }
createLadderState({ input, events }) → state          // register as "ladder"; ownsMovement, phase, progress
```
Within 1.6 m of an anchor, `clip` (F / gamepad X, plus X for carabiner B in classic mode) runs one
ritual step; `interact` (E) within 1.5 m of `ladder.rail.start` while clipped to the ladder cable
switches to state `ladder` (W up / S down at 0.9 m/s, the rig blends into `ladderPose`). Reaching
either end returns to `ground`. Events: `player:ladder-enter` / `player:ladder-exit`.

Since M0.5 the same module also runs the way onto an exercise: standing within `stepRange` (1.2 m) of
an element's stand point that element's **lifeline wins over the platform ring** as the F target
(otherwise the ring, which circles the trunk, swallows every clip on a small deck), and E only steps
onto it once both carabiners are on that cable – otherwise the prompt says "Clip to the cable first".
Since M0.6 three rules keep that working for a one-way element: the anchor the belay is **already
established on is never an F target** (so you can clip out of the zip cable into the landing stub),
`element.oneWay` means only the entry end may be started from, and E hands over to
`element.playerState` (`"element"` by default, `"zipline"` for the Flying Fox). An element may also
supply its own wording via `enterPrompt` / `clipPrompt`, and any state that exposes a `prompt` getter
speaks for itself while it is active.

Since M1.2, `save` (optional – omit it and nothing is ever locked) gates a route's entry anchor by
category (GDD §3.12): `clip` on a locked anchor is refused outright (no `belay.clipTo` call) and the
prompt shows the lock line (`notice.lockedRed`/`lockedBlack`) instead of the clip prompt. The anchor is
still *offered* as reachable – only clipping it is refused – so the player reads why, standing right
there, rather than the prompt silently doing nothing.

Since M1.3, the same `save` also gates every route's entry anchor behind `save.data.briefingDone`
(`notice.briefingRequired`) – the Einschulung practice gate (`js/game/briefing.js`) must be completed
once, ever, before any ladder cable accepts a clip. Since M1.5, the optional `ticket` (the pure clock,
`js/game/ticket.js`) refuses a *new* clip-in the moment `ticket.clippable` is false – no ticket bought
yet, the day's ticket expired, or "Continue browsing" ended it – via `notice.noActiveTicket`. Both gates
only block starting a fresh ritual: an anchor the belay is already established on (mid-route) is
unaffected, so an element in progress when the ticket expires is never interrupted.

## Balance, strength, nerves and the fall (M0.5)

### `js/player/{balance,stamina,nerves}.js` (pure logic, unit-tested)
```js
createBalance({ config? }) → { angle, angularVelocity, slipped,
  update(dt, { lean, hands, speed, drive, noise, slipAngle, authority }) → { angle, slipped, load },
  excite(a), nudge(dOmega), load(slipAngle?), catchAt(slipAngle?), reset(angle?) }
createStamina({ config?, value? }) → { value, isEmpty, canGrip,
  update(dt, { onPlatform, onElement, hanging, hauling, pullingUp, moving, hands, extraDrain }),
  spend(amount), drain(rate, dt), reset(value?) }
createNerves({ config?, value?, trust? }) → { value, trust, level, frozen, heartRate, tremor, cameraSway,
  update(dt, { height, exposure, wobble, gust, lookDown, handContact, onElement, onPlatform, onGround, breathing }),
  completeElement(), survivedFall(), shock(amount), reset(value?, keepTrust?) }
```
An *unstable* inverted pendulum: upright is an equilibrium you fall away from, so standing on a wire
is work. A hand on a cable makes it stable (`handStiffness > topple`) and costs strength. Nerves rise
with height (logarithmic), exposure, wobble, gusts, looking down and time; they fall on a platform,
while breathing and on hand contact. Above `freezeThreshold` the climber freezes until three
deliberate breaths (R held). There is deliberately **no nerve bar** – the readout is the heartbeat.

### `js/player/vitals.js`
```js
createVitals({ player, input, terrain?, hud?, events? }) → {
  balance, stamina, nerves, height, onPlatform, update(dt), reset(), probe(), dispose() }
lookDownAmount(camera)          // 0..1, nothing below 25° of downward pitch counts
```
Owns the three instances, steps them while the climber is *not* on a rail (the rail states step them
themselves), and turns them into feel: camera breathing, the HUD strength ring and heartbeat, the
heartbeat and breathing sounds, and the F1 rows.

### `js/player/on-element.js` + `js/player/fall.js`
```js
createElementState({ input, events?, balance, stamina, nerves, rng?, camera? }) → state   // "element"
createFallState({ physics, input, scene?, events?, balance, stamina, nerves, camera? }) → state  // "fall"
```
Both use the `ownsMovement` pattern. On an element the climber is a parameter `t` along the rail:
W/S travel (or step plank by plank on a discrete element), A/D **lean** into the pendulum, Q and the
right mouse button put a hand on the hold. `fall` spawns one dynamic Rapier ball (70 kg, colliding
with nothing) on a rope joint to a kinematic carabiner that slides along the lifeline, draws the
lanyard, drops and shakes the camera, and offers three ways out: pull up (Space), haul to a platform
(W/S) or the rescuer (E). Events: `player:element-enter|element-exit|slip|fell|recovered|rescued`.

### `js/ui/hud.js`
```js
createHud(root) → { setBelay(stateA, stateB), setPrompt(text|null),
  setSpeed(kmh|null), setNotice(text|null, seconds?),
  setVitals({ stamina, heartRate, level, frozen }), show(), hide(), dispose() }
```
`setSpeed` drives the mockup speedometer (`.hud-speed`, bottom right) and is only ever on during a
zip ride; `setNotice` lets a message ("Top speed 25 km/h") take the prompt line over for a few
seconds. There is no timer: `setPrompt` runs every frame anyway, so the notice's expiry is checked
where it is needed.
The heartbeat dot pulses at `--beat` (60 / bpm seconds) and takes its colour from the nerve level;
`prefers-reduced-motion` stops the animation.
Uses the existing classes in `css/hud.css`. Prompt markup: keys in square brackets become `<kbd>`
(`setPrompt("Climb [E]")`); text is inserted as text nodes, never as HTML.

### `js/audio/synth.js` + `js/audio/sfx.js`
```js
getSynth() → { ready, arm(), now(delay), noiseBurst(o), ping(o), envelope(o), setVolume(v), dispose() }
armAudio(target)                       // creates the AudioContext on the first *trusted* gesture
sfxCarabinerOpen(delay?)  sfxCarabinerLock(delay?)
sfxHarnessCatch(force?, delay?)        // thump + lanyard jolt + webbing creak
sfxHeartbeat(intensity?, delay?)       // lub-dub, only above VITALS.heartbeatFrom
sfxBreath(seconds?, delay?)            // filtered-noise swell in and out, while R is held
sfxTrolley(v01?) → { set(v01), stop() }    // continuous whirr: sawtooth + roller grain, both rising
sfxWindRush(v01?) → { set(v01), stop() }   // band-passed noise, gain with v²
sfxZipArrive(clean?, delay?)               // feet on the deck vs the whole rig hitting it
```
The two continuous voices come from `synth.voice({...})`, which returns a live handle whose `set()`
follows the game every frame through `setTargetAtTime` ramps. Before the first gesture they hand back
a silent no-op handle, so callers never have to check.
Nothing is allocated and no sound is scheduled before a real user gesture – that also keeps the
console clean, because Chrome warns about an AudioContext started without one.

## Conventions
- Every module exports a `create*(options)` factory returning a plain object with `dispose()`.
- No module touches `document` except `ui/*`. No module reads `location` except `core/params.js`.
- Files ≤ ~400 lines; split by responsibility. JSDoc on public factories.
- Debug-only globals live on `window.WIPFEL` (set in `main.js`).


## Game layer (M0.7 – contracts)

| Module | API |
|---|---|
| `js/core/i18n.js` | `initI18n({locale, dicts?})` (fetches `assets/strings/<locale>.json`, en fallback), `t(key, vars?)`, `formatTime(s)`, `formatClock(hours)` (M1.5: HH:MM from a fractional hour of day); missing keys render as the key |
| `js/core/save.js` | `createSave(storage?) → {data, routeBest(id), recordRun(id,{seconds,falls})→isBest, isUnlocked(category), unlockCategory(category)→isNewlyUnlocked, completeBriefing()→isNewlyDone, startTicket({type,sizeClassId,belayMode}), updateTicket(patch), endTicket(), setLocale, flush}`, `nextGateCategory(category)` (pure, blue→red→black→null); schema-versioned, corrupt data collapses to defaults; `data.unlocks` (M1.2, GDD §3.12: "Farben sind Tore") is additive – blue always `true`, red/black default `false`; `data.briefingDone` (M1.3, default `false`) and `data.ticket` (M1.5, default `null` – `{type,sizeClassId,belayMode,elapsedReal,extensionsUsed}` while a day is in progress) are both forced back to their default shape on load regardless of what an old/corrupt save says |
| `js/game/route.js` | `createRouteRun(def)`: idle→armed→countdown(3-2-1-GO)→running→done; `completeObstacle(id)` dedupes; `BLUE_I` (worked example, M0 fixture); `routesFromPark(parkDef)` (M1.1) – pure, one run-def per generated route; `obstacles`/`heightM` (max deck height)/`lengthM` (sum of edge span minus each edge's two `EDGE_OFFSET` lead-ins, plus the zip) are real numbers straight out of `parkDef`, never placeholders |
| `js/game/session.js` | one `createRouteRun` per route (`routesFromPark`), all `update`d every frame; events (`player:ladder-exit`, `player:element-exit`, `player:fell`, `zip:finished`) broadcast to every run – each run's own `completeObstacle` already ignores ids/states it does not own, so at most one ever advances; the HUD follows whichever run is counting down/riding, else the nearest entry deck within 6 m (`course.routes[i].entryDeck`); stores best times per route id, emits `route:completed`; on `zip:finished` also runs the category gate (M1.2): completing a route unlocks the next colour (`save.unlockCategory`, `nextGateCategory`) and folds that into the *same* "route done" notice rather than a second one competing for the line; a locked route's start banner never arms (`shown.arm()` is skipped). M1.5: also owns the `day` stats (`get day` – routes completed, obstacles crossed, top zip speed, rescues from `player:rescued`) and the optional ticket clock's day-end sequence – polls `ticket` once a frame (no callbacks, plain edge detection like `bannerShown`), shows the 30-min-left toast once, and on expiry offers `[E]` to extend (`ticket.extend()`, `input.pressed("interact")`) for `TICKET.extendPromptSeconds` before calling `stampCard.show(day)`; `beginDay()` (kassa confirm/resume) resets the day; `forceDayEnd()` is the `WIPFEL.debug.endTicket()` shortcut |
| `js/ui/hud-route.js` | mockup-1:1 route header (`--cat-color` bar, category, ● numeral · name, progress/time/best), FLOW placeholder, start banner with key figures, countdown discs, safety tooltip; `showBanner(def, best, locked?)` (M1.2) swaps the facts/best/START block for a lock line (`notice.lockedRed`/`lockedBlack`) when `locked` is true; `setTicket(remainingGameMinutes\|null)` (M1.5) shows/hides the `.hud-ticket` box top-right (mockup: `[Ticket 2 h 41]`) |
| `js/game/autoplay.js` | `?autoplay=1`: prompt-driven smoke bot in the **input phase** (synthetic key events must precede edge consumers); on its very first `update()` fast-forwards the kassa and briefing (`kassa.confirmDefaults()`, `briefing.completeForBot()` – M1.3, no fragile DOM clicking or scripted walk-to-the-practice-stand); starts on the entry deck, goal-directed clipping (only the route's next anchor), plank tapping, holds Space on the zip; platform-hop self-help after repeated stalls (logged as "shortcut") |

Input-phase rule: anything that synthesises keyboard events (bots) must run inside `loop.on("input")` –
edge sets (`input.pressed`) are cleared in the ui phase, so events fired later are invisible to the
next frame's physics.

## Kassa, Einschulung, ticket clock, stamp card (M1.3/M1.5 – contracts)

### `js/game/ticket.js` (pure logic, unit-tested)
```js
gameHoursElapsed(realSeconds) → hours                        // TIME.gameHourMinutes real minutes = 1 game hour
timeOfDayFor(hoursElapsed, openingHour?) → hour               // wraps into [0, 24)
createTicketClock({ ticketHours?, openingHour?, extendGameMinutes?, maxExtensions? }) → {
  elapsedReal, totalGameMinutes, remainingGameMinutes, timeOfDay,
  started, expired, clippable, extensionsUsed, extensionsLeft,
  update(dtSeconds), extend(): boolean, reset(next?: {ticketHours?}), end()
}
```
No callbacks, no DOM – `js/game/session.js` polls the getters once a frame and does its own edge
detection (warning toast, expiry sequence), exactly like `js/player/belay.js` stays pure for its ritual.
`clippable` (`started && remaining > 0`) is the single fact `js/player/interaction.js` needs to gate a
new clip-in; `extend()` (+`TICKET.extendGameMinutes`, capped at `TICKET.maxExtensions`) un-expires it
without touching `started`; `end()` ("Continue browsing") clears `started` – there is simply no ticket,
which reads differently from an expired one but gates clipping identically.

### `js/ui/kassa.js`
```js
createKassa({ root, defaultChoice?: {type,sizeClassId,belayMode}, onConfirm }) →
  { visible, show(), hide(), confirmDefaults(), dispose() }
```
The GDD's "ein Blatt Papier" screen: a `.screen`/`.panel` overlay (dark translucent app frame, per the
mockup) with a laminated-sheet-styled form inside it – three option groups (ticket type from
`TICKET_TYPES`, size class from `RULES.sizeClasses`, belay mode from `BELAY_MODES`, each a row of
clickable cards with a one-line description) and a Confirm button. Shown at boot before pointer lock
(`js/main.js` guards `requestPointerLock` on `!kassa.visible`); `onConfirm(choice)` is the one thing
this module knows about the game – `js/main.js#startDay` applies it to the save, the ticket clock, the
sky and the belay. `confirmDefaults()` is the `?autoplay=1` hook: calls the exact same `onConfirm` path
a click would, no DOM interaction.

### `js/park/practice-stand.js` + `js/game/briefing.js`
```js
createPracticeStand({ scene, physics, position, facing?, rng, textures }) → { group, top, clipAnchor, dispose() }
createBriefing({ root, scene, physics, terrain, parkDef, textures, rng, belay, player, input, save, events? }) →
  { active, phase, start(), update(), completeForBot(), dispose() }
```
The Einschulung (GDD §3.7): one post + a short taut cable at "1 m height" (RESEARCH-DATA §1's practice
course), built lazily the first time `start()` runs, placed opposite the mean bearing of every route
entry from the spawn hub (clear of the fan, the same circular-mean trick `js/park/signs.js` uses for its
category boards). `phase` runs `idle → dialogue → practiceGate → done`: four HUD steps (own bespoke
`.briefing-panel`, not `hud.setPrompt` – no ordering fight with `js/player/interaction.js`'s own prompt
line) advanced with `interact` (E), then the practice gate waits for the *real* belay ritual on a
dedicated anchor id (`"practice-anchor"`) – whichever mode is active (continuous/smart/classic) needs
however many presses it needs, `briefing.js` just watches `belay.bothOnSameAnchor() &&
belay.currentAnchor() === "practice-anchor"`. Finishing calls `save.completeBriefing()` (additive,
one-way) and `belay.detach()`. `completeForBot()` is the `?autoplay=1` hook: skips straight to done, no
scripted walk-and-clip. The gate itself lives in `js/player/interaction.js` (`save.data.briefingDone`),
not here – this module only drives the sequence and builds the hardware.

### `js/ui/stamp-card.js`
```js
createStampCard({ root, save, onNewDay, onContinue }) → { visible, show(summary), hide(), dispose() }
// summary = { routes: [{category,numeral,nameKey,seconds,falls}], obstaclesTotal, maxZipKmh, rescues }
```
End-of-day summary (GDD §3.7): one stamp per completed route (category colour, numeral, name, time,
falls), the day's totals, and `save.isUnlocked("red"|"black")` for the unlock chips (read-only – the
gate itself is M1.2's). `js/game/session.js` decides *when* to call `show()` (ticket end, or a route
finished with `ticket.expired`) and builds `summary` from its own `day` stats. "New day" re-shows the
kassa after `save.endTicket()`; "Continue browsing" calls `ticket.end()` – the world stays open, clipping
just refuses (see the interaction gate above).

## Course Map + park board (M1.4 – contracts)

Two views of the same park, sharing one renderer. Both read `parkDef` (js/park/layout.js) and the
terrain sampler directly – like js/park/signs.js, neither touches the built `course` – so heroTrees'
`(x, z)` (not the built platforms' world anchors) are what every point on the map is projected from.

### `js/ui/map-render.js`
```js
computeBounds(parkDef, terrain) → { minX, maxX, minZ, maxZ }
createProjector(bounds, width, height, padding?) → { scale, width, height, toPx(x,z)→[px,py], toWorld(px,py)→[x,z] }
paintBackground(canvas, { parkDef, terrain, style?: "relief"|"print", seed?, viewport?: {x,y,width,height} }) → projector
paintRoutes(ctx, { parkDef, projector, filterCategory?, hoverRouteId?, style?, lineWidth?, dotRadius?, numerals? })
paintNumeralBadge(ctx, x, y, numeral, colour, r?)   paintLegend(ctx, { x, y, fontPx?, gap? })
paintTitle(ctx, text, { x, y, width, fontPx? })
paintStaticBoard(canvas, { parkDef, terrain, seed, title }) → { projector }   // background+routes+legend+title, one shot
mapColourOf(category) → hex   // category.colour, except "black" (near-black) → a light grey substitute
cssHex(colour)
```
`paintBackground` is the expensive half: it samples a small offscreen buffer (~150 px along the
canvas's longer edge, matching its aspect ratio) via `terrain.heightAt`/`normalAt`/`isPath` and
upscales it (soft on purpose – the mockup's satellite look, not a sharp map). `style: "relief"` shades
by height + a fixed hillshade light direction (`MAP.hillLightDir`); `style: "print"` paints a flat
green base with seeded forest-patch blobs (`core/rng.js#makeNoise2D/fbm2D`), independent of real
elevation. A `viewport` sub-rectangle lets `paintStaticBoard` reserve a header strip *before* fitting
the projector to it, so the routes drawn against that viewport never drift off the terrain/paths under
them (an independently-refitted second projector was the first version's bug – documented in case a
third caller is tempted to repeat it). `paintRoutes` is the cheap half – projected polyline per route,
platform dots, an entry ring, a dashed zip segment, optional numeral badges – redrawn every frame by
the overlay (filter/hover/pan/zoom all live there) or once, baked, by the board.

### `js/ui/course-map.js`
```js
createCourseMap({ root, parkDef, terrain, save, player, getAgents?: () => object[] }) →
  { visible, open(), close(), toggle(), update(), dispose() }
```
`Tab` (input action `map`, js/main.js) opens/closes it; so do Esc and the EXIT button. The relief
background is baked once per park on first `open()` (`map-render.js#paintBackground`, cached) onto an
offscreen canvas; `update()` (called every `ui` phase while visible) just blits that cache plus a cheap
vector pass (routes, the player chevron, NPC dots from `getAgents()`) onto the visible canvas, panned/
zoomed via a 2-D transform (`ctx.translate/scale`). FILTER cycles all→blue→red→black (dims the rest);
PLAYER centres the view on `player.position`; ZOOM toggles `MAP.zoomLevels` around the *current* view
centre (not the player); dragging pans, only once zoomed. Hovering a route (point-to-segment distance
in cache-pixel space, no inverse-projection needed) shows its name/numeral/obstacles/height/length/
best time (`save.routeBest`, `game/route.js#routesFromPark`) and lock state in `.info`. Opening the map
does **not** pause the loop – js/main.js only zeroes `input.move` for that frame and calls
`document.exitPointerLock()`; it also toggles a `course-map-open` class on `<body>` so `css/screens.css`
can hide the `#hud` layer's own text (route header, ticket box, prompt), which otherwise shares the
same screen corners and shows through the overlay's translucent tint.

### `js/park/park-board.js`
```js
createParkBoard({ root, scene, physics, parkDef, terrain, rng, textures }) →
  { group, standPosition, interactRange, update(player, input, onOpen: () => void), dispose() }
```
Two posts, a header bar and a backing panel (`js/park/timber.js` builder) plus a printed face – a
`THREE.PlaneGeometry` with `map-render.js#paintStaticBoard`'s baked "print" texture (1024×768,
canvas.js's `title` from i18n) – built as its own mesh (not the timber builder) because its texture is
unique, exactly like a sign's white face in `js/park/signs.js`. Placed beside that module's hub
fingerpost cluster, reusing its exported `averageBearing`/`findNearPath` so the two clusters read as
neighbours at one trailhead instead of overlapping. One thin static collider (`GROUP.STATIC`) over the
board's face stops the player walking through it. `update()` is independent of
`js/player/interaction.js` (scoped to belay/ladder/element) – its own tiny range check and its own
`.board-prompt` DOM line (`css/screens.css`, same "do not fight `hud.setPrompt`" idea as
`js/game/briefing.js`'s `.briefing-panel`) – E within `interactRange` calls the `onOpen` callback
(`js/main.js` wires it to `courseMap.open()`).

## NPC guests (M1.6 – contracts)

Guests share the course graph and its occupancy rules with the player – GDD §3.4/§7: one climber per
element/ladder, guests capped one below a platform's real capacity so the player always fits.

### `js/game/occupancy.js`
```js
createOccupancy({ maxPerElement?, maxGuestsPerPlatform? }) → {
  holderOfElement(id), claimElement(id, holderId) → bool, releaseElement(id, holderId),
  guestsOnPlatform(id), claimPlatform(id, holderId, isGuest?) → bool, releasePlatform(id, holderId, isGuest?),
  reset() }
createQueue() → { join(id), leave(id), front(), isFront(id), positions(), size }
createQueueRegistry() → { queueFor(id) → Queue, reset() }
```
Pure, no THREE – shared by `js/player/interaction.js` (the player claims/releases exactly one element,
id `"player"`) and `js/npc/agents.js` (each guest claims by its own id). Element capacity is 1
(`RULES.maxPerElement`); platform capacity is guest-only and one below `RULES.maxPerPlatform`
(`NPC.maxPerPlatformGuests` = 2) – the player is never tracked there and never refused. A tie between
the player and a guest resolves to whoever's `claimElement` call runs first in a frame; js/main.js's
loop order (`interaction.update(dt)` before `agents.update(dt, …)`) makes that always the player.

### `js/npc/agents.js`
```js
pickProfile(rng) → profile                       // NPC.profiles, weighted
pickRouteForProfile(profile, routes, rng) → route  // same category, or any route as a fallback
planAgents({ rng, parkDef, count? }) → Array<{ id, profileId, category, routeId, heightScale, hue, wanderLegs }>
poseKindOf(agent) → "walk"|"idle"|"ladder"|"element"|"zip"
createAgents({ course, parkDef, terrain, rng, occupancy?, events?, count? }) →
  { list, count, update(dt, playerPosition), dispose() }
```
THREE-free by design (like `js/park/layout-route.js`): `planAgents` is unit-tested under plain node
(`tests/unit/agents.test.mjs`) for deterministic count/profile/route assignment. The runtime (`create
Agents`) *does* call into the built course's THREE-backed objects (`element.pointAt`/`tangentAt`,
`ladder.rail`, `zip.pointAt` via `element.trolleyAt`) but only ever reads `.x/.y/.z` off what it is
handed and writes through a tiny local `vec3` duck-type (`.set`/`.sub`/`.normalize` – just enough for
`element.js#tangentAt`'s internals) instead of importing "three" itself.

Per-guest state machine: `wander` (random points near the hub, `NPC.wanderRadius`) → `toEntry` (the
assigned route's entry deck) → `queue`/`clipIn` (join a `Queue` for the ladder, claim it once at the
front, a `NPC.clipPauseSeconds` beat before moving – the "visible two-click ritual") → `onRail`
(ladder at `climb-ladder.js#LADDER_MOVE.speed`, duplicated locally for the same THREE-avoidance reason
as `layout-route.js#ZIP_HARDWARE`; continuous elements at the element's own `walkSpeed`; discrete ones
step through `element.steps`/`.planks` every `NPC.elementStepSeconds`; the zip eased over
`length * NPC.zipSecondsPerMetre`, lightly reusing the real ride via `element.setRider`/`trolleyAt`) →
`unclip`/`dwell` at the next platform (claims/releases occupancy exactly like the player) → repeat
until the last step, then `return` to the hub and `pickRouteForProfile` again (same profile/category –
guests ignore `save.data.unlocks` entirely). While on an element a guest also drives
`element.occupancy.active/t`, the same hook `js/player/on-element.js` uses – its wobble-deform sways
under a guest's weight for free. Finishing an element next to the platform the player is standing on
(`NPC.trustWatchRadius`/`trustWatchHeight`) emits `npc:watched-success` (GDD §3.4/§7 "Zusehen gibt
Vertrauen"); `js/main.js` turns that into `vitals.nerves.watchSuccess()` (a smaller, quieter
`completeElement()` – `js/player/nerves.js`, `NERVES.trustPerWatch/watchRelief`).

### `js/npc/guest-rig.js`
```js
createGuestRig({ scene, guestCount }) → { group, update(list, playerPosition, dt), dispose() }
```
Ten body parts (torso, head, left/right upper arm, left/right forearm, left/right thigh, left/right
shin), each **one** `THREE.InstancedMesh` shared by every guest – 10 draw calls for the whole crowd
regardless of count, instead of the player rig's 64 meshes. Geometry proportions reuse `LAYOUT` from
`js/player/rig-body.js`; a single scratch pose hierarchy (plain `THREE.Object3D`, never added to the
scene) is reused for every guest in turn – pose it, read joints' matrices into that guest's instance
slot, pose it again for the next. Torso colour = the guest's category colour (`InstancedMesh
.setColorAt`, no per-guest textures) – doubles as an at-a-glance "who is headed where" cue matching the
map/board colour language. Guests farther than `NPC.cullDistance` (90 m) skip the live pose maths and
reuse one cached rest-pose transform per part combined with just that guest's own root matrix – the
position still advances every frame, only the limb articulation freezes while far away. No shadows
(`castShadow = false`, same budget call as `world/ground-detail.js`'s scatter and `park/signs.js`'s
boards).

`js/main.js` wiring: `?npc=0` disables guests entirely (`agents`/`guestRig` stay `null`); `agents.
update(dt, player.position)` runs in the gameplay phase (after `interaction.update(dt)`, so the player
always wins a same-frame tie – see `occupancy.js` above), timed with `performance.now()` into the
debug panel's `npc ms` row (`npc count` alongside it); `guestRig.update(...)` runs in the render phase
(variable dt, purely cosmetic). `js/player/interaction.js` gates only catalogue/zip elements for the
player (`occupancy`, optional) – not the ladder, which is out of this module's stated scope and stays
guest-vs-guest contention only – refusing a step-on with `notice.waitForClimber` ("Wait for the climber
ahead") when a guest already holds the element; the claim is released the frame the player's mode next
reads anything other than `"element"` (a slip into `"fall"` releases it too – documented simplification,
not a deadlock risk since the cap is 1 either way).

## Options + settings (M1.7 – contracts)

### `js/core/save.js` (extended)
```js
data.settings = {
  audio: { master: 0-100, sfx: 0-100, ambience: 0-100, ui: 0-100 },
  lookSensitivity: number|null,   // null = core/input.js's own default
  invertY: boolean, reducedCameraMotion: boolean, reducedMotion: boolean, assist: boolean,
}
save.updateSettings(patch)        // merges a partial patch (e.g. { audio: { sfx: 40 } }), flushes
save.export() → json               // whole-save snapshot, for M3/M4
save.import(json) → boolean         // same validation `load()` uses (`normalize()`, shared); false = refused
```
Additive like every other field here – an old save without `settings` gets the defaults, a corrupt
field falls back to its own default without dragging the rest of `settings` down with it (each field
validated independently in `normalize()`, the pure function `load()` and `import()` both now call).

### `js/ui/options.js` + `js/ui/options-controls.js`
```js
createOptions({ root, save, input, camera, loop, ticket?, onEndDay, onCourseMap }) →
  { visible, open(), close(), toggle(), applyAll(), dispose() }
renderControlsList(bindings) → HTMLElement            // read-only, from core/input.js#bindings directly
```
The pause screen (GDD §3.2 "Start/Esc: Pause, Optionen"). `Esc` (`js/main.js`, input phase) opens it in
place of the old bare `loop.paused = !loop.paused` toggle; `open()`/`close()` now own that flip
themselves (plus releasing pointer lock), so the rest of the frame loop is unchanged – physics/gameplay
still run every tick with `dt = 0` while paused, exactly as before M1.7. One scrollable panel (no
sub-screen navigation): Resume / Course Map / End day (`onEndDay`, shared with `WIPFEL.debug.endTicket()`
– both exhaust the ticket's remaining minutes and call `session.forceDayEnd()`, "End day" is that path
made official, greyed out via `ticket.started` when no day is running) at the top, four stacked sections
below, `GAME.version` at the bottom. `?options=1` opens it at boot for screenshots (hides the kassa first
if a fresh save would otherwise show both); `?autoplay=1` never reaches the `pause` action, and the input
phase refuses to open it while autoplay is on regardless.

Every control both **live-applies** (a tiny named function per field: `input.bindings.lookSensitivity =
…`, `camera.setReducedMotion(…)`, `document.body.classList.toggle("reduced-motion", …)`,
`setAssistMode(…)`, `setMasterVolume`/`setCategoryVolume`) **and persists** (`save.updateSettings`) in
the same handler; `applyAll()` reuses the same live-apply functions once at boot (no redundant
persistence) so `js/main.js` only has to call `options.applyAll()` after construction. Audio: four
sliders (`master`, `sfx`, `ambience`, `ui`) – see the synth bus section below. Camera & motion: look
sensitivity (0–100 slider mapped onto `OPTIONS.lookSensitivityMin/Max`, `js/config.js`), invert Y
(`core/input.js#Input.invertY`, flips the sign of `look.y` in `poll()`), "reduced camera shake &
breathing" (`player.camera.setReducedMotion` – already existed since the camera module was built with
this option in mind, M0.7; zeroes fall-shake trauma *and* nerve-driven sway in one switch) and "reduced
motion (HUD)" (a `body.reduced-motion` class, `css/base.css`, mirroring the existing
`prefers-reduced-motion` rule so both the OS setting and this toggle stop the same animations – today
just the HUD heartbeat pulse, `css/hud.css`). Gameplay: assist mode (`js/player/assist.js`, below) and
the locale switcher (`initI18n({locale})` + `save.setLocale`, then the panel re-renders its own labels;
every other `t()` caller in the game is unaffected code-wise – `js/ui/hud-route.js#setRoute/showBanner`
and the HUD prompt already call `t()` fresh on every change, so they pick up the new language on their
next redraw with zero changes here; screens built once at construction and never rebuilt, like
`js/ui/kassa.js` and the static labels in `js/ui/hud.js`, stay in the old language until reload – the
options copy says so). Controls: `renderControlsList` reflects `input.bindings` read-only (no debug-only
actions listed, per CLAUDE.md "Debug-UI vom Produkt-UI trennbar") with a "remapping comes later" note.

### `js/player/assist.js`
```js
setAssistMode(on)   isAssistMode()   assistScale() → { disturbance, slipWindow }   // 1/1 when off, 0.6/1.35 when on
```
A live closure-variable toggle, the same shape `js/player/belay.js#setMode` already uses for the kassa's
belay choice. `js/player/on-element.js` multiplies every wobble excitation it feeds an element from the
climber's own actions (footstep, lean+hurry, missed-step kick) by `disturbance`, and the slip angle it
hands to `balance.update`/uses for the cosmetic lean offset by `slipWindow`; `js/player/fall.js` scales
the same slip angle in `balance.catchAt` on recovery, so mid-crossing and post-catch stay consistent.
`js/player/balance.js`'s own tuning (`BALANCE.topple`/`slipAngle`, `js/player/tuning.js`) is never
touched – assist scales what feeds it at the call site, so the pure module and its unit tests are
unaffected. Ambient disturbance (`js/elements/element.js`'s wind-gust excite) is deliberately left alone:
assist is about the climber's own actions, and elements never import from `js/player/` (nor vice versa
before this – `js/elements` stays a leaf module).

### `js/audio/synth.js` (extended)
```js
setCategoryVolume(category: "sfx"|"ambience"|"ui", volume: 0-1)   // + the existing setMasterVolume
```
`arm()` now creates three category `GainNode`s alongside `master`, each connecting into it; every
`noiseBurst`/`ping`/`voice` call takes an optional `category` (default `"sfx"`) and connects through
`busFor(category)` instead of straight into `master`. Every existing call in `js/audio/sfx.js` (clicks,
harness catch, heartbeat, breath, trolley, wind rush, arrivals) is therefore already routed through the
`sfx` bus with no changes needed there. `ambience` and `ui` have no sounds yet – GDD's ambient bed (wind,
birds, distant city) and any interface clicks are later milestones – so those two sliders currently
affect nothing audible; the buses exist and are wired, ready for M2 (documented, not silently assumed).

### Colour + shape (GDD §5: "Farbe trägt immer eine Form")
Audited and completed as part of this milestone: the start banner (`js/ui/hud-route.js#showBanner`) and
the stamp card (`js/ui/stamp-card.js`) were missing the category symbol next to their colour – both now
prefix it, matching the route header, the signage, the course map legend and the map's route info panel,
which already had it.

## Park scale-up, junctions, Wichtel courses (M2a – contracts)

### `js/park/layout.js` (extended)
```js
export const PARK_CONFIG        // default: 15 secured routes (blue I-V, red I-VI, black I-IV) across
                                 // four hubs + the hidden "legendary" finale, plus two junctions
export const PARK_CONFIG_SMALL  // `?routes=6`: the old M1 six-route park, unchanged, all at hub 0
generateParkLayout({ seed, terrain, config? }) → parkDef   // same shape as M1.1, each route now also
                                                            // carries `hub` (index into terrain.hubs)
```
Each `PARK_CONFIG` route entry gained two optional fields: `hub` (0 spawn / 1 hut / 2 deck-east / 3
deck-top – `js/world/terrain.js`'s hub order) so routes fan out from four separate trailheads instead of
cramming sixteen entries around one 35°-gap budget (16 × 22.5° < 35°, the M1.1 hub could never have held
this many), and `join: { hostNumeral, hostPlatformIndex }` for a junction guest. Chain lengths are
short and mostly flat (2–4 platforms) rather than literally 15 × GDD's "4/4–5/5–6" prose, which would be
60–90 platforms against the ≤ 52 total-platform performance budget below – the same kind of trade-off
M1.1's own `PARK_CONFIG` comment already made at 6-route scale, documented in `layout.js`'s header.
Category feel keeps coming from the deck-height window and excluded/heavier catalogue kinds
(`layout-validate.js#CATEGORY_RULES`, `legendary` added there too: 14–20 m, nothing excluded), not from
raw platform count.

**Junctions** (GDD §3.9 "Kreuzungspodeste"): a guest route's *first* platform is an existing interior
platform of an earlier, same-category host route – not a freshly walked-to tree. `layout-route.js
#buildRouteCandidate`'s new `join` option feeds `buildChain`/`assignDeckHeights` a `startTree`/
`startHeight` instead of a fresh hub-relative placement, and `buildEdges` a `firstPlatformId` override so
the guest's first edge leaves *from* the host's platform id. `layout.js#resolveJoin` looks the host route
up (already fully built earlier in the same `generateParkLayout` call) and the platform keeps the host's
`id`/`treeIndex`/`deckHeight` verbatim – so the guest route never allocates a new hero tree for it, which
is a net *saving* against the platform budget, not a cost. Default park: `red-3 ⨝ red-2` and
`black-2 ⨝ black-1`, both platform `kind: "junction"`.

`js/park/loader.js#loadPark` builds a junction's shared platform exactly once: a park-wide
`sharedPlatforms` Map (id → built platform) threaded through every `buildRoute()` call – a route whose
platform id is already in the map reuses the object instead of calling `createPlatform` again (and skips
it in that route's own static merge/dispose list, tracked separately as `route.ownPlatforms`). The
course-level anchor list and graph (`buildGraph`) both de-duplicate by id for the same reason (a
junction's ring anchor/node would otherwise appear once per route that lists it); a junction's graph node
carries a `routes: [hostId, guestId]` array instead of a single `route` field. Player-side: nothing
special – `js/player/interaction.js#reachableAnchor` already finds *any* anchor within range regardless
of which route(s) list it, so standing on a junction offers both continuations' lifelines as F targets
exactly like any other platform, and `js/game/session.js`'s per-run `completeObstacle` already ignores
edge ids that are not its own, so whichever edge the player actually clips into and crosses is the one
(and only one) route that advances. `js/park/signs.js#buildJunctionSigns` adds one small board standing
on the shared deck itself (not a ground post) showing both routes' numerals, reusing the hub cluster's
own category-board painter at a smaller scale (`SIGNS.junction`).

**Legendary route** (GDD §3.12 "Legendäre Routen ohne Parkplan-Eintrag"): just another `PARK_CONFIG`
entry (`category: "legendary"`, 6 platforms, hub 1/hut), generated through the exact same pipeline as
every secured route – what makes it hidden is purely a *rendering* filter, not a generation-time secret:
`js/park/signs.js` filters it out of both the hub-cluster grouping and the per-route entry-sign loop, and
`js/main.js` builds a `publicParkDef` (parkDef with `routes` filtered to `category !== "legendary"`) that
`js/park/park-board.js` and `js/ui/course-map.js` receive instead of the real `parkDef` – `js/game/route.js
#routesFromPark` and `js/game/session.js` still get the *real* `parkDef`, so the route is fully playable
(its own HUD header/banner/stamp card work normally), just absent from every map/signage surface. Unlock:
`js/core/save.js#unlockCategory("legendary")`/`isUnlocked("legendary")` follow the same additive
`data.unlocks` shape as red/black; `js/game/session.js`'s category-gate check
(`nextGateCategory`/`save.unlockCategory`) is extended so completing the *fourth* black route – not just
"a" black route – is what unlocks it (`js/core/save.js#unlockCategory` is only called once all four
`black-*` route ids have a completion recorded).

**Budget check**: 15 secured routes → 43 distinct platforms (46 "as listed" minus the 3 platforms two
junctions save), + legendary's 6 = 49 total, under the `LAYOUT_LIMITS.maxTotalPlatforms` (52) cap; draw
calls/triangles are the measured acceptance numbers in `HANDOVER.md`.

### `js/park/wichtel.js` (new)
```js
createWichtelCourses({ scene, physics, terrain, parkDef, rng, textures }) → { group, courses, dispose() }
```
Two tiny ground-level (`WICHTEL.deckHeight` = 0.35 m) log-and-plank parcours near the spawn hub
(RESEARCH-DATA §1) – pure flavour, entirely outside the routes/generator/loader/belay pipeline: no
anchors, no lifeline, no `element.js` interface, not part of `parkDef.routes` and not counted against the
platform budget. Built directly with `js/park/timber.js`, walkable by anyone because the character
controller's own autostep (`PLAYER.kcc.autostepHeight` 0.44 m) already clears 35 cm without a ramp. Each
of the `WICHTEL.logCount` segments (every third one a short plank instead of a log) gets its own thin
static box collider, the same "slab under the visible surface" trick `js/park/platform.js`'s deck uses.
Placement is a bounded random search near the spawn hub, clear of every real route's hero trees
(`layout-validate.js#farFromOtherRoutes`, reused) and best-effort off any mapped path – no hard failure
if the search runs out, since this is decoration, not a validated route. Verified via
`WIPFEL.wichtel.group`'s meshes, not a route count (guests are not wired to wander them yet – see
`HANDOVER.md`'s Offen list).

## Season pass, time trials, flow, mastery, re-clip feedback, sidegrades (M2a – contracts)

### `js/game/ticket.js` (extended)
The season pass (GDD §3.8, `TICKET_TYPES` "season") is `hours: Infinity` and nothing else – every
comparison the clock already does (`remainingGameMinutes`, `expired`, `clippable`) is ordinary
finite-vs-`Infinity` maths, so an infinite ticket simply never runs out; the only change was letting
`reset({ ticketHours })` accept `Infinity` (`Number.isFinite` rejected it, `typeof … === "number" && … > 0`
does not). `get isOpenEnded()` (`!Number.isFinite(totalGameMinutes)`) is the one new getter, read by
`js/game/session.js` to hide `.hud-ticket` and by nothing else – the day-end sequence (30-min toast,
extend prompt) simply never triggers on its own for the same underlying reason. "Stamp card on demand
only" (GDD §3.8) is already what the options screen's "End day" / `WIPFEL.debug.endTicket()` do for every
ticket type; `js/main.js#endTicketNow` guards its own "exhaust the remaining minutes" math against a
non-finite `remainingGameMinutes` (adds one game hour instead of `Infinity`, which would otherwise poison
`elapsedReal` permanently).

### `js/game/route.js` (extended) + `js/game/mastery.js` (new)
```js
createRouteRun(def) → { …, isTrial, markTrial() }             // def now also carries `parS`
routesFromPark(parkDef) → [{ …, parS }]                        // par time estimate, MASTERY.parScale
evaluateMastery({ falls, seconds, parS, averageFlow }) → boolean[4]   // MASTERY.tierOrder order
mergeTiers(previous, current) → boolean[4]                      // OR – a tier earned once is never lost
```
`parS` (GDD §3.12 "unter Richtzeit") is `MASTERY.parScale` (1.6, a documented design assumption – no
real-world "average crossing time" exists to calibrate against) times the sum of each edge's own
length ÷ a per-kind speed estimate; rather than duplicate a 12-entry walk-speed table into the THREE-free
`catalogue-data.js` just for this, it reuses the two speed constants `js/npc/agents.js` already needs for
the same estimation problem (`NPC.elementSpeedFallback` for continuous kinds, a fixed slower rate for
`discrete` ones via `catalogue-data.js#discrete`, `NPC.zipSecondsPerMetre` inverted for the zip leg).

Time trials (GDD §3.8 "Zeitläufe"): `markTrial()` flags the *next* attempt, and – if the run is currently
`"done"` (a route revisited after completing it once) – re-arms it back to `"idle"` in the same call, so
the existing ladder-climb → `beginCountdown()` → 3-2-1-GO → zip machinery is completely unchanged; only
`finish()`'s returned `isTrial` tells `js/game/session.js` which save bucket the time goes into.
`js/game/session.js`'s banner logic offers the trial (`[G]`, `TRIALS.inputAction` – `core/input.js`'s
`KeyT` was already "camera", so trials bind `KeyG` instead, documented in both files) once
`save.routeBest(id) != null`; pressing it calls `run.markTrial()` and shows a toast. Mastery is evaluated
once, at `zip:finished`, from that run's own numbers plus the flow module's running average since the
ladder-climb handler last called `flow.resetRun()`; `js/core/save.js#recordMastery`/`recordTrial` are
both additive (`data.mastery[routeId] = { tiers: bool[4] }`, `data.trials[routeId] = bestSeconds`),
independent of the normal `data.routes` best-time bucket. `js/ui/hud-route.js`'s start banner and
`js/ui/stamp-card.js`'s per-route stamp both render the four tiers as pips (`● earned / ○ not yet`,
`MASTERY.tierOrder` labels from `mastery.*` i18n keys) via the same small `masteryPips()` helper,
duplicated in each file rather than shared – two ~10-line DOM builders were not worth a third module.

### `js/game/flow.js` (new)
```js
createFlow() → { value, averageThisRun, resetRun(), onFall(), creditCleanClip(),
  update(dt, { progressing, frozen, nervesValue }) → number }
computeFlowScore(obstaclesCrossed, averageFlow) → number   // per-run score, stamp card
```
Pure, unit-tested (`tests/unit/flow.test.mjs`) exactly like `js/player/nerves.js`. Builds only while
`progressing` (on an element/zipline/tarzan swing – `js/main.js`'s gameplay phase derives this from
`player.mode`) has held for `FLOW.cleanHoldSeconds` unbroken *and* `nervesValue < FLOW.nervesCeiling`;
`frozen` or `onFall()` (wired to the `player:fell` event) snap it straight back to `FLOW.min`. Not
progressing (ground, ladder, standing on a platform) *pauses* it for `FLOW.pauseGraceSeconds` before it
starts decaying back towards `min` over `FLOW.decaySeconds` – a breather does not erase a run, dawdling
does. `resetRun()` (called by `js/game/session.js` when a route's countdown begins) is what scopes
`averageThisRun` (a time-weighted mean) to one attempt, for both the mastery "in flow" tier and
`computeFlowScore`. `js/ui/hud-route.js#setFlow(value, unlocked)` drives the mockup's `.hud-flow` bar;
`unlocked` is `save.hasCompletedAnyRoute()` (GDD §3.10 "erst nach der ersten sauberen Begehung" –
simplified to "ever completed one route", documented in the HUD module's own header) and the bar is
additionally only shown while a run is actually `"running"`.

### `js/game/clip-meter.js` (new)
```js
createClipMeter({ belay, events, hud?, flow, isSuppressed? }) → { dispose() }
```
Pure event wiring (ROADMAP "Umhäng-Feedback"): times the real-world gap between the first
`belay:open`/`belay:click` after arriving at a *new* anchor and the moment `belay.bothOnSameAnchor()`
settles there – working unmodified across all three belay modes (continuous fires one click and settles
immediately, near-zero elapsed = always clean; smart's press-1/press-2 both land inside the same window;
classic's up-to-four open/clip presses are timed end to end). Under `CLIP_METER.cleanSeconds` (+ the
gloves sidegrade's `reclipSecondsPenalty`, added to the measured duration rather than changing the
threshold) triggers `flow.creditCleanClip()` and, unless `isSuppressed()` (the Einschulung practice
ritual, `js/game/briefing.js#active`), a small toast.

### `js/player/sidegrade.js` (new)
```js
setSidegrade(id|null)   getSidegrade() → id|null   sidegradeEffects() → { gripDrainScale,
  reclipSecondsPenalty, balanceDisturbanceScale, pullUpDrainScale, zipDragScale, zipBrakeZoneScale }
```
Exactly the `js/player/assist.js`/`belay.js#setMode` shape – a closure variable behind a getter, read
fresh at every call site, never a rebuilt state. `SIDEGRADES` (`js/config.js`) documents each of the
three kassa options and exactly which effect(s) and call site(s) they touch:
- **gloves** – `js/player/stamina.js#rateOf`'s new optional `gripDrainScale` load field (default 1,
  every other caller unaffected) scales `STAMINA.gripDrain`; `js/game/clip-meter.js` adds
  `reclipSecondsPenalty` to the measured ritual duration before comparing it to `CLIP_METER.cleanSeconds`.
- **light shoes** – `js/player/on-element.js`'s own `disturbanceScale()` (already multiplying every
  wobble excitation by `assistScale().disturbance`) multiplies in `balanceDisturbanceScale` too, so
  assist mode and this sidegrade compose instead of one overriding the other; `js/player/fall.js`'s
  `stamina.update` passes the new `pullUpDrainScale` load field, scaling `STAMINA.pullUpDrain`.
- **fast trolley** – `js/player/on-zipline.js#enter()` resets the ride's `dragCoeff` to
  `ZIP_PHYSICS.dragCoeff × zipDragScale` for that ride only (the cable/trolley mesh never changes, same
  pattern as a heavier rider already changing `massKg` per ride) – `zipDragScale` is derived by
  dimensional analysis (drag ∝ 1/v² at a fixed slope, so 1/1.1² for "+10% top speed", documented in
  `config.js`). `js/zipline/brakes.js#createNetBrake`'s `inZone`/`apply` both gained an optional
  `zoneScale` parameter (default 1): the brake's *decision point* moves up to 20% closer to the cable's
  end without moving the built marker-sleeve mesh – a small, documented seam between what the rider sees
  coming and where the ride actually latches, acceptable at a few metres out of a much longer ride.
Selection: the kassa's `Equipment` row (`js/ui/kassa.js`, unlocked once `save.hasCompletedAnyRoute()`,
re-checked on every `show()` so it appears without a screen rebuild), persisted as
`save.data.equipmentId` (`js/core/save.js#setEquipment`, additive, `null` = none) and applied in
`js/main.js#applyChoice` alongside belay mode and rider mass.

## Belay modes complete, night climbing, photo mode, catalogue variants, graphics options, touch (M2b)

### Belay modes: continuous auto-advance, classic accident (GDD §3.3, §3.5)
Continuous mode already attached both carabiners in one press (M0.4); M2b finishes the mode: once a
route's belay is established via continuous, `js/player/interaction.js#autoAdvanceContinuous()` (called
from `update()` while `onFoot`) silently `belay.attach()`s the *next* anchor the moment the climber
reaches it – no re-clip prompt ever again for that route – and a one-time i18n hint
(`notice.continuousBelay`, `continuousHintShownFor` Set keyed by anchor) explains this on the very first
real clip so it does not read as a bug. `js/game/clip-meter.js#createClipMeter` gained an `isDisabled()`
predicate (default `() => false`); `js/main.js` wires it to `belay.mode === "continuous"` so the flow
module never credits a "clean re-clip" for a ritual that no longer happens.

Classic mode's other failure path (both carabiners open at once) finally does something (previously
just `belay:unsafe`, unheard): `js/player/accident.js#createAccidentState({terrain, camera, events})` is
a new player state – a kinematic straight-down fall (no physics body, `ACCIDENT.fallGravityScale`) that
emits `player:accident-fall` on entry and `player:accident-landed` (with `cause`/`elementLabel`/
`routeName`) on reaching `terrain.heightAt`. `js/main.js`'s `belay:unsafe` listener triggers it – but
**only** `if (player.mode === "ground" && vitals.onPlatform)`: careful re-reading of
`interaction.js#update()` found that anchor/F/X processing (the only path that can ever open both
carabiners) exclusively runs in `player.mode === "ground"`, so the other three states can never reach
this event at all; the `vitals.onPlatform` check (reusing `VITALS.platformHeight`) avoids firing over a
harmless 40 cm entry-deck edge. `js/ui/accident-report.js#createAccidentReport({root, onContinue})` is
the two-phase dry report (GDD §3.5 "kein Explosion"): `showFade()` (a black overlay fading in over the
fall, `document.body.classList.add("accident-active")` so the route header/HUD do not bleed through
underneath – the same pattern `course-map-open`/`photo-mode-active` already use) then `showReport({
routeName, elementLabel, seconds })` (route/obstacle/cause/time, i18n both locales) once landed – the
fade must explicitly hide itself first (`fade.hidden = true`) or its own higher `z-index` blacks out the
report sitting underneath it. `js/game/session.js#abandonActiveRun()` (`run.recordFall(); run.reset();`)
ends whatever route was running; `js/core/save.js#recordAccident()` (additive `stats.accidents`
counter) tracks it. Continue teleports back to `terrain.spawn` and calls `belay.reset()`, exactly like
the existing rescue path.

Classic mode's Flying Fox also gets its own braking system instead of sharing the net's legs-up/down
latch (GDD §3.3 "Handbremse"): `js/zipline/brakes.js` exports `HAND_BRAKE` (a 12 m zone, twice the
net's 6 m – there is no single latch instant to aim for) and `createNetBrake(...)` now takes a
`profile: "net"|"hand"` on `inZone`/`apply`. The hand profile is a continuous skill check, not a single
keypress: `handDecel(engaged, fraction)` applies `fullDecel` while gripping, `noDecel` while not, and –
once a full grip has ever been taken before `earlyThreshold` of the zone – permanently latches
`earlyStallDecel` for the rest of the ride (`earlyGripLatched`, mirroring the net's own "no changing your
mind" rule). Two outcomes besides `"clean"`: too little braking arrives "messy" (fast); gripping too
early stalls short of the platform, needing a haul-in exactly like a net-braked rider too light for the
net – the stall case needed an explicit `outcome = "messy"` (`s < length - 0.06 && speed <= 0.02`), since
`on-zipline.js#arrive()` reads a `null` outcome as clean by default and a stall would otherwise silently
read that way forever. `js/player/on-zipline.js` decides `brakeProfile` once at `enter()` (`belay.mode
=== "classic" ? "hand" : "net"`) and adds a `ZIP_PROMPTS.handZone` hint; unit-tested in
`tests/unit/brakes-hand.test.mjs` (zone length, all three outcomes, the permanent early-latch, `reset()`,
and that the default "net" profile is unaffected by the `hand` config existing at all).

### Night climbing (GDD §3.7)
Unlocked once `save.hasCompletedAnyRoute()` (`js/ui/kassa.js`'s Night ticket option, hidden otherwise);
`TICKET_TYPES` gained a `"night"` entry with `openingHour: 20.5`. `js/game/ticket.js`'s `openingHour`
became a mutable `let` (was a `const` closed over at construction) so `reset(next)` can apply a
different type's own opening hour – without this the night ticket's clock would still compute
`timeOfDay` from the default 9 AM. The sky's existing continuous `night` factor (0..1, already driving
stars/hemi/exposure since M0.2) is the single source every new system below reads – no separate "is it
night" flag anywhere.

`js/player/headlamp.js` (new) is a single `THREE.SpotLight` parented to the rig's head anchor
(`rig.attach.head`, `NIGHT.headlampRange` 14 m, `headlampAngleDeg` 27°), toggled on past
`NIGHT_ON_THRESHOLD` (0.5) by `update(nightFactor)` called every gameplay frame from `js/main.js`.
**Trap found during verification**: `THREE.SpotLight`'s (and `DirectionalLight`'s) constructor defaults
`position` to `Object3D.DEFAULT_UP`, i.e. `(0, 1, 0)` – not the origin, so the light-to-target vector is
never degenerate out of the box. Left unset (as first shipped), the light sat 1 m above the head anchor
while its target sat only ~0.04 m below the anchor's own origin, aiming the whole cone roughly 46°
*into the ground* instead of "slightly down, straight ahead" as the code's own comment claimed – a
screenshot at head height showed no visible beam on anything because the beam was never pointed at
anything in front of the player. Fixed with an explicit `light.position.set(0, 0, 0)`; confirmed via the
light's and target's live `matrixWorld` translations (near-horizontal direction vector, matching the
player's own forward). `headlampIntensity` was also retuned 7 → 35 while fixing this: 7 had only ever
been eyeballed against the broken (into-the-ground) aim, and a controlled paused-frame pixel diff (toggle
the light, screenshot, diff, both off the ground and off HUD regions) showed it was barely above the
display's 8-bit threshold once aimed correctly, under three.js's photometric candela falloff at
`decay = 1.2`. No shadow casting (`castShadow = false`) – one more moving shadow caster for a cone nobody
is meant to scrutinise, the same budget call `park/signs.js`/`npc/guest-rig.js` already made.

`js/park/lampions.js` (new): `createLampions({scene, parkDef, terrain, rng})` strings
`NIGHT.lampionsPerEdge` warm point-lights-that-are-not-lights along each platform-to-platform edge of
the first `NIGHT.lampionRouteCount` blue routes – two `InstancedMesh`es (an opaque bulb, an additive
glow billboard), **emissive only, no real `THREE.Light`** (matches the task's explicit budget rule);
`update(nightFactor, cameraPosition)` fades the glow in and yaw-billboards it toward the camera.
`js/npc/guest-rig.js` gained a matching tiny always-unlit `InstancedMesh` dot (`guestHeadlampScale`,
no per-guest `THREE.Light` either) toggled by the same `nightFactor` parameter threaded through
`update(list, playerPosition, dt, nightFactor)`.

Nerves (`js/player/nerves.js`) read a new `ctx.night` (0..1, `clamp01`): the height term is scaled by
`1 - (1 - NIGHT.heightReliefScale) * night` (GDD "you can't see how far down it is" – ironically *less*
height fear once fully dark, matching real accounts of exposure feeling less immediate at night) and a
flat `NIGHT.unknownGain * night` is added (more general unease, independent of real exposure).
`js/player/{vitals,on-element,fall,on-tarzan}.js` and `on-zipline.js` each gained an optional `sky`
constructor param passed through as `night: sky ? sky.night : 0` – omit it and the term is simply 0,
same "optional, degrades to off" pattern `ticket`/`renderer` etc. already use elsewhere in this file.

`WIPFEL.debug.setNight(on = true)`: forces the sky to `NIGHT.openingHour + 1.5` (well into the night)
without a real ticket, for screenshots/smoke checks; sets a `nightDebugOverride` flag that stands the
ticket-driven `sky.setTimeOfDay(ticket.timeOfDay)` sync down until called with `false` (or a fresh day
starts), so a forced test state is not immediately overwritten by the normal per-frame sync.

### Photo mode (ROADMAP M2b)
`js/game/photo-mode.js` (new): `createPhotoMode({camera, input, renderer, loop})`. `P` (`input`'s
`photo` action) calls `enter()` – owns `loop.paused` itself exactly like `js/ui/options.js` already does
(physics/gameplay freeze at `dt = 0`, render keeps compositing) – and frees the camera into a WASD-dolly
+ mouse-look + Q/E-height free-fly, independent of the player. Every HUD layer hides
(`photo-mode-active` body class, same pattern as `course-map-open`/`accident-active`) and a corner hint
(`photo.hint`, `css/hud.css#.photo-hint`) replaces it. `Space` calls `requestSnapshot()`; the render
phase's `consumeSnapshotRequest()` + `takeSnapshot()` (canvas `toBlob` → a throwaway `a[download]`
click) run once, after that frame's HUD-hidden render, so the PNG never contains the corner hint itself.
`?autoplay=1` never presses the `photo` action, so the smoke bot can never enter it. **Input-phase trap
avoided during integration**: the enter/exit toggle was first written as two independent
`if (pressed) enter()` / `else if (pressed) exit()` blocks, which could both evaluate true-ish in the
same frame depending on ordering; rewritten as one `if/else if` pair keyed off `photoMode.active` so
exactly one of enter/exit ever fires per press, with the snapshot-request check as a separate,
unconditional third `if (photoMode.active)`.

### Catalogue variants + Umsetzstationen (ROADMAP "20–25 Familien/Varianten")
`js/elements/element.js` exports `registerElementVariant(variantKind, baseKind, configOverride)`: looks
up the base kind's already-registered factory and wraps it so `createElementBase`'s config line becomes
`{ ...impl.config, ...(spec.configOverride || null) }` – a variant is *parameters only*, never a new
mechanic, movement model or physics. `js/elements/catalogue-data.js` exports `CATALOGUE_VARIANTS` (8
entries – `burma-narrow`, `planks-long-gap`, `net-steep`, `beam-swing-4seg`, `stirrups-wide`,
`rings-far`, `barrels-3`, `skate-long` – each `{kind, baseKind, labelKey, discrete, metrics,
configOverride}`, `discrete` always inherited from the base kind); `catalogueEntry()` searches both
lists. Each of the 8 underlying element modules got exactly one targeted change so the
variant-relevant field(s) read from the per-instance merged config instead of the module's frozen
default constant (e.g. `hanging-planks.js#plankLayout(span, cfg = PLANKS)`,
`net-bridge.js`'s `loadSag`/`loadWidth` via `element.config`).

`js/park/layout-route.js` gates which pool an edge is drawn from: `variantsAllowedFor(routeId,
category)` – black/legendary always, red only from numeral ≥ 2 (a fresh red-I stays the "plain"
introduction to each family) – and `buildEdges()` concats `CATALOGUE_VARIANTS` into the pool when
allowed. **Umsetzstation** (a mid-zip transfer platform, GDD's own term for a real-world Kletterwald
feature): for `category === "black"`, `buildZip(...)` plans the normal zip (`planZipline`) and then –
only if that succeeds – plans a **second, fully independent** `planZipline()` leg from the first leg's
own landing (same shared `ZIP_SEARCH_CONFIG`), storing it as `zip.transfer` if it also succeeds. Two
independently-validated real zip spans chained end to end, not a two-parabola tangent hack, and not
`plan.length > 70` sampled off one stretched cable – the latter was tried first and never fired across
any of seeds 1–8, because `zip-plan.js#ZIP_PLAN.maxLength` (56 m) caps every single-line search, and
raising that cap was rejected outright (`tests/unit/zipline.test.mjs` hard-asserts every zip stays in
40–56 m). `js/park/loader.js` extracts the shared `buildOneZipLeg({...})` (used by an ordinary single
ride *and* both Umsetzstation legs) and `buildRouteZip()` builds a second leg departing from the first
leg's own landing deck (`startPlatformId: "${routeId}-transfer"`) when `zip.transfer` exists, returning
`{element: legB.element, landing: legB.landing, extra: [legA]}`; the route object exposes
`zipLandings` (array) so `course.dispose()` frees both decks. `js/game/route.js#routesFromPark` adds the
transfer leg's own length/par time and a second obstacle id (`${route.id}-zip2`); `js/game/session.js`'s
`zip:finished` handler gained `if (run.progress < run.total) continue;` right before `run.finish()` so
completing only the *first* leg of a split zip does not prematurely end/record the route (a zip is
always the run's last obstacle on a non-split route, so `progress` already equals `total` there and this
guard changes nothing for those). `js/npc/agents.js`'s zip-kind sequence step reads the element's own
`getExitAnchor()` for its destination node/stand instead of a hardcoded `${route.id}-zip-landing` id, so
guests also complete correctly on a split zip. Verified empirically: `black-1` in the default seed 1 gets
a transfer station (leg A 56 m, leg B 56 m); most black routes across seeds 1–8 get one too.

### Visual polish
`css/screens.css`: `.screen h1` gained explicit colour/text-shadow/a bottom border (heading contrast on
the kassa/briefing/options/accident panels was too low against their translucent backdrops; `.kassa-
sheet h1` keeps its own lighter-background override). `js/ui/map-render.js`: route colours on the course
map / park board no longer overwrite the shaded terrain outright – `PATH_BLEND` (0.62) blends the route
colour into the underlying pixel instead, and `paintRoutes()`'s relief-style pass gained a
`ctx.shadowColor`/`shadowBlur` glow reset immediately after the main polyline stroke (dimmed/print style
unaffected); default `lineWidth` 2.4 → 3.0. Route banner category shapes and stamp-card category-
coloured stamps were already in place from M1.2/M2a (see the Colour + shape audit above) – nothing
further needed there.

### Graphics options (ROADMAP "Grafikoptionen")
`js/config.js#GRAPHICS`: three frozen presets (`high`/`medium`/`low`), each
`{pixelRatioCap, shadowMapSize, impostorNear, groundDetailScale, labelKey}`. `js/ui/options.js`'s new
Graphics section (`buildGraphicsSection`, reusing the locale switcher's pill-button markup –
renamed `pillButton`) calls `applyGraphicsLive(id)` on selection: `renderer.setPixelRatio(min
(devicePixelRatio, cap))`, `sky.setShadowQuality(size)` (`js/world/sky.js`, new – `size <= 0` disables
`sun.castShadow` outright for Low, otherwise resizes `sun.shadow.mapSize` and disposes the old shadow
map so three.js rebuilds it), `forest.setLodDistances({near, mid})` (`js/world/forest.js`, new – forces
an immediate `refresh()` so the impostor swap is visible the same frame) and `groundDetail
.setDetailScale(scale)` (`js/world/ground-detail.js`, new – `refresh(fx, fz)` recomputes each family's
squared radius from `radius × getScale()`). All four dependencies are optional constructor params on
`createOptions(...)`; persisted as `save.data.settings.graphics` (validated against `GRAPHICS.order`,
corrupt/missing falls back to `"high"`) and re-applied via the existing `applyAll()` at boot.

**Bug found during verification**: `createForest(...)`'s returned object exposed `lod: FOREST_LOD` – the
*frozen* High-quality default constant – instead of the mutable `{near, mid}` local variable
`setLodDistances` actually writes to and `lodFor()` actually reads. The live LOD-switching itself was
never broken (`stats.byLod` visibly shifts when `setLodDistances` is called, confirmed by forcing
`{near:5, mid:10}` and watching almost every tree move to the impostor bucket), but anything reading
`forest.lod` externally – the F1 debug panel, a future test – would always see the High defaults
regardless of the active preset. Fixed by exposing the real local `lod` binding instead; no other module
read `forest.lod` before this fix (grepped clean), so the change is behaviour-neutral except for making
the introspection honest.

### Touch controls (ROADMAP M2b, deliberately basic – see HANDOVER.md's Offen list)
`js/ui/touch-controls.js` (new): `createTouchControls({root, input})` on pointer-coarse devices
(`matchMedia("(pointer: coarse)")`, exported as `isTouchDevice()`) or `?touch=1`. One left stick zone
(pointer-events drag, clamped to `TOUCH.stickRadius`, feeds `move`), one right-side look-drag zone
(`input.addVirtualLook(yawRadians, pitchRadians)` – pre-scaled by `TOUCH.lookSensitivity` here, the input
module takes radians, never raw pixels) and three buttons (`clip`/`interact`/`jump`, tracked in a `held`
Set). `update()` (called once per input-phase frame from `js/main.js`) pushes `input.setVirtualState
(held, move)`. `js/core/input.js#poll()` merges the virtual down-set and move/look into the same
composition keyboard/gamepad already go through, so every consumer downstream (movement, belay, the zip
ride) reads one action model regardless of input source – no touch-awareness needed anywhere else.
No remapping, no haptics, no per-device tuning pass; verified via direct `pointerdown`/`pointerup`
dispatch (button `down` class + `input.down("clip")` both flip correctly) rather than a real touch
device.
