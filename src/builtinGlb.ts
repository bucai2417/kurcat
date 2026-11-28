import companions from './builtinCompanions.json';
import { glbHash, validateGlbMapping, type GlbProfile } from './glbModel';
const profile = companions.find(cat => cat.id === 'builtin-naiwa')!.modelProfile.glb!;
let cached: Promise<Uint8Array> | undefined;
/** Content-addressed bundled asset. Never accept an imported URL as a built-in. */
export async function readBuiltinGlb(request: GlbProfile): Promise<Uint8Array | undefined> {
  if (request.sha256 !== profile.sha256) return undefined;
  cached ??= (async () => {
    const response = await fetch(new URL('../art/naiwa/naiwa.glb', import.meta.url));
    if (!response.ok) throw Error('无法读取内置奶蛙模型，请检查安装文件是否完整');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (await glbHash(bytes) !== profile.sha256) throw Error('内置奶蛙模型校验失败');
    return bytes;
  })().catch(error => { cached = undefined; throw error; });
  const bytes = await cached;
  validateGlbMapping(request, bytes, true);
  return bytes;
}
