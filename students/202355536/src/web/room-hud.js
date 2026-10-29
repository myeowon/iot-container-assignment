// 공부방 화면의 HUD(상단 바·접는 패널·하단 도크). 상태는 room-view.js가 갖고, 여기서는 그리기만 한다.
// 3D 장면이 잘 보이도록 플래너·참가자 패널은 닫아 두고 상단 버튼으로 연다.
import { STATUS, characterOf, fmtClock, fmtShort, h } from './ui.js';

export function createHud(on) {
  const roomName = h('strong', {});
  const codeBox = h('span', {});
  const members = h('ul', { class: 'members' });
  const memberCount = h('span', {}, '0');
  const timer = h('div', { class: 'timer' }, '00:00:00');
  const clock = h('div', { class: 'timer' }, '00:00');
  const statusPill = h('span', { class: 'status-pill' });
  const seatHint = h('div', { class: 'seat-hint' }, '빈 자리를 클릭해 앉으세요');
  const controls = h('div', { class: 'controls' });
  const cameraBox = h('div', { class: 'camera' });
  const cameraNote = h('small', { class: 'camera-note' });
  const musicBtn = h('button', { class: 'btn ghost small', onClick: on.music }, '🎵 lo-fi');
  const volume = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: 0.6, 'aria-label': '음량', hidden: true,
    onInput: (e) => on.volume(Number(e.target.value)) });
  const plannerBox = h('div', { class: 'planner compact' });
  const plannerPanel = h('aside', { class: 'panel left card hidden' }, plannerBox);
  const membersPanel = h('aside', { class: 'panel right card hidden' }, h('h3', {}, '함께 공부 중'), members);

  const panelToggle = (panel, ...label) => h('button', { class: 'btn ghost small', 'aria-pressed': 'false', onClick: (e) => {
    const open = panel.classList.toggle('hidden') === false;
    e.currentTarget.setAttribute('aria-pressed', String(open));
  } }, ...label);

  const el = h('div', { class: 'room-screen' },
    h('div', { class: 'stage' }),
    h('header', { class: 'room-top' },
      h('div', { class: 'room-title' },
        h('button', { class: 'btn ghost small', title: '공부방 목록', 'aria-label': '공부방 목록', onClick: on.leave }, '←'),
        roomName, codeBox),
      h('div', { class: 'row room-tools' },
        panelToggle(plannerPanel, '📒 플래너'),
        panelToggle(membersPanel, '👥 ', memberCount),
        musicBtn, volume)),
    seatHint,
    plannerPanel,
    membersPanel,
    // 하단 줄: 왼쪽 시간 묶음 · 오른쪽 도크. 화면이 좁으면 도크가 아랫줄로 내려간다
    h('div', { class: 'room-bottom' },
      h('div', { class: 'session' },
        h('div', {}, h('div', { class: 'session-label' }, '지금 시간'), clock),
        h('div', {}, h('div', { class: 'session-label' }, '오늘의 공부', statusPill), timer)),
      h('footer', { class: 'dock card' },
        controls,
        cameraBox)));

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
      memberCount.textContent = String(list.length);
      members.replaceChildren(...sorted.map((m) => h('li', { class: m.id === myId ? 'me' : '' },
        h('span', { class: 'avatar', style: `--c:${characterOf(m.character).color}` }, characterOf(m.character).emoji),
        h('div', {}, h('strong', {}, m.name, m.id === myId && ' (나)'),
          h('small', {}, m.seat == null ? '자리 고르는 중' : `${STATUS[m.status].label} · 오늘 ${fmtShort(m.todaySec)}`)),
        h('span', { class: `dot-status ${m.status}` }))));
    },

    renderControls(state, status) {
      seatHint.hidden = state.seat != null;
      statusPill.hidden = state.seat == null;
      statusPill.className = `status-pill ${status}`;
      statusPill.textContent = `${STATUS[status].emoji} ${STATUS[status].label}`;
      const btn = (label, onClick, cls = '') => h('button', { class: `btn ${cls}`, onClick, disabled: state.seat == null }, label);
      const seg = (mode, label) => h('button', { class: `seg${state.mode === mode ? ' on' : ''}`, onClick: () => on.mode(mode) }, label);
      // 위: 수동 | 자리 감지 (반반), 아래: 같은 너비의 시작(또는 휴식·그만하기) 버튼
      controls.replaceChildren(
        h('div', { class: 'mode' }, seg('manual', '✋ 수동'), seg('camera', '📷 자리 감지')),
        state.running
          ? h('div', { class: 'actions' },
            btn(state.onBreak ? '▶ 다시 공부' : '☕ 휴식', on.toggleBreak),
            btn('■ 그만하기', on.stop, 'ghost'))
          : btn('▶ 공부 시작', on.start, 'primary'));
    },

    renderTimer(sec) {
      timer.textContent = fmtClock(Math.floor(sec));
      const now = new Date();
      clock.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    },

    setCamera(video, message) {
      cameraNote.textContent = video ? '얼굴을 찾는 중…' : '';
      cameraBox.replaceChildren(...(video ? [video, h('i', { class: 'led' }), cameraNote] : message ? [h('small', {}, message)] : []));
    },

    /** 감지 결과마다: 표시등 + "얼굴 인식됨 · 87%" 처럼 점수까지 보여 준다 */
    setDetected({ detected, score, error }) {
      cameraBox.classList.toggle('detected', detected);
      cameraNote.textContent = error ? `감지 오류: ${error}`
        : `${detected ? '얼굴 인식됨' : '얼굴이 안 보여요'} · ${Math.round(score * 100)}%`;
    },

    setMusic(playing) {
      musicBtn.textContent = playing ? '🎵 끄기' : '🎵 lo-fi';
      volume.hidden = !playing;
    },
  };
}
