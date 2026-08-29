# DECISIONS – Architektur- und Designentscheidungen (ADR-Log)

Format: `ADR-nnn · Titel · Datum · Status` → Kontext, Entscheidung, Konsequenzen.
Neue Entscheidungen unten anhängen. Geänderte Entscheidungen nicht löschen, sondern mit
„ersetzt durch ADR-nnn“ markieren.

---

## ADR-001 · Statische Website ohne Build · 2026-08-16 · angenommen
**Kontext:** Das Spiel soll mit einem einfachen Python-Server laufen und in vielen kurzen Sessions
gebaut werden; Build-Pipelines waren in Nachbarprojekten eine Fehlerquelle (hängendes `npm install`,
Cache-Fallen). **Entscheidung:** ES-Module mit Import-Map, `vendor/` für Three.js und Rapier compat,
kein Bundler/Transpiler; `package.json` nur mit `"type": "module"` für `node --check`.
**Konsequenzen:** Kein TypeScript, kein Tree-Shaking; Disziplin bei Modulgrenzen und Dateigrößen;
JSDoc für Typen, wo es hilft.

## ADR-002 · Rapier als Physik-Engine, aber nur wo Physik nötig ist · 2026-08-16 · angenommen
**Kontext:** Seil-/Netzphysik als Rigid-Body-Simulation ist teuer, instabil und schwer zu tunen.
**Entscheidung:** Rapier (`@dimforge/rapier3d-compat`, ES-Build mit inline-WASM) für Boden, Podeste,
Character-Controller (KCC), Pendeln im Gurt (Seil-Joint), Tarzansprung, später geteilte
Brückenphysik. **Übungen sind Schienen** (Spline + Feder-Dämpfer-Wackelmodell + 1-D-Balancependel),
Flying Fox ist analytisch (Gefälle, Durchhang, Masse, Wind). **Konsequenzen:** deterministisch,
tunbar, performant; visuelle Überzeugung kommt aus Kamera, Posen-Blending und Ton.

## ADR-003 · Park als Graph · 2026-08-16 · angenommen
**Kontext:** Spieler, NPC-Gäste und später der Builder brauchen dieselbe Beschreibung des Parks.
**Entscheidung:** Podeste = Knoten (Kapazität 3), Übungen = gerichtete Kanten (Kapazität 1),
Bodenknoten, Flying-Fox-Kanten; Warteschlangen entstehen aus Kapazitäten. Park-Definitionen als
JSON unter `assets/parks/`, erzeugt durch einen seeded Layout-Generator, handnachjustierbar.
**Konsequenzen:** Der Builder (M3) ist ein Editor für dieselbe Datenstruktur; `?autoplay=1` ist ein
Agent auf dem Graphen.

## ADR-004 · Alles prozedural · 2026-08-16 · angenommen
**Kontext:** Keine Rechte-Fragen, kein Asset-Download, kleine Repos, konsistenter Look.
**Entscheidung:** Geometrie im Code, Texturen per Canvas2D (Rinde, Holz, Stahl, Seil inkl. Normal-/
Roughness-Maps), Audio per WebAudio-Synthese, UI per HTML/CSS. Generatoren sind seeded und cachen ihr
Ergebnis pro Session. **Konsequenzen:** Startzeit beachten (Generierung ggf. gestaffelt/idle);
Qualität kommt aus Detailarbeit an Generatoren, nicht aus Downloads.

## ADR-005 · Deterministische Simulation · 2026-08-16 · angenommen
**Entscheidung:** seeded RNG (`core/rng.js`), fester Physikschritt 60 Hz, Render-Interpolation,
`?seed=` überschreibt den Seed. `Math.random()` ist in Gameplay/Procgen verboten.
**Konsequenzen:** reproduzierbare Screenshots und Bugs; Smoke-Tests sind stabil.

## ADR-006 · Kamera und Sicht · 2026-08-16 · angenommen
**Entscheidung:** Schulterkamera als Standard (Körper und Füße sichtbar – nötig für Balance-Lesbarkeit),
Ego umschaltbar, automatisch Ego im Flying Fox. Blick nach unten erhöht die Nerven.

## ADR-007 · Sicherung als Modi · 2026-08-16 · angenommen
**Entscheidung:** Drei Modi nach den realen Sicherungsgenerationen: Durchlaufend (kein Umhängen,
kein Überholen), Smart Belay (Standard, Zwei-Klick-Ritual, Reihenfolge erzwungen), Klassisch (beide
Karabiner frei, Absturz bei Doppel-Aushängen beendet den Run, Handbremse am Flying Fox).

## ADR-008 · Ticket = 4 Spielstunden = 40 Minuten real · 2026-08-16 · angenommen
**Entscheidung:** 1 Spielstunde = 10 Minuten; letzter Einlass 2 h vor Schluss; Verlängerung
„+30 min für 5 €“ als Spielangebot; Saisonpass = offener Modus ohne Uhr (ab M2).

## ADR-009 · UI-Sprache Deutsch, Code Englisch · 2026-08-16 · angenommen
**Entscheidung:** UI-Strings in `assets/strings/de.json` (Parkvokabular ist Teil des Designs),
`en.json` folgt; Code/Kommentare/Commits Englisch. **Konsequenz:** keine hart kodierten Strings.

## ADR-010 · Erster Park fiktiv · 2026-08-16 · angenommen
**Entscheidung:** „Waldseilpark Sonnwendberg“ zitiert die Kahlenberg-Situation (Südhang, Skyline,
Hütte, 5/6/4 Parcours, 20 m, 150-m-Flying-Fox), verwendet aber keine realen Marken/Namen.

## ADR-011 · Höhe bleibt knapp · 2026-08-16 · angenommen
**Entscheidung:** Kein Parcours über 20 m vor M2, keine Fantasie-Regionen vor dem letzten Kapitel.
Das Nerven-Modell funktioniert nur, wenn Höhe selten ist.

## ADR-012 · Handover-Protokoll · 2026-08-16 · angenommen
**Entscheidung:** Eine Aufgabe = ein Commit (≤ 45 min); `HANDOVER.md` und `docs/SESSIONS.md` nach jedem
Commit; `wip:`-Commits bei Abbruchgefahr; Meilenstein-Tags; keine Co-Author-/„Generated with“-Zeilen.

## ADR-020 · Offline gebackene eigene Ausgaben unter `assets/generated/` erlaubt · 2026-08-16 · angenommen
**Kontext:** Abgleich mit externem Master-Prompt. Manche Generatoren (große Texturen, Bake-Tabellen)
kosten Startzeit. **Entscheidung:** Ausgaben eigener `tools/`-Skripte (auch Python) dürfen unter
`assets/generated/` liegen – reproduzierbar, mit Generator, Seed, Auflösung, Zweck dokumentiert.
Fremde Assets bleiben verboten; Laufzeit-Generierung bleibt der Standard. **Alternativen:** alles zur
Laufzeit (Startzeit), fremde Asset-Packs (abgelehnt). **Konsequenzen:** `assets/generated/README.md`
führt Provenienz.

## ADR-021 · Session-Logs je Datei · 2026-08-16 · angenommen
**Entscheidung:** pro Session `docs/sessions/YYYY-MM-DD-session-NN.md` (Vorlage
`docs/sessions/README.md`), `docs/SESSIONS.md` als Index. Alte Logs werden nie überschrieben.
**Alternativen:** eine wachsende Datei (Merge-/Größenprobleme). **Konsequenzen:** reichere Logs
(Dateien geändert, Tests, Performance, Screenshots) ohne Konflikte.

## ADR-022 · Unit-Tests reiner Logik via `node --test` · 2026-08-16 · angenommen
**Entscheidung:** Node-eigener Test-Runner ohne Dependencies für RNG, Graph, Generator, Katalog,
Save, Zip-Physik, Karabiner-Automat; Logik so schneiden, dass sie ohne DOM/WebGL testbar ist.
**Alternativen:** kein Test-Runner (nur Smoke), Jest/Vitest (Dependencies). **Konsequenzen:**
Generator-Validität und Determinismus sind maschinell geprüft, nicht nur „gesehen“.

## ADR-023 · Parcours-Namen zusätzlich zu Farbe + Nummer · 2026-08-16 · angenommen
**Kontext:** Der Kahlenberg nummeriert nur; andere Parks benennen (Anif: Berge, Freischütz: Gebirge,
Kloten: „007“). **Entscheidung:** „Farbe + Nummer · Name“ (z. B. „Rot 3 · Grat“) – System bleibt
lesbar, Namen bleiben im Gedächtnis. **Konsequenzen:** Schilder zeigen Form + Farbe + Nummer + Name.

## ADR-024 · Prioritätsreihenfolge bei Zielkonflikten · 2026-08-16 · angenommen
**Entscheidung:** Korrektheit → Spielgefühl → stabile Physik → Lesbarkeit → Architektur → visuelle
Qualität → Inhaltsmenge → Politur (siehe `ROADMAP.md`). Nie funktionierende Steuerung für schönere
Vegetation opfern.

## ADR-025 · Visuelles Ziel = Gameplay-Mockup 1:1 · 2026-08-16 · angenommen
**Kontext:** Manuel hat ein Konzeptbild vorgegeben („So ca. sollte das Gameplay ausschauen – 1:1“),
beschrieben in `docs/reference/mockup/README.md`. **Entscheidung:** HUD-Layout, Kategorien, Kamera,
Figur und Bildanmutung des Mockups sind verbindlich: Routen-Header (Farbbalken, Kategorie, Name,
Fortschritt, Zeit, Bestzeit), Flow unten Mitte, Zipline-Overlay mit Tacho, Course Map als Overlay,
Start-Banner mit Kennzahlen und Countdown, Sicherheits-Tooltip; **stylized realism statt Low-Poly**
(PBR, dichte Kiefern, Nebeltiefe, Streiflicht). Wipfel-Eigenes bleibt, wo es nicht widerspricht
(Karabiner-Widget, Kraft-Ring, Herzschlag, Ticket-Uhr, Nerven, Modi, Betreiber-Akt). Berge/Wasserfall
und 32-m-Routen des Mockups gehören zu späteren Kapiteln; Kapitel 1 bleibt Sonnwendberg ≤ 20 m
(ADR-011). **Konsequenzen:** höhere Anforderungen an Procgen-Qualität (Blattmassen, Materialien),
Zeit/Bestzeit immer sichtbar.

## ADR-026 · UI-Sprache Englisch als Standard, Deutsch vollständig · 2026-08-16 · ersetzt ADR-009
**Kontext:** Das Mockup ist englisch; Manuels andere Projekte nutzen englische UI-Texte; das
Parkvokabular soll trotzdem erhalten bleiben. **Entscheidung:** `assets/strings/en.json` ist die
Standardsprache, `de.json` eine vollständige zweite Sprache (Podest, Umhängen, Blau/Rot/Schwarz …),
umschaltbar in den Optionen. Code/Kommentare/Commits bleiben Englisch. **Konsequenzen:** jede
UI-Zeichenkette in beiden Dateien; Routen-Namen zweisprachig.

## ADR-027 · Kategorien Green · Blue · Red · Black · Legendary · 2026-08-16 · angenommen
**Entscheidung:** fünf Kategorien wie im Mockup und wie in vielen Parks: **Green** = Kinder-/Einsteiger-
und Übungsparcours (Wichtel + Einweisung, ≤ 3 m), **Blue** leicht, **Red** mittel, **Black** schwer,
**Legendary** versteckt/extrem. Der Kahlenberg selbst hat nur Blau/Rot/Schwarz (+ Wichtel) – Green fasst
Wichtel + Übungsparcours. Farbe immer mit Form/Icon (◈ ◆ ◐ ◆ ✦ bzw. ● ■ ◆).

## ADR-028 · M3 wird gebaut · 2026-08-25 · angenommen
**Kontext:** ADR-019 vertagte die Entscheidung auf „nach M1“. Manuel hat am 2026-08-25 beauftragt,
alle Meilensteine vollständig umzusetzen. **Entscheidung:** M3 (Betreiber-Akt) wird gebaut – Builder,
Gäste-Simulation, Begehungspflicht, Inspektionen, Ökonomie, Teilen. **Konsequenzen:** der Park-Graph
(ADR-003) ist die gemeinsame Datenstruktur; der Builder schreibt, was der Generator (M1.1) erzeugt.

## ADR-029 · M4-Koop ist lokal, Teilen ist dateibasiert · 2026-08-25 · angenommen
**Kontext:** ADR-001 (statische Site, kein Backend) schließt Server für Matchmaking/Signaling aus;
echtes Online-Koop und ein Online-Parcours-Marktplatz sind damit nicht ehrlich lieferbar.
**Entscheidung:** M4 = **lokales Koop** (2 Spieler an einem Gerät: Gamepad + Tastatur/Maus, geteilte
Kamera oder Splitscreen nach Machbarkeit), geteilte Brückenphysik, Koop-Übungen, NPC-Zuschauer-Rufe;
„Teilen“ = Park-/Parcours-Export als JSON-Datei bzw. Code zum Einfügen (Import validiert wie der
Generator). **Alternativen:** WebRTC-P2P (braucht Signaling-Server – abgelehnt), eigener Server
(ADR-001-Bruch – abgelehnt). **Konsequenzen:** Bestenlisten bleiben lokal pro Gerät.

---

## Offen (von der jeweiligen Session zu entscheiden und hier einzutragen)
- ADR-013 · Three.js 0.185.1 (`three.module.js` + `three.core.js`, Addons einzeln bei Bedarf) · 2026-08-17 · angenommen
- ADR-014 · @dimforge/rapier3d-compat 0.20.0 (`dist/rapier.mjs`, WASM inline, keine relativen Imports) · 2026-08-17 · angenommen
- ADR-015 · Figur-Stil und Rig-Ansatz (Posen-Blending vs. leichtes IK) · offen
- ADR-016 · Baumarten-Mix und Blatt-Instancing-Ansatz · offen
- ADR-017 · Podest-Geometrie (Achteck vs. Ring) und Klemmen-Detailgrad · offen
- ADR-018 · Nerven-Parameter (Höhen-Log-Basis, Schwelle, Regenerationsraten) · offen
- ~~ADR-019~~ → entschieden, siehe ADR-028
