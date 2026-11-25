/** Ground roll phases, in seconds. Rotation is applied around the torso, then grounded. */
export const GROUND_ROLL_DURATION = 4.8;
export interface GroundRollPose { lean: number; twist: number; tuck: number; retreat: number; }
const ease = (a: number, b: number, t: number) => {
  const u = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
export function groundRollPose(age: number, side: number): GroundRollPose {
  const tuck = ease(0, 0.45, age) * (1 - ease(4.15, 4.8, age));
  const lie = ease(0.4, 1.25, age) * (1 - ease(3.85, 4.55, age));
  const belly = ease(1.3, 1.95, age) * (1 - ease(3.25, 3.85, age));
  const wiggle = ease(1.85, 2.1, age) * (1 - ease(3.05, 3.3, age));
  return {
    lean: side * Math.PI / 2 * lie,
    twist: side * (Math.PI / 2 * belly + 0.38 * Math.sin((age - 2) * Math.PI * 3) * wiggle),
    tuck,
    retreat: 0.38 * tuck,
  };
}
/** Untwist to the side before getting up; preserve the exact interrupted pose at t=0. */
export function recoverGroundRoll(from: GroundRollPose, age: number): GroundRollPose {
  return {
    lean: from.lean * (1 - ease(0.28, 0.9, age)),
    twist: from.twist * (1 - ease(0, 0.42, age)),
    tuck: from.tuck * (1 - ease(0.55, 1.05, age)),
    retreat: from.retreat * (1 - ease(0.55, 1.05, age)),
  };
}
