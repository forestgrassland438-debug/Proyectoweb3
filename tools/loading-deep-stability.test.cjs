'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Emitter = require('eventemitter3');
const root = path.resolve(__dirname, '..');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function fixture() {
  let id = 0;
  const timers = new Map(), requests = [], tip = { textContent: '' };
  const window = new Emitter();
  window.addEventListener = window.on.bind(window);
  window.removeEventListener = window.off.bind(window);
  window.location = { hostname: 'localhost' };
  const context = vm.createContext({ window, document: { getElementById: key => key === 'gf-load-tip' ? tip : null },
    console: { log() {}, warn() {}, error() {} }, LoadingSystem: class {}, AbortController,
    Phaser: { Scene: class {}, Scenes: { SHUTDOWN: 8, DESTROYED: 9 } },
    setTimeout(fn) { const key = ++id; timers.set(key, fn); return key; },
    setInterval(fn) { const key = ++id; timers.set(key, fn); return key; },
    clearTimeout: key => timers.delete(key), clearInterval: key => timers.delete(key),
    fetch(url, options) { const d = deferred(); requests.push({ ...d, url, options }); return d.promise; }
  });
  for (const file of ['LoadingScenegame', 'LoadingSceneshop', 'GameScene', 'MinaScene', 'InteriorScene', 'SalvajeScene'])
    vm.runInContext(fs.readFileSync(path.join(root, 'Scenes', file + '.js'), 'utf8'), context, { filename: file });
  const sc = Object.create(window.LoadingScenegame.prototype);
  Object.assign(sc, { events: new Emitter(), sys: { settings: { status: 5 } }, loadx: async () => false,
    loadingSystem: { textElement: { textContent: '' }, hide() {}, update() {}, currentProgress: 0, easeOutCubic: x => x },
    autoRefreshEnabled: true, isAuthenticated: true, playerName: 'Alice', lastActivityTime: Date.now(), lastRefreshTime: 0,
    maxRefreshAttempts: 3, currentRefreshAttempts: 0, serverBase: '/local' });
  return { sc, window, context, timers, requests };
}

test('twenty loading restarts release both lifecycle listeners, tips and activity timers', async () => {
  const f = fixture();
  for (let i = 0; i < 20; i++) {
    await f.sc.create(); f.sc._arrancarConsejosDeCarga(); f.sc.setupActivityTracking();
    f.sc.events.emit(i % 2 ? 'destroy' : 'shutdown');
    assert.equal(f.sc.events.eventNames().length, 0);
    assert.equal(f.window.eventNames().length, 0);
    assert.equal(f.timers.size, 0);
  }
});

test('an older loading create cannot stop the new run timers', async () => {
  const f = fixture(), old = deferred(), current = deferred();
  f.sc.loadx = () => old.promise; const first = f.sc.create();
  f.sc.loadx = () => current.promise; const second = f.sc.create();
  f.sc._arrancarConsejosDeCarga(); f.sc.setupActivityTracking();
  const count = f.timers.size;
  old.resolve(false); await first;
  assert.equal(f.timers.size, count);
  current.resolve(false); await second;
  f.sc.events.emit('shutdown'); assert.equal(f.timers.size, 0);
});

test('stopping loading prevents a late refresh from replacing the shared CSRF token', async () => {
  const f = fixture(); await f.sc.create(); f.window.csrfToken = 'new-session';
  const p = f.sc.refreshAuthToken(); const body = deferred();
  f.requests[0].resolve({ ok: true, status: 200, json: () => body.promise }); await flush();
  f.sc.events.emit('shutdown');
  body.resolve({ csrfToken: 'obsolete' });
  assert.equal(await p, false); assert.equal(f.window.csrfToken, 'new-session');
  assert.equal(f.timers.size, 0);
});

test('a stopped automatic refresh cannot open an expired-session panel later', async () => {
  const f = fixture(), auth = deferred(); let errors = 0;
  f.sc.currentRefreshAttempts = 2; f.sc.refreshAuthToken = () => auth.promise;
  f.sc.checkAuthStatus = async () => false; f.sc.showTokenErrorHub = () => errors++;
  f.sc.startAutoRefresh(); const tick = [...f.timers.values()][0]; const p = tick();
  f.sc.stopAutoRefresh(); auth.resolve(false); await p;
  assert.equal(errors, 0); assert.equal(f.timers.size, 0);
});

test('map return exposes the save promise so callers can wait for durable state', async () => {
  const f = fixture(), save = deferred(), sc = Object.create(f.window.GameScene.prototype);
  sc.savegg = () => save.promise;
  const p = sc._dejarPartidaEnElMapa(2097, 2359);
  assert.equal(p, save.promise); assert.equal(sc.mundo, 1); assert.equal(sc._cambiandoEscena, true);
  save.resolve(true); assert.equal(await p, true);
});

test('shop loading releases paired listeners and ignores a rejection from an old run', async () => {
  const f = fixture(), pending = [], sc = Object.create(f.window.LoadingSceneshop.prototype);
  let starts = 0;
  Object.assign(sc, { events: new Emitter(), sys: { isActive: () => true },
    loadingSystem: { hide() {} }, scene: { start() { starts++; } },
    loadResources() { this._turnoCarga = (this._turnoCarga || 0) + 1;
      let reject; const promise = new Promise((_, r) => { reject = r; }); pending.push({ reject }); return promise; } });
  for (let i = 0; i < 20; i++) {
    sc.create(); sc.events.emit(i % 2 ? 'destroy' : 'shutdown');
    assert.equal(sc.events.eventNames().length, 0);
  }
  sc.create(); pending[0].reject(new Error('obsolete load')); await flush();
  assert.equal(starts, 0); sc.events.emit('shutdown');
  for (const p of pending.slice(1)) p.reject(new Error('cancelled')); await flush();
});

test('leaving loading cancels only the gate waiter and releases its scene callbacks', async () => {
  const f = fixture(); await f.sc.create();
  vm.runInContext(fs.readFileSync(path.join(root, 'tx-gate.js'), 'utf8'), f.context);
  const end = f.window.GFTxGate.begin('purchase');
  const p = f.sc._esperarTransaccionesPendientes();
  assert.equal(f.timers.size, 3);
  f.sc.events.emit('shutdown'); await p;
  assert.equal(f.timers.size, 1); assert.equal(f.window.GFTxGate.pending(), 1);
  end(); assert.equal(f.timers.size, 0);
});

test('late initial authentication cannot start refresh or change the new account', async () => {
  const f = fixture(), reply = deferred(); let opened = 0;
  delete f.sc.loadx; f.sc.getCSRFToken = async () => true;
  f.sc.fetchWithTokenRetry = () => reply.promise; f.sc.showTokenErrorHub = () => opened++;
  const p = f.sc.loadx(); await flush(); f.sc._turnoCreate = 10; f.sc.playerName = 'Bob';
  reply.resolve({ ok: true, json: async () => ({ authenticated: true, address: '0xOld', playerName: 'Alice' }) });
  assert.equal(await p, false); assert.equal(f.sc.playerName, 'Bob');
  assert.equal(f.timers.size, 0); assert.equal(opened, 0);
});

test('late initial CSRF and stat bodies cannot overwrite the new scene shared state', async () => {
  const f = fixture(); await f.sc.create(); f.window.csrfToken = 'new';
  const csrf = f.sc.getCSRFToken(), csrfBody = deferred();
  f.requests[0].resolve({ ok: true, json: () => csrfBody.promise }); await flush();
  f.sc.events.emit('shutdown'); csrfBody.resolve({ csrfToken: 'old' });
  assert.equal(await csrf, false); assert.equal(f.window.csrfToken, 'new'); assert.equal(f.timers.size, 0);
  f.sc.address = '0xAlice'; f.window.playerStats = { oro: 99 };
  const body = deferred(); f.sc.fetchWithTokenRetry = async () => ({ ok: true, json: () => body.promise });
  const stats = f.sc.syncStatsWithBlockchain(); await flush(); f.sc._turnoCreate++;
  body.resolve({ stats: { oro: 1, plata: 2 } }); await stats;
  assert.equal(f.window.playerStats.oro, 99);
});

test('an aborted loading request is never retried or delayed', async () => {
  const f = fixture(), controller = new AbortController(); controller.abort();
  f.window.getCsrfToken = () => 'token';
  await assert.rejects(f.sc.fetchWithTokenRetry('/local', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(f.requests.length, 0); assert.equal(f.timers.size, 0);
});

test('an unexpected loading failure settles create and releases its lifecycle resources', async () => {
  const f = fixture(); let message;
  f.sc.loadx = async () => { throw new Error('load failed'); };
  f.sc.loadingSystem.show = options => { message = options.message; };
  assert.equal(await f.sc.create(), false);
  assert.match(message, /Loading failed/); assert.equal(f.sc.events.eventNames().length, 0);
  assert.equal(f.timers.size, 0);
});

for (const name of ['MinaScene', 'InteriorScene', 'SalvajeScene']) {
  function returnScene(f, save) {
    const sc = Object.create(f.window[name].prototype), starts = [];
    Object.assign(sc, { _sceneRunId: 1, _sceneStopped: false, mundo: 3,
      posicionplayerx: 100, posicionplayery: 200, _casa: { puerta: { x: 50, y: 60 } },
      savegg: () => save, _ocultarHUD() {}, cleanupScene() {},
      scene: { start(...args) { starts.push(args); } } });
    return { sc, starts, leave: () => sc[name === 'SalvajeScene' ? '_volverAlPueblo' : '_volverAlMapa']() };
  }
  test(`${name}: map return waits for save and coalesces repeated exits`, async () => {
    const f = fixture(), saved = deferred(), r = returnScene(f, saved.promise);
    const p = r.leave(); await r.leave(); assert.equal(r.starts.length, 0);
    saved.resolve(true); await p; assert.equal(r.starts.length, 1); assert.equal(r.sc._salidaGuardando, null);
  });
  test(`${name}: failed save preserves the current world and allows a later exit`, async () => {
    const f = fixture(), r = returnScene(f, Promise.resolve(false)); await r.leave();
    assert.equal(r.starts.length, 0); assert.equal(r.sc.mundo, 3);
    assert.equal(r.sc.posicionplayerx, 100); assert.equal(r.sc.posicionplayery, 200);
    assert.equal(r.sc._cambiandoEscena, false); assert.equal(r.sc._salidaGuardando, null);
  });
  test(`${name}: a save from a previous scene entry cannot start a new transition`, async () => {
    const f = fixture(), saved = deferred(), r = returnScene(f, saved.promise), p = r.leave();
    r.sc._sceneRunId++; r.sc.mundo = 6; saved.resolve(true); await p;
    assert.equal(r.starts.length, 0); assert.equal(r.sc.mundo, 6);
  });
}
