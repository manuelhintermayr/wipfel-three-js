# HANDOVER – Wipfel

> Lebendes Dokument. Nach **jedem Commit** aktualisieren. Der Gesamtzustand steht hier; was in einer
> einzelnen Session passiert ist, steht unter `docs/sessions/`; die Aufgabenliste mit Checkboxen in
> `ROADMAP.md`. Eine neue Session muss allein mit dieser Datei + `ROADMAP.md` weiterarbeiten können.

## Aktueller Meilenstein
**M0 „Ein Brett“** – M0.1 Bootstrap ✓, M0.2 Weltausschnitt ✓, M0.3 Spieler am Boden ✓ (integriert,
Session 1, 2026-08-17). Nächster Schritt: **M0.4 Podest + Leiter + Umhängen**.

## Letzter funktionierender Commit
`bc9cec7 feat(world): integrate terrain, forest, sky/skyline, wind, ground detail and player into main loop`
(plus Docs-Commit danach – `git log --oneline -3`). Geprüft: Seite lädt über `serve.py`, 0 Konsolenfehler,
0 externe Requests, Spielerin geht/steht auf dem Terrain, 607 Bäume, 220 Draw-Calls, ~77 fps headless
(SwiftShader; echte GPU schneller). Screenshot: `docs/screenshots/m0-2-world-first-integration.png`.

## Was funktioniert
- **Kern:** `js/main.js` (Boot + Loop-Verdrahtung), `core/{loop,input,rng,params,errors,events,renderer,physics}.js`,
  `ui/debug.js` (F1 Panel; **F2 / `?physics=1`** = Rapier-Wireframe – getrennt, weil das Heightfield-
  Wireframe alles überdeckt), `js/config.js` (Kategorien Green/Blue/Red/Black/Legendary, Regeln,
  Größenklassen).
- **Welt:** `world/terrain.js` (+ `terrain/{heightfield,paths,material}.js`; Hang N→S, Wege, Hubs
  `spawn@(11,-163) r20`, `hut@(-115,33)`, `deck-east@(113,-33)`, `deck-top@(-16,147)`; Rapier-Heightfield,
  `heightAt/normalAt/slopeAt/isPath`), `world/ground-detail.js` (+ `procgen/geometry/ground-props.js`,
  `procgen/textures/{ground,texture-utils}.js`: Laub, Steine, Wurzeln, Gras – instanziert, Wind),
  `world/forest.js` (+ `forest-placement.js`, `procgen/geometry/tree*.js`, `procgen/textures/{bark,foliage,tree-texture-utils}.js`:
  Kiefer/Eiche/Buche/Ahorn/Hasel, 3 LODs, Instancing, Hero-Bäume mit Collidern, Wind-Shader),
  `world/wind.js`, `world/sky.js` (Dome, Sonne, Hemi, Nebel, Exposure, Tag/Nacht, `setTimeOfDay`),
  `world/lighting.js` (Sonnenbahn/Farben, unit-getestet), `world/skyline.js` (Hügelringe + Stadt-Silhouette).
- **Spieler:** `player/controller.js` (Rapier-KCC, Kapsel, Gehen/Sprint/Springen/Hänge, Zustandsautomat
  `states.js`, Tuning `tuning.js`), `player/camera.js` (Schulterkamera mit Kollision, Ego-Umschaltung T),
  `player/rig*.js` (prozedurale Kletterin: Tanktop, Capri, Komplettgurt orange, Handschuhe, Haarknoten;
  Posen idle/walk/run/jump/land; Attach-Punkte).
- **Dev-Seiten:** `tools/dev/{forest,terrain,sky,player}.html` – je Modul isoliert testbar
  (`?seed=`, Views, Bot); Screenshots `docs/screenshots/dev-*.png`.
- **Tests:** `node tools/check-all.mjs` (47 Dateien), `npm test` (13 Tests: RNG, Lighting, check-all).

## Was halb fertig ist
- Hero-Bäume: `main.js#pickHeroTrees` setzt 7 Kiefern um den Spawn-Hub (Provisorium bis der
  Layout-Generator M1.1 die Parcours-Bäume liefert).
- HUD/Screens: nur CSS-Gerüst (`css/hud.css`, `css/screens.css`), noch kein `ui/hud.js`.
- i18n: `assets/strings/en.json|de.json` existieren noch nicht (`core/i18n.js` fehlt).

## Was kaputt ist
– nichts Bekanntes. Beobachtungen: siehe „Offen / Provisorisch“.

## Dateien, an denen gerade gearbeitet wird
– keine (sauberer Stand nach Commit).

## Wichtige Architekturentscheidungen
`docs/architecture.md` (Modulverträge – **vor M0.4 um Podest/Leiter/Belay-Verträge erweitern**),
`docs/DECISIONS.md` ADR-001…012, 020…027 (Mockup 1:1, UI EN+DE, Kategorien mit Green). Offen: ADR-013
(Three.js 0.185.1 – faktisch entschieden, eintragen), ADR-014 (Rapier compat 0.20.0 – dito), 015–019.

## Bekannte Bugs
– keine reproduzierten. Zu prüfen: Kamera-Kollision mit Kronen im echten Wald (nur in Dev-Seite getestet).

## Unmittelbar nächste Aufgabe
**M0.4 Podest + Leiter + Umhängen** (`ROADMAP.md`): Vertrag in `docs/architecture.md` ergänzen
(`park/platform.js`, `elements/ladder.js`, `player/belay.js`), dann bauen: Einstiegsdeck (~40 cm, Bank)
am Fuß von `heroTrees[0]`, Holz-Blockleiter (Brett + versetzte Klötze) als Schiene, Podest (Planken auf
Rundholz-Kranz, Klemmen, Anker) mit Collider, Sicherungsseil um den Stamm, Karabiner-Zustandsautomat
(Zwei-Klick-Ritual), HUD-Karabiner-Widget, zwei Klick-Sounds (WebAudio), Kontext-Prompt.
Vorbild: `docs/reference/photos/README.md` (Foto 01/02).

## Nächste fünf Aufgaben
1. M0.4 (oben). Commit `feat(park): first platform, block ladder and belay ritual`.
2. M0.5 Übungen auf Schienen: `elements/element.js` (Interface + Spline + Wackelmodell), Burma-Brücke,
   hängende Planken, Netz; `player/{balance,stamina,nerves,fall}.js`; Sturz in den Gurt (Rapier-Pendel).
3. M0.6 Flying Fox: `zipline/{physics,brakes}.js`, `elements/zipline.js`, Ego-Kamera, Netzbremse.
4. M0.7 HUD 1:1 (`ui/hud.js`, `core/i18n.js`, `assets/strings/en.json|de.json`), Start-Banner +
   Countdown, Sicherheits-Tooltip, `?autoplay=1`-Bot, Screenshots, Smoke-Checkliste, Tag `m0`.
5. Performance-Pass: Terrain-Dreiecke (~1,3 M) auf Chunks/LOD reduzieren; Laubstreu-Textur kleiner
   kacheln (Blätter wirken ~40 cm groß); Kronen-Ausdünnung um die Kamera prüfen.

## Offen / Provisorisch
- Terrain-Mesh sehr dicht (~1,3 M Dreiecke) → Chunk-LOD nötig (Budget: < 300 Draw-Calls, ≥ 55 fps).
- Bodentextur (Laub) zu groß skaliert; Waldboden-Farbton in der Distanz zu dunkel/monoton.
- Bäume: gut lesbar, aber Kronen noch „kartig“ bei LOD 1/2; Astwerk sparsam; weiterer Look-Pass in M2.
- Figur: Kopf/Hände einfach; Posen-Blending ok; Kletterposen (ladder, balance, grab, hang, zipline)
  existieren als Namen, sind aber noch nicht animiert.
- `?autoplay=1` noch ohne Wirkung im Hauptspiel (Bot existiert nur in `tools/dev/player.html`).

## Wie starten
```
python serve.py             # http://127.0.0.1:8200/   (?debug=1 Panel · ?physics=1 Wireframe · ?seed=N · ?fast=1)
```
Browser-Pane in Claude Code: `.claude/launch.json` → „wipfel“. Steuerung: WASD, Maus (Klick = Pointer-Lock),
Shift Sprint, Leertaste Sprung, T Kamera, F1 Debug, F2 Physik-Wireframe, Esc Pause.

## Wie testen
```
node tools/check-all.mjs                       # Syntax-Gate
node --test "tests/unit/**/*.test.mjs"         # Unit-Tests
node tests/smoke.mjs                           # optional (playwright-core), sonst SKIP
```
Dev-Seiten: `/tools/dev/forest.html`, `/tools/dev/terrain.html`, `/tools/dev/sky.html`, `/tools/dev/player.html`.
Manuelle Smoke-Checkliste: `docs/testing.md`.

## Debug-Kommandos / URL-Parameter
`?debug=1`/F1 Stats · `?physics=1`/F2 Rapier-Wireframe · `?seed=<n>` · `?fast=1` · `?locale=de` ·
`?belay=continuous|smart|classic` (noch ohne Wirkung) · `window.WIPFEL` = {loop, physics, scene, camera,
renderer, rng, input, events, terrain, forest, sky, wind, player}.

## Aktueller Seed / Reproduktionsfälle
Standard-Seed 1 (`DEFAULTS.seed`). Spawn (11.1, 4.8, −163.3) auf Hub `spawn`. Reproduktionsfälle: –

## Fallen / Hinweise
- **Subagenten nie auf Fable 5** – nur `model: "opus"` oder kleiner (siehe CLAUDE.md 12).
- Server nur `serve.py`; Write/Edit können große Dateien abschneiden → `node --check`; Netzwerk nur lokal;
  PowerShell 5.1; `curl.exe -A "Mozilla/5.0"`.
- Rapier-Wireframe (`?physics=1`) auf dem Heightfield kostet Millionen Linien – nur kurz einschalten.
