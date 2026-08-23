// In-game HUD (first version, M0.4). Owns only what the belay ritual needs: the two carabiner icons
// with the strength ring, and the context prompt at the bottom of the screen. The route header, flow
// meter and course map follow in M0.7 – the CSS for them already lives in css/hud.css.
//
// Prompt markup: keys are written in square brackets and become <kbd> elements, e.g.
// `setPrompt("Clip in [F]")`. Text is inserted as text nodes, never as HTML.

import { t } from "../core/i18n.js";

const KEY_PATTERN = /\[([^\]]{1,12})\]/g;

/**
 * @param {HTMLElement} root the `#hud` container
 * @returns {{ setBelay(stateA: string, stateB: string): void, setPrompt(text: string|null): void,
 *   setSpeed(kmh: number|null): void, setNotice(text: string|null, seconds?: number): void,
 *   setVitals(v: { stamina?: number, heartRate?: number, level?: string, frozen?: boolean }): void,
 *   show(): void, hide(): void, dispose(): void }}
 */
export function createHud(root) {
  const layer = document.createElement("div");
  layer.className = "hud-layer";

  const vitals = element("div", "hud-vitals");
  const belayBox = element("div", "box");
  belayBox.appendChild(element("span", "label", t("hud.belay")));
  const carabiners = [element("i", "carabiner clipped"), element("i", "carabiner clipped")];
  for (const icon of carabiners) belayBox.appendChild(icon);
  const staminaBox = element("div", "box");
  staminaBox.appendChild(element("span", "label", t("hud.strength")));
  const ring = element("span", "ring");
  ring.appendChild(document.createElement("i"));
  staminaBox.appendChild(ring);
  const heartBox = element("div", "box heart calm");
  heartBox.appendChild(element("span", "label", t("hud.bpm")));
  const bpmLabel = element("span", "bpm", "58");
  heartBox.append(bpmLabel, document.createElement("i"));
  vitals.append(belayBox, staminaBox, heartBox);

  const prompt = element("div", "hud-prompt");
  prompt.hidden = true;

  // Speedometer (mockup: SPEED / 38 / KM/H, bottom right) – only ever visible on a zip line.
  const speed = element("div", "hud-speed");
  const speedValue = element("div", "value", "0");
  speed.append(element("div", "label", t("hud.speed")), speedValue, element("div", "unit", t("hud.kmh")));
  speed.hidden = true;

  layer.append(vitals, prompt, speed);
  root.appendChild(layer);

  let shownPrompt = null;
  let shownBelay = "";
  let shownBeat = 0;
  let shownLevel = "";
  let shownRing = "";
  let shownSpeed = null;
  let pendingPrompt = null;
  let notice = null;
  let noticeUntil = 0;

  /**
   * The prompt line shows the notice while one is live and the context prompt otherwise. There is no
   * timer: `setPrompt` runs every frame anyway, so the expiry is checked where it is needed.
   */
  function renderPrompt() {
    const live = notice != null && now() < noticeUntil;
    const text = live ? notice : pendingPrompt;
    if (!live && notice != null) notice = null;
    if (text === shownPrompt) return;
    shownPrompt = text;
    prompt.replaceChildren();
    if (!text) { prompt.hidden = true; return; }
    for (const node of renderText(text)) prompt.appendChild(node);
    prompt.hidden = false;
  }

  return {
    /** Carabiner states: "clipped" (green), "open" (amber, gate up), "locked" (grey). */
    setBelay(stateA, stateB) {
      const key = `${stateA}|${stateB}`;
      if (key === shownBelay) return;
      shownBelay = key;
      carabiners[0].className = `carabiner ${stateA}`;
      carabiners[1].className = `carabiner ${stateB}`;
    },

    /** `null` hides the prompt. Square brackets mark keys: "Climb [E]". */
    setPrompt(text) {
      pendingPrompt = text;
      renderPrompt();
    },

    /**
     * A message that takes the prompt line over for a few seconds – "Top speed 24 km/h" after a
     * Flying Fox. Pass `null` to drop it again.
     */
    setNotice(text, seconds = 4) {
      notice = text;
      noticeUntil = text == null ? 0 : now() + seconds * 1000;
      renderPrompt();
    },

    /**
     * The speedometer, in km/h. `null` hides it – it belongs to the zip line and nothing else
     * (GDD §HUD: `SPEED 62 KM/H` bottom right).
     */
    setSpeed(kmh) {
      const value = kmh == null ? null : Math.round(kmh);
      if (value === shownSpeed) return;
      shownSpeed = value;
      if (value == null) { speed.hidden = true; return; }
      speedValue.textContent = String(value);
      speed.hidden = false;
    },

    /**
     * Strength ring plus the heartbeat dot. There is deliberately no nerve bar (GDD §3.1) – the
     * pulse rate and its colour are the only readout the player gets.
     * @param {{ stamina?: number, heartRate?: number, level?: string, frozen?: boolean }} v
     */
    setVitals({ stamina = 1, heartRate = 58, level = "calm", frozen = false } = {}) {
      const value = Math.max(0, Math.min(1, stamina));
      ring.style.setProperty("--p", value.toFixed(3));
      const ringClass = value <= 0.02 ? "ring empty" : value < 0.16 ? "ring low" : "ring";
      if (ringClass !== shownRing) { ring.className = ringClass; shownRing = ringClass; }

      const bpm = Math.round(Math.max(30, heartRate));
      if (bpm !== shownBeat) {
        shownBeat = bpm;
        bpmLabel.textContent = String(bpm);
        heartBox.style.setProperty("--beat", `${(60 / bpm).toFixed(3)}s`);
      }
      const mood = frozen ? "frozen" : level;
      if (mood !== shownLevel) { heartBox.className = `box heart ${mood}`; shownLevel = mood; }
    },

    show() { layer.hidden = false; },
    hide() { layer.hidden = true; },

    dispose() { layer.remove(); },
  };
}

/** Wall clock – the notice is presentation, not simulation, so it does not use the fixed step. */
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Splits "Clip in [F]" into text nodes and <kbd> elements. */
function renderText(text) {
  const nodes = [];
  let last = 0;
  KEY_PATTERN.lastIndex = 0;
  for (let match = KEY_PATTERN.exec(text); match; match = KEY_PATTERN.exec(text)) {
    if (match.index > last) nodes.push(document.createTextNode(text.slice(last, match.index)));
    const key = document.createElement("kbd");
    key.textContent = match[1];
    nodes.push(key);
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(document.createTextNode(text.slice(last)));
  return nodes;
}

function element(tag, className, text = null) {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
