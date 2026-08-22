# HANDOVER – Wipfel

> Lebendes Dokument. Nach **jedem Commit** aktualisieren. Der Gesamtzustand steht hier; was in einer
> einzelnen Session passiert ist, steht unter `docs/sessions/`; die Aufgabenliste mit Checkboxen in
> `ROADMAP.md`. Eine neue Session muss allein mit dieser Datei + `ROADMAP.md` weiterarbeiten können.

## Aktueller Meilenstein
**M0 „Ein Brett“** – M0.1 Bootstrap ✓, M0.2 Weltausschnitt ✓, M0.3 Spieler am Boden ✓ (Session 1,
2026-08-17), M0.4 Podest + Leiter + Umhängen ✓ (Session 1, 2026-08-17, via Opus-Agent).
Nächster Schritt: **M0.5 Erste Übungen auf Schienen**.

## Letzter funktionierender Commit
Stand M0.4 (noch nicht committet – Commit-Nachricht: `feat(park): first platform, block ladder and
belay ritual`). Davor: `bc9cec7 feat(world): integrate terrain, forest, sky/skyline, wind, ground
detail and player into main loop`.

Geprüft (2026-08-17, headless Chromium/SwiftShader, 1280×720, Seed 1): Seite lädt über `serve.py`,
**0 Konsolenfehler, 0 Warnungen, 0 externe Requests**; kompletter Ablauf F → F → E → W → F → F
durchgespielt; 607 Bäume, **242 Draw-Calls** (220 ohne Kurs), 1,70 M Dreiecke, 54 Collider,
**3,99 ms/Frame ≈ 250 fps** (der Kurs kostet 0,31 ms/Frame). `node tools/check-all.mjs` 60/60,
`npm test` 24/24. Screenshots: `docs/screenshots/m0-4-{entry-deck,half-clipped,clipped-in,ladder,platform}.png`.

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
  Posen idle/walk/run/jump/land/ladder; Attach-Punkte).
- **Park (M0.4):** `procgen/textures/wood.js` (Planke/Rundholz/verwittert, je Albedo+Normal+Rauheit,
  gecacht), `park/timber.js` (Bauteil-Kit; alles wird pro Material zu **einem** Mesh verschmolzen →
  14 Draw-Calls für den ganzen Kurs), `park/platform.js` (Rundholz-Rahmen, Planken mit Fugen und
  Stamm-Ausschnitt, Gummimanschette, 8 Klemmklötze mit Stahlbändern, Schrägstützen, 12-mm-Sicherungs-
  seilring 1,9 m über dem Podest), `park/entry-deck.js` (40 cm, Bank, Einhängeseil, Piktogramm-Schild),
  `elements/ladder.js` (dunkler Rücken, versetzte Klötze alle 28 cm, Stahlseil, blaues Hilfsseil),
  `park/first-course.js` (Deck → Leiter → Podest auf der Hero-Kiefer am Spawn-Hub).
  `procgen/geometry/tree-species.js#trunkRadiusAt` liefert den echten Stammradius (Verjüngung +
  Wurzelanlauf) – ohne das schwebt alles oben und steckt unten im Stamm.
- **Umhängen (M0.4):** `player/belay.js` (reine Logik, 11 Unit-Tests; smart = Zwei-Klick-Ritual,
  beide Karabiner können nie offen sein; continuous = ein Druck; classic = Fehler möglich),
  `player/interaction.js` (Anker in 1,6 m → F, Leiter in 1,5 m → E, Kontext-Prompt),
  `player/climb-ladder.js` (Schienen-Fortbewegung, KCC aus, 0,9 m/s, Leiter-Pose), `ui/hud.js`
  (Karabiner-Widget + Prompt mit `<kbd>`), `audio/synth.js` + `audio/sfx.js` (WebAudio-Klicks,
  erst nach echter Nutzergeste). Ablauf: F → F (einhängen) → E (klettern) → oben F → F (Podestring).
- **Dev-Seiten:** `tools/dev/{forest,terrain,sky,player}.html` – je Modul isoliert testbar
  (`?seed=`, Views, Bot); Screenshots `docs/screenshots/dev-*.png`.
- **Tests:** `node tools/check-all.mjs` (60 Dateien), `npm test` (24 Tests: RNG, Lighting, Belay, check-all).

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
`docs/architecture.md` (Modulverträge – Park/Belay/HUD/Audio seit M0.4 eingetragen),
`docs/DECISIONS.md` ADR-001…012, 020…027 (Mockup 1:1, UI EN+DE, Kategorien mit Green). Offen: ADR-013
(Three.js 0.185.1 – faktisch entschieden, eintragen), ADR-014 (Rapier compat 0.20.0 – dito), 015–019.

## Bekannte Bugs
– keine reproduzierten. Zu prüfen: Kamera-Kollision mit Kronen im echten Wald (nur in Dev-Seite getestet).

## Unmittelbar nächste Aufgabe
**M0.5 Erste Übungen auf Schienen** (`ROADMAP.md`): `elements/element.js` (gemeinsames Interface
`build`/`createPhysics`/`update`/`dispose`/`getEntryAnchor`/`getExitAnchor`/`getDifficultyMetrics`),
Burma-Brücke, hängende Planken, Netz; Wackelmodell, Balance, Kraft, Nerven; Sturz in den Gurt
(Rapier-Pendel), Hochziehen, Hangeln zum Podest. Das Anker-/Umhäng-System aus M0.4 trägt bereits:
`course.anchors` erweitern und `belay.clipTo(anchorId)` je Element aufrufen.

## Nächste fünf Aufgaben
1. M0.5 Übungen auf Schienen: `elements/element.js` (Interface + Spline + Wackelmodell), Burma-Brücke,
   hängende Planken, Netz; `player/{balance,stamina,nerves,fall}.js`; Sturz in den Gurt (Rapier-Pendel).
2. M0.6 Flying Fox: `zipline/{physics,brakes}.js`, `elements/zipline.js`, Ego-Kamera, Netzbremse.
3. M0.7 HUD 1:1 (`ui/hud.js` erweitern, `core/i18n.js`, `assets/strings/en.json|de.json`), Start-Banner +
   Countdown, Sicherheits-Tooltip, `?autoplay=1`-Bot, Screenshots, Smoke-Checkliste, Tag `m0`.
4. Performance-Pass: Terrain-Dreiecke (~1,3 M) auf Chunks/LOD reduzieren; Laubstreu-Textur kleiner
   kacheln (Blätter wirken ~40 cm groß); Kronen-Ausdünnung um die Kamera prüfen.
5. Politur M0.4: eigener Kamerawinkel auf der Leiter, Hände/Füße auf `ladder.steps` (IK),
   Bodendetail-Ausschluss unter Deck und Podest.

## Offen / Provisorisch
- **M0.4:** Der Kurs steht auf `heroTrees[0]` – der Layout-Generator (M1.1) ersetzt `first-course.js`.
  Nur ein Podest, keine Kapazitätsprüfung (RULES.maxPerPlatform ist gesetzt, aber ungenutzt).
- **M0.4:** Sicherungsseil und Karabiner sind Zustand, keine Physik – `belay.isSafe() === false`
  (classic) wird nur mitgeschrieben, Stürze kommen in M0.5.
- **M0.4:** Podest-Collider ist ein Quader (16 cm dick, weil die KCC durch eine 5-cm-Platte sackt);
  der Stamm-Ausschnitt der Planken ist optisch, nicht physisch. Auf der Leiter ist die Figur
  kinematisch – keine Kollision, kein Absteigen zur Seite.
- **M0.4:** Die Schrägstützen enden auf `tree.y − 0,22 m`; auf steilem Hang schwebt oder steckt ein
  Fuß. Bodendetail (Laub/Gras) weiß nichts vom Deck und wächst stellenweise hindurch.
- **M0.4:** Kamera auf der Leiter bleibt die Schulterkamera und wird vom Stamm eng gedrückt;
  ein eigener Leiter-Kamerawinkel wäre besser (M0.7-Politur).
- **M0.4:** HUD zeigt nur Karabiner-Widget, Kraft-Ring (fix 1,0) und Prompt; UI-Texte stehen noch
  im Code (`player/interaction.js#PROMPTS`), i18n kommt mit M0.7.
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
Shift Sprint, Leertaste Sprung, **F einhängen/umhängen** (classic zusätzlich X für Karabiner B),
**E klettern** (Leiter, dann W hoch / S runter), T Kamera, F1 Debug, F2 Physik-Wireframe, Esc Pause.
Der erste Kurs steht auf der Hero-Kiefer nordöstlich vom Spawn – hinlaufen oder
`WIPFEL.player.teleport(x, y, z)` mit `WIPFEL.course.entryDeck.group.position` benutzen.

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
`?belay=continuous|smart|classic` (wirkt; ungültige Werte fallen auf `smart` zurück) ·
`window.WIPFEL` = {loop, physics, scene, camera, renderer, rng, input, events, terrain, forest, sky,
wind, player, **course, belay, hud, interaction**}.
Skripten/Testen: `WIPFEL.player.teleport(x, y, z)`, `WIPFEL.course.anchors`,
`WIPFEL.course.ladder.rail`, `WIPFEL.belay.state()`.
**Achtung headless:** In Chromium tickt `requestAnimationFrame` nur, wenn der Compositor Frames
liefert – für scriptgesteuerte Läufe `loop.stop()`, `requestAnimationFrame` neutralisieren und
`loop._tick(t)` mit festen 60-Hz-Zeitstempeln selbst aufrufen (siehe Session-Log).

## Aktueller Seed / Reproduktionsfälle
Standard-Seed 1 (`DEFAULTS.seed`). Spawn (11.1, 4.8, −163.3) auf Hub `spawn`. Reproduktionsfälle: –

## Fallen / Hinweise
- **Subagenten nie auf Fable 5** – nur `model: "opus"` oder kleiner (siehe CLAUDE.md 12).
- Server nur `serve.py`; Write/Edit können große Dateien abschneiden → `node --check`; Netzwerk nur lokal;
  PowerShell 5.1; `curl.exe -A "Mozilla/5.0"`.
- Rapier-Wireframe (`?physics=1`) auf dem Heightfield kostet Millionen Linien – nur kurz einschalten.
