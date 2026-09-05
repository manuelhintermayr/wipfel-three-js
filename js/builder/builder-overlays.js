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

    dispose() {
      disposeCandidateMesh();
      disposeRouteObjects();
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
