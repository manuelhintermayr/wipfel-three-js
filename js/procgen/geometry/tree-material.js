// Materials for the procedural trees + the shared wind vertex-shader patch (onBeforeCompile).
// Sway grows with height (aWind.x), cards add high-frequency flutter (aWind.y = phase); shadows use
// custom depth materials with the same displacement. Materials are cached per species and wind.
import * as THREE from "three";
import { getBarkTextures } from "../textures/bark.js";
import { getFoliageAtlas } from "../textures/foliage.js";
import { TREE_SPECIES } from "./tree-species.js";

export const FOLIAGE_ALPHA_TEST = 0.42;
export const IMPOSTOR_ALPHA_TEST = 0.36;

const WIND_PARS = /* glsl */ `
uniform float uTime;
uniform float uWindStrength;
uniform vec2 uWindDir;
uniform float uSway;
uniform float uFlutter;
attribute vec2 aWind;
vec3 wipfelWindOffset(vec3 base) {
  float ph = dot(base.xz, vec2(0.37, 0.61));
  float t = uTime;
  float sway = uSway * uWindStrength * aWind.x;
  float s1 = sin(t * 0.9 + ph) * 0.55 + sin(t * 1.9 + ph * 1.7) * 0.25 + 0.45;
  vec2 perp = vec2(-uWindDir.y, uWindDir.x);
  vec3 off = vec3(uWindDir.x, 0.0, uWindDir.y) * (s1 * sway)
           + vec3(perp.x, 0.0, perp.y) * (sin(t * 1.3 + ph * 2.3) * 0.3 * sway);
  float fl = uFlutter * uWindStrength * (0.3 + aWind.x);
  off += vec3(sin(t * 5.1 + aWind.y), sin(t * 3.7 + aWind.y * 1.3) * 0.6, cos(t * 4.3 + aWind.y * 0.7)) * fl;
  off.y -= (s1 * sway) * (s1 * sway) * 0.15;
  return off;
}
`;

const PROJECT_VERTEX = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  vec3 wipfelBase = instanceMatrix[3].xyz;
#else
  vec3 wipfelBase = modelMatrix[3].xyz;
#endif
vec3 wipfelOff = wipfelWindOffset(wipfelBase);
mvPosition.xyz += wipfelOff;
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`;

const TRANSLUCENCY_FRAG = /* glsl */ `
#if NUM_DIR_LIGHTS > 0
{
  vec3 wipfelV = normalize(vViewPosition);
  vec3 wipfelL = directionalLights[0].direction;
  float wipfelBack = pow(clamp(dot(-wipfelV, wipfelL), 0.0, 1.0), 4.0);
  reflectedLight.directDiffuse += diffuseColor.rgb * directLight.color * (uTranslucency * RECIPROCAL_PI * wipfelBack);
}
#endif
`;

/** Uniforms used when no wind object is passed (still, but shader-compatible). */
export function createStaticWindUniforms() {
  return { uTime: { value: 0 }, uWindStrength: { value: 0 }, uWindDir: { value: new THREE.Vector2(1, 0) } };
}

/**
 * Patches `material` with the wind displacement (and optional foliage tweaks).
 * @param {THREE.Material} material
 * @param {{uTime, uWindStrength, uWindDir}} windUniforms shared uniform objects
 * @param {{ sway?:number, flutter?:number, translucency?:number, noNormalFlip?:boolean }} o
 */
export function applyWind(material, windUniforms, { sway = 0.4, flutter = 0, translucency = 0, noNormalFlip = false } = {}) {
  const own = { uSway: { value: sway }, uFlutter: { value: flutter }, uTranslucency: { value: translucency } };
  material.userData.wind = own;
  const isDepth = material.isMeshDepthMaterial === true;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uTime: windUniforms.uTime, uWindStrength: windUniforms.uWindStrength, uWindDir: windUniforms.uWindDir }, own);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\n" + WIND_PARS)
      .replace("#include <project_vertex>", PROJECT_VERTEX)
      .replace("#include <worldpos_vertex>", THREE.ShaderChunk.worldpos_vertex.replace(
        "worldPosition = modelMatrix * worldPosition;",
        "worldPosition.xyz += wipfelOff;\n\tworldPosition = modelMatrix * worldPosition;",
      ));
    if (isDepth) return;
    let frag = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uTranslucency;");
    if (noNormalFlip) {
      frag = frag.replace("#include <normal_fragment_begin>", THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", ""));
    }
    if (translucency > 0) {
      frag = frag.replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n" + TRANSLUCENCY_FRAG);
    }
    shader.fragmentShader = frag;
  };
  material.customProgramCacheKey = () => `wipfel-wind|${isDepth ? "depth" : "std"}|${noNormalFlip ? 1 : 0}|${translucency > 0 ? 1 : 0}`;
  return material;
}

/** Depth material for shadow casting that follows the wind displacement (and alpha test for cards). */
function makeDepthMaterial(windUniforms, { map = null, alphaTest = 0, side = THREE.FrontSide, sway, flutter }) {
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest, side });
  return applyWind(depth, windUniforms, { sway, flutter });
}

const windIds = new WeakMap();        // windUniforms object → small id for cache keys
let nextWindId = 1;
const materialCache = new Map();      // `${windId}:${species}:${seed}:${size}` → material set
function windIdOf(windUniforms) {
  if (!windUniforms) return 0;
  if (!windIds.has(windUniforms)) windIds.set(windUniforms, nextWindId++);
  return windIds.get(windUniforms);
}

/**
 * Shared trunk + foliage materials for a species (with matching depth materials for shadows).
 * @returns {{ trunk, trunkDepth, foliage, foliageDepth, bark, atlas }}
 */
export function getSpeciesMaterials(species, { windUniforms = null, seed = 1, textureSize = 512 } = {}) {
  const key = `${windIdOf(windUniforms)}:${species}:${seed}:${textureSize}`;
  if (materialCache.has(key)) return materialCache.get(key);

  const spec = TREE_SPECIES[species];
  const wind = windUniforms || createStaticWindUniforms();
  const bark = getBarkTextures(spec.bark, { seed, size: textureSize });
  const atlas = getFoliageAtlas(spec.foliage, { seed, size: textureSize * 2 });

  const trunk = new THREE.MeshStandardMaterial({
    map: bark.map, normalMap: bark.normalMap, normalScale: new THREE.Vector2(bark.normalScale, bark.normalScale),
    roughnessMap: bark.roughnessMap, roughness: 1, metalness: 0, vertexColors: true,
  });
  applyWind(trunk, wind, { sway: spec.sway, flutter: 0 });
  const trunkDepth = makeDepthMaterial(wind, { sway: spec.sway, flutter: 0 });

  const foliage = new THREE.MeshStandardMaterial({
    map: atlas.map, alphaTest: FOLIAGE_ALPHA_TEST, alphaToCoverage: true, side: THREE.DoubleSide,
    roughness: 0.88, metalness: 0, vertexColors: true, color: 0xffffff,
  });
  applyWind(foliage, wind, { sway: spec.sway, flutter: spec.flutter, translucency: spec.translucency, noNormalFlip: true });
  const foliageDepth = makeDepthMaterial(wind, { map: atlas.map, alphaTest: FOLIAGE_ALPHA_TEST, side: THREE.DoubleSide, sway: spec.sway, flutter: spec.flutter });

  const set = { trunk, trunkDepth, foliage, foliageDepth, bark, atlas, dispose() { trunk.dispose(); trunkDepth.dispose(); foliage.dispose(); foliageDepth.dispose(); } };
  materialCache.set(key, set);
  return set;
}

/** Material for the crossed-quad impostor of one archetype (its own baked texture). */
export function makeImpostorMaterial(texture, spec, windUniforms) {
  const wind = windUniforms || createStaticWindUniforms();
  const mat = new THREE.MeshStandardMaterial({
    map: texture, alphaTest: IMPOSTOR_ALPHA_TEST, side: THREE.DoubleSide, roughness: 0.95, metalness: 0, vertexColors: true,
  });
  applyWind(mat, wind, { sway: spec.sway * 0.8, flutter: 0, noNormalFlip: true });
  return mat;
}

/** Disposes and drops all cached species materials (textures are owned by the texture caches). */
export function disposeSpeciesMaterials() {
  for (const set of materialCache.values()) set.dispose();
  materialCache.clear();
}
