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

---

## Offen (von der jeweiligen Session zu entscheiden und hier einzutragen)
- ADR-013 · Three.js-Version + Addon-Liste · offen
- ADR-014 · Rapier-compat-Version + Vendor-Dateistruktur · offen
- ADR-015 · Figur-Stil und Rig-Ansatz (Posen-Blending vs. leichtes IK) · offen
- ADR-016 · Baumarten-Mix und Blatt-Instancing-Ansatz · offen
- ADR-017 · Podest-Geometrie (Achteck vs. Ring) und Klemmen-Detailgrad · offen
- ADR-018 · Nerven-Parameter (Höhen-Log-Basis, Schwelle, Regenerationsraten) · offen
- ADR-019 · Ob M3 (Betreiber) gebaut wird – Entscheidung nach M1 · offen
