// Classic-mode accident report (ROADMAP M2b, GDD §3.5: "ein trockener Unfallbericht, keine Explosion").
// Two phases, driven by js/main.js once js/player/accident.js reaches the ground:
//   1. `showFade()` – a plain black overlay fades in (js/config.js#ACCIDENT.fadeInSeconds) over whatever
//      the camera was last looking at, exactly like a hard cut, not a stylised death screen.
//   2. `showReport(details)` – once the fade is opaque, a laminated-sheet-style form (route, obstacle,
//      cause, time) appears on top of it, same visual language as js/ui/kassa.js's "ein Blatt Papier".
// `onContinue()` (a single button, "Continue") is the only way out – js/main.js teleports the climber
// back to the hub and clears the belay from there, exactly like a rescue already does.
import { t, formatTime } from "../core/i18n.js";

/**
 * @param {{ root: HTMLElement, onContinue: () => void }} options
 * @returns {{ visible: boolean, showFade(): void,
 *   showReport(details: { routeName?: string, elementLabel?: string, seconds: number }): void,
 *   hide(): void, dispose(): void }}
 */
export function createAccidentReport({ root, onContinue }) {
  const fade = el("div", "accident-fade");
  fade.hidden = true;
  root.appendChild(fade);

  const screen = el("div", "screen accident-screen");
  screen.hidden = true;
  const sheet = el("div", "panel accident-sheet");
  sheet.appendChild(el("h1", "", t("accident.title")));
  const form = el("div", "accident-form");
  sheet.appendChild(form);
  const continueBtn = el("button", "btn confirm", t("accident.continue"));
  continueBtn.type = "button";
  continueBtn.addEventListener("click", () => { api.hide(); onContinue(); });
  sheet.appendChild(continueBtn);
  screen.appendChild(sheet);
  root.appendChild(screen);

  function row(labelKey, value) {
    const line = el("div", "accident-row");
    line.append(el("span", "label", t(labelKey)), el("span", "value", value));
    return line;
  }

  const api = {
    get visible() { return !fade.hidden || !screen.hidden; },

    /** Called the instant `player:accident` starts falling – the fade covers the fall itself. */
    showFade() {
      screen.hidden = true;
      fade.hidden = false;
      document.body.classList.add("accident-active");   // hides the route header/banner/HUD underneath
      // two rAFs so the browser commits `opacity: 0` before the transition to 1 starts (else it can
      // collapse into one paint and never visibly fade).
      requestAnimationFrame(() => requestAnimationFrame(() => fade.classList.add("in")));
    },

    /**
     * Called once the fall has landed – the report reads as a form filled out at the ticket desk. The
     * fade (still fully opaque, `z-index` above every other screen) has to step aside here, or it just
     * blacks out the report sitting underneath it – `.screen`'s own translucent backdrop takes over
     * instead, the same dimmed-frozen-world look the kassa/stamp card already use.
     */
    showReport({ routeName = null, elementLabel = null, seconds = 0 } = {}) {
      form.replaceChildren(
        row("accident.route", routeName || t("accident.unknownRoute")),
        row("accident.obstacle", elementLabel || t("accident.unknownObstacle")),
        row("accident.cause", t("accident.causeBothOpen")),
        row("accident.time", formatTime(seconds)),
      );
      fade.classList.remove("in");
      fade.hidden = true;
      screen.hidden = false;
    },

    hide() {
      fade.hidden = true;
      fade.classList.remove("in");
      screen.hidden = true;
      document.body.classList.remove("accident-active");
    },

    dispose() { fade.remove(); screen.remove(); },
  };
  return api;
}

function el(tag, className, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
