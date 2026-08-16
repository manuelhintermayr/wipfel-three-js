# HANDOVER – Wipfel

> Lebendes Dokument. Nach **jedem Commit** aktualisieren: Stand, Checkliste, nächste Schritte.
> Neueste Änderungen stehen oben in `docs/SESSIONS.md`; hier steht immer der **aktuelle Gesamtzustand**.

## Stand
- **Session:** 0 (Projekt-Kickoff, 2026-08-16) – noch kein Spielcode.
- **Meilenstein:** vor M0.
- **Letzter Commit:** siehe `git log --oneline -1`.
- **Läuft im Browser?** Nein – es gibt noch keine `index.html`.
- **Server:** `python serve.py` (Port 8200) liegt bereit; Browser-Pane-Konfiguration „wipfel“ in `.claude/launch.json`.
- **Vendor:** noch nichts gespiegelt (Three.js, Rapier compat – siehe `PROMPT.md` 6.1).

## Was funktioniert
- Dokumentation vollständig: `PROMPT.md` (Auftrag), `CLAUDE.md` (Regeln), `docs/GDD.md` (Konzept),
  `docs/RESEARCH-DATA.md` (reale Zahlen), `docs/DECISIONS.md` (ADRs), `docs/SESSIONS.md` (Protokoll),
  `docs/reference/*.html` (Langfassungen mit Wireframes und Quellen).
- `serve.py` (no-store, MIME-Types), `package.json` (`type: module`), `.gitignore`, `.claude/launch.json`.

## Was kaputt / offen ist
- Nichts kaputt – nichts gebaut. Offene Punkte: siehe „Nächste Schritte“.

## Checkliste M0 · „Ein Brett“
- [ ] 1 Bootstrap: Repo, `vendor/` (Three.js + Rapier compat, Versionen notieren), `index.html` + Import-Map, `js/main.js` mit `RAPIER.init()`, Loop, `?debug=1`, 0 externe Requests
- [ ] 2 Weltausschnitt: Hang-Terrain, 40–60 instanzierte Bäume mit Rinde/Blattmassen/Wind, Himmel, Licht, Skyline
- [ ] 3 Spieler am Boden: Rapier-KCC, Schulterkamera, prozedurale Figur mit Gurt/Helm, Gamepad + Tastatur/Maus
- [ ] 4 Podest + Leiter + Umhängen: Leiter-Schiene, Podest mit Klemmen, Sicherungsseil, Karabiner-Automat (Klick – Klick), HUD-Widget, Klicks
- [ ] 5 Übungen auf Schienen: Burma-Brücke, hängende Planken, Netz; Balance/Kraft/Nerven; Sturz in den Gurt (Rapier-Pendel), Recovery, Retter-Reset
- [ ] 6 Flying Fox: analytische Fahrt, Ego-Kamera, Netzbremse, Landung
- [ ] 7 HUD v1, Atmen, Tuning, `?autoplay=1`-Bot, Screenshots `docs/screenshots/m0-*.png`, Smoke-Test → Tag `m0`

## Nächste Schritte (die ersten drei)
1. `vendor/` befüllen und `tools/vendor.ps1` schreiben; Versionen hier und in `docs/DECISIONS.md` eintragen. Commit `chore(vendor): …`.
2. `index.html`, `css/base.css`, `js/main.js`, `js/core/loop.js`, `js/core/input.js`, `js/ui/debug.js`: leere Szene, Boden-Collider, fallende Testkugel, fps-Panel. Commit `feat(core): boot loop with rapier and debug panel`.
3. Weltausschnitt (M0-2) beginnen: `js/world/terrain.js`, `js/procgen/textures/bark.js`, `js/world/forest.js`.

## Offene Entscheidungen (mit ADR abschließen)
- Three.js-Version und Addon-Liste; Rapier-compat-Version und Dateistruktur im `vendor/`.
- Figur-Stil (Low-Poly-Proportionen), Baumarten-Mix, Podest-Geometrie (Achteck vs. Ring).

## Fallen / Hinweise
- Server nur `serve.py` (Chrome-Disk-Cache-Falle bei `python -m http.server`).
- Write/Edit können große Dateien abschneiden → kleine Dateien, `node --check` nach jedem Edit.
- Netzwerk-Tab muss leer bleiben (nur `127.0.0.1`).

## Wie starten
```
python serve.py            # http://127.0.0.1:8200/
```
Browser-Pane in Claude Code: `.claude/launch.json` → „wipfel“.
