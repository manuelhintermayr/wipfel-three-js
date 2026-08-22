// Instanced forest: archetypes per species/variant × 3 LODs, one InstancedMesh per
// (species, variant, LOD, part), distance-based LOD around a focus position, hero trees with
// Rapier trunk colliders, wind via shared uniforms. See docs/architecture.md → js/world/forest.js.
import * as THREE from "three";
import { GROUP, groups } from "../core/physics.js";
import { buildTreeArchetypeSet, disposeTreeCaches, TREE_SPECIES } from "../procgen/geometry/tree.js";
import { placeTrees } from "./forest-placement.js";

export const FOREST_LOD = Object.freeze({
  near: 48,                 // metres: LOD 0 (full) inside
  mid: 135,                 // metres: LOD 1 inside, impostors beyond
  hysteresis: 1.12,         // switch back only after leaving by this factor
  refreshMoveMetres: 3,     // rebuild instance buffers after the focus moved this far
  colliderRadius: 60,       // non-hero trees within this distance of the spawn get trunk colliders …
  colliderMinCount: 40,     // … and at least this many nearest ones
});

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * @param {{ rng, scene, physics, terrain, wind, heroTrees?: Array<{x,z,species?,height?}>, targetCount?:number, textureSize?:number }} o
 * @returns {{ trees, group, archetypes, stats, update(dt, elapsed, focusPos?), setFocus(pos), dispose() }}
 *   update(dt, elapsed, focusPos): focusPos (THREE.Vector3 | {x,y,z}) drives LOD selection; when omitted
 *   the LOD stays centred on terrain.spawn (static LOD – pass the camera/player position from main.js).
 */
export function createForest({ rng, scene, physics, terrain, wind, heroTrees = [], targetCount = 600, textureSize = 512 }) {
  const t0 = performance.now();
  const rTrees = rng.fork("trees");
  const seed = rng.seed;

  // 1. archetypes: species × variants, each with 3 LODs from one skeleton
  const archetypes = {};
  for (const species of Object.keys(TREE_SPECIES)) {
    archetypes[species] = [];
    for (let v = 0; v < TREE_SPECIES[species].variants; v++) {
      archetypes[species].push(buildTreeArchetypeSet({ rng: rTrees.fork(`arch:${species}:${v}`), species, wind, seed, textureSize }));
    }
  }

  // 2. placement
  const trees = placeTrees({ rng: rTrees.fork("placement"), terrain, heroTrees, targetCount, archetypes });
  for (const t of trees) {
    _q.setFromAxisAngle(Y_AXIS, t.yaw);
    _s.set(t.scale * t.widthScale, t.scale, t.scale * t.widthScale);
    t.matrix = new THREE.Matrix4().compose(_p.set(t.x, t.y, t.z), _q, _s);
    t.foliageColor = new THREE.Color(t.foliageTint[0], t.foliageTint[1], t.foliageTint[2]);
    t.trunkColor = new THREE.Color(t.trunkTint, t.trunkTint, t.trunkTint);
    t.lod = -1;
  }

  // 3. instanced meshes per (species, variant, lod, part)
  const group = new THREE.Group();
  group.name = "forest";
  scene.add(group);
  const buckets = new Map();   // `${species}:${variant}:${lod}` → { trees: [], meshes: [{ mesh, part }] }
  for (const species of Object.keys(archetypes)) {
    archetypes[species].forEach((arch, variant) => {
      const capacity = trees.filter((t) => t.species === species && t.variant === variant).length;
      if (!capacity) return;
      arch.lods.forEach((lodSet, lod) => {
        const meshes = [];
        for (const [partName, part] of Object.entries(lodSet.parts)) {
          const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
          mesh.count = 0;
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.setColorAt(0, _c.set(1, 1, 1));
          mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
          if (part.depthMaterial) mesh.customDepthMaterial = part.depthMaterial;
          mesh.castShadow = part.castShadow;
          mesh.receiveShadow = part.receiveShadow;
          mesh.frustumCulled = false;
          mesh.name = `tree-${species}-${variant}-lod${lod}-${partName}`;
          group.add(mesh);
          meshes.push({ mesh, part: partName });
        }
        buckets.set(`${species}:${variant}:${lod}`, { trees: [], meshes });
      });
    });
  }

  // 4. colliders: heroes + trees near the spawn
  const colliders = [];
  if (physics) {
    const spawn = terrain.spawn || { x: 0, z: 0 };
    const byDistance = trees.filter((t) => !t.isHero)
      .map((t) => ({ t, d: Math.hypot(t.x - spawn.x, t.z - spawn.z) }))
      .sort((a, b) => a.d - b.d);
    const withCollider = trees.filter((t) => t.isHero);
    byDistance.forEach(({ t, d }, i) => { if (d <= FOREST_LOD.colliderRadius || i < FOREST_LOD.colliderMinCount) withCollider.push(t); });
    const R = physics.RAPIER;
    for (const t of withCollider) {
      const halfHeight = t.height * 0.5;
      const desc = R.ColliderDesc.cylinder(halfHeight, t.trunkRadius)
        .setTranslation(t.x, t.y + halfHeight, t.z)
        .setCollisionGroups(groups(GROUP.STATIC))
        .setFriction(0.9);
      colliders.push(physics.world.createCollider(desc));
      t.hasCollider = true;
    }
  }

  // 5. LOD assignment
  const focus = new THREE.Vector3();
  const lastRefresh = new THREE.Vector3(Infinity, Infinity, Infinity);
  const stats = { trees: trees.length, heroes: trees.filter((t) => t.isHero).length, byLod: [0, 0, 0], instancedMeshes: group.children.length, colliders: colliders.length, buildMs: 0 };

  function lodFor(t, d) {
    if (t.isHero) return 0;
    const near = t.lod === 0 ? FOREST_LOD.near * FOREST_LOD.hysteresis : FOREST_LOD.near;
    const mid = t.lod === 1 ? FOREST_LOD.mid * FOREST_LOD.hysteresis : FOREST_LOD.mid;
    if (d < near) return 0;
    if (d < mid) return 1;
    return 2;
  }

  function refresh() {
    for (const b of buckets.values()) b.trees.length = 0;
    stats.byLod[0] = stats.byLod[1] = stats.byLod[2] = 0;
    for (const t of trees) {
      const d = Math.hypot(t.x - focus.x, t.z - focus.z);
      t.lod = lodFor(t, d);
      stats.byLod[t.lod]++;
      buckets.get(`${t.species}:${t.variant}:${t.lod}`).trees.push(t);
    }
    for (const b of buckets.values()) {
      for (const { mesh, part } of b.meshes) {
        b.trees.forEach((t, i) => {
          mesh.setMatrixAt(i, t.matrix);
          mesh.setColorAt(i, part === "trunk" ? t.trunkColor : t.foliageColor);
        });
        mesh.count = b.trees.length;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      }
    }
    lastRefresh.copy(focus);
  }

  const spawn = terrain.spawn || { x: 0, y: 0, z: 0 };
  focus.set(spawn.x, spawn.y, spawn.z);
  refresh();
  stats.buildMs = Math.round(performance.now() - t0);

  return {
    trees, group, archetypes, stats, lod: FOREST_LOD,
    setFocus(pos) { focus.set(pos.x, pos.y ?? focus.y, pos.z); },
    update(dt, elapsed, focusPos) {
      if (focusPos) focus.set(focusPos.x, focusPos.y ?? focus.y, focusPos.z);
      if (focus.distanceTo(lastRefresh) > FOREST_LOD.refreshMoveMetres) refresh();
    },
    refresh,
    dispose() {
      scene.remove(group);
      for (const child of group.children) child.dispose();
      for (const species of Object.keys(archetypes)) for (const arch of archetypes[species]) arch.dispose();
      if (physics) for (const c of colliders) physics.world.removeCollider(c, false);
      disposeTreeCaches();
    },
  };
}
