# WIPFEL – Master-Prompt für Claude Code

Du baust **Wipfel**, ein Kletterwald-Spiel im Browser: Three.js + Rapier, reine statische Website
(HTML/CSS/JS/Assets getrennt), keine Build-Pipeline, ausgeliefert über einen einfachen Python-Server,
alle Assets prozedural erzeugt – aber in hoher, fast detailgetreuer Qualität. Das Projekt wird über
viele Sessions gebaut. Jede Session kann jederzeit abbrechen. Deshalb gilt: **kleine Schritte, häufige
Commits, HANDOVER.md immer aktuell.** Eine neue Session muss ohne Vorwissen weiterarbeiten können.

Ordner: `C:\repos\game-remakes\wipfel\` (dieses Verzeichnis). Sprache im Chat: Deutsch. Code,
Kommentare, Commit-Messages: Englisch. UI-Texte im Spiel: Deutsch (i18n-Datei, Englisch folgt später).

---

## 0 · Einlesen – in dieser Reihenfolge, bevor du irgendetwas änderst

1. `CLAUDE.md` – die dauerhaften Regeln dieses Ordners (kurz).
2. `HANDOVER.md` – **der aktuelle Stand**: was funktioniert, was kaputt ist, die nächsten drei Aufgaben.
3. `docs/SESSIONS.md` – der oberste Eintrag ist die letzte Session; er nennt Fallen und Zwischenstände.
4. `docs/GDD.md` – das Spielkonzept (was gebaut wird und warum). Bei Detailfragen: `docs/reference/wipfel-gdd.html`.
5. `docs/RESEARCH-DATA.md` – die realen Zahlen und Regeln echter Kletterwälder, die das Spiel nachbildet.
6. `docs/DECISIONS.md` – getroffene Architektur-/Designentscheidungen (ADR-Log). Nicht neu diskutieren, sondern anwenden; neue Entscheidungen dort ergänzen.

Dann: `git status` und `git log --oneline -8`. Wenn es uncommittete Änderungen gibt, zuerst verstehen (Diff lesen), dann entscheiden: committen oder verwerfen – nie stillschweigend weiterarbeiten.

---

## 1 · Was gebaut wird

Ein Third-Person-Kletter-/Balance-Spiel in einem Waldseilpark. Man steigt über Stahlleitern auf
Holzpodeste an lebenden Bäumen, überquert Übungen (Seilbrücken, hängende Planken, Netze, Fässer,
Hangelstrecken, Tarzansprung), ist dabei mit zwei kommunizierenden Rollenkarabinern in ein
Sicherungsseil eingehängt (Umhängen an jedem Podest: Klick – Klick), verwaltet drei Ressourcen
(Gleichgewicht, Kraft, Nerven) und fährt am Ende jedes Parcours mit dem Flying Fox zurück auf den Boden.
Ein Ticket ist ein Run von vier Spielstunden. Farben sind Tore: Blau → Rot → Schwarz. Später (M3) kommt
der Betreiber-Akt: Park bauen, Gäste simulieren, Parcours selbst begehen, bevor sie öffnen.

Der erste Park ist der fiktive **„Waldseilpark Sonnwendberg“**: ein Südhang über einer Stadt mit
Skyline im Dunst, Buchen und Eichen, Hütte, Übungsparcours am Eingang, 2 Wichtelparcours,
5 blaue (3,5–7 m), 6 rote (3,5–10 m), 4 schwarze Parcours (bis 20 m), ~150 Übungen, jeder Parcours
endet mit einem Flying Fox, der längste 150 m aus 20 m Höhe Richtung Stadt. Er zitiert die
Kahlenberg-Situation, ohne die Marke zu verwenden.

**Nicht-Ziele (vorerst):** Multiplayer-Netzcode, Fantasie-Regionen jenseits realer Vorbilder,
RPG-Statistiken, Kauf-/Monetarisierungslogik, Cloud-Saves, mobile Touch-Steuerung vor M2.

---

## 2 · Harte Rahmenbedingungen

1. **Statische Website, kein Build.** `index.html` + `css/` + `js/` (ES-Module) + `assets/` + `vendor/`.
   Kein Bundler, kein Transpiler, kein npm im Laufzeitpfad. `package.json` existiert nur mit
   `"type": "module"` (damit `node --check` ES-Module parst) und ohne Dependencies.
2. **Keine externen Requests.** Three.js und Rapier werden nach `vendor/` gespiegelt (siehe 6.1).
   Im Netzwerk-Tab des Browsers dürfen nur `127.0.0.1`-Requests erscheinen. Keine CDN-Links, keine Webfonts.
3. **Server: `python serve.py`** (liegt bereits hier; Port 8200, `Cache-Control: no-store`, richtige
   MIME-Types für `.js/.mjs/.wasm/.json`). Alternativ ist `python -m http.server` erlaubt, aber
   `serve.py` ist der Standard, weil Chrome sonst ES-Module aus dem Disk-Cache liefert (bekannte Falle).
4. **Physik: Rapier** (`@dimforge/rapier3d-compat`, ES-Build mit inline-WASM). Rapier steuert Boden,
   Podeste, Character-Controller, Pendeln im Gurt, Tarzansprung, später geteilte Brückenphysik.
   Übungen selbst sind **Schienen mit Wackelmodell, keine Rigid-Body-Seilphysik** (siehe 3.2).
5. **Alle Assets prozedural.** Geometrie im Code (Bäume, Podeste, Seile, Übungen, Figur, Karabiner),
   Texturen per Canvas2D/Offscreen (Rinde, Holzmaserung, verzinkter Stahl, Seil – mit Normal- und
   Roughness-Maps), Audio per WebAudio-Synthese, UI per HTML/CSS. Keine Bilddateien, keine
   Audiodateien, keine 3D-Dateien von Dritten. `assets/` enthält Daten (Park-Definitionen,
   Übungskatalog, Strings), keine Binärmedien.
6. **Qualität: fast detailgetreu.** Maße, Proportionen, Materialien und Regeln folgen echten Parks
   (`docs/RESEARCH-DATA.md`). Kein Platzhalter-Würfel bleibt im Spiel. Wenn etwas noch grob ist,
   steht es als offener Punkt in `HANDOVER.md`.
7. **Performance-Budget:** ≥ 55 fps bei 1080p auf einer integrierten GPU der letzten Jahre,
   < 300 Draw-Calls, Instancing für Bäume/Blätter/Planken, keine Allokationen im Frame-Loop,
   Physik mit festem Schritt (60 Hz) und Render-Interpolation.
8. **Dateigröße:** keine JS-Datei über ~400 Zeilen; eine Datei = eine Verantwortung. Beim Anwachsen
   aufteilen, nicht anhängen.
9. **Sprache:** Code/Kommentare/Commits Englisch. UI-Strings ausschließlich über `assets/strings/de.json`
   (später `en.json`), nie hart im Code.

---

## 3 · Architektur

### 3.1 Ordnerstruktur (Soll)

```
wipfel/
  index.html                 Shell, Import-Map, Canvas, UI-Container
  serve.py                   Dev-/Deploy-Server (Python)
  css/                       base.css (Tokens, Typografie), hud.css, screens.css, builder.css
  js/
    main.js                  Boot: RAPIER.init → Renderer → Welt → Spieler → Loop
    core/                    loop.js, input.js (Gamepad + Tastatur/Maus), store.js, events.js, rng.js, i18n.js, save.js
    world/                   terrain.js, forest.js (Instancing, LOD), sky.js, wind.js, lighting.js, skyline.js
    procgen/                 textures/*.js (Canvas-Generatoren), geometry/*.js (Baum, Podest, Seil, Leiter…), materials.js
    park/                    graph.js (Knoten/Kanten), loader.js, catalog.js, layout.js (Seed-Generator), rules.js
    elements/                element.js (Basis: Spline + Wackelmodell), bridge.js, plank.js, net.js, barrel.js, hangel.js, tarzan.js, ladder.js, zipline.js
    player/                  controller.js (Rapier-KCC), climber.js (Schienen-Fortbewegung), balance.js, stamina.js, nerves.js, belay.js, fall.js, camera.js, rig.js (Figur, Posen)
    npc/                     agents.js (Gäste auf dem Graphen, Warteschlangen)
    zipline/                 physics.js (analytisch), brakes.js
    audio/                   synth.js, sfx.js, ambience.js, heartbeat.js, music.js
    ui/                      hud.js, parkplan.js, kassa.js, briefing.js, summary.js, debug.js
    builder/                 (ab M3)
  assets/
    parks/sonnwendberg.json  Park-Definition (Bäume, Podeste, Übungen, Flying Foxes, Farben)
    catalog/elements.json    Übungsfamilien mit Achsenprofilen (physisch/koordinativ/psychologisch/technisch)
    strings/de.json          UI-Texte
  vendor/three/, vendor/rapier/
  tests/smoke.mjs            optionaler Headless-Smoke-Test (Node + playwright-core)
  tools/                     vendor.ps1 / vendor.sh, Bake-Skripte
  docs/                      GDD.md, RESEARCH-DATA.md, DECISIONS.md, SESSIONS.md, screenshots/, reference/
  HANDOVER.md · CLAUDE.md · PROMPT.md · README.md · package.json · .gitignore · .claude/launch.json
```

### 3.2 Leitentscheidungen (Details in `docs/DECISIONS.md`)

- **Übungen sind Schienen.** Jede Übung = CatmullRom-Spline zwischen zwei Podest-Ankern + Wackelmodell
  (Feder-Dämpfer in 1–2 Achsen, angeregt durch Schrittfrequenz, Tempo, Wind) + Handkontakt-Angebot
  (Halteseile ja/nein, Höhe) + Achsenprofil (0–5 je Achse) + Länge/Dauer. Der Spieler ist ein
  Parameter `t` entlang der Schiene; das Gleichgewicht ist ein 1-D-Pendel; überschreitet der Ausschlag
  die Toleranz, startet die Sturzsequenz. Netze, Fässer, Planken animieren prozedural aus derselben
  Anregung. Rapier kommt erst beim Sturz (Pendel im Gurt: Seil-Joint zum Sicherungsseil-Anker),
  beim Tarzansprung und beim Gehen auf Boden/Podest ins Spiel.
- **Der Park ist ein Graph.** Podeste = Knoten (Kapazität 3), Übungen = gerichtete Kanten (Kapazität 1),
  Bodenknoten, Flying-Fox-Kanten, Kreuzungspodeste (ab M2). Spieler und NPC-Gäste benutzen denselben
  Graphen; Warteschlangen entstehen aus den Kapazitäten, nicht aus KI. Der Builder (M3) schreibt
  denselben Graphen.
- **Deterministik.** Ein seeded RNG (`core/rng.js`, sfc32/mulberry32) für Prozedurales und Simulation;
  `Math.random()` ist im Gameplay- und Procgen-Code verboten. `?seed=` erzwingt einen Seed.
- **Ein Store.** Persistenter Zustand in `core/store.js`, Save als `localStorage['wipfel-save-v1']`,
  Änderungen additiv mit Defaults (Migrationsgedanke).
- **Debug-Hooks von Anfang an.** `?debug=1` (Stats, Collider, Schienen, Achsen-Overlay),
  `?autoplay=1` (ein Bot begeht den M0-Parcours – Grundlage für Smoke-Tests), `?fast=1` (Zeitraffer).
  Ein einziger globaler Namespace `window.WIPFEL` nur für Debug.
- **Kamera:** Schulterkamera Standard, Ego umschaltbar, Ego automatisch im Flying Fox.

---

## 4 · Qualitätsmaßstab „fast detailgetreu“

Prüfe jede sichtbare oder spürbare Sache gegen diese Liste (Zahlen aus `docs/RESEARCH-DATA.md`):

- **Bäume:** Buchen/Eichen-Charakter, Stamm 0,4–0,9 m Durchmesser, 18–30 m hoch, prozedurale Rinde
  mit Normal-Map, Astwerk (leichtes L-System), Blattmassen als instanzierte Karten/Cluster mit Wind;
  Wald am Hang, LOD nach Distanz.
- **Podeste:** Holzringe/Achtecke um den Stamm, 2,0–2,6 m Durchmesser, Planken 20–25 cm, sichtbare
  Klemmbefestigung (Holzklötze/Spindeln, Schutzmanschetten, **keine Schrauben im Stamm**), Höhen nach
  Farbe (blau 3,5–7 m, rot 3,5–10 m, schwarz bis 20 m). Kapazität 3.
- **Seile:** 12-mm-Stahl mit Katenarien-Durchhang, Pressklemmen an den Enden, Baumschutz an den
  Ankern; **Tragseil der Übung und Sicherungsseil getrennt**, das Sicherungsseil 1,7–2,3 m über der
  Trittebene, um den Stamm zur nächsten Übung geführt. Metallisches Material mit feinem Glanz.
- **Übungen:** Familien und Verhalten wie im GDD; Planken 20 cm; Burma-Brücke = ein Trittseil + zwei
  Halteseile auf ~1,1 m; Netze mit 10–15-cm-Maschen; Fässer rollen; Ringe/Hangelleitern; Tarzanseil
  ins Fangnetz; Stahlleitern mit 30-cm-Sprossen. Eine Person pro Übung, Einbahn.
- **Sicherung:** Y-Verbindungsmittel mit Bandfalldämpfer-Paket und zwei Rollenkarabinern (sichtbar an
  der Figur), Zustände eingehängt / offen / verriegelt mit zwei unterschiedlichen Klicks. Komplettgurt,
  Helm. Modi: Durchlaufend / Smart Belay (Standard) / Klassisch (siehe GDD).
- **Figur:** prozedurale Low-Poly-Menschfigur mit Posen-Blending (kein Voll-IK nötig), Hand-Ankerpunkte
  an Halteseilen, Füße auf der Schiene, Kopf folgt Blick; Größenklassen 110/130/150/Erwachsen
  beeinflussen Freigabe und Zip-Geschwindigkeit.
- **Flying Fox:** 3–6 % Gefälle, ~2 % Durchhang belastet, Geschwindigkeit nach Masse und Wind,
  Bremsentypen (Gravitation, Federblock, Netz, Wirbelstrom), Landezone mit Hackschnitzeln oder Podest.
- **Regeln:** 1 pro Übung, 3 pro Podest, Einbahn, Ticket 4 Spielstunden (1 Spielstunde = 10 Minuten
  real), letzter Einlass 2 h vor Schluss, Freigaben nach Größenklasse.
- **Nerven-Modell:** steigt mit Höhe (log), Ausgesetztheit, Schwingung, Böen, Blick nach unten, Zeit
  auf der Übung; sinkt auf Podest, beim Atmen, bei Handkontakt, je geschaffter Übung; wirkt als
  Kamera-Atmen, Hand-Zittern (Balance-Rauschen), Tiefpass im Ton, Herzschlag; über der Schwelle
  friert der Körper ein, bis drei Atemzüge vergangen sind. Kein Balken im HUD – Herzschlag.
- **Audio (Synthese):** zwei Karabiner-Klicks, Trolley-Sirren mit Tempo, Seil-Summen unter Last, Wind
  nach Höhe, Vögel, ferne Stadt, Kinderrufe von unten, Herzschlag, Atem; Musik nur an Kassa, Podest bei
  Sonnenuntergang, Stempelkarte.
- **UI:** diegetisch, Parkbeschilderungs-Optik (Holzbrett, laminierte Blätter, Farbplaketten mit
  Formen ● ■ ◆ für Farbsehschwäche), Karabiner-Widget, Kraft-Ring, Herzschlag, Ticket-Uhr,
  Parcours-Chip, Kontext-Prompt. Wireframes: `docs/reference/wipfel-gdd.html`, Abschnitt 5.

---

## 5 · Meilensteine

Jede Aufgabe ist so geschnitten, dass sie in ≤ 45 Minuten Arbeit fertig und committet ist.
Akzeptanzkriterien sind verbindlich; abgehakt wird in `HANDOVER.md`.

### M0 · „Ein Brett“ – ein blauer Parcours, der sich richtig anfühlt
1. **Bootstrap:** Git-Repo prüfen/initialisieren, `vendor/` befüllen (6.1), `index.html` mit Import-Map,
   `js/main.js` mit `RAPIER.init()`, Renderer, Loop, `?debug=1`-Panel, `serve.py` läuft, Seite lädt
   ohne Konsolenfehler und ohne externe Requests. Commit.
2. **Weltausschnitt:** Hang-Terrain (Heightmap prozedural), 40–60 instanzierte Bäume mit Rinde und
   Blattmassen, Himmel, Sonne/Schatten, Wind auf den Kronen, ferne Skyline-Silhouette. Commit.
3. **Spieler am Boden:** Rapier-Character-Controller, Schulterkamera, prozedurale Figur mit Gurt/Helm,
   Gamepad + Tastatur/Maus. Commit.
4. **Podest + Leiter + Umhängen:** Stahlleiter (Schiene), Podest mit Collider und Klemmen, Sicherungsseil
   um den Stamm, Karabiner-Zustandsautomat mit dem Zwei-Klick-Ritual, HUD-Karabiner-Widget, Klicks. Commit.
5. **Erste Übungen auf Schienen:** Burma-Brücke, hängende Planken, Netz – Wackelmodell, Balance-Pendel,
   Kraft, Nerven; Sturz in den Gurt (Rapier-Pendel), Hochziehen, Hangeln zum Podest, Retter-Reset. Commit.
6. **Flying Fox:** analytische Fahrt, Ego-Kamera, Wind/Gewicht, Netzbremse mit „Beine hoch“, Landung.
   Commit.
7. **HUD v1, Atmen, Tuning-Pass, `?autoplay=1`-Bot, Screenshots nach `docs/screenshots/m0-*.png`,
   Smoke-Test.** Tag `m0`.

**Akzeptanz M0:** Ein blauer Parcours (Leiter → 5 Übungen → Flying Fox) ist Start bis Ziel spielbar,
60 fps, 0 Konsolenfehler, 0 externe Requests; die drei Ressourcen sind spürbar; das Umhängen ist ein
Ritual, kein Menü; ein Tester lehnt sich vor dem Bildschirm zur Seite, wenn die Planke kippt.

### M1 · „Ein Ticket“ – ein Run
Park-Definition `assets/parks/sonnwendberg.json` mit Layout-Generator (Seed) für 6 Parcours (2 blau,
2 rot, 2 schwarz) + Übungsparcours; Kassa (Ticketart, Größenklasse, Modus), Einschulung als
Trainer-Dialog + Übungsparcours in 1 m Höhe, Parkplan-Tafel, Ticket-Uhr, NPC-Gäste mit Podest-/
Übungsregeln (Warteschlangen), Farbfreigaben, Stempelkarte, Save. Akzeptanz: ein Run dauert 30–40
Minuten und man will „noch eine halbe Stunde“. Tag `m1`.

### M2 · „Ein Park“
15 Parcours + 2 Wichtel, Kreuzungspodeste, Saisonpass-Modus (offen), Zeitläufe, Flow-Multiplikator
(nur bei ruhigen Nerven), Meisterschaftsstufen je Parcours, Nachtklettern (Stirnlampe), drei
Sicherungsmodi, Fotos, Politur, Touch-Steuerung. Tag `m2`.

### M3 · „Der Betreiber“ (Entscheidung nach M1, ADR schreiben)
Builder (Bäume mit Gutachten, Podeste, Übungskatalog, Flying-Fox-Werkzeug mit Gefälle/Bremse),
Gäste-Simulation, Begehung als Freigabepflicht, Inspektionen, Wetter, Ökonomie, Teilen von Parcours.

---

## 6 · Arbeitsprotokoll je Session

### 6.1 Vendoring (nur in Session 1 bzw. bei Versionswechsel)
- Three.js: ES-Build `three.module.js` (+ `three.core.js`, falls die Version ihn hat) und die
  benötigten Addons unter `vendor/three/…`; Import-Map in `index.html`:
  `{"imports": {"three": "./vendor/three/three.module.js", "three/addons/": "./vendor/three/addons/"}}`.
- Rapier: `@dimforge/rapier3d-compat`, ES-Build (WASM ist als Base64 eingebettet, deshalb ohne
  Bundler lauffähig). Struktur des Pakets im CDN-Listing prüfen
  (`https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat/`), **alle** Dateien spiegeln, die der
  ES-Build importiert. Alternative: `npm pack @dimforge/rapier3d-compat` und entpacken.
- Download mit `curl.exe -L -A "Mozilla/5.0" <url> -o <ziel>` (PowerShell 5.1: kein `&&`, kein
  `Invoke-WebRequest` gegen Cloudflare-Seiten – TLS-Fingerprint-Block).
- Versionen in `HANDOVER.md` und `docs/DECISIONS.md` festhalten; `tools/vendor.ps1` schreiben, damit
  es reproduzierbar ist. Danach im Browser prüfen: Netzwerk-Tab nur `127.0.0.1`.

### 6.2 Start-Ritual (jede Session)
1. Einlesen laut Abschnitt 0. `git status`, `git log --oneline -8`.
2. `python serve.py` starten (oder Browser-Pane über `.claude/launch.json`, Konfiguration „wipfel“),
   `http://127.0.0.1:8200/` öffnen, Screenshot, Konsole lesen. Stimmt der Zustand mit `HANDOVER.md`
   überein? Wenn nicht: zuerst `HANDOVER.md` korrigieren.
3. Drei Zeilen im Chat: Was ist der Stand, was mache ich in dieser Session, was ist das erste Commit.

### 6.3 Arbeits-Loop
- Eine Aufgabe = ein Commit. Vor dem Commit: `node --check` für jede geänderte JS-Datei, Seite neu
  laden (no-store), Konsole leer, sichtbare Änderung per Screenshot geprüft, `?autoplay=1`-Smoke, wenn
  betroffen.
- Nach jedem Commit: `HANDOVER.md` (Abschnitte „Stand“, „Checkliste“, „Nächste Schritte“) und
  `docs/SESSIONS.md` (Stichpunkt) aktualisieren, in **denselben** Commit oder direkt danach.
- **Nie länger als ~45 Minuten ohne Commit.** Wenn eine Aufgabe größer wird: WIP-Commit mit Präfix
  `wip:` und einem Satz in `HANDOVER.md`, was fehlt.
- Wenn du merkst, dass der Kontext lang wird oder die Session enden könnte: **zuerst** `HANDOVER.md`
  vervollständigen und committen, dann weiterarbeiten.
- Werkzeugfallen: Große Dateien wurden auf diesem Windows-Mount schon durch Write/Edit abgeschnitten –
  deshalb kleine Dateien, nach jedem Edit `node --check`, bei Verdacht Datei neu schreiben.
  Git-`index.lock` kann hängen bleiben – dann `git status` prüfen und den Lock nur löschen, wenn kein
  Git-Prozess läuft.

### 6.4 End-Ritual
`HANDOVER.md` vollständig (Zustand, was funktioniert, was kaputt ist, nächste drei Aufgaben, offene
Entscheidungen, Fallen), `docs/SESSIONS.md`-Eintrag oben ergänzt (Datum, Ziele, erledigt, Commits,
Fallen), letzter Commit, bei Meilenstein `git tag m<n>`. Im Chat: drei Zeilen Zusammenfassung + der
erste Schritt für die nächste Session.

---

## 7 · Git-Regeln
- Repo-Root ist dieser Ordner; Branch `main`; niemals Force-Push, niemals History umschreiben.
- Conventional Commits auf Englisch: `feat(player): …`, `fix(zipline): …`, `docs(handover): …`,
  `chore(vendor): …`, `wip: …`.
- **Keine Co-Author-Zeilen, keine „Generated with …“-Zeilen** in Commits, Code oder Docs.
- `.gitignore`: `node_modules/`, `.playwright-mcp/`, `tests/out/`, `*.log`, `.DS_Store`, `Thumbs.db`.
  Screenshots unter `docs/screenshots/` sind klein zu halten (< 300 KB, JPG/PNG).
- Meilenstein-Tags `m0`, `m1`, `m2`, `m3`.

---

## 8 · Verifikation
- `node --check <datei>` nach jedem Edit (funktioniert für ES-Module dank `"type": "module"`).
- Live: `python serve.py` → `http://127.0.0.1:8200/`; Browser-Pane von Claude Code oder Playwright-MCP
  für Screenshots; Konsole muss leer sein (0 Fehler, 0 Warnungen im normalen Spiel).
- `tests/smoke.mjs`: Node-Skript, das den Server startet und mit `playwright-core` (falls installiert;
  sonst dokumentiert überspringen) die Seite lädt, `?autoplay=1` durchlaufen lässt, Konsolenfehler und
  externe Requests zählt und einen Screenshot nach `tests/out/` schreibt.
- Performance im `?debug=1`-Panel (fps, Draw-Calls, Physik-Zeit) – Budget siehe 2.7.
- Screenshots als Nachweis in `docs/screenshots/<meilenstein>-<nr>-<thema>.png`, in `HANDOVER.md` verlinkt.

---

## 9 · Bereits entschieden (nicht neu diskutieren)
Arbeitstitel *Wipfel*; UI Deutsch via i18n; Park fiktiv „Sonnwendberg“ mit Kahlenberg-Situation;
Schulterkamera + Ego-Umschaltung; Smart Belay als Standardmodus; Schienen statt Seilphysik; Graph für
Park und Gäste; statische Website ohne Build; Python-Server; alles prozedural; Rapier compat ES-Build;
Ticket = 4 Spielstunden = 40 Minuten; Höhe bleibt knapp (kein Park über 20 m vor M2, keine
Fantasie-Regionen vor dem letzten Kapitel).

**Selbst zu entscheiden – ohne Rückfrage, aber mit ADR in `docs/DECISIONS.md`:** exakte Three.js-/
Rapier-Version, Figur-Stil, Baumarten-Mix, Podest-Geometrie, Kamerawerte, Nerven-Parameter, Layout-
Seed. Entscheiden, festhalten, weiter.

---

## 10 · Definition of Done (pro Aufgabe)
Läuft im Browser über `serve.py` · 0 Konsolenfehler · 0 externe Requests · `node --check` grün ·
sichtbar/spürbar geprüft (Screenshot bei visuellen Änderungen) · committet · `HANDOVER.md` und
`docs/SESSIONS.md` aktualisiert · kein Platzhalter ohne Eintrag in „Offene Punkte“.

---

## 11 · Erste Session – konkreter Einstieg
1. Abschnitt 0 lesen, `git status`, `git log`.
2. `vendor/` befüllen (6.1), `tools/vendor.ps1` schreiben, Versionen dokumentieren. Commit `chore(vendor): …`.
3. `index.html`, `css/base.css`, `js/main.js`, `js/core/loop.js`, `js/core/input.js`, `js/ui/debug.js`:
   Rapier initialisiert, leere Szene mit Boden-Collider und Testkugel, die fällt; `?debug=1` zeigt fps.
   Commit `feat(core): boot loop with rapier and debug panel`.
4. `HANDOVER.md` auf Stand bringen (Session 1), `docs/SESSIONS.md`-Eintrag. Commit `docs(handover): session 1`.
5. Weiter mit M0-Aufgabe 2 (Weltausschnitt), solange Zeit ist – jede Aufgabe ein Commit.

Wenn irgendetwas in diesem Prompt der Realität widerspricht (Paketstruktur, Dateinamen, Verhalten):
Realität gewinnt, Abweichung in `docs/DECISIONS.md` oder `HANDOVER.md` festhalten, weiter.
