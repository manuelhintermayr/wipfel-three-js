# TESTING – Wipfel

Three levels: (1) syntax gate, (2) unit tests of pure logic, (3) browser verification (smoke checklist,
optional headless). Runtime behaviour in the browser is the truth.

## 1 · Syntax Gate (after every edit)
```
node --check js/<file>.js
node tools/check-all.mjs        # all .js/.mjs under js/, tools/, tests/
```
Catches syntax errors and – important on this Windows mount – truncated files.

## 2 · Unit Tests of Pure Logic
Node’s own test runner, no dependencies:
```
node --test "tests/unit/**/*.test.mjs"
```
Convention: `tests/unit/<module>.test.mjs`, `import test from "node:test"; import assert from
"node:assert/strict";`. Only modules without DOM/WebGL/Rapier needs are tested (slice the logic
so that it is testable):
- `core/rng.js` – same seed → same sequence; different seeds → different sequences; distribution roughly.
- `park/graph.js` – connectivity, capacities (platform 3, obstacle 1), directed edges, one-way sections.
- `park/layout.js` – generator validity for N seeds: start/end anchors present, rope angle within range,
  clearance, no tree intersection, continuity, landing zones, zip gradient 3–6 %, platform access.
- `park/catalog.js` – axis profiles 0–5, required fields per family.
- `core/save.js` – serialization/deserialization, schema version, corrupt data → defaults, additive migration.
- `zipline/physics.js` – arrival speed increases with mass, decreases with headwind; light riders come
  to a stop at the sag (edge case).
- `player/belay.js` – state machine: never both carabiners open (smart belay mode), order enforced.

## 3 · Browser Verification

### 3.1 Manual Smoke Checklist (before every milestone day, shortened before every commit)
```
[ ] Page loads via serve.py without console errors/warnings
[ ] Network tab: only 127.0.0.1 (0 external requests)
[ ] Debug panel (F1 / ?debug=1): fps ≥ 55, draw calls < 300, physics time stable
[ ] Player spawns, walks, sprints, jumps, collides with ground/trees/platform
[ ] Camera does not clip through trunks; first-person toggle works
[ ] Ladder: climb up onto the platform
[ ] Re-clipping: click – click, widget shows states, never both open
[ ] Obstacles: Burma bridge, planks, net traversable; balance/strength/nerves noticeable
[ ] Fall: caught in the harness, pendulum, pull-up/hand-over-hand, rescuer reset
[ ] Flying Fox: clip in, ride, brake/landing, arrival at destination
[ ] Course completed → feedback (stamp)
[ ] Park map opens (Tab), pause (Esc)
[ ] ?autoplay=1 runs through the M0 course without errors
[ ] ?seed=1 reproducibly generates the same world (screenshot comparison)
```

### 3.2 Headless Smoke (optional)
```
node tests/smoke.mjs [--port 8200] [--seconds 20]
```
Starts `serve.py`, loads `?autoplay=1&debug=1&seed=1`, counts console errors and external requests,
screenshot to `tests/out/smoke.png`. Needs `playwright-core` (dev-only, `npm i -D playwright-core`)
and a Chromium; if it is missing, the test ends with SKIP (exit 0).

### 3.3 Browser Pane / Playwright MCP in Claude Code
`.claude/launch.json` → configuration “wipfel” starts `serve.py`; screenshots as evidence to
`docs/screenshots/<milestone>-<nr>-<topic>.png` (< 300 KB), link in the milestone notes.

## 4 · Review Loops (before milestone days)
**Visual:** scale · silhouette · material quality · light · composition · forest density · depth ·
readability · visibility of the course · believability of the platforms · hardware detail · readability of the
figure. If it looks bad: name the cause, do not add more objects.
**Gameplay per obstacle:** Is the goal readable? Do the controls respond? Is failure understandable? Is
recovery possible? Does difficulty come from skill, not from poor controls? Does it feel different
from the neighboring obstacle? Does it create a story? Rebuild or cut weak obstacles.

## 5 · Honesty
Do not call anything “finished”, “60 fps”, “production-ready” or “animated” that has not been measured or
seen. Anything provisional is noted in the milestone notes under “open/provisional”.
