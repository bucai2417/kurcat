/**
 * Run with: node scripts/check-pet-motion.mjs (Node >=22.15).
 * Uses existing TypeScript/Three dependencies, emits no files and needs no browser.
 * Only Canvas/WebGL drawing is mocked: geometry, transforms and engine updates are real.
 * This checks motion behaviour, not the rendered appearance or native window integration.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
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
globalThis.Image = class { complete = false; };
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

const { Vector2, Vector3, Raycaster } = await import('three');
const { KuroCatEngine3D } = await import('../src/catEngine3d.ts');
const { KuroCatEngine } = await import('../src/catEngine.ts');
const { DEFAULT_PROP } = await import('../src/prop.ts');
const { DEFAULT_BUILTIN_CATS, resolveCustomSkin } = await import('../src/catSkins.ts');
const { clipAngryEyelid, STRIKE_DURATION } = await import('../src/petMotion.ts');

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
      const hitX = regionBefore.cx * window.innerWidth;
      const hitY = regionBefore.cy * window.innerHeight;
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
      near(regionAfter.cx * window.innerWidth - 276, hitX);
      near(regionAfter.cy * window.innerHeight - 200, hitY);
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
