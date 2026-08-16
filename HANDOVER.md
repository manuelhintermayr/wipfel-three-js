# HANDOVER – Wipfel

> Lebendes Dokument. Nach **jedem Commit** aktualisieren. Der Gesamtzustand steht hier; was in einer
> einzelnen Session passiert ist, steht unter `docs/sessions/`; die Aufgabenliste mit Checkboxen in
> `ROADMAP.md`. Eine neue Session muss allein mit dieser Datei + `ROADMAP.md` weiterarbeiten können.

## Aktueller Meilenstein
vor **M0 „Ein Brett“** (siehe `ROADMAP.md`) – Session 0 (Kickoff, 2026-08-16), noch kein Spielcode.

## Letzter funktionierender Commit
`git log --oneline -1` (Hash hier eintragen, sobald Spielcode existiert). Stand jetzt: nur Dokumente
und Werkzeuge; „funktionierend“ = `serve.py` läuft, `node tools/check-all.mjs` und
`node --test tests/unit/` sind grün.

## Was funktioniert
- Dokumentation vollständig: `PROMPT.md` (Auftrag, Fassung 2), `CLAUDE.md`/`AGENTS.md` (Regeln),
  `ROADMAP.md` (Meilensteine mit Checkboxen), `docs/GDD.md`, `docs/RESEARCH-DATA.md`,
  `docs/DECISIONS.md`, `docs/testing.md`, `docs/SESSIONS.md` + `docs/sessions/`,
  `docs/reference/*.html` (Langfassungen mit Wireframes und Quellen).
- Werkzeuge: `serve.py` (Port 8200, no-store, MIME), `package.json` (`type: module`; Skripte
  `serve`, `check`, `test`, `smoke`), `tools/check-all.mjs`, `tests/unit/check-all.test.mjs`,
  `tests/smoke.mjs` (SKIP ohne playwright-core), `.claude/launch.json` („wipfel“).

## Was halb fertig ist
– (nichts begonnen)

## Was kaputt ist
– (nichts gebaut)

## Dateien, an denen gerade gearbeitet wird
– (keine; nächste Session beginnt mit `vendor/` und `index.html`)

## Wichtige Architekturentscheidungen
`docs/DECISIONS.md` ADR-001…012 und 020…024 (statisch ohne Build, Rapier nur wo nötig / Übungen als
Schienen, Park als Graph, alles prozedural, Deterministik, Kamera, Sicherungsmodi, Ticket = 40 min,
Sprache, fiktiver Park, Höhe knapp, Handover-Protokoll, assets/generated erlaubt, Session-Logs je
Datei, Unit-Tests via node --test, Parcours-Namen, Prioritätsreihenfolge). Offen: ADR-013…019.

## Bekannte Bugs
–

## Unmittelbar nächste Aufgabe
**M0.1 Bootstrap** (`ROADMAP.md`): `vendor/` befüllen (Three.js ES-Build + Addons, Rapier compat –
Paketstruktur im CDN-Listing prüfen), `tools/vendor.ps1`, Versionen als ADR-013/014 eintragen. Commit
`chore(vendor): …`.

## Nächste fünf Aufgaben
1. `index.html` + Import-Map, `css/base.css`, `js/main.js`, `js/config.js`, `js/core/loop.js`
   (fester Schritt 60 Hz, Phasen), `js/core/rng.js`, `js/core/input.js`, `js/core/errors.js`
   (Fehlerbildschirm), `js/ui/debug.js` (F1); Boden-Collider + fallende Testkugel; `tests/unit/rng.test.mjs`.
   Commit `feat(core): boot loop with rapier and debug panel`.
2. `HANDOVER.md`, `ROADMAP.md`, `docs/sessions/…-session-01.md`. Commit `docs(handover): session 1`.
3. M0.2 Terrain (`js/world/terrain.js`, kohärentes Rauschen + Erosionsformung, Wege, Kollision).
4. M0.2 Bäume (`js/procgen/textures/bark.js`, `js/procgen/geometry/tree.js`, `js/world/forest.js`
   mit Instancing/LOD/Ausschlusszonen/Hero-Bäumen), Himmel/Licht/Nebel/Tone-Mapping, Skyline.
5. M0.3 Spieler am Boden (Rapier-KCC, Schulterkamera mit Kollisionsvermeidung, Figur mit
   Posen-Blending, Eingabe).

## Offen / Provisorisch
– (nichts provisorisch, weil nichts gebaut)

## Wie starten
```
python serve.py             # http://127.0.0.1:8200/
```
Browser-Pane in Claude Code: `.claude/launch.json` → „wipfel“.

## Wie testen
```
node tools/check-all.mjs    # Syntax-Gate
node --test tests/unit/     # Unit-Tests
node tests/smoke.mjs        # optional (playwright-core), sonst SKIP
```
Manuelle Smoke-Checkliste: `docs/testing.md`.

## Debug-Kommandos / URL-Parameter
`?debug=1` bzw. F1 (Stats, Physik-/Graph-Visualisierung, Teleport), `?autoplay=1` (Bot),
`?seed=<n>`, `?fast=1`, `window.WIPFEL` (Debug-Namespace). Noch nicht implementiert.

## Aktueller Seed / Reproduktionsfälle
Standard-Seed: 1 (festlegen in `js/config.js`). Reproduktionsfälle: –

## Fallen / Hinweise
- Server nur `serve.py` (Chrome-Disk-Cache-Falle bei `python -m http.server`).
- Write/Edit können große Dateien abschneiden → kleine Dateien, `node --check` nach jedem Edit.
- Netzwerk-Tab muss leer bleiben (nur `127.0.0.1`).
- PowerShell 5.1; Downloads mit `curl.exe -L -A "Mozilla/5.0"`.
