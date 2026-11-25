/** Keep the desktop pet anchored while the native window grows for its menu. */
export function petViewport(windowWidth: number, windowHeight: number, logicalWidth: number, logicalHeight: number, scale: number) {
  const w = Math.max(1, windowWidth);
  const h = Math.max(1, windowHeight);
  const fit = Math.min(scale, w / logicalWidth, h / logicalHeight);
  const width = logicalWidth * fit;
  const height = logicalHeight * fit;
  return { left: w - width, top: h - height, width, height };
}

export const STRIKE_IMPACT = 0.19;
export const STRIKE_RELEASE = 0.23;
export const STRIKE_DURATION = 0.38;

/** One finite strike: wind up, snap down, contact, then recoil. Seconds, not frames. */
export function strikeHeight(age: number): number {
  const ease = (x: number) => x * x * (3 - 2 * x);
  if (age < 0) return 0.10;
  if (age < 0.14) return 0.10 + 0.42 * ease(age / 0.14);
  if (age < STRIKE_IMPACT) return 0.52 * (1 - ((age - 0.14) / 0.05) ** 2);
  if (age < STRIKE_RELEASE) return 0;
  if (age < STRIKE_DURATION) return 0.14 * ease((age - STRIKE_RELEASE) / 0.15);
  return 0.14;
}

/** Hide the upper iris with the already-painted fur, including custom skin patterns. */
export function clipAngryEyelid(ctx: CanvasRenderingContext2D, rx: number, ry: number, innerSign: number, amount: number): void {
  if (amount <= 0) return;
  const center = ry * (-1.08 + amount * 0.88);
  const slope = amount * 0.34 * ry;
  ctx.beginPath();
  ctx.moveTo(-rx - 2, center - innerSign * slope);
  ctx.lineTo(rx + 2, center + innerSign * slope);
  ctx.lineTo(rx + 2, ry + 3);
  ctx.lineTo(-rx - 2, ry + 3);
  ctx.closePath();
  ctx.clip();
}
