import { installTauriPreviewShim } from './tauriPreview';

// Must run before any @tauri-apps/api call is issued.
const isPreview = installTauriPreviewShim();

import './style.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { KuroCatEngine, type KeyboardOrientation } from './catEngine';
import { catAudio } from './audio';
import { DEFAULT_BUILTIN_CATS, type CatSkinConfig } from './catSkins';
import type { KeyboardLayoutId } from './keyboardLayout';
import { getKeyboardLayout } from './keyboardLayout';
import {
  clampKeyboardScale,
  defaultKeyboardScale,
  DEFAULT_KB_SCALE_108,
  DEFAULT_KB_SCALE_65,
  type MouseOrientation,
} from './deskMetrics';
import {
  DEFAULT_LIGHT,
  LIGHT_COLOR_MODES,
  LIGHT_EFFECTS,
  LIGHT_PRESETS,
  normalizeLightConfig,
  type KeyboardLightConfig,
  type LightColorMode,
  type LightEffect,
} from './keyboardLight';

import {
  BUILTIN_DESK_SKINS,
  normalizeDeskSkin,
  type DeskSkinConfig,
  type KeycapOverride,
} from './deskSkin';

import {
  DEFAULT_PROP,
  PROP_KINDS,
  PROP_SIDES,
  normalizePropConfig,
  type PropConfig,
  type PropKind,
  type PropSide,
} from './prop';
interface AppSettings {
  x: number | null;
  y: number | null;
  scale: number;
  alwaysOnTop: boolean;
  clickThroughLocked: boolean;
  showKeyBubbles: boolean;
  soundEnabled: boolean;
  autostart: boolean;
  catBreed: string;
  mcpEnabled: boolean;
  mcpPort: number;
  keyboardLayout: KeyboardLayoutId;
  keyboardOrientation: KeyboardOrientation;
  keyboardScale65: number;
  keyboardScale108: number;
  mouseOrientation: MouseOrientation;
  keyboardLight: KeyboardLightConfig;
  deskSkinId: string;
  deskSkins: DeskSkinConfig[];
  propConfig: PropConfig;
  keycapOverrides: Record<string, KeycapOverride>;
  idleActionsEnabled: boolean;
  idleActionRequest: string;
  idleActionSeq: number;
  moodTrackingEnabled: boolean;
  moodAnnoyanceRequest: number;
  moodDizzyRequest: number;
  moodSeq: number;
  privacyPasswordGuard: boolean;
}

type InputEvent =
  | { kind: 'keyDown'; vk: number; scan: number; repeat: boolean }
  | { kind: 'keyUp'; vk: number; scan: number }
  | { kind: 'mouseDown'; button: string }
  | { kind: 'mouseUp'; button: string }
  | { kind: 'mouseWheel'; delta: number }
  | { kind: 'mouseMove'; x: number; y: number; nx: number; ny: number }
  | { kind: 'privacyTyping' };

interface WindowCursorInfo {
  relX: number;
  relY: number;
  insideWindow: boolean;
  overCat: boolean;
  altOverride?: boolean;
}

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  assetName: string | null;
  downloadUrl: string | null;
  assetSha256: string | null;
  assetSize: number | null;
  installKind: string;
  notesSummary: string;
}

interface UpdateProgressEvent {
  stage: string;
  message: string;
  info: UpdateInfo | null;
}

let appVersion = '4.8.0';
let latestUpdateInfo: UpdateInfo | null = null;
let updateBusy = false;
let dismissedVersion: string | null = null;
let toastAutoHideTimer: number | null = null;
let sliderDragging = false;
let altOverride = false;
let lastKnownLockState: boolean | null = null;
let syncWin7OverlayFn: ((focusMenu?: boolean) => void) | null = null;

let settings: AppSettings = {
  x: null,
  y: null,
  scale: 1,
  alwaysOnTop: true,
  clickThroughLocked: false,
  showKeyBubbles: true,
  soundEnabled: true,
  autostart: false,
  catBreed: 'black',
  mcpEnabled: true,
  mcpPort: 27420,
  keyboardLayout: '65',
  keyboardOrientation: 'cat',
  keyboardScale65: DEFAULT_KB_SCALE_65,
  keyboardScale108: DEFAULT_KB_SCALE_108,
  mouseOrientation: 'auto',
  keyboardLight: { ...DEFAULT_LIGHT },
  deskSkinId: 'classic-cream',
  deskSkins: [...BUILTIN_DESK_SKINS],
  propConfig: { ...DEFAULT_PROP },
  keycapOverrides: {},
  idleActionsEnabled: true,
  idleActionRequest: '',
  idleActionSeq: 0,
  moodTrackingEnabled: true,
  moodAnnoyanceRequest: -1,
  moodDizzyRequest: -1,
  moodSeq: 0,
  privacyPasswordGuard: true,
};

let catList: CatSkinConfig[] = [...DEFAULT_BUILTIN_CATS];

const canvas = document.getElementById('pet-canvas') as HTMLCanvasElement;
const menuEl = document.getElementById('context-menu') as HTMLDivElement;
const breedPillsEl = document.getElementById('breed-pills') as HTMLDivElement;
const scaleSliderEl = document.getElementById('scale-slider') as HTMLInputElement;
const scaleValueEl = document.getElementById('scale-value') as HTMLButtonElement;
const updateToastEl = document.getElementById('update-toast') as HTMLDivElement;
const updateToastTextEl = document.getElementById('update-toast-text') as HTMLSpanElement;
const btnToastInstallEl = document.getElementById('btn-toast-install') as HTMLButtonElement;
const btnToastOpenEl = document.getElementById('btn-toast-open') as HTMLButtonElement;
const btnToastCloseEl = document.getElementById('btn-toast-close') as HTMLButtonElement;
const engine = new KuroCatEngine(canvas, { embedded: isPreview });

if (isPreview) {
  // Browser preview: the canvas fills the viewport, so re-fit on resize.
  window.addEventListener('resize', () => engine.resize());
  // Handy hook for manual testing in DevTools.
  (window as unknown as Record<string, unknown>).__kurocatEngine = engine;
}

/**
 * `listen()` throws synchronously when the Tauri event bridge is absent (plain
 * browser preview). Swallow that so the rest of the UI still initialises.
 */
async function safeListen<T>(event: string, cb: (ev: { payload: T }) => void): Promise<void> {
  try {
    await (listen as unknown as (
      name: string,
      handler: (ev: { payload: T }) => void,
    ) => Promise<unknown>)(event, cb);
  } catch {
    // No Tauri IPC (browser preview); events simply never fire.
  }
}

function renderBreedPills(): void {
  if (!breedPillsEl) return;
  breedPillsEl.innerHTML = '';
  for (const cat of catList) {
    const btn = document.createElement('button');
    btn.className = 'breed-pill';
    btn.dataset.breed = cat.id;
    const emoji = cat.emoji ? `${cat.emoji} ` : '🐱 ';
    btn.textContent = `${emoji}${cat.name}`;
    const accent = cat.accentColor || (cat.id === 'ragdoll' ? '#7ac7ff' : '#c8f538');
    btn.style.setProperty('--pill-accent', accent);
    btn.classList.toggle('active', cat.id === settings.catBreed);
    breedPillsEl.appendChild(btn);
  }
}

function updateScaleSliderVisual(scaleVal: number): void {
  const pctNum = Math.round(Math.max(20, Math.min(150, scaleVal * 100)));
  if (scaleSliderEl) {
    scaleSliderEl.value = String(pctNum);
    const fillPct = ((pctNum - 20) / (150 - 20)) * 100;
    scaleSliderEl.style.setProperty('--pct', `${fillPct.toFixed(1)}%`);
  }
  if (scaleValueEl) {
    scaleValueEl.textContent = `${pctNum}%`;
  }
}

const kbScaleSliderEl = document.getElementById('kb-scale-slider') as HTMLInputElement | null;
const kbScaleValueEl = document.getElementById('kb-scale-value') as HTMLButtonElement | null;

function kbScaleRange(layout: KeyboardLayoutId): { min: number; max: number } {
  return layout === '108' ? { min: 70, max: 100 } : { min: 70, max: 115 };
}

function updateKbScaleVisual(layout: KeyboardLayoutId, scale: number): void {
  if (!kbScaleSliderEl) return;
  const { min, max } = kbScaleRange(layout);
  const pct = Math.round(scale * 100);
  kbScaleSliderEl.min = String(min);
  kbScaleSliderEl.max = String(max);
  if (document.activeElement !== kbScaleSliderEl) kbScaleSliderEl.value = String(pct);
  const fillPct = ((pct - min) / (max - min)) * 100;
  kbScaleSliderEl.style.setProperty('--pct', `${Math.max(0, Math.min(100, fillPct)).toFixed(1)}%`);
  if (kbScaleValueEl) kbScaleValueEl.textContent = `${pct}%`;
}

const lightToggleBtnEl = document.getElementById('light-toggle-btn') as HTMLButtonElement | null;
const lightSwatchesEl = document.getElementById('light-swatches') as HTMLDivElement | null;
const lightColorModePillsEl = document.getElementById('light-color-mode-pills') as HTMLDivElement | null;
const lightPaletteSwatchesEl = document.getElementById('light-palette-swatches') as HTMLDivElement | null;
const lightBrightnessEl = document.getElementById('light-brightness') as HTMLInputElement | null;
const lightBrightnessValueEl = document.getElementById(
  'light-brightness-value',
) as HTMLSpanElement | null;
const lightSpeedEl = document.getElementById('light-speed') as HTMLInputElement | null;
const lightSpeedValueEl = document.getElementById('light-speed-value') as HTMLSpanElement | null;

const LIGHT_COLOR_PRESETS = [
  '#d2f244',
  '#00e5ff',
  '#ff00a8',
  '#ff9a3c',
  '#7ee8a6',
  '#a78bfa',
  '#ffffff',
];

function currentLight(): KeyboardLightConfig {
  return normalizeLightConfig(settings.keyboardLight);
}

function patchLight(patch: Partial<KeyboardLightConfig>): void {
  const next = normalizeLightConfig({ ...currentLight(), ...patch });
  void applySettingsPatch({ keyboardLight: next });
}

function renderLightSwatches(): void {
  if (!lightSwatchesEl) return;
  const cfg = currentLight();
  lightSwatchesEl.innerHTML = '';
  for (const color of LIGHT_COLOR_PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'light-swatch';
    btn.style.background = color;
    btn.title = color;
    btn.dataset.lightcolor = color;
    btn.classList.toggle('active', cfg.color.toLowerCase() === color.toLowerCase());
    lightSwatchesEl.appendChild(btn);
  }
  const custom = document.createElement('label');
  custom.className = 'light-swatch';
  custom.title = '自定义颜色';
  custom.style.background =
    'conic-gradient(#ff4d4d, #ffd93d, #6bff6b, #4dd2ff, #a78bfa, #ff4d4d)';
  const input = document.createElement('input');
  input.type = 'color';
  input.value = cfg.color;
  input.addEventListener('input', () => patchLight({ color: input.value }));
  custom.appendChild(input);
  lightSwatchesEl.appendChild(custom);
}

const deskSkinPillsEl = document.getElementById('desk-skin-pills') as HTMLDivElement | null;

/** Ready-made DIY keycap palettes so users can try the feature in one click. */
const KEYCAP_DIY_PRESETS: Record<string, Record<string, KeycapOverride>> = {
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
    '7': { top: '#ff6bd6', side: '#c02a9b', text: '#ffffff' },
    '8': { top: '#7ee8a6', side: '#3aa666', text: '#14201a' },
    '9': { top: '#6b8bff', side: '#3f59c9', text: '#ffffff' },
    '0': { top: '#ffe14d', side: '#c9a900', text: '#241f00' },
    np_7: { top: '#6b8bff', side: '#3f59c9', text: '#ffffff' },
    np_8: { top: '#7ee8a6', side: '#3aa666', text: '#14201a' },
    np_9: { top: '#ffe14d', side: '#c9a900', text: '#241f00' },
    np_4: { top: '#c56bff', side: '#8a3fc0', text: '#ffffff' },
    np_5: { top: '#00e5ff', side: '#008fa8', text: '#002027' },
    np_6: { top: '#ff9a3c', side: '#c96a12', text: '#241400' },
    np_1: { top: '#ff6bd6', side: '#c02a9b', text: '#ffffff' },
    np_2: { top: '#7ee8a6', side: '#3aa666', text: '#14201a' },
    np_3: { top: '#6b8bff', side: '#3f59c9', text: '#ffffff' },
    np_0: { top: '#ffe14d', side: '#c9a900', text: '#241f00' },
  },
  esc: {
    esc: { top: '#ff3b6b', side: '#b3224a', emoji: '🚨' },
  },
  arrows: {
    up: { top: '#ff9a3c', side: '#c96a12', text: '#241400' },
    down: { top: '#ff9a3c', side: '#c96a12', text: '#241400' },
    left: { top: '#ff9a3c', side: '#c96a12', text: '#241400' },
    right: { top: '#ff9a3c', side: '#c96a12', text: '#241400' },
  },
  emoji: {
    esc: { emoji: '🔥' },
    tab: { emoji: '🎵' },
    caps: { emoji: '🎮' },
    space: { emoji: '🐾' },
    enter: { emoji: '⏎' },
  },
};

function allDeskSkins(): DeskSkinConfig[] {
  const custom = Array.isArray(settings.deskSkins) ? settings.deskSkins : [];
  const merged = [...BUILTIN_DESK_SKINS];
  for (const c of custom) {
    const norm = normalizeDeskSkin(c);
    const idx = merged.findIndex((s) => s.id === norm.id);
    if (idx >= 0) merged[idx] = { ...norm, builtin: merged[idx].builtin };
    else merged.push(norm);
  }
  return merged;
}

function activeDeskSkin(): DeskSkinConfig {
  const list = allDeskSkins();
  return list.find((s) => s.id === settings.deskSkinId) ?? list[0];
}

function renderDeskSkinPills(): void {
  if (!deskSkinPillsEl) return;
  deskSkinPillsEl.innerHTML = '';
  for (const skin of allDeskSkins()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kb-pill';
    btn.dataset.deskskin = skin.id;
    btn.textContent = skin.name;
    btn.style.borderLeft = `3px solid ${skin.keyboard.accentKeyTop}`;
    btn.classList.toggle('active', skin.id === settings.deskSkinId);
    deskSkinPillsEl.appendChild(btn);
  }
}

const propKindPillsEl = document.getElementById('prop-kind-pills') as HTMLDivElement | null;
const propSidePillsEl = document.getElementById('prop-side-pills') as HTMLDivElement | null;
const propAutoSipEl = document.getElementById('prop-auto-sip') as HTMLInputElement | null;

function currentProp(): PropConfig {
  return normalizePropConfig(settings.propConfig);
}

function patchProp(patch: Partial<PropConfig>): void {
  const next = normalizePropConfig({ ...currentProp(), ...patch });
  void applySettingsPatch({ propConfig: next });
}

function renderPropUI(): void {
  const cfg = currentProp();
  if (propKindPillsEl) {
    propKindPillsEl.innerHTML = '';
    for (const kind of PROP_KINDS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kb-pill';
      btn.dataset.propkind = kind.id;
      btn.title = `喝完后：${kind.moodLabel}`;
      btn.textContent = `${kind.emoji} ${kind.label}`;
      btn.classList.toggle('active', cfg.kind === kind.id);
      propKindPillsEl.appendChild(btn);
    }
  }
  if (propSidePillsEl) {
    propSidePillsEl.innerHTML = '';
    for (const side of PROP_SIDES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kb-pill';
      btn.dataset.propside = side.id;
      btn.textContent = side.label;
      btn.classList.toggle('active', cfg.side === side.id);
      propSidePillsEl.appendChild(btn);
    }
  }
  if (propAutoSipEl) propAutoSipEl.checked = cfg.autoSip;
  const toggleBtn = document.getElementById('prop-toggle-btn');
  if (toggleBtn) {
    toggleBtn.textContent = cfg.enabled ? '已开启' : '关闭';
    toggleBtn.classList.toggle('on', cfg.enabled);
  }
}

const PALETTE_CANDIDATES = [
  '#ff3b6b',
  '#ff9a3c',
  '#ffe14d',
  '#7ee8a6',
  '#00e5ff',
  '#6b8bff',
  '#c56bff',
  '#ff6bd6',
  '#ffffff',
  '#111214',
];

function renderLightColorControls(): void {
  const cfg = currentLight();
  if (lightColorModePillsEl) {
    lightColorModePillsEl.innerHTML = LIGHT_COLOR_MODES.map(
      (m) =>
        `<button class="kb-pill ${cfg.colorMode === m.id ? 'active' : ''}" data-lightmode="${m.id}">${m.label}</button>`,
    ).join('');
  }
  if (lightPaletteSwatchesEl) {
    lightPaletteSwatchesEl.innerHTML = PALETTE_CANDIDATES.map((c) => {
      const on = cfg.palette.some((p) => p.toLowerCase() === c.toLowerCase());
      return `<button class="light-swatch ${on ? 'active' : ''}" data-palettecolor="${c}" style="background:${c}" title="${c}"></button>`;
    }).join('');
  }
  document.querySelectorAll<HTMLButtonElement>('[data-edgelight]').forEach((b) => {
    b.classList.toggle('active', (b.dataset.edgelight === 'on') === cfg.edgeLight);
  });
}

const KEYCAP_EMOJI_OPTIONS = [
  '🔥', '🎮', '🐾', '🎵', '⚡', '💧', '🌟', '❤️', '🍀', '🎯', '🚀', '🌸', '☕', '🍮', '',
];

let kcSelectedKeyId: string | null = null;

const kceEl = document.getElementById('keycap-designer') as HTMLDivElement | null;
const kceGridEl = document.getElementById('kce-grid') as HTMLDivElement | null;
const kceSelectedEl = document.getElementById('kce-selected') as HTMLDivElement | null;
const kceColorsEl = document.getElementById('kce-colors') as HTMLDivElement | null;
const kceEmojisEl = document.getElementById('kce-emojis') as HTMLDivElement | null;
const kceLabelInput = document.getElementById('kce-label-input') as HTMLInputElement | null;

function activeLayoutId(): KeyboardLayoutId {
  return settings.keyboardLayout === '108' ? '108' : '65';
}

function currentKeycap(id: string): KeycapOverride {
  return settings.keycapOverrides?.[id] ?? {};
}

function setKeycap(id: string, patch: KeycapOverride | null): void {
  const next = { ...(settings.keycapOverrides ?? {}) };
  if (patch === null) {
    delete next[id];
  } else {
    next[id] = { ...next[id], ...patch };
  }
  engine.setKeycapOverrides(next);
  void applySettingsPatch({ keycapOverrides: next });
  renderKeycapGrid();
}

function renderKeycapGrid(): void {
  if (!kceGridEl) return;
  const layout = getKeyboardLayout(activeLayoutId());
  const overrides = settings.keycapOverrides ?? {};
  const parts: string[] = [];
  for (const key of layout.keys) {
    const rY = key.rowY ?? key.row;
    const rSpan = key.rowSpan ?? 1;
    const left = (key.uStart / layout.totalUnits) * 100;
    const width = (key.uWidth / layout.totalUnits) * 100;
    const top = (rY / layout.totalRows) * 100;
    const height = (rSpan / layout.totalRows) * 100;
    const ov = overrides[key.id];
    const bg = ov?.top ?? '#e8e9e4';
    const fg = ov?.text ?? '#2c2f36';
    const glyph = ov?.emoji || ov?.label || key.label;
    const sel = kcSelectedKeyId === key.id ? ' selected' : '';
    parts.push(
      `<button class="kce-key${sel}" data-kcekey="${key.id}" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%;width:${width.toFixed(2)}%;height:${height.toFixed(2)}%;background:${bg};color:${fg}" title="${key.id}">${glyph}</button>`,
    );
  }
  kceGridEl.innerHTML = parts.join('');

  if (kceSelectedEl) {
    if (kcSelectedKeyId) {
      const key = layout.keys.find((k) => k.id === kcSelectedKeyId);
      const ov = currentKeycap(kcSelectedKeyId);
      const bits = [key?.label || kcSelectedKeyId];
      if (ov.top) bits.push(ov.top);
      if (ov.emoji) bits.push(ov.emoji);
      if (ov.label) bits.push(`“${ov.label}”`);
      kceSelectedEl.textContent = `已选中：${bits.join(' · ')}`;
    } else {
      kceSelectedEl.textContent = '未选择按键（点上方键盘）';
    }
  }

  if (kceColorsEl) {
    const cur = kcSelectedKeyId ? currentKeycap(kcSelectedKeyId).top : undefined;
    kceColorsEl.innerHTML = PALETTE_CANDIDATES.concat(['#e8e9e4', '#2a2d35'])
      .map(
        (c) =>
          `<button class="light-swatch ${cur && cur.toLowerCase() === c.toLowerCase() ? 'active' : ''}" data-kcswatch="${c}" style="background:${c}" title="${c}"></button>`,
      )
      .join('');
  }

  if (kceEmojisEl) {
    const cur = kcSelectedKeyId ? currentKeycap(kcSelectedKeyId).emoji : undefined;
    kceEmojisEl.innerHTML = KEYCAP_EMOJI_OPTIONS.map(
      (e, i) =>
        `<button class="light-swatch ${cur === e && e ? 'active' : ''}" data-kcemoji="${i}" style="background:#20242c;color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center">${e || '∅'}</button>`,
    ).join('');
  }

  if (kceLabelInput && kcSelectedKeyId) {
    kceLabelInput.value = currentKeycap(kcSelectedKeyId).label ?? '';
  }
}

function openKeycapDesigner(): void {
  if (!kceEl) return;
  kcSelectedKeyId = null;
  renderKeycapGrid();
  kceEl.classList.remove('hidden');
}

function closeKeycapDesigner(): void {
  kceEl?.classList.add('hidden');
}

function syncLightUI(): void {  const cfg = currentLight();
  if (lightToggleBtnEl) {
    lightToggleBtnEl.textContent = cfg.enabled ? '已开启' : '开启';
    lightToggleBtnEl.classList.toggle('on', cfg.enabled);
  }
  document.querySelectorAll<HTMLButtonElement>('[data-lightfx]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lightfx === cfg.effect);
  });
  if (lightBrightnessEl && document.activeElement !== lightBrightnessEl) {
    lightBrightnessEl.value = String(Math.round(cfg.brightness * 100));
  }
  if (lightBrightnessValueEl) {
    lightBrightnessValueEl.textContent = `${Math.round(cfg.brightness * 100)}%`;
  }
  if (lightSpeedEl && document.activeElement !== lightSpeedEl) {
    lightSpeedEl.value = String(Math.round(cfg.speed * 100));
  }
  if (lightSpeedValueEl) {
    lightSpeedValueEl.textContent = `${cfg.speed.toFixed(1)}×`;
  }
  renderLightSwatches();
  renderLightColorControls();
}

function syncMenuUI(): void {
  const setCheck = (id: string, on: boolean) => {
    const el = document.getElementById(id);
    if (el) el.textContent = on ? '✓' : '';
  };
  setCheck('chk-privacy', settings.privacyPasswordGuard !== false);
  setCheck('chk-bubbles', settings.showKeyBubbles);
  setCheck('chk-lock', settings.clickThroughLocked);
  setCheck('chk-sound', settings.soundEnabled);
  setCheck('chk-top', settings.alwaysOnTop);
  setCheck('chk-autostart', settings.autostart);
  setCheck('chk-mcp', settings.mcpEnabled);

  if (!sliderDragging) {
    updateScaleSliderVisual(settings.scale);
  }

  const kbLayout: KeyboardLayoutId = settings.keyboardLayout === '108' ? '108' : '65';
  const kbOrient: KeyboardOrientation = settings.keyboardOrientation === 'viewer' ? 'viewer' : 'cat';
  const kbScale = clampKeyboardScale(
    kbLayout === '108' ? settings.keyboardScale108 : settings.keyboardScale65,
    kbLayout,
  );
  document.querySelectorAll<HTMLButtonElement>('[data-kblayout]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.kblayout === kbLayout);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-kborient]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.kborient === kbOrient);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-mouseorient]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mouseorient === settings.mouseOrientation);
  });
  updateKbScaleVisual(kbLayout, kbScale);
  renderDeskSkinPills();
  renderPropUI();
  syncLightUI();

  const activeCat = catList.find((c) => c.id === settings.catBreed) ?? catList[0];
  renderBreedPills();

  const headerEl = document.getElementById('menu-header');
  if (headerEl && activeCat) {
    const emoji = activeCat.emoji || '🐱';
    headerEl.textContent = `${emoji} KuroCat ${activeCat.name}`;
    headerEl.style.color = activeCat.accentColor || '#c8f538';
  }

  engine.showKeyBubbles = settings.showKeyBubbles;
  engine.setCatAppearance(activeCat?.id || 'black', activeCat);
  engine.setKeyboardConfig(kbLayout, kbOrient, {
    scale: kbScale,
    mouseOrientation: settings.mouseOrientation,
  });
  engine.setLightConfig(settings.keyboardLight);
  engine.setDeskSkin(activeDeskSkin());
  engine.setKeycapOverrides(settings.keycapOverrides);
  engine.setPropConfig(settings.propConfig);
  engine.setIdleAutoEnabled(settings.idleActionsEnabled !== false);
  engine.setMoodTrackingEnabled(settings.moodTrackingEnabled !== false);
  const idleAutoEl = document.getElementById('idle-auto') as HTMLInputElement | null;
  if (idleAutoEl) idleAutoEl.checked = settings.idleActionsEnabled !== false;
  if (!sliderDragging) {
    engine.setRenderScale(settings.scale);
  }
  catAudio.setEnabled(settings.soundEnabled);
  pushHitRegions();
  if (kceEl && !kceEl.classList.contains('hidden')) renderKeycapGrid();
}

let lastHitRegionsJson = '';
let lastIdleSeq = 0;
let lastMoodSeq = 0;

/** MCP writes a mood request + seq; apply it once when the counter advances. */
function consumeMoodRequest(): void {
  const seq = settings.moodSeq ?? 0;
  if (seq <= lastMoodSeq) return;
  lastMoodSeq = seq;
  const a = settings.moodAnnoyanceRequest;
  const d = settings.moodDizzyRequest;
  engine.setMoodMeter(
    typeof a === 'number' && a >= 0 ? a : undefined,
    typeof d === 'number' && d >= 0 ? d : undefined,
  );
}

/** MCP writes a request + seq; play it once when the counter advances. */
function consumeIdleRequest(): void {
  const seq = settings.idleActionSeq ?? 0;
  if (seq <= lastIdleSeq) return;
  lastIdleSeq = seq;
  const kind = settings.idleActionRequest;
  if (kind) engine.triggerIdleAction(kind);
}
function pushHitRegions(): void {
  const regions = engine.getHitRegions();
  const json = JSON.stringify(regions);
  if (json === lastHitRegionsJson) return;
  lastHitRegionsJson = json;
  try {
    void Promise.resolve(invoke('set_hit_regions', { regions })).catch(() => {});
  } catch {
    // No Tauri IPC (browser preview); ignore.
  }
}

function closeContextMenu(): void {
  if (!menuEl.classList.contains('hidden')) {
    menuEl.classList.add('hidden');
    void invoke('set_menu_open', { open: false });
    syncWin7OverlayFn?.(false);
  }
}

function openContextMenu(clientX: number, clientY: number): void {
  syncMenuUI();
  menuEl.classList.remove('hidden');
  void invoke('set_menu_open', { open: true });

  const rect = menuEl.getBoundingClientRect();
  const maxX = Math.max(8, window.innerWidth - rect.width - 8);
  const maxY = Math.max(8, window.innerHeight - rect.height - 8);
  menuEl.style.left = `${Math.max(8, Math.min(clientX, maxX))}px`;
  menuEl.style.top = `${Math.max(8, Math.min(clientY, maxY))}px`;
  syncWin7OverlayFn?.(true);
}

async function applySettingsPatch(patch: Partial<AppSettings>): Promise<void> {
  settings = { ...settings, ...patch };
  syncMenuUI();
  try {
    settings = await invoke<AppSettings>('update_settings', { patch: settings });
    syncMenuUI();
  } catch (err) {
    // Browser preview (no Tauri IPC) or a transient IPC failure: keep the local state.
    console.warn('update_settings failed:', err);
  }
}

async function copyMcpConfig(): Promise<void> {
  const hint = document.getElementById('mcp-copy-hint');
  try {
    const jsonText = await invoke<string>('get_mcp_config');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(jsonText);
    } else {
      const ta = document.createElement('textarea');
      ta.value = jsonText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    if (hint) {
      hint.textContent = '✓ 已复制';
      hint.classList.add('copied');
      setTimeout(() => {
        hint.textContent = 'AI 捏猫';
        hint.classList.remove('copied');
      }, 1800);
    }
  } catch (err) {
    console.error('Failed to copy MCP config:', err);
  }
}

async function createDesktopShortcut(): Promise<void> {
  const hint = document.getElementById('shortcut-hint');
  try {
    await invoke<string>('create_desktop_shortcut');
    if (hint) {
      hint.textContent = '✓ 已创建';
      hint.classList.add('copied');
      setTimeout(() => {
        hint.textContent = 'KuroCat';
        hint.classList.remove('copied');
      }, 1800);
    }
  } catch (err) {
    console.error('Failed to create desktop shortcut:', err);
  }
}

function setUpdateHint(text: string, mode: 'default' | 'ready' | 'error' = 'default'): void {
  const hint = document.getElementById('update-hint');
  if (!hint) return;
  hint.textContent = text;
  hint.classList.remove('update-ready', 'update-error');
  if (mode === 'ready') hint.classList.add('update-ready');
  else if (mode === 'error') hint.classList.add('update-error');
}

function hideUpdateToast(): void {
  if (toastAutoHideTimer !== null) {
    window.clearTimeout(toastAutoHideTimer);
    toastAutoHideTimer = null;
  }
  if (!updateToastEl.classList.contains('hidden')) {
    updateToastEl.classList.add('hidden');
    void invoke('set_update_banner_open', { open: false });
    syncWin7OverlayFn?.(false);
  }
}

function showUpdateToast(
  text: string,
  options: { showInstall?: boolean; showOpen?: boolean; autoHideMs?: number; busy?: boolean } = {},
): void {
  if (toastAutoHideTimer !== null) {
    window.clearTimeout(toastAutoHideTimer);
    toastAutoHideTimer = null;
  }
  updateToastTextEl.textContent = text;
  btnToastInstallEl.classList.toggle('hidden', !options.showInstall);
  btnToastInstallEl.disabled = Boolean(options.busy);
  btnToastOpenEl.classList.toggle('hidden', !options.showOpen);
  updateToastEl.classList.remove('hidden');
  void invoke('set_update_banner_open', { open: true });
  requestAnimationFrame(() => syncWin7OverlayFn?.(false));

  if (options.autoHideMs && options.autoHideMs > 0) {
    toastAutoHideTimer = window.setTimeout(() => {
      hideUpdateToast();
    }, options.autoHideMs);
  }
}

function handleUpdateProgressEvent(ev: UpdateProgressEvent, fromManual = false): void {
  if (ev.info) {
    latestUpdateInfo = ev.info;
    appVersion = ev.info.currentVersion || appVersion;
  }

  switch (ev.stage) {
    case 'checking':
      updateBusy = true;
      setUpdateHint('检测中...');
      showUpdateToast('🔍 正在检查新版本...', { busy: true });
      break;
    case 'available':
      updateBusy = false;
      if (latestUpdateInfo?.hasUpdate) {
        const ver = latestUpdateInfo.latestVersion;
        setUpdateHint(`⬆ v${ver}`, 'ready');
        if (fromManual || dismissedVersion !== ver) {
          showUpdateToast(`✨ 发现新版本 v${ver}`, {
            showInstall: Boolean(latestUpdateInfo.downloadUrl),
            showOpen: !latestUpdateInfo.downloadUrl,
          });
        }
      }
      break;
    case 'up_to_date':
      updateBusy = false;
      setUpdateHint(`✓ v${appVersion}`);
      showUpdateToast(`✓ 已是最新版本 v${appVersion}`, { autoHideMs: 2600 });
      break;
    case 'downloading':
    case 'verifying':
    case 'installing':
      updateBusy = true;
      setUpdateHint('更新中...', 'ready');
      showUpdateToast(`⏳ ${ev.message}`, { busy: true });
      break;
    case 'error':
      updateBusy = false;
      setUpdateHint('检查失败', 'error');
      showUpdateToast(`⚠ ${ev.message}`, {
        showOpen: true,
        autoHideMs: 5200,
      });
      break;
  }
}

async function triggerInstallUpdate(): Promise<void> {
  if (updateBusy || !latestUpdateInfo || !latestUpdateInfo.hasUpdate) return;
  updateBusy = true;
  closeContextMenu();
  showUpdateToast(`⏳ 正在下载 v${latestUpdateInfo.latestVersion}...`, { busy: true });
  setUpdateHint('下载中...', 'ready');
  try {
    await invoke('install_update', { info: latestUpdateInfo });
  } catch (err) {
    updateBusy = false;
    const msg = typeof err === 'string' ? err : String(err);
    setUpdateHint('更新失败', 'error');
    showUpdateToast(`⚠ ${msg}`, { showOpen: true, autoHideMs: 6500 });
  }
}

async function triggerManualUpdateCheck(): Promise<void> {
  if (updateBusy) return;
  // If we already know an update is ready, clicking the menu item immediately starts installing it!
  if (latestUpdateInfo?.hasUpdate && latestUpdateInfo.downloadUrl) {
    await triggerInstallUpdate();
    return;
  }
  updateBusy = true;
  setUpdateHint('检测中...');
  closeContextMenu();
  showUpdateToast('🔍 正在检查新版本...', { busy: true });
  try {
    const info = await invoke<UpdateInfo>('check_for_update');
    handleUpdateProgressEvent(
      {
        stage: info.hasUpdate ? 'available' : 'up_to_date',
        message: info.hasUpdate
          ? `发现新版本 v${info.latestVersion}`
          : `已是最新版本 v${info.currentVersion}`,
        info,
      },
      true,
    );
  } catch (err) {
    const msg = typeof err === 'string' ? err : String(err);
    handleUpdateProgressEvent({ stage: 'error', message: msg, info: null }, true);
  }
}

async function bootstrap(): Promise<void> {
  engine.start();

  // Hide Windows-only desktop shortcut button on macOS
  if (/Mac/i.test(navigator.platform) || /Macintosh/i.test(navigator.userAgent)) {
    const shortcutBtn = document.getElementById('btn-desktop-shortcut');
    if (shortcutBtn) shortcutBtn.style.display = 'none';
  }

  try {
    const [loadedSettings, loadedCats, loadedVer, loadedSkins] = await Promise.all([
      invoke<AppSettings>('get_settings'),
      invoke<CatSkinConfig[]>('get_cats'),
      invoke<string>('get_app_version'),
      invoke<DeskSkinConfig[]>('get_desk_skins').catch(() => []),
    ]);
    settings = loadedSettings;
    lastKnownLockState = settings.clickThroughLocked;
    // Don't replay a request that was queued before this launch.
    lastIdleSeq = settings.idleActionSeq ?? 0;
    lastMoodSeq = settings.moodSeq ?? 0;
    if (Array.isArray(loadedCats) && loadedCats.length > 0) {
      catList = loadedCats;
    }
    if (Array.isArray(loadedSkins)) {
      settings.deskSkins = loadedSkins;
    }
    if (loadedVer) {
      appVersion = loadedVer;
      setUpdateHint(`v${appVersion}`);
    }
    syncMenuUI();
  } catch (err) {
    console.error('Failed to load settings or cats:', err);
  }

  await safeListen<UpdateProgressEvent>('kuro-update-status', (ev) => {
    handleUpdateProgressEvent(ev.payload, false);
  });

  btnToastInstallEl.addEventListener('click', (e) => {
    e.stopPropagation();
    void triggerInstallUpdate();
  });

  btnToastOpenEl.addEventListener('click', (e) => {
    e.stopPropagation();
    const url = latestUpdateInfo?.releaseUrl || 'https://github.com/qianyiai/kurocat/releases/latest';
    void invoke('open_release_page', { url });
  });

  btnToastCloseEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (latestUpdateInfo?.hasUpdate) {
      dismissedVersion = latestUpdateInfo.latestVersion;
    }
    hideUpdateToast();
  });

  if (scaleSliderEl) {
    scaleSliderEl.addEventListener('pointerdown', () => {
      sliderDragging = true;
    });
    scaleSliderEl.addEventListener('input', () => {
      sliderDragging = true;
      const nextScale = Math.max(0.2, Math.min(1.5, Number(scaleSliderEl.value) / 100));
      updateScaleSliderVisual(nextScale);
      engine.setRenderScale(nextScale);
    });
    const commitSliderScale = () => {
      sliderDragging = false;
      const nextScale = Math.max(0.2, Math.min(1.5, Number(scaleSliderEl.value) / 100));
      void applySettingsPatch({ scale: nextScale });
    };
    scaleSliderEl.addEventListener('change', commitSliderScale);
    scaleSliderEl.addEventListener('pointerup', () => {
      sliderDragging = false;
    });
  }

  if (scaleValueEl) {
    scaleValueEl.addEventListener('click', (e) => {
      e.stopPropagation();
      sliderDragging = false;
      updateScaleSliderVisual(1.0);
      void applySettingsPatch({ scale: 1.0 });
    });
  }

  if (kbScaleSliderEl) {
    kbScaleSliderEl.addEventListener('input', () => {
      const layout: KeyboardLayoutId = settings.keyboardLayout === '108' ? '108' : '65';
      const pct = Number(kbScaleSliderEl.value);
      updateKbScaleVisual(layout, pct / 100);
      engine.setKeyboardScale(pct / 100);
      pushHitRegions();
    });
    kbScaleSliderEl.addEventListener('change', () => {
      const layout: KeyboardLayoutId = settings.keyboardLayout === '108' ? '108' : '65';
      const scale = clampKeyboardScale(Number(kbScaleSliderEl.value) / 100, layout);
      void applySettingsPatch(
        layout === '108' ? { keyboardScale108: scale } : { keyboardScale65: scale },
      );
    });
  }

  if (kbScaleValueEl) {
    kbScaleValueEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const layout: KeyboardLayoutId = settings.keyboardLayout === '108' ? '108' : '65';
      const def = defaultKeyboardScale(layout);
      updateKbScaleVisual(layout, def);
      engine.setKeyboardScale(def);
      pushHitRegions();
      void applySettingsPatch(
        layout === '108' ? { keyboardScale108: def } : { keyboardScale65: def },
      );
    });
  }

  if (lightToggleBtnEl) {
    lightToggleBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const cfg = currentLight();
      const turningOn = !cfg.enabled;
      patchLight({
        enabled: turningOn,
        effect: turningOn && cfg.effect === 'off' ? 'breath' : cfg.effect,
      });
    });
  }

  if (lightBrightnessEl) {
    lightBrightnessEl.addEventListener('input', () => {
      const v = Number(lightBrightnessEl.value) / 100;
      if (lightBrightnessValueEl) lightBrightnessValueEl.textContent = `${Math.round(v * 100)}%`;
      engine.setLightConfig({ ...currentLight(), brightness: v });
    });
    lightBrightnessEl.addEventListener('change', () => {
      patchLight({ brightness: Number(lightBrightnessEl.value) / 100 });
    });
  }

  if (lightSpeedEl) {
    lightSpeedEl.addEventListener('input', () => {
      const v = Number(lightSpeedEl.value) / 100;
      if (lightSpeedValueEl) lightSpeedValueEl.textContent = `${v.toFixed(1)}×`;
      engine.setLightConfig({ ...currentLight(), speed: v });
    });
    lightSpeedEl.addEventListener('change', () => {
      patchLight({ speed: Number(lightSpeedEl.value) / 100 });
    });
  }

  const propToggleBtn = document.getElementById('prop-toggle-btn');
  if (propToggleBtn) {
    propToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cfg = currentProp();
      patchProp({ enabled: !cfg.enabled });
    });
  }

  if (propAutoSipEl) {
    propAutoSipEl.addEventListener('change', () => {
      patchProp({ autoSip: propAutoSipEl.checked });
    });
  }

  const idleAutoEl = document.getElementById('idle-auto') as HTMLInputElement | null;
  if (idleAutoEl) {
    idleAutoEl.addEventListener('change', () => {
      void applySettingsPatch({ idleActionsEnabled: idleAutoEl.checked });
    });
  }

  // ---- Keycap designer ----
  document.getElementById('btn-open-keycap-designer')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openKeycapDesigner();
  });
  document.getElementById('kce-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeKeycapDesigner();
  });
  document.getElementById('kce-done')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeKeycapDesigner();
  });
  kceGridEl?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-kcekey]');
    if (!btn) return;
    e.stopPropagation();
    kcSelectedKeyId = btn.dataset.kcekey ?? null;
    renderKeycapGrid();
  });
  kceColorsEl?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-kcswatch]');
    if (!btn || !kcSelectedKeyId) return;
    e.stopPropagation();
    setKeycap(kcSelectedKeyId, { top: btn.dataset.kcswatch ?? undefined });
  });
  kceEmojisEl?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-kcemoji]');
    if (!btn || !kcSelectedKeyId) return;
    e.stopPropagation();
    const idx = Number(btn.dataset.kcemoji);
    const emoji = KEYCAP_EMOJI_OPTIONS[idx] ?? '';
    setKeycap(kcSelectedKeyId, { emoji });
  });
  document.getElementById('kce-apply-label')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!kcSelectedKeyId || !kceLabelInput) return;
    setKeycap(kcSelectedKeyId, { label: kceLabelInput.value.slice(0, 4) });
  });
  document.getElementById('kce-reset-key')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!kcSelectedKeyId) return;
    setKeycap(kcSelectedKeyId, null);
  });
  document.getElementById('kce-clear-all')?.addEventListener('click', (e) => {
    e.stopPropagation();
    engine.setKeycapOverrides({});
    void applySettingsPatch({ keycapOverrides: {} });
    renderKeycapGrid();
  });

  await safeListen<AppSettings>('kuro-settings', (ev) => {
    const prevLock = lastKnownLockState;
    settings = ev.payload;
    lastKnownLockState = settings.clickThroughLocked;
    syncMenuUI();
    consumeIdleRequest();
    consumeMoodRequest();
    // MCP may have added/edited custom desk skins; pull the fresh list.
    void invoke<DeskSkinConfig[]>('get_desk_skins')
      .then((list) => {
        if (Array.isArray(list)) {
          settings.deskSkins = list;
          renderDeskSkinPills();
        }
      })
      .catch(() => {});
    if (prevLock !== null && prevLock !== settings.clickThroughLocked) {
      if (settings.clickThroughLocked) {
        showUpdateToast('🔒 已锁定穿透（按住 Alt 点击或 ^ 托盘解锁）', { autoHideMs: 4200 });
      } else {
        showUpdateToast('🔓 已解除穿透，可直接拖动或右键', { autoHideMs: 2200 });
      }
    }
  });

  await safeListen<CatSkinConfig[]>('kuro-cats', (ev) => {
    if (Array.isArray(ev.payload) && ev.payload.length > 0) {
      catList = ev.payload;
      syncMenuUI();
    }
  });

  await safeListen<InputEvent>('kuro-input', (ev) => {
    const p = ev.payload;
    switch (p.kind) {
      case 'keyDown':
        engine.onKeyDown(p.vk, p.repeat);
        break;
      case 'keyUp':
        engine.onKeyUp(p.vk);
        break;
      case 'mouseMove':
        engine.onGlobalMouseMove(p.nx, p.ny);
        break;
      case 'mouseDown':
        engine.onMouseDown(p.button);
        break;
      case 'mouseUp':
        engine.onMouseUp(p.button);
        break;
      case 'mouseWheel':
        engine.onMouseWheel();
        break;
      case 'privacyTyping':
        engine.onPrivacyTyping();
        break;
    }
  });

  await safeListen<boolean>('kuro-privacy', (ev) => {
    engine.setPrivacyMode(Boolean(ev.payload));
  });

  await safeListen<WindowCursorInfo>('kuro-cursor', (ev) => {
    const c = ev.payload;
    altOverride = Boolean(c.altOverride);
    engine.onWindowCursor(c.relX, c.relY, c.overCat);
    const interactive = !settings.clickThroughLocked || altOverride;
    canvas.classList.toggle('pet-hover', c.overCat && interactive);
  });

  // Left-click drag to reposition transparent window
  canvas.addEventListener('mousedown', async (e) => {
    if (e.button === 0) {
      closeContextMenu();
      if (settings.clickThroughLocked && !altOverride && !e.altKey) return;
      // Clicking the drink refills an empty cup instead of dragging the window.
      const logicalPt = engine.clientToLogical(e.clientX, e.clientY);
      if (engine.hitTestProp(logicalPt.x, logicalPt.y)) {
        const result = engine.clickProp();
        if (result === 'refilled') {
          showUpdateToast('🥤 已续杯，猫猫又有饮料啦', { autoHideMs: 2400 });
        } else if (result === 'sipped') {
          showUpdateToast('🐾 猫猫喝了一口', { autoHideMs: 1800 });
        }
        return;
      }
      canvas.classList.add('pet-dragging');
      void invoke('set_dragging', { dragging: true });
      try {
        await getCurrentWindow().startDragging();
      } finally {
        canvas.classList.remove('pet-dragging');
        engine.onMouseUp('left');
        void invoke('set_dragging', { dragging: false });
        void invoke('save_window_pos');
      }
    }
  });

  // Right-click opens sleek dark glass settings menu
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (settings.clickThroughLocked && !altOverride && !e.altKey) return;
    openContextMenu(e.clientX, e.clientY);
  });

  window.addEventListener('blur', () => closeContextMenu());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeContextMenu();
  });

  menuEl.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-action], [data-scale], [data-breed], [data-kblayout], [data-kborient], [data-mouseorient], [data-lightfx], [data-lightcolor], [data-lightpreset], [data-lightmode], [data-palettecolor], [data-edgelight], [data-deskskin], [data-propkind], [data-propside], [data-idleaction], [data-diy], [data-kcedit], [data-kcswatch], [data-kcclear], [data-kcemoji]',
    );
    if (!target) return;

    const lightFx = target.dataset.lightfx;
    if (lightFx) {
      const cfg = currentLight();
      const effect = lightFx as LightEffect;
      patchLight({ enabled: effect !== 'off', effect });
      return;
    }

    const lightColor = target.dataset.lightcolor;
    if (lightColor) {
      patchLight({ color: lightColor });
      return;
    }

    const lightMode = target.dataset.lightmode;
    if (lightMode) {
      patchLight({ colorMode: lightMode as LightColorMode });
      return;
    }

    const paletteColor = target.dataset.palettecolor;
    if (paletteColor) {
      const cfg = currentLight();
      const exists = cfg.palette.some((p) => p.toLowerCase() === paletteColor.toLowerCase());
      let next = exists
        ? cfg.palette.filter((p) => p.toLowerCase() !== paletteColor.toLowerCase())
        : [...cfg.palette, paletteColor];
      // A palette needs at least two colours to be meaningful.
      if (next.length < 2) next = [...DEFAULT_LIGHT.palette];
      patchLight({ palette: next, enabled: true });
      return;
    }

    const edgeLight = target.dataset.edgelight;
    if (edgeLight) {
      patchLight({ edgeLight: edgeLight === 'on', enabled: true });
      return;
    }

    const lightPreset = target.dataset.lightpreset;
    if (lightPreset) {
      const preset = LIGHT_PRESETS.find((p) => p.id === lightPreset);
      if (preset) void applySettingsPatch({ keyboardLight: { ...preset.config } });
      return;
    }

    const deskSkinId = target.dataset.deskskin;
    if (deskSkinId) {
      void applySettingsPatch({ deskSkinId });
      return;
    }

    const propKind = target.dataset.propkind;
    if (propKind) {
      patchProp({ kind: propKind as PropKind, enabled: true });
      return;
    }

    const propSide = target.dataset.propside;
    if (propSide) {
      patchProp({ side: propSide as PropSide });
      return;
    }

    const idleAction = target.dataset.idleaction;
    if (idleAction) {
      if (settings.idleActionsEnabled === false) {
        void applySettingsPatch({ idleActionsEnabled: true });
      }
      engine.setIdleAutoEnabled(true);
      engine.triggerIdleAction(idleAction);
      closeContextMenu();
      return;
    }

    const diy = target.dataset.diy;
    if (diy) {
      if (diy === 'clear') {
        engine.setKeycapOverrides({});
        void applySettingsPatch({ keycapOverrides: {} });
      } else {
        const preset = KEYCAP_DIY_PRESETS[diy];
        if (preset) {
          const merged = { ...settings.keycapOverrides, ...preset };
          engine.setKeycapOverrides(merged);
          void applySettingsPatch({ keycapOverrides: merged });
        }
      }
      renderKeycapGrid();
      return;
    }

    const kbLayoutAttr = target.dataset.kblayout;
    if (kbLayoutAttr === '65' || kbLayoutAttr === '108') {
      void applySettingsPatch({ keyboardLayout: kbLayoutAttr });
      closeContextMenu();
      return;
    }

    const mouseOrientAttr = target.dataset.mouseorient;
    if (mouseOrientAttr === 'auto' || mouseOrientAttr === 'cat' || mouseOrientAttr === 'viewer') {
      void applySettingsPatch({ mouseOrientation: mouseOrientAttr });
      closeContextMenu();
      return;
    }

    const kbOrientAttr = target.dataset.kborient;
    if (kbOrientAttr === 'cat' || kbOrientAttr === 'viewer') {
      void applySettingsPatch({ keyboardOrientation: kbOrientAttr });
      closeContextMenu();
      return;
    }

    const breedAttr = target.dataset.breed;
    if (breedAttr) {
      void applySettingsPatch({ catBreed: breedAttr });
      closeContextMenu();
      return;
    }

    const scaleAttr = target.dataset.scale;
    if (scaleAttr) {
      void applySettingsPatch({ scale: Number(scaleAttr) });
      closeContextMenu();
      return;
    }

    switch (target.dataset.action) {
      case 'toggle-privacy':
        void applySettingsPatch({ privacyPasswordGuard: !(settings.privacyPasswordGuard !== false) });
        break;
      case 'toggle-bubbles':
        void applySettingsPatch({ showKeyBubbles: !settings.showKeyBubbles });
        break;
      case 'toggle-lock':
        void applySettingsPatch({ clickThroughLocked: !settings.clickThroughLocked });
        closeContextMenu();
        break;
      case 'toggle-sound':
        void applySettingsPatch({ soundEnabled: !settings.soundEnabled });
        break;
      case 'toggle-top':
        void applySettingsPatch({ alwaysOnTop: !settings.alwaysOnTop });
        break;
      case 'toggle-autostart':
        void applySettingsPatch({ autostart: !settings.autostart });
        break;
      case 'toggle-mcp':
        void applySettingsPatch({ mcpEnabled: !settings.mcpEnabled });
        break;
      case 'copy-mcp':
        void copyMcpConfig();
        break;
      case 'desktop-shortcut':
        void createDesktopShortcut();
        break;
      case 'check-update':
        void triggerManualUpdateCheck();
        break;
      case 'reset-pos':
        void invoke('reset_position');
        closeContextMenu();
        break;
      case 'quit':
        void invoke('quit_app');
        break;
    }
  });

  // On Windows 7/8 (where Microsoft WebView2 does not support DirectComposition alpha),
  // stream the live 2D Canvas RGBA pixels via zero-copy binary IPC to a native Win32
  // UpdateLayeredWindow(ULW_ALPHA) presenter window for true 256-level per-pixel anti-aliased
  // transparency (zero white box, zero jagged edges) on both Aero and Win7 Basic desktops.
  try {
    const useWin7Ulw = await invoke<boolean>('is_win7_ulw_mode');
    if (useWin7Ulw) {
      document.documentElement.classList.add('win7-ulw-mode');
      const petCtx = canvas.getContext('2d');
      let win7Visible = true;
      let frameBusy = false;
      let lastPresentMs = 0;
      let lastFrameKey = '';
      let lastOverlayKey = '';

      const syncWin7Overlay = (focusMenu = false) => {
        const dpr = Math.max(window.devicePixelRatio || 1, 1);
        const physW = Math.max(1, Math.round(window.innerWidth * dpr));
        const physH = Math.max(1, Math.round(window.innerHeight * dpr));
        const rects: number[] = [];

        if (menuEl && !menuEl.classList.contains('hidden')) {
          const r = menuEl.getBoundingClientRect();
          if (r.width > 2 && r.height > 2) {
            rects.push(
              Math.max(0, Math.floor(r.left * dpr)),
              Math.max(0, Math.floor(r.top * dpr)),
              Math.min(physW, Math.ceil(r.right * dpr)),
              Math.min(physH, Math.ceil(r.bottom * dpr)),
              Math.round(12 * dpr),
            );
          }
        }
        if (updateToastEl && !updateToastEl.classList.contains('hidden')) {
          const r = updateToastEl.getBoundingClientRect();
          if (r.width > 2 && r.height > 2) {
            const top = Math.max(0, Math.floor(r.top * dpr));
            const bot = Math.min(physH, Math.ceil(r.bottom * dpr));
            rects.push(
              Math.max(0, Math.floor(r.left * dpr)),
              top,
              Math.min(physW, Math.ceil(r.right * dpr)),
              bot,
              Math.max(8, Math.round((bot - top) / 2)),
            );
          }
        }

        const key = rects.join(',');
        if (!focusMenu && key === lastOverlayKey) return;
        lastOverlayKey = key;
        void invoke('win7_sync_overlay', { rects, focusMenu });
      };
      syncWin7OverlayFn = syncWin7Overlay;

      await safeListen<{ x: number; y: number }>('kuro-win7-contextmenu', (ev) => {
        openContextMenu(ev.payload.x, ev.payload.y);
      });
      await safeListen('kuro-win7-close-menu', () => {
        closeContextMenu();
      });
      await safeListen<boolean>('kuro-win7-visibility', (ev) => {
        win7Visible = Boolean(ev.payload);
        if (win7Visible) {
          lastFrameKey = '';
        }
      });

      const presentWin7Frame = () => {
        if (!win7Visible || frameBusy || !petCtx) return;
        const now = performance.now();
        if (now - lastPresentMs < 28) return;
        const w = canvas.width;
        const h = canvas.height;
        if (w < 8 || h < 8) return;

        const imgData = petCtx.getImageData(0, 0, w, h);
        const u32 = new Uint32Array(
          imgData.data.buffer,
          imgData.data.byteOffset,
          imgData.data.byteLength >>> 2,
        );
        let hash = 2166136261 >>> 0;
        hash = Math.imul(hash ^ w, 16777619) >>> 0;
        hash = Math.imul(hash ^ h, 16777619) >>> 0;
        for (let i = 0; i < u32.length; i++) {
          hash = Math.imul(hash ^ u32[i], 16777619) >>> 0;
        }
        const key = `${w}x${h}:${hash}`;
        if (key === lastFrameKey) return;

        lastFrameKey = key;
        lastPresentMs = now;
        frameBusy = true;
        const payload = new Uint8Array(
          imgData.data.buffer,
          imgData.data.byteOffset,
          imgData.data.byteLength,
        );
        void invoke('win7_present_frame', payload, {
          headers: { 'x-w': String(w), 'x-h': String(h) },
        }).finally(() => {
          frameBusy = false;
        });
      };

      engine.onAfterRender = presentWin7Frame;
      // Kick initial presentation immediately & keep overlay bounds in sync if toast/menu resizes
      setTimeout(presentWin7Frame, 30);
      setInterval(() => syncWin7Overlay(false), 200);
    }
  } catch {
    // Non-Win7 or unsupported: keep native transparency untouched
  }
}

void bootstrap();
