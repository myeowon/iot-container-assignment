// 캐릭터 페이지의 3D 미리보기: 방석 위에 앉아 손을 흔들며 천천히 좌우로 돈다
import * as THREE from 'three';
import { createCharacter } from './characters.js';
import { cyl } from './mesh.js';

export function createPreview(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 2.2, 6.2);
  camera.lookAt(0, 1.05, 0);

  const sun = new THREE.DirectionalLight('#fff3e0', 2.2);
  sun.position.set(3, 6, 4);
  sun.castShadow = true;
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9b38f', 1.6), sun);

  const cushion = cyl(0.62, 0.66, 0.16, '#7fb069', [0, 0.42, 0], 32);   // 앉을 방석
  const floor = cyl(1.5, 1.5, 0.08, '#f1e6d2', [0, 0.04, 0], 48);
  scene.add(floor, cushion);

  let character = null;
  const clock = new THREE.Clock();

  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    camera.aspect = w / h || 1;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    const t = clock.elapsedTime;
    if (character) {
      character.root.rotation.y = Math.sin(t * 0.5) * 0.7;
      character.tick(t, dt);
    }
    renderer.render(scene, camera);
  });

  return {
    /** 캐릭터 id를 바꿔 보여 준다 */
    show(characterId) {
      if (character) scene.remove(character.root);
      character = createCharacter({ id: 'preview', character: characterId }, { withProps: false });
      character.setPose('HELLO');
      scene.add(character.root);
    },
    destroy() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      scene.traverse((o) => o.geometry?.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
