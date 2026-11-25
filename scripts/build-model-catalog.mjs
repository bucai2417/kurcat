/** Build the public model catalog with Node >=22.15; no npm install required. */
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const src = new URL('../src/', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith(src) && context.parentURL.endsWith('.ts')) {
      const url = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(url)) return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === new URL('modelContract.json', src).href) {
      return { format: 'module', shortCircuit: true, source: 'export default ' + readFileSync(fileURLToPath(url), 'utf8') + ';' };
    }
    if (url.startsWith(src) && url.endsWith('.ts')) {
      return { format: 'module', shortCircuit: true, source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), 'utf8')) };
    }
    return next(url, context);
  },
});
const { MODEL_CONTRACT, parseModelPack, exportModelPack, parseModelCatalog } = await import('../src/modelPack.ts');
const store = new URL('../model-store/', import.meta.url);
const decode = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);

export async function buildModelCatalog(directory = store) {
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter(entry => entry.name.endsWith('.kurocat.json'))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  if (files.length > MODEL_CONTRACT.library.maxModels) throw Error('模型目录最多包含 50 个模型包');
  const models = []; const ids = new Set();
  for (const entry of files) {
    try {
      if (!entry.isFile()) throw Error('模型包必须是普通文件');
      const path = new URL(encodeURIComponent(entry.name), directory);
      if ((await stat(path)).size > MODEL_CONTRACT.maxBytes) throw Error('模型包不能超过 256 KB');
      const pack = parseModelPack(decode(await readFile(path)));
      if (ids.has(pack.skin.id)) throw Error('重复模型 ID：' + pack.skin.id);
      ids.add(pack.skin.id);
      models.push(exportModelPack(pack.skin));
    } catch (error) { throw Error(entry.name + '：' + error.message); }
  }
  const output = JSON.stringify({ format: 'kurocat-catalog', version: 1, models }, null, 2) + '\n';
  parseModelCatalog(output);
  return output;
}

export async function checkModelCatalog(directory = store) {
  const expected = await buildModelCatalog(directory);
  let actual;
  try { actual = decode(await readFile(new URL('catalog.json', directory))).replace(/\r\n/g, '\n'); }
  catch { throw Error('catalog.json 缺失或不是 UTF-8，请运行 node scripts/build-model-catalog.mjs'); }
  if (actual !== expected) throw Error('catalog.json 与模型包不同步，请运行 node scripts/build-model-catalog.mjs');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--check')) throw Error('用法：node scripts/build-model-catalog.mjs [--check]');
    if (process.argv[2] === '--check') {
      await checkModelCatalog();
      console.log('模型目录检查通过（UTF-8 / 格式 / ID / 大小 / 内容同步）');
    } else {
      const output = await buildModelCatalog();
      await writeFile(new URL('catalog.json', store), output, 'utf8');
      console.log('已生成 model-store/catalog.json：' + JSON.parse(output).models.length + ' 个模型');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
