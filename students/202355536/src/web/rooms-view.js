// 공부방 페이지: 방 목록 · 방 만들기(모달) · 비공개방 코드 입장
import { get, post } from './api.js';
import { mountShell } from './shell.js';
import { h, toast } from './ui.js';

const REFRESH_MS = 5000;

export function mountRooms(root, ctx) {
  const shell = mountShell(root, ctx, 'rooms');
  const grid = h('div', { class: 'room-grid' });
  const dialog = createRoomDialog(ctx);
  const count = h('span', { class: 'room-count' }, '불러오는 중');
  const live = h('span', { class: 'live-note', role: 'status' }, '공부방을 확인하고 있어요');
  let closed = false;
  let lastRooms = null;
  const date = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long',
  }).format(new Date());

  shell.main.append(
    h('div', { class: 'page-head' },
      h('div', {}, h('span', { class: 'eyebrow' }, date), h('h1', {}, '공부방'),
        h('p', {}, '마음에 드는 방에 자리를 잡고, 오늘의 공부를 시작하세요.')),
      h('button', { class: 'btn primary', onClick: () => dialog.open() }, '＋ 방 만들기')),
    h('div', { class: 'rooms-toolbar' },
      h('div', { class: 'rooms-heading' }, h('h2', {}, '열린 공부방'), count),
      h('div', { class: 'page-actions' },
        h('form', { class: 'code-join', onSubmit: joinByCode },
          h('label', { htmlFor: 'room-code' }, '초대받으셨나요?'),
          h('input', { id: 'room-code', name: 'code', class: 'code-input', placeholder: '6자리 코드', maxLength: 6,
            minLength: 6, pattern: '[A-Z0-9]{6}', required: true,
            autocomplete: 'off', 'aria-label': '비공개방 코드', onInput: (e) => { e.target.value = e.target.value.toUpperCase(); } }),
          h('button', { class: 'btn', type: 'submit' }, '코드로 입장')))),
    grid,
    h('div', { class: 'rooms-note' }, live, h('span', {}, '공개방은 누구나 · 비공개방은 초대 코드로')),
    dialog.element);

  async function loadRooms() {
    try {
      const { rooms } = await get('/rooms');
      if (closed) return;
      count.textContent = String(rooms.length);
      live.textContent = '실시간으로 업데이트 중';
      live.classList.remove('offline');
      // 내용이 같으면 버튼을 다시 만들지 않아 키보드 포커스를 유지한다.
      const signature = JSON.stringify(rooms);
      if (signature !== lastRooms) {
        grid.replaceChildren(...(rooms.length ? rooms.map(roomCard) : [emptyState()]));
        lastRooms = signature;
      }
    } catch (err) {
      if (closed) return;
      if (err.status === 401) ctx.logout();
      live.textContent = '연결을 확인해 주세요 · 5초 후 다시 시도해요';
      live.classList.add('offline');
      if (!grid.childElementCount) {
        count.textContent = '—';
        grid.replaceChildren(h('div', { class: 'empty-state' },
          h('h3', {}, '공부방을 불러오지 못했어요'),
          h('p', {}, '잠시 후 다시 시도하거나 연결 상태를 확인해 주세요.'),
          h('button', { class: 'btn', onClick: loadRooms }, '다시 불러오기')));
      }
    }
  }

  const roomCard = (r, index) => h('article', { class: `card room-card${r.count >= r.max ? ' full' : ''}` },
    h('div', { class: 'room-card-top' },
      h('span', { class: 'room-number', 'aria-hidden': 'true' }, String(index + 1).padStart(2, '0')),
      h('span', { class: `badge${r.private ? ' private' : ''}` }, r.private ? '비공개' : '공개방')),
    h('h3', {}, r.name),
    h('div', { class: 'room-occupancy' },
      h('div', { class: 'seats', 'aria-label': `${r.max}자리 중 ${r.count}명 참여 중` },
        Array.from({ length: r.max }, (_, i) => h('i', { class: i < r.count ? 'filled' : '', 'aria-hidden': 'true' }))),
      h('span', { class: 'seat-count' }, h('strong', {}, String(r.count)), ` / ${r.max}`)),
    h('div', { class: 'room-card-foot' },
      h('small', {}, r.count >= r.max ? '모든 자리가 찼어요' : r.count ? `${r.max - r.count}자리 남아 있어요` : '첫 번째로 자리를 잡아보세요'),
      h('button', { class: 'btn small', disabled: r.count >= r.max, 'aria-label': `${r.name} 입장`,
        onClick: () => ctx.go(`#/room/${r.id}`) }, r.count >= r.max ? '입장 마감' : '입장하기 ↗')));

  const emptyState = () => h('div', { class: 'card empty-state' },
    h('span', { class: 'empty-book', 'aria-hidden': 'true' }),
    h('h3', {}, '아직 열린 방이 없어요'),
    h('p', {}, '첫 방을 만들고 친구를 초대해 보세요.'),
    h('button', { class: 'btn primary', onClick: () => dialog.open() }, '＋ 방 만들기'));

  async function joinByCode(e) {
    e.preventDefault();
    const button = e.target.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const { roomId } = await post('/rooms/join-code', { code: new FormData(e.target).get('code') });
      ctx.go(`#/room/${roomId}`);
    } catch (err) {
      toast(err.message);
    } finally {
      button.disabled = false;
    }
  }

  loadRooms();
  const timer = setInterval(loadRooms, REFRESH_MS);
  return () => {
    closed = true;
    clearInterval(timer);
    shell.destroy();
  };
}

/** 방 만들기 모달 (<dialog> — Esc로 닫힘) */
function createRoomDialog(ctx) {
  const options = { max: 6, private: false };
  const element = h('dialog', { class: 'card room-dialog', 'aria-labelledby': 'room-dialog-title' });

  function draw() {
    const seg = (label, on, onClick) => h('button', {
      type: 'button', class: `seg${on ? ' on' : ''}`, 'aria-pressed': String(on), onClick,
    }, label);
    const name = element.querySelector('input')?.value ?? '';
    element.replaceChildren(h('form', { class: 'stack', onSubmit: create },
      h('h2', { id: 'room-dialog-title' }, '새 공부방'),
      h('p', { class: 'dialog-description' }, '방 이름과 자리를 정하고 공부를 시작하세요.'),
      h('label', { class: 'field' }, h('span', {}, '방 이름'),
        h('input', { name: 'name', placeholder: '예: 새벽 도서관', maxLength: 20, required: true, value: name })),
      h('div', { class: 'field' }, h('span', {}, '자리 수'),
        h('div', { class: 'row' }, [4, 6, 8].map((n) => seg(`${n}명`, options.max === n, () => { options.max = n; draw(); })))),
      h('div', { class: 'field' }, h('span', {}, '공개 범위'),
        h('div', { class: 'row' },
          seg('공개방', !options.private, () => { options.private = false; draw(); }),
          seg('비공개방', options.private, () => { options.private = true; draw(); })),
        h('small', {}, options.private ? '영문+숫자 6자리 입장 코드가 만들어져요' : '누구나 목록에서 보고 들어올 수 있어요')),
      h('div', { class: 'row end' },
        h('button', { type: 'button', class: 'btn ghost', onClick: () => element.close() }, '취소'),
        h('button', { type: 'submit', class: 'btn primary' }, '만들고 입장'))));
  }

  async function create(e) {
    e.preventDefault();
    const button = e.target.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const { room } = await post('/rooms', { ...options, name: new FormData(e.target).get('name') });
      element.close();
      ctx.go(`#/room/${room.id}`);
    } catch (err) {
      toast(err.message);
    } finally {
      button.disabled = false;
    }
  }

  draw();
  return {
    element,
    open() {
      draw();
      element.showModal();
      element.querySelector('input').focus();
    },
  };
}
