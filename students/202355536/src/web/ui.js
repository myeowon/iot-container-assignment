// DOM 생성·포맷 유틸과 화면 공용 상수

/** 고를 수 있는 캐릭터. animal은 3D 모델 종류, color는 털 색 (서버 auth.CHARACTERS와 같은 id) */
export const CHARACTERS = {
  bear: { label: '곰', emoji: '🐻', animal: 'bear', color: '#c69c72' },
  rabbit: { label: '토끼', emoji: '🐰', animal: 'rabbit', color: '#f5efe4' },
  'cat-black': { label: '검은 고양이', emoji: '🐈‍⬛', animal: 'cat', color: '#2f2c2e' },
  'cat-white': { label: '하얀 고양이', emoji: '🐱', animal: 'cat', color: '#f7f4ee' },
  dog: { label: '갈색 강아지', emoji: '🐶', animal: 'dog', color: '#b7793f' },
};
export const characterOf = (id) => CHARACTERS[id] ?? CHARACTERS.bear;
export const SUBJECT_COLORS = ['#e76f51', '#f4a261', '#e9c46a', '#2a9d8f', '#5b8bd9', '#9b72cf', '#d36c9a', '#6d9f71'];
export const STATUS = {
  STUDYING: { label: '공부 중', emoji: '📖' },
  AWAY: { label: '자리 비움', emoji: '📱' },
  BREAK: { label: '휴식 중', emoji: '☕' },
  IDLE: { label: '대기', emoji: '💤' },
};

/** h('button', { class: 'btn', onClick }, '텍스트') 형태로 요소를 만든다. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') el.className = value;
    else if (key === 'style') el.style.cssText = value;
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...toNodes(children));
  return el;
}

/** 조건부 자식(null·false)은 빼고 문자열은 텍스트로 */
const toNodes = (children) => children.flat().filter((c) => c != null && c !== false)
  .map((c) => (c instanceof Node ? c : String(c)));

/** el.replaceChildren와 같지만 h()처럼 null·false를 걸러 낸다 */
export function fill(el, ...children) {
  el.replaceChildren(...toNodes(children));
  return el;
}

export function swatches(colors, selected, onPick) {
  return h('div', { class: 'swatches', role: 'radiogroup' },
    colors.map((c) => h('button', {
      type: 'button', class: `swatch${c === selected ? ' on' : ''}`, style: `--c:${c}`,
      'aria-label': c, onClick: () => onPick(c),
    })));
}

export const fmtClock = (sec) =>
  [sec / 3600, (sec % 3600) / 60, sec % 60].map((n) => String(Math.floor(n)).padStart(2, '0')).join(':');

// 날짜는 서버와 같은 YYYYMMDD 문자열로 주고받는다
const parseYmd = (s) => new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));

/** "10.29 (목)" */
export function fmtDate(ymd) {
  const d = parseYmd(ymd);
  return `${d.getMonth() + 1}.${d.getDate()} (${'일월화수목금토'[d.getDay()]})`;
}


export function fmtShort(sec) {
  const hours = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  return hours ? `${hours}시간 ${mins}분` : `${mins}분`;
}

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
