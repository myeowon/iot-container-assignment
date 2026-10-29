// 플래너 한 장: 오늘 날짜 · 목표/공부한 시간 · TODO(과목별 할 일) · TIMETABLE
import { timetable } from './timetable.js';
import { fmtShort, h } from './ui.js';

/** 20261030 → "10월 30일 금요일" */
function longDate(ymd) {
  const [y, m, d] = [ymd.slice(0, 4), ymd.slice(4, 6), ymd.slice(6, 8)].map(Number);
  const weekday = '일월화수목금토'[new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 ${weekday}요일`;
}

/**
 * @param data    GET /api/planner 응답
 * @param actions { toggleDone(task), saveDaily(patch), saveTimetable(cells) }
 */
export function plannerSheet(data, actions) {
  const { day, editable } = data;
  const subjectOf = (id) => data.subjects.find((s) => s.id === id);
  const goal = day.goalMin * 60;
  const studied = data.study.totalSec;

  const dateBox = h('div', { class: 'sheet-box sheet-date' },
    h('div', { class: 'sheet-label' }, day.date.slice(0, 4)),
    h('strong', { class: 'hand big' }, longDate(day.date)));

  const timeBox = h('div', { class: 'sheet-box sheet-total' },
    h('div', { class: 'time-pair' },
      h('div', {},
        h('div', { class: 'sheet-label' }, '목표 시간'),
        h('label', { class: 'goal' },
          h('input', { type: 'number', min: 0, max: 1440, step: 10, value: day.goalMin, disabled: !editable,
            'aria-label': '목표 시간(분)', onChange: (e) => actions.saveDaily({ goalMin: Number(e.target.value) }) }), '분')),
      h('div', {},
        h('div', { class: 'sheet-label' }, '공부한 시간'),
        h('strong', { class: 'hand big' }, fmtShort(studied)))),
    h('div', { class: 'progress' }, h('div', { class: 'bar' },
      h('span', { style: `width:${goal ? Math.min(100, (studied / goal) * 100) : 0}%` }))));

  return h('section', { class: 'card sheet' },
    h('div', { class: 'sheet-top' }, dateBox, timeBox),
    h('div', { class: 'sheet-body' }, todo(data, subjectOf, actions), timetable(data, { save: actions.saveTimetable })));
}

/** TODO: 그날 할 일을 과목별로 묶는다. 완료하면 체크 표시와 취소선 */
function todo(data, subjectOf, actions) {
  const tasks = data.day.taskIds.map((id) => data.tasks.find((t) => t.id === id)).filter(Boolean);
  const groups = new Map();
  for (const t of tasks) groups.set(t.subjectId, [...(groups.get(t.subjectId) ?? []), t]);
  return h('div', { class: 'contents' },
    h('div', { class: 'sheet-label' }, 'TODO'),
    groups.size === 0 && h('p', { class: 'empty' },
      data.editable ? '오른쪽 과목 목록에서 ＋오늘을 눌러 담아요' : '이 날은 담아 둔 할 일이 없어요'),
    [...groups].map(([subjectId, list]) => {
      const subject = subjectOf(subjectId);
      return h('div', { class: 'contents-group', style: `--c:${subject?.color}` },
        h('span', { class: 'hand subject-name' }, subject?.name),
        h('ul', {}, list.map((t) => h('li', { class: t.done ? 'done' : '' },
          h('span', { class: 'todo-title' }, t.title),
          h('button', { class: 'mark', disabled: !data.editable, 'aria-pressed': String(t.done),
            title: t.done ? '완료 취소' : '완료', onClick: () => actions.toggleDone(t) }, t.done ? '✓' : '')))));
    }));
}
