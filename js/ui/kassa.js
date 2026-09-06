// The kassa screen (GDD §3.7/§5, ROADMAP M1.3): "ein Blatt Papier" – a laminated-sheet form over the
// dark translucent app frame. Shown at boot before pointer lock; choose ticket type, size class and
// belay mode, then Confirm starts the day (js/main.js applies the choice to the save, the ticket
// clock, the sky and the belay). Pure DOM; no game logic lives here.
//
// M2a: a fourth "Season pass" ticket card falls straight out of `TICKET_TYPES` (no code here knows it
// is special – js/game/ticket.js's `hours: Infinity` does all the work). An "Equipment" row (GDD §3.12
// sidegrades) is built once but only shown once `save.hasCompletedAnyRoute()` – re-checked on every
// `show()`, not just at construction, so it appears the first time you revisit the kassa after your
// first completed route without needing the whole screen rebuilt.
import { t } from "../core/i18n.js";
import { RULES, BELAY_MODES, TICKET_TYPES, SIDEGRADES } from "../config.js";
import { isGamepadConnected } from "../core/input-source.js";

/** One-line name + description per belay mode (GDD §3.3) – UI copy, so it stays out of config.js. */
const BELAY_COPY = Object.freeze({
  continuous: { nameKey: "kassa.belay.continuous.name", descKey: "kassa.belay.continuous.desc" },
  smart: { nameKey: "kassa.belay.smart.name", descKey: "kassa.belay.smart.desc" },
  classic: { nameKey: "kassa.belay.classic.name", descKey: "kassa.belay.classic.desc" },
});
const NO_GEAR = "none";   // group()'s selectable-id convention has no room for `null` itself

/**
 * @param {{ root: HTMLElement, save?, operations?, defaultChoice?: { type?, sizeClassId?, belayMode?, equipmentId? },
 *   onConfirm: (choice: {type: string, sizeClassId: string, belayMode: string, equipmentId: string|null}) => void }} options
 *   `save` is read-only here (gates the equipment row's visibility, seeds its default selection).
 *   `operations` (M3b, optional, js/game/operations.js): shows today's storm warning line, re-checked
 *   on every `show()` like the equipment row above – omit it and the kassa never warns about weather.
 * @returns {{ visible: boolean, show(): void, hide(): void, confirmDefaults(): void, dispose(): void }}
 */
export function createKassa({ root, save = null, operations = null, defaultChoice = {}, onConfirm }) {
  const choice = {
    type: defaultChoice.type || TICKET_TYPES[0].id,
    sizeClassId: defaultChoice.sizeClassId || "adult",
    belayMode: BELAY_MODES.includes(defaultChoice.belayMode) ? defaultChoice.belayMode : "smart",
    equipmentId: defaultChoice.equipmentId && SIDEGRADES[defaultChoice.equipmentId] ? defaultChoice.equipmentId : NO_GEAR,
    // M4 (ROADMAP "Koop 2 lokal", GDD §3.11): only ever meaningful while a gamepad is actually
    // connected (the row below hides otherwise) – js/main.js reads this to call js/game/coop.js#enable().
    coop: false,
  };

  const screen = el("div", "screen kassa-screen");
  screen.hidden = true;
  const sheet = el("div", "panel kassa-sheet");
  sheet.append(el("h1", "", t("kassa.title")), el("p", "", t("kassa.subtitle")));
  // M3b storm warning (GDD §4, ROADMAP "Storm day at kassa shows a warning line") – re-checked in show()
  // below, exactly like the equipment/night-ticket rows already re-check their own unlock condition.
  const stormLine = el("div", "kassa-storm-note");
  stormLine.hidden = true;
  sheet.appendChild(stormLine);

  const ticketGroup = group(t("kassa.ticketLabel"), TICKET_TYPES.map((tt) => ({
    id: tt.id, name: t(tt.labelKey), desc: t(tt.descKey),
  })), choice.type, (id) => { choice.type = id; });
  sheet.appendChild(ticketGroup);
  // Night ticket (M2b, GDD §3.7): only offered once `save.hasCompletedAnyRoute()` – re-checked on every
  // `show()` below, exactly like the Equipment row already does, so it appears the moment it unlocks
  // without needing the whole screen rebuilt.
  const nightButton = ticketGroup.buttons.get("night");

  sheet.appendChild(group(t("kassa.sizeLabel"), RULES.sizeClasses.map((s) => ({
    id: s.id, name: t(s.labelKey), desc: t("kassa.sizeMinHeight", { cm: s.minCm }),
  })), choice.sizeClassId, (id) => { choice.sizeClassId = id; }));

  sheet.appendChild(group(t("kassa.belayLabel"), BELAY_MODES.map((mode) => ({
    id: mode, name: t(BELAY_COPY[mode].nameKey), desc: t(BELAY_COPY[mode].descKey),
  })), choice.belayMode, (id) => { choice.belayMode = id; }));

  const equipmentGroup = group(t("kassa.gearLabel"), [
    { id: NO_GEAR, name: t("kassa.gear.none.name"), desc: t("kassa.gear.none.desc") },
    ...Object.values(SIDEGRADES).map((g) => ({ id: g.id, name: t(g.labelKey), desc: t(g.descKey) })),
  ], choice.equipmentId, (id) => { choice.equipmentId = id; });
  equipmentGroup.hidden = true;   // shown only once save.hasCompletedAnyRoute() – see show() below
  sheet.appendChild(equipmentGroup);

  // M4 (ROADMAP "Koop 2 lokal", ADR-029): a plain toggle, not another card row – only ever offered
  // when a gamepad is actually plugged in (re-checked on every show() below, same "unlock condition
  // re-checked at show time" idea the equipment/night-ticket rows above already use). No rebinding UI:
  // the gamepad is always player 2, keyboard+mouse is always player 1 (js/game/coop.js).
  const coopRow = el("label", "opt-row opt-toggle kassa-coop-row");
  const coopBox = document.createElement("input");
  coopBox.type = "checkbox";
  coopBox.checked = choice.coop;
  coopBox.addEventListener("change", () => { choice.coop = coopBox.checked; });
  coopRow.append(coopBox, el("span", "opt-label", t("kassa.coopToggle")));
  const coopNote = el("div", "opt-note", t("kassa.coopToggleDesc"));
  coopRow.hidden = true;
  coopNote.hidden = true;
  sheet.append(coopRow, coopNote);

  const confirm = el("button", "btn confirm", t("kassa.confirm"));
  confirm.type = "button";
  confirm.addEventListener("click", apply);
  sheet.appendChild(confirm);

  screen.appendChild(sheet);
  root.appendChild(screen);

  function apply() {
    screen.hidden = true;
    onConfirm({ ...choice, equipmentId: choice.equipmentId === NO_GEAR ? null : choice.equipmentId });
  }

  return {
    get visible() { return !screen.hidden; },
    show() {
      if (save) {
        equipmentGroup.hidden = !save.hasCompletedAnyRoute();
        if (nightButton) nightButton.hidden = !save.hasCompletedAnyRoute();
      }
      if (operations && operations.isStormDay) { stormLine.textContent = operations.stormWarningLine; stormLine.hidden = false; }
      else stormLine.hidden = true;
      // M4: re-checked every time the kassa opens – a controller plugged in after boot (or unplugged
      // since) must not need a reload to show/hide the row.
      const gamepadIn = isGamepadConnected();
      coopRow.hidden = !gamepadIn;
      coopNote.hidden = !gamepadIn;
      if (!gamepadIn) { choice.coop = false; coopBox.checked = false; }
      screen.hidden = false;
    },
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
  // M2b: lets a caller hide/show one specific option later (the kassa's own night-ticket unlock gate)
  // without rebuilding the whole row.
  wrap.buttons = buttons;
  return wrap;
}

function el(tag, className, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
