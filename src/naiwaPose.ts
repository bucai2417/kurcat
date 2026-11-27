/** Renderer-independent, normalized frog pose. Distances are fractions of body height.
 * Future 3D rigs can retarget these channels; this does not implement a 3D adapter.
 * Feet use absolute targets (never accumulate offsets over successive frames).
 */
export type FrogAction = 'frogHop' | 'frogCroak' | 'bellyPat' | 'frogSway' | 'frogPeek' | 'footSwing';
export interface FrogPoint { x: number; y: number }
export interface NaiwaPoseInput {
  kind: string | null;
  progress: number;
  seconds: number;
  anger: number;
  petting: number;
  typing: number;
  groove: number;
  excitement: number;
  stomp: number;
  stompLift: number;
  drinking: boolean;
  privacy: boolean;
}
export interface NaiwaPose {
  lift: number;
  squash: number;
  lean: number;
  tilt: number;
  lids: number;
  cheeks: number;
  mouthOpen: number;
  bellyPat: number;
  /** Weight of seated dozing; feet stay planted and the body never folds flat. */
  sleep: number;
  /** Mouth-corner saliva grows only after the eyes have closed. */
  drool: number;
  /** Eye lead for curiosity gestures; the body follows a little later. */
  gaze: number;
  hands: { left: FrogPoint; right: FrogPoint };
  feet: { left: FrogPoint; right: FrogPoint };
}
export const FROG_ACTIONS: readonly FrogAction[] = ['frogHop', 'frogCroak', 'bellyPat', 'frogSway', 'frogPeek', 'footSwing'];
export const FROG_DURATIONS: Record<FrogAction, number> = { frogHop: 1.65, frogCroak: 2.1, bellyPat: 2.6, frogSway: 5.2, frogPeek: 3.8, footSwing: 4.4 };
const clamp = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
export function sampleNaiwaPose(input: NaiwaPoseInput): NaiwaPose {
  const t = clamp(input.progress);
  const envelope = smooth(t / 0.16) * smooth((1 - t) / 0.18);
  const p: NaiwaPose = {
    lift: 0, squash: 0, lean: 0, tilt: 0, lids: 0, cheeks: 0, mouthOpen: 0, bellyPat: 0, sleep: 0, drool: 0, gaze: 0,
    hands: { left: { x: -0.26, y: 0.075 }, right: { x: 0.26, y: 0.075 } },
    feet: { left: { x: -0.30, y: 0.015 }, right: { x: 0.30, y: 0.015 } },
  };
  if (input.privacy) { p.lids = 1; return p; }
  // Seated: folded hind feet make tiny ankle movements; hands rest toward the keys.
  const sway = input.kind === 'nap' || input.drinking ? 0 : 1 - envelope * (input.kind ? 1 : 0);
  for (const side of ['left', 'right'] as const) {
    const sign = side === 'left' ? -1 : 1;
    const swing = Math.sin(input.seconds * 2.0 + sign * 0.7);
    p.feet[side].x += swing * 0.010 * sway;
    p.feet[side].y -= (1 + Math.cos(input.seconds * 2.0 + sign * 0.7)) * 0.003 * sway;
  }
  const hand = (side: 'left' | 'right', x: number, y: number, weight = envelope) => {
    p.hands[side].x += (x - p.hands[side].x) * weight;
    p.hands[side].y += (y - p.hands[side].y) * weight;
  };
  if (!input.drinking) switch (input.kind) {
    case 'frogHop': {
      // Anticipation -> quick push -> airborne arc -> weighted landing -> settle.
      const crouch = Math.sin(Math.PI * clamp(t / 0.28));
      const air = Math.sin(Math.PI * clamp((t - 0.26) / 0.43));
      const land = Math.sin(Math.PI * clamp((t - 0.69) / 0.24));
      p.squash = 0.11 * crouch + 0.13 * land - 0.035 * air;
      p.lift = 0.15 * air;
      p.feet.left.y = p.feet.right.y = 0.015 - air * 0.05;
      hand('left', -0.18, -0.22 - air * 0.09);
      hand('right', 0.18, -0.22 - air * 0.09);
      p.lids = 0.24 * land;
      break;
    }
    case 'frogCroak':
      p.cheeks = Math.pow(Math.sin(t * Math.PI * 3), 2) * envelope;
      p.mouthOpen = p.cheeks * 0.8; p.squash = -p.cheeks * 0.015;
      break;
    case 'bellyPat':
      p.bellyPat = Math.pow(Math.sin(t * Math.PI * 6), 6) * envelope;
      hand('left', -0.105, -0.23 - p.bellyPat * 0.025);
      hand('right', 0.105, -0.23 - p.bellyPat * 0.025);
      p.squash = p.bellyPat * 0.025; p.lids = envelope * 0.25;
      break;
    case 'frogSway': {
      // Pause over each hip; always pass through neutral before changing sides.
      const shift = smooth(t / .18) - 2 * smooth((t - .36) / .28) + smooth((t - .82) / .18);
      p.lean = shift * .09;
      p.tilt = -shift * .035;
      p.squash = Math.abs(shift) * .012;
      p.gaze = -shift * .28;
      break;
    }
    case 'frogPeek': {
      const peek = smooth(t / .30) * smooth((1 - t) / .25);
      p.gaze = .65 * smooth(t / .15) * smooth((1 - t) / .20);
      p.lean = -.055 * peek; p.tilt = .10 * peek;
      p.lift = .018 * peek;
      p.lids = .65 * Math.pow(Math.sin(Math.PI * clamp((t - .52) / .18)), 2);
      break;
    }
    case 'footSwing': {
      const swing = Math.sin(t * Math.PI * 4) * envelope;
      p.lean = -swing * .025;
      p.feet.left.x -= swing * .024; p.feet.right.x += swing * .024;
      p.feet.left.y -= Math.max(0, swing) * .035;
      p.feet.right.y -= Math.max(0, -swing) * .035;
      p.lids = envelope * .22;
      break;
    }
    case 'wave':
      hand('right', 0.23 + Math.sin(t * Math.PI * 8) * 0.035, -0.70);
      p.tilt = -0.07 * envelope; break;
    case 'stretch':
      hand('left', -0.23, -0.88); hand('right', 0.23, -0.88);
      p.squash = -0.04 * envelope; p.lids = envelope * 0.65; break;
    case 'groom': {
      const swap = smooth((t - 0.30) / 0.40);
      const y = -0.65 + Math.sin(t * Math.PI * 12) * 0.014;
      hand('left', -0.06, y, envelope * (1 - swap));
      hand('right', 0.06, y, envelope * swap);
      p.lids = 0.65 * envelope; break;
    }
    case 'cuddle':
      hand('left', -0.12, -0.25); hand('right', 0.12, -0.25);
      p.lean = Math.sin(t * Math.PI * 2) * envelope * 0.055;
      p.lids = envelope * 0.65; break;
    case 'tilt': p.tilt = 0.14 * envelope; break;
    case 'slowBlink': p.lids = Math.pow(Math.sin(t * Math.PI), 2); break;
    case 'nap': {
      // Keep the seated silhouette and floor contacts. A slow nod accompanies
      // breathing; drool starts after settling and retracts before waking.
      p.sleep = smooth(t / .22) * smooth((1 - t) / .20);
      p.lids = smooth(t / .13) * smooth((1 - t) / .12);
      p.drool = smooth((t - .20) / .16) * smooth((.94 - t) / .18);
      p.squash = p.sleep * (.012 + .008 * (1 + Math.sin(input.seconds * 1.5)));
      p.lean = Math.sin(input.seconds * .85) * p.sleep * .018;
      hand('left', -.25, .065, p.sleep);
      hand('right', .25, .065, p.sleep);
      break;
    }
  }
  if (!input.drinking && !input.kind) {
    p.lean += Math.sin(input.seconds * 7) * clamp(input.groove) * 0.045;
    p.squash += Math.sin(input.seconds * 11) * clamp(input.excitement) * 0.016;
    p.cheeks = clamp(input.anger) * 0.7;
    p.lids = Math.max(clamp(input.anger) * 0.48, clamp(input.petting) * 0.8, clamp(input.typing) * 0.18);
  }
  // Wake-up tantrum is a separate state, NOT an idle action named tailGround.
  const stomp = clamp(input.stomp);
  if (stomp > 0) {
    p.lids = Math.max(p.lids, stomp * 0.48);
    p.cheeks = Math.max(p.cheeks, stomp * 0.85);
    p.feet.left.y = p.feet.right.y = 0.015 - clamp(input.stompLift) * stomp * 0.085;
    p.squash += (1 - clamp(input.stompLift)) * stomp * 0.035;
  }
  return p;
}
