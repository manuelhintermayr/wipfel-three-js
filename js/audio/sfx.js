// Sound effects, all synthesised on the fly (js/audio/synth.js). M0.4 needs the two sounds the whole
// safety ritual hangs on: the bright snap of a carabiner gate opening and the heavier clack of it
// closing and locking. Calls before the player has touched the page are silent no-ops.
import { getSynth } from "./synth.js";

export const SFX = Object.freeze({
  open: Object.freeze({ duration: 0.040, noise: 3600, sweepTo: 2600, q: 7, noiseGain: 0.30, ping: 3900, pingTo: 3300, pingGain: 0.16 }),
  lock: Object.freeze({ duration: 0.070, noise: 1500, sweepTo: 900, q: 4, noiseGain: 0.38, ping: 1520, pingTo: 940, pingGain: 0.20, thump: 148, thumpTo: 82, thumpGain: 0.22 }),
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
