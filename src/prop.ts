export type PropKind = 'cola' | 'coffee' | 'boba' | 'energy' | 'pudding';
export type PropSide = 'left' | 'right' | 'auto';

export interface PropConfig {
  enabled: boolean;
  kind: PropKind;
  side: PropSide;
  autoSip: boolean;
  /** Seconds between automatic sips, inclusive range. */
  sipIntervalMin: number;
  sipIntervalMax: number;
}

export type PropMood = 'jittery' | 'content' | 'burp' | 'hyper' | 'bliss';

export const PROP_KINDS: Array<{
  id: PropKind;
  label: string;
  emoji: string;
  /** What the cat does after drinking. */
  mood: PropMood;
  moodLabel: string;
}> = [
  { id: 'cola', label: '可乐', emoji: '🥤', mood: 'burp', moodLabel: '打嗝冒泡' },
  { id: 'coffee', label: '咖啡', emoji: '☕', mood: 'jittery', moodLabel: '尾巴快摆' },
  { id: 'boba', label: '奶茶', emoji: '🧋', mood: 'content', moodLabel: '满足摇摆' },
  { id: 'energy', label: '能量饮', emoji: '⚡', mood: 'hyper', moodLabel: '眼睛发亮' },
  { id: 'pudding', label: '布丁', emoji: '🍮', mood: 'bliss', moodLabel: '眯眼腮红' },
];

export const PROP_SIDES: Array<{ id: PropSide; label: string }> = [
  { id: 'right', label: '右侧' },
  { id: 'left', label: '左侧' },
  { id: 'auto', label: '自动（避开鼠标）' },
];

export const DEFAULT_PROP: PropConfig = {
  enabled: false,
  kind: 'coffee',
  side: 'right',
  autoSip: true,
  sipIntervalMin: 45,
  sipIntervalMax: 110,
};

/** Mood that a given drink produces once it is finished. */
export function moodForKind(kind: PropKind | null): PropMood | null {
  if (!kind) return null;
  return PROP_KINDS.find((k) => k.id === kind)?.mood ?? null;
}

export function normalizePropConfig(raw: unknown): PropConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<PropConfig>;
  const kinds = PROP_KINDS.map((k) => k.id);
  const sides = PROP_SIDES.map((s) => s.id);
  const num = (v: unknown, def: number, min: number, max: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
  const min = num(src.sipIntervalMin, DEFAULT_PROP.sipIntervalMin, 10, 600);
  const max = num(src.sipIntervalMax, DEFAULT_PROP.sipIntervalMax, min, 900);
  return {
    enabled: typeof src.enabled === 'boolean' ? src.enabled : DEFAULT_PROP.enabled,
    kind: kinds.includes(src.kind as PropKind) ? (src.kind as PropKind) : DEFAULT_PROP.kind,
    side: sides.includes(src.side as PropSide) ? (src.side as PropSide) : DEFAULT_PROP.side,
    autoSip: typeof src.autoSip === 'boolean' ? src.autoSip : DEFAULT_PROP.autoSip,
    sipIntervalMin: min,
    sipIntervalMax: max,
  };
}

export type PropPhase = 'rest' | 'reach' | 'lift' | 'sip' | 'return';

/** Seconds per phase; drives both the cup motion and the arm reach. */
export const PROP_PHASE_DURATION: Record<Exclude<PropPhase, 'rest'>, number> = {
  reach: 0.42,
  lift: 0.34,
  sip: 0.8,
  return: 0.36,
};

/**
 * Drink state machine driving the cat's "grab the cup and sip" animation.
 *
 * reach  : paw travels to the cup (cup still on the desk)
 * lift   : cup is raised to the mouth
 * sip    : cup tilts, liquid drops, mood fires
 * return : cup goes back down and the paw lets go
 */
export class PropDrinker {
  public level = 1;
  public phase: PropPhase = 'rest';
  private phaseT = 0;
  private nextSipIn = 0;
  private pendingMood: PropKind | null = null;
  private moodT = 0;

  constructor(private readonly rng: () => number = Math.random) {
    this.nextSipIn = this.rollInterval(DEFAULT_PROP);
  }

  private rollInterval(cfg: PropConfig): number {
    const { sipIntervalMin: a, sipIntervalMax: b } = cfg;
    return a + this.rng() * Math.max(0, b - a);
  }

  reset(cfg: PropConfig): void {
    this.phase = 'rest';
    this.phaseT = 0;
    this.nextSipIn = this.rollInterval(cfg);
  }

  refill(): void {
    this.level = 1;
  }

  private get duration(): number {
    if (this.phase === 'rest') return 1;
    return PROP_PHASE_DURATION[this.phase];
  }

  /** 0..1 progress of the current phase, for easing. */
  get phaseProgress(): number {
    return Math.min(1, this.phaseT / this.duration);
  }

  get drinking(): boolean {
    return this.phase !== 'rest';
  }

  get moodActive(): boolean {
    return this.moodT > 0;
  }

  get lastMood(): PropKind | null {
    return this.pendingMood;
  }

  /** Remaining cooldown seconds, for the menu hint. */
  get cooldownLeft(): number {
    return Math.max(0, this.nextSipIn);
  }

  startSip(): boolean {
    if (this.phase !== 'rest') return false;
    if (this.level <= 0.02) return false;
    this.phase = 'reach';
    this.phaseT = 0;
    return true;
  }

  /**
   * @param idleSec seconds since the last user input
   * @returns true when this tick consumed a sip of the drink
   */
  update(dt: number, idleSec: number, cfg: PropConfig): boolean {
    if (this.moodT > 0) this.moodT = Math.max(0, this.moodT - dt);
    let drank = false;

    if (this.phase === 'rest') {
      if (!cfg.enabled || !cfg.autoSip) return false;
      // Only drink when the user has actually stepped away.
      if (idleSec < 20) {
        this.nextSipIn = Math.max(this.nextSipIn, 6);
        return false;
      }
      this.nextSipIn -= dt;
      if (this.nextSipIn <= 0) {
        if (this.level <= 0.02) {
          this.nextSipIn = this.rollInterval(cfg);
        } else if (this.startSip()) {
          return false;
        }
      }
      return false;
    }

    this.phaseT += dt;
    if (this.phaseT < this.duration) return false;

    // Phase finished: advance the chain.
    this.phaseT = 0;
    switch (this.phase) {
      case 'reach':
        this.phase = 'lift';
        break;
      case 'lift':
        this.phase = 'sip';
        break;
      case 'sip':
        this.level = Math.max(0, this.level - 0.1);
        drank = true;
        this.pendingMood = cfg.kind;
        this.moodT = 3.2;
        this.phase = 'return';
        break;
      default:
        this.phase = 'rest';
        this.nextSipIn = this.rollInterval(cfg);
        break;
    }
    return drank;
  }
}
