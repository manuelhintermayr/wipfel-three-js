# HANDOVER – Wipfel

> Lebendes Dokument. Nach **jedem Commit** aktualisieren. Der Gesamtzustand steht hier; was in einer
> einzelnen Session passiert ist, steht unter `docs/sessions/`; die Aufgabenliste mit Checkboxen in
> `ROADMAP.md`. Eine neue Session muss allein mit dieser Datei + `ROADMAP.md` weiterarbeiten können.

## Aktueller Meilenstein
**M0 „Ein Brett“** – M0.1 Bootstrap ✓, M0.2 Weltausschnitt ✓, M0.3 Spieler am Boden ✓ (Session 1,
2026-08-17), M0.4 Podest + Leiter + Umhängen ✓ (Session 1, 2026-08-17), **M0.5 Erste Übungen auf
Schienen ✓** (Session 2, 2026-08-20). Nächster Schritt: **M0.6 Flying Fox**.

## Letzter funktionierender Commit
Noch nicht committet: der M0.5-Stand liegt im Arbeitsverzeichnis (Geometrie + Reinlogik kamen
versehentlich schon mit `15596ce docs(handover): record M0.4 commit hash` mit, die Verdrahtung ist
uncommitted). Davor: `f667efa feat(park): first platform, block ladder and belay ritual`.

Geprüft (2026-08-20, headless Chromium/SwiftShader, 1024×576, Seed 1): Seite lädt über `serve.py`,
**0 Konsolenfehler, 0 Warnungen, 0 externe Requests**; kompletter Ablauf F → F → E → gehen → Sturz →
Leertaste → weiter durchgespielt, alle drei Übungen überquert; 607 Bäume, **252–285 Draw-Calls**
(192 ohne Kurs im Bild), 1,70–1,81 M Dreiecke, 60 Collider (61 während eines Sturzes),
**2,7–4,4 ms/Frame**, Physik 0,1–0,3 ms. `node tools/check-all.mjs` 75/75, `npm test` **51/51**.
Screenshots: `docs/screenshots/m0-5-{burma,planks,net,fall,recover}.png`.

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
- **Übungen (M0.5):** `elements/element.js` (gemeinsames Interface: Rail-Spline `pointAt/tangentAt`,
  Feder-Dämpfer-Wackelmodell, 12-mm-Sicherungsseil 2,05 m über der Trittlinie, `getDifficultyMetrics`),
  `elements/element-parts.js` (Seile mit Durchhang, gepresste Klemmhülsen, Schäkel, geschlagene Seile
  mit sichtbarem Schlag, Netzknoten), `elements/element-deform.js` (CPU-Deformer: der Timber-Builder
  verschweißt alles zu einem Mesh pro Material, der Deformer bewegt es wieder – ein Vertex-Klassifikat
  pro Bauteil, `offsets` pro Gruppe). Drei Übungen: `burma-bridge.js` (Trittseil + zwei Halteseile
  1,32 m, Hanfsteigbügel, 2 % Durchhang, 0,60 m/s), `hanging-planks.js` (6–12 Bretter 60 × 22 × 5 cm
  an Seilpaaren, **ein W-Druck = eine Planke**, 0,35 s Ausschwingpause, jede Planke ein eigenes
  Pendel), `net-bridge.js` (Netz 1,2 m breit, 15 cm Masche, Delle folgt dem Kletterer, 0,50 m/s).
- **Ressourcen (M0.5):** `player/balance.js` (instabiles inverses Pendel – aufrecht ist ein
  Gleichgewicht, von dem man wegfällt; eine Hand am Seil macht es stabil und kostet Kraft),
  `player/stamina.js`, `player/nerves.js` (Höhe logarithmisch, Exposition, Wackeln, Böen, Runterschauen,
  Zeit; Erleichterung auf Podest / beim Atmen / bei Handkontakt; > 0,88 Einfrieren bis drei Atemzüge;
  Vertrauen dämpft jeden künftigen Anstieg), `player/vitals.js` (besitzt die drei Instanzen, HUD,
  Kamera-Atmen, Herzschlag- und Atem-Sounds, F1-Zeilen).
- **Auf der Übung / Sturz (M0.5):** `player/on-element.js` (Zustand `element`, `ownsMovement`; W/S
  fahren, A/D **lehnen**, Q / rechte Maustaste = Hände), `player/fall.js` (Zustand `fall`: dynamischer
  Rapier-Ball 70 kg an einem Seil-Joint zu einem kinematischen Karabiner auf dem Sicherungsseil,
  sichtbares Bandfalldämpfer-Band, Kamerasacken + Shake, `sfxHarnessCatch`; Hochziehen mit Leertaste,
  Hangeln mit W/S, Retter mit E).
- **Tests:** `node tools/check-all.mjs` (75 Dateien), `npm test` (**51 Tests**: RNG, Lighting, Belay,
  Balance, Stamina, Nerves, check-all).
- **Dev-Seiten:** `tools/dev/{forest,terrain,sky,player}.html` – je Modul isoliert testbar
  (`?seed=`, Views, Bot); Screenshots `docs/screenshots/dev-*.png`.

## Was halb fertig ist
- Hero-Bäume: `main.js#pickHeroTrees` legt eine Kette aus 4 Parcours-Kiefern + 4 Deko-Stämmen an
  (Provisorium bis der Layout-Generator M1.1 die Parcours-Bäume liefert).
- HUD: Karabiner-Widget, Kraft-Ring und Herzschlag-Punkt stehen (`ui/hud.js`); Routen-Header,
  Flow-Anzeige und Course-Map sind weiterhin nur CSS-Gerüst.
- i18n: `assets/strings/en.json|de.json` existieren noch nicht (`core/i18n.js` fehlt); UI-Texte stehen
  in `player/interaction.js#PROMPTS`.

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
**M0.6 Flying Fox** (`ROADMAP.md`): `zipline/{physics,brakes}.js`, `elements/zipline.js`, Ego-Kamera
mit weiterem Sichtfeld, Trolley-Sirren, Netzbremse mit „Beine hoch“, physische Ankunft. Das
Element-Interface aus M0.5 trägt bereits: `registerElementKind("zipline", …)` und
`createElementBase(spec, ctx, impl)` mit eigenem `impl.update` – Podeste, Anker und das
Umhäng-Ritual funktionieren dann automatisch.

## Nächste fünf Aufgaben
1. M0.6 Flying Fox: `zipline/{physics,brakes}.js`, `elements/zipline.js`, Ego-Kamera, Netzbremse.
2. M0.7 HUD 1:1 (`ui/hud.js` erweitern, `core/i18n.js`, `assets/strings/en.json|de.json`), Start-Banner +
   Countdown, Sicherheits-Tooltip, `?autoplay=1`-Bot, Screenshots, Smoke-Checkliste, Tag `m0`.
3. Politur M0.5: Hände/Füße per IK auf Halteseil und Planke (die Posen treffen die Seile noch nicht),
   Tuning-Pass mit echten Testern (Balance-Fenster, Kraftkosten, Nervenanstieg), Wind-Böen hörbar.
4. Performance-Pass: Terrain-Dreiecke (~1,3 M) auf Chunks/LOD reduzieren; Laubstreu-Textur kleiner
   kacheln (Blätter wirken ~40 cm groß); Kronen-Ausdünnung um die Kamera prüfen.
5. Politur M0.4: eigener Kamerawinkel auf der Leiter, Hände/Füße auf `ladder.steps` (IK),
   Bodendetail-Ausschluss unter Deck und Podest.

## Offen / Provisorisch
- **M0.5:** `main.js#pickHeroTrees` legt jetzt bewusst eine **Kette** aus 4 Kiefern à 8,6 m an
  (`COURSE`-Konstante) plus 4 Deko-Stämme, die 15 m Abstand zur Kette halten – sonst findet die
  Greedy-Suche in `first-course.js` den falschen Baum. Ersetzt M1.1 durch den Layout-Generator.
- **M0.5:** Die Posen treffen die Seile nicht: beim Greifen stehen die Arme seitlich ab statt auf dem
  Halteseil zu liegen, auf den Planken fassen die Hände die Aufhängeseile nicht an. Braucht IK
  (M0.7-Politur). Auf dem Netz fehlt die Vierfüßler-Hocke – es wird die normale Balance-Pose benutzt.
- **M0.5:** Die Übungen haben **keine Collider** (`impl.createPhysics` ist nirgends implementiert) –
  man kann nicht auf ein Seil fallen, nur an ihm entlanglaufen. Für M0 in Ordnung, weil der Zustand
  `element` die Figur ohnehin kinematisch führt.
- **M0.5:** Kraftkosten sind an einem Autopiloten gemessen, nicht an Menschen: Burma mit beiden Händen
  kostet ~2/3 der Kraft, das Netz leert sie fast ganz. Beim ersten echten Testlauf nachziehen
  (`player/tuning.js`: `BALANCE.topple/damping`, `STAMINA.gripDrain`, `NERVES.*Gain`).
- **M0.5:** `nerves.frozen` friert die Bewegung ein, die Kamera zeigt es aber nur über das Zittern;
  ein sichtbares Einfrieren (Vignette, Atem-Overlay) kommt mit dem HUD in M0.7.
- **M0.4:** Der Kurs steht auf der Hero-Ketten-Kiefer – der Layout-Generator (M1.1) ersetzt
  `first-course.js`. Keine Kapazitätsprüfung (RULES.maxPerPlatform ist gesetzt, aber ungenutzt).
- **M0.4:** Karabiner sind weiterhin Zustand, keine Physik – `belay.isSafe() === false` (classic) wird
  nur mitgeschrieben; im Sturz hängt die Figur immer am Sicherungsseil der Übung, egal was eingehängt ist.
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
**E klettern / auf die Übung steigen**, T Kamera, F1 Debug, F2 Physik-Wireframe, Esc Pause.
**Auf einer Übung:** W/S vor und zurück (auf den Planken **ein Druck = eine Planke**), A/D lehnen,
**Q** linke Hand, **rechte Maustaste** rechte Hand, **R** atmen (nur im Stehen).
**Im Gurt:** Leertaste hochziehen, W/S am Seil zum Podest hangeln, E Retter rufen.
Der erste Kurs steht auf der Hero-Kiefer-Kette am Spawn – hinlaufen oder
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
wind, player, course, belay, hud, interaction, **vitals, debug**}.
Skripten/Testen: `WIPFEL.player.teleport(x, y, z)`, `WIPFEL.player.setState("ground")`,
`WIPFEL.course.{anchors, elements, platforms, graph}`, `WIPFEL.course.elements[i].getEntryAnchor().stand`,
`WIPFEL.belay.state()`, `WIPFEL.vitals.{balance,stamina,nerves}` + `WIPFEL.vitals.probe()`,
**`WIPFEL.debug.forceSlip(±1)`** (erzwingt einen Sturz auf der aktuellen Übung).
F1-Zeilen seit M0.5: `element` (id + t), `balance`, `stamina`, `nerves` (Wert + Stufe),
`heart bpm`, `trust`, `air below`.
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
