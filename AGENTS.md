# AGENTS.md – Wipfel

Regeln für jeden Coding-Agenten (Claude Code, Codex, Cursor, Aider …), der in diesem Ordner arbeitet.
`CLAUDE.md` ist die Claude-spezifische Fassung; bei Widerspruch gilt `PROMPT.md`.

## Start jeder Session
```
pwd · git status · git log --oneline -15
```
Dann lesen: `CLAUDE.md` → `HANDOVER.md` → `ROADMAP.md` → neuester Eintrag in `docs/sessions/` →
bei Bedarf `docs/GDD.md`, `docs/RESEARCH-DATA.md`, `docs/DECISIONS.md`, `docs/architecture.md`.
Dann `python serve.py` starten, `http://127.0.0.1:8200/` öffnen, Konsole prüfen, Zustand mit
`HANDOVER.md` abgleichen. **Erst dann implementieren. Bestehende Systeme werden nie blind neu gebaut.**

## Projektrahmen
- Statische Website: `index.html`, `css/`, `js/` (ES-Module, Import-Map), `assets/` (Daten),
  `vendor/` (Three.js, Rapier compat). Kein Bundler, kein Framework, kein Backend, kein CDN.
- Server: `python serve.py` (Port 8200, `no-store`); `python -m http.server` funktioniert, ist aber
  wegen des Chrome-Modul-Caches nicht der Standard.
- Alle Assets prozedural (Canvas-Texturen, Code-Geometrie, WebAudio-Synthese). Offline gebackene
  Ausgaben eigener Skripte dürfen unter `assets/generated/` liegen – mit Generator, Seed, Auflösung,
  Zweck dokumentiert. Keine fremden Bild-/Audio-/3D-Dateien.
- Physik: Rapier für Boden, Podeste, Character-Controller, Pendeln im Gurt, Tarzansprung; Übungen sind
  Schienen (Spline + Wackelmodell); Flying Fox analytisch. Fester Physikschritt 60 Hz.
- Deterministik: `core/rng.js` mit Seed (`?seed=`), kein `Math.random()` in Gameplay/Procgen.
- Loop-Phasen getrennt: input → physics → gameplay → render → ui. Konstanten in `js/config.js`.
- Dateien ≤ ~400 Zeilen, eine Verantwortung pro Datei, keine zyklischen Imports, keine globalen
  Zustände außer `window.WIPFEL` (Debug). JSDoc an öffentlichen APIs.
- Sprache: Code/Kommentare/Commits Englisch; UI-Strings nur in `assets/strings/de.json`.

## Tests und Verifikation
```
node tools/check-all.mjs      # Syntax aller JS-Dateien (auch gegen abgeschnittene Dateien)
node --test "tests/unit/**/*.test.mjs"       # Unit-Tests reiner Logik (RNG, Graph, Generator, Save)
node tests/smoke.mjs          # optional: Headless-Smoke (playwright-core), sonst SKIP
```
Plus manuelle Smoke-Checkliste in `docs/testing.md`. Laufzeitverhalten im Browser ist die Wahrheit –
kein Feature ist fertig, weil der Code richtig aussieht.

## Commits und Handover
- Conventional Commits, Englisch, eine Aufgabe = ein Commit, nie > 45 min ohne Commit, `wip:` bei
  Abbruchgefahr. Vor jedem Commit: `git status`, Diff lesen, Tests, Seite laden, Konsole, Docs.
- **Keine Co-Author-Zeilen, keine „Generated with …“-Zeilen.** Kein Force-Push, keine History-Umschreibung.
- Nach jedem Commit: `HANDOVER.md` aktualisieren (Commit-Hash eintragen); pro Session eine Datei
  `docs/sessions/YYYY-MM-DD-session-NN.md` (Vorlage: `docs/sessions/README.md`), Index in
  `docs/SESSIONS.md`; Entscheidungen als ADR in `docs/DECISIONS.md`.
- Session-Ende: lauffähiger Stand, Konsole geprüft, Tests grün, `HANDOVER.md` + `ROADMAP.md` +
  Session-Log aktuell, Commit, Hash in `HANDOVER.md`, eine klar beschriebene nächste Aufgabe.

## Ehrlichkeit
Keine Behauptungen wie „produktionsreif“, „fotorealistisch“, „60 fps“, „Animation komplett“, ohne
Nachweis (Screenshot, Messung im Debug-Panel). Provisorisches heißt provisorisch – in `HANDOVER.md`
unter „Offen/Provisorisch“.

## Subagenten
Nie auf Fable 5. Jeder Agent-/Workflow-Aufruf setzt explizit `model: "opus"` (max. Opus 4.8) oder
kleiner; ohne Angabe erbt der Agent das Orchestrator-Modell. Im Zweifel: keine Subagenten.

## Autonomie
Normale Engineering-Entscheidungen selbst treffen (ADR schreiben). Nur anhalten bei zwei grundsätzlich
verschiedenen Produktrichtungen, irreversiblen/destruktiven Operationen oder wenn Nutzereingaben
zwingend sind.
