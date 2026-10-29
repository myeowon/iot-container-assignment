// 캔버스로 그리는 텍스처 — 이미지 파일 없이 코드로만 만든다 (ConfigMap 용량 절약)
import * as THREE from 'three';

const cache = new Map();
const rand = (a, b) => a + Math.random() * (b - a);

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function toTexture(canvas, repeat = [1, 1]) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 4;
  return texture;
}

function cached(key, size, draw, repeat) {
  if (!cache.has(key)) {
    const canvas = makeCanvas(...size);
    draw(canvas.getContext('2d'), ...size);
    cache.set(key, toTexture(canvas, repeat));
  }
  return cache.get(key);
}

/** 밝은 원목 마루 */
export const woodFloor = () => cached('wood', [512, 512], (ctx, w, h) => {
  const planks = 8;
  const pw = w / planks;
  for (let i = 0; i < planks; i++) {
    ctx.fillStyle = `hsl(33, ${rand(30, 38)}%, ${rand(62, 70)}%)`;
    ctx.fillRect(i * pw, 0, pw, h);
    ctx.strokeStyle = 'rgba(120,80,40,0.10)';
    for (let g = 0; g < 6; g++) {                  // 나뭇결
      ctx.beginPath();
      const x = i * pw + rand(4, pw - 4);
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + rand(-6, 6), h / 3, x + rand(-6, 6), (h * 2) / 3, x, h);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(90,60,30,0.35)';
    ctx.fillRect(i * pw, 0, 2, h);
    ctx.fillRect(i * pw, rand(0, h), pw, 2);
  }
}, [3, 3]);

/** 노트북 화면: 코드 에디터처럼 보이는 색 줄 */
export const codeScreen = () => cached('screen', [256, 160], (ctx, w, h) => {
  ctx.fillStyle = '#1e2433';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2a3245';
  ctx.fillRect(0, 0, 40, h);
  const colors = ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#f7768e'];
  for (let y = 10; y < h - 8; y += 11) {
    let x = 48 + Math.floor(rand(0, 3)) * 12;
    for (let p = Math.floor(rand(1, 4)); p > 0; p--) {
      const len = rand(18, 60);
      ctx.fillStyle = colors[Math.floor(rand(0, colors.length))];
      ctx.fillRect(x, y, len, 5);
      x += len + 6;
    }
  }
});

/**
 * 창밖 풍경: 하늘 그라데이션 + 해/달 + 별 + 숲 실루엣.
 * draw(daylight)를 호출하면 같은 캔버스에 다시 그린다.
 */
export function createSkyView() {
  const W = 1024;
  const H = 512;
  const HORIZON = H * 0.62;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const texture = toTexture(canvas);
  const stars = Array.from({ length: 90 }, () => [rand(0, W), rand(0, HORIZON * 0.9), rand(0.6, 1.8)]);
  // 나무는 지평선 근처에만 두 겹(먼 숲은 작고 흐리게, 가까운 숲은 크고 진하게) — 하늘이 충분히 보이도록
  const forest = (count, minR, maxR, offset) =>
    Array.from({ length: count }, (_, i) => [i * (W / (count - 4)) + rand(-12, 12), HORIZON + offset + rand(0, 10), rand(minR, maxR)]);
  const farTrees = forest(70, 10, 20, -4);
  const nearTrees = forest(46, 18, 32, 14);

  function drawBody(d) {
    const x = W * (0.1 + d.progress * 0.8);
    const y = HORIZON - d.elevation * HORIZON * 0.75;
    const sun = d.body === 'sun';
    const r = sun ? 34 : 24;
    const halo = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * (sun ? 5 : 3));
    halo.addColorStop(0, sun ? 'rgba(255,240,200,0.65)' : 'rgba(220,230,255,0.35)');
    halo.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = sun ? `#${d.sunColor.clone().lerp(new THREE.Color('#ffffff'), 0.5).getHexString()}` : '#eef1ff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLayer(trees, base, highlight) {
    for (const [x, y, r] of trees) {
      ctx.fillStyle = `#${base.getHexString()}`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `#${highlight.getHexString()}`;
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.25, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTrees(d) {
    // 낮에는 초록, 밤에는 어두운 실루엣. 먼 숲은 하늘색이 섞여 흐리게 보인다.
    const light = Math.min(1, d.sunIntensity / 2.6);
    const near = new THREE.Color('#0d1712').lerp(new THREE.Color('#4d7d43'), light);
    const far = near.clone().lerp(d.horizon, 0.35);
    const shine = (c) => c.clone().lerp(new THREE.Color('#9cc77c'), 0.35 * light);
    drawLayer(farTrees, far, shine(far));
    ctx.fillStyle = `#${near.getHexString()}`;
    ctx.fillRect(0, HORIZON + 22, W, H);
    drawLayer(nearTrees, near, shine(near));
  }

  return {
    texture,
    draw(d) {
      const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
      sky.addColorStop(0, `#${d.skyTop.getHexString()}`);
      sky.addColorStop(1, `#${d.horizon.getHexString()}`);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255,255,255,${d.stars})`;
      for (const [x, y, r] of stars) ctx.fillRect(x, y, r, r);
      drawBody(d);
      drawTrees(d);
      texture.needsUpdate = true;
    },
  };
}
