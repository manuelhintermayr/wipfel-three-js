// The first course: entry deck → block ladder → platform 1 → Burma bridge → platform 2 → hanging
// planks → platform 3 → cargo net → platform 4. Until the layout generator (M1.1) exists this
// module owns the whole arrangement so main.js stays a wiring file.
//
// Belay anchors, exactly as in the real park: the entry stub and the ladder cable are one system
// ("deck"); every platform has its cable ring ("platform-N-ring"); every exercise has its own
// lifeline ("elem-<id>") which you can clip into from either of its two platforms. The two-click
// ritual at each platform is therefore ring → next lifeline, ring → next lifeline.
import * as THREE from "three";
import { log } from "../core/errors.js";
import { getWoodTextures } from "../procgen/textures/wood.js";
import { trunkRadiusAt } from "../procgen/geometry/tree-species.js";
import { createTimberBuilder } from "./timber.js";
import { createPlatform } from "./platform.js";
import { createEntryDeck } from "./entry-deck.js";
import { createZipLanding, ZIP_LANDING } from "./zip-landing.js";
import { planZipline } from "./zip-plan.js";
import { createBlockLadder } from "../elements/ladder.js";
import { createElement } from "../elements/element.js";
import { ZIPLINE, createZipPictogram } from "../elements/zipline.js";
import "../elements/burma-bridge.js";        // side effect: registers the element kind
import "../elements/hanging-planks.js";
import "../elements/net-bridge.js";

export const FIRST_COURSE = Object.freeze({
  /**
   * The decks are levelled in *world* height, not measured off each trunk foot: on a hillside the
   * feet of four pines can be two metres apart, and a Burma bridge that runs steeply downhill is not
   * what a green course looks like. `deckRise` is the designed offset of each deck from the first.
   */
  firstDeckHeight: 4.5,      // metres above the first trunk foot
  deckRise: Object.freeze([0, 0.35, 0.70, 0.45]),
  minDeckHeight: 3.4,        // …but never so low that the deck sits in the undergrowth …
  maxDeckHeight: 8.0,        // … and never higher than a green course goes (GDD: < 20 m before M2)
  platformRadius: 1.25,
  transitionRadius: 1.10,    // the two decks in the middle are just somewhere to stand and re-clip
  deckGap: 0.55,             // clearance between trunk surface and the entry deck edge
  edgeOffset: 1.15,          // where an exercise leaves the deck, measured from the trunk axis
  interactRange: 1.6,        // how close you must be to an anchor to clip in
  ringRange: 2.1,            // …the platform ring circles the trunk, so anywhere on the deck counts
  elementRange: 1.9,         // reach of an exercise lifeline, measured from its two cable ends
  stepRange: 1.2,            // stand this close to the deck edge and you are "at" that exercise
  ladderRange: 1.5,
  minSpan: 6.0,              // trunk distance an exercise needs
  maxSpan: 13.5,
  /** Which exercise goes between which pair of platforms (GDD §3.4: rope, timber, net). */
  layout: Object.freeze([
    Object.freeze({ id: "burma-1", kind: "burma-bridge", label: "Burma bridge" }),
    Object.freeze({ id: "planks-1", kind: "hanging-planks", label: "Hanging planks" }),
    Object.freeze({ id: "net-1", kind: "net-bridge", label: "Cargo net" }),
  ]),
  /** The Flying Fox that ends the course (M0.6); the line itself is searched by zip-plan.js. */
  zip: Object.freeze({ id: "zip-1", label: "Flying Fox", landingId: "zip-landing", anchorId: "landing" }),
});

/**
 * @param {{ scene: THREE.Scene, physics, terrain, forest, rng, wind?, textures?, seed? }} options
 * @returns {{ tree, facing, platform, platforms, ladder, entryDeck, elements,
 *   anchors: Array<{id, position: THREE.Vector3, points: THREE.Vector3[], kind: string, range: number}>,
 *   graph: { nodes: Array<object>, edges: Array<object> },
 *   anchorById(id), nearestAnchor(position, range), elementFor(anchorId), entryFor(anchorId, position),
 *   nearestEntry(position, range), update(dt, elapsed), dispose(): void }}
 */
export function createFirstCourse({ scene, physics, terrain, forest, rng, wind = null, textures = null, seed = 1 }) {
  const wood = textures || getWoodTextures(seed);
  const trees = pickCourseTrees(forest, terrain, FIRST_COURSE.deckRise.length);
  if (!trees.length) throw new Error("first course: the forest has no hero tree to build on");

  const hub = terrain.spawn || { x: 0, z: 0 };
  const tree = trees[0];
  const facing = Math.atan2(hub.x - tree.x, hub.z - tree.z);   // yaw from the first trunk to the hub
  const outward = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));

  const baseTop = tree.y + FIRST_COURSE.firstDeckHeight;
  const platforms = trees.map((t, i) => createPlatform({
    scene, physics, tree: t, height: deckHeightOn(t, baseTop, i), radius: platformRadius(i, trees.length),
    kind: platformKind(i, trees.length), facing: platformFacing(trees, i, facing),
    rng: rng.fork(`platform-${i}`), textures: wood,
  }));
  platforms.forEach((p, i) => { p.id = `platform-${i + 1}`; });

  // --- M0.4: the way up ------------------------------------------------------------------------------
  const deckDistance = trunkRadiusAt(tree, 0.5) + FIRST_COURSE.deckGap + 0.80;
  const deckX = tree.x + outward.x * deckDistance;
  const deckZ = tree.z + outward.z * deckDistance;
  const entryDeck = createEntryDeck({
    scene, physics, position: { x: deckX, y: terrain.heightAt(deckX, deckZ), z: deckZ },
    facing: facing + Math.PI, rng: rng.fork("entry-deck"), textures: wood,
  });
  const ladder = createBlockLadder({
    scene, physics, tree, fromY: entryDeck.top, toY: platforms[0].top, side: facing,
    rng: rng.fork("ladder"), textures: wood,
  });

  // --- M0.5: the exercises ---------------------------------------------------------------------------
  const signMap = createZipPictogram();
  const timber = createTimberBuilder({ textures: wood, signMap });
  const ctx = { scene, physics, rng: rng.fork("elements"), timber, wind };
  const elements = [];
  for (let i = 0; i + 1 < trees.length && i < FIRST_COURSE.layout.length; i++) {
    elements.push(buildElement(FIRST_COURSE.layout[i], trees[i], trees[i + 1], platforms[i], platforms[i + 1], terrain, ctx));
  }

  // --- M0.6: the Flying Fox off the last platform ------------------------------------------------------
  const zip = buildZipline({
    scene, physics, terrain, forest, ctx, textures: wood,
    tree: trees[trees.length - 1], platform: platforms[platforms.length - 1],
    home: entryDeck.group.position, rng: rng.fork("zipline"),
  });
  if (zip) elements.push(zip.element);

  const anchors = buildAnchors(entryDeck, platforms, elements, zip);
  const byId = new Map(anchors.map((a) => [a.id, a]));
  const elementByAnchor = new Map(elements.map((e) => [e.lifeline.anchorId, e]));

  return {
    tree, facing, trees,
    /** M0.4 compatibility: the first platform, the one the ladder arrives at. */
    platform: platforms[0],
    platforms,
    ladder,
    entryDeck,
    elements,
    anchors,
    /** The Flying Fox and where it lands, or null when this seed left no room for one. */
    zipline: zip ? zip.element : null,
    zipLanding: zip ? zip.landing : null,
    zipPlan: zip ? zip.plan : null,
    ladderAnchorId: "deck",
    topAnchorId: "platform-1-ring",

    anchorById(id) { return byId.get(id) || null; },

    /**
     * Closest anchor to a world position, respecting each anchor's own reach. `excludeId` skips one
     * anchor – the belay uses it to ignore the cable it is already established on.
     */
    nearestAnchor(position, range = FIRST_COURSE.interactRange, excludeId = null) {
      let best = null, bestScore = Infinity;
      for (const anchor of anchors) {
        if (anchor.id === excludeId) continue;
        const reach = Math.max(range, anchor.range);
        for (const point of anchor.points) {
          const d = point.distanceTo(position);
          if (d <= reach && d < bestScore) { best = anchor; bestScore = d; }
        }
      }
      return best;
    },

    /** Nodes (platforms) and edges (ladder, exercises) – what the layout generator will emit in M1.1. */
    graph: buildGraph(platforms, elements, zip),

    /** The exercise that hangs on this lifeline anchor, or null. */
    elementFor(anchorId) { return elementByAnchor.get(anchorId) || null; },

    /**
     * The end of the exercise the climber is standing in front of, whatever they are clipped to –
     * the prompt has to be able to say "clip to the cable first".
     * @returns {{ element: object, end: "entry"|"exit" }|null}
     */
    nearestEntry(position, range = FIRST_COURSE.stepRange) {
      let best = null, bestScore = Infinity;
      for (const element of elements) {
        for (const end of ["entry", "exit"]) {
          const anchor = end === "entry" ? element.getEntryAnchor() : element.getExitAnchor();
          const d = anchor.stand.distanceTo(position);
          if (d <= range && d < bestScore) { best = { element, end }; bestScore = d; }
        }
      }
      return best;
    },

    /**
     * Standing here, clipped to this lifeline: which end of which exercise could you step onto?
     * @returns {{ element: object, end: "entry"|"exit" }|null}
     */
    entryFor(anchorId, position, range = FIRST_COURSE.elementRange) {
      const element = elementByAnchor.get(anchorId);
      if (!element) return null;
      for (const end of ["entry", "exit"]) {
        const anchor = end === "entry" ? element.getEntryAnchor() : element.getExitAnchor();
        if (anchor.stand.distanceTo(position) <= range) return { element, end };
      }
      return null;
    },

    update(dt, elapsed) { for (const element of elements) element.update(dt, elapsed); },

    dispose() {
      for (const element of elements) element.dispose();
      if (zip) zip.landing.dispose();
      timber.dispose();
      signMap.dispose();
      ladder.dispose();
      entryDeck.dispose();
      for (const platform of platforms) platform.dispose();
    },
  };
}

/**
 * The Flying Fox: search for a line that a park would actually sign off (js/park/zip-plan.js), build
 * the arrival deck where it comes down, then hang the cable between the two. A seed that leaves no
 * valid line simply ends the course at the last platform – with a diagnosis, never silently.
 */
function buildZipline({ scene, physics, terrain, forest, ctx, textures, tree, platform, home, rng }) {
  const plan = planZipline({
    tree, platformTop: platform.top, cableHeight: ZIPLINE.cableHeight, seatDrop: ZIPLINE.seatDrop,
    startOffset: FIRST_COURSE.edgeOffset, home, terrain, forest,
  });
  if (!plan) {
    log.warn("first course: no Flying Fox line clears the trees on this seed – the course ends at the last platform");
    return null;
  }
  if (plan.relaxed) log.warn(`first course: Flying Fox uses relaxed clearances (${(plan.gradient * 100).toFixed(1)} %)`);

  const inset = ZIP_LANDING.depth / 2 - 0.20;                  // the end anchor stands on the back edge
  const centre = { x: plan.landing.x + plan.dir.x * inset, z: plan.landing.z + plan.dir.z * inset };
  centre.y = terrain.heightAt(centre.x, centre.z);
  const landing = createZipLanding({
    scene, physics, position: centre, facing: Math.atan2(-plan.dir.x, -plan.dir.z),
    deckHeight: plan.deckTop - centre.y, cableHeight: ZIPLINE.cableHeight,
    groundAt: (x, z) => terrain.heightAt(x, z), rng, textures,
  });

  const element = createElement({
    id: FIRST_COURSE.zip.id,
    kind: "zipline",
    label: FIRST_COURSE.zip.label,
    lifelineAnchorId: FIRST_COURSE.zip.id,
    groundY: terrain.heightAt((plan.start.x + plan.landing.x) / 2, (plan.start.z + plan.landing.z) / 2),
    entry: { platformId: platform.id, position: new THREE.Vector3(plan.start.x, platform.top, plan.start.z) },
    exit: { platformId: FIRST_COURSE.zip.landingId, position: new THREE.Vector3(plan.landing.x, landing.top, plan.landing.z) },
    landing: { stand: landing.stand, anchorId: FIRST_COURSE.zip.anchorId },
  }, ctx);
  element.build();
  element.createPhysics();
  log.info(`flying fox: ${plan.length.toFixed(1)} m · ${(plan.gradient * 100).toFixed(1)} % · drop ${plan.drop.toFixed(2)} m`
    + ` · deck ${plan.deckHeight.toFixed(2)} m · clearance ${plan.clearance.toFixed(2)} m`);
  return { element, landing, plan };
}

/** Deck height above *this* trunk foot so that every deck ends up at the designed world height. */
function deckHeightOn(tree, baseTop, index) {
  const wanted = baseTop + (FIRST_COURSE.deckRise[index] || 0) - tree.y;
  return Math.max(FIRST_COURSE.minDeckHeight, Math.min(FIRST_COURSE.maxDeckHeight, wanted));
}

/** First deck carries the ladder, the last one ends the course, the ones between are re-clip stops. */
function platformKind(index, count) {
  if (index === 0) return "entry";
  return index === count - 1 ? "standard" : "transition";
}

function platformRadius(index, count) {
  return platformKind(index, count) === "transition" ? FIRST_COURSE.transitionRadius : FIRST_COURSE.platformRadius;
}

/**
 * The course as nodes and edges. M1.1 generates this from the park definition; until then it is
 * derived from what was just built, so the map overlay and the NPC agents have one shape to read.
 */
function buildGraph(platforms, elements, zip = null) {
  const nodes = platforms.map((platform, i) => ({
    id: platform.id, kind: platform.kind, index: i,
    position: platform.anchorPoints.deck.clone(), capacity: platform.capacity,
  }));
  if (zip) {
    nodes.push({ id: FIRST_COURSE.zip.landingId, kind: "zip-arrival", index: nodes.length,
      position: zip.landing.stand.clone(), capacity: 1 });
  }
  const edges = [{ id: "ladder", kind: "ladder", from: "deck", to: platforms[0].id, anchorId: "deck", length: 0 }];
  for (const element of elements) {
    edges.push({
      id: element.id, kind: element.kind, label: element.label,
      from: element.getEntryAnchor().platformId, to: element.getExitAnchor().platformId,
      anchorId: element.lifeline.anchorId, length: element.length,
      metrics: element.getDifficultyMetrics(),
    });
  }
  return { nodes, edges };
}

/** One exercise between two platforms, entering and leaving at deck height on the deck edge. */
function buildElement(layout, treeA, treeB, platformA, platformB, terrain, ctx) {
  const dir = new THREE.Vector3(treeB.x - treeA.x, 0, treeB.z - treeA.z).normalize();
  const edge = FIRST_COURSE.edgeOffset;
  const entry = new THREE.Vector3(treeA.x + dir.x * edge, platformA.top, treeA.z + dir.z * edge);
  const exit = new THREE.Vector3(treeB.x - dir.x * edge, platformB.top, treeB.z - dir.z * edge);
  const midX = (entry.x + exit.x) / 2, midZ = (entry.z + exit.z) / 2;
  const element = createElement({
    id: layout.id,
    kind: layout.kind,
    label: layout.label,
    lifelineAnchorId: `elem-${layout.id}`,
    groundY: terrain.heightAt(midX, midZ),
    entry: { platformId: platformA.id, position: entry },
    exit: { platformId: platformB.id, position: exit },
  }, ctx);
  element.build();
  element.createPhysics();
  return element;
}

/**
 * Anchor list for the belay. A platform ring is judged from the trunk axis (it circles the trunk,
 * so you can clip in from anywhere on the deck); an exercise lifeline can be reached from both of
 * its platforms, so it carries two points.
 */
function buildAnchors(entryDeck, platforms, elements, zip = null) {
  const anchors = [
    { id: "deck", position: entryDeck.clipAnchor, points: [entryDeck.clipAnchor], kind: "cable-stub", label: "entry cable", range: FIRST_COURSE.interactRange },
  ];
  if (zip) {
    anchors.push({
      id: FIRST_COURSE.zip.anchorId, position: zip.landing.clipAnchor, points: [zip.landing.clipAnchor],
      kind: "cable-stub", label: "landing cable", range: FIRST_COURSE.interactRange,
    });
  }
  platforms.forEach((platform, i) => {
    anchors.push({
      id: `${platform.id}-ring`,
      position: platform.anchorPoints.ring,
      points: [platform.anchorPoints.ringCentre],
      kind: "ring",
      label: `platform ${i + 1} ring`,
      range: FIRST_COURSE.ringRange,
    });
  });
  for (const element of elements) {
    const entry = element.getEntryAnchor(), exit = element.getExitAnchor();
    anchors.push({
      id: element.lifeline.anchorId,
      position: entry.position,
      points: [entry.position, exit.position],
      kind: "lifeline",
      label: element.label,
      elementId: element.id,
      // a zip cable dead-ends on a post you can reach from the whole arrival deck
      range: element.anchorRange || FIRST_COURSE.elementRange,
    });
  }
  return anchors;
}

/** The deck of a middle platform faces between the exercise that arrives and the one that leaves. */
function platformFacing(trees, index, entryFacing) {
  if (index === 0) return entryFacing;                         // deck 1 looks at the ladder and the hub
  const here = trees[index];
  const before = trees[index - 1];
  const after = trees[index + 1] || null;
  const inbound = Math.atan2(before.x - here.x, before.z - here.z);
  if (!after) return inbound;
  const outbound = Math.atan2(after.x - here.x, after.z - here.z);
  return Math.atan2(Math.sin(inbound) + Math.sin(outbound), Math.cos(inbound) + Math.cos(outbound));
}

/**
 * The chain of hero pines the course hangs on: start at the one nearest the spawn hub, then keep
 * taking the nearest unused hero that is a sensible span away and roughly continues the direction
 * travelled so far. Heroes that do not fit are skipped, which is why this survives a forest that
 * was seeded differently.
 */
function pickCourseTrees(forest, terrain, count) {
  const spawn = terrain.spawn || { x: 0, z: 0 };
  const heroes = forest.trees.filter((t) => t.isHero);
  if (!heroes.length) return [];
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  let start = heroes[0];
  for (const tree of heroes) if (distance(tree, spawn) < distance(start, spawn)) start = tree;
  const chain = [start];
  const used = new Set([start]);

  while (chain.length < count) {
    const last = chain[chain.length - 1];
    const heading = chain.length > 1
      ? { x: last.x - chain[chain.length - 2].x, z: last.z - chain[chain.length - 2].z }
      : null;
    let best = null, bestScore = Infinity;
    for (const tree of heroes) {
      if (used.has(tree)) continue;
      const d = distance(tree, last);
      if (d < FIRST_COURSE.minSpan || d > FIRST_COURSE.maxSpan) continue;
      if (heading && (tree.x - last.x) * heading.x + (tree.z - last.z) * heading.z <= 0) continue;
      if (d < bestScore) { best = tree; bestScore = d; }
    }
    if (!best) break;                                          // fewer trees than planned: shorter course
    chain.push(best);
    used.add(best);
  }
  return chain;
}
