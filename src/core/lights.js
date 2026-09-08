import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function setupEnvironment(scene, renderer) {
  scene.background = new THREE.Color(0xe6eef2);
  scene.fog = new THREE.Fog(0xe6eef2, 170, 300);

  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x9db78a, 0.75));

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(60, 95, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -85;
  sun.shadow.camera.right = 85;
  sun.shadow.camera.top = 85;
  sun.shadow.camera.bottom = -85;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 250;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);
  return { sun };
}

export function frameSun(sun, bounds) {
  const span = Math.max(bounds.sx, bounds.sz);
  const half = Math.max(85, span / 2 + 34);
  const shadow = sun.shadow;

  sun.position.set(bounds.cx + 60, 95, bounds.cz + 40);
  sun.target.position.set(bounds.cx, 0, bounds.cz);
  sun.target.updateMatrixWorld();

  shadow.camera.left = -half;
  shadow.camera.right = half;
  shadow.camera.top = half;
  shadow.camera.bottom = -half;
  shadow.camera.far = 250 + span;
  shadow.camera.updateProjectionMatrix();

  const size = span > 150 ? 4096 : 2048;
  if (shadow.mapSize.x !== size) {
    shadow.mapSize.set(size, size);
    shadow.map?.dispose();
    shadow.map = null;
  }
}
