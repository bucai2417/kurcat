import { SleepReaction, drawPetCaption } from './sleepReaction';
import { desktopPetInsets } from './petMotion';
import { clipAngryEyelid } from './petMotion';
import {
  KEYBOARD_KEYS_65,
  KEYBOARD_KEYS_108,
  getKeyboardLayout,
  type KeySpec,
  type KeyboardLayoutId,
  formatBubbleForVk,
  resolveKeyByVk,
} from './keyboardLayout';
import { catAudio } from './audio';
import { resolveCustomSkin, type CatSkinConfig, type ResolvedSkin } from './catSkins';
import { DaFeiYuRenderer, type DaFeiYuLayout } from './dafeiyuRenderer';
import { NaiwaRenderer, type NaiwaLayout, type NaiwaPaw } from './naiwaRenderer';
import { FROG_ACTIONS, FROG_DURATIONS, type FrogAction } from './naiwaPose';
import {
  buildHitRegions,
  clampKeyboardScale,
  defaultKeyboardScale,
  resolveDeskMetrics,
  resolveMouseFacing,
  type DeskMetrics,
  type HitRegions,
  type MouseOrientation,
} from './deskMetrics';
import {
  DEFAULT_LIGHT,
  KeyboardLightEngine,
  keyInZone,
  normalizeLightConfig,
  rgba,
  type KeyboardLightConfig,
} from './keyboardLight';
import {
  BUILTIN_DESK_SKINS,
  keycapGeometry,
  normalizeDeskSkin,
  normalizeKeycaps,
  type DeskSkinConfig,
  type KeycapOverride,
} from './deskSkin';
import { paintMaterialSheen, paintPattern, roundRectPath } from './deskTexture';
import {
  DEFAULT_PROP,
  PropDrinker,
  moodForKind,
  normalizePropConfig,
  type PropConfig,
  type PropKind,
} from './prop';
import { drawProp, propLook, propMouthContact } from './propRenderer';
import { TypingReactions, neutralReaction, drawReactionMark } from './petReactions';

const propLookHeight = (kind: PropKind): number => propLook(kind).height;

export const LOGICAL_W = 420;
export const LOGICAL_H = 440;
export type CatBreed = 'black' | 'ragdoll' | 'dafeiyu' | 'naiwa';
export type KeyboardOrientation = 'cat' | 'viewer';

// ---- Tail-key data shared with the 3D engine (no behaviour lives here) ----
export type TailKeyMode = 'smart' | 'custom' | 'edge' | 'off';
export const DEFAULT_TAIL_KEY_IDS: readonly string[] = ['enter', 'space', 'bs', 'esc'];

export const TAIL_KEY_PRESETS = {
  office: {
    label: '回车空格',
    ids: ['enter', 'space', 'bs', 'esc'] as readonly string[],
  },
  rightFn: {
    label: '方向/小键盘',
    ids: [
      'up', 'down', 'left', 'right', 'enter', 'bs', 'rshift',
      'ins', 'home', 'pgup', 'del', 'end', 'pgdn',
      'numlk', 'np_div', 'np_mul', 'np_sub', 'np_add', 'np_ent', 'np_dot',
      'np_0', 'np_1', 'np_2', 'np_3', 'np_4', 'np_5', 'np_6', 'np_7', 'np_8', 'np_9',
    ] as readonly string[],
  },
  edgeMods: {
    label: '外侧功能键',
    ids: ['esc', 'tab', 'caps', 'lshift', 'lctrl', 'rshift', 'enter', 'bs'] as readonly string[],
  },
} as const;

interface Vec2 {
  x: number;
  y: number;
}

interface SmearFrame {
  sx: number;
  sy: number;
  px: number;
  py: number;
  alpha: number;
}

type PawMode = 'idle' | 'curled' | 'poke' | 'mouse' | 'pose';

interface PawState {
  side: 'left' | 'right';
  shoulderNormY: number; // vertical fraction along spine (0=ear tips, 1=base)
  shoulderHalfX: number;
  pos: Vec2;
  vel: Vec2;
  target: Vec2;
  mode: PawMode;
  idleWeight: number;
  curlWeight: number;
  pokeTime: number;
  impactSquash: number;
  lastActiveAt: number;
  smears: SmearFrame[];
}

interface KeyBubble {
  id: number;
  label: string;
  isSpace: boolean;
  x: number;
  targetX: number;
  y: number;
  targetY: number;
  rot: number;
  createdAt: number;
  lifetime: number;
}

interface KeyAnim {
  pressed: boolean;
  pressAmount: number;
  lastHitAt: number;
}

type ParticleShape = 'bubble' | 'steam' | 'heart' | 'spark' | 'pearl';

/** Post-drink reaction variants, picked at random each time. */
type ReactionKind = 'satisfied' | 'lick' | 'shake' | 'happy' | 'burp';

/** Idle behaviours the pet picks from when the user is away. */
export type IdleActionKind = 'drink' | 'stretch' | 'groom' | 'nap' | 'cuddle' | 'wave' | 'tilt' | 'slowBlink' | FrogAction;

/** Old names kept working for menu / MCP payloads already in the wild. */
const IDLE_ALIASES: Record<string, IdleActionKind> = {
  roll: 'cuddle',
  sleep: 'nap',
};

interface IdleActionState {
  kind: IdleActionKind;
  t: number;
  duration: number;
}

interface DrinkParticle {
  shape: ParticleShape;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
}

// Exact measured pixel silhouette half-width profile from original video 0.3s (compact chubby sitting cat!)
// t = 0.0 (ear tips) -> t = 1.0 (bottom base flush on keyboard)
const BODY_SLICES: Array<{ t: number; hw: number }> = [
  { t: 0.12, hw: 49 }, // forehead / ear base
  { t: 0.21, hw: 56 }, // eye line
  { t: 0.30, hw: 60 }, // chubby cheeks widest
  { t: 0.38, hw: 52 }, // gentle neck indent
  { t: 0.47, hw: 54 }, // upper chest
  { t: 0.57, hw: 62 }, // mid chest
  { t: 0.68, hw: 70 }, // plump belly
  { t: 0.79, hw: 73 }, // widest soft thighs!
  { t: 0.90, hw: 69 }, // lower thigh curve
  { t: 0.97, hw: 58 }, // tapers softly inward at base!
  { t: 1.00, hw: 46 }, // cozy bottom rest
];

const IDLE_RENDER_AFTER_MS = 3000;
const IDLE_RENDER_PAUSE_MS = 40;
const LIGHT_IDLE_FRAME_MS = 66;

export class KuroCatEngine {
  private canvas: HTMLCanvasElement;
  private readonly previewOnly: boolean;
  // Thumbnails share the audio singleton, but must never start or silence the live pet.
  private get petAudio() { return this.previewOnly ? null : catAudio; }
  private ctx: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private idleFrameTimer: number | null = null;
  private lastActivityAt = 0;
  private lastTime = 0;
  private elapsed = 0;

  public showKeyBubbles = true;
  public privacyMode = false;
  public onAfterRender: (() => void) | null = null;
  public catBreed: CatBreed = 'black';
  private activeModelId = 'black';
  public customSkin: ResolvedSkin | null = null;
  public keyboardLayout: KeyboardLayoutId = '65';
  public keyboardOrientation: KeyboardOrientation = 'cat';
  public keyboardScale = defaultKeyboardScale('65');
  public mouseOrientation: MouseOrientation = 'auto';
  public propEnabled = false;
  public metrics: DeskMetrics = resolveDeskMetrics('65', 'black', 1, false);
  public readonly lightEngine = new KeyboardLightEngine();
  public deskSkin: DeskSkinConfig = BUILTIN_DESK_SKINS[0];
  /** Global DIY keycap overrides, applied on top of whichever skin is active. */
  public keycapOverrides: Record<string, KeycapOverride> = {};
  public propConfig: PropConfig = { ...DEFAULT_PROP };
  private drinker = new PropDrinker();
  private propFizz = 0;
  private particles: DrinkParticle[] = [];
  private propReach = 0;
  private eyeGlow = 0;
  /** 1 -> 0 pulse used for the cola burp hop. */
  private burpKick = 0;
  /** Short speech bubble shown right after a sip. */
  private drinkFeedback: { emoji: string; text: string; t: number; max: number } | null = null;
  /** Randomised post-drink reaction currently playing. */
  private reaction: { kind: ReactionKind; t: number; max: number } | null = null;
  /** Current idle behaviour (sleep / roll), or null. */
  private idleAction: IdleActionState | null = null;
  private menuActionMouseGraceUntil = -1;
  private idleAutoEnabled = true;
  /** Seconds of silence before an automatic idle action starts (user setting). */
  private idleDelaySec = 6;
  private nextIdleActionAt = 0;
  /** Additive pose offsets layered on top of the typing / mouse pose while idling. */
  private idlePose = { lean: 0, hunch: 0, headTilt: 0, squint: 0 };
  /** Paw target for the current 'pose' idle action (null = none posed). */
  private idlePaw: { side: 'left' | 'right'; x: number; y: number } | null = null;
  /** Which way the cuddle leans. */
  private cuddleSide: 'left' | 'right' = 'right';
  /** Pose channels for the whale girl's own rig (hands / body shift). */
  private fishPose = {
    lean: 0,
    lift: 0,
    leftX: 0,
    leftY: 0,
    leftOn: false,
    rightX: 0,
    rightY: 0,
    rightOn: false,
  };
  private fishTarget = {
    lean: 0,
    lift: 0,
    leftX: 0,
    leftY: 0,
    leftOn: false,
    rightX: 0,
    rightY: 0,
    rightOn: false,
  };
  /** Animated cup transform while the pet reaches for, lifts, and sips. */
  private propPose = { x: 0, y: 0, rot: 0, active: false, lift: 0, handX: 0, handY: 0 };
  /** Fade weight for the drinking arm (independent of the cup height). */
  private propArmAlpha = 0;
  /** Smoothed hand position so the reach snaps like the mouse-clicking paw. */
  private propHand = { x: 0, y: 0 };
  private glowSprite: HTMLCanvasElement | null = null;
  private glowSpriteKey = '';
  private renderScale = 1.0;
  private embedded = false;
  private dafeiyu = new DaFeiYuRenderer();
  private naiwa = new NaiwaRenderer();
  private catTail = {
    heldVks: new Set<number>(),
    targetX: 320,
    targetY: 345,
    tipX: 320,
    tipY: 250,
    reach: 0,
    hover: 0,
    tapAt: -10000,
    releaseAt: -10000,
    impactSquash: 0,
    active: false,
  };
  private readonly sleepReaction = new SleepReaction();
  private groundTail = { amount: 0, lift: 0, impact: false, settled: false };
  private groundImpactAt = -100;
  private soothedUntil = -100;
  private privacyClose = 0;
  private privacyTypingAt = -10000;
  private lastMouseNX = 0.5;
  private lastDt = 1 / 60;

  public setPrivacyMode(active: boolean): void {
    this.wakeRendering();
    this.privacyMode = active;
    this.dafeiyu.onPrivacyModeChanged(active);
    this.naiwa.onPrivacyModeChanged(active);
    if (active) {
      this.petAudio?.setPurrIntensity(0);
      this.endIdleAction();
      this.resetWakeReaction();
      this.typingReactions.reset();
      this.typingPose = neutralReaction();
      this.recentKeyTimes.length = 0;
      this.heldKeys.clear();
      this.catTail.heldVks.clear();
      this.catTailHeldAt.clear();
      this.catTail.active = false;
      this.bubbles.length = 0;
      for (const anim of this.keyAnims.values()) {
        anim.pressed = false;
        anim.pressAmount = 0;
      }
    }
  }

  public onPrivacyTyping(): void {
    this.privacyTypingAt = performance.now();
    this.wakeRendering(this.privacyTypingAt);
    if (this.catBreed === 'dafeiyu') {
      this.dafeiyu.onPrivacyTyping();
    }
  }

  public setRenderScale(scale: number): void {
    this.renderScale = Math.max(0.2, Math.min(1.5, scale));
    this.wakeRendering();
  }

  public getLogicalSize(): { w: number; h: number } {
    return { w: this.logicalW, h: this.logicalH };
  }

  /**
   * The pet's on-screen box in CSS pixels, derived from the very same fit/offset
   * transform `render()` applies. The settings menu anchors to this so it can
   * never sit on top of the model regardless of window size or display scale.
   */
  public getPetScreenRect(): { left: number; top: number; width: number; height: number } {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const cssW = Math.max(1, this.embedded ? this.canvas.clientWidth || 420 : window.innerWidth);
    const cssH = Math.max(1, this.embedded ? this.canvas.clientHeight || 440 : window.innerHeight);
    const toCssX = cssW / Math.max(1, cw);
    const toCssY = cssH / Math.max(1, ch);

    let uniformScale: number;
    let offsetX: number;
    let offsetY: number;
    if (this.embedded) {
      const baseFit = Math.min((cw * 0.86) / this.logicalW, (ch * 0.86) / this.logicalH);
      const effectiveMul =
        this.renderScale <= 1.0 ? this.renderScale : 1.0 + (this.renderScale - 1.0) * 0.3;
      uniformScale = baseFit * effectiveMul;
      offsetX = (cw - this.logicalW * uniformScale) * 0.5;
      offsetY = (ch - this.logicalH * uniformScale) * 0.52;
    } else {
      const dpr = cw / cssW;
      const fitScale = Math.min(cw / this.logicalW, ch / this.logicalH);
      uniformScale = Math.min(fitScale, this.renderScale * dpr);
      offsetX = cw - this.logicalW * uniformScale - desktopPetInsets.right * dpr;
      offsetY = ch - this.logicalH * uniformScale - desktopPetInsets.bottom * dpr;
    }
    return {
      left: offsetX * toCssX,
      top: offsetY * toCssY,
      width: this.logicalW * uniformScale * toCssX,
      height: this.logicalH * uniformScale * toCssY,
    };
  }

  /**
   * Maps a client-space point (event.clientX/Y) into logical canvas coordinates,
   * inverting whatever fit/offset transform `render()` applied. Without this,
   * clicks drift as soon as the canvas is letterboxed or the window scale != 100%.
   */
  public clientToLogical(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const px = (clientX - rect.left) * (cw / cssW);
    const py = (clientY - rect.top) * (ch / cssH);

    let uniformScale: number;
    let offsetX: number;
    let offsetY: number;
    if (this.embedded) {
      const baseFit = Math.min((cw * 0.86) / this.logicalW, (ch * 0.86) / this.logicalH);
      const effectiveMul =
        this.renderScale <= 1.0 ? this.renderScale : 1.0 + (this.renderScale - 1.0) * 0.3;
      uniformScale = baseFit * effectiveMul;
      offsetX = (cw - this.logicalW * uniformScale) * 0.5;
      offsetY = (ch - this.logicalH * uniformScale) * 0.52;
    } else {
      const dpr = cw / cssW;
      const fitScale = Math.min(cw / this.logicalW, ch / this.logicalH);
      uniformScale = Math.min(fitScale, this.renderScale * dpr);
      offsetX = cw - this.logicalW * uniformScale - desktopPetInsets.right * dpr;
      offsetY = ch - this.logicalH * uniformScale - desktopPetInsets.bottom * dpr;
    }
    if (uniformScale <= 0.001) return { x: 0, y: 0 };
    return {
      x: (px - offsetX) / uniformScale,
      y: (py - offsetY) / uniformScale,
    };
  }

  private syncLayoutPositions(): void {
    const m = resolveDeskMetrics(
      this.keyboardLayout,
      this.catBreed,
      this.keyboardScale,
      this.propConfig.enabled,
      this.propConfig.side === 'left' ? 'left' : 'right',
    );
    this.metrics = m;
    this.logicalW = m.logicalW;
    this.logicalH = m.logicalH;
    this.catCenterX = m.catCenterX;
    this.catTopY = m.catTopY;
    this.catBaseY = m.catBaseY;
    this.kbCenterX = m.kbCenterX;
    this.kbCenterY = m.kbCenterY;
    this.kbWidth = m.kbWidth;
    this.kbHeight = m.kbHeight;
    this.kbTiltRad = m.kbTiltRad;
    this.mouseBaseX = m.mouseBaseX;
    this.mouseBaseY = m.mouseBaseY;
  }

  /** Resolved facing of the dedicated mouse, independent from the keyboard deck. */
  public get mouseFacing(): 'cat' | 'viewer' {
    return resolveMouseFacing(this.mouseOrientation, this.keyboardOrientation);
  }

  public setKeyboardScale(scale: number): void {
    const next = clampKeyboardScale(scale, this.keyboardLayout);
    if (Math.abs(next - this.keyboardScale) < 0.001) return;
    this.keyboardScale = next;
    this.syncLayoutPositions();
    this.wakeRendering();
  }

  public setMouseOrientation(mode: MouseOrientation): void {
    const next: MouseOrientation =
      mode === 'cat' || mode === 'viewer' ? mode : 'auto';
    if (next === this.mouseOrientation) return;
    this.mouseOrientation = next;
    this.wakeRendering();
  }

  public setPropEnabled(enabled: boolean): void {
    if (enabled === this.propEnabled) return;
    this.propEnabled = enabled;
    this.syncLayoutPositions();
    this.wakeRendering();
  }

  public getHitRegions(): HitRegions {
    // Report the pet's true on-screen box so Rust maps cursor position onto the
    // same space the canvas actually drew into, even after the window was resized.
    const box = this.getPetScreenRect();
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    const petBox = {
      cx: (box.left + box.width / 2) / vw,
      cy: (box.top + box.height / 2) / vh,
      rx: box.width / 2 / vw,
      ry: box.height / 2 / vh,
    };
    const regions = buildHitRegions(
      this.metrics,
      this.mouseFacing,
      this.propConfig.enabled,
      this.propConfig.side === 'left' ? 'left' : 'right',
      petBox,
    );
    if (this.catBreed === 'naiwa') {
      const l = this.buildNaiwaLayout();
      regions.cat = { cx: l.centerX / l.logicalW, cy: (l.baseY - l.bodyHeight * 0.40) / l.logicalH,
        rx: l.bodyHeight * 0.41 / l.logicalW, ry: l.bodyHeight * 0.46 / l.logicalH };
    }
    return regions;
  }

  public setLightConfig(raw: unknown): void {
    this.lightEngine.setConfig(normalizeLightConfig(raw));
    this.wakeRendering();
  }

  public getLightConfig(): KeyboardLightConfig {
    return this.lightEngine.getConfig();
  }

  public setDeskSkin(raw: unknown): void {
    this.deskSkin = normalizeDeskSkin(raw);
    this.wakeRendering();
  }

  /** Replaces the global DIY keycap overrides (per-key colour / legend). */
  public setKeycapOverrides(raw: unknown): void {
    this.keycapOverrides = normalizeKeycaps(raw) ?? {};
    this.wakeRendering();
  }

  public getKeycapOverrides(): Record<string, KeycapOverride> {
    return this.keycapOverrides;
  }

  public getDeskSkin(): DeskSkinConfig {
    return this.deskSkin;
  }

  public setPropConfig(raw: unknown): void {
    const cfg = normalizePropConfig(raw);
    const prev = this.propConfig;
    const kindChanged = cfg.kind !== prev.kind;
    const sideChanged = cfg.side !== prev.side;
    this.propConfig = cfg;
    this.propEnabled = cfg.enabled;
    if (kindChanged || (!prev.enabled && cfg.enabled)) {
      this.drinker.refill();
      this.drinker.reset(cfg);
      this.propFizz = 0;
    }
    // Turning the prop off mid-sip should drop the arm instead of freezing it in the air.
    if (prev.enabled && !cfg.enabled) {
      this.drinker.reset(cfg);
      this.propFizz = 0;
    }
    if (cfg.enabled !== prev.enabled || sideChanged) {
      this.syncLayoutPositions();
    }
    this.wakeRendering();
  }

  public getPropConfig(): PropConfig {
    return this.propConfig;
  }

  /** Current idle behaviour, or null when none is playing. */
  public get idleActionKind(): IdleActionKind | null {
    return this.idleAction?.kind ?? null;
  }

  public setIdleAutoEnabled(enabled: boolean): void {
    if (this.idleAutoEnabled === enabled) return;
    this.idleAutoEnabled = enabled;
    if (!enabled) this.endIdleAction();
    this.wakeRendering();
  }

  /** Explicitly stop a manual gesture, drink or tantrum, even with auto-idle off.
   * Keep input contacts and renderer interpolation so the hands can settle naturally. */
  public stopCurrentAction(): void {
    this.endIdleAction();
    this.drinker.reset(this.propConfig);
    this.propFizz = 0; this.drinkFeedback = null;
    this.resetWakeReaction();
    this.petAudio?.setPurrIntensity(0);
    this.nextIdleActionAt = this.elapsed + this.idleDelaySec;
    this.wakeRendering();
  }

  /** How many seconds of silence before a random idle action fires. */
  public setIdleDelaySec(sec: number): void {
    if (!Number.isFinite(sec)) return;
    this.idleDelaySec = Math.min(120, Math.max(2, sec));
    this.wakeRendering();
  }

  /** Plays one of the idle behaviours right now (also used by MCP / the menu). */
  public triggerIdleAction(rawKind: string, fromMenu = false): boolean {
    if (this.privacyMode) return false;
    if (rawKind === 'calm') { this.calmSleepReaction(); return true; }
    if (rawKind === 'tailGround') {
      if (this.catBreed === 'dafeiyu' || this.drinker.drinking) return false;
      this.interruptIdleAction(); this.beginSleepReaction(); return true;
    }
    if (this.sleepReaction.visible(this.elapsed)) return false;
    const kind: IdleActionKind = (IDLE_ALIASES[rawKind] ?? rawKind) as IdleActionKind;
    if (kind === 'drink') {
      if (!this.propConfig.enabled) return false;
      return this.triggerSip() || this.clickProp() !== 'ignored';
    }
    const frogAction = FROG_ACTIONS.includes(kind as FrogAction);
    if (frogAction && this.catBreed !== 'naiwa') return false;
    if (!frogAction && !['stretch', 'groom', 'nap', 'cuddle', 'wave', 'tilt', 'slowBlink'].includes(kind)) return false;
    if (this.idleAction || this.drinker.drinking) return false;

    // The whale girl has her own rig: she waves and stretches with her hands.
    if (this.catBreed === 'dafeiyu') {
      if (kind !== 'wave' && kind !== 'stretch') return false;
      const fishDuration = kind === 'wave' ? 2.6 : 2.4;
      this.idleAction = { kind, t: 0, duration: fishDuration };
      if (fromMenu) this.menuActionMouseGraceUntil = performance.now() + 200;
      this.wakeRendering();
      return true;
    }

    const duration = frogAction ? FROG_DURATIONS[kind as FrogAction] : kind === 'slowBlink' ? 2.4 : kind === 'tilt' ? 2.2 :
      kind === 'nap'
        ? 8 + Math.random() * 4
        : kind === 'groom'
          ? 2.8 + Math.random() * 0.8
          : kind === 'stretch'
            ? 2.4 + Math.random() * 0.5
            : kind === 'wave'
              ? 2.4 + Math.random() * 0.6
              : 3.4 + Math.random() * 0.8;
    this.idleAction = { kind, t: 0, duration };
    if (fromMenu) this.menuActionMouseGraceUntil = performance.now() + 200;
    if (kind === 'cuddle') {
      this.cuddleSide = Math.random() < 0.5 ? 'left' : 'right';
      this.spawnHeartParticle(true);
    }
    this.wakeRendering();
    return true;
  }

  public get propLevel(): number {
    return this.drinker.level;
  }

  /** Restores a full drink (clicking an empty cup). */
  public refillProp(): void {
    this.drinker.refill();
    this.propFizz = 0;
    this.wakeRendering();
  }

  /** Manual "drink now" trigger; returns false when the cup is empty or busy. */
  public triggerSip(): boolean {
    if (!this.propConfig.enabled || this.privacyMode || this.sleepReaction.visible(this.elapsed)) return false;
    const started = this.drinker.startSip();
    if (started) {
      this.endIdleAction();
      this.wakeRendering();
    }
    return started;
  }

  /** Where the prop sits in logical canvas coordinates. */
  public getPropAnchor(): { x: number; y: number; side: 'left' | 'right' } {
    const side: 'left' | 'right' =
      this.propConfig.side === 'auto' ? 'right' : this.propConfig.side;
    return { x: this.metrics.propX, y: this.metrics.propY, side };
  }

  /** True when lighting needs continuous frames, so the idle throttle must not park. */
  public get wantsContinuousFrames(): boolean {
    return (
      (this.lightEngine.isAnimating && !this.privacyMode) ||
      this.particles.length > 0 ||
      this.propPose.active ||
      this.propArmAlpha > 0.02 ||
      this.reaction !== null ||
      this.idleAction !== null ||
      this.drinkFeedback !== null ||
      this.annoyance > 0.02 ||
      this.dizzy > 0.02 ||
      this.angerSteam.length > 0
    );
  }

  public setCatAppearance(breedId: string, skin?: CatSkinConfig | null): void {
    const frogRig = skin?.modelProfile?.adapters.includes('canvas-naiwa-v1') === true;
    if (this.activeModelId !== breedId || (this.catBreed === 'naiwa') !== frogRig) {
      this.petAudio?.setPurrIntensity(0);
      this.heldKeys.clear(); this.catTail.heldVks.clear(); this.catTailHeldAt.clear();
      this.catTail.active = false; this.catTail.reach = this.catTail.hover = this.catTail.impactSquash = 0;
      this.naiwa.resetContacts();
      this.recentKeyTimes.length = 0;
      for (const anim of this.keyAnims.values()) { anim.pressed = false; anim.pressAmount = 0; }
      for (const paw of [this.leftPaw, this.rightPaw]) { paw.mode = 'idle'; paw.idleWeight = 1; }
      this.mouseLeftDown = this.mouseRightDown = false;
      this.resetWakeReaction();
      this.endIdleAction();
      this.drinker.reset(this.propConfig);
      this.propPose = { x: 0, y: 0, rot: 0, active: false, lift: 0, handX: 0, handY: 0 };
      this.propArmAlpha = 0; this.propFizz = 0;
      this.reaction = null; this.drinkFeedback = null;
      this.activeModelId = breedId;
    }
    if (breedId === 'dafeiyu') {
      this.catBreed = 'dafeiyu';
      this.customSkin = null;
      this.petAudio?.setPurrIntensity(0);
    } else if (frogRig) {
      // Frog rig: the skin supplies colours; reference artwork and soft deformation own the silhouette.
      this.catBreed = 'naiwa';
      this.customSkin = skin ? resolveCustomSkin(skin) : null;
      this.naiwa.setSkin(this.customSkin);
    } else if ((breedId === 'black' || breedId === 'ragdoll') && (!skin || skin.builtin)) {
      this.catBreed = breedId;
      this.customSkin = null;
    } else if (skin) {
      this.catBreed = 'black';
      this.customSkin = resolveCustomSkin(skin);
    } else {
      this.catBreed = 'black';
      this.customSkin = null;
    }
    this.syncLayoutPositions();
    this.wakeRendering();
  }

  public setKeyboardConfig(
    layout: KeyboardLayoutId,
    orientation: KeyboardOrientation,
    options?: { scale?: number; mouseOrientation?: MouseOrientation; propEnabled?: boolean },
  ): void {
    const nextLayout: KeyboardLayoutId = layout === '108' ? '108' : '65';
    const nextOrientation: KeyboardOrientation = orientation === 'viewer' ? 'viewer' : 'cat';
    const layoutChanged = this.keyboardLayout !== nextLayout;
    this.keyboardLayout = nextLayout;
    this.keyboardOrientation = nextOrientation;
    if (options?.scale !== undefined) {
      this.keyboardScale = clampKeyboardScale(options.scale, nextLayout);
    } else if (layoutChanged) {
      this.keyboardScale = defaultKeyboardScale(nextLayout);
    }
    if (options?.mouseOrientation !== undefined) {
      this.mouseOrientation = options.mouseOrientation;
    }
    if (options?.propEnabled !== undefined) {
      this.propEnabled = options.propEnabled;
    }

    this.syncLayoutPositions();

    if (layoutChanged) {
      this.heldKeys.clear();
      this.catTail.heldVks.clear();
      this.catTailHeldAt.clear();
      this.leftPaw.pos = { x: this.catCenterX - 18, y: this.catBaseY };
      this.leftPaw.target = { x: this.catCenterX - 18, y: this.catBaseY };
      this.rightPaw.pos = { x: this.catCenterX + 18, y: this.catBaseY };
      this.rightPaw.target = { x: this.catCenterX + 18, y: this.catBaseY };
    }
    this.wakeRendering();
  }

  private buildDaFeiYuLayout(): DaFeiYuLayout {
    const mx = this.mouseBaseX + this.mouseOffsetX;
    const my = this.mouseBaseY + this.mouseOffsetY;
    const isCatFacing = this.mouseFacing === 'cat';
    const localBtnX = this.mouseLeftDown ? -6.5 : this.mouseRightDown ? 6.5 : 0;
    const localBtnY = -10.5;
    const ang = this.kbTiltRad + (isCatFacing ? Math.PI : 0);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return {
      logicalW: this.logicalW,
      kbCenterX: this.kbCenterX,
      kbCenterY: this.kbCenterY,
      kbWidth: this.kbWidth,
      kbHeight: this.kbHeight,
      kbTiltRad: this.kbTiltRad,
      mouseBtnX: mx + localBtnX * c - localBtnY * s,
      mouseBtnY: my + localBtnX * s + localBtnY * c,
      mouseCenterX: mx,
      mouseCenterY: my,
      mouseNX: this.lastMouseNX,
      mouseLeft: this.mouseLeftDown,
      mouseRight: this.mouseRightDown,
      mouseActiveAt: this.lastMouseMoveAt,
      mouseClickAt: this.lastMouseClickAt,
      petEnergy: this.petEnergy,
      privacyMode: this.privacyMode,
      privacyTypingAt: this.privacyTypingAt,
      is108: this.keyboardLayout === '108',
      drinkActive: this.propPose.active && this.propArmAlpha > 0.05,
      drinkSide: this.getPropAnchor().side,
      drinkHandX: this.propPose.handX,
      drinkHandY: this.propPose.handY,
      drinkSip: this.drinker.phase === 'sip' ? 1 : this.drinker.phase === 'lift' ? 0.5 : 0,
      poseHands: [
        ...(this.fishPose.leftOn
          ? [{ side: 'left' as const, x: this.fishPose.leftX, y: this.fishPose.leftY }]
          : []),
        ...(this.fishPose.rightOn
          ? [{ side: 'right' as const, x: this.fishPose.rightX, y: this.fishPose.rightY }]
          : []),
      ],
      poseLean: this.fishPose.lean + this.typingPose.lean * 70 + this.typingPose.yaw * 20,
      poseLift: this.fishPose.lift - this.typingPose.squash * 100 - this.typingPose.pitch * 20,
    };
  }

  private buildNaiwaLayout(): NaiwaLayout {
    const eyeNorm = (v: number, scale: number) => Math.max(-1, Math.min(1, v / scale));
    const pawState = (paw: PawState): NaiwaPaw => ({
      x: paw.pos.x,
      y: paw.pos.y,
      press: paw.mode === 'poke' ? 0.6 : 0,
      active: paw.mode !== 'idle' || paw.idleWeight < 0.6,
      mode: paw.mode,
    });
    return {
      logicalW: this.logicalW,
      logicalH: this.logicalH,
      centerX: this.catCenterX,
      baseY: this.kbCenterY - this.kbHeight * 0.43,
      // Foreshortened low torso stays close to the desk, including wide keyboards.
      bodyHeight: 244 + Math.max(0, this.kbWidth - 266) * 0.18,
      breath: Math.sin(this.elapsed * 2.1),
      bodyBob: this.bodyBob,
      lean: this.spineLean * 0.5 + this.typingSway * 0.35,
      hunch: Math.max(0, this.idlePose.hunch * 0.8 + this.typingHunch * 0.22),
      tilt: this.idlePose.headTilt + this.faceTurnX * 0.004,
      squint: Math.max(this.idlePose.squint, this.petEnergy * 0.8),
      headTurn: eyeNorm(this.faceTurnX, 4),
      eyeLookX: eyeNorm(this.eyeLookX, 7),
      eyeLookY: eyeNorm(this.eyeLookY, 5.2),
      leftPaw: pawState(this.leftPaw),
      rightPaw: pawState(this.rightPaw),
      footKey: { x: this.catTail.targetX, y: this.catTail.targetY - this.catTail.hover,
        reach: this.catTail.reach, press: this.catTail.impactSquash,
        side: this.catTail.targetX < this.catCenterX ? 'left' : 'right' },
      poseHands: [],
      poseLean: 0,
      poseLift: 0,
      drinkActive: this.drinker.phase !== 'rest',
      drinkSip: this.drinker.phase === 'sip' ? 1 : this.drinker.phase === 'lift' ? 0.5 : 0,
      drinkHandX: this.propPose.handX,
      drinkHandY: this.propPose.handY,
      drinkSide: this.getPropAnchor().side,
      privacyMode: this.privacyMode,
      petEnergy: this.petEnergy,
      typingHeat: this.typingHunch,
      anger: Math.max(this.annoyance, this.groundTail.amount),
      groove: this.typingReactions.kind === 'groove' ? this.typingPose.amount : 0,
      excitement: this.typingReactions.kind === 'excited' ? this.typingPose.amount : 0,
      groundAmount: this.groundTail.amount,
      groundLift: this.groundTail.lift,
      seconds: this.elapsed,
      idleKind: this.idleAction?.kind ?? null,
      idleT: this.idleAction ? Math.min(1, this.idleAction.t / this.idleAction.duration) : 0,
    };
  }

  // Dynamic logical proportions (65% compact = 420x440; 108-key full-size = 540x456)
  private logicalW = 420;
  private logicalH = 440;
  private catCenterX = 196;
  private catTopY = 82;
  private catBaseY = 308;
  private readonly catHeight = 226;

  // Mechanical keyboard deck below the sitting cat
  private kbCenterX = 214;
  private kbCenterY = 353;
  private kbWidth = 266;
  private kbHeight = 74;
  private kbTiltRad = (3.4 * Math.PI) / 180;

  // True-scale white oval mouse to the left of keyboard
  private mouseBaseX = 46;
  private mouseBaseY = 338;
  private mouseOffsetX = 0;
  private mouseOffsetY = 0;
  private mouseTargetOffsetX = 0;
  private mouseTargetOffsetY = 0;
  private mouseLeftDown = false;
  private mouseRightDown = false;
  private mouseMiddleDown = false;
  private mouseDownAt: Record<'left' | 'right' | 'middle', number> = {
    left: 0,
    right: 0,
    middle: 0,
  };
  private mouseLeftPress = 0;
  private mouseRightPress = 0;
  private mouseMiddlePress = 0;
  private lastMouseClickAt = -10000;
  private mouseScrollFlash = 0;
  private lastMouseMoveAt = -10000;
  private mouseBadges: Array<{
    id: number;
    label: string;
    color: string;
    x: number;
    y: number;
    createdAt: number;
    lifetime: number;
  }> = [];

  // Cursor & 100% live eye tracking + 2.5D head turn
  private cursorRelX = 0.5;
  private cursorRelY = 0.5;
  private cursorOverCat = false;
  private eyeLookX = 0;
  private eyeLookY = 0;
  private faceTurnX = 0;

  // Spine-shear deformation state (exact measured flexible cat spine + playful typing body/head sway!)
  private spineLean = 0;    // -1 (mouse lean: head shifts -46px left while hips stay anchored!) .. +1
  private headTilt = 0;
  private typingHunch = 0;  // 0..1 lowers head & rounds posture slightly when typing
  private typingSway = 0;   // -1..+1 lively left-right torso & head sway while typing!
  private typingSwayVel = 0;
  private typingGroovePhase = 0;
  private lastKeyBias = 0;
  private strikeRock = 0;
  private strikeRockVel = 0;
  private bodyBob = 0;
  private kbBounce = 0;

  // Blinking, petting, ear micro-twitch, typing rhythm
  private nextBlinkAt = 2.8;
  private blinkProgress = 0;
  private isBlinking = false;

  private lastPetCursorX: number | null = null;
  private lastPetCursorY: number | null = null;
  private petAnchorX: number | null = null;
  private petAnchorY: number | null = null;
  private petStrokeDirX = 0;
  private petStrokeDirY = 0;
  private petStrokeTravel = 0;
  private petReverseTravel = 0;
  private petStrokeCount = 0;
  private lastPetMoveAt = -10000;
  private petEnergy = 0;
  private squintAmount = 0;
  private earTwitchLeft = 0;
  private earTwitchRight = 0;
  /** Slow per-ear "listening" turn (radians, outward) and relaxed ear droop. */
  private earTurnLeft = 0;
  private earTurnRight = 0;
  private earBack = 0;
  private nextEarFlickAt = 3;
  private recentKeyTimes: number[] = [];
  private typingEnergy = 0;
  private typingReactions = new TypingReactions();
  private typingPose = neutralReaction();
  /** 0..1 annoyance from sustained fast typing; drives the angry → dizzy arc. */
  private annoyance = 0;
  /** 0..1 how dizzy the pet is once it has lost patience. */
  private dizzy = 0;
  /**
   * 0..1 "fierceness" derived from annoyance: drives the narrowing pupils and the
   * angry brows, so the stare turns hostile gradually rather than popping on.
   */
  private get fierce(): number {
    return Math.max(0, Math.min(1, (this.annoyance - 0.22) / 0.62));
  }

  /** Current mood meter (0..1 annoyance, 0..1 dizzy) — used by MCP/tests. */
  public get moodMeter(): { annoyance: number; dizzy: number } {
    return { annoyance: this.annoyance, dizzy: this.dizzy };
  }

  /** Manually push the pet toward anger (MCP `set_mood`). */
  public setMoodMeter(annoyance?: number, dizzy?: number): void {
    if (typeof annoyance === 'number' && Number.isFinite(annoyance)) {
      this.annoyance = Math.min(1, Math.max(0, annoyance));
    }
    if (typeof dizzy === 'number' && Number.isFinite(dizzy)) {
      this.dizzy = Math.min(1, Math.max(0, dizzy));
    }
    this.wakeRendering();
  }

  /** Lets MCP / settings disable automatic reactions to sustained typing. */
  public setMoodTrackingEnabled(enabled: boolean): void {
    this.moodTrackingEnabled = enabled;
    if (!enabled) {
      this.typingReactions.reset();
      this.typingPose = neutralReaction();
      this.annoyance = 0;
      this.dizzy = 0;
      this.angerSteam.length = 0;
    }
    this.wakeRendering();
  }

  /**
   * Which keys the plush tail pats instead of a paw.
   *
   * smart: the right-hand cluster (original behaviour).
   * custom: an explicit key-id list.
   * edge: the outermost column/modifier keys.
   * off: never — every key is handled by a paw.
   */
  private shouldTailPat(spec: KeySpec, targetPoint: Vec2, smartThresholdX: number): boolean {
    if (this.sleepReaction.visible(this.elapsed)) return false;
    switch (this.tailKeyMode) {
      case 'off':
        return false;
      case 'custom':
        return this.tailKeyIdSet.has(spec.id);
      case 'edge': {
        const layout = getKeyboardLayout(this.keyboardLayout);
        return spec.uStart + spec.uWidth >= layout.totalUnits - 1.01 || spec.uStart <= 0.01;
      }
      default:
        return targetPoint.x >= smartThresholdX;
    }
  }

  /** Lets the menu / MCP change which keys the tail pats. */
  public setTailKeyConfig(mode: TailKeyMode, keyIds: readonly string[]): void {
    this.tailKeyMode =
      mode === 'custom' || mode === 'edge' || mode === 'off' ? mode : 'smart';
    this.tailKeyIdSet = new Set(
      (Array.isArray(keyIds) ? keyIds : [])
        .map((id) => String(id).trim().toLowerCase())
        .filter(Boolean),
    );
    if (this.tailKeyMode === 'off') {
      this.catTail.active = false;
      this.catTail.heldVks.clear();
      this.catTailHeldAt.clear();
    }
    this.wakeRendering();
  }

  public get tailKeyConfig(): { mode: TailKeyMode; ids: string[] } {
    return { mode: this.tailKeyMode, ids: [...this.tailKeyIdSet] };
  }

  /**
   * 3D-only cosmetic. The hand-drawn 2D cat has no headphone layer, so this is a
   * deliberate no-op kept so the OBS/3D call sites can share one interface.
   */
  public setHeadphones(_active: boolean): void {
    // intentionally empty
  }
  private angerSteam: Array<{ x: number; y: number; vy: number; life: number; max: number; r: number }> = [];
  private nextSteamAt = 0;
  private moodTrackingEnabled = true;
  private tailKeyMode: TailKeyMode = 'smart';
  private tailKeyIdSet = new Set<string>(DEFAULT_TAIL_KEY_IDS);
  private lastAnyKeyAt = -10000;

  // Paws & continuous held-key tracking (Fixes #3)
  private leftPaw: PawState;
  private rightPaw: PawState;
  private lastSpacePaw: 'left' | 'right' = 'left';
  private heldKeys = new Map<
    number,
    { side: 'left' | 'right'; specId: string; x: number; y: number; at: number }
  >();
  private catTailHeldAt = new Map<number, number>();

  // Keys & bubbles
  private keyAnims = new Map<string, KeyAnim>();
  private bubbles: KeyBubble[] = [];
  private nextBubbleId = 1;

  constructor(canvas: HTMLCanvasElement, options?: { embedded?: boolean; previewOnly?: boolean }) {
    this.canvas = canvas;
    this.embedded = Boolean(options?.embedded);
    this.previewOnly = Boolean(options?.previewOnly);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not initialize 2D canvas context');
    this.ctx = ctx;

    for (const k of KEYBOARD_KEYS_65) {
      this.keyAnims.set(k.id, { pressed: false, pressAmount: 0, lastHitAt: -10000 });
    }
    for (const k of KEYBOARD_KEYS_108) {
      if (!this.keyAnims.has(k.id)) {
        this.keyAnims.set(k.id, { pressed: false, pressAmount: 0, lastHitAt: -10000 });
      }
    }

    this.leftPaw = {
      side: 'left',
      shoulderNormY: 0.50,
      shoulderHalfX: -32,
      pos: { x: this.catCenterX - 18, y: this.catBaseY },
      vel: { x: 0, y: 0 },
      target: { x: this.catCenterX - 18, y: this.catBaseY },
      mode: 'idle',
      idleWeight: 1,
      curlWeight: 0,
      pokeTime: 1,
      impactSquash: 0,
      lastActiveAt: -10000,
      smears: [],
    };

    this.rightPaw = {
      side: 'right',
      shoulderNormY: 0.50,
      shoulderHalfX: 32,
      pos: { x: this.catCenterX + 18, y: this.catBaseY },
      vel: { x: 0, y: 0 },
      target: { x: this.catCenterX + 18, y: this.catBaseY },
      mode: 'idle',
      idleWeight: 1,
      curlWeight: 0,
      pokeTime: 1,
      impactSquash: 0,
      lastActiveAt: -10000,
      smears: [],
    };

    this.resize();
    if (!this.previewOnly) window.addEventListener('resize', () => this.resize());
  }

  /** Render once for the library; never starts an animation or changes the live pet. */
  public async snapshot(skin: CatSkinConfig): Promise<string> {
    if (skin.id === 'dafeiyu') await this.dafeiyu.ready();
    if (skin.modelProfile?.adapters.includes('canvas-naiwa-v1')) await this.naiwa.ready();
    this.setCatAppearance(skin.id, skin); this.setIdleAutoEnabled(false);
    this.update(1 / 60, 0); this.render();
    return this.canvas.toDataURL('image/png');
  }

  public resize(): void {
    const dpr = this.previewOnly ? 1 : Math.max(window.devicePixelRatio || 1, 1);
    const cssW = Math.max(1, this.embedded ? (this.canvas.clientWidth || 420) : window.innerWidth);
    const cssH = Math.max(1, this.embedded ? (this.canvas.clientHeight || 440) : window.innerHeight);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.wakeRendering();
  }

  public start(): void {
    if (this.previewOnly) return;
    if (this.rafId !== null || this.idleFrameTimer !== null) return;
    this.lastTime = this.lastActivityAt = performance.now();
    this.rafId = requestAnimationFrame(this.renderFrame);
  }

  public stop(): void {
    this.petAudio?.setPurrIntensity(0);
    this.resetWakeReaction();
    this.endIdleAction();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.idleFrameTimer !== null) window.clearTimeout(this.idleFrameTimer);
    this.rafId = null;
    this.idleFrameTimer = null;
  }

  private readonly renderFrame = (now: number): void => {
    const frameId = this.rafId;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.update(dt, now);
    this.render();
    this.onAfterRender?.();

    if (this.rafId !== frameId) return;
    if (now - this.lastActivityAt < IDLE_RENDER_AFTER_MS) {
      this.rafId = requestAnimationFrame(this.renderFrame);
      return;
    }

    // Pause after drawing so even a slow frame leaves CPU headroom on older hardware (Fixes #9).
    // Animated keyboard lighting keeps painting, but at a throttled rate instead of 60fps.
    const idleDelay = this.wantsContinuousFrames ? LIGHT_IDLE_FRAME_MS : IDLE_RENDER_PAUSE_MS;
    this.rafId = null;
    this.idleFrameTimer = window.setTimeout(() => {
      this.idleFrameTimer = null;
      this.rafId = requestAnimationFrame(this.renderFrame);
    }, idleDelay);
  };

  private wakeRendering(now = performance.now()): void {
    if (this.previewOnly) return;
    this.lastActivityAt = now;
    if (this.idleFrameTimer === null) return;
    window.clearTimeout(this.idleFrameTimer);
    this.idleFrameTimer = null;
    this.rafId = requestAnimationFrame(this.renderFrame);
  }

  // ---- Flexible spine coordinate system (exact match to measured 0.3s -> 2.2s shear!) ----

  private spinePoint(t: number, breath: number): Vec2 {
    // t in [0..1]: 0 = ear tips, 1 = seated base on desk
    const u = Math.max(0, Math.min(1, 1 - t)); // 0 at hips, 1 at head
    const shearCurve = u * u * (3 - 2 * u); // smoothstep from hips up to head!
    // Measured mouse-lean shift (-46px at head) + lively typing left-right body/head sway (+-25px)!
    const leanAmp = this.keyboardLayout === '108' ? 76 : 46;
    const leanX = (this.spineLean * leanAmp + this.typingSway * 25 + this.strikeRock * 10) * shearCurve;
    const swayDipY = Math.abs(this.typingSway) * 4.0 * shearCurve;
    const hunchY = (this.typingHunch * 13 + this.bodyBob * 4.8 + breath) * shearCurve + swayDipY;
    // Slight forward drop when leaning deeply to the mouse
    const leanDropY = Math.abs(this.spineLean) * 6 * shearCurve;
    return {
      x: this.catCenterX + leanX,
      y: this.catTopY + t * this.catHeight + hunchY + leanDropY,
    };
  }

  private getLiveShoulder(paw: PawState, breath: number): Vec2 {
    const sp = this.spinePoint(paw.shoulderNormY, breath);
    return {
      x: sp.x + paw.shoulderHalfX,
      y: sp.y,
    };
  }

  private getLiveCurledPawPos(paw: PawState, breath: number): Vec2 {
    if (this.catBreed === 'naiwa') return this.naiwa.getHandWorld(paw.side, this.buildNaiwaLayout());
    // Bent forearm elbow -> cute curled paw sitting near lower belly (matches 8.3s / 10.6s!)
    const sp = this.spinePoint(0.84, breath);
    const bob = Math.sin(this.elapsed * 12 + (paw.side === 'left' ? 0 : Math.PI)) * (1.5 + this.typingEnergy * 2.0);
    const xOff = paw.side === 'left' ? -24 : 24;
    return {
      x: sp.x + xOff,
      y: sp.y + bob,
    };
  }

  // ---- Input event handlers ----

  public onKeyDown(vk: number, repeat: boolean): void {
    if (this.privacyMode) {
      if (!repeat) this.onPrivacyTyping();
      return;
    }
    if (!repeat) { this.disturbSleep(); this.interruptIdleAction(); }
    const now = performance.now();
    const spec = resolveKeyByVk(vk, this.keyboardLayout);
    if (!spec) return;
    this.wakeRendering(now);

    const anim = this.keyAnims.get(spec.id);
    if (anim) {
      anim.pressed = true;
      anim.pressAmount = 1;
      anim.lastHitAt = now;
    }

    if (repeat) {
      this.lastAnyKeyAt = now;
      const held = this.heldKeys.get(vk);
      if (held) held.at = now;
      if (this.catTail.heldVks.has(vk)) {
        this.catTailHeldAt.set(vk, now);
      }
      return;
    }

    this.lastAnyKeyAt = now;
    this.recentKeyTimes.push(now);
    if (this.recentKeyTimes.length > 26) this.recentKeyTimes.shift();
    if (anim) this.spawnKeyRipple(spec.id);

    this.bodyBob = Math.min(1.15, this.bodyBob + 0.65);
    this.kbBounce = Math.min(1, this.kbBounce + 0.45);

    if (this.catBreed === 'dafeiyu') {
      const pt = this.getKeyWorldCenter(spec);
      this.dafeiyu.onKeyDown(vk, pt, this.buildDaFeiYuLayout(), repeat);
      if (this.showKeyBubbles) {
        const label = formatBubbleForVk(vk, spec);
        if (label) {
          this.spawnBubble(label, spec.id === 'space', pt.x, now);
        }
      }
      return;
    }

    if (Math.random() < 0.16) {
      if (Math.random() < 0.5) this.earTwitchLeft = 1;
      else this.earTwitchRight = 1;
    }

    const layout = getKeyboardLayout(this.keyboardLayout);
    const isCatFacing = this.keyboardOrientation === 'cat';
    const keyColCenter = spec.uStart + spec.uWidth * 0.5;
    const screenKeyCol = isCatFacing ? layout.totalUnits - keyColCenter : keyColCenter;
    const midCol = layout.totalUnits * 0.5;
    const keyBias = Math.max(-1, Math.min(1, (screenKeyCol - midCol) / (layout.totalUnits * 0.34)));
    this.lastKeyBias = keyBias;
    this.typingGroovePhase += 1.22;

    let targetPoint = this.getKeyWorldCenter(spec);
    let chosen: PawState;

    const activelyMousing = this.mouseLeftDown || this.mouseRightDown || now - this.lastMouseMoveAt < 320;

    // Keys sitting right next to the cat's tail on the right side of the keyboard -> patted playfully by the plush cat tail!
    const tailThresholdX =
      this.keyboardLayout === '108'
        ? this.kbCenterX + this.kbWidth * 0.155
        : this.kbCenterX + this.kbWidth * 0.29;
    if (spec.id !== 'space' && this.shouldTailPat(spec, targetPoint, tailThresholdX)) {
      const clampedTailPt = this.clampToKeyboardSurface(targetPoint);
      if (!this.catTail.active && this.catTail.reach < 0.08) {
        const hipRight = this.spinePoint(0.84, 0);
        this.catTail.tipX = hipRight.x + 126;
        this.catTail.tipY = hipRight.y - 37;
      }
      this.catTail.active = true;
      this.catTail.heldVks.add(vk);
      this.catTailHeldAt.set(vk, now);
      this.catTail.targetX = clampedTailPt.x;
      this.catTail.targetY = clampedTailPt.y;
      this.catTail.tapAt = now;
      this.catTail.impactSquash = 1.0;

      // Subtle playful hip shift & rock as the tail pats the right-side key!
      this.strikeRockVel += 0.95 + this.typingEnergy * 0.65;
      if (!activelyMousing) {
        this.typingSwayVel += (keyBias * 1.15 + Math.cos(this.typingGroovePhase) * 0.75) * (0.85 + this.typingEnergy * 0.35);
      }

      if (this.showKeyBubbles) {
        const label = formatBubbleForVk(vk, spec);
        if (label) {
          this.spawnBubble(label, false, clampedTailPt.x, now);
        }
      }
      return;
    }

    const splitCol =
      this.keyboardLayout === '108'
        ? isCatFacing
          ? 12.2
          : 8.4
        : 7.5;

    if (spec.id === 'space') {
      if (activelyMousing) {
        chosen = this.freePaw;
      } else {
        this.lastSpacePaw = this.lastSpacePaw === 'left' ? 'right' : 'left';
        chosen = this.lastSpacePaw === 'left' ? this.leftPaw : this.rightPaw;
      }
      const spaceU = isCatFacing
        ? chosen.side === 'left'
          ? spec.uStart + spec.uWidth * 0.68
          : spec.uStart + spec.uWidth * 0.32
        : chosen.side === 'left'
          ? spec.uStart + spec.uWidth * 0.32
          : spec.uStart + spec.uWidth * 0.68;
      const rY = spec.rowY ?? spec.row;
      targetPoint = this.projectKeyboardPoint(spaceU, rY + 0.50);
    } else if (activelyMousing) {
      chosen = this.freePaw;
    } else if (screenKeyCol < splitCol) {
      chosen = this.leftPaw;
    } else {
      chosen = this.rightPaw;
    }

    // The hand holding a drink stays attached; ordinary typing uses the free hand.
    if (this.catBreed === 'naiwa' && this.drinker.phase !== 'rest' && chosen.side === this.getPropAnchor().side) {
      chosen = chosen.side === 'left' ? this.rightPaw : this.leftPaw;
    }
    const sideSign = chosen.side === 'left' ? -1 : 1;
    this.strikeRockVel += sideSign * (1.75 + this.typingEnergy * 1.25);
    if (!activelyMousing) {
      // Lively groove impulse: rocks head & upper body back and forth as the cat types!
      this.typingSwayVel += (keyBias * 2.1 + Math.cos(this.typingGroovePhase) * 1.65) * (0.9 + this.typingEnergy * 0.45);
    }

    const prevShoulder = this.getLiveShoulder(chosen, 0);
    if (chosen.mode === 'poke' && Math.hypot(targetPoint.x - chosen.pos.x, targetPoint.y - chosen.pos.y) > 22) {
      chosen.smears.push({
        sx: prevShoulder.x,
        sy: prevShoulder.y,
        px: chosen.pos.x,
        py: chosen.pos.y,
        alpha: 0.28,
      });
      if (chosen.smears.length > 3) chosen.smears.shift();
    }

    if (chosen.mode === 'curled' || chosen.mode === 'idle') {
      const startPt = this.getLiveCurledPawPos(chosen, 0);
      chosen.pos = { x: startPt.x, y: startPt.y };
      chosen.vel = { x: 0, y: 0 };
    }
    const clampedTarget = this.clampToKeyboardSurface(targetPoint);
    chosen.mode = 'poke';
    chosen.target = clampedTarget;
    chosen.pokeTime = 0;
    chosen.impactSquash = 0.85;
    chosen.lastActiveAt = now;
    this.heldKeys.set(vk, {
      side: chosen.side,
      specId: spec.id,
      x: clampedTarget.x,
      y: clampedTarget.y,
      at: now,
    });

    const other = chosen.side === 'left' ? this.rightPaw : this.leftPaw;
    if (other.mode === 'idle' && !activelyMousing) {
      other.mode = 'curled';
      other.lastActiveAt = now;
    }

    if (this.showKeyBubbles) {
      const label = formatBubbleForVk(vk, spec);
      if (label) {
        this.spawnBubble(label, spec.id === 'space', targetPoint.x, now);
      }
    }
  }

  public onKeyUp(vk: number): void {
    this.dafeiyu.onKeyUp(vk);
    this.heldKeys.delete(vk);
    if (this.catTail.heldVks.has(vk)) {
      this.catTail.heldVks.delete(vk);
      this.catTailHeldAt.delete(vk);
      if (this.catTail.heldVks.size === 0) {
        this.catTail.releaseAt = performance.now();
      }
    }
    if (this.privacyMode) return;
    const spec = resolveKeyByVk(vk, this.keyboardLayout);
    if (!spec) return;
    this.wakeRendering();
    let stillHeldSameSpec = false;
    for (const h of this.heldKeys.values()) {
      if (h.specId === spec.id) {
        stillHeldSameSpec = true;
        break;
      }
    }
    if (!stillHeldSameSpec) {
      const anim = this.keyAnims.get(spec.id);
      if (anim) anim.pressed = false;
    }
  }

  /** Which paw works the mouse — follows the side the mouse sits on. */
  public get mousePawSide(): 'left' | 'right' {
    return this.mouseBaseX > this.logicalW / 2 ? 'right' : 'left';
  }

  /** Paw currently assigned to the mouse. */
  private get mousePaw(): PawState {
    return this.mousePawSide === 'right' ? this.rightPaw : this.leftPaw;
  }

  /** The paw not on the mouse (kept free for poking keys / a support leg). */
  private get freePaw(): PawState {
    return this.mousePawSide === 'right' ? this.leftPaw : this.rightPaw;
  }

  /** Marks the correct paw as the mouse hand and releases the other one. */
  private activateMousePaw(now: number, squash = 0): void {
    const paw = this.mousePaw;
    const other = paw === this.leftPaw ? this.rightPaw : this.leftPaw;
    if (other.mode === 'mouse') other.mode = 'idle';
    if (this.catBreed === 'naiwa' && paw.mode !== 'mouse' && paw.mode !== 'poke') {
      paw.pos = this.naiwa.getHandWorld(paw.side, this.buildNaiwaLayout());
      paw.vel = { x: 0, y: 0 };
    }
    paw.mode = 'mouse';
    if (squash > 0) paw.impactSquash = squash;
    paw.lastActiveAt = now;
  }

  public onGlobalMouseMove(nx: number, ny: number): void {
    const now = performance.now();
    this.wakeRendering(now);
    if (this.idleAction?.kind !== 'nap') this.interruptIdleAction();
    this.lastMouseNX = nx;
    this.mouseTargetOffsetX = (nx - 0.5) * (this.catBreed === 'dafeiyu' ? 14 : 28);
    this.mouseTargetOffsetY = (ny - 0.5) * (this.catBreed === 'dafeiyu' ? 11 : 20);
    this.lastMouseMoveAt = now;

    if (this.idleAction?.kind !== 'nap') this.activateMousePaw(now);
  }

  private getMouseButtonColors(): { left: string; right: string; middle: string } {
    const primary = this.customSkin
      ? this.customSkin.accentColor
      : this.catBreed === 'dafeiyu'
        ? '#5cc8ff'
        : this.catBreed === 'ragdoll'
          ? '#7ac7ff'
          : '#d4f044';
    const scroll = this.customSkin
      ? this.customSkin.accentSideColor
      : this.catBreed === 'dafeiyu'
        ? '#2563eb'
        : this.catBreed === 'ragdoll'
          ? '#4690d8'
          : '#92ba12';

    // Pick a high-contrast complementary color for RMB so Left vs Right click are unmistakable on every skin
    const isWarmAccent = /^#(f[a-f0-9][89a-c]|ff[789a-c]|e[89a-f][789a])/i.test(primary);
    const rightColor = isWarmAccent ? '#58c7ff' : '#ff7b3b';
    return { left: primary, right: rightColor, middle: scroll };
  }

  private spawnMouseBadge(button: 'left' | 'right' | 'middle', now: number): void {
    if (!this.showKeyBubbles) return;
    const colors = this.getMouseButtonColors();
    const label = button === 'left' ? 'LMB' : button === 'right' ? 'RMB' : 'MMB';
    const color = button === 'left' ? colors.left : button === 'right' ? colors.right : colors.middle;
    const mx = this.mouseBaseX + this.mouseOffsetX;
    const my = this.mouseBaseY + this.mouseOffsetY;
    // The LMB/RMB badge must sit over the actual button side of the mouse.
    const isCatFacing = this.mouseFacing === 'cat';
    const sideShift =
      button === 'left'
        ? isCatFacing
          ? 10
          : -10
        : button === 'right'
          ? isCatFacing
            ? -10
            : 10
          : 0;

    if (this.mouseBadges.length >= 2) {
      this.mouseBadges.shift();
    }
    this.mouseBadges.push({
      id: this.nextBubbleId++,
      label,
      color,
      x: Math.max(24, mx + sideShift),
      y: my - 30,
      createdAt: now,
      lifetime: 560,
    });
  }

  public onMouseDown(button: string): void {
    const now = performance.now();
    if (this.privacyMode || now < this.menuActionMouseGraceUntil) return;
    this.disturbSleep();
    this.wakeRendering(now);
    this.interruptIdleAction();
    if (button === 'left') {
      this.mouseLeftDown = true;
      this.mouseDownAt.left = now;
      this.mouseLeftPress = 1;
      this.spawnMouseBadge('left', now);
    } else if (button === 'right') {
      this.mouseRightDown = true;
      this.mouseDownAt.right = now;
      this.mouseRightPress = 1;
      this.spawnMouseBadge('right', now);
    } else if (button === 'middle') {
      this.mouseMiddleDown = true;
      this.mouseDownAt.middle = now;
      this.mouseMiddlePress = 1;
      this.spawnMouseBadge('middle', now);
    }

    this.lastMouseMoveAt = now;
    this.lastMouseClickAt = now;
    this.dafeiyu.resetLeftHandForMouse();
    this.dafeiyu.onMouseAction(now);
    this.activateMousePaw(now, 0.72);
  }

  public onMouseUp(button: string): void {
    this.wakeRendering();
    if (button === 'left') {
      this.mouseLeftDown = false;
      this.mouseDownAt.left = 0;
    } else if (button === 'right') {
      this.mouseRightDown = false;
      this.mouseDownAt.right = 0;
    } else if (button === 'middle') {
      this.mouseMiddleDown = false;
      this.mouseDownAt.middle = 0;
    }
  }

  public onMouseWheel(): void {
    if (this.privacyMode) return;
    this.disturbSleep();
    const now = performance.now();
    this.wakeRendering(now);
    this.interruptIdleAction();
    this.mouseScrollFlash = 1;
    this.lastMouseMoveAt = now;
    this.lastMouseClickAt = now;
    this.dafeiyu.resetLeftHandForMouse();
    this.dafeiyu.onMouseAction(now);
    this.activateMousePaw(now);
  }

  private resetPetStrokes(): void {
    this.lastPetCursorX = null;
    this.lastPetCursorY = null;
    this.petAnchorX = null;
    this.petAnchorY = null;
    this.petStrokeDirX = 0;
    this.petStrokeDirY = 0;
    this.petStrokeTravel = 0;
    this.petReverseTravel = 0;
    this.petStrokeCount = 0;
  }

  public onWindowCursor(relX: number, relY: number, overCat: boolean): void {
    if (relX !== this.cursorRelX || relY !== this.cursorRelY || overCat !== this.cursorOverCat) {
      this.wakeRendering();
    }
    this.cursorRelX = relX;
    this.cursorRelY = relY;
    this.cursorOverCat = overCat;

    if (!this.privacyMode && overCat && !this.mouseLeftDown && !this.mouseRightDown) {
      const now = performance.now();
      const px = relX * this.logicalW;
      const py = relY * this.logicalH;
      if (this.lastPetCursorX !== null && this.lastPetCursorY !== null) {
        const dx = px - this.lastPetCursorX;
        const dy = py - this.lastPetCursorY;
        const dist = Math.hypot(dx, dy);
        if (dist > 1.5 && dist < 80) {
          this.lastPetMoveAt = now;
          const MIN_STROKE_PX = 14;
          const REQUIRED_STROKES = 2;

          if (this.petAnchorX === null || this.petAnchorY === null) {
            this.petAnchorX = this.lastPetCursorX;
            this.petAnchorY = this.lastPetCursorY;
          }

          if (this.petStrokeDirX === 0 && this.petStrokeDirY === 0) {
            const vx = px - this.petAnchorX;
            const vy = py - this.petAnchorY;
            const segLen = Math.hypot(vx, vy);
            if (segLen >= MIN_STROKE_PX) {
              this.petStrokeDirX = vx / segLen;
              this.petStrokeDirY = vy / segLen;
              this.petStrokeTravel = segLen;
              this.petReverseTravel = 0;
            }
          } else {
            const ux = dx / dist;
            const uy = dy / dist;
            const dot = ux * this.petStrokeDirX + uy * this.petStrokeDirY;
            if (dot >= 0.35) {
              // Continuing along the same straight pass across the cat
              this.petStrokeTravel += dist;
              this.petReverseTravel = Math.max(0, this.petReverseTravel - dist * 0.5);
            } else {
              // Reversing or curving (back-and-forth petting / circular rub)
              this.petReverseTravel += dist;
              if (this.petStrokeTravel >= MIN_STROKE_PX && this.petReverseTravel >= MIN_STROKE_PX) {
                this.petStrokeCount += 1;
                this.petStrokeDirX = ux;
                this.petStrokeDirY = uy;
                this.petStrokeTravel = this.petReverseTravel;
                this.petReverseTravel = 0;
                this.petAnchorX = this.lastPetCursorX;
                this.petAnchorY = this.lastPetCursorY;
              }
            }
          }

          // Only unlock petting energy & purring after intentional back-and-forth / circular strokes (Fixes #13)
          if (this.petStrokeCount >= REQUIRED_STROKES) {
            this.petEnergy = Math.min(1, this.petEnergy + dist * 0.015);
            this.calmSleepReaction();
            if (this.idleAction?.kind === 'nap') this.interruptIdleAction();
          }
        }
      } else {
        this.petAnchorX = px;
        this.petAnchorY = py;
      }
      this.lastPetCursorX = px;
      this.lastPetCursorY = py;
    } else {
      this.resetPetStrokes();
    }
  }

  // ---- Keyboard projection ----

  private projectKeyboardPoint(uCol: number, rowPos: number): Vec2 {
    const layout = getKeyboardLayout(this.keyboardLayout);
    const isCatFacing = this.keyboardOrientation === 'cat';
    const screenU = isCatFacing ? layout.totalUnits - uCol : uCol;
    const screenRow = isCatFacing ? layout.totalRows - rowPos : rowPos;

    const padX = 7;
    const padY = 6;
    const innerW = this.kbWidth - padX * 2;
    const innerH = this.kbHeight - padY * 2;
    const localX = -innerW / 2 + (screenU / layout.totalUnits) * innerW;
    const localY = -innerH / 2 + (screenRow / layout.totalRows) * innerH;

    const depthFactor = 0.94 + (screenRow / layout.totalRows) * 0.09;
    const px = localX * depthFactor;
    const py = localY;

    const cos = Math.cos(this.kbTiltRad);
    const sin = Math.sin(this.kbTiltRad);
    return {
      x: this.kbCenterX + px * cos - py * sin,
      y: this.kbCenterY + px * sin + py * cos,
    };
  }

  private getKeyWorldCenter(spec: KeySpec): Vec2 {    const layout = getKeyboardLayout(this.keyboardLayout);
    const isCatFacing = this.keyboardOrientation === 'cat';
    const uClamped = Math.max(0.65, Math.min(layout.totalUnits - 0.65, spec.uStart + spec.uWidth * 0.5));
    const rY = spec.rowY ?? spec.row;
    const rSpan = spec.rowSpan ?? 1;
    let rowPos = rY + rSpan * 0.5;
    if (isCatFacing && rY <= 0.1) {
      rowPos = rY + 0.68;
    } else if (!isCatFacing && rY + rSpan >= layout.totalRows - 0.1) {
      rowPos = rY + rSpan - 0.68;
    }
    return this.projectKeyboardPoint(uClamped, rowPos);
  }

  /** Lightens (amount > 0) or darkens (amount < 0) a #rrggbb colour. */
  private shade(hexColor: string, amount: number): string {
    const h = hexColor.replace('#', '');
    const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
    const n = parseInt(full, 16);
    if (!Number.isFinite(n)) return hexColor;
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const out = ch.map((c) => {
      const v = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
      return Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0');
    });
    return `#${out.join('')}`;
  }

  /** Picks near-white or near-black ink so legends stay legible on any keycap. */
  private readableInk(background: string): string {
    const h = background.replace('#', '');
    const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
    const n = parseInt(full, 16);
    if (!Number.isFinite(n)) return '#e8edf4';
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.55 ? '#1a1d23' : '#e8edf4';
  }

  /** Emits a ripple at the struck key so 'ripple' lighting spreads from real keystrokes. */  private spawnKeyRipple(keyId: string): void {
    const cfg = this.lightEngine.getConfig();
    if (!cfg.enabled || cfg.effect !== 'ripple' || !cfg.reactive) return;
    const layout = getKeyboardLayout(this.keyboardLayout);
    const spec = layout.keys.find((k) => k.id === keyId);
    if (!spec) return;
    const isCatFacing = this.keyboardOrientation === 'cat';
    const innerW = this.kbWidth - 14;
    const innerH = this.kbHeight - 12;
    const rY = spec.rowY ?? spec.row;
    const rSpan = spec.rowSpan ?? 1;
    const screenRowTop = isCatFacing ? layout.totalRows - (rY + rSpan) : rY;
    const screenUStart = isCatFacing
      ? layout.totalUnits - (spec.uStart + spec.uWidth)
      : spec.uStart;
    const x = -innerW / 2 + (screenUStart + spec.uWidth * 0.5) * (innerW / layout.totalUnits);
    const y = -innerH / 2 + (screenRowTop + rSpan * 0.5) * (innerH / layout.totalRows);
    this.lightEngine.spawnRipple(x, y);
  }

  /** Drink prop sitting beside the deck; the cat reaches over when it sips. */
  private drawProp(ctx: CanvasRenderingContext2D): void {
    if (!this.propConfig.enabled) return;
    const anchor = this.getPropAnchor();
    const drinker = this.drinker;
    const pose = this.propPose;

    ctx.save();
    if (pose.active) {
      ctx.translate(pose.x, pose.y);
      ctx.rotate(pose.rot);
    } else {
      ctx.translate(anchor.x, anchor.y);
    }
    drawProp(ctx, {
      kind: this.propConfig.kind,
      level: drinker.level,
      tilt: 0, // propPose already owns rotation; a second tilt breaks mouth/hand contacts.
      side: anchor.side,
      fizz: this.propFizz,
      time: this.elapsed,
    });

    // "Refill" hint when the cup runs dry (only while it sits on the desk)
    if (drinker.level <= 0.02 && !pose.active) {
      ctx.font = '700 7.5px "Segoe UI", "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255, 214, 120, 0.92)';
      ctx.fillText('点我续杯', 0, -propLookHeight(this.propConfig.kind) - 7);
    }
    ctx.restore();
  }

  /** Hit-tests the prop in logical canvas coordinates; true when the click lands on it. */
  public hitTestProp(x: number, y: number): boolean {
    if (!this.propConfig.enabled) return false;
    const a = this.getPropAnchor();
    const look = propLook(this.propConfig.kind);
    const halfW = look.width * 0.75;
    const dx = x - a.x;
    const dy = y - (a.y - look.height * 0.5);
    return Math.abs(dx) <= halfW && Math.abs(dy) <= look.height * 0.8;
  }

  /** Clicking the prop refills an empty cup, otherwise nudges a sip. */
  public clickProp(): 'refilled' | 'sipped' | 'ignored' {
    if (!this.propConfig.enabled || this.privacyMode || this.sleepReaction.visible(this.elapsed)) return 'ignored';
    if (this.drinker.level <= 0.02) {
      this.refillProp();
      this.spawnDrinkParticles(this.propConfig.kind, 10);
      this.wakeRendering();
      return 'refilled';
    }
    if (this.triggerSip()) {
      // Immediate feedback on click; the rest of the burst lands when the sip completes.
      this.spawnDrinkParticles(this.propConfig.kind, 8);
      this.wakeRendering();
      return 'sipped';
    }
    return 'ignored';
  }

  /** True while the drink mood is still playing, so the face can react. */
  public get propMood(): PropKind | null {
    return this.drinker.moodActive ? this.drinker.lastMood : null;
  }

  /** Bursts the drink-specific effect when the pet takes a sip. */
  private spawnDrinkParticles(kind: PropKind, count: number): void {
    const anchor = this.getPropAnchor();
    const look = propLook(kind);
    // Emit where the cup actually is right now: at the mouth while it is held,
    // otherwise from the cup sitting on the desk.
    const px = this.propPose.active ? this.propPose.x : anchor.x;
    const py = this.propPose.active ? this.propPose.y - look.height : anchor.y - 16;
    const cfg: Record<PropKind, { shape: ParticleShape; colors: string[]; rise: number; spread: number }> = {
      cola: { shape: 'bubble', colors: ['#ffffff', '#ffe9c7', '#ffb3a0'], rise: -34, spread: 12 },
      coffee: { shape: 'steam', colors: ['#f2f4f8', '#dfe4ea', '#cfd6df'], rise: -48, spread: 10 },
      boba: { shape: 'pearl', colors: ['#3b2418', '#5a3a26', '#c9a887'], rise: -22, spread: 14 },
      energy: { shape: 'spark', colors: ['#c9ff4d', '#00e5ff', '#ffffff'], rise: -46, spread: 16 },
      pudding: { shape: 'heart', colors: ['#ff6b9d', '#ff9ec4', '#ffd166'], rise: -42, spread: 12 },
    };
    const spec = cfg[kind];
    for (let i = 0; i < count; i++) {
      const life = 0.9 + Math.random() * 1.1;
      this.particles.push({
        shape: spec.shape,
        x: px + (Math.random() - 0.5) * 14,
        y: py - Math.random() * 12,
        vx: (Math.random() - 0.5) * spec.spread * 2,
        vy: spec.rise * (0.5 + Math.random() * 0.8),
        life,
        maxLife: life,
        size: spec.shape === 'steam' ? 5 + Math.random() * 5 : 1.6 + Math.random() * 2.6,
        color: spec.colors[Math.floor(Math.random() * spec.colors.length)],
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 2.4,
      });
    }
    if (this.particles.length > 160) this.particles.splice(0, this.particles.length - 160);
  }

  private updateParticles(dt: number): void {
    if (this.particles.length === 0) return;
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += dt * (p.shape === 'pearl' ? -6 : p.shape === 'steam' ? -10 : 18);
      p.rotation += p.spin * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    if (this.particles.length === 0) return;
    ctx.save();
    for (const p of this.particles) {
      const t = Math.max(0, Math.min(1, p.life / p.maxLife));
      const alpha = p.shape === 'steam' ? t * 0.42 : Math.min(1, t * 1.5);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = alpha;
      switch (p.shape) {
        case 'steam': {
          const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
          grad.addColorStop(0, 'rgba(255,255,255,0.55)');
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'bubble':
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.30)';
          ctx.fill();
          break;
        case 'spark': {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(-p.size, 0);
          ctx.lineTo(p.size, 0);
          ctx.moveTo(0, -p.size);
          ctx.lineTo(0, p.size);
          ctx.stroke();
          break;
        }
        case 'heart': {
          ctx.rotate(p.rotation);
          ctx.fillStyle = p.color;
          const s = p.size;
          ctx.beginPath();
          ctx.moveTo(0, s * 0.7);
          ctx.bezierCurveTo(-s * 1.6, -s * 0.5, -s * 0.5, -s * 1.6, 0, -s * 0.5);
          ctx.bezierCurveTo(s * 0.5, -s * 1.6, s * 1.6, -s * 0.5, 0, s * 0.7);
          ctx.fill();
          break;
        }
        case 'pearl':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        default:
          break;
      }
      ctx.restore();
    }
    ctx.restore();
  }

  /** Positions the cup for the current drink phase (reach / lift / sip / return). */
  /** Shoulder the drinking arm pivots from (same side as the cup). */
  private getDrinkShoulder(side: 'left' | 'right'): Vec2 {
    const dir = side === 'right' ? 1 : -1;
    return { x: this.catCenterX + dir * 32, y: this.catBaseY - 76 };
  }

  /**
   * World-space mouth position. Mirrors the head transform inside drawCatBody
   * (spine lean + head tilt + purr shake), so held drinks track the face when the
   * cat leans sideways to work the mouse.
   */
  private getMouthPoint(): Vec2 {
    const breath = Math.sin(this.elapsed * 2.1) * 1.0;
    const purrShift =
      this.squintAmount > 0.4 ? Math.sin(this.elapsed * 22) * 0.45 * this.squintAmount : 0;
    const head = this.spinePoint(0.24, breath);
    const hcx = head.x + purrShift;
    const hcy = head.y;
    // Mouth sits a little below the head centre in head-local space (whisker line).
    const ly = 20;
    const c = Math.cos(this.headTilt);
    const s = Math.sin(this.headTilt);
    return { x: hcx - ly * s, y: hcy + ly * c };
  }

  private updatePropPose(dt: number): void {
    const a = this.getPropAnchor();
    const dir = a.side === 'right' ? 1 : -1;
    const look = propLook(this.propConfig.kind);
    const cupH = look.height;
    const isEat = this.propConfig.kind === 'pudding';
    const shoulder = this.getDrinkShoulder(a.side);
    const ph = this.drinker.phase;
    const p = this.drinker.phaseProgress;
    const ease = (t: number) => t * t * (3 - 2 * t);

    // Where the CUP LIP should touch the face — tracked live so it follows the lean.
    // The whale girl has her own rig, so ask her renderer where her mouth is.
    const mouth =
      this.catBreed === 'naiwa'
        ? this.naiwa.getMouthWorld(this.buildNaiwaLayout())
        : this.catBreed === 'dafeiyu'
          ? this.dafeiyu.getMouthWorld(performance.now(), this.buildDaFeiYuLayout())
          : this.getMouthPoint();
    const straw = this.propConfig.kind === 'boba';
    const lipX = mouth.x + dir * (straw || this.catBreed === 'naiwa' ? 2 : 10);
    const lipY = mouth.y + 2;
    const contact = propMouthContact(this.propConfig.kind);
    const tiltMax = isEat ? 0.34 : straw ? 0.12 : 0.62;
    // Rotation for a given lift factor (negative when the cup leans in toward the cat).
    const tiltAt = (t: number) => -dir * tiltMax * t;
    // Origin that puts the rotated lip exactly on (lipX, lipY).
    const originFor = (rot: number) => ({
      x: lipX - (Math.cos(rot) * contact.x - Math.sin(rot) * contact.y),
      y: lipY - (Math.sin(rot) * contact.x + Math.cos(rot) * contact.y),
    });

    let x = a.x;
    let y = a.y;
    let rot = 0;
    if (ph === 'lift') {
      const t = ease(p);
      rot = tiltAt(t);
      const o = originFor(rot);
      x = a.x + (o.x - a.x) * t;
      y = a.y + (o.y - a.y) * t;
      // Bulge outward mid-flight so the cup arcs instead of sliding in a straight line.
      x += Math.sin(Math.PI * t) * 7 * dir;
    } else if (ph === 'sip') {
      // Small wobble around the resting tilt; origin is recomputed so the lip stays on the mouth.
      rot = tiltAt(1) + Math.sin(p * Math.PI * 2) * (isEat ? 0.05 : 0.07);
      const o = originFor(rot);
      x = o.x;
      y = o.y + Math.sin(p * Math.PI * 2) * 0.6;
      if (isEat) {
        // Pudding is nibbled in quick little bites instead of one steady tilt.
        const bite = Math.abs(Math.sin(p * Math.PI * 6));
        y += bite * 1.8;
        x += dir * bite * 0.8;
      }
    } else if (ph === 'return') {
      const t = ease(1 - p);
      rot = tiltAt(t);
      const o = originFor(rot);
      x = a.x + (o.x - a.x) * t;
      y = a.y + (o.y - a.y) * t;
      x += Math.sin(Math.PI * t) * 6 * dir;
    }

    // Hand grips the cup body a little below the lip, and follows the rotation.
    const gripLocalY = -cupH * 0.45;
    const gripX = x - Math.sin(rot) * gripLocalY;
    const gripY = y + Math.cos(rot) * gripLocalY;
    const active = ph !== 'rest';

    // Smooth reaching/releasing, but keep a closed grip pinned to the moving cup.
    let targetX = gripX;
    let targetY = gripY;
    if (ph === 'return' && p > 0.55) {
      // Release the cup, then pull the paw back to the shoulder.
      const t = (p - 0.55) / 0.45;
      targetX = gripX + (shoulder.x - gripX) * t;
      targetY = gripY + (shoulder.y - gripY) * t;
    }
    if (!active) {
      this.propHand.x = shoulder.x;
      this.propHand.y = shoulder.y;
    } else if (ph === 'lift' || ph === 'sip' || (ph === 'return' && p <= 0.55)) {
      this.propHand.x = gripX;
      this.propHand.y = gripY;
    } else {
      const k = 1 - Math.exp(-36 * dt);
      this.propHand.x += (targetX - this.propHand.x) * k;
      this.propHand.y += (targetY - this.propHand.y) * k;
    }
    const handX = this.propHand.x;
    const handY = this.propHand.y;

    const rise = Math.abs(y - a.y);
    const fullRise = Math.abs(originFor(tiltAt(1)).y - a.y) || 1;
    this.propPose = {
      x,
      y,
      rot,
      active,
      handX,
      handY,
      lift: active ? Math.min(1, rise / fullRise) : 0,
    };

    // Arm fades in the moment the reach starts, and out after the cup is placed back.
    const wantArm = active ? 1 : 0;
    this.propArmAlpha += (wantArm - this.propArmAlpha) * (1 - Math.exp(-18 * dt));
  }

  /** Arm + paw reaching out to hold the cup while the pet drinks. */
  private drawDrinkArm(ctx: CanvasRenderingContext2D): void {
    if (!this.propPose.active || this.propArmAlpha < 0.02) return;
    // The whale girl has her own limb rig; skip the cat arm for her.
    if (this.catBreed === 'dafeiyu') return;
    const a = this.getPropAnchor();
    const shoulder = this.getDrinkShoulder(a.side);

    ctx.save();
    ctx.globalAlpha = Math.min(1, this.propArmAlpha);
    this.drawPlumpCatArm(
      ctx,
      a.side,
      shoulder.x,
      shoulder.y,
      this.propPose.handX,
      this.propPose.handY,
      0.06,
      false,
    );
    ctx.restore();
  }

  /** Reaction bubble that pops above the head once the drink is down. */
  private showDrinkFeedback(kind: PropKind): void {
    const table: Record<PropKind, Array<{ emoji: string; text: string }>> = {
      cola: [
        { emoji: '🥤', text: '嗝～' },
        { emoji: '🥤', text: '气真足' },
        { emoji: '🥤', text: '爽！' },
      ],
      coffee: [
        { emoji: '☕', text: '提神！' },
        { emoji: '☕', text: '精神了' },
        { emoji: '☕', text: '唔…香' },
      ],
      boba: [
        { emoji: '🧋', text: '好喝～' },
        { emoji: '🧋', text: '还想喝' },
        { emoji: '🧋', text: '甜甜的' },
      ],
      energy: [
        { emoji: '⚡', text: '满电！' },
        { emoji: '⚡', text: '燃烧吧' },
        { emoji: '⚡', text: '起飞！' },
      ],
      pudding: [
        { emoji: '🍮', text: '甜甜的' },
        { emoji: '🍮', text: '再来一口' },
        { emoji: '🍮', text: '软乎乎' },
      ],
    };
    const list = table[kind] ?? table.coffee;
    const pick = list[Math.floor(Math.random() * list.length)];
    const max = 1.9;
    this.drinkFeedback = { emoji: pick.emoji, text: pick.text, t: max, max };
  }

  /** Picks one of several post-drink reactions so repeated sips never look identical. */
  private startReaction(kind: PropKind): void {
    const pools: Record<PropKind, ReactionKind[]> = {
      // Weighted pools: repeated entries raise that reaction's odds.
      cola: ['burp', 'burp', 'satisfied', 'shake'],
      coffee: ['happy', 'happy', 'satisfied', 'shake'],
      boba: ['satisfied', 'satisfied', 'lick', 'happy'],
      energy: ['happy', 'happy', 'shake', 'satisfied'],
      pudding: ['lick', 'lick', 'satisfied', 'happy'],
    };
    const pool = pools[kind] ?? ['satisfied'];
    const pick = pool[Math.floor(Math.random() * pool.length)];
    this.reaction = { kind: pick, t: 2.2, max: 2.2 };
    if (pick === 'burp') {
      this.burpKick = 1;
      this.spawnMouthBubbles();
    }
  }

  private drawDrinkFeedback(ctx: CanvasRenderingContext2D): void {
    const f = this.drinkFeedback;
    if (!f || this.privacyMode || this.sleepReaction.active(this.elapsed) || this.elapsed < this.soothedUntil) return;
    const prog = 1 - f.t / f.max;
    const alpha = f.t < 0.45 ? f.t / 0.45 : Math.min(1, prog / 0.12);
    const rise = Math.min(14, prog * 26);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    drawPetCaption(ctx, `${f.emoji} ${f.text}`, this.catCenterX, Math.max(22, this.catTopY - 18 - rise), 16);
    ctx.restore();
  }

  /** Few small bubbles escaping the mouth after a fizzy drink. */
  private spawnMouthBubbles(): void {
    const a = this.getPropAnchor();
    const dir = a.side === 'right' ? 1 : -1;
    const mx = this.catCenterX + dir * 10;
    const my = this.catTopY + 100;
    for (let i = 0; i < 7; i++) {
      const life = 0.8 + Math.random() * 0.8;
      this.particles.push({
        shape: 'bubble',
        x: mx + (Math.random() - 0.5) * 10,
        y: my + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 20,
        vy: -16 - Math.random() * 18,
        life,
        maxLife: life,
        size: 1.4 + Math.random() * 2.2,
        color: 'rgba(255,255,255,0.9)',
        rotation: 0,
        spin: 0,
      });
    }
  }

  private resetWakeReaction(): void {
    this.sleepReaction.reset();
    this.groundTail = { amount: 0, lift: 0, impact: false, settled: false };
    this.groundImpactAt = this.soothedUntil = -100;
    this.annoyance = this.dizzy = 0; this.angerSteam.length = 0;
    this.typingReactions.reset(); this.typingPose = neutralReaction();
    this.petEnergy = 0; this.resetPetStrokes();
  }

  private beginSleepReaction(): void {
    if (!this.sleepReaction.start(this.elapsed)) return;
    this.typingReactions.reset(); this.catTail.active = false;
    this.catTail.heldVks.clear(); this.catTailHeldAt.clear();
    this.annoyance = 0.88; this.dizzy = 0;
    this.petEnergy = 0; this.soothedUntil = -100;
    this.wakeRendering();
  }

  private disturbSleep(): void {
    if (!this.privacyMode && this.idleAction?.kind === 'nap') this.beginSleepReaction();
  }

  private calmSleepReaction(): void {
    if (!this.sleepReaction.calm(this.elapsed)) return;
    this.annoyance = this.dizzy = 0;
    this.angerSteam.length = 0; this.typingReactions.reset();
    this.soothedUntil = this.elapsed + 1.5;
    this.spawnHeartParticle(false); this.wakeRendering();
  }

  /** Any real input (typing / mouse) ends the current idle action immediately. */
  private interruptIdleAction(): void {
    if (!this.idleAction) return;
    this.endIdleAction();
    this.nextIdleActionAt = this.elapsed + this.idleDelaySec + Math.random() * (this.idleDelaySec + 18);
  }

  /** Drops the action, releases any posed paw and parks the tail again. */
  private endIdleAction(): void {
    this.idleAction = null;
    this.idlePaw = null;
    for (const paw of [this.leftPaw, this.rightPaw]) {
      if (paw.mode === 'pose') paw.mode = 'idle';
    }
    if (this.catTail.active) this.catTail.active = false;
    this.wakeRendering();
  }

  /** Points a paw at an arbitrary spot without the key-press semantics of 'poke'. */
  private posePaw(side: 'left' | 'right', x: number, y: number): void {
    const paw = side === 'right' ? this.rightPaw : this.leftPaw;
    if (paw.mode === 'mouse') return; // never yank the paw off the mouse
    paw.mode = 'pose';
    paw.target = { x, y };
    this.idlePaw = { side, x, y };
  }

  /** Runs / advances the idle behaviours (stretch, groom, nap, cuddle, drink). */
  private updateIdleAction(dt: number, now: number): void {
    const idleSec = (now - Math.max(this.lastAnyKeyAt, this.lastMouseMoveAt)) / 1000;
    let leanTarget = 0;
    let hunchTarget = 0;
    let headTiltTarget = 0;
    let squintTarget = 0;
    this.idlePaw = null;
    this.fishTarget = {
      lean: 0,
      lift: 0,
      leftX: 0,
      leftY: 0,
      leftOn: false,
      rightX: 0,
      rightY: 0,
      rightOn: false,
    };

    if (this.idleAction) {
      const previousT = this.idleAction.t / this.idleAction.duration;
      this.idleAction.t += dt;
      const t = Math.min(1, this.idleAction.t / this.idleAction.duration);
      // Envelope so every pose eases in and out instead of popping.
      const envelope = Math.max(0, Math.min(1, Math.min(t / 0.16, (1 - t) / 0.16)));

      if (this.catBreed === 'dafeiyu') {
        this.updateFishPose(t, envelope);
      } else if (this.catBreed === 'naiwa') {
        // Independent frog channels: never drive invisible cat ears, paws or tail.
        const kind = this.idleAction.kind;
        if (kind === 'nap') squintTarget = envelope;
        // Keep the landing ripple, without a synthesized voice or impact sound.
        if (!this.privacyMode && kind === 'frogHop' && previousT < .70 && t >= .70) {
          this.groundImpactAt = this.elapsed;
        }
      } else {
        switch (this.idleAction.kind) {
        case 'stretch': {
          // Both front paws reach up and out to the sides, like a big yawn-stretch.
          const s = Math.sin(t * Math.PI);
          hunchTarget = -0.12 * s; // head tips back a touch
          squintTarget = 0.55 * s;
          this.posePaw('left', this.catCenterX - 92, this.catTopY + 84 - 10 * s);
          this.posePaw('right', this.catCenterX + 92, this.catTopY + 84 - 10 * s);
          break;
        }
        case 'wave': {
          // Raise one paw beside the head and wave it side to side.
          const waveSign = 1;
          const wobble = Math.sin(this.elapsed * 9) * 8 * envelope;
          this.posePaw('right', this.catCenterX + 54 + wobble, this.catTopY + 74);
          headTiltTarget = waveSign * 0.12 * envelope;
          leanTarget = waveSign * 0.08 * envelope;
          squintTarget = 0.3 * envelope;
          if (Math.random() < dt * 1.8) this.earTwitchRight = 1;
          break;
        }
        case 'groom': {
          // A paw wipes the muzzle in a small circle, head tips toward it.
          const side: 'left' | 'right' = Math.floor(t * 2) % 2 === 0 ? 'right' : 'left';
          const sign = side === 'right' ? 1 : -1;
          const mouth = this.getMouthPoint();
          const ang = this.elapsed * 7;
          this.posePaw(
            side,
            mouth.x + sign * 10 + Math.cos(ang) * 4.5,
            mouth.y + 5 + Math.sin(ang) * 4.5,
          );
          headTiltTarget = sign * 0.13 * envelope;
          squintTarget = 0.6 * envelope;
          if (Math.random() < dt * 2.2) {
            if (side === 'left') this.earTwitchLeft = 1;
            else this.earTwitchRight = 1;
          }
          break;
        }
        case 'tilt': {
          headTiltTarget = 0.20 * envelope;
          leanTarget = -0.06 * envelope;
          break;
        }
        case 'slowBlink': {
          // A relaxed greeting: eyes close slowly, pause, then open again.
          squintTarget = Math.sin(t * Math.PI) ** 2;
          headTiltTarget = -0.06 * envelope;
          break;
        }
        case 'nap': {
          // Sitting loaf: head down, eyes shut, slow breathing, Zzz.
          hunchTarget = 0.9 * envelope;
          headTiltTarget = 0.1 * envelope;
          squintTarget = 1;
          break;
        }
        case 'cuddle': {
          // Leans over, lifts one paw and swishes the tail — "摸鱼撒娇".
          const sway = Math.sin(t * Math.PI);
          const dir = this.cuddleSide === 'left' ? -1 : 1;
          leanTarget = dir * 0.5 * sway;
          headTiltTarget = -dir * 0.2 * sway;
          squintTarget = 0.7 * envelope;
          this.posePaw(
            dir === 1 ? 'left' : 'right',
            this.catCenterX - dir * 20,
            this.catBaseY - 96,
          );
          this.catTail.active = true;
          this.catTail.targetX = this.catCenterX + dir * (118 + Math.sin(this.elapsed * 6) * 26);
          this.catTail.targetY = this.kbCenterY - 22;
          if (Math.random() < dt * 2.2) this.spawnHeartParticle(false);
          break;
        }
        default:
            break;
        }
      }

      if (this.idleAction.t >= this.idleAction.duration) {
        this.endIdleAction();
        this.nextIdleActionAt = this.elapsed + this.idleDelaySec + Math.random() * (this.idleDelaySec + 18);
      }
      this.wakeRendering(now);
    } else if (this.idleAutoEnabled && idleSec > this.idleDelaySec && this.elapsed >= this.nextIdleActionAt) {
      this.pickIdleAction();
      this.nextIdleActionAt = this.elapsed + this.idleDelaySec + Math.random() * (this.idleDelaySec + 18);
    }

    const k = 1 - Math.exp(-8 * dt);
    this.idlePose.lean += (leanTarget - this.idlePose.lean) * k;
    this.idlePose.hunch += (hunchTarget - this.idlePose.hunch) * k;
    this.idlePose.headTilt += (headTiltTarget - this.idlePose.headTilt) * k;
    this.idlePose.squint += (squintTarget - this.idlePose.squint) * (1 - Math.exp(-6 * dt));

    // Whale-girl pose channels.
    const fk = 1 - Math.exp(-9 * dt);
    this.fishPose.lean += (this.fishTarget.lean - this.fishPose.lean) * fk;
    this.fishPose.lift += (this.fishTarget.lift - this.fishPose.lift) * fk;
    const hk = 1 - Math.exp(-16 * dt);
    this.fishPose.leftOn = this.fishTarget.leftOn;
    if (this.fishPose.leftOn) {
      this.fishPose.leftX += (this.fishTarget.leftX - this.fishPose.leftX) * hk;
      this.fishPose.leftY += (this.fishTarget.leftY - this.fishPose.leftY) * hk;
    }
    this.fishPose.rightOn = this.fishTarget.rightOn;
    if (this.fishPose.rightOn) {
      this.fishPose.rightX += (this.fishTarget.rightX - this.fishPose.rightX) * hk;
      this.fishPose.rightY += (this.fishTarget.rightY - this.fishPose.rightY) * hk;
    }
  }

  /** Wave / stretch poses for the whale girl, expressed in her layout channels. */
  private updateFishPose(t: number, envelope: number): void {
    const layout = this.buildDaFeiYuLayout();
    const mouth = this.dafeiyu.getMouthWorld(performance.now(), layout);
    if (this.idleAction?.kind === 'wave') {
      this.fishTarget.lean = 0.12 * Math.sin(t * Math.PI);
      this.fishTarget.rightOn = true;
      this.fishTarget.rightX = mouth.x + 44 + Math.sin(this.elapsed * 8) * 7 * envelope;
      this.fishTarget.rightY = mouth.y - 30;
    } else if (this.idleAction?.kind === 'stretch') {
      const s = Math.sin(t * Math.PI);
      this.fishTarget.lean = 0;
      this.fishTarget.lift = s;
      // Both arms reach up and out, like the cat's stretch.
      this.fishTarget.leftOn = true;
      this.fishTarget.leftX = mouth.x - 62;
      this.fishTarget.leftY = mouth.y - 16 - 66 * s;
      this.fishTarget.rightOn = true;
      this.fishTarget.rightX = mouth.x + 62;
      this.fishTarget.rightY = mouth.y - 16 - 66 * s;
    }
  }

  private pickIdleAction(): void {
    if (this.catBreed === 'dafeiyu') {
      const fishPool: IdleActionKind[] = ['wave', 'stretch'];
      if (this.propConfig.enabled && this.drinker.level > 0.05) fishPool.push('drink');
      const fishKind = fishPool[Math.floor(Math.random() * fishPool.length)];
      if (fishKind === 'drink') this.triggerSip();
      else this.triggerIdleAction(fishKind);
      return;
    }
    const pool: IdleActionKind[] = ['cuddle', 'stretch', 'groom', 'wave', 'tilt', 'slowBlink', 'nap', 'nap'];
    if (this.catBreed === 'naiwa') pool.push(...FROG_ACTIONS);
    if (this.propConfig.enabled && this.drinker.level > 0.05) pool.push('drink');
    const kind = pool[Math.floor(Math.random() * pool.length)];
    if (kind === 'drink') {
      if (!this.triggerSip()) this.triggerIdleAction('nap');
    } else {
      this.triggerIdleAction(kind);
    }
  }

  /** Heart puff for the "roll over" idle behaviour. */
  private spawnHeartParticle(big: boolean): void {
    const count = big ? 7 : 1;
    for (let i = 0; i < count; i++) {
      const life = 1.0 + Math.random() * 0.9;
      this.particles.push({
        shape: 'heart',
        x: this.catCenterX + (Math.random() - 0.5) * 60,
        y: this.catTopY + 30 + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 22,
        vy: -16 - Math.random() * 18,
        life,
        maxLife: life,
        size: 3 + Math.random() * 3,
        color: ['#ff6b9d', '#ff9ec4', '#ffd166'][Math.floor(Math.random() * 3)],
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 2,
      });
    }
    if (this.particles.length > 160) this.particles.splice(0, this.particles.length - 160);
  }

  /** Drifting "Z z z" above the head while asleep. */
  private drawSleepZzz(ctx: CanvasRenderingContext2D): void {
    if (this.idleAction?.kind !== 'nap') return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const frogMouth = this.catBreed === 'naiwa' ? this.naiwa.getMouthWorld(this.buildNaiwaLayout()) : null;
    const baseX = frogMouth ? frogMouth.x + 24 : this.catCenterX + 26;
    const baseY = frogMouth ? frogMouth.y - 34 : this.catTopY + 26;
    for (let i = 0; i < 3; i++) {
      const phase = (this.elapsed * 0.55 + i * 0.33) % 1;
      const alpha = Math.sin(phase * Math.PI) * 0.85;
      const size = 13 + i * 3;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = `700 ${size}px "Segoe UI", system-ui, sans-serif`;
      ctx.strokeStyle = '#282431'; ctx.lineWidth = 3;
      ctx.strokeText('z', baseX + i * 6 + phase * 8, baseY - phase * 26);
      ctx.fillStyle = '#fff8e5';
      ctx.fillText('z', baseX + i * 6 + phase * 8, baseY - phase * 26);
    }
    ctx.restore();
  }


  /**
   * Grumpiness is one of the sustained-typing reactions. Cool down between moods
   * so steam and angry lids cannot mask the next focused or cheerful expression.
   */
  private updateAnnoyance(dt: number, now: number, typingEnergy: number): void {
    const typingHot =
      this.typingReactions.kind === 'grumpy' && this.moodTrackingEnabled &&
      !this.privacyMode && typingEnergy >= 3 / 7 && now - this.lastAnyKeyAt < 350;
    if (typingHot) {
      // Rises over roughly 4-5 seconds of relentless typing, so the reaction is
      // visible within a normal burst instead of only after a long grind.
      this.annoyance = Math.min(1, this.annoyance + dt * 0.32);
    } else {
      this.annoyance = Math.max(0, this.annoyance - dt * 0.48);
    }

    if (this.sleepReaction.active(this.elapsed)) this.annoyance = 0.88;

    // Once it boils over, the pet goes dizzy for a while.
    const wantDizzy = this.annoyance >= 1 ? 1 : 0;
    if (wantDizzy) {
      this.dizzy = Math.min(1, this.dizzy + dt * 0.9);
      this.annoyance = Math.max(0.85, this.annoyance - dt * 0.06);
    } else {
      this.dizzy = Math.max(0, this.dizzy - dt * 0.5);
    }

    // Steam puffs while annoyed (denser the angrier it gets).
    if (this.annoyance > 0.35 && this.dizzy < 0.5 && now >= this.nextSteamAt) {
      this.nextSteamAt = now + 260 - this.annoyance * 150;
      const count = this.annoyance > 0.75 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const life = 0.9 + Math.random() * 0.7;
        this.angerSteam.push({
          x: this.catCenterX + (Math.random() - 0.5) * 26,
          y: this.catTopY + 34 + (Math.random() - 0.5) * 8,
          vy: -14 - Math.random() * 12,
          life,
          max: life,
          r: 4 + Math.random() * 4 * this.annoyance,
        });
      }
      if (this.angerSteam.length > 40) {
        this.angerSteam.splice(0, this.angerSteam.length - 40);
      }
    }
    for (const s of this.angerSteam) {
      s.life -= dt;
      s.y += s.vy * dt;
      s.x += Math.sin(this.elapsed * 3 + s.y * 0.1) * 8 * dt;
      s.r += dt * 5;
    }
    this.angerSteam = this.angerSteam.filter((s) => s.life > 0);
  }

  /** Steam puffs + anger marks + dizzy spiral, drawn above the cat. */
  private drawAngerAndDizzy(ctx: CanvasRenderingContext2D): void {
    const headX = this.getMouthPoint().x;
    const headY = this.catTopY + 10;
    if (this.typingPose.mark && this.typingPose.amount > 0.02 && !this.privacyMode) {
      ctx.save();
      for (let i = 0; i < 2; i++) {
        const phase = (this.elapsed * 0.85 + i * 0.5) % 1;
        ctx.globalAlpha = Math.sin(phase * Math.PI) * this.typingPose.amount * 0.8;
        drawReactionMark(ctx, this.typingPose.mark, headX + (i ? 1 : -1) * (43 + phase * 9),
          headY - phase * 34, 24 + i * 3);
      }
      ctx.restore();
    }
    // Steam rises from the ears; the dizzy spiral floats higher so they never overlap.
    const steamY = this.catTopY + 30;

    // 1) Steam
    if (this.angerSteam.length > 0) {
      ctx.save();
      for (const s of this.angerSteam) {
        const t = Math.max(0, s.life / s.max);
        ctx.globalAlpha = t * 0.72 * (0.45 + this.annoyance * 0.55);
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        g.addColorStop(0, 'rgba(150, 156, 166, 1)');
        g.addColorStop(0.55, 'rgba(132, 138, 148, 0.55)');
        g.addColorStop(1, 'rgba(132, 138, 148, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 2) Anger cross (💢) once it is really annoyed — bigger, bolder, with a dark
    //    halo pass so it stays legible against both the black cat and light walls.
    if (this.annoyance > 0.42 && this.dizzy < 0.4) {
      const grow = Math.min(1, (this.annoyance - 0.42) / 0.5);
      const pulse = 0.82 + Math.sin(this.elapsed * 9) * 0.18;
      const alpha = Math.min(1, (this.annoyance - 0.42) / 0.3) * pulse;
      const bx = headX + 31;
      const by = headY + 12;
      const arm = 6.0 + grow * 5.0;
      const gap = 3.0 + grow * 1.2;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';
      for (const pass of [
        { color: 'rgba(16, 18, 24, 0.72)', width: 5.4 + grow * 2.4 },
        { color: '#e8404f', width: 2.6 + grow * 1.8 },
      ]) {
        ctx.strokeStyle = pass.color;
        ctx.lineWidth = pass.width;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(bx + Math.cos(a) * gap, by + Math.sin(a) * gap);
          ctx.lineTo(bx + Math.cos(a) * (gap + arm), by + Math.sin(a) * (gap + arm));
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 3) Dizzy spiral over the head
    if (this.dizzy > 0.06) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.dizzy);
      ctx.translate(headX, steamY - 26);
      ctx.lineCap = 'round';
      // Two passes (dark halo, then amber) so it reads on dark and light.
      for (const pass of [
        { color: 'rgba(20, 24, 32, 0.6)', width: 4.6 },
        { color: '#ffd166', width: 2.0 },
      ]) {
        ctx.strokeStyle = pass.color;
        ctx.lineWidth = pass.width;
        for (const dir of [1, -1]) {
          ctx.beginPath();
          const spin = this.elapsed * 3.4 * dir;
          for (let i = 0; i <= 46; i++) {
            const tt = i / 46;
            const ang = spin + tt * Math.PI * 2.4;
            const rad = tt * 21;
            const x = Math.cos(ang) * rad * (dir > 0 ? 1 : -1);
            const y = Math.sin(ang) * rad * 0.5;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      // Little stars orbiting the spiral.
      for (let i = 0; i < 3; i++) {
        const a = this.elapsed * 2.6 + (i * Math.PI * 2) / 3;
        const sx = Math.cos(a) * 25;
        const sy = Math.sin(a) * 12;
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private clampToKeyboardSurface(pt: Vec2): Vec2 {    // Transform into keyboard-local space and clamp so the plump paw pad NEVER extends past the keyboard bezel!
    const dx = pt.x - this.kbCenterX;
    const dy = pt.y - this.kbCenterY;
    const cos = Math.cos(-this.kbTiltRad);
    const sin = Math.sin(-this.kbTiltRad);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;

    const maxX = this.kbWidth * 0.5 - 15;
    const minY = -this.kbHeight * 0.5 + 8;
    const maxY = this.kbHeight * 0.5 - 14;
    const cx = Math.max(-maxX, Math.min(maxX, lx));
    const cy = Math.max(minY, Math.min(maxY, ly));

    const rcos = Math.cos(this.kbTiltRad);
    const rsin = Math.sin(this.kbTiltRad);
    return {
      x: this.kbCenterX + cx * rcos - cy * rsin,
      y: this.kbCenterY + cx * rsin + cy * rcos,
    };
  }

  private spawnBubble(label: string, isSpace: boolean, keyX: number, now: number): void {
    if (this.bubbles.length >= 6) {
      this.bubbles.shift();
    }
    const minX = this.keyboardLayout === '108' ? 145 : 125;
    const maxX = this.logicalW - 105;
    const baseX = Math.max(minX, Math.min(maxX, keyX * 0.45 + this.kbCenterX * 0.55));
    const staggerY = 258 + ((this.nextBubbleId % 3) - 1) * 10 + (Math.random() - 0.5) * 6;
    this.bubbles.push({
      id: this.nextBubbleId++,
      label,
      isSpace,
      x: baseX,
      targetX: baseX,
      y: 292,
      targetY: staggerY,
      rot: ((Math.random() - 0.5) * 4.5 * Math.PI) / 180,
      createdAt: now,
      lifetime: 940,
    });
    this.layoutBubbles();
  }

  private layoutBubbles(): void {
    const count = this.bubbles.length;
    if (count === 0) return;

    const widths = this.bubbles.map((b) => (b.isSpace ? 40 : Math.max(25, b.label.length * 7.5 + 14)));
    const gap = 3.5;
    const totalW = widths.reduce((a, b) => a + b, 0) + gap * (count - 1);
    const anchor = this.kbCenterX + 12;
    const leftBound = this.keyboardLayout === '108' ? 140 : 126;
    const rightBound = this.logicalW - 82;
    let cursor = Math.max(leftBound, Math.min(rightBound - totalW, anchor - totalW * 0.5));

    for (let i = 0; i < count; i++) {
      const w = widths[i];
      this.bubbles[i].targetX = cursor + w * 0.5;
      cursor += w + gap;
    }
  }

  // ---- Simulation update ----

  private update(dt: number, now: number): void {
    this.elapsed += dt;
    this.lightEngine.advance(dt);
    this.groundTail = this.sleepReaction.sample(this.elapsed);
    if (this.groundTail.impact) {
      this.groundImpactAt = this.elapsed;
    }
    if (this.groundTail.settled) {
      this.annoyance = this.dizzy = 0; this.angerSteam.length = 0;
      this.typingReactions.reset();
    }
    if (this.groundTail.amount > 0) this.wakeRendering(now);

    // Prop drinking cycle: only runs while the user is away, so it never fights for attention.
    if (this.propConfig.enabled && !this.idleAction && !this.sleepReaction.visible(this.elapsed)) {
      const idleSec = (now - Math.max(this.lastAnyKeyAt, this.lastMouseMoveAt)) / 1000;
      const drank = this.drinker.update(dt, idleSec, this.propConfig);
      if (drank) {
        this.wakeRendering(now);
        if (this.propConfig.kind === 'cola') this.propFizz = 1;
        if (this.catBreed !== 'naiwa' && this.catBreed !== 'dafeiyu' && (this.propConfig.kind === 'boba' || this.propConfig.kind === 'pudding')) {
          this.petAudio?.setPurrIntensity(0.5);
        }
        this.spawnDrinkParticles(this.propConfig.kind, 18);
        this.showDrinkFeedback(this.propConfig.kind);
        this.startReaction(this.propConfig.kind);
        if (this.catBreed === 'dafeiyu') {
          this.dafeiyu.onDrinkFinished();
          // Her "happy" sprite is gated on petEnergy, so a finished drink lights her up.
          this.petEnergy = 1;
        }
      }
      if (this.propFizz > 0) this.propFizz = Math.max(0, this.propFizz - dt * 0.42);
      if (this.drinker.drinking) this.wakeRendering(now);
    }

    // Reach weight drives the little "lean toward the cup" pose.
    const wantReach =
      this.drinker.phase === 'reach' || this.drinker.phase === 'lift' || this.drinker.phase === 'sip'
        ? 1
        : this.drinker.phase === 'return'
          ? 1 - this.drinker.phaseProgress
          : 0;
    this.propReach += (wantReach - this.propReach) * (1 - Math.exp(-9 * dt));
    if (this.propReach > 0.01) this.wakeRendering(now);

    if (this.burpKick > 0) {
      this.burpKick = Math.max(0, this.burpKick - dt * 1.9);
      this.wakeRendering(now);
    }

    this.updatePropPose(dt);
    this.updateIdleAction(dt, now);

    if (this.drinkFeedback) {
      this.drinkFeedback.t -= dt;
      if (this.drinkFeedback.t <= 0) this.drinkFeedback = null;
      else this.wakeRendering(now);
    }

    this.updateParticles(dt);

    // Cross-platform lost-MouseUp safety fallback (Fixes #4 on macOS/Linux/web; Windows also reconciles via GetAsyncKeyState)
    const MOUSE_STUCK_FALLBACK_MS = 10_000;
    const lastMouseActivity = Math.max(this.lastMouseMoveAt, this.lastMouseClickAt);
    if (
      this.mouseLeftDown &&
      now - Math.max(lastMouseActivity, this.mouseDownAt.left) > MOUSE_STUCK_FALLBACK_MS
    ) {
      this.mouseLeftDown = false;
      this.mouseDownAt.left = 0;
    }
    if (
      this.mouseRightDown &&
      now - Math.max(lastMouseActivity, this.mouseDownAt.right) > MOUSE_STUCK_FALLBACK_MS
    ) {
      this.mouseRightDown = false;
      this.mouseDownAt.right = 0;
    }
    if (
      this.mouseMiddleDown &&
      now - Math.max(lastMouseActivity, this.mouseDownAt.middle) > MOUSE_STUCK_FALLBACK_MS
    ) {
      this.mouseMiddleDown = false;
      this.mouseDownAt.middle = 0;
    }

    // Cross-platform lost-KeyUp safety fallback (Fixes #3)
    const KEY_HOLD_STALE_MS = 15_000;
    for (const [vk, held] of this.heldKeys) {
      if (now - held.at > KEY_HOLD_STALE_MS) {
        this.heldKeys.delete(vk);
        const anim = this.keyAnims.get(held.specId);
        if (anim) anim.pressed = false;
      }
    }
    for (const [vk, heldAt] of this.catTailHeldAt) {
      if (now - heldAt > KEY_HOLD_STALE_MS) {
        this.catTailHeldAt.delete(vk);
        this.catTail.heldVks.delete(vk);
        if (this.catTail.heldVks.size === 0) {
          this.catTail.releaseAt = now;
        }
      }
    }

    if (this.petStrokeCount > 0 && now - this.lastPetMoveAt > 2200) {
      this.resetPetStrokes();
    }

    const mLerp = 1 - Math.exp(-28 * dt);
    this.mouseOffsetX += (this.mouseTargetOffsetX - this.mouseOffsetX) * mLerp;
    this.mouseOffsetY += (this.mouseTargetOffsetY - this.mouseOffsetY) * mLerp;
    if (!this.mouseLeftDown && this.mouseLeftPress > 0) {
      this.mouseLeftPress = Math.max(0, this.mouseLeftPress - dt * 5.8);
    }
    if (!this.mouseRightDown && this.mouseRightPress > 0) {
      this.mouseRightPress = Math.max(0, this.mouseRightPress - dt * 5.8);
    }
    if (!this.mouseMiddleDown && this.mouseMiddlePress > 0) {
      this.mouseMiddlePress = Math.max(0, this.mouseMiddlePress - dt * 5.8);
    }
    this.mouseScrollFlash = Math.max(0, this.mouseScrollFlash - dt * 4.5);
    this.mouseBadges = this.mouseBadges.filter((b) => now - b.createdAt < b.lifetime);

    while (this.recentKeyTimes.length > 0 && now - this.recentKeyTimes[0] > 950) {
      this.recentKeyTimes.shift();
    }
    const targetTypingEnergy = Math.min(1, this.recentKeyTimes.length / 7);
    this.typingEnergy += (targetTypingEnergy - this.typingEnergy) * (1 - Math.exp(-9 * dt));

    this.typingPose = this.typingReactions.update(dt, this.recentKeyTimes.length, now - this.lastAnyKeyAt < 350,
      this.moodTrackingEnabled && !this.privacyMode && !this.idleAction && !this.drinker.drinking && this.petEnergy < 0.3 && !this.sleepReaction.visible(this.elapsed));
    this.updateAnnoyance(dt, now, targetTypingEnergy);

    const isTypingRecently =
      now - this.lastAnyKeyAt < 650 ||
      this.heldKeys.size > 0 ||
      this.catTail.heldVks.size > 0;
    const targetHunch = Math.min(
      1,
      (isTypingRecently ? 0.45 + this.typingEnergy * 0.55 : 0) + this.idlePose.hunch + this.typingPose.pitch * 2 + this.typingPose.squash * 3,
    );
    this.typingHunch += (targetHunch - this.typingHunch) * (1 - Math.exp(-10 * dt));

    const rockAcc = -this.strikeRock * 140 - this.strikeRockVel * 14;
    this.strikeRockVel += rockAcc * dt;
    this.strikeRock = Math.max(-1, Math.min(1, this.strikeRock + this.strikeRockVel * dt));

    this.bodyBob = Math.max(0, this.bodyBob - dt * 11.5);
    this.kbBounce = Math.max(0, this.kbBounce - dt * 15);

    // Playful left-right body & head groove sway during pure typing (matches original video first half!)
    const pureTypingActive = isTypingRecently && this.mousePaw.mode !== 'mouse';
    if (pureTypingActive) {
      this.typingGroovePhase += dt * (4.8 + this.typingEnergy * 5.2);
    }
    const grooveWave = Math.sin(this.typingGroovePhase) * (0.58 + this.typingEnergy * 0.44);
    const targetTypingSway = pureTypingActive
      ? Math.max(-1.1, Math.min(1.1, grooveWave * 0.72 + this.lastKeyBias * 0.55))
      : this.mousePaw.mode === 'mouse' && isTypingRecently
        ? Math.sin(this.typingGroovePhase) * 0.16
        : 0;
    const swayAcc = (targetTypingSway - this.typingSway) * 118 - this.typingSwayVel * 12.5;
    this.typingSwayVel += swayAcc * dt;
    this.typingSway = Math.max(-1.2, Math.min(1.2, this.typingSway + this.typingSwayVel * dt));

    // Measured spine-shear lean: shifts head & chest cleanly forward-left toward mouse while hips stay anchored!
    let targetLean = 0;
    if (this.mousePaw.mode === 'mouse') {
      // Lean toward whichever side the mouse sits on (mirrored when the prop swaps sides).
      const leanSign = this.mousePawSide === 'right' ? 1 : -1;
      const mouseSweepBias = (this.mouseOffsetX / 18) * 0.22 * leanSign;
      targetLean = (this.freePaw.mode === 'poke' ? 0.52 : 0.96) * leanSign + mouseSweepBias;
    }
    // Leaning toward the drink while reaching for it.
    if (this.propReach > 0.01) {
      const dir = this.getPropAnchor().side === 'right' ? 1 : -1;
      targetLean += dir * 0.34 * this.propReach;
    }
    // Idle poses (cuddle sway) layer on top of the typing / mouse lean.
    targetLean += this.idlePose.lean + this.typingPose.lean * 3;
    this.spineLean += (targetLean - this.spineLean) * (1 - Math.exp(-10 * dt));

    const desiredHeadTilt =
      this.typingSway * 0.18 +
      this.typingHunch * (this.strikeRock * 0.065 - 0.02) +
      this.spineLean * 0.085 +
      this.idlePose.headTilt + this.typingPose.roll;
    this.headTilt += (desiredHeadTilt - this.headTilt) * (1 - Math.exp(-12 * dt));

    this.petEnergy = Math.max(0, this.petEnergy - dt * (this.cursorOverCat ? 0.22 : 1.15));
    this.lastDt = dt;
    // A satisfied drink leaves the cat squinting happily for a few seconds.
    const mood = moodForKind(this.propMood);
    const sipping = this.drinker.phase === 'sip';
    if (this.reaction) {
      this.reaction.t -= dt;
      if (this.reaction.t <= 0) this.reaction = null;
      else this.wakeRendering(now);
    }
    const rx = this.reaction?.kind;
    // Every drink gets its own face, and the random reaction layers on top.
    let moodSquint = 0;
    if (mood === 'content' || mood === 'bliss') moodSquint = 1;
    else if (mood === 'burp') moodSquint = 0.28;
    else moodSquint = 0;
    let reactionSquint = 0;
    if (rx === 'satisfied') reactionSquint = 1;
    else if (rx === 'lick') reactionSquint = 0.6;
    else if (rx === 'shake') reactionSquint = 0.15;
    else if (rx === 'happy') reactionSquint = 0.25;
    else if (rx === 'burp') reactionSquint = 0.3;
    const wantSquint = Math.max(
      this.petEnergy > 0.3
        ? 1
        : sipping || this.idleAction?.kind === 'nap'
          ? 1
          : Math.max(moodSquint, reactionSquint),
      this.idlePose.squint, this.typingPose.squint,
    );
    this.squintAmount += (wantSquint - this.squintAmount) * (1 - Math.exp(-12 * dt));
    const wantEyeGlow = mood === 'hyper' || rx === 'happy' ? 1 : this.typingPose.shine;
    this.eyeGlow += (wantEyeGlow - this.eyeGlow) * (1 - Math.exp(-8 * dt));
    // Coffee: ears flick nervously. Energy: whole head buzzes a little.
    if (mood === 'jittery' && Math.random() < dt * 7) {
      if (Math.random() < 0.5) this.earTwitchLeft = 1;
      else this.earTwitchRight = 1;
    }
    if (mood === 'hyper') {
      this.headTilt += Math.sin(this.elapsed * 36) * 0.008;
    }
    // Reaction-specific head gestures.
    if (rx === 'shake') this.headTilt += Math.sin(this.elapsed * 24) * 0.05;
    else if (rx === 'lick') this.headTilt += Math.sin(this.elapsed * 8) * 0.025;
    const wantPrivacy = this.privacyMode ? 1 : 0;
    this.privacyClose += (wantPrivacy - this.privacyClose) * (1 - Math.exp(-14 * dt));
    this.petAudio?.setPurrIntensity(
      this.catBreed !== 'dafeiyu' && this.catBreed !== 'naiwa' && !this.privacyMode && this.squintAmount > 0.25 ? this.squintAmount : 0,
    );
    if (this.catBreed === 'dafeiyu') {
      this.dafeiyu.update(dt, now, this.buildDaFeiYuLayout());
    } else {
      // Update plush cat tail key-patting physics for keys near the tail
      if (this.privacyMode) {
        this.catTail.active = false;
        this.catTail.heldVks.clear();
      }
      const tailAge = Math.max(0, now - this.catTail.tapAt);
      const tailPressing = this.catTail.active && (this.catTail.heldVks.size > 0 || tailAge < 155);
      const sinceTailRelease =
        this.catTail.heldVks.size > 0
          ? 0
          : Math.max(0, now - Math.max(this.catTail.tapAt + 155, this.catTail.releaseAt));
      if (this.catTail.active && !tailPressing && sinceTailRelease > 460) {
        this.catTail.active = false;
      }

      const targetReach = this.catTail.active ? 1 : 0;
      const reachRate = this.catTail.active ? 28 : 9.5;
      this.catTail.reach += (targetReach - this.catTail.reach) * (1 - Math.exp(-reachRate * dt));
      if (this.catTail.reach < 0.002 && !this.catTail.active) this.catTail.reach = 0;

      let targetHover = 0;
      if (this.catTail.active) {
        if (tailAge < 75) {
          // Graceful feline upward flick arc before patting down onto the keycap
          targetHover = Math.sin((tailAge / 75) * Math.PI) * 24;
        } else if (tailPressing) {
          targetHover = 0;
        } else {
          // Brief cozy ready-to-pat hover in case another near-tail key follows immediately
          targetHover = 13 + Math.sin(now * 0.012) * 2.2;
        }
      }
      const hoverRate = tailAge < 75 ? 45 : tailPressing ? 52 : 16;
      this.catTail.hover += (targetHover - this.catTail.hover) * (1 - Math.exp(-hoverRate * dt));

      const tipFollow = 1 - Math.exp(-34 * dt);
      this.catTail.tipX += (this.catTail.targetX - this.catTail.tipX) * tipFollow;
      this.catTail.tipY += (this.catTail.targetY - this.catTail.tipY) * tipFollow;
      this.catTail.impactSquash = Math.max(0, this.catTail.impactSquash - dt * 6.5);
    }

    this.earTwitchLeft = Math.max(0, this.earTwitchLeft - dt * 8);
    this.earTwitchRight = Math.max(0, this.earTwitchRight - dt * 8);

    // Real cats keep flicking an ear at random to track sounds.
    if (this.elapsed >= this.nextEarFlickAt) {
      this.nextEarFlickAt = this.elapsed + 2.4 + Math.random() * 4.6;
      const roll = Math.random();
      if (roll < 0.42) {
        this.earTurnLeft = 0.22;
        this.earTwitchLeft = 1;
      } else if (roll < 0.84) {
        this.earTurnRight = 0.22;
        this.earTwitchRight = 1;
      } else {
        this.earTurnLeft = this.earTurnRight = 0.26;
        this.earTwitchLeft = this.earTwitchRight = 1;
      }
    }
    // Slow release so the "listening" tilt is actually visible.
    this.earTurnLeft *= Math.exp(-1.6 * dt);
    this.earTurnRight *= Math.exp(-1.6 * dt);
    // Ears flatten while annoyed / dizzy.
    const wantEarBack = this.idleAction?.kind === 'nap' ? 0.5 : this.annoyance > 0.4 || this.dizzy > 0.3 ? 0.45 : -this.typingPose.ears * 0.45;
    this.earBack += (wantEarBack - this.earBack) * (1 - Math.exp(-5 * dt));

    if (!this.isBlinking && this.elapsed >= this.nextBlinkAt) {
      this.isBlinking = true;
      this.blinkProgress = 0;
    }
    if (this.isBlinking) {
      this.blinkProgress += dt * 12;
      if (this.blinkProgress >= 2) {
        this.isBlinking = false;
        this.blinkProgress = 0;
        this.nextBlinkAt = this.elapsed + 2.8 + Math.random() * 3.6;
      }
    }

    // 100% live eye tracking toward cursor, OR cozy bottom-edge glance at keys during pure typing!
    const eyePos = this.spinePoint(0.24, 0);
    const eyeCenterRelX = eyePos.x / this.logicalW;
    const eyeCenterRelY = eyePos.y / this.logicalH;
    let dx = this.cursorRelX - eyeCenterRelX;
    let dy = this.cursorRelY - eyeCenterRelY;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.001) {
      const mag = Math.min(1, dist * 1.9);
      dx = (dx / dist) * mag;
      dy = (dy / dist) * mag;
    }
    const mouseRecentlyMoved = now - this.lastMouseMoveAt < 2400;
    const pureTypingGlance = mouseRecentlyMoved ? 0 : this.typingHunch;
    const targetEyeX =
      dx * 7.0 * (1 - pureTypingGlance * 0.45) +
      pureTypingGlance * (this.typingSway * 3.8 + this.lastKeyBias * 2.2) + this.typingPose.yaw * 18;
    const targetEyeY = dy * 5.2 * (1 - pureTypingGlance * 0.45) + pureTypingGlance * 5.8 + this.typingPose.pitch * 18;
    const eyeLerp = 1 - Math.exp(-20 * dt);
    this.eyeLookX += (targetEyeX - this.eyeLookX) * eyeLerp;
    this.eyeLookY += (targetEyeY - this.eyeLookY) * eyeLerp;

    // Dizzy: pupils orbit slowly instead of tracking the cursor.
    if (this.dizzy > 0.05) {
      const orbit = Math.min(1, this.dizzy);
      const a = this.elapsed * 3.1;
      this.eyeLookX = Math.cos(a) * 5.6 * orbit;
      this.eyeLookY = Math.sin(a) * 3.8 * orbit;
    }

    const targetFaceTurn = dx * 4.0 + this.spineLean * 8.0 + this.typingSway * 8.5 + pureTypingGlance * 1.5;
    this.faceTurnX += (targetFaceTurn - this.faceTurnX) * (1 - Math.exp(-11 * dt));

    for (const anim of this.keyAnims.values()) {
      if (!anim.pressed && anim.pressAmount > 0) {
        anim.pressAmount = Math.max(0, anim.pressAmount - dt * 5.0);
      }
    }

    this.updatePaw(this.leftPaw, dt, now);
    this.updatePaw(this.rightPaw, dt, now);

    const beforeLen = this.bubbles.length;
    this.bubbles = this.bubbles.filter((b) => now - b.createdAt < b.lifetime);
    if (this.bubbles.length !== beforeLen) {
      this.layoutBubbles();
    }
    for (const b of this.bubbles) {
      const age = (now - b.createdAt) / b.lifetime;
      b.x += (b.targetX - b.x) * (1 - Math.exp(-18 * dt));
      const desiredY = b.targetY - age * 10;
      b.y += (desiredY - b.y) * (1 - Math.exp(-16 * dt));
    }

    if (this.catBreed === 'naiwa') this.naiwa.update(dt, now, this.buildNaiwaLayout());
  }

  private latestHeldKeyFor(
    side: 'left' | 'right',
  ): { side: 'left' | 'right'; specId: string; x: number; y: number; at: number } | null {
    let best: { side: 'left' | 'right'; specId: string; x: number; y: number; at: number } | null =
      null;
    for (const entry of this.heldKeys.values()) {
      if (entry.side === side && (!best || entry.at >= best.at)) {
        best = entry;
      }
    }
    return best;
  }

  private updatePaw(paw: PawState, dt: number, now: number): void {
    const liveMouseX = this.mouseBaseX + this.mouseOffsetX;
    const liveMouseY = this.mouseBaseY + this.mouseOffsetY;
    const heldKey = this.latestHeldKeyFor(paw.side);

    if (paw.mode === 'mouse') {
      // Follow the MOUSE's own facing, not the keyboard's — they can be set
      // independently, and gripping the wrong side would cover the button plates.
      const isCatFacing = this.mouseFacing === 'cat';
      const lrBias = this.mouseLeftPress - this.mouseRightPress;
      const anyClickPress = Math.max(this.mouseLeftPress, this.mouseRightPress, this.mouseMiddlePress);
      if (isCatFacing) {
        // 180° cat-facing: palm heel at TOP, LMB = inner/+X, RMB = outer/-X
        // Grip well back on the heel so the L/R plates below stay clear.
        paw.target = {
          x: liveMouseX + 1.2 + lrBias * 6.4,
          y: liveMouseY - 21.0 + anyClickPress * 2.2,
        };
      } else {
        // 0° viewer-facing: the L/R plates live at the TOP, so the paw must rest on
        // the shell's upper rim (exactly the cat-facing read, a touch higher) or it
        // would both cover the buttons and drag the arm across the shell.
        paw.target = {
          x: liveMouseX + 0.5 - lrBias * 6.4,
          y: liveMouseY - 25.0 + anyClickPress * 2.2,
        };
      }
      // Naiwa's small, continuous fingertips can rest just inside the upper
      // shell. Most of both button plates stays visible, with no floating palm.
      if (this.catBreed === 'naiwa') paw.target.y += isCatFacing ? 5 : 7;
      const stillHolding =
        this.mouseLeftDown ||
        this.mouseRightDown ||
        this.mouseMiddleDown ||
        now - this.lastMouseMoveAt < 2200;
      if (!stillHolding) {
        paw.mode = heldKey ? 'poke' : 'idle';
      }
    } else if (heldKey) {
      // Keep paw pressed down onto the held keycap until keyUp (Fixes #3)
      paw.mode = 'poke';
      paw.target = { x: heldKey.x, y: heldKey.y };
      paw.pokeTime = Math.min(paw.pokeTime + dt, 0.10);
      paw.lastActiveAt = now;
    } else if (paw.mode === 'poke') {
      paw.pokeTime += dt;
      if (paw.pokeTime > 0.13) {
        if (paw.side === 'left' && (this.mouseLeftDown || this.mouseRightDown || now - this.lastMouseMoveAt < 450)) {
          paw.mode = 'mouse';
        } else if (now - this.lastAnyKeyAt < 650 || this.heldKeys.size > 0) {
          paw.mode = 'curled';
        } else {
          paw.mode = 'idle';
        }
      }
    } else if (paw.mode === 'curled') {
      if (now - this.lastAnyKeyAt > 680 && this.heldKeys.size === 0) {
        paw.mode = 'idle';
      }
    }

    if (paw.mode === 'curled') {
      paw.target = this.getLiveCurledPawPos(paw, 0);
    } else if (paw.mode === 'idle') {
      const baseSp = this.spinePoint(1.0, 0);
      paw.target = this.catBreed === 'naiwa'
        ? this.naiwa.getHandWorld(paw.side, this.buildNaiwaLayout())
        : { x: baseSp.x + (paw.side === 'left' ? -19 : 19), y: baseSp.y };
    }

    const wantIdle = paw.mode === 'idle' ? 1 : 0;
    const wantCurl = paw.mode === 'curled' ? 1 : 0;
    const blendRate = 1 - Math.exp(-20 * dt);
    paw.idleWeight += (wantIdle - paw.idleWeight) * blendRate;
    paw.curlWeight += (wantCurl - paw.curlWeight) * blendRate;

    // Unconditionally stable, framerate-independent tracking (ZERO Euler spring overshoot at any FPS!)
    const followRate = paw.mode === 'poke' ? 42 : paw.mode === 'mouse' ? 32 : 22;
    const follow = 1 - Math.exp(-followRate * dt);
    paw.pos.x += (paw.target.x - paw.pos.x) * follow;
    paw.pos.y += (paw.target.y - paw.pos.y) * follow;
    paw.vel.x = 0;
    paw.vel.y = 0;

    // Hard guarantee: while poking a key, paw tip stays strictly on top of the keyboard surface
    if (paw.mode === 'poke') {
      const clamped = this.clampToKeyboardSurface(paw.pos);
      if (clamped.y < paw.pos.y || Math.abs(clamped.x - paw.pos.x) > 0.01) {
        paw.pos.x = clamped.x;
        paw.pos.y = Math.min(paw.pos.y, clamped.y);
      }
    }

    paw.impactSquash = Math.max(0, paw.impactSquash - dt * 7.5);

    for (const s of paw.smears) {
      s.alpha -= dt * 3.8;
    }
    paw.smears = paw.smears.filter((s) => s.alpha > 0.02);
  }

  // ---- High-fidelity true-scale rendering ----

  private render(): void {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    ctx.save();
    if (this.embedded) {
      const baseFit = Math.min((cw * 0.86) / this.logicalW, (ch * 0.86) / this.logicalH);
      const effectiveMul = this.renderScale <= 1.0 ? this.renderScale : 1.0 + (this.renderScale - 1.0) * 0.30;
      const uniformScale = baseFit * effectiveMul;
      const drawW = this.logicalW * uniformScale;
      const drawH = this.logicalH * uniformScale;
      const offsetX = (cw - drawW) * 0.5;
      const offsetY = (ch - drawH) * 0.52;
      ctx.translate(offsetX, offsetY);
      ctx.scale(uniformScale, uniformScale);
    } else {
      const cssW = Math.max(1, window.innerWidth);
      const dpr = cw / cssW;
      const fitScale = Math.min(cw / this.logicalW, ch / this.logicalH);
      const uniformScale = Math.min(fitScale, this.renderScale * dpr);
      const drawW = this.logicalW * uniformScale;
      const drawH = this.logicalH * uniformScale;
      const offsetX = cw - drawW - desktopPetInsets.right * dpr;
      const offsetY = ch - drawH - desktopPetInsets.bottom * dpr;
      ctx.translate(offsetX, offsetY);
      ctx.scale(uniformScale, uniformScale);
    }

    const breath = Math.sin(this.elapsed * 2.1) * 1.0;
    const purrShift = this.squintAmount > 0.4 ? Math.sin(this.elapsed * 22) * 0.45 * this.squintAmount : 0;

    if (this.catBreed === 'naiwa') {
      const now = performance.now();
      const layout = this.buildNaiwaLayout();
      this.drawKeyboard(ctx);
      this.naiwa.renderBody(ctx, now, layout);
      this.drawProp(ctx);
      this.drawMiniMouse(ctx);
      this.naiwa.renderForeground(ctx, this.lastDt, now, layout);
      this.drawParticles(ctx);
      if (this.showKeyBubbles && !this.privacyMode) {
        this.drawKeyBubbles(ctx);
        this.drawMouseBadges(ctx);
      }
      this.drawDrinkFeedback(ctx);
      this.drawSleepZzz(ctx);
      this.drawAngerAndDizzy(ctx);
      this.drawWakeReaction(ctx);
      ctx.restore();
      return;
    }

    if (this.catBreed === 'dafeiyu') {
      const now = performance.now();
      const layout = this.buildDaFeiYuLayout();
      this.dafeiyu.renderBody(ctx, now, layout);
      this.drawKeyboard(ctx);
      this.drawProp(ctx);
      this.dafeiyu.renderForeground(ctx, this.lastDt, now, layout);
      // Her hands are wide, so the shell is always painted after them; the gripping
      // hand is then re-stamped above the shell so it reads as "holding the mouse".
      this.drawMiniMouse(ctx);
      this.dafeiyu.drawMouseHandOverlay(ctx);
      this.drawParticles(ctx);
      if (this.showKeyBubbles && !this.privacyMode) {
        this.drawKeyBubbles(ctx);
        this.drawMouseBadges(ctx);
      }
      this.drawDrinkFeedback(ctx);
      this.drawAngerAndDizzy(ctx);
      this.drawWakeReaction(ctx);
      ctx.restore();
      return;
    }

    // Layer 1: Mini mouse & mechanical keyboard.
    // The mouse shell is painted AFTER the cat's paws (see Layer 4) so the thick
    // gripping arm can never slice across the L/R plates in any orientation/scale
    // combination. A paw-ball overlay is stamped back on top afterwards.
    this.drawKeyboard(ctx);

    // Layer 2: Plush cat tail (above keyboard so near-tail key pats land cleanly on keycaps, yet seamlessly tucked behind hip!)
    this.drawTail(ctx);

    // The cat (and whatever it holds) hops a few pixels when it burps.
    const hop = -Math.sin(Math.min(1, this.burpKick) * Math.PI) * 3.6;
    ctx.save();
    ctx.translate(0, hop);

    // Layer 3: Exact measured spine-deformable cat silhouette (ears, cheeks, neck, pear belly, grounded hind feet, eyes & tiny whiskers)
    this.drawCatBody(ctx, breath, purrShift);

    // Layer 3.5: The drink sits on TOP of the body so it is never hidden, then the arm grips over it.
    this.drawProp(ctx);
    this.drawDrinkArm(ctx);

    // Layer 4: True-scale velvety cat paws (tapered idle legs / planted diagonal mouse support leg / bent curled chest paw / plump round poking paw!)
    this.drawPaw(ctx, this.leftPaw, breath);
    this.drawPaw(ctx, this.rightPaw, breath);

    // The mouse covers the gripping arm, then the paw ball is re-stamped on top so
    // the "holding it" read survives without hiding the button plates.
    this.drawMiniMouse(ctx);
    this.drawMousePawOverlay(ctx, breath);

    ctx.restore();

    // Layer 5: Drink particles, bouncing keycap bubbles & crisp mouse click badges
    this.drawParticles(ctx);
    if (this.showKeyBubbles && !this.privacyMode) {
      this.drawKeyBubbles(ctx);
      this.drawMouseBadges(ctx);
    }

    this.drawDrinkFeedback(ctx);
    this.drawSleepZzz(ctx);
    this.drawAngerAndDizzy(ctx);
    this.drawWakeReaction(ctx);

    ctx.restore();
  }

  private drawWakeReaction(ctx: CanvasRenderingContext2D): void {
    if (this.privacyMode) return;
    const angry = this.sleepReaction.active(this.elapsed);
    const text = angry ? '还没睡够呢！' : this.elapsed < this.soothedUntil ? '好啦，原谅你了' :
      !this.drinkFeedback && this.typingPose.amount > 0.35 ? ({ focus: '认真陪你打字', groove: '跟着节奏摇摆', excited: '越打越起劲！', grumpy: this.catBreed === 'naiwa' ? '手忙脚乱啦' : '爪爪忙不过来啦' }[this.typingReactions.kind!] ?? '') : this.catBreed === 'naiwa' && this.idleAction ?
        ({ frogHop: '蓄力——蹦！', frogCroak: '鼓鼓腮，陪你一会儿', bellyPat: '肚皮小鼓手', frogSway: '左边一下，右边一下', frogPeek: '让我瞧瞧～', footSwing: '脚丫歇一歇' } as Record<string, string>)[this.idleAction.kind] ?? '' : '';
    if (text) drawPetCaption(ctx, text, this.catCenterX, Math.max(22, this.catTopY - 18), 16, angry);
    const age = this.elapsed - this.groundImpactAt;
    if (age >= 0 && age < 0.38) {
      const p = age / 0.38;
      const hip = this.spinePoint(0.84, 0);
      const contacts = this.catBreed === 'naiwa' ? (['left', 'right'] as const).map(side => this.naiwa.getFootWorld(side, this.buildNaiwaLayout())) :
        [{ x: Math.min(this.logicalW - 24, hip.x + 137), y: this.catBaseY + 4 }];
      for (const { x, y } of contacts) {
      ctx.save(); ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = '#f99c38'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y, 9 + p * 22, 3 + p * 5, 0, 0, Math.PI * 2); ctx.stroke();
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(x + side * 10, y - 5);
        ctx.lineTo(x + side * (20 + p * 12), y - 12 - p * 12); ctx.stroke();
      }
      ctx.restore();
      }
    }
  }

  private drawTail(ctx: CanvasRenderingContext2D): void {
    // Exact ORIG 0.3s resting tail S-hook, smoothly morphing into a playful arched swan-neck pat onto near-tail keys!
    // Caffeine rush: faster tail and livelier head sway for a few seconds.
    const tailMood = moodForKind(this.propMood);
    const jittery = tailMood === 'jittery' || tailMood === 'hyper';
    const gentleDrift = jittery
      ? Math.sin(this.elapsed * 6.5) * 3.4
      : Math.sin(this.elapsed * (0.9 + this.typingPose.tail * 3)) * (1.4 + this.typingPose.tail * 3);
    const hipRight = this.spinePoint(0.84, 0);

    const startX = hipRight.x + 56;
    const startY = hipRight.y - 2;
    const restCp1X = startX + 34;
    const restCp1Y = startY + 4 + gentleDrift * 0.25;
    const restCp2X = startX + 38;
    const restCp2Y = startY - 34 + gentleDrift * 0.45;
    const restEndX = startX + 70 + gentleDrift * 0.35;
    const restEndY = startY - 35 + gentleDrift;

    const r = Math.max(0, Math.min(1, this.catTail.reach));
    const smoothR = r * r * (3 - 2 * r);

    const patEndX = this.catTail.tipX;
    const patEndY = this.catTail.tipY - this.catTail.hover - 2;
    const maxEdgeX = this.logicalW - 14;
    const patCp1X = Math.min(maxEdgeX, Math.max(startX + 44, patEndX + 32));
    const patCp1Y = startY - 12 - this.catTail.hover * 0.35;
    const patCp2X = Math.min(maxEdgeX, Math.max(startX + 54, patEndX + 40));
    const patCp2Y = Math.min(startY + 24, (startY + patEndY) * 0.5 - 30 - this.catTail.hover * 0.55);

    let cp1X = restCp1X + (patCp1X - restCp1X) * smoothR;
    let cp1Y = restCp1Y + (patCp1Y - restCp1Y) * smoothR;
    let cp2X = restCp2X + (patCp2X - restCp2X) * smoothR;
    let cp2Y = restCp2Y + (patCp2Y - restCp2Y) * smoothR;
    let endX = restEndX + (patEndX - restEndX) * smoothR;
    let endY = restEndY + (patEndY - restEndY) * smoothR;
    const ground = this.groundTail;
    const floorY = this.catBaseY + 4;
    const floorX = Math.min(this.logicalW - 24, startX + 81);
    if (ground.amount > 0) {
      const a = ground.amount;
      cp1X += (startX + 27 - cp1X) * a;
      cp1Y += (startY - 14 - cp1Y) * a;
      cp2X += (floorX - 12 - cp2X) * a;
      cp2Y += (floorY - 10 - ground.lift * 66 - cp2Y) * a;
      endX += (floorX - endX) * a;
      endY += (floorY - 9 - ground.lift * 58 - endY) * a;
    }
    const tipAngle = Math.atan2(endY - cp2Y, endX - cp2X);
    const tipSquash = this.catTail.impactSquash * smoothR;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Subtle tactile contact shadow directly on the keycap when the tail pats down!
    if (smoothR > 0.35 && ground.amount < 0.01) {
      const prox = Math.max(0, 1 - this.catTail.hover / 28);
      const shadowA = smoothR * prox * 0.34;
      if (shadowA > 0.02) {
        ctx.fillStyle = `rgba(18, 22, 32, ${shadowA.toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(
          this.catTail.tipX,
          this.catTail.tipY + 3.5,
          12.5 + tipSquash * 3.5,
          6.2 + tipSquash * 1.4,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }

    if (this.customSkin) {
      const s = this.customSkin;
      const tailW = s.tailFluffy ? 20.0 : 16.0;
      if (s.outlineColor) {
        ctx.shadowColor = 'rgba(30, 32, 40, 0.22)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 1.5;
        ctx.strokeStyle = s.outlineColor;
        ctx.lineWidth = tailW + 3.4;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      } else {
        ctx.shadowColor = 'rgba(18, 17, 18, 0.42)';
        ctx.shadowBlur = 1.6;
      }

      const tailGrad = ctx.createLinearGradient(startX, startY, endX, endY);
      tailGrad.addColorStop(0.0, s.tailColor);
      tailGrad.addColorStop(1.0, s.tailTipColor);
      ctx.strokeStyle = tailGrad;
      ctx.lineWidth = tailW;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
      ctx.stroke();

      if (s.tailFluffy) {
        ctx.fillStyle = s.tailTipColor;
        ctx.beginPath();
        ctx.ellipse(
          endX + Math.cos(tipAngle) * 1.2,
          endY + Math.sin(tipAngle) * 1.2,
          11.8 * (1 + tipSquash * 0.14),
          10.2 * (1 - tipSquash * 0.10),
          tipAngle,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else if (tipSquash > 0.05) {
        ctx.fillStyle = s.tailTipColor;
        ctx.beginPath();
        ctx.ellipse(
          endX,
          endY,
          tailW * 0.54 * (1 + tipSquash * 0.16),
          tailW * 0.50 * (1 - tipSquash * 0.12),
          tipAngle,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      // Cute tabby tail rings when tailStripes is enabled!
      if (s.tailStripes && (s.stripeColor || s.tailTipColor)) {
        const ringColor = s.stripeColor || s.tailTipColor;
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 3.2;
        ctx.shadowBlur = 0;
        for (const t of [0.24, 0.44, 0.64, 0.82]) {
          const mt = 1 - t;
          const bx =
            mt * mt * mt * startX +
            3 * mt * mt * t * cp1X +
            3 * mt * t * t * cp2X +
            t * t * t * endX;
          const by =
            mt * mt * mt * startY +
            3 * mt * mt * t * cp1Y +
            3 * mt * t * t * cp2Y +
            t * t * t * endY;
          const tx =
            3 * mt * mt * (cp1X - startX) +
            6 * mt * t * (cp2X - cp1X) +
            3 * t * t * (endX - cp2X);
          const ty =
            3 * mt * mt * (cp1Y - startY) +
            6 * mt * t * (cp2Y - cp1Y) +
            3 * t * t * (endY - cp2Y);
          const tLen = Math.max(1, Math.hypot(tx, ty));
          const nx = (-ty / tLen) * (tailW * 0.42);
          const ny = (tx / tLen) * (tailW * 0.42);
          ctx.beginPath();
          ctx.moveTo(bx - nx, by - ny);
          ctx.lineTo(bx + nx, by + ny);
          ctx.stroke();
        }
      }

      ctx.restore();
      return;
    }

    if (this.catBreed === 'ragdoll') {
      // Plush bushy warm cocoa-taupe Ragdoll plume tail matching the real cat photo!
      ctx.shadowColor = 'rgba(48, 38, 30, 0.22)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1.5;
      ctx.strokeStyle = '#4e4239';
      ctx.lineWidth = 23.5;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      const tailGrad = ctx.createLinearGradient(startX, startY, endX, endY);
      tailGrad.addColorStop(0.0, '#8d7e6f');
      tailGrad.addColorStop(0.5, '#726356');
      tailGrad.addColorStop(1.0, '#584b40');
      ctx.strokeStyle = tailGrad;
      ctx.lineWidth = 20.2;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
      ctx.stroke();

      // Bushy warm cocoa-taupe plume tip puff
      ctx.fillStyle = '#584b40';
      ctx.beginPath();
      ctx.ellipse(
        endX + Math.cos(tipAngle) * 1.2,
        endY + Math.sin(tipAngle) * 1.2,
        12.2 * (1 + tipSquash * 0.14),
        10.6 * (1 - tipSquash * 0.10),
        tipAngle,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      // Soft warm creamy sheen along upper fluff curve
      ctx.strokeStyle = 'rgba(246, 240, 232, 0.26)';
      ctx.lineWidth = 5.0;
      ctx.beginPath();
      ctx.moveTo(startX + 4, startY - 4);
      ctx.bezierCurveTo(cp1X - 2, cp1Y - 4, cp2X - 3, cp2Y - 4, endX - 3, endY - 4);
      ctx.stroke();
    } else {
      ctx.shadowColor = 'rgba(18, 17, 18, 0.45)';
      ctx.shadowBlur = 1.6;
      ctx.strokeStyle = '#141314';
      ctx.lineWidth = 16.0;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
      ctx.stroke();

      if (tipSquash > 0.05) {
        ctx.fillStyle = '#141314';
        ctx.beginPath();
        ctx.ellipse(
          endX,
          endY,
          8.8 * (1 + tipSquash * 0.16),
          8.0 * (1 - tipSquash * 0.12),
          tipAngle,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private drawCatBody(ctx: CanvasRenderingContext2D, breath: number, purrShift: number): void {
    if (this.customSkin) {
      this.drawCustomCatBody(ctx, this.customSkin, breath, purrShift);
      this.drawDrinkArm(ctx);
      return;
    }
    const isRagdoll = this.catBreed === 'ragdoll';
    const catBlack = '#141314';
    const inkOutline = '#5d5148';

    // Evaluate measured left & right silhouette points deformed by flexible cat spine + unified head tilt!
    const leftPts: Vec2[] = [];
    const rightPts: Vec2[] = [];
    const bellySwell = 1 + this.typingHunch * 0.04;
    const headCenter = this.spinePoint(0.24, breath);
    const hcx = headCenter.x + purrShift;
    const hcy = headCenter.y;

    for (const slice of BODY_SLICES) {
      const sp = this.spinePoint(slice.t, breath);
      const widen = slice.t > 0.45 ? bellySwell : 1;
      const hw = slice.hw * widen;

      if (slice.t <= 0.38) {
        const tiltW = slice.t <= 0.30 ? 1.0 : (0.42 - slice.t) / 0.12;
        const ang = this.headTilt * tiltW;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const relY = sp.y - hcy;
        const lx0 = sp.x + purrShift - hw - hcx;
        const rx0 = sp.x + purrShift + hw - hcx;
        leftPts.push({
          x: hcx + lx0 * cosA - relY * sinA,
          y: hcy + lx0 * sinA + relY * cosA,
        });
        rightPts.push({
          x: hcx + rx0 * cosA - relY * sinA,
          y: hcy + rx0 * sinA + relY * cosA,
        });
      } else {
        leftPts.push({ x: sp.x + purrShift - hw, y: sp.y });
        rightPts.push({ x: sp.x + purrShift + hw, y: sp.y });
      }
    }

    const crownRelY = this.spinePoint(0.11, breath).y - hcy;
    const crownPt = {
      x: hcx - crownRelY * Math.sin(this.headTilt),
      y: hcy + crownRelY * Math.cos(this.headTilt),
    };
    const basePt = this.spinePoint(1.0, breath);

    ctx.save();
    if (isRagdoll) {
      ctx.shadowColor = 'rgba(26, 30, 40, 0.24)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 2;
    } else {
      ctx.shadowColor = 'rgba(18, 17, 18, 0.42)';
      ctx.shadowBlur = 1.6;
    }

    // 1) Cute rounded grounded hind paws always rendered in seated posture (no idle disappear/blink; Fixes #1)
    ctx.fillStyle = isRagdoll ? '#f7f5f0' : catBlack;
    ctx.strokeStyle = inkOutline;
    ctx.lineWidth = 1.9;
    for (const [fx, fy, rx, ry] of [
      [basePt.x - 42, basePt.y - 3, 14.5, 11.5],
      [basePt.x + 32, basePt.y - 1, 15.0, 11.5],
    ]) {
      ctx.beginPath();
      ctx.ellipse(fx, fy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      if (isRagdoll) {
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.stroke();
        ctx.restore();
      }
    }

    // 2) Build exact smooth spline through measured silhouette slices (left top -> right top -> right down -> bottom -> left up)!
    const traceBodyPath = () => {
      ctx.beginPath();
      const crownCos = Math.cos(this.headTilt);
      const crownSin = Math.sin(this.headTilt);
      ctx.moveTo(leftPts[0].x + 14 * crownCos + 6 * crownSin, leftPts[0].y + 14 * crownSin - 6 * crownCos);
      ctx.quadraticCurveTo(crownPt.x, crownPt.y - 2, rightPts[0].x - 14 * crownCos + 6 * crownSin, rightPts[0].y - 14 * crownSin - 6 * crownCos);

      ctx.lineTo(rightPts[0].x, rightPts[0].y);
      for (let i = 0; i < rightPts.length - 1; i++) {
        const p0 = rightPts[i];
        const p1 = rightPts[i + 1];
        const mx = (p0.x + p1.x) * 0.5;
        const my = (p0.y + p1.y) * 0.5;
        ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
      }
      const lastR = rightPts[rightPts.length - 1];
      ctx.lineTo(lastR.x, lastR.y);

      const lastL = leftPts[leftPts.length - 1];
      ctx.quadraticCurveTo(basePt.x + purrShift, basePt.y + 6, lastL.x, lastL.y);

      for (let i = leftPts.length - 1; i > 0; i--) {
        const p0 = leftPts[i];
        const p1 = leftPts[i - 1];
        const mx = (p0.x + p1.x) * 0.5;
        const my = (p0.y + p1.y) * 0.5;
        ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
      }
      ctx.lineTo(leftPts[0].x, leftPts[0].y);
      ctx.closePath();
    };

    traceBodyPath();
    if (isRagdoll) {
      // Warm creamy ivory base coat matching the real fluffy Ragdoll photo!
      const furGrad = ctx.createRadialGradient(hcx, hcy + 68, 18, basePt.x, basePt.y - 60, 148);
      furGrad.addColorStop(0.0, '#fbf9f3');
      furGrad.addColorStop(0.68, '#f4f0e6');
      furGrad.addColorStop(1.0, '#e8e2d6');
      ctx.fillStyle = furGrad;
      ctx.fill();

      // Paint custom warm milk-tea taupe Ragdoll markings clipped cleanly inside the body silhouette!
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.clip();

      // 2a) Plush warm taupe-brown lower flanks / hips wrapping around both outer thighs (matches photo!)
      const midTorso = this.spinePoint(0.72, breath);
      for (const sgn of [-1, 1]) {
        const flankGrad = ctx.createRadialGradient(
          midTorso.x + purrShift + sgn * 70,
          midTorso.y + 8,
          14,
          midTorso.x + purrShift + sgn * 50,
          midTorso.y + 10,
          72,
        );
        flankGrad.addColorStop(0.0, 'rgba(130, 115, 100, 0.78)');
        flankGrad.addColorStop(0.50, 'rgba(156, 141, 126, 0.45)');
        flankGrad.addColorStop(0.82, 'rgba(178, 165, 150, 0.14)');
        flankGrad.addColorStop(1.0, 'rgba(190, 178, 164, 0.0)');
        ctx.fillStyle = flankGrad;
        ctx.beginPath();
        ctx.ellipse(midTorso.x + purrShift + sgn * 60, midTorso.y + 8, 52, 84, sgn * -0.14, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2b) Subtle fluffy creamy-white chest lion-mane fur tufts under chin
      const neckSp = this.spinePoint(0.47, breath);
      ctx.strokeStyle = 'rgba(182, 170, 156, 0.36)';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(neckSp.x + purrShift, neckSp.y - 2, 34, 0.22 * Math.PI, 0.78 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(neckSp.x + purrShift - 16, neckSp.y + 18, 14, 0.18 * Math.PI, 0.72 * Math.PI);
      ctx.arc(neckSp.x + purrShift + 16, neckSp.y + 18, 14, 0.28 * Math.PI, 0.82 * Math.PI);
      ctx.stroke();

      // 2c) Custom warm milk-tea taupe crown cap & wide fluffy creamy-white blaze (1:1 match to user's real Ragdoll photos!)
      ctx.save();
      ctx.translate(hcx, hcy);
      ctx.rotate(this.headTilt);

      const maskShift = this.faceTurnX * 0.72;
      // Rich warm latte-taupe head mask covering crown, ears base, temples & outer cheeks
      const capGrad = ctx.createLinearGradient(0, -40, 0, 22);
      capGrad.addColorStop(0.0, '#8d7d6e');
      capGrad.addColorStop(0.42, '#9e8e7f');
      capGrad.addColorStop(0.84, '#b3a495');
      capGrad.addColorStop(1.0, 'rgba(186, 173, 158, 0.14)');

      ctx.fillStyle = capGrad;
      ctx.shadowColor = 'rgba(138, 122, 108, 0.45)';
      ctx.shadowBlur = 4.8;

      // Full warm milk-tea head mask curving around outer eyes & cheeks, opening into a wide soft fluffy white blaze!
      ctx.beginPath();
      ctx.moveTo(-74, -44);
      ctx.lineTo(74, -44);
      ctx.lineTo(70, 20);
      ctx.quadraticCurveTo(maskShift + 42, 18, maskShift + 26, 9);
      ctx.quadraticCurveTo(maskShift + 17, 0, maskShift + 13.5, -13);
      // Soft wide fluffy dome peak of the creamy-white blaze between the brows (warm latte bridge stays connected across forehead!)
      ctx.quadraticCurveTo(maskShift + 7, -21.5, maskShift, -22.5);
      ctx.quadraticCurveTo(maskShift - 7, -21.5, maskShift - 13.5, -13);
      ctx.quadraticCurveTo(maskShift - 17, 0, maskShift - 26, 9);
      ctx.quadraticCurveTo(maskShift - 42, 18, -70, 20);
      ctx.closePath();
      ctx.fill();

      // Lighter warm champagne-beige soft forehead bridge highlight right between the ears (exact match to close-up photo!)
      ctx.shadowBlur = 5.5;
      ctx.fillStyle = 'rgba(208, 194, 176, 0.58)';
      ctx.beginPath();
      ctx.ellipse(maskShift, -32, 18, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Deeper warm taupe-brown shading along outer temples below both ears
      ctx.fillStyle = 'rgba(116, 100, 86, 0.40)';
      ctx.beginPath();
      ctx.ellipse(-44 + maskShift * 0.4, -10, 21, 22, -0.18, 0, Math.PI * 2);
      ctx.ellipse(44 + maskShift * 0.4, -10, 21, 22, 0.18, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore(); // end mask head-space
      ctx.restore(); // end body clip

      // Clean refined soft warm-brown body outline so creamy fur pops crisply on BOTH light & dark wallpapers!
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      traceBodyPath();
      ctx.strokeStyle = inkOutline;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = catBlack;
      ctx.fill();
    }

    // 3) Compact plush rounded cat ears matching ORIG 0.3s exact height (shorter & cuter, no tall rabbit ears!)
    ctx.save();
    ctx.translate(hcx, hcy);
    ctx.rotate(this.headTilt);

    const lTwitch = Math.sin(this.earTwitchLeft * Math.PI) * 0.12;
    const rTwitch = Math.sin(this.earTwitchRight * Math.PI) * 0.12;

    const drawOneEar = (sideSign: -1 | 1, twitch: number) => {
      ctx.save();
      // Per-ear listening turn + relaxed droop (airplane ears when dozing).
      const earTurn = sideSign < 0 ? this.earTurnLeft : this.earTurnRight;
      const back = this.earBack;
      ctx.translate(
        sideSign * (33 + back * 2.5) + this.faceTurnX * 0.18,
        -28 + back * 7,
      );
      ctx.rotate(sideSign * (0.08 + twitch + earTurn + back * 0.5));

      const earPath = () => {
        ctx.beginPath();
        ctx.moveTo(sideSign * 19, 20);
        ctx.bezierCurveTo(sideSign * 19, -8, sideSign * 12, -23, sideSign * 3, -21);
        ctx.bezierCurveTo(sideSign * -8, -18, sideSign * -16, -6, sideSign * -21, 8);
        ctx.closePath();
      };

      if (isRagdoll) {
        // Rich dark espresso-taupe ear rims fading to soft warm latte base (1:1 match to user's real cat!)
        const earGrad = ctx.createLinearGradient(0, -23, 0, 18);
        earGrad.addColorStop(0.0, '#463b33');
        earGrad.addColorStop(0.42, '#625449');
        earGrad.addColorStop(0.82, '#8b7c6e');
        earGrad.addColorStop(1.0, '#9c8d7e');
        ctx.fillStyle = earGrad;
        earPath();
        ctx.fill();

        // Stroke outer ear rim cleanly (open at bottom skull merge so there is zero seam line!)
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = '#473c34';
        ctx.lineWidth = 1.9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sideSign * 19, 17);
        ctx.bezierCurveTo(sideSign * 19, -8, sideSign * 12, -23, sideSign * 3, -21);
        ctx.bezierCurveTo(sideSign * -8, -18, sideSign * -16, -6, sideSign * -19, 5);
        ctx.stroke();

        // Soft warm dusty-blush cream inner ear
        ctx.fillStyle = '#dec4be';
        ctx.beginPath();
        ctx.moveTo(sideSign * 11, 10);
        ctx.bezierCurveTo(sideSign * 11, -3, sideSign * 7, -13, sideSign * 2, -11);
        ctx.bezierCurveTo(sideSign * -4, -9, sideSign * -9, -1, sideSign * -10, 8);
        ctx.closePath();
        ctx.fill();

        // Fluffy creamy-white Ragdoll ear furnishings
        ctx.strokeStyle = 'rgba(252, 249, 242, 0.90)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(sideSign * -7, 6);
        ctx.quadraticCurveTo(sideSign * -1, 3, sideSign * 5, 6);
        ctx.moveTo(sideSign * -4, 10);
        ctx.quadraticCurveTo(sideSign * 2, 7.5, sideSign * 8, 10);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.fillStyle = catBlack;
        earPath();
        ctx.fill();
      }
      ctx.restore();
    };

    drawOneEar(-1, lTwitch);
    drawOneEar(1, rTwitch);

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    const wShift = this.faceTurnX * 0.72;

    // 4) Ragdoll rosy petting blush + adorable tiny pink nose & gentle kitten smile!
    if (isRagdoll) {
      if (this.squintAmount > 0.12) {
        ctx.fillStyle = `rgba(244, 146, 166, ${(0.42 * this.squintAmount).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(wShift - 30, 13, 8.5, 4.6, -0.08, 0, Math.PI * 2);
        ctx.ellipse(wShift + 30, 13, 8.5, 4.6, 0.08, 0, Math.PI * 2);
        ctx.fill();
      }

      // Cute rosy-pink Ragdoll nose centered neatly inside the snow-white inverted-V blaze
      ctx.fillStyle = '#ee8e9e';
      ctx.beginPath();
      ctx.moveTo(wShift - 4.1, 9.6);
      ctx.quadraticCurveTo(wShift, 8.5, wShift + 4.1, 9.6);
      ctx.quadraticCurveTo(wShift + 3.2, 13.8, wShift, 14.3);
      ctx.quadraticCurveTo(wShift - 3.2, 13.8, wShift - 4.1, 9.6);
      ctx.closePath();
      ctx.fill();

      // Delicate cute kitten "w" mouth
      ctx.strokeStyle = 'rgba(72, 77, 92, 0.80)';
      ctx.lineWidth = 1.35;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(wShift - 5.8, 16.6);
      ctx.quadraticCurveTo(wShift - 2.9, 19.6, wShift, 16.4);
      ctx.quadraticCurveTo(wShift + 2.9, 19.6, wShift + 5.8, 16.6);
      ctx.stroke();
    }

    // 5) Delicate wispy cheek whiskers adapting to 2.5D head turn
    ctx.strokeStyle = isRagdoll ? 'rgba(98, 86, 76, 0.52)' : 'rgba(205, 208, 214, 0.54)';
    ctx.lineWidth = isRagdoll ? 1.15 : 1.05;
    ctx.lineCap = 'round';
    const leftLen = Math.max(8, 12 - this.faceTurnX * 0.55);
    const rightLen = Math.max(8, 12 + this.faceTurnX * 0.55);
    for (let i = 0; i < 3; i++) {
      const wy = 16 + i * 5.0;
      const slant = 2.0 + i * 1.1;
      ctx.beginPath();
      ctx.moveTo(-34 + wShift, wy);
      ctx.lineTo(-34 + wShift - leftLen, wy + slant);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(34 + wShift, wy);
      ctx.lineTo(34 + wShift + rightLen, wy + slant);
      ctx.stroke();
    }

    // 6) Expressive eyes (lemon-chartreuse for Black Cat / luminous sapphire-blue for Ragdoll!)
    this.drawEyes(ctx, wShift, -1);

    ctx.restore(); // end head

    ctx.restore();
  }

  private drawEyes(ctx: CanvasRenderingContext2D, cx: number, eyeY: number): void {
    const isRagdoll = this.catBreed === 'ragdoll';
    const blinkVal = this.isBlinking ? 1 - Math.abs(this.blinkProgress - 1) : 0;
    const closedness = Math.max(blinkVal, this.squintAmount * 0.85, this.privacyClose);

    // Exact measured eye spacing & size from original 0.3s & 10.6s!
    const eyeXs = [cx - 23.0, cx + 23.0];
    const rx = 14.8 + this.typingHunch * 1.0;
    const ry = 13.4 - this.typingHunch * 0.5;

    for (let idx = 0; idx < 2; idx++) {
      const ex = eyeXs[idx];
      ctx.save();
      ctx.translate(ex, eyeY);

      // Energy-drink rush: additive glow ring around each eye for a few seconds.
      if (this.eyeGlow > 0.02 && this.privacyClose < 0.45) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0, 0, rx * 0.4, 0, 0, rx * 1.7);
        g.addColorStop(0, `rgba(120, 240, 255, ${(0.55 * this.eyeGlow).toFixed(3)})`);
        g.addColorStop(1, 'rgba(120, 240, 255, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, rx * 1.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (this.privacyClose > 0.45) {
        ctx.strokeStyle = isRagdoll ? '#212533' : '#d4f044';
        ctx.lineWidth = 2.9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-13.5, -0.5);
        ctx.quadraticCurveTo(0, 5.2, 13.5, -0.5);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      if (this.squintAmount > 0.38 && blinkVal < 0.3) {
        if (isRagdoll) {
          // Sleek lazy drooping slits with a subtle crystal-blue underside shimmer!
          ctx.strokeStyle = 'rgba(174, 224, 255, 0.72)';
          ctx.lineWidth = 4.4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-12.5, 0.2);
          ctx.quadraticCurveTo(0, 2.2, 12.5, 1.8);
          ctx.stroke();

          ctx.strokeStyle = '#212533';
          ctx.lineWidth = 2.7;
          ctx.beginPath();
          ctx.moveTo(-13.5, -0.5);
          ctx.quadraticCurveTo(0, 1.4, 13.5, 1.2);
          ctx.stroke();
        } else {
          // Exact sleek thin horizontal lazy-slanted lemon-chartreuse slits from user's reference photo (NO grey lid blob!)
          ctx.strokeStyle = '#d4f044';
          ctx.lineWidth = 2.9;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-13.5, -0.5);
          ctx.quadraticCurveTo(0, 1.4, 13.5, 1.2);
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }

      const openRy = Math.max(1.2, ry * (1 - closedness));
      const curiousTilt = (idx === 0 ? -0.1 : 0.1) * (0.25 + this.typingHunch * 0.75);
      ctx.rotate(curiousTilt);
      // Clip the entire eye, including highlights and its rim, beneath a real lid.
      // The previously drawn fur shows through, so patterned skins stay seamless.
      clipAngryEyelid(ctx, rx, openRy, idx === 0 ? 1 : -1,
        this.fierce * (1 - Math.min(1, this.dizzy * 1.4)));

      if (isRagdoll) {
        // Gentle soulful sky-cerulean Ragdoll eyes (warm & lifelike, matching user's Ragdoll!)
        const irisGrad = ctx.createLinearGradient(0, -openRy, 0, openRy);
        irisGrad.addColorStop(0.0, '#2c5594');
        irisGrad.addColorStop(0.50, '#5a94d6');
        irisGrad.addColorStop(1.0, '#a3d2f2');
        ctx.fillStyle = irisGrad;
      } else {
        ctx.fillStyle = '#d4f044';
      }

      ctx.beginPath();
      ctx.ellipse(0, 0, rx, openRy, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.clip();

      if (openRy > 3.2) {
        // Expressive pupil hugging lower rim when looking down at keyboard!
        const px = this.eyeLookX;
        const py = this.eyeLookY;
        // As it gets angry the pupil pinches inward and rides up, which reads as a
        // narrowing, hostile stare long before the dizzy spiral appears.
        const fierce = this.fierce;
        const pupilRx = 6.2 * (1 - fierce * 0.36);
        const pupilRy = 8.8 * (1 - fierce * 0.22);

        ctx.fillStyle = isRagdoll ? '#101624' : '#0e0e10';
        ctx.beginPath();
        ctx.ellipse(px, py - fierce * 2.2, pupilRx, pupilRy, 0, 0, Math.PI * 2);
        ctx.fill();

        // Dizzy: a tiny spinning ring inside the pupil makes the "eyes are rolling"
        // read unmistakable, even at the default pet size.
        if (this.dizzy > 0.25) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, (this.dizzy - 0.25) / 0.5);
          ctx.strokeStyle = '#ffd166';
          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';
          const spin = this.elapsed * 7.5;
          const rIn = Math.min(pupilRx, pupilRy) * 0.28;
          const rOut = Math.min(pupilRx, pupilRy) * 0.86;
          ctx.beginPath();
          for (let k = 0; k <= 26; k++) {
            const u = k / 26;
            const ang = spin + u * Math.PI * 2.6;
            const rad = rIn + u * (rOut - rIn);
            const sx = px + Math.cos(ang) * rad;
            const sy = py - fierce * 2.2 + Math.sin(ang) * rad;
            if (k === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          }
          ctx.stroke();
          ctx.restore();
        }

        if (isRagdoll) {
          // Crisp glossy twin starlight catchlights for dreamy Ragdoll doll eyes!
          ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
          ctx.beginPath();
          ctx.arc(px - 3.6, py - 4.0, 2.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
          ctx.beginPath();
          ctx.arc(px + 3.2, py + 3.2, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();

      if (isRagdoll && openRy > 2.2) {
        // Delicate velvety eye rim so sapphire iris frames cleanly inside the blue-grey mask
        ctx.strokeStyle = 'rgba(34, 39, 54, 0.85)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, openRy, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  /**
   * Stamps just the paw ball of the mouse-gripping arm back on top of the shell.
   *
   * The full arm is painted before the mouse so its diagonal can never cover the
   * L/R plates; this keeps the paw visible so it still reads as "holding the mouse".
   */
  private drawMousePawOverlay(ctx: CanvasRenderingContext2D, breath: number): void {
    const paw = this.mousePaw;
    if (paw.mode !== 'mouse') return;
    if (paw.idleWeight > 0.5) return;
    if (this.catBreed === 'dafeiyu') return; // her own rig draws the hand

    const fur = this.customSkin
      ? this.customSkin.pawColor
      : this.catBreed === 'ragdoll'
        ? '#fcfaf4'
        : '#141314';
    const outline =
      this.customSkin?.pawOutlineColor ??
      (this.catBreed === 'ragdoll' ? 'rgba(93, 81, 72, 0.72)' : 'rgba(120, 124, 132, 0.34)');

    const press = Math.max(this.mouseLeftPress, this.mouseRightPress, this.mouseMiddlePress);
    // `updatePaw` already parks the paw on the shell's upper rim in both facings, so
    // the overlay only has to follow it — no extra shift or it lands on the plates.
    const px = paw.pos.x;
    const py = paw.pos.y + press * 1.8;
    const r = 11.2;

    ctx.save();
    ctx.globalAlpha = Math.min(1, (1 - paw.idleWeight) * 1.2);
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.15;
    ctx.stroke();
    // Toe creases so it reads as a paw resting on the shell.
    ctx.strokeStyle = this.catBreed === 'ragdoll' ? 'rgba(93,81,72,0.42)' : 'rgba(210,212,216,0.46)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(px - 3.4, py + r * 0.7);
    ctx.lineTo(px - 1.2, py - 1.5);
    ctx.moveTo(px + 3.4, py + r * 0.7);
    ctx.lineTo(px + 1.2, py - 1.5);
    ctx.stroke();
    ctx.restore();
  }

  private drawMiniMouse(ctx: CanvasRenderingContext2D): void {
    const mx = this.mouseBaseX + this.mouseOffsetX;
    const my = this.mouseBaseY + this.mouseOffsetY;
    const ms = this.deskSkin.mouse;
    const shape = ms.silhouette;
    const rx = shape === 'gaming' ? 19.5 : shape === 'ergonomic' ? 19 : 18.5;
    const ry = shape === 'gaming' ? 24.5 : 23.0;
    const lPress = this.mouseLeftPress;
    const rPress = this.mouseRightPress;
    const mPress = Math.max(this.mouseMiddlePress, this.mouseScrollFlash);
    const colors = this.getMouseButtonColors();

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(-0.06);

    // Soft 3D base rim / drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 3.5;
    ctx.fillStyle = ms.shellEdge;
    this.mouseBodyPath(ctx, shape, rx, ry, 1.8);
    ctx.fill();
    ctx.restore();

    // Side glow strip for gaming silhouettes
    if (ms.glow && shape !== 'oval') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = rgba(ms.glow, 0.85);
      ctx.shadowBlur = 9;
      ctx.strokeStyle = rgba(ms.glow, 0.75);
      ctx.lineWidth = 1.6;
      this.mouseBodyPath(ctx, shape, rx, ry, 0);
      ctx.stroke();
      ctx.restore();
    }

    // Main mouse palm shell (rear/palm at TOP closest to cat; split L/R buttons at BOTTOM pointing away from cat)
    const palmGrad = ctx.createLinearGradient(0, -ry, 0, 2);
    palmGrad.addColorStop(0.0, this.shade(ms.shell, 0.1));
    palmGrad.addColorStop(1.0, ms.shell);
    ctx.fillStyle = palmGrad;
    this.mouseBodyPath(ctx, shape, rx, ry, 0);
    ctx.fill();

    if (ms.pattern !== 'solid') {
      ctx.save();
      this.mouseBodyPath(ctx, shape, rx - 0.5, ry - 0.5, 0);
      ctx.clip();
      paintPattern(ctx, ms.pattern, {
        x: -rx,
        y: -ry,
        w: rx * 2,
        h: ry * 2,
        color: this.shade(ms.shellEdge, -0.15),
        scale: 1,
        alpha: 0.4,
      });
      ctx.restore();
    }

    paintMaterialSheen(ctx, ms.material, { x: -rx, y: -ry, w: rx * 2, h: ry * 2, radius: rx });

    // Clip inside mouse silhouette to render strictly separated Left / Right front button plates!
    const isCatFacing = this.mouseFacing === 'cat';
    ctx.save();
    this.mouseBodyPath(ctx, shape, rx - 0.5, ry - 0.5, 0);
    ctx.clip();

    // Orientation-aware button/wheel geometry:
    // - 'cat' (180°): palm at TOP, buttons at BOTTOM, L = +X (inner), R = -X (outer)
    // - 'viewer' (0°): buttons at TOP, palm at BOTTOM, L = -X (left), R = +X (right)
    ctx.save();
    if (!isCatFacing) {
      ctx.scale(-1, -1);
    }

    const traceSeam = () => {
      ctx.moveTo(-rx - 2, -0.8);
      ctx.quadraticCurveTo(0, 1.8, rx + 2, -0.8);
    };

    // 1) Left Mouse Button plate (+X half in local coords -> inner-bottom in cat mode, top-left in viewer mode)
    ctx.beginPath();
    ctx.moveTo(0, 0.5);
    ctx.quadraticCurveTo(rx * 0.52, 0.4, rx + 2, -0.8);
    ctx.lineTo(rx + 2, ry + 2);
    ctx.lineTo(0, ry + 2);
    ctx.closePath();
    ctx.fillStyle = lPress > 0.08 ? colors.left : ms.button;
    ctx.fill();
    if (lPress > 0.08) {
      ctx.fillStyle = `rgba(18, 22, 28, ${(0.18 * lPress).toFixed(3)})`;
      ctx.fillRect(0, -1, rx + 2, 3.8);
      ctx.fillRect(0, -1, 2.2, ry + 2);
    }

    // 2) Right Mouse Button plate (-X half in local coords -> outer-bottom in cat mode, top-right in viewer mode)
    ctx.beginPath();
    ctx.moveTo(-rx - 2, -0.8);
    ctx.quadraticCurveTo(-rx * 0.52, 0.4, 0, 0.5);
    ctx.lineTo(0, ry + 2);
    ctx.lineTo(-rx - 2, ry + 2);
    ctx.closePath();
    ctx.fillStyle = rPress > 0.08 ? colors.right : ms.button;
    ctx.fill();
    if (rPress > 0.08) {
      ctx.fillStyle = `rgba(18, 22, 28, ${(0.18 * rPress).toFixed(3)})`;
      ctx.fillRect(-rx - 2, -1, rx + 2, 3.8);
      ctx.fillRect(-2.2, -1, 2.2, ry + 2);
    }

    // Crisp horizontal palm-to-button seam & vertical center L/R split line
    ctx.strokeStyle = 'rgba(42, 45, 52, 0.56)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    traceSeam();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(42, 45, 52, 0.66)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, 0.6);
    ctx.lineTo(0, ry + 1);
    ctx.stroke();

    // Recessed scroll wheel housing + interactive wheel (middle click & scroll glow)
    ctx.fillStyle = this.shade(ms.outline, 0.05);
    this.roundRect(ctx, -2.5, 4.2, 5.0, 9.4, 2.5);
    ctx.fill();

    ctx.fillStyle = mPress > 0.12 ? colors.middle : ms.wheel;
    this.roundRect(ctx, -1.7, 5.0 + this.mouseMiddlePress * 0.8, 3.4, 7.6, 1.7);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-1.0, 8.8 + this.mouseMiddlePress * 0.8);
    ctx.lineTo(1.0, 8.8 + this.mouseMiddlePress * 0.8);
    ctx.stroke();

    ctx.restore(); // end local orientation transform

    // Always draw upright crisp L / R button legends in unobstructed front tips!
    ctx.font = '800 7.6px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lx = isCatFacing ? 7.4 : -7.4;
    const rxLbl = isCatFacing ? -7.4 : 7.4;
    const lyBase = isCatFacing ? 14.0 : -14.0;
    const pressDir = isCatFacing ? 0.9 : -0.9;
    ctx.fillStyle = lPress > 0.12 ? '#14161a' : 'rgba(72, 76, 86, 0.56)';
    ctx.fillText('L', lx, lyBase + lPress * pressDir);
    ctx.fillStyle = rPress > 0.12 ? '#ffffff' : 'rgba(72, 76, 86, 0.56)';
    ctx.fillText('R', rxLbl, lyBase + rPress * pressDir);

    ctx.restore(); // end mouse clip

    // Crisp outer silhouette stroke
    ctx.strokeStyle = ms.outline;
    ctx.lineWidth = 1.5;
    this.mouseBodyPath(ctx, shape, rx, ry, 0);
    ctx.stroke();

    ctx.restore();
  }

  /** Mouse silhouette in local space; `grow` expands it for the rim/shadow pass. */
  private mouseBodyPath(
    ctx: CanvasRenderingContext2D,
    shape: 'oval' | 'ergonomic' | 'gaming',
    rx: number,
    ry: number,
    grow: number,
  ): void {
    const g = grow;
    if (shape === 'oval') {
      ctx.beginPath();
      ctx.ellipse(0, 0, rx + g, ry + g, 0, 0, Math.PI * 2);
      return;
    }
    if (shape === 'gaming') {
      // Sharp shoulder at the palm, flared skirt toward the buttons.
      ctx.beginPath();
      ctx.moveTo(0, -ry - g);
      ctx.quadraticCurveTo(rx * 0.95 + g, -ry * 0.72, rx * 0.86 + g, -ry * 0.06);
      ctx.lineTo(rx * 1.02 + g, ry * 0.52);
      ctx.quadraticCurveTo(rx * 1.05 + g, ry * 0.92, rx * 0.52 + g, ry + g);
      ctx.lineTo(-rx * 0.52 - g, ry + g);
      ctx.quadraticCurveTo(-rx * 1.05 - g, ry * 0.92, -rx * 1.02 - g, ry * 0.52);
      ctx.lineTo(-rx * 0.86 - g, -ry * 0.06);
      ctx.quadraticCurveTo(-rx * 0.95 - g, -ry * 0.72, 0, -ry - g);
      ctx.closePath();
      return;
    }
    // ergonomic: asymmetric waist, wider on the thumb side
    ctx.beginPath();
    ctx.moveTo(0, -ry - g);
    ctx.quadraticCurveTo(rx * 0.88 + g, -ry * 0.78, rx * 0.74 + g, -ry * 0.1);
    ctx.quadraticCurveTo(rx * 0.66 + g, ry * 0.42, rx * 0.82 + g, ry * 0.82);
    ctx.quadraticCurveTo(rx * 0.8 + g, ry + g, 0, ry + g);
    ctx.quadraticCurveTo(-rx * 0.9 - g, ry + g, -rx * 0.92 - g, ry * 0.5);
    ctx.quadraticCurveTo(-rx * 0.94 - g, -ry * 0.5, 0, -ry - g);
    ctx.closePath();
  }

  private drawKeyboard(ctx: CanvasRenderingContext2D): void {
    const layout = getKeyboardLayout(this.keyboardLayout);
    const isCatFacing = this.keyboardOrientation === 'cat';
    const is108 = this.keyboardLayout === '108';
    const padX = 7;
    const padY = 6;
    const innerW = this.kbWidth - padX * 2;
    const innerH = this.kbHeight - padY * 2;

    ctx.save();
    ctx.translate(this.kbCenterX, this.kbCenterY + this.kbBounce * 1.1);
    ctx.rotate(this.kbTiltRad);

    // True 3D desk trapezoid perspective: far edge (top) is narrower, near edge (bottom) is wider,
    // cleanly re-projected for BOTH cat-facing (Spacebar at narrow top) and viewer-facing (Esc/F-row at narrow top)!
    const topHalfW = (this.kbWidth * 0.955) / 2;
    const botHalfW = (this.kbWidth * 1.035) / 2;
    const halfH = this.kbHeight / 2;

    const lightCfg = this.lightEngine.getConfig();
    const nowMs = performance.now();
    // `backlit` = lighting is on; it only darkens the caps when the user opted
    // into backlitCaps, so the desk skin otherwise stays untouched.
    const backlit = !this.privacyMode && lightCfg.enabled && lightCfg.effect !== 'off';
    const dimDeck = backlit && lightCfg.backlitCaps;
    const skin = this.deskSkin;
    const kbs = skin.keyboard;

    // Ambient bloom spilling out from under the deck (cheap: 2 blurred fills, no per-key shadowBlur)
    const glow = this.privacyMode ? null : this.lightEngine.underglow();
    if (glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = rgba(glow.color, Math.min(0.85, glow.intensity));
      ctx.shadowBlur = 26;
      ctx.fillStyle = rgba(glow.color, Math.min(0.5, glow.intensity * 0.5));
      this.trapezoidPath(ctx, topHalfW + 3, botHalfW + 3, -halfH - 1, halfH + 1, 9);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.34)';
    ctx.shadowBlur = 11;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = kbs.deckSide;
    this.trapezoidPath(ctx, topHalfW, botHalfW, -halfH + 3.5, halfH + 5.5, 6.5);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = dimDeck && kbs.pattern === 'solid' ? this.shade(kbs.deckTop, -0.06) : kbs.deckTop;
    ctx.strokeStyle = kbs.deckEdge;
    ctx.lineWidth = 1.1;
    this.trapezoidPath(ctx, topHalfW, botHalfW, -halfH, halfH, 6.5);
    ctx.fill();
    ctx.stroke();

    // Chassis rim light: the RGB band real keyboards have along the case edge.
    const edge = this.privacyMode ? null : this.lightEngine.edgeGlow();
    if (edge) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(edge.color, Math.min(0.95, edge.intensity));
      ctx.lineWidth = 2.6;
      ctx.shadowColor = rgba(edge.color, Math.min(0.9, edge.intensity));
      ctx.shadowBlur = 13;
      this.trapezoidPath(ctx, topHalfW, botHalfW, -halfH, halfH, 6.5);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.0;
      ctx.strokeStyle = rgba(edge.color, Math.min(0.55, edge.intensity * 0.75));
      this.trapezoidPath(ctx, topHalfW - 3.4, botHalfW - 3.4, -halfH + 2.6, halfH - 2.6, 5);
      ctx.stroke();
      ctx.restore();
    }

    // Deck surface pattern (carbon / wood / marble / grid / hologram)
    if (kbs.pattern !== 'solid') {
      ctx.save();
      this.trapezoidPath(ctx, topHalfW, botHalfW, -halfH, halfH, 6.5);
      ctx.clip();
      paintPattern(ctx, kbs.pattern, {
        x: -botHalfW,
        y: -halfH,
        w: botHalfW * 2,
        h: halfH * 2,
        color: kbs.patternColor,
        scale: kbs.patternScale,
        alpha: 0.5,
      });
      ctx.restore();
    }

    // Bright clean light-grey inner keybed matching ORIG 0.3s bright airy white keyboard!
    ctx.fillStyle = dimDeck && kbs.pattern === 'solid' ? this.shade(kbs.bedFill, -0.02) : kbs.bedFill;
    this.trapezoidPath(ctx, topHalfW - 5, botHalfW - 5, -halfH + 4, halfH - 4, 3.5);
    ctx.fill();

    const rowH = innerH / layout.totalRows;
    const unitW = innerW / layout.totalUnits;
    const gap = is108 ? 0.85 : 0.9;

    for (const key of layout.keys) {
      const anim = this.keyAnims.get(key.id);
      const press = anim ? anim.pressAmount : 0;

      const rY = key.rowY ?? key.row;
      const rSpan = key.rowSpan ?? 1;
      const screenRowTop = isCatFacing ? layout.totalRows - (rY + rSpan) : rY;
      const screenUStart = isCatFacing
        ? layout.totalUnits - (key.uStart + key.uWidth)
        : key.uStart;

      const rowCenterFrac = (screenRowTop + rSpan * 0.5) / layout.totalRows;
      const depthScale = 0.94 + rowCenterFrac * 0.09;

      const rawX = -innerW / 2 + screenUStart * unitW + gap * 0.5;
      const rawW = key.uWidth * unitW - gap;
      const x = rawX * depthScale;
      const w = rawW * depthScale;
      const y = -innerH / 2 + screenRowTop * rowH + gap * 0.5 + press * 2.0;
      const h = rSpan * rowH - gap - 0.8;

      let topColor = kbs.keyTop;
      let sideColor = kbs.keySide;
      let textColor = kbs.keyText;
      if (press > 0.14) {
        topColor = this.customSkin
          ? this.customSkin.accentColor
          : this.catBreed === 'dafeiyu'
            ? '#5cc8ff'
            : this.catBreed === 'ragdoll'
              ? '#7ac7ff'
              : '#d2f244';
        sideColor = this.customSkin
          ? this.customSkin.accentSideColor
          : this.catBreed === 'dafeiyu'
            ? '#2563eb'
            : this.catBreed === 'ragdoll'
              ? '#4690d8'
              : '#8cb014';
      } else if (key.accent === 'orange') {
        topColor = kbs.accentKeyTop;
        sideColor = kbs.accentKeySide;
      } else if (key.accent === 'mod') {
        topColor = kbs.modKeyTop;
        sideColor = kbs.modKeySide;
      }

      // DIY keycap overrides win over the skin palette but lose to the pressed state.
      const diy = kbs.keycaps?.[key.id] || this.keycapOverrides[key.id] ? { ...kbs.keycaps?.[key.id], ...this.keycapOverrides[key.id] } : undefined;
      if (diy && press <= 0.14) {
        if (diy.top) topColor = diy.top;
        if (diy.side) sideColor = diy.side;
        if (diy.text) textColor = diy.text;
      }

      // Backlit mode is opt-in: muting the caps to a dark shell only happens when
      // the user asked for it, otherwise the desk skin keeps its own colours and
      // the LED simply glows on top.
      if (backlit && lightCfg.backlitCaps && press <= 0.14 && !diy) {
        topColor = key.accent === 'orange' ? this.shade(kbs.accentKeyTop, -0.62) : this.shade(topColor, -0.78);
        sideColor = key.accent === 'orange' ? this.shade(kbs.accentKeySide, -0.62) : this.shade(sideColor, -0.78);
      }

      const geo = keycapGeometry(kbs.shape, w, h);
      ctx.fillStyle = sideColor;
      roundRectPath(ctx, x, y + geo.lift, w, h, geo.radius);
      ctx.fill();

      ctx.fillStyle = topColor;
      roundRectPath(ctx, x, y, w, h - 0.9, geo.radius);
      ctx.fill();

      // Per-key RGB: tint the keycap plus a soft additive bloom under it.
      if (!this.privacyMode && keyInZone(key, lightCfg.zone)) {
        const anim = this.keyAnims.get(key.id);
        const lit = this.lightEngine.keyLight({
          x,
          y,
          w,
          h,
          press,
          nx: (screenUStart + key.uWidth * 0.5) / layout.totalUnits,
          ny: (screenRowTop + rSpan * 0.5) / layout.totalRows,
          hitAgeSec: anim ? (nowMs - anim.lastHitAt) / 1000 : Infinity,
        });
        if (lit) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.shadowColor = rgba(lit.color, Math.min(0.9, lit.intensity));
          ctx.shadowBlur = 6 + lit.intensity * 8;
          ctx.fillStyle = rgba(lit.color, Math.min(0.85, lit.intensity * 0.7));
          roundRectPath(ctx, x, y, w, h - 0.9, geo.radius);
          ctx.fill();
          ctx.restore();
        }
      }

      // Keycap legends: rotated 180° in cat-facing mode, upright 0° in viewer-facing mode!
      const diyLegend = diy?.emoji || diy?.label;
      const legend = diyLegend !== undefined
        ? diyLegend
        : key.id === 'space'
          ? ''
          : key.id === 'esc'
            ? 'Esc'
            : key.label;
      if (legend) {
        const isEmoji = Boolean(diy?.emoji);
        const isWideWord = !isEmoji && legend.length >= 3;
        const fontSize = isEmoji
          ? (is108 ? 8.5 : 9.5)
          : is108
            ? isWideWord
              ? 5.0
              : legend.length === 2
                ? 5.8
                : 7.2
            : isWideWord
              ? 5.6
              : legend.length === 2
                ? 6.4
                : 7.8;
        ctx.save();
        ctx.translate(x + w * 0.5, y + (h - 0.9) * 0.50);
        if (isCatFacing) {
          ctx.rotate(Math.PI);
        }
        ctx.font = isEmoji
          ? `${fontSize}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`
          : `700 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
        ctx.fillStyle = press > 0.14
          ? '#111214'
          : textColor !== kbs.keyText
            ? textColor
            : dimDeck
              ? rgba(this.readableInk(topColor), 0.78)
              : key.accent === 'orange'
                ? '#ffffff'
                : kbs.keyText;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(legend, 0, 0);
        ctx.restore();
      }
    }

    if (this.privacyClose > 0.08) {
      ctx.save();
      ctx.globalAlpha = this.privacyClose;
      ctx.fillStyle = 'rgba(15, 20, 32, 0.74)';
      this.trapezoidPath(ctx, topHalfW - 2, botHalfW - 2, -halfH + 1.5, halfH - 1.5, 5.5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(244, 114, 182, 0.45)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.font = '700 11.5px "Segoe UI", "PingFang SC", sans-serif';
      ctx.fillStyle = '#fbcfe8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const dots = performance.now() - this.privacyTypingAt < 350 ? ' • • •' : '';
      const label = this.catBreed === 'dafeiyu' ? '🔒 非礼勿视 · 已隐藏按键' : '🔒 密码输入中 · 已隐藏按键';
      ctx.fillText(label + dots, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * True-scale plush velvety cat arm & chubby rounded paw ball (1:1 match to reference photo & 8.3s / 13.2s / 31.0s!)
   */
  private drawPlumpCatArm(
    ctx: CanvasRenderingContext2D,
    side: 'left' | 'right',
    sx: number,
    sy: number,
    px: number,
    py: number,
    squash: number,
    withCrease: boolean,
    pawScale = 1,
  ): void {
    const dx = px - sx;
    const dy = py - sy;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    const wristDist = Math.max(6, len - 8);
    const wx = sx + ux * wristDist;
    const wy = sy + uy * wristDist;

    // True-scale plush proportions for 248px tall cat!
    const rShoulder = 14.2;
    const rWrist = 9.4;
    const pawRx = 14.5 * (1 + squash * 0.14) * pawScale;
    const pawRy = 11.8 * (1 - squash * 0.12) * pawScale;

    if (this.customSkin) {
      this.drawCustomPlumpArm(
        ctx,
        this.customSkin,
        side,
        sx,
        sy,
        px,
        py,
        squash,
        withCrease,
        pawScale,
      );
      return;
    }

    const isRagdoll = this.catBreed === 'ragdoll';
    ctx.save();

    if (isRagdoll) {
      // Seamless pure creamy snow-white Ragdoll mitten arm melting smoothly out of the white chest!
      const armGrad = ctx.createLinearGradient(sx, sy, px, py);
      armGrad.addColorStop(0.0, '#f5f1e8');
      armGrad.addColorStop(0.5, '#f9f6ef');
      armGrad.addColorStop(1.0, '#fcfaf4');

      ctx.fillStyle = armGrad;

      // Tapered snow-white arm silhouette (NO dark shadow smudge over the white chest!)
      const traceArmPath = () => {
        ctx.beginPath();
        ctx.moveTo(sx + nx * rShoulder, sy + ny * rShoulder);
        ctx.quadraticCurveTo(
          (sx + wx) * 0.5 + nx * (rShoulder * 0.84),
          (sy + wy) * 0.5 + ny * (rShoulder * 0.84),
          wx + nx * rWrist,
          wy + ny * rWrist,
        );
        ctx.lineTo(wx - nx * rWrist, wy - ny * rWrist);
        ctx.quadraticCurveTo(
          (sx + wx) * 0.5 - nx * (rShoulder * 0.84),
          (sy + wy) * 0.5 - ny * (rShoulder * 0.84),
          sx - nx * rShoulder,
          sy - ny * rShoulder,
        );
        ctx.closePath();
      };
      traceArmPath();
      ctx.fill();

      // Seamless white shoulder merge (invisible against white chest — ZERO grey shoulder blob!)
      ctx.beginPath();
      ctx.arc(sx, sy, rShoulder, 0, Math.PI * 2);
      ctx.fill();

      // Signature unique marking from user's real Ragdoll photo: adorable warm taupe-brown oval patch on viewer's RIGHT front forearm!
      if (side === 'right' && len > 26) {
        ctx.save();
        traceArmPath();
        ctx.clip();
        const spotX = sx + ux * (len * 0.64) + nx * 2.0;
        const spotY = sy + uy * (len * 0.64) + ny * 2.0;
        const armAngle = Math.atan2(dy, dx);
        ctx.fillStyle = 'rgba(134, 118, 102, 0.84)';
        ctx.shadowColor = 'rgba(134, 118, 102, 0.45)';
        ctx.shadowBlur = 2.5;
        ctx.beginPath();
        ctx.ellipse(spotX, spotY, Math.min(13.5, len * 0.16), 8.2, armAngle, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Soft subtle contact shadow ONLY under the plump round white mitten paw ball
      ctx.save();
      ctx.shadowColor = 'rgba(46, 38, 30, 0.22)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1.5;
      ctx.fillStyle = '#fcfaf4';
      ctx.beginPath();
      ctx.ellipse(px, py, pawRx, pawRy, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Refined warm-taupe arm side strokes that fade gently out at the shoulder and stay crisp along forearm & paw!
      ctx.lineWidth = 1.65;
      ctx.lineCap = 'round';
      for (const sgn of [-1, 1]) {
        const startFrac = withCrease ? 0.16 : 0.08;
        const esx = sx + ux * (len * startFrac) + nx * sgn * (rShoulder * (1 - startFrac * 0.16));
        const esy = sy + uy * (len * startFrac) + ny * sgn * (rShoulder * (1 - startFrac * 0.16));
        const eex = wx + nx * sgn * rWrist;
        const eey = wy + ny * sgn * rWrist;

        const edgeGrad = ctx.createLinearGradient(esx, esy, eex, eey);
        edgeGrad.addColorStop(0.0, 'rgba(93, 81, 72, 0.0)');
        edgeGrad.addColorStop(0.24, 'rgba(93, 81, 72, 0.78)');
        edgeGrad.addColorStop(1.0, 'rgba(93, 81, 72, 0.92)');

        ctx.strokeStyle = edgeGrad;
        ctx.beginPath();
        ctx.moveTo(esx, esy);
        ctx.quadraticCurveTo(
          (sx + wx) * 0.5 + nx * sgn * (rShoulder * 0.84),
          (sy + wy) * 0.5 + ny * sgn * (rShoulder * 0.84),
          eex,
          eey,
        );
        ctx.stroke();
      }

      // Crisp rounded mitten paw outline arc so the white paw reads clearly against white keyboard keys!
      const pawAng = Math.atan2(dy, dx);
      ctx.strokeStyle = 'rgba(93, 81, 72, 0.92)';
      ctx.beginPath();
      ctx.ellipse(px, py, pawRx, pawRy, 0, pawAng - Math.PI * 0.62, pawAng + Math.PI * 0.62);
      ctx.stroke();

      ctx.restore();
      return;
    }

    ctx.shadowColor = 'rgba(18, 17, 18, 0.42)';
    ctx.shadowBlur = 1.6;
    ctx.fillStyle = '#141314';

    // Arm silhouette tapering gently from shoulder to wrist
    ctx.beginPath();
    ctx.moveTo(sx + nx * rShoulder, sy + ny * rShoulder);
    ctx.quadraticCurveTo(
      (sx + wx) * 0.5 + nx * (rShoulder * 0.84),
      (sy + wy) * 0.5 + ny * (rShoulder * 0.84),
      wx + nx * rWrist,
      wy + ny * rWrist,
    );
    ctx.lineTo(wx - nx * rWrist, wy - ny * rWrist);
    ctx.quadraticCurveTo(
      (sx + wx) * 0.5 - nx * (rShoulder * 0.84),
      (sy + wy) * 0.5 - ny * (rShoulder * 0.84),
      sx - nx * rShoulder,
      sy - ny * rShoulder,
    );
    ctx.closePath();
    ctx.fill();

    // Seamless shoulder merge
    ctx.beginPath();
    ctx.arc(sx, sy, rShoulder, 0, Math.PI * 2);
    ctx.fill();

    // Plump, soft rounded black velvet paw ball pressing firmly onto the key!
    ctx.beginPath();
    ctx.ellipse(px, py, pawRx, pawRy, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Clean crisp subtle light-grey side separation lines ONLY where the arm crosses the black body (exact 2.2s / 8.3s / 13.2s!)
    if (withCrease && len > 28) {
      const startFrac = 0.18;
      const endFrac = 0.72;
      for (const sgn of [-1, 1]) {
        const csx = sx + ux * (len * startFrac) + nx * sgn * (rShoulder * 0.86);
        const csy = sy + uy * (len * startFrac) + ny * sgn * (rShoulder * 0.86);
        const cex = sx + ux * (len * endFrac) + nx * sgn * (rWrist * 1.02);
        const cey = sy + uy * (len * endFrac) + ny * sgn * (rWrist * 1.02);

        const creaseGrad = ctx.createLinearGradient(csx, csy, cex, cey);
        creaseGrad.addColorStop(0.0, 'rgba(216, 218, 222, 0.0)');
        creaseGrad.addColorStop(0.22, 'rgba(216, 218, 222, 0.65)');
        creaseGrad.addColorStop(0.84, 'rgba(216, 218, 222, 0.56)');
        creaseGrad.addColorStop(1.0, 'rgba(216, 218, 222, 0.0)');

        ctx.strokeStyle = creaseGrad;
        ctx.lineWidth = 1.3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(csx, csy);
        ctx.lineTo(cex, cey);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /**
   * Real 2-segment articulated bent kitten arm (shoulder -> elbow -> curled plump paw on chest!)
   * Matches original video 8.3s (left paw), 10.6s (both paws), 23.2s, 26.2s!
   */
  private drawBentCurledArm(ctx: CanvasRenderingContext2D, paw: PawState, breath: number, alpha: number): void {
    const sh = this.getLiveShoulder(paw, breath);
    const cp = this.getLiveCurledPawPos(paw, breath);
    const sign = paw.side === 'left' ? -1 : 1;
    // Natural elbow bends slightly outward & down below shoulder before forearm curves inward-up!
    const elbowX = sh.x + sign * 8;
    const elbowY = cp.y + 8;

    if (this.customSkin) {
      this.drawCustomBentArm(ctx, this.customSkin, paw, breath, alpha);
      return;
    }

    const isRagdoll = this.catBreed === 'ragdoll';
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Continuous bent velvety arm + plump curled paw
    ctx.strokeStyle = isRagdoll ? '#f6f2ea' : '#141314';
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.quadraticCurveTo(elbowX, elbowY, cp.x, cp.y);
    ctx.stroke();

    // Signature warm taupe-brown patch on viewer's RIGHT curled forearm too!
    if (isRagdoll && paw.side === 'right') {
      ctx.save();
      ctx.fillStyle = 'rgba(134, 118, 102, 0.78)';
      ctx.beginPath();
      ctx.ellipse((elbowX + cp.x) * 0.5 + 2, (elbowY + cp.y) * 0.5 + 1, 7.5, 5.2, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = isRagdoll ? '#fcfaf4' : '#141314';
    ctx.beginPath();
    ctx.ellipse(cp.x, cp.y, 12.5, 11.0, sign * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Clear crisp contour along the bent curled forearm & kitten paw
    const grad = ctx.createLinearGradient(elbowX, elbowY - 12, cp.x, cp.y + 12);
    if (isRagdoll) {
      grad.addColorStop(0.0, 'rgba(93, 81, 72, 0.0)');
      grad.addColorStop(0.28, 'rgba(93, 81, 72, 0.68)');
      grad.addColorStop(0.86, 'rgba(93, 81, 72, 0.78)');
      grad.addColorStop(1.0, 'rgba(93, 81, 72, 0.35)');
    } else {
      grad.addColorStop(0.0, 'rgba(214, 216, 220, 0.0)');
      grad.addColorStop(0.30, 'rgba(214, 216, 220, 0.65)');
      grad.addColorStop(0.85, 'rgba(220, 222, 226, 0.72)');
      grad.addColorStop(1.0, 'rgba(220, 222, 226, 0.25)');
    }

    ctx.strokeStyle = grad;
    ctx.lineWidth = isRagdoll ? 1.65 : 1.4;
    ctx.beginPath();
    ctx.moveTo(elbowX + sign * 8, elbowY - 16);
    ctx.quadraticCurveTo(elbowX + sign * 4, elbowY + 12, cp.x + sign * 2, cp.y + 10);
    ctx.quadraticCurveTo(cp.x - sign * 11, cp.y + 8, cp.x - sign * 12, cp.y - 4);
    ctx.stroke();

    ctx.restore();
  }

  private drawPaw(ctx: CanvasRenderingContext2D, paw: PawState, breath: number): void {
    // While drinking, the arm holding the cup replaces that side's idle paw.
    if (
      this.propPose.active &&
      this.propArmAlpha > 0.5 &&
      this.catBreed !== 'dafeiyu' &&
      paw.side === this.getPropAnchor().side
    ) {
      return;
    }
    // 1) Seated idle vertical front legs (EXACT 4 clean lines of ORIG 0.3s!) OR planted diagonal supporting leg (ORIG 2.2s!)
    if (paw.idleWeight > 0.05) {
      ctx.save();
      ctx.globalAlpha = paw.idleWeight;

      if (paw.side !== this.mousePawSide && this.mousePaw.mode === 'mouse') {
        const sign = paw.side === 'right' ? 1 : -1;
        const sh = this.getLiveShoulder(paw, breath);
        const baseSp = this.spinePoint(1.0, breath);
        this.drawPlumpCatArm(
          ctx,
          paw.side,
          sh.x + sign * -4,
          sh.y + 8,
          baseSp.x + sign * 28,
          baseSp.y - 2,
          0,
          true,
        );
      } else {
        // Exact 4-line seated leg silhouette from ORIG 0.3s (outer curved leg line + crisp inner center-gap line!)
        const topSp = this.spinePoint(0.66, breath);
        const midSp = this.spinePoint(0.84, breath);
        const botSp = this.spinePoint(1.0, breath);
        const sign = paw.side === 'left' ? -1 : 1;

        const outerTopX = topSp.x + sign * 41;
        const outerBotX = botSp.x + sign * 35;
        const innerTopX = topSp.x + sign * 6.5;
        const innerBotX = botSp.x + sign * 9.5;

        if (this.customSkin) {
          this.drawCustomIdleLegDetails(ctx, this.customSkin, paw, topSp, midSp, botSp, sign, outerTopX, outerBotX, innerTopX, innerBotX);
          ctx.restore();
          return;
        }

        // Signature warm taupe-brown oval leg patch on viewer's RIGHT seated front leg (1:1 match to user's real Ragdoll!)
        const isRagdoll = this.catBreed === 'ragdoll';
        if (isRagdoll && paw.side === 'right') {
          ctx.save();
          ctx.fillStyle = 'rgba(134, 118, 102, 0.80)';
          ctx.shadowColor = 'rgba(134, 118, 102, 0.40)';
          ctx.shadowBlur = 3.0;
          ctx.beginPath();
          ctx.ellipse(midSp.x + 21, midSp.y + 12, 9.5, 13.5, 0.22, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Crisp subtle outer leg curve & inner leg-gap line (4 total lines across both legs — exact ORIG 0.3s!)
        const lineGrad = ctx.createLinearGradient(topSp.x, topSp.y, botSp.x, botSp.y);
        if (isRagdoll) {
          lineGrad.addColorStop(0.0, 'rgba(93, 81, 72, 0.0)');
          lineGrad.addColorStop(0.18, 'rgba(93, 81, 72, 0.62)');
          lineGrad.addColorStop(0.92, 'rgba(93, 81, 72, 0.68)');
          lineGrad.addColorStop(1.0, 'rgba(93, 81, 72, 0.28)');
        } else {
          lineGrad.addColorStop(0.0, 'rgba(210, 212, 216, 0.0)');
          lineGrad.addColorStop(0.18, 'rgba(210, 212, 216, 0.64)');
          lineGrad.addColorStop(0.92, 'rgba(210, 212, 216, 0.62)');
          lineGrad.addColorStop(1.0, 'rgba(210, 212, 216, 0.25)');
        }

        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = isRagdoll ? 1.55 : 1.4;
        ctx.lineCap = 'round';

        // Outer front-leg separation line (gently curves inward toward paw!)
        ctx.beginPath();
        ctx.moveTo(outerTopX, topSp.y);
        ctx.quadraticCurveTo(midSp.x + sign * 41, midSp.y, outerBotX, botSp.y - 1);
        ctx.stroke();

        // Inner front-leg gap line (tapers slightly outward toward paws, exact inverted narrow V from ORIG 0.3s!)
        ctx.beginPath();
        ctx.moveTo(innerTopX, topSp.y + 10);
        ctx.lineTo(innerBotX, botSp.y - 1);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2) Continuous bent articulated curled chest arm (8.3s / 10.6s / 23.2s / 26.2s!)
    if (paw.curlWeight > 0.05) {
      this.drawBentCurledArm(ctx, paw, breath, paw.curlWeight);
    }

    // 3) Plump velvety poking / mouse-holding cat arm!
    const activeArmWeight = Math.max(0, 1 - paw.idleWeight - paw.curlWeight);
    if (activeArmWeight > 0.05) {
      const sh = this.getLiveShoulder(paw, breath);
      const px = paw.pos.x;
      const mouseClickDrop =
        paw.mode === 'mouse'
          ? Math.max(this.mouseLeftPress, this.mouseRightPress, this.mouseMiddlePress) * 1.8
          : 0;
      const py = paw.pos.y + mouseClickDrop;

      ctx.save();
      ctx.globalAlpha = Math.min(1, activeArmWeight * 1.2);

      for (const sm of paw.smears) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, sm.alpha * activeArmWeight);
        this.drawPlumpCatArm(ctx, paw.side, sm.sx, sm.sy, sm.px, sm.py, 0, false);
        ctx.restore();
      }

      // Keep mouse-reaching arm pure velvet black in open air (ORIG 2.2s); show subtle separation lines when poking across black torso!
      // The gripping paw is drawn slightly smaller so the L/R button plates stay visible.
      this.drawPlumpCatArm(
        ctx,
        paw.side,
        sh.x,
        sh.y,
        px,
        py,
        paw.impactSquash,
        paw.mode !== 'mouse',
        paw.mode === 'mouse' ? 0.78 : 1,
      );
      ctx.restore();
    }
  }

  private drawKeyBubbles(ctx: CanvasRenderingContext2D): void {
    const now = performance.now();

    for (const b of this.bubbles) {
      const age = now - b.createdAt;
      const t = Math.min(1, age / b.lifetime);

      let scale = 1;
      if (t < 0.11) {
        const p = t / 0.11;
        scale = 0.62 + Math.sin(p * Math.PI * 0.65) * 0.44;
      } else if (t > 0.76) {
        scale = 1 - ((t - 0.76) / 0.24) * 0.1;
      }
      const alpha = t < 0.72 ? 1 : Math.max(0, 1 - (t - 0.72) / 0.28);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.scale(scale, scale);

      ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
      const textW = ctx.measureText(b.label).width;
      const boxW = b.isSpace ? 40 : Math.max(24, textW + 13);
      const boxH = 24;
      const bx = -boxW / 2;
      const by = -boxH / 2;

      ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 2;

      ctx.fillStyle = '#c8cac6';
      this.roundRect(ctx, bx, by + 2.2, boxW, boxH, 5.5);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(38, 40, 46, 0.42)';
      ctx.lineWidth = 1.05;
      this.roundRect(ctx, bx, by, boxW, boxH - 1.3, 5.5);
      ctx.fill();
      ctx.stroke();

      if (b.isSpace) {
        ctx.strokeStyle = '#222429';
        ctx.lineWidth = 1.55;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-9, -1);
        ctx.lineTo(-9, 2.0);
        ctx.lineTo(9, 2.0);
        ctx.lineTo(9, -1);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#1e2025';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.label, 0, -0.5);
      }

      ctx.restore();
    }
  }

  private drawMouseBadges(ctx: CanvasRenderingContext2D): void {
    const now = performance.now();
    for (let i = 0; i < this.mouseBadges.length; i++) {
      const b = this.mouseBadges[i];
      const t = Math.min(1, (now - b.createdAt) / b.lifetime);
      let scale = 1;
      if (t < 0.14) {
        scale = 0.65 + Math.sin((t / 0.14) * Math.PI * 0.65) * 0.42;
      } else if (t > 0.72) {
        scale = 1 - ((t - 0.72) / 0.28) * 0.12;
      }
      const alpha = t < 0.68 ? 1 : Math.max(0, 1 - (t - 0.68) / 0.32);
      const liftY = t * 14 + (this.mouseBadges.length - 1 - i) * 18;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(b.x, b.y - liftY);
      ctx.scale(scale, scale);

      const boxW = 34;
      const boxH = 19;
      const bx = -boxW / 2;
      const by = -boxH / 2;

      ctx.shadowColor = 'rgba(0, 0, 0, 0.24)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1.5;

      ctx.fillStyle = '#22242a';
      this.roundRect(ctx, bx, by + 1.6, boxW, boxH, 5);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = b.color;
      ctx.strokeStyle = 'rgba(20, 22, 28, 0.45)';
      ctx.lineWidth = 1.0;
      this.roundRect(ctx, bx, by, boxW, boxH - 1.0, 5);
      ctx.fill();
      ctx.stroke();

      ctx.font = '800 9.5px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = b.label === 'RMB' && b.color === '#ff7b3b' ? '#ffffff' : '#14161a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, 0, -0.3);

      ctx.restore();
    }
  }

  private drawCustomCatBody(
    ctx: CanvasRenderingContext2D,
    s: ResolvedSkin,
    breath: number,
    purrShift: number,
  ): void {
    const leftPts: Vec2[] = [];
    const rightPts: Vec2[] = [];
    const bellySwell = 1 + this.typingHunch * 0.04;
    const headCenter = this.spinePoint(0.24, breath);
    const hcx = headCenter.x + purrShift;
    const hcy = headCenter.y;

    for (const slice of BODY_SLICES) {
      const sp = this.spinePoint(slice.t, breath);
      const widen = slice.t > 0.45 ? bellySwell : 1;
      const hw = slice.hw * widen;

      if (slice.t <= 0.38) {
        const tiltW = slice.t <= 0.30 ? 1.0 : (0.42 - slice.t) / 0.12;
        const ang = this.headTilt * tiltW;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const relY = sp.y - hcy;
        const lx0 = sp.x + purrShift - hw - hcx;
        const rx0 = sp.x + purrShift + hw - hcx;
        leftPts.push({ x: hcx + lx0 * cosA - relY * sinA, y: hcy + lx0 * sinA + relY * cosA });
        rightPts.push({ x: hcx + rx0 * cosA - relY * sinA, y: hcy + rx0 * sinA + relY * cosA });
      } else {
        leftPts.push({ x: sp.x + purrShift - hw, y: sp.y });
        rightPts.push({ x: sp.x + purrShift + hw, y: sp.y });
      }
    }

    const crownRelY = this.spinePoint(0.11, breath).y - hcy;
    const crownPt = {
      x: hcx - crownRelY * Math.sin(this.headTilt),
      y: hcy + crownRelY * Math.cos(this.headTilt),
    };
    const basePt = this.spinePoint(1.0, breath);

    ctx.save();
    ctx.shadowColor = s.isDarkBase ? 'rgba(18, 17, 18, 0.42)' : 'rgba(30, 32, 42, 0.22)';
    ctx.shadowBlur = s.isDarkBase ? 1.6 : 5;
    if (!s.isDarkBase) ctx.shadowOffsetY = 2;

    // 1) Grounded hind paws always rendered in seated posture (no idle disappear/blink; Fixes #1)
    ctx.fillStyle = s.pawColor;
    ctx.strokeStyle = s.pawOutlineColor || s.outlineColor || 'transparent';
    ctx.lineWidth = 1.85;
    for (const [fx, fy, rx, ry] of [
      [basePt.x - 42, basePt.y - 3, 14.5, 11.5],
      [basePt.x + 32, basePt.y - 1, 15.0, 11.5],
    ]) {
      ctx.beginPath();
      ctx.ellipse(fx, fy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      if (s.pawOutlineColor || s.outlineColor) {
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.stroke();
        ctx.restore();
      }
    }

    // 2) Unified flexible body path
    const traceBodyPath = () => {
      ctx.beginPath();
      const crownCos = Math.cos(this.headTilt);
      const crownSin = Math.sin(this.headTilt);
      ctx.moveTo(leftPts[0].x + 14 * crownCos + 6 * crownSin, leftPts[0].y + 14 * crownSin - 6 * crownCos);
      ctx.quadraticCurveTo(crownPt.x, crownPt.y - 2, rightPts[0].x - 14 * crownCos + 6 * crownSin, rightPts[0].y - 14 * crownSin - 6 * crownCos);
      ctx.lineTo(rightPts[0].x, rightPts[0].y);
      for (let i = 0; i < rightPts.length - 1; i++) {
        const p0 = rightPts[i];
        const p1 = rightPts[i + 1];
        ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) * 0.5, (p0.y + p1.y) * 0.5);
      }
      ctx.lineTo(rightPts[rightPts.length - 1].x, rightPts[rightPts.length - 1].y);
      ctx.quadraticCurveTo(basePt.x + purrShift, basePt.y + 6, leftPts[leftPts.length - 1].x, leftPts[leftPts.length - 1].y);
      for (let i = leftPts.length - 1; i > 0; i--) {
        const p0 = leftPts[i];
        const p1 = leftPts[i - 1];
        ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) * 0.5, (p0.y + p1.y) * 0.5);
      }
      ctx.lineTo(leftPts[0].x, leftPts[0].y);
      ctx.closePath();
    };

    traceBodyPath();
    const furGrad = ctx.createRadialGradient(hcx, hcy + 65, 18, basePt.x, basePt.y - 60, 150);
    furGrad.addColorStop(0.0, s.furColor);
    furGrad.addColorStop(1.0, s.furSecondaryColor);
    ctx.fillStyle = furGrad;
    ctx.fill();

    // 3) Clipped coat pattern markings & custom spots
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.clip();

    const midTorso = this.spinePoint(0.70, breath);
    const chestSp = this.spinePoint(0.56, breath);

    if (s.flankColor) {
      for (const sgn of [-1, 1]) {
        ctx.save();
        ctx.globalAlpha = 0.62;
        ctx.fillStyle = s.flankColor;
        ctx.shadowColor = s.flankColor;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.ellipse(midTorso.x + purrShift + sgn * 62, midTorso.y + 6, 48, 82, sgn * -0.14, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    if (s.bellyBibColor) {
      ctx.fillStyle = s.bellyBibColor;
      ctx.beginPath();
      ctx.ellipse(chestSp.x + purrShift, chestSp.y + 38, 36, 62, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (s.pattern === 'tabby' && s.stripeColor) {
      ctx.strokeStyle = s.stripeColor;
      ctx.lineCap = 'round';
      ctx.lineWidth = 4.6;
      ctx.globalAlpha = 0.65;
      for (const sgn of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const ty = midTorso.y - 26 + i * 20;
          ctx.beginPath();
          ctx.moveTo(midTorso.x + purrShift + sgn * 74, ty);
          ctx.quadraticCurveTo(midTorso.x + purrShift + sgn * 56, ty + 3, midTorso.x + purrShift + sgn * 42, ty + 7);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    if (s.pattern === 'calico') {
      const orangePatch = s.maskColor || '#ea9446';
      const darkPatch = s.calicoPatchColor || '#3c3634';
      ctx.save();
      ctx.shadowBlur = 4;
      ctx.shadowColor = orangePatch;
      ctx.fillStyle = orangePatch;
      ctx.beginPath();
      ctx.ellipse(midTorso.x + purrShift - 54, midTorso.y + 10, 38, 52, -0.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = darkPatch;
      ctx.fillStyle = darkPatch;
      ctx.beginPath();
      ctx.ellipse(midTorso.x + purrShift + 56, midTorso.y - 4, 36, 56, 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Body custom spots
    for (const spot of s.spots) {
      if (spot.part !== 'body') continue;
      ctx.save();
      ctx.globalAlpha = spot.opacity ?? 0.85;
      ctx.fillStyle = spot.color;
      ctx.beginPath();
      ctx.ellipse(
        midTorso.x + purrShift + spot.x * 65,
        midTorso.y + spot.y * 65,
        Math.max(2, spot.rx),
        Math.max(2, spot.ry),
        spot.rotation || 0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
    }

    // Head-space patterns (rotate seamlessly with headTilt!)
    ctx.save();
    ctx.translate(hcx, hcy);
    ctx.rotate(this.headTilt);
    const maskShift = this.faceTurnX * 0.72;

    if (s.pattern === 'bicolor' && s.maskColor) {
      ctx.save();
      ctx.fillStyle = s.maskColor;
      ctx.shadowColor = s.maskColor;
      ctx.shadowBlur = 4.5;
      ctx.beginPath();
      ctx.moveTo(-74, -44);
      ctx.lineTo(74, -44);
      ctx.lineTo(70, 20);
      ctx.quadraticCurveTo(maskShift + 42, 18, maskShift + 26, 9);
      ctx.quadraticCurveTo(maskShift + 17, 0, maskShift + 13.5, -13);
      ctx.quadraticCurveTo(maskShift + 7, -21.5, maskShift, -22.5);
      ctx.quadraticCurveTo(maskShift - 7, -21.5, maskShift - 13.5, -13);
      ctx.quadraticCurveTo(maskShift - 17, 0, maskShift - 26, 9);
      ctx.quadraticCurveTo(maskShift - 42, 18, -70, 20);
      ctx.closePath();
      ctx.fill();
      if (s.foreheadBridgeColor) {
        ctx.fillStyle = s.foreheadBridgeColor;
        ctx.shadowBlur = 5.5;
        ctx.beginPath();
        ctx.ellipse(maskShift, -32, 18, 9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (s.pattern === 'tuxedo' && s.bellyBibColor) {
      ctx.fillStyle = s.bellyBibColor;
      ctx.beginPath();
      ctx.ellipse(maskShift, 22, 26, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.pattern === 'siamese' && s.maskColor) {
      ctx.save();
      ctx.fillStyle = s.maskColor;
      ctx.shadowColor = s.maskColor;
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.ellipse(maskShift, 3, 42, 27, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (s.pattern === 'calico') {
      const orangePatch = s.maskColor || '#ea9446';
      const darkPatch = s.calicoPatchColor || '#3c3634';
      ctx.save();
      ctx.shadowBlur = 4;
      ctx.fillStyle = orangePatch;
      ctx.shadowColor = orangePatch;
      ctx.beginPath();
      ctx.ellipse(-34 + maskShift * 0.4, -18, 34, 28, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = darkPatch;
      ctx.shadowColor = darkPatch;
      ctx.beginPath();
      ctx.ellipse(36 + maskShift * 0.4, -16, 32, 26, 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (s.pattern === 'tabby' && s.stripeColor) {
      // Iconic tabby forehead "M" & cheek stripes!
      ctx.strokeStyle = s.stripeColor;
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.78;
      // Center M stripes on forehead
      ctx.beginPath();
      ctx.moveTo(maskShift - 11, -30);
      ctx.lineTo(maskShift - 8, -19);
      ctx.moveTo(maskShift, -32);
      ctx.lineTo(maskShift, -18);
      ctx.moveTo(maskShift + 11, -30);
      ctx.lineTo(maskShift + 8, -19);
      ctx.stroke();
      // Cheek tiger stripes
      ctx.lineWidth = 2.8;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sgn * 58, 6);
        ctx.lineTo(sgn * 42, 9);
        ctx.moveTo(sgn * 56, 14);
        ctx.lineTo(sgn * 41, 16);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Head custom spots
    for (const spot of s.spots) {
      if (spot.part !== 'head') continue;
      ctx.save();
      ctx.globalAlpha = spot.opacity ?? 0.85;
      ctx.fillStyle = spot.color;
      ctx.beginPath();
      ctx.ellipse(
        maskShift + spot.x * 52,
        spot.y * 36,
        Math.max(2, spot.rx),
        Math.max(2, spot.ry),
        spot.rotation || 0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
    }

    ctx.restore(); // end head-space patterns
    ctx.restore(); // end body clip

    if (s.outlineColor) {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      traceBodyPath();
      ctx.strokeStyle = s.outlineColor;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    }

    // 4) Ears, face features & eyes in head-space
    ctx.save();
    ctx.translate(hcx, hcy);
    ctx.rotate(this.headTilt);

    const lTwitch = Math.sin(this.earTwitchLeft * Math.PI) * 0.12;
    const rTwitch = Math.sin(this.earTwitchRight * Math.PI) * 0.12;

    const drawCustomEar = (sideSign: -1 | 1, twitch: number) => {
      ctx.save();
      const earTurn = sideSign < 0 ? this.earTurnLeft : this.earTurnRight;
      const back = this.earBack;
      ctx.translate(
        sideSign * (33 + back * 2.5) + this.faceTurnX * 0.18,
        -28 + back * 7,
      );
      ctx.rotate(sideSign * (0.08 + twitch + earTurn + back * 0.5));

      const earPath = () => {
        ctx.beginPath();
        ctx.moveTo(sideSign * 19, 20);
        ctx.bezierCurveTo(sideSign * 19, -8, sideSign * 12, -23, sideSign * 3, -21);
        ctx.bezierCurveTo(sideSign * -8, -18, sideSign * -16, -6, sideSign * -21, 8);
        ctx.closePath();
      };

      const baseEarCol =
        s.pattern === 'calico' && sideSign === -1
          ? s.maskColor || s.earOuterColor
          : s.earOuterColor;
      const earGrad = ctx.createLinearGradient(0, -23, 0, 18);
      earGrad.addColorStop(0.0, s.earTipColor || baseEarCol);
      earGrad.addColorStop(1.0, baseEarCol);
      ctx.fillStyle = earGrad;
      earPath();
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      if (s.outlineColor) {
        ctx.strokeStyle = s.outlineColor;
        ctx.lineWidth = 1.85;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sideSign * 19, 17);
        ctx.bezierCurveTo(sideSign * 19, -8, sideSign * 12, -23, sideSign * 3, -21);
        ctx.bezierCurveTo(sideSign * -8, -18, sideSign * -16, -6, sideSign * -19, 5);
        ctx.stroke();
      }

      if (s.earInnerColor) {
        ctx.fillStyle = s.earInnerColor;
        ctx.beginPath();
        ctx.moveTo(sideSign * 11, 10);
        ctx.bezierCurveTo(sideSign * 11, -3, sideSign * 7, -13, sideSign * 2, -11);
        ctx.bezierCurveTo(sideSign * -4, -9, sideSign * -9, -1, sideSign * -10, 8);
        ctx.closePath();
        ctx.fill();
      }

      if (s.earTuftColor) {
        ctx.strokeStyle = s.earTuftColor;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sideSign * -6, 6);
        ctx.quadraticCurveTo(sideSign * -1, 3, sideSign * 5, 6);
        ctx.moveTo(sideSign * -3, 10);
        ctx.quadraticCurveTo(sideSign * 2, 7.5, sideSign * 7, 10);
        ctx.stroke();
      }
      ctx.restore();
    };

    drawCustomEar(-1, lTwitch);
    drawCustomEar(1, rTwitch);

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    const wShift = this.faceTurnX * 0.72;

    // Blush on petting
    if (s.blushColor && this.squintAmount > 0.12) {
      ctx.save();
      ctx.globalAlpha = 0.42 * this.squintAmount;
      ctx.fillStyle = s.blushColor;
      ctx.beginPath();
      ctx.ellipse(wShift - 30, 13, 8.5, 4.6, -0.08, 0, Math.PI * 2);
      ctx.ellipse(wShift + 30, 13, 8.5, 4.6, 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Nose & mouth
    if (s.noseColor) {
      ctx.fillStyle = s.noseColor;
      ctx.beginPath();
      ctx.moveTo(wShift - 4.1, 9.6);
      ctx.quadraticCurveTo(wShift, 8.5, wShift + 4.1, 9.6);
      ctx.quadraticCurveTo(wShift + 3.2, 13.8, wShift, 14.3);
      ctx.quadraticCurveTo(wShift - 3.2, 13.8, wShift - 4.1, 9.6);
      ctx.closePath();
      ctx.fill();
    }
    if (s.mouthColor) {
      ctx.strokeStyle = s.mouthColor;
      ctx.lineWidth = 1.35;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(wShift - 5.8, 16.6);
      ctx.quadraticCurveTo(wShift - 2.9, 19.6, wShift, 16.4);
      ctx.quadraticCurveTo(wShift + 2.9, 19.6, wShift + 5.8, 16.6);
      ctx.stroke();
    }

    // Whiskers
    ctx.strokeStyle = s.whiskerColor;
    ctx.lineWidth = 1.1;
    ctx.lineCap = 'round';
    const leftLen = Math.max(8, 12 - this.faceTurnX * 0.55);
    const rightLen = Math.max(8, 12 + this.faceTurnX * 0.55);
    for (let i = 0; i < 3; i++) {
      const wy = 16 + i * 5.0;
      const slant = 2.0 + i * 1.1;
      ctx.beginPath();
      ctx.moveTo(-34 + wShift, wy);
      ctx.lineTo(-34 + wShift - leftLen, wy + slant);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(34 + wShift, wy);
      ctx.lineTo(34 + wShift + rightLen, wy + slant);
      ctx.stroke();
    }

    this.drawCustomEyes(ctx, s, wShift, -1);

    ctx.restore();
    ctx.restore();
  }

  private drawCustomEyes(ctx: CanvasRenderingContext2D, s: ResolvedSkin, cx: number, eyeY: number): void {
    const blinkVal = this.isBlinking ? 1 - Math.abs(this.blinkProgress - 1) : 0;
    const closedness = Math.max(blinkVal, this.squintAmount * 0.85, this.privacyClose);
    const eyeXs = [cx - 23.0, cx + 23.0];
    const rx = 14.8 + this.typingHunch * 1.0;
    const ry = 13.4 - this.typingHunch * 0.5;

    for (let idx = 0; idx < 2; idx++) {
      ctx.save();
      ctx.translate(eyeXs[idx], eyeY);

      if (this.eyeGlow > 0.02 && this.privacyClose < 0.45) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0, 0, rx * 0.4, 0, 0, rx * 1.7);
        g.addColorStop(0, `rgba(120, 240, 255, ${(0.55 * this.eyeGlow).toFixed(3)})`);
        g.addColorStop(1, 'rgba(120, 240, 255, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, rx * 1.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (this.privacyClose > 0.45) {
        ctx.strokeStyle = s.squintColor;
        ctx.lineWidth = 2.9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-13.5, -0.5);
        ctx.quadraticCurveTo(0, 5.2, 13.5, -0.5);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      if (this.squintAmount > 0.38 && blinkVal < 0.3) {
        if (s.squintGlowColor) {
          ctx.strokeStyle = s.squintGlowColor;
          ctx.lineWidth = 4.4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-12.5, 0.2);
          ctx.quadraticCurveTo(0, 2.2, 12.5, 1.8);
          ctx.stroke();
        }
        ctx.strokeStyle = s.squintColor;
        ctx.lineWidth = 2.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-13.5, -0.5);
        ctx.quadraticCurveTo(0, 1.4, 13.5, 1.2);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      const openRy = Math.max(1.2, ry * (1 - closedness));
      const curiousTilt = (idx === 0 ? -0.1 : 0.1) * (0.25 + this.typingHunch * 0.75);
      ctx.rotate(curiousTilt);
      // Clip the entire eye, including highlights and its rim, beneath a real lid.
      // The previously drawn fur shows through, so patterned skins stay seamless.
      clipAngryEyelid(ctx, rx, openRy, idx === 0 ? 1 : -1,
        this.fierce * (1 - Math.min(1, this.dizzy * 1.4)));

      const irisGrad = ctx.createLinearGradient(0, -openRy, 0, openRy);
      irisGrad.addColorStop(0.0, s.eyeColorTop);
      irisGrad.addColorStop(1.0, s.eyeColorBottom);
      ctx.fillStyle = irisGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, openRy, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.clip();
      if (openRy > 3.2) {
        const px = this.eyeLookX;
        const py = this.eyeLookY;
        // Same narrowing glare as the built-in cats.
        const fierce = this.fierce;
        ctx.fillStyle = s.pupilColor;
        ctx.beginPath();
        ctx.ellipse(
          px,
          py - fierce * 2.2,
          6.2 * (1 - fierce * 0.36),
          8.8 * (1 - fierce * 0.22),
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();

        // Dizzy spinning pupil ring, same as the built-in cats.
        if (this.dizzy > 0.25) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, (this.dizzy - 0.25) / 0.5);
          ctx.strokeStyle = '#ffd166';
          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';
          const spin = this.elapsed * 7.5;
          const pRx = 6.2 * (1 - fierce * 0.36);
          const pRy = 8.8 * (1 - fierce * 0.22);
          const rIn = Math.min(pRx, pRy) * 0.28;
          const rOut = Math.min(pRx, pRy) * 0.86;
          ctx.beginPath();
          for (let k = 0; k <= 26; k++) {
            const u = k / 26;
            const ang = spin + u * Math.PI * 2.6;
            const rad = rIn + u * (rOut - rIn);
            const sx = px + Math.cos(ang) * rad;
            const sy = py - fierce * 2.2 + Math.sin(ang) * rad;
            if (k === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          }
          ctx.stroke();
          ctx.restore();
        }

        if (s.eyeCatchlight) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
          ctx.beginPath();
          ctx.arc(px - 3.6, py - 4.0, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
          ctx.beginPath();
          ctx.arc(px + 3.2, py + 3.2, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      if (s.eyeRimColor && openRy > 2.2) {
        ctx.strokeStyle = s.eyeRimColor;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, openRy, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  private drawCustomPlumpArm(
    ctx: CanvasRenderingContext2D,
    s: ResolvedSkin,
    side: 'left' | 'right',
    sx: number,
    sy: number,
    px: number,
    py: number,
    squash: number,
    withCrease: boolean,
    pawScale = 1,
  ): void {
    const dx = px - sx;
    const dy = py - sy;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const wristDist = Math.max(6, len - 8);
    const wx = sx + ux * wristDist;
    const wy = sy + uy * wristDist;
    const rShoulder = 14.2;
    const rWrist = 9.4;
    const pawRx = 14.5 * (1 + squash * 0.14) * pawScale;
    const pawRy = 11.8 * (1 - squash * 0.12) * pawScale;

    ctx.save();
    const traceArmPath = () => {
      ctx.beginPath();
      ctx.moveTo(sx + nx * rShoulder, sy + ny * rShoulder);
      ctx.quadraticCurveTo(
        (sx + wx) * 0.5 + nx * (rShoulder * 0.84),
        (sy + wy) * 0.5 + ny * (rShoulder * 0.84),
        wx + nx * rWrist,
        wy + ny * rWrist,
      );
      ctx.lineTo(wx - nx * rWrist, wy - ny * rWrist);
      ctx.quadraticCurveTo(
        (sx + wx) * 0.5 - nx * (rShoulder * 0.84),
        (sy + wy) * 0.5 - ny * (rShoulder * 0.84),
        sx - nx * rShoulder,
        sy - ny * rShoulder,
      );
      ctx.closePath();
    };

    ctx.fillStyle = s.armColor;
    traceArmPath();
    ctx.fill();

    ctx.beginPath();
    ctx.arc(sx, sy, rShoulder, 0, Math.PI * 2);
    ctx.fill();

    // Custom arm spots
    const armPart = side === 'left' ? 'leftArm' : 'rightArm';
    const armSpots = s.spots.filter((sp) => sp.part === armPart);
    if (armSpots.length > 0 && len > 24) {
      const armAng = Math.atan2(dy, dx);
      ctx.save();
      traceArmPath();
      ctx.clip();
      for (const sp of armSpots) {
        const frac = Math.max(0.1, Math.min(0.9, sp.x));
        ctx.globalAlpha = sp.opacity ?? 0.85;
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.ellipse(
          sx + ux * (len * frac) + nx * sp.y,
          sy + uy * (len * frac) + ny * sp.y,
          Math.max(2, sp.rx),
          Math.max(2, sp.ry),
          armAng + (sp.rotation || 0),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.restore();
    }

    // Mitten paw ball
    ctx.save();
    if (!s.isDarkBase) {
      ctx.shadowColor = 'rgba(36, 32, 30, 0.22)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1.5;
    }
    ctx.fillStyle = s.pawColor;
    ctx.beginPath();
    ctx.ellipse(px, py, pawRx, pawRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const edgeColor = s.pawOutlineColor || s.outlineColor;
    if (edgeColor) {
      ctx.lineWidth = 1.65;
      ctx.lineCap = 'round';
      for (const sgn of [-1, 1]) {
        const startFrac = withCrease ? 0.16 : 0.08;
        const esx = sx + ux * (len * startFrac) + nx * sgn * (rShoulder * (1 - startFrac * 0.16));
        const esy = sy + uy * (len * startFrac) + ny * sgn * (rShoulder * (1 - startFrac * 0.16));
        ctx.strokeStyle = edgeColor;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(esx, esy);
        ctx.quadraticCurveTo(
          (sx + wx) * 0.5 + nx * sgn * (rShoulder * 0.84),
          (sy + wy) * 0.5 + ny * sgn * (rShoulder * 0.84),
          wx + nx * sgn * rWrist,
          wy + ny * sgn * rWrist,
        );
        ctx.stroke();
      }
      const pawAng = Math.atan2(dy, dx);
      ctx.globalAlpha = 0.92;
      ctx.strokeStyle = edgeColor;
      ctx.beginPath();
      ctx.ellipse(px, py, pawRx, pawRy, 0, pawAng - Math.PI * 0.62, pawAng + Math.PI * 0.62);
      ctx.stroke();
    } else if (s.armCreaseColor && withCrease && len > 28) {
      for (const sgn of [-1, 1]) {
        const csx = sx + ux * (len * 0.18) + nx * sgn * (rShoulder * 0.86);
        const csy = sy + uy * (len * 0.18) + ny * sgn * (rShoulder * 0.86);
        const cex = sx + ux * (len * 0.72) + nx * sgn * (rWrist * 1.02);
        const cey = sy + uy * (len * 0.72) + ny * sgn * (rWrist * 1.02);
        ctx.strokeStyle = s.armCreaseColor;
        ctx.lineWidth = 1.3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(csx, csy);
        ctx.lineTo(cex, cey);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private drawCustomBentArm(
    ctx: CanvasRenderingContext2D,
    s: ResolvedSkin,
    paw: PawState,
    breath: number,
    alpha: number,
  ): void {
    const sh = this.getLiveShoulder(paw, breath);
    const cp = this.getLiveCurledPawPos(paw, breath);
    const sign = paw.side === 'left' ? -1 : 1;
    const elbowX = sh.x + sign * 8;
    const elbowY = cp.y + 8;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = s.armColor;
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.quadraticCurveTo(elbowX, elbowY, cp.x, cp.y);
    ctx.stroke();

    const armPart = paw.side === 'left' ? 'leftArm' : 'rightArm';
    for (const sp of s.spots) {
      if (sp.part !== armPart) continue;
      ctx.save();
      ctx.globalAlpha = alpha * (sp.opacity ?? 0.82);
      ctx.fillStyle = sp.color;
      ctx.beginPath();
      ctx.ellipse((elbowX + cp.x) * 0.5, (elbowY + cp.y) * 0.5, Math.min(8, sp.rx), Math.min(6, sp.ry), -0.3 * sign, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = s.pawColor;
    ctx.beginPath();
    ctx.ellipse(cp.x, cp.y, 12.5, 11.0, sign * 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = s.pawOutlineColor || s.legLineColor;
    ctx.lineWidth = 1.55;
    ctx.beginPath();
    ctx.moveTo(elbowX + sign * 8, elbowY - 16);
    ctx.quadraticCurveTo(elbowX + sign * 4, elbowY + 12, cp.x + sign * 2, cp.y + 10);
    ctx.quadraticCurveTo(cp.x - sign * 11, cp.y + 8, cp.x - sign * 12, cp.y - 4);
    ctx.stroke();
    ctx.restore();
  }

  private drawCustomIdleLegDetails(
    ctx: CanvasRenderingContext2D,
    s: ResolvedSkin,
    paw: PawState,
    topSp: Vec2,
    midSp: Vec2,
    botSp: Vec2,
    sign: -1 | 1,
    outerTopX: number,
    outerBotX: number,
    innerTopX: number,
    innerBotX: number,
  ): void {
    const armPart = paw.side === 'left' ? 'leftArm' : 'rightArm';
    for (const sp of s.spots) {
      if (sp.part !== armPart) continue;
      ctx.save();
      ctx.globalAlpha = sp.opacity ?? 0.82;
      ctx.fillStyle = sp.color;
      ctx.beginPath();
      ctx.ellipse(midSp.x + sign * 21, midSp.y + (sp.x - 0.5) * 28, Math.max(3, sp.rx * 0.8), Math.max(3, sp.ry * 1.1), 0.2 * sign, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Optional cute white mittens at the bottom of idle seated legs when pawColor differs from furColor!
    if (s.pawColor !== s.furColor) {
      ctx.save();
      ctx.fillStyle = s.pawColor;
      ctx.beginPath();
      ctx.ellipse(botSp.x + sign * 22, botSp.y - 4, 13.5, 9.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.strokeStyle = s.legLineColor;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(outerTopX, topSp.y);
    ctx.quadraticCurveTo(midSp.x + sign * 41, midSp.y, outerBotX, botSp.y - 1);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(innerTopX, topSp.y + 10);
    ctx.lineTo(innerBotX, botSp.y - 1);
    ctx.stroke();
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  private trapezoidPath(
    ctx: CanvasRenderingContext2D,
    topHalfW: number,
    botHalfW: number,
    topY: number,
    botY: number,
    r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(-topHalfW + r, topY);
    ctx.lineTo(topHalfW - r, topY);
    ctx.quadraticCurveTo(topHalfW, topY, topHalfW + 1, topY + r);
    ctx.lineTo(botHalfW, botY - r);
    ctx.quadraticCurveTo(botHalfW, botY, botHalfW - r, botY);
    ctx.lineTo(-botHalfW + r, botY);
    ctx.quadraticCurveTo(-botHalfW, botY, -botHalfW, botY - r);
    ctx.lineTo(-topHalfW - 1, topY + r);
    ctx.quadraticCurveTo(-topHalfW, topY, -topHalfW + r, topY);
    ctx.closePath();
  }
}
