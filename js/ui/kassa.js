// The kassa screen (GDD §3.7/§5, ROADMAP M1.3): "ein Blatt Papier" – a laminated-sheet form over the
// dark translucent app frame. Shown at boot before pointer lock; choose ticket type, size class and
// belay mode, then Confirm starts the day (js/main.js applies the choice to the save, the ticket
// clock, the sky and the belay). Pure DOM; no game logic lives here.
import { t } from "../core/i18n.js";
import { RULES, BELAY_MODES, TICKET_TYPES } from "../config.js";

/** One-line name + description per belay mode (GDD §3.3) – UI copy, so it stays out of config.js. */
const BELAY_COPY = Object.freeze({
  continuous: { nameKey: "kassa.belay.continuous.name", descKey: "kassa.belay.continuous.desc" },
  smart: { nameKey: "kassa.belay.smart.name", descKey: "kassa.belay.smart.desc" },
  classic: { nameKey: "kassa.belay.classic.name", descKey: "kassa.belay.classic.desc" },
});

/**
 * @param {{ root: HTMLElement, defaultChoice?: { type?, sizeClassId?, belayMode? },
 *   onConfirm: (choice: {type: string, sizeClassId: string, belayMode: string}) => void }} options
 * @returns {{ visible: boolean, show(): void, hide(): void, confirmDefaults(): void, dispose(): void }}
 */
export function createKassa({ root, defaultChoice = {}, onConfirm }) {
  const choice = {
    type: defaultChoice.type || TICKET_TYPES[0].id,
    sizeClassId: defaultChoice.sizeClassId || "adult",
    belayMode: BELAY_MODES.includes(defaultChoice.belayMode) ? defaultChoice.belayMode : "smart",
  };

  const screen = el("div", "screen kassa-screen");
  screen.hidden = true;
  const sheet = el("div", "panel kassa-sheet");
  sheet.append(el("h1", "", t("kassa.title")), el("p", "", t("kassa.subtitle")));

  sheet.appendChild(group(t("kassa.ticketLabel"), TICKET_TYPES.map((tt) => ({
    id: tt.id, name: t(tt.labelKey), desc: t(tt.descKey),
  })), choice.type, (id) => { choice.type = id; }));

  sheet.appendChild(group(t("kassa.sizeLabel"), RULES.sizeClasses.map((s) => ({
    id: s.id, name: t(s.labelKey), desc: t("kassa.sizeMinHeight", { cm: s.minCm }),
  })), choice.sizeClassId, (id) => { choice.sizeClassId = id; }));

  sheet.appendChild(group(t("kassa.belayLabel"), BELAY_MODES.map((mode) => ({
    id: mode, name: t(BELAY_COPY[mode].nameKey), desc: t(BELAY_COPY[mode].descKey),
  })), choice.belayMode, (id) => { choice.belayMode = id; }));

  const confirm = el("button", "btn confirm", t("kassa.confirm"));
  confirm.type = "button";
  confirm.addEventListener("click", apply);
  sheet.appendChild(confirm);

  screen.appendChild(sheet);
  root.appendChild(screen);

  function apply() {
    screen.hidden = true;
    onConfirm({ ...choice });
  }

  return {
    get visible() { return !screen.hidden; },
    show() { screen.hidden = false; },
    hide() { screen.hidden = true; },
    /** Autoplay hook (`?autoplay=1`): confirm with the current defaults, no DOM clicking. */
    confirmDefaults() { apply(); },
    dispose() { screen.remove(); },
  };
}

/** One labelled row of selectable option cards; clicking one calls `onSelect(id)` and restyles itself. */
function group(label, options, selectedId, onSelect) {
  const wrap = el("div", "kassa-group");
  wrap.appendChild(el("div", "kassa-group-label", label));
  const list = el("div", "kassa-options");
  const buttons = new Map();
  for (const option of options) {
    const button = el("button", "kassa-option" + (option.id === selectedId ? " selected" : ""));
    button.type = "button";
    button.append(el("span", "name", option.name), el("span", "desc", option.desc));
    button.addEventListener("click", () => {
      for (const b of buttons.values()) b.classList.remove("selected");
      button.classList.add("selected");
      onSelect(option.id);
    });
    buttons.set(option.id, button);
    list.appendChild(button);
  }
  wrap.appendChild(list);
  return wrap;
}

function el(tag, className, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
