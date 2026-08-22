// Public tree archetype API: skeleton → LOD geometry/material sets.
//   buildTreeArchetype({ rng, species, height?, trunkRadius?, lod, wind? })  → one LOD
//   buildTreeArchetypeSet({ rng, species, height?, trunkRadius?, wind? })    → all three LODs, one skeleton
// LOD 0 = full trunk + branches (2 levels) + all cards, LOD 1 = fewer rings/branches, ~36 % of the
// cards scaled up, LOD 2 = three crossed quads with a baked silhouette texture. Calling
// buildTreeArchetype three times with identically seeded rngs yields identical skeletons.
import * as THREE from "three";
import { TREE_SPECIES, TREE_LOD, SPECIES_IDS } from "./tree-species.js";
import { buildTreeSkeleton } from "./tree-skeleton.js";
import { GeometryBuilder, appendTube, appendCard, appendCrossedQuads } from "./tree-mesh.js";
import { getSpeciesMaterials, makeImpostorMaterial, disposeSpeciesMaterials } from "./tree-material.js";
import { bakeImpostor } from "./tree-impostor.js";
import { disposeBarkTextures } from "../textures/bark.js";
import { disposeFoliageTextures } from "../textures/foliage.js";
import { createCanvas } from "../textures/tree-texture-utils.js";

export { TREE_SPECIES, SPECIES_IDS, TREE_LOD };

/** Samples height/trunk radius from the species range unless given, then builds the skeleton. */
function makeSkeleton({ rng, species, height, trunkRadius }) {
  const spec = TREE_SPECIES[species];
  if (!spec) throw new Error(`Unknown tree species "${species}"`);
  const rSize = rng.fork("size");
  const h = height ?? rSize.float(spec.height[0], spec.height[1]);
  const hf = THREE.MathUtils.clamp((h - spec.height[0]) / (spec.height[1] - spec.height[0]), 0, 1);
  const r = trunkRadius ?? THREE.MathUtils.lerp(spec.trunkRadius[0], spec.trunkRadius[1], hf) * rSize.float(0.9, 1.1);
  return buildTreeSkeleton({ rng: rng.fork("skeleton"), species, height: h, trunkRadius: r });
}

function windUniformsOf(wind) {
  if (!wind) return null;
  return wind.uniforms || wind;
}

/**
 * @param {{ rng, species:string, height?:number, trunkRadius?:number, lod?:0|1|2, wind?, seed?, textureSize?:number }} o
 * @returns {{ species, lod, height, trunkRadius, crownRadius, crownBaseY, parts, dispose() }}
 */
export function buildTreeArchetype({ rng, species, height, trunkRadius, lod = 0, wind = null, seed = 1, textureSize = 512 }) {
  const skeleton = makeSkeleton({ rng, species, height, trunkRadius });
  return buildLod(skeleton, lod, { windUniforms: windUniformsOf(wind), seed, textureSize });
}

/**
 * All three LODs from one skeleton.
 * @returns {{ species, height, trunkRadius, crownRadius, crownBaseY, skeleton, lods: object[], dispose() }}
 */
export function buildTreeArchetypeSet({ rng, species, height, trunkRadius, wind = null, seed = 1, textureSize = 512 }) {
  const skeleton = makeSkeleton({ rng, species, height, trunkRadius });
  const o = { windUniforms: windUniformsOf(wind), seed, textureSize };
  const lods = [buildLod(skeleton, 0, o), buildLod(skeleton, 1, o), buildLod(skeleton, 2, o)];
  return {
    species, height: skeleton.height, trunkRadius: skeleton.trunkRadius, crownRadius: skeleton.crownRadius,
    crownBaseY: skeleton.crownBaseY, skeleton, lods,
    dispose() { for (const l of lods) l.dispose(); },
  };
}

/** Disposes cached species materials + bark/foliage textures (call when tearing the world down). */
export function disposeTreeCaches() {
  disposeSpeciesMaterials();
  disposeBarkTextures();
  disposeFoliageTextures();
}

// ---------------------------------------------------------------------------------------------
function buildLod(skeleton, lod, { windUniforms, seed, textureSize }) {
  const spec = skeleton.spec;
  const base = { species: skeleton.species, lod, height: skeleton.height, trunkRadius: skeleton.trunkRadius, crownRadius: skeleton.crownRadius, crownBaseY: skeleton.crownBaseY };
  if (lod >= 2) return buildImpostorLod(skeleton, base, { windUniforms, seed, textureSize });
  const materials = getSpeciesMaterials(skeleton.species, { windUniforms, seed, textureSize });
  const trunkGeometry = buildTrunkGeometry(skeleton, spec, lod, materials.bark.tileMetres);
  const foliageGeometry = buildFoliageGeometry(skeleton, spec, lod, materials.atlas);
  const parts = {
    trunk: { geometry: trunkGeometry, material: materials.trunk, depthMaterial: materials.trunkDepth, castShadow: true, receiveShadow: true },
    foliage: { geometry: foliageGeometry, material: materials.foliage, depthMaterial: materials.foliageDepth, castShadow: true, receiveShadow: true },
  };
  return { ...base, parts, dispose() { trunkGeometry.dispose(); foliageGeometry.dispose(); } };
}

function buildTrunkGeometry(skeleton, spec, lod, tileMetres) {
  const gb = new GeometryBuilder();
  const H = skeleton.height;
  const tint = (y) => {
    const f = THREE.MathUtils.clamp(y / H, 0, 1);
    return [THREE.MathUtils.lerp(spec.trunkTintLow[0], spec.trunkTintHigh[0], f), THREE.MathUtils.lerp(spec.trunkTintLow[1], spec.trunkTintHigh[1], f), THREE.MathUtils.lerp(spec.trunkTintLow[2], spec.trunkTintHigh[2], f)];
  };
  const sway = (y, t, level) => {
    const hf = Math.pow(THREE.MathUtils.clamp(y / H, 0, 1), 2);
    if (level === 0) return 0.6 * hf;
    if (level === 1) return 0.6 * hf + 0.35 * Math.pow(t, 1.5);
    return 0.6 * hf + 0.5 * Math.pow(t, 1.2);
  };
  const maxLevel = TREE_LOD.branchDepth[lod];
  for (const tube of skeleton.tubes) {
    if (tube.level > maxLevel) continue;
    const radial = tube.level === 0 ? spec.ringSegments[lod] : Math.max(4, spec.branchSegments[lod] - (tube.level - 1));
    const rings = Math.max(2, Math.round(tube.length * TREE_LOD.ringsPerMetre[lod] * (tube.level === 0 ? 1 : 0.7)));
    appendTube(gb, tube, { rings, radial, tileMetres, height: H, tint, sway });
  }
  return gb.build();
}

function buildFoliageGeometry(skeleton, spec, lod, atlas) {
  const gb = new GeometryBuilder();
  const keep = TREE_LOD.cardKeep[lod], scale = TREE_LOD.cardScale[lod];
  const o = { crownCenter: skeleton.crownCenter, rx: skeleton.crownRadius, ry: skeleton.crownHalfHeight, scale };
  for (const card of skeleton.cards) {
    if (card.lodRank >= keep) continue;
    appendCard(gb, card, atlas.tileUv(card.tile), o);
  }
  return gb.build();
}

function averageCanvasColour(canvas) {
  const { ctx } = createCanvas(8, 8);
  ctx.drawImage(canvas, 0, 0, 8, 8);
  const d = ctx.getImageData(0, 0, 8, 8).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < 64; i++) { r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2]; }
  return [r / 64, g / 64, b / 64];
}

function buildImpostorLod(skeleton, base, { windUniforms, seed, textureSize }) {
  const spec = skeleton.spec;
  const materials = getSpeciesMaterials(skeleton.species, { windUniforms, seed, textureSize });
  const baked = bakeImpostor({ skeleton, atlas: materials.atlas, spec, barkRgb: averageCanvasColour(materials.bark.map.image), size: textureSize });
  const gb = new GeometryBuilder();
  appendCrossedQuads(gb, { width: baked.widthMetres, yMin: baked.yMin, yMax: baked.yMax, count: 3, height: skeleton.height });
  const geometry = gb.build();
  const material = makeImpostorMaterial(baked.texture, spec, windUniforms);
  const parts = { impostor: { geometry, material, depthMaterial: null, castShadow: false, receiveShadow: false } };
  return {
    ...base, parts, impostorCanvas: baked.canvas,
    dispose() { geometry.dispose(); material.dispose(); baked.texture.dispose(); },
  };
}
