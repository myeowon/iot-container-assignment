// 캐릭터 페이지: 고르면 3D 미리보기에 보여 주고, 저장해야 실제로 바뀐다
import { patch } from './api.js';
import { mountShell } from './shell.js';
import { CHARACTERS, characterOf, fill, h, toast } from './ui.js';

const CHARACTER_IDS = Object.keys(CHARACTERS);

export function mountCharacterPage(root, ctx) {
  const shell = mountShell(root, ctx, 'character');
  const stage = h('div', { class: 'preview-stage' }, h('p', { class: 'empty' }, '미리보기를 불러오는 중…'));
  const info = h('div', { class: 'preview-info' });
  const grid = h('div', { class: 'char-grid big' });
  let picked = ctx.user.character;
  let preview = null;
  let closed = false;

  shell.main.append(
    h('div', { class: 'page-head' },
      h('div', {}, h('span', { class: 'eyebrow' }, '공부방 속 나의 모습'), h('h1', {}, '캐릭터'),
        h('p', {}, '함께 공부할 친구를 고르고 저장해주세요.'))),
    h('div', { class: 'character-layout' },
      h('section', { class: 'card preview-card' }, stage, info),
      h('section', { class: 'card stack' }, h('h2', {}, '내 캐릭터 고르기'), grid)));

  function draw() {
    const current = ctx.user.character;
    const look = characterOf(picked);
    fill(info,
      h('h2', {}, `${look.emoji} ${look.label}`),
      h('small', {}, picked === current ? '지금 쓰고 있는 캐릭터예요' : '미리보기 중이에요 · 저장하면 바뀌어요'),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', onClick: random }, '랜덤 선택'),
        h('button', { class: 'btn primary', disabled: picked === current, onClick: save }, '이 캐릭터로 저장')));
    grid.replaceChildren(...CHARACTER_IDS.map((id) => {
      const c = CHARACTERS[id];
      return h('button', { class: `char${id === picked ? ' on' : ''}`, 'aria-pressed': String(id === picked), onClick: () => pick(id) },
        h('span', { class: 'avatar big', style: `--c:${c.color}` }, c.emoji),
        h('small', {}, c.label),
        id === current && h('span', { class: 'badge' }, '사용 중'));
    }));
  }

  function pick(id) {
    picked = id;
    preview?.show(id);
    draw();
  }

  function random() {
    const others = CHARACTER_IDS.filter((id) => id !== picked);
    pick(others[Math.floor(Math.random() * others.length)]);
  }

  async function save() {
    try {
      ctx.user = (await patch('/me', { character: picked })).user;
      shell.refreshProfile();
      toast(`${characterOf(picked).label}(으)로 저장했어요`);
      draw();
    } catch (err) {
      toast(err.message);
    }
  }

  // 3D 미리보기(Three.js)는 공부방처럼 필요할 때만 불러온다
  import('./character-preview.js').then(({ createPreview }) => {
    if (closed) return;
    stage.replaceChildren();
    preview = createPreview(stage);
    preview.show(picked);
  }).catch(() => fill(stage, h('p', { class: 'empty' }, '3D 미리보기를 불러오지 못했어요')));

  draw();
  return () => {
    closed = true;
    preview?.destroy();
    shell.destroy();
  };
}
