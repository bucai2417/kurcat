import { installTauriPreviewShim } from './tauriPreview';

// Must run before any @tauri-apps/api call is issued.
const isPreview = installTauriPreviewShim();
// `?desktop=1` keeps the preview shim but renders with the packaged app's
// full-window bottom-right anchoring, so window/menu geometry can be checked here.
const embedded = isPreview && !new URLSearchParams(location.search).has('desktop');

import './style.css';
import { SettingsSync } from './settingsSync';
import { modelActions, modelMode, modelModes } from './modelPack';
import { setupModelLibrary } from './modelLibrary';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { KuroCatEngine, type KeyboardOrientation, type TailKeyMode, DEFAULT_TAIL_KEY_IDS } from './catEngine';
import type { CollarColorId, KuroCatEngine3D } from './catEngine3d';
import { catAudio } from './audio';
import { InputSounds, DEFAULT_INPUT_SOUND, normalizeInputSound, type InputSoundConfig } from './inputSounds';
import { setDesktopPetInsets } from './petMotion';
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

const inputSounds = new InputSounds(() => catAudio.getContext());

interface AppSettings {
  x: number | null;
  y: number | null;
  scale: number;
  alwaysOnTop: boolean;
  clickThroughLocked: boolean;
  showKeyBubbles: boolean;
  soundEnabled: boolean;
  inputSound: InputSoundConfig;
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
  keycapOverrides3d: Record<string, KeycapOverride> | null;
  idleActionsEnabled: boolean;
  idleDelaySec: number;
  idleActionRequest: string;
  idleActionSeq: number;
  moodTrackingEnabled: boolean;
  moodAnnoyanceRequest: number;
  moodDizzyRequest: number;
  moodSeq: number;
  renderMode: '2d' | '3d';
  collarColor: string;
  headphoneMode: 'auto' | 'on' | 'off';
  tailKeyMode: TailKeyMode;
  tailKeyIds: string[];
  obsEnabled: boolean;
  obsPort: number;
  obsHidePet: boolean;
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
  inputSound: { ...DEFAULT_INPUT_SOUND },
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
  keycapOverrides3d: {},
  idleActionsEnabled: true,
  idleDelaySec: 6,
  idleActionRequest: '',
  idleActionSeq: 0,
  moodTrackingEnabled: true,
  moodAnnoyanceRequest: -1,
  moodDizzyRequest: -1,
  moodSeq: 0,
  renderMode: '2d',
  collarColor: 'none',
  headphoneMode: 'off',
  tailKeyMode: 'smart',
  tailKeyIds: [...DEFAULT_TAIL_KEY_IDS],
  obsEnabled: false,
  obsPort: 27421,
  obsHidePet: false,
  privacyPasswordGuard: true,
};

let gameActive = false;
let privacyActive = false;

/** Headphones are a 3D-only cosmetic; "auto" wears them while a game is running. */
function shouldWearHeadphonesNow(): boolean {
  if (settings.headphoneMode === 'on') return true;
  if (settings.headphoneMode === 'off') return false;
  return gameActive;
}

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
const engine = new KuroCatEngine(canvas, { embedded });

// ---- 3D engine (lazy-loaded; the 2D engine above is never touched) ----
const canvas3d = document.getElementById('pet-canvas-3d') as HTMLCanvasElement | null;
let engine3d: KuroCatEngine3D | null = null;
let loading3dPromise: Promise<void> | null = null;
let webgl3dUnavailable = false;
let active3d = false;
let syncModelLibrary = () => {};
function effectiveMode(): '2d' | '3d' { return modelMode(catList.find(c => c.id === settings.catBreed) ?? catList[0], settings.renderMode === '3d' ? '3d' : '2d'); }

/** True when the user picked 3D and the environment supports it. */
function wants3DNow(): boolean {
  if (effectiveMode() === '2d') return false;
  if (settings.catBreed === 'dafeiyu') return false; // no 3D rig for her
  if (!canvas3d) return false;
  if (webgl3dUnavailable) return false;
  return true;
}

/** Pushes the current settings into the 3D engine. */
function syncEngine3DState(): void {
  if (!engine3d) return;
  const activeCat = catList.find((c) => c.id === settings.catBreed) ?? catList[0];
  const kbLayout: KeyboardLayoutId = settings.keyboardLayout === '108' ? '108' : '65';
  const kbOrient: KeyboardOrientation =
    settings.keyboardOrientation === 'viewer' ? 'viewer' : 'cat';
  const tailMode: TailKeyMode =
    settings.tailKeyMode === 'custom' ||
    settings.tailKeyMode === 'edge' ||
    settings.tailKeyMode === 'off'
      ? settings.tailKeyMode
      : 'smart';
  const tailIds = Array.isArray(settings.tailKeyIds)
    ? settings.tailKeyIds
    : [...DEFAULT_TAIL_KEY_IDS];
  const collar: CollarColorId =
    settings.collarColor === 'red' ||
    settings.collarColor === 'blue' ||
    settings.collarColor === 'pink' ||
    settings.collarColor === 'green'
      ? settings.collarColor
      : 'none';

  engine3d.showKeyBubbles = settings.showKeyBubbles;
  engine3d.setRenderStyle('3d');
  if (activeCat) engine3d.setCatSkin(activeCat);
  engine3d.setCollar(collar);
  engine3d.setHeadphones(shouldWearHeadphonesNow());
  engine3d.setGameActive(gameActive);
  engine3d.setKeyboardConfig(kbLayout, kbOrient);
  engine3d.setMouseOrientation(settings.mouseOrientation);
  engine3d.setLogicalSize(engine.getLogicalSize());
  if (!sliderDragging) engine3d.setRenderScale(settings.scale);
  engine3d.setIdleAutoEnabled(settings.idleActionsEnabled !== false);
  engine3d.setIdleDelaySec(settings.idleDelaySec ?? 6);
  engine3d.setMoodTrackingEnabled(settings.moodTrackingEnabled !== false);
  engine3d.setTailKeyConfig(tailMode, tailIds);
  engine3d.setPropConfig(settings.propConfig);
  engine3d.setLightConfig(settings.keyboardLight);
  engine3d.setKeycapOverrides(settings.keycapOverrides3d ?? settings.keycapOverrides);
  engine3d.setPrivacyMode(privacyActive);
  engine3d.resize();
}

/** Swaps which engine is rendering. The 2D path is left exactly as it was. */
function activateRenderEngine(): void {
  const want3d = wants3DNow();
  if (!want3d) {
    if (active3d) {
      engine3d?.stop();
      canvas3d?.classList.add('hidden');
      canvas.classList.remove('hidden');
      active3d = false;
      engine.start();
      pushHitRegions();
    }
    return;
  }

  if (engine3d) {
    syncEngine3DState();
    if (!active3d) {
      engine.stop();
      canvas.classList.add('hidden');
      canvas3d?.classList.remove('hidden');
      // Re-measure now that the canvas is actually visible; sizing it while it was
      // display:none leaves a stale backing store and the model renders clipped.
      engine3d.resize();
      engine3d.start();
      active3d = true;
      // The click-through map differs between engines: re-publish it right away.
      pushHitRegions();
    }
    return;
  }

  if (!loading3dPromise) {
    loading3dPromise = import('./catEngine3d')
      .then(({ KuroCatEngine3D }) => {
        if (!canvas3d) return;
        engine3d = new KuroCatEngine3D(canvas3d, { embedded });
        window.addEventListener('resize', () => engine3d?.resize());
        activateRenderEngine();
        consumeIdleRequest();
        consumeMoodRequest();
      })
      .catch((err) => {
        console.warn('3D WebGL unavailable, keeping 2D mode:', err);
        webgl3dUnavailable = true;
        active3d = false;
        canvas3d?.classList.add('hidden');
        canvas.classList.remove('hidden');
        engine.start();
        loading3dPromise = null;
        syncMenuUI();
        consumeIdleRequest();
        consumeMoodRequest();
      });
  }
}

if (isPreview) {
  // Browser preview: the canvas fills the viewport, so re-fit on resize.
  window.addEventListener('resize', () => engine.resize());
  // Handy hook for manual testing in DevTools.
  (window as unknown as Record<string, unknown>).__kurocatEngine = engine;
  (window as unknown as Record<string, unknown>).__openMenu = (x = 40, y = 40) =>
    openContextMenu(x, y);

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
  document.querySelectorAll<HTMLButtonElement>('[data-backlit]').forEach((b) => {
    b.classList.toggle('active', (b.dataset.backlit === 'on') === cfg.backlitCaps);
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

function activeKeycaps(): Record<string, KeycapOverride> {
  return (effectiveMode() === '3d' ? settings.keycapOverrides3d ?? settings.keycapOverrides : settings.keycapOverrides) ?? {};
}

function saveActiveKeycaps(next: Record<string, KeycapOverride>): void {
  if (effectiveMode() === '3d') {
    engine3d?.setKeycapOverrides(next);
    void applySettingsPatch({ keycapOverrides3d: next });
  } else {
    engine.setKeycapOverrides(next);
    void applySettingsPatch({ keycapOverrides: next, keycapOverrides3d: settings.keycapOverrides3d ?? { ...settings.keycapOverrides } });
  }
}

function currentKeycap(id: string): KeycapOverride {
  return activeKeycaps()[id] ?? {};
}

function setKeycap(id: string, patch: KeycapOverride | null): void {
  const next = { ...activeKeycaps() };
  if (patch === null) {
    delete next[id];
  } else {
    next[id] = { ...next[id], ...patch };
  }
  saveActiveKeycaps(next);
  renderKeycapGrid();
}

function renderKeycapGrid(): void {
  if (!kceGridEl) return;
  const layout = getKeyboardLayout(activeLayoutId());
  const overrides = activeKeycaps();
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
    const fg = effectiveMode() === '3d' ? '#2c2f36' : ov?.text ?? '#2c2f36';
    const glyph = effectiveMode() === '3d' ? key.label : ov?.emoji || ov?.label || key.label;
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
      if (effectiveMode() !== '3d') {
        if (ov.emoji) bits.push(ov.emoji);
        if (ov.label) bits.push(`“${ov.label}”`);
      }
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
  repositionMenu();
}

function closeKeycapDesigner(): void {
  kceEl?.classList.add('hidden');
  repositionMenu();
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
  document.querySelectorAll<HTMLButtonElement>('[data-rendermode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.rendermode === effectiveMode());
    btn.disabled = !modelModes(catList.find(c => c.id === settings.catBreed)).includes(btn.dataset.rendermode as '2d' | '3d');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-collar]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.collar === (settings.collarColor ?? 'none'));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-headphone]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.headphone === (settings.headphoneMode ?? 'off'));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-tailmode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tailmode === (settings.tailKeyMode ?? 'smart'));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-obstoggle]').forEach((btn) => {
    const on = btn.dataset.obstoggle === 'on';
    btn.classList.toggle('active', on === (settings.obsEnabled === true));
  });
  const obsHint = document.getElementById('obs-url-hint');
  if (obsHint) {
    obsHint.textContent = settings.obsEnabled
      ? `127.0.0.1:${settings.obsPort || 27421}`
      : '未开启';
  }
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
  engine3d?.setLightConfig(settings.keyboardLight);
  engine.setDeskSkin(activeDeskSkin());
  engine.setKeycapOverrides(settings.keycapOverrides);
  engine3d?.setKeycapOverrides(settings.keycapOverrides3d ?? settings.keycapOverrides);
  engine.setPropConfig(settings.propConfig);
  engine3d?.setPropConfig(settings.propConfig);
  engine.setIdleAutoEnabled(settings.idleActionsEnabled !== false);
  engine.setIdleDelaySec(settings.idleDelaySec ?? 6);
  engine3d?.setIdleDelaySec(settings.idleDelaySec ?? 6);
  engine.setMoodTrackingEnabled(settings.moodTrackingEnabled !== false);
  engine.setTailKeyConfig(settings.tailKeyMode ?? 'smart', settings.tailKeyIds ?? [...DEFAULT_TAIL_KEY_IDS]);
  // Keep the 3D engine (if loaded) in step, and swap renderers when the mode changes.
  activateRenderEngine();
  const idleAutoEl = document.getElementById('idle-auto') as HTMLInputElement | null;
  if (idleAutoEl) idleAutoEl.checked = settings.idleActionsEnabled !== false;
  const idleDelaySlider = document.getElementById('idle-delay-slider') as HTMLInputElement | null;
  if (idleDelaySlider) idleDelaySlider.value = String(Math.round(settings.idleDelaySec ?? 6));
  const idleDelayValue = document.getElementById('idle-delay-value');
  if (idleDelayValue) idleDelayValue.textContent = `${Math.round(settings.idleDelaySec ?? 6)} 秒`;
  if (!sliderDragging) {
    engine.setRenderScale(settings.scale);
  }
  catAudio.setEnabled(settings.soundEnabled);
  settings.inputSound = normalizeInputSound(settings.inputSound);
  inputSounds.configure(settings.inputSound);
  for (const kind of ['keyboard', 'mouse'] as const) {
    const el = document.getElementById('sound-' + kind) as HTMLInputElement | null;
    if (el) el.checked = settings.inputSound[kind];
  }
  const profile = document.getElementById('sound-profile') as HTMLSelectElement | null;
  if (profile) profile.value = settings.inputSound.profile;
  const volume = document.getElementById('sound-volume') as HTMLInputElement | null;
  if (volume) volume.value = String(Math.round(settings.inputSound.volume * 100));
  const volumeText = document.getElementById('sound-volume-value');
  if (volumeText) volumeText.textContent = Math.round(settings.inputSound.volume * 100) + '%';
  const modeName = effectiveMode() === '3d' ? '3D' : '2D';
  for (const id of ['keycap-mode-title', 'keycap-designer-title']) {
    const el = document.getElementById(id);
    if (el) el.textContent = modeName + (id === 'keycap-mode-title' ? ' 键帽 DIY · 独立保存' : ' 键帽设计器');
  }
  document.querySelectorAll<HTMLElement>('[data-model-only]').forEach((el) => {
    el.hidden = el.dataset.modelOnly !== effectiveMode();
  });
  const renderStatus = document.getElementById('render-mode-status');
  if (renderStatus) {
    renderStatus.hidden = !webgl3dUnavailable;
    renderStatus.textContent = '3D 加载失败，当前显示 2D 兼容预览。请检查显卡或 WebGL 支持后重启；3D 专属动作暂不可用。';
  }
  const allowedActions = modelActions(activeCat, webgl3dUnavailable ? '2d' : effectiveMode());
  document.querySelectorAll<HTMLButtonElement>('[data-idleaction]').forEach(btn => { btn.hidden = !allowedActions.includes(btn.dataset.idleaction ?? ''); });
  syncModelLibrary();
  const keycapHint = document.getElementById('kce-hint');
  if (keycapHint) keycapHint.textContent = effectiveMode() === '3d'
    ? '点选下方任意按键，再挑颜色；3D 当前支持顶面配色'
    : '点选下方任意按键，再挑颜色 / 图标';
  if (kceEl && !kceEl.classList.contains('hidden')) renderKeycapGrid();
  repositionMenu();
  pushHitRegions();
}

let lastHitRegionsJson = '';
let lastIdleSeq = 0;
let lastMoodSeq = 0;

/** MCP writes a mood request + seq; apply it once when the counter advances. */
function consumeMoodRequest(): void {
  const seq = settings.moodSeq ?? 0;
  if (seq <= lastMoodSeq) return;
  if (wants3DNow() && !active3d) return;
  lastMoodSeq = seq;
  const a = settings.moodAnnoyanceRequest;
  const d = settings.moodDizzyRequest;
  const ann = typeof a === 'number' && a >= 0 ? a : undefined;
  const dz = typeof d === 'number' && d >= 0 ? d : undefined;
  if (active3d) engine3d?.setMoodMeter(ann, dz);
  else engine.setMoodMeter(ann, dz);
}

/** MCP writes a request + seq; play it once when the counter advances. */
function consumeIdleRequest(): void {
  const seq = settings.idleActionSeq ?? 0;
  if (seq <= lastIdleSeq) return;
  if (wants3DNow() && !active3d) return; // keep pending while the 3D engine loads
  lastIdleSeq = seq;
  const kind = settings.idleActionRequest;
  const cat = catList.find(c => c.id === settings.catBreed) ?? catList[0];
  if (!kind || !modelActions(cat, active3d ? '3d' : '2d').includes(kind)) return;
  if (active3d) engine3d?.triggerIdleAction(kind);
  else engine.triggerIdleAction(kind);
}
function pushHitRegions(): void {
  // In 3D the framing differs completely from the 2D desk layout; using the 2D
  // regions marked the whole model as click-through, so nothing was clickable.
  const regions = active3d && engine3d ? engine3d.getHitRegions() : engine.getHitRegions();
  // The menu sits in the margin Rust reserves outside the pet box, so Rust needs
  // its rect too — otherwise clicks on the menu fall through to the desktop.
  if (!menuEl.classList.contains('hidden')) {
    const r = menuEl.getBoundingClientRect();
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    if (r.width > 2 && r.height > 2) {
      regions.menuBox = {
        cx: (r.left + r.width / 2) / vw,
        cy: (r.top + r.height / 2) / vh,
        rx: r.width / 2 / vw,
        ry: r.height / 2 / vh,
      };
    }
  }
  const json = JSON.stringify(regions);
  if (json === lastHitRegionsJson) return;
  lastHitRegionsJson = json;
  try {
    void Promise.resolve(invoke('set_hit_regions', { regions })).catch(() => {
      if (lastHitRegionsJson === json) lastHitRegionsJson = '';
    });
  } catch {
    lastHitRegionsJson = ''; // Retry once IPC is ready.
  }
}

let menuWindowQueue: Promise<unknown> = Promise.resolve();
function applyMenuPlacement(placement: { right: number; bottom: number } | null): void {
  setDesktopPetInsets(placement);
  engine.resize();
  engine3d?.resize();
  requestAnimationFrame(() => { repositionMenu(); pushHitRegions(); });
}
function requestMenuWindow(open: boolean): Promise<unknown> {
  menuWindowQueue = menuWindowQueue.catch(() => {}).then(async () => {
    const placement = await invoke<{ right: number; bottom: number } | null>('set_menu_open', { open });
    applyMenuPlacement(placement);
  });
  return menuWindowQueue;
}
function closeContextMenu(): Promise<void> {
  if (!menuEl.classList.contains('hidden')) {
    menuEl.classList.add('hidden');
    const closed = requestMenuWindow(false).catch(() => applyMenuPlacement(null));
    syncWin7OverlayFn?.(false);
    pushHitRegions();
    return closed.then(() => {});
  }
  return menuWindowQueue.then(() => {}, () => {});
}

/**
 * Places the menu beside the pet rather than on top of it.
 *
 * Native placement reserves room on the side that fits the monitor work area.
 * Shared viewport insets keep the pet fixed; the panel is clamped to that window.
 */
function repositionMenu(): void {
  if (menuEl.classList.contains('hidden')) return;
  const rect = menuEl.getBoundingClientRect();
  const pad = 8;
  const gap = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const pet = active3d && engine3d ? engine3d.getPetScreenRect() : engine.getPetScreenRect();
  const petLeft = pet.left;
  const petTop = pet.top;
  const petRight = pet.left + pet.width;
  const petBottom = pet.top + pet.height;

  const clampX = (x: number) => Math.max(pad, Math.min(x, Math.max(pad, vw - rect.width - pad)));
  const clampY = (y: number) => Math.max(pad, Math.min(y, Math.max(pad, vh - rect.height - pad)));

  let left: number;
  const leftOfPet = petLeft - rect.width - gap;
  const rightOfPet = petRight + gap;

  // Native layout reserves whichever margin fits inside the monitor work area.
  if (leftOfPet >= pad) {
    left = leftOfPet;
  } else if (rightOfPet + rect.width <= vw - pad) {
    left = rightOfPet;
  } else {
    // No horizontal room: sit above the pet, clamped on-screen.
    const above = petTop - rect.height - gap;
    left = clampX(petLeft + pet.width - rect.width);
    menuEl.style.left = `${left}px`;
    menuEl.style.top = `${clampY(above >= pad ? above : vh - rect.height - pad)}px`;
    pushHitRegions();
    return;
  }

  // Vertically align the menu's bottom with the pet's bottom so it reads as attached.
  const top = clampY(Math.min(petBottom - rect.height, vh - rect.height - pad));
  menuEl.style.left = `${clampX(left)}px`;
  menuEl.style.top = `${top}px`;
  // Keep Rust's click-through test in step with where the menu actually landed.
  pushHitRegions();
}

function openContextMenu(_clientX: number, _clientY: number): void {
  if (!menuEl.classList.contains('hidden')) { repositionMenu(); return; }
  syncMenuUI();
  menuEl.style.visibility = 'hidden';
  menuEl.classList.remove('hidden');
  void requestMenuWindow(true).catch(() => applyMenuPlacement(null)).finally(() => {
    requestAnimationFrame(() => {
      repositionMenu();
      menuEl.style.visibility = '';
      pushHitRegions();
    });
  });
  syncWin7OverlayFn?.(true);
}

const settingsSync = new SettingsSync<AppSettings>(settings,
  () => invoke<AppSettings>('get_settings'),
  (patch) => invoke('update_settings', { patch }),
  (value) => { settings = value; syncMenuUI(); },
);

async function applySettingsPatch(patch: Partial<AppSettings>): Promise<void> {
  try { await settingsSync.update(patch); }
  catch (err) { console.warn('update_settings failed:', err); }
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

async function copyObsUrl(): Promise<void> {
  const hint = document.getElementById('obs-url-hint');
  try {
    const url = await invoke<string>('get_obs_url');
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const ta = document.createElement('textarea');
      ta.value = url;
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
        hint.textContent = settings.obsEnabled
          ? `127.0.0.1:${settings.obsPort || 27421}`
          : '未开启';
        hint.classList.remove('copied');
      }, 1800);
    }
  } catch (err) {
    console.error('Failed to copy OBS url:', err);
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
  options: {
    showInstall?: boolean;
    showOpen?: boolean;
    showUnlock?: boolean;
    autoHideMs?: number;
    busy?: boolean;
  } = {},
): void {
  if (toastAutoHideTimer !== null) {
    window.clearTimeout(toastAutoHideTimer);
    toastAutoHideTimer = null;
  }
  updateToastTextEl.textContent = text;
  btnToastInstallEl.classList.toggle('hidden', !options.showInstall);
  btnToastInstallEl.disabled = Boolean(options.busy);
  btnToastOpenEl.classList.toggle('hidden', !(options.showOpen || options.showUnlock));
  btnToastOpenEl.textContent = options.showUnlock ? '解锁' : '发布页';
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
  // Left-click drag to reposition the transparent window.
  // Bound to BOTH canvases: the 3D canvas is stacked on top and would otherwise
  // swallow every pointer event, leaving the 3D pet undraggable and unselectable.
  let dragBusy = false;
  const onCanvasPointerDown = async (e: MouseEvent, source: HTMLCanvasElement): Promise<void> => {
    if (e.button !== 0 || dragBusy) return;
    const menuClosed = closeContextMenu();
    if (settings.clickThroughLocked && !altOverride && !e.altKey) return;
    // Clicking the drink refills an empty cup instead of dragging the window.
    if (active3d && engine3d) {
      if (engine3d.hitTestProp(e.clientX, e.clientY)) {
        const result = engine3d.clickProp();
        if (result === 'refilled') {
          showUpdateToast('🥤 已续杯，猫猫又有饮料啦', { autoHideMs: 2400 });
        } else if (result === 'sipped') {
          showUpdateToast('🐾 猫猫准备尝一口', { autoHideMs: 1800 });
        }
        return;
      }
    } else {
      const logicalPt = engine.clientToLogical(e.clientX, e.clientY);
      if (engine.hitTestProp(logicalPt.x, logicalPt.y)) {
        const result = engine.clickProp();
        if (result === 'refilled') {
          showUpdateToast('🥤 已续杯，猫猫又有饮料啦', { autoHideMs: 2400 });
        } else if (result === 'sipped') {
          showUpdateToast('🐾 猫猫准备尝一口', { autoHideMs: 1800 });
        }
        return;
      }
    }
    dragBusy = true;
    source.classList.add('pet-dragging');
    try {
      await invoke('set_dragging', { dragging: true });
      await menuClosed; // Restore the pet window before native dragging.
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.warn('pet dragging failed:', err);
    } finally {
      source.classList.remove('pet-dragging');
      engine.onMouseUp('left');
      engine3d?.onMouseUp('left');
      await invoke('set_dragging', { dragging: false }).catch(() => {});
      dragBusy = false;
      void invoke('save_window_pos').catch(() => {});
    }
  };
  canvas.addEventListener('mousedown', (e) => void onCanvasPointerDown(e, canvas));
  canvas3d?.addEventListener('mousedown', (e) => void onCanvasPointerDown(e, canvas3d));

  // Right-click opens sleek dark glass settings menu
  const onCanvasContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    if (settings.clickThroughLocked && !altOverride && !e.altKey) return;
    openContextMenu(e.clientX, e.clientY);
  };
  canvas.addEventListener('contextmenu', onCanvasContextMenu);
  canvas3d?.addEventListener('contextmenu', onCanvasContextMenu);

  window.addEventListener('blur', () => closeContextMenu());
  // The window grows/shrinks when the menu opens or the user changes scale, so the
  // menu must re-anchor against the pet's new screen box rather than its old one.
  window.addEventListener('resize', () => { repositionMenu(); pushHitRegions(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeContextMenu();
  });

  engine.start();
  pushHitRegions();
  window.setInterval(pushHitRegions, 160);

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
    settingsSync.accept(loadedSettings);
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
    // Issue #41: the click-through lock now survives restarts, so on launch show a
    // short escape hatch. Alt/Option always unlocks too, and the tray mirrors state.
    if (settings.clickThroughLocked) {
      showUpdateToast('🔒 穿透锁定已恢复 · 点此或按住 Alt 解锁', {
        showUnlock: true,
        autoHideMs: 9000,
      });
    }
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
    // Doubles as the "unlock click-through" escape hatch on launch (Issue #41).
    if (settings.clickThroughLocked) {
      void applySettingsPatch({ clickThroughLocked: false });
      hideUpdateToast();
      return;
    }
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
      engine3d?.setRenderScale(nextScale);
      pushHitRegions();
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

  // Silence before random idle actions; applies live while dragging.
  const idleDelaySliderEl = document.getElementById('idle-delay-slider') as HTMLInputElement | null;
  if (idleDelaySliderEl) {
    idleDelaySliderEl.addEventListener('input', () => {
      const sec = Math.max(2, Math.min(60, Number(idleDelaySliderEl.value) || 6));
      const label = document.getElementById('idle-delay-value');
      if (label) label.textContent = `${sec} 秒`;
      engine.setIdleDelaySec(sec);
      engine3d?.setIdleDelaySec(sec);
    });
    idleDelaySliderEl.addEventListener('change', () => {
      const sec = Math.max(2, Math.min(60, Number(idleDelaySliderEl.value) || 6));
      void applySettingsPatch({ idleDelaySec: sec });
    });
  }

  // WebView audio unlock needs a trusted gesture; global hooks must not queue old clicks.
  document.addEventListener('pointerdown', () => inputSoundsEnabled() && catAudio.unlock(), { capture: true });
  document.addEventListener('keydown', () => inputSoundsEnabled() && catAudio.unlock(), { capture: true });
  function inputSoundsEnabled(): boolean {
    return settings.soundEnabled || settings.inputSound?.keyboard || settings.inputSound?.mouse;
  }
  for (const kind of ['keyboard', 'mouse'] as const) {
    document.getElementById('sound-' + kind)?.addEventListener('change', (event) => {
      void applySettingsPatch({ inputSound: { ...normalizeInputSound(settings.inputSound), [kind]: (event.target as HTMLInputElement).checked } });
    });
    document.getElementById('preview-' + kind)?.addEventListener('click', () => void inputSounds.preview(kind));
  }
  document.getElementById('sound-profile')?.addEventListener('change', (event) => {
    const profile = (event.target as HTMLSelectElement).value as InputSoundConfig['profile'];
    void applySettingsPatch({ inputSound: { ...normalizeInputSound(settings.inputSound), profile } });
  });
  const soundVolume = document.getElementById('sound-volume') as HTMLInputElement | null;
  soundVolume?.addEventListener('input', () => {
    settings.inputSound = { ...normalizeInputSound(settings.inputSound), volume: Number(soundVolume.value) / 100 };
    inputSounds.configure(settings.inputSound);
    document.getElementById('sound-volume-value')!.textContent = soundVolume.value + '%';
  });
  soundVolume?.addEventListener('change', () => void applySettingsPatch({ inputSound: settings.inputSound }));

  syncModelLibrary = setupModelLibrary({
    current: () => ({ cat: catList.find(c => c.id === settings.catBreed), mode: webgl3dUnavailable ? '2d' : effectiveMode() }),
    models: () => catList,
    activate: async id => {
      const cat = catList.find(c => c.id === id);
      if (!cat) throw Error('模型已被删除，请重新选择');
      await settingsSync.update({ catBreed: cat.id, renderMode: modelMode(cat, effectiveMode()) });
    },
    remove: async id => {
      catList = await invoke<CatSkinConfig[]>('delete_model_pack', { id });
      await settingsSync.refresh();
      syncMenuUI();
    },
    openExports: async () => { await invoke('open_model_exports'); },
    openPage: async url => { await invoke('open_release_page', { url }); },
    install: async (packageValue, replace) => {
      const cat = await invoke<CatSkinConfig>('import_model_pack', { package: packageValue, replace });
      catList = catList.filter(c => c.id !== cat.id).concat(cat);
      await settingsSync.update({ catBreed: cat.id, renderMode: modelMode(cat, effectiveMode()) });
    },
    export: async id => invoke<string>('export_model_pack', { id }),
    resize: () => { repositionMenu(); pushHitRegions(); },
  });

  // ---- Keycap designer ----
  // Tab switching (menu stays a single scroll-free panel per tab).
  document.querySelectorAll<HTMLButtonElement>('.menu-tab-btn').forEach((btn) => {
    btn.addEventListener('keydown', (event) => {
      const tabs = [...document.querySelectorAll<HTMLButtonElement>('.menu-tab-btn')];
      const index = tabs.indexOf(btn);
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault();
      tabs[next].click(); tabs[next].focus();
    });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tab = btn.dataset.tab ?? 'appearance';
      document.querySelectorAll('.menu-tab-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
        (b as HTMLButtonElement).tabIndex = b === btn ? 0 : -1;
      });
      document.querySelectorAll<HTMLElement>('[data-tab-panel]').forEach((p) => {
        p.classList.toggle('active', p.dataset.tabPanel === tab);
      });
      // Re-anchor so the shorter panel never overhangs the pet.
      repositionMenu();
    });
  });

  document.getElementById('btn-close-menu')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeContextMenu();
  });

  document.getElementById('btn-copy-obs-url')?.addEventListener('click', (e) => {
    e.stopPropagation();
    void copyObsUrl();
  });

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
    saveActiveKeycaps({});
    renderKeycapGrid();
  });

  await safeListen<AppSettings>('kuro-settings', () => {
    void settingsSync.refresh().then(() => {
      const prevLock = lastKnownLockState;
      lastKnownLockState = settings.clickThroughLocked;
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
    }).catch((err) => console.warn('settings refresh failed:', err));
  });
  // Close the initial get/listen gap, including changes made from the tray during startup.
  await settingsSync.refresh().catch(() => {});

  await safeListen<CatSkinConfig[]>('kuro-cats', (ev) => {
    if (Array.isArray(ev.payload) && ev.payload.length > 0) {
      catList = ev.payload;
      syncMenuUI();
    }
  });

  await safeListen<{ right: number; bottom: number }>('kuro-menu-layout', (ev) => applyMenuPlacement(ev.payload));

  await safeListen<InputEvent>('kuro-input', (ev) => {
    const p = ev.payload;
    if (!privacyActive) {
      if (p.kind === 'keyDown') inputSounds.keyDown(p.repeat);
      if (p.kind === 'mouseDown') inputSounds.mouseDown(p.button);
    }
    // Only the visible engine receives input. Audio plays once per hook event.
    const targets = active3d && engine3d ? [engine3d] : [engine];
    for (const eng of targets) {
      switch (p.kind) {
        case 'keyDown':
          eng.onKeyDown(p.vk, p.repeat);
          break;
        case 'keyUp':
          eng.onKeyUp(p.vk);
          break;
        case 'mouseMove':
          eng.onGlobalMouseMove(p.nx, p.ny);
          break;
        case 'mouseDown':
          eng.onMouseDown(p.button);
          break;
        case 'mouseUp':
          eng.onMouseUp(p.button);
          break;
        case 'mouseWheel':
          eng.onMouseWheel();
          break;
        case 'privacyTyping':
          eng.onPrivacyTyping();
          break;
      }
    }
  });

  await safeListen<boolean>('kuro-game-active', (ev) => {
    gameActive = Boolean(ev.payload);
    engine3d?.setGameActive(gameActive);
    engine3d?.setHeadphones(shouldWearHeadphonesNow());
  });

  await safeListen<boolean>('kuro-privacy', (ev) => {
    privacyActive = Boolean(ev.payload);
    inputSounds.setPrivacy(privacyActive);
    engine.setPrivacyMode(privacyActive);
    engine3d?.setPrivacyMode(privacyActive);
  });

  await safeListen<WindowCursorInfo>('kuro-cursor', (ev) => {
    const c = ev.payload;
    altOverride = Boolean(c.altOverride);
    if (active3d && engine3d) {
      engine3d.onWindowCursor(c.relX, c.relY, c.overCat);
    } else {
      engine.onWindowCursor(c.relX, c.relY, c.overCat);
    }
    const interactive = !settings.clickThroughLocked || altOverride;
    canvas.classList.toggle('pet-hover', c.overCat && interactive);
    canvas3d?.classList.toggle('pet-hover', c.overCat && interactive);
  });

  menuEl.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-action], [data-scale], [data-breed], [data-kblayout], [data-kborient], [data-mouseorient], [data-rendermode], [data-collar], [data-headphone], [data-tailmode], [data-obstoggle], [data-lightfx], [data-lightcolor], [data-lightpreset], [data-lightmode], [data-palettecolor], [data-edgelight], [data-backlit], [data-deskskin], [data-propkind], [data-propside], [data-idleaction], [data-diy], [data-kcedit], [data-kcswatch], [data-kcclear], [data-kcemoji]',
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

    const backlit = target.dataset.backlit;
    if (backlit) {
      patchLight({ backlitCaps: backlit === 'on' });
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
      if (active3d && engine3d) engine3d.triggerIdleAction(idleAction, true);
      else engine.triggerIdleAction(idleAction, true);
      closeContextMenu();
      return;
    }

    const diy = target.dataset.diy;
    if (diy) {
      if (diy === 'clear') {
        saveActiveKeycaps({});
      } else {
        const preset = KEYCAP_DIY_PRESETS[diy];
        if (preset) {
          const merged = { ...activeKeycaps(), ...preset };
          saveActiveKeycaps(merged);
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

    const renderModeAttr = target.dataset.rendermode;
    if (renderModeAttr === '2d' || renderModeAttr === '3d') {
      void applySettingsPatch({ renderMode: renderModeAttr });
      closeContextMenu();
      return;
    }

    const collarAttr = target.dataset.collar;
    if (collarAttr) {
      void applySettingsPatch({ collarColor: collarAttr });
      return;
    }

    const headphoneAttr = target.dataset.headphone;
    if (headphoneAttr === 'auto' || headphoneAttr === 'on' || headphoneAttr === 'off') {
      void applySettingsPatch({ headphoneMode: headphoneAttr });
      return;
    }

    const tailModeAttr = target.dataset.tailmode;
    if (tailModeAttr === 'smart' || tailModeAttr === 'edge' || tailModeAttr === 'off') {
      void applySettingsPatch({ tailKeyMode: tailModeAttr });
      return;
    }

    const obsToggle = target.dataset.obstoggle;
    if (obsToggle === 'on' || obsToggle === 'off') {
      void applySettingsPatch({ obsEnabled: obsToggle === 'on' });
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
      void applySettingsPatch({ catBreed: breedAttr, renderMode: modelMode(catList.find(c => c.id === breedAttr), effectiveMode()) });
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
