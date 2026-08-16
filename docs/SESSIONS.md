# SESSIONS – Protokoll (neueste Session oben)

Format je Eintrag: Datum · Session-Nr · Ziele · Erledigt (mit Commits) · Offen · Fallen/Erkenntnisse.
Kurz und konkret; der Gesamtzustand steht in `HANDOVER.md`.

---

## Session 0 · 2026-08-16 · Kickoff (Dokumente, kein Code)

**Ziele:** Projektordner anlegen, Auftrag (`PROMPT.md`), Regeln (`CLAUDE.md`), Konzept (`docs/GDD.md`),
reale Zahlen (`docs/RESEARCH-DATA.md`), ADR-Log, Handover-Vorlage, Server-Skript, Repo initialisieren.

**Erledigt:**
- Ordnerstruktur `wipfel/` mit `docs/`, `docs/reference/`, `docs/screenshots/`, `tools/`, `tests/`, `.claude/`.
- `PROMPT.md`, `CLAUDE.md`, `HANDOVER.md`, `README.md`, `docs/GDD.md`, `docs/RESEARCH-DATA.md`,
  `docs/DECISIONS.md`, `docs/SESSIONS.md`, `serve.py`, `package.json`, `.gitignore`, `.claude/launch.json`.
- Referenzdokumente kopiert: `docs/reference/wipfel-gdd.html` (GDD mit Wireframes),
  `docs/reference/von-baum-zu-baum-recherche.html` (Recherche mit ~60 Quellen).
- Git-Repository initialisiert, erster Commit.

**Offen:** alles aus M0 (siehe `HANDOVER.md`).

**Fallen/Erkenntnisse:** Werkzeuge vorhanden: git 2.51, Python 3.13, Node 22 (Node nur für
`node --check` und optionalen Smoke-Test – keine Laufzeitabhängigkeit).
