import { GLB_BEHAVIORS, MAX_MODEL_PACKAGE_BYTES, validateGlb, glbHash, encodeGlb, resolveGlbAsset } from './glbModel';
import { parseModelPack, parseModelCatalog, type ModelPack } from './modelPack';
/** Validate every file before any installation. Duplicate IDs require a deliberate choice. */
export function parseModelFiles(files: Array<{ name: string; text: string }>): ModelPack[] {
  if (!files.length || files.length > 50) throw Error('一次请选择 1–50 个文件');
  if (files.reduce((size, f) => size + new TextEncoder().encode(f.text).length, 0) > MAX_MODEL_PACKAGE_BYTES) throw Error('本次导入合计不能超过 23 MiB');
  const packs: ModelPack[] = [];
  for (const file of files) {
    try {
      let value: unknown;
      try { value = JSON.parse(file.text); }
      catch { throw Error(new TextEncoder().encode(file.text).length > 256 * 1024
        ? '外观包上限 256 KB；较大的文件必须是有效的版本 2 GLB 模型包' : '文件不是有效的 JSON'); }
      packs.push(...((value as { format?: string })?.format === 'kurocat-catalog' ? parseModelCatalog(file.text) : [parseModelPack(value)]));
    } catch (error) { throw Error(file.name + '：' + (error instanceof Error ? error.message : String(error))); }
  }
  if (!packs.length || packs.length > 50) throw Error('一次可导入 1–50 个模型');
  const ids = new Set<string>();
  for (const p of packs) { if (ids.has(p.skin.id)) throw Error('重复模型 ID：' + p.skin.id + '，请只保留一个版本'); ids.add(p.skin.id); }
  return packs;
}

/** File imports are validated completely before the explicit install button is enabled. */
export async function readModelFiles(files: File[]): Promise<ModelPack[]> {
  if (!files.length || files.length > 50 || files.reduce((n, f) => n + f.size, 0) > MAX_MODEL_PACKAGE_BYTES) throw Error('一次最多 50 个文件，合计不超过 23 MiB；单个 GLB 不超过 16 MiB');
  const packs: ModelPack[] = [];
  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (/\.glb$/i.test(file.name)) {
        const { animations: clips } = validateGlb(bytes); const sha256 = await glbHash(bytes);
        const animations = Object.fromEntries(GLB_BEHAVIORS.filter(k => clips.includes(k)).map(k => [k, k]));
        const title = file.name.replace(/\.glb$/i, '').slice(0, 42) || '导入模型';
        packs.push(parseModelPack({ format: 'kurocat-model', version: 2,
          profile: { adapters: ['three-glb-v1'], behaviorContract: 'cat-v1', glb: { sha256, animations, height: 2.3, yaw: 0 } },
          skin: { id: 'glb-' + sha256.slice(0, 20), name: title, furColor: '#e9ead4', eyeColorTop: '#161b17' }, asset: { data: encodeGlb(bytes) },
        }));
      } else packs.push(...parseModelFiles([{ name: file.name, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }]));
    } catch (error) { throw Error(file.name + '：' + (error instanceof Error ? error.message : String(error))); }
  }
  if (packs.length > 50 || new Set(packs.map(p => p.skin.id)).size !== packs.length) throw Error('一次最多 50 个模型，模型 ID 不能重复');
  for (const pack of packs) if (pack.profile.glb && pack.asset?.data) await resolveGlbAsset(pack.profile.glb, pack.asset);
  return packs;
}
export async function materializeModelPack(pack: ModelPack): Promise<ModelPack> {
  if (!pack.profile.glb) return pack;
  return { ...pack, asset: { data: encodeGlb(await resolveGlbAsset(pack.profile.glb, pack.asset)) } };
}
