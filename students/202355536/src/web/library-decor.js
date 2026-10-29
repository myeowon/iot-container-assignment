// 도서관 공간 장식: 책장·통유리 창·벽 조명·라운지 의자·화분. 좌표는 각 물건의 바닥 중심 기준.
import * as THREE from 'three';
import { METAL, OAK, WHITE } from './furniture.js';
import { box, cyl, group, mat } from './mesh.js';

const BOOK_COLORS = ['#f4f1ea', '#e9e4da', '#c94f45', '#3f5f8a', '#e0b84a', '#5f8a6a', '#2f3a4a', '#d98a6a', '#8a6fb0', '#f0d9b5'];

/** 칸칸이 책이 꽂힌 원목 책장. 길이 방향은 x, 책이 보이는 면은 +z. 책은 InstancedMesh 하나로 그린다. */
export function libraryShelf(length, height = 3.2, depth = 0.45) {
  const cols = Math.round(length / 0.9);
  const rows = Math.round(height / 0.5);
  const cellW = length / cols;
  const cellH = height / rows;
  const g = group(
    box(length, height, 0.04, OAK, [0, height / 2, -depth / 2]),
    ...Array.from({ length: rows + 1 }, (_, r) => box(length, 0.04, depth, OAK, [0, r * cellH, 0])),
    ...Array.from({ length: cols + 1 }, (_, c) => box(0.04, height, depth, OAK, [-length / 2 + c * cellW, height / 2, 0])),
  );

  const books = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let x = -length / 2 + c * cellW + 0.04;
      const end = x + (cellW - 0.08) * (0.4 + Math.random() * 0.6);   // 칸마다 채운 정도가 다르게
      while (x < end) {
        const w = 0.035 + Math.random() * 0.035;
        const h = cellH * (0.6 + Math.random() * 0.3);
        books.push({ x: x + w / 2, y: r * cellH + 0.02 + h / 2, w, h });
        x += w + 0.004;
      }
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat('#ffffff'), books.length);
  const m = new THREE.Matrix4();
  books.forEach((b, i) => {
    m.compose(new THREE.Vector3(b.x, b.y, 0.02), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, depth * 0.75));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, new THREE.Color(BOOK_COLORS[Math.floor(Math.random() * BOOK_COLORS.length)]));
  });
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

/** 통유리 창 벽. 길이 방향은 x, 실내는 +z. 가운데에 흰 기둥. */
export function windowWall(length, height) {
  const frame = mat('#2e3136', { metalness: 0.4, roughness: 0.5 });
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(length, height),
    new THREE.MeshStandardMaterial({ color: '#d8eef5', transparent: true, opacity: 0.1, roughness: 0.05, depthWrite: false }));
  glass.position.y = height / 2;
  const mullions = Math.round(length / 1.6);
  return group(
    glass,
    ...Array.from({ length: mullions + 1 }, (_, i) => box(0.1, height, 0.12, frame, [-length / 2 + (i * length) / mullions, height / 2, 0])),
    ...[0.04, 2.5, 4.3, height - 0.05].map((y) => box(length, 0.1, 0.12, frame, [0, y, 0])),
    box(length, 0.5, 0.6, WHITE, [0, height + 0.2, 0.2]),                          // 천장 보
    box(0.7, height, 0.7, WHITE, [0, height / 2, 0.3]),                            // 가운데 기둥
  );
}

/**
 * 벽 조명(업라이트): 벽에 붙는 황동 받침 + 반원 갓. 실내 쪽은 +z.
 * withLight가 false면 빛나는 갓만 둔다 (점광원이 많으면 렌더링이 무거워진다).
 */
export function wallSconce({ withLight = true } = {}) {
  const brass = mat('#b08d4a', { metalness: 0.6, roughness: 0.4 });
  const shadeMaterial = new THREE.MeshStandardMaterial({
    color: '#f3dfbf', emissive: '#ffcf8a', emissiveIntensity: 1, side: THREE.DoubleSide, roughness: 0.6,
  });
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.2, 20, 1, true, -Math.PI / 2, Math.PI), shadeMaterial);
  bowl.position.z = 0.02;
  const object = group(box(0.1, 0.3, 0.03, brass, [0, -0.08, 0.015]), bowl);
  const light = withLight ? new THREE.PointLight('#ffc27a', 1, 4, 1.8) : null;
  if (light) {
    light.position.set(0, 0.3, 0.3);
    object.add(light);
  }
  return {
    object,
    setLevel(level) {
      if (light) light.intensity = 0.1 + level * 1.6;
      shadeMaterial.emissiveIntensity = 0.15 + level * 0.9;
    },
  };
}

/** 창가 가죽 라운지 의자 (등받이가 -z, 앉는 사람은 +z를 본다) */
export function armchair() {
  const leather = mat('#8a4b2a', { roughness: 0.55 });
  const back = box(0.8, 0.7, 0.16, leather, [0, 0.85, -0.3]);
  back.rotation.x = -0.15;
  return group(
    box(0.8, 0.2, 0.7, leather, [0, 0.45, 0]),
    back,
    box(0.14, 0.3, 0.6, leather, [-0.42, 0.62, 0]),
    box(0.14, 0.3, 0.6, leather, [0.42, 0.62, 0]),
    cyl(0.04, 0.04, 0.35, METAL, [0, 0.18, 0], 8),
    cyl(0.32, 0.32, 0.03, METAL, [0, 0.02, 0], 16),
  );
}

export function sideTable() {
  return group(cyl(0.3, 0.3, 0.04, WHITE, [0, 0.55, 0], 24), cyl(0.03, 0.03, 0.55, METAL, [0, 0.27, 0], 8));
}

export function plant(scale = 1) {
  const leaves = new THREE.MeshStandardMaterial({ color: '#5f9a55', roughness: 0.9, flatShading: true });
  const g = group(cyl(0.28, 0.22, 0.5, WHITE, [0, 0.25, 0]));
  [[0, 1.0, 0, 0.42], [0.22, 0.8, 0.1, 0.32], [-0.2, 0.85, -0.08, 0.34], [0.05, 1.3, 0.05, 0.28]].forEach(([x, y, z, r]) => {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leaves);
    leaf.position.set(x, y, z);
    leaf.castShadow = true;
    g.add(leaf);
  });
  g.scale.setScalar(scale);
  return g;
}
