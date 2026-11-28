import { parseGlbProfile, decodeGlb, validateGlbMapping, glbUrl, MAX_MODEL_PACKAGE_BYTES, type GlbAsset } from './glbModel';
import contract from './modelContract.json';
import { DEFAULT_BUILTIN_CATS, type CatSkinConfig, type ModelProfile } from './catSkins';
export { contract as MODEL_CONTRACT };
export type ModelMode = '2d' | '3d';
export interface ModelPack { format: 'kurocat-model'; version: 1 | 2; profile: ModelProfile; skin: CatSkinConfig; asset?: GlbAsset }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const color = (v: unknown): boolean => {
  if (typeof v !== 'string') return false;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return true;
  const m = /^rgba?\(([^)]+)\)$/.exec(v); if (!m) return false;
  const parts = m[1].split(',').map(p => p.trim());
  if (parts.length !== (v.startsWith('rgba') ? 4 : 3) || parts.some(p => !/^\d+(?:\.\d+)?$/.test(p))) return false;
  return parts.every((p, i) => Number(p) >= 0 && Number(p) <= (i === 3 ? 1 : 255));
};
function text(v: unknown, field: string, max: number): string {
  if (typeof v !== 'string' || !v.trim() || Array.from(v).length > max || /[\u0000-\u001f\u007f-\u009f]/.test(v)) throw Error(field + ' 格式不正确');
  return v.trim();
}
export function parseModelPack(value: unknown): ModelPack {
  if (typeof value === 'string') {
    if (new TextEncoder().encode(value).length > MAX_MODEL_PACKAGE_BYTES) throw Error('外观包上限 256 KB，GLB 模型包上限 23 MiB');
    try { value = JSON.parse(value); } catch { throw Error('文件不是有效的 JSON'); }
  }
  if (!record(value) || value.format !== contract.format || (value.version !== 1 && value.version !== 2)) throw Error('需要版本 1 或 2 的 .kurocat.json 模型包');
  if (new TextEncoder().encode(JSON.stringify(value)).length > (value.version === 2 ? MAX_MODEL_PACKAGE_BYTES : contract.maxBytes)) throw Error('外观包上限 256 KB，GLB 模型包上限 23 MiB');
  const p = value.profile;
  if (!record(p)) throw Error('缺少 profile 模型配置');
  if (p.behaviorContract !== contract.behaviorContract) throw Error('不支持的行为版本：' + String(p.behaviorContract) + '；当前支持 ' + contract.behaviorContract);
  if (!Array.isArray(p.adapters) || p.adapters.length < 1 || p.adapters.length > 2) throw Error('profile.adapters 需要 1–2 个适配器');
  const supported = Object.keys(contract.adapters);
  const unknown = p.adapters.filter(a => typeof a !== 'string' || !Object.hasOwn(contract.adapters, a));
  if (unknown.length) throw Error('不支持的模型适配器：' + unknown.map(String).join('、') + '。当前支持：' + supported.join('、') + '。请检查拼写或更新 DIY-Cat。3D 奶蛙需使用版本 2 的 GLB 模型包。');
  const adapters = p.adapters as ModelProfile['adapters'];
  if (new Set(adapters.map(a => contract.adapters[a].mode)).size !== adapters.length) throw Error('同一个 2D/3D 模式只能声明一个适配器');
  const profile: ModelProfile = { adapters: [...adapters], behaviorContract: 'cat-v1' };
  const isGlb = adapters.some(a => a === 'three-glb-v1' || a === 'three-naiwa-v1');
  let asset: GlbAsset | undefined;
  if (isGlb) {
    if (value.version !== 2) throw Error('GLB 模型需要版本 2 的模型包');
    profile.glb = parseGlbProfile(p.glb);
    if (!record(value.asset) || (typeof value.asset.data === 'string') === (typeof value.asset.url === 'string')) throw Error('GLB 模型需要 asset.data 或 asset.url，只能选择一种');
    asset = typeof value.asset.data === 'string' ? { data: value.asset.data } : { url: glbUrl(String(value.asset.url)) };
    if (asset.data != null) validateGlbMapping(profile.glb, decodeGlb(asset.data));
  } else if (value.version !== 1 || p.glb != null || value.asset != null) throw Error('外观配置使用版本 1；GLB 需使用 three-glb-v1 适配器');
  for (const k of ['author', 'license'] as const) if (p[k] != null) profile[k] = text(p[k], k, 100);
  if (p.revision != null) {
    if (!Number.isSafeInteger(p.revision) || Number(p.revision) < 1 || Number(p.revision) > 2147483647) throw Error('模型修订号需要 1–2147483647 的整数');
    profile.revision = Number(p.revision);
  }
  if (p.description != null) profile.description = text(p.description, '模型简介', 240);
  const s = value.skin;
  if (!record(s)) throw Error('缺少 skin 外观数据');
  const id = text(s.id, '模型 ID', 36);
  if (!/^[a-z0-9][a-z0-9_-]{0,35}$/.test(id) || DEFAULT_BUILTIN_CATS.some(c => c.id === id)) throw Error('模型 ID 只能包含小写字母、数字、下划线或短横线，且不能使用内置 ID');
  const skin: Record<string, unknown> = { id, name: text(s.name, '模型名称', 48), builtin: false, modelProfile: profile };
  if (s.emoji != null) skin.emoji = text(s.emoji, '图标', 12);
  for (const k of contract.skinRules.requiredColors) if (!color(s[k])) throw Error(k + ' 需要 #RRGGBB、rgb 或 rgba 颜色');
  for (const k of contract.skinRules.colors) if (s[k] != null) {
    if (!color(s[k])) throw Error(k + ' 需要 #RRGGBB、rgb 或 rgba 颜色');
    skin[k] = s[k];
  }
  for (const k of contract.skinRules.booleans) if (s[k] != null) {
    if (typeof s[k] !== 'boolean') throw Error(k + ' 需要布尔值');
    skin[k] = s[k];
  }
  if (s.pattern != null) {
    if (!contract.skinRules.patterns.includes(s.pattern as string)) throw Error('不支持的毛色花纹');
    skin.pattern = s.pattern;
  }
  if (s.spots != null) {
    if (!Array.isArray(s.spots) || s.spots.length > 64) throw Error('斑点最多 64 个');
    skin.spots = s.spots.map((spot: unknown) => {
      if (!record(spot) || !['head','body','leftArm','rightArm'].includes(String(spot.part)) || !color(spot.color)) throw Error('斑点部位或颜色无效');
      const out: Record<string, unknown> = { part: spot.part, color: spot.color };
      for (const k of ['x','y','rx','ry','rotation','opacity']) {
        const v = spot[k] ?? (k === 'rotation' ? 0 : k === 'opacity' ? 1 : NaN);
        if (typeof v !== 'number' || !Number.isFinite(v) || (k === 'opacity' ? v < 0 || v > 1 : k === 'rx' || k === 'ry' ? v <= 0 || v > 300 : Math.abs(v) > 360)) throw Error('斑点参数超出范围：' + k);
        out[k] = v;
      }
      return out;
    });
  }
  return { format: 'kurocat-model', version: isGlb ? 2 : 1, profile, skin: skin as unknown as CatSkinConfig, ...(asset ? { asset } : {}) };
}
export function modelModes(cat?: CatSkinConfig): ModelMode[] {
  if (cat?.id === 'dafeiyu') return ['2d'];
  return (cat?.modelProfile?.adapters ?? ['canvas-cat-v1','three-cat-v1']).map(a => contract.adapters[a]?.mode as ModelMode).filter(m => m === '2d' || m === '3d');
}
export function modelMode(cat: CatSkinConfig | undefined, preferred: ModelMode): ModelMode {
  const modes = modelModes(cat); return modes.includes(preferred) ? preferred : modes[0] ?? '2d';
}
export function modelActions(cat: CatSkinConfig | undefined, preferred: ModelMode): string[] {
  if (!modelModes(cat).includes(preferred)) return [];
  if (cat?.id === 'dafeiyu') return contract.specialModels.dafeiyu.actions;
  const adapters = cat?.modelProfile?.adapters ?? ['canvas-cat-v1', 'three-cat-v1'];
  const adapter = adapters.find(a => contract.adapters[a]?.mode === preferred)
    ?? (preferred === '2d' ? 'canvas-cat-v1' : 'three-cat-v1');
  if (preferred === '3d' && cat?.modelProfile?.glb) return Object.keys(cat.modelProfile.glb.animations).filter(k => !['idle','typing','mouse','angry','pet'].includes(k)).concat('calm');
  return contract.adapters[adapter].actions;
}
export function exportModelPack(cat: CatSkinConfig, asset?: GlbAsset): ModelPack {
  if (cat.id === 'dafeiyu') throw Error('大肥鱼使用专用绘制器，暂不支持导出为猫咪模型包');
  const profile = cat.modelProfile ?? { adapters: ['canvas-cat-v1','three-cat-v1'] as ModelProfile['adapters'], behaviorContract: 'cat-v1' as const };
  const { modelProfile: _profile, ...skin } = cat;
  if (profile.glb) return { format: 'kurocat-model', version: 2, profile, skin: { ...skin, builtin: false }, ...(asset ? { asset } : {}) };
  const pack = parseModelPack({ format: 'kurocat-model', version: 1, profile, skin: { ...skin, id: cat.builtin ? cat.id.slice(0,28) + '-custom' : cat.id } });
  delete pack.skin.modelProfile;
  return pack;
}
export function parseModelCatalog(raw: string): ModelPack[] {
  if (new TextEncoder().encode(raw).length > contract.maxBytes) throw Error('目录不能超过 256 KB');
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw Error('目录不是有效的 JSON，请确认选择的是 catalog.json'); }
  if (!record(data) || data.format !== 'kurocat-catalog' || data.version !== 1 || !Array.isArray(data.models) || data.models.length > 50) throw Error('需要版本 1 的模型目录，最多 50 个模型');
  const packs = data.models.map(parseModelPack);
  if (new Set(packs.map(p => p.skin.id)).size !== packs.length) throw Error('目录中有重复的模型 ID');
  return packs;
}
export async function fetchModelCatalog(rawUrl: string): Promise<ModelPack[]> { return parseModelCatalog(await fetchCatalogText(rawUrl)); }
export async function fetchCatalogText(rawUrl: string): Promise<string> {
  const url = new URL(normalizeCatalogUrl(rawUrl));
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store' });
    if (res.status === 404) throw Error('找不到模型目录：请检查仓库、分支和路径，或等待 GitHub 模型目录工作流完成后刷新');
    if (!res.ok || !res.body) throw Error('目录读取失败：HTTP ' + res.status + '，请稍后重试');
    const reader = res.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > contract.maxBytes) throw Error('目录不能超过 256 KB'); chunks.push(value);
    } } finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (e) {
    if (controller.signal.aborted) throw Error('读取 GitHub 超时，请检查网络后重试');
    if (e instanceof TypeError) throw Error('无法读取模型目录，请检查网络、UTF-8 文件编码和 GitHub 地址');
    throw e;
  } finally { clearTimeout(timer); }
}

/** Public catalog only; no GitHub token is needed or stored by the pet. */
export const DEFAULT_MODEL_CATALOG = contract.library.defaultCatalog;
export const MODEL_PUBLISH_PAGE = contract.library.publishPage;
export const MODEL_GUIDE_PAGE = contract.library.guidePage;
export function normalizeCatalogUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw Error('请填写完整的 GitHub 模型目录地址'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) throw Error('目录地址需要 HTTPS，不能包含登录信息、查询参数或片段');
  if (url.hostname === 'github.com') {
    const match = /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(url.pathname);
    if (!match) throw Error('请复制 GitHub 中 catalog.json 的文件地址或 Raw 地址');
    url = new URL('https://raw.githubusercontent.com/' + match[1] + '/' + match[2] + '/' + match[3]);
  }
  if (url.hostname !== 'raw.githubusercontent.com' || !/^\/[^/]+\/[^/]+\/.+\/.+\.json$/.test(url.pathname)) throw Error('请填写 GitHub 文件的 raw.githubusercontent.com HTTPS 地址');
  return url.href;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (record(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export type ModelInstallState = 'new' | 'installed' | 'update' | 'local-newer' | 'different';
export function modelInstallState(pack: ModelPack, installed: CatSkinConfig[]): ModelInstallState {
  const local = installed.find(c => c.id === pack.skin.id);
  if (!local) return 'new';
  try {
    const a = exportModelPack(local); const b = exportModelPack({ ...pack.skin, modelProfile: pack.profile });
    a.profile = { ...a.profile }; b.profile = { ...b.profile };
    delete a.asset; delete b.asset;
    a.profile.revision ??= 1; b.profile.revision ??= 1;
    if (canonical(a) === canonical(b)) return 'installed';
    if (b.profile.revision > a.profile.revision) return 'update';
    if (b.profile.revision < a.profile.revision) return 'local-newer';
  } catch { /* Legacy custom skins can be replaced explicitly. */ }
  return 'different';
}

export function modelRig(cat?: CatSkinConfig, preferred: ModelMode = '2d'): keyof typeof contract.rigs {
  if (cat?.id === 'dafeiyu') return 'dafeiyu';
  const mode = modelMode(cat, preferred);
  const adapter = cat?.modelProfile?.adapters.find(a => contract.adapters[a]?.mode === mode);
  return adapter ? contract.adapters[adapter].rig as keyof typeof contract.rigs : 'cat';
}
export function modelActionLabel(cat: CatSkinConfig | undefined, action: string, mode: ModelMode = '2d'): string {
  const rig = contract.rigs[modelRig(cat, mode)];
  const overrides = 'actionLabels' in rig ? rig.actionLabels as Record<string, string> : {};
  return overrides[action] ?? (contract.actionLabels as Record<string, string>)[action] ?? action;
}
