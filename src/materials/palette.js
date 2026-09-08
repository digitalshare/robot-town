import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const std = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, ...opts });

export const MAT = {
  ground: std(0xc2cdd4, { roughness: 0.95 }),
  slab: std(0xe7ebee, { roughness: 0.9 }),
  asphalt: std(0x4e565f, { roughness: 0.95 }),
  asphaltDark: std(0x454d55, { roughness: 0.95 }),
  wallWhite: std(0xf4f7f9, { roughness: 0.65 }),
  wallGray: std(0xdde3e8, { roughness: 0.75 }),
  wallDark: std(0x9aa4ad, { roughness: 0.7 }),
  dark: std(0x394046, { roughness: 0.8 }),
  grass: std(0x7cc06a, { roughness: 0.95 }),
  grassDark: std(0x61a852, { roughness: 0.95 }),
  leaf: std(0x57b156, { roughness: 0.9 }),
  leafDark: std(0x3e9a49, { roughness: 0.9 }),
  trunk: std(0x8a6a4c, { roughness: 0.9 }),
  cyan: std(0x59dcea, { emissive: new THREE.Color(0x17b5cc), emissiveIntensity: 1.6, roughness: 0.4 }),
  cyanSoft: std(0x9fe6ee, { emissive: new THREE.Color(0x2cc4d8), emissiveIntensity: 0.9, roughness: 0.5 }),
  teal: std(0x49e8cd, { emissive: new THREE.Color(0x12cfae), emissiveIntensity: 1.3, roughness: 0.4 }),
  screen: std(0x86e4ee, { emissive: new THREE.Color(0x10bcd4), emissiveIntensity: 1.25, roughness: 0.3 }),
  orange: std(0xe08040, { roughness: 0.6 }),
  crate: std(0xc9a06a, { roughness: 0.85 }),
  solar: std(0x2b5fd0, { roughness: 0.35, metalness: 0.4 }),
  glass: std(0xbfe8ef, { transparent: true, opacity: 0.3, roughness: 0.15, metalness: 0.1, depthWrite: false }),
};

export const unitBox = new THREE.BoxGeometry(1, 1, 1);

export function box(w, h, d, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(unitBox, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function cyl(rt, rb, h, mat, seg = 16, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function rbox(w, h, d, mat, x = 0, y = 0, z = 0, radius = 0.15, shadow = true) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}
