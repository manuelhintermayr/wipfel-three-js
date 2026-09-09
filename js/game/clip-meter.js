// Re-clip feedback / "re-clip feedback" (ROADMAP M2a): measures how long the two-click ritual actually
// took in real time – from the first `belay:open`/`belay:click` after arriving at a *new* anchor to the
// moment `belay.bothOnSameAnchor()` is true there – and rewards a fast, clean transition with a small
// toast and a flow bonus (js/game/flow.js#creditCleanClip). Pure event wiring, no belay logic of its
// own (js/player/belay.js already is the ritual's state machine); this module only listens.
import { CLIP_METER } from "../config.js";
import { t } from "../core/i18n.js";
import { sidegradeEffects } from "../player/sidegrade.js";

/**
 * @param {{ belay, events, hud?, flow, isSuppressed?: () => boolean, isDisabled?: () => boolean }} options
 *   `isSuppressed` (the onboarding practice-anchor ritual, `js/game/briefing.js`) mutes the toast
 *   without disabling the flow bonus's own bookkeeping – a beginner's first fumbled ritual should not
 *   feel like it broke something, but there is nothing to reward there either since it is never "clean"
 *   on purpose. `isDisabled` (M2b: continuous belay mode) is stronger – there is no ritual at all to
 *   time there (js/player/interaction.js auto-advances the belay with no keypress), so neither the
 *   toast nor the flow bonus ever fires while it is true.
 * @returns {{ dispose(): void }}
 */
export function createClipMeter({ belay, events, hud = null, flow, isSuppressed = () => false, isDisabled = () => false }) {
  let ritualStart = null;      // performance.now() of the first open/click seen for the current anchor
  let scoredAnchor = null;     // last anchor id already judged, so settling on it twice never re-fires

  const noteStart = () => { if (ritualStart == null) ritualStart = performance.now(); };

  const onSettled = () => {
    const start = ritualStart;
    ritualStart = null;
    if (!belay.bothOnSameAnchor()) return;
    const anchor = belay.currentAnchor();
    if (anchor == null || anchor === scoredAnchor) return;
    scoredAnchor = anchor;
    if (isDisabled()) return;
    const seconds = (start != null ? (performance.now() - start) / 1000 : 0) + sidegradeEffects().reclipSecondsPenalty;
    if (seconds >= CLIP_METER.cleanSeconds) return;
    flow.creditCleanClip();
    if (hud && !isSuppressed()) hud.setNotice(t("notice.cleanClip"), 2.2);
  };

  const offs = [
    events.on("belay:open", noteStart),
    events.on("belay:click", () => { noteStart(); onSettled(); }),
  ];

  return { dispose() { for (const off of offs) off(); } };
}
