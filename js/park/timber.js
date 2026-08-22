// Shared construction kit for the park's timber and steel work (platforms, entry decks, ladders).
// Structures are described part by part in their own local frame and then merged into ONE mesh per
// material, so a whole platform costs 3–5 draw calls instead of forty. UVs are projected in world
// units so the wood grain keeps its real scale on every part, and the grain always runs along the
// part's long axis. No physics, no scene graph beyond the returned group.
import * as THREE from "three";

const MATERIAL_KEYS = Object.freeze(["plank", "log", "weathered", "dark", "steel", "rubber", "rope", "cord", "sign"]);

/** Steel look for cables, brackets and threaded rods: slightly grey-blue, near-mirror but scuffed. */
const STEEL = Object.freeze({ color: 0x9aa6b2, metalness: 0.9, roughness: 0.35 });

/**
 * @param {{ textures: { plank, log, weathered }, signMap?: THREE.Texture }} options
 *   `textures` comes from `procgen/textures/wood.js#getWoodTextures`.
 * @returns {{ materials: Record<string, THREE.Material>, tileOf(key: string): number,
 *   box(o): void, cylinderBetween(o): void, tube(o): void, torus(o): void, plate(o): void,
 *   build(name?: string): THREE.Group, dispose(): void }}
 */
export function createTimberBuilder({ textures, signMap = null }) {
  const materials = createTimberMaterials(textures, signMap);
  const tiles = { plank: textures.plank.tileMetres, dark: textures.plank.tileMetres, log: textures.log.tileMetres, weathered: textures.weathered.tileMetres };
  const parts = new Map();                       // material key → [{ geometry, matrix }]
  const owned = [];                              // geometries created here, disposed with the kit
  const shapes = new Map();                      // reusable primitives (16 identical ladder steps …)
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Euler();
  const _up = new THREE.Vector3(0, 1, 0);

  const push = (material, geometry, matrix) => {
    if (!parts.has(material)) parts.set(material, []);
    parts.get(material).push({ geometry, matrix: matrix.clone() });
  };
  const shape = (key, make) => {
    let geometry = shapes.get(key);
    if (!geometry) { geometry = make(); shapes.set(key, geometry); owned.push(geometry); }
    return geometry;
  };
  const tileOf = (material) => tiles[material] || 1;
  const matrixOf = (position, rotation, quaternion = null) => {
    if (quaternion) _q.copy(quaternion);
    else _q.setFromEuler(rotation ? _e.set(rotation.x || 0, rotation.y || 0, rotation.z || 0) : _e.set(0, 0, 0));
    return _m.compose(_v.set(position.x, position.y, position.z), _q, ONE);
  };

  return {
    materials,
    tileOf,

    /**
     * Sawn timber: `length` along local X (the grain), `width` along Z, `thickness` along Y.
     * Pass `quaternion` instead of `rotation` when the part is not simply yawed (e.g. upright planks).
     * @param {{ length, width, thickness, position, rotation?, quaternion?, material? }} o
     */
    box({ length, width, thickness, position, rotation = null, quaternion = null, material = "plank" }) {
      const geometry = shape(`box:${length}:${width}:${thickness}:${tileOf(material)}`,
        () => boxGeometry(length, width, thickness, tileOf(material)));
      push(material, geometry, matrixOf(position, rotation, quaternion));
    },

    /**
     * Round pole between two points (frame logs, posts, struts, rods).
     * @param {{ from, to, radius, segments?, material? }} o
     */
    cylinderBetween({ from, to, radius, segments = 10, material = "log" }) {
      _v.set(to.x - from.x, to.y - from.y, to.z - from.z);
      const length = _v.length();
      if (length < 1e-4) return;
      const geometry = shape(`cyl:${radius}:${round(length)}:${segments}:${tileOf(material)}`,
        () => cylinderGeometry(radius, round(length), segments, tileOf(material)));
      _q.setFromUnitVectors(_up, _v.divideScalar(length));
      _m.compose(_v.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2), _q, ONE);
      push(material, geometry, _m);
    },

    /** Cable/rope along a polyline (Catmull-Rom smoothed). @param {{ points, radius, segments?, material? }} o */
    tube({ points, radius, segments = 24, radialSegments = 6, material = "steel" }) {
      const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
      const geometry = new THREE.TubeGeometry(curve, segments, radius, radialSegments, false);
      owned.push(geometry);
      push(material, geometry, IDENTITY);
    },

    /** Horizontal ring in the XZ plane – the safety cable around a trunk. @param {{ centre, radius, tube, material? }} o */
    torus({ centre, radius, tube, segments = 32, material = "steel" }) {
      const geometry = new THREE.TorusGeometry(radius, tube, 6, segments);
      geometry.rotateX(Math.PI / 2);
      owned.push(geometry);
      push(material, geometry, matrixOf(centre, null));
    },

    /** Flat double-sided disc facing +Z in its local frame (pictogram signs, plaques). */
    plate({ radius, position, rotation = null, material = "sign" }) {
      const geometry = new THREE.CircleGeometry(radius, 24);
      owned.push(geometry);
      push(material, geometry, matrixOf(position, rotation));
    },

    /** Merge every queued part into one mesh per material and return them in a group. */
    build(name = "timber") {
      const group = new THREE.Group();
      group.name = name;
      for (const [key, list] of parts) {
        if (!list.length) continue;
        const merged = mergeParts(list);
        const mesh = new THREE.Mesh(merged, materials[key]);
        mesh.name = `${name}-${key}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      parts.clear();
      return group;
    },

    dispose() {
      for (const geometry of owned) geometry.dispose();
      owned.length = 0;
      shapes.clear();
      parts.clear();
      for (const material of Object.values(materials)) material.dispose();
    },
  };
}

const ONE = new THREE.Vector3(1, 1, 1);
const IDENTITY = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const _basis = new THREE.Matrix4(), _radial = new THREE.Vector3(), _tangent = new THREE.Vector3();

/**
 * Orientation for an upright plank or stave: the part's length (and grain) points up, its thickness
 * points outwards along `yaw`, its width runs tangentially. Pass the result to `box({ quaternion })`.
 */
export function uprightQuaternion(yaw = 0, target = new THREE.Quaternion()) {
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  _radial.set(sin, 0, cos);
  _tangent.set(cos, 0, -sin);
  return target.setFromRotationMatrix(_basis.makeBasis(UP, _radial, _tangent));
}

/** Tear down a structure built with a builder: merged meshes first, then the builder's own assets. */
export function disposeStructure(group, builder) {
  if (group) {
    group.traverse((object) => { if (object.isMesh) object.geometry.dispose(); });
    group.removeFromParent();
  }
  if (builder) builder.dispose();
}

/** Materials shared by every structure of one park. Textures are owned by the texture cache. */
function createTimberMaterials(textures, signMap) {
  const wood = (set, color, roughness = 1) => new THREE.MeshStandardMaterial({
    color, map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap,
    normalScale: new THREE.Vector2(set.normalScale, set.normalScale), roughness, metalness: 0,
  });
  const out = {
    plank: wood(textures.plank, 0xf0e7d8),
    log: wood(textures.log, 0xe9dcc7),
    weathered: wood(textures.weathered, 0xece9e0),
    dark: wood(textures.plank, 0x5d4c3c),                       // creosote-dark ladder spine
    steel: new THREE.MeshStandardMaterial(STEEL),
    rubber: new THREE.MeshStandardMaterial({ color: 0x3c3e42, roughness: 0.88, metalness: 0 }),
    rope: new THREE.MeshStandardMaterial({ color: 0x2d5fae, roughness: 0.85, metalness: 0 }),
    cord: new THREE.MeshStandardMaterial({ color: 0x9c8a68, roughness: 0.95, metalness: 0 }),   // hemp-coloured element rope
    sign: new THREE.MeshStandardMaterial({ color: 0xffffff, map: signMap, roughness: 0.55, metalness: 0, side: THREE.DoubleSide }),
  };
  for (const key of MATERIAL_KEYS) out[key].name = `timber-${key}`;
  return out;
}

const round = (v) => Math.round(v * 1000) / 1000;

/** Box with world-scaled, box-projected UVs; the grain (texture U) runs along the local X axis. */
function boxGeometry(length, width, thickness, tile) {
  const geometry = new THREE.BoxGeometry(length, thickness, width);
  const pos = geometry.attributes.position, nor = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u, v;
    if (ax >= ay && ax >= az) { u = z; v = y; }                 // end grain
    else if (ay >= az) { u = x; v = z; }                        // face
    else { u = x; v = y; }                                      // edge
    uv.setXY(i, u / tile, v / tile);
  }
  uv.needsUpdate = true;
  return geometry;
}

/** Cylinder along the local Y axis with the grain running along its length. */
function cylinderGeometry(radius, length, segments, tile) {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, segments, 1, false);
  const uv = geometry.attributes.uv;
  const around = 2 * Math.PI * radius;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, (v * length) / tile, (u * around) / tile);      // swap: length → grain direction
  }
  uv.needsUpdate = true;
  return geometry;
}

/** Concatenate indexed position/normal/uv geometries under their transforms into one geometry. */
function mergeParts(list) {
  let vertices = 0, indices = 0;
  for (const { geometry } of list) {
    vertices += geometry.attributes.position.count;
    indices += geometry.index ? geometry.index.count : geometry.attributes.position.count;
  }
  const position = new Float32Array(vertices * 3);
  const normal = new Float32Array(vertices * 3);
  const uv = new Float32Array(vertices * 2);
  const index = new Uint32Array(indices);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
  let vo = 0, io = 0;
  for (const { geometry, matrix } of list) {
    const src = geometry.attributes;
    normalMatrix.getNormalMatrix(matrix);
    for (let i = 0; i < src.position.count; i++) {
      p.fromBufferAttribute(src.position, i).applyMatrix4(matrix).toArray(position, (vo + i) * 3);
      n.fromBufferAttribute(src.normal, i).applyMatrix3(normalMatrix).normalize().toArray(normal, (vo + i) * 3);
      uv[(vo + i) * 2] = src.uv.getX(i);
      uv[(vo + i) * 2 + 1] = src.uv.getY(i);
    }
    const count = geometry.index ? geometry.index.count : src.position.count;
    for (let i = 0; i < count; i++) index[io + i] = vo + (geometry.index ? geometry.index.getX(i) : i);
    vo += src.position.count;
    io += count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  merged.computeBoundingSphere();
  return merged;
}
