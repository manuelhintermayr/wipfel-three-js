// Flying-Fox placement tool (M3a, GDD §4 "Flying-Fox-Werkzeug zeigt live Gefälle, Durchhang,
// Ankunftstempo … und schlägt die Bremse vor"): a small top-down canvas centred on the departure
// platform – click/drag to aim a landing point, read gradient/length/predicted arrival speed live off
// js/builder/builder-state.js#evaluateZip, "Place" commits it. A 2-D canvas rather than 3-D dragging on
// the terrain mesh: js/builder/builder-camera.js's orbit view makes a precise 3-D drag fiddly at this
// scale, and this project already renders top-down maps this way (js/ui/map-render.js).
const TOOL = Object.freeze({
  worldRadius: 70,        // metres shown edge-to-edge – covers the whole 40-56 m zip search window
  canvasSize: 260,
});

/**
 * @param {{ root: HTMLElement, t: (key: string, vars?: object) => string }} options
 * @returns {{ element: HTMLElement,
 *   show(ctx: { originWorld: {x,z}, evaluate: (landing:{x,z}) => object|null, onCommit: (landing:{x,z}) => void }): void,
 *   hide(): void, dispose(): void }}
 */
export function createZipTool({ root, t }) {
  const panel = el("div", "zip-tool");
  panel.hidden = true;
  panel.appendChild(el("div", "zip-tool-title", t("builder.zip.title")));
  const canvas = document.createElement("canvas");
  canvas.width = TOOL.canvasSize; canvas.height = TOOL.canvasSize;
  panel.appendChild(canvas);
  const readout = el("div", "zip-tool-readout");
  panel.appendChild(readout);
  const hint = el("div", "zip-tool-hint", t("builder.zip.hint"));
  panel.appendChild(hint);
  const actions = el("div", "zip-tool-actions");
  const placeBtn = el("button", "btn zip-tool-place", t("builder.zip.place"));
  placeBtn.type = "button";
  placeBtn.disabled = true;
  actions.appendChild(placeBtn);
  panel.appendChild(actions);
  root.appendChild(panel);

  const ctx2d = canvas.getContext("2d");
  const scale = TOOL.canvasSize / (TOOL.worldRadius * 2);
  const centre = TOOL.canvasSize / 2;

  let context = null;
  let landing = null;     // world {x,z}, relative to origin
  let lastResult = null;

  function toWorld(px, py) {
    return { x: context.originWorld.x + (px - centre) / scale, z: context.originWorld.z + (py - centre) / scale };
  }
  function toCanvas(worldX, worldZ) {
    return [centre + (worldX - context.originWorld.x) * scale, centre + (worldZ - context.originWorld.z) * scale];
  }

  function paint() {
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.fillStyle = "#182018";
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    ctx2d.strokeStyle = "rgba(255,255,255,0.12)";
    for (let r = 20; r < TOOL.worldRadius; r += 20) {
      ctx2d.beginPath(); ctx2d.arc(centre, centre, r * scale, 0, Math.PI * 2); ctx2d.stroke();
    }
    // 3-6% gradient rings from the departure point read as annuli in a flat-ish top-down view only
    // approximately (they truly depend on terrain height) – shown as plain range rings for orientation.
    ctx2d.fillStyle = "#f2c635";
    ctx2d.beginPath(); ctx2d.arc(centre, centre, 4, 0, Math.PI * 2); ctx2d.fill();
    if (landing) {
      const [lx, ly] = toCanvas(landing.x, landing.z);
      ctx2d.strokeStyle = lastResult && lastResult.ok ? "#58c56b" : "#e0564c";
      ctx2d.setLineDash([6, 5]);
      ctx2d.beginPath(); ctx2d.moveTo(centre, centre); ctx2d.lineTo(lx, ly); ctx2d.stroke();
      ctx2d.setLineDash([]);
      ctx2d.fillStyle = ctx2d.strokeStyle;
      ctx2d.beginPath(); ctx2d.arc(lx, ly, 5, 0, Math.PI * 2); ctx2d.fill();
    }
  }

  function renderReadout() {
    if (!lastResult) { readout.textContent = t("builder.zip.noLanding"); placeBtn.disabled = true; return; }
    const r = lastResult;
    const bits = [
      t("builder.zip.length", { m: r.length.toFixed(1) }),
      t("builder.zip.gradient", { pct: (r.gradient * 100).toFixed(1) }),
      r.stalled ? t("builder.zip.stalled") : t("builder.zip.arrival", { kmh: r.arrivalKmh.toFixed(1) }),
    ];
    readout.textContent = bits.join(" · ");
    readout.classList.toggle("bad", !r.ok);
    placeBtn.disabled = !r.ok;
  }

  function updateFromEvent(evt) {
    const rect = canvas.getBoundingClientRect();
    const px = (evt.clientX - rect.left) * (canvas.width / rect.width);
    const py = (evt.clientY - rect.top) * (canvas.height / rect.height);
    landing = toWorld(px, py);
    lastResult = context.evaluate(landing);
    paint();
    renderReadout();
  }

  let dragging = false;
  canvas.addEventListener("pointerdown", (evt) => { dragging = true; updateFromEvent(evt); });
  window.addEventListener("pointermove", (evt) => { if (dragging) updateFromEvent(evt); });
  window.addEventListener("pointerup", () => { dragging = false; });
  placeBtn.addEventListener("click", () => { if (landing && lastResult && lastResult.ok) context.onCommit(landing); });

  return {
    element: panel,
    show(nextContext) {
      context = nextContext;
      landing = null;
      lastResult = null;
      panel.hidden = false;
      paint();
      renderReadout();
    },
    hide() { panel.hidden = true; dragging = false; },
    dispose() { panel.remove(); },
  };
}

function el(tag, className, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
