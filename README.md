# Wipfel

Ein Kletterwald-Spiel im Browser: Three.js + Rapier, statische Website ohne Build, alle Assets
prozedural, ausgeliefert über einen einfachen Python-Server.

- **Auftrag für Claude Code:** `PROMPT.md` · **Regeln:** `CLAUDE.md` · **Stand:** `HANDOVER.md`
- **Konzept:** `docs/GDD.md` (Langfassung mit Wireframes: `docs/reference/wipfel-gdd.html`)
- **Reale Zahlen:** `docs/RESEARCH-DATA.md` (Langfassung mit Quellen: `docs/reference/von-baum-zu-baum-recherche.html`)
- **Entscheidungen:** `docs/DECISIONS.md` · **Protokoll:** `docs/SESSIONS.md`

## Starten
```
python serve.py
```
→ http://127.0.0.1:8200/ (in Claude Code: Browser-Pane über `.claude/launch.json`, Konfiguration „wipfel“).

## Prüfen
```
node --check js/<datei>.js      # nach jedem Edit
node tools/check-all.mjs        # alle JS-Dateien (sobald vorhanden)
node tests/smoke.mjs            # optionaler Headless-Smoke-Test (playwright-core)
```

## Struktur (Soll)
`index.html` · `css/` · `js/` (ES-Module) · `assets/` (Daten: Parks, Katalog, Strings) · `vendor/`
(Three.js, Rapier compat) · `tools/` · `tests/` · `docs/`
