// 실제 시각에 따른 하늘·빛 상태: 새벽 → 해돋이 → 낮 → 노을 → 밤
// 키프레임 사이는 선형 보간해서 시간이 흐르면 자연스럽게 바뀐다.
// 미리보기: 주소에 ?time=18:30 을 붙이면 그 시각으로 고정된다.
import * as THREE from 'three';

// [시각, 하늘 위, 지평선, 햇빛 색, 햇빛 세기, 주변광 세기, 실내 조명 비율, 별]
// 실내 조명 비율이 0인 아침·낮(8시~16시)에는 책상 스탠드가 꺼진다
const KEYS = [
  [0, '#0a0f24', '#1c2348', '#8fa6ff', 0.25, 0.45, 1.0, 1.0],
  [4.5, '#111735', '#3a2f5c', '#8fa6ff', 0.25, 0.5, 1.0, 0.8],
  [5.5, '#2b3a6b', '#d68fa0', '#ffb08a', 0.6, 0.75, 0.8, 0.25],
  [6.5, '#5b8bc9', '#ffb27a', '#ffb070', 1.6, 1.0, 0.3, 0],
  [8, '#4f9be6', '#cfe6f7', '#fff3e0', 2.8, 1.4, 0, 0],
  [16, '#4f9be6', '#d8ecf8', '#fff0d8', 2.6, 1.4, 0, 0],
  [17.5, '#6a7fc0', '#ffb36b', '#ffa860', 1.8, 1.1, 0.45, 0],
  [18.6, '#363b78', '#e2704a', '#ff7a40', 0.8, 0.8, 0.85, 0.1],
  [19.6, '#121836', '#2c2c5c', '#8fa6ff', 0.25, 0.5, 1.0, 0.8],
  [24, '#0a0f24', '#1c2348', '#8fa6ff', 0.25, 0.45, 1.0, 1.0],
];

const NAMES = [[4.5, '🌌 밤'], [6, '🌄 새벽'], [7.5, '🌅 해돋이'], [17, '☀️ 낮'], [19, '🌇 노을'], [24, '🌙 밤']];

export function currentHours() {
  const fixed = new URLSearchParams(location.search).get('time');
  const match = fixed?.match(/^(\d{1,2}):(\d{2})$/);
  if (match) return Number(match[1]) + Number(match[2]) / 60;
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60;
}

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

/** 시각(0~24) → 하늘·빛 상태 */
export function daylightAt(hours) {
  const i = KEYS.findIndex((k, idx) => hours >= k[0] && hours < KEYS[idx + 1][0]);
  const [h0, top0, hor0, sun0, si0, amb0, lamp0, star0] = KEYS[i];
  const [h1, top1, hor1, sun1, si1, amb1, lamp1, star1] = KEYS[i + 1];
  const t = (hours - h0) / (h1 - h0);

  // 해는 5:30~19:00 동안 창 왼쪽에서 오른쪽으로 호를 그리며 지나간다. 나머지 시간엔 달.
  const isDay = hours >= 5.5 && hours < 19;
  const progress = isDay ? (hours - 5.5) / 13.5 : ((hours + 5) % 24) / 10.5;
  return {
    hours,
    name: NAMES.find(([end]) => hours < end)[1],
    skyTop: mix(top0, top1, t),
    horizon: mix(hor0, hor1, t),
    sunColor: mix(sun0, sun1, t),
    sunIntensity: lerp(si0, si1, t),
    ambient: lerp(amb0, amb1, t),
    lamp: lerp(lamp0, lamp1, t),
    stars: lerp(star0, star1, t),
    body: isDay ? 'sun' : 'moon',
    progress,                                   // 0(왼쪽) → 1(오른쪽)
    elevation: Math.sin(progress * Math.PI),    // 0(지평선) → 1(가장 높음)
  };
}
