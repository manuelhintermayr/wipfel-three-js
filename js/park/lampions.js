// Lampions strung between platforms on the two blue night routes (ROADMAP M2b, RESEARCH-DATA §1:
// "night climbing (lanterns, headlamps)"). Pure flavour, exactly like js/park/wichtel.js –
// no anchors, no physics, not part of the belay/occupancy pipeline. Reads `parkDef` + the terrain
// sampler directly, the same "second small loader" pattern js/park/signs.js and js/ui/map-render.js
// already use, so it never depends on the built `course`.
//
// Budget (GDD "no real point lights"): every lampion is two instances – a small opaque "paper lantern"
// sphere (always a warm colour, day or night) and a soft additive glow quad behind it that fades in
// with `sky.night` and is billboarded towards the camera each frame. Two draw calls for the whole park,
// regardless of how many lampions there are.
import * as THREE from "three";
import { NIGHT } from "../config.js";

/**
 * @param {{ scene: THREE.Scene, parkDef, terrain: { heightAt(x:number,z:number): number }, rng }} options
 * @returns {{ group: THREE.Group, update(nightFactor: number, cameraPosition: THREE.Vector3): void, dispose(): void }}
 */
export function createLampions({ scene, parkDef, terrain, rng }) {
  const spots = [];   // { x, y, z }
  const routes = parkDef.routes.filter((r) => r.category === "blue").slice(0, NIGHT.lampionRouteCount);

  for (const route of routes) {
    for (let i = 1; i < route.platforms.length; i++) {
      const a = route.platforms[i - 1], b = route.platforms[i];
      const treeA = parkDef.heroTrees[a.treeIndex], treeB = parkDef.heroTrees[b.treeIndex];
      if (!treeA || !treeB) continue;
      const yA = terrain.heightAt(treeA.x, treeA.z) + a.deckHeight;
      const yB = terrain.heightAt(treeB.x, treeB.z) + b.deckHeight;
      for (let k = 1; k <= NIGHT.lampionsPerEdge; k++) {
        const u = k / (NIGHT.lampionsPerEdge + 1);
        spots.push({
          x: treeA.x + (treeB.x - treeA.x) * u + rng.float(-0.25, 0.25),
          y: yA + (yB - yA) * u + NIGHT.lampionHeightAbovePath + rng.float(-0.12, 0.12),
          z: treeA.z + (treeB.z - treeA.z) * u + rng.float(-0.25, 0.25),
        });
      }
    }
  }

  const group = new THREE.Group();
  group.name = "lampions";
  const count = Math.max(1, spots.length);

  const bulbMat = new THREE.MeshBasicMaterial({ color: NIGHT.lampionColour, toneMapped: false });
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(NIGHT.lampionRadius, 10, 8), bulbMat, count);
  bulbs.name = "lampion-bulbs";
  bulbs.count = spots.length;

  const glowMat = new THREE.MeshBasicMaterial({
    color: NIGHT.lampionColour, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  const glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(NIGHT.lampionGlowRadius * 2, NIGHT.lampionGlowRadius * 2), glowMat, count);
  glow.name = "lampion-glow";
  glow.count = spots.length;
  glow.frustumCulled = false;
  bulbs.frustumCulled = false;

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  spots.forEach((spot, i) => {
    p.set(spot.x, spot.y, spot.z);
    bulbs.setMatrixAt(i, m.compose(p, q.identity(), s));
  });
  bulbs.instanceMatrix.needsUpdate = true;
  group.add(bulbs, glow);
  scene.add(group);

  const toCam = new THREE.Vector3();
  let lastNight = -1;

  return {
    group,
    /** Gameplay/render phase: fades the glow with `sky.night` and keeps every glow quad facing the
     *  camera (a handful of instances – cheap to rebuild every frame). */
    update(nightFactor, cameraPosition) {
      const night = Math.max(0, Math.min(1, nightFactor || 0));
      if (Math.abs(night - lastNight) > 0.002) { glowMat.opacity = night * 0.85; lastNight = night; }
      if (!cameraPosition || night <= 0.01) return;
      spots.forEach((spot, i) => {
        p.set(spot.x, spot.y, spot.z);
        toCam.set(cameraPosition.x - spot.x, 0, cameraPosition.z - spot.z);
        const yaw = Math.atan2(toCam.x, toCam.z);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        glow.setMatrixAt(i, m.compose(p, q, s));
      });
      glow.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      scene.remove(group);
      bulbs.geometry.dispose(); bulbMat.dispose();
      glow.geometry.dispose(); glowMat.dispose();
    },
  };
}
