import type { KeyboardLayoutId } from './keyboardLayout';

export type MouseOrientation = 'auto' | 'cat' | 'viewer';

export interface DeskMetrics {
  logicalW: number;
  logicalH: number;
  catCenterX: number;
  catTopY: number;
  catBaseY: number;
  kbCenterX: number;
  kbCenterY: number;
  kbWidth: number;
  kbHeight: number;
  kbTiltRad: number;
  mouseBaseX: number;
  mouseBaseY: number;
  propX: number;
  propY: number;
}

export interface NormalizedRegion {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface HitRegions {
  cat: NormalizedRegion;
  desk: NormalizedRegion;
  prop: NormalizedRegion | null;
  /**
   * The pet's real box in WINDOW-normalized coordinates. Rust cannot derive this
   * itself: the canvas fits the pet with `min(w/logicalW, h/logicalH)` and anchors
   * it bottom-right, so once the window is resized (e.g. the menu widens it) a
   * `base_size * scale / window` estimate drifts away from what is drawn.
   */
  petBox?: NormalizedRegion;
  /** Open settings menu box, also window-normalized; null when closed. */
  menuBox?: NormalizedRegion | null;
}

export const KB_SCALE_MIN = 0.7;
export const KB_SCALE_MAX = 1.15;
export const DEFAULT_KB_SCALE_65 = 1.0;
export const DEFAULT_KB_SCALE_108 = 0.85;

export function clampKeyboardScale(raw: number | null | undefined, layout: KeyboardLayoutId): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return layout === '108' ? DEFAULT_KB_SCALE_108 : DEFAULT_KB_SCALE_65;
  }
  const upper = layout === '108' ? 1.0 : KB_SCALE_MAX;
  return Math.min(upper, Math.max(KB_SCALE_MIN, raw));
}

export function defaultKeyboardScale(layout: KeyboardLayoutId): number {
  return layout === '108' ? DEFAULT_KB_SCALE_108 : DEFAULT_KB_SCALE_65;
}

export function resolveDeskMetrics(
  layout: KeyboardLayoutId,
  breedId: string,
  kbScale: number,
  propEnabled: boolean,
  propSide: 'left' | 'right' = 'right',
): DeskMetrics {
  const isBigFish = breedId === 'dafeiyu';
  const s = clampKeyboardScale(kbScale, layout);
  // The mouse and the prop compete for the same aisle; when the prop takes the left
  // side the mouse mirrors to the right so the two never overlap.
  const mouseOnRight = propEnabled && propSide === 'left';

  if (layout === '108') {
    // Full-size deck keeps a constant 66px left aisle and 66px right aisle so the
    // keyboard visibly grows to the right, never blowing up the whole window.
    const kbWidth = 398 * s;
    const kbHeight = 96 * s;
    const logicalW = Math.round(132 + kbWidth);
    return {
      logicalW,
      logicalH: 446,
      catCenterX: 66 + kbWidth * 0.44,
      catTopY: 70,
      catBaseY: 300,
      kbCenterX: 66 + kbWidth / 2,
      kbCenterY: 353,
      kbWidth,
      kbHeight,
      kbTiltRad: (2.4 * Math.PI) / 180,
      mouseBaseX: mouseOnRight ? logicalW - (isBigFish ? 52 : 46) : isBigFish ? 52 : 46,
      mouseBaseY: isBigFish ? 330 : 336,
      propX: mouseOnRight ? 30 : logicalW - 30,
      propY: 356,
    };
  }

  const kbWidth = 266 * s;
  const kbHeight = 74 * s;
  const logicalW = Math.round(154 + kbWidth);
  // Whale girl stands slightly right of the black cat, so her deck shifts with her.
  const kbLeft = isBigFish ? 101 : 81;
  return {
    logicalW,
    logicalH: 440,
    catCenterX: 196,
    catTopY: 82,
    catBaseY: 308,
    kbCenterX: kbLeft + kbWidth / 2,
    kbCenterY: 353,
    kbWidth,
    kbHeight,
    kbTiltRad: (3.4 * Math.PI) / 180,
    mouseBaseX: mouseOnRight ? logicalW - (isBigFish ? 72 : 46) : isBigFish ? 72 : 46,
    mouseBaseY: isBigFish ? 322 : 338,
    propX: mouseOnRight ? 30 : logicalW - 30,
    propY: 356,
  };
}

export function resolveMouseFacing(
  mode: MouseOrientation,
  keyboardOrientation: 'cat' | 'viewer',
): 'cat' | 'viewer' {
  if (mode === 'cat' || mode === 'viewer') return mode;
  return keyboardOrientation;
}

export function buildHitRegions(
  m: DeskMetrics,
  mouseFacing: 'cat' | 'viewer',
  propEnabled: boolean,
  propSide: 'left' | 'right' = 'right',
  petBox: NormalizedRegion | null = null,
): HitRegions {
  const norm = (cx: number, cy: number, rx: number, ry: number): NormalizedRegion => ({
    cx: cx / m.logicalW,
    cy: cy / m.logicalH,
    rx: rx / m.logicalW,
    ry: ry / m.logicalH,
  });

  const catCy = (m.catTopY + m.catBaseY) / 2 + 8;
  const kbLeft = m.kbCenterX - m.kbWidth / 2;
  const kbRight = m.kbCenterX + m.kbWidth / 2;
  const deskLeft = Math.min(m.mouseBaseX - 24, kbLeft - 4);
  const deskRight = Math.max(m.mouseBaseX + 24, kbRight + 4);
  const deskTop = m.kbCenterY - m.kbHeight / 2 - 14;
  const deskBottom = m.kbCenterY + m.kbHeight / 2 + 18;
  const propX = m.propX;

  return {
    cat: norm(m.catCenterX, catCy, 92, 118),
    desk: norm(
      (deskLeft + deskRight) / 2,
      (deskTop + deskBottom) / 2,
      (deskRight - deskLeft) / 2,
      (deskBottom - deskTop) / 2,
    ),
    prop: propEnabled ? norm(propX, m.propY, 26, 32) : null,
    ...(petBox ? { petBox } : {}),
  };
}

export const MOUSE_FACING_LABELS: Record<'cat' | 'viewer', string> = {
  cat: '面向猫咪',
  viewer: '面向观众',
};

export const mouseFacingHint = (facing: 'cat' | 'viewer'): string =>
  facing === 'cat' ? '按钮朝向猫爪（内侧）' : '按钮朝向你（正向可读）';
