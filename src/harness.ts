import { KuroCatEngine } from './catEngine';
import type { KeyboardOrientation } from './catEngine';
import { getKeyboardLayout, type KeyboardLayoutId } from './keyboardLayout';
import { resolveDeskMetrics, type MouseOrientation } from './deskMetrics';
import { BUILTIN_DESK_SKINS } from './deskSkin';
import { LIGHT_EFFECTS, LIGHT_PRESETS, LIGHT_ZONES } from './keyboardLight';
import { PROP_KINDS, PROP_SIDES } from './prop';
import type { KeycapOverride } from './deskSkin';
import { DEFAULT_BUILTIN_CATS } from './catSkins';
import { modelActions, modelActionLabel, modelRig } from './modelPack';
import { catAudio } from './audio';
import naiwaReferenceUrl from './assets/naiwa/reference.webp';

const HARNESS_DIY: Record<string, Record<string, KeycapOverride>> = {
  wasd: {
    w: { top: '#ff3b6b', side: '#b3224a', text: '#ffffff' },
    a: { top: '#ff3b6b', side: '#b3224a', text: '#ffffff' },
    s: { top: '#ff3b6b', side: '#b3224a', text: '#ffffff' },
    d: { top: '#ff3b6b', side: '#b3224a', text: '#ffffff' },
  },
  numpad: {
    '1': { top: '#6b8bff', side: '#3f59c9', text: '#ffffff' },
    '2': { top: '#7ee8a6', side: '#3aa666', text: '#14201a' },
    '3': { top: '#ffe14d', side: '#c9a900', text: '#241f00' },
    '4': { top: '#c56bff', side: '#8a3fc0', text: '#ffffff' },
    '5': { top: '#00e5ff', side: '#008fa8', text: '#002027' },
    '6': { top: '#ff9a3c', side: '#c96a12', text: '#241400' },
  },
  esc: { esc: { top: '#ff3b6b', side: '#b3224a', emoji: '🚨' } },
  emoji: {
    esc: { emoji: '🔥' },
    tab: { emoji: '🎵' },
    caps: { emoji: '🎮' },
    space: { emoji: '🐾' },
  },
};

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('pet-canvas') as HTMLCanvasElement;
// Embedded mode renders relative to the canvas box and centres the pet, which is
// what a browser preview needs. `?mode=desktop` reproduces the packaged app's
// full-window anchoring so rendering regressions can be reproduced here.
const embedded = params.get('mode') !== 'desktop';
const engine = new KuroCatEngine(canvas, { embedded });

let layout: KeyboardLayoutId = params.get('layout') === '108' ? '108' : '65';
let orient: KeyboardOrientation = params.get('orient') === 'viewer' ? 'viewer' : 'cat';
let mouse = (params.get('mouse') as MouseOrientation) || 'auto';
let kbs = Number(params.get('kbs') ?? (layout === '108' ? 0.85 : 1));
let propSide: 'left' | 'right' = (params.get('prop') || '').split(',')[1] === 'left' ? 'left' : 'right';
// Legacy preview URL only; imported model IDs never determine their rig.
let currentCatId = params.get('breed') === 'naiwa' ? 'builtin-naiwa' : params.get('breed') || 'black';

engine.setCatAppearance(currentCatId, DEFAULT_BUILTIN_CATS.find((c) => c.id === currentCatId) ?? null);
engine.setRenderScale(Number(params.get('scale') ?? 1));
// `?idle=0` freezes idle behaviours so a still pose can be captured for review.
if (params.get('idle') === '0') engine.setIdleAutoEnabled(false);

const skinId = params.get('skin');
const initialSkin = BUILTIN_DESK_SKINS.find((s) => s.id === skinId) ?? BUILTIN_DESK_SKINS[0];
engine.setDeskSkin(initialSkin);

if (params.get('light')) {
  const [effect, color, color2] = (params.get('light') || '').split(',');
  engine.setLightConfig({
    enabled: true,
    effect,
    color: color || '#00e5ff',
    color2: color2 || '#ff00a8',
    palette: [],
    colorMode: (params.get('mode') as 'solid' | 'palette' | 'random') || 'solid',
    edgeLight: params.get('edge') === '1',
    speed: Number(params.get('speed') ?? 1),
    brightness: Number(params.get('bright') ?? 0.8),
    reactive: true,
    underglow: params.get('underglow') !== '0',
    zone: params.get('zone') || 'all',
  });
}

if (params.get('prop')) {
  const [kind] = (params.get('prop') || '').split(',');
  engine.setPropConfig({
    enabled: true,
    kind: kind || 'coffee',
    side: propSide,
    autoSip: true,
    sipIntervalMin: 45,
    sipIntervalMax: 110,
  });
}

// ---- Layout sync -----------------------------------------------------------
// The logical canvas grows with the 108 deck, so the CSS box must follow or the
// render will letterbox and break pointer mapping.
function applyLayout(): void {
  const isFrog = modelRig(DEFAULT_BUILTIN_CATS.find(c => c.id === currentCatId)) === 'naiwa';
  document.getElementById('naiwa-reference')!.hidden = !isFrog;
  document.getElementById('preview-comparison')!.classList.toggle('has-reference', isFrog);
  document.getElementById('preview-intro')!.textContent = isFrog
    ? '奶蛙 · 坐姿打盹与流口水、左右晃身、好奇探头和交替摆脚；互动无专属音效。'
    : '直接敲键盘、点击鼠标，或选择下方动作查看互动。';
  engine.setKeyboardConfig(layout, orient, {
    scale: kbs,
    mouseOrientation: mouse,
    propEnabled: engine.getPropConfig().enabled,
  });
  const size = engine.getLogicalSize();
  // The stage is a column: canvas on top, panel below. Measure the panel and the
  // stage padding, then size the canvas to whatever vertical room is left.
  const panelH = panel?.offsetHeight ?? 220;
  const stageEl = document.getElementById('stage');
  const stagePadY = stageEl
    ? parseFloat(getComputedStyle(stageEl).paddingTop) +
      parseFloat(getComputedStyle(stageEl).paddingBottom)
    : 44;
  const gap = 14;
  const hintH = 24;
  const availW = Math.max(180, (document.getElementById('live-preview')?.clientWidth ?? window.innerWidth) - 20);
  const availH = Math.min(520, Math.max(360, window.innerHeight - panelH - stagePadY - gap - hintH - 70));
  const fit = Math.min(1.6, availW / size.w, availH / size.h);
  canvas.style.width = `${Math.round(size.w * fit)}px`;
  canvas.style.height = `${Math.round(size.h * fit)}px`;
  engine.resize();
  document.title = `DIY-Cat Harness ${size.w}x${size.h}`;
  syncPanel();
}

// ---- Interaction -----------------------------------------------------------

const pressed = new Set<number>();
const KEY_ID_TO_VK = new Map<string, number>();
function buildVkTable(): void {
  KEY_ID_TO_VK.clear();
  for (const key of getKeyboardLayout(layout).keys) {
    KEY_ID_TO_VK.set(key.id, key.vkCodes[0]);
  }
}

/** Maps a physical key to the VK the deck expects, so typing lights real keys. */
function keyEventToVk(e: KeyboardEvent): number | null {
  const code = e.code;
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
  if (/^Digit[0-9]$/.test(code)) return 0x30 + Number(code.slice(5));
  if (/^F([1-9]|1[0-2])$/.test(code)) return 0x6f + Number(code.slice(1));
  if (/^Numpad[0-9]$/.test(code)) return 0x60 + Number(code.slice(6));
  const map: Record<string, number> = {
    Escape: 0x1b,
    Tab: 0x09,
    CapsLock: 0x14,
    Backspace: 0x08,
    Enter: 0x0d,
    NumpadEnter: 0x10d,
    ShiftLeft: 0xa0,
    ShiftRight: 0xa1,
    ControlLeft: 0xa2,
    ControlRight: 0xa3,
    AltLeft: 0xa4,
    AltRight: 0xa5,
    MetaLeft: 0x5b,
    MetaRight: 0x5c,
    ContextMenu: 0x5d,
    Space: 0x20,
    Backquote: 0xc0,
    Minus: 0xbd,
    Equal: 0xbb,
    BracketLeft: 0xdb,
    BracketRight: 0xdd,
    Backslash: 0xdc,
    Semicolon: 0xba,
    Quote: 0xde,
    Comma: 0xbc,
    Period: 0xbe,
    Slash: 0xbf,
    ArrowLeft: 0x25,
    ArrowUp: 0x26,
    ArrowRight: 0x27,
    ArrowDown: 0x28,
    Insert: 0x2d,
    Delete: 0x2e,
    Home: 0x24,
    End: 0x23,
    PageUp: 0x21,
    PageDown: 0x22,
    PrintScreen: 0x2c,
    ScrollLock: 0x91,
    Pause: 0x13,
    NumLock: 0x90,
    NumpadAdd: 0x6b,
    NumpadSubtract: 0x6d,
    NumpadMultiply: 0x6a,
    NumpadDivide: 0x6f,
    NumpadDecimal: 0x6e,
    AudioVolumeMute: 0xad,
    AudioVolumeDown: 0xae,
    AudioVolumeUp: 0xaf,
    LaunchApp2: 0xb7,
  };
  return map[code] ?? null;
}

window.addEventListener('keydown', (e) => {
  if (isPanelTarget(e.target)) return;
  cancelDemo();
  catAudio.unlock();
  const vk = keyEventToVk(e);
  if (vk === null) return;
  e.preventDefault();
  const repeat = pressed.has(vk);
  pressed.add(vk);
  engine.onKeyDown(vk, repeat);
});
window.addEventListener('keyup', (e) => {
  const vk = keyEventToVk(e);
  if (vk === null) return;
  pressed.delete(vk);
  engine.onKeyUp(vk);
});

/** Canvas-relative position normalized to 0..1 of the logical canvas. */
function canvasNorm(e: MouseEvent): { x: number; y: number } {
  const p = engine.clientToLogical(e.clientX, e.clientY);
  const size = engine.getLogicalSize();
  return { x: p.x / size.w, y: p.y / size.h };
}

/** Canvas-relative position in logical pixels (for prop hit-testing). */
function canvasLogical(e: MouseEvent): { x: number; y: number } {
  return engine.clientToLogical(e.clientX, e.clientY);
}

function overCat(nx: number, ny: number): boolean {
  const r = engine.getHitRegions().cat;
  const dx = (nx - r.cx) / r.rx;
  const dy = (ny - r.cy) / r.ry;
  return dx * dx + dy * dy <= 1;
}

canvas.addEventListener('mousemove', (e) => {
  const n = canvasNorm(e);
  engine.onWindowCursor(n.x, n.y, overCat(n.x, n.y));
  const cursor = overCat(n.x, n.y) ? 'grab' : 'default';
  canvas.style.cursor = cursor;
});

// Mirror the desktop app's global cursor hook so the cat grips the mouse and leans
// toward it — including when the drink sits on the left and the mouse moves right.
window.addEventListener('mousemove', (e) => {
  if (isPanelTarget(e.target)) return;
  engine.onGlobalMouseMove(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
});

canvas.addEventListener('mousedown', (e) => {
  cancelDemo();
  e.preventDefault();
  catAudio.unlock();
  const p = canvasLogical(e);
  if (e.button === 0 && engine.hitTestProp(p.x, p.y)) {
    const r = engine.clickProp();
    setStatus(
      r === 'refilled' ? '🥤 已续杯' : r === 'sipped' ? '🐾 喝了一口' : '⏳ 正在喝，稍等',
    );
    return;
  }
  if (e.button === 0) engine.onMouseDown('left');
  else if (e.button === 2) engine.onMouseDown('right');
  else engine.onMouseDown('middle');
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) engine.onMouseUp('left');
  else if (e.button === 2) engine.onMouseUp('right');
  else engine.onMouseUp('middle');
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  cancelDemo();
  e.preventDefault();
  engine.onMouseWheel();
}, { passive: false });

window.addEventListener('mouseleave', () => engine.onWindowCursor(0.5, 0.5, false));
window.addEventListener('blur', () => {
  cancelDemo();
  for (const vk of pressed) engine.onKeyUp(vk);
  pressed.clear();
  for (const button of ['left', 'right', 'middle'] as const) engine.onMouseUp(button);
  engine.onWindowCursor(0.5, 0.5, false);
});

// ---- Control panel ---------------------------------------------------------

const panel = document.getElementById('panel') as HTMLDivElement | null;
let soundEnabled = true;
const demoTimers = new Set<number>();
const demoKeys = new Set<number>();
let demoMouse = false;
let demoTail: { mode: typeof engine.tailKeyConfig.mode; ids: string[] } | null = null;

function cancelDemo(): void {
  for (const timer of demoTimers) window.clearTimeout(timer);
  demoTimers.clear();
  for (const vk of demoKeys) if (!pressed.has(vk)) engine.onKeyUp(vk);
  demoKeys.clear();
  if (demoMouse) engine.onMouseUp('left');
  demoMouse = false;
  if (demoTail) engine.setTailKeyConfig(demoTail.mode, demoTail.ids);
  demoTail = null;
}
function demoAfter(ms: number, fn: () => void): void {
  const timer = window.setTimeout(() => { demoTimers.delete(timer); fn(); }, ms);
  demoTimers.add(timer);
}
function playInputDemo(kind: string): void {
  engine.stopCurrentAction();
  engine.setIdleAutoEnabled(false);
  (document.getElementById('harness-auto') as HTMLInputElement).checked = false;
  demoTail = { mode: engine.tailKeyConfig.mode, ids: [...engine.tailKeyConfig.ids] };
  engine.setTailKeyConfig(kind === 'foot' ? 'custom' : 'off', kind === 'foot' ? ['space'] : []);
  if (kind === 'mouse') {
    demoMouse = true; engine.onMouseDown('left');
    demoAfter(650, () => { engine.onMouseUp('left'); demoMouse = false; });
  } else {
    const keys = kind === 'foot' ? [32, 32] : [65, 70, 74, 76, 80, 32];
    keys.forEach((vk, i) => {
      demoAfter(i * 380, () => { demoKeys.add(vk); engine.onKeyDown(vk, false); });
      demoAfter(i * 380 + 220, () => { demoKeys.delete(vk); engine.onKeyUp(vk); });
    });
  }
  setStatus(kind === 'mouse' ? '演示点鼠标：观察手臂侧伸和回弹' : kind === 'foot'
    ? '演示原尾巴按键：奶蛙侧身伸脚，完成后恢复原按键设置' : '演示双手敲键：观察手臂随接触位置伸缩');
  demoAfter(kind === 'keys' ? 3000 : 1700, () => { cancelDemo(); setStatus('演示完成，可继续敲键、点鼠标或切换动作'); });
}

function isPanelTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && panel?.contains(t) === true;
}

function setStatus(text: string): void {
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = text;
}

function buildPanel(): void {
  if (!panel) return;
  panel.innerHTML = `
    <div class="row"><strong>DIY-Cat 预览</strong><span id="status" class="status" role="status" aria-live="polite">敲键盘、点鼠标、抚摸头部或点击饮品</span></div>
    <div class="row">
      <label>模型</label><span id="cats"></span>
    </div>
    <div class="row"><span id="rig-info" class="status"></span>
    </div>
    <div class="row">
      <label>配列</label>
      <button data-layout="65">65%</button><button data-layout="108">108</button>
      <label>键盘朝向</label>
      <button data-orient="cat">面向猫咪</button><button data-orient="viewer">面向观众</button>
    </div>
    <div class="row">
      <label>鼠标朝向</label>
      <button data-mouse="auto">跟随</button><button data-mouse="cat">面向猫咪</button><button data-mouse="viewer">面向观众</button>
    </div>
    <div class="row">
      <label>键盘尺寸</label>
      <input type="range" id="kbscale" min="70" max="100" step="1" />
      <span id="kbscale-v" class="val"></span>
    </div>
    <div class="row">
      <label>外观</label><span id="skins"></span>
    </div>
    <div class="row">
      <label>灯光</label><span id="effects"></span>
    </div>
    <div class="row">
      <label>颜色</label><span id="colors"></span>
      <label>亮度</label><input type="range" id="bright" min="10" max="100" step="5" /><span id="bright-v" class="val"></span>
    </div>
    <div class="row">
      <label>输入演示</label>
      <button data-demo="keys">双手敲键</button><button data-demo="mouse">点鼠标</button>
      <button data-demo="foot">原尾巴按键</button>
    </div>
    <div class="row">
      <label>动作与表情</label>
      <button data-idle="drink">🥤 喝一口</button>
      <button data-idle="stretch">🙆 伸懒腰</button>
      <button data-idle="wave">👋 挥手</button>
      <button data-idle="groom">👅 洗脸</button>
      <button data-idle="nap">😴 打盹</button>
      <button data-idle="cuddle">💗 撒娇</button>
      <button data-idle="tilt">歪头看你</button>
      <button data-idle="slowBlink">慢眨眼</button>
      <button data-idle="frogHop">蓄力小跳</button>
      <button data-idle="frogCroak">鼓腮吐气</button>
      <button data-idle="bellyPat">拍拍肚皮</button>
      <button data-idle="frogSway">左右晃身</button>
      <button data-idle="frogPeek">好奇探头</button>
      <button data-idle="footSwing">交替摆脚</button>
      <button data-idle="tailGround">拍地抗议</button>
      <button data-idle="calm">安抚起床气</button>
      <button data-idle="stop">停止动作</button>
    </div>
    <div class="row">
      <label for="harness-auto">随机待机</label><input id="harness-auto" type="checkbox" ${params.get('idle') === '0' ? '' : 'checked'} />
      <button id="pet-sound" data-sound="toggle" aria-pressed="true">宠物声音：开</button>
    </div>
    <div class="row">
      <label>键帽DIY</label><span id="diy"></span>
    </div>
    <div class="row">
      <label>道具</label><span id="props"></span>
      <label>侧</label><button data-side="left">左</button><button data-side="right">右</button>
    </div>
  `;

  panel.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!t) return;
    cancelDemo();
    catAudio.unlock();
    if (t.dataset.demo) {
      playInputDemo(t.dataset.demo);
    } else if (t.dataset.cat) {
      const found = DEFAULT_BUILTIN_CATS.find((c) => c.id === t.dataset.cat) ?? null;
      currentCatId = found?.id ?? 'black';
      engine.setCatAppearance(currentCatId, found);
      applyLayout();
    } else if (t.dataset.layout) {
      layout = t.dataset.layout === '108' ? '108' : '65';
      kbs = layout === '108' ? 0.85 : 1;
      applyLayout();
    } else if (t.dataset.orient) {
      orient = t.dataset.orient === 'viewer' ? 'viewer' : 'cat';
      applyLayout();
    } else if (t.dataset.mouse) {
      mouse = t.dataset.mouse as MouseOrientation;
      applyLayout();
    } else if (t.dataset.skin) {
      const found = BUILTIN_DESK_SKINS.find((s) => s.id === t.dataset.skin);
      if (found) engine.setDeskSkin(found);
      syncPanel();
    } else if (t.dataset.effect) {
      const cur = engine.getLightConfig();
      engine.setLightConfig({ ...cur, enabled: t.dataset.effect !== 'off', effect: t.dataset.effect });
      syncPanel();
    } else if (t.dataset.color) {
      engine.setLightConfig({ ...engine.getLightConfig(), color: t.dataset.color });
      syncPanel();
    } else if (t.dataset.kind) {
      const cur = engine.getPropConfig();
      engine.setPropConfig({ ...cur, enabled: true, kind: t.dataset.kind });
      applyLayout();
    } else if (t.dataset.side) {
      propSide = t.dataset.side === 'left' ? 'left' : 'right';
      engine.setPropConfig({ ...engine.getPropConfig(), side: propSide });
      applyLayout();
    } else if (t.dataset.sound) {
      soundEnabled = !soundEnabled; catAudio.setEnabled(soundEnabled); syncPanel();
    } else if (t.dataset.idle) {
      const kind = t.dataset.idle;
      if (kind !== 'calm') engine.stopCurrentAction();
      if (kind === 'stop') {
        engine.setIdleAutoEnabled(false);
        (document.getElementById('harness-auto') as HTMLInputElement).checked = false;
        setStatus('已停止动作和随机待机');
      } else {
        const started = engine.triggerIdleAction(kind, true);
        setStatus(started ? `正在演示：${t.textContent}` : '当前状态无法触发，请稍后再试');
      }
      syncPanel();
    } else if (t.dataset.diy) {
      const map: Record<string, string> = {
        wasd: 'wasd', numpad: 'numpad', esc: 'esc', emoji: 'emoji',
      };
      if (t.dataset.diy === 'clear') {
        engine.setKeycapOverrides({});
      } else if (map[t.dataset.diy]) {
        engine.setKeycapOverrides({ ...engine.getKeycapOverrides(), ...HARNESS_DIY[t.dataset.diy] });
      }
      syncPanel();
    }
  });

  const kbSlider = document.getElementById('kbscale') as HTMLInputElement;
  kbSlider.addEventListener('input', () => {
    kbs = Number(kbSlider.value) / 100;
    applyLayout();
  });

  const bright = document.getElementById('bright') as HTMLInputElement;
  bright.addEventListener('input', () => {
    engine.setLightConfig({ ...engine.getLightConfig(), brightness: Number(bright.value) / 100 });
    const v = document.getElementById('bright-v');
    if (v) v.textContent = `${bright.value}%`;
  });

  document.getElementById('harness-auto')?.addEventListener('change', e => {
    cancelDemo();
    engine.setIdleAutoEnabled((e.target as HTMLInputElement).checked);
  });
  syncPanel();
}

function syncPanel(): void {
  if (!panel) return;
  const cat = DEFAULT_BUILTIN_CATS.find(c => c.id === currentCatId);
  const actions = modelActions(cat, '2d');
  panel.querySelectorAll<HTMLButtonElement>('[data-idle]').forEach(button => {
    const action = button.dataset.idle!;
    if (action === 'stop') return;
    button.hidden = !actions.includes(action);
    button.textContent = modelRig(cat) === 'naiwa' && action === 'tailGround'
      ? '嘴边鼓腮 · 跺脚' : modelActionLabel(cat, action);
  });
  const rigInfo = document.getElementById('rig-info');
  if (rigInfo) rigInfo.textContent = modelRig(cat) === 'naiwa'
    ? '奶蛙 · 坐着打盹，闭眼点头并流口水；试试左右晃身、好奇探头、交替摆脚。睡觉后敲键可测试起床气，抚摸可安抚。普通输入用手，原尾巴按键用脚；奶蛙互动无专属音效。'
    : '打盹后敲键可测试起床气；点击动作按钮可逐个预览。';
  const sound = document.getElementById('pet-sound');
  if (sound) {
    sound.hidden = modelRig(cat) === 'naiwa';
    sound.textContent = `宠物声音：${soundEnabled ? '开' : '关'}`;
    sound.setAttribute('aria-pressed', String(soundEnabled));
  }
  const size = engine.getLogicalSize();
  const kbSlider = document.getElementById('kbscale') as HTMLInputElement | null;
  if (kbSlider) {
    kbSlider.min = layout === '108' ? '70' : '70';
    kbSlider.max = layout === '108' ? '100' : '115';
    kbSlider.value = String(Math.round(kbs * 100));
    const v = document.getElementById('kbscale-v');
    if (v) v.textContent = `${Math.round(kbs * 100)}%`;
  }

  panel.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach((b) =>
    b.classList.toggle('active', b.dataset.layout === layout),
  );
  panel.querySelectorAll<HTMLButtonElement>('[data-orient]').forEach((b) =>
    b.classList.toggle('active', b.dataset.orient === orient),
  );
  panel.querySelectorAll<HTMLButtonElement>('[data-mouse]').forEach((b) =>
    b.classList.toggle('active', b.dataset.mouse === mouse),
  );

  const cats = document.getElementById('cats');
  if (cats) {
    cats.innerHTML = DEFAULT_BUILTIN_CATS.map(
      (c) =>
        `<button data-cat="${c.id}" class="${currentCatId === c.id ? 'active' : ''}">${c.emoji ?? '🐱'} ${c.name}</button>`,
    ).join('');
  }

  const skins = document.getElementById('skins');  if (skins) {
    skins.innerHTML = BUILTIN_DESK_SKINS.map(
      (s) =>
        `<button data-skin="${s.id}" class="${engine.getDeskSkin().id === s.id ? 'active' : ''}" style="border-left:3px solid ${s.keyboard.accentKeyTop}">${s.name}</button>`,
    ).join('');
  }

  const effects = document.getElementById('effects');
  if (effects) {
    const cur = engine.getLightConfig();
    effects.innerHTML = LIGHT_EFFECTS.map(
      (e) =>
        `<button data-effect="${e.id}" class="${cur.enabled && cur.effect === e.id ? 'active' : ''}">${e.label}</button>`,
    ).join('');
  }

  const colors = document.getElementById('colors');
  if (colors) {
    const cur = engine.getLightConfig();
    const palette = ['#d2f244', '#00e5ff', '#ff00a8', '#ff9a3c', '#7ee8a6', '#a78bfa', '#ffffff'];
    colors.innerHTML = palette
      .map(
        (c) =>
          `<button data-color="${c}" class="swatch ${cur.color.toLowerCase() === c ? 'active' : ''}" style="background:${c}" title="${c}"></button>`,
      )
      .join('');
  }

  const props = document.getElementById('props');
  if (props) {
    const cur = engine.getPropConfig();
    props.innerHTML = PROP_KINDS.map(
      (k) =>
        `<button data-kind="${k.id}" class="${cur.enabled && cur.kind === k.id ? 'active' : ''}" title="${k.moodLabel}">${k.emoji}${k.label}</button>`,
    ).join('');
  }

  const diy = document.getElementById('diy');
  if (diy) {
    const active = Object.keys(engine.getKeycapOverrides()).length > 0;
    diy.innerHTML = [
      `<button data-diy="wasd">WASD</button>`,
      `<button data-diy="numpad">数字</button>`,
      `<button data-diy="esc">Esc🚨</button>`,
      `<button data-diy="emoji">表情</button>`,
      `<button data-diy="clear" class="${active ? '' : 'active'}">清除</button>`,
    ].join('');
  }
  panel.querySelectorAll<HTMLButtonElement>('[data-side]').forEach((b) =>
    b.classList.toggle('active', b.dataset.side === propSide),
  );

  const bright = document.getElementById('bright') as HTMLInputElement | null;
  if (bright) bright.value = String(Math.round(engine.getLightConfig().brightness * 100));
  const bv = document.getElementById('bright-v');
  if (bv) bv.textContent = `${Math.round(engine.getLightConfig().brightness * 100)}%`;

  document.title = `DIY-Cat Harness ${size.w}x${size.h}`;
}

(document.getElementById('reference-image') as HTMLImageElement).src = naiwaReferenceUrl;
(document.getElementById('reference-link') as HTMLAnchorElement).href = naiwaReferenceUrl;
buildVkTable();
buildPanel();
applyLayout();
engine.start();
window.addEventListener('resize', applyLayout);

(window as unknown as Record<string, unknown>).__engine = engine;
(window as unknown as Record<string, unknown>).__logical = engine.getLogicalSize();
