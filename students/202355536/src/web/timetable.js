// 플래너 시간표: 6시 ~ 다음 날 5시, 한 줄 = 1시간, 한 칸 = 10분
// 계획: 과목(붓)을 고르고 칸을 누르거나 드래그해서 칠한다 (마우스·터치 모두)
// 실제: 그 10분 동안 5분 이상 공부했으면 칸 아래에 진한 막대를 그린다
import { h } from './ui.js';

const HOURS = Array.from({ length: 24 }, (_, i) => (i + 6) % 24);
const ACTUAL_MIN_SEC = 300;
const ERASER = '';

const slotNow = () => {
  const now = new Date();
  return Math.floor((now.getHours() * 60 + now.getMinutes()) / 10);
};

/** @param save(cells) 칠하기를 마칠 때 {칸 번호: subjectId} 전체를 저장 */
export function timetable(data, { save }) {
  const cells = { ...data.day.timetable };
  const colorOf = (id) => data.subjects.find((s) => s.id === id)?.color;
  const nowSlot = data.editable ? slotNow() : -1;
  let brush = data.subjects[0]?.id ?? ERASER;
  let painting = false;
  let changed = false;

  function paint(cell) {
    const id = cells[cell.dataset.slot];
    cell.classList.toggle('planned', Boolean(id));
    cell.style.setProperty('--c', colorOf(id) ?? 'transparent');
  }

  const grid = h('div', { class: `tt-grid${data.editable ? ' editable' : ''}` },
    HOURS.map((hour) => h('div', { class: 'tt-row' },
      h('span', { class: 'tt-hour' }, hour),
      Array.from({ length: 6 }, (_, i) => {
        const slot = hour * 6 + i;
        const cell = h('div', { class: `tt-cell${slot === nowSlot ? ' now' : ''}`, 'data-slot': slot },
          (data.study.bySlot[slot] ?? 0) >= ACTUAL_MIN_SEC && h('i', { class: 'tt-actual' }));
        paint(cell);
        return cell;
      }))));

  // 드래그 중에는 포인터 아래 칸을 찾아 칠한다 (터치는 포인터를 캡처하므로 좌표로 찾는다)
  function brushAt(e) {
    const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.tt-cell');
    if (!cell || !grid.contains(cell)) return;
    const slot = cell.dataset.slot;
    if ((cells[slot] ?? ERASER) === brush) return;
    if (brush === ERASER) delete cells[slot];
    else cells[slot] = brush;
    changed = true;
    paint(cell);
  }

  function finish() {
    if (painting && changed) save(cells);
    painting = changed = false;
  }

  if (data.editable) {
    grid.addEventListener('pointerdown', (e) => { painting = true; brushAt(e); });
    grid.addEventListener('pointermove', (e) => painting && brushAt(e));
    grid.addEventListener('pointerup', finish);
    grid.addEventListener('pointerleave', finish);
  }

  const palette = h('div', { class: 'tt-palette' });
  function drawPalette() {
    const pick = (id, label, color) => h('button', {
      type: 'button', class: `tt-brush${brush === id ? ' on' : ''}`, style: `--c:${color}`,
      onClick: () => { brush = id; drawPalette(); },
    }, h('i', { class: 'dot' }), label);
    palette.replaceChildren(
      ...data.subjects.map((s) => pick(s.id, s.name, s.color)),
      pick(ERASER, '지우개', '#ffffff'));
  }
  if (data.editable && data.subjects.length) drawPalette();

  return h('div', { class: 'timetable' },
    h('div', { class: 'sheet-label' }, 'TIMETABLE'),
    data.editable && (data.subjects.length
      ? h('small', {}, '과목을 고르고 칸을 칠해 시간대별 계획을 세워요')
      : h('small', {}, '과목을 만들면 시간표를 칠할 수 있어요')),
    palette,
    grid,
    h('small', { class: 'tt-legend' }, h('i', { class: 'tt-actual' }), ' 실제로 공부한 10분'));
}
