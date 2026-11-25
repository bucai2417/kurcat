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
const { clipAngryEyelid, STRIKE_DURATION, setDesktopPetInsets } = await import('../src/petMotion.ts');
const { InputSounds, normalizeInputSound } = await import('../src/inputSounds.ts');
const { CatAudio } = await import('../src/audio.ts');
const { SettingsSync } = await import('../src/settingsSync.ts');
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
