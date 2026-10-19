'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const espree = require('espree');
const root = path.resolve(__dirname, '..');

function surface() {
  const el = new EventEmitter();
  el.addEventListener = el.on.bind(el); el.removeEventListener = el.off.bind(el);
  el.value = ''; el.textContent = ''; el.innerHTML = ''; el.disabled = false;
  el.classList = { add() {}, remove() {} }; el.scrollIntoView = () => {};
  return el;
}
function adminFixture({ missing = false, request } = {}) {
  const nodes = new Map();
  if (!missing) for (const match of fs.readFileSync(path.join(root, 'admin.html'), 'utf8').matchAll(/id="([^"]+)"/g)) nodes.set(match[1], surface());
  const document = surface(), window = surface(), timers = new Map(), signals = [], requests = [];
  let next = 0;
  Object.assign(document, { getElementById: id => nodes.get(id) || null, hidden: false });
  const summary = { users: {}, playtime: {}, contract: {}, relayer: {}, scan: { status: 'idle' } };
  const options = { notice() {}, onUnauthorized() {}, csrf: () => '', request(route, settings) {
    requests.push(route); signals.push(settings.signal);
    if (request) return request(route, settings);
    return Promise.resolve(route.includes('/users?') ? { rows: [], total: 0 } : summary);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'admin-impact.js'), 'utf8'), {
    window, document, console, AbortController, Set, URL,
    setTimeout(fn) { const id = ++next; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); }
  });
  const listenerCount = () => [window, document, ...nodes.values()].reduce((n, target) => n + target.eventNames().reduce((k, name) => k + target.listenerCount(name), 0), 0);
  return { window, document, nodes, timers, signals, requests, options, listenerCount };
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('TXT 28: recreating an admin panel removes its old DOM/global listeners and requests', async () => {
  const f = adminFixture();
  let expected;
  for (let n = 0; n < 30; n++) {
    const panel = f.window.AdminImpactPanel.create(f.options);
    await panel.start();
    if (expected === undefined) expected = f.listenerCount();
    assert.equal(f.listenerCount(), expected);
    assert.equal(f.timers.size, 1);
    if (n === 29) { panel.destroy(); panel.destroy(); await panel.start(); }
  }
  assert.equal(f.listenerCount(), 0); assert.equal(f.timers.size, 0);
});

test('TXT 29: admin panel tolerates absent or later removed optional DOM controls', async () => {
  for (const missing of [true, false]) {
    const f = adminFixture({ missing });
    const panel = f.window.AdminImpactPanel.create(f.options);
    await panel.start();
    f.nodes.clear();
    await panel.refresh();
    panel.stop(); panel.destroy();
    assert.equal(f.window.listenerCount('pagehide'), 0);
    assert.equal(f.document.listenerCount('visibilitychange'), 0);
  }
});

test('admin destroy aborts in-flight work and stale responses cannot repaint the panel', async () => {
  const resolvers = [];
  const f = adminFixture({ request: () => new Promise(resolve => resolvers.push(resolve)) });
  const panel = f.window.AdminImpactPanel.create(f.options);
  const pending = panel.start();
  await flush(); panel.destroy();
  const html = f.nodes.get('impactKpis').innerHTML;
  assert.ok(f.signals.every(signal => signal.aborted));
  resolvers[0]({ users: { registered: 999 }, scan: { status: 'idle' } });
  resolvers[1]({ rows: [], total: 999 });
  await pending;
  assert.equal(f.nodes.get('impactKpis').innerHTML, html);
  assert.equal(f.timers.size, 0);
});

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['range', 'loc', 'tokens', 'comments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const appAst = espree.parse(appSource, { ecmaVersion: 'latest', range: true });
function findNode(predicate) { let found; walk(appAst, node => { if (predicate(node)) found = node; }); assert.ok(found); return found; }

test('TXT 31: resize reuses the measured viewport and retains render bounds and DPR', () => {
  const fn = findNode(n => n.type === 'FunctionDeclaration' && n.id.name === 'renderSize');
  let reads = 0;
  const context = { root: { innerWidth: 800, innerHeight: 600, devicePixelRatio: 2,
    gfViewportFix: { width() { reads++; return 400; }, height() { reads++; return 300; } } }, navigator: { userAgent: 'Desktop' } };
  vm.createContext(context); vm.runInContext(appSource.slice(...fn.range), context);
  assert.deepEqual({ ...context.renderSize({ w: 400, h: 300 }) }, { w: 800, h: 600 });
  assert.equal(reads, 0);
  assert.deepEqual({ ...context.renderSize() }, { w: 800, h: 600 }); assert.equal(reads, 2);
  assert.deepEqual({ ...context.renderSize({ w: Infinity, h: NaN }) }, { w: 1600, h: 1200 });
  const large = context.renderSize({ w: 100000, h: 100000 });
  assert.ok(large.w <= 8192 && large.h <= 8192);
});

test('legacy WeakMap fallback keeps object identities separate across prototype inheritance', () => {
  const fn = findNode(n => n.type === 'FunctionExpression' && n.id?.name === 'ensureWeakMap');
  const context = { root: {} }; vm.createContext(context);
  vm.runInContext('(' + appSource.slice(...fn.range) + ')()', context);
  const map = new context.root.WeakMap(), parent = {}, child = Object.create(parent);
  map.set(parent, 'parent'); assert.equal(map.get(parent), 'parent');
  assert.equal(map.has(child), false); assert.equal(map.get(child), undefined);
  assert.equal(map.get(0), undefined); assert.equal(map.delete(child), false);
  assert.equal(map.delete(parent), true); assert.equal(map.has(parent), false);
});

test('HUD observer teardown releases callbacks and frames across repeated mounts', () => {
  const window = surface(), document = surface(), observers = [], frames = new Map();
  let next = 0;
  Object.assign(document, { readyState: 'complete', body: {}, getElementById: () => null, querySelector: () => null });
  class Observer {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
    disconnect() { this.targets.clear(); }
  }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'gf-hud-ajuste.js'), 'utf8'), { window, document, MutationObserver: Observer,
    requestAnimationFrame(fn) { const id = ++next; frames.set(id, fn); return id; }, cancelAnimationFrame(id) { frames.delete(id); } });
  for (let n = 0; n < 30; n++) {
    window.GFHudAjuste.montar(); window.GFHudAjuste.montar(); window.emit('resize');
    assert.equal(window.listenerCount('resize'), 1); assert.equal(document.listenerCount('animationend'), 1);
    assert.equal(frames.size, 1);
    window.emit('pagehide', { persisted: true }); assert.equal(frames.size, 1);
    window.GFHudAjuste.destroy(); window.GFHudAjuste.destroy();
    assert.equal(frames.size, 0); assert.equal(window.eventNames().length, 0); assert.equal(document.eventNames().length, 0);
    assert.ok(observers.every(observer => observer.targets.size === 0));
  }
});

function fishingFixture() {
  const counters = [], tweens = [], objects = [], calls = [], pending = [];
  const context = { console: { log() {} }, document: {},
    setInterval() {}, setTimeout() {}, clearTimeout() {},
    GFMascota: { api: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) } };
  context.window = context;
  let source = fs.readFileSync(path.join(root, 'gf-pesca.js'), 'utf8');
  source = source.replace('window.GFPesca = {', 'window.__fishingAudit = { saltarPez, terminar, recoger, enganchar }; window.GFPesca = {');
  vm.runInNewContext(source, context);
  function image(x, y) {
    const object = { x, y, active: true, setScale() { return this; }, setDepth() { return this; }, setAlpha() { return this; }, setFlipX() { return this; },
      destroy() { calls.push('destroy'); this.active = false; } };
    objects.push(object); return object;
  }
  const scene = { add: { image }, player: { x: 100, y: 80 }, textures: { exists: () => true },
    tweens: { addCounter(config) { const tw = { config, remove() { this.removed = true; } }; counters.push(tw); return tw; },
      add(config) { tweens.push(config); return {}; }, killTweensOf() { calls.push('kill'); } },
    time: { delayedCall() { throw new Error('stale work scheduled'); } } };
  const st = { scene, runId: 1, efectos: [], fase: 'esperando', sesion: 'old' };
  return { context, scene, st, counters, tweens, objects, calls, pending, api: context.__fishingAudit };
}

test('fishing clears counter/target tweens before destroying its catch and ignores delayed completion', () => {
  const f = fishingFixture(); f.api.saltarPez(f.st, 'pes1');
  assert.equal(f.counters.length, 1);
  f.api.terminar(f.st);
  assert.ok(f.counters.every(tw => tw.removed)); assert.ok(f.objects.every(object => !object.active));
  for (let n = 0; n < f.calls.length; n += 2) assert.deepEqual(f.calls.slice(n, n + 2), ['kill', 'destroy']);
  const size = f.tweens.length;
  f.counters[0].config.onUpdate({ getValue: () => 0.5 }); f.counters[0].config.onComplete();
  assert.equal(f.tweens.length, size); assert.equal(f.st.contadores.size, 0);
});

test('old fishing network successes or failures cannot end the next cast', async () => {
  for (const action of ['recoger', 'enganchar']) for (const reject of [true, false]) {
    const f = fishingFixture(); f.api[action](f.st, true);
    f.api.terminar(f.st); f.st.sesion = 'next'; f.st.fase = 'esperando';
    if (reject) f.pending[0].reject(new Error('old network failure'));
    else f.pending[0].resolve({ ok: true, datos: { ok: true, itemId: 'pes1', especie: 'pes1' } });
    await flush();
    assert.equal(f.st.sesion, 'next'); assert.equal(f.st.fase, 'esperando'); assert.equal(f.objects.length, 0);
  }
});

test('fishing classifies each tileset image independently and releases failed readback canvases', () => {
  const f = fishingFixture(), canvases = [];
  f.context.document.createElement = () => {
    const canvas = { width: 0, height: 0, getContext: () => ({
      drawImage(image) { this.image = image; },
      getImageData() {
        if (this.image.fail) throw new Error('tainted canvas');
        const data = new Uint8ClampedArray(16 * 16 * 4);
        for (let n = 0; n < data.length; n += 4) { data[n + 2] = this.image.blue ? 255 : 0; data[n + 3] = 255; }
        return { data };
      }
    }) }; canvases.push(canvas); return canvas;
  };
  const classify = f.context.GFPesca._interno.clasificarTileset;
  const makeScene = image => ({ textures: { get: () => ({ getSourceImage: () => image }) } });
  const wet = makeScene({ width: 16, height: 16, blue: true }), dry = makeScene({ width: 16, height: 16 });
  assert.equal(classify(wet)[1], 2); assert.equal(classify(dry)[1], 0);
  assert.equal(classify(wet)[1], 2); assert.equal(canvases.length, 2);
  assert.equal(classify(makeScene({ width: 16, height: 16, fail: true })), null);
  assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
});
