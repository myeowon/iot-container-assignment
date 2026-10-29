// 플래너: 과목 → 할 일(과목별 백로그) → 그날의 플래너
// 기본(플래너 페이지): 종이 플래너 시트(planner-sheet.js, 지난 날짜는 읽기 전용) + 과목 관리 카드
// compact 모드(공부방): 오늘 목록 + 백로그에서 추가
import { del, get, patch, post, put } from './api.js';
import { plannerSheet } from './planner-sheet.js';
import { SUBJECT_COLORS, fill, fmtDate, fmtShort, h, swatches, toast } from './ui.js';

export function createPlanner(container, { compact = false, onChange } = {}) {
  let data = null;
  let newSubjectColor = SUBJECT_COLORS[0];
  let focusSubject = null;          // 할 일 추가 후 같은 입력창에 다시 포커스
  const openSubjects = new Set();
  const progress = h('div', { class: 'progress' });
  const colorBox = h('div');        // 색만 다시 그려서 입력 중인 과목 이름을 지키기
  const drawColors = () => colorBox.replaceChildren(
    swatches(SUBJECT_COLORS, newSubjectColor, (c) => { newSubjectColor = c; drawColors(); }));

  const subjectOf = (id) => data.subjects.find((s) => s.id === id);
  const taskOf = (id) => data.tasks.find((t) => t.id === id);
  const dayIds = () => data.day.taskIds;

  async function act(request) {
    try {
      apply(await request);
    } catch (err) {
      toast(err.message);
    }
  }

  function apply(next) {
    data = next;
    draw();
    onChange?.(data);
  }

  const load = (date) => act(get(`/planner${date ? `?date=${date}` : ''}`));
  const setToday = (ids) => act(put('/daily', { taskIds: ids }));
  const toggleDone = (t) => act(patch(`/tasks/${t.id}`, { done: !t.done }));
  const sheetActions = {
    toggleDone,
    saveDaily: (changes) => act(put('/daily', changes)),
    saveTimetable: (cells) => act(put('/timetable', { timetable: cells })),
  };

  // ---------- 오늘의 플래너 (공부방 compact) ----------

  function drawProgress() {
    const goal = data.day.goalMin * 60;
    const studied = data.study.totalSec;
    const ratio = goal ? Math.min(1, studied / goal) : 0;
    const bySubject = Object.entries(data.study.bySubject).filter(([id]) => subjectOf(id));
    fill(progress,
      h('div', { class: 'bar' }, h('span', { style: `width:${ratio * 100}%` })),
      h('small', {}, `${fmtShort(studied)} / 목표 ${fmtShort(goal)}`),
      bySubject.length > 0 && h('div', { class: 'subject-times' }, bySubject.map(([id, sec]) =>
        h('span', { class: 'chip', style: `--c:${subjectOf(id).color}` }, h('i', { class: 'dot' }), `${subjectOf(id).name} ${fmtShort(sec)}`))));
  }

  function daySection() {
    const tasks = dayIds().map(taskOf).filter(Boolean);
    const done = tasks.filter((t) => t.done).length;
    const empty = !data.editable ? '이 날은 담아 둔 할 일이 없어요'
      : compact ? '아래에서 과목의 할 일을 골라 추가해요' : '과목의 할 일에서 ＋오늘을 눌러 오늘 목록을 채워요';
    return h('div', { class: 'today' },
      h('div', { class: 'row between' },
        h('h3', {}, `${data.editable ? '오늘' : '그날'} 할 일 ${done}/${tasks.length}`),
        h('label', { class: 'goal' }, '목표',
          h('input', { type: 'number', min: 0, max: 1440, step: 10, value: data.day.goalMin, disabled: !data.editable,
            onChange: (e) => act(put('/daily', { goalMin: Number(e.target.value) })) }),
          '분')),
      progress,
      tasks.length ? h('ul', { class: 'tasks' }, tasks.map((t) => taskRow(t, { inDay: true }))) : h('p', { class: 'empty' }, empty),
      !data.editable && h('small', {}, '지난 기록은 볼 수만 있어요'));
  }

  function taskRow(t, { inDay }) {
    const subject = subjectOf(t.subjectId);
    const inToday = data.editable && dayIds().includes(t.id);
    const readOnly = inDay && !data.editable;
    return h('li', { class: `task${t.done ? ' done' : ''}` },
      h('input', { type: 'checkbox', checked: t.done, disabled: readOnly, onChange: () => toggleDone(t), 'aria-label': '완료' }),
      inDay && h('i', { class: 'dot', style: `--c:${subject?.color}`, title: subject?.name }),
      h('span', { class: 'title' }, t.title),
      inDay
        ? !readOnly && h('button', { class: 'icon', title: '오늘 목록에서 빼기',
          onClick: () => setToday(dayIds().filter((id) => id !== t.id)) }, '↩')
        // 지난 날짜를 보는 중에는 오늘 목록을 모르므로 ＋오늘을 숨긴다
        : data.editable && !t.done && h('button', { class: `chip-btn${inToday ? ' on' : ''}`, disabled: inToday,
          onClick: () => setToday([...dayIds(), t.id]) }, inToday ? '오늘 ✓' : '＋오늘'),
      !inDay && h('button', { class: 'icon', title: '삭제', onClick: () => act(del(`/tasks/${t.id}`)) }, '✕'));
  }

  // ---------- 과목 관리 (플래너 페이지) ----------

  function subjectsSection() {
    return h('div', { class: 'subjects' },
      h('div', { class: 'planner-head' }, h('h2', {}, '과목과 할 일'), h('small', {}, data.editable ? '＋오늘로 오늘 목록에 담기' : '')),
      !data.subjects.length && h('p', { class: 'empty' }, '먼저 과목을 만들어 보세요 (예: 알고리즘, 영어)'),
      data.subjects.map(subjectBlock),
      h('form', { class: 'add-subject', onSubmit: addSubject },
        h('input', { name: 'name', placeholder: '새 과목 이름', maxLength: 20, required: true }),
        colorBox,
        h('button', { class: 'btn small', type: 'submit' }, '과목 추가')));
  }

  function subjectBlock(s) {
    const tasks = data.tasks.filter((t) => t.subjectId === s.id);
    const open = openSubjects.has(s.id);
    const input = h('input', { name: 'title', placeholder: '할 일 추가', maxLength: 50, required: true });
    if (focusSubject === s.id) queueMicrotask(() => input.focus());
    return h('div', { class: `subject${open ? ' open' : ''}`, style: `--c:${s.color}` },
      h('div', { class: 'subject-head' },
        h('button', { class: 'subject-toggle', onClick: () => toggleOpen(s.id) },
          h('i', { class: 'dot' }), s.name,
          h('small', {}, `${tasks.filter((t) => !t.done).length}개 남음`)),
        h('button', { class: 'icon', title: '과목 삭제', onClick: () => removeSubject(s) }, '🗑')),
      open && h('div', { class: 'subject-body' },
        h('ul', { class: 'tasks' }, tasks.map((t) => taskRow(t, { inDay: false }))),
        h('form', { class: 'row', onSubmit: (e) => addTask(e, s.id) },
          input, h('button', { class: 'btn small', type: 'submit' }, '추가'))));
  }

  function toggleOpen(id) {
    openSubjects.has(id) ? openSubjects.delete(id) : openSubjects.add(id);
    draw();
  }

  function addSubject(e) {
    e.preventDefault();
    const name = new FormData(e.target).get('name');
    act(post('/subjects', { name, color: newSubjectColor }).then((d) => {
      openSubjects.add(d.subjects.at(-1).id);
      return d;
    }));
  }

  function addTask(e, subjectId) {
    e.preventDefault();
    focusSubject = subjectId;
    act(post('/tasks', { subjectId, title: new FormData(e.target).get('title') }));
  }

  function removeSubject(s) {
    if (confirm(`'${s.name}' 과목과 할 일을 모두 삭제할까요?`)) act(del(`/subjects/${s.id}`));
  }

  // ---------- 백로그에서 추가 (compact) ----------

  function backlogPicker() {
    const select = h('select', { 'aria-label': '추가할 할 일' },
      h('option', { value: '' }, '과목의 할 일 고르기'),
      data.subjects.map((s) => {
        const left = data.tasks.filter((t) => t.subjectId === s.id && !t.done && !dayIds().includes(t.id));
        return left.length && h('optgroup', { label: s.name },
          left.map((t) => h('option', { value: t.id }, t.title)));
      }));
    return h('div', { class: 'row backlog' }, select,
      h('button', { class: 'btn small', onClick: () => select.value && setToday([...dayIds(), select.value]) }, '추가'));
  }

  function draw() {
    if (compact) {
      container.replaceChildren(
        h('div', { class: 'planner-head' }, h('h2', {}, '오늘의 플래너'), h('small', {}, fmtDate(data.day.date))),
        daySection(), backlogPicker());
    } else {
      container.replaceChildren(h('div', { class: 'planner-grid' },
        plannerSheet(data, sheetActions),
        h('section', { class: 'card planner' }, subjectsSection())));
    }
    drawProgress();
    drawColors();
    focusSubject = null;
  }

  return {
    /** date(YYYYMMDD)를 주면 그날 기록, 없으면 오늘 */
    load,
    get data() { return data; },
    /** 공부방 하트비트로 받은 오늘 공부시간을 진행 막대에만 반영 */
    setStudy(study) {
      if (!data) return;
      data.study = study;
      drawProgress();
    },
  };
}
