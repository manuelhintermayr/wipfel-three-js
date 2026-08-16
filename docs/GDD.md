# WIPFEL – Game Design Document (Entwurf 2)

> „Zwölf Meter über dem Boden, ein Brett, zwei Karabiner – und dein Kopf.“
> Langfassung mit Wireframes: `docs/reference/wipfel-gdd.html`. Reale Zahlen: `docs/RESEARCH-DATA.md`.

**Genre:** physik-nahes Kletter-/Balance-Spiel mit Run-Struktur und offener Parkwelt; zweiter Akt:
Park-Builder mit Gäste-Simulation und geteilten Parcours. **Perspektive:** Schulterkamera, Ego
umschaltbar, Ego im Flying Fox. **Session:** ein „Ticket“ = Run von 30–40 min (4 Spielstunden).
**Spieler:** Solo; Koop 2–4 später (Begleitregel Kind + Erwachsener). **Ton:** warm, stilisiert,
ehrlich zum Material – Holz, verzinkter Stahl, Seil, Wind. **MVP:** ein blauer Parcours mit fünf
Übungen und einem Flying Fox, der sich richtig anfühlt.

## 1 · Die These
**Du baust die Angst, die andere überwinden.** Der echte Park verkauft nicht Sport, sondern die
Wahrnehmung von Gefahr in einem technisch kontrollierten System: kontrollierte Angst,
Selbstwirksamkeit, Progression, Natur, sozialer Effekt. Ein Spiel liefert drei davon direkt (Angst über
Kamera, Ton, Kontrollverlust; Selbstwirksamkeit über Skill; Progression über Farben) und simuliert zwei
(Natur als Kulisse, Sozialeffekt als Koop/Zuschauer). Was das Spiel dem Park voraushat: die Kamera
drehen – Gast und Betreiber teilen sich eine Simulation mit denselben Regeln (1 pro Übung, 3 pro
Podest, immer ein Karabiner dran, 10 Minuten bis zum Retter).

Reihenfolge: **erst der Kletterer, dann der Betreiber.** Wenn ein wackelndes Brett in sechs Metern
niemanden zur Seite lehnen lässt, trägt kein Builder das Spiel.

Spieler-Satz: **Der Boden ist sicher. Der Spaß beginnt, wenn du ihn verlässt.** Höhe ist die
Progressionswährung – und bleibt deshalb knapp.

## 2 · Die Spielschleife
Podest (Ruhe, Regeneration) → nächste Übung lesen (Vorschaukarte) → Umhängen (Klick – Klick) →
Bewegungsproblem lösen (Balance · Kraft · Nerven) → geschafft (Vertrauen +1) oder abgerutscht (im Gurt
hängen, hochziehen oder Retter) → Podest → … → Flying Fox (loslassen, fliegen, landen) → Stempel →
Parkplan: was als Nächstes (Farbe, Wartezeit, Restzeit) → …

Ebenen: Übung = 20-Sekunden-Puzzle aus Körperkontrolle · Parcours = dramaturgische Sequenz von 8–15
Übungen mit dem Flying Fox als Auszahlung · Ticket = Ökonomie aus Kraft, Nerven, Warteschlangen und
Uhr · Meta = Vertrauen, Freigaben, später der Park selbst.

## 3 · Kletterer-Gameplay

### 3.1 Drei Ressourcen, ein Körper
- **Gleichgewicht** (momentan): Pendel unter dem Schwerpunkt; jede Übung regt es anders an
  (Seilbrücken quer, Planken längs, Fässer rollen). Linker Stick lehnt dagegen; zu großer Ausschlag =
  abrutschen.
- **Kraft** (Vorrat, Arme): Greifen stabilisiert und kostet; Hangeln, Netze, Hochziehen zehren; Podest
  und Stehen füllen auf.
- **Nerven** (psychologische Achse, der eigentliche Gegner): steigen mit Höhe (log), Ausgesetztheit,
  Schwingung, Böen, Blick nach unten, Zeit auf der Übung; sinken auf dem Podest, beim Atmen, bei
  Handkontakt, je geschaffter Übung, wenn unten jemand ruft. Wirkung als Rauschen: Kamera atmet, Hände
  zittern (Balance-Noise), Ton dumpf, Herzschlag hörbar; ganz oben friert der Körper ein, bis man drei
  Atemzüge stehen bleibt. Nie tödlich. **Kein Balken – Herzschlag.**
- **Vertrauen** (langsam, pro Run und über Runs): Nervenanstieg sinkt mit geschafften Übungen und
  folgenlosen Stürzen – „Ich kann dem Gurt vertrauen“ als Meta-Progression ohne Menü.

### 3.2 Steuerung (Gamepad; Tastatur analog)
| Eingabe | Wirkung | Bemerkung |
|---|---|---|
| Linker Stick / WASD | vor/zurück auf der Übung; seitlich = Lehnen | Podest frei begehbar; Übung = Schiene mit Wackelmodell |
| Rechter Stick / Maus | Blick | Nach unten schauen erhöht Nerven |
| LT / RT · Q / E | linke / rechte Hand greifen (halten) | Halteseile, Lianen, Sprossen, Ringe; beide = stabil, teuer; Hangeln = L-R-L |
| A / Leertaste | Schritt, Sprung (Tarzan), Abstoßen (Flying Fox), Beine anziehen (Landung) | Trittelemente getaktet |
| X / F | Umhängen | zwei Drücke pro Podest |
| B / Shift | Atmen (halten) | Nerven sinken, keine Bewegung |
| Y / Tab | Parkplan | Position, Wartezeiten, Restzeit |

### 3.3 Umhängen: Klick – Klick
An jedem Podest vom Sicherungsseil der letzten Übung in das der nächsten. Smart Belay = Ritual aus zwei
Drücken: erster Karabiner löst sich, wandert, rastet ein – Klick; erst dann gibt die Verriegelung den
zweiten frei – Klick. Nicht falsch machbar, aber zwei Sekunden Aufmerksamkeit – die Atempause, in der
man die nächste Übung liest. HUD: zwei Karabiner-Icons (eingehängt · offen · verriegelt) + Ton.

**Modi (die drei realen Sicherungsgenerationen):**
| Modus | Vorbild | Änderung | Für wen |
|---|---|---|---|
| Durchlaufend | Klasse E (Saferoller, SafetyLine) | kein Umhängen; kein Überholen – man steht hinter Langsameren an | Kinder, Einsteiger |
| Smart Belay | Klasse C/D (Edelrid, Kahlenberg) | zwei Drücke, Reihenfolge erzwungen, Fehler unmöglich; Rollen im Karabiner | Standard |
| Klassisch | Klasse A/B („wie am Klettersteig“) | beide Karabiner frei (X/Y); Sturz mit beiden offen beendet den Run mit Unfallbericht; Flying Fox mit Handbremse (Lederhandschuh hinter der Rolle) | Authentik 2005, Speedrunner |

### 3.4 Übungen als Bewegungsprobleme
Jede Übung = Schiene (Spline) + Wackelmodell (Feder-Dämpfer) + Handkontakt-Angebot + Achsenprofil.
| Familie | Bewegungsproblem | Achsen (0–5) phys·koord·psych·tech | Lehrt |
|---|---|---|---|
| Seilbrücken | Querschwingung baut sich mit Tempo auf; Rhythmus gehen–stehen–gehen; Halteseile kosten Kraft | 2·3·3·1 | Tempo dosieren |
| Balken, Planken, Trittholz | Längskippen; hängende Planken schwingen nach – Schrittfenster abwarten | 1·4·4·1 | Timing, Geduld |
| Netze, Röhren | keine Balance, dafür Kraft und Langsamkeit; Röhren senken Nerven | 4·1·1·1 | Verschnaufen |
| Skateboard, Snowboard, Fässer | bewegter Untergrund: abstoßen, mitrollen, gegenlehnen | 2·5·3·2 | Momentum lesen |
| Hangeln, Ringe, Jakobsleiter | Kraft im Wechselrhythmus L-R; Griff zu spät = hängen im Gurt | 5·3·4·2 | Kraft einteilen |
| Tarzansprung | Anlauf, Absprung, Griff ins Netz; Nervenspitze | 3·3·5·2 | Mut als Timing |
| Leitern, Kletterwand | trivial – aber die 20-m-Leiter zu Beginn von Schwarz ist eine Nervenrampe | 2·1·2–5·1 | Höhe akzeptieren |
| Flying Fox | abstoßen, Haltung, Beine hoch vor der Bremse; Tempo nach Gewicht, Durchhang, Wind | 1·2·2·3 | Loslassen |

Regeln als Pacing: **eine Person pro Übung, drei pro Podest** (NPC-Gäste bremsen; Warten regeneriert
und lehrt – Zusehen gibt Vertrauen) und **Einbahn** (ab Markierung kein Zurück; einzige Umkehr = Retter).

### 3.5 Abrutschen und Rettung
Fall = ein halber Meter in den Gurt, dann Pendeln unter dem Sicherungsseil. Kein Tod, keine Ladezeit:
hochziehen (Kraft) oder am Sicherungsseil zum Podest hangeln (langsam, sicher). Kraft leer → Retter
(NPC klettert hoch, seilt ab: 60–120 s Ticketzeit, Parcours zählt als abgebrochen). Nur der
Klassik-Modus kennt den echten Absturz – als trockener Unfallbericht, keine Explosion.

### 3.6 Flying Fox
Ego-Kamera, weites Sichtfeld, Trolley-Sirren. Physik nach Faustzahlen: 3–6 % Gefälle, ~2 % Durchhang,
Tempo steigt mit Gewicht (Größenklasse), fällt mit Gegenwind; Leichte bleiben stehen und werden geholt
(Zugleine, 20 s); Bremse entscheidet: Gravitation (auspendeln), Netz (Beine hoch!), Federblock (Ruck),
Wirbelstrom (samtig, teuer). Auf langen Bahnen der Moment, in dem sich der Wald öffnet und die Skyline
unten liegt: zwei Sekunden, in denen das Spiel nichts will. Später: **Umsetzstationen** (Zwischenpodeste,
Rolle wechseln); im letzten Kapitel **Transfers** in der Luft. Im ersten Park nicht – die Sicherung bleibt ehrlich.

### 3.7 Das Ticket als Run
Vier Spielstunden ≈ 30–40 min inkl. Einschulung. Kassa: Ticketart (Standard; Happy Hour kürzer/billiger
mit Score-Multiplikator; Nachtklettern mit Stirnlampe – weniger Höhenangst, mehr Unbekanntes),
Größenklasse (Farbfreigabe, Zip-Tempo), Modus. Übungsparcours in 1 m Höhe = Tutorial + Freigabe. Letzter
Einlass 2 h vor Schluss. Am Ende **Stempelkarte**: Parcours nach Farbe, „sauber“, Fotos, Restzeit,
Freigaben, „Noch eine halbe Stunde? 5 €.“

### 3.8 Ticket oder Saisonpass
**Ticket** = Run (Uhr, Stempelkarte, Score). **Saisonpass** = offene Welt (kein Timer, der Park als
Ort: zuschauen, Fotos, Legendäre Routen suchen, streiten, welche Farbe man nimmt). Explorer spielen
Saisonpass, Completionists beides, Speedrunner Ticket und **Zeitläufe** einzelner Parcours
(Startpodest, Karabiner ein, drei, zwei, eins – ohne Ladezeit).

### 3.9 Der Park als Netz
Einige Podeste sind **Kreuzungen**: Schilder links Blau, geradeaus Rot, rechts Schwarz, unten der lange
Flying Fox ins Tal – die Gruppe entscheidet. Aus linearen Parcours wird ein Streckenplan in 3D,
aus Wiederholung räumliches Lernen. Boden bleibt Hub; zwischen Kreuzungen gelten weiter Einbahn und
Podestregeln – sonst gibt es keine Staus und keine Comedy.

### 3.10 Flow – die Gegenkraft zu den Nerven
Ununterbrochen balancieren, greifen, schwingen, landen, umhängen, fliegen → **Flow-Multiplikator**
(×1,2 … ×4): Musik schichtet sich auf, Kamera dynamischer, Animation weicher. Optional (zählt erst nach
der ersten sauberen Begehung). Nerven wollen, dass du stehen bleibst; Flow will, dass du weitergehst –
deshalb wächst Flow nur, solange die Nerven unter der Schwelle bleiben: Flow = Ruhe + Kontinuität.
Wer hetzt, verliert beides.

### 3.11 Zu viert auf dem Podest (Koop, später)
Der Sozialeffekt entsteht von selbst (einer sagt „Schwarz“, einer „sicher nicht“, einer zittert, fällt in
den Gurt, alle lachen). Bewusst dazu: **geteilte Physik** (auf die Brücke springen, auf der ein Freund
steht – real per Reglement untersagt; im Spiel erlaubt, wenn die Gruppe es einschaltet) und
**Koop-Übungen** (Gegengewicht ziehen, Seil zuwerfen, Brücke zu viert stabilisieren). Umhängen unter
Zeitdruck: „Weiter!“

### 3.12 Progression
Farben sind Tore (Blau → Rot → Schwarz → Finale-Bahn). Je Parcours vier **Meisterschaftsstufen**:
geschafft · ohne Sturz · unter Richtzeit · im Flow. **Legendäre Routen** ohne Parkplan-Eintrag
(Abzeichen, Bestenliste, Jacke). **Ausrüstung als Sidegrade** (Handschuhe: mehr Grip, langsameres
Umhängen; leichte Schuhe: bessere Balance, härtere Landung; schnelle Rolle: schwerer zu bremsen;
Stirnlampe öffnet die Nacht). Der Spieler wird besser, nicht sein Avatar. Keine XP.

## 4 · Betreiber-Gameplay (zweiter Akt, M3)
Vogelperspektive, dieselbe Karte, dieselben Regeln. Beginn im Winter mit Baumliste (Art, Durchmesser,
Gesundheit; dünne/kranke tragen kein Podest; Bäume wachsen → Klemmung nachjustieren).
- **Bauen:** Podeste (Kapazität 3), Übungen aus dem Katalog (Achsenprofil, Kosten, Durchlaufzeit,
  Kraftbedarf), Einstieg, Ausstieg; Flying-Fox-Werkzeug zeigt live Gefälle, Durchhang, Ankunftstempo je
  Größenklasse und schlägt die Bremse vor; Farben vergibt man selbst – der Park merkt, ob sie stimmen.
  **Parcours-Inspektor:** Dramaturgiekurve, Achsen, Variation, Staurisiko, Retter-Abdeckung.
- **Begehung:** kein Parcours öffnet, bevor der Betreiber ihn selbst gegangen ist („Inspektion vor
  Inbetriebnahme“) – Kamera fällt aufs erste Podest, Kletterer-Modus. Dieselbe Mechanik: **Guide**
  (Gruppe führen) und **Retter** (Gast in Panik, 10 Spielminuten Timer).
- **Gäste als Agenten:** Profile (Kind mit Begleitperson, Jugendliche, Erwachsene, Sportliche,
  Ängstliche, Schulklasse mit Betreuungsschlüssel, Firmengruppe) mit Mut, Kraft, Erwartungen; wählen
  nach Freigabe/Farbe/Wartezeit; Podest- und Übungsregeln → Staus; Angst-Ereignisse aus den
  psychologischen Achsen; Overlays: Wartezeit, Angst, Rettungsabdeckung (10-min-Radius), Baumgesundheit.
- **Sicherheit als Tech-Baum und Pflicht:** klassisch / kommunizierend / durchlaufend mit den echten
  Zielkonflikten; PSA altert (2 Jahre); Helm/Handschuhe als Entscheidungen; Jahresinspektion; Gewitter =
  Räumung (alle Retter gleichzeitig).
- **Ökonomie:** Fixkosten vorne (~40–50 Tsd. je Parcours), variable Kosten ≈ 0, Saison März–Oktober →
  Auslastung: Ticketmodelle, Größenklassen-Preise, Happy Hour, Saisonpass, Schulklassen, Geburtstage,
  Firmenevents, Guides; Signature-Logik (149 solide Übungen + eines, über das alle reden);
  Destination-Synergien (Hütte, Aussicht, Bogensport).
- **Teilen (Trackmania × Hochseilgarten):** Parcours/Parks veröffentlichen mit Karte (Farbe, Höhe,
  Länge, Übungen, Flying Foxes, Bewertung, Bestzeit, Weltrekord). Veröffentlichen darf nur, wer die
  eigene Route begangen hat.

## 5 · UI und Screens
Sprache der Parkbeschilderung: Holzbretter, laminierte Sicherheitsblätter, gestanzte Farbplaketten,
kondensierte Schrift. HUD diegetisch und leise; Farbe trägt immer eine Form (● ■ ◆).

**Screens:** Titel (Podest im Morgenlicht, „Ticket lösen“) · Kassa (Ticketart, Größenklasse, Modus,
Uhrzeit – ein Blatt Papier) · Einschulung (Trainer-Dialog mit echtem Inhalt, dann Übungsparcours 1 m) ·
Parkplan (Holztafel: Parcours als farbige Linien, Wartezeit-Marken, Position, Stempelkarte) · Übung
(HUD) · Podest-Overlay (Vorschaukarte, Umhängen, Atmen) · Flying Fox (Ego, HUD fast weg) · Stempelkarte ·
Builder (Werkzeugleiste, Overlays, Inspektor, Kalender, Kasse).

**HUD (Übung):**
```
[Sicherung: ○●]  [Kraft ◔ 62]  [Nerven ~~^~~]                    [Ticket 2 h 41]  [■ Rot 3 · Übung 5/12]

                          (Wald, Seilbrücke, Figur, Sicherungsseil oben)

[Vor dir: Nepalbrücke · 14 m · Halteseile]        [ Halteseil LT RT · Atmen B ]
```
Karabiner-Widget links (eingehängt/offen/verriegelt), Kraft-Ring, Herzschlag statt Balken; rechts
Ticket-Uhr und Parcours-Chip; unten Kontext-Prompt und Vorschau. Rote Vignette = Nerven, kein Schaden.

**Parkplan:** Holztafel, Karte links (farbige Linien, ⏱-Marken, Pin), rechts Karten je Parcours
(Farbe/Form, Höhe, Übungen, Elemente, Flying Fox, Wartezeit, Freigabe/„gesperrt bis Rot geschafft“) und
Stempelkarte (Blau 1 ✓ sauber · Rot 1 ✓ (1 Sturz) · Ticket 2 h 41 · letzter Einlass 16:00).

**Builder:** Kopfzeile (Saison/Datum/Uhr, Wetter+Böen, Gäste/Warten Ø, Kasse, Bewertung), Werkzeugleiste
(Bäume/Gutachten, Podest Kap. 3, Übungen/Katalog, Flying Fox Gefälle·Bremse, Sicherung A/B·C/D·E,
Personal Betreuer·Retter, Kasse Tickets·Preise, Overlays Warten·Angst·Rettung), Inspektor rechts (Achsen
als Balken, Dramaturgiekurve gelb=Übung/blau=Flying Fox, Variation, Staurisiko, Retter-Abdeckung,
Hinweise „Übung 9 (Hangeln) liegt über dem roten Profil – Panikrate 7 %“), gestrichelter 10-min-Radius,
gelbe Marke = volles Podest.

## 6 · Kunst, Ton, Welt
**Welt.** Erster Park: fiktiver Hangpark über einer Stadt – Buchen und Eichen am Südhang, Sattel mit
Aussicht, Hütte, Bogensportplatz nebenan, Skyline im Dunst: die Kahlenberg-Situation ohne Marke. 2
Wichtel, 5 blaue, 6 rote, 4 schwarze Parcours, Übungsparcours am Eingang, ~150 Übungen, jeder endet mit
einem Flying Fox, der längste 150 m aus 20 m Richtung Stadt, verstecktes Element „Schritt ins Nichts“.

**Kapitel** (Eskalation bleibt lange real): 1 Hangpark mit Skyline (3–20 m) · 2 Badepark am Wasser mit
26 kurzen Bahnen und Riesenschaukel · 3 Flusspark mit Handbremsen-Ziplines und 400-m-Signature-Bahn ·
4 Industriebrache (Stahltürme, Kräne, Förderanlagen – reale KristallTurm-/Bergwerks-Anlagen) · 5
Bergpark mit Gondel, 21-m-Podesten, 1,5-km-Bahn · 6 **der Park, den niemand bauen könnte** (40, 80 m,
Schluchten, Transfers, Legendäre Routen; Community baut hier). Höhe bleibt knapp: wenn alles 40 m hoch
ist, ist nichts mehr hoch.

**Bild.** Stilisiert, nicht cartoonig: Low-Poly-Kronen mit gemalten Blattmassen und Wind, ehrliches
Material im Nahbereich (verzinkter Stahl mit Glanz, Pressklemmen, Holzbohlen mit Maserung, Seil,
Klemmklötze am Stamm – keine Schrauben). Licht: Spätsommer, tief, lange Schatten; Nacht mit
Stirnlampen-Kegeln und Lampions. UI-Farben aus der Parkbeschilderung, sonst aus dem Wald.

**Ton.** Vollständig synthetisch: zwei Karabiner-Klicks (öffnen hell, verriegeln satt), Trolley-Sirren
mit Tempo, Stahlseil-Summen unter Last, Windböen nach Höhe, Vögel, ferne Stadt, Kinderrufe von unten,
Herzschlag (mit Nerven lauter, beim Atmen zurück). Keine Musik auf der Übung; Musik an Kassa, Podest bei
Sonnenuntergang, Stempelkarte.

## 7 · Technik
R3F-artige Architektur, aber ohne Build (siehe `PROMPT.md`): Three.js + Rapier (Boden, Podeste,
Character-Controller), WebAudio-Synthese. **Übungen sind Schienen, nicht Physik:** Spline + Parameter
(Feder-Dämpfer in 1–2 Achsen, Handkontakt, Achsenprofil, Länge); Spieler = Parameter t; Balance = 1-D-
Pendel; prozedurale Animation von Netzen/Fässern/Brettern aus derselben Anregung. Rigid-Body nur für
Tarzansprung, Pendeln im Gurt, Flying Fox analytisch (Durchhang-Modell). Gäste = Agenten auf einem
Graphen (Podeste Knoten Kap. 3, Übungen Kanten Kap. 1) → Warteschlangen ohne KI; Builder schreibt
denselben Graphen; Begehung = Kamerawechsel auf denselben Daten. Bäume instanziert, LOD; Ziel 60 fps
mittlerer Laptop; Desktop mit Gamepad/Tastatur zuerst; Mobile später (Ego + virtueller Stick + zwei
Hand-Buttons – der Flying Fox funktioniert am Handy sogar besser).

## 8 · Umfang, Meilensteine, Risiken
| Meilenstein | Inhalt | Erfolgskriterium |
|---|---|---|
| M0 · Ein Brett | ein blauer Parcours: Leiter, Burma-Brücke, hängende Planken, Netz, Flying Fox; Umhängen, Kraft, Nerven, Kamera, Ton | Testende lehnen sich zur Seite; niemand fragt, was der Karabiner soll |
| M1 · Ein Ticket | sechs Parcours (2/2/2), Kassa, Einschulung, Parkplan, Ticket-Uhr, NPC-Gäste mit Podestregeln, Stempelkarte, Farbfreigaben | Ein Run dauert 30–40 min und man will „noch eine halbe Stunde“ |
| M2 · Ein Park | 15 Parcours + Wichtel, Kreuzungspodeste, Saisonpass, Zeitläufe, Flow, Meisterschaftsstufen, Nacht, drei Sicherungsmodi, Fotos, Politur, Mobile | Speedruns auf Schwarz, Kinder auf Blau, beide zufrieden |
| M3 · Der Betreiber | Builder, Gäste-Simulation, Begehung, Inspektionen, Wetter, Ökonomie, Retter-Rolle | Spieler bauen Parcours, die andere klettern wollen |
| M4 · Die anderen | Koop 2–4 (Begleitregel), Zuschauer-Rufe, geteilte Physik, Koop-Übungen, veröffentlichte Parcours mit Bestzeiten, weitere Kapitel | Der Sozialeffekt entsteht im Voice-Chat von selbst |

**Risiken:** Klettergefühl auf Schienen (M0 zuerst, Kamera und Ton früh, Posen-Blending statt IK-
Perfektion) · Kamera in dichten Kronen (Kronen um den Spieler ausdünnen, Schulterkamera nah) · Overscope
durch den Hybrid (M3 optional; M0–M2 sind ein komplettes Spiel) · Realismus, der langweilt (Warten
regeneriert und lehrt; jede Regel muss etwas Interessantes tun oder fliegt raus) · Versuchung, aus
Nerven doch einen Balken zu machen (der Herzschlag bleibt).

## 9 · Warum das Spiel etwas Eigenes ist
Klettern gibt es (Jusant, Peak, Getting-over-it-Familie), Freizeitpark-Bau gibt es (Planet Coaster,
RollerCoaster Tycoon). Was es nicht gibt, ist der Kletterwald mit doppeltem Blick: dasselbe Podest als
Ort der Angst und als Knoten im Verkehrsfluss, derselbe Karabiner als Ritual und als
Investitionsentscheidung, dieselbe Zipline als Belohnung und als Gefälle-Rechnung.

## 10 · Zweite Meinung („Canopy“) – übernommen / abgelehnt
**Übernommen:** Park als Netz mit Kreuzungspodesten; Flow als Gegenkraft zu den Nerven;
Meisterschaftsstufen; Legendäre Routen; Sidegrades; geteilte Physik und Koop-Übungen; Umsetzstationen
und (letztes Kapitel) Transfers; Kapitel-Eskalation bis zum unbaubaren Park; Teilen mit Bestzeiten;
Spieler-Satz „Der Boden ist sicher …“.
**Abgelehnt:** Verzicht auf den Betreiber-Akt (das Eigene); Verzicht auf das Ticket (wird Modus neben
Saisonpass); Höhen-Inflation (80 m als Normalfall); frühe Flucht in die Fantasie; Transfer in der Luft
im ersten Park (mit ehrlicher Sicherung physikalisch unsinnig).

**Offen:** Arbeitstitel (Wipfel/Podest/Umhängen); ob M3 gebaut wird – Entscheidung nach M1.
