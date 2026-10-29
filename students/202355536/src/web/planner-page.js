// 플래너 페이지: 최근 7일 공부시간 막대 + 종이 플래너 시트 + 과목·할 일 관리
import { get } from './api.js';
import { createPlanner } from './planner-view.js';
import { mountShell } from './shell.js';
import { fmtDate, fmtShort, h } from './ui.js';

export function mountPlannerPage(root, ctx) {
  const shell = mountShell(root, ctx, 'planner');
  const week = h('div', { class: 'card week' });
  const box = h('div');
  let days = [];
  let selected = null;

  shell.main.append(
    h('div', { class: 'page-head' },
      h('div', {}, h('span', { class: 'eyebrow' }, '하루를 쌓는 작은 습관'), h('h1', {}, '플래너'),
        h('p', {}, '오늘 할 일과 공부할 시간을 정리해보세요.'))),
    week,
    box);

  const planner = createPlanner(box, {
    onChange: (d) => {
      selected = d.day.date;
      if (d.editable) shell.setToday(d.study.totalSec);
      loadWeek();
    },
  });

  /** 최근 7일: 막대 높이 = 공부시간 (가장 많이 한 날 기준), 누르면 그날 기록 */
  async function loadWeek() {
    try {
      days = (await get('/planner/history')).days;
    } catch {
      return;
    }
    const max = Math.max(3600, ...days.map((d) => d.totalSec));
    week.replaceChildren(
      h('div', { class: 'sheet-label' }, '최근 7일'),
      h('div', { class: 'week-bars' }, days.map((d) => h('button', {
        class: `week-day${d.date === selected ? ' on' : ''}`, title: `${fmtDate(d.date)} · 할 일 ${d.done}/${d.planned}`,
        onClick: () => planner.load(d.date),
      },
      h('span', { class: 'week-bar' }, h('i', { style: `height:${(d.totalSec / max) * 100}%` })),
      h('strong', {}, fmtShort(d.totalSec)),
      h('small', {}, fmtDate(d.date))))));
  }

  planner.load();
  return () => shell.destroy();
}
