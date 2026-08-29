// A line of things that hang from overhead cables and are taken one at a time: stirrup loops, rope
// loops, monkey rings. They all share the same model – an independent pendulum per step, a kick when
// a foot or a hand lands on one, and a neighbour coupling through the carrier cable – so it lives
// here once instead of in every element module (hanging-planks.js predates this and keeps its own
// copy, because its planks also carry a vertical rise the others do not have).
//
// `js/player/on-element.js` reads `element.steps` and calls `element.stepOn`; `footholdAt` tells it
// how ready the next step is to be taken. Nothing here touches THREE.

/**
 * @param {{ count: number, first: number, pitch: number, swingHz?: number, damping?: number,
 *   maxSwing?: number, kickPerStep?: number, coupling?: number, readySlack?: number }} config
 * @returns {{ steps: Array<{index:number,x:number,offset:number,velocity:number}>,
 *   update(dt: number): void, stepOn(index: number, strength?: number, direction?: number): void,
 *   nearest(t: number, length: number): object, reset(): void }}
 */
export function createHangingSteps(config) {
  const swingHz = config.swingHz == null ? 0.55 : config.swingHz;
  const damping = config.damping == null ? 0.14 : config.damping;
  const maxSwing = config.maxSwing == null ? 0.28 : config.maxSwing;
  const kickPerStep = config.kickPerStep == null ? 0.7 : config.kickPerStep;
  const coupling = config.coupling == null ? 0.2 : config.coupling;
  const readySlack = config.readySlack == null ? 0.18 : config.readySlack;

  const steps = [];
  for (let i = 0; i < config.count; i++) {
    steps.push({ index: i, x: config.first + i * config.pitch, offset: 0, velocity: 0 });
  }

  return {
    steps,

    update(dt) {
      if (!(dt > 0)) return;
      const omega = 2 * Math.PI * swingHz;
      for (const step of steps) {
        step.velocity += (-omega * omega * step.offset - 2 * damping * omega * step.velocity) * dt;
        step.offset += step.velocity * dt;
        if (step.offset > maxSwing) { step.offset = maxSwing; step.velocity = Math.min(0, step.velocity); }
        else if (step.offset < -maxSwing) { step.offset = -maxSwing; step.velocity = Math.max(0, step.velocity); }
      }
    },

    stepOn(index, strength = 1, direction = 1) {
      const step = steps[index];
      if (!step) return;
      step.velocity += kickPerStep * strength * direction;
      for (const other of [steps[index - 1], steps[index + 1]]) {
        if (other) other.velocity += kickPerStep * strength * direction * coupling;
      }
    },

    /** Which step is under `t`, and how ready it is to be taken (1 = hanging where it belongs). */
    nearest(t, length) {
      if (!steps.length) return { discrete: true, index: -1, t, offset: 0, ready: 0, swing: 0, step: null };
      const x = t * length;
      let index = 0, best = Infinity;
      for (const step of steps) {
        const d = Math.abs(step.x + step.offset - x);
        if (d < best) { best = d; index = step.index; }
      }
      const step = steps[index];
      const swing = step.offset / maxSwing;
      return {
        discrete: true,
        index,
        step,
        t: (step.x + step.offset) / length,
        offset: best,
        ready: Math.max(0, 1 - Math.abs(swing) - Math.max(0, best - readySlack) * 2.2),
        swing,
      };
    },

    reset() { for (const step of steps) { step.offset = 0; step.velocity = 0; } },
  };
}

/**
 * How many steps fit between two decks and how far apart, stretched so the first and the last one
 * sit a comfortable stride off each platform edge.
 * @param {{ span: number, spacing: number, endMargin: number, min?: number, max?: number }} o
 */
export function stepLayout({ span, spacing, endMargin, min = 3, max = 24 }) {
  const usable = Math.max(spacing, span - 2 * endMargin);
  const count = Math.max(min, Math.min(max, Math.round(usable / spacing) + 1));
  return { count, first: endMargin, pitch: count > 1 ? usable / (count - 1) : 0 };
}
