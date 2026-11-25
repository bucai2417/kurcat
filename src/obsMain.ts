import {
  DEFAULT_TAIL_KEY_IDS,
  KuroCatEngine,
  type KeyboardOrientation,
  type TailKeyMode,
} from './catEngine';
import { catAudio } from './audio';
import { modelMode, modelActions } from './modelPack';
import { normalizePropConfig, type PropConfig } from './prop';
import { normalizeLightConfig, type KeyboardLightConfig } from './keyboardLight';
import type { KeycapOverride } from './deskSkin';
import type { MouseOrientation } from './deskMetrics';
import { DEFAULT_BUILTIN_CATS, type CatSkinConfig } from './catSkins';
import type { KeyboardLayoutId } from './keyboardLayout';
import type { CollarColorId, KuroCatEngine3D } from './catEngine3d';

type ObsRenderMode = '2d' | '3d';
type ObsHeadphoneMode = 'auto' | 'on' | 'off';

interface ObsAppSettings {
  scale?: number;
  showKeyBubbles?: boolean;
  catBreed?: string;
  keyboardLayout?: KeyboardLayoutId;
  keyboardOrientation?: KeyboardOrientation;
  tailKeyMode?: TailKeyMode;
  tailKeyIds?: string[];
  renderMode?: ObsRenderMode;
  collarColor?: CollarColorId;
  headphoneMode?: ObsHeadphoneMode;
  propConfig?: PropConfig;
  keyboardLight?: KeyboardLightConfig;
  keycapOverrides?: Record<string, KeycapOverride>;
  keycapOverrides3d?: Record<string, KeycapOverride> | null;
  mouseOrientation?: MouseOrientation;
  idleActionsEnabled?: boolean;
  idleDelaySec?: number;
  moodTrackingEnabled?: boolean;
  idleActionRequest?: string;
  idleActionSeq?: number;
  moodSeq?: number;
  moodAnnoyanceRequest?: number;
  moodDizzyRequest?: number;
}

type InputEvent =
  | { kind: 'keyDown'; vk: number; scan: number; repeat: boolean }
  | { kind: 'keyUp'; vk: number; scan: number }
  | { kind: 'mouseDown'; button: string }
  | { kind: 'mouseUp'; button: string }
  | { kind: 'mouseWheel'; delta: number }
  | { kind: 'mouseMove'; x: number; y: number; nx: number; ny: number }
  | { kind: 'privacyTyping' };

interface ObsStateSnapshot {
  settings?: ObsAppSettings;
  cats?: CatSkinConfig[];
  privacy?: boolean;
  gameActive?: boolean;
}

const canvas = document.getElementById('obs-canvas') as HTMLCanvasElement;
const canvas3d = document.getElementById('obs-canvas-3d') as HTMLCanvasElement;
const engine = new KuroCatEngine(canvas);

let engine3d: KuroCatEngine3D | null = null;
let loading3d: Promise<void> | null = null;
let active3d = false;
let webglBlocked = false;
let privacyActive = false;
let gameActive = false;
let lastIdleSeq: number | null = null;
let lastMoodSeq: number | null = null;

function syncBehavior(target: KuroCatEngine | KuroCatEngine3D): void {
  target.setIdleAutoEnabled(currentSettings.idleActionsEnabled !== false);
  target.setIdleDelaySec(currentSettings.idleDelaySec ?? 6);
  target.setMoodTrackingEnabled(currentSettings.moodTrackingEnabled !== false);
  target.setMouseOrientation(currentSettings.mouseOrientation ?? 'auto');
  target.setPropConfig(normalizePropConfig(currentSettings.propConfig));
  target.setLightConfig(normalizeLightConfig(currentSettings.keyboardLight));
}

function consumeRequests(cat: CatSkinConfig | undefined, mode: ObsRenderMode): void {
  if (lastIdleSeq === null || lastMoodSeq === null) return; // wait for first server snapshot
  if (mode === '3d' && !webglBlocked && !active3d) return;
  const target = active3d && engine3d ? engine3d : engine;
  const idleSeq = currentSettings.idleActionSeq ?? 0;
  const moodSeq = currentSettings.moodSeq ?? 0;
  if (idleSeq !== lastIdleSeq) {
    lastIdleSeq = idleSeq;
    const kind = currentSettings.idleActionRequest ?? '';
    if (modelActions(cat, active3d ? '3d' : '2d').includes(kind)) target.triggerIdleAction(kind);
  }
  if (moodSeq !== lastMoodSeq) {
    lastMoodSeq = moodSeq;
    const a = currentSettings.moodAnnoyanceRequest ?? -1;
    const d = currentSettings.moodDizzyRequest ?? -1;
    target.setMoodMeter(a >= 0 ? a : undefined, d >= 0 ? d : undefined);
  }
}

// Mute audio inside OBS Browser Source so purring never double-plays on stream
catAudio.setEnabled(false);

// Optional query overrides for streamers (e.g. /obs?mode=3d&collar=red&scale=1.15&bubbles=0&breed=ragdoll&layout=108&orient=viewer)
const params = new URLSearchParams(window.location.search);
const overrideBreed = params.get('breed')?.trim() || null;
const overrideModeRaw = params.get('mode')?.trim().toLowerCase() || null;
const overrideMode: ObsRenderMode | null =
  overrideModeRaw === '3d' || overrideModeRaw === '3d-flat'
    ? '3d'
    : overrideModeRaw === '2d'
      ? '2d'
      : null;
const overrideCollarRaw = params.get('collar')?.trim().toLowerCase() || null;
const overrideCollar: CollarColorId | null =
  overrideCollarRaw === 'none' ||
  overrideCollarRaw === 'red' ||
  overrideCollarRaw === 'blue' ||
  overrideCollarRaw === 'pink' ||
  overrideCollarRaw === 'green'
    ? overrideCollarRaw
    : null;
const overrideHeadphoneRaw = params.get('headphones')?.trim().toLowerCase() || null;
const overrideHeadphones: ObsHeadphoneMode | null =
  overrideHeadphoneRaw === 'auto' || overrideHeadphoneRaw === 'on' || overrideHeadphoneRaw === 'off'
    ? overrideHeadphoneRaw
    : null;
const overrideLayout = params.get('layout') === '108' ? '108' : params.get('layout') === '65' ? '65' : null;
const overrideOrient = params.get('orient') === 'viewer' ? 'viewer' : params.get('orient') === 'cat' ? 'cat' : null;
const overrideBubbles = params.has('bubbles') ? params.get('bubbles') !== '0' && params.get('bubbles') !== 'false' : null;
const rawScaleParam = params.get('scale');
const overrideScale =
  rawScaleParam !== null && Number.isFinite(Number(rawScaleParam))
    ? Math.max(0.2, Math.min(2.0, Number(rawScaleParam)))
    : null;

let catList: CatSkinConfig[] = [...DEFAULT_BUILTIN_CATS];
let currentSettings: ObsAppSettings = {
  scale: 1,
  showKeyBubbles: true,
  catBreed: 'black',
  keyboardLayout: '65',
  keyboardOrientation: 'cat',
  tailKeyMode: 'smart',
  tailKeyIds: [...DEFAULT_TAIL_KEY_IDS],
  renderMode: '3d',
  collarColor: 'none',
  headphoneMode: 'off',
};

function computeObsHeadphonesOn(activeCat: CatSkinConfig | undefined): boolean {
  if (activeCat?.id === 'dafeiyu') return false;
  const hm: ObsHeadphoneMode =
    overrideHeadphones ||
    (currentSettings.headphoneMode === 'auto' || currentSettings.headphoneMode === 'on'
      ? currentSettings.headphoneMode
      : 'off');
  if (hm === 'on') return true;
  if (hm === 'off') return false;
  return gameActive;
}

function syncObs3D(
  activeCat: CatSkinConfig | undefined,
  mode: ObsRenderMode,
  collar: CollarColorId,
  layout: KeyboardLayoutId,
  orient: KeyboardOrientation,
  tailMode: TailKeyMode,
  tailIds: string[],
  showBubbles: boolean,
): void {
  const want3d = mode === '3d' && activeCat?.id !== 'dafeiyu' && !webglBlocked;
  if (!want3d) {
    if (active3d) {
      engine3d?.stop();
      canvas3d.classList.add('hidden');
      canvas.classList.remove('hidden');
      engine.resize();
      engine.start();
      active3d = false;
    }
    return;
  }

  if (engine3d) {
    engine3d.showKeyBubbles = showBubbles;
    engine3d.setRenderStyle('3d');
    if (activeCat) engine3d.setCatSkin(activeCat);
    engine3d.setCollar(collar);
    engine3d.setHeadphones(computeObsHeadphonesOn(activeCat));
    engine3d.setKeyboardConfig(layout, orient);
    engine3d.setTailKeyConfig(tailMode, tailIds);
    engine3d.setRenderScale(overrideScale ?? 1.0);
    engine3d.setPrivacyMode(privacyActive);
    engine3d.setGameActive(gameActive);
    syncBehavior(engine3d);
    engine3d.setKeycapOverrides(currentSettings.keycapOverrides3d ?? currentSettings.keycapOverrides ?? {});
    if (!active3d) {
      engine.stop();
      canvas.classList.add('hidden');
      canvas3d.classList.remove('hidden');
      engine3d.resize();
      engine3d.start();
      active3d = true;
    }
    return;
  }

  if (!loading3d) {
    loading3d = import('./catEngine3d')
      .then(({ KuroCatEngine3D }) => {
        engine3d = new KuroCatEngine3D(canvas3d, { embedded: false });
        window.addEventListener('resize', () => engine3d?.resize());
        applyState();
      })
      .catch((err) => {
        console.warn('OBS 3D unavailable; using 2D compatibility preview:', err);
        webglBlocked = true;
        applyState();
      })
      .finally(() => {
        loading3d = null;
      });
  }
}

function applyState(): void {
  const breedId = overrideBreed || currentSettings.catBreed || 'black';
  const activeCat = catList.find((c) => c.id === breedId) ?? catList[0];
  const layout: KeyboardLayoutId =
    overrideLayout || (currentSettings.keyboardLayout === '108' ? '108' : '65');
  const orient: KeyboardOrientation =
    overrideOrient || (currentSettings.keyboardOrientation === 'viewer' ? 'viewer' : 'cat');
  const tailMode: TailKeyMode =
    currentSettings.tailKeyMode === 'custom' ||
    currentSettings.tailKeyMode === 'edge' ||
    currentSettings.tailKeyMode === 'off'
      ? currentSettings.tailKeyMode
      : 'smart';
  const tailIds = Array.isArray(currentSettings.tailKeyIds)
    ? currentSettings.tailKeyIds
    : [...DEFAULT_TAIL_KEY_IDS];
  const showBubbles =
    overrideBubbles !== null ? overrideBubbles : currentSettings.showKeyBubbles !== false;
  const mode = modelMode(activeCat, overrideMode || (currentSettings.renderMode === '2d' ? '2d' : '3d'));
  const collar: CollarColorId =
    overrideCollar ||
    (currentSettings.collarColor === 'red' ||
    currentSettings.collarColor === 'blue' ||
    currentSettings.collarColor === 'pink' ||
    currentSettings.collarColor === 'green'
      ? currentSettings.collarColor
      : 'none');

  engine.showKeyBubbles = showBubbles;
  engine.setCatAppearance(activeCat?.id || 'black', activeCat);
  engine.setHeadphones(computeObsHeadphonesOn(activeCat));
  engine.setKeyboardConfig(layout, orient);
  engine.setTailKeyConfig(tailMode, tailIds);
  engine.setRenderScale(overrideScale ?? 1.0);
  syncBehavior(engine);
  engine.setKeycapOverrides(currentSettings.keycapOverrides);
  syncObs3D(activeCat, mode, collar, layout, orient, tailMode, tailIds, showBubbles);
  consumeRequests(activeCat, mode);
}

function handleInput(p: InputEvent): void {
  switch (p.kind) {
    case 'keyDown':
      if (active3d && engine3d) engine3d.onKeyDown(p.vk, p.repeat);
      else engine.onKeyDown(p.vk, p.repeat);
      break;
    case 'keyUp':
      if (active3d && engine3d) engine3d.onKeyUp(p.vk);
      else engine.onKeyUp(p.vk);
      break;
    case 'mouseMove':
      if (active3d && engine3d) {
        engine3d.onGlobalMouseMove(p.nx, p.ny);
        engine3d.onWindowCursor(p.nx, p.ny, false);
      } else {
        engine.onGlobalMouseMove(p.nx, p.ny);
        engine.onWindowCursor(p.nx, p.ny, false);
      }
      break;
    case 'mouseDown':
      if (active3d && engine3d) engine3d.onMouseDown(p.button);
      else engine.onMouseDown(p.button);
      break;
    case 'mouseUp':
      if (active3d && engine3d) engine3d.onMouseUp(p.button);
      else engine.onMouseUp(p.button);
      break;
    case 'mouseWheel':
      if (active3d && engine3d) engine3d.onMouseWheel();
      else engine.onMouseWheel();
      break;
    case 'privacyTyping':
      if (active3d && engine3d) engine3d.onPrivacyTyping();
      else engine.onPrivacyTyping();
      break;
  }
}

function connectStream(): void {
  const es = new EventSource('/obs/events');

  es.addEventListener('state', (ev) => {
    try {
      const snap = JSON.parse((ev as MessageEvent).data) as ObsStateSnapshot;
      if (Array.isArray(snap.cats) && snap.cats.length > 0) {
        catList = snap.cats;
      }
      if (snap.settings) {
        currentSettings = { ...currentSettings, ...snap.settings };
        // Reconnecting must not replay historical commands.
        lastIdleSeq = currentSettings.idleActionSeq ?? 0;
        lastMoodSeq = currentSettings.moodSeq ?? 0;
      }
      if (typeof snap.privacy === 'boolean') {
        privacyActive = snap.privacy;
        engine.setPrivacyMode(privacyActive);
        engine3d?.setPrivacyMode(privacyActive);
      }
      if (typeof snap.gameActive === 'boolean') {
        gameActive = snap.gameActive;
      }
      applyState();
    } catch {}
  });

  es.addEventListener('settings', (ev) => {
    try {
      const next = JSON.parse((ev as MessageEvent).data) as ObsAppSettings;
      currentSettings = { ...currentSettings, ...next };
      applyState();
    } catch {}
  });

  es.addEventListener('cats', (ev) => {
    try {
      const next = JSON.parse((ev as MessageEvent).data) as CatSkinConfig[];
      if (Array.isArray(next) && next.length > 0) {
        catList = next;
        applyState();
      }
    } catch {}
  });

  es.addEventListener('privacy', (ev) => {
    try {
      const active = JSON.parse((ev as MessageEvent).data) === true;
      privacyActive = active;
      engine.setPrivacyMode(active);
      engine3d?.setPrivacyMode(active);
    } catch {}
  });

  es.addEventListener('gameActive', (ev) => {
    try {
      const parsed = JSON.parse((ev as MessageEvent).data) as boolean | { active?: boolean };
      gameActive = typeof parsed === 'boolean' ? parsed : Boolean(parsed?.active);
      applyState();
    } catch {}
  });

  es.addEventListener('input', (ev) => {
    try {
      const payload = JSON.parse((ev as MessageEvent).data) as InputEvent;
      handleInput(payload);
    } catch {}
  });
}

applyState();
engine.start();
connectStream();
