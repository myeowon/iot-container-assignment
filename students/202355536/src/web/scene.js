// Three.js 장면: 렌더러·카메라·조명·블룸, 좌석 클릭, 멤버 상태 → 캐릭터 반영
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { characterKey, createCharacter } from './characters.js';
import { currentHours, daylightAt } from './daylight.js';
import { ROOM, buildRoom } from './room-model.js';

const DAYLIGHT_REFRESH_MS = 60_000;
// 마주 보는 두 줄의 얼굴이 모두 보이도록 책상 섬의 옆(+x)쪽에서 창을 향해 비스듬히 내려다본다
// (정측면이면 같은 줄 캐릭터가 일렬로 겹치므로 약 72°)
const CAMERA_TARGET = new THREE.Vector3(0.1, 1.25, -0.5);
const CAMERA_POS = CAMERA_TARGET.clone().add(new THREE.Vector3(10.6, 5.3, 3.4));
const BACKGROUND = { night: new THREE.Color('#1e1a17'), day: new THREE.Color('#c9c0b2') };

function webglAvailable() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/** 창으로 들어오는 햇빛(밤에는 달빛) + 하늘빛 주변광. 세기와 색은 applyDaylight가 시각에 맞춰 바꾼다. */
function lights(scene) {
  const ambient = new THREE.HemisphereLight('#ffffff', '#8a7458', 1);
  const sun = new THREE.DirectionalLight('#ffffff', 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 50 });
  sun.shadow.bias = -0.0005;
  scene.add(ambient, sun);
  return { ambient, sun };
}

function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.append(renderer.domElement);
  return renderer;
}

export function createScene(container, { seatCount, onSeatClick, onDaylight }) {
  if (!webglAvailable()) {
    container.append(Object.assign(document.createElement('p'), {
      className: 'empty', textContent: '이 브라우저는 WebGL을 지원하지 않아 3D 공부방을 표시할 수 없어요.',
    }));
    return { update() {}, destroy() {} };
  }

  const renderer = createRenderer(container);
  const labels = Object.assign(document.createElement('div'), { className: 'label-layer' });
  container.append(labels);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const light = lights(scene);
  const room = buildRoom(scene, seatCount);

  /** 현재 시각의 하늘·빛을 장면에 적용한다 (1분마다) */
  function applyDaylight() {
    const d = daylightAt(currentHours());
    room.sky.draw(d);
    // 창(-x) 바깥에서 들어오는 빛: 고도가 높을수록 위에서, 시간이 흐르면 z 방향으로 이동
    light.sun.position.set(-ROOM.width / 2 - 8, 2 + d.elevation * 14, (d.progress - 0.5) * 16);
    light.sun.color.copy(d.sunColor);
    light.sun.intensity = d.sunIntensity;
    light.ambient.color.copy(d.skyTop).lerp(new THREE.Color('#ffffff'), 0.55);
    light.ambient.intensity = d.ambient;
    room.lamps.forEach((lamp) => lamp.setLevel(d.lamp));
    scene.background = BACKGROUND.night.clone().lerp(BACKGROUND.day, Math.min(1, d.sunIntensity / 2.8));
    onDaylight?.(d);
  }
  applyDaylight();
  const daylightTimer = setInterval(applyDaylight, DAYLIGHT_REFRESH_MS);
  const characters = new Map();            // seat → character
  let pickable = true;

  // 빛나는 물체(스탠드 갓·노트북 화면)만 번지게 하는 블룸
  const composer = new EffectComposer(renderer);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.6, 0.9);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    camera.aspect = w / h || 1;
    // 세로로 좁은 화면에서는 카메라를 뒤로 물려 방 전체가 보이게
    const distance = Math.max(1, 1.55 / camera.aspect);
    camera.position.copy(CAMERA_TARGET).addScaledVector(CAMERA_POS.clone().sub(CAMERA_TARGET), distance);
    camera.lookAt(CAMERA_TARGET);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  // ---------- 좌석 클릭 ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function seatAt(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (!pickable) return null;
    // 앞에 앉은 사람의 좌석에 가려져도 그 뒤의 빈 좌석을 고를 수 있게, 가까운 순서로 빈 자리를 찾는다
    const hits = raycaster.intersectObjects(room.seats.map((s) => s.hitbox));
    return hits.map((hit) => hit.object.userData.seat).find((seat) => !characters.has(seat)) ?? null;
  }
  const onMove = (e) => { renderer.domElement.style.cursor = seatAt(e) != null ? 'pointer' : ''; };
  const onClick = (e) => {
    const seat = seatAt(e);
    if (seat != null) onSeatClick(seat);
  };
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('click', onClick);

  // ---------- 렌더 루프 ----------
  const projected = new THREE.Vector3();
  function placeLabels() {
    const { clientWidth: w, clientHeight: h } = container;
    for (const c of characters.values()) {
      projected.setFromMatrixPosition(c.labelAnchor.matrixWorld).project(camera);
      c.label.style.transform = `translate(${((projected.x + 1) / 2) * w}px, ${((1 - projected.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  }

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    const t = clock.elapsedTime;
    for (const s of room.seats) {
      s.marker.visible = pickable && !characters.has(s.index);
      s.marker.material.opacity = 0.45 + Math.sin(t * 3) * 0.25;
      s.laptop.setOn(characters.get(s.index)?.status === 'STUDYING');
    }
    for (const c of characters.values()) c.tick(t, dt);
    composer.render();
    placeLabels();
  });

  function removeCharacter(seat) {
    const c = characters.get(seat);
    room.seats[seat].anchor.remove(c.root);
    c.dispose();
    characters.delete(seat);
  }

  return {
    /** members: 하트비트 응답의 멤버 목록. 좌석에 앉은 사람만 캐릭터로 그린다. */
    update(members, myId, canPick) {
      pickable = canPick;
      const bySeat = new Map(members.filter((m) => m.seat != null).map((m) => [m.seat, m]));
      for (const seat of [...characters.keys()]) {
        const m = bySeat.get(seat);
        if (!m || characters.get(seat).key !== characterKey(m)) removeCharacter(seat);
      }
      for (const [seat, m] of bySeat) {
        if (!characters.has(seat)) {
          const c = createCharacter(m);
          characters.set(seat, c);
          room.seats[seat].anchor.add(c.root);
          labels.append(c.label);
        }
        characters.get(seat).update(m, m.id === myId);
      }
    },
    destroy() {
      clearInterval(daylightTimer);
      renderer.setAnimationLoop(null);
      observer.disconnect();
      for (const seat of [...characters.keys()]) removeCharacter(seat);
      scene.traverse((o) => o.geometry?.dispose());
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labels.remove();
    },
  };
}
