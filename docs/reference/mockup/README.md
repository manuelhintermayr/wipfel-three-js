# Gameplay-Mockup – das visuelle Ziel (1:1)

Manuel hat ein Konzeptbild (Collage aus sechs Screens) vorgegeben: **„So ca. sollte das Gameplay
ausschauen – 1:1 aufnehmen und vollständig umsetzen.“** Bitte die Bilddatei hier als
`gameplay-mockup.webp` ablegen; bis dahin gilt diese Beschreibung als verbindliche Spezifikation.
Alles darin wird prozedural und mit eigenen Assets nachgebaut – das Mockup gibt Komposition, HUD,
Typografie, Kamera, Figur und Atmosphäre vor, nicht die Pixel.

## Gesamteindruck
Third-Person-Schulterkamera, fotoreal orientierte Darstellung („stylized realism“, **kein Low-Poly**):
dichter Nadel-/Mischwald, hohe Kiefern, tiefes Streiflicht mit Nebeltiefe, in der Ferne Berge, ein
Fluss/Wasserfall (Kapitel-Kulisse), Podeste aus Holzplanken um Stämme, Hängebrücken mit Holztritten,
Stahlseile, Sicherungsseil über Kopfhöhe. Die Figur: **Kletterin**, dunkles Tanktop, dunkle
Capri-Hose, Komplettgurt mit orange-schwarzen Gurtbändern, Handschuhe, Haar zusammengebunden,
Y-Verbindungsmittel mit zwei Karabinern, Rolle am Gurt. HUD dunkelgrau-transparent, weiße kondensierte
Versalien, Farbakzente nach Route, alles klein und ruhig.

## Screen 1 · Übung (Hauptbild)
- **Oben links, Routen-Header:** vertikaler Farbbalken (rot) · `RED ROUTE` groß · darunter Icon +
  `RAVEN RUN` (Routenname) · darunter drei Zeilen mit Icons: `13 / 19` (Übung/Fortschritt),
  `02:18.54` (laufende Zeit), `BEST: 04:38.76` (Bestzeit, mit Rauten-Icon).
- **Unten links:** drei kleine Icons (Figur/Pose, Bewegungsmodus, Kamera/Foto).
- **Unten Mitte:** `FLOW` klein, darunter `x2,4` groß, darunter ein gelber Balken (Multiplikator-Füllstand).
- Szene: Figur geht auf einer Holzbohlen-Hängebrücke von einem Podest weg, links Handseil rot,
  Sicherungsseil oben, Podest mit Planken und Stahlseil-Ankern am Stamm, weitere Brücken/Podeste in der
  Tiefe, Wasserfall und Berge im Hintergrund.

## Screen 2 · Zipline
- **Oben links:** grüner Farbbalken · `ZIPLINE` · `EAGLE FLIGHT` · `310 m`.
- **Unten rechts:** Tacho-Bogen (gelb) · `SPEED` · `62` groß · `KM/H`.
- Kamera hinter/über der Fahrerin, leicht von oben, Bewegungsunschärfe am Rand, Wald rauscht vorbei,
  Fluss unten, Berge/Klippen im Hintergrund; Fahrerin sitzend, Hände am Trolley.

## Screen 3 · Blaue Route
- Header wie Screen 1: blauer Balken · `BLUE ROUTE` · `FOX TRAIL` · `7 / 14` · `01:35.22` ·
  `BEST: 02:20.16`. Unten Mitte `FLOW x1,6` mit kurzem Balken.
- Szene: Figur hangelt/klettert an hängenden Trittelementen (Holzblöcke an Seilen), Sicherungsseil
  oben, Kiefernwald, Podest links.

## Screen 4 · Course Map (Vollbild-Overlay)
- Titel `COURSE MAP`, oben Filter-Chip `ALL`, dunkles Satelliten-/Reliefbild des Parks als Untergrund;
  Routen als farbige Linien (grün, blau, rot, weiß/schwarz, gelb) mit Knoten als weiße Kreise (Podeste),
  Spielerposition markiert.
- Legende unten: `◈ GREEN · ◆ BLUE · ◐ RED · ◆ BLACK · ✦ LEGENDARY`.
- Buttons unten: `FILTER · PLAYER · ZOOM · EXIT`. Zoom/Pan möglich.

## Screen 5 · Karabiner-Nahaufnahme / Sicherheits-Tooltip
- Kamera nah an den Händen: zwei Karabiner (Stahl, mit Rollen), Sicherungsseil, Anker am Stamm mit
  Klemmen/Schrauben (im Spiel: Klemmung ohne Schrauben im Stamm).
- **Tooltip unten rechts:** `SAFETY FIRST` (grün) · „Always stay clipped in. You can only unclip one
  carabiner at a time.“ · grünes Häkchen.

## Screen 6 · Start einer Route
- Rotes Banner zwischen zwei Pfosten auf dem Startpodest: `BLACK ROUTE` · `THE CROW` groß ·
  drei Kennzahlen `19 OBSTACLES · 32 m HEIGHT · 480 m LENGTH` · `BEST TIME 04:38.76` · `START`.
- Unten rechts Countdown-Scheiben `3 · 2 · 1 · GO` (GO grün).
- Figur steht mit dem Rücken zur Kamera auf dem Podest, dahinter Wald und Netzelemente.

## Verbindliche Ableitungen für Wipfel
1. **HUD-Layout 1:1:** Routen-Header oben links (Farbbalken, Kategorie, Name, Fortschritt, Zeit,
   Bestzeit), Flow unten Mitte, Modus-Icons unten links, Zipline-Overlay (Name, Länge, Tacho unten
   rechts), Course Map als Vollbild-Overlay mit Legende und Buttons, Start-Banner mit Kennzahlen +
   Countdown 3-2-1-GO, Sicherheits-Tooltip. Zusätzlich behalten wir Wipfel-Eigenes, das dem Mockup
   nicht widerspricht: Karabiner-Widget, Kraft-Ring, Herzschlag statt Nervenbalken (das Mockup zeigt
   keinen Nervenbalken – konsistent), Ticket-Uhr im Ticket-Modus.
2. **Kategorien:** Green (Kinder/Einsteiger, Übungs- und Wichtelparcours), Blue, Red, Black,
   Legendary – Farbbalken und Icons je Kategorie; Formen zusätzlich zur Farbe.
3. **UI-Sprache:** Englisch als Standard wie im Mockup (`en.json`), Deutsch als vollständige zweite
   Sprache mit dem echten Parkvokabular (`de.json`). Routen heißen `Farbe · Ziffer · Name`
   (z. B. `RED ROUTE III · RAVEN RUN`).
4. **Kamera & Figur:** Schulterkamera nah, leicht über Schulterhöhe; Kletterin wie beschrieben;
   Rig muss Gehen auf Bohlen, Hangeln, Sitzen im Trolley, Karabiner-Handling zeigen.
5. **Bild:** stylized realism – PBR-Materialien, dichte Kiefern mit Blattmassen, Nebeltiefe,
   Streiflicht, Schatten, Tone-Mapping; Berge/Wasserfall als Kulisse ab Kapitel 3–5, im ersten Park
   Skyline und Hügel. Höhenangabe „32 m“ des Mockups gehört zu einer schwarzen Route späterer Kapitel;
   Kapitel 1 bleibt bei 20 m (ADR-011).
6. **Zeit/Bestzeit immer sichtbar** (nicht nur im Zeitlauf) – im Saisonpass-Modus ohne Ticket-Uhr,
   im Ticket-Modus zusätzlich die Ticket-Uhr.
