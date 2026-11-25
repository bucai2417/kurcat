import type { PropKind } from './prop';

export type ReactionMark = 'heart' | 'note' | 'spark' | 'bubble';
export type TypingMood = 'focus' | 'groove' | 'excited' | 'grumpy';
export interface ReactionPose {
  lean: number; squash: number; pitch: number; yaw: number; roll: number;
  squint: number; shine: number; ears: number; tail: number;
  paw: 'none' | 'cheek' | 'pump'; amount: number; mark: ReactionMark | null;
}
export const neutralReaction = (): ReactionPose => ({ lean: 0, squash: 0, pitch: 0, yaw: 0,
  roll: 0, squint: 0, shine: 0, ears: 0, tail: 0, paw: 'none', amount: 0, mark: null });
const smooth = (x: number) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };

/** Shared cadence for both renderers. It observes input; it never creates keystrokes. */
export class TypingReactions {
  kind: TypingMood | null = null;
  amount = 0;
  private hotTime = 0;
  private age = 0;
  private next = 0;
  private gap = 0;
  private phase = 0;

  reset(): void {
    this.kind = null; this.amount = 0; this.hotTime = 0; this.age = 0; this.gap = 0;
  }

  update(dt: number, cps: number, fresh: boolean, enabled: boolean): ReactionPose {
    if (!enabled) { this.reset(); return neutralReaction(); }
    const hot = fresh && cps >= 3;
    this.gap = hot ? 0 : this.gap + dt;
    this.hotTime = hot ? this.hotTime + dt : Math.max(0, this.hotTime - dt * 2);
    if (!this.kind && this.hotTime >= 2.1) {
      const moods: TypingMood[] = ['focus', 'groove', 'excited', 'grumpy'];
      this.kind = moods[this.next++ % moods.length];
      this.age = 0;
    }
    this.age += dt;
    this.phase += dt * (this.kind === 'excited' ? 10 : 6.5);
    const target = this.kind && hot && this.age < 4.4 ? 1 : 0;
    this.amount += (target - this.amount) * (1 - Math.exp(-dt * (target ? 7 : 13)));
    if (this.kind && (this.age >= 4.9 || this.gap > 0.6)) {
      this.kind = null; this.amount = 0; this.hotTime = 0;
    }
    const p = neutralReaction(), a = this.amount;
    p.amount = a;
    if (this.kind === 'focus') {
      p.pitch = 0.10 * a; p.squint = 0.23 * a; p.ears = 0.13 * a;
      p.yaw = Math.sin(this.phase * 0.3) * 0.06 * a;
    } else if (this.kind === 'groove') {
      p.lean = Math.sin(this.phase) * 0.09 * a;
      p.roll = Math.sin(this.phase - 0.5) * 0.13 * a;
      p.pitch = Math.cos(this.phase * 2) * 0.035 * a;
      p.tail = 0.5 * a; p.mark = 'note';
    } else if (this.kind === 'excited') {
      p.squash = Math.sin(this.phase) * 0.035 * a; p.pitch = -0.06 * a;
      p.shine = a; p.ears = 0.22 * a; p.tail = 0.7 * a; p.mark = 'spark';
    }
    return p;
  }
}

export const PROP_REACTION_DURATION = 3.6;
/** Curves begin after the cup is safely back on the desk. */
export function propReactionPose(kind: PropKind | null, age: number): ReactionPose {
  const p = neutralReaction();
  if (!kind || age < 0 || age >= PROP_REACTION_DURATION) return p;
  const a = smooth(age / 0.28) * smooth((PROP_REACTION_DURATION - age) / 0.7);
  p.amount = a;
  if (kind === 'coffee') {
    p.pitch = -0.12 * a; p.yaw = Math.sin(age * 3.5) * 0.13 * a;
    p.ears = 0.26 * a; p.shine = 0.65 * a; p.tail = 0.55 * a; p.mark = 'spark';
  } else if (kind === 'boba') {
    p.roll = Math.sin(age * 3.2) * 0.15 * a; p.lean = Math.sin(age * 3.2) * 0.07 * a;
    p.squint = 0.65 * a; p.tail = 0.25 * a; p.mark = 'heart';
  } else if (kind === 'cola') {
    const burp = Math.exp(-Math.pow((age - 1.0) / 0.13, 2));
    p.squash = (0.045 * Math.sin(Math.min(age, 1) * Math.PI) - burp * 0.07) * a;
    p.pitch = -0.18 * burp * a; p.roll = Math.sin(age * 8) * 0.025 * a;
    p.squint = 0.35 * burp; p.mark = 'bubble';
  } else if (kind === 'energy') {
    p.squash = Math.sin(age * 10) * 0.035 * a; p.pitch = -0.07 * a;
    p.ears = 0.3 * a; p.shine = a; p.tail = 0.85 * a;
    p.paw = 'pump'; p.mark = 'spark';
  } else if (kind === 'pudding') {
    p.pitch = 0.07 * a; p.roll = Math.sin(age * 4) * 0.10 * a;
    p.squint = 0.8 * a; p.paw = 'cheek'; p.mark = 'heart';
  }
  return p;
}

/** Code-drawn marks keep 2D/3D consistent without textures or font-dependent emoji. */
export function drawReactionMark(ctx: CanvasRenderingContext2D, kind: ReactionMark,
  x: number, y: number, size: number): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 64, size / 64);
  ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  if (kind === 'heart') {
    ctx.moveTo(0, 22); ctx.bezierCurveTo(-42, -2, -24, -34, 0, -15);
    ctx.bezierCurveTo(24, -34, 42, -2, 0, 22); ctx.fillStyle = '#ff92b0'; ctx.fill();
  } else if (kind === 'note') {
    ctx.fillStyle = '#9dded0'; ctx.ellipse(-12, 15, 10, 7, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#9dded0'; ctx.moveTo(-3, 14); ctx.lineTo(-3, -24); ctx.lineTo(17, -17); ctx.stroke();
  } else if (kind === 'spark') {
    ctx.moveTo(0, -28); ctx.lineTo(8, -8); ctx.lineTo(28, 0); ctx.lineTo(8, 8);
    ctx.lineTo(0, 28); ctx.lineTo(-8, 8); ctx.lineTo(-28, 0); ctx.lineTo(-8, -8);
    ctx.closePath(); ctx.fillStyle = '#ffe3a0'; ctx.fill();
  } else {
    ctx.strokeStyle = '#a5deed'; ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(-3, -3, 13, 3.5, 4.7); ctx.strokeStyle = '#f0fbff'; ctx.stroke();
  }
  ctx.restore();
}
