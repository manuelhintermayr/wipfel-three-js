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

/**
 * Options screen (M1.7): per-category volume 0..1. `category` is one of `sfx` (every click/thump/
 * heartbeat/breath/trolley/rush sound in js/audio/sfx.js – its calls default to this bus), `ambience`
 * (no ambient sounds are implemented yet – GDD's wind/birds/distant-city bed is a later milestone; the
 * bus and its slider are wired and ready) or `ui` (no interface sounds exist yet either, same story).
 */
export function setCategoryVolume(category, volume) { getSynth().setCategoryVolume(category, volume); }

export function disposeSynth() {
  if (shared) shared.dispose();
  shared = null;
}

/** Bus names the options screen exposes as volume sliders (js/config.js documents master separately). */
const CATEGORIES = Object.freeze(["sfx", "ambience", "ui"]);

class Synth {
  constructor(volume = 0.6) {
    this.armed = false;
    this.context = null;
    this.master = null;
    this.categories = null;              // { sfx, ambience, ui } gain nodes, created in arm()
    this._volume = volume;
    this._categoryVolume = { sfx: 1, ambience: 1, ui: 1 };
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
      this.categories = {};
      for (const name of CATEGORIES) {
        const gain = this.context.createGain();
        gain.gain.value = this._categoryVolume[name];
        gain.connect(this.master);
        this.categories[name] = gain;
      }
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

  /** @param {"sfx"|"ambience"|"ui"} category */
  setCategoryVolume(category, volume) {
    const v = Math.max(0, Math.min(1, volume));
    this._categoryVolume[category] = v;
    if (this.categories && this.categories[category]) this.categories[category].gain.value = v;
  }

  /** Which gain node a scheduled sound connects into. Unknown/missing categories fall back to master. */
  busFor(category) {
    return (this.categories && this.categories[category]) || this.master;
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
   * @param {{ at, duration, frequency, q, gain, sweepTo?, attack?, category?: "sfx"|"ambience"|"ui" }} o
   */
  noiseBurst({ at, duration, frequency, q = 5, gain = 0.5, sweepTo = 0, attack = 0.0015, category = "sfx" }) {
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
    source.connect(filter).connect(envelope).connect(this.busFor(category));
    source.start(at);
    source.stop(at + duration + 0.02);
  }

  /**
   * A decaying sine/triangle ping – the ring of the metal.
   * @param {{ at, duration, frequency, toFrequency?, gain, type?, category?: "sfx"|"ambience"|"ui" }} o
   */
  ping({ at, duration, frequency, toFrequency = 0, gain = 0.3, type = "sine", category = "sfx" }) {
    if (!this.ready) return;
    const osc = this.context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    if (toFrequency) osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFrequency), at + duration);
    const envelope = this.envelope({ at, duration, gain, attack: 0.001 });
    osc.connect(envelope).connect(this.busFor(category));
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  /**
   * A voice that keeps sounding until it is stopped – a trolley whirring, wind in the ears. Unlike
   * `noiseBurst` and `ping`, which schedule a fixed shape and forget about it, this one hands back a
   * live handle whose `set()` follows the game every frame. All changes are `setTargetAtTime`
   * ramps, so nothing ever clicks.
   * @param {{ source?: "noise"|"osc", type?: OscillatorType, frequency?: number, filter?: BiquadFilterType,
   *   filterFreq?: number, q?: number, gain?: number, glide?: number, category?: "sfx"|"ambience"|"ui" }} o
   * @returns {{ set(o: { frequency?, filterFreq?, gain? }): void, stop(): void }|null}
   */
  voice({ source = "noise", type = "sawtooth", frequency = 220, filter = "bandpass", filterFreq = 900, q = 3, gain = 0, glide = 0.05, category = "sfx" }) {
    if (!this.ready) return null;
    const context = this.context;
    let node;
    if (source === "noise") {
      node = context.createBufferSource();
      node.buffer = this.noiseBuffer();
      node.loop = true;
    } else {
      node = context.createOscillator();
      node.type = type;
      node.frequency.value = frequency;
    }
    const band = context.createBiquadFilter();
    band.type = filter;
    band.frequency.value = filterFreq;
    band.Q.value = q;
    const level = context.createGain();
    level.gain.value = gain;
    node.connect(band).connect(level).connect(this.busFor(category));
    node.start();
    let stopped = false;
    return {
      set(o = {}) {
        if (stopped) return;
        const at = context.currentTime;
        if (o.frequency != null && node.frequency) node.frequency.setTargetAtTime(Math.max(20, o.frequency), at, glide);
        if (o.filterFreq != null) band.frequency.setTargetAtTime(Math.max(40, o.filterFreq), at, glide);
        if (o.gain != null) level.gain.setTargetAtTime(Math.max(0, o.gain), at, glide);
      },
      stop() {
        if (stopped) return;
        stopped = true;
        const at = context.currentTime;
        level.gain.setTargetAtTime(0, at, 0.08);
        try { node.stop(at + 0.5); } catch { /* already stopped */ }
        setTimeout(() => { try { level.disconnect(); } catch { /* gone with the context */ } }, 800);
      },
    };
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
    this.categories = null;
    this._noise = null;
  }
}
