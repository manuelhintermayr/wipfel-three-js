// Climbing gear for the rig: full-body harness (dark webbing with orange accents), Y-lanyard with two
// roller carabiners, zipline trolley on the hip, plus the attach anchors that gameplay uses.
// Coordinates are relative to the joint the piece is parented to (see rig-body.js LAYOUT).

import * as THREE from "three";
import { addMesh, addAnchor, LAYOUT } from "./rig-body.js";

// Buckles, D-rings and webbing are 1–5 cm wide; one sun-shadow texel is ~3.4 cm (2048 map over a
// 70 m box), so their shadows never resolve – but each one would cost a draw call in the shadow pass.
const addGear = (parent, geometry, material, o) => addMesh(parent, geometry, material, { ...o, castShadow: false });

const HALF_PI = Math.PI / 2;

/** Horizontal webbing ring: torus laid flat, oval (sx/sz) and taller than thick (`tall`). */
function strapRing(radius, tube, sx = 1, sz = 1, tall = 1.5) {
  const g = new THREE.TorusGeometry(radius, tube, 8, 48);
  g.rotateX(HALF_PI);
  g.scale(sx, tall, sz);
  return g;
}

function tubeAlong(points, radius, segments = 32) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, segments, radius, 6, false);
}

/** Waist belt, buckle, belay ring, leg loops (on the thighs), shoulder straps crossing the back. */
export function addHarness(joints, m, attach) {
  const T = LAYOUT.torsoScale;
  const pelvis = joints.pelvis;
  const beltY = 0.075;                                                     // world ≈ 0.995
  addGear(pelvis, strapRing(0.152, 0.011, T.x * 0.97, T.z * 0.99), m.webbing, { y: beltY });
  addGear(pelvis, strapRing(0.159, 0.005, T.x * 0.97, T.z * 0.99, 1.0), m.orange, { y: beltY });
  addGear(pelvis, new THREE.BoxGeometry(0.045, 0.03, 0.012), m.metal, { x: 0.075, y: beltY, z: 0.12, ry: 0.35 });
  addGear(pelvis, new THREE.TorusGeometry(0.02, 0.005, 6, 18), m.metal, { y: 0.06, z: 0.135 });
  attach.hipsFront = addAnchor(pelvis, "hipsFront", 0, 0.045, 0.14);

  for (const side of [1, -1]) {
    const hip = joints[side > 0 ? "hipL" : "hipR"];
    addGear(hip, strapRing(0.083, 0.010), m.orange, { y: -0.09 });
    addGear(hip, strapRing(0.089, 0.004, 1, 1, 1.0), m.webbing, { y: -0.09 });
    addGear(hip, new THREE.BoxGeometry(0.024, 0.16, 0.008), m.webbing, { y: -0.01, z: 0.076 });
  }

  const chest = joints.chest;
  const cy = LAYOUT.pelvisY + LAYOUT.spineUp + LAYOUT.chestUp;               // chest joint world y (1.20)
  for (const side of [1, -1]) {
    const s = side;
    // over the shoulder, crossing on the back to the opposite hip
    const pts = [
      [s * 0.075, 0.99 - cy, 0.122], [s * 0.085, 1.10 - cy, 0.128], [s * 0.092, 1.25 - cy, 0.136],
      [s * 0.10, 1.38 - cy, 0.112], [s * 0.108, 1.455 - cy, 0.02], [s * 0.095, 1.39 - cy, -0.10],
      [s * 0.02, 1.28 - cy, -0.132], [-s * 0.06, 1.15 - cy, -0.122], [-s * 0.085, 1.00 - cy, -0.108],
    ];
    addGear(chest, tubeAlong(pts, 0.012, 40), m.orange);
  }
  addGear(chest, new THREE.BoxGeometry(0.2, 0.026, 0.008), m.webbing, { y: 1.29 - cy, z: 0.138 });   // chest connector
  addGear(chest, new THREE.BoxGeometry(0.03, 0.03, 0.012), m.metal, { y: 1.29 - cy, z: 0.14 });
  addGear(chest, new THREE.TorusGeometry(0.018, 0.004, 6, 16), m.metal, { y: 1.28 - cy, z: -0.14 });   // back D-ring
  attach.back = addAnchor(chest, "back", 0, 1.28 - cy, -0.145);
}

/** Small oval carabiner with a roller wheel on top (Saferoller style). Faces ±X. */
function buildCarabiner(m) {
  const g = new THREE.Group();
  addGear(g, new THREE.TorusGeometry(0.03, 0.0055, 8, 24), m.metal, { ry: HALF_PI, sx: 1, sy: 1.3, sz: 0.72 });
  addGear(g, new THREE.CylinderGeometry(0.0045, 0.0045, 0.05, 6), m.metal, { z: 0.019, y: -0.006 });   // gate
  addGear(g, new THREE.CylinderGeometry(0.011, 0.011, 0.012, 12), m.metal, { y: 0.028, rz: HALF_PI });
  return g;
}

/** Y-lanyard hanging from the belay ring; returns the swinging group (secondary motion). */
export function addLanyard(attach, m) {
  const group = new THREE.Group();
  group.name = "lanyard";
  attach.hipsFront.add(group);
  for (const side of [1, -1]) {
    addGear(group, tubeAlong([[0, 0, 0], [side * 0.035, -0.06, 0.045], [side * 0.058, -0.13, 0.065]], 0.006, 12), m.rope);
    const k = buildCarabiner(m);
    k.position.set(side * 0.06, -0.165, 0.068);
    k.rotation.z = side * 0.15;
    group.add(k);
  }
  return group;
}

/** Zipline trolley (two rollers between orange side plates) clipped to the right hip. */
export function addTrolley(joints, m) {
  const g = new THREE.Group();
  g.name = "trolley";
  g.position.set(-0.205, 0.035, 0.03);        // right hip, just outside the belt
  g.rotation.y = -0.2;
  joints.pelvis.add(g);
  addGear(g, new THREE.BoxGeometry(0.01, 0.06, 0.02), m.webbing, { y: 0.06 });               // sling to the belt
  addGear(g, new THREE.TorusGeometry(0.02, 0.004, 6, 16), m.metal, { y: 0.03, ry: HALF_PI, sy: 1.25 });
  addGear(g, new THREE.BoxGeometry(0.02, 0.07, 0.085), m.metal, { y: -0.02 });                 // frame
  for (const side of [1, -1]) addGear(g, new THREE.BoxGeometry(0.005, 0.075, 0.105), m.orange, { x: side * 0.014, y: -0.02 });
  for (const z of [-0.028, 0.028]) addGear(g, new THREE.CylinderGeometry(0.03, 0.03, 0.03, 16), m.metal, { y: 0.0, z, rz: HALF_PI });
  return g;
}
