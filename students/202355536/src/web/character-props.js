// 캐릭터 자리의 개인 소품: 펼친 책·커피·책 더미(오늘 남은 할 일), 손에 드는 휴대폰
import * as THREE from 'three';
import { DESK, book, coffeeMug, openBook } from './furniture.js';
import { box, glow } from './mesh.js';

const BOOK_THICKNESS = 0.1;

export function deskProps() {
  const reading = openBook();
  reading.object.position.set(-0.62, DESK.top + 0.01, DESK.near + 0.3);
  reading.object.rotation.y = 0.15;

  const mug = coffeeMug();
  mug.object.position.set(0.55, DESK.top, DESK.near + 0.28);

  const stack = new THREE.Group();
  stack.position.set(0.72, DESK.top + BOOK_THICKNESS / 2, DESK.far - 0.35);
  return { reading, mug, stack };
}

export function phone() {
  const g = new THREE.Group();
  g.add(box(0.15, 0.26, 0.03, '#2b2d42'), box(0.12, 0.21, 0.005, glow('#9ad1ff', 1.5), [0, 0, 0.018]));
  g.position.set(0, -0.48, 0.08);
  g.rotation.x = -0.3;
  return g;
}

/** 남은 할 일의 과목 색대로 책을 살짝 엇갈리게 쌓는다 */
export function stackBooks(stack, colors) {
  stack.clear();
  colors.forEach((c, i) => {
    const b = book(c, 0.56, BOOK_THICKNESS, 0.42);
    b.position.y = i * (BOOK_THICKNESS + 0.004);
    b.rotation.y = i % 2 ? 0.12 : -0.1;
    stack.add(b);
  });
}
