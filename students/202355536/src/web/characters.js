// 치비 동물 캐릭터(곰·토끼·고양이·강아지)와 상태별 포즈·소품
import * as THREE from 'three';
import { deskProps, phone, stackBooks } from './character-props.js';
import { capsule, plush, sphere } from './mesh.js';
import { STATUS, characterOf, fill, fmtShort, h } from './ui.js';

const SHIRTS = ['#7fa7c9', '#d98a7a', '#8fb380', '#a993c4', '#d9b25f', '#6fb0b8'];
const INK = '#2b211c';
const BLUSH = '#ff9fa0';
const PINK_NOSE = '#f29aa5';
const HEAD_SCALE = 0.85;   // 몸에 비해 머리 크기 (귀·얼굴 포함)
const DOG_EAR = '#94592b';

// 캐릭터별 얼굴: 주둥이 색, 코 색, snout(주둥이 길이 배율), iris(눈동자 뒤 홍채), tongue(혀)
const FACE = {
  bear: { muzzle: '#fff1de', nose: INK },
  rabbit: { muzzle: '#fff1de', nose: PINK_NOSE },
  'cat-white': { muzzle: '#fff1de', nose: PINK_NOSE },
  'cat-black': { muzzle: '#3d393b', nose: PINK_NOSE, iris: '#e8c547' },   // 검은 털에 눈이 묻히지 않게
  dog: { muzzle: '#e3b67f', nose: INK, snout: 1.3, tongue: true },
};

function ears(animal, fur) {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    if (animal === 'bear') {
      g.add(sphere(0.17, fur, [side * 0.36, 0.84, 0]), sphere(0.09, plush(BLUSH), [side * 0.36, 0.84, 0.09], [1, 1, 0.5]));
    } else if (animal === 'cat') {
      for (const [r, len, z, m] of [[0.23, 0.44, 0, fur], [0.13, 0.28, 0.07, plush(BLUSH)]]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(r, len, 4), m);
        ear.position.set(side * 0.31, 0.92 - (0.44 - len) / 2, z);
        ear.rotation.z = -side * 0.35;
        g.add(ear);
      }
    } else if (animal === 'dog') {
      // 리트리버처럼 머리 옆으로 축 늘어진 귀
      const ear = sphere(0.21, plush(DOG_EAR), [side * 0.5, 0.4, -0.02], [0.5, 1.2, 0.85]);
      ear.rotation.z = side * 0.25;
      g.add(ear);
    } else {
      for (const [r, len, z, m] of [[0.1, 0.5, -0.02, fur], [0.05, 0.38, 0.07, plush(BLUSH)]]) {
        const ear = capsule(r, len, m, [side * 0.17, 1.1, z]);
        ear.rotation.z = -side * 0.14;
        g.add(ear);
      }
    }
  }
  return g;
}

function head(characterId, animal, fur) {
  const face = FACE[characterId];
  const snout = face.snout ?? 1;
  const g = new THREE.Group();
  g.add(
    sphere(0.52, fur, [0, 0.42, 0], [1.06, 0.95, 1]),
    sphere(0.06, INK, [-0.17, 0.46, 0.46]), sphere(0.06, INK, [0.17, 0.46, 0.46]),
    sphere(0.02, '#ffffff', [-0.15, 0.49, 0.51]), sphere(0.02, '#ffffff', [0.19, 0.49, 0.51]),
    sphere(0.08, plush(BLUSH), [-0.31, 0.33, 0.4], [1, 0.6, 0.4]), sphere(0.08, plush(BLUSH), [0.31, 0.33, 0.4], [1, 0.6, 0.4]),
    sphere(0.17, plush(face.muzzle), [0, 0.3, 0.43 + (snout - 1) * 0.15], [1.2, 0.8, 0.7 * snout]),
    sphere(0.05 * snout, face.nose, [0, 0.36, 0.56 + (snout - 1) * 0.3]),
    ears(animal, fur),
  );
  if (face.iris) g.add(sphere(0.085, face.iris, [-0.17, 0.46, 0.43]), sphere(0.085, face.iris, [0.17, 0.46, 0.43]));
  if (face.tongue) g.add(sphere(0.05, '#f08a96', [0, 0.17, 0.58], [1, 0.5, 0.6]));
  return g;
}

/** 캐릭터를 새로 만들어야 하는지 판단하는 키 (사람과 캐릭터가 같으면 재사용) */
export const characterKey = (m) => `${m.id}:${m.character}`;

/** 어깨를 축으로 회전하는 팔. rotation.x < 0 이면 앞으로 든다. */
function arm(side, shirt, fur) {
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.36, 0.65, 0);
  pivot.add(capsule(0.1, 0.3, shirt, [0, -0.2, 0]), sphere(0.1, fur, [0, -0.42, 0]));
  return pivot;
}

// 상태별 목표 각도 (t: 경과 시간[s])
// 팔 rotation.z: +x쪽 팔(right)은 음수일수록, -x쪽 팔(left)은 양수일수록 몸 안쪽으로 모인다
const POSES = {
  STUDYING: (t) => ({ lean: 0.1, headX: 0.22 + Math.sin(t * 1.3) * 0.03, headY: Math.sin(t * 0.4) * 0.06,
    rightX: -1.15 + Math.sin(t * 13) * 0.05, rightZ: -0.25, leftX: -1.15 + Math.cos(t * 11) * 0.05, leftZ: 0.25 }),
  AWAY: (t) => ({ lean: 0, headX: 0.32, headY: Math.sin(t * 0.7) * 0.1,
    rightX: -1.75, rightZ: -0.35, leftX: -0.5, leftZ: 0 }),
  BREAK: (t) => ({ lean: -0.08, headX: -0.18, headY: 0,
    rightX: 0, rightZ: 2.4 + Math.sin(t * 1.4) * 0.3, leftX: 0, leftZ: -2.4 - Math.sin(t * 1.4) * 0.3 }),
  IDLE: () => ({ lean: 0.35, headX: 0.65, headY: 0.25,
    rightX: -1.35, rightZ: -0.5, leftX: -1.35, leftZ: 0.5 }),
  // 캐릭터 페이지 미리보기: 한 손을 들어 흔든다
  HELLO: (t) => ({ lean: 0, headX: -0.05, headY: Math.sin(t * 1.2) * 0.15,
    rightX: 0, rightZ: 2.5 + Math.sin(t * 7) * 0.25, leftX: -0.3, leftZ: 0.1 }),
};

/** withProps: 책상 위 개인 소품(펼친 책·커피·책 더미)까지 그릴지 — 캐릭터 페이지 미리보기는 false */
export function createCharacter(member, { withProps = true } = {}) {
  const shirt = plush(SHIRTS[[...member.id].reduce((a, c) => a + c.charCodeAt(0), 0) % SHIRTS.length]);
  const id = member.character in FACE ? member.character : 'bear';   // 모르는 캐릭터면 곰
  const look = characterOf(id);
  const fur = plush(look.color);
  const root = new THREE.Group();
  const upper = new THREE.Group();          // 허리를 축으로 기울어지는 상체
  upper.position.y = 0.55;
  const headPivot = new THREE.Group();
  headPivot.position.y = 0.8;
  const headModel = head(id, look.animal, fur);
  headModel.scale.setScalar(HEAD_SCALE);
  headPivot.add(headModel);
  const right = arm(1, shirt, fur);
  const left = arm(-1, shirt, fur);
  upper.add(capsule(0.3, 0.25, shirt, [0, 0.42, 0]), headPivot, right, left);

  const legs = [-1, 1].map((side) => {
    const leg = capsule(0.11, 0.3, plush('#5c6470'), [side * 0.14, 0.6, 0.22]);
    leg.rotation.x = Math.PI / 2;
    return leg;
  });
  const props = deskProps();
  const handPhone = phone();
  handPhone.visible = false;   // 자리 비움(AWAY) 상태에서만 보인다
  right.add(handPhone);
  const labelAnchor = new THREE.Object3D();
  labelAnchor.position.y = 2.4;
  root.add(upper, ...legs, labelAnchor);
  if (withProps) root.add(props.reading.object, props.mug.object, props.stack);

  // 이름표는 HTML로 그린다 (블룸 효과에 번지지 않고 글자가 선명하다)
  const label = h('div', { class: 'name-tag' });
  let status = null;
  let books = '';
  let labelKey = '';
  const pose = { ...POSES.IDLE(0) };

  /** 이름표: 1줄 상태+이름+오늘 공부한 시간, 2줄 지금 공부하는 과목·할 일 */
  function drawLabel(m) {
    const plan = m.plan && `${m.plan.name}${m.plan.task ? ` · ${m.plan.task}` : ''}`;
    const studied = m.todaySec != null ? fmtShort(m.todaySec) : '';   // 분 단위라 1분마다만 다시 그린다
    const key = `${status}|${m.name}|${studied}|${plan}`;
    if (key === labelKey) return;
    labelKey = key;
    fill(label,
      h('span', {}, `${STATUS[status].emoji} ${m.name}`, studied && h('b', { class: 'studied' }, studied)),
      plan && h('small', { class: 'plan', style: `--c:${m.plan.color}` }, h('i', { class: 'dot' }), plan));
  }

  function setBooks(colors) {
    const key = colors.join();
    if (key === books) return;
    books = key;
    stackBooks(props.stack, colors);
  }

  return {
    root,
    label,
    labelAnchor,
    key: characterKey(member),
    get status() { return status; },
    /** 이름표·소품 없이 포즈만 정한다 (캐릭터 페이지 미리보기) */
    setPose(name) { status = name; },
    update(m, isMe) {
      status = m.status;
      props.reading.object.visible = status === 'STUDYING';
      props.reading.setColor(m.subjectColor || '#e76f51');
      handPhone.visible = status === 'AWAY';
      setBooks(m.books || []);
      label.className = `name-tag ${status}${isMe ? ' me' : ''}`;
      drawLabel(m);
    },
    tick(t, dt) {
      const target = POSES[status || 'IDLE'](t);
      const k = Math.min(1, dt * 6);
      for (const key in target) pose[key] += (target[key] - pose[key]) * k;
      props.mug.tick(t);
      upper.rotation.x = pose.lean;
      upper.scale.y = 1 + Math.sin(t * 2) * 0.012;
      headPivot.rotation.set(pose.headX, pose.headY, 0);
      right.rotation.set(pose.rightX, 0, pose.rightZ);
      left.rotation.set(pose.leftX, 0, pose.leftZ);
    },
    dispose() {
      label.remove();
    },
  };
}
