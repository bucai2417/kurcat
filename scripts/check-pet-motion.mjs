/**
 * Run with: node scripts/check-pet-motion.mjs (Node >=22.15).
 * Uses existing TypeScript/Three dependencies, emits no files and needs no browser.
 * Only Canvas/WebGL drawing is mocked: geometry, transforms and engine updates are real.
 * This checks motion behaviour, not the rendered appearance or native window integration.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const threeURL = import.meta.resolve('three');
const rendererURL = 'pet-test:renderer';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'three' && context.parentURL?.endsWith('/src/catEngine3d.ts')) {
      return { url: rendererURL, shortCircuit: true };
    }
    if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts')) {
      const url = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(url)) return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === rendererURL) {
      return { format: 'module', shortCircuit: true, source: `
        export * from ${JSON.stringify(threeURL)};
        export class WebGLRenderer {
          setPixelRatio() {} setClearColor() {} setSize() {}
          render(scene, camera) { scene.updateMatrixWorld(); camera.updateMatrixWorld(); }
        }
      ` };
    }
    if (url.startsWith('file:') && /\.(png|svg|webp)$/.test(url)) {
      return { format: 'module', shortCircuit: true, source: `export default ${JSON.stringify(url)};` };
    }
    if (['modelContract.json', 'builtinCompanions.json', 'assets/naiwa/artwork.json'].some(name => url.endsWith('/src/' + name))) {
      return { format: 'module', shortCircuit: true, source: 'export default ' + readFileSync(fileURLToPath(url), 'utf8') + ';' };
    }
    if (url.startsWith('file:') && url.endsWith('.ts')) {
      return { format: 'module', shortCircuit: true, source: ts.transpileModule(
        readFileSync(fileURLToPath(url), 'utf8'), {
          fileName: fileURLToPath(url),
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, useDefineForClassFields: true },
        }).outputText };
    }
    return next(url, context);
  },
});

function makeContext(record = false) {
  const calls = [];
  const gradient = () => ({ addColorStop() {} });
  return new Proxy({
    calls, createLinearGradient: gradient, createRadialGradient: gradient,
    measureText: (text) => ({ width: String(text).length * 10 }),
    getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
  }, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => { if (record) calls.push([key, ...args]); };
    },
  });
}
function makeCanvas() {
  const context = makeContext();
  return {
    style: {}, width: 420, height: 440, clientWidth: 420, clientHeight: 440,
    parentElement: { clientWidth: 640, clientHeight: 420 },
    getContext: () => context,
    toDataURL: () => 'data:image/png;base64,test',
    getBoundingClientRect() {
      return { left: parseFloat(this.style.left) || 0, top: parseFloat(this.style.top) || 0,
        width: parseFloat(this.style.width) || 420, height: parseFloat(this.style.height) || 440 };
    },
  };
}
globalThis.window = {
  innerWidth: 420, innerHeight: 440, devicePixelRatio: 1,
  addEventListener() {}, setTimeout: () => 1, clearTimeout() {},
};
globalThis.document = { createElement: () => makeCanvas() };
const fakeImages = [];
globalThis.Image = class { complete = false; naturalWidth = 0; naturalHeight = 0; constructor() { fakeImages.push(this); } };
globalThis.Path2D = class { constructor() { return new Proxy(this, { get: () => () => {} }); } };
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

const { Vector2, Vector3, Raycaster } = await import('three');
const { KuroCatEngine3D } = await import('../src/catEngine3d.ts');
const { KuroCatEngine } = await import('../src/catEngine.ts');
const { DEFAULT_PROP } = await import('../src/prop.ts');
const { SleepReaction } = await import('../src/sleepReaction.ts');
const { MODEL_CONTRACT, parseModelPack, exportModelPack, parseModelCatalog, fetchModelCatalog, modelActions, modelModes, modelMode, modelRig, modelActionLabel } = await import('../src/modelPack.ts');
const { DEFAULT_BUILTIN_CATS, resolveCustomSkin } = await import('../src/catSkins.ts');
const { clipAngryEyelid, STRIKE_DURATION, setDesktopPetInsets } = await import('../src/petMotion.ts');
const { InputSounds, normalizeInputSound } = await import('../src/inputSounds.ts');
const { CatAudio, catAudio } = await import('../src/audio.ts');
const { SettingsSync } = await import('../src/settingsSync.ts');
const { PetGesture } = await import('../src/petGesture.ts');
const { sampleNaiwaPose, FROG_ACTIONS } = await import('../src/naiwaPose.ts');
const { deformNaiwaArm, naiwaCheekVolumes } = await import('../src/naiwaDeform.ts');
const { naiwaArtwork, naiwaSleepArtwork, readyNaiwaArtwork } = await import('../src/naiwaArtwork.ts');
const { propMouthContact, propLook } = await import('../src/propRenderer.ts');
const { TypingReactions, propReactionPose, PROP_REACTION_DURATION } = await import('../src/petReactions.ts');

function engine3d() {
  window.innerWidth = 420;
  window.innerHeight = 440;
  const engine = new KuroCatEngine3D(makeCanvas());
  engine.setIdleAutoEnabled(false);
  engine.showKeyBubbles = false;
  tick(engine, 0.02);
  return engine;
}
function tick(engine, seconds, dt = 1 / 60) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= dt) {
    engine.update(Math.min(dt, remaining));
    engine.scene.updateMatrixWorld();
    engine.camera.updateMatrixWorld();
  }
}
function near(actual, expected, epsilon = 1e-6, label = '') {
  assert.ok(Math.abs(actual - expected) < epsilon, `${label}: ${actual} != ${expected}`);
}
function nearVector(actual, expected, epsilon = 1e-6, label = '') {
  assert.ok(actual.distanceTo(expected) < epsilon, `${label}: ${actual.toArray()} != ${expected.toArray()}`);
}
function countStrikes(engine) {
  const times = [];
  const original = engine.spawnSlamFx.bind(engine);
  engine.spawnSlamFx = (...args) => { times.push(engine.elapsed); original(...args); };
  return times;
}
function propConfig(kind = 'coffee', side = 'right') {
  return { ...DEFAULT_PROP, enabled: true, autoSip: false, kind, side };
}

test('menu expansion preserves projected model size and desktop screen position across scales/layouts', () => {
  const engine = engine3d();
  for (const layout of ['65', '108']) {
    const logical = layout === '65' ? { w: 420, h: 440 } : { w: 530, h: 446 };
    engine.setKeyboardConfig(layout, 'cat');
    engine.setLogicalSize(logical);
    for (const scale of [0.2, 0.75, 1, 1.5]) {
      window.innerWidth = Math.max(260, logical.w * scale);
      window.innerHeight = Math.max(410, logical.h * scale);
      engine.setRenderScale(scale);
      tick(engine, 0.02);
      const before = engine.getPetScreenRect();
      const cameraBefore = engine.camera.position.clone();
      const p0 = new Vector3(-0.5, 1, 0).project(engine.camera);
      const p1 = new Vector3(0.5, 1, 0).project(engine.camera);
      const pixelWidth = (p1.x - p0.x) * before.width / 2;
      const regionBefore = engine.getHitRegions().cat;
      const hitX = before.left + regionBefore.cx * before.width;
      const hitY = before.top + regionBefore.cy * before.height;
      window.innerWidth += 276;
      window.innerHeight += 200;
      engine.resize();
      tick(engine, 0.02);
      const after = engine.getPetScreenRect();
      near(after.width, before.width);
      near(after.height, before.height);
      near(after.left - 276, before.left);
      near(after.top - 200, before.top);
      nearVector(engine.camera.position, cameraBefore);
      p0.set(-0.5, 1, 0).project(engine.camera);
      p1.set(0.5, 1, 0).project(engine.camera);
      near((p1.x - p0.x) * after.width / 2, pixelWidth);
      const regionAfter = engine.getHitRegions().cat;
      near(after.left + regionAfter.cx * after.width - 276, hitX);
      near(after.top + regionAfter.cy * after.height - 200, hitY);
      // Native cursor hit testing first maps window coordinates into petBox.
      const petBox = engine.getHitRegions().petBox;
      const petX = ((hitX + 276) / window.innerWidth - (petBox.cx - petBox.rx)) / (petBox.rx * 2);
      const petY = ((hitY + 200) / window.innerHeight - (petBox.cy - petBox.ry)) / (petBox.ry * 2);
      near(petX, regionAfter.cx); near(petY, regionAfter.cy);
    }
  }
  engine.stop();
});

test('fast typing completes strikes and does not keep pounding after input ends (30/60 FPS)', () => {
  for (const dt of [1 / 30, 1 / 60]) {
    const engine = engine3d();
    const strikes = countStrikes(engine);
    engine.triggerCrossDemo();
    for (let i = 0; i < 18; i++) {
      const key = i % 2 ? 65 : 83;
      engine.onKeyDown(key);
      tick(engine, 0.025, dt);
      engine.onKeyUp(key);
      tick(engine, 0.025, dt);
    }
    assert.ok(strikes.length > 0, 'rapid typing must not keep restarting anticipation');
    tick(engine, STRIKE_DURATION + 0.2, dt);
    const finishedCount = strikes.length;
    assert.equal(engine.isCross, true, 'expression may remain angry after hand motion stops');
    tick(engine, 4, dt);
    assert.equal(strikes.length, finishedCount, 'no delayed strike queue or idle anger loop');
    assert.equal(engine.tailTap.synthetic, false);
    assert.ok([...engine.desk.keys.values()].every(key => !key.down), 'no stuck keycap');
    engine.stop();
  }
});

test('mouse motion cannot steal an in-flight paw strike; a re-held key stays owned after recoil', () => {
  const engine = engine3d();
  engine.setTailKeyConfig('off', []);
  engine.triggerCrossDemo();
  const leftKey = [...engine.desk.keys.values()].find(key => key.x < 0.05 && key.spec.vkCodes?.length);
  assert.ok(leftKey);
  const vk = leftKey.spec.vkCodes[0];
  engine.onKeyDown(vk);
  const paw = engine.paws.L;
  assert.equal(paw.keyId, leftKey.spec.id);
  const start = paw.t0;
  tick(engine, 0.06);
  engine.onKeyUp(vk);
  engine.onGlobalMouseMove(0.2, 0.3);
  tick(engine, 0.15);
  assert.equal(paw.impacted, true);
  engine.onKeyDown(vk);
  assert.equal(paw.t0, start);
  assert.equal(Object.values(engine.paws).filter(p => p.keyId === leftKey.spec.id).length, 1, 'only one paw owns the re-held key');
  tick(engine, 0.5);
  assert.equal(paw.down, true);
  nearVector(paw.pos, engine.desk.keyTopWorld(leftKey.spec.id), 0.015, 'held key');
  engine.onKeyUp(vk);
  tick(engine, 0.5);
  nearVector(paw.pos, engine.desk.mouseTopWorld(), 0.03, 'return to mouse');
  engine.onGlobalMouseMove(0.8, 0.3);
  engine.onKeyDown(vk);
  assert.equal(Object.values(engine.paws).filter(p => p.keyId === leftKey.spec.id).length, 1, 'a settled key can change hands without duplicate ownership');
  tick(engine, 0.02);
  assert.equal(Object.values(engine.paws).filter(p => p.down).length, 1);
  engine.stop();
});

test('synthetic tail contact does not release a physical key or repeatedly emit lighting ripples', () => {
  const engine = engine3d();
  engine.setTailKeyConfig('off', []);
  engine.onKeyDown(32);
  engine.tailSlapKey('space');
  let keyEvents = 0;
  const setKeyDown = engine.desk.setKeyDown.bind(engine.desk);
  engine.desk.setKeyDown = (...args) => { keyEvents++; setKeyDown(...args); };
  tick(engine, 0.6);
  assert.equal(engine.desk.getKeyById('space').down, true);
  assert.equal(keyEvents, 0, 'already-held key must not retrigger lighting every animation frame');
  engine.onKeyUp(32);
  assert.equal(engine.desk.getKeyById('space').down, false);
  engine.setTailKeyConfig('custom', []);
  engine.triggerCrossDemo();
  engine.onKeyDown(65);
  tick(engine, 0.15);
  assert.equal(engine.tailTap.synthetic, false);
  engine.setPrivacyMode(true);
  tick(engine, 0.6);
  assert.equal(engine.heldKeys.size, 0);
  assert.ok([...engine.desk.keys.values()].every(key => !key.down));
  assert.ok(Object.values(engine.paws).every(paw => !paw.heavy && !paw.down));
  engine.stop();
});

test('all cups stay rigid, meet the mouth and paw, and return home without settings-sync teleportation', () => {
  const engine = engine3d();
  engine.setTailKeyConfig('off', []);
  for (const kind of ['coffee', 'cola', 'boba', 'energy', 'pudding']) {
    for (const side of ['left', 'right']) {
      const cfg = propConfig(kind, side);
      engine.setPropConfig(cfg);
      const handle = engine.propHandle;
      const home = handle.group.position.clone();
      const restChildren = handle.group.children.map(child => child.position.clone());
      const paw = side === 'left' ? engine.paws.L : engine.paws.R;
      assert.equal(engine.clickProp(), 'sipped');
      tick(engine, 0.65);
      assert.equal(engine.propPhase, 'lift');
      const mid = handle.group.position.clone();
      engine.setPropConfig(cfg);
      nearVector(handle.group.position, mid, 1e-8, 'settings sync');
      nearVector(paw.pos, handle.gripAnchor.clone().applyMatrix4(handle.group.matrixWorld));
      tick(engine, 0.25);
      assert.equal(engine.propPhase, 'sip');
      const mouth = new Vector3(0, -0.08, engine.surfaceZ(0, -0.08) + 0.04)
        .applyMatrix4(engine.headMount.matrixWorld);
      nearVector(handle.mouthAnchor.clone().applyMatrix4(handle.group.matrixWorld), mouth, 1e-6, `${kind} mouth`);
      nearVector(paw.pos, handle.gripAnchor.clone().applyMatrix4(handle.group.matrixWorld));
      near(handle.shadow.position.y, 0.002);
      assert.ok(handle.shadow.material.opacity < 0.18, 'ground shadow fades when lifted');
      engine.triggerIdleAction('wave');
      assert.equal(engine.idleAct, null, 'cup owns the hand until it has been put down');
      // Interrupt a sip with input: the other paw types while the cup is returned.
      engine.onKeyDown(65);
      assert.equal(engine.propPhase, 'return');
      const typingPaw = side === 'left' ? engine.paws.R : engine.paws.L;
      assert.equal(typingPaw.keyId, 'a');
      tick(engine, 0.2);
      nearVector(paw.pos, handle.gripAnchor.clone().applyMatrix4(handle.group.matrixWorld));
      engine.onKeyUp(65);
      tick(engine, 0.25);
      assert.equal(engine.propPhase, 'rest');
      nearVector(handle.group.position, home);
      handle.group.children.forEach((child, i) => {
        // Liquid fill is allowed to change; the shell/lid/straw remain rigid.
        if (i !== 1) nearVector(child.position, restChildren[i]);
      });
    }
  }
  engine.stop();
});

test('completed drinks consume one portion; disabling props cleans shadow and manual sip cancels paw strike', () => {
  const engine = engine3d();
  engine.setPropConfig(propConfig('coffee', 'left'));
  engine.setTailKeyConfig('off', []);
  engine.triggerCrossDemo();
  const leftKey = [...engine.desk.keys.values()].find(key => key.x < 0.05);
  engine.onKeyDown(leftKey.spec.vkCodes[0]);
  engine.onKeyUp(leftKey.spec.vkCodes[0]);
  assert.equal(engine.paws.L.heavy, true);
  engine.clickProp();
  assert.equal(engine.paws.L.heavy, false);
  assert.equal(engine.paws.L.keyId, null);
  tick(engine, 2.1);
  assert.equal(engine.propPhase, 'rest');
  near(engine.propLevel, 0.9);
  const shadow = engine.propHandle.shadow;
  engine.setPropConfig({ ...propConfig(), enabled: false });
  assert.equal(shadow.parent, null);
  assert.equal(engine.propHandle, null);
  engine.stop();
});

test('mouse heel anchor follows independent facing, stays behind buttons, and clears a left cup', () => {
  const engine = engine3d();
  for (const layout of ['65', '108']) {
    for (const keyboardFacing of ['cat', 'viewer']) {
      engine.setKeyboardConfig(layout, keyboardFacing);
      for (const mouseFacing of ['auto', 'cat', 'viewer']) {
        engine.setMouseOrientation(mouseFacing);
        const shape = engine.desk.mouseShape;
        const anchor = engine.desk.mouseTopWorld();
        const local = shape.worldToLocal(anchor.clone());
        assert.ok(local.z < -0.1, 'heel is opposite the local +Z buttons');
        const expected = mouseFacing === 'auto' ? keyboardFacing : mouseFacing;
        near(shape.rotation.y, expected === 'cat' ? -0.1 : Math.PI - 0.1);
        engine.setPropConfig(propConfig('coffee', 'left'));
        const home = engine.propHandle.group.position;
        assert.ok(Math.hypot(home.x - anchor.x, home.z - anchor.z) > 0.3, 'cup does not overlap the resting mouse paw');
      }
    }
  }
  engine.stop();
});


// Approximate screen-space occlusion by sampling each mouse-button triangle.
function buttonOcclusion(engine, button) {
  const blockers = engine.arms.flatMap(arm => [arm.paw, arm.limb.fill.mesh, ...arm.limb.caps]);
  for (const mesh of blockers) mesh.geometry.computeBoundingSphere();
  const positions = button.geometry.attributes.position;
  const indices = button.geometry.index;
  const ray = new Raycaster();
  let total = 0;
  let covered = 0;
  for (let i = 0; i < indices.count; i += 3) {
    const points = [0, 1, 2].map(j => new Vector3().fromBufferAttribute(positions, indices.getX(i + j)).applyMatrix4(button.matrixWorld));
    const projected = points.map(p => p.clone().project(engine.camera));
    const [a, b, c] = projected;
    const area = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    const target = points[0].clone().add(points[1]).add(points[2]).divideScalar(3);
    const ndc = target.clone().project(engine.camera);
    ray.setFromCamera(new Vector2(ndc.x, ndc.y), engine.camera);
    ray.far = target.distanceTo(ray.ray.origin) - 0.0001;
    total += area;
    if (ray.intersectObjects(blockers, false).length) covered += area;
  }
  assert.ok(total > 0);
  return covered / total;
}

test('mouse buttons remain mostly visible under both layouts and mouse orientations', () => {
  const engine = engine3d();
  for (const layout of ['65', '108']) {
    engine.setKeyboardConfig(layout, 'cat');
    for (const facing of ['cat', 'viewer']) {
      engine.setMouseOrientation(facing);
      for (const cursor of [[0.5, 0.5], [0.05, 0.05], [0.95, 0.95]]) {
        for (const pressed of [false, true]) {
          engine.onGlobalMouseMove(...cursor);
          if (pressed) engine.onMouseDown('left');
          else engine.onMouseUp('left');
          // Keep mouse tracking awake while it settles, including unchanged cursor positions.
          engine.lastMouse = engine.elapsed;
          tick(engine, 0.6);
          const shape = engine.desk.mouseShape;
          for (const key of ['leftBtn', 'rightBtn']) {
            const coverage = buttonOcclusion(engine, shape.userData[key]);
            assert.ok(coverage < 0.2, `${layout}/${facing}/${cursor}/${pressed}/${key}: button coverage ${coverage}`);
          }
        }
      }
      engine.onMouseUp('left');
    }
  }
  engine.stop();
});

test('2D angry lids clip inward across iris and highlights for builtin/custom skins', () => {
  const engine = new KuroCatEngine(makeCanvas());
  engine.setMoodMeter(0.95, 0);
  engine.dizzy = engine.squintAmount = engine.privacyClose = 0;
  engine.isBlinking = false;
  for (const skin of ['black', 'ragdoll', 'custom']) {
    const ctx = makeContext(true);
    if (skin === 'custom') engine.drawCustomEyes(ctx, resolveCustomSkin(DEFAULT_BUILTIN_CATS[0]), 0, 0);
    else { engine.catBreed = skin; engine.drawEyes(ctx, 0, 0); }
    assert.ok(ctx.calls.filter(call => call[0] === 'clip').length >= 2, `${skin} eyes need actual clipping`);
    assert.equal(ctx.calls[0][0], 'save');
    assert.equal(ctx.calls.at(-1)[0], 'restore');
  }
  const left = makeContext(true);
  const right = makeContext(true);
  clipAngryEyelid(left, 15, 13, 1, 1);
  clipAngryEyelid(right, 15, 13, -1, 1);
  const leftTop = left.calls.filter(call => ['moveTo', 'lineTo'].includes(call[0])).slice(0, 2);
  const rightTop = right.calls.filter(call => ['moveTo', 'lineTo'].includes(call[0])).slice(0, 2);
  assert.ok(leftTop[1][2] > leftTop[0][2], 'left inner lid lowers');
  assert.ok(rightTop[0][2] > rightTop[1][2], 'right inner lid lowers');
  near(leftTop[0][2], rightTop[1][2]);
  engine.privacyClose = 1;
  const closed = makeContext(true);
  engine.drawEyes(closed, 0, 0);
  assert.equal(closed.calls.filter(call => call[0] === 'clip').length, 0);
  engine.stop();
});

test('new gestures work in both modes and yield to drinks/privacy', () => {
  const flat = new KuroCatEngine(makeCanvas());
  for (const kind of ['tilt', 'slowBlink']) {
    assert.equal(flat.triggerIdleAction(kind), true);
    assert.equal(flat.idleActionKind, kind);
    flat.endIdleAction();
  }
  flat.setPropConfig(propConfig());
  flat.triggerIdleAction('tilt');
  assert.equal(flat.triggerSip(), true);
  assert.equal(flat.idleActionKind, null);
  assert.equal(flat.triggerIdleAction('wave'), false);
  flat.setPrivacyMode(true);
  assert.equal(flat.triggerSip(), false);
  flat.stop();
  const spatial = engine3d();
  for (const kind of ['tilt', 'slowBlink', 'wave', 'groom', 'stretch', 'cuddle']) {
    spatial.triggerIdleAction(kind);
    assert.equal(spatial.idleAct?.kind, kind);
    tick(spatial, 0.4);
    assert.ok(Number.isFinite(spatial.headRot.roll));
    spatial.onKeyDown(65);
    assert.equal(spatial.idleAct, null);
    spatial.onKeyUp(65);
  }
  spatial.setPrivacyMode(true);
  spatial.triggerIdleAction('wave');
  assert.equal(spatial.idleAct, null);
  spatial.stop();
});


test('passive cursor events do not cancel drinks, but typing and privacy return the prop', () => {
  for (const kind of ['coffee', 'cola', 'energy', 'boba', 'pudding']) {
    const e = engine3d();
    e.setPropConfig(propConfig(kind));
    e.clickProp();
    for (let i = 0; i < 250; i++) {
      e.onGlobalMouseMove(0.25 + 0.06 * Math.sin(i * 0.3), 0.35);
      e.onWindowCursor(0.4, 0.5, true);
      if (i === 4) e.onMouseDown('left');
      if (i === 5) e.onMouseUp('left');
      tick(e, 1 / 60);
    }
    near(e.propLevel, 0.9, 1e-6, kind + ' consumed once');
    assert.equal(e.propPhase, 'rest');
    e.clickProp(); tick(e, 0.7); e.onKeyDown(65); e.onKeyUp(65); tick(e, 2);
    near(e.propLevel, 0.9, 1e-6, 'interrupted sip is not consumed');
    e.clickProp(); tick(e, 0.7); e.setPrivacyMode(true); tick(e, 2);
    assert.equal(e.propPhase, 'rest');
    near(e.propLevel, 0.9);
  }
});

test('left/right menu margins preserve desktop anchors and 2D hit mapping', () => {
  try {
    for (const layout of ['65', '108']) for (const scale of [0.7, 1, 1.5]) {
      setDesktopPetInsets(null);
      const e = engine3d();
      e.setKeyboardConfig(layout, 'cat');
      const logical = layout === '65' ? { w: 420, h: 440 } : { w: 530, h: 446 };
      e.setLogicalSize(logical); e.setRenderScale(scale);
      window.innerWidth = logical.w * scale; window.innerHeight = logical.h * scale; e.resize();
      const before = e.getPetScreenRect();
      for (const right of [0, 276]) for (const bottom of [0, 140]) {
        window.innerWidth = logical.w * scale + 276;
        window.innerHeight = logical.h * scale + 200;
        setDesktopPetInsets({ right, bottom }); e.resize();
        const after = e.getPetScreenRect();
        near(after.width, before.width); near(after.height, before.height);
        near(after.left - before.left, 276 - right);
        near(after.top - before.top, 200 - bottom);
        const canvas2 = makeCanvas();
        canvas2.getBoundingClientRect = () => ({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
        const e2 = new KuroCatEngine(canvas2); e2.setRenderScale(scale); e2.setKeyboardConfig(layout, 'cat'); e2.resize();
        const pt = { x: 125, y: 185 };
        // clientToLogical must invert exactly the same shifted draw transform.
        const r2 = e2.getPetScreenRect();
        const local = e2.clientToLogical(r2.left + pt.x * r2.width / e2.getLogicalSize().w, r2.top + pt.y * r2.height / e2.getLogicalSize().h);
        near(local.x, pt.x); near(local.y, pt.y);
      }
    }
  } finally { setDesktopPetInsets(null); }
});

test('ground roll turns belly upward, keeps limbs attached, clears the floor and recovers at 30/60 FPS', () => {
  for (const dt of [1 / 30, 1 / 60]) for (const side of [-1, 1]) {
    const e = engine3d(); e.setPropConfig(propConfig()); e.setHeadphones(true); e.triggerIdleAction('roll'); e.idleAct.side = side;
    const q = e.rollRoot.quaternion.clone();
    let bellyUp = false;
    for (let i = 0; i < Math.ceil(5.2 / dt); i++) {
      tick(e, dt, dt);
      assert.ok(e.rollRoot.position.toArray().every(Number.isFinite));
      assert.ok(q.angleTo(e.rollRoot.quaternion) < 0.22, 'no rotation jump'); q.copy(e.rollRoot.quaternion);
      if (new Vector3(0, 0, 1).applyQuaternion(q).y > 0.85) bellyUp = true;
      assert.equal(e.catShadow.parent, e.scene, 'shadow stays on floor');
      for (const arm of e.arms) {
        assert.equal(arm.paw.parent, e.rollRoot);
        const actual = arm.paw.getWorldPosition(new Vector3());
        const wrist = arm.limb.caps[1].getWorldPosition(new Vector3());
        assert.ok(actual.distanceTo(wrist) < 0.025, 'paw remains connected to the arm endpoint');
        const shoulder = arm.limb.caps[0].getWorldPosition(new Vector3());
        const bodyAnchor = arm.shoulder.clone().applyMatrix4(e.rollRoot.matrixWorld);
        nearVector(shoulder, bodyAnchor);
      }
      if (e.rollPose.tuck > 0.2) {
        let minY = Infinity;
        e.rollRoot.traverseVisible((o) => {
          if (!o.isMesh || o === e.bodyMesh) return;
          const positions = o.geometry.getAttribute('position');
          for (let k = 0; k < positions.count; k++) {
            minY = Math.min(minY, new Vector3().fromBufferAttribute(positions, k).applyMatrix4(o.matrixWorld).y);
          }
        });
        assert.ok(minY >= -0.002, 'ears, paws, tail and accessories above the floor: ' + minY);
        assert.equal(e.clickProp(), 'busy');
      }
    }
    assert.ok(bellyUp, 'must actually roll onto its back');
    near(e.rollRoot.quaternion.angleTo(q.identity()), 0); near(e.rollRoot.position.length(), 0);
    assert.equal(e.idleAct, null);
    e.triggerIdleAction('roll'); tick(e, 2.35, dt);
    const previous = e.rollRoot.quaternion.clone();
    e.onKeyDown(65); e.onKeyUp(65); tick(e, dt, dt);
    assert.ok(previous.angleTo(e.rollRoot.quaternion) < 0.15, 'interruption preserves current pose');
    tick(e, 1.5, dt);
    near(e.rollRoot.quaternion.angleTo(q.identity()), 0); near(e.rollRoot.position.length(), 0);
    e.setPropConfig(propConfig()); assert.equal(e.clickProp(), 'sipped');
    e.triggerIdleAction('roll'); assert.notEqual(e.idleAct?.kind, 'roll', 'cannot roll with a cup');
  }
});

function audioContext() {
  return {
    state: 'running', currentTime: 0, sampleRate: 12000, destination: {}, sources: [], gains: [],
    async resume() { this.state = 'running'; },
    createBuffer(_channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; },
    createGain() {
      const gain = { gain: { value: 1 }, connect() {}, disconnect() { this.disconnected = true; } };
      this.gains.push(gain); return gain;
    },
    createBufferSource() {
      const source = { playbackRate: { value: 1 }, onended: null, connect() {},
        start() { this.started = true; }, stop() { this.stopped = true; }, disconnect() { this.disconnected = true; } };
      this.sources.push(source); return source;
    },
  };
}
test('input sound toggles, repeats, privacy, voice limits and suspended audio do not leak or replay', async () => {
  const ctx = audioContext(); const sound = new InputSounds(() => ctx);
  sound.keyDown(); sound.mouseDown('left'); assert.equal(ctx.sources.length, 0);
  sound.configure({ keyboard: true, mouse: true, profile: 'linear', volume: 0.4 });
  sound.keyDown(true); assert.equal(ctx.sources.length, 0);
  sound.keyDown(); sound.mouseDown('left'); assert.equal(ctx.sources.length, 2);
  for (let i = 0; i < 30; i++) { ctx.currentTime += 0.01; sound.keyDown(); }
  assert.equal(sound.voices.size, 12); assert.ok(ctx.sources[0].stopped);
  sound.setPrivacy(true); assert.equal(sound.voices.size, 0);
  assert.ok(ctx.sources.every(s => s.disconnected)); assert.ok(ctx.gains.every(g => g.disconnected));
  await sound.preview('keyboard'); sound.keyDown(); assert.equal(sound.voices.size, 0);
  sound.setPrivacy(false); ctx.state = 'suspended'; ctx.currentTime += 1; sound.keyDown();
  assert.equal(sound.voices.size, 0);
  await sound.preview('mouse'); assert.equal(sound.voices.size, 1);
  const final = ctx.sources.at(-1); final.onended(); assert.equal(sound.voices.size, 0); assert.ok(final.disconnected);
  sound.configure({ keyboard: true, mouse: false, volume: 0.4 }); ctx.currentTime += 1;
  sound.mouseDown('left'); assert.equal(sound.voices.size, 0); sound.keyDown(); assert.equal(sound.voices.size, 1);
  sound.configure({ volume: 0 }); assert.equal(sound.voices.size, 0);
  assert.equal(normalizeInputSound({ volume: NaN, profile: 'invalid' }).profile, 'linear');
  assert.equal(normalizeInputSound({ volume: 10 }).volume, 1);
});

test('all synthesized switch profiles produce different bounded, finite, short samples', async () => {
  const ctx = audioContext(); const sound = new InputSounds(() => ctx); const samples = [];
  for (const profile of ['linear', 'tactile', 'clicky', 'silent']) {
    sound.configure({ profile, volume: 0.4 }); ctx.currentTime += 1;
    await sound.preview('keyboard');
    const data = ctx.sources.at(-1).buffer.getChannelData(0);
    assert.ok(data.every(v => Number.isFinite(v) && Math.abs(v) <= 1));
    near(data[0], 0); assert.ok(Math.abs(data.at(-1)) < 0.001);
    for (const previous of samples) assert.notDeepEqual(data, previous);
    samples.push(data);
  }
});


function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('settings edits stay ordered and preserve native changes while rapid toggles are pending', async () => {
  let native = { sound: true, locked: false, scale: 1 }, view;
  const writes = [], gates = [deferred(), deferred()];
  const sync = new SettingsSync(native, async () => ({ ...native }), async patch => {
    const n = writes.push(patch) - 1;
    await gates[n].promise; native = { ...native, ...patch };
  }, value => { view = value; });
  const off = sync.update({ sound: false });
  const on = sync.update({ sound: true });
  assert.equal(view.sound, true, 'UI reflects the latest user choice immediately');
  await Promise.resolve();
  assert.deepEqual(writes, [{ sound: false }], 'only the first partial edit is in flight');
  native = { ...native, locked: true }; // independent tray/MCP change
  await sync.refresh();
  assert.equal(view.locked, true); assert.equal(view.sound, true);
  gates[0].resolve(); await off; await Promise.resolve();
  assert.deepEqual(writes, [{ sound: false }, { sound: true }]);
  assert.equal(view.sound, true, 'older save must not flash an old checkbox state');
  gates[1].resolve(); await on;
  assert.deepEqual(view, { sound: true, locked: true, scale: 1 });
  assert.deepEqual(native, view);
});

test('settings discard stale reads and recover from failed writes without blocking later edits', async () => {
  let view; const reads = [deferred(), deferred()]; let n = 0;
  const sync = new SettingsSync({ sound: true }, () => reads[n++].promise, async () => {}, value => { view = value; });
  const old = sync.refresh(), recent = sync.refresh();
  reads[1].resolve({ sound: false }); await recent;
  reads[0].resolve({ sound: true }); await old;
  assert.equal(view.sound, false, 'late read cannot restore the old state');
  let native = { sound: true, locked: false }, attempts = 0;
  const recovery = new SettingsSync(native, async () => ({ ...native }), async patch => {
    if (++attempts === 1) throw new Error('temporary IPC failure');
    native = { ...native, ...patch };
  }, value => { view = value; });
  const failed = recovery.update({ sound: false });
  const next = recovery.update({ locked: true });
  await assert.rejects(failed, /temporary IPC/); await next;
  assert.deepEqual(view, { sound: true, locked: true });
});

test('prop click areas cover actual mesh vertices, handles and straws at every scale and menu offset', () => {
  const e = engine3d(); const point = new Vector3();
  for (const layout of ['65', '108']) {
    e.setKeyboardConfig(layout, 'cat');
    const logical = layout === '65' ? { w: 420, h: 440 } : { w: 530, h: 446 };
    e.setLogicalSize(logical);
    for (const scale of [0.2, 0.75, 1.5]) {
      window.innerWidth = logical.w * scale + 310;
      window.innerHeight = logical.h * scale + 180;
      e.setRenderScale(scale);
      for (const side of ['left', 'right']) {
        for (const kind of ['coffee', 'boba', 'cola', 'energy', 'pudding']) {
          e.setPropConfig(propConfig(kind, side)); tick(e, 0.02);
          const rect = e.getPetScreenRect(), regions = e.getHitRegions();
          const p = regions.prop, box = regions.petBox;
          assert.ok(p, kind + ' has a hit area');
          let visibleVertices = 0;
          e.propHandle.group.traverseVisible(mesh => {
            const position = mesh.geometry?.getAttribute('position');
            if (!position) return;
            const extremes = [];
            for (let i = 0; i < position.count; i++) {
              point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).project(e.camera);
              const x = (point.x + 1) / 2, y = (1 - point.y) / 2;
              if (point.z < -1 || point.z > 1 || x < 0 || x > 1 || y < 0 || y > 1) continue;
              visibleVertices++;
              const cx = rect.left + x * rect.width, cy = rect.top + y * rect.height;
              if (!extremes[0] || cx < extremes[0][0]) extremes[0] = [cx, cy];
              if (!extremes[1] || cx > extremes[1][0]) extremes[1] = [cx, cy];
              if (!extremes[2] || cy < extremes[2][1]) extremes[2] = [cx, cy];
              if (!extremes[3] || cy > extremes[3][1]) extremes[3] = [cx, cy];
              const nativeX = (cx / window.innerWidth - (box.cx - box.rx)) / (2 * box.rx);
              const nativeY = (cy / window.innerHeight - (box.cy - box.ry)) / (2 * box.ry);
              assert.ok(Math.abs(nativeX - p.cx) <= p.rx + 1e-8 && Math.abs(nativeY - p.cy) <= p.ry + 1e-8,
                'native rectangular area agrees with frontend');
            }
            for (const [cx, cy] of extremes) assert.ok(e.hitTestProp(cx, cy), kind + ' visible geometry must be clickable');
          });
          assert.ok(visibleVertices > 20);
          assert.equal(e.hitTestProp(rect.left + (p.cx + p.rx) * rect.width + 2,
            rect.top + p.cy * rect.height), false, 'padding is bounded');
        }
      }
    }
  }
  e.setPropConfig({ ...propConfig(), enabled: false });
  assert.equal(e.getHitRegions().prop, null); assert.equal(e.hitTestProp(0, 0), false);
  e.stop();
});

test('purr off is immediate and persistent, while keyboard and mouse sounds keep their own output', async () => {
  const ctx = audioContext(); const previous = window.AudioContext;
  const param = () => ({ value: 0, events: [],
    cancelScheduledValues(time) { this.events.push(['cancel', time]); },
    setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); },
    setTargetAtTime(value, time, constant) { this.value = value; this.events.push(['ramp', value, time, constant]); },
  });
  ctx.createGain = function() {
    const g = { gain: param(), connections: new Set(), connect(target) { this.connections.add(target); },
      disconnect() { this.connections.clear(); } };
    this.gains.push(g); return g;
  };
  ctx.createBiquadFilter = () => ({ frequency: param(), Q: param(), connect() {} });
  ctx.createOscillator = () => ({ frequency: param(), connect() {}, start() {} });
  window.AudioContext = class { constructor() { return ctx; } };
  try {
    const audio = new CatAudio(); audio.setEnabled(false); audio.setPurrIntensity(1);
    assert.equal(ctx.sources.length, 0, 'disabled startup creates no purr loop');
    audio.setEnabled(true); audio.setPurrIntensity(0.8);
    const master = ctx.gains.at(-1);
    assert.ok(master.gain.value > 0 && master.connections.has(ctx.destination));
    audio.setEnabled(false);
    assert.equal(master.gain.value, 0); assert.equal(master.connections.size, 0);
    assert.deepEqual(master.gain.events.slice(-2).map(e => e[0]), ['cancel', 'set']);
    const count = master.gain.events.length;
    for (let frame = 0; frame < 120; frame++) audio.setPurrIntensity(1);
    assert.equal(master.gain.events.length, count, 'render loop cannot restart purring');
    const sounds = new InputSounds(() => audio.getContext());
    sounds.configure({ keyboard: true, mouse: true, volume: 0.4 });
    sounds.keyDown(); sounds.mouseDown('left');
    assert.equal(ctx.sources.length, 3, 'purr loop plus two independent input voices');
    assert.equal(ctx.state, 'running'); assert.equal(master.connections.size, 0);
    audio.setEnabled(true); audio.setEnabled(true); audio.setPurrIntensity(0.8);
    assert.equal(ctx.sources.length, 3, 'reenabling reuses the purr graph');
    assert.equal(master.connections.size, 1); assert.ok(master.gain.value > 0);
  } finally { window.AudioContext = previous; }
});


test('typing reactions cycle at both frame rates and fade after pauses or disabled tracking', () => {
  for (const dt of [1 / 30, 1 / 60]) {
    const reactions = new TypingReactions(), seen = [], marks = new Set();
    for (let t = 0; t < 33; t += dt) {
      const pose = reactions.update(dt, 8, true, true);
      if (reactions.kind && seen.at(-1) !== reactions.kind) seen.push(reactions.kind);
      if (pose.mark) marks.add(pose.mark);
      for (const value of Object.values(pose)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
    }
    assert.deepEqual(seen.slice(0, 5), ['focus', 'groove', 'excited', 'grumpy', 'focus']);
    assert.deepEqual([...marks].sort(), ['note', 'spark']);
    for (let t = 0; t < 0.8; t += dt) reactions.update(dt, 0, false, true);
    assert.equal(reactions.kind, null); near(reactions.amount, 0);
    for (let t = 0; t < 3; t += dt) reactions.update(dt, 8, true, true);
    assert.ok(reactions.amount > 0.9);
    reactions.update(dt, 8, true, false);
    assert.equal(reactions.kind, null); near(reactions.amount, 0);
    for (let t = 0; t < 10; t += dt) reactions.update(dt, 8, true, false);
    assert.equal(reactions.kind, null);
  }
});

test('real typing drives all moods in 2D and 3D without anger masking the next focus or delayed strikes', () => {
  const descriptor = Object.getOwnPropertyDescriptor(performance, 'now');
  let clock = 10000;
  Object.defineProperty(performance, 'now', { configurable: true, value: () => clock });
  try {
    for (const spatial of [false, true]) {
      clock = 10000;
      const e = spatial ? engine3d() : new KuroCatEngine(makeCanvas());
      e.setIdleAutoEnabled(false); e.setTailKeyConfig('off', []);
      e.setPropConfig({ ...DEFAULT_PROP, enabled: false }); e.showKeyBubbles = false;
      const seen = [], marks = new Set(), strikes = spatial ? countStrikes(e) : [];
      const step = () => { clock += 1000 / 60; if (spatial) tick(e, 1 / 60); else e.update(1 / 60, clock); };
      let focusAfterAnger = false, angerSeen = false;
      for (let frame = 0; frame < 36 * 60; frame++) {
        if (frame % 7 === 0) { const key = frame % 14 === 0 ? 65 : 74; e.onKeyDown(key, false); e.onKeyUp(key); }
        step();
        const kind = e.typingReactions.kind;
        if (kind && seen.at(-1) !== kind) seen.push(kind);
        if (spatial) for (const fx of e.fxList) marks.add(fx.kind);
        else if (e.typingPose.mark) marks.add(e.typingPose.mark);
        if (spatial ? e.isCross : e.annoyance > 0.55) angerSeen = true;
        if (kind === 'focus' && seen.includes('grumpy') && e.typingReactions.amount > 0.6) {
          focusAfterAnger = true;
          assert.ok(spatial ? !e.isCross : e.annoyance < 0.26, 'next focus has clear eyes');
        }
      }
      assert.deepEqual(seen.slice(0, 5), ['focus', 'groove', 'excited', 'grumpy', 'focus']);
      assert.ok(angerSeen); assert.ok(focusAfterAnger);
      assert.ok(marks.has('note') && marks.has('spark'));
      for (let i = 0; i < 60; i++) step();
      assert.equal(e.typingReactions.kind, null);
      const finishedStrikes = strikes.length;
      for (let i = 0; i < 180; i++) step();
      assert.equal(strikes.length, finishedStrikes, 'no queued strikes after typing stops');
      e.setMoodTrackingEnabled(false);
      for (let i = 0; i < 240; i++) { if (i % 7 === 0) { e.onKeyDown(65, false); e.onKeyUp(65); } step(); }
      assert.equal(e.typingReactions.kind, null);
      assert.equal(spatial ? e.isCross : e.annoyance > 0, false);
      e.setMoodTrackingEnabled(true); e.setPrivacyMode(true);
      for (let i = 0; i < 240; i++) { if (i % 7 === 0) { e.onKeyDown(65, false); e.onKeyUp(65); } step(); }
      assert.equal(e.typingReactions.kind, null); e.stop();
    }
  } finally {
    if (descriptor) Object.defineProperty(performance, 'now', descriptor);
    else delete performance.now;
  }
});

test('listen, shimmy and paw check stay connected, ease in/out and yield to real input', () => {
  for (const dt of [1 / 30, 1 / 60]) for (const kind of ['listen', 'shimmy', 'pawCheck']) {
    const e = engine3d(); tick(e, 1, dt);
    e.triggerIdleAction(kind); assert.equal(e.idleAct?.kind, kind);
    // Settings publication may repeat this value several times while a manual action plays.
    e.setIdleAutoEnabled(false); assert.equal(e.idleAct?.kind, kind);
    const previous = e.headMount.quaternion.clone();
    const initialPaws = [e.paws.L.pos.clone(), e.paws.R.pos.clone()];
    const previousPaws = initialPaws.map(p => p.clone());
    let maxHead = 0, maxPaw = 0;
    for (let t = 0; t < 4.2; t += dt) {
      tick(e, dt, dt);
      maxHead = Math.max(maxHead, Math.abs(e.headRot.roll), Math.abs(e.headRot.yaw));
      assert.ok(previous.angleTo(e.headMount.quaternion) < 0.25, 'smooth head motion');
      previous.copy(e.headMount.quaternion);
      for (const [i, paw] of [e.paws.L, e.paws.R].entries()) {
        assert.ok(paw.pos.toArray().every(Number.isFinite));
        assert.ok(paw.pos.distanceTo(previousPaws[i]) < 0.25, 'no paw teleport');
        previousPaws[i].copy(paw.pos); maxPaw = Math.max(maxPaw, paw.pos.distanceTo(initialPaws[i]));
      }
      for (const arm of e.arms) {
        const hand = arm.paw.getWorldPosition(new Vector3());
        const wrist = arm.limb.caps[1].getWorldPosition(new Vector3());
        assert.ok(hand.distanceTo(wrist) < 0.025, 'wrist stays attached');
      }
    }
    assert.equal(e.idleAct, null);
    assert.ok(maxHead > 0.05, kind + ' changes head pose');
    if (kind === 'pawCheck') assert.ok(maxPaw > 0.2, 'paw comes up for inspection');
    e.triggerIdleAction(kind); tick(e, 0.7, dt);
    e.onKeyDown(65); e.onKeyUp(65); assert.equal(e.idleAct, null);
    tick(e, 0.7, dt); assert.equal(e.paws.L.down || e.paws.R.down, false); e.stop();
  }
  const flat = new KuroCatEngine(makeCanvas()); flat.setIdleAutoEnabled(false);
  assert.equal(flat.triggerIdleAction('wave'), true);
  flat.setIdleAutoEnabled(false); assert.equal(flat.idleActionKind, 'wave'); flat.stop();
});

test('each 3D drink has a distinct aftertaste after return, free paw ownership and bounded lifetime', () => {
  const signatures = new Set();
  for (const kind of ['coffee', 'boba', 'cola', 'energy', 'pudding']) {
    const pose = propReactionPose(kind, 1);
    signatures.add(JSON.stringify(pose));
    near(propReactionPose(kind, -0.1).amount, 0);
    near(propReactionPose(kind, PROP_REACTION_DURATION).amount, 0);
    for (const side of ['left', 'right']) {
      const e = engine3d(); e.setPropConfig(propConfig(kind, side));
      const strikes = countStrikes(e);
      assert.equal(e.clickProp(), 'sipped');
      for (let i = 0; i < 180 && e.propPhase !== 'rest'; i++) {
        tick(e, 1 / 60);
        if (e.propPhase !== 'rest') assert.ok(e.fxList.every(fx => !['heart', 'note', 'spark', 'bubble'].includes(fx.kind)), 'cup returns before aftertaste');
      }
      assert.equal(e.propPhase, 'rest'); assert.equal(e.propMood, kind); assert.ok(e.propMoodT > 3.4);
      tick(e, 0.8);
      assert.ok(e.fxList.some(fx => fx.kind === pose.mark), kind + ' gets its own reaction mark');
      assert.equal(e.paws.L.down || e.paws.R.down, false);
      assert.equal(strikes.length, 0, 'energy and burp cannot strike keys');
      e.onKeyDown(65); e.onKeyUp(65); near(e.propMoodT, 0);
      tick(e, 0.8); assert.equal(e.propPhase, 'rest');
      assert.equal(e.clickProp(), 'sipped'); tick(e, 2.1);
      assert.ok(e.propMoodT > 0);
      tick(e, 4); near(e.propMoodT, 0);
      assert.equal(e.clickProp(), 'sipped'); tick(e, 2.1);
      e.setPropConfig({ ...propConfig(kind, side), enabled: false });
      near(e.propMoodT, 0); assert.equal(e.propMood, null); e.stop();
    }
  }
  assert.equal(signatures.size, 5);
});


test('menu action survives its delayed initiating click but later clicks and keys still interrupt', () => {
  for (const kind of ['wave', 'listen', 'shimmy', 'pawCheck', 'roll', 'nap']) {
    const e = engine3d(); tick(e, 1);
    e.triggerIdleAction(kind, true);
    tick(e, 0.08); e.onMouseDown('left'); e.onMouseUp('left');
    if (kind === 'nap') assert.equal(e.asleep, true);
    else assert.equal(e.idleAct?.kind, kind);
    assert.equal(e.leftMouseDown, false, 'initiating click must not seize the mouse paw');
    tick(e, 0.25); e.onMouseDown('left');
    assert.equal(e.idleAct, null); assert.equal(e.asleep, false); e.onMouseUp('left'); e.stop();
    const keyed = engine3d(); keyed.triggerIdleAction(kind, true);
    keyed.onKeyDown(65); keyed.onKeyUp(65);
    assert.equal(keyed.idleAct, null); assert.equal(keyed.asleep, false); keyed.stop();
  }
  const descriptor = Object.getOwnPropertyDescriptor(performance, 'now');
  let clock = 1000;
  Object.defineProperty(performance, 'now', { configurable: true, value: () => clock });
  try {
    for (const kind of ['wave', 'groom', 'stretch', 'nap', 'cuddle']) {
      const e = new KuroCatEngine(makeCanvas()); e.setIdleAutoEnabled(false);
      assert.equal(e.triggerIdleAction(kind, true), true);
      clock += 80; e.onMouseDown('left'); e.onMouseUp('left');
      assert.equal(e.idleActionKind, kind); assert.equal(e.mouseLeftDown, false);
      clock += 250; e.onMouseDown('left'); e.onMouseUp('left');
      assert.equal(e.idleActionKind, null);
      e.triggerIdleAction(kind, true); e.onKeyDown(65); e.onKeyUp(65);
      assert.equal(e.idleActionKind, null); e.stop();
    }
    const automatic = new KuroCatEngine(makeCanvas()); automatic.triggerIdleAction('wave');
    automatic.onMouseDown('left'); assert.equal(automatic.idleActionKind, null); automatic.stop();
  } finally {
    if (descriptor) Object.defineProperty(performance, 'now', descriptor);
    else delete performance.now;
  }
});


// Wake-up tantrums share time and contact semantics across both renderers.
test('sleep tantrums last 2–5 seconds and repeated inputs never extend them', () => {
  for (const random of [0, 0.5, 1]) {
    const r = new SleepReaction(); const start = 10; const end = start + 2 + random * 3;
    assert.equal(r.start(start, () => random), true);
    assert.equal(r.start(start + 0.4, () => 1), false);
    assert.equal(r.active(end - 0.001), true);
    assert.equal(r.active(end), false);
    assert.equal(r.sample(end).settled, true);
    assert.equal(r.sample(end + 0.1).settled, false);
    assert.equal(r.start(end + 0.1), false, 'fade must finish before another tantrum');
    assert.equal(r.sample(end + 0.3).amount, 0);
    assert.equal(r.visible(end + 0.3), false);
    r.reset(); assert.equal(r.sample(end + 1).amount, 0);
  }
  const r = new SleepReaction(); r.start(0, () => 1);
  const before = r.sample(0.04).amount;
  assert.equal(r.calm(0.04), true); near(r.sample(0.04).amount, before);
  assert.ok(r.sample(0.14).amount < before); assert.equal(r.sample(0.33).amount, 0);
});

test('tail impacts land exactly on a contact frame at low and high frame rates', () => {
  for (const dt of [1 / 60, 1 / 30, 1 / 15, 0.25]) {
    const r = new SleepReaction(); r.start(0, () => 1); let hits = 0;
    for (let t = 0; t < 4; t += dt) {
      const pose = r.sample(t);
      assert.ok(pose.lift >= 0 && pose.lift <= 1);
      if (pose.impact) { hits++; assert.equal(pose.lift, 0); assert.ok(pose.amount > 0.99); }
      assert.equal(r.sample(t).impact, false, 'only one effect per contact');
    }
    assert.ok(hits >= 5 && hits <= 6);
  }
});

function engine2d() {
  const e = new KuroCatEngine(makeCanvas()); e.setIdleAutoEnabled(false); return e;
}
function advancePet(e, seconds, dt = 1 / 60) {
  if (e instanceof KuroCatEngine3D) { tick(e, seconds, dt); return; }
  for (let left = seconds; left > 1e-8; left -= dt) {
    const step = Math.min(dt, left); e.update(step, performance.now() + step * 1000);
  }
}

test('both renderers wake angrily on keys, clicks and wheels, not ordinary cursor motion', () => {
  for (const create of [engine2d, engine3d]) {
    for (const input of ['key', 'mouse', 'wheel']) {
      const e = create(); e.triggerIdleAction('nap'); advancePet(e, 0.4);
      e.onGlobalMouseMove(0.25, 0.4); e.onWindowCursor(0.3, 0.4, false);
      assert.ok(e.asleep ?? e.idleAction?.kind === 'nap');
      assert.equal(e.sleepReaction.active(e.elapsed), false);
      if (input === 'key') { e.onKeyDown(65); e.onKeyUp(65); }
      else if (input === 'mouse') { e.onMouseDown('left'); e.onMouseUp('left'); }
      else e.onMouseWheel();
      assert.equal(e.sleepReaction.active(e.elapsed), true);
      const until = e.sleepReaction.until;
      assert.ok(until - e.elapsed >= 2 && until - e.elapsed <= 5);
      advancePet(e, 0.2); e.onKeyDown(66); e.onKeyUp(66); e.onMouseWheel();
      assert.equal(e.sleepReaction.until, until);
      advancePet(e, until - e.elapsed + 0.35);
      assert.equal(e.sleepReaction.visible(e.elapsed), false);
      assert.equal(e.isCross ?? e.annoyance > 0.26, false); e.stop();
    }
  }
});

test('petting soothes both renderers and prop actions wait for the tail to settle', () => {
  for (const create of [engine2d, engine3d]) {
    const e = create(); e.setPropConfig(propConfig());
    e.triggerIdleAction('nap'); advancePet(e, 0.3); e.onMouseWheel(); advancePet(e, 0.6);
    assert.equal(e.clickProp(), e instanceof KuroCatEngine3D ? 'busy' : 'ignored');
    e.onWindowCursor(0.4, 0.4, true);
    for (const x of [0.45, 0.5, 0.45, 0.4, 0.45, 0.5]) e.onWindowCursor(x, 0.4, true);
    assert.equal(e.sleepReaction.active(e.elapsed), false);
    assert.ok(e.soothedUntil > e.elapsed);
    advancePet(e, 0.35); assert.equal(e.groundTail.amount, 0);
    assert.equal(e.clickProp(), 'sipped'); e.stop();
  }
});

test('3D ground-tail contacts keep the root attached and leave the keyboard untouched', () => {
  const e = engine3d(); e.triggerIdleAction('tailGround');
  let hits = 0; const original = e.spawnFx.bind(e);
  e.spawnFx = (type, position, ...rest) => {
    if (type === 'bang') {
      const points = e.tailCurve.points; const tip = points.at(-1);
      near(tip.y, 0.048, 1e-5, 'tail floor contact'); near(position.x, tip.x);
      near(position.z, tip.z); hits++;
    }
    return original(type, position, ...rest);
  };
  for (let i = 0; i < 90; i++) {
    tick(e, 1 / 60);
    const root = e.tailCurve.points[0];
    assert.ok(root.distanceTo(e.homePos) < 1.5, 'root stays with the body');
    for (const p of e.tailCurve.points) assert.ok(p.y >= 0.04, 'tail does not pass through floor');
    assert.equal(e.tailTap.keyId, null);
    assert.equal(e.paws.L.keyId, null); assert.equal(e.paws.R.keyId, null);
  }
  assert.ok(hits >= 2); e.stop();
});

test('model changes, renderer stops and privacy clear tantrums; ordinary settings sync preserves them', () => {
  for (const create of [engine2d, engine3d]) {
    for (const operation of ['model', 'stop', 'privacy']) {
      const e = create(); const cat = DEFAULT_BUILTIN_CATS[0];
      const setSkin = skin => e instanceof KuroCatEngine3D ? e.setCatSkin(skin) : e.setCatAppearance(skin.id, skin);
      setSkin(cat); e.triggerIdleAction('tailGround'); advancePet(e, 0.6);
      const until = e.sleepReaction.until; setSkin(cat); assert.equal(e.sleepReaction.until, until);
      if (operation === 'model') setSkin({ ...cat, id: 'different-custom', builtin: false });
      else if (operation === 'stop') e.stop(); else e.setPrivacyMode(true);
      assert.equal(e.sleepReaction.visible(e.elapsed), false);
      assert.equal(e.groundTail.amount, 0);
      assert.equal(e.isCross ?? e.annoyance > 0, false);
      if (operation === 'privacy') {
        e.onKeyDown(65); e.onMouseWheel(); e.onWindowCursor(0.6, 0.4, true);
        assert.equal(e.sleepReaction.active(e.elapsed), false);
      }
      e.stop();
    }
  }
});

function examplePack() {
  return { format: 'kurocat-model', version: 1,
    profile: { adapters: ['canvas-cat-v1', 'three-cat-v1'], behaviorContract: 'cat-v1', author: '猫咪作者' },
    skin: { id: 'regression-cat', name: '测试猫咪', furColor: '#aabbcc', eyeColorTop: '#ffcc00' } };
}

test('model packages preserve Chinese text, round-trip builtins and expose renderer capabilities', () => {
  for (const cat of DEFAULT_BUILTIN_CATS.filter(c => c.id !== 'dafeiyu')) {
    const asset = cat.modelProfile?.glb
      ? { data: readFileSync(new URL('../art/naiwa/naiwa.glb', import.meta.url)).toString('base64') }
      : undefined;
    const pack = parseModelPack(JSON.stringify(exportModelPack(cat, asset)));
    assert.equal(pack.skin.name, cat.name); assert.equal(pack.skin.id, cat.id + '-custom');
    assert.deepEqual(modelModes(pack.skin), ['2d', '3d']);
    assert.ok(modelActions(pack.skin, '2d').includes('tailGround'));
    assert.ok(!modelActions(pack.skin, '2d').includes('roll'));
    assert.ok(modelActions(pack.skin, '3d').includes('roll'));
  }
  assert.throws(() => exportModelPack(DEFAULT_BUILTIN_CATS.find(c => c.id === 'dafeiyu')));
  const p = examplePack(); p.profile.adapters = ['three-cat-v1'];
  const parsed = parseModelPack(p);
  assert.equal(parsed.skin.name, '测试猫咪'); assert.equal(parsed.profile.author, '猫咪作者');
  assert.equal(modelMode(parsed.skin, '2d'), '3d');
  assert.deepEqual(modelActions(parsed.skin, '2d'), [], 'unsupported modes must not expose actions');
  assert.deepEqual(modelModes({ id: 'dafeiyu' }), ['2d']);
  p.skin.spots = [{ part: 'head', color: '#000000', x: 0, y: 1, rx: 4, ry: 5 }];
  const spot = parseModelPack(p).skin.spots[0]; assert.equal(spot.opacity, 1); assert.equal(spot.rotation, 0);
});

test('model package validation rejects invalid versions, adapters, colors, coordinates and reserved IDs', () => {
  const mutations = [
    p => p.version = 2, p => p.profile.behaviorContract = 'unknown',
    p => p.profile.adapters = [], p => p.profile.adapters = ['canvas-cat-v1', 'canvas-cat-v1'],
    p => p.profile.adapters = [['canvas-cat-v1']], p => p.profile.adapters = ['__proto__'],
    p => p.skin.id = 'black', p => p.skin.id = '../cat', p => p.skin.name = '坏\n名称',
    p => p.skin.furColor = 'url(script)', p => p.skin.furColor = 'rgb(256,0,0)',
    p => p.skin.eyeColorTop = 'rgba(0,0,0,2)', p => p.skin.tailFluffy = 'true',
    p => p.skin.pattern = 'script', p => p.skin.spots = Array(65).fill({}),
    p => p.skin.spots = [{ part: 'head', color: '#000000', x: 0, y: 0, rx: -1, ry: 1 }],
  ];
  for (const mutate of mutations) { const p = examplePack(); mutate(p); assert.throws(() => parseModelPack(p)); }
  assert.throws(() => parseModelPack(' '.repeat(MODEL_CONTRACT.maxBytes + 1)));
  const raw = examplePack(); raw.skin.script = 'alert(1)'; raw.skin.builtin = true;
  const safe = parseModelPack(raw); assert.equal(safe.skin.script, undefined); assert.equal(safe.skin.builtin, false);
});

test('GitHub catalog rejects duplicate packages, oversized files and untrusted URLs', async () => {
  const p = examplePack();
  assert.equal(parseModelCatalog(JSON.stringify({ format: 'kurocat-catalog', version: 1, models: [p] })).length, 1);
  assert.throws(() => parseModelCatalog(JSON.stringify({ format: 'kurocat-catalog', version: 1, models: [p, p] })));
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error('unexpected network'); };
  try {
    for (const url of ['http://raw.githubusercontent.com/a', 'https://github.com/a', 'https://raw.githubusercontent.com.evil.example/a', 'https://user@raw.githubusercontent.com/a', 'file:///cat.json']) await assert.rejects(fetchModelCatalog(url));
    assert.equal(calls, 0);
    const url = 'https://raw.githubusercontent.com/example/cats/main/catalog.json';
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
      return new Response(JSON.stringify({ format: 'kurocat-catalog', version: 1, models: [p] }));
    };
    assert.equal((await fetchModelCatalog(url))[0].skin.name, '测试猫咪');
    globalThis.fetch = async () => new Response(new Uint8Array([0xff]));
    await assert.rejects(fetchModelCatalog(url));
    globalThis.fetch = async () => new Response(' '.repeat(MODEL_CONTRACT.maxBytes + 1));
    await assert.rejects(fetchModelCatalog(url), /256 KB/);
  } finally { globalThis.fetch = originalFetch; }
});


test('the normal 2D render path draws tail impacts and one readable caption by priority', () => {
  const e = engine2d(); const ctx = makeContext(true); e.ctx = ctx;
  e.triggerIdleAction('tailGround'); advancePet(e, 0.42);
  e.drinkFeedback = { emoji: '☕', text: '精神回来啦！', t: 1, max: 2 };
  e.typingPose.amount = 0.8; e.typingReactions.kind = 'focus';
  const captions = () => ctx.calls.filter(c => c[0] === 'fillText').map(c => c[1]);
  const redraw = () => { ctx.calls.length = 0; e.render(); return captions(); };
  let words = redraw();
  assert.ok(words.includes('还没睡够呢！'));
  assert.ok(!words.includes('☕ 精神回来啦！') && !words.includes('认真陪你打字'));
  const hip = e.spinePoint(0.84, 0);
  assert.ok(ctx.calls.some(c => c[0] === 'ellipse' && Math.abs(c[1] - Math.min(e.logicalW - 24, hip.x + 137)) < 0.01 && c[2] === e.catBaseY + 4 && c[3] >= 9), 'ground impact must be painted by render');
  e.triggerIdleAction('calm'); words = redraw();
  assert.ok(words.includes('好啦，原谅你了'));
  assert.ok(!words.includes('☕ 精神回来啦！'));
  e.soothedUntil = -100; e.typingPose.amount = 0.8; e.typingReactions.kind = 'focus'; words = redraw();
  assert.ok(words.includes('☕ 精神回来啦！') && !words.includes('认真陪你打字'));
  e.drinkFeedback = null; words = redraw();
  assert.ok(words.includes('认真陪你打字'));
  e.setPrivacyMode(true); words = redraw();
  for (const text of ['还没睡够呢！', '好啦，原谅你了', '认真陪你打字']) assert.ok(!words.includes(text));
  e.stop();
});


test('every shipped catalog package matches its standalone file after normalization', () => {
  const catalog = parseModelCatalog(readFileSync(new URL('../model-store/catalog.json', import.meta.url), 'utf8'));
  const files = readdirSync(new URL('../model-store/', import.meta.url)).filter(name => name.endsWith('.kurocat.json'));
  const standalone = files.map(name => parseModelPack(readFileSync(new URL('../model-store/' + encodeURIComponent(name), import.meta.url), 'utf8')));
  assert.equal(catalog.length, standalone.length);
  for (const cat of standalone) {
    assert.deepEqual(catalog.find(p => p.skin.id === cat.skin.id), parseModelPack(exportModelPack(cat.skin, cat.asset)));
    if (cat.profile.adapters.includes('three-naiwa-v1')) {
      assert.deepEqual(modelActions(cat.skin, '3d'), MODEL_CONTRACT.adapters['three-naiwa-v1'].actions);
      for (const kind of ['tongueKey', 'sniff']) assert.ok(!MODEL_CONTRACT.adapters['three-cat-v1'].actions.includes(kind));
      continue;
    }
    if (cat.profile.glb) {
      const animated = Object.keys(cat.profile.glb.animations)
        .filter(k => !['idle', 'typing', 'mouse', 'angry', 'pet'].includes(k)).concat('calm');
      assert.deepEqual(modelActions(cat.skin, '3d'), animated);
      continue;
    }
    for (const mode of modelModes(cat.skin)) assert.ok(modelActions(cat.skin, mode).includes('tailGround'));
  }
});


test('pet gesture separates click from drag and cancels stale press ownership', () => {
  const g = new PetGesture();
  const first = g.down(-420, 300);
  assert.equal(g.move(-417, 302), null);
  assert.equal(g.release(), true, 'small hand jitter remains a click');
  assert.equal(g.owns(first), false);
  const dragged = g.down(-420, 300);
  assert.equal(g.move(-414, 300), dragged, 'threshold starts a drag exactly once');
  assert.equal(g.move(-400, 300), null);
  assert.equal(g.release(), false, 'dragging a prop never drinks it');
  const cancelled = g.down(10, 10); g.cancel();
  assert.equal(g.release(), false); assert.equal(g.move(30, 10), null);
  const next = g.down(20, 20);
  assert.equal(g.owns(cancelled), false, 'late IPC result cannot own the next press');
  assert.equal(g.owns(next), true); assert.equal(g.move(20, 27), next);
  const replacement = g.down(40, 40);
  assert.equal(g.owns(next), false); assert.equal(g.owns(replacement), true);
});

test('library snapshots never schedule animation loops and wait for sprite decoding', async () => {
  const oldRaf = globalThis.requestAnimationFrame;
  const oldTimer = window.setTimeout;
  const oldImage = globalThis.Image;
  let decodeCount = 0; let failDecode = false; let snapshots = 0;
  globalThis.Image = class {
    complete = true; naturalWidth = 224; naturalHeight = 278; width = 224; height = 278;
    async decode() { decodeCount++; if (failDecode) throw Error('image unavailable'); }
  };
  globalThis.requestAnimationFrame = () => { throw Error('preview started RAF'); };
  window.setTimeout = () => { throw Error('preview started a render timer'); };
  try {
    const canvas = makeCanvas(); canvas.toDataURL = () => { snapshots++; return 'data:image/png;base64,test'; };
    const flat = new KuroCatEngine(canvas, { embedded: true, previewOnly: true });
    const spatial = new KuroCatEngine3D(makeCanvas(), { embedded: true, previewOnly: true });
    const skin = DEFAULT_BUILTIN_CATS.find(c => c.id === 'black');
    flat.start(); spatial.start();
    assert.match(await flat.snapshot(skin), /^data:image[/]png/);
    assert.match(await spatial.snapshot(skin), /^data:image[/]png/);
    assert.equal(decodeCount, 0, 'procedural cats need no sprite wait');
    const whale = DEFAULT_BUILTIN_CATS.find(c => c.id === 'dafeiyu');
    failDecode = true;
    await assert.rejects(flat.snapshot(whale), /image unavailable/);
    assert.equal(snapshots, 1, 'failed sprites must not become cached images');
    failDecode = false;
    assert.match(await flat.snapshot(whale), /^data:image[/]png/);
    assert.equal(decodeCount, 8, 'all four sprites were retried');
  } finally {
    globalThis.requestAnimationFrame = oldRaf; window.setTimeout = oldTimer; globalThis.Image = oldImage;
  }
});

test('3D ears flick independently, track the cursor and stay attached during emotion changes', () => {
  for (const dt of [1 / 30, 1 / 60]) {
    const e = engine3d(); let independent = false;
    for (let time = 0; time < 8.6; time += dt) {
      const before = e.ears.map(ear => ear.group.rotation.clone()); tick(e, dt, dt);
      const normalized = e.ears.map(ear => -ear.s * ear.group.rotation.z - ear.tilt);
      if (Math.abs(normalized[0] - normalized[1]) > 0.05) independent = true;
      e.ears.forEach((ear, i) => {
        nearVector(ear.group.position, new Vector3(ear.s * 0.295, 0.255, -0.015));
        for (const axis of ['x', 'y', 'z']) {
          assert.ok(Number.isFinite(ear.group.rotation[axis]));
          assert.ok(Math.abs(ear.group.rotation[axis] - before[i][axis]) < 0.24, 'ear should turn without snapping');
        }
      });
    }
    assert.ok(independent, 'left and right ears should not always mirror');
    e.cursorNdc.set(1, 0); e.cursorActiveAt = e.elapsed; tick(e, 0.4, dt);
    assert.ok(e.ears.every(ear => ear.group.rotation.y > 0.16), 'ears turn toward cursor');
    e.triggerIdleAction('nap'); tick(e, 1.6, dt);
    assert.ok(e.ears.every(ear => ear.group.rotation.x > 0.06), 'ears droop while napping');
    const sleepingZ = e.ears.map(ear => Math.abs(ear.group.rotation.z));
    e.onKeyDown(65); e.onKeyUp(65); tick(e, 0.5, dt);
    assert.ok(e.ears.every((ear, i) => Math.abs(ear.group.rotation.z) > sleepingZ[i] + 0.1), 'annoyed ears spread');
    assert.ok(e.ears.every(ear => ear.group.rotation.x < -0.22), 'annoyed ears fold back');
    e.triggerIdleAction('calm'); tick(e, 1.2, dt);
    assert.ok(e.ears.every(ear => ear.group.rotation.x > -0.2), 'calming releases the backward fold');
  }
});

// Frog regressions run the actual renderer/controller with a lightweight Canvas host.
function frog2d() {
  const e = engine2d();
  const skin = DEFAULT_BUILTIN_CATS.find(c => c.id === 'builtin-naiwa');
  e.setCatAppearance(skin.id, skin); e.setTailKeyConfig('off', []);
  advancePet(e, 0.1); return e;
}
function nearPoint(a, b, epsilon = 0.001, label = '') {
  near(a.x, b.x, epsilon, label + ' x'); near(a.y, b.y, epsilon, label + ' y');
}

test('original Chinese frog package imports, while legacy milk-cat ID keeps the cat rig', () => {
  const original = parseModelPack(readFileSync(new URL('../tests/fixtures/naiwa.kurocat.json', import.meta.url), 'utf8'));
  assert.equal(original.skin.name, '奶蛙'); assert.equal(modelRig(original.skin), 'naiwa');
  assert.deepEqual(modelModes(original.skin), ['2d']);
  assert.equal(modelActionLabel(original.skin, 'tailGround'), '跺脚抗议');
  assert.deepEqual(parseModelPack(exportModelPack(original.skin)), original);
  const milk = DEFAULT_BUILTIN_CATS.find(c => c.id === 'builtin-milk-cat');
  assert.equal(modelRig(milk), 'cat');
  assert.equal(modelRig({ ...milk, id: 'naiwa', modelProfile: undefined }), 'cat');
  assert.equal(new Set(DEFAULT_BUILTIN_CATS.map(c => c.id)).size, DEFAULT_BUILTIN_CATS.length);
  for (const adapters of [['canvas-naiwa-v1', 'canvas-cat-v1'], ['canvas-naiwa-v2']]) {
    assert.throws(() => parseModelPack({ ...exportModelPack(original.skin), profile: { ...original.profile, adapters } }));
  }
  for (const kind of FROG_ACTIONS) assert.ok(modelActions(original.skin, '2d').includes(kind));
  assert.deepEqual(modelActions(original.skin, '3d'), []);
  assert.equal(MODEL_CONTRACT.rigs.naiwa.future3d.status, 'builtin-and-glb-import-supported');
});

test('frog pose is bounded and deterministic, folded feet sway and grooming exchanges hands smoothly', () => {
  const base = { kind: null, progress: 0, seconds: 0, anger: 0, petting: 0, typing: 0,
    groove: 0, excitement: 0, stomp: 0, stompLift: 0, drinking: false, privacy: false };
  const allNumbers = obj => Object.values(obj).flatMap(v => typeof v === 'object' ? allNumbers(v) : [v]);
  for (const kind of [...FROG_ACTIONS, 'groom', 'wave', 'stretch', 'nap', 'cuddle']) {
    for (let i = 0; i <= 100; i++) {
      const input = { ...base, kind, progress: i / 100, seconds: i / 25 };
      const pose = sampleNaiwaPose(input);
      assert.deepEqual(sampleNaiwaPose(input), pose);
      assert.ok(allNumbers(pose).every(n => Number.isFinite(n) && Math.abs(n) < 1.2));
    }
  }
  const a = sampleNaiwaPose(base), b = sampleNaiwaPose({ ...base, seconds: 0.8 });
  assert.deepEqual(a.hands, b.hands); assert.notDeepEqual(a.feet, b.feet);
  const before = sampleNaiwaPose({ ...base, kind: 'groom', progress: 0.499 });
  const after = sampleNaiwaPose({ ...base, kind: 'groom', progress: 0.501 });
  for (const side of ['left', 'right']) nearPoint(before.hands[side], after.hands[side], 0.008);
  assert.equal(sampleNaiwaPose({ ...base, privacy: true }).lids, 1);
  assert.equal(sampleNaiwaPose({ ...base, kind: 'frogHop', progress: 0.5, drinking: true }).lift, 0);
});

test('seated frog uses hands for ordinary keys, space and mouse in both keyboard layouts', () => {
  for (const layout of ['65', '108']) for (const facing of ['cat', 'viewer']) for (const propSide of ['left', 'right']) {
    const e = frog2d(); e.setKeyboardConfig(layout, facing); e.setPropConfig(propConfig('coffee', propSide));
    for (const vk of [65, 32]) {
      e.onKeyDown(vk, false); advancePet(e, 0.12);
      const active = [e.leftPaw, e.rightPaw].filter(p => p.mode === 'poke');
      assert.ok(active.length, 'normal key must activate a hand');
      const l = e.buildNaiwaLayout();
      for (const paw of active) nearPoint(e.naiwa.getHandWorld(paw.side, l), paw.pos);
      assert.equal(l.footKey.reach, 0, 'normal keys cannot drive feet'); e.onKeyUp(vk);
    }
    e.onMouseDown('left'); advancePet(e, 0.15);
    const l = e.buildNaiwaLayout();
    nearPoint(e.naiwa.getHandWorld(e.mousePaw.side, l), e.mousePaw.pos);
    assert.equal(l.footKey.reach, 0);
    e.onKeyDown(66, false); assert.equal(e.freePaw.mode, 'poke', 'typing while clicking uses the free hand');
    e.onKeyUp(66); e.onMouseUp('left'); e.render(); e.stop();
  }
});

test('frog feet only handle configured tail keys, transition across sides and release without drift', t => {
  let clock = 1000;
  t.mock.method(performance, 'now', () => clock);
  // The tail uses milliseconds for its impact arc. Advancing dt without the
  // clock leaves the foot stuck in the first 75 ms and makes this check flaky.
  const advance = (e, seconds) => {
    for (let left = seconds; left > 1e-8; left -= 1 / 60) {
      const dt = Math.min(left, 1 / 60); clock += dt * 1000; e.update(dt, clock);
    }
  };
  const e = frog2d(); e.setTailKeyConfig('custom', ['a', 'l']);
  e.onKeyDown(65, false); advance(e, 0.4);
  assert.equal(e.catTail.active, true); assert.equal(e.heldKeys.has(65), false);
  let l = e.buildNaiwaLayout();
  nearPoint(e.naiwa.getFootWorld(l.footKey.side, l), l.footKey, 0.06);
  const previous = Object.fromEntries(['left', 'right'].map(s => [s, e.naiwa.getFootWorld(s, l)]));
  e.onKeyUp(65); e.onKeyDown(76, false); advance(e, 1 / 60); l = e.buildNaiwaLayout();
  for (const side of ['left', 'right']) {
    const point = e.naiwa.getFootWorld(side, l);
    assert.ok(Math.hypot(point.x - previous[side].x, point.y - previous[side].y) < l.bodyHeight * 0.20, 'side change must interpolate');
  }
  e.onKeyUp(76); e.setTailKeyConfig('off', []); advance(e, 2);
  l = e.buildNaiwaLayout();
  for (const side of ['left', 'right']) {
    const p = e.naiwa.getFootWorld(side, l);
    assert.ok(Math.abs(p.x - l.centerX) < l.bodyHeight * 0.40);
    assert.ok(Math.abs(p.y - l.baseY) < l.bodyHeight * 0.065);
  }
  e.setTailKeyConfig('custom', ['a']); e.onKeyDown(65, false); advance(e, 0.3);
  const milk = DEFAULT_BUILTIN_CATS.find(c => c.id === 'builtin-milk-cat'); e.setCatAppearance(milk.id, milk);
  assert.equal(e.catTail.reach, 0); assert.equal(e.catTail.active, false); e.stop();
});

test('all frog drinks keep drawn mouth contact and holding hand aligned on either side', () => {
  for (const kind of ['cola', 'coffee', 'boba', 'energy', 'pudding']) for (const side of ['left', 'right']) {
    const e = frog2d(); e.setPropConfig(propConfig(kind, side));
    assert.equal(e.clickProp(), 'sipped');
    let samples = 0;
    for (let i = 0; i < 240; i++) {
      advancePet(e, 1 / 60);
      const l = e.buildNaiwaLayout();
      if (e.drinker.phase !== 'rest') nearPoint(e.naiwa.getHandWorld(side, l), { x: e.propPose.handX, y: e.propPose.handY });
      if (e.drinker.phase !== 'sip') continue;
      samples++; const p = e.propPose, local = propMouthContact(kind), mouth = e.naiwa.getMouthWorld(l);
      const tip = { x: p.x + Math.cos(p.rot) * local.x - Math.sin(p.rot) * local.y,
        y: p.y + Math.sin(p.rot) * local.x + Math.cos(p.rot) * local.y };
      const target = { x: mouth.x + (side === 'left' ? -2 : 2), y: mouth.y + 2 };
      nearPoint(tip, target, kind === 'pudding' ? 2.5 : 0.7, kind + ' mouth');
      if (kind === 'boba') assert.ok(Math.abs(p.rot) < 0.21, 'straw stays upright');
      const grip = { x: p.x + Math.sin(p.rot) * propLook(kind).height * 0.45,
        y: p.y - Math.cos(p.rot) * propLook(kind).height * 0.45 };
      nearPoint(e.naiwa.getHandWorld(side, l), grip, 2.5, kind + ' grip');
    }
    assert.ok(samples > 10); e.render(); e.stop();
  }
});

test('frog wake tantrum uses feet, can be soothed, and frog-only actions are filtered', () => {
  const e = frog2d(); e.triggerIdleAction('nap'); advancePet(e, 0.4);
  e.onMouseWheel(); advancePet(e, 0.35);
  assert.equal(e.sleepReaction.active(e.elapsed), true); assert.ok(e.groundTail.amount > 0);
  assert.equal(e.catTail.active, false); e.render();
  e.triggerIdleAction('calm'); advancePet(e, 0.4); assert.equal(e.groundTail.amount, 0);
  for (const kind of FROG_ACTIONS) {
    assert.equal(e.triggerIdleAction(kind), true); advancePet(e, 0.25); e.render();
    advancePet(e, e.idleAction.duration + 0.1);
  }
  e.setPrivacyMode(true); assert.equal(e.triggerIdleAction('frogHop'), false); e.stop();
  const cat = engine2d(); assert.equal(cat.triggerIdleAction('frogHop'), false); cat.stop();
});

test('frog interactions stay silent while the shared pet audio switch is enabled', () => {
  const ctx = audioContext(), savedContext = catAudio.ctx, savedPurr = catAudio.setPurrIntensity;
  const requested = [];
  catAudio.ctx = ctx;
  catAudio.setPurrIntensity = intensity => { requested.push(intensity); };
  const e = frog2d();
  try {
    assert.deepEqual(MODEL_CONTRACT.rigs.naiwa.sounds, []);
    for (const kind of FROG_ACTIONS) {
      assert.equal(e.triggerIdleAction(kind), true);
      advancePet(e, e.idleAction.duration + .2);
    }
    e.triggerIdleAction('nap'); advancePet(e, .5); e.onMouseWheel(); advancePet(e, .5);
    assert.ok(e.sleepReaction.active(e.elapsed));
    e.onWindowCursor(.4, .4, true);
    for (const x of [.45, .5, .45, .4, .45, .5]) e.onWindowCursor(x, .4, true);
    advancePet(e, .4);
    assert.equal(e.sleepReaction.active(e.elapsed), false, 'petting still soothes the silent frog');
    for (const kind of ['coffee', 'boba', 'cola', 'energy', 'pudding']) {
      e.stopCurrentAction(); e.setPropConfig(propConfig(kind, 'right'));
      assert.equal(e.clickProp(), 'sipped'); advancePet(e, 10);
    }
    assert.ok(requested.length > 0, 'exercise live audio path, not preview-only rendering');
    assert.ok(requested.every(value => value === 0), 'frog never requests a cat purr');
    assert.equal(ctx.sources.length, 0, 'no dedicated frog audio sources');
  } finally {
    e.stop(); catAudio.setPurrIntensity = savedPurr; catAudio.ctx = savedContext;
  }
});

test('fluid arms deform in both directions, taper under extension and keep palm contact', () => {
  const root = { x: .24, y: -.43 }, target = { x: .28, y: .075 };
  const resting = deformNaiwaArm(root, target, 0, { x: 0, y: 0 });
  const left = deformNaiwaArm(root, target, 0, { x: -.09, y: 0 });
  const right = deformNaiwaArm(root, target, 0, { x: .09, y: 0 });
  assert.ok(left.joint.x < resting.joint.x - .02);
  assert.ok(right.joint.x > resting.joint.x + .02, 'bend must not be locked to one elbow side');
  for (const curve of [resting, left, right]) nearPoint(curve.end, target);
  const stretched = deformNaiwaArm(root, { x: -.65, y: -.20 }, .12, { x: 0, y: 0 });
  assert.ok(stretched.points[16].radius < resting.points[16].radius, 'extension narrows the skin');
  for (const target of [{ x: .24, y: -.43 }, { x: .18, y: -.31 }, { x: .06, y: -.65 }, { x: .23, y: -.88 }, { x: 8, y: 4 }]) {
    const arm = deformNaiwaArm(root, target, -.9, { x: 2, y: -4 });
    for (const p of arm.points) assert.ok(Number.isFinite(p.x + p.y + p.radius) && p.radius > 0);
    assert.ok(Math.hypot(arm.end.x - root.x, arm.end.y - root.y) <= 1.120001);
    if (arm.reachable) nearPoint(arm.end, target);
  }
});

test('mouse palms follow the approach and fingers remain joined to the liquid arm', () => {
  for (const sign of [-1, 1]) {
    const root = { x: sign * .24, y: -.43 }, target = { x: sign * .60, y: .08 };
    const angle = Math.atan2(target.y - root.y, target.x - root.x) - Math.PI / 2;
    for (const pose of [{}, { press: 1 }, { grip: 1 }]) {
      const arm = deformNaiwaArm(root, target, angle, { x: 0, y: 0 }, pose);
      const last = arm.points.at(-1), before = arm.points.at(-2);
      nearPoint(last, arm.palm); nearPoint(arm.fingers[1].at(-1), target);
      const tangent = { x: last.x - before.x, y: last.y - before.y };
      const cosine = (tangent.x * arm.direction.x + tangent.y * arm.direction.y) / Math.hypot(tangent.x, tangent.y);
      assert.ok(cosine > .99, 'no corner between forearm and palm');
      for (const finger of arm.fingers) {
        assert.ok(Math.hypot(finger[0].x - last.x, finger[0].y - last.y) < last.radius, 'finger roots overlap palm');
        for (let i = 1; i < finger.length; i++) assert.ok(Math.hypot(finger[i].x - finger[i-1].x, finger[i].y - finger[i-1].y) < finger[i].radius + finger[i-1].radius);
      }
      let projection = -Infinity;
      for (const point of arm.points) {
        const next = (point.x - root.x) * arm.direction.x + (point.y - root.y) * arm.direction.y;
        assert.ok(next >= projection, 'resting mouse reach has no backward hook'); projection = next;
      }
    }
  }
});

test('fluid arm inertia settles without moving its hand contact and gestures remain interruptible', () => {
  for (const dt of [1 / 30, 1 / 60]) {
    const e = frog2d(); e.triggerIdleAction('wave'); advancePet(e, .5, dt);
    e.onKeyDown(65, false); advancePet(e, .12, dt);
    assert.equal(e.idleActionKind, null);
    const l = e.buildNaiwaLayout(), side = [e.leftPaw, e.rightPaw].find(p => p.mode === 'poke').side;
    const initial = e.naiwa.getHandWorld(side, l);
    let previous = e.naiwa.getArmSurfaceWorld(side, l);
    for (let i = 0; i < 1 / dt; i++) {
      e.naiwa.update(dt, 1000 + i * dt * 1000, l);
      const surface = e.naiwa.getArmSurfaceWorld(side, l);
      assert.ok(surface.every((p, j) => Math.hypot(p.x - previous[j].x, p.y - previous[j].y) < l.bodyHeight * .06));
      nearPoint(e.naiwa.getHandWorld(side, l), initial);
      previous = surface;
    }
    const lag = e.naiwa.arms[side].lag;
    assert.ok(Math.hypot(lag.x, lag.y) < .0001, 'middle settles instead of oscillating forever');
    e.onKeyUp(65); e.stop();
  }
});

test('mouth-local cheeks inflate and deflate without shifting eyes or the mouth contact', () => {
  for (const dt of [1 / 30, 1 / 60]) {
    const e = frog2d(); const l = e.buildNaiwaLayout();
    const mouth = e.naiwa.getMouthWorld(l);
    l.anger = 1;
    e.naiwa.update(dt, 1000, l);
    const early = e.naiwa.expression.cheeks;
    assert.ok(early > 0 && early < .4, 'no instant pop to fully inflated');
    for (let i = 0; i < .5 / dt; i++) e.naiwa.update(dt, 1000 + i * dt * 1000, l);
    const full = e.naiwa.expression.cheeks;
    assert.ok(full > .85 && e.naiwa.lids > .4 && e.naiwa.lids < .6, 'slanted lids leave an angry gaze visible');
    const volumes = naiwaCheekVolumes(full), relaxed = naiwaCheekVolumes(0);
    assert.equal(volumes.length, 2); assert.equal(volumes[0].x, -volumes[1].x);
    for (let i = 0; i < volumes.length; i++) {
      const v = volumes[i];
      assert.ok(v.rx > relaxed[i].rx && v.ry > relaxed[i].ry);
      assert.ok(Math.abs(v.x) - v.rx > .04, 'separate cheeks beside the mouth');
      assert.ok(Math.abs(v.x) + v.rx < .19 && v.y - v.ry > -.01, 'below eyes, within the original face');
    }
    nearPoint(e.naiwa.getMouthWorld(l), mouth);
    l.anger = 0; e.naiwa.update(dt, 1700, l);
    assert.ok(e.naiwa.expression.cheeks > .6 && e.naiwa.expression.cheeks < full);
    for (let i = 0; i < 1.3 / dt; i++) e.naiwa.update(dt, 1700 + i * dt * 1000, l);
    assert.ok(e.naiwa.expression.cheeks < .001);
    l.anger = 1; e.naiwa.update(.1, 3100, l); e.setPrivacyMode(true);
    assert.equal(e.naiwa.expression.cheeks, 0);
    e.naiwa.resetContacts(); assert.equal(e.naiwa.expression.anger, 0); e.stop();
  }
});

test('frog sleeps seated with drool and smoothly wakes from natural, stopped and interrupted naps', () => {
  for (const dt of [1/30, 1/60]) for (const wake of ['natural', 'key', 'mouse', 'wheel', 'stop', 'drink']) {
    const e = frog2d(); e.setPropConfig(propConfig('coffee', 'right'));
    const standing = e.naiwa.getMouthWorld(e.buildNaiwaLayout());
    e.triggerIdleAction('nap'); e.idleAction.duration = 12; let previous = standing;
    const step = seconds => {
      for (let t = 0; t < seconds - 1e-8; t += dt) {
        advancePet(e, dt, dt);
        const l = e.buildNaiwaLayout(), mouth = e.naiwa.getMouthWorld(l);
        assert.ok(Math.hypot(mouth.x - previous.x, mouth.y - previous.y) < l.bodyHeight * .17, wake + ': no head teleport');
        for (const side of ['left','right']) {
          const arm = e.naiwa.getLimbWorld(side, 'arm', l);
          assert.ok(arm.reachable && Number.isFinite(arm.end.x + arm.end.y), wake + ': reachable hand');
        }
        previous = mouth;
      }
    };
    step(4.5);
    const l = e.buildNaiwaLayout(), asleep = e.naiwa.getMouthWorld(l);
    assert.ok(Math.abs(asleep.y - standing.y) < l.bodyHeight * .09, 'head remains above the seated belly');
    assert.ok(asleep.y < l.baseY - l.bodyHeight * .50);
    assert.ok(e.naiwa.pose.drool > .9, 'drool grows after settling');
    assert.ok(e.naiwa.pose.sleep > .99 && e.naiwa.lids > .97);
    for (const side of ['left','right']) {
      const hand = e.naiwa.getHandWorld(side, l);
      assert.ok(Math.abs(hand.y - l.baseY) < l.bodyHeight * .12, 'hands rest without reaching across the belly');
      const foot = e.naiwa.getFootWorld(side, l);
      assert.ok(Math.abs(foot.y - l.baseY) < l.bodyHeight * .07, 'feet remain planted');
    }
    if (wake === 'key') e.onKeyDown(65, false);
    if (wake === 'mouse') e.onMouseDown('left');
    if (wake === 'wheel') e.onMouseWheel();
    if (wake === 'stop') e.stopCurrentAction();
    if (wake === 'drink') e.clickProp();
    step(wake === 'natural' ? 15 : 1.5);
    assert.ok(e.naiwa.pose.sleep < .01, wake + ': returns to awake pose');
    assert.ok(e.naiwa.pose.drool < .01, wake + ': saliva retracts on waking');
    e.onKeyUp(65); e.onMouseUp('left'); e.stop();
  }
});

test('frog drool clears immediately on privacy and contact reset', () => {
  for (const mode of ['privacy', 'reset']) {
    const e = frog2d(); e.triggerIdleAction('nap'); e.idleAction.duration = 12; advancePet(e, 4.5);
    assert.ok(e.naiwa.pose.drool > .9);
    if (mode === 'privacy') e.setPrivacyMode(true); else e.naiwa.resetContacts();
    assert.equal(e.naiwa.pose.drool, 0);
    assert.equal(e.naiwa.poseBlend.drool, 0);
    e.stop();
  }
});

test('manual action stop works repeatedly with auto-idle disabled, including drinks and tantrums', () => {
  const e = frog2d();
  e.setPropConfig(propConfig('coffee', 'right'));
  for (const kind of ['wave', 'frogHop', 'drink', 'tailGround', 'wave']) {
    assert.equal(e.triggerIdleAction(kind), true, kind); advancePet(e, .3);
    e.stopCurrentAction();
    assert.equal(e.idleActionKind, null); assert.equal(e.drinker.drinking, false);
    assert.equal(e.sleepReaction.visible(e.elapsed), false); assert.equal(e.groundTail.amount, 0);
    advancePet(e, .4); assert.equal(e.idleActionKind, null);
  }
  e.stop();
});

test('frog artwork keeps the head intact, blends opaque sleep poses and caches recoloring', async () => {
  const e = frog2d(); e.render();
  const images = fakeImages.filter(img => img.src?.includes('/naiwa/'));
  assert.equal(images.length, 5);
  const originalCreate = document.createElement;
  let fail = true, decodes = 0, rasterizations = 0, written;
  try {
    for (const img of images) {
      const png = readFileSync(fileURLToPath(img.src));
      img.complete = true; img.naturalWidth = png.readUInt32BE(16); img.naturalHeight = png.readUInt32BE(20);
      img.decode = async () => { decodes++; if (fail) throw Error('failed Naiwa artwork'); };
    }
    await assert.rejects(readyNaiwaArtwork(), /failed Naiwa artwork/);
    fail = false; await readyNaiwaArtwork(); assert.equal(decodes, 10);
    const body = images.find(img => img.src.endsWith('/body.png'));
    assert.equal(naiwaArtwork('body', e.naiwa.colors), body, 'original palette uses original pixels');
    const recorded = makeContext(true); e.naiwa.expression.cheeks = .95;
    e.naiwa.drawBodyArtwork(recorded);
    const draws = recorded.calls.filter(call => call[0] === 'drawImage');
    assert.deepEqual(draws, [['drawImage', body, -.39, -.82, .78, .86]], 'anger never stretches or slices the head');
    const prone = images.find(img => img.src.endsWith('/prone.png'));
    assert.equal(naiwaSleepArtwork(e.naiwa.colors, 0), body);
    assert.equal(naiwaSleepArtwork(e.naiwa.colors, 1), prone);
    const composite = [];
    document.createElement = () => ({ width: 0, height: 0, getContext: () => ({
      clearRect() {}, globalAlpha: 1, globalCompositeOperation: 'source-over',
      drawImage(image) { composite.push({ image, alpha: this.globalAlpha, mode: this.globalCompositeOperation }); },
    }) });
    const mixed = naiwaSleepArtwork(e.naiwa.colors, .5);
    assert.equal(mixed.width, 230); assert.equal(mixed.height, 310);
    assert.deepEqual(composite, [{ image: body, alpha: .5, mode: 'source-over' }, { image: prone, alpha: .5, mode: 'lighter' }]);
    assert.equal(naiwaSleepArtwork(e.naiwa.colors, .7), mixed, 'reuse one small surface while sleeping');
    document.createElement = () => {
      rasterizations++; const canvas = makeCanvas(), ctx = makeContext();
      ctx.getImageData = () => ({ data: new Uint8ClampedArray([104, 99, 68, 200]), width: 1, height: 1 });
      ctx.putImageData = data => { written = data.data; }; canvas.getContext = () => ctx; return canvas;
    };
    const palette = { ...e.naiwa.colors, paw: [154, 99, 68] };
    const recolored = naiwaArtwork('hand', palette);
    assert.ok(written[0] > 104); assert.equal(written[1], 99); assert.equal(written[3], 200, 'preserve shading alpha');
    assert.equal(naiwaArtwork('hand', palette), recolored); assert.equal(rasterizations, 1);
    for (let i = 0; i < 14; i++) naiwaArtwork('hand', { ...palette, paw: [160 + i, 99, 68] });
    assert.notEqual(naiwaArtwork('hand', palette), recolored, 'old palettes are evicted');
  } finally {
    document.createElement = originalCreate;
    for (const img of images) { img.complete = false; img.naturalWidth = 0; img.naturalHeight = 0; }
    e.stop();
  }
});


test('frog micro-actions shift weight in sequence and settle smoothly at both ends', () => {
  const base = { kind: null, progress: 0, seconds: 0, anger: 0, petting: 0, typing: 0,
    groove: 0, excitement: 0, stomp: 0, stompLift: 0, drinking: false, privacy: false };
  const flatten = obj => Object.values(obj).flatMap(v => typeof v === 'object' ? flatten(v) : [v]);
  const sample = (kind, t, extra = {}) => sampleNaiwaPose({ ...base, kind, progress: t, seconds: t * 5, ...extra });
  for (const kind of ['frogSway', 'frogPeek', 'footSwing']) {
    for (const t of [0, 1]) {
      const rest = flatten(sample(null, t));
      flatten(sample(kind, t)).forEach((v, i) => near(v, rest[i], 1e-8, kind + ' returns to rest'));
    }
    let previous = flatten(sample(kind, 0));
    for (let i = 1; i <= 200; i++) {
      const current = flatten(sample(kind, i / 200));
      assert.ok(current.every((v, j) => Math.abs(v - previous[j]) < .08), kind + ' no pose discontinuity');
      previous = current;
    }
    for (const extra of [{ drinking: true }, { privacy: true }]) {
      const pose = sample(kind, .4, extra);
      assert.equal(pose.lean, 0); assert.equal(pose.gaze, 0);
      assert.deepEqual(pose.hands, sample(null, .4, extra).hands);
    }
  }
  assert.ok(sample('frogSway', .25).lean > .08);
  near(sample('frogSway', .5).lean, 0, 1e-8, 'crosses centre');
  assert.ok(sample('frogSway', .75).lean < -.08);
  const first = sample('footSwing', .125), second = sample('footSwing', .375);
  assert.ok(first.feet.left.y < first.feet.right.y && second.feet.right.y < second.feet.left.y);
});

test('new frog micro-actions yield to keyboard and mouse input without a pose snap', () => {
  for (const dt of [1 / 30, 1 / 60]) for (const kind of ['frogSway', 'frogPeek', 'footSwing']) {
    for (const input of ['key', 'mouse']) {
      const e = frog2d(); assert.equal(e.triggerIdleAction(kind), true); advancePet(e, 1.2, dt);
      let previous = e.naiwa.getMouthWorld(e.buildNaiwaLayout());
      if (input === 'key') e.onKeyDown(65, false); else e.onMouseDown('left');
      assert.equal(e.idleActionKind, null);
      for (let t = 0; t < 1.2; t += dt) {
        advancePet(e, dt, dt);
        const l = e.buildNaiwaLayout(), mouth = e.naiwa.getMouthWorld(l);
        assert.ok(Math.hypot(mouth.x - previous.x, mouth.y - previous.y) < l.bodyHeight * .06);
        for (const side of ['left', 'right']) assert.ok(e.naiwa.getLimbWorld(side, 'arm', l).reachable);
        previous = mouth;
      }
      e.onKeyUp(65); e.onMouseUp('left'); e.stop();
    }
  }
});


test('frog closed eyelids never leave a second iris sliver beneath the sleeping crease', () => {
  const e = frog2d();
  const l = e.buildNaiwaLayout();
  e.naiwa.blink = 0;
  for (const lid of [0, .48, .7, .78, .85, .93, .96, 1]) {
    e.naiwa.lids = lid;
    const ctx = makeContext(true); ctx.globalAlpha = 1;
    e.naiwa.drawEye(ctx, 0, 0, -1, l);
    const fills = ctx.calls.filter(([op]) => op === 'fill').length;
    if (lid > .005) assert.equal(ctx.calls.filter(([op]) => op === 'stroke').length, 1, 'closing uses one continuous lid, never two separate creases');
    if (lid < .94) assert.ok(fills > 0, 'open and partly closed eyes retain a clipped iris');
    else {
      assert.equal(fills, 0, 'sleeping eyes have no iris below the closed arc');
      assert.equal(ctx.calls.filter(([op]) => op === 'stroke').length, 1);
    }
  }
  e.stop();
});


test('live Naiwa shares normal desks, real prop contacts, gaze and interruptible actions', async (t) => {
  const { Texture, Box3 } = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { GlbActor } = await import('../src/glbActor.ts');
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'TEST_TEXTURES', loadTexture: () => Promise.resolve(new Texture()) }));
  const bytes = readFileSync(new URL('../art/naiwa/naiwa.glb', import.meta.url));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const pack = parseModelPack(JSON.parse(readFileSync(new URL('../model-store/naiwa-3d.kurocat.json', import.meta.url), 'utf8')));
  const actor = GlbActor.fromScene(gltf.scene, gltf.animations, pack.profile.glb, true);
  // Replace only native file/texture IO; use the real imported scene and engine lifecycle.
  t.mock.method(GlbActor, 'load', async () => actor);
  const e = engine3d(), desk = e.desk;
  t.after(() => { e.stop(); actor.dispose(); });
  const boardPosition = desk.boardGroup.position.clone();
  e.setCatSkin(pack.skin); await e.glbReady; e.setTailKeyConfig('off', []);
  assert.equal(e.rollRoot.visible, false);
  assert.equal(actor.supportsContacts, true);
  near(new Box3().setFromObject(actor.root).getSize(new Vector3()).y, 2.3, 1e-6, 'seated import height');
  const scale = actor.root.scale.clone(), origin = actor.root.position.clone();
  const world = name => gltf.scene.getObjectByName(name).getWorldPosition(new Vector3());
  const contacts = () => {
    nearVector(world('gripRight'), e.paws.L.pos.clone().applyMatrix4(actor.motionRoot.matrixWorld), 1e-5, 'left visible hand');
    nearVector(world('gripLeft'), e.paws.R.pos.clone().applyMatrix4(actor.motionRoot.matrixWorld), 1e-5, 'right visible hand');
  };
  const step = seconds => { tick(e, seconds, 1 / 30); contacts(); };
  const clearance = (await import('./lib/naiwa-clearance.mjs')).createArmClearanceCheck(gltf.scene.getObjectByName('Naiwa_Surface'));
  const clearArms = label => { const result = clearance(); assert.equal(result.buried, 0, label + ': ' + JSON.stringify(result)); };
  // Opt-in offline visual review: only writes ignored cache files, never source assets.
  const review = process.env.NAIWA_REVIEW === '1'
    ? (await import('./lib/naiwa-review.mjs')).createNaiwaReview(bytes) : null;
  const snapshot = name => review?.(name, e.scene, e.camera);
  const morph = name => {
    let value = 0;
    gltf.scene.traverse(m => { const i = m.morphTargetDictionary?.[name]; if (i !== undefined) value = Math.max(value, m.morphTargetInfluences[i]); });
    return value;
  };
  for (const layout of ['65', '108']) {
    e.setKeyboardConfig(layout, 'cat'); step(.15);
    nearVector(desk.deskGroup.scale, new Vector3(1, 1, 1));
    nearVector(desk.boardGroup.position, boardPosition);
    for (const vk of [65, 74, 32]) {
      e.onKeyDown(vk); step(.15);
      const paw = Object.values(e.paws).find(p => p.keyId && p.down);
      assert.ok(paw, 'input owns a hand');
      assert.ok(paw.pos.distanceTo(desk.keyTopWorld(paw.keyId)) < .16, 'hand reaches actual key');
      e.onKeyUp(vk); step(.55);
    }
    for (const facing of ['cat', 'viewer']) {
      e.setMouseOrientation(facing); e.onGlobalMouseMove(.1, .2); e.onMouseDown('left'); step(.6);
      const first = world('gripRight');
      e.onGlobalMouseMove(.9, .8); step(.6);
      assert.ok(first.distanceTo(world('gripRight')) > .03, 'hand follows moving mouse');
      e.onMouseUp('left');
    }
    nearVector(actor.root.scale, scale); nearVector(actor.root.position, origin);
  }
  e.releaseInputs(); step(1); snapshot('scene-desk');
  e.onWindowCursor(.95, .15, false); step(.6);
  assert.ok(e.headRot.yaw > .12, 'head turns toward cursor');
  const pupil = gltf.scene.getObjectByName('PupilL');
  const rightPupil = Array.from(pupil.geometry.attributes.position.array);
  e.onWindowCursor(.05, .85, false); step(.6);
  assert.ok(e.headRot.yaw < -.12, 'head reverses smoothly');
  assert.notDeepEqual(Array.from(pupil.geometry.attributes.position.array), rightPupil, 'pupils look independently of head');
  assert.equal(morph('CheekPuff.L'), 0, 'ordinary interaction never puffs cheeks');
  snapshot('scene-gaze');
  for (const [i, kind] of ['coffee', 'boba', 'cola', 'energy', 'pudding'].entries()) {
    const side = i % 2 ? 'left' : 'right';
    e.setPropConfig(propConfig(kind, side));
    assert.ok(e.getHitRegions().prop, 'live imported model exposes prop hit area');
    assert.equal(e.clickProp(), 'sipped'); step(.9);
    assert.equal(e.propPhase, 'sip');
    const h = e.propHandle, hand = side === 'left' ? 'gripRight' : 'gripLeft';
    nearVector(h.mouthAnchor.clone().applyMatrix4(h.group.matrixWorld), world('mouth'), 1e-5, kind + ' mouth');
    nearVector(h.gripAnchor.clone().applyMatrix4(h.group.matrixWorld), world(hand), 1e-5, kind + ' held cup');
    // Correct contact points alone previously hid the whole wrist inside the belly.
    // Ray-test against actual torso faces, excluding the arm's own skinned surface.
    const surface = gltf.scene.getObjectByName('Naiwa_Surface');
    surface.computeBoundingBox(); surface.computeBoundingSphere();
    const indices = surface.geometry.attributes.skinIndex, weights = surface.geometry.attributes.skinWeight;
    const torsoVertex = index => ['getX','getY','getZ','getW'].every(get =>
      weights[get](index) < .01 || !/^(arm|hand|finger|thumb|clavicle)/.test(surface.skeleton.bones[indices[get](index)].name));
    for (const name of [hand, side === 'left' ? 'handR' : 'handL']) {
      const point = world(name), ray = new Raycaster(point.clone().add(new Vector3(0,0,3)), new Vector3(0,0,-1));
      const torso = ray.intersectObject(surface, false).filter(hit => hit.face && [hit.face.a,hit.face.b,hit.face.c].every(torsoVertex));
      if (torso.length) assert.ok(point.z > Math.max(...torso.map(hit => hit.point.z)) + .015, kind + ' wrist clears torso');
    }
    snapshot('scene-' + kind);
    e.onKeyDown(65); step(.1); assert.equal(e.propPhase, 'return');
    e.onKeyUp(65); step(.6); assert.equal(e.propPhase, 'rest');
  }
  e.setPropConfig({ ...DEFAULT_PROP, enabled: false }); step(1);
  e.triggerIdleAction('wave'); e.idleAct.side = 1; step(.9); assert.equal(e.idleAct?.kind, 'wave');
  snapshot('scene-wave');
  step(.55); snapshot('scene-wave-high'); clearArms('raised wave');
  const wavePoints = Array.from({length: 12}, (_, i) => world('arm' + String(i + 3).padStart(2, '0') + 'L'));
  wavePoints.push(world('handL'));
  const waveLength = wavePoints.slice(1).reduce((sum, p, i) => sum + p.distanceTo(wavePoints[i]), 0);
  assert.ok(waveLength > .7, 'waving retains a visible forearm instead of compressing to a stub');
  step(.55); snapshot('scene-wave-swing');
  const before = world('gripLeft');
  e.onKeyDown(74); step(1 / 30);
  assert.equal(e.idleAct, null);
  assert.ok(before.distanceTo(world('gripLeft')) < .5, 'input blends from current wave pose');
  e.onKeyUp(74); step(.8);
  nearVector(actor.root.scale, scale); nearVector(actor.root.position, origin);
  const shoulderRest = world('clavicleL'), armRest = world('arm03L');
  e.triggerIdleAction('stretch');
  assert.equal(e.idleAct.dur, 3.8);
  let stretchTime = 0, lastHand = world('gripLeft');
  for (const age of [.25, .65, 1.2, 1.8, 2.6, 3.3, 4.3]) {
    while (stretchTime + 1e-6 < age) {
      const dt = Math.min(1 / 30, age - stretchTime); step(dt); stretchTime += dt;
      const hand = world('gripLeft');
      assert.ok(hand.distanceTo(lastHand) < .24, 'stretch hand stays continuous'); lastHand = hand;
    }
    if (age === 1.8) {
      assert.ok(world('clavicleL').distanceTo(shoulderRest) > .035, 'stretch moves the weighted clavicle');
      assert.ok(world('arm03L').y > armRest.y + .08, 'upper arm rises with shoulder');
    }
    clearArms('stretch ' + age);
    snapshot('scene-stretch-' + String(age).replace('.', '-'));
  }
  assert.equal(e.idleAct, null);
  e.triggerIdleAction('stretch'); step(1.5);
  const interruptedHand = world('gripLeft');
  e.onKeyDown(74); step(1 / 30);
  assert.equal(e.idleAct, null);
  assert.ok(world('gripLeft').distanceTo(interruptedHand) < .3, 'typing interrupts stretch without teleporting');
  e.onKeyUp(74); step(1.2);
  nearVector(actor.root.scale, scale); nearVector(actor.root.position, origin);
  for (const layout of ['65', '108']) {
    e.setKeyboardConfig(layout, 'cat');e.setTailKeyConfig('custom', ['enter']);
    e.onKeyDown(13); step(.3);
    const tip = actor.root.getObjectByName('NaiwaTongueTip');
    assert.ok(tip.visible, 'tail-key mapping now uses tongue');
    const top=desk.keyTopWorld('enter');top.y+=.045;
    assert.ok(tip.getWorldPosition(new Vector3()).distanceTo(top)<.02,'tongue tip contacts configured key');
    snapshot('scene-tongue-'+layout);
    e.onKeyUp(13);step(.8);assert.equal(tip.visible,false,'release retracts tongue');
  }
  e.setTailKeyConfig('off', []);
  e.triggerIdleAction('tongueKey', true);e.onMouseDown('left');e.onMouseUp('left');step(.22);
  assert.ok(actor.root.getObjectByName('NaiwaTongueTip').visible,'menu click does not cancel tongue demo');
  step(1);assert.equal(actor.root.getObjectByName('NaiwaTongueTip').visible,false,'demo retracts');
  e.triggerIdleAction('sniff');step(1.3);snapshot('scene-sniff');
  assert.ok(actor.root.getObjectByName('NaiwaNoseDrop').visible);
  step(.67);snapshot('scene-sniff-inhale');step(1.3);
  assert.equal(actor.root.getObjectByName('NaiwaNoseDrop').visible,false);
  e.triggerIdleAction('roll');e.idleAct.side=1;
  let previous=0;
  for(const age of [.65,1.3,2.0,2.4,2.8,3.7,4.3,4.9]) {
    step(age-previous);previous=age;snapshot('scene-roll-'+String(age).replace('.','-'));
    assert.equal(morph('CheekPuff.L'),0,'roll never inflates cheeks');
    if(age===2.4)assert.ok(morph('Frown')>.2,'tantrum face accompanies kicks');
    if(age===4.9)assert.ok(morph('Frown')<.02,'tantrum expression clears on recovery');
    const bounds=new Box3();actor.motionRoot.traverseVisible(o=>{if(o.isMesh)bounds.union(new Box3().setFromObject(o,true));});
    assert.ok(bounds.min.y>-.03,'articulated roll stays grounded at '+age+' ('+bounds.min.y+')');
  }
  e.triggerIdleAction('roll');step(2.2);e.onKeyDown(65);step(.3);snapshot('scene-roll-interrupt');
  e.onKeyUp(65);step(1.3);
  assert.equal(e.rollPose.tuck,0,'interrupted roll returns to sitting');
  assert.ok(actor.motionRoot.position.length()<1e-6);
  e.triggerIdleAction('nap'); step(3.5);
  assert.equal(e.asleep, true); assert.ok(morph('Drool') > .9);
  snapshot('scene-nap');
  e.onMouseDown('left'); step(.1); e.onMouseUp('left');
  assert.equal(e.asleep, false); assert.ok(e.sleepReaction.active(e.elapsed));
  e.triggerIdleAction('calm'); step(.8); assert.equal(e.sleepReaction.active(e.elapsed), false);
  assert.ok(morph('Drool') < .01);
});
