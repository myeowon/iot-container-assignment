// 브라우저 안에서 도는 초경량 얼굴 감지 (MediaPipe BlazeFace, 약 230KB)
// 카메라 영상은 서버로 보내지 않고, "자리에 있음/없음" 판정만 앱에 알린다.

const MEDIAPIPE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

const INTERVAL_MS = 5000;   // 5초마다 한 번 감지
const WINDOW = 6;           // 최근 6번의 결과 중
const THRESHOLD = 4;        // 4번 이상 같으면 상태를 바꾼다 (순간적인 오탐에 흔들리지 않게)

/**
 * @param onChange(present: boolean)  상태가 바뀔 때만 호출
 * @param onSample(detected: boolean) 매 감지마다 호출 (표시등용)
 */
export async function startPresence({ onChange, onSample }) {
  const { FilesetResolver, FaceDetector } = await import(`${MEDIAPIPE}/vision_bundle.mjs`);
  const fileset = await FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
  const detector = await FaceDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
    runningMode: 'VIDEO',
    minDetectionConfidence: 0.5,
  });

  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
  const video = Object.assign(document.createElement('video'), { srcObject: stream, muted: true, playsInline: true });
  await video.play();

  const history = [];
  let present = true;   // 공부 시작 직후에는 자리에 있다고 본다

  function sample() {
    if (video.readyState < 2) return;
    const detected = detector.detectForVideo(video, performance.now()).detections.length > 0;
    history.push(detected);
    if (history.length > WINDOW) history.shift();
    onSample?.(detected);

    const hits = history.filter(Boolean).length;
    const misses = history.length - hits;
    const next = hits >= THRESHOLD ? true : misses >= THRESHOLD ? false : present;
    if (next !== present) {
      present = next;
      onChange(present);
    }
  }

  sample();
  const timer = setInterval(sample, INTERVAL_MS);

  return {
    video,
    stop() {
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      detector.close();
    },
  };
}
