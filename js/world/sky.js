// Sky dome (procedural gradient + sun + haze + night stars), sun/hemisphere lighting with a shadow frustum that
// follows the player, and fog matched to the dome. Colour maths lives in ./lighting.js (pure, tested).
import * as THREE from "three";
import { RENDER } from "../config.js";
import { Rng } from "../core/rng.js";
import {
  skyColoursForHour, sunDirectionForHour, exposureForHour, toneMapAcesFilmic, hexToLinear, mixColour, scaleColour,
  smoothstep, SUN_LIGHT,
} from "./lighting.js";

/** Tunables of the sky system (candidates for js/config.js once the module is wired into main.js). */
export const SKY = Object.freeze({
  defaultHour: 17.5,           // late afternoon: warm sun ≈ 24° above the south-west
  domeRadius: 300,             // metres; the dome is re-centred on the focus every frame and drawn on the far plane
  paletteGain: 1.05,           // HDR gain applied to the palette before ACES so design colours survive tone mapping
  sunDiscRadiusDeg: 1.1,       // angular radius of the visible disc (real sun: 0.27° – too small for a game)
  sunDiscIntensity: 8,         // HDR radiance of the disc (ACES rolls it off to a white core with warm rim)
  fogDensity: 0.0042,          // FogExp2: ≈ 16 % haze at 100 m, ≈ 67 % at 250 m, ≈ 94 % at 400 m
  shadow: Object.freeze({
    size: 70,                  // metres covered by the orthographic shadow box (follows focusPos)
    distance: 140,             // light placed this far from the focus along the sun direction
    bias: -0.00015,
    normalBias: 0.035,         // world units – tuned against acne on cylindrical trunks
  }),
});

const VERTEX_SHADER = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vDir = worldPos.xyz - cameraPosition;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  clip.z = clip.w * 0.99999;    // pin the dome just inside the far plane: everything else draws in front of it
  gl_Position = clip;
}`;

const FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunGlow; uniform vec3 uSunDir;
uniform float uSunDisc; uniform float uGlow; uniform float uNight; uniform float uTime; uniform float uStarSeed;
uniform float uDiscCosOuter; uniform float uDiscCosInner;
varying vec3 vDir;

float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }

vec3 stars(vec3 d, float y) {
  vec3 sp = d * 110.0 + uStarSeed;
  vec3 cell = floor(sp);
  float h = hash13(cell);
  float star = smoothstep(0.986, 1.0, h);
  float r = length(fract(sp) - 0.5);
  star *= smoothstep(0.36, 0.08, r);
  float twinkle = 0.7 + 0.3 * sin(uTime * (1.2 + 2.5 * fract(h * 17.0)) + h * 60.0);
  return vec3(0.85, 0.9, 1.0) * star * twinkle * smoothstep(0.0, 0.3, y) * 1.8;
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float cosSun = dot(d, uSunDir);
  float t = clamp(y, 0.0, 1.0);
  float horizonW = pow(1.0 - t, 4.5);                       // haze band: strong in the first ~10° above the horizon
  vec3 sky = mix(uZenith, uHorizon, horizonW);
  float side = cosSun * 0.5 + 0.5;                          // slight blue-shift away from the sun, warmth towards it
  vec3 tint = mix(vec3(0.94, 0.97, 1.06), vec3(1.06, 1.01, 0.95), side);
  sky *= mix(tint, vec3(1.0), horizonW);
  float g = max(cosSun, 0.0);
  float glow = pow(g, 6.0) * 0.12 + pow(g, 40.0) * 0.45 + pow(g, 300.0) * 1.1;
  glow *= 1.0 + 1.6 * horizonW;                             // forward scattering is strongest low in the haze
  sky += uSunGlow * glow * uGlow;
  sky += uSunGlow * smoothstep(uDiscCosOuter, uDiscCosInner, cosSun) * uSunDisc;
  if (y < 0.0) sky = mix(uHorizon, uGround, smoothstep(0.0, -0.22, y));   // hazy valley floor below the horizon
  if (uNight > 0.001) sky += stars(d, y) * uNight;
  gl_FragColor = vec4(sky, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;   // dither against 8-bit banding
}`;

const UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3();
const DEG = Math.PI / 180;

/**
 * Sky dome + sun + hemisphere light + fog for one scene.
 * @param {{ scene: THREE.Scene, renderer: THREE.WebGLRenderer, rng?: Rng, hour?: number,
 *           manageExposure?: boolean, shadowMapSize?: number }} options
 *   `manageExposure` (default true) lets the sky scale `renderer.toneMappingExposure` by the time of day
 *   (base value captured at creation; 1.0× by day, up to ≈ 1.35× at night).
 */
export function createSky({ scene, renderer, rng, hour = SKY.defaultHour, manageExposure = true, shadowMapSize = RENDER.shadowMapSize }) {
  const skyRng = (rng || new Rng(1)).fork("sky");
  const baseExposure = renderer.toneMappingExposure;
  const maxTexture = renderer.capabilities ? renderer.capabilities.maxTextureSize : shadowMapSize;
  const mapSize = Math.min(shadowMapSize, maxTexture);

  const group = new THREE.Group();
  group.name = "sky";

  // --- dome ---------------------------------------------------------------------------------------
  const uniforms = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
    uSunGlow: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunDisc: { value: 0 }, uGlow: { value: 1 }, uNight: { value: 0 }, uTime: { value: 0 },
    uStarSeed: { value: skyRng.float(0, 100) },
    uDiscCosOuter: { value: Math.cos(SKY.sunDiscRadiusDeg * DEG) }, uDiscCosInner: { value: Math.cos(SKY.sunDiscRadiusDeg * 0.6 * DEG) },
  };
  const domeMaterial = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERTEX_SHADER, fragmentShader: FRAGMENT_SHADER,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY.domeRadius, 48, 24), domeMaterial);
  dome.name = "skyDome";
  dome.frustumCulled = false;
  dome.renderOrder = 10;             // drawn after the opaque world so hidden sky pixels are depth-rejected
  dome.castShadow = false;
  dome.receiveShadow = false;
  group.add(dome);

  // --- lights -------------------------------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xffe0b8, 2.4);
  sun.name = "sun";
  sun.castShadow = true;
  sun.shadow.mapSize.set(mapSize, mapSize);
  const half = SKY.shadow.size / 2;
  const shadowCam = sun.shadow.camera;
  shadowCam.left = -half; shadowCam.right = half; shadowCam.top = half; shadowCam.bottom = -half;
  shadowCam.near = 1; shadowCam.far = SKY.shadow.distance * 2 + 40;
  shadowCam.updateProjectionMatrix();
  sun.shadow.bias = SKY.shadow.bias;
  sun.shadow.normalBias = SKY.shadow.normalBias;
  group.add(sun);
  group.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xcfe3f5, 0x3a4a34, 0.55);
  hemi.name = "hemi";
  group.add(hemi);
  scene.add(group);

  const fog = new THREE.FogExp2(0xd2dbe2, SKY.fogDensity);
  scene.fog = fog;
  const background = new THREE.Color(0xd2dbe2);
  scene.background = background;

  // --- state --------------------------------------------------------------------------------------
  const sunDirection = new THREE.Vector3(0, 1, 0);
  const lightDirection = new THREE.Vector3(0, 1, 0);   // sun by day, faint sky key at night
  const focus = new THREE.Vector3();
  const nightKeyDir = new THREE.Vector3(SUN_LIGHT.nightKeyDirection.x, SUN_LIGHT.nightKeyDirection.y, SUN_LIGHT.nightKeyDirection.z).normalize();
  const nightKeyColour = hexToLinear(SUN_LIGHT.nightKeyColour);
  const lightBasis = new THREE.Matrix4(), lightBasisInverse = new THREE.Matrix4();
  const snapped = new THREE.Vector3();
  const texel = SKY.shadow.size / mapSize;
  let currentHour = hour;
  let exposure = 1;
  let elapsed = 0;

  /** Display-referred colour (what fog/background must be) for a linear HDR palette colour. */
  const toDisplay = (linear) => {
    const rgb = renderer.toneMapping === THREE.NoToneMapping ? linear.map((c) => Math.min(1, c)) : toneMapAcesFilmic(linear, exposure);
    return rgb;
  };
  const setColour = (colour, rgb) => colour.setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);

  function applyPalette() {
    const p = skyColoursForHour(currentHour);
    const dir = sunDirectionForHour(currentHour);
    sunDirection.set(dir.x, dir.y, dir.z);
    exposure = baseExposure * exposureForHour(currentHour);
    if (manageExposure) renderer.toneMappingExposure = exposure;

    const zenith = scaleColour(p.zenith, SKY.paletteGain);
    const horizon = scaleColour(p.horizon, SKY.paletteGain);
    const ground = scaleColour(mixColour(p.horizon, p.hemiGround, 0.5), SKY.paletteGain * 0.85);
    const dayness = 1 - p.night;
    setColour(uniforms.uZenith.value, zenith);
    setColour(uniforms.uHorizon.value, horizon);
    setColour(uniforms.uGround.value, ground);
    setColour(uniforms.uSunGlow.value, scaleColour(p.sunGlow, 1.1));
    uniforms.uSunDir.value.copy(sunDirection);
    uniforms.uSunDisc.value = SKY.sunDiscIntensity * smoothstep(-1.5, 1.0, p.sunElevation);
    uniforms.uGlow.value = (0.55 + 0.75 * (1 - smoothstep(0, 35, p.sunElevation))) * (0.25 + 0.75 * dayness);
    uniforms.uNight.value = p.night;

    // fog and background must equal what the dome shows at the horizon after tone mapping
    setColour(fog.color, toDisplay(horizon));
    background.copy(fog.color);

    // sun: warm directional light by day, faint cool sky key at night (no moon)
    const sunRgb = mixColour(p.sunColour, nightKeyColour, p.night);
    setColour(sun.color, sunRgb);
    sun.intensity = p.sunIntensity * dayness + SUN_LIGHT.nightKeyIntensity * p.night;
    lightDirection.copy(sunDirection).lerp(nightKeyDir, p.night).normalize();

    setColour(hemi.color, p.hemiSky);
    setColour(hemi.groundColor, p.hemiGround);
    hemi.intensity = p.hemiIntensity;
    placeShadowCamera();
  }

  /** Puts the light `distance` metres from the focus along the light direction, snapped to shadow texels. */
  function placeShadowCamera() {
    if (Math.abs(lightDirection.y) > 0.999) lightDirection.set(0.01, 1, 0.01).normalize();
    lightBasis.lookAt(lightDirection, ORIGIN, UP);          // +Z of the basis = towards the light
    lightBasisInverse.copy(lightBasis).transpose();
    snapped.copy(focus).applyMatrix4(lightBasisInverse);
    snapped.x = Math.round(snapped.x / texel) * texel;
    snapped.y = Math.round(snapped.y / texel) * texel;
    snapped.applyMatrix4(lightBasis);
    sun.target.position.copy(snapped);
    sun.position.copy(snapped).addScaledVector(lightDirection, SKY.shadow.distance);
    sun.target.updateMatrixWorld();
  }

  function setTimeOfDay(hours) {
    currentHour = ((hours % 24) + 24) % 24;
    applyPalette();
  }

  function update(dt, focusPos) {
    elapsed += dt || 0;
    uniforms.uTime.value = elapsed;
    if (focusPos) {
      focus.set(focusPos.x, focusPos.y, focusPos.z);
      dome.position.copy(focus);
      placeShadowCamera();
    }
  }

  function dispose() {
    scene.remove(group);
    dome.geometry.dispose();
    domeMaterial.dispose();
    sun.shadow.dispose();
    sun.dispose();
    hemi.dispose();
    if (scene.fog === fog) scene.fog = null;
    if (scene.background === background) scene.background = null;
    if (manageExposure) renderer.toneMappingExposure = baseExposure;
  }

  applyPalette();

  /**
   * Graphics options (M2b, js/ui/options.js): `size <= 0` turns the sun's own shadow casting off
   * entirely (Low preset) – no light casts, so the renderer's shadow pass has nothing to do, without
   * touching any mesh's own `castShadow` flag. A positive size resizes the map – a `THREE.WebGLRenderer`
   * shadow map cannot be resized in place, so the old one is disposed and rebuilt on the next frame
   * that needs it (the same "dispose then let three.js lazily recreate it" three.js already expects).
   */
  function setShadowQuality(size) {
    if (!(size > 0)) { sun.castShadow = false; return; }
    sun.castShadow = true;
    const capped = Math.min(size, maxTexture);
    if (sun.shadow.mapSize.width === capped) return;
    sun.shadow.mapSize.set(capped, capped);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }

  return {
    sun, hemi, dome, group, sunDirection,
    get timeOfDay() { return currentHour; },
    get exposure() { return exposure; },
    get night() { return uniforms.uNight.value; },
    setTimeOfDay, setShadowQuality, update, dispose,
  };
}
