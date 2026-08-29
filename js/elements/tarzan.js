// Tarzansprung – a short gap (2.5–3.5 m) with a rope hanging from an overhead pivot at mid-span,
// swinging on its own for good, and a catch net on the far side. GDD §3.4 "Tarzansprung: Anlauf,
// Absprung, Griff ins Netz; Nervenspitze · 3·3·5·2" – the movement problem is entirely a nerve spike
// dressed up as timing, not balance: the rope keeps swinging whether anyone is there or not, and
// jumping when it is nearest catches it.
//
// The interaction itself is not "walk a rail" (there is nothing to walk on), so this hands off to its
// own player state (`element.playerState = "tarzan"`, `js/player/on-tarzan.js`) – the pattern
// `zipline.js` uses. What the element exposes for that state is grouped under `element.rope`: the
// swing is one deterministic function of time (`amplitude · sin(2π·elapsed/period)`), read by both
// the geometry here (a merged rope + grip toggle, weight-by-distance-from-the-pivot, same trick every
// other pendulum element in this folder uses) and by the state, so both are always exactly in sync –
// there is no simulation to fall out of step with, only one clock.
//
// A miss (jumping outside the ±0.25 s catch window) is not a special case: the state just returns to
// the ordinary `fall` state on this element's own safety cable, exactly as a slip anywhere else does.

import * as THREE from "three";
import { createElementBase, registerElementKind, ELEMENT } from "./element.js";
import { cableTermination, ropeStrand, lifelineCable, netKnot } from "./element-parts.js";
import { t } from "../core/i18n.js";

const DEG = Math.PI / 180;

export const TARZAN = Object.freeze({
  pivotHeight: 2.75,          // overhead anchor above the mid-span rise
  gripDrop: 2.05,             // pivot down to where the hands (and feet, in "climb") end up
  ropeRadius: 0.013,
  toggleLength: 0.16,         // the short grip bar at the rope's end
  period: 2.2,                 // seconds per full swing – slow enough to read and time
  amplitudeDeg: 34,            // swing half-angle
  windowSeconds: 0.25,         // ± tolerance around the ideal catch instant (deterministic, forgiving)
  netInset: 0.85,              // net stands this far back from the exit platform
  netWidth: 1.75,
  netDrop: 1.35,
  netMesh: 0.20,
  netRope: 0.011,
  postRadius: 0.05,
  cableRadius: 0.006,
  lifelineHeight: ELEMENT.lifelineHeight,
  lifelineSag: 0.05,
  standBack: 0.55,
  metrics: Object.freeze({ physical: 3, coordination: 3, psychological: 5, technical: 2 }),
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * @param {object} spec see `createElementBase`
 * @param {{ scene, physics, rng, timber, wind }} ctx
 * @returns {object} element – additionally exposes `rope`
 */
export function createTarzan(spec, ctx) {
  const amplitude = TARZAN.amplitudeDeg * DEG;
  let pivotLocal = null;                              // { x, y } in element-local metres, set at build time
  let angle = 0, elapsed = 0;

  const element = createElementBase(spec, ctx, {
    config: TARZAN,
    metrics: TARZAN.metrics,
    // the rings-style grip system never runs here – the whole crossing is its own player state
    handHold: { available: false, heightAboveFoot: 0, side: "none" },
    build: (builder, frame, el) => buildTarzan(builder, frame, el, ctx, (p) => { pivotLocal = p; }),
    update: (dt, globalElapsed) => { elapsed = globalElapsed; angle = amplitude * Math.sin((2 * Math.PI * elapsed) / TARZAN.period); },
    displace: (offsets) => {
      // the rope + toggle: lateral (along-span) and vertical displacement of the free end, pivot fixed
      offsets[0] = Math.sin(angle) * TARZAN.gripDrop;
      offsets[1] = TARZAN.gripDrop * (1 - Math.cos(angle));
      offsets[2] = 0;
    },
  });

  element.playerState = "tarzan";
  // there is no jumping backwards over a net – exactly like the Flying Fox, only the entry starts it
  element.oneWay = true;
  Object.defineProperty(element, "enterPrompt", { get: () => t("prompt.tarzanReady") });

  element.rope = {
    period: TARZAN.period,
    amplitude,
    window: TARZAN.windowSeconds,
    gripDrop: TARZAN.gripDrop,
    get angle() { return angle; },
    get elapsed() { return elapsed; },
    /** World position of the rope's free end at swing angle `a` (radians). */
    tipAt(a, out = new THREE.Vector3()) {
      const p = pivotLocal || { x: element.length / 2, y: TARZAN.pivotHeight };
      return element.frame.toWorld(p.x + Math.sin(a) * TARZAN.gripDrop, p.y - Math.cos(a) * TARZAN.gripDrop, 0, out);
    },
  };
  return element;
}

registerElementKind("tarzan", createTarzan);

function buildTarzan(builder, frame, element, ctx, setPivot) {
  const L = frame.length;
  const pivot = { x: L / 2, y: frame.rise * 0.5 + TARZAN.pivotHeight, z: 0 };
  setPivot(pivot);
  const bottomAtRest = { x: pivot.x, y: pivot.y - TARZAN.gripDrop, z: 0 };

  // --- static: lifeline, the overhead anchor eye, the catch net ---------------------------------------
  lifelineCable(builder, frame, element);
  builder.torus({ centre: { x: pivot.x, y: pivot.y + 0.02, z: 0 }, radius: 0.06, tube: 0.014, segments: 16, material: "steel" });
  builder.cylinderBetween({                                    // short stub standing in for the overhead beam
    from: { x: pivot.x, y: pivot.y + 0.03, z: 0 }, to: { x: pivot.x, y: pivot.y + 0.45, z: 0 },
    radius: 0.05, segments: 8, material: "log",
  });
  buildNet(builder, frame);
  const statics = builder.build(`${element.id}-fixed`);

  // --- swinging: the rope itself and the grip toggle at its end --------------------------------------
  ropeStrand(builder, { from: { x: pivot.x, y: pivot.y, z: 0 }, to: bottomAtRest, radius: TARZAN.ropeRadius, material: "cord", twist: 1.1 });
  builder.cylinderBetween({                                    // the bar the hands (and later feet) find
    from: { x: bottomAtRest.x - TARZAN.toggleLength / 2, y: bottomAtRest.y, z: 0 },
    to: { x: bottomAtRest.x + TARZAN.toggleLength / 2, y: bottomAtRest.y, z: 0 },
    radius: 0.022, segments: 10, material: "weathered",
  });
  const swinging = builder.build(`${element.id}-rope`);

  const classify = (x, y) => {
    const dy = Math.max(0, pivot.y - y);
    return { u: 0.5, group: 0, weight: Math.max(0, Math.min(1, dy / TARZAN.gripDrop)) };
  };

  return {
    groups: [statics, swinging],
    swing: { meshes: swinging.children.filter((c) => c.isMesh), groupCount: 1, classify },
  };
}

/** A hemp catch net standing a little short of the exit platform, the far side of the swing. */
function buildNet(builder, frame) {
  const x = frame.length - TARZAN.netInset;
  const half = TARZAN.netWidth / 2;
  const baseY = frame.rise - 0.05;
  for (const z of [-half - 0.06, half + 0.06]) {
    builder.cylinderBetween({ from: { x, y: baseY, z }, to: { x, y: baseY + TARZAN.netDrop, z }, radius: TARZAN.postRadius, segments: 10, material: "log" });
  }
  builder.cylinderBetween({
    from: { x, y: baseY + TARZAN.netDrop, z: -half - 0.06 }, to: { x, y: baseY + TARZAN.netDrop, z: half + 0.06 },
    radius: TARZAN.postRadius * 0.7, segments: 8, material: "log",
  });
  const columns = Math.max(4, Math.round(TARZAN.netWidth / TARZAN.netMesh));
  const rows = Math.max(4, Math.round(TARZAN.netDrop / TARZAN.netMesh));
  for (let c = 0; c <= columns; c++) {
    const z = -half + (c / columns) * TARZAN.netWidth;
    builder.cylinderBetween({ from: { x, y: baseY, z }, to: { x, y: baseY + TARZAN.netDrop, z }, radius: TARZAN.netRope, segments: 5, material: "cord" });
  }
  for (let r = 0; r <= rows; r++) {
    const y = baseY + (r / rows) * TARZAN.netDrop;
    builder.cylinderBetween({ from: { x, y, z: -half }, to: { x, y, z: half }, radius: TARZAN.netRope, segments: 5, material: "cord" });
    if (r % 2) continue;
    for (let c = 0; c <= columns; c += 2) netKnot(builder, { at: { x, y, z: -half + (c / columns) * TARZAN.netWidth }, size: TARZAN.netRope * 2.4 });
  }
}
