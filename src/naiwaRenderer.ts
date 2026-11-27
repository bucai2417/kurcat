/** Reference-inspired 2D 奶蛙. Seated, with reference-derived artwork and connected articulated limbs.
 * One transform is shared by the body, face anchors, arms and feet. No ears or tail.
 */
import artwork from './assets/naiwa/artwork.json';
import type { ResolvedSkin } from './catSkins';
import { naiwaArtwork, naiwaSleepArtwork, readyNaiwaArtwork } from './naiwaArtwork';
import { deformNaiwaArm, naiwaCheekVolumes, type NaiwaRibbonPoint } from './naiwaDeform';

export interface NaiwaPaw {
  x: number;
  y: number;
  press: number;
  /** True while the engine's paw is poking a key, resting on the mouse or posing. */
  active: boolean;
  mode: string;
}

export interface NaiwaLayout {
  logicalW: number;
  logicalH: number;
  /** Body centre line in logical canvas units. */
  centerX: number;
  /** Bottom of the body (feet line). */
  baseY: number;
  /** Body height; width is derived from it. */
  bodyHeight: number;
  breath: number;
  bodyBob: number;
  /** Idle pose channels, −1..1 / 0..1. */
  lean: number;
  hunch: number;
  tilt: number;
  squint: number;
  /** Mouse-driven head turn and eye look, −1..1. */
  headTurn: number;
  eyeLookX: number;
  eyeLookY: number;
  leftPaw: NaiwaPaw;
  rightPaw: NaiwaPaw;
  /** Optional foot contact from the shared tail-key channel; never normal hand input. */
  footKey: { x: number; y: number; reach: number; press: number; side: 'left' | 'right' };
  poseHands: Array<{ side: 'left' | 'right'; x: number; y: number }>;
  poseLean: number;
  poseLift: number;
  drinkActive: boolean;
  drinkSip: number;
  drinkHandX: number;
  drinkHandY: number;
  drinkSide: 'left' | 'right';
  privacyMode: boolean;
  petEnergy: number;
  typingHeat: number;
  /** Active idle behaviour, for poses the engine drives (e.g. tailGround). */
  idleKind: string | null;
  idleT: number;
  anger: number;
  groove: number;
  excitement: number;
  groundAmount: number;
  groundLift: number;
  seconds: number;
}

import { sampleNaiwaPose, type FrogPoint, type NaiwaPose } from './naiwaPose';
const SIDES = ['left', 'right'] as const;
type Side = typeof SIDES[number];
type RGB = [number, number, number];
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smoothClose = (v: number) => { const t = clamp((v - .70) / .30); return t * t * (3 - 2 * t); };
function color(s: string | null | undefined, fallback: RGB): RGB {
  if (!s) return fallback;
  if (/^#[0-9a-f]{6}$/i.test(s)) { const n = parseInt(s.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  const m = /^rgba?\(([^)]+)\)$/.exec(s);
  return m ? m[1].split(',').slice(0, 3).map(Number) as RGB : fallback;
}
const css = (c: RGB, a = 1) => 'rgba(' + c.map(Math.round).join(',') + ',' + a + ')';
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v + (b[i] - v) * t) as RGB;
const WHITE: RGB = [255, 255, 255];
function palette(s: ResolvedSkin | null) {
  const body = color(s?.furColor, [255, 211, 56]);
  return { body, light: mix(body, WHITE, 0.30), shade: color(s?.furSecondaryColor, [230, 160, 24]),
    outline: color(s?.outlineColor, [149, 112, 33]), arm: color(s?.armColor, [247, 195, 44]),
    belly: color(s?.bellyBibColor, [255, 240, 211]), paw: color(s?.pawColor, [104, 99, 68]),
    pawOutline: color(s?.pawOutlineColor, [73, 74, 49]),
    iris: color(s?.eyeColorTop, [87, 145, 61]), irisLight: color(s?.eyeColorBottom, [166, 198, 93]),
    pupil: color(s?.pupilColor, [20, 23, 15]), mouth: color(s?.mouthColor, [92, 70, 37]),
    blush: color(s?.blushColor, [240, 168, 136]), catchlight: s?.eyeCatchlight ?? true,
  };
}
function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, angle = 0): void {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2); ctx.fill();
}
/** Two-segment contact solver. Projected lengths shorten when folded in depth.
 * Segment maxima keep hind legs within reach even for a stale target.
 */
export function solveNaiwaLimb(root: FrogPoint, target: FrogPoint, bend: number, upper: number, lower: number) {
  const dx = target.x - root.x, dy = target.y - root.y;
  const rawDistance = Math.hypot(dx, dy), maxReach = upper + lower - 0.0001;
  const distance = Math.min(maxReach, Math.max(0.0001, rawDistance));
  const ux = rawDistance > 0.0001 ? dx / rawDistance : 0;
  const uy = rawDistance > 0.0001 ? dy / rawDistance : 1;
  const projection = Math.min(1, Math.max(0.12, distance * 1.10 / (upper + lower)));
  let u = upper * projection, v = lower * projection;
  // A folded limb may point at its own shoulder. Shorten its depth projection
  // instead of dividing a large length difference by a near-zero distance.
  if (u > v + distance) u = v + distance * 0.5;
  if (v > u + distance) v = u + distance * 0.5;
  const along = (u * u - v * v + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, u * u - along * along));
  return { root, joint: { x: root.x + ux * along + uy * height * bend,
    y: root.y + uy * along - ux * height * bend },
    end: { x: root.x + ux * distance, y: root.y + uy * distance }, reachable: rawDistance <= maxReach };
}

export class NaiwaRenderer {
  private colors = palette(null);
  private pose: NaiwaPose = sampleNaiwaPose({ kind: null, progress: 0, seconds: 0, anger: 0, petting: 0,
    typing: 0, groove: 0, excitement: 0, stomp: 0, stompLift: 0, drinking: false, privacy: false });
  private hands: Record<Side, FrogPoint> = { left: { x: -0.26, y: 0.075 }, right: { x: 0.26, y: 0.075 } };
  private feet: Record<Side, FrogPoint> = { left: { x: -0.30, y: 0.015 }, right: { x: 0.30, y: 0.015 } };
  private footContacts: Record<Side, { x: number; y: number; weight: number }> = {
    left: { x: 0, y: 0, weight: 0 }, right: { x: 0, y: 0, weight: 0 },
  };
  private look = { x: 0, y: 0 };
  private blink = 0;
  private blinkStart = -1;
  private nextBlink = 0;
  private lids = 0;
  private expression = { anger: 0, cheeks: 0 };
  private arms: Record<Side, { follow: FrogPoint; lag: FrogPoint; angle: number; grip: number; press: number }> = {
    left: { follow: { x: -.26, y: .075 }, lag: { x: 0, y: 0 }, angle: 0, grip: 0, press: 0 },
    right: { follow: { x: .26, y: .075 }, lag: { x: 0, y: 0 }, angle: 0, grip: 0, press: 0 },
  };
  private initialized = false;
  private poseKind: string | undefined;
  private poseSeconds = 0;
  private poseBlend = { lift: 0, squash: 0, lean: 0, tilt: 0, sleep: 0, gaze: 0 };
  public ready(): Promise<void> { return readyNaiwaArtwork(); }
  public setSkin(skin: ResolvedSkin | null): void { this.colors = palette(skin); }
  public resetContacts(): void {
    this.initialized = false; this.poseKind = undefined;
    this.poseBlend = { lift: 0, squash: 0, lean: 0, tilt: 0, sleep: 0, gaze: 0 };
    this.expression = { anger: 0, cheeks: 0 };
    for (const side of SIDES) {
      this.footContacts[side].weight = 0; this.arms[side].lag = { x: 0, y: 0 };
      this.arms[side].grip = this.arms[side].press = 0;
    }
  }
  public onPrivacyModeChanged(active: boolean): void {
    if (active) { this.lids = 1; this.expression = { anger: 0, cheeks: 0 }; }
  }

  private transform(l: NaiwaLayout) {
    // Drink contacts suppress free sway so the cup does not chase a moving mouth.
    const idleBob = l.drinkActive || l.privacyMode ? 0 : Math.sin(l.seconds * 2.1) * 0.003 + l.bodyBob / l.bodyHeight;
    const reach = l.drinkActive ? 0 : Math.max(this.footContacts.left.weight, this.footContacts.right.weight);
    const turn = l.drinkActive ? 0 : this.footContacts.right.weight - this.footContacts.left.weight;
    // The front prone artwork lowers the torso and head together. Keep world
    // anchors in the same frame so hands can brace on the keyboard throughout.
    const sleep = clamp(this.pose.sleep), breath = Math.sin(l.seconds * 1.7) * sleep * .003;
    return { x: l.centerX - (turn * .045 + sleep * .012) * l.bodyHeight,
      y: l.baseY + ((idleBob + l.hunch * .012) * (1 - sleep) - this.pose.lift + sleep * .015) * l.bodyHeight,
      angle: this.pose.lean + sleep * -.018 + (l.drinkActive ? 0 : (l.lean * .03 + this.pose.tilt * .65 + l.tilt * .20) * (1 - sleep)) - turn * .075,
      sx: 1 + this.pose.squash * .55 - reach * .045 + breath,
      sy: 1 - this.pose.squash };
  }
  private toWorld(p: FrogPoint, l: NaiwaLayout): FrogPoint {
    const a = this.transform(l), x = p.x * a.sx * l.bodyHeight, y = p.y * a.sy * l.bodyHeight;
    return { x: a.x + Math.cos(a.angle) * x - Math.sin(a.angle) * y,
      y: a.y + Math.sin(a.angle) * x + Math.cos(a.angle) * y };
  }
  private toLocal(p: FrogPoint, l: NaiwaLayout): FrogPoint {
    const a = this.transform(l), x = p.x - a.x, y = p.y - a.y;
    return { x: (Math.cos(a.angle) * x + Math.sin(a.angle) * y) / (a.sx * l.bodyHeight),
      y: (-Math.sin(a.angle) * x + Math.cos(a.angle) * y) / (a.sy * l.bodyHeight) };
  }
  private applyRoot(ctx: CanvasRenderingContext2D, l: NaiwaLayout): void {
    const a = this.transform(l); ctx.translate(a.x, a.y); ctx.rotate(a.angle);
    ctx.scale(l.bodyHeight * a.sx, l.bodyHeight * a.sy);
  }
  private face(l: NaiwaLayout) {
    const sleep = clamp(this.pose.sleep);
    return { x: (l.drinkActive ? 0 : l.headTurn * 0.012) - sleep * .014, y: -0.653 + sleep * .588,
      angle: 0 };
  }
  public getMouthWorld(l: NaiwaLayout): FrogPoint {
    this.syncPose(l); // Prop solver runs before update; never use the previous idle pose.
    const f = this.face(l); // exactly the same face pivot used by drawFace
    return this.toWorld({ x: f.x - Math.sin(f.angle) * 0.013, y: f.y + Math.cos(f.angle) * 0.013 }, l);
  }
  public getFootWorld(side: Side, l: NaiwaLayout): FrogPoint { return this.toWorld(this.limb(side, 'leg').end, l); }

  public getHandWorld(side: Side, l: NaiwaLayout): FrogPoint { return this.toWorld(this.limb(side, 'arm').end, l); }

  private syncPose(l: NaiwaLayout): void {
    const next = sampleNaiwaPose({ kind: l.idleKind, progress: l.idleT, seconds: l.seconds,
      anger: l.anger, petting: l.petEnergy, typing: l.typingHeat, groove: l.groove, excitement: l.excitement,
      stomp: l.groundAmount, stompLift: l.groundLift, drinking: l.drinkActive, privacy: l.privacyMode });
    const kind = l.privacyMode ? 'privacy' : l.drinkActive ? 'drink' : l.idleKind ?? 'rest';
    const dt = Math.max(0, Math.min(0.1, l.seconds - this.poseSeconds));
    for (const key of ['lift', 'squash', 'lean', 'tilt', 'sleep', 'gaze'] as const) {
      if (this.poseKind !== undefined && kind !== this.poseKind) this.poseBlend[key] = this.pose[key] - next[key];
      // Preserve the current body pose when a hop/gesture is interrupted. Mouth
      // solving and rendering can both sample a frame without advancing twice.
      this.poseBlend[key] *= Math.exp(-(key === 'sleep' ? 8 : 16) * dt);
      next[key] += this.poseBlend[key];
    }
    this.pose = next; this.poseKind = kind; this.poseSeconds = l.seconds;
  }
  public update(dt: number, now: number, l: NaiwaLayout): void {
    this.syncPose(l);
    const k = 1 - Math.exp(-12 * dt);
    this.look.x += (Math.max(-1, Math.min(1, l.eyeLookX + this.pose.gaze)) - this.look.x) * k; this.look.y += (l.eyeLookY - this.look.y) * k;
    this.lids += (Math.max(this.pose.lids, l.squint, l.privacyMode ? 0 : clamp(l.anger) * .48) - this.lids) * k;
    const angry = l.privacyMode ? 0 : clamp(l.anger);
    this.expression.anger += (angry - this.expression.anger) * (1 - Math.exp(-10 * dt));
    const puff = l.privacyMode ? 0 : Math.max(this.pose.cheeks, angry * .95);
    this.expression.cheeks += (puff - this.expression.cheeks) * (1 - Math.exp(-(puff > this.expression.cheeks ? 9 : 6) * dt));
    if (this.nextBlink === 0) this.nextBlink = now + 2400;
    if (now >= this.nextBlink && this.blinkStart < 0) this.blinkStart = now;
    this.blink = this.blinkStart < 0 ? 0 : Math.sin(clamp((now - this.blinkStart) / 190) * Math.PI);
    if (this.blinkStart >= 0 && now - this.blinkStart >= 190) {
      this.blinkStart = -1; this.nextBlink = now + 2800 + Math.random() * 3500;
    }
    // Update both contacts before deriving the shared body transform. Switching
    // feet transfers weight continuously instead of flipping the hip in one frame.
    for (const side of SIDES) {
      const contactState = this.footContacts[side];
      if (!this.initialized) contactState.weight = 0;
      const desiredWeight = l.footKey.side === side ? clamp(l.footKey.reach) : 0;
      const follow = 1 - Math.exp(-32 * dt);
      if (desiredWeight > 0) {
        const k = contactState.weight < 0.002 ? 1 : follow;
        contactState.x += (l.footKey.x - contactState.x) * k;
        contactState.y += (l.footKey.y - contactState.y) * k;
      }
      contactState.weight += (desiredWeight - contactState.weight) * follow;
      if (contactState.weight < 0.002 && desiredWeight === 0) contactState.weight = 0;
    }
    for (const side of SIDES) {
      const paw = side === 'left' ? l.leftPaw : l.rightPaw;
      const holding = l.drinkActive && l.drinkSide === side;
      const contact = paw.active && (paw.mode === 'poke' || paw.mode === 'mouse');
      const sign = side === 'left' ? -1 : 1;
      const sleep = clamp(this.pose.sleep);
      const brace = this.toLocal({ x: l.centerX + l.bodyHeight * sign * .23,
        y: l.baseY + l.bodyHeight * .045 }, l);
      const resting = this.pose.hands[side];
      const handTarget = holding
        ? this.toLocal({ x: l.drinkHandX, y: l.drinkHandY }, l)
        : contact ? this.toLocal(paw, l) : { x: resting.x + (brace.x - resting.x) * sleep,
          y: resting.y + (brace.y - resting.y) * sleep };
      const rest = this.pose.feet[side];
      const footRest = this.toWorld(rest, l);
      const contactState = this.footContacts[side];
      const footWeight = contactState.weight;
      // Independent release prevents a foot teleport when a custom key switches sides.
      const footTarget = this.toLocal({ x: footRest.x + (contactState.x - footRest.x) * footWeight,
        y: footRest.y + (contactState.y - footRest.y) * footWeight }, l);
      const hk = !this.initialized || holding || contact ? 1 : 1 - Math.exp(-22 * dt);
      const fk = !this.initialized || footWeight > 0 || l.groundAmount > 0 || l.idleKind === 'frogHop' ? 1 : 1 - Math.exp(-24 * dt);
      for (const axis of ['x', 'y'] as const) {
        this.hands[side][axis] += (handTarget[axis] - this.hands[side][axis]) * hk;
        this.feet[side][axis] += (footTarget[axis] - this.feet[side][axis]) * fk;
      }
      const arm = this.arms[side], hand = this.hands[side];
      for (const axis of ['x', 'y'] as const) {
        arm.follow[axis] += (hand[axis] - arm.follow[axis]) * (!this.initialized ? 1 : 1 - Math.exp(-11 * dt));
        arm.lag[axis] = arm.follow[axis] - hand[axis];
      }
      // A mouse hand follows the direction it reached from. A forced vertical
      // palm makes a hooked wrist, especially on the far side of the keyboard.
      const shoulder = this.shoulder(side);
      const approach = Math.atan2(hand.y - shoulder.y, hand.x - shoulder.x) - Math.PI / 2;
      const desiredAngle = approach + (holding ? sign * .25 : 0);
      const shapeK = !this.initialized ? 1 : 1 - Math.exp(-18 * dt);
      arm.grip += ((holding ? 1 : 0) - arm.grip) * shapeK;
      arm.press += ((contact ? clamp(paw.press) : sleep * .30) - arm.press) * shapeK;
      const delta = Math.atan2(Math.sin(desiredAngle - arm.angle), Math.cos(desiredAngle - arm.angle));
      arm.angle += delta * (!this.initialized ? 1 : 1 - Math.exp(-18 * dt));
    }
    this.initialized = true;
  }

  /** Actual joints used for drawing and contact/reach regression checks. */
  public getLimbWorld(side: Side, limb: 'arm' | 'leg', l: NaiwaLayout) {
    const chain = this.limb(side, limb);
    return { root: this.toWorld(chain.root, l), joint: this.toWorld(chain.joint, l),
      end: this.toWorld(chain.end, l), reachable: chain.reachable };
  }
  private shoulder(side: Side): FrogPoint {
    const sleep = clamp(this.pose.sleep), sign = side === 'left' ? -1 : 1;
    return { x: sign * (.24 + sleep * .10), y: -.43 + sleep * .30 };
  }
  private limb(side: Side, limb: 'arm' | 'leg') {
    const sign = side === 'left' ? -1 : 1;
    return limb === 'arm'
      ? deformNaiwaArm(this.shoulder(side), this.hands[side], this.arms[side].angle, this.arms[side].lag, this.arms[side])
      : solveNaiwaLimb({ x: sign * 0.245, y: -0.155 }, this.feet[side], sign, 0.35, 0.37);
  }
  /** The sampled surface used by drawing, also available for motion regression checks. */
  public getArmSurfaceWorld(side: Side, l: NaiwaLayout) {
    const arm = this.arms[side];
    return deformNaiwaArm(this.shoulder(side), this.hands[side], arm.angle, arm.lag, arm)
      .points.map(point => ({ ...this.toWorld(point, l), radius: point.radius * l.bodyHeight }));
  }
  /** Legs retain a folded knee; arms use a freely deforming continuous surface. */
  private drawLimb(ctx: CanvasRenderingContext2D, side: Side, limb: 'arm' | 'leg'): void {
    const p = this.colors, arm = limb === 'arm', state = this.arms[side];
    const surface = arm ? deformNaiwaArm(this.shoulder(side), this.hands[side], state.angle, state.lag, state) : null;
    const { root: a, joint: b, end } = surface ?? this.limb(side, 'leg');
    const d=Math.max(.001,Math.hypot(end.x-b.x,end.y-b.y));
    const inset=arm ? Math.min(.052,d*.4) : .014;
    const c={x:end.x+(b.x-end.x)*inset/d,y:end.y+(b.y-end.y)*inset/d};
    const ra = arm ? 0.072 : 0.087, rb = arm ? 0.054 : 0.063, rc = arm ? 0.029 : 0.036;
    const unit = (u: FrogPoint, v: FrogPoint) => {
      const d = Math.max(0.0001, Math.hypot(v.x - u.x, v.y - u.y));
      return { x: (v.x - u.x) / d, y: (v.y - u.y) / d };
    };
    const tangent = unit(a, c);
    const points: NaiwaRibbonPoint[] = surface?.points ?? [];
    // Cubics share an elbow tangent: bending keeps a soft, unbroken contour.
    for (let segment = 0; !arm && segment < 2; segment++) {
      const from = segment === 0 ? a : b, to = segment === 0 ? b : c;
      const dir = unit(from, to), reach = Math.hypot(to.x - from.x, to.y - from.y) * 0.30;
      const t1 = segment === 0 ? dir : tangent, t2 = segment === 0 ? tangent : dir;
      const p1 = { x: from.x + t1.x * reach, y: from.y + t1.y * reach };
      const p2 = { x: to.x - t2.x * reach, y: to.y - t2.y * reach };
      for (let i = segment ? 1 : 0; i <= 8; i++) {
        const t = i / 8, q = 1 - t, radius = segment === 0 ? ra + (rb - ra) * t : rb + (rc - rb) * t;
        points.push({ x: q*q*q*from.x + 3*q*q*t*p1.x + 3*q*t*t*p2.x + t*t*t*to.x,
          y: q*q*q*from.y + 3*q*q*t*p1.y + 3*q*t*t*p2.y + t*t*t*to.y, radius });
      }
    }
    const offsets = points.map((point, i) => {
      const d = unit(points[Math.max(0, i - 1)], points[Math.min(points.length - 1, i + 1)]);
      return { x: -d.y * point.radius, y: d.x * point.radius };
    });
    const last = points[points.length - 1];
    const appendSurface = (chain: NaiwaRibbonPoint[]) => {
      const normals = chain.map((point, i) => {
        const dir = unit(chain[Math.max(0, i - 1)], chain[Math.min(chain.length - 1, i + 1)]);
        return { x: -dir.y * point.radius, y: dir.x * point.radius };
      });
      const first = chain[0], last = chain[chain.length - 1], n0 = normals[0], n1 = normals[normals.length - 1];
      ctx.moveTo(first.x + n0.x, first.y + n0.y);
      chain.slice(1).forEach((point, i) => ctx.lineTo(point.x + normals[i + 1].x, point.y + normals[i + 1].y));
      ctx.bezierCurveTo(last.x + n1.x + n1.y, last.y + n1.y - n1.x,
        last.x - n1.x + n1.y, last.y - n1.y - n1.x, last.x - n1.x, last.y - n1.y);
      for (let i = chain.length - 2; i >= 0; i--) ctx.lineTo(chain[i].x - normals[i].x, chain[i].y - normals[i].y);
      ctx.bezierCurveTo(first.x - n0.x - n0.y, first.y - n0.y + n0.x,
        first.x + n0.x - n0.y, first.y + n0.y + n0.x, first.x + n0.x, first.y + n0.y);
      ctx.closePath();
    };
    ctx.beginPath(); appendSurface(points);
    if (surface) for (const finger of surface.fingers) appendSurface(finger);
    // A single filled outline has no seams between joints. Shoulder alpha blends
    // into the existing torso, and a tapered highlight follows the soft surface.
    const g = ctx.createLinearGradient(a.x, a.y, end.x, end.y);
    g.addColorStop(0, css(p.body, 0));
    g.addColorStop(.15, css(mix(p.body, p.arm, .20), .95));
    g.addColorStop(.60, css(p.arm));
    g.addColorStop(.80, css(mix(p.arm, p.paw, .25)));
    g.addColorStop(.94, css(mix(p.arm, p.paw, .80)));
    g.addColorStop(1, css(p.paw));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    // Paint only the middle of the ribbon, keeping shoulder and wrist seamless.
    const light = ctx.createLinearGradient(a.x, a.y, last.x, last.y);
    light.addColorStop(0, css(p.light, 0)); light.addColorStop(.25, css(p.light, .075));
    light.addColorStop(.70, css(p.light, .035)); light.addColorStop(1, css(p.light, 0));
    ctx.strokeStyle = light; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((point, i) => {
      const x = point.x - offsets[i].x * .28, y = point.y - offsets[i].y * .28;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    for (let i = 0; i < 7; i++) { ctx.lineWidth = .060 - i * .007; ctx.stroke(); }
    ctx.restore();
  }

  /** Keep the source silhouette and its lighting intact; cheeks are local face volumes. */
  private drawBodyArtwork(ctx: CanvasRenderingContext2D): boolean {
    const sleep = clamp(this.pose.sleep);
    const image = sleep > 0 ? naiwaSleepArtwork(this.colors, sleep) : naiwaArtwork('body', this.colors);
    if (!image) return false;
    // Blend in an isolated surface so the torso never becomes see-through.
    const [ax, ay, aw, ah] = artwork.bodyRect, [bx, by, bw, bh] = artwork.proneRect;
    const left = ax + (bx - ax) * sleep, width = aw + (bw - aw) * sleep;
    const top = ay + (by - ay) * sleep, height = ah + (bh - ah) * sleep;
    if (sleep > 0 && sleep < 1) {
      // A solid interpolated boundary hides the two source outlines. Filling the
      // new skin area first also prevents background showing at unequal edges.
      const contour = artwork.sleepContours.body.map((row, i) => {
        const prone = artwork.sleepContours.prone[i];
        return { y: top + (row[0] + (prone[0] - row[0]) * sleep) * height,
          left: left + (row[1] + (prone[1] - row[1]) * sleep) * width,
          right: left + (row[2] + (prone[2] - row[2]) * sleep) * width };
      });
      ctx.save(); ctx.beginPath(); ctx.moveTo(contour[0].left, contour[0].y);
      for (const point of contour.slice(1)) ctx.lineTo(point.left, point.y);
      for (const point of contour.slice().reverse()) ctx.lineTo(point.right, point.y);
      ctx.closePath(); ctx.clip();
      const skin = ctx.createLinearGradient(0, top, 0, top + height);
      skin.addColorStop(0, css(this.colors.light)); skin.addColorStop(.55, css(this.colors.body));
      skin.addColorStop(1, css(this.colors.shade)); ctx.fillStyle = skin; ctx.fill();
      ctx.drawImage(image, left, top, width, height); ctx.restore();
    } else ctx.drawImage(image, left, top, width, height);
    return true;
  }

  public renderBody(ctx: CanvasRenderingContext2D, _now: number, l: NaiwaLayout): void {
    const p = this.colors;
    ctx.save(); ctx.translate(l.centerX, l.baseY - 2); ctx.scale(l.bodyHeight, l.bodyHeight);
    const shadow = ctx.createRadialGradient(0, 0, 0.02, 0, 0, 0.43);
    shadow.addColorStop(0, 'rgba(72,52,16,0.20)'); shadow.addColorStop(1, 'rgba(72,52,16,0)');
    ctx.fillStyle = shadow; ellipse(ctx, 0, 0, 0.43 * (1 - this.pose.lift), 0.055); ctx.restore();
    ctx.save(); this.applyRoot(ctx, l); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Hind limbs are folded behind the torso, visibly joined at the hips.
    for (const side of SIDES) {
      ctx.save(); ctx.globalAlpha = 1 - clamp(this.pose.sleep);
      this.drawLimb(ctx, side, 'leg'); ctx.restore();
    }
    if (!this.drawBodyArtwork(ctx)) {
    // Loading fallback: a single outline runs from the raised crown through the neck into the belly.
    // Rotated head points connect to fixed shoulders through Bezier neck curves.
    const f = this.face(l);
    const hp = (x: number, y: number): [number, number] => [f.x + x * Math.cos(f.angle) - y * Math.sin(f.angle),
      f.y + x * Math.sin(f.angle) + y * Math.cos(f.angle)];
    const body = new Path2D();
    body.moveTo(...hp(0, -0.195));
    body.bezierCurveTo(...hp(0.15, -0.20), ...hp(0.20, -0.12), ...hp(0.205, -0.025));
    body.bezierCurveTo(...hp(0.21, 0.14), 0.24, -0.43, 0.30, -0.36);
    body.bezierCurveTo(0.40, -0.25, 0.42, -0.14, 0.33, -0.05);
    body.bezierCurveTo(0.23, 0.035, -0.23, 0.035, -0.33, -0.05);
    body.bezierCurveTo(-0.42, -0.14, -0.40, -0.25, -0.30, -0.36);
    body.bezierCurveTo(-0.24, -0.43, ...hp(-0.21, 0.14), ...hp(-0.205, -0.025));
    body.bezierCurveTo(...hp(-0.20, -0.12), ...hp(-0.15, -0.20), ...hp(0, -0.195)); body.closePath();
    const g = ctx.createRadialGradient(-0.10, -0.68, 0.025, 0.025, -0.47, 0.57);
    g.addColorStop(0, css(p.light)); g.addColorStop(0.55, css(p.body)); g.addColorStop(1, css(p.shade));
    ctx.fillStyle = g; ctx.fill(body);
    // Cream patch follows the foreshortened belly, with a rounded lower edge.
    const belly = ctx.createRadialGradient(-0.08, -0.30, 0.015, 0, -0.22, 0.30);
    belly.addColorStop(0, css(mix(p.belly, WHITE, 0.16))); belly.addColorStop(0.65, css(p.belly));
    belly.addColorStop(1, css(mix(p.belly, p.shade, 0.22)));
    ctx.fillStyle = belly; ctx.beginPath(); ctx.moveTo(0, -0.405);
    ctx.bezierCurveTo(0.19, -0.41, 0.30, -0.25, 0.285, -0.13);
    ctx.bezierCurveTo(0.22, -0.045, -0.22, -0.045, -0.285, -0.13);
    ctx.bezierCurveTo(-0.30, -0.25, -0.19, -0.41, 0, -0.405); ctx.closePath(); ctx.fill();
    }
    this.drawFace(ctx, l);
    for (const side of SIDES) if (this.footContacts[side].weight <= 0.03) {
      ctx.save(); ctx.globalAlpha = 1 - clamp(this.pose.sleep); this.drawFoot(ctx, side, l); ctx.restore();
    }
    // A lifted foot passes in front of the hip before reaching a key.
    for (const side of SIDES) if (this.footContacts[side].weight > 0.03) {
      this.drawLimb(ctx, side, 'leg'); this.drawFoot(ctx, side, l);
    }
    ctx.restore();
  }

  private drawFace(ctx: CanvasRenderingContext2D, l: NaiwaLayout): void {
    const p = this.colors, f = this.face(l), angry = this.expression.anger;
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.angle);
    // Paired, softly lit cheek volumes sit below the eyes and beside the mouth.
    // No row slicing or stretching of the original face texture is needed.
    for (const cheek of naiwaCheekVolumes(this.expression.cheeks)) {
      const { x, y, rx, ry, amount } = cheek;
      if (amount < .002) continue;
      ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry);
      const volume = ctx.createRadialGradient(-.24, -.32, .10, 0, 0, 1);
      volume.addColorStop(0, css(p.light, amount * .70));
      volume.addColorStop(.46, css(mix(p.light, p.body, .55), amount * .58));
      volume.addColorStop(.80, css(mix(p.body, p.shade, .27), amount * .38));
      volume.addColorStop(1, css(p.body, 0));
      ctx.fillStyle = volume; ellipse(ctx, 0, 0, 1, 1);
      // A short lower crease supplies volume without outlining two pasted circles.
      ctx.strokeStyle = css(p.outline, amount * .24); ctx.lineWidth = .035;
      ctx.beginPath(); ctx.moveTo(-.70, .58); ctx.quadraticCurveTo(0, .97, .70, .58); ctx.stroke();
      const blush = ctx.createRadialGradient(.15, .10, .05, .15, .10, .70);
      blush.addColorStop(0, css(p.blush, angry * .20)); blush.addColorStop(1, css(p.blush, 0));
      ctx.fillStyle = blush; ellipse(ctx, .15, .10, .70, .65);
      ctx.restore();
    }
    for (const sign of [-1, 1]) {
      if (l.petEnergy > 0.05) {
        ctx.fillStyle = css(p.blush, clamp(l.petEnergy) * 0.45); ellipse(ctx, sign * 0.16, 0.017, 0.026, 0.012);
      }
      this.drawEye(ctx, sign * (.131 + this.pose.sleep * .060), -.056 - this.pose.sleep * .026, sign, l);
      if (angry > .02) {
        ctx.strokeStyle = css(p.mouth, angry * .45); ctx.lineWidth = .0022;
        ctx.beginPath(); ctx.moveTo(sign * .052, .008);
        ctx.quadraticCurveTo(sign * .061, .018, sign * .054, .029); ctx.stroke();
      }
    }
    ctx.strokeStyle = css(p.mouth); ctx.fillStyle = css(p.mouth); ctx.lineWidth = 0.003;
    if (this.pose.mouthOpen > 0.10 || l.drinkSip > 0.6) {
      ellipse(ctx, 0, 0.013, 0.026, 0.004 + this.pose.mouthOpen * 0.014 + l.drinkSip * 0.003);
    } else {
      const width = .080 - angry * .050, y = .009 + angry * .009;
      ctx.beginPath(); ctx.moveTo(-width, y);
      ctx.bezierCurveTo(-width * .30, .020 - angry * .023, width * .30, .020 - angry * .023, width, y); ctx.stroke();
    }
    ctx.restore();
  }
  private drawEye(ctx: CanvasRenderingContext2D, x: number, y: number, sign: number, l: NaiwaLayout): void {
    const p = this.colors, r = 0.047;
    const lid = clamp(Math.max(this.lids, this.blink, l.privacyMode ? 1 : 0));
    const edge = -r * 1.24 + r * 2.50 * lid;
    const slant = sign * this.expression.anger * r * .82 * (1 - smoothClose(lid));
    const closedT = clamp((lid - .70) / .24), closed = closedT * closedT * (3 - 2 * closedT);
    const creaseY = edge * (1 - closed) + r * .12 * closed;
    const halfWidth = r * (1.2 - .34 * closed), bend = r * .41 * closed;
    const gap = Math.max(0, r * 1.3 - edge) * (1 - closed);
    ctx.save(); ctx.translate(x, y);
    if (closed < 1) {
      // The visible iris collapses against the same curved lid that becomes the
      // closed-eye crease. Separate closing lines would leave a second green slit.
      ctx.save(); ctx.globalAlpha *= 1 - closed;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.14, r * 1.24, 0, 0, Math.PI * 2); ctx.clip();
      ctx.beginPath(); ctx.moveTo(-halfWidth, creaseY + slant);
      ctx.quadraticCurveTo(0, creaseY + bend, halfWidth, creaseY - slant);
      ctx.lineTo(halfWidth, creaseY + gap - slant * closed);
      ctx.quadraticCurveTo(0, creaseY + bend + gap, -halfWidth, creaseY + gap + slant * closed);
      ctx.closePath(); ctx.clip();
      ctx.fillStyle = css(mix(p.iris, p.irisLight, 0.32)); ellipse(ctx, 0, 0, r * 1.13, r * 1.22);
      const iris = ctx.createLinearGradient(0, -r, 0, r);
      iris.addColorStop(0, css(p.iris)); iris.addColorStop(1, css(p.irisLight));
      ctx.fillStyle = iris; ellipse(ctx, 0, 0, r, r * 1.12);
      const px = this.look.x * r * 0.17, py = this.look.y * r * 0.13;
      const pupil = ctx.createRadialGradient(px-r*.20,py-r*.35,r*.06,px,py,r*.85);
      pupil.addColorStop(0, css(mix(p.pupil,WHITE,.24))); pupil.addColorStop(.50,css(p.pupil)); pupil.addColorStop(1,css(mix(p.pupil,p.iris,.12)));
      ctx.fillStyle = pupil; ellipse(ctx, px, py, r * 0.70, r * 0.78);
      if (p.catchlight) {
        ctx.fillStyle = 'rgba(255,255,255,0.38)'; ellipse(ctx, px + r * 0.25, py - r * 0.44, r * 0.23, r * 0.16, -0.4);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ellipse(ctx, px - r * 0.30, py + r * 0.36, r * 0.08, r * 0.07);
      }
      ctx.restore();
    }
    if (lid > .005) {
      ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, r * 1.14, r * 1.24, 0, 0, Math.PI * 2); ctx.clip();
      ctx.strokeStyle = css(p.outline, .72); ctx.lineWidth = .0025;
      ctx.beginPath(); ctx.moveTo(-halfWidth, creaseY + slant);
      ctx.quadraticCurveTo(0, creaseY + bend, halfWidth, creaseY - slant);
      ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }

  public renderForeground(ctx: CanvasRenderingContext2D, _dt: number, _now: number, l: NaiwaLayout): void {
    const p = this.colors;
    ctx.save(); this.applyRoot(ctx, l); ctx.lineCap = 'round';
    // Palm and fingers are filled with the arm in the same outline and gradient.
    for (const side of SIDES) this.drawLimb(ctx, side, 'arm');

    if (this.pose.bellyPat > 0.5) {
      ctx.strokeStyle = css(p.pawOutline, this.pose.bellyPat * 0.65); ctx.lineWidth = 0.003;
      for (const sign of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sign * 0.045, -0.23); ctx.lineTo(sign * 0.062, -0.25); ctx.stroke(); }
    }
    if (l.idleKind === 'frogCroak' && this.pose.cheeks > 0.15) {
      ctx.strokeStyle = css(p.iris, this.pose.cheeks * 0.65); ctx.lineWidth = 0.004;
      for (const sign of [-1, 1]) { ctx.beginPath(); ctx.arc(sign * 0.16, -0.64, 0.018 + this.pose.cheeks * 0.020, sign > 0 ? -0.9 : Math.PI - 0.9, sign > 0 ? 0.9 : Math.PI + 0.9); ctx.stroke(); }
    }
    ctx.restore();
  }
  private drawFoot(ctx: CanvasRenderingContext2D, side: Side, l: NaiwaLayout): void {
    const p = this.colors, foot = this.limb(side, 'leg').end;
    const sign = side === 'left' ? -1 : 1;
    const press = l.footKey.side === side ? l.footKey.press * l.footKey.reach : 0;
    ctx.save(); ctx.translate(foot.x, foot.y); ctx.scale(1, 1 - clamp(press) * 0.12);
    const art=naiwaArtwork('foot',p);
    if(art) {
      const weight=this.footContacts[side].weight;
      ctx.rotate(sign*(.17-weight*.12)); ctx.scale(sign,1);
      ctx.drawImage(art,-.072,-.176,.144,.223*(1-weight*.45));
      ctx.restore(); return;
    }
    const g = ctx.createLinearGradient(0, -0.025, 0, 0.024);
    g.addColorStop(0, css(mix(p.paw, p.body, 0.45))); g.addColorStop(1, css(p.paw));
    ctx.fillStyle = g; ellipse(ctx, sign * 0.016, -0.005, 0.078, 0.026, sign * 0.1);
    for (let i = 0; i < 3; i++) {
      const x = sign * (0.012 + i * 0.030), y = 0.010 - i * 0.003;
      ctx.fillStyle = g; ellipse(ctx, x, y, 0.022, 0.016, sign * 0.15);
      ctx.strokeStyle = css(p.pawOutline, 0.5); ctx.lineWidth = 0.002;
      ctx.beginPath(); ctx.moveTo(x + sign * 0.013, y - 0.004); ctx.lineTo(x + sign * 0.013, y + 0.007); ctx.stroke();
    }
    ctx.restore();
  }
}
