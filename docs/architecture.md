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
  mode, state(), isSafe(), bothOnSameAnchor(), currentAnchor(), pendingAnchor(),
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
to the bus as `belay:*` by main.js.

### `js/player/interaction.js` + `js/player/climb-ladder.js`
```js
createInteraction({ player, input, belay, course, hud, events, vitals?, save? }) → { update(dt), prompt, anchor, entry, dispose() }
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
| `js/core/i18n.js` | `initI18n({locale, dicts?})` (fetches `assets/strings/<locale>.json`, en fallback), `t(key, vars?)`, `formatTime(s)`; missing keys render as the key |
| `js/core/save.js` | `createSave(storage?) → {data, routeBest(id), recordRun(id,{seconds,falls})→isBest, isUnlocked(category), unlockCategory(category)→isNewlyUnlocked, setLocale, flush}`, `nextGateCategory(category)` (pure, blue→red→black→null); schema-versioned, corrupt data collapses to defaults; `data.unlocks` (M1.2, GDD §3.12: "Farben sind Tore") is additive – blue always `true`, red/black default `false`, forced back to the default shape on load regardless of what an old/corrupt save says |
| `js/game/route.js` | `createRouteRun(def)`: idle→armed→countdown(3-2-1-GO)→running→done; `completeObstacle(id)` dedupes; `BLUE_I` (worked example, M0 fixture); `routesFromPark(parkDef)` (M1.1) – pure, one run-def per generated route; `obstacles`/`heightM` (max deck height)/`lengthM` (sum of edge span minus each edge's two `EDGE_OFFSET` lead-ins, plus the zip) are real numbers straight out of `parkDef`, never placeholders |
| `js/game/session.js` | one `createRouteRun` per route (`routesFromPark`), all `update`d every frame; events (`player:ladder-exit`, `player:element-exit`, `player:fell`, `zip:finished`) broadcast to every run – each run's own `completeObstacle` already ignores ids/states it does not own, so at most one ever advances; the HUD follows whichever run is counting down/riding, else the nearest entry deck within 6 m (`course.routes[i].entryDeck`); stores best times per route id, emits `route:completed`; on `zip:finished` also runs the category gate (M1.2): completing a route unlocks the next colour (`save.unlockCategory`, `nextGateCategory`) and folds that into the *same* "route done" notice rather than a second one competing for the line; a locked route's start banner never arms (`shown.arm()` is skipped) |
| `js/ui/hud-route.js` | mockup-1:1 route header (`--cat-color` bar, category, ● numeral · name, progress/time/best), FLOW placeholder, start banner with key figures, countdown discs, safety tooltip; `showBanner(def, best, locked?)` (M1.2) swaps the facts/best/START block for a lock line (`notice.lockedRed`/`lockedBlack`) when `locked` is true |
| `js/game/autoplay.js` | `?autoplay=1`: prompt-driven smoke bot in the **input phase** (synthetic key events must precede edge consumers); starts on the entry deck, goal-directed clipping (only the route's next anchor), plank tapping, holds Space on the zip; platform-hop self-help after repeated stalls (logged as "shortcut") |

Input-phase rule: anything that synthesises keyboard events (bots) must run inside `loop.on("input")` –
edge sets (`input.pressed`) are cleared in the ui phase, so events fired later are invisible to the
next frame's physics.
