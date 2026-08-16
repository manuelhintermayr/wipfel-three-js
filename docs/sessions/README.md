# Session-Logs

Pro substanzieller Arbeitssession eine Datei `YYYY-MM-DD-session-NN.md` (NN fortlaufend, zweistellig).
Alte Logs werden nie überschrieben. `docs/SESSIONS.md` ist der Index (eine Zeile pro Session).
Der Gesamtzustand steht immer in `HANDOVER.md` – hier steht, was in *dieser* Session passiert ist.

## Vorlage

```markdown
# Session NN · YYYY-MM-DD

## Ziel
## Start-Commit
## Erledigt
## Dateien neu
## Dateien geändert
## Entscheidungen (→ ADR-Nummern)
## Probleme / Fallen
## Tests durchgeführt (Unit, Smoke-Checkliste, Browser)
## Performance-Beobachtungen (fps, Draw-Calls, Physikzeit)
## Screenshots / visuelle Beobachtungen (Pfade unter docs/screenshots/)
## Commits
## Offen geblieben
## Empfehlung für die nächste Session (erste Aufgabe)
```

Am Session-Ende zusätzlich im Chat die Kurzfassung:

```
CURRENT MILESTONE · LAST COMMIT · WORKING FEATURES · KNOWN ISSUES · NEXT TASK · RUN COMMAND
```
