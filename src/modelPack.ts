import contract from './modelContract.json';
import { DEFAULT_BUILTIN_CATS, type CatSkinConfig, type ModelProfile } from './catSkins';
export { contract as MODEL_CONTRACT };
export type ModelMode = '2d' | '3d';
export interface ModelPack { format: 'kurocat-model'; version: 1; profile: ModelProfile; skin: CatSkinConfig }
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
    if (new TextEncoder().encode(value).length > contract.maxBytes) throw Error('模型包不能超过 256 KB');
    try { value = JSON.parse(value); } catch { throw Error('文件不是有效的 JSON'); }
  }
  if (!record(value) || value.format !== contract.format || value.version !== 1) throw Error('需要版本 1 的 .kurocat.json 模型包');
  if (new TextEncoder().encode(JSON.stringify(value)).length > contract.maxBytes) throw Error('模型包不能超过 256 KB');
  const p = value.profile;
  if (!record(p) || p.behaviorContract !== 'cat-v1' || !Array.isArray(p.adapters) || p.adapters.length < 1 || p.adapters.length > 2 ||
      new Set(p.adapters).size !== p.adapters.length || p.adapters.some(a => typeof a !== 'string' || !Object.hasOwn(contract.adapters, a))) throw Error('不支持的模型适配器或行为版本');
  const profile: ModelProfile = { adapters: [...p.adapters], behaviorContract: 'cat-v1' };
  for (const k of ['author', 'license'] as const) if (p[k] != null) profile[k] = text(p[k], k, 100);
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
  return { format: 'kurocat-model', version: 1, profile, skin: skin as unknown as CatSkinConfig };
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
  return contract.adapters[preferred === '2d' ? 'canvas-cat-v1' : 'three-cat-v1'].actions;
}
export function exportModelPack(cat: CatSkinConfig): ModelPack {
  if (cat.id === 'dafeiyu') throw Error('大肥鱼使用专用绘制器，暂不支持导出为猫咪模型包');
  const profile = cat.modelProfile ?? { adapters: ['canvas-cat-v1','three-cat-v1'] as ModelProfile['adapters'], behaviorContract: 'cat-v1' as const };
  const { modelProfile: _profile, ...skin } = cat;
  const pack = parseModelPack({ format: 'kurocat-model', version: 1, profile, skin: { ...skin, id: cat.builtin ? cat.id.slice(0,28) + '-custom' : cat.id } });
  delete pack.skin.modelProfile;
  return pack;
}
export function parseModelCatalog(raw: string): ModelPack[] {
  if (new TextEncoder().encode(raw).length > contract.maxBytes) throw Error('目录不能超过 256 KB');
  const data: unknown = JSON.parse(raw);
  if (!record(data) || data.format !== 'kurocat-catalog' || data.version !== 1 || !Array.isArray(data.models) || data.models.length > 50) throw Error('需要版本 1 的模型目录，最多 50 个模型');
  const packs = data.models.map(parseModelPack);
  if (new Set(packs.map(p => p.skin.id)).size !== packs.length) throw Error('目录中有重复的模型 ID');
  return packs;
}
export async function fetchModelCatalog(rawUrl: string): Promise<ModelPack[]> {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'raw.githubusercontent.com' || url.username || url.password || url.port) throw Error('请填写 GitHub 文件的 raw.githubusercontent.com HTTPS 地址');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store' });
    if (!res.ok || !res.body) throw Error('目录读取失败：HTTP ' + res.status);
    const reader = res.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > contract.maxBytes) throw Error('目录不能超过 256 KB'); chunks.push(value);
    } } finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return parseModelCatalog(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally { clearTimeout(timer); }
}
