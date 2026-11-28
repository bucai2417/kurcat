import { KuroCatEngine3D } from './catEngine3d';
import { parseModelPack } from './modelPack';
import { encodeGlb, resolveGlbAsset } from './glbModel';
import { DEFAULT_PROP, PROP_KINDS, type PropKind } from './prop';
import type { KeyboardLayoutId } from './keyboardLayout';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const viewport = element<HTMLDivElement>('viewport');
const loading = element<HTMLDivElement>('loading');
const status = element<HTMLParagraphElement>('status');
const play = element<HTMLButtonElement>('play');
const typing = element<HTMLInputElement>('typing');
const autoIdle = element<HTMLInputElement>('auto-idle');
const prop = element<HTMLSelectElement>('prop-kind');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const canvas = document.createElement('canvas');
canvas.tabIndex = 0;
canvas.setAttribute('aria-label', '奶蛙桌面互动，聚焦后可用键盘输入');
viewport.prepend(canvas);
for (const kind of PROP_KINDS) prop.add(new Option(kind.label, kind.id));
prop.value = 'coffee';
let engine: KuroCatEngine3D | undefined;
let ready = false;
let playing = !reducedMotion.matches;
let dragging: { id: number; x: number; y: number } | undefined;
const pressed = new Set<number>();
const mouseButtons = new Set<string>();
const running = () => ready && playing && !document.hidden;
function releaseMouse() {
  for (const button of mouseButtons) engine?.onMouseUp(button);
  mouseButtons.clear(); dragging = undefined;
}
function release() {
  for (const key of pressed) engine?.onKeyUp(key);
  pressed.clear(); releaseMouse();
}
function playback() {
  release();
  if (running()) engine?.start(); else engine?.stop();
  play.textContent = playing ? '暂停预览' : '继续预览';
  play.setAttribute('aria-pressed', String(!playing));
  status.textContent = playing ? '互动已开启：移动鼠标、打字或选择一个动作。' : '预览已暂停，点击“继续预览”后可互动。';
}
function configureProp() {
  engine?.setPropConfig({ ...DEFAULT_PROP, enabled: true, autoSip: false, kind: prop.value as PropKind });
}
function error(message: string) {
  ready = false; engine?.stop(); release(); loading.hidden = false;
  element('load-message').textContent = message;
  element('retry').hidden = false;
  for (const control of document.querySelectorAll<HTMLFieldSetElement>('aside fieldset')) control.disabled = true;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) button.disabled = true;
  typing.disabled = play.disabled = true;
  status.textContent = '预览暂不可用。可重新加载，或下载模型到 DIY-Cat 中查看。';
}
async function startPreview() {
  engine = new KuroCatEngine3D(canvas, { embedded: true });
  engine.setIdleAutoEnabled(false); engine.setMoodTrackingEnabled(true);
  const [manifest, binary] = await Promise.all([
    fetch(new URL('../model-store/naiwa-3d.kurocat.json', import.meta.url)),
    fetch(new URL('../art/naiwa/naiwa.glb', import.meta.url)),
  ]);
  if (!manifest.ok || !binary.ok) throw Error('模型文件读取失败，请通过项目开发服务器打开预览');
  const pack = parseModelPack({ ...await manifest.json(), asset: { data: encodeGlb(new Uint8Array(await binary.arrayBuffer())) } });
  await resolveGlbAsset(pack.profile.glb!, pack.asset, true);
  engine.setKeyboardConfig('65', 'cat'); configureProp();
  await engine.snapshot(pack.skin);
  ready = true; loading.hidden = true;
  for (const control of document.querySelectorAll<HTMLFieldSetElement>('aside fieldset')) control.disabled = false;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) button.disabled = false;
  typing.disabled = play.disabled = false; playback();
}
play.addEventListener('click', () => { playing = !playing; playback(); });
prop.addEventListener('change', configureProp);
element('layout').addEventListener('change', event => engine?.setKeyboardConfig((event.target as HTMLSelectElement).value as KeyboardLayoutId, 'cat'));
autoIdle.addEventListener('change', () => engine?.setIdleAutoEnabled(autoIdle.checked));
element('use-prop').addEventListener('click', () => {
  if (!running()) { status.textContent = '请先点击“继续预览”。'; return; }
  const result = engine!.clickProp();
  status.textContent = result === 'busy' ? '等当前动作结束后，再试一次。' : result === 'refilled' ? '已补充道具，再点一次即可享用。' : '拿起、享用，再放回桌面。';
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) button.addEventListener('click', () => {
  if (!running()) { status.textContent = '请先点击“继续预览”。'; return; }
  if (button.dataset.action === 'curious') engine!.triggerCuriousDemo();
  else engine!.triggerIdleAction(button.dataset.action!, true);
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) button.addEventListener('click', () => {
  engine!.resetOrbit();
  if (button.dataset.view === 'left') engine!.addOrbitDelta(-75, 0);
  if (button.dataset.view === 'right') engine!.addOrbitDelta(75, 0);
  if (button.dataset.view === 'front') engine!.addOrbitDelta(0, -12);
});
// The preview only observes keys while its canvas or typing field is focused.
function virtualKey(event: KeyboardEvent): number | undefined {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.charCodeAt(3);
  if (/^Digit[0-9]$/.test(event.code)) return 48 + Number(event.code.slice(5));
  if (/^Numpad[0-9]$/.test(event.code)) return 96 + Number(event.code.slice(6));
  const keys: Record<string, number> = { Space: 32, Enter: 13, NumpadEnter: 0x10d, Backspace: 8,
    ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Comma: 188, Period: 190,
    Slash: 191, Semicolon: 186, Quote: 222, Minus: 189, Equal: 187, BracketLeft: 219, BracketRight: 221, Backslash: 220 };
  return keys[event.code];
}
document.addEventListener('keydown', event => {
  if (!running() || event.ctrlKey || event.metaKey || event.altKey || (document.activeElement !== typing && document.activeElement !== canvas)) return;
  const vk = virtualKey(event); if (vk == null) return;
  pressed.add(vk); engine!.onKeyDown(vk, event.repeat);
  if (document.activeElement === canvas) event.preventDefault();
});
document.addEventListener('keyup', event => {
  const vk = virtualKey(event); if (vk != null && pressed.delete(vk)) engine?.onKeyUp(vk);
});
typing.addEventListener('blur', release); canvas.addEventListener('blur', release);
document.addEventListener('pointermove', event => {
  if (!running()) return;
  if (dragging?.id === event.pointerId) {
    engine!.addOrbitDelta((event.clientX - dragging.x) * .4, (event.clientY - dragging.y) * .25);
    dragging.x = event.clientX; dragging.y = event.clientY; return;
  }
  const rect = canvas.getBoundingClientRect();
  const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  engine!.onPointerMove(event.clientX, event.clientY, inside, element<HTMLInputElement>('petting').checked);
});
canvas.addEventListener('pointerdown', event => {
  if (!running()) return;
  canvas.focus();
  if (event.shiftKey) { dragging = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); return; }
  if (engine!.hitTestProp(event.clientX, event.clientY)) { engine!.clickProp(); return; }
  const button = ['left', 'middle', 'right'][event.button];
  if (button) { mouseButtons.add(button); engine!.onMouseDown(button); }
});
document.addEventListener('pointerup', releaseMouse); canvas.addEventListener('pointercancel', releaseMouse);
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('wheel', () => { if (running()) engine!.onMouseWheel(); }, { passive: true });
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); error('图形上下文中断，请重新加载预览。'); });
element('retry').addEventListener('click', () => location.reload());
const resize = new ResizeObserver(() => engine?.resize()); resize.observe(viewport);
window.addEventListener('blur', release);
document.addEventListener('visibilitychange', playback);
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) { playing = false; autoIdle.checked = false; engine?.setIdleAutoEnabled(false); playback(); }
});
window.addEventListener('pagehide', () => { release(); engine?.stop(); resize.disconnect(); });
void startPreview().catch(cause => error(cause instanceof Error ? cause.message : '无法启动 3D 预览，请检查浏览器硬件加速设置。'));
