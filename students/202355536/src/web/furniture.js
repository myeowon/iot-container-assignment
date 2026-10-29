// 책상과 책상 위 소품(스탠드·노트북·책·커피). 좌표는 각 물건의 바닥 중심 기준.
import * as THREE from 'three';
import { box, cyl, group, mat } from './mesh.js';
import { codeScreen } from './textures.js';

export const OAK = '#d6b48a';
export const WHITE = '#f2f0eb';
export const METAL = mat('#3a3a40', { metalness: 0.5, roughness: 0.5 });

/**
 * 책상 치수. 캐릭터는 원점에 앉아 +z를 보고, 책상은 z = near ~ near + depth 에 놓인다.
 * top: 책상 윗면 높이 (소품을 올릴 기준)
 */
export const DESK = { width: 2.4, depth: 1.25, height: 0.85, near: 0.3 };
DESK.top = DESK.height + 0.035;
DESK.far = DESK.near + DESK.depth;     // 좌석 원점 → 책상 앞 가장자리

/** 흰 상판 + 원목 몸체 책상(오른쪽 서랍장, 서랍은 앉는 쪽) + 의자 */
export function deskSet() {
  const { width: w, depth: d, height: h, near } = DESK;
  const midZ = near + d / 2;
  const cabinetX = w / 2 - 0.33;
  const drawers = [0.22, 0.46, 0.7].map((y) => box(0.48, 0.02, 0.01, '#b8936a', [cabinetX, y, near + 0.045]));
  const desk = group(
    box(w, 0.07, d, mat(WHITE, { roughness: 0.65 }), [0, h, midZ]),   // 무광에 가깝게 (스탠드 빛 반사로 하얗게 타지 않게)
    box(w - 0.1, 0.62, 0.04, OAK, [0, h - 0.36, DESK.far - 0.05]),                 // 앞판
    box(0.58, h - 0.06, d - 0.1, OAK, [cabinetX, (h - 0.06) / 2, midZ]),            // 서랍장
    box(0.05, h - 0.06, d - 0.1, OAK, [-w / 2 + 0.05, (h - 0.06) / 2, midZ]),       // 왼쪽 다리판
    ...drawers,
  );
  const legs = [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]
    .map(([x, z]) => cyl(0.02, 0.02, 0.48, METAL, [x, 0.24, z], 6));
  const chair = group(
    box(0.56, 0.05, 0.54, '#c79a68', [0, 0.5, 0]),
    box(0.56, 0.36, 0.05, '#c79a68', [0, 0.86, -0.28]),
    cyl(0.02, 0.02, 0.4, METAL, [-0.24, 0.68, -0.27], 6),
    cyl(0.02, 0.02, 0.4, METAL, [0.24, 0.68, -0.27], 6),
    ...legs,
  );
  return group(desk, chair);
}

/** 노트북: 화면이 캐릭터(-z) 쪽을 본다. setOn으로 화면을 켜고 끈다. */
export function laptop() {
  const screenMaterial = new THREE.MeshStandardMaterial({
    color: '#0d1018', emissive: '#ffffff', emissiveMap: codeScreen(), emissiveIntensity: 0.05,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.27), screenMaterial);
  screen.rotation.y = Math.PI;
  screen.position.set(0, 0.16, -0.012);
  const lid = group(box(0.48, 0.32, 0.02, '#c5c8cf', [0, 0.16, 0]), screen);
  lid.position.z = 0.15;
  lid.rotation.x = 0.28;
  const object = group(box(0.48, 0.025, 0.32, '#c5c8cf', [0, 0.012, 0]), lid);
  return {
    object,
    setOn(on) {
      screenMaterial.emissiveIntensity = on ? 1.4 : 0.05;
    },
  };
}

/** 은행원 스탠드: 황동 몸체 + 빛나는 갓. setLevel(0~1)로 밝기 조절 (아침·낮에는 꺼지고 밤에는 밝게) */
export function bankerLamp(shade) {
  const brass = mat('#b08d4a', { metalness: 0.6, roughness: 0.4 });
  const shadeMaterial = new THREE.MeshStandardMaterial({ color: shade, emissive: shade, emissiveIntensity: 1, roughness: 0.5 });
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.4, 16, 1, false, 0, Math.PI), shadeMaterial);
  hood.rotation.z = Math.PI / 2;
  hood.position.set(0, 0.5, 0.06);
  // 책상 6~8개가 붙어 있어 빛이 겹치므로 한 개당 빛은 약하고 짧게
  const light = new THREE.PointLight('#ffb35c', 1, 2.4, 2);
  light.position.set(0, 0.4, 0.1);
  return {
    object: group(cyl(0.1, 0.12, 0.05, brass, [0, 0.025, 0], 16), cyl(0.016, 0.016, 0.46, brass, [0, 0.26, 0], 6), hood, light),
    /** level 0이면 완전히 꺼진다 (광원은 그대로 두고 세기만 0 — 광원 수가 바뀌면 셰이더를 다시 컴파일함) */
    setLevel(level) {
      light.intensity = level * 1.05;
      shadeMaterial.emissiveIntensity = level * 1.1;
    },
  };
}

/** 누워 있는 책: 앞·뒤 표지 + 책등 + 안쪽 종이 덩어리. 책등은 -x 쪽 */
export function book(color, length = 0.46, thickness = 0.08, width = 0.34) {
  const cover = mat(color, { roughness: 0.6 });
  return group(
    box(length - 0.02, thickness - 0.02, width - 0.025, '#f3ecdc', [0.01, 0, 0]),
    box(length, 0.012, width, cover, [0, thickness / 2 - 0.006, 0]),
    box(length, 0.012, width, cover, [0, -thickness / 2 + 0.006, 0]),
    box(0.016, thickness, width, cover, [-length / 2 + 0.008, 0, 0]),
  );
}

/** 김이 나는 커피 머그. tick(t)를 매 프레임 호출하면 김이 피어오른다. */
export function coffeeMug(color = '#f2ece2') {
  const height = 0.17;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.016, 8, 16), mat(color));
  handle.position.x = 0.095;
  const steam = Array.from({ length: 3 }, () => {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 10, 8),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    return puff;
  });
  const object = group(
    cyl(0.085, 0.075, height, color, [0, height / 2, 0], 20),
    cyl(0.075, 0.075, 0.01, '#4a2c1a', [0, height - 0.012, 0], 20),   // 커피
    handle,
    ...steam,
  );
  handle.position.y = height / 2;
  return {
    object,
    tick(t) {
      steam.forEach((puff, i) => {
        const phase = (t * 0.45 + i / steam.length) % 1;       // 0 → 1 로 올라가며 사라진다
        puff.position.set(Math.sin(t * 2 + i) * 0.02, height + phase * 0.32, 0);
        puff.scale.setScalar(0.6 + phase);
        puff.material.opacity = Math.sin(phase * Math.PI) * 0.25;
      });
    },
  };
}

/** 펼친 책: 양쪽 페이지가 V자로 살짝 들려 있다. setColor로 표지 색을 바꾼다. */
export function openBook() {
  const cover = new THREE.MeshStandardMaterial({ color: '#e76f51', roughness: 0.6 });
  const half = (side) => {
    const g = group(
      box(0.42, 0.014, 0.56, cover, [side * 0.21, 0, 0]),
      box(0.4, 0.04, 0.53, '#f6f0e2', [side * 0.21, 0.027, 0]),
    );
    g.rotation.z = side * 0.1;
    return g;
  };
  return { object: group(half(-1), half(1)), setColor: (c) => cover.color.set(c) };
}
