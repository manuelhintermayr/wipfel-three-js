# HANDOVER – Wipfel

> Lebendes Dokument. Nach **jedem Commit** aktualisieren. Der Gesamtzustand steht hier; was in einer
> einzelnen Session passiert ist, steht unter `docs/sessions/`; die Aufgabenliste mit Checkboxen in
> `ROADMAP.md`. Eine neue Session muss allein mit dieser Datei + `ROADMAP.md` weiterarbeiten können.

## Aktueller Meilenstein
**M1.7 Save + Optionen ABGESCHLOSSEN – damit ist M1 „Ein Ticket" komplett** (uncommitted, Session 7,
2026-08-26, oben auf dem ebenfalls noch uncommitteten M1.1–M1.6): Pause-/Optionen-Bildschirm
(`js/ui/options.js` + `js/ui/options-controls.js`, neu) – **Esc** öffnet ihn jetzt statt des früheren
blanken `loop.paused`-Umschaltens (der Screen selbst setzt `loop.paused` beim Öffnen/Schließen, der Rest
der Loop-Verdrahtung bleibt unverändert: Physik/Gameplay laufen bei Pause weiter mit `dt = 0`, wie schon
vor M1.7), Esc/„Resume" schließt ihn wieder. Ein Panel, keine Unter-Navigation: oben Resume/Course-Map-
Shortcut/„End day" (teilt sich die Logik mit `WIPFEL.debug.endTicket()` über eine gemeinsame
`endTicketNow()` in `main.js` – der Debug-Pfad wurde damit zum offiziellen Feature, ausgegraut ohne
laufendes Ticket), unten die `GAME.version`-Zeile, dazwischen vier scrollbare Abschnitte: **Audio**
(vier Regler Master/Effekte/Umgebung/Oberfläche 0–100 %, `js/audio/synth.js` bekam dafür drei
Kategorie-Gain-Knoten neben `master` – `noiseBurst`/`ping`/`voice` nehmen jetzt ein optionales
`category`, Default `"sfx"`, sodass jeder bestehende Aufruf in `js/audio/sfx.js` ohne Änderung dort
bereits über den `sfx`-Bus läuft; `ambience`/`ui` haben noch keine Klänge – GDD-Ambiente/Interface-Sounds
sind M2 –, die Regler sind verdrahtet und bereit, wirken aber hörbar noch auf nichts, ehrlich als „Offen"
vermerkt), **Kamera & Bewegung** (Blickempfindlichkeit → `input.bindings.lookSensitivity`, Invertieren
→ neues `core/input.js#Input.invertY`, „reduziertes Kamerawackeln/Atmen" → `player.camera.
setReducedMotion()` – existierte bereits seit M0.7 extra für diesen Schalter, nullt Sturz-Shake **und**
nervenbedingtes Schwanken in einem Aufruf –, „reduzierte Bewegung (HUD)" → neue `body.reduced-motion`-
CSS-Klasse in `css/base.css`, spiegelt die vorhandene `prefers-reduced-motion`-Regel), **Gameplay &
Barrierefreiheit** (Assist-Modus, neues `js/player/assist.js` – Balance-Störung ×0,6, Sturzfenster ×1,35,
angewendet an den Aufrufstellen in `js/player/on-element.js`/`fall.js`, `BALANCE.topple`/`slipAngle`
selbst bleiben unangetastet; Sprachumschalter EN/DE → `initI18n`+`save.setLocale`, Panel rendert sich
selbst neu, HUD-Prompts/Banner lösen ohnehin bei jedem Aufruf frisch auf; ein Hinweistext bestätigt
Farbe+Form) und **Steuerung** (`js/ui/options-controls.js#renderControlsList`, nur lesbar aus
`input.bindings`, ohne Debug-Aktionen, „Neubelegung folgt später"). Farbe+Form-Lücken geschlossen:
Start-Banner (`hud-route.js#showBanner`) und Stempelkarte (`stamp-card.js`) zeigten das Kategorie-Symbol
bisher nicht, jetzt beide. **Save (`js/core/save.js`):** additiv `data.settings` (Audio, Blick-
empfindlichkeit `null`=Engine-Default, vier Booleans), `updateSettings(patch)`, `export()`/`import(json)`
(gleiche Validierung wie `load()`, dafür in eine gemeinsame reine `normalize(parsed)` extrahiert). `?options=1`
öffnet den Screen beim Boot (Screenshots, blendet dafür eine sonst gleichzeitig sichtbare Kassa aus);
`?autoplay=1` erreicht die `pause`-Aktion nie, zusätzlich in der Input-Phase defensiv abgesichert.
Geprüft (echter Chromium via Playwright MCP, `localStorage.clear()` + Reload für Frischstart):
`?options=1` öffnet **`options.visible === true`, `loop.paused === true`**, Kassa dabei ausgeblendet,
0 Konsolenfehler/-warnungen, 0 externe Requests; echte Klicks auf „Assist mode" und „Reduced camera shake
& breathing" setzen **`save.data.settings.assist/reducedCameraMotion === true`**, nach echtem Reload
weiterhin in `localStorage['wipfel-save-v1']` UND im frisch geladenen `save.data.settings` vorhanden;
Esc öffnet/schließt mit `loop.paused` synchron kippend (echter `KeyDown Escape`); Klick auf „Deutsch"
übersetzt Titel/Buttons/Sektionsüberschriften/Toggle-Labels sofort (`"Paused"→"Pause"`,
`"Resume"→"Fortsetzen"` etc.), `save.data.locale === "de"` persistiert. Voller `?autoplay=1&fast=1`-Lauf
danach (Assist/Sprache zurückgesetzt via frischem `localStorage`): **„blue-1 · 353.47 s · falls 0 ·
progress 5/5 · isBest true"**, **`save.data.unlocks.red === true`**, **0 Konsolenfehler/-warnungen, 0
externe Requests** (117 Ressourcen, alle `127.0.0.1:8200`), 404 Draw-Calls/0,83 M Dreiecke am Ende,
`options.visible === false`/`loop.paused === false` nach Lauf-Ende (Autoplay hat den Pause-Screen nie
geöffnet). `check-all` **131/131**, `node --test` **140/140** (134 + 6 neue Save-Settings/Export-Import-
Tests). Screenshot `docs/screenshots/m1-options.png` (Pause-Panel, Audio/Kamera/Gameplay-Sektionen
sichtbar, END DAY ausgegraut ohne Ticket, 170 KB).

**M1.4 Course Map + Parkplan UND M1.6 NPC-Gäste** (weiterhin uncommitted, Session 6, 2026-08-26):
Course-Map-Overlay (`js/ui/course-map.js`,
Tab öffnet/schließt, auch Esc/EXIT) 1:1 nach Mockup – dunkles Relief-Untergrundbild (einmal pro Park
gebacken, `js/ui/map-render.js#paintBackground`, Hangschattierung aus `terrain.normalAt` + Höhe→Grün-
Dunkel-Gradient, helle Wege), farbige Routenlinien mit weißen Podest-Punkten, gestrichelter Zip-Linie
zur Landung und Einstiegsring (jeden Frame neu gezeichnet, billig, `paintRoutes`), Live-Spielerpfeil
(Chevron mit Blickrichtung) und NPC-Punkte, Legende + FILTER (Alle→Blau→Rot→Schwarz)/PLAYER (zentriert)/
ZOOM (1×/2× um die aktuelle Bildmitte)/EXIT, Ziehen zum Verschieben nur bei Zoom, Hover/Klick zeigt Name/
Ziffer/Übungen/Höhe/Länge/Bestzeit/Sperrstatus. Öffnen pausiert die Welt NICHT (Loop läuft weiter hinter
dem dunklen Overlay), sperrt aber die Spielerbewegung (`input.move` wird in der Input-Phase auf 0
gesetzt, solange `courseMap.visible`) und hebt die Zeigersperre auf; ein `course-map-open`-Body-Klasse
blendet die durchscheinenden `#hud`-Texte (Routen-Header, Ticket-Box) aus, die sonst dieselbe Ecke wie
Titel/Filter-Chip belegten. `?map=1` öffnet sie beim Boot (Screenshots). Die diegetische Parkplan-Tafel
(`js/park/park-board.js`) steht neben dem Wegweiser-Cluster (`js/park/signs.js#averageBearing/
findNearPath` wiederverwendet): zwei Rundholzpfosten, Kopfbalken, eine gedruckte Karte (1024×768,
`map-render.js#paintStaticBoard`, „print"-Stil = helle Grünfläche + dunkelgrüne Waldflecken aus
seed-Rauschen statt echter Höhe, sechs Routen als farbige Linien mit römischen Ziffern in weißen
Kreisen, Titel „SONNWENDBERG ROPES PARK"/„WALDSEILPARK SONNWENDBERG", Legende) auf einer eigenen Fläche
vor einer Rückwand, dünner Kollider davor. **E** in 2 m öffnet die Course Map (eigene `.board-prompt`-
Zeile, kollidiert nicht mit `hud.setPrompt`).

NPC-Gäste (`js/npc/agents.js` + `js/npc/guest-rig.js`, 8–14 pro Seed, deterministisch aus `rng.fork`):
laufen vom Hub zum zugewiesenen Routen-Einstieg (Profil kids→blau/teens→rot/sporty→schwarz, ignoriert
Freigaben), Warteschlange + zwei-Klick-Pause vorm Einstieg, klettern die Leiter, queren jede Übung
entlang `element.rail` (kontinuierlich mit `element.walkSpeed`, getaktete Arten Schritt für Schritt über
`element.steps`/`.planks`), fahren den Flying Fox (leichte Wiederverwendung der echten Fahrt über
`element.setRider`/`trolleyAt`), pausieren auf Podesten, wandern zurück, wählen neu. Regeln geteilt mit
dem Spieler über `js/game/occupancy.js` (neu, rein): 1 pro Übung/Leiter (`RULES.maxPerElement`), Gäste
auf max. 2 pro Podest gedeckelt (`NPC.maxPerPlatformGuests`) – der Spieler zählt nie mit und wird nie
abgewiesen; bei Gleichstand gewinnt der Spieler (Schleifen-Reihenfolge in `main.js`: `interaction.
update()` vor `agents.update()`). `js/player/interaction.js` verweigert dem Spieler das Aufsteigen auf
eine von einem Gast belegte Übung mit „Wait for the climber ahead" / „Warte, bis vor dir frei ist"
(NICHT für die Leiter – bewusst außerhalb des Auftragsumfangs belassen, Gäste queuen dort nur
untereinander). Sichtbarkeit: `guest-rig.js` – zehn Körperteile (Torso/Kopf/Ober-/Unterarm links+rechts/
Ober-/Unterschenkel links+rechts), **je EIN** `THREE.InstancedMesh`, geteilt über alle Gäste (10 Draw-
Calls für die ganze Menge, Proportionen aus `player/rig-body.js#LAYOUT`), Torso-Farbe = Kategorie-Farbe
(Instanz-Farbe, keine Texturen), Entfernungsausblendung > 90 m überspringt nur die Pose-Berechnung
(Position bewegt sich weiter). Vertrauens-Haken (GDD „Zusehen gibt Vertrauen"): schließt ein Gast eine
Übung neben dem Podest ab, auf dem der Spieler steht, feuert `npc:watched-success` →
`vitals.nerves.watchSuccess()` (neue, kleine Methode, `NERVES.trustPerWatch`/`watchRelief`).
`?npc=0` deaktiviert Gäste komplett. Neue Tests `tests/unit/agents.test.mjs` (15, rein: Occupancy,
Warteschlange, Routen-Zuweisung determiniert). Screenshots `docs/screenshots/m1-coursemap.png`,
`m1-parkboard.png`. **Bekannte Einschränkung:** Tarzansprung/Skateboard haben keine eigene Gast-Animation
– Gäste queren sie wie eine normale kontinuierliche Übung (Fallback-Tempo), sehen also nicht wie ein
Sprung/Schub aus; die Routen auf der Tafel sind Linien/Ketten, keine geschlossenen Schleifen wie im
Vorbildfoto (unsere Routen sind Einbahn-Ketten zum Flying Fox, keine Rundwege).

M1.3/M1.5 (Vorsession, weiterhin gültig): Kassa-Bildschirm (`js/ui/kassa.js`, „ein
Blatt Papier" auf dem dunkel-transparenten App-Rahmen) mit Ticketart/Größenklasse/Sicherungsmodus als
anklickbare Kartenreihen; Confirm startet den Tag (`js/main.js#startDay`: `save.startTicket`,
`ticket.reset`, `sky.setTimeOfDay(9:00)`, `belay.setMode`, Größenklasse → `player.states.get("zipline")
.setRiderMass`, Notice „Ticket gültig bis …"). Einschulung (`js/game/briefing.js` +
`js/park/practice-stand.js`, neu): vier Trainer-Dialogzeilen (echter Inhalt aus RESEARCH-DATA §1 –
Gurt/ein Karabiner immer dran, eine Person pro Übung/drei pro Podest, Flying Fox nur bei freier
Landezone, Atmen bei Einfrieren), mit **E** vorgeblättert, dann ein echter Klick-Klick-Ritual-Test an
einem eigenen Übungsanker (`"practice-anchor"`, ein Pfosten + kurzes Seil auf 1 m nahe dem Spawn-Hub,
gegenüber der mittleren Peilung aller Routen-Einstiege) – erst danach akzeptiert **irgendeine**
Routen-Einstiegscable das Einhängen (`save.data.briefingDone`, geprüft in `player/interaction.js`, neue
Sperrzeile „Complete the briefing first" / „Zuerst die Einschulung abschließen"). Ticket-Uhr
(`js/game/ticket.js`, reine Logik, 11 Unit-Tests): 1 Spielstunde = `TIME.gameHourMinutes` reale Minuten,
Restzeit als `.hud-ticket`-Box oben rechts (`ui/hud-route.js#setTicket`); bei 30 Spielminuten ein Toast,
bei 0 ein Erweiterungsfenster (`[E]` = +30 min, max. 2×, `TICKET.extendPromptSeconds` = 8 s Gnadenfrist),
danach die Stempelkarte (`js/ui/stamp-card.js`, neu: Stempel je geschaffter Route mit Kategoriefarbe/
Ziffer/Name/Zeit/Stürze, Übungen gesamt, Höchsttempo Flying Fox, Rettungen, Rot/Schwarz-Freigabestatus,
Buttons „Neuer Tag" → Kassa erneut / „Weiter im Park bleiben" → `ticket.end()`, danach verweigert
`player/interaction.js` jedes neue Einhängen mangels Ticket). `js/game/session.js` trägt jetzt die
Tages-Statistik (`day`) und die ganze Ticket-Ende-Sequenz; `js/player/belay.js` bekommt `setMode()`
(kassa-Wechsel wirkt sofort, `mode` ist jetzt ein live Getter statt eines statischen Feldes);
`js/game/autoplay.js` feuert einmalig `kassa.confirmDefaults()` + `briefing.completeForBot()` auf dem
allerersten `update()`, damit `?autoplay=1` weiter unbeaufsichtigt läuft. Neuer Debug-Hook
`WIPFEL.debug.endTicket()` für Screenshots/Smoke-Läufe (erschöpft die Restzeit und ruft
`session.forceDayEnd()` direkt auf – überspringt die 8-s-Erweiterungs-Gnadenfrist komplett, landet sofort
auf der Stempelkarte). Noch **kein Commit** – siehe „Dateien, an denen gerade gearbeitet wird" (M1.2 UND M1.3/M1.5
liegen beide uncommitted übereinander).

## Letzter funktionierender Commit
`43993bb` „feat(elements): twelve traversable kinds with catalogue, discrete-step generalisation and
dev showcase" (M1.8, HEAD; Tag `m0` = `d20789e`, zwei Commits zurück – siehe `git log --oneline -8`).
M1.1 (Generator + Loader) und M1.2 (Schilder + Freigaben, diese Session) liegen komplett
**uncommitted** obendrauf.
Geprüft (2026-08-25, echter Chromium via Playwright MCP, Seed 1, sechs Routen, `python serve.py`):
`?autoplay=1` spielt Blue I komplett durch – Einhängen (F,F), Blockleiter, Burma-Brücke, hängende
Planken, Netz, Flying Fox mit Netzbremse, Landung – **„route completed in 111.16 s · falls 0“**,
Bestzeit im Save, **`save.data.unlocks.red === true`** danach (per `localStorage` geprüft);
**0 Konsolenfehler, 0 externe Requests**; `WIPFEL.course.routes.length === 6`; **434 Draw-Calls**
(Ziel ≤ 440 inkl. Schilder – erreicht; ohne Schilder 428, s. „Offen") / ~0,93 M Dreiecke am Spawn.
`check-all` 115/115, `node --test` 108/108 (104 + 4 neue Save-Gating-Tests).
Screenshots `docs/screenshots/m1-signs.png` (Wegweiser-Cluster, alle drei Tafeln lesbar), `m1-locked.png`
(Start-Banner „RED ROUTE · RAVEN RUN · Complete a blue route first" an einer gesperrten Route).

M1.3/M1.5 (diese Session, 2026-08-26) geprüft, echter Chromium via Playwright MCP, `localStorage.clear()`
+ Reload für den Frischstart: Kassa erscheint beim Boot vor Pointer-Lock, echte Klicks auf Happy-Hour/
Größe M/Klassisch + Confirm setzen **`save.data.ticket`** korrekt (`type/sizeClassId/belayMode`),
`belay.mode → "classic"`, `ticket.totalGameMinutes === 120`, `sky.timeOfDay ≈ 9.0`; Einschulung startet
automatisch, vier `[E]`-Drücke bringen sie zur Übungsanker-Phase, Teleport auf die aus `parkDef`/
`terrain.hubs[0]` berechnete Standposition + echtes **F, X** (klassischer Modus, zwei Karabiner einzeln)
schließt sie ab – **`briefing.phase === "done"`, `save.data.briefingDone === true`**, Belay danach wieder
offen. `WIPFEL.debug.endTicket()` erschöpft die Restzeit und ruft `session.forceDayEnd()` direkt auf –
die Stempelkarte öffnet sich ohne die 8-s-Erweiterungs-Gnadenfrist abzuwarten; „Neuer Tag" zeigt die
Kassa erneut, ein zweiter Confirm startet einen frischen
Tag; „Weiter im Park bleiben" setzt **`ticket.clippable === false`**, und am Einstiegsdeck-Anker liest
`interaction.prompt` daraufhin korrekt **„No active ticket – visit the kassa"**. Deutsches Locale
(`?locale=de`) spotgeprüft: Kassa-Titel „Kassa", Confirm „Tag starten", erster Trainer-Satz „Gurt an.
Immer mindestens einen Karabiner eingehängt lassen." – alle 114 Keys in `en.json`/`de.json` deckungsgleich
(automatisiert geprüft, keine fehlenden Keys in beide Richtungen). Vollständiger `?autoplay=1&fast=1`-Lauf
ab frischem `localStorage`: Bot bootstrapped Kassa+Einschulung in Frame 1 (`kassa.confirmDefaults()` +
`briefing.completeForBot()`), spielt Blue I komplett durch – **„route completed in 372.14 s · falls 0 ·
best true"**, **`save.data.unlocks.red === true`** danach, **0 Konsolenfehler/-warnungen** (eigener
Konsolen-Hook über den gesamten Lauf), **0 externe Requests** (alle 327 Requests → `127.0.0.1:8200`),
Laufzeit real **~103 s** (≤ 6-min-Ziel). Draw-Calls am Spawn vor der Kassa-Bestätigung **419** (Übungsstand
existiert erst nach `briefing.start()` → lazy gebaut, danach **2 zusätzliche Meshes**, wie geplant);
Dreiecke ~0,88–0,92 M, kein Regressions-Sprung ggü. M1.2. `check-all` 121/121, `node --test`
**119/119** (108 + 11 neue Ticket-Uhr-Tests). Screenshots `docs/screenshots/m1-kassa.png` (Kassa-Bildschirm,
alle drei Gruppen + Auswahl sichtbar), `m1-briefing.png` (Trainer-Dialog + Ticket-Box oben rechts,
Übungsstand im Hintergrund), `m1-stampcard.png` (Stempelkarte, „No routes completed today" da in diesem
Testlauf keine Route beendet wurde, bevor die Uhr erzwungen abgelaufen ist) – alle < 300 KB (PIL:
720 px Kantenlänge, 96-Farben-Palette).

M1.4/M1.6 (diese Session, 2026-08-26) geprüft, echter Chromium via Playwright MCP, `?debug=1` frischer
Lauf: **0 Konsolenfehler/-warnungen, 0 externe Requests** (Kassa+Briefing per `confirmDefaults()`/
`completeForBot()` bootstrapped). Gäste: `agents.count` 9 (im 8–14-Fenster), zwei Positions-Snapshots
5 s auseinander unterscheiden sich bei allen neun (Bewegung bestätigt); über einen `?fast=1`-Lauf von
~65 s real (≈ 4× simuliert) durchliefen mehrere Gäste den **kompletten Zyklus**: `wander → toEntry →
queue → clipIn → onRail/ladder → dwell → onRail/element (mehrfach) → onRail/zip → return → wander →
toEntry` (neue Routenwahl) – **0 Fehler über die gesamte Beobachtung**, Warteschlangen-Konkurrenz um
dieselbe Leiter beobachtet (mehrere Gäste gleichzeitig in `queue`, während einer `onRail` war). Occupancy-
Gate isoliert verifiziert: `occupancy.claimElement('burma-1','guest-test')` lässt `interaction.prompt`
auf **„Wait for the climber ahead"** springen und ein echter `KeyE`-Tastendruck bleibt wirkungslos
(`player.mode` bleibt `"ground"`); `releaseElement` gibt sofort wieder **„Step onto the Burma bridge [E]"**
frei und derselbe `KeyE`-Druck schaltet dann korrekt auf `player.mode === "element"`. Draw-Calls am
Spawn **438–439** (Ziel ≤ 480 – erreicht; vorher 434 mit Schildern, +13 durch Parkplan-Tafel [3 Meshes]
und Gäste-Rig [10 InstancedMesh]), Dreiecke **~898 k** (Ziel ≤ 1,05 M – erreicht), **`npc ms` = 0,10 ms**
im F1-Panel (Ziel ≤ 1 ms – deutlich erreicht). `?autoplay=1&fast=1` mit aktiven Gästen: **„route
completed in 341.04 s · falls 0 · best true"**, 0 Konsolenfehler, 0 externe Requests, Bot toleriert die
vorhandenen „stuck"/„shortcut"-Selbsthilfen unverändert (kein neuer Deadlock durch Occupancy in diesem
Lauf beobachtet – die Wartezeile kann in einem gegebenen Lauf auch schlicht nie ausgelöst werden, s.
Auftragstext „mindestens null Mal"). `check-all` **128/128**, `node --test` **134/134** (119 + 15 neue
Gast-Tests). Screenshots `docs/screenshots/m1-coursemap.png` (dunkles Relief, farbige Routen, weiße
Podest-Punkte, gestrichelte Zip-Linien, Spieler-Chevron, Legende+Buttons), `m1-parkboard.png`
(Nahaufnahme der Tafel: Titel, grüner Druck mit Waldflecken, Routen mit Ziffernkreisen, Legende,
„Open the course map [E]"-Prompt, Wegweiser-Cluster im Hintergrund) – beide < 300 KB (97 KB / 223 KB,
PIL: 900 px Kantenlänge, 128–160-Farben-Palette).

## Was funktioniert
- **Kern:** `js/main.js` (Boot + Loop-Verdrahtung), `core/{loop,input,rng,params,errors,events,renderer,physics}.js`,
  `ui/debug.js` (F1 Panel; **F2 / `?physics=1`** = Rapier-Wireframe – getrennt, weil das Heightfield-
  Wireframe alles überdeckt), `js/config.js` (Kategorien Green/Blue/Red/Black/Legendary, Regeln,
  Größenklassen).
- **Welt:** `world/terrain.js` (+ `terrain/{heightfield,paths,material,chunks,chunk-index}.js`; Hang N→S,
  Wege, Hubs `spawn@(11,-163) r20`, `hut@(-115,33)`, `deck-east@(113,-33)`, `deck-top@(-16,147)`;
  Rapier-Heightfield, `heightAt/normalAt/slopeAt/isPath`; **6 × 6 Chunks à 80 m mit Index-LOD
  (2/4/8 m) und Skirts, `terrain.update(dt, focusPos)`**), `world/ground-detail.js` (+ `procgen/geometry/ground-props.js`,
  `procgen/textures/{ground,texture-utils}.js`: Laub, Steine, Wurzeln, Gras – instanziert, Wind,
  **Distanzausblendung 45–90 m je Familie über `update(dt, focusPos)`**),
  `world/forest.js` (+ `forest-placement.js`, `procgen/geometry/tree*.js`, `procgen/textures/{bark,foliage,tree-texture-utils}.js`:
  Kiefer/Eiche/Buche/Ahorn/Hasel, 3 LODs, Instancing, Hero-Bäume mit Collidern, Wind-Shader),
  `world/wind.js`, `world/sky.js` (Dome, Sonne, Hemi, Nebel, Exposure, Tag/Nacht, `setTimeOfDay`),
  `world/lighting.js` (Sonnenbahn/Farben, unit-getestet), `world/skyline.js` (Hügelringe + Stadt-Silhouette).
- **Spieler:** `player/controller.js` (Rapier-KCC, Kapsel, Gehen/Sprint/Springen/Hänge, Zustandsautomat
  `states.js`, Tuning `tuning.js`), `player/camera.js` (Schulterkamera mit Kollision, Ego-Umschaltung T),
  `player/rig*.js` (prozedurale Kletterin: Tanktop, Capri, Komplettgurt orange, Handschuhe, Haarknoten;
  Posen idle/walk/run/jump/land/ladder; Attach-Punkte).
- **Park (M0.4):** `procgen/textures/wood.js` (Planke/Rundholz/verwittert, je Albedo+Normal+Rauheit,
  gecacht), `park/timber.js` (Bauteil-Kit; alles wird pro Material zu **einem** Mesh verschmolzen;
  `mergeParts` seit M1.1 exportiert, s. u.), `park/platform.js` (Rundholz-Rahmen, Planken mit Fugen und
  Stamm-Ausschnitt, Gummimanschette, 8 Klemmklötze mit Stahlbändern, Schrägstützen, 12-mm-Sicherungs-
  seilring 1,9 m über dem Podest), `park/entry-deck.js` (40 cm, Bank, Einhängeseil, Piktogramm-Schild),
  `elements/ladder.js` (dunkler Rücken, versetzte Klötze alle 28 cm, Stahlseil, blaues Hilfsseil).
  `procgen/geometry/tree-species.js#trunkRadiusAt` liefert den echten Stammradius (Verjüngung +
  Wurzelanlauf) – ohne das schwebt alles oben und steckt unten im Stamm.
- **Park-Layout-Generator + Loader (M1.1):** `park/layout.js` (`generateParkLayout({seed,terrain})`,
  `PARK_CONFIG` 2 blau/2 rot/2 schwarz, fächert Routen vom Spawn-Hub auf, "relax tree-angle first" bei
  Kollision) + `layout-route.js` (eine Routen-Kandidatin: Baumkette, Deckhöhen, Übungsart je Kante,
  Flying Fox über `zip-plan.js`; `LEGACY_BLUE_1` hält Blue-I's M0-Kanten-Kinds) + `layout-validate.js`
  (alle Prädikate: Spannweite 6–13,5 m, Kategorie-Deckfenster + Steigungslimit, Hub-/Weg-/Routen-
  abstand, Zip-Gefälle/Landezone – wiederverwendet von `tests/unit/layout.test.mjs` und
  `tools/bake-park.mjs`/`tools/dev/smoke-layout.mjs` über `tools/headless-terrain.mjs`, node-fähig, kein
  THREE). `park/loader.js` (`loadPark(parkDef,{...}) → course`) baut alle sechs Routen (Podeste,
  Einstiegsdeck, Leiter, Übungen über `elements/catalogue.js`, Flying Fox + Landepodest), ein
  gemeinsames Anker-/Graph-/Update-/Dispose-Interface über alle Routen, Route "blue-1" zusätzlich am
  Objekt-Wurzelniveau gespiegelt (M0-Konsumenten `interaction.js`/`autoplay.js` unverändert lauffähig).
  Anker-IDs routen-skopiert: `${routeId}-deck`, `${platform.id}-ring`, `elem-${edge.id}`,
  `${routeId}-zip`, `${routeId}-zip-out`. **Draw-Call-Optimierung:** Podeste/Deck/Leiter/Landepodest
  (+ die statische Flying-Fox-Hardware Gate/Klemmen/Markierhülse) werden pro Route ein zweites Mal zu
  einem Mesh pro Material verschmolzen (`loader.js#mergeRouteStatics`, nutzt `timber.js#mergeParts`) –
  senkt den Sechs-Routen-Park von ~590 auf ~428 Draw-Calls am Spawn (Ziel ≤ 420, s. „Offen").
  `tools/bake-park.mjs` schreibt `assets/parks/sonnwendberg.json` (Seed 1, node-only, vom Spiel nicht
  gelesen – Reproduzierbarkeits-Beleg). Ersetzt `park/first-course.js` (gelöscht).
- **Umhängen (M0.4):** `player/belay.js` (reine Logik, 11 Unit-Tests; smart = Zwei-Klick-Ritual,
  beide Karabiner können nie offen sein; continuous = ein Druck; classic = Fehler möglich),
  `player/interaction.js` (Anker in 1,6 m → F, Leiter in 1,5 m → E, Kontext-Prompt),
  `player/climb-ladder.js` (Schienen-Fortbewegung, KCC aus, 0,9 m/s, Leiter-Pose), `ui/hud.js`
  (Karabiner-Widget + Prompt mit `<kbd>`), `audio/synth.js` + `audio/sfx.js` (WebAudio-Klicks,
  erst nach echter Nutzergeste). Ablauf: F → F (einhängen) → E (klettern) → oben F → F (Podestring).
- **Übungen (M0.5 + M1.8 – 12 Übungsarten):** `elements/element.js` (gemeinsames Interface: Rail-Spline
  `pointAt/tangentAt`, Feder-Dämpfer-Wackelmodell, 12-mm-Sicherungsseil 2,05 m über der Trittlinie,
  `getDifficultyMetrics`), `elements/element-parts.js` (Seile mit Durchhang, gepresste Klemmhülsen,
  Schäkel, geschlagene Seile mit sichtbarem Schlag, Netzknoten), `elements/element-deform.js`
  (CPU-Deformer: der Timber-Builder verschweißt alles zu einem Mesh pro Material, der Deformer bewegt
  es wieder – ein Vertex-Klassifikat pro Bauteil, `offsets` pro Gruppe), `elements/hanging-steps.js`
  (geteiltes Pendel-Modell für Steigbügel/Seilschlaufen/Ringe: ein Schritt je Element, Nachbar-Kopplung
  über das Trägerseil), `elements/catalogue.js` + `catalogue-data.js` (alle 12 Arten registriert +
  Metadaten für den künftigen Generator; `catalogue-data.js` ist THREE-frei, damit sie in
  `tests/unit/catalogue.test.mjs` unter reinem Node prüfbar bleibt). `element.discrete === true`
  ersetzt seit M1.8 den harten `kind === "hanging-planks"`-Vergleich (`on-element.js`, `autoplay.js`).
  Zwölf Übungen: `burma-bridge.js` (Trittseil + zwei Halteseile 1,32 m, Hanfsteigbügel, 2 % Durchhang,
  0,60 m/s), `hanging-planks.js` (6–12 Bretter, **ein W-Druck = eine Planke**, eigenes Pendel je
  Planke), `net-bridge.js` (Netz 1,2 m breit, 15 cm Masche, Delle folgt dem Kletterer, 0,50 m/s),
  `beam-fixed.js` (starrer Ø-20-cm-Balken, keine Haltemöglichkeit), `beam-swing.js` (3–4 hängende
  Balkensegmente, durchgehend begangen, jedes schwingt für sich), `stirrups.js` (Steigbügel alle
  45 cm), `wire-loops.js` (dünne Variante: reine Seilschlaufe statt starrem Tritt), `barrels.js`
  (4–6 Fässer auf Achsseil, rollen unterm Fuß – eigenes rotierbares Mesh, der Deformer kann nicht
  drehen), `rings.js` (Ringe alle 50 cm, hängend, Füße frei, hohe Kraftkosten), `tarzan.js` +
  `player/on-tarzan.js` (eigener Zustand `"tarzan"`: Sprung [Space] in ein ±0,25-s-Fangfenster, sonst
  `fall` am Sicherungsseil; deterministisches Sinus-Pendel treibt Geometrie und Zustand aus derselben
  `elapsed`-Uhr), `skate.js` (Board an zwei Hängern auf zwei Seilen, Stoß + Trägheit über
  `element.railAccel`).
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
- **Flying Fox (M0.6):** `zipline/physics.js` (Parabel-Durchhang statt echter Kettenlinie – bei 2 %
  unter 1 cm Unterschied auf 50 m und geschlossene Ableitungen; `dv/dt = g·slope − drag/m·|v−wind|·
  (v−wind) − rollResist·g`; Masse → Durchhang → steilere erste Hälfte **und** mehr Schwung pro
  Stirnfläche, deshalb ist schwerer schneller), `zipline/brakes.js` (Netzbremse, Entscheidung wird
  **an der Markierhülse eingerastet**), `park/zip-plan.js` (Trassensuche: Gefälle, Lichtraum,
  Baumfreiheit, Landezone, Weg zurück – seit M1.1 der produktive Aufrufer ist `layout-route.js`,
  einmal je Route zur Generierzeit; der Loader sucht nie neu), `elements/zipline.js`
  (Seil + Startgatter mit Piktogramm + Markierhülse + Netz + Trolley; das Zip-Seil **ist** das
  Sicherungsseil, deshalb funktionieren Anker und Ritual unverändert), `park/zip-landing.js`
  (Ankunftspodest, Rampe, Hackschnitzelbett, Erdanker), `player/on-zipline.js` (Zustand `zipline`,
  Ego-Kamera automatisch, Körper bleibt sichtbar, Kopf ausgeblendet), `ui/hud.js#setSpeed/setNotice`,
  `audio/sfx.js#sfxTrolley/sfxWindRush/sfxZipArrive` über `synth.voice()` (Dauerton mit Live-Handle).
- **Tests:** `node tools/check-all.mjs` (**121 Dateien**), `node --test` (**119 Tests**: RNG, Lighting,
  Belay, Balance, Stamina, Nerves, Chunk-Index, Zipline, Route, Catalogue, i18n, Save (**+4 M1.2:
  Freigabe-Fortschritt, Migration**), Layout (M1.1, 11 Tests), Ticket (**+11 M1.3/M1.5**: game-time
  mapping, Restzeit, Warnschwelle, Ablauf, Verlängerungsdeckel), check-all).
- **Dev-Seiten:** `tools/dev/{forest,terrain,sky,player}.html` – je Modul isoliert testbar
  (`?seed=`, Views, Bot); Screenshots `docs/screenshots/dev-*.png`.

- **Route/HUD (M0.7, generalisiert M1.1):** `core/i18n.js` + `assets/strings/en.json|de.json` (EN
  Standard, DE komplett; Prompts, HUD, alle sechs Routennamen), `core/save.js` (Schema v1, Bestzeiten
  je Routen-ID, validiert), `game/route.js` (`createRouteRun(def)`: idle→armed→countdown→running→done,
  unit-getestet; `BLUE_I` bleibt als Fixture; **`routesFromPark(parkDef)`** – neu M1.1, rein, ein
  Run-Def je generierter Route; `heightM`/`lengthM` echte Zahlen aus `parkDef`, `lengthM` seit M1.2
  abzüglich der beiden `EDGE_OFFSET`-Vorläufe je Kante statt Baum-zu-Baum-Luftlinie), `game/session.js`
  (seit M1.1 **ein Run pro Route**, alle laufen mit; Events werden an alle gebroadcastet – jeder Run
  ignoriert Ids/Zustände, die ihm nicht gehören, also kommt höchstens einer voran; HUD folgt dem Run,
  der zählt/fährt, sonst dem nächsten Einstiegsdeck **in 6 m**), `ui/hud-route.js` (Routen-Header mit
  Farbbalken 1:1 nach Mockup, FLOW-Platzhalter, Banner mit Kennzahlen, Countdown-Scheiben),
  `game/autoplay.js` (?autoplay=1: prompt-getriebener Bot, spielt Blue I komplett durch; Podest-Hops
  als dokumentierte Selbsthilfe; liest `course.ladderAnchorId`/`course.entryDeck` – beides zeigt dank
  Loader weiterhin auf Blue I).
- **Schilder + Kategorie-Freigaben (M1.2):** `park/signs.js` (`createSigns({parkDef,scene,terrain,
  textures,rng}) → {group,dispose}` – liest `parkDef` + Terrain-Sampler direkt, nie den gebauten
  `course`, läuft also unabhängig von `loadPark`): Wegweiser-Cluster am Hub-Rand (ein Pfosten + eine
  pfeilförmige Tafel je Kategorie in diesem Park, Pfeil auf die Kreismittel-Peilung der eigenen Routen
  gedreht – wie ein echter Wegweiser, jede Zunge zeigt für sich) und ein Namensschild je Route am
  Einstiegsdeck (Ziffer + lokalisierter Name). Jede Tafel: zwei flache Pfeilsilhouetten
  (`arrowGeometry`, `THREE.Shape` mit von Hand neu gesetzten UVs) – eine weiße mit gebackener
  Canvas-Textur (erste echte `ctx.fillText`-Nutzung im Projekt; Wort schrumpft bis es vor die
  Ziffernkreise passt, `fitText`, Deutsch läuft länger als Englisch) und ein etwas größerer
  Kategorie-Farb-Unterleger dahinter. Tafel sitzt um die halbe Eigenlänge vor ihrem Pfosten versetzt
  (der Pfosten steht am Pfeil-*Ende*, nicht in der Mitte – mittig gebaut, stand der Pfosten mitten durch
  die Schrift und schluckte immer denselben Textabschnitt, unabhängig vom Wortlaut). Draw-Calls: ein
  Mesh für alle Pfosten (`timber.js`-Builder, „log"), ein Mesh **je Kategorie-Farbe** für alle
  Unterleger zusammen (`timber.js#mergeParts`), nur die weiße Schriftfläche bleibt je Tafel eigen (fürs
  ganze Modul ≤ 9 Meshes); nichts wirft Schatten (dünne Tafel, Schatten-Pass würde die Draw-Calls
  verdoppeln). `core/save.js#unlocks` (additiv, Blau immer `true`, Rot/Schwarz `false`; `isUnlocked`,
  `unlockCategory`, `nextGateCategory` – Blau→Rot→Schwarz→`null`), `player/interaction.js` (optionales
  `save`: Einhängen an der Einstiegs-Cable eines gesperrten Anchors wird verweigert, Prompt zeigt
  `notice.lockedRed`/`lockedBlack` statt des Einhäng-Textes – der Anchor bleibt „erreichbar" fürs
  Prompt, nur das Einhängen selbst nicht), `game/session.js` (schaltet bei `zip:finished` die nächste
  Farbe frei, eine gemeinsame Notice statt zwei konkurrierender, `showBanner(def,best,locked)` bei
  gesperrter Route ohne `arm()`), `ui/hud-route.js` (`showBanner`s dritter Parameter tauscht
  Kennzahlen/Bestzeit/START gegen die Sperrzeile), `css/screens.css#.start-banner .locked`.
- **Kassa + Einschulung + Ticket-Uhr + Stempelkarte (M1.3/M1.5):** `js/game/ticket.js` (reine Uhr:
  `gameHoursElapsed`/`timeOfDayFor` + `createTicketClock` – `started/expired/clippable/extensionsLeft`,
  `update/extend/reset/end`, keine Callbacks, 11 Unit-Tests), `js/ui/kassa.js` (Ticketart/Größenklasse/
  Sicherungsmodus als Kartenreihen, `confirmDefaults()` für `?autoplay=1`), `js/game/briefing.js` +
  `js/park/practice-stand.js` (vier Trainer-Dialogzeilen + echter Klick-Klick-Test am eigenen
  Übungsanker, `save.completeBriefing()`, `completeForBot()`), `js/ui/stamp-card.js` (Tagesabschluss:
  Stempel je Route, Kennzahlen, Freigabestatus, „Neuer Tag"/„Weiter im Park bleiben"). `core/save.js`
  führt `briefingDone` und `ticket` (additiv, `null` = kein Tag aktiv); `player/belay.js#setMode` (live
  `mode`-Getter, Kassa-Wechsel wirkt sofort); `player/interaction.js` verweigert ein **neues** Einhängen
  ohne `save.data.briefingDone` bzw. ohne `ticket.clippable` (laufende Übungen werden nie unterbrochen);
  `game/session.js` trägt die Tages-Statistik (`day`) und die Ticket-Ende-Sequenz (30-Min-Toast,
  Verlängerungsfenster `[E]`, dann `stampCard.show`); `ui/hud-route.js#setTicket` zeigt die
  `.hud-ticket`-Box oben rechts; `game/autoplay.js` bootstrapped Kassa+Einschulung einmalig auf dem
  ersten `update()`. Debug: `WIPFEL.debug.endTicket()`.
- **Course Map + Parkplan-Tafel (M1.4):** `js/ui/map-render.js` (geteilter Renderer, THREE erlaubt –
  reine Browser-Canvas-Logik: `computeBounds`/`createProjector` aus `parkDef`+Terrain-Sampler,
  `paintBackground` bäckt einmal ein kleines Offscreen-Relief/„print"-Bild und skaliert es hoch,
  `paintRoutes` zeichnet Routenlinien+Podest-Punkte+Zip-Strichlinie+Ziffernkreise günstig jeden Frame,
  `paintStaticBoard` kombiniert beides + Titel + Legende zu einem Schuss für die Tafel; `mapColourOf`
  ersetzt die echte fast-schwarze „schwarz"-Kategoriefarbe nur auf der dunklen Kartenfläche durch ein
  helles Grau – auf der hellen Tafel bleibt die echte Farbe). `js/ui/course-map.js` (Tab-Overlay,
  Kartencache + Live-Overlay, Filter/Player/Zoom/Exit, Hover-Info aus `game/route.js#routesFromPark` +
  `save`, `course-map-open`-Body-Klasse blendet `#hud` aus, sperrt Bewegung ohne den Loop zu pausieren).
  `js/park/park-board.js` (zwei Pfosten + Kopfbalken aus dem Timber-Builder, eigene Print-Textur-Mesh,
  Platzierung neben `park/signs.js`s Wegweiser-Cluster über dessen exportierte `averageBearing`/
  `findNearPath`, dünner Kollider, eigene `.board-prompt`-Zeile, **E** in 2 m öffnet die Course Map).
- **NPC-Gäste (M1.6):** `js/game/occupancy.js` (rein, geteilt mit dem Spieler: `createOccupancy`
  Element-/Podest-Kapazität, `createQueue`/`createQueueRegistry` FIFO-Warteschlangen). `js/npc/agents.js`
  (THREE-frei: `planAgents` deterministische Profil-/Routen-/Look-Zuweisung je Seed, `createAgents` der
  Laufzeit-Zustandsautomat `wander→toEntry→queue→clipIn→onRail→dwell/unclip→return`, ruft `element.
  pointAt/tangentAt`/`ladder.rail`/`element.setRider` über einen winzigen lokalen `vec3`-Duck-Type ohne
  selbst `three` zu importieren). `js/npc/guest-rig.js` (zehn geteilte `THREE.InstancedMesh`, eine
  Pose-Skeleton-Instanz für alle Gäste nacheinander wiederverwendet, Torso-Farbe = Kategorie-Farbe,
  Entfernungsausblendung > 90 m). `js/player/interaction.js` (`occupancy`-Parameter, optional: verweigert
  dem Spieler eine von einem Gast belegte Übung mit `notice.waitForClimber`, beansprucht/gibt selbst
  einen Element-Slot als `"player"` frei). `js/player/nerves.js#watchSuccess()` (neu, kleine
  Vertrauens-/Nerven-Anpassung für `npc:watched-success`). `?npc=0` deaktiviert Gäste, `?map=1` öffnet
  die Course Map beim Boot. Tests `tests/unit/agents.test.mjs` (15, rein).
- **Pause/Optionen + Settings (M1.7):** `js/ui/options.js` + `js/ui/options-controls.js` (Panel:
  Resume/Course-Map/End-day, Audio/Kamera & Bewegung/Gameplay & Barrierefreiheit/Steuerung, `applyAll()`
  fürs Booten), `js/player/assist.js` (Assist-Skalierung, gelesen von `on-element.js`/`fall.js`),
  `core/save.js#data.settings` (additiv) + `updateSettings`/`export`/`import`, `audio/synth.js`
  (Kategorie-Gain-Busse `sfx`/`ambience`/`ui` neben `master`), `core/input.js#invertY`. `?options=1`
  öffnet beim Boot. Details/Prüfnachweis: oben unter „Aktueller Meilenstein“, Verträge in
  `docs/architecture.md#Options + settings (M1.7 – contracts)`.

## Was halb fertig ist
- **M1.4/M1.6:** Gäste behandeln Tarzansprung und Skateboard wie eine normale kontinuierliche Übung
  (Fallback-Tempo `NPC.elementSpeedFallback`, `element.pointAt` statt der echten Sprung-/Schub-Mechanik)
  – sieht aus wie ein gewöhnliches Queren, nicht wie ein Sprung; eigene Gast-Posen für diese zwei Arten
  wären ein eigener Schritt. Die Occupancy-Sperre gilt für den Spieler nur auf Übungen/Flying Fox, nicht
  auf die Leiter (bewusst außerhalb des Auftragstexts „stepping onto an element" belassen – Gäste queuen
  dort nur untereinander); ein Sturz (`"fall"`-Zustand) gibt den Element-Slot sofort frei statt ihn zu
  halten, bis der Kletterer zurück auf ein Podest ist – dokumentierte Vereinfachung, kein Absturzrisiko,
  weil die Kapazität ohnehin 1 bleibt. Die Parkplan-Tafel zeigt Routen als Linien/Ketten (unsere Routen
  enden am Flying Fox, sind keine Rundwege) statt echter geschlossener Schleifen wie im Vorbildfoto.
- Route-Header/Banner/Countdown zeigen nur die Route, die der Spieler gerade angeht (nächstes
  Einstiegsdeck in 6 m oder laufender Run) – das steht seit M1.2, Schilder und Freigaben ebenso.
  **Offen bleibt aus der ursprünglichen M1.2-Liste in `ROADMAP.md`:** eigene Podest-*Typen*
  (Übergang/Kreuzung/Rast/Hub als Bauvarianten – `platform.js#kind` kennt bisher nur
  „standard"/„transition") für Routen, die sich Bäume teilen könnten; diese Session hat nur Schilder,
  Freigaben und Banner gebaut (so beauftragt), keine neuen Podest-Bautypen.
- Draw-Calls liegen bei **434** (Ziel ≤ 440 inkl. Schilder – erreicht; ohne Schilder 428, altes
  M1.1-Ziel ≤ 420 weiter offen, s. „Offen"); die Übungen/der Flying Fox je Route bleiben bewusst
  unverschmolzen (Wobble-Deformer/Trolley-Bewegung brauchen ein eigenes Mesh je Instanz).
- **M1.7:** die `ambience`/`ui`-Audio-Busse haben noch keine Klänge (kein Ambiente, keine UI-Sounds im
  Spiel – s. „Offen"); Tastenbelegung ist nur lesbar (`js/ui/options-controls.js`), Neubelegung selbst
  ist laut Auftrag „vorbereitet, nicht implementiert" und bewusst nicht gebaut.

## Was kaputt ist
– nichts Bekanntes. Beobachtungen: siehe „Offen / Provisorisch“.

**Gefunden und behoben in M0.6** (betraf auch M0.4/M0.5, nur weniger sichtbar):
`player/controller.js#moveBody` hat die Geschwindigkeit aus dem zurückgemeldeten KCC-Weg abgeleitet –
inklusive der Korrektur, mit der der Character-Controller die Kapsel aus einer Durchdringung
schiebt. Ein Zustand, der auf ein Podest teleportiert (Zip-Ankunft, Abstieg von einer Übung, Retter),
konnte die Figur damit mit **25 m/s** wegschleudern. Jetzt gilt: ein Hindernis kann Tempo nur
wegnehmen, nie hinzufügen (`asked`-Klemme).

## Dateien, an denen gerade gearbeitet wird
– keine offene Baustelle, aber **alles seit Tag `m0` (`d20789e`) ist uncommitted**, inklusive M1.8
(bereits HEAD `43993bb`, s. u.), M1.1, M1.2, M1.3/M1.5, M1.4/M1.6 und M1.7 (diese Session).
M1.7 laut geänderten Dateien: neu
`js/ui/options.js`, `js/ui/options-controls.js`, `js/player/assist.js`,
`docs/screenshots/m1-options.png`; geändert `js/config.js` (`OPTIONS`), `js/core/params.js` (`?options=`),
`js/core/input.js` (`invertY`), `js/core/save.js` (`data.settings`, `updateSettings`/`export`/`import`,
`load()` in eine reine `normalize()` aufgeteilt), `js/audio/synth.js` (Kategorie-Gain-Busse, `category`-
Parameter auf `noiseBurst`/`ping`/`voice`, `setCategoryVolume`), `js/player/on-element.js`/`fall.js`
(Assist-Skalierung an den Aufrufstellen), `js/ui/hud-route.js`/`stamp-card.js` (Kategorie-Symbol
ergänzt), `js/main.js` (Esc→Options-Verdrahtung, `endTicketNow()`, `options.applyAll()`, `?options=1`,
`WIPFEL.options`), `css/base.css` (`.reduced-motion`, `accent-color`, `:disabled`), `css/screens.css`
(`.options-*`, `.opt-*`), `assets/strings/{en,de}.json` (38 neue `options.*`-Keys, Parität geprüft),
`tests/unit/save.test.mjs` (6 neue Tests), `docs/architecture.md`, `HANDOVER.md`.
M1.4/M1.6 laut geänderten Dateien: neu
`js/ui/map-render.js`, `js/ui/course-map.js`, `js/park/park-board.js`, `js/game/occupancy.js`,
`js/npc/agents.js`, `js/npc/guest-rig.js`, `tests/unit/agents.test.mjs`,
`docs/screenshots/{m1-coursemap,m1-parkboard}.png`; geändert `js/config.js` (`NPC`, `MAP`),
`js/core/params.js` (`?npc=`, `?map=`), `js/player/interaction.js` (`occupancy`-Param,
`elementBlockedByGuest`, `PROMPTS.waitForClimber`, Element-Slot-Beanspruchung als `"player"`),
`js/player/nerves.js` (`watchSuccess()`), `js/player/tuning.js` (`NERVES.trustPerWatch`/`watchRelief`),
`js/park/signs.js` (`averageBearing`/`findNearPath` jetzt exportiert, für `park-board.js`), `js/main.js`
(komplette Course-Map/Parkplan-Tafel/Gäste-Verdrahtung, `course-map-open`-Body-Klasse, `npc ms`/
`npc count` im F1-Panel, `WIPFEL.{parkBoard,courseMap,occupancy,agents,guestRig}`),
`css/screens.css` (`.course-map` Feinschliff: `.foot`/`.info`/`.filter-chip`, `.board-prompt`,
`course-map-open`-Regel), `assets/strings/{en,de}.json` (`notice.waitForClimber`, `map.*`,
`parkBoard.*`), `docs/architecture.md`, `HANDOVER.md`.
M1.3/M1.5 laut geänderten Dateien: neu
`js/game/ticket.js`, `js/ui/kassa.js`, `js/game/briefing.js`, `js/park/practice-stand.js`,
`js/ui/stamp-card.js`, `tests/unit/ticket.test.mjs`,
`docs/screenshots/{m1-kassa,m1-briefing,m1-stampcard}.png`; geändert `js/config.js` (`TICKET`,
`TICKET_TYPES`, `RULES.sizeClasses[].labelKey`), `js/core/save.js` (`briefingDone`, `ticket`,
`completeBriefing`/`startTicket`/`updateTicket`/`endTicket`), `js/core/i18n.js` (`formatClock`),
`js/core/params.js` (`?kassa=`, `?briefing=`), `js/player/belay.js` (`setMode`, `mode` als Getter),
`js/player/interaction.js` (`ticket`-Param, Einschulungs-/Ticket-Sperre), `js/game/session.js`
(`day`-Statistik, Ticket-Ende-Sequenz, `beginDay`/`forceDayEnd`), `js/game/autoplay.js` (`kassa`/
`briefing`-Bootstrap), `js/ui/hud-route.js` (`setTicket`, `.hud-ticket`), `js/main.js` (komplette
Kassa/Einschulung/Ticket/Stempelkarte-Verdrahtung, `WIPFEL.debug.endTicket`), `css/{hud,screens}.css`
(`.hud-ticket`, `.kassa-*`, `.briefing-panel`, `.stamp-*`), `assets/strings/{en,de}.json` (44 neue Keys,
Parität geprüft), `docs/architecture.md`, `ROADMAP.md`, `HANDOVER.md`.
M1.2 laut `git status`: neu
`js/park/signs.js`, `docs/screenshots/{m1-signs,m1-locked}.png`; geändert `js/core/save.js` (`unlocks`,
`nextGateCategory`), `js/player/interaction.js` (`save`-Param, Sperr-Prompt), `js/game/{route,
session}.js` (`lengthM`-Präzision, Freigabe-Logik, Banner-Sperrzweig), `js/ui/hud-route.js`
(`showBanner`-drittes Argument), `js/main.js` (`signs`-Verdrahtung, `save` an `interaction`),
`css/screens.css` (`.start-banner .locked`), `assets/strings/{en,de}.json` (`notice.locked*`,
`notice.unlocked*`, `sign.*`), `tests/unit/save.test.mjs` (4 neue Tests), `docs/architecture.md`,
`HANDOVER.md`.
M1.1 laut `git status`: neu
`js/park/{layout,layout-route,layout-validate,loader}.js`, `tools/{headless-terrain,bake-park}.mjs`,
`tools/dev/smoke-layout.mjs`, `tests/unit/layout.test.mjs`, `assets/parks/sonnwendberg.json`,
`docs/screenshots/m1-park.png`; geändert `js/main.js`, `js/game/{route,session,autoplay}.js`,
`js/player/interaction.js`, `js/park/{timber,zip-plan}.js`, `js/elements/zipline.js` (Kommentar),
`assets/strings/{en,de}.json`, `docs/architecture.md`, `HANDOVER.md`; gelöscht `js/park/first-course.js`.
Davor bereits uncommitted (M0.P, M0.6 – Details in älteren `docs/sessions/`-Logs, hier nicht erneut
aufgeführt): neu `js/world/terrain/{chunks,chunk-index}.js` + `tests/unit/chunk-index.test.mjs`;
geändert `js/world/{terrain,ground-detail,forest}.js`, `js/world/terrain/material.js`,
`js/procgen/geometry/ground-props.js`, `js/player/{rig-body,rig-gear}.js`,
`tools/dev/{terrain,forest}.html`. M0.6: neu `js/zipline/{physics,brakes}.js`,
`js/elements/zipline.js`, `js/park/{zip-plan,zip-landing}.js`, `js/player/on-zipline.js`,
`tests/unit/zipline.test.mjs`; geändert
`js/player/{interaction,controller,rig,rig-poses,tuning,vitals}.js`, `js/ui/hud.js`,
`js/audio/{synth,sfx}.js`, `docs/architecture.md`, `ROADMAP.md`.

## Wichtige Architekturentscheidungen
`docs/architecture.md` (Modulverträge – Park/Belay/HUD/Audio seit M0.4 eingetragen, Course-Map/Parkplan-
Tafel/Gäste-Occupancy seit M1.4/M1.6, Optionen + Settings seit M1.7), `docs/DECISIONS.md` ADR-001…012,
020…027 (Mockup 1:1, UI EN+DE, Kategorien mit Green). Offen: ADR-013 (Three.js 0.185.1 – faktisch
entschieden, eintragen), ADR-014 (Rapier compat 0.20.0 – dito), 015–019.

## Bekannte Bugs
– keine reproduzierten. Zu prüfen: Kamera-Kollision mit Kronen im echten Wald (nur in Dev-Seite getestet).

## Unmittelbar nächste Aufgabe
**M1 „Ein Ticket" ist mit M1.7 komplett** (M1.1–M1.8 alle abgehakt in `ROADMAP.md`, M1.8 bereits HEAD
`43993bb`). Als Nächstes **M2 „Ein Park"** (`ROADMAP.md`): 15 Parcours + 2 Wichtel, Kreuzungspodeste,
Legendäre Route, Saisonpass-Modus, Zeitläufe (3-2-1), Flow-Multiplikator (nur bei ruhigen Nerven),
Umhäng-Feedback, Meisterschaftsstufen, Nachtklettern, drei Sicherungsmodi (bereits an der Kassa wählbar –
prüfen, was für M2 noch fehlt), Fotos, Sidegrades, Übungskatalog auf 20–25 Familien, Grafikoptionen,
Touch-Steuerung.

Offene Entscheidung aus M1.3 (weiterhin unentschieden): Größenklasse (`RULES.sizeClasses[].allowed`) ist
an der Kassa wählbar und persistiert (`save.data.ticket.sizeClassId`), treibt aber **nur** die Zip-Masse
(`player.states.get("zipline").setRiderMass`) – sie gated **nicht**, ob eine zu kleine Größenklasse eine
bereits freigeschaltete Farbe betreten darf (GDD §3.7 „Größenklasse (Farbfreigabe, Zip-Tempo)" nennt
beides). Noch keine ADR; wenn gewünscht, gehört der Check neben `lockedCategoryOf` in
`player/interaction.js`, mit einer eigenen Prompt-Zeile.

## Nächste fünf Aufgaben
1. M2-Kickoff: Umfang aus `ROADMAP.md`/GDD §8 schneiden (welche der 15 Parcours zuerst, Kreuzungspodeste
   vs. Legendäre Route vs. Saisonpass zuerst entscheiden – vermutlich eigene ADR).
2. Größenklasse → Kategorie-Zugang entscheiden und ggf. verdrahten (s. o., „Offene Entscheidung aus M1.3").
3. Podest-Typen nachziehen (Übergang, Kreuzung, Rast, Hub – aus der ursprünglichen M1.2-Liste
   zurückgestellt, s. „Was halb fertig ist"): `platform.js#kind` kennt bisher nur
   „standard"/„transition"; Kreuzungspodeste würden auch verlangen, dass zwei Routen sich einen
   Baum/ein Podest teilen können – das rührt an den Layout-Generator (`layout.js`/`layout-route.js`),
   nicht nur an den Loader.
4. Eigene Gast-Posen für Tarzansprung/Skateboard (`js/npc/agents.js`/`guest-rig.js` behandeln beide
   aktuell wie eine normale kontinuierliche Übung, s. „Was halb fertig ist" M1.4/M1.6) – bräuchte je
   eine kleine Sonderbehandlung in `advanceElement`/`poseFor`, kein neues Grundgerüst.
5. Draw-Calls am Spawn weiter drücken (das ältere M1.1-Ziel ≤ 420 ohne Schilder bleibt offen, s.
   „Offen"; seit M1.4/M1.6 bei 438–439, weiter innerhalb des jetzt gültigen ≤ 480-Ziels): die
   Podest-Merge-Optimierung ist am Deckungsgrad der statischen Geometrie ausgereizt; als Nächstes käme
   nur noch dynamische Geometrie in Frage (Zip-Netz/Trolley, Element-Wobble-Meshes) – dafür müsste
   `element.js`/`zipline.js` eigene LOD- oder Batch-Strategien bekommen, kein reiner Loader-Fix mehr.

## Offen / Provisorisch
- **M1.7:** Die `ambience`- und `ui`-Audio-Busse (`js/audio/synth.js`) sind verdrahtet, haben aber noch
  keinen einzigen Klang, der über sie läuft (kein Ambiente-Bett, keine Interface-Sounds – beides erst M2)
  – die zwei Regler im Optionen-Bildschirm wirken also gerade auf nichts Hörbares, klar so vermerkt in
  der UI-Copy selbst (`options.audio.futureNote`). Tastenbelegung ist nur lesbar
  (`js/ui/options-controls.js`), Neubelegung selbst kommt später (ROADMAP „Tastenbelegung vorbereitet"),
  ohne eigenes UI dafür. Der Sprachumschalter rendert sich selbst sofort neu, aber bereits einmal
  gebaute, nie neu gerenderte Bildschirme (Kassa, das Options-Panel selbst erst nach dem nächsten
  `open()`, die HUD-Vitalbox-Labels „Belay"/„Str"/„Bpm") bleiben bis zum nächsten Boot in der alten
  Sprache – so in der UI-Copy selbst dokumentiert (`options.gameplay.localeNote`), kein Bug. Solange der
  Optionen-Bildschirm offen ist (`loop.paused === true`), laufen `parkBoard.update()`/`briefing.update()`
  in der Gameplay-Phase trotzdem weiter (dieselbe Vorbedingung galt schon vor M1.7 für den blanken
  Pause-Toggle – die Gameplay-Phase feuert immer, nur mit `dt = 0`): steht der Spieler zufällig in
  Reichweite der Parkplan-Tafel, öffnet ein `E`-Druck während der Pause die Course Map dahinter – ein
  vorbestehendes, nicht durch M1.7 verursachtes Detail der „weichen" Pause, nicht behoben (out of scope).
  Assist-Modus lässt `js/elements/element.js`s Wind-Böen-Anregung bewusst unangetastet (nur die Aktionen
  des Kletterers selbst werden sanfter) – dokumentierte Abgrenzung, kein Bug.
- **M1.4:** Routenlinien auf Course Map und Parkplan-Tafel zu blass (Kategorie-Farben kaum
  erkennbar, Weg-Linie dominiert) – im M2-Politur-Pass sättigen/glühen lassen wie im Mockup.
- **M1.4/M1.6:** Tarzansprung/Skateboard haben keine eigene Gast-Animation (s. „Nächste fünf Aufgaben").
  Die Spieler-Occupancy-Sperre gilt nicht für die Leiter (bewusst, s. `docs/architecture.md`); ein Sturz
  gibt den Element-Slot sofort frei statt ihn bis zur Rettung/Podest-Rückkehr zu halten (dokumentierte
  Vereinfachung, unkritisch bei Kapazität 1). Gäste navigieren am Boden geradlinig zum Ziel (keine
  Wegfindung um Bäume/Streudetail) – dieselbe ehrliche Grenze wie `game/autoplay.js`s Bot; auf dem im
  Test beobachteten Seed unauffällig, weil Hub und Einstiegsdecks recht offen liegen. Die Parkplan-Tafel
  zeigt Routen als farbige Ketten, keine geschlossenen Schleifen wie das Vorbildfoto (unsere Routen sind
  Einbahn zum Flying Fox). Der Kartencache (`course-map.js`) wird einmal beim ersten Öffnen gebacken und
  danach nie erneuert – unkritisch, weil sich Terrain/Routen zur Laufzeit nie ändern, aber ein künftiges
  Feature „Parcours im laufenden Spiel entdecken/aufdecken" (aus der M1.4-ROADMAP-Zeile „entdeckte
  Abschnitte") würde eine erneute Bake-Möglichkeit brauchen – nicht gebaut, weil nicht Teil dieses
  Auftrags (der Auftragstext nannte nur Overlay/Tafel/Gäste, nicht Progressive Discovery). Kein Zoom-Pan-
  Momentum/Trägheit (Ziehen folgt der Maus 1:1, kein Ausklingen) – Politur-Kandidat. NPC-Wanderung nutzt
  pro Gast einen eigenen `Rng`-Fork, ist also über die Session deterministisch fortsetzbar, aber die
  Bewegung selbst wird nicht bit-für-bit reproduzierbar getestet (nur `planAgents`, die Zuweisung, ist
  das) – für Hintergrundfiguren als ausreichend eingestuft.
- **M1.3/M1.5:** Größenklasse gated nur die Zip-Masse, nicht den Kategorie-Zugang – s. „Unmittelbar
  nächste Aufgabe". Die Tages-Statistik (`session.js#day`) ist **nicht** Teil von `save.data.ticket` –
  ein Reload mitten im Tag stellt Uhr/Belay/Größenklasse korrekt wieder her (`resumeDay`), aber die
  Stempelkarte würde bei einem sofortigen Ticketende danach bei null anfangen (bereits geschaffte
  Routen vor dem Reload sind für die Karte verloren, nicht fürs Save – Bestzeiten/Freigaben bleiben
  unberührt). Der Übungsstand hat einen Collider, aber kein Piktogramm-Schild wie der echte Einhängepunkt
  am Einstiegsdeck – aus dem 80-Zeilen-Budget herausgefallen; der Trainer-Text sagt, was zu tun ist, aber
  ein Erstspieler ohne Text-Fokus müsste den Pfosten selbst als Ziel erkennen. Das Erweiterungsfenster
  (`TICKET.extendPromptSeconds` = 8 s) zeigt nur einen statischen Toast, keinen sichtbaren Countdown wie
  die 3-2-1-GO-Scheiben – Politur-Kandidat. „Weiter im Park bleiben" und „nie ein Ticket gelöst" teilen
  sich dieselbe Sperrzeile (`notice.noActiveTicket`) statt zweier unterschiedlicher Texte. Trainer-Dialog
  und Übungsanker-Ritual verbrauchen `interact`/`clip` genau wie `player/interaction.js` – kollisionsfrei
  nur, weil der Übungsstand bewusst weit von jedem Routen-Einstieg platziert ist (gegenüber der
  mittleren Peilung aller Einstiege); keine harte Sperre, falls ein künftiger Layout-Seed das ändert.
  `belay.setMode()` setzt beide Karabiner zurück auf offen – unkritisch, weil er nur beim Kassa-Confirm
  und beim Resume aufgerufen wird (beides vor jedem möglichen Einhängen), aber nicht dagegen gefeit,
  mitten im Klettern aufgerufen zu werden. Kein Titel-Bildschirm vor der Kassa (GDD §5 listet einen –
  nicht beauftragt für M1.3, YAGNI). `.hud-ticket` (oben rechts) und das F1-Debug-Panel (`#debug
  .debug-panel`, ebenfalls oben rechts) überlappen sich sichtbar, wenn beide gleichzeitig an sind –
  nur ein Problem mit `?debug=1` an, nicht im Produkt-UI.
- **M1.2:** Der Wegweiser-Cluster sucht sich einen Punkt „nahe am Weg" über eine begrenzte Zufallssuche
  (`signs.js#findNearPath`, 16 Versuche) und fällt sonst auf den reinen Radialpunkt am Hub-Rand zurück –
  die generierten Routen führen selbst in keinen kartierten Waldweg hinein (nur die Hub-zu-Hub-Wege sind
  gepackt), insofern ist „nahe am Weg" hier eher „am Hub-Rand, wo man beim Verlassen des Hubs
  vorbeikommt" als ein echter Wegeanschluss. Schild-Pfosten haben **keine Collider** (wie
  `world/ground-detail.js`s Streudetail) – man kann hindurchlaufen; für dünne Pfosten am Wegrand als
  vertretbar eingestuft, nicht wie ein Podest-Pfosten geprüft. Ein extrem langer, leerzeichenloser
  Routenname (aktuell keiner: „Turmfalkenlinie" bei 344 von 440 px verfügbarer Breite) würde am
  Namensschild über den Rand laufen – `wrapText` bricht nur an Leerzeichen, kein Shrink-to-fit wie beim
  Kategoriewort (`fitText`); nicht gebaut, weil kein aktueller Name das auslöst (YAGNI). Größenklassen-
  Freigabe (`RULES.sizeClasses`) und Kategorie-Freigabe (`save.data.unlocks`) sind bisher zwei getrennte
  Systeme, die sich nie gegenseitig geprüft haben – wird mit M1.3 (Kassa) zusammenlaufen müssen.
- **M1.1:** 434 Draw-Calls am Spawn mit Schildern (Ziel dieser Session ≤ 440 – erreicht); ohne Schilder
  428 (M1.1s eigenes Ziel ≤ 420 – nicht erreicht, aber aus ~590 vor der Podest-Merge-Optimierung;
  ehrlich als „nahe dran, nicht erfüllt" markiert). Der Übersichts-Screenshot `m1-park.png` ist eine
  freigestellte Kamera weit über dem Park (`loop.stop()` + `renderer.render` von Hand) und zeigt
  **keinen** realen Spielwert – dort reichen Dreiecke bis ~1,2 M (Nebel/Wald in einer Aufsicht, die
  kein Spieler je einnimmt); der reale Spawn-Wert (~0,93 M) bleibt unter dem 1,0-M-Ziel.
  `assets/parks/sonnwendberg.json` wird vom Spiel nicht gelesen (nur `tools/bake-park.mjs`-Beleg) –
  falls ein künftiger Meilenstein einen echten Cache/Fixture-Konsum will, ist das ein eigener Schritt.
- **M0.6 (Eingabe, betrifft auch M0.5):** `input.pressed()` wird von den Zuständen im **Physik-Takt**
  gelesen, `input.endFrame()` läuft aber jeden Frame. Über 60 fps hat ein Frame manchmal **keinen**
  festen Schritt – die Kante geht dann verloren (Planken-Schritt, Retter-E, Abstoßen). Die Zipline
  umgeht das mit `input.down("jump")`; ein sauberer Fix wäre ein gepuffertes Kanten-Set in
  `core/input.js` (wie `jumpBuffer` im Controller). **Nicht** einfach `endFrame` überspringen: dann
  liest die Interaktion in der Gameplay-Phase dieselbe Kante zweimal (Umhäng-Ritual springt).
- **M0.6:** Das Gefälle-Fenster 4,5–6 % ist auf diesem Hang nur mit einem **erhöhten Ankunftspodest**
  (2,42 m) einzuhalten – der Hang selbst fällt mit 7–9 %. Ein 0,4-m-Deck wie am Einstieg würde
  9–11 % Gefälle bedeuten. Das ist die ehrliche Auflösung, hat aber zur Folge, dass die Ankunft eine
  Rampe braucht; M1.1 sollte das als regulären Podesttyp „Zip-Ankunft“ führen.
- **M0.6:** Höchstgeschwindigkeit 21–24 km/h – für eine 56-m-Bahn mit 5,5 % korrekt, aber deutlich
  unter dem Mockup-Wert (62 km/h, dort eine 310-m-Bahn). Tempo*gefühl* kommt aus Sichtfeld, Ton und
  den Stämmen, die 2,5 m entfernt vorbeiziehen; nicht an der Zahl schrauben.
- **M0.6:** Die Bremsentscheidung rastet an der Markierhülse ein (`zoneStart`); wer dort die Beine
  unten hat, kann sie nicht mehr retten. Beabsichtigt – aber ohne Trainer-Erklärung (M1.3) lernt man
  es erst beim zweiten Mal. Das Piktogramm am Startgatter ist der einzige Hinweis.
- **M0.6:** Bei „messy“ bleiben die zwei leichtesten Größenklassen im Netz hängen und müssen sich
  hangeln – gewollt (RESEARCH-DATA §6), aber die Zugleine vom Ziel (20 s) fehlt noch; wer die Kraft
  verliert, hangelt nur langsamer weiter, statt geholt zu werden.
- **M0.6:** Der Trolley der Figur (`rig-gear.js#addTrolley`) bleibt während der Fahrt an der Hüfte,
  obwohl er auf dem Seil sein müsste; in der Ego-Perspektive unsichtbar, von außen ein Detail. Der
  Seil-Trolley springt nach der Ankunft sofort zum Startgatter zurück (`setRider(null)`), statt am
  Ziel zu bleiben, bis ihn jemand holt – bewusst, damit der nächste Fahrgast einhängen kann.
- **M0.6:** Das Seil bekommt eine mitlaufende Delle unter der Rolle (Deformer), aber kein
  Nachschwingen der ganzen Bahn nach dem Abstoßen; der Feder-Dämpfer sitzt nur am Trolley.
- **M0.5:** `main.js#pickHeroTrees` legt jetzt bewusst eine **Kette** aus 4 Kiefern à 8,6 m an
  (`COURSE`-Konstante) plus 4 Deko-Stämme, die 15 m Abstand zur Kette halten – sonst findet die
  Greedy-Suche in `first-course.js` den falschen Baum. Ersetzt M1.1 durch den Layout-Generator.
- **M0.5:** Die Posen treffen die Seile nicht: beim Greifen stehen die Arme seitlich ab statt auf dem
  Halteseil zu liegen, auf den Planken fassen die Hände die Aufhängeseile nicht an. Braucht IK
  (M0.7-Politur). Auf dem Netz fehlt die Vierfüßler-Hocke – es wird die normale Balance-Pose benutzt.
- **M1.8:** `tarzan.js`/`on-tarzan.js` ist absichtlich **kinematisch/analytisch**, nicht Rigid-Body wie
  GDD §7 es für den Tarzansprung vorsieht (dort explizit als Ausnahme von „Übungen sind Schienen“
  genannt) – ein Rapier-Seilpendel wie in `fall.js` wäre der nächste Schritt, aber ohne Live-Testlauf
  zu riskant für diese Session; das deterministische Sinus-Pendel ist dafür beliebig reproduzierbar.
  `skate.js` nutzt für „Stoß + Trägheit“ nicht echte Impulse, sondern einen **pro Element
  überschreibbaren Beschleunigungswert** (`element.railAccel`, neu in `on-element.js#walk`) – fühlt
  sich träger an als die anderen Übungen, ist aber kein echtes Press-Impuls-Modell. Elf der zwölf
  Übungen liegen komplett im verschmolzenen Timber-Mesh; `barrels.js` braucht für das echte Rollen
  unterm Fuß **eigene Meshes** (der CPU-Deformer kann nur verschieben, nicht drehen) – 4–6 Draw-Calls
  mehr, wenn diese Übung tatsächlich im Kurs verbaut wird. 12. Art `wire-loops` ergänzt (dünne
  Steigbügel-Variante), damit die Zwölf ohne Fußnote stimmt – s. `docs/architecture.md`.
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
- **M0.P:** Die Distanzradien des Bodendetails (`GROUND_DETAIL.radius`: Kiesel 45 m, Zweige 55 m,
  Gras 70 m, Steine/Wurzeln 80 m, Laubhaufen 90 m) sind am Bild gewählt, nicht an echten Augen –
  beim ersten Testlauf auf Ploppen beim Gehen achten (Rebuild alle `refreshMoveMetres` = 6 m). Ein
  weicher Übergang bräuchte ein Scale-Fade im Vertex-Shader.
- **M0.P:** Kiesel und Steine haben jetzt gröbere Kugeln (8×6 bzw. 10×8 statt 14×10) und werfen
  (Kiesel/Zweige/Laubhaufen) keinen Schatten mehr – bei 5–14 cm unter der Schattenmap-Texelgrösse
  (3,4 cm), aber ein Look-Pass sollte das aus Augenhöhe gegenprüfen.
- **M0.P:** fps ist im Headless-Chromium **nicht** messbar (rAF liefert kaum Frames, SwiftShader
  braucht Sekunden pro Bild). Die Budgetzusage „≥ 55 fps auf iGPU" ist damit **nicht** nachgewiesen –
  nur Dreiecke, Draw-Calls und ein Software-Render-Vergleich. Auf echter Hardware nachmessen.
- Figur: `player/rig*.js` = 64 Meshes → 98 Draw-Calls mit Schatten (siehe „Nächste fünf Aufgaben" 5).
- Bäume: gut lesbar, aber Kronen noch „kartig“ bei LOD 1/2; Astwerk sparsam; weiterer Look-Pass in M2.
- Figur: Kopf/Hände einfach; Posen-Blending ok; Kletterposen (ladder, balance, grab, hang, zipline)
  existieren als Namen, sind aber noch nicht animiert.
- `?autoplay=1` noch ohne Wirkung im Hauptspiel (Bot existiert nur in `tools/dev/player.html`).

- **M0.7:** Bodennavigation ist eine Bot-Grenze: `?autoplay=1` startet auf dem Einstiegsdeck und
  hüpft nach Stürzen zurück zum nächsten Element-Einstieg (im Log als „shortcut“). Menschen laufen
  normal – der freie Walk wurde in M0.4 manuell verifiziert.
- **M0.7:** Physik-Kante am Deck: Rapier-Autostep verweigert die Stufe-vor-Deck-Doppelkante; gelöst
  über eine 28°-Rampen-Kollision unter der Stufe (Autostep steht auf 0,44). Ein sichtbarer
  Hackschnitzel-Keil wäre die schönere Politur.
- **M0.7:** Kein Kassa-Screen (M1.3), kein Ticket-Timer im HUD (M1.5); FLOW zeigt statisch x1,0;
  fps auf echter Hardware weiter unbelegt (headless 60+ nur ohne Screenshot-Last).

## Wie starten
```
python serve.py             # http://127.0.0.1:8200/   (?debug=1 Panel · ?physics=1 Wireframe · ?seed=N · ?fast=1)
```
Beim Boot erscheint zuerst die **Kassa** (Ticketart/Größenklasse/Sicherungsmodus, Confirm startet den
Tag), danach die **Einschulung** (vier `[E]`-Dialogzeilen, dann F/F bzw. F/X am Übungsanker) – beides
übersprungen bei `?autoplay=1` (Bot bestätigt Kassa-Standardwerte und schließt die Einschulung
programmatisch ab). `?kassa=1` erzwingt die Kassa auch bei einem laufenden Ticket im Save (statt den Tag
fortzusetzen); `?briefing=0` überspringt die Einschulung dauerhaft (setzt `save.data.briefingDone` sofort).
Browser-Pane in Claude Code: `.claude/launch.json` → „wipfel”. Steuerung: WASD, Maus (Klick = Pointer-Lock),
Shift Sprint, Leertaste Sprung, **F einhängen/umhängen** (classic zusätzlich X für Karabiner B),
**E klettern / auf die Übung steigen / Course Map an der Parkplan-Tafel öffnen**, **Tab Course Map**
(auch Esc/EXIT-Button schließt sie; öffnet nicht pausiert, sperrt nur die Bewegung), T Kamera, F1 Debug,
F2 Physik-Wireframe, **Esc Pause/Optionen** (M1.7: öffnet `js/ui/options.js`, `loop.paused === true`
solange offen; bzw. Course-Map-schließen, wenn die offen ist – Course Map hat Vorrang vor Optionen).
**Auf einer Übung:** W/S vor und zurück (auf den Planken **ein Druck = eine Planke**), A/D lehnen,
**Q** linke Hand, **rechte Maustaste** rechte Hand, **R** atmen (nur im Stehen).
**Im Gurt:** Leertaste hochziehen, W/S am Seil zum Podest hangeln, E Retter rufen.
**Am Flying Fox:** F, F einhängen · **E** hinsetzen · **Leertaste** abstoßen und gedrückt halten
(Beine hoch – gilt auch für die Netzbremse) · A/D Körper drehen · **W** hangeln, wenn man
stehenbleibt · E lange halten, um vom Startgatter wieder aufzustehen · nach der Ankunft F, F auf den
Anker `landing` und über die Rampe zurück.
Der erste Kurs steht auf der Hero-Kiefer-Kette am Spawn – hinlaufen oder
`WIPFEL.player.teleport(x, y, z)` mit `WIPFEL.course.entryDeck.group.position` benutzen.
NPC-Gäste laufen ab Boot von selbst (`?npc=0` schaltet sie ab); die Parkplan-Tafel steht neben dem
Wegweiser-Cluster am Hub-Rand (`WIPFEL.parkBoard.standPosition`).

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
`?kassa=1` (Kassa erzwingen trotz laufendem Ticket) · `?briefing=0` (Einschulung dauerhaft überspringen) ·
**`?npc=0`** (Gäste komplett deaktivieren, M1.6) · **`?map=1`** (Course Map beim Boot öffnen, M1.4,
für Screenshots) · **`?options=1`** (Pause/Optionen beim Boot öffnen, M1.7, für Screenshots – blendet
eine sonst gleichzeitig sichtbare Kassa aus) ·
`window.WIPFEL` = {loop, physics, scene, camera, renderer, rng, input, events, terrain, forest, sky,
wind, player, parkDef, course, **signs**, belay, hud, interaction, vitals, session, save, autoplay,
kassa, briefing, stampCard, ticket, **options**, **parkBoard, courseMap, occupancy, agents, guestRig**, debug}.
Skripten/Testen: `WIPFEL.player.teleport(x, y, z)`, `WIPFEL.player.setState("ground")`,
`WIPFEL.course.{anchors, elements, platforms, graph, zipline, zipLanding, zipPlan}`,
`WIPFEL.course.elements[i].getEntryAnchor().stand`,
`WIPFEL.belay.state()` + **`WIPFEL.belay.setMode(mode)`**, `WIPFEL.vitals.{balance,stamina,nerves}` +
`WIPFEL.vitals.probe()`,
**`WIPFEL.signs.group`** (M1.2: alle Schild-/Pfosten-Meshes, `.children.filter(o => o.name ===
"sign-face")` sind die neun beschrifteten Tafeln), **`WIPFEL.save.data.unlocks`** (Kategorie-Freigaben,
`{blue,red,black}`) + **`WIPFEL.save.isUnlocked(cat)`**/**`unlockCategory(cat)`**,
**`WIPFEL.save.data.briefingDone`**/**`.ticket`** (M1.3/M1.5), **`WIPFEL.ticket`** (die reine Uhr –
`.started/.expired/.clippable/.remainingGameMinutes/.extensionsLeft`), **`WIPFEL.kassa.confirmDefaults()`**
und **`WIPFEL.briefing.completeForBot()`** (die Bot-Hooks, auch von Hand aufrufbar),
**`WIPFEL.debug.forceSlip(±1)`** (erzwingt einen Sturz auf der aktuellen Übung),
**`WIPFEL.debug.setWindAlong(m/s|null)`** (negativ = Gegenwind auf der Zipline; −7 lässt ein Kind
stehenbleiben), **`WIPFEL.debug.setRiderMass(kg)`** (Größenklasse für die nächste Fahrt, normalerweise
über die Kassa gesetzt) und **`WIPFEL.debug.endTicket()`** (M1.5: erschöpft die Restzeit und ruft
`session.forceDayEnd()` – überspringt die 8-s-Erweiterungs-Gnadenfrist, landet direkt auf der
Stempelkarte; No-op ohne laufendes Ticket).
**M1.4/M1.6:** **`WIPFEL.courseMap.{visible,open(),close(),toggle()}`**, **`WIPFEL.parkBoard.
standPosition`** (zum Hinteleportieren), **`WIPFEL.agents.list`** (jeder Eintrag: `id, category,
routeId, phase, pos, heading, t, distanceToPlayer, …` – `phase` ∈ wander/toEntry/queue/clipIn/onRail/
unclip/dwell/return), **`WIPFEL.occupancy.{holderOfElement(id), claimElement(id,holder),
releaseElement(id,holder), guestsOnPlatform(id)}`** (dieselbe Instanz, die Spieler und Gäste teilen –
zum Erzwingen der Wartezeile von Hand: `claimElement('burma-1','test')`, dann `interaction.prompt`
prüfen), **`WIPFEL.guestRig.group`** (zehn `InstancedMesh`-Kinder).
F1-Zeilen seit M0.5: `element` (id + t), `balance`, `stamina`, `nerves` (Wert + Stufe),
`heart bpm`, `trust`, `air below`; seit M0.P `terrain lod` (Chunks je LOD, Summe 36); seit M1.6
**`npc count`**, **`npc ms`**.
**Achtung headless:** In Chromium tickt `requestAnimationFrame` nur, wenn der Compositor Frames
liefert – für scriptgesteuerte Läufe `loop.stop()`, `requestAnimationFrame` neutralisieren und
`loop._tick(t)` mit festen 60-Hz-Zeitstempeln selbst aufrufen (siehe Session-Log). Screenshots zeigen
immer das letzte vom Loop gerenderte Bild: für eine eigene Kameraposition erst `loop.stop()`, dann
`renderer.render(scene, cam)`, dann den Screenshot.

## Aktueller Seed / Reproduktionsfälle
Standard-Seed 1 (`DEFAULTS.seed`). Spawn (11.1, 4.8, −163.3) auf Hub `spawn`. Reproduktionsfälle: –

## Fallen / Hinweise
- **Subagenten nie auf Fable 5** – nur `model: "opus"` oder kleiner (siehe CLAUDE.md 12).
- Server nur `serve.py`; Write/Edit können große Dateien abschneiden → `node --check`; Netzwerk nur lokal;
  PowerShell 5.1; `curl.exe -A "Mozilla/5.0"`.
- Rapier-Wireframe (`?physics=1`) auf dem Heightfield kostet Millionen Linien – nur kurz einschalten.
