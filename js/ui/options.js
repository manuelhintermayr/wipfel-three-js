// Pause/options screen (ROADMAP M1.7). Esc opens it (js/main.js sets `loop.paused = true` for the
// duration – physics/gameplay get dt=0, exactly like the bare pause toggle this replaces); Esc again
// or Resume closes it. Everything under "Options" writes to `save.data.settings` (additive, schema-
// versioned – js/core/save.js) AND applies to the running game immediately, the same "live getter"
// idea js/player/belay.js#setMode already uses for the kassa's belay choice.
import { t, initI18n, currentLocale } from "../core/i18n.js";
import { GAME, OPTIONS, GRAPHICS } from "../config.js";
import { setMasterVolume, setCategoryVolume } from "../audio/synth.js";
import { setAssistMode } from "../player/assist.js";
import { renderControlsList } from "./options-controls.js";
import { CUSTOM_PARK_SCHEMA, isValidCustomPark } from "../core/save.js";
import { validateRoute, validatePark } from "../builder/builder-validate.js";

// Graphics presets (M2b): near/mid forest LOD distances scale together, so only `impostorNear`
// (js/config.js#GRAPHICS, "forest impostors from X m" = the mid threshold) needs to be authored per
// preset – `near` keeps the same fraction of it the High-quality default (45 m of 100 m) already used.
const FOREST_NEAR_RATIO = 0.45;

const { lookSensitivityMin: SENS_MIN, lookSensitivityMax: SENS_MAX } = OPTIONS;
const sensitivityToSlider = (v) => Math.round(((clamp(v, SENS_MIN, SENS_MAX) - SENS_MIN) / (SENS_MAX - SENS_MIN)) * 100);
const sliderToSensitivity = (pct) => SENS_MIN + (pct / 100) * (SENS_MAX - SENS_MIN);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * @param {{ root: HTMLElement, save, input, camera, loop, ticket?, onEndDay: () => void,
 *   onCourseMap: () => void, onBuilder?: () => void, renderer?, sky?, forest?, groundDetail?, terrain? }} options
 *   `camera` is the player's camera controller (`player.camera`, exposes `setReducedMotion`).
 *   `ticket` (optional) is the pure clock (js/game/ticket.js) – only its `.started` getter is read,
 *   to grey out "End day" when no ticket is running. `renderer`/`sky`/`forest`/`groundDetail` (M2b,
 *   all optional) are what the Graphics section actually adjusts – omit any of them and that one part
 *   of a preset silently does nothing, exactly like `ticket` above. `onBuilder` (M3a, optional): shows
 *   the "Park builder" menu row at all – omit it (older dev harnesses, tests) and the row never appears.
 *   `terrain` (M3b, optional, ADR-029 "Teilen ist dateibasiert"): lets the Sharing section's import
 *   button run the real layout validation against an imported file – omit it and import still applies
 *   the park (with every route forced to "needs walkthrough") but skips the up-front issue count.
 * @returns {{ visible: boolean, open(): void, close(): void, toggle(): void, applyAll(): void, dispose(): void }}
 */
export function createOptions({ root, save, input, camera, loop, ticket = null, onEndDay, onCourseMap, onBuilder = null, renderer = null, sky = null, forest = null, groundDetail = null, terrain = null }) {
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
  /**
   * Graphics preset (M2b, ROADMAP "Grafikoptionen"): pixel-ratio cap, shadow map size/off, forest
   * impostor distance and ground-detail radius all move together – each target module owns *how* its
   * own piece changes (js/world/sky.js#setShadowQuality disposes the old shadow map itself, etc.), this
   * only decides *what* each preset asks for.
   */
  function applyGraphicsLive(id) {
    const preset = GRAPHICS.presets[id] || GRAPHICS.presets.high;
    if (renderer) renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatioCap));
    if (sky) sky.setShadowQuality(preset.shadowMapSize);
    if (forest) forest.setLodDistances({ near: Math.round(preset.impostorNear * FOREST_NEAR_RATIO), mid: preset.impostorNear });
    if (groundDetail) groundDetail.setDetailScale(preset.groundDetailScale);
  }

  /** Bulk-apply a freshly loaded save at boot – no persistence, the values already came from storage. */
  function applyAll() {
    const s = save.data.settings;
    for (const category of Object.keys(s.audio)) applyAudioLive(category, s.audio[category]);
    if (s.lookSensitivity != null) applyLookSensitivityLive(s.lookSensitivity);
    applyInvertYLive(s.invertY);
    applyReducedCameraMotionLive(s.reducedCameraMotion);
    applyReducedMotionLive(s.reducedMotion);
    applyAssistLive(s.assist);
    applyGraphicsLive(s.graphics);
  }

  // --- control handlers: live-apply, then persist -----------------------------------------------
  const setAudioCategory = (category, value) => { applyAudioLive(category, value); save.updateSettings({ audio: { [category]: value } }); };
  const setLookSensitivity = (value) => { applyLookSensitivityLive(value); save.updateSettings({ lookSensitivity: value }); };
  const setInvertY = (on) => { applyInvertYLive(on); save.updateSettings({ invertY: on }); };
  const setReducedCameraMotion = (on) => { applyReducedCameraMotionLive(on); save.updateSettings({ reducedCameraMotion: on }); };
  const setReducedMotion = (on) => { applyReducedMotionLive(on); save.updateSettings({ reducedMotion: on }); };
  const setAssist = (on) => { applyAssistLive(on); save.updateSettings({ assist: on }); };
  // M4 (ROADMAP "geteilte Physik", GDD §3.11/§4): js/game/coop.js reads `save.data.settings.
  // sharedPhysics` live every frame – nothing to "apply" to the running game beyond the save write
  // itself, unlike every other toggle above.
  const setSharedPhysics = (on) => save.updateSettings({ sharedPhysics: on });
  const setGraphics = (id) => { applyGraphicsLive(id); save.updateSettings({ graphics: id }); render(); };

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
    // M3a (GDD §4 "operator gameplay"): the builder replaces the whole screen itself, so this just
    // closes the pause panel and hands off – js/main.js wires `onBuilder` to `builder.enter()`.
    if (onBuilder) menu.appendChild(button(t("options.builder"), () => { api.close(); onBuilder(); }));
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
      pillButton("English", currentLocale() === "en", () => switchLocale("en")),
      pillButton("Deutsch", currentLocale() === "de", () => switchLocale("de")),
    );
    localeRow.append(el("span", "opt-label", t("options.gameplay.locale")), localePicker);

    const section = el("div", "options-section");
    section.append(
      el("h2", "", t("options.section.gameplay")),
      toggleRow(t("options.gameplay.assist"), save.data.settings.assist, setAssist),
      el("div", "opt-note", t("options.gameplay.assistDesc")),
      // M4 (ROADMAP "Koop 2 lokal", GDD §3.11/§4 "im Spiel erlaubt, wenn die Gruppe es einschaltet"):
      // shown regardless of whether co-op is active right now – it only ever *does* anything while
      // js/game/coop.js is running, exactly like the night-ticket/equipment rows only ever matter once
      // their own unlock condition holds, but there is no harm in the toggle simply existing meanwhile.
      toggleRow(t("options.gameplay.sharedPhysics"), save.data.settings.sharedPhysics, setSharedPhysics),
      el("div", "opt-note", t("options.gameplay.sharedPhysicsDesc")),
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

  // --- sharing (M3b, ADR-029 "Teilen ist dateibasiert": JSON export/import, never a network) ----------
  let sharingNotice = null;   // { text, isError } – survives the next render() so a result stays visible

  /** Downloads only the `customPark` half of the save (not best times/settings/etc.) plus a free-text
   *  author string, as a plain JSON file – a browser Blob + a throwaway `<a download>`, the standard
   *  client-side download pattern (no server, no CDN, ADR-001). */
  function exportPark(author) {
    const cp = save.data.customPark;
    if (!cp) { sharingNotice = { text: t("options.sharing.noCustomPark"), isError: true }; render(); return; }
    const payload = { schema: CUSTOM_PARK_SCHEMA, kind: "wipfel-park", author: String(author || "").trim(), parkDef: cp.parkDef, routeStatus: cp.routeStatus };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cp.parkDef.id || "wipfel-park"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /** Every route's own trees/edges/zip re-checked against js/park/layout-validate.js's real rules
   *  (js/builder/builder-validate.js, ADR-003 "the builder writes what the generator emits") – informs
   *  the operator up front rather than silently importing a broken park; it does not block the import
   *  itself, the same way a hand-edited route with issues stays importable/openable as a "Draft" in the
   *  builder rather than being rejected outright. */
  function issueCountFor(parkDef) {
    if (!terrain) return 0;
    let count = 0;
    for (const route of parkDef.routes) {
      const otherRouteTreeIndexes = new Set();
      for (const other of parkDef.routes) {
        if (other.id === route.id) continue;
        for (const p of other.platforms) otherRouteTreeIndexes.add(p.treeIndex);
      }
      if (validateRoute(route, { terrain, heroTrees: parkDef.heroTrees, otherRouteTreeIndexes }).issues.length) count += 1;
    }
    if (!validatePark({ heroTrees: parkDef.heroTrees }).ok) count += 1;
    return count;
  }

  /** Applies an imported file's park: forces every route back to "needs walkthrough" (GDD §4's own
   *  inspection-before-opening rule, ADR-029) regardless of what the file itself claims, structurally
   *  validated the same way a page load's own save.js#normalize() never trusts stored data either. */
  function importParkFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try { parsed = JSON.parse(String(reader.result)); } catch { sharingNotice = { text: t("options.sharing.importInvalid"), isError: true }; render(); return; }
      if (!isValidCustomPark(parsed)) { sharingNotice = { text: t("options.sharing.importInvalid"), isError: true }; render(); return; }
      const routeStatus = Object.fromEntries(parsed.parkDef.routes.map((r) => [r.id, { walked: false }]));
      save.setCustomPark({ parkDef: parsed.parkDef, routeStatus });
      const issues = issueCountFor(parsed.parkDef);
      sharingNotice = { text: issues > 0 ? t("options.sharing.importSuccessIssues", { n: issues }) : t("options.sharing.importSuccess"), isError: false };
      render();
    };
    reader.onerror = () => { sharingNotice = { text: t("options.sharing.importInvalid"), isError: true }; render(); };
    reader.readAsText(file);
  }

  function buildSharingSection() {
    const section = el("div", "options-section");
    section.appendChild(el("h2", "", t("options.section.sharing")));

    const authorRow = el("div", "opt-row");
    authorRow.appendChild(el("span", "opt-label", t("options.sharing.authorLabel")));
    const authorInput = document.createElement("input");
    authorInput.type = "text";
    authorInput.maxLength = 40;
    authorInput.className = "opt-text-input";
    authorRow.appendChild(authorInput);
    section.appendChild(authorRow);

    const actions = el("div", "opt-sharing-actions");
    const exportBtn = button(t("options.sharing.export"), () => exportPark(authorInput.value));
    exportBtn.disabled = !save.data.customPark;
    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = "application/json";
    importInput.hidden = true;
    importInput.addEventListener("change", () => {
      const file = importInput.files && importInput.files[0];
      if (file) importParkFile(file);
      importInput.value = "";
    });
    const importBtn = button(t("options.sharing.import"), () => importInput.click());
    actions.append(exportBtn, importBtn, importInput);
    section.appendChild(actions);

    section.appendChild(el("div", "opt-note", t("options.sharing.exportNote")));
    section.appendChild(el("div", "opt-note", t("options.sharing.importNote")));
    if (sharingNotice) section.appendChild(el("div", `opt-note${sharingNotice.isError ? " opt-note-error" : ""}`, sharingNotice.text));
    return section;
  }

  /** Graphics (M2b, ROADMAP): a preset row, same three-pill look the language picker already uses. */
  function buildGraphicsSection() {
    const current = save.data.settings.graphics;
    const picker = el("div", "opt-locale");
    for (const id of GRAPHICS.order) picker.appendChild(pillButton(t(GRAPHICS.presets[id].labelKey), id === current, () => setGraphics(id)));
    const row = el("div", "opt-row");
    row.append(el("span", "opt-label", t("options.graphics.quality")), picker);
    const section = el("div", "options-section");
    section.append(el("h2", "", t("options.section.graphics")), row);
    return section;
  }

  function render() {
    sheet.replaceChildren();
    const sections = el("div", "options-sections");
    sections.append(buildAudioSection(), buildCameraSection(), buildGraphicsSection(), buildGameplaySection(), buildControlsSection(), buildSharingSection());
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

/** Small pill toggle – the language picker and (M2b) the graphics preset row both use this look. */
function pillButton(label, selected, onClick) {
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
