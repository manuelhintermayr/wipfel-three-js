// Distant backdrop: three rings of hazy hill silhouettes and a city skyline card in the valley to the south.
// Two draw calls, no shadows, no scene fog (it would swallow it) – instead the colours are mixed towards the
// current `scene.fog.color` every frame, so the backdrop follows the sky's time of day. City lights fade in when
// the fog turns dark (night).
import * as THREE from "three";
import { Rng, makeNoise2D, fbm2D } from "../core/rng.js";

export const SKYLINE = Object.freeze({
  valleyY: -40,                // world height of the city ground (below the slope; horizon = eye level)
  citySpan: 1.25,              // radians of arc covered by the city card
  cardHeight: 160,             // metres from the card bottom (valleyY - 20) to its top
  textureWidth: 2048,
  textureHeight: 384,
  cityColour: 0x3c4a5c,        // silhouette base colour (sRGB) before haze
  cityHaze: 0.72,              // share of fog colour at the top of the card (more towards the base)
  segments: 256,               // ring resolution
  hills: Object.freeze([       // far → near; heights in metres above the world origin, haze = share of fog colour
    { radius: 2600, baseY: 40, amp: 130, colour: 0x4a5c7c, haze: 0.88, gapHalf: 0.75, gapY: 10, gapAmp: 25 },
    { radius: 1900, baseY: 30, amp: 120, colour: 0x39495a, haze: 0.79, gapHalf: 0.85, gapY: -30, gapAmp: 20 },
    { radius: 1300, baseY: 25, amp: 105, colour: 0x2f3d3b, haze: 0.68, gapHalf: 0.95, gapY: -62, gapAmp: 16 },
  ]),
});

// The backdrop sits beyond the camera's far plane (RENDER.far = 900 m), so every vertex is pinned to an NDC depth
// just inside the far plane – nearer layers get a smaller depth so they still occlude each other correctly (the sky
// dome uses 0.99999). Steps of 1e-5 are ≈ 80 depth-buffer codes, far above float noise.
export const BACKDROP_DEPTH = Object.freeze({ farHills: 0.99998, midHills: 0.99997, city: 0.99996, nearHills: 0.99995 });

const HILL_VERTEX = /* glsl */ `
attribute float aHaze; attribute float aDepth; varying vec3 vColor; varying float vHaze;
void main() {
  vColor = color; vHaze = aHaze;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  clip.z = clip.w * aDepth;
  gl_Position = clip;
}`;
const HILL_FRAGMENT = /* glsl */ `
uniform vec3 uFog; varying vec3 vColor; varying float vHaze;
void main() { gl_FragColor = vec4(mix(vColor, uFog, vHaze), 1.0); }`;

const CITY_VERTEX = /* glsl */ `
uniform float uDepth; varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  clip.z = clip.w * uDepth;
  gl_Position = clip;
}`;
const CITY_FRAGMENT = /* glsl */ `
uniform sampler2D uSilhouette; uniform sampler2D uLights; uniform vec3 uFog; uniform vec3 uCity;
uniform float uHaze; uniform float uNight; uniform float uTime;
varying vec2 vUv;
void main() {
  vec4 s = texture2D(uSilhouette, vUv);
  vec4 l = texture2D(uLights, vUv);
  float haze = uHaze + (1.0 - uHaze) * (1.0 - vUv.y) * 0.75;   // thicker air towards the valley floor
  vec3 col = mix(uCity * (0.65 + 0.6 * s.r), uFog, haze);
  float flicker = 0.9 + 0.1 * sin(uTime * 2.0 + vUv.x * 300.0);
  float lights = l.a * uNight * flicker;
  col = mix(col, l.rgb, lights);
  float alpha = max(s.a, lights);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col, alpha);
}`;

const srgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

function makeCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");   // fallback for browsers without OffscreenCanvas
  canvas.width = width; canvas.height = height;
  return canvas;
}

// ---------------------------------------------------------------- hills

/** One merged ring-strip geometry for all hill layers; heading = centre of the valley gap. */
function buildHills(rng, heading) {
  const N = SKYLINE.segments;
  const positions = [], colours = [], hazes = [], depths = [], indices = [];
  SKYLINE.hills.forEach((layer, li) => {
    const noise = makeNoise2D(rng.int(0, 1e9));
    const base = li * (N + 1) * 2;
    const depth = [BACKDROP_DEPTH.farHills, BACKDROP_DEPTH.midHills, BACKDROP_DEPTH.nearHills][li];
    for (let i = 0; i <= N; i++) {
      const theta = (i / N) * Math.PI * 2;
      const c = Math.cos(theta), s = Math.sin(theta);
      const shape = fbm2D(noise, c * 2.2 + 5.3, s * 2.2 + 9.1, 4) * 0.5 + 0.5;
      const ridge = layer.baseY + layer.amp * shape;
      const gapNoise = fbm2D(noise, c * 5 + 1.7, s * 5 + 3.9, 3) * 0.5 + 0.5;
      const inGap = layer.gapY + layer.gapAmp * gapNoise;
      let d = Math.abs(theta - heading) % (Math.PI * 2);
      if (d > Math.PI) d = Math.PI * 2 - d;
      const gap = 1 - smooth(layer.gapHalf * 0.55, layer.gapHalf, d);
      const y = ridge + (inGap - ridge) * gap;
      const x = Math.sin(theta) * layer.radius, z = Math.cos(theta) * layer.radius;
      positions.push(x, SKYLINE.valleyY - 400, z, x, y, z);
      const col = srgb(layer.colour);
      colours.push(col[0], col[1], col[2], col[0], col[1], col[2]);
      hazes.push(layer.haze + (1 - layer.haze) * 0.55, layer.haze);
      depths.push(depth, depth);
      if (i < N) {
        const a = base + i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute("aHaze", new THREE.Float32BufferAttribute(hazes, 1));
  geometry.setAttribute("aDepth", new THREE.Float32BufferAttribute(depths, 1));
  geometry.setIndex(indices);
  return geometry;
}

function smooth(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------- city texture

/** Paints silhouette (r = shade, a = coverage) and lights (rgb + a) canvases; sizes in px, ground line at `groundY`. */
function paintCity(silhouette, lights, rng, dims) {
  const { width, groundY, pxPerMx, pxPerMy } = dims;
  const noise = makeNoise2D(rng.int(0, 1e9));
  const envelope = (u) => 0.35 + 0.65 * (fbm2D(noise, u * 6, 0.5, 3) * 0.5 + 0.5);
  const rows = [
    { shade: 0.9, lift: 6, minH: 12, maxH: 30, dense: 1.0 },   // farthest row: lightest, highest on the page
    { shade: 0.72, lift: 3, minH: 10, maxH: 26, dense: 0.95 },
    { shade: 0.48, lift: 0, minH: 8, maxH: 22, dense: 0.9 },   // nearest row: darkest
  ];
  const towerSide = rng.bool() ? 0.22 : 0.78;
  const landmarks = [
    { kind: "cluster", u: towerSide + rng.float(-0.05, 0.05) },
    { kind: "needle", u: 1 - towerSide + rng.float(-0.06, 0.06) },
    { kind: "spire", u: rng.float(0.42, 0.58) },
    { kind: "spire", u: rng.float(0.1, 0.9) },
    { kind: "dome", u: rng.float(0.3, 0.7) },
  ];
  for (const row of rows) drawRow(silhouette, lights, rng, row, envelope, dims);
  for (const mark of landmarks) drawLandmark(silhouette, lights, rng, mark, dims);
  // street-level glow and sodium lights along the base (night only – it lives on the lights canvas)
  const glow = lights.createLinearGradient(0, groundY - 22 * pxPerMy, 0, groundY + 2);
  glow.addColorStop(0, "rgba(255,190,120,0)");
  glow.addColorStop(1, "rgba(255,190,120,0.35)");
  lights.fillStyle = glow;
  lights.fillRect(0, groundY - 22 * pxPerMy, width, 22 * pxPerMy + 2);
  for (let x = rng.float(0, 8); x < width; x += rng.float(4, 9) * pxPerMx) {
    lights.fillStyle = `rgba(255,${rng.int(150, 190)},${rng.int(60, 100)},${rng.float(0.5, 0.9)})`;
    lights.fillRect(x, groundY - rng.float(1, 4) * pxPerMy, 1.5, 1.5);
  }
}

function drawRow(ctx, lights, rng, row, envelope, dims) {
  const { width, groundY, pxPerMx, pxPerMy } = dims;
  let x = -rng.float(0, 10);
  while (x < width) {
    const u = x / width;
    const w = rng.float(5, 28) * pxPerMx;
    const env = envelope(u);
    const tall = rng.bool(0.14 * env);
    const h = (tall ? rng.float(row.maxH, row.maxH * 2.4) : rng.float(row.minH, row.maxH)) * env * pxPerMy;
    if (rng.bool(row.dense)) {
      const shade = row.shade + rng.float(-0.08, 0.08);
      fillBuilding(ctx, lights, rng, x, groundY - row.lift, w, h, shade, dims);
    }
    x += w + rng.float(0, 3) * pxPerMx;
  }
}

/** Box building with a few roof details; windows go to the lights canvas. */
function fillBuilding(ctx, lights, rng, x, baseY, w, h, shade, dims) {
  const { pxPerMx, pxPerMy } = dims;
  ctx.fillStyle = grey(shade);
  ctx.fillRect(x, baseY - h, w, h);
  if (rng.bool(0.3)) ctx.fillRect(x + w * rng.float(0.2, 0.6), baseY - h - 2 * pxPerMy, Math.max(1, w * 0.15), 2 * pxPerMy);
  const cols = Math.max(1, Math.floor(w / (2.2 * pxPerMx))), rowsN = Math.max(1, Math.floor(h / (2.6 * pxPerMy)));
  for (let i = 0; i < cols; i++) for (let j = 0; j < rowsN; j++) {
    if (!rng.bool(0.32)) continue;
    const warm = rng.bool(0.7);
    lights.fillStyle = warm ? `rgba(255,${rng.int(190, 225)},${rng.int(120, 170)},${rng.float(0.55, 1)})` : `rgba(210,225,255,${rng.float(0.5, 0.9)})`;
    lights.fillRect(x + 0.6 * pxPerMx + i * 2.2 * pxPerMx, baseY - h + 0.8 * pxPerMy + j * 2.6 * pxPerMy, 1, 1);
  }
}

function drawLandmark(ctx, lights, rng, mark, dims) {
  const { width, groundY, pxPerMx, pxPerMy } = dims;
  const cx = mark.u * width;
  if (mark.kind === "cluster") {
    const count = rng.int(4, 6);
    for (let i = 0; i < count; i++) {
      const w = rng.float(14, 24) * pxPerMx, h = rng.float(55, 95) * pxPerMy;
      const x = cx + (i - count / 2) * rng.float(18, 28) * pxPerMx;
      fillBuilding(ctx, lights, rng, x, groundY, w, h, rng.float(0.42, 0.62), dims);
      lights.fillStyle = "rgba(255,60,50,1)";
      lights.fillRect(x + w / 2, groundY - h - 1, 1.5, 1.5);   // aviation light
    }
  } else if (mark.kind === "needle") {
    const h = 100 * pxPerMy, shaft = 4 * pxPerMx;
    ctx.fillStyle = grey(0.55);
    ctx.fillRect(cx - shaft / 2, groundY - h, shaft, h);
    ctx.fillRect(cx - 6 * pxPerMx, groundY - h * 0.8, 12 * pxPerMx, 6 * pxPerMy);   // observation pod
    ctx.fillRect(cx - 0.6 * pxPerMx, groundY - h - 10 * pxPerMy, 1.2 * pxPerMx, 10 * pxPerMy);  // antenna
    lights.fillStyle = "rgba(255,60,50,1)";
    lights.fillRect(cx - 0.75, groundY - h - 10 * pxPerMy, 1.5, 1.5);
    lights.fillStyle = "rgba(255,220,170,0.9)";
    lights.fillRect(cx - 5 * pxPerMx, groundY - h * 0.8 + 2.5 * pxPerMy, 10 * pxPerMx, 1);
  } else if (mark.kind === "spire") {
    const bodyW = 16 * pxPerMx, bodyH = 30 * pxPerMy, towerW = 7 * pxPerMx, towerH = 46 * pxPerMy, spireH = 30 * pxPerMy;
    ctx.fillStyle = grey(0.5);
    ctx.fillRect(cx - bodyW / 2, groundY - bodyH, bodyW, bodyH);
    ctx.fillRect(cx - towerW / 2 + bodyW * 0.2, groundY - towerH, towerW, towerH);
    ctx.beginPath();
    ctx.moveTo(cx - towerW / 2 + bodyW * 0.2, groundY - towerH);
    ctx.lineTo(cx + towerW / 2 + bodyW * 0.2, groundY - towerH);
    ctx.lineTo(cx + bodyW * 0.2, groundY - towerH - spireH);
    ctx.closePath();
    ctx.fill();
  } else if (mark.kind === "dome") {
    const w = 28 * pxPerMx, h = 22 * pxPerMy;
    ctx.fillStyle = grey(0.6);
    ctx.fillRect(cx - w / 2, groundY - h, w, h);
    ctx.beginPath();
    ctx.ellipse(cx, groundY - h, w * 0.4, 12 * pxPerMy, 0, Math.PI, 0);
    ctx.fill();
  }
}

const grey = (shade) => { const v = Math.round(Math.min(1, Math.max(0, shade)) * 255); return `rgb(${v},${v},${v})`; };

// ---------------------------------------------------------------- city card

function buildCityCard(distance, heading, cityTexture, lightsTexture) {
  const N = 40, span = SKYLINE.citySpan;
  const bottom = SKYLINE.valleyY - 20, top = bottom + SKYLINE.cardHeight;
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const theta = heading + span / 2 - u * span;   // u grows to the right as seen from the world origin
    const x = Math.sin(theta) * distance, z = Math.cos(theta) * distance;
    positions.push(x, bottom, z, x, top, z);
    uvs.push(u, 0, u, 1);
    if (i < N) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSilhouette: { value: cityTexture }, uLights: { value: lightsTexture },
      uFog: { value: new THREE.Vector3(0.8, 0.85, 0.9) }, uCity: { value: new THREE.Vector3(...srgb(SKYLINE.cityColour)) },
      uHaze: { value: SKYLINE.cityHaze }, uNight: { value: 0 }, uTime: { value: 0 }, uDepth: { value: BACKDROP_DEPTH.city },
    },
    vertexShader: CITY_VERTEX, fragmentShader: CITY_FRAGMENT,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
  });
  return new THREE.Mesh(geometry, material);
}

function makeTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;   // data-like: shade in r, coverage in a (city) / lights are output-referred
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Distant hills + city skyline backdrop.
 * @param {{ scene: THREE.Scene, rng?: Rng, distance?: number, heading?: number }} options
 *   `heading` = world yaw of the valley/city centre: direction (sin, 0, cos) → π = -Z = south.
 */
export function createSkyline({ scene, rng, distance = 1400, heading = Math.PI }) {
  const skylineRng = (rng || new Rng(1)).fork("skyline");
  const group = new THREE.Group();
  group.name = "skyline";

  const hills = new THREE.Mesh(buildHills(skylineRng.fork("hills"), heading), new THREE.ShaderMaterial({
    uniforms: { uFog: { value: new THREE.Vector3(0.8, 0.85, 0.9) } },
    vertexShader: HILL_VERTEX, fragmentShader: HILL_FRAGMENT, vertexColors: true, side: THREE.DoubleSide, fog: false, toneMapped: false,
  }));
  hills.name = "hills";

  const width = SKYLINE.textureWidth, height = SKYLINE.textureHeight;
  const silhouetteCanvas = makeCanvas(width, height), lightsCanvas = makeCanvas(width, height);
  const dims = { width, height, groundY: height - 20 * (height / SKYLINE.cardHeight), pxPerMx: width / (distance * SKYLINE.citySpan), pxPerMy: height / SKYLINE.cardHeight };
  paintCity(silhouetteCanvas.getContext("2d"), lightsCanvas.getContext("2d"), skylineRng.fork("city"), dims);
  const cityTexture = makeTexture(silhouetteCanvas), lightsTexture = makeTexture(lightsCanvas);
  const city = buildCityCard(distance, heading, cityTexture, lightsTexture);
  city.name = "city";

  for (const mesh of [hills, city]) {
    mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  scene.add(group);

  const fogSrgb = new THREE.Color();
  let elapsed = 0;

  function update(dt) {
    elapsed += dt || 0;
    if (scene.fog) scene.fog.color.getRGB(fogSrgb, THREE.SRGBColorSpace);
    else fogSrgb.setRGB(0.8, 0.85, 0.9, THREE.SRGBColorSpace);
    hills.material.uniforms.uFog.value.set(fogSrgb.r, fogSrgb.g, fogSrgb.b);
    const cu = city.material.uniforms;
    cu.uFog.value.set(fogSrgb.r, fogSrgb.g, fogSrgb.b);
    const luminance = 0.2126 * fogSrgb.r + 0.7152 * fogSrgb.g + 0.0722 * fogSrgb.b;
    cu.uNight.value = smooth(0.36, 0.1, luminance);   // lights come on as the haze goes dark
    cu.uTime.value = elapsed;
  }

  function dispose() {
    scene.remove(group);
    hills.geometry.dispose(); hills.material.dispose();
    city.geometry.dispose(); city.material.dispose();
    cityTexture.dispose(); lightsTexture.dispose();
  }

  update(0);
  return { group, update, dispose };
}
