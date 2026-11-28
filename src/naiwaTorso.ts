import * as THREE from 'three';

type Band = { x: number; z: number; rx: number; rz: number; minX: number; maxX: number; minZ: number; maxZ: number };
/** Collision envelope measured from the animated skin in actor space.
 * Only trunk-weighted vertices contribute: an arm can never repel itself.
 * Sampling and relaxation buffers are reused across frames.
 */
export class NaiwaTorso {
  private samples: number[];
  private sampled: THREE.Vector3[];
  private bands: Band[] = [];
  private bandCount = 0;
  private local: THREE.Vector3[] = [];
  private before: THREE.Vector3[] = [];
  private bottom = 0;
  private step = .07;
  private inverse = new THREE.Matrix4();
  private matrix = new THREE.Matrix4();
  private point = new THREE.Vector3();
  private root: THREE.Object3D;
  private skin: THREE.SkinnedMesh;
  constructor(root: THREE.Object3D, skin: THREE.SkinnedMesh) {
    this.root = root; this.skin = skin;
    const ids = skin.geometry.attributes.skinIndex, weights = skin.geometry.attributes.skinWeight;
    const torso = new Set(['pelvis', 'spine', 'chest', 'neck', 'head']);
    const eligible: number[] = [];
    for (let i = 0; i < ids.count; i++) {
      let trunk = 0;
      for (let k = 0; k < 4; k++) {
        if (torso.has(skin.skeleton.bones[ids.getComponent(i, k)].name)) trunk += weights.getComponent(i, k);
      }
      if (trunk > .92) eligible.push(i);
    }
    const stride = Math.max(1, Math.floor(eligible.length / 2400));
    this.samples = eligible.filter((_, i) => i % stride === 0);
    this.sampled = this.samples.map(() => new THREE.Vector3());
  }
  update(): void {
    this.root.updateWorldMatrix(true, true);
    this.inverse.copy(this.root.matrixWorld).invert();
    this.matrix.copy(this.inverse).multiply(this.skin.matrixWorld);
    this.bottom = Infinity;
    let top = -Infinity;
    for (let i = 0; i < this.samples.length; i++) {
      const p = this.skin.getVertexPosition(this.samples[i], this.sampled[i]).applyMatrix4(this.matrix);
      this.bottom = Math.min(this.bottom, p.y); top = Math.max(top, p.y);
    }
    this.bandCount = this.samples.length ? Math.floor((top - this.bottom) / this.step) + 1 : 0;
    for (let i = 0; i < this.bandCount; i++) {
      const b = this.bands[i] ??= { x: 0, z: 0, rx: 0, rz: 0, minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
      b.minX = b.minZ = Infinity; b.maxX = b.maxZ = -Infinity;
    }
    for (const p of this.sampled) {
      const b = this.bands[Math.floor((p.y - this.bottom) / this.step)];
      b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
      b.minZ = Math.min(b.minZ, p.z); b.maxZ = Math.max(b.maxZ, p.z);
    }
    for (let i = 0; i < this.bandCount; i++) {
      const b = this.bands[i];
      b.x = (b.minX + b.maxX) / 2; b.z = (b.minZ + b.maxZ) / 2;
      b.rx = (b.maxX - b.minX) / 2 + .018; b.rz = (b.maxZ - b.minZ) / 2 + .018;
    }
  }
  private project(p: THREE.Vector3, radius: number, side: number): void {
    const f = (p.y - this.bottom) / this.step - .5;
    if (!this.bandCount || f < -1 || f > this.bandCount) return;
    const a = this.bands[THREE.MathUtils.clamp(Math.floor(f), 0, this.bandCount - 1)];
    const b = this.bands[THREE.MathUtils.clamp(Math.ceil(f), 0, this.bandCount - 1)];
    if (a.rx <= 0 || b.rx <= 0) return;
    const t = THREE.MathUtils.clamp(f - Math.floor(f), 0, 1);
    const x = THREE.MathUtils.lerp(a.x, b.x, t), z = THREE.MathUtils.lerp(a.z, b.z, t);
    const rx = THREE.MathUtils.lerp(a.rx, b.rx, t) + radius;
    const rz = THREE.MathUtils.lerp(a.rz, b.rz, t) + radius;
    const dx = (p.x - x) / rx, dz = (p.z - z) / rz;
    const distance = Math.hypot(dx, dz);
    if (distance >= 1) return;
    if (distance < .01) { p.x = x + side * rx; p.z = z; return; }
    p.x = x + dx / distance * rx; p.z = z + dz / distance * rz;
  }
  route(points: THREE.Vector3[], side: number): void {
    const last = points.length - 1;
    for (let i = 0; i <= last; i++) {
      (this.local[i] ??= new THREE.Vector3()).copy(points[i]).applyMatrix4(this.inverse);
      this.before[i] ??= new THREE.Vector3();
    }
    // Root and wrist tangent are boundary conditions. Alternate surface projection
    // with relaxation so the elbow forms an arc, never a sharp collision kink.
    for (let pass = 0; pass < 8; pass++) {
      for (let i = 0; i <= last; i++) this.before[i].copy(this.local[i]);
      for (let i = 2; i < last - 1; i++) {
        if (pass > 0) this.local[i].lerp(this.point.copy(this.before[i - 1]).add(this.before[i + 1]).multiplyScalar(.5), .35);
        this.project(this.local[i], THREE.MathUtils.lerp(.16, .095, i / last), side);
      }
    }
    for (let i = 2; i < last - 1; i++) points[i].copy(this.local[i]).applyMatrix4(this.root.matrixWorld);
  }
}
