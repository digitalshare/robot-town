import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const VIEW_SIZE = 95;

export function createCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.OrthographicCamera(
    (-VIEW_SIZE * aspect) / 2,
    (VIEW_SIZE * aspect) / 2,
    VIEW_SIZE / 2,
    -VIEW_SIZE / 2,
    -200,
    600
  );
  camera.position.set(72, 78, 72);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function resizeCamera(camera) {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = (-VIEW_SIZE * aspect) / 2;
  camera.right = (VIEW_SIZE * aspect) / 2;
  camera.top = VIEW_SIZE / 2;
  camera.bottom = -VIEW_SIZE / 2;
  camera.updateProjectionMatrix();
}

export function createControls(camera, dom) {
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minZoom = 0.2;
  controls.maxZoom = 8;
  controls.maxPolarAngle = Math.PI / 2;
  controls.screenSpacePanning = false;
  return controls;
}
