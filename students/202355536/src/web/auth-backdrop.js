// 로그인 화면 배경: 밤(22:30) 도서관에서 캐릭터들이 공부하는 모습만 보여 준다 (이름표·조작 없음)
const NIGHT = 22.5;
const SEATS = 8;

// 비워 둔 자리(2, 5)가 있어야 실제 공부방처럼 보인다
const DEMO = [
  { seat: 0, character: 'bear', status: 'STUDYING', subjectColor: '#e76f51', books: ['#2a9d8f', '#e9c46a'] },
  { seat: 1, character: 'cat-white', status: 'STUDYING', subjectColor: '#457b9d', books: ['#e76f51'] },
  { seat: 3, character: 'dog', status: 'BREAK', books: ['#8ab17d', '#457b9d', '#e9c46a'] },
  { seat: 4, character: 'rabbit', status: 'STUDYING', subjectColor: '#8ab17d', books: [] },
  { seat: 6, character: 'cat-black', status: 'STUDYING', subjectColor: '#e9c46a', books: ['#e76f51', '#2a9d8f'] },
  { seat: 7, character: 'bear', status: 'IDLE', books: ['#457b9d'] },
].map((m) => ({ ...m, id: `demo-${m.seat}`, name: '' }));

/** 공부방 모듈(Three.js CDN)은 따로 받아서, 받는 동안에도 로그인 카드는 바로 쓸 수 있다 */
export function mountAuthBackdrop(container, { shiftX }) {
  let scene = null;
  let closed = false;
  import('./scene.js')
    .then(({ createScene }) => {
      if (closed) return;
      scene = createScene(container, { seatCount: SEATS, hours: NIGHT, shiftX });
      scene.update(DEMO, null, false);
      container.classList.add('ready');
    })
    .catch((err) => console.warn(err));   // 배경을 못 그려도 로그인은 된다
  return () => {
    closed = true;
    scene?.destroy();
  };
}
