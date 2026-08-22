// Turns tree skeletons into merged BufferGeometries: parallel-transport tubes for trunk/branches and
// oriented quads for foliage cards. Attributes: position, normal, uv, color (tint/shade),
// aWind (vec2: sway weight, flutter phase) consumed by the wind vertex shader.
import * as THREE from "three";

const UP = new THREE.Vector3(0, 1, 0);

export class GeometryBuilder {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.wind = []; this.idx = [];
  }
  get vertexCount() { return this.pos.length / 3; }
  vertex(p, n, u, v, c, w0, w1) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    this.wind.push(w0, w1);
    return this.vertexCount - 1;
  }
  face(a, b, c) { this.idx.push(a, b, c); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("aWind", new THREE.Float32BufferAttribute(this.wind, 2));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(this.idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3();
const _d = new THREE.Vector3(), _vn = new THREE.Vector3(), _tmp = new THREE.Vector3();

/**
 * Appends a tapered tube along `tube.curve`.
 * @param {GeometryBuilder} gb
 * @param {{curve, radiusAt, length, level, baseRadius}} tube
 * @param {{ rings:number, radial:number, tileMetres:number, height:number, tint:(y:number)=>number[], sway:(y:number, t:number, level:number)=>number }} o
 */
export function appendTube(gb, tube, o) {
  const rings = Math.max(2, o.rings), radial = Math.max(3, o.radial);
  const repeatsU = Math.max(1, Math.round((2 * Math.PI * tube.baseRadius) / o.tileMetres));
  const first = gb.vertexCount;
  const eps = 0.01;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    tube.curve.getPointAt(t, _p);
    tube.curve.getTangentAt(t, _t).normalize();
    if (i === 0) {
      _n.copy(Math.abs(_t.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).cross(_t).normalize();
    } else {
      _n.addScaledVector(_t, -_n.dot(_t)).normalize();
    }
    _b.crossVectors(_t, _n);
    const r = tube.radiusAt(t);
    const slope = (tube.radiusAt(Math.min(1, t + eps)) - tube.radiusAt(Math.max(0, t - eps))) / (2 * eps * tube.length);
    const arc = t * tube.length;
    const tint = o.tint(_p.y);
    const sway = o.sway(_p.y, t, tube.level);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      _d.copy(_n).multiplyScalar(Math.cos(a)).addScaledVector(_b, Math.sin(a));
      _tmp.copy(_p).addScaledVector(_d, r);
      _vn.copy(_d).addScaledVector(_t, -slope).normalize();
      gb.vertex(_tmp, _vn, (j / radial) * repeatsU, arc / o.tileMetres, tint, sway, 0);
    }
  }
  const stride = radial + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      const a = first + i * stride + j, b = first + (i + 1) * stride + j, c = b + 1, d = a + 1;
      gb.face(a, b, d);
      gb.face(b, c, d);
    }
  }
}

const _right = new THREE.Vector3(), _up2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _corner = new THREE.Vector3(), _sph = new THREE.Vector3();

/**
 * Appends one foliage card (quad) with spherical "canopy" normals and per-card shade colour.
 * @param {GeometryBuilder} gb
 * @param {{pos, normal, roll, size, tile, sway, phase, shade, top}} card
 * @param {{u0,v0,u1,v1}} uv atlas tile
 * @param {{ crownCenter: THREE.Vector3, rx:number, ry:number, scale?:number, tintTop?:number[] }} o
 */
export function appendCard(gb, card, uv, o) {
  const size = card.size * (o.scale || 1);
  const n = card.normal;
  _right.copy(Math.abs(n.y) < 0.95 ? UP : new THREE.Vector3(1, 0, 0)).cross(n).normalize();
  _q.setFromAxisAngle(n, card.roll);
  _right.applyQuaternion(_q);
  _up2.crossVectors(n, _right).normalize();
  const half = size / 2;
  const t = Math.max(0, card.top);
  const tint = o.tintTop || [1.06, 1.03, 0.94];
  const c = [card.shade * (1 + (tint[0] - 1) * t), card.shade * (1 + (tint[1] - 1) * t), card.shade * (1 + (tint[2] - 1) * t)];
  const corners = [[-1, -1, uv.u0, uv.v0], [1, -1, uv.u1, uv.v0], [1, 1, uv.u1, uv.v1], [-1, 1, uv.u0, uv.v1]];
  const first = gb.vertexCount;
  for (const [sx, sy, u, v] of corners) {
    _corner.copy(card.pos).addScaledVector(_right, sx * half).addScaledVector(_up2, sy * half);
    _sph.set((_corner.x - o.crownCenter.x) / o.rx, (_corner.y - o.crownCenter.y) / o.ry, (_corner.z - o.crownCenter.z) / o.rx);
    if (_sph.lengthSq() < 1e-6) _sph.set(0, 1, 0);
    _sph.normalize().addScaledVector(UP, 0.45).normalize();
    gb.vertex(_corner, _sph, u, v, c, card.sway, card.phase);
  }
  gb.face(first, first + 1, first + 2);
  gb.face(first, first + 2, first + 3);
}

/**
 * Impostor: `count` vertical quads crossing on the trunk axis, full-texture UVs, up-facing normals.
 */
export function appendCrossedQuads(gb, { width, yMin, yMax, count = 3, height }) {
  const first0 = gb.vertexCount;
  const c = [1, 1, 1];
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI;
    const dx = Math.cos(a) * width / 2, dz = Math.sin(a) * width / 2;
    const first = gb.vertexCount;
    const corners = [[-dx, yMin, -dz, 0, 0], [dx, yMin, dz, 1, 0], [dx, yMax, dz, 1, 1], [-dx, yMax, -dz, 0, 1]];
    for (const [x, y, z, u, v] of corners) {
      _corner.set(x, y, z);
      const sway = Math.pow(Math.max(0, y) / height, 2) * 0.6;
      gb.vertex(_corner, UP, u, v, c, sway, k * 2.1);
    }
    gb.face(first, first + 1, first + 2);
    gb.face(first, first + 2, first + 3);
  }
  return first0;
}
