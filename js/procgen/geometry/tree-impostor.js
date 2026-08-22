// Impostor baking for LOD 2: paints the LOD-0 skeleton (trunk, branches, foliage cards) as a side
// view into a canvas – a software "render" with the same foliage atlas the real cards use – and
// returns the texture plus the metre extents needed for the crossed quads.
import * as THREE from "three";
import { createCanvas, cssRgb, canvasToBledTexture, lerp } from "../textures/tree-texture-utils.js";
import { ROOT_DEPTH } from "./tree-skeleton.js";

const LIGHT = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();
const _n = new THREE.Vector3();

/**
 * @param {{ skeleton, atlas:{canvas, tiles}, spec, barkRgb:number[], size?:number }} o
 * @returns {{ texture: THREE.Texture, canvas, widthMetres:number, yMin:number, yMax:number }}
 */
export function bakeImpostor({ skeleton, atlas, spec, barkRgb, size = 512 }) {
  const cards = skeleton.cards;
  let xMax = skeleton.trunkRadius * 2, yMax = skeleton.height + 0.2;
  for (const c of cards) {
    xMax = Math.max(xMax, Math.abs(c.pos.x) + c.size * 0.5, Math.abs(c.pos.z) + c.size * 0.5);
    yMax = Math.max(yMax, c.pos.y + c.size * 0.5);
  }
  const widthMetres = xMax * 2 * 1.02, yMin = -ROOT_DEPTH;
  const heightMetres = yMax - yMin;
  const W = size, H = Math.min(size * 2, Math.max(size / 2, Math.round((size * heightMetres) / widthMetres)));
  const ppm = Math.min(W / widthMetres, H / heightMetres);
  const { canvas, ctx } = createCanvas(W, H);
  ctx.lineCap = "round";
  const sx = (x) => W / 2 + x * ppm;
  const sy = (y) => H - (y - yMin) * ppm;

  // depth-sorted draw list: tubes by mean z, cards by z
  const items = [];
  for (const tube of skeleton.tubes) {
    const mid = tube.curve.getPointAt(0.5);
    items.push({ z: mid.z, tube });
  }
  for (const card of cards) items.push({ z: card.pos.z, card });
  items.sort((a, b) => a.z - b.z);

  const tileSize = atlas.canvas.width / Math.sqrt(atlas.tiles);
  const hasFilter = "filter" in ctx;
  const tintAt = (y) => {
    const f = THREE.MathUtils.clamp(y / skeleton.height, 0, 1);
    return [lerp(spec.trunkTintLow[0], spec.trunkTintHigh[0], f) * barkRgb[0], lerp(spec.trunkTintLow[1], spec.trunkTintHigh[1], f) * barkRgb[1], lerp(spec.trunkTintLow[2], spec.trunkTintHigh[2], f) * barkRgb[2]];
  };

  for (const item of items) {
    if (item.tube) {
      const tube = item.tube, steps = 10;
      let prev = tube.curve.getPointAt(0);
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const p = tube.curve.getPointAt(t);
        const r = tube.radiusAt((s - 0.5) / steps);
        const shade = 0.75 + 0.25 * (1 - Math.min(1, Math.abs(p.z) / (skeleton.crownRadius + 0.5)));
        const c = tintAt(p.y);
        ctx.strokeStyle = cssRgb([c[0] * shade, c[1] * shade, c[2] * shade]);
        ctx.lineWidth = Math.max(1, 2 * r * ppm);
        ctx.beginPath(); ctx.moveTo(sx(prev.x), sy(prev.y)); ctx.lineTo(sx(p.x), sy(p.y)); ctx.stroke();
        prev = p;
      }
      continue;
    }
    const card = item.card;
    _n.set((card.pos.x - skeleton.crownCenter.x) / skeleton.crownRadius, (card.pos.y - skeleton.crownCenter.y) / skeleton.crownHalfHeight, (card.pos.z - skeleton.crownCenter.z) / skeleton.crownRadius);
    const lit = _n.lengthSq() > 1e-6 ? THREE.MathUtils.clamp(_n.normalize().dot(LIGHT), -1, 1) : 0;
    const brightness = THREE.MathUtils.clamp(card.shade * (0.78 + 0.32 * lit), 0.35, 1.25);
    const w = card.size * ppm * 0.86;
    const tx = (card.tile % 2) * tileSize, ty = Math.floor(card.tile / 2) * tileSize;
    ctx.save();
    ctx.translate(sx(card.pos.x), sy(card.pos.y));
    ctx.rotate(card.roll);
    if (hasFilter) ctx.filter = `brightness(${brightness.toFixed(3)})`;
    ctx.drawImage(atlas.canvas, tx, ty, tileSize, tileSize, -w / 2, -w / 2, w, w);
    ctx.restore();
  }
  const texture = canvasToBledTexture(canvas, { passes: 6 });
  return { texture, canvas, widthMetres, yMin, yMax };
}
