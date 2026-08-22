// Forest-floor scatter: pebbles, stones, root arches, fallen twigs, grass tufts and leaf clumps as
// seeded InstancedMeshes (6 draw calls) – denser along path edges, none on paths / hubs (stones,
// roots) / excluded spots. Grass sways in the vertex shader (shared wind uniforms or local fallback).
import * as THREE from "three";
import { makeNoise2D } from "../core/rng.js";
import {
  PROPS, createStoneGeometry, createRootGeometry, createTwigGeometry, createTuftGeometry, createLeafClumpGeometry,
  getStoneTexture, getRootBarkTexture, getGrassCardTexture, getLeafClumpTexture,
} from "../procgen/geometry/ground-props.js";

export const GROUND_DETAIL = Object.freeze({
  counts: { pebbles: 1400, stones: 260, roots: 180, tufts: 1500, twigs: 700, clumps: 650 },
  edgeMargin: 3,               // metres kept free along the world border
  nearPathProbe: 2.4,          // metres – "next to a path" test distance
  hubFade: 8,                  // metres outside a hub radius where props fade back in
  localWind: { strength: 0.6, direction: [1, 0.35] },
});

const GRASS_SWAY = /* glsl */ `
{
  #ifdef USE_INSTANCING
    mat3 iRot = mat3( instanceMatrix );
    vec3 iPos = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );
  #else
    mat3 iRot = mat3( 1.0 );
    vec3 iPos = vec3( 0.0 );
  #endif
  float hgt = clamp( position.y / uTuftHeight, 0.0, 1.0 );
  float phase = dot( iPos.xz, uWindDir ) * 0.45 + uTime * 1.9;
  float gust = sin( phase ) * 0.6 + sin( phase * 2.17 + 1.3 ) * 0.3 + sin( uTime * 4.3 + iPos.x * 1.7 + iPos.z * 0.9 ) * 0.1;
  float sway = gust * uWindStrength * 0.14 * hgt * hgt;
  vec3 windWorld = vec3( uWindDir.x, 0.0, uWindDir.y );
  vec3 windObj = ( transpose( iRot ) * windWorld ) / vec3( dot( iRot[0], iRot[0] ), dot( iRot[1], iRot[1] ), dot( iRot[2], iRot[2] ) );
  transformed += windObj * sway;
}
`;

const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

function hubWeight(hubs, x, z) {
  let w = 0;
  for (const h of hubs) w = Math.max(w, 1 - smoothstep(h.radius, h.radius + GROUND_DETAIL.hubFade, Math.hypot(x - h.x, z - h.z)));
  return w;
}

function isNearPath(terrain, x, z) {
  const p = GROUND_DETAIL.nearPathProbe;
  return terrain.isPath(x + p, z) || terrain.isPath(x - p, z) || terrain.isPath(x, z + p) || terrain.isPath(x, z - p);
}

/** Rejection-samples `count` spots; `weight(ctx)` in 0..1 is the acceptance probability. */
function scatter(rng, terrain, exclude, count, weight) {
  const spots = [];
  const { min, max } = terrain.bounds, m = GROUND_DETAIL.edgeMargin;
  const clumpNoise = makeNoise2D(rng.fork("clumps").seed);
  const maxAttempts = count * 8;
  for (let attempt = 0; attempt < maxAttempts && spots.length < count; attempt++) {
    const x = rng.float(min.x + m, max.x - m), z = rng.float(min.z + m, max.z - m);
    if (terrain.isPath(x, z) || (exclude && exclude(x, z))) continue;
    const ctx = {
      x, z,
      slope: terrain.slopeAt(x, z),
      nearPath: isNearPath(terrain, x, z),
      hub: hubWeight(terrain.hubs, x, z),
      clump: 0.5 + 0.5 * clumpNoise(x / 17, z / 17),
    };
    const w = weight(ctx);
    if (w > 0 && rng.next() < w) spots.push(ctx);
  }
  return spots;
}

const UP = new THREE.Vector3(0, 1, 0), IDENTITY = new THREE.Quaternion();
const tmpN = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpYaw = new THREE.Quaternion();
const tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();

/** Builds one InstancedMesh from spots; `place(ctx, rng)` returns { yaw, scale:[x,y,z], tilt, lift, tint:[r,g,b] }. */
function buildInstances(name, geometry, material, spots, terrain, rng, place, { castShadow = true } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, spots.length));
  mesh.name = name;
  spots.forEach((ctx, i) => {
    const p = place(ctx, rng);
    terrain.normalAt(ctx.x, ctx.z, tmpN);
    tmpQ.setFromUnitVectors(UP, tmpN);
    if (p.tilt < 1) tmpQ.slerp(IDENTITY, 1 - p.tilt);
    tmpYaw.setFromAxisAngle(UP, p.yaw);
    tmpQ.multiply(tmpYaw);
    tmpP.set(ctx.x, terrain.heightAt(ctx.x, ctx.z) + p.lift, ctx.z);
    tmpS.set(p.scale[0], p.scale[1], p.scale[2]);
    tmpM.compose(tmpP, tmpQ, tmpS);
    mesh.setMatrixAt(i, tmpM);
    mesh.setColorAt(i, tmpC.setRGB(p.tint[0], p.tint[1], p.tint[2]));
  });
  mesh.count = spots.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * @param {{ rng, scene, terrain, wind?: { uniforms }, exclude?: (x, z) => boolean }} o
 * @returns {{ update(dt), dispose(), meshes: THREE.InstancedMesh[], uniforms }}
 */
export function createGroundDetail({ rng, scene, terrain, wind, exclude }) {
  const drng = rng.fork("ground-detail");
  const seed = drng.fork("textures").seed;
  const C = GROUND_DETAIL.counts;
  const uniforms = wind && wind.uniforms ? wind.uniforms : {
    uTime: { value: 0 },
    uWindStrength: { value: GROUND_DETAIL.localWind.strength },
    uWindDir: { value: new THREE.Vector2(...GROUND_DETAIL.localWind.direction).normalize() },
  };
  const ownsWind = !(wind && wind.uniforms);

  const stoneTex = getStoneTexture(seed), barkTex = getRootBarkTexture(seed);
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex.map, normalMap: stoneTex.normalMap, roughness: 0.88, metalness: 0 });
  const barkMat = new THREE.MeshStandardMaterial({ map: barkTex.map, normalMap: barkTex.normalMap, roughness: 0.92, metalness: 0 });
  const grassMat = new THREE.MeshStandardMaterial({ map: getGrassCardTexture(seed), alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWindStrength = uniforms.uWindStrength;
    shader.uniforms.uWindDir = uniforms.uWindDir;
    shader.uniforms.uTuftHeight = { value: PROPS.tuftHeight };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWindStrength;\nuniform vec2 uWindDir;\nuniform float uTuftHeight;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n" + GRASS_SWAY);
  };
  grassMat.customProgramCacheKey = () => "wipfel-grass-sway-v1";
  const clumpMat = new THREE.MeshStandardMaterial({ map: getLeafClumpTexture(seed), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });

  const geometries = {
    pebble: createStoneGeometry(drng.fork("pebble-geo"), { flatten: 0.55, roughness: 0.28 }),
    stone: createStoneGeometry(drng.fork("stone-geo"), { flatten: 0.62, roughness: 0.34 }),
    root: createRootGeometry(drng.fork("root-geo")),
    twig: createTwigGeometry(drng.fork("twig-geo")),
    tuft: createTuftGeometry(),
    clump: createLeafClumpGeometry(),
  };

  const grey = (rng, lo, hi) => { const b = rng.float(lo, hi), w = rng.float(-0.04, 0.04); return [b + w, b, b - w * 0.6]; };
  const steepBoost = (ctx) => 1 + 0.6 * smoothstep(0.2, 0.5, ctx.slope);

  const pebbles = scatter(drng.fork("pebbles"), terrain, exclude, C.pebbles,
    (c) => (0.35 + 0.65 * c.clump) * (c.nearPath ? 1.8 : 1) * steepBoost(c) * (1 - 0.7 * c.hub));
  const stones = scatter(drng.fork("stones"), terrain, exclude, C.stones,
    (c) => (0.25 + 0.75 * c.clump * c.clump) * steepBoost(c) * (1 - c.hub) * (c.nearPath ? 0.6 : 1));
  const roots = scatter(drng.fork("roots"), terrain, exclude, C.roots,
    (c) => (0.2 + 0.8 * c.clump) * (1 - c.hub) * (c.nearPath ? 0.4 : 1));
  const tufts = scatter(drng.fork("tufts"), terrain, exclude, C.tufts,
    (c) => (0.3 + 0.7 * c.clump) * (c.slope < 0.45 ? 1 : 0.35) * (c.nearPath ? 2 : 1) * (1 - 0.6 * c.hub));
  const twigs = scatter(drng.fork("twigs"), terrain, exclude, C.twigs,
    (c) => (0.45 + 0.55 * c.clump) * (1 - 0.5 * c.hub));
  const clumps = scatter(drng.fork("clumps"), terrain, exclude, C.clumps,
    (c) => (0.45 + 0.55 * c.clump) * (c.nearPath ? 0.5 : 1));

  const prng = drng.fork("placement");
  const meshes = [
    buildInstances("pebbles", geometries.pebble, stoneMat, pebbles, terrain, prng, (c, r) => {
      const s = r.float(0.05, 0.14);
      return { yaw: r.float(0, Math.PI * 2), scale: [s * r.float(0.8, 1.3), s, s * r.float(0.8, 1.3)], tilt: 0.8, lift: s * 0.55 * 0.45, tint: grey(r, 0.7, 1.05) };
    }),
    buildInstances("stones", geometries.stone, stoneMat, stones, terrain, prng, (c, r) => {
      const s = r.float(0.16, 0.48);
      return { yaw: r.float(0, Math.PI * 2), scale: [s * r.float(0.85, 1.35), s, s * r.float(0.85, 1.35)], tilt: 0.7, lift: s * 0.62 * 0.5, tint: grey(r, 0.75, 1.05) };
    }),
    buildInstances("roots", geometries.root, barkMat, roots, terrain, prng, (c, r) => {
      const s = r.float(0.7, 1.4);
      return { yaw: r.float(0, Math.PI * 2), scale: [s, s * r.float(0.8, 1.1), s * r.float(0.8, 1.2)], tilt: 1, lift: 0, tint: [r.float(0.8, 1.05), r.float(0.8, 0.95), r.float(0.75, 0.9)] };
    }),
    buildInstances("twigs", geometries.twig, barkMat, twigs, terrain, prng, (c, r) => {
      const s = r.float(0.6, 1.4);
      return { yaw: r.float(0, Math.PI * 2), scale: [s, s, s], tilt: 1, lift: 0, tint: [r.float(0.6, 0.9), r.float(0.55, 0.8), r.float(0.5, 0.7)] };
    }),
    buildInstances("tufts", geometries.tuft, grassMat, tufts, terrain, prng, (c, r) => {
      const s = r.float(0.65, 1.3), g = r.float(0, 1);
      return { yaw: r.float(0, Math.PI * 2), scale: [s * r.float(0.85, 1.2), s * r.float(0.8, 1.25), s * r.float(0.85, 1.2)], tilt: 0.5, lift: -0.01, tint: [0.75 + 0.3 * g, 0.85 + 0.15 * g, 0.55 + 0.2 * g] };
    }),
    buildInstances("leaf-clumps", geometries.clump, clumpMat, clumps, terrain, prng, (c, r) => {
      const s = r.float(0.7, 1.35);
      return { yaw: r.float(0, Math.PI * 2), scale: [s, 1, s * r.float(0.85, 1.15)], tilt: 1, lift: 0.035, tint: grey(r, 0.85, 1.05) };
    }, { castShadow: false }),
  ];
  for (const m of meshes) scene.add(m);

  let elapsed = 0;
  return {
    meshes,
    uniforms,
    update(dt) {
      if (!ownsWind) return;
      elapsed += dt;
      uniforms.uTime.value = elapsed;
      uniforms.uWindStrength.value = GROUND_DETAIL.localWind.strength * (0.8 + 0.35 * Math.sin(elapsed * 0.37) * Math.sin(elapsed * 0.11 + 1));
    },
    dispose() {
      for (const m of meshes) { scene.remove(m); m.dispose(); }
      for (const g of Object.values(geometries)) g.dispose();
      for (const mat of [stoneMat, barkMat, grassMat, clumpMat]) mat.dispose();
    },
  };
}
