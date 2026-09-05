// The climber's own headlamp (ROADMAP M2b, GDD §3.7 "Nachtklettern mit Stirnlampe"). A single soft
// spotlight parented to the rig's head anchor, always on once `sky.night` crosses the halfway point –
// no separate "night mode" flag anywhere else needed, the same continuous dusk→night value everything
// else (stars, hemi light, exposure) already reads drives this too. No shadow casting: one more shadow
// caster moving with the player would double a chunk of the shadow pass for a cone nobody is meant to
// scrutinise (the same budget call js/park/signs.js and js/npc/guest-rig.js already made for their own
// small, low-value geometry).
import * as THREE from "three";
import { NIGHT } from "../config.js";

const DEG = Math.PI / 180;
const NIGHT_ON_THRESHOLD = 0.5;   // sky.night above this = "on" for the headlamp's own purposes

/**
 * @param {{ rig: { attach: { head: THREE.Object3D } } }} options the player rig (js/player/rig.js)
 * @returns {{ update(nightFactor: number): void, dispose(): void }}
 */
export function createHeadlamp({ rig }) {
  const light = new THREE.SpotLight(
    NIGHT.headlampColour, 0, NIGHT.headlampRange, NIGHT.headlampAngleDeg * DEG, NIGHT.headlampPenumbra, 1.2,
  );
  light.name = "headlamp";
  light.castShadow = false;
  // three.js trap: SpotLight/DirectionalLight both default `position` to `Object3D.DEFAULT_UP`
  // (0,1,0), not the origin – so the light-to-target vector is never degenerate out of the box. Left
  // alone, this light would sit 1m above the "eyes" anchor while aiming at a target only ~0.04m below
  // it, i.e. a beam pointing steeply at the ground instead of roughly where the player is looking.
  light.position.set(0, 0, 0);
  const target = new THREE.Object3D();
  target.position.set(0, -0.04, 1);   // slightly down and straight ahead, in the head anchor's local space
  rig.attach.head.add(light);
  rig.attach.head.add(target);
  light.target = target;
  let on = false;

  return {
    /** Gameplay phase, once per frame – cheap enough not to bother throttling. */
    update(nightFactor) {
      const wantOn = (nightFactor || 0) >= NIGHT_ON_THRESHOLD;
      if (wantOn === on) return;
      on = wantOn;
      light.intensity = on ? NIGHT.headlampIntensity : 0;
    },
    dispose() {
      light.removeFromParent();
      target.removeFromParent();
      light.dispose();
    },
  };
}
