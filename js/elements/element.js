// The base every rail element is built on (GDD §3.4: "Übungen sind Schienen"). An element is a
// spline the feet travel along, a spring-damper that makes it move, an offer of something to hold,
// and a steel lifeline above it that the carabiners ride on. Everything else – wire bridge, hanging
// planks, cargo net – is geometry and numbers on top of that.
//
// Local frame: origin at the entry foot point, +X along the span, +Y up, +Z to the climber's right.
// The visual group is placed and yawed so its local frame matches, which lets the deformer
// (element-deform.js) work in plain local metres.

import * as THREE from "three";
import { createDeformer } from "./element-deform.js";

export const ELEMENT = Object.freeze({
  lifelineHeight: 2.05,      // metres above the walking level (EN 15567: 1.7–2.3 m)
  lifelineRadius: 0.006,     // 12 mm steel
  cableRadius: 0.006,
  sagRatio: 0.02,            // loaded sag ≈ 2 % of the span (RESEARCH-DATA §6)
  clampLength: 0.16,         // swaged cable clamp at each end
  interactRange: 1.8,        // how close to the entry you must be to step on
});

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const KINDS = new Map();

/** Register a concrete element factory; called at module scope by burma-bridge.js and friends. */
export function registerElementKind(kind, factory) { KINDS.set(kind, factory); }

/** Element kinds known to `createElement` (the concrete modules must have been imported). */
export function elementKinds() { return Array.from(KINDS.keys()); }

/**
 * Parameter variant (ROADMAP M2b, GDD "Übungskatalog auf 20–25 Familien/Varianten"): registers
 * `variantKind` as `baseKind` built with `configOverride` merged over the base kind's own config
 * (`createElementBase` below folds `spec.configOverride` into its per-instance copy) – a harder/easier
 * flavour of an existing element needs no new mechanic, only different numbers. `spec.kind` is left
 * untouched (already `variantKind`, set by whoever calls `createElement`), so `element.kind`,
 * `element.label` and every catalogue lookup keep reporting the variant, not the base, kind.
 * @param {string} variantKind
 * @param {string} baseKind must already be registered (import order: js/elements/catalogue.js imports
 *   every concrete module, which is what registers the base kinds, before registering any variant)
 * @param {object} configOverride merged over the base kind's config – see each concrete module's own
 *   `config:` block for the field names that actually matter to it
 */
export function registerElementVariant(variantKind, baseKind, configOverride) {
  const base = KINDS.get(baseKind);
  if (!base) throw new Error(`element: cannot register variant '${variantKind}' – base kind '${baseKind}' is not registered yet`);
  registerElementKind(variantKind, (spec, ctx) => base({ ...spec, configOverride: { ...configOverride, ...(spec.configOverride || null) } }, ctx));
}

/**
 * @param {object} spec see `createElementBase`
 * @param {{ scene, physics, rng, timber, wind }} ctx
 * @returns {object} the element interface
 */
export function createElement(spec, ctx) {
  const factory = KINDS.get(spec.kind);
  if (!factory) throw new Error(`element: unknown kind '${spec.kind}' (known: ${elementKinds().join(", ") || "none"})`);
  return factory(spec, ctx);
}

/**
 * A damped harmonic swing in two axes – sideways (the bridge walks away under you) and vertical
 * (the bounce a step puts into a wire). Impulses come from the climber: every step, every change of
 * pace, every lean. Deterministic and dt-based; no randomness.
 * @param {{ lateralHz?, verticalHz?, lateralDamping?, verticalDamping?, maxLateral?, maxVertical?, verticalRatio? }} [config]
 */
export function createWobble(config = {}) {
  const lateralOmega = 2 * Math.PI * (config.lateralHz || 0.42);
  const verticalOmega = 2 * Math.PI * (config.verticalHz || 1.05);
  const lateralZeta = config.lateralDamping == null ? 0.10 : config.lateralDamping;
  const verticalZeta = config.verticalDamping == null ? 0.22 : config.verticalDamping;
  const maxLateral = config.maxLateral == null ? 0.42 : config.maxLateral;
  const maxVertical = config.maxVertical == null ? 0.16 : config.maxVertical;
  const verticalRatio = config.verticalRatio == null ? 0.45 : config.verticalRatio;
  let lateral = 0, lateralVel = 0, vertical = 0, verticalVel = 0;

  const step = (x, v, omega, zeta, dt, limit) => {
    v += (-omega * omega * x - 2 * zeta * omega * v) * dt;
    x += v * dt;
    if (x > limit) { x = limit; v = Math.min(v, 0); }
    else if (x < -limit) { x = -limit; v = Math.max(v, 0); }
    return [x, v];
  };

  const wobble = {
    get lateral() { return lateral; },
    get vertical() { return vertical; },
    get lateralVelocity() { return lateralVel; },
    get verticalVelocity() { return verticalVel; },
    /** 0..1 – how much this thing is moving, for nerves and for the HUD. */
    get amplitude() { return Math.min(1, Math.abs(lateral) / maxLateral + Math.abs(vertical) / (maxVertical * 3)); },

    /**
     * Put energy in. `amount` is a sideways velocity in m/s; the vertical axis gets a fraction of it.
     * @param {number} amount signed – a lean to the right pushes the element to the right
     */
    excite(amount, verticalAmount = null) {
      lateralVel += amount;
      verticalVel += verticalAmount == null ? Math.abs(amount) * verticalRatio : verticalAmount;
    },

    update(dt) {
      if (!(dt > 0)) return wobble;
      [lateral, lateralVel] = step(lateral, lateralVel, lateralOmega, lateralZeta, dt, maxLateral);
      [vertical, verticalVel] = step(vertical, verticalVel, verticalOmega, verticalZeta, dt, maxVertical);
      return wobble;
    },

    reset() { lateral = lateralVel = vertical = verticalVel = 0; },
  };
  return wobble;
}

/**
 * The shared skeleton. Concrete elements pass an `impl` and get the full interface back.
 *
 * @param {{ id: string, kind: string, entry: { platformId, position, ringPosition },
 *   exit: { platformId, position, ringPosition }, lifelineAnchorId: string, label?: string }} spec
 *   `entry.position` / `exit.position` are the world points where the walking surface meets the deck.
 * @param {{ scene: THREE.Scene, physics, rng, timber, wind }} ctx
 * @param {{ config: object, build(builder, frame, element): { groups, swing? },
 *   metrics: object, handHold: object, footholdAt?(t, element), update?(dt, elapsed, element),
 *   displace?(offsets, element), shape?(u, group, element), createPhysics?(physics, frame, element) }} impl
 * @returns {object} element
 */
export function createElementBase(spec, ctx, impl) {
  // `spec.configOverride` (M2b parameter variants, `registerElementVariant` above) is merged in last, so
  // it always wins over the base kind's own defaults; every existing caller omits it and is unaffected.
  const C = { ...impl.config, ...(spec.configOverride || null) };   // per-element copy: `sag` depends on the span
  const frame = createFrame(spec, C);
  if (C.sagRatio != null) C.sag = C.sagRatio * frame.length;
  if (C.sag == null) C.sag = 0;
  const element = {
    id: spec.id,
    kind: spec.kind,
    label: spec.label || spec.id,
    /** Span in metres along the walking line. */
    length: frame.length,
    /** Element-local basis, for the concrete builders. */
    frame,
    config: C,
    group: null,
    colliders: [],
    wobble: createWobble(C.wobble),
    handHold: Object.freeze({ ...impl.handHold }),
    lifeline: createLifeline(spec, frame, C),
    /** Top speed a climber may walk here, and how far the body may tip before it slips. */
    walkSpeed: C.walkSpeed,
    slipAngle: C.slipAngle,
    staminaDrain: C.staminaDrain || 0,
    /** Gets set by the on-element state; the element uses it to sag where the climber stands. */
    occupancy: { active: false, t: 0 },
    /** Terrain height under the middle of the span – the drop the climber feels (nerves). */
    groundY: spec.groundY == null ? null : spec.groundY,
    deformer: null,
  };
  // how much of a gust pushes on this particular span: broadside catches more than end-on
  const windBite = ctx.wind ? Math.abs(frame.side.x * ctx.wind.direction.x + frame.side.z * ctx.wind.direction.y) : 0;

  /**
   * How far the walking line has moved out of its rest shape at `u`, in element-local metres
   * (y = up, z = to the climber's right). Concrete elements may override `impl.offsetAt`.
   */
  element.localOffsetAt = function localOffsetAt(u, out = new THREE.Vector3()) {
    if (impl.offsetAt) return impl.offsetAt(u, out, element);
    const shape = shapeAt(u, element);
    return out.set(0, element.wobble.vertical * shape - localSag(u, element), element.wobble.lateral * shape);
  };

  /** World position of the walking surface at rail parameter `t` (0 = entry, 1 = exit). */
  element.pointAt = function pointAt(t, out = new THREE.Vector3()) {
    const u = clamp01(t);
    element.localOffsetAt(u, _offset);
    return frame.toWorld(u * frame.length, frame.riseAt(u) + _offset.y, _offset.z, out);
  };

  element.tangentAt = function tangentAt(t, out = new THREE.Vector3()) {
    const u = clamp01(t);
    const h = 0.01;
    element.pointAt(Math.max(0, u - h), _tangentA);
    element.pointAt(Math.min(1, u + h), out);
    return out.sub(_tangentA).normalize();
  };

  /** Nearest place to put a foot. Continuous rails answer with the rail itself. */
  element.footholdAt = function footholdAt(t) {
    if (impl.footholdAt) return impl.footholdAt(clamp01(t), element);
    return { discrete: false, index: -1, t: clamp01(t), offset: 0, ready: 1, swing: 0 };
  };

  element.getDifficultyMetrics = function getDifficultyMetrics() { return { ...impl.metrics }; };

  element.getEntryAnchor = function getEntryAnchor() {
    return { id: spec.lifelineAnchorId, elementId: spec.id, platformId: spec.entry.platformId,
      position: element.lifeline.start.clone(), stand: frame.entryStand.clone(), end: "entry" };
  };
  element.getExitAnchor = function getExitAnchor() {
    return { id: spec.lifelineAnchorId, elementId: spec.id, platformId: spec.exit.platformId,
      position: element.lifeline.end.clone(), stand: frame.exitStand.clone(), end: "exit" };
  };

  /** Build the geometry and add it to the scene. Called once by `createElement`. */
  element.build = function build() {
    if (element.group) return element.group;
    const built = impl.build(ctx.timber, frame, element);
    element.group = new THREE.Group();
    element.group.name = `element-${spec.id}`;
    for (const group of built.groups) element.group.add(group);
    element.group.position.copy(frame.origin);
    element.group.rotation.y = frame.yaw;
    ctx.scene.add(element.group);
    if (built.swing && built.swing.meshes.length) {
      element.deformer = createDeformer(built.swing.meshes, {
        classify: built.swing.classify,
        groupCount: built.swing.groupCount || 1,
        margin: (C.wobble && C.wobble.maxLateral ? C.wobble.maxLateral : 0.5) + 0.4,
      });
    }
    return element.group;
  };

  element.createPhysics = function createPhysics() {
    if (!ctx.physics || !impl.createPhysics) return element.colliders;
    element.colliders = impl.createPhysics(ctx.physics, frame, element) || [];
    return element.colliders;
  };

  element.update = function update(dt, elapsed = 0) {
    if (ctx.wind && windBite > 0.01) {
      element.wobble.excite(ctx.wind.gust * windBite * (C.windGain || 0.20) * dt, 0);
    }
    element.wobble.update(dt);
    if (impl.update) impl.update(dt, elapsed, element);
    if (!element.deformer) return;
    if (impl.displace) impl.displace(element.deformer.offsets, element);
    else defaultDisplace(element.deformer.offsets, element);
    element.deformer.update(impl.shape ? (u, g) => impl.shape(u, g, element) : null);
  };

  element.dispose = function dispose() {
    if (ctx.physics) for (const collider of element.colliders) ctx.physics.world.removeCollider(collider, false);
    element.colliders = [];
    if (element.deformer) element.deformer.dispose();
    if (element.group) {
      element.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      element.group.removeFromParent();
      element.group = null;
    }
  };

  return element;
}

const _tangentA = new THREE.Vector3();
const _offset = new THREE.Vector3();
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Sine arch: clamped at both platforms, biggest in the middle – how a wire between two trees moves. */
function shapeAt(u, element) {
  return element.config.shape === "flat" ? 1 : Math.sin(Math.PI * clamp01(u));
}

/**
 * Rest sag of the walking line – it is already baked into the geometry, so `pointAt` has to
 * reproduce it while the deformer only ever moves the *dynamic* part.
 */
function localSag(u, element) { return element.config.sag * 4 * u * (1 - u); }

/** Default: the whole span swings as one arch, clamped at both platforms. */
function defaultDisplace(offsets, element) {
  offsets[0] = 0;
  offsets[1] = element.wobble.vertical;
  offsets[2] = element.wobble.lateral;
}

/**
 * Element-local basis. `entry.position` and `exit.position` are the world points where the walking
 * surface leaves one deck and reaches the next.
 */
function createFrame(spec, config) {
  const origin = new THREE.Vector3().copy(spec.entry.position);
  const target = new THREE.Vector3().copy(spec.exit.position);
  const axis = new THREE.Vector3(target.x - origin.x, 0, target.z - origin.z);
  const length = Math.max(0.5, axis.length());
  axis.divideScalar(length);
  const side = new THREE.Vector3(-axis.z, 0, axis.x);
  const yaw = Math.atan2(-axis.z, axis.x);
  const rise = target.y - origin.y;
  const stand = config.standBack == null ? 0.45 : config.standBack;

  const frame = {
    origin, axis, side, yaw, length, rise,
    /** Height of the walking line above the entry deck at `u` (before sag). */
    riseAt(u) { return rise * u; },
    /** Element-local (x along the span, y up, z right) → world. */
    toWorld(x, y, z, out = new THREE.Vector3()) {
      return out.set(
        origin.x + axis.x * x + side.x * z,
        origin.y + y,
        origin.z + axis.z * x + side.z * z,
      );
    },
    /** Where the climber stands on the deck before stepping on / after stepping off. */
    entryStand: new THREE.Vector3().copy(origin).addScaledVector(axis, -stand),
    exitStand: new THREE.Vector3().copy(target).addScaledVector(axis, stand),
  };
  return frame;
}

/** The steel cable the carabiners ride on: platform ring → platform ring, above the walking line. */
function createLifeline(spec, frame, config) {
  const height = config.lifelineHeight || ELEMENT.lifelineHeight;
  const start = new THREE.Vector3(frame.origin.x, frame.origin.y + height, frame.origin.z);
  const end = new THREE.Vector3().copy(frame.origin)
    .addScaledVector(frame.axis, frame.length);
  end.y = frame.origin.y + frame.rise + height;
  const span = new THREE.Vector3().subVectors(end, start);
  const length = span.length();

  return {
    anchorId: spec.lifelineAnchorId,
    start, end, length,
    heightAboveFoot: height,
    /** World point on the cable at 0..1 (sag included – the carabiner rides the real cable). */
    pointAt(t, out = new THREE.Vector3()) {
      const u = clamp01(t);
      out.copy(start).addScaledVector(span, u);
      out.y -= (config.lifelineSag || 0.06) * 4 * u * (1 - u);
      return out;
    },
    /** Rail parameter of the point on the cable closest to `position`. */
    closestT(position) {
      _v.subVectors(position, start);
      return clamp01(_v.dot(span) / Math.max(1e-6, length * length));
    },
  };
}
