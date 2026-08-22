// Minimal WebAudio helper. Every sound in Wipfel is synthesised – there are no audio files.
//
// Browsers refuse to start an AudioContext before the player has interacted with the page, and they
// print a console warning if you try, so the context is not created until `armAudio()` has seen a
// real gesture. Until then every sfx call is a silent no-op, which also keeps the headless smoke
// runs quiet.
import { log } from "../core/errors.js";

const NOISE_SECONDS = 1.0;

let shared = null;

/** The one shared synth. Cheap to call – nothing is allocated until audio is armed. */
export function getSynth() {
  if (!shared) shared = new Synth();
  return shared;
}

/**
 * Create (and resume) the AudioContext on the first user gesture on `target`.
 * Call once from main.js: `armAudio(window)`.
 */
export function armAudio(target) {
  const synth = getSynth();
  if (synth.armed || !target || !target.addEventListener) return synth;
  const start = (event) => {
    if (event && event.isTrusted === false) return;   // synthetic events do not unlock audio
    for (const type of GESTURES) target.removeEventListener(type, start);
    synth.arm();
  };
  for (const type of GESTURES) target.addEventListener(type, start, { passive: true });
  return synth;
}

const GESTURES = ["pointerdown", "keydown", "touchstart"];

export function setMasterVolume(volume) { getSynth().setVolume(volume); }

export function disposeSynth() {
  if (shared) shared.dispose();
  shared = null;
}

class Synth {
  constructor(volume = 0.6) {
    this.armed = false;
    this.context = null;
    this.master = null;
    this._volume = volume;
    this._noise = null;
    this._failed = false;
  }

  /** True once a gesture created a running context – sfx modules check this before scheduling. */
  get ready() { return this.context != null && this.context.state === "running"; }

  /** Called from the gesture handler installed by `armAudio`. */
  arm() {
    if (this.armed || this._failed) return;
    this.armed = true;
    const Ctor = typeof AudioContext !== "undefined" ? AudioContext : (typeof webkitAudioContext !== "undefined" ? webkitAudioContext : null);
    if (!Ctor) { this._failed = true; return; }
    try {
      this.context = new Ctor({ latencyHint: "interactive" });
      this.master = this.context.createGain();
      this.master.gain.value = this._volume;
      this.master.connect(this.context.destination);
      if (this.context.state === "suspended") this.context.resume().catch(() => {});
    } catch (err) {
      this._failed = true;
      log.warn(`audio unavailable: ${err && err.message ? err.message : err}`);
    }
  }

  setVolume(volume) {
    this._volume = Math.max(0, Math.min(1, volume));
    if (this.master) this.master.gain.value = this._volume;
  }

  /** Seconds on the audio clock, `delay` in the future. */
  now(delay = 0) { return this.context ? this.context.currentTime + Math.max(0, delay) : 0; }

  /** One second of white noise, generated once and reused by every burst. */
  noiseBuffer() {
    if (this._noise || !this.context) return this._noise;
    const length = Math.floor(this.context.sampleRate * NOISE_SECONDS);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let value = 0;
    for (let i = 0; i < length; i++) {
      value = (value * 1103515245 + 12345) & 0x7fffffff;       // deterministic, no Math.random
      data[i] = (value / 0x3fffffff) - 1;
    }
    this._noise = buffer;
    return buffer;
  }

  /**
   * A percussive noise burst through a band-pass – the body of every metallic click. A long
   * `attack` turns the same node graph into a swell (webbing creaking, a breath being drawn).
   * @param {{ at, duration, frequency, q, gain, sweepTo?, attack? }} o
   */
  noiseBurst({ at, duration, frequency, q = 5, gain = 0.5, sweepTo = 0, attack = 0.0015 }) {
    if (!this.ready) return;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer();
    source.loop = true;
    source.playbackRate.value = 1;
    const filter = this.context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(frequency, at);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, at + duration);
    filter.Q.value = q;
    const envelope = this.envelope({ at, duration, gain, attack: Math.min(attack, duration * 0.9) });
    source.connect(filter).connect(envelope).connect(this.master);
    source.start(at);
    source.stop(at + duration + 0.02);
  }

  /**
   * A decaying sine/triangle ping – the ring of the metal.
   * @param {{ at, duration, frequency, toFrequency?, gain, type? }} o
   */
  ping({ at, duration, frequency, toFrequency = 0, gain = 0.3, type = "sine" }) {
    if (!this.ready) return;
    const osc = this.context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    if (toFrequency) osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFrequency), at + duration);
    const envelope = this.envelope({ at, duration, gain, attack: 0.001 });
    osc.connect(envelope).connect(this.master);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  /** Gain node with a click-free attack and an exponential tail, disconnected when it is done. */
  envelope({ at, duration, gain, attack = 0.002 }) {
    const node = this.context.createGain();
    node.gain.setValueAtTime(0.0001, at);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    return node;
  }

  dispose() {
    if (this.context && this.context.state !== "closed") this.context.close().catch(() => {});
    this.context = null;
    this.master = null;
    this._noise = null;
  }
}
