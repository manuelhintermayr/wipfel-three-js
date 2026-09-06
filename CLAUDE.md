# CLAUDE.md – Wipfel

Guidance for AI coding agents (and humans) working in this repository. `AGENTS.md` is the same rule set
for other agents. Read this before making changes.

## What this is

A browser **high-ropes climbing park** game: **Three.js** (rendering) + **Rapier** (physics), a static
website with **no build step**, all assets **procedural**, served by `python serve.py` (port 8200).
Design: [`docs/GDD.md`](docs/GDD.md). Architecture and module contracts:
[`docs/architecture.md`](docs/architecture.md). Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md).
Plan: [`ROADMAP.md`](ROADMAP.md).

## Start of a session

`pwd` · `git status` · `git log --oneline -15` → read `CLAUDE.md` → `ROADMAP.md` →
`docs/architecture.md` → then only the source files you actually need → `python serve.py`, load the page,
check the console. **Then** work on the task. Never blindly rebuild an existing system — read it first.

## Hard rules

1. **No build, no framework, no backend, no CDN.** Only `index.html`, `css/`, `js/` (ES modules with an
   import map), `assets/` (data), `vendor/` (Three.js, Rapier). Network tab: `127.0.0.1` only.
   `package.json` is `"type": "module"` only — no runtime dependencies.
2. **Everything procedural.** No third-party image/audio/3D files — not even “temporarily”. Textures on a
   canvas, geometry in code, audio via WebAudio synthesis. Offline-baked outputs of your own `tools/`
   scripts may live under `assets/generated/` if generator, seed, resolution and purpose are documented.
3. **Small files (≤ ~400 lines), one responsibility, no cyclic imports, constants in `js/config.js`.**
   Run `node --check <file>` after each edit.
4. **Determinism.** `core/rng.js` instead of `Math.random()` in gameplay/procgen; `?seed=` reproduces the
   park. Fixed 60 Hz physics step, interpolated render; loop phases input → physics → gameplay → render → ui.
5. **One store, versioned saves.** `core/store.js`, `localStorage['wipfel-save-v1']`, a schema version,
   validate loaded data, additive migration.
6. **Debug hooks stay:** F1 / `?debug=1`, `?autoplay=1`, `?seed=`, `?fast=1`; a single global namespace
   `window.WIPFEL`; keep the debug UI separable from the product UI.
7. **Errors are never silent.** Init failure → error screen; generator failure → diagnostics + fallback;
   `console.info/warn/error` on purpose, no noise.
8. **Language:** code, comments and commit messages in English. UI text only via
   `assets/strings/*.json` (English default plus German).
9. **Git:** Conventional Commits, one task = one commit. **No co-author lines, no “Generated with …”
   lines.** No force-push and no history rewriting without asking first. Milestone tags `m0`…`m4`.
10. **Keep the docs honest.** Record real decisions as ADRs in `docs/DECISIONS.md`, tick milestones in
    `ROADMAP.md`, and update `docs/architecture.md` when a contract changes. No claims without proof
    (“done”, “60 fps”, “production-ready”); provisional means provisional.
11. **Priority order:** correctness → game feel → stable physics → readability → architecture → visual
    quality → content → polish.

## Testing (details: [`docs/testing.md`](docs/testing.md))

```bash
node tools/check-all.mjs                     # syntax gate for every JS file
node --test "tests/unit/**/*.test.mjs"       # pure-logic unit tests
node tests/smoke.mjs                         # optional headless smoke (needs playwright-core)
```

Load via `serve.py` and verify in the browser: console clean, network `127.0.0.1` only, F1 panel
fps ≥ 55 and draw calls < 300. **Runtime behaviour is the truth.**

## Don'ts

- No fantasy regions, no heights above 20 m before M2, no multiplayer netcode before M4, no weapons.
- No RPG statistics; progression = unlocks, mastery levels, trust, sidegrades.
- No design tokens scattered around: colours/typography live in `css/base.css`.
- No large binaries (screenshots < 300 KB).
- No placeholders without an “open/provisional” note; no unproven claims.

## Tool traps

PowerShell 5.1 (no `&&`, no `?:`); downloads via `curl.exe -L -A "Mozilla/5.0"`; delete a git
`index.lock` only when no git process is running; the browser pane renders local files only over HTTP
(never `file://`).
