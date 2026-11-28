/** Real exported skin, skeleton and mixer; no renderer, install or build. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './build-model-catalog.mjs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const {GlbActor}=await import('../src/glbActor.ts');
const loader=new GLTFLoader();
loader.register(()=>({name:'TEST_TEXTURES',loadTexture:()=>Promise.resolve(new T.Texture())}));
const bytes=fs.readFileSync(new URL('../art/naiwa/naiwa.glb',import.meta.url));
const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const pack=JSON.parse(fs.readFileSync(new URL('../model-store/naiwa-3d.kurocat.json',import.meta.url),'utf8'));
const pet=GlbActor.fromScene(gltf.scene,gltf.animations,pack.profile.glb,true);
const v=(x,y,z)=>new T.Vector3(x,y,z);
const wp=name=>gltf.scene.getObjectByName(name).getWorldPosition(new T.Vector3());
const size=new T.Box3().setFromObject(pet.root).getSize(new T.Vector3());
console.log('Seated size:',size.toArray());
assert.ok(Math.abs(size.y-2.3)<1e-6);
const base={head:{pitch:0,yaw:0,roll:0},lean:0,hunch:0,blink:0,anger:0,sleeping:0};
const contacts={left:v(-1.16,.15,.96),right:v(.50,.15,1.25),leftMode:'desk',rightMode:'desk',tongueWeight:0,stomp:0,stompLift:0};
function step(frame=base,contact=contacts,state='idle') {
 pet.update(1/60,state,false); pet.pose(1/60,frame);pet.contacts(1/60,contact);
}
for(let i=0;i<90;i++) step();
console.log('Grips:',wp('gripRight').toArray(),wp('gripLeft').toArray());
assert.ok(wp('gripRight').distanceTo(contacts.left)<1e-5);
assert.ok(wp('gripLeft').distanceTo(contacts.right)<1e-5);
// Real contact locations, including all desk edges and the mouth's cup target.
const fixedScale=pet.root.scale.clone(), fixedOrigin=pet.root.position.clone();
const {createArmClearanceCheck} = await import('./lib/naiwa-clearance.mjs');
const clearance = createArmClearanceCheck(gltf.scene.getObjectByName('Naiwa_Surface'));
const palm=v(0,0,0), direction=v(0,0,0), end=v(0,0,0);
for (const [name,left,right,mode] of [
 ['keyboard-left',v(-.9,.15,1.6),v(.15,.15,.8),'desk'],
 ['keyboard-right',v(-.4,.15,1.05),v(1.3,.15,1.35),'desk'],
 ['mouse',v(-1.45,.15,.96),v(.40,.28,.63),'desk'],
 ['cup',v(-.4,.28,.63),wp('mouth').add(v(.3,-.18,.12)),'cup'],
 ['wave',v(-.4,.28,.63),v(.82,2.04,.38),'wave'],
 ['back-to-desk',contacts.left,contacts.right,'desk'],
]) {
 for(let i=0;i<45;i++) {
  step(base,{...contacts,left,right,rightMode:mode});
  for(const [socket,target] of [['gripRight',left],['gripLeft',right]])
   assert.ok(wp(socket).distanceTo(target)<1e-5,name+' '+socket);
  gltf.scene.traverse(n=>{if(n.isBone){assert.ok(n.matrixWorld.elements.every(Number.isFinite));assert.ok(Math.abs(n.matrixWorld.determinant())>1e-8,n.name+' collapsed');}});
  // The final forearm segment and palm always share a tangent; no folded wrist.
  direction.copy(wp('handL')).sub(wp('arm14L')).normalize();
  end.copy(wp('finger201L')).sub(wp('handL')).normalize();
  assert.ok(direction.dot(end)>.97,name+' wrist tangent');
 }
 const check = clearance();
 assert.equal(check.buried, 0, name+' arm must stay outside the torso: '+JSON.stringify(check));
 if (process.argv.includes('--clearance')) console.log(name,check);
}
// Positive control: the old direct shoulder-to-key curve must be detected.
const route = pet.liveRig.torso.route;
pet.liveRig.torso.route = () => {};
step(); const unprotected = clearance();
pet.liveRig.torso.route = route;
step(); const protectedPose = clearance();
assert.ok(unprotected.buried > 0, 'surface probe must detect the original belly penetration');
assert.equal(protectedPose.buried, 0, 'routing clears the actual belly skin');
if (process.argv.includes('--clearance')) console.log({unprotected, protectedPose});
const morph = name => { let result=0;gltf.scene.traverse(m=>{const i=m.morphTargetDictionary?.[name];if(i!==undefined) result=Math.max(result,m.morphTargetInfluences[i]);});return result; };
assert.equal(morph('CheekPuff.L'),0,'neutral clip cannot inflate cheeks');
for(let i=0;i<30;i++)step({...base,anger:1});
assert.equal(morph('CheekPuff.L'),0,'anger never inflates cheeks');
assert.equal(morph('CheekPuff.R'),0);
assert.ok(morph('Angry')>.7,'eyelids still express anger');
for(let i=0;i<90;i++)step();
assert.ok(morph('CheekPuff.L')<1e-6,'cheeks must deflate on calm');

const pupil=gltf.scene.getObjectByName('PupilL');
const pupilBox=()=>{const b=new T.Box3();for(let i=0;i<pupil.geometry.attributes.position.count;i++)b.expandByPoint(pupil.getVertexPosition(i,new T.Vector3()).applyMatrix4(pupil.matrixWorld));return b;};
pet.liveRig.eyes(0,0);let neutral=pupilBox();
pet.liveRig.eyes(0,0,1,1,1);let looking=pupilBox();
assert.ok(looking.getCenter(v(0,0,0)).x>neutral.getCenter(v(0,0,0)).x+.01,'pupils look right');
assert.ok(looking.getCenter(v(0,0,0)).y>neutral.getCenter(v(0,0,0)).y+.01,'pupils look up');
assert.ok(looking.getSize(v(0,0,0)).x>neutral.getSize(v(0,0,0)).x*1.15,'curiosity dilates pupils');
const stable=Float32Array.from(pupil.geometry.attributes.position.array);
for(let i=0;i<90;i++)pet.liveRig.eyes(0,0,1,1,1);
assert.deepEqual(pupil.geometry.attributes.position.array,stable,'gaze never accumulates');
pet.liveRig.eyes(0,0);neutral=pupilBox();
pet.pose(0,{...base,head:{pitch:-.25,yaw:.35,roll:0}});
const headQ=gltf.scene.getObjectByName('head').getWorldQuaternion(new T.Quaternion());
assert.ok(v(0,0,1).applyQuaternion(headQ).x>.2,'whole head follows horizontal gaze');
assert.ok(v(0,0,1).applyQuaternion(headQ).y>.1,'head looks up with cursor');

for(let i=0;i<420;i++)step({...base,sleeping:1},contacts,'nap');
assert.ok(morph('Drool')>.99 && morph('Blink')>.95);
assert.ok(pet.current.time>=2.4 && pet.current.time<=3.6);
for(let i=0;i<40;i++)step();
assert.equal(morph('Drool'),0);assert.equal(morph('Blink'),0);
assert.deepEqual(pet.root.scale,fixedScale);assert.deepEqual(pet.root.position,fixedOrigin);
// Tongue follows real keyboard targets, leaves idle hands alone and retracts on interruption.
const tip=()=>pet.root.getObjectByName('NaiwaTongueTip');
for(const target of [v(-1,.20,1.2),v(1.8,.20,1.45),v(.1,.20,1.5)]) {
 assert.equal(pet.liveRig.canTongueReach(target),true);
 for(let i=0;i<24;i++)step(base,{...contacts,tongue:target,tongueWeight:1});
 assert.ok(tip().visible);assert.ok(tip().getWorldPosition(v(0,0,0)).distanceTo(target)<1e-5);
 assert.ok(wp('gripRight').distanceTo(contacts.left)<1e-5);
 assert.ok([...pet.root.getObjectByName('NaiwaTongue').geometry.attributes.position.array].every(Number.isFinite));
}
assert.equal(pet.liveRig.canTongueReach(v(100,0,0)),false);
for(const [frame,contact] of [[base,contacts],[{...base,sleeping:1},{...contacts,tongue:v(0,.2,1),tongueWeight:1}],
 [base,{...contacts,leftMode:'cup',tongue:v(0,.2,1),tongueWeight:1}]]) {
 for(let i=0;i<30;i++)step(frame,contact);
 assert.equal(tip().visible,false,'tongue retracts when idle, sleeping or holding a prop');
}
const {naiwaGroundRollPose}=await import('../src/naiwaMotion.ts');
const visibleBounds=root=>{const box=new T.Box3();root.traverseVisible(o=>{if(o.isMesh)box.union(new T.Box3().setFromObject(o,true));});return box;};
const kickSamples=[];
for(let i=0;i<=288;i++) {
 const age=i/60,roll=naiwaGroundRollPose(age,1);
 step({...base,gesture:{kind:'roll',age,duration:4.8,side:1},roll});
 kickSamples.push(wp('footL').y-wp('footR').y);
 if(i%30===0 && roll.tuck>.15){pet.roll(roll);pet.finishFrame(1);assert.ok(visibleBounds(pet.motionRoot).min.y>-.025, 'floor at '+age);}
}
assert.ok(Math.max(...kickSamples)-Math.min(...kickSamples)>.12,'feet alternate relative to the seated torso');
for(let i=0;i<60;i++)step();
const foot=wp('footContactLeft');step(base,{...contacts,stomp:1,stompLift:.15});
assert.ok(wp('footContactLeft').y>foot.y+.03,'ground tantrum still lifts a foot');
for(let i=0;i<75;i++)step({...base,gesture:{kind:'sniff',age:i/60,duration:3,side:1}});
assert.equal(pet.root.getObjectByName('NaiwaNoseDrop').visible,true);
for(let i=0;i<24;i++)step();
assert.equal(pet.root.getObjectByName('NaiwaNoseDrop').visible,false,'input interruption retracts nose drop');
const {groundRollPose,recoverGroundRoll}=await import('../src/groundRoll3d.ts');
for(const age of [.8,1.5,2.3,3.5,4.5,4.8]) {
 step();pet.roll(groundRollPose(age,1));pet.finishFrame(1);
 const bounds=visibleBounds(pet.motionRoot);
 assert.ok(bounds.min.y>-.025,'roll stays above floor');
 assert.deepEqual(pet.root.scale,fixedScale);
}
const rolled=groundRollPose(2.3,1);
for(const age of [0,.15,.5,.9,1.05]) {step();pet.roll(recoverGroundRoll(rolled,age));}
assert.ok(pet.motionRoot.quaternion.angleTo(new T.Quaternion())<1e-6);
assert.ok(pet.motionRoot.position.length()<1e-6);
for(let i=0;i<60;i++)step();
console.log('Naiwa runtime: seated size, desk/cup/wave contacts, wrist tangents, gaze, cheeks, sleep, tongue contacts, sniff interruption and articulated grounded roll passed.');

// Optional review uses the actual runtime-deformed vertices, not authored clip stills.
if (process.argv.includes('--review')) {
 const dir=new URL('../node_modules/.cache/naiwa-live-review/',import.meta.url);
 fs.mkdirSync(dir,{recursive:true});
 const jsonLength=bytes.readUInt32LE(12), meta=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
 const binary=28+jsonLength;
 for(let i=0;i<(meta.images??[]).length;i++) {
  const view=meta.bufferViews[meta.images[i].bufferView];
  fs.writeFileSync(new URL(`texture-${i}.png`,dir),bytes.subarray(binary+(view.byteOffset??0),binary+(view.byteOffset??0)+view.byteLength));
 }
 function exportPose(name) {
  pet.root.updateMatrixWorld(true);const meshes=[];
  gltf.scene.traverse(m=>{
   if(!m.isMesh)return;const positions=[],g=m.geometry;
   for(let i=0;i<g.attributes.position.count;i++) {const p=m.getVertexPosition(i,new T.Vector3()).applyMatrix4(m.matrixWorld);positions.push(...p.toArray());}
   const material=meta.materials.find(x=>x.name===m.material.name);
   meshes.push({name:m.name,positions,indices:Array.from(g.index?.array??Array.from({length:positions.length/3},(_,i)=>i)),uv:Array.from(g.attributes.uv?.array??[]),color:m.material.color.toArray(),texture:material?.pbrMetallicRoughness?.baseColorTexture?.index??null});
  });
  fs.writeFileSync(new URL(name+'.json',dir),JSON.stringify({meshes,meta:{textures:meta.textures},contacts:{left:contacts.left.toArray(),right:contacts.right.toArray()}}));
 }
 exportPose('desk');
 const wave={...contacts,right:v(.82,2.04,.38),rightMode:'wave'};
 for(let i=0;i<120;i++)step(base,wave);exportPose('wave');
 const gazeFrame={...base,head:{pitch:-.20,yaw:.35,roll:-.03}};
 for(let i=0;i<90;i++)step(gazeFrame);pet.liveRig.eyes(0,0,.8,.6,1);exportPose('gaze');
 for(let i=0;i<240;i++)step({...base,sleeping:1},contacts,'nap');exportPose('nap');
 for(let i=0;i<90;i++)step();pet.roll(groundRollPose(2.3,1));exportPose('roll');
 console.log('Runtime review geometry:',dir.pathname);
}
