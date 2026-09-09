// Global constants. Everything tunable lives here or in the park/catalog data – never as magic numbers.

export const GAME = Object.freeze({
  name: "Wipfel",
  version: "0.1.0-m0",
  saveKey: "wipfel-save-v1",
  saveSchema: 1,
});

export const PHYSICS = Object.freeze({
  hz: 60,                    // fixed physics step
  maxSubSteps: 4,            // catch-up cap per frame (prevents spiral of death)
  gravity: { x: 0, y: -9.81, z: 0 },
});

export const TIME = Object.freeze({
  gameHourMinutes: 10,       // 1 in-game hour = 10 real minutes (ADR-008)
  ticketHours: 4,
  lastEntryHoursBeforeClose: 2,
});

/** Ticket clock tuning (js/game/ticket.js, ROADMAP M1.5). */
export const TICKET = Object.freeze({
  openingHour: 9,              // the park's opening time on the sky clock (GDD §3.7)
  warnMinutes: 30,             // game minutes remaining that trigger the "running out" toast
  extendGameMinutes: 30,       // one "+30 min" extension (RESEARCH-DATA §1: "+5 € per additional 1/2 h")
  maxExtensions: 2,
  extendPromptSeconds: 8,      // real seconds the "extend?" prompt stays up before the day ends anyway
});

/**
 * Ticket types sold at the ticket desk (GDD §3.7/§3.8). scoreMultiplier is a placeholder – applied in M2 (Flow).
 * "season" (M2a, GDD §3.8 "season pass"): `hours: Infinity` is the whole trick – js/game/ticket.js's
 * clock only ever compares *finite* numbers, so an infinite total simply never goes non-positive,
 * `expired`/`clippable` fall out already correct (never expires, always clippable) with no separate
 * "mode" flag anywhere in the clock. `js/game/session.js` hides the `.hud-ticket` box whenever
 * `!Number.isFinite(ticket.totalGameMinutes)`, and the day-end sequence (30-min toast, extend prompt)
 * simply never triggers for the same reason – "stamp card on demand only" is already what the options
 * screen's/`WIPFEL.debug.endTicket()`'s "End day" does for every mode.
 */
export const TICKET_TYPES = Object.freeze([
  { id: "standard", hours: TIME.ticketHours, labelKey: "kassa.ticket.standard.name", descKey: "kassa.ticket.standard.desc", scoreMultiplier: 1 },
  { id: "happyHour", hours: TIME.ticketHours / 2, labelKey: "kassa.ticket.happyHour.name", descKey: "kassa.ticket.happyHour.desc", scoreMultiplier: 1.25 },
  { id: "season", hours: Infinity, labelKey: "kassa.ticket.season.name", descKey: "kassa.ticket.season.desc", scoreMultiplier: 1 },
  // M2b (ROADMAP "night climbing"): a ticket type like any other – `openingHour` is the only thing that
  // makes it "night", read by js/main.js#startDay instead of TICKET.openingHour. Only offered at the
  // ticket desk once `save.hasCompletedAnyRoute()` (js/ui/kassa.js) – GDD "only after the first completed
  // course" simplified the same honest way js/game/flow.js's HUD-unlock already reads that sentence.
  { id: "night", hours: TIME.ticketHours, labelKey: "kassa.ticket.night.name", descKey: "kassa.ticket.night.desc", scoreMultiplier: 1, openingHour: 20.5 },
]);

/** Time trials (ROADMAP M2a, GDD §3.8 "time trials"). Logic: js/game/route.js, js/game/session.js. */
export const TRIALS = Object.freeze({
  inputAction: "trial",     // core/input.js – bound to KeyG (KeyT is already "camera")
});

/**
 * Flow – the counterforce to nerves (ROADMAP M2a, GDD §3.10). Pure logic: js/game/flow.js.
 * Builds only while the climber is *progressing* on an element/zipline/tarzan swing, has held that for
 * `cleanHoldSeconds` without a break, and nerves stay under `nervesCeiling`; any fall or freeze snaps
 * it back to `min`. Standing on a platform pauses it (no reset) for `pauseGraceSeconds`, then it decays
 * back towards `min`. `buildRate`/`decaySeconds` are tuned so a clean multi-obstacle run can reach `max`
 * (~40 s of continuous clean crossing) and a paused climber gives it back over ~10 s.
 */
export const FLOW = Object.freeze({
  min: 1.0, max: 4.0,
  cleanHoldSeconds: 1.5,
  nervesCeiling: 0.55,
  buildRate: (4.0 - 1.0) / 40,
  pauseGraceSeconds: 6.0,
  decaySeconds: 10.0,
  cleanClipBonus: 0.1,      // js/game/clip-meter.js: a re-clip under `cleanClipSeconds` feeds this much
});

/**
 * Re-clip feedback / "re-clip feedback" (ROADMAP M2a). Logic: js/game/clip-meter.js. Measures the
 * two-click ritual's real-time duration (belay events → `bothOnSameAnchor()`); under `cleanSeconds` at
 * a *new* anchor earns the toast + the flow bonus above. Suppressed while the onboarding dialogue is
 * still running (a beginner fumbling through the practice-anchor ritual is not "clean or not", it is
 * still learning).
 */
export const CLIP_METER = Object.freeze({
  cleanSeconds: 1.2,
});

/**
 * Mastery tiers per route, evaluated once at `zip:finished` (ROADMAP M2a, GDD §3.12). Pure logic:
 * js/game/mastery.js. `parScale` turns the generator's own length/kind-speed estimate into a par time
 * (see js/game/route.js#routesFromPark's `parS`) – RESEARCH-DATA has no real-world "average crossing
 * time" to calibrate against, so ×1.6 over an idealised non-stop crossing is a documented design
 * assumption (generous enough that a careful first-timer can still make it, tight enough that dawdling
 * does not).
 */
export const MASTERY = Object.freeze({
  parScale: 1.6,
  inFlowAverage: 2.0,        // average flow value across the run that counts as "in flow"
  tierOrder: Object.freeze(["completed", "noFalls", "underPar", "inFlow"]),
});

/**
 * Equipment sidegrades (ROADMAP M2a, GDD §3.12 "equipment as sidegrade"). Exactly one may be
 * selected (or none); each trades one axis for another rather than being a flat upgrade. Logic:
 * js/player/sidegrade.js; wired at the call sites named in each comment below.
 */
export const SIDEGRADES = Object.freeze({
  gloves: Object.freeze({
    id: "gloves", labelKey: "kassa.gear.gloves.name", descKey: "kassa.gear.gloves.desc",
    gripDrainScale: 0.75,      // js/player/stamina.js: STAMINA.gripDrain × this while a hand is on a hold
    reclipSecondsPenalty: 0.3, // js/game/clip-meter.js: added to the measured ritual duration
  }),
  shoes: Object.freeze({
    id: "shoes", labelKey: "kassa.gear.shoes.name", descKey: "kassa.gear.shoes.desc",
    balanceDisturbanceScale: 0.85,  // js/player/on-element.js: on top of assist's own disturbance scale
    pullUpDrainScale: 1.10,         // js/player/stamina.js: STAMINA.pullUpDrain × this while pulling up
  }),
  trolley: Object.freeze({
    id: "trolley", labelKey: "kassa.gear.trolley.name", descKey: "kassa.gear.trolley.desc",
    // +10% top speed ⇒ terminal-velocity drag scales with 1/v² at a fixed slope/mass (ZIP_PHYSICS'
    // dv/dt balance ignores rollResist's small contribution here), so ×(1/1.1²) ≈ 0.826 on dragCoeff
    // is the dimensional-analysis answer for "10% faster", applied per-ride in js/player/on-zipline.js.
    zipDragScale: 1 / (1.1 * 1.1),
    zipBrakeZoneScale: 0.80,   // js/zipline/brakes.js: the net's latch point moves 20% closer to the end
  }),
});

export const RENDER = Object.freeze({
  maxPixelRatio: 1.75,
  shadowMapSize: 2048,
  fov: 55,
  near: 0.1,
  far: 900,
  toneMappingExposure: 1.0,
});

export const WORLD = Object.freeze({
  size: 480,                 // metres per side of the playable slope
  seaLevel: 0,
});

/** Route categories – colour, symbol, human label keys. Order = difficulty gate order. */
export const CATEGORIES = Object.freeze([
  { id: "green",     colour: 0x6fbf3b, css: "var(--cat-green)",     symbol: "◈", labelKey: "cat.green" },
  { id: "blue",      colour: 0x2f6fd6, css: "var(--cat-blue)",      symbol: "●", labelKey: "cat.blue" },
  { id: "red",       colour: 0xd8342c, css: "var(--cat-red)",       symbol: "■", labelKey: "cat.red" },
  { id: "black",     colour: 0x1c1c1e, css: "var(--cat-black)",     symbol: "◆", labelKey: "cat.black" },
  { id: "legendary", colour: 0xe5b93c, css: "var(--cat-legendary)", symbol: "✦", labelKey: "cat.legendary" },
]);

export const CATEGORY_BY_ID = Object.freeze(Object.fromEntries(CATEGORIES.map((c) => [c.id, c])));

/** Real-park rules that shape pacing (docs/RESEARCH-DATA.md §8). */
export const RULES = Object.freeze({
  maxPerElement: 1,
  maxPerPlatform: 3,
  minHeightCm: 110,
  maxWeightKg: 120,
  sizeClasses: Object.freeze([
    { id: "s110", minCm: 110, allowed: ["green", "blue"],                       massKg: 32, labelKey: "kassa.size.s110" },
    { id: "s130", minCm: 130, allowed: ["green", "blue", "red"],                massKg: 45, labelKey: "kassa.size.s130" },
    { id: "s150", minCm: 150, allowed: ["green", "blue", "red", "black"],       massKg: 60, labelKey: "kassa.size.s150" },
    { id: "adult", minCm: 160, allowed: ["green", "blue", "red", "black", "legendary"], massKg: 78, labelKey: "kassa.size.adult" },
  ]),
});

/** Belay systems the park can be run with (GDD §safety, `?belay=`). Logic: js/player/belay.js. */
export const BELAY_MODES = Object.freeze(["continuous", "smart", "classic"]);

export const DEFAULTS = Object.freeze({
  seed: 1,
  locale: "en",
  belayMode: "smart",        // one of BELAY_MODES
});

/**
 * NPC guests (ROADMAP M1.6/M3b): count/route assignment is deterministic per seed
 * (js/npc/agents.js#createAgents forks `rng`), occupancy caps come from RULES above. The guest
 * archetype roster itself (courage/strength/patience) moved to js/npc/profiles.js in M3b – GDD §4
 * "guests as agents" – the same way js/elements/catalogue-data.js's kind table lives next to its own
 * domain rather than here (this file stays plain scalar tuning, not content tables).
 */
export const NPC = Object.freeze({
  countMin: 8,
  countMax: 14,
  cullDistance: 90,            // metres from the player beyond which rig pose updates are skipped
  maxPerPlatformGuests: 2,     // RULES.maxPerPlatform stays 3 total – guests leave the player a slot
  walkSpeed: 1.35,             // hub wander / approach to the entry deck
  arriveRange: 0.6,
  wanderRadius: 16,            // metres around the hub for idle wandering
  wanderLegs: [1, 3],          // how many wander hops before heading to the assigned route
  dwellSeconds: [1.5, 4.5],    // idle pause on a platform
  clipPauseSeconds: 0.9,       // visible "two-click ritual" beat before climbing / after unclipping
  elementStepSeconds: [0.7, 1.3],  // discrete kinds (planks, stirrups, …): seconds per step incl. swing wait
  elementSpeedFallback: 0.5,   // m/s, used only if an element has no own walkSpeed
  zipSecondsPerMetre: 0.22,    // eased traversal duration ≈ length * this (a lazy ~16 km/h average)
  trustWatchRadius: 2.6,       // metres (flat) – "the player stands on the platform" proxy for the trust hook
  trustWatchHeight: 2.2,       // metres (vertical) – generous, decks vary a little in height
});

/**
 * Fear events (ROADMAP M3b, GDD §4 "fear events from the psychological axes"). Pure logic:
 * js/npc/profiles.js#rollFearEvent. `psychThreshold` is the catalogue's own 0-5 "psychological" axis
 * (js/elements/catalogue-data.js) above which a low-courage guest starts to feel real pressure; below
 * it nobody ever freezes, however anxious. `freezeChanceScale`/`panicEscalation` are documented design
 * assumptions (GDD gives no real probability table) tuned so an anxious guest (courage ≈ 0.2) on a
 * psychological-5 element freezes clearly more than half the time and panics a small minority of those.
 */
export const FEAR = Object.freeze({
  psychThreshold: 3,
  freezeChanceScale: 0.85,
  panicEscalation: 0.4,
  freezeSeconds: [6, 15],
});

/**
 * Rescuer role (ROADMAP M3b, GDD §4 "rescuer: guest in panic, 10 game-minute timer", RESEARCH-DATA §7
 * "every station reachable by a rescuer within ≤ 10 min"). Logic: js/game/rescue.js. The timer is
 * expressed in *game* minutes like the ticket clock (js/game/ticket.js) and converted the same way
 * (`TIME.gameHourMinutes` real seconds per game minute) – `10 game-minutes → 100 real seconds` at the
 * project's own default pacing, a workable HUD countdown rather than a literal ten real-world minutes.
 */
export const RESCUE = Object.freeze({
  timerGameMinutes: 10,
  postInteractRange: 2.4,
  talkdownRange: 2.2,
  talkdownSeconds: 3,
  maxPosts: 3,
  walkSpeedMps: 1.3,           // IAPA "reachable within N minutes" assumption for the coverage overlay
});

/**
 * Season/day operations (ROADMAP M3b, GDD §4 "safety as a tech tree and obligation"). Logic:
 * js/game/operations.js. A season is 8 in-game days (a "New day" at the ticket desk, ROADMAP wording);
 * PPE wears by a fixed amount per guest-day and per player-day, an inspection becomes due at 85% worn
 * (the annual-inspection ritual compressed to the scale of a single play session – documented, honest
 * simplification, RESEARCH-DATA §7's real "annual inspection" is a season, not a single day, in
 * reality). Weather is a deterministic per-day forecast; a storm always lands at a fixed hour so a
 * session that reaches that hour reliably sees the evacuation this milestone asks for.
 */
export const OPERATIONS = Object.freeze({
  seasonDays: 8,
  ppeWearPerGuestDay: 0.006,
  ppeWearPerPlayerDay: 0.03,
  ppeInspectionThreshold: 0.85,
  ppeResetCash: -1,            // placeholder, real cost lives in ECONOMY.ppeResetCost
  stormHour: 14,                // storm days always break at 14:00 park time
  stormDurationHours: 1.5,
  forecasts: Object.freeze(["clear", "overcast", "windy", "storm"]),
  forecastWeights: Object.freeze([5, 3, 2, 1]),   // storm is the rare one
  windBiasByForecast: Object.freeze({ clear: 0.9, overcast: 1.0, windy: 1.35, storm: 1.8 }),
});

/**
 * Economy + rating (ROADMAP M3b, GDD §4 "economy"/"operator notices whether the colours match"). Logic:
 * js/game/economy.js. Fixed costs upfront, ~0 variable cost per guest (RESEARCH-DATA §7) – the only
 * "cost per guest" here is the flip side, admission income. `routeBuildCost`/`lengthScale` land a
 * blue/red/black route in the GDD's own "~40-50k per course" band once a realistic length is folded
 * in. Rating starts at the mockup's own implied "decent, unproven" 3.5/5.
 */
export const ECONOMY = Object.freeze({
  startingCash: 150000,
  dailyFixedCost: 500,
  rescuePostCost: 5000,
  ppeResetCost: 2000,
  routeBuildCostBase: Object.freeze({ blue: 40000, red: 43000, black: 46000, legendary: 48000 }),
  routeBuildLengthScale: 40,     // + this much per metre of route length, gently within the 40-50k band
  incomeByTicketType: Object.freeze({ standard: 32, happyHour: 22, season: 45, night: 28 }),
  ratingStart: 3.5,
  ratingMin: 0,
  ratingMax: 5,
  signatureBonusCap: 0.3,        // GDD "signature logic" – simplified to one cap bonus, not 149+1 obstacles
  signatureMinZipLengthM: 100,
  ratingDeltas: Object.freeze({
    routeCompleted: 0.01, shortWait: 0.01, longWait: -0.01, rescueSuccess: 0.05, rescueFailure: -0.08,
    nightAvailable: 0.01, accident: -0.05, evacuationNoWarning: -0.15,
  }),
  wordOfMouth: Object.freeze({ guestsAtFloor: 8, guestsAtCeil: 16, ratingFloor: 2.0, ratingCeil: 5.0 }),
});

/**
 * Local co-op (ROADMAP M4, GDD §3.11, ADR-029/ADR-030). Logic: js/game/coop.js,
 * js/player/coop-camera.js. Player 2 is always the first connected gamepad (js/core/input-source.js);
 * player 1 keeps keyboard+mouse. `leash` is the "stay together" compromise ADR-030 documents instead of
 * splitscreen: beyond `leashStartM` player 2's own movement input is scaled down, floored at
 * `leashMinFactor` so it dampens rather than freezes; the HUD hint shows for as long as the leash is
 * actively cutting in. `camera` feeds js/player/coop-camera.js's pure frame computation – distance is an
 * absolute world distance (not a fraction of the solo `CAMERA.distance*` range in js/player/tuning.js),
 * clamped to the spec's 4-18 m.
 */
export const COOP = Object.freeze({
  camera: Object.freeze({
    distanceMin: 4,
    distanceMax: 18,
    distanceBase: 5,          // metres at zero separation
    distanceGain: 0.42,       // extra metres of distance per metre of separation
    distanceRate: 3,          // 1/s smoothing of the wanted distance
    pivotRate: 5,             // 1/s smoothing of the wanted focus point
    // Activity weight (0..1) per player mode – "frame the climber" is a blend towards whoever weighs more.
    activityWeight: Object.freeze({ element: 1.0, zipline: 1.0, tarzan: 1.0, fall: 0.9, ladder: 0.5, ground: 0.15 }),
  }),
  leash: Object.freeze({
    startM: 24,               // separation beyond which player 2's own input starts being damped
    maxExtraM: 8,             // additional separation (past startM) over which damping ramps to its floor
    minFactor: 0.2,           // player 2's move input is never scaled below this fraction
  }),
  // Spectator calls (GDD §3.11 "spectator calls"): reuses js/config.js#NPC's own watch radius/height –
  // "the player stands on the platform" proxy already tuned for the M1.6 trust hook – for "the *other*
  // climber or a guest stands on the adjacent platform" while co-op is active.
  spectator: Object.freeze({
    intervalSecondsMin: 9,
    intervalSecondsMax: 16,
    nervesRelief: 0.05,       // smaller than a full js/player/nerves.js#watchSuccess() bump – this repeats
  }),
});

/**
 * The two co-op catalogue kinds (ROADMAP M4, GDD §3.11 "co-op obstacles"). Logic: js/elements/
 * counterweight-lift.js, js/elements/team-bridge.js. Both stay solo-passable (RULES/GDD "real parks
 * forbid two people on one obstacle, the game allows it if the group enables it") – a helper only makes
 * either one easier, never required. `helperRange` is how close the *other* climber must stand to the
 * relevant platform anchor, on foot, to engage.
 */
export const COOP_ELEMENTS = Object.freeze({
  helperRange: 2.2,
  counterweightLift: Object.freeze({
    selfHaulSpeed: 0.20,      // m/s, always available – RESEARCH-DATA §... "solo: sandbag preloaded"
    haulTapBoost: 0.16,       // m/s added per W-tap from the platform, decaying away
    haulDecayPerSecond: 0.11, // m/s lost per second (so repeated taps are needed to stay fast)
    maxSpeed: 0.62,
  }),
  teamBridge: Object.freeze({
    tensionKickScale: 0.4,    // -60% wobble impulse while the partner holds the tension rope
  }),
});

/** Course Map overlay + diegetic park board (ROADMAP M1.4). Logic: js/ui/map-render.js. */
export const MAP = Object.freeze({
  padding: 34,                 // px margin around the projected park bounds
  boardTexture: 1024,          // px, board texture width (height = 3/4 of that)
  reliefGridStep: 3.0,         // metres per relief-sample cell (coarse – it is cached once)
  hillLightDir: Object.freeze({ x: -0.55, z: -0.4 }),   // relief "sun" comes from the upper-left
  zoomLevels: Object.freeze([1, 2]),
});

/** Options screen (ROADMAP M1.7). Logic: js/ui/options.js. Values persisted additively in
 * `save.data.settings` (js/core/save.js). */
export const OPTIONS = Object.freeze({
  // The look-sensitivity slider (0–100) maps linearly onto core/input.js's raw sensitivity units.
  lookSensitivityMin: 0.0008,
  lookSensitivityMax: 0.0060,
});

/**
 * Toddler courses (ROADMAP M2a, RESEARCH-DATA §1: "2 toddler courses (35 cm high, without belay, for
 * small children)"). Ground-level flavour only – no belay, no anchors, walkable by anyone; built directly
 * with js/park/timber.js next to the spawn hub, not through the routes/generator/loader pipeline at
 * all (they are not routes and never appear in `parkDef.routes`). Logic: js/park/wichtel.js.
 */
export const WICHTEL = Object.freeze({
  count: 2,
  deckHeight: 0.35,
  logCount: 5,            // stepping logs per course
  logSpan: 0.55,           // metres between log centres
  logRadius: 0.11,
  plankSpan: 1.0,          // one short plank bridge segment inside the course
  clearance: 6.0,          // outside the hub rim, clear of the fingerpost/park-board trailhead cluster
  spacing: 3.5,            // between the two courses
});

/**
 * Classic-mode accident (ROADMAP M2b, GDD §3.3/§3.5: "Only classic mode knows the real fall –
 * as a dry accident report"). Both carabiners open at once while riding/climbing something
 * (js/player/belay.js's `unsafe` event) drops the climber straight to the ground with no harness catch –
 * js/player/accident.js owns the fall itself, js/ui/accident-report.js the dry paperwork afterwards.
 */
export const ACCIDENT = Object.freeze({
  fadeInSeconds: 0.35,      // screen fade to black once the ground is reached
  fallGravityScale: 1.15,   // slightly harder than a normal jump's gravity – this is not a jump
  minFallSpeed: 2.0,        // m/s downward speed enforced even from a near-zero height (a shove, not a step)
});

/**
 * Night climbing (ROADMAP M2b, GDD §3.7 "night climbing with a headlamp – less fear of heights, more
 * of the unknown", §3.1). Unlocked once `save.hasCompletedAnyRoute()` is true – the same gate
 * js/game/flow.js's HUD bar already uses, so no new save field was needed. A "night" ticket type
 * (`TICKET_TYPES`) starts the sky at `openingHour` and lets it drift from dusk into full night over the
 * session exactly like a normal ticket drifts through the afternoon (js/world/sky.js's existing
 * `night` factor, 0..1, already renders stars/darker hemi/warm windows – this milestone only *uses* it).
 */
export const NIGHT = Object.freeze({
  openingHour: 20.5,             // 20:30
  heightReliefScale: 0.6,        // nerves' height term × this at full night – "you can't see how far down it is"
  unknownGain: 0.10,             // flat rise term at full night – "more unknown", independent of real exposure
  headlampRange: 14,             // metres, THREE.SpotLight.distance
  headlampAngleDeg: 27,
  headlampPenumbra: 0.55,
  // Tuned against the *fixed* aim (js/player/headlamp.js used to default `light.position` to
  // three.js's own SpotLight fallback of (0,1,0), aiming the cone ~46° into the ground instead of
  // roughly where the player looks) – the original `7` was eyeballed against that broken aim and read
  // as reasonable only because the mis-pointed beam happened to graze the ground near the feet. Once
  // aimed correctly, `7` under three.js's photometric candela falloff (decay 1.2) was barely above the
  // display's 8-bit threshold at any real distance – confirmed by a controlled paused-frame pixel diff
  // (see docs/screenshots), not just eyeballing a screenshot. 35 is the smallest bump that reads as an
  // actual "lit by my own lamp" patch rather than a rounding error.
  headlampIntensity: 35,
  headlampColour: 0xfff0d8,
  guestHeadlampScale: 0.045,     // radius of the tiny emissive dot guests wear (no per-guest light)
  guestHeadlampColour: 0xffe2a8,
  lampionRouteCount: 2,          // the two blue routes strung with lampions
  lampionsPerEdge: 3,
  lampionHeightAbovePath: 2.3,   // metres above the straight line between two platforms
  lampionRadius: 0.075,
  lampionGlowRadius: 0.30,
  lampionColour: 0xffb35c,
});

/**
 * Photo mode (ROADMAP M2b): `P` freezes the loop (like Esc/options, but no menu) and frees the camera –
 * orbit around the player with WASD dolly + strafe, mouse look, Q/E for height, `P` again to return,
 * Space saves a PNG. Logic: js/game/photo-mode.js.
 */
export const PHOTO = Object.freeze({
  dollySpeed: 6.0,        // m/s, WASD
  sprintScale: 2.4,        // held Shift
  heightSpeed: 4.0,        // m/s, Q/E
  fov: 50,
  pitchLimit: 89 * (Math.PI / 180),
});

/**
 * Graphics quality presets (ROADMAP M2b). Applied live from the options screen (js/ui/options.js) –
 * `pixelRatio`/`shadowMapSize` touch the renderer and the sun's shadow map directly (a map resize needs
 * the old one disposed first, js/world/sky.js#setShadowMapSize); `impostorNear`/`groundDetailScale`
 * are read by js/world/forest.js / js/world/ground-detail.js's own distance-cull constants.
 */
export const GRAPHICS = Object.freeze({
  presets: Object.freeze({
    high: Object.freeze({ pixelRatioCap: RENDER.maxPixelRatio, shadowMapSize: RENDER.shadowMapSize, impostorNear: 100, groundDetailScale: 1.0, labelKey: "options.graphics.high" }),
    medium: Object.freeze({ pixelRatioCap: 1.25, shadowMapSize: 1024, impostorNear: 70, groundDetailScale: 0.85, labelKey: "options.graphics.medium" }),
    low: Object.freeze({ pixelRatioCap: 1.0, shadowMapSize: 0, impostorNear: 45, groundDetailScale: 0.6, labelKey: "options.graphics.low" }),
  }),
  order: Object.freeze(["high", "medium", "low"]),
});

/**
 * Touch controls (ROADMAP M2b): a basic virtual-stick + drag-look + three-button overlay on
 * pointer-coarse devices (or `?touch=1`), feeding the same `Input` action model every keyboard/gamepad
 * binding already drives (js/core/input.js#setVirtualState). Logic/UI: js/ui/touch-controls.js.
 */
export const TOUCH = Object.freeze({
  stickRadius: 46,           // px, base radius of the left move stick
  stickMaxDrag: 46,          // px before the stick clamps to full deflection
  lookSensitivity: 0.012,    // px of drag → radians, right-side look area
  buttonSize: 58,            // px, F/E/Space buttons
});
