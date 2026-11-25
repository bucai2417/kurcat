/** Shared seconds-based state: input never extends a wake-up tantrum. */
export class SleepReaction {
  private started = -Infinity;
  private until = -Infinity;
  private settled = -Infinity;
  private lastImpact = -1;
  private fading = false;
  private fadeFrom = 1;
  amount = 0;
  active(now: number): boolean { return now < this.until; }
  visible(now: number): boolean { return this.active(now) || now - this.settled < 0.28; }
  start(now: number, random = Math.random): boolean {
    if (this.visible(now)) return false;
    this.started = now;
    this.until = now + 2 + Math.max(0, Math.min(1, random())) * 3;
    this.settled = -Infinity;
    this.lastImpact = -1;
    this.fading = false;
    return true;
  }
  calm(now: number): boolean {
    if (!this.active(now)) return false;
    this.fadeFrom = this.sample(now).amount;
    this.until = now;
    this.settled = now;
    this.fading = true;
    return true;
  }
  reset(): void {
    this.started = this.until = this.settled = -Infinity;
    this.amount = 0; this.lastImpact = -1; this.fading = false;
  }
  sample(now: number): { amount: number; lift: number; impact: boolean; settled: boolean } {
    const active = this.active(now);
    const settled = !active && !this.fading && Number.isFinite(this.until);
    if (settled) { this.settled = this.until; this.fading = true; this.fadeFrom = 1; }
    const age = Math.max(0, now - this.started);
    this.amount = active ? Math.min(1, age / 0.13) : this.fadeFrom * Math.max(0, 1 - (now - this.settled) / 0.28);
    if (!Number.isFinite(this.amount)) this.amount = 0;
    const cycle = Math.floor(age / 0.68);
    const phase = age / 0.68 - cycle;
    // Slow anticipation, fast downstroke, small recoil; the tip never enters the floor.
    const lift = phase < 0.44 ? 0.18 + 0.82 * Math.sin(phase / 0.44 * Math.PI / 2)
      : phase < 0.58 ? 1 - ((phase - 0.44) / 0.14) ** 2
      : phase < 0.72 ? 0 : 0.18 * Math.sin((phase - 0.72) / 0.28 * Math.PI / 2);
    const hit = Math.floor((age - 0.68 * 0.58) / 0.68);
    const impact = active && hit >= 0 && hit > this.lastImpact;
    if (impact) this.lastImpact = hit;
    return { amount: this.amount, lift: impact ? 0 : Number.isFinite(lift) ? Math.max(0, lift) : 0, impact, settled };
  }
}

/** Outlined, high contrast captions share artwork in Canvas and 3D sprites. */
export function drawPetCaption(ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  fontSize = 15, angry = false): void {
  ctx.save();
  ctx.font = '700 ' + fontSize + 'px "Microsoft YaHei", "PingFang SC", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + fontSize * 1.4;
  const h = fontSize * 1.9;
  ctx.fillStyle = angry ? '#fff0dd' : '#f6fff2';
  ctx.strokeStyle = '#282431'; ctx.lineWidth = Math.max(1.5, fontSize * 0.11);
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, fontSize * 0.5);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = angry ? '#8f251e' : '#244131';
  ctx.fillText(text, x, y + fontSize * 0.03); ctx.restore();
}
