# HANDOVER – Wipfel

> Lebendes Dokument. Nach **jedem Commit** aktualisieren. Der Gesamtzustand steht hier; was in einer
> einzelnen Session passiert ist, steht unter `docs/sessions/`; die Aufgabenliste mit Checkboxen in
> `ROADMAP.md`. Eine neue Session muss allein mit dieser Datei + `ROADMAP.md` weiterarbeiten können.

## Aktueller Meilenstein
**M4 („Die anderen") FERTIG – damit ist das Projekt (M0–M4) vollständig** (uncommitted, oben auf dem
gesamten M0–M3-Stapel darunter). Lokales Koop für zwei Spieler an einem Gerät (ADR-029: Gamepad + Tastatur/
Maus, keine Netzwerk-Komponente), geteilte Kamera statt Splitscreen (neu: ADR-030), zwei echte Koop-Übungen,
geteilte Physik als Schalter, Zuschauer-Rufe, Begleitregel-Flavour beim Run. Ehrlich zugeschnitten: kein
Splitscreen, keine vier Spieler (GDD nennt „2–4" für später/M4-„weitere Kapitel" – explizit außerhalb
dieses Auftrags, s. Auftragstext), keine neuen Biome/Kapitel jenseits Sonnwendberg.

**Input-Split** (`js/core/input.js` + `js/core/input-source.js`, neu): `Input#setGamepadEnabled(on)` –
Spieler 1 liest den Gamepad nur noch, solange Koop aus ist (unverändertes M0–M3-Verhalten); sobald Koop an
ist, gibt Spieler 1 den Gamepad ab (`setGamepadEnabled(false)`) und Spieler 2 bekommt ihn exklusiv über
`createGamepadInputSource()` – dieselben Aktionsnamen wie `Input` (`down/pressed/released/consume/move/
look/poll/endFrame`), keine Unterklasse (eigene Tastatur/Maus-DOM-Listener wären dort nutzlos). Eine echte,
notwendige Lücke geschlossen: `DEFAULT_BINDINGS.gamepad.buttons` hatte laut GDD-Tabelle nie ein „Interagieren"
(die Tabelle selbst listet Gamepad dafür als „–") – ohne das könnte ein reiner Gamepad-Spieler 2 nie
einhängen, klettern oder eine Übung betreten. Taste 10 (Linker-Stick-Klick, „L3" in der Standard-Gamepad-
Belegung) neu auf `"interact"` gelegt – bestehende Belegungen unverändert, kommt auch Solo-Gamepad-Spielern
zugute. `createTestInputSource()` (neues, träges Double mit identischer Methodenmenge) für
`WIPFEL.debug.enableCoopForTest()`/`tools/dev/verify-m4.mjs`, weil in einer Headless-Session kein echter
Gamepad existiert.

**Koop-Sitzung** (`js/game/coop.js`, neu, ~360 Zeilen; `js/game/coop-elements.js`, neu, rein/THREE-frei,
alle Formeln von `tests/unit/coop.test.mjs` direkt geprüft): `createCoop({...}).enable()`/`.disable()`
spawnt/entsorgt Spieler 2 vollständig – eigener `createPlayer()` (Rig-Farbvariante „p2" cyan statt orange,
`js/player/rig.js#colourVariant`), eigenes `belay` (Modus vom Tagesstart übernommen; „unsafe"-Ereignis
läuft NICHT über den geteilten `belay:unsafe`-Namen, weil main.js dort einen reinen Spieler-1-Unfall-Listener
hängen hat – eigener Namensraum `coop:belay2-unsafe`, `open`/`click` bleiben gemeinsam für den Karabiner-Klick
bei beiden), eigenes `vitals` (eigene Balance/Kraft/Nerven, kein eigenes HUD), eigene vier Zusatzzustände
(element/fall/zipline/tarzan, 1:1 wie Spieler 1s eigene in main.js), eigene `createInteraction(...,
holderId: "player2")` mit eigener kleiner `.p2-prompt`-Box unten links (`renderPromptNodes` aus
`js/ui/hud.js` wiederverwendet, jetzt exportiert). Bewusst NICHT in den M3a-Builder integriert: der Builder
baut `course`/`interaction` unter laufender Referenz neu auf – main.js ruft `coop.disable()`, sobald
`builder.mode !== "closed"` wird (derselbe Kniff wie das bestehende Einfrieren von `agents`), statt den
Builder um ein viertes „Spieler"-Objekt zu erweitern.

**Occupancy verallgemeinert, rückwärtskompatibel** (`js/game/occupancy.js`): `claimElement(id, holderId,
capacity = maxPerElement)` – die Ablage ist jetzt `Map<id, Set<holder>>` statt `Map<id, holder>`; mit dem
Default (1) verhält sich ein `Set` der Größe 1 exakt wie die alte Einzelwert-Map, jeder bestehende Aufrufer
(Gäste, Spieler 1) bleibt unverändert. Neu: `holdersOfElement(id)`. Nur die zwei Koop-Übungen setzen
`element.occupancyCapacity = 2` und übergeben `capacity` explizit. `js/player/interaction.js` bekommt einen
`holderId`-Parameter (Default `"player"`); Spieler 2s eigene Instanz übergibt `"player2"`.

**Geteilte Kamera statt Splitscreen** (ADR-030, `js/player/coop-camera.js`, neu, rein): `computeCoopFrame
(p1,p2)` – Fokuspunkt gewichtet zu Gunsten von, wer gerade „das Schwerere" tut (`COOP.camera.
activityWeight`), Distanz wächst mit dem Abstand, geklemmt auf 4–18 m. `js/player/camera.js#
setFocusOverride(position, distance)` (neu, additiv: `null` = unverändertes Solo-Verhalten) ist der einzige
Eingriff in die bestehende Kamera. Spieler 2 bekommt eine ECHTE zweite Kamerasteuerung (volle,
wiederverwendete `createCameraController`), aber gebunden an eine nie gerenderte `THREE.PerspectiveCamera` –
einfacher und sicherer als ein Parallel-Stub, kostet nur einen zusätzlichen, harmlosen Shape-Cast pro Frame.
Spieler 2s eigener Gamepad-Taste „camera" (RB) ist entfernt (`js/game/coop.js#P2_GAMEPAD_BINDINGS`), damit
sie nie versehentlich die eigene (unsichtbare) Kamera auf Ego umschaltet und dabei laut `controller.js#
render` das eigene Rig verschwinden lässt. **Die-Leine** (`js/game/coop-elements.js#leashFactor`): jenseits
24 m Abstand wird Spieler 2s eigener Stick-Input skaliert (nie eingefroren, Boden 20 %), HUD-Hinweis „Stay
together"/„Zusammenbleiben" in der P2-Box.

**Zwei Koop-Übungen** (`js/elements/team-bridge.js` + `counterweight-lift.js`, neu; drittes Array
`COOP_CATALOGUE` in `js/elements/catalogue-data.js` – NICHT in `CATALOGUE`/`CATALOGUE_VARIANTS`, die
`tests/unit/catalogue.test.mjs` in ihrer Länge fixiert; `catalogueEntry()` findet beide trotzdem):
- **Team-Brücke** (blau, `blue-2` Kante 0): strukturell ein Beam-Swing-Cousin (unabhängige Segment-Pendel,
  durchgehend begangen, flache Bohlen statt runder Stämme), bewusst wackliger als jede andere Blau/Rot-
  Übung. `element.setTensionHeld(bool)` dämpft jeden KÜNFTIGEN Tritt-Kick um 60 % (`COOP_ELEMENTS.
  teamBridge.tensionKickScale`) – die andere Person hält F/die Gamepad-Entsprechung an Einstiegs- ODER
  Ausstiegspodest.
- **Gegengewichtslift** (rot, `red-2` Kante 0): ein Korb auf zwei Führungsseilen, keine Balance-Aufgabe
  (GDD „Netze, Röhren" minus sogar den Kraft-Preis) – reine Tempo-Frage. `element.walkSpeed` wird live
  gesetzt: `selfHaulSpeed` (immer da, solo schaffbar – „Sandsack vorgespannt"), plus zerfallender Bonus aus
  `addHaulPower()` (die andere Person tippt [interact] am Einstiegspodest).
- Beide bewusst solo-schaffbar (nur langsamer/wackliger), `occupancyCapacity: 2` (Fahrer/in + Helfer/in,
  nie zwei Fahrer/innen auf derselben Bahnposition), Metrik-Summe innerhalb des Kategorie-Budgets (Team-
  Brücke 10 ≤ Blau 11, Gegengewichtslift 9 ≤ Rot 15), platziert deterministisch über `PARK_CONFIG`s neues
  `coopEdge: {index, kind}`-Feld (`js/park/layout.js`/`layout-route.js#buildEdges`), nie über den
  Zufalls-Pool – `tests/unit/layout.test.mjs`s bestehender Budget-Test über alle acht Fixture-Seeds bleibt
  unverändert grün.

**Geteilte Physik als Schalter** (GDD §3.11/§4, Options-Bildschirm „Shared bridge physics", Default AN,
`save.data.settings.sharedPhysics`, additiv): `js/game/coop-elements.js#applySharedPhysics` überträgt bei
gemeinsam genutztem Baum/derselben Koop-Übung 60 % der Wackel-*Geschwindigkeit* der einen Übung auf die
andere, dt-skaliert – dieselbe Form, die `js/elements/element.js#update` schon für seine eigene
Wind-Böen-Kopplung nutzt (`excite(gust*gain*dt)`), also stabil und billig.

**Zuschauer-Rufe** (GDD §3.11): periodisch (9–16 s, deterministisch über eine Session-`Rng`-Fork), wenn die
andere Person ODER ≥ 1 Gast neben einer Übung steht, auf der gerade geklettert wird – vier Zuruf-Zeilen
(i18n), plus eine kleine Nerven-Erleichterung über das bestehende `nerves.watchSuccess()` (M1.6), nicht neu
gebaut.

**Begleitregel-Flavour beim Run**: Beide klettern in denselben Lauf, sobald beide über dieselbe Route
eingehängt sind (der bestehende, gemeinsame Event-Bus macht das ohnehin automatisch – Hindernisse/Stürze
zählen für den einen Lauf, den es je Route gibt). Stürze werden JE SPIELER separat gezählt (reine Zustands-
Flankenerkennung auf `player.mode==="fall"`, nicht über das anonyme `player:fell`-Ereignis). Eine additive
Baustein-Ebene – KEIN Umbau der Lauf-Fertigstellung in `js/game/session.js`/`route.js` (bewusst, siehe
„Was halb fertig ist") – markiert den zuletzt passenden Eintrag in `session.day.routes` mit `.companion =
true`, sobald BEIDE dieselbe geteilte Route verlassen haben (erkannt über `sharedRouteId`/
`justFinishedSharedZip`); `js/ui/stamp-card.js` zeigt dafür ein kleines „Finished together"/„Gemeinsam
geschafft"-Abzeichen, wenn vorhanden.

**Kassa + Optionen**: „Two climbers"/„Zwei Kletternde"-Schalter in `js/ui/kassa.js`, sichtbar nur bei
verbundenem Gamepad (`isGamepadConnected()`, bei jedem `show()` neu geprüft) – `choice.coop` steuert
`coop.enable()`/`.disable()` in `js/main.js#startDay`. Koop-Zustand ist bewusst NICHT gespeichert (jeder
neue Tag startet mit ausgeschaltetem Häkchen, ein Reload/„Weiter im Park bleiben" nimmt Koop nie automatisch
wieder auf).

**Geprüft** (echter Chromium via system-Chrome + `playwright-core`, `tools/dev/verify-m4.mjs`; die
Playwright-MCP-Browserverbindung blieb in dieser Session unbenutzt wie schon in M3a/M3b dokumentiert):
Eine echte, umgebungsbedingte Falle gefunden und im Verify-Skript selbst umschifft (keine Spieländerung):
der allererste `requestAnimationFrame`-Zeitstempel dieser Headless-Tabs stand in eklatantem Widerspruch zu
`performance.now()` bei `loop.start()` (`loop.accumulator` sprang auf ca. −20 bis −36 und blieb dort –
`js/core/loop.js`s Akkumulator holt das nur mit +1/60 s pro Frame auf, also praktisch nie), wodurch
`physics.step()` nie auch nur einmal lief und der/die Spieler/in für immer im „air"-Zustand hing – exakt
die Falle, die `HANDOVER.md`s eigener „Achtung headless"-Absatz seit M0.P beschreibt. Live bestätigt: Loop
stoppen, Akkumulator auf 0, `loop.start()` neu – sofort normales Fallen-und-Landen. `verify-m4.mjs` fährt
deshalb durchgehend mit einer vollständig manuellen Uhr (`pumpTicks()`: Loop anhalten, Akkumulator auf 0,
`loop._tick(t)` selbst mit synthetischen, gleichmäßig getakteten Zeitstempeln aufrufen) statt auf ein
echtes `requestAnimationFrame` zu hoffen.
**(a)** frischer `?debug=1`-Boot: **0 Konsolenfehler/-warnungen, 0 externe Requests**.

**Beim Verifizieren einen echten, vorbestehenden Bug gefunden und behoben** (seit M1/M1.3, `js/game/
autoplay.js` – keine M4-Datei, keine Spielmechanik verändert): der `?autoplay=1`-Bot verließ sich im
„fall"-Zustand ausschließlich auf `hold("Space")` („pull up"). `js/player/fall.js#canPullUp` erlaubt das
aber nur nah genug unter der Übung (`underElement()`) – landet der Bot weiter mittig im Pendel, greift
weder Pull-up noch (mangels W/S-Input) das zweite, immer verfügbare Auswegsystem des Falls (Seil zur
Plattform hangeln). Live reproduziert: der Bot hing über 400 simulierte Sekunden regungslos an derselben
Position, ohne jeden Fehler. Behoben mit einer Zeile (`hold("KeyW")` zusätzlich zu `hold("Space")`) –
einer der beiden Wege löst danach immer auf. Danach **dreimal in Folge sauber durchgelaufen**.

**(b)** `?autoplay=1&fast=1&seed=1` (Koop-AUS-Pfad, unverändert): **komplett durchgelaufen –
`{state:"done", progress:"5/5", falls:0}`, `WIPFEL.coop.active` blieb die gesamte Sequenz `false`, 0
Konsolenfehler, 0 externe Requests.** **(c)** Koop-Smoke ohne echten Gamepad:
`WIPFEL.debug.enableCoopForTest()` → `true`, zwei Rigs im Szenengraph
(`scene.children.filter(o=>o.name==="player-rig").length === 2`), `WIPFEL.coop.active === true`; beide
Spieler an den Einstieg der zweiten Übung teleportiert (0,80 m Abstand; die erste Übung UND der
Klettergurt-Einhängepunkt selbst liegen beide innerhalb `js/game/session.js`s `SESSION.bannerRange` von
6 m – dort würde das große Routenstart-Banner den ganzen Bildschirm überdecken) – **beide** danach
`mode: "ground"`, `grounded: true`, Spieler 1 zeigt „Clip in [F]", die eigene `.p2-prompt`-Box zeigt „P2:
Clip in F", 0 Konsolenfehler über die gesamte Sequenz. Screenshot `docs/screenshots/m4-coop.png` (zwei
Rigs nebeneinander auf dem Einstiegspodest der zweiten Übung, P1s zentraler Prompt UND P2s eigene Box
beide sichtbar und mit echtem Inhalt; 192 KB). `check-all` **173/173**,
`node --test --test-concurrency=1 tests/unit/*.test.mjs` **275/275** (254 + 21 neue `coop.test.mjs`-Tests:
Input-Source-Vertragstreue, Aktivitätsgewichtung + Kamera-Frame-Berechnung inkl. Distanz-Clamp,
Element-Verbindung + geteilte Physik, Lift-/Brücken-Mathematik, Leinen-Kurve, geteilter-Lauf-Erkennung;
unverändert durch den autoplay.js-Fix – die Datei hat keine eigene Testdatei, DOM-/Tasten-getrieben).

**Bekannte Einschränkungen (ehrlich, s. `docs/architecture.md`s „Known limitations" für Details):** Koop-
Zustand nicht gespeichert; Spieler 2 ohne eigenes HUD-Vitals-Widget/Tacho, ohne Classic-Modus-Unfall-
Behandlung, ohne Flow-Anzeige, mit auf Tastatur-Beschriftung („[F]"/„[E]") zurückfallenden Prompt-Strings
auch am Gamepad (keine Geräte-Glyphen, i18n ist nicht pro Eingabegerät); das Begleit-Abzeichen kann eine
echte gemeinsame Ankunft verpassen, wenn die zuerst fertige Person schon in die Leiter der NÄCHSTEN Route
einhängt, bevor die zweite Person ankommt (das eigene „zuletzt eingehängt"-Tracking wandert dann weiter);
zwei Spieler:innen KÖNNEN technisch gleichzeitig dieselbe Koop-Übung betreten (Occupancy erlaubt es,
Kapazität 2) – nichts stürzt ab, aber die Helfer-Mechanik (Seil-Ziehen/Spannung) greift dann schlicht nicht
für die Person, die nicht am Podest steht; die beiden Spieler-Collider kollidieren nicht miteinander
(bestehende `GROUP.PLAYER`-Filterung, unverändert) – sie können sich gegenseitig durchqueren statt sich
zu schubsen; kein Splitscreen (ADR-030, bewusst); keine dritte/vierte Person, keine weiteren Kapitel
(explizit außerhalb dieses Auftrags).

## Aktueller Meilenstein (M3b – vollständig, s. oben für M4)
**M3b (zweite Hälfte von „Der Betreiber") FERTIG – damit ist M3 komplett** (uncommitted, oben auf dem
gesamten M0–M3a-Stapel darunter): Gäste-Profile mit Mut/Kraft/Geduld und Angst-Ereignissen, Retter-Rolle
(spielbar), Inspektionen/PSA-Alterung/Wetter-Räumung, Ökonomie/Bewertung, Betreiber-Kopfzeile +
Overlays, Teilen (Export/Import, ADR-029). Neun Module: `js/npc/profiles.js` (neu – sieben Archetypen
mit Mut/Kraft/Geduld statt der drei M1.6-Profile, `rollFearEvent` rein/deterministisch getestet),
`js/npc/agents.js` (erweitert – Angst/Panik-Zustandsmaschine im `onRail`-Schritt, Geduld-Warteabbruch,
laufende Wartezeit-/Angst-Mittelwerte über `js/game/occupancy.js#createStatTracker` neu, `resolvePanic`/
`evacuate`/`debugForcePanic`), `js/game/rescue.js` (neu – kleine Zustandsmaschine idle→pending→active→
talkdown, keine eigene Kamera nötig, da der Spieler schon in normalem First/Third-Person spielt; teilt
sich den Element-Slot des panischen Gasts über `js/player/interaction.js`s neuen `rescue`-Parameter),
`js/game/operations.js` (neu – Saison/Tag/PSA-Verschleiß/Wetterprognose, Räumung als eigene
Echtzeit-Gegenzeit statt Vergleich gegen die während des Sturms pausierte Ticket-Uhr),
`js/game/economy.js` (neu – Kasse/Bewertung, Routenbaukosten einmalig, Mundpropaganda-Gästezahl,
Signature-Bonus auf den Bewertungs-Deckel), `js/builder/operator-panel.js` (neu – Kopfzeile),
`js/builder/builder-overlays.js` (erweitert – vier Overlay-Layer: Warten/Angst/Baumgesundheit als
farbcodierte Kugeln, Rettungsabdeckung als Hüttenkegel + Radius-Ring + Podest-Einfärbung),
`js/builder/builder-state.js` (erweitert – `rescuePosts`, max. 3, Kandidaten = Hubs + Routen-Einstiege,
kein freier 3-D-Klick, wie schon der M3a-Builder es hält), `js/ui/options.js` (erweitert – „Park
teilen": Export als JSON-Datei-Download, Import mit vollständiger Layout-Validierung + erzwungenem
„braucht Begehung" für jede importierte Route). Details/Verträge: `docs/architecture.md#Operator
simulation (M3b …)`.

**Beim Verifizieren einen echten, vorbestehenden Bug gefunden und behoben** (seit M3a, s. „Gefunden und
behoben" unten): `js/builder/builder-ui.js`s Haupt-Container hatte nie ein initiales `hidden = true` –
er war auf **jedem** Boot sichtbar, überlappte das normale Gameplay-HUD, unabhängig von `?builder=1`,
weil M3a nur `?builder=1`-Boots screenshotete. Behoben.

**Bewusste Vereinfachungen (dokumentiert, s. „Was halb fertig ist"):** Gruppen-Profile (Kind+Begleitung,
Schulklasse) bewegen sich nicht buchstäblich im Verbund (Occupancy erlaubt ohnehin nur eine Person pro
Übung); die Gästezahl für die Ökonomie ist eine **modellierte** Mundpropaganda-Zahl, entkoppelt von der
tatsächlichen NPC-Rostergröße (die bleibt pro Session fest, kein täglicher Neuaufbau); Retterposten haben
noch kein eigenes 3-D-Hütten-Mesh im normalen Spiel, nur den funktionalen Trigger + HUD-Prompt (der
Builder-Overlay zeigt sie als Kegel); Guide-Rolle ist **nicht** Teil dieses Auftrags (nur Retter stand
in der Aufgabenliste) und bleibt offen für M3c/später; Wartezeit-Bewertungsbonus („kurze/lange
Wartezeit") ist in `economy.js` als reine Funktion vorhanden, aber noch nirgends verdrahtet (kein
Auslöse-Ereignis dafür in dieser Session gebaut).

**Geprüft** (echter Chromium via Playwright MCP, bis die Browser-Verbindung dieser Session mitten in der
Sitzung unwiederbringlich abbrach – dieselbe Grenze, die HANDOVER für M3a schon einmal dokumentiert;
danach mit dem separaten Browser-Pane-Werkzeug weitergemacht, das JS/Konsole/Netzwerk zuverlässig liest,
aber in dieser Sitzung keine Screenshots/`requestAnimationFrame` liefert, weil das Pane nie sichtbar
war): frischer `?debug=1`-Boot **0 Konsolenfehler/-warnungen, 0 externe Requests**, `operations`/
`economy`/`rescue` korrekt verdrahtet (`cash 150000`, `rating 3.5`, Prognose deterministisch je Seed/Tag).
`?builder=1`-Boot: Betreiber-Kopfzeile mit echten Werten, Overlay-Umschalter „Rescue" aktivierbar,
Screenshot `docs/screenshots/m3-operator.png`. `WIPFEL.debug.forcePanic()`: Gast panisch, Retter-Timer
sofort **aktiv** mit vollen 100 s, HUD-Zeile „Rescue · 01:39.xx" sichtbar, Screenshot
`docs/screenshots/m3-rescue.png`. `WIPFEL.debug.forceStorm()`: `forecast` → `"storm"`, `isEvacuating()`
→ `true`, ein Gast mitten auf dem Weg zu einer Route (`toEntry`) wechselt sofort auf `"return"` –
**live per Zustandsabfrage bestätigt**, aber **kein Screenshot** (`m3-storm.png` fehlt): der Absturz der
Playwright-Verbindung kam genau in diesem Schritt, das Ersatzwerkzeug konnte in dieser Sitzung nicht
screenshotten. Alle drei Sub-Systeme sind zusätzlich durch 26 reine Unit-Tests (`operations.test.mjs`,
`economy.test.mjs`, `rescue.test.mjs`) abgedeckt, `rescue.test.mjs` läuft komplett DOM-frei (derselbe
Kniff wie `ticket.js`). **`?autoplay=1&fast=1` konnte in dieser Sitzung nicht erneut live bestätigt
werden** (Browser-Werkzeug down, s. o.) – per Code-Review aber geprüft: `rescue.update()`/
`operations.update()` sind während `?autoplay=1` vollständig wirkungslos (Sturmtag-Prognose für Seed 1/
Tag 1 ist „overcast", nie „storm"; `rescue`s eigener `autoplay`-Guard verhindert jeden Zustandswechsel),
und ein echtes Regressionsrisiko wurde dabei gefunden und **behoben**: ein dauerhaft panischer Gast auf
genau der Übung, die der `?autoplay=1`-Bot als Nächstes braucht, hätte ihn für immer blockiert (der Bot
kann nie zu einem Retterposten laufen) – `createAgents({..., allowPanic: !params.autoplay})` unterdrückt
seither nur die **dauerhafte** Eskalation (ein einfaches Einfrieren, das sich von selbst löst, bleibt
möglich) während `?autoplay=1`. `check-all` **164/164**, `node --test` **254/254** (217 + 37 neue:
26 Agents/Profile-Tests inkl. Panik-Determinismus, 10 Operations-, 11 Economy-, 11 Rescue-, 5 Builder-
State-Rescue-Tests – teils Überschneidung durch Erweiterung bestehender Testdateien, exakte Aufteilung
s. „Dateien" unten).

## Aktueller Meilenstein (M3a – vollständig, s. oben für M3b)
**M3a (Builder-Hälfte von „Der Betreiber") FERTIG** (uncommitted, oben auf dem gesamten M0–M2b-Stapel
darunter): Builder-Modus, Parcours-Inspektor, Begehungspflicht – der zweite Akt aus GDD §4, erste
Hälfte (Gäste-Simulation/Guide/Retter/Inspektionen/Ökonomie/Teilen bleiben M3b). ADR-003 zahlt sich aus:
der Builder editiert genau dieselbe `parkDef`-Form, die `js/park/layout.js#generateParkLayout` erzeugt,
`js/park/loader.js#loadPark` brauchte keine einzige Änderung, um einen handgebauten Park zu laden.

Neun neue Module unter `js/builder/`: `survey-trees.js` (reiner, deterministischer Baum-Gutachten-Scan
– Rasterabtastung mit denselben Hub/Weg/Hangregeln wie der Generator, jeder Kandidat bekommt eine
erfundene, aber reproduzierbare `health` 0..1, unter 0,55 kein Podest – GDD „dünne/kranke tragen kein
Podest"), `builder-validate.js` (reine Wiederverwendung von `layout-validate.js`s Prädikaten pro Route
+ Gesundheits-/Podestzahl-/Zip-Existenz-Checks), `builder-state.js` (der Entwurf: Draft-Klon von
`parkDef` mit Baum-`health`+Routen-`_status{walked,issues}`, alle Editier-Operationen – Route/Podest/
Übung/Zip/Kategorie/Name –, Zustand `draft`/`needsWalkthrough`/`open` **abgeleitet**, nie gespeichert,
Export/Persistenz), `builder-metrics.js` (Achsen/Dramaturgiekurve/Variation/Stauresiko/Richtzeit-
Schätzung fürs Inspektor-Panel, aus `builder-state.js` ausgelagert), `builder-camera.js` (Vogelperspektive:
WASD/Ziehen schwenkt, Rad zoomt, Q/E rotiert), `builder-overlays.js` (3-D-Geister: Baum-Kandidaten
grün/grau/rot, ausgewählte Route als glühende Lifeline aus den Draft-Daten – funktioniert auch für eine
brandneue, noch nicht gebaute Route), `builder-zip-tool.js` (2-D-Top-down-Canvas fürs Flying-Fox-
Werkzeug: Ziehen zeigt live Gefälle/Länge/Ankunftstempo über eine echte `zipline/physics.js`-Simulation,
außerhalb 3–6 % wird „Setzen" deaktiviert), `builder-inspector.js` + `builder-tool-panels.js` +
`builder-ui.js` (DOM: Routenliste links, Inspektor rechts, Werkzeugleiste unten mit vier
Datenpanels + Zip-Werkzeug, zustandslos – jeder Klick ruft nur `dispatch(action)`), `builder.js`
(Orchestrierung: Zustandsautomat `closed`/`editing`/`walking`, Begehungsablauf, `?autowalk=`-Bot-Bindung).

Integration in `js/main.js`: Boot bevorzugt einen validen `save.data.customPark` vor einem frisch
generierten Park; `rebuildFromParkDef()` (neu) entsorgt und baut `agents/guestRig → courseMap/session/
interaction/parkBoard/signs/course → (nur bei gewachsenen heroTrees) forest → …` neu auf, mit denselben
Konstruktionsaufrufen, die `boot()` schon einmal gemacht hat (dafür wurden die betroffenen `const` zu
`let`, `window.WIPFEL`s Debug-Oberfläche liest sie jetzt über Getter, damit sie nie veraltet). Loop-
Verdrahtung: Gameplay-Phase kehrt sofort zurück, solange `builder.mode === "editing"`; Render-Phase
ruft `builder.onRenderPhase(dt)` statt `player.render()`; Input-Phase ruft `builder.onInputPhase()`
immer (treibt den `?autowalk=`-Bot) und sperrt Foto/Parkplan/Pause-Umschaltung, solange der Builder
offen ist – Esc verlässt `editing` direkt, bricht `walking` manuell ab. `js/game/autoplay.js` bekam
einen optionalen `route`-Parameter (`routeCtx = route || course`) – derselbe Bot läuft jetzt jede
beliebige Route, nicht nur `blue-1`; `js/game/session.js#activeRun()` bekam eine einzeilige defensive
Absicherung. `js/core/save.js#data.customPark` (additiv, eigenes Mini-Schema `{schema, parkDef,
routeStatus}`), `setCustomPark()`/`clearCustomPark()`. `js/park/layout-route.js` exportiert neu
`ZIP_GRADIENT`/`buildEntry` (keine Verhaltensänderung) zur Wiederverwendung durch den Builder.
Namensgebung ohne neuen i18n-Mechanismus: `setRouteName()` schreibt den literalen Text direkt in
`route.nameKey` – `t()`s dokumentierte „fehlender Key rendert als Key"-Regel zeigt ihn dadurch überall
unverändert an. `css/builder.css` (neu, in `index.html` verlinkt) – ein echter Bug beim Verifizieren
gefunden: die volltransparente Label-Ebene schluckte jeden Klick auf die Werkzeugleiste darunter, weil
`css/base.css`s `#overlay > * { pointer-events: auto; }` (ID-Selektor) ein einfaches klassenbasiertes
`pointer-events: none` immer schlägt – behoben mit ID-qualifizierten Gegenregeln.

**Geprüft** (echter Chromium via Playwright MCP): frischer `?builder=1`-Boot **0 Konsolenfehler/
-warnungen, 0 externe Requests**, alle 16 Routen gelistet, Inspektor/Achsen/Dramaturgie rendern. Ein
echter Klick (Werkzeugleiste → Kategorie & Name → „Schwarz") auf Blau-I kippt sie auf **Draft** mit vier
echten `deckHeightOutOfWindow`-Verstößen und deaktiviert „Begehen" – dabei einen echten Bug gefunden und
behoben (die Zip-Landung wurde fälschlich gegen den GESAMTEN Park statt nur gegen die beim Bau dieser
Route schon existierenden Bäume geprüft, s. `docs/architecture.md`; ein Unit-Test „jede generierte Route
startet verstoßfrei" hat das vor dem Browser-Durchlauf gefunden, ein Sweep über Seeds 1–8 × beide
Park-Configs bestätigte danach null Falschmeldungen). `?builder=1&autowalk=blue-1&fast=1` gegen ein
frisch geleertes Save: der Bot schließt die Route ab, `save.data.customPark.routeStatus["blue-1"].
walked` kippt auf `true`, der Builder kehrt automatisch zu „editing" zurück – zweimal sauber reproduziert
(je 0 Konsolenfehler/-warnungen, 0 externe Requests); einer von drei Versuchen lief in eine
vorbestehende `?autoplay=1`-Bot-Grenze (s. „Was halb fertig ist"), keine Builder-Regression. Normales
`?autoplay=1&fast=1` (kein `?builder=1`, frisches Save) schließt Blau-I weiterhin normal ab
(„route completed in 395.20 s · falls 0 · best true"), `save.data.customPark` bleibt dabei durchgehend
`null`. Die „Park builder"-Zeile im Optionsbildschirm plus Esc-Ausstieg wurden ebenfalls per echtem
Klick/echtem Tastendruck geprüft. `check-all` **156/156**, `node --test` **206/206** (186 + 20 neue
Builder-State-Tests). Screenshots `docs/screenshots/m3-builder.png` (Route ausgewählt, Inspektor mit
Achsen/Dramaturgie, 3-D-Lifeline mit Spannweiten-Labels über dem Gelände), `m3-validate.png` (Verstoßs-
Anzeige nach dem Kategorie-Klick oben) – beide < 300 KB (PIL: 760 px Kantenlänge, 112-Farben-Palette).

## Aktueller Meilenstein (M2b – vollständig, s. oben für M3a)
**M2b ABGESCHLOSSEN – damit ist M2 „Ein Park" komplett** (uncommitted, oben auf dem ebenfalls noch
uncommitteten M2a: 15 gesicherte Routen + legendäre Route, Kreuzungspodeste, Wichtel-Parcours,
Saisonpass, Zeitläufe, Flow, Meisterschaftsstufen, Sidegrades – Verträge in `docs/architecture.md`
unter „Park scale-up, junctions, Wichtel courses (M2a)" und „Season pass, time trials, flow, mastery,
re-clip feedback, sidegrades (M2a)"; diese HANDOVER-Datei wurde für M2a nie aktualisiert, daher hier
nachgetragen). M2b liefert die restlichen sieben ROADMAP-M2-Punkte:

1. **Sicherungsmodi fertig** (GDD §3.3): Continuous hängt ab dem ersten echten Klick jede weitere
   Übung derselben Route automatisch ein (`interaction.js#autoAdvanceContinuous`, einmaliger i18n-
   Hinweis `notice.continuousBelay`), Classic bestraft „beide Karabiner offen" jetzt wirklich – neuer
   Spielerzustand `player/accident.js` (kinematischer Sturz) + `ui/accident-report.js` (trockener
   Unfallbericht: Route/Hindernis/Ursache/Zeit, zwei Sprachen), `save.recordAccident()`
   (`stats.accidents`), `session.abandonActiveRun()`. Klassischer Flying-Fox-Ritt bekommt eine eigene
   12-m-Handbremszone (`zipline/brakes.js#HAND_BRAKE`, `profile: "hand"`) statt der Netzbremse –
   zu wenig bremsen = „messy", zu früh voll zugreifen = permanent verhärtet und Strandung vor dem
   Podest (Handaufziehen wie bei der Netzbremse). 8 neue Tests `tests/unit/brakes-hand.test.mjs`.
2. **Nachtklettern** (GDD §3.7): Nachtticket ab der ersten geschafften Route an der Kassa wählbar
   (`openingHour 20.5`), Stirnlampe (`player/headlamp.js`, neuer `THREE.SpotLight`, 14 m/27°),
   Lampions an den beiden blauen Routen (`park/lampions.js`, rein emissiv, keine echten Lichter),
   Gäste tragen einen winzigen leuchtenden Punkt (`npc/guest-rig.js`, ebenfalls kein echtes Licht),
   Nerven-Höhenkomponente ×0,6 nachts + pauschaler Unbekannt-Zuschlag (`player/nerves.js`).
   `WIPFEL.debug.setNight(on=true)` erzwingt die Nacht ohne echtes Ticket.
3. **Foto-Modus** (`game/photo-mode.js`, neu): **P** pausiert wie Optionen, gibt die Kamera frei
   (WASD-Dolly + Maus-Look + Q/E-Höhe), blendet das gesamte HUD aus, **Leertaste** speichert einen
   PNG-Schnappschuss; `?autoplay=1` löst die Aktion nie aus.
4. **Katalog-Varianten + Umsetzstationen** (ROADMAP „20–25 Familien/Varianten"): 8 reine
   Parameter-Varianten der 12 Grundarten (`elements/catalogue-data.js#CATALOGUE_VARIANTS`,
   `element.js#registerElementVariant` – nie eine neue Mechanik), ab Rot-II/Schwarz/Legendär in den
   Generator gemischt (`layout-route.js#variantsAllowedFor`). Schwarze Routen mit einem Gesamt-Zip-
   Potential über 70 m bekommen eine **Umsetzstation**: eine zweite, komplett unabhängig geplante
   Zip-Etappe ab der Landung der ersten (`layout-route.js#buildZip`, `loader.js#buildOneZipLeg`) – kein
   gestrecktes Doppel-Seil, zwei echte, je für sich validierte Fahrten mit eigenem Umhäng-Ritual auf
   der Zwischenplattform. Empirisch bestätigt: **Schwarz-I in Seed 1 hat eine** (Etappe A 56 m, Etappe
   B 56 m).
5. **Politur:** gesättigte Routenfarben + Glüh-Effekt auf Kartenoverlay/Parkplan-Tafel (`ui/map-
   render.js#PATH_BLEND`), dünnere Linien, Überschriften-Kontrast auf Kassa-/Briefing-/Optionen-Panels
   (`css/screens.css`) – Routenbanner-Kategorieform und kategoriefarbene Stempel waren bereits vorhanden.
6. **Grafikoptionen** (`js/config.js#GRAPHICS`, drei Presets High/Medium/Low): Pixel-Ratio-Deckel,
   Schattenkarten-Größe (`world/sky.js#setShadowQuality`), Wald-Impostor-Distanz
   (`world/forest.js#setLodDistances`), Bodendetail-Radius (`world/ground-detail.js#setDetailScale`) –
   live angewendet, persistiert in `save.data.settings.graphics`.
7. **Touch-Steuerung** (`ui/touch-controls.js`, neu, bewusst einfach): virtueller Stick + Look-Drag-
   Fläche + drei Knöpfe auf `pointer: coarse`-Geräten oder `?touch=1`, füttert das bestehende
   Input-Aktionsmodell über `input.js#setVirtualState/addVirtualLook` – kein Remapping, keine Haptik.

**Zwei echte Bugs beim Verifizieren gefunden und behoben** (Details unten unter „Gefunden und behoben
in M2b"): die Stirnlampe zeigte durch einen three.js-Standardwert-Fallstrick ~46° in den Boden statt
nach vorne, und `world/forest.js` gab am öffentlichen `.lod`-Feld für immer die eingefrorenen
High-Standardwerte zurück statt der von `setLodDistances` tatsächlich gesetzten Werte (die LOD-
Umschaltung selbst funktionierte, nur die Introspektion log).

**Geprüft:** `node tools/check-all.mjs` **144/144**, `node --test --test-concurrency=1
"tests/unit/**/*.test.mjs"` **186/186** (grün, inkl. der neuen 8 Handbremse- + 6 Katalog-Varianten- +
5 Save-Tests und einer Korrektur an `layout.test.mjs`s Hindernisliste für die neue Umsetzstation).
Frischer `?debug=1`-Boot (echter Chromium via Playwright MCP): **0 Konsolenfehler/-warnungen, 0 externe
Requests** (129 Ressourcen, alle `127.0.0.1:8200`), **272 Draw-Calls / 718 888 Dreiecke** (Ziel ≤ 640 /
≤ 1,3 M – deutlich erreicht). Foto-Modus, Grafikoptionen (Klick auf Medium/Low, live + persistiert nach
Reload) und Touch-Steuerung (echter `pointerdown`/`pointerup` auf den virtuellen Knopf, `input.down
("clip")` schaltet korrekt) einzeln im Browser gegengeprüft, je 0 Konsolenfehler. Screenshots
`docs/screenshots/m2-accident.png` (Unfallbericht, klassischer Modus), `m2-night.png` (Nachtszene,
Sterne + Stirnlampen-Aufhellung sichtbar, 111 KB), `m2-coursemap2.png` (gesättigte Routenfarben +
Glüh-Effekt, 70 KB) – alle < 300 KB (PIL: 720 px Kantenlänge, 160-Farben-Palette). **Nicht erneut
verifiziert in dieser Session:** der volle `?autoplay=1&fast=1`-Durchlauf bis „blue-1 completed" – ein
eigener Versuch, den headless-`requestAnimationFrame` durch manuelles `loop._tick()`-Pumpen zu
umgehen (s. „Achtung headless" weiter unten), hat die Playwright-MCP-Browserverbindung in dieser
Session unwiederbringlich blockiert (zwei Aufrufe liefen je 1800 s in einen Timeout); keine M2b-
Änderung berührt Blue-Is eigenen Codepfad (Varianten sind ab Rot-II gattert, die Umsetzstation nur für
Schwarz), und der Mechanismus selbst ist in früheren Sessions dieser Datei wiederholt grün verifiziert.
Kein Git-Commit in dieser Session (Auftrag: der Lead prüft/committet/taggt `m2`); `ROADMAP.md` bewusst
unangetastet gelassen (Auftrag: „Tick NOTHING in ROADMAP", der Lead hakt ab).

**M1.7 Save + Optionen** (frühere Session, weiterhin gültig): Pause-/Optionen-Bildschirm (`js/ui/
2026-08-26, oben auf dem ebenfalls noch uncommitteten M1.1–M1.6): Pause-/Optionen-Bildschirm
(`js/ui/options.js` + `js/ui/options-controls.js`, neu) – **Esc** öffnet ihn jetzt statt des früheren
blanken `loop.paused`-Umschaltens (der Screen selbst setzt `loop.paused` beim Öffnen/Schließen, der Rest
der Loop-Verdrahtung bleibt unverändert: Physik/Gameplay laufen bei Pause weiter mit `dt = 0`, wie schon
vor M1.7), Esc/„Resume" schließt ihn wieder. Ein Panel, keine Unter-Navigation: oben Resume/Course-Map-
Shortcut/„End day" (teilt sich die Logik mit `WIPFEL.debug.endTicket()` über eine gemeinsame
`endTicketNow()` in `main.js` – der Debug-Pfad wurde damit zum offiziellen Feature, ausgegraut ohne
laufendes Ticket), unten die `GAME.version`-Zeile, dazwischen vier scrollbare Abschnitte: **Audio**
(vier Regler Master/Effekte/Umgebung/Oberfläche 0–100 %, `js/audio/synth.js` bekam dafür drei
Kategorie-Gain-Knoten neben `master` – `noiseBurst`/`ping`/`voice` nehmen jetzt ein optionales
`category`, Default `"sfx"`, sodass jeder bestehende Aufruf in `js/audio/sfx.js` ohne Änderung dort
bereits über den `sfx`-Bus läuft; `ambience`/`ui` haben noch keine Klänge – GDD-Ambiente/Interface-Sounds
sind M2 –, die Regler sind verdrahtet und bereit, wirken aber hörbar noch auf nichts, ehrlich als „Offen"
vermerkt), **Kamera & Bewegung** (Blickempfindlichkeit → `input.bindings.lookSensitivity`, Invertieren
→ neues `core/input.js#Input.invertY`, „reduziertes Kamerawackeln/Atmen" → `player.camera.
setReducedMotion()` – existierte bereits seit M0.7 extra für diesen Schalter, nullt Sturz-Shake **und**
nervenbedingtes Schwanken in einem Aufruf –, „reduzierte Bewegung (HUD)" → neue `body.reduced-motion`-
CSS-Klasse in `css/base.css`, spiegelt die vorhandene `prefers-reduced-motion`-Regel), **Gameplay &
Barrierefreiheit** (Assist-Modus, neues `js/player/assist.js` – Balance-Störung ×0,6, Sturzfenster ×1,35,
angewendet an den Aufrufstellen in `js/player/on-element.js`/`fall.js`, `BALANCE.topple`/`slipAngle`
selbst bleiben unangetastet; Sprachumschalter EN/DE → `initI18n`+`save.setLocale`, Panel rendert sich
selbst neu, HUD-Prompts/Banner lösen ohnehin bei jedem Aufruf frisch auf; ein Hinweistext bestätigt
Farbe+Form) und **Steuerung** (`js/ui/options-controls.js#renderControlsList`, nur lesbar aus
`input.bindings`, ohne Debug-Aktionen, „Neubelegung folgt später"). Farbe+Form-Lücken geschlossen:
Start-Banner (`hud-route.js#showBanner`) und Stempelkarte (`stamp-card.js`) zeigten das Kategorie-Symbol
bisher nicht, jetzt beide. **Save (`js/core/save.js`):** additiv `data.settings` (Audio, Blick-
empfindlichkeit `null`=Engine-Default, vier Booleans), `updateSettings(patch)`, `export()`/`import(json)`
(gleiche Validierung wie `load()`, dafür in eine gemeinsame reine `normalize(parsed)` extrahiert). `?options=1`
öffnet den Screen beim Boot (Screenshots, blendet dafür eine sonst gleichzeitig sichtbare Kassa aus);
`?autoplay=1` erreicht die `pause`-Aktion nie, zusätzlich in der Input-Phase defensiv abgesichert.
Geprüft (echter Chromium via Playwright MCP, `localStorage.clear()` + Reload für Frischstart):
`?options=1` öffnet **`options.visible === true`, `loop.paused === true`**, Kassa dabei ausgeblendet,
0 Konsolenfehler/-warnungen, 0 externe Requests; echte Klicks auf „Assist mode" und „Reduced camera shake
& breathing" setzen **`save.data.settings.assist/reducedCameraMotion === true`**, nach echtem Reload
weiterhin in `localStorage['wipfel-save-v1']` UND im frisch geladenen `save.data.settings` vorhanden;
Esc öffnet/schließt mit `loop.paused` synchron kippend (echter `KeyDown Escape`); Klick auf „Deutsch"
übersetzt Titel/Buttons/Sektionsüberschriften/Toggle-Labels sofort (`"Paused"→"Pause"`,
`"Resume"→"Fortsetzen"` etc.), `save.data.locale === "de"` persistiert. Voller `?autoplay=1&fast=1`-Lauf
danach (Assist/Sprache zurückgesetzt via frischem `localStorage`): **„blue-1 · 353.47 s · falls 0 ·
progress 5/5 · isBest true"**, **`save.data.unlocks.red === true`**, **0 Konsolenfehler/-warnungen, 0
externe Requests** (117 Ressourcen, alle `127.0.0.1:8200`), 404 Draw-Calls/0,83 M Dreiecke am Ende,
`options.visible === false`/`loop.paused === false` nach Lauf-Ende (Autoplay hat den Pause-Screen nie
geöffnet). `check-all` **131/131**, `node --test` **140/140** (134 + 6 neue Save-Settings/Export-Import-
Tests). Screenshot `docs/screenshots/m1-options.png` (Pause-Panel, Audio/Kamera/Gameplay-Sektionen
sichtbar, END DAY ausgegraut ohne Ticket, 170 KB).

**M1.4 Course Map + Parkplan UND M1.6 NPC-Gäste** (weiterhin uncommitted, Session 6, 2026-08-26):
Course-Map-Overlay (`js/ui/course-map.js`,
Tab öffnet/schließt, auch Esc/EXIT) 1:1 nach Mockup – dunkles Relief-Untergrundbild (einmal pro Park
gebacken, `js/ui/map-render.js#paintBackground`, Hangschattierung aus `terrain.normalAt` + Höhe→Grün-
Dunkel-Gradient, helle Wege), farbige Routenlinien mit weißen Podest-Punkten, gestrichelter Zip-Linie
zur Landung und Einstiegsring (jeden Frame neu gezeichnet, billig, `paintRoutes`), Live-Spielerpfeil
(Chevron mit Blickrichtung) und NPC-Punkte, Legende + FILTER (Alle→Blau→Rot→Schwarz)/PLAYER (zentriert)/
ZOOM (1×/2× um die aktuelle Bildmitte)/EXIT, Ziehen zum Verschieben nur bei Zoom, Hover/Klick zeigt Name/
Ziffer/Übungen/Höhe/Länge/Bestzeit/Sperrstatus. Öffnen pausiert die Welt NICHT (Loop läuft weiter hinter
dem dunklen Overlay), sperrt aber die Spielerbewegung (`input.move` wird in der Input-Phase auf 0
gesetzt, solange `courseMap.visible`) und hebt die Zeigersperre auf; ein `course-map-open`-Body-Klasse
blendet die durchscheinenden `#hud`-Texte (Routen-Header, Ticket-Box) aus, die sonst dieselbe Ecke wie
Titel/Filter-Chip belegten. `?map=1` öffnet sie beim Boot (Screenshots). Die diegetische Parkplan-Tafel
(`js/park/park-board.js`) steht neben dem Wegweiser-Cluster (`js/park/signs.js#averageBearing/
findNearPath` wiederverwendet): zwei Rundholzpfosten, Kopfbalken, eine gedruckte Karte (1024×768,
`map-render.js#paintStaticBoard`, „print"-Stil = helle Grünfläche + dunkelgrüne Waldflecken aus
seed-Rauschen statt echter Höhe, sechs Routen als farbige Linien mit römischen Ziffern in weißen
Kreisen, Titel „SONNWENDBERG ROPES PARK"/„WALDSEILPARK SONNWENDBERG", Legende) auf einer eigenen Fläche
vor einer Rückwand, dünner Kollider davor. **E** in 2 m öffnet die Course Map (eigene `.board-prompt`-
Zeile, kollidiert nicht mit `hud.setPrompt`).

NPC-Gäste (`js/npc/agents.js` + `js/npc/guest-rig.js`, 8–14 pro Seed, deterministisch aus `rng.fork`):
laufen vom Hub zum zugewiesenen Routen-Einstieg (Profil kids→blau/teens→rot/sporty→schwarz, ignoriert
Freigaben), Warteschlange + zwei-Klick-Pause vorm Einstieg, klettern die Leiter, queren jede Übung
entlang `element.rail` (kontinuierlich mit `element.walkSpeed`, getaktete Arten Schritt für Schritt über
`element.steps`/`.planks`), fahren den Flying Fox (leichte Wiederverwendung der echten Fahrt über
`element.setRider`/`trolleyAt`), pausieren auf Podesten, wandern zurück, wählen neu. Regeln geteilt mit
dem Spieler über `js/game/occupancy.js` (neu, rein): 1 pro Übung/Leiter (`RULES.maxPerElement`), Gäste
auf max. 2 pro Podest gedeckelt (`NPC.maxPerPlatformGuests`) – der Spieler zählt nie mit und wird nie
abgewiesen; bei Gleichstand gewinnt der Spieler (Schleifen-Reihenfolge in `main.js`: `interaction.
update()` vor `agents.update()`). `js/player/interaction.js` verweigert dem Spieler das Aufsteigen auf
eine von einem Gast belegte Übung mit „Wait for the climber ahead" / „Warte, bis vor dir frei ist"
(NICHT für die Leiter – bewusst außerhalb des Auftragsumfangs belassen, Gäste queuen dort nur
untereinander). Sichtbarkeit: `guest-rig.js` – zehn Körperteile (Torso/Kopf/Ober-/Unterarm links+rechts/
Ober-/Unterschenkel links+rechts), **je EIN** `THREE.InstancedMesh`, geteilt über alle Gäste (10 Draw-
Calls für die ganze Menge, Proportionen aus `player/rig-body.js#LAYOUT`), Torso-Farbe = Kategorie-Farbe
(Instanz-Farbe, keine Texturen), Entfernungsausblendung > 90 m überspringt nur die Pose-Berechnung
(Position bewegt sich weiter). Vertrauens-Haken (GDD „Zusehen gibt Vertrauen"): schließt ein Gast eine
Übung neben dem Podest ab, auf dem der Spieler steht, feuert `npc:watched-success` →
`vitals.nerves.watchSuccess()` (neue, kleine Methode, `NERVES.trustPerWatch`/`watchRelief`).
`?npc=0` deaktiviert Gäste komplett. Neue Tests `tests/unit/agents.test.mjs` (15, rein: Occupancy,
Warteschlange, Routen-Zuweisung determiniert). Screenshots `docs/screenshots/m1-coursemap.png`,
`m1-parkboard.png`. **Bekannte Einschränkung:** Tarzansprung/Skateboard haben keine eigene Gast-Animation
– Gäste queren sie wie eine normale kontinuierliche Übung (Fallback-Tempo), sehen also nicht wie ein
Sprung/Schub aus; die Routen auf der Tafel sind Linien/Ketten, keine geschlossenen Schleifen wie im
Vorbildfoto (unsere Routen sind Einbahn-Ketten zum Flying Fox, keine Rundwege).

M1.3/M1.5 (Vorsession, weiterhin gültig): Kassa-Bildschirm (`js/ui/kassa.js`, „ein
Blatt Papier" auf dem dunkel-transparenten App-Rahmen) mit Ticketart/Größenklasse/Sicherungsmodus als
anklickbare Kartenreihen; Confirm startet den Tag (`js/main.js#startDay`: `save.startTicket`,
`ticket.reset`, `sky.setTimeOfDay(9:00)`, `belay.setMode`, Größenklasse → `player.states.get("zipline")
.setRiderMass`, Notice „Ticket gültig bis …"). Einschulung (`js/game/briefing.js` +
`js/park/practice-stand.js`, neu): vier Trainer-Dialogzeilen (echter Inhalt aus RESEARCH-DATA §1 –
Gurt/ein Karabiner immer dran, eine Person pro Übung/drei pro Podest, Flying Fox nur bei freier
Landezone, Atmen bei Einfrieren), mit **E** vorgeblättert, dann ein echter Klick-Klick-Ritual-Test an
einem eigenen Übungsanker (`"practice-anchor"`, ein Pfosten + kurzes Seil auf 1 m nahe dem Spawn-Hub,
gegenüber der mittleren Peilung aller Routen-Einstiege) – erst danach akzeptiert **irgendeine**
Routen-Einstiegscable das Einhängen (`save.data.briefingDone`, geprüft in `player/interaction.js`, neue
Sperrzeile „Complete the briefing first" / „Zuerst die Einschulung abschließen"). Ticket-Uhr
(`js/game/ticket.js`, reine Logik, 11 Unit-Tests): 1 Spielstunde = `TIME.gameHourMinutes` reale Minuten,
Restzeit als `.hud-ticket`-Box oben rechts (`ui/hud-route.js#setTicket`); bei 30 Spielminuten ein Toast,
bei 0 ein Erweiterungsfenster (`[E]` = +30 min, max. 2×, `TICKET.extendPromptSeconds` = 8 s Gnadenfrist),
danach die Stempelkarte (`js/ui/stamp-card.js`, neu: Stempel je geschaffter Route mit Kategoriefarbe/
Ziffer/Name/Zeit/Stürze, Übungen gesamt, Höchsttempo Flying Fox, Rettungen, Rot/Schwarz-Freigabestatus,
Buttons „Neuer Tag" → Kassa erneut / „Weiter im Park bleiben" → `ticket.end()`, danach verweigert
`player/interaction.js` jedes neue Einhängen mangels Ticket). `js/game/session.js` trägt jetzt die
Tages-Statistik (`day`) und die ganze Ticket-Ende-Sequenz; `js/player/belay.js` bekommt `setMode()`
(kassa-Wechsel wirkt sofort, `mode` ist jetzt ein live Getter statt eines statischen Feldes);
`js/game/autoplay.js` feuert einmalig `kassa.confirmDefaults()` + `briefing.completeForBot()` auf dem
allerersten `update()`, damit `?autoplay=1` weiter unbeaufsichtigt läuft. Neuer Debug-Hook
`WIPFEL.debug.endTicket()` für Screenshots/Smoke-Läufe (erschöpft die Restzeit und ruft
`session.forceDayEnd()` direkt auf – überspringt die 8-s-Erweiterungs-Gnadenfrist komplett, landet sofort
auf der Stempelkarte). Noch **kein Commit** – siehe „Dateien, an denen gerade gearbeitet wird" (M1.2 UND M1.3/M1.5
liegen beide uncommitted übereinander).

## Letzter funktionierender Commit
`43993bb` „feat(elements): twelve traversable kinds with catalogue, discrete-step generalisation and
dev showcase" (M1.8, HEAD; Tag `m0` = `d20789e`, zwei Commits zurück – siehe `git log --oneline -8`).
M1.1 (Generator + Loader) und M1.2 (Schilder + Freigaben, diese Session) liegen komplett
**uncommitted** obendrauf.
Geprüft (2026-08-25, echter Chromium via Playwright MCP, Seed 1, sechs Routen, `python serve.py`):
`?autoplay=1` spielt Blue I komplett durch – Einhängen (F,F), Blockleiter, Burma-Brücke, hängende
Planken, Netz, Flying Fox mit Netzbremse, Landung – **„route completed in 111.16 s · falls 0“**,
Bestzeit im Save, **`save.data.unlocks.red === true`** danach (per `localStorage` geprüft);
**0 Konsolenfehler, 0 externe Requests**; `WIPFEL.course.routes.length === 6`; **434 Draw-Calls**
(Ziel ≤ 440 inkl. Schilder – erreicht; ohne Schilder 428, s. „Offen") / ~0,93 M Dreiecke am Spawn.
`check-all` 115/115, `node --test` 108/108 (104 + 4 neue Save-Gating-Tests).
Screenshots `docs/screenshots/m1-signs.png` (Wegweiser-Cluster, alle drei Tafeln lesbar), `m1-locked.png`
(Start-Banner „RED ROUTE · RAVEN RUN · Complete a blue route first" an einer gesperrten Route).

M1.3/M1.5 (diese Session, 2026-08-26) geprüft, echter Chromium via Playwright MCP, `localStorage.clear()`
+ Reload für den Frischstart: Kassa erscheint beim Boot vor Pointer-Lock, echte Klicks auf Happy-Hour/
Größe M/Klassisch + Confirm setzen **`save.data.ticket`** korrekt (`type/sizeClassId/belayMode`),
`belay.mode → "classic"`, `ticket.totalGameMinutes === 120`, `sky.timeOfDay ≈ 9.0`; Einschulung startet
automatisch, vier `[E]`-Drücke bringen sie zur Übungsanker-Phase, Teleport auf die aus `parkDef`/
`terrain.hubs[0]` berechnete Standposition + echtes **F, X** (klassischer Modus, zwei Karabiner einzeln)
schließt sie ab – **`briefing.phase === "done"`, `save.data.briefingDone === true`**, Belay danach wieder
offen. `WIPFEL.debug.endTicket()` erschöpft die Restzeit und ruft `session.forceDayEnd()` direkt auf –
die Stempelkarte öffnet sich ohne die 8-s-Erweiterungs-Gnadenfrist abzuwarten; „Neuer Tag" zeigt die
Kassa erneut, ein zweiter Confirm startet einen frischen
Tag; „Weiter im Park bleiben" setzt **`ticket.clippable === false`**, und am Einstiegsdeck-Anker liest
`interaction.prompt` daraufhin korrekt **„No active ticket – visit the kassa"**. Deutsches Locale
(`?locale=de`) spotgeprüft: Kassa-Titel „Kassa", Confirm „Tag starten", erster Trainer-Satz „Gurt an.
Immer mindestens einen Karabiner eingehängt lassen." – alle 114 Keys in `en.json`/`de.json` deckungsgleich
(automatisiert geprüft, keine fehlenden Keys in beide Richtungen). Vollständiger `?autoplay=1&fast=1`-Lauf
ab frischem `localStorage`: Bot bootstrapped Kassa+Einschulung in Frame 1 (`kassa.confirmDefaults()` +
`briefing.completeForBot()`), spielt Blue I komplett durch – **„route completed in 372.14 s · falls 0 ·
best true"**, **`save.data.unlocks.red === true`** danach, **0 Konsolenfehler/-warnungen** (eigener
Konsolen-Hook über den gesamten Lauf), **0 externe Requests** (alle 327 Requests → `127.0.0.1:8200`),
Laufzeit real **~103 s** (≤ 6-min-Ziel). Draw-Calls am Spawn vor der Kassa-Bestätigung **419** (Übungsstand
existiert erst nach `briefing.start()` → lazy gebaut, danach **2 zusätzliche Meshes**, wie geplant);
Dreiecke ~0,88–0,92 M, kein Regressions-Sprung ggü. M1.2. `check-all` 121/121, `node --test`
**119/119** (108 + 11 neue Ticket-Uhr-Tests). Screenshots `docs/screenshots/m1-kassa.png` (Kassa-Bildschirm,
alle drei Gruppen + Auswahl sichtbar), `m1-briefing.png` (Trainer-Dialog + Ticket-Box oben rechts,
Übungsstand im Hintergrund), `m1-stampcard.png` (Stempelkarte, „No routes completed today" da in diesem
Testlauf keine Route beendet wurde, bevor die Uhr erzwungen abgelaufen ist) – alle < 300 KB (PIL:
720 px Kantenlänge, 96-Farben-Palette).

M1.4/M1.6 (diese Session, 2026-08-26) geprüft, echter Chromium via Playwright MCP, `?debug=1` frischer
Lauf: **0 Konsolenfehler/-warnungen, 0 externe Requests** (Kassa+Briefing per `confirmDefaults()`/
`completeForBot()` bootstrapped). Gäste: `agents.count` 9 (im 8–14-Fenster), zwei Positions-Snapshots
5 s auseinander unterscheiden sich bei allen neun (Bewegung bestätigt); über einen `?fast=1`-Lauf von
~65 s real (≈ 4× simuliert) durchliefen mehrere Gäste den **kompletten Zyklus**: `wander → toEntry →
queue → clipIn → onRail/ladder → dwell → onRail/element (mehrfach) → onRail/zip → return → wander →
toEntry` (neue Routenwahl) – **0 Fehler über die gesamte Beobachtung**, Warteschlangen-Konkurrenz um
dieselbe Leiter beobachtet (mehrere Gäste gleichzeitig in `queue`, während einer `onRail` war). Occupancy-
Gate isoliert verifiziert: `occupancy.claimElement('burma-1','guest-test')` lässt `interaction.prompt`
auf **„Wait for the climber ahead"** springen und ein echter `KeyE`-Tastendruck bleibt wirkungslos
(`player.mode` bleibt `"ground"`); `releaseElement` gibt sofort wieder **„Step onto the Burma bridge [E]"**
frei und derselbe `KeyE`-Druck schaltet dann korrekt auf `player.mode === "element"`. Draw-Calls am
Spawn **438–439** (Ziel ≤ 480 – erreicht; vorher 434 mit Schildern, +13 durch Parkplan-Tafel [3 Meshes]
und Gäste-Rig [10 InstancedMesh]), Dreiecke **~898 k** (Ziel ≤ 1,05 M – erreicht), **`npc ms` = 0,10 ms**
im F1-Panel (Ziel ≤ 1 ms – deutlich erreicht). `?autoplay=1&fast=1` mit aktiven Gästen: **„route
completed in 341.04 s · falls 0 · best true"**, 0 Konsolenfehler, 0 externe Requests, Bot toleriert die
vorhandenen „stuck"/„shortcut"-Selbsthilfen unverändert (kein neuer Deadlock durch Occupancy in diesem
Lauf beobachtet – die Wartezeile kann in einem gegebenen Lauf auch schlicht nie ausgelöst werden, s.
Auftragstext „mindestens null Mal"). `check-all` **128/128**, `node --test` **134/134** (119 + 15 neue
Gast-Tests). Screenshots `docs/screenshots/m1-coursemap.png` (dunkles Relief, farbige Routen, weiße
Podest-Punkte, gestrichelte Zip-Linien, Spieler-Chevron, Legende+Buttons), `m1-parkboard.png`
(Nahaufnahme der Tafel: Titel, grüner Druck mit Waldflecken, Routen mit Ziffernkreisen, Legende,
„Open the course map [E]"-Prompt, Wegweiser-Cluster im Hintergrund) – beide < 300 KB (97 KB / 223 KB,
PIL: 900 px Kantenlänge, 128–160-Farben-Palette).

## Was funktioniert
- **Kern:** `js/main.js` (Boot + Loop-Verdrahtung), `core/{loop,input,rng,params,errors,events,renderer,physics}.js`,
  `ui/debug.js` (F1 Panel; **F2 / `?physics=1`** = Rapier-Wireframe – getrennt, weil das Heightfield-
  Wireframe alles überdeckt), `js/config.js` (Kategorien Green/Blue/Red/Black/Legendary, Regeln,
  Größenklassen).
- **Welt:** `world/terrain.js` (+ `terrain/{heightfield,paths,material,chunks,chunk-index}.js`; Hang N→S,
  Wege, Hubs `spawn@(11,-163) r20`, `hut@(-115,33)`, `deck-east@(113,-33)`, `deck-top@(-16,147)`;
  Rapier-Heightfield, `heightAt/normalAt/slopeAt/isPath`; **6 × 6 Chunks à 80 m mit Index-LOD
  (2/4/8 m) und Skirts, `terrain.update(dt, focusPos)`**), `world/ground-detail.js` (+ `procgen/geometry/ground-props.js`,
  `procgen/textures/{ground,texture-utils}.js`: Laub, Steine, Wurzeln, Gras – instanziert, Wind,
  **Distanzausblendung 45–90 m je Familie über `update(dt, focusPos)`**),
  `world/forest.js` (+ `forest-placement.js`, `procgen/geometry/tree*.js`, `procgen/textures/{bark,foliage,tree-texture-utils}.js`:
  Kiefer/Eiche/Buche/Ahorn/Hasel, 3 LODs, Instancing, Hero-Bäume mit Collidern, Wind-Shader),
  `world/wind.js`, `world/sky.js` (Dome, Sonne, Hemi, Nebel, Exposure, Tag/Nacht, `setTimeOfDay`),
  `world/lighting.js` (Sonnenbahn/Farben, unit-getestet), `world/skyline.js` (Hügelringe + Stadt-Silhouette).
- **Spieler:** `player/controller.js` (Rapier-KCC, Kapsel, Gehen/Sprint/Springen/Hänge, Zustandsautomat
  `states.js`, Tuning `tuning.js`), `player/camera.js` (Schulterkamera mit Kollision, Ego-Umschaltung T),
  `player/rig*.js` (prozedurale Kletterin: Tanktop, Capri, Komplettgurt orange, Handschuhe, Haarknoten;
  Posen idle/walk/run/jump/land/ladder; Attach-Punkte).
- **Park (M0.4):** `procgen/textures/wood.js` (Planke/Rundholz/verwittert, je Albedo+Normal+Rauheit,
  gecacht), `park/timber.js` (Bauteil-Kit; alles wird pro Material zu **einem** Mesh verschmolzen;
  `mergeParts` seit M1.1 exportiert, s. u.), `park/platform.js` (Rundholz-Rahmen, Planken mit Fugen und
  Stamm-Ausschnitt, Gummimanschette, 8 Klemmklötze mit Stahlbändern, Schrägstützen, 12-mm-Sicherungs-
  seilring 1,9 m über dem Podest), `park/entry-deck.js` (40 cm, Bank, Einhängeseil, Piktogramm-Schild),
  `elements/ladder.js` (dunkler Rücken, versetzte Klötze alle 28 cm, Stahlseil, blaues Hilfsseil).
  `procgen/geometry/tree-species.js#trunkRadiusAt` liefert den echten Stammradius (Verjüngung +
  Wurzelanlauf) – ohne das schwebt alles oben und steckt unten im Stamm.
- **Park-Layout-Generator + Loader (M1.1):** `park/layout.js` (`generateParkLayout({seed,terrain})`,
  `PARK_CONFIG` 2 blau/2 rot/2 schwarz, fächert Routen vom Spawn-Hub auf, "relax tree-angle first" bei
  Kollision) + `layout-route.js` (eine Routen-Kandidatin: Baumkette, Deckhöhen, Übungsart je Kante,
  Flying Fox über `zip-plan.js`; `LEGACY_BLUE_1` hält Blue-I's M0-Kanten-Kinds) + `layout-validate.js`
  (alle Prädikate: Spannweite 6–13,5 m, Kategorie-Deckfenster + Steigungslimit, Hub-/Weg-/Routen-
  abstand, Zip-Gefälle/Landezone – wiederverwendet von `tests/unit/layout.test.mjs` und
  `tools/bake-park.mjs`/`tools/dev/smoke-layout.mjs` über `tools/headless-terrain.mjs`, node-fähig, kein
  THREE). `park/loader.js` (`loadPark(parkDef,{...}) → course`) baut alle sechs Routen (Podeste,
  Einstiegsdeck, Leiter, Übungen über `elements/catalogue.js`, Flying Fox + Landepodest), ein
  gemeinsames Anker-/Graph-/Update-/Dispose-Interface über alle Routen, Route "blue-1" zusätzlich am
  Objekt-Wurzelniveau gespiegelt (M0-Konsumenten `interaction.js`/`autoplay.js` unverändert lauffähig).
  Anker-IDs routen-skopiert: `${routeId}-deck`, `${platform.id}-ring`, `elem-${edge.id}`,
  `${routeId}-zip`, `${routeId}-zip-out`. **Draw-Call-Optimierung:** Podeste/Deck/Leiter/Landepodest
  (+ die statische Flying-Fox-Hardware Gate/Klemmen/Markierhülse) werden pro Route ein zweites Mal zu
  einem Mesh pro Material verschmolzen (`loader.js#mergeRouteStatics`, nutzt `timber.js#mergeParts`) –
  senkt den Sechs-Routen-Park von ~590 auf ~428 Draw-Calls am Spawn (Ziel ≤ 420, s. „Offen").
  `tools/bake-park.mjs` schreibt `assets/parks/sonnwendberg.json` (Seed 1, node-only, vom Spiel nicht
  gelesen – Reproduzierbarkeits-Beleg). Ersetzt `park/first-course.js` (gelöscht).
- **Umhängen (M0.4):** `player/belay.js` (reine Logik, 11 Unit-Tests; smart = Zwei-Klick-Ritual,
  beide Karabiner können nie offen sein; continuous = ein Druck; classic = Fehler möglich),
  `player/interaction.js` (Anker in 1,6 m → F, Leiter in 1,5 m → E, Kontext-Prompt),
  `player/climb-ladder.js` (Schienen-Fortbewegung, KCC aus, 0,9 m/s, Leiter-Pose), `ui/hud.js`
  (Karabiner-Widget + Prompt mit `<kbd>`), `audio/synth.js` + `audio/sfx.js` (WebAudio-Klicks,
  erst nach echter Nutzergeste). Ablauf: F → F (einhängen) → E (klettern) → oben F → F (Podestring).
- **Übungen (M0.5 + M1.8 – 12 Übungsarten):** `elements/element.js` (gemeinsames Interface: Rail-Spline
  `pointAt/tangentAt`, Feder-Dämpfer-Wackelmodell, 12-mm-Sicherungsseil 2,05 m über der Trittlinie,
  `getDifficultyMetrics`), `elements/element-parts.js` (Seile mit Durchhang, gepresste Klemmhülsen,
  Schäkel, geschlagene Seile mit sichtbarem Schlag, Netzknoten), `elements/element-deform.js`
  (CPU-Deformer: der Timber-Builder verschweißt alles zu einem Mesh pro Material, der Deformer bewegt
  es wieder – ein Vertex-Klassifikat pro Bauteil, `offsets` pro Gruppe), `elements/hanging-steps.js`
  (geteiltes Pendel-Modell für Steigbügel/Seilschlaufen/Ringe: ein Schritt je Element, Nachbar-Kopplung
  über das Trägerseil), `elements/catalogue.js` + `catalogue-data.js` (alle 12 Arten registriert +
  Metadaten für den künftigen Generator; `catalogue-data.js` ist THREE-frei, damit sie in
  `tests/unit/catalogue.test.mjs` unter reinem Node prüfbar bleibt). `element.discrete === true`
  ersetzt seit M1.8 den harten `kind === "hanging-planks"`-Vergleich (`on-element.js`, `autoplay.js`).
  Zwölf Übungen: `burma-bridge.js` (Trittseil + zwei Halteseile 1,32 m, Hanfsteigbügel, 2 % Durchhang,
  0,60 m/s), `hanging-planks.js` (6–12 Bretter, **ein W-Druck = eine Planke**, eigenes Pendel je
  Planke), `net-bridge.js` (Netz 1,2 m breit, 15 cm Masche, Delle folgt dem Kletterer, 0,50 m/s),
  `beam-fixed.js` (starrer Ø-20-cm-Balken, keine Haltemöglichkeit), `beam-swing.js` (3–4 hängende
  Balkensegmente, durchgehend begangen, jedes schwingt für sich), `stirrups.js` (Steigbügel alle
  45 cm), `wire-loops.js` (dünne Variante: reine Seilschlaufe statt starrem Tritt), `barrels.js`
  (4–6 Fässer auf Achsseil, rollen unterm Fuß – eigenes rotierbares Mesh, der Deformer kann nicht
  drehen), `rings.js` (Ringe alle 50 cm, hängend, Füße frei, hohe Kraftkosten), `tarzan.js` +
  `player/on-tarzan.js` (eigener Zustand `"tarzan"`: Sprung [Space] in ein ±0,25-s-Fangfenster, sonst
  `fall` am Sicherungsseil; deterministisches Sinus-Pendel treibt Geometrie und Zustand aus derselben
  `elapsed`-Uhr), `skate.js` (Board an zwei Hängern auf zwei Seilen, Stoß + Trägheit über
  `element.railAccel`).
- **Ressourcen (M0.5):** `player/balance.js` (instabiles inverses Pendel – aufrecht ist ein
  Gleichgewicht, von dem man wegfällt; eine Hand am Seil macht es stabil und kostet Kraft),
  `player/stamina.js`, `player/nerves.js` (Höhe logarithmisch, Exposition, Wackeln, Böen, Runterschauen,
  Zeit; Erleichterung auf Podest / beim Atmen / bei Handkontakt; > 0,88 Einfrieren bis drei Atemzüge;
  Vertrauen dämpft jeden künftigen Anstieg), `player/vitals.js` (besitzt die drei Instanzen, HUD,
  Kamera-Atmen, Herzschlag- und Atem-Sounds, F1-Zeilen).
- **Auf der Übung / Sturz (M0.5):** `player/on-element.js` (Zustand `element`, `ownsMovement`; W/S
  fahren, A/D **lehnen**, Q / rechte Maustaste = Hände), `player/fall.js` (Zustand `fall`: dynamischer
  Rapier-Ball 70 kg an einem Seil-Joint zu einem kinematischen Karabiner auf dem Sicherungsseil,
  sichtbares Bandfalldämpfer-Band, Kamerasacken + Shake, `sfxHarnessCatch`; Hochziehen mit Leertaste,
  Hangeln mit W/S, Retter mit E).
- **Flying Fox (M0.6):** `zipline/physics.js` (Parabel-Durchhang statt echter Kettenlinie – bei 2 %
  unter 1 cm Unterschied auf 50 m und geschlossene Ableitungen; `dv/dt = g·slope − drag/m·|v−wind|·
  (v−wind) − rollResist·g`; Masse → Durchhang → steilere erste Hälfte **und** mehr Schwung pro
  Stirnfläche, deshalb ist schwerer schneller), `zipline/brakes.js` (Netzbremse, Entscheidung wird
  **an der Markierhülse eingerastet**), `park/zip-plan.js` (Trassensuche: Gefälle, Lichtraum,
  Baumfreiheit, Landezone, Weg zurück – seit M1.1 der produktive Aufrufer ist `layout-route.js`,
  einmal je Route zur Generierzeit; der Loader sucht nie neu), `elements/zipline.js`
  (Seil + Startgatter mit Piktogramm + Markierhülse + Netz + Trolley; das Zip-Seil **ist** das
  Sicherungsseil, deshalb funktionieren Anker und Ritual unverändert), `park/zip-landing.js`
  (Ankunftspodest, Rampe, Hackschnitzelbett, Erdanker), `player/on-zipline.js` (Zustand `zipline`,
  Ego-Kamera automatisch, Körper bleibt sichtbar, Kopf ausgeblendet), `ui/hud.js#setSpeed/setNotice`,
  `audio/sfx.js#sfxTrolley/sfxWindRush/sfxZipArrive` über `synth.voice()` (Dauerton mit Live-Handle).
- **Tests:** `node tools/check-all.mjs` (**121 Dateien**), `node --test` (**119 Tests**: RNG, Lighting,
  Belay, Balance, Stamina, Nerves, Chunk-Index, Zipline, Route, Catalogue, i18n, Save (**+4 M1.2:
  Freigabe-Fortschritt, Migration**), Layout (M1.1, 11 Tests), Ticket (**+11 M1.3/M1.5**: game-time
  mapping, Restzeit, Warnschwelle, Ablauf, Verlängerungsdeckel), check-all).
- **Dev-Seiten:** `tools/dev/{forest,terrain,sky,player}.html` – je Modul isoliert testbar
  (`?seed=`, Views, Bot); Screenshots `docs/screenshots/dev-*.png`.

- **Route/HUD (M0.7, generalisiert M1.1):** `core/i18n.js` + `assets/strings/en.json|de.json` (EN
  Standard, DE komplett; Prompts, HUD, alle sechs Routennamen), `core/save.js` (Schema v1, Bestzeiten
  je Routen-ID, validiert), `game/route.js` (`createRouteRun(def)`: idle→armed→countdown→running→done,
  unit-getestet; `BLUE_I` bleibt als Fixture; **`routesFromPark(parkDef)`** – neu M1.1, rein, ein
  Run-Def je generierter Route; `heightM`/`lengthM` echte Zahlen aus `parkDef`, `lengthM` seit M1.2
  abzüglich der beiden `EDGE_OFFSET`-Vorläufe je Kante statt Baum-zu-Baum-Luftlinie), `game/session.js`
  (seit M1.1 **ein Run pro Route**, alle laufen mit; Events werden an alle gebroadcastet – jeder Run
  ignoriert Ids/Zustände, die ihm nicht gehören, also kommt höchstens einer voran; HUD folgt dem Run,
  der zählt/fährt, sonst dem nächsten Einstiegsdeck **in 6 m**), `ui/hud-route.js` (Routen-Header mit
  Farbbalken 1:1 nach Mockup, FLOW-Platzhalter, Banner mit Kennzahlen, Countdown-Scheiben),
  `game/autoplay.js` (?autoplay=1: prompt-getriebener Bot, spielt Blue I komplett durch; Podest-Hops
  als dokumentierte Selbsthilfe; liest `course.ladderAnchorId`/`course.entryDeck` – beides zeigt dank
  Loader weiterhin auf Blue I).
- **Schilder + Kategorie-Freigaben (M1.2):** `park/signs.js` (`createSigns({parkDef,scene,terrain,
  textures,rng}) → {group,dispose}` – liest `parkDef` + Terrain-Sampler direkt, nie den gebauten
  `course`, läuft also unabhängig von `loadPark`): Wegweiser-Cluster am Hub-Rand (ein Pfosten + eine
  pfeilförmige Tafel je Kategorie in diesem Park, Pfeil auf die Kreismittel-Peilung der eigenen Routen
  gedreht – wie ein echter Wegweiser, jede Zunge zeigt für sich) und ein Namensschild je Route am
  Einstiegsdeck (Ziffer + lokalisierter Name). Jede Tafel: zwei flache Pfeilsilhouetten
  (`arrowGeometry`, `THREE.Shape` mit von Hand neu gesetzten UVs) – eine weiße mit gebackener
  Canvas-Textur (erste echte `ctx.fillText`-Nutzung im Projekt; Wort schrumpft bis es vor die
  Ziffernkreise passt, `fitText`, Deutsch läuft länger als Englisch) und ein etwas größerer
  Kategorie-Farb-Unterleger dahinter. Tafel sitzt um die halbe Eigenlänge vor ihrem Pfosten versetzt
  (der Pfosten steht am Pfeil-*Ende*, nicht in der Mitte – mittig gebaut, stand der Pfosten mitten durch
  die Schrift und schluckte immer denselben Textabschnitt, unabhängig vom Wortlaut). Draw-Calls: ein
  Mesh für alle Pfosten (`timber.js`-Builder, „log"), ein Mesh **je Kategorie-Farbe** für alle
  Unterleger zusammen (`timber.js#mergeParts`), nur die weiße Schriftfläche bleibt je Tafel eigen (fürs
  ganze Modul ≤ 9 Meshes); nichts wirft Schatten (dünne Tafel, Schatten-Pass würde die Draw-Calls
  verdoppeln). `core/save.js#unlocks` (additiv, Blau immer `true`, Rot/Schwarz `false`; `isUnlocked`,
  `unlockCategory`, `nextGateCategory` – Blau→Rot→Schwarz→`null`), `player/interaction.js` (optionales
  `save`: Einhängen an der Einstiegs-Cable eines gesperrten Anchors wird verweigert, Prompt zeigt
  `notice.lockedRed`/`lockedBlack` statt des Einhäng-Textes – der Anchor bleibt „erreichbar" fürs
  Prompt, nur das Einhängen selbst nicht), `game/session.js` (schaltet bei `zip:finished` die nächste
  Farbe frei, eine gemeinsame Notice statt zwei konkurrierender, `showBanner(def,best,locked)` bei
  gesperrter Route ohne `arm()`), `ui/hud-route.js` (`showBanner`s dritter Parameter tauscht
  Kennzahlen/Bestzeit/START gegen die Sperrzeile), `css/screens.css#.start-banner .locked`.
- **Kassa + Einschulung + Ticket-Uhr + Stempelkarte (M1.3/M1.5):** `js/game/ticket.js` (reine Uhr:
  `gameHoursElapsed`/`timeOfDayFor` + `createTicketClock` – `started/expired/clippable/extensionsLeft`,
  `update/extend/reset/end`, keine Callbacks, 11 Unit-Tests), `js/ui/kassa.js` (Ticketart/Größenklasse/
  Sicherungsmodus als Kartenreihen, `confirmDefaults()` für `?autoplay=1`), `js/game/briefing.js` +
  `js/park/practice-stand.js` (vier Trainer-Dialogzeilen + echter Klick-Klick-Test am eigenen
  Übungsanker, `save.completeBriefing()`, `completeForBot()`), `js/ui/stamp-card.js` (Tagesabschluss:
  Stempel je Route, Kennzahlen, Freigabestatus, „Neuer Tag"/„Weiter im Park bleiben"). `core/save.js`
  führt `briefingDone` und `ticket` (additiv, `null` = kein Tag aktiv); `player/belay.js#setMode` (live
  `mode`-Getter, Kassa-Wechsel wirkt sofort); `player/interaction.js` verweigert ein **neues** Einhängen
  ohne `save.data.briefingDone` bzw. ohne `ticket.clippable` (laufende Übungen werden nie unterbrochen);
  `game/session.js` trägt die Tages-Statistik (`day`) und die Ticket-Ende-Sequenz (30-Min-Toast,
  Verlängerungsfenster `[E]`, dann `stampCard.show`); `ui/hud-route.js#setTicket` zeigt die
  `.hud-ticket`-Box oben rechts; `game/autoplay.js` bootstrapped Kassa+Einschulung einmalig auf dem
  ersten `update()`. Debug: `WIPFEL.debug.endTicket()`.
- **Course Map + Parkplan-Tafel (M1.4):** `js/ui/map-render.js` (geteilter Renderer, THREE erlaubt –
  reine Browser-Canvas-Logik: `computeBounds`/`createProjector` aus `parkDef`+Terrain-Sampler,
  `paintBackground` bäckt einmal ein kleines Offscreen-Relief/„print"-Bild und skaliert es hoch,
  `paintRoutes` zeichnet Routenlinien+Podest-Punkte+Zip-Strichlinie+Ziffernkreise günstig jeden Frame,
  `paintStaticBoard` kombiniert beides + Titel + Legende zu einem Schuss für die Tafel; `mapColourOf`
  ersetzt die echte fast-schwarze „schwarz"-Kategoriefarbe nur auf der dunklen Kartenfläche durch ein
  helles Grau – auf der hellen Tafel bleibt die echte Farbe). `js/ui/course-map.js` (Tab-Overlay,
  Kartencache + Live-Overlay, Filter/Player/Zoom/Exit, Hover-Info aus `game/route.js#routesFromPark` +
  `save`, `course-map-open`-Body-Klasse blendet `#hud` aus, sperrt Bewegung ohne den Loop zu pausieren).
  `js/park/park-board.js` (zwei Pfosten + Kopfbalken aus dem Timber-Builder, eigene Print-Textur-Mesh,
  Platzierung neben `park/signs.js`s Wegweiser-Cluster über dessen exportierte `averageBearing`/
  `findNearPath`, dünner Kollider, eigene `.board-prompt`-Zeile, **E** in 2 m öffnet die Course Map).
- **NPC-Gäste (M1.6):** `js/game/occupancy.js` (rein, geteilt mit dem Spieler: `createOccupancy`
  Element-/Podest-Kapazität, `createQueue`/`createQueueRegistry` FIFO-Warteschlangen). `js/npc/agents.js`
  (THREE-frei: `planAgents` deterministische Profil-/Routen-/Look-Zuweisung je Seed, `createAgents` der
  Laufzeit-Zustandsautomat `wander→toEntry→queue→clipIn→onRail→dwell/unclip→return`, ruft `element.
  pointAt/tangentAt`/`ladder.rail`/`element.setRider` über einen winzigen lokalen `vec3`-Duck-Type ohne
  selbst `three` zu importieren). `js/npc/guest-rig.js` (zehn geteilte `THREE.InstancedMesh`, eine
  Pose-Skeleton-Instanz für alle Gäste nacheinander wiederverwendet, Torso-Farbe = Kategorie-Farbe,
  Entfernungsausblendung > 90 m). `js/player/interaction.js` (`occupancy`-Parameter, optional: verweigert
  dem Spieler eine von einem Gast belegte Übung mit `notice.waitForClimber`, beansprucht/gibt selbst
  einen Element-Slot als `"player"` frei). `js/player/nerves.js#watchSuccess()` (neu, kleine
  Vertrauens-/Nerven-Anpassung für `npc:watched-success`). `?npc=0` deaktiviert Gäste, `?map=1` öffnet
  die Course Map beim Boot. Tests `tests/unit/agents.test.mjs` (15, rein).
- **Pause/Optionen + Settings (M1.7):** `js/ui/options.js` + `js/ui/options-controls.js` (Panel:
  Resume/Course-Map/End-day, Audio/Kamera & Bewegung/Gameplay & Barrierefreiheit/Steuerung, `applyAll()`
  fürs Booten), `js/player/assist.js` (Assist-Skalierung, gelesen von `on-element.js`/`fall.js`),
  `core/save.js#data.settings` (additiv) + `updateSettings`/`export`/`import`, `audio/synth.js`
  (Kategorie-Gain-Busse `sfx`/`ambience`/`ui` neben `master`), `core/input.js#invertY`. `?options=1`
  öffnet beim Boot. Details/Prüfnachweis: oben unter „Aktueller Meilenstein“, Verträge in
  `docs/architecture.md#Options + settings (M1.7 – contracts)`.
- **Park-Skalierung, Kreuzungspodeste, Wichtel, Saisonpass/Zeitläufe/Flow/Meisterschaft/Sidegrades
  (M2a):** 15 gesicherte Routen + legendäre Route über vier Hubs (`park/layout.js#PARK_CONFIG`),
  Kreuzungspodeste (`layout-route.js`s `join`-Option, geteilte Podeste in `loader.js`), zwei
  Wichtel-Bodenparcours (`park/wichtel.js`, reine Deko), Saisonpass (`ticket.js`, `hours: Infinity`),
  Zeitläufe (`route.js#markTrial`), Flow (`game/flow.js`), Meisterschaftsstufen (`game/mastery.js`),
  Umhäng-Feedback (`game/clip-meter.js`), Sidegrades (`player/sidegrade.js`, drei Kassa-Optionen).
  Details/Verträge: `docs/architecture.md`, Abschnitte „Park scale-up, junctions, Wichtel courses (M2a)"
  und „Season pass, time trials, flow, mastery, re-clip feedback, sidegrades (M2a)" (diese Datei wurde
  für M2a nie eigens aktualisiert – siehe „Aktueller Meilenstein" oben für den Nachtrag).
- **Sicherungsmodi fertig, Nachtklettern, Foto-Modus, Katalog-Varianten + Umsetzstationen, Politur,
  Grafikoptionen, Touch-Steuerung (M2b):** `player/accident.js` + `ui/accident-report.js` (klassischer
  Unfall), `zipline/brakes.js#HAND_BRAKE` (Handbremse), `player/headlamp.js` + `park/lampions.js`
  (Nachtklettern), `game/photo-mode.js`, `elements/catalogue-data.js#CATALOGUE_VARIANTS` +
  `layout-route.js`s Umsetzstation, `js/config.js#GRAPHICS` + `ui/options.js`s Grafik-Sektion,
  `ui/touch-controls.js`. Details/Prüfnachweis: oben unter „Aktueller Meilenstein“, Verträge in
  `docs/architecture.md#Belay modes complete, night climbing, photo mode, catalogue variants, graphics
  options, touch (M2b)`.
- **Builder-Modus, Parcours-Inspektor, Begehungspflicht (M3a):** `js/builder/{survey-trees,builder-
  validate,builder-state,builder-metrics,builder-camera,builder-overlays,builder-zip-tool,builder-
  inspector,builder-tool-panels,builder-ui,builder}.js`, `css/builder.css`. Erreichbar über die „Park
  builder"-Zeile im Optionsbildschirm oder `?builder=1` (+ `?autowalk=<routeId>` für den Bot).
  `js/core/save.js#data.customPark` (additiv), `js/main.js#rebuildFromParkDef` (Wiederaufbau-Kaskade
  bei angewendetem Entwurf), `js/game/autoplay.js`s optionaler `route`-Parameter. Details/Prüfnachweis:
  oben unter „Aktueller Meilenstein", Verträge in `docs/architecture.md#Builder (M3a …)`.
- **Gäste-Profile, Angst/Panik, Retter-Rolle, Betrieb, Ökonomie, Teilen (M3b):** `js/npc/profiles.js`
  (neu), `js/npc/agents.js` (erweitert), `js/game/{rescue,operations,economy}.js` (neu),
  `js/builder/operator-panel.js` (neu), `js/builder/{builder-overlays,builder-state,builder-metrics,
  builder-ui,builder-tool-panels,builder-inspector,builder}.js` (erweitert), `js/ui/{kassa,options}.js`
  (erweitert), `js/player/interaction.js` (erweitert), `js/game/occupancy.js` (`createStatTracker`),
  `js/world/wind.js` (`setDailyBias`), `js/core/save.js` (`data.operations`/`data.economy`,
  `CUSTOM_PARK_SCHEMA`/`isValidCustomPark` exportiert). Details/Prüfnachweis oben unter „Aktueller
  Meilenstein", Verträge in `docs/architecture.md#Operator simulation (M3b …)`.
- **Lokales Koop, zwei Koop-Übungen, geteilte Kamera, geteilte Physik, Zuschauer-Rufe (M4):**
  `js/game/{coop,coop-elements}.js` (neu), `js/core/input-source.js` (neu) + `js/core/input.js`
  (`setGamepadEnabled`, neue Gamepad-Taste „interact"), `js/player/coop-camera.js` (neu, rein),
  `js/elements/{team-bridge,counterweight-lift}.js` (neu, zwei Koop-Katalogarten), `js/elements/
  catalogue-data.js` (`COOP_CATALOGUE`, drittes Array), `js/park/{layout,layout-route}.js`
  (`coopEdge`-Feld, erzwungene Kanten-Art), `js/game/occupancy.js` (Kapazität > 1 verallgemeinert),
  `js/player/interaction.js` (`holderId`), `js/player/{controller,rig,camera}.js` (`rigVariant`/
  `colourVariant`, `setFocusOverride`), `js/ui/{kassa,options}.js` (erweitert), `js/core/save.js`
  (`data.settings.sharedPhysics`), `js/ui/stamp-card.js` (Begleit-Abzeichen), `js/ui/hud.js`
  (`renderPromptNodes` exportiert). Details/Prüfnachweis oben unter „Aktueller Meilenstein", Verträge in
  `docs/architecture.md#Local co-op (M4 …)`.

## Was halb fertig ist
- **M3b (s. oben für die volle Liste bewusster Vereinfachungen):** kein Screenshot für die Sturm-
  Räumung (`m3-storm.png`) – Umgebungsgrenze der Browser-Werkzeuge dieser Sitzung, Mechanik selbst per
  Zustandsabfrage bestätigt (s. „Geprüft" oben). `?autoplay=1&fast=1` nicht live neu bestätigt, dafür
  ein echtes Regressionsrisiko gefunden und behoben (`allowPanic`, s. oben). Retterposten-Platzierung
  läuft wie jedes andere M3a-Werkzeug über eine DOM-Liste (Hubs + Routen-Einstiege als Kandidaten), kein
  freier 3-D-Klick. Rettungsabdeckung ist eine Graph-/Boden-Distanz-**Näherung** (kürzester Weg vom
  nächsten Posten zum Routen-Einstieg, dann die Route entlang), kein echter Pfadsucher über den ganzen
  Park. Kurze/lange Wartezeit als Bewertungsfaktor existiert nur als reine Funktion in `economy.js`,
  ohne Verdrahtung an ein Auslöse-Ereignis. Autoren-Feld beim Teilen wird nicht gespeichert (nur für den
  jeweiligen Export getippt) – kein neues Save-Feld dafür angelegt.
- **M3a Builder:** Podest-Bearbeitung ist bewusst nur „anhängen/letztes entfernen" (Kette wächst/schrumpft
  ausschließlich am Ende) plus „verschieben" (beliebige Position, anderer Baum) – kein Einfügen/Löschen
  mitten in der Kette; das deckt „add/remove/move platform" aus dem Auftragstext ab, ohne die
  Kanten-Neuverkettung zu bauen, die ein Mitten-Einfügen bräuchte. Baum-/Übungsart-/Kategorie-Auswahl
  läuft über DOM-Listen/Dropdowns in der Werkzeugleiste, nicht über 3-D-Klicks/Ziehen auf dem Gelände
  selbst (die 3-D-Overlays sind reine Visualisierung, keine Klickziele) – bewusste Vereinfachung angesichts
  der Zeit für Raycasting/Drag-Handles; das Flying-Fox-Werkzeug ist die eine Ausnahme mit echtem Ziehen,
  aber auf einer 2-D-Top-down-Canvas statt der 3-D-Ansicht. `rebuildFromParkDef()` baut `forest/course/
  signs/parkBoard/interaction/session/courseMap/agents/guestRig` neu auf, aber **nicht**
  `briefing`/`lampions`/`wichtel` – `briefing`s Übungsstand-Platzierung ist einmalig und bleibt gültig
  (Terrain ändert sich nie), `lampions` könnten nach einer Blau-Routen-Bearbeitung leicht von der neuen
  Geometrie abweichen (rein optisch, keine Kollision). Retter-Abdeckung im Inspektor ist ein reiner
  Platzhalter („kommt mit M3b"), nie berechnet. Der Builder erstellt nie eigene Kreuzungspodeste
  (`kind: "junction"`) – nur eine Schutzfunktion gegen versehentliches Zerstören einer geerbten
  Kreuzung aus dem generierten Park (`removeRoute` verweigert das Löschen des Host, `movePlatform`/
  `removePlatform` verweigern eine Kreuzungs-Plattform). Guide-/Retter-Rolle, PSA-Alterung, Wetter/
  Räumung, Ökonomie/Ticketmodelle, Teilen – alle explizit M3b/M3c (GDD §4, zweite Hälfte).
  **Beim Verifizieren beobachtet, kein Builder-Bug:** der `?autoplay=1`-Bot (auch über `?builder=1&
  autowalk=`) hält bei einem Sturz nur `Space` (Hochziehen) – wird die Kraft dabei leer UND die Nerven
  frieren gleichzeitig ein (`nerves.frozen`), bleibt der Bot hängen, weil er nie „Retter [E]" drückt oder
  „Atmen [R]" hält; einmal von drei Begehungs-Läufen beobachtet (die anderen zwei liefen sauber durch,
  ebenso wie ein separater `?autoplay=1&fast=1`-Normallauf). Vorbestehende Grenze in `js/game/
  autoplay.js`s Sturzbehandlung (unverändert von dieser Session), keine Regression durch die
  `route`-Parametrisierung – aber nicht behoben, da außerhalb des Builder-Auftragsumfangs.
- **M1.4/M1.6:** Gäste behandeln Tarzansprung und Skateboard wie eine normale kontinuierliche Übung
  (Fallback-Tempo `NPC.elementSpeedFallback`, `element.pointAt` statt der echten Sprung-/Schub-Mechanik)
  – sieht aus wie ein gewöhnliches Queren, nicht wie ein Sprung; eigene Gast-Posen für diese zwei Arten
  wären ein eigener Schritt. Die Occupancy-Sperre gilt für den Spieler nur auf Übungen/Flying Fox, nicht
  auf die Leiter (bewusst außerhalb des Auftragstexts „stepping onto an element" belassen – Gäste queuen
  dort nur untereinander); ein Sturz (`"fall"`-Zustand) gibt den Element-Slot sofort frei statt ihn zu
  halten, bis der Kletterer zurück auf ein Podest ist – dokumentierte Vereinfachung, kein Absturzrisiko,
  weil die Kapazität ohnehin 1 bleibt. Die Parkplan-Tafel zeigt Routen als Linien/Ketten (unsere Routen
  enden am Flying Fox, sind keine Rundwege) statt echter geschlossener Schleifen wie im Vorbildfoto.
- Route-Header/Banner/Countdown zeigen nur die Route, die der Spieler gerade angeht (nächstes
  Einstiegsdeck in 6 m oder laufender Run) – das steht seit M1.2, Schilder und Freigaben ebenso.
  **Offen bleibt aus der ursprünglichen M1.2-Liste in `ROADMAP.md`:** eigene Podest-*Typen*
  (Übergang/Kreuzung/Rast/Hub als Bauvarianten – `platform.js#kind` kennt bisher nur
  „standard"/„transition") für Routen, die sich Bäume teilen könnten; diese Session hat nur Schilder,
  Freigaben und Banner gebaut (so beauftragt), keine neuen Podest-Bautypen.
- Draw-Calls liegen bei **434** (Ziel ≤ 440 inkl. Schilder – erreicht; ohne Schilder 428, altes
  M1.1-Ziel ≤ 420 weiter offen, s. „Offen"); die Übungen/der Flying Fox je Route bleiben bewusst
  unverschmolzen (Wobble-Deformer/Trolley-Bewegung brauchen ein eigenes Mesh je Instanz).
- **M1.7:** die `ambience`/`ui`-Audio-Busse haben noch keine Klänge (kein Ambiente, keine UI-Sounds im
  Spiel – s. „Offen"); Tastenbelegung ist nur lesbar (`js/ui/options-controls.js`), Neubelegung selbst
  ist laut Auftrag „vorbereitet, nicht implementiert" und bewusst nicht gebaut.

## Was kaputt ist
– nichts Bekanntes. Beobachtungen: siehe „Offen / Provisorisch“.

**Gefunden und behoben in M3b:**
- `js/builder/builder-ui.js`: der äußere `.builder-ui`-Container bekam nie ein initiales
  `hidden = true`; `setVisible()` ist die einzige Stelle, die `.hidden` je anfasst, und die wird nur aus
  `js/builder/builder.js#enter()`/`exit()` gerufen – keins von beiden läuft bei einem frischen
  „closed"-Boot. Die komplette Builder-Werkzeugleiste/Routenliste/Inspektor war dadurch bei **jedem**
  Boot sichtbar und überlappte das normale Gameplay-HUD, unabhängig von `?builder=1` – unsichtbar für
  frühere Prüfungen, weil M3a nur `?builder=1`-Boots screenshotete. Behoben mit `container.hidden = true`
  direkt bei der Konstruktion, wie es `js/builder/builder-zip-tool.js`s eigenes Panel schon immer richtig
  gemacht hat. Gefunden beim Versuch, einen sauberen `?debug=1`-Screenshot für die Retter-Rolle zu
  bekommen (das Panel drängte sich mit ins Bild) – live per `window.WIPFEL.builder.mode === "closed"` +
  `document.querySelector('.builder-ui').hidden` vor/nach dem Fix bestätigt.

**Gefunden und behoben in M2b:**
- `player/headlamp.js`: `THREE.SpotLight` (wie `DirectionalLight`) setzt seine `position` im Konstruktor
  standardmäßig auf `Object3D.DEFAULT_UP` = `(0, 1, 0)`, nicht auf den Ursprung – damit der Licht-zu-Ziel-
  Vektor nie entartet ist. Ungesetzt (erster Wurf) saß das Licht 1 m über dem Kopfanker, während sein
  Ziel nur ~0,04 m darunter lag: die ganze Lichtkeule zeigte ~46° in den Boden statt „leicht nach unten,
  geradeaus" wie im Kommentar behauptet – ein Screenshot in Kopfhöhe zeigte keinerlei sichtbaren Kegel,
  weil er nie auf etwas vor dem Spieler zeigte. Behoben mit einem expliziten
  `light.position.set(0, 0, 0)`; bestätigt über die live `matrixWorld`-Translation von Licht und Ziel
  (annähernd horizontaler Vektor, deckungsgleich mit der Blickrichtung des Spielers). `headlampIntensity`
  gleichzeitig 7 → 35 nachgezogen: 7 war nur je gegen die falsche (in-den-Boden-zeigende) Ausrichtung
  über den Daumen gepeilt worden und lag, einmal korrekt ausgerichtet, unter der 8-Bit-Anzeigeschwelle
  (bestätigt über einen kontrollierten Pixel-Diff bei pausiertem Loop, Licht an/aus, gleiche Kameraposition).
- `world/forest.js`: `createForest(...)` gab am zurückgegebenen Objekt `lod: FOREST_LOD` zurück – die
  **eingefrorene** High-Standardkonstante – statt der veränderlichen `{near, mid}`-Variable, die
  `setLodDistances` tatsächlich beschreibt und `lodFor()` tatsächlich liest. Die echte LOD-Umschaltung
  war nie kaputt (`stats.byLod` verschiebt sich sichtbar, wenn `setLodDistances` aufgerufen wird –
  bestätigt mit `{near:5, mid:10}`, fast jeder Baum wandert in den Impostor-Eimer), aber jeder externe
  Leser von `forest.lod` (F1-Panel, ein künftiger Test) hätte für immer die High-Standardwerte gesehen,
  unabhängig vom aktiven Preset. Behoben, indem das echte lokale `lod`-Binding zurückgegeben wird; kein
  anderes Modul las `forest.lod` vor dieser Korrektur (sauber gegrept), also verhaltensneutral außer der
  jetzt ehrlichen Introspektion.

**Gefunden und behoben in M0.6** (betraf auch M0.4/M0.5, nur weniger sichtbar):
`player/controller.js#moveBody` hat die Geschwindigkeit aus dem zurückgemeldeten KCC-Weg abgeleitet –
inklusive der Korrektur, mit der der Character-Controller die Kapsel aus einer Durchdringung
schiebt. Ein Zustand, der auf ein Podest teleportiert (Zip-Ankunft, Abstieg von einer Übung, Retter),
konnte die Figur damit mit **25 m/s** wegschleudern. Jetzt gilt: ein Hindernis kann Tempo nur
wegnehmen, nie hinzufügen (`asked`-Klemme).

## Dateien, an denen gerade gearbeitet wird
– keine offene Baustelle, aber **alles seit Tag `m0` (`d20789e`) ist uncommitted**, inklusive M3b (diese
Session), M3a, M2b, M2a (davor, nie eigens eingetragen, s. „Aktueller Meilenstein"), M1.8 (bereits HEAD
`43993bb`, s. u.), M1.1, M1.2, M1.3/M1.5, M1.4/M1.6 und M1.7.
M3b laut geänderten Dateien: neu
`js/npc/profiles.js`, `js/game/{rescue,operations,economy}.js`, `js/builder/operator-panel.js`,
`tests/unit/{operations,economy,rescue}.test.mjs`, `docs/screenshots/{m3-operator,m3-rescue}.png`;
geändert `js/config.js` (`FEAR`, `RESCUE`, `OPERATIONS`, `ECONOMY`, `NPC.profiles` entfernt – zog nach
`profiles.js` um), `js/npc/agents.js` (Profile aus `profiles.js`, Angst/Panik-Zustandsmaschine, Geduld-
Warteabbruch, `waitStats`/`fearStats`/`resolvePanic`/`evacuate`/`debugForcePanic`, `allowPanic`),
`js/npc/guest-rig.js` (Zitter-Effekt bei Angst/Panik), `js/game/occupancy.js` (`createStatTracker`
neu), `js/player/interaction.js` (`rescue`/`operations`-Parameter: geteilter Element-Slot während einer
aktiven Rettung, Sturm-Räumungssperre), `js/core/save.js` (`data.operations`, `data.economy`,
`updateOperations`/`updateEconomy`, `CUSTOM_PARK_SCHEMA`/`isValidCustomPark` exportiert),
`js/world/wind.js` (`setDailyBias`), `js/builder/builder-state.js` (`rescuePosts` + Kandidaten/
Coverage-Delegation), `js/builder/builder-metrics.js` (`rescueCoverage`), `js/builder/builder-overlays.js`
(vier neue Overlay-Layer), `js/builder/builder-ui.js` (Overlay-Umschalter-Reihe, „Rescue"-Werkzeug,
**+ der oben genannte Sichtbarkeits-Bugfix**), `js/builder/builder-tool-panels.js` (`rescuePanel`),
`js/builder/builder-inspector.js` (echte Retter-Abdeckungszeile statt Platzhalter), `js/builder/builder.js`
(Betreiber-Kopfzeile mounten, Overlay-Daten berechnen, Routen-Baukosten beim ersten Begehen abbuchen),
`js/ui/kassa.js` (Sturm-Warnzeile), `js/ui/options.js` („Park teilen"-Sektion: Export/Import),
`js/main.js` (komplette M3b-Verdrahtung: `operations`/`economy`/`rescue` erzeugen, Räumungs-Gate in der
Gameplay-Phase, Tages-/Bewertungs-Hooks, `WIPFEL.debug.forcePanic/forceStorm`), `assets/strings/{en,de}.json`
(~50 neue Keys je Sprache, Parität geprüft), `tests/unit/{agents,builder-state,save}.test.mjs` (erweitert),
`css/{builder,hud,screens}.css`, `docs/architecture.md`, `HANDOVER.md`.
M3a laut geänderten Dateien: neu
`js/builder/{survey-trees,builder-validate,builder-state,builder-metrics,builder-camera,builder-overlays,
builder-zip-tool,builder-inspector,builder-tool-panels,builder-ui,builder}.js`, `css/builder.css`,
`tests/unit/builder-state.test.mjs`, `docs/screenshots/{m3-builder,m3-validate}.png`; geändert
`js/main.js` (`let`-Bindungen für alles, was `rebuildFromParkDef` neu aufbaut, diese Funktion selbst,
`builder`-Konstruktion, Loop-Verdrahtung Input/Gameplay/Render-Phase, `window.WIPFEL`-Getter, Boot-Wahl
`save.data.customPark` vs. frisch generiert), `js/core/save.js` (`data.customPark`, `setCustomPark`/
`clearCustomPark`, Validierung in `normalize()`), `js/core/params.js` (`?builder=`, `?autowalk=`),
`js/game/autoplay.js` (optionaler `route`-Parameter, `routeCtx = route || course`), `js/game/session.js`
(einzeilige defensive Absicherung in `activeRun()`), `js/park/layout-route.js` (`ZIP_GRADIENT`/
`buildEntry` exportiert, keine Verhaltensänderung), `js/ui/options.js` (`onBuilder`-Zeile im Menü),
`index.html` (`css/builder.css` verlinkt), `assets/strings/{en,de}.json` (~80 neue Keys je Sprache,
Parität geprüft), `docs/architecture.md`, `HANDOVER.md`.
M2b laut geänderten Dateien: neu
`js/player/accident.js`, `js/ui/accident-report.js`, `js/game/photo-mode.js`, `js/player/headlamp.js`,
`js/park/lampions.js`, `js/ui/touch-controls.js`, `tests/unit/brakes-hand.test.mjs`,
`docs/screenshots/{m2-night,m2-coursemap2}.png`; geändert `js/config.js` (`ACCIDENT`, `NIGHT`, `PHOTO`,
`GRAPHICS`, `TOUCH`, `TICKET_TYPES.night`), `js/core/input.js` (virtuelle Aktionen/Bewegung/Blick,
`consume`/`setVirtualState`/`addVirtualLook`), `js/core/params.js` (`?touch=`), `js/core/save.js`
(`settings.graphics`, `stats.accidents`, `recordAccident`), `js/zipline/brakes.js` (`HAND_BRAKE`,
`profile`-Parameter auf `inZone`/`apply`), `js/player/on-zipline.js` (Handbremsprofil, `ZIP_PROMPTS.
handZone`), `js/player/interaction.js` (`autoAdvanceContinuous`, `notice.continuousBelay`),
`js/game/clip-meter.js` (`isDisabled`), `js/game/session.js` (`abandonActiveRun`, Umsetzstations-Guard
in `zip:finished`), `js/game/route.js` (Umsetzstations-Länge/Par-Zeit/zweite Hindernis-Id),
`js/game/ticket.js` (`openingHour` veränderlich), `js/player/nerves.js` (`night`-Term),
`js/player/{vitals,on-element,fall,on-tarzan}.js` (optionaler `sky`-Parameter), `js/ui/kassa.js`
(Nachtticket-Knopf), `js/world/forest.js` (`lod`/`setLodDistances`, **+ der oben genannte Bugfix**),
`js/world/ground-detail.js` (`setDetailScale`), `js/world/sky.js` (`setShadowQuality`),
`js/ui/options.js` (Grafik-Sektion, `applyGraphicsLive`/`setGraphics`, `pillButton`),
`js/elements/element.js` (`registerElementVariant`), `js/elements/catalogue-data.js`
(`CATALOGUE_VARIANTS`), `js/elements/catalogue.js` (Varianten-Registrierung), acht Element-Module
(`burma-bridge`/`hanging-planks`/`beam-swing`/`stirrups`/`rings`/`barrels`/`net-bridge`/`skate.js`, je
ein gezielter Config-Override-Punkt), `js/park/layout-route.js` (`variantsAllowedFor`,
Umsetzstations-Planung in `buildZip`), `js/park/loader.js` (`buildOneZipLeg`, zweite Zip-Etappe,
`zipLandings`), `js/npc/agents.js` (Zip-Zielanker über `getExitAnchor()`), `js/npc/guest-rig.js`
(Stirnlampen-Punkt, `nightFactor`-Parameter), `js/main.js` (komplette M2b-Verdrahtung – zu umfangreich
für eine Aufzählung hier, s. `docs/architecture.md`s M2b-Abschnitt), `css/screens.css`
(Überschriften-Kontrast, `.accident-*`), `css/hud.css` (`.touch-*`, `.photo-*`, `.accident-active`-Regel),
`js/ui/map-render.js` (`PATH_BLEND`, Routen-Glüh-Pass), `assets/strings/{en,de}.json` (~30 neue Keys je
Sprache, Parität geprüft), `tests/unit/{catalogue,save}.test.mjs` (neue Tests), `tests/unit/layout.test.mjs`
(Hindernisliste um die Umsetzstations-Etappe erweitert), `docs/architecture.md`, `HANDOVER.md`.
M1.7 laut geänderten Dateien: neu
`js/ui/options.js`, `js/ui/options-controls.js`, `js/player/assist.js`,
`docs/screenshots/m1-options.png`; geändert `js/config.js` (`OPTIONS`), `js/core/params.js` (`?options=`),
`js/core/input.js` (`invertY`), `js/core/save.js` (`data.settings`, `updateSettings`/`export`/`import`,
`load()` in eine reine `normalize()` aufgeteilt), `js/audio/synth.js` (Kategorie-Gain-Busse, `category`-
Parameter auf `noiseBurst`/`ping`/`voice`, `setCategoryVolume`), `js/player/on-element.js`/`fall.js`
(Assist-Skalierung an den Aufrufstellen), `js/ui/hud-route.js`/`stamp-card.js` (Kategorie-Symbol
ergänzt), `js/main.js` (Esc→Options-Verdrahtung, `endTicketNow()`, `options.applyAll()`, `?options=1`,
`WIPFEL.options`), `css/base.css` (`.reduced-motion`, `accent-color`, `:disabled`), `css/screens.css`
(`.options-*`, `.opt-*`), `assets/strings/{en,de}.json` (38 neue `options.*`-Keys, Parität geprüft),
`tests/unit/save.test.mjs` (6 neue Tests), `docs/architecture.md`, `HANDOVER.md`.
M1.4/M1.6 laut geänderten Dateien: neu
`js/ui/map-render.js`, `js/ui/course-map.js`, `js/park/park-board.js`, `js/game/occupancy.js`,
`js/npc/agents.js`, `js/npc/guest-rig.js`, `tests/unit/agents.test.mjs`,
`docs/screenshots/{m1-coursemap,m1-parkboard}.png`; geändert `js/config.js` (`NPC`, `MAP`),
`js/core/params.js` (`?npc=`, `?map=`), `js/player/interaction.js` (`occupancy`-Param,
`elementBlockedByGuest`, `PROMPTS.waitForClimber`, Element-Slot-Beanspruchung als `"player"`),
`js/player/nerves.js` (`watchSuccess()`), `js/player/tuning.js` (`NERVES.trustPerWatch`/`watchRelief`),
`js/park/signs.js` (`averageBearing`/`findNearPath` jetzt exportiert, für `park-board.js`), `js/main.js`
(komplette Course-Map/Parkplan-Tafel/Gäste-Verdrahtung, `course-map-open`-Body-Klasse, `npc ms`/
`npc count` im F1-Panel, `WIPFEL.{parkBoard,courseMap,occupancy,agents,guestRig}`),
`css/screens.css` (`.course-map` Feinschliff: `.foot`/`.info`/`.filter-chip`, `.board-prompt`,
`course-map-open`-Regel), `assets/strings/{en,de}.json` (`notice.waitForClimber`, `map.*`,
`parkBoard.*`), `docs/architecture.md`, `HANDOVER.md`.
M1.3/M1.5 laut geänderten Dateien: neu
`js/game/ticket.js`, `js/ui/kassa.js`, `js/game/briefing.js`, `js/park/practice-stand.js`,
`js/ui/stamp-card.js`, `tests/unit/ticket.test.mjs`,
`docs/screenshots/{m1-kassa,m1-briefing,m1-stampcard}.png`; geändert `js/config.js` (`TICKET`,
`TICKET_TYPES`, `RULES.sizeClasses[].labelKey`), `js/core/save.js` (`briefingDone`, `ticket`,
`completeBriefing`/`startTicket`/`updateTicket`/`endTicket`), `js/core/i18n.js` (`formatClock`),
`js/core/params.js` (`?kassa=`, `?briefing=`), `js/player/belay.js` (`setMode`, `mode` als Getter),
`js/player/interaction.js` (`ticket`-Param, Einschulungs-/Ticket-Sperre), `js/game/session.js`
(`day`-Statistik, Ticket-Ende-Sequenz, `beginDay`/`forceDayEnd`), `js/game/autoplay.js` (`kassa`/
`briefing`-Bootstrap), `js/ui/hud-route.js` (`setTicket`, `.hud-ticket`), `js/main.js` (komplette
Kassa/Einschulung/Ticket/Stempelkarte-Verdrahtung, `WIPFEL.debug.endTicket`), `css/{hud,screens}.css`
(`.hud-ticket`, `.kassa-*`, `.briefing-panel`, `.stamp-*`), `assets/strings/{en,de}.json` (44 neue Keys,
Parität geprüft), `docs/architecture.md`, `ROADMAP.md`, `HANDOVER.md`.
M1.2 laut `git status`: neu
`js/park/signs.js`, `docs/screenshots/{m1-signs,m1-locked}.png`; geändert `js/core/save.js` (`unlocks`,
`nextGateCategory`), `js/player/interaction.js` (`save`-Param, Sperr-Prompt), `js/game/{route,
session}.js` (`lengthM`-Präzision, Freigabe-Logik, Banner-Sperrzweig), `js/ui/hud-route.js`
(`showBanner`-drittes Argument), `js/main.js` (`signs`-Verdrahtung, `save` an `interaction`),
`css/screens.css` (`.start-banner .locked`), `assets/strings/{en,de}.json` (`notice.locked*`,
`notice.unlocked*`, `sign.*`), `tests/unit/save.test.mjs` (4 neue Tests), `docs/architecture.md`,
`HANDOVER.md`.
M1.1 laut `git status`: neu
`js/park/{layout,layout-route,layout-validate,loader}.js`, `tools/{headless-terrain,bake-park}.mjs`,
`tools/dev/smoke-layout.mjs`, `tests/unit/layout.test.mjs`, `assets/parks/sonnwendberg.json`,
`docs/screenshots/m1-park.png`; geändert `js/main.js`, `js/game/{route,session,autoplay}.js`,
`js/player/interaction.js`, `js/park/{timber,zip-plan}.js`, `js/elements/zipline.js` (Kommentar),
`assets/strings/{en,de}.json`, `docs/architecture.md`, `HANDOVER.md`; gelöscht `js/park/first-course.js`.
Davor bereits uncommitted (M0.P, M0.6 – Details in älteren `docs/sessions/`-Logs, hier nicht erneut
aufgeführt): neu `js/world/terrain/{chunks,chunk-index}.js` + `tests/unit/chunk-index.test.mjs`;
geändert `js/world/{terrain,ground-detail,forest}.js`, `js/world/terrain/material.js`,
`js/procgen/geometry/ground-props.js`, `js/player/{rig-body,rig-gear}.js`,
`tools/dev/{terrain,forest}.html`. M0.6: neu `js/zipline/{physics,brakes}.js`,
`js/elements/zipline.js`, `js/park/{zip-plan,zip-landing}.js`, `js/player/on-zipline.js`,
`tests/unit/zipline.test.mjs`; geändert
`js/player/{interaction,controller,rig,rig-poses,tuning,vitals}.js`, `js/ui/hud.js`,
`js/audio/{synth,sfx}.js`, `docs/architecture.md`, `ROADMAP.md`.

## Wichtige Architekturentscheidungen
`docs/architecture.md` (Modulverträge – Park/Belay/HUD/Audio seit M0.4 eingetragen, Course-Map/Parkplan-
Tafel/Gäste-Occupancy seit M1.4/M1.6, Optionen + Settings seit M1.7, Builder seit M3a,
**Betreiber-Simulation (Angst/Panik, Retter, Betrieb, Ökonomie, Teilen) seit M3b**),
`docs/DECISIONS.md` ADR-001…012, 020…029 (Mockup 1:1, UI EN+DE, Kategorien mit Green, M3 wird gebaut,
M4-Koop lokal). Offen: ADR-013 (Three.js 0.185.1 – faktisch entschieden, eintragen), ADR-014 (Rapier
compat 0.20.0 – dito), 015–018.

## Bekannte Bugs
– keine reproduzierten. Zu prüfen: Kamera-Kollision mit Kronen im echten Wald (nur in Dev-Seite getestet).
Beobachtet (kein Bug dieser Session, s. „Was halb fertig ist"): der `?autoplay=1`-Bot kann selten in
einem Sturz hängen bleiben, wenn Kraft leer und Nerven gleichzeitig einfrieren (drückt nie „Retter [E]").

## Unmittelbar nächste Aufgabe
**M3b ist fertig – damit ist M3 „Der Betreiber" komplett** (Checkbox in `ROADMAP.md` bewusst nicht
gesetzt, das übernimmt der Lead zusammen mit Commit/Tag `m3`). Als Nächstes **M4 „Die anderen"** (lokal,
ADR-029): Koop zu zweit lokal (Gamepad + Tastatur/Maus, Begleitregel), Zuschauer-Rufe, geteilte Physik,
Koop-Übungen.

Offene Punkte aus M3b (s. „Was halb fertig ist" oben für die volle Liste): kein Sturm-Räumungs-
Screenshot (Umgebungsgrenze, Mechanik selbst bestätigt); `?autoplay=1&fast=1` nicht live neu bestätigt in
dieser Sitzung; Guide-Rolle war nicht Teil des Auftrags und bleibt offen; Wartezeit-Bewertungsfaktor
unverdrahtet; kein 3-D-Hütten-Mesh für Retterposten im normalen Spiel.

Offene Entscheidung aus M1.3 (weiterhin unentschieden): Größenklasse (`RULES.sizeClasses[].allowed`) ist
an der Kassa wählbar und persistiert (`save.data.ticket.sizeClassId`), treibt aber **nur** die Zip-Masse
(`player.states.get("zipline").setRiderMass`) – sie gated **nicht**, ob eine zu kleine Größenklasse eine
bereits freigeschaltete Farbe betreten darf (GDD §3.7 „Größenklasse (Farbfreigabe, Zip-Tempo)" nennt
beides). Noch keine ADR; wenn gewünscht, gehört der Check neben `lockedCategoryOf` in
`player/interaction.js`, mit einer eigenen Prompt-Zeile.

## Nächste fünf Aufgaben
1. M4-Kickoff (ADR-029, lokal): zweiter Spieler am selben Gerät (Gamepad + Tastatur/Maus gleichzeitig),
   geteilte oder Splitscreen-Kamera je nach Machbarkeit – erster Schritt vor Koop-Übungen/Zuschauer-Rufen.
2. Sturm-Räumung visuell nachprüfen, sobald ein Browser-Werkzeug in einer Sitzung wieder Screenshots
   liefert (s. „Was halb fertig ist") – `m3-storm.png` nachreichen, Mechanik selbst ist bereits durch
   Unit-Tests + Live-Zustandsabfrage bestätigt.
3. `?autoplay=1&fast=1` einmal frisch laufen lassen und bestätigen, dass `allowPanic: false` das
   Regressionsrisiko (dauerhaft panischer Gast blockiert den Bot) tatsächlich beseitigt hat.
4. Größenklasse → Kategorie-Zugang entscheiden und ggf. verdrahten (weiterhin offen seit M1.3, s. o.).
5. Wartezeit-Bewertungsfaktor verdrahten (`economy.js` hat die reine Funktion schon, s. „Was halb fertig
   ist") – z. B. an `js/npc/agents.js#waitStats()` beim Tageswechsel gekoppelt, kurze Ø-Wartezeit hebt,
   lange senkt die Bewertung.

## Offen / Provisorisch
- ~~M2b-Autoplay-Recheck ausstehend~~ – vom Lead nachgeholt (2026-08-26): blue-1 `done` 5/5, 0 Stürze,
  0 Konsolenfehler, 394 Calls / 0,88 M Tris; `layout.test.mjs` von 4:49 min auf 24 s beschleunigt
  (Modul-Cache statt Neubau pro Test).
- **M2b:** Touch-Steuerung ist absichtlich minimal (ROADMAP-Wortlaut „bewusst einfach"): ein Stick, eine
  Look-Fläche, drei Knöpfe, kein Remapping, keine Haptik, keine Geräte-spezifische Größenanpassung –
  verifiziert über direkte `pointerdown`/`pointerup`-Events, nicht auf echtem Touch-Hardware. Die
  Stirnlampen-Intensität (`NIGHT.headlampIntensity = 35`, nach dem Ausrichtungs-Bugfix neu justiert)
  ist eine einmalige Schätzung anhand eines kontrollierten Pixel-Diffs, keine durchgestylte
  Lichtstimmung – ein echter Blick-Pass (M2-Politur oder später) könnte das noch verfeinern, gerade im
  Zusammenspiel mit den Lampions. Lampions/Gäste-Stirnlampen sind rein emissiv (kein
  `THREE.Light`) – wirft also kein echtes Licht auf die Umgebung, nur ein Leuchteffekt am Objekt selbst
  (dokumentierte Budget-Entscheidung, s. `docs/architecture.md`). Die Umsetzstation prüft nur, ob eine
  zweite Zip-Etappe *validierbar* ist (dieselben Regeln wie jede normale Fahrt) – sie erzwingt nicht,
  dass *jede* schwarze Route eine bekommt, nur dass es strukturell möglich ist; welche Routen in welchem
  Seed tatsächlich eine Umsetzstation bekommen, ist damit seed-abhängig (Schwarz-I/Seed 1 bestätigt,
  nicht jede schwarze Route in jedem Seed). Der volle `?autoplay=1&fast=1`-Regressionslauf wurde diese
  Session nicht erneut bestätigt (s. „Nächste fünf Aufgaben" 2) – kein bekannter Grund zur Annahme eines
  Regressions, aber auch kein frischer Beleg.
- **M1.7:** Die `ambience`- und `ui`-Audio-Busse (`js/audio/synth.js`) sind verdrahtet, haben aber noch
  keinen einzigen Klang, der über sie läuft (kein Ambiente-Bett, keine Interface-Sounds – beides erst M2)
  – die zwei Regler im Optionen-Bildschirm wirken also gerade auf nichts Hörbares, klar so vermerkt in
  der UI-Copy selbst (`options.audio.futureNote`). Tastenbelegung ist nur lesbar
  (`js/ui/options-controls.js`), Neubelegung selbst kommt später (ROADMAP „Tastenbelegung vorbereitet"),
  ohne eigenes UI dafür. Der Sprachumschalter rendert sich selbst sofort neu, aber bereits einmal
  gebaute, nie neu gerenderte Bildschirme (Kassa, das Options-Panel selbst erst nach dem nächsten
  `open()`, die HUD-Vitalbox-Labels „Belay"/„Str"/„Bpm") bleiben bis zum nächsten Boot in der alten
  Sprache – so in der UI-Copy selbst dokumentiert (`options.gameplay.localeNote`), kein Bug. Solange der
  Optionen-Bildschirm offen ist (`loop.paused === true`), laufen `parkBoard.update()`/`briefing.update()`
  in der Gameplay-Phase trotzdem weiter (dieselbe Vorbedingung galt schon vor M1.7 für den blanken
  Pause-Toggle – die Gameplay-Phase feuert immer, nur mit `dt = 0`): steht der Spieler zufällig in
  Reichweite der Parkplan-Tafel, öffnet ein `E`-Druck während der Pause die Course Map dahinter – ein
  vorbestehendes, nicht durch M1.7 verursachtes Detail der „weichen" Pause, nicht behoben (out of scope).
  Assist-Modus lässt `js/elements/element.js`s Wind-Böen-Anregung bewusst unangetastet (nur die Aktionen
  des Kletterers selbst werden sanfter) – dokumentierte Abgrenzung, kein Bug.
- **M1.4:** Routenlinien auf Course Map und Parkplan-Tafel zu blass (Kategorie-Farben kaum
  erkennbar, Weg-Linie dominiert) – im M2-Politur-Pass sättigen/glühen lassen wie im Mockup.
- **M1.4/M1.6:** Tarzansprung/Skateboard haben keine eigene Gast-Animation (s. „Nächste fünf Aufgaben").
  Die Spieler-Occupancy-Sperre gilt nicht für die Leiter (bewusst, s. `docs/architecture.md`); ein Sturz
  gibt den Element-Slot sofort frei statt ihn bis zur Rettung/Podest-Rückkehr zu halten (dokumentierte
  Vereinfachung, unkritisch bei Kapazität 1). Gäste navigieren am Boden geradlinig zum Ziel (keine
  Wegfindung um Bäume/Streudetail) – dieselbe ehrliche Grenze wie `game/autoplay.js`s Bot; auf dem im
  Test beobachteten Seed unauffällig, weil Hub und Einstiegsdecks recht offen liegen. Die Parkplan-Tafel
  zeigt Routen als farbige Ketten, keine geschlossenen Schleifen wie das Vorbildfoto (unsere Routen sind
  Einbahn zum Flying Fox). Der Kartencache (`course-map.js`) wird einmal beim ersten Öffnen gebacken und
  danach nie erneuert – unkritisch, weil sich Terrain/Routen zur Laufzeit nie ändern, aber ein künftiges
  Feature „Parcours im laufenden Spiel entdecken/aufdecken" (aus der M1.4-ROADMAP-Zeile „entdeckte
  Abschnitte") würde eine erneute Bake-Möglichkeit brauchen – nicht gebaut, weil nicht Teil dieses
  Auftrags (der Auftragstext nannte nur Overlay/Tafel/Gäste, nicht Progressive Discovery). Kein Zoom-Pan-
  Momentum/Trägheit (Ziehen folgt der Maus 1:1, kein Ausklingen) – Politur-Kandidat. NPC-Wanderung nutzt
  pro Gast einen eigenen `Rng`-Fork, ist also über die Session deterministisch fortsetzbar, aber die
  Bewegung selbst wird nicht bit-für-bit reproduzierbar getestet (nur `planAgents`, die Zuweisung, ist
  das) – für Hintergrundfiguren als ausreichend eingestuft.
- **M1.3/M1.5:** Größenklasse gated nur die Zip-Masse, nicht den Kategorie-Zugang – s. „Unmittelbar
  nächste Aufgabe". Die Tages-Statistik (`session.js#day`) ist **nicht** Teil von `save.data.ticket` –
  ein Reload mitten im Tag stellt Uhr/Belay/Größenklasse korrekt wieder her (`resumeDay`), aber die
  Stempelkarte würde bei einem sofortigen Ticketende danach bei null anfangen (bereits geschaffte
  Routen vor dem Reload sind für die Karte verloren, nicht fürs Save – Bestzeiten/Freigaben bleiben
  unberührt). Der Übungsstand hat einen Collider, aber kein Piktogramm-Schild wie der echte Einhängepunkt
  am Einstiegsdeck – aus dem 80-Zeilen-Budget herausgefallen; der Trainer-Text sagt, was zu tun ist, aber
  ein Erstspieler ohne Text-Fokus müsste den Pfosten selbst als Ziel erkennen. Das Erweiterungsfenster
  (`TICKET.extendPromptSeconds` = 8 s) zeigt nur einen statischen Toast, keinen sichtbaren Countdown wie
  die 3-2-1-GO-Scheiben – Politur-Kandidat. „Weiter im Park bleiben" und „nie ein Ticket gelöst" teilen
  sich dieselbe Sperrzeile (`notice.noActiveTicket`) statt zweier unterschiedlicher Texte. Trainer-Dialog
  und Übungsanker-Ritual verbrauchen `interact`/`clip` genau wie `player/interaction.js` – kollisionsfrei
  nur, weil der Übungsstand bewusst weit von jedem Routen-Einstieg platziert ist (gegenüber der
  mittleren Peilung aller Einstiege); keine harte Sperre, falls ein künftiger Layout-Seed das ändert.
  `belay.setMode()` setzt beide Karabiner zurück auf offen – unkritisch, weil er nur beim Kassa-Confirm
  und beim Resume aufgerufen wird (beides vor jedem möglichen Einhängen), aber nicht dagegen gefeit,
  mitten im Klettern aufgerufen zu werden. Kein Titel-Bildschirm vor der Kassa (GDD §5 listet einen –
  nicht beauftragt für M1.3, YAGNI). `.hud-ticket` (oben rechts) und das F1-Debug-Panel (`#debug
  .debug-panel`, ebenfalls oben rechts) überlappen sich sichtbar, wenn beide gleichzeitig an sind –
  nur ein Problem mit `?debug=1` an, nicht im Produkt-UI.
- **M1.2:** Der Wegweiser-Cluster sucht sich einen Punkt „nahe am Weg" über eine begrenzte Zufallssuche
  (`signs.js#findNearPath`, 16 Versuche) und fällt sonst auf den reinen Radialpunkt am Hub-Rand zurück –
  die generierten Routen führen selbst in keinen kartierten Waldweg hinein (nur die Hub-zu-Hub-Wege sind
  gepackt), insofern ist „nahe am Weg" hier eher „am Hub-Rand, wo man beim Verlassen des Hubs
  vorbeikommt" als ein echter Wegeanschluss. Schild-Pfosten haben **keine Collider** (wie
  `world/ground-detail.js`s Streudetail) – man kann hindurchlaufen; für dünne Pfosten am Wegrand als
  vertretbar eingestuft, nicht wie ein Podest-Pfosten geprüft. Ein extrem langer, leerzeichenloser
  Routenname (aktuell keiner: „Turmfalkenlinie" bei 344 von 440 px verfügbarer Breite) würde am
  Namensschild über den Rand laufen – `wrapText` bricht nur an Leerzeichen, kein Shrink-to-fit wie beim
  Kategoriewort (`fitText`); nicht gebaut, weil kein aktueller Name das auslöst (YAGNI). Größenklassen-
  Freigabe (`RULES.sizeClasses`) und Kategorie-Freigabe (`save.data.unlocks`) sind bisher zwei getrennte
  Systeme, die sich nie gegenseitig geprüft haben – wird mit M1.3 (Kassa) zusammenlaufen müssen.
- **M1.1:** 434 Draw-Calls am Spawn mit Schildern (Ziel dieser Session ≤ 440 – erreicht); ohne Schilder
  428 (M1.1s eigenes Ziel ≤ 420 – nicht erreicht, aber aus ~590 vor der Podest-Merge-Optimierung;
  ehrlich als „nahe dran, nicht erfüllt" markiert). Der Übersichts-Screenshot `m1-park.png` ist eine
  freigestellte Kamera weit über dem Park (`loop.stop()` + `renderer.render` von Hand) und zeigt
  **keinen** realen Spielwert – dort reichen Dreiecke bis ~1,2 M (Nebel/Wald in einer Aufsicht, die
  kein Spieler je einnimmt); der reale Spawn-Wert (~0,93 M) bleibt unter dem 1,0-M-Ziel.
  `assets/parks/sonnwendberg.json` wird vom Spiel nicht gelesen (nur `tools/bake-park.mjs`-Beleg) –
  falls ein künftiger Meilenstein einen echten Cache/Fixture-Konsum will, ist das ein eigener Schritt.
- **M0.6 (Eingabe, betrifft auch M0.5):** `input.pressed()` wird von den Zuständen im **Physik-Takt**
  gelesen, `input.endFrame()` läuft aber jeden Frame. Über 60 fps hat ein Frame manchmal **keinen**
  festen Schritt – die Kante geht dann verloren (Planken-Schritt, Retter-E, Abstoßen). Die Zipline
  umgeht das mit `input.down("jump")`; ein sauberer Fix wäre ein gepuffertes Kanten-Set in
  `core/input.js` (wie `jumpBuffer` im Controller). **Nicht** einfach `endFrame` überspringen: dann
  liest die Interaktion in der Gameplay-Phase dieselbe Kante zweimal (Umhäng-Ritual springt).
- **M0.6:** Das Gefälle-Fenster 4,5–6 % ist auf diesem Hang nur mit einem **erhöhten Ankunftspodest**
  (2,42 m) einzuhalten – der Hang selbst fällt mit 7–9 %. Ein 0,4-m-Deck wie am Einstieg würde
  9–11 % Gefälle bedeuten. Das ist die ehrliche Auflösung, hat aber zur Folge, dass die Ankunft eine
  Rampe braucht; M1.1 sollte das als regulären Podesttyp „Zip-Ankunft“ führen.
- **M0.6:** Höchstgeschwindigkeit 21–24 km/h – für eine 56-m-Bahn mit 5,5 % korrekt, aber deutlich
  unter dem Mockup-Wert (62 km/h, dort eine 310-m-Bahn). Tempo*gefühl* kommt aus Sichtfeld, Ton und
  den Stämmen, die 2,5 m entfernt vorbeiziehen; nicht an der Zahl schrauben.
- **M0.6:** Die Bremsentscheidung rastet an der Markierhülse ein (`zoneStart`); wer dort die Beine
  unten hat, kann sie nicht mehr retten. Beabsichtigt – aber ohne Trainer-Erklärung (M1.3) lernt man
  es erst beim zweiten Mal. Das Piktogramm am Startgatter ist der einzige Hinweis.
- **M0.6:** Bei „messy“ bleiben die zwei leichtesten Größenklassen im Netz hängen und müssen sich
  hangeln – gewollt (RESEARCH-DATA §6), aber die Zugleine vom Ziel (20 s) fehlt noch; wer die Kraft
  verliert, hangelt nur langsamer weiter, statt geholt zu werden.
- **M0.6:** Der Trolley der Figur (`rig-gear.js#addTrolley`) bleibt während der Fahrt an der Hüfte,
  obwohl er auf dem Seil sein müsste; in der Ego-Perspektive unsichtbar, von außen ein Detail. Der
  Seil-Trolley springt nach der Ankunft sofort zum Startgatter zurück (`setRider(null)`), statt am
  Ziel zu bleiben, bis ihn jemand holt – bewusst, damit der nächste Fahrgast einhängen kann.
- **M0.6:** Das Seil bekommt eine mitlaufende Delle unter der Rolle (Deformer), aber kein
  Nachschwingen der ganzen Bahn nach dem Abstoßen; der Feder-Dämpfer sitzt nur am Trolley.
- **M0.5:** `main.js#pickHeroTrees` legt jetzt bewusst eine **Kette** aus 4 Kiefern à 8,6 m an
  (`COURSE`-Konstante) plus 4 Deko-Stämme, die 15 m Abstand zur Kette halten – sonst findet die
  Greedy-Suche in `first-course.js` den falschen Baum. Ersetzt M1.1 durch den Layout-Generator.
- **M0.5:** Die Posen treffen die Seile nicht: beim Greifen stehen die Arme seitlich ab statt auf dem
  Halteseil zu liegen, auf den Planken fassen die Hände die Aufhängeseile nicht an. Braucht IK
  (M0.7-Politur). Auf dem Netz fehlt die Vierfüßler-Hocke – es wird die normale Balance-Pose benutzt.
- **M1.8:** `tarzan.js`/`on-tarzan.js` ist absichtlich **kinematisch/analytisch**, nicht Rigid-Body wie
  GDD §7 es für den Tarzansprung vorsieht (dort explizit als Ausnahme von „Übungen sind Schienen“
  genannt) – ein Rapier-Seilpendel wie in `fall.js` wäre der nächste Schritt, aber ohne Live-Testlauf
  zu riskant für diese Session; das deterministische Sinus-Pendel ist dafür beliebig reproduzierbar.
  `skate.js` nutzt für „Stoß + Trägheit“ nicht echte Impulse, sondern einen **pro Element
  überschreibbaren Beschleunigungswert** (`element.railAccel`, neu in `on-element.js#walk`) – fühlt
  sich träger an als die anderen Übungen, ist aber kein echtes Press-Impuls-Modell. Elf der zwölf
  Übungen liegen komplett im verschmolzenen Timber-Mesh; `barrels.js` braucht für das echte Rollen
  unterm Fuß **eigene Meshes** (der CPU-Deformer kann nur verschieben, nicht drehen) – 4–6 Draw-Calls
  mehr, wenn diese Übung tatsächlich im Kurs verbaut wird. 12. Art `wire-loops` ergänzt (dünne
  Steigbügel-Variante), damit die Zwölf ohne Fußnote stimmt – s. `docs/architecture.md`.
- **M0.5:** Die Übungen haben **keine Collider** (`impl.createPhysics` ist nirgends implementiert) –
  man kann nicht auf ein Seil fallen, nur an ihm entlanglaufen. Für M0 in Ordnung, weil der Zustand
  `element` die Figur ohnehin kinematisch führt.
- **M0.5:** Kraftkosten sind an einem Autopiloten gemessen, nicht an Menschen: Burma mit beiden Händen
  kostet ~2/3 der Kraft, das Netz leert sie fast ganz. Beim ersten echten Testlauf nachziehen
  (`player/tuning.js`: `BALANCE.topple/damping`, `STAMINA.gripDrain`, `NERVES.*Gain`).
- **M0.5:** `nerves.frozen` friert die Bewegung ein, die Kamera zeigt es aber nur über das Zittern;
  ein sichtbares Einfrieren (Vignette, Atem-Overlay) kommt mit dem HUD in M0.7.
- **M0.4:** Der Kurs steht auf der Hero-Ketten-Kiefer – der Layout-Generator (M1.1) ersetzt
  `first-course.js`. Keine Kapazitätsprüfung (RULES.maxPerPlatform ist gesetzt, aber ungenutzt).
- **M0.4:** Karabiner sind weiterhin Zustand, keine Physik – `belay.isSafe() === false` (classic) wird
  nur mitgeschrieben; im Sturz hängt die Figur immer am Sicherungsseil der Übung, egal was eingehängt ist.
- **M0.4:** Podest-Collider ist ein Quader (16 cm dick, weil die KCC durch eine 5-cm-Platte sackt);
  der Stamm-Ausschnitt der Planken ist optisch, nicht physisch. Auf der Leiter ist die Figur
  kinematisch – keine Kollision, kein Absteigen zur Seite.
- **M0.4:** Die Schrägstützen enden auf `tree.y − 0,22 m`; auf steilem Hang schwebt oder steckt ein
  Fuß. Bodendetail (Laub/Gras) weiß nichts vom Deck und wächst stellenweise hindurch.
- **M0.4:** Kamera auf der Leiter bleibt die Schulterkamera und wird vom Stamm eng gedrückt;
  ein eigener Leiter-Kamerawinkel wäre besser (M0.7-Politur).
- **M0.4:** HUD zeigt nur Karabiner-Widget, Kraft-Ring (fix 1,0) und Prompt; UI-Texte stehen noch
  im Code (`player/interaction.js#PROMPTS`), i18n kommt mit M0.7.
- **M0.P:** Die Distanzradien des Bodendetails (`GROUND_DETAIL.radius`: Kiesel 45 m, Zweige 55 m,
  Gras 70 m, Steine/Wurzeln 80 m, Laubhaufen 90 m) sind am Bild gewählt, nicht an echten Augen –
  beim ersten Testlauf auf Ploppen beim Gehen achten (Rebuild alle `refreshMoveMetres` = 6 m). Ein
  weicher Übergang bräuchte ein Scale-Fade im Vertex-Shader.
- **M0.P:** Kiesel und Steine haben jetzt gröbere Kugeln (8×6 bzw. 10×8 statt 14×10) und werfen
  (Kiesel/Zweige/Laubhaufen) keinen Schatten mehr – bei 5–14 cm unter der Schattenmap-Texelgrösse
  (3,4 cm), aber ein Look-Pass sollte das aus Augenhöhe gegenprüfen.
- **M0.P:** fps ist im Headless-Chromium **nicht** messbar (rAF liefert kaum Frames, SwiftShader
  braucht Sekunden pro Bild). Die Budgetzusage „≥ 55 fps auf iGPU" ist damit **nicht** nachgewiesen –
  nur Dreiecke, Draw-Calls und ein Software-Render-Vergleich. Auf echter Hardware nachmessen.
- Figur: `player/rig*.js` = 64 Meshes → 98 Draw-Calls mit Schatten (siehe „Nächste fünf Aufgaben" 5).
- Bäume: gut lesbar, aber Kronen noch „kartig“ bei LOD 1/2; Astwerk sparsam; weiterer Look-Pass in M2.
- Figur: Kopf/Hände einfach; Posen-Blending ok; Kletterposen (ladder, balance, grab, hang, zipline)
  existieren als Namen, sind aber noch nicht animiert.
- `?autoplay=1` noch ohne Wirkung im Hauptspiel (Bot existiert nur in `tools/dev/player.html`).

- **M0.7:** Bodennavigation ist eine Bot-Grenze: `?autoplay=1` startet auf dem Einstiegsdeck und
  hüpft nach Stürzen zurück zum nächsten Element-Einstieg (im Log als „shortcut“). Menschen laufen
  normal – der freie Walk wurde in M0.4 manuell verifiziert.
- **M0.7:** Physik-Kante am Deck: Rapier-Autostep verweigert die Stufe-vor-Deck-Doppelkante; gelöst
  über eine 28°-Rampen-Kollision unter der Stufe (Autostep steht auf 0,44). Ein sichtbarer
  Hackschnitzel-Keil wäre die schönere Politur.
- **M0.7:** Kein Kassa-Screen (M1.3), kein Ticket-Timer im HUD (M1.5); FLOW zeigt statisch x1,0;
  fps auf echter Hardware weiter unbelegt (headless 60+ nur ohne Screenshot-Last).

## Wie starten
```
python serve.py             # http://127.0.0.1:8200/   (?debug=1 Panel · ?physics=1 Wireframe · ?seed=N · ?fast=1)
```
Beim Boot erscheint zuerst die **Kassa** (Ticketart/Größenklasse/Sicherungsmodus, Confirm startet den
Tag), danach die **Einschulung** (vier `[E]`-Dialogzeilen, dann F/F bzw. F/X am Übungsanker) – beides
übersprungen bei `?autoplay=1` (Bot bestätigt Kassa-Standardwerte und schließt die Einschulung
programmatisch ab). `?kassa=1` erzwingt die Kassa auch bei einem laufenden Ticket im Save (statt den Tag
fortzusetzen); `?briefing=0` überspringt die Einschulung dauerhaft (setzt `save.data.briefingDone` sofort).
Browser-Pane in Claude Code: `.claude/launch.json` → „wipfel”. Steuerung: WASD, Maus (Klick = Pointer-Lock),
Shift Sprint, Leertaste Sprung, **F einhängen/umhängen** (classic zusätzlich X für Karabiner B),
**E klettern / auf die Übung steigen / Course Map an der Parkplan-Tafel öffnen**, **Tab Course Map**
(auch Esc/EXIT-Button schließt sie; öffnet nicht pausiert, sperrt nur die Bewegung), T Kamera, F1 Debug,
F2 Physik-Wireframe, **Esc Pause/Optionen** (M1.7: öffnet `js/ui/options.js`, `loop.paused === true`
solange offen; bzw. Course-Map-schließen, wenn die offen ist – Course Map hat Vorrang vor Optionen),
**P Foto-Modus** (M2b: pausiert wie Optionen, gibt die Kamera frei – WASD/Maus/Q·E –, blendet das HUD
aus; **Leertaste** speichert einen PNG-Schnappschuss, **P** erneut kehrt zurück).
**Auf einer Übung:** W/S vor und zurück (auf den Planken **ein Druck = eine Planke**), A/D lehnen,
**Q** linke Hand, **rechte Maustaste** rechte Hand, **R** atmen (nur im Stehen).
**Im Gurt:** Leertaste hochziehen, W/S am Seil zum Podest hangeln, E Retter rufen.
**Am Flying Fox:** F, F einhängen · **E** hinsetzen · **Leertaste** abstoßen und gedrückt halten
(Beine hoch – gilt auch für die Netzbremse) · A/D Körper drehen · **W** hangeln, wenn man
stehenbleibt · E lange halten, um vom Startgatter wieder aufzustehen · nach der Ankunft F, F auf den
Anker `landing` und über die Rampe zurück.
Der erste Kurs steht auf der Hero-Kiefer-Kette am Spawn – hinlaufen oder
`WIPFEL.player.teleport(x, y, z)` mit `WIPFEL.course.entryDeck.group.position` benutzen.
NPC-Gäste laufen ab Boot von selbst (`?npc=0` schaltet sie ab); die Parkplan-Tafel steht neben dem
Wegweiser-Cluster am Hub-Rand (`WIPFEL.parkBoard.standPosition`).
**Koop (M4):** an der Kassa „Two climbers"/„Zwei Kletternde" ankreuzen (nur sichtbar bei angeschlossenem
Gamepad) – der Gamepad steuert danach Spieler 2 exklusiv (dieselben Aktionen wie Tastatur/Maus:
Stick = Bewegen, zweiter Stick = Blick, A Sprung/Abstoßen, X Umhängen, LT/RT Hand L/R, L3-Klick
Interagieren, B Atmen). Spieler 2 erscheint neben Spieler 1, eigene Rüstungsfarbe cyan statt orange,
eigene Prompt-Box unten links. Jenseits 24 m Abstand wird Spieler 2s Bewegung gedämpft
(„Zusammenbleiben"). Options-Bildschirm → Gameplay → „Shared bridge physics" (Default an).

## Wie testen
```
node tools/check-all.mjs                       # Syntax-Gate
node --test "tests/unit/**/*.test.mjs"         # Unit-Tests
node tests/smoke.mjs                           # optional (playwright-core), sonst SKIP
```
Dev-Seiten: `/tools/dev/forest.html`, `/tools/dev/terrain.html`, `/tools/dev/sky.html`, `/tools/dev/player.html`.
Manuelle Smoke-Checkliste: `docs/testing.md`.

## Debug-Kommandos / URL-Parameter
`?debug=1`/F1 Stats · `?physics=1`/F2 Rapier-Wireframe · `?seed=<n>` · `?fast=1` · `?locale=de` ·
`?belay=continuous|smart|classic` (wirkt; ungültige Werte fallen auf `smart` zurück) ·
`?kassa=1` (Kassa erzwingen trotz laufendem Ticket) · `?briefing=0` (Einschulung dauerhaft überspringen) ·
**`?npc=0`** (Gäste komplett deaktivieren, M1.6) · **`?map=1`** (Course Map beim Boot öffnen, M1.4,
für Screenshots) · **`?options=1`** (Pause/Optionen beim Boot öffnen, M1.7, für Screenshots – blendet
eine sonst gleichzeitig sichtbare Kassa aus) · **`?touch=1`** (M2b: Touch-Overlay erzwingen, auch ohne
`pointer: coarse`-Gerät) · **`?builder=1`** (M3a: direkt in den Builder statt zur Kassa booten) ·
**`?autowalk=<routeId>`** (M3a: zusammen mit `?builder=1` – startet sofort die Begehung dieser Route mit
dem `?autoplay=1`-Bot, z. B. `?builder=1&autowalk=blue-1&fast=1`) ·
`window.WIPFEL` = {loop, physics, scene, camera, renderer, rng, input, events, terrain, forest, sky,
wind, player, parkDef, course, **signs**, belay, hud, interaction, vitals, session, save, autoplay,
kassa, briefing, stampCard, ticket, **options**, **parkBoard, courseMap, occupancy, agents, guestRig**,
**accidentReport, photoMode, headlamp, lampions, touchControls** (M2b), **builder** (M3a),
**operations, economy, rescue** (M3b), **coop** (M4), debug}.
**M4:** **`WIPFEL.coop.active`**, **`WIPFEL.coop.available`** (Gamepad verbunden?),
**`WIPFEL.coop.player2`** (voller `createPlayer()`-Rückgabewert, solange aktiv – sonst `null`;
`WIPFEL.coop.player2.teleport(x,y,z)` zum Testen), **`WIPFEL.coop.falls`** (`{player1,player2}`),
**`WIPFEL.coop.enable(opts?)`**/**`.disable()`** (auch von Hand aufrufbar, unabhängig von der Kassa),
**`WIPFEL.debug.enableCoopForTest()`** (spawnt Spieler 2 mit einem trägen Test-Input statt echtem
Gamepad – für Screenshots/Skripte, s. `tools/dev/verify-m4.mjs`).
**M3a:** **`WIPFEL.builder.mode`** (`"closed"|"editing"|"walking"`), **`WIPFEL.builder.enter()`**/
**`exit()`** (dasselbe wie die „Park builder"-Zeile im Optionsbildschirm / Esc), **`WIPFEL.builder.
startAutowalk(routeId)`** (der `?builder=1&autowalk=`-Pfad, auch von Hand aufrufbar),
**`WIPFEL.builder.requestAbortWalk()`** (bricht eine laufende Begehung ab, ohne die Route zu öffnen).
Der Entwurf selbst (`draft`) ist bewusst **nicht** auf `WIPFEL.builder` exponiert (nur der
Zustandsautomat) – Einblick über die DOM-UI (`.builder-route-row`, `.builder-issue`, …) oder
`WIPFEL.save.data.customPark` nach einem Edit (jede Editier-Aktion persistiert sofort).
Skripten/Testen: `WIPFEL.player.teleport(x, y, z)`, `WIPFEL.player.setState("ground")`,
`WIPFEL.course.{anchors, elements, platforms, graph, zipline, zipLanding, zipPlan}`,
`WIPFEL.course.elements[i].getEntryAnchor().stand`,
`WIPFEL.belay.state()` + **`WIPFEL.belay.setMode(mode)`**, `WIPFEL.vitals.{balance,stamina,nerves}` +
`WIPFEL.vitals.probe()`,
**`WIPFEL.signs.group`** (M1.2: alle Schild-/Pfosten-Meshes, `.children.filter(o => o.name ===
"sign-face")` sind die neun beschrifteten Tafeln), **`WIPFEL.save.data.unlocks`** (Kategorie-Freigaben,
`{blue,red,black}`) + **`WIPFEL.save.isUnlocked(cat)`**/**`unlockCategory(cat)`**,
**`WIPFEL.save.data.briefingDone`**/**`.ticket`** (M1.3/M1.5), **`WIPFEL.ticket`** (die reine Uhr –
`.started/.expired/.clippable/.remainingGameMinutes/.extensionsLeft`), **`WIPFEL.kassa.confirmDefaults()`**
und **`WIPFEL.briefing.completeForBot()`** (die Bot-Hooks, auch von Hand aufrufbar),
**`WIPFEL.debug.forceSlip(±1)`** (erzwingt einen Sturz auf der aktuellen Übung),
**`WIPFEL.debug.setWindAlong(m/s|null)`** (negativ = Gegenwind auf der Zipline; −7 lässt ein Kind
stehenbleiben), **`WIPFEL.debug.setRiderMass(kg)`** (Größenklasse für die nächste Fahrt, normalerweise
über die Kassa gesetzt) und **`WIPFEL.debug.endTicket()`** (M1.5: erschöpft die Restzeit und ruft
`session.forceDayEnd()` – überspringt die 8-s-Erweiterungs-Gnadenfrist, landet direkt auf der
Stempelkarte; No-op ohne laufendes Ticket), **`WIPFEL.debug.setNight(on=true)`** (M2b: erzwingt
`sky.setTimeOfDay(NIGHT.openingHour + 1.5)` ohne echtes Nachtticket, stellt mit `false` den normalen
Ticket-Uhr-Sync wieder her).
**M2b:** **`WIPFEL.photoMode.{active,requestSnapshot()}`**, **`WIPFEL.headlamp`**/**`WIPFEL.lampions`**
(je `.update(nightFactor, …)`, normalerweise vom Loop aufgerufen), **`WIPFEL.accidentReport.visible`**,
**`WIPFEL.touchControls`** (nur konstruiert, wenn `isTouchDevice()`/`?touch=1`).
**M1.4/M1.6:** **`WIPFEL.courseMap.{visible,open(),close(),toggle()}`**, **`WIPFEL.parkBoard.
standPosition`** (zum Hinteleportieren), **`WIPFEL.agents.list`** (jeder Eintrag: `id, category,
routeId, phase, pos, heading, t, distanceToPlayer, …` – `phase` ∈ wander/toEntry/queue/clipIn/onRail/
unclip/dwell/return), **`WIPFEL.occupancy.{holderOfElement(id), claimElement(id,holder),
releaseElement(id,holder), guestsOnPlatform(id)}`** (dieselbe Instanz, die Spieler und Gäste teilen –
zum Erzwingen der Wartezeile von Hand: `claimElement('burma-1','test')`, dann `interaction.prompt`
prüfen), **`WIPFEL.guestRig.group`** (zehn `InstancedMesh`-Kinder).
F1-Zeilen seit M0.5: `element` (id + t), `balance`, `stamina`, `nerves` (Wert + Stufe),
`heart bpm`, `trust`, `air below`; seit M0.P `terrain lod` (Chunks je LOD, Summe 36); seit M1.6
**`npc count`**, **`npc ms`**.
**Achtung headless:** In Chromium tickt `requestAnimationFrame` nur, wenn der Compositor Frames
liefert – für scriptgesteuerte Läufe `loop.stop()`, `requestAnimationFrame` neutralisieren und
`loop._tick(t)` mit festen 60-Hz-Zeitstempeln selbst aufrufen (siehe Session-Log). Screenshots zeigen
immer das letzte vom Loop gerenderte Bild: für eine eigene Kameraposition erst `loop.stop()`, dann
`renderer.render(scene, cam)`, dann den Screenshot.
**Neu beobachtet in M4 (`tools/dev/verify-m4.mjs` beim Schreiben):** derselbe Kompositor-Kaltstart kann
den allerersten `requestAnimationFrame`-Zeitstempel so weit von `performance.now()` bei `loop.start()`
abweichen lassen, dass `loop.accumulator` auf ca. −20 bis −36 einschnappt und dort für zig Sekunden
hängen bleibt (`js/core/loop.js`s Akkumulator holt das nur mit +1/60 s pro Frame auf) – `physics.step()`
läuft dann de facto nie, der/die Spieler/in hängt für immer im `"air"`-Zustand, **reproduziert auch ganz
ohne Koop** (reiner Solo-Boot). Behelf: `loop.stop(); loop.accumulator = 0; loop.start();` einmal direkt
nach `WIPFEL.ready`. Zusätzlich beobachtet: ein Screenshot direkt danach kann trotzdem noch ein
veraltetes Bild zeigen (Kamera scheinbar wild verdreht) – am zuverlässigsten ist die volle manuelle
Variante: `loop.stop()`, `accumulator = 0`, `running = true`, dann `loop._tick(t)` selbst N-mal mit
`t += 1000/60` aufrufen (loop bleibt danach `running = false`, kein neuer `requestAnimationFrame`
registriert) – Zustand UND Screenshot entstehen dann garantiert im selben eingefrorenen Moment, ganz
ohne auf den natürlichen rAF-Takt zu vertrauen. `tools/dev/verify-m4.mjs` macht das so.

## Aktueller Seed / Reproduktionsfälle
Standard-Seed 1 (`DEFAULTS.seed`). Spawn (11.1, 4.8, −163.3) auf Hub `spawn`. Reproduktionsfälle: –

## Fallen / Hinweise
- **Subagenten nie auf Fable 5** – nur `model: "opus"` oder kleiner (siehe CLAUDE.md 12).
- Server nur `serve.py`; Write/Edit können große Dateien abschneiden → `node --check`; Netzwerk nur lokal;
  PowerShell 5.1; `curl.exe -A "Mozilla/5.0"`.
- Rapier-Wireframe (`?physics=1`) auf dem Heightfield kostet Millionen Linien – nur kurz einschalten.
