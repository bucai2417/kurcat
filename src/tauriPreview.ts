/**
 * Browser preview shim.
 *
 * The app talks to Rust through `@tauri-apps/api`. When `index.html` is opened in
 * a plain browser (no Tauri runtime) every call would throw, so this module installs
 * a small in-memory stand-in backed by localStorage. It lets you exercise the exact
 * shipped UI — right-click menu, keycap designer, lights, props, skins — without
 * building the desktop binary.
 *
 * Returns `true` when the shim is active (i.e. we are in a browser preview).
 */
import { DEFAULT_BUILTIN_CATS, type CatSkinConfig } from './catSkins';
import { parseModelPack, exportModelPack } from './modelPack';

type EventHandler = (event: { event: string; id: number; payload: unknown }) => void;

interface PreviewStore {
  settings?: Record<string, unknown>;
  cats?: unknown[];
  deskSkins?: unknown[];
}

const STORAGE_KEY = 'kurocat-preview-v1';

const DEFAULT_SETTINGS = {
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
  keyboardScale65: 1,
  keyboardScale108: 0.85,
  mouseOrientation: 'auto',
  keyboardLight: {
    enabled: false,
    effect: 'breath',
    color: '#d2f244',
    color2: '#8cb014',
    palette: ['#ff3b6b', '#ff9a3c', '#ffe14d', '#7ee8a6', '#00e5ff', '#6b8bff', '#c56bff', '#ff6bd6'],
    colorMode: 'solid',
    edgeLight: false,
    speed: 1,
    brightness: 0.75,
    reactive: true,
    underglow: true,
    zone: 'all',
    backlitCaps: false,
  },
  deskSkinId: 'classic-cream',
  propConfig: {
    enabled: false,
    kind: 'coffee',
    side: 'right',
    autoSip: true,
    sipIntervalMin: 45,
    sipIntervalMax: 110,
  },
  keycapOverrides: {},
  keycapOverrides3d: null,
  inputSound: { keyboard: false, mouse: false, profile: 'linear', volume: 0.35 },
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
  tailKeyIds: ['enter', 'space', 'bs', 'esc'],
  obsEnabled: false,
  obsPort: 27421,
  obsHidePet: false,
  privacyPasswordGuard: true,
};

export function installTauriPreviewShim(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  if (w.__TAURI_INTERNALS__) return false; // Real Tauri runtime: do nothing.

  let store: PreviewStore = {};
  try {
    store = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as PreviewStore;
  } catch {
    store = {};
  }
  store.settings = { ...DEFAULT_SETTINGS, ...(store.settings || {}) };
  store.settings.keycapOverrides3d ??= { ...(store.settings.keycapOverrides as Record<string, unknown> ?? {}) };
  store.cats ??= [];
  store.deskSkins ??= [];

  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      /* storage may be unavailable (private mode); preview still works in memory */
    }
  };

  const callbacks = new Map<number, EventHandler>();
  const listeners = new Map<string, Set<number>>();
  let nextCallbackId = 1;

  const emit = (event: string, payload: unknown) => {
    const ids = listeners.get(event);
    if (!ids) return;
    for (const id of ids) {
      const cb = callbacks.get(id);
      if (cb) {
        try {
          cb({ event, id, payload });
        } catch (err) {
          console.warn('[preview] listener error', err);
        }
      }
    }
  };

  const settings = () => (store.settings ?? {}) as Record<string, unknown>;

  const invoke = async (cmd: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    switch (cmd) {
      case 'get_settings':
        return { ...settings() };
      case 'update_settings': {
        store.settings = { ...settings(), ...(args.patch as Record<string, unknown>) };
        persist();
        const next = { ...settings() };
        queueMicrotask(() => emit('kuro-settings', next));
        return next;
      }
      case 'get_cats':
        return [...DEFAULT_BUILTIN_CATS, ...(store.cats ?? [])];
      case 'import_model_pack': {
        const pack = parseModelPack(args.package);
        const cats = (store.cats ?? []) as CatSkinConfig[];
        if (!args.replace && cats.some(c => c.id === pack.skin.id)) throw Error('该模型 ID 已存在；请选择替换，或修改模型包的 ID');
        store.cats = cats.filter(c => c.id !== pack.skin.id).concat(pack.skin); persist();
        queueMicrotask(() => emit('kuro-cats', [...DEFAULT_BUILTIN_CATS, ...store.cats!]));
        return pack.skin;
      }
      case 'delete_model_pack': {
        const id = String(args.id ?? '');
        if (DEFAULT_BUILTIN_CATS.some(c => c.id === id)) throw Error('内置模型不能删除');
        const cats = (store.cats ?? []) as CatSkinConfig[];
        if (!cats.some(c => c.id === id)) throw Error('模型不存在或已被删除');
        store.cats = cats.filter(c => c.id !== id);
        if (settings().catBreed === id) store.settings = { ...settings(), catBreed: 'black' };
        persist();
        const result = [...DEFAULT_BUILTIN_CATS, ...store.cats];
        queueMicrotask(() => { emit('kuro-cats', result); emit('kuro-settings', { ...settings() }); });
        return result;
      }
      case 'open_model_exports':
        throw Error('浏览器预览会将模型保存到下载目录，请从浏览器下载记录中打开；桌面版可直接打开导出文件夹');
      case 'export_model_pack': {
        const cat = [...DEFAULT_BUILTIN_CATS, ...((store.cats ?? []) as CatSkinConfig[])].find(c => c.id === args.id);
        if (!cat) throw Error('模型不存在');
        const pack = exportModelPack(cat); const name = pack.skin.id + '.kurocat.json';
        const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return '已交给浏览器下载：' + name;
      }
      case 'get_desk_skins':
        return store.deskSkins ?? [];
      case 'get_app_version':
        return '1.0.0-preview';
      case 'get_mcp_config':
        return JSON.stringify(
          { mcpServers: { kurocat: { url: 'http://127.0.0.1:27420/mcp' } } },
          null,
          2,
        );
      case 'check_for_update':
        return {
          currentVersion: '1.0.0',
          latestVersion: '1.0.0',
          hasUpdate: false,
          releaseUrl: 'https://github.com/bucai2417/kurcat/releases',
          assetName: null,
          downloadUrl: null,
          assetSha256: null,
          assetSize: null,
          installKind: 'preview',
          notesSummary: '',
        };
      case 'is_win7_ulw_mode':
        return false;
      case 'plugin:event|listen': {
        const event = String(args.event ?? '');
        const handlerId = Number(args.handler ?? 0);
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(handlerId);
        return handlerId;
      }
      case 'plugin:event|unlisten': {
        listeners.get(String(args.event ?? ''))?.delete(Number(args.id ?? 0));
        return null;
      }
      case 'open_release_page': {
        const url = new URL(String(args.url ?? ''));
        if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password) throw new Error('只支持 GitHub HTTPS 页面');
        window.open(url.href, '_blank', 'noopener,noreferrer');
        return null;
      }
      // Native window / shell / update operations remain no-ops in the preview.
      case 'set_hit_regions':
      case 'set_menu_open':
      case 'set_dragging':
      case 'set_update_banner_open':
      case 'save_window_pos':
      case 'reset_position':
      case 'quit_app':
      case 'create_desktop_shortcut':
      case 'install_update':
      case 'win7_present_frame':
      case 'win7_sync_overlay':
      case 'plugin:window|start_dragging':
      default:
        return null;
    }
  };

  w.__TAURI_INTERNALS__ = {
    invoke,
    transformCallback: (cb: EventHandler) => {
      const id = nextCallbackId++;
      callbacks.set(id, cb);
      return id;
    },
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main' },
    },
    convertFileSrc: (path: string) => path,
    plugins: {},
  };

  document.documentElement.classList.add('preview-mode');
  return true;
}
