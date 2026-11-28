/** Real Three.js animation regression checks; no browser, renderer or build. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import './build-model-catalog.mjs';
import * as THREE from 'three';
const { GlbActor } = await import('../src/glbActor.ts');

function actor(mapping = {idle:'idle', wave:'wave', typing:'typing', nap:'nap'}, naiwa = false) {
  const scene = new THREE.Group();
  const pose = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial());
  pose.name = 'pose'; scene.add(pose);
  const clips = Object.entries({idle:0, wave:1, typing:-1, nap:2}).map(([name, value]) =>
    new THREE.AnimationClip(name, 6, [new THREE.NumberKeyframeTrack('pose.position[x]', [0,3,6], [value,value+.1,value])]));
  const pet=GlbActor.fromScene(scene, clips, {height:2.3,yaw:0,animations:mapping});
  // Test only the nap clock here; actual rig integrity is covered by check-naiwa-runtime.
  pet.naiwa=naiwa;
  return { pet, pose };
}
function advance(pet, seconds, state) { for (let i=0;i<Math.round(seconds*60);i++) pet.update(1/60,state,false); }

test('reversing a transition and keyboard interruption preserve the visible pose', () => {
  const {pet,pose}=actor(); advance(pet,.3,'idle');
  assert.equal(pet.trigger('wave'),true); advance(pet,.08,'idle');
  const before=pose.position.x;
  pet.update(0,'typing',false);
  assert.ok(Math.abs(pose.position.x-before)<1e-7,'an input event must not jump the pose');
  advance(pet,.04,'typing');
  const middle=pose.position.x;
  pet.update(0,'idle',false);
  assert.ok(Math.abs(pose.position.x-middle)<1e-7,'reversing a fade must not jump');
  advance(pet,.5,'typing'); assert.ok(pose.position.x<-.8);
  assert.equal(pet.trigger('roll'),false); pet.dispose();
});

test('Naiwa remains in the settled nap section until input wakes it', () => {
  const {pet}=actor(undefined,true); advance(pet,3,'nap');
  for(let i=0;i<1800;i++) {
    pet.update(1/60,'nap',false);
    const time=pet.actions.get('nap').time;
    assert.ok(time>=2.4-1e-7 && time<=3.6+1e-7,'nap must not loop through the wake-up');
  }
  advance(pet,.3,'typing'); assert.equal(pet.current,pet.actions.get('typing'));
  pet.update(1/60,'nap',false); assert.ok(pet.actions.get('nap').time<.1,'new nap starts with the entry');
  pet.dispose();
});

test('missing nap is safe and a shared nap/idle clip resumes its clock', () => {
  const missing=actor({},true).pet;
  assert.doesNotThrow(()=>advance(missing,2,'nap')); missing.dispose();
  const {pet}=actor({idle:'nap',nap:'nap'},true); advance(pet,4,'nap');
  const time=pet.current.time; pet.update(.05,'idle',false);
  assert.ok(pet.current.time>time,'alias must release the frozen sleep clock'); pet.dispose();
});

test('animated bounds and repeated behaviors do not rescale the model', () => {
  const {pet}=actor(); const scale=pet.root.scale.clone(); const origin=pet.root.position.clone();
  for(const state of ['wave','nap','typing','idle']) { pet.trigger(state); advance(pet,1,state); }
  assert.deepEqual(pet.root.scale,scale); assert.deepEqual(pet.root.position,origin); pet.dispose();
});
