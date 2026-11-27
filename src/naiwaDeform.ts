/** Continuous skin deformation for Naiwa; contact points remain independent of soft motion. */
import type { FrogPoint } from './naiwaPose';
export interface NaiwaRibbonPoint extends FrogPoint { radius: number }
export interface NaiwaHandPose { grip?: number; press?: number }
const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };

/** The arm, palm and fingers share one surface. There is no fixed elbow or wrist
 * corner: the terminal tangent follows the approach, with bounded soft lag.
 * 'end' is the fingertip/grip contact used by the engine, never the wrist. */
export function deformNaiwaArm(root: FrogPoint, target: FrogPoint, angle: number, lag: FrogPoint, pose: NaiwaHandPose = {}) {
  const dx = target.x - root.x, dy = target.y - root.y;
  const distance = Math.hypot(dx, dy), reach = Math.min(1, 1.12 / Math.max(.001, distance));
  const end = { x: root.x + dx * reach, y: root.y + dy * reach };
  const approach = Math.atan2(dy, dx) - Math.PI / 2;
  const delta = Math.atan2(Math.sin(angle - approach), Math.cos(angle - approach));
  // Near the shoulder a large tangent mismatch would make a hook. Gradually
  // shorten and align the hand instead, keeping reach and gestures continuous.
  const heading = approach + clamp(delta, -.55, .55) * smooth(distance / .20);
  const direction = { x: -Math.sin(heading), y: Math.cos(heading) };
  const normal = { x: direction.y, y: -direction.x };
  const grip = clamp(pose.grip ?? 0), press = clamp(pose.press ?? 0);
  const size = .55 + .45 * smooth(distance / .16);
  const inset = Math.min((.027 - grip * .008) * size, distance * .28);
  const palm = { x: end.x - direction.x * inset, y: end.y - direction.y * inset };
  const length = Math.hypot(palm.x - root.x, palm.y - root.y);
  const delay = Math.min(1, Math.min(.09, length * .35) / Math.max(.001, Math.hypot(lag.x, lag.y)));
  const c1 = { x: root.x + (palm.x - root.x) * .34 + lag.x * delay * .80,
    y: root.y + (palm.y - root.y) * .34 + lag.y * delay * .80 };
  const handle = Math.min(.085, length * .26);
  const c2 = { x: palm.x - direction.x * handle + lag.x * delay * .45,
    y: palm.y - direction.y * handle + lag.y * delay * .45 };
  const thickness = clamp(Math.sqrt(.43 / Math.max(.12, length)), .68, 1.10);
  const points: NaiwaRibbonPoint[] = [];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32, q = 1 - t;
    const shoulder = smooth(t / .18);
    const palmWeight = smooth((t - .78) / .22);
    const radius = (.046 * q + .023 * t + Math.sin(Math.PI * t) * .009) * thickness
      * (.60 + .40 * shoulder) + palmWeight * (.010 - press * .003) * size;
    points.push({ x: q*q*q*root.x + 3*q*q*t*c1.x + 3*q*t*t*c2.x + t*t*t*palm.x,
      y: q*q*q*root.y + 3*q*q*t*c1.y + 3*q*t*t*c2.y + t*t*t*palm.y, radius });
  }
  const fingers: NaiwaRibbonPoint[][] = [];
  for (let i = -1; i <= 1; i++) {
    const spread = i * (.020 - grip * .005) * size;
    const finger: NaiwaRibbonPoint[] = [];
    for (let j = 0; j <= 6; j++) {
      const t = j / 6;
      const forward = inset * t + Math.sin(Math.PI * t) * grip * .014 * size;
      const across = spread * (.70 + .30 * t);
      finger.push({ x: palm.x + direction.x * forward + normal.x * across,
        y: palm.y + direction.y * forward + normal.y * across,
        radius: (.013 - .004 * t) * size * (1 - press * .14) });
    }
    fingers.push(finger);
  }
  return { root, joint: points[16], end, palm, direction, points, fingers, reachable: distance <= 1.12 };
}

/** Two local volumes beside the mouth. They never resize the head, eyes or belly. */
export function naiwaCheekVolumes(puff: number) {
  const amount = clamp(puff);
  return ([-1, 1] as const).map(sign => ({
    x: sign * (.095 + amount * .010), y: .034 + amount * .003,
    rx: .028 + amount * .030, ry: .013 + amount * .026, amount,
  }));
}
