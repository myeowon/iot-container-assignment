// 종이 플래너 한 장: TODAY'S(날짜 이동) · D-DAY · TOTAL TIME · 오늘의 한마디 · CONTENTS · TIMETABLE
import { timetable } from './timetable.js';
import { fmtDate, fmtShort, h, shiftDate } from './ui.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAY_MS = 86_400_000;

/** 1 → 1st, 2 → 2nd, 11 → 11th, 23 → 23rd */
function ordinal(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
}

const parts = (ymd) => [Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)), Number(ymd.slice(6, 8))];
const toInputDate = (ymd) => ymd.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');

/** 20261030 → "OCT. 30th" */
function paperDate(ymd) {
  const [, month, day] = parts(ymd);
  return `${MONTHS[month - 1]}. ${ordinal(day)}`;
}

/** 기준 날짜에서 D-DAY까지: "D-12" / "D-DAY" / "D+3" */
function ddayText(target, from) {
  const utc = (ymd) => { const [y, m, d] = parts(ymd); return Date.UTC(y, m - 1, d); };
  const days = Math.round((utc(target) - utc(from)) / DAY_MS);
  return days === 0 ? 'D-DAY' : days > 0 ? `D-${days}` : `D+${-days}`;
}

/**
 * @param data    GET /api/planner 응답
 * @param actions { load(date), toggleDone(task), saveDaily(patch), saveTimetable(cells), saveDday(title, date) }
 */
export function plannerSheet(data, actions) {
  const { day, editable } = data;
  const subjectOf = (id) => data.subjects.find((s) => s.id === id);

  const dateBox = h('div', { class: 'sheet-box sheet-date' },
    h('div', { class: 'sheet-label' }, "TODAY'S"),
    h('div', { class: 'date-nav' },
      h('button', { class: 'icon', title: '전날', onClick: () => actions.load(shiftDate(day.date, -1)) }, '◀'),
      h('strong', { class: 'hand big' }, paperDate(day.date)),
      h('button', { class: 'icon', title: '다음 날', disabled: editable, onClick: () => actions.load(shiftDate(day.date, 1)) }, '▶')),
    h('small', {}, editable ? `오늘 · ${fmtDate(day.date)}` : `지난 기록 · ${fmtDate(day.date)}`),
    !editable && h('button', { class: 'chip-btn', onClick: () => actions.load() }, '오늘로'));

  const ddayBox = h('details', { class: 'sheet-box sheet-dday' },
    h('summary', {},
      h('div', { class: 'sheet-label' }, 'D-DAY'),
      h('strong', { class: 'hand big' }, data.dday ? ddayText(data.dday.date, day.date) : '－'),
      h('small', {}, data.dday?.title ?? '눌러서 설정')),
    h('form', { class: 'stack', onSubmit: (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      actions.saveDday(f.get('title'), String(f.get('date')).replaceAll('-', ''));
    } },
    h('input', { name: 'title', placeholder: '예: 정보처리기사', maxLength: 20, value: data.dday?.title ?? '' }),
    h('input', { name: 'date', type: 'date', value: data.dday ? toInputDate(data.dday.date) : '' }),
    h('button', { class: 'btn small', type: 'submit' }, '저장 (이름을 비우면 해제)')));

  const goal = day.goalMin * 60;
  const totalBox = h('div', { class: 'sheet-box sheet-total' },
    h('div', { class: 'sheet-label' }, 'TOTAL TIME'),
    h('strong', { class: 'hand big' }, fmtShort(data.study.totalSec)),
    h('label', { class: 'goal' }, '목표',
      h('input', { type: 'number', min: 0, max: 1440, step: 10, value: day.goalMin, disabled: !editable,
        onChange: (e) => actions.saveDaily({ goalMin: Number(e.target.value) }) }), '분'),
    h('div', { class: 'progress' }, h('div', { class: 'bar' },
      h('span', { style: `width:${goal ? Math.min(100, (data.study.totalSec / goal) * 100) : 0}%` }))));

  const memo = h('label', { class: 'sheet-memo' },
    h('span', { class: 'sheet-label' }, '오늘의 한마디'),
    h('input', { class: 'hand', value: day.memo, maxLength: 200, disabled: !editable,
      placeholder: editable ? '오늘의 다짐이나 메모를 적어요' : '',
      onChange: (e) => actions.saveDaily({ memo: e.target.value }) }));

  return h('section', { class: `card sheet${editable ? '' : ' past'}` },
    h('div', { class: 'sheet-top' }, dateBox, ddayBox, totalBox),
    memo,
    h('div', { class: 'sheet-body' }, contents(data, subjectOf, actions), timetable(data, { save: actions.saveTimetable })));
}

/** CONTENTS: 그날 할 일을 과목별로 묶고 형광펜처럼 칠한다. 완료는 O */
function contents(data, subjectOf, actions) {
  const tasks = data.day.taskIds.map((id) => data.tasks.find((t) => t.id === id)).filter(Boolean);
  const groups = new Map();
  for (const t of tasks) groups.set(t.subjectId, [...(groups.get(t.subjectId) ?? []), t]);
  return h('div', { class: 'contents' },
    h('div', { class: 'sheet-label' }, 'CONTENTS'),
    groups.size === 0 && h('p', { class: 'empty' },
      data.editable ? '오른쪽 과목 목록에서 ＋오늘을 눌러 담아요' : '이 날은 담아 둔 할 일이 없어요'),
    [...groups].map(([subjectId, list]) => {
      const subject = subjectOf(subjectId);
      return h('div', { class: 'contents-group', style: `--c:${subject?.color}` },
        h('span', { class: 'hand subject-name' }, subject?.name),
        h('ul', {}, list.map((t) => h('li', { class: t.done ? 'done' : '' },
          h('span', { class: 'hand highlight' }, t.title),
          h('button', { class: 'mark', disabled: !data.editable, title: t.done ? '완료 취소' : '완료',
            onClick: () => actions.toggleDone(t) }, t.done ? 'O' : '')))));
    }));
}
