/** Continuous skin deformation for Naiwa; contact points remain independent of soft motion. */
import type { FrogPoint } from './naiwaPose';
export interface NaiwaRibbonPoint extends FrogPoint { radius: number }
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** A flexible arm has no fixed elbow or bend direction. The wrist tangent follows
 * the palm, while a bounded lag bends the middle without sliding the fingertips.
 * Width compensates for extension so reaching feels soft instead of pipe-like. */
export function deformNaiwaArm(root: FrogPoint, target: FrogPoint, angle: number, lag: FrogPoint) {
  const dx = target.x - root.x, dy = target.y - root.y;
  const distance = Math.hypot(dx, dy), reach = Math.min(1, 1.12 / Math.max(.001, distance));
  const end = { x: root.x + dx * reach, y: root.y + dy * reach };
  const direction = { x: -Math.sin(angle), y: Math.cos(angle) };
  const inset = Math.min(.070, distance * .32);
  const wrist = { x: end.x - direction.x * inset, y: end.y - direction.y * inset };
  const length = Math.hypot(wrist.x - root.x, wrist.y - root.y);
  const slack = clamp(1 - length / .62, 0, 1);
  const side = Math.sign(root.x) || 1;
  const delay = Math.min(1, .09 / Math.max(.001, Math.hypot(lag.x, lag.y)));
  const c1 = { x: root.x + (wrist.x - root.x) * .32 + side * slack * .060 + lag.x * delay * .80,
    y: root.y + (wrist.y - root.y) * .32 + lag.y * delay * .80 };
  const handle = Math.min(.15, length * .34);
  const c2 = { x: wrist.x - direction.x * handle + lag.x * delay * .45,
    y: wrist.y - direction.y * handle + lag.y * delay * .45 };
  const thickness = clamp(Math.sqrt(.43 / Math.max(.12, length)), .68, 1.14);
  const points: NaiwaRibbonPoint[] = [];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32, q = 1 - t;
    const shoulder = Math.min(1, t / .18);
    const radius = (.048 * q + .027 * t + Math.sin(Math.PI * t) * .014) * thickness
      * (.60 + .40 * shoulder * shoulder * (3 - 2 * shoulder));
    points.push({ x: q*q*q*root.x + 3*q*q*t*c1.x + 3*q*t*t*c2.x + t*t*t*wrist.x,
      y: q*q*q*root.y + 3*q*q*t*c1.y + 3*q*t*t*c2.y + t*t*t*wrist.y, radius });
  }
  return { root, joint: points[16], end, points, reachable: distance <= 1.12 };
}

/** Only the cheeks swell. Crown, eye height, mouth contact and belly stay stable. */
export function naiwaCheekScale(y: number, puff: number): number {
  const t = clamp((y + .78) / .34, 0, 1);
  return 1 + .31 * clamp(puff, 0, 1) * Math.pow(Math.sin(Math.PI * t), 2);
}
