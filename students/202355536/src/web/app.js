// 앱 진입점: 로그인 확인 후 해시 라우팅 (#/login, #/rooms, #/planner, #/character, #/room/{id})
import { get, post } from './api.js';
import { mountAuth } from './auth-view.js';
import { mountCharacterPage } from './character-page.js';
import { mountPlannerPage } from './planner-page.js';
import { mountRooms } from './rooms-view.js';

// 공부방(Three.js·블룸 애드온 등 CDN 모듈)은 들어갈 때만 불러온다.
// 정적으로 import하면 그 모듈을 다 받을 때까지 로그인 화면조차 뜨지 않는다.
const loadRoom = () => import('./room-view.js');

const root = document.getElementById('app');
let unmount = null;
let renderId = 0;     // 공부방 모듈을 받는 동안 다른 화면으로 이동했는지 확인용

const ctx = {
  user: null,
  go: (hash) => { location.hash = hash; },
  onLogin(user) {
    ctx.user = user;
    ctx.go('#/rooms');
  },
  async logout() {
    await post('/auth/logout').catch(() => {});
    ctx.user = null;
    ctx.go('#/login');
  },
};

const PAGES = { rooms: mountRooms, planner: mountPlannerPage, character: mountCharacterPage };

async function render() {
  const current = ++renderId;
  unmount?.();
  unmount = null;
  root.replaceChildren();

  const [, view, id] = location.hash.split('/');
  if (!ctx.user && view !== 'login') return ctx.go('#/login');
  if (ctx.user && view === 'login') return ctx.go('#/rooms');

  if (view === 'login') unmount = mountAuth(root, ctx);
  else if (PAGES[view]) {
    unmount = PAGES[view](root, ctx);
    loadRoom();   // 목록·플래너를 보는 동안 공부방 모듈을 미리 받아 둔다
  } else if (view === 'room' && id) {
    root.textContent = '공부방을 불러오는 중…';
    const { mountRoom } = await loadRoom();
    if (current !== renderId) return;
    root.replaceChildren();
    unmount = mountRoom(root, ctx, id);
  } else ctx.go('#/rooms');
}

try {
  ctx.user = (await get('/me')).user;
} catch {
  ctx.user = null;
}
addEventListener('hashchange', render);
render();
