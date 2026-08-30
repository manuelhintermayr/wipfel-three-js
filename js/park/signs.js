// Park signage (ROADMAP M1.2), built after docs/reference/photos/README.md's "Wegweiser": arrow-shaped
// white boards with a thick category-colour border, the category word in capitals, the category symbol
// (accessibility – colour is never the only cue) and the route numerals in white circles.
//
// Two kinds, both flat arrow-shaped plates on their own posts:
//   hub cluster   – one post + board per category present in the park, near the spawn hub's edge,
//                   each board yawed to point at the average bearing of that category's own routes
//                   (a real trailhead fingerpost: every blade turns to face its own trail).
//   entry sign    – one small board per route, beside its entry deck: numeral + localised name.
//
// Pure presentation: reads js/park/layout.js's generator output (parkDef) and the terrain sampler
// directly, exactly like js/park/loader.js does – this module never touches the built `course`, so it
// can run before or after loadPark without caring which, and does not grow loader.js's contract.
//
// Draw calls stay low the same way the rest of the park does (js/park/timber.js, js/park/loader.js
// §"Draw-call SCALE CHECK"): every post shares one merged "log" mesh, and every category-colour backer
// board is merged into one mesh per colour (js/park/timber.js#mergeParts) regardless of how many signs
// use it. Only the readable white face is unique per board (its canvas text differs), so that is the
// one part left unmerged – at most nine meshes (3 hub + 6 entry) for the whole park.
import * as THREE from "three";
import { CATEGORY_BY_ID } from "../config.js";
import { t } from "../core/i18n.js";
import { createTimberBuilder, disposeStructure, mergeParts } from "./timber.js";
import { createCanvas, toTexture } from "../procgen/textures/tree-texture-utils.js";

export const SIGNS = Object.freeze({
  board: Object.freeze({ headFlare: 1.7 }),          // head half-width = height/2 * headFlare
  border: 0.045,                                     // how far the colour backer peeks out around the white face
  backSet: 0.010,                                    // backer sits this far behind the face (local Z, no z-fighting)
  hub: Object.freeze({
    clearance: 2.6,          // outside the spawn hub's rim
    searchTries: 16,         // best-effort nudge onto a mapped path (falls back to the plain radial point)
    postSpacing: 1.35,       // metres between posts in the small row
    postRadius: 0.075,
    postHeight: 2.05,
    boardTop: 1.78,          // board centre height above the ground
    length: 0.95, height: 0.42, headLength: 0.28,
    texSize: 512,
  }),
  entry: Object.freeze({
    forward: 0.95,           // out from the deck, along the approach
    sideways: 0.95,          // clear of the approach lane
    postRadius: 0.05,
    postHeight: 1.62,
    boardTop: 1.38,
    length: 0.58, height: 0.26, headLength: 0.16,
    texSize: 512,
  }),
  // M2a (ROADMAP: "Kreuzungspodeste … mini fingerpost"): a small board standing directly on a junction
  // platform's deck (postHeight/boardTop are measured *from the deck*, not the ground) instead of the
  // hub/entry boards' own ground posts.
  junction: Object.freeze({
    offset: 0.55,            // out from the trunk centre, clear of the safety-cable standoffs
    postRadius: 0.035,
    postHeight: 0.85,
    boardTop: 0.72,
    length: 0.40, height: 0.18, headLength: 0.11,
    texSize: 384,
  }),
});

const FONT = '"Bahnschrift","Barlow Condensed","Roboto Condensed","Arial Narrow","Segoe UI",sans-serif';
const INK = "#15181a";
const BOARD_WHITE = "#f5f3ed";

/**
 * @param {{ parkDef, scene: THREE.Scene, terrain: { heightAt, isPath, hubs }, textures, rng }} options
 *   `parkDef` see js/park/layout.js#generateParkLayout; `textures` from procgen/textures/wood.js
 *   (posts reuse the park's own wood set, same as every other timber structure).
 * @returns {{ group: THREE.Group, dispose(): void }}
 */
export function createSigns({ parkDef, scene, terrain, textures, rng }) {
  const builder = createTimberBuilder({ textures });
  const group = new THREE.Group();
  group.name = "park-signs";
  const backer = { parts: new Map(), sources: [] };   // category id -> [{geometry, matrix}] + raw geometries to dispose

  // The legendary finale has no parkplan entry at all (GDD §3.12: "Legendäre Routen ohne Parkplan-
  // Eintrag") – it gets neither a hub-cluster fingerpost nor its own entry board; its ladder cable is
  // only ever found by whoever already knows to look behind the hut hub.
  const securedRoutes = parkDef.routes.filter((r) => r.category !== "legendary");
  buildHubCluster({ parkDef: { ...parkDef, routes: securedRoutes }, terrain, builder, group, backer, rng: rng.fork("hub-cluster") });
  for (const route of securedRoutes) {
    buildEntrySign({ route, terrain, builder, group, backer, rng: rng.fork(`entry-${route.id}`) });
  }
  buildJunctionSigns({ parkDef: { ...parkDef, routes: securedRoutes }, terrain, builder, group, backer, rng: rng.fork("junctions") });
  for (const [categoryId, parts] of backer.parts) group.add(buildBackerMesh(categoryId, parts));
  for (const geometry of backer.sources) geometry.dispose();

  const postGroup = builder.build("park-signs-posts");
  group.add(postGroup);
  // Thin boards and posts: a shadow-map pass costs as much as the visible one (js/park/timber.js#build
  // always casts) for a shadow that would be a barely-visible sliver – decluttered the same way
  // js/world/ground-detail.js already leaves pebbles/twigs out of the shadow pass.
  group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  scene.add(group);

  return {
    group,
    dispose() {
      group.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        if (o.userData.ownMaterial) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      });
      builder.dispose();
      group.removeFromParent();
    },
  };
}

/**
 * Fingerpost cluster at each used hub's edge (M2a: four hubs, not just spawn – js/park/layout.js's
 * `hub` index per route): one post + arrow board per category present *at that hub*, so the M1.1
 * single-cluster look repeats itself once per trailhead instead of trying to cram every category from
 * every hub onto the spawn hub's rim.
 */
function buildHubCluster({ parkDef, terrain, builder, group, backer, rng }) {
  const byHub = new Map();     // hubIndex -> routes[]
  for (const route of parkDef.routes) {
    const hubIndex = route.hub || 0;
    if (!byHub.has(hubIndex)) byHub.set(hubIndex, []);
    byHub.get(hubIndex).push(route);
  }
  for (const [hubIndex, hubRoutes] of byHub) {
    buildOneHubCluster({ hub: terrain.hubs[hubIndex] || terrain.hubs[0], routes: hubRoutes, terrain, builder, group, backer, rng: rng.fork(`hub-${hubIndex}`) });
  }
}

/** One hub's own fingerpost row: one post + arrow board per category present at *this* hub. */
function buildOneHubCluster({ hub, routes, terrain, builder, group, backer, rng }) {
  const S = SIGNS.hub;
  const byCategory = groupByCategory(routes);
  const categories = Object.keys(byCategory);
  if (!categories.length) return;

  const overall = averageBearing(routes.map((r) => r.entry), hub);
  const base = findNearPath(terrain, hub, hub.radius + S.clearance, overall, rng, S.searchTries);
  const rightAxis = overall + Math.PI / 2;             // lay the posts out sideways, across the approach

  categories.forEach((categoryId, i) => {
    const along = (i - (categories.length - 1) / 2) * S.postSpacing;
    const postX = base.x + Math.sin(rightAxis) * along;
    const postZ = base.z + Math.cos(rightAxis) * along;
    const postY = terrain.heightAt(postX, postZ);
    builder.cylinderBetween({
      from: { x: postX, y: postY - 0.30, z: postZ }, to: { x: postX, y: postY + S.postHeight, z: postZ },
      radius: S.postRadius, segments: 9,
    });

    const catRoutes = byCategory[categoryId];
    const bearing = averageBearing(catRoutes.map((r) => r.entry), { x: postX, z: postZ });
    const texture = paintCategoryBoard({ size: S.texSize, categoryId, numerals: catRoutes.map((r) => r.numeral) });
    mountBoard({
      group, backer, categoryId, texture,
      position: { x: postX, y: postY + S.boardTop, z: postZ }, yaw: bearing,
      length: S.length, height: S.height, headLength: S.headLength,
    });
  });
}

/**
 * A small board standing on each junction platform's own deck (M2a, GDD §3.9): reuses the hub
 * cluster's category-board painter, showing the symbol/word plus both routes' numerals that meet there.
 */
function buildJunctionSigns({ parkDef, terrain, builder, group, backer, rng }) {
  const S = SIGNS.junction;
  const refsByPlatform = new Map();   // platform id -> [{ route, platform }]
  for (const route of parkDef.routes) {
    for (const platform of route.platforms) {
      if (platform.kind !== "junction") continue;
      if (!refsByPlatform.has(platform.id)) refsByPlatform.set(platform.id, []);
      refsByPlatform.get(platform.id).push({ route, platform });
    }
  }
  const hub = terrain.hubs[0];
  for (const refs of refsByPlatform.values()) {
    if (refs.length < 2) continue;   // defensive: a "junction" kind with only one owner is not one
    const { route, platform } = refs[0];
    const tree = parkDef.heroTrees[platform.treeIndex];
    const deckY = tree ? terrain.heightAt(tree.x, tree.z) + platform.deckHeight : 0;
    if (!tree) continue;
    const yaw = Math.atan2(hub.x - tree.x, hub.z - tree.z);   // faces roughly back towards the hub
    const postX = tree.x + Math.sin(yaw) * S.offset, postZ = tree.z + Math.cos(yaw) * S.offset;
    builder.cylinderBetween({
      from: { x: postX, y: deckY, z: postZ }, to: { x: postX, y: deckY + S.postHeight, z: postZ },
      radius: S.postRadius, segments: 7,
    });
    const texture = paintCategoryBoard({ size: S.texSize, categoryId: route.category, numerals: refs.map((r) => r.route.numeral) });
    mountBoard({
      group, backer, categoryId: route.category, texture,
      position: { x: postX, y: deckY + S.boardTop, z: postZ }, yaw,
      length: S.length, height: S.height, headLength: S.headLength,
    });
  }
}

/** Route nameplate beside its entry deck: numeral + localised name, category colour + symbol. */
function buildEntrySign({ route, terrain, builder, group, backer, rng }) {
  const S = SIGNS.entry;
  const away = route.entry.facing + Math.PI;           // away from the tree, towards the approach
  const sideways = away + Math.PI / 2;
  const baseX = route.entry.x + Math.sin(away) * S.forward;
  const baseZ = route.entry.z + Math.cos(away) * S.forward;
  const side = rng.bool() ? 1 : -1;
  const postX = baseX + Math.sin(sideways) * S.sideways * side;
  const postZ = baseZ + Math.cos(sideways) * S.sideways * side;
  const postY = terrain.heightAt(postX, postZ);

  builder.cylinderBetween({
    from: { x: postX, y: postY - 0.26, z: postZ }, to: { x: postX, y: postY + S.postHeight, z: postZ },
    radius: S.postRadius, segments: 8,
  });

  const texture = paintEntryBoard({ size: S.texSize, categoryId: route.category, numeral: route.numeral, name: t(route.nameKey) });
  const facing = Math.atan2(route.entry.x - postX, route.entry.z - postZ);   // point back at the deck it belongs to
  mountBoard({
    group, backer, categoryId: route.category, texture,
    position: { x: postX, y: postY + S.boardTop, z: postZ }, yaw: facing,
    length: S.length, height: S.height, headLength: S.headLength,
  });
}

/**
 * One arrow-shaped white face (unique texture) plus a slightly larger category-colour backer, both
 * flat, mounted on the post at `position`. The board's own local origin is its geometric centre (so
 * `arrowGeometry` can stay a simple symmetric shape) – mounted there directly, the post would run
 * straight up through the middle of the printed face and blot out whatever sits at that point on every
 * board, regardless of its text. A real fingerpost's blade is fixed at its *tail*, not skewered through
 * its middle, so the board is shifted forward along its own pointing direction by half its length,
 * leaving the post at the tail end where there is nothing to occlude.
 */
function mountBoard({ group, backer, categoryId, texture, position, yaw, length, height, headLength }) {
  const flare = SIGNS.board.headFlare;
  const forward = length / 2;
  const boardX = position.x + Math.cos(yaw) * forward;
  const boardZ = position.z - Math.sin(yaw) * forward;
  const matrix = new THREE.Matrix4().makeRotationY(yaw).setPosition(boardX, position.y, boardZ);

  const outer = arrowGeometry(length + SIGNS.border * 2, height + SIGNS.border * 2, headLength + SIGNS.border, flare);
  const backMatrix = matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -SIGNS.backSet));
  addBacker(backer, categoryId, outer, backMatrix);

  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, map: texture, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
  material.name = `sign-face-${categoryId}`;
  const mesh = new THREE.Mesh(arrowGeometry(length, height, headLength, flare), material);
  mesh.name = "sign-face";
  mesh.userData.ownMaterial = true;
  mesh.applyMatrix4(matrix);
  group.add(mesh);
}

function addBacker(backer, categoryId, geometry, matrix) {
  if (!backer.parts.has(categoryId)) backer.parts.set(categoryId, []);
  backer.parts.get(categoryId).push({ geometry, matrix });
  backer.sources.push(geometry);
}

function buildBackerMesh(categoryId, parts) {
  const category = CATEGORY_BY_ID[categoryId];
  const material = new THREE.MeshStandardMaterial({ color: category ? category.colour : 0x808080, roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
  material.name = `sign-backer-${categoryId}`;
  const mesh = new THREE.Mesh(mergeParts(parts), material);
  mesh.name = `sign-backer-${categoryId}`;
  mesh.userData.ownMaterial = true;
  return mesh;
}

/**
 * Flat arrow silhouette in the local XY plane – local +X the pointing direction, +Z the face normal
 * (js/park/timber.js#plate's convention). UVs are normalised 0..1 over the shape's own bounding box so
 * a canvas texture maps onto the face without distortion at the tip.
 */
function arrowGeometry(length, height, headLength, headFlare) {
  const halfH = height / 2, halfL = length / 2;
  const bodyEnd = halfL - headLength;
  const headHalf = halfH * headFlare;
  const shape = new THREE.Shape();
  shape.moveTo(-halfL, -halfH);
  shape.lineTo(bodyEnd, -halfH);
  shape.lineTo(bodyEnd, -headHalf);
  shape.lineTo(halfL, 0);
  shape.lineTo(bodyEnd, headHalf);
  shape.lineTo(bodyEnd, halfH);
  shape.lineTo(-halfL, halfH);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 1);
  const spanY = Math.max(height, headHalf * 2);
  const pos = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + halfL) / length, (pos.getY(i) + spanY / 2) / spanY);
  uv.needsUpdate = true;
  return geometry;
}

/** Category board (hub cluster): symbol + word in caps, one numeral circle per route in this category. */
function paintCategoryBoard({ size, categoryId, numerals }) {
  const w = size, h = size / 2;
  const { canvas, ctx } = createCanvas(w, h);
  const category = CATEGORY_BY_ID[categoryId];
  const colour = category ? cssHex(category.colour) : "#666666";
  ctx.fillStyle = BOARD_WHITE;
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = "middle";

  ctx.fillStyle = colour;
  ctx.font = `700 ${h * 0.44}px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText(category ? category.symbol : "?", w * 0.05, h * 0.52);

  const wordX = w * 0.23;
  const startX = w * 0.70, gap = w * 0.145, r = h * 0.165;
  const circlesLeftEdge = startX - r;   // the word must clear the *edge* of the first circle, not its centre
  ctx.fillStyle = INK;
  fitText(ctx, t(`sign.${categoryId}`).toUpperCase(), wordX, h * 0.52, circlesLeftEdge - wordX - w * 0.02, h * 0.30);

  numerals.forEach((numeral, i) => paintNumeralCircle(ctx, startX + i * gap, h * 0.52, r, colour, numeral));
  return toTexture(canvas, { srgb: true, repeat: false });
}

/** Entry-deck nameplate: numeral circle, symbol and the localised route name underneath. */
function paintEntryBoard({ size, categoryId, numeral, name }) {
  const w = size, h = size / 2;
  const { canvas, ctx } = createCanvas(w, h);
  const category = CATEGORY_BY_ID[categoryId];
  const colour = category ? cssHex(category.colour) : "#666666";
  ctx.fillStyle = BOARD_WHITE;
  ctx.fillRect(0, 0, w, h);

  paintNumeralCircle(ctx, w * 0.17, h * 0.40, h * 0.235, colour, numeral);

  ctx.fillStyle = colour;
  ctx.font = `700 ${h * 0.24}px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(category ? category.symbol : "?", w * 0.38, h * 0.40);

  ctx.fillStyle = INK;
  ctx.font = `700 ${h * 0.155}px ${FONT}`;
  wrapText(ctx, name.toUpperCase(), w * 0.08, h * 0.78, w * 0.86, h * 0.19);
  return toTexture(canvas, { srgb: true, repeat: false });
}

/** Left-aligned single line, shrunk to fit `maxWidth` – DE category words ("SCHWARZ") run longer than EN. */
function fitText(ctx, text, x, y, maxWidth, size) {
  ctx.textAlign = "left";
  ctx.font = `700 ${size}px ${FONT}`;
  const width = ctx.measureText(text).width;
  if (width > maxWidth) ctx.font = `700 ${size * (maxWidth / width)}px ${FONT}`;
  ctx.fillText(text, x, y);
}

function paintNumeralCircle(ctx, cx, cy, r, colour, numeral) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = r * 0.18;
  ctx.strokeStyle = colour;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = `700 ${r * (numeral.length > 1 ? 0.82 : 1.05)}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(numeral, cx, cy + r * 0.05);
}

/** Wraps onto as many lines as `maxWidth` needs, centred – a long localised name must not run off the board. */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  ctx.textAlign = "center";
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, x + maxWidth / 2, startY + i * lineHeight));
}

const cssHex = (colour) => `#${colour.toString(16).padStart(6, "0")}`;

function groupByCategory(routes) {
  const map = {};
  for (const route of routes) (map[route.category] || (map[route.category] = [])).push(route);
  return map;
}

/** Circular mean bearing from `from` to every point in `points` (atan2(dx,dz) – this codebase's yaw
 *  convention). Exported for js/park/park-board.js, which places the physical park board next to this
 *  module's own hub cluster using the same trailhead-anchor math. */
export function averageBearing(points, from) {
  let sx = 0, sz = 0;
  for (const p of points) {
    const dx = p.x - from.x, dz = p.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    sx += dx / d; sz += dz / d;
  }
  return Math.atan2(sx, sz);
}

/** Best-effort: nudge the cluster's anchor point onto a mapped path within a small arc, else the
 *  plain radial point. Exported for js/park/park-board.js (same reuse as `averageBearing` above). */
export function findNearPath(terrain, hub, radius, bearing, rng, tries) {
  const plain = { x: hub.x + Math.sin(bearing) * radius, z: hub.z + Math.cos(bearing) * radius };
  for (let i = 0; i < tries; i++) {
    const a = bearing + rng.float(-0.9, 0.9);
    const r = radius + rng.float(-1.2, 1.6);
    const x = hub.x + Math.sin(a) * r, z = hub.z + Math.cos(a) * r;
    if (terrain.isPath(x, z)) return { x, z };
  }
  return plain;
}
