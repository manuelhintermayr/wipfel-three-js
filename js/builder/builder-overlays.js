// 3D visual feedback for builder mode (M3a): candidate trees ghost-marked (green ok / grey too weak /
// red conflict), the selected route's lifeline highlighted end to end (its own platforms + edges,
// drawn from the DRAFT data so a brand-new, not-yet-built route previews correctly even before the
// world ever rebuilds around it – js/main.js's course/forest/terrain stay visible and rendered behind
// this the whole time, this module only adds emphasis on top). Pure THREE, no draft/DOM knowledge –
// js/builder/builder.js feeds it plain points every time the selection or the candidate list changes.
import * as THREE from "three";

const MARKER = Object.freeze({
  radius: 0.42, height: 1.7, segments: 7,
  colourOk: 0x58c56b, colourWeak: 0x8a8a8a, colourConflict: 0xe0564c,
  platformRadius: 0.5,
});
const ZIP_COLOUR = 0x3fa7ff;
// M3b operator overlays (GDD §4 "Overlays: Warten·Angst·Rettung", builder-ui.js's toolbar toggle row):
// small floating spheres colour-coded green→red by how bad the reading is, plus the rescue layer's own
// hut markers and coverage rings. Kept as plain THREE.InstancedMesh per layer, same trick `setCandidates`
// below already uses, so four overlays together are still a handful of draw calls.
const HEAT_RADIUS = 0.5;
const HEAT_LOW = 0x58c56b, HEAT_HIGH = 0xe0564c;
const HUT_COLOUR = 0xf2c635;

/**
 * @param {{ scene: THREE.Scene }} options
 * @returns {{ group: THREE.Group,
 *   setCandidates(points: Array<{x:number,y:number,z:number,status:"ok"|"weak"|"conflict"}>): void,
 *   setRoute(route: { points: Array<{x,y,z}>, colour: number, zip: {from:{x,y,z}, to:{x,y,z}}|null }|null): void,
 *   getLabels(): Array<{x:number,y:number,z:number,text:string}>,
 *   dispose(): void }}
 */
export function createBuilderOverlays({ scene }) {
  const group = new THREE.Group();
  group.name = "builder-overlays";
  scene.add(group);

  const markerGeometry = new THREE.ConeGeometry(MARKER.radius, MARKER.height, MARKER.segments);
  markerGeometry.translate(0, MARKER.height / 2, 0);
  const markerMaterial = new THREE.MeshBasicMaterial({ vertexColors: false, transparent: true, opacity: 0.88 });
  let candidateMesh = null;

  const platformGeometry = new THREE.SphereGeometry(MARKER.platformRadius, 10, 8);
  const platformMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  let platformMesh = null;
  let lifelineObj = null;
  let zipObj = null;
  let labels = [];

  // --- M3b operator overlays -------------------------------------------------------------------------
  const heatGeometry = new THREE.SphereGeometry(HEAT_RADIUS, 10, 8);
  let waitMesh = null, fearMesh = null, treeHealthMesh = null, rescuePlatformMesh = null;
  let rescueProps = [];   // plain THREE.Mesh per post: one hut cone + one coverage ring (shared geometry/material below)
  const hutGeometry = new THREE.ConeGeometry(0.45, 1.1, 6);
  const hutMaterial = new THREE.MeshBasicMaterial({ color: HUT_COLOUR });
  let ringGeometry = null, ringMaterial = null;   // radius depends on the live rescue timer/walk-speed tuning, rebuilt per call

  const lerpColour = (lo, hi, u) => new THREE.Color(lo).lerp(new THREE.Color(hi), Math.max(0, Math.min(1, u)));

  /** Rebuilds one colour-coded instanced-sphere layer from `{x,y,z,value}` points (`value` 0..1, 0 = the
   *  good end of `lowColour`). Shared by wait/fear/tree-health – only the input points and hue differ. */
  function rebuildHeatMesh(oldMesh, points, lowColour = HEAT_LOW, highColour = HEAT_HIGH) {
    if (oldMesh) { group.remove(oldMesh); oldMesh.geometry.dispose(); oldMesh.material.dispose(); }
    if (!points || !points.length) return null;
    const mesh = new THREE.InstancedMesh(heatGeometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 }), points.length);
    mesh.name = "builder-heat-overlay";
    const m = new THREE.Matrix4(), colour = new THREE.Color();
    points.forEach((p, i) => {
      m.setPosition(p.x, p.y + 0.2, p.z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, colour.copy(lerpColour(lowColour, highColour, p.value)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    return mesh;
  }

  /** Only removes the per-post meshes from the group – their geometry/material are the module-level
   *  `hutGeometry`/`hutMaterial`/`ringGeometry`/`ringMaterial` shared across every post and disposed
   *  separately (in `setRescueOverlay` when the ring's own radius changes, and once in `dispose()`). */
  function disposeRescueProps() {
    for (const obj of rescueProps) group.remove(obj);
    rescueProps = [];
  }

  function disposeCandidateMesh() {
    if (!candidateMesh) return;
    group.remove(candidateMesh);
    candidateMesh.dispose();
    candidateMesh = null;
  }
  function disposeRouteObjects() {
    for (const obj of [platformMesh, lifelineObj, zipObj]) if (obj) { group.remove(obj); obj.geometry.dispose(); obj.material.dispose(); }
    platformMesh = null; lifelineObj = null; zipObj = null;
    labels = [];
  }

  const colourFor = (status) => (status === "weak" ? MARKER.colourWeak : status === "conflict" ? MARKER.colourConflict : MARKER.colourOk);

  return {
    group,

    /** Rebuilds the whole ghost-tree instanced mesh – called whenever the survey/candidate list changes
     *  (rare: a fresh draft, or a candidate just got adopted into a platform). */
    setCandidates(points) {
      disposeCandidateMesh();
      if (!points.length) return;
      candidateMesh = new THREE.InstancedMesh(markerGeometry, markerMaterial, points.length);
      candidateMesh.name = "builder-candidates";
      const m = new THREE.Matrix4();
      const colour = new THREE.Color();
      points.forEach((p, i) => {
        m.setPosition(p.x, p.y, p.z);
        candidateMesh.setMatrixAt(i, m);
        candidateMesh.setColorAt(i, colour.setHex(colourFor(p.status)));
      });
      candidateMesh.instanceMatrix.needsUpdate = true;
      if (candidateMesh.instanceColor) candidateMesh.instanceColor.needsUpdate = true;
      group.add(candidateMesh);
    },

    /** `route: null` clears the highlight (nothing selected). `points` = platform positions (deck top,
     *  entry→…→last); `zip` (optional) = the departure/landing pair, drawn as a dashed blue segment. */
    setRoute(route) {
      disposeRouteObjects();
      if (!route || route.points.length === 0) return;
      const positions = route.points.flatMap((p) => [p.x, p.y, p.z]);
      const lineGeom = new THREE.BufferGeometry();
      lineGeom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      lifelineObj = new THREE.Line(lineGeom, new THREE.LineBasicMaterial({ color: route.colour, linewidth: 2 }));
      group.add(lifelineObj);

      if (route.points.length) {
        platformMesh = new THREE.InstancedMesh(platformGeometry, platformMaterial.clone(), route.points.length);
        platformMesh.material.color.setHex(route.colour);
        const m = new THREE.Matrix4();
        route.points.forEach((p, i) => { m.setPosition(p.x, p.y, p.z); platformMesh.setMatrixAt(i, m); });
        platformMesh.instanceMatrix.needsUpdate = true;
        group.add(platformMesh);
      }

      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1], b = route.points[i];
        labels.push(segmentLabel(a, b));
      }

      if (route.zip) {
        const zipGeom = new THREE.BufferGeometry();
        zipGeom.setAttribute("position", new THREE.Float32BufferAttribute([route.zip.from.x, route.zip.from.y, route.zip.from.z, route.zip.to.x, route.zip.to.y, route.zip.to.z], 3));
        const zipMat = new THREE.LineDashedMaterial({ color: ZIP_COLOUR, dashSize: 1.4, gapSize: 0.8 });
        zipObj = new THREE.Line(zipGeom, zipMat);
        zipObj.computeLineDistances();
        group.add(zipObj);
        labels.push(segmentLabel(route.zip.from, route.zip.to));
      }
    },

    /** World-space label positions for every rendered segment (span in metres) – js/builder/builder-ui.js
     *  projects these to screen space each frame; kept as plain data so this module never touches DOM. */
    getLabels() { return labels; },

    // --- M3b operator overlays (js/builder/builder-ui.js's toolbar toggle row) -----------------------
    /** `points`: `[{x,y,z,value}]`, `value` 0..1 – js/builder/builder.js normalises whatever
     *  js/npc/agents.js#waitStats() returns against a fixed "long wait" ceiling before calling this. */
    setWaitOverlay(points) { waitMesh = rebuildHeatMesh(waitMesh, points); },
    /** Same shape as `setWaitOverlay` – js/npc/agents.js#fearStats() normalised against a small ceiling. */
    setFearOverlay(points) { fearMesh = rebuildHeatMesh(fearMesh, points); },
    /** `points`: `[{x,y,z,value}]`, `value` = 1 - tree.health (so a sick tree reads red, a healthy one green). */
    setTreeHealthOverlay(points) { treeHealthMesh = rebuildHeatMesh(treeHealthMesh, points); },
    /** `view`: `{ posts: [{x,y,z}], radiusM, platforms: [{x,y,z,covered}] }`, or `null` to clear – a hut
     *  cone + a translucent coverage ring per post, plus every platform recoloured green/red by
     *  js/builder/builder-metrics.js#rescueCoverage's own verdict. */
    setRescueOverlay(view) {
      disposeRescueProps();
      rescuePlatformMesh = rebuildHeatMesh(rescuePlatformMesh, null);   // clears without a stray reference
      if (!view) return;
      if (ringGeometry) ringGeometry.dispose();
      if (ringMaterial) ringMaterial.dispose();
      ringGeometry = new THREE.RingGeometry(Math.max(0.2, view.radiusM - 0.5), view.radiusM, 48);
      ringMaterial = new THREE.MeshBasicMaterial({ color: HUT_COLOUR, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false });
      for (const post of view.posts) {
        const hut = new THREE.Mesh(hutGeometry, hutMaterial);
        hut.position.set(post.x, post.y + 0.55, post.z);
        group.add(hut);
        rescueProps.push(hut);
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(post.x, post.y + 0.05, post.z);
        group.add(ring);
        rescueProps.push(ring);
      }
      rescuePlatformMesh = rebuildHeatMesh(null, view.platforms.map((p) => ({ x: p.x, y: p.y, z: p.z, value: p.covered ? 0 : 1 })));
    },

    dispose() {
      disposeCandidateMesh();
      disposeRouteObjects();
      disposeRescueProps();
      for (const mesh of [waitMesh, fearMesh, treeHealthMesh, rescuePlatformMesh]) if (mesh) { mesh.geometry.dispose(); mesh.material.dispose(); }
      heatGeometry.dispose();
      hutGeometry.dispose(); hutMaterial.dispose();
      if (ringGeometry) ringGeometry.dispose();
      if (ringMaterial) ringMaterial.dispose();
      markerGeometry.dispose();
      markerMaterial.dispose();
      platformGeometry.dispose();
      platformMaterial.dispose();
      scene.remove(group);
    },
  };
}

function segmentLabel(a, b) {
  const span = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 0.6, z: (a.z + b.z) / 2, text: `${span.toFixed(1)} m` };
}
