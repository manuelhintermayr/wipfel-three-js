// Tree skeletons: trunk spline, L-system-like branches (whorls for pines, main limbs for broadleaves,
// multiple stems for hazel) and the foliage-card layout. Pure data – no three.js geometry here, so
// the same skeleton feeds all LODs and the impostor baker. Deterministic via the passed Rng.
import * as THREE from "three";
import { TREE_SPECIES } from "./tree-species.js";

export const ROOT_DEPTH = 0.35;           // trunk starts this far below ground (root flare sinks in)
const GOLDEN_ANGLE = 2.39996;
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();

/**
 * @param {{ rng: import("../../core/rng.js").Rng, species: string, height: number, trunkRadius: number }} o
 */
export function buildTreeSkeleton({ rng, species, height, trunkRadius }) {
  const spec = TREE_SPECIES[species];
  const crownBaseY = spec.crownBase * height;
  const skel = {
    species, spec, height, trunkRadius,
    crownRadius: spec.crownRadius * height,
    crownBaseY,
    crownCenter: new THREE.Vector3(0, (crownBaseY + height) / 2, 0),
    crownHalfHeight: (height - crownBaseY) / 2,
    tubes: [],   // { curve, radiusAt(t), length, level, baseRadius }
    tips: [],    // Vector3 – branch ends where foliage clusters hang
    cards: [],   // { pos, normal, roll, size, tile, sway, phase, shade, lodRank, top }
  };
  const rTrunk = rng.fork("trunk"), rBranch = rng.fork("branches"), rCards = rng.fork("cards");
  if (spec.branching.kind === "stems") {
    buildStems(skel, spec, rTrunk, rBranch);
  } else {
    const trunk = buildTrunk(skel, spec, rTrunk);
    if (spec.branching.kind === "whorls") buildWhorls(skel, spec, trunk, rBranch);
    else buildMainLimbs(skel, spec, trunk, rBranch);
  }
  if (spec.cards.orientation === "plates") layoutPlateCards(skel, spec, rCards);
  else layoutCrownCards(skel, spec, rCards);
  return skel;
}

/** Radius helper shared by trunk + branches: tapered, with a root flare near the ground. */
function makeTrunkRadius(R, taper, topY, height) {
  return (t) => {
    const y = -ROOT_DEPTH + t * (topY + ROOT_DEPTH);
    const f = Math.min(1, Math.max(0, y / height));
    const flare = 1 + 0.65 * Math.exp(-Math.max(0, y) / 0.6);
    return Math.max(0.03, R * Math.pow(1 - f, taper) * flare);
  };
}

function makeTube(points, radiusAt, level) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const tube = { curve, radiusAt, length: curve.getLength(), level, baseRadius: radiusAt(0) };
  return tube;
}

function buildTrunk(skel, spec, rng) {
  const H = skel.height;
  const topY = spec.branching.kind === "whorls" ? H : (spec.branching.trunkTop + 0.15) * H;
  const leanDir = rng.float(0, Math.PI * 2), wobbleDir = leanDir + Math.PI / 2, wobblePhase = rng.float(0, Math.PI * 2);
  const lean = spec.lean * H * rng.float(0.5, 1.3), wobble = spec.wobble * H * rng.float(0.5, 1.2);
  const points = [];
  const n = 6;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const y = -ROOT_DEPTH + t * (topY + ROOT_DEPTH);
    const l = lean * Math.pow(t, 1.7), w = wobble * Math.sin(t * Math.PI * 1.5 + wobblePhase) * t;
    points.push(new THREE.Vector3(Math.cos(leanDir) * l + Math.cos(wobbleDir) * w, y, Math.sin(leanDir) * l + Math.sin(wobbleDir) * w));
  }
  const tube = makeTube(points, makeTrunkRadius(skel.trunkRadius, spec.taper, topY, H), 0);
  tube.topY = topY;
  skel.tubes.push(tube);
  if (spec.branching.kind === "whorls") skel.tips.push(points[n].clone());
  return tube;
}

/** Point on the trunk axis at world height y. */
function trunkPointAt(trunk, y, out) {
  const t = THREE.MathUtils.clamp((y + ROOT_DEPTH) / (trunk.topY + ROOT_DEPTH), 0, 1);
  return trunk.curve.getPointAt(t, out);
}
function trunkRadiusAtY(trunk, y) {
  return trunk.radiusAt(THREE.MathUtils.clamp((y + ROOT_DEPTH) / (trunk.topY + ROOT_DEPTH), 0, 1));
}

/** Distance from (0, y0) along direction (cos e horizontally, sin e up) to the crown ellipsoid. */
function reachToEnvelope(skel, y0, elevation) {
  const rx = skel.crownRadius, ry = skel.crownHalfHeight, dy = y0 - skel.crownCenter.y;
  const c = Math.cos(elevation), s = Math.sin(elevation);
  const A = (c * c) / (rx * rx) + (s * s) / (ry * ry);
  const B = (2 * s * dy) / (ry * ry);
  const C = (dy * dy) / (ry * ry) - 1;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return rx * 0.5;
  return Math.max(0.5, (-B + Math.sqrt(disc)) / (2 * A));
}

/** Grows a curved branch tube from `origin` along `dir`, curling upwards, and returns it. */
function growBranch(skel, origin, dir, length, radius0, curl, level, rng) {
  const points = [origin.clone()];
  const d = dir.clone().normalize();
  const steps = 3;
  const p = origin.clone();
  for (let s = 0; s < steps; s++) {
    p.addScaledVector(d, length / steps);
    points.push(p.clone());
    d.y += curl * (0.6 + 0.8 * rng.next());
    d.applyAxisAngle(UP, rng.float(-0.12, 0.12));
    d.normalize();
  }
  const r0 = radius0;
  const tube = makeTube(points, (t) => Math.max(0.02, r0 * Math.pow(1 - t, 1.1) + 0.012), level);
  skel.tubes.push(tube);
  skel.tips.push(points[steps].clone());
  return tube;
}

function growChildren(skel, spec, parent, parentLength, count, rng, level) {
  for (let j = 0; j < count; j++) {
    const t = 0.4 + 0.5 * ((j + rng.float(0.2, 0.8)) / count);
    const origin = parent.curve.getPointAt(t);
    const dir = parent.curve.getTangentAt(t);
    dir.applyAxisAngle(UP, (j % 2 === 0 ? 1 : -1) * rng.float(0.55, 0.95));
    dir.y += rng.float(0.15, 0.4);
    const len = parentLength * rng.float(0.35, 0.55) * (1 - 0.4 * t);
    growBranch(skel, origin, dir, len, parent.radiusAt(t) * 0.6, spec.branching.curl * 0.8, level, rng);
    if (level === 2) skel.tips.push(parent.curve.getPointAt(Math.min(1, t + 0.25)));
  }
}

// --- broadleaf: 4–7 main limbs from the trunk into a rounded crown ------------------------------
function buildMainLimbs(skel, spec, trunk, rng) {
  const b = spec.branching, H = skel.height;
  const n = rng.int(b.count[0], b.count[1]);
  const y0 = skel.crownBaseY, y1 = b.trunkTop * H;
  const a0 = rng.float(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const y = y0 + (y1 - y0) * (f + rng.float(-0.3, 0.3) / n);
    const az = a0 + i * GOLDEN_ANGLE + rng.float(-0.3, 0.3);
    const el = THREE.MathUtils.lerp(b.elevationLow, b.elevationHigh, f) + rng.float(-0.1, 0.1);
    const reach = reachToEnvelope(skel, y, el) * rng.float(0.82, 0.98);
    const origin = trunkPointAt(trunk, y, new THREE.Vector3());
    const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    const radius = trunkRadiusAtY(trunk, y) * b.radiusRatio * rng.float(0.85, 1.15);
    const limb = growBranch(skel, origin, dir, reach, radius, b.curl, 1, rng);
    growChildren(skel, spec, limb, reach, rng.int(b.children[0], b.children[1]), rng, 2);
  }
}

// --- pine: whorls of near-horizontal branches in the top 40 % – umbrella crown ------------------
function buildWhorls(skel, spec, trunk, rng) {
  const b = spec.branching, H = skel.height;
  const whorls = rng.int(b.whorls[0], b.whorls[1]);
  const y0 = skel.crownBaseY, y1 = H - 1.2;
  for (let k = 0; k < whorls; k++) {
    const f = (k + 0.5) / whorls;
    const y = y0 + (y1 - y0) * (f + rng.float(-0.25, 0.25) / whorls);
    const m = rng.int(b.perWhorl[0], b.perWhorl[1]);
    const rot = rng.float(0, Math.PI * 2);
    const envelope = skel.crownRadius * Math.pow(1 - f, 0.45) * (0.82 + 0.18 * Math.min(1, f / 0.35));
    for (let i = 0; i < m; i++) {
      const az = rot + (i / m) * Math.PI * 2 + rng.float(-0.25, 0.25);
      const el = THREE.MathUtils.lerp(b.elevationLow, b.elevationHigh, Math.pow(f, 1.2)) + rng.float(-0.12, 0.12);
      const reach = (envelope / Math.max(0.35, Math.cos(el))) * rng.float(0.85, 1.05);
      const origin = trunkPointAt(trunk, y, new THREE.Vector3());
      const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
      const radius = trunkRadiusAtY(trunk, y) * b.radiusRatio * rng.float(0.8, 1.2);
      const limb = growBranch(skel, origin, dir, reach, radius, b.curl * (0.6 + f), 1, rng);
      if (reach > 2.2) growChildren(skel, spec, limb, reach, rng.int(b.children[0], b.children[1]), rng, 2);
    }
  }
}

// --- hazel: several thin stems from a common base, arching outwards ----------------------------
function buildStems(skel, spec, rTrunk, rBranch) {
  const b = spec.branching, H = skel.height, R = skel.trunkRadius;
  const stems = rTrunk.int(b.stems[0], b.stems[1]);
  const a0 = rTrunk.float(0, Math.PI * 2);
  for (let i = 0; i < stems; i++) {
    const az = a0 + (i / stems) * Math.PI * 2 + rTrunk.float(-0.4, 0.4);
    const spread = b.spread * rTrunk.float(0.3, 1);
    const el = rTrunk.float(b.elevationLow, b.elevationHigh);
    const top = H * rTrunk.float(0.75, 1.0);
    const len = top / Math.sin(el);
    const origin = new THREE.Vector3(Math.cos(az) * spread, -0.25, Math.sin(az) * spread);
    const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    const stem = growBranch(skel, origin, dir, len, R * rTrunk.float(0.8, 1.2), b.curl, 0, rTrunk);
    stem.topY = top;
    growChildren(skel, spec, stem, len, rBranch.int(b.children[0], b.children[1]), rBranch, 1);
    for (let s = 0.55; s < 0.95; s += 0.2) skel.tips.push(stem.curve.getPointAt(s));
  }
}

// --- foliage cards -----------------------------------------------------------------------------
function cardCount(skel, spec) {
  const [lo, hi] = spec.height;
  const f = Math.pow(skel.height / ((lo + hi) / 2), 1.2);
  return Math.round(THREE.MathUtils.lerp(spec.cards.count[0], spec.cards.count[1], 0.5) * THREE.MathUtils.clamp(f, 0.7, 1.4));
}

function randomUnit(rng, out) {
  const z = rng.float(-1, 1), a = rng.float(0, Math.PI * 2), r = Math.sqrt(1 - z * z);
  return out.set(r * Math.cos(a), z, r * Math.sin(a));
}

function pushCard(skel, spec, rng, pos, normal, size, shade, sway) {
  const c = skel.crownCenter;
  const top = THREE.MathUtils.clamp((pos.y - c.y) / skel.crownHalfHeight, -1, 1);
  skel.cards.push({
    pos, normal, roll: rng.float(0, Math.PI * 2), size, tile: rng.int(0, 3),
    sway, phase: rng.float(0, 6.283), shade: shade * rng.float(0.92, 1.08), top, lodRank: rng.next(),
  });
}

/** Broadleaves: cards near branch tips + cards filling the outer crown ellipsoid. */
function layoutCrownCards(skel, spec, rng) {
  const N = cardCount(skel, spec), c = skel.crownCenter, rx = skel.crownRadius, ry = skel.crownHalfHeight;
  const [sLo, sHi] = spec.cards.size;
  const tipCards = Math.round(N * spec.cards.tipFraction);
  for (let i = 0; i < N; i++) {
    const pos = new THREE.Vector3();
    if (i < tipCards && skel.tips.length) {
      pos.copy(rng.pick(skel.tips)).add(_v.set(rng.gaussian(0, 0.55), rng.gaussian(0, 0.45), rng.gaussian(0, 0.55)));
    } else {
      randomUnit(rng, pos);
      const f = 0.42 + 0.58 * Math.pow(rng.next(), 0.45);
      pos.set(c.x + pos.x * rx * f, c.y + pos.y * ry * f, c.z + pos.z * rx * f);
    }
    // keep inside a slightly inflated envelope
    _v.set((pos.x - c.x) / rx, (pos.y - c.y) / ry, (pos.z - c.z) / rx);
    const outer = _v.length();
    if (outer > 1.08) { _v.multiplyScalar(1.08 / outer); pos.set(c.x + _v.x * rx, c.y + _v.y * ry, c.z + _v.z * rx); }
    if (pos.y < skel.crownBaseY - 0.5) pos.y = skel.crownBaseY - 0.5 + rng.float(0, 0.6);
    const outerness = Math.min(1, outer);
    const shade = 0.5 + 0.5 * outerness;
    const heightF = THREE.MathUtils.clamp((pos.y - skel.crownBaseY) / (skel.height - skel.crownBaseY), 0, 1);
    const sway = (0.35 + 0.65 * Math.pow(heightF, 1.1)) * (0.6 + 0.4 * outerness);
    pushCard(skel, spec, rng, pos, randomUnit(rng, new THREE.Vector3()), rng.float(sLo, sHi), shade, sway);
  }
}

/** Pines: needle plates along the outer part of every crown branch, mostly horizontal. */
function layoutPlateCards(skel, spec, rng) {
  const N = cardCount(skel, spec);
  const [sLo, sHi] = spec.cards.size;
  const branches = skel.tubes.filter((t) => t.level > 0);
  const total = branches.reduce((s, t) => s + t.length, 0) || 1;
  const tangent = new THREE.Vector3(), lateral = new THREE.Vector3(), tilt = new THREE.Vector3();
  for (const br of branches) {
    const count = Math.max(2, Math.round((N * br.length) / total));
    for (let j = 0; j < count; j++) {
      const t = 0.32 + 0.68 * ((j + rng.float(0.1, 0.9)) / count);
      const pos = br.curve.getPointAt(t);
      br.curve.getTangentAt(t, tangent);
      lateral.crossVectors(tangent, UP).normalize();
      pos.addScaledVector(UP, 0.05 + 0.3 * rng.next()).addScaledVector(lateral, rng.gaussian(0, 0.45)).addScaledVector(tangent, rng.gaussian(0, 0.25));
      const normal = new THREE.Vector3(0, 1, 0);
      if (rng.next() < 0.68) {
        tilt.set(rng.float(-1, 1), 0, rng.float(-1, 1)).normalize();
        normal.applyAxisAngle(tilt, rng.float(0.05, 0.6));
      } else {
        randomUnit(rng, normal);
      }
      const size = rng.float(sLo, sHi) * (0.8 + 0.4 * t);
      const heightF = THREE.MathUtils.clamp(pos.y / skel.height, 0, 1);
      pushCard(skel, spec, rng, pos, normal, size, 0.55 + 0.45 * t, (0.4 + 0.6 * t) * (0.5 + 0.5 * heightF));
    }
  }
  // leader tuft at the very top
  const top = skel.tips[0] || new THREE.Vector3(0, skel.height, 0);
  for (let k = 0; k < 8; k++) {
    const pos = top.clone().add(_v.set(rng.gaussian(0, 0.5), rng.float(-1.4, 0.1), rng.gaussian(0, 0.5)));
    pushCard(skel, spec, rng, pos, randomUnit(rng, new THREE.Vector3()), rng.float(sLo, sHi) * 0.7, 0.9, 1.0);
  }
}
