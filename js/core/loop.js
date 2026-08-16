// Fixed-step game loop: input → physics (fixed) → gameplay → render (interpolated) → ui.
import { PHYSICS } from "../config.js";

export class Loop {
  constructor({ timeScale = 1 } = {}) {
    this.stepSeconds = 1 / PHYSICS.hz;
    this.timeScale = timeScale;
    this.accumulator = 0;
    this.lastTime = 0;
    this.running = false;
    this.paused = false;
    this.frame = 0;
    this.elapsed = 0;                 // simulated seconds
    this.stats = { frameMs: 0, physicsMs: 0, physicsSteps: 0, fps: 0 };
    this._fpsAcc = 0; this._fpsCount = 0;
    this._phases = { input: [], physics: [], gameplay: [], render: [], ui: [] };
    this._raf = 0;
    this._tick = this._tick.bind(this);
  }

  /** Register a callback for a phase. physics callbacks get (dt) with fixed dt; render gets (alpha, dt). */
  on(phase, fn) {
    if (!this._phases[phase]) throw new Error(`Loop: unknown phase '${phase}'`);
    this._phases[phase].push(fn);
    return () => { const a = this._phases[phase]; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() { this.running = false; cancelAnimationFrame(this._raf); }

  _tick(now) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._tick);
    const frameStart = performance.now();
    let frameDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (frameDt > 0.25) frameDt = 0.25;           // tab was hidden – don't explode
    const dt = this.paused ? 0 : frameDt * this.timeScale;
    this.frame++;

    for (const fn of this._phases.input) fn(frameDt);

    this.accumulator += dt;
    let steps = 0;
    const p0 = performance.now();
    while (this.accumulator >= this.stepSeconds && steps < PHYSICS.maxSubSteps) {
      for (const fn of this._phases.physics) fn(this.stepSeconds);
      this.accumulator -= this.stepSeconds;
      this.elapsed += this.stepSeconds;
      steps++;
    }
    if (steps === PHYSICS.maxSubSteps) this.accumulator = 0; // drop backlog rather than spiral
    this.stats.physicsMs = performance.now() - p0;
    this.stats.physicsSteps = steps;

    for (const fn of this._phases.gameplay) fn(dt, this.elapsed);
    const alpha = this.accumulator / this.stepSeconds;
    for (const fn of this._phases.render) fn(alpha, frameDt);
    for (const fn of this._phases.ui) fn(frameDt);

    this.stats.frameMs = performance.now() - frameStart;
    this._fpsAcc += frameDt; this._fpsCount++;
    if (this._fpsAcc >= 0.5) { this.stats.fps = this._fpsCount / this._fpsAcc; this._fpsAcc = 0; this._fpsCount = 0; }
  }
}
