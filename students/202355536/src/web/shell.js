// 공부방·플래너·캐릭터 페이지가 함께 쓰는 상단 바: 로고 · 페이지 탭 · 오늘 공부시간 · 프로필 메뉴
import { get } from './api.js';
import { characterOf, fill, fmtShort, h } from './ui.js';

const PAGES = [['rooms', '공부방'], ['planner', '플래너'], ['character', '캐릭터']];

export function mountShell(root, ctx, active) {
  const todayChip = h('span', { class: 'chip today-chip' }, '오늘 0분');
  const profileBox = h('div', { class: 'profile' });
  const main = h('main', { class: `page page-${active}` });
  let menuOpen = false;

  root.append(
    h('header', { class: 'app-header' },
      h('a', { class: 'logo small', href: '#/rooms', 'aria-label': 'StudyPals 공부방' },
        h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 's'), 'StudyPals'),
      h('nav', { class: 'nav-tabs', 'aria-label': '주 메뉴' },
        PAGES.map(([page, label]) => h('a', { class: `nav-tab${page === active ? ' on' : ''}`, href: `#/${page}`,
          'aria-current': page === active ? 'page' : null }, label))),
      h('div', { class: 'header-right' }, todayChip, profileBox)),
    main);

  // ---------- 프로필 메뉴 ----------

  function drawProfile() {
    const me = characterOf(ctx.user.character);
    fill(profileBox,
      h('button', { class: 'profile-btn', 'aria-expanded': String(menuOpen), onClick: toggleMenu },
        h('span', { class: 'avatar', style: `--c:${me.color}` }, me.emoji),
        h('strong', {}, ctx.user.name), h('span', { class: 'caret' }, '▾')),
      menuOpen && h('div', { class: 'popover card' },
        h('div', { class: 'row' }, h('span', { class: 'avatar big', style: `--c:${me.color}` }, me.emoji),
          h('div', {}, h('strong', {}, ctx.user.name), h('br'), h('small', {}, `@${ctx.user.username} · ${me.label}`))),
        h('a', { class: 'btn small', href: '#/character' }, '캐릭터 바꾸기'),
        h('button', { class: 'btn ghost small', onClick: ctx.logout }, '로그아웃')));
  }

  function toggleMenu(e) {
    e.stopPropagation();
    menuOpen = !menuOpen;
    drawProfile();
  }

  const closeMenu = (e) => {
    if (menuOpen && !profileBox.contains(e.target)) {
      menuOpen = false;
      drawProfile();
    }
  };
  document.addEventListener('click', closeMenu);

  drawProfile();
  get('/me').then(({ today }) => { todayChip.textContent = `오늘 ${fmtShort(today.totalSec)}`; }).catch(() => {});

  return {
    main,
    setToday(sec) { todayChip.textContent = `오늘 ${fmtShort(sec)}`; },
    /** 캐릭터를 바꾼 뒤 상단 아바타를 다시 그린다 */
    refreshProfile: drawProfile,
    destroy() { document.removeEventListener('click', closeMenu); },
  };
}
