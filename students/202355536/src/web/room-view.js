// 공부방: 내 공부 상태를 정하고 3초마다 하트비트로 서버와 동기화한다.
//
// 상태 결정 규칙
//   자리 없음 / 시작 안 함 → IDLE,  휴식 → BREAK,
//   자리 감지 모드에서 얼굴이 안 보임 → AWAY,  그 외 → STUDYING
import { post } from './api.js';
import { createLofi } from './lofi.js';
import { createPlanner } from './planner-view.js';
import { createHud } from './room-hud.js';
import { createScene } from './scene.js';
import { toast } from './ui.js';
import { startPresence } from './vision.js';

const HEARTBEAT_MS = 3000;
const KICK_OUT = [401, 403, 404, 409];

export function mountRoom(root, ctx, roomId) {
  const state = { seat: null, running: false, onBreak: false, mode: 'manual', present: true, taskId: null };
  let me = { totalSec: 0 };
  let syncedAt = 0;
  let scene = null;
  let vision = null;
  let inflight = false;
  let pending = false;
  let closed = false;
  const lofi = createLofi();

  const status = () => {
    if (state.seat == null || !state.running) return 'IDLE';
    if (state.onBreak) return 'BREAK';
    if (state.mode === 'camera' && !state.present) return 'AWAY';
    return 'STUDYING';
  };

  const hud = createHud({
    leave: () => ctx.go('#/rooms'),
    start: () => change({ running: true, onBreak: false }),
    stop: () => change({ running: false, onBreak: false }),
    toggleBreak: () => change({ onBreak: !state.onBreak }),
    mode: setMode,
    music: async () => {
      lofi.playing ? lofi.pause() : await lofi.play();
      hud.setMusic(lofi.playing);
    },
    volume: (v) => lofi.setVolume(v),
    copyCode: (code) => navigator.clipboard?.writeText(code).then(() => toast(`방 코드 ${code} 복사됨`)),
  });
  root.append(hud.el);

  const planner = createPlanner(hud.plannerBox, {
    compact: true,
    onChange: () => beat(),   // 책상 위 책 더미(남은 할 일) 갱신
    onPick: (taskId) => change({ taskId }),   // 지금 하는 일 → 이름표·공부시간 과목
  });
  planner.load();

  function change(patch) {
    Object.assign(state, patch);
    hud.renderControls(state, status());
    beat();
  }

  async function setMode(mode) {
    if (mode === state.mode) return;
    if (mode === 'camera') {
      hud.setCamera(null, '카메라와 감지 모델을 불러오는 중…');
      try {
        vision = await startPresence({
          onChange: (present) => change({ present }),
          onSample: (result) => hud.setDetected(result),
        });
        if (closed) return vision.stop();
        hud.setCamera(vision.video);
      } catch (err) {
        console.warn(err);
        hud.setCamera(null);
        toast('카메라를 사용할 수 없어 수동 모드로 계속해요');
        return;
      }
    } else {
      vision?.stop();
      vision = null;
      hud.setCamera(null);
    }
    change({ mode, present: true });
  }

  // ---------- 서버 동기화 ----------

  async function beat() {
    if (closed) return;
    if (inflight) {
      pending = true;
      return;
    }
    inflight = true;
    try {
      const res = await post(`/rooms/${roomId}/heartbeat`, {
        seat: state.seat, status: status(), taskId: state.taskId,
      });
      if (closed) return;
      if (res.seatTaken) {
        state.seat = null;
        toast('이미 누가 앉은 자리예요');
      }
      me = res.me;
      syncedAt = performance.now();
      scene ??= createScene(hud.stage, {
        seatCount: res.room.max,
        onSeatClick: (seat) => change({ seat }),
      });
      scene.update(res.members, ctx.user.id, true);
      hud.setRoom(res.room);
      hud.renderMembers(res.members, ctx.user.id);
      hud.renderControls(state, status());
      planner.setStudy(res.me);
    } catch (err) {
      if (KICK_OUT.includes(err.status)) {
        toast(err.message);
        ctx.go('#/rooms');
      }
    } finally {
      inflight = false;
      if (pending) {
        pending = false;
        beat();
      }
    }
  }

  function renderTimer() {
    const sinceSync = status() === 'STUDYING' && syncedAt ? (performance.now() - syncedAt) / 1000 : 0;
    hud.renderTimer(me.totalSec + sinceSync);
    planner.checkNow();
  }

  const leaveBeacon = () => navigator.sendBeacon(`/api/rooms/${roomId}/leave`);
  addEventListener('pagehide', leaveBeacon);
  hud.renderControls(state, status());
  renderTimer();
  beat();
  const timers = [setInterval(beat, HEARTBEAT_MS), setInterval(renderTimer, 1000)];

  return () => {
    closed = true;
    timers.forEach(clearInterval);
    removeEventListener('pagehide', leaveBeacon);
    post(`/rooms/${roomId}/leave`).catch(() => {});
    vision?.stop();
    lofi.close();
    scene?.destroy();
  };
}
