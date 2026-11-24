export type KeycapShape = 'classic' | 'sa' | 'flat' | 'jelly';
export type MouseShape = 'oval' | 'ergonomic' | 'gaming';
export type DeskMaterial = 'plastic' | 'metal' | 'wood' | 'glass' | 'fabric';
export type DeskPattern = 'solid' | 'carbon' | 'wood' | 'marble' | 'grid' | 'hologram';

export interface KeycapOverride {
  top?: string;
  side?: string;
  text?: string;
  /** Custom legend text; empty string hides the legend. */
  label?: string;
  /** Emoji legend, rendered larger. Takes precedence over `label`. */
  emoji?: string;
}

export interface KeyboardSkin {
  deckTop: string;
  deckSide: string;
  deckEdge: string;
  bedFill: string;
  keyTop: string;
  keySide: string;
  keyText: string;
  modKeyTop: string;
  modKeySide: string;
  accentKeyTop: string;
  accentKeySide: string;
  shape: KeycapShape;
  material: DeskMaterial;
  pattern: DeskPattern;
  patternColor: string;
  patternScale: number;
  /** Per-key DIY overrides keyed by KeySpec.id, e.g. { esc: { top: '#ff3b6b', emoji: '🔥' } }. */
  keycaps?: Record<string, KeycapOverride>;
}

export interface MouseSkin {
  shell: string;
  shellEdge: string;
  button: string;
  buttonEdge: string;
  wheel: string;
  outline: string;
  silhouette: MouseShape;
  material: DeskMaterial;
  pattern: DeskPattern;
  glow: string;
}

export interface DeskSkinConfig {
  id: string;
  name: string;
  builtin?: boolean;
  keyboard: KeyboardSkin;
  mouse: MouseSkin;
}

export const KEYCAP_SHAPES: Array<{ id: KeycapShape; label: string; hint: string }> = [
  { id: 'classic', label: '经典 OEM', hint: '标准圆角，最接近量产键盘' },
  { id: 'sa', label: 'SA 高球帽', hint: '厚实高键帽，复古打字机手感' },
  { id: 'flat', label: '矮轴平顶', hint: '轻薄扁平，笔记本风格' },
  { id: 'jelly', label: '果冻圆润', hint: '超大圆角，Q 弹可爱' },
];

export const MOUSE_SHAPES: Array<{ id: MouseShape; label: string; hint: string }> = [
  { id: 'oval', label: '经典鹅卵石', hint: '对称椭圆，最百搭' },
  { id: 'ergonomic', label: '人体工学', hint: '右侧收腰，手腕更省力' },
  { id: 'gaming', label: '电竞机甲', hint: '锐利棱角，带侧翼灯条' },
];

export const DESK_PATTERNS: Array<{ id: DeskPattern; label: string }> = [
  { id: 'solid', label: '纯色' },
  { id: 'carbon', label: '碳纤维' },
  { id: 'wood', label: '木纹' },
  { id: 'marble', label: '大理石' },
  { id: 'grid', label: '网格' },
  { id: 'hologram', label: '全息' },
];

function makeKeyboard(over: Partial<KeyboardSkin>): KeyboardSkin {
  return {
    deckTop: '#24262c',
    deckSide: '#191a1e',
    deckEdge: '#363840',
    bedFill: '#d4d6d1',
    keyTop: '#f8f8f5',
    keySide: '#d0d2cc',
    keyText: '#2c2f36',
    modKeyTop: '#efefeb',
    modKeySide: '#c7c9c3',
    accentKeyTop: '#f4a524',
    accentKeySide: '#c27a10',
    shape: 'classic',
    material: 'plastic',
    pattern: 'solid',
    patternColor: '#ffffff',
    patternScale: 1,
    ...over,
  };
}

function makeMouse(over: Partial<MouseSkin>): MouseSkin {
  return {
    shell: '#ecece7',
    shellEdge: '#c8cac4',
    button: '#fafaf7',
    buttonEdge: '#c8cac4',
    wheel: '#6b6f78',
    outline: '#2b2d34',
    silhouette: 'oval',
    material: 'plastic',
    pattern: 'solid',
    glow: '',
    ...over,
  };
}

export const BUILTIN_DESK_SKINS: DeskSkinConfig[] = [
  {
    id: 'classic-cream',
    name: '经典奶白',
    builtin: true,
    keyboard: makeKeyboard({}),
    mouse: makeMouse({}),
  },
  {
    id: 'carbon-night',
    name: '暗夜碳纤',
    builtin: true,
    keyboard: makeKeyboard({
      deckTop: '#1b1d22',
      deckSide: '#0f1013',
      deckEdge: '#2c2f37',
      bedFill: '#15171b',
      keyTop: '#2e3239',
      keySide: '#1d2026',
      keyText: '#e8edf4',
      modKeyTop: '#262a31',
      modKeySide: '#171a1f',
      accentKeyTop: '#ff7a18',
      accentKeySide: '#b34c06',
      material: 'metal',
      pattern: 'carbon',
      patternColor: '#3b414b',
    }),
    mouse: makeMouse({
      shell: '#2a2e36',
      shellEdge: '#171a1f',
      button: '#333844',
      buttonEdge: '#1d2026',
      wheel: '#4a5260',
      outline: '#0e1014',
      material: 'metal',
      pattern: 'carbon',
      glow: '#ff7a18',
    }),
  },
  {
    id: 'walnut-warm',
    name: '胡桃木',
    builtin: true,
    keyboard: makeKeyboard({
      deckTop: '#6b4a2f',
      deckSide: '#4a3120',
      deckEdge: '#8a6242',
      bedFill: '#3a2718',
      keyTop: '#f0e6d6',
      keySide: '#c9b79c',
      keyText: '#4a3120',
      modKeyTop: '#e2d4bd',
      modKeySide: '#b9a688',
      accentKeyTop: '#d98b3a',
      accentKeySide: '#a4631f',
      material: 'wood',
      pattern: 'wood',
      patternColor: '#4a3120',
    }),
    mouse: makeMouse({
      shell: '#e8dcc8',
      shellEdge: '#b9a688',
      button: '#f2e9db',
      buttonEdge: '#c9b79c',
      wheel: '#8a6242',
      outline: '#4a3120',
      material: 'wood',
      pattern: 'wood',
    }),
  },
  {
    id: 'sakura-cream',
    name: '樱花奶油',
    builtin: true,
    keyboard: makeKeyboard({
      deckTop: '#f6e6ea',
      deckSide: '#e2c8d0',
      deckEdge: '#d6b4bf',
      bedFill: '#fdf4f6',
      keyTop: '#fffafc',
      keySide: '#ecd5db',
      keyText: '#7a5563',
      modKeyTop: '#f7e3e9',
      modKeySide: '#e0c4cc',
      accentKeyTop: '#ff9ec4',
      accentKeySide: '#d96f9c',
      shape: 'jelly',
      pattern: 'solid',
    }),
    mouse: makeMouse({
      shell: '#fffafc',
      shellEdge: '#ecd5db',
      button: '#ffffff',
      buttonEdge: '#ecd5db',
      wheel: '#ff9ec4',
      outline: '#b88294',
      glow: '#ff9ec4',
    }),
  },
  {
    id: 'cyber-terminal',
    name: '赛博终端',
    builtin: true,
    keyboard: makeKeyboard({
      deckTop: '#101820',
      deckSide: '#070c11',
      deckEdge: '#1d3b4a',
      bedFill: '#060b10',
      keyTop: '#12222b',
      keySide: '#0a151c',
      keyText: '#6ff5d0',
      modKeyTop: '#162c37',
      modKeySide: '#0b171e',
      accentKeyTop: '#00e5ff',
      accentKeySide: '#0088a8',
      shape: 'flat',
      material: 'glass',
      pattern: 'grid',
      patternColor: '#1d6f85',
    }),
    mouse: makeMouse({
      shell: '#12222b',
      shellEdge: '#0a151c',
      button: '#162c37',
      buttonEdge: '#0b171e',
      wheel: '#00e5ff',
      outline: '#00e5ff',
      silhouette: 'gaming',
      material: 'glass',
      pattern: 'grid',
      glow: '#00e5ff',
    }),
  },
  {
    id: 'deep-whale',
    name: '深海鲸',
    builtin: true,
    keyboard: makeKeyboard({
      deckTop: '#173a63',
      deckSide: '#0f2745',
      deckEdge: '#245785',
      bedFill: '#0c1d33',
      keyTop: '#dceaf7',
      keySide: '#a9c4dd',
      keyText: '#1a3a5c',
      modKeyTop: '#c9dcee',
      modKeySide: '#9db9d3',
      accentKeyTop: '#5cc8ff',
      accentKeySide: '#2a8ec4',
      shape: 'sa',
      material: 'plastic',
      pattern: 'marble',
      patternColor: '#3a7bb5',
    }),
    mouse: makeMouse({
      shell: '#e6f1fa',
      shellEdge: '#a9c4dd',
      button: '#f2f8fd',
      buttonEdge: '#b9cfe2',
      wheel: '#5cc8ff',
      outline: '#173a63',
      silhouette: 'ergonomic',
      pattern: 'marble',
      glow: '#5cc8ff',
    }),
  },
];

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function hex(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const t = raw.trim();
  if (!HEX_RE.test(t)) return fallback;
  return `#${t.replace('#', '').toLowerCase()}`;
}

function num(raw: unknown, fallback: number, min: number, max: number): number {
  return typeof raw === 'number' && Number.isFinite(raw)
    ? Math.min(max, Math.max(min, raw))
    : fallback;
}

function pick<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

const KEYCAP_IDS = KEYCAP_SHAPES.map((s) => s.id);
const MOUSE_IDS = MOUSE_SHAPES.map((s) => s.id);
const PATTERN_IDS = DESK_PATTERNS.map((p) => p.id);
const MATERIAL_IDS: DeskMaterial[] = ['plastic', 'metal', 'wood', 'glass', 'fabric'];

/** Keeps DIY keycaps bounded and well-formed so a bad JSON payload can't break rendering. */
export function normalizeKeycaps(raw: unknown): Record<string, KeycapOverride> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, KeycapOverride> = {};
  let count = 0;
  for (const [keyId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= 200) break;
    if (!/^[a-z0-9_]{1,20}$/i.test(keyId)) continue;
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const entry: KeycapOverride = {};
    if (typeof v.top === 'string') {
      const c = hex(v.top, '');
      if (c.length > 1) entry.top = c;
    }
    if (typeof v.side === 'string') {
      const c = hex(v.side, '');
      if (c.length > 1) entry.side = c;
    }
    if (typeof v.text === 'string') {
      const c = hex(v.text, '');
      if (c.length > 1) entry.text = c;
    }
    if (typeof v.label === 'string') entry.label = v.label.slice(0, 4);
    if (typeof v.emoji === 'string') entry.emoji = v.emoji.slice(0, 4);
    if (Object.keys(entry).length > 0) {
      out[keyId] = entry;
      count++;
    }
  }
  return count > 0 ? out : undefined;
}

export function normalizeDeskSkin(raw: unknown): DeskSkinConfig {
  const base = BUILTIN_DESK_SKINS[0];
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const kbRaw = (src.keyboard && typeof src.keyboard === 'object' ? src.keyboard : {}) as Record<
    string,
    unknown
  >;
  const mRaw = (src.mouse && typeof src.mouse === 'object' ? src.mouse : {}) as Record<
    string,
    unknown
  >;
  const kb = base.keyboard;
  const ms = base.mouse;

  return {
    id: typeof src.id === 'string' && src.id.trim() ? src.id.trim() : base.id,
    name: typeof src.name === 'string' && src.name.trim() ? src.name.trim() : '自定义外观',
    builtin: Boolean(src.builtin),
    keyboard: {
      deckTop: hex(kbRaw.deckTop, kb.deckTop),
      deckSide: hex(kbRaw.deckSide, kb.deckSide),
      deckEdge: hex(kbRaw.deckEdge, kb.deckEdge),
      bedFill: hex(kbRaw.bedFill, kb.bedFill),
      keyTop: hex(kbRaw.keyTop, kb.keyTop),
      keySide: hex(kbRaw.keySide, kb.keySide),
      keyText: hex(kbRaw.keyText, kb.keyText),
      modKeyTop: hex(kbRaw.modKeyTop, kb.modKeyTop),
      modKeySide: hex(kbRaw.modKeySide, kb.modKeySide),
      accentKeyTop: hex(kbRaw.accentKeyTop, kb.accentKeyTop),
      accentKeySide: hex(kbRaw.accentKeySide, kb.accentKeySide),
      shape: pick(kbRaw.shape, KEYCAP_IDS, kb.shape),
      material: pick(kbRaw.material, MATERIAL_IDS, kb.material),
      pattern: pick(kbRaw.pattern, PATTERN_IDS, kb.pattern),
      patternColor: hex(kbRaw.patternColor, kb.patternColor),
      patternScale: num(kbRaw.patternScale, kb.patternScale, 0.2, 4),
      keycaps: normalizeKeycaps(kbRaw.keycaps),
    },
    mouse: {
      shell: hex(mRaw.shell, ms.shell),
      shellEdge: hex(mRaw.shellEdge, ms.shellEdge),
      button: hex(mRaw.button, ms.button),
      buttonEdge: hex(mRaw.buttonEdge, ms.buttonEdge),
      wheel: hex(mRaw.wheel, ms.wheel),
      outline: hex(mRaw.outline, ms.outline),
      silhouette: pick(mRaw.silhouette, MOUSE_IDS, ms.silhouette),
      material: pick(mRaw.material, MATERIAL_IDS, ms.material),
      pattern: pick(mRaw.pattern, PATTERN_IDS, ms.pattern),
      glow: typeof mRaw.glow === 'string' && HEX_RE.test(mRaw.glow.trim())
        ? `#${mRaw.glow.trim().replace('#', '').toLowerCase()}`
        : '',
    },
  };
}

/** Keycap corner radius multiplier + extra height for each shape. */
export function keycapGeometry(shape: KeycapShape, w: number, h: number): { radius: number; lift: number } {
  switch (shape) {
    case 'sa':
      return { radius: Math.min(w, h) * 0.26, lift: 1.7 };
    case 'flat':
      return { radius: Math.min(w, h) * 0.16, lift: 0.5 };
    case 'jelly':
      return { radius: Math.min(w, h) * 0.46, lift: 1.0 };
    default:
      return { radius: Math.min(w, h) * 0.22, lift: 1.2 };
  }
}

export const DESK_SKIN_LABELS = {
  keycapShapes: KEYCAP_SHAPES,
  mouseShapes: MOUSE_SHAPES,
  patterns: DESK_PATTERNS,
};
