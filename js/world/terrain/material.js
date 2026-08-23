// Ground material: MeshStandardMaterial whose map/normal/roughness sampling is replaced (via
// onBeforeCompile) by a three-way blend of leaf litter / packed dirt / moss-needle duff, driven by the
// path mask texture, per-vertex duff weight (slope, moisture, patchiness) and height-based edge noise.
import * as THREE from "three";

// Tiles are set so the drawn features come out at their real size: the litter canvas holds leaves
// of 34–82 px on 1024 px, so 2.0 m per repeat reads as 7–16 cm leaves; the duff canvas holds pine
// needles of 28–72 px, so 2.4 m reads as 7–17 cm needles (Schwarzkiefer: 8–16 cm). The repeat is
// short enough to be noticed, so the litter is sampled a second time at `macroFactor` × the tile,
// rotated, and the two are cross-faded by the per-vertex macro-variation channel `aTerrain.w`.
export const TERRAIN_MATERIAL = Object.freeze({
  tile: { litter: 2.0, dirt: 4.2, duff: 2.4 },   // metres per texture repeat
  macroFactor: 4.7,                              // second litter sample: 9.4 m repeat, rotated
  roughness: 0.92,
  normalScale: 1.0,
});

const FRAG_PARS = /* glsl */ `
uniform float uTerrainSize;
uniform vec4 uTile;
uniform sampler2D uPathMask;
uniform sampler2D uDirtMap;
uniform sampler2D uDirtNormal;
uniform sampler2D uDirtRough;
uniform sampler2D uDuffMap;
uniform sampler2D uDuffNormal;
uniform sampler2D uDuffRough;
varying vec4 vTerrain;
vec2 rotateUv( vec2 uv, float a ) { float c = cos( a ), s = sin( a ); return mat2( c, -s, s, c ) * uv; }
`;

// replaces <map_fragment>: declares uvL/uvD/uvM, blend weights and packed height/roughness samples
// (hrX.r = height, hrX.g = roughness) that the roughness + normal chunks below reuse.
const FRAG_BLEND = /* glsl */ `
vec2 wxz = vUv * uTerrainSize;
vec2 uvL = wxz / uTile.x;
vec2 uvD = wxz / uTile.y;
vec2 uvM = wxz / uTile.z;
vec2 uvL2 = rotateUv( wxz / ( uTile.x * uTile.w ), 0.6 );
float pathMask = texture2D( uPathMask, vUv ).r;
vec3 litterA = texture2D( map, uvL ).rgb;
vec3 litterB = texture2D( map, uvL2 ).rgb;
vec3 dirtC = texture2D( uDirtMap, uvD ).rgb;
vec3 duffC = texture2D( uDuffMap, uvM ).rgb;
vec3 hrL = texture2D( roughnessMap, uvL ).rgb;
vec3 hrD = texture2D( uDirtRough, uvD ).rgb;
vec3 hrM = texture2D( uDuffRough, uvM ).rgb;
float wPath = smoothstep( 0.40, 0.62, pathMask + ( hrD.r - hrL.r ) * 0.35 );
float wDuff = smoothstep( 0.38, 0.62, vTerrain.x + ( hrM.r - hrL.r ) * 0.35 ) * ( 1.0 - wPath );
float wLitter = 1.0 - wPath - wDuff;
vec3 litterC = mix( litterA, litterB, clamp( vTerrain.w, 0.12, 0.72 ) );
vec3 groundAlbedo = litterC * wLitter + duffC * wDuff + dirtC * wPath;
groundAlbedo = mix( groundAlbedo, groundAlbedo * vec3( 1.08, 1.05, 0.98 ), pathMask * ( 1.0 - wPath ) * 0.6 );
groundAlbedo *= 1.0 - 0.14 * vTerrain.y;
diffuseColor.rgb *= groundAlbedo;
`;

const FRAG_ROUGH = /* glsl */ `
float roughnessFactor = roughness * ( hrL.g * wLitter + hrM.g * wDuff + hrD.g * wPath );
`;

const FRAG_NORMAL = /* glsl */ `
vec3 nL = texture2D( normalMap, uvL ).xyz * 2.0 - 1.0;
vec3 nD = texture2D( uDirtNormal, uvD ).xyz * 2.0 - 1.0;
vec3 nM = texture2D( uDuffNormal, uvM ).xyz * 2.0 - 1.0;
vec3 mapN = normalize( nL * wLitter + nD * wPath + nM * wDuff );
mapN.xy *= normalScale;
normal = normalize( tbn * mapN );
`;

/**
 * @param {{ textures: { litter, dirt, duff }, pathMask: THREE.Texture, size: number }} o
 * @returns {THREE.MeshStandardMaterial} with `userData.uniforms`
 */
export function createTerrainMaterial({ textures, pathMask, size }) {
  const { litter, dirt, duff } = textures;
  const T = TERRAIN_MATERIAL;
  const uniforms = {
    uTerrainSize: { value: size },
    uTile: { value: new THREE.Vector4(T.tile.litter, T.tile.dirt, T.tile.duff, T.macroFactor) },
    uPathMask: { value: pathMask },
    uDirtMap: { value: dirt.map }, uDirtNormal: { value: dirt.normalMap }, uDirtRough: { value: dirt.roughnessMap },
    uDuffMap: { value: duff.map }, uDuffNormal: { value: duff.normalMap }, uDuffRough: { value: duff.roughnessMap },
  };
  const material = new THREE.MeshStandardMaterial({
    map: litter.map,
    normalMap: litter.normalMap,
    roughnessMap: litter.roughnessMap,
    roughness: T.roughness,
    metalness: 0,
    vertexColors: true,
    normalScale: new THREE.Vector2(T.normalScale, T.normalScale),
  });
  material.defines = { USE_UV: "" };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aTerrain;\nvarying vec4 vTerrain;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvTerrain = aTerrain;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + FRAG_PARS)
      .replace("#include <map_fragment>", FRAG_BLEND)
      .replace("#include <roughnessmap_fragment>", FRAG_ROUGH)
      .replace("#include <normal_fragment_maps>", FRAG_NORMAL);
  };
  material.customProgramCacheKey = () => "wipfel-terrain-blend-v2";
  material.userData.uniforms = uniforms;
  material.name = "terrain-ground";
  return material;
}
