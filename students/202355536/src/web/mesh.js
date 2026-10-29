// 3D 도형·재질 헬퍼 (재질은 색별로 캐시해서 재사용)
import * as THREE from 'three';

const cache = new Map();

export function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }));
  return cache.get(key);
}

/** 빛나는 재질 (블룸 효과로 번져 보인다) */
export const glow = (color, intensity = 2) => mat(color, { emissive: color, emissiveIntensity: intensity });

/** 봉제인형 느낌의 털/천 재질 */
export function plush(color) {
  const key = `plush${color}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshPhysicalMaterial({
      color, roughness: 0.95, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.5),
    }));
  }
  return cache.get(key);
}

function place(mesh, [x, y, z]) {
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

const asMaterial = (m) => (m instanceof THREE.Material ? m : mat(m));

export const box = (w, h, d, m, pos = [0, 0, 0]) =>
  place(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), asMaterial(m)), pos);

export const cyl = (rTop, rBottom, h, m, pos = [0, 0, 0], segments = 20) =>
  place(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), asMaterial(m)), pos);

export function sphere(r, m, pos = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = place(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), asMaterial(m)), pos);
  mesh.scale.set(...scale);
  return mesh;
}

export const capsule = (r, len, m, pos = [0, 0, 0]) =>
  place(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), asMaterial(m)), pos);

export function group(...children) {
  const g = new THREE.Group();
  g.add(...children);
  return g;
}
