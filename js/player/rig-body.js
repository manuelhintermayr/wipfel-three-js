// Procedural climber body: joint hierarchy + skin/clothes/hair meshes built from smoothly joined
// primitives (tapered lathe capsules, lathe torso, spheres). Character faces +Z, left = +X, feet at y = 0.
// Gear (harness, lanyard, trolley) is added by rig-gear.js; animation by rig-poses.js / rig.js.

import * as THREE from "three";

/** Rest-pose layout (metres). Every joint is a THREE.Group; children are positioned relative to it. */
export const LAYOUT = Object.freeze({
  pelvisY: 0.92, hipX: 0.09, hipDrop: 0.02,
  thigh: { length: 0.42, rTop: 0.078, rBottom: 0.06 },
  shin: { length: 0.40, rTop: 0.058, rBottom: 0.042 },
  foot: { radius: 0.045, length: 0.16, drop: 0.045, forward: 0.04 },
  spineUp: 0.10, chestUp: 0.18, neckUp: 0.27, headUp: 0.07,
  shoulderX: 0.16, shoulderUp: 0.23, deltoidR: 0.055,
  upperArm: { length: 0.28, rTop: 0.048, rBottom: 0.04 },
  forearm: { length: 0.25, rTop: 0.04, rBottom: 0.03 },
  hand: { radius: 0.036, length: 0.085, drop: 0.08 },
  torsoScale: { x: 1.18, z: 0.82 },
  headR: 0.098, headCentreUp: 0.085,
});

/** Tapered capsule along −Y: top cap centre at y = 0, bottom cap centre at y = −length. */
export function taperedCapsule(rTop, rBottom, length, radial = 14, capSegments = 5) {
  const pts = [];
  for (let i = 0; i <= capSegments; i++) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (i / capSegments);
    pts.push(new THREE.Vector2(rBottom * Math.cos(a), -length + rBottom * Math.sin(a)));
  }
  for (let i = 0; i <= capSegments; i++) {
    const a = (Math.PI / 2) * (i / capSegments);
    pts.push(new THREE.Vector2(rTop * Math.cos(a), rTop * Math.sin(a)));
  }
  return new THREE.LatheGeometry(pts, radial);
}

/** Lathe from (radius, y) pairs, scaled non-uniformly for an oval cross-section. */
export function ovalLathe(profile, sx, sz, radial = 22) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, radial);
  geo.scale(sx, 1, sz);
  return geo;
}

export function addMesh(parent, geometry, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function addJoint(parent, name, x, y, z, joints) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  joints[name] = g;
  return g;
}

export function addAnchor(parent, name, x, y, z) {
  const a = new THREE.Object3D();
  a.name = name;
  a.position.set(x, y, z);
  parent.add(a);
  return a;
}

/**
 * Build the body. Returns { root, joints, attach } – attach: handL, handR, head (eyes).
 * @param {Record<string, THREE.Material>} m materials
 */
export function buildBody(m) {
  const L = LAYOUT;
  const T = L.torsoScale;
  const root = new THREE.Group();
  root.name = "player-rig";
  const joints = {};
  const attach = {};

  const pelvis = addJoint(root, "pelvis", 0, L.pelvisY, 0, joints);
  addMesh(pelvis, ovalLathe([[0.03, -0.11], [0.10, -0.09], [0.14, -0.05], [0.15, 0], [0.145, 0.06], [0.135, 0.10]], T.x, T.z), m.pants);

  const spine = addJoint(pelvis, "spine", 0, L.spineUp, 0, joints);
  addMesh(spine, ovalLathe([[0.14, -0.06], [0.135, 0], [0.128, 0.06], [0.132, 0.12], [0.142, 0.18]], T.x, T.z), m.top);

  const chest = addJoint(spine, "chest", 0, L.chestUp, 0, joints);
  addMesh(chest, ovalLathe([[0.142, 0], [0.152, 0.05], [0.155, 0.09], [0.15, 0.13], [0.144, 0.16]], T.x, T.z), m.top);
  addMesh(chest, ovalLathe([[0.144, 0.16], [0.146, 0.20], [0.128, 0.24], [0.09, 0.265], [0.056, 0.285]], T.x, T.z), m.skin);
  for (const side of [1, -1]) {   // tank-top straps
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.07, 0.15, 0.118), new THREE.Vector3(side * 0.08, 0.20, 0.09),
      new THREE.Vector3(side * 0.085, 0.245, 0.01), new THREE.Vector3(side * 0.08, 0.20, -0.09),
      new THREE.Vector3(side * 0.07, 0.15, -0.118),
    ]);
    addMesh(chest, new THREE.TubeGeometry(curve, 16, 0.013, 6, false), m.top);
  }

  buildHead(chest, joints, attach, m);
  for (const side of [1, -1]) {
    buildArm(chest, side, joints, attach, m);
    buildLeg(pelvis, side, joints, m);
  }
  return { root, joints, attach };
}

function buildHead(chest, joints, attach, m) {
  const L = LAYOUT;
  const neck = addJoint(chest, "neck", 0, L.neckUp, 0, joints);
  addMesh(neck, new THREE.CylinderGeometry(0.043, 0.048, 0.10, 14), m.skin, { y: 0.04 });
  const head = addJoint(neck, "head", 0, L.headUp, 0, joints);
  const hy = L.headCentreUp;
  const r = L.headR;
  addMesh(head, new THREE.SphereGeometry(r, 26, 18), m.skin, { y: hy, z: 0.008, sx: 0.92, sy: 1.08, sz: 1.0 });
  addMesh(head, new THREE.SphereGeometry(0.018, 10, 8), m.skin, { x: 0.092, y: hy - 0.005, z: 0.01, sy: 1.3, sz: 0.7 });
  addMesh(head, new THREE.SphereGeometry(0.018, 10, 8), m.skin, { x: -0.092, y: hy - 0.005, z: 0.01, sy: 1.3, sz: 0.7 });
  // hair: skull cap (top) + sides/back piece leaving the face open, tied into a bun
  const hairR = r * 1.045;
  addMesh(head, new THREE.SphereGeometry(hairR, 26, 12, 0, Math.PI * 2, 0, Math.PI * 0.36), m.hair, { y: hy, z: 0.006, sx: 0.93, sy: 1.09, sz: 1.01 });
  addMesh(head, new THREE.SphereGeometry(hairR, 26, 12, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, Math.PI * 0.36, Math.PI * 0.30), m.hair, { y: hy, z: 0.006, sx: 0.93, sy: 1.09, sz: 1.01 });
  addMesh(head, new THREE.SphereGeometry(0.042, 16, 12), m.hair, { y: hy + 0.035, z: -0.105, sx: 1.0, sy: 0.9, sz: 0.85 });
  addMesh(head, new THREE.TorusGeometry(0.03, 0.005, 6, 16), m.orange, { y: hy + 0.035, z: -0.075, sy: 0.9 });
  attach.head = addAnchor(head, "eyes", 0, hy + 0.01, 0.09);
}

function buildArm(chest, side, joints, attach, m) {
  const L = LAYOUT;
  const s = side > 0 ? "L" : "R";
  addMesh(chest, new THREE.SphereGeometry(L.deltoidR, 16, 12), m.skin, { x: side * L.shoulderX, y: L.shoulderUp, sy: 1.1 });
  const shoulder = addJoint(chest, "shoulder" + s, side * L.shoulderX, L.shoulderUp, 0, joints);
  const ua = L.upperArm;
  addMesh(shoulder, taperedCapsule(ua.rTop, ua.rBottom, ua.length), m.skin);
  const elbow = addJoint(shoulder, "elbow" + s, 0, -ua.length, 0, joints);
  const fa = L.forearm;
  addMesh(elbow, taperedCapsule(fa.rTop, fa.rBottom, fa.length), m.skin);
  const wrist = addJoint(elbow, "wrist" + s, 0, -fa.length, 0, joints);
  const h = L.hand;
  addMesh(wrist, new THREE.CapsuleGeometry(h.radius, h.length, 4, 12), m.glove, { y: -h.drop, sz: 0.55, ry: side * 0.35 });
  addMesh(wrist, new THREE.TorusGeometry(0.037, 0.007, 6, 16), m.orange, { y: -0.012, rx: Math.PI / 2, sy: 0.8 });
  attach["hand" + s] = addAnchor(wrist, "palm" + s, -side * 0.02, -0.1, 0.02);
}

function buildLeg(pelvis, side, joints, m) {
  const L = LAYOUT;
  const s = side > 0 ? "L" : "R";
  const hip = addJoint(pelvis, "hip" + s, side * L.hipX, -L.hipDrop, 0, joints);
  const th = L.thigh;
  addMesh(hip, taperedCapsule(th.rTop, th.rBottom, th.length), m.pants);
  const knee = addJoint(hip, "knee" + s, 0, -th.length, 0, joints);
  const sh = L.shin;
  addMesh(knee, taperedCapsule(sh.rTop, sh.rBottom, sh.length), m.skin);
  addMesh(knee, taperedCapsule(sh.rTop + 0.006, sh.rTop - 0.004, 0.19), m.pants, { y: 0.02 });   // capri leg to mid-shin
  const ankle = addJoint(knee, "ankle" + s, 0, -sh.length, 0, joints);
  const f = L.foot;
  // capsule along Y → rotated onto Z; local z becomes world y, so `sz` flattens the shoe
  addMesh(ankle, new THREE.CapsuleGeometry(f.radius, f.length, 4, 12), m.shoe, { y: -f.drop, z: f.forward, rx: Math.PI / 2, sz: 0.75 });
  addMesh(ankle, new THREE.TorusGeometry(0.048, 0.006, 6, 16), m.orange, { y: -0.02, rx: Math.PI / 2, sy: 0.85 });
}
