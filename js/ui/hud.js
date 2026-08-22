// In-game HUD (first version, M0.4). Owns only what the belay ritual needs: the two carabiner icons
// with the strength ring, and the context prompt at the bottom of the screen. The route header, flow
// meter and course map follow in M0.7 – the CSS for them already lives in css/hud.css.
//
// Prompt markup: keys are written in square brackets and become <kbd> elements, e.g.
// `setPrompt("Clip in [F]")`. Text is inserted as text nodes, never as HTML.

const KEY_PATTERN = /\[([^\]]{1,12})\]/g;

/**
 * @param {HTMLElement} root the `#hud` container
 * @returns {{ setBelay(stateA: string, stateB: string): void, setPrompt(text: string|null): void,
 *   setVitals(v: { stamina?: number }): void, show(): void, hide(): void, dispose(): void }}
 */
export function createHud(root) {
  const layer = document.createElement("div");
  layer.className = "hud-layer";

  const vitals = element("div", "hud-vitals");
  const belayBox = element("div", "box");
  belayBox.appendChild(element("span", "label", "Belay"));
  const carabiners = [element("i", "carabiner clipped"), element("i", "carabiner clipped")];
  for (const icon of carabiners) belayBox.appendChild(icon);
  const staminaBox = element("div", "box");
  staminaBox.appendChild(element("span", "label", "Str"));
  const ring = element("span", "ring");
  ring.appendChild(document.createElement("i"));
  staminaBox.appendChild(ring);
  vitals.append(belayBox, staminaBox);

  const prompt = element("div", "hud-prompt");
  prompt.hidden = true;

  layer.append(vitals, prompt);
  root.appendChild(layer);

  let shownPrompt = null;
  let shownBelay = "";

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
      if (text === shownPrompt) return;
      shownPrompt = text;
      prompt.replaceChildren();
      if (!text) { prompt.hidden = true; return; }
      for (const node of renderPrompt(text)) prompt.appendChild(node);
      prompt.hidden = false;
    },

    setVitals({ stamina = 1 } = {}) {
      ring.style.setProperty("--p", String(Math.max(0, Math.min(1, stamina))));
    },

    show() { layer.hidden = false; },
    hide() { layer.hidden = true; },

    dispose() { layer.remove(); },
  };
}

/** Splits "Clip in [F]" into text nodes and <kbd> elements. */
function renderPrompt(text) {
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
