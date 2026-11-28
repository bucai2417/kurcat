/** Naiwa-only gestures, sampled in seconds; the cat keeps its own choreography. */
import type { GroundRollPose } from './groundRoll3d';
export interface NaiwaGesture { kind: string; age: number; duration: number; side: number }
const smooth = (a: number, b: number, x: number) => {
  const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
export function waveMotion(age: number) {
  const lift = smooth(.12, .88, age) * (1 - smooth(2.35, 3.4, age));
  const swing = Math.sin((age - .88) * Math.PI * 2.5) * smooth(.88, 1.1, age) * (1 - smooth(2.05, 2.35, age));
  return { lift, swing };
}
/** Seated stretch: gather, open the chest, reach with a slight left/right delay, release. */
export function stretchMotion(age: number, side = 1) {
  const delay = side < 0 ? .12 : 0;
  const lift = smooth(.25 + delay, 1.15 + delay, age) * (1 - smooth(2.55 + delay, 3.7, age));
  const gather = smooth(0, .22, age) * (1 - smooth(.30, .65, age));
  const open = smooth(.40, 1.25, age) * (1 - smooth(2.5, 3.75, age));
  const settle = Math.sin((age - 2.65) * 5) * smooth(2.65, 2.9, age) * (1 - smooth(3.1, 3.8, age));
  return { lift, gather, open, settle };
}
export function sniffMotion(age: number) {
  const drip = smooth(.30, 1.20, age) * (1 - smooth(1.85, 2.05, age));
  const inhale = smooth(1.78, 1.94, age) * (1 - smooth(2.02, 2.65, age));
  return { drip, inhale };
}
export function naiwaGroundRollPose(age: number, side: number): GroundRollPose {
  const tuck = smooth(0, .55, age) * (1 - smooth(4.15, 4.8, age));
  const lie = smooth(.45, 1.35, age) * (1 - smooth(3.8, 4.55, age));
  const back = smooth(1.25, 1.95, age) * (1 - smooth(3.25, 3.85, age));
  const kick = smooth(1.7, 2.0, age) * (1 - smooth(3.1, 3.4, age));
  return { lean: side * (Math.PI / 2 * lie + .12 * Math.sin((age - 1.7) * 6) * kick),
    twist: side * (Math.PI / 2 * back + .25 * Math.sin((age - 1.9) * 7) * kick),
    tuck, retreat: .42 * tuck };
}
export function rollLimbs(age: number, tuck: number) {
  const play = smooth(1.45, 1.85, age) * (1 - smooth(3.05, 3.55, age));
  const cycle = Math.sin((age - 1.65) * 7.5);
  return { play: tuck * play, left: tuck * (.25 + play * (.35 + .30 * cycle)),
    right: tuck * (.25 + play * (.35 - .30 * cycle)),
    wiggle: tuck * play * Math.sin((age - 1.6) * 7.5 - .65),
    brace: smooth(3.5, 3.95, age) * (1 - smooth(4.25, 4.8, age)) };
}
