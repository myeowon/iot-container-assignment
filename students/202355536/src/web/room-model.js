// 도서관 디오라마: 통유리 창(창밖은 실제 시각의 하늘) · 양쪽 원목 책장 · 창가 라운지
// + 가운데 책상 섬(좌석, 책상마다 스탠드) 배치
import * as THREE from 'three';
import { DESK, bankerLamp, deskSet, laptop } from './furniture.js';
import { armchair, libraryShelf, plant, sideTable, wallSconce, windowWall } from './library-decor.js';
import { box, group } from './mesh.js';
import { createSkyView, woodFloor } from './textures.js';

export const ROOM = { width: 14, depth: 10, wallHeight: 5.2 };
const W = ROOM.width / 2;
const D = ROOM.depth / 2;
const EXTEND = 7;                         // 카메라(+x) 쪽으로 바닥·벽·책장을 늘려 방 밖 빈 공간이 안 보이게
const DESK_SPACING = DESK.width + 0.05;   // 책상을 옆으로 붙인다
const ISLAND_Z = -0.5;                    // 책상 섬의 중심
const LAMP_SHADES = ['#6f9a5c', '#e8a33d'];
const BACK_SHELF_HEIGHT = 3.0;            // 그 위에 단 벽 조명이 화면 안에 들어오는 높이

function place(object, [x, y, z], rotY = 0) {
  object.position.set(x, y, z);
  object.rotation.y = rotY;
  return object;
}

function floor() {
  const length = ROOM.width + EXTEND;
  const map = woodFloor().clone();
  map.repeat.set(length / 3.5, 3);
  map.needsUpdate = true;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(length, ROOM.depth), new THREE.MeshStandardMaterial({ map, roughness: 0.6 }));
  top.rotation.x = -Math.PI / 2;
  top.position.x = EXTEND / 2;
  top.receiveShadow = true;
  return top;
}

/**
 * 창밖 풍경판: 조명 영향을 받지 않는 재질로 하늘 그림을 그대로 보여 준다.
 * 카메라가 위에서 내려다보므로 지평선(그림의 62% 높이)이 바닥 높이 근처(y≈-0.3)에 오게 낮춰 둔다.
 */
function skyBackdrop(sky) {
  const height = 26;
  const horizonY = -0.3;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(60, height),
    new THREE.MeshBasicMaterial({ map: sky.texture, fog: false, toneMapped: false }));
  return place(plane, [-W - 4, horizonY - height / 2 + height * 0.62, 0], Math.PI / 2);
}

function library() {
  const h = ROOM.wallHeight;
  const wallLength = ROOM.width + EXTEND;
  const shelfLength = wallLength - 1.4;
  const shelfX = 0.7 + EXTEND / 2;
  return group(
    place(windowWall(ROOM.depth, h), [-W, 0, 0], Math.PI / 2),
    box(wallLength, h, 0.3, '#ece8e1', [EXTEND / 2, h / 2, -D - 0.15]),          // 뒷벽
    box(wallLength, h, 0.3, '#ece8e1', [EXTEND / 2, h / 2, D + 0.15]),           // 앞벽
    place(libraryShelf(shelfLength, BACK_SHELF_HEIGHT), [shelfX, 0, -D + 0.25]),
    place(libraryShelf(shelfLength, 2.2), [shelfX, 0, D - 0.25], Math.PI),
    place(armchair(), [-W + 1.3, 0, -3.4], -Math.PI / 2),                          // 창을 바라보는 라운지
    place(sideTable(), [-W + 1.3, 0, -2.6]),
    place(armchair(), [-W + 1.3, 0, 2.7], -Math.PI / 2),
    // 창가 화분: 가운데 기둥 양옆과 양 끝 구석
    ...[[-D + 0.7, 1.2], [-1.1, 0.9], [1.0, 1.3], [2.0, 0.7], [D - 0.8, 1.1], [-1.9, 0.6]]
      .map(([z, scale]) => place(plant(scale), [-W + 0.55, 0, z])),
  );
}

/**
 * 양쪽 책장 위 벽에 일정 간격으로 붙이는 벽 조명. 점광원은 잘 보이는 뒷벽 쪽에만 둔다.
 * 앞벽은 카메라와 가까워 화면 가장자리에서 크게 잘려 보이므로 창 쪽(먼 구간)에만 둔다.
 */
function wallLights() {
  const first = -W + 2.4;
  const last = W + 1;
  const count = Math.round((last - first) / 3.2) + 1;
  const xs = Array.from({ length: count }, (_, i) => first + (i * (last - first)) / (count - 1));
  const back = xs.map((x) => {
    const s = wallSconce();
    place(s.object, [x, BACK_SHELF_HEIGHT + 0.4, -D]);
    return s;
  });
  const front = xs.filter((x) => x < 0).map((x) => {
    const s = wallSconce({ withLight: false });
    place(s.object, [x, 3.1, D], Math.PI);
    return s;
  });
  return [...back, ...front];
}

/**
 * 책상 앞면끼리 맞붙인 "책상 섬" 배치. 두 줄이 서로 마주 본다.
 * 앞쪽 인덱스 줄은 +z를 보고, 나머지 줄은 180° 돌아 -z를 본다.
 */
export function seatLayout(count) {
  const cols = count / 2;
  return Array.from({ length: count }, (_, i) => {
    const facingPlusZ = i < cols;
    return {
      x: (i % cols - (cols - 1) / 2) * DESK_SPACING + 0.6,
      z: ISLAND_Z + (facingPlusZ ? -DESK.far : DESK.far),
      rotY: facingPlusZ ? 0 : Math.PI,
    };
  });
}

/** 빈 자리 표시(바닥의 고리) */
function seatMarker() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.38, 0.5, 32),
    new THREE.MeshBasicMaterial({ color: '#ffcf8a', transparent: true, opacity: 0.7 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  return ring;
}

function seat({ x, z, rotY }, index, hitMaterial) {
  const anchor = place(new THREE.Group(), [x, 0, z], rotY);
  const screen = laptop();
  screen.object.position.set(0.05, DESK.top, DESK.near + 0.35);
  // 클릭 판정 상자: 의자 뒤(-0.45) ~ 책상 앞 가장자리 직전까지 (마주 보는 좌석과 겹치지 않게)
  const hitDepth = DESK.far - 0.05 + 0.45;
  const hitbox = new THREE.Mesh(new THREE.BoxGeometry(DESK.width - 0.05, 1.6, hitDepth), hitMaterial);
  hitbox.position.set(0, 0.8, -0.45 + hitDepth / 2);
  hitbox.userData.seat = index;
  const lamp = bankerLamp(LAMP_SHADES[index % LAMP_SHADES.length]);
  lamp.object.position.set(-DESK.width / 2 + 0.35, DESK.top, DESK.far - 0.3);
  const marker = seatMarker();
  anchor.add(deskSet(), screen.object, lamp.object, marker, hitbox);
  return { index, anchor, marker, hitbox, laptop: screen, lamp };
}

export function buildRoom(scene, seatCount) {
  const sky = createSkyView();
  const sconces = wallLights();
  scene.add(floor(), skyBackdrop(sky), library(), ...sconces.map((s) => s.object));

  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const seats = seatLayout(seatCount).map((s, i) => seat(s, i, hitMaterial));
  seats.forEach((s) => scene.add(s.anchor));
  // lamps: 시간대에 따라 밝기가 바뀌는 조명 (책상 스탠드 + 벽 조명)
  return { seats, lamps: [...seats.map((s) => s.lamp), ...sconces], sky };
}
