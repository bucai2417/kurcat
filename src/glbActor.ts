import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { invoke } from '@tauri-apps/api/core';
import type { CatSkinConfig } from './catSkins';
import { decodeGlb, glbHash, pendingGlb, validateGlbMapping, type GlbProfile } from './glbModel';

type Behavior = keyof GlbProfile['animations'];
/** An imported actor owns its mixer and GPU resources; desk and shared effects stay in the engine. */
export class GlbActor {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<Behavior, THREE.AnimationAction>();
  private current?: THREE.AnimationAction;
  private manual?: { key: Behavior; remaining: number };
  private clock = 0;
  private nextFidget = 12;
  private boundsIn = 0;
  private napTime = 0;
  private blendTime = .22;
  private blendFrom = new Map<THREE.AnimationAction, number>();
  private readonly naiwa: boolean;
  private constructor(scene: THREE.Group, clips: THREE.AnimationClip[], profile: GlbProfile, naiwa = false) {
    this.naiwa = naiwa;
    this.root.add(scene);
    this.root.rotation.y = THREE.MathUtils.degToRad(profile.yaw);
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.root);
    const height = box.max.y - box.min.y;
    if (!Number.isFinite(height) || height < 1e-5) throw Error('GLB 网格没有有效高度');
    const scale = profile.height / height;
    this.root.scale.setScalar(scale);
    const center = box.getCenter(new THREE.Vector3());
    this.root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    this.mixer = new THREE.AnimationMixer(scene);
    for (const [key, name] of Object.entries(profile.animations)) {
      const clip = clips.find(c => c.name === name);
      if (clip && clip.duration > 0) this.actions.set(key as Behavior, this.mixer.clipAction(clip));
    }
    this.play('idle'); this.mixer.update(0);
  }
  static async load(cat: CatSkinConfig): Promise<GlbActor> {
    const profile = cat.modelProfile!.glb!;
    const bytes = pendingGlb(profile.sha256) ?? decodeGlb(await invoke<string>('read_model_glb', { id: cat.id }));
    validateGlbMapping(profile, bytes);
    if (await glbHash(bytes) !== profile.sha256) throw Error('已保存的 3D 文件校验失败，请重新导入');
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(url => { if (!url.startsWith('blob:')) throw Error('禁止加载 GLB 外部资源'); return url; });
    const gltf = await new GLTFLoader(manager).parseAsync(bytes.slice().buffer, '');
    try { return new GlbActor(gltf.scene, gltf.animations, profile, cat.modelProfile!.adapters.includes('three-naiwa-v1')); }
    catch (error) { disposeScene(gltf.scene); throw error; }
  }
  trigger(key: string): boolean {
    if (key === 'calm') { this.manual = undefined; return true; }
    const action = this.actions.get(key as Behavior);
    if (!action) return false;
    this.manual = { key: key as Behavior, remaining: action.getClip().duration };
    this.napTime = 0;
    this.play(key as Behavior, true, true); return true;
  }
  interrupt(): void { this.manual = undefined; }
  private play(key: Behavior, once = false, restart = false): void {
    const next = this.actions.get(key) ?? this.actions.get('idle');
    if (!next) { this.mixer.stopAllAction(); this.current = undefined; this.blendFrom.clear(); return; }
    // Aliased behavior names can share one clip. Always release the nap clock.
    next.setEffectiveTimeScale(1);
    if (next === this.current && !restart && next.loop === (once ? THREE.LoopOnce : THREE.LoopRepeat)) return;
    const previous = this.current;
    this.blendFrom.clear();
    for (const action of new Set(this.actions.values())) {
      this.blendFrom.set(action, action.isScheduled() ? action.getEffectiveWeight() : 0);
      action.stopFading();
    }
    // Returning to an action during its fade keeps its current phase.
    if (restart || !next.isScheduled() || !next.enabled || next.paused) next.reset();
    next.setEffectiveTimeScale(1);
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once; next.play();
    this.current = next;
    this.blendTime = previous ? 0 : .22;
  }
  update(dt: number, state: Behavior, autoIdle: boolean): void {
    this.clock += dt;
    if (state === 'angry' || state === 'pet' || state === 'typing' || state === 'mouse') this.manual = undefined;
    if (this.manual && (this.manual.remaining -= dt) <= 0) this.manual = undefined;
    if (state === 'idle' && autoIdle && !this.manual && this.clock >= this.nextFidget) {
      const choices = (['sway', 'tilt', 'slowBlink', 'listen', 'pawCheck'] as Behavior[]).filter(k => this.actions.has(k));
      if (choices.length) this.trigger(choices[Math.floor(Math.random() * choices.length)]);
      this.nextFidget = this.clock + 12 + Math.random() * 10;
    }
    const key = this.manual?.key ?? state;
    this.play(key, !!this.manual);
    // The authored Naiwa nap includes a wake-up for the stand-alone preview.
    // In the pet, keep the settled middle section breathing until a real wake event.
    if (this.naiwa && key === 'nap' && this.current && this.current === this.actions.get('nap')) {
      this.napTime += Math.min(dt, .1);
      const duration = this.current!.getClip().duration;
      const phase = this.napTime / duration;
      this.current!.time = duration * (phase <= .4 ? phase : .5 - .1 * Math.cos((phase - .4) * Math.PI * 2));
      this.current!.setEffectiveTimeScale(0);
    } else this.napTime = 0;
    this.blendTime = Math.min(.22, this.blendTime + Math.min(dt, .1));
    const t = this.blendTime / .22, eased = t * t * (3 - 2 * t);
    for (const [action, from] of this.blendFrom) {
      const weight = THREE.MathUtils.lerp(from, action === this.current ? 1 : 0, eased);
      action.setEffectiveWeight(weight);
      if (eased === 1 && action !== this.current) action.stop();
    }
    if (eased === 1) this.blendFrom.clear();
    this.mixer.update(Math.min(dt, .1));
    // SkinnedMesh geometry bounds describe the bind pose. Refresh posed bounds
    // at 5 Hz for pointer regions and raycast culling without scanning every frame.
    this.boundsIn -= dt;
    if (this.boundsIn <= 0) {
      this.boundsIn = .2;
      this.root.updateMatrixWorld(true);
      this.root.traverse(obj => {
        if (!(obj instanceof THREE.SkinnedMesh)) return;
        obj.computeBoundingBox();
        if (obj.boundingBox) {
          obj.boundingSphere ??= new THREE.Sphere();
          obj.boundingBox.getBoundingSphere(obj.boundingSphere);
        }
      });
    }
  }
  dispose(): void { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.mixer.getRoot()); this.root.removeFromParent(); disposeScene(this.root); }
}
function disposeScene(root: THREE.Object3D): void {
  const textures = new Set<THREE.Texture>(), materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
  root.traverse(obj => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    for (const mat of (Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [])) materials.add(mat);
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) (obj as THREE.SkinnedMesh).skeleton.dispose();
  });
  for (const mat of materials) { for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value); mat.dispose(); }
  for (const texture of textures) { texture.dispose(); const image = texture.source?.data; if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close(); }
  for (const geometry of geometries) geometry.dispose();
}
