// Three.js renderer/scene/camera setup with the project's colour pipeline (ACES, sRGB, shadows, fog).
import * as THREE from "three";
import { RENDER } from "../config.js";

export function createRenderer(container) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", stencil: false });
  } catch (err) {
    throw new Error(`WebGL renderer could not be created: ${err && err.message ? err.message : err}`);
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap is deprecated in r185
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = RENDER.toneMappingExposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(RENDER.fov, container.clientWidth / container.clientHeight, RENDER.near, RENDER.far);

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);
  resize();

  return { renderer, scene, camera, resize };
}
