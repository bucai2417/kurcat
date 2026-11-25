import type { KeySpec } from './keyboardLayout';

export type LightEffect =
  | 'off'
  | 'static'
  | 'breath'
  | 'rainbow'
  | 'random'
  | 'wave'
  | 'ripple'
  | 'typing'
  | 'aurora';

export type LightZone = 'all' | 'alnum' | 'wasd' | 'numpad';

/** How a key's colour is chosen when the effect itself is not a colour-scheme effect. */
export type LightColorMode = 'solid' | 'palette' | 'random';

export interface KeyboardLightConfig {
  enabled: boolean;
  effect: LightEffect;
  color: string;
  color2: string;
  /** Colours sampled by the 'random' effect. Empty falls back to the built-in palette. */
  palette: string[];
  colorMode: LightColorMode;
  /** Glowing rim around the keyboard chassis, like a real RGB keyboard. */
  edgeLight: boolean;
  speed: number;
  brightness: number;
  reactive: boolean;
  underglow: boolean;
  zone: LightZone;
  /**
   * Dim the keycaps into a dark backlit shell so the LED reads through them.
   * Off by default: the chosen desk skin stays as-is and the light merely glows
   * on top of it.
   */
  backlitCaps: boolean;
}

export const LIGHT_COLOR_MODES: Array<{ id: LightColorMode; label: string }> = [
  { id: 'solid', label: '单色' },
  { id: 'palette', label: '多选配色' },
  { id: 'random', label: '随机颜色' },
];

export const DEFAULT_LIGHT_PALETTE = [
  '#ff3b6b',
  '#ff9a3c',
  '#ffe14d',
  '#7ee8a6',
  '#00e5ff',
  '#6b8bff',
  '#c56bff',
  '#ff6bd6',
];

export const LIGHT_EFFECTS: Array<{ id: LightEffect; label: string; hint: string }> = [
  { id: 'off', label: '关闭', hint: '不发光' },
  { id: 'static', label: '常亮', hint: '整块键盘恒亮单色' },
  { id: 'breath', label: '呼吸', hint: '明暗缓慢起伏' },
  { id: 'rainbow', label: '流光彩虹', hint: '色相沿键盘横向流动' },
  { id: 'random', label: '随机炫彩', hint: '每个键随机配色并自动轮换' },
  { id: 'wave', label: '波浪', hint: '对角扫光逐行掠过' },
  { id: 'ripple', label: '按键涟漪', hint: '敲键后向四周扩散光圈' },
  { id: 'typing', label: '打字余晖', hint: '敲过的键留下渐隐余光' },
  { id: 'aurora', label: '极光', hint: '双色渐变缓慢漂移' },
];

export const LIGHT_ZONES: Array<{ id: LightZone; label: string }> = [
  { id: 'all', label: '全部按键' },
  { id: 'alnum', label: '仅字母数字' },
  { id: 'wasd', label: '仅 WASD' },
  { id: 'numpad', label: '仅数字区' },
];

export const LIGHT_PRESETS: Array<{ id: string; label: string; config: KeyboardLightConfig }> = [
  {
    id: 'lime',
    label: '柠檬绿',
    config: {
      enabled: true,
      effect: 'breath',
      color: '#d2f244',
      color2: '#8cb014',
      speed: 1,
      brightness: 0.75,
      reactive: true,
      underglow: true,
      zone: 'all',
      palette: DEFAULT_LIGHT_PALETTE,
      colorMode: 'solid',
      edgeLight: false,
      backlitCaps: false,
    },
  },
  {
    id: 'cyan',
    label: '赛博青',
    config: {
      enabled: true,
      effect: 'wave',
      color: '#00e5ff',
      color2: '#ff00a8',
      speed: 1.2,
      brightness: 0.8,
      reactive: true,
      underglow: true,
      zone: 'all',
      palette: DEFAULT_LIGHT_PALETTE,
      colorMode: 'solid',
      edgeLight: false,
      backlitCaps: false,
    },
  },
  {
    id: 'sunset',
    label: '落日橙',
    config: {
      enabled: true,
      effect: 'aurora',
      color: '#ff9a3c',
      color2: '#ff4d6d',
      speed: 0.8,
      brightness: 0.7,
      reactive: true,
      underglow: true,
      zone: 'all',
      palette: DEFAULT_LIGHT_PALETTE,
      colorMode: 'solid',
      edgeLight: false,
      backlitCaps: false,
    },
  },
  {
    id: 'ice',
    label: '冰川蓝',
    config: {
      enabled: true,
      effect: 'rainbow',
      color: '#6ad2ff',
      color2: '#3a84c8',
      speed: 0.7,
      brightness: 0.7,
      reactive: true,
      underglow: true,
      zone: 'all',
      palette: DEFAULT_LIGHT_PALETTE,
      colorMode: 'solid',
      edgeLight: false,
      backlitCaps: false,
    },
  },
  {
    id: 'typing-focus',
    label: '专注打字',
    config: {
      enabled: true,
      effect: 'typing',
      color: '#ffffff',
      color2: '#d2f244',
      speed: 1,
      brightness: 0.85,
      reactive: true,
      underglow: false,
      zone: 'alnum',
      palette: DEFAULT_LIGHT_PALETTE,
      colorMode: 'solid',
      edgeLight: false,
      backlitCaps: false,
    },
  },
];

export const DEFAULT_LIGHT: KeyboardLightConfig = {
  enabled: false,
  effect: 'breath',
  color: '#d2f244',
  color2: '#8cb014',
  palette: DEFAULT_LIGHT_PALETTE,
  colorMode: 'solid',
  edgeLight: false,
  speed: 1,
  brightness: 0.75,
  reactive: true,
  underglow: true,
  zone: 'all',
  backlitCaps: false,
};

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Accepts `#rgb`, `#rrggbb`, and the bare forms MCP clients tend to send. */
export function normalizeHex(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const t = raw.trim();
  if (!HEX_RE.test(t)) return fallback;
  const body = t.replace('#', '').toLowerCase();
  return `#${body}`;
}

export function normalizeLightConfig(raw: unknown): KeyboardLightConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<KeyboardLightConfig>;
  const effectIds = LIGHT_EFFECTS.map((e) => e.id);
  const zoneIds = LIGHT_ZONES.map((z) => z.id);
  const num = (v: unknown, def: number, min: number, max: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
  const palette = Array.isArray(src.palette)
    ? Array.from(
        new Set(
          src.palette
            .filter((c): c is string => typeof c === 'string')
            .map((c) => normalizeHex(c, ''))
            .filter((c) => c.length > 1),
        ),
      ).slice(0, 16)
    : [];
  return {
    enabled: typeof src.enabled === 'boolean' ? src.enabled : DEFAULT_LIGHT.enabled,
    effect: effectIds.includes(src.effect as LightEffect)
      ? (src.effect as LightEffect)
      : DEFAULT_LIGHT.effect,
    color: normalizeHex(src.color, DEFAULT_LIGHT.color),
    color2: normalizeHex(src.color2, DEFAULT_LIGHT.color2),
    palette: palette.length >= 2 ? palette : [...DEFAULT_LIGHT_PALETTE],
    colorMode:
      src.colorMode === 'palette' || src.colorMode === 'random' || src.colorMode === 'solid'
        ? src.colorMode
        : DEFAULT_LIGHT.colorMode,
    edgeLight: typeof src.edgeLight === 'boolean' ? src.edgeLight : DEFAULT_LIGHT.edgeLight,
    speed: num(src.speed, DEFAULT_LIGHT.speed, 0.2, 3),
    brightness: num(src.brightness, DEFAULT_LIGHT.brightness, 0, 1),
    reactive: typeof src.reactive === 'boolean' ? src.reactive : DEFAULT_LIGHT.reactive,
    underglow: typeof src.underglow === 'boolean' ? src.underglow : DEFAULT_LIGHT.underglow,
    zone: zoneIds.includes(src.zone as LightZone) ? (src.zone as LightZone) : DEFAULT_LIGHT.zone,
    backlitCaps:
      typeof src.backlitCaps === 'boolean' ? src.backlitCaps : DEFAULT_LIGHT.backlitCaps,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha)).toFixed(3)})`;
}

function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

const WASD_IDS = new Set(['w', 'a', 's', 'd']);
const ALNUM_RE = /^[0-9a-z]$/i;

export function keyInZone(key: KeySpec, zone: LightZone): boolean {
  switch (zone) {
    case 'alnum':
      return ALNUM_RE.test(key.id) || key.id.startsWith('np_');
    case 'wasd':
      return WASD_IDS.has(key.id);
    case 'numpad':
      return key.id.startsWith('np_');
    default:
      return true;
  }
}

interface Ripple {
  x: number;
  y: number;
  bornAt: number;
  color: string;
}

export interface KeyLightContext {
  x: number;
  y: number;
  w: number;
  h: number;
  press: number;
  /** Normalized 0..1 position across the whole deck. */
  nx: number;
  ny: number;
  /** Seconds since this key was last struck (Infinity when never). */
  hitAgeSec: number;
}

/**
 * Computes per-key light intensity + colour for one frame.
 *
 * Kept free of canvas calls so it can be unit-tested and reused by both the
 * keyboard deck and the underglow strip.
 */
export class KeyboardLightEngine {
  private config: KeyboardLightConfig = { ...DEFAULT_LIGHT };
  private ripples: Ripple[] = [];
  private rippleSeq = 0;
  private t = 0;

  setConfig(cfg: KeyboardLightConfig): void {
    this.config = cfg;
    if (!cfg.enabled || cfg.effect === 'off') this.ripples.length = 0;
  }

  getConfig(): KeyboardLightConfig {
    return this.config;
  }

  /** True when the deck needs continuous repaint (keeps the idle loop awake). */
  get isAnimating(): boolean {
    if (!this.config.enabled) return false;
    return this.config.effect !== 'off' && this.config.effect !== 'static';
  }

  advance(dt: number): void {
    this.t += dt * this.config.speed;
    if (this.ripples.length > 24) this.ripples.splice(0, this.ripples.length - 24);
  }

  spawnRipple(x: number, y: number): void {
    const cfg = this.config;
    if (!cfg.enabled || !cfg.reactive) return;
    if (cfg.effect !== 'ripple') return;
    // Each ripple takes the next palette colour so multi-colour mode looks like a wave of rainbows.
    const palette = cfg.palette.length >= 2 ? cfg.palette : DEFAULT_LIGHT_PALETTE;
    this.rippleSeq = (this.rippleSeq + 1) % palette.length;
    const color = cfg.colorMode === 'solid' ? cfg.color : palette[this.rippleSeq];
    this.ripples.push({ x, y, bornAt: this.t, color });
  }

  /** Base colour for a key given the configured colour mode. */
  private keyColor(
    cfg: KeyboardLightConfig,
    nx: number,
    ny: number,
    now: number,
  ): string {
    if (cfg.colorMode === 'solid') return cfg.color;
    const palette = cfg.palette.length >= 2 ? cfg.palette : DEFAULT_LIGHT_PALETTE;
    if (cfg.colorMode === 'palette') {
      const idx = Math.floor(Math.abs(Math.sin(nx * 91.7 + ny * 47.3)) * 997) % palette.length;
      return palette[idx];
    }
    const seed = Math.abs(Math.sin(nx * 127.1 + ny * 311.7) * 43758.5453);
    const keyIdx = Math.floor(seed) % palette.length;
    return palette[(keyIdx + Math.floor(now * 0.9)) % palette.length];
  }

  /**
   * @returns `null` when the key stays unlit this frame.
   */
  keyLight(ctx: KeyLightContext): { color: string; intensity: number } | null {
    const cfg = this.config;
    if (!cfg.enabled || cfg.effect === 'off') return null;
    const now = this.t;

    const base = cfg.brightness;
    let intensity = 0;
    let color = this.keyColor(cfg, ctx.nx, ctx.ny, now);

    switch (cfg.effect) {
      case 'static':
        intensity = base;
        break;
      case 'breath':
        intensity = base * (0.55 + 0.45 * Math.sin(now * 1.6));
        break;
      case 'rainbow':
        color = hslToHex(ctx.nx * 300 + now * 70, 0.85, 0.58);
        intensity = base;
        break;
      case 'random': {
        // Deterministic per-key pick so a key keeps its colour instead of flickering,
        // with the whole deck slowly rotating through the palette.
        const palette = cfg.palette.length >= 2 ? cfg.palette : DEFAULT_LIGHT_PALETTE;
        const seed = Math.abs(
          Math.sin(ctx.nx * 127.1 + ctx.ny * 311.7) * 43758.5453,
        );
        const keyIdx = Math.floor(seed) % palette.length;
        const rotate = Math.floor(now * 0.6);
        color = palette[(keyIdx + rotate) % palette.length];
        const twinkle = 0.72 + 0.28 * Math.sin(now * 2.2 + seed);
        intensity = base * twinkle;
        break;
      }
      case 'wave': {
        const phase = (ctx.nx * 2.4 + ctx.ny * 1.6) - now * 1.5;
        const s = Math.sin(phase);
        intensity = base * Math.pow(Math.max(0, s), 1.6);
        break;
      }
      case 'ripple': {
        let best = 0;
        for (const r of this.ripples) {
          const age = now - r.bornAt;
          if (age < 0 || age > 1.6) continue;
          const d = Math.hypot(ctx.x - r.x, ctx.y - r.y);
          const radius = age * 260;
          const band = Math.abs(d - radius);
          if (band < 34) best = Math.max(best, (1 - band / 34) * (1 - age / 1.6));
        }
        intensity = base * best;
        break;
      }
      case 'typing': {
        const age = ctx.hitAgeSec;
        if (!Number.isFinite(age) || age > 2.2) return null;
        intensity = base * Math.pow(1 - age / 2.2, 1.8);
        break;
      }
      case 'aurora': {
        const n =
          Math.sin(ctx.nx * 3.1 + now * 0.6) * 0.5 +
          Math.sin(ctx.ny * 2.3 - now * 0.45) * 0.5;
        const mix = (n + 1) * 0.5;
        color = mix > 0.5 ? cfg.color2 : cfg.color;
        intensity = base * (0.45 + 0.55 * mix);
        break;
      }
      default:
        return null;
    }

    if (cfg.reactive && ctx.press > 0.05) {
      intensity = Math.min(1, intensity + ctx.press * 0.75);
      color = cfg.color2;
    }
    if (intensity <= 0.02) return null;
    return { color, intensity };
  }

  /** Colour of the desktop underglow strip, or `null` when disabled. */
  underglow(): { color: string; intensity: number } | null {
    const cfg = this.config;
    if (!cfg.enabled || !cfg.underglow || cfg.effect === 'off') return null;
    const now = this.t;
    let intensity = cfg.brightness * 0.55;
    let color = cfg.color;
    if (cfg.effect === 'rainbow') color = hslToHex(now * 70, 0.85, 0.6);
    if (cfg.effect === 'breath') intensity *= 0.7 + 0.3 * Math.sin(now * 1.6);
    if (cfg.effect === 'aurora') {
      color = Math.sin(now * 0.6) > 0 ? cfg.color : cfg.color2;
    }
    if (cfg.effect === 'random') {
      const palette = cfg.palette.length >= 2 ? cfg.palette : DEFAULT_LIGHT_PALETTE;
      color = palette[Math.floor(now * 1.4) % palette.length];
      intensity *= 0.75 + 0.25 * Math.sin(now * 1.9);
    }
    if (cfg.effect === 'wave') intensity *= 0.85 + 0.15 * Math.sin(now * 2.4);
    return { color, intensity };
  }

  /** Glowing rim around the keyboard chassis, cycling through the palette. */
  edgeGlow(): { color: string; intensity: number } | null {
    const cfg = this.config;
    if (!cfg.enabled || !cfg.edgeLight || cfg.effect === 'off') return null;
    const now = this.t;
    const palette = cfg.palette.length >= 2 ? cfg.palette : DEFAULT_LIGHT_PALETTE;
    let color: string;
    if (cfg.effect === 'rainbow') {
      color = hslToHex(now * 70, 0.85, 0.6);
    } else if (cfg.colorMode === 'solid') {
      color = cfg.color;
    } else if (cfg.colorMode === 'palette') {
      color = palette[Math.floor(now * 0.6) % palette.length];
    } else {
      color = palette[Math.floor(now * 1.7) % palette.length];
    }
    let intensity = 0.55 + 0.45 * Math.abs(Math.sin(now * 1.2));
    if (cfg.effect === 'breath') intensity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * 1.6));
    return { color, intensity: intensity * cfg.brightness + 0.1 };
  }
}
