/** GLB import regressions: no build, WebGL or network. Node >=22.15. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { File } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import './build-model-catalog.mjs';
const { validateGlb, validateGlbMapping, decodeGlb, encodeGlb, glbHash, resolveGlbAsset, clearPendingGlbs, glbUrl } = await import('../src/glbModel.ts');
const { readModelFiles, materializeModelPack } = await import('../src/modelImport.ts');
const { parseModelPack, exportModelPack, parseModelCatalog, modelActions, modelModes } = await import('../src/modelPack.ts');
function fixture(change = () => {}) {
  const binary = Buffer.alloc(68);
  [0,0,0, 1,0,0, 0,1,0, 0,1, 0,0,0, 0,1,0].forEach((v,i) => binary.writeFloatLE(v,i*4));
  const doc = { asset:{version:'2.0'}, buffers:[{byteLength:binary.length}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:8},{buffer:0,byteOffset:44,byteLength:24}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},
      {bufferView:1,componentType:5126,count:2,type:'SCALAR',min:[0],max:[1]},
      {bufferView:2,componentType:5126,count:2,type:'VEC3'}],
    meshes:[{primitives:[{attributes:{POSITION:0}}]}], nodes:[{mesh:0}], scenes:[{nodes:[0]}], scene:0,
    animations:['idle','wave'].map(name => ({name,samplers:[{input:1,output:2}],channels:[{sampler:0,target:{node:0,path:'translation'}}]})) };
  change(doc);
  const text = Buffer.from(JSON.stringify(doc));
  const json = Buffer.alloc(Math.ceil(text.length/4)*4,32); text.copy(json);
  const bytes = Buffer.alloc(28+json.length+binary.length);
  bytes.write('glTF'); bytes.writeUInt32LE(2,4); bytes.writeUInt32LE(bytes.length,8);
  bytes.writeUInt32LE(json.length,12); bytes.writeUInt32LE(0x4e4f534a,16); json.copy(bytes,20);
  bytes.writeUInt32LE(binary.length,20+json.length); bytes.writeUInt32LE(0x004e4942,24+json.length); binary.copy(bytes,28+json.length);
  return bytes;
}
async function imported(bytes = fixture()) { return (await readModelFiles([new File([bytes],'奶蛙测试.glb')]))[0]; }
test('raw GLB becomes a 3D package, maps only existing clips, exports losslessly', async () => {
  const bytes=fixture(), pack=await imported(bytes);
  assert.equal(pack.version,2); assert.equal(pack.skin.name,'奶蛙测试');
  assert.deepEqual(modelModes(pack.skin),['3d']);
  assert.deepEqual(pack.profile.glb.animations,{idle:'idle',wave:'wave'});
  assert.ok(modelActions(pack.skin,'3d').includes('wave'));
  assert.ok(!modelActions(pack.skin,'3d').includes('roll'));
  const output=exportModelPack(pack.skin,pack.asset);
  const roundtrip=parseModelPack(JSON.stringify(output));
  assert.deepEqual(await resolveGlbAsset(roundtrip.profile.glb,roundtrip.asset),new Uint8Array(bytes));
  assert.equal(roundtrip.profile.glb.sha256,await glbHash(bytes));
});
test('explicit bytes cannot be replaced by a cached model and mismatches never install', async () => {
  const pack=await imported();
  const changed=fixture(doc => { doc.nodes[0].name='changed'; });
  await assert.rejects(resolveGlbAsset(pack.profile.glb,{data:encodeGlb(changed)}),/SHA-256/);
  const wrong=structuredClone(pack); wrong.profile.glb.animations.wave='absent';
  assert.throws(()=>parseModelPack(wrong),/动画片段/);
});
test('catalog retains URL and digest, materialization embeds verified bytes', async () => {
  const bytes=fixture(), pack=await imported(bytes);
  const url='https://raw.githubusercontent.com/bucai2417/kurcat/main/art/naiwa/naiwa.glb';
  pack.asset={url};
  const catalog=parseModelCatalog(JSON.stringify({format:'kurocat-catalog',version:1,models:[exportModelPack(pack.skin,pack.asset)]}));
  assert.equal(catalog[0].asset.url,url); clearPendingGlbs();
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async (requested,options) => {
      assert.equal(requested,url); assert.equal(options.redirect,'error');
      return new Response(bytes);
    };
    const local=await materializeModelPack(catalog[0]);
    assert.equal(local.asset.url,undefined); assert.deepEqual(decodeGlb(local.asset.data),new Uint8Array(bytes));
  } finally {globalThis.fetch=original;clearPendingGlbs();}
});
test('rejects external resources, compression, corrupt chunks and invalid graph bounds', () => {
  for(const change of [
    d=>d.buffers[0].uri='https://example.org/private',
    d=>d.extensionsRequired=['KHR_draco_mesh_compression'],
    d=>d.nodes[0].children=[0],
    d=>d.nodes[0].children=[99],
    d=>d.bufferViews[0].byteOffset=-1,
    d=>d.bufferViews[0].byteLength=999,
    d=>delete d.bufferViews[0].buffer,
    d=>d.accessors[0].count=2000001,
    d=>d.animations[1].name='idle',
    d=>d.animations[0].name=42,
  ]) assert.throws(()=>validateGlb(fixture(change)));
  const truncated=fixture().subarray(0,-1); assert.throws(()=>validateGlb(truncated));
  const oversizedTexture=fixture(d=>{d.images=[{mimeType:'image/png',bufferView:0}];});
  assert.throws(()=>validateGlb(oversizedTexture),/PNG|纹理/);
});
test('canonical Base64, source URL limits and duplicate-file errors', async () => {
  for(const input of ['a===','AA=A','AB==','Zm9=','!!!!']) assert.throws(()=>decodeGlb(input));
  for(const url of ['http://raw.githubusercontent.com/a/b/main/c.glb','https://user@raw.githubusercontent.com/a/b/main/c.glb','https://raw.githubusercontent.com.evil.test/a.glb','https://raw.githubusercontent.com/a/b/main/c.glb?token=secret']) assert.throws(()=>glbUrl(url));
  const f=new File([fixture()],'重复.glb');
  await assert.rejects(readModelFiles([f,f]),/ID 不能重复/);
  await assert.rejects(readModelFiles([new File([new Uint8Array([255])],'坏文件.json')]),/坏文件.json/);
});

test('published Naiwa manifest matches the shipped mesh, animations and 3D adapter', async () => {
  const pack = parseModelPack(await readFile(new URL('../model-store/naiwa-3d.kurocat.json', import.meta.url), 'utf8'));
  const bytes = new Uint8Array(await readFile(new URL('../art/naiwa/naiwa.glb', import.meta.url)));
  assert.deepEqual(pack.profile.adapters, ['three-naiwa-v1']);
  assert.match(pack.asset.url, /^https:\/\/raw\.githubusercontent\.com\/bucai2417\/kurcat\/[a-f0-9]{40}\/art\/naiwa\/naiwa\.glb$/);
  assert.equal(pack.profile.glb.sha256, await glbHash(bytes));
  validateGlbMapping(pack.profile.glb, bytes, true);
  assert.deepEqual(Object.keys(pack.profile.glb.animations).sort(), ['idle','typing','mouse','sway','wave','nap','angry','delight'].sort());
  const actions = modelActions(pack.skin, '3d');
  assert.ok(actions.includes('wave') && actions.includes('nap') && actions.includes('pawCheck'));
  assert.ok(actions.includes('drink') && actions.includes('roll'));
  assert.equal(validateGlb(bytes).naiwaRig,true);
  const importedPack=(await readModelFiles([new File([bytes],'renamed-frog.glb')]))[0];
  assert.deepEqual(importedPack.profile.adapters,['three-naiwa-v1']);
  assert.throws(()=>validateGlbMapping(pack.profile.glb,fixture(),true),/完整骨架/);
});


test('incomplete Naiwa hierarchy or pupils cannot opt into live controls', async () => {
  const bytes = await readFile(new URL('../art/naiwa/naiwa.glb', import.meta.url));
  const size = bytes.readUInt32LE(12);
  const source = JSON.parse(bytes.subarray(20, 20 + size).toString('utf8'));
  const binary = bytes.subarray(20 + size);
  const pack = parseModelPack(await readFile(new URL('../model-store/naiwa-3d.kurocat.json', import.meta.url), 'utf8'));
  for (const [reason, change] of [
    ['detached head', (d, node) => { node('neck').children = []; }],
    ['detached shoulder', (d, node) => { node('chest').children = node('chest').children.filter(i => !d.nodes[i].name.startsWith('clavicle')); }],
    ['foot outside skin joints', (d, node) => { const i = d.nodes.indexOf(node('foot.L')); d.skins.forEach(s => { s.joints = s.joints.filter(j => j !== i); }); }],
    ['missing pupil normals', (d, node) => { delete d.meshes[node('Pupil.L').mesh].primitives[0].attributes.NORMAL; }],
    ['pupil group instead of mesh', (d, node) => { const p = d.meshes[node('Pupil.L').mesh].primitives; p.push(structuredClone(p[0])); }],
  ]) {
    const doc = structuredClone(source), node = name => doc.nodes.find(n => n.name === name);
    change(doc, node);
    const text = Buffer.from(JSON.stringify(doc)), json = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32);
    text.copy(json);
    const changed = Buffer.concat([bytes.subarray(0, 20), json, binary]);
    changed.writeUInt32LE(changed.length, 8); changed.writeUInt32LE(json.length, 12);
    assert.equal(validateGlb(changed).naiwaRig, false, reason);
    assert.throws(() => validateGlbMapping(pack.profile.glb, changed, true), /完整骨架/, reason);
  }
});
