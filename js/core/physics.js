// Rapier world wrapper: init, fixed step, collision groups, optional debug lines.
import * as RAPIER from "rapier";
import * as THREE from "three";
import { PHYSICS } from "../config.js";

/** Collision groups (16 bits membership << 16 | 16 bits filter). Keep in sync with docs/architecture.md */
export const GROUP = Object.freeze({
  TERRAIN: 1 << 0,
  STATIC: 1 << 1,      // platforms, trunks, ladders
  PLAYER: 1 << 2,
  NPC: 1 << 3,
  DYNAMIC: 1 << 4,     // props, test bodies
  SENSOR: 1 << 5,      // triggers (landing zones, anchors)
});

export function groups(membership, filter = 0xffff) {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

export async function initPhysics() {
  await RAPIER.init();
  const world = new RAPIER.World(PHYSICS.gravity);
  world.timestep = 1 / PHYSICS.hz;
  return new Physics(world);
}

export class Physics {
  constructor(world) {
    this.RAPIER = RAPIER;
    this.world = world;
    this.eventQueue = new RAPIER.EventQueue(true);
    this._debug = null;
  }

  step() {
    this.world.step(this.eventQueue);
  }

  get debugEnabled() { return this._debug != null; }
  get bodyCount() { return this.world.bodies.len(); }
  get colliderCount() { return this.world.colliders.len(); }

  /** Toggle Rapier debug wireframe drawn into the given scene. */
  setDebug(scene, enabled) {
    if (enabled && !this._debug) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(0), 3));
      geom.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(0), 4));
      const mat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.85 });
      const lines = new THREE.LineSegments(geom, mat);
      lines.frustumCulled = false;
      lines.renderOrder = 999;
      scene.add(lines);
      this._debug = lines;
    } else if (!enabled && this._debug) {
      scene.remove(this._debug);
      this._debug.geometry.dispose();
      this._debug.material.dispose();
      this._debug = null;
    }
  }

  updateDebug() {
    if (!this._debug) return;
    const { vertices, colors } = this.world.debugRender();
    const g = this._debug.geometry;
    g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
}
