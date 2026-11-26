import { MODEL_CONTRACT, parseModelPack, parseModelCatalog, type ModelPack } from './modelPack';
/** Validate every file before any installation. Duplicate IDs require a deliberate choice. */
export function parseModelFiles(files: Array<{ name: string; text: string }>): ModelPack[] {
  if (!files.length || files.length > 50) throw Error('一次请选择 1–50 个文件');
  if (files.reduce((size, f) => size + new TextEncoder().encode(f.text).length, 0) > MODEL_CONTRACT.maxBytes) throw Error('本次导入合计不能超过 256 KB');
  const packs: ModelPack[] = [];
  for (const file of files) {
    try {
      const value = JSON.parse(file.text);
      packs.push(...(value?.format === 'kurocat-catalog' ? parseModelCatalog(file.text) : [parseModelPack(value)]));
    } catch (error) { throw Error(file.name + '：' + (error instanceof Error ? error.message : String(error))); }
  }
  if (!packs.length || packs.length > 50) throw Error('一次可导入 1–50 个模型');
  const ids = new Set<string>();
  for (const p of packs) { if (ids.has(p.skin.id)) throw Error('重复模型 ID：' + p.skin.id + '，请只保留一个版本'); ids.add(p.skin.id); }
  return packs;
}
