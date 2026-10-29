// 공부방 화면의 HUD(상단 바·참가자·하단 도크). 상태는 room-view.js가 갖고, 여기서는 그리기만 한다.
import { STATUS, characterOf, fmtClock, fmtShort, h } from './ui.js';

export function createHud(on) {
  const roomName = h('strong', {});
  const codeBox = h('span', {});
  const daylightChip = h('span', { class: 'badge daylight' });
  const members = h('ul', { class: 'members' });
  const timer = h('div', { class: 'timer' }, '00:00:00');
  const statusPill = h('span', { class: 'status-pill' });
  const subjectSelect = h('select', { 'aria-label': '지금 공부하는 과목', onChange: (e) => on.subject(e.target.value || null) });
  const controls = h('div', { class: 'controls' });
  const cameraBox = h('div', { class: 'camera' });
  const cameraNote = h('small', { class: 'camera-note' });
  const musicBtn = h('button', { class: 'btn ghost small', onClick: on.music }, '🎵 lo-fi 켜기');
  const plannerBox = h('div', { class: 'planner compact' });
  const plannerPanel = h('aside', { class: 'panel left card' }, plannerBox);

  const el = h('div', { class: 'room-screen' },
    h('div', { class: 'stage' }),
    h('header', { class: 'room-top' },
      h('button', { class: 'btn ghost small', onClick: on.leave }, '← 공부방 목록'),
      h('div', { class: 'room-title' }, roomName, codeBox, daylightChip),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost small', onClick: () => plannerPanel.classList.toggle('hidden') }, '📒 플래너'),
        musicBtn,
        h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: 0.6, 'aria-label': '음량',
          onInput: (e) => on.volume(Number(e.target.value)) }))),
    plannerPanel,
    h('aside', { class: 'panel right card' }, h('h3', {}, '함께 공부 중'), members),
    h('div', { class: 'session' }, h('div', { class: 'session-label' }, '오늘의 공부 ', statusPill), timer),
    h('footer', { class: 'dock card' },
      h('label', { class: 'dock-subject' }, h('small', {}, '지금 공부하는 과목'), subjectSelect),
      controls,
      cameraBox));

  return {
    el,
    stage: el.querySelector('.stage'),
    plannerBox,

    setRoom(room) {
      roomName.textContent = room.name;
      codeBox.replaceChildren(room.code
        ? h('button', { class: 'badge private', title: '코드 복사', onClick: () => on.copyCode(room.code) }, `🔒 ${room.code}`)
        : h('span', { class: 'badge' }, '공개방'));
    },

    renderMembers(list, myId) {
      const sorted = [...list].sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99));
      members.replaceChildren(...sorted.map((m) => h('li', { class: m.id === myId ? 'me' : '' },
        h('span', { class: 'avatar', style: `--c:${characterOf(m.character).color}` }, characterOf(m.character).emoji),
        h('div', {}, h('strong', {}, m.name, m.id === myId && ' (나)'),
          h('small', {}, m.seat == null ? '자리 고르는 중' : `${STATUS[m.status].label} · 오늘 ${fmtShort(m.todaySec)}`)),
        h('span', { class: `dot-status ${m.status}` }))));
    },

    renderControls(state, status) {
      statusPill.className = `status-pill ${status}`;
      statusPill.textContent = state.seat == null ? '빈 자리를 클릭해 앉으세요' : `${STATUS[status].emoji} ${STATUS[status].label}`;
      const btn = (label, onClick, cls = '') => h('button', { class: `btn ${cls}`, onClick, disabled: state.seat == null }, label);
      const seg = (mode, label) => h('button', { class: `seg${state.mode === mode ? ' on' : ''}`, onClick: () => on.mode(mode) }, label);
      controls.replaceChildren(
        state.running
          ? h('div', { class: 'row' },
            btn(state.onBreak ? '▶ 다시 공부' : '☕ 휴식', on.toggleBreak),
            btn('■ 그만하기', on.stop, 'ghost'))
          : btn('▶ 공부 시작', on.start, 'primary'),
        h('div', { class: 'row mode' }, seg('manual', '✋ 수동'), seg('camera', '📷 자리 감지')));
    },

    /** 창밖 시간대 표시: "🌇 노을 18:30" */
    setDaylight(d) {
      const hh = String(Math.floor(d.hours)).padStart(2, '0');
      const mm = String(Math.floor((d.hours % 1) * 60)).padStart(2, '0');
      daylightChip.textContent = `${d.name} ${hh}:${mm}`;
    },

    renderTimer(sec) {
      timer.textContent = fmtClock(Math.floor(sec));
    },

    setSubjects(subjects, selected) {
      subjectSelect.replaceChildren(h('option', { value: '' }, '시간표 계획대로'),
        ...subjects.map((s) => h('option', { value: s.id, selected: s.id === selected }, s.name)));
    },

    setCamera(video, message) {
      cameraNote.textContent = video ? '얼굴을 찾는 중…' : '';
      cameraBox.replaceChildren(...(video ? [video, h('i', { class: 'led' }), cameraNote] : message ? [h('small', {}, message)] : []));
    },

    /** 5초마다 감지 결과: 표시등 + "얼굴 인식됨 · 87%" 처럼 점수까지 보여 준다 */
    setDetected({ detected, score, error }) {
      cameraBox.classList.toggle('detected', detected);
      cameraNote.textContent = error ? `감지 오류: ${error}`
        : `${detected ? '얼굴 인식됨' : '얼굴이 안 보여요'} · ${Math.round(score * 100)}%`;
    },

    setMusic(playing) {
      musicBtn.textContent = playing ? '🎵 lo-fi 끄기' : '🎵 lo-fi 켜기';
    },
  };
}
