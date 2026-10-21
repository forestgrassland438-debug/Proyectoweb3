'use strict';
// Production modules, simulated sockets/clock/DOM. No database, wallet or network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function fixture(file) {
  let now = 100000, next = 0, active = null;
  const timers = new Map(), nodes = new Map(), document = new EventEmitter(), window = new EventEmitter();
  for (const target of [document, window]) {
    target.addEventListener = (name, fn) => target.on(name, fn);
    target.removeEventListener = (name, fn) => target.off(name, fn);
  }
  document.getElementById = id => nodes.get(id) || null;
  document.createElement = () => ({ style: {}, setAttribute() {}, appendChild(el) { nodes.set(el.id, el); } });
  nodes.set('quick-slots-bar', document.createElement());
  const clock = {
    setTimeout(fn, ms = 0) { const id = ++next; timers.set(id, { fn, at: now + ms }); return id; },
    setInterval(fn, ms) { const id = ++next; timers.set(id, { fn, at: now + ms, repeat: ms }); return id; },
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id)
  };
  window.game = { scene: { getScenes: () => active ? [active] : [] } };
  const c = vm.createContext({ window, document, console: { log() {}, warn() {} }, ...clock,
    Date: class extends Date { static now() { return now; } } });
  const load = () => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c, { filename: file });
  load();
  return { window, c, timers, nodes, load,
    activate(scene) { active = scene; window.activeScene = scene; },
    tick(ms) { const end = now + ms; for (let n = 0; n < 10000; n++) {
      const first = [...timers].filter(([, j]) => j.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!first) break; const [id, job] = first; now = job.at;
      if (job.repeat) job.at += job.repeat; else timers.delete(id); job.fn();
    } now = end; }
  };
}
function scene(name = 'Alice') {
  return { events: new EventEmitter(), STATE: {}, playerName: name, address: '0x' + (name === 'Alice' ? '1' : '2').repeat(40),
    player: {}, load: { progress: 0, isLoading: () => false }, sys: { isActive: () => true, settings: { key: 'GameScene' } } };
}
function overlay() { return { textElement: { textContent: '' }, hidden: 0, hide() { this.hidden++; } }; }

test('map loading releases both lifecycle hooks and timers over 100 completed/abandoned mounts', () => {
  const f = fixture('gf-carga-mapa.js'), api = f.window.GFCargaMapa, sc = scene();
  for (let i = 0; i < 100; i++) {
    api.retener(overlay()); api.montar(sc); api.listo(sc);
    if (i % 3) f.tick(1200); else sc.events.emit(i % 2 ? 'shutdown' : 'destroy');
    assert.equal(sc.events.eventNames().length, 0, 'mount ' + i);
    assert.equal(f.timers.size, 0); assert.equal(sc.__gfCarga, null); assert.equal(api.bloquea(sc), false);
  }
});
test('remounting map loading cannot let an old shutdown hook clear the new mount', () => {
  const f = fixture('gf-carga-mapa.js'), api = f.window.GFCargaMapa, sc = scene();
  api.retener(overlay()); for (let i = 0; i < 50; i++) api.montar(sc);
  assert.equal(sc.events.listenerCount('shutdown'), 1); assert.equal(sc.events.listenerCount('destroy'), 1);
  sc.events.emit('shutdown'); assert.equal(f.timers.size, 0); assert.equal(sc.events.eventNames().length, 0);
});
test('an old map cannot hide or update the overlay retained by the next transition', () => {
  const f = fixture('gf-carga-mapa.js'), api = f.window.GFCargaMapa, old = overlay(), current = overlay(), sc = scene();
  api.retener(old); api.montar(sc); api.listo(sc); api.retener(current, 'New transition'); f.tick(1200);
  assert.equal(current.hidden, 0); assert.equal(current.textElement.textContent, 'New transition');
  f.tick(45000); assert.equal(current.hidden, 1);
});
test('map preparation avoids writing unchanged progress to the DOM every frame', () => {
  const f = fixture('gf-carga-mapa.js'), api = f.window.GFCargaMapa, sc = scene(), sis = overlay(); let writes = 0, text = '';
  Object.defineProperty(sis.textElement, 'textContent', { get: () => text, set(value) { text = value; writes++; } });
  sc.load.isLoading = () => true; api.retener(sis); api.montar(sc);
  for (let i = 0; i < 200; i++) { sc.events.emit('update'); f.tick(5); }
  assert.ok(writes <= 3, 'DOM writes: ' + writes); sc.events.emit('shutdown');
});
test('chain queue is a singleton and releases an unavailable socket', () => {
  const f = fixture('gf-cola-cadena.js'), api = f.window.GFColaCadena, sock = new EventEmitter();
  f.window.globalSocket = sock; f.tick(1000); f.load(); assert.equal(f.window.GFColaCadena, api); assert.equal(f.timers.size, 1);
  assert.equal(sock.listenerCount('suelo:acunado'), 1); f.window.globalSocket = null; f.tick(1000);
  assert.equal(sock.eventNames().length, 0);
});
test('chain queue handles early replies once, including prototype-like ticket names', () => {
  const f = fixture('gf-cola-cadena.js'), api = f.window.GFColaCadena, sc = scene(); let applied = 0; f.activate(sc);
  assert.equal(Object.getPrototypeOf(api._interno.PEND), null);
  api._interno.resolver('suelo:acunado', { ticket: '__proto__' });
  api.esperar('__proto__', { alOk() { applied++; } }, sc);
  api._interno.resolver('suelo:acunado', { ticket: '__proto__' });
  api.esperar('__proto__', { alOk() { applied++; } }, sc);
  assert.equal(applied, 1); assert.equal(api.cuantas(), 0);
});
test('chain queue bounds unsolicited replies and their retained payloads', () => {
  const f = fixture('gf-cola-cadena.js'), api = f.window.GFColaCadena;
  for (let i = 0; i < 1500; i++) api._interno.resolver('suelo:acunado', { ticket: 'unknown-' + i });
  assert.ok(Object.keys(api._interno.HUERFANOS).length <= 256);
  f.tick(32000); assert.equal(Object.keys(api._interno.HUERFANOS).length, 0);
});
test('a response from the previous account cannot alter the new account inventory', () => {
  const f = fixture('gf-cola-cadena.js'), api = f.window.GFColaCadena, alice = scene(); let applied = 0, discarded = 0;
  f.activate(scene('Bob'));
  api.esperar('old-account', { alOk() { applied++; }, alCaducar(sc) { assert.equal(sc, null); discarded++; } }, alice);
  api._interno.resolver('suelo:acunado', { ticket: 'old-account' });
  assert.equal(applied, 0); assert.equal(discarded, 1); assert.equal(api.cuantas(), 0);
});
test('an acknowledgement during a scene transition waits for the same player next map', () => {
  const f = fixture('gf-cola-cadena.js'), api = f.window.GFColaCadena, old = scene(); let target = null;
  f.activate(old); api.esperar('map-change', { alOk(_d, sc) { target = sc; } }, old); f.activate(null);
  api._interno.resolver('botin:acunado', { ticket: 'map-change' }); assert.equal(target, null); assert.equal(api.cuantas(), 1);
  const current = scene(); f.activate(current); f.tick(1000); assert.equal(target, current); assert.equal(api.cuantas(), 0);
});
test('queue expiry accepts zero delay and page close clears timers, callbacks and listeners', async () => {
  const f = fixture('gf-cola-cadena.js'), api = f.window.GFColaCadena, sc = scene(), sock = new EventEmitter(); let expired = 0;
  sc._sincronizarInventarioConLaCadena = () => Promise.reject(new Error('offline'));
  f.activate(sc); f.window.globalSocket = sock;
  api.esperar('expire-now', { alCaducar() { expired++; } }, sc); api.caducarEn('expire-now', 0); f.tick(1000); await flush();
  assert.equal(expired, 1); assert.equal(api.cuantas(), 0);
  api.esperar('on-close', {}, sc); f.window.emit('pagehide', { persisted: true }); assert.equal(api.cuantas(), 1);
  f.window.emit('pagehide', { persisted: false }); assert.equal(api.cuantas(), 0); assert.equal(f.timers.size, 0); assert.equal(sock.eventNames().length, 0);
});

test('game session renewal resumes after signing in again on the same page', async () => {
  const f = fixture('gf-cola-cadena.js'); let refreshes = 0;
  f.c.URL = URL; f.c.Headers = Headers; f.c.location = { hostname: 'game.test', href: 'https://game.test/index.html' };
  f.window.GF_API_BASE = 'https://api.test'; f.window.fetch = async () => new Response('{}');
  f.window.PhaserRelay = { refreshSession: async () => { refreshes++; return { ok: true, json: async () => ({}) }; } };
  f.activate(scene()); vm.runInContext(fs.readFileSync(path.join(root, 'gf-session-api.js'), 'utf8'), f.c);
  await f.window.fetch('https://api.test/api/auth/logout'); await f.window.fetch('https://api.test/api/auth/login', { method: 'POST' });
  await f.window.GFSessionAPI.tick(); assert.equal(refreshes, 1); f.window.GFSessionAPI.destroy();
});
test('a delayed 401 from the previous login is never replayed under the next account', async () => {
  const f = fixture('gf-cola-cadena.js'); let finish, calls = 0, refreshes = 0;
  f.c.URL = URL; f.c.Headers = Headers; f.c.location = { hostname: 'game.test', href: 'https://game.test/index.html' };
  f.window.GF_API_BASE = 'https://api.test';
  f.window.fetch = async url => { calls++; return String(url).endsWith('/api/data') ? new Promise(resolve => { finish = resolve; }) : new Response('{}'); };
  f.window.PhaserRelay = { refreshSession: async () => { refreshes++; return { ok: true, json: async () => ({}) }; } };
  vm.runInContext(fs.readFileSync(path.join(root, 'gf-session-api.js'), 'utf8'), f.c);
  const old = f.window.fetch('https://api.test/api/data', { method: 'POST', body: '{"amount":1}' });
  await f.window.fetch('https://api.test/api/auth/login', { method: 'POST' }); finish(new Response('{}', { status: 401 }));
  await flush(); assert.equal(calls, 2); assert.equal(refreshes, 0); await old; f.window.GFSessionAPI.destroy();
});
