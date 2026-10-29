// 플래너: 과목 → 할 일(과목별 백로그) → 그날의 플래너
// 기본(플래너 페이지): 종이 플래너 시트(planner-sheet.js, 지난 날짜는 읽기 전용) + 과목 관리 카드
// compact 모드(공부방): 플래너 페이지에서 오늘로 담은 할 일만. 할 일을 누르면 '지금 하는 일'로 고른다
//   (고르지 않으면 시간표에서 지금 계획한 과목을 위로·강조)
import { del, get, patch, post, put } from './api.js';
import { plannerSheet } from './planner-sheet.js';
import { slotNow } from './timetable.js';
import { SUBJECT_COLORS, fmtDate, fmtShort, h, swatches, toast } from './ui.js';

export function createPlanner(container, { compact = false, onChange, onPick } = {}) {
  let data = null;
  let newSubjectColor = SUBJECT_COLORS[0];
  let focusSubject = null;          // 할 일 추가 후 같은 입력창에 다시 포커스
  const openSubjects = new Set();
  let plannedNow = null;            // compact: 시간표에서 지금 시각에 계획한 과목 → 강조
  let pickedId = null;              // compact: 지금 하는 일로 고른 할 일
  const subjectTimes = new Map();   // compact: 과목 id → 과목 이름 옆 오늘 공부시간 표시
  const colorBox = h('div');        // 색만 다시 그려서 입력 중인 과목 이름을 지키기
  const drawColors = () => colorBox.replaceChildren(
    swatches(SUBJECT_COLORS, newSubjectColor, (c) => { newSubjectColor = c; drawColors(); }));

  const subjectOf = (id) => data.subjects.find((s) => s.id === id);
  const taskOf = (id) => data.tasks.find((t) => t.id === id);
  const dayIds = () => data.day.taskIds;
  const planned = () => data.day.timetable[slotNow()] ?? null;

  async function act(request) {
    try {
      apply(await request);
    } catch (err) {
      toast(err.message);
    }
  }

  function apply(next) {
    data = next;
    // 고른 할 일이 오늘 목록에서 빠졌거나 끝났으면 고르기를 푼다
    if (pickedId && !(dayIds().includes(pickedId) && !taskOf(pickedId)?.done)) pick(null);
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

  /** 과목 이름 옆 오늘 공부시간 (하트비트마다 글자만 바꾼다) */
  function drawSubjectTimes() {
    for (const [id, el] of subjectTimes) el.textContent = fmtShort(data.study.bySubject[id] ?? 0);
  }

  function daySection() {
    const tasks = dayIds().map(taskOf).filter(Boolean);
    const done = tasks.filter((t) => t.done).length;
    const empty = !data.editable ? '이 날은 담아 둔 할 일이 없어요'
      : compact ? '플래너 페이지에서 ＋오늘로 할 일을 담아요' : '과목의 할 일에서 ＋오늘을 눌러 오늘 목록을 채워요';
    return h('div', { class: 'today' },
      h('h3', {}, `${data.editable ? '오늘' : '그날'} 할 일 ${done}/${tasks.length}`),
      tasks.length > 0 && data.editable && h('small', { class: 'pick-hint' }, '할 일을 누르면 지금 하는 일로 정해져요'),
      tasks.length ? subjectGroups(tasks) : h('p', { class: 'empty' }, empty),
      !data.editable && h('small', {}, '지난 기록은 볼 수만 있어요'));
  }

  /** 오늘 할 일을 과목별로 묶는다. 시간표에서 지금 계획한 과목을 맨 위에 두고 강조한다. */
  function subjectGroups(tasks) {
    const groups = new Map();
    for (const t of tasks) groups.set(t.subjectId, [...(groups.get(t.subjectId) ?? []), t]);
    // 지금 하는 과목(고른 할 일의 과목, 없으면 시간표 계획)을 맨 위로
    const current = pickedId ? taskOf(pickedId).subjectId : plannedNow;
    const order = [...groups].sort(([a], [b]) => (b === current) - (a === current));
    subjectTimes.clear();
    return h('div', { class: 'day-groups' }, order.map(([subjectId, list]) => {
      const subject = subjectOf(subjectId);
      const now = !pickedId && subjectId === plannedNow;
      const time = h('span', { class: 'subject-time' });
      subjectTimes.set(subjectId, time);
      return h('div', { class: `day-group${now ? ' now' : ''}`, style: `--c:${subject?.color}` },
        h('div', { class: 'day-subject' }, h('i', { class: 'dot' }), subject?.name, time,
          now && h('span', { class: 'now-badge' }, '지금 계획')),
        h('ul', { class: 'tasks' }, list.map((t) => taskRow(t, { inDay: true }))));
    }));
  }

  function taskRow(t, { inDay }) {
    const inToday = data.editable && dayIds().includes(t.id);
    const readOnly = inDay && !data.editable;
    const picked = t.id === pickedId;
    return h('li', { class: `task${t.done ? ' done' : ''}${picked ? ' picked' : ''}` },
      h('input', { type: 'checkbox', checked: t.done, disabled: readOnly, onChange: () => toggleDone(t), 'aria-label': '완료' }),
      compact && !t.done
        ? h('button', { class: 'title task-pick', 'aria-pressed': String(picked),
          title: picked ? '눌러서 고르기 풀기' : '지금 하는 일로 고르기', onClick: () => { pick(picked ? null : t.id); draw(); } },
          t.title, picked && h('span', { class: 'now-badge' }, '지금 하는 중'))
        : h('span', { class: 'title' }, t.title),
      inDay
        ? !readOnly && h('button', { class: 'icon', title: '오늘 할 일에서 빼기', 'aria-label': '오늘 할 일에서 빼기',
          onClick: () => setToday(dayIds().filter((id) => id !== t.id)) }, '✕')
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

  function pick(id) {
    pickedId = id;
    onPick?.(id);
  }

  function draw() {
    if (compact) {
      plannedNow = planned();
      container.replaceChildren(
        h('div', { class: 'planner-head' }, h('h2', {}, '오늘의 플래너'), h('small', {}, fmtDate(data.day.date))),
        daySection());
    } else {
      container.replaceChildren(h('div', { class: 'planner-grid' },
        plannerSheet(data, sheetActions),
        h('section', { class: 'card planner' }, subjectsSection())));
    }
    drawSubjectTimes();
    drawColors();
    focusSubject = null;
  }

  return {
    /** date(YYYYMMDD)를 주면 그날 기록, 없으면 오늘 */
    load,
    get data() { return data; },
    /** 공부방: 시간표의 지금 과목이 바뀌면(10분 칸 경계) 강조를 다시 그린다 */
    checkNow() {
      if (data && compact && planned() !== plannedNow) draw();
    },
    /** 공부방 하트비트로 받은 오늘 공부시간을 과목 이름 옆에만 반영 */
    setStudy(study) {
      if (!data) return;
      data.study = study;
      drawSubjectTimes();
    },
  };
}
