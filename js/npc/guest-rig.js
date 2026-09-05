// Visual layer for the NPC guests (ROADMAP M1.6) – js/npc/agents.js owns the simulation, this module
// only turns each agent snapshot into pixels. Ten body parts (torso, head, left/right upper arm,
// left/right forearm, left/right thigh, left/right shin), each ONE THREE.InstancedMesh shared by
// every guest regardless of count – draw calls stay at 10 total for the whole crowd, well inside the
// ≤ 40 budget, instead of the player rig's 64 meshes (which would be 500+ draw calls at 8-14 guests).
// Geometry proportions reuse `LAYOUT` from
// js/player/rig-body.js (the player's own procedural rig) so guests read as the same kind of person,
// just simplified: no per-guest textures, one shared material per part tinted via `InstancedMesh
// .setColorAt` (torso = the guest's assigned category colour, doubling as an at-a-glance "who is
// headed where" cue that matches the course map/park board colour language).
//
// A single scratch pose hierarchy (a handful of plain THREE.Object3D, never added to the scene) is
// reused for every guest in turn: pose it for guest 0, read its joints' world matrices into instance
// slot 0, pose it again for guest 1, and so on – no per-guest THREE objects, no per-frame allocation.
// Guests farther than `NPC.cullDistance` skip that pose maths entirely and reuse one cached rest-pose
// transform per part (computed once), combined with just that guest's own root matrix – the position
// still advances every frame, only the limb articulation is frozen while far away.
import * as THREE from "three";
import { NPC, NIGHT } from "../config.js";
import { CATEGORY_BY_ID } from "../config.js";
import { LAYOUT } from "../player/rig-body.js";
import { poseKindOf } from "./agents.js";

const SKIN = 0xd2a07e, PANTS = 0x23262b;
const PARTS = ["torso", "head", "upperArmL", "lowerArmL", "upperArmR", "lowerArmR", "thighL", "shinL", "thighR", "shinR"];
const SHOULDER_Y = LAYOUT.spineUp + LAYOUT.chestUp + LAYOUT.shoulderUp;   // shoulder height above the pelvis joint
const TORSO_LEN = SHOULDER_Y;
// Night climbing (ROADMAP M2b): guests get a tiny emissive "headlamp" dot instead of a real light –
// a fixed offset from the head joint's own matrix, forward and slightly down, in the same local space
// `readParts()` already reports every other part in.
const HEADLAMP_OFFSET = new THREE.Matrix4().makeTranslation(0, LAYOUT.headR * 0.15, LAYOUT.headR * 1.05);

/**
 * @param {{ scene: THREE.Scene, guestCount: number }} options
 * @returns {{ group: THREE.Group, update(list, playerPosition, dt): void, dispose(): void }}
 */
export function createGuestRig({ scene, guestCount }) {
  const geometries = buildGeometries();
  const materials = buildMaterials();
  const meshes = {};
  for (const part of PARTS) {
    const capacity = Math.max(1, guestCount);
    const mesh = new THREE.InstancedMesh(geometries[partKey(part)], materials[partKey(part)], capacity);
    mesh.name = `guest-${part}`;
    mesh.castShadow = false;   // budget: a crowd of small figures is not worth doubling the draw calls
    mesh.receiveShadow = true;
    mesh.count = capacity;
    meshes[part] = mesh;
  }
  // Night climbing (M2b): one more InstancedMesh, unlit so it reads as a small glow regardless of the
  // scene's own lighting – `count` toggles between 0 (day) and every guest (night), the same cheap
  // "sets mesh.count" trick js/world/ground-detail.js already uses for its own distance culling.
  const headlampMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(NIGHT.guestHeadlampScale, 8, 6),
    new THREE.MeshBasicMaterial({ color: NIGHT.guestHeadlampColour, toneMapped: false }),
    Math.max(1, guestCount),
  );
  headlampMesh.name = "guest-headlamp";
  headlampMesh.castShadow = false;
  headlampMesh.count = 0;

  const group = new THREE.Group();
  group.name = "npc-guests";
  for (const part of PARTS) group.add(meshes[part]);
  group.add(headlampMesh);
  scene.add(group);

  const poser = buildPoser();
  const visualState = new Map();          // agent.id -> { walkPhase }
  const restMatrices = captureRestPose(poser);   // one cached idle transform per part, for culled guests

  const matrix = new THREE.Matrix4(), rootMatrix = new THREE.Matrix4(), matrix2 = new THREE.Matrix4();
  const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scaleV = new THREE.Vector3();
  const colorScratch = new THREE.Color();

  function paintColours(list) {
    list.forEach((agent, i) => {
      const category = CATEGORY_BY_ID[agent.category];
      meshes.torso.setColorAt(i, colorScratch.setHex(category ? category.colour : 0x888888));
      const skinJitter = 1 + (agent.hue - 0.5) * 0.12;
      colorScratch.setHex(SKIN).multiplyScalar(skinJitter);
      for (const part of ["head", "upperArmL", "lowerArmL", "upperArmR", "lowerArmR"]) meshes[part].setColorAt(i, colorScratch);
      const pantsJitter = 1 + (agent.hue - 0.5) * 0.18;
      colorScratch.setHex(PANTS).multiplyScalar(pantsJitter);
      for (const part of ["thighL", "shinL", "thighR", "shinR"]) meshes[part].setColorAt(i, colorScratch);
    });
    for (const part of PARTS) if (meshes[part].instanceColor) meshes[part].instanceColor.needsUpdate = true;
  }
  let coloured = false;

  return {
    group,

    /**
     * Render phase (js/main.js, variable dt): one call per frame with the live agent list. Purely
     * cosmetic – js/npc/agents.js already advanced every position/state in the fixed gameplay step.
     * `nightFactor` (0..1, `sky.night`, M2b) turns the headlamp dots on – omit it (or 0) for daytime.
     */
    update(list, playerPosition, dt, nightFactor = 0) {
      if (!coloured && list.length) { paintColours(list); coloured = true; }
      const showLamps = nightFactor >= 0.5;
      headlampMesh.count = showLamps ? list.length : 0;
      list.forEach((agent, i) => {
        rootMatrix.compose(
          position.set(agent.pos.x, agent.pos.y, agent.pos.z),
          quaternion.setFromAxisAngle(UP, agent.heading),
          scaleV.setScalar(agent.heightScale),
        );
        const culled = agent.distanceToPlayer > NPC.cullDistance;
        const parts = culled ? restMatrices : poseFor(agent, visualStateOf(agent, visualState), poser, dt);
        for (const part of PARTS) meshes[part].setMatrixAt(i, matrix.multiplyMatrices(rootMatrix, parts[part]));
        if (showLamps) headlampMesh.setMatrixAt(i, matrix.multiplyMatrices(rootMatrix, matrix2.multiplyMatrices(parts.head, HEADLAMP_OFFSET)));
      });
      for (const part of PARTS) meshes[part].instanceMatrix.needsUpdate = true;
      if (showLamps) headlampMesh.instanceMatrix.needsUpdate = true;
    },

    dispose() {
      for (const part of PARTS) meshes[part].dispose();
      headlampMesh.geometry.dispose(); headlampMesh.material.dispose();
      for (const key of Object.keys(geometries)) geometries[key].dispose();
      for (const key of Object.keys(materials)) materials[key].dispose();
      group.removeFromParent();
    },
  };
}

const UP = new THREE.Vector3(0, 1, 0);
/** Per-agent visual-only state (walk-cycle phase) lives here, never on the agent object itself –
 *  js/npc/agents.js's own fields are simulation state, not rendering state. */
function visualStateOf(agent, visualState) {
  let v = visualState.get(agent.id);
  if (!v) { v = { walkPhase: 0 }; visualState.set(agent.id, v); }
  return v;
}

/** A handful of plain Object3D joints, reused for every guest in turn – never added to the scene. */
function buildPoser() {
  const hip = new THREE.Object3D();
  const head = new THREE.Object3D();
  head.position.set(0, TORSO_LEN + LAYOUT.neckUp + LAYOUT.headUp, 0);
  const shoulderL = new THREE.Object3D(); shoulderL.position.set(LAYOUT.shoulderX, SHOULDER_Y, 0);
  const shoulderR = new THREE.Object3D(); shoulderR.position.set(-LAYOUT.shoulderX, SHOULDER_Y, 0);
  const elbowL = new THREE.Object3D(); elbowL.position.set(0, -LAYOUT.upperArm.length, 0); shoulderL.add(elbowL);
  const elbowR = new THREE.Object3D(); elbowR.position.set(0, -LAYOUT.upperArm.length, 0); shoulderR.add(elbowR);
  const hipL = new THREE.Object3D(); hipL.position.set(LAYOUT.hipX, -LAYOUT.hipDrop, 0);
  const hipR = new THREE.Object3D(); hipR.position.set(-LAYOUT.hipX, -LAYOUT.hipDrop, 0);
  const kneeL = new THREE.Object3D(); kneeL.position.set(0, -LAYOUT.thigh.length, 0); hipL.add(kneeL);
  const kneeR = new THREE.Object3D(); kneeR.position.set(0, -LAYOUT.thigh.length, 0); hipR.add(kneeR);
  const root = new THREE.Object3D();
  root.add(hip, head, shoulderL, shoulderR, hipL, hipR);
  return { root, hip, head, shoulderL, elbowL, shoulderR, elbowR, hipL, kneeL, hipR, kneeR };
}

/** Every part's *local-to-root* matrix at a fixed idle pose – culled (far) guests reuse this instead
 *  of running the pose functions, so the crowd stays cheap once it thins out with distance. */
function captureRestPose(poser) {
  applyIdle(poser, 0, 0);
  poser.root.updateWorldMatrix(true, true);
  return readParts(poser);
}

/** Read each of the ten rendered parts' current world matrix off the poser (root is at the identity
 *  when this is called from `poseFor`, so "world" here already means "local to the guest's own root"). */
function readParts(poser) {
  return {
    torso: poser.hip.matrixWorld.clone(),
    head: poser.head.matrixWorld.clone(),
    upperArmL: poser.shoulderL.matrixWorld.clone(), lowerArmL: poser.elbowL.matrixWorld.clone(),
    upperArmR: poser.shoulderR.matrixWorld.clone(), lowerArmR: poser.elbowR.matrixWorld.clone(),
    thighL: poser.hipL.matrixWorld.clone(), shinL: poser.kneeL.matrixWorld.clone(),
    thighR: poser.hipR.matrixWorld.clone(), shinR: poser.kneeR.matrixWorld.clone(),
  };
}

/** Pose the shared scratch hierarchy for one agent and return its ten part matrices (local to root). */
function poseFor(agent, visual, poser, dt) {
  const kind = poseKindOf(agent);
  const speed = agent.speed01 || 0;
  visual.walkPhase += Math.max(0, dt) * (2.6 + speed * 3.2);
  if (kind === "walk" && speed > 0.05) applyWalk(poser, visual.walkPhase);
  else if (kind === "ladder") applyLadder(poser, agent.stepPhase);
  else if (kind === "element") applyElement(poser, Math.sin(agent.t * Math.PI * 2 + agent.stepPhase * 0.3), fearTremor(agent, visual.walkPhase));
  else if (kind === "zip") applyZip(poser, agent.t);
  else applyIdle(poser, visual.walkPhase, agent.hue * 6.28);
  poser.root.updateWorldMatrix(true, true);
  return readParts(poser);
}

function applyIdle(p, time, seed) {
  const breath = Math.sin(time * 0.5 + seed);
  p.hip.rotation.set(0, 0.03 * breath, 0);
  p.shoulderL.rotation.set(-0.16, 0, 0.24);
  p.shoulderR.rotation.set(-0.16, 0, -0.24);
  p.elbowL.rotation.set(-0.34, 0, 0);
  p.elbowR.rotation.set(-0.34, 0, 0);
  p.hipL.rotation.set(-0.02, 0, 0);
  p.hipR.rotation.set(0.02, 0, 0);
  p.kneeL.rotation.set(0.06, 0, 0);
  p.kneeR.rotation.set(0.06, 0, 0);
}

function applyWalk(p, phase) {
  const s = Math.sin(phase);
  p.hip.rotation.set(0, -0.05 * s, -0.05 * Math.cos(phase));
  p.hipL.rotation.set(0.55 * s, 0, 0);
  p.hipR.rotation.set(-0.55 * s, 0, 0);
  p.kneeL.rotation.set(Math.max(0, 1.1 * Math.cos(phase + 0.5)), 0, 0);
  p.kneeR.rotation.set(Math.max(0, 1.1 * Math.cos(phase + 0.5 + Math.PI)), 0, 0);
  p.shoulderL.rotation.set(0.4 * s - 0.2, 0, 0.2);
  p.shoulderR.rotation.set(-0.4 * s - 0.2, 0, -0.2);
  p.elbowL.rotation.set(-0.5, 0, 0);
  p.elbowR.rotation.set(-0.5, 0, 0);
}

function applyLadder(p, phase) {
  const s = Math.sin(phase);
  p.hip.rotation.set(0.06, 0.05 * s, 0.03 * s);
  p.shoulderL.rotation.set(-2.0 - 0.3 * s, 0, 0.18);
  p.shoulderR.rotation.set(-2.0 + 0.3 * s, 0, -0.18);
  p.elbowL.rotation.set(-0.35, 0, 0);
  p.elbowR.rotation.set(-0.35, 0, 0);
  p.hipL.rotation.set(0.5 - 0.4 * s, 0, 0);
  p.hipR.rotation.set(0.5 + 0.4 * s, 0, 0);
  p.kneeL.rotation.set(0.9 - 0.5 * s, 0, 0);
  p.kneeR.rotation.set(0.9 + 0.5 * s, 0, 0);
}

/** Balance-lean on a rail: arms out, a small sideways sway rocking with `sway` (-1..1). `shake` (0..1,
 *  M3b fear events, js/npc/agents.js#beginOnRail) layers a quick, small tremor on top while frozen –
 *  the same silhouette, visibly rattled, no separate "scared" skeleton pose needed. */
function applyElement(p, sway, shake = 0) {
  const tremor = shake * Math.sin(sway * 47) * 0.09;
  p.hip.rotation.set(0.03, 0, sway * 0.18 + tremor);
  p.shoulderL.rotation.set(-0.08, 0, 1.15 - tremor);
  p.shoulderR.rotation.set(-0.08, 0, -1.15 + tremor);
  p.elbowL.rotation.set(-0.2 - shake * 0.15, 0, 0);
  p.elbowR.rotation.set(-0.2 - shake * 0.15, 0, 0);
  p.hipL.rotation.set(0.16, 0, 0);
  p.hipR.rotation.set(-0.16, 0, 0);
  p.kneeL.rotation.set(0.30, 0, 0);
  p.kneeR.rotation.set(0.30, 0, 0);
}

/** 0 (calm) or 1 (freezing/panicked) tremor gate for `applyElement` – `visual.walkPhase` already
 *  advances every frame regardless of pose kind, so reusing it here needs no extra per-agent state. */
function fearTremor(agent, walkPhase) {
  if (!agent.fear || agent.fear === "none") return 0;
  return 0.6 + 0.4 * Math.sin(walkPhase * 22);
}

/** Seated in the harness under the trolley, legs tucking up as `tuck` (0..1, ≈ ride progress) grows. */
function applyZip(p, tuck) {
  const knee = 0.5 + tuck * 1.1;
  p.hip.rotation.set(-0.85, 0, 0);
  p.shoulderL.rotation.set(-1.55, 0, 0.18);
  p.shoulderR.rotation.set(-1.55, 0, -0.18);
  p.elbowL.rotation.set(-0.55, 0, 0);
  p.elbowR.rotation.set(-0.55, 0, 0);
  p.hipL.rotation.set(1.05, 0, 0);
  p.hipR.rotation.set(1.05, 0, 0);
  p.kneeL.rotation.set(knee, 0, 0);
  p.kneeR.rotation.set(knee, 0, 0);
}

function partKey(part) {
  if (part === "torso" || part === "head") return part;
  if (part.startsWith("upperArm")) return "upperArm";
  if (part.startsWith("lowerArm")) return "lowerArm";
  if (part.startsWith("thigh")) return "thigh";
  return "shin";
}

/** One geometry per part TYPE (arms/legs share left/right), all centred so a joint's own matrix can
 *  be used directly as the instance transform – see the header comment. */
function buildGeometries() {
  const torso = new THREE.CapsuleGeometry(0.145, Math.max(0.05, TORSO_LEN - 0.29), 4, 10);
  torso.translate(0, TORSO_LEN / 2, 0);   // capsule is centred at its own origin; the hip joint is its base
  return {
    torso,
    head: new THREE.SphereGeometry(LAYOUT.headR, 16, 12).translate(0, 0, 0),
    upperArm: capsuleDown(LAYOUT.upperArm.rTop, LAYOUT.upperArm.length),
    lowerArm: capsuleDown((LAYOUT.forearm.rTop + LAYOUT.forearm.rBottom) / 2, LAYOUT.forearm.length),
    thigh: capsuleDown(LAYOUT.thigh.rTop, LAYOUT.thigh.length),
    shin: capsuleDown((LAYOUT.shin.rTop + LAYOUT.shin.rBottom) / 2, LAYOUT.shin.length),
  };
}

/** A capsule centred on its own midpoint, spanning from its parent joint (y=0) down to -length – the
 *  same convention js/player/rig-body.js's `taperedCapsule` uses for the player's own limbs. */
function capsuleDown(radius, length) {
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.02, length - radius * 2), 4, 8);
  geometry.translate(0, -length / 2, 0);
  return geometry;
}

function buildMaterials() {
  const std = (roughness = 0.75) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness: 0 });
  return { torso: std(0.7), head: std(0.6), upperArm: std(0.6), lowerArm: std(0.6), thigh: std(0.8), shin: std(0.8) };
}
