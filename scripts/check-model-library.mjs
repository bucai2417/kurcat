/** Model library regression checks. Node >=22.15, no npm dependencies or build. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildModelCatalog, checkModelCatalog } from './build-model-catalog.mjs';
const { parseModelPack, exportModelPack, modelInstallState, normalizeCatalogUrl, fetchModelCatalog, DEFAULT_MODEL_CATALOG } = await import('../src/modelPack.ts');
const { installTauriPreviewShim } = await import('../src/tauriPreview.ts');
const example = JSON.parse(await readFile(new URL('../tests/fixtures/model-pack.kurocat.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(example);
const { parseModelFiles } = await import('../src/modelImport.ts');

// Every temporary test file is tracked and removed by exact path; no recursive cleanup.
async function inStore(work) {
  const path = await mkdtemp(join(tmpdir(), 'kurocat-model-test-'));
  const directory = pathToFileURL(path + '/'); const files = new Set();
  const write = async (name, content) => { const target = new URL(name, directory); files.add(target.href); await writeFile(target, content); };
  try { await work(directory, write); }
  finally { for (const file of files) await unlink(new URL(file)); await rmdir(directory); }
}

test('model metadata survives a UTF-8 round trip and rejects invalid revisions', () => {
  const pack = parseModelPack(clone());
  assert.equal(pack.profile.revision, 1); assert.ok(pack.profile.description.includes('打盹惊醒'));
  assert.deepEqual(parseModelPack(JSON.stringify(exportModelPack(pack.skin))), pack);
  for (const revision of [0, -1, 1.5, 2147483648, '2', Infinity]) {
    const bad = clone(); bad.profile.revision = revision;
    assert.throws(() => parseModelPack(bad), /修订号/);
  }
  for (const description of ['', '猫'.repeat(241), '坏\n描述']) {
    const bad = clone(); bad.profile.description = description; assert.throws(() => parseModelPack(bad));
  }
  const legacy = clone(); delete legacy.profile.revision; delete legacy.profile.description;
  assert.equal(parseModelPack(legacy).profile.revision, undefined);
});

test('model status distinguishes new, identical, update, downgrade and edited content', () => {
  const local = parseModelPack(clone());
  assert.equal(modelInstallState(local, []), 'new');
  assert.equal(modelInstallState(local, [local.skin]), 'installed');
  const changed = clone(); changed.skin.furColor = '#aabbcc';
  assert.equal(modelInstallState(parseModelPack(changed), [local.skin]), 'different');
  changed.profile.revision = 2;
  assert.equal(modelInstallState(parseModelPack(changed), [local.skin]), 'update');
  assert.equal(modelInstallState(local, [parseModelPack(changed).skin]), 'local-newer');
  const legacy = clone(); delete legacy.profile.revision;
  legacy.skin.modelProfile = null; legacy.skin.ignored = true; legacy.skin.furColor = example.skin.furColor;
  assert.equal(modelInstallState(parseModelPack(legacy), [local.skin]), 'installed');
  const reordered = Object.fromEntries(Object.entries(clone()).reverse());
  reordered.skin = Object.fromEntries(Object.entries(reordered.skin).reverse());
  assert.equal(modelInstallState(parseModelPack(reordered), [local.skin]), 'installed');
  assert.equal(modelInstallState(local, [{ ...local.skin, furColor: 'invalid' }]), 'different');
});

test('catalog URLs accept GitHub file links and reject credentials or unrelated hosts', () => {
  assert.equal(normalizeCatalogUrl(' https://github.com/bucai2417/kurcat/blob/main/model-store/catalog.json '), DEFAULT_MODEL_CATALOG);
  assert.equal(normalizeCatalogUrl(DEFAULT_MODEL_CATALOG), DEFAULT_MODEL_CATALOG);
  for (const url of ['https://github.com/bucai2417/kurcat', 'https://github.com/bucai2417/kurcat/tree/main/model-store', 'https://raw.githubusercontent.com.evil.test/a/b/main/c.json', 'http://raw.githubusercontent.com/a/b/main/c.json', 'https://user@raw.githubusercontent.com/a/b/main/c.json', DEFAULT_MODEL_CATALOG + '?token=secret', DEFAULT_MODEL_CATALOG + '#fragment']) {
    assert.throws(() => normalizeCatalogUrl(url));
  }
});

test('catalog download reports missing catalogs and network failures without installing', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('', { status: 404 });
    await assert.rejects(fetchModelCatalog(DEFAULT_MODEL_CATALOG), /找不到模型目录/);
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(fetchModelCatalog(DEFAULT_MODEL_CATALOG), /检查网络/);
    globalThis.fetch = async () => new Response(new Uint8Array([0xff]));
    await assert.rejects(fetchModelCatalog(DEFAULT_MODEL_CATALOG), /UTF-8/);
  } finally { globalThis.fetch = original; }
});

test('catalog generation is deterministic, preserves Chinese and detects stale indexes', async () => {
  await inStore(async (dir, write) => {
    const second = clone(); second.skin.id = 'second-cat'; second.skin.name = '第二只猫';
    await write('z.kurocat.json', JSON.stringify(second));
    await write('a.kurocat.json', JSON.stringify(example));
    await write('README.md', '不作为模型读取');
    const output = await buildModelCatalog(dir);
    assert.deepEqual(JSON.parse(output).models.map(p => p.skin.id), ['mint-cloud', 'second-cat']);
    assert.ok(output.includes('薄荷云朵')); assert.ok(output.endsWith('\n'));
    assert.equal(await buildModelCatalog(dir), output);
    await write('catalog.json', output.replace(/\n/g, '\r\n'));
    await checkModelCatalog(dir);
    second.profile.revision = 2; await write('z.kurocat.json', JSON.stringify(second));
    await assert.rejects(checkModelCatalog(dir), /不同步/);
    await write('catalog.json', await buildModelCatalog(dir)); await checkModelCatalog(dir);
  });
});

test('catalog generator rejects duplicate IDs, oversized files, invalid UTF-8 and invalid JSON', async () => {
  await inStore(async (dir, write) => {
    await write('one.kurocat.json', JSON.stringify(example));
    await write('two.kurocat.json', JSON.stringify(example));
    await assert.rejects(buildModelCatalog(dir), /重复模型 ID/);
    await write('two.kurocat.json', Buffer.from([0xff]));
    await assert.rejects(buildModelCatalog(dir), /two.kurocat.json/);
    await write('two.kurocat.json', ' '.repeat(256 * 1024 + 1));
    await assert.rejects(buildModelCatalog(dir), /256 KB/);
    await write('two.kurocat.json', '{'); await assert.rejects(buildModelCatalog(dir), /有效的 JSON/);
  });
});

test('browser preview deletes only custom models, persists fallback and broadcasts changes', async () => {
  const previousWindow = globalThis.window; const previousStorage = globalThis.localStorage; const previousDocument = globalThis.document;
  const memory = new Map(); const opened = [];
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  globalThis.window = { open: (...args) => opened.push(args) };
  globalThis.document = { documentElement: { classList: { add() {} } } };
  try {
    assert.equal(installTauriPreviewShim(), true);
    const internals = window.__TAURI_INTERNALS__; const invoke = internals.invoke;
    const events = []; const callback = internals.transformCallback(event => events.push(event));
    await invoke('plugin:event|listen', { event: 'kuro-settings', handler: callback });
    await invoke('plugin:event|listen', { event: 'kuro-cats', handler: callback });
    await invoke('import_model_pack', { package: example, replace: false });
    await assert.rejects(invoke('import_model_pack', { package: example, replace: false }));
    const newer = clone(); newer.profile.revision = 2;
    await invoke('import_model_pack', { package: newer, replace: true });
    await invoke('update_settings', { patch: { catBreed: 'mint-cloud', renderMode: '3d' } });
    assert.equal((await invoke('get_settings')).catBreed, 'mint-cloud');
    await assert.rejects(invoke('delete_model_pack', { id: 'black' }), /内置/);
    events.length = 0;
    const cats = await invoke('delete_model_pack', { id: 'mint-cloud' });
    assert.ok(!cats.some(c => c.id === 'mint-cloud')); assert.ok(cats.some(c => c.id === 'black'));
    assert.equal((await invoke('get_settings')).catBreed, 'black');
    assert.equal(JSON.parse(memory.get('kurocat-preview-v1')).settings.catBreed, 'black');
    assert.ok(events.some(e => e.event === 'kuro-settings' && e.payload.catBreed === 'black'));
    assert.ok(events.some(e => e.event === 'kuro-cats'));
    await assert.rejects(invoke('delete_model_pack', { id: 'mint-cloud' }), /不存在/);
    await invoke('open_release_page', { url: 'https://github.com/bucai2417/kurcat/upload/main/model-store' });
    assert.equal(opened.length, 1);
    await assert.rejects(invoke('open_release_page', { url: 'javascript:alert(1)' }));
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = previousStorage;
  }
});


test('batch import validates multiple files and catalogs together without losing Chinese', () => {
  const second = clone(); second.skin.id = 'second-cat'; second.skin.name = '第二只猫';
  const files = [{ name: '薄荷.kurocat.json', text: JSON.stringify(example) },
    { name: 'catalog.json', text: JSON.stringify({ format: 'kurocat-catalog', version: 1, models: [second] }) }];
  const packs = parseModelFiles(files);
  assert.deepEqual(packs.map(p => p.skin.name), ['薄荷云朵', '第二只猫']);
  assert.deepEqual(packs.map(p => p.skin.id), ['mint-cloud', 'second-cat']);
  assert.throws(() => parseModelFiles([...files, { name: '坏模型.json', text: '{' }]), /坏模型.json/);
  assert.throws(() => parseModelFiles([files[0], files[0]]), /重复模型 ID/);
  assert.throws(() => parseModelFiles([]), /1–50/);
  assert.throws(() => parseModelFiles(Array(51).fill(files[0])), /1–50/);
  assert.throws(() => parseModelFiles([{ name: '中文.json', text: '猫'.repeat(90000) }]), /256 KB/, 'limit measures UTF-8 bytes');
  const tooMany = Array.from({ length: 51 }, (_, i) => { const p = clone(); p.skin.id = 'cat-' + i; return p; });
  assert.throws(() => parseModelFiles([{ name: 'catalog.json', text: JSON.stringify({ format: 'kurocat-catalog', version: 1, models: tooMany }) }]), /50/);
});


test('preview keeps built-in Naiwa in both modes after old saved cosmetic overrides', async () => {
  const { DEFAULT_BUILTIN_CATS } = await import('../src/catSkins.ts');
  const { modelModes, modelMode } = await import('../src/modelPack.ts');
  const saved = Object.fromEntries(['window','localStorage','document'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const memory = new Map();
  const builtin = DEFAULT_BUILTIN_CATS.find(c => c.id === 'builtin-naiwa');
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key,value) => memory.set(key,value) };
  globalThis.document = { documentElement: { classList: { add() {} } } };
  try {
    for (const legacy of [false, true]) {
      if (legacy) memory.set('kurocat-preview-v1', JSON.stringify({ cats: [{ ...builtin, furColor: '#abcdef', modelProfile: { adapters: ['canvas-naiwa-v1'], behaviorContract: 'cat-v1' } }] }));
      globalThis.window = {};
      assert.equal(installTauriPreviewShim(), true);
      const invoke = window.__TAURI_INTERNALS__.invoke;
      const cats = await invoke('get_cats');
      const cat = cats.find(c => c.id === 'builtin-naiwa');
      assert.equal(cats.filter(c => c.id === cat.id).length, 1);
      assert.deepEqual(modelModes(cat), ['2d', '3d']);
      assert.equal(modelMode(cat, '3d'), '3d');
      assert.equal(cat.modelProfile.glb.sha256, builtin.modelProfile.glb.sha256);
      if (legacy) assert.equal(cat.furColor, '#abcdef');
      await invoke('update_settings', { patch: { catBreed: cat.id, renderMode: '3d' } });
      assert.equal((await invoke('get_settings')).renderMode, '3d');
      await assert.rejects(invoke('delete_model_pack', { id: cat.id }), /内置/);
    }
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
