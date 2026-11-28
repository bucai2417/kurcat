/** Check the shipped GLB with the same loader/mixer used by the preview. No build or WebGL required. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const url = new URL('../art/naiwa/naiwa.glb', import.meta.url);
const bytes = await fs.readFile(url);
const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString().trim());
// Validate the packed PNG independently; Node has no browser image decoder.
// The loader plugin substitutes only GPU texture allocation, not mesh/skin/animation loading.
const binStart = 20 + bytes.readUInt32LE(12) + 8;
const imageSizes = [];
assert.ok(json.images?.length > 0, 'Packed skin atlas missing');
for (const image of json.images) {
  assert.equal(image.uri, undefined, 'Texture must be embedded');
  assert.equal(image.mimeType, 'image/png');
  const view = json.bufferViews[image.bufferView];
  const png = bytes.subarray(binStart + (view.byteOffset ?? 0), binStart + (view.byteOffset ?? 0) + view.byteLength);
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137,80,78,71,13,10,26,10]));
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.ok(width >= 1024 && height >= 1024 && width <= 4096 && height <= 4096);
  assert.equal(png[24], 8, 'Expected 8-bit atlas');
  const channels = { 2: 3, 6: 4 }[png[25]];
  assert.ok(channels, 'Expected RGB/RGBA atlas');
  assert.equal(png[28], 0, 'Expected non-interlaced PNG');
  const parts = [];
  for (let offset = 8; offset + 12 <= png.length;) {
    const size = png.readUInt32BE(offset);
    assert.ok(offset + size + 12 <= png.length, 'Truncated PNG chunk');
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') parts.push(png.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  assert.equal(inflateSync(Buffer.concat(parts), { maxOutputLength: 80 * 1024 * 1024 }).length, height * (width * channels + 1));
  imageSizes.push({ width, height });
}
const loader = new GLTFLoader();
loader.register(parser => ({
  name: 'NODE_TEXTURE_CHECK',
  loadTexture(index) {
    const source = parser.json.textures[index].source;
    const texture = new THREE.Texture();
    texture.image = imageSizes[source];
    texture.flipY = false;
    return Promise.resolve(texture);
  },
}));
const result = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const expected = { idle: 4, typing: 3, mouse: 3, sway: 5, wave: 4, nap: 6, angry: 3, delight: 8 };
assert.equal(json.skins.length, 1);
assert.equal(json.skins[0].joints.length, 80);
assert.equal(json.meshes.length, 11);
assert.deepEqual(result.animations.map(a => a.name).sort(), Object.keys(expected).sort());
const names = new Set(json.nodes.map(n => n.name));
for (const name of ['mouth', 'gripLeft', 'gripRight', 'footContactLeft', 'footContactRight', 'headTouch']) assert.ok(names.has(name), name);
assert.ok(!json.cameras?.length && !json.extensions?.KHR_lights_punctual, 'Studio objects must not be exported');
const meshes = [];
result.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
const body = meshes.find(m => m.name === 'Naiwa_Surface');
assert.ok(body?.isSkinnedMesh);
assert.ok(body.geometry.getAttribute('uv')?.count === body.geometry.getAttribute('position').count, 'Skin atlas UVs missing');
assert.ok(body.material.map, 'Skin atlas not connected');
for (const name of ['CheekPuff.L', 'CheekPuff.R', 'Breathe']) assert.ok(name in body.morphTargetDictionary, name);
for (const mesh of meshes) {
  const weights = mesh.geometry.getAttribute('skinWeight');
  if (!weights) continue;
  for (let i = 0; i < weights.count; i++) {
    const sum = weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i);
    assert.ok(Math.abs(sum - 1) < .001, mesh.name + ' unnormalized weights at ' + i);
  }
}
const mixer = new THREE.AnimationMixer(result.scene);
const point = new THREE.Vector3();
const allSamples = {};
for (const clip of result.animations) {
  assert.ok(Math.abs(clip.duration - expected[clip.name]) < .001, clip.name + ' duration');
  mixer.stopAllAction();
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  let previous = null;
  let firstSamples = null;
  let maxStep = 0;
  let maxStepFrame = 0;
  let maxStepPoint = [];
  const bounds = new THREE.Box3();
  for (let tick = 0; tick <= Math.round(clip.duration * 30); tick++) {
    mixer.setTime(tick / 30);
    result.scene.updateMatrixWorld(true);
    for (const mesh of meshes) if (mesh.isSkinnedMesh) mesh.skeleton.update();
    // Every 17th body vertex, every frame: detects exploding skin / invalid morph data.
    const samples = [];
    for (const mesh of meshes) {
      const count = mesh.geometry.getAttribute('position').count;
      for (let i = 0; i < count; i += 17) {
        mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
        assert.ok(point.toArray().every(Number.isFinite), clip.name + ' non-finite position');
        assert.ok(point.length() < 6, clip.name + ' exploding deformation');
        bounds.expandByPoint(point);
        samples.push(point.clone());
      }
    }
    if (!firstSamples) firstSamples = samples.map(p => p.clone());
    if (previous) for (let i = 0; i < samples.length; i++) { const distance = previous[i].distanceTo(samples[i]); if (distance > maxStep) { maxStep = distance; maxStepFrame = tick; maxStepPoint = samples[i].toArray(); } }
    previous = samples;
  }
  const loopSeam = Math.max(...previous.map((p, i) => p.distanceTo(firstSamples[i])));
  assert.ok(loopSeam < .025, clip.name + ' discontinuous loop seam: ' + loopSeam);
  assert.ok(maxStep < .25, clip.name + ' abrupt one-frame jump: ' + maxStep);
  const report = { seconds: clip.duration, channels: clip.tracks.length, loopSeam: +loopSeam.toFixed(6), largestVertexStep: +maxStep.toFixed(5), largestStepFrame: maxStepFrame, largestStepPoint: maxStepPoint, min: bounds.min.toArray(), max: bounds.max.toArray() };
  allSamples[clip.name] = report;
  console.log('PASS ' + clip.name + ': ' + clip.duration + 's, max sampled step ' + maxStep.toFixed(4));
}
mixer.stopAllAction();
const nap = mixer.clipAction(result.animations.find(a => a.name === 'nap')).reset().play();
mixer.setTime(3);
const drool = meshes.find(m => m.name === 'Naiwa_Drool');
assert.ok(drool.morphTargetInfluences[drool.morphTargetDictionary.Drool] > .95, 'Sleep drool missing');
for (const mesh of meshes.filter(m => m.name.includes('Lid'))) assert.ok(mesh.morphTargetInfluences[mesh.morphTargetDictionary.Blink] > .95, 'Sleep eyelid open');
mixer.stopAllAction();
mixer.clipAction(result.animations.find(a => a.name === 'idle')).reset().play();
mixer.setTime(0);
assert.equal(drool.morphTargetInfluences[drool.morphTargetDictionary.Drool], 0, 'Drool leaked into idle');
const report = { file: 'naiwa.glb', bytes: bytes.length, meshCount: meshes.length, vertexCount: meshes.reduce((n,m) => n + m.geometry.getAttribute('position').count, 0), triangleCount: meshes.reduce((n,m) => n + (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3, 0), embeddedImages: imageSizes, bones: 80, clips: allSamples, checks: ['embedded PNG integrity and UV/material binding (no GPU rendering)', 'normalized weights', '80-bone skin', 'required sockets', '8 named clips and durations', 'finite sampled deformation at 30 fps', 'bounded frame-to-frame motion', 'loop seam continuity', 'sleep eyelid closure and drool', 'idle drool reset', 'no studio camera/light'] };
if (process.argv.includes('--report')) await fs.writeFile(new URL('../art/naiwa/validation.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log('PASS Naiwa GLB: ' + meshes.length + ' meshes, 80 bones, 8 clips (' + bytes.length + ' bytes)');
