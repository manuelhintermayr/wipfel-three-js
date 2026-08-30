// Pause/options screen (ROADMAP M1.7). Esc opens it (js/main.js sets `loop.paused = true` for the
// duration – physics/gameplay get dt=0, exactly like the bare pause toggle this replaces); Esc again
// or Resume closes it. Everything under "Options" writes to `save.data.settings` (additive, schema-
// versioned – js/core/save.js) AND applies to the running game immediately, the same "live getter"
// idea js/player/belay.js#setMode already uses for the kassa's belay choice.
import { t, initI18n, currentLocale } from "../core/i18n.js";
import { GAME, OPTIONS } from "../config.js";
import { setMasterVolume, setCategoryVolume } from "../audio/synth.js";
import { setAssistMode } from "../player/assist.js";
import { renderControlsList } from "./options-controls.js";

const { lookSensitivityMin: SENS_MIN, lookSensitivityMax: SENS_MAX } = OPTIONS;
const sensitivityToSlider = (v) => Math.round(((clamp(v, SENS_MIN, SENS_MAX) - SENS_MIN) / (SENS_MAX - SENS_MIN)) * 100);
const sliderToSensitivity = (pct) => SENS_MIN + (pct / 100) * (SENS_MAX - SENS_MIN);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * @param {{ root: HTMLElement, save, input, camera, loop, ticket?, onEndDay: () => void,
 *   onCourseMap: () => void }} options
 *   `camera` is the player's camera controller (`player.camera`, exposes `setReducedMotion`).
 *   `ticket` (optional) is the pure clock (js/game/ticket.js) – only its `.started` getter is read,
 *   to grey out "End day" when no ticket is running.
 * @returns {{ visible: boolean, open(): void, close(): void, toggle(): void, applyAll(): void, dispose(): void }}
 */
export function createOptions({ root, save, input, camera, loop, ticket = null, onEndDay, onCourseMap }) {
  const screen = el("div", "screen options-screen");
  screen.hidden = true;
  const sheet = el("div", "panel options-sheet");
  screen.appendChild(sheet);
  root.appendChild(screen);

  // --- live-apply helpers: one place that knows how to push a setting into the running game --------
  function applyAudioLive(category, value) {
    if (category === "master") setMasterVolume(value / 100);
    else setCategoryVolume(category, value / 100);
  }
  const applyLookSensitivityLive = (v) => { input.bindings.lookSensitivity = v; };
  const applyInvertYLive = (on) => { input.invertY = on; };
  const applyReducedCameraMotionLive = (on) => camera.setReducedMotion(on);
  const applyReducedMotionLive = (on) => document.body.classList.toggle("reduced-motion", on);
  const applyAssistLive = (on) => setAssistMode(on);

  /** Bulk-apply a freshly loaded save at boot – no persistence, the values already came from storage. */
  function applyAll() {
    const s = save.data.settings;
    for (const category of Object.keys(s.audio)) applyAudioLive(category, s.audio[category]);
    if (s.lookSensitivity != null) applyLookSensitivityLive(s.lookSensitivity);
    applyInvertYLive(s.invertY);
    applyReducedCameraMotionLive(s.reducedCameraMotion);
    applyReducedMotionLive(s.reducedMotion);
    applyAssistLive(s.assist);
  }

  // --- control handlers: live-apply, then persist -----------------------------------------------
  const setAudioCategory = (category, value) => { applyAudioLive(category, value); save.updateSettings({ audio: { [category]: value } }); };
  const setLookSensitivity = (value) => { applyLookSensitivityLive(value); save.updateSettings({ lookSensitivity: value }); };
  const setInvertY = (on) => { applyInvertYLive(on); save.updateSettings({ invertY: on }); };
  const setReducedCameraMotion = (on) => { applyReducedCameraMotionLive(on); save.updateSettings({ reducedCameraMotion: on }); };
  const setReducedMotion = (on) => { applyReducedMotionLive(on); save.updateSettings({ reducedMotion: on }); };
  const setAssist = (on) => { applyAssistLive(on); save.updateSettings({ assist: on }); };

  /** Re-run initI18n and rebuild this panel's own labels immediately (js/core/i18n.js is a module-level
   * singleton, so every other `t()` call in the game – HUD prompts, the next banner – already re-
   * resolves in the new language on its next render; only already-built, never-rebuilt DOM stays old). */
  async function switchLocale(locale) {
    if (locale === currentLocale()) return;
    await initI18n({ locale });
    save.setLocale(locale);
    render();
  }

  function buildMenu() {
    const wrap = el("div", "options-menu-wrap");
    const menu = el("div", "options-menu");
    menu.append(
      button(t("options.resume"), () => api.close()),
      button(t("options.courseMap"), () => { api.close(); onCourseMap(); }),
    );
    const endDayBtn = button(t("options.endDay"), () => { onEndDay(); api.close(); });
    const active = !!(ticket && ticket.started);
    endDayBtn.disabled = !active;
    menu.appendChild(endDayBtn);
    wrap.appendChild(menu);
    if (!active) wrap.appendChild(el("div", "opt-note", t("options.noActiveDay")));
    return wrap;
  }

  function buildAudioSection() {
    const s = save.data.settings.audio;
    const section = el("div", "options-section");
    section.append(
      el("h2", "", t("options.section.audio")),
      sliderRow(t("options.audio.master"), s.master, (v) => setAudioCategory("master", v)),
      sliderRow(t("options.audio.sfx"), s.sfx, (v) => setAudioCategory("sfx", v)),
      sliderRow(t("options.audio.ambience"), s.ambience, (v) => setAudioCategory("ambience", v)),
      sliderRow(t("options.audio.ui"), s.ui, (v) => setAudioCategory("ui", v)),
      el("div", "opt-note", t("options.audio.futureNote")),
    );
    return section;
  }

  function buildCameraSection() {
    const s = save.data.settings;
    const sensitivity = s.lookSensitivity != null ? s.lookSensitivity : input.bindings.lookSensitivity;
    const section = el("div", "options-section");
    section.append(
      el("h2", "", t("options.section.camera")),
      sliderRow(t("options.camera.lookSensitivity"), sensitivityToSlider(sensitivity), (v) => setLookSensitivity(sliderToSensitivity(v))),
      toggleRow(t("options.camera.invertY"), input.invertY, setInvertY),
      toggleRow(t("options.camera.reducedCameraMotion"), s.reducedCameraMotion, setReducedCameraMotion),
      el("div", "opt-note", t("options.camera.reducedCameraMotionDesc")),
      toggleRow(t("options.camera.reducedMotion"), s.reducedMotion, setReducedMotion),
      el("div", "opt-note", t("options.camera.reducedMotionDesc")),
    );
    return section;
  }

  function buildGameplaySection() {
    const localeRow = el("div", "opt-row");
    const localePicker = el("div", "opt-locale");
    localePicker.append(
      localeButton("English", currentLocale() === "en", () => switchLocale("en")),
      localeButton("Deutsch", currentLocale() === "de", () => switchLocale("de")),
    );
    localeRow.append(el("span", "opt-label", t("options.gameplay.locale")), localePicker);

    const section = el("div", "options-section");
    section.append(
      el("h2", "", t("options.section.gameplay")),
      toggleRow(t("options.gameplay.assist"), save.data.settings.assist, setAssist),
      el("div", "opt-note", t("options.gameplay.assistDesc")),
      localeRow,
      el("div", "opt-note", t("options.gameplay.localeNote")),
      el("div", "opt-note", t("options.gameplay.colourShape")),
    );
    return section;
  }

  function buildControlsSection() {
    const section = el("div", "options-section");
    section.append(
      el("h2", "", t("options.section.controls")),
      el("div", "opt-note", t("options.controls.note")),
      renderControlsList(input.bindings),
    );
    return section;
  }

  function render() {
    sheet.replaceChildren();
    const sections = el("div", "options-sections");
    sections.append(buildAudioSection(), buildCameraSection(), buildGameplaySection(), buildControlsSection());
    sheet.append(
      el("h1", "", t("options.title")),
      buildMenu(),
      sections,
      el("div", "options-version", t("options.version", { version: GAME.version })),
    );
  }

  render();

  const api = {
    get visible() { return !screen.hidden; },
    open() {
      render();
      screen.hidden = false;
      loop.paused = true;
      if (document.exitPointerLock) document.exitPointerLock();
    },
    close() {
      screen.hidden = true;
      loop.paused = false;
    },
    toggle() { if (api.visible) api.close(); else api.open(); },
    applyAll,
    dispose() { screen.remove(); },
  };
  return api;
}

function sliderRow(labelText, initial0to100, onInput, format = (v) => `${v}%`) {
  const row = el("div", "opt-row");
  const slider = document.createElement("input");
  slider.type = "range"; slider.min = "0"; slider.max = "100"; slider.step = "1";
  const start = Math.round(clamp(initial0to100, 0, 100));
  slider.value = String(start);
  const valueEl = el("span", "opt-value", format(start));
  slider.addEventListener("input", () => {
    const v = Number(slider.value);
    valueEl.textContent = format(v);
    onInput(v);
  });
  row.append(el("span", "opt-label", labelText), slider, valueEl);
  return row;
}

function toggleRow(labelText, initial, onChange) {
  const row = el("label", "opt-row opt-toggle");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = !!initial;
  box.addEventListener("change", () => onChange(box.checked));
  row.append(box, el("span", "opt-label", labelText));
  return row;
}

function localeButton(label, selected, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "opt-locale-btn" + (selected ? " selected" : "");
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function button(label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function el(tag, className, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
