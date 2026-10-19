'use strict';

// Deterministic regressions for lifecycle races; no network, wallet or GPU.
// Run: node --test bin/tools/engine-lifecycle.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const BIN = path.resolve(__dirname, '..');
const quiet = { log() {}, info() {}, warn() {}, error() {} };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

function surface() {
  const emitter = new EventEmitter();
  emitter.addEventListener = emitter.on.bind(emitter);
  emitter.removeEventListener = emitter.off.bind(emitter);
  return emitter;
}
function sandbox(extra = {}) {
  let nextId = 1;
  const timers = new Map();
  const context = surface();
  Object.assign(context, {
    console: quiet, AbortController, URL, Map, Set, WeakMap, WeakSet, Promise,
    setTimeout(fn) { const id = nextId++; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn) { const id = nextId++; timers.set(id, fn); return id; },
    clearInterval(id) { timers.delete(id); },
    navigator: { userAgent: 'test', hardwareConcurrency: 8, deviceMemory: 8 },
    performance: { now: () => 0 },
    ...extra
  });
  context.window = context;
  vm.createContext(context);
  context.timers = timers;
  return context;
}
function load(context, file, transform = s => s) {
  vm.runInContext(transform(readFileSync(path.join(BIN, file), 'utf8')), context, { filename: file });
}
const metadata = {
  tileSize: 16, width: 16, height: 16,
  lods: [{ name: 'hd' }, { name: 'low' }],
  tiles: [{ row: 0, col: 0, x: 0, y: 0, width: 16, height: 16,
    lods: { hd: { filename: 'tile.png' }, low: { filename: 'tile.png' } } }]
};
function tileFixture(bitmap = true) {
  const requests = [], decodes = [];
  const context = sandbox({ module: { exports: {} }, Phaser: { Loader: { LOADER_IDLE: 0, LOADER_COMPLETE: 4 } } });
  context.fetch = (url, options) => { const d = deferred(); requests.push({ ...d, url, options }); return d.promise; };
  if (bitmap) context.createImageBitmap = () => { const d = deferred(); decodes.push(d); return d.promise; };
  load(context, 'lib/tileManager.js');
  const textures = new Map();
  const loader = new EventEmitter();
  Object.assign(loader, {
    state: 0, list: { entries: [] }, start() {},
    image(key) { this.list.entries.push({ key, addToCache() { textures.set(key, {}); } }); }
  });
  const scene = {
    load: loader,
    textures: { exists: key => textures.has(key), addImage: (key, image) => textures.set(key, image), remove: key => textures.delete(key) },
    add: { image() { return { setOrigin() { return this; }, setDisplaySize() {}, setDepth() {}, destroy() {} }; } }
  };
  const manager = new context.module.exports(scene, metadata);
  manager.init();
  return { context, manager, requests, decodes, loader, textures, scene };
}
async function decodeRequest(fixture, index) {
  fixture.requests[index].resolve({ ok: true, blob: async () => ({}) });
  await flush();
}
function bitmap() { return { closed: 0, close() { this.closed++; } }; }

test('late bitmap after emergency cleanup cannot corrupt a new request with the same key', async () => {
  const f = tileFixture();
  f.manager.loadTile(0, 0);
  await decodeRequest(f, 0);
  f.manager.emergencyCleanup();
  assert.equal(f.requests[0].options.signal.aborted, true);
  f.manager.loadTile(0, 0);
  const stale = bitmap();
  f.decodes[0].resolve(stale);
  await flush();
  assert.equal(stale.closed, 1);
  assert.equal(f.manager.currentLoads, 1);
  assert.equal(f.manager.loading.has(f.manager.tileKey(0, 0)), true);
  assert.equal(f.manager._listos.length, 0);
  await decodeRequest(f, 1);
  const current = bitmap();
  f.decodes[1].resolve(current);
  await flush();
  f.manager.bombear();
  assert.equal(f.manager.loaded.size, 1);
  assert.equal(current.closed, 0, 'bitmap stays open for WebGL context restoration');
  f.manager.unloadTile(0, 0);
  assert.equal(current.closed, 1, 'owned bitmap closes when its texture is removed');
  assert.equal(f.manager.currentLoads, 0);
});

test('LOD switches close decoded tiles awaiting upload and rebuild the metadata index', async () => {
  const f = tileFixture();
  f.manager.loadTile(0, 0);
  await decodeRequest(f, 0);
  const old = bitmap();
  f.decodes[0].resolve(old);
  await flush();
  assert.equal(f.manager._listos.length, 1);
  f.manager.tilesByRC.orphan = {};
  f.manager.setLOD('low');
  assert.equal(old.closed, 1);
  assert.equal(f.manager._listos.length, 0);
  assert.equal(f.manager.tilesByRC.orphan, undefined);
  assert.equal(f.manager.currentLoads, 0);
});

test('destroy aborts fetch, detaches native loader callbacks and prevents abandoned texture caching', () => {
  const bitmapFixture = tileFixture();
  bitmapFixture.manager.loadTile(0, 0);
  bitmapFixture.manager.destroy();
  assert.equal(bitmapFixture.requests[0].options.signal.aborted, true);
  assert.equal(bitmapFixture.manager._pendingLoads.size, 0);
  const f = tileFixture(false);
  f.manager.loadTile(0, 0);
  const file = f.loader.list.entries[0];
  assert.equal(f.loader.listenerCount('filecomplete'), 1);
  f.manager.destroy();
  f.manager.destroy();
  assert.equal(f.loader.listenerCount('filecomplete'), 0);
  assert.equal(f.loader.listenerCount('loaderror'), 0);
  file.addToCache();
  assert.equal(f.textures.size, 0);
  f.loader.emit('filecomplete', file.key);
  assert.equal(f.manager.currentLoads, 0);
  f.manager.loadTile(0, 0);
  assert.equal(f.manager.loadQueue.length, 0);
});

test('cached textures borrowed from another owner survive manager destruction', () => {
  const f = tileFixture(false);
  const key = f.manager.tileKey(0, 0);
  f.textures.set(key, {});
  f.manager.loadTile(0, 0);
  f.manager.bombear();
  f.manager.destroy();
  assert.equal(f.textures.has(key), true);
});

test('tile asset paths reject encoded traversal and URL normalization bypasses', () => {
  const { manager } = tileFixture();
  for (const value of ['%2e%2e/secret', 'x/%2E%2E/secret', '%252e%252e/secret', ' https://evil.invalid', '//evil.invalid/a', 'x\\..\\secret', 'tile.png?x=1', '\t../secret']) {
    assert.equal(manager._sanitizePath(value), '', value);
  }
  assert.equal(manager._sanitizePath('world/tiles/a.png'), 'world/tiles/a.png');
});

test('memory cleanup preserves Phaser lifecycle hooks and destroys aliased resources once', () => {
  const context = sandbox();
  let gameDestroys = 0, perfDestroys = 0;
  const events = new EventEmitter();
  const disposer = () => {};
  events.on('destroy', disposer);
  const game = { events, scene: { sys: {} }, loop: { running: true }, destroy() {
    assert.equal(events.listenerCount('destroy'), 1);
    assert.ok(this.scene.sys);
    gameDestroys++;
  } };
  context.game = game;
  context.perf = { destroy() { perfDestroys++; } };
  context.phaserScaler = { game, destroy() { game.destroy(); } };
  load(context, 'memory-fix.js');
  context.emit('pagehide', { persisted: true });
  assert.equal(gameDestroys, 0);
  context.forceFullCleanup();
  context.forceFullCleanup();
  assert.equal(gameDestroys, 1);
  assert.equal(perfDestroys, 1);
  assert.equal(context.memfix.status().perfAlive, false);
  assert.equal(context.listenerCount('beforeunload'), 0);
});

test('memory cleanup wakes a sleeping Phaser loop so deferred destruction can complete', () => {
  const context = sandbox();
  let wakes = 0;
  context.game = { destroy() {}, loop: { running: false, wake() { wakes++; } } };
  load(context, 'memory-fix.js');
  context.forceFullCleanup();
  assert.equal(wakes, 1);
});

function scalerFixture(brave) {
  const element = () => Object.assign(surface(), {
    style: {}, clientWidth: 800, clientHeight: 600, children: [],
    setAttribute() {}, appendChild(child) { this.children.push(child); child.parentNode = this; },
    removeChild(child) { this.children = this.children.filter(c => c !== child); child.parentNode = null; }
  });
  const document = Object.assign(surface(), { body: element(), documentElement: element(), createElement: element, hidden: false });
  let destroys = 0;
  const context = sandbox({ document, screen: { width: 1920, height: 1080 }, innerWidth: 800, innerHeight: 600,
    Phaser: { AUTO: 0, CANVAS: 1, Scale: { NONE: 0 }, Game: class {
      constructor(config) { this.canvas = config.canvas; this.renderer = { gl: {} }; this.loop = { running: true, pause() {}, resume() {} }; }
      destroy() { destroys++; }
    } }
  });
  if (brave) context.navigator.brave = { isBrave: () => brave.promise };
  load(context, 'phaser-canvas-scaler.js');
  return { context, document, create: () => new context.PhaserCanvasScaler(), destroys: () => destroys };
}

test('CanvasScaler destroy before async initialization settles ready and never creates a game', async () => {
  const brave = deferred();
  const f = scalerFixture(brave);
  const scaler = f.create();
  scaler.destroy();
  const result = await scaler.ready;
  assert.equal(result.destroyed, true);
  brave.resolve(false);
  await flush();
  assert.equal(scaler.game, null);
  assert.equal(f.document.body.children.length, 0);
  assert.equal(f.context.timers.size, 0);
});

test('CanvasScaler releases timers, canvas listeners and DOM references on repeated destroy', async () => {
  const f = scalerFixture();
  const scaler = f.create();
  const ready = await scaler.ready;
  assert.equal(ready.game, scaler.game);
  assert.equal(scaler.isWebGL2, false);
  const canvas = scaler.canvas;
  scaler._onOrientationChange();
  scaler._onVisibilityChange();
  assert.ok(f.context.timers.size > 0);
  scaler.destroy();
  scaler.destroy();
  assert.equal(f.context.timers.size, 0);
  assert.equal(f.context.listenerCount('resize'), 0);
  assert.equal(f.document.listenerCount('visibilitychange'), 0);
  assert.equal(canvas.listenerCount('webglcontextlost'), 0);
  assert.equal(canvas.listenerCount('touchstart'), 0);
  assert.equal(scaler.container, null);
  assert.equal(scaler._lastBaseConfig, null);
  assert.equal(f.destroys(), 1);
});

test('EnhancedEventManager distinguishes object contexts, deduplicates and detaches old scenes', () => {
  const context = sandbox();
  load(context, 'phaser-rpg-perf.js');
  const oldScene = { events: new EventEmitter() }, nextScene = { events: new EventEmitter() };
  const manager = new context.PhaserRPGPerf.EnhancedEventManager(oldScene);
  const callback = () => {}, a = {}, b = {};
  manager.addListener('tick', callback, a);
  manager.addListener('tick', callback, a);
  manager.addListener('tick', callback, b);
  assert.equal(oldScene.events.listenerCount('tick'), 2);
  assert.equal(manager.getStats().totalListeners, 2);
  manager.setScene(nextScene);
  assert.equal(oldScene.events.listenerCount('tick'), 0);
  manager.addListener('tick', callback, a);
  manager.destroy();
  assert.equal(nextScene.events.listenerCount('tick'), 0);
  assert.equal(manager.scene, null);
});

test('performance helpers release scene listeners on shutdown and destroy with their game', () => {
  const context = sandbox();
  load(context, 'phaser-rpg-perf.js');
  const game = { events: new EventEmitter(), renderer: {} };
  const perf = context.PhaserRPGPerf.create(game);
  const scene = { events: new EventEmitter(), sys: { settings: { key: 'test' } } };
  perf.init(scene);
  assert.ok(scene.events.listenerCount('update') > 0);
  scene.events.emit('shutdown');
  assert.equal(scene.events.listenerCount('update'), 0);
  assert.equal(scene.events.listenerCount('destroy'), 0);
  assert.equal(perf.scene, null);
  perf.init(scene);
  context.emit('resize');
  assert.equal(context.timers.size, 1);
  game.events.emit('destroy');
  assert.equal(perf._destroyed, true);
  assert.equal(perf.game, null);
  assert.equal(perf.adaptivePerformance.game, null);
  assert.equal(context.timers.size, 0);
  assert.equal(context.listenerCount('resize'), 0);
  assert.equal(game.events.listenerCount('prestep'), 0);
  assert.equal(scene.events.listenerCount('update'), 0);
});

test('TileMonitor detaches only its own keyboard listeners and pending feedback on scene shutdown', () => {
  const context = sandbox();
  load(context, 'lib/tileMonitor.js', source => source.replace('export class TileMonitor', 'window.TileMonitor = class TileMonitor'));
  const keyboard = new EventEmitter(), events = new EventEmitter();
  let destroyed = 0;
  const display = { setScrollFactor() {}, setDepth() {}, setName() {}, setAlpha() {}, setColor() {}, destroy() { destroyed++; } };
  const scene = { events, input: { keyboard }, add: { text: () => display } };
  const unrelated = () => {};
  keyboard.on('keydown-F1', unrelated);
  const monitor = new context.TileMonitor({}, scene);
  monitor.toggleOptimization();
  events.emit('shutdown');
  monitor.destroy();
  assert.equal(keyboard.listenerCount('keydown-F1'), 1);
  assert.equal(keyboard.listeners('keydown-F1')[0], unrelated);
  assert.equal(keyboard.listenerCount('keydown-F2'), 0);
  assert.equal(events.listenerCount('destroy'), 0);
  assert.equal(context.timers.size, 0);
  assert.equal(monitor.scene, null);
  assert.equal(destroyed, 1);
});
