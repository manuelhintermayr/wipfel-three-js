# TESTING – Wipfel

Drei Ebenen: (1) Syntax-Gate, (2) Unit-Tests reiner Logik, (3) Browser-Verifikation (Smoke-Checkliste,
optional headless). Laufzeitverhalten im Browser ist die Wahrheit.

## 1 · Syntax-Gate (nach jedem Edit)
```
node --check js/<datei>.js
node tools/check-all.mjs        # alle .js/.mjs unter js/, tools/, tests/
```
Fängt Syntaxfehler und – wichtig auf diesem Windows-Mount – abgeschnittene Dateien.

## 2 · Unit-Tests reiner Logik
Node-eigener Test-Runner, keine Abhängigkeiten:
```
node --test "tests/unit/**/*.test.mjs"
```
Konvention: `tests/unit/<modul>.test.mjs`, `import test from "node:test"; import assert from
"node:assert/strict";`. Getestet werden nur Module ohne DOM/WebGL/Rapier-Bedarf (Logik so schneiden,
dass sie testbar ist):
- `core/rng.js` – gleicher Seed → gleiche Folge; unterschiedliche Seeds → unterschiedliche Folgen; Verteilung grob.
- `park/graph.js` – Konnektivität, Kapazitäten (Podest 3, Übung 1), gerichtete Kanten, Einbahn-Abschnitte.
- `park/layout.js` – Generator-Validität für N Seeds: Start-/Endanker vorhanden, Seilwinkel im Bereich,
  Lichtraum, keine Baumdurchdringung, Kontinuität, Landezonen, Zip-Gefälle 3–6 %, Podest-Zugang.
- `park/catalog.js` – Achsenprofile 0–5, Pflichtfelder je Familie.
- `core/save.js` – Serialisierung/Deserialisierung, Schema-Version, defekte Daten → Defaults, additive Migration.
- `zipline/physics.js` – Ankunftsgeschwindigkeit steigt mit Masse, fällt mit Gegenwind; Leichte bleiben
  im Durchhang stehen (Grenzfall).
- `player/belay.js` – Zustandsautomat: nie beide Karabiner offen (Smart-Belay-Modus), Reihenfolge erzwungen.

## 3 · Browser-Verifikation

### 3.1 Manuelle Smoke-Checkliste (vor jedem Meilenstein-Tag, gekürzt vor jedem Commit)
```
[ ] Seite lädt über serve.py ohne Konsolenfehler/-warnungen
[ ] Netzwerk-Tab: nur 127.0.0.1 (0 externe Requests)
[ ] Debug-Panel (F1 / ?debug=1): fps ≥ 55, Draw-Calls < 300, Physikzeit stabil
[ ] Spieler spawnt, geht, sprintet, springt, kollidiert mit Boden/Bäumen/Podest
[ ] Kamera clippt nicht durch Stämme; Ego-Umschaltung funktioniert
[ ] Leiter: Aufstieg auf das Podest
[ ] Umhängen: Klick – Klick, Widget zeigt Zustände, nie beide offen
[ ] Übungen: Burma-Brücke, Planken, Netz begehbar; Balance/Kraft/Nerven spürbar
[ ] Sturz: Fang im Gurt, Pendel, Hochziehen/Hangeln, Retter-Reset
[ ] Flying Fox: einhängen, Fahrt, Bremse/Landung, Ankunft am Ziel
[ ] Parcours abgeschlossen → Rückmeldung (Stempel)
[ ] Parkplan öffnet (Tab), Pause (Esc)
[ ] ?autoplay=1 läuft ohne Fehler durch den M0-Parcours
[ ] ?seed=1 erzeugt reproduzierbar dieselbe Welt (Screenshot-Vergleich)
```

### 3.2 Headless-Smoke (optional)
```
node tests/smoke.mjs [--port 8200] [--seconds 20]
```
Startet `serve.py`, lädt `?autoplay=1&debug=1&seed=1`, zählt Konsolenfehler und externe Requests,
Screenshot nach `tests/out/smoke.png`. Braucht `playwright-core` (dev-only, `npm i -D playwright-core`)
und ein Chromium; fehlt es, endet der Test mit SKIP (Exit 0).

### 3.3 Browser-Pane / Playwright-MCP in Claude Code
`.claude/launch.json` → Konfiguration „wipfel“ startet `serve.py`; Screenshots als Nachweis nach
`docs/screenshots/<meilenstein>-<nr>-<thema>.png` (< 300 KB), in `die Projektnotizen` verlinken.

## 4 · Review-Schleifen (vor Meilenstein-Tags)
**Visuell:** Maßstab · Silhouette · Materialqualität · Licht · Komposition · Walddichte · Tiefe ·
Lesbarkeit · Sichtbarkeit des Parcours · Glaubwürdigkeit der Podeste · Beschlagdetail · Lesbarkeit der
Figur. Wenn es schlecht aussieht: Ursache benennen, nicht mehr Objekte hinzufügen.
**Gameplay je Übung:** Ist das Ziel lesbar? Reagiert die Steuerung? Ist Scheitern verständlich? Ist
Erholung möglich? Kommt Schwierigkeit aus Können, nicht aus schlechter Steuerung? Fühlt sie sich anders
an als die Nachbarübung? Erzeugt sie eine Geschichte? Schwache Übungen umbauen oder streichen.

## 5 · Ehrlichkeit
Nichts als „fertig“, „60 fps“, „produktionsreif“ oder „animiert“ bezeichnen, was nicht gemessen oder
gesehen wurde. Provisorisches steht in `die Projektnotizen` unter „Offen/Provisorisch“.
