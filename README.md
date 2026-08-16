# Wipfel

Ein Kletterwald-Spiel im Browser: Three.js + Rapier, statische Website ohne Build, alle Assets
prozedural, ausgeliefert über einen einfachen Python-Server.

- **Auftrag für Claude Code:** `PROMPT.md` · **Regeln:** `CLAUDE.md` / `AGENTS.md` · **Stand:** `HANDOVER.md` · **Plan:** `ROADMAP.md`
- **Konzept:** `docs/GDD.md` (Langfassung mit Wireframes: `docs/reference/wipfel-gdd.html`)
- **Reale Zahlen:** `docs/RESEARCH-DATA.md` (Langfassung mit Quellen: `docs/reference/von-baum-zu-baum-recherche.html`)
- **Entscheidungen:** `docs/DECISIONS.md` · **Tests:** `docs/testing.md` · **Protokoll:** `docs/SESSIONS.md` + `docs/sessions/`

## Starten
```
python serve.py
```
→ http://127.0.0.1:8200/ (in Claude Code: Browser-Pane über `.claude/launch.json`, Konfiguration „wipfel“).

## Prüfen
```
node --check js/<datei>.js      # nach jedem Edit
node tools/check-all.mjs        # Syntax-Gate für alle JS-Dateien
node --test tests/unit/         # Unit-Tests reiner Logik
node tests/smoke.mjs            # optionaler Headless-Smoke-Test (playwright-core)
```

## Struktur (Soll)
`index.html` · `css/` · `js/` (ES-Module) · `assets/` (Daten: Parks, Katalog, Strings) · `vendor/`
(Three.js, Rapier compat) · `tools/` · `tests/` · `docs/`
