// Small procedural forest-floor assets: geometries (stones, root arches, twigs, grass tufts, leaf
// clumps) and their little canvas textures. Pure asset factory – scattering lives in world/ground-detail.js.
import * as THREE from "three";
import { Rng, makeNoise2D } from "../../core/rng.js";
import {
  makeCanvas, canvasToTexture, heightToNormalCanvas, fillTileableNoise, addGrain, drawWrapped, rgb, hexToRgb,
} from "../textures/texture-utils.js";
import { LEAF_COLOURS, paintLeaf } from "../textures/ground.js";

export const PROPS = Object.freeze({
  tuftHeight: 0.38, tuftWidth: 0.42,   // metres (unscaled)
  clumpSize: 0.7,
  rootLength: 2.4, rootRadius: 0.11,
  twigLength: 0.75, twigRadius: 0.018,
});

const texCache = new Map();
const cached = (key, make) => { if (!texCache.has(key)) texCache.set(key, make()); return texCache.get(key); };

// ---------------------------------------------------------------------------------------------
// geometry helpers

/** Concatenates indexed geometries that share position/normal/uv attributes. */
export function mergeGeometries(geometries) {
  let vCount = 0, iCount = 0;
  for (const g of geometries) { vCount += g.attributes.position.count; iCount += g.index.count; }
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0, io = 0;
  for (const g of geometries) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/** Tube along a Catmull-Rom curve with a radius function of t (same layout/winding as TubeGeometry). */
export function makeTaperedTube(points, radiusFn, tubularSegments = 16, radialSegments = 6) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions = [], normals = [], uvs = [], indices = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, P);
    const r = radiusFn(t), nrm = frames.normals[i], bin = frames.binormals[i];
    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2, sin = Math.sin(v), cos = -Math.cos(v);
      N.set(cos * nrm.x + sin * bin.x, cos * nrm.y + sin * bin.y, cos * nrm.z + sin * bin.z).normalize();
      positions.push(P.x + r * N.x, P.y + r * N.y, P.z + r * N.z);
      normals.push(N.x, N.y, N.z);
      uvs.push(j / radialSegments, t * 3);
    }
  }
  for (let j = 1; j <= tubularSegments; j++) {
    for (let i = 1; i <= radialSegments; i++) {
      const a = (radialSegments + 1) * (j - 1) + (i - 1), b = (radialSegments + 1) * j + (i - 1);
      const c = (radialSegments + 1) * j + i, d = (radialSegments + 1) * (j - 1) + i;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/**
 * Rounded, noise-displaced, flattened stone (radius ≈ 1, smooth normals). `segments` is the
 * triangle budget: a 5–14 cm pebble never covers enough pixels to pay for the default ring count.
 */
export function createStoneGeometry(rng, { flatten = 0.6, roughness = 0.3, segments = [14, 10] } = {}) {
  const geo = new THREE.SphereGeometry(1, segments[0], segments[1]);
  const noise = makeNoise2D(rng.fork("stone").seed);
  const off = rng.float(0, 50), pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = noise(v.x * 1.2 + off, v.z * 1.2 + v.y * 0.8) + 0.5 * noise(v.x * 3 + 4 + off, v.y * 3);
    v.multiplyScalar(1 + roughness * n);
    v.y *= flatten;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Root breaching the ground: arch along +x, thick end at -x, dipping below y = 0 at both ends. */
export function createRootGeometry(rng) {
  const L = PROPS.rootLength, n = 7, pts = [];
  const rise = rng.float(0.2, 0.32);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3(-L / 2 + t * L, -0.12 + Math.sin(t * Math.PI) * rise, Math.sin(t * Math.PI * 2) * rng.float(0.04, 0.14)));
  }
  return makeTaperedTube(pts, (t) => PROPS.rootRadius * (1 - 0.65 * t), 22, 7);
}

/** Fallen twig with a side branch, lying almost flat. */
export function createTwigGeometry(rng) {
  const L = PROPS.twigLength, R = PROPS.twigRadius;
  const main = makeTaperedTube([
    new THREE.Vector3(-L / 2, 0.02, 0), new THREE.Vector3(-L / 6, 0.05, rng.float(-0.03, 0.03)),
    new THREE.Vector3(L / 6, 0.035, rng.float(-0.03, 0.03)), new THREE.Vector3(L / 2, 0.015, 0),
  ], (t) => R * (1 - 0.6 * t), 10, 5);
  const side = makeTaperedTube([
    new THREE.Vector3(-L * 0.1, 0.045, 0), new THREE.Vector3(L * 0.05, 0.05, 0.12), new THREE.Vector3(L * 0.15, 0.02, 0.24),
  ], (t) => R * 0.6 * (1 - 0.6 * t), 6, 5);
  return mergeGeometries([main, side]);
}

/** Three crossed, upright cards (2 height segments so the wind can bend them); normals point up. */
export function createTuftGeometry() {
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const p = new THREE.PlaneGeometry(PROPS.tuftWidth, PROPS.tuftHeight, 1, 2);
    p.translate(0, PROPS.tuftHeight / 2, 0);
    p.rotateY((k * Math.PI) / 3);
    parts.push(p);
  }
  const geo = mergeGeometries(parts);
  const nor = geo.attributes.normal;
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, 1, 0);
  return geo;
}

/** Flat card lying on the ground (normal +y). */
export function createLeafClumpGeometry() {
  const p = new THREE.PlaneGeometry(PROPS.clumpSize, PROPS.clumpSize);
  p.rotateX(-Math.PI / 2);
  return p;
}

// ---------------------------------------------------------------------------------------------
// textures (256², cached per seed)

export function getStoneTexture(seed) {
  return cached(`stone:${seed}`, () => {
    const rng = new Rng(`stone:${seed}`), size = 256;
    const a = makeCanvas(size), h = makeCanvas(size), ac = a.getContext("2d"), hc = h.getContext("2d");
    fillTileableNoise(ac, rng, { scale: 4, octaves: 4, colorA: hexToRgb("#6f6b60"), colorB: hexToRgb("#a29c8d") });
    fillTileableNoise(hc, rng, { scale: 4, octaves: 5, colorA: [90, 90, 90], colorB: [150, 150, 150] });
    for (let i = 0; i < 900; i++) {                          // mineral speckle
      const x = rng.float(0, size), y = rng.float(0, size), r = rng.float(0.6, 2), dark = rng.bool(0.55);
      drawWrapped(ac, size, x, y, r, (c) => { c.fillStyle = dark ? "rgba(40,36,30,0.55)" : "rgba(230,225,210,0.5)"; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); });
    }
    for (let i = 0; i < 6; i++) {                            // lichen patches
      const x = rng.float(0, size), y = rng.float(0, size), r = rng.float(10, 26);
      drawWrapped(ac, size, x, y, r, (c) => { const g = c.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, "rgba(160,170,90,0.55)"); g.addColorStop(1, "rgba(160,170,90,0)"); c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); });
    }
    addGrain(ac, rng, 0.05);
    return { map: canvasToTexture(a, { srgb: true }), normalMap: canvasToTexture(heightToNormalCanvas(h, 1.6)) };
  });
}

export function getRootBarkTexture(seed) {
  return cached(`rootbark:${seed}`, () => {
    const rng = new Rng(`rootbark:${seed}`), size = 256;
    const a = makeCanvas(size), h = makeCanvas(size), ac = a.getContext("2d"), hc = h.getContext("2d");
    fillTileableNoise(ac, rng, { scale: 3, octaves: 4, colorA: hexToRgb("#3e2c1c"), colorB: hexToRgb("#6b4f33") });
    fillTileableNoise(hc, rng, { scale: 3, octaves: 4, colorA: [80, 80, 80], colorB: [130, 130, 130] });
    for (let i = 0; i < 90; i++) {                           // striations along v
      const x = rng.float(0, size), y = rng.float(0, size), len = rng.float(40, 160), w = rng.float(1, 3), light = rng.bool(0.4);
      drawWrapped(ac, size, x, y, len / 2, (c) => { c.strokeStyle = light ? "rgba(140,110,80,0.5)" : "rgba(30,20,12,0.6)"; c.lineWidth = w; c.beginPath(); c.moveTo(0, -len / 2); c.quadraticCurveTo(rng.float(-4, 4), 0, 0, len / 2); c.stroke(); });
      drawWrapped(hc, size, x, y, len / 2, (c) => { c.strokeStyle = light ? "rgb(170,170,170)" : "rgb(60,60,60)"; c.lineWidth = w; c.beginPath(); c.moveTo(0, -len / 2); c.lineTo(0, len / 2); c.stroke(); });
    }
    addGrain(ac, rng, 0.05);
    return { map: canvasToTexture(a, { srgb: true }), normalMap: canvasToTexture(heightToNormalCanvas(h, 2.2)) };
  });
}

/** Alpha card: a fan of grass blades growing from the bottom edge. */
export function getGrassCardTexture(seed) {
  return cached(`grass:${seed}`, () => {
    const rng = new Rng(`grass:${seed}`), size = 256;
    const canvas = makeCanvas(size), ctx = canvas.getContext("2d");
    const greens = ["#4f6f27", "#5f8230", "#6f963a", "#86a848", "#9db853"].map(hexToRgb);
    const dry = ["#a89a52", "#b8ac5c", "#8f8a48"].map(hexToRgb);
    for (let i = 0; i < 38; i++) {
      const bx = size / 2 + rng.float(-34, 34), tipX = bx + rng.float(-95, 95), tipY = size - rng.float(135, 250);
      const w = rng.float(6, 12), bend = rng.float(-40, 40), col = rng.bool(0.22) ? rng.pick(dry) : rng.pick(greens);
      const g = ctx.createLinearGradient(0, size, 0, tipY);
      g.addColorStop(0, rgb(col.map((v) => v * 0.55)));
      g.addColorStop(0.55, rgb(col));
      g.addColorStop(1, rgb(col.map((v) => v * 1.2)));
      const cx = (bx + tipX) / 2 + bend, cy = (size + tipY) / 2;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(bx - w / 2, size);
      ctx.quadraticCurveTo(cx - w / 2, cy, tipX, tipY);
      ctx.quadraticCurveTo(cx + w / 2, cy, bx + w / 2, size);
      ctx.closePath();
      ctx.fill();
    }
    const tex = canvasToTexture(canvas, { srgb: true, wrap: false });
    tex.premultiplyAlpha = false;
    return tex;
  });
}

/** Alpha card: a small pile of dry leaves seen from above (breaks the litter tiling). */
export function getLeafClumpTexture(seed) {
  return cached(`leafclump:${seed}`, () => {
    const rng = new Rng(`leafclump:${seed}`), size = 256;
    const canvas = makeCanvas(size), ctx = canvas.getContext("2d");
    const kinds = ["beech", "oak", "maple"];
    for (let i = 0; i < 9; i++) {
      const L = rng.float(60, 100), kind = rng.pick(kinds), W = kind === "maple" ? L * 0.95 : L * rng.float(0.45, 0.6);
      const r = rng.float(0, 55), a = rng.float(0, Math.PI * 2);
      ctx.save();
      ctx.translate(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r);
      ctx.rotate(rng.float(0, Math.PI * 2));
      paintLeaf(ctx, rng, kind, L, W, rng.pick(LEAF_COLOURS), rng.float(0.8, 1.05));
      ctx.restore();
    }
    return canvasToTexture(canvas, { srgb: true, wrap: false });
  });
}
