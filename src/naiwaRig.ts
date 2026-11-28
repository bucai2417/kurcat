import * as THREE from 'three';
import { TaperTube3D } from './keyboard3d';
import { waveMotion, sniffMotion, rollLimbs, type NaiwaGesture } from './naiwaMotion';
import type { GroundRollPose } from './groundRoll3d';

/** Live desktop pose. Contacts are world-space points from the shared pet engine. */
export interface NaiwaFrame {
  head: { pitch: number; yaw: number; roll: number };
  lean: number; hunch: number;
  blink: number; anger: number; sleeping: number;
  gesture?: NaiwaGesture; roll?: GroundRollPose;
}
export interface NaiwaContacts {
  left: THREE.Vector3; right: THREE.Vector3;
  leftMode: 'desk' | 'wave' | 'cup'; rightMode: 'desk' | 'wave' | 'cup';
  tongue?: THREE.Vector3; tongueWeight: number; stomp: number; stompLift: number;
}
interface Segment { bone: THREE.Bone; correction: THREE.Quaternion; length: number }
interface Arm { segments: Segment[]; hand: Segment; grip: THREE.Object3D; fingers: Array<{ bone: THREE.Bone; axis: THREE.Vector3 }>; twist: number; mode: number; cup: number; curl: number }
const Y = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const ease = (x: number) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const position = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
function frame(direction: THREE.Vector3, normal: THREE.Vector3): THREE.Quaternion {
  const y = direction.clone().normalize();
  const z = normal.clone().addScaledVector(y, -normal.dot(y));
  if (z.lengthSq() < 1e-8) z.set(0, 0, 1).addScaledVector(y, -y.z);
  if (z.lengthSq() < 1e-8) z.set(1, 0, 0).addScaledVector(y, -y.x);
  z.normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(y.clone().cross(z).normalize(), y, z));
}
/** Sets an exact global bone matrix; avoids inherited nonuniform-scale wrist shear. */
function worldMatrix(bone: THREE.Object3D, matrix: THREE.Matrix4): void {
  bone.parent!.updateWorldMatrix(true, false);
  bone.matrix.copy(bone.parent!.matrixWorld).invert().multiply(matrix);
  bone.matrixAutoUpdate = false;
  bone.matrixWorldNeedsUpdate = true;
  bone.updateWorldMatrix(false, true);
}

/** Dedicated to the published Naiwa rig, never inferred from a filename or model ID. */
export class NaiwaRig {
  private bones: THREE.Bone[] = [];
  private arms: Arm[];
  private meshes: THREE.Mesh[] = [];
  private expression = 0;
  private time = 0;
  private gesture?: NaiwaGesture;
  private wave = { lift: 0, swing: 0, side: 1 };
  private roll = { left: 0, right: 0, wiggle: 0, brace: 0, tuck: 0, play: 0 };
  private rollAge = 0;
  private inhale = 0;
  private drip = 0;
  private sleeping = 0;
  private detailRoot?: THREE.Group;
  private tongueTube?: TaperTube3D;
  private tongueTip?: THREE.Mesh;
  private tongueMouth?: THREE.Mesh;
  private noseDrop?: THREE.Mesh;
  private tongueAmount = 0;
  private tongueGoal = new THREE.Vector3();
  private pupils: Array<{ mesh: THREE.Mesh; positions: Float32Array; normals: Float32Array; center: THREE.Vector3 }> = [];
  readonly head: THREE.Bone;
  readonly mouth: THREE.Object3D;
  readonly headTouch: THREE.Object3D;
  private root: THREE.Object3D;
  constructor(root: THREE.Object3D, scene: THREE.Object3D) {
    this.root = root;
    scene.updateWorldMatrix(true, true);
    const get = (name: string) => {
      const node = scene.getObjectByName(name);
      if (!node) throw Error('奶蛙骨架缺少节点：' + name + '，请导入完整模型包');
      return node;
    };
    scene.traverse(o => {
      if (o instanceof THREE.Bone) this.bones.push(o);
      if (o instanceof THREE.Mesh) this.meshes.push(o);
    });
    for (const name of ['PupilL', 'PupilR']) {
      const mesh = get(name) as THREE.Mesh;
      mesh.geometry.computeBoundingBox();
      this.pupils.push({ mesh, positions: Float32Array.from(mesh.geometry.attributes.position.array),
        normals: Float32Array.from(mesh.geometry.attributes.normal.array), center: mesh.geometry.boundingBox!.getCenter(new THREE.Vector3()) });
    }
    this.head = get('head') as THREE.Bone;
    this.mouth = get('mouth'); this.headTouch = get('headTouch');
    // Constructor runs in the bind pose, before AnimationMixer changes the bones.
    const segment = (name: string, next: string): Segment => {
      const bone = get(name) as THREE.Bone;
      if (!bone.isBone) throw Error('奶蛙节点不是骨骼：' + name);
      const q = bone.getWorldQuaternion(new THREE.Quaternion());
      const direction = Y.clone().applyQuaternion(q);
      const n = bone.userData.surface_normal;
      if (!Array.isArray(n) || n.length !== 3 || !n.every(Number.isFinite)) throw Error('奶蛙软臂缺少表面朝向：' + name);
      const normal = new THREE.Vector3(n[0], n[2], -n[1]);
      return { bone, correction: frame(direction, normal).invert().multiply(q), length: position(bone).distanceTo(position(get(next))) };
    };
    this.arms = ['R', 'L'].map(side => {
      const segments = Array.from({ length: 12 }, (_, i) => segment('arm' + String(i + 3).padStart(2, '0') + side,
        i === 11 ? 'hand' + side : 'arm' + String(i + 4).padStart(2, '0') + side));
      const hand = segment('hand' + side, 'finger201' + side);
      const n = hand.bone.userData.surface_normal;
      const normal = new THREE.Vector3(n[0], n[2], -n[1]);
      const fingers = ['finger102','finger202','finger302','thumb02'].flatMap(prefix => {
        const bone = scene.getObjectByName(prefix + side) as THREE.Bone | undefined;
        if (!bone?.isBone) return [];
        const q = bone.getWorldQuaternion(new THREE.Quaternion());
        const axis = Y.clone().applyQuaternion(q).cross(normal).normalize().applyQuaternion(q.invert());
        return [{ bone, axis }];
      });
      return { segments, hand, grip: get(side === 'L' ? 'gripLeft' : 'gripRight'), fingers, twist: 0, mode: 0, cup: 0, curl: 0 };
    });
    for (const name of ['pelvis','spine','chest','thighL','shinL','footL','thighR','shinR','footR','footContactLeft','footContactRight']) get(name);
  }
  /** Release last frame's overrides before sampling the mixer, so nothing accumulates. */
  reset(): void { for (const b of this.bones) { b.matrixAutoUpdate = true; b.updateMatrix(); } }
  private rotate(name: string, x: number, y: number, z: number): void {
    const b = this.bones.find(b => b.name === name)!;
    const delta = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z));
    const m = b.matrix.clone().multiply(delta);
    b.parent!.updateWorldMatrix(true, false);
    worldMatrix(b, b.parent!.matrixWorld.clone().multiply(m));
  }
  pose(dt: number, input: NaiwaFrame): void {
    this.time += dt;
    this.gesture = input.gesture;
    this.sleeping = input.sleeping;
    const response = 1 - Math.exp(-16 * dt);
    const w = input.gesture?.kind === 'wave' ? waveMotion(input.gesture.age) : { lift: 0, swing: 0 };
    if (input.gesture?.kind === 'wave') this.wave.side = input.gesture.side;
    this.wave.lift += (w.lift - this.wave.lift) * response;
    this.wave.swing += (w.swing - this.wave.swing) * response;
    const sniff = input.gesture?.kind === 'sniff' ? sniffMotion(input.gesture.age) : { drip: 0, inhale: 0 };
    this.drip += (sniff.drip - this.drip) * (1 - Math.exp(-(sniff.drip < this.drip ? 35 : 18) * dt));
    this.inhale += (sniff.inhale - this.inhale) * response;
    if (input.gesture?.kind === 'roll') this.rollAge = input.gesture.age;
    const tuck = input.roll?.tuck ?? 0;
    const limbs = rollLimbs(this.rollAge, tuck);
    for (const key of ['left', 'right', 'wiggle', 'brace', 'play'] as const)
      this.roll[key] += (limbs[key] - this.roll[key]) * (1 - Math.exp(-14 * dt));
    this.roll.tuck = tuck;
    // Small chest/head changes accompany input; the pelvis stays seated and planted.
    this.rotate('spine', clamp(input.hunch, -.15, .15) * .35, 0, -clamp(input.lean, -.25, .25) * .42);
    this.rotate('chest', clamp(input.hunch, -.15, .15) * .45, input.head.yaw * .12, -input.lean * .24);
    this.rotate('head', input.head.pitch * .65, input.head.yaw * .75, input.head.roll * .70);
    this.rotate('chest', -.055 * this.inhale - .055 * tuck,
      .07 * this.wave.swing * this.wave.lift + .055 * this.roll.wiggle, -.07 * this.wave.side * this.wave.lift);
    this.rotate('head', -.11 * this.inhale + .035 * this.wave.lift,
      -.06 * this.wave.side * this.wave.lift, -.055 * this.roll.wiggle);
    this.expression += (Math.max(clamp(input.anger, 0, 1), this.roll.play * .72) - this.expression) * (1 - Math.exp(-12 * dt));
    // Mixer expression tracks cannot independently puff cheeks or sustain anger.
    this.morph('CheekPuff.L', 0);
    this.morph('CheekPuff.R', 0);
    this.morph('Frown', this.expression * .65);
    this.morph('Angry', this.expression * .8);
    this.morph('Blink', Math.max(clamp(input.blink, 0, 1), input.sleeping * .98, this.inhale * .92));
    this.morph('Drool', Math.max(0, (input.sleeping - .8) * 5));
    this.root.updateWorldMatrix(true, true);
  }
  /** Pupils share the cat's faster gaze spring; the head follows on its slower spring. */
  eyes(blink: number, sleep: number, gazeX = 0, gazeY = 0, curious = 0, excitement = 0): void {
    this.morph('Blink', Math.max(clamp(blink, 0, 1), sleep * .98, this.inhale * .92));
    const awake = 1 - clamp(sleep, 0, 1);
    const sx = clamp(1 + curious * .22 + excitement * .07 - this.expression * .20, .8, 1.25);
    const sy = clamp(1 + curious * .08 - this.expression * .06, .94, 1.08);
    // Edit from immutable bind coordinates. Only the black pupils move; lids stay attached.
    // Limits keep the pupil inside the white eyeball even when dilated or blinking.
    for (const { mesh, positions, normals, center } of this.pupils) {
      const pos = mesh.geometry.attributes.position, normal = mesh.geometry.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        const j = i * 3;
        pos.setXYZ(i, center.x + (positions[j] - center.x) * sx + clamp(gazeX, -1, 1) * .018 * awake,
          center.y + (positions[j+1] - center.y) * sy + clamp(gazeY, -1, 1) * .017 * awake, positions[j+2]);
        const nx = normals[j] / sx, ny = normals[j+1] / sy, nz = normals[j+2], length = Math.hypot(nx, ny, nz) || 1;
        normal.setXYZ(i, nx / length, ny / length, nz / length);
      }
      pos.needsUpdate = normal.needsUpdate = true;
    }
  }
  canTongueReach(target: THREE.Vector3): boolean {
    return target.toArray().every(Number.isFinite) && position(this.mouth).distanceTo(target) < 4.5;
  }
  /** World-space goals, before the final ground-roll transform. */
  handGoal(side: number, home: THREE.Vector3, out: THREE.Vector3): boolean {
    if (this.roll.tuck > 0) {
      const amount = side < 0 ? this.roll.left : this.roll.right;
      const embrace = new THREE.Vector3(side * (.32 + .035 * this.roll.wiggle), .91 + amount * .12, .68);
      const support = new THREE.Vector3(side * .74, .28, .38);
      embrace.lerp(support, this.roll.brace);
      out.lerpVectors(home, embrace, this.roll.tuck); return true;
    }
    if (this.gesture?.kind === 'wave' && side === this.wave.side) {
      out.copy(position(this.head)).add(new THREE.Vector3(side * (.72 + .075 * this.wave.swing), -.30 + .035 * this.wave.swing, .36));
      out.lerpVectors(home, out, this.wave.lift); return true;
    }
    return false;
  }
  private morph(name: string, value: number): void {
    for (const mesh of this.meshes) {
      const index = mesh.morphTargetDictionary?.[name];
      if (index !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = clamp(value, 0, 1);
    }
  }
  contacts(dt: number, input: NaiwaContacts): void {
    this.solveArm(this.arms[0], input.left, input.leftMode, dt, -1);
    this.solveArm(this.arms[1], input.right, input.rightMode, dt, 1);
    // Feet stay available for grounded tantrums and alternating roll kicks.
    for (const side of ['R', 'L'] as const) {
      const home = position(this.root.getObjectByName(side === 'L' ? 'footContactLeft' : 'footContactRight')!);
      const kick = side === 'R' ? this.roll.left : this.roll.right;
      home.add(new THREE.Vector3((side === 'R' ? -1 : 1) * .065 * kick, .30 * kick, .34 * kick));
      if (input.stomp > .001 && side === 'L') home.y += input.stompLift * .40 * input.stomp;
      if (kick > .001 || input.stomp > .001) this.solveLeg(side, home);
    }
    this.updateDetails(dt, input);
  }
  private updateDetails(dt: number, input: NaiwaContacts): void {
    // Allocate only after the actor's once-only seated normalization.
    if (!this.detailRoot) {
      this.detailRoot = new THREE.Group(); this.detailRoot.name = 'NaiwaLiveDetails'; this.root.add(this.detailRoot);
      const pink = new THREE.MeshStandardMaterial({ color: 0xf27e93, roughness: .38 });
      this.tongueTube = new TaperTube3D(40, 10, pink); this.tongueTube.mesh.name = 'NaiwaTongue';
      this.tongueTip = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), pink); this.tongueTip.name = 'NaiwaTongueTip';
      this.tongueMouth = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0x713c39, roughness: .7 }));
      this.tongueMouth.name = 'NaiwaTongueMouth';
      this.noseDrop = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xc7ebd5, roughness: .19, transparent: true, opacity: .77, depthWrite: false }));
      this.noseDrop.name = 'NaiwaNoseDrop';
      this.detailRoot.add(this.tongueTube.mesh, this.tongueTip, this.tongueMouth, this.noseDrop);
      // Cosmetic details cannot steal head-petting hits, including while hidden.
      for (const mesh of [this.tongueTube.mesh, this.tongueTip, this.tongueMouth, this.noseDrop]) mesh.raycast = () => {};
    }
    worldMatrix(this.detailRoot, new THREE.Matrix4());
    const blocked = this.sleeping > .1 || this.roll.tuck > .01 || input.stomp > .01 || input.leftMode === 'cup' || input.rightMode === 'cup';
    const amount = !blocked && input.tongue && this.canTongueReach(input.tongue) ? clamp(input.tongueWeight, 0, 1) : 0;
    // Engine already eases extension to the key; keep its contact timing exact.
    this.tongueAmount = amount > this.tongueAmount ? amount : Math.max(amount, this.tongueAmount * Math.exp(-30 * dt));
    if (input.tongue && amount > .001) this.tongueGoal.copy(input.tongue);
    const visible = this.tongueAmount > .008;
    this.tongueTube!.mesh.visible = this.tongueTip!.visible = this.tongueMouth!.visible = visible;
    if (visible) {
      const start = position(this.mouth);
      const headRotation = this.head.getWorldQuaternion(new THREE.Quaternion());
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(headRotation).normalize();
      const size = Math.min(1, this.tongueAmount * 5);
      this.tongueMouth!.position.copy(start).addScaledVector(forward, .008);
      this.tongueMouth!.quaternion.copy(headRotation);
      this.tongueMouth!.scale.set(.095, .045, .025).multiplyScalar(size);
      start.addScaledVector(forward, -.018);
      const end = start.clone().lerp(this.tongueGoal, this.tongueAmount);
      // Leave the mouth forwards before descending, so the tongue clears the belly.
      const c1 = start.clone().addScaledVector(forward, .48 * this.tongueAmount);
      const c2 = end.clone().add(new THREE.Vector3(0, .48 * this.tongueAmount, .14 * this.tongueAmount));
      const curve = new THREE.CubicBezierCurve3(start, c1, c2, end);
      this.tongueTube!.update((u, out) => { curve.getPoint(u, out); }, u => (.046 - .012 * u) * size);
      // Oval cross-section: a flat soft tongue, rather than a round cord.
      const geometry = this.tongueTube!.mesh.geometry;
      const pos = geometry.attributes.position, normals = geometry.attributes.normal;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(headRotation);
      const center = new THREE.Vector3(), tangent = new THREE.Vector3(), lateral = new THREE.Vector3();
      const offset = new THREE.Vector3(), normal = new THREE.Vector3();
      for (let ring = 0; ring <= 40; ring++) {
        curve.getPoint(ring / 40, center); curve.getTangent(ring / 40, tangent);
        lateral.copy(right).addScaledVector(tangent, -right.dot(tangent)).normalize();
        for (let radial = 0; radial < 10; radial++) {
          const i = ring * 10 + radial;
          offset.fromBufferAttribute(pos, i).sub(center);
          const width = offset.dot(lateral);
          offset.multiplyScalar(.60).addScaledVector(lateral, width * 1.20).add(center);
          pos.setXYZ(i, offset.x, offset.y, offset.z);
          normal.fromBufferAttribute(normals, i);
          const nx = normal.dot(lateral);
          normal.multiplyScalar(1 / .60).addScaledVector(lateral, nx * (1 / 1.80 - 1 / .60)).normalize();
          normals.setXYZ(i, normal.x, normal.y, normal.z);
        }
      }
      geometry.computeBoundingBox();
      this.tongueTip!.position.copy(end); this.tongueTip!.scale.set(.082, .027, .065).multiplyScalar(size);
    }
    this.noseDrop!.visible = this.drip > .012 && !blocked;
    if (this.noseDrop!.visible) {
      // A tiny drop just above the mouth; the top remains attached while it stretches.
      const nose = position(this.mouth).add(new THREE.Vector3(.075, .105, .012).applyQuaternion(this.head.getWorldQuaternion(new THREE.Quaternion())));
      const length = .02 + .14 * this.drip;
      this.noseDrop!.position.copy(nose).add(new THREE.Vector3(0, -length, .018));
      this.noseDrop!.scale.set(.024 * this.drip, length, .026 * this.drip);
    }
    this.detailRoot.updateWorldMatrix(false, true);
  }
  private solveArm(arm: Arm, target: THREE.Vector3, mode: NaiwaContacts['leftMode'], dt: number, side: number): void {
    const scale = this.root.getWorldScale(new THREE.Vector3()).x;
    const shoulder = position(arm.segments[0].bone);
    const waveLift = this.gesture?.kind === 'wave' && side === this.wave.side ? this.wave.lift : 1;
    arm.mode += ((mode === 'wave' ? waveLift : mode === 'cup' ? .55 : 0) - arm.mode) * (1 - Math.exp(-14 * dt));
    arm.cup += ((mode === 'cup' ? 1 : 0) - arm.cup) * (1 - Math.exp(-14 * dt));
    // Palm faces down at the desk; lifting turns the entire forearm. The cup
    // palm is more upright, keeping its wrist in front of Naiwa's rounded chest.
    const direction = new THREE.Vector3(side * (.09 + .48 * arm.mode), .72 * arm.mode + .35 * arm.cup, (1 - .53 * arm.mode) * (1 - .8 * arm.cup)).normalize();
    const normal = new THREE.Vector3(0, -(1 - arm.mode), arm.mode).normalize();
    const palmQ = frame(direction, normal).multiply(arm.hand.correction);
    const gripOffset = arm.grip.position.clone().multiplyScalar(scale).applyQuaternion(palmQ);
    const wrist = target.clone().sub(gripOffset);
    // Keep the shoulder tangent continuous and bend the elbow outward when raised.
    // A straight shoulder-to-wave curve would compress twelve segments into a stub.
    const startDirection = Y.clone().applyQuaternion(arm.segments[0].bone.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const c1 = shoulder.clone().addScaledVector(startDirection, (.48 - .26 * arm.mode) * scale)
      .add(new THREE.Vector3(side * .10 * arm.mode * scale, .08 * arm.mode * scale, 0));
    const c2 = wrist.clone().addScaledVector(direction, -(.38 - .16 * arm.mode) * scale)
      .add(new THREE.Vector3(side * .04 * arm.mode * scale, 0, .30 * arm.cup * scale));
    const curve = new THREE.CubicBezierCurve3(shoulder, c1, c2, wrist);
    // Arc-length sampling avoids a visible short/long segment seam near the palm.
    const points = curve.getSpacedPoints(arm.segments.length);
    const wristSegmentLength = points[points.length - 2].distanceTo(wrist);
    points[points.length - 2].copy(wrist).addScaledVector(direction, -wristSegmentLength);
    const tangents = arm.segments.map((_, i) => points[i + 1].clone().sub(points[i]).normalize());
    let transported = new THREE.Vector3(0, 0, 1);
    transported.addScaledVector(tangents[0], -transported.dot(tangents[0])).normalize();
    const normals = [transported.clone()];
    for (let i = 1; i < tangents.length; i++) {
      transported.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(tangents[i - 1], tangents[i]));
      normals.push(transported.clone());
    }
    const end = tangents[tangents.length - 1];
    const desired = normal.clone().addScaledVector(end, -normal.dot(end)).normalize();
    let twist = Math.atan2(end.dot(transported.clone().cross(desired)), transported.dot(desired));
    while (twist - arm.twist > Math.PI) twist -= Math.PI * 2;
    while (twist - arm.twist < -Math.PI) twist += Math.PI * 2;
    arm.twist = twist;
    for (let i = 0; i < arm.segments.length; i++) {
      const seg = arm.segments[i];
      const n = normals[i].applyAxisAngle(tangents[i], twist * ease(i / (arm.segments.length - 1)));
      const q = frame(tangents[i], n).multiply(seg.correction);
      const length = points[i].distanceTo(points[i + 1]);
      worldMatrix(seg.bone, new THREE.Matrix4().compose(points[i], q, new THREE.Vector3(scale, length / seg.length, scale)));
    }
    worldMatrix(arm.hand.bone, new THREE.Matrix4().compose(wrist, palmQ, new THREE.Vector3(scale, scale, scale)));
    arm.curl += ((mode === 'cup' ? .35 : 0) - arm.curl) * (1 - Math.exp(-14 * dt));
    for (const [i, { bone, axis }] of arm.fingers.entries()) {
      const angle = arm.curl + (mode === 'wave' ? .06 * Math.sin(this.time * 5 - i * .6) * arm.mode : 0);
      const local = bone.matrix.clone().multiply(new THREE.Matrix4().makeRotationAxis(axis, angle));
      worldMatrix(bone, bone.parent!.matrixWorld.clone().multiply(local));
    }
  }
  private solveLeg(side: 'L' | 'R', contact: THREE.Vector3): void {
    const thigh = this.root.getObjectByName('thigh' + side) as THREE.Bone;
    const shin = this.root.getObjectByName('shin' + side) as THREE.Bone;
    const foot = this.root.getObjectByName('foot' + side) as THREE.Bone;
    const socket = this.root.getObjectByName(side === 'L' ? 'footContactLeft' : 'footContactRight')!;
    const hip = position(thigh), knee = position(shin), ankle = position(foot);
    const goal = contact.clone().sub(position(socket).sub(ankle));
    const a = hip.distanceTo(knee), b = knee.distanceTo(ankle);
    const d = goal.clone().sub(hip); const distance = clamp(d.length(), Math.abs(a - b) + .001, a + b - .001);
    d.normalize(); goal.copy(hip).addScaledVector(d, distance);
    const pole = new THREE.Vector3(side === 'L' ? 1 : -1, .6, .2);
    pole.addScaledVector(d, -pole.dot(d)).normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    const newKnee = hip.clone().addScaledVector(d, along).addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
    const matrices = [thigh.matrixWorld.clone(), shin.matrixWorld.clone(), foot.matrixWorld.clone()];
    for (const [i, bone] of [thigh, shin].entries()) {
      const from = i ? knee : hip, to = i ? ankle : knee;
      const start = i ? newKnee : hip, end = i ? goal : newKnee;
      const q = new THREE.Quaternion().setFromUnitVectors(to.clone().sub(from).normalize(), end.clone().sub(start).normalize());
      const m = new THREE.Matrix4().makeRotationFromQuaternion(q).multiply(matrices[i]); m.setPosition(start);
      worldMatrix(bone, m);
    }
    matrices[2].setPosition(goal); worldMatrix(foot, matrices[2]);
  }
}
