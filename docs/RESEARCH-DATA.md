# RESEARCH-DATA – real-world numbers and rules that the game models

Data sheet from research on real high-ropes parks (operator/standards data, anonymized).
**Documented values** appear without a marker, **design assumptions** are marked as such. If the
game deviates from a value, a sentence about it belongs in `docs/DECISIONS.md`.

## 1 · Reference park: a real high-ropes park – numbers for “Sonnwendberg”
- Area approx. 30 000 m² (3 ha), route length 1,8 km, south-facing slope overlooking the city.
- 17 routes across 3 levels + 2 toddler courses (35 cm high, without belay, for small children).
  Level breakdown: **Blue 5 routes 3,5–7 m from 110 cm · Red 6 routes
  3,5–10 m from 130 cm · Black 4 routes up to 20 m from 150 cm.** **Park map board on site:
  Blue I–VII, Red I–VI, Black I–IV = 17** – the 5/6/4 count is outdated or omits two
  blue beginner/children’s routes. 150–180 obstacles. Routes are named “color + Roman numeral”
  (signposts: “BLUE I II III IV”, “RED IV”, “RED III V VI”, “BLACK III”); several share
  starting areas; “Step into the Void” is marked on the board as a separate location.
- Flying Fox at the end of (almost) every route; “Mega Flying Fox” at 20 m toward the skyline; a 150 m
  long Flying Fox as the finale of a black route; test route “Step into the Void” (free-fall element).
- Ascent via steel ladders/rungs or **wooden block ladders** (a board on the trunk with
  staggered wooden blocks as steps) and inclined entry walls onto wooden platforms; at ground level
  **entry decks (~40 cm) with a bench** for clipping in. Elements: rope/suspension bridges, wobbly nets,
  floating tubes, wobbly beams, planks hanging from ropes.
- **Construction on site:** platforms = planks on a **round-timber frame/ring** around the trunk, without
  railings; low platforms additionally with diagonal round-timber supports to the ground; supporting trees mostly
  **black pines** (straight, tall, red-brown plated bark), understory maple/hazel/hornbeam;
  marking tapes (orange) and plaques on route trees; ground anchors with a turnbuckle for
  guy lines/line ends; thin auxiliary ropes; pictogram signs on the trunk; branded barrels.
- **Signage/park map:** arrow-shaped white signposts with a colored border, color name in
  capitals, Roman numerals in white circles; park map as a printed green map on wooden posts
  (roads dashed gray, paths white, “P” circles, POI icons, routes as colored loops with
  numerals, park logo).
- Belay: Smart Belay (Class C/D) – two communicating **roller carabiners** (Bowden-cable coupling, one
  carabiner open → the other locked), Y-lanyard with energy absorber, integrated rollers
  run directly on the Flying Fox cable; full-body harness, helmet; gloves available to rent.
- Rules: no minimum age, **minimum height 110 cm, maximum weight 120 kg**; under 14 only with
  a climbing adult (110–130 cm 1:1 easy only; 130–150 cm 3:1 easy+medium; from 150 cm 5:1
  all); **one person per obstacle, max. 3 per platform**, always at least one carabiner on the cable, Flying
  Fox one at a time only with a clear landing zone; sturdy shoes, tie back hair, no phone/jewelry.
- Ticket: **4 h incl. safety briefing**, +5 € per additional ½ h, last admission 2 h before closing; no
  reservation for private guests; safety course theory + practice (practice route near the ground), then
  “self-belay park” with ground staff; guide 75 €/h.
- Prices: 16 / 20 / 29 € (from 110/130/150 cm), 37 € adults, season pass 399 €, happy hour
  17:00–18:00 –25 %. Season early March – end of October; high summer daily 9:00–20:00.
- Weather: light rain/wind ok; thunderstorm, storm, heavy rain, “fire” → operations halted.
- Empirical values: 3–4 h to exhaustion; from Red onward arm strength needed; Black “brutally hard,” no
  turning back; some blue routes feel harder than red ones; rating 4,7/5.
- History: opened just over ten years ago (14 + 4 induction routes, 135 obstacles); at times
  night climbing (lanterns, headlamps); later redesign.

## 2 · Construction (EN 15567, arboricultural expertise)
- Platforms/anchors **clamped** to the trunk (friction), tree-protection sleeves of wood/rubber, no drilling;
  clamping systems with growth allowance up to 10 cm diameter, readjusting over the years; relocate anchors after 3–4
  years. Tree assessment before commissioning; inspection annually after the winter break and
  after storms; assessment every 12–18 months. Suitable species: pedunculate oak, linden, field maple (thick-barked).
- Cables: galvanized/stainless steel **10–13 mm** (Flying Fox 12 mm / ½″), swaged sleeves,
  safety factor 3; **the obstacle’s load cable and the belay cable (lifeline) are separate**; lifeline
  1,7–2,3 m above the walking level (modern systems: cable height 1,6–2,1 m, cable Ø 10–13 mm, zip 12–14 mm).
- Loads: fall-arrest force ≤ 6 kN; anchors designed for approx. 12 kN (sag doubles to two-and-a-half times
  the cable force).
- Heights: low ropes ≤ 1,8 m step height (from 1,0 m collective belay), above that PPE required.
- Park sizes: 0,5–3 ha; 8–20 routes; 6–20 obstacles per route; investment approx. 350 000 € for
  8 routes (≈ 44 000 € per route), 700 000 € for 6 demanding ones.

## 3 · Obstacle families (catalog) and difficulty axes
Families: rope bridges (two-/three-rope, Burma = 1 foot rope + 2 hand ropes, Nepal/suspension bridge,
rope loops, stirrups, vine walk) · wood/beams (balance beam, wobble bridge, stepping block,
barrels, seesaws, catwalk) · nets/tubes (net bridge, net tunnel, spider web, hanging tubes) ·
rolling/gliding (skateboard, snowboard, surfboard bridge) · traversing/strength (monkey ladders, rings,
trapeze, Jacob’s ladder, climbing wall) · jump/swing/ride (Tarzan jump into the net, giant swing,
Flying Fox, Powerfan, QuickJump, Banana Jump).
Difficulty drivers (industry): height, strength, balance, exposure, length; “extreme” =
thin trees, small platforms, high transitions, ladders with missing rungs.
**The game’s design axes (0–5):** physical · coordinative · psychological · technical – see
`docs/GDD.md`, table “Obstacles as movement problems”.

**Design assumptions (not from sources, for the geometry):** platform diameter 2,0–2,6 m, planks
20–25 cm wide, Burma hand ropes ~1,0–1,2 m above the foot rope, net mesh 10–15 cm, ladder rungs
spaced ~30 cm apart, barrels 60 cm diameter, Tarzan rope 6–8 m long.

## 4 · Difficulty levels and eligibility (industry)
- Color code like ski slopes, **not standardized**: yellow/green children/beginners, blue easy, red medium,
  black hard, special colors. The standard only requires the marking.
- Eligibility via body height (110/130/150 cm) or reach height (115/135/155 or 160 cm)
  plus minimum age per color; children’s routes from 3–5 yrs; alone from 12–16 yrs with consent.
- Weight usually 120 kg (100–130); Flying Fox often 40–90 kg (light people get stuck, heavy people too fast).
- Unlock logics: “yellow first” or “panorama line only after Red” (depending on the park).

## 5 · Belay systems (EN 15567 / EN 17109, classes A–E)
- **A** self-closing, not self-locking · **B** self-locking · **C** mutually
  locking, reduces detachment · **D** mutually locking, prevents detachment · **E** permanently
  connected, releasable only with a tool. Association quality seals: only C–E.
- Gen 1 (A/B): two carabiners “as on a via ferrata”, one-hand rule; error source double-unclipping
  (accident reports: the most common cause of falls in the early days).
- Gen 2 (C/D): Smart Belay systems (Bowden cable, energy absorber, roller carabiners, 85 cm, ~1 kg, max.
  10 m/s zip), variants with magnetic release only on the steel cable (RFID) and Bowden-cable systems with
  magnetic anchor detection without an energy absorber.
- Gen 3 (E): runners with an opening smaller than the cable Ø, larger than the retaining plate; continuous
  trolley systems (trolley = belay + zip pulley) or sliding hook + separate pulley; partly
  key-locked anchor points. No passing; brake blocks and start blockers on the zip.
- Equipment: full-body harness recommended; energy absorber not mandatory in the ropes course (system ≤ 6 kN);
  zip pulley with 2 rollers (9–13 mm, max. 25 m/s); gloves mandatory when hand-braking;
  helmet not normative (strangulation risk from the strap vs. impact protection) – regionally mostly helmet, sometimes without.
- PPE service life commercially approx. 2 years; annual PPE inspection.

## 6 · Flying Fox / Zip Line
- Construction rules of thumb: **3–6 % gradient**, loaded **sag ≈ 2 % of the length**; without a bungee brake
  max. 3 %, with one 6 %. Too taut = hard arrival; too loose = fast in the middle, slow at the end.
- Speed ↑ with mass (heavy people push the cable down further, hardly any more air resistance), ↓ with
  headwind, ↑ with tailwind and fast rollers; body position (“cannonball” vs. “starfish”)
  up to ~40 km/h difference on long lines; a warm cable expands → more sag.
- Lengths high-ropes forest 30–300 m (individual lines 75–210 m; large installations > 400 m up to 1,5 km;
  world record 2,83 km, 150 km/h).
- Brakes: gravity (the cable rises toward the end, swinging to a stop), spring block, bungee block, tire/impact block,
  catch net (pull in legs), hand brake with a leather glove behind the pulley (from ~10 km/h
  arrival only with backup, from ~24 km/h prohibited), eddy-current brake (self-regulating, 15–150 kg,
  arrival 6–36 km/h, retraction automatic).
- Behavior: seated, push off forward, legs extended/slightly tucked, hands off the cable and
  in front of the pulley, do not spin; landing on a platform or ground with wood chips, run it out.
- Rescue: pull line from the end or a rescuer with a tandem pulley (2–5 min).
- Free fall/swing: Powerfan (fan wheel, 13 m, no motor), QuickJump/QuickFlight (eddy current, real
  fall up to 4 m), giant swing (block and tackle/winch, ripcord, up to 70 km/h), Tarzan jump into the net.

## 7 · Operations, supervision, rescue, economics
- Sequence: check-in/signature → harness → 15–30 min instruction → practice route under level 2 supervision →
  free climbing under level 3 (help on request), 2–4 h; “typical guest: ~4 routes in 3 h”.
- Attendants vs. rescuers; **every station reachable by a rescuer in ≤ 10 min**; emergency plan,
  logbook, annual inspection by an independent body, tree inspection report.
- Weather: evacuation in case of thunderstorm/storm/hail/heavy rain; light rain ok (tree canopies provide shelter).
- Season approx. March/April–October; winter without revenue; fixed costs up front, variable costs per guest low →
  utilization (school classes, birthdays, companies, guides, season pass, happy hour, family days).
- Comparison parks (anonymized): Park A 10 routes/79 platforms ≤ 8 m, 26 Flying Foxes, Class E,
  levels 1–9, 32 €; Park B 18 routes/210 obstacles ≤ 15 m, classic 2 carabiners,
  gloves mandatory, 3 h, ~CHF 46–49; Park C 14 + 2 kids ≤ 15+ m, no helmet,
  hand brake, panorama line > 400 m, 3 h, ~CHF 41; Park D 12 + 3
  induction ≤ 15 m, helmet, 3 h, 29 €; Park E 9 routes ≤ 21 m,
  helmet + gloves, 210 m line; Park F 12 + mini ≤ 13 m, ~300 m line over a lake.

## 8 · Real-world rules that create pacing in the game
1 person per obstacle · 3 per platform · one-way (no turning back on Black) · Flying Fox one at a time only with
a clear landing zone · ticket clock · last admission · unlock by height · jumping/swinging on the
routes prohibited (common park regulation – in the game optionally allowed as “shared physics”).
