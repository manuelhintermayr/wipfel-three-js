# AGENTS.md – Wipfel

Guidelines for AI coding agents working in this repository. These are the same rules as
[`CLAUDE.md`](CLAUDE.md) — read that for the full version; this is the short brief.

## The project

A browser **high-ropes climbing park** game: Three.js + Rapier, a **static site with no build step**,
all assets **procedural**, served by `python serve.py` (port 8200). Design in
[`docs/GDD.md`](docs/GDD.md), architecture in [`docs/architecture.md`](docs/architecture.md), decisions
in [`docs/DECISIONS.md`](docs/DECISIONS.md), plan in [`ROADMAP.md`](ROADMAP.md).

## Before you change anything

`git status` · `git log --oneline -15`, then read `CLAUDE.md` → `ROADMAP.md` → `docs/architecture.md`,
then only the source you need. Run `python serve.py`, load the page, check the console. Never blindly
rebuild an existing system.

## Non-negotiables

- **No build, no framework, no backend, no CDN.** Only `index.html`, `css/`, `js/` (ES modules + import
  map), `assets/` (data), `vendor/` (Three.js, Rapier). `package.json` is `"type": "module"` only.
- **Everything procedural** — geometry in code, textures on a canvas, audio synthesised. No third-party
  media, ever.
- **Deterministic** — `core/rng.js` (never `Math.random()` in gameplay/procgen), fixed 60 Hz physics,
  `?seed=` reproduces a park.
- **Small, single-responsibility files** (≤ ~400 lines); run `node --check <file>` after each edit.
- **English** code/comments/commits; UI text only via `assets/strings/*.json`.
- **Errors never silent**; a single `window.WIPFEL` debug namespace; keep debug UI separable.

## Done means done

Runnable state, console checked, tests green (`node tools/check-all.mjs`,
`node --test "tests/unit/**/*.test.mjs"`), decisions recorded as ADRs in `docs/DECISIONS.md`, milestones
ticked in `ROADMAP.md`. Conventional Commits, one task = one commit, **no co-author or “Generated with …”
lines**, no force-push or history rewrite without asking. Runtime behaviour is the truth — prove claims,
don’t assert them.
