# CLAUDE.md – Wipfel

Regeln für Claude Code in diesem Ordner. Der vollständige Auftrag steht in `PROMPT.md`; der aktuelle
Stand in `HANDOVER.md`. **Beides vor jeder Änderung lesen.**

## Was das ist
Ein Kletterwald-Spiel im Browser (Three.js + Rapier), statische Website ohne Build, alle Assets
prozedural, ausgeliefert über `python serve.py` (Port 8200). Konzept: `docs/GDD.md`, reale Zahlen:
`docs/RESEARCH-DATA.md`, Entscheidungen: `docs/DECISIONS.md`.

## Harte Regeln
1. **Kein Build, kein CDN.** Nur `index.html`, `css/`, `js/` (ES-Module mit Import-Map), `assets/`
   (Daten), `vendor/` (Three.js, Rapier compat). Im Netzwerk-Tab nur `127.0.0.1`. `package.json` hat
   nur `"type": "module"` – keine Dependencies, kein `npm install` für die Laufzeit.
2. **Alles prozedural.** Keine Bild-, Audio- oder 3D-Dateien von Dritten – auch nicht „vorübergehend“.
   Texturen per Canvas, Geometrie im Code, Audio per WebAudio-Synthese.
3. **Kleine Dateien (≤ ~400 Zeilen), eine Verantwortung pro Datei.** Write/Edit hat auf diesem Mount
   schon große Dateien abgeschnitten – nach jedem Edit `node --check <datei>`.
4. **Deterministik.** `core/rng.js` statt `Math.random()` in Gameplay und Procgen. Kein `Date.now()`
   in der Simulation außer über die Loop-Uhr.
5. **Ein Store, additive Saves.** `core/store.js`, `localStorage['wipfel-save-v1']`, neue Felder mit
   Defaults; Save-Format nie stillschweigend brechen.
6. **Debug-Hooks bleiben:** `?debug=1`, `?autoplay=1`, `?seed=`, `?fast=1`; einziger globaler
   Namespace `window.WIPFEL`.
7. **Sprache:** Chat Deutsch. Code, Kommentare, Commit-Messages Englisch. UI-Texte nur über
   `assets/strings/de.json`.
8. **Git:** Conventional Commits, eine Aufgabe = ein Commit, nie > 45 min ohne Commit, `wip:` bei
   Abbruchgefahr. **Keine Co-Author-Zeilen, keine „Generated with …“-Zeilen.** Kein Force-Push, keine
   History-Umschreibung. Meilenstein-Tags `m0`…`m3`.
9. **Handover ist Teil der Arbeit, nicht Nacharbeit.** Nach jedem Commit `HANDOVER.md` (Stand,
   Checkliste, nächste Schritte) und `docs/SESSIONS.md` (Stichpunkt, neuester Eintrag oben) aktualisieren.
   Wird der Kontext lang: zuerst Handover committen, dann weiter.
10. **Server nur `serve.py`** (no-store, richtige MIME-Types). Läuft noch ein alter
    `python -m http.server`, kann Chrome alte Module aus dem Cache liefern.

## Testing
1. `node --check` jede geänderte JS-Datei.
2. Live: `python serve.py` → `http://127.0.0.1:8200/` (Browser-Pane: `.claude/launch.json`, Konfiguration
   „wipfel“). Konsole leer, Netzwerk nur lokal, `?debug=1` für fps/Draw-Calls/Physikzeit.
3. `?autoplay=1` als Smoke (Bot begeht den M0-Parcours); optional `node tests/smoke.mjs`
   (playwright-core, wenn vorhanden – sonst dokumentiert überspringen).
4. Screenshots als Nachweis nach `docs/screenshots/`, in `HANDOVER.md` verlinken.

## Don'ts
- Keine Fantasie-Regionen, keine Höhen über 20 m, kein Multiplayer-Netzcode vor M2/M4 – explizite Nicht-Ziele.
- Keine RPG-Statistiken (+5 Grip); Progression ist Freigabe, Meisterschaft, Vertrauen, Sidegrades.
- Keine Platzhalter-Würfel im Spiel lassen, ohne sie in `HANDOVER.md` als offenen Punkt zu nennen.
- Keine Design-Tokens verstreuen: Farben/Typografie in `css/base.css`.
- Keine großen Binärdateien committen (Screenshots < 300 KB).
- Nicht nachfragen, wo `PROMPT.md` Abschnitt 9 die Entscheidung freigibt – entscheiden, ADR schreiben, weiter.

## Werkzeugfallen (aus Nachbarprojekten)
PowerShell hier ist 5.1 (kein `&&`, kein `?:`); Downloads mit `curl.exe -L -A "Mozilla/5.0"`;
Git-`index.lock` kann hängen bleiben (nur löschen, wenn kein Git-Prozess läuft); Browser-Pane rendert
lokale Dateien nur über HTTP – immer über `serve.py`.
