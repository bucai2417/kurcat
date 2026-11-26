/** Resource protocol checks; Node >=22.15, no installed dependencies required. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildResourceCatalog, checkResourceCatalog } from './build-model-catalog.mjs';
const { parseResourcePack, exportResourcePack, parseResourceCatalog, composeDeskSkin, BUILTIN_RESOURCES } = await import('../src/resourcePack.ts');
const { BUILTIN_DESK_SKINS } = await import('../src/deskSkin.ts');
const { installTauriPreviewShim } = await import('../src/tauriPreview.ts');
const keyboard = JSON.parse(await readFile(new URL('../model-store/mint-keyboard-3d.diycat.json',import.meta.url),'utf8'));
const mouse = JSON.parse(await readFile(new URL('../model-store/mint-mouse-2d.diycat.json',import.meta.url),'utf8'));
test('UTF-8 keyboard and mouse packages round trip and builtin exports receive safe IDs', () => {
  for (const raw of [keyboard,mouse]) assert.deepEqual(exportResourcePack(parseResourcePack(JSON.stringify(raw))),parseResourcePack(raw));
  assert.equal(parseResourcePack(keyboard).skin.keycaps.space.label,'摸鱼时间');
  for (const raw of BUILTIN_RESOURCES) assert.ok(!exportResourcePack(raw).id.startsWith('builtin-'));
});
test('mode selections compose independently and unavailable resources fall back', () => {
  const base=BUILTIN_DESK_SKINS[0], packs=[parseResourcePack(keyboard),parseResourcePack(mouse)];
  const selected={keyboard3d:keyboard.id,mouse2d:mouse.id,keyboard2d:keyboard.id,mouse3d:'missing'};
  const two=composeDeskSkin(base,packs,selected,'2d'),three=composeDeskSkin(base,packs,selected,'3d');
  assert.deepEqual(two.keyboard,base.keyboard); assert.deepEqual(two.mouse,packs[1].skin);
  assert.deepEqual(three.keyboard,packs[0].skin); assert.deepEqual(three.mouse,base.mouse);
  assert.deepEqual(composeDeskSkin(base,[],selected,'3d'),base);
});
test('reject malformed, executable, oversized and incompatible resource values', () => {
  const changes=[p=>p.kind=['keyboard'],p=>p.skin.material=['plastic'],p=>p.skin.shape=['classic'],p=>p.skin.keycaps={Space:{label:'错误大小写'}},p=>p.id='../bad',p=>p.id='builtin-evil',p=>p.modes=['2d','2d'],p=>p.modes=[],p=>p.revision=0,p=>p.revision=1.5,p=>p.name='坏\n名称',p=>p.skin.keyTop='url(x)',p=>p.skin.patternScale=Infinity,p=>p.skin.shape='unknown',p=>p.skin.keycaps=JSON.parse('{"__proto__":{}}'),p=>p.skin.keycaps.space.label='猫'.repeat(25)];
  for (const change of changes) {const p=structuredClone(keyboard);change(p);assert.throws(()=>parseResourcePack(p));}
  const p=structuredClone(keyboard);p.extra='猫'.repeat(90000);assert.throws(()=>parseResourcePack(p),/256 KB/);
  assert.throws(()=>parseResourceCatalog(JSON.stringify({format:'diy-cat-resource-catalog',version:1,resources:[keyboard,keyboard]})),/重复/);
});
test('catalog generator validates UTF-8, duplicates, and stale indexes', async () => {
  const dir=pathToFileURL((await mkdtemp(join(tmpdir(),'diycat-resource-')) )+'/'), files=new Set();
  const write=async(name,data)=>{files.add(name);await writeFile(new URL(name,dir),data);};
  try {
    await write('one.diycat.json',JSON.stringify(keyboard));await write('two.diycat.json',JSON.stringify(mouse));
    const output=await buildResourceCatalog(dir);assert.equal(parseResourceCatalog(output).length,2);
    await write('resources.json',output);await checkResourceCatalog(dir);
    await write('two.diycat.json',JSON.stringify({...mouse,name:'新名字'}));await assert.rejects(checkResourceCatalog(dir),/不同步/);
    await write('two.diycat.json',JSON.stringify(keyboard));await assert.rejects(buildResourceCatalog(dir),/重复资源/);
    await write('two.diycat.json',Buffer.from([0xff]));await assert.rejects(buildResourceCatalog(dir),/two.diycat.json/);
  } finally {for(const name of files)await unlink(new URL(name,dir));await rmdir(dir);}
});
test('preview backend requires explicit replacement and clears deleted resource selections', async () => {
  const saved=[globalThis.window,globalThis.localStorage,globalThis.document];const memory=new Map();
  globalThis.window={};globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
  globalThis.document={documentElement:{classList:{add(){}}}};
  try {
    installTauriPreviewShim();const api=window.__TAURI_INTERNALS__;const invoke=api.invoke;const events=[];
    const handler=api.transformCallback(e=>events.push(e));await invoke('plugin:event|listen',{event:'kuro-resources',handler});
    await invoke('plugin:event|listen',{event:'kuro-settings',handler});
    await invoke('import_resource_pack',{package:keyboard,replace:false});
    await assert.rejects(invoke('import_resource_pack',{package:keyboard,replace:false}));
    await invoke('import_resource_pack',{package:{...keyboard,revision:2},replace:true});
    await assert.rejects(invoke('import_resource_pack',{package:{...mouse,id:keyboard.id},replace:true}));
    await invoke('update_settings',{patch:{deskAccessories:{keyboard3d:keyboard.id,mouse2d:mouse.id}}});
    await invoke('delete_resource_pack',{id:keyboard.id});
    assert.deepEqual((await invoke('get_settings')).deskAccessories,{mouse2d:mouse.id});
    assert.deepEqual(await invoke('get_resources'),[]);
    assert.ok(events.some(e=>e.event==='kuro-resources'));assert.ok(events.some(e=>e.event==='kuro-settings'));
    await assert.rejects(invoke('delete_resource_pack',{id:'builtin-keyboard-classic-cream'}));
  } finally {
    for(const [i,key]of ['window','localStorage','document'].entries())if(saved[i]===undefined)delete globalThis[key];else globalThis[key]=saved[i];
  }
});

test('resource contract uses the exact supported layout key IDs', async () => {
  const { KEYBOARD_LAYOUTS } = await import('../src/keyboardLayout.ts');
  const rules = JSON.parse(await readFile(new URL('../src/resourceContract.json', import.meta.url), 'utf8'));
  const ids = [...new Set(Object.values(KEYBOARD_LAYOUTS).flatMap(l => l.keys.map(k => k.id)))].sort();
  assert.deepEqual([...rules.keyboard.keyIds].sort(), ids);
});
