# ROADMAP – Wipfel

Binding milestone and task list (checkboxes are ticked off here; the milestone notes shows
only the current milestone and the next tasks). Each task is scoped so that it is finished and
committed in ≤ 45 minutes. Acceptance criteria are binding.

**Priority order when goals conflict:** 1 functional correctness · 2 game feel · 3 stable
physics · 4 readability for the player · 5 stable architecture · 6 visual quality · 7 amount of
content · 8 polish. Never sacrifice working controls for nicer vegetation; never sacrifice
deterministic generation for decorative UI.

---

## M0 · "One Plank" – a blue route that feels right

- [x] **M0.1 Bootstrap** – `vendor/` (Three.js ES build + addons, Rapier compat), `tools/vendor.ps1`,
      `index.html` with import map, `css/base.css`, `js/main.js`, `js/config.js` (constants),
      `core/loop.js` (fixed physics step 60 Hz, render interpolation, phases input → physics →
      gameplay → render → ui), `core/rng.js`, `core/input.js`, `ui/debug.js` (F1 / `?debug=1`),
      error screen on WebGL/Rapier init failure; empty scene with ground collider and a falling
      test sphere; 0 console errors, 0 external requests. First unit test (`node --test`): RNG determinism.
- [x] **M0.2 World Slice** – hillside terrain from layered coherent noise with erosion-like shaping
      (flatter hubs, steeper edges, paths), ground detail (foliage, roots, stones, grass tufts),
      40–60 instanced trees with bark/normal map, branchwork, leaf masses with wind, density map,
      exclusion zones around paths/platforms, higher-quality "hero trees" for routes; sky, sun with
      shadows, fog/depth, tone mapping, distant skyline silhouette. Draw calls in the debug panel.
- [x] **M0.3 Player on the Ground** – Rapier character controller (capsule), walking/sprint/jumping/slopes,
      over-the-shoulder camera with collision avoidance (thinning out crowns, no clipping through trunks),
      first-person toggle, procedural character with harness/helmet and pose blending (states: idle, walk, run,
      crouch, ladder, balance, grab, hang, pull-up, jump, land, harness-fall, recover, zipline, net),
      gamepad + keyboard/mouse per the GDD table.
- [x] **M0.4 Platform + Ladder + Re-clipping** – entry deck (~40 cm, bench) with clip-in point,
      wooden block ladder as a rail (board on the trunk, staggered blocks), platform (planks on a
      round-timber ring, clamps, anchors, capacity 3) with collider, belay rope around the trunk,
      carabiner state machine (two-click ritual, order enforced), HUD carabiner widget,
      two click sounds, context prompt. Reference: reference photos of a real high-ropes park.
- [x] **M0.5 First Obstacles on Rails** – shared interface (`build`, `createPhysics`, `update`,
      `dispose`, `getEntryAnchor`, `getExitAnchor`, `getDifficultyMetrics`), Burma bridge, hanging
      planks, net; wobble model, balance pendulum, strength, nerves (heartbeat, camera breathing,
      hand tremor, freeze + breathing); fall into the harness (Rapier pendulum), pull-up, hand-over-hand to the
      platform, rescuer reset; first fall dramatic (impact/harness-tension sound, camera sag,
      haptics abstraction, breath).
- [x] **M0.P Performance Pass** – terrain as 6 × 6 chunks of 80 m each with index LOD (2/4/8 m, one
      vertex/index buffer per chunk, `setDrawRange`) and skirts against T-junction cracks,
      `terrain.update(dt, focusPos)`; ground detail repacked by distance (45–90 m per family);
      leaf litter tiled from 5,5 m down to 2,0 m (leaves 7–16 cm instead of ~40 cm) plus macro variation
      against the repetition; forest impostors from 100 m instead of 135 m; shadow pass decluttered
      (terrain, forest LOD 1, pebbles/twigs/harness gear no longer cast). 1280 × 720, seed 1:
      **1,70–1,80 M → 0,26–0,36 M triangles**, **198–292 → 141–262 draw calls**, terrain 115 k → 14 k
      at ground level. Unit test `chunk-index.test.mjs`. fps on real hardware still open.
- [x] **M0.6 Flying Fox** – analytical ride (gradient, sag, mass, wind), first-person camera with
      wider field of view, trolley whir, vegetation streaming past, net brake with "legs up",
      physical arrival; top speed as a post-ride stat.
      Pure model `zipline/{physics,brakes}.js` (parabolic sag, mass → sag → speed, wind as effective
      drag, getting stuck + hand-over-hand), line planning `park/zip-plan.js`
      (gradient 4,5–6 %, clearance, tree-free corridor, landing zone – the first half of the M1.1 validation),
      hardware `elements/zipline.js` + arrival platform `park/zip-landing.js`, state
      `player/on-zipline.js`. Seed 1: **56,0 m span, 5,50 % gradient, 3,08 m drop, 1,12 m
      sag**, arrival platform 2,42 m, brake zone from 50,1 m; top speed 21,2 / 22,5 /
      23,5 / **24,3 km/h** per size class (legs down 1,0–1,5 km/h less), ride 11,5–13,4 s.
      Unit tests `tests/unit/zipline.test.mjs` (18).
- [x] **M0.7 HUD v1 (mockup 1:1), tuning, proof** – route header (color bar, category, name,
      progress, time, best), flow display (placeholder logic until M2), mode icons, zipline overlay
      with speedometer, safety tooltip, start banner with key stats + countdown 3-2-1-GO, carabiner
      widget, strength ring, heartbeat, context prompt; `en.json`/`de.json`; breathing, tuning pass,
      `?autoplay=1` bot, screenshots `docs/screenshots/m0-*.png`, smoke checklist green,
      `docs/architecture.md`. **Tag `m0`.**

**Acceptance M0 = "First Playable":** game loads · forest walkable · up the ladder · clip in · cross the
Burma bridge, planks, net · slip off and get caught · back onto the obstacle · clip into the Flying Fox,
ride, land · route completed with feedback (stamp) · 60 fps · 0 console errors ·
0 external requests · testers lean to the side when the plank tips.

## M1 · "One Ticket" – a run

- [x] **M1.1 Park Definition + Layout Generator** – `assets/parks/sonnwendberg.json`, seeded generator
      on the graph with **validation** (start/end anchors, cable angle, clearance, no
      tree penetration, walkability, continuity, landing zones, zip gradient 3–6 %, platform access);
      unit tests: graph connectivity, generator validity, difficulty metadata.
- [x] **M1.2 Six Routes** – 2 blue, 2 red, 2 black + Green practice route; names in addition to
      color + Roman numeral (e.g. `RED ROUTE III · RAVEN RUN` / "Rot III · Rabenlauf"); platform types
      (transition, standard, junction, start, zip arrival, rest, hub); start banner per route with
      key stats; signposts like in the real park: arrow-shaped white boards with a colored border, color name in
      capitals, numerals in circles (+ shapes) at start areas and junctions.
- [x] **M1.3 Ticket Desk + Safety Briefing** – ticket type, size class, mode; trainer dialog with real content;
      practice route at 1 m height as unlock.
- [x] **M1.4 Course Map + Park Map** – course map overlay 1:1 per mockup (relief background from
      the terrain, colored routes with platform nodes, player position, legend Green/Blue/Red/Black/
      Legendary, Filter/Player/Zoom/Exit) from the graph; in the world additionally the diegetic
      park-map board in the style of the real ones (green map on posts, loops with Roman numerals);
      wait times, discovered sections, maps per route, stamp card.
- [x] **M1.5 Ticket Clock + Unlocks + Stamp Card** – 4 h = 40 min, last admission, extension,
      color unlocks, run end with feedback.
- [x] **M1.6 NPC Guests** – agents on the graph with platform/obstacle rules → queues; watching
      builds trust.
- [x] **M1.7 Save + Options** – versioned save schema with validation, settings (volume
      categories, reduced motion/shake, assist, color + shape, key bindings prepared).
- [x] **M1.8 Second Obstacle Families** – at least 12 robust obstacles in total (barrels, monkey bars/rings,
      Tarzan swing, beams, skateboard …). **Tag `m1`.**

**Acceptance M1:** a run takes 30–40 min, and you want "another half hour"; Red feels different from Blue
(height, movement, strength), not just harder.

## M2 · "One Park"

- [x] 15 routes + 2 toddler courses, junction platforms, Legendary route
- [x] season pass mode (open), time trials (3-2-1), flow multiplier (only with calm nerves),
      re-clip feedback (clean/fast/perfect), mastery levels per route
- [x] night climbing (headlamp), three belay modes, photos, sidegrades
- [x] obstacle catalog to 20–25 families/variants, transfer stations
- [x] visual polish (map saturation, panels, banners, stamps), graphics options (High/Medium/Low),
      touch controls (basic). **Tag `m2`.**

## M3 · "The Operator" (decision after M1 – ADR-019)

- [x] builder (trees with assessments, platforms, catalog, Flying Fox tool), route inspector
- [x] guest simulation with profiles, overlays (waiting, fear, rescue, trees)
- [x] walkthrough as mandatory unlock, guide and rescuer roles
- [x] inspections, PPE aging, weather/evacuation, economy, ticket models
- [x] sharing routes with rating/best time. **Tag `m3`.**

## M4 · "The Others" (local – ADR-029)
- [x] local co-op for 2 (gamepad + keyboard, companion rule), spectator cheers, shared physics, co-op obstacles — further chapters up to the
      park that no one could build.

---

## Non-Goals (for now)
Multiplayer netcode before M4 · fantasy regions before the last chapter · heights above 20 m before M2 ·
RPG stats · monetization · cloud saves · weapons/combat (never).
