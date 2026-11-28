/** Bounded, self-contained glTF 2.0 assets. No code, external files or decoder downloads. */
export const MAX_GLB_BYTES = 16 * 1024 * 1024;
export const MAX_MODEL_PACKAGE_BYTES = 23 * 1024 * 1024;
export const GLB_BEHAVIORS = ['idle', 'typing', 'mouse', 'nap', 'angry', 'delight', 'sway', 'wave', 'pet', 'stretch', 'tilt', 'slowBlink', 'groom', 'cuddle', 'roll', 'listen', 'shimmy', 'pawCheck'] as const;
export interface GlbProfile { sha256: string; animations: Partial<Record<typeof GLB_BEHAVIORS[number], string>>; height: number; yaw: number }
export interface GlbAsset { data?: string; url?: string }
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
export function parseGlbProfile(v: unknown): GlbProfile {
  if (!object(v) || !/^[a-f0-9]{64}$/.test(v.sha256) || !object(v.animations)) throw Error('GLB 缺少有效 SHA-256 和动作映射');
  const animations: GlbProfile['animations'] = {};
  for (const [key, name] of Object.entries(v.animations)) {
    if (!(GLB_BEHAVIORS as readonly string[]).includes(key) || typeof name !== 'string' || !name.trim() || name.length > 100 || /[\u0000-\u001f]/.test(name)) throw Error('GLB 不支持的动作映射：' + key);
    animations[key as keyof typeof animations] = name;
  }
  const height = v.height ?? 2.3, yaw = v.yaw ?? 0;
  if (typeof height !== 'number' || !Number.isFinite(height) || height < .5 || height > 4 || typeof yaw !== 'number' || !Number.isFinite(yaw) || Math.abs(yaw) > 180) throw Error('GLB 高度需为 0.5–4，朝向需为 -180–180 度');
  return { sha256: v.sha256, animations, height, yaw };
}
export function validateGlb(bytes: Uint8Array): { animations: string[]; naiwaRig: boolean } {
  if (bytes.length < 24 || bytes.length > MAX_GLB_BYTES) throw Error('GLB 文件大小需在 24 字节至 16 MiB 之间');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) throw Error('需要有效的 glTF 2.0 GLB 文件');
  let json: any; let bin = 0; let binOffset = 0; let chunks = 0;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw Error('GLB 数据块不完整');
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true); offset += 8;
    if (length % 4 || offset + length > bytes.length) throw Error('GLB 数据块长度错误');
    if (chunks === 0 && type === 0x4e4f534a) {
      if (length > 2 * 1024 * 1024) throw Error('GLB 元数据超过限制');
      json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset, offset + length)));
    } else if (chunks === 1 && type === 0x004e4942) { bin = length; binOffset = offset; }
    else throw Error('GLB 只能包含 JSON 和 BIN 数据块');
    chunks++; offset += length;
  }
  if (!json || json.asset?.version !== '2.0' || !Array.isArray(json.meshes) || !json.meshes.length || !bin) throw Error('GLB 缺少有效网格或内嵌数据');
  if (!Array.isArray(json.buffers) || json.buffers.length !== 1 || !Number.isSafeInteger(json.buffers[0]?.byteLength) || json.buffers[0].byteLength > bin || json.buffers[0].byteLength < bin - 3) throw Error('GLB 内嵌缓冲区长度不匹配');
  const inspect = (node: any, depth = 0): void => {
    if (depth > 64) throw Error('GLB JSON 嵌套过深');
    if (!node || typeof node !== 'object') return;
    if (Object.hasOwn(node, 'uri')) throw Error('需要自包含 GLB，不支持外部文件或 data URI');
    for (const child of Object.values(node)) inspect(child, depth + 1);
  };
  inspect(json);
  for (const field of ['buffers','bufferViews','accessors','nodes','meshes','animations','images','textures','skins','scenes','extensionsUsed','extensionsRequired']) {
    if (json[field] != null && (!Array.isArray(json[field]) || json[field].length > 8192)) throw Error('GLB 列表无效：' + field);
  }
  const index = (n: any, list: any[]) => Number.isInteger(n) && n >= 0 && n < list.length;
  const views = json.bufferViews ?? [];
  for (const v of views) if (!object(v) || v.buffer !== 0 || !Number.isSafeInteger(v.byteLength) || v.byteLength < 0 || !Number.isSafeInteger(v.byteOffset ?? 0) || (v.byteOffset ?? 0) < 0 || (v.byteOffset ?? 0) + v.byteLength > json.buffers[0].byteLength) throw Error('GLB bufferView 超出文件范围');
  let allocation = 0;
  for (const a of json.accessors ?? []) {
    const width: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
    if (!object(a) || !Number.isSafeInteger(a.count) || a.count < 1 || a.count > 2000000 || !width[a.type] || ![5120,5121,5122,5123,5125,5126].includes(a.componentType) || (a.bufferView != null && !index(a.bufferView, views))) throw Error('GLB accessor 无效或过大');
    allocation += a.count * width[a.type] * 4;
  }
  if (allocation > 128 * 1024 * 1024) throw Error('GLB 解码数据超过 128 MiB');
  const nodes = json.nodes ?? []; const parents = new Set<number>(); const visiting = new Set<number>(); const visited = new Set<number>();
  const walk = (i: number, depth: number): void => {
    if (depth > 128 || visiting.has(i)) throw Error('GLB 节点循环或层级过深');
    if (visited.has(i)) return;
    if (!object(nodes[i])) throw Error('GLB 节点无效');
    visiting.add(i);
    const children = nodes[i].children ?? [];
    if (!Array.isArray(children)) throw Error('GLB 子节点列表无效');
    for (const child of children) { if (!index(child, nodes) || parents.has(child)) throw Error('GLB 子节点越界或重复父级'); parents.add(child); walk(child, depth + 1); }
    visiting.delete(i); visited.add(i);
  };
  nodes.forEach((_: unknown, i: number) => walk(i, 0));
  for (const scene of json.scenes ?? []) if (!object(scene) || (scene.nodes != null && (!Array.isArray(scene.nodes) || scene.nodes.some((n: any) => !index(n, nodes))))) throw Error('GLB 场景节点无效');
  if ((json.images?.length ?? 0) > 16) throw Error('GLB 最多 16 张纹理');
  let pixels = 0;
  for (const image of json.images ?? []) {
    if (!object(image) || !index(image.bufferView, views) || !['image/png','image/jpeg'].includes(image.mimeType)) throw Error('GLB 纹理需内嵌 PNG/JPEG');
    const v = views[image.bufferView], start = binOffset + (v.byteOffset ?? 0);
    pixels += imagePixels(bytes.subarray(start, start + v.byteLength), image.mimeType);
  }
  if (pixels > 16 * 1024 * 1024) throw Error('GLB 纹理合计不能超过 1600 万像素');
  const unsupported = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'];
  if (json.extensionsUsed?.some((e: string) => unsupported.includes(e))) throw Error('请导出不含 Draco、Meshopt 或 KTX2 压缩的 GLB');
  const supported = ['KHR_materials_clearcoat','KHR_materials_unlit','KHR_materials_emissive_strength','KHR_materials_ior','KHR_materials_specular','KHR_materials_transmission','KHR_materials_volume','KHR_materials_sheen','KHR_materials_iridescence','KHR_materials_anisotropy','KHR_texture_transform','KHR_mesh_quantization'];
  if (json.extensionsRequired?.some((e: string) => !supported.includes(e))) throw Error('GLB 包含不支持的必需扩展');
  if ((json.nodes?.length ?? 0) > 4096 || json.meshes.length > 512 || (json.animations?.length ?? 0) > 64) throw Error('GLB 超过复杂度限制：4096 节点、512 网格、64 动作');
  const names = (json.animations ?? []).map((a: any, i: number) => {
    if (!object(a) || (a.name != null && typeof a.name !== 'string')) throw Error('GLB 动作名称无效');
    return a.name || `animation_${i}`;
  });
  if (new Set(names).size !== names.length) throw Error('GLB 动作名称重复，请为每个动作命名');
  return { animations: names, naiwaRig: isNaiwaRig(json, names) };
}
/** Structural signature, never a filename guess. Names alone cannot enable live controls. */
function isNaiwaRig(doc: any, clips: string[]): boolean {
  const nodes: any[] = doc.nodes ?? [];
  const byName = new Map<string, number>();
  for (const [i, node] of nodes.entries()) {
    if (typeof node?.name !== 'string' || !node.name) continue;
    const name = node.name.replace(/[.]/g, '');
    if (byName.has(name)) return false;
    byName.set(name, i);
  }
  const exists = (name: string) => byName.has(name);
  const child = (parent: string, name: string) => exists(parent) && exists(name) &&
    (nodes[byName.get(parent)!].children ?? []).includes(byName.get(name));
  const parents = new Map<number, number>();
  nodes.forEach((node, parent) => (node.children ?? []).forEach((index: number) => parents.set(index, parent)));
  const descendant = (parent: string, name: string) => {
    if (!exists(parent) || !exists(name)) return false;
    let index = parents.get(byName.get(name)!);
    for (let depth = 0; index !== undefined && depth < nodes.length; depth++) {
      if (index === byName.get(parent)) return true;
      index = parents.get(index);
    }
    return false;
  };
  const pupil = (name: string) => {
    const node = nodes[byName.get(name)!], mesh = doc.meshes?.[node?.mesh];
    if (!mesh?.primitives?.length) return false;
    // GLTFLoader creates a Group for multiple primitives; the gaze controller needs one Mesh.
    if (mesh.primitives.length !== 1) return false;
    const attributes = mesh.primitives[0].attributes;
    const position = doc.accessors?.[attributes?.POSITION], normal = doc.accessors?.[attributes?.NORMAL];
    return position?.type === 'VEC3' && position.count > 0 && normal?.type === 'VEC3' && normal.count === position.count;
  };
  const joints = new Set<number>((doc.skins ?? []).flatMap((s: any) => s.joints ?? []));
  const bone = (name: string) => exists(name) && joints.has(byName.get(name)!);
  const normal = (name: string) => {
    const n = nodes[byName.get(name)!]?.extras?.surface_normal;
    return Array.isArray(n) && n.length === 3 && n.every(Number.isFinite) && Math.hypot(...n) > .5;
  };
  if (!['PupilL','PupilR'].every(pupil) || !['pelvis','spine','chest','head'].every(bone) ||
    !child('pelvis','spine') || !child('spine','chest') || !descendant('chest','head') ||
    !child('head','mouth') || !child('head','headTouch')) return false;
  for (const side of ['L','R']) {
    if (!descendant('chest','arm03'+side) || !child('pelvis','thigh'+side) ||
      !['thigh','shin','foot','finger201'].every(prefix => bone(prefix+side))) return false;
    for (let i = 3; i <= 14; i++) {
      const name = 'arm' + String(i).padStart(2,'0') + side;
      const next = i === 14 ? 'hand' + side : 'arm' + String(i+1).padStart(2,'0') + side;
      if (!bone(name) || !normal(name) || !child(name,next)) return false;
    }
    if (!bone('hand'+side) || !normal('hand'+side) || !child('hand'+side,'finger201'+side) ||
      !child('hand'+side,side==='L'?'gripLeft':'gripRight') || !child('thigh'+side,'shin'+side) ||
      !child('shin'+side,'foot'+side) || !child('foot'+side,side==='L'?'footContactLeft':'footContactRight')) return false;
  }
  const morphs = new Set<string>((doc.meshes ?? []).flatMap((m: any) => m.extras?.targetNames ?? []));
  return ['CheekPuff.L','CheekPuff.R','Blink','Angry','Drool'].every(n=>morphs.has(n)) && clips.includes('idle') && clips.includes('nap');
}
function imagePixels(bytes: Uint8Array, mime: string): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const checked = (w: number, h: number) => {
    if (!w || !h || w > 4096 || h > 4096) throw Error('GLB 纹理尺寸需在 1–4096 像素之间');
    return w * h;
  };
  if (mime === 'image/png' && bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a && view.getUint32(12) === 0x49484452) return checked(view.getUint32(16), view.getUint32(20));
  if (mime === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let at = 2; at + 4 <= bytes.length;) {
      if (bytes[at++] !== 0xff) break;
      while (bytes[at] === 0xff) at++;
      const marker = bytes[at++];
      if (marker === 0xda || marker === 0xd9 || at + 2 > bytes.length) break;
      const length = view.getUint16(at);
      if (length < 2 || at + length > bytes.length) break;
      if ([0xc0,0xc1,0xc2].includes(marker) && length >= 8) return checked(view.getUint16(at + 5), view.getUint16(at + 3));
      at += length;
    }
  }
  throw Error('GLB 纹理不是有效的 PNG 或常规 JPEG');
}
export function decodeGlb(data: string): Uint8Array {
  if (typeof data !== 'string' || !data.length || data.length > Math.ceil(MAX_GLB_BYTES / 3) * 4 || (data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(data) || /=/.test(data.slice(0, -2)) || !/^[A-Za-z0-9+/]*={0,2}$/.test(data.slice(-4)))) throw Error('GLB Base64 无效或超过 16 MiB');
  const binary = atob(data); if (btoa(binary) !== data) throw Error('GLB Base64 非规范填充'); return Uint8Array.from(binary, c => c.charCodeAt(0));
}
export function encodeGlb(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 32768) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  return btoa(chunks.join(''));
}
export async function glbHash(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function validateGlbMapping(profile: GlbProfile, bytes: Uint8Array, naiwa = false): void {
  const info = validateGlb(bytes);
  if (naiwa && (!info.naiwaRig || !profile.animations.idle || !profile.animations.nap)) throw Error('奶蛙专用适配器需要完整骨架、挂点、表情及 idle/nap 动画；普通模型请使用 three-glb-v1');
  for (const clip of Object.values(profile.animations)) if (!info.animations.includes(clip!)) throw Error('GLB 没有对应的动画片段：' + clip);
}
export function glbUrl(url: string): string {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.hostname !== 'raw.githubusercontent.com' || u.username || u.password || u.port || u.search || u.hash || !u.pathname.toLowerCase().endsWith('.glb')) throw Error('GLB 下载地址需要 GitHub Raw 的 HTTPS .glb 文件');
  return u.href;
}
// Only the current import selection is kept in memory; installed binaries live outside settings.
const pending = new Map<string, Uint8Array>();
export function clearPendingGlbs(): void { pending.clear(); }
export function pendingGlb(hash: string): Uint8Array | undefined { return pending.get(hash); }
export async function resolveGlbAsset(profile: GlbProfile, asset?: GlbAsset, naiwa = false): Promise<Uint8Array> {
  let bytes = asset?.data != null ? decodeGlb(asset.data) : pending.get(profile.sha256);
  if (!bytes && asset?.url) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(glbUrl(asset.url), { signal: controller.signal, credentials: 'omit', redirect: 'error' });
      if (!response.ok || !response.body) throw Error('GLB 下载失败：HTTP ' + response.status);
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try { for (;;) { const {value, done} = await reader.read(); if (done) break;
        size += value.length; if (size > MAX_GLB_BYTES) throw Error('GLB 文件不能超过 16 MiB'); chunks.push(value);
      } } finally { await reader.cancel().catch(() => {}); }
      bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    } finally { clearTimeout(timer); }
  }
  if (!bytes) throw Error('3D 模型缺少 GLB，请导入 .glb 或含 asset.data / asset.url 的版本 2 模型包');
  validateGlbMapping(profile, bytes, naiwa);
  if (await glbHash(bytes) !== profile.sha256) throw Error('GLB 与模型配置的 SHA-256 不匹配，请检查文件版本');
  if (!pending.has(profile.sha256)) { pending.clear(); pending.set(profile.sha256, bytes); }
  return bytes;
}
