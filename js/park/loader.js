// Turns a generated park definition (js/park/layout.js#generateParkLayout) into a playable scene:
// per route an entry deck, a block ladder, platforms, catalogue elements and a Flying Fox, plus one
// merged anchor list / graph / update / dispose surface across all six routes. Route "blue-1" (the
// first entry in parkDef.routes) is also spread onto the top level of the returned course, so the
// M0 consumers that only know one route – js/player/interaction.js, js/game/autoplay.js – keep
// reading `course.tree`, `course.platforms`, `course.ladder`, … unmodified.
//
// Supersedes js/park/first-course.js (deleted): that module picked a hero-tree chain heuristically
// and hand-built one blue route; the M1.1 generator now decides every tree, deck height, element kind
// and zip line for all six routes, so this module only builds what layout.js already worked out.
//
// Anchor id scheme (route-scoped so six routes never collide):
//   entry cable            `${routeId}-deck`
//   platform ring           `${platform.id}-ring`          (platform.id = `${routeId}-p<n>`, from the generator)
//   exercise lifeline       `elem-${edge.id}`               (edge.id = `${routeId}-e<n>`, or the legacy
//                                                             blue-1 ids burma-1/planks-1/net-1)
//   zip cable (departure)   `${routeId}-zip`                (== the zip element's own id – keep the two
//                                                             in sync by hand with js/game/route.js#routesFromPark)
//   zip landing clip-out    `${routeId}-zip-out`
import * as THREE from "three";
import { log } from "../core/errors.js";
import { t } from "../core/i18n.js";
import { getWoodTextures } from "../procgen/textures/wood.js";
import { createTimberBuilder, mergeParts } from "./timber.js";
import { createPlatform } from "./platform.js";
import { createEntryDeck } from "./entry-deck.js";
import { createZipLanding, ZIP_LANDING } from "./zip-landing.js";
import { EDGE_OFFSET } from "./layout-route.js";
import { createBlockLadder } from "../elements/ladder.js";
import { createElement, catalogueEntry } from "../elements/catalogue.js";
import { ZIPLINE, createZipPictogram } from "../elements/zipline.js";

export const LOADER = Object.freeze({
  interactRange: 1.6,     // how close you must be to an anchor to clip in
  ladderRange: 1.5,
  stepRange: 2.05,         // reachable from anywhere on a platform
  ringRange: 2.1,          // the platform ring circles the trunk, so anywhere on the deck counts
  elementRange: 1.9,       // reach of an exercise lifeline, measured from its two cable ends
  deckStubRange: 2.3,
  // M2a (ROADMAP "≤ 640 draw calls at spawn", 16 routes across four hubs): a route whose entry deck is
  // further than this from the player never needs its static mesh drawn – physics colliders are
  // untouched, `mesh.visible` is a render-only flag, so this cannot affect standing on a far platform.
  staticCullDistance: 140,
});

/**
 * @param {{ id, seed, heroTrees: Array<{x,z,species,height}>, routes: Array<object> }} parkDef
 *   see js/park/layout.js#generateParkLayout
 * @param {{ scene: THREE.Scene, physics, terrain, forest, rng, textures?, wind? }} options
 * @returns {{ routes: Array<object>, anchors: Array<object>, graph: {nodes,edges},
 *   anchorById(id), nearestAnchor(pos,range?,excludeId?), nearestEntry(pos,range?),
 *   entryFor(anchorId,pos,range?), elementFor(anchorId), ladderFor(anchorId), routeFor(id),
 *   update(dt, elapsed), dispose(),
 *   tree, trees, facing, platform, platforms, ladder, entryDeck, elements, zipline, zipLanding,
 *   ladderAnchorId, topAnchorId }}  the last block is route "blue-1" (parkDef.routes[0]) spread onto
 *   the top level – see the module header.
 */
export function loadPark(parkDef, { scene, physics, terrain, forest, rng, textures = null, wind = null }) {
  if (!parkDef.routes || !parkDef.routes.length) throw new Error("park loader: parkDef has no routes");
  const wood = textures || getWoodTextures(parkDef.seed);
  const signMap = createZipPictogram();
  const timber = createTimberBuilder({ textures: wood, signMap });

  // Junction platforms (M2a, GDD §3.9) are listed by two routes but must be built exactly once –
  // shared across every buildRoute() call by id, so the second route to reach it reuses the object
  // instead of laying a duplicate platform (and colliders) on the same tree.
  const sharedPlatforms = new Map();   // platform id -> built platform
  const routes = parkDef.routes.map((routeDef) => buildRoute(routeDef, { scene, physics, terrain, forest, wind, timber, wood, sharedPlatforms, rng: rng.fork(`route-${routeDef.id}`) }));

  // A junction's platform ring anchor is listed by both routes (same id) – keep one entry (the host's,
  // seen first) so nearestAnchor()'s linear scan never checks the same physical ring position twice.
  const anchorsSeen = new Map();
  for (const r of routes) for (const a of r.anchors) if (!anchorsSeen.has(a.id)) anchorsSeen.set(a.id, a);
  const anchors = Array.from(anchorsSeen.values());
  const anchorById = anchorsSeen;
  const elementByAnchor = new Map(routes.flatMap((r) => r.elements).map((e) => [e.lifeline.anchorId, e]));
  const ladderByAnchor = new Map(routes.map((r) => [r.ladderAnchorId, r.ladder]));
  const routeById = new Map(routes.map((r) => [r.id, r]));
  const primary = routes[0];   // blue-1: the legacy single-route surface every M0 consumer reads

  const course = {
    routes,
    anchors,
    graph: buildGraph(routes),
    // --- legacy single-route surface (blue-1) -------------------------------------------------------
    tree: primary.tree, trees: primary.trees, facing: primary.facing,
    platform: primary.platform, platforms: primary.platforms, ladder: primary.ladder,
    entryDeck: primary.entryDeck, elements: primary.elements,
    zipline: primary.zipline, zipLanding: primary.zipLanding,
    ladderAnchorId: primary.ladderAnchorId, topAnchorId: primary.topAnchorId,

    anchorById(id) { return anchorById.get(id) || null; },
    /** The exercise that hangs on this lifeline anchor, or null. */
    elementFor(anchorId) { return elementByAnchor.get(anchorId) || null; },
    /** Which route's ladder a belay anchor id belongs to – interaction.js needs the *right* ladder,
     *  not always blue-1's, once six entry decks exist. */
    ladderFor(anchorId) { return ladderByAnchor.get(anchorId) || null; },
    routeFor(id) { return routeById.get(id) || null; },

    /** Closest anchor to a world position, respecting each anchor's own reach, across every route. */
    nearestAnchor(position, range = LOADER.interactRange, excludeId = null) {
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

    /** The end of the exercise (any route) the climber is standing in front of. */
    nearestEntry(position, range = LOADER.stepRange) {
      let best = null, bestScore = Infinity;
      for (const route of routes) {
        for (const element of route.elements) {
          for (const end of ["entry", "exit"]) {
            const anchor = end === "entry" ? element.getEntryAnchor() : element.getExitAnchor();
            const d = anchor.stand.distanceTo(position);
            if (d <= range && d < bestScore) { best = { element, end }; bestScore = d; }
          }
        }
      }
      return best;
    },

    /** Standing here, clipped to this lifeline: which end of which exercise could you step onto? */
    entryFor(anchorId, position, range = LOADER.elementRange) {
      const element = elementByAnchor.get(anchorId);
      if (!element) return null;
      for (const end of ["entry", "exit"]) {
        const anchor = end === "entry" ? element.getEntryAnchor() : element.getExitAnchor();
        if (anchor.stand.distanceTo(position) <= range) return { element, end };
      }
      return null;
    },

    /**
     * `focusPos` (M2a, optional – omit it and every route's static mesh just stays visible, the M1
     * behaviour): distance-culls each route's merged static mesh (platforms/ladder/entry-deck/zip
     * hardware) from `focusPos`, measured to the route's entry deck. Rendering only – Rapier colliders
     * are never touched, so a route far from the player is invisible but still fully solid underfoot
     * for anyone (a guest, a returning player) who *is* there.
     */
    update(dt, elapsed, focusPos = null) {
      for (const route of routes) {
        for (const element of route.elements) element.update(dt, elapsed);
        if (focusPos) route.staticGroup.visible = route.entryDeck.group.position.distanceTo(focusPos) < LOADER.staticCullDistance;
      }
    },

    dispose() {
      for (const route of routes) {
        for (const element of route.elements) element.dispose();
        // route.staticGroup's meshes share the park's one timber builder's materials (disposed once,
        // below) – only their geometry (this route's own merge) and the group itself are this route's.
        route.staticGroup.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
        route.staticGroup.removeFromParent();
        if (route.zipLanding) route.zipLanding.dispose();
        route.ladder.dispose();
        route.entryDeck.dispose();
        // Only this route's *own* platforms (never a junction's shared, reused one – js/park/layout.js
        // §"Kreuzungspodeste" – which belongs to whichever route built it first and is disposed there).
        for (const platform of route.ownPlatforms) platform.dispose();
      }
      timber.dispose();
      signMap.dispose();
    },
  };
  return course;
}

/**
 * Build one route's geometry: platforms on its hero trees, entry deck + ladder, elements, Flying Fox.
 * `sharedPlatforms` (M2a junctions, GDD §3.9) is one Map for the whole park – a platform id already
 * built by an earlier route (the junction's host) is reused verbatim instead of built a second time;
 * `ownPlatforms` (only this route's newly built ones) is what the static merge and course-level
 * dispose() below actually own, so a shared platform's mesh/collider is only ever merged/disposed once.
 */
function buildRoute(routeDef, { scene, physics, terrain, forest, wind, timber, wood, sharedPlatforms, rng }) {
  const routeId = routeDef.id;
  const trees = routeDef.platforms.map((p) => {
    const tree = forest.trees[p.treeIndex];
    if (!tree) throw new Error(`park loader: route "${routeId}" platform ${p.id} references missing hero tree #${p.treeIndex}`);
    return tree;
  });

  const platforms = [];
  const ownPlatforms = [];
  routeDef.platforms.forEach((p, i) => {
    const existing = sharedPlatforms.get(p.id);
    if (existing) { platforms.push(existing); return; }
    const built = createPlatform({
      scene, physics, tree: trees[i], height: p.deckHeight, radius: p.radius, kind: p.kind,
      facing: platformFacing(trees, i, routeDef.entry.facing), rng: rng.fork(`platform-${i}`), textures: wood,
    });
    built.id = p.id;
    sharedPlatforms.set(p.id, built);
    platforms.push(built);
    ownPlatforms.push(built);
  });

  const entryPos = { x: routeDef.entry.x, y: terrain.heightAt(routeDef.entry.x, routeDef.entry.z), z: routeDef.entry.z };
  const entryDeck = createEntryDeck({
    scene, physics, position: entryPos, facing: routeDef.entry.facing + Math.PI,
    rng: rng.fork("entry-deck"), textures: wood,
  });
  const ladder = createBlockLadder({
    scene, physics, tree: trees[0], fromY: entryDeck.top, toY: platforms[0].top, side: routeDef.entry.facing,
    rng: rng.fork("ladder"), textures: wood,
  });

  const elementCtx = { scene, physics, rng: rng.fork("elements"), timber, wind };
  const elements = routeDef.edges.map((edge) => buildRouteElement(edge, routeDef.id, platforms, trees, terrain, elementCtx));

  const zip = buildRouteZip({ routeId, zipDef: routeDef.zip, terrain, platforms, trees, elementCtx, textures: wood, rng: rng.fork("zipline") });
  if (zip) elements.push(zip.element);

  // Platforms, the entry deck, the ladder, the zip landing and the zip's own fixed hardware (gate,
  // terminations, marker sleeve – js/elements/zipline.js's header comment: "the fixed hardware …
  // does not move", unlike its cable/net/trolley siblings) never move again once built – fold their
  // already-positioned meshes into one mesh per material for the whole route (SCALE CHECK).
  const staticGroups = [entryDeck.group, ladder.group, ...ownPlatforms.map((p) => p.group)];
  if (zip) {
    staticGroups.push(zip.landing.group);
    const fixed = zip.element.group.children.find((g) => g.name === `${zip.element.id}-fixed`);
    if (fixed) staticGroups.push(fixed);
  }
  const staticGroup = mergeRouteStatics(routeId, staticGroups, timber.materials);
  scene.add(staticGroup);

  const ladderAnchorId = `${routeId}-deck`;
  const anchors = buildRouteAnchors(routeId, ladderAnchorId, entryDeck, platforms, elements, zip);

  return {
    id: routeId, category: routeDef.category, numeral: routeDef.numeral, nameKey: routeDef.nameKey,
    tree: trees[0], trees, facing: routeDef.entry.facing,
    platform: platforms[0], platforms, ownPlatforms, ladder, entryDeck, elements,
    zipline: zip ? zip.element : null, zipLanding: zip ? zip.landing : null,
    ladderAnchorId, topAnchorId: `${platforms[0].id}-ring`,
    anchors, staticGroup,
  };
}

/** One exercise between two of this route's platforms, entering and leaving at deck height. */
function buildRouteElement(edge, routeId, platforms, trees, terrain, ctx) {
  const indexOf = (id) => platforms.findIndex((p) => p.id === id);
  const iA = indexOf(edge.from), iB = indexOf(edge.to);
  const platformA = platforms[iA], platformB = platforms[iB], treeA = trees[iA], treeB = trees[iB];
  const dir = new THREE.Vector3(treeB.x - treeA.x, 0, treeB.z - treeA.z).normalize();
  const entry = new THREE.Vector3(treeA.x + dir.x * EDGE_OFFSET, platformA.top, treeA.z + dir.z * EDGE_OFFSET);
  const exit = new THREE.Vector3(treeB.x - dir.x * EDGE_OFFSET, platformB.top, treeB.z - dir.z * EDGE_OFFSET);
  const midX = (entry.x + exit.x) / 2, midZ = (entry.z + exit.z) / 2;
  const entryInCatalogue = catalogueEntry(edge.kind);
  const element = createElement({
    id: edge.id, kind: edge.kind, label: entryInCatalogue ? t(entryInCatalogue.labelKey) : edge.kind,
    lifelineAnchorId: `elem-${edge.id}`, groundY: terrain.heightAt(midX, midZ),
    entry: { platformId: platformA.id, position: entry }, exit: { platformId: platformB.id, position: exit },
  }, ctx);
  element.build();
  element.createPhysics();
  return element;
}

/**
 * The Flying Fox off the last platform: the generator already searched and validated the line
 * (parkDef.routes[i].zip), so this only builds the arrival deck and hangs the cable – no search here.
 * `zipDef` is null when the seed left this route with no valid line (js/park/layout.js never emits
 * that today – every route either gets a full chain or the seed throws – but the loader stays honest
 * about it exactly like first-course.js did, in case a future generator relaxes that guarantee).
 */
function buildRouteZip({ routeId, zipDef, terrain, platforms, trees, elementCtx, textures, rng }) {
  if (!zipDef) { log.warn(`park loader: route "${routeId}" has no Flying Fox – it ends at the last platform`); return null; }
  const lastTree = trees[trees.length - 1];
  const lastPlatform = platforms[platforms.length - 1];
  const start = { x: lastTree.x + zipDef.dir.x * EDGE_OFFSET, z: lastTree.z + zipDef.dir.z * EDGE_OFFSET };

  const inset = ZIP_LANDING.depth / 2 - 0.20;         // the end anchor stands on the back edge
  const centre = { x: zipDef.landing.x + zipDef.dir.x * inset, z: zipDef.landing.z + zipDef.dir.z * inset };
  centre.y = terrain.heightAt(centre.x, centre.z);
  const landing = createZipLanding({
    scene: elementCtx.scene, physics: elementCtx.physics, position: centre,
    facing: Math.atan2(-zipDef.dir.x, -zipDef.dir.z), deckHeight: zipDef.deckTop - centre.y,
    cableHeight: ZIPLINE.cableHeight, groundAt: (x, z) => terrain.heightAt(x, z), rng, textures,
  });

  const zipId = `${routeId}-zip`;               // js/game/route.js#routesFromPark builds the same id
  const landingPlatformId = `${routeId}-zip-landing`;
  const element = createElement({
    id: zipId, kind: "zipline", label: t("element.zipline"), lifelineAnchorId: zipId,
    groundY: terrain.heightAt((start.x + zipDef.landing.x) / 2, (start.z + zipDef.landing.z) / 2),
    entry: { platformId: lastPlatform.id, position: new THREE.Vector3(start.x, lastPlatform.top, start.z) },
    exit: { platformId: landingPlatformId, position: new THREE.Vector3(zipDef.landing.x, landing.top, zipDef.landing.z) },
    landing: { stand: landing.stand, anchorId: `${routeId}-zip-out` },
  }, elementCtx);
  element.build();
  element.createPhysics();
  log.info(`${routeId}: flying fox ${zipDef.length.toFixed(1)} m · ${(zipDef.gradient * 100).toFixed(1)} % · drop ${zipDef.drop.toFixed(2)} m`);
  return { element, landing };
}

/** Anchor list for the belay: entry cable, platform rings, exercise lifelines, zip clip-out. */
function buildRouteAnchors(routeId, ladderAnchorId, entryDeck, platforms, elements, zip) {
  const anchors = [
    { id: ladderAnchorId, position: entryDeck.clipAnchor, points: [entryDeck.clipAnchor], kind: "cable-stub", label: "entry cable", range: LOADER.deckStubRange },
  ];
  if (zip) {
    anchors.push({
      id: `${routeId}-zip-out`, position: zip.landing.clipAnchor, points: [zip.landing.clipAnchor],
      kind: "cable-stub", label: "landing cable", range: LOADER.interactRange,
    });
  }
  platforms.forEach((platform, i) => {
    anchors.push({
      id: `${platform.id}-ring`, position: platform.anchorPoints.ring, points: [platform.anchorPoints.ringCentre],
      kind: "ring", label: `platform ${i + 1} ring`, range: LOADER.ringRange,
    });
  });
  for (const element of elements) {
    const entry = element.getEntryAnchor(), exit = element.getExitAnchor();
    anchors.push({
      id: element.lifeline.anchorId, position: entry.position, points: [entry.position, exit.position],
      kind: "lifeline", label: element.label, elementId: element.id,
      range: element.anchorRange || LOADER.elementRange,
    });
  }
  return anchors;
}

/**
 * The park as nodes and edges, across every route – js/ui's future map overlay (M1.4) reads this.
 * A junction platform (M2a) is listed by two routes; it becomes one node with a two-entry `routes`
 * array (`route` still holds the first/host route id, for callers that only expect one).
 */
function buildGraph(routes) {
  const nodes = [], edges = [];
  const nodeById = new Map();
  for (const route of routes) {
    route.platforms.forEach((platform, i) => {
      const existing = nodeById.get(platform.id);
      if (existing) { existing.routes.push(route.id); return; }
      const node = { id: platform.id, route: route.id, routes: [route.id], kind: platform.kind, index: i, position: platform.anchorPoints.deck.clone(), capacity: platform.capacity };
      nodeById.set(platform.id, node);
      nodes.push(node);
    });
    if (route.zipLanding) {
      nodes.push({ id: `${route.id}-zip-landing`, route: route.id, kind: "zip-arrival", index: route.platforms.length, position: route.zipLanding.stand.clone(), capacity: 1 });
    }
    edges.push({ id: `${route.id}-ladder`, route: route.id, kind: "ladder", from: route.ladderAnchorId, to: route.platforms[0].id, anchorId: route.ladderAnchorId, length: route.ladder.rail.length });
    for (const element of route.elements) {
      edges.push({
        id: element.id, route: route.id, kind: element.kind, label: element.label,
        from: element.getEntryAnchor().platformId, to: element.getExitAnchor().platformId,
        anchorId: element.lifeline.anchorId, length: element.length, metrics: element.getDifficultyMetrics(),
      });
    }
  }
  return { nodes, edges };
}

/**
 * Platforms, the entry deck, the ladder and the zip landing are each built with their own
 * js/park/timber.js builder – createPlatform positions and colliders every one independently, so a
 * route with 4-5 platforms starts life as 30+ small per-structure meshes (SCALE CHECK in the M1.1
 * task: platforms are the expensive part). None of that geometry ever moves again once built, so this
 * bakes every structure's already world-positioned mesh back down to one mesh per material for the
 * whole route – the same "merge into one mesh per material" trick timber.js does per structure, run a
 * second time across structures, using the park's shared `timber.materials` so the merged meshes need
 * no lifetime of their own (js/park/loader.js#loadPark disposes that one builder for the whole park).
 * Sign meshes are skipped: each entry deck bakes its own pictogram texture and reusing one of the six
 * materials here would tie the merged mesh's lifetime to whichever structure happened to own it.
 */
function mergeRouteStatics(routeId, structureGroups, sharedMaterials) {
  const buckets = new Map();     // material key -> [{ geometry, matrix }]
  const spent = [];              // original per-structure meshes, folded into a bucket – remove + dispose after
  for (const group of structureGroups) {
    group.updateMatrixWorld(true);
    group.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const key = materialKeyOf(mesh.name);
      if (!key || key === "sign" || !sharedMaterials[key]) return;   // unknown/one-off material: leave it be
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ geometry: mesh.geometry, matrix: mesh.matrixWorld.clone() });
      spent.push(mesh);
    });
  }
  const merged = new THREE.Group();
  merged.name = `${routeId}-static`;
  for (const [key, list] of buckets) {
    const mesh = new THREE.Mesh(mergeParts(list), sharedMaterials[key]);
    mesh.name = `${routeId}-static-${key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;   // geometry is already baked in world space
    merged.add(mesh);
  }
  for (const mesh of spent) { mesh.geometry.dispose(); mesh.parent.remove(mesh); }
  return merged;
}

/** `${structureName}-${materialKey}` (see timber.js#build) – material keys never contain a hyphen. */
function materialKeyOf(name) {
  const i = name.lastIndexOf("-");
  return i === -1 ? null : name.slice(i + 1);
}

/** The deck of a middle platform faces between the exercise that arrives and the one that leaves. */
function platformFacing(trees, index, entryFacing) {
  if (index === 0) return entryFacing;                          // deck 1 looks at the ladder and the hub
  const here = trees[index];
  const before = trees[index - 1];
  const after = trees[index + 1] || null;
  const inbound = Math.atan2(before.x - here.x, before.z - here.z);
  if (!after) return inbound;
  const outbound = Math.atan2(after.x - here.x, after.z - here.z);
  return Math.atan2(Math.sin(inbound) + Math.sin(outbound), Math.cos(inbound) + Math.cos(outbound));
}
