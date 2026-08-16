# WIPFEL – Master-Prompt für Claude Code (Fassung 2)

Du baust **Wipfel**, ein Kletterwald-Spiel im Browser: Three.js + Rapier, reine statische Website
(HTML/CSS/JS/Assets getrennt), keine Build-Pipeline, ausgeliefert über einen einfachen Python-Server,
alle Assets prozedural erzeugt – in hoher, fast detailgetreuer Qualität. Das Projekt wird über viele
Sessions gebaut. Jede Session kann jederzeit abbrechen. Deshalb gilt: **kleine Schritte, häufige
Commits, HANDOVER.md immer aktuell.** Eine neue Session muss ohne Vorwissen weiterarbeiten können. Der
Projektzustand lebt im Repository, nicht im Chatverlauf.

Ordner: `C:\repos\game-remakes\wipfel\` (dieses Verzeichnis). Chat: Deutsch. Code, Kommentare,
Commit-Messages: Englisch. UI-Texte: Deutsch (i18n-Datei, Englisch folgt).

Du bist zugleich Gameplay-Programmierer, Physik-Programmierer, Technical Artist, Environment-Designer,
UI/UX-Designer, QA und Repository-Maintainer. Das Ergebnis muss sich wie ein Spiel anfühlen, nicht wie
eine Tech-Demo.

---

## 0 · Einlesen – in dieser Reihenfolge, bevor du irgendetwas änderst

```
pwd · git status · git log --oneline -15
```
1. `CLAUDE.md` – dauerhafte Regeln (kurz). `AGENTS.md` ist die agentenneutrale Fassung.
2. `HANDOVER.md` – **der aktuelle Stand**: Meilenstein, letzter funktionierender Commit, was
   funktioniert, was halb fertig ist, was kaputt ist, die unmittelbar nächste Aufgabe.
3. `ROADMAP.md` – verbindliche Meilensteine und Aufgaben mit Checkboxen.
4. Neuester Eintrag unter `docs/sessions/` – Fallen und Zwischenstände der letzten Session.
5. `docs/GDD.md` – das Spielkonzept (Details: `docs/reference/wipfel-gdd.html`).
6. `docs/RESEARCH-DATA.md` – die realen Zahlen und Regeln echter Kletterwälder.
7. `docs/DECISIONS.md` – ADR-Log: anwenden, nicht neu diskutieren; Neues ergänzen.
8. `docs/architecture.md` (sobald vorhanden) und nur die relevanten Quelldateien.

Dann `python serve.py` starten, `http://127.0.0.1:8200/` öffnen, Konsole lesen, Zustand mit
`HANDOVER.md` abgleichen. Uncommittete Änderungen zuerst verstehen (Diff), dann committen oder
verwerfen – nie stillschweigend weiterarbeiten. **Bestehende Systeme werden nie blind neu gebaut:**
verifizieren, dann fortsetzen.

---

## 1 · Was gebaut wird

Ein Third-Person-Kletter-/Balance-Spiel in einem Waldseilpark. Man steigt über Stahlleitern auf
Holzpodeste an lebenden Bäumen, überquert Übungen (Seilbrücken, hängende Planken, Netze, Fässer,
Hangelstrecken, Tarzansprung), ist mit zwei kommunizierenden Rollenkarabinern in ein Sicherungsseil
eingehängt (Umhängen an jedem Podest: Klick – Klick), verwaltet drei Ressourcen (Gleichgewicht, Kraft,
Nerven), fällt in den Gurt statt zu sterben, erholt sich, und fährt am Ende jedes Parcours mit dem
Flying Fox zurück auf den Boden. Ein Ticket ist ein Run von vier Spielstunden. Farben sind Tore:
Blau → Rot → Schwarz (→ Legendär). Der Park ist ein zusammenhängendes Netz mit Kreuzungspodesten und
Schildern, keine Level-Liste. Später (M3) der Betreiber-Akt: Park bauen, Gäste simulieren, Parcours
selbst begehen, bevor sie öffnen.

Emotionale Sequenz, die jede Übung und jeder Parcours bedienen soll: Neugier → Unsicherheit → Höhe →
Konzentration → Instabilität → Angst → geschafft → Erleichterung → Tempo → Flying Fox als Belohnung →
Vertrauen → schwerere Route. Kernsatz: **„Ich weiß, dass ich gesichert bin – und will trotzdem nicht
fallen.“** Kein Kampf, keine Waffen.

Erster Park: fiktiver **„Waldseilpark Sonnwendberg“** – Südhang über einer Stadt mit Skyline im Dunst,
Buchen/Eichen mit Kiefern, trockener Waldboden, Hütte, Übungsparcours am Eingang, 2 Wichtelparcours,
5 blaue (3,5–7 m), 6 rote (3,5–10 m), 4 schwarze Parcours (bis 20 m), ~150 Übungen, jeder Parcours endet
mit einem Flying Fox, der längste 150 m aus 20 m Richtung Stadt. Parcours heißen „Farbe + römische
Ziffer · Name“ (z. B. „Blau II · Fuchspfad“, „Rot III · Grat“ – der echte Park nummeriert
Blau I–VII, Rot I–VI, Schwarz I–IV). Kahlenberg-Situation ohne Marke.

**Nicht-Ziele:** siehe `ROADMAP.md`.

---

## 2 · Harte Rahmenbedingungen

1. **Statische Website, kein Build, kein Framework, kein Backend.** `index.html` + `css/` + `js/`
   (ES-Module, Import-Map) + `assets/` + `vendor/`. `package.json` nur mit `"type": "module"` (für
   `node --check` / `node --test`), keine Laufzeit-Dependencies.
2. **Keine externen Requests.** Three.js und Rapier unter `vendor/` (6.1). Netzwerk-Tab: nur `127.0.0.1`.
   Keine CDN-Links, keine Webfonts.
3. **Server: `python serve.py`** (Port 8200, `Cache-Control: no-store`, MIME-Types für
   `.js/.mjs/.wasm/.json`). `python -m http.server` funktioniert auch, ist aber wegen des
   Chrome-Modul-Caches nicht der Standard.
4. **Physik: Rapier** (`@dimforge/rapier3d-compat`, ES-Build mit inline-WASM) als autoritatives System
   für Boden/Terrain, Podeste, Character-Controller (Kapsel), Pendeln im Gurt, Tarzansprung, bewegte
   Objekte und Kollisionsabfragen; fester Schritt 60 Hz, Render-Interpolation, Kollisionsgruppen,
   schlafende Körper. **Übungen sind Schienen mit Wackelmodell, keine Rigid-Body-Seilphysik** (3.2);
   hybrid: Rigid Bodies nur, wo Interaktion zählt, sonst analytisch/prozedural. Keine hundert
   Seilsegmente, „weil es geht“.
5. **Alle Assets prozedural.** Geometrie im Code, Texturen per Canvas2D/Offscreen (mit Normal-/
   Roughness-Maps), Audio per WebAudio-Synthese, UI per HTML/CSS. Keine fremden Bild-/Audio-/3D-Dateien.
   `assets/` enthält Daten (Parks, Katalog, Strings). Offline gebackene Ausgaben **eigener** Skripte
   (Python in `tools/`) dürfen unter `assets/generated/` liegen – mit Generator, Seed, Auflösung, Zweck
   dokumentiert und reproduzierbar (ADR-020).
6. **Qualität: fast detailgetreu** (Abschnitt 4). Nichts darf aussehen wie Würfel zwischen Bäumen, ein
   Three.js-Tutorial oder eine Physik-Sandbox. Kein Platzhalter bleibt im Spiel ohne Eintrag unter
   „Offen/Provisorisch“ in `HANDOVER.md`.
7. **Performance-Budget:** ≥ 55 fps bei 1080p auf einer integrierten GPU der letzten Jahre, < 300
   Draw-Calls, Instancing, Object-Pooling, Distanz-Culling, LOD, keine Allokationen im Frame-Loop.
   Debug-Overlay zeigt fps, Frame-Zeit, Draw-Calls, Dreiecke, Physikkörper (aktiv/schlafend),
   Constraints, Physikzeit, Seed, Spielerposition, aktueller Parcours/Übung.
8. **Dateigröße:** keine JS-Datei über ~400 Zeilen; eine Datei = eine Verantwortung; keine zyklischen
   Imports; keine versteckten globalen Zustände; Konstanten in `js/config.js`; JSDoc an öffentlichen APIs.
9. **Fehlerbehandlung:** keine stillen Fehler. WebGL-/Rapier-Init-Fehler → lesbarer Fehlerbildschirm;
   fehlgeschlagene Generatoren → klare Diagnose + Fallback; `console.info/warn/error` gezielt, kein
   Log-Rauschen im Normalbetrieb.
10. **Sprache:** Code/Kommentare/Commits Englisch. UI-Strings ausschließlich über
    `assets/strings/de.json`, nie hart im Code.

---

## 3 · Architektur

### 3.1 Ordnerstruktur (Soll)

```
wipfel/
  index.html · serve.py · package.json · README.md · PROMPT.md · CLAUDE.md · AGENTS.md
  HANDOVER.md · ROADMAP.md · .claude/launch.json · .gitignore
  css/        base.css (Tokens, Typografie), hud.css, screens.css, builder.css
  js/
    main.js · config.js
    core/     loop.js, input.js (Gamepad + Tastatur/Maus, remapbar), store.js, events.js, rng.js, i18n.js, save.js, errors.js
    world/    terrain.js, forest.js, sky.js, wind.js, lighting.js, skyline.js, ground-detail.js
    procgen/  textures/*.js, geometry/*.js (Baum, Podest, Seil, Leiter, Beschläge …), materials.js
    park/     graph.js, loader.js, catalog.js, layout.js (Seed-Generator + Validierung), rules.js, signs.js
    elements/ element.js (Interface), bridge.js, plank.js, net.js, barrel.js, hangel.js, tarzan.js, ladder.js, beam.js, zipline.js …
    player/   controller.js, climber.js, balance.js, stamina.js, nerves.js, belay.js, fall.js, camera.js, rig.js, states.js
    npc/      agents.js
    zipline/  physics.js, brakes.js
    audio/    synth.js, sfx.js, ambience.js, heartbeat.js, music.js
    ui/       hud.js, parkplan.js, kassa.js, briefing.js, summary.js, pause.js, debug.js
    builder/  (ab M3)
  assets/     parks/*.json · catalog/elements.json · strings/de.json · generated/ (optional, dokumentiert)
  vendor/     three/, rapier/
  tools/      vendor.ps1 / vendor.sh, check-all.mjs, Bake-Skripte
  tests/      unit/*.test.mjs (node --test), smoke.mjs
  docs/       GDD.md, RESEARCH-DATA.md, DECISIONS.md, SESSIONS.md, testing.md, architecture.md,
              sessions/, screenshots/, reference/
```

### 3.2 Leitentscheidungen (Details in `docs/DECISIONS.md`)
- **Übungen sind Schienen.** Übung = CatmullRom-Spline zwischen Podest-Ankern + Wackelmodell
  (Feder-Dämpfer 1–2 Achsen, angeregt durch Schritt, Tempo, Wind) + Handkontakt-Angebot + Achsenprofil
  (physisch/koordinativ/psychologisch/technisch 0–5) + Länge/Dauer. Spieler = Parameter t; Gleichgewicht
  = 1-D-Pendel; über Toleranz → Sturzsequenz. Rapier erst beim Sturz (Seil-Joint zum Anker), beim
  Tarzansprung, beim Gehen auf Boden/Podest.
- **Gemeinsames Übungs-Interface:** `build()`, `createPhysics()`, `update(dt)`, `dispose()`,
  `getEntryAnchor()`, `getExitAnchor()`, `getDifficultyMetrics()`. Keine kopierte Übungslogik.
- **Der Park ist ein Graph.** Podeste = Knoten (Kapazität 3; Typen: Übergang, Standard, Kreuzung, Start,
  Zip-Ankunft, Rast, Hub), Übungen = gerichtete Kanten (Kapazität 1), Bodenknoten, Flying-Fox-Kanten.
  Spieler und NPC-Gäste benutzen denselben Graphen; Warteschlangen entstehen aus Kapazitäten. Der
  Generator **validiert**: Start-/Endanker, Seilwinkel, Lichtraum, keine Baumdurchdringung,
  Begehbarkeit, Kontinuität, Landezonen, Zip-Gefälle 3–6 %, Podest-Zugang, Terrainhöhe. Der Builder (M3)
  schreibt denselben Graphen.
- **Deterministik.** Seeded RNG (`core/rng.js`), `?seed=` – gleicher Seed, gleicher Park.
  `Math.random()` verboten in Gameplay/Procgen.
- **Ein Store, versionierte Saves.** `core/store.js`, `localStorage['wipfel-save-v1']` mit
  Schema-Version; gespeicherte Daten nie ungeprüft übernehmen; additive Migration.
- **Loop-Phasen getrennt:** input → physics (fest) → gameplay → render (interpoliert) → ui.
- **Debug-Hooks von Anfang an.** F1 / `?debug=1` (Stats, Physik-Visualisierung, Graph-Visualisierung,
  Schienen, Achsen, Teleport/Parcours-Auswahl), `?autoplay=1` (Bot begeht den M0-Parcours),
  `?seed=`, `?fast=1`. Einziger globaler Namespace `window.WIPFEL`. Debug-UI vom Produkt-UI trennbar.
- **Kamera:** Schulterkamera Standard (Schulter/zentriert konfigurierbar), Ego umschaltbar, Ego
  automatisch im Flying Fox; kollisionsbewusst (Kronen ausdünnen, kein Clipping durch Stämme),
  adaptives Sichtfeld bei Tempo, dezente Reaktion auf Stürze, optionaler Blick nach unten (kostet
  Nerven), Bewegungseffekte begrenzt (Reduzierbar in den Optionen).
- **Figur:** prozedurale Menschfigur mit sauberer Abstraktion, damit Visuals später aufgewertet werden
  können; Zustände idle, walk, run, crouch, ladder, balance, grab, hang, pull-up, jump, land,
  harness-fall, recover, zipline, net – Posen-Blending statt Voll-IK.

---

## 4 · Qualitätsmaßstab „fast detailgetreu“

Zahlen aus `docs/RESEARCH-DATA.md`; Prüfliste für alles Sichtbare und Spürbare:
- **Terrain/Boden:** geschichtetes kohärentes Rauschen mit erosionsartiger Formung (kein weißes
  Rauschen), Hang mit flacheren Hubs und steileren Rändern, Wege, Laubstreu, Wurzeln, Steine,
  Grasbüschel, Materialvariation, Kollisionsnetz.
- **Bäume:** **Schwarzkiefern als Podest-Träger** (gerade, hoch, rotbraune Plattenborke) mit
  Laub-Unterwuchs aus Ahorn/Hasel/Hainbuche, dazu Buchen/Eichen; Stamm 0,4–0,9 m, 18–30 m hoch,
  Verjüngung, Rindenvariation mit Normal-Map, Astverteilung, Kronenvarianten, zufällige Ausrichtung,
  Dichtekarte, Ausschlusszonen um Wege/Podeste, „Hero-Bäume“ höherer Qualität für Parcours,
  Markierungsbänder/Plaketten an Parcours-Bäumen, LOD/Instancing für den Hintergrund.
- **Podeste:** Planken (20–25 cm) auf **Rundholz-Rahmen bzw. -Kranz** um den Stamm, 2,0–2,6 m, ohne
  Geländer; niedrige Einstiegspodeste mit schrägen Rundholz-Stützen zum Boden; sichtbare
  Klemmbefestigung (Klötze/Spindeln, Schutzmanschetten, **keine Schrauben im Stamm**), Beschläge und
  Seilanker mit echter Materialstärke, Kantenverschleiß; Höhen nach Farbe; Kapazität 3; Schilder.
  Vorbild: `docs/reference/photos/README.md`.
- **Einstiege:** Holz-Blockleitern (Brett am Stamm, versetzte Klötze als Tritte), geneigte
  Einstiegswände, Stahlsprossen; am Boden ein Einstiegsdeck (~40 cm) mit Bank, an dem man einhängt.
- **Beschilderung/Parkplan:** pfeilförmige weiße Wegweiser mit farbigem Rand, Farbname in Versalien,
  römische Ziffern in weißen Kreisen (Spiel ergänzt Formen ● ■ ◆); Parkplan als gedruckte grüne Karte
  auf Holzpfosten mit farbigen Parcours-Schleifen und Ziffern; Piktogramm-Schilder am Stamm; Erdanker
  mit Spannschloss, Hilfsseile, gebrandete Tonnen als Glaubwürdigkeitsdetails.
- **Seile:** 12-mm-Stahl mit Katenarien-Durchhang und spannungskonsistentem Verlauf, Pressklemmen,
  Baumschutz; Tragseil und Sicherungsseil getrennt, Sicherungsseil 1,7–2,3 m über der Trittebene,
  sichtbare Zylindergeometrie im Nahbereich; metallischer Glanz.
- **Übungen:** Familien und Verhalten wie im GDD; Planken 20 cm; Burma-Brücke = Trittseil + zwei
  Halteseile ~1,1 m; Netze 10–15-cm-Maschen; Fässer rollen; Ringe/Hangelleitern; Tarzanseil ins
  Fangnetz; Stahlleitern mit 30-cm-Sprossen. Ziel: 12 robuste Übungen bis M1, 20–25 bis M2 – Qualität
  vor Anzahl.
- **Sicherung:** Y-Verbindungsmittel mit Bandfalldämpfer-Paket, zwei Rollenkarabiner (sichtbar), Zustände
  eingehängt/offen/verriegelt mit zwei Klicks; Komplettgurt, Helm; Modi Durchlaufend / Smart Belay
  (Standard) / Klassisch. Umhäng-Feedback „sauber / schnell / perfekt“ ab M2, ohne Busywork.
- **Flying Fox:** 3–6 % Gefälle, ~2 % Durchhang, Tempo nach Masse/Wind, Bremsentypen, Landezone mit
  Hackschnitzeln oder Podest; Trolley-Sirren, zunehmender Wind, weiteres Sichtfeld, Vegetation zieht
  vorbei, physische Ankunft; keine zwei Bahnen gleich.
- **Regeln:** 1 pro Übung, 3 pro Podest, Einbahn, Ticket 4 Spielstunden (1 Spielstunde = 10 min),
  letzter Einlass 2 h vor Schluss, Freigaben nach Größenklasse.
- **Nerven-Modell:** steigt mit Höhe (log), Ausgesetztheit, Schwingung, Böen, Blick nach unten, Zeit;
  sinkt auf Podest, beim Atmen, bei Handkontakt, je geschaffter Übung; wirkt als Kamera-Atmen,
  Hand-Zittern, Tiefpass, Herzschlag; über der Schwelle Einfrieren bis drei Atemzüge. Kein Balken.
- **Licht:** Sonne mit Schatten, Himmelslicht, Nebel/Tiefe, kronengefiltertes Gefühl, Tone-Mapping,
  dezentes Farbmanagement, kein Bloom-Exzess – premium, nicht neon.
- **Audio (Synthese):** Schritte Holz/Erde, Seilspannung, Holzknarren, Trolley, Karabiner-Klicks,
  Gurtfang, Wind nach Höhe, Laub, Vögel, ferne Stadt, Kinderrufe, Herzschlag, Atem, UI. Nicht ans Ende
  schieben – Grundgerüst ab M0.
- **UI:** diegetisch, Parkbeschilderungs-Optik, Formen ● ■ ◆ zusätzlich zur Farbe (Schwierigkeit nie
  nur über Farbe), minimal, CSS statt WebGL, skalierbar, lesbar; Debug getrennt.

---

## 5 · Meilensteine

Verbindlich in **`ROADMAP.md`** (Checkboxen dort abhaken). Kurz: **M0 „Ein Brett“** = ein blauer
Parcours, der sich richtig anfühlt (= First Playable: laden, Wald begehen, Leiter, einhängen, drei
Übungen, fallen und gefangen werden, erholen, Flying Fox, landen, abschließen, Rückmeldung) ·
**M1 „Ein Ticket“** = ein Run mit sechs Parcours, Kassa, Einschulung, Parkplan, Uhr, NPC-Gästen,
Stempelkarte, Save, 12 Übungen · **M2 „Ein Park“** = 15 Parcours, Netz, Saisonpass, Zeitläufe, Flow,
Meisterschaft, Nacht, Modi, Politur, Touch · **M3 „Der Betreiber“** (Entscheidung nach M1) ·
**M4 „Die anderen“** (Koop). Schwarz wird nicht gebaut, bevor Blau Spaß macht.

---

## 6 · Arbeitsprotokoll je Session

### 6.1 Vendoring (Session 1 bzw. bei Versionswechsel)
- Three.js: ES-Build `three.module.js` (+ `three.core.js`, falls vorhanden) und benötigte Addons unter
  `vendor/three/…`; Import-Map: `{"imports": {"three": "./vendor/three/three.module.js",
  "three/addons/": "./vendor/three/addons/"}}`.
- Rapier: `@dimforge/rapier3d-compat`, ES-Build (WASM als Base64 eingebettet). Paketstruktur im
  CDN-Listing prüfen (`https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat/`), **alle** vom ES-Build
  importierten Dateien spiegeln; Alternative `npm pack @dimforge/rapier3d-compat`.
- Download: `curl.exe -L -A "Mozilla/5.0" <url> -o <ziel>` (PowerShell 5.1: kein `&&`).
- Versionen in `HANDOVER.md` + ADR; `tools/vendor.ps1` für Reproduzierbarkeit; danach Netzwerk-Tab
  prüfen: nur `127.0.0.1`.

### 6.2 Start-Ritual
Abschnitt 0 (lesen → verstehen → Build verifizieren → Plan fortsetzen). Drei Zeilen im Chat: Stand,
Plan dieser Session, erster Commit.

### 6.3 Arbeits-Loop
- Eine Aufgabe = ein Commit. Vor dem Commit: `git status`, Diff lesen, `node tools/check-all.mjs`,
  `node --test "tests/unit/**/*.test.mjs"`, Seite neu laden (no-store), Konsole leer, sichtbare Änderung per Screenshot,
  `?autoplay=1`, wenn betroffen, Docs aktualisiert.
- Nach jedem Commit: `HANDOVER.md` (Stand, Commit-Hash, nächste Aufgabe) und `ROADMAP.md` (Checkbox);
  Session-Log unter `docs/sessions/` fortschreiben; ADR bei Entscheidungen.
- **Nie länger als ~45 Minuten ohne Commit.** Größere Aufgabe → `wip:`-Commit + Satz in `HANDOVER.md`.
  Kaputte Stände nur committen, wenn ausdrücklich als `wip:` markiert und zur Sicherung nötig.
- Wird der Kontext lang: **zuerst** `HANDOVER.md` vervollständigen und committen, dann weiter.
- Werkzeugfallen: Write/Edit haben große Dateien auf diesem Mount abgeschnitten → kleine Dateien,
  `node --check` nach jedem Edit, bei Verdacht neu schreiben. Git-`index.lock` nur löschen, wenn kein
  Git-Prozess läuft.

### 6.4 End-Ritual
Lauffähiger Stand · Konsole geprüft · Tests grün · `HANDOVER.md` vollständig (inkl. Commit-Hash) ·
`ROADMAP.md` aktuell · Session-Log fertig · Commit · bei Meilenstein `git tag m<n>` · eine klar
beschriebene nächste Aufgabe. Im Chat die Kurzfassung:
```
CURRENT MILESTONE · LAST COMMIT · WORKING FEATURES · KNOWN ISSUES · NEXT TASK · RUN COMMAND
```

---

## 7 · Git-Regeln
Repo-Root ist dieser Ordner; Branch `main`; kein Force-Push, keine History-Umschreibung. Conventional
Commits Englisch (`feat(player): …`, `fix(zipline): …`, `perf(forest): …`, `docs(handover): …`,
`chore(vendor): …`, `wip: …`). **Keine Co-Author-Zeilen, keine „Generated with …“-Zeilen** in Commits,
Code oder Docs. Meilenstein-Tags `m0`…`m3`. Screenshots < 300 KB.

## 8 · Verifikation
Siehe `docs/testing.md`: Syntax-Gate (`node tools/check-all.mjs`), Unit-Tests reiner Logik
(`node --test "tests/unit/**/*.test.mjs"` – RNG, Graph, Generator, Katalog, Save, Zip-Physik, Karabiner-Automat),
Smoke-Checkliste im Browser, optional `node tests/smoke.mjs`, Debug-Overlay für das Performance-Budget,
Review-Schleifen (visuell, Gameplay) vor jedem Meilenstein-Tag. Laufzeitverhalten ist die Wahrheit.

## 9 · Bereits entschieden (nicht neu diskutieren)
Arbeitstitel *Wipfel*; UI Deutsch via i18n; Park fiktiv „Sonnwendberg“; Schulterkamera + Ego;
Smart Belay Standard; Schienen statt Seilphysik; Graph; statisch ohne Build; Python-Server; alles
prozedural (offline gebackene eigene Ausgaben erlaubt); Rapier compat ES-Build; Ticket = 4 Spielstunden
= 40 Minuten; Höhe bleibt knapp; Session-Logs je Datei; Unit-Tests via `node --test`; Parcours-Namen
zusätzlich zu Farbe + Nummer.

**Selbst zu entscheiden – ohne Rückfrage, mit ADR:** Three.js-/Rapier-Version, Figur-Stil,
Baumarten-Mix, Podest-Geometrie, Kamerawerte, Nerven-Parameter, Layout-Seed, Terrain-Parameter.
**Anhalten nur bei:** zwei grundsätzlich verschiedenen Produktrichtungen, irreversiblen/destruktiven
Operationen, zwingend nötigen Nutzereingaben.

## 10 · Definition of Done (pro Aufgabe)
Läuft im Browser über `serve.py` · 0 Konsolenfehler · 0 externe Requests · Syntax-Gate und Unit-Tests
grün · sichtbar/spürbar geprüft (Screenshot bei visuellen Änderungen) · committet · `HANDOVER.md`,
`ROADMAP.md`, Session-Log aktualisiert · kein Platzhalter ohne Eintrag „Offen/Provisorisch“ · keine
Behauptung ohne Nachweis („60 fps“, „fertig“, „animiert“).

## 11 · Erste Session – konkreter Einstieg
1. Abschnitt 0. `git status`, `git log`.
2. `vendor/` befüllen (6.1), `tools/vendor.ps1`, Versionen dokumentieren. Commit `chore(vendor): …`.
3. M0.1 laut `ROADMAP.md`: `index.html`, `css/base.css`, `js/main.js`, `js/config.js`,
   `js/core/loop.js`, `js/core/rng.js`, `js/core/input.js`, `js/core/errors.js`, `js/ui/debug.js`;
   Rapier initialisiert, Boden-Collider, fallende Testkugel, F1-Panel, Fehlerbildschirm;
   `tests/unit/rng.test.mjs`. Commit `feat(core): boot loop with rapier and debug panel`.
4. `HANDOVER.md`, `ROADMAP.md`, `docs/sessions/2026-MM-DD-session-01.md`. Commit `docs(handover): session 1`.
5. Weiter mit M0.2, solange Zeit ist – jede Aufgabe ein Commit; am Ende End-Ritual (6.4).

Wenn irgendetwas in diesem Prompt der Realität widerspricht (Paketstruktur, Dateinamen, Verhalten):
Realität gewinnt, Abweichung als ADR oder in `HANDOVER.md` festhalten, weiter.
