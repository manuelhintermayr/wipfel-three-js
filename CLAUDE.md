# CLAUDE.md – Wipfel

Regeln für Claude Code in diesem Ordner. Der vollständige Auftrag steht in `PROMPT.md`; der aktuelle
Stand in `HANDOVER.md`; die Aufgabenliste in `ROADMAP.md`. **Alle drei vor jeder Änderung lesen.**
`AGENTS.md` ist dieselbe Regelmenge für andere Coding-Agenten.

## Was das ist
Ein Kletterwald-Spiel im Browser (Three.js + Rapier), statische Website ohne Build, alle Assets
prozedural, ausgeliefert über `python serve.py` (Port 8200). Konzept: `docs/GDD.md`, reale Zahlen:
`docs/RESEARCH-DATA.md`, Entscheidungen: `docs/DECISIONS.md`, Tests: `docs/testing.md`.

## Start jeder Session (in dieser Reihenfolge)
`pwd` · `git status` · `git log --oneline -15` → `CLAUDE.md` → `HANDOVER.md` → `ROADMAP.md` → neuester
Eintrag in `docs/sessions/` → nur die relevanten Quelldateien → `python serve.py`, Seite laden, Konsole
prüfen, Zustand mit `HANDOVER.md` abgleichen → **dann erst** an der dokumentierten nächsten Aufgabe
weiterarbeiten. Bestehende Systeme werden nie blind neu gebaut.

## Harte Regeln
1. **Kein Build, kein Framework, kein Backend, kein CDN.** Nur `index.html`, `css/`, `js/` (ES-Module,
   Import-Map), `assets/` (Daten), `vendor/` (Three.js, Rapier compat). Netzwerk-Tab: nur `127.0.0.1`.
   `package.json` nur `"type": "module"`, keine Laufzeit-Dependencies.
2. **Alles prozedural.** Keine fremden Bild-/Audio-/3D-Dateien – auch nicht „vorübergehend“. Texturen
   per Canvas, Geometrie im Code, Audio per WebAudio-Synthese. Offline gebackene Ausgaben eigener
   `tools/`-Skripte unter `assets/generated/` sind erlaubt, wenn Generator/Seed/Auflösung/Zweck
   dokumentiert sind.
3. **Kleine Dateien (≤ ~400 Zeilen), eine Verantwortung, keine zyklischen Imports, Konstanten in
   `js/config.js`.** Write/Edit hat auf diesem Mount große Dateien abgeschnitten – nach jedem Edit
   `node --check <datei>`.
4. **Deterministik.** `core/rng.js` statt `Math.random()` in Gameplay/Procgen; `?seed=` reproduziert
   den Park. Fester Physikschritt 60 Hz, Render interpoliert; Loop-Phasen input → physics → gameplay →
   render → ui.
5. **Ein Store, versionierte Saves.** `core/store.js`, `localStorage['wipfel-save-v1']`, Schema-Version,
   gespeicherte Daten validieren, additive Migration.
6. **Debug-Hooks bleiben:** F1/`?debug=1`, `?autoplay=1`, `?seed=`, `?fast=1`; einziger globaler
   Namespace `window.WIPFEL`; Debug-UI vom Produkt-UI trennbar.
7. **Fehler nie still.** Init-Fehler → Fehlerbildschirm; Generator-Fehler → Diagnose + Fallback;
   `console.info/warn/error` gezielt, kein Rauschen.
8. **Sprache:** Chat Deutsch. Code, Kommentare, Commit-Messages Englisch. UI-Texte nur über
   `assets/strings/de.json`.
9. **Git:** Conventional Commits, eine Aufgabe = ein Commit, nie > 45 min ohne Commit, `wip:` bei
   Abbruchgefahr. **Keine Co-Author-Zeilen, keine „Generated with …“-Zeilen.** Kein Force-Push, keine
   History-Umschreibung. Meilenstein-Tags `m0`…`m3`.
10. **Handover ist Teil der Arbeit.** Nach jedem Commit `HANDOVER.md` (Stand, Commit-Hash, nächste
    Aufgabe), `ROADMAP.md` (Checkbox), Session-Log `docs/sessions/YYYY-MM-DD-session-NN.md`
    (Vorlage: `docs/sessions/README.md`), Index `docs/SESSIONS.md`; Entscheidungen als ADR. Wird der
    Kontext lang: zuerst Handover committen, dann weiter.
11. **Server nur `serve.py`** (no-store, MIME). Ein alter `python -m http.server` kann Chrome alte Module
    aus dem Cache liefern lassen.
12. **Subagenten NIE auf Fable 5.** Fable 5 ist nur Orchestrator. Jeder `Agent`-/Workflow-Aufruf setzt
    explizit `model: "opus"` (maximal Opus 4.8) oder kleiner – ohne `model` erbt der Agent Fable und
    verbrennt Manuels Kontingent. Im Zweifel keine Subagenten, direkt im Chat arbeiten.
13. **Prioritätsreihenfolge:** Korrektheit → Spielgefühl → stabile Physik → Lesbarkeit → Architektur →
    visuelle Qualität → Inhaltsmenge → Politur.

## Testing (Details: `docs/testing.md`)
`node tools/check-all.mjs` · `node --test "tests/unit/**/*.test.mjs"` · Browser über `serve.py` (Konsole leer, Netzwerk
nur lokal, F1-Panel: fps ≥ 55, Draw-Calls < 300) · Smoke-Checkliste · optional `node tests/smoke.mjs` ·
Screenshots nach `docs/screenshots/`, in `HANDOVER.md` verlinken. Laufzeitverhalten ist die Wahrheit.

## Don'ts
- Keine Fantasie-Regionen, keine Höhen über 20 m vor M2, kein Multiplayer-Netzcode vor M4, keine Waffen.
- Keine RPG-Statistiken; Progression = Freigaben, Meisterschaftsstufen, Vertrauen, Sidegrades.
- Keine Platzhalter ohne Eintrag „Offen/Provisorisch“ in `HANDOVER.md`; keine Behauptungen ohne
  Nachweis („fertig“, „60 fps“, „produktionsreif“).
- Keine Design-Tokens verstreuen: Farben/Typografie in `css/base.css`.
- Keine großen Binärdateien (Screenshots < 300 KB).
- Nicht nachfragen, wo `PROMPT.md` Abschnitt 9 die Entscheidung freigibt – entscheiden, ADR, weiter.
  Anhalten nur bei Produktrichtungs-Gabelung, destruktiven Operationen, zwingenden Nutzereingaben.

## Werkzeugfallen
PowerShell 5.1 (kein `&&`, kein `?:`); Downloads `curl.exe -L -A "Mozilla/5.0"`; Git-`index.lock` nur
löschen, wenn kein Git-Prozess läuft; Browser-Pane rendert lokale Dateien nur über HTTP.
