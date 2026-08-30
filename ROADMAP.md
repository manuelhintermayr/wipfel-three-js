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

- [x] **M0.1 Bootstrap** – `vendor/` (Three.js ES-Build + Addons, Rapier compat), `tools/vendor.ps1`,
      `index.html` mit Import-Map, `css/base.css`, `js/main.js`, `js/config.js` (Konstanten),
      `core/loop.js` (fester Physikschritt 60 Hz, Render-Interpolation, Phasen input → physics →
      gameplay → render → ui), `core/rng.js`, `core/input.js`, `ui/debug.js` (F1 / `?debug=1`),
      Fehlerbildschirm bei WebGL-/Rapier-Init-Fehler; leere Szene mit Boden-Collider und fallender
      Testkugel; 0 Konsolenfehler, 0 externe Requests. Erster Unit-Test (`node --test`): RNG-Determinismus.
- [x] **M0.2 Weltausschnitt** – Hang-Terrain aus geschichtetem kohärentem Rauschen mit erosionsartiger
      Formung (flachere Hubs, steilere Ränder, Wege), Bodendetail (Laub, Wurzeln, Steine, Grasbüschel),
      40–60 instanzierte Bäume mit Rinde/Normal-Map, Astwerk, Blattmassen mit Wind, Dichtekarte,
      Ausschlusszonen um Wege/Podeste, „Hero-Bäume“ höherer Qualität für Parcours; Himmel, Sonne mit
      Schatten, Nebel/Tiefe, Tone-Mapping, ferne Skyline-Silhouette. Draw-Calls im Debug-Panel.
- [x] **M0.3 Spieler am Boden** – Rapier-Character-Controller (Kapsel), Gehen/Sprint/Springen/Hänge,
      Schulterkamera mit Kollisionsvermeidung (Kronen ausdünnen, kein Clipping durch Stämme),
      Ego-Umschaltung, prozedurale Figur mit Gurt/Helm und Posen-Blending (Zustände: idle, walk, run,
      crouch, ladder, balance, grab, hang, pull-up, jump, land, harness-fall, recover, zipline, net),
      Gamepad + Tastatur/Maus laut GDD-Tabelle.
- [x] **M0.4 Podest + Leiter + Umhängen** – Einstiegsdeck (~40 cm, Bank) mit Einhängepunkt,
      Holz-Blockleiter als Schiene (Brett am Stamm, versetzte Klötze), Podest (Planken auf
      Rundholz-Kranz, Klemmen, Anker, Kapazität 3) mit Collider, Sicherungsseil um den Stamm,
      Karabiner-Zustandsautomat (Zwei-Klick-Ritual, Reihenfolge erzwungen), HUD-Karabiner-Widget,
      zwei Klick-Sounds, Kontext-Prompt. Vorbild: `docs/reference/photos/README.md`.
- [x] **M0.5 Erste Übungen auf Schienen** – gemeinsames Interface (`build`, `createPhysics`, `update`,
      `dispose`, `getEntryAnchor`, `getExitAnchor`, `getDifficultyMetrics`), Burma-Brücke, hängende
      Planken, Netz; Wackelmodell, Balance-Pendel, Kraft, Nerven (Herzschlag, Kamera-Atmen,
      Hand-Zittern, Einfrieren + Atmen); Sturz in den Gurt (Rapier-Pendel), Hochziehen, Hangeln zum
      Podest, Retter-Reset; erster Sturz dramatisch (Aufprall-/Gurtspannungs-Sound, Kamerasacken,
      Haptik-Abstraktion, Atem).
- [x] **M0.P Performance-Pass** – Terrain als 6 × 6 Chunks à 80 m mit Index-LOD (2/4/8 m, ein
      Vertex-/Indexbuffer je Chunk, `setDrawRange`) und Skirts gegen T-Junction-Risse,
      `terrain.update(dt, focusPos)`; Bodendetail nach Distanz (45–90 m je Familie) neu gepackt;
      Laubstreu von 5,5 m auf 2,0 m gekachelt (Blätter 7–16 cm statt ~40 cm) plus Makro-Variation
      gegen die Wiederholung; Wald-Impostoren ab 100 m statt 135 m; Schattenpass entrümpelt
      (Terrain, Wald-LOD 1, Kiesel/Zweige/Gurtzeug werfen nicht mehr). 1280 × 720, Seed 1:
      **1,70–1,80 M → 0,26–0,36 M Dreiecke**, **198–292 → 141–262 Draw-Calls**, Terrain 115 k → 14 k
      im Bodenblick. Unit-Test `chunk-index.test.mjs`. fps auf echter Hardware noch offen.
- [x] **M0.6 Flying Fox** – analytische Fahrt (Gefälle, Durchhang, Masse, Wind), Ego-Kamera mit
      weiterem Sichtfeld, Trolley-Sirren, Vegetation zieht vorbei, Netzbremse mit „Beine hoch“,
      physische Ankunft; Höchstgeschwindigkeit als Nachfahrt-Statistik.
      Reines Modell `zipline/{physics,brakes}.js` (Parabel-Durchhang, Masse → Durchhang → Tempo,
      Wind als effektiver Luftwiderstand, Steckenbleiben + Hangeln), Trassensuche `park/zip-plan.js`
      (Gefälle 4,5–6 %, Lichtraum, Baumfreiheit, Landezone – die erste Hälfte der M1.1-Validierung),
      Hardware `elements/zipline.js` + Ankunftspodest `park/zip-landing.js`, Zustand
      `player/on-zipline.js`. Seed 1: **56,0 m Spannweite, 5,50 % Gefälle, 3,08 m Fall, 1,12 m
      Durchhang**, Ankunftspodest 2,42 m, Bremszone ab 50,1 m; Höchstgeschwindigkeit 21,2 / 22,5 /
      23,5 / **24,3 km/h** je Größenklasse (Beine unten 1,0–1,5 km/h weniger), Fahrt 11,5–13,4 s.
      Unit-Tests `tests/unit/zipline.test.mjs` (18).
- [x] **M0.7 HUD v1 (Mockup 1:1), Tuning, Nachweis** – Routen-Header (Farbbalken, Kategorie, Name,
      Fortschritt, Zeit, Best), Flow-Anzeige (Platzhalter-Logik bis M2), Modus-Icons, Zipline-Overlay
      mit Tacho, Sicherheits-Tooltip, Start-Banner mit Kennzahlen + Countdown 3-2-1-GO, Karabiner-
      Widget, Kraft-Ring, Herzschlag, Kontext-Prompt; `en.json`/`de.json`; Atmen, Tuning-Pass,
      `?autoplay=1`-Bot, Screenshots `docs/screenshots/m0-*.png`, Smoke-Checkliste grün,
      `docs/architecture.md`. **Tag `m0`.**

**Akzeptanz M0 = „First Playable“:** Spiel lädt · Wald begehbar · Leiter hoch · einhängen · Burma-Brücke,
Planken, Netz überqueren · abrutschen und gefangen werden · zurück auf die Übung · Flying Fox einhängen,
fahren, landen · Parcours abgeschlossen mit Rückmeldung (Stempel) · 60 fps · 0 Konsolenfehler ·
0 externe Requests · Tester lehnen sich zur Seite, wenn die Planke kippt.

## M1 · „Ein Ticket“ – ein Run

- [x] **M1.1 Park-Definition + Layout-Generator** – `assets/parks/sonnwendberg.json`, seeded Generator
      auf dem Graphen mit **Validierung** (Start-/Endanker, Seilwinkel, Lichtraum, keine
      Baumdurchdringung, Begehbarkeit, Kontinuität, Landezonen, Zip-Gefälle 3–6 %, Podest-Zugang);
      Unit-Tests: Graph-Konnektivität, Generator-Validität, Schwierigkeitsmetadaten.
- [x] **M1.2 Sechs Parcours** – 2 blue, 2 red, 2 black + Green-Übungsparcours; Namen zusätzlich zu
      Farbe + römischer Ziffer (z. B. `RED ROUTE III · RAVEN RUN` / „Rot III · Rabenlauf“); Podest-Typen
      (Übergang, Standard, Kreuzung, Start, Zip-Ankunft, Rast, Hub); Start-Banner je Route mit
      Kennzahlen; Wegweiser wie im echten Park: pfeilförmige weiße Tafeln mit Farbrand, Farbname in
      Versalien, Ziffern in Kreisen (+ Formen) an Startbereichen und Kreuzungen.
- [x] **M1.3 Kassa + Einschulung** – Ticketart, Größenklasse, Modus; Trainer-Dialog mit echtem Inhalt;
      Übungsparcours in 1 m Höhe als Freigabe.
- [x] **M1.4 Course Map + Parkplan** – Course-Map-Overlay 1:1 nach Mockup (Relief-Untergrund aus
      dem Terrain, farbige Routen mit Podest-Knoten, Spielerposition, Legende Green/Blue/Red/Black/
      Legendary, Filter/Player/Zoom/Exit) aus dem Graphen; in der Welt zusätzlich die diegetische
      Parkplan-Tafel im Stil der echten (grüne Karte auf Pfosten, Schleifen mit römischen Ziffern);
      Wartezeiten, entdeckte Abschnitte, Karten je Parcours, Stempelkarte.
- [x] **M1.5 Ticket-Uhr + Freigaben + Stempelkarte** – 4 h = 40 min, letzter Einlass, Verlängerung,
      Farbfreigaben, Run-Ende mit Rückmeldung.
- [x] **M1.6 NPC-Gäste** – Agenten auf dem Graphen mit Podest-/Übungsregeln → Warteschlangen; Zusehen
      gibt Vertrauen.
- [x] **M1.7 Save + Optionen** – versioniertes Save-Schema mit Validierung, Einstellungen (Lautstärke-
      Kategorien, reduzierte Bewegung/Shake, Assist, Farbe + Form, Tastenbelegung vorbereitet).
- [x] **M1.8 Zweite Übungsfamilien** – mindestens 12 robuste Übungen insgesamt (Fässer, Hangeln/Ringe,
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

## M4 · „Die anderen“ (lokal – ADR-029)
- [ ] Koop 2 lokal (Gamepad + Tastatur, Begleitregel), Zuschauer-Rufe, geteilte Physik, Koop-Übungen, weitere Kapitel bis zum
      Park, den niemand bauen könnte.

---

## Nicht-Ziele (vorerst)
Multiplayer-Netzcode vor M4 · Fantasie-Regionen vor dem letzten Kapitel · Höhen über 20 m vor M2 ·
RPG-Statistiken · Monetarisierung · Cloud-Saves · Waffen/Kampf (nie).
