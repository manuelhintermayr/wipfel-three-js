# WIPFEL – Game Design Document (Draft 2.1)

> "Twelve meters above the ground, one plank, two carabiners – and your head."
> Real numbers: `docs/RESEARCH-DATA.md`. Categories Green/Blue/Red/Black/Legendary (ADR-027);
> UI English + German (ADR-026). The visual target is "stylized realism," realized in the
> running game; architecture and implementation details in `docs/architecture.md`.

**Genre:** physics-based climbing/balance game with a run structure and an open park world; second act:
park builder with guest simulation and shared routes. **Perspective:** over-the-shoulder camera, first
person switchable, first person on the Flying Fox. **Session:** one "ticket" = a run of 30–40 min (4 in-game hours).
**Players:** solo; co-op 2–4 later (accompaniment rule: child + adult). **Tone:** warm, stylized,
honest to the materials – wood, galvanized steel, rope, wind. **MVP:** one blue route with five
obstacles and a Flying Fox that feels right.

## 1 · The Thesis
**You build the fear that others overcome.** The real park doesn't sell sport, but the
perception of danger within a technically controlled system: controlled fear,
self-efficacy, progression, nature, social effect. A game delivers three of these directly (fear through
camera, sound, loss of control; self-efficacy through skill; progression through colors) and simulates two
(nature as backdrop, social effect as co-op/spectators). What the game has over the park: turning the camera
– guest and operator share one simulation with the same rules (1 per obstacle, 3 per
platform, always one carabiner attached, 10 minutes until the rescuer).

Order: **first the climber, then the operator.** If a wobbling plank six meters up doesn't make
anyone lean to the side, no builder will carry the game.

Player's line: **The ground is safe. The fun begins when you leave it.** Height is the
progression currency – and therefore stays scarce.

## 2 · The Game Loop
Platform (rest, regeneration) → read the next obstacle (preview card) → clip over (click – click) →
solve the movement problem (balance · strength · nerves) → made it (trust +1) or slipped (hang in the
harness, pull up, or rescuer) → platform → … → Flying Fox (let go, fly, land) → stamp →
park map: what's next (color, wait time, remaining time) → …

Layers: obstacle = 20-second puzzle of body control · route = dramaturgical sequence of 8–15
obstacles with the Flying Fox as the payoff · ticket = economy of strength, nerves, queues, and
clock · meta = trust, unlocks, later the park itself.

## 3 · Climber Gameplay

### 3.1 Three Resources, One Body
- **Balance** (momentary): a pendulum below the center of gravity; each obstacle excites it differently
  (rope bridges sideways, planks lengthwise, barrels rolling). The left stick leans against it; too large a swing =
  slipping off.
- **Strength** (reserve, arms): gripping stabilizes and costs; hand traversing, nets, pulling up drain it; the platform
  and standing refill it.
- **Nerves** (the psychological axis, the real opponent): rise with height (log), exposure, sway,
  gusts, looking down, time on the obstacle; fall on the platform, while breathing, on hand contact,
  with each completed obstacle, when someone calls from below. The effect works as noise: the camera
  breathes, hands tremble (balance noise), sound goes muffled, the heartbeat becomes audible; at the very
  top the body freezes until you stand still for three breaths. Never lethal. **No bar – a heartbeat.**
- **Trust** (slow, per run and across runs): the rise in nerves decreases with completed obstacles and
  consequence-free falls – "I can trust the harness" as meta-progression without a menu.

### 3.2 Controls (gamepad; keyboard analogous)
| Input | Effect | Note |
|---|---|---|
| Left stick / WASD | forward/back on the obstacle; sideways = leaning; walking on the ground | platform freely walkable; obstacle = rail with wobble model |
| Right stick / mouse | look | looking down raises nerves |
| LT / RT · Q / E | grip left / right hand (hold) | hand ropes, vines, rungs, rings; both = stable, expensive; hand traversing = L-R-L |
| A / spacebar | step, jump (Tarzan), push off (Flying Fox), tuck legs (landing) | foot elements are timed |
| X / F | clip over | two presses per platform |
| B / R | breathe (hold) | nerves fall, no movement |
| LB / Shift | sprint (only on the ground) | no effect on obstacles |
| RB / T | camera shoulder ↔ first person | automatically first person on the Flying Fox |
| Y / Tab | park map | position, wait times, remaining time |
| – / E | interact | ticket desk, signs, mount ladder, clip trolley/carabiner onto the Flying Fox |
| Start / Esc | pause, options | |
| – / F1 | debug panel | development only |
Controls remappable (options, from M1 on); gamepad haptics as abstraction (fall, landing, click).

### 3.3 Clipping Over: Click – Click
At every platform, from the belay line of the last obstacle to that of the next. Smart Belay = a ritual of two
presses: the first carabiner releases, travels, snaps in – click; only then does the lock free the second – click.
Impossible to do wrong, but two seconds of attention – the breather in which you read the next obstacle. HUD:
two carabiner icons (clipped in · open · locked) + sound.

**Modes (the three real belay generations):**
| Mode | Model | Change | For whom |
|---|---|---|---|
| Continuous | Class E (continuous trolley) | no clipping over; no overtaking – you queue behind slower people | children, beginners |
| Smart Belay | Class C/D | two presses, order enforced, mistakes impossible; rollers in the carabiner | standard |
| Classic | Class A/B ("like on a via ferrata") | both carabiners free (X/Y); a fall with both open ends the run with an accident report; Flying Fox with a hand brake (leather glove behind the roller) | classic two-carabiner parks |

### 3.4 Obstacles as Movement Problems
Each obstacle = rail (spline) + wobble model (spring-damper) + hand-contact option + axis profile.
| Family | Movement problem | Axes (0–5) phys·coord·psych·tech | Teaches |
|---|---|---|---|
| Rope bridges | lateral sway builds up with speed; rhythm walk–stand–walk; hand ropes cost strength | 2·3·3·1 | metering your pace |
| Beams, planks, step boards | lengthwise tipping; hanging planks keep swinging – wait for the step window | 1·4·4·1 | timing, patience |
| Nets, tubes | no balance, but strength and slowness; tubes lower nerves | 4·1·1·1 | catching your breath |
| Skateboard, snowboard, barrels | moving surface: push off, roll along, lean against | 2·5·3·2 | reading momentum |
| Hand traversing, rings, Jacob's ladder | strength in an alternating rhythm L-R; grip too late = hanging in the harness | 5·3·4·2 | rationing your strength |
| Tarzan jump | run-up, takeoff, grab into the net; nerve spike | 3·3·5·2 | courage as timing |
| Ladders, climbing wall | trivial – but the 20 m ladder at the start of Black is a nerve ramp | 2·1·2–5·1 | accepting height |
| Flying Fox | push off, posture, legs up before the brake; speed by weight, sag, wind | 1·2·2·3 | letting go |

Rules as pacing: **one person per obstacle, three per platform** (NPC guests slow you down; waiting regenerates
and teaches – watching gives trust) and **one-way** (past the marker no going back; the only reversal = rescuer).

### 3.5 Slipping and Rescue
A fall = half a meter into the harness, then swinging below the belay line. No death, no loading time:
pull up (strength) or hand-traverse along the belay line to the platform (slow, safe). Strength empty → rescuer
(NPC climbs up, ropes down: 60–120 s ticket time, the route counts as aborted). Only the
classic mode knows the real fall – as a dry accident report, no explosion.

### 3.6 Flying Fox
First-person camera, wide field of view, the whir of the trolley. Physics by rules of thumb: 3–6 % gradient, ~2 % sag,
speed rises with weight (size class), falls with headwind; light ones come to a stop and get pulled in
(pull line, 20 s); the brake decides: gravity (swing out), net (legs up!), spring block (jolt), eddy current
(velvety, expensive). On long lines the moment when the forest opens up and the skyline lies below: two
seconds in which the game wants nothing. Later: **transfer stations** (intermediate platforms, swap the roller);
in the last chapter **transfers** in mid-air. Not in the first park – the belay stays honest.

### 3.7 The Ticket as a Run
Four in-game hours ≈ 30–40 min incl. safety briefing. Ticket desk: ticket type (standard; Happy Hour shorter/cheaper
with a score multiplier; night climbing with a headlamp – less fear of heights, more of the unknown),
size class (color unlock, zip speed), mode. Practice route at 1 m height = tutorial + unlock. Last
admission 2 h before closing. At the end a **stamp card**: routes by color, "clean," photos, remaining time,
unlocks, "Another half hour? €5."

### 3.8 Ticket or Season Pass
**Ticket** = run (clock, stamp card, score). **Season pass** = open world (no timer, the park as a place:
watch, take photos, look for Legendary Routes, argue over which color to take). Explorers play the
season pass, completionists both, speedrunners the ticket and **time trials** of individual routes
(start platform, carabiner in, three, two, one – no loading time).

### 3.9 The Park as a Network
Some platforms are **intersections**: signs left Blue, straight ahead Red, right Black, down the long
Flying Fox into the valley – the group decides. Linear routes become a route map in 3D,
repetition becomes spatial learning. The ground stays the hub; between intersections the one-way and
platform rules still apply – otherwise there are no traffic jams and no comedy.

### 3.10 Flow – the Counterforce to the Nerves
Balance, grip, swing, land, clip over, fly without interruption → **flow multiplier**
(×1.2 … ×4): music layers up, the camera grows more dynamic, animation softer. Optional (counts only after
the first clean run). Nerves want you to stand still; flow wants you to keep going – so flow grows only as long as
the nerves stay below the threshold: flow = calm + continuity.
Whoever rushes loses both.

### 3.11 Four on the Platform (Co-op, later)
The social effect arises on its own (one says "Black," one "no way," one trembles, falls into
the harness, everyone laughs). Deliberately added: **shared physics** (jumping onto the bridge a friend is
standing on – forbidden by the rules in reality; allowed in the game if the group switches it on) and
**co-op obstacles** (pull a counterweight, throw a rope, stabilize a bridge with four people). Clipping over under
time pressure: "Keep going!"

### 3.12 Progression
Colors are gates (Blue → Red → Black → finale line). Four **mastery levels** per route:
completed · without a fall · under the target time · in flow. **Legendary Routes** without a park-map entry
(badges, leaderboard, jacket). **Equipment as sidegrades** (gloves: more grip, slower clipping over;
light shoes: better balance, harder landing; fast roller: harder to brake; headlamp opens up the night).
The player gets better, not their avatar. No XP.

## 4 · Operator Gameplay (second act, M3)
Bird's-eye view, the same map, the same rules. Begin in winter with a tree list (species, diameter,
health; thin/sick ones can't carry a platform; trees grow → readjust the clamping).
- **Building:** platforms (capacity 3), obstacles from the catalog (axis profile, cost, throughput time,
  strength requirement), entry, exit; the Flying Fox tool shows gradient, sag, and arrival speed per
  size class live and suggests the brake; you assign colors yourself – the park notices whether they're right.
  **Route inspector:** dramaturgy curve, axes, variation, congestion risk, rescuer coverage.
- **Inspection walk:** no route opens before the operator has walked it themselves ("inspection before
  commissioning") – the camera drops to the first platform, climber mode. The same mechanic: **guide**
  (lead a group) and **rescuer** (guest in panic, 10 in-game-minute timer).
- **Guests as agents:** profiles (child with a chaperone, teenagers, adults, athletic ones, anxious ones,
  school class with a supervision ratio, corporate group) with courage, strength, expectations; they choose
  by unlock/color/wait time; platform and obstacle rules → traffic jams; fear events from the
  psychological axes; overlays: wait time, fear, rescue coverage (10-min radius), tree health.
- **Safety as a tech tree and an obligation:** classic / communicating / continuous with the real
  trade-offs; PPE ages (2 years); helmet/gloves as decisions; annual inspection; thunderstorm =
  evacuation (all rescuers at once).
- **Economy:** fixed costs up front (~40–50k per route), variable costs ≈ 0, season March–October →
  utilization: ticket models, size-class pricing, Happy Hour, season pass, school classes, birthdays,
  corporate events, guides; signature logic (149 solid obstacles + one everyone talks about);
  destination synergies (lodge, viewpoint, archery).
- **Sharing (Trackmania × high-ropes park):** publish routes/parks with a card (color, height,
  length, obstacles, Flying Foxes, rating, best time, world record). Only those who have walked their
  own route may publish.

## 5 · UI and Screens
The language of the park signage: arrow-shaped white signposts with a colored border and Roman numerals
in circles ("BLUE I II III IV"), a printed green park-map board on wooden posts, laminated
safety sheets, a condensed typeface. HUD diegetic and quiet; color always carries a shape (● ■ ◆).

**Screens:** Title (platform in morning light, "Buy a ticket") · Ticket desk (ticket type, size class, mode,
time of day – a sheet of paper) · Safety briefing (trainer dialog with real content, then practice route 1 m) ·
Park map (wooden board: routes as colored lines, wait-time markers, position, stamp card) · Obstacle
(HUD) · Platform overlay (preview card, clipping over, breathing) · Flying Fox (first person, HUD nearly gone) ·
Stamp card · Builder (toolbar, overlays, inspector, calendar, box office).

**HUD (obstacle) – 1:1 per mockup:**
```
▌RED ROUTE                                                        [Ticket 2 h 41]  (ticket mode only)
  ◈ RAVEN RUN
  ⏱ 13 / 19        [Belay ○●]  [Strength ◔]  [Heartbeat ~~^~~]   (Wipfel's own, small, below)
  ⏱ 02:18.54
  ◆ BEST: 04:38.76

                     (forest, rope bridge, climber, belay cable above)

[⚉ ⚇ 📷]                         FLOW                    [Ahead: Nepal bridge · 14 m · hand cables]
                                 x2.4  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
```
Route header top left (color bar, category, icon + name, progress, running time, best time),
flow bottom center with a bar, mode icons bottom left, context prompt/preview bottom right,
carabiner widget/strength ring/heartbeat small below the header. Red vignette = nerves, no damage.
**Zipline:** header `ZIPLINE · EAGLE FLIGHT · 310 m`, speedometer `SPEED 62 KM/H` bottom right. **Start:**
banner `BLACK ROUTE · THE CROW · 19 OBSTACLES · 32 m HEIGHT · 480 m LENGTH · BEST TIME · START` +
countdown 3-2-1-GO. **Safety tooltip:** `SAFETY FIRST – Always stay clipped in. You can only
unclip one carabiner at a time.` **Course Map:** full-screen overlay with relief, colored routes,
platform nodes, legend, filter/player/zoom/exit.

**Park map:** a board in the style of the real park map (green map on posts, paths white, routes as
colored loops with numerals), map on the left (colored lines, ⏱ markers, pin), cards per route on the
right (color/shape, height, obstacles, elements, Flying Fox, wait time, unlock/"locked until Red completed")
and a stamp card (Blue 1 ✓ clean · Red 1 ✓ (1 fall) · Ticket 2 h 41 · last admission 16:00).

**Builder:** header (season/date/clock, weather+gusts, guests/waiting avg, box office, rating), toolbar
(trees/survey, platform cap. 3, obstacles/catalog, Flying Fox gradient·brake, belay A/B·C/D·E,
staff supervisors·rescuers, box office tickets·prices, overlays waiting·fear·rescue), inspector on the right
(axes as bars, dramaturgy curve yellow=obstacle/blue=Flying Fox, variation, congestion risk, rescuer
coverage, notes "Obstacle 9 (hand traversing) is above the red profile – panic rate 7 %"), dashed 10-min
radius, yellow marker = full platform.

## 6 · Art, Sound, World
**World.** First park: a fictional hillside park above a city – beeches and oaks on the south slope, a saddle with
a view, a lodge, an archery range next door, the skyline in the haze: modeled on a real high-ropes park, without the brand. 2
toddler courses, 5 blue, 6 red, 4 black routes, a practice route at the entrance, ~150 obstacles, each ending with
a Flying Fox, the longest 150 m from 20 m toward the city, a hidden element, "step into the void."

**Chapters** (the escalation stays real for a long time): 1 hillside park with skyline (3–20 m) · 2 bathing park by the
water with 26 short lines and a giant swing · 3 river park with hand-brake ziplines and a 400 m signature line ·
4 industrial wasteland (steel towers, cranes, conveyor systems – real climbing-tower/mine facilities) · 5
mountain park with a gondola, 21 m platforms, a 1.5 km line · 6 **the park that no one could build** (40,
80 m, gorges, transfers, Legendary Routes; the community builds here). Height stays scarce: if everything is
40 m high, nothing is high anymore.

**Visuals.** Stylized, not cartoonish: low-poly canopies with painted leaf masses and wind, honest
material up close (galvanized steel with a sheen, swaged clamps, wooden planks with grain, rope,
clamping blocks on the trunk – no screws). On-site reference (reference photos of a real high-ropes park):
black pines as platform supports with leafy undergrowth, platforms as planks on a ring of round timber without a railing,
low entry platforms with slanted supports, an entry deck with a bench, wooden block ladders,
angled entry walls, orange marking tapes on route trees, ground anchors with a turnbuckle,
pictogram signs, branded barrels. Light: late summer, low, long shadows; night with
headlamp cones and paper lanterns. UI colors from the park signage, otherwise from the forest.

**Sound.** Fully synthetic: two carabiner clicks (opening bright, locking full), trolley whir that rises with
speed, steel-cable hum under load, wind gusts scaled to height, birds, distant city, children calling from
below, heartbeat (louder with nerves, receding while breathing). No music on the obstacle; music at the
ticket desk, on the platform at sunset, on the stamp card.

## 7 · Technology
R3F-like architecture, but without a build step (see `docs/architecture.md`): Three.js + Rapier (ground, platforms,
character controller), WebAudio synthesis. **Obstacles are rails, not physics:** spline + parameters
(spring-damper in 1–2 axes, hand contact, axis profile, length); player = parameter t; balance = 1-D
pendulum; procedural animation of nets/barrels/planks from the same excitation. Rigid body only for
the Tarzan jump, swinging in the harness, Flying Fox analytic (sag model). Guests = agents on a
graph (platforms nodes cap. 3, obstacles edges cap. 1) → queues without AI; the builder writes
the same graph; inspection walk = a camera switch on the same data. Trees instanced, LOD; target 60 fps
on a mid-range laptop; desktop with gamepad/keyboard first; mobile later (first person + virtual stick +
two hand buttons – the Flying Fox actually works even better on a phone).

## 8 · Scope, Milestones, Risks
| Milestone | Content | Success criterion |
|---|---|---|
| M0 · One Plank | one blue route: ladder, Burma bridge, hanging planks, net, Flying Fox; clipping over, strength, nerves, camera, sound | testers lean to the side; no one asks what the carabiner is for |
| M1 · One Ticket | six routes (2/2/2), ticket desk, safety briefing, park map, ticket clock, NPC guests with platform rules, stamp card, color unlocks | a run lasts 30–40 min and you want "another half hour" |
| M2 · One Park | 15 routes + toddler courses, intersection platforms, season pass, time trials, flow, mastery levels, night, three belay modes, photos, polish, mobile | speedruns on Black, children on Blue, both satisfied |
| M3 · The Operator | builder, guest simulation, inspection walk, inspections, weather, economy, rescuer role | players build routes that others want to climb |
| M4 · The Others | co-op 2–4 (accompaniment rule), spectator calls, shared physics, co-op obstacles, published routes with best times, further chapters | the social effect arises on its own in voice chat |

**Risks:** the climbing feel on rails (M0 first, camera and sound early, pose blending instead of IK
perfection) · camera in dense canopies (thin out the canopies around the player, over-the-shoulder camera close) ·
overscope from the hybrid (M3 optional; M0–M2 are a complete game) · realism that bores (waiting
regenerates and teaches; every rule must do something interesting or it's cut) · the temptation to turn
nerves into a bar after all (the heartbeat stays).

## 9 · Why the Game Is Something of Its Own
Climbing exists (Jusant, Peak, the Getting-Over-It family), amusement-park building exists (Planet Coaster,
RollerCoaster Tycoon). What doesn't exist is the climbing forest with a double view: the same platform as
a place of fear and as a node in the flow of traffic, the same carabiner as a ritual and as an
investment decision, the same zipline as a reward and as a gradient calculation.

## 10 · Second Opinion ("Canopy") – Adopted / Rejected
**Adopted:** park as a network with intersection platforms; flow as a counterforce to the nerves;
mastery levels; Legendary Routes; sidegrades; shared physics and co-op obstacles; transfer stations
and (last chapter) transfers; chapter escalation up to the unbuildable park; sharing with best times;
the player's line "The ground is safe …".
**Rejected:** dropping the operator act (the distinctive part); dropping the ticket (becomes a mode alongside the
season pass); height inflation (80 m as the norm); an early flight into fantasy; mid-air transfer
in the first park (physically nonsensical with honest belay).

**Open:** working title (Wipfel); whether M3 gets built – decision after M1.
