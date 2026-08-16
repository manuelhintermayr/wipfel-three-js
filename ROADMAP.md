# ROADMAP – Wipfel

Verbindliche Meilenstein- und Aufgabenliste (Checkboxen werden hier abgehakt; `HANDOVER.md` zeigt
nur den aktuellen Meilenstein und die nächsten Aufgaben). Jede Aufgabe ist so geschnitten, dass sie
in ≤ 45 Minuten fertig und committet ist. Akzeptanzkriterien sind verbindlich.

**Prioritätsreihenfolge bei Zielkonflikten:** 1 funktionale Korrektheit · 2 Spielgefühl · 3 stabile
Physik · 4 Lesbarkeit für den Spieler · 5 stabile Architektur · 6 visuelle Qualität · 7 Inhaltsmenge ·
8 Politur. Nie funktionierende Steuerung für schönere Vegetation opfern; nie deterministische
Generierung für dekoratives UI opfern.

---

## M0 · „Ein Brett“ – ein blauer Parcours, der sich richtig anfühlt

- [ ] **M0.1 Bootstrap** – `vendor/` (Three.js ES-Build + Addons, Rapier compat), `tools/vendor.ps1`,
      `index.html` mit Import-Map, `css/base.css`, `js/main.js`, `js/config.js` (Konstanten),
      `core/loop.js` (fester Physikschritt 60 Hz, Render-Interpolation, Phasen input → physics →
      gameplay → render → ui), `core/rng.js`, `core/input.js`, `ui/debug.js` (F1 / `?debug=1`),
      Fehlerbildschirm bei WebGL-/Rapier-Init-Fehler; leere Szene mit Boden-Collider und fallender
      Testkugel; 0 Konsolenfehler, 0 externe Requests. Erster Unit-Test (`node --test`): RNG-Determinismus.
- [ ] **M0.2 Weltausschnitt** – Hang-Terrain aus geschichtetem kohärentem Rauschen mit erosionsartiger
      Formung (flachere Hubs, steilere Ränder, Wege), Bodendetail (Laub, Wurzeln, Steine, Grasbüschel),
      40–60 instanzierte Bäume mit Rinde/Normal-Map, Astwerk, Blattmassen mit Wind, Dichtekarte,
      Ausschlusszonen um Wege/Podeste, „Hero-Bäume“ höherer Qualität für Parcours; Himmel, Sonne mit
      Schatten, Nebel/Tiefe, Tone-Mapping, ferne Skyline-Silhouette. Draw-Calls im Debug-Panel.
- [ ] **M0.3 Spieler am Boden** – Rapier-Character-Controller (Kapsel), Gehen/Sprint/Springen/Hänge,
      Schulterkamera mit Kollisionsvermeidung (Kronen ausdünnen, kein Clipping durch Stämme),
      Ego-Umschaltung, prozedurale Figur mit Gurt/Helm und Posen-Blending (Zustände: idle, walk, run,
      crouch, ladder, balance, grab, hang, pull-up, jump, land, harness-fall, recover, zipline, net),
      Gamepad + Tastatur/Maus laut GDD-Tabelle.
- [ ] **M0.4 Podest + Leiter + Umhängen** – Stahlleiter als Schiene, Podest (Klemmen, Planken,
      Anker, Kapazität 3) mit Collider, Sicherungsseil um den Stamm, Karabiner-Zustandsautomat
      (Zwei-Klick-Ritual, Reihenfolge erzwungen), HUD-Karabiner-Widget, zwei Klick-Sounds,
      Kontext-Prompt.
- [ ] **M0.5 Erste Übungen auf Schienen** – gemeinsames Interface (`build`, `createPhysics`, `update`,
      `dispose`, `getEntryAnchor`, `getExitAnchor`, `getDifficultyMetrics`), Burma-Brücke, hängende
      Planken, Netz; Wackelmodell, Balance-Pendel, Kraft, Nerven (Herzschlag, Kamera-Atmen,
      Hand-Zittern, Einfrieren + Atmen); Sturz in den Gurt (Rapier-Pendel), Hochziehen, Hangeln zum
      Podest, Retter-Reset; erster Sturz dramatisch (Aufprall-/Gurtspannungs-Sound, Kamerasacken,
      Haptik-Abstraktion, Atem).
- [ ] **M0.6 Flying Fox** – analytische Fahrt (Gefälle, Durchhang, Masse, Wind), Ego-Kamera mit
      weiterem Sichtfeld, Trolley-Sirren, Vegetation zieht vorbei, Netzbremse mit „Beine hoch“,
      physische Ankunft; Höchstgeschwindigkeit als Nachfahrt-Statistik.
- [ ] **M0.7 HUD v1, Tuning, Nachweis** – HUD (Karabiner, Kraft-Ring, Herzschlag, Ticket-Uhr,
      Parcours-Chip, Vorschau, Prompt), Atmen, Tuning-Pass, `?autoplay=1`-Bot, Screenshots
      `docs/screenshots/m0-*.png`, Smoke-Checkliste aus `docs/testing.md` grün, `docs/architecture.md`
      geschrieben. **Tag `m0`.**

**Akzeptanz M0 = „First Playable“:** Spiel lädt · Wald begehbar · Leiter hoch · einhängen · Burma-Brücke,
Planken, Netz überqueren · abrutschen und gefangen werden · zurück auf die Übung · Flying Fox einhängen,
fahren, landen · Parcours abgeschlossen mit Rückmeldung (Stempel) · 60 fps · 0 Konsolenfehler ·
0 externe Requests · Tester lehnen sich zur Seite, wenn die Planke kippt.

## M1 · „Ein Ticket“ – ein Run

- [ ] **M1.1 Park-Definition + Layout-Generator** – `assets/parks/sonnwendberg.json`, seeded Generator
      auf dem Graphen mit **Validierung** (Start-/Endanker, Seilwinkel, Lichtraum, keine
      Baumdurchdringung, Begehbarkeit, Kontinuität, Landezonen, Zip-Gefälle 3–6 %, Podest-Zugang);
      Unit-Tests: Graph-Konnektivität, Generator-Validität, Schwierigkeitsmetadaten.
- [ ] **M1.2 Sechs Parcours** – 2 blau, 2 rot, 2 schwarz + Übungsparcours; Namen zusätzlich zu Farbe +
      Nummer (z. B. „Rot 3 · Grat“); Podest-Typen (Übergang, Standard, Kreuzung, Start, Zip-Ankunft,
      Rast, Hub); Schilder an Kreuzungen (← Blau 2 · ↑ Rot 4 · → Schwarz 3, Form + Farbe).
- [ ] **M1.3 Kassa + Einschulung** – Ticketart, Größenklasse, Modus; Trainer-Dialog mit echtem Inhalt;
      Übungsparcours in 1 m Höhe als Freigabe.
- [ ] **M1.4 Parkplan** – Holztafel aus dem Graphen, Zoom/Pan, farbige Linien + Formen, Wartezeiten,
      Position, entdeckte Abschnitte, Karten je Parcours, Stempelkarte.
- [ ] **M1.5 Ticket-Uhr + Freigaben + Stempelkarte** – 4 h = 40 min, letzter Einlass, Verlängerung,
      Farbfreigaben, Run-Ende mit Rückmeldung.
- [ ] **M1.6 NPC-Gäste** – Agenten auf dem Graphen mit Podest-/Übungsregeln → Warteschlangen; Zusehen
      gibt Vertrauen.
- [ ] **M1.7 Save + Optionen** – versioniertes Save-Schema mit Validierung, Einstellungen (Lautstärke-
      Kategorien, reduzierte Bewegung/Shake, Assist, Farbe + Form, Tastenbelegung vorbereitet).
- [ ] **M1.8 Zweite Übungsfamilien** – mindestens 12 robuste Übungen insgesamt (Fässer, Hangeln/Ringe,
      Tarzansprung, Balken, Skateboard …). **Tag `m1`.**

**Akzeptanz M1:** ein Run dauert 30–40 min, und man will „noch eine halbe Stunde“; Rot fühlt sich anders
an als Blau (Höhe, Bewegung, Kraft), nicht nur schwerer.

## M2 · „Ein Park“

- [ ] 15 Parcours + 2 Wichtel, Kreuzungspodeste, Legendäre Route
- [ ] Saisonpass-Modus (offen), Zeitläufe (3-2-1), Flow-Multiplikator (nur bei ruhigen Nerven),
      Umhäng-Feedback (sauber/schnell/perfekt), Meisterschaftsstufen je Parcours
- [ ] Nachtklettern (Stirnlampe), drei Sicherungsmodi, Fotos, Sidegrades
- [ ] Übungskatalog auf 20–25 Familien/Varianten, Umsetzstationen
- [ ] Visuelle Politur (Materialien, Anker, Seile, Atmosphäre), Gameplay-Politur (Kamera, Zip-Gefühl,
      Fallen, Audio, Pacing), Grafikoptionen, Touch-Steuerung. **Tag `m2`.**

## M3 · „Der Betreiber“ (Entscheidung nach M1 – ADR-019)

- [ ] Builder (Bäume mit Gutachten, Podeste, Katalog, Flying-Fox-Werkzeug), Parcours-Inspektor
- [ ] Gäste-Simulation mit Profilen, Overlays (Warten, Angst, Rettung, Bäume)
- [ ] Begehung als Freigabepflicht, Guide- und Retter-Rolle
- [ ] Inspektionen, PSA-Alterung, Wetter/Räumung, Ökonomie, Ticketmodelle
- [ ] Teilen von Parcours mit Bewertung/Bestzeit. **Tag `m3`.**

## M4 · „Die anderen“
- [ ] Koop 2–4 (Begleitregel), Zuschauer-Rufe, geteilte Physik, Koop-Übungen, weitere Kapitel bis zum
      Park, den niemand bauen könnte.

---

## Nicht-Ziele (vorerst)
Multiplayer-Netzcode vor M4 · Fantasie-Regionen vor dem letzten Kapitel · Höhen über 20 m vor M2 ·
RPG-Statistiken · Monetarisierung · Cloud-Saves · Waffen/Kampf (nie).
