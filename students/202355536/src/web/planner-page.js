// 플래너 페이지: 오늘의 플래너 시트 + 과목·할 일 관리
import { createPlanner } from './planner-view.js';
import { mountShell } from './shell.js';
import { h } from './ui.js';

export function mountPlannerPage(root, ctx) {
  const shell = mountShell(root, ctx, 'planner');
  const box = h('div');

  shell.main.append(
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, '플래너'),
        h('p', {}, '오늘 할 일과 공부할 시간을 정리해보세요.'))),
    box);

  const planner = createPlanner(box, {
    onChange: (d) => shell.setToday(d.study.totalSec),
  });

  planner.load();
  return () => shell.destroy();
}
