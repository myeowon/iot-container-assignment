// Web Audio로 직접 만드는 lo-fi 루프 (음원 파일 없음 → 저작권 걱정 없음)
// 코드 진행 + 베이스 + 스윙 드럼 + 바이닐 노이즈

const BPM = 72;
const BEAT = 60 / BPM;
const CHORDS = [   // Fmaj7 → Em7 → Dm7 → Cmaj7 (MIDI 번호)
  [53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59],
];
const LOOKAHEAD = 0.2;   // 초 단위로 미리 예약

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

export function createLofi() {
  let ctx = null;
  let master = null;
  let timer = null;
  let nextStep = 0;      // 다음 8분음표 시각
  let step = 0;
  let volume = 0.6;

  function noiseBuffer(seconds, crackle = false) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = crackle ? (Math.random() < 0.0004 ? Math.random() * 2 - 1 : (Math.random() * 2 - 1) * 0.04)
        : Math.random() * 2 - 1;
    }
    return buf;
  }

  function tone(type, f, start, length, gain, cutoff = 1800) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.value = f;
    osc.detune.value = (Math.random() - 0.5) * 12;   // 살짝 어긋난 음정이 테이프 느낌
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(gain, start + 0.03);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(filter).connect(amp).connect(master);
    osc.start(start);
    osc.stop(start + length + 0.05);
  }

  function hit(start, { cutoff, type, gain, length }) {
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    src.buffer = noiseBuffer(length);
    filter.type = type;
    filter.frequency.value = cutoff;
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + length);
    src.connect(filter).connect(amp).connect(master);
    src.start(start);
  }

  function kick(start) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.frequency.setValueAtTime(110, start);
    osc.frequency.exponentialRampToValueAtTime(40, start + 0.25);
    amp.gain.setValueAtTime(0.55, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    osc.connect(amp).connect(master);
    osc.start(start);
    osc.stop(start + 0.4);
  }

  /** 8분음표 하나(한 마디 = 8스텝)를 예약 */
  function schedule(s, time) {
    const beatInBar = s % 8;
    const chord = CHORDS[Math.floor(s / 8) % CHORDS.length];
    if (beatInBar === 0) chord.forEach((n) => tone('triangle', freq(n), time, BEAT * 3.8, 0.07));
    if (beatInBar === 0 || beatInBar === 5) tone('sine', freq(chord[0] - 12), time, BEAT * 1.5, 0.22, 400);
    if (beatInBar % 2 === 1 && Math.random() < 0.35) {
      tone('sine', freq(chord[Math.floor(Math.random() * 4)] + 12), time, BEAT, 0.04, 2500);
    }
    if (beatInBar === 0 || beatInBar === 5) kick(time);
    if (beatInBar === 2 || beatInBar === 6) hit(time, { type: 'bandpass', cutoff: 1800, gain: 0.18, length: 0.18 });
    hit(time, { type: 'highpass', cutoff: 7000, gain: 0.05, length: 0.05 });
  }

  function tick() {
    while (nextStep < ctx.currentTime + LOOKAHEAD) {
      const swing = step % 2 ? BEAT * 0.08 : 0;   // 뒷박을 살짝 늦게
      schedule(step, nextStep + swing);
      nextStep += BEAT / 2;
      step++;
    }
  }

  function vinyl() {
    const src = ctx.createBufferSource();
    const amp = ctx.createGain();
    src.buffer = noiseBuffer(4, true);
    src.loop = true;
    amp.gain.value = 0.25;
    src.connect(amp).connect(master);
    src.start();
  }

  return {
    get playing() { return timer !== null; },
    async play() {
      if (!ctx) {
        ctx = new AudioContext();
        const warm = ctx.createBiquadFilter();
        warm.type = 'lowpass';
        warm.frequency.value = 4200;
        master = ctx.createGain();
        master.gain.value = volume * 0.8;
        master.connect(warm).connect(ctx.destination);
        vinyl();
      }
      await ctx.resume();
      nextStep = ctx.currentTime + 0.1;
      timer = setInterval(tick, 50);
    },
    pause() {
      clearInterval(timer);
      timer = null;
      ctx?.suspend();
    },
    setVolume(v) {
      volume = v;
      if (master) master.gain.value = v * 0.8;
    },
    close() {
      this.pause();
      ctx?.close();
      ctx = null;
    },
  };
}
