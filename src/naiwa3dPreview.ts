import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const viewport = element<HTMLDivElement>('viewport');
const loading = element<HTMLDivElement>('loading');
const loadMessage = element<HTMLParagraphElement>('load-message');
const retry = element<HTMLButtonElement>('retry');
const play = element<HTMLButtonElement>('play');
const restart = element<HTMLButtonElement>('restart');
const timeline = element<HTMLInputElement>('timeline');
const time = element<HTMLOutputElement>('time');
const status = element<HTMLParagraphElement>('status');
const clipButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-clip]')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let playing = !reducedMotion.matches;
let rig: THREE.Group | undefined;
let mixer: THREE.AnimationMixer | undefined;
let active: THREE.AnimationAction | undefined;
let skeleton: THREE.SkeletonHelper | undefined;
const actions = new Map<string, THREE.AnimationAction>();
const modelUrl = new URL('../art/naiwa/naiwa.glb', import.meta.url).href;

function showError(message: string) {
  loading.hidden = false;
  loadMessage.textContent = message;
  retry.hidden = false;
  status.textContent = '预览暂不可用。模型源文件仍可从下方下载。';
}

function startPreview() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0xf6f5ef);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewport.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '3D 奶蛙模型');
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    renderer.setAnimationLoop(null);
    showError('图形上下文已中断，请重新加载预览。');
  });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .05, 100);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = !reducedMotion.matches;
  orbit.dampingFactor = .12;
  orbit.minDistance = 2.5;
  orbit.maxDistance = 12;
  orbit.maxPolarAngle = Math.PI * .53;
  function setView(view: string) {
    orbit.target.set(0, 1.5, 0);
    if (view === 'front') camera.position.set(0, 1.5, 7.5);
    else if (view === 'side') camera.position.set(7.5, 1.5, 0);
    else if (view === 'back') camera.position.set(0, 1.5, -7.5);
    else camera.position.set(3.4, 2.7, 7.4);
    orbit.update();
  }
  setView('front');
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => {
    button.addEventListener('click', () => setView(button.dataset.view!));
  });
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb0a88b, 2));
  const key = new THREE.DirectionalLight(0xfff5dc, 3);
  key.position.set(-3, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -3;
  key.shadow.camera.right = key.shadow.camera.top = 3;
  key.shadow.normalBias = .025;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe4edff, 1.5);
  fill.position.set(4, 3, -3);
  scene.add(fill);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0xf6f5ef, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.025;
  ground.receiveShadow = true;
  scene.add(ground);

  // Authoring contact guides only; not part of the exported character.
  const props = new THREE.Group();
  const propMaterial = new THREE.MeshStandardMaterial({ color: 0xb8beb3, roughness: .75 });
  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(1.32, .07, .44), propMaterial);
  keyboard.position.set(0, .445, 1);
  keyboard.receiveShadow = true;
  props.add(keyboard);
  const keys = new THREE.InstancedMesh(new THREE.BoxGeometry(.11, .035, .10), new THREE.MeshStandardMaterial({ color: 0xe7e8dc }), 40);
  const transform = new THREE.Matrix4();
  for (let row = 0; row < 4; row++) for (let col = 0; col < 10; col++) {
    transform.makeTranslation((col - 4.5) * .127, .496, 1 + (row - 1.5) * .105);
    keys.setMatrixAt(row * 10 + col, transform);
  }
  props.add(keys);
  const mouse = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), propMaterial);
  mouse.scale.set(.14, .08, .21);
  mouse.position.set(-1, .44, .91);
  props.add(mouse);
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.7, .035, .8), new THREE.MeshStandardMaterial({ color: 0xdad1bc, roughness: .9 }));
  table.position.set(-.2, .385, 1.02);
  props.add(table);
  props.visible = false;
  scene.add(props);
  element<HTMLInputElement>('props').addEventListener('change', event => { props.visible = (event.target as HTMLInputElement).checked; });
  element<HTMLInputElement>('skeleton').addEventListener('change', event => { if (skeleton) skeleton.visible = (event.target as HTMLInputElement).checked; });

  function updatePlayback() {
    play.textContent = playing ? '暂停' : '播放';
    play.disabled = restart.disabled = timeline.disabled = !active;
  }
  function selectClip(name: string) {
    if (!rig || !mixer) return;
    if (name === 'rest') {
      mixer.stopAllAction();
      rig.traverse(object => {
        if (object instanceof THREE.SkinnedMesh) object.pose();
        if (object instanceof THREE.Mesh && object.morphTargetInfluences) object.morphTargetInfluences.fill(0);
      });
      active = undefined;
      playing = false;
    } else {
      const next = actions.get(name);
      if (!next) return;
      const previous = active;
      next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
      if (previous && previous !== next && playing && !reducedMotion.matches) next.crossFadeFrom(previous, .28, false);
      else {
        mixer.stopAllAction();
        next.reset().play();
      }
      active = next;
      playing = !reducedMotion.matches;
      mixer.update(0);
    }
    clipButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.clip === name)));
    timeline.max = String(active?.getClip().duration ?? 1);
    timeline.value = '0';
    time.textContent = '0.0 / ' + (active?.getClip().duration ?? 0).toFixed(1) + ' 秒';
    updatePlayback();
  }
  clipButtons.forEach(button => button.addEventListener('click', () => selectClip(button.dataset.clip!)));
  play.addEventListener('click', () => { playing = !playing; updatePlayback(); });
  restart.addEventListener('click', () => { if (active) { active.time = 0; mixer!.update(0); } });
  timeline.addEventListener('input', () => {
    if (!active || !mixer) return;
    playing = false;
    // Clear a pending crossfade before deterministic scrubbing.
    mixer.stopAllAction();
    active.reset().play();
    active.time = Number(timeline.value);
    mixer.update(0);
    updatePlayback();
  });
  const motionChanged = () => { orbit.enableDamping = !reducedMotion.matches; if (reducedMotion.matches) playing = false; updatePlayback(); };
  reducedMotion.addEventListener('change', motionChanged);
  const resize = new ResizeObserver(() => {
    const { width, height } = viewport.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  });
  resize.observe(viewport);
  const loader = new GLTFLoader();
  loader.load(modelUrl, gltf => {
    rig = gltf.scene;
    rig.traverse(object => {
      if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    scene.add(rig);
    skeleton = new THREE.SkeletonHelper(rig);
    skeleton.visible = element<HTMLInputElement>('skeleton').checked;
    scene.add(skeleton);
    mixer = new THREE.AnimationMixer(rig);
    gltf.animations.forEach(clip => actions.set(clip.name, mixer!.clipAction(clip)));
    clipButtons.forEach(button => { button.disabled = button.dataset.clip !== 'rest' && !actions.has(button.dataset.clip!); });
    loading.hidden = true;
    let bones = 0;
    rig.traverse(object => { if (object instanceof THREE.Bone) bones++; });
    status.textContent = bones + ' 根骨骼 · ' + actions.size + ' 段动画 · ' + (reducedMotion.matches ? '已按系统偏好暂停，点击播放查看动作。' : '模型加载完成。');
    selectClip('rest');
  }, event => {
    if (event.total) loadMessage.textContent = '正在加载模型… ' + Math.round(event.loaded / event.total * 100) + '%';
  }, () => showError('模型加载失败。请通过项目开发服务器打开此页面，再重试。'));
  let previousTime = performance.now();
  renderer.setAnimationLoop(now => {
    const delta = Math.min((now - previousTime) / 1000, .05);
    previousTime = now;
    if (document.hidden) return;
    if (mixer && playing) mixer.update(delta);
    if (active) {
      timeline.value = String(active.time);
      time.textContent = active.time.toFixed(1) + ' / ' + active.getClip().duration.toFixed(1) + ' 秒';
    }
    orbit.update();
    renderer.render(scene, camera);
  });
  window.addEventListener('pagehide', () => {
    renderer.setAnimationLoop(null);
    resize.disconnect();
    reducedMotion.removeEventListener('change', motionChanged);
    orbit.dispose();
    mixer?.stopAllAction();
    if (rig) mixer?.uncacheRoot(rig);
    scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      }
    });
    skeleton?.dispose();
    renderer.dispose();
  }, { once: true });
}
retry.addEventListener('click', () => location.reload());
try { startPreview(); } catch { showError('无法启动 3D 预览，请启用浏览器硬件加速后重试。'); }
