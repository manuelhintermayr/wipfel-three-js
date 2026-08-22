// Sound effects, all synthesised on the fly (js/audio/synth.js). The safety ritual needs the bright
// snap of a carabiner gate opening and the heavier clack of it locking (M0.4); the exercises add the
// three sounds the body makes up there (M0.5): the harness catching a fall, a heartbeat you cannot
// ignore and the breath that gets it back under control. Calls before the player has touched the
// page are silent no-ops.
import { getSynth } from "./synth.js";

export const SFX = Object.freeze({
  open: Object.freeze({ duration: 0.040, noise: 3600, sweepTo: 2600, q: 7, noiseGain: 0.30, ping: 3900, pingTo: 3300, pingGain: 0.16 }),
  lock: Object.freeze({ duration: 0.070, noise: 1500, sweepTo: 900, q: 4, noiseGain: 0.38, ping: 1520, pingTo: 940, pingGain: 0.20, thump: 148, thumpTo: 82, thumpGain: 0.22 }),
  /** Body into the harness: a dull thump, the sharp jolt of the lanyard, then webbing creaking. */
  catch: Object.freeze({
    thump: Object.freeze({ duration: 0.30, frequency: 96, toFrequency: 44, gain: 0.55, type: "sine" }),
    jolt: Object.freeze({ duration: 0.11, frequency: 520, sweepTo: 190, q: 2.2, gain: 0.42 }),
    creak: Object.freeze({ delay: 0.13, duration: 0.55, frequency: 1250, sweepTo: 640, q: 9, gain: 0.16, attack: 0.10 }),
  }),
  /** Lub-dub, felt more than heard: two low sine thuds, the second softer and a little later. */
  heart: Object.freeze({ lub: 62, dub: 48, duration: 0.11, spacing: 0.20, gain: 0.30 }),
  /** Air through the nose and out again – filtered noise, no pitch. */
  breath: Object.freeze({ inFreq: 620, inSweep: 880, outFreq: 500, outSweep: 300, q: 1.1, gain: 0.16 }),
});

/** Gate springs open: a short, bright, metallic tick (~40 ms). */
export function sfxCarabinerOpen(delay = 0) {
  const synth = getSynth();
  if (!synth.ready) return false;
  const s = SFX.open;
  const at = synth.now(delay);
  synth.noiseBurst({ at, duration: s.duration, frequency: s.noise, sweepTo: s.sweepTo, q: s.q, gain: s.noiseGain });
  synth.ping({ at, duration: s.duration * 1.6, frequency: s.ping, toFrequency: s.pingTo, gain: s.pingGain, type: "triangle" });
  return true;
}

/** Gate snaps shut and the sleeve locks: lower, heavier, with a bit of body (~70 ms). */
export function sfxCarabinerLock(delay = 0) {
  const synth = getSynth();
  if (!synth.ready) return false;
  const s = SFX.lock;
  const at = synth.now(delay);
  synth.noiseBurst({ at, duration: s.duration, frequency: s.noise, sweepTo: s.sweepTo, q: s.q, gain: s.noiseGain });
  synth.ping({ at, duration: s.duration, frequency: s.ping, toFrequency: s.pingTo, gain: s.pingGain, type: "triangle" });
  synth.ping({ at, duration: s.duration * 1.3, frequency: s.thump, toFrequency: s.thumpTo, gain: s.thumpGain, type: "sine" });
  return true;
}

/**
 * The harness catching a fall (js/player/fall.js). `force` 0..1 scales the whole thing – the first
 * catch of a run is the loud one.
 */
export function sfxHarnessCatch(force = 1, delay = 0) {
  const synth = getSynth();
  if (!synth.ready) return false;
  const s = SFX.catch;
  const at = synth.now(delay);
  const gain = 0.4 + 0.6 * Math.max(0, Math.min(1, force));
  synth.ping({ at, duration: s.thump.duration, frequency: s.thump.frequency, toFrequency: s.thump.toFrequency, gain: s.thump.gain * gain, type: s.thump.type });
  synth.noiseBurst({ at, duration: s.jolt.duration, frequency: s.jolt.frequency, sweepTo: s.jolt.sweepTo, q: s.jolt.q, gain: s.jolt.gain * gain });
  synth.noiseBurst({ at: at + s.creak.delay, duration: s.creak.duration, frequency: s.creak.frequency, sweepTo: s.creak.sweepTo, q: s.creak.q, gain: s.creak.gain * gain, attack: s.creak.attack });
  return true;
}

/**
 * One heartbeat. `intensity` 0..1 comes from `nerves.value`; below the audible threshold the caller
 * simply does not call this (js/player/vitals.js).
 */
export function sfxHeartbeat(intensity = 1, delay = 0) {
  const synth = getSynth();
  if (!synth.ready) return false;
  const s = SFX.heart;
  const at = synth.now(delay);
  const gain = s.gain * Math.max(0, Math.min(1, intensity));
  synth.ping({ at, duration: s.duration, frequency: s.lub, toFrequency: s.lub * 0.62, gain, type: "sine" });
  synth.ping({ at: at + s.spacing, duration: s.duration * 0.85, frequency: s.dub, toFrequency: s.dub * 0.62, gain: gain * 0.7, type: "sine" });
  return true;
}

/** One deliberate breath while R is held: a swell in, a longer swell out. `seconds` = full cycle. */
export function sfxBreath(seconds = 1.6, delay = 0) {
  const synth = getSynth();
  if (!synth.ready) return false;
  const s = SFX.breath;
  const at = synth.now(delay);
  const inhale = seconds * 0.4;
  synth.noiseBurst({ at, duration: inhale, frequency: s.inFreq, sweepTo: s.inSweep, q: s.q, gain: s.gain, attack: inhale * 0.6 });
  synth.noiseBurst({ at: at + inhale + seconds * 0.05, duration: seconds * 0.5, frequency: s.outFreq, sweepTo: s.outSweep, q: s.q, gain: s.gain * 0.9, attack: seconds * 0.12 });
  return true;
}
