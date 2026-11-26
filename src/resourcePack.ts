import contract from './resourceContract.json';
import { BUILTIN_DESK_SKINS, type DeskSkinConfig, type KeyboardSkin, type MouseSkin } from './deskSkin';
import { fetchCatalogText, type ModelMode } from './modelPack';
export type ResourceKind = 'keyboard' | 'mouse';
export type ResourceSlot = 'keyboard2d' | 'keyboard3d' | 'mouse2d' | 'mouse3d';
export type ResourceSelections = Partial<Record<ResourceSlot, string>>;
interface ResourceBase { format: 'diy-cat-resource'; version: 1; id: string; name: string; modes: ModelMode[]; revision: number; author?: string; license?: string; description?: string }
export type ResourcePack = ResourceBase & ({ kind: 'keyboard'; skin: KeyboardSkin } | { kind: 'mouse'; skin: MouseSkin });
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function text(v: unknown, label: string, max: number): string {
  if (typeof v !== 'string' || !v.trim() || Array.from(v).length > max || /[\u0000-\u001f\u007f-\u009f]/.test(v)) throw Error(label + ' 格式不正确');
  return v.trim();
}
const color = (v: unknown) => typeof v === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
export function parseResourcePack(raw: unknown): ResourcePack {
  if (new TextEncoder().encode(typeof raw === 'string' ? raw : JSON.stringify(raw)).length > contract.maxBytes) throw Error('资源包不能超过 256 KB');
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { throw Error('资源包不是有效 JSON'); } }
  if (!object(raw) || raw.format !== contract.format || raw.version !== 1 || !['keyboard', 'mouse'].includes(String(raw.kind))) throw Error('请选择版本 1 的 DIY-Cat 键盘或鼠标资源包');
  const kind = raw.kind as ResourceKind;
  const id = text(raw.id, '资源 ID', 36);
  if (!/^[a-z0-9][a-z0-9_-]{0,35}$/.test(id) || id.startsWith('builtin-')) throw Error('资源 ID 需为小写字母、数字、短横线或下划线，不能以 builtin- 开头');
  if (!Array.isArray(raw.modes) || raw.modes.length < 1 || raw.modes.length > 2 || new Set(raw.modes).size !== raw.modes.length || raw.modes.some(m => m !== '2d' && m !== '3d')) throw Error('modes 需要包含 2d 或 3d，不能重复');
  if (!Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1 || Number(raw.revision) > 2147483647) throw Error('revision 需要 1–2147483647 的整数');
  const skin = raw.skin;
  if (!object(skin)) throw Error('缺少 skin 外观数据');
  const out: Record<string, unknown> = {};
  for (const key of contract[kind].colors) { if (!color(skin[key])) throw Error(key + ' 需要 #RGB 或 #RRGGBB'); out[key] = skin[key]; }
  for (const [key, options] of Object.entries(contract[kind].enums)) { if (!(options as string[]).includes(String(skin[key]))) throw Error(key + ' 选项无效'); out[key] = skin[key]; }
  if (kind === 'keyboard') {
    if (typeof skin.patternScale !== 'number' || !Number.isFinite(skin.patternScale) || skin.patternScale < .2 || skin.patternScale > 4) throw Error('patternScale 范围为 0.2–4');
    out.patternScale = skin.patternScale;
    if (skin.keycaps != null) {
      if (!object(skin.keycaps) || Object.keys(skin.keycaps).length > 200) throw Error('keycaps 最多 200 项');
      const caps: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(skin.keycaps)) {
        if (!contract.keyboard.keyIds.includes(key) || !object(value)) throw Error('无效的按键 ID');
        const cap: Record<string, unknown> = {};
        for (const field of ['top','side','text']) if (value[field] != null) { if (!color(value[field])) throw Error('键帽颜色无效'); cap[field] = value[field]; }
        for (const field of ['label','emoji']) if (value[field] != null) { const v = value[field]; if (typeof v !== 'string' || Array.from(v).length > 24 || /[\u0000-\u001f\u007f-\u009f]/.test(v)) throw Error('键帽文字最多 24 字符'); cap[field] = v; }
        caps[key] = cap;
      }
      out.keycaps = caps;
    }
  } else { if (skin.glow != null && skin.glow !== '' && !color(skin.glow)) throw Error('glow 需要颜色或空字符串'); out.glow = skin.glow ?? ''; }
  const pack: Record<string, unknown> = {format: contract.format, version: 1, kind, id, name: text(raw.name, '名称', 48), modes: [...raw.modes], revision: raw.revision, skin: out};
  for (const field of ['author','license','description']) if (raw[field] != null) pack[field] = text(raw[field], field, field === 'description' ? 240 : 100);
  return pack as unknown as ResourcePack;
}
export const BUILTIN_RESOURCES: ResourcePack[] = BUILTIN_DESK_SKINS.flatMap(desk => (['keyboard','mouse'] as const).map(kind => ({ format: 'diy-cat-resource', version: 1, kind, id: 'builtin-' + kind + '-' + desk.id, name: desk.name, modes: ['2d','3d'], revision: 1, skin: desk[kind] } as ResourcePack)));
export function resourceSlot(kind: ResourceKind, mode: ModelMode): ResourceSlot { return (kind + mode) as ResourceSlot; }
export function composeDeskSkin(base: DeskSkinConfig, packs: ResourcePack[], selected: ResourceSelections, mode: ModelMode): DeskSkinConfig {
  const result = {...base};
  for (const kind of ['keyboard','mouse'] as const) {
    const pack = [...BUILTIN_RESOURCES, ...packs].find(p => p.id === selected[resourceSlot(kind, mode)] && p.kind === kind && p.modes.includes(mode));
    if (pack?.kind === 'keyboard') result.keyboard = pack.skin;
    if (pack?.kind === 'mouse') result.mouse = pack.skin;
  }
  return result;
}
export function exportResourcePack(pack: ResourcePack): ResourcePack {
  return parseResourcePack({...pack, id: pack.id.startsWith('builtin-') ? pack.id.slice(8).slice(0,29) + '-custom' : pack.id});
}
export function parseResourceCatalog(raw: string): ResourcePack[] {
  if (new TextEncoder().encode(raw).length > contract.maxBytes) throw Error('目录不能超过 256 KB');
  const data: unknown = JSON.parse(raw);
  if (!object(data) || data.format !== 'diy-cat-resource-catalog' || data.version !== 1 || !Array.isArray(data.resources) || data.resources.length > contract.maxItems) throw Error('资源目录格式错误，最多 50 个资源');
  const packs = data.resources.map(parseResourcePack);
  if (new Set(packs.map(p => p.id)).size !== packs.length) throw Error('目录中资源 ID 重复');
  return packs;
}
export const DEFAULT_RESOURCE_CATALOG = contract.defaultCatalog;
export async function fetchResourceCatalog(url: string): Promise<ResourcePack[]> { return parseResourceCatalog(await fetchCatalogText(url)); }
