'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function surface() {
  const object = new EventEmitter();
  object.addEventListener = function (type, fn, options) { options?.once ? this.once(type, fn) : this.on(type, fn); };
  object.removeEventListener = object.off.bind(object);
  return object;
}
function fixture(options = {}) {
  let now = 1000, next = 1;
  const timers = new Map(), games = [], starts = [], resizes = [], nodes = new Map();
  function element(tag) {
    const el = surface();
    Object.assign(el, { tagName: tag, style: {}, children: [], classList: { add() {}, remove() {} },
      appendChild(child) { this.children.push(child); child.parentNode = this; if (child.id) nodes.set(child.id, child); return child; },
      insertBefore(child) { return this.appendChild(child); },
      removeChild(child) { this.children = this.children.filter(c => c !== child); child.parentNode = null; },
      querySelector() { return this.children.find(c => c.tagName === 'canvas') || null; },
      remove() { this.parentNode?.removeChild(this); }, get firstChild() { return this.children[0] || null; }
    });
    return el;
  }
  const container = element('div'); container.id = 'container'; nodes.set('container', container);
  const document = surface();
  Object.assign(document, { readyState: 'complete', body: element('body'), head: element('head'), getElementById: id => nodes.get(id) || null, createElement: element, createTextNode: text => ({ textContent: text }) });
  const context = surface();
  class ClockDate extends Date { static now() { return now; } }
  class Game {
    constructor(config) {
      this.config = config; this.events = new EventEmitter(); this.isBooted = true; this.isRunning = false; this.pendingDestroy = false;
      this.canvas = element('canvas'); container.appendChild(this.canvas);
      this.loop = { actualFps: 60, running: true, hasFpsLimit: false, _limitRate: 0, raf: { callback() {} }, step() { return 'normal'; }, stepLimitFPS() { return 'limited'; }, wake() { this.running = true; } };
      this.registry = { set() {} }; this.renderer = { type: 1 }; this.scale = { resize: (w,h) => resizes.push([w,h]) };
      this.scene = { isBooted: false, keys: Object.create(null), active: [], add: (key, Class) => { this.scene.keys[key] = new Class(); }, start: key => { starts.push([this, key]); this.scene.active = [this.scene.keys[key]]; }, getScenes: () => this.scene.active };
      games.push(this); config.callbacks?.preBoot(this);
      if (options.failWebGL && games.length === 1) throw new Error('WebGL unavailable');
    }
    finishBoot() { this.isRunning = true; this.scene.isBooted = true; this.events.emit('ready'); }
    destroy() { this.pendingDestroy = true; }
    runDestroy() { this.destroyed = true; this.events.emit('destroy'); this.canvas.remove(); this.loop.running = false; }
  }
  const performanceApi = { create: game => ({ game, destroyed: 0, applyPixelPerfect() {}, enableHighPerformance() {}, destroy() { this.destroyed++; } }) };
  Object.assign(context, { document, console: { log() {}, warn() {}, error() {} }, navigator: { userAgent: 'Desktop', hardwareConcurrency: 8, deviceMemory: 8 }, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, Map, Set, WeakMap, WeakSet, Promise, Date: ClockDate,
    Phaser: { AUTO: 0, CANVAS: 1, WEBGL: 2, Scale: { NONE: 0, CENTER_BOTH: 1 }, Game }, PhaserRPGPerf: performanceApi,
    localStorage: { getItem() { return null; }, setItem() {} },
    setTimeout(fn, delay = 0) { const id = next++; timers.set(id, { fn, at: now + delay }); return id; }, clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(fn) { return this.setTimeout(fn, 16); }, cancelAnimationFrame(id) { timers.delete(id); }, ...options.globals
  });
  context.window = context;
  vm.createContext(context);
  const nativeAdd = context.addEventListener;
  vm.runInContext(source, context, { filename: 'app.js' });
  async function advance(ms) {
    const end = now + ms;
    await flush();
    for (let count = 0; count < 2000; count++) {
      let found = [...timers].filter(([,timer]) => timer.at <= end).sort((a,b) => a[1].at-b[1].at)[0];
      if (!found) break;
      now = found[1].at; timers.delete(found[0]); found[1].fn(); await flush();
      if (count === 1999) throw new Error('Unbounded timer loop');
    }
    now = end; await flush();
  }
  async function boot() { const pending = context.startGame(); await flush(); games.at(-1).finishBoot(); await advance(30); return pending; }
  return { context, games, starts, resizes, timers, container, advance, boot, nativeAdd, performanceApi };
}

test('concurrent/manual/automatic starts create one game and never restart an already advanced scene', async () => {
  const f = fixture(); const first = f.context.startGame(), second = f.context.startGame();
  await flush(); assert.equal(f.games.length, 1); f.games[0].finishBoot(); await f.advance(30);
  assert.equal((await first).game, (await second).game); assert.equal(f.starts.length, 1);
  f.games[0].scene.active = [{ sys: { settings: { key: 'GameScene' } } }];
  await f.advance(4000); await f.context.startGame();
  assert.equal(f.games.length, 1); assert.equal(f.starts.length, 1);
});

test('scene registration waits for the SceneManager, not merely Game.isBooted', async () => {
  const f = fixture(); const pending = f.context.startGame(); await f.advance(100);
  assert.equal(f.games[0].isBooted, true); assert.equal(f.starts.length, 0);
  f.games[0].finishBoot(); await f.advance(30); assert.ok(await pending); assert.equal(f.starts.length, 1);
});

test('destroy releases app listeners/timers/global aliases and supports a clean restart', async () => {
  const f = fixture(); const first = await f.boot(); await f.advance(1200);
  let otherCleanup = 0; first.game.events.on('destroy', () => otherCleanup++);
  assert.equal(f.context.addEventListener, f.nativeAdd);
  first.game.runDestroy();
  assert.equal(otherCleanup, 1); assert.equal(f.context.game, null); assert.equal(f.context.GFBateria, null);
  assert.equal(f.context.listenerCount('resize'), 0); assert.equal(f.context.listenerCount('orientationchange'), 0);
  assert.equal(f.container.listenerCount('touchmove'), 0); assert.equal(f.timers.size, 0);
  const next = await f.boot(); assert.notEqual(next.game, first.game); assert.equal(f.starts.length, 2);
  next.game.runDestroy(); assert.equal(f.timers.size, 0);
});

test('destruction during optional perf wait settles boot and never revives delayed work', async () => {
  const f = fixture({ globals: { PhaserRPGPerf: undefined } }); const pending = f.context.startGame();
  await flush(); f.games[0].finishBoot(); await f.advance(50); f.games[0].runDestroy();
  await flush(); assert.equal(await pending, null); await f.advance(6000);
  assert.equal(f.starts.length, 0); assert.equal(f.timers.size, 0);
});

test('hung boot has a finite deadline and releases its partial game', async () => {
  const f = fixture(); const pending = f.context.startGame(); await f.advance(10100);
  assert.equal(await pending, null); assert.equal(f.games[0].destroyed, true); assert.equal(f.context.game, null); assert.equal(f.timers.size, 0);
});

test('a final resize inside the throttle interval is still applied', async () => {
  const f = fixture(); await f.boot(); await f.advance(1200);
  f.context.innerWidth = 900; f.context.emit('resize'); await f.advance(20);
  f.context.innerWidth = 950; f.context.emit('resize'); await f.advance(120);
  assert.equal(f.resizes.at(-1)[0], 950); f.games[0].runDestroy();
});

test('battery switching updates the running TimeStep callback and expires on destruction', async () => {
  const f = fixture(); await f.boot(); const api = f.context.GFBateria;
  assert.equal(api.activar(), true); assert.equal(f.games[0].loop.raf.callback(), 'limited');
  assert.equal(api.desactivar(), true); assert.equal(f.games[0].loop.raf.callback(), 'normal');
  f.games[0].runDestroy(); assert.equal(api.activar(), false); assert.equal(api.fps(), null);
});

test('scene registry rejects prototype names and does not mistake inherited scene keys for registrations', async () => {
  const registry = new Map([['__proto__', class {}], ['constructor', class {}], ['prototype', class {}], ['Bad<name>', class {}]]);
  const f = fixture({ globals: { __secureSceneRegistry: registry } }); await f.boot();
  assert.deepEqual(Object.keys(f.games[0].scene.keys), ['LoadingScenegame']); f.games[0].runDestroy();
});

test('renderer size rejects invalid inputs and applies mobile DPR cap at initial allocation', async () => {
  const f = fixture({ globals: { devicePixelRatio: 3, GF_MAX_DPR: Infinity, navigator: { userAgent: 'Android' }, innerWidth: 400, innerHeight: 800 } });
  await f.boot(); assert.equal(f.games[0].config.width, 800); assert.equal(f.games[0].config.height, 1600); f.games[0].runDestroy();
  const invalid = fixture({ globals: { devicePixelRatio: Infinity, GF_MAX_DPR: 'bad', innerWidth: NaN, innerHeight: -5 } });
  await invalid.boot(); assert.equal(invalid.games[0].config.width, 800); assert.equal(invalid.games[0].config.height, 600); invalid.games[0].runDestroy();
});

test('cancelled navigation and BFCache do not tear down a running game; permanent pagehide does', async () => {
  const f = fixture(); await f.boot(); f.context.emit('beforeunload', {}); f.context.emit('pagehide', { persisted: true });
  assert.equal(f.games[0].pendingDestroy, false); assert.ok(f.context.game);
  f.context.emit('pagehide', { persisted: false }); assert.equal(f.games[0].pendingDestroy, true); assert.equal(f.context.game, null); assert.equal(f.timers.size, 0);
  assert.equal(await f.context.startGame(), null);
});

test('a failed WebGL constructor releases its captured partial instance before Canvas fallback', async () => {
  const f = fixture({ failWebGL: true }); await f.boot();
  assert.equal(f.games.length, 2); assert.equal(f.games[0].destroyed, true); assert.equal(f.games[1].config.type, 1);
  assert.equal(f.container.children.filter(c => c.tagName === 'canvas').length, 1); f.games[1].runDestroy();
});

// Supply a real, well-formed entry scene to each independent VM.
const baseFixture = fixture;
fixture = function (options = {}) {
  return baseFixture({ ...options, globals: { LoadingScenegame: class { constructor() { this.sys = { settings: { key: 'LoadingScenegame' } }; } }, ...options.globals } });
};
